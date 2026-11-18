<?php
declare(strict_types=1);
// 23/10/2026 (segurança): confere o login assinado (cookie pai_session) antes de usar os cookies pai_*. Ver /home2/pla48587/pai_sessao.php
if (is_file('/home2/pla48587/pai_sessao.php')) { include_once '/home2/pla48587/pai_sessao.php'; } elseif (PHP_SAPI !== 'cli') { $paiChavesSemSessao = @include '/home2/pla48587/pai-chaves.php'; if (is_array($paiChavesSemSessao) && strtolower(trim((string) ($paiChavesSemSessao['pai_sessao_modo'] ?? ''))) === 'exigir') { error_log('[PAI] pai_sessao.php ausente com pai_sessao_modo=exigir: acesso bloqueado em ' . basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''))); if (!headers_sent()) { http_response_code(503); header('Content-Type: application/json; charset=utf-8'); header('Retry-After: 300'); } echo json_encode(['ok' => false, 'sucesso' => false, 'success' => false, 'erro' => 'Sistema em manutenção. Tente novamente em alguns minutos.', 'msg' => 'Sistema em manutenção. Tente novamente em alguns minutos.'], JSON_UNESCAPED_UNICODE); exit; } unset($paiChavesSemSessao); } // 23/10/2026: sem o pai_sessao.php e com o modo exigir, bloqueia em vez de liberar

/* ============================================================
   REQUISIÇÕES DIGITAIS DE MATERIAIS - API
   PAI - Plano Assistencial Integrado

   Fluxo operacional:
   PENDENTE -> EM_SEPARACAO -> EM_TRANSITO -> ENTREGUE
   Exceções: CANCELADA, RECUSADA

   Este arquivo é independente do materiais_gerais.php, mas reaproveita
   as tabelas existentes de usuários, produtos, depósitos, saldos e movimentos.

   13/10/2026 · Reposição automática e contagem às cegas:
   - Recebimento de transferência (destino_tipo DEPOSITO) exige o
     "estoque atualizado" de cada item, digitado às cegas, e aceita a
     quantidade que chegou (até a enviada). Diferenças viram alertas em
     est_estoque_alerta (via estoque_reposicao_nucleo.php).
   - Requisição automática (est_requisicao.automatica = 1) é recebida pelo
     responsável do local (est_reposicao_local.recebedor_usuario_id) ou,
     quando não há responsável, por qualquer usuário.
   - Enquanto o SQL reposicao_automatica.sql não for rodado, tudo funciona
     como antes.
   ============================================================ */

/* =========================
   CORS + NO-CACHE
========================= */

