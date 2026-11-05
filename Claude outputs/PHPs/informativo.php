<?php
// 23/10/2026 (segurança): confere o login assinado (cookie pai_session) antes de usar os cookies pai_*. Ver /home2/pla48587/pai_sessao.php
if (is_file('/home2/pla48587/pai_sessao.php')) { include_once '/home2/pla48587/pai_sessao.php'; } elseif (PHP_SAPI !== 'cli') { $paiChavesSemSessao = @include '/home2/pla48587/pai-chaves.php'; if (is_array($paiChavesSemSessao) && strtolower(trim((string) ($paiChavesSemSessao['pai_sessao_modo'] ?? ''))) === 'exigir') { error_log('[PAI] pai_sessao.php ausente com pai_sessao_modo=exigir: acesso bloqueado em ' . basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''))); if (!headers_sent()) { http_response_code(503); header('Content-Type: application/json; charset=utf-8'); header('Retry-After: 300'); } echo json_encode(['ok' => false, 'sucesso' => false, 'success' => false, 'erro' => 'Sistema em manutenção. Tente novamente em alguns minutos.', 'msg' => 'Sistema em manutenção. Tente novamente em alguns minutos.'], JSON_UNESCAPED_UNICODE); exit; } unset($paiChavesSemSessao); } // 23/10/2026: sem o pai_sessao.php e com o modo exigir, bloqueia em vez de liberar
// INSUMOS E CONSERVACAO POR USUARIO FIX V1: IDs 7 e 16
// CORRECOES 09/10/2026: atendimento cancelado sai das listas e não recebe ações; Gestão corrigindo item travado ajusta o estoque (estoque_atendimento.php).

// KIT LANCHE FIX V1: campo Sim/Não persistido no atendimento.
// =====================
// informativo.php - atendimentos persistidos somente em sepultamentos
// PERFORMANCE SAFE V3: consultas em lote, menos round-trips e proteções para conexões lentas, sem alterar regras de negócio.
// =====================
//
// ✅ Fonte única de atendimentos: tabela sepultamentos.
// O nome deste arquivo é apenas o endpoint HTTP; não existe tabela de banco chamada informativo.

// ===== CORS =====
header('Content-Type: application/json; charset=utf-8');

