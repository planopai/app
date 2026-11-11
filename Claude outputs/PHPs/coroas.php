<?php
/**
 * coroas.php
 * API para pedidos de Coroas de Flores (manuais + importação WooCommerce).
 *
 * Atualização:
 * - um pedido pode conter 1 a 20 coroas;
 * - cada pedido manual possui telefone e local de entrega;
 * - cada coroa possui seu próprio modelo, sua própria frase e, se artificial, seu depósito;
 * - modelos ficam em coroas_itens; artificiais aceitam somente MEMORIAL ou FUNERARIA;
 * - mantém modelo_coroa/frase no pedido principal por compatibilidade;
 * - comprovante aceita imagem ou PDF;
 * - Coroa e Faixa podem ser iniciadas de forma independente;
 * - Natural/Mista: Finalizada exige Coroa + Faixa iniciadas e foto;
 * - Somente Artificial: sem etapa Confeccionando Coroa; exige Faixa + foto;
 * - Pedidos online entram na mesma fila de Confecção via origem_externa_id;
 * - bloqueia "finalizada" sem foto da coroa pronta;
 * - notificações OneSignal usam o título unificado '🌺 COROA DE FLORES';
 * - GET ?listar=1&ativos=1 continua pronto para o quadro de acompanhamento;
 * - libera o lock da sessão logo no início da requisição;
 * - listagem usa consulta em lote para itens, evita COUNT(*) quando possível e devolve timestamps das etapas para o Quadro TV;
 * - cache APCu opcional de 3 segundos para rajadas de GET duplicados;
 * - expõe Server-Timing/X-PAI-Response-Ms para diagnóstico de performance;
 * - uploads de foto/comprovante aceitam multipart/form-data sem Base64;
 * - fotos da coroa são mantidas leves (até 960x720 no fluxo novo) e comprovantes em imagem são otimizados no servidor;
 * - 06/10/2026: pedido avulso pode ser de uma Prefeitura (convenio_id + coroa_autorizada_prefeitura). Autorizado = faturado à
 *   Prefeitura pela OS Prf (os_principal.php?lancar_coroa_prefeitura=1) e marcado como pago; não autorizado = venda direta.
 * - 07/10/2026: ETAPA POR COROA. Cada coroa do pedido (coroas_itens) tem a sua etapa (coroa, faixa, foto, finalizada,
 *   entregue). O app mostra um cartão por coroa e manda item_id em atualizar_status. A etapa do pedido (coroas) passa
 *   a ser o resumo das coroas: 'entregue' só quando todas foram entregues. Colunas: sql/coroas_etapa_por_coroa.sql.
 * - 05/11/2026: FLUXO SIMPLIFICADO. O app usa só INICIAR (status 'iniciar') → Coroa Pronta ('finalizada', com foto)
 *   → Entregue. 'iniciar' preenche o início da coroa (natural) e da faixa num toque; 'finalizada' não exige mais os
 *   inícios separados (se faltarem, grava no mesmo momento). 'coroa' e 'faixa' continuam aceitos para apps antigos.
 *   Sem mudança no banco: status gravados continuam novo/coroa/faixa/finalizada/entregue.
 */

declare(strict_types=1);
// 23/10/2026 (segurança): confere o login assinado (cookie pai_session) antes de usar os cookies pai_*. Ver /home2/pla48587/pai_sessao.php
if (is_file('/home2/pla48587/pai_sessao.php')) { include_once '/home2/pla48587/pai_sessao.php'; } elseif (PHP_SAPI !== 'cli') { $paiChavesSemSessao = @include '/home2/pla48587/pai-chaves.php'; if (is_array($paiChavesSemSessao) && strtolower(trim((string) ($paiChavesSemSessao['pai_sessao_modo'] ?? ''))) === 'exigir') { error_log('[PAI] pai_sessao.php ausente com pai_sessao_modo=exigir: acesso bloqueado em ' . basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''))); if (!headers_sent()) { http_response_code(503); header('Content-Type: application/json; charset=utf-8'); header('Retry-After: 300'); } echo json_encode(['ok' => false, 'sucesso' => false, 'success' => false, 'erro' => 'Sistema em manutenção. Tente novamente em alguns minutos.', 'msg' => 'Sistema em manutenção. Tente novamente em alguns minutos.'], JSON_UNESCAPED_UNICODE); exit; } unset($paiChavesSemSessao); } // 23/10/2026: sem o pai_sessao.php e com o modo exigir, bloqueia em vez de liberar

$GLOBALS['PAI_REQUEST_STARTED_AT'] = microtime(true);
$GLOBALS['PAI_SERVER_TIMING'] = [];

header('Content-Type: application/json; charset=utf-8');

/* =========================================================
   CORS
   ========================================================= */
$allowedOrigins = [
    'https://app.planoassistencialintegrado.com.br',
    'https://pai.planoassistencialintegrado.com.br',
    'https://planoassistencialintegrado.com.br',
    'https://club.planoassistencialintegrado.com.br',
    'https://www.planoassistencialintegrado.com.br',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $allowedOrigins, true)) {
    header_remove('Access-Control-Allow-Origin');
    header_remove('Access-Control-Allow-Credentials');
    header_remove('Access-Control-Allow-Methods');
    header_remove('Access-Control-Allow-Headers');
    header_remove('Access-Control-Max-Age');

    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization, X-PAI-Internal-Signature, X-PAI-Verify-Url, Expires, Cache-Control, Pragma');
    header('Access-Control-Max-Age: 86400');
    header('Vary: Origin');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$requestMethod = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($requestMethod === 'GET') {
    // Cache privado e curtíssimo. Ajuda em navegação repetida sem permitir
    // que proxies públicos armazenem dados de clientes.
    header('Cache-Control: private, max-age=2, stale-while-revalidate=3');
    header('Vary: Origin, Cookie');
} else {
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
}

/* =========================================================
   SESSÃO
   ========================================================= */
$sessionLifetime = 8 * 60 * 60;
ini_set('session.gc_maxlifetime', (string)$sessionLifetime);
ini_set('session.cookie_lifetime', (string)$sessionLifetime);

session_set_cookie_params([
    'lifetime' => $sessionLifetime,
    'path' => '/',
    'domain' => '.planoassistencialintegrado.com.br',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'None',
]);

session_start();

// IMPORTANTÍSSIMO PARA PERFORMANCE:
// PHP bloqueia a sessão durante a requisição. No desktop várias chamadas
// paralelas podem acabar esperando umas pelas outras. Os dados de $_SESSION
// continuam disponíveis após o fechamento; apenas liberamos o lock.
session_write_close();

/* =========================================================
   CONFIGURAÇÃO PRIVADA
   Mesmo padrão do informativo.php: credenciais fora da pasta pública.
   ========================================================= */
$PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';

if (!is_file($PAI_CHAVES_FILE) || !is_readable($PAI_CHAVES_FILE)) {
    responder([
        'sucesso' => false,
        'erro' => true,
        'msg' => 'Arquivo privado de configuração não encontrado ou sem permissão de leitura.',
    ], 500);
}

$PAI_CONFIG = require $PAI_CHAVES_FILE;

if (!is_array($PAI_CONFIG)) {
    responder([
        'sucesso' => false,
        'erro' => true,
        'msg' => 'Arquivo privado de configuração inválido.',
    ], 500);
}

// Banco de dados
$DB_HOST = trim((string)($PAI_CONFIG['db_host'] ?? ''));
$DB_NAME = trim((string)($PAI_CONFIG['db_name'] ?? ''));
$DB_USER = trim((string)($PAI_CONFIG['db_user'] ?? ''));
$DB_PASS = (string)($PAI_CONFIG['db_password'] ?? '');

// OneSignal
$ONESIGNAL_APP_ID = trim((string)($PAI_CONFIG['onesignal_app_id'] ?? ''));
$ONESIGNAL_API_KEY = trim((string)($PAI_CONFIG['onesignal_api_key'] ?? ''));

// URLs públicas não são credenciais e permanecem no código.
$ONESIGNAL_COROAS_URL = 'https://pai.planoassistencialintegrado.com.br/coroa-de-flores';
$API_PUBLIC_BASE = 'https://api.planoassistencialintegrado.com.br';


/* =========================================================
   HELPERS BASE
   ========================================================= */
function pai_timing_add(string $name, float $startedAt): void {
    $durationMs = max(0, (microtime(true) - $startedAt) * 1000);
    $name = preg_replace('/[^a-zA-Z0-9_-]/', '_', $name) ?: 'step';
    $GLOBALS['PAI_SERVER_TIMING'][$name] = round($durationMs, 2);
}

function responder(array $data, int $code = 200): void {
    $totalMs = max(
        0,
        (microtime(true) - (float)($GLOBALS['PAI_REQUEST_STARTED_AT'] ?? microtime(true))) * 1000
    );

    if (!headers_sent()) {
        $timings = $GLOBALS['PAI_SERVER_TIMING'] ?? [];
        $serverTiming = [];

        foreach ($timings as $name => $duration) {
            $serverTiming[] = $name . ';dur=' . number_format((float)$duration, 2, '.', '');
        }

        $serverTiming[] = 'total;dur=' . number_format($totalMs, 2, '.', '');

        header('Server-Timing: ' . implode(', ', $serverTiming));
        header('X-PAI-Response-Ms: ' . number_format($totalMs, 2, '.', ''));
    }

    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Valida chamadas server-to-server do Next.js sem exigir uma nova variável
 * no servidor PHP. O Next.js assina o JSON usando o WC_WEBHOOK_SECRET que
 * já existe no aplicativo. Este PHP pergunta ao próprio Next.js se a
 * assinatura é válida, sem precisar conhecer o segredo.
 */
function exigir_assinatura_integracao_online(string $rawBody): void {
    $assinatura = trim((string)($_SERVER['HTTP_X_PAI_INTERNAL_SIGNATURE'] ?? ''));
    $verifyUrl = trim((string)($_SERVER['HTTP_X_PAI_VERIFY_URL'] ?? ''));

    if ($assinatura === '' || $verifyUrl === '') {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Assinatura da integração online ausente.',
        ], 403);
    }

    $parts = @parse_url($verifyUrl);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    $path = (string)($parts['path'] ?? '');
    $query = (string)($parts['query'] ?? '');

    $hostsPermitidos = [
        'pai.planoassistencialintegrado.com.br',
        'app.planoassistencialintegrado.com.br',
        'planoassistencialintegrado.com.br',
        'www.planoassistencialintegrado.com.br',
        'club.planoassistencialintegrado.com.br',
    ];

    parse_str($query, $queryParams);
    $modoValido = (string)($queryParams['verify_internal'] ?? '') === '1';

    if (
        $scheme !== 'https' ||
        !in_array($host, $hostsPermitidos, true) ||
        $path !== '/api/wc/orders' ||
        !$modoValido
    ) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'URL de validação da integração não permitida.',
        ], 403);
    }

    $verifyPayload = json_encode([
        'payload' => $rawBody,
        'signature' => $assinatura,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if (!is_string($verifyPayload)) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Não foi possível validar a assinatura da integração.',
        ], 500);
    }

    $responseBody = false;
    $httpCode = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($verifyUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_POSTFIELDS => $verifyPayload,
        ]);

        $responseBody = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json
Accept: application/json
",
                'content' => $verifyPayload,
                'timeout' => 10,
                'ignore_errors' => true,
            ],
        ]);

        $responseBody = @file_get_contents($verifyUrl, false, $context);

        foreach (($http_response_header ?? []) as $headerLine) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#i', (string)$headerLine, $m)) {
                $httpCode = (int)$m[1];
                break;
            }
        }
    }

    $response = is_string($responseBody)
        ? json_decode($responseBody, true)
        : null;

    if ($httpCode < 200 || $httpCode >= 300 || !is_array($response) || empty($response['valid'])) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Integração online não autorizada.',
        ], 403);
    }
}

/**
 * Cache opcional em APCu.
 * Se APCu não existir no servidor, tudo continua funcionando normalmente.
 * A chave ignora parâmetros como _ts, então o cache-busting do navegador
 * não impede o reaproveitamento por alguns segundos no servidor.
 */
/** Coluna coroas.cancelado_em (SQL correcoes_operacionais.sql, 09/10/2026). */
function coroas_tem_coluna_cancelado(PDO $pdo): bool {
    static $tem = null;
    if ($tem === null) {
        try {
            $tem = (bool)$pdo->query("SHOW COLUMNS FROM coroas LIKE 'cancelado_em'")->fetch(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            $tem = false;
        }
    }
    return $tem;
}

function coroas_cache_disponivel(): bool {
    return function_exists('apcu_fetch')
        && function_exists('apcu_store')
        && filter_var((string)ini_get('apc.enabled'), FILTER_VALIDATE_BOOLEAN);
}

function coroas_cache_versao(): int {
    if (!coroas_cache_disponivel()) return 1;

    $success = false;
    $version = apcu_fetch('pai_coroas_cache_version', $success);

    if (!$success || !is_numeric($version)) {
        apcu_store('pai_coroas_cache_version', 1);
        return 1;
    }

    return max(1, (int)$version);
}

function coroas_cache_invalidar(): void {
    if (!coroas_cache_disponivel()) return;

    $success = false;
    apcu_inc('pai_coroas_cache_version', 1, $success);

    if (!$success) {
        apcu_store('pai_coroas_cache_version', 2);
    }
}

function coroas_cache_chave_listagem(array $query): string {
    unset($query['_ts'], $query['ts'], $query['cacheBust']);
    ksort($query);

    return 'pai_coroas_list_v' .
        coroas_cache_versao() .
        '_' .
        hash('sha256', http_build_query($query));
}

function coroas_cache_get(string $key): ?array {
    if (!coroas_cache_disponivel()) return null;

    $success = false;
    $value = apcu_fetch($key, $success);

    return ($success && is_array($value)) ? $value : null;
}

function coroas_cache_set(string $key, array $value, int $ttl = 3): void {
    if (!coroas_cache_disponivel()) return;
    apcu_store($key, $value, max(1, $ttl));
}

function texto($v): string {
    return trim((string)($v ?? ''));
}

function normalizar_nome_usuario($valor): string {
    $u = trim((string)($valor ?? ''));
    $u = preg_replace('/\s+/u', ' ', $u) ?: $u;

    if (function_exists('mb_substr')) {
        $u = mb_substr($u, 0, 120, 'UTF-8');
    } else {
        $u = substr($u, 0, 120);
    }

    return trim($u);
}

/**
 * Nome cadastrado (15/10/2026): o pedido grava usuarios.nome (ex.: "Dimar Júnior"),
 * não o login ("Dimarjunior"). Procura pelo id (sessão ou cookie pai_uid) e pelo login (pai_user).
 */
function nome_cadastrado_usuario_logado(): string {
    $pdo = $GLOBALS['pdo'] ?? null;
    if (!($pdo instanceof PDO)) return '';
    $id = (int)($_SESSION['user_id'] ?? $_SESSION['usuario_id'] ?? $_COOKIE['pai_uid'] ?? 0);
    $login = trim((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
    try {
        $row = null;
        if ($id > 0) {
            $st = $pdo->prepare("SELECT nome, usuario FROM usuarios WHERE id = :id LIMIT 1");
            $st->execute([':id' => $id]);
            $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($row && $login !== '' && strcasecmp((string)($row['usuario'] ?? ''), $login) !== 0) $row = null;
        }
        if (!$row && $login !== '') {
            $st = $pdo->prepare("SELECT nome, usuario FROM usuarios WHERE usuario = :u LIMIT 1");
            $st->execute([':u' => $login]);
            $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
        }
    } catch (Throwable $e) {
        return '';
    }
    return trim((string)($row['nome'] ?? ''));
}

function usuario_atual(): string {
    $cadastrado = normalizar_nome_usuario(nome_cadastrado_usuario_logado());
    if ($cadastrado !== '') return $cadastrado;

    $u =
        $_SESSION['usuario_nome'] ??
        $_SESSION['nome'] ??
        $_SESSION['usuario'] ??
        $_SESSION['login'] ??
        '';

    $u = normalizar_nome_usuario($u);
    return $u !== '' ? $u : 'Sistema';
}

function resolver_usuario_acao(array $json): string {
    $sessao = usuario_atual();

    // A sessão é sempre a fonte principal.
    if ($sessao !== 'Sistema') {
        return $sessao;
    }

    // 23/10/2026: com login assinado, o nome vem do cadastro (não do corpo do pedido).
    if (function_exists('paiProtecaoQuem')) {
        $quem = paiProtecaoQuem();
        if (is_array($quem) && empty($quem['interna'])) {
            $nomeAssinado = normalizar_nome_usuario($quem['nome'] !== '' ? $quem['nome'] : $quem['usuario']);
            if ($nomeAssinado !== '') return $nomeAssinado;
        }
    }

    // Fallback: a page.tsx consulta informativo.php?me=1 e envia o nome.
    $fallback = normalizar_nome_usuario(
        $json['usuario_nome'] ??
        $json['usuario_atual'] ??
        ''
    );

    return $fallback !== '' ? $fallback : 'Sistema';
}

function validar_enum_ou_erro($valor, array $permitidos, string $label): string {
    $v = strtolower(trim((string)$valor));
    if (!in_array($v, $permitidos, true)) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => "Valor inválido para {$label}.",
        ], 400);
    }
    return $v;
}

function normalizar_chave(string $v): string {
    $v = trim(mb_strtolower($v, 'UTF-8'));
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $v);
    if ($ascii !== false) $v = $ascii;
    $v = strtolower($v);
    $v = preg_replace('/\s+/', ' ', $v) ?: $v;
    return trim($v);
}

function url_publica_coroas($url): ?string {
    global $API_PUBLIC_BASE;

    $s = trim((string)($url ?? ''));
    if ($s === '') return null;
    if (preg_match('#^https?://#i', $s)) return $s;
    if ($s[0] !== '/') $s = '/' . $s;

    return rtrim($API_PUBLIC_BASE, '/') . $s;
}

function url_publica_produto($url): ?string {
    global $API_PUBLIC_BASE;

    $s = trim((string)($url ?? ''));
    if ($s === '') return null;
    if (preg_match('#^https?://#i', $s)) return $s;

    $s = ltrim($s, '/');

    if (str_starts_with($s, 'uploads/')) {
        return rtrim($API_PUBLIC_BASE, '/') . '/' . $s;
    }

    return rtrim($API_PUBLIC_BASE, '/') . '/uploads/produtos/' . $s;
}

/* =========================================================
   CACHE DE LISTAGEM — antes de conectar no MySQL
   ========================================================= */
$LIST_CACHE_KEY = null;

if (
    $requestMethod === 'GET' &&
    (isset($_GET['listar']) || isset($_GET['quadro']))
) {
    $LIST_CACHE_KEY = coroas_cache_chave_listagem($_GET);
    $cachedList = coroas_cache_get($LIST_CACHE_KEY);

    if (is_array($cachedList)) {
        header('X-Coroas-Cache: HIT');
        responder($cachedList);
    }

    header('X-Coroas-Cache: MISS');
}

/* =========================================================
   BANCO
   ========================================================= */
if ($DB_HOST === '' || $DB_NAME === '' || $DB_USER === '' || $DB_PASS === '') {
    responder([
        'sucesso' => false,
        'erro' => true,
        'msg' => 'Configuração do banco ausente ou incompleta em pai-chaves.php.',
    ], 500);
}

try {
    $pdoStartedAt = microtime(true);

    $pdo = new PDO(
        "mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4",
        $DB_USER,
        $DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    pai_timing_add('db_connect', $pdoStartedAt);
} catch (PDOException $e) {
    responder([
        'sucesso' => false,
        'erro' => true,
        'msg' => 'Erro ao conectar ao banco de dados.',
    ], 500);
}

/**
 * Garante o único campo extra necessário para vincular um pedido interno
 * ao pedido correspondente no WooCommerce. A operação é idempotente.
 */
function garantir_schema_integracao_online(PDO $pdo): void {
    static $executado = false;
    if ($executado) return;

    try {
        $stColuna = $pdo->query("SHOW COLUMNS FROM coroas LIKE 'origem_externa_id'");
        $temColuna = (bool)$stColuna->fetch(PDO::FETCH_ASSOC);

        if (!$temColuna) {
            $pdo->exec(
                "ALTER TABLE coroas
                 ADD COLUMN origem_externa_id VARCHAR(100) NULL AFTER origem"
            );
        }

        $stIndice = $pdo->query("SHOW INDEX FROM coroas WHERE Key_name = 'uq_coroas_origem_externa'");
        $temIndice = (bool)$stIndice->fetch(PDO::FETCH_ASSOC);

        if (!$temIndice) {
            $pdo->exec(
                "ALTER TABLE coroas
                 ADD UNIQUE KEY uq_coroas_origem_externa (origem_externa_id)"
            );
        }

        $executado = true;
    } catch (Throwable $e) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Não foi possível preparar a integração com pedidos online: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage()),
        ], 500);
    }
}

garantir_schema_integracao_online($pdo);

/**
 * Marco de corte da integração online.
 *
 * Esta versão NÃO deve trazer pedidos históricos do WooCommerce para a
 * Confecção. Na primeira requisição após a implantação, gravamos um marco
 * UNIX no próprio banco. Pedidos online importados antes desse marco ficam
 * fora da fila de Confecção, sem apagar o histórico já gravado.
 *
 * A mesma data também é usada pela reconciliação do Next.js para consultar
 * somente pedidos WooCommerce criados a partir da ativação desta versão.
 */
function inicio_integracao_online_unix(PDO $pdo): int {
    static $inicio = null;
    if (is_int($inicio) && $inicio > 0) return $inicio;

    try {
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS coroas_integracao_config (
                chave VARCHAR(100) NOT NULL PRIMARY KEY,
                valor VARCHAR(255) NOT NULL,
                criado_em DATETIME NOT NULL,
                atualizado_em DATETIME NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );

        // Chave nova desta versão. Assim o corte acontece exatamente quando
        // esta correção começa a rodar, e não reaproveita importações antigas.
        $chave = 'online_confeccao_v3_inicio_unix';

        $stInsert = $pdo->prepare(
            "INSERT IGNORE INTO coroas_integracao_config
                (chave, valor, criado_em, atualizado_em)
             VALUES
                (:chave, CAST(UNIX_TIMESTAMP() AS CHAR), NOW(), NOW())"
        );
        $stInsert->execute([':chave' => $chave]);

        $st = $pdo->prepare(
            "SELECT valor
             FROM coroas_integracao_config
             WHERE chave = :chave
             LIMIT 1"
        );
        $st->execute([':chave' => $chave]);

        $valor = (int)($st->fetchColumn() ?: 0);
        if ($valor <= 0) {
            throw new RuntimeException('Marco da integração online inválido.');
        }

        $inicio = $valor;
        return $inicio;
    } catch (Throwable $e) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Não foi possível preparar o marco da integração online: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage()),
        ], 500);
    }
}

