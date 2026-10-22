<?php
/**
 * messenger_aurora.php — Aurora no atendimento do WhatsApp (16/10/2026, etapa 1).
 *
 * Carregado pelo messenger_nucleo.php (não é endereço público). Usa a mesma chave da Aurora (openai_api_key no
 * pai-chaves.php) e a Base de Conhecimento dela (tabelas aurora_kb_*), só nos departamentos liberados para clientes.
 *
 * O que faz, enquanto o cliente está na fila (quando um atendente assume, ela para):
 *  - entende texto e áudio (transcreve) no lugar do menu e encaminha ao setor certo;
 *  - falecimento: acolhe com condolências, já pede os dados principais e passa NA HORA ao setor, com prioridade;
 *  - responde dúvidas só com a Base de Conhecimento liberada (nunca inventa valores/coberturas);
 *  - pedido de atendente: passa na hora; não entendeu ou passou do limite de respostas: passa para a fila;
 *  - registra uma nota interna com o assunto, os dados coletados e o resumo, e marca as etiquetas da empresa
 *    (pelo "Quando usar" de cada uma).
 * Liga e desliga em Configurações › Mensagens automáticas › Aurora no atendimento.
 */

const IA_RESPONSES = 'https://api.openai.com/v1/responses';
const IA_TRANSCRICAO = 'https://api.openai.com/v1/audio/transcriptions';

function msgIaAtiva(PDO $pdo): bool
{
    return (msgConfigTela($pdo, 'ia_ativa', '0') === '1' || msgEmTeste()) && trim((string) msgConfig('openai_api_key', '')) !== '';
}

function msgIaModelo(PDO $pdo): string
{
    $m = trim((string) msgConfigTela($pdo, 'ia_modelo', ''));
    return $m !== '' ? $m : (string) msgConfig('openai_model_fast', 'gpt-6-luna');
}

/** Chamada ao modelo com saída em JSON (formato fixo). Retorna o objeto ou null. */
function msgIaJson(PDO $pdo, string $instrucoes, string $entrada, array $esquema, int $maxTokens = 900): ?array
{
    $corpo = [
        'model' => msgIaModelo($pdo),
        'instructions' => $instrucoes,
        'input' => $entrada,
        'max_output_tokens' => max(4000, $maxTokens), // o raciocínio do modelo conta aqui: pouco espaço cortava o JSON e a Aurora "ficava indisponível"
        'text' => ['format' => ['type' => 'json_schema', 'name' => 'triagem', 'strict' => true, 'schema' => $esquema]],
    ];
    $r = msgHttp('POST', IA_RESPONSES, ['Content-Type: application/json', 'Authorization: Bearer ' . msgConfig('openai_api_key', '')], json_encode($corpo, JSON_UNESCAPED_UNICODE), 45);
    $j = json_decode((string) ($r['corpo'] ?? ''), true);
    if ((int) ($r['status'] ?? 0) !== 200 || !is_array($j)) {
        error_log('[messenger] Aurora: modelo respondeu HTTP ' . ($r['status'] ?? 0) . ' ' . mb_substr((string) ($r['corpo'] ?? ''), 0, 300));
        return null;
    }
    $texto = (string) ($j['output_text'] ?? '');
    if ($texto === '') {
        foreach ((array) ($j['output'] ?? []) as $o) {
            foreach ((array) ($o['content'] ?? []) as $c) {
                if (($c['type'] ?? '') === 'output_text') {
                    $texto .= (string) ($c['text'] ?? '');
                }
            }
        }
    }
    $saida = json_decode($texto, true);
    if (!is_array($saida)) {
        error_log('[messenger] Aurora: resposta fora do formato (status ' . ($j['status'] ?? '?') . ', motivo ' . ($j['incomplete_details']['reason'] ?? '-') . ')');
    }
    return is_array($saida) ? $saida : null;
}

/** Transcreve o áudio do cliente (guarda na mensagem, para a equipe ler). */
function msgIaTranscrever(PDO $pdo, int $mensagemId): string
{
    $st = $pdo->prepare('SELECT chave_r2, mime FROM chat_anexos WHERE mensagem_id = :m LIMIT 1');
    $st->execute([':m' => $mensagemId]);
    $a = $st->fetch();
    if (!$a || !msgR2Configurado()) {
        return '';
    }
    $r = msgHttp('GET', msgR2LinkAssinado('GET', (string) $a['chave_r2'], 300), [], null, 30);
    $bytes = (string) ($r['corpo'] ?? '');
    if ((int) ($r['status'] ?? 0) !== 200 || $bytes === '') {
        return '';
    }
    $limite = '----pai' . bin2hex(random_bytes(8));
    $ext = str_contains((string) $a['mime'], 'mpeg') ? 'mp3' : (str_contains((string) $a['mime'], 'mp4') ? 'm4a' : 'ogg');
    $campos = ['model' => (string) msgConfig('openai_transcribe_model', 'gpt-4o-mini-transcribe'), 'language' => 'pt', 'response_format' => 'json'];
    $corpo = '';
    foreach ($campos as $k => $v) {
        $corpo .= "--{$limite}\r\nContent-Disposition: form-data; name=\"{$k}\"\r\n\r\n{$v}\r\n";
    }
    $corpo .= "--{$limite}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.{$ext}\"\r\nContent-Type: {$a['mime']}\r\n\r\n{$bytes}\r\n--{$limite}--\r\n";
    $t = msgHttp('POST', IA_TRANSCRICAO, ['Content-Type: multipart/form-data; boundary=' . $limite, 'Authorization: Bearer ' . msgConfig('openai_api_key', '')], $corpo, 60);
    $j = json_decode((string) ($t['corpo'] ?? ''), true);
    $texto = trim((string) ($j['text'] ?? ''));
    if ($texto !== '') {
        $pdo->prepare('UPDATE chat_mensagens SET transcricao = :t WHERE id = :id')->execute([':t' => mb_substr($texto, 0, 4000), ':id' => $mensagemId]);
    } else {
        error_log('[messenger] Aurora: transcrição falhou (HTTP ' . ($t['status'] ?? 0) . ')');
    }
    return $texto;
}

/** Trechos da Base de Conhecimento (só departamentos liberados para clientes) ligados à pergunta. */
function msgIaBase(PDO $pdo, string $pergunta): string
{
    $deps = array_values(array_filter(array_map('intval', explode(',', (string) msgConfigTela($pdo, 'ia_kb_departamentos', '')))));
    if (!$deps || msgConfigTela($pdo, 'ia_responder', '1') !== '1') {
        return '';
    }
    $palavras = array_values(array_unique(array_filter(
        preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($pergunta)) ?: [],
        fn($w) => mb_strlen($w) >= 4 && !in_array($w, ['para', 'como', 'qual', 'quais', 'quero', 'gostaria', 'saber', 'sobre', 'tenho', 'minha', 'meu', 'esse', 'essa', 'isso', 'favor', 'pode', 'vocês', 'voces'], true)
    )));
    $palavras = array_slice($palavras, 0, 8);
    try {
        $marc = implode(',', $deps);
        $ondes = $palavras ? ' AND (' . implode(' OR ', array_map(fn($i) => "t.conteudo LIKE :pc{$i} OR d.titulo LIKE :pt{$i}", array_keys($palavras))) . ')' : '';
        $st = $pdo->prepare("SELECT d.titulo, t.conteudo FROM aurora_kb_trechos t INNER JOIN aurora_kb_documentos d ON d.id = t.documento_id
                              WHERE d.status = 'ATIVO' AND COALESCE(t.ativo, 1) = 1 AND d.departamento_id IN ({$marc}){$ondes} ORDER BY d.id DESC, t.ordem ASC LIMIT 60");
        $par = [];
        foreach ($palavras as $i => $w) {
            // cada marcador uma vez só: com prepares nativos (EMULATE_PREPARES = false) o MySQL recusa repetir o mesmo nome
            $par[":pc{$i}"] = '%' . $w . '%';
            $par[":pt{$i}"] = '%' . $w . '%';
        }
        $st->execute($par);
        $linhas = $st->fetchAll();
    } catch (PDOException $e) {
        error_log('[messenger] Aurora: base de conhecimento indisponível: ' . $e->getMessage());
        return '';
    }
    // ordena pelos trechos com mais palavras da pergunta
    usort($linhas, function ($a, $b) use ($palavras) {
        $n = fn($t) => array_sum(array_map(fn($w) => substr_count(mb_strtolower($t['titulo'] . ' ' . $t['conteudo']), $w), $palavras));
        return $n($b) <=> $n($a);
    });
    $saida = '';
    foreach (array_slice($linhas, 0, 6) as $l) {
        $saida .= "### {$l['titulo']}\n" . mb_substr(trim((string) $l['conteudo']), 0, 1400) . "\n\n";
    }
    return mb_substr($saida, 0, 7000);
}

