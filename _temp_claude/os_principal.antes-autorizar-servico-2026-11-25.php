<?php
/**
 * os_principal.php — Endpoints da Ordem de Serviço digital (revisão 2)
 * PAI – Plano Assistencial Integrado
 *
 * ESTADO: referência ainda NÃO implantada. Convenção do app: um flag `?acao=1` por ação; resposta no envelope
 * { sucesso, dados, meta?, msg, erro }.
 *
 * SEGURANÇA
 *  - Todas as ações (menos o webhook) exigem usuário autenticado. O app deve definir, antes deste arquivo ser
 *    carregado (ex.: no include comum de sessão), a função  autenticarUsuarioPAI(): ?array  →  ['id'=>int,'cargo'=>string].
 *    Sem ela → 401, exceto com 'modo_teste' => true no os_config.php (aceita usuario_id/usuario_cargo no request).
 *  - Cargos (os_config.php): financeiro = 'cargos_financeiro'; reabrir = 'cargos_reabrir'; estorno e diagnóstico = 'cargo_admin'.
 *  - Webhook: exige ?segredo=... igual ao 'webhook_segredo' do os_config.php (vazio = webhook desligado, 503).
 *    Quando o provedor for definido, troque/complemente por HMAC do corpo conforme a documentação dele.
 *  - Erros inesperados NÃO devolvem mensagem interna ao cliente (vai para o error_log), salvo em modo_teste.
 *
 * Ações:
 *   ?listar=1&os_id=        OS + itens + nota promissória (CPF mascarado)
 *   ?adicionar_item=1       tipo, atendimento_id|coroa_pedido_id, convenio, categoria, produto_id, quantidade, [adicional=1], [frase_faixa — OS de coroa: uma coroa por chamada]
 *   ?remover_item=1         os_item_id
 *   ?editar_valor_item=1    os_item_id, valor (unitário, >= tabela; acréscimo livre) ou valor_km (translado). Item e quantidade não mudam
 *   ?aplicar_desconto=1     os_item_id, valor_desconto (R$ no total do item; 0 tira). Desconto de item só em R$
 *   ?aplicar_desconto_global=1  os_id, percentual OU valor_desconto (R$) — calculado depois dos descontos dos itens
 *                           Limite: todos os descontos juntos até 8% do valor com acréscimos; Gestão/Financeiro passam
 *   ?lancar_coroa_prefeitura=1  coroa_pedido_id — pedido de coroa avulso autorizado pela Prefeitura: OS Prf (+ Dif.Prf)
 *   ?itens_os=1             os_id — itens para a tela (Qtd, Valor, Desconto, Final) + resumo dos descontos
 *   ?convenio_pacotes_classificacao=1 (convenio_id) | ?convenio_pacote_classificar=1 (pacote_id, tipo=ATENDIMENTO|PRODUTO) |
 *   ?convenio_pacotes_ordenar=1 (convenio_id, ids=[...]) — tipo e ordem dos pacotes do convênio
 *   ?confirmar_os=1         os_id  (obrigatório antes de assinar OS Particular; qualquer alteração posterior desfaz)
 *   ?documentos_listar=1    os_id  (a folha da OS; a nota promissória já vem dentro dela)
 *   ?documento_os=1         os_id, formato=visualizar|impressao|pdf|png
 *   ?assinar=1              assinatura SIMPLES: os_id, nome_responsavel, [cpf_responsavel], arquivo_assinatura, [pagamento_valor, pagamento_forma, pagamento_data]  (o saldo vira a nota promissória à vista)
 *   ?iniciar_assinatura_plataforma=1   (provedor ainda em definição — falha com mensagem clara se não configurado)
 *   ?webhook_assinatura=1&segredo=     chamado pelo provedor
 *   ?fechar_corpo_pronto=1  atendimento_id
 *   ?reabrir=1              os_id, motivo (Financeiro) — invalida assinatura e nota promissória
 *   Financeiro: ?financeiro_criar_proposta=1 | ?financeiro_registrar_pagamento=1 | ?financeiro_anexar_comprovante=1 |
 *               ?financeiro_cancelar_proposta=1 | ?financeiro_estornar_pagamento=1 (admin) | ?financeiro_listar=1
 *   Revisão 6: ?adicionar_translado=1 (atendimento_id, convenio, origem, destino, km, [autorizado_prefeitura=1|0]) | ?definir_contrato=1 (os_id, contrato_numero, [contrato_titular], [aditivos=TRANSLADO,TANATOPRAXIA])
 *               adicionar_item: categoria TANATOPRAXIA em convênio segue plano/aditivo (Associado) ou autorizado_prefeitura (Prefeitura)
 *               ?composicao_contrato_os=1 (os_id) — Financeiro: pacote(s) e serviços de contrato da OS da Prefeitura, com os itens usados
 *               ?linha_do_tempo=1 (os_id) | ?minhas_os=1 (filtros; só as OS do próprio agente) | ?minhas_pendencias=1 (situação de hoje, só as do agente) | ?financeiro_painel=1 (data_inicio, data_fim, agente_id, tipo, convenio)
 *               ?financeiro_relatorio=1 (mesmos filtros; relatorio=bonus|completo|prefeitura|socio|coroas|pendencias; formato=json|csv|visualizar|pdf só no bonus) | ?financeiro_devolver_np=1 | ?financeiro_devolver_credito=1
 *               ?converter_prefeitura=1 (admin: os_id, convenio, tanatopraxia_autorizada, translado_autorizado, motivo, [simular=1])
 *               Prefeitura: ?convenio_pacote_salvar=1 (convenio, nome, valor, itens JSON) | ?convenio_pacotes_listar=1 | ?lancar_atendimento_prefeitura=1 (atendimento_id, convenio, escolhas JSON, tanatopraxia_*, translado_*)
 *               ?montar_os_atendimento=1 (atendimento_id, [plano, contrato_numero, contrato_titular]) — monta/atualiza as OS a partir das etapas do atendimento
 *               Atendimento: ?sincronizar_os_atendimento=1 (= montar_os_atendimento) — o app chama ao salvar cada etapa Sim/Não do atendimento
 *               ?dados_os_atendimento=1 (atendimento_id) — lê os campos novos da OS no atendimento
 *               ?salvar_dados_os_atendimento=1 (atendimento_id + convenio_os, contrato_numero, tanato_produto_id, tanato_autorizado_prefeitura,
 *                  translado, translado_origem, translado_destino, translado_km, translado_autorizado_prefeitura) — grava SÓ essas colunas
 *               ?os_do_atendimento=1 (atendimento_id) — OS já montadas (só leitura; sem o valor do contrato da Prefeitura para agentes)
 *               ?tanato_modelos=1 — modelos do campo "Tipo de procedimento"
 *               Registro do atendimento ligado ao cadastro de Convênios: ?convenios_opcoes=1 — convênios ativos e pacotes ativos de cada um (campo Convênio, escolha do pacote)
 *                 ?previa_os_atendimento=1 (rascunho = JSON do que está na tela) — prévia da OS em tempo real: o que o pacote cobre e o que vai para a diferença da família. NÃO grava nada
 *               Convênios (tabela convenios do convenio.php): ?convenios_listar=1 | ?convenio_os_definir=1 (convenio_id, tipo, [codigo_numero], [aditivos])
 *               Rotina de convênios: ?convenio_regras_listar=1 | ?convenio_regra_definir=1 (convenio, chave, valor|ilimitado, [vigente_desde]) | ?convenio_pacote_definir=1 (convenio, categoria, produto_id, [valor_contrato]) · aplicar_desconto(_global) aceita valor_desconto (R$)
 *   ?diagnostico=1          leitura pura do schema (admin ou modo_teste)
 */

// CORS e cabeçalhos: mesmo bloco do convenio.php (configuração atual do sistema).
header('Content-Type: application/json; charset=utf-8');

$allowedOrigins = [
    'https://app.planoassistencialintegrado.com.br',
    'https://pai.planoassistencialintegrado.com.br',
    'https://planoassistencialintegrado.com.br',
    'https://club.planoassistencialintegrado.com.br',
    'https://www.planoassistencialintegrado.com.br',
];

$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');

if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header_remove('Access-Control-Allow-Origin');
    header_remove('Access-Control-Allow-Credentials');
    header_remove('Access-Control-Allow-Methods');
    header_remove('Access-Control-Allow-Headers');
    header_remove('Access-Control-Max-Age');

    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization, Cache-Control, Pragma, Expires');
    header('Access-Control-Max-Age: 86400');
    header('Vary: Origin');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    if ($origin === '' || !in_array($origin, $allowedOrigins, true)) {
        http_response_code(403);
        exit;
    }
    http_response_code(204);
    exit;
}

header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