$INICIO_INTEGRACAO_ONLINE_UNIX = inicio_integracao_online_unix($pdo);

/**
 * 09/11/2026: marco da importação tolerante (pedido da loja entra mesmo com produto não vinculado,
 * sem saldo ou com categoria errada). É gravado na primeira execução desta versão.
 * Pedidos criados na loja ANTES dele e que tinham sido recusados continuam fora, para não
 * reaparecerem na Confecção pedidos antigos que a equipe já resolveu por fora.
 */
function inicio_importacao_tolerante_unix(PDO $pdo): int {
    static $inicio = null;
    if (is_int($inicio) && $inicio > 0) return $inicio;
    try {
        $chave = 'online_importacao_tolerante_v1_unix';
        $pdo->prepare(
            "INSERT IGNORE INTO coroas_integracao_config (chave, valor, criado_em, atualizado_em)
             VALUES (:chave, CAST(UNIX_TIMESTAMP() AS CHAR), NOW(), NOW())"
        )->execute([':chave' => $chave]);
        $st = $pdo->prepare("SELECT valor FROM coroas_integracao_config WHERE chave = :chave LIMIT 1");
        $st->execute([':chave' => $chave]);
        $inicio = (int)($st->fetchColumn() ?: 0);
        if ($inicio <= 0) $inicio = time();
        return $inicio;
    } catch (Throwable $e) {
        // Sem o marco, age como pedido novo (comportamento seguro para pedidos chegando agora).
        return 0;
    }
}
// Grava o marco já na primeira execução desta versão (não só quando surge a primeira pendência).
inicio_importacao_tolerante_unix($pdo);

/* =========================================================
   PEDIDOS / ITENS
   ========================================================= */
function buscar_pedido(PDO $pdo, int $id, bool $forUpdate = false): ?array {
    if ($id <= 0) return null;

    $sql = 'SELECT * FROM coroas WHERE id = :id LIMIT 1';
    if ($forUpdate) $sql .= ' FOR UPDATE';

    $st = $pdo->prepare($sql);
    $st->execute([':id' => $id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function buscar_pedido_por_atendimento(PDO $pdo, int $atendimentoId, bool $forUpdate = false): ?array {
    if ($atendimentoId <= 0) return null;
    $sql = 'SELECT * FROM coroas WHERE atendimento_origem_id = :id LIMIT 1';
    if ($forUpdate) $sql .= ' FOR UPDATE';
    $st = $pdo->prepare($sql);
    $st->execute([':id' => $atendimentoId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function pedido_entrou_producao(array $row): bool {
    $status = strtolower(trim((string)($row['status'] ?? 'novo')));
    return $status !== 'novo'
        || !empty($row['coroa_inicio_em'])
        || !empty($row['faixa_inicio_em'])
        || !empty($row['finalizada_em'])
        || !empty($row['entregue_em']);
}

/* =========================================================
   ETAPA POR COROA (07/10/2026)
   Cada coroa do pedido (coroas_itens) anda sozinha na Confecção: coroa, faixa,
   foto/finalizada e entregue. A etapa do pedido (tabela coroas) vira o resumo:
   - coroa/faixa iniciadas: a primeira coroa que iniciou;
   - finalizada: só quando TODAS as coroas foram finalizadas;
   - entregue: só quando TODAS foram entregues (até lá o pedido segue na Confecção).
   Sem as colunas (sql/coroas_etapa_por_coroa.sql), tudo funciona como antes (etapa do pedido).
   ========================================================= */
function coroas_itens_tem_etapas(PDO $pdo): bool {
    static $tem = null;
    if ($tem === null) {
        try {
            $tem = (bool)$pdo->query("SHOW COLUMNS FROM coroas_itens LIKE 'entregue_por'")->fetch(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            $tem = false;
        }
    }
    return $tem;
}

function colunas_etapa_itens_sql(PDO $pdo): string {
    if (!coroas_itens_tem_etapas($pdo)) return '';
    return '
            status,
            coroa_inicio_em,
            coroa_inicio_por,
            faixa_inicio_em,
            faixa_inicio_por,
            foto_coroa_url,
            foto_coroa_path,
            foto_coroa_em,
            foto_coroa_por,
            finalizada_em,
            finalizada_por,
            entregue_em,
            entregue_por,';
}

function buscar_item_coroa(PDO $pdo, int $pedidoId, int $itemId, bool $forUpdate = false): ?array {
    if ($pedidoId <= 0 || $itemId <= 0) return null;
    $sql = 'SELECT * FROM coroas_itens WHERE id = :item AND coroa_id = :pedido LIMIT 1';
    if ($forUpdate) $sql .= ' FOR UPDATE';
    $st = $pdo->prepare($sql);
    $st->execute([':item' => $itemId, ':pedido' => $pedidoId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** Refaz a etapa do pedido a partir das etapas das coroas. */
function recalcular_etapa_pedido(PDO $pdo, int $pedidoId): void {
    if (!coroas_itens_tem_etapas($pdo)) return;

    $st = $pdo->prepare('SELECT * FROM coroas_itens WHERE coroa_id = :id ORDER BY ordem ASC, id ASC');
    $st->execute([':id' => $pedidoId]);
    $itens = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    if (!$itens) return;

    $primeiro = static function (array $itens, string $campo): ?array {
        $achado = null;
        foreach ($itens as $it) {
            if (empty($it[$campo])) continue;
            if ($achado === null || strcmp((string)$it[$campo], (string)$achado[$campo]) < 0) $achado = $it;
        }
        return $achado;
    };
    $ultimo = static function (array $itens, string $campo): ?array {
        $achado = null;
        foreach ($itens as $it) {
            if (empty($it[$campo])) return null; // falta uma coroa: o pedido ainda não chegou nesta etapa
            if ($achado === null || strcmp((string)$it[$campo], (string)$achado[$campo]) > 0) $achado = $it;
        }
        return $achado;
    };

    $coroa = $primeiro($itens, 'coroa_inicio_em');
    $faixa = $primeiro($itens, 'faixa_inicio_em');
    $finalizada = $ultimo($itens, 'finalizada_em');
    $entregue = $ultimo($itens, 'entregue_em');

    $algumaFinalizada = false;
    foreach ($itens as $it) {
        if (!empty($it['finalizada_em'])) $algumaFinalizada = true;
    }

    if ($entregue) $status = 'entregue';
    elseif ($finalizada) $status = 'finalizada';
    elseif ($faixa || $algumaFinalizada) $status = 'faixa';
    elseif ($coroa) $status = 'coroa';
    else $status = 'novo';

    $params = [
        ':status' => $status,
        ':coroa_em' => $coroa['coroa_inicio_em'] ?? null,
        ':coroa_por' => $coroa['coroa_inicio_por'] ?? null,
        ':faixa_em' => $faixa['faixa_inicio_em'] ?? null,
        ':faixa_por' => $faixa['faixa_inicio_por'] ?? null,
        ':fin_em' => $finalizada['finalizada_em'] ?? null,
        ':fin_por' => $finalizada['finalizada_por'] ?? null,
        ':ent_em' => $entregue['entregue_em'] ?? null,
        ':ent_por' => $entregue['entregue_por'] ?? null,
        ':id' => $pedidoId,
    ];

    // Foto do pedido: a da última coroa finalizada (o pedido inteiro só fica pronto com todas).
    $foto = '';
    if ($finalizada && !empty($finalizada['foto_coroa_url'])) {
        $foto = ',
            foto_coroa_url = :foto_url,
            foto_coroa_path = :foto_path,
            foto_coroa_em = :foto_em,
            foto_coroa_por = :foto_por';
        $params[':foto_url'] = $finalizada['foto_coroa_url'];
        $params[':foto_path'] = $finalizada['foto_coroa_path'] ?? null;
        $params[':foto_em'] = $finalizada['foto_coroa_em'] ?? null;
        $params[':foto_por'] = $finalizada['foto_coroa_por'] ?? null;
    }

    $pdo->prepare(
        "UPDATE coroas SET
            status = :status,
            coroa_inicio_em = :coroa_em,
            coroa_inicio_por = :coroa_por,
            faixa_inicio_em = :faixa_em,
            faixa_inicio_por = :faixa_por,
            finalizada_em = :fin_em,
            finalizada_por = :fin_por,
            entregue_em = :ent_em,
            entregue_por = :ent_por{$foto},
            atualizado_em = NOW()
         WHERE id = :id
         LIMIT 1"
    )->execute($params);
}

/**
 * App antigo (sem item_id): a ação vale para o pedido inteiro. Leva a mesma etapa para as
 * coroas que ainda não a tinham, para o cartão de cada coroa mostrar o mesmo que o pedido.
 */
function espelhar_etapa_pedido_nos_itens(PDO $pdo, int $pedidoId): void {
    if (!coroas_itens_tem_etapas($pdo)) return;
    $pdo->prepare(
        "UPDATE coroas_itens ci
           JOIN coroas c ON c.id = ci.coroa_id
            SET ci.coroa_inicio_em = COALESCE(ci.coroa_inicio_em, c.coroa_inicio_em),
                ci.coroa_inicio_por = COALESCE(ci.coroa_inicio_por, c.coroa_inicio_por),
                ci.faixa_inicio_em = COALESCE(ci.faixa_inicio_em, c.faixa_inicio_em),
                ci.faixa_inicio_por = COALESCE(ci.faixa_inicio_por, c.faixa_inicio_por),
                ci.foto_coroa_url = COALESCE(ci.foto_coroa_url, IF(c.finalizada_em IS NULL, NULL, c.foto_coroa_url)),
                ci.foto_coroa_path = COALESCE(ci.foto_coroa_path, IF(c.finalizada_em IS NULL, NULL, c.foto_coroa_path)),
                ci.foto_coroa_em = COALESCE(ci.foto_coroa_em, IF(c.finalizada_em IS NULL, NULL, c.foto_coroa_em)),
                ci.foto_coroa_por = COALESCE(ci.foto_coroa_por, IF(c.finalizada_em IS NULL, NULL, c.foto_coroa_por)),
                ci.finalizada_em = COALESCE(ci.finalizada_em, c.finalizada_em),
                ci.finalizada_por = COALESCE(ci.finalizada_por, c.finalizada_por),
                ci.entregue_em = COALESCE(ci.entregue_em, c.entregue_em),
                ci.entregue_por = COALESCE(ci.entregue_por, c.entregue_por),
                ci.status = CASE
                    WHEN COALESCE(ci.entregue_em, c.entregue_em) IS NOT NULL THEN 'entregue'
                    WHEN COALESCE(ci.finalizada_em, c.finalizada_em) IS NOT NULL THEN 'finalizada'
                    WHEN COALESCE(ci.faixa_inicio_em, c.faixa_inicio_em) IS NOT NULL THEN 'faixa'
                    WHEN COALESCE(ci.coroa_inicio_em, c.coroa_inicio_em) IS NOT NULL THEN 'coroa'
                    ELSE 'novo'
                END,
                ci.atualizado_em = NOW()
          WHERE ci.coroa_id = :id"
    )->execute([':id' => $pedidoId]);
}

/** Coroa N de M do pedido (para a notificação). */
function rotulo_coroa_do_pedido(PDO $pdo, int $pedidoId, int $itemId): string {
    $st = $pdo->prepare('SELECT id FROM coroas_itens WHERE coroa_id = :id ORDER BY ordem ASC, id ASC');
    $st->execute([':id' => $pedidoId]);
    $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []);
    $pos = array_search($itemId, $ids, true);
    if ($pos === false || count($ids) <= 1) return '';
    return 'coroa ' . ($pos + 1) . ' de ' . count($ids);
}

function buscar_itens_pedido(PDO $pdo, int $pedidoId): array {
    if ($pedidoId <= 0) return [];

    $st = $pdo->prepare(
        'SELECT
            id,
            coroa_id,
            ordem,
            tipo_coroa,
            produto_id,
            deposito_nome,
            modelo_coroa,
            frase,
            valor,
            foto_produto_url,' . colunas_etapa_itens_sql($pdo) . '
            criado_em,
            atualizado_em
         FROM coroas_itens
         WHERE coroa_id = :id
         ORDER BY ordem ASC, id ASC'
    );
    $st->execute([':id' => $pedidoId]);

    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($rows as &$item) {
        if (array_key_exists('foto_produto_url', $item)) {
            $item['foto_produto_url'] = url_publica_produto($item['foto_produto_url']);
        }
        if (array_key_exists('foto_coroa_url', $item)) {
            $item['foto_coroa_url'] = url_publica_coroas($item['foto_coroa_url']);
        }
        unset($item['foto_coroa_path']);
        $item['ordem'] = (int)($item['ordem'] ?? 0);
        $item['produto_id'] = !empty($item['produto_id']) ? (int)$item['produto_id'] : null;
        $item['valor'] = $item['valor'] !== null ? (float)$item['valor'] : null;
    }
    unset($item);

    return $rows;
}

function pedido_somente_artificial_por_itens(array $itens): bool {
    if (!$itens) return false;

    foreach ($itens as $item) {
        $tipo = strtolower(trim((string)($item['tipo_coroa'] ?? '')));

        // Natural, misto ou legado sem tipo conhecido mantém o fluxo tradicional.
        if ($tipo !== 'artificial') {
            return false;
        }
    }

    return true;
}

function pedido_exige_confeccao_coroa_por_itens(array $itens): bool {
    return !pedido_somente_artificial_por_itens($itens);
}

function buscar_itens_pedidos(PDO $pdo, array $pedidoIds): array {
    $ids = array_values(array_unique(array_filter(
        array_map('intval', $pedidoIds),
        static fn($id) => $id > 0
    )));

    if (!$ids) return [];

    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    $st = $pdo->prepare(
        "SELECT
            id,
            coroa_id,
            ordem,
            tipo_coroa,
            produto_id,
            deposito_nome,
            modelo_coroa,
            frase,
            valor,
            foto_produto_url," . colunas_etapa_itens_sql($pdo) . "
            criado_em,
            atualizado_em
         FROM coroas_itens
         WHERE coroa_id IN ({$placeholders})
         ORDER BY coroa_id ASC, ordem ASC, id ASC"
    );

    foreach ($ids as $i => $id) {
        $st->bindValue($i + 1, $id, PDO::PARAM_INT);
    }

    $st->execute();
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $porPedido = [];

    foreach ($rows as $item) {
        $pedidoId = (int)($item['coroa_id'] ?? 0);
        if ($pedidoId <= 0) continue;

        if (array_key_exists('foto_produto_url', $item)) {
            $item['foto_produto_url'] = url_publica_produto($item['foto_produto_url']);
        }
        if (array_key_exists('foto_coroa_url', $item)) {
            $item['foto_coroa_url'] = url_publica_coroas($item['foto_coroa_url']);
        }
        unset($item['foto_coroa_path']);

        $item['ordem'] = (int)($item['ordem'] ?? 0);
        $item['produto_id'] = !empty($item['produto_id'])
            ? (int)$item['produto_id']
            : null;
        $item['valor'] = $item['valor'] !== null
            ? (float)$item['valor']
            : null;

        $porPedido[$pedidoId][] = $item;
    }

    return $porPedido;
}

/* =========================================================
   PEDIDOS DA ORDEM DE SERVIÇO: DADOS DO ATENDIMENTO (29/10/2026)
   Para origem 'ordem_servico', cliente, telefone e falecido vêm sempre do atendimento
   (sepultamentos): cliente = "OS - " + Nome do Responsável, telefone = Contato.
   Na leitura, o atendimento prevalece sobre o que foi gravado na coroa, porque a
   sincronização pode ter acontecido antes de o atendimento ter esses campos preenchidos
   (ou com valores que depois foram corrigidos).
   ========================================================= */
function coroas_nome_cliente_os(string $responsavel, int $atendimentoId): string {
    $responsavel = trim($responsavel);
    if ($responsavel !== '') return 'OS - ' . $responsavel;
    return 'OS - Atendimento #' . $atendimentoId;
}

/** [atendimento_id => ['falecido','nome_responsavel','contato']] dos atendimentos informados. */
function coroas_dados_atendimentos(PDO $pdo, array $atendimentoIds): array {
    $ids = array_values(array_unique(array_filter(array_map('intval', $atendimentoIds), static fn($i) => $i > 0)));
    if (!$ids) return [];
    try {
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $st = $pdo->prepare("SELECT id, falecido, nome_responsavel, contato FROM sepultamentos WHERE id IN ($marcas)");
        $st->execute($ids);
        $saida = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $r) {
            $saida[(int)$r['id']] = $r;
        }
        return $saida;
    } catch (Throwable $e) {
        // sem o atendimento, mostra o que está gravado na coroa
        return [];
    }
}

function coroas_aplicar_dados_atendimento(array $row, ?array $at): array {
    if (strtolower(trim((string)($row['origem'] ?? ''))) !== 'ordem_servico') return $row;
    $atendimentoId = (int)($row['atendimento_origem_id'] ?? 0);
    if ($atendimentoId <= 0) $atendimentoId = (int)($row['falecido_atendimento_id'] ?? 0);
    if ($atendimentoId <= 0) return $row;

    if ($at) {
        $row['solicitante'] = coroas_nome_cliente_os(texto($at['nome_responsavel'] ?? ''), $atendimentoId);
        $contato = texto($at['contato'] ?? '');
        if ($contato !== '') $row['telefone'] = $contato;
        $falecido = texto($at['falecido'] ?? '');
        if ($falecido !== '') $row['falecido'] = $falecido;
    } else {
        // atendimento indisponível: só ajusta o formato do nome antigo
        $atual = trim((string)($row['solicitante'] ?? ''));
        if ($atual === '' || stripos($atual, 'Ordem de Serviço - Atendimento #') === 0) {
            $row['solicitante'] = 'OS - Atendimento #' . $atendimentoId;
        } elseif (strpos($atual, 'OS - ') !== 0) {
            $row['solicitante'] = 'OS - ' . $atual;
        }
    }
    return $row;
}

function coroas_id_atendimento_row(array $row): int {
    $id = (int)($row['atendimento_origem_id'] ?? 0);
    return $id > 0 ? $id : (int)($row['falecido_atendimento_id'] ?? 0);
}

function normalizar_rows_saida(array $rows, PDO $pdo): array {
    if (!$rows) return [];

    $ids = array_map(
        static fn($row) => (int)($row['id'] ?? 0),
        $rows
    );

    $itensPorPedido = buscar_itens_pedidos($pdo, $ids);
    $idsAtendimentoOs = [];
    foreach ($rows as $r) {
        if (strtolower(trim((string)($r['origem'] ?? ''))) === 'ordem_servico') {
            $idsAtendimentoOs[] = coroas_id_atendimento_row($r);
        }
    }
    $dadosAtendimentos = coroas_dados_atendimentos($pdo, $idsAtendimentoOs);
    $saida = [];

    foreach ($rows as $row) {
        $row = coroas_aplicar_dados_atendimento($row, $dadosAtendimentos[coroas_id_atendimento_row($row)] ?? null);

        if (array_key_exists('comprovante_url', $row)) {
            $row['comprovante_url'] = url_publica_coroas($row['comprovante_url']);
        }

        if (array_key_exists('foto_coroa_url', $row)) {
            $row['foto_coroa_url'] = url_publica_coroas($row['foto_coroa_url']);
        }

        $pedidoId = (int)($row['id'] ?? 0);
        $itens = $itensPorPedido[$pedidoId] ?? [];

        // Compatibilidade com registros antigos.
        if (!$itens && trim((string)($row['modelo_coroa'] ?? '')) !== '') {
            $itens = [[
                'id' => null,
                'coroa_id' => $pedidoId,
                'ordem' => 1,
                'tipo_coroa' => null,
                'produto_id' => null,
                'deposito_nome' => null,
                'modelo_coroa' => (string)($row['modelo_coroa'] ?? ''),
                'frase' => (string)($row['frase'] ?? ''),
                'valor' => null,
                'foto_produto_url' => null,
                'criado_em' => $row['criado_em'] ?? null,
                'atualizado_em' => $row['atualizado_em'] ?? null,
            ]];
        }

        $row['itens'] = $itens;

        $qtd = (int)($row['quantidade_coroas'] ?? 0);
        if ($qtd <= 0) $qtd = max(1, count($itens));
        $row['quantidade_coroas'] = $qtd;

        $saida[] = $row;
    }

    return $saida;
}

function normalizar_row_saida(array $row, PDO $pdo): array {
    if (strtolower(trim((string)($row['origem'] ?? ''))) === 'ordem_servico') {
        $idAt = coroas_id_atendimento_row($row);
        $row = coroas_aplicar_dados_atendimento($row, coroas_dados_atendimentos($pdo, [$idAt])[$idAt] ?? null);
    }

    if (array_key_exists('comprovante_url', $row)) {
        $row['comprovante_url'] = url_publica_coroas($row['comprovante_url']);
    }

    if (array_key_exists('foto_coroa_url', $row)) {
        $row['foto_coroa_url'] = url_publica_coroas($row['foto_coroa_url']);
    }

    $itens = buscar_itens_pedido($pdo, (int)($row['id'] ?? 0));

    // Compatibilidade com registros antigos que ainda não possuam item migrado.
    if (!$itens && trim((string)($row['modelo_coroa'] ?? '')) !== '') {
        $itens = [[
            'id' => null,
            'coroa_id' => (int)($row['id'] ?? 0),
            'ordem' => 1,
            'tipo_coroa' => null,
            'produto_id' => null,
            'deposito_nome' => null,
            'modelo_coroa' => (string)($row['modelo_coroa'] ?? ''),
            'frase' => (string)($row['frase'] ?? ''),
            'valor' => null,
            'foto_produto_url' => null,
            'criado_em' => $row['criado_em'] ?? null,
            'atualizado_em' => $row['atualizado_em'] ?? null,
        ]];
    }

    $row['itens'] = $itens;

    $q = (int)($row['quantidade_coroas'] ?? 0);
    if ($q <= 0) $q = max(1, count($itens));
    $row['quantidade_coroas'] = $q;

    return $row;
}

function resumo_compatibilidade_itens(array $itens): array {
    $primeiro = $itens[0] ?? [];
    $modelo = trim((string)($primeiro['modelo_coroa'] ?? ''));
    $frase = trim((string)($primeiro['frase'] ?? ''));

    if (count($itens) > 1 && $modelo !== '') {
        $modelo .= ' +' . (count($itens) - 1);
    }

    return [$modelo, $frase];
}

function produto_coroa_estoque_ou_erro(PDO $pdo, int $produtoId, string $tipo, ?string $depositoNome = null): array {
    if ($produtoId <= 0) {
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'Selecione um modelo de coroa válido.'], 400);
    }

    $st = $pdo->prepare(
        'SELECT
            p.id,
            p.nome,
            p.codigo_barras,
            p.valor,
            p.foto_url,
            p.ativo,
            c.nome AS categoria_nome
         FROM est_produto p
         LEFT JOIN est_categoria c ON c.id = p.categoria_id
         WHERE p.id = :id
         LIMIT 1'
    );
    $st->execute([':id' => $produtoId]);
    $produto = $st->fetch(PDO::FETCH_ASSOC);

    if (!$produto || (int)($produto['ativo'] ?? 0) !== 1) {
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'O modelo de coroa selecionado não está disponível.'], 400);
    }

    $categoria = normalizar_chave((string)($produto['categoria_nome'] ?? ''));
    $esperada = $tipo === 'natural' ? 'coroas naturais' : 'coroas artificiais';
    if ($categoria !== $esperada) {
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'O modelo selecionado não pertence ao tipo de coroa informado.'], 400);
    }

    $produto['deposito_nome'] = null;
    $produto['deposito_id'] = null;
    $produto['saldo_deposito'] = null;

    if ($tipo !== 'artificial') return $produto;

    $permitidos = ['MEMORIAL', 'FUNERARIA'];
    $dep = normalizar_chave((string)$depositoNome);
    $dep = strtoupper($dep);

    if ($dep !== '' && !in_array($dep, $permitidos, true)) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Coroa Artificial: depósitos permitidos são MEMORIAL e FUNERARIA.',
        ], 400);
    }

    // Pedidos internos/manuais informam o depósito. Para integrações antigas/online
    // sem depósito, escolhe primeiro MEMORIAL e depois FUNERARIA, sempre com saldo.
    $sql = 'SELECT d.id, d.nome, s.quantidade
              FROM est_saldo s
              INNER JOIN est_deposito d ON d.id = s.deposito_id
             WHERE s.produto_id = :produto_id
               AND UPPER(TRIM(d.nome)) IN (\'MEMORIAL\', \'FUNERARIA\')
               AND s.quantidade > 0';
    $params = [':produto_id' => $produtoId];

    if ($dep !== '') {
        $sql .= ' AND UPPER(TRIM(d.nome)) = :deposito ';
        $params[':deposito'] = $dep;
    }

    $sql .= " ORDER BY CASE UPPER(TRIM(d.nome)) WHEN 'MEMORIAL' THEN 0 ELSE 1 END LIMIT 1";
    $saldoSt = $pdo->prepare($sql);
    $saldoSt->execute($params);
    $saldoRow = $saldoSt->fetch(PDO::FETCH_ASSOC);

    if (!$saldoRow) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => $dep !== ''
                ? "A coroa artificial selecionada não possui saldo disponível no depósito {$dep}."
                : 'A coroa artificial selecionada não possui saldo disponível em MEMORIAL ou FUNERARIA.',
        ], 409);
    }

    $produto['deposito_nome'] = strtoupper(trim((string)$saldoRow['nome']));
    $produto['deposito_id'] = (int)$saldoRow['id'];
    $produto['saldo_deposito'] = (int)$saldoRow['quantidade'];
    return $produto;
}