// ===== COMPRESSÃO HTTP SEGURA =====
// Reduz o tamanho do JSON em conexões móveis/lentas sem alterar o conteúdo lógico.
// Só ativa quando o cliente aceita gzip e o PHP não está com zlib.output_compression ativo.
if (
  !headers_sent() &&
  function_exists('ob_gzhandler') &&
  !filter_var((string)ini_get('zlib.output_compression'), FILTER_VALIDATE_BOOLEAN) &&
  stripos((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip') !== false
) {
  @ob_start('ob_gzhandler');
}

$allowedOrigins = [
  'https://app.planoassistencialintegrado.com.br',
  'https://pai.planoassistencialintegrado.com.br',
  'https://planoassistencialintegrado.com.br',
  'https://club.planoassistencialintegrado.com.br',
  'https://www.planoassistencialintegrado.com.br',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $allowedOrigins, true)) {

  // 🔥 remove qualquer header CORS que tenha vindo de .htaccess/nginx/apache
  header_remove('Access-Control-Allow-Origin');
  header_remove('Access-Control-Allow-Credentials');
  header_remove('Access-Control-Allow-Methods');
  header_remove('Access-Control-Allow-Headers');
  header_remove('Access-Control-Max-Age');

  header("Access-Control-Allow-Origin: $origin");
  header("Access-Control-Allow-Credentials: true");
  header("Access-Control-Allow-Methods: GET, POST, OPTIONS");

  $reqHeaders = $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? '';

  // 🔥 sempre inclui expires de forma garantida
  if ($reqHeaders) {
    // garante que "expires" esteja presente mesmo se vier diferente
    $h = strtolower($reqHeaders);
    if (strpos($h, 'expires') === false) $reqHeaders .= ', expires';
    header("Access-Control-Allow-Headers: $reqHeaders");
  } else {
    header("Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization, Expires, Cache-Control, Pragma, expires");
  }

  header("Access-Control-Max-Age: 86400");
  header("Vary: Origin");
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}


// ===== NO-CACHE =====
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// ===== SESSÃO (8 horas) =====
$sessionLifetime = 8 * 60 * 60; // 8h
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

date_default_timezone_set(getenv('PAI_TIMEZONE') ?: 'America/Sao_Paulo');

// ===== CONFIGURAÇÃO PRIVADA =====
// Arquivo fora da pasta pública do domínio.
$PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';

if (!is_file($PAI_CHAVES_FILE) || !is_readable($PAI_CHAVES_FILE)) {
  responder([
    'erro' => true,
    'msg' => 'Arquivo privado de configuração não encontrado ou sem permissão de leitura.'
  ], 500);
}

$PAI_CONFIG = require $PAI_CHAVES_FILE;

if (!is_array($PAI_CONFIG)) {
  responder([
    'erro' => true,
    'msg' => 'Arquivo privado de configuração inválido.'
  ], 500);
}

// ===== DB =====
$servername = trim((string)($PAI_CONFIG['db_host'] ?? ''));
$username   = trim((string)($PAI_CONFIG['db_user'] ?? ''));
$password   = (string)($PAI_CONFIG['db_password'] ?? '');
$dbname     = trim((string)($PAI_CONFIG['db_name'] ?? ''));

// ===== OneSignal =====
$onesignal_app_id  = trim((string)($PAI_CONFIG['onesignal_app_id'] ?? ''));
$onesignal_api_key = trim((string)($PAI_CONFIG['onesignal_api_key'] ?? ''));

// Se o OneSignal não estiver configurado, o atendimento continua funcionando;
// apenas notificações push serão ignoradas pelas funções existentes.


// ===== CONEXÃO PDO =====
if ($username === '' || $password === '' || $dbname === '') {
  responder([
    'erro' => true,
    'msg' => 'Configuração do banco ausente ou incompleta em pai-chaves.php.'
  ], 500);
}

try {
  $pdo = new PDO(
    "mysql:host=$servername;dbname=$dbname;charset=utf8mb4",
    $username,
    $password,
    [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]
  );
} catch (PDOException $e) {
  echo json_encode(['erro' => true, 'msg' => 'Erro ao conectar! ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], JSON_UNESCAPED_UNICODE);
  exit;
}

// ----------- HELPERS -----------
function responder($arr, int $code = 200) {
  http_response_code($code);
  // Mantém a mesma estrutura JSON, evitando apenas escapes desnecessários em URLs.
  echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function fetchOne(PDO $pdo, string $sql, array $params = []): ?array {
  $st = $pdo->prepare($sql);
  $st->execute($params);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

// Configuração defensiva para chamadas HTTP externas (OneSignal).
// Evita que indisponibilidade externa segure uma gravação por tempo excessivo.
function configurar_curl_externo($ch): void {
  if (!$ch) return;
  curl_setopt($ch, CURLOPT_NOSIGNAL, true);
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT_MS, 2500);
  curl_setopt($ch, CURLOPT_TIMEOUT_MS, 8000);
}

function titlecase($s) {
  if (!is_string($s)) return $s;
  if (function_exists('mb_convert_case')) return mb_convert_case($s, MB_CASE_TITLE, 'UTF-8');
  if (function_exists('mb_strtolower')) return ucwords(mb_strtolower($s, 'UTF-8'));
  return ucwords(strtolower($s));
}

function asIntOrNull($v) {
  if ($v === '' || $v === null || !isset($v)) return null;
  if (is_string($v)) $v = trim($v);
  if ($v === '' || $v === null) return null;
  if (!is_numeric($v)) return null;
  return (int)$v;
}

function asNullIfEmpty($v) {
  if (!isset($v)) return null;
  $v = is_string($v) ? trim($v) : $v;
  if ($v === '' || $v === false) return null;
  return $v;
}

function asDateOrNull($v) {
  if (!isset($v)) return null;
  $v = is_string($v) ? trim($v) : $v;
  if ($v === '' || $v === false) return null;
  if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$v)) return (string)$v;
  if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', (string)$v, $m)) return $m[3] . '-' . $m[2] . '-' . $m[1];
  return null;
}

function asCpfDigitsOrNull($v) {
  if (!isset($v)) return null;
  $cpf = preg_replace('/\D+/', '', (string)$v);
  if ($cpf === '') return null;
  return substr($cpf, 0, 11);
}

function json_decode_safe($s) {
  if ($s === null || $s === '' || !is_string($s)) return null;
  $j = json_decode($s, true);
  return is_array($j) ? $j : null;
}

function json_encode_u($v) {
  return json_encode($v, JSON_UNESCAPED_UNICODE);
}

function same_null_or_str($a, $b) {
  $aa = isset($a) ? (string)$a : null;
  $bb = isset($b) ? (string)$b : null;
  return $aa === $bb;
}

// ===== Schema helpers (compatibilidade + cache por requisição) =====
// O cache abaixo existe SOMENTE durante a requisição PHP atual.
// Ele não faz cache de atendimentos nem de dados operacionais, portanto as leituras
// continuam refletindo o banco em tempo real a cada chamada do endpoint.
function table_exists(PDO $pdo, string $table): bool {
  static $cache = [];

  if (array_key_exists($table, $cache)) {
    return $cache[$table];
  }

  $st = $pdo->prepare("
    SELECT 1
      FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :t
     LIMIT 1
  ");
  $st->execute([':t' => $table]);

  $cache[$table] = (bool)$st->fetchColumn();
  return $cache[$table];
}

function column_exists(PDO $pdo, string $table, string $col): bool {
  static $columnsByTable = [];

  // Na primeira consulta de uma tabela, carrega os nomes de TODAS as colunas
  // em uma única ida ao information_schema. As demais verificações são em memória.
  if (!array_key_exists($table, $columnsByTable)) {
    $st = $pdo->prepare("
      SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = :t
    ");
    $st->execute([':t' => $table]);

    $cols = $st->fetchAll(PDO::FETCH_COLUMN) ?: [];
    $columnsByTable[$table] = array_fill_keys(array_map('strval', $cols), true);
  }

  return isset($columnsByTable[$table][$col]);
}

// Endpoints estritamente de leitura não precisam manter o arquivo/registro de sessão
// bloqueado durante consultas mais demoradas. Isso permite que outras requisições do
// MESMO usuário sejam processadas em paralelo sem alterar os dados da sessão.
function liberar_lock_sessao_leitura(): void {
  if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
  }
}

function pick_table_for_id(PDO $pdo, int $id): ?string {
  if ($id <= 0 || !table_exists($pdo, 'sepultamentos')) return null;

  $st = $pdo->prepare("SELECT 1 FROM sepultamentos WHERE id = :id LIMIT 1");
  $st->execute([':id' => $id]);
  return $st->fetchColumn() ? 'sepultamentos' : null;
}



// ===== Legado de Luz / Homenagens =====
// Alteração isolada para o botão "Enviar Legado de Luz":
// - busca a homenagem existente pelo atendimento_id
// - se não existir, cria uma homenagem ativa
// - adiciona ao retorno do GET ?listar=1 os campos: homenagem_slug, codigo_homenagem,
//   legado_luz_slug, homenagem_link_publico e legado_luz_link
function slug_homenagem_pai(string $nome, int $id): string {
  $nome = trim($nome);
  if ($nome === '') $nome = 'homenagem';

  $s = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nome);
  if ($s !== false) $nome = $s;

  $nome = strtolower($nome);
  $nome = preg_replace('/[^a-z0-9\s\-]/', '', $nome);
  $nome = preg_replace('/\s+/', '-', $nome);
  $nome = preg_replace('/\-+/', '-', $nome);
  $nome = trim($nome, '-');

  if ($nome === '') $nome = 'homenagem';

  return $nome . '-' . $id;
}

function url_absoluta_api_pai($url): ?string {
  $url = trim((string)($url ?? ''));

  if ($url === '' || strtolower($url) === 'null' || strtolower($url) === 'undefined') {
    return null;
  }

  $url = html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
  $url = str_replace('\\', '/', $url);

  // Corrige URLs antigas salvas no domínio público apontando para uploads da API.
  if (preg_match('#^https?://(www\\.)?planoassistencialintegrado\\.com\\.br/(uploads/(falecidos|acoes_fotos|homenagens)/.+)$#i', $url, $m)) {
    return 'https://api.planoassistencialintegrado.com.br/' . ltrim($m[2], '/');
  }

  if (preg_match('#^https?://api\\.planoassistencialintegrado\\.com\\.br/#i', $url)) {
    return $url;
  }

  if (preg_match('#^https?://#i', $url)) {
    return $url;
  }

  // Se vier algo como api.planoassistencialintegrado.com.br/uploads/...
  if (stripos($url, 'api.planoassistencialintegrado.com.br/') === 0) {
    return 'https://' . $url;
  }

  // Se vier caminho com /uploads/ no meio, usa só a parte de uploads.
  $posUploads = stripos($url, '/uploads/');
  if ($posUploads !== false) {
    $url = substr($url, $posUploads);
  }

  if ($url[0] !== '/') {
    $url = '/' . $url;
  }

  return 'https://api.planoassistencialintegrado.com.br' . $url;
}

function foto_falecido_atual_do_registro(array $row): ?string {
  $campos = [
    'foto_falecido',
    'foto_falecido_url',
    'foto_url',
    'foto_principal_url',
    'foto_principal',
    'imagem_falecido',
    'imagem',
    'avatar',
    'photo_url',
    'url_foto',
  ];

  foreach ($campos as $campo) {
    if (!array_key_exists($campo, $row)) continue;

    $valor = trim((string)($row[$campo] ?? ''));
    if ($valor === '' || strtolower($valor) === 'null' || strtolower($valor) === 'undefined') continue;

    $url = url_absoluta_api_pai($valor);
    if ($url) return $url;
  }

  // Fallback defensivo: caso a API/banco traga a foto em um campo novo,
  // procura qualquer valor que aponte para uploads/falecidos.
  foreach ($row as $valor) {
    if (is_array($valor) || is_object($valor)) continue;

    $valor = trim((string)($valor ?? ''));
    if ($valor === '') continue;

    if (stripos($valor, '/uploads/falecidos/') !== false || stripos($valor, 'uploads/falecidos/') !== false) {
      $url = url_absoluta_api_pai($valor);
      if ($url) return $url;
    }
  }

  return null;
}

function sincronizar_foto_homenagem_para_atendimento(PDO $pdo, int $atendimentoId, $foto, string $tbl = 'sepultamentos'): void {
  if ($atendimentoId <= 0 || !table_exists($pdo, 'homenagens')) return;
  if (!column_exists($pdo, 'homenagens', 'foto_principal_url')) return;

  $fotoAtual = url_absoluta_api_pai($foto);
  if (!$fotoAtual) return;

  $where = "atendimento_id = :atendimento_id";
  $params = [
    ':atendimento_id' => $atendimentoId,
    ':foto_principal_url' => $fotoAtual,
  ];

  if (column_exists($pdo, 'homenagens', 'atendimento_tabela')) {
    $where .= " AND (atendimento_tabela = :atendimento_tabela OR atendimento_tabela IS NULL OR atendimento_tabela = '')";
    $params[':atendimento_tabela'] = $tbl;
  }

  try {
    $sql = "
      UPDATE homenagens
         SET foto_principal_url = :foto_principal_url
       WHERE {$where}
         AND (
           foto_principal_url IS NULL
           OR foto_principal_url = ''
           OR foto_principal_url <> :foto_principal_url
         )
    ";
    $st = $pdo->prepare($sql);
    $st->execute($params);
  } catch (Exception $e) {
    // Não bloqueia edição/listagem caso a sincronização auxiliar falhe.
  }
}

function link_publico_legado_luz(int $atendimentoId): string {
  return 'https://planoassistencialintegrado.com.br/legado-de-luz/?atendimento_id=' . urlencode((string)$atendimentoId);
}

// Mantido apenas para compatibilidade com links antigos que ainda usem ?codigo=slug.
// O link principal retornado por este arquivo agora é sempre por atendimento_id.
function link_publico_legado_luz_por_slug(string $slug): string {
  return 'https://planoassistencialintegrado.com.br/legado-de-luz/?codigo=' . urlencode($slug);
}

/**
 * Carrega em lote as homenagens dos atendimentos que já serão devolvidos pelo listar=1.
 * Preserva a mesma regra do SELECT individual: usa a homenagem de maior id por atendimento
 * e aceita atendimento_tabela igual à origem, NULL ou vazio para compatibilidade legada.
 *
 * O cache existe somente durante esta requisição PHP. Nenhum dado operacional é cacheado
 * entre chamadas do endpoint.
 */
function carregar_homenagens_em_lote(PDO $pdo, array $rows, string $tbl): array {
  if (!$rows || !table_exists($pdo, 'homenagens')) return [];

  $ids = [];
  foreach ($rows as $row) {
    if (!is_array($row)) continue;
    $id = (int)($row['id'] ?? 0);
    if ($id > 0) $ids[$id] = $id;
  }

  if (!$ids) return [];

  $temAtendimentoTabela = column_exists($pdo, 'homenagens', 'atendimento_tabela');
  $map = [];

  // Lotes de até 1000 IDs mantêm a SQL controlada; com o volume atual, a listagem usa uma única consulta de homenagens.
  foreach (array_chunk(array_values($ids), 1000) as $chunkIndex => $chunk) {
    $params = [];
    $holders = [];

    foreach ($chunk as $i => $id) {
      $ph = ':aid_' . $chunkIndex . '_' . $i;
      $holders[] = $ph;
      $params[$ph] = (int)$id;
    }

    $whereTabela = '';
    if ($temAtendimentoTabela) {
      $whereTabela = " AND (atendimento_tabela = :atendimento_tabela OR atendimento_tabela IS NULL OR atendimento_tabela = '')";
      $params[':atendimento_tabela'] = $tbl;
    }

    $sql = "
      SELECT *
        FROM homenagens
       WHERE atendimento_id IN (" . implode(',', $holders) . ")
             {$whereTabela}
       ORDER BY atendimento_id ASC, id DESC
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);

    while ($h = $st->fetch(PDO::FETCH_ASSOC)) {
      $aid = (int)($h['atendimento_id'] ?? 0);
      if ($aid <= 0 || isset($map[$aid])) continue;
      // ORDER BY id DESC garante que o primeiro de cada atendimento é o mesmo do LIMIT 1 antigo.
      $map[$aid] = $h;
    }
  }

  return $map;
}

function buscar_ou_criar_homenagem_para_atendimento(
  PDO $pdo,
  string $tbl,
  array $row,
  ?array $homenagemPrefetch = null,
  bool $usarPrefetch = false
): array {
  if (!table_exists($pdo, 'homenagens')) {
    return [
      'slug' => '',
      'link_publico' => '',
      'status' => '',
    ];
  }

  $atendimentoId = (int)($row['id'] ?? 0);
  if ($atendimentoId <= 0) {
    return [
      'slug' => '',
      'link_publico' => '',
      'status' => '',
    ];
  }

  $falecidoAtual = trim((string)($row['falecido'] ?? ''));
  $slugAtual = slug_homenagem_pai($falecidoAtual, $atendimentoId);
  $linkAtual = link_publico_legado_luz($atendimentoId);
  $fotoAtual = foto_falecido_atual_do_registro($row);

  // 1) Procura homenagem existente deste atendimento.
  // No listar=1, a homenagem já chega pré-carregada em lote, eliminando o N+1.
  // Nos demais usos, mantém exatamente a busca individual antiga.
  if ($usarPrefetch) {
    $h = $homenagemPrefetch;
  } else {
    $where = "atendimento_id = :atendimento_id";
    $paramsBusca = [':atendimento_id' => $atendimentoId];

    if (column_exists($pdo, 'homenagens', 'atendimento_tabela')) {
      $where .= " AND (atendimento_tabela = :atendimento_tabela OR atendimento_tabela IS NULL OR atendimento_tabela = '')";
      $paramsBusca[':atendimento_tabela'] = $tbl;
    }

    $st = $pdo->prepare("
      SELECT *
        FROM homenagens
       WHERE {$where}
       ORDER BY id DESC
       LIMIT 1
    ");
    $st->execute($paramsBusca);
    $h = $st->fetch(PDO::FETCH_ASSOC);
  }

  if ($h && (int)($h['id'] ?? 0) > 0) {
    $homenagemId = (int)$h['id'];
    $slugSalvo = trim((string)($h['slug'] ?? ''));
    $linkSalvo = trim((string)($h['link_publico'] ?? ''));
    $falecidoSalvo = trim((string)($h['falecido'] ?? ''));
    $atendimentoTabelaSalva = trim((string)($h['atendimento_tabela'] ?? ''));
    $fotoSalva = url_absoluta_api_pai($h['foto_principal_url'] ?? null);

    // Mantém a mesma homenagem, mas atualiza slug/link/nome/foto caso o atendimento tenha sido corrigido.
    // As mensagens, fotos, vídeos, áudios, estrelas e flores continuam ligadas ao mesmo registro.
    $updates = [];
    $paramsUpdate = [':id' => $homenagemId];

    if (column_exists($pdo, 'homenagens', 'slug') && $slugAtual !== '' && $slugSalvo !== $slugAtual) {
      $updates[] = "slug = :slug";
      $paramsUpdate[':slug'] = $slugAtual;
    }

    if (column_exists($pdo, 'homenagens', 'link_publico') && $linkSalvo !== $linkAtual) {
      $updates[] = "link_publico = :link_publico";
      $paramsUpdate[':link_publico'] = $linkAtual;
    }

    // Antes este campo era regravado em TODA listagem, mesmo sem mudança.
    // Agora grava somente quando o valor realmente mudou.
    if (
      column_exists($pdo, 'homenagens', 'falecido') &&
      $falecidoAtual !== '' &&
      $falecidoSalvo !== $falecidoAtual
    ) {
      $updates[] = "falecido = :falecido";
      $paramsUpdate[':falecido'] = $falecidoAtual;
    }

    // Correção principal: quando a foto do atendimento muda em sepultamentos,
    // sincroniza a foto principal da homenagem já existente.
    if (column_exists($pdo, 'homenagens', 'foto_principal_url') && $fotoAtual && $fotoSalva !== $fotoAtual) {
      $updates[] = "foto_principal_url = :foto_principal_url";
      $paramsUpdate[':foto_principal_url'] = $fotoAtual;
    }

    // Mesma regra: normaliza atendimento_tabela quando necessário, mas não
    // executa UPDATE redundante quando o valor já está correto.
    if (
      column_exists($pdo, 'homenagens', 'atendimento_tabela') &&
      $atendimentoTabelaSalva !== $tbl
    ) {
      $updates[] = "atendimento_tabela = :atendimento_tabela";
      $paramsUpdate[':atendimento_tabela'] = $tbl;
    }

    if (!empty($updates)) {
      try {
        $sqlUpdate = "UPDATE homenagens SET " . implode(', ', $updates) . " WHERE id = :id LIMIT 1";
        $stUpdate = $pdo->prepare($sqlUpdate);
        $stUpdate->execute($paramsUpdate);
      } catch (Exception $e) {
        // Não bloqueia a listagem/portal se a atualização auxiliar falhar.
      }
    }

    return [
      'slug' => $slugAtual !== '' ? $slugAtual : $slugSalvo,
      'link_publico' => $linkAtual,
      'status' => (string)($h['status'] ?? ''),
    ];
  }

  // 2) Se não existir, cria apenas com colunas que existirem na tabela homenagens.
  $slug = $slugAtual;
  $link = $linkAtual;
  $foto = $fotoAtual;

  $cpf = preg_replace('/\D+/', '', (string)($row['cpf_responsavel'] ?? ''));

  // Senha familiar da moderação: 6 primeiros números do CPF do responsável.
  // Fallback: ID do atendimento, caso CPF não esteja cadastrado.
  $senhaFamiliar = strlen($cpf) >= 6 ? substr($cpf, 0, 6) : (string)$atendimentoId;
  $senhaHash = password_hash($senhaFamiliar, PASSWORD_DEFAULT);

  $campos = [
    'atendimento_id' => $atendimentoId,
    'atendimento_tabela' => $tbl,
    'falecido' => $falecidoAtual,
    'slug' => $slug,
    'link_publico' => $link,
    'foto_principal_url' => $foto,
    'mensagem_principal' => 'O amor permanece nas lembranças, nos gestos e nas histórias que ficam para sempre.',
    'senha_familiar_hash' => $senhaHash,
    'status' => 'ativo',
    'permitir_mensagem' => 1,
    'permitir_foto' => 1,
    'permitir_audio' => 1,
    'permitir_video' => 1,
    'permitir_vela' => 1,
    'permitir_flor' => 1,
  ];

  $insertCols = [];
  $params = [];

  foreach ($campos as $col => $value) {
    if (column_exists($pdo, 'homenagens', $col)) {
      $insertCols[] = $col;
      $params[':' . $col] = $value;
    }
  }

  if (empty($insertCols)) {
    return [
      'slug' => '',
      'link_publico' => '',
      'status' => '',
    ];
  }

  try {
    $placeholders = [];
    foreach ($insertCols as $c) {
      $placeholders[] = ':' . $c;
    }

    $sqlInsert = "
      INSERT INTO homenagens (" . implode(',', $insertCols) . ")
      VALUES (" . implode(',', $placeholders) . ")
    ";

    $stInsert = $pdo->prepare($sqlInsert);
    $stInsert->execute($params);

    return [
      'slug' => $slug,
      'link_publico' => $link,
      'status' => 'ativo',
    ];
  } catch (Exception $e) {
    // Se houve colisão ou registro criado por outra chamada, tenta recuperar pelo atendimento_id.
    $where2 = "atendimento_id = :atendimento_id";
    $paramsBusca2 = [':atendimento_id' => $atendimentoId];

    if (column_exists($pdo, 'homenagens', 'atendimento_tabela')) {
      $where2 .= " AND (atendimento_tabela = :atendimento_tabela OR atendimento_tabela IS NULL OR atendimento_tabela = '')";
      $paramsBusca2[':atendimento_tabela'] = $tbl;
    }

    $st2 = $pdo->prepare("
      SELECT *
        FROM homenagens
       WHERE {$where2}
       ORDER BY id DESC
       LIMIT 1
    ");
    $st2->execute($paramsBusca2);
    $h2 = $st2->fetch(PDO::FETCH_ASSOC);

    if ($h2 && trim((string)($h2['slug'] ?? '')) !== '') {
      if ($fotoAtual && column_exists($pdo, 'homenagens', 'foto_principal_url')) {
        sincronizar_foto_homenagem_para_atendimento($pdo, $atendimentoId, $fotoAtual, $tbl);
      }

      return [
        'slug' => $slugAtual !== '' ? $slugAtual : trim((string)$h2['slug']),
        'link_publico' => $linkAtual,
        'status' => (string)($h2['status'] ?? ''),
      ];
    }

    return [
      'slug' => '',
      'link_publico' => '',
      'status' => '',
    ];
  }
}

function adicionar_homenagem_ao_registro(
  PDO $pdo,
  array $row,
  string $tbl,
  ?array $homenagemPrefetch = null,
  bool $usarPrefetch = false
): array {
  $atendimentoId = (int)($row['id'] ?? 0);
  $h = buscar_ou_criar_homenagem_para_atendimento($pdo, $tbl, $row, $homenagemPrefetch, $usarPrefetch);

  $row['homenagem_slug'] = $h['slug'];
  $row['codigo_homenagem'] = $h['slug'];
  $row['legado_luz_slug'] = $h['slug'];

  // Link principal corrigido: agora é estável pelo ID do atendimento.
  // Ex.: /legado-de-luz/?atendimento_id=847
  $row['homenagem_link_publico'] = $h['link_publico'];
  $row['legado_luz_link'] = $h['link_publico'];
  $row['legado_luz_atendimento_id'] = $atendimentoId > 0 ? (string)$atendimentoId : '';
  $row['homenagem_status'] = $h['status'];

  return $row;
}

function adicionar_homenagens_aos_registros(PDO $pdo, array $rows, string $tbl): array {
  if (!$rows) return $rows;

  // Uma única leitura em lote substitui centenas de SELECTs individuais no listar=1.
  $homenagensPorAtendimento = carregar_homenagens_em_lote($pdo, $rows, $tbl);

  foreach ($rows as $idx => $r) {
    if (!is_array($r)) continue;
    $atendimentoId = (int)($r['id'] ?? 0);
    $hPrefetch = $atendimentoId > 0 ? ($homenagensPorAtendimento[$atendimentoId] ?? null) : null;
    $rows[$idx] = adicionar_homenagem_ao_registro($pdo, $r, $tbl, $hPrefetch, true);
  }

  return $rows;
}


// ===== Normalização de rótulos -> faseXX =====
function _normalize_key($s) {
  $s = (string)$s;
  $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
  if ($t !== false) $s = $t;
  $s = strtolower(trim($s));
  $s = preg_replace('/\s+/u', ' ', $s) ?: $s;
  return $s;
}

function normalize_status_code($status) {
  if (!$status) return null;
  $s = strtolower(trim((string)$status));

  if (strpos($s, 'fase') === 0) {
    $num = preg_replace('/\D+/', '', $s);
    if ($num === '') return $s;
    $num = str_pad($num, 2, '0', STR_PAD_LEFT);
    return 'fase' . $num;
  }

  $map = [
    _normalize_key('Removendo')                    => 'fase01',
    _normalize_key('Aguardando Procedimento')      => 'fase02',
    _normalize_key('Preparando')                   => 'fase03',
    _normalize_key('Aguardando Ornamentação')      => 'fase04',
    _normalize_key('Ornamentando')                 => 'fase05',
    _normalize_key('Fim da Ornamentação')          => 'fase06',
    _normalize_key('Aguardando Corpo Pronto')      => 'fase06',
    _normalize_key('Corpo Pronto')                 => 'fase12',
    _normalize_key('Transportando')                => 'fase07',
    _normalize_key('Transportando Óbito p/Velório')=> 'fase07',
    _normalize_key('Velando')                      => 'fase08',
    _normalize_key('Sepultando')                   => 'fase09',
    _normalize_key('Sepultamento Concluído')       => 'fase10',
    _normalize_key('Sepultamento Concluido')       => 'fase10',
    _normalize_key('Material Recolhido')           => 'fase11',
  ];

  $nk = _normalize_key($s);
  return $map[$nk] ?? null;
}

function numero_fase_status($status): int {
  $code = normalize_status_code($status) ?? '';
  if (preg_match('/^fase(\d+)$/i', (string)$code, $m)) {
    return (int)$m[1];
  }
  return 0;
}

function obrigatoriedade_ativa_por_status($status): bool {
  return numero_fase_status($status) >= 2;
}

// Durante uma edição, a validação de obrigatoriedade e o UPDATE precisam ler o mesmo
// registro. O cache abaixo vive apenas nesta requisição e evita duas leituras do mesmo ID.
function buscar_registro_edicao_na_requisicao(PDO $pdo, int $id): ?array {
  static $cache = [];

  if ($id <= 0) return null;
  if (array_key_exists($id, $cache)) return $cache[$id];
  if (!table_exists($pdo, 'sepultamentos')) return $cache[$id] = null;

  $st = $pdo->prepare("SELECT * FROM sepultamentos WHERE id = :id LIMIT 1");
  $st->execute([':id' => $id]);
  $row = $st->fetch(PDO::FETCH_ASSOC);

  $cache[$id] = $row ?: null;
  return $cache[$id];
}

function buscar_status_atual_registro(PDO $pdo, int $id): ?string {
  $row = buscar_registro_edicao_na_requisicao($pdo, $id);
  if (!$row || !array_key_exists('status', $row)) return null;
  return (string)$row['status'];
}

function obrigatoriedade_ativa_para_payload(PDO $pdo, array $json): bool {
  $acao = (string)($json['acao'] ?? '');

  // Novo Registro sempre pode nascer incompleto.
  if ($acao === 'novo') return false;

  // Apenas edição de atendimento usa a regra de fase.
  if ($acao !== 'editar') return false;

  $id = (int)($json['id'] ?? 0);
  if ($id <= 0) return false;

  $statusAtual = buscar_status_atual_registro($pdo, $id);

  return obrigatoriedade_ativa_por_status($statusAtual);
}

function payload_tipo_terceiro(array $json): bool {
  $tipo = strtolower(trim((string)($json['tipo_atendimento'] ?? '')));
  return $tipo === 'terceiro';
}

function payload_campo_vazio(array $json, string $campo): bool {
  if (!array_key_exists($campo, $json)) return true;
  return trim((string)($json[$campo] ?? '')) === '';
}

function payload_sim_nao_valido($v): bool {
  $s = strtolower(trim((string)$v));
  $s = str_replace(['ã', 'á', 'à', 'â'], 'a', $s);
  return in_array($s, ['sim', 'nao', 'não', 's', 'n', '1', '0', 'true', 'false'], true);
}

function payload_restrict_ids(array $json): ?array {
  if (!array_key_exists('_wizard_restrict_ids', $json)) return null;

  $ids = $json['_wizard_restrict_ids'];

  if (is_string($ids)) {
    $decoded = json_decode($ids, true);
    if (is_array($decoded)) {
      $ids = $decoded;
    } else {
      $ids = explode(',', $ids);
    }
  }

  if (!is_array($ids)) return null;

  $out = [];
  foreach ($ids as $id) {
    $id = trim((string)$id);
    if ($id !== '') $out[] = $id;
  }

  return array_values(array_unique($out));
}

function campo_no_escopo(?array $scopeIds, string $campo): bool {
  if ($scopeIds === null) return true;
  return in_array($campo, $scopeIds, true);
}

function scope_tem_algum(?array $scopeIds, array $campos): bool {
  if ($scopeIds === null) return true;

  foreach ($campos as $campo) {
    if (in_array($campo, $scopeIds, true)) return true;
  }

  return false;
}

function validar_obrigatorios_fase02_ou_erro(array $json, ?array $scopeIds = null): void {
  // O fluxo terceiro permanece sem obrigatórios, igual ao page.tsx.
  if (payload_tipo_terceiro($json)) return;

  $campos = [
    'falecido' => 'Nome do Falecido(a)',
    'data_nascimento' => 'Data de Nascimento',
    'data_falecimento' => 'Data de Falecimento',
    'nome_responsavel' => 'Nome do Responsável',
    'contato' => 'Contato',
    'convenio' => 'Convênio',
    'religiao' => 'Religião',
  ];

  foreach ($campos as $campo => $label) {
    if (!campo_no_escopo($scopeIds, $campo)) continue;

    if (payload_campo_vazio($json, $campo)) {
      responder([
        'erro' => true,
        'msg' => "Campo obrigatório após Corpo na Clínica: {$label}."
      ], 400);
    }
  }

  if (
    campo_no_escopo($scopeIds, 'data_nascimento') &&
    asDateOrNull($json['data_nascimento'] ?? null) === null
  ) {
    responder(['erro' => true, 'msg' => 'Data de Nascimento inválida ou não informada.'], 400);
  }

  if (
    campo_no_escopo($scopeIds, 'data_falecimento') &&
    asDateOrNull($json['data_falecimento'] ?? null) === null
  ) {
    responder(['erro' => true, 'msg' => 'Data de Falecimento inválida ou não informada.'], 400);
  }

  $simNao = [
    'assistencia' => 'Assistência',
    'tanato' => 'Tanatopraxia',
    'ornamentacao' => 'Ornamentação',
    'invol' => 'Invol',
    'veu' => 'Véu',
    'cordao' => 'Cordão São Francisco',
    'kit_lanche' => 'KIT LANCHE',
    'coroa_flores' => 'Coroa de Flores',
    'realiza_velorio' => 'Velório',
    'realiza_sepultamento' => 'Sepultamento',
  ];

  foreach ($simNao as $campo => $label) {
    if (!campo_no_escopo($scopeIds, $campo)) continue;

    if (payload_campo_vazio($json, $campo) || !payload_sim_nao_valido($json[$campo] ?? '')) {
      responder([
        'erro' => true,
        'msg' => "Selecione Sim ou Não em {$label}."
      ], 400);
    }
  }
}



function normalize_deposito_nome($v) {
  $s = strtoupper(trim((string)($v ?? '')));
  return ($s === 'FUNERARIA') ? 'FUNERARIA' : 'MEMORIAL';
}

// ===== Utils extras (ROUPA / INVOL / INSUMOS) =====
function norm_upper($s) {
  $s = trim((string)$s);
  $s = preg_replace('/\s+/u', ' ', $s ?? '') ?: '';
  return strtoupper($s);
}

function is_sim($v): bool {
  $s = strtolower(trim((string)$v));
  return $s === 'sim' || $s === 's' || $s === '1' || $s === 'true';
}

function is_nao($v): bool {
  $s = strtolower(trim((string)$v));
  return in_array($s, ['não','nao','n','0','false'], true);
}

function sim_nao_canonico($v): string {
  if (is_sim($v)) return 'Sim';
  if (is_nao($v)) return 'Não';
  return trim((string)($v ?? ''));
}

function is_true($v): bool {
  if ($v === true || $v === 1 || $v === "1") return true;
  $s = strtolower(trim((string)$v));
  return in_array($s, ['true','sim','s','yes','y'], true);
}


function is_roupa_propria($v): bool {
  $s = strtolower(trim((string)$v));
  $s = str_replace(
    ['á','à','ã','â','ä','é','è','ê','ë','í','ì','î','ï','ó','ò','õ','ô','ö','ú','ù','û','ü','ç'],
    ['a','a','a','a','a','e','e','e','e','i','i','i','i','o','o','o','o','o','u','u','u','u','c'],
    $s
  );
  return $s === 'roupa propria' || $s === 'roupa própria';
}

function validar_deposito_em_lista_ou_erro(string $campo, $valor, array $allowed): string {
  $dep = norm_upper($valor);
  if ($dep === '' || !in_array($dep, $allowed, true)) {
    responder([
      'erro' => true,
      'msg'  => "Depósito inválido para {$campo}. Permitidos: " . implode(', ', $allowed) . "."
    ], 400);
  }
  return $dep;
}

function normalizar_rotas_atendimento_payload(array &$json): void {
  if (array_key_exists('realiza_velorio', $json)) {
    $json['realiza_velorio'] = sim_nao_canonico($json['realiza_velorio']);

    if (is_nao($json['realiza_velorio'])) {
      $json['local_velorio'] = '';
      $json['sala_velorio'] = null;
      $json['velorio_online'] = null;
      $json['data_inicio_velorio'] = null;
      $json['data_fim_velorio'] = null;
      $json['hora_inicio_velorio'] = null;
      $json['hora_fim_velorio'] = null;
      $json['observacao_velorio01'] = '';
    }
  }

  if (array_key_exists('realiza_sepultamento', $json)) {
    $json['realiza_sepultamento'] = sim_nao_canonico($json['realiza_sepultamento']);

    if (is_nao($json['realiza_sepultamento'])) {
      $json['local'] = '';
      $json['observacao_velorio02'] = '';
    }
  }
}

function normalizar_validar_coroa_payload(PDO $pdo, array &$json, bool $obrigatoriedadeAtiva, ?array $scopeIds = null): void {
  $camposCoroa = [
    'coroa_flores','coroas_itens','coroa_tipo','coroa_produto_id','coroa_modelo',
    'coroa_codigo_barras','coroa_deposito_nome'
  ];

  if (!scope_tem_algum($scopeIds, $camposCoroa)) return;
  if (!array_key_exists('coroa_flores', $json)) return;

  $json['coroa_flores'] = sim_nao_canonico($json['coroa_flores']);

  if (!is_sim($json['coroa_flores'])) {
    $json['coroa_tipo'] = null;
    $json['coroa_produto_id'] = null;
    $json['coroa_modelo'] = null;
    $json['coroa_codigo_barras'] = null;
    $json['coroa_deposito_nome'] = null;
    $json['coroas_itens'] = [];
    return;
  }

  $rawItens = $json['coroas_itens'] ?? null;

  // Compatibilidade temporária com clientes antigos de uma única coroa.
  if (!is_array($rawItens) || !$rawItens) {
    $tipoRaw = strtolower(trim((string)($json['coroa_tipo'] ?? '')));
    $produtoId = (int)($json['coroa_produto_id'] ?? 0);
    $modelo = trim((string)($json['coroa_modelo'] ?? ''));

    if ($obrigatoriedadeAtiva && (!in_array($tipoRaw, ['natural','artificial'], true) || $produtoId <= 0 || $modelo === '')) {
      responder(['erro' => true, 'msg' => 'Coroa de Flores: informe quantidade, tipo, modelo e frase de cada coroa.'], 400);
    }

    if ($tipoRaw === 'artificial') {
      $dep = norm_upper((string)($json['coroa_deposito_nome'] ?? ''));
      if ($dep !== '' && !in_array($dep, ['MEMORIAL', 'FUNERARIA'], true)) {
        responder(['erro' => true, 'msg' => 'Coroa Artificial: depósitos permitidos são MEMORIAL e FUNERARIA.'], 400);
      }
    }
    // Envio sem o código de barras (cliente antigo ou envio parcial): usa o do cadastro do produto, para não apagar o código salvo.
    if ($produtoId > 0 && trim((string)($json['coroa_codigo_barras'] ?? '')) === '') {
      try {
        $prodCoroa = fetchOne($pdo, 'SELECT codigo_barras FROM est_produto WHERE id = :id LIMIT 1', [':id' => $produtoId]);
        $cb = trim((string)($prodCoroa['codigo_barras'] ?? ''));
        if ($cb !== '') $json['coroa_codigo_barras'] = $cb;
      } catch (Throwable $e) {
        // sem a tabela de produtos: segue como veio
      }
    }
    return;
  }

  if (count($rawItens) < 1 || count($rawItens) > 20) {
    responder(['erro' => true, 'msg' => 'Coroa de Flores: informe de 1 a 20 coroas.'], 400);
  }

  $normalizados = [];
  $necessarioPorProdutoDeposito = [];

  // Cache somente desta requisição: evita consultar repetidamente o mesmo modelo/depósito
  // quando um pedido possui várias coroas iguais. Não persiste entre chamadas da API.
  $produtoCache = [];
  $depositoCache = [];

  foreach (array_values($rawItens) as $index => $item) {
    if (!is_array($item)) {
      responder(['erro' => true, 'msg' => 'Coroa ' . ($index + 1) . ': item inválido.'], 400);
    }

    $tipo = strtolower(trim((string)($item['tipo_coroa'] ?? '')));
    if (!in_array($tipo, ['natural', 'artificial'], true)) {
      responder(['erro' => true, 'msg' => 'Coroa ' . ($index + 1) . ': selecione Natural ou Artificial.'], 400);
    }

    $produtoId = (int)($item['produto_id'] ?? 0);
    $frase = trim((string)($item['frase'] ?? ''));
    if ($produtoId <= 0) {
      responder(['erro' => true, 'msg' => 'Coroa ' . ($index + 1) . ': selecione o modelo.'], 400);
    }
    if ($frase === '') {
      responder(['erro' => true, 'msg' => 'Coroa ' . ($index + 1) . ': preencha a frase.'], 400);
    }

    if (!array_key_exists($produtoId, $produtoCache)) {
      $produtoCache[$produtoId] = fetchOne($pdo,
        "SELECT p.id, p.nome, p.codigo_barras, p.valor, p.foto_url, p.ativo, c.nome AS categoria_nome
           FROM est_produto p
           LEFT JOIN est_categoria c ON c.id = p.categoria_id
          WHERE p.id = :id
          LIMIT 1",
        [':id' => $produtoId]
      );
    }
    $produto = $produtoCache[$produtoId];

    if (!$produto || (int)($produto['ativo'] ?? 0) !== 1) {
      responder(['erro' => true, 'msg' => 'Coroa ' . ($index + 1) . ': modelo indisponível.'], 400);
    }

    $categoria = _normalize_key((string)($produto['categoria_nome'] ?? ''));
    $esperada = $tipo === 'natural' ? _normalize_key('COROAS NATURAIS') : _normalize_key('COROAS ARTIFICIAIS');
    if ($categoria !== $esperada) {
      responder(['erro' => true, 'msg' => 'Coroa ' . ($index + 1) . ': o modelo não pertence ao tipo selecionado.'], 400);
    }

    $depositoNome = null;
    if ($tipo === 'artificial') {
      $dep = norm_upper((string)($item['deposito_nome'] ?? ''));
      if (!in_array($dep, ['MEMORIAL', 'FUNERARIA'], true)) {
        responder(['erro' => true, 'msg' => 'Coroa ' . ($index + 1) . ': selecione MEMORIAL ou FUNERARIA.'], 400);
      }

      if (!array_key_exists($dep, $depositoCache)) {
        $depositoCache[$dep] = fetchOne($pdo,
          'SELECT id, nome FROM est_deposito WHERE UPPER(TRIM(nome)) = :nome LIMIT 1',
          [':nome' => $dep]
        );
      }
      $deposito = $depositoCache[$dep];
      if (!$deposito || (int)($deposito['id'] ?? 0) <= 0) {
        responder(['erro' => true, 'msg' => 'Coroa ' . ($index + 1) . ': depósito não cadastrado no estoque.'], 400);
      }
      $depositoNome = norm_upper((string)$deposito['nome']);
      $key = $produtoId . '|' . (int)$deposito['id'];
      if (!isset($necessarioPorProdutoDeposito[$key])) {
        $necessarioPorProdutoDeposito[$key] = [
          'produto_id' => $produtoId,
          'deposito_id' => (int)$deposito['id'],
          'deposito_nome' => $depositoNome,
          'modelo' => (string)$produto['nome'],
          'quantidade' => 0,
        ];
      }
      $necessarioPorProdutoDeposito[$key]['quantidade']++;
    }

    $normalizados[] = [
      'ordem' => $index + 1,
      'tipo_coroa' => $tipo,
      'produto_id' => $produtoId,
      'modelo_coroa' => trim((string)$produto['nome']),
      'codigo_barras' => trim((string)($produto['codigo_barras'] ?? '')),
      'deposito_nome' => $depositoNome,
      'frase' => $frase,
      'valor' => max(0, (float)($produto['valor'] ?? 0)),
      'foto_produto_url' => trim((string)($produto['foto_url'] ?? '')) ?: null,
    ];
  }

  // A checagem agrupada evita aceitar duas coroas do mesmo produto quando existe somente 1 unidade.
  // 16/10/2026: na edição, a coroa que JÁ SAIU do estoque para este atendimento (baixa do Corpo Pronto, não estornada)
  // conta como disponível para ele. Sem isso, a própria baixa zerava o saldo e o registro não salvava mais nada.
  $atendimentoEditado = (($json['acao'] ?? null) === 'editar') ? (int)($json['id'] ?? 0) : 0;
  foreach ($necessarioPorProdutoDeposito as $necessario) {
    $saldo = fetchOne($pdo,
      'SELECT quantidade FROM est_saldo WHERE produto_id = :p AND deposito_id = :d LIMIT 1',
      [':p' => $necessario['produto_id'], ':d' => $necessario['deposito_id']]
    );
    $disponivel = (int)($saldo['quantidade'] ?? 0);
    if ($atendimentoEditado > 0 && $disponivel < (int)$necessario['quantidade']) {
      try {
        $jaSaiu = fetchOne($pdo,
          "SELECT COALESCE(SUM(quantidade), 0) AS qtd
             FROM est_movimento
            WHERE tipo = 'SAIDA'
              AND produto_id = :p
              AND deposito_origem_id = :d
              AND destino_texto = :dest
              AND estornado_em IS NULL",
          [':p' => $necessario['produto_id'], ':d' => $necessario['deposito_id'], ':dest' => 'Atendimento #' . $atendimentoEditado]
        );
        $disponivel += (int)($jaSaiu['qtd'] ?? 0);
      } catch (Throwable $e) {
        // sem as colunas de estorno: mantém a checagem como era
      }
    }
    if ($disponivel < (int)$necessario['quantidade']) {
      responder([
        'erro' => true,
        'msg' => sprintf(
          'Coroa Artificial %s: saldo insuficiente em %s. Disponível: %d; solicitado: %d.',
          $necessario['modelo'],
          $necessario['deposito_nome'],
          $disponivel,
          (int)$necessario['quantidade']
        )
      ], 409);
    }
  }

  $json['coroas_itens'] = $normalizados;
  $primeiro = $normalizados[0] ?? null;
  $json['coroa_tipo'] = ($primeiro['tipo_coroa'] ?? '') === 'artificial' ? 'Artificial' : 'Natural';
  $json['coroa_produto_id'] = (int)($primeiro['produto_id'] ?? 0);
  $json['coroa_modelo'] = (string)($primeiro['modelo_coroa'] ?? '');
  if (count($normalizados) > 1 && $json['coroa_modelo'] !== '') {
    $json['coroa_modelo'] .= ' +' . (count($normalizados) - 1);
  }
  $json['coroa_codigo_barras'] = asNullIfEmpty($primeiro['codigo_barras'] ?? null);
  $json['coroa_deposito_nome'] = asNullIfEmpty($primeiro['deposito_nome'] ?? null);
}

function validar_metas_itens_ou_erro(array $json): void {
  // URNA
  $urnaTxt = trim((string)($json['urna'] ?? ''));
  $urnaPid = (int)($json['urna_produto_id'] ?? 0);
  if ($urnaTxt !== '' && $urnaPid <= 0) {
    responder(['erro' => true, 'msg' => 'Selecione uma urna da lista (produto do estoque).'], 400);
  }

  // ROUPA
  $roupaTxt = trim((string)($json['roupa'] ?? ''));
  $flagRoupaPropria = is_true($json['roupa_propria'] ?? null);

  // Só valida roupa se NÃO for roupa própria
  if (!$flagRoupaPropria) {
    // se informou roupa e não é "roupa própria", exige produto e depósito
    if ($roupaTxt !== '' && !is_roupa_propria($roupaTxt)) {
      $roupaPid = (int)($json['roupa_produto_id'] ?? 0);
      if ($roupaPid <= 0) {
        responder(['erro' => true, 'msg' => 'Selecione uma roupa da lista (produto do estoque) ou marque ROUPA PRÓPRIA.'], 400);
      }
      validar_deposito_em_lista_ou_erro(
        'ROUPA',
        ($json['roupa_deposito_nome'] ?? ''),
        ['ARMARIO SANDRO', 'ARMARIO ILDO', 'FUNERARIA']
      );
    }
  }

  // INVOL
  if (is_sim($json['invol'] ?? '')) {
    $involPid = (int)($json['invol_produto_id'] ?? 0);
    if ($involPid <= 0) {
      responder(['erro' => true, 'msg' => 'Selecione um INVOL da lista (produto do estoque).'], 400);
    }
    validar_deposito_em_lista_ou_erro(
      'INVOL',
      ($json['invol_deposito_nome'] ?? ''),
      ['ARMARIO SANDRO', 'ARMARIO ILDO']
    );
  }
  
    // VÉU
  if (is_sim($json['veu'] ?? '')) {
    $veuPid = (int)($json['veu_produto_id'] ?? 0);
    if ($veuPid <= 0) {
      responder(['erro' => true, 'msg' => 'Selecione um VÉU da lista (produto do estoque).'], 400);
    }
    validar_deposito_em_lista_ou_erro(
      'VÉU',
      ($json['veu_deposito_nome'] ?? ''),
      ['ARMARIO SANDRO', 'ARMARIO ILDO', 'FUNERARIA']
    );
  }

  // CORDÃO
  if (is_sim($json['cordao'] ?? '')) {
    $cordaoPid = (int)($json['cordao_produto_id'] ?? 0);
    if ($cordaoPid <= 0) {
      responder(['erro' => true, 'msg' => 'Selecione um CORDÃO da lista (produto do estoque).'], 400);
    }
    validar_deposito_em_lista_ou_erro(
      'CORDÃO',
      ($json['cordao_deposito_nome'] ?? ''),
      ['ARMARIO SANDRO', 'ARMARIO ILDO', 'FUNERARIA']
    );
  }


  // INSUMOS TANATO (arrumacao_json)
  $rawArr = $json['arrumacao_json'] ?? null;
  if (is_string($rawArr) && trim($rawArr) !== '') {
    $arr = json_decode($rawArr, true);
    if (is_array($arr)) {
      $itens = $arr['itens'] ?? $arr['items'] ?? null;
      if (is_array($itens) && count($itens) > 0) {
        validar_deposito_em_lista_ou_erro(
          'INSUMOS TANATOPRAXIA',
          ($arr['deposito_nome'] ?? $arr['deposito'] ?? ''),
          ['ARMARIO SANDRO', 'ARMARIO ILDO']
        );
        foreach ($itens as $it) {
          if (!is_array($it)) continue;
          $pid = (int)($it['produto_id'] ?? 0);
          $qtd = (int)($it['qtd'] ?? 0);
          if ($pid <= 0 || $qtd <= 0) {
            responder(['erro' => true, 'msg' => 'Insumos inválidos: informe produto_id e quantidade (>=1).'], 400);
          }
        }
      }
    }
  }
}

function normalizar_validar_velorio_ou_erro(array &$json, bool $exigirOnline = true): void {
  $temSala = array_key_exists('sala_velorio', $json);
  $temOnline = array_key_exists('velorio_online', $json);

  // Se nenhum dos campos veio no payload, não mexe.
  if (!$temSala && !$temOnline) return;

  $salaRaw = trim((string)($json['sala_velorio'] ?? ''));
  $onlineRaw = trim((string)($json['velorio_online'] ?? ''));

  // Sem sala marcada, velório online não deve ser salvo.
  if ($salaRaw === '') {
    $json['sala_velorio'] = null;
    $json['velorio_online'] = null;
    return;
  }

  // Normaliza variações comuns para o padrão gravado no banco.
  $salaKey = strtolower($salaRaw);
  $salaKey = str_replace(['sala-', 'sala_'], 'sala ', $salaKey);
  $salaKey = preg_replace('/\s+/u', ' ', $salaKey) ?: $salaKey;

  $salaMap = [
    'sala 1'  => 'Sala 01',
    'sala 01' => 'Sala 01',
    '01'      => 'Sala 01',
    '1'       => 'Sala 01',

    'sala 2'  => 'Sala 02',
    'sala 02' => 'Sala 02',
    '02'      => 'Sala 02',
    '2'       => 'Sala 02',

    'sala 3'  => 'Sala 03',
    'sala 03' => 'Sala 03',
    '03'      => 'Sala 03',
    '3'       => 'Sala 03',
  ];

  if (!isset($salaMap[$salaKey])) {
    responder([
      'erro' => true,
      'msg'  => 'Sala do velório inválida. Escolha Sala 01, Sala 02 ou Sala 03.'
    ], 400);
  }

  $json['sala_velorio'] = $salaMap[$salaKey];

  $onlineKey = strtolower($onlineRaw);
  $onlineKey = str_replace(['ã', 'á', 'à', 'â'], 'a', $onlineKey);
  $onlineKey = trim($onlineKey);

  if (in_array($onlineKey, ['sim', 's', '1', 'true'], true)) {
    $json['velorio_online'] = 'Sim';
    return;
  }

  if (in_array($onlineKey, ['nao', 'não', 'n', '0', 'false'], true)) {
    $json['velorio_online'] = 'Não';
    return;
  }

  // Antes de Corpo na Clínica, sala pode ser salva sem travar Velório Online.
  if (!$exigirOnline) {
    $json['velorio_online'] = null;
    return;
  }

  responder([
    'erro' => true,
    'msg'  => 'Selecione Sim ou Não para Velório Online.'
  ], 400);
}





// ===== Fotos obrigatórias das ações (fase06 / fase08) =====
function foto_action_config_for_status($status): ?array {
  $code = normalize_status_code($status) ?? strtolower(trim((string)$status));

  if ($code === 'fase06') {
    return [
      'tipo' => 'fim_ornamentacao',
      'label' => 'Fim da Ornamentação',
      'url_col' => 'foto_fim_ornamentacao_url',
      'path_col' => 'foto_fim_ornamentacao_path',
      'em_col' => 'foto_fim_ornamentacao_em',
      'usuario_col' => 'foto_fim_ornamentacao_usuario',
      'operation_col' => 'foto_fim_ornamentacao_operation_id',
      'prefix' => 'fim_ornamentacao',
    ];
  }

  if ($code === 'fase08') {
    return [
      'tipo' => 'entrega_corpo',
      'label' => 'Entrega de Corpo',
      'url_col' => 'foto_entrega_corpo_url',
      'path_col' => 'foto_entrega_corpo_path',
      'em_col' => 'foto_entrega_corpo_em',
      'usuario_col' => 'foto_entrega_corpo_usuario',
      'operation_col' => 'foto_entrega_corpo_operation_id',
      'prefix' => 'entrega_corpo',
    ];
  }

  return null;
}

function foto_action_config_for_tipo($tipo): ?array {
  $tipo = strtolower(trim((string)$tipo));
  $tipo = str_replace(['-', ' '], '_', $tipo);

  if (in_array($tipo, ['fim_ornamentacao', 'ornamentacao', 'fase06'], true)) {
    return foto_action_config_for_status('fase06');
  }

  if (in_array($tipo, ['entrega_corpo', 'entrega', 'fase08'], true)) {
    return foto_action_config_for_status('fase08');
  }

  return null;
}

function decode_image_base64_ou_erro($base64): array {
  if (!$base64 || !is_string($base64)) {
    responder(['erro' => true, 'msg' => 'Foto não enviada. Abra a câmera, tire a foto e salve.'], 400);
  }

  $mime = 'image/jpeg';
  $ext  = 'jpg';
  $raw  = trim($base64);

  if (preg_match('/^data:(image\/(png|jpe?g|webp));base64,(.+)$/i', $raw, $m)) {
    $mime = strtolower($m[1]);
    $raw = $m[3];

    if ($mime === 'image/png') $ext = 'png';
    elseif ($mime === 'image/webp') $ext = 'webp';
    else $ext = 'jpg';
  }

  $raw = preg_replace('/\s+/', '', $raw);
  $bin = base64_decode($raw, true);
  if ($bin === false || strlen($bin) < 100) {
    responder(['erro' => true, 'msg' => 'Foto inválida. Tire a foto novamente.'], 400);
  }

  // limite de segurança: 12 MB após decodificar
  if (strlen($bin) > 12 * 1024 * 1024) {
    responder(['erro' => true, 'msg' => 'Foto muito grande. Tire uma foto menor e tente novamente.'], 400);
  }

  if (function_exists('finfo_open')) {
    $fi = finfo_open(FILEINFO_MIME_TYPE);
    $detected = $fi ? finfo_buffer($fi, $bin) : null;
    if ($fi) finfo_close($fi);

    if ($detected && !in_array($detected, ['image/jpeg', 'image/png', 'image/webp'], true)) {
      responder(['erro' => true, 'msg' => 'Arquivo enviado não é uma imagem válida.'], 400);
    }

    if ($detected === 'image/png') { $mime = 'image/png'; $ext = 'png'; }
    elseif ($detected === 'image/webp') { $mime = 'image/webp'; $ext = 'webp'; }
    elseif ($detected === 'image/jpeg') { $mime = 'image/jpeg'; $ext = 'jpg'; }
  }

  return [$bin, $ext, $mime];
}

function ensure_foto_columns_or_erro(PDO $pdo, string $tbl, array $cfg): void {
  foreach (['url_col', 'path_col', 'em_col', 'usuario_col'] as $k) {
    $col = $cfg[$k] ?? '';
    if (!$col || !column_exists($pdo, $tbl, $col)) {
      responder([
        'erro' => true,
        'msg' => 'Colunas de foto não encontradas na tabela ' . $tbl . '. Rode o ALTER TABLE antes de usar esta ação.'
      ], 500);
    }
  }
}

function registro_tem_foto_acao(PDO $pdo, string $tbl, int $id, array $cfg): bool {
  if (!column_exists($pdo, $tbl, $cfg['url_col'])) return false;

  $sql = "SELECT {$cfg['url_col']} AS foto_url FROM {$tbl} WHERE id = :id LIMIT 1";
  $st = $pdo->prepare($sql);
  $st->execute([':id' => $id]);
  $url = trim((string)($st->fetchColumn() ?: ''));
  return $url !== '';
}

function normalizar_operation_id($value): string {
  $op = trim((string)($value ?? ''));
  if ($op === '') return '';
  $op = preg_replace('/[^a-zA-Z0-9._:\-]/', '', $op) ?: '';
  return substr($op, 0, 80);
}

function origem_operacao($value): string {
  return strtolower(trim((string)$value)) === 'offline' ? 'offline' : 'online';
}

function parse_client_datetime_mysql($value): ?string {
  $raw = trim((string)($value ?? ''));
  if ($raw === '') return null;

  try {
    $tz = new DateTimeZone(getenv('PAI_TIMEZONE') ?: 'America/Sao_Paulo');
    $dt = new DateTimeImmutable($raw);
    $now = new DateTimeImmutable('now', $tz);
    $local = $dt->setTimezone($tz);

    // Proteção simples contra relógios muito fora da realidade.
    if ($local > $now->modify('+6 hours')) return null;
    if ($local < $now->modify('-30 days')) return null;

    return $local->format('Y-m-d H:i:s');
  } catch (Throwable $e) {
    return null;
  }
}

function meta_operacao_do_payload(array $json): array {
  $origem = origem_operacao($json['origem'] ?? 'online');
  return [
    'operation_id' => normalizar_operation_id($json['operation_id'] ?? ''),
    'origem' => $origem,
    // Horário vindo do cliente só é autoridade para ação registrada offline.
    'ocorreu_em' => $origem === 'offline' ? parse_client_datetime_mysql($json['ocorreu_em'] ?? null) : null,
    'device_id' => substr(trim((string)($json['device_id'] ?? '')), 0, 120),
    'usuario_id' => isset($json['usuario_id']) && is_numeric($json['usuario_id']) ? (int)$json['usuario_id'] : null,
    'clock_offset_ms' => isset($json['clock_offset_ms']) && is_numeric($json['clock_offset_ms'])
      ? max(-86400000, min(86400000, (int)$json['clock_offset_ms']))
      : null,
  ];
}

function foto_operacao_existente(PDO $pdo, string $tbl, int $id, array $cfg, string $operationId): ?array {
  $opCol = (string)($cfg['operation_col'] ?? '');
  if ($operationId === '' || $opCol === '' || !column_exists($pdo, $tbl, $opCol)) return null;
  if (!column_exists($pdo, $tbl, $cfg['url_col']) || !column_exists($pdo, $tbl, $cfg['path_col'])) return null;

  $st = $pdo->prepare("SELECT {$cfg['url_col']} AS url, {$cfg['path_col']} AS path, {$opCol} AS operation_id FROM {$tbl} WHERE id = :id LIMIT 1");
  $st->execute([':id' => $id]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  if (!$row) return null;
  return trim((string)($row['operation_id'] ?? '')) === $operationId ? $row : null;
}

function salvar_foto_acao(PDO $pdo, string $tbl, int $id, array $cfg, string $base64, string $agente, array $meta = []): array {
  ensure_foto_columns_or_erro($pdo, $tbl, $cfg);

  [$bin, $ext] = decode_image_base64_ou_erro($base64);

  $dir = __DIR__ . '/uploads/acoes_fotos/';
  if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
    responder(['erro' => true, 'msg' => 'Falha ao criar pasta de fotos das ações.'], 500);
  }

  $safePrefix = preg_replace('/[^a-z0-9_\-]/i', '_', (string)$cfg['prefix']);
  $fileName = $safePrefix . '_' . $id . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
  $filePath = $dir . $fileName;

  if (@file_put_contents($filePath, $bin) === false) {
    responder(['erro' => true, 'msg' => 'Falha ao salvar a foto no servidor.'], 500);
  }

  $publicUrl = '/uploads/acoes_fotos/' . $fileName;
  $relativePath = 'uploads/acoes_fotos/' . $fileName;
  $urlCol = $cfg['url_col'];
  $pathCol = $cfg['path_col'];
  $emCol = $cfg['em_col'];
  $usuarioCol = $cfg['usuario_col'];
  $opCol = (string)($cfg['operation_col'] ?? '');
  $ocorreuEm = parse_client_datetime_mysql($meta['ocorreu_em'] ?? null);
  $operationId = normalizar_operation_id($meta['operation_id'] ?? '');

  $sets = ["{$urlCol} = :url", "{$pathCol} = :path", "{$emCol} = :foto_em", "{$usuarioCol} = :usuario"];
  $params = [
    ':url' => $publicUrl,
    ':path' => $relativePath,
    ':foto_em' => $ocorreuEm ?: date('Y-m-d H:i:s'),
    ':usuario' => $agente,
    ':id' => $id,
  ];
  if ($operationId !== '' && $opCol !== '' && column_exists($pdo, $tbl, $opCol)) {
    $sets[] = "{$opCol} = :photo_operation_id";
    $params[':photo_operation_id'] = $operationId;
  }

  $st = $pdo->prepare("UPDATE {$tbl} SET " . implode(', ', $sets) . " WHERE id = :id");
  $st->execute($params);

  return ['url' => $publicUrl, 'path' => $relativePath];
}

// Upload multipart extremamente leve para fase06/fase08.
function salvar_foto_acao_upload(PDO $pdo, string $tbl, int $id, array $cfg, array $upload, string $agente, array $meta = []): array {
  ensure_foto_columns_or_erro($pdo, $tbl, $cfg);

  $error = (int)($upload['error'] ?? UPLOAD_ERR_NO_FILE);
  if ($error !== UPLOAD_ERR_OK) {
    $msg = 'Falha ao receber a foto.';
    if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) $msg = 'A foto excedeu o limite de upload do servidor.';
    elseif ($error === UPLOAD_ERR_PARTIAL) $msg = 'O envio da foto foi interrompido. Tente novamente.';
    elseif ($error === UPLOAD_ERR_NO_FILE) $msg = 'Foto não enviada. Abra a câmera, tire a foto e salve.';
    responder(['erro' => true, 'msg' => $msg], 400);
  }

  $tmp = (string)($upload['tmp_name'] ?? '');
  if ($tmp === '' || !is_uploaded_file($tmp)) responder(['erro' => true, 'msg' => 'Upload da foto inválido. Tente novamente.'], 400);

  $size = (int)($upload['size'] ?? 0);
  if ($size <= 0) {
    $realSize = @filesize($tmp);
    $size = $realSize !== false ? (int)$realSize : 0;
  }
  $maxBytes = 800 * 1024;
  if ($size < 100 || $size > $maxBytes) {
    responder(['erro' => true, 'msg' => $size > $maxBytes
      ? 'Foto acima do limite seguro. Tire novamente para que o sistema faça a otimização.'
      : 'Foto inválida. Tire a foto novamente.'], 400);
  }

  $mime = '';
  if (function_exists('finfo_open')) {
    $fi = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $fi ? (string)finfo_file($fi, $tmp) : '';
    if ($fi) finfo_close($fi);
  }
  if ($mime === '') {
    $imgInfo = @getimagesize($tmp);
    $mime = is_array($imgInfo) ? (string)($imgInfo['mime'] ?? '') : '';
  }
  if ($mime !== 'image/jpeg') responder(['erro' => true, 'msg' => 'Formato de foto inválido. O aplicativo deve enviar JPEG otimizado.'], 400);

  $dim = @getimagesize($tmp);
  if (!is_array($dim)) responder(['erro' => true, 'msg' => 'Arquivo enviado não é uma imagem válida.'], 400);
  $width = (int)($dim[0] ?? 0);
  $height = (int)($dim[1] ?? 0);
  if ($width <= 0 || $height <= 0) responder(['erro' => true, 'msg' => 'Dimensões da foto inválidas.'], 400);
  if ($width > 1400 || $height > 1400) responder(['erro' => true, 'msg' => 'Resolução da foto acima do limite seguro. Tire novamente pelo botão Abrir câmera.'], 400);

  $dir = __DIR__ . '/uploads/acoes_fotos/';
  if (!is_dir($dir) && !@mkdir($dir, 0775, true)) responder(['erro' => true, 'msg' => 'Falha ao criar pasta de fotos das ações.'], 500);

  $safePrefix = preg_replace('/[^a-z0-9_\-]/i', '_', (string)$cfg['prefix']);
  $fileName = $safePrefix . '_' . $id . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.jpg';
  $filePath = $dir . $fileName;
  if (!@move_uploaded_file($tmp, $filePath)) responder(['erro' => true, 'msg' => 'Falha ao salvar a foto no servidor.'], 500);
  @chmod($filePath, 0644);

  $publicUrl = '/uploads/acoes_fotos/' . $fileName;
  $relativePath = 'uploads/acoes_fotos/' . $fileName;
  $urlCol = $cfg['url_col'];
  $pathCol = $cfg['path_col'];
  $emCol = $cfg['em_col'];
  $usuarioCol = $cfg['usuario_col'];
  $opCol = (string)($cfg['operation_col'] ?? '');
  $ocorreuEm = parse_client_datetime_mysql($meta['ocorreu_em'] ?? null);
  $operationId = normalizar_operation_id($meta['operation_id'] ?? '');

  $sets = ["{$urlCol} = :url", "{$pathCol} = :path", "{$emCol} = :foto_em", "{$usuarioCol} = :usuario"];
  $params = [
    ':url' => $publicUrl,
    ':path' => $relativePath,
    ':foto_em' => $ocorreuEm ?: date('Y-m-d H:i:s'),
    ':usuario' => $agente,
    ':id' => $id,
  ];
  if ($operationId !== '' && $opCol !== '' && column_exists($pdo, $tbl, $opCol)) {
    $sets[] = "{$opCol} = :photo_operation_id";
    $params[':photo_operation_id'] = $operationId;
  }

  $st = $pdo->prepare("UPDATE {$tbl} SET " . implode(', ', $sets) . " WHERE id = :id");
  $st->execute($params);

  return [
    'url' => $publicUrl,
    'path' => $relativePath,
    'bytes' => $size,
    'width' => $width,
    'height' => $height,
    'mime' => $mime,
  ];
}

// ===== Foto do falecido (primeira etapa do atendimento) =====
// Recebe foto_falecido_base64 do front, salva o arquivo físico e grava o caminho em foto_falecido.
function salvar_foto_falecido_payload(PDO $pdo, string $tbl, array &$json, ?int $id = null): ?array {
  $base64 = $json['foto_falecido_base64'] ?? null;

  // Compatibilidade: se o front enviar a foto em outro nome, também aceita.
  if (!$base64) {
    $base64 = $json['foto_falecido_foto_base64'] ?? ($json['foto_falecido_arquivo'] ?? null);
  }

  if (!$base64 || !is_string($base64) || trim($base64) === '') {
    return null;
  }

  if (!column_exists($pdo, $tbl, 'foto_falecido')) {
    responder([
      'erro' => true,
      'msg' => 'A coluna foto_falecido não existe na tabela ' . $tbl . '. Rode o ALTER TABLE antes de salvar a foto do falecido.'
    ], 500);
  }

  [$bin, $ext, $mime] = decode_image_base64_ou_erro($base64);

  $dir = __DIR__ . '/uploads/falecidos/';
  if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
    responder(['erro' => true, 'msg' => 'Falha ao criar pasta de fotos dos falecidos.'], 500);
  }

  $idPart = $id && $id > 0 ? (string)$id : 'novo';
  $fileName = 'falecido_' . $idPart . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
  $filePath = $dir . $fileName;

  if (@file_put_contents($filePath, $bin) === false) {
    responder(['erro' => true, 'msg' => 'Falha ao salvar a foto do falecido no servidor.'], 500);
  }

  $publicUrl = '/uploads/falecidos/' . $fileName;
  $relativePath = 'uploads/falecidos/' . $fileName;

  // O banco recebe somente o caminho/URL final.
  $json['foto_falecido'] = $publicUrl;

  // Remove payload pesado para não salvar base64 em histórico/log.
  unset(
    $json['foto_falecido_base64'],
    $json['foto_falecido_nome'],
    $json['foto_falecido_tipo'],
    $json['foto_falecido_tamanho'],
    $json['foto_falecido_foto_base64'],
    $json['foto_falecido_arquivo']
  );

  return [
    'url' => $publicUrl,
    'path' => $relativePath,
    'mime' => $mime,
  ];
}

function limpar_payload_foto_falecido_para_historico(array $json): array {
  unset(
    $json['foto_falecido_base64'],
    $json['foto_falecido_nome'],
    $json['foto_falecido_tipo'],
    $json['foto_falecido_tamanho'],
    $json['foto_falecido_foto_base64'],
    $json['foto_falecido_arquivo']
  );
  return $json;
}

function historico_por_operation_id(PDO $pdo, string $operationId): ?array {
  if ($operationId === '' || !table_exists($pdo, 'historico_sepultamentos') || !column_exists($pdo, 'historico_sepultamentos', 'operation_id')) return null;
  $st = $pdo->prepare("SELECT id, sepultamento_id, status_novo, datahora FROM historico_sepultamentos WHERE operation_id = :op LIMIT 1");
  $st->execute([':op' => $operationId]);
  return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}

function registrarHistorico($pdo, $sepultamento_id, $falecido, $usuario, $acao, $status_anterior = null, $status_novo = null, $detalhes = null, array $meta = []) {
  if (!table_exists($pdo, 'historico_sepultamentos')) return null;

  $operationId = normalizar_operation_id($meta['operation_id'] ?? '');
  if ($operationId !== '') {
    $existing = historico_por_operation_id($pdo, $operationId);
    if ($existing) return (int)($existing['id'] ?? 0);
  }

  $datahora = parse_client_datetime_mysql($meta['ocorreu_em'] ?? null) ?: date('Y-m-d H:i:s');
  $cols = ['sepultamento_id','falecido','usuario','acao','status_anterior','status_novo','detalhes','datahora'];
  $vals = [':sepultamento_id',':falecido',':usuario',':acao',':status_anterior',':status_novo',':detalhes',':datahora'];
  $params = [
    ':sepultamento_id' => $sepultamento_id,
    ':falecido' => $falecido,
    ':usuario' => $usuario,
    ':acao' => $acao,
    ':status_anterior' => $status_anterior,
    ':status_novo' => $status_novo,
    ':detalhes' => $detalhes,
    ':datahora' => $datahora,
  ];

  $optional = [
    'operation_id' => $operationId !== '' ? $operationId : null,
    'usuario_id' => isset($meta['usuario_id']) && is_numeric($meta['usuario_id']) ? (int)$meta['usuario_id'] : null,
    'origem' => origem_operacao($meta['origem'] ?? 'online'),
    'device_id' => trim((string)($meta['device_id'] ?? '')) ?: null,
    'sincronizado_em' => date('Y-m-d H:i:s'),
    'clock_offset_ms' => isset($meta['clock_offset_ms']) && is_numeric($meta['clock_offset_ms']) ? (int)$meta['clock_offset_ms'] : null,
  ];

  foreach ($optional as $col => $value) {
    if (!column_exists($pdo, 'historico_sepultamentos', $col)) continue;
    $cols[] = $col;
    $ph = ':' . $col;
    $vals[] = $ph;
    $params[$ph] = $value;
  }

  try {
    $sql = "INSERT INTO historico_sepultamentos (" . implode(',', $cols) . ") VALUES (" . implode(',', $vals) . ")";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (int)$pdo->lastInsertId();
  } catch (PDOException $e) {
    // Corrida de sincronização: se a operação já entrou, tratamos como sucesso idempotente.
    if ($operationId !== '' && (string)$e->getCode() === '23000') {
      $existing = historico_por_operation_id($pdo, $operationId);
      if ($existing) return (int)($existing['id'] ?? 0);
    }
    throw $e;
  }
}

// OneSignal (ações)
function enviarNotificacaoAcao($usuario, $acao, $falecido = '') {
  global $onesignal_app_id, $onesignal_api_key;

  if (!$onesignal_app_id || !$onesignal_api_key) return;

  $acoes_map = [
    "fase01" => "Removendo",
    "fase02" => "Aguardando Procedimento",
    "fase03" => "Preparando",
    "fase04" => "Aguardando Ornamentação",
    "fase05" => "Ornamentando",
    "fase06" => "Fim da Ornamentação",
    "fase12" => "Corpo Pronto",
    "fase07" => "Transportando Óbito Para Velório",
    "fase08" => "Velando",
    "fase09" => "Transportando Óbito Para o Sepultamento",
    "fase10" => "Sepultamento Concluído",
    "fase11" => "Material Recolhido",
    "material_recolhido" => "Material Recolhido",
  ];

  $acao_humana = $acoes_map[$acao] ?? ucfirst((string)$acao);

  $title = "🏪 ATENDIMENTO FUNERÁRIO";
  $body  = "$usuario: $acao_humana";
  if ($falecido) $body .= " ({$falecido})";

  // URL que será aberta ao clicar na notificação
  $clickUrl = 'https://pai.planoassistencialintegrado.com.br/quadro-acompanhamento';

  $fields = [
    'app_id' => $onesignal_app_id,
    'included_segments' => ['All'],
    'headings' => ['en' => $title, 'pt' => $title],
    'contents' => ['en' => $body, 'pt' => $body],

    // Faz o clique abrir a página correta dentro do PWA
    'url' => $clickUrl,

    // Dados extras opcionais para o app/Service Worker, caso você use depois
    'data' => [
      'rota' => '/quadro-acompanhamento',
      'tipo' => 'acao',
      'acao' => $acao,
      'falecido' => $falecido,
    ],
  ];

  $ch = curl_init();
  configurar_curl_externo($ch);
  curl_setopt($ch, CURLOPT_URL, "https://onesignal.com/api/v1/notifications");
  curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json; charset=utf-8',
    'Authorization: Basic ' . $onesignal_api_key
  ]);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($fields));
  curl_setopt($ch, CURLOPT_POST, true);
  $resp = curl_exec($ch);
  $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  @file_put_contents(
    __DIR__ . '/onesignal_debug.log',
    date('Y-m-d H:i:s') . " ACAO:$acao_humana | USER:$usuario | URL:$clickUrl | HTTP:$http_code\n$resp\n\n",
    FILE_APPEND
  );
}