$allowedOrigins = [
  'https://app.planoassistencialintegrado.com.br',
  'https://pai.planoassistencialintegrado.com.br',
  'https://planoassistencialintegrado.com.br',
  'https://www.planoassistencialintegrado.com.br',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $allowedOrigins, true)) {
  header("Access-Control-Allow-Origin: $origin");
  header('Access-Control-Allow-Credentials: true');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization');
  header('Vary: Origin');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

/* =========================
   SESSÃO
========================= */

$sessionLifetime = 8 * 60 * 60;
ini_set('session.gc_maxlifetime', (string)$sessionLifetime);
ini_set('session.cookie_lifetime', (string)$sessionLifetime);

session_set_cookie_params([
  'lifetime' => $sessionLifetime,
  'path'     => '/',
  'domain'   => '.planoassistencialintegrado.com.br',
  'secure'   => true,
  'httponly' => true,
  'samesite' => 'Lax',
]);

session_start();

date_default_timezone_set(getenv('PAI_TIMEZONE') ?: 'America/Sao_Paulo');

/* =========================
   CONFIGURAÇÃO PRIVADA
   Banco e OneSignal vêm do mesmo pai-chaves.php usado pelos demais endpoints.
========================= */

$PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';

if (!is_file($PAI_CHAVES_FILE) || !is_readable($PAI_CHAVES_FILE)) {
  json_response([
    'ok'  => false,
    'msg' => 'Arquivo privado de configuração não encontrado ou sem permissão de leitura.',
  ], 500);
}

$PAI_CONFIG = require $PAI_CHAVES_FILE;

if (!is_array($PAI_CONFIG)) {
  json_response([
    'ok'  => false,
    'msg' => 'Arquivo privado de configuração inválido.',
  ], 500);
}

$servername = trim((string)($PAI_CONFIG['db_host'] ?? ''));
$username   = trim((string)($PAI_CONFIG['db_user'] ?? ''));
$password   = (string)($PAI_CONFIG['db_password'] ?? '');
$dbname     = trim((string)($PAI_CONFIG['db_name'] ?? ''));

$onesignal_app_id  = trim((string)($PAI_CONFIG['onesignal_app_id'] ?? ''));
$onesignal_api_key = trim((string)($PAI_CONFIG['onesignal_api_key'] ?? ''));

if ($servername === '' || $username === '' || $password === '' || $dbname === '') {
  json_response([
    'ok'  => false,
    'msg' => 'Configuração do banco ausente ou incompleta em pai-chaves.php.',
  ], 500);
}

// Rotas reais do módulo de requisições.
$onesignal_url_requisicoes = 'https://pai.planoassistencialintegrado.com.br/requisicoes';
$onesignal_url_minhas_solicitacoes = 'https://pai.planoassistencialintegrado.com.br/minhas-solicitacoes';
$onesignal_url_solicitar_produto = 'https://pai.planoassistencialintegrado.com.br/solicitar-produto';
$onesignal_url_requisicao = 'https://pai.planoassistencialintegrado.com.br/requisicao';

$GLOBALS['servername'] = $servername;
$GLOBALS['username']   = $username;
$GLOBALS['password']   = $password;
$GLOBALS['dbname']     = $dbname;
$GLOBALS['onesignal_app_id'] = $onesignal_app_id;
$GLOBALS['onesignal_api_key'] = $onesignal_api_key;
$GLOBALS['onesignal_url_requisicoes'] = $onesignal_url_requisicoes;
$GLOBALS['onesignal_url_minhas_solicitacoes'] = $onesignal_url_minhas_solicitacoes;
$GLOBALS['onesignal_url_solicitar_produto'] = $onesignal_url_solicitar_produto;
$GLOBALS['onesignal_url_requisicao'] = $onesignal_url_requisicao;

require_once __DIR__ . '/estoque_reposicao_nucleo.php';

/* =========================
   RESPOSTA / ERROS
========================= */

function json_response(array $data, int $status = 200): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

set_exception_handler(function (Throwable $e): void {
  error_log('[requisicoes.php] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
  json_response([
    'ok'  => false,
    'msg' => 'Erro interno. Tente novamente ou contate o suporte.',
  ], 500);
});

/* =========================
   DB HELPERS
========================= */

function db(): PDO {
  static $pdo = null;

  if ($pdo === null) {
    $host = (string)($GLOBALS['servername'] ?? '');
    $db   = (string)($GLOBALS['dbname'] ?? '');
    $user = (string)($GLOBALS['username'] ?? '');
    $pass = (string)($GLOBALS['password'] ?? '');

    if ($host === '' || $db === '' || $user === '') {
      throw new RuntimeException('Configuração de banco inválida.');
    }

    $pdo = new PDO(
      "mysql:host={$host};dbname={$db};charset=utf8mb4",
      $user,
      $pass,
      [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
      ]
    );
  }

  return $pdo;
}

function fetchAll(string $sql, array $params = []): array {
  $st = db()->prepare($sql);
  $st->execute($params);
  return $st->fetchAll();
}

function fetchOne(string $sql, array $params = []): ?array {
  $st = db()->prepare($sql);
  $st->execute($params);
  $row = $st->fetch();
  return $row === false ? null : $row;
}

function execSql(string $sql, array $params = []): int {
  $st = db()->prepare($sql);
  $st->execute($params);
  return $st->rowCount();
}

function lastInsertId(): int {
  return (int)db()->lastInsertId();
}

/* =========================
   AUTH
========================= */

function current_user_id(): ?int {
  if (!empty($_SESSION['user_id'])) {
    return (int)$_SESSION['user_id'];
  }

  if (!empty($_SESSION['usuario_id'])) {
    $_SESSION['user_id'] = (int)$_SESSION['usuario_id'];
    return (int)$_SESSION['user_id'];
  }

  $paiUid = $_COOKIE['pai_uid'] ?? null;
  if ($paiUid !== null && is_numeric($paiUid) && (int)$paiUid > 0) {
    $_SESSION['user_id'] = (int)$paiUid;
    return (int)$paiUid;
  }

  $login = trim((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
  if ($login !== '') {
    $u = fetchOne('SELECT id FROM usuarios WHERE usuario = :u LIMIT 1', [':u' => $login]);
    if ($u && !empty($u['id'])) {
      $_SESSION['user_id'] = (int)$u['id'];
      return (int)$u['id'];
    }
  }

  return null;
}

function require_login(): int {
  $uid = current_user_id();
  if (!$uid || $uid <= 0) {
    json_response([
      'ok'         => false,
      'need_login' => 1,
      'msg'        => 'Login necessário.',
    ], 401);
  }
  return $uid;
}

/**
 * 18/11/2026: o Painel de Requisições (ações dashboard_*) só para quem tem a chave 'dashboard-requisicoes'
 * (páginas do grupo + Dar − Tirar da tela Permissões) ou a Gestão (cargo adm ou chave 'gestao').
 */
function req_pode_painel(int $uid): bool {
  try {
    $u = fetchOne('SELECT cargo FROM usuarios WHERE id = :id LIMIT 1', [':id' => $uid]);
    if ($u && strtolower(trim((string)($u['cargo'] ?? ''))) === 'adm') return true;
    $p = array_column(fetchAll('SELECT pagina FROM permissoes WHERE user_id = :u', [':u' => $uid]), 'pagina');
    $p = array_merge($p, array_column(fetchAll(
      'SELECT cp.pagina FROM usuarios u
         INNER JOIN cargos c ON c.slug = u.cargo AND c.ativo = 1
         INNER JOIN cargo_paginas cp ON cp.cargo_id = c.id
        WHERE u.id = :u', [':u' => $uid]), 'pagina'));
    $p = array_map('strval', $p);
    if (is_file(__DIR__ . '/acesso_paginas.php')) {
      require_once __DIR__ . '/acesso_paginas.php';
      $p = acessoTirar(db(), $uid, $p);
    }
    return in_array('gestao', $p, true) || in_array('dashboard-requisicoes', $p, true);
  } catch (Throwable $e) {
    return false;
  }
}

function current_user_row(int $uid): array {
  $u = fetchOne('SELECT id, nome, usuario FROM usuarios WHERE id = :id LIMIT 1', [':id' => $uid]);
  if (!$u) {
    return ['id' => $uid, 'nome' => 'Usuário #' . $uid, 'usuario' => ''];
  }
  return $u;
}

/* =========================
   REQUEST
========================= */

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$ct     = $_SERVER['CONTENT_TYPE'] ?? ($_SERVER['HTTP_CONTENT_TYPE'] ?? '');

$body = [];
if ($method === 'POST' && stripos($ct, 'application/json') !== false) {
  $raw  = file_get_contents('php://input');
  $json = json_decode($raw ?: '', true);
  if (is_array($json)) {
    $body = $json;
  }
} elseif ($method === 'POST') {
  $body = $_POST ?: [];
}

$action = trim((string)($body['action'] ?? $_GET['action'] ?? ''));
if ($action === '' && isset($_GET['init'])) {
  $action = 'init';
}

/* =========================
   UTIL
========================= */

function norm_text(string $s): string {
  $s = trim($s);
  $s = mb_strtoupper($s, 'UTF-8');

  $from = ['Á','À','Â','Ã','Ä','É','È','Ê','Ë','Í','Ì','Î','Ï','Ó','Ò','Ô','Õ','Ö','Ú','Ù','Û','Ü','Ç','Ñ'];
  $to   = ['A','A','A','A','A','E','E','E','E','I','I','I','I','O','O','O','O','O','U','U','U','U','C','N'];
  return str_replace($from, $to, $s);
}

function parse_decimal_any($v): string {
  $s = trim((string)$v);
  if ($s === '') return '0';

  $s = str_replace([' ', 'R$'], ['', ''], $s);
  $s = preg_replace('/[^0-9,\.\-]/', '', $s) ?? $s;

  if ($s === '' || $s === '-') return '0';

  if (strpos($s, ',') !== false) {
    $s = str_replace('.', '', $s);
    $s = str_replace(',', '.', $s);
  }

  $n = (float)$s;
  if (!is_finite($n)) return '0';
  return number_format($n, 3, '.', '');
}

function decimal_gt_zero(string $n): bool {
  return (float)$n > 0;
}

function clean_status(string $s): string {
  $s = norm_text($s);
  $s = str_replace([' ', '-'], '_', $s);

  $map = [
    'PENDENTE'      => 'PENDENTE',
    'EM_SEPARACAO'  => 'EM_SEPARACAO',
    'SEPARACAO'     => 'EM_SEPARACAO',
    'EM_TRANSITO'   => 'EM_TRANSITO',
    'TRANSITO'      => 'EM_TRANSITO',
    'ENTREGUE'      => 'ENTREGUE',
    'CANCELADA'     => 'CANCELADA',
    'CANCELADO'     => 'CANCELADA',
    'RECUSADA'      => 'RECUSADA',
    'RECUSADO'      => 'RECUSADA',
  ];

  return $map[$s] ?? '';
}

function valid_statuses(): array {
  return ['PENDENTE', 'EM_SEPARACAO', 'EM_TRANSITO', 'ENTREGUE', 'CANCELADA', 'RECUSADA'];
}

function status_label(string $s): string {
  return match ($s) {
    'PENDENTE'     => 'Pendente',
    'EM_SEPARACAO' => 'Em separação',
    'EM_TRANSITO'  => 'Em trânsito',
    'ENTREGUE'     => 'Entregue',
    'CANCELADA'    => 'Cancelada',
    'RECUSADA'     => 'Recusada',
    default        => $s,
  };
}

function bool_param($v): bool {
  if (is_bool($v)) return $v;
  $s = strtolower(trim((string)$v));
  return in_array($s, ['1', 'true', 'sim', 'yes', 'on'], true);
}

function date_or_null($v): ?string {
  $s = trim((string)$v);
  if ($s === '') return null;
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return null;
  return $s;
}

function limit_offset(): array {
  $limit  = (int)($_GET['limit'] ?? 100);
  $offset = (int)($_GET['offset'] ?? 0);

  $limit = max(1, min(500, $limit));
  $offset = max(0, $offset);

  return [$limit, $offset];
}

function csv_cell($v, string $sep = ';'): string {
  $s = (string)($v ?? '');
  $mustQuote = str_contains($s, '"') || str_contains($s, "\n") || str_contains($s, "\r") || str_contains($s, $sep);
  $s = str_replace('"', '""', $s);
  return $mustQuote ? '"' . $s . '"' : $s;
}

/* =========================
   SCHEMA
========================= */

function table_exists(string $table): bool {
  $row = fetchOne(
    'SELECT COUNT(*) AS qtd
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = :t',
    [':t' => $table]
  );
  return (int)($row['qtd'] ?? 0) > 0;
}

function column_exists(string $table, string $column): bool {
  $row = fetchOne(
    'SELECT COUNT(*) AS qtd
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = :t
        AND column_name = :c',
    [':t' => $table, ':c' => $column]
  );
  return (int)($row['qtd'] ?? 0) > 0;
}

function ensure_column(string $table, string $column, string $definition): void {
  if (!column_exists($table, $column)) {
    execSql("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
  }
}

function ensure_requisicoes_schema(): void {
  static $done = false;
  if ($done) return;

  execSql("
    CREATE TABLE IF NOT EXISTS est_requisicao (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(30) NULL,
      status ENUM('PENDENTE','EM_SEPARACAO','EM_TRANSITO','ENTREGUE','CANCELADA','RECUSADA') NOT NULL DEFAULT 'PENDENTE',

      solicitante_usuario_id INT NOT NULL,
      unidade_destino_id INT NULL,
      unidade_destino_texto VARCHAR(160) NULL,
      destino_tipo ENUM('DEPOSITO','CONSUMO') NOT NULL DEFAULT 'CONSUMO',

      id_atendimento VARCHAR(80) NULL,
      justificativa TEXT NOT NULL,

      separado_por_usuario_id INT NULL,
      separado_em DATETIME NULL,

      enviado_por_usuario_id INT NULL,
      enviado_em DATETIME NULL,
      deposito_origem_id INT NULL,

      recebido_por_usuario_id INT NULL,
      recebido_em DATETIME NULL,

      recusado_por_usuario_id INT NULL,
      recusado_em DATETIME NULL,
      motivo_recusa TEXT NULL,

      cancelado_por_usuario_id INT NULL,
      cancelado_em DATETIME NULL,
      motivo_cancelamento TEXT NULL,

      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      UNIQUE KEY uq_est_requisicao_codigo (codigo),
      KEY idx_req_status_criado (status, criado_em),
      KEY idx_req_solicitante (solicitante_usuario_id),
      KEY idx_req_destino (unidade_destino_id),
      KEY idx_req_atendimento (id_atendimento),
      KEY idx_req_transito (status, enviado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  ");

  execSql("
    CREATE TABLE IF NOT EXISTS est_requisicao_item (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requisicao_id INT NOT NULL,
      produto_id INT NOT NULL,
      deposito_origem_id INT NULL,

      produto_nome_snapshot VARCHAR(255) NOT NULL,
      codigo_barras_snapshot VARCHAR(100) NULL,

      quantidade_solicitada DECIMAL(12,3) NOT NULL,
      quantidade_enviada DECIMAL(12,3) NULL,
      quantidade_recebida DECIMAL(12,3) NULL,

      observacao TEXT NULL,
      movimento_saida_id INT NULL,
      movimento_entrada_id INT NULL,
      movimento_transferencia_id INT NULL,

      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      KEY idx_req_item_req (requisicao_id),
      KEY idx_req_item_produto (produto_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  ");

  execSql("
    CREATE TABLE IF NOT EXISTS est_requisicao_evento (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requisicao_id INT NOT NULL,
      usuario_id INT NOT NULL,
      evento VARCHAR(50) NOT NULL,
      status_de VARCHAR(30) NULL,
      status_para VARCHAR(30) NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

      KEY idx_req_evento_req (requisicao_id, criado_em),
      KEY idx_req_evento_usuario (usuario_id),
      KEY idx_req_evento_evento (evento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  ");

  ensure_column('est_requisicao', 'codigo', "VARCHAR(30) NULL AFTER id");
  ensure_column('est_requisicao', 'destino_tipo', "ENUM('DEPOSITO','CONSUMO') NOT NULL DEFAULT 'CONSUMO' AFTER unidade_destino_texto");
  ensure_column('est_requisicao_item', 'deposito_origem_id', 'INT NULL AFTER produto_id');
  ensure_column('est_requisicao_item', 'quantidade_enviada', 'DECIMAL(12,3) NULL AFTER quantidade_solicitada');
  ensure_column('est_requisicao_item', 'quantidade_recebida', 'DECIMAL(12,3) NULL AFTER quantidade_enviada');
  ensure_column('est_requisicao_item', 'movimento_saida_id', 'INT NULL AFTER observacao');
  ensure_column('est_requisicao_item', 'movimento_entrada_id', 'INT NULL AFTER movimento_saida_id');
  ensure_column('est_requisicao_item', 'movimento_transferencia_id', 'INT NULL AFTER movimento_entrada_id');

  $done = true;
}

/* =========================
   DOMÍNIO
========================= */

function produto_exige_atendimento(array $produto): bool {
  $texto = norm_text(
    (string)($produto['nome'] ?? '') . ' ' .
    (string)($produto['categoria_nome'] ?? '') . ' ' .
    (string)($produto['classificacao_nome'] ?? '')
  );

  $gatilhos = [
    'URNA',
    'ROUPA',
    'FLUID',
    'TANATO',
    'TANATOPRAXIA',
  ];

  foreach ($gatilhos as $g) {
    if (str_contains($texto, $g)) return true;
  }

  return false;
}


/**
 * Regra operacional usada também pela tela manual de Solicitar Produto.
 *
 * Uma requisição não pode misturar grupos diferentes.
 *
 * - MERCADORIA PARA REVENDA   -> Reposição de Estoque / DEPOSITO
 * - MATERIAL DE USO E CONSUMO -> Consumo Interno / CONSUMO
 * - INSUMOS                    -> Insumos para Atendimento / DEPOSITO
 *
 * Classificações futuras/desconhecidas continuam aceitas quando todos os
 * itens da requisição pertencem exatamente à mesma classificação.
 */
function regra_requisicao_por_classificacao(array $produto): array {
  $raw = trim((string)($produto['classificacao_nome'] ?? ''));
  $norm = norm_text($raw);
  $norm = preg_replace('/\s+/u', ' ', trim($norm)) ?: trim($norm);

  return match ($norm) {
    'MERCADORIA PARA REVENDA' => [
      'grupo' => 'MERCADORIA_REVENDA',
      'classificacao' => $raw !== '' ? $raw : 'MERCADORIA PARA REVENDA',
      'tipo_requisicao' => 'Reposição de Estoque',
      'destino_tipo' => 'DEPOSITO',
    ],

    'MATERIAL DE USO E CONSUMO' => [
      'grupo' => 'USO_CONSUMO',
      'classificacao' => $raw !== '' ? $raw : 'MATERIAL DE USO E CONSUMO',
      'tipo_requisicao' => 'Consumo Interno',
      'destino_tipo' => 'CONSUMO',
    ],

    'INSUMOS' => [
      'grupo' => 'INSUMOS_ATENDIMENTO',
      'classificacao' => $raw !== '' ? $raw : 'INSUMOS',
      'tipo_requisicao' => 'Insumos Para Atendimentos Funerários',
      'destino_tipo' => 'DEPOSITO',
    ],

    default => [
      'grupo' => 'CLASSIFICACAO:' . ($norm !== '' ? $norm : 'SEM_CLASSIFICACAO'),
      'classificacao' => $raw !== '' ? $raw : 'Sem classificação',
      'tipo_requisicao' => $raw !== '' ? $raw : 'Requisição de materiais',
      'destino_tipo' => null,
    ],
  };
}

function carregar_produto(int $produtoId, bool $forUpdate = false): ?array {
  $sql = "
    SELECT
      p.id,
      p.nome,
      p.descricao,
      p.codigo_barras,
      p.valor,
      p.preco_custo,
      p.minimo,
      p.maximo,
      p.foto_url,
      p.ativo,
      p.atualizado_em,
      p.categoria_id,
      c.nome AS categoria_nome,
      p.fabricante_id,
      f.nome AS fabricante_nome,
      p.classificacao_id,
      cl.nome AS classificacao_nome
    FROM est_produto p
    LEFT JOIN est_categoria c ON c.id = p.categoria_id
    LEFT JOIN est_fabricante f ON f.id = p.fabricante_id
    LEFT JOIN est_classificacao cl ON cl.id = p.classificacao_id
    WHERE p.id = :id
    LIMIT 1
  ";

  if ($forUpdate) {
    $sql .= ' FOR UPDATE';
  }

  return fetchOne($sql, [':id' => $produtoId]);
}

function add_event(int $requisicaoId, int $usuarioId, string $evento, ?string $statusDe = null, ?string $statusPara = null, ?string $obs = null): void {
  execSql(
    'INSERT INTO est_requisicao_evento
      (requisicao_id, usuario_id, evento, status_de, status_para, observacao, criado_em)
     VALUES
      (:rid, :uid, :evento, :de, :para, :obs, NOW())',
    [
      ':rid'    => $requisicaoId,
      ':uid'    => $usuarioId,
      ':evento' => $evento,
      ':de'     => $statusDe,
      ':para'   => $statusPara,
      ':obs'    => $obs,
    ]
  );
}

/** true quando o SQL da reposição automática já foi rodado. */
function req_reposicao_pronta(): bool {
  static $ok = null;
  if ($ok === null) $ok = rep_pronto(db());
  return $ok;
}

/** Usuário pode receber/ver esta requisição como "minha" (solicitante ou responsável da automática). */
function req_usuario_recebe(array $req, int $uid): bool {
  if ((int)($req['solicitante_usuario_id'] ?? 0) === $uid) return true;
  if (!req_reposicao_pronta() || (int)($req['automatica'] ?? 0) !== 1) return false;
  return rep_pode_receber_automatica(db(), (int)($req['unidade_destino_id'] ?? 0), $uid);
}

function req_codigo(int $id): string {
  return 'REQ-' . str_pad((string)$id, 6, '0', STR_PAD_LEFT);
}

function carregar_requisicao_base(int $id, bool $forUpdate = false): ?array {
  $sql = 'SELECT * FROM est_requisicao WHERE id = :id LIMIT 1';
  if ($forUpdate) $sql .= ' FOR UPDATE';
  return fetchOne($sql, [':id' => $id]);
}

function carregar_requisicao_detalhe(int $id): ?array {
  $head = fetchOne(
    "SELECT
       r.*,
       sol.nome AS solicitante_nome,
       sol.usuario AS solicitante_usuario,
       sep.nome AS separado_por_nome,
       env.nome AS enviado_por_nome,
       rec.nome AS recebido_por_nome,
       rej.nome AS recusado_por_nome,
       can.nome AS cancelado_por_nome,
       dd.nome AS unidade_destino_nome,
       do.nome AS deposito_origem_nome
     FROM est_requisicao r
     LEFT JOIN usuarios sol ON sol.id = r.solicitante_usuario_id
     LEFT JOIN usuarios sep ON sep.id = r.separado_por_usuario_id
     LEFT JOIN usuarios env ON env.id = r.enviado_por_usuario_id
     LEFT JOIN usuarios rec ON rec.id = r.recebido_por_usuario_id
     LEFT JOIN usuarios rej ON rej.id = r.recusado_por_usuario_id
     LEFT JOIN usuarios can ON can.id = r.cancelado_por_usuario_id
     LEFT JOIN est_deposito dd ON dd.id = r.unidade_destino_id
     LEFT JOIN est_deposito do ON do.id = r.deposito_origem_id
     WHERE r.id = :id
     LIMIT 1",
    [':id' => $id]
  );

  if (!$head) return null;

  $items = fetchAll(
    "SELECT
       i.*,
       dio.nome AS deposito_origem_nome,
       p.nome AS produto_nome_atual,
       p.ativo AS produto_ativo,
       c.nome AS categoria_nome,
       cl.nome AS classificacao_nome
     FROM est_requisicao_item i
     LEFT JOIN est_deposito dio ON dio.id = i.deposito_origem_id
     LEFT JOIN est_produto p ON p.id = i.produto_id
     LEFT JOIN est_categoria c ON c.id = p.categoria_id
     LEFT JOIN est_classificacao cl ON cl.id = p.classificacao_id
     WHERE i.requisicao_id = :id
     ORDER BY i.id ASC",
    [':id' => $id]
  );

  $events = fetchAll(
    "SELECT
       e.*,
       u.nome AS usuario_nome,
       u.usuario AS usuario_login
     FROM est_requisicao_evento e
     LEFT JOIN usuarios u ON u.id = e.usuario_id
     WHERE e.requisicao_id = :id
     ORDER BY e.criado_em ASC, e.id ASC",
    [':id' => $id]
  );

  $head['status_label'] = status_label((string)$head['status']);
  $head['items'] = $items;
  $head['eventos'] = $events;
  return $head;
}

/* =========================
   NOTIFICAÇÕES ONESIGNAL
========================= */

function push_texto_curto(?string $texto, int $limite = 180): string {
  $texto = trim((string)$texto);
  $texto = strip_tags($texto);
  $texto = preg_replace('/\s+/u', ' ', $texto) ?? $texto;

  if ($texto === '') return '';

  if (function_exists('mb_substr')) {
    return mb_substr($texto, 0, $limite, 'UTF-8');
  }

  return substr($texto, 0, $limite);
}

function enviar_push_requisicao(
  string $evento,
  array $req,
  array $ator = []
): void {
  $appId = trim((string)($GLOBALS['onesignal_app_id'] ?? ''));
  $apiKey = trim((string)($GLOBALS['onesignal_api_key'] ?? ''));

  if ($appId === '' || $apiKey === '') return;

  $clickUrl = '';
  $rota = '';

  $solicitante = push_texto_curto((string)($req['solicitante_nome'] ?? ''), 100);
  if ($solicitante === '') $solicitante = 'Usuário';

  $atorNome = push_texto_curto((string)($ator['nome'] ?? ''), 100);
  if ($atorNome === '') $atorNome = 'Usuário';

  $destino = push_texto_curto((string)($req['unidade_destino_nome'] ?? ''), 120);
  if ($destino === '') {
    $destino = push_texto_curto((string)($req['unidade_destino_texto'] ?? ''), 120);
  }
  if ($destino === '') $destino = 'destino informado';

  $title = '🗒️ REQUISIÇÃO';
  $body = '';

  switch ($evento) {
    case 'CRIADA':
      $clickUrl = trim((string)($GLOBALS['onesignal_url_requisicoes'] ?? ''));
      $rota = '/requisicoes';
      $body = 'NOVA REQUISIÇÃO - ' . $solicitante . ' abriu uma nova requisição de materiais para ' . $destino . '.';
      break;

    case 'INICIOU_SEPARACAO':
      $clickUrl = trim((string)($GLOBALS['onesignal_url_minhas_solicitacoes'] ?? ''));
      $rota = '/minhas-solicitacoes';
      $body = 'SEPARAÇÃO - ' . $atorNome . ' iniciou a separação dos itens de ' . $solicitante . '.';
      break;

    case 'ENVIOU_MATERIAL':
      $clickUrl = trim((string)($GLOBALS['onesignal_url_minhas_solicitacoes'] ?? ''));
      $rota = '/minhas-solicitacoes';
      $body = 'ENVIO - ' . $atorNome . ' enviou os itens solicitados por ' . $solicitante . '.';
      break;

    case 'CONFIRMOU_RECEBIMENTO':
      $clickUrl = trim((string)($GLOBALS['onesignal_url_requisicoes'] ?? ''));
      $rota = '/requisicoes';
      $body = 'RECEBIMENTO - ' . $atorNome . ' confirmou o recebimento da solicitação.';
      break;

    default:
      return;
  }

  $fields = [
    'app_id' => $appId,
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
      'tipo' => 'requisicao_material',
      'evento' => $evento,
      'rota' => $rota,
      'requisicao_id' => (int)($req['id'] ?? 0),
      'status' => (string)($req['status'] ?? ''),
    ],
  ];

  if ($clickUrl !== '') {
    $fields['url'] = $clickUrl;
  }

  try {
    if (!function_exists('curl_init')) {
      throw new RuntimeException('Extensão cURL não disponível.');
    }

    $ch = curl_init('https://onesignal.com/api/v1/notifications');
    if ($ch === false) {
      throw new RuntimeException('Não foi possível iniciar cURL.');
    }

    curl_setopt_array($ch, [
      CURLOPT_HTTPHEADER => [
        'Content-Type: application/json; charset=utf-8',
        'Authorization: Basic ' . $apiKey,
      ],
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_POST => true,
      CURLOPT_POSTFIELDS => json_encode(
        $fields,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
      ),
      CURLOPT_NOSIGNAL => true,
      CURLOPT_CONNECTTIMEOUT_MS => 2500,
      CURLOPT_TIMEOUT_MS => 8000,
    ]);

    $resp = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    $ok = ($resp !== false && $httpCode >= 200 && $httpCode < 300);

    if (!$ok) {
      error_log(
        '[requisicoes.php][OneSignal] Falha no push. Evento=' . $evento .
        ' requisicao_id=' . (int)($req['id'] ?? 0) .
        ' HTTP=' . $httpCode .
        ($curlError !== '' ? ' CURL=' . $curlError : '') .
        ' RESP=' . push_texto_curto((string)$resp, 500)
      );
    }

    @file_put_contents(
      __DIR__ . '/onesignal_requisicoes.log',
      date('Y-m-d H:i:s') .
      ' | EVENTO=' . $evento .
      ' | REQUISICAO_ID=' . (int)($req['id'] ?? 0) .
      ' | HTTP=' . $httpCode .
      ($curlError !== '' ? ' | CURL=' . $curlError : '') .
      PHP_EOL .
      push_texto_curto((string)$resp, 1000) .
      PHP_EOL . PHP_EOL,
      FILE_APPEND
    );
  } catch (Throwable $e) {
    // Push nunca deve desfazer nem impedir a operação principal.
    error_log(
      '[requisicoes.php][OneSignal] ' . $e->getMessage() .
      ' | evento=' . $evento .
      ' | requisicao_id=' . (int)($req['id'] ?? 0)
    );
  }
}

function notificar_requisicao_por_id(
  string $evento,
  int $requisicaoId,
  int $atorUsuarioId
): void {
  try {
    $req = carregar_requisicao_detalhe($requisicaoId);
    if (!$req) return;

    $ator = current_user_row($atorUsuarioId);
    enviar_push_requisicao($evento, $req, $ator);
  } catch (Throwable $e) {
    // A notificação é acessória. A requisição já pode ter sido confirmada no banco.
    error_log(
      '[requisicoes.php][OneSignal] Erro ao preparar push: ' .
      $e->getMessage() .
      ' | evento=' . $evento .
      ' | requisicao_id=' . $requisicaoId
    );
  }
}

function montar_where_requisicoes(array &$params): string {
  $where = ' WHERE 1=1 ';

  $statusRaw = trim((string)($_GET['status'] ?? ''));
  if ($statusRaw !== '') {
    $parts = preg_split('/[,|]/', $statusRaw) ?: [];
    $statuses = [];
    foreach ($parts as $p) {
      $s = clean_status((string)$p);
      if ($s !== '' && in_array($s, valid_statuses(), true)) $statuses[] = $s;
    }
    $statuses = array_values(array_unique($statuses));

    if ($statuses) {
      $phs = [];
      foreach ($statuses as $i => $s) {
        $ph = ':status' . $i;
        $phs[] = $ph;
        $params[$ph] = $s;
      }
      $where .= ' AND r.status IN (' . implode(',', $phs) . ') ';
    }
  }

  $de = date_or_null($_GET['de'] ?? $_GET['data_ini'] ?? $_GET['inicio'] ?? null);
  $ate = date_or_null($_GET['ate'] ?? $_GET['data_fim'] ?? $_GET['fim'] ?? null);

  if ($de) {
    $where .= ' AND r.criado_em >= :de ';
    $params[':de'] = $de . ' 00:00:00';
  }

  if ($ate) {
    $where .= ' AND r.criado_em <= :ate ';
    $params[':ate'] = $ate . ' 23:59:59';
  }

  $solicitanteId = (int)($_GET['solicitante_id'] ?? 0);
  if ($solicitanteId > 0) {
    $where .= ' AND r.solicitante_usuario_id = :solicitante_id ';
    $params[':solicitante_id'] = $solicitanteId;
  }

  $destinoId = (int)($_GET['unidade_destino_id'] ?? $_GET['destino_id'] ?? 0);
  if ($destinoId > 0) {
    $where .= ' AND r.unidade_destino_id = :destino_id ';
    $params[':destino_id'] = $destinoId;
  }

  $origemId = (int)($_GET['deposito_origem_id'] ?? 0);
  if ($origemId > 0) {
    $where .= ' AND r.deposito_origem_id = :origem_id ';
    $params[':origem_id'] = $origemId;
  }

  $atendimento = trim((string)($_GET['id_atendimento'] ?? ''));
  if ($atendimento !== '') {
    $where .= ' AND r.id_atendimento LIKE :id_atendimento ';
    $params[':id_atendimento'] = '%' . $atendimento . '%';
  }

  $produtoId = (int)($_GET['produto_id'] ?? 0);
  if ($produtoId > 0) {
    $where .= ' AND EXISTS (
      SELECT 1 FROM est_requisicao_item ip
      WHERE ip.requisicao_id = r.id
        AND ip.produto_id = :produto_id
    ) ';
    $params[':produto_id'] = $produtoId;
  }

  $q = trim((string)($_GET['q'] ?? ''));
  if ($q !== '') {
    $where .= " AND (
      r.codigo LIKE :q
      OR r.id_atendimento LIKE :q
      OR r.unidade_destino_texto LIKE :q
      OR r.justificativa LIKE :q
      OR sol.nome LIKE :q
      OR EXISTS (
        SELECT 1 FROM est_requisicao_item iq
        WHERE iq.requisicao_id = r.id
          AND (
            iq.produto_nome_snapshot LIKE :q
            OR iq.codigo_barras_snapshot LIKE :q
          )
      )
    ) ";
    $params[':q'] = '%' . $q . '%';
  }

  if (bool_param($_GET['atrasadas'] ?? false)) {
    $where .= " AND r.status = 'EM_TRANSITO' AND r.enviado_em IS NOT NULL AND r.enviado_em <= (NOW() - INTERVAL 24 HOUR) ";
  }

  return $where;
}

function listar_requisicoes(array $extraParams = []): array {
  $params = [];
  $where = montar_where_requisicoes($params);

  if (!empty($extraParams['minhas_usuario_id'])) {
    $mu = (int)$extraParams['minhas_usuario_id'];
    if (!empty($extraParams['incluir_automaticas']) && req_reposicao_pronta()) {
      // Requisição de Material: as minhas + as automáticas abertas que eu posso receber.
      $where .= " AND (r.solicitante_usuario_id = :minhas_usuario_id
                    OR (r.automatica = 1
                        AND r.status IN ('PENDENTE','EM_SEPARACAO','EM_TRANSITO')
                        AND EXISTS (SELECT 1 FROM est_reposicao_local rl
                                     WHERE rl.deposito_id = r.unidade_destino_id AND rl.ativo = 1
                                       AND (rl.recebedor_usuario_id IS NULL OR rl.recebedor_usuario_id = :minhas_usuario_id2)))) ";
      $params[':minhas_usuario_id2'] = $mu;
    } else {
      $where .= ' AND r.solicitante_usuario_id = :minhas_usuario_id ';
    }
    $params[':minhas_usuario_id'] = $mu;
  }

  [$limit, $offset] = limit_offset();

  $sql = "
    SELECT
      r.*,
      sol.nome AS solicitante_nome,
      dd.nome AS unidade_destino_nome,
      do.nome AS deposito_origem_nome,
      COUNT(i.id) AS total_itens,
      COALESCE(SUM(i.quantidade_solicitada), 0) AS total_quantidade,
      GROUP_CONCAT(CONCAT(i.produto_nome_snapshot, ' x ', TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM i.quantidade_solicitada))) ORDER BY i.id SEPARATOR ' | ') AS itens_resumo,
      CASE
        WHEN r.status = 'EM_TRANSITO' AND r.enviado_em IS NOT NULL AND r.enviado_em <= (NOW() - INTERVAL 24 HOUR)
        THEN 1 ELSE 0
      END AS atrasada_24h
    FROM est_requisicao r
    LEFT JOIN usuarios sol ON sol.id = r.solicitante_usuario_id
    LEFT JOIN est_deposito dd ON dd.id = r.unidade_destino_id
    LEFT JOIN est_deposito do ON do.id = r.deposito_origem_id
    LEFT JOIN est_requisicao_item i ON i.requisicao_id = r.id
    {$where}
    GROUP BY r.id
    ORDER BY r.criado_em DESC, r.id DESC
    LIMIT :limit OFFSET :offset
  ";

  $st = db()->prepare($sql);
  foreach ($params as $k => $v) {
    if (is_int($v)) $st->bindValue($k, $v, PDO::PARAM_INT);
    else $st->bindValue($k, $v);
  }
  $st->bindValue(':limit', $limit, PDO::PARAM_INT);
  $st->bindValue(':offset', $offset, PDO::PARAM_INT);
  $st->execute();

  $rows = $st->fetchAll();
  foreach ($rows as &$r) {
    $r['status_label'] = status_label((string)$r['status']);
  }
  unset($r);

  return $rows;
}

function dashboard_contadores(): array {
  $params = [];
  $where = montar_where_requisicoes($params);

  $rows = fetchAll(
    "SELECT r.status, COUNT(*) AS total
       FROM est_requisicao r
       LEFT JOIN usuarios sol ON sol.id = r.solicitante_usuario_id
       {$where}
      GROUP BY r.status",
    $params
  );

  $out = [];
  foreach (valid_statuses() as $s) {
    $out[$s] = 0;
  }

  foreach ($rows as $r) {
    $out[(string)$r['status']] = (int)$r['total'];
  }

  $atrasadas = fetchOne(
    "SELECT COUNT(*) AS total
       FROM est_requisicao r
       LEFT JOIN usuarios sol ON sol.id = r.solicitante_usuario_id
       {$where}
       AND r.status = 'EM_TRANSITO'
       AND r.enviado_em IS NOT NULL
       AND r.enviado_em <= (NOW() - INTERVAL 24 HOUR)",
    $params
  );

  return [
    'por_status' => $out,
    'atrasadas_24h' => (int)($atrasadas['total'] ?? 0),
    'status_labels' => array_map(fn($s) => status_label($s), array_combine(valid_statuses(), valid_statuses())),
  ];
}

function saldo_minimo_alertas(int $limit = 200): array {
  $limit = max(1, min(500, $limit));

  $sql = "
    SELECT
      s.produto_id,
      s.deposito_id,
      s.quantidade,
      s.minimo,
      s.maximo,
      p.nome AS produto_nome,
      p.codigo_barras,
      d.nome AS deposito_nome
    FROM est_saldo s
    INNER JOIN est_produto p ON p.id = s.produto_id
    INNER JOIN est_deposito d ON d.id = s.deposito_id
    WHERE p.ativo = 1
      AND s.minimo > 0
      AND s.quantidade <= s.minimo
    ORDER BY s.quantidade ASC, p.nome ASC
    LIMIT {$limit}
  ";

  return fetchAll($sql);
}

function registrar_movimento(string $tipo, int $produtoId, ?string $codigoBarras, string $quantidade, ?int $origemId, ?int $destinoId, ?string $destinoTexto, ?int $solicitanteId, int $operadorId, ?string $obs): int {
  execSql(
    'INSERT INTO est_movimento
      (tipo, produto_id, codigo_barras_snapshot, quantidade,
       deposito_origem_id, deposito_destino_id, destino_texto,
       solicitante_usuario_id, operador_usuario_id, observacao, criado_em)
     VALUES
      (:tipo, :pid, :cb, :q,
       :orig, :dst, :destino_texto,
       :sol, :op, :obs, NOW())',
    [
      ':tipo'         => $tipo,
      ':pid'          => $produtoId,
      ':cb'           => $codigoBarras,
      ':q'            => $quantidade,
      ':orig'         => $origemId,
      ':dst'          => $destinoId,
      ':destino_texto'=> $destinoTexto,
      ':sol'          => $solicitanteId,
      ':op'           => $operadorId,
      ':obs'          => $obs,
    ]
  );

  return lastInsertId();
}

function saldo_row_for_update(int $produtoId, int $depositoId): ?array {
  return fetchOne(
    'SELECT id, produto_id, deposito_id, quantidade, minimo, maximo
       FROM est_saldo
      WHERE produto_id = :p AND deposito_id = :d
      LIMIT 1
      FOR UPDATE',
    [':p' => $produtoId, ':d' => $depositoId]
  );
}


/**
 * Valida se um depósito possui saldo suficiente para atender toda a requisição.
 *
 * Quantidades do mesmo produto são somadas antes da comparação. Quando
 * $forUpdate for true, os itens e os saldos consultados são bloqueados durante
 * a transação para que a validação seja consistente naquele instante.
 */
function validar_saldo_requisicao_no_deposito(int $requisicaoId, int $depositoId, bool $forUpdate = false): array {
  $sqlItens = 'SELECT id, produto_id, produto_nome_snapshot, quantidade_solicitada
                 FROM est_requisicao_item
                WHERE requisicao_id = :id
                ORDER BY id ASC';
  if ($forUpdate) $sqlItens .= ' FOR UPDATE';

  $items = fetchAll($sqlItens, [':id' => $requisicaoId]);
  if (!$items) {
    return ['ok' => false, 'msg' => 'Requisição sem itens.'];
  }

  $necessarioPorProduto = [];
  $nomePorProduto = [];

  foreach ($items as $item) {
    $produtoId = (int)($item['produto_id'] ?? 0);
    $qtd = (float)parse_decimal_any($item['quantidade_solicitada'] ?? 0);
    $nome = trim((string)($item['produto_nome_snapshot'] ?? ''));
    if ($nome === '') $nome = 'Produto #' . $produtoId;

    if ($produtoId <= 0 || $qtd <= 0) {
      return ['ok' => false, 'msg' => 'Quantidade inválida para ' . $nome . '.'];
    }

    $necessarioPorProduto[$produtoId] = ($necessarioPorProduto[$produtoId] ?? 0.0) + $qtd;
    $nomePorProduto[$produtoId] = $nome;
  }

  foreach ($necessarioPorProduto as $produtoId => $necessario) {
    if ($forUpdate) {
      $saldo = saldo_row_for_update((int)$produtoId, $depositoId);
    } else {
      $saldo = fetchOne(
        'SELECT id, produto_id, deposito_id, quantidade, minimo, maximo
           FROM est_saldo
          WHERE produto_id = :p AND deposito_id = :d
          LIMIT 1',
        [':p' => (int)$produtoId, ':d' => $depositoId]
      );
    }

    $disponivel = $saldo ? (float)$saldo['quantidade'] : 0.0;
    if ((float)$necessario - 0.0001 > $disponivel) {
      return [
        'ok' => false,
        'msg' => 'Saldo insuficiente para ' . ($nomePorProduto[$produtoId] ?? ('Produto #' . $produtoId)) . '.',
        'produto_id' => (int)$produtoId,
        'deposito_id' => $depositoId,
        'saldo_atual' => $disponivel,
        'quantidade_solicitada' => (float)$necessario,
      ];
    }
  }

  return ['ok' => true, 'msg' => 'Saldo suficiente.'];
}

function saldo_debitar(int $produtoId, int $depositoId, string $quantidade): void {
  $s = saldo_row_for_update($produtoId, $depositoId);
  $atual = $s ? (float)$s['quantidade'] : 0.0;
  $qtd = (float)$quantidade;

  if (!$s || $atual + 0.0001 < $qtd) {
    json_response([
      'ok' => false,
      'msg' => 'Saldo insuficiente para processar a requisição.',
      'produto_id' => $produtoId,
      'deposito_id' => $depositoId,
      'saldo_atual' => $atual,
      'quantidade_solicitada' => $qtd,
    ], 400);
  }

  execSql(
    'UPDATE est_saldo
        SET quantidade = quantidade - :q,
            atualizado_em = NOW()
      WHERE id = :id',
    [':q' => $quantidade, ':id' => (int)$s['id']]
  );
}

function saldo_creditar(int $produtoId, int $depositoId, string $quantidade): void {
  $s = saldo_row_for_update($produtoId, $depositoId);

  if ($s) {
    execSql(
      'UPDATE est_saldo
          SET quantidade = quantidade + :q,
              atualizado_em = NOW()
        WHERE id = :id',
      [':q' => $quantidade, ':id' => (int)$s['id']]
    );
    return;
  }

  $p = carregar_produto($produtoId, false);
  $minPad = (int)($p['minimo'] ?? 0);
  $maxPad = (int)($p['maximo'] ?? 0);

  execSql(
    'INSERT INTO est_saldo
      (produto_id, deposito_id, quantidade, minimo, maximo, atualizado_em)
     VALUES
      (:p, :d, :q, :min, :max, NOW())',
    [
      ':p'   => $produtoId,
      ':d'   => $depositoId,
      ':q'   => $quantidade,
      ':min' => $minPad,
      ':max' => $maxPad,
    ]
  );
}

/* =========================
   DEBUG DE SESSÃO
========================= */

// 23/10/2026 (segurança): removido o ?debug_session (devolvia o id da sessão e os cookies).

$uid = require_login();
if (strpos($action, 'dashboard_') === 0 && !req_pode_painel($uid)) { // 18/11/2026: Painel de Requisições pela chave da tela
  json_response(['ok' => false, 'sem_acesso' => 1, 'msg' => 'Você não tem acesso ao Painel de Requisições.'], 403);
}
ensure_requisicoes_schema();

/* =========================
   GET ROUTES
========================= */

if ($method === 'GET') {

  if ($action === 'setup' || $action === 'migrar') {
    ensure_requisicoes_schema();
    json_response(['ok' => true, 'msg' => 'Estrutura de requisições pronta.']);
  }

  if ($action === 'init') {
    $me = current_user_row($uid);

    $usuarios = fetchAll('SELECT id, nome, usuario FROM usuarios ORDER BY nome');
    $depositos = fetchAll('SELECT id, nome FROM est_deposito ORDER BY nome');

    $produtos = fetchAll(
      'SELECT
          p.id,
          p.nome,
          p.descricao,
          p.codigo_barras,
          p.valor,
          p.preco_custo,
          p.minimo,
          p.maximo,
          p.foto_url,
          p.ativo,
          p.atualizado_em,
          p.categoria_id,
          c.nome AS categoria_nome,
          p.fabricante_id,
          f.nome AS fabricante_nome,
          p.classificacao_id,
          cl.nome AS classificacao_nome,
          CASE
            WHEN UPPER(CONCAT_WS(" ", p.nome, COALESCE(c.nome,""), COALESCE(cl.nome,""))) LIKE "%URNA%"
              OR UPPER(CONCAT_WS(" ", p.nome, COALESCE(c.nome,""), COALESCE(cl.nome,""))) LIKE "%ROUPA%"
              OR UPPER(CONCAT_WS(" ", p.nome, COALESCE(c.nome,""), COALESCE(cl.nome,""))) LIKE "%FLUID%"
              OR UPPER(CONCAT_WS(" ", p.nome, COALESCE(c.nome,""), COALESCE(cl.nome,""))) LIKE "%TANATO%"
            THEN 1 ELSE 0
          END AS exige_atendimento
       FROM est_produto p
       LEFT JOIN est_categoria c ON c.id = p.categoria_id
       LEFT JOIN est_fabricante f ON f.id = p.fabricante_id
       LEFT JOIN est_classificacao cl ON cl.id = p.classificacao_id
       WHERE p.ativo = 1
       ORDER BY p.nome ASC'
    );

    $saldos = fetchAll('SELECT id, produto_id, deposito_id, quantidade, minimo, maximo, atualizado_em FROM est_saldo');

    json_response([
      'ok' => true,
      'me' => $me,
      'usuarios' => $usuarios,
      'depositos' => $depositos,
      'produtos' => $produtos,
      'saldos' => $saldos,
      'status' => array_map(fn($s) => ['id' => $s, 'nome' => status_label($s)], valid_statuses()),
      'contadores' => dashboard_contadores(),
      'alertas' => [
        'transito_24h' => listar_requisicoes(['alertas' => true]),
        'estoque_minimo' => saldo_minimo_alertas(50),
      ],
    ]);
  }

  if ($action === 'listar' || $action === 'fila' || $action === 'dashboard_listar') {
    $extra = [];
    if (bool_param($_GET['minhas'] ?? false)) {
      $extra['minhas_usuario_id'] = $uid;
    }
    json_response(['ok' => true, 'rows' => listar_requisicoes($extra)]);
  }

  if ($action === 'minhas') {
    json_response(['ok' => true, 'rows' => listar_requisicoes([
      'minhas_usuario_id' => $uid,
      'incluir_automaticas' => bool_param($_GET['incluir_automaticas'] ?? false),
    ])]);
  }

  if ($action === 'detalhar' || $action === 'detalhar_minha') {
    $id = (int)($_GET['id'] ?? $_GET['requisicao_id'] ?? 0);
    if ($id <= 0) json_response(['ok' => false, 'msg' => 'ID inválido.'], 400);

    $req = carregar_requisicao_detalhe($id);
    if (!$req) json_response(['ok' => false, 'msg' => 'Requisição não encontrada.'], 404);

    if ($action === 'detalhar_minha' && !req_usuario_recebe($req, $uid)) {
      json_response([
        'ok' => false,
        'msg' => 'Você só pode consultar os detalhes das suas próprias requisições.',
      ], 403);
    }

    json_response(['ok' => true, 'row' => $req]);
  }

  if ($action === 'contadores' || $action === 'dashboard_resumo') {
    json_response(['ok' => true, 'data' => dashboard_contadores()]);
  }

  if ($action === 'alertas' || $action === 'dashboard_alertas') {
    $_GET['status'] = 'EM_TRANSITO';
    $_GET['atrasadas'] = '1';

    json_response([
      'ok' => true,
      'transito_24h' => listar_requisicoes(),
      'estoque_minimo' => saldo_minimo_alertas(),
    ]);
  }

  if ($action === 'export_csv' || $action === 'dashboard_export_csv') {
    $rows = listar_requisicoes();

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="requisicoes_materiais_' . date('Ymd_His') . '.csv"');

    echo "\xEF\xBB\xBF";

    $sep = ';';
    $header = [
      'ID',
      'Código',
      'Status',
      'Solicitante',
      'Destino',
      'Tipo de destino',
      'ID Atendimento',
      'Justificativa',
      'Depósito origem',
      'Criado em',
      'Separado em',
      'Enviado em',
      'Recebido em',
      'Atrasada 24h',
      'Itens',
    ];
    echo implode($sep, array_map('csv_cell', $header)) . "\r\n";

    foreach ($rows as $r) {
      $line = [
        $r['id'] ?? '',
        $r['codigo'] ?? '',
        status_label((string)($r['status'] ?? '')),
        $r['solicitante_nome'] ?? '',
        $r['unidade_destino_nome'] ?: ($r['unidade_destino_texto'] ?? ''),
        $r['destino_tipo'] ?? '',
        $r['id_atendimento'] ?? '',
        $r['justificativa'] ?? '',
        $r['deposito_origem_nome'] ?? '',
        $r['criado_em'] ?? '',
        $r['separado_em'] ?? '',
        $r['enviado_em'] ?? '',
        $r['recebido_em'] ?? '',
        ((int)($r['atrasada_24h'] ?? 0) === 1 ? 'Sim' : 'Não'),
        $r['itens_resumo'] ?? '',
      ];
      echo implode($sep, array_map('csv_cell', $line)) . "\r\n";
    }
    exit;
  }

  json_response(['ok' => false, 'msg' => 'Ação GET inválida.'], 400);
}

/* =========================
   POST ROUTES
========================= */

if ($method !== 'POST') {
  json_response(['ok' => false, 'msg' => 'Método inválido.'], 405);
}


/** Resolve origem individual e mantém compatibilidade com clientes antigos. */
function origens_por_item_recebidas(array $body, array $items): array {
  $geral = (int)($body['deposito_origem_id'] ?? 0);
  $informadas = [];
  foreach (($body['itens'] ?? []) as $linha) {
    if (!is_array($linha)) continue;
    $itemId = (int)($linha['id'] ?? $linha['item_id'] ?? 0);
    if ($itemId > 0) $informadas[$itemId] = (int)($linha['deposito_origem_id'] ?? 0);
  }
  $origens = [];
  foreach ($items as $item) {
    $itemId = (int)$item['id'];
    $origens[$itemId] = $informadas[$itemId] ?? ((int)($item['deposito_origem_id'] ?? 0) ?: $geral);
  }
  return $origens;
}

/** Verifica todas as origens e agrega itens repetidos por produto + depósito. */
function validar_origens_por_item(array $req, array $items, array $origens, bool $forUpdate = false): array {
  $destino = (string)($req['destino_tipo'] ?? '') === 'DEPOSITO' ? (int)($req['unidade_destino_id'] ?? 0) : 0;
  if ((string)($req['destino_tipo'] ?? '') === 'DEPOSITO' && $destino <= 0) {
    return ['ok' => false, 'msg' => 'Depósito de destino inválido.'];
  }
  $totais = [];
  foreach ($items as $item) {
    $itemId = (int)$item['id'];
    $dep = (int)($origens[$itemId] ?? 0);
    $qtd = (float)$item['quantidade_solicitada'];
    if ($dep <= 0) return ['ok' => false, 'msg' => 'Selecione o depósito de todos os itens.'];
    if ($destino > 0 && $dep === $destino) return ['ok' => false, 'msg' => 'A origem não pode ser o depósito de destino.'];
    if ($qtd <= 0) return ['ok' => false, 'msg' => 'Quantidade solicitada inválida.'];
    $produto = (int)$item['produto_id'];
    $key = $produto . ':' . $dep;
    if (!isset($totais[$key])) $totais[$key] = ['produto' => $produto, 'dep' => $dep, 'qtd' => 0.0, 'nome' => (string)$item['produto_nome_snapshot']];
    $totais[$key]['qtd'] += $qtd;
  }
  $depositos = array_unique(array_column($totais, 'dep'));
  foreach ($depositos as $dep) {
    if (!fetchOne('SELECT id FROM est_deposito WHERE id = :id', [':id' => $dep])) {
      return ['ok' => false, 'msg' => 'Depósito de origem inexistente.'];
    }
  }
  // Ordem estável reduz risco de deadlock entre requisições concorrentes.
  ksort($totais, SORT_STRING);
  foreach ($totais as $t) {
    $saldo = $forUpdate ? saldo_row_for_update($t['produto'], $t['dep']) : fetchOne('SELECT quantidade FROM est_saldo WHERE produto_id = :p AND deposito_id = :d', [':p' => $t['produto'], ':d' => $t['dep']]);
    if ((float)($saldo['quantidade'] ?? 0) + 0.0001 < $t['qtd']) {
      return ['ok' => false, 'msg' => 'Saldo insuficiente para ' . $t['nome'] . ' no depósito selecionado.'];
    }
  }
  return ['ok' => true];
}

switch ($action) {

  case 'setup':
  case 'migrar': {
    ensure_requisicoes_schema();
    json_response(['ok' => true, 'msg' => 'Estrutura de requisições pronta.']);
  }

  case 'criar':
  case 'requisicao_criar': {
    $destinoTipo = norm_text((string)($body['destino_tipo'] ?? 'CONSUMO'));
    $destinoTipo = $destinoTipo === 'DEPOSITO' ? 'DEPOSITO' : 'CONSUMO';

    $unidadeDestinoId = (int)($body['unidade_destino_id'] ?? $body['destino_id'] ?? 0);
    $unidadeDestinoTexto = trim((string)($body['unidade_destino_texto'] ?? $body['destino_texto'] ?? ''));
    $idAtendimento = trim((string)($body['id_atendimento'] ?? ''));

    // Justificativa removida do fluxo de solicitação.
    // A coluna permanece no banco apenas por compatibilidade com registros antigos.
    $justificativa = '';

    if ($destinoTipo === 'DEPOSITO' && $unidadeDestinoId <= 0) {
      json_response(['ok' => false, 'msg' => 'Informe a unidade de destino.'], 400);
    }

    if ($destinoTipo === 'CONSUMO' && $unidadeDestinoTexto === '' && $unidadeDestinoId <= 0) {
      json_response(['ok' => false, 'msg' => 'Informe o destino/setor solicitante.'], 400);
    }

    $itensRaw = $body['itens'] ?? null;
    if (!is_array($itensRaw) || count($itensRaw) === 0) {
      $produtoId = (int)($body['produto_id'] ?? 0);
      $quantidade = parse_decimal_any($body['quantidade'] ?? 0);
      $itensRaw = [[
        'produto_id' => $produtoId,
        'quantidade' => $quantidade,
        'observacao' => trim((string)($body['item_observacao'] ?? '')),
      ]];
    }

    $itens = [];

    /*
     * A classificação do primeiro produto define o grupo operacional
     * da requisição. Os demais produtos precisam pertencer ao MESMO
     * grupo. Assim a API aplica a mesma regra da tela manual e impede
     * que um cliente alternativo (incluindo a Aurora) misture, por
     * exemplo, CAFÉ com URNA na mesma requisição.
     */
    $grupoRequisicao = null;
    $classificacaoRequisicao = null;
    $tipoRequisicao = null;
    $destinoTipoEsperado = null;

    // ID de Atendimento não é mais obrigatório neste fluxo.
    // O campo permanece no banco apenas para compatibilidade com registros antigos.
    $exigeAtendimento = false;

    foreach ($itensRaw as $idx => $item) {
      if (!is_array($item)) continue;

      $produtoId = (int)($item['produto_id'] ?? 0);
      $quantidade = parse_decimal_any($item['quantidade'] ?? $item['quantidade_solicitada'] ?? 0);
      $obsItem = trim((string)($item['observacao'] ?? ''));

      if ($produtoId <= 0 || !decimal_gt_zero($quantidade)) {
        json_response(['ok' => false, 'msg' => 'Produto e quantidade são obrigatórios em todos os itens.'], 400);
      }

      $produto = carregar_produto($produtoId, false);
      if (!$produto || (int)($produto['ativo'] ?? 0) !== 1) {
        json_response(['ok' => false, 'msg' => 'Produto inválido ou inativo.'], 400);
      }

      $regraClassificacao = regra_requisicao_por_classificacao($produto);

      $grupoProduto = (string)($regraClassificacao['grupo'] ?? '');
      $classificacaoProduto = (string)($regraClassificacao['classificacao'] ?? '');
      $tipoProduto = (string)($regraClassificacao['tipo_requisicao'] ?? '');
      $destinoProduto = $regraClassificacao['destino_tipo'] ?? null;

      if ($grupoRequisicao === null) {
        $grupoRequisicao = $grupoProduto;
        $classificacaoRequisicao = $classificacaoProduto;
        $tipoRequisicao = $tipoProduto;
        $destinoTipoEsperado = $destinoProduto;
      } elseif ($grupoProduto !== $grupoRequisicao) {
        json_response([
          'ok' => false,
          'code' => 'CLASSIFICACOES_INCOMPATIVEIS',
          'msg' => 'Produtos de classificações diferentes devem ser enviados em requisições separadas.',
          'grupo_requisicao' => $grupoRequisicao,
          'classificacao_requisicao' => $classificacaoRequisicao,
          'produto_incompativel' => [
            'produto_id' => $produtoId,
            'produto_nome' => (string)($produto['nome'] ?? ''),
            'classificacao' => $classificacaoProduto,
            'grupo' => $grupoProduto,
          ],
        ], 400);
      }

      /*
       * Para as classificações conhecidas, o tipo de destino não é
       * livre: ele é parte da regra de negócio.
       */
      if (
        is_string($destinoProduto)
        && $destinoProduto !== ''
        && $destinoTipo !== $destinoProduto
      ) {
        json_response([
          'ok' => false,
          'code' => 'DESTINO_TIPO_INCOMPATIVEL',
          'msg' =>
            'O tipo de destino não corresponde à classificação dos produtos desta requisição.',
          'classificacao' => $classificacaoProduto,
          'tipo_requisicao' => $tipoProduto,
          'destino_tipo_recebido' => $destinoTipo,
          'destino_tipo_esperado' => $destinoProduto,
        ], 400);
      }

      // Mantido sem bloqueio por ID de Atendimento.

      $itens[] = [
        'produto_id' => $produtoId,
        'quantidade' => $quantidade,
        'observacao' => $obsItem,
        'produto' => $produto,
        'classificacao' => $classificacaoProduto,
        'grupo_requisicao' => $grupoProduto,
      ];
    }

    if (!$itens) {
      json_response(['ok' => false, 'msg' => 'Inclua pelo menos um item.'], 400);
    }

    // ID de Atendimento e justificativa não são obrigatórios neste fluxo.

    $pdo = db();
    $pdo->beginTransaction();

    try {
      execSql(
        'INSERT INTO est_requisicao
          (codigo, status, solicitante_usuario_id, unidade_destino_id, unidade_destino_texto, destino_tipo,
           id_atendimento, justificativa, criado_em, atualizado_em)
         VALUES
          (NULL, "PENDENTE", :sol, :destino_id, :destino_texto, :destino_tipo,
           :id_atendimento, :justificativa, NOW(), NOW())',
        [
          ':sol' => $uid,
          ':destino_id' => $unidadeDestinoId > 0 ? $unidadeDestinoId : null,
          ':destino_texto' => $unidadeDestinoTexto !== '' ? $unidadeDestinoTexto : null,
          ':destino_tipo' => $destinoTipo,
          ':id_atendimento' => $idAtendimento !== '' ? $idAtendimento : null,
          ':justificativa' => $justificativa,
        ]
      );

      $rid = lastInsertId();
      $codigo = req_codigo($rid);

      execSql('UPDATE est_requisicao SET codigo = :codigo WHERE id = :id', [':codigo' => $codigo, ':id' => $rid]);

      foreach ($itens as $item) {
        $p = $item['produto'];
        execSql(
          'INSERT INTO est_requisicao_item
            (requisicao_id, produto_id, produto_nome_snapshot, codigo_barras_snapshot,
             quantidade_solicitada, observacao, criado_em, atualizado_em)
           VALUES
            (:rid, :pid, :nome, :cb,
             :qtd, :obs, NOW(), NOW())',
          [
            ':rid' => $rid,
            ':pid' => (int)$item['produto_id'],
            ':nome' => (string)$p['nome'],
            ':cb' => (string)($p['codigo_barras'] ?? ''),
            ':qtd' => (string)$item['quantidade'],
            ':obs' => $item['observacao'] !== '' ? $item['observacao'] : null,
          ]
        );
      }

      add_event($rid, $uid, 'CRIADA', null, 'PENDENTE', 'Requisição criada pelo solicitante.');

      $pdo->commit();

      // Push somente após o COMMIT, para nunca notificar uma operação revertida.
      notificar_requisicao_por_id('CRIADA', $rid, $uid);

      json_response([
        'ok' => true,
        'id' => $rid,
        'codigo' => $codigo,
        'msg' => 'Requisição criada.',
        'grupo_requisicao' => $grupoRequisicao,
        'classificacao_requisicao' => $classificacaoRequisicao,
        'tipo_requisicao' => $tipoRequisicao,
        'destino_tipo' => $destinoTipo,
        'row' => carregar_requisicao_detalhe($rid),
      ]);
    } catch (Throwable $e) {
      $pdo->rollBack();
      throw $e;
    }
  }

  case 'visualizar':
  case 'requisicao_visualizar': {
    $id = (int)($body['id'] ?? $body['requisicao_id'] ?? 0);
    if ($id <= 0) json_response(['ok' => false, 'msg' => 'ID inválido.'], 400);

    $req = carregar_requisicao_base($id, false);
    if (!$req) json_response(['ok' => false, 'msg' => 'Requisição não encontrada.'], 404);

    add_event($id, $uid, 'VISUALIZADA', (string)$req['status'], (string)$req['status'], 'Requisição visualizada.');
    json_response(['ok' => true, 'msg' => 'Visualização registrada.']);
  }

  case 'iniciar_separacao':
  case 'requisicao_iniciar_separacao': {
    $id = (int)($body['id'] ?? $body['requisicao_id'] ?? 0);
    $obs = trim((string)($body['observacao'] ?? ''));
    if ($id <= 0) json_response(['ok' => false, 'msg' => 'ID inválido.'], 400);
    $pdo = db();
    $pdo->beginTransaction();
    try {
      $req = carregar_requisicao_base($id, true);
      if (!$req || (string)$req['status'] !== 'PENDENTE') {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Requisição inexistente ou não pendente.'], 400);
      }
      $items = fetchAll('SELECT * FROM est_requisicao_item WHERE requisicao_id = :id ORDER BY id FOR UPDATE', [':id' => $id]);
      if (!$items) {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Requisição sem itens.'], 400);
      }
      $origens = origens_por_item_recebidas($body, $items);
      $validacao = validar_origens_por_item($req, $items, $origens, true);
      if (!$validacao['ok']) {
        $pdo->rollBack();
        json_response($validacao, 400);
      }
      foreach ($items as $item) {
        execSql('UPDATE est_requisicao_item SET deposito_origem_id = :dep WHERE id = :id', [':dep' => $origens[(int)$item['id']], ':id' => (int)$item['id']]);
      }
      $unicos = array_unique(array_values($origens));
      $origemGeral = count($unicos) === 1 ? (int)reset($unicos) : null;
      execSql('UPDATE est_requisicao SET status = "EM_SEPARACAO", deposito_origem_id = :dep, separado_por_usuario_id = :uid, separado_em = NOW(), atualizado_em = NOW() WHERE id = :id', [':dep' => $origemGeral, ':uid' => $uid, ':id' => $id]);
      add_event($id, $uid, 'INICIOU_SEPARACAO', 'PENDENTE', 'EM_SEPARACAO', trim('Origens definidas individualmente por item. ' . $obs));
      $pdo->commit();
      notificar_requisicao_por_id('INICIOU_SEPARACAO', $id, $uid);
      json_response(['ok' => true, 'msg' => 'Separação iniciada com depósito de origem por item.', 'row' => carregar_requisicao_detalhe($id)]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      throw $e;
    }
  }

  case 'enviar_material':
  case 'requisicao_enviar':
  case 'requisicao_enviar_material': {
    $id = (int)($body['id'] ?? $body['requisicao_id'] ?? 0);
    $obs = trim((string)($body['observacao'] ?? ''));
    if ($id <= 0) json_response(['ok' => false, 'msg' => 'ID inválido.'], 400);
    $pdo = db();
    $pdo->beginTransaction();
    try {
      $req = carregar_requisicao_base($id, true);
      if (!$req || !in_array((string)$req['status'], ['PENDENTE', 'EM_SEPARACAO'], true)) {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Esta requisição não pode ser enviada no status atual.'], 400);
      }
      $items = fetchAll('SELECT * FROM est_requisicao_item WHERE requisicao_id = :id ORDER BY id FOR UPDATE', [':id' => $id]);
      if (!$items) {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Requisição sem itens.'], 400);
      }
      $origens = origens_por_item_recebidas($body, $items);
      $statusAtual = (string)$req['status'];
      if ($statusAtual === 'EM_SEPARACAO') {
        foreach ($items as $item) {
          $gravada = (int)($item['deposito_origem_id'] ?? 0);
          if ($gravada > 0 && $origens[(int)$item['id']] !== $gravada) {
            $pdo->rollBack();
            json_response(['ok' => false, 'msg' => 'A origem de um item foi alterada após iniciar a separação.'], 400);
          }
        }
      }
      $validacao = validar_origens_por_item($req, $items, $origens, true);
      if (!$validacao['ok']) {
        $pdo->rollBack();
        json_response($validacao, 400);
      }
      $isTransferencia = (string)($req['destino_tipo'] ?? 'CONSUMO') === 'DEPOSITO';
      $unicos = array_unique(array_values($origens));
      $origemGeral = count($unicos) === 1 ? (int)reset($unicos) : null;
      foreach ($items as $item) {
        $itemId = (int)$item['id'];
        $depId = $origens[$itemId];
        // Mantém a regra existente de envio integral da quantidade solicitada.
        $qtdEnviar = parse_decimal_any($item['quantidade_solicitada']);
        saldo_debitar((int)$item['produto_id'], $depId, $qtdEnviar);
        $movSaidaId = null;
        if (!$isTransferencia) {
          $movSaidaId = registrar_movimento('SAIDA', (int)$item['produto_id'], (string)($item['codigo_barras_snapshot'] ?? ''), $qtdEnviar, $depId, null,
            (string)($req['codigo'] ?? req_codigo($id)) . ' - ' . ((string)($req['unidade_destino_texto'] ?? '') ?: 'Requisição digital'),
            (int)$req['solicitante_usuario_id'], $uid, trim('Saída por requisição digital. ' . $obs));
        }
        execSql('UPDATE est_requisicao_item SET deposito_origem_id = :dep, quantidade_enviada = :q, movimento_saida_id = :mov, atualizado_em = NOW() WHERE id = :id',
          [':dep' => $depId, ':q' => $qtdEnviar, ':mov' => $movSaidaId, ':id' => $itemId]);
      }
      execSql('UPDATE est_requisicao SET status = "EM_TRANSITO", separado_por_usuario_id = COALESCE(separado_por_usuario_id, :sep), separado_em = COALESCE(separado_em, NOW()), enviado_por_usuario_id = :env, enviado_em = NOW(), deposito_origem_id = :dep, atualizado_em = NOW() WHERE id = :id',
        [':sep' => $uid, ':env' => $uid, ':dep' => $origemGeral, ':id' => $id]);
      add_event($id, $uid, 'ENVIOU_MATERIAL', $statusAtual, 'EM_TRANSITO', trim('Envio com origem por item. ' . $obs));
      $pdo->commit();
      notificar_requisicao_por_id('ENVIOU_MATERIAL', $id, $uid);
      json_response(['ok' => true, 'msg' => 'Material enviado. Requisição em trânsito.', 'row' => carregar_requisicao_detalhe($id)]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      throw $e;
    }
  }

  case 'confirmar_recebimento':
  case 'requisicao_confirmar_recebimento': {
    $id = (int)($body['id'] ?? $body['requisicao_id'] ?? 0);
    $obs = trim((string)($body['observacao'] ?? ''));

    if ($id <= 0) json_response(['ok' => false, 'msg' => 'ID inválido.'], 400);

    // Contagem às cegas (13/10/2026): itens = [{id, quantidade_recebida?, estoque_atualizado}]
    $informados = [];
    foreach (($body['itens'] ?? []) as $linha) {
      if (!is_array($linha)) continue;
      $iid = (int)($linha['id'] ?? $linha['item_id'] ?? 0);
      if ($iid > 0) $informados[$iid] = $linha;
    }

    $contagemAtiva = req_reposicao_pronta();
    $pdo = db();
    $pdo->beginTransaction();

    try {
      $req = carregar_requisicao_base($id, true);
      if (!$req) {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Requisição não encontrada.'], 404);
      }

      if (!req_usuario_recebe($req, $uid)) {
        $pdo->rollBack();
        $automatica = $contagemAtiva && (int)($req['automatica'] ?? 0) === 1;
        json_response([
          'ok' => false,
          'msg' => $automatica
            ? 'Esta reposição automática é recebida pelo responsável do local.'
            : 'Somente o solicitante da requisição pode confirmar o recebimento.',
        ], 403);
      }

      if ((string)$req['status'] !== 'EM_TRANSITO') {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Apenas requisições em trânsito podem ser recebidas.'], 400);
      }

      $destinoTipo = (string)($req['destino_tipo'] ?? 'CONSUMO');
      $destinoDepositoId = (int)($req['unidade_destino_id'] ?? 0);
      $depositoOrigemId = (int)($req['deposito_origem_id'] ?? 0);

      if ($destinoTipo === 'DEPOSITO' && $destinoDepositoId <= 0) {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Informe o depósito de destino para concluir a transferência.'], 400);
      }

      // Transferência para um local: pede a contagem às cegas. Consumo não tem saldo no destino.
      $exigeContagem = $contagemAtiva && $destinoTipo === 'DEPOSITO';
      // Locais sem controle de estoque no destino (ex.: Serviço Funerário, se for cadastrado como depósito):
      // est_reposicao_config.depositos_sem_contagem = "id1,id2".
      if ($exigeContagem) {
        $semContagem = array_filter(array_map('intval', explode(',', (string)(rep_config($pdo, 'depositos_sem_contagem') ?? ''))));
        if (in_array($destinoDepositoId, $semContagem, true)) $exigeContagem = false;
      }

      $items = fetchAll(
        'SELECT * FROM est_requisicao_item WHERE requisicao_id = :id ORDER BY id ASC FOR UPDATE',
        [':id' => $id]
      );

      if (!$items) {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Requisição sem itens.'], 400);
      }

      // 1) Valida tudo antes de mexer no saldo.
      $linhas = [];
      foreach ($items as $item) {
        $itemId = (int)$item['id'];
        $origemItem = (int)($item['deposito_origem_id'] ?? 0) ?: $depositoOrigemId;
        if ($destinoTipo === 'DEPOSITO' && ($origemItem <= 0 || $origemItem === $destinoDepositoId)) {
          $pdo->rollBack();
          json_response(['ok' => false, 'msg' => 'Origem inválida em item da transferência.'], 400);
        }
        $qtdEnviada = parse_decimal_any($item['quantidade_enviada'] ?? 0);
        if (!decimal_gt_zero($qtdEnviada)) {
          $pdo->rollBack();
          json_response(['ok' => false, 'msg' => 'Item sem quantidade enviada.'], 400);
        }

        $qtdRecebida = $qtdEnviada;
        $contada = null;

        if ($exigeContagem) {
          $inf = $informados[$itemId] ?? null;
          $nomeItem = (string)($item['produto_nome_snapshot'] ?? 'item');
          if (!$inf || !isset($inf['estoque_atualizado']) || trim((string)$inf['estoque_atualizado']) === '') {
            $pdo->rollBack();
            json_response([
              'ok' => false,
              'code' => 'CONTAGEM_OBRIGATORIA',
              'msg' => 'Informe o estoque atualizado de todos os itens (falta: ' . $nomeItem . '). Se o app não mostrar esse campo, atualize a página.',
            ], 400);
          }
          $contadaTxt = trim((string)$inf['estoque_atualizado']);
          if (!preg_match('/^\d+([.,]\d+)?$/', $contadaTxt)) {
            $pdo->rollBack();
            json_response(['ok' => false, 'msg' => 'Estoque atualizado inválido em ' . $nomeItem . '.'], 400);
          }
          $contada = (float)parse_decimal_any($contadaTxt);

          if (isset($inf['quantidade_recebida']) && trim((string)$inf['quantidade_recebida']) !== '') {
            $recTxt = trim((string)$inf['quantidade_recebida']);
            if (!preg_match('/^\d+([.,]\d+)?$/', $recTxt)) {
              $pdo->rollBack();
              json_response(['ok' => false, 'msg' => 'Quantidade recebida inválida em ' . $nomeItem . '.'], 400);
            }
            $rec = parse_decimal_any($recTxt);
            if ((float)$rec - 0.0001 > (float)$qtdEnviada) {
              $pdo->rollBack();
              json_response(['ok' => false, 'msg' => 'A quantidade que chegou de ' . $nomeItem . ' não pode ser maior que a enviada.'], 400);
            }
            $qtdRecebida = $rec;
          }
        }

        $linhas[] = [
          'item' => $item, 'item_id' => $itemId, 'produto_id' => (int)$item['produto_id'], 'origem' => $origemItem,
          'enviada' => $qtdEnviada, 'recebida' => $qtdRecebida, 'contada' => $contada,
        ];
      }

      // 2) Aplica: entrada no destino só do que chegou.
      foreach ($linhas as $ln) {
        $item = $ln['item'];
        $movEntradaId = null;
        $movTransferenciaId = null;

        if ($destinoTipo === 'DEPOSITO' && decimal_gt_zero($ln['recebida'])) {
          saldo_creditar($ln['produto_id'], $destinoDepositoId, $ln['recebida']);

          // Histórico limpo: uma única linha TRANSFERENCIA, em vez de SAIDA + ENTRADA.
          $movTransferenciaId = registrar_movimento(
            'TRANSFERENCIA',
            $ln['produto_id'],
            (string)($item['codigo_barras_snapshot'] ?? ''),
            $ln['recebida'],
            $ln['origem'],
            $destinoDepositoId,
            (string)($req['codigo'] ?? req_codigo($id)) . ' - transferência confirmada',
            (int)$req['solicitante_usuario_id'],
            $uid,
            trim('Transferência confirmada por recebimento de requisição digital. ' . $obs)
          );
        }

        execSql(
          'UPDATE est_requisicao_item
              SET quantidade_recebida = :q,
                  movimento_entrada_id = :mov_entrada,
                  movimento_transferencia_id = :mov_transferencia,
                  atualizado_em = NOW()
            WHERE id = :id',
          [
            ':q' => $ln['recebida'],
            ':mov_entrada' => $movEntradaId,
            ':mov_transferencia' => $movTransferenciaId,
            ':id' => $ln['item_id'],
          ]
        );
      }

      // 2b) O que não chegou já saiu da origem no envio: registra essa saída para o histórico bater com o saldo.
      foreach ($linhas as $ln) {
        $perdida = round((float)$ln['enviada'] - (float)$ln['recebida'], 3);
        if ($destinoTipo === 'DEPOSITO' && $perdida > 0.0005) {
          registrar_movimento(
            'SAIDA',
            $ln['produto_id'],
            (string)($ln['item']['codigo_barras_snapshot'] ?? ''),
            number_format($perdida, 3, '.', ''),
            $ln['origem'],
            null,
            (string)($req['codigo'] ?? req_codigo($id)) . ' - diferença no caminho',
            (int)$req['solicitante_usuario_id'],
            $uid,
            'Enviado ' . $ln['enviada'] . ', chegou ' . $ln['recebida'] . ' no destino. Diferença em investigação.'
          );
        }
      }

      // 3) Contagem às cegas: grava e compara com o sistema (já com a entrada acima).
      if ($exigeContagem) {
        $codigoReq = (string)($req['codigo'] ?? req_codigo($id));
        $quem = (string)(current_user_row($uid)['nome'] ?? ('Usuário #' . $uid));

        foreach ($linhas as $ln) {
          if ((float)$ln['recebida'] + 0.0005 < (float)$ln['enviada']) {
            $nomeOrigem = rep_nome_deposito($pdo, $ln['origem']);
            rep_criar_alerta($pdo, [
              'tipo' => 'CAMINHO', 'origem_evento' => 'RECEBIMENTO', 'pausa_reposicao' => 1,
              'produto_id' => $ln['produto_id'], 'deposito_id' => $destinoDepositoId,
              'requisicao_id' => $id, 'requisicao_item_id' => $ln['item_id'],
              'qtd_enviada' => (float)$ln['enviada'], 'qtd_recebida' => (float)$ln['recebida'],
              'diferenca' => round((float)$ln['recebida'] - (float)$ln['enviada'], 3),
              'detalhe' => 'Saíram ' . rep_num((float)$ln['enviada']) . ' de ' . $nomeOrigem . ' e chegaram ' . rep_num((float)$ln['recebida']) .
                           ' (' . $codigoReq . ', recebido por ' . $quem . ').',
              'criado_por' => $uid,
            ]);
          }
        }

        // Um mesmo produto em duas linhas: vale a última contagem informada.
        $porProduto = [];
        foreach ($linhas as $ln) $porProduto[$ln['produto_id']] = $ln;

        foreach ($porProduto as $pid => $ln) {
          $sistema = rep_saldo($pdo, (int)$pid, $destinoDepositoId);
          $contada = (float)$ln['contada'];
          execSql(
            'INSERT INTO est_recebimento_contagem
               (requisicao_id, requisicao_item_id, produto_id, deposito_id, qtd_enviada, qtd_recebida, saldo_sistema, qtd_contada, diferenca, usuario_id, criado_em)
             VALUES (:r, :i, :p, :d, :e, :rc, :s, :c, :df, :u, NOW())',
            [
              ':r' => $id, ':i' => $ln['item_id'], ':p' => (int)$pid, ':d' => $destinoDepositoId,
              ':e' => $ln['enviada'], ':rc' => $ln['recebida'], ':s' => $sistema, ':c' => $contada,
              ':df' => round($contada - $sistema, 3), ':u' => $uid,
            ]
          );
          rep_registrar_divergencia_contagem(
            $pdo, (int)$pid, $destinoDepositoId, $sistema, $contada, 'RECEBIMENTO', $uid, $id, $ln['item_id'],
            'Contagem no recebimento da ' . $codigoReq . ' por ' . $quem . '.'
          );
        }
      }

      execSql(
        'UPDATE est_requisicao
            SET status = "ENTREGUE",
                destino_tipo = :destino_tipo,
                unidade_destino_id = :destino_id,
                recebido_por_usuario_id = :uid,
                recebido_em = NOW(),
                atualizado_em = NOW()
          WHERE id = :id',
        [
          ':destino_tipo' => $destinoTipo,
          ':destino_id' => $destinoDepositoId > 0 ? $destinoDepositoId : null,
          ':uid' => $uid,
          ':id' => $id,
        ]
      );

      $obsEvento = $obs !== '' ? $obs : ($destinoTipo === 'DEPOSITO' ? 'Transferência confirmada no destino.' : null);
      if ($exigeContagem) $obsEvento = trim(($obsEvento ?? '') . ' Recebimento com contagem às cegas.');

      add_event($id, $uid, 'CONFIRMOU_RECEBIMENTO', 'EM_TRANSITO', 'ENTREGUE', $obsEvento);

      $pdo->commit();

      notificar_requisicao_por_id('CONFIRMOU_RECEBIMENTO', $id, $uid);

      // Às cegas: a resposta não diz se a contagem bateu.
      json_response(['ok' => true, 'msg' => 'Recebimento confirmado.', 'row' => carregar_requisicao_detalhe($id)]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      throw $e;
    }
  }

  case 'recusar':
  case 'requisicao_recusar': {
    $id = (int)($body['id'] ?? $body['requisicao_id'] ?? 0);
    $motivo = trim((string)($body['motivo'] ?? $body['motivo_recusa'] ?? ''));

    if ($id <= 0) json_response(['ok' => false, 'msg' => 'ID inválido.'], 400);
    if ($motivo === '') json_response(['ok' => false, 'msg' => 'Motivo da recusa obrigatório.'], 400);

    $pdo = db();
    $pdo->beginTransaction();

    try {
      $req = carregar_requisicao_base($id, true);
      if (!$req) {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Requisição não encontrada.'], 404);
      }

      $statusAtual = (string)$req['status'];
      if (!in_array($statusAtual, ['PENDENTE', 'EM_SEPARACAO'], true)) {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Apenas requisições pendentes ou em separação podem ser recusadas.'], 400);
      }

      execSql(
        'UPDATE est_requisicao
            SET status = "RECUSADA",
                recusado_por_usuario_id = :uid,
                recusado_em = NOW(),
                motivo_recusa = :motivo,
                atualizado_em = NOW()
          WHERE id = :id',
        [':uid' => $uid, ':motivo' => $motivo, ':id' => $id]
      );

      add_event($id, $uid, 'RECUSADA', $statusAtual, 'RECUSADA', $motivo);

      $pdo->commit();


      json_response(['ok' => true, 'msg' => 'Requisição recusada.', 'row' => carregar_requisicao_detalhe($id)]);
    } catch (Throwable $e) {
      $pdo->rollBack();
      throw $e;
    }
  }

  case 'cancelar':
  case 'cancelar_minha':
  case 'requisicao_cancelar': {
    $id = (int)($body['id'] ?? $body['requisicao_id'] ?? 0);
    $motivo = trim((string)($body['motivo'] ?? $body['motivo_cancelamento'] ?? ''));

    if ($id <= 0) json_response(['ok' => false, 'msg' => 'ID inválido.'], 400);
    if ($motivo === '') $motivo = 'Cancelamento solicitado pelo usuário.';

    $pdo = db();
    $pdo->beginTransaction();

    try {
      $req = carregar_requisicao_base($id, true);
      if (!$req) {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Requisição não encontrada.'], 404);
      }

      $statusAtual = (string)$req['status'];
      if (!in_array($statusAtual, ['PENDENTE', 'EM_SEPARACAO'], true)) {
        $pdo->rollBack();
        json_response(['ok' => false, 'msg' => 'Apenas requisições pendentes ou em separação podem ser canceladas.'], 400);
      }

      if ((int)$req['solicitante_usuario_id'] !== $uid) {
        $pdo->rollBack();
        json_response([
          'ok' => false,
          'msg' => 'Somente o solicitante da requisição pode cancelar.',
        ], 403);
      }

      execSql(
        'UPDATE est_requisicao
            SET status = "CANCELADA",
                cancelado_por_usuario_id = :uid,
                cancelado_em = NOW(),
                motivo_cancelamento = :motivo,
                atualizado_em = NOW()
          WHERE id = :id',
        [':uid' => $uid, ':motivo' => $motivo, ':id' => $id]
      );

      add_event($id, $uid, 'CANCELADA', $statusAtual, 'CANCELADA', $motivo);

      $pdo->commit();


      json_response(['ok' => true, 'msg' => 'Requisição cancelada.', 'row' => carregar_requisicao_detalhe($id)]);
    } catch (Throwable $e) {
      $pdo->rollBack();
      throw $e;
    }
  }

  default:
    json_response(['ok' => false, 'msg' => 'Ação POST inválida.'], 400);
}