function validar_saldo_artificiais_agrupado(PDO $pdo, array $itens): void {
    $grupos = [];
    foreach ($itens as $item) {
        if (strtolower(trim((string)($item['tipo_coroa'] ?? ''))) !== 'artificial') continue;
        $pid = (int)($item['produto_id'] ?? 0);
        $dep = strtoupper(trim((string)($item['deposito_nome'] ?? '')));
        if ($pid <= 0 || !in_array($dep, ['MEMORIAL', 'FUNERARIA'], true)) continue;
        $key = $pid . '|' . $dep;
        if (!isset($grupos[$key])) {
            $grupos[$key] = [
                'produto_id' => $pid,
                'deposito_nome' => $dep,
                'modelo' => (string)($item['modelo_coroa'] ?? ''),
                'qtd' => 0,
            ];
        }
        $grupos[$key]['qtd']++;
    }

    foreach ($grupos as $grupo) {
        $st = $pdo->prepare(
            'SELECT COALESCE(s.quantidade, 0) AS saldo
               FROM est_deposito d
               LEFT JOIN est_saldo s
                 ON s.deposito_id = d.id
                AND s.produto_id = :produto_id
              WHERE UPPER(TRIM(d.nome)) = :deposito
              LIMIT 1'
        );
        $st->execute([
            ':produto_id' => $grupo['produto_id'],
            ':deposito' => $grupo['deposito_nome'],
        ]);
        $saldo = (int)($st->fetchColumn() ?: 0);
        if ($saldo < (int)$grupo['qtd']) {
            responder([
                'sucesso' => false,
                'erro' => true,
                'msg' => sprintf(
                    'Saldo insuficiente para %s em %s. Disponível: %d; solicitado: %d.',
                    $grupo['modelo'] ?: 'Coroa Artificial',
                    $grupo['deposito_nome'],
                    $saldo,
                    (int)$grupo['qtd']
                ),
            ], 409);
        }
    }
}



/**
 * Localiza o produto do WooCommerce no estoque interno.
 * Prioridade: SKU do WooCommerce igual ao codigo_barras do est_produto.
 * Fallback: nome exato e único do produto.
 */
function resolver_produto_online(PDO $pdo, string $sku, string $nomeWoo): ?array {
    $sku = trim($sku);
    $nomeWoo = trim($nomeWoo);

    if ($sku !== '') {
        $st = $pdo->prepare(
            'SELECT
                p.id,
                p.nome,
                p.codigo_barras,
                p.valor,
                p.foto_url,
                p.ativo,
                p.categoria_id,
                c.nome AS categoria_nome
             FROM est_produto p
             LEFT JOIN est_categoria c ON c.id = p.categoria_id
             WHERE p.codigo_barras = :sku
               AND p.ativo = 1
             LIMIT 1'
        );
        $st->execute([':sku' => $sku]);
        $produto = $st->fetch(PDO::FETCH_ASSOC);
        if ($produto) return $produto;
    }

    if ($nomeWoo !== '') {
        $st = $pdo->prepare(
            'SELECT
                p.id,
                p.nome,
                p.codigo_barras,
                p.valor,
                p.foto_url,
                p.ativo,
                p.categoria_id,
                c.nome AS categoria_nome
             FROM est_produto p
             LEFT JOIN est_categoria c ON c.id = p.categoria_id
             WHERE LOWER(TRIM(p.nome)) = LOWER(TRIM(:nome))
               AND p.ativo = 1
             LIMIT 2'
        );
        $st->execute([':nome' => $nomeWoo]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

        if (count($rows) === 1) {
            return $rows[0];
        }
    }

    return null;
}

function tipo_coroa_por_categoria_online(?string $categoria): ?string {
    $normalizada = normalizar_chave((string)$categoria);

    if ($normalizada === 'coroas naturais') return 'natural';
    if ($normalizada === 'coroas artificiais') return 'artificial';

    return null;
}

function buscar_pedido_online_existente(PDO $pdo, string $woocommerceOrderId): ?array {
    $woocommerceOrderId = trim($woocommerceOrderId);
    if ($woocommerceOrderId === '') return null;

    $st = $pdo->prepare(
        'SELECT *
         FROM coroas
         WHERE origem_externa_id = :origem_externa_id
         LIMIT 1'
    );
    $st->execute([':origem_externa_id' => $woocommerceOrderId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

/**
 * Converte os line_items do WooCommerce para a mesma estrutura de
 * coroas_itens usada pelos pedidos criados manualmente.
 */
function normalizar_itens_online(PDO $pdo, $rawItens): array {
    /*
     * 09/11/2026: pedido pago da loja SEMPRE entra na Confecção.
     * Antes, um produto não vinculado ao estoque (SKU/nome diferente), uma categoria fora de
     * "Coroas Naturais/Artificiais" ou uma artificial sem saldo em MEMORIAL/FUNERARIA recusavam o
     * pedido inteiro, e ele não aparecia em lugar nenhum. Agora a coroa entra com o nome e a foto da
     * loja e a pendência vai nas Observações do pedido, para a equipe conferir.
     * (O coroas.php não dá baixa de estoque; o vínculo é informativo para o restante do app.)
     */
    if (!is_array($rawItens) || !$rawItens) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Pedido online sem itens.',
        ], 400);
    }

    $out = [];
    $ignorados = [];       // produtos do estoque que não são coroa (ex.: cartão, vela)
    $pendencias = [];      // texto para as Observações
    $foraDoEstoque = [];   // itens que entraram sem vínculo/sem saldo

    $adicionar = function (array $base, int $quantidade) use (&$out) {
        for ($i = 0; $i < $quantidade; $i++) {
            if (count($out) >= 20) {
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'O pedido online excede o limite de 20 coroas por pedido.',
                ], 422);
            }
            $out[] = array_merge($base, ['ordem' => count($out) + 1]);
        }
    };

    foreach (array_values($rawItens) as $index => $item) {
        if (!is_array($item)) {
            responder([
                'sucesso' => false,
                'erro' => true,
                'msg' => 'Item online inválido na posição ' . ($index + 1) . '.',
            ], 400);
        }

        $sku = texto($item['sku'] ?? '');
        $nomeWoo = texto($item['nome'] ?? $item['name'] ?? '');
        $frase = texto($item['frase'] ?? '');
        if ($frase === '') $frase = 'Frase não informada no pedido online';
        $quantidade = max(1, (int)($item['quantidade'] ?? $item['quantity'] ?? 1));
        $totalLinha = max(0, (float)($item['total'] ?? 0));
        $valorLinhaUnit = $quantidade > 0 && $totalLinha > 0 ? ($totalLinha / $quantidade) : null;
        $fotoWoo = texto($item['foto_url'] ?? '') ?: null;
        $rotulo = ($nomeWoo !== '' ? $nomeWoo : 'Produto sem nome') . ($sku !== '' ? " (SKU {$sku})" : ' (sem SKU)');

        $produto = resolver_produto_online($pdo, $sku, $nomeWoo);

        if (!$produto) {
            // Não achou no estoque: entra com o nome da loja, sem vínculo.
            $pendencias[] = "{$rotulo}: produto não vinculado ao estoque (confira SKU/nome).";
            $foraDoEstoque[] = ['sku' => $sku, 'nome' => $nomeWoo, 'motivo' => 'nao_vinculado'];
            $adicionar([
                'tipo_coroa' => null,
                'produto_id' => null,
                'deposito_nome' => null,
                'modelo_coroa' => $nomeWoo !== '' ? $nomeWoo : 'Coroa (loja on-line)',
                'frase' => $frase,
                'valor' => $valorLinhaUnit ?? 0,
                'foto_produto_url' => $fotoWoo,
            ], $quantidade);
            continue;
        }

        $tipo = tipo_coroa_por_categoria_online($produto['categoria_nome'] ?? null);

        // Produto do estoque que não é coroa (ex.: cartão): fica de fora da Confecção, como antes.
        if ($tipo === null) {
            $ignorados[] = [
                'sku' => $sku,
                'nome' => $nomeWoo,
                'categoria' => $produto['categoria_nome'] ?? null,
                'quantidade' => $quantidade,
                'valor' => $valorLinhaUnit,
                'foto_url' => $fotoWoo,
                'frase' => $frase,
                'produto_nome' => trim((string)($produto['nome'] ?? '')),
            ];
            continue;
        }

        $deposito = null;
        if ($tipo === 'artificial') {
            $saldoSt = $pdo->prepare(
                "SELECT d.nome
                   FROM est_saldo s
                   INNER JOIN est_deposito d ON d.id = s.deposito_id
                  WHERE s.produto_id = :produto_id
                    AND UPPER(TRIM(d.nome)) IN ('MEMORIAL', 'FUNERARIA')
                    AND s.quantidade > 0
                  ORDER BY CASE UPPER(TRIM(d.nome)) WHEN 'MEMORIAL' THEN 0 ELSE 1 END
                  LIMIT 1"
            );
            $saldoSt->execute([':produto_id' => (int)$produto['id']]);
            $depNome = $saldoSt->fetchColumn();
            if ($depNome) {
                $deposito = strtoupper(trim((string)$depNome));
            } else {
                $pendencias[] = "{$rotulo}: coroa artificial sem saldo em MEMORIAL/FUNERARIA (confira o estoque).";
                $foraDoEstoque[] = ['sku' => $sku, 'nome' => $nomeWoo, 'motivo' => 'artificial_sem_saldo'];
            }
        }

        $valorUnitario = $valorLinhaUnit ?? max(0, (float)($produto['valor'] ?? 0));

        $adicionar([
            'tipo_coroa' => $tipo,
            'produto_id' => (int)$produto['id'],
            'deposito_nome' => $deposito,
            'modelo_coroa' => trim((string)$produto['nome']),
            'frase' => $frase,
            'valor' => max(0, $valorUnitario),
            'foto_produto_url' => trim((string)($produto['foto_url'] ?? '')) ?: $fotoWoo,
        ], $quantidade);
    }

    // O pedido veio da loja como pedido de coroa, mas nenhum item caiu nas categorias de coroa:
    // em vez de recusar, os itens entram como coroa para a equipe conferir.
    if (!$out && $ignorados) {
        foreach ($ignorados as $ig) {
            $rot = ($ig['nome'] !== '' ? $ig['nome'] : 'Produto sem nome') . ($ig['sku'] !== '' ? " (SKU {$ig['sku']})" : '');
            $pendencias[] = "{$rot}: categoria \"" . ($ig['categoria'] ?? 'sem categoria') . "\" no estoque não é de coroa (confira o cadastro).";
            $foraDoEstoque[] = ['sku' => $ig['sku'], 'nome' => $ig['nome'], 'motivo' => 'categoria'];
            $adicionar([
                'tipo_coroa' => null,
                'produto_id' => null,
                'deposito_nome' => null,
                'modelo_coroa' => $ig['produto_nome'] !== '' ? $ig['produto_nome'] : ($ig['nome'] !== '' ? $ig['nome'] : 'Coroa (loja on-line)'),
                'frase' => $ig['frase'],
                'valor' => $ig['valor'] ?? 0,
                'foto_produto_url' => $ig['foto_url'],
            ], max(1, (int)$ig['quantidade']));
        }
        $ignorados = [];
    }

    if (!$out) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Nenhuma coroa foi encontrada no pedido online.',
        ], 422);
    }

    return [
        'itens' => $out,
        'ignorados' => $ignorados,
        'pendencias' => $pendencias,
        'fora_do_estoque' => $foraDoEstoque,
    ];
}

function normalizar_itens_entrada(PDO $pdo, $rawItens, int $quantidade, bool $aceitarLegado = false): array {
    if (!is_array($rawItens) || !$rawItens) {
        if ($aceitarLegado) return [];
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'Informe os modelos e frases das coroas.'], 400);
    }

    if (count($rawItens) !== $quantidade) {
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'A quantidade de itens não corresponde à quantidade de coroas.'], 400);
    }

    $out = [];
    foreach (array_values($rawItens) as $index => $item) {
        if (!is_array($item)) {
            responder(['sucesso' => false, 'erro' => true, 'msg' => 'Item de coroa inválido.'], 400);
        }

        $tipo = validar_enum_ou_erro(
            $item['tipo_coroa'] ?? '',
            ['natural', 'artificial'],
            'Tipo da Coroa ' . ($index + 1)
        );

        $produtoId = (int)($item['produto_id'] ?? 0);
        $frase = texto($item['frase'] ?? '');
        $depositoNome = $tipo === 'artificial'
            ? strtoupper(texto($item['deposito_nome'] ?? ''))
            : null;

        if ($frase === '') {
            responder(['sucesso' => false, 'erro' => true, 'msg' => 'Preencha a frase da Coroa ' . ($index + 1) . '.'], 400);
        }
        if ($tipo === 'artificial' && !in_array($depositoNome, ['MEMORIAL', 'FUNERARIA'], true)) {
            responder(['sucesso' => false, 'erro' => true, 'msg' => 'Coroa ' . ($index + 1) . ': selecione MEMORIAL ou FUNERARIA.'], 400);
        }

        $produto = produto_coroa_estoque_ou_erro($pdo, $produtoId, $tipo, $depositoNome);
        $out[] = [
            'ordem' => $index + 1,
            'tipo_coroa' => $tipo,
            'produto_id' => (int)$produto['id'],
            'deposito_nome' => $tipo === 'artificial' ? (string)($produto['deposito_nome'] ?? $depositoNome) : null,
            'modelo_coroa' => trim((string)$produto['nome']),
            'frase' => $frase,
            'valor' => max(0, (float)($produto['valor'] ?? 0)),
            'foto_produto_url' => trim((string)($produto['foto_url'] ?? '')) ?: null,
        ];
    }

    validar_saldo_artificiais_agrupado($pdo, $out);
    return $out;
}

/* =========================================================
   BAIXA NO ESTOQUE NA ENTREGA — coroa artificial da LOJA ON-LINE e da VENDA DIRETA (09/11/2026)
   Regra: a saída acontece no comando "Coroa Entregue" (não na Coroa Pronta).
   - Pedidos da loja (origem_externa_id) e de Venda Direta (inclui os da Aurora e os avulsos de Prefeitura).
     Coroa de atendimento (Ordem de Serviço) continua saindo no Corpo Pronto (estoque_atendimento.php).
   - Só coroas artificiais ligadas a um produto do estoque. Na Coroa Entregue a pessoa ESCOLHE de qual
     estoque sai: MEMORIAL ou FUNERARIA (deposito_baixa). Sem a escolha, a entrega é recusada e a tela
     mostra os dois estoques com o saldo (GET ?entrega_estoque=ID&item_id=N).
   - Uma saída por coroa, referência "Pedido de coroa #ID · coroa #ITEM": repetir o comando não baixa em dobro
     (saída estornada não conta). Sem saldo ou local em conferência: a entrega é recusada com o motivo.
   - Mesmo custo médio móvel da baixa do atendimento. Espera transação aberta pelo chamador.
   ========================================================= */
/** Coroas do pedido que saem do estoque na entrega (artificiais com produto, em Venda Direta ou Loja On-line). */
function coroas_itens_baixa_entrega(array $pedido, array $itens): array {
    $ehLoja = trim((string)($pedido['origem_externa_id'] ?? '')) !== '';
    $ehAtendimento = (int)($pedido['atendimento_origem_id'] ?? 0) > 0
        || strtolower(trim((string)($pedido['origem'] ?? ''))) === 'ordem_servico';
    $ehVendaDireta = !$ehLoja && !$ehAtendimento
        && strtolower(trim((string)($pedido['origem'] ?? ''))) === 'venda_direta';
    if ($ehAtendimento || (!$ehLoja && !$ehVendaDireta)) return [];

    return array_values(array_filter($itens, static function ($it) {
        return strtolower(trim((string)($it['tipo_coroa'] ?? ''))) === 'artificial'
            && (int)($it['produto_id'] ?? 0) > 0
            && empty($it['entregue_em'])
            && strtolower(trim((string)($it['status'] ?? ''))) !== 'entregue';
    }));
}

/** Saldo de um produto no MEMORIAL e na FUNERARIA (para a escolha na Coroa Entregue). */
function coroas_saldos_memorial_funeraria(PDO $pdo, int $produtoId): array {
    $out = ['MEMORIAL' => 0, 'FUNERARIA' => 0];
    $st = $pdo->prepare(
        "SELECT UPPER(TRIM(d.nome)) AS dep, COALESCE(s.quantidade, 0) AS qtd
           FROM est_deposito d
           LEFT JOIN est_saldo s ON s.deposito_id = d.id AND s.produto_id = :p
          WHERE UPPER(TRIM(d.nome)) IN ('MEMORIAL', 'FUNERARIA')"
    );
    $st->execute([':p' => $produtoId]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) ?: [] as $r) {
        $out[(string)$r['dep']] = max(0, (int)$r['qtd']);
    }
    return $out;
}

