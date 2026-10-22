<?php
/**
 * messenger_testes.php — testes da Aurora (21/10/2026). Carregado pelo messenger_nucleo.php (não é endereço público).
 *
 *  Simulador: alguém da equipe escreve como cliente; a mensagem segue o MESMO caminho do webhook (Aurora, setores,
 *  etiquetas, notas, orçamento, coroa, proposta), mas nada sai para a Meta, ninguém é avisado, nada vai para a fila,
 *  para o estoque, para a Unymos ou para as perguntas frequentes. A conversa é apagada ao reiniciar.
 *  Cenários: o Claude (API da Anthropic, chave anthropic_api_key no pai-chaves.php) faz o papel do cliente, conversa com
 *  a Aurora pelo simulador e depois avalia a conversa pelas regras do PAI. O resultado fica em chat_ia_testes.
 */

const TESTE_ANTHROPIC = 'https://api.anthropic.com/v1/messages';

function msgEmTeste(): bool
{
    return !empty($GLOBALS['msg_em_teste']);
}

/** Sessão de teste: contato e conversa próprios (marcados como teste). */
function msgTesteSessao(PDO $pdo, int $uid, string $sessao, string $nome = 'Cliente de teste'): array
{
    $sessao = preg_replace('/[^a-z0-9]/', '', strtolower($sessao)) ?: 'manual';
    $wa = 'teste' . $uid . $sessao;
    $st = $pdo->prepare('SELECT id FROM chat_contatos_externos WHERE wa_id = :w');
    $st->execute([':w' => $wa]);
    $contatoId = (int) $st->fetchColumn();
    if (!$contatoId) {
        $pdo->prepare("INSERT INTO chat_contatos_externos (canal, wa_id, telefone_e164, nome) VALUES ('whatsapp', :w, NULL, :n)")->execute([':w' => $wa, ':n' => mb_substr($nome, 0, 100)]);
        $contatoId = (int) $pdo->lastInsertId();
    }
    $sc = $pdo->prepare('SELECT id FROM chat_conversas WHERE contato_externo_id = :c');
    $sc->execute([':c' => $contatoId]);
    $conversaId = (int) $sc->fetchColumn();
    if (!$conversaId) {
        $pdo->prepare("INSERT INTO chat_conversas (tipo, canal, contato_externo_id, teste) VALUES ('externo', 'whatsapp', :c, 1)")->execute([':c' => $contatoId]);
        $conversaId = (int) $pdo->lastInsertId();
    }
    return ['contato_id' => $contatoId, 'conversa_id' => $conversaId, 'sessao' => $sessao];
}

/** Apaga tudo da sessão de teste (mensagens, atendimentos, vínculos, conversa e contato). */
function msgTesteApagar(PDO $pdo, int $contatoId): void
{
    $sc = $pdo->prepare('SELECT id FROM chat_conversas WHERE contato_externo_id = :c AND teste = 1');
    $sc->execute([':c' => $contatoId]);
    foreach ($sc->fetchAll(PDO::FETCH_COLUMN) as $cid) {
        foreach (['DELETE FROM chat_conversa_etiquetas WHERE conversa_id = :c', 'DELETE FROM chat_mensagens WHERE conversa_id = :c', 'DELETE FROM chat_atendimentos WHERE conversa_id = :c',
            'DELETE FROM chat_participantes WHERE conversa_id = :c', 'DELETE FROM chat_orcamentos_ia WHERE conversa_id = :c', 'DELETE FROM chat_conversas WHERE id = :c'] as $sql) {
            try {
                $pdo->prepare($sql)->execute([':c' => $cid]);
            } catch (PDOException $e) {
                // tabela opcional ainda não criada
            }
        }
    }
    $pdo->prepare('DELETE FROM chat_contato_contratos WHERE contato_id = :c')->execute([':c' => $contatoId]);
    $pdo->prepare('DELETE FROM chat_contatos_externos WHERE id = :c AND wa_id LIKE "teste%"')->execute([':c' => $contatoId]);
}