function enviarNotificacaoNovoAtendimento($usuario, $falecido = '') {
  global $onesignal_app_id, $onesignal_api_key;
  if (!$onesignal_app_id || !$onesignal_api_key) return;

  $title = "🏪 ATENDIMENTO FUNERÁRIO";
  $body  = "$usuario adicionou um novo atendimento no quadro de sepultamento.";
  if ($falecido) $body .= " ({$falecido})";

  // URL que será aberta ao clicar na notificação
  $clickUrl = 'https://pai.planoassistencialintegrado.com.br/quadro-acompanhamento';

  $fields = [
    'app_id' => $onesignal_app_id,
    'included_segments' => ['All'],
    'headings' => ['en' => $title, 'pt' => $title],
    'contents' => ['en' => $body, 'pt' => $body],

    // Faz o clique abrir a página correta dentro do PWA
    'url' => $clickUrl,

    // Dados extras opcionais para o app/Service Worker, caso você use depois
    'data' => [
      'rota' => '/quadro-acompanhamento',
      'tipo' => 'novo_atendimento',
      'falecido' => $falecido,
    ],
  ];

  $ch = curl_init();
  configurar_curl_externo($ch);
  curl_setopt($ch, CURLOPT_URL, "https://onesignal.com/api/v1/notifications");
  curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json; charset=utf-8',
    'Authorization: Basic ' . $onesignal_api_key
  ]);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($fields));
  curl_setopt($ch, CURLOPT_POST, true);
  $resp = curl_exec($ch);
  $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  @file_put_contents(
    __DIR__ . '/onesignal_debug.log',
    date('Y-m-d H:i:s') . " NOVO ATENDIMENTO | USER:$usuario | URL:$clickUrl | HTTP:$http_code\n$resp\n\n",
    FILE_APPEND
  );
}