function coroas_baixar_estoque_na_entrega(PDO $pdo, array $pedido, array $itens, string $depositoEscolhido = ''): array {
    $resultado = ['baixados' => [], 'ignorados' => []];
    $ehLoja = trim((string)($pedido['origem_externa_id'] ?? '')) !== '';
    $artificiais = coroas_itens_baixa_entrega($pedido, $itens);
    if (!$artificiais) return $resultado;

    require_once __DIR__ . '/estoque_atendimento.php';

    $depositoEscolhido = strtoupper(trim($depositoEscolhido));
    if (!in_array($depositoEscolhido, ['MEMORIAL', 'FUNERARIA'], true)) {
        $produtos = [];
        foreach ($artificiais as $it) {
            $pid = (int)$it['produto_id'];
            $produtos[] = [
                'item_id' => (int)($it['id'] ?? 0),
                'produto_id' => $pid,
                'nome' => estq_nome_produto($pdo, $pid) ?: trim((string)($it['modelo_coroa'] ?? '')),
                'saldos' => coroas_saldos_memorial_funeraria($pdo, $pid),
            ];
        }
        throw new EstqErro('Escolha de qual estoque sai a coroa: MEMORIAL ou FUNERÁRIA.', 422, [
            'error_code' => 'ESCOLHER_DEPOSITO',
            'precisa_deposito' => true,
            'produtos' => $produtos,
        ]);
    }

    $pedidoId = (int)($pedido['id'] ?? 0);
    $woo = trim((string)($pedido['origem_externa_id'] ?? ''));
    $falecido = trim((string)($pedido['falecido'] ?? ''));
    $uid = (int)($_SESSION['user_id'] ?? $_SESSION['usuario_id'] ?? $_COOKIE['pai_uid'] ?? 0);
    $filtroEstorno = estq_tem_estorno($pdo) ? ' AND estornado_em IS NULL' : '';
    $temCusto = estq_coluna_existe($pdo, 'est_movimento', 'custo_unitario_snapshot')
        && estq_coluna_existe($pdo, 'est_movimento', 'custo_total_snapshot');

    foreach ($artificiais as $it) {
        $itemId = (int)($it['id'] ?? 0);
        $pid = (int)$it['produto_id'];
        $depNome = $depositoEscolhido;
        $depId = estq_deposito_id($pdo, $depNome);
        if ($depId <= 0) throw new EstqErro("Depósito {$depNome} não encontrado no estoque.", 409);
        estq_exigir_deposito_livre($pdo, $depId);

        $dest = "Pedido de coroa #{$pedidoId} · coroa #{$itemId}";

        $st = $pdo->prepare("SELECT id FROM est_movimento WHERE tipo = 'SAIDA' AND produto_id = :p AND destino_texto = :dest{$filtroEstorno} LIMIT 1 FOR UPDATE");
        $st->execute([':p' => $pid, ':dest' => $dest]);
        if ($st->fetchColumn()) {
            $resultado['ignorados'][] = ['item_id' => $itemId, 'motivo' => 'ja_baixado'];
            continue;
        }

        $st = $pdo->prepare('SELECT id, quantidade FROM est_saldo WHERE produto_id = :p AND deposito_id = :d FOR UPDATE');
        $st->execute([':p' => $pid, ':d' => $depId]);
        $saldo = $st->fetch(PDO::FETCH_ASSOC);
        $atual = $saldo ? (int)$saldo['quantidade'] : 0;
        $nome = estq_nome_produto($pdo, $pid) ?: trim((string)($it['modelo_coroa'] ?? '')) ?: "Produto {$pid}";
        if (!$saldo || $atual < 1) {
            throw new EstqErro(
                "Sem saldo de {$nome} no {$depNome} para dar a saída desta coroa. Faça a transferência para o {$depNome} e confirme a entrega de novo.",
                409,
                ['error_code' => 'ESTOQUE_INSUFICIENTE', 'faltantes' => [[
                    'produto_id' => $pid, 'produto_nome' => $nome, 'deposito_nome' => $depNome,
                    'disponivel' => max(0, $atual), 'necessario' => 1, 'faltante' => 1,
                ]]]
            );
        }

        $custoUnit = null;
        if ($temCusto) {
            try {
                $custos = estq_custos_medios($pdo, [$pid]);
                $custoUnit = isset($custos[$pid]) ? (float)$custos[$pid]['custo_medio'] : null;
            } catch (Throwable $e) {
                $custoUnit = null; // sem o cálculo, a saída sai sem custo (não trava a entrega)
            }
        }

        $novo = $atual - 1;
        $pdo->prepare('UPDATE est_saldo SET quantidade = :q, atualizado_em = NOW() WHERE id = :id')
            ->execute([':q' => $novo, ':id' => (int)$saldo['id']]);

        $params = [
            ':pid' => $pid,
            ':cb' => estq_codigo_barras($pdo, $pid),
            ':dep' => $depId,
            ':dest' => $dest,
            ':op' => $uid,
            ':obs' => 'Coroa Entregue · ' . ($ehLoja ? 'Loja On-line' . ($woo !== '' ? " Woo #{$woo}" : '') : 'Venda Direta')
                . ($falecido !== '' ? " · Falecido(a): {$falecido}" : ''),
        ];
        if ($temCusto && $custoUnit !== null && $custoUnit > 0) {
            $params[':cu'] = round($custoUnit, 4);
            $params[':ct'] = round($custoUnit, 2);
            $pdo->prepare(
                "INSERT INTO est_movimento (tipo, produto_id, codigo_barras_snapshot, quantidade, custo_unitario_snapshot, custo_total_snapshot,
                                            deposito_origem_id, deposito_destino_id, destino_texto, solicitante_usuario_id, operador_usuario_id, observacao, criado_em)
                 VALUES ('SAIDA', :pid, :cb, 1, :cu, :ct, :dep, NULL, :dest, NULL, :op, :obs, NOW())"
            )->execute($params);
        } else {
            $pdo->prepare(
                "INSERT INTO est_movimento (tipo, produto_id, codigo_barras_snapshot, quantidade, deposito_origem_id, deposito_destino_id, destino_texto,
                                            solicitante_usuario_id, operador_usuario_id, observacao, criado_em)
                 VALUES ('SAIDA', :pid, :cb, 1, :dep, NULL, :dest, NULL, :op, :obs, NOW())"
            )->execute($params);
        }

        if ($itemId > 0) {
            $pdo->prepare('UPDATE coroas_itens SET deposito_nome = :d WHERE id = :id LIMIT 1')
                ->execute([':d' => $depNome, ':id' => $itemId]);
        }

        $resultado['baixados'][] = [
            'item_id' => $itemId, 'produto_id' => $pid, 'produto_nome' => $nome,
            'deposito' => $depNome, 'saldo_antes' => $atual, 'saldo_depois' => $novo,
        ];
    }

    return $resultado;
}

function inserir_itens_pedido(PDO $pdo, int $pedidoId, array $itens): void {
    $st = $pdo->prepare(
        'INSERT INTO coroas_itens (
            coroa_id,
            ordem,
            tipo_coroa,
            produto_id,
            deposito_nome,
            modelo_coroa,
            frase,
            valor,
            foto_produto_url,
            criado_em,
            atualizado_em
        ) VALUES (
            :coroa_id,
            :ordem,
            :tipo_coroa,
            :produto_id,
            :deposito_nome,
            :modelo_coroa,
            :frase,
            :valor,
            :foto_produto_url,
            NOW(),
            NOW()
        )'
    );

    foreach ($itens as $item) {
        $st->execute([
            ':coroa_id' => $pedidoId,
            ':ordem' => (int)($item['ordem'] ?? 0),
            ':tipo_coroa' => $item['tipo_coroa'] ?? null,
            ':produto_id' => !empty($item['produto_id']) ? (int)$item['produto_id'] : null,
            ':deposito_nome' => !empty($item['deposito_nome']) ? strtoupper((string)$item['deposito_nome']) : null,
            ':modelo_coroa' => (string)($item['modelo_coroa'] ?? ''),
            ':frase' => (string)($item['frase'] ?? ''),
            ':valor' => isset($item['valor']) ? (float)$item['valor'] : null,
            ':foto_produto_url' => $item['foto_produto_url'] ?? null,
        ]);
    }
}

/* =========================================================
   ARQUIVOS
   ========================================================= */
function extensao_por_mime(string $mime): ?string {
    $map = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    return $map[strtolower($mime)] ?? null;
}

function preparar_base64_arquivo_ou_erro(
    $base64,
    array $mimesPermitidos,
    int $limiteBytes,
    string $mimeInformado = '',
    string $nomeOriginal = ''
): array {
    if (!$base64 || !is_string($base64)) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Arquivo não enviado.',
        ], 400);
    }

    $raw = trim($base64);
    $mimeDataUri = '';

    if (preg_match('#^data:([^;]+);base64,(.*)$#si', $raw, $m)) {
        $mimeDataUri = strtolower(trim((string)$m[1]));
        $raw = (string)$m[2];
    }

    $raw = preg_replace('/\s+/', '', $raw) ?: $raw;
    $bin = base64_decode($raw, true);

    if ($bin === false || strlen($bin) < 20) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Arquivo inválido. Tente novamente.',
        ], 400);
    }

    if (strlen($bin) > $limiteBytes) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Arquivo muito grande.',
        ], 400);
    }

    $detected = '';

    if (function_exists('finfo_open')) {
        $fi = finfo_open(FILEINFO_MIME_TYPE);
        if ($fi) {
            $detected = strtolower((string)(finfo_buffer($fi, $bin) ?: ''));
            finfo_close($fi);
        }
    }

    $mime = $detected ?: $mimeDataUri ?: strtolower(trim($mimeInformado));

    if (!in_array($mime, $mimesPermitidos, true)) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Formato de arquivo não permitido.',
        ], 400);
    }

    $ext = extensao_por_mime($mime);
    if (!$ext) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Não foi possível identificar a extensão do arquivo.',
        ], 400);
    }

    $nomeOriginal = trim($nomeOriginal);
    if ($nomeOriginal === '') {
        $nomeOriginal = 'arquivo.' . $ext;
    }

    return [
        'bin' => $bin,
        'mime' => $mime,
        'ext' => $ext,
        'nome_original' => mb_substr($nomeOriginal, 0, 255, 'UTF-8'),
    ];
}

function upload_arquivo_presente(string $campo): bool {
    if (!isset($_FILES[$campo]) || !is_array($_FILES[$campo])) return false;
    $erro = (int)($_FILES[$campo]['error'] ?? UPLOAD_ERR_NO_FILE);
    return $erro !== UPLOAD_ERR_NO_FILE;
}

function preparar_upload_arquivo_ou_erro(
    string $campo,
    array $mimesPermitidos,
    int $limiteBytes
): array {
    $file = $_FILES[$campo] ?? null;

    if (!is_array($file)) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Arquivo não enviado.',
        ], 400);
    }

    $erro = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($erro !== UPLOAD_ERR_OK) {
        $mensagens = [
            UPLOAD_ERR_INI_SIZE => 'O arquivo excede o limite configurado no servidor.',
            UPLOAD_ERR_FORM_SIZE => 'O arquivo excede o limite permitido.',
            UPLOAD_ERR_PARTIAL => 'O envio do arquivo foi interrompido. Tente novamente.',
            UPLOAD_ERR_NO_FILE => 'Arquivo não enviado.',
            UPLOAD_ERR_NO_TMP_DIR => 'Pasta temporária indisponível no servidor.',
            UPLOAD_ERR_CANT_WRITE => 'O servidor não conseguiu gravar o arquivo temporário.',
            UPLOAD_ERR_EXTENSION => 'O upload foi bloqueado por uma extensão do servidor.',
        ];

        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => $mensagens[$erro] ?? 'Falha no upload do arquivo.',
        ], 400);
    }

    $tmp = (string)($file['tmp_name'] ?? '');
    $size = (int)($file['size'] ?? 0);
    if ($tmp === '' || !is_file($tmp) || $size <= 0) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Arquivo temporário inválido.',
        ], 400);
    }

    if ($size > $limiteBytes) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Arquivo muito grande.',
        ], 400);
    }

    $mime = '';
    if (function_exists('finfo_open')) {
        $fi = finfo_open(FILEINFO_MIME_TYPE);
        if ($fi) {
            $mime = strtolower((string)(finfo_file($fi, $tmp) ?: ''));
            finfo_close($fi);
        }
    }

    if ($mime === '') {
        $mime = strtolower(trim((string)($file['type'] ?? '')));
    }

    if (!in_array($mime, $mimesPermitidos, true)) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Formato de arquivo não permitido.',
        ], 400);
    }

    $ext = extensao_por_mime($mime);
    if (!$ext) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Não foi possível identificar a extensão do arquivo.',
        ], 400);
    }

    $nomeOriginal = trim((string)($file['name'] ?? ''));
    if ($nomeOriginal === '') $nomeOriginal = 'arquivo.' . $ext;
    $nomeOriginal = function_exists('mb_substr')
        ? mb_substr($nomeOriginal, 0, 255, 'UTF-8')
        : substr($nomeOriginal, 0, 255);

    return [
        'tmp_name' => $tmp,
        'size' => $size,
        'mime' => $mime,
        'ext' => $ext,
        'nome_original' => $nomeOriginal,
    ];
}

function caminho_destino_coroas(int $pedidoId, string $prefixo, string $ext): array {
    $dir = __DIR__ . '/uploads/coroas/';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
        throw new RuntimeException('Falha ao criar a pasta uploads/coroas.');
    }

    $safePrefix = preg_replace('/[^a-z0-9_\-]/i', '_', $prefixo) ?: 'arquivo';
    $fileName =
        $safePrefix . '_' .
        $pedidoId . '_' .
        date('Ymd_His') . '_' .
        bin2hex(random_bytes(4)) . '.' .
        $ext;

    return [
        'dir' => $dir,
        'file_name' => $fileName,
        'file_path' => $dir . $fileName,
        'url' => '/uploads/coroas/' . $fileName,
        'path' => 'uploads/coroas/' . $fileName,
    ];
}

function salvar_upload_direto_coroas(
    int $pedidoId,
    string $prefixo,
    array $prepared
): array {
    $dest = caminho_destino_coroas($pedidoId, $prefixo, (string)$prepared['ext']);
    $tmp = (string)$prepared['tmp_name'];

    $ok = @move_uploaded_file($tmp, $dest['file_path']);
    if (!$ok) $ok = @rename($tmp, $dest['file_path']);
    if (!$ok) $ok = @copy($tmp, $dest['file_path']);

    if (!$ok) {
        throw new RuntimeException('Falha ao salvar o arquivo enviado.');
    }

    return [
        'url' => $dest['url'],
        'path' => $dest['path'],
        'file_path' => $dest['file_path'],
        'mime' => (string)$prepared['mime'],
        'nome_original' => (string)$prepared['nome_original'],
    ];
}

function carregar_imagem_gd_upload(array $prepared) {
    $tmp = (string)$prepared['tmp_name'];
    $mime = strtolower((string)$prepared['mime']);

    if ($mime === 'image/jpeg' && function_exists('imagecreatefromjpeg')) {
        return @imagecreatefromjpeg($tmp);
    }
    if ($mime === 'image/png' && function_exists('imagecreatefrompng')) {
        return @imagecreatefrompng($tmp);
    }
    if ($mime === 'image/webp' && function_exists('imagecreatefromwebp')) {
        return @imagecreatefromwebp($tmp);
    }
    return false;
}

function corrigir_orientacao_jpeg_gd($img, array $prepared) {
    if (!$img || strtolower((string)$prepared['mime']) !== 'image/jpeg') return $img;
    if (!function_exists('exif_read_data')) return $img;

    $exif = @exif_read_data((string)$prepared['tmp_name']);
    $orientation = is_array($exif) ? (int)($exif['Orientation'] ?? 1) : 1;
    $rotated = false;

    if ($orientation === 3) $rotated = @imagerotate($img, 180, 0);
    elseif ($orientation === 6) $rotated = @imagerotate($img, -90, 0);
    elseif ($orientation === 8) $rotated = @imagerotate($img, 90, 0);

    if ($rotated) {
        imagedestroy($img);
        return $rotated;
    }

    return $img;
}

function salvar_upload_imagem_otimizada_coroas(
    int $pedidoId,
    string $prefixo,
    array $prepared,
    int $maxWidth,
    int $maxHeight,
    int $quality,
    int $targetBytes
): array {
    // Para aparelhos fracos o ponto principal é não decodificar no navegador.
    // No servidor, imagens exageradamente grandes são preservadas sem GD para
    // evitar estouro de memória; capturas feitas pelo frontend novo já chegam pequenas.
    $dim = @getimagesize((string)$prepared['tmp_name']);
    $w = is_array($dim) ? (int)($dim[0] ?? 0) : 0;
    $h = is_array($dim) ? (int)($dim[1] ?? 0) : 0;
    $pixels = $w > 0 && $h > 0 ? $w * $h : 0;

    // Capturas do frontend novo já chegam em JPEG pequeno. Nesse caso não há
    // motivo para decodificar novamente no servidor: apenas move o arquivo.
    if (
        strtolower((string)$prepared['mime']) === 'image/jpeg' &&
        (int)($prepared['size'] ?? 0) > 0 &&
        (int)$prepared['size'] <= (int)round($targetBytes * 1.15) &&
        $w > 0 && $h > 0 && $w <= $maxWidth && $h <= $maxHeight
    ) {
        return salvar_upload_direto_coroas($pedidoId, $prefixo, $prepared);
    }

    if (
        !function_exists('imagecreatetruecolor') ||
        !function_exists('imagecopyresampled') ||
        !function_exists('imagejpeg') ||
        $w <= 0 ||
        $h <= 0 ||
        $pixels > 24000000
    ) {
        return salvar_upload_direto_coroas($pedidoId, $prefixo, $prepared);
    }

    $src = carregar_imagem_gd_upload($prepared);
    if (!$src) {
        return salvar_upload_direto_coroas($pedidoId, $prefixo, $prepared);
    }

    $src = corrigir_orientacao_jpeg_gd($src, $prepared);
    $w = imagesx($src);
    $h = imagesy($src);

    $scale = min(1, $maxWidth / max(1, $w), $maxHeight / max(1, $h));
    $newW = max(1, (int)round($w * $scale));
    $newH = max(1, (int)round($h * $scale));

    $dst = imagecreatetruecolor($newW, $newH);
    if (!$dst) {
        imagedestroy($src);
        return salvar_upload_direto_coroas($pedidoId, $prefixo, $prepared);
    }

    $white = imagecolorallocate($dst, 255, 255, 255);
    imagefill($dst, 0, 0, $white);
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $w, $h);
    imagedestroy($src);

    $dest = caminho_destino_coroas($pedidoId, $prefixo, 'jpg');
    $q = max(35, min(82, $quality));
    $ok = @imagejpeg($dst, $dest['file_path'], $q);

    while ($ok && is_file($dest['file_path']) && filesize($dest['file_path']) > $targetBytes && $q > 38) {
        $q = max(38, $q - 7);
        $ok = @imagejpeg($dst, $dest['file_path'], $q);
    }

    imagedestroy($dst);

    if (!$ok || !is_file($dest['file_path'])) {
        @unlink($dest['file_path']);
        return salvar_upload_direto_coroas($pedidoId, $prefixo, $prepared);
    }

    return [
        'url' => $dest['url'],
        'path' => $dest['path'],
        'file_path' => $dest['file_path'],
        'mime' => 'image/jpeg',
        'nome_original' => (string)$prepared['nome_original'],
    ];
}

function salvar_comprovante_upload_preparado_coroas(int $pedidoId, array $prepared): array {
    if (str_starts_with(strtolower((string)$prepared['mime']), 'image/')) {
        return salvar_upload_imagem_otimizada_coroas(
            $pedidoId,
            'comprovante',
            $prepared,
            1600,
            1600,
            70,
            700 * 1024
        );
    }

    return salvar_upload_direto_coroas($pedidoId, 'comprovante', $prepared);
}

function salvar_imagem_coroa_upload_ou_erro(int $pedidoId, string $campo = 'foto_coroa'): array {
    $prepared = preparar_upload_arquivo_ou_erro(
        $campo,
        ['image/jpeg', 'image/png', 'image/webp'],
        12 * 1024 * 1024
    );

    try {
        return salvar_upload_imagem_otimizada_coroas(
            $pedidoId,
            'coroa_pronta',
            $prepared,
            960,
            720,
            60,
            300 * 1024
        );
    } catch (Throwable $e) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage()),
        ], 500);
    }
}

function salvar_binario_coroas(
    int $pedidoId,
    string $prefixo,
    string $bin,
    string $ext
): array {
    $dir = __DIR__ . '/uploads/coroas/';

    if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
        throw new RuntimeException('Falha ao criar a pasta uploads/coroas.');
    }

    $fileName =
        $prefixo . '_' .
        $pedidoId . '_' .
        date('Ymd_His') . '_' .
        bin2hex(random_bytes(4)) . '.' .
        $ext;

    $filePath = $dir . $fileName;

    if (@file_put_contents($filePath, $bin) === false) {
        throw new RuntimeException('Falha ao salvar o arquivo no servidor.');
    }

    return [
        'url' => '/uploads/coroas/' . $fileName,
        'path' => 'uploads/coroas/' . $fileName,
        'file_path' => $filePath,
    ];
}

function salvar_imagem_coroa_ou_erro(int $id, string $base64): array {
    $prepared = preparar_base64_arquivo_ou_erro(
        $base64,
        ['image/jpeg', 'image/png', 'image/webp'],
        12 * 1024 * 1024
    );

    try {
        $saved = salvar_binario_coroas(
            $id,
            'coroa_pronta',
            $prepared['bin'],
            $prepared['ext']
        );
    } catch (Throwable $e) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage()),
        ], 500);
    }

    $saved['mime'] = $prepared['mime'];
    return $saved;
}

/* =========================================================
   STATUS
   ========================================================= */
/* =========================================================
   CONVÊNIO DO PEDIDO AVULSO (06/10/2026)
   Pedido feito nesta tela pode ser de uma Prefeitura: convenio_id + "A Prefeitura autorizou a coroa?" (Sim/Não).
   Com Sim, a coroa é faturada à Prefeitura pela OS Prf (o app chama os_principal.php?lancar_coroa_prefeitura=1
   depois de salvar) e o pedido não espera pagamento da família. Com Não, segue como venda direta.
   Colunas novas em coroas: convenio_id, coroa_autorizada_prefeitura (alteracoes_atendimento_sugeridas.sql).
   ========================================================= */
function coroas_tem_colunas_convenio(PDO $pdo): bool {
    static $tem = null;
    if ($tem === null) {
        $a = (bool)$pdo->query("SHOW COLUMNS FROM coroas LIKE 'convenio_id'")->fetch(PDO::FETCH_ASSOC);
        $b = (bool)$pdo->query("SHOW COLUMNS FROM coroas LIKE 'coroa_autorizada_prefeitura'")->fetch(PDO::FETCH_ASSOC);
        $tem = $a && $b;
    }
    return $tem;
}

/**
 * Lê convenio_id e coroa_autorizada_prefeitura do pedido. Devolve null quando o pedido não informa convênio (Particular)
 * ou ['convenio_id' => int, 'autorizada' => 'Sim'|'Não', 'nome' => string]. Só aceita convênio ativo de Prefeitura.
 */