/** Sessões de teste esquecidas há mais de 1 dia somem sozinhas. */
function msgTesteLimpezaAntiga(PDO $pdo): void
{
    try {
        $st = $pdo->query("SELECT ce.id FROM chat_contatos_externos ce INNER JOIN chat_conversas c ON c.contato_externo_id = ce.id
                            WHERE c.teste = 1 AND COALESCE(c.ultima_mensagem_em, c.criado_em) < NOW() - INTERVAL 1 DAY LIMIT 20");
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) {
            msgTesteApagar($pdo, (int) $id);
        }
    } catch (Throwable $e) {
        // segue
    }
}

/**
 * Mensagem do "cliente" no simulador. $extras: contrato (vincula a sessão a um contrato real, só leitura),
 * anuncio (como se viesse de um anúncio). Retorna as mensagens novas da conversa (respostas da Aurora, notas, avisos).
 */
function msgTesteEnviar(PDO $pdo, array $sessao, string $texto, array $extras = []): array
{
    $GLOBALS['msg_em_teste'] = true;
    $conversaId = $sessao['conversa_id'];
    $c = msgConversa($pdo, $conversaId);
    $novo = false;
    if (!$c['atendimento_atual_id'] || in_array($c['status_atendimento'], [null, 'encerrado'], true)) {
        msgNovoAtendimento($pdo, $conversaId);
        $novo = true;
    }
    if (!empty($extras['contrato']) && $novo) {
        $pdo->prepare('INSERT IGNORE INTO chat_contato_contratos (contato_id, id_contrato, contrato, titular_nome, titular_cpf, plano, relacao, pode_pagar, criado_por)
                       VALUES (:c, 0, :n, :t, :cpf, :p, "titular", 1, NULL)')
            ->execute([':c' => $sessao['contato_id'], ':n' => mb_substr((string) $extras['contrato'], 0, 40), ':t' => (string) ($extras['titular'] ?? 'Titular de teste'),
                ':cpf' => (string) ($extras['cpf'] ?? ''), ':p' => (string) ($extras['plano'] ?? '')]);
    }
    if (!empty($extras['anuncio'])) {
        $pdo->prepare("UPDATE chat_conversas SET ia_venda_json = :j WHERE id = :id AND (ia_venda_json IS NULL OR ia_venda_json = '')")
            ->execute([':j' => json_encode(['origem' => (string) $extras['anuncio']], JSON_UNESCAPED_UNICODE), ':id' => $conversaId]);
    }
    $ultimo = (int) $pdo->query('SELECT COALESCE(MAX(id), 0) FROM chat_mensagens WHERE conversa_id = ' . $conversaId)->fetchColumn();
    $c = msgConversa($pdo, $conversaId);
    $mensagemId = msgGravar($pdo, $conversaId, ['atendimento_id' => (int) $c['atendimento_atual_id'], 'autor_tipo' => 'contato', 'autor_contato_id' => $sessao['contato_id'], 'tipo' => 'texto', 'texto' => mb_substr($texto, 0, 4000)]);
    $pdo->prepare('UPDATE chat_conversas SET janela_ate = NOW() + INTERVAL 1 DAY, ultima_mensagem_id = :m, ultima_mensagem_em = NOW() WHERE id = :id')->execute([':m' => $mensagemId, ':id' => $conversaId]);
    try {
        msgBotAoChegar($pdo, $conversaId, $novo, $texto, 'texto', '', $mensagemId);
    } catch (Throwable $e) {
        error_log('[messenger] simulador: ' . $e->getMessage());
    }
    // as tarefas "depois da resposta" (avisos em tempo real) rodam quando a requisição termina, como no WhatsApp;
    // chamar msgRodarTarefasDepois() aqui fecharia a resposta antes do resultado (a tela recebia vazio).
    // O modo teste fica ligado até o fim desta requisição.
    $st = $pdo->prepare('SELECT id FROM chat_mensagens WHERE conversa_id = :c AND id > :u ORDER BY id');
    $st->execute([':c' => $conversaId, ':u' => $ultimo]);
    return array_values(array_filter(array_map(fn($id) => msgMensagemPorId($pdo, (int) $id), $st->fetchAll(PDO::FETCH_COLUMN))));
}

/** Conversa da sessão em texto (para o Claude e para o relatório). */
function msgTesteTranscricao(PDO $pdo, int $conversaId): array
{
    $st = $pdo->prepare('SELECT autor_tipo, tipo, texto, interna FROM chat_mensagens WHERE conversa_id = :c AND apagada_em IS NULL ORDER BY id');
    $st->execute([':c' => $conversaId]);
    $saida = [];
    foreach ($st->fetchAll() as $m) {
        $quem = $m['autor_tipo'] === 'contato' ? 'cliente' : (!empty($m['interna']) ? 'nota' : ($m['tipo'] === 'sistema' ? 'sistema' : 'aurora'));
        $saida[] = ['quem' => $quem, 'texto' => (string) $m['texto']];
    }
    return $saida;
}

/* ===================== Cenários com o Claude ===================== */

/** Cenários padrão. Cada um: quem é o cliente, o que quer, e as regras específicas para a avaliação. */
function msgTesteCenarios(?PDO $pdo = null): array
{
    return ($pdo ? msgAprCenariosAtivos($pdo) : []) + [
        'falecimento_hospital' => ['titulo' => 'Filha comunica o falecimento do pai no hospital', 'max' => 6,
            'persona' => 'Você é Joana, 42 anos, acabou de perder o pai (Manoel da Silva, 71 anos) no Hospital do Oeste, em Barreiras. Está abalada, escreve frases curtas e às vezes com erros. Não sabe se ele era associado. Responda o que a Aurora perguntar, uma coisa por vez.',
            'regras' => 'Condolências só na primeira mensagem (sem repetir "sinto muito"). Chamar o falecido pelo nome ("Manoel") ou pelo parentesco ("seu pai" é correto); proibido "seu/dona/senhor" antes do nome. Mostrar que a equipe já foi avisada e vai orientar os próximos passos, sem dizer que a remoção ou o velório já estão sendo feitos. Orientar sobre a declaração de óbito no hospital. Nunca dizer que a funerária faz o registro no cartório. Orientar quais documentos LEVAR ao cartório (documentos de quem faleceu e de quem declara, comprovante de endereço, certidão de casamento, bens e nome dos filhos) é CORRETO e não é pedir documento; errado é pedir que envie pelo WhatsApp. Se a família perguntar o tempo de espera, acolher e reforçar a prioridade, sem inventar prazo. Passar ao atendimento funerário com prioridade.'],
        'falecimento_crianca' => ['titulo' => 'Mãe comunica o falecimento de um bebê', 'max' => 5,
            'persona' => 'Você é Carla, mãe do Miguel, um bebê de 8 meses que faleceu hoje em casa. Escreve pouco e está em choque. Responda com poucas palavras.',
            'regras' => 'Máxima delicadeza. Nunca usar "seu/senhor" antes do nome nem termos de adulto para o bebê. Chamar pelo nome (Miguel) ou pelo parentesco ("seu bebê", "seu filho" é correto). Orientar a chamar médico ou SAMU para constatar o óbito em casa. Condolências uma vez só. Nada de jargões.'],
        'lead_anuncio_flex' => ['titulo' => 'Lead do anúncio quer plano para a família', 'max' => 9, 'anuncio' => 'Plano FLEX a partir de R$ 48',
            'persona' => 'Você é Rogério, 45 anos, viu um anúncio no Instagram. Quer um plano para você, a esposa (43), dois filhos (15 e 12) e a mãe (68). A família é de Barreiras. Pergunta o preço e se tem carência. Se gostar, decide contratar.',
            'regras' => 'Agir como consultora: entender a família uma pergunta por vez, recomendar um plano e no máximo uma alternativa, com os valores certos da tabela (FLEX pela idade da pessoa mais velha: R$ 69 para 65 a 74 anos; LIGHT R$ 46 para esta família, pois a mãe entra no grupo básico). Fatos corretos da tabela (não são invenção): o FLEX aceita o titular + até 9 pessoas (10 no total); no LIGHT, PLUS e MAX até 2 pessoas entre pai, mãe, sogro e sogra entram sem custo. Explicar a carência (90 dias; 24 h acidente). Não pedir CPF, RG ou documento. Ao decidir, enviar a ficha de adesão uma vez só.'],
        'associado_pagamento' => ['titulo' => 'Associado quer pagar a mensalidade', 'max' => 5, 'contrato' => '',
            'persona' => 'Você é Nilva, associada do PAI. Quer pagar a mensalidade pelo WhatsApp e prefere Pix. Escreve de forma simples.',
            'regras' => 'Informar o valor em aberto e oferecer link ou Pix; só gerar depois da escolha. Não pedir CPF nem dados de cartão. Desconto e acordo vão para o financeiro.'],
        'coroa_velorio' => ['titulo' => 'Amigo quer mandar coroa para um velório', 'max' => 8,
            'persona' => 'Você é Paulo, amigo de uma família. Quer mandar uma coroa de flores para o velório de hoje. Não sabe o nome do modelo; aceita ver as opções pela conversa. A faixa deve dizer "Com carinho, família Oliveira".',
            'regras' => 'Ser solícita: oferecer ver modelos ou comprar pelo site, com o link sozinho na linha. Listar só coroas, uma por linha. Pedir a faixa, o velório e quem envia, mostrar o resumo (com o velório) e pedir confirmação. Nunca prometer horário de entrega; com pressa do cliente, reconhecer a urgência e dizer que a equipe confirma o horário com prioridade, sem repetir a mesma frase.'],
        'saudacao' => ['titulo' => 'Cliente só cumprimenta', 'max' => 3,
            'persona' => 'Você manda só "bom dia" e espera. Depois pergunta o endereço do Memorial.',
            'regras' => 'Apresentar-se como Aurora de forma calorosa, sem menu numerado, e perguntar como ajudar. Responder o endereço pela Base (Av. Antônio Carlos Magalhães, 3348, Flamengo).'],
        'fora_da_base' => ['titulo' => 'Pergunta que a Base não responde', 'max' => 3,
            'persona' => 'Você pergunta se o PAI faz cremação de animais de estimação e quanto custa.',
            'regras' => 'Não inventar resposta nem preço. Dizer que vai passar para um atendente.'],
        'reclamacao' => ['titulo' => 'Cliente insatisfeito reclama', 'max' => 3,
            'persona' => 'Você está bravo porque o atendimento de ontem atrasou e quer reclamar com alguém.',
            'regras' => 'Tom calmo e respeitoso, sem discutir. Passar na hora para uma pessoa.'],
    ];
}

function msgTesteClaude(string $sistema, string $usuario, int $max = 700): ?string
{
    $chave = trim((string) msgConfig('anthropic_api_key', ''));
    if ($chave === '') {
        throw new RuntimeException('Falta a chave anthropic_api_key no pai-chaves.php.');
    }
    $r = msgHttp('POST', TESTE_ANTHROPIC, ['Content-Type: application/json', 'x-api-key: ' . $chave, 'anthropic-version: 2023-06-01'],
        json_encode(['model' => (string) msgConfig('anthropic_model', 'claude-sonnet-5-5'), 'max_tokens' => $max, 'system' => $sistema,
            'messages' => [['role' => 'user', 'content' => $usuario]]], JSON_UNESCAPED_UNICODE), 60);
    $j = json_decode((string) ($r['corpo'] ?? ''), true);
    if ((int) ($r['status'] ?? 0) !== 200) {
        throw new RuntimeException('Claude: HTTP ' . ($r['status'] ?? 0) . ' ' . mb_substr((string) ($j['error']['message'] ?? ''), 0, 200));
    }
    $t = '';
    foreach ((array) ($j['content'] ?? []) as $b) {
        $t .= ($b['type'] ?? '') === 'text' ? (string) $b['text'] : '';
    }
    return trim($t);
}

function msgTesteJson(string $t): ?array
{
    $t = trim(preg_replace('/^```(json)?|```$/m', '', $t));
    $i = strpos($t, '{');
    $f = strrpos($t, '}');
    if ($i === false || $f === false) {
        return null;
    }
    $j = substr($t, $i, $f - $i + 1);
    $d = json_decode($j, true);
    if (!is_array($d)) {
        $d = json_decode(preg_replace('/[\x00-\x1F]/u', ' ', $j), true); // quebras de linha cruas dentro dos textos
    }
    return is_array($d) ? $d : null;
}

/** Um passo do cenário: o Claude escreve a próxima mensagem do cliente e a Aurora responde. */
function msgTestePasso(PDO $pdo, int $uid, string $cenarioId, string $sessaoId): array
{
    $cen = msgTesteCenarios($pdo)[$cenarioId] ?? null;
    if (!$cen) {
        throw new RuntimeException('Cenário não encontrado.');
    }
    $sessao = msgTesteSessao($pdo, $uid, $sessaoId, 'Teste · ' . $cen['titulo']);
    $conversa = msgTesteTranscricao($pdo, $sessao['conversa_id']);
    $turnos = count(array_filter($conversa, fn($m) => $m['quem'] === 'cliente'));
    if ($turnos >= (int) $cen['max']) {
        return ['fim' => true, 'conversa' => $conversa];
    }
    $texto = implode("\n", array_map(fn($m) => strtoupper($m['quem']) . ': ' . $m['texto'], array_filter($conversa, fn($m) => in_array($m['quem'], ['cliente', 'aurora'], true))));
    $resp = msgTesteJson((string) msgTesteClaude(
        "Você está testando a Aurora, assistente virtual de uma funerária e plano funerário (Plano PAI, Barreiras-BA), fazendo o papel de um cliente real no WhatsApp. {$cen['persona']}\nEscreva como um cliente comum escreveria no WhatsApp (curto, natural, às vezes informal). Não revele que é um teste. Responda SÓ em JSON: {\"mensagem\": \"...\", \"encerrar\": false}. Use encerrar=true quando o seu objetivo foi atendido, quando a Aurora passou você para um atendente, ou quando a conversa não tem mais o que avançar.",
        $texto !== '' ? "CONVERSA ATÉ AGORA:\n{$texto}\n\nQual é a sua próxima mensagem?" : 'Comece a conversa.', 300));
    if (!$resp || !empty($resp['encerrar']) || trim((string) ($resp['mensagem'] ?? '')) === '') {
        return ['fim' => true, 'conversa' => $conversa];
    }
    $extras = [];
    if (!empty($cen['anuncio']) && $turnos === 0) {
        $extras['anuncio'] = $cen['anuncio'];
    }
    $cenCobranca = array_key_exists('contrato', $cen)
        || preg_match('/mensalidade|parcela|em aberto|segunda via|2.? via/iu', ($cen['titulo'] ?? '') . ' ' . ($cen['persona'] ?? ''));
    if ($cenCobranca && $turnos === 0) {
        $cfg = trim((string) msgConfigTela($pdo, 'teste_contrato', ''));
        if ($cfg === '') {
            throw new RuntimeException('Para este cenário, preencha o "Contrato usado nos testes de cobrança" em Configurações do Messenger › Mensagens automáticas.');
        }
        $extras['contrato'] = $cfg;
    }
    msgTesteEnviar($pdo, $sessao, (string) $resp['mensagem'], $extras);
    return ['fim' => false, 'conversa' => msgTesteTranscricao($pdo, $sessao['conversa_id'])];
}

/** Avalia o cenário pelas regras do PAI, guarda o resultado e apaga a conversa de teste. */
function msgTesteAvaliar(PDO $pdo, int $uid, string $cenarioId, string $sessaoId, string $rodada): array
{
    $cen = msgTesteCenarios($pdo)[$cenarioId] ?? null;
    $sessao = msgTesteSessao($pdo, $uid, $sessaoId);
    $conversa = msgTesteTranscricao($pdo, $sessao['conversa_id']);
    $texto = implode("\n", array_map(fn($m) => strtoupper($m['quem']) . ': ' . $m['texto'], $conversa));
    $gerais = 'Regras gerais da Aurora: frases curtas e simples; não repetir a mesma ideia em mensagens seguidas; formato para celular (parágrafos curtos, listas um item por linha, link sozinho na linha); respeito com a família e com quem faleceu (nunca: defunto, cadáver, caixão, morto, "corpo"); tratamento do falecido: PERMITIDO o parentesco ("seu pai", "sua mãe", "seu filho") e o nome sozinho ("Manoel"); PROIBIDO "seu", "dona", "senhor(a)" antes do NOME ("seu Manoel"); nunca pedir CPF, RG, documento ou cartão pelo WhatsApp (orientar o que levar ao cartório não é pedir documento; na cobrança de quem não tem o telefone ligado ao contrato, pedir a data de nascimento do titular e só os 3 últimos dígitos do CPF ou os 4 do telefone, para confirmar o cadastro, é o procedimento do PAI); nunca inventar valores, coberturas ou prazos; falecimento, reclamação, cancelamento e pedido de atendente vão para uma pessoa.';
    $avaliar = fn() => msgTesteJson((string) msgTesteClaude(
        "Você avalia o atendimento da Aurora (assistente virtual do Plano PAI, funerária) com rigor e imparcialidade. {$gerais}\nRegras deste cenário: " . ($cen['regras'] ?? '') . "\nAs linhas NOTA e SISTEMA são internas (só a equipe vê): use-as para entender o que o sistema fez, mas avalie o que o CLIENTE leu (linhas AURORA).\nResponda SÓ com o JSON, sem texto antes ou depois: {\"nota\": 0-10, \"aprovado\": true|false, \"pontos_fortes\": [\"...\"], \"falhas\": [{\"regra\": \"...\", \"trecho\": \"citação curta da Aurora\", \"sugestao\": \"...\"}], \"resumo\": \"1 a 2 frases\"}. Seja objetivo: no máximo 3 pontos fortes e 4 falhas, trechos com até 20 palavras. Aprovado só com nota 8 ou mais e nenhuma falha grave (respeito, documento, valor inventado, deixar de passar para uma pessoa).",
        "CENÁRIO: " . ($cen['titulo'] ?? $cenarioId) . "\n\nCONVERSA:\n{$texto}", 2500));
    $av = $avaliar() ?: $avaliar(); // uma segunda tentativa se a resposta vier cortada ou fora do formato
    if (!$av) {
        $av = ['nota' => null, 'aprovado' => null, 'falhas' => [], 'resumo' => 'O Claude não devolveu a avaliação no formato certo (tente rodar este cenário de novo).'];
    }
    $pdo->prepare('INSERT INTO chat_ia_testes (rodada, cenario, titulo, conversa_json, avaliacao_json, nota, aprovado, criado_por) VALUES (:r, :c, :t, :cv, :a, :n, :ap, :u)')
        ->execute([':r' => $rodada, ':c' => $cenarioId, ':t' => $cen['titulo'] ?? $cenarioId, ':cv' => json_encode($conversa, JSON_UNESCAPED_UNICODE), ':a' => json_encode($av, JSON_UNESCAPED_UNICODE),
            ':n' => isset($av['nota']) ? max(0, min(10, (int) $av['nota'])) : null, ':ap' => isset($av['aprovado']) ? ($av['aprovado'] ? 1 : 0) : null, ':u' => $uid]);
    msgTesteApagar($pdo, $sessao['contato_id']);
    return ['avaliacao' => $av, 'conversa' => $conversa];
}