// 29/10/2026: grava também o número do atendimento (avisos.sepultamento_id). Com ele o avisos.php esconde a
// observação quando o atendimento sai do Quadro (antes ela ficava para sempre na tela Avisos e no sino).
function criarAviso(PDO $pdo, string $usuario, string $mensagem, ?string $falecido = null, ?int $sepultamentoId = null): void {
  if (!table_exists($pdo, 'avisos')) return; // não quebra se não existir

  $obs = trim($mensagem);
  $obs = preg_replace('/^.*observa(ç|c)ão:\s*/iu', '', $obs);
  if ($obs === '') $obs = $mensagem;

  $falecido = trim((string)($falecido ?? ''));
  $mensagemFinal = $falecido !== ''
    ? ("Falecido(a): " . titlecase($falecido) . " Obs: " . $obs)
    : $mensagem;

  if ($sepultamentoId !== null && $sepultamentoId > 0 && column_exists($pdo, 'avisos', 'sepultamento_id')) {
    $stmt = $pdo->prepare("
      INSERT INTO avisos (mensagem, criado_em, usuario, finalizado, sepultamento_id)
      VALUES (:mensagem, NOW(), :usuario, 0, :sepultamento_id)
    ");
    $stmt->execute([
      ':mensagem'        => $mensagemFinal,
      ':usuario'         => $usuario,
      ':sepultamento_id' => $sepultamentoId,
    ]);
    return;
  }

  $stmt = $pdo->prepare("
    INSERT INTO avisos (mensagem, criado_em, usuario, finalizado)
    VALUES (:mensagem, NOW(), :usuario, 0)
  ");
  $stmt->execute([
    ':mensagem' => $mensagemFinal,
    ':usuario'  => $usuario,
  ]);
}

function enviarNotificacaoObservacao(string $usuario, string $texto, ?string $falecido = null): void {
  global $onesignal_app_id, $onesignal_api_key;
  if (!$onesignal_app_id || !$onesignal_api_key) return;

  $texto = trim(preg_replace('/\s+/u', ' ', strip_tags($texto)));
  if (function_exists('mb_substr')) $texto = mb_substr($texto, 0, 240, 'UTF-8');
  else $texto = substr($texto, 0, 240);

  $falecido = trim((string)($falecido ?? ''));

  $title = "🏪 ATENDIMENTO FUNERÁRIO";
  $body = $falecido !== ''
    ? ($usuario . " adicionou uma observação - Falecido(a): " . titlecase($falecido) . ". Obs: " . $texto)
    : ($usuario . " adicionou uma observação: " . $texto);

  $clickUrl = 'https://pai.planoassistencialintegrado.com.br/quadro-acompanhamento';

$fields = [
  'app_id' => $onesignal_app_id,
  'included_segments' => ['All'],
  'headings' => ['en' => $title, 'pt' => $title],
  'contents' => ['en' => $body, 'pt' => $body],

  // Faz o clique abrir a página correta dentro do PWA
  'url' => $clickUrl,

  // Dados extras opcionais para o app/Service Worker
  'data' => [
    'rota' => '/quadro-acompanhamento',
    'tipo' => 'observacao',
    'falecido' => $falecido,
  ],
];

  $ch = curl_init();
  configurar_curl_externo($ch);
  curl_setopt($ch, CURLOPT_URL, "https://onesignal.com/api/v1/notifications");
  curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json; charset=utf-8',
    'Authorization: Basic ' . $onesignal_api_key
  ]);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($fields));
  curl_setopt($ch, CURLOPT_POST, true);
  $resp = curl_exec($ch);
  $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  @file_put_contents(
    __DIR__ . '/onesignal_debug.log',
    date('Y-m-d H:i:s') . " OBSERVACAO | USER:$usuario | HTTP:$http_code\n$resp\n\n",
    FILE_APPEND
  );
}

/**
 * Nome cadastrado (usuarios.nome) do usuário logado, pelo id (sessão ou cookie pai_uid)
 * ou pelo login (cookie pai_user). Null se não achar.
 */
function nome_cadastrado_usuario_logado(): ?string {
  $pdo = $GLOBALS['pdo'] ?? null;
  if (!($pdo instanceof PDO)) return null;

  $id = (int)($_SESSION['user_id'] ?? $_SESSION['usuario_id'] ?? $_COOKIE['pai_uid'] ?? 0);
  $login = trim((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));

  try {
    $row = null;
    if ($id > 0) {
      $st = $pdo->prepare("SELECT nome, usuario FROM usuarios WHERE id = :id LIMIT 1");
      $st->execute([':id' => $id]);
      $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
      // O id precisa ser do mesmo login do cookie (troca de usuário no mesmo aparelho).
      if ($row && $login !== '' && strcasecmp((string)($row['usuario'] ?? ''), $login) !== 0) $row = null;
    }
    if (!$row && $login !== '') {
      $st = $pdo->prepare("SELECT nome, usuario FROM usuarios WHERE usuario = :u LIMIT 1");
      $st->execute([':u' => $login]);
      $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
    }
  } catch (Throwable $e) {
    return null;
  }

  $nome = trim(preg_replace('/\s+/u', ' ', (string)($row['nome'] ?? '')) ?? '');
  return $nome !== '' ? $nome : null;
}