/** Últimas mensagens do atendimento, como conversa (texto ou transcrição). */
function msgIaHistorico(PDO $pdo, int $conversaId, ?int $atendimentoId): string
{
    $st = $pdo->prepare("SELECT autor_tipo, tipo, texto, transcricao, interna FROM chat_mensagens
                          WHERE conversa_id = :c AND (:a IS NULL OR atendimento_id = :a2) AND apagada_em IS NULL AND tipo <> 'sistema' AND interna = 0
                          ORDER BY id DESC LIMIT 14");
    $st->execute([':c' => $conversaId, ':a' => $atendimentoId, ':a2' => $atendimentoId]);
    $linhas = array_reverse($st->fetchAll());
    $saida = '';
    foreach ($linhas as $m) {
        $quem = $m['autor_tipo'] === 'contato' ? 'Cliente' : 'PAI';
        $conteudo = trim((string) ($m['transcricao'] ?: $m['texto']));
        if ($conteudo === '') {
            $conteudo = '[' . ($m['tipo'] === 'imagem' ? 'foto' : ($m['tipo'] === 'audio' ? 'áudio' : 'arquivo')) . ']';
        } elseif ($m['transcricao']) {
            $conteudo = '(áudio) ' . $conteudo;
        }
        $saida .= "{$quem}: " . mb_substr($conteudo, 0, 800) . "\n";
    }
    return $saida;
}

function msgIaEsquema(): array
{
    $texto = ['type' => 'string'];
    return [
        'type' => 'object', 'additionalProperties' => false,
        'required' => ['intencao', 'setor_id', 'confianca', 'transferir', 'mensagem_cliente', 'dados', 'faltando', 'etiquetas', 'resumo', 'assunto', 'respondido_pela_base', 'cobranca', 'confirmacao', 'coroa', 'venda', 'funeral'],
        'properties' => [
            'intencao' => ['type' => 'string', 'enum' => ['obito', 'informacao_velorio', 'pagamento', 'comprovante', 'plano_novo', 'associado', 'fornecedor', 'parceria', 'coroa', 'trabalho', 'reclamacao', 'cancelamento', 'falar_atendente', 'duvida', 'saudacao', 'outro']],
            'setor_id' => ['type' => 'integer', 'description' => 'id do setor da lista; 0 se não houver um claro'],
            'confianca' => ['type' => 'number'],
            'transferir' => ['type' => 'boolean', 'description' => 'true = passar agora para o setor (ou fila geral)'],
            'mensagem_cliente' => ['type' => 'string', 'description' => 'o que enviar ao cliente agora; vazio = não enviar nada'],
            'dados' => [
                'type' => 'object', 'additionalProperties' => false,
                'required' => ['nome_cliente', 'falecido_nome', 'local', 'contrato', 'tipo_atendimento', 'outros'],
                'properties' => [
                    'nome_cliente' => $texto, 'falecido_nome' => $texto, 'local' => $texto, 'contrato' => $texto,
                    'tipo_atendimento' => ['type' => 'string', 'enum' => ['associado', 'particular', 'nao_informado']],
                    'outros' => $texto,
                ],
            ],
            'faltando' => ['type' => 'array', 'items' => $texto],
            'etiquetas' => ['type' => 'array', 'items' => $texto, 'description' => 'nomes exatos de etiquetas da lista que se aplicam'],
            'resumo' => ['type' => 'string', 'description' => 'resumo curto para a equipe (1 a 3 frases)'],
            'assunto' => ['type' => 'string', 'description' => 'assunto da pergunta do cliente em 2 a 6 palavras, sem nomes nem números pessoais (ex.: "valor do plano FLEX", "segunda via do boleto")'],
            'respondido_pela_base' => ['type' => 'boolean', 'description' => 'true se a resposta veio da BASE DE CONHECIMENTO'],
            'cobranca' => [
                'type' => 'object', 'additionalProperties' => false, 'required' => ['acao'],
                'properties' => ['acao' => ['type' => 'string', 'enum' => ['', 'link', 'pix'], 'description' => 'link = Pix/cartão; pix = Pix copia e cola; só depois que o cliente confirmar']],
            ],
            'confirmacao' => [
                'type' => 'object', 'additionalProperties' => false,
                'required' => ['contrato', 'nascimento', 'cpf_final', 'fone_final'],
                'description' => 'confirmação do contrato de quem ainda não está identificado (só com a seção CONFIRMAÇÃO DO CONTRATO); vazio = ainda não informou',
                'properties' => [
                    'contrato' => ['type' => 'string', 'description' => 'número do contrato que o cliente informou, só os dígitos'],
                    'nascimento' => ['type' => 'string', 'description' => 'data de nascimento do titular informada, no formato AAAA-MM-DD'],
                    'cpf_final' => ['type' => 'string', 'description' => 'os 3 últimos dígitos do CPF do titular, se informados'],
                    'fone_final' => ['type' => 'string', 'description' => 'os 4 últimos dígitos do telefone do cadastro, se informados'],
                ],
            ],
            'coroa' => [
                'type' => 'object', 'additionalProperties' => false,
                'required' => ['modelo_id', 'frase', 'velorio_id', 'local', 'solicitante', 'confirmar'],
                'properties' => [
                    'modelo_id' => ['type' => 'integer', 'description' => 'id do modelo da lista de coroas (0 = ainda não escolheu)'],
                    'frase' => ['type' => 'string', 'description' => 'frase da faixa, exatamente como o cliente quer'],
                    'velorio_id' => ['type' => 'integer', 'description' => 'id do velório da lista (0 = não está na lista)'],
                    'local' => ['type' => 'string', 'description' => 'local de entrega quando o velório não está na lista'],
                    'solicitante' => ['type' => 'string', 'description' => 'nome de quem está enviando a coroa'],
                    'confirmar' => ['type' => 'boolean', 'description' => 'true só quando o cliente confirmou o resumo do pedido'],
                ],
            ],
            'venda' => [
                'type' => 'object', 'additionalProperties' => false,
                'required' => ['plano', 'pessoas', 'extras', 'idade_mais_velho', 'aditivo_tanato', 'aditivo_translado', 'nomes', 'decidiu'],
                'properties' => [
                    'plano' => ['type' => 'string', 'enum' => ['LIGHT', 'FLEX', 'PLUS', 'MAX', '']],
                    'pessoas' => ['type' => 'integer', 'description' => 'total de pessoas no plano, contando o titular (0 = não sabe)'],
                    'extras' => ['type' => 'integer', 'description' => 'pessoas fora do grupo básico. Grupo básico = titular, cônjuge, filhos solteiros e até 2 entre pai, mãe, sogro e sogra. Extra = o 3º ou 4º entre pais e sogros e qualquer outro parente (no FLEX use 0)'],
                    'idade_mais_velho' => ['type' => 'integer', 'description' => 'idade da pessoa mais velha (0 = não sabe)'],
                    'aditivo_tanato' => ['type' => 'boolean'], 'aditivo_translado' => ['type' => 'boolean'],
                    'nomes' => ['type' => 'array', 'items' => $texto, 'description' => 'nomes que a pessoa já disse (titular primeiro)'],
                    'decidiu' => ['type' => 'boolean', 'description' => 'true quando a pessoa confirmou que quer contratar o plano escolhido'],
                ],
            ],
            'funeral' => [
                'type' => 'object', 'additionalProperties' => false,
                'required' => ['urna_id', 'tanatopraxia', 'sala', 'translado_km', 'translado_destino', 'roupa_propria', 'coroa', 'pronto'],
                'properties' => [
                    'urna_id' => ['type' => 'integer', 'description' => 'id da urna escolhida (0 = ainda não escolheu)'],
                    'tanatopraxia' => ['type' => 'string', 'enum' => ['sim', 'nao', '']],
                    'sala' => ['type' => 'string', 'description' => 'sala do Memorial escolhida (vazio = ainda não ou outro local)'],
                    'translado_km' => ['type' => 'number', 'description' => 'km de translado para outra cidade (0 = sem translado)'],
                    'translado_destino' => $texto,
                    'roupa_propria' => ['type' => 'string', 'enum' => ['sim', 'nao', '']],
                    'coroa' => ['type' => 'string', 'enum' => ['sim', 'nao', '']],
                    'pronto' => ['type' => 'boolean', 'description' => 'true quando urna, local do velório, tanatopraxia e translado já foram definidos'],
                ],
            ],
        ],
    ];
}

/** Instruções da Aurora para o atendimento de clientes (tom de acordo com a necessidade). */
function msgIaInstrucoes(PDO $pdo, array $setores, array $etiquetas, string $vinculo, string $base, bool $coleta, string $funeral = '', string $velorios = ''): string
{
    $listaSetores = implode("\n", array_map(fn($s) => "- id {$s['id']}: {$s['nome']}" . ($s['descricao_ia'] ? " — {$s['descricao_ia']}" : '') . ($s['aberto'] ? '' : ' (fechado agora: ' . $s['situacao'] . ')'), $setores));
    $listaEtiquetas = implode("\n", array_map(fn($e) => "- {$e['nome']}" . ($e['quando_usar'] ? " — {$e['quando_usar']}" : ''), $etiquetas));
    $extra = trim((string) msgConfigTela($pdo, 'ia_instrucoes', ''));
    $lim = msgIaLimites($pdo);
    $limite = $lim['geral'];
    $txtLim = fn($n) => $n > 0 ? "no máximo {$n} respostas" : 'sem limite de respostas';
    $regraSaudacao = msgConfigTela($pdo, 'ia_saudacao', '1') === '1'
        ? 'Apresente-se de forma calorosa e receptiva, como Aurora, a assistente virtual do Plano PAI: responda ao cumprimento (bom dia, boa tarde ou boa noite, conforme a pessoa) e pergunte com gentileza como pode ajudar, sem listar opções nem menu. Varie as palavras; no máximo 2 frases.'
        : 'mensagem_cliente vazia (o sistema mostra o menu).';
    return <<<TXT
Você é a Aurora, assistente virtual do Plano PAI (Plano Assistencial Integrado), funerária e plano funerário de Barreiras-BA, atendendo pelo WhatsApp.
Muitos clientes têm pouca leitura: escreva frases curtas e simples, sem termos técnicos, no máximo 3 frases (salvo ao responder uma dúvida da base ou mostrar opções). Trate por "você". Use *negrito* do WhatsApp com moderação. Nunca diga que é humana; se perguntarem, diga que é a assistente virtual do PAI.
Seja solícita e atenciosa: ofereça ajuda antes de despejar informação, pergunte o que a pessoa prefere e conduza com gentileza. Não repita a mesma frase ou a mesma ideia em mensagens seguidas (releia a CONVERSA ATÉ AGORA antes de responder).
NÃO REPITA: antes de responder, releia o que VOCÊ já disse. Não repita orientações, avisos ("o atendente já foi avisado"), empatia ("entendo sua insatisfação") nem dados já anotados. Responda só ao que a pessoa perguntou agora, com algo novo e útil.
AO PASSAR PARA UMA PESSOA: diga, em frases curtas, que a resposta vem aqui mesmo nesta conversa e que a pessoa não precisa repetir nada (diga isso UMA vez só no atendimento). Se a pessoa fez uma pergunta junto (documentos, pagamento, prazo), responda o que a BASE permitir antes de passar.
QUANTO TEMPO DEMORA: se perguntarem quanto tempo a equipe leva para responder, não invente prazo e não dê explicação sobre o funcionamento da equipe ("depende da demanda"); acolha a pessoa e diga que o pedido já está com a equipe e que a resposta vem aqui mesmo.
RECLAMAÇÃO: peça desculpas uma vez, de forma curta e sincera ("Sinto muito pelo que aconteceu ontem."), sem discutir, e passe para uma pessoa.
FORMATO PARA O CELULAR: parágrafos curtos separados por uma linha em branco; listas com UM item por linha (ex.: "• Coroa Natural Média — R$ 350,00"); link sempre sozinho em uma linha, com uma frase antes explicando o que é.
RESPEITO: o respeito é primordial, com a família e com quem partiu. Chame quem faleceu pelo nome assim que souber, exatamente como a família disse (ex.: "Manoel", "Maria Clara"), ou pelo parentesco que a família usou ("seu pai", "sua filha"). NÃO use tratamentos como "seu", "dona", "senhor" ou "senhora" antes do nome: você não sabe a idade (pode ser um bebê, uma criança ou um adulto). Nunca use: defunto, cadáver, caixão, morto, corpo (use o nome da pessoa), enterro de forma seca (prefira sepultamento), velório "rápido". Prefira: urna, cerimônia de despedida, sepultamento, homenagem.

DECIDA a intenção da última mensagem do cliente, olhando a conversa toda, e responda no formato pedido.

TOM CONFORME A NECESSIDADE
- FALECIMENTO (intencao=obito): acolha com condolências sinceras e respeitosas UMA ÚNICA VEZ, na primeira mensagem, sem emojis, sem pressa e sem frases prontas exageradas. Nas mensagens seguintes NÃO repita condolências ("sinto muito" etc.): seja atenciosa, prática e solícita. A PRIMEIRA mensagem tem só: as condolências, que a equipe do plantão já foi avisada e UMA pergunta (o nome de quem faleceu). Se a pessoa disse que o falecimento foi em casa, oriente já nessa primeira mensagem a ligar para o SAMU (192) ou chamar um médico para confirmar o falecimento. Não peça tudo de uma vez: contrato e outros dados vêm depois, um por vez. Diga "confirmar o falecimento" (nunca "constatação"). Com mães, pais e crianças, acolha também a pessoa: se fizer sentido, sugira chamar alguém de confiança para ficar junto. Se a família pedir um telefone, passe o do plantão da BASE. transferir=true IMEDIATAMENTE para o setor de atendimento funerário, mesmo sem os dados. Na MESMA mensagem, diga que um atendente já vai falar com a pessoa e peça, de forma gentil, o que ainda não souber: nome completo de quem faleceu, onde a pessoa está agora (hospital, residência, cidade) e se é associado do PAI (número do contrato ou nome do titular) ou atendimento particular. Se a pessoa já contou algo, não pergunte de novo.
- RECLAMAÇÃO ou CANCELAMENTO: tom calmo e respeitoso, diga que vai passar para um atendente que vai cuidar disso; transferir=true.
- PAGAMENTOS/BOLETOS: tom prático. Se houver a seção COBRANÇA DO ASSOCIADO ou CONFIRMAÇÃO DO CONTRATO, siga a seção e resolva aqui mesmo (transferir=false). Só passe ao setor financeiro (transferir=true) quando não houver nenhuma dessas seções, ou para desconto, acordo, antecipar parcelas ou boleto em PDF que o cliente insistir.
- COMPROVANTE (intencao=comprovante): só quando o cliente diz que JÁ pagou e está mandando ou vai mandar o comprovante. Agradeça, diga que a equipe confere e avisa por aqui, e transferir=true para o financeiro. Palavras como "paguei" dentro de uma pergunta ("perco o que já paguei?") NÃO são comprovante: responda a pergunta.
- Quem quer CONHECER/CONTRATAR plano: tom acolhedor e animado; responda dúvidas com a base, e transferir=true para vendas quando quiser contratar ou pedir preço que não esteja na base.
- Fornecedor, prestador, parceria, coroa de flores, trabalho: tom cordial e objetivo; transferir=true para o setor certo.
- Se o cliente pedir para falar com uma pessoa/atendente: transferir=true na hora (intencao=falar_atendente).
- Só cumprimentou (oi, bom dia, boa tarde) sem dizer o que quer: intencao=saudacao. {$regraSaudacao}
- Dúvida que a BASE responde: responda com a base (intencao=duvida, transferir=false) e ofereça falar com um atendente. Se a base não tiver a resposta, NÃO invente: diga que vai passar para um atendente e transferir=true.
- Não entendeu: peça para a pessoa explicar com outras palavras (transferir=false), apenas uma vez; na segunda, transferir=true com setor_id=0.

REGRAS
- Nunca invente valores, coberturas, prazos ou regras. Valores e coberturas só se estiverem na BASE.
- Nunca peça CPF completo, documento ou dados de cartão. Para identificar, use nome do titular ou número do contrato.
- Não fale de assuntos fora do PAI.
- Antes de passar para um atendente: em dúvidas e outros assuntos, {$txtLim($lim['geral'])}; em venda de plano, {$txtLim($lim['vendas'])}; em pedido de coroa ou cobrança, {$txtLim($lim['pedidos'])}. O sistema passa sozinho quando o limite acaba.
- setor_id só pode ser um id da lista de setores (ou 0).
- etiquetas: só nomes exatos da lista de etiquetas, e só quando a orientação da etiqueta se aplicar (no máximo 2). Use "Particular" ou "Associado" se existirem na lista e o tipo de atendimento estiver claro.
- dados: preencha o que o cliente já informou (vazio se não informou). resumo: para a equipe, objetivo, 1 a 3 frases.
TXT
        . ($velorios !== '' ? "\n\nVELÓRIOS DE AGORA (informação pública)\nSe perguntarem sobre o velório ou o sepultamento de alguém desta lista, responda (intencao=informacao_velorio, transferir=false) só com nome, local, sala e horários — nada além disso (sem causa da morte, contatos ou valores). Se a pessoa não estiver na lista ou houver dúvida de quem é, encaminhe ao atendimento funerário.\nHOMENAGEM: depois de informar, você pode sugerir UMA vez, com delicadeza e sem insistir, uma coroa de flores para homenagear quem faleceu, entregue no velório (se houver a lista de coroas, diga que há opções a partir do menor valor). Se a pessoa quiser, intencao=coroa: se houver a seção VENDA DE COROA PELA AURORA, siga-a (você mesma faz o pedido); se não houver, transferir=true para o setor que cuida de coroas, com o nome do falecido, o local e o horário do velório em dados.outros. Se recusar ou não responder, não volte ao assunto. NUNCA informe prazo ou horário de entrega da coroa: diga que a equipe confirma o horário de entrega conforme os pedidos em andamento.\n{$velorios}" : '')
        . ($funeral !== '' ? "\n\n{$funeral}" : '')
        . ($coleta && $funeral === '' ? "\n\nATENÇÃO: o atendimento JÁ FOI encaminhado e o cliente está aguardando um atendente. Não transfira de novo (transferir=false) e não mude o setor (setor_id=0). Só atualize dados/resumo. Mande mensagem_cliente apenas se faltar um dado importante ainda não pedido, ou para agradecer a informação em uma frase; caso contrário, deixe vazio." : '')
        . "\n\nSETORES\n" . ($listaSetores ?: '- (nenhum cadastrado)')
        . "\n\nETIQUETAS DA EMPRESA\n" . ($listaEtiquetas ?: '- (nenhuma)')
        . ($vinculo !== '' ? "\n\nCLIENTE IDENTIFICADO PELO TELEFONE\n{$vinculo}\n(Ele é associado: não pergunte o contrato.)" : '')
        . "\n\nBASE DE CONHECIMENTO (única fonte para dúvidas)\n" . ($base !== '' ? $base : '(sem trechos para esta pergunta — não responda dúvidas, encaminhe)')
        . ($extra !== '' ? "\n\nORIENTAÇÕES DA EMPRESA\n{$extra}" : '');
}

/** Nota interna da Aurora (cria ou atualiza a mesma nota do atendimento). */
function msgIaNota(PDO $pdo, array $c, array $d): void
{
    $nomes = ['obito' => 'Falecimento', 'informacao_velorio' => 'Informação de velório', 'pagamento' => 'Pagamento', 'comprovante' => 'Comprovante', 'plano_novo' => 'Quer um plano',
        'associado' => 'Associado', 'fornecedor' => 'Fornecedor/prestador', 'parceria' => 'Parceria/convênio', 'coroa' => 'Coroa de flores', 'trabalho' => 'Trabalhe conosco',
        'reclamacao' => 'Reclamação', 'cancelamento' => 'Cancelamento', 'falar_atendente' => 'Pediu atendente', 'duvida' => 'Dúvida', 'saudacao' => 'Saudação', 'outro' => 'Outro'];
    $dd = $d['dados'] ?? [];
    $linhas = ['🤖 Aurora · ' . ($nomes[$d['intencao']] ?? $d['intencao'])];
    foreach (['nome_cliente' => 'Quem fala', 'falecido_nome' => 'Falecido(a)', 'local' => 'Onde está', 'contrato' => 'Contrato'] as $k => $rot) {
        if (trim((string) ($dd[$k] ?? '')) !== '') {
            $linhas[] = $rot . ': ' . trim((string) $dd[$k]);
        }
    }
    if (($dd['tipo_atendimento'] ?? '') !== 'nao_informado' && !empty($dd['tipo_atendimento'])) {
        $linhas[] = 'Atendimento: ' . ($dd['tipo_atendimento'] === 'associado' ? 'associado' : 'particular');
    }
    if (trim((string) ($dd['outros'] ?? '')) !== '') {
        $linhas[] = trim((string) $dd['outros']);
    }
    if (trim((string) ($d['resumo'] ?? '')) !== '') {
        $linhas[] = 'Resumo: ' . trim((string) $d['resumo']);
    }
    if (!empty($d['faltando'])) {
        $linhas[] = 'Falta: ' . implode(', ', array_map('strval', $d['faltando']));
    }
    $texto = mb_substr(implode("\n", $linhas), 0, 3000);
    $notaId = (int) ($c['ia_nota_id'] ?? 0);
    if ($notaId > 0) {
        $pdo->prepare('UPDATE chat_mensagens SET texto = :t WHERE id = :id')->execute([':t' => $texto, ':id' => $notaId]);
    } else {
        $notaId = msgGravar($pdo, (int) $c['id'], ['atendimento_id' => $c['atendimento_atual_id'] !== null ? (int) $c['atendimento_atual_id'] : null, 'autor_tipo' => 'sistema', 'tipo' => 'texto', 'texto' => $texto]);
        $pdo->prepare('UPDATE chat_mensagens SET interna = 1 WHERE id = :id')->execute([':id' => $notaId]);
        $pdo->prepare('UPDATE chat_conversas SET ia_nota_id = :n WHERE id = :id')->execute([':n' => $notaId, ':id' => $c['id']]);
    }
    $msg = msgMensagemPorId($pdo, $notaId);
    if ($msg) {
        $dest = msgDestinatarios($pdo, msgConversa($pdo, (int) $c['id']) ?: $c);
        msgDepois(fn() => msgAblyAvisar($dest, 'mensagem', $msg + ['notificar' => false]));
    }
}

/**
 * Aurora decide o que fazer com a mensagem do cliente (atendimento novo, no menu, conversando com ela
 * ou aguardando atendente depois de encaminhado). Retorna true quando a fila deve ser avisada agora.
 * Retorna null quando não atuou (o fluxo de menu comum segue).
 */
function msgIaAoChegar(PDO $pdo, int $conversaId, bool $novo, string $tipo, string $texto, int $mensagemId): ?bool
{
    $c = msgConversa($pdo, $conversaId);
    if (!$c || $c['status_atendimento'] !== 'aguardando') {
        return null;
    }
    $estado = (string) ($c['bot_estado'] ?? '');
    $coleta = $estado === 'ia_coleta';
    if (!$novo && !in_array($estado, ['menu', 'ia', 'ia_coleta'], true)) {
        return null;
    }
    if ($tipo === 'audio') {
        $texto = msgIaTranscrever($pdo, $mensagemId);
        if ($texto === '') {
            return null; // sem transcrição: segue a regra do áudio (vai para um atendente)
        }
    }
    $texto = trim($texto);
    if ($texto === '' || ($estado === 'menu' && preg_match('/^\s*\d{1,2}\s*$/', $texto))) {
        return null; // número do menu: o menu comum resolve
    }
    // setores, etiquetas e vínculo com contrato
    $setores = [];
    foreach (carregarSetoresAtivos($pdo) as $s) {
        $setores[] = $s;
    }
    $etiquetas = $pdo->query('SELECT id, nome, quando_usar FROM chat_etiquetas WHERE usuario_id IS NULL ORDER BY nome')->fetchAll();
    $sv = $pdo->prepare('SELECT contrato, titular_nome, plano FROM chat_contato_contratos WHERE contato_id = :c');
    $sv->execute([':c' => $c['contato_externo_id']]);
    $vinculo = implode("\n", array_map(fn($v) => "Contrato {$v['contrato']} · titular {$v['titular_nome']}" . ($v['plano'] ? " · {$v['plano']}" : ''), $sv->fetchAll()));
    $hist = msgIaHistorico($pdo, $conversaId, $c['atendimento_atual_id'] !== null ? (int) $c['atendimento_atual_id'] : null);
    // habilidades funerárias (19/10/2026): velórios do dia e, no falecimento, orientação + escolhas + orçamento
    $velorios = '';
    $ctxFuneral = null;
    $textoFuneral = '';
    if (msgConfigTela($pdo, 'ia_velorios', '1') === '1' || msgConfigTela($pdo, 'ia_funeral', '1') === '1') {
        require_once __DIR__ . '/messenger_funeral.php';
        $os = msgFunMotor();
        if ($os && msgConfigTela($pdo, 'ia_velorios', '1') === '1') {
            $velorios = implode("\n", msgFunVelorios($os));
            // homenagem: modelos de coroa com preço (a Aurora sugere com delicadeza a quem pergunta do velório)
            $coroas = $velorios !== '' && msgConfigTela($pdo, 'ia_coroa_sugerir', '1') === '1' ? array_slice(msgFunCoroas($os), 0, 5) : [];
            if ($coroas) {
                $velorios .= "\nCOROAS DE FLORES PARA HOMENAGEM (entregamos no velório):\n" . implode("\n", array_map(fn($k) => '- ' . $k['nome'] . ': R$ ' . number_format($k['preco'], 2, ',', '.'), $coroas));
            }
            // compra online da coroa (site): mais rápido e prático; a pessoa escolhe, paga e a equipe entrega no velório
            $linkCoroa = trim((string) msgConfigTela($pdo, 'ia_coroa_link', 'https://planoassistencialintegrado.com.br/coroas-de-flores/'));
            if ($velorios !== '' && $linkCoroa !== '' && msgConfigTela($pdo, 'ia_coroa_sugerir', '1') === '1') {
                $velorios .= "\nCOMPRA ONLINE DA COROA: {$linkCoroa}\nAo sugerir a coroa, ofereça este link como o jeito mais rápido e prático (a pessoa escolhe o modelo, escreve a mensagem da faixa e paga pelo site; a entrega no velório é com a nossa equipe). Se ela preferir, ou tiver dificuldade com o site, passe ao setor que cuida de coroas.";
            }
        }
        if ($os && $coleta && (int) ($c['prioridade'] ?? 0) === 1 && msgConfigTela($pdo, 'ia_funeral', '1') === '1') {
            $planoTxt = '';
            $sp = $pdo->prepare('SELECT plano FROM chat_contato_contratos WHERE contato_id = :c AND plano IS NOT NULL ORDER BY criado_em LIMIT 1');
            $sp->execute([':c' => $c['contato_externo_id']]);
            $planoTxt = (string) $sp->fetchColumn();
            $conv = $planoTxt !== '' ? msgFunConvenioDoPlano($os, msgUnyPlanoCurto($planoTxt, $planoTxt)) : null;
            $op = msgFunOpcoes($os, $conv);
            $ctxFuneral = ['os' => $os, 'convenio' => $conv, 'op' => $op];
            $antes = (string) ($c['ia_funeral_json'] ?? '');
            $textoFuneral = "ATENDIMENTO FUNERÁRIO EM ANDAMENTO (você continua com a família até o atendente assumir)\n"
                . "- O atendente do plantão já foi avisado. As condolências JÁ FORAM DADAS: não repita \"sinto muito\" nem frases de pêsames; trate com atenção, calma e solicitude, UMA pergunta por mensagem, frases curtas. transferir=false e setor_id=0.\n"
                . "- Mostre que a família não está sozinha, sem prometer o que ainda não aconteceu: o plantão já foi avisado e o atendente vai orientar os próximos passos, inclusive a remoção. Diga isso UMA vez só e não repita nas mensagens seguintes (nada de frase pronta como \"nossa equipe já está se organizando\"). Chame quem faleceu pelo nome ou pelo parentesco que a família usou, sem \"seu\", \"dona\" ou \"senhor(a)\".\n"
                . "- Não repita pergunta que a família já respondeu. Releia a conversa antes.\n"
                . "- Se a família perguntar quanto tempo o atendente vai levar ou disser que está com medo ou perdida: acolha em uma frase, diga que o caso já está com PRIORIDADE no plantão e que o atendente fala por aqui mesmo. Nunca diga \"não consigo estimar\" e nunca invente prazo.\n"
                . "- Custos: não fale valores antes do orçamento; diga que o atendente confere se é associado e explica tudo com calma.\n"
                . "- ORIENTE (uma coisa de cada vez, quando fizer sentido): no hospital, pedir a declaração de óbito ao médico e conferir os dados; falecimento em casa: chamar o médico ou o SAMU para constatar o óbito; morte violenta ou suspeita: o caminho é pelo IML.\n"
                . "- REGISTRO DO ÓBITO NO CARTÓRIO: é feito por um FAMILIAR (a funerária só pode fazer com procuração). NUNCA diga que a funerária faz o registro. Quando fizer sentido (por exemplo, a família pergunta o que fazer enquanto espera), oriente a ter EM MÃOS para levar ao cartório, em lista, um item por linha:\n"
                . "  • documentos de quem faleceu e de quem vai declarar\n  • comprovante de endereço\n  • certidão de casamento, se era casado(a)\n  • informações sobre bens e o nome dos filhos\n"
                . "  Deixe claro que é para levar ao cartório e que não precisa enviar nada por aqui. Não cite números nem peça documentos.\n"
                . "- A remoção e o velório são combinados pelo atendente com a família: não diga que já estão sendo feitos.\n"
                . "- ESCOLHAS para o orçamento (pergunte o que faltar, com delicadeza, sem pressionar venda): urna (ofereça no máximo 3 opções da lista, pelo nome" . ($conv ? ', começando pelas cobertas pelo plano' : ', com o preço') . "), local do velório (sala do Memorial ou outro lugar), tanatopraxia (explique em uma frase: preparação do corpo para velório mais longo), translado (se o sepultamento for em outra cidade: qual e quantos km aproximados), se vão trazer roupa, se querem coroa de flores.\n"
                . "- " . ($conv ? "É ASSOCIADO (convênio {$conv['nome']}): diga o que o plano cobre só depois do orçamento conferido pelo atendente; não prometa cobertura." : 'Atendimento PARTICULAR: pode dizer o preço de cada opção da lista; o total sai no orçamento conferido pelo atendente.') . "\n"
                . "- Preencha funeral com o que JÁ foi escolhido na conversa (mantenha o que já estava). pronto=true quando urna, velório, tanatopraxia e translado estiverem definidos; aí diga que o atendente vai conferir e enviar o orçamento em instantes.\n"
                . ($antes !== '' ? "ESCOLHAS JÁ REGISTRADAS: {$antes}\n" : '')
                . msgFunOpcoesTexto($op, (bool) $conv);
        }
    }
    // cobrança pela Aurora (19/10/2026): só para contato vinculado a contrato e autorizado a receber cobrança
    $textoCobranca = '';
    $ctxCobranca = null;
    $ctxConfirma = null; // confirmação do contrato de quem ainda não tem vínculo (22/10/2026)
    if ($novo) {
        msgIaConfApagar($pdo, $conversaId);
    }
    $recentes = mb_strtolower($texto . ' ' . mb_substr($hist, -900));
    if (!$ctxFuneral && msgConfigTela($pdo, 'ia_cobranca', '1') === '1'
        && (preg_match('/pag|boleto|pix|link|mensalidade|parcela|segunda via|2.? via|atras|devendo|devo|vencid|quitar/u', $recentes) || msgIaConfEstado($pdo, $conversaId)['ativo'])) {
        try {
            $sv = $pdo->prepare('SELECT * FROM chat_contato_contratos WHERE contato_id = :c AND pode_pagar = 1 ORDER BY criado_em LIMIT 1');
            $sv->execute([':c' => $c['contato_externo_id']]);
            $vc = $sv->fetch();
            $vendaJson = json_decode((string) ($c['ia_venda_json'] ?? ''), true) ?: [];
            $ehAssociado = preg_match('/mensalidade|parcela|segunda via|2.? via|atrasad|em atraso|devendo|vencid|quitar|carn[eê]|em aberto|meu plano|meu contrato/u', $recentes)
                && empty($vendaJson['plano']);
            if (!$vc && ($ehAssociado || msgIaConfEstado($pdo, $conversaId)['ativo'])) {
                // sem contrato vinculado (22/10/2026): a Aurora confirma o contrato com dados do cadastro antes de cobrar
                $conf = msgIaConfEstado($pdo, $conversaId);
                $ctxConfirma = $conf;
                if (!$conf['ativo']) {
                    msgIaConfSalvar($pdo, $conversaId, $conf + ['ativo' => true]);
                }
                $textoCobranca = "CONFIRMAÇÃO DO CONTRATO (o telefone desta pessoa ainda não está ligado a um contrato)\n"
                    . "Use só quando a pessoa JÁ é associada e quer pagar mensalidade ou saber o que está em aberto. Quem quer conhecer ou contratar um plano novo não é este caso: ignore esta seção.\n"
                    . "Para informar valores e gerar o pagamento, primeiro confirme o contrato, UMA pergunta por vez:\n"
                    . "1) o número do contrato (está no carnê ou no app do associado);\n"
                    . "2) a data de nascimento do titular do contrato;\n"
                    . "3) os 3 últimos dígitos do CPF do titular. Se a pessoa não souber, peça os 4 últimos dígitos do telefone que está no cadastro.\n"
                    . "Explique em uma frase que é para a segurança do associado. NUNCA peça o CPF inteiro, foto de documento ou cartão. Não diga nenhum valor antes da confirmação. transferir=false enquanto estiver colhendo esses dados.\n"
                    . "Preencha confirmacao com o que a pessoa já informou na conversa (contrato só com dígitos; data no formato AAAA-MM-DD). Quem confere é o sistema: você não sabe os dados do cadastro e não deve dizer se conferem.\n"
                    . "Se a pessoa não souber o número do contrato, ou pedir desconto ou acordo, passe ao financeiro (transferir=true).\n"
                    . ($conf['tentativas'] > 0 ? "ATENÇÃO: a tentativa anterior NÃO conferiu com o cadastro. Peça, com gentileza, para a pessoa conferir os dados e mandar de novo (última tentativa).\n" : '');
            }
            if ($vc) {
                $k = msgUnyContrato($pdo, (string) $vc['contrato'], preg_replace('/\D/', '', (string) $vc['titular_cpf']));
                if ($k) {
                    $f = msgUnyFinanceiro($k['contas']);
                    $brl = fn($x) => 'R$ ' . number_format((float) $x, 2, ',', '.');
                    $ctxCobranca = ['vinculo' => $vc, 'fin' => $f];
                    $idsLote = array_column($f['lote'], 'id');
                    $lista = implode("\n", array_map(fn($p) => '- parcela ' . ($p['parcela'] ?: '') . ' · vence ' . date('d/m/Y', strtotime($p['vencimento'])) . ' · ' . $brl($p['valor']) . (in_array($p['id'], $idsLote, true) ? ' (entra no pagamento de agora)' : ''), array_slice($f['abertas'], 0, 6)));
                    $textoCobranca = "COBRANÇA DO ASSOCIADO (contrato {$vc['contrato']}, quem fala pode receber cobrança)\n"
                        . ($f['abertas'] ? "Mensalidades em aberto:\n{$lista}\nPagamento de agora (da mais antiga até a do mês, regra do sistema): " . $brl($f['total_lote']) . ' (' . count($f['lote']) . ' mensalidade(s))' . ($f['vencidas'] ? ' · há parcela vencida' : '') . "\n"
                            . "Se o cliente quiser pagar: diga o valor de agora e ofereça o LINK (Pix ou cartão) ou o PIX COPIA E COLA. Se ele JÁ disse qual prefere, confirme em uma frase e marque cobranca.acao na mesma resposta; se ainda não disse, pergunte e só marque depois da escolha ('link' ou 'pix'). O sistema gera e envia o código/link logo depois da sua mensagem: não diga que o financeiro vai enviar. transferir=false. Boleto em PDF: ofereça o link ou o Pix; se ele insistir no boleto, passe ao financeiro. Antecipar parcelas, desconto ou acordo: passe ao financeiro.\n"
                            : "Não há mensalidade em aberto: diga que está tudo em dia.\n");
                }
            }
        } catch (Throwable $e) {
            error_log('[messenger] Aurora cobrança: ' . $e->getMessage());
        }
    }
    // venda de coroa pela Aurora (19/10/2026): modelos, velórios do quadro e pedido na fila de coroas com a OS Cor
    $textoCoroa = '';
    $ctxCoroa = null;
    if (!$ctxFuneral && msgConfigTela($pdo, 'ia_coroa_vender', '1') === '1' && preg_match('/coroa|flores|homenage|velório|velorio/u', $recentes)) {
        require_once __DIR__ . '/messenger_funeral.php';
        $os = msgFunMotor();
        if ($os) {
            $modelos = msgFunCoroasModelos($os);
            $veloriosLista = msgFunVeloriosLista($os);
            if ($modelos) {
                $ctxCoroa = ['os' => $os, 'modelos' => $modelos, 'velorios' => $veloriosLista];
                $brl = fn($x) => 'R$ ' . number_format((float) $x, 2, ',', '.');
                $textoCoroa = "VENDA DE COROA PELA AURORA (seja solícita e calorosa: é uma homenagem)\n"
                    . "1) Primeiro, OFEREÇA os dois caminhos, sem listar modelos ainda: \"Posso te mostrar alguns modelos aqui mesmo, ou, se preferir, você faz pelo nosso site, que é bem prático.\" Mande o link do site sozinho em uma linha. Pergunte para quem é a homenagem (o velório).\n"
                    . "2) Se a pessoa quiser ver aqui: mostre no máximo 4 modelos da lista, UM POR LINHA (• nome — preço), do mais simples ao mais completo.\n"
                    . "3) Depois, uma coisa por vez: a frase da faixa (\"Qual mensagem você quer na faixa?\"; exatamente como a pessoa quer; se ela já disse, não pergunte de novo), o NOME DE QUEM FALECEU (é por ele que achamos o velório; use o id da lista se estiver lá) e o nome de quem envia a homenagem.\n"
                    . "   Se o velório não estiver na lista: pergunte UMA vez onde será o velório (a pessoa pode não saber). Se não souber, NÃO transfira por isso: registre coroa.local = \"Velório de <nome de quem faleceu> — local a confirmar pela equipe\" e siga; a equipe confirma o endereço.\n"
                    . "4) SEMPRE, antes de qualquer encaminhamento, mostre o RESUMO em linhas (• Modelo e valor • Faixa • Homenagem para • Velório: local, ou \"a confirmar pela equipe\" • Enviado por) e peça a confirmação; só com o 'sim' marque coroa.confirmar=true.\n"
                    . "HORÁRIO DE ENTREGA: nunca prometa horário. Diga UMA vez só que a equipe confirma o horário conforme os pedidos em andamento. Se a pessoa tiver pressa ou insistir (\"o velório é hoje\", \"preciso saber antes de pagar\"), responda PRIMEIRO a isso: reconheça a urgência e diga que vai pedir à equipe para confirmar o horário com prioridade antes do pagamento; depois peça o dado que falta. Não repita a mesma frase sobre horário.\n"
                    . "PAGAMENTO: diga só que a equipe envia as formas de pagamento por aqui depois do pedido (não confirme Pix, cartão ou outra forma específica e não diga \"logo depois\"). Diga isso uma vez só.\n"
                    . "MODELOS DE COROA (id · nome · preço) — ofereça SÓ estes:\n"
                    . implode("\n", array_map(fn($m) => "- id {$m['id']} · {$m['nome']} · " . $brl($m['valor']), array_slice($modelos, 0, 14)))
                    . ($veloriosLista ? "\nVELÓRIOS PARA ENTREGA (id · falecido · local):\n" . implode("\n", array_map(fn($v) => "- id {$v['id']} · {$v['falecido']} · {$v['local']}", $veloriosLista)) : '');
            }
        }
    }
    $textoFuneral = trim($textoFuneral . "\n\n" . $textoCobranca . "\n\n" . $textoCoroa);
    // consultora de vendas (19/10/2026): família, recomendação e valores calculados pelo servidor
    $vendaAntes = json_decode((string) ($c['ia_venda_json'] ?? ''), true) ?: [];
    $textoVenda = '';
    if (!$ctxFuneral && msgConfigTela($pdo, 'ia_vendas', '1') === '1') {
        $textoVenda = msgIaInstrucoesVenda($vendaAntes);
        $textoFuneral = trim($textoFuneral . "\n\n" . $textoVenda);
    }
    // a Base vale também depois do encaminhamento (ex.: telefone do plantão para a família que espera)
    $instr = msgIaInstrucoes($pdo, $setores, $etiquetas, $vinculo, msgIaBase($pdo, $texto), $coleta && $textoVenda === '', $textoFuneral, $velorios);
    // aprendizado contínuo: lições aprovadas pela Gestão e exemplos de bons atendimentos (tela Aprendizado da Aurora)
    $aprendido = msgAprTextoParaAurora($pdo, $texto);
    if ($aprendido !== '') {
        $instr .= "\n\n" . $aprendido;
    }
    $entrada = "CONVERSA ATÉ AGORA\n{$hist}\nÚLTIMA MENSAGEM DO CLIENTE: {$texto}";
    $d = msgIaJson($pdo, $instr, $entrada, msgIaEsquema(), 4000) ?: msgIaJson($pdo, $instr, $entrada, msgIaEsquema(), 6000); // segunda tentativa antes de mandar para a fila
    if (!$d) {
        return null; // a IA não respondeu: segue o fluxo comum (menu / fila)
    }
    $idsSetores = array_column($setores, 'id');
    $setorId = in_array((int) $d['setor_id'], $idsSetores, true) ? (int) $d['setor_id'] : 0;
    $intencao = (string) $d['intencao'];

    // etiquetas da empresa (respeita o limite por conversa)
    $porNome = [];
    foreach ($etiquetas as $e) {
        $porNome[mb_strtolower($e['nome'])] = (int) $e['id'];
    }
    foreach (array_slice((array) $d['etiquetas'], 0, 2) as $nome) {
        $eid = $porNome[mb_strtolower(trim((string) $nome))] ?? 0;
        $sq = $pdo->prepare('SELECT COUNT(*) FROM chat_conversa_etiquetas WHERE conversa_id = :c');
        $sq->execute([':c' => $conversaId]);
        if ($eid && (int) $sq->fetchColumn() < msgMaxEtiquetas($pdo)) {
            $pdo->prepare('INSERT IGNORE INTO chat_conversa_etiquetas (conversa_id, etiqueta_id) VALUES (:c, :e)')->execute([':c' => $conversaId, ':e' => $eid]);
        }
    }
    // comprovante reconhecido pela Aurora (22/10/2026): mesmo setor e mesma etiqueta configurados para o comprovante
    if ($intencao === 'comprovante' && msgBotTexto($pdo, 'comprovante_ativo') === '1') {
        $setorComp = (int) msgBotTexto($pdo, 'comprovante_setor');
        if ($setorComp > 0 && in_array($setorComp, $idsSetores, true)) {
            $setorId = $setorComp;
        }
        msgComprovanteEtiquetar($pdo, $conversaId);
    }
    if ($intencao !== 'saudacao') {
        msgIaNota($pdo, $c, $d);
    }
    if ($ctxFuneral && is_array($d['funeral'] ?? null)) {
        $f = $d['funeral'];
        $pdo->prepare('UPDATE chat_conversas SET ia_funeral_json = :j WHERE id = :id')->execute([':j' => json_encode($f, JSON_UNESCAPED_UNICODE), ':id' => $conversaId]);
        $urnaOk = in_array((int) $f['urna_id'], array_column($ctxFuneral['op']['urnas'], 'id'), true);
        if (!empty($f['pronto']) && $urnaOk) {
            try {
                $calc = msgFunCalcular($ctxFuneral['os'], $f, $ctxFuneral['convenio'], $ctxFuneral['op']);
                $orcId = msgFunSalvarOrcamento($pdo, $c, $f, $calc, (string) ($d['dados']['falecido_nome'] ?? ''));
                $novoAviso = ($c['ia_funeral_json'] ?? '') === '' || json_decode((string) $c['ia_funeral_json'], true) != $f;
                if ($novoAviso) {
                    msgSistema($pdo, $conversaId, '📝 Aurora preparou um orçamento: R$ ' . number_format($calc['familia'], 2, ',', '.') . ' para a família' . ($calc['pendentes'] ? ' (+ itens a confirmar)' : '') . ' — confira e envie');
                    $conv = msgConversa($pdo, $conversaId);
                    if ($conv) {
                        $dest = msgDestinatarios($pdo, $conv);
                        msgDepois(fn() => msgAblyAvisar($dest, 'conversa', ['conversa_id' => $conversaId, 'motivo' => 'orcamento_ia', 'orcamento_id' => $orcId]));
                    }
                }
            } catch (Throwable $e) {
                error_log('[messenger] Aurora: orçamento: ' . $e->getMessage());
            }
        }
    }

    // aprendizado: registra o assunto da pergunta (perguntas frequentes e o que falta na Base)
    msgIaRegistrarPergunta($pdo, $conversaId, $d, $texto, $coleta);
    // confirmação do contrato (22/10/2026): o servidor confere os dados com o cadastro da Unymos; se baterem, liga o
    // telefone ao contrato (pode pagar) e já informa o valor. A Aurora nunca vê o CPF nem a data do cadastro.
    if ($ctxConfirma !== null && is_array($d['confirmacao'] ?? null)) {
        $r = msgIaConfProcessar($pdo, $c, $ctxConfirma, $d['confirmacao']);
        if ($r !== null) {
            $d['mensagem_cliente'] = $r['mensagem'];
            $d['transferir'] = $r['transferir'];
            $d['cobranca']['acao'] = '';
            if ($r['transferir'] && $intencao !== 'falar_atendente') {
                $intencao = 'pagamento';
            }
        }
    }
    // cobrança: o cliente escolheu link ou Pix → o sistema gera pela Unymos e envia
    $acaoCob = (string) ($d['cobranca']['acao'] ?? '');
    if ($ctxCobranca && in_array($acaoCob, ['link', 'pix'], true) && !empty($ctxCobranca['fin']['lote'])) {
        try {
            $f = $ctxCobranca['fin'];
            $vc = $ctxCobranca['vinculo'];
            $ids = array_column($f['lote'], 'id');
            $brl = fn($x) => 'R$ ' . number_format((float) $x, 2, ',', '.');
            $desc = $brl($f['total_lote']) . ' (' . count($ids) . ' mensalidade' . (count($ids) > 1 ? 's' : '') . ')';
            if (trim((string) $d['mensagem_cliente']) !== '') {
                msgBotEnviar($pdo, $conversaId, (string) $d['mensagem_cliente']);
                $d['mensagem_cliente'] = '';
            }
            if ($acaoCob === 'link') {
                $url = msgEmTeste() ? 'https://teste.planoassistencialintegrado.com.br/pagamento' : msgUnyLink($pdo, $ids, $f['total_lote']);
                msgBotEnviar($pdo, $conversaId, "Segue o link para pagamento por Pix ou cartão de {$desc}:\n{$url}");
                $lote = null;
            } else {
                $pix = msgEmTeste() ? ['copia_cola' => '00020126TESTE-PIX-DO-SIMULADOR', 'lote_id' => null] : msgUnyPix($pdo, $ids, $f['total_lote']);
                msgBotEnviar($pdo, $conversaId, "Pix de {$desc}. Copie o código abaixo e cole no app do seu banco (Pix copia e cola):");
                msgBotEnviar($pdo, $conversaId, (string) $pix['copia_cola']);
                $lote = $pix['lote_id'] ?? null;
            }
            $pdo->prepare('INSERT INTO chat_cobrancas (conversa_id, contato_id, contrato, tipo, valor, contas, pix_lote_id, criado_por) VALUES (:c, :ct, :n, :t, :v, :ids, :l, NULL)')
                ->execute([':c' => $conversaId, ':ct' => $c['contato_externo_id'], ':n' => $vc['contrato'], ':t' => $acaoCob, ':v' => $f['total_lote'], ':ids' => implode(',', $ids), ':l' => $lote ?: null]);
            msgSistema($pdo, $conversaId, 'Aurora gerou ' . ($acaoCob === 'link' ? 'link de pagamento' : 'Pix') . ' de ' . $desc . ' (contrato ' . $vc['contrato'] . ')');
        } catch (Throwable $e) {
            error_log('[messenger] Aurora cobrança: ' . $e->getMessage());
            msgBotEnviar($pdo, $conversaId, 'Não consegui gerar o pagamento agora. Vou te passar para o financeiro, que envia em seguida.');
            $d['transferir'] = true;
        }
    }
    // coroa: pedido confirmado → entra na fila de coroas com a OS Cor aberta, aguardando pagamento
    if ($ctxCoroa && !empty($d['coroa']['confirmar'])) {
        $cr = $d['coroa'];
        $modelo = null;
        foreach ($ctxCoroa['modelos'] as $m) {
            if ((int) $m['id'] === (int) $cr['modelo_id']) {
                $modelo = $m;
            }
        }
        $vel = null;
        foreach ($ctxCoroa['velorios'] as $v) {
            if ((int) $v['id'] === (int) $cr['velorio_id']) {
                $vel = $v;
            }
        }
        if ($modelo && trim((string) $cr['frase']) !== '' && ($vel || trim((string) $cr['local']) !== '')) {
            try {
                $sc = $pdo->prepare('SELECT nome, nome_salvo, telefone_e164 FROM chat_contatos_externos WHERE id = :id');
                $sc->execute([':id' => $c['contato_externo_id']]);
                $ct = $sc->fetch() ?: [];
                $ped = msgFunCriarPedidoCoroa($ctxCoroa['os'], [
                    'modelo' => $modelo, 'frase' => trim((string) $cr['frase']), 'velorio' => $vel, 'local' => trim((string) $cr['local']),
                    'solicitante' => trim((string) $cr['solicitante']) ?: (($ct['nome_salvo'] ?? '') ?: ($ct['nome'] ?? 'Cliente do WhatsApp')),
                    'telefone' => (string) ($ct['telefone_e164'] ?? ''),
                ]);
                $brl = fn($x) => 'R$ ' . number_format((float) $x, 2, ',', '.');
                msgSistema($pdo, $conversaId, '🌺 Aurora lançou o pedido de coroa nº ' . $ped['id'] . ' (' . $modelo['nome'] . ' · ' . $brl($modelo['valor']) . ($vel ? ' · velório de ' . $vel['falecido'] : '') . ')' . ($ped['os'] ? ' · OS ' . $ped['os'] . ' aberta' : '') . ' — aguardando pagamento');
                msgVendaNotificar($pdo, $conversaId, '🌺 Coroa vendida pela Aurora', $modelo['nome'] . ' · ' . $brl($modelo['valor']) . ($vel ? ' · ' . $vel['falecido'] : '') . ' — enviar a forma de pagamento', 'coroa-de-flores', '/coroa-de-flores');
                $d['transferir'] = true; // o setor de coroas envia a forma de pagamento
                if (trim((string) $d['mensagem_cliente']) === '') {
                    $d['mensagem_cliente'] = "Pedido registrado! 🌺\n\nUm atendente vai confirmar o horário de entrega e te enviar a forma de pagamento aqui mesmo.";
                }
            } catch (Throwable $e) {
                error_log('[messenger] Aurora coroa: ' . $e->getMessage());
                $d['transferir'] = true;
                $d['mensagem_cliente'] = 'Anotei o seu pedido de coroa. Um atendente vai concluir com você agora.';
            }
        }
    }
    // venda de plano: guarda o que a família contou e, quando decidir, manda a ficha de adesão (fora do WhatsApp)
    if ($textoVenda !== '' && is_array($d['venda'] ?? null) && ($intencao === 'plano_novo' || ($d['venda']['plano'] ?? '') !== '' || !empty($vendaAntes['plano']))) {
        $venda = array_merge($vendaAntes, $d['venda']);
        $pdo->prepare('UPDATE chat_conversas SET ia_venda_json = :j WHERE id = :id')->execute([':j' => json_encode($venda, JSON_UNESCAPED_UNICODE), ':id' => $conversaId]);
        if (!empty($venda['decidiu']) && in_array($venda['plano'], VENDA_PLANOS, true) && !array_key_exists('proposta_id', $vendaAntes)) { // a ficha vai uma vez só (no simulador o id é 0)
            $calc = msgVendaCalcular($venda['plano'], (int) $venda['idade_mais_velho'], max(1, (int) $venda['pessoas']), (int) $venda['extras'], !empty($venda['aditivo_tanato']), !empty($venda['aditivo_translado']));
            $prop = msgVendaProposta($pdo, $c, $venda, $calc, (string) ($vendaAntes['origem'] ?? ''));
            $venda['proposta_id'] = $prop['id'];
            $pdo->prepare('UPDATE chat_conversas SET ia_venda_json = :j WHERE id = :id')->execute([':j' => json_encode($venda, JSON_UNESCAPED_UNICODE), ':id' => $conversaId]);
            if (trim((string) $d['mensagem_cliente']) !== '') {
                msgBotEnviar($pdo, $conversaId, (string) $d['mensagem_cliente']);
            }
            msgBotEnviar($pdo, $conversaId, "Para concluir a sua adesão ao plano *{$venda['plano']}*, preencha a ficha neste link (é rápido e seguro, fora do WhatsApp):\n{$prop['link']}\n\nO link vale 7 dias. Depois que você enviar, nossa equipe conclui o cadastro e te avisa por aqui.");
            $brl = fn($x) => 'R$ ' . number_format((float) $x, 2, ',', '.');
            msgSistema($pdo, $conversaId, '📝 Proposta de adesão: plano ' . $venda['plano'] . ($calc ? ' · ' . $brl($calc['mensalidade']) . '/mês + adesão ' . $brl($calc['adesao']) : '') . ' — ficha enviada ao cliente');
            msgVendaNotificar($pdo, $conversaId, '🎉 Plano novo fechado pela Aurora', 'Plano ' . $venda['plano'] . ($calc ? ' · ' . $brl($calc['mensalidade']) . '/mês' : '') . ' — aguardando a ficha de adesão');
            // vai para a fila de Vendas (com a etiqueta Lead, se existir) para a equipe acompanhar
            $eid = $porNome['lead'] ?? 0;
            if ($eid) {
                $pdo->prepare('INSERT IGNORE INTO chat_conversa_etiquetas (conversa_id, etiqueta_id) VALUES (:c, :e)')->execute([':c' => $conversaId, ':e' => $eid]);
            }
            $pdo->prepare("UPDATE chat_conversas SET setor_id = COALESCE(:s, setor_id), bot_estado = 'ia_coleta', bot_tentativas = 0 WHERE id = :id")->execute([':s' => $setorId ?: null, ':id' => $conversaId]);
            return true;
        }
    }
    // aguardando atendente (já encaminhado): só atualiza a nota e, se for o caso, uma frase ao cliente
    if ($coleta) {
        $ja = (int) ($c['bot_tentativas'] ?? 0);
        $limiteColeta = !empty($ctxFuneral) ? msgIaLimites($pdo)['funeral'] : msgIaLimites($pdo)['espera'];
        if (trim((string) $d['mensagem_cliente']) !== '' && ($limiteColeta === 0 || $ja < $limiteColeta)) {
            msgBotEnviar($pdo, $conversaId, (string) $d['mensagem_cliente']);
            $pdo->prepare('UPDATE chat_conversas SET bot_tentativas = bot_tentativas + 1 WHERE id = :id')->execute([':id' => $conversaId]);
        }
        return false;
    }
    // só cumprimentou: o menu comum (boas-vindas + opções) cuida
    if ($intencao === 'saudacao' && $novo && msgConfigTela($pdo, 'ia_saudacao', '1') !== '1') {
        return null; // menu de opções na entrada (Configurações › Aurora)
    }
    if ($intencao === 'saudacao' && trim((string) $d['mensagem_cliente']) === '') {
        $d['mensagem_cliente'] = 'Olá! Eu sou a Aurora, assistente virtual do Plano PAI. 😊 Como posso te ajudar hoje?';
    }
    $enviar = trim((string) $d['mensagem_cliente']);
    // limite de respostas por tipo de conversa (Configurações › Aurora): 0 = sem limite
    $lim = msgIaLimites($pdo);
    if ($textoVenda !== '' && ($intencao === 'plano_novo' || ($d['venda']['plano'] ?? '') !== '')) {
        $limite = $lim['vendas'];
    } elseif (($ctxCoroa && $intencao === 'coroa') || (($ctxCobranca || $ctxConfirma !== null) && in_array($intencao, ['pagamento', 'associado'], true))) {
        $limite = $lim['pedidos'];
    } else {
        $limite = $lim['geral'];
    }
    $respostas = $estado === 'ia' ? (int) ($c['bot_tentativas'] ?? 0) : 0;
    $transferir = !empty($d['transferir']) || $intencao === 'obito' || $intencao === 'falar_atendente' || ($limite > 0 && $respostas >= $limite);
    if ($novo && $enviar !== '' && msgBotTexto($pdo, 'auto_boas_vindas') !== '' && $intencao !== 'obito' && msgConfigTela($pdo, 'ia_saudacao', '1') !== '1') {
        msgBotEnviar($pdo, $conversaId, msgBotTexto($pdo, 'auto_boas_vindas'));
    }
    if ($transferir) {
        $prioridade = in_array($intencao, ['obito'], true) ? 1 : 0;
        $pdo->prepare("UPDATE chat_conversas SET setor_id = :s, bot_estado = 'ia_coleta', bot_tentativas = 0, prioridade = :p WHERE id = :id")
            ->execute([':s' => $setorId ?: null, ':p' => $prioridade, ':id' => $conversaId]);
        if ($enviar === '') {
            $enviar = 'Certo! Já vou te passar para um atendente.';
        }
        msgBotEnviar($pdo, $conversaId, $enviar);
        $nomeSetor = '';
        foreach ($setores as $s) {
            if ((int) $s['id'] === $setorId) {
                $nomeSetor = $s['nome'];
                $setor = $s;
            }
        }
        msgSistema($pdo, $conversaId, ($prioridade ? '⚠️ ' : '') . 'Aurora encaminhou para ' . ($nomeSetor ?: 'a fila geral') . ($prioridade ? ' — falecimento, prioridade' : ''));
        if (!empty($setor) && !$setor['aberto'] && $intencao !== 'obito') {
            msgBotDepoisDoSetor($pdo, $conversaId, $setor); // fora do horário: avisa o próximo horário
        }
        return true;
    }
    // conversa com a Aurora (dúvida respondida ou pedido para explicar melhor)
    $pdo->prepare("UPDATE chat_conversas SET bot_estado = 'ia', bot_tentativas = :t WHERE id = :id")->execute([':t' => $respostas + 1, ':id' => $conversaId]);
    if ($enviar !== '') {
        msgBotEnviar($pdo, $conversaId, $enviar);
    }
    return false;
}

/** Setores ativos (também os que não aparecem no menu), com a situação de agora. */
function carregarSetoresAtivos(PDO $pdo): array
{
    $saida = [];
    try {
        $lista = $pdo->query('SELECT * FROM chat_setores WHERE ativo = 1 ORDER BY ordem, nome')->fetchAll();
    } catch (PDOException $e) {
        return [];
    }
    $sh = $pdo->prepare('SELECT dia_semana, inicio, fim FROM chat_setor_horarios WHERE setor_id = :s');
    $se = $pdo->prepare('SELECT data, fechado, inicio, fim FROM chat_setor_excecoes WHERE setor_id = :s AND data BETWEEN CURDATE() AND CURDATE() + INTERVAL 8 DAY');
    foreach ($lista as $s) {
        $sh->execute([':s' => $s['id']]);
        $se->execute([':s' => $s['id']]);
        $situ = msgSituacaoSetor($s, $sh->fetchAll(), $se->fetchAll());
        $saida[] = array_merge($s, ['id' => (int) $s['id'], 'aberto' => (bool) $situ['aberto'], 'situacao' => (string) ($situ['texto'] ?? ''), 'descricao_ia' => (string) ($s['descricao_ia'] ?? '')]);
    }
    return $saida;
}


/** Instruções da consultora de vendas, com a tabela dos contratos e os valores já calculados para a família. */
function msgIaInstrucoesVenda(array $venda): string
{
    $origem = trim((string) ($venda['origem'] ?? ''));
    return "VENDAS DE PLANOS (você é consultora do PAI) — use quando a pessoa quer conhecer ou contratar um plano, ou veio de anúncio.\n"
        . "Objetivo: ajudar a família a escolher bem e FECHAR a adesão, com acolhimento e sem pressão.\n"
        . "1) Entenda a família, UMA pergunta por vez: para quem é (só a pessoa ou a família), quem incluir (cônjuge, filhos, pais ou sogros, outros parentes, pet), a idade da pessoa mais velha, se a família é de outra cidade ou estado (translado), o que é importante (tanatopraxia, telemedicina, urna luxo). Não cite valores antes de saber quem entra e a idade da pessoa mais velha.\n"
        . "   IDADE: a idade aproximada ou uma faixa basta (\"uns 70\", \"entre 75 e 80\"); diga isso ao perguntar. Nunca trate a data de nascimento como exigência: se perguntarem, diga que a data vai na ficha e a equipe confere tudo na adesão, sem problema se não souber agora.\n"
        . "   Quando só faltar um dado para calcular, diga que falta só essa informação. Ao confirmar quem entra, resuma em poucas palavras (ex.: \"Anotei as 8 pessoas.\"), sem repetir a lista toda.\n"
        . "2) Recomende UM plano e no máximo uma alternativa, dizendo o porquê em linguagem simples, usando os VALORES CALCULADOS abaixo (nunca faça contas você).\n"
        . "3) Tire dúvidas pela tabela. Carência: 90 dias para morte natural e 24 h para acidente. Pagamento por boleto, Pix ou na sede.\n"
        . "4) Quando a pessoa decidir (\"fechou\", \"quero contratar\", \"como faço pra contratar?\"), marque venda.decidiu=true e transferir=false — NUNCA passe para um atendente nesse momento: o sistema envia a ficha de adesão na hora. Na mensagem_cliente: confirme o plano e o valor em uma frase; se ainda não listou o que o plano cobre, liste as principais coberturas, um item por linha; e responda às dúvidas dela (documentos: os dados pessoais são preenchidos na ficha, fora do WhatsApp, e não precisa mandar foto de documento; pagamento: a adesão é paga por link, Pix ou boleto enviado pela equipe depois do cadastro). Diga que o cadastro é concluído pela equipe no próximo horário de atendimento. O sistema manda o link da ficha logo depois da sua mensagem: não escreva o link.\n"
        . "   Ao listar coberturas, use lista com um item por linha.\n"
        . "5) Depois que a ficha foi enviada, NÃO reenvie o link nem repita valores e adesão: responda só a dúvida nova. Se a pessoa disser que perdeu o link, diga que é o link enviado acima nesta conversa. Lembre uma vez só que ela não precisa repetir nenhum dado, pois a equipe continua de onde parou.\n"
        . "Não afirme regras que não estão na tabela (ex.: limite de idade para entrar no plano): diga que a equipe confirma esse ponto.\n"
        . "NUNCA peça CPF, RG, foto de documento ou dados de cartão (esses dados vão na ficha, fora do WhatsApp). Sem descontos e sem promessas fora da tabela. Se a pessoa não quiser, agradeça e encerre o assunto. Fora do horário, continue normalmente.\n"
        . "GRUPO BÁSICO (LIGHT, PLUS e MAX): titular, cônjuge, filhos solteiros e até 2 pessoas entre pai, mãe, sogro e sogra, sem custo. Normalmente são o pai e a mãe; se um deles já faleceu, o sogro ou a sogra ocupa a vaga. A partir da 3ª pessoa entre pais e sogros, e qualquer outro parente (irmão, neto, filho casado), conta como EXTRA. Ex.: casal + 2 filhos + a mãe = 0 extra.\n"
        . "Preencha venda com o que já foi dito (pessoas inclui o titular; extras = pessoas fora do grupo básico; no FLEX, extras = 0). intencao=plano_novo; transferir=false enquanto a conversa de venda estiver andando.\n"
        . ($origem !== '' ? "A pessoa veio do anúncio: {$origem}.\n" : '')
        . "TABELA (valores em vigor desde 08/10/2026; dependente extra = 20% da mensalidade):\n"
        . "- LIGHT: adesão R$ 50 · R$ 46/mês para o grupo básico (+R$ 9,20 por extra, até 2 extras) · urna e roupa semiluxo · translado até 200 km · sem tanatopraxia e sem telemedicina.\n"
        . "- FLEX: adesão R$ 50 · mensalidade pela idade da pessoa mais velha: R$ 48 (até 54), R$ 57 (55–64), R$ 69 (65–74), R$ 82 (75+) · titular + até 9 pessoas de qualquer parentesco com vínculo familiar · urna pet · semiluxo · translado até 500 km · aditivos: Tanatopraxia (+20%) e Translado Nacional \"De Volta pra Casa\" (R$ 30/mês) · telemedicina à parte.\n"
        . "- PLUS: adesão R$ 100 · R$ 110/mês para o grupo básico (2 extras sem custo, ex.: sogro e sogra; +R$ 22,00 por extra a partir do 3º) · urna e roupa luxo · translado até 1.000 km · tanatopraxia simples incluída · aditivo Translado Nacional (R$ 30/mês) · telemedicina à parte.\n"
        . "- MAX: adesão R$ 100 · R$ 150/mês para o grupo básico (2 extras sem custo, ex.: sogro e sogra; +R$ 30 por extra a partir do 3º) · luxo · translado terrestre para todo o Brasil, sem limite de km · tanatopraxia simples e telemedicina incluídas.\n"
        . "Todos: acessórios (cordão, véu, velas), kit lanche, coroa de flores, ornamentação, assistência de velório residencial, carro funerário e sala de velório; LIGHT e PLUS têm ambulância local; associados têm empréstimo de material ortopédico, descontos em consultas, Clube de Benefícios e sorteios mensais pelo app do associado.\n"
        . msgVendaComparar($venda);
}


/* ---------------------------------------------------------------------
 * Aprendizado (19/10/2026): cada pergunta de cliente atendida pela Aurora vira um registro com o assunto,
 * se a Base respondeu e se foi para um atendente. Alimenta "O que os clientes perguntam" no Monitoramento
 * e mostra o que falta escrever na Base de Conhecimento.
 * ------------------------------------------------------------------- */
function msgIaRegistrarPergunta(PDO $pdo, int $conversaId, array $d, string $texto, bool $coleta): void
{
    if (msgEmTeste()) {
        return; // simulador: não entra nas perguntas frequentes
    }
    if ($coleta || in_array($d['intencao'] ?? '', ['saudacao'], true) || trim($texto) === '') {
        return;
    }
    try {
        static $tabela = false;
        if (!$tabela) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS chat_ia_perguntas (
                          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                          conversa_id BIGINT UNSIGNED NOT NULL,
                          intencao VARCHAR(30) NOT NULL,
                          assunto VARCHAR(120) NOT NULL,
                          pergunta VARCHAR(500) NOT NULL,
                          respondida_base TINYINT NOT NULL DEFAULT 0,
                          transferida TINYINT NOT NULL DEFAULT 0,
                          setor_id INT NULL,
                          criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                          KEY ix_chat_ia_perg_data (criado_em),
                          KEY ix_chat_ia_perg_assunto (assunto)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            $tabela = true;
        }
        // sem dados pessoais: números longos (CPF, telefone, contrato) saem do texto guardado
        $limpo = preg_replace('/\d[\d.\-\/ ]{6,}\d/u', '[número]', mb_substr(trim($texto), 0, 500));
        $assunto = mb_strtolower(trim(preg_replace('/\s+/u', ' ', (string) ($d['assunto'] ?? '')))) ?: (string) ($d['intencao'] ?? 'outro');
        $pdo->prepare('INSERT INTO chat_ia_perguntas (conversa_id, intencao, assunto, pergunta, respondida_base, transferida, setor_id) VALUES (:c, :i, :a, :p, :b, :t, :s)')
            ->execute([':c' => $conversaId, ':i' => mb_substr((string) ($d['intencao'] ?? 'outro'), 0, 30), ':a' => mb_substr($assunto, 0, 120), ':p' => $limpo,
                ':b' => !empty($d['respondido_pela_base']) ? 1 : 0, ':t' => !empty($d['transferir']) ? 1 : 0, ':s' => (int) ($d['setor_id'] ?? 0) ?: null]);
    } catch (Throwable $e) {
        error_log('[messenger] Aurora: registrar pergunta: ' . $e->getMessage());
    }
}


/**
 * Quantas respostas a Aurora dá antes de passar a um atendente, por tipo de conversa (0 = sem limite):
 *  geral   — dúvidas e outros assuntos (padrão 3; 0 = sem limite)
 *  vendas  — consultora de planos, até a decisão (padrão 16)
 *  pedidos — pedido de coroa e cobrança de mensalidade (padrão 10)
 *  funeral — mensagens enquanto a família espera o plantão assumir (padrão 14)
 *  espera  — demais conversas já encaminhadas, enquanto esperam o atendente (padrão 2)
 */
function msgIaLimites(PDO $pdo): array
{
    $v = fn($k, $p, $max) => max(0, min($max, (int) msgConfigTela($pdo, $k, (string) $p)));
    return ['geral' => $v('ia_limite', 3, 40), 'vendas' => $v('ia_limite_vendas', 16, 40), 'pedidos' => $v('ia_limite_pedidos', 10, 30),
        'funeral' => $v('ia_limite_funeral', 14, 40), 'espera' => $v('ia_limite_espera', 2, 10)];
}


/* ---------------------------------------------------------------------
 * Confirmação do contrato pela Aurora (22/10/2026)
 * Quem quer pagar e ainda não tem o telefone ligado a um contrato informa: número do contrato, data de nascimento do
 * titular e os 3 últimos dígitos do CPF do titular (ou os 4 últimos do telefone do cadastro). O servidor confere com a
 * Unymos. Confere → liga o telefone ao contrato (pode pagar) e segue a cobrança. Não confere em 2 tentativas, ou o
 * cadastro não tem o que comparar → passa ao financeiro com uma nota (pode ser cadastro desatualizado).
 * Proteção: no máximo 3 tentativas erradas por contrato por dia (somando todas as conversas).
 * Estado guardado em chat_config (sem tabela nova): ia_conf_<conversa> e ia_conf_ct_<contrato>; some sozinho em 1 dia.
 * ------------------------------------------------------------------- */

function msgIaConfLer(PDO $pdo, string $chave): array
{
    $st = $pdo->prepare('SELECT valor FROM chat_config WHERE chave = :k AND atualizado_em > NOW() - INTERVAL 1 DAY');
    $st->execute([':k' => $chave]);
    return json_decode((string) $st->fetchColumn(), true) ?: [];
}

function msgIaConfGravar(PDO $pdo, string $chave, array $valor): void
{
    $v = json_encode($valor, JSON_UNESCAPED_UNICODE);
    $pdo->prepare('INSERT INTO chat_config (chave, valor) VALUES (:k, :v) ON DUPLICATE KEY UPDATE valor = :v2, atualizado_em = NOW()')
        ->execute([':k' => $chave, ':v' => $v, ':v2' => $v]);
}

function msgIaConfEstado(PDO $pdo, int $conversaId): array
{
    $e = msgIaConfLer($pdo, 'ia_conf_' . $conversaId);
    return ['ativo' => !empty($e['ativo']), 'tentativas' => (int) ($e['tentativas'] ?? 0), 'ultimo' => (string) ($e['ultimo'] ?? '')];
}

function msgIaConfSalvar(PDO $pdo, int $conversaId, array $estado): void
{
    msgIaConfGravar($pdo, 'ia_conf_' . $conversaId, $estado);
}

function msgIaConfApagar(PDO $pdo, int $conversaId): void
{
    try {
        $pdo->prepare('DELETE FROM chat_config WHERE chave = :k')->execute([':k' => 'ia_conf_' . $conversaId]);
        // limpeza: estados antigos de outras conversas e contratos
        $pdo->exec("DELETE FROM chat_config WHERE chave LIKE 'ia\\_conf\\_%' AND atualizado_em < NOW() - INTERVAL 2 DAY");
    } catch (PDOException $e) {
        // segue
    }
}

/**
 * Confere o que a Aurora colheu. Retorna null enquanto faltar dado (a Aurora segue perguntando) ou
 * ['mensagem' => texto para o cliente, 'transferir' => bool].
 */
function msgIaConfProcessar(PDO $pdo, array $c, array $estado, array $cf): ?array
{
    $conversaId = (int) $c['id'];
    $numero = ltrim(preg_replace('/\D/', '', (string) ($cf['contrato'] ?? '')), '0');
    $nasc = msgUnyData((string) ($cf['nascimento'] ?? ''));
    $cpf3 = preg_replace('/\D/', '', (string) ($cf['cpf_final'] ?? ''));
    $fone4 = preg_replace('/\D/', '', (string) ($cf['fone_final'] ?? ''));
    if ($numero === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $nasc) || (strlen($cpf3) !== 3 && strlen($fone4) !== 4)) {
        return null;
    }
    $assinatura = md5($numero . '|' . $nasc . '|' . $cpf3 . '|' . $fone4);
    if ($assinatura === $estado['ultimo']) {
        return null; // os mesmos dados já foram conferidos (a Aurora só está repetindo o que já foi dito)
    }
    $passar = function (string $nota, string $msg) use ($pdo, $conversaId): array {
        msgSistema($pdo, $conversaId, $nota);
        msgIaConfApagar($pdo, $conversaId);
        return ['mensagem' => $msg, 'transferir' => true];
    };
    $chaveCt = 'ia_conf_ct_' . mb_substr($numero, 0, 40);
    $ct = msgIaConfLer($pdo, $chaveCt);
    if ((int) ($ct['erros'] ?? 0) >= 3) {
        return $passar('⚠️ Aurora: o contrato ' . $numero . ' já teve 3 confirmações de dados erradas hoje. Confira com o cliente antes de passar valores.',
            "Não consegui confirmar os dados por aqui.\n\nVou te passar para o financeiro, que confere com você. A resposta vem aqui mesmo nesta conversa.");
    }
    try {
        $k = msgUnyContrato($pdo, $numero);
    } catch (Throwable $e) {
        error_log('[messenger] Aurora confirmação: ' . $e->getMessage());
        return $passar('Aurora: não consegui consultar a Unymos para confirmar o contrato ' . $numero . '.',
            "Não consegui consultar o cadastro agora.\n\nVou te passar para o financeiro, que confere com você. A resposta vem aqui mesmo nesta conversa.");
    }
    if ($k && ltrim(preg_replace('/\D/', '', (string) $k['contrato']), '0') !== $numero) {
        $k = null; // a Unymos devolveu outro contrato: não serve
    }
    $resultado = $k ? msgUnyConferirDados($k, $nasc, $cpf3, $fone4) : 'nao_confere';
    if ($resultado === 'sem_dados') {
        return $passar('Aurora: o cadastro do contrato ' . $numero . ' não tem data de nascimento do titular, CPF ou telefone para conferir. Confirme com o cliente.',
            "Para sua segurança, preciso que uma pessoa da equipe confirme o seu cadastro.\n\nVou te passar para o financeiro. A resposta vem aqui mesmo nesta conversa.");
    }
    if ($resultado === 'ok') {
        msgUnyGravarVinculo($pdo, (int) $c['contato_externo_id'], $k, 'outro', true, null);
        msgSistema($pdo, $conversaId, '🔐 Contrato ' . $k['contrato'] . ' ligado a este telefone pela Aurora: a pessoa confirmou a data de nascimento e os dígitos do cadastro');
        msgIaConfApagar($pdo, $conversaId);
        $f = msgUnyFinanceiro($k['contas']);
        $brl = fn($x) => 'R$ ' . number_format((float) $x, 2, ',', '.');
        if (!$f['lote']) {
            return ['mensagem' => "Obrigada! Confirmei o contrato {$k['contrato']}.\n\nNão há mensalidade em aberto: está tudo em dia. 😊", 'transferir' => false];
        }
        $n = count($f['lote']);
        return ['mensagem' => "Obrigada! Confirmei o contrato {$k['contrato']}.\n\nO valor para pagar agora é *" . $brl($f['total_lote']) . '* (' . $n . ' mensalidade' . ($n > 1 ? 's' : '') . ").\n\nVocê prefere receber o link (Pix ou cartão) ou o Pix copia e cola?", 'transferir' => false];
    }
    // não conferiu (ou o contrato não foi encontrado: a mensagem é a mesma, para não revelar se o número existe)
    msgIaConfGravar($pdo, $chaveCt, ['erros' => (int) ($ct['erros'] ?? 0) + 1]);
    $tentativas = $estado['tentativas'] + 1;
    if ($tentativas >= 2) {
        return $passar('⚠️ Aurora: os dados informados não conferiram com o cadastro do contrato ' . $numero . ' (2 tentativas). Pode ser cadastro desatualizado: confira com o cliente.',
            "Não consegui confirmar os dados por aqui.\n\nVou te passar para o financeiro, que confere com você. A resposta vem aqui mesmo nesta conversa.");
    }
    msgIaConfSalvar($pdo, $conversaId, ['ativo' => true, 'tentativas' => $tentativas, 'ultimo' => $assinatura]);
    return ['mensagem' => "Esses dados não conferiram com o cadastro.\n\nPode conferir o número do contrato, a data de nascimento do titular e os dígitos e me mandar de novo?", 'transferir' => false];
}