date_default_timezone_set(getenv('PAI_TIMEZONE') ?: 'America/Sao_Paulo');

// Erro fatal do PHP vira JSON (em vez de 500 vazio), para dar para ver a causa na aba Network.
register_shutdown_function(function () {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('[os_principal] fatal: ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['sucesso' => false, 'erro' => true, 'dados' => null,
                          'msg' => 'Erro interno no servidor (PHP): ' . preg_replace('#/[^\s:]*/#', '', (string) $e['message']) . ' — ' . basename((string) $e['file']) . ':' . $e['line']],
                         JSON_UNESCAPED_UNICODE);
    }
});

// Arquivos do módulo que precisam estar na mesma pasta.
foreach (['os_regras.php', 'os_documentos.php', 'os_logo.php'] as $arquivoOS) {
    if (!is_file(__DIR__ . '/' . $arquivoOS)) {
        http_response_code(500);
        echo json_encode(['sucesso' => false, 'erro' => true, 'dados' => null, 'msg' => "Arquivo do módulo de OS ausente no servidor: {$arquivoOS} (subir na mesma pasta do os_principal.php)."], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

require_once __DIR__ . '/os_regras.php';
// Operações isoladas de consulta funerária (sem alterar a API de relatórios).
require_once __DIR__ . '/pai_tanato_integracao.php';
require_once __DIR__ . '/os_documentos.php';
// Login e permissões do sistema (mesma sessão do convenio.php; páginas do pai_api.php). Em modo_teste não é carregado.
if (!modoTeste() && is_file(__DIR__ . '/os_auth_pai.php')) {
    require_once __DIR__ . '/os_auth_pai.php';
}

function responder(bool $sucesso, $dados = null, ?string $msg = null, ?array $meta = null, int $status = 200): void {
    http_response_code($status);
    $corpo = ['sucesso' => $sucesso, 'dados' => $dados, 'msg' => $msg ?? '', 'erro' => !$sucesso];
    if ($meta !== null) {
        $corpo['meta'] = $meta;
    }
    echo json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}
function ok($dados = null, ?string $msg = null, ?array $meta = null): void { responder(true, $dados, $msg, $meta, 200); }
function erro(string $mensagem, int $status = 400): void { responder(false, null, $mensagem, null, $status); }

function acaoRequisitada(array $flags): ?string {
    foreach ($flags as $flag) {
        if (($_REQUEST[$flag] ?? '') == '1') {
            return $flag;
        }
    }
    return null;
}

/** Pagamento informado na assinatura (opcional): pagamento_valor, pagamento_forma, pagamento_data. Sem valor = nada pago no ato. */
/** autorizado_prefeitura = 1/0 (Prefeitura autorizou tanatopraxia/translado?). Ausente = null (a regra exige quando for Prefeitura). */
function lerAutorizacaoPrefeitura(): ?bool {
    return isset($_REQUEST['autorizado_prefeitura']) && $_REQUEST['autorizado_prefeitura'] !== '' ? ((string) $_REQUEST['autorizado_prefeitura'] === '1') : null;
}

function lerPagamentoNoAto(): ?array {
    $v = $_REQUEST['pagamento_valor'] ?? null;
    if ($v === null || $v === '') {
        return null;
    }
    if (!is_numeric($v)) {
        throw new RegraNegocioException('pagamento_valor inválido.');
    }
    return ['valor' => (float) $v, 'forma' => $_REQUEST['pagamento_forma'] ?? null, 'data' => $_REQUEST['pagamento_data'] ?? null];
}

/**
 * Regra do registro do atendimento (definida no informativo.php, 07/10/2026): no Corpo Pronto (fase12) e nas etapas
 * seguintes (fase07 a fase11) os itens ficam travados; só a Gestão (página gestao) e o administrador alteram.
 * Aqui vale para o que este arquivo grava da tanatopraxia: tipo de procedimento e reconstituição facial.
 * O resto do salvar_dados_os_atendimento (convênio, pacote, autorizações, translado, local do velório) não tem trava.
 */
function exigirTravaCorpoProntoOS(PDO $pdo, array $usuario, int $atendimentoId, array $entrada): void {
    $campos = array_values(array_filter(['tanato_produto_id', 'reconstituicao_facial'], fn($c) => array_key_exists($c, $entrada)));
    if (!$campos) {
        return;
    }
    $cargo = strtolower((string) ($usuario['cargo'] ?? ''));
    if (cargoEhAdmin($cargo) || in_array($cargo, ['adm', 'admin', 'administrador', 'gestao', 'gestão'], true)
        || in_array('gestao', (array) ($usuario['paginas'] ?? []), true)) {
        return;
    }
    $st = $pdo->prepare('SELECT * FROM `sepultamentos` WHERE `id` = :id LIMIT 1');
    $st->execute(['id' => $atendimentoId]);
    $at = $st->fetch(PDO::FETCH_ASSOC) ?: null;
    if (!$at || strtolower(trim((string) ($at['tipo_atendimento'] ?? ''))) === 'terceiro') {
        return;
    }
    $fase = preg_match('/^fase(\d+)$/i', trim((string) ($at['status'] ?? '')), $m) ? (int) $m[1] : 0;
    if ($fase < 7) {
        return;
    }
    $norm = fn($v) => strtoupper(trim((string) ($v ?? '')));
    foreach ($campos as $c) {
        $novo = $norm($entrada[$c]);
        $antes = $norm($at[$c] ?? '');
        if ($c === 'tanato_produto_id') {
            $novo = (string) (int) $novo;
            $antes = (string) (int) $antes;
        }
        if ($novo !== $antes) {
            throw new RegraNegocioException('Itens travados após o Corpo Pronto (a baixa no estoque já foi feita). Não é possível alterar a tanatopraxia. Só a Gestão pode alterar.', 409);
        }
    }
}

$FLAGS = [
    'listar', 'minhas_pendencias', 'adicionar_item', 'remover_item', 'editar_valor_item', 'confirmar_os', 'documentos_listar', 'documento_os', 'adicionar_translado', 'definir_contrato', 'linha_do_tempo', 'minhas_os', 'financeiro_painel', 'financeiro_relatorio', 'financeiro_devolver_np', 'financeiro_devolver_credito', 'converter_prefeitura', 'convenio_regras_listar', 'convenio_regra_definir', 'convenio_pacote_definir', 'convenio_pacote_salvar', 'convenio_pacotes_listar', 'convenios_listar', 'convenio_os_definir', 'sincronizar_os_atendimento', 'lancar_atendimento_prefeitura', 'montar_os_atendimento', 'salvar_dados_os_atendimento', 'dados_os_atendimento', 'tanato_modelos', 'os_do_atendimento', 'aplicar_desconto', 'aplicar_desconto_global', 'itens_os', 'assinar',
    'iniciar_assinatura_plataforma', 'webhook_assinatura', 'fechar_corpo_pronto', 'reabrir',
    'financeiro_criar_proposta', 'financeiro_registrar_pagamento', 'financeiro_fechar_os', 'financeiro_anexar_comprovante',
    'financeiro_cancelar_proposta', 'financeiro_estornar_pagamento', 'financeiro_listar', 'diagnostico', 'convenios_opcoes', 'previa_os_atendimento',
    'convenio_pacotes_classificacao', 'convenio_pacote_classificar', 'convenio_pacotes_ordenar', 'lancar_coroa_prefeitura',
    'pai_assoc_buscar', 'pai_assoc_beneficiarios',
    'composicao_contrato_os', 'concluir', 'os_da_coroa',
];
$acao = acaoRequisitada($FLAGS);

// 23/10/2026 (segurança): ações que ALTERAM a OS (itens, valores, descontos, financeiro, fechar, reabrir...) não podem
// vir de um link aberto no navegador (WhatsApp, e-mail) nem de outro site: o navegador marca esses pedidos com
// Sec-Fetch-Mode "navigate" ou Sec-Fetch-Site "cross-site". As telas do app chamam por fetch e não são afetadas;
// consultas (listar, documento_os, relatórios) continuam abrindo por link normalmente.
$OS_ACOES_ESCRITA = ['adicionar_item', 'remover_item', 'editar_valor_item', 'confirmar_os', 'adicionar_translado', 'definir_contrato',
    'financeiro_devolver_np', 'financeiro_devolver_credito', 'converter_prefeitura', 'convenio_regra_definir', 'convenio_pacote_definir',
    'convenio_pacote_salvar', 'convenio_os_definir', 'sincronizar_os_atendimento', 'lancar_atendimento_prefeitura', 'montar_os_atendimento',
    'salvar_dados_os_atendimento', 'aplicar_desconto', 'aplicar_desconto_global', 'itens_os', 'assinar', 'iniciar_assinatura_plataforma',
    'fechar_corpo_pronto', 'reabrir', 'financeiro_criar_proposta', 'financeiro_registrar_pagamento', 'financeiro_fechar_os',
    'financeiro_anexar_comprovante', 'financeiro_cancelar_proposta', 'financeiro_estornar_pagamento', 'convenio_pacote_classificar',
    'convenio_pacotes_ordenar', 'lancar_coroa_prefeitura', 'concluir', 'os_da_coroa'];
if (in_array($acao, $OS_ACOES_ESCRITA, true)) {
    $sfModo = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_MODE'] ?? ''));
    $sfSite = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
    $sfDest = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_DEST'] ?? ''));
    if ($sfModo === 'navigate' || $sfSite === 'cross-site'
        || in_array($sfDest, ['document', 'iframe', 'frame', 'image', 'object', 'embed'], true)) {
        erro('Ação não permitida por link. Use a tela do sistema.', 403);
    }
}

/**
 * Comprovante de pagamento da conclusão (09/10/2026): mesmo padrão da página de coroas — arquivo (sem Base64), foto ou PDF,
 * até 15 MB. Grava em uploads/comprovantes/ e devolve o caminho público (registrado em os_financeiro_comprovantes).
 */
function salvarComprovanteOS(int $osId, array $arquivo): string {
    if ((int) ($arquivo['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) ($arquivo['tmp_name'] ?? ''))) {
        throw new RegraNegocioException('Não foi possível receber a foto do comprovante. Tente de novo.', 400);
    }
    if ((int) $arquivo['size'] > 15 * 1024 * 1024) {
        throw new RegraNegocioException('O comprovante deve ter no máximo 15 MB.', 400);
    }
    $mime = (string) (function_exists('mime_content_type') ? mime_content_type($arquivo['tmp_name']) : ($arquivo['type'] ?? ''));
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/heic' => 'heic', 'image/heif' => 'heif', 'application/pdf' => 'pdf'][$mime] ?? null;
    if ($ext === null) {
        throw new RegraNegocioException('O comprovante deve ser uma foto (JPG, PNG, WEBP, HEIC) ou PDF.', 400);
    }
    $dir = __DIR__ . '/uploads/comprovantes/';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('Pasta de comprovantes não pôde ser criada.');
    }
    $nome = 'os_' . $osId . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    if (!@move_uploaded_file($arquivo['tmp_name'], $dir . $nome)) {
        throw new RuntimeException('Falha ao salvar o comprovante.');
    }
    return '/uploads/comprovantes/' . $nome;
}

/** Grava a assinatura em tela (PNG em base64) em uploads/assinaturas/ e devolve o caminho público. */
function salvarImagemAssinaturaOS(int $osId, string $base64): string {
    if (strpos($base64, 'data:image') === 0) {
        $base64 = substr($base64, strpos($base64, ',') + 1);
    }
    $bin = base64_decode(str_replace(' ', '+', $base64), true);
    if ($bin === false || strncmp($bin, "\x89PNG", 4) !== 0) {
        throw new RegraNegocioException('Assinatura inválida (esperado PNG).', 400);
    }
    if (strlen($bin) > 2000000) {
        throw new RegraNegocioException('Imagem da assinatura grande demais.', 400);
    }
    $dir = __DIR__ . '/uploads/assinaturas/';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('Pasta de assinaturas não pôde ser criada.');
    }
    $nome = 'os_' . $osId . '_' . time() . '_' . bin2hex(random_bytes(3)) . '.png';
    if (@file_put_contents($dir . $nome, $bin) === false) {
        throw new RuntimeException('Falha ao salvar o arquivo da assinatura.');
    }
    return '/uploads/assinaturas/' . $nome;
}

try {
    if ($acao === null) {
        erro('Nenhuma ação reconhecida na query (use um dos flags=1 listados no cabeçalho deste arquivo).', 404);
    }

    // ---- Webhook: autenticado por segredo, não por usuário ----
    if ($acao === 'webhook_assinatura') {
        $segredo = (string) osConfig('webhook_segredo', '');
        if ($segredo === '') {
            erro('Webhook desativado (webhook_segredo não configurado).', 503);
        }
        if (!hash_equals($segredo, (string) ($_REQUEST['segredo'] ?? ''))) {
            erro('Não autorizado.', 401);
        }
        $pdo = conectarBanco();
        $payloadBruto = file_get_contents('php://input') ?: '';
        $dados = json_decode($payloadBruto, true);
        try {
            if (!is_array($dados)) {
                throw new RegraNegocioException('Payload não é JSON.', 400);
            }
            $n = normalizarWebhookAssinatura($dados);
        } catch (RegraNegocioException $e) {
            registrarLogWebhook($pdo, null, null, 'NAO_RECONHECIDO', $payloadBruto ?: '(vazio)', false, $e->getMessage());
            erro($e->getMessage(), 400);
        }
        $resultado = confirmarAssinaturaPorWebhook($pdo, $n['envelope_id'], $n['status'], $n['documento_url'], $payloadBruto);
        // Envelope desconhecido/duplicado: 200 para o provedor não reenviar indefinidamente (fica registrado no log).
        ok(['resultado' => $resultado], 'Webhook processado: ' . $resultado);
    }

    // ---- Demais ações: usuário autenticado ----
    $usuario = usuarioAutenticado();
    if ($usuario === null) {
        erro('Não autenticado.', 401);
    }
    $pdo = conectarBanco();
    $cargosFinanceiro = (array) osConfig('cargos_financeiro', ['adm', 'financeiro']);

    // Login do sistema: ações da OS no atendimento exigem a página "atendimento"; consulta da folha/linha do tempo aceita
    // também quem tem a página do financeiro. (Financeiro e convênios são checados em cada ação.)
    if (array_key_exists('paginas', $usuario)) {
        // Valor, desconto e confirmação também para quem tem a página do Financeiro (alterar valores das OS lançadas).
        // 23/10/2026: concluir (venda com pagamentos) e financeiro_listar também exigem Atendimento ou Financeiro.
        $acoesValor = ['editar_valor_item', 'aplicar_desconto', 'aplicar_desconto_global', 'confirmar_os', 'itens_os', 'concluir', 'financeiro_listar'];
        if (in_array($acao, $acoesValor, true) && !temPagina($usuario, 'atendimento') && !temPagina($usuario, 'financeiro')) {
            erro('Sem permissão para alterar valores da OS.', 403);
        }
        $acoesAtendimento = ['pai_assoc_buscar', 'pai_assoc_beneficiarios', 'adicionar_item', 'remover_item', 'assinar',
            'iniciar_assinatura_plataforma', 'adicionar_translado', 'definir_contrato', 'minhas_os', 'minhas_pendencias', 'montar_os_atendimento', 'sincronizar_os_atendimento',
            'lancar_atendimento_prefeitura', 'fechar_corpo_pronto', 'salvar_dados_os_atendimento', 'dados_os_atendimento', 'tanato_modelos', 'os_do_atendimento', 'previa_os_atendimento'];
        // Convênios e pacotes para os campos do app: registro do atendimento e pedido de coroa (tela Coroa de Flores)
        if ($acao === 'convenios_opcoes' && !temPagina($usuario, 'atendimento') && !temPagina($usuario, 'coroa-de-flores')) {
            erro('Sem permissão para esta operação.', 403);
        }
        $acoesConsulta = ['listar', 'documentos_listar', 'documento_os', 'linha_do_tempo'];
        if (in_array($acao, $acoesAtendimento, true) && !temPagina($usuario, 'atendimento')) {
            erro('Sem permissão para esta operação (página "' . paginaDaArea('atendimento') . '").', 403);
        }
        if (in_array($acao, $acoesConsulta, true) && !temPagina($usuario, 'atendimento') && !temPagina($usuario, 'financeiro')) {
            erro('Sem permissão para consultar OS.', 403);
        }
    }

    switch ($acao) {
        // Consultas dedicadas ao atendimento funerário; somente leitura.
        case 'pai_assoc_buscar': {
            try { ok(paiAssocBuscar((string) ($_REQUEST['busca'] ?? ''))); }
            catch (InvalidArgumentException $e) { erro($e->getMessage(), 422); }
            catch (Throwable $e) { error_log('[pai_assoc_buscar] '.$e->getMessage()); erro('Falha ao consultar Associados. Consulte o log do servidor.', 503); }
        }
        case 'pai_assoc_beneficiarios': {
            try { ok(paiAssocBeneficiarios((string) ($_REQUEST['contrato'] ?? ''))); }
            catch (InvalidArgumentException $e) { erro($e->getMessage(), 422); }
            catch (Throwable $e) { error_log('[pai_assoc_beneficiarios] '.$e->getMessage()); erro('Não foi possível confirmar os beneficiários e a cobertura. Consulte o log do servidor.', 503); }
        }


        case 'adicionar_item': {
            $convenio = $_REQUEST['convenio'] ?? '';
            $categoria = $_REQUEST['categoria'] ?? '';
            $produtoId = (int) ($_REQUEST['produto_id'] ?? 0);
            if (!$convenio || !$categoria || !$produtoId) {
                erro('Parâmetros obrigatórios: convenio, categoria, produto_id.');
            }
            exigirAcessoReferencia($pdo, $usuario, $_REQUEST['tipo'] ?? 'ATENDIMENTO', isset($_REQUEST['atendimento_id']) ? (int) $_REQUEST['atendimento_id'] : null,
                isset($_REQUEST['coroa_pedido_id']) ? (int) $_REQUEST['coroa_pedido_id'] : null);
            $resultado = adicionarItemComparandoPadrao(
                $pdo,
                $_REQUEST['tipo'] ?? 'ATENDIMENTO',
                isset($_REQUEST['atendimento_id']) ? (int) $_REQUEST['atendimento_id'] : null,
                isset($_REQUEST['coroa_pedido_id']) ? (int) $_REQUEST['coroa_pedido_id'] : null,
                $convenio, $categoria, $produtoId, (int) ($_REQUEST['quantidade'] ?? 1), $usuario['id'],
                ($_REQUEST['adicional'] ?? '') == '1',
                isset($_REQUEST['frase_faixa']) ? (string) $_REQUEST['frase_faixa'] : null,
                lerAutorizacaoPrefeitura()
            );
            // Associado: o contrato do titular pode vir junto (o front busca no cadastro de associados).
            if (!empty($_REQUEST['contrato_numero']) && $resultado['os_convenio'] && strpos(strtoupper($convenio), 'ASSOCIADO') === 0) {
                $resultado['os_convenio'] = definirContratoAssociado($pdo, (int) $resultado['os_convenio']['id'], (string) $_REQUEST['contrato_numero'], $_REQUEST['contrato_titular'] ?? null, $usuario['id'], $_REQUEST['aditivos'] ?? null);
            }
            ok($resultado);
        }

        case 'adicionar_translado': {
            $at = (int) ($_REQUEST['atendimento_id'] ?? 0);
            if (!$at || !isset($_REQUEST['km'])) {
                erro('Parâmetros obrigatórios: atendimento_id, convenio, origem, destino, km.');
            }
            exigirAcessoReferencia($pdo, $usuario, 'ATENDIMENTO', $at, null);
            ok(adicionarTranslado($pdo, $at, (string) ($_REQUEST['convenio'] ?? 'PARTICULAR'), (string) ($_REQUEST['origem'] ?? ''), (string) ($_REQUEST['destino'] ?? ''),
                (float) str_replace(',', '.', (string) $_REQUEST['km']), $usuario['id'], lerAutorizacaoPrefeitura()), 'Translado lançado.');
        }

        case 'definir_contrato': {
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            ok(definirContratoAssociado($pdo, $osId, (string) ($_REQUEST['contrato_numero'] ?? ''), $_REQUEST['contrato_titular'] ?? null, $usuario['id'], $_REQUEST['aditivos'] ?? null), 'Contrato do titular registrado.');
        }

        case 'linha_do_tempo': {
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            ok(linhaDoTempo($pdo, $osId));
        }

        case 'minhas_os': {   // o agente acompanha as OS que ele abriu (sempre só as próprias)
            ok(painelFinanceiro($pdo, ['agente_id' => $usuario['id']] + $_REQUEST, ['id' => $usuario['id'], 'cargo' => '__agente__']));
        }

        case 'minhas_pendencias': {   // Relatório Pendências em Minhas OS (19/10/2026): só as do agente, situação de hoje
            ok(relatorioPendencias($pdo, ['agente_id' => $usuario['id']], ['id' => $usuario['id'], 'cargo' => '__agente__']));
        }

        case 'convenio_regras_listar': {
            exigirArea($usuario, 'convenios', (array) osConfig('cargos_regras_convenio', ['adm', 'financeiro']));
            ok(listarRegrasConvenio($pdo, $_REQUEST['convenio'] ?? null));
        }

        case 'convenio_regra_definir': {   // rotina: novo valor de regra/preço do convênio (o anterior fica no histórico)
            exigirArea($usuario, 'convenios', (array) osConfig('cargos_regras_convenio', ['adm', 'financeiro']));
            $v = trim((string) ($_REQUEST['valor'] ?? ''));
            $valor = ($v === '' || strtolower($v) === 'ilimitado') ? null : (float) str_replace(',', '.', $v);
            ok(definirRegraConvenio($pdo, (string) ($_REQUEST['convenio'] ?? ''), (string) ($_REQUEST['chave'] ?? ''), $valor, $_REQUEST['vigente_desde'] ?? null, $_REQUEST['observacao'] ?? null, $usuario['id']), 'Regra do convênio registrada.');
        }

        case 'convenio_pacote_definir': {  // rotina: item do pacote padrão (produto e valor de contrato da Prefeitura)
            exigirArea($usuario, 'convenios', (array) osConfig('cargos_regras_convenio', ['adm', 'financeiro']));
            $vc = trim((string) ($_REQUEST['valor_contrato'] ?? ''));
            ok(definirPacotePadrao($pdo, (string) ($_REQUEST['convenio'] ?? ''), (string) ($_REQUEST['categoria'] ?? ''), (int) ($_REQUEST['produto_id'] ?? 0), $vc === '' ? null : (float) str_replace(',', '.', $vc)), 'Pacote do convênio atualizado.');
        }

        case 'convenio_pacote_salvar': {   // rotina: nova versão do pacote da Prefeitura (valor fechado + itens inclusos)
            exigirArea($usuario, 'convenios', (array) osConfig('cargos_regras_convenio', ['adm', 'financeiro']));
            $itens = json_decode((string) ($_REQUEST['itens'] ?? ''), true);
            if (!is_array($itens)) {
                erro('itens deve ser um JSON: [{"categoria":"URNA","produto_id":176,"valor_item":550}, ...]');
            }
            ok(salvarPacoteConvenio($pdo, (string) ($_REQUEST['convenio'] ?? ''), (string) ($_REQUEST['nome'] ?? ''), (float) str_replace(',', '.', (string) ($_REQUEST['valor'] ?? '0')),
                $itens, $_REQUEST['vigente_desde'] ?? null, $_REQUEST['observacao'] ?? null, $usuario['id']), 'Pacote do convênio salvo.');
        }

        case 'convenio_pacotes_listar': {
            ok(listarPacotesConvenio($pdo, (string) ($_REQUEST['convenio'] ?? '')));
        }

        case 'lancar_atendimento_prefeitura': {   // lança o pacote inteiro: o agente só escolhe os modelos e informa tanatopraxia/translado
            $at = (int) ($_REQUEST['atendimento_id'] ?? 0);
            if (!$at || empty($_REQUEST['convenio'])) {
                erro('Parâmetros obrigatórios: atendimento_id, convenio.');
            }
            exigirAcessoReferencia($pdo, $usuario, 'ATENDIMENTO', $at, null);
            $escolhas = json_decode((string) ($_REQUEST['escolhas'] ?? '{}'), true) ?: [];
            $escolhas = array_change_key_case(array_map('intval', $escolhas), CASE_UPPER);
            $tanato = !empty($_REQUEST['tanatopraxia_produto_id'])
                ? ['produto_id' => (int) $_REQUEST['tanatopraxia_produto_id'], 'autorizado' => ($_REQUEST['tanatopraxia_autorizada'] ?? '') === '1', 'categoria' => $_REQUEST['tanatopraxia_categoria'] ?? 'TANATOPRAXIA'] : null;
            $transl = isset($_REQUEST['translado_km']) && $_REQUEST['translado_km'] !== ''
                ? ['origem' => $_REQUEST['translado_origem'] ?? '', 'destino' => $_REQUEST['translado_destino'] ?? '', 'km' => (float) str_replace(',', '.', (string) $_REQUEST['translado_km']),
                   'autorizado' => ($_REQUEST['translado_autorizado'] ?? '') === '1'] : null;
            ok(lancarAtendimentoPrefeitura($pdo, $at, (string) $_REQUEST['convenio'], $escolhas, $tanato, $transl, $usuario['id']), 'Pacote da Prefeitura lançado.');
        }

        case 'dados_os_atendimento': {   // preenche a tela "Editar registro" com os campos da OS
            $at = (int) ($_REQUEST['atendimento_id'] ?? 0);
            if (!$at) {
                erro('Parâmetro obrigatório: atendimento_id.');
            }
            exigirAcessoReferencia($pdo, $usuario, 'ATENDIMENTO', $at, null);
            ok(lerDadosOSAtendimento($pdo, $at));
        }

        case 'salvar_dados_os_atendimento': {   // grava só as colunas novas da OS (lista fechada); depois o app chama sincronizar_os_atendimento
            $at = (int) ($_REQUEST['atendimento_id'] ?? 0);
            if (!$at) {
                erro('Parâmetro obrigatório: atendimento_id.');
            }
            exigirTravaCorpoProntoOS($pdo, $usuario, $at, $_REQUEST);   // mesma regra do informativo.php (tanatopraxia travada no Corpo Pronto)
            ok(salvarDadosOSAtendimento($pdo, $at, $_REQUEST), 'Dados da OS salvos no atendimento.');
        }

        case 'os_do_atendimento': {   // OS já montadas (só leitura): resumo e folha na tela "Editar registro"
            $at = (int) ($_REQUEST['atendimento_id'] ?? 0);
            if (!$at) {
                erro('Parâmetro obrigatório: atendimento_id.');
            }
            exigirAcessoReferencia($pdo, $usuario, 'ATENDIMENTO', $at, null);
            $r = osDoAtendimento($pdo, $at, $usuario['cargo'] ?? null);
            $dadosAt = carregarAtendimento($pdo, $at);   // nome e CPF do responsável: já preenchidos na janela de assinatura
            $r['responsavel'] = ['nome' => trim((string) ($dadosAt['nome_responsavel'] ?? '')), 'cpf' => trim((string) ($dadosAt['cpf_responsavel'] ?? ''))];
            ok($r);
        }

        case 'tanato_modelos': {   // opções do campo "Tipo de procedimento"
            ok(['modelos' => listarModelosTanatopraxia($pdo)]);
        }

        case 'sincronizar_os_atendimento':   // nome sugerido para o app (mesma função)
        case 'montar_os_atendimento': {   // chamado pelo app ao salvar as etapas do atendimento
            $at = (int) ($_REQUEST['atendimento_id'] ?? 0);
            if (!$at) {
                erro('Parâmetro obrigatório: atendimento_id.');
            }
            exigirAcessoReferencia($pdo, $usuario, 'ATENDIMENTO', $at, null);
            $montada = montarOSDoAtendimento($pdo, $at, $usuario['id'], $_REQUEST['plano'] ?? null, $_REQUEST['contrato_numero'] ?? null, $_REQUEST['contrato_titular'] ?? null);
            $montada['os_convenio'] = ocultarContratoPrefeitura($montada['os_convenio'] ?? null, $usuario['cargo'] ?? null);
            try { require_once __DIR__ . '/ct_base.php'; ctObitoDoAtendimento($pdo, $at); } catch (Throwable $e) { error_log('ct_obito: ' . $e->getMessage()); }   // 23/11/2026 falecimento ligado ao atendimento: sugestão para Contratos; falha não impede a OS
            ok($montada, 'OS montada a partir do atendimento.');
        }

        case 'convenios_opcoes': {   // registro do atendimento: convênios ativos e seus pacotes ativos (sem valor de contrato para o agente)
            ok(opcoesConveniosAtendimento($pdo, in_array((string) ($usuario['cargo'] ?? ''), array_map('strval', (array) osConfig('cargos_ver_todas_os', ['adm', 'financeiro'])), true)));
        }

        case 'previa_os_atendimento': {   // prévia da OS em tempo real, a partir do rascunho do registro. Só calcula; nada é gravado.
            $rascunho = json_decode((string) ($_REQUEST['rascunho'] ?? ''), true);
            if (!is_array($rascunho)) {
                erro('Parâmetro obrigatório: rascunho (JSON).');
            }
            ok(previaOSAtendimento($pdo, $rascunho, in_array((string) ($usuario['cargo'] ?? ''), array_map('strval', (array) osConfig('cargos_ver_todas_os', ['adm', 'financeiro'])), true)));
        }

        case 'convenios_listar': {
            ok(listarConvenios($pdo));
        }

        case 'convenio_os_definir': {   // tela de convênios → "Dados da OS": tipo, 3 letras do número (Prefeitura), aditivos (plano)
            exigirArea($usuario, 'convenios', (array) osConfig('cargos_regras_convenio', ['adm', 'financeiro']));
            ok(definirConvenioOS($pdo, (int) ($_REQUEST['convenio_id'] ?? 0), (string) ($_REQUEST['tipo'] ?? ''), $_REQUEST['codigo_numero'] ?? null, $_REQUEST['aditivos'] ?? null),
                'Dados da OS do convênio salvos.');
        }

        case 'financeiro_painel': {
            exigirArea($usuario, 'financeiro', $cargosFinanceiro);
            ok(painelFinanceiro($pdo, $_REQUEST, $usuario));
        }

        case 'financeiro_relatorio': {
            exigirArea($usuario, 'financeiro', $cargosFinanceiro);
            // Relatórios da OS (16/10/2026): relatorio = bonus (padrão, o de antes) | completo | prefeitura | socio.
            // Os novos saem só em JSON: a tela imprime, gera o PDF (pela impressão) e a planilha.
            $qual = strtolower(trim((string) ($_REQUEST['relatorio'] ?? 'bonus')));
            $formato = (string) ($_REQUEST['formato'] ?? 'json');
            if ($qual !== 'bonus') {
                if ($formato !== 'json') {
                    erro('Este relatório sai em formato=json (a tela imprime e exporta).');
                }
                $fn = ['completo' => 'relatorioParticularCompleto', 'prefeitura' => 'relatorioPrestacaoPrefeitura', 'socio' => 'relatorioAcompanhamentoSocio',
                       'coroas' => 'relatorioCoroas', 'pendencias' => 'relatorioPendencias'][$qual] ?? null;
                if ($fn === null) {
                    erro('relatorio inválido — use bonus, completo, prefeitura, socio, coroas ou pendencias.');
                }
                ok($fn($pdo, $_REQUEST, $usuario));
            }
            $rel = relatorioAtendimentos($pdo, $_REQUEST, $usuario);
            if ($formato === 'json') {
                ok($rel);
            }
            $doc = entregarRelatorio($rel, $formato);
            header('Content-Type: ' . $doc['mime']);
            header('Content-Disposition: ' . ($formato === 'visualizar' ? 'inline' : 'attachment') . '; filename="' . $doc['arquivo'] . '"');
            echo $doc['corpo'];
            exit;
        }

        case 'financeiro_devolver_np': {
            exigirArea($usuario, 'financeiro', $cargosFinanceiro);
            ok(registrarDevolucaoNP($pdo, (int) ($_REQUEST['os_id'] ?? 0), $_REQUEST['observacao'] ?? null, $usuario['id']), 'Devolução da nota promissória registrada.');
        }

        case 'financeiro_devolver_credito': {
            exigirArea($usuario, 'financeiro', $cargosFinanceiro);
            ok(registrarDevolucaoCredito($pdo, (int) ($_REQUEST['os_id'] ?? 0), $_REQUEST['observacao'] ?? null, $usuario['id']), 'Devolução do crédito registrada.');
        }

        case 'converter_prefeitura': {   // Financeiro (página) ou admin; simular=1 devolve a prévia sem gravar
            exigirArea($usuario, 'financeiro', ['adm']);
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId || empty($_REQUEST['convenio'])) {
                erro('Parâmetros obrigatórios: os_id, convenio (ex.: PREFEITURA_BARREIRAS), tanatopraxia_autorizada, translado_autorizado, motivo.');
            }
            $simular = ($_REQUEST['simular'] ?? '') === '1';
            $r = converterParaPrefeitura($pdo, $osId, (string) $_REQUEST['convenio'], ($_REQUEST['tanatopraxia_autorizada'] ?? '') === '1',
                ($_REQUEST['translado_autorizado'] ?? '') === '1', (string) ($_REQUEST['motivo'] ?? ''), $usuario['id'], $simular);
            ok($r, $simular ? 'Prévia da conversão (nada foi gravado).' : ($r['precisa_assinar'] ? 'OS convertida. Falta o responsável assinar a ' . $r['os_diferenca']['numero_os'] . ' com a NP do novo saldo.'
                : ($r['credito_a_devolver'] > 0 ? 'OS convertida. Há crédito a devolver à família.' : 'OS convertida; a diferença já está quitada.')));
        }

        case 'lancar_coroa_prefeitura': {   // pedido de coroa avulso autorizado pela Prefeitura → OS Prf (a tela de coroas chama depois de salvar)
            $pedidoId = (int) ($_REQUEST['coroa_pedido_id'] ?? 0);
            if (!$pedidoId) {
                erro('Parâmetro obrigatório: coroa_pedido_id.');
            }
            if (array_key_exists('paginas', $usuario) && !temPagina($usuario, 'coroa-de-flores') && !temPagina($usuario, 'atendimento')) {
                erro('Sem permissão para esta operação (página "coroa-de-flores").', 403);
            }
            $r = lancarPedidoCoroaPrefeitura($pdo, $pedidoId, $usuario['id']);
            $r['os_convenio'] = ocultarContratoPrefeitura($r['os_convenio'], $usuario['cargo']);   // valor do contrato só no financeiro
            ok($r, $r['lancado'] ? 'OS da Prefeitura lançada: ' . $r['os_convenio']['numero_os'] . '.' : ($r['aviso'] ?? 'Nada a lançar: o pedido não tem autorização da Prefeitura.'));
        }

        case 'convenio_pacotes_classificacao': {   // tipo e ordem dos pacotes do convênio (a tela de convênios junta com a lista do convenio.php)
            exigirArea($usuario, 'convenios', ['adm']);
            ok(classificacaoPacotesConvenio($pdo, (int) ($_REQUEST['convenio_id'] ?? 0)));
        }

        case 'convenio_pacote_classificar': {
            exigirArea($usuario, 'convenios', ['adm']);
            ok(classificarPacoteConvenio($pdo, (int) ($_REQUEST['pacote_id'] ?? 0), (string) ($_REQUEST['tipo'] ?? '')), 'Tipo do pacote salvo.');
        }

        case 'convenio_pacotes_ordenar': {
            exigirArea($usuario, 'convenios', ['adm']);
            $ids = json_decode((string) ($_REQUEST['ids'] ?? '[]'), true);
            ok(ordenarPacotesConvenio($pdo, (int) ($_REQUEST['convenio_id'] ?? 0), is_array($ids) ? $ids : []), 'Ordem dos pacotes salva.');
        }

        case 'remover_item': {
            $id = (int) ($_REQUEST['os_item_id'] ?? 0);
            if (!$id) {
                erro('Parâmetro obrigatório: os_item_id.');
            }
            exigirAcessoItem($pdo, $usuario, $id);
            ok(removerItemDaOS($pdo, $id, $usuario['id']), 'Item removido.');
        }

        case 'editar_valor_item': {
            $id = (int) ($_REQUEST['os_item_id'] ?? 0);
            if (!$id || (!isset($_REQUEST['valor']) && !isset($_REQUEST['valor_km']))) {
                erro('Parâmetros obrigatórios: os_item_id, valor (ou valor_km no translado).');
            }
            exigirAcessoItem($pdo, $usuario, $id);
            // cargo vem do usuário autenticado — nunca do request. Item e quantidade não são alterados por este endpoint.
            $valorKm = isset($_REQUEST['valor_km']) && $_REQUEST['valor_km'] !== '' ? (float) $_REQUEST['valor_km'] : null;   // translado: valor do km
            ok(editarValorItem($pdo, $id, (float) ($_REQUEST['valor'] ?? 0), $usuario, $valorKm), 'Valor do item atualizado; confirme a OS novamente.');
        }

        case 'confirmar_os': {
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            ok(mascararOSParaResposta(confirmarOS($pdo, $osId, $usuario['id'])), 'Valores confirmados. Qualquer alteração exigirá nova confirmação.');
        }

        case 'documentos_listar': {
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            ok(listarDocumentosDaOS($pdo, $osId));
        }

        case 'documento_os': {
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            // Janela "Ver OS" do app: folha com o ícone de ajuste (só na tela; a OS da família aberta decide em htmlItensETotais)
            modoAjusteDocumento(($_REQUEST['ajuste'] ?? '') === '1' && ($_REQUEST['formato'] ?? 'visualizar') === 'visualizar');
            $doc = entregarDocumento($pdo, $usuario['id'], $osId, (string) ($_REQUEST['formato'] ?? 'visualizar'));
            // PDF gerado no aparelho (jsPDF, 08/10/2026): a folha vem em HTML e o PDF fica registrado no histórico da OS.
            if (($_REQUEST['para_pdf'] ?? '') === '1' && ($_REQUEST['formato'] ?? 'visualizar') === 'visualizar') {
                registrarEmissao($pdo, $osId, 'PDF', $usuario['id']);
            }
            header('Content-Type: ' . $doc['mime']);
            header('Content-Disposition: ' . (($_REQUEST['baixar'] ?? '') == '1' ? 'attachment' : 'inline') . '; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $doc['arquivo']) . '"');
            header('Cache-Control: no-store');
            echo $doc['corpo'];
            exit;
        }

        case 'aplicar_desconto': {
            $id = (int) ($_REQUEST['os_item_id'] ?? 0);
            if (!$id || (!isset($_REQUEST['percentual']) && !isset($_REQUEST['valor_desconto']))) {
                erro('Parâmetros obrigatórios: os_item_id e percentual OU valor_desconto (R$).');
            }
            exigirAcessoItem($pdo, $usuario, $id);
            // cargo vem do usuário autenticado — nunca do request (exceto modo_teste, tratado em usuarioAutenticado)
            if (isset($_REQUEST['valor_desconto'])) {
                ok(aplicarDescontoEmReais($pdo, $id, (float) $_REQUEST['valor_desconto'], $usuario), 'Desconto aplicado.');
            }
            validarEAplicarDesconto($pdo, $id, (float) $_REQUEST['percentual'], $usuario);   // recusa: desconto de item só em R$
            ok(null, 'Desconto aplicado.');
        }

        case 'aplicar_desconto_global': {
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId || (!isset($_REQUEST['percentual']) && !isset($_REQUEST['valor_desconto']))) {
                erro('Parâmetros obrigatórios: os_id e percentual OU valor_desconto (R$).');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            // % sobre o subtotal (depois dos descontos dos itens) ou R$; 0 tira o desconto geral
            $r = isset($_REQUEST['valor_desconto'])
                ? aplicarDescontoGlobal($pdo, $osId, 'VALOR', (float) $_REQUEST['valor_desconto'], $usuario)
                : aplicarDescontoGlobal($pdo, $osId, 'PERCENTUAL', (float) $_REQUEST['percentual'], $usuario);
            ok($r, 'Desconto geral aplicado.');
        }

        case 'itens_os': {   // itens para a tela: Qtd, Valor (com acréscimo), Desconto, Final + resumo dos descontos (limite de 8%)
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            ok(itensDaOSParaTela($pdo, $osId, $usuario));
        }

        case 'concluir': {   // Concluir venda (09/10/2026) — multipart: os_id, pagamentos (JSON), comprovante_0..N, concluir_juntas=1
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            $pags = json_decode((string) ($_REQUEST['pagamentos'] ?? '[]'), true);
            if (!is_array($pags)) {
                erro('pagamentos inválidos.');
            }
            $salvos = [];
            try {
                foreach (array_values($pags) as $i => $p) {   // a foto de cada forma vem como comprovante_<índice>
                    if (!empty($_FILES['comprovante_' . $i]) && (int) $_FILES['comprovante_' . $i]['error'] !== UPLOAD_ERR_NO_FILE) {
                        $url = salvarComprovanteOS($osId, $_FILES['comprovante_' . $i]);
                        $salvos[] = $url;
                        $pags[$i]['comprovante_url'] = $url;
                    } else {
                        $pags[$i]['comprovante_url'] = null;   // URL só vem do upload, nunca do navegador
                    }
                }
                $juntas = ($_REQUEST['concluir_juntas'] ?? '') === '1';
                $r = emTransacao($pdo, function () use ($pdo, $usuario, $osId, $pags, $juntas) {
                    $os = buscarOSPorId($pdo, $osId);
                    $outras = [];
                    if ($juntas && !empty($os['atendimento_id'])) {
                        $st = $pdo->prepare("SELECT id, numero_os, natureza FROM os_ordens WHERE atendimento_id = :a AND id <> :id AND status = 'ABERTA' AND tipo <> 'COROA' ORDER BY id");
                        $st->execute(['a' => $os['atendimento_id'], 'id' => $osId]);
                        $outras = $st->fetchAll();
                    }
                    // Os pagamentos são da OS da família (PARTICULAR): concluindo pela aba do convênio, vão para a da família.
                    $pagsPrincipal = $os['natureza'] === 'PARTICULAR' ? $pags : [];
                    $usados = $os['natureza'] === 'PARTICULAR' || !$pags;
                    $r = concluirOS($pdo, $osId, $pagsPrincipal, $usuario['id']);
                    $r['concluidas_juntas'] = [];
                    foreach ($outras as $outra) {
                        exigirAcessoOS($pdo, $usuario, (int) $outra['id']);
                        $p = [];
                        if (!$usados && $outra['natureza'] === 'PARTICULAR') {
                            $p = $pags;
                            $usados = true;
                        }
                        concluirOS($pdo, (int) $outra['id'], $p, $usuario['id']);
                        $r['concluidas_juntas'][] = $outra['numero_os'];
                    }
                    if (!$usados) {
                        throw new RegraNegocioException('Pagamento só vale para a OS da família, e não há OS da família aberta neste atendimento.', 422);
                    }
                    return $r;
                });
            } catch (Throwable $e) {
                foreach ($salvos as $url) {   // conclusão recusada: nada no banco, apaga as fotos recém-salvas
                    if (preg_match('#^/uploads/comprovantes/os_[A-Za-z0-9_.]+$#', $url)) {
                        @unlink(__DIR__ . $url);
                    }
                }
                throw $e;
            }
            $r['os'] = mascararOSParaResposta($r['os']);
            $msg = 'Venda concluída' . ($r['saldo'] > 0 ? ' — a receber ' . formatarReais($r['saldo']) . '; colha a assinatura para a nota promissória.' : ' e quitada.');
            ok($r, $msg . ($r['concluidas_juntas'] ? ' Concluída também: ' . implode(', ', $r['concluidas_juntas']) . '.' : ''));
        }

        case 'os_da_coroa': {   // OS Cor do pedido de coroa (venda direta): devolve a existente ou cria — botão "Concluir venda" do pedido
            $pedidoId = (int) ($_REQUEST['coroa_pedido_id'] ?? 0);
            if (!$pedidoId) {
                erro('Parâmetro obrigatório: coroa_pedido_id.');
            }
            if (array_key_exists('paginas', $usuario) && !temPagina($usuario, 'coroa-de-flores') && !temPagina($usuario, 'atendimento')) {
                erro('Sem permissão para esta operação (página "coroa-de-flores").', 403);
            }
            $os = garantirOSDaCoroa($pdo, $pedidoId, $usuario['id'], null, 'VENDA_DIRETA');
            ok(['os' => mascararOSParaResposta($os)], "OS {$os['numero_os']}.");
        }

        case 'assinar': {
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            // A assinatura pode vir pronta (arquivo_assinatura) ou como imagem (assinatura_base64), gravada aqui em
            // uploads/assinaturas/, na mesma pasta das assinaturas dos termos (08/10/2026 — o upload_assinatura.php não existe).
            $arquivoAss = (string) ($_REQUEST['arquivo_assinatura'] ?? '');
            if ($arquivoAss === '' && trim((string) ($_REQUEST['assinatura_base64'] ?? '')) !== '') {
                $arquivoAss = salvarImagemAssinaturaOS($osId, (string) $_REQUEST['assinatura_base64']);
            }
            $nomeAss = (string) ($_REQUEST['nome_responsavel'] ?? '');
            $cpfAss = $_REQUEST['cpf_responsavel'] ?? null;
            if (lerPagamentoNoAto() !== null) {
                erro('O pagamento agora é lançado na conclusão da venda. Atualize o aplicativo.', 422);
            }
            /*
             * Uma assinatura para as OS do atendimento (08/10/2026): com assinar_juntas=1, a mesma assinatura vale também para
             * as outras OS do atendimento já CONCLUÍDAS e ainda sem assinatura (ex.: a do convênio e a da família). Tudo numa
             * transação só: se uma não puder ser assinada, nenhuma é. Pedido de coroa (tipo COROA) tem assinatura própria.
             * Desde 09/10/2026 o pagamento é lançado na conclusão; a assinatura só registra quem assinou e emite a NP do saldo.
             */
            $juntas = ($_REQUEST['assinar_juntas'] ?? '') === '1';
            $arquivoNovo = $arquivoAss !== '' && trim((string) ($_REQUEST['arquivo_assinatura'] ?? '')) === '';
            try {
            $r = emTransacao($pdo, function () use ($pdo, $usuario, $osId, $nomeAss, $cpfAss, $arquivoAss, $juntas) {
                $os = buscarOSPorId($pdo, $osId);
                $outras = [];
                if ($juntas && !empty($os['atendimento_id'])) {
                    $st = $pdo->prepare("SELECT id, numero_os, natureza FROM os_ordens WHERE atendimento_id = :a AND id <> :id AND status = 'FECHADA'
                                         AND assinada_em IS NULL AND tipo <> 'COROA' ORDER BY id");
                    $st->execute(['a' => $os['atendimento_id'], 'id' => $osId]);
                    $outras = $st->fetchAll();
                }
                $r = assinarOS($pdo, $osId, $nomeAss, $cpfAss, $arquivoAss, null, $usuario['id']);
                $r['assinadas_juntas'] = [];
                foreach ($outras as $outra) {
                    exigirAcessoOS($pdo, $usuario, (int) $outra['id']);
                    $rOutra = assinarOS($pdo, (int) $outra['id'], $nomeAss, $cpfAss, $arquivoAss, null, $usuario['id']);
                    if (($r['np'] ?? null) === null) {
                        $r['np'] = $rOutra['np'] ?? null;
                    }
                    $r['assinadas_juntas'][] = $outra['numero_os'];
                }
                return $r;
            });
            } catch (Throwable $e) {
                // Assinatura recusada (nada foi gravado no banco): apaga a imagem que acabou de ser salva.
                if ($arquivoNovo && preg_match('#^/uploads/assinaturas/os_[A-Za-z0-9_]+\\.png$#', $arquivoAss)) {
                    @unlink(__DIR__ . $arquivoAss);
                }
                throw $e;
            }
            $msgJuntas = $r['assinadas_juntas'] ? ' Assinada também: ' . implode(', ', $r['assinadas_juntas']) . '.' : '';
            ok(['os' => mascararOSParaResposta(buscarOSPorId($pdo, $osId))] + $r,
                ($r['np'] ? 'OS assinada e travada; nota promissória do saldo emitida na mesma folha.' : 'OS assinada e travada.') . $msgJuntas);
        }

        case 'iniciar_assinatura_plataforma': {
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            $envelope = iniciarAssinaturaViaPlataforma($pdo, $osId, (string) ($_REQUEST['nome_responsavel'] ?? ''),
                $_REQUEST['cpf_responsavel'] ?? null, (string) ($_REQUEST['email_responsavel'] ?? ''),
                $_REQUEST['telefone_responsavel'] ?? null, lerPagamentoNoAto(), $usuario['id']);
            ok($envelope, 'Envelope criado; a OS fica AGUARDANDO_ASSINATURA até o webhook confirmar.');
        }

        case 'fechar_corpo_pronto': {
            $atendimentoId = (int) ($_REQUEST['atendimento_id'] ?? 0);
            if (!$atendimentoId) {
                erro('Parâmetro obrigatório: atendimento_id.');
            }
            $resultado = emTransacao($pdo, function () use ($pdo, $atendimentoId) {
                $stmt = $pdo->prepare("SELECT id, status FROM os_ordens WHERE atendimento_id = :id AND status IN ('ABERTA','AGUARDANDO_ASSINATURA') FOR UPDATE");
                $stmt->execute(['id' => $atendimentoId]);
                $fechadas = [];
                $aguardando = [];
                foreach ($stmt->fetchAll() as $row) {
                    if ($row['status'] === 'ABERTA') {
                        fecharOS($pdo, (int) $row['id'], 'CORPO_PRONTO');
                        $fechadas[] = (int) $row['id'];
                    } else {
                        $aguardando[] = (int) $row['id']; // envelope em andamento: NÃO é fechada aqui
                    }
                }
                return ['fechadas' => $fechadas, 'ainda_aguardando_assinatura' => $aguardando];
            });
            ok($resultado, $resultado['ainda_aguardando_assinatura']
                ? 'Atenção: há OS aguardando assinatura — não foram fechadas no Corpo Pronto.' : 'OS(s) do atendimento fechada(s) no Corpo Pronto.');
        }

        case 'reabrir': {   // Financeiro (página) ou cargos_reabrir; exige o motivo
            exigirArea($usuario, 'financeiro', (array) osConfig('cargos_reabrir', ['adm']));
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            $motivo = trim((string) ($_REQUEST['motivo'] ?? ''));
            if (!$osId || mb_strlen($motivo) < 5) {
                erro('Parâmetros obrigatórios: os_id e motivo (mínimo 5 caracteres).');
            }
            $r = invalidarAssinaturaEReabrir($pdo, $osId, $usuario['id'], $motivo);
            ok($r, 'OS reaberta; assinatura e nota promissória anteriores invalidadas — colha uma nova assinatura ao fechar de novo.');
        }

        case 'diagnostico': {
            if (!modoTeste() && !cargoEhAdmin($usuario['cargo'])) {
                erro('Somente administrador.', 403);
            }
            ok(diagnosticoSchema($pdo), 'Diagnóstico de schema — ver CHECKLIST_ANTES_DE_SUBIR.md.');
        }

        case 'financeiro_criar_proposta': {
            exigirArea($usuario, 'financeiro', $cargosFinanceiro);
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId || !isset($_REQUEST['valor_alvo'])) {
                erro('Parâmetros obrigatórios: os_id, valor_alvo.');
            }
            ok(criarPropostaFinanceira($pdo, $osId, $_REQUEST['tipo_proposta'] ?? 'A_VISTA', (float) $_REQUEST['valor_alvo'],
                $_REQUEST['observacao'] ?? null, $usuario['id']), 'Proposta financeira criada (independe do status da OS).');
        }

        case 'financeiro_registrar_pagamento': {   // multipart: comprovante obrigatório, menos no dinheiro (21/10/2026)
            exigirArea($usuario, 'financeiro', $cargosFinanceiro);
            $finId = (int) ($_REQUEST['financeiro_id'] ?? 0);
            if (!$finId || empty($_REQUEST['forma_pagamento']) || !isset($_REQUEST['valor'])) {
                erro('Parâmetros obrigatórios: financeiro_id, forma_pagamento, valor.');
            }
            $forma = strtoupper(trim((string) $_REQUEST['forma_pagamento']));
            $temArquivo = !empty($_FILES['comprovante']) && (int) $_FILES['comprovante']['error'] !== UPLOAD_ERR_NO_FILE;
            if (!$temArquivo && !in_array($forma, COMPROVANTE_DISPENSADO, true)) {
                erro(rotuloFormaPagamento($forma) . ': anexe a foto ou o PDF do comprovante.', 400);
            }
            $finRow = buscarFinanceiroPorId($pdo, $finId);
            $url = $temArquivo ? salvarComprovanteOS((int) $finRow['os_id'], $_FILES['comprovante']) : null;   // URL só vem do upload
            try {
                $r = emTransacao($pdo, function () use ($pdo, $finId, $forma, $url, $usuario) {
                    $r = registrarPagamentoFinanceiro($pdo, $finId, $forma, (float) $_REQUEST['valor'],
                        $_REQUEST['data_pagamento'] ?? date('Y-m-d'), $_REQUEST['observacao'] ?? null, $usuario['id']);
                    if ($url !== null) {
                        anexarComprovanteFinanceiro($pdo, (int) $r['pagamento_id'], $url, $usuario['id']);
                    }
                    return $r;
                });
            } catch (Throwable $e) {
                if ($url !== null && preg_match('#^/uploads/comprovantes/os_[A-Za-z0-9_.]+$#', $url)) {
                    @unlink(__DIR__ . $url);   // lançamento recusado: não fica arquivo solto
                }
                throw $e;
            }
            ok($r, $r['saldo']['status'] === 'FATURADO' ? 'Pagamento registrado — saldo em 100%, proposta faturada.' : 'Pagamento registrado.');
        }

        case 'financeiro_fechar_os': {   // Fechar a OS pelo Financeiro (21/10/2026): atendimento já finalizado com a OS aberta.
            // Mesma conclusão do "Concluir venda" (FECHADA/CONCLUSAO, sem pagamento): a assinatura fica para colher depois
            // e a nota promissória do saldo sai quando o responsável assinar. Motivo obrigatório, na linha do tempo.
            exigirArea($usuario, 'financeiro', $cargosFinanceiro);
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            $motivo = trim((string) ($_REQUEST['motivo'] ?? ''));
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            if (mb_strlen($motivo) < 5) {
                erro('Informe o motivo para fechar a OS (mínimo 5 caracteres).');
            }
            $r = emTransacao($pdo, function () use ($pdo, $osId, $motivo, $usuario) {
                $r = concluirOS($pdo, $osId, [], $usuario['id']);
                registrarEvento($pdo, $osId, 'FECHADA_FINANCEIRO', 'OS fechada pelo Financeiro — assinatura pendente (colher com o responsável). Motivo: ' . mb_substr($motivo, 0, 300), $usuario['id']);
                return $r;
            });
            $r['os'] = mascararOSParaResposta($r['os']);
            ok($r, 'OS fechada' . ($r['saldo'] > 0 ? ' — a receber ' . formatarReais($r['saldo']) . '; a assinatura fica pendente (a nota promissória sai quando o responsável assinar).' : ' e quitada; a assinatura fica pendente.'));
        }

        case 'financeiro_anexar_comprovante': {
            exigirArea($usuario, 'financeiro', $cargosFinanceiro);
            $pagId = (int) ($_REQUEST['pagamento_id'] ?? 0);
            if (!$pagId || empty($_REQUEST['arquivo_url'])) {
                erro('Parâmetros obrigatórios: pagamento_id, arquivo_url.');
            }
            ok(anexarComprovanteFinanceiro($pdo, $pagId, (string) $_REQUEST['arquivo_url'], $usuario['id']), 'Comprovante anexado.');
        }

        case 'financeiro_cancelar_proposta': {
            exigirArea($usuario, 'financeiro', $cargosFinanceiro);
            $finId = (int) ($_REQUEST['financeiro_id'] ?? 0);
            if (!$finId) {
                erro('Parâmetro obrigatório: financeiro_id.');
            }
            ok(cancelarPropostaFinanceira($pdo, $finId, (string) ($_REQUEST['motivo'] ?? ''), $usuario['id']), 'Proposta cancelada.');
        }

        case 'financeiro_estornar_pagamento': {
            if (!cargoEhAdmin($usuario['cargo'])) {
                erro('Somente administrador pode estornar pagamento.', 403);
            }
            $pagId = (int) ($_REQUEST['pagamento_id'] ?? 0);
            if (!$pagId) {
                erro('Parâmetro obrigatório: pagamento_id.');
            }
            ok(estornarPagamentoFinanceiro($pdo, $pagId, (string) ($_REQUEST['motivo'] ?? ''), $usuario['id']), 'Pagamento estornado.');
        }

        case 'composicao_contrato_os': {   // Financeiro: pacotes e serviços de contrato da OS da Prefeitura, com os itens usados
            exigirArea($usuario, 'financeiro', $cargosFinanceiro);
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            ok(composicaoContratoOS($pdo, $osId));
        }

        case 'financeiro_listar': {
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            $f = listarFinanceiroDaOS($pdo, $osId);
            ok($f, $f === null ? 'Nenhuma proposta financeira encontrada para esta OS.' : null);
        }

        case 'listar': {
            $osId = (int) ($_REQUEST['os_id'] ?? 0);
            if (!$osId) {
                erro('Parâmetro obrigatório: os_id.');
            }
            exigirAcessoOS($pdo, $usuario, $osId);
            $os = mascararOSParaResposta(buscarOSPorId($pdo, $osId));
            $os['recebido'] = valorJaPagoDaOS($pdo, $osId);   // conclusão (09/10/2026): a tela mostra o saldo e a NP que sai na assinatura
            $it = $pdo->prepare('SELECT * FROM os_itens WHERE os_id = :id ORDER BY id');
            $it->execute(['id' => $osId]);
            $pa = $pdo->prepare('SELECT * FROM os_np WHERE os_id = :id');
            $pa->execute(['id' => $osId]);
            $itens = array_map(fn($i) => $i + ['produto_nome' => nomeProduto($pdo, (int) $i['produto_id'])], $it->fetchAll());
            ok(['os' => $os, 'itens' => $itens, 'nota_promissoria' => $pa->fetch() ?: null]);
        }

        default:
            erro('Ação não implementada.', 404);
    }
} catch (RegraNegocioException $e) {
    erro($e->getMessage(), $e->codigoHttp);
} catch (InvalidArgumentException $e) {
    erro($e->getMessage(), 400);
} catch (PDOException $e) {
    error_log('[os_principal] PDOException: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $m = $e->getMessage();
    if (preg_match("/Table '[^.']*\\.?([A-Za-z0-9_]+)' doesn't exist/", $m, $t)) {
        erro("Tabela do banco ainda não criada: {$t[1]}. Rode schema_ordem_servico.sql (e alteracoes_convenios.sql / alteracoes_atendimento_sugeridas.sql).", 500);
    }
    if (preg_match("/Unknown column '([^']+)'/", $m, $c)) {
        erro("Coluna do banco ainda não criada: {$c[1]}. Rode alteracoes_convenios.sql e alteracoes_atendimento_sugeridas.sql.", 500);
    }
    if (in_array((string) $e->getCode(), ['2002', '1045', '1049', 'HY000'], true) && stripos($m, 'SQLSTATE[HY000] [') !== false) {
        erro('Não foi possível conectar ao banco (confira o pai-chaves.php).', 500);
    }
    erro(modoTeste() ? 'Erro interno: ' . $m : 'Erro interno no banco. Veja o error_log do servidor.', 500);
} catch (Throwable $e) {
    error_log('[os_principal] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    erro(modoTeste() ? 'Erro interno: ' . $e->getMessage() : 'Erro interno. Tente novamente; se persistir, avise o suporte.', 500);
}