function ler_convenio_pedido_ou_erro(PDO $pdo, array $json): ?array {
    $convenioId = (int)($json['convenio_id'] ?? 0);
    if ($convenioId <= 0) return null;

    if (!coroas_tem_colunas_convenio($pdo)) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Faltam as colunas convenio_id e coroa_autorizada_prefeitura na tabela coroas. Rode o alteracoes_atendimento_sugeridas.sql.',
        ], 500);
    }

    $st = $pdo->prepare('SELECT id, nome, os_tipo, ativo FROM convenios WHERE id = :id LIMIT 1');
    $st->execute([':id' => $convenioId]);
    $conv = $st->fetch(PDO::FETCH_ASSOC);
    if (!$conv || (int)($conv['ativo'] ?? 0) !== 1 || strtoupper(trim((string)($conv['os_tipo'] ?? ''))) !== 'PREFEITURA') {
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'Convênio inválido: escolha uma Prefeitura ativa do cadastro de Convênios.'], 400);
    }

    $aut = strtolower(texto($json['coroa_autorizada_prefeitura'] ?? ''));
    if (in_array($aut, ['sim', 's', '1', 'true'], true)) {
        $aut = 'Sim';
    } elseif (in_array($aut, ['não', 'nao', 'n', '0', 'false'], true)) {
        $aut = 'Não';
    } else {
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'Informe se a Prefeitura autorizou a coroa.'], 400);
    }

    return ['convenio_id' => $convenioId, 'autorizada' => $aut, 'nome' => (string)$conv['nome']];
}

function gravar_convenio_pedido(PDO $pdo, int $pedidoId, ?array $conv): void {
    if (!coroas_tem_colunas_convenio($pdo)) return;
    $pdo->prepare('UPDATE coroas SET convenio_id = :c, coroa_autorizada_prefeitura = :a, atualizado_em = NOW() WHERE id = :id LIMIT 1')
        ->execute([
            ':c' => $conv['convenio_id'] ?? null,
            ':a' => $conv['autorizada'] ?? null,
            ':id' => $pedidoId,
        ]);
}

function origem_label(string $origem): string {
    $map = [
        'ordem_servico' => 'Ordem de Serviço',
        'venda_direta' => 'Venda Direta',

        // Compatibilidade com pedidos criados antes da simplificação.
        'venda_direta_colaborador' => 'Venda Direta',
        'venda_direta_escritorio' => 'Venda Direta',
        'venda_direta_memorial' => 'Venda Direta',
    ];

    return $map[$origem] ?? $origem;
}


function pai_coroas_format_phone($raw): string {
    if (!$raw) return '';
    return preg_replace('/\D+/', '', (string)$raw) ?: '';
}

function pai_coroas_format_brl($valor): string {
    $n = (float)($valor ?? 0);
    return 'R$ ' . number_format($n, 2, ',', '.');
}

function pai_coroas_total_itens(array $itens): float {
    $total = 0.0;

    foreach ($itens as $item) {
        $total += max(0, (float)($item['valor'] ?? 0));
    }

    return $total;
}

/* =========================================================
   ONESIGNAL
   ========================================================= */
function enviar_onesignal_novo_pedido(PDO $pdo, array $row): array {
    global $ONESIGNAL_APP_ID, $ONESIGNAL_API_KEY, $ONESIGNAL_COROAS_URL;

    $orderId = (int)($row['id'] ?? 0);

    if ($orderId <= 0) {
        return [
            'enviada' => false,
            'erro' => 'ID do pedido manual inválido para notificação.',
        ];
    }

    if (!$ONESIGNAL_APP_ID || !$ONESIGNAL_API_KEY) {
        return [
            'enviada' => false,
            'erro' => 'OneSignal não configurado.',
        ];
    }

    if (!function_exists('curl_init')) {
        return [
            'enviada' => false,
            'erro' => 'Extensão cURL não disponível no servidor.',
        ];
    }

    $itens = buscar_itens_pedido($pdo, $orderId);

    $cliente = trim((string)($row['solicitante'] ?? ''));
    $telefone = pai_coroas_format_phone($row['telefone'] ?? '');
    $falecido = trim((string)($row['falecido'] ?? ''));
    $localEntrega = trim((string)($row['local_entrega'] ?? ''));
    $origem = trim((string)($row['origem_externa_id'] ?? '')) !== ''
        ? 'Pedido Online'
        : origem_label((string)($row['origem'] ?? ''));
    $status = trim((string)($row['status'] ?? 'novo'));
    $dataCriacao = $row['criado_em'] ?? null;

    $total = pai_coroas_total_itens($itens);
    $valorFmt = pai_coroas_format_brl($total);

    $nomesItens = [];
    $imageUrl = '';

    foreach ($itens as $item) {
        $nome = trim((string)($item['modelo_coroa'] ?? ''));
        if ($nome !== '') {
            $nomesItens[] = $nome;
        }

        if ($imageUrl === '') {
            $foto = trim((string)($item['foto_produto_url'] ?? ''));
            if ($foto !== '') {
                $imageUrl = $foto;
            }
        }
    }

    // Notificação de NOVO pedido manual:
    // Título fixo e objetivo.
    $title = '🌺 COROA DE FLORES';

    // A descrição mostra somente o(s) nome(s) da(s) coroa(s) e o valor.
    // Ex.:
    // COROA CORAÇÃO VAZADO — R$ 340,00
    //
    // Em pedidos com mais de uma coroa:
    // MODELO 1 + MODELO 2 — R$ 680,00
    $nomeCoroaNotificacao = $nomesItens
        ? implode(' + ', $nomesItens)
        : 'Coroa de Flores';

    $body = sprintf(
        '%s — %s',
        $nomeCoroaNotificacao,
        $valorFmt
    );

    // Mesmo conceito de "detalhes" do plugin WooCommerce.
    $detalhado = [
        'pedido' => (string)$orderId,
        'status' => $status !== '' ? $status : 'novo',
        'cliente' => $cliente,
        'telefone' => $telefone,
        'valor' => $valorFmt,
        'falecido' => $falecido,
        'local_entrega' => $localEntrega !== '' ? $localEntrega : '—',
        'data_criacao' => $dataCriacao,
        'itens' => array_values($nomesItens),
        'origem' => $origem,
        'admin_url' => $ONESIGNAL_COROAS_URL,
    ];

    // Estrutura do payload igual à usada no plugin WooCommerce.
    $payload = [
        'app_id' => $ONESIGNAL_APP_ID,
        'included_segments' => ['All'],
        'headings' => [
            'pt' => $title,
            'en' => $title,
        ],
        'contents' => [
            'pt' => $body,
            'en' => $body,
        ],
        'data' => [
            'tipo' => 'pedido_coroa',
            'order_id' => $orderId,
            'detalhes' => $detalhado,
        ],

        // Abre a página de Coroas quando o usuário toca no push.
        'url' => $ONESIGNAL_COROAS_URL,

    ];

    // Mesmo padrão do plugin: foto grande no Android e anexo no iOS.
    if ($imageUrl !== '') {
        $payload['big_picture'] = $imageUrl;
        $payload['ios_attachments'] = [
            'img1' => $imageUrl,
        ];
    }

    $payloadJson = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    if ($payloadJson === false) {
        return [
            'enviada' => false,
            'erro' => 'Falha ao gerar o JSON da notificação.',
        ];
    }

    $ch = curl_init();

    curl_setopt($ch, CURLOPT_URL, 'https://onesignal.com/api/v1/notifications');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json; charset=utf-8',
        'Authorization: Basic ' . $ONESIGNAL_API_KEY,
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payloadJson);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);

    $resp = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    $responseData = is_string($resp)
        ? json_decode($resp, true)
        : null;

    // Log detalhado para diagnosticar exatamente o retorno do OneSignal.
    @file_put_contents(
        __DIR__ . '/coroas_onesignal.log',
        date('Y-m-d H:i:s') .
        " PEDIDO MANUAL #{$orderId}" .
        " | HTTP:{$httpCode}" .
        ($curlError !== '' ? " | CURL:{$curlError}" : '') .
        "\nPAYLOAD: {$payloadJson}" .
        "\nRESPONSE: " . (string)$resp .
        "\n\n",
        FILE_APPEND
    );

    if ($resp === false) {
        return [
            'enviada' => false,
            'erro' => $curlError !== ''
                ? $curlError
                : 'Falha de comunicação com o OneSignal.',
            'http_code' => $httpCode,
        ];
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        return [
            'enviada' => false,
            'erro' => 'OneSignal respondeu com HTTP ' . $httpCode . '.',
            'http_code' => $httpCode,
            'onesignal_response' => $responseData ?? $resp,
        ];
    }

    if (
        is_array($responseData) &&
        isset($responseData['errors']) &&
        !empty($responseData['errors'])
    ) {
        return [
            'enviada' => false,
            'erro' => 'O OneSignal retornou erro.',
            'http_code' => $httpCode,
            'onesignal_response' => $responseData,
        ];
    }

    // OneSignal pode responder HTTP 200 e ainda assim não enviar para ninguém.
    // Só consideramos sucesso quando ele devolve um ID de notificação.
    $notificationId = is_array($responseData)
        ? trim((string)($responseData['id'] ?? ''))
        : '';

    if ($notificationId === '') {
        return [
            'enviada' => false,
            'erro' => 'OneSignal aceitou a requisição, mas não retornou ID de notificação.',
            'http_code' => $httpCode,
            'onesignal_response' => $responseData ?? $resp,
        ];
    }

    return [
        'enviada' => true,
        'notification_id' => $notificationId,
        'http_code' => $httpCode,
        'onesignal_response' => $responseData ?? $resp,
        'payload' => [
            'titulo' => $title,
            'corpo' => $body,
            'imagem' => $imageUrl !== '' ? $imageUrl : null,
        ],
    ];
}

function enviar_onesignal_acao_pedido(
    PDO $pdo,
    array $row,
    string $acaoFluxo,
    string $usuario,
    ?array $itemCoroa = null,
    string $rotuloCoroa = ''
): array {
    global $ONESIGNAL_APP_ID, $ONESIGNAL_API_KEY, $ONESIGNAL_COROAS_URL;

    $orderId = (int)($row['id'] ?? 0);

    if ($orderId <= 0) {
        return [
            'enviada' => false,
            'erro' => 'ID do pedido inválido para notificação.',
        ];
    }

    if (!$ONESIGNAL_APP_ID || !$ONESIGNAL_API_KEY) {
        return [
            'enviada' => false,
            'erro' => 'OneSignal não configurado.',
        ];
    }

    if (!function_exists('curl_init')) {
        return [
            'enviada' => false,
            'erro' => 'Extensão cURL não disponível no servidor.',
        ];
    }

    // O nome do usuário fica obrigatoriamente no início da mensagem.
    // Ex.: "Tharles: Iniciou a Confecção da Faixa. Pedido #123 — Cliente"
    $usuario = normalizar_nome_usuario($usuario);
    if ($usuario === '') $usuario = 'Sistema';

    $mensagensAcao = [
        'iniciar' => 'Iniciou a Confecção da Coroa de Flores.',
        'coroa' => 'Iniciou a Confecção da Coroa de Flores.',
        'faixa' => 'Iniciou a Confecção da Faixa.',
        'finalizada' => 'Coroa de Flores pronta.',
        'entregue' => 'Entregou a Coroa de Flores.',
    ];

    $textoAcao = $mensagensAcao[$acaoFluxo] ?? 'Atualizou o pedido de coroa.';
    $mensagem = "{$usuario}: {$textoAcao}";

    $cliente = trim((string)($row['solicitante'] ?? ''));
    $falecido = trim((string)($row['falecido'] ?? ''));
    $telefone = pai_coroas_format_phone($row['telefone'] ?? '');
    $localEntrega = trim((string)($row['local_entrega'] ?? ''));
    $observacoes = trim((string)($row['observacoes'] ?? ''));
    // Ação de UMA coroa (07/10/2026): a notificação fala só dela.
    $itens = $itemCoroa ? [$itemCoroa] : buscar_itens_pedido($pdo, $orderId);
    if ($itemCoroa) {
        $modeloCoroa = trim((string)($itemCoroa['modelo_coroa'] ?? ''));
        $sufixo = trim($modeloCoroa . ($rotuloCoroa !== '' ? " ({$rotuloCoroa})" : ''));
        if ($sufixo !== '') $mensagem .= ' ' . $sufixo . '.';
    }

    $imageUrl = '';

    // Ao finalizar/entregar, prioriza a foto real da coroa pronta.
    if (in_array($acaoFluxo, ['finalizada', 'entregue'], true)) {
        $fotoPronta = $itemCoroa && !empty($itemCoroa['foto_coroa_url'])
            ? (string)$itemCoroa['foto_coroa_url']
            : url_publica_coroas($row['foto_coroa_url'] ?? null);
        if ($fotoPronta) {
            $imageUrl = $fotoPronta;
        }
    }

    // Nas demais etapas (ou como fallback), usa a foto do primeiro modelo.
    if ($imageUrl === '') {
        foreach ($itens as $item) {
            $foto = trim((string)($item['foto_produto_url'] ?? ''));
            if ($foto !== '') {
                $imageUrl = $foto;
                break;
            }
        }
    }

    $title = '🌺 COROA DE FLORES';
    $body = sprintf(
        '%s Pedido #%s — %s',
        $mensagem,
        (string)$orderId,
        $cliente !== '' ? $cliente : 'Cliente'
    );

    $payload = [
        'app_id' => $ONESIGNAL_APP_ID,
        'included_segments' => ['All'],
        'headings' => [
            'pt' => $title,
            'en' => $title,
        ],
        'contents' => [
            'pt' => $body,
            'en' => $body,
        ],
        'data' => [
            'tipo' => 'acao_coroa',
            'acao' => $acaoFluxo,
            'order_id' => $orderId,
            'detalhes' => [
                'pedido' => (string)$orderId,
                'usuario' => $usuario,
                'acao' => $acaoFluxo,
                'cliente' => $cliente,
                'telefone' => $telefone,
                'falecido' => $falecido,
                'local_entrega' => $localEntrega !== '' ? $localEntrega : '—',
                'observacoes' => $observacoes,
                'mensagem' => $mensagem,
            ],
        ],
        'url' => $ONESIGNAL_COROAS_URL,
    ];

    if ($imageUrl !== '') {
        $payload['big_picture'] = $imageUrl;
        $payload['ios_attachments'] = [
            'img1' => $imageUrl,
        ];
    }

    $payloadJson = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    if ($payloadJson === false) {
        return [
            'enviada' => false,
            'erro' => 'Falha ao gerar o JSON da notificação de ação.',
        ];
    }

    $ch = curl_init();

    curl_setopt($ch, CURLOPT_URL, 'https://onesignal.com/api/v1/notifications');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json; charset=utf-8',
        'Authorization: Basic ' . $ONESIGNAL_API_KEY,
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payloadJson);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);

    $resp = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    $responseData = is_string($resp)
        ? json_decode($resp, true)
        : null;

    @file_put_contents(
        __DIR__ . '/coroas_onesignal.log',
        date('Y-m-d H:i:s') .
        " ACAO {$acaoFluxo} PEDIDO #{$orderId}" .
        " | USUARIO:{$usuario}" .
        " | HTTP:{$httpCode}" .
        ($curlError !== '' ? " | CURL:{$curlError}" : '') .
        "\nPAYLOAD: {$payloadJson}" .
        "\nRESPONSE: " . (string)$resp .
        "\n\n",
        FILE_APPEND
    );

    if ($resp === false) {
        return [
            'enviada' => false,
            'erro' => $curlError !== ''
                ? $curlError
                : 'Falha de comunicação com o OneSignal.',
            'http_code' => $httpCode,
        ];
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        return [
            'enviada' => false,
            'erro' => 'OneSignal respondeu com HTTP ' . $httpCode . '.',
            'http_code' => $httpCode,
            'onesignal_response' => $responseData ?? $resp,
        ];
    }

    if (
        is_array($responseData) &&
        isset($responseData['errors']) &&
        !empty($responseData['errors'])
    ) {
        return [
            'enviada' => false,
            'erro' => 'O OneSignal retornou erro.',
            'http_code' => $httpCode,
            'onesignal_response' => $responseData,
        ];
    }

    $notificationId = is_array($responseData)
        ? trim((string)($responseData['id'] ?? ''))
        : '';

    if ($notificationId === '') {
        return [
            'enviada' => false,
            'erro' => 'OneSignal não retornou ID da notificação.',
            'http_code' => $httpCode,
            'onesignal_response' => $responseData ?? $resp,
        ];
    }

    return [
        'enviada' => true,
        'notification_id' => $notificationId,
        'http_code' => $httpCode,
        'onesignal_response' => $responseData ?? $resp,
    ];
}