// ===== Sessão mínima (cookie -> session) =====
// 15/10/2026: o nome gravado nas ações e no histórico é o NOME CADASTRADO (usuarios.nome),
// não o login. Ex.: login "dimarjunior" → "Dimar Júnior". A troca é feita uma vez por sessão
// (marca usuario_nome_cadastro); sessão antiga com o login é corrigida na próxima chamada.
function garantirSessaoMinima(): void {
  $login = trim((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
  if (!empty($_SESSION['usuario_nome']) && ($_SESSION['usuario_nome_cadastro'] ?? '') === $login) return;

  $logado = !empty($_SESSION['usuario_nome']) || (($_COOKIE['pai_auth'] ?? '') === '1');
  if (!$logado) return;

  $nome = nome_cadastrado_usuario_logado();
  if ($nome !== null) {
    $_SESSION['usuario_nome'] = $nome;
    $_SESSION['usuario_nome_cadastro'] = $login;
    return;
  }

  if (empty($_SESSION['usuario_nome']) && ($_COOKIE['pai_auth'] ?? '') === '1') {
    $who = $_COOKIE['pai_user'] ?? $_COOKIE['pai_nome'] ?? $_COOKIE['user'] ?? null;
    if (!empty($who)) $_SESSION['usuario_nome'] = titlecase($who);
  }
}

function getCargo(PDO $pdo): string {
  $login = trim((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
  $nome  = trim((string)($_SESSION['usuario_nome'] ?? ''));

  $cargo = '';

  if ($login !== '' && table_exists($pdo, 'usuarios')) {
    $st = $pdo->prepare("SELECT cargo FROM usuarios WHERE usuario = :u LIMIT 1");
    $st->execute([':u' => $login]);
    $cargo = (string)($st->fetchColumn() ?: '');
  }
  if ($cargo === '' && $nome !== '' && table_exists($pdo, 'usuarios')) {
    $st = $pdo->prepare("SELECT cargo FROM usuarios WHERE nome = :n LIMIT 1");
    $st->execute([':n' => $nome]);
    $cargo = (string)($st->fetchColumn() ?: '');
  }

  return strtolower(trim($cargo));
}

function deposito_insumos_por_usuario_id(int $usuarioId): ?string {
  if ($usuarioId === 7) return 'ARMARIO SANDRO';
  if ($usuarioId === 16) return 'ARMARIO ILDO';
  return null;
}

function usuario_pode_conservacao(int $usuarioId, string $cargo): bool {
  return in_array($usuarioId, [7, 16], true)
    && strtolower(trim($cargo)) === 'tanatopraxista';
}

function getUsuarioLogin(PDO $pdo): array {
  $login = trim((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
  $nome  = trim((string)($_SESSION['usuario_nome'] ?? ''));

  $sessionId = (int)(
    $_SESSION['user_id']
    ?? $_SESSION['usuario_id']
    ?? $_COOKIE['pai_uid']
    ?? 0
  );

  $row = null;

  if ($sessionId > 0 && table_exists($pdo, 'usuarios')) {
    $st = $pdo->prepare(
      "SELECT id, usuario, cargo
         FROM usuarios
        WHERE id = :id
        LIMIT 1"
    );
    $st->execute([':id' => $sessionId]);
    $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  }

  if (!$row && $login !== '' && table_exists($pdo, 'usuarios')) {
    $st = $pdo->prepare(
      "SELECT id, usuario, cargo
         FROM usuarios
        WHERE usuario = :u
        LIMIT 1"
    );
    $st->execute([':u' => $login]);
    $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  }

  if (!$row && $nome !== '' && table_exists($pdo, 'usuarios')) {
    $st = $pdo->prepare(
      "SELECT id, usuario, cargo
         FROM usuarios
        WHERE nome = :n
        LIMIT 1"
    );
    $st->execute([':n' => $nome]);
    $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
  }

  if (!$row) {
    return [0, $login, ''];
  }

  $usuarioId = (int)($row['id'] ?? 0);
  $usuario = trim((string)($row['usuario'] ?? $login));
  $cargo = strtolower(trim((string)($row['cargo'] ?? '')));

  if ($usuarioId > 0) {
    $_SESSION['user_id'] = $usuarioId;
  }

  return [$usuarioId, $usuario, $cargo];
}

function validar_usuario_operacao(PDO $pdo, array $json): array {
  [$usuarioId, $usuarioLogin, $cargo] = getUsuarioLogin($pdo);
  if ($usuarioId <= 0) responder(['erro' => true, 'msg' => 'Usuário autenticado não identificado.'], 401);

  $payloadId = isset($json['usuario_id']) && is_numeric($json['usuario_id']) ? (int)$json['usuario_id'] : 0;
  if ($payloadId > 0 && $payloadId !== $usuarioId) {
    responder(['erro' => true, 'msg' => 'A operação offline pertence a outro usuário.'], 409);
  }

  return [$usuarioId, $usuarioLogin, $cargo];
}

function exigir_colunas_responsabilidade(PDO $pdo, string $tbl, string $segmento): void {
  $cols = $segmento === 'velorio'
    ? ['responsavel_velorio_id','responsavel_velorio_nome','responsavel_velorio_desde']
    : ['responsavel_sepultamento_id','responsavel_sepultamento_nome','responsavel_sepultamento_desde'];
  foreach ($cols as $col) {
    if (!column_exists($pdo, $tbl, $col)) {
      responder(['erro' => true, 'msg' => 'Migração offline pendente no banco: coluna ' . $col . ' não encontrada.'], 500);
    }
  }
}

function resolver_responsavel_historico(PDO $pdo, int $registroId, string $fase): ?array {
  if ($registroId <= 0 || !table_exists($pdo, 'historico_sepultamentos')) return null;

  $st = $pdo->prepare("SELECT usuario, acao, status_novo, datahora FROM historico_sepultamentos WHERE sepultamento_id = :id ORDER BY id DESC LIMIT 80");
  $st->execute([':id' => $registroId]);
  $logs = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  foreach ($logs as $log) {
    // Edição do cadastro não é ação do atendimento (15/10/2026): quem editou não vira responsável do trecho.
    if (stripos(trim((string)($log['acao'] ?? '')), 'edit') === 0) continue;
    if ((normalize_status_code($log['status_novo'] ?? null) ?? '') !== $fase) continue;
    $nome = trim((string)($log['usuario'] ?? ''));
    if ($nome === '') continue;

    $usuarioId = 0;
    if (table_exists($pdo, 'usuarios')) {
      $u = $pdo->prepare("SELECT id FROM usuarios WHERE nome = :nome OR usuario = :nome LIMIT 1");
      $u->execute([':nome' => $nome]);
      $usuarioId = (int)($u->fetchColumn() ?: 0);
    }

    if ($usuarioId > 0) {
      return [
        'id' => $usuarioId,
        'nome' => titlecase($nome),
        'desde' => (string)($log['datahora'] ?? ''),
      ];
    }
  }

  return null;
}

function garantir_responsavel_do_trecho(PDO $pdo, string $tbl, array $row, string $segmento): array {
  exigir_colunas_responsabilidade($pdo, $tbl, $segmento);
  $idCol = $segmento === 'velorio' ? 'responsavel_velorio_id' : 'responsavel_sepultamento_id';
  $nomeCol = $segmento === 'velorio' ? 'responsavel_velorio_nome' : 'responsavel_sepultamento_nome';
  $desdeCol = $segmento === 'velorio' ? 'responsavel_velorio_desde' : 'responsavel_sepultamento_desde';
  $fase = $segmento === 'velorio' ? 'fase07' : 'fase09';

  $ownerId = (int)($row[$idCol] ?? 0);
  if ($ownerId > 0) {
    return ['id' => $ownerId, 'nome' => (string)($row[$nomeCol] ?? ''), 'desde' => (string)($row[$desdeCol] ?? '')];
  }

  $legacy = resolver_responsavel_historico($pdo, (int)($row['id'] ?? 0), $fase);
  if (!$legacy) return ['id' => 0, 'nome' => '', 'desde' => ''];

  $st = $pdo->prepare("UPDATE {$tbl} SET {$idCol} = :uid, {$nomeCol} = :nome, {$desdeCol} = :desde WHERE id = :id LIMIT 1");
  $st->execute([
    ':uid' => $legacy['id'],
    ':nome' => $legacy['nome'],
    ':desde' => $legacy['desde'] !== '' ? $legacy['desde'] : date('Y-m-d H:i:s'),
    ':id' => (int)$row['id'],
  ]);
  return $legacy;
}

/**
 * As opções Sala 01/02/03 do acompanhamento representam as salas internas
 * do Memorial Senhor do Bonfim. Nesses casos não existe transporte até o
 * velório e, por isso, a fase07 é pulada.
 */
function velorio_eh_memorial(array $row): bool {
  $local = _normalize_key((string)($row['local_velorio'] ?? ''));
  $sala = _normalize_key((string)($row['sala_velorio'] ?? ''));

  $locaisMemorial = [
    _normalize_key('Memorial - Sala 01'),
    _normalize_key('Memorial - Sala 02'),
    _normalize_key('Memorial - Sala 03'),
  ];
  if (in_array($local, $locaisMemorial, true)) return true;

  $salasMemorial = [
    _normalize_key('Sala 01'), _normalize_key('Sala 1'), '01', '1',
    _normalize_key('Sala 02'), _normalize_key('Sala 2'), '02', '2',
    _normalize_key('Sala 03'), _normalize_key('Sala 3'), '03', '3',
  ];

  return in_array($sala, $salasMemorial, true);
}

/**
 * No Memorial não há fase07. Quando a Entrega de Corpo (fase08) é executada
 * pela primeira vez, o próprio agente da entrega passa a ser o responsável
 * pelo trecho do velório. Se já existir responsável, ele é preservado.
 */
function assumir_responsavel_velorio_memorial(
  PDO $pdo,
  string $tbl,
  array $row,
  int $usuarioId,
  string $agente,
  ?string $desde = null
): array {
  $owner = garantir_responsavel_do_trecho($pdo, $tbl, $row, 'velorio');
  if ((int)($owner['id'] ?? 0) > 0) return $owner;
  if (!velorio_eh_memorial($row)) return $owner;

  exigir_colunas_responsabilidade($pdo, $tbl, 'velorio');

  $registroId = (int)($row['id'] ?? 0);
  if ($registroId <= 0 || $usuarioId <= 0) return ['id' => 0, 'nome' => '', 'desde' => ''];

  $desdeEfetivo = parse_client_datetime_mysql($desde) ?: date('Y-m-d H:i:s');

  // UPDATE condicional evita que dois agentes assumam o mesmo atendimento.
  $st = $pdo->prepare(
    "UPDATE {$tbl}
        SET responsavel_velorio_id = :uid,
            responsavel_velorio_nome = :nome,
            responsavel_velorio_desde = :desde
      WHERE id = :id
        AND (responsavel_velorio_id IS NULL OR responsavel_velorio_id = 0)
      LIMIT 1"
  );
  $st->execute([
    ':uid' => $usuarioId,
    ':nome' => $agente,
    ':desde' => $desdeEfetivo,
    ':id' => $registroId,
  ]);

  // Relê o responsável efetivo. Se outro agente ganhou a corrida, ele será
  // retornado e a validação seguinte bloqueará corretamente este usuário.
  $st2 = $pdo->prepare(
    "SELECT responsavel_velorio_id, responsavel_velorio_nome, responsavel_velorio_desde
       FROM {$tbl}
      WHERE id = :id
      LIMIT 1"
  );
  $st2->execute([':id' => $registroId]);
  $atual = $st2->fetch(PDO::FETCH_ASSOC) ?: [];

  return [
    'id' => (int)($atual['responsavel_velorio_id'] ?? 0),
    'nome' => (string)($atual['responsavel_velorio_nome'] ?? ''),
    'desde' => (string)($atual['responsavel_velorio_desde'] ?? ''),
  ];
}

function validar_status_anterior_payload(array $row, array $json, string $statusAtual): void {
  $esperado = normalize_status_code($json['status_anterior'] ?? null);
  if ($esperado && $esperado !== $statusAtual) {
    responder([
      'erro' => true,
      'conflito' => true,
      'status_atual' => $statusAtual,
      'msg' => 'O atendimento mudou no servidor. Atualize os dados antes de continuar.'
    ], 409);
  }
}

function readInputJsonOrPost(): array {
  $ct = strtolower(trim((string)($_SERVER['CONTENT_TYPE'] ?? '')));

  // IMPORTANTE PARA UPLOAD LEVE:
  // em multipart/form-data o PHP já separa campos em $_POST e arquivo em $_FILES.
  // Não lemos php://input nesse caso para evitar manter uma segunda cópia do corpo
  // inteiro da requisição em memória.
  if (str_contains($ct, 'multipart/form-data') || str_contains($ct, 'application/x-www-form-urlencoded')) {
    return (!empty($_POST) && is_array($_POST)) ? $_POST : [];
  }

  $raw = file_get_contents('php://input');

  if ($raw !== '' && (str_contains($ct, 'application/json') || str_starts_with(ltrim($raw), '{'))) {
    $j = json_decode($raw, true);
    if (is_array($j)) return $j;
  }

  if (!empty($_POST) && is_array($_POST)) return $_POST;

  if ($raw !== '') {
    $j = json_decode($raw, true);
    if (is_array($j)) return $j;
  }

  return [];
}


/* ===============================
   PORTAL DA FAMÍLIA - PÚBLICO
   Página pública: https://planoassistencialintegrado.com.br/portal-da-familia/?id=123

   GET  informativo.php?portal_familia=1&id=123
        Retorna dados mínimos para montar a tela de senha.

   POST informativo.php?portal_familia=1&id=123
        Body JSON/Form: { "senha": "123456" }
        Senha = 6 primeiros números do CPF do responsável.
=================================*/
if (isset($_GET['portal_familia'])) {
  try {
    $baseFotoUrl = "https://api.planoassistencialintegrado.com.br";
    $portalPublicUrl = "https://planoassistencialintegrado.com.br/portal-da-familia/";

    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

    if ($id <= 0) {
      responder([
        'sucesso' => false,
        'msg' => 'Link inválido.'
      ], 400);
    }

    $tbl = table_exists($pdo, 'sepultamentos') ? 'sepultamentos' : null;

    if (!$tbl) {
      responder([
        'sucesso' => false,
        'msg' => 'Atendimento não encontrado.'
      ], 404);
    }

    $colsDesejadas = [
      'id',
      'falecido',
      'data_nascimento',
      'data_falecimento',
      'foto_falecido',
      'nome_responsavel',
      'cpf_responsavel',
      'contato',
      'religiao',
      'local',
      'local_velorio',
      'sala_velorio',
      'velorio_online',
      'data_inicio_velorio',
      'data_fim_velorio',
      'hora_inicio_velorio',
      'hora_fim_velorio',
      'observacao_atendimento',
      'observacao_itens',
      'observacao_velorio01',
      'observacao_velorio02',
      'status'
    ];

    $colsExistentes = [];
    foreach ($colsDesejadas as $c) {
      if (column_exists($pdo, $tbl, $c)) {
        $colsExistentes[] = $c;
      }
    }

    if (!in_array('id', $colsExistentes, true)) {
      $colsExistentes[] = 'id';
    }

    $sql = "SELECT " . implode(',', $colsExistentes) . " FROM {$tbl} WHERE id = :id LIMIT 1";
    $st = $pdo->prepare($sql);
    $st->execute([':id' => $id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
      responder([
        'sucesso' => false,
        'msg' => 'Atendimento não encontrado.'
      ], 404);
    }

    $foto = trim((string)($row['foto_falecido'] ?? ''));
    if ($foto !== '' && !preg_match('#^https?://#i', $foto)) {
      $foto = str_replace('\\', '/', $foto);
      $foto = preg_replace('#/{2,}#', '/', $foto);
      if ($foto[0] !== '/') $foto = '/' . $foto;
      $foto = rtrim($baseFotoUrl, '/') . $foto;
    }

    $salaVelorio = trim((string)($row['sala_velorio'] ?? ''));
    $salaKey = strtolower($salaVelorio);
    $salaKey = str_replace(['sala-', 'sala_'], 'sala ', $salaKey);
    $salaKey = preg_replace('/\s+/u', ' ', $salaKey) ?: $salaKey;

    $velorioOnlineUrl = '';
    if (in_array($salaKey, ['sala 1', 'sala 01', '01', '1'], true)) {
      $velorioOnlineUrl = 'https://planoassistencialintegrado.com.br/velorio-online-sala-01/';
    } elseif (in_array($salaKey, ['sala 2', 'sala 02', '02', '2'], true)) {
      $velorioOnlineUrl = 'https://planoassistencialintegrado.com.br/velorio-online-sala-02/';
    } elseif (in_array($salaKey, ['sala 3', 'sala 03', '03', '3'], true)) {
      $velorioOnlineUrl = 'https://planoassistencialintegrado.com.br/velorio-online-sala-03/';
    }

    $statusCode = normalize_status_code($row['status'] ?? '') ?? (string)($row['status'] ?? '');

    // GET público: dados mínimos para tela de senha.
    // Não retorna CPF, nem observações.
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
      responder([
        'sucesso' => true,
        'id' => (string)($row['id'] ?? $id),
        'falecido' => (string)($row['falecido'] ?? ''),
        'foto_falecido' => $foto,
        'portal_url' => $portalPublicUrl . '?id=' . urlencode((string)$id),
        'senha_required' => true,
      ]);
    }

    // POST público: valida senha do portal.
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
      $input = readInputJsonOrPost();

      $senhaDigitada = preg_replace('/\D+/', '', (string)($input['senha'] ?? ''));
      $cpfResponsavel = preg_replace('/\D+/', '', (string)($row['cpf_responsavel'] ?? ''));

      if ($senhaDigitada === '') {
        responder([
          'sucesso' => false,
          'msg' => 'Informe a senha.'
        ], 400);
      }

      if ($cpfResponsavel === '' || strlen($cpfResponsavel) < 6) {
        responder([
          'sucesso' => false,
          'msg' => 'CPF do responsável não cadastrado para este atendimento.'
        ], 400);
      }

      $senhaCorreta = substr($cpfResponsavel, 0, 6);

      // 23/10/2026 (segurança): limite de tentativas. 8 erros em 15 min bloqueiam o portal deste atendimento
      // e 20 erros do mesmo IP bloqueiam esse IP, por 15 min. Acerto zera o contador do atendimento.
      $limiteChaves = ['id:' . $id, 'ip:' . (string)($_SERVER['REMOTE_ADDR'] ?? '')];
      if (function_exists('paiLimiteBloqueado')
          && (paiLimiteBloqueado('portal_familia', [$limiteChaves[0]], 8, 900)
              || paiLimiteBloqueado('portal_familia', [$limiteChaves[1]], 20, 900))) {
        responder([
          'sucesso' => false,
          'bloqueado' => true,
          'msg' => 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
        ], 429);
      }

      if (!hash_equals($senhaCorreta, $senhaDigitada)) {
        if (function_exists('paiLimiteFalha')) paiLimiteFalha('portal_familia', $limiteChaves, 900);
        responder([
          'sucesso' => false,
          'msg' => 'Senha incorreta.'
        ], 401);
      }
      if (function_exists('paiLimiteLimpar')) paiLimiteLimpar('portal_familia', [$limiteChaves[0]]);

      // Prepara o link atualizado do Legado de Luz depois da senha validada.
      // O link principal agora usa o ID do atendimento, então não quebra quando o nome é corrigido.
      $rowComHomenagem = adicionar_homenagem_ao_registro($pdo, $row, $tbl);

      // Segurança: nunca devolve CPF do responsável para a página pública.
      unset($row['cpf_responsavel'], $rowComHomenagem['cpf_responsavel']);

      responder([
        'sucesso' => true,
        'dados' => [
          'id' => (string)($row['id'] ?? $id),
          'falecido' => (string)($row['falecido'] ?? ''),
          'data_nascimento' => (string)($row['data_nascimento'] ?? ''),
          'data_falecimento' => (string)($row['data_falecimento'] ?? ''),
          'foto_falecido' => $foto,

          'codigo_homenagem' => (string)($rowComHomenagem['codigo_homenagem'] ?? ''),
          'legado_luz_slug' => (string)($rowComHomenagem['legado_luz_slug'] ?? ''),
          'legado_luz_link' => (string)($rowComHomenagem['legado_luz_link'] ?? ''),
          'homenagem_link_publico' => (string)($rowComHomenagem['homenagem_link_publico'] ?? ''),
          'legado_luz_atendimento_id' => (string)($rowComHomenagem['legado_luz_atendimento_id'] ?? (string)$id),

          'nome_responsavel' => (string)($row['nome_responsavel'] ?? ''),
          'contato' => (string)($row['contato'] ?? ''),
          'religiao' => (string)($row['religiao'] ?? ''),

          'local_sepultamento' => (string)($row['local'] ?? ''),
          'local_velorio' => (string)($row['local_velorio'] ?? ''),
          'sala_velorio' => $salaVelorio,
          'velorio_online' => (string)($row['velorio_online'] ?? ''),
          'velorio_online_url' => $velorioOnlineUrl,

          'data_inicio_velorio' => (string)($row['data_inicio_velorio'] ?? ''),
          'data_fim_velorio' => (string)($row['data_fim_velorio'] ?? ''),
          'hora_inicio_velorio' => (string)($row['hora_inicio_velorio'] ?? ''),
          'hora_fim_velorio' => (string)($row['hora_fim_velorio'] ?? ''),

          'observacao_atendimento' => (string)($row['observacao_atendimento'] ?? ''),
          'observacao_itens' => (string)($row['observacao_itens'] ?? ''),
          'observacao_velorio01' => (string)($row['observacao_velorio01'] ?? ''),
          'observacao_velorio02' => (string)($row['observacao_velorio02'] ?? ''),

          'status' => $statusCode,
        ],
      ]);
    }

    responder([
      'sucesso' => false,
      'msg' => 'Método inválido.'
    ], 405);

  } catch (Exception $e) {
    responder([
      'sucesso' => false,
      'msg' => 'Erro no Portal da Família: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())
    ], 500);
  }
}


// ===== TRAVA DOS ITENS NO CORPO PRONTO =====
// No Corpo Pronto (fase12) o app dá baixa no estoque com os itens gravados; a partir dali eles não mudam mais.
// Vale para a fase12 e para as etapas depois dela (fase07 a fase11). Durante a ornamentação ainda se edita.
// Só quem tem a página Gestão (ou o administrador) altera. O front (page.tsx → CAMPOS_TRAVADOS_APOS_CORPO_PRONTO)
// mostra os mesmos campos travados.
const FASE_TRAVA_ITENS = 7;

/** Colunas preservadas do registro quando o atendimento está travado e ninguém mudou os itens. */
function colunas_itens_travados(): array {
  return [
    'urna','urna_produto_id','urna_deposito_nome','urna_codigo_barras',
    'roupa','roupa_produto_id','roupa_deposito_nome','roupa_codigo_barras',
    'veu','veu_item','veu_produto_id','veu_deposito_nome','veu_codigo_barras',
    'cordao','cordao_item','cordao_produto_id','cordao_deposito_nome','cordao_codigo_barras',
    'invol','invol_item','invol_produto_id','invol_deposito_nome','invol_codigo_barras',
    'tanato',
    'ornamentacao','ornamentacao_tipo',
    'kit_lanche',
    'coroa_flores','coroa_tipo','coroa_produto_id','coroa_modelo','coroa_codigo_barras','coroa_deposito_nome',
    'arrumacao_json',
  ];
}

function registro_tem_itens_travados(array $row): bool {
  $tipo = strtolower(trim((string)($row['tipo_atendimento'] ?? '')));
  if ($tipo === 'terceiro') return false;
  return numero_fase_status($row['status'] ?? null) >= FASE_TRAVA_ITENS;
}

/** Corpo Pronto (fase12) ou etapas depois dele (fase07 a fase11): a baixa no estoque já foi feita. */
function registro_ja_teve_baixa(array $row): bool {
  return numero_fase_status($row['status'] ?? null) >= 7;
}

function texto_item_canonico($v): string {
  $s = trim((string)($v ?? ''));
  $s = preg_replace('/\s+/u', ' ', $s) ?? $s;
  return function_exists('mb_strtoupper') ? mb_strtoupper($s, 'UTF-8') : strtoupper($s);
}

/** Insumos da conservação (arrumacao_json): depósito + produto => quantidade. Os marcadores do checklist não contam. */
function insumos_canonicos($raw): string {
  $data = is_array($raw) ? $raw : json_decode_safe((string)($raw ?? ''));
  if (!is_array($data)) $data = [];
  $lista = $data['itens'] ?? ($data['items'] ?? []);
  $mapa = [];
  if (is_array($lista)) {
    foreach ($lista as $it) {
      if (!is_array($it)) continue;
      if (array_key_exists('checked', $it) && $it['checked'] === false) continue;
      $pid = (int)($it['produto_id'] ?? 0);
      $qtd = (float)($it['qtd'] ?? ($it['quantidade'] ?? 0));
      if ($pid <= 0 || $qtd <= 0) continue;
      $mapa[$pid] = ($mapa[$pid] ?? 0) + $qtd;
    }
  }
  ksort($mapa);
  $dep = $mapa ? texto_item_canonico($data['deposito_nome'] ?? ($data['deposito'] ?? '')) : '';
  return json_encode([$dep, $mapa]);
}

/**
 * Compara o que veio na edição com o registro gravado e devolve os itens que mudariam.
 * Campo que não veio no payload não conta como mudança. Id de produto vazio também não (o UPDATE preserva).
 */
function itens_travados_alterados(array $row, array $json): array {
  $grupos = [
    // rótulo, campo principal, tipo do principal, id do produto, depósito, campos extras
    ['Urna', 'urna', 'texto', 'urna_produto_id', 'urna_deposito_nome', []],
    ['Roupa', 'roupa', 'texto', 'roupa_produto_id', 'roupa_deposito_nome', []],
    ['Véu', 'veu', 'simnao', 'veu_produto_id', 'veu_deposito_nome', []],
    ['Cordão', 'cordao', 'simnao', 'cordao_produto_id', 'cordao_deposito_nome', []],
    ['Invol', 'invol', 'simnao', 'invol_produto_id', 'invol_deposito_nome', []],
    ['Tanatopraxia', 'tanato', 'simnao', null, null, []],
    ['Ornamentação', 'ornamentacao', 'simnao', null, null, ['ornamentacao_tipo']],
    ['Kit lanche', 'kit_lanche', 'simnao', null, null, []],
    ['Coroa de flores', 'coroa_flores', 'simnao', 'coroa_produto_id', 'coroa_deposito_nome', ['coroa_tipo']],
  ];

  $mudou = [];
  foreach ($grupos as [$rotulo, $campo, $tipo, $campoId, $campoDep, $extras]) {
    $temAlgum = array_key_exists($campo, $json)
      || ($campoId && array_key_exists($campoId, $json))
      || ($campoDep && array_key_exists($campoDep, $json));
    foreach ($extras as $ex) $temAlgum = $temAlgum || array_key_exists($ex, $json);
    if (!$temAlgum) continue;

    $antes = $row[$campo] ?? '';
    $depois = array_key_exists($campo, $json) ? $json[$campo] : $antes;

    $ativoAntes = $tipo === 'texto' ? texto_item_canonico($antes) !== '' : is_sim($antes);
    $ativoDepois = $tipo === 'texto' ? texto_item_canonico($depois) !== '' : is_sim($depois);

    if ($ativoAntes !== $ativoDepois) { $mudou[] = $rotulo; continue; }
    if (!$ativoDepois) continue;

    if ($tipo === 'texto' && texto_item_canonico($antes) !== texto_item_canonico($depois)) { $mudou[] = $rotulo; continue; }

    if ($campoId && array_key_exists($campoId, $json)) {
      $idNovo = (int)($json[$campoId] ?? 0);
      if ($idNovo > 0 && $idNovo !== (int)($row[$campoId] ?? 0)) { $mudou[] = $rotulo; continue; }
    }

    if ($campoDep && array_key_exists($campoDep, $json)) {
      $depNovo = texto_item_canonico($json[$campoDep]);
      $depAntes = texto_item_canonico($row[$campoDep] ?? '');
      if ($depNovo !== '' && $depAntes !== '' && $depNovo !== $depAntes) { $mudou[] = $rotulo; continue; }
    }

    foreach ($extras as $ex) {
      if (!array_key_exists($ex, $json)) continue;
      $novo = texto_item_canonico($json[$ex]);
      if ($novo !== '' && $novo !== texto_item_canonico($row[$ex] ?? '')) { $mudou[] = $rotulo; break; }
    }
  }

  // Só compara quando o payload traz a lista de insumos (o front manda "{}" quando a edição não mexe nela).
  $arrNovo = array_key_exists('arrumacao_json', $json)
    ? (is_array($json['arrumacao_json']) ? $json['arrumacao_json'] : json_decode_safe((string)($json['arrumacao_json'] ?? '')))
    : null;
  if (is_array($arrNovo) && (array_key_exists('itens', $arrNovo) || array_key_exists('items', $arrNovo))) {
    if (insumos_canonicos($arrNovo) !== insumos_canonicos($row['arrumacao_json'] ?? '')) {
      $mudou[] = 'Insumos da conservação';
    }
  }

  return array_values(array_unique($mudou));
}

/**
 * Compara o registro antes e depois da edição e devolve [campo => valor novo] do que mudou,
 * no mesmo formato plano do histórico "criou" (a Linha do Tempo e o PDF já sabem mostrar).
 */
function campos_alterados_na_edicao(array $antes, array $depois, array $campos): array {
  $out = [];
  foreach ($campos as $c) {
    if (!array_key_exists($c, $depois)) continue;
    $a = $antes[$c] ?? null;
    $d = $depois[$c] ?? null;

    if (in_array($c, ['materiais_json', 'arrumacao_json'], true)) {
      $ja = json_decode_safe((string)($a ?? ''));
      $jd = json_decode_safe((string)($d ?? ''));
      if (json_encode($ja ?? []) === json_encode($jd ?? [])) continue;
      $out[$c] = $d;
      continue;
    }

    $sa = trim((string)($a ?? ''));
    $sd = trim((string)($d ?? ''));
    if ($sa === $sd) continue;
    // Datas e horas vazias do MySQL contam como vazio.
    if (in_array($sa, ['0000-00-00', '00:00:00'], true) && $sd === '') continue;
    if (in_array($sd, ['0000-00-00', '00:00:00'], true) && $sa === '') continue;

    if (in_array($c, ['assinatura_responsavel', 'assinatura_requerente', 'foto_falecido'], true)) {
      $out[$c] = $sd === '' ? '(removida)' : '(atualizada)';
      continue;
    }
    $out[$c] = $sd === '' ? '(vazio)' : $d;
  }
  return $out;
}

/** Atendimento travado e sem mudança de item: grava exatamente o que já estava (evita apagar metadados por payload parcial). */
function manter_itens_travados_do_registro(array $row, array &$json): void {
  foreach (colunas_itens_travados() as $c) {
    if (array_key_exists($c, $row)) $json[$c] = $row[$c];
  }
}

/** Gestão (página `gestao` por usuário ou por cargo) e o administrador alteram itens travados. */
function usuario_pode_alterar_itens_travados(PDO $pdo): bool {
  static $cache = null;
  if ($cache !== null) return $cache;

  [$usuarioId, , $cargo] = getUsuarioLogin($pdo);
  if ($usuarioId <= 0) return $cache = false;
  if (in_array($cargo, ['adm', 'admin', 'administrador', 'gestao', 'gestão'], true)) return $cache = true;

  try {
    if (table_exists($pdo, 'permissoes')) {
      $st = $pdo->prepare("SELECT 1 FROM permissoes WHERE user_id = :u AND pagina = 'gestao' LIMIT 1");
      $st->execute([':u' => $usuarioId]);
      if ($st->fetchColumn()) return $cache = true;
    }
    if (table_exists($pdo, 'cargos') && table_exists($pdo, 'cargo_paginas')) {
      $st = $pdo->prepare(
        "SELECT 1
           FROM usuarios u
           INNER JOIN cargos c ON c.slug = u.cargo AND c.ativo = 1
           INNER JOIN cargo_paginas cp ON cp.cargo_id = c.id
          WHERE u.id = :u AND cp.pagina = 'gestao'
          LIMIT 1"
      );
      $st->execute([':u' => $usuarioId]);
      if ($st->fetchColumn()) return $cache = true;
    }
  } catch (Exception $e) {
    // Sem as tabelas de permissão, só o cargo decide.
  }

  return $cache = false;
}


/* ===== Atendimento cancelado (09/10/2026) =====
   O cancelamento é feito pelo correcoes.php (Gestão). Aqui: some das listas e não aceita mais nenhuma ação. */
function atendimento_cancelado(PDO $pdo, int $id): bool {
  if ($id <= 0 || !column_exists($pdo, 'sepultamentos', 'cancelado_em')) return false;
  $st = $pdo->prepare("SELECT cancelado_em FROM sepultamentos WHERE id = :id LIMIT 1");
  $st->execute([':id' => $id]);
  return !empty($st->fetchColumn());
}

function exigir_atendimento_nao_cancelado(PDO $pdo, int $id): void {
  if (atendimento_cancelado($pdo, $id)) {
    responder(['erro' => true, 'sucesso' => false, 'codigo' => 'ATENDIMENTO_CANCELADO', 'msg' => 'Este atendimento foi cancelado. Não é possível alterar nem registrar ações.'], 409);
  }
}

// ===== GET ?me=1 =====
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && isset($_GET['me'])) {
  garantirSessaoMinima();

  if (empty($_SESSION['usuario_nome'])) {
    responder(['erro' => true, 'msg' => 'Não autenticado. Faça login novamente.'], 401);
  }

  [$usuarioId, $usuario, $cargo] = getUsuarioLogin($pdo);

  if ($usuarioId <= 0 || $cargo === '') {
    responder(['erro' => true, 'msg' => 'Usuário não encontrado na tabela usuarios.'], 404);
  }

  responder([
    'sucesso' => true,
    'id' => $usuarioId,
    'usuario' => (string)$usuario,
    'nome' => titlecase((string)($_SESSION['usuario_nome'] ?? $usuario)),
    'cargo' => (string)$cargo,
    'deposito_insumos' => deposito_insumos_por_usuario_id($usuarioId),
    'pode_conservacao' => usuario_pode_conservacao($usuarioId, $cargo),
    'pode_alterar_itens_travados' => usuario_pode_alterar_itens_travados($pdo),
    'server_time' => date(DATE_ATOM),
    'server_time_unix_ms' => (int)round(microtime(true) * 1000),
  ]);
}

// ===== BLOQUEIO DE POST SEM LOGIN =====
// Toda ação (POST) passa por garantirSessaoMinima: grava com o nome cadastrado.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  garantirSessaoMinima();
  if (empty($_SESSION['usuario_nome'])) {
    responder(['erro' => true, 'msg' => 'Sessão expirada. Faça login novamente.'], 401);
  }
}

/* ===============================
   GET: STATUS ATUAL (compatível)
=================================*/
if (($_SERVER['REQUEST_METHOD'] ?? '') === "GET" && isset($_GET['status_atual'])) {
  try {
    liberar_lock_sessao_leitura();

    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) responder(['erro' => true, 'msg' => 'ID inválido'], 400);

    $tbl = table_exists($pdo, 'sepultamentos') ? 'sepultamentos' : null;
    if (!$tbl) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);

    // Monta a consulta de forma compatível com tabelas legadas que podem
    // ainda não possuir todos os campos de roteamento.
    $statusCols = ['id', 'status'];
    foreach ([
      'local_velorio', 'sala_velorio', 'tanato', 'ornamentacao', 'assistencia', 'realiza_velorio', 'realiza_sepultamento', 'tipo_atendimento',
      'responsavel_velorio_id', 'responsavel_velorio_nome', 'responsavel_velorio_desde',
      'responsavel_sepultamento_id', 'responsavel_sepultamento_nome', 'responsavel_sepultamento_desde'
    ] as $c) {
      if (column_exists($pdo, $tbl, $c)) $statusCols[] = $c;
    }

    $stmt = $pdo->prepare("
      SELECT " . implode(', ', $statusCols) . "
        FROM {$tbl}
       WHERE id = :id
       LIMIT 1
    ");
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);

    $status_code = normalize_status_code($row['status'] ?? null) ?? 'fase00';
    $tipoAtendimento = strtolower(trim((string)($row['tipo_atendimento'] ?? '')));
    if (!in_array($tipoAtendimento, ['funerario', 'terceiro'], true)) $tipoAtendimento = '';

    responder([
      'sucesso' => true,
      'id' => (int)$row['id'],
      'status' => $status_code,
      'local_velorio' => (string)($row['local_velorio'] ?? ''),
      'sala_velorio' => (string)($row['sala_velorio'] ?? ''),
      'tanato' => (string)($row['tanato'] ?? ''),
      'ornamentacao' => (string)($row['ornamentacao'] ?? ''),
      'assistencia' => (string)($row['assistencia'] ?? ''),
      'realiza_velorio' => (string)($row['realiza_velorio'] ?? ''),
      'realiza_sepultamento' => (string)($row['realiza_sepultamento'] ?? ''),
      'tipo_atendimento' => $tipoAtendimento,
      'responsavel_velorio_id' => isset($row['responsavel_velorio_id']) ? (int)$row['responsavel_velorio_id'] : null,
      'responsavel_velorio_nome' => (string)($row['responsavel_velorio_nome'] ?? ''),
      'responsavel_velorio_desde' => (string)($row['responsavel_velorio_desde'] ?? ''),
      'responsavel_sepultamento_id' => isset($row['responsavel_sepultamento_id']) ? (int)$row['responsavel_sepultamento_id'] : null,
      'responsavel_sepultamento_nome' => (string)($row['responsavel_sepultamento_nome'] ?? ''),
      'responsavel_sepultamento_desde' => (string)($row['responsavel_sepultamento_desde'] ?? ''),
    ]);
  } catch (Exception $e) {
    responder(['erro' => true, 'msg' => 'Erro ao consultar status: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
  }
}

/* ===============================
   GET: LISTAR - fonte única sepultamentos
=================================*/
/**
 * 05/11/2026: acrescenta tanato_procedimento (nome do produto de tanato_produto_id em est_produto)
 * em cada registro do listar=1. Sem a coluna ou a tabela, devolve os registros como estão.
 */
function adicionar_tanato_procedimento(PDO $pdo, array $dados): array {
  if (!$dados || !column_exists($pdo, 'sepultamentos', 'tanato_produto_id') || !table_exists($pdo, 'est_produto')) return $dados;
  $ids = [];
  foreach ($dados as $r) {
    $pid = (int)($r['tanato_produto_id'] ?? 0);
    if ($pid > 0) $ids[$pid] = true;
  }
  if (!$ids) return $dados;
  $lista = implode(',', array_map('intval', array_keys($ids)));
  $nomes = [];
  try {
    foreach ($pdo->query("SELECT id, nome FROM est_produto WHERE id IN ({$lista})")->fetchAll(PDO::FETCH_ASSOC) as $p) {
      $nomes[(int)$p['id']] = trim((string)($p['nome'] ?? ''));
    }
  } catch (Throwable $e) {
    return $dados;
  }
  foreach ($dados as &$r) {
    if (!is_array($r)) continue;
    $pid = (int)($r['tanato_produto_id'] ?? 0);
    $r['tanato_procedimento'] = $pid > 0 ? ($nomes[$pid] ?? '') : '';
  }
  unset($r);
  return $dados;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === "GET" && isset($_GET['listar'])) {
  try {
    // Este endpoint é somente leitura. Libera o lock da sessão imediatamente para
    // não serializar outras chamadas do mesmo aparelho/usuário.
    liberar_lock_sessao_leitura();

    if (!table_exists($pdo, 'sepultamentos')) responder([]);

    // Cancelados (09/10/2026) não entram nas listas (Lista, Quadro, Quadro TV, Coroas, Relatório).
    $filtroCancelado = column_exists($pdo, 'sepultamentos', 'cancelado_em') ? ' AND cancelado_em IS NULL' : '';
    $st = $pdo->query("
      SELECT *
        FROM sepultamentos
       WHERE (material_recolhido = 0
          OR material_recolhido IS NULL){$filtroCancelado}
       ORDER BY id DESC
    ");
    $dados = $st ? ($st->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
    $dados = adicionar_homenagens_aos_registros($pdo, $dados, 'sepultamentos');

    // 05/11/2026: nome do tipo de procedimento da tanatopraxia (Tanatopraxia, Tanatopraxia avançada,
    // Embalsamamento) para o Painel de Atendimentos e o Relatório. Uma consulta só, somente leitura.
    $dados = adicionar_tanato_procedimento($pdo, $dados);

    // 23/10/2026 (segurança): sem login do app (ou chave interna), a lista não leva CPF, contatos, observações
    // nem itens — só o que uma página pública de velório/obituário mostra. Modo: 'pai_protecao_modo_informativo'
    // (observar = lista completa + registra quem pediu; exigir = lista reduzida; desligado = como antes).
    if (function_exists('paiLoginAssinado') && function_exists('paiProtecaoModo') && paiLoginAssinado() === null && paiChamadaInterna() === '') {
      $modoListar = paiProtecaoModo('informativo');
      if ($modoListar !== 'desligado') {
        $origemListar = substr((string)($_SERVER['HTTP_ORIGIN'] ?? ''), 0, 80) . ' | ' . substr((string)($_SERVER['HTTP_REFERER'] ?? ''), 0, 120);
        if (function_exists('paiSessaoJaRegistrado') && !paiSessaoJaRegistrado('listar_publico|' . $modoListar . '|' . $origemListar . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''))) {
          paiSessaoLog(['modo' => 'protecao_' . $modoListar, 'grupo' => 'informativo',
            'acao' => $modoListar === 'exigir' ? 'listar_reduzido' : 'listar_seria_reduzido',
            'arquivo' => 'informativo.php', 'host' => (string)($_SERVER['HTTP_HOST'] ?? ''),
            'origem' => $origemListar, 'ip' => (string)($_SERVER['REMOTE_ADDR'] ?? ''),
            'ua' => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 120)]);
        }
        if ($modoListar === 'exigir') {
          $dados = array_map(static function ($r) {
            if (!is_array($r)) return $r;
            $pub = [];
            foreach ($r as $k => $v) {
              $k = (string)$k;
              if (preg_match('/^(id|falecido|foto_falecido|foto_falecido_arquivo|local|local_velorio|sala_velorio|local_sepultamento|cemiterio|realiza_velorio|realiza_sepultamento|tipo_atendimento|status|velorio_online|religiao|codigo_homenagem)$/', $k)
                  || preg_match('/^(data_|hora_|homenagem|legado_luz)/', $k)) {
                $pub[$k] = $v;
              }
            }
            return $pub;
          }, $dados);
        }
      }
    }

    responder($dados);
  } catch (Exception $e) {
    responder(['erro' => true, 'msg' => 'Erro ao listar: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
  }
}

/* ===============================
   POST: AÇÕES
=================================*/
if (($_SERVER['REQUEST_METHOD'] ?? '') === "POST") {
  $json = readInputJsonOrPost();
  if (!$json) responder(['erro' => true, 'msg' => 'Dados inválidos.'], 400);

  // Normaliza depósito da urna apenas quando houver valor.
  // Valor vazio precisa continuar vazio para permitir marcar "Não" no Wizard.
  if (array_key_exists('urna_deposito_nome', $json)) {
    $urnaDepRaw = trim((string)($json['urna_deposito_nome'] ?? ''));
    $json['urna_deposito_nome'] = $urnaDepRaw === ''
      ? null
      : normalize_deposito_nome($urnaDepRaw);
  }

  // Normaliza depósitos de ROUPA/INVOL
  if (array_key_exists('roupa_deposito_nome', $json)) {
    $json['roupa_deposito_nome'] = norm_upper($json['roupa_deposito_nome']);
  }
  if (array_key_exists('invol_deposito_nome', $json)) {
    $json['invol_deposito_nome'] = norm_upper($json['invol_deposito_nome']);
  }
  if (array_key_exists('veu_deposito_nome', $json)) {
    $json['veu_deposito_nome'] = norm_upper($json['veu_deposito_nome']);
  }
  if (array_key_exists('cordao_deposito_nome', $json)) {
    $json['cordao_deposito_nome'] = norm_upper($json['cordao_deposito_nome']);
  }

  // Urna ou roupa vazia significa resposta "Não" no Wizard.
  // Limpa os metadados para não manter vínculo antigo com o estoque.
  if (array_key_exists('urna', $json) && trim((string)($json['urna'] ?? '')) === '') {
    $json['urna'] = '';
    $json['urna_deposito_nome'] = null;
    $json['urna_produto_id'] = null;
    $json['urna_codigo_barras'] = null;
  }

  if (array_key_exists('roupa', $json) && trim((string)($json['roupa'] ?? '')) === '') {
    $json['roupa'] = '';
    $json['roupa_deposito_nome'] = null;
    $json['roupa_produto_id'] = null;
    $json['roupa_codigo_barras'] = null;
    $json['roupa_propria'] = 0;
  }


  // ✅ Se clicou em "Usar ROUPA PRÓPRIA", não pode obrigar estoque
  if (is_true($json['roupa_propria'] ?? null)) {
    $json['roupa'] = 'ROUPA PRÓPRIA';        // só para registrar no atendimento
    $json['roupa_produto_id'] = null;        // não selecionou produto do estoque
    $json['roupa_codigo_barras'] = null;
    $json['roupa_deposito_nome'] = null;
  }

  $acao = $json['acao'] ?? null;

// ✅ Regra de obrigatoriedade:
// - Novo Registro: não exige campos.
// - Editar antes de Corpo na Clínica: não exige campos.
// - Editar em fase02 ou acima: exige os campos obrigatórios.
// - Quando o front envia _wizard_restrict_ids, valida somente a aba que está sendo editada.
$obrigatoriedadeAtiva = obrigatoriedade_ativa_para_payload($pdo, $json);
$scopeIds = payload_restrict_ids($json);

if (in_array($acao, ['novo', 'editar'], true)) {
  normalizar_rotas_atendimento_payload($json);
  normalizar_validar_coroa_payload($pdo, $json, $obrigatoriedadeAtiva, $scopeIds);

  // Valida/normaliza Velório somente quando for edição completa ou quando a aba Velório estiver no escopo.
  if (scope_tem_algum($scopeIds, ['local_velorio', 'sala_velorio', 'velorio_online'])) {
    normalizar_validar_velorio_ou_erro($json, $obrigatoriedadeAtiva);
  }

  if ($obrigatoriedadeAtiva) {
    validar_obrigatorios_fase02_ou_erro($json, $scopeIds);

    // Validação detalhada de estoque só roda em edição completa ou quando a aba Itens estiver no escopo.
    if (scope_tem_algum($scopeIds, [
      'urna',
      'roupa',
      'assistencia',
      'tanato',
      'ornamentacao',
      'ornamentacao_tipo',
      'invol',
      'invol_item',
      'veu',
      'veu_item',
      'cordao',
      'cordao_item',
      'kit_lanche',
      'coroa_flores',
      'coroa_tipo',
      'coroa_modelo',
      'arrumacao',
    ])) {
      validar_metas_itens_ou_erro($json);
    }
  }
}

  // ===== escolhe tabela padrão para "novo"
  $TBL_DEFAULT = table_exists($pdo, 'sepultamentos') ? 'sepultamentos' : null;
  if (!$TBL_DEFAULT) responder(['erro' => true, 'msg' => 'Tabela de atendimentos sepultamentos não encontrada.'], 500);

  // -------- 1) NOVO REGISTRO --------
  if ($acao === "novo") {
    try {
      $agente = titlecase($_SESSION['usuario_nome']);

      /*
       * Idempotência da criação offline.
       *
       * O front reutiliza o mesmo operation_id quando a conexão cai depois
       * do INSERT e antes da resposta chegar ao aparelho. Se o histórico
       * dessa operação já existir, devolvemos o mesmo atendimento em vez de
       * inserir outro.
       */
      $createOperationId = normalizar_operation_id($json['operation_id'] ?? '');

      if ($createOperationId !== '') {
        $existingCreate = historico_por_operation_id($pdo, $createOperationId);

        if ($existingCreate) {
          $existingAttendanceId = (int)($existingCreate['sepultamento_id'] ?? 0);

          if ($existingAttendanceId > 0) {
            responder([
              'sucesso' => true,
              'id' => $existingAttendanceId,
              'idempotente' => true,
            ]);
          }
        }
      }

      // monta insert dinamicamente (para não quebrar em tabelas antigas)
      $tbl = $TBL_DEFAULT;

      // ✅ Se veio foto real do falecido em base64, salva arquivo e grava o caminho em foto_falecido.
      salvar_foto_falecido_payload($pdo, $tbl, $json, null);

      $cols = [
        'falecido','data_nascimento','data_falecimento','foto_falecido',
        'nome_responsavel','cpf_responsavel',
        'agente','tipo_atendimento','local','contato','religiao','convenio','urna',
        'assistencia','invol','tanato','ornamentacao','ornamentacao_tipo','kit_lanche',
        'coroa_flores','coroa_tipo','coroa_produto_id','coroa_modelo','coroa_codigo_barras','coroa_deposito_nome',
        'realiza_velorio','realiza_sepultamento',
        'roupa','local_velorio','sala_velorio','velorio_online',
        'data_inicio_velorio','data_fim_velorio','hora_inicio_velorio','hora_fim_velorio',
        'observacao_atendimento','observacao_itens','observacao_velorio01','observacao_velorio02',
        'materiais_json','arrumacao_json',
        'materiais_cadeiras_qtd','materiais_bebedouros_qtd','materiais_suporte_coroa_qtd','materiais_kit_lanche_qtd',
        'materiais_velas_qtd','materiais_tenda_qtd','materiais_placa_qtd','materiais_paramentacao_qtd',
        'observacao',
        'status','material_recolhido','data','data_material_recolhido',
        // metas novas (só se existir)
        'urna_deposito_nome','urna_produto_id','urna_codigo_barras',
        'roupa_deposito_nome','roupa_produto_id','roupa_codigo_barras',
        'invol_deposito_nome','invol_produto_id','invol_item',
        'invol_codigo_barras','veu','veu_item','veu_deposito_nome','veu_produto_id','veu_codigo_barras','cordao','cordao_item','cordao_deposito_nome','cordao_produto_id','cordao_codigo_barras',

      ];

      $finalCols = [];
      foreach ($cols as $c) {
        if (column_exists($pdo, $tbl, $c)) $finalCols[] = $c;
      }

      $place = [];
      $params = [];

      foreach ($finalCols as $c) {
        $place[] = ':' . $c;
        switch ($c) {
          case 'agente': $params[':' . $c] = $agente; break;
          case 'tipo_atendimento':
            $tipoAtendimento = strtolower(trim((string)($json['tipo_atendimento'] ?? 'funerario')));
            $params[':' . $c] = $tipoAtendimento === 'terceiro' ? 'terceiro' : 'funerario';
            break;
          case 'status': $params[':' . $c] = 'aguardando'; break;
          case 'material_recolhido': $params[':' . $c] = 0; break;
          case 'data': $params[':' . $c] = date('Y-m-d'); break;
          case 'data_material_recolhido': $params[':' . $c] = null; break;

          case 'data_nascimento': $params[':' . $c] = asDateOrNull($json['data_nascimento'] ?? null); break;
          case 'data_falecimento': $params[':' . $c] = asDateOrNull($json['data_falecimento'] ?? null); break;
          case 'foto_falecido': $params[':' . $c] = asNullIfEmpty($json['foto_falecido'] ?? null); break;
          case 'nome_responsavel': $params[':' . $c] = asNullIfEmpty($json['nome_responsavel'] ?? null); break;
          case 'cpf_responsavel': $params[':' . $c] = asCpfDigitsOrNull($json['cpf_responsavel'] ?? null); break;

          case 'sala_velorio': $params[':' . $c] = asNullIfEmpty($json['sala_velorio'] ?? null); break;
          case 'velorio_online': $params[':' . $c] = asNullIfEmpty($json['velorio_online'] ?? null); break;

          case 'urna_deposito_nome': $params[':' . $c] = asNullIfEmpty($json['urna_deposito_nome'] ?? null); break;
          case 'urna_produto_id':    $params[':' . $c] = asIntOrNull($json['urna_produto_id'] ?? null); break;
          case 'urna_codigo_barras': $params[':' . $c] = asNullIfEmpty($json['urna_codigo_barras'] ?? null); break;

          case 'roupa_deposito_nome': $params[':' . $c] = asNullIfEmpty($json['roupa_deposito_nome'] ?? null); break;
          case 'roupa_produto_id':    $params[':' . $c] = asIntOrNull($json['roupa_produto_id'] ?? null); break;
          case 'roupa_codigo_barras': $params[':' . $c] = asNullIfEmpty($json['roupa_codigo_barras'] ?? null); break;

          case 'invol_deposito_nome': $params[':' . $c] = asNullIfEmpty($json['invol_deposito_nome'] ?? null); break;
          case 'invol_produto_id':    $params[':' . $c] = asIntOrNull($json['invol_produto_id'] ?? null); break;
          case 'invol_codigo_barras': $params[':' . $c] = asNullIfEmpty($json['invol_codigo_barras'] ?? null); break;
          case 'invol_item': $params[':' . $c] = asNullIfEmpty($json['invol_item'] ?? null); break;
                    case 'veu': $params[':' . $c] = ($json['veu'] ?? ''); break;
          case 'veu_item': $params[':' . $c] = asNullIfEmpty($json['veu_item'] ?? null); break;
          case 'veu_deposito_nome': $params[':' . $c] = asNullIfEmpty($json['veu_deposito_nome'] ?? null); break;
          case 'veu_produto_id':    $params[':' . $c] = asIntOrNull($json['veu_produto_id'] ?? null); break;
          case 'veu_codigo_barras': $params[':' . $c] = asNullIfEmpty($json['veu_codigo_barras'] ?? null); break;

          case 'cordao': $params[':' . $c] = ($json['cordao'] ?? ''); break;
          case 'kit_lanche': $params[':' . $c] = ($json['kit_lanche'] ?? 'Não'); break;
          case 'coroa_flores': $params[':' . $c] = ($json['coroa_flores'] ?? ''); break;
          case 'coroa_tipo': $params[':' . $c] = asNullIfEmpty($json['coroa_tipo'] ?? null); break;
          case 'coroa_produto_id': $params[':' . $c] = asIntOrNull($json['coroa_produto_id'] ?? null); break;
          case 'coroa_modelo': $params[':' . $c] = asNullIfEmpty($json['coroa_modelo'] ?? null); break;
          case 'coroa_codigo_barras': $params[':' . $c] = asNullIfEmpty($json['coroa_codigo_barras'] ?? null); break;
          case 'coroa_deposito_nome': $params[':' . $c] = asNullIfEmpty($json['coroa_deposito_nome'] ?? null); break;
          case 'realiza_velorio': $params[':' . $c] = ($json['realiza_velorio'] ?? ''); break;
          case 'realiza_sepultamento': $params[':' . $c] = ($json['realiza_sepultamento'] ?? ''); break;
          case 'cordao_item': $params[':' . $c] = asNullIfEmpty($json['cordao_item'] ?? null); break;
          case 'cordao_deposito_nome': $params[':' . $c] = asNullIfEmpty($json['cordao_deposito_nome'] ?? null); break;
          case 'cordao_produto_id':    $params[':' . $c] = asIntOrNull($json['cordao_produto_id'] ?? null); break;
          case 'cordao_codigo_barras': $params[':' . $c] = asNullIfEmpty($json['cordao_codigo_barras'] ?? null); break;



          case 'materiais_cadeiras_qtd':
          case 'materiais_bebedouros_qtd':
          case 'materiais_suporte_coroa_qtd':
          case 'materiais_kit_lanche_qtd':
          case 'materiais_velas_qtd':
          case 'materiais_tenda_qtd':
          case 'materiais_placa_qtd':
          case 'materiais_paramentacao_qtd':
            $params[':' . $c] = asIntOrNull($json[$c] ?? null);
            break;

          default:
            // strings gerais
            $params[':' . $c] = $json[$c] ?? '';
            break;
        }
      }

      $sql = "INSERT INTO {$tbl} (" . implode(',', $finalCols) . ") VALUES (" . implode(',', $place) . ")";
      $stmt = $pdo->prepare($sql);
      $stmt->execute($params);

      $lastId = (int)$pdo->lastInsertId();

      enviarNotificacaoNovoAtendimento($agente, $json['falecido'] ?? '');

      registrarHistorico(
        $pdo,
        $lastId,
        $json['falecido'] ?? '',
        $agente,
        'criou',
        null,
        'aguardando',
        json_encode_u(limpar_payload_foto_falecido_para_historico($json)),
        [
          'operation_id' => $createOperationId,
          'usuario_id' => $json['usuario_id'] ?? null,
          'origem' => $json['origem'] ?? 'online',
          'device_id' => $json['device_id'] ?? null,
          'ocorreu_em' => $json['ocorreu_em'] ?? null,
          'clock_offset_ms' => $json['clock_offset_ms'] ?? null,
        ]
      );

      responder([
        'sucesso' => true,
        'id' => $lastId,
        'operation_id' => $createOperationId !== '' ? $createOperationId : null,
      ]);
    } catch (Exception $e) {
      responder(['erro' => true, 'msg' => 'Erro ao inserir: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
    }
  }

  // -------- 2) EDITAR REGISTRO --------
  if ($acao === "editar" && isset($json['id'])) {
    try {
      $id     = (int)$json['id'];
      exigir_atendimento_nao_cancelado($pdo, $id);
      $agente = titlecase($_SESSION['usuario_nome']);

      $tbl = table_exists($pdo, 'sepultamentos') ? 'sepultamentos' : null;
      if (!$tbl) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);

      // A validação anterior da edição já pode ter carregado este mesmo registro.
      // Reutiliza a leitura da própria requisição em vez de consultar o MySQL novamente.
      $row = buscar_registro_edicao_na_requisicao($pdo, $id);
      if (!$row) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);

      $falecido_ant = $row['falecido'] ?? '';
      $status_ant   = $row['status']   ?? null;

      // ✅ Trava dos itens a partir do Corpo Pronto (fase12), junto com a baixa no estoque.
      $itensAlteradosAposTrava = [];
      if (registro_tem_itens_travados($row)) {
        $itensAlteradosAposTrava = itens_travados_alterados($row, $json);

        if ($itensAlteradosAposTrava && !usuario_pode_alterar_itens_travados($pdo)) {
          $lista = implode(', ', $itensAlteradosAposTrava);
          responder([
            'erro' => true,
            'sucesso' => false,
            'codigo' => 'ITENS_TRAVADOS',
            'itens' => $itensAlteradosAposTrava,
            'msg' => "Itens travados após o Corpo Pronto (a baixa no estoque já foi feita). Não é possível alterar: {$lista}. Só a Gestão pode alterar.",
          ], 409);
        }

        if (!$itensAlteradosAposTrava) {
          manter_itens_travados_do_registro($row, $json);
        }
      }

      // ✅ Se veio nova foto real do falecido em base64, salva arquivo e grava o caminho em foto_falecido.
      salvar_foto_falecido_payload($pdo, $tbl, $json, $id);

      // UPDATE dinâmico por colunas existentes
      $set = [];
      $params = [':id' => $id];

      // Quando o campo principal veio vazio, os metadados precisam ser realmente apagados.
      // Nesses casos não usamos COALESCE, pois COALESCE preservaria o valor antigo.
      $limparUrna = array_key_exists('urna', $json) && trim((string)($json['urna'] ?? '')) === '';
      $limparRoupa = array_key_exists('roupa', $json) && trim((string)($json['roupa'] ?? '')) === '';

      $allUpdateFields = [
        'falecido','data_nascimento','data_falecimento','foto_falecido',
        'nome_responsavel','cpf_responsavel',
        'tipo_atendimento','contato','religiao','convenio','urna','roupa',
        'assistencia','invol','tanato','ornamentacao','ornamentacao_tipo','kit_lanche',
        'coroa_flores','coroa_tipo','coroa_produto_id','coroa_modelo','coroa_codigo_barras','coroa_deposito_nome',
        'realiza_velorio','realiza_sepultamento',
        'local','local_velorio','sala_velorio','velorio_online',
        'data_inicio_velorio','data_fim_velorio','hora_inicio_velorio','hora_fim_velorio',
        'observacao_atendimento','observacao_itens','observacao_velorio01','observacao_velorio02',
        'materiais_json','arrumacao_json',
        'materiais_cadeiras_qtd','materiais_bebedouros_qtd','materiais_suporte_coroa_qtd','materiais_kit_lanche_qtd',
        'materiais_velas_qtd','materiais_tenda_qtd','materiais_placa_qtd','materiais_paramentacao_qtd',
        'observacao',
        'assinatura_responsavel','assinatura_requerente',
        'assinatura_responsavel_nome','assinatura_responsavel_cpf',
        'assinatura_requerente_nome','assinatura_requerente_cpf',
        // 'agente' não muda na edição: editar o cadastro não é uma ação do atendimento.

        // metas novas (se existirem)
        'urna_deposito_nome','urna_produto_id','urna_codigo_barras',
        'roupa_deposito_nome','roupa_produto_id','roupa_codigo_barras',
        'invol_deposito_nome','invol_produto_id','invol_item',
        'invol_codigo_barras','veu','veu_item','veu_deposito_nome','veu_produto_id','veu_codigo_barras','cordao','cordao_item','cordao_deposito_nome','cordao_produto_id','cordao_codigo_barras',

      ];

      foreach ($allUpdateFields as $c) {
        if (!column_exists($pdo, $tbl, $c)) continue;

        // COALESCE para campos que podem vir nulos e devem preservar o valor anterior.
        // Urna e roupa são exceções quando o usuário marcou "Não", pois os metadados devem ser limpos.
        $useCoalesce = in_array($c, [
          'assinatura_responsavel','assinatura_requerente',
          'assinatura_responsavel_nome','assinatura_responsavel_cpf',
          'assinatura_requerente_nome','assinatura_requerente_cpf',
          'data_nascimento','data_falecimento','foto_falecido','nome_responsavel','cpf_responsavel',
          'invol_deposito_nome','invol_produto_id','invol_codigo_barras',
        ], true)
          || (in_array($c, ['urna_deposito_nome','urna_produto_id','urna_codigo_barras'], true) && !$limparUrna)
          || (in_array($c, ['roupa_deposito_nome','roupa_produto_id','roupa_codigo_barras'], true) && !$limparRoupa);

        if ($useCoalesce) {
          $set[] = "{$c} = COALESCE(:{$c}, {$c})";
        } else {
          $set[] = "{$c} = :{$c}";
        }

        // params
        switch ($c) {
          case 'agente': $params[":{$c}"] = $agente; break;
          case 'tipo_atendimento':
            $tipoAtendimento = strtolower(trim((string)($json['tipo_atendimento'] ?? ($row['tipo_atendimento'] ?? 'funerario'))));
            $params[":{$c}"] = $tipoAtendimento === 'terceiro' ? 'terceiro' : 'funerario';
            break;

          case 'data_nascimento': $params[":{$c}"] = asDateOrNull($json['data_nascimento'] ?? null); break;
          case 'data_falecimento': $params[":{$c}"] = asDateOrNull($json['data_falecimento'] ?? null); break;
          case 'foto_falecido': $params[":{$c}"] = asNullIfEmpty($json['foto_falecido'] ?? null); break;
          case 'nome_responsavel': $params[":{$c}"] = asNullIfEmpty($json['nome_responsavel'] ?? null); break;
          case 'cpf_responsavel': $params[":{$c}"] = asCpfDigitsOrNull($json['cpf_responsavel'] ?? null); break;

          case 'sala_velorio':
            $params[":{$c}"] = array_key_exists('sala_velorio', $json)
              ? asNullIfEmpty($json['sala_velorio'])
              : asNullIfEmpty($row['sala_velorio'] ?? null);
            break;
          case 'velorio_online':
            $params[":{$c}"] = array_key_exists('velorio_online', $json)
              ? asNullIfEmpty($json['velorio_online'])
              : asNullIfEmpty($row['velorio_online'] ?? null);
            break;

          case 'urna_deposito_nome': $params[":{$c}"] = $limparUrna ? null : asNullIfEmpty($json['urna_deposito_nome'] ?? null); break;
          case 'urna_produto_id':    $params[":{$c}"] = $limparUrna ? null : asIntOrNull($json['urna_produto_id'] ?? null); break;
          case 'urna_codigo_barras': $params[":{$c}"] = $limparUrna ? null : asNullIfEmpty($json['urna_codigo_barras'] ?? null); break;

          case 'roupa_deposito_nome': $params[":{$c}"] = $limparRoupa ? null : asNullIfEmpty($json['roupa_deposito_nome'] ?? null); break;
          case 'roupa_produto_id':    $params[":{$c}"] = $limparRoupa ? null : asIntOrNull($json['roupa_produto_id'] ?? null); break;
          case 'roupa_codigo_barras': $params[":{$c}"] = $limparRoupa ? null : asNullIfEmpty($json['roupa_codigo_barras'] ?? null); break;

          case 'invol_deposito_nome': $params[":{$c}"] = asNullIfEmpty($json['invol_deposito_nome'] ?? null); break;
          case 'invol_produto_id':    $params[":{$c}"] = asIntOrNull($json['invol_produto_id'] ?? null); break;
          case 'invol_codigo_barras': $params[":{$c}"] = asNullIfEmpty($json['invol_codigo_barras'] ?? null); break;
          case 'invol_item':  $params[":{$c}"] = asNullIfEmpty($json['invol_item'] ?? null);  break;
                    case 'veu_deposito_nome': $params[":{$c}"] = asNullIfEmpty($json['veu_deposito_nome'] ?? null); break;
          case 'veu_produto_id':    $params[":{$c}"] = asIntOrNull($json['veu_produto_id'] ?? null); break;
          case 'veu_codigo_barras': $params[":{$c}"] = asNullIfEmpty($json['veu_codigo_barras'] ?? null); break;
          case 'veu_item':          $params[":{$c}"] = asNullIfEmpty($json['veu_item'] ?? null); break;
          case 'veu':               $params[":{$c}"] = $json['veu'] ?? ($row['veu'] ?? ''); break;

          case 'cordao_deposito_nome': $params[":{$c}"] = asNullIfEmpty($json['cordao_deposito_nome'] ?? null); break;
          case 'cordao_produto_id':    $params[":{$c}"] = asIntOrNull($json['cordao_produto_id'] ?? null); break;
          case 'cordao_codigo_barras': $params[":{$c}"] = asNullIfEmpty($json['cordao_codigo_barras'] ?? null); break;
          case 'cordao_item':          $params[":{$c}"] = asNullIfEmpty($json['cordao_item'] ?? null); break;
          case 'cordao':               $params[":{$c}"] = $json['cordao'] ?? ($row['cordao'] ?? ''); break;
          case 'kit_lanche':           $params[":{$c}"] = $json['kit_lanche'] ?? ($row['kit_lanche'] ?? 'Não'); break;
          case 'coroa_flores':         $params[":{$c}"] = $json['coroa_flores'] ?? ($row['coroa_flores'] ?? ''); break;
          case 'coroa_tipo':           $params[":{$c}"] = array_key_exists('coroa_tipo', $json) ? asNullIfEmpty($json['coroa_tipo']) : asNullIfEmpty($row['coroa_tipo'] ?? null); break;
          case 'coroa_produto_id':     $params[":{$c}"] = array_key_exists('coroa_produto_id', $json) ? asIntOrNull($json['coroa_produto_id']) : asIntOrNull($row['coroa_produto_id'] ?? null); break;
          case 'coroa_modelo':         $params[":{$c}"] = array_key_exists('coroa_modelo', $json) ? asNullIfEmpty($json['coroa_modelo']) : asNullIfEmpty($row['coroa_modelo'] ?? null); break;
          case 'coroa_codigo_barras':  $params[":{$c}"] = array_key_exists('coroa_codigo_barras', $json) ? asNullIfEmpty($json['coroa_codigo_barras']) : asNullIfEmpty($row['coroa_codigo_barras'] ?? null); break;
          case 'coroa_deposito_nome':  $params[":{$c}"] = array_key_exists('coroa_deposito_nome', $json) ? asNullIfEmpty($json['coroa_deposito_nome']) : asNullIfEmpty($row['coroa_deposito_nome'] ?? null); break;
          case 'realiza_velorio':      $params[":{$c}"] = $json['realiza_velorio'] ?? ($row['realiza_velorio'] ?? ''); break;
          case 'realiza_sepultamento': $params[":{$c}"] = $json['realiza_sepultamento'] ?? ($row['realiza_sepultamento'] ?? ''); break;


          
         

          case 'materiais_cadeiras_qtd':
          case 'materiais_bebedouros_qtd':
          case 'materiais_suporte_coroa_qtd':
          case 'materiais_kit_lanche_qtd':
          case 'materiais_velas_qtd':
          case 'materiais_tenda_qtd':
          case 'materiais_placa_qtd':
          case 'materiais_paramentacao_qtd':
            $params[":{$c}"] = asIntOrNull($json[$c] ?? null);
            break;

          case 'data_inicio_velorio':
          case 'data_fim_velorio':
          case 'hora_inicio_velorio':
          case 'hora_fim_velorio':
          case 'materiais_json':
          case 'arrumacao_json':
            $params[":{$c}"] = ($json[$c] ?? null);
            break;

          case 'assinatura_responsavel':
          case 'assinatura_requerente':
          case 'assinatura_responsavel_nome':
          case 'assinatura_responsavel_cpf':
          case 'assinatura_requerente_nome':
          case 'assinatura_requerente_cpf':
            $params[":{$c}"] = $json[$c] ?? null;
            break;

          case 'observacao':
            $params[":{$c}"] = $json['observacao'] ?? '';
            break;

          default:
            $params[":{$c}"] = $json[$c] ?? ($row[$c] ?? '');
            break;
        }
      }

      if (empty($set)) responder(['erro' => true, 'msg' => 'Nada para atualizar.'], 400);

      // Corrigir baixa (09/10/2026): a Gestão alterou item travado depois da baixa do Corpo Pronto.
      // O UPDATE e o acerto do estoque vão juntos: se faltar saldo do item novo, nada é gravado.
      $corrigirBaixa = $itensAlteradosAposTrava && registro_ja_teve_baixa($row);
      $correcaoBaixa = null;
      if ($corrigirBaixa) {
        require_once __DIR__ . '/estoque_atendimento.php';
        $pdo->beginTransaction();
      }

      $sql = "UPDATE {$tbl} SET " . implode(",\n", $set) . " WHERE id = :id";
      $stmt = $pdo->prepare($sql);
      $stmt->execute($params);

      if ($corrigirBaixa) {
        try {
          $stNovo = $pdo->prepare("SELECT * FROM {$tbl} WHERE id = :id LIMIT 1 FOR UPDATE");
          $stNovo->execute([':id' => $id]);
          $rowNovo = $stNovo->fetch(PDO::FETCH_ASSOC) ?: [];
          [$uidCorrecao] = getUsuarioLogin($pdo);
          $correcaoBaixa = estq_corrigir_baixa_atendimento($pdo, $rowNovo, (int)$uidCorrecao, 'Correção da baixa do Corpo Pronto (edição pela Gestão)');
          $pdo->commit();
        } catch (EstqErro $eBaixa) {
          if ($pdo->inTransaction()) $pdo->rollBack();
          $faltantes = $eBaixa->extra['faltantes'] ?? [];
          $lista = implode('; ', array_map(fn($f) => ($f['produto_nome'] ?? '') . ' em ' . ($f['deposito_nome'] ?? '') . ' (disponível ' . (int)($f['disponivel'] ?? 0) . ')', $faltantes));
          responder([
            'erro' => true,
            'sucesso' => false,
            'codigo' => $faltantes ? 'ESTOQUE_INSUFICIENTE' : 'CORRECAO_BAIXA',
            'faltantes' => $faltantes,
            'msg' => 'Nada foi salvo. Não deu para corrigir a baixa no estoque: ' . (function_exists('paiErroTexto') ? paiErroTexto($eBaixa) : $eBaixa->getMessage()) . ($lista !== '' ? ' ' . $lista . '.' : ''),
          ], $eBaixa->http);
        } catch (Throwable $eBaixa) {
          if ($pdo->inTransaction()) $pdo->rollBack();
          throw $eBaixa;
        }
      }

      // Se a foto do falecido foi trocada no atendimento, atualiza também a foto principal
      // da homenagem já existente para o Legado de Luz não continuar exibindo a imagem antiga.
      if (array_key_exists('foto_falecido', $json) && asNullIfEmpty($json['foto_falecido'] ?? null) !== null) {
        sincronizar_foto_homenagem_para_atendimento($pdo, $id, $json['foto_falecido'], $tbl);
      }

      // DIFF (para histórico / avisos) - mantido (simplificado, sem quebrar)
      $diff = [];
      $camposObs = ['observacao_atendimento','observacao_itens','observacao_velorio01','observacao_velorio02'];

      // ✅ usa o falecido do registro atual, nunca o "último do agente"
      $falecidoAviso = trim((string)($json['falecido'] ?? $row['falecido'] ?? $falecido_ant ?? ''));

      foreach ($camposObs as $cObs) {
        if (array_key_exists($cObs, $json)) {
          $novoTexto = (string)($json[$cObs] ?? '');
          if (trim($novoTexto) !== '' && !same_null_or_str($row[$cObs] ?? null, $novoTexto)) {
            $mensagemAviso = $agente . " adicionou uma observação: " . $novoTexto;
            criarAviso($pdo, $agente, $mensagemAviso, $falecidoAviso, (int)$id);
            enviarNotificacaoObservacao($agente, $novoTexto, $falecidoAviso);
            $diff[$cObs] = $novoTexto;
          }
        }
      }

      // Campos que a edição realmente mudou (antes o histórico só via as observações e gravava "sem_alteracoes").
      $depois = null;
      try {
        $stDep = $pdo->prepare("SELECT * FROM {$tbl} WHERE id = :id LIMIT 1");
        $stDep->execute([':id' => $id]);
        $depois = $stDep->fetch(PDO::FETCH_ASSOC) ?: null;
      } catch (Exception $e) {
        $depois = null;
      }
      if ($depois) {
        foreach (campos_alterados_na_edicao($row, $depois, $allUpdateFields) as $campo => $valor) {
          if (!array_key_exists($campo, $diff)) $diff[$campo] = $valor;
        }
      }

      // Gestão alterou item travado: fica no histórico (e avisa quando a baixa do Corpo Pronto já foi feita).
      if ($itensAlteradosAposTrava) {
        $diff['itens_alterados_apos_corpo_pronto'] = $itensAlteradosAposTrava;
        if ($correcaoBaixa !== null) {
          $diff['estoque_corrigido'] = [
            'voltaram' => array_map(fn($e) => ($e['produto'] ?? '') . ' → ' . ($e['local'] ?? '') . ' (' . (int)($e['qtd'] ?? 0) . ')', $correcaoBaixa['estornados']),
            'sairam' => array_map(fn($b) => ($b['produto_nome'] ?? '') . ' ← ' . ($b['deposito_origem'] ?? '') . ' (' . (int)($b['qtd'] ?? 0) . ')', $correcaoBaixa['baixados']),
          ];
        }
      }

      // Salvar sem mudar nada (ex.: "Atualizar OS", toque duplo) não vira linha nas Etapas registradas (08/10/2026).
      // Só grava "sem alterações" quando não deu para reler o registro e conferir.
      if ($diff || !$depois) {
        registrarHistorico($pdo, $id, $json['falecido'] ?? $falecido_ant, $agente, 'editou', $status_ant, $status_ant, json_encode_u($diff ?: ['sem_alteracoes' => true]));
      }
      $resposta = ['sucesso' => true];
      if ($correcaoBaixa !== null) {
        $resposta['baixa_corrigida'] = $correcaoBaixa['mudou'];
        $resposta['estoque_corrigido'] = $diff['estoque_corrigido'] ?? null;
      }
      responder($resposta);
    } catch (Exception $e) {
      responder(['erro' => true, 'msg' => 'Erro ao editar: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
    }
  }


  // -------- 3) SALVAR FOTO OBRIGATÓRIA DA AÇÃO (fase06 / fase08) --------
  if ($acao === "salvar_foto_acao" && isset($json['id'])) {
    try {
      $id = (int)$json['id'];
      if ($id <= 0) responder(['erro' => true, 'msg' => 'ID inválido.'], 400);
      exigir_atendimento_nao_cancelado($pdo, $id);

      [$usuarioIdAcao] = validar_usuario_operacao($pdo, $json);
      $agente = titlecase($_SESSION['usuario_nome']);
      $tipo = $json['tipo'] ?? ($json['foto_tipo'] ?? ($json['status'] ?? ''));
      $cfg = foto_action_config_for_tipo($tipo) ?: foto_action_config_for_status($tipo);
      if (!$cfg) responder(['erro' => true, 'msg' => 'Tipo de foto inválido. Use fim_ornamentacao/fase06 ou entrega_corpo/fase08.'], 400);

      $tbl = table_exists($pdo, 'sepultamentos') ? 'sepultamentos' : null;
      if (!$tbl) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);
      $stmt2 = $pdo->prepare("SELECT * FROM {$tbl} WHERE id = :id LIMIT 1");
      $stmt2->execute([':id' => $id]);
      $row = $stmt2->fetch(PDO::FETCH_ASSOC);
      if (!$row) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);

      $meta = meta_operacao_do_payload($json);
      $operationId = $meta['operation_id'];
      if ($operationId !== '') {
        $existingPhoto = foto_operacao_existente($pdo, $tbl, $id, $cfg, $operationId);
        if ($existingPhoto) {
          responder(['sucesso' => true, 'idempotente' => true, 'tipo' => $cfg['tipo'], 'url' => $existingPhoto['url'] ?? '', 'path' => $existingPhoto['path'] ?? '']);
        }
      }

      // Fora do Memorial, a Entrega de Corpo continua pertencendo ao agente
      // que iniciou a fase07. No Memorial, fase07 não existe: se ainda não
      // houver responsável, permitimos a foto e a responsabilidade será
      // assumida pelo agente desta entrega após a foto ser salva.
      if (($cfg['tipo'] ?? '') === 'entrega_corpo') {
        $owner = garantir_responsavel_do_trecho($pdo, $tbl, $row, 'velorio');
        $ownerId = (int)($owner['id'] ?? 0);

        if ($ownerId <= 0 && !velorio_eh_memorial($row)) {
          responder(['erro' => true, 'msg' => 'O transporte para o velório precisa ser iniciado antes da Entrega de Corpo.'], 409);
        }

        if ($ownerId > 0 && $ownerId !== $usuarioIdAcao) {
          responder(['erro' => true, 'msg' => 'Somente o agente responsável pelo velório pode registrar a Entrega de Corpo.'], 409);
        }
      }

      if (($cfg['tipo'] ?? '') === 'fim_ornamentacao' && origem_operacao($json['origem'] ?? 'online') === 'offline') {
        responder(['erro' => true, 'msg' => 'Fim da Ornamentação permanece online nesta versão.'], 409);
      }

      $base64 = $json['base64'] ?? ($json['foto_base64'] ?? ($json['foto'] ?? null));
      $upload = $_FILES['foto'] ?? null;
      $temUpload = is_array($upload) && (int)($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

      $saveMeta = [
        'operation_id' => $operationId,
        'ocorreu_em' => $meta['ocorreu_em'],
      ];
      $saved = $temUpload
        ? salvar_foto_acao_upload($pdo, $tbl, $id, $cfg, $upload, $agente, $saveMeta)
        : salvar_foto_acao($pdo, $tbl, $id, $cfg, (string)$base64, $agente, $saveMeta);

      if (($cfg['tipo'] ?? '') === 'entrega_corpo' && velorio_eh_memorial($row)) {
        $owner = assumir_responsavel_velorio_memorial(
          $pdo,
          $tbl,
          $row,
          $usuarioIdAcao,
          $agente,
          $meta['ocorreu_em']
        );
        $ownerId = (int)($owner['id'] ?? 0);
        if ($ownerId <= 0 || $ownerId !== $usuarioIdAcao) {
          responder(['erro' => true, 'msg' => 'Outro agente já assumiu a Entrega de Corpo deste atendimento no Memorial.'], 409);
        }
      }

      registrarHistorico(
        $pdo, $id, $row['falecido'] ?? '', $agente, 'salvou foto ' . $cfg['label'], null, null,
        json_encode_u(['foto_url' => $saved['url']]),
        [
          'operation_id' => $operationId,
          'usuario_id' => $usuarioIdAcao,
          'origem' => $meta['origem'],
          'ocorreu_em' => $meta['ocorreu_em'],
          'device_id' => $meta['device_id'],
          'clock_offset_ms' => $meta['clock_offset_ms'],
        ]
      );

      responder([
        'sucesso' => true,
        'tipo' => $cfg['tipo'],
        'url' => $saved['url'],
        'path' => $saved['path'],
        'bytes' => $saved['bytes'] ?? null,
        'width' => $saved['width'] ?? null,
        'height' => $saved['height'] ?? null,
      ]);
    } catch (Exception $e) {
      responder(['erro' => true, 'msg' => 'Erro ao salvar foto da ação: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
    }
  }

  // -------- 4) ATUALIZAR STATUS (RESPONSABILIDADE + IDEMPOTÊNCIA + HORÁRIO OFFLINE) --------
  if ($acao === "atualizar_status" && isset($json['id']) && isset($json['status'])) {
    try {
      $id = (int)$json['id'];
      exigir_atendimento_nao_cancelado($pdo, $id);
      $novo_status = $json['status'];
      $agente = titlecase($_SESSION['usuario_nome']);
      [$usuarioIdAcao, $usuarioLoginAcao, $cargo] = validar_usuario_operacao($pdo, $json);
      $meta = meta_operacao_do_payload($json);

      $tbl = table_exists($pdo, 'sepultamentos') ? 'sepultamentos' : null;
      if (!$tbl) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);
      $status_code = normalize_status_code($novo_status) ?? strtolower(trim((string)$novo_status));

      if ($meta['operation_id'] !== '') {
        $existing = historico_por_operation_id($pdo, $meta['operation_id']);
        if ($existing) responder(['sucesso' => true, 'idempotente' => true, 'status' => $existing['status_novo'] ?? $status_code]);
      }

      // Fases que definem o responsável só podem nascer numa requisição online real.
      if ($meta['origem'] === 'offline' && in_array($status_code, ['fase07','fase09'], true)) {
        responder(['erro' => true, 'msg' => 'Esta etapa precisa ser iniciada online para registrar o responsável.'], 409);
      }

      if (in_array($status_code, ['fase03','fase04'], true)) {
        $confirmar = $json['confirmar'] ?? ($json['extra']['confirmar'] ?? false);
        $confirmOk = ($confirmar === true || $confirmar === 1 || $confirmar === "1" || $confirmar === "true");
        if (!$confirmOk) responder(['erro' => true, 'msg' => 'Confirmação obrigatória para esta ação.'], 400);
        if (!usuario_pode_conservacao($usuarioIdAcao, $cargo)) {
          responder(['erro' => true, 'msg' => 'Somente os tanatopraxistas autorizados podem iniciar ou finalizar a conservação.'], 403);
        }
      }

      $stmt2 = $pdo->prepare("SELECT * FROM {$tbl} WHERE id = :id LIMIT 1");
      $stmt2->execute([':id' => $id]);
      $row = $stmt2->fetch(PDO::FETCH_ASSOC);
      if (!$row) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);

      $falecido = $row['falecido'] ?? '';
      $status_antigo_code = normalize_status_code($row['status'] ?? null) ?? strtolower(trim((string)($row['status'] ?? '')));
      validar_status_anterior_payload($row, $json, $status_antigo_code);

      if ($status_code === 'fase12') {
        $tipoAtendimentoAtual = strtolower(trim((string)($row['tipo_atendimento'] ?? '')));
        if ($tipoAtendimentoAtual === 'terceiro') responder(['erro' => true, 'msg' => 'Corpo Pronto não faz parte do fluxo de atendimento terceiro.'], 400);
      }

      if ($status_code === 'fase08') {
        $owner = garantir_responsavel_do_trecho($pdo, $tbl, $row, 'velorio');
        $ownerId = (int)($owner['id'] ?? 0);
        $memorial = velorio_eh_memorial($row);

        // No Memorial, a ausência de responsável é válida porque fase07 foi
        // pulada. A responsabilidade só será assumida depois que a foto da
        // Entrega de Corpo estiver validada/salva.
        if ($ownerId <= 0 && !$memorial) {
          responder(['erro' => true, 'msg' => 'O transporte para o velório precisa ser iniciado antes da Entrega de Corpo.'], 409);
        }

        if ($ownerId > 0 && $ownerId !== $usuarioIdAcao) {
          $msg = $memorial
            ? 'Somente o agente que assumiu a Entrega de Corpo no Memorial pode confirmar esta etapa.'
            : 'Somente o agente que iniciou o transporte para o velório pode confirmar a Entrega de Corpo.';
          responder(['erro' => true, 'msg' => $msg], 409);
        }
      }
      if ($status_code === 'fase10') {
        $owner = garantir_responsavel_do_trecho($pdo, $tbl, $row, 'sepultamento');
        $ownerId = (int)($owner['id'] ?? 0);
        if ($ownerId <= 0 || $ownerId !== $usuarioIdAcao) {
          responder(['erro' => true, 'msg' => 'Somente o agente que iniciou o transporte para sepultamento pode concluir o sepultamento.'], 409);
        }
      }

      $fotoCfg = foto_action_config_for_status($status_code);
      $fotoSalvaUrl = null;
      if ($fotoCfg) {
        ensure_foto_columns_or_erro($pdo, $tbl, $fotoCfg);
        $base64Foto = $json['foto_base64'] ?? ($json['base64'] ?? ($json['foto'] ?? null));
        if ($base64Foto && is_string($base64Foto)) {
          $savedFoto = salvar_foto_acao($pdo, $tbl, $id, $fotoCfg, $base64Foto, $agente, ['ocorreu_em' => $meta['ocorreu_em']]);
          $fotoSalvaUrl = $savedFoto['url'] ?? null;
        } elseif (!registro_tem_foto_acao($pdo, $tbl, $id, $fotoCfg)) {
          responder(['erro' => true, 'foto_obrigatoria' => true, 'tipo' => $fotoCfg['tipo'], 'msg' => 'Foto obrigatória para confirmar: ' . $fotoCfg['label'] . '. Abra a câmera, tire a foto e clique em salvar.'], 400);
        }
      }

      // Depois da foto obrigatória estar validada, o primeiro agente da
      // Entrega de Corpo no Memorial assume a responsabilidade do velório.
      if ($status_code === 'fase08' && velorio_eh_memorial($row)) {
        $owner = assumir_responsavel_velorio_memorial(
          $pdo,
          $tbl,
          $row,
          $usuarioIdAcao,
          $agente,
          $meta['ocorreu_em']
        );
        $ownerId = (int)($owner['id'] ?? 0);
        if ($ownerId <= 0 || $ownerId !== $usuarioIdAcao) {
          responder(['erro' => true, 'msg' => 'Outro agente já assumiu a Entrega de Corpo deste atendimento no Memorial.'], 409);
        }
      }

      $sets = [];
      $params = [':id' => $id];
      if (column_exists($pdo, $tbl, 'status')) { $sets[] = "status = :status"; $params[':status'] = $status_code ?: $novo_status; }
      if (column_exists($pdo, $tbl, 'agente')) { $sets[] = "agente = :agente"; $params[':agente'] = $agente; }

      if ($status_code === 'fase07') {
        exigir_colunas_responsabilidade($pdo, $tbl, 'velorio');
        $sets[] = 'responsavel_velorio_id = :resp_vel_id';
        $sets[] = 'responsavel_velorio_nome = :resp_vel_nome';
        $sets[] = 'responsavel_velorio_desde = NOW()';
        $params[':resp_vel_id'] = $usuarioIdAcao;
        $params[':resp_vel_nome'] = $agente;
      }
      if ($status_code === 'fase09') {
        exigir_colunas_responsabilidade($pdo, $tbl, 'sepultamento');
        $sets[] = 'responsavel_sepultamento_id = :resp_sep_id';
        $sets[] = 'responsavel_sepultamento_nome = :resp_sep_nome';
        $sets[] = 'responsavel_sepultamento_desde = NOW()';
        $params[':resp_sep_id'] = $usuarioIdAcao;
        $params[':resp_sep_nome'] = $agente;
      }

      if (!$sets) responder(['erro' => true, 'msg' => 'Tabela sem colunas para atualizar status.'], 500);
      $stmt = $pdo->prepare("UPDATE {$tbl} SET " . implode(', ', $sets) . " WHERE id = :id");
      $stmt->execute($params);

      $acaoPush = $status_code ?: (string)$novo_status;
      enviarNotificacaoAcao($agente, $acaoPush, $falecido);
      registrarHistorico(
        $pdo, $id, $falecido, $agente, 'atualizou status', $status_antigo_code, $status_code ?: $novo_status,
        $fotoSalvaUrl ? json_encode_u(['foto_url' => $fotoSalvaUrl]) : null,
        [
          'operation_id' => $meta['operation_id'],
          'usuario_id' => $usuarioIdAcao,
          'origem' => $meta['origem'],
          'ocorreu_em' => $meta['ocorreu_em'],
          'device_id' => $meta['device_id'],
          'clock_offset_ms' => $meta['clock_offset_ms'],
        ]
      );

      responder(['sucesso' => true, 'foto_url' => $fotoSalvaUrl, 'status' => $status_code]);
    } catch (Exception $e) {
      responder(['erro' => true, 'msg' => 'Erro ao atualizar status: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
    }
  }

  // -------- 5) MATERIAL RECOLHIDO --------
  if ($acao === "material_recolhido" && isset($json['id'])) {
    try {
      $id = (int)$json['id'];
      exigir_atendimento_nao_cancelado($pdo, $id);
      $agente = titlecase($_SESSION['usuario_nome']);
      [$usuarioIdAcao] = validar_usuario_operacao($pdo, $json);
      $meta = meta_operacao_do_payload($json);

      if ($meta['operation_id'] !== '') {
        $existing = historico_por_operation_id($pdo, $meta['operation_id']);
        if ($existing) responder(['sucesso' => true, 'idempotente' => true, 'status' => 'fase11']);
      }

      $tbl = table_exists($pdo, 'sepultamentos') ? 'sepultamentos' : null;
      if (!$tbl) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);
      $stmt2 = $pdo->prepare("SELECT * FROM {$tbl} WHERE id = :id LIMIT 1");
      $stmt2->execute([':id' => $id]);
      $row = $stmt2->fetch(PDO::FETCH_ASSOC);
      if (!$row) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);

      $falecido = $row['falecido'] ?? '';
      $status_antigo = normalize_status_code($row['status'] ?? null) ?? strtolower(trim((string)($row['status'] ?? '')));
      validar_status_anterior_payload($row, $json, $status_antigo);

      $set = [];
      $params = [':id' => $id];
      if (column_exists($pdo, $tbl, 'status')) { $set[] = "status = 'fase11'"; }
      if (column_exists($pdo, $tbl, 'material_recolhido')) { $set[] = "material_recolhido = 1"; }
      if (column_exists($pdo, $tbl, 'data_material_recolhido')) {
        $set[] = "data_material_recolhido = :data_material";
        $params[':data_material'] = $meta['ocorreu_em'] ?: date('Y-m-d H:i:s');
      }
      if (column_exists($pdo, $tbl, 'agente')) { $set[] = "agente = :agente"; $params[':agente'] = $agente; }
      if (!$set) responder(['erro' => true, 'msg' => 'Tabela sem colunas para marcar material recolhido.'], 500);

      $stmt = $pdo->prepare("UPDATE {$tbl} SET " . implode(', ', $set) . " WHERE id = :id");
      $stmt->execute($params);

      enviarNotificacaoAcao($agente, 'fase11', $falecido);
      registrarHistorico(
        $pdo, $id, $falecido, $agente, 'material_recolhido', $status_antigo, 'fase11', null,
        [
          'operation_id' => $meta['operation_id'],
          'usuario_id' => $usuarioIdAcao,
          'origem' => $meta['origem'],
          'ocorreu_em' => $meta['ocorreu_em'],
          'device_id' => $meta['device_id'],
          'clock_offset_ms' => $meta['clock_offset_ms'],
        ]
      );

      responder(['sucesso' => true, 'status' => 'fase11']);
    } catch (Exception $e) {
      responder(['erro' => true, 'msg' => 'Erro ao marcar material recolhido: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
    }
  }

  // -------- 6) SALVAR ASSINATURA --------
  if ($acao === "salvar_assinatura" && isset($json['id'])) {
    try {
      $id     = (int)$json['id'];
      exigir_atendimento_nao_cancelado($pdo, $id);
      $tipo   = strtolower(trim($json['tipo'] ?? '')); // 'responsavel' | 'requerente'
      $base64 = $json['base64'] ?? null;

      $nomeAss = trim((string)($json['nome_assinatura'] ?? ''));
      $cpfAss  = preg_replace('/\D+/', '', (string)($json['cpf_assinatura'] ?? ''));
      if (strlen($cpfAss) > 11) $cpfAss = substr($cpfAss, 0, 11);

      $agente = titlecase($_SESSION['usuario_nome']);

      if ($id <= 0 || !in_array($tipo, ['responsavel','requerente'], true)) {
        responder(['erro' => true, 'msg' => 'Parâmetros inválidos.'], 400);
      }
      if (!$base64 || !is_string($base64)) {
        responder(['erro' => true, 'msg' => 'Assinatura (base64) não enviada.'], 400);
      }

      if (strpos($base64, 'data:image') === 0) $base64 = substr($base64, strpos($base64, ',') + 1);
      $bin = base64_decode($base64);
      if ($bin === false) responder(['erro' => true, 'msg' => 'Base64 inválido.'], 400);

      $dir = __DIR__ . '/uploads/assinaturas/';
      if (!is_dir($dir)) @mkdir($dir, 0775, true);

      $campo     = $tipo === 'responsavel' ? 'assinatura_responsavel' : 'assinatura_requerente';
      $campoNome = $campo . '_nome';
      $campoCpf  = $campo . '_cpf';

      $fileName  = $campo . '_' . $id . '_' . time() . '.png';
      $filePath  = $dir . $fileName;

      if (@file_put_contents($filePath, $bin) === false) {
        responder(['erro' => true, 'msg' => 'Falha ao salvar o arquivo de assinatura.'], 500);
      }

      $publicUrl = '/uploads/assinaturas/' . $fileName;

      $tbl = pick_table_for_id($pdo, $id);
      if (!$tbl) responder(['erro' => true, 'msg' => 'Registro não encontrado.'], 404);

      // só atualiza colunas que existirem
      $set = [];
      $params = [':id' => $id, ':agente' => $agente];

      if (column_exists($pdo, $tbl, $campo)) { $set[] = "{$campo} = :url"; $params[':url'] = $publicUrl; }
      if (column_exists($pdo, $tbl, $campoNome)) { $set[] = "{$campoNome} = COALESCE(:nome, {$campoNome})"; $params[':nome'] = ($nomeAss !== '' ? $nomeAss : null); }
      if (column_exists($pdo, $tbl, $campoCpf)) { $set[] = "{$campoCpf} = COALESCE(:cpf, {$campoCpf})"; $params[':cpf'] = ($cpfAss !== '' ? $cpfAss : null); }
      if (column_exists($pdo, $tbl, 'agente')) { $set[] = "agente = :agente"; }

      if (!$set) responder(['erro' => true, 'msg' => 'Tabela sem colunas para salvar assinatura.'], 500);

      $stmt = $pdo->prepare("UPDATE {$tbl} SET " . implode(", ", $set) . " WHERE id = :id");
      $stmt->execute($params);

      $stmt2 = $pdo->prepare("SELECT falecido FROM {$tbl} WHERE id = :id");
      $stmt2->execute([':id' => $id]);
      $row = $stmt2->fetch(PDO::FETCH_ASSOC);
      $falecido = $row['falecido'] ?? '';

      registrarHistorico($pdo, $id, $falecido, $agente, "assinou $campo", null, null, $publicUrl);
      responder(['sucesso' => true, 'url' => $publicUrl]);
    } catch (Exception $e) {
      responder(['erro' => true, 'msg' => 'Erro ao salvar assinatura: ' . (function_exists('paiErroTexto') ? paiErroTexto($e) : $e->getMessage())], 500);
    }
  }

  responder(['erro' => true, 'msg' => 'Ação inválida'], 400);
}

responder(['erro' => true, 'msg' => 'Requisição inválida'], 400);