/* =========================================================
   GET — LISTA / QUADRO / DETALHE
   ========================================================= */
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    if (isset($_GET['integracao_online_inicio'])) {
        responder([
            'sucesso' => true,
            // 09/11/2026: a conferência da loja só busca pedidos a partir do marco mais recente
            // (pedidos anteriores não entram mais), o que também deixa a conferência mais leve.
            'inicio_unix' => max($INICIO_INTEGRACAO_ONLINE_UNIX, inicio_importacao_tolerante_unix($pdo)),
        ]);
    }

    // 23/10/2026 (segurança): leitura de pedidos (nomes, telefones, valores) exige login do app.
    // Modo no pai-chaves.php: 'pai_protecao_modo_coroas'.
    if (function_exists('paiProtecao')) {
        paiProtecao('login', [], 'coroas:get', 'coroas');
    }

    // 09/11/2026: antes da Coroa Entregue — esta coroa sai do estoque? Se sim, saldo no MEMORIAL e na FUNERARIA.
    if (isset($_GET['entrega_estoque'])) {
        $pedidoEntrega = buscar_pedido($pdo, (int)$_GET['entrega_estoque']);
        if (!$pedidoEntrega) responder(['sucesso' => false, 'erro' => true, 'msg' => 'Pedido não encontrado.'], 404);
        $itensEntrega = buscar_itens_pedido($pdo, (int)$pedidoEntrega['id']);
        $itemEntrega = (int)($_GET['item_id'] ?? 0);
        if ($itemEntrega > 0) {
            $itensEntrega = array_values(array_filter($itensEntrega, static fn($it) => (int)($it['id'] ?? 0) === $itemEntrega));
        }
        $paraBaixa = coroas_itens_baixa_entrega($pedidoEntrega, $itensEntrega);
        $produtosEntrega = [];
        if ($paraBaixa) {
            require_once __DIR__ . '/estoque_atendimento.php';
            foreach ($paraBaixa as $it) {
                $pid = (int)$it['produto_id'];
                $produtosEntrega[] = [
                    'item_id' => (int)($it['id'] ?? 0),
                    'produto_id' => $pid,
                    'nome' => estq_nome_produto($pdo, $pid) ?: trim((string)($it['modelo_coroa'] ?? '')),
                    'deposito_do_pedido' => strtoupper(trim((string)($it['deposito_nome'] ?? ''))) ?: null,
                    'saldos' => coroas_saldos_memorial_funeraria($pdo, $pid),
                ];
            }
        }
        responder(['sucesso' => true, 'precisa_deposito' => (bool)$produtosEntrega, 'produtos' => $produtosEntrega]);
    }

    // 09/11/2026: quais pedidos da loja (números do WooCommerce) já existem no PAI.
    // O histórico usa isso para não mostrar em dobro e marcar "Não registrado no PAI".
    if (isset($_GET['online_existentes'])) {
        $ids = array_values(array_unique(array_filter(array_map(
            static fn($v) => preg_replace('/\D+/', '', (string)$v),
            explode(',', (string)$_GET['online_existentes'])
        ), static fn($v) => $v !== '')));
        $ids = array_slice($ids, 0, 200);
        if (!$ids) responder(['sucesso' => true, 'existentes' => []]);
        $marcadores = implode(',', array_fill(0, count($ids), '?'));
        $st = $pdo->prepare("SELECT DISTINCT origem_externa_id FROM coroas WHERE origem_externa_id IN ($marcadores)");
        $st->execute($ids);
        responder([
            'sucesso' => true,
            'existentes' => array_map('strval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []),
        ]);
    }

    if (isset($_GET['listar']) || isset($_GET['quadro'])) {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = max(1, min(100, (int)($_GET['per_page'] ?? 30)));
        $offset = ($page - 1) * $perPage;

        $q = trim((string)($_GET['q'] ?? ''));
        $status = strtolower(trim((string)($_GET['status'] ?? '')));
        $grupo = strtolower(trim((string)($_GET['grupo'] ?? '')));
        $after = trim((string)($_GET['after'] ?? ''));
        $before = trim((string)($_GET['before'] ?? ''));
        $ativos = isset($_GET['ativos']) || isset($_GET['quadro']);

        $where = [];
        $params = [];

        // Pedidos cancelados (09/10/2026) saem de todas as listas; grupo=cancelados mostra só eles.
        $temCancelado = coroas_tem_coluna_cancelado($pdo);
        if ($grupo === 'cancelados') {
            if (!$temCancelado) {
                responder(['sucesso' => true, 'dados' => [], 'meta' => ['page' => 1, 'per_page' => $perPage, 'total' => 0, 'total_pages' => 1]]);
            }
            $where[] = 'c.cancelado_em IS NOT NULL';
            $grupo = '';
            $ativos = false;
        } elseif ($temCancelado) {
            $where[] = 'c.cancelado_em IS NULL';
        }

        if ($grupo === 'confeccao') {
            $where[] = "c.status IN ('novo', 'coroa', 'faixa', 'finalizada')";

            // A Confecção mantém o pedido até a confirmação de entrega.
            // 'finalizada' ainda é etapa operacional; somente 'entregue' sai da fila.
            // Pedidos manuais continuam normalmente. Pedidos online só entram
            // na Confecção se foram importados a partir do marco desta versão.
            // Isso remove da fila os pedidos históricos que a versão anterior
            // reconciliou indevidamente, sem apagar esses registros do banco.
            $where[] = "(c.origem_externa_id IS NULL OR UNIX_TIMESTAMP(c.criado_em) >= :online_inicio_unix)";
            $params[':online_inicio_unix'] = $INICIO_INTEGRACAO_ONLINE_UNIX;
        } elseif ($grupo === 'historico') {
            $where[] = "c.status = 'entregue'";
            // 09/11/2026: o histórico passa a trazer também os pedidos da loja já registrados no PAI
            // (com tipo, quem fez Coroa Pronta/Entregue e foto). Antes eles vinham só do WooCommerce, sem esses dados.
            $origemHistorico = strtolower(trim((string)($_GET['resumo_origem'] ?? 'todos')));
            if ($origemHistorico === 'venda_direta') {
                $where[] = "c.origem_externa_id IS NULL";
            } elseif ($origemHistorico === 'loja_online') {
                $where[] = "c.origem_externa_id IS NOT NULL";
            }
        } elseif ($grupo !== '') {
            responder([
                'sucesso' => false,
                'erro' => true,
                'msg' => 'Grupo de pedidos inválido.',
            ], 400);
        } elseif ($ativos) {
            $where[] = "c.status <> 'entregue'";
        }

        if ($status !== '' && $status !== 'todos') {
            $permitidos = ['novo', 'coroa', 'faixa', 'em_confeccao', 'finalizada', 'entregue'];

            if (!in_array($status, $permitidos, true)) {
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'Status inválido.',
                ], 400);
            }

            if ($status === 'em_confeccao') {
                // 05/11/2026: "Em confecção" = coroa e faixa (o app não separa mais as duas etapas).
                $where[] = "c.status IN ('coroa', 'faixa')";
            } else {
                $where[] = 'c.status = :status';
                $params[':status'] = $status;
            }
        }

        if ($after !== '') {
            $dt = DateTime::createFromFormat('Y-m-d', $after);
            if (!$dt || $dt->format('Y-m-d') !== $after) {
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'Data inicial inválida.',
                ], 400);
            }

            $where[] = 'c.criado_em >= :after';
            $params[':after'] = $after . ' 00:00:00';
        }

        if ($before !== '') {
            $dt = DateTime::createFromFormat('Y-m-d', $before);
            if (!$dt || $dt->format('Y-m-d') !== $before) {
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'Data final inválida.',
                ], 400);
            }

            $where[] = 'c.criado_em <= :before';
            $params[':before'] = $before . ' 23:59:59';
        }

        if ($q !== '') {
            $like = '%' . $q . '%';

            $where[] = '(
                c.solicitante LIKE :q1
                OR c.falecido LIKE :q2
                OR c.telefone LIKE :q3
                OR c.local_entrega LIKE :q4
                OR c.observacoes LIKE :q5
                OR c.modelo_coroa LIKE :q6
                OR c.frase LIKE :q7
                OR CAST(c.id AS CHAR) LIKE :q8
                OR c.origem_externa_id LIKE :q9
                OR (c.origem = \'ordem_servico\' AND EXISTS (
                    SELECT 1
                    FROM sepultamentos s_busca
                    WHERE s_busca.id = c.atendimento_origem_id
                      AND (
                        s_busca.nome_responsavel LIKE :q12
                        OR s_busca.falecido LIKE :q13
                        OR s_busca.contato LIKE :q14
                      )
                ))
                OR EXISTS (
                    SELECT 1
                    FROM coroas_itens ci_busca
                    WHERE ci_busca.coroa_id = c.id
                      AND (
                        ci_busca.modelo_coroa LIKE :q10
                        OR ci_busca.frase LIKE :q11
                      )
                )
            )';

            for ($i = 1; $i <= 14; $i++) {
                $params[":q{$i}"] = $like;
            }
        }

        $whereSql = $where ? (' WHERE ' . implode(' AND ', $where)) : '';

        // Em boa parte das telas há menos de uma página de pedidos.
        // Buscamos 1 registro extra na primeira página; se não existir,
        // sabemos o total sem precisar executar COUNT(*).
        $fetchLimit = $page === 1 ? ($perPage + 1) : $perPage;

        $sql =
            'SELECT
                c.id,
                c.solicitante,
                c.telefone,
                c.local_entrega,
                c.observacoes,
                c.quantidade_coroas,
                c.modelo_coroa,
                c.frase,
                c.falecido,
                c.falecido_atendimento_id,
                c.atendimento_origem_id,
                c.status_pagamento,
                c.origem,
                c.origem_externa_id,
                c.status,
                c.comprovante_url,
                c.comprovante_mime,
                c.comprovante_nome,
                c.foto_coroa_url,
                c.criado_por,
                c.criado_em,
                c.atualizado_em,
                c.coroa_inicio_em,
                c.coroa_inicio_por,
                c.faixa_inicio_em,
                c.faixa_inicio_por,
                c.finalizada_em,
                c.finalizada_por,
                c.entregue_em,
                c.entregue_por
             FROM coroas c' .
            $whereSql .
            ' ORDER BY c.id DESC
              LIMIT :lim OFFSET :off';

        $listStartedAt = microtime(true);
        $st = $pdo->prepare($sql);

        foreach ($params as $k => $v) {
            $st->bindValue($k, $v, PDO::PARAM_STR);
        }

        $st->bindValue(':lim', $fetchLimit, PDO::PARAM_INT);
        $st->bindValue(':off', $offset, PDO::PARAM_INT);
        $st->execute();

        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        pai_timing_add('list_query', $listStartedAt);

        $temRegistroExtra = $page === 1 && count($rows) > $perPage;

        if ($temRegistroExtra) {
            $rows = array_slice($rows, 0, $perPage);
        }

        $precisaContar = $page > 1 || $temRegistroExtra;

        if ($precisaContar) {
            $countStartedAt = microtime(true);

            $stCount = $pdo->prepare(
                'SELECT COUNT(*) FROM coroas c' . $whereSql
            );

            foreach ($params as $k => $v) {
                $stCount->bindValue($k, $v, PDO::PARAM_STR);
            }

            $stCount->execute();
            $total = (int)$stCount->fetchColumn();

            pai_timing_add('count_query', $countStartedAt);
        } else {
            // Primeira e única página: evita COUNT(*).
            $total = count($rows);
        }

        // Painel de quantidades por tipo: soma coroas_itens em TODO o resultado filtrado,
        // não só os pedidos carregados na página. Inclui registros locais e os pedidos
        // WooCommerce já importados ao PAI, quando a origem selecionada permitir.
        $resumoTipos = null;
        if ($grupo === 'historico' && (string)($_GET['resumo_tipos'] ?? '') === '1') {
            $resumoOrigem = strtolower(trim((string)($_GET['resumo_origem'] ?? 'todos')));
            if (!in_array($resumoOrigem, ['todos', 'venda_direta', 'loja_online'], true)) {
                responder(['sucesso' => false, 'erro' => true, 'msg' => 'Origem do resumo inválida.'], 400);
            }

            // Somente o resumo pode incluir os pedidos online já importados;
            // a listagem continua com a divisão original PAI x WooCommerce.
            $whereResumo = array_values(array_filter(
                $where,
                static fn($cond) => $cond !== 'c.origem_externa_id IS NULL'
            ));
            if ($resumoOrigem === 'venda_direta') {
                $whereResumo[] = 'c.origem_externa_id IS NULL';
            } elseif ($resumoOrigem === 'loja_online') {
                $whereResumo[] = 'c.origem_externa_id IS NOT NULL';
            }
            $whereResumoSql = $whereResumo ? (' WHERE ' . implode(' AND ', $whereResumo)) : '';
            $startedResumo = microtime(true);
            $stResumo = $pdo->prepare(
                "SELECT
                    COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(ci.tipo_coroa, ''))) = 'natural' THEN 1 ELSE 0 END), 0) AS naturais,
                    COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(ci.tipo_coroa, ''))) = 'artificial' THEN 1 ELSE 0 END), 0) AS artificiais,
                    COALESCE(SUM(CASE
                        WHEN ci.id IS NULL THEN GREATEST(1, COALESCE(c.quantidade_coroas, 1))
                        WHEN LOWER(TRIM(COALESCE(ci.tipo_coroa, ''))) NOT IN ('natural', 'artificial') THEN 1
                        ELSE 0
                    END), 0) AS nao_classificadas
                 FROM coroas c
                 LEFT JOIN coroas_itens ci ON ci.coroa_id = c.id" . $whereResumoSql
            );
            foreach ($params as $k => $v) {
                $stResumo->bindValue($k, $v, PDO::PARAM_STR);
            }
            $stResumo->execute();
            $totais = $stResumo->fetch(PDO::FETCH_ASSOC) ?: [];
            $naturais = max(0, (int)($totais['naturais'] ?? 0));
            $artificiais = max(0, (int)($totais['artificiais'] ?? 0));
            $semTipo = max(0, (int)($totais['nao_classificadas'] ?? 0));
            $resumoTipos = [
                'naturais' => $naturais,
                'artificiais' => $artificiais,
                'nao_classificadas' => $semTipo,
                'total_coroas' => $naturais + $artificiais + $semTipo,
            ];
            pai_timing_add('tipos_query', $startedResumo);
        }

        // Uma única consulta de itens para todos os pedidos da página.
        $itemsStartedAt = microtime(true);
        $saida = normalizar_rows_saida($rows, $pdo);
        pai_timing_add('items_query', $itemsStartedAt);

        $response = [
            'sucesso' => true,
            'dados' => $saida,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max(1, (int)ceil($total / $perPage)),
            ],
        ];

        if ($resumoTipos !== null) {
            $response['meta']['resumo_tipos'] = $resumoTipos;
        }

        if (is_string($LIST_CACHE_KEY) && $LIST_CACHE_KEY !== '') {
            // 3 segundos são suficientes para eliminar rajadas de requisições
            // duplicadas no desktop sem deixar o quadro perceptivelmente atrasado.
            coroas_cache_set($LIST_CACHE_KEY, $response, 3);
        }

        responder($response);
    }

    if (isset($_GET['por_atendimento'])) {
        $atendimentoId = (int)($_GET['atendimento_id'] ?? 0);
        if ($atendimentoId <= 0) {
            responder(['sucesso' => false, 'erro' => true, 'msg' => 'Atendimento não informado.'], 400);
        }
        $row = buscar_pedido_por_atendimento($pdo, $atendimentoId);
        responder([
            'sucesso' => true,
            'dado' => $row ? normalizar_row_saida($row, $pdo) : null,
        ]);
    }

    if (isset($_GET['id'])) {
        $id = (int)$_GET['id'];
        $row = buscar_pedido($pdo, $id);

        if (!$row) {
            responder([
                'sucesso' => false,
                'erro' => true,
                'msg' => 'Pedido não encontrado.',
            ], 404);
        }

        responder([
            'sucesso' => true,
            'dado' => normalizar_row_saida($row, $pdo),
        ]);
    }

    responder([
        'sucesso' => true,
        'api' => 'coroas.php',
        'uso' => [
            'confeccao' => '?listar=1&grupo=confeccao&page=1&per_page=30',
            'historico' => '?listar=1&grupo=historico&page=1&per_page=20',
            'detalhe' => '?id=123',
            'por_atendimento' => '?por_atendimento=1&atendimento_id=123',
        ],
    ]);
}

/* =========================================================
   POST
   ========================================================= */
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    responder([
        'sucesso' => false,
        'erro' => true,
        'msg' => 'Método não permitido.',
    ], 405);
}

$raw = file_get_contents('php://input');
$contentType = strtolower(trim((string)($_SERVER['CONTENT_TYPE'] ?? '')));

if (str_contains($contentType, 'multipart/form-data')) {
    // Upload leve: campos comuns chegam em $_POST e arquivos em $_FILES.
    // Mantém JSON para integrações antigas e para chamadas sem arquivo.
    $json = is_array($_POST) ? $_POST : [];

    // Campos estruturados enviados pelo frontend via FormData.
    foreach (['itens'] as $campoJson) {
        if (!isset($json[$campoJson]) || !is_string($json[$campoJson])) continue;
        $decoded = json_decode((string)$json[$campoJson], true);
        if (is_array($decoded)) $json[$campoJson] = $decoded;
    }
} else {
    $json = json_decode((string)$raw, true);
}

if (!is_array($json)) {
    responder([
        'sucesso' => false,
        'erro' => true,
        'msg' => 'Payload inválido.',
    ], 400);
}

$acao = strtolower(trim((string)($json['acao'] ?? '')));

// 23/10/2026 (segurança): toda ação exige login do app, menos importar_online (pedido do site, com assinatura própria).
if ($acao !== 'importar_online' && function_exists('paiProtecao')) {
    paiProtecao('login', [], 'coroas:' . ($acao !== '' ? $acao : 'post'), 'coroas');
}
$usuario = resolver_usuario_acao($json);

// Pedido cancelado (09/10/2026, pelo correcoes.php) não recebe mais alterações.
if (in_array($acao, ['atualizar_pagamento', 'anexar_comprovante', 'anexar_foto_coroa', 'editar', 'atualizar_status'], true)
    && coroas_tem_coluna_cancelado($pdo)) {
    $idGuard = (int)($json['id'] ?? $json['coroa_id'] ?? 0);
    if ($idGuard > 0) {
        $stGuard = $pdo->prepare('SELECT cancelado_em FROM coroas WHERE id = :id LIMIT 1');
        $stGuard->execute([':id' => $idGuard]);
        if (!empty($stGuard->fetchColumn())) {
            responder(['sucesso' => false, 'erro' => true, 'msg' => 'Este pedido de coroa foi cancelado. Não é possível alterar.'], 409);
        }
    }
}
if ($acao === 'sincronizar_atendimento' && coroas_tem_coluna_cancelado($pdo)) {
    $temColSep = (bool)$pdo->query("SHOW COLUMNS FROM sepultamentos LIKE 'cancelado_em'")->fetch(PDO::FETCH_ASSOC);
    if ($temColSep) {
        $stGuard = $pdo->prepare('SELECT cancelado_em FROM sepultamentos WHERE id = :id LIMIT 1');
        $stGuard->execute([':id' => (int)($json['atendimento_id'] ?? 0)]);
        if (!empty($stGuard->fetchColumn())) {
            responder(['sucesso' => false, 'erro' => true, 'msg' => 'Atendimento cancelado: as coroas não podem ser alteradas.'], 409);
        }
    }
}

// Qualquer tentativa de alteração invalida imediatamente as listagens em cache.
// Se a operação falhar, o único efeito é forçar uma nova leitura do banco.
coroas_cache_invalidar();


/* =========================================================
   SINCRONIZAR ORDEM DE SERVIÇO VINDO DO ATENDIMENTO
   ========================================================= */
if ($acao === 'sincronizar_atendimento') {
    $atendimentoId = (int)($json['atendimento_id'] ?? 0);
    $flag = strtolower(texto($json['coroa_flores'] ?? ''));
    $flagSim = in_array($flag, ['sim', 's', '1', 'true'], true);
    $flagNao = in_array($flag, ['não', 'nao', 'n', '0', 'false'], true);

    if ($atendimentoId <= 0 || (!$flagSim && !$flagNao)) {
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'Atendimento e opção Coroa de Flores são obrigatórios.'], 400);
    }

    $stAt = $pdo->prepare('SELECT * FROM sepultamentos WHERE id = :id LIMIT 1');
    $stAt->execute([':id' => $atendimentoId]);
    $atendimento = $stAt->fetch(PDO::FETCH_ASSOC);
    if (!$atendimento) {
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'Atendimento não encontrado em sepultamentos.'], 404);
    }

    $existente = buscar_pedido_por_atendimento($pdo, $atendimentoId);

    if ($flagNao) {
        if (!$existente) {
            responder(['sucesso' => true, 'removido' => false, 'dado' => null]);
        }
        if (pedido_entrou_producao($existente)) {
            responder([
                'sucesso' => false,
                'erro' => true,
                'msg' => 'Este pedido de coroas já entrou em produção e não pode ser removido pelo atendimento.',
            ], 409);
        }

        try {
            $pdo->beginTransaction();
            $rowLock = buscar_pedido_por_atendimento($pdo, $atendimentoId, true);
            if ($rowLock && pedido_entrou_producao($rowLock)) {
                $pdo->rollBack();
                responder(['sucesso' => false, 'erro' => true, 'msg' => 'Este pedido de coroas já entrou em produção.'], 409);
            }
            if ($rowLock) {
                $pedidoId = (int)$rowLock['id'];
                $pdo->prepare('DELETE FROM coroas_itens WHERE coroa_id = :id')->execute([':id' => $pedidoId]);
                $pdo->prepare('DELETE FROM coroas WHERE id = :id LIMIT 1')->execute([':id' => $pedidoId]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            responder(['sucesso' => false, 'erro' => true, 'msg' => 'Não foi possível remover a Ordem de Serviço das coroas: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
        }

        coroas_cache_invalidar();
        responder(['sucesso' => true, 'removido' => true, 'dado' => null]);
    }

    $rawItens = $json['itens'] ?? null;
    $quantidade = is_array($rawItens) ? count($rawItens) : 0;
    if ($quantidade < 1 || $quantidade > 20) {
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'Informe de 1 a 20 coroas no atendimento.'], 400);
    }
    $itens = normalizar_itens_entrada($pdo, $rawItens, $quantidade);
    [$modeloResumo, $fraseResumo] = resumo_compatibilidade_itens($itens);

    $falecido = texto($atendimento['falecido'] ?? '');
    $solicitante = texto($atendimento['nome_responsavel'] ?? '');
    $telefone = texto($atendimento['contato'] ?? '');
    $localEntrega = texto($atendimento['local_velorio'] ?? '');
    if ($localEntrega === '') $localEntrega = texto($atendimento['local'] ?? '');
    // 11/11/2026: velório no Memorial = local com a sala do atendimento (aurora_12.php).
    if (is_file(__DIR__ . '/aurora_12.php')) { require_once __DIR__ . '/aurora_12.php'; $localEntrega = a12LocalEntregaAtendimento($atendimento, $localEntrega); }
    // 29/10/2026: cliente da OS = "OS - " + Nome do Responsável do atendimento.
    $solicitante = coroas_nome_cliente_os($solicitante, $atendimentoId);
    if ($falecido === '') $falecido = 'Atendimento #' . $atendimentoId;

    $criadoNovo = false;
    try {
        $pdo->beginTransaction();
        $row = buscar_pedido_por_atendimento($pdo, $atendimentoId, true);
        if ($row && pedido_entrou_producao($row)) {
            $pdo->rollBack();
            responder([
                'sucesso' => false,
                'erro' => true,
                'msg' => 'Este pedido de coroas já entrou em produção. Modelos, quantidades, depósitos e frases não podem mais ser alterados pelo atendimento.',
            ], 409);
        }

        if ($row) {
            $pedidoId = (int)$row['id'];
            $st = $pdo->prepare(
                "UPDATE coroas SET
                    solicitante = :solicitante,
                    telefone = :telefone,
                    local_entrega = :local_entrega,
                    observacoes = :observacoes,
                    quantidade_coroas = :quantidade,
                    modelo_coroa = :modelo,
                    frase = :frase,
                    falecido = :falecido,
                    falecido_atendimento_id = :atendimento_id,
                    origem = 'ordem_servico',
                    status_pagamento = 'pago',
                    atualizado_em = NOW()
                 WHERE id = :id LIMIT 1"
            );
            $st->execute([
                ':solicitante' => $solicitante,
                ':telefone' => $telefone !== '' ? $telefone : null,
                ':local_entrega' => $localEntrega !== '' ? $localEntrega : null,
                ':observacoes' => 'Gerado automaticamente pelo Atendimento #' . $atendimentoId,
                ':quantidade' => $quantidade,
                ':modelo' => $modeloResumo,
                ':frase' => $fraseResumo,
                ':falecido' => $falecido,
                ':atendimento_id' => $atendimentoId,
                ':id' => $pedidoId,
            ]);
            $pdo->prepare('DELETE FROM coroas_itens WHERE coroa_id = :id')->execute([':id' => $pedidoId]);
            inserir_itens_pedido($pdo, $pedidoId, $itens);
        } else {
            $criadoNovo = true;
            $st = $pdo->prepare(
                "INSERT INTO coroas (
                    solicitante, telefone, local_entrega, observacoes,
                    quantidade_coroas, modelo_coroa, frase, falecido,
                    falecido_atendimento_id, atendimento_origem_id,
                    status_pagamento, origem, status, criado_por, criado_em, atualizado_em
                ) VALUES (
                    :solicitante, :telefone, :local_entrega, :observacoes,
                    :quantidade, :modelo, :frase, :falecido,
                    :atendimento_id, :atendimento_origem_id,
                    'pago', 'ordem_servico', 'novo', :criado_por, NOW(), NOW()
                )"
            );
            $st->execute([
                ':solicitante' => $solicitante,
                ':telefone' => $telefone !== '' ? $telefone : null,
                ':local_entrega' => $localEntrega !== '' ? $localEntrega : null,
                ':observacoes' => 'Gerado automaticamente pelo Atendimento #' . $atendimentoId,
                ':quantidade' => $quantidade,
                ':modelo' => $modeloResumo,
                ':frase' => $fraseResumo,
                ':falecido' => $falecido,
                ':atendimento_id' => $atendimentoId,
                ':atendimento_origem_id' => $atendimentoId,
                ':criado_por' => $usuario,
            ]);
            $pedidoId = (int)$pdo->lastInsertId();
            inserir_itens_pedido($pdo, $pedidoId, $itens);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        responder(['sucesso' => false, 'erro' => true, 'msg' => 'Não foi possível sincronizar a Ordem de Serviço das coroas: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
    }

    coroas_cache_invalidar();
    $row = buscar_pedido($pdo, $pedidoId);
    $push = $criadoNovo && $row
        ? enviar_onesignal_novo_pedido($pdo, $row)
        : ['enviada' => false, 'ignorada' => true];

    responder([
        'sucesso' => true,
        'criado' => $criadoNovo,
        'id' => $pedidoId,
        'origem' => 'ordem_servico',
        'dado' => $row ? normalizar_row_saida($row, $pdo) : null,
        'notificacao' => $push,
        'notificacao_enviada' => (bool)($push['enviada'] ?? false),
    ], $criadoNovo ? 201 : 200);
}

/* =========================================================
   IMPORTAR PEDIDO ONLINE / WOOCOMMERCE
   ========================================================= */
if ($acao === 'importar_online') {
    exigir_assinatura_integracao_online((string)$raw);

    $woocommerceOrderId = texto($json['woocommerce_order_id'] ?? '');

    if ($woocommerceOrderId === '') {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'ID do pedido WooCommerce não informado.',
        ], 400);
    }

    // Webhooks podem ser entregues mais de uma vez. Se o pedido já foi
    // importado, devolvemos o mesmo registro e não criamos duplicata.
    $existente = buscar_pedido_online_existente($pdo, $woocommerceOrderId);
    if ($existente) {
        // 11/11/2026: pedido já importado antes de o site mandar "Retirada no local". Atualiza o Local de Entrega
        // uma única vez (só se ainda não começa com "Retirada no local" e a coroa não foi entregue).
        $localNovo = texto($json['local_entrega'] ?? '');
        $localAtual = trim((string)($existente['local_entrega'] ?? ''));
        if (
            stripos($localNovo, 'Retirada no local') === 0 &&
            stripos($localAtual, 'Retirada no local') !== 0 &&
            empty($existente['entregue_em'])
        ) {
            try {
                $pdo->prepare('UPDATE coroas SET local_entrega = :l, atualizado_em = NOW() WHERE id = :id LIMIT 1')
                    ->execute([':l' => mb_substr($localNovo, 0, 255), ':id' => (int)$existente['id']]);
                coroas_cache_invalidar();
                $existente = buscar_pedido($pdo, (int)$existente['id']) ?: $existente;
            } catch (Throwable $e) {
                error_log('[coroas] atualizar retirada no local: ' . $e->getMessage());
            }
        }
        responder([
            'sucesso' => true,
            'importado' => false,
            'duplicado' => true,
            'id' => (int)$existente['id'],
            'dado' => normalizar_row_saida($existente, $pdo),
        ]);
    }

    // 09/11/2026: pedido criado na loja ANTES do marco de 09/11 e que ainda não está no PAI não entra mais,
    // por nenhum motivo (antes a trava só valia para itens com pendência; com nome/SKU corrigido no estoque,
    // pedidos antigos voltavam a entrar e enchiam a Confecção). Não é erro: não aparece no aviso amarelo.
    $marcoTolerante = inicio_importacao_tolerante_unix($pdo);
    $criadoLojaTxt = texto($json['wc_criado_em_gmt'] ?? '');
    $criadoLojaUnix = $criadoLojaTxt !== ''
        ? strtotime(preg_match('/(Z|[+-]\d{2}:?\d{2})$/', $criadoLojaTxt) ? $criadoLojaTxt : $criadoLojaTxt . 'Z')
        : false;
    // Sem a data (front antigo ainda no ar), trata como antigo: a próxima sincronização manda a data e o pedido novo entra.
    if ($marcoTolerante > 0 && ($criadoLojaUnix === false || $criadoLojaUnix < $marcoTolerante)) {
        responder([
            'sucesso' => true,
            'importado' => false,
            'ignorado' => true,
            'motivo' => 'pedido_anterior_ao_marco_de_09_11_2026',
        ]);
    }

    $solicitante = texto($json['solicitante'] ?? '');
    $telefone = texto($json['telefone'] ?? '');
    $localEntrega = texto($json['local_entrega'] ?? '');
    $observacoes = texto($json['observacoes'] ?? '');
    $falecido = texto($json['falecido'] ?? '');

    if ($solicitante === '') $solicitante = 'Cliente Online';
    if ($falecido === '') $falecido = 'Não informado';

    $normalizados = normalizar_itens_online($pdo, $json['itens'] ?? null);
    $itens = $normalizados['itens'];
    $itensIgnorados = $normalizados['ignorados'];
    $quantidade = count($itens);

    // 09/11/2026: pendências (produto não vinculado, sem saldo, categoria) vão nas Observações.
    $pendenciasOnline = $normalizados['pendencias'] ?? [];

    if ($pendenciasOnline) {
        $aviso = "PENDÊNCIA DA LOJA ON-LINE:\n- " . implode("\n- ", $pendenciasOnline);
        $observacoes = $observacoes !== '' ? ($aviso . "\n\n" . $observacoes) : $aviso;
    }

    [$modeloResumo, $fraseResumo] = resumo_compatibilidade_itens($itens);

    try {
        $pdo->beginTransaction();

        // Revalida dentro da transação para reduzir a janela de corrida.
        $existente = buscar_pedido_online_existente($pdo, $woocommerceOrderId);
        if ($existente) {
            $pdo->rollBack();
            responder([
                'sucesso' => true,
                'importado' => false,
                'duplicado' => true,
                'id' => (int)$existente['id'],
                'dado' => normalizar_row_saida($existente, $pdo),
            ]);
        }

        // Mantemos origem=venda_direta para não depender de alteração no enum
        // existente do banco. origem_externa_id é o marcador inequívoco de online.
        $st = $pdo->prepare(
            "INSERT INTO coroas (
                solicitante,
                telefone,
                local_entrega,
                observacoes,
                quantidade_coroas,
                modelo_coroa,
                frase,
                falecido,
                falecido_atendimento_id,
                status_pagamento,
                origem,
                origem_externa_id,
                status,
                criado_por,
                criado_em,
                atualizado_em
            ) VALUES (
                :solicitante,
                :telefone,
                :local_entrega,
                :observacoes,
                :quantidade_coroas,
                :modelo_coroa,
                :frase,
                :falecido,
                NULL,
                'pago',
                'venda_direta',
                :origem_externa_id,
                'novo',
                'WooCommerce',
                NOW(),
                NOW()
            )"
        );

        $st->execute([
            ':solicitante' => $solicitante,
            ':telefone' => $telefone !== '' ? $telefone : null,
            ':local_entrega' => $localEntrega !== '' ? $localEntrega : null,
            ':observacoes' => $observacoes !== '' ? $observacoes : null,
            ':quantidade_coroas' => $quantidade,
            ':modelo_coroa' => $modeloResumo,
            ':frase' => $fraseResumo,
            ':falecido' => $falecido,
            ':origem_externa_id' => $woocommerceOrderId,
        ]);

        $id = (int)$pdo->lastInsertId();
        inserir_itens_pedido($pdo, $id, $itens);
        // Total pago no site e frete (09/10/2026): a OS de coroa online usa o total pago; o frete fica descrito.
        // Só grava se o script do banco da conclusão já criou as colunas.
        $totalPagoSite = isset($json['total_pago']) && is_numeric($json['total_pago']) ? round((float)$json['total_pago'], 2) : null;
        $freteSite = isset($json['frete']) && is_numeric($json['frete']) ? round((float)$json['frete'], 2) : null;
        if ($totalPagoSite !== null || $freteSite !== null) {
            $temTotal = (bool)$pdo->query("SHOW COLUMNS FROM coroas LIKE 'total_pago'")->fetch(PDO::FETCH_ASSOC);
            if ($temTotal) {
                $pdo->prepare('UPDATE coroas SET total_pago = :t, frete = :f WHERE id = :id')
                    ->execute([':t' => $totalPagoSite, ':f' => $freteSite, ':id' => $id]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();

        // O índice UNIQUE é a proteção definitiva contra duas entregas
        // simultâneas do mesmo webhook.
        $existente = buscar_pedido_online_existente($pdo, $woocommerceOrderId);
        if ($existente) {
            responder([
                'sucesso' => true,
                'importado' => false,
                'duplicado' => true,
                'id' => (int)$existente['id'],
                'dado' => normalizar_row_saida($existente, $pdo),
            ]);
        }

        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Não foi possível importar o pedido online: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage()),
        ], 500);
    }

    // 11/11/2026: pedido do site vinculado ao velório pelo nome do falecido, com a sala do Memorial (aurora_12.php).
    if (is_file(__DIR__ . '/aurora_12.php')) { require_once __DIR__ . '/aurora_12.php'; a12VincularPedidoOnline($pdo, $id, $falecido, $localEntrega); }
    coroas_cache_invalidar();
    $row = buscar_pedido($pdo, $id);

    responder([
        'sucesso' => true,
        'importado' => true,
        'duplicado' => false,
        'id' => $id,
        'itens_ignorados' => $itensIgnorados,
        'pendencias' => $pendenciasOnline,
        'dado' => $row ? normalizar_row_saida($row, $pdo) : null,
    ], 201);
}

/* =========================================================
   NOVO
   ========================================================= */
if ($acao === 'novo') {
    $solicitante = texto($json['solicitante'] ?? '');
    $telefone = texto($json['telefone'] ?? '');
    $localEntrega = texto($json['local_entrega'] ?? '');
    $observacoes = texto($json['observacoes'] ?? '');
    $falecido = texto($json['falecido'] ?? '');

    if ($solicitante === '') {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Preencha o campo Solicitante.',
        ], 400);
    }

    if ($telefone === '') {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Preencha o campo Telefone.',
        ], 400);
    }

    if ($localEntrega === '') {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Preencha o campo Local de Entrega.',
        ], 400);
    }

    if ($falecido === '') {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Preencha o campo Falecido(a).',
        ], 400);
    }

    $falecidoAtendimentoId = (int)($json['falecido_atendimento_id'] ?? 0);
    if ($falecidoAtendimentoId <= 0) $falecidoAtendimentoId = null;

    $pagamento = validar_enum_ou_erro(
        $json['status_pagamento'] ?? '',
        ['pago', 'aguardando_pagamento'],
        'Status de Pagamento'
    );

    $origem = validar_enum_ou_erro(
        $json['origem'] ?? '',
        [
            'ordem_servico',
            'venda_direta',
        ],
        'Origem'
    );

    $rawItens = $json['itens'] ?? null;

    // Compatibilidade com clientes antigos de uma única coroa.
    if (!is_array($rawItens) || !$rawItens) {
        $modeloLegado = texto($json['modelo_coroa'] ?? '');
        $fraseLegada = texto($json['frase'] ?? '');

        if ($modeloLegado === '' || $fraseLegada === '') {
            responder([
                'sucesso' => false,
                'erro' => true,
                'msg' => 'Informe o modelo e a frase da coroa.',
            ], 400);
        }

        $quantidade = 1;

        $itens = [[
            'ordem' => 1,
            'tipo_coroa' => null,
            'produto_id' => null,
            'deposito_nome' => null,
            'modelo_coroa' => $modeloLegado,
            'frase' => $fraseLegada,
            'valor' => null,
            'foto_produto_url' => null,
        ]];
    } else {
        $quantidade = (int)($json['quantidade_coroas'] ?? count($rawItens));
        $quantidade = max(1, min(20, $quantidade));

        $itens = normalizar_itens_entrada(
            $pdo,
            $rawItens,
            $quantidade
        );
    }

    [$modeloResumo, $fraseResumo] = resumo_compatibilidade_itens($itens);

    // Pedido de Prefeitura autorizado: faturado à Prefeitura (OS Prf); não espera pagamento da família.
    $convenioPedido = ler_convenio_pedido_ou_erro($pdo, $json);
    if ($convenioPedido && $convenioPedido['autorizada'] === 'Sim') {
        $pagamento = 'pago';
    }

    $comprovanteUploadPreparado = null;
    $comprovantePreparado = null;

    if (upload_arquivo_presente('comprovante')) {
        $comprovanteUploadPreparado = preparar_upload_arquivo_ou_erro(
            'comprovante',
            [
                'application/pdf',
                'image/jpeg',
                'image/png',
                'image/webp',
            ],
            15 * 1024 * 1024
        );
    } elseif (!empty($json['comprovante_base64'])) {
        // Compatibilidade com versões antigas do frontend.
        $comprovantePreparado = preparar_base64_arquivo_ou_erro(
            $json['comprovante_base64'],
            [
                'application/pdf',
                'image/jpeg',
                'image/png',
                'image/webp',
            ],
            15 * 1024 * 1024,
            (string)($json['comprovante_mime'] ?? ''),
            (string)($json['comprovante_nome'] ?? '')
        );
    }

    $arquivoSalvo = null;

    try {
        $pdo->beginTransaction();

        $st = $pdo->prepare(
            "INSERT INTO coroas (
                solicitante,
                telefone,
                local_entrega,
                observacoes,
                quantidade_coroas,
                modelo_coroa,
                frase,
                falecido,
                falecido_atendimento_id,
                status_pagamento,
                origem,
                status,
                criado_por,
                criado_em,
                atualizado_em
            ) VALUES (
                :solicitante,
                :telefone,
                :local_entrega,
                :observacoes,
                :quantidade_coroas,
                :modelo_coroa,
                :frase,
                :falecido,
                :falecido_atendimento_id,
                :status_pagamento,
                :origem,
                'novo',
                :criado_por,
                NOW(),
                NOW()
            )"
        );

        $st->execute([
            ':solicitante' => $solicitante,
            ':telefone' => $telefone,
            ':local_entrega' => $localEntrega,
            ':observacoes' => $observacoes !== '' ? $observacoes : null,
            ':quantidade_coroas' => $quantidade,
            ':modelo_coroa' => $modeloResumo,
            ':frase' => $fraseResumo,
            ':falecido' => $falecido,
            ':falecido_atendimento_id' => $falecidoAtendimentoId,
            ':status_pagamento' => $pagamento,
            ':origem' => $origem,
            ':criado_por' => $usuario,
        ]);

        $id = (int)$pdo->lastInsertId();

        inserir_itens_pedido($pdo, $id, $itens);
        if ($convenioPedido) {
            gravar_convenio_pedido($pdo, $id, $convenioPedido);
        }

        if ($comprovanteUploadPreparado || $comprovantePreparado) {
            if ($comprovanteUploadPreparado) {
                $arquivoSalvo = salvar_comprovante_upload_preparado_coroas(
                    $id,
                    $comprovanteUploadPreparado
                );
                $mimeComprovante = $arquivoSalvo['mime'];
                $nomeComprovante = $arquivoSalvo['nome_original'];
            } else {
                $arquivoSalvo = salvar_binario_coroas(
                    $id,
                    'comprovante',
                    $comprovantePreparado['bin'],
                    $comprovantePreparado['ext']
                );
                $mimeComprovante = $comprovantePreparado['mime'];
                $nomeComprovante = $comprovantePreparado['nome_original'];
            }

            $stComprovante = $pdo->prepare(
                'UPDATE coroas
                 SET
                    comprovante_url = :url,
                    comprovante_path = :path,
                    comprovante_mime = :mime,
                    comprovante_nome = :nome,
                    comprovante_em = NOW(),
                    comprovante_por = :usuario,
                    atualizado_em = NOW()
                 WHERE id = :id
                 LIMIT 1'
            );

            $stComprovante->execute([
                ':url' => $arquivoSalvo['url'],
                ':path' => $arquivoSalvo['path'],
                ':mime' => $mimeComprovante,
                ':nome' => $nomeComprovante,
                ':usuario' => $usuario,
                ':id' => $id,
            ]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();

        if ($arquivoSalvo && !empty($arquivoSalvo['file_path'])) {
            @unlink($arquivoSalvo['file_path']);
        }

        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Não foi possível criar o pedido: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage()),
        ], 500);
    }

    $row = buscar_pedido($pdo, $id);

    $push = $row
        ? enviar_onesignal_novo_pedido($pdo, $row)
        : ['enviada' => false, 'erro' => 'Pedido não recuperado após inserção.'];

    responder([
        'sucesso' => true,
        'id' => $id,
        'dado' => $row ? normalizar_row_saida($row, $pdo) : null,
        'notificacao' => $push,
        'notificacao_enviada' => (bool)($push['enviada'] ?? false),
    ], 201);
}

/* =========================================================
   DAQUI EM DIANTE EXIGE ID
   ========================================================= */
$id = (int)($json['id'] ?? 0);

if ($id <= 0) {
    responder([
        'sucesso' => false,
        'erro' => true,
        'msg' => 'ID do pedido não informado.',
    ], 400);
}

/* =========================================================
   ATUALIZAR PAGAMENTO
   ========================================================= */
if ($acao === 'atualizar_pagamento') {
    $pagamento = validar_enum_ou_erro(
        $json['status_pagamento'] ?? '',
        ['pago', 'aguardando_pagamento'],
        'Status de Pagamento'
    );

    $st = $pdo->prepare(
        'UPDATE coroas
         SET status_pagamento = :p, atualizado_em = NOW()
         WHERE id = :id
         LIMIT 1'
    );

    $st->execute([
        ':p' => $pagamento,
        ':id' => $id,
    ]);

    if ($st->rowCount() === 0 && !buscar_pedido($pdo, $id)) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Pedido não encontrado.',
        ], 404);
    }

    $row = buscar_pedido($pdo, $id);

    responder([
        'sucesso' => true,
        'dado' => normalizar_row_saida($row, $pdo),
    ]);
}

/* =========================================================
   ANEXAR COMPROVANTE — IMAGEM OU PDF
   ========================================================= */
if ($acao === 'anexar_comprovante') {
    $row = buscar_pedido($pdo, $id);

    if (!$row) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Pedido não encontrado.',
        ], 404);
    }

    $prepared = null;
    $uploadPrepared = null;

    if (upload_arquivo_presente('comprovante')) {
        $uploadPrepared = preparar_upload_arquivo_ou_erro(
            'comprovante',
            [
                'application/pdf',
                'image/jpeg',
                'image/png',
                'image/webp',
            ],
            15 * 1024 * 1024
        );
    } else {
        // Compatibilidade com clientes antigos em Base64.
        $prepared = preparar_base64_arquivo_ou_erro(
            $json['base64'] ?? $json['comprovante_base64'] ?? '',
            [
                'application/pdf',
                'image/jpeg',
                'image/png',
                'image/webp',
            ],
            15 * 1024 * 1024,
            (string)($json['comprovante_mime'] ?? ''),
            (string)($json['comprovante_nome'] ?? '')
        );
    }

    $saved = null;

    try {
        if ($uploadPrepared) {
            $saved = salvar_comprovante_upload_preparado_coroas($id, $uploadPrepared);
            $mimeComprovante = $saved['mime'];
            $nomeComprovante = $saved['nome_original'];
        } else {
            $saved = salvar_binario_coroas(
                $id,
                'comprovante',
                $prepared['bin'],
                $prepared['ext']
            );
            $mimeComprovante = $prepared['mime'];
            $nomeComprovante = $prepared['nome_original'];
        }

        $st = $pdo->prepare(
            'UPDATE coroas
             SET
                comprovante_url = :url,
                comprovante_path = :path,
                comprovante_mime = :mime,
                comprovante_nome = :nome,
                comprovante_em = NOW(),
                comprovante_por = :usuario,
                atualizado_em = NOW()
             WHERE id = :id
             LIMIT 1'
        );

        $st->execute([
            ':url' => $saved['url'],
            ':path' => $saved['path'],
            ':mime' => $mimeComprovante,
            ':nome' => $nomeComprovante,
            ':usuario' => $usuario,
            ':id' => $id,
        ]);
    } catch (Throwable $e) {
        if ($saved && !empty($saved['file_path'])) {
            @unlink($saved['file_path']);
        }

        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Não foi possível salvar o comprovante: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage()),
        ], 500);
    }

    $row = buscar_pedido($pdo, $id);

    responder([
        'sucesso' => true,
        'dado' => normalizar_row_saida($row, $pdo),
    ]);
}

/* =========================================================
   ANEXAR FOTO DA COROA PRONTA
   ========================================================= */
if ($acao === 'anexar_foto_coroa') {
    $row = buscar_pedido($pdo, $id);

    if (!$row) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Pedido não encontrado.',
        ], 404);
    }

    if (upload_arquivo_presente('foto_coroa')) {
        $saved = salvar_imagem_coroa_upload_ou_erro($id, 'foto_coroa');
    } else {
        // Compatibilidade com versões antigas em Base64.
        $base64 = (string)($json['base64'] ?? $json['foto_coroa_base64'] ?? '');
        $saved = salvar_imagem_coroa_ou_erro($id, $base64);
    }

    $st = $pdo->prepare(
        'UPDATE coroas
         SET
            foto_coroa_url = :url,
            foto_coroa_path = :path,
            foto_coroa_em = NOW(),
            foto_coroa_por = :usuario,
            atualizado_em = NOW()
         WHERE id = :id
         LIMIT 1'
    );

    $st->execute([
        ':url' => $saved['url'],
        ':path' => $saved['path'],
        ':usuario' => $usuario,
        ':id' => $id,
    ]);

    $row = buscar_pedido($pdo, $id);

    responder([
        'sucesso' => true,
        'dado' => normalizar_row_saida($row, $pdo),
    ]);
}

/* =========================================================
   EDITAR DADOS BÁSICOS / ITENS
   ========================================================= */
if ($acao === 'editar') {
    $row = buscar_pedido($pdo, $id);

    if (!$row) {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Pedido não encontrado.',
        ], 404);
    }

    // Convênio do pedido avulso: só muda quando o app envia o campo (convenio_id vazio/0 = Particular).
    if (array_key_exists('convenio_id', $json) && ($row['origem'] ?? '') !== 'ordem_servico') {
        $convenioEdit = ler_convenio_pedido_ou_erro($pdo, $json);
        gravar_convenio_pedido($pdo, $id, $convenioEdit);
        if ($convenioEdit && $convenioEdit['autorizada'] === 'Sim' && ($row['status_pagamento'] ?? '') !== 'pago') {
            $pdo->prepare("UPDATE coroas SET status_pagamento = 'pago', atualizado_em = NOW() WHERE id = :id LIMIT 1")->execute([':id' => $id]);
        }
        coroas_cache_invalidar();
    }

    $solicitante = texto($json['solicitante'] ?? $row['solicitante']);
    $telefone = texto($json['telefone'] ?? ($row['telefone'] ?? ''));
    $localEntrega = texto($json['local_entrega'] ?? ($row['local_entrega'] ?? ''));
    $observacoes = texto($json['observacoes'] ?? ($row['observacoes'] ?? ''));
    $falecido = texto($json['falecido'] ?? $row['falecido']);

    if ($solicitante === '' || $telefone === '' || $localEntrega === '' || $falecido === '') {
        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Solicitante, Telefone, Local de Entrega e Falecido(a) são obrigatórios.',
        ], 400);
    }

    $falecidoAtendimentoId = array_key_exists('falecido_atendimento_id', $json)
        ? (int)$json['falecido_atendimento_id']
        : (int)($row['falecido_atendimento_id'] ?? 0);

    if ($falecidoAtendimentoId <= 0) $falecidoAtendimentoId = null;

    $temItens = isset($json['itens']) && is_array($json['itens']) && $json['itens'];

    if ($temItens) {
        $quantidade = max(
            1,
            min(
                20,
                (int)($json['quantidade_coroas'] ?? count($json['itens']))
            )
        );

        $itens = normalizar_itens_entrada(
            $pdo,
            $json['itens'],
            $quantidade
        );

        [$modeloResumo, $fraseResumo] = resumo_compatibilidade_itens($itens);

        try {
            $pdo->beginTransaction();

            $st = $pdo->prepare(
                'UPDATE coroas
                 SET
                    solicitante = :solicitante,
                    telefone = :telefone,
                    local_entrega = :local_entrega,
                    observacoes = :observacoes,
                    quantidade_coroas = :quantidade,
                    modelo_coroa = :modelo,
                    frase = :frase,
                    falecido = :falecido,
                    falecido_atendimento_id = :falecido_atendimento_id,
                    atualizado_em = NOW()
                 WHERE id = :id
                 LIMIT 1'
            );

            $st->execute([
                ':solicitante' => $solicitante,
                ':telefone' => $telefone,
                ':local_entrega' => $localEntrega,
                ':observacoes' => $observacoes !== '' ? $observacoes : null,
                ':quantidade' => $quantidade,
                ':modelo' => $modeloResumo,
                ':frase' => $fraseResumo,
                ':falecido' => $falecido,
                ':falecido_atendimento_id' => $falecidoAtendimentoId,
                ':id' => $id,
            ]);

            // Etapa por coroa (07/10/2026): a coroa que já andou na Confecção mantém a sua etapa (pela posição).
            $etapasAntigas = [];
            if (coroas_itens_tem_etapas($pdo)) {
                $stAnt = $pdo->prepare('SELECT * FROM coroas_itens WHERE coroa_id = :id');
                $stAnt->execute([':id' => $id]);
                foreach ($stAnt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $ant) {
                    $etapasAntigas[(int)$ant['ordem']] = $ant;
                }
            }

            $del = $pdo->prepare(
                'DELETE FROM coroas_itens WHERE coroa_id = :id'
            );
            $del->execute([':id' => $id]);

            inserir_itens_pedido($pdo, $id, $itens);

            if ($etapasAntigas) {
                $campos = ['status', 'coroa_inicio_em', 'coroa_inicio_por', 'faixa_inicio_em', 'faixa_inicio_por',
                           'foto_coroa_url', 'foto_coroa_path', 'foto_coroa_em', 'foto_coroa_por',
                           'finalizada_em', 'finalizada_por', 'entregue_em', 'entregue_por'];
                $set = implode(', ', array_map(static fn($c) => "{$c} = :{$c}", $campos));
                $stEt = $pdo->prepare("UPDATE coroas_itens SET {$set} WHERE coroa_id = :id AND ordem = :ordem");
                foreach ($etapasAntigas as $ordem => $ant) {
                    $p = [':id' => $id, ':ordem' => $ordem];
                    foreach ($campos as $c) $p[':' . $c] = $ant[$c] ?? null;
                    $stEt->execute($p);
                }
                recalcular_etapa_pedido($pdo, $id);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();

            responder([
                'sucesso' => false,
                'erro' => true,
                'msg' => 'Não foi possível editar o pedido: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage()),
            ], 500);
        }
    } else {
        // Compatibilidade com edição antiga de um único modelo/frase.
        $modelo = texto($json['modelo_coroa'] ?? $row['modelo_coroa']);
        $frase = texto($json['frase'] ?? $row['frase']);

        if ($modelo === '' || $frase === '') {
            responder([
                'sucesso' => false,
                'erro' => true,
                'msg' => 'Modelo de Coroa e Frase são obrigatórios.',
            ], 400);
        }

        $st = $pdo->prepare(
            'UPDATE coroas
             SET
                solicitante = :solicitante,
                telefone = :telefone,
                local_entrega = :local_entrega,
                observacoes = :observacoes,
                modelo_coroa = :modelo,
                frase = :frase,
                falecido = :falecido,
                falecido_atendimento_id = :falecido_atendimento_id,
                atualizado_em = NOW()
             WHERE id = :id
             LIMIT 1'
        );

        $st->execute([
            ':solicitante' => $solicitante,
            ':telefone' => $telefone,
            ':local_entrega' => $localEntrega,
            ':observacoes' => $observacoes !== '' ? $observacoes : null,
            ':modelo' => $modelo,
            ':frase' => $frase,
            ':falecido' => $falecido,
            ':falecido_atendimento_id' => $falecidoAtendimentoId,
            ':id' => $id,
        ]);
    }

    $row = buscar_pedido($pdo, $id);

    responder([
        'sucesso' => true,
        'dado' => normalizar_row_saida($row, $pdo),
    ]);
}

/* =========================================================
   ATUALIZAR STATUS / FLUXO
   ========================================================= */
if ($acao === 'atualizar_status') {
    $acaoFluxo = validar_enum_ou_erro(
        $json['status'] ?? '',
        ['iniciar', 'coroa', 'faixa', 'finalizada', 'entregue'],
        'Ação'
    );

    /* -----------------------------------------------------
       ETAPA DE UMA COROA (item_id) — 07/10/2026
       Cada coroa tem a sua etapa; o pedido vira o resumo das coroas.
       ----------------------------------------------------- */
    $itemIdFluxo = (int)($json['item_id'] ?? 0);
    if ($itemIdFluxo > 0 && coroas_itens_tem_etapas($pdo)) {
        $savedItem = null;

        try {
            $pdo->beginTransaction();

            $row = buscar_pedido($pdo, $id, true);
            if (!$row) {
                $pdo->rollBack();
                responder(['sucesso' => false, 'erro' => true, 'msg' => 'Pedido não encontrado.'], 404);
            }

            $item = buscar_item_coroa($pdo, $id, $itemIdFluxo, true);
            if (!$item) {
                $pdo->rollBack();
                responder(['sucesso' => false, 'erro' => true, 'msg' => 'Coroa não encontrada neste pedido.'], 404);
            }

            $statusItem = strtolower(trim((string)($item['status'] ?? 'novo')));
            $itemFinalizada = !empty($item['finalizada_em']) || in_array($statusItem, ['finalizada', 'entregue'], true);
            $itemEntregue = !empty($item['entregue_em']) || $statusItem === 'entregue';
            $itemArtificial = strtolower(trim((string)($item['tipo_coroa'] ?? ''))) === 'artificial';

            $recusar = static function (string $msg, int $code = 409, array $extra = []) use ($pdo): void {
                if ($pdo->inTransaction()) $pdo->rollBack();
                responder(array_merge(['sucesso' => false, 'erro' => true, 'msg' => $msg], $extra), $code);
            };

            if ($acaoFluxo === 'iniciar') {
                // 05/11/2026: INICIAR = início da coroa (natural) e da faixa num toque só.
                if ($itemFinalizada || $itemEntregue) $recusar('A coroa já foi finalizada e não pode voltar para confecção.');
                $jaIniciada = !empty($item['faixa_inicio_em']) && ($itemArtificial || !empty($item['coroa_inicio_em']));
                if ($jaIniciada) $recusar('A confecção desta coroa já foi iniciada.');

                $pdo->prepare(
                    "UPDATE coroas_itens
                     SET coroa_inicio_em = " . ($itemArtificial ? 'coroa_inicio_em' : 'COALESCE(coroa_inicio_em, NOW())') . ",
                         coroa_inicio_por = " . ($itemArtificial ? 'coroa_inicio_por' : 'COALESCE(coroa_inicio_por, :usuario_coroa)') . ",
                         faixa_inicio_em = COALESCE(faixa_inicio_em, NOW()),
                         faixa_inicio_por = COALESCE(faixa_inicio_por, :usuario_faixa),
                         status = 'faixa',
                         atualizado_em = NOW()
                     WHERE id = :id LIMIT 1"
                )->execute(array_merge(
                    $itemArtificial ? [] : [':usuario_coroa' => $usuario],
                    [':usuario_faixa' => $usuario, ':id' => $itemIdFluxo]
                ));
            } elseif ($acaoFluxo === 'coroa') {
                if ($itemArtificial) $recusar('Coroas artificiais não possuem a etapa Confeccionando Coroa.');
                if ($itemFinalizada || $itemEntregue) $recusar('A coroa já foi finalizada e não pode voltar para confecção.');
                if (!empty($item['coroa_inicio_em'])) $recusar('A confecção da coroa já foi iniciada.');

                $pdo->prepare(
                    "UPDATE coroas_itens
                     SET coroa_inicio_em = NOW(),
                         coroa_inicio_por = :usuario,
                         status = CASE WHEN faixa_inicio_em IS NOT NULL THEN 'faixa' ELSE 'coroa' END,
                         atualizado_em = NOW()
                     WHERE id = :id LIMIT 1"
                )->execute([':usuario' => $usuario, ':id' => $itemIdFluxo]);
            } elseif ($acaoFluxo === 'faixa') {
                if ($itemFinalizada || $itemEntregue) $recusar('A coroa já foi finalizada e não pode voltar para confecção.');
                if (!empty($item['faixa_inicio_em'])) $recusar('A confecção da faixa já foi iniciada.');

                $pdo->prepare(
                    "UPDATE coroas_itens
                     SET faixa_inicio_em = NOW(),
                         faixa_inicio_por = :usuario,
                         status = 'faixa',
                         atualizado_em = NOW()
                     WHERE id = :id LIMIT 1"
                )->execute([':usuario' => $usuario, ':id' => $itemIdFluxo]);
            } elseif ($acaoFluxo === 'finalizada') {
                if ($itemFinalizada) $recusar('A coroa já está finalizada.');

                // 05/11/2026: Coroa Pronta não exige mais os inícios separados. Se faltarem, são gravados agora
                // (mesmo usuário e horário), para o Quadro e os relatórios não ficarem com campo vazio.

                $temUploadFoto = upload_arquivo_presente('foto_coroa');
                $base64 = (string)($json['foto_coroa_base64'] ?? $json['base64'] ?? '');
                if (!$temUploadFoto && $base64 === '') {
                    $recusar('Para finalizar a coroa é obrigatório anexar a foto da coroa pronta.', 400, ['foto_coroa_obrigatoria' => true]);
                }

                $savedItem = $temUploadFoto
                    ? salvar_imagem_coroa_upload_ou_erro($id, 'foto_coroa')
                    : salvar_imagem_coroa_ou_erro($id, $base64);

                $pdo->prepare(
                    "UPDATE coroas_itens
                     SET foto_coroa_url = :url,
                         foto_coroa_path = :path,
                         foto_coroa_em = NOW(),
                         foto_coroa_por = :foto_usuario,
                         coroa_inicio_em = " . ($itemArtificial ? 'coroa_inicio_em' : 'COALESCE(coroa_inicio_em, NOW())') . ",
                         coroa_inicio_por = " . ($itemArtificial ? 'coroa_inicio_por' : 'COALESCE(coroa_inicio_por, :inicio_usuario_coroa)') . ",
                         faixa_inicio_em = COALESCE(faixa_inicio_em, NOW()),
                         faixa_inicio_por = COALESCE(faixa_inicio_por, :inicio_usuario_faixa),
                         finalizada_em = NOW(),
                         finalizada_por = :finalizada_usuario,
                         status = 'finalizada',
                         atualizado_em = NOW()
                     WHERE id = :id LIMIT 1"
                )->execute(array_merge([
                    ':url' => $savedItem['url'],
                    ':path' => $savedItem['path'],
                    ':foto_usuario' => $usuario,
                    ':inicio_usuario_faixa' => $usuario,
                    ':finalizada_usuario' => $usuario,
                    ':id' => $itemIdFluxo,
                ], $itemArtificial ? [] : [':inicio_usuario_coroa' => $usuario]));
            } elseif ($acaoFluxo === 'entregue') {
                if ($itemEntregue) $recusar('A coroa já foi entregue.');
                if (!$itemFinalizada) $recusar('A coroa precisa estar finalizada antes da entrega.');

                $pdo->prepare(
                    "UPDATE coroas_itens
                     SET entregue_em = NOW(),
                         entregue_por = :usuario,
                         status = 'entregue',
                         atualizado_em = NOW()
                     WHERE id = :id LIMIT 1"
                )->execute([':usuario' => $usuario, ':id' => $itemIdFluxo]);

                // 09/11/2026: coroa artificial da loja on-line e da venda direta sai do estoque na entrega.
                try {
                    $baixaEntrega = coroas_baixar_estoque_na_entrega($pdo, $row, [$item], texto($json['deposito_baixa'] ?? ''));
                } catch (EstqErro $e) {
                    $recusar($e->getMessage(), $e->http, $e->extra);
                }
            }

            recalcular_etapa_pedido($pdo, $id);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ($savedItem && !empty($savedItem['file_path']) && is_file($savedItem['file_path'])) {
                @unlink($savedItem['file_path']);
            }
            responder(['sucesso' => false, 'erro' => true, 'msg' => 'Erro ao registrar a ação da coroa: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
        }

        coroas_cache_invalidar();
        $row = buscar_pedido($pdo, $id);
        $itemDepois = null;
        foreach (buscar_itens_pedido($pdo, $id) as $it) {
            if ((int)($it['id'] ?? 0) === $itemIdFluxo) $itemDepois = $it;
        }

        $push = $row
            ? enviar_onesignal_acao_pedido($pdo, $row, $acaoFluxo, $usuario, $itemDepois, rotulo_coroa_do_pedido($pdo, $id, $itemIdFluxo))
            : ['enviada' => false, 'erro' => 'Pedido não recuperado após a ação.'];

        responder([
            'sucesso' => true,
            'acao' => $acaoFluxo,
            'usuario' => $usuario,
            'item_id' => $itemIdFluxo,
            'fluxo' => strtolower((string)($itemDepois['tipo_coroa'] ?? '')) === 'artificial' ? 'artificial' : 'natural_ou_misto',
            'dado' => $row ? normalizar_row_saida($row, $pdo) : null,
            'item' => $itemDepois,
            'baixa_estoque' => $baixaEntrega ?? null,
            'notificacao' => $push,
            'notificacao_enviada' => (bool)($push['enviada'] ?? false),
        ]);
    }

    $savedFinalizacao = null;

    try {
        $pdo->beginTransaction();

        $row = buscar_pedido($pdo, $id, true);

        if (!$row) {
            $pdo->rollBack();

            responder([
                'sucesso' => false,
                'erro' => true,
                'msg' => 'Pedido não encontrado.',
            ], 404);
        }

        $statusAtual = strtolower(trim((string)($row['status'] ?? 'novo')));
        $jaFinalizada = !empty($row['finalizada_em']) || in_array($statusAtual, ['finalizada', 'entregue'], true);
        $jaEntregue = !empty($row['entregue_em']) || $statusAtual === 'entregue';

        $itensFluxo = buscar_itens_pedido($pdo, $id);
        $somenteArtificial = pedido_somente_artificial_por_itens($itensFluxo);
        $exigeConfeccaoCoroa = pedido_exige_confeccao_coroa_por_itens($itensFluxo);

        if ($acaoFluxo === 'iniciar') {
            // 05/11/2026: INICIAR = início da coroa (natural/mista) e da faixa num toque só.
            if ($jaFinalizada || $jaEntregue) {
                $pdo->rollBack();
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'A coroa já foi finalizada e não pode voltar para confecção.',
                ], 409);
            }

            if (!empty($row['faixa_inicio_em']) && (!$exigeConfeccaoCoroa || !empty($row['coroa_inicio_em']))) {
                $pdo->rollBack();
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'A confecção desta coroa já foi iniciada.',
                ], 409);
            }

            $st = $pdo->prepare(
                "UPDATE coroas
                 SET
                    coroa_inicio_em = " . ($exigeConfeccaoCoroa ? 'COALESCE(coroa_inicio_em, NOW())' : 'coroa_inicio_em') . ",
                    coroa_inicio_por = " . ($exigeConfeccaoCoroa ? 'COALESCE(coroa_inicio_por, :usuario_coroa)' : 'coroa_inicio_por') . ",
                    faixa_inicio_em = COALESCE(faixa_inicio_em, NOW()),
                    faixa_inicio_por = COALESCE(faixa_inicio_por, :usuario_faixa),
                    status = 'faixa',
                    atualizado_em = NOW()
                 WHERE id = :id
                 LIMIT 1"
            );

            $st->execute(array_merge(
                $exigeConfeccaoCoroa ? [':usuario_coroa' => $usuario] : [],
                [':usuario_faixa' => $usuario, ':id' => $id]
            ));
        } elseif ($acaoFluxo === 'coroa') {
            if ($somenteArtificial) {
                $pdo->rollBack();

                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'Coroas artificiais não possuem a etapa Confeccionando Coroa.',
                ], 409);
            }
            if ($jaFinalizada || $jaEntregue) {
                $pdo->rollBack();
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'A coroa já foi finalizada e não pode voltar para confecção.',
                ], 409);
            }

            if (!empty($row['coroa_inicio_em'])) {
                $pdo->rollBack();
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'A confecção da coroa já foi iniciada.',
                ], 409);
            }

            $st = $pdo->prepare(
                "UPDATE coroas
                 SET
                    coroa_inicio_em = NOW(),
                    coroa_inicio_por = :usuario,
                    status = CASE
                        WHEN faixa_inicio_em IS NOT NULL THEN 'faixa'
                        ELSE 'coroa'
                    END,
                    atualizado_em = NOW()
                 WHERE id = :id
                 LIMIT 1"
            );

            $st->execute([
                ':usuario' => $usuario,
                ':id' => $id,
            ]);
        } elseif ($acaoFluxo === 'faixa') {
            if ($jaFinalizada || $jaEntregue) {
                $pdo->rollBack();
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'A coroa já foi finalizada e não pode voltar para confecção.',
                ], 409);
            }

            if (!empty($row['faixa_inicio_em'])) {
                $pdo->rollBack();
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'A confecção da faixa já foi iniciada.',
                ], 409);
            }

            $st = $pdo->prepare(
                "UPDATE coroas
                 SET
                    faixa_inicio_em = NOW(),
                    faixa_inicio_por = :usuario,
                    status = 'faixa',
                    atualizado_em = NOW()
                 WHERE id = :id
                 LIMIT 1"
            );

            $st->execute([
                ':usuario' => $usuario,
                ':id' => $id,
            ]);
        } elseif ($acaoFluxo === 'finalizada') {
            if ($jaFinalizada) {
                $pdo->rollBack();
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'A coroa já está finalizada.',
                ], 409);
            }

            // 05/11/2026: Coroa Pronta não exige mais os inícios separados; se faltarem, são gravados agora.

            $temUploadFoto = upload_arquivo_presente('foto_coroa');
            $base64 = (string)(
                $json['foto_coroa_base64'] ??
                $json['base64'] ??
                ''
            );

            if (!$temUploadFoto && $base64 === '') {
                $pdo->rollBack();

                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'foto_coroa_obrigatoria' => true,
                    'msg' => 'Para finalizar o pedido é obrigatório anexar a foto da coroa pronta.',
                ], 400);
            }

            $savedFinalizacao = $temUploadFoto
                ? salvar_imagem_coroa_upload_ou_erro($id, 'foto_coroa')
                : salvar_imagem_coroa_ou_erro($id, $base64);

            $st = $pdo->prepare(
                "UPDATE coroas
                 SET
                    foto_coroa_url = :url,
                    foto_coroa_path = :path,
                    foto_coroa_em = NOW(),
                    foto_coroa_por = :foto_usuario,
                    coroa_inicio_em = " . ($exigeConfeccaoCoroa ? 'COALESCE(coroa_inicio_em, NOW())' : 'coroa_inicio_em') . ",
                    coroa_inicio_por = " . ($exigeConfeccaoCoroa ? 'COALESCE(coroa_inicio_por, :inicio_usuario_coroa)' : 'coroa_inicio_por') . ",
                    faixa_inicio_em = COALESCE(faixa_inicio_em, NOW()),
                    faixa_inicio_por = COALESCE(faixa_inicio_por, :inicio_usuario_faixa),
                    finalizada_em = NOW(),
                    finalizada_por = :finalizada_usuario,
                    status = 'finalizada',
                    atualizado_em = NOW()
                 WHERE id = :id
                 LIMIT 1"
            );

            $st->execute(array_merge([
                ':url' => $savedFinalizacao['url'],
                ':path' => $savedFinalizacao['path'],
                ':foto_usuario' => $usuario,
                ':inicio_usuario_faixa' => $usuario,
                ':finalizada_usuario' => $usuario,
                ':id' => $id,
            ], $exigeConfeccaoCoroa ? [':inicio_usuario_coroa' => $usuario] : []));
        } elseif ($acaoFluxo === 'entregue') {
            if ($jaEntregue) {
                $pdo->rollBack();
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'A coroa já foi entregue.',
                ], 409);
            }

            if (!$jaFinalizada) {
                $pdo->rollBack();
                responder([
                    'sucesso' => false,
                    'erro' => true,
                    'msg' => 'A coroa precisa estar finalizada antes da entrega.',
                ], 409);
            }

            $st = $pdo->prepare(
                "UPDATE coroas
                 SET
                    entregue_em = NOW(),
                    entregue_por = :usuario,
                    status = 'entregue',
                    atualizado_em = NOW()
                 WHERE id = :id
                 LIMIT 1"
            );

            $st->execute([
                ':usuario' => $usuario,
                ':id' => $id,
            ]);

            // 09/11/2026: coroa artificial da loja on-line e da venda direta sai do estoque na entrega (coroas ainda não entregues).
            try {
                $baixaEntrega = coroas_baixar_estoque_na_entrega($pdo, $row, $itensFluxo, texto($json['deposito_baixa'] ?? ''));
            } catch (EstqErro $e) {
                $pdo->rollBack();
                responder(array_merge(['sucesso' => false, 'erro' => true, 'msg' => $e->getMessage()], $e->extra), $e->http);
            }
        }

        // App antigo (sem item_id): a etapa vale para todas as coroas do pedido.
        espelhar_etapa_pedido_nos_itens($pdo, $id);

        $pdo->commit();

        $row = buscar_pedido($pdo, $id);

        $push = $row
            ? enviar_onesignal_acao_pedido($pdo, $row, $acaoFluxo, $usuario)
            : ['enviada' => false, 'erro' => 'Pedido não recuperado após a ação.'];

        responder([
            'sucesso' => true,
            'acao' => $acaoFluxo,
            'usuario' => $usuario,
            'fluxo' => $somenteArtificial ? 'artificial' : 'natural_ou_misto',
            'dado' => $row ? normalizar_row_saida($row, $pdo) : null,
            'baixa_estoque' => $baixaEntrega ?? null,
            'notificacao' => $push,
            'notificacao_enviada' => (bool)($push['enviada'] ?? false),
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();

        // Se a imagem foi gravada no disco, mas a transação falhou,
        // evita deixar arquivo órfão.
        if (
            $savedFinalizacao &&
            !empty($savedFinalizacao['file_path']) &&
            is_file($savedFinalizacao['file_path'])
        ) {
            @unlink($savedFinalizacao['file_path']);
        }

        responder([
            'sucesso' => false,
            'erro' => true,
            'msg' => 'Erro ao registrar a ação do pedido: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage()),
        ], 500);
    }
}

responder([
    'sucesso' => false,
    'erro' => true,
    'msg' => 'Ação inválida.',
], 400);
