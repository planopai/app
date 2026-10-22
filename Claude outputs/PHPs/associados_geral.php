<?php
ob_start();
header('Content-Type: application/json; charset=utf-8');

header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

/**
 * ==========================
 * CORS
 * ==========================
 */
$allowedOrigins = [
  'https://club.planoassistencialintegrado.com.br',
  'https://www.club.planoassistencialintegrado.com.br',
  'https://app.planoassistencialintegrado.com.br',
  'https://pai.planoassistencialintegrado.com.br',
  'https://planoassistencialintegrado.com.br',
  'https://www.planoassistencialintegrado.com.br',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $allowedOrigins, true)) {
  header_remove('Access-Control-Allow-Origin');
  header_remove('Access-Control-Allow-Credentials');
  header_remove('Access-Control-Allow-Methods');
  header_remove('Access-Control-Allow-Headers');
  header_remove('Access-Control-Max-Age');

  header("Access-Control-Allow-Origin: $origin");
  header('Access-Control-Allow-Credentials: true');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

  // ✅ permite o FRONT ler o header X-Pagination
  header('Access-Control-Expose-Headers: X-Pagination, x-pagination');

  $reqHeaders = $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? '';
  if ($reqHeaders) {
    $h = strtolower($reqHeaders);
    if (strpos($h, 'content-type') === false) $reqHeaders .= ', content-type';
    header("Access-Control-Allow-Headers: $reqHeaders");
  } else {
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization, Expires, Cache-Control, Pragma');
  }

  header('Access-Control-Max-Age: 86400');
  header('Vary: Origin');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  ob_end_flush();
  exit;
}

/**
 * ==========================
 * Cache / concorrência
 * ==========================
 *
 * Este endpoint não mantém uma sessão PHP aberta durante chamadas
 * externas. Uma sessão aberta mantém um lock por usuário e serializa
 * requisições paralelas, o que bloqueava paginação e pesquisa enquanto
 * o catálogo dos filtros estava sendo carregado.
 */

/**
 * ==========================
 * CONFIGURAÇÃO PRIVADA
 * ==========================
 *
 * Este arquivo deve existir FORA da pasta pública:
 *   /home2/pla48587/pai-chaves.php
 *
 * Nunca coloque pai-chaves.php dentro de:
 *   /home2/pla48587/api.planoassistencialintegrado.com/
 */
$PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';

if (!is_file($PAI_CHAVES_FILE) || !is_readable($PAI_CHAVES_FILE)) {
  http_response_code(500);
  echo json_encode([
    'ok'=>false,
    'error'=>'Arquivo privado de configuração não encontrado ou sem permissão de leitura.'
  ], JSON_UNESCAPED_UNICODE);
  ob_end_flush();
  exit;
}

$PAI_CONFIG = require $PAI_CHAVES_FILE;

if (!is_array($PAI_CONFIG)) {
  http_response_code(500);
  echo json_encode([
    'ok'=>false,
    'error'=>'Arquivo privado de configuração inválido.'
  ], JSON_UNESCAPED_UNICODE);
  ob_end_flush();
  exit;
}

/**
 * ==========================
 * DB
 * ==========================
 */
$servername = trim((string)($PAI_CONFIG['db_host'] ?? ''));
$username   = trim((string)($PAI_CONFIG['db_user'] ?? ''));
$password   = (string)($PAI_CONFIG['db_password'] ?? '');
$dbname     = trim((string)($PAI_CONFIG['db_name'] ?? ''));

if (
  $servername === '' ||
  $username === '' ||
  $password === '' ||
  $dbname === ''
) {
  http_response_code(500);
  echo json_encode([
    'ok'=>false,
    'error'=>'Configuração do banco incompleta em pai-chaves.php.'
  ], JSON_UNESCAPED_UNICODE);
  ob_end_flush();
  exit;
}

$mysqli = new mysqli($servername, $username, $password, $dbname);
if ($mysqli->connect_error) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'Falha DB'], JSON_UNESCAPED_UNICODE);
  ob_end_flush();
  exit;
}
$mysqli->set_charset("utf8mb4");

/**
 * ==========================
 * Helpers
 * ==========================
 */
function out($status, $arr) {
  http_response_code($status);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  ob_end_flush();
  exit;
}

function onlyDigits($s) { return preg_replace('/\D+/', '', (string)$s); }
function normEmail($s) { return strtolower(trim((string)$s)); }
function normTelefone($s) { return onlyDigits($s); }

function bodyAny() {
  $raw = file_get_contents('php://input');
  $j = json_decode($raw, true);
  if (is_array($j)) return $j;
  if (!empty($_POST)) return $_POST;
  $out = [];
  parse_str($raw, $out);
  return is_array($out) ? $out : [];
}


function pai_cache_base_dir() {
  $dir = rtrim((string)sys_get_temp_dir(), DIRECTORY_SEPARATOR);
  return $dir !== '' ? $dir : __DIR__;
}

function pai_cache_path($key) {
  $fingerprint = hash('sha256', __FILE__ . '|' . (string)$key);
  return pai_cache_base_dir() . DIRECTORY_SEPARATOR . 'pai_assoc_' . $fingerprint . '.json';
}

function pai_cache_lock_path($key) {
  return pai_cache_path($key) . '.lock';
}

function pai_cache_get($key, $ttlSeconds = 600) {
  $path = pai_cache_path($key);
  if (!is_file($path)) return null;

  $raw = @file_get_contents($path);
  if ($raw === false || trim($raw) === '') return null;

  $payload = json_decode($raw, true);
  if (
    !is_array($payload) ||
    !isset($payload['ts']) ||
    !array_key_exists('data', $payload)
  ) {
    @unlink($path);
    return null;
  }

  if (
    $ttlSeconds > 0 &&
    (time() - (int)$payload['ts']) > (int)$ttlSeconds
  ) {
    @unlink($path);
    return null;
  }

  return $payload['data'];
}

function pai_cache_set($key, $data) {
  $path = pai_cache_path($key);
  $payload = json_encode(
    ['ts'=>time(), 'data'=>$data],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
  );

  if ($payload === false) return false;

  try {
    $suffix = bin2hex(random_bytes(4));
  } catch (Throwable $e) {
    $suffix = uniqid('', true);
  }

  $tmp = $path . '.' . getmypid() . '.' . $suffix;
  $ok = @file_put_contents($tmp, $payload, LOCK_EX);
  if ($ok === false) {
    @unlink($tmp);
    return false;
  }

  @chmod($tmp, 0600);

  if (!@rename($tmp, $path)) {
    @unlink($tmp);
    return false;
  }

  @chmod($path, 0600);
  return true;
}

function pai_cache_delete($key) {
  $path = pai_cache_path($key);
  if (is_file($path)) @unlink($path);
}

function pai_cache_acquire_lock($key) {
  $path = pai_cache_lock_path($key);
  $fp = @fopen($path, 'c+');
  if (!$fp) return null;

  if (!@flock($fp, LOCK_EX)) {
    @fclose($fp);
    return null;
  }

  return $fp;
}

function pai_cache_release_lock($fp) {
  if (!is_resource($fp)) return;
  @flock($fp, LOCK_UN);
  @fclose($fp);
}


function formatCpf($digits11) {
  $d = onlyDigits($digits11);
  if (strlen($d) !== 11) return $digits11;
  return substr($d,0,3).'.'.substr($d,3,3).'.'.substr($d,6,3).'-'.substr($d,9,2);
}


function base64url_encode_pai($value) {
  return rtrim(
    strtr(base64_encode((string)$value), '+/', '-_'),
    '='
  );
}

function base64url_decode_pai($value) {
  $value = strtr((string)$value, '-_', '+/');
  $padding = strlen($value) % 4;

  if ($padding > 0) {
    $value .= str_repeat('=', 4 - $padding);
  }

  $decoded = base64_decode($value, true);
  return $decoded === false ? null : $decoded;
}

function create_access_token(
  $titularCpf,
  $targetCpf,
  $tipo,
  $nome,
  $idContrato
) {
  global $ACCESS_LINK_SECRET;

  $titular = onlyDigits($titularCpf);
  $target = onlyDigits($targetCpf);
  $tipo = strtoupper(trim((string)$tipo));
  $idContrato = (int)$idContrato;

  if (
    strlen($titular) !== 11 ||
    strlen($target) !== 11 ||
    !in_array($tipo, ['T','D','A'], true)
  ) {
    return '';
  }

  $payload = [
    'v' => 1,
    'titular_cpf' => $titular,
    'cpf' => $target,
    'tipo' => $tipo,
    'nome' => trim((string)$nome),
    'id_contrato' => $idContrato,
    'iat' => time(),
    'exp' => time() + (30 * 60),
  ];

  $json = json_encode(
    $payload,
    JSON_UNESCAPED_UNICODE |
    JSON_UNESCAPED_SLASHES
  );

  if ($json === false) return '';

  $body = base64url_encode_pai($json);

  $signature = hash_hmac(
    'sha256',
    $body,
    $ACCESS_LINK_SECRET,
    true
  );

  return $body . '.' .
    base64url_encode_pai($signature);
}

function verify_access_token(
  $token,
  $titularCpf,
  $targetCpf,
  $tipo,
  $idContrato
) {
  global $ACCESS_LINK_SECRET;

  $token = trim((string)$token);

  if ($token === '' || strpos($token, '.') === false) {
    return [
      'ok'=>false,
      'error'=>'Autorização do beneficiário ausente. Reabra os detalhes do contrato.',
    ];
  }

  [$body, $signaturePart] = explode('.', $token, 2);

  $providedSignature = base64url_decode_pai(
    $signaturePart
  );

  if ($providedSignature === null) {
    return [
      'ok'=>false,
      'error'=>'Autorização do beneficiário inválida.',
    ];
  }

  $expectedSignature = hash_hmac(
    'sha256',
    $body,
    $ACCESS_LINK_SECRET,
    true
  );

  if (!hash_equals(
    $expectedSignature,
    $providedSignature
  )) {
    return [
      'ok'=>false,
      'error'=>'Autorização do beneficiário inválida.',
    ];
  }

  $json = base64url_decode_pai($body);
  $payload = $json !== null
    ? json_decode($json, true)
    : null;

  if (!is_array($payload)) {
    return [
      'ok'=>false,
      'error'=>'Autorização do beneficiário inválida.',
    ];
  }

  $payloadTitular = onlyDigits(
    $payload['titular_cpf'] ?? ''
  );

  $payloadCpf = onlyDigits(
    $payload['cpf'] ?? ''
  );

  $payloadTipo = strtoupper(
    trim((string)($payload['tipo'] ?? ''))
  );

  $payloadContrato = (int)(
    $payload['id_contrato'] ?? 0
  );

  $expiresAt = (int)(
    $payload['exp'] ?? 0
  );

  if ($expiresAt <= time()) {
    return [
      'ok'=>false,
      'error'=>'A autorização expirou. Reabra os detalhes do contrato.',
    ];
  }

  if (
    $payloadTitular !== onlyDigits($titularCpf) ||
    $payloadCpf !== onlyDigits($targetCpf) ||
    $payloadTipo !== strtoupper(trim((string)$tipo))
  ) {
    return [
      'ok'=>false,
      'error'=>'Os dados do beneficiário não correspondem à autorização.',
    ];
  }

  $requestedContrato = (int)$idContrato;

  if (
    $payloadContrato > 0 &&
    $requestedContrato > 0 &&
    $payloadContrato !== $requestedContrato
  ) {
    return [
      'ok'=>false,
      'error'=>'A autorização pertence a outro contrato.',
    ];
  }

  return [
    'ok'=>true,
    'tipo'=>$payloadTipo,
    'cpf'=>$payloadCpf,
    'nome'=>(string)($payload['nome'] ?? ''),
  ];
}

function makeTempPassword($len = 10) {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#!?';
  $out = '';
  for ($i=0; $i<$len; $i++) $out .= $alphabet[random_int(0, strlen($alphabet)-1)];
  return $out;
}

function sendMailSimple($toEmail, $subject, $msg) {
  $from = 'suporte@planoassistencialintegrado.com.br';
  $headers = [];
  $headers[] = "From: Plano PAI <$from>";
  $headers[] = "Reply-To: $from";
  $headers[] = "MIME-Version: 1.0";
  $headers[] = "Content-Type: text/plain; charset=UTF-8";
  return @mail($toEmail, $subject, $msg, implode("\r\n", $headers));
}

/**
 * ==========================
 * UNYPAX / UNYFINTECH
 * ==========================
 *
 * As credenciais são carregadas de:
 *   /home2/pla48587/pai-chaves.php
 */
$UNY_CHAVE = trim((string)($PAI_CONFIG['uny_chave'] ?? ''));
$UNY_EMAIL = trim((string)($PAI_CONFIG['uny_email'] ?? ''));
$UNY_SENHA = (string)($PAI_CONFIG['uny_senha'] ?? '');

$UNY_CAIXA_BANCO_ID = (int)($PAI_CONFIG['uny_caixa_banco_id'] ?? 0);

$UNYFINTECH_API_BASE = rtrim(
  trim((string)($PAI_CONFIG['unyfintech_api_base'] ?? '')),
  '/'
);

$ACCESS_LINK_SECRET = trim((string)($PAI_CONFIG['access_link_secret'] ?? ''));

if (
  $UNY_CHAVE === '' ||
  $UNY_EMAIL === '' ||
  $UNY_SENHA === ''
) {
  out(500, [
    'ok'=>false,
    'error'=>'Configuração Unypax incompleta em pai-chaves.php.'
  ]);
}

if ($UNY_CAIXA_BANCO_ID <= 0) {
  out(500, [
    'ok'=>false,
    'error'=>'uny_caixa_banco_id inválido em pai-chaves.php.'
  ]);
}

if ($UNYFINTECH_API_BASE === '') {
  out(500, [
    'ok'=>false,
    'error'=>'unyfintech_api_base ausente em pai-chaves.php.'
  ]);
}

if ($ACCESS_LINK_SECRET === '') {
  out(500, [
    'ok'=>false,
    'error'=>'access_link_secret ausente em pai-chaves.php.'
  ]);
}

/**
 * cURL com captura de headers.
 *
 * IMPORTANTE:
 * - "ok" indica apenas que houve resposta de transporte/cURL.
 * - O código HTTP é validado pelas funções da integração Unypax.
 */
function curl_json($method, $url, $headers = [], $body = null) {
  $ch = curl_init();

  $respHeaders = [];
  $headerFn = function($ch, $headerLine) use (&$respHeaders) {
    $len = strlen($headerLine);
    $parts = explode(':', $headerLine, 2);
    if (count($parts) === 2) {
      $name = strtolower(trim($parts[0]));
      $value = trim($parts[1]);
      if (!isset($respHeaders[$name])) $respHeaders[$name] = [];
      $respHeaders[$name][] = $value;
    }
    return $len;
  };

  $opts = [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => strtoupper((string)$method),
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_TIMEOUT => 45,
    CURLOPT_HEADERFUNCTION => $headerFn,
    CURLOPT_ENCODING => '',
  ];

  if ($body !== null) {
    $payload = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
      return [
        'ok'=>false,
        'http'=>0,
        'error'=>'Falha ao serializar payload JSON.',
        'raw'=>null,
        'json'=>null,
        'headers'=>[],
      ];
    }

    $opts[CURLOPT_POSTFIELDS] = $payload;

    $hasContentType = false;
    $hasAccept = false;
    foreach ($headers as $h) {
      $lh = strtolower((string)$h);
      if (strpos($lh, 'content-type:') === 0) $hasContentType = true;
      if (strpos($lh, 'accept:') === 0) $hasAccept = true;
    }
    if (!$hasContentType) $headers[] = 'Content-Type: application/json';
    if (!$hasAccept) $headers[] = 'Accept: application/json';
    $opts[CURLOPT_HTTPHEADER] = $headers;
  }

  curl_setopt_array($ch, $opts);
  $resp = curl_exec($ch);
  $err  = curl_error($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($resp === false) {
    return [
      'ok'=>false,
      'http'=>$code,
      'error'=>$err ? "cURL: $err" : 'Falha de transporte ao acessar a API.',
      'raw'=>null,
      'json'=>null,
      'headers'=>$respHeaders,
    ];
  }

  $json = null;
  if ($resp !== '') {
    $decoded = json_decode($resp, true);
    if (json_last_error() === JSON_ERROR_NONE) {
      $json = $decoded;
    }
  }

  return [
    'ok'=>true,
    'http'=>$code,
    'raw'=>$resp,
    'json'=>$json,
    'headers'=>$respHeaders,
  ];
}

function is_list_array_compat($value) {
  if (!is_array($value)) return false;
  if ($value === []) return true;
  return array_keys($value) === range(0, count($value) - 1);
}

function uny_error_message($json, $fallback = 'Falha na API Unypax.') {
  if (!is_array($json)) return $fallback;

  foreach (['error', 'erro', 'message', 'mensagem', 'detail', 'title'] as $key) {
    if (!isset($json[$key])) continue;
    $value = $json[$key];
    if (is_string($value) && trim($value) !== '') return trim($value);
  }

  foreach (['errors', 'erros'] as $key) {
    if (!isset($json[$key])) continue;
    $value = $json[$key];

    if (is_string($value) && trim($value) !== '') return trim($value);

    if (is_array($value)) {
      $parts = [];
      foreach ($value as $item) {
        if (is_string($item) && trim($item) !== '') {
          $parts[] = trim($item);
        } elseif (is_array($item)) {
          foreach ($item as $sub) {
            if (is_string($sub) && trim($sub) !== '') $parts[] = trim($sub);
          }
        }
      }
      if ($parts) return implode(' | ', array_values(array_unique($parts)));
    }
  }

  return $fallback;
}

function uny_log_failure($context, $response) {
  $http = (int)($response['http'] ?? 0);
  $json = $response['json'] ?? null;
  $msg = uny_error_message($json, (string)($response['error'] ?? 'sem detalhe'));
  error_log('[PAI/Unypax] ' . $context . ' | HTTP ' . $http . ' | ' . $msg);
}

/**
 * A documentação descreve parâmetros array pelo mesmo nome (ex.: situacao).
 * O formato principal enviado é:
 *   situacao=2&situacao=3
 * Há fallback para situacao[]=2&situacao[]=3 apenas para compatibilidade
 * com versões anteriores do endpoint.
 */
function uny_build_query($baseParams, $arrayParams = [], $bracketArrays = false) {
  $parts = [];

  foreach ($baseParams as $key => $value) {
    if ($value === null || $value === '') continue;
    $parts[] = rawurlencode((string)$key) . '=' . rawurlencode((string)$value);
  }

  foreach ($arrayParams as $key => $values) {
    if (!is_array($values)) continue;
    foreach ($values as $value) {
      if ($value === null || $value === '') continue;
      $paramName = $bracketArrays ? ((string)$key . '[]') : (string)$key;
      $parts[] = rawurlencode($paramName) . '=' . rawurlencode((string)$value);
    }
  }

  return implode('&', $parts);
}

/**
 * Extrai listas de respostas de SearchAsync sem assumir um único wrapper.
 * Mantém compatibilidade com lista direta, {data:[...]}, {items:[...]}
 * e wrappers aninhados desses campos.
 */
function uny_extract_items($payload, $depth = 0) {
  if (!is_array($payload) || $depth > 4) return null;
  if (is_list_array_compat($payload)) return $payload;

  foreach (['data', 'items', 'result', 'results'] as $key) {
    if (isset($payload[$key]) && is_array($payload[$key])) {
      $found = uny_extract_items($payload[$key], $depth + 1);
      if (is_array($found)) return $found;
    }
  }

  return null;
}

function uny_pagination_value($payload, $keys, $default = null) {
  if (!is_array($payload)) return $default;

  foreach ((array)$keys as $key) {
    if (
      array_key_exists($key, $payload) &&
      $payload[$key] !== null &&
      $payload[$key] !== ''
    ) {
      return $payload[$key];
    }
  }

  return $default;
}

function uny_bool_value($value, $default = null) {
  if (is_bool($value)) return $value;
  if (is_numeric($value)) return ((int)$value) !== 0;

  $s = strtolower(trim((string)$value));

  if (in_array($s, ['true','1','yes','sim'], true)) return true;
  if (in_array($s, ['false','0','no','nao','não'], true)) return false;

  return $default;
}

function uny_normalize_pagination($payload, $fallbackPage = 1, $fallbackPageSize = 10) {
  if (!is_array($payload)) return null;

  $pageNumber = (int)uny_pagination_value(
    $payload,
    ['pageNumber','PageNumber','currentPage','CurrentPage','currentPageNumber','CurrentPageNumber'],
    $fallbackPage
  );

  $pageSize = (int)uny_pagination_value(
    $payload,
    ['pageSize','PageSize','itemsPerPage','ItemsPerPage'],
    $fallbackPageSize
  );

  $pageCount = (int)uny_pagination_value(
    $payload,
    ['pageCount','PageCount','totalPages','TotalPages'],
    0
  );

  $totalItemCount = (int)uny_pagination_value(
    $payload,
    ['totalItemCount','TotalItemCount','totalCount','TotalCount','totalRecords','TotalRecords','recordCount','RecordCount'],
    0
  );

  if ($pageCount <= 0 && $pageSize > 0 && $totalItemCount > 0) {
    $pageCount = (int)ceil($totalItemCount / $pageSize);
  }

  $hasNext = uny_bool_value(
    uny_pagination_value($payload, ['hasNextPage','HasNextPage','hasNext','HasNext'], null),
    $pageCount > 0 ? $pageNumber < $pageCount : null
  );

  $hasPrevious = uny_bool_value(
    uny_pagination_value($payload, ['hasPreviousPage','HasPreviousPage','hasPrevious','HasPrevious'], null),
    $pageNumber > 1
  );

  return [
    'pageNumber' => $pageNumber > 0 ? $pageNumber : max(1, (int)$fallbackPage),
    'pageSize' => $pageSize > 0 ? $pageSize : max(1, (int)$fallbackPageSize),
    'pageCount' => max(0, $pageCount),
    'totalItemCount' => max(0, $totalItemCount),
    'hasNextPage' => $hasNext,
    'hasPreviousPage' => (bool)$hasPrevious,
  ];
}

function uny_pagination_from_headers($headers, $fallbackPage = 1, $fallbackPageSize = 10) {
  if (!is_array($headers)) return null;

  $raw =
    $headers['x-pagination'][0] ??
    $headers['X-Pagination'][0] ??
    null;

  if (!$raw || !is_string($raw)) return null;

  $json = json_decode($raw, true);
  if (!is_array($json)) return null;

  return uny_normalize_pagination($json, $fallbackPage, $fallbackPageSize);
}

function make_response_pagination($upstream, $requestedPage, $requestedPageSize, $itemsOnPage) {
  $requestedPage = max(1, (int)$requestedPage);
  $requestedPageSize = max(1, (int)$requestedPageSize);

  $normalized = is_array($upstream)
    ? uny_normalize_pagination($upstream, $requestedPage, $requestedPageSize)
    : null;

  $total = (int)($normalized['totalItemCount'] ?? 0);
  $pageSize = (int)($normalized['pageSize'] ?? $requestedPageSize);
  if ($pageSize <= 0) $pageSize = $requestedPageSize;

  $pageCount = (int)($normalized['pageCount'] ?? 0);
  if ($pageCount <= 0 && $total > 0) {
    $pageCount = (int)ceil($total / $pageSize);
  }

  $first = $itemsOnPage > 0
    ? (($requestedPage - 1) * $pageSize) + 1
    : 0;

  $last = $itemsOnPage > 0
    ? $first + $itemsOnPage - 1
    : 0;

  if ($total > 0 && $last > $total) $last = $total;

  return [
    'pageNumber' => $requestedPage,
    'pageSize' => $pageSize,
    'pageCount' => max(0, $pageCount),
    'totalItemCount' => max(0, $total),
    'hasPreviousPage' => $requestedPage > 1,
    'hasNextPage' => $pageCount > 0
      ? $requestedPage < $pageCount
      : ($itemsOnPage >= $pageSize),
    'isFirstPage' => $requestedPage <= 1,
    'isLastPage' => $pageCount > 0
      ? $requestedPage >= $pageCount
      : $itemsOnPage < $pageSize,
    'firstItemOnPage' => $first,
    'lastItemOnPage' => $last,
  ];
}

/**
 * cache tokens em sessão
 */
function uny_token_cache_key() {
  return 'uny_tokens_shared_v6';
}

function uny_clear_tokens() {
  pai_cache_delete(uny_token_cache_key());
}

function uny_get_tokens(&$error = null, $forceRefresh = false) {
  static $memoryTokens = null;

  $error = null;
  $now = time();

  if ($forceRefresh) {
    $memoryTokens = null;
    uny_clear_tokens();
  }

  if (
    is_array($memoryTokens) &&
    !empty($memoryTokens['token']) &&
    !empty($memoryTokens['tokenUnypax']) &&
    (int)($memoryTokens['exp'] ?? 0) > ($now + 60)
  ) {
    return $memoryTokens;
  }

  $cached = pai_cache_get(uny_token_cache_key(), 2 * 60 * 60);

  if (
    is_array($cached) &&
    !empty($cached['token']) &&
    !empty($cached['tokenUnypax']) &&
    (int)($cached['exp'] ?? 0) > ($now + 60)
  ) {
    $memoryTokens = $cached;
    return $cached;
  }

  global $UNY_CHAVE, $UNY_EMAIL, $UNY_SENHA;

  $url = 'https://apiecommerce.unypax.com.br/api/v1/auth/login-usuario';
  $payload = [
    'chave'=>$UNY_CHAVE,
    'email'=>$UNY_EMAIL,
    'senha'=>$UNY_SENHA,
  ];

  $r = curl_json('POST', $url, ['Accept: application/json'], $payload);

  if (!$r['ok']) {
    $error = $r['error'] ?? 'Falha de rede na autenticação Unypax.';
    uny_log_failure('auth/transporte', $r);
    return null;
  }

  $http = (int)($r['http'] ?? 0);
  $j = $r['json'];

  if ($http < 200 || $http >= 300) {
    $error = 'Autenticação Unypax recusada (HTTP ' . $http . '): ' .
      uny_error_message($j, 'sem mensagem da API.');
    uny_log_failure('auth/http', $r);
    return null;
  }

  if (!is_array($j)) {
    $error = 'A autenticação Unypax retornou JSON inválido.';
    uny_log_failure('auth/json', $r);
    return null;
  }

  if (empty($j['isValid'])) {
    $error = 'Autenticação Unypax inválida: ' .
      uny_error_message($j, 'credenciais recusadas.');
    uny_log_failure('auth/isValid=false', $r);
    return null;
  }

  $tokenJWT = trim((string)($j['token'] ?? ''));
  $tokenUny = trim((string)($j['tokenUnypax'] ?? ''));

  if ($tokenJWT === '' || $tokenUny === '') {
    $error = 'A autenticação Unypax não retornou token e tokenUnypax.';
    uny_log_failure('auth/tokens-ausentes', $r);
    return null;
  }

  $t = [
    'token' => $tokenJWT,
    'tokenUnypax' => $tokenUny,
    'exp' => time() + (110 * 60),
  ];

  $memoryTokens = $t;
  pai_cache_set(uny_token_cache_key(), $t);

  return $t;
}

function uny_contracts_url(
  $pageNumber,
  $pageSize,
  $situacoesArr,
  $textToSearch = '',
  $bracketArrays = false
) {
  $baseParams = [
    'pageNumber' => max(1, (int)$pageNumber),
    'pageSize' => max(1, (int)$pageSize),
  ];

  $textToSearch = trim((string)$textToSearch);
  if ($textToSearch !== '') {
    $baseParams['textToSearch'] = $textToSearch;
  }

  $situacoes = [];
  foreach ((array)$situacoesArr as $s) {
    $s = (int)$s;
    if ($s > 0 && !in_array($s, $situacoes, true)) {
      $situacoes[] = $s;
    }
  }

  $query = uny_build_query(
    $baseParams,
    ['situacao'=>$situacoes],
    $bracketArrays
  );

  return 'https://app.unypax.com.br/api/Administracao/TFU_Contrato/SearchAsync?' . $query;
}

function uny_contracts_search($pageNumber, $pageSize, $situacoesArr, $textToSearch) {
  $baseParams = [
    'pageNumber' => max(1, (int)$pageNumber),
    'pageSize' => max(1, (int)$pageSize),
  ];

  // textToSearch não aparece na tabela principal da documentação atual.
  // Enviamos somente quando o usuário realmente está pesquisando.
  $textToSearch = trim((string)$textToSearch);
  if ($textToSearch !== '') {
    $baseParams['textToSearch'] = $textToSearch;
  }

  $situacoes = [];
  foreach ((array)$situacoesArr as $s) {
    $s = (int)$s;
    if ($s > 0 && !in_array($s, $situacoes, true)) $situacoes[] = $s;
  }

  $lastResponse = null;
  $lastError = 'Falha ao consultar contratos na Unypax.';

  // 1ª tentativa: formato documentado (situacao=2&situacao=3).
  // 2ª forma só é usada como fallback se o servidor rejeitar a query.
  foreach ([false, true] as $bracketArrays) {
    for ($authAttempt = 0; $authAttempt < 2; $authAttempt++) {
      $authError = null;
      $tokens = uny_get_tokens($authError, $authAttempt > 0);

      if (!$tokens) {
        return [
          'ok'=>false,
          'http'=>502,
          'error'=>$authError ?: 'Falha ao autenticar na Unypax.',
          'data'=>null,
          'headers'=>[],
        ];
      }

      $url = uny_contracts_url(
        $pageNumber,
        $pageSize,
        $situacoes,
        $textToSearch,
        $bracketArrays
      );
      $headers = [
        'Accept: application/json',
        'UnyAuth: ' . (string)$tokens['tokenUnypax'],
      ];

      // A API Unypax responde HTTP 411 quando o POST chega sem Content-Length.
      // Enviamos um objeto JSON vazio para manter os filtros na query string
      // e, ao mesmo tempo, produzir um corpo válido com Content-Length.
      $r = curl_json('POST', $url, $headers, new stdClass());
      $lastResponse = $r;

      if (!$r['ok']) {
        $lastError = $r['error'] ?? 'Falha de rede ao consultar contratos Unypax.';
        uny_log_failure('contratos/transporte', $r);
        return [
          'ok'=>false,
          'http'=>(int)($r['http'] ?? 0),
          'error'=>$lastError,
          'data'=>null,
          'headers'=>$r['headers'] ?? [],
        ];
      }

      $http = (int)($r['http'] ?? 0);

      if ($http === 401 && $authAttempt === 0) {
        uny_clear_tokens();
        $lastError = 'Token Unypax recusado; renovando autenticação.';
        continue;
      }

      if ($http < 200 || $http >= 300) {
        $lastError = 'Consulta de contratos recusada pela Unypax (HTTP ' . $http . '): ' .
          uny_error_message($r['json'] ?? null, 'sem mensagem da API.');
        uny_log_failure('contratos/http', $r);

        // Se o formato principal do array foi rejeitado por validação,
        // tenta uma vez a notação antiga com colchetes.
        if (!$bracketArrays && in_array($http, [400, 422], true)) {
          break;
        }

        return [
          'ok'=>false,
          'http'=>$http,
          'error'=>$lastError,
          'data'=>null,
          'headers'=>$r['headers'] ?? [],
        ];
      }

      $data = $r['json'];
      if (!is_array($data)) {
        $lastError = 'A Unypax retornou JSON inválido na consulta de contratos.';
        uny_log_failure('contratos/json', $r);
        return [
          'ok'=>false,
          'http'=>$http,
          'error'=>$lastError,
          'data'=>null,
          'headers'=>$r['headers'] ?? [],
        ];
      }

      $items = uny_extract_items($data);
      if ($items === null) {
        $lastError = 'A resposta da Unypax para contratos mudou de formato e não contém uma lista reconhecível.';
        uny_log_failure('contratos/formato', $r);
        return [
          'ok'=>false,
          'http'=>$http,
          'error'=>$lastError,
          'data'=>$data,
          'headers'=>$r['headers'] ?? [],
        ];
      }

      return [
        'ok'=>true,
        'data'=>$data,
        'items'=>$items,
        'http'=>$http,
        'headers'=>$r['headers'] ?? [],
        'query_mode'=>$bracketArrays ? 'brackets' : 'repeated',
      ];
    }
  }

  return [
    'ok'=>false,
    'http'=>(int)($lastResponse['http'] ?? 502),
    'error'=>$lastError,
    'data'=>null,
    'headers'=>is_array($lastResponse) ? ($lastResponse['headers'] ?? []) : [],
  ];
}

function uny_contasreceber_search($pageNumber, $pageSize, $idContrato, $situacoesArr) {
  $baseParams = [
    'pageNumber' => max(1, (int)$pageNumber),
    'pageSize' => max(1, (int)$pageSize),
    'idContrato' => (int)$idContrato,
  ];

  $situacoes = [];
  foreach ((array)$situacoesArr as $s) {
    $s = strtoupper(trim((string)$s));
    if ($s !== '' && !in_array($s, $situacoes, true)) $situacoes[] = $s;
  }

  $lastResponse = null;
  $lastError = 'Falha ao consultar contas a receber na Unypax.';

  foreach ([false, true] as $bracketArrays) {
    for ($authAttempt = 0; $authAttempt < 2; $authAttempt++) {
      $authError = null;
      $tokens = uny_get_tokens($authError, $authAttempt > 0);

      if (!$tokens) {
        return [
          'ok'=>false,
          'http'=>502,
          'error'=>$authError ?: 'Falha ao autenticar na Unypax.',
          'data'=>null,
          'headers'=>[],
        ];
      }

      $query = uny_build_query(
        $baseParams,
        ['situacao'=>$situacoes],
        $bracketArrays
      );

      $url = 'https://app.unypax.com.br/api/Administracao/TFI_Contasreceber/SearchAsync?' . $query;
      $headers = [
        'Accept: application/json',
        'UnyAuth: ' . (string)$tokens['tokenUnypax'],
      ];

      // A API Unypax responde HTTP 411 quando o POST chega sem Content-Length.
      // Enviamos um objeto JSON vazio para manter os filtros na query string
      // e, ao mesmo tempo, produzir um corpo válido com Content-Length.
      $r = curl_json('POST', $url, $headers, new stdClass());
      $lastResponse = $r;

      if (!$r['ok']) {
        $lastError = $r['error'] ?? 'Falha de rede ao consultar contas a receber Unypax.';
        uny_log_failure('contas/transporte', $r);
        return [
          'ok'=>false,
          'http'=>(int)($r['http'] ?? 0),
          'error'=>$lastError,
          'data'=>null,
          'headers'=>$r['headers'] ?? [],
        ];
      }

      $http = (int)($r['http'] ?? 0);

      if ($http === 401 && $authAttempt === 0) {
        uny_clear_tokens();
        $lastError = 'Token Unypax recusado; renovando autenticação.';
        continue;
      }

      if ($http < 200 || $http >= 300) {
        $lastError = 'Consulta de contas a receber recusada pela Unypax (HTTP ' . $http . '): ' .
          uny_error_message($r['json'] ?? null, 'sem mensagem da API.');
        uny_log_failure('contas/http', $r);

        if (!$bracketArrays && in_array($http, [400, 422], true)) {
          break;
        }

        return [
          'ok'=>false,
          'http'=>$http,
          'error'=>$lastError,
          'data'=>null,
          'headers'=>$r['headers'] ?? [],
        ];
      }

      $data = $r['json'];
      if (!is_array($data)) {
        $lastError = 'A Unypax retornou JSON inválido na consulta de contas a receber.';
        uny_log_failure('contas/json', $r);
        return [
          'ok'=>false,
          'http'=>$http,
          'error'=>$lastError,
          'data'=>null,
          'headers'=>$r['headers'] ?? [],
        ];
      }

      $items = uny_extract_items($data);
      if ($items === null) {
        $lastError = 'A resposta da Unypax para contas a receber mudou de formato e não contém uma lista reconhecível.';
        uny_log_failure('contas/formato', $r);
        return [
          'ok'=>false,
          'http'=>$http,
          'error'=>$lastError,
          'data'=>$data,
          'headers'=>$r['headers'] ?? [],
        ];
      }

      return [
        'ok'=>true,
        'data'=>$data,
        'items'=>$items,
        'http'=>$http,
        'headers'=>$r['headers'] ?? [],
        'query_mode'=>$bracketArrays ? 'brackets' : 'repeated',
      ];
    }
  }

  return [
    'ok'=>false,
    'http'=>(int)($lastResponse['http'] ?? 502),
    'error'=>$lastError,
    'data'=>null,
    'headers'=>is_array($lastResponse) ? ($lastResponse['headers'] ?? []) : [],
  ];
}

function uny_beneficiario_by_cpf($cpfDigits11) {
  $cpf = onlyDigits($cpfDigits11);

  if (strlen($cpf) !== 11) {
    return [
      'ok'=>false,
      'http'=>400,
      'error'=>'CPF inválido para consulta de beneficiários.',
      'data'=>null,
    ];
  }

  $cpfFmt = formatCpf($cpf);
  $lastError = 'Falha ao consultar beneficiários na Unypax.';

  for ($attempt = 0; $attempt < 2; $attempt++) {
    $authError = null;
    $tokens = uny_get_tokens($authError, $attempt > 0);

    if (!$tokens) {
      return [
        'ok'=>false,
        'http'=>502,
        'error'=>$authError ?: 'Falha ao autenticar na Unypax.',
        'data'=>null,
      ];
    }

    $jwt = (string)($tokens['token'] ?? '');
    $unyAuth = (string)($tokens['tokenUnypax'] ?? '');

    $url =
      'https://apiecommerce.unypax.com.br/api/v1/convenio/beneficiario?CPF=' .
      rawurlencode($cpfFmt);

    // A documentação exige o tokenJWT no header.
    // UnyAuth é mantido adicionalmente por compatibilidade com o ambiente atual.
    $headers = [
      'Accept: application/json',
      'Authorization: Bearer ' . $jwt,
      'UnyAuth: ' . $unyAuth,
    ];

    $r = curl_json('GET', $url, $headers, null);

    if (!$r['ok']) {
      $lastError = $r['error'] ?? 'Falha de rede ao consultar beneficiários.';
      uny_log_failure('beneficiarios/transporte', $r);
      continue;
    }

    $http = (int)($r['http'] ?? 0);

    if ($http === 401 && $attempt === 0) {
      uny_clear_tokens();
      $lastError = 'Token da Unypax recusado; renovando.';
      continue;
    }

    if ($http < 200 || $http >= 300) {
      $lastError = 'Consulta de beneficiários recusada pela Unypax (HTTP ' . $http . '): ' .
        uny_error_message($r['json'] ?? null, 'sem mensagem da API.');
      uny_log_failure('beneficiarios/http', $r);

      return [
        'ok'=>false,
        'http'=>$http,
        'error'=>$lastError,
        'data'=>null,
      ];
    }

    $data = $r['json'];

    if (!is_array($data)) {
      $lastError = 'A Unypax retornou um formato inválido para beneficiários.';
      uny_log_failure('beneficiarios/json', $r);
      return [
        'ok'=>false,
        'http'=>$http,
        'error'=>$lastError,
        'data'=>null,
      ];
    }

    return [
      'ok'=>true,
      'data'=>$data,
      'http'=>$http,
      'headers'=>$r['headers'] ?? [],
    ];
  }

  return [
    'ok'=>false,
    'http'=>502,
    'error'=>$lastError,
    'data'=>null,
  ];
}

/**
 * ==========================
 * DB: associados_auth
 * ==========================
 */
function db_get_auth_by_cpf($mysqli, $cpfDigits11) {
  $cpf = onlyDigits($cpfDigits11);
  if (strlen($cpf) !== 11) return null;

  $stmt = $mysqli->prepare("SELECT cpf, email, telefone, email_verificado, telefone_verificado, tentativas, bloqueado_ate, ultimo_login FROM associados_auth WHERE cpf=? LIMIT 1");
  if (!$stmt) return null;

  $stmt->bind_param("s", $cpf);
  $stmt->execute();
  $res = $stmt->get_result();

  if (!$res || $res->num_rows === 0) return null;

  $row = $res->fetch_assoc();
  return [
    'cpf' => $row['cpf'],
    'email' => $row['email'] ?? '',
    'telefone' => $row['telefone'] ?? '',
    'email_verificado' => (int)($row['email_verificado'] ?? 0),
    'telefone_verificado' => (int)($row['telefone_verificado'] ?? 0),
    'tentativas' => (int)($row['tentativas'] ?? 0),
    'bloqueado_ate' => $row['bloqueado_ate'],
    'ultimo_login' => $row['ultimo_login'],
  ];
}


/**
 * ==========================
 * Beneficiários: normalização
 * ==========================
 *
 * Preserva o CPF individual de titulares, dependentes e agregados.
 * Pets podem ser exibidos, mas não recebem acesso por CPF.
 */
function benef_key_norm($value) {
  $s = trim((string)$value);
  $s = mb_strtoupper($s, 'UTF-8');

  $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
  if ($ascii !== false) $s = $ascii;

  return strtolower(preg_replace('/[^A-Z0-9]/', '', $s));
}

function benef_is_list_key($key) {
  $k = benef_key_norm($key);

  if ($k === '') return false;

  return (
    strpos($k, 'beneficiario') !== false ||
    strpos($k, 'dependente') !== false ||
    strpos($k, 'agregado') !== false ||
    strpos($k, 'familiar') !== false ||
    $k === 'pet' ||
    $k === 'pets' ||
    strpos($k, 'listapet') !== false
  );
}

function benef_type_from_key($key) {
  $k = benef_key_norm($key);

  if (strpos($k, 'dependente') !== false) return 'D';
  if (strpos($k, 'agregado') !== false) return 'A';
  if (strpos($k, 'pet') !== false) return 'P';

  return '';
}

function benef_normalize_type($value, $listKey = '') {
  $v = benef_key_norm($value);

  if ($v === 'T' || $v === 'TITULAR') return 'T';
  if ($v === 'D' || $v === 'DEPENDENTE' || $v === 'DEPENDENTES') return 'D';
  if ($v === 'A' || $v === 'AGREGADO' || $v === 'AGREGADOS') return 'A';
  if ($v === 'P' || $v === 'PET' || $v === 'PETS') return 'P';

  return benef_type_from_key($listKey);
}

function benef_pick($row, $keys, $default = null) {
  if (!is_array($row)) return $default;

  foreach ($keys as $key) {
    if (
      array_key_exists($key, $row) &&
      $row[$key] !== null &&
      trim((string)$row[$key]) !== ''
    ) {
      return $row[$key];
    }
  }

  return $default;
}

function benef_normalize_item($row, $listKey = '', $titularCpf = '') {
  if (!is_array($row)) return null;

  $nome = trim((string)benef_pick($row, [
    'Nome', 'nome',
    'NomeBeneficiario', 'nomeBeneficiario',
    'Beneficiario', 'beneficiario',
    'Pessoa', 'pessoa',
    'NomePessoa', 'nomePessoa',
    'NomeCompleto', 'nomeCompleto',
  ], ''));

  if ($nome === '') return null;

  $cpf = onlyDigits(benef_pick($row, [
    'CPF', 'cpf', 'Cpf',
    'CPFCNPJ', 'CpfCnpj', 'cpfCnpj', 'cpf_cnpj',
    'CPFBeneficiario', 'CpfBeneficiario', 'cpfBeneficiario',
    'Documento', 'documento',
    'NumeroDocumento', 'numeroDocumento',
  ], ''));

  $tipoRaw = benef_pick($row, [
    'Tipo', 'tipo',
    'TipoBeneficiario', 'tipoBeneficiario',
    'TipoPessoa', 'tipoPessoa',
    'Categoria', 'categoria',
    'Vinculo', 'vinculo',
  ], '');

  $tipo = benef_normalize_type($tipoRaw, $listKey);

  // Na resposta documentada, os dados do titular podem vir fora da lista
  // e sem o campo Tipo. Se o CPF for o CPF pesquisado, tratamos como titular.
  if (
    !in_array($tipo, ['T','D','A','P'], true) &&
    strlen($cpf) === 11 &&
    strlen(onlyDigits($titularCpf)) === 11 &&
    $cpf === onlyDigits($titularCpf)
  ) {
    $tipo = 'T';
  }

  if (!in_array($tipo, ['T','D','A','P'], true)) return null;

  // Em algumas respostas o item titular não repete o CPF.
  if ($tipo === 'T' && strlen($cpf) !== 11) {
    $cpf = onlyDigits($titularCpf);
  }

  if (strlen($cpf) !== 11) {
    $cpf = '';
  }

  $beneficiarioId = (int)benef_pick($row, [
    'BeneficiarioId', 'beneficiarioId', 'beneficiario_id',
    'IDBeneficiario', 'IdBeneficiario', 'idBeneficiario',
  ], 0);

  $telefone = onlyDigits(benef_pick($row, [
    'Telefone', 'telefone',
    'Fone', 'fone',
    'Celular', 'celular',
  ], ''));

  $dataNascimento = trim((string)benef_pick($row, [
    'DataNascimento', 'dataNascimento', 'data_nascimento',
    'Nascimento', 'nascimento',
    'DtNascimento', 'dtNascimento',
  ], ''));

  $sexo = trim((string)benef_pick($row, [
    'Sexo', 'sexo',
  ], ''));

  $grauParentesco = trim((string)benef_pick($row, [
    'GrauParentesco', 'grauParentesco',
    'Parentesco', 'parentesco',
  ], ''));

  return [
    'Tipo' => $tipo,
    'tipo' => $tipo,
    'Nome' => $nome,
    'nome' => $nome,
    'CPF' => $cpf,
    'cpf' => $cpf,
    'BeneficiarioId' => $beneficiarioId > 0 ? $beneficiarioId : null,
    'beneficiarioId' => $beneficiarioId > 0 ? $beneficiarioId : null,
    'DataNascimento' => $dataNascimento,
    'dataNascimento' => $dataNascimento,
    'Sexo' => $sexo,
    'sexo' => $sexo,
    'Telefone' => $telefone,
    'telefone' => $telefone,
    'GrauParentesco' => $grauParentesco !== '' ? $grauParentesco : null,
    'grauParentesco' => $grauParentesco !== '' ? $grauParentesco : null,
  ];
}

function benef_collect_recursive($node, &$output, $listKey = '', $titularCpf = '') {
  if (!is_array($node)) return;

  // Tenta interpretar o próprio objeto como uma pessoa.
  $item = benef_normalize_item($node, $listKey, $titularCpf);
  if ($item) $output[] = $item;

  foreach ($node as $key => $value) {
    if (!is_array($value)) continue;

    $nextKey = benef_is_list_key($key)
      ? (string)$key
      : $listKey;

    if (array_keys($value) === range(0, count($value) - 1)) {
      foreach ($value as $child) {
        if (!is_array($child)) continue;

        $childItem = benef_normalize_item($child, $nextKey, $titularCpf);
        if ($childItem) $output[] = $childItem;

        benef_collect_recursive($child, $output, $nextKey, $titularCpf);
      }
    } else {
      benef_collect_recursive($value, $output, $nextKey ?: (string)$key, $titularCpf);
    }
  }
}


/**
 * Compatibilidade com o formato usado pela página anterior.
 */
function benef_collect_legacy_lists($payload, &$output, $titularCpf = '') {
  if (!is_array($payload)) return;

  $roots = [$payload];

  if (
    array_keys($payload) === range(0, count($payload) - 1) &&
    isset($payload[0]) &&
    is_array($payload[0])
  ) {
    $roots[] = $payload[0];
  }

  $candidateKeys = [
    'ListaBeneficiarios',
    'listaBeneficiarios',
    'ListaBeneficiário',
    'listaBeneficiário',
    'Beneficiarios',
    'beneficiarios',
    'Dependentes',
    'dependentes',
    'Agregados',
    'agregados',
    'Pets',
    'pets',
    'items',
    'itens',
    'data',
    'Data',
  ];

  foreach ($roots as $root) {
    if (!is_array($root)) continue;

    foreach ($candidateKeys as $key) {
      if (
        !array_key_exists($key, $root) ||
        !is_array($root[$key])
      ) {
        continue;
      }

      foreach ($root[$key] as $row) {
        if (!is_array($row)) continue;

        $item = benef_normalize_item(
          $row,
          (string)$key,
          $titularCpf
        );

        if ($item) $output[] = $item;
      }
    }
  }
}

function normalize_beneficiarios_payload($payload, $titularCpf, $mysqli = null) {
  $raw = [];

  benef_collect_recursive(
    $payload,
    $raw,
    '',
    $titularCpf
  );

  benef_collect_legacy_lists(
    $payload,
    $raw,
    $titularCpf
  );

  $out = [];
  $seen = [];

  foreach ($raw as $item) {
    $tipo = (string)($item['Tipo'] ?? '');
    $cpf = onlyDigits($item['CPF'] ?? '');
    $nomeKey = benef_key_norm($item['Nome'] ?? '');
    $nascKey = trim((string)($item['DataNascimento'] ?? ''));

    $dedupeKey = strlen($cpf) === 11
      ? $tipo . '|CPF|' . $cpf
      : $tipo . '|NOME|' . $nomeKey . '|' . $nascKey;

    if (isset($seen[$dedupeKey])) continue;
    $seen[$dedupeKey] = true;

    $localAuth = null;
    if ($mysqli && strlen($cpf) === 11 && $tipo !== 'P') {
      $localAuth = db_get_auth_by_cpf($mysqli, $cpf);
    }

    $item['local_auth'] = $localAuth;
    $item['has_access'] = $localAuth ? 1 : 0;
    $item['cpf_disponivel'] = strlen($cpf) === 11;

    $out[] = $item;
  }

  // Ordenação estável: titular, dependentes, agregados e pets.
  $order = ['T'=>0, 'D'=>1, 'A'=>2, 'P'=>3];
  usort($out, function($a, $b) use ($order) {
    $ta = (string)($a['Tipo'] ?? '');
    $tb = (string)($b['Tipo'] ?? '');

    $oa = $order[$ta] ?? 99;
    $ob = $order[$tb] ?? 99;

    if ($oa !== $ob) return $oa <=> $ob;

    return strcmp(
      benef_key_norm($a['Nome'] ?? ''),
      benef_key_norm($b['Nome'] ?? '')
    );
  });

  return $out;
}

function validate_access_target_in_contract($payload, $titularCpf, $targetCpf) {
  $titular = onlyDigits($titularCpf);
  $target = onlyDigits($targetCpf);

  if (strlen($titular) !== 11 || strlen($target) !== 11) {
    return ['ok'=>false, 'error'=>'CPF do titular ou do beneficiário inválido.'];
  }

  if ($target === $titular) {
    return [
      'ok'=>true,
      'tipo'=>'T',
      'cpf'=>$target,
      'nome'=>'Titular',
    ];
  }

  $beneficiarios = normalize_beneficiarios_payload($payload, $titular, null);

  foreach ($beneficiarios as $beneficiario) {
    $cpf = onlyDigits($beneficiario['CPF'] ?? '');
    $tipo = (string)($beneficiario['Tipo'] ?? '');

    if ($cpf !== $target) continue;

    if ($tipo === 'P') {
      return ['ok'=>false, 'error'=>'Pets não podem receber acesso por CPF.'];
    }

    if (!in_array($tipo, ['D','A'], true)) {
      return ['ok'=>false, 'error'=>'O CPF informado não pertence a um dependente ou agregado válido.'];
    }

    return [
      'ok'=>true,
      'tipo'=>$tipo,
      'cpf'=>$cpf,
      'nome'=>$beneficiario['Nome'] ?? '',
    ];
  }

  return [
    'ok'=>false,
    'error'=>'O CPF não foi encontrado entre o titular, dependentes ou agregados deste contrato.',
  ];
}

function db_has_auth_by_cpf($mysqli, $cpfDigits11) {
  $cpf = onlyDigits($cpfDigits11);
  if (strlen($cpf) !== 11) return false;
  $stmt = $mysqli->prepare("SELECT 1 FROM associados_auth WHERE cpf=? LIMIT 1");
  if (!$stmt) return false;
  $stmt->bind_param("s", $cpf);
  $stmt->execute();
  $res = $stmt->get_result();
  return ($res && $res->num_rows > 0);
}


function is_cpf_field_name($key) {
  $normalized = benef_key_norm($key);

  return in_array($normalized, [
    'cpf',
    'cpfcnpj',
    'cpfbeneficiario',
    'documento',
    'numerodocumento',
  ], true);
}

function collect_cpfs_from_payload(
  $node,
  &$cpfSet,
  $parentKey = ''
) {
  if (!is_array($node)) return;

  foreach ($node as $key => $value) {
    $fieldKey = is_string($key)
      ? $key
      : $parentKey;

    if (is_array($value)) {
      collect_cpfs_from_payload(
        $value,
        $cpfSet,
        $fieldKey
      );
      continue;
    }

    if (!is_cpf_field_name($fieldKey)) {
      continue;
    }

    $cpf = onlyDigits($value);

    if (strlen($cpf) === 11) {
      $cpfSet[$cpf] = true;
    }
  }
}

function db_get_auth_map_by_cpfs(
  $mysqli,
  $cpfs
) {
  $map = [];

  foreach ($cpfs as $cpf) {
    $digits = onlyDigits($cpf);

    if (strlen($digits) !== 11) {
      continue;
    }

    $auth = db_get_auth_by_cpf(
      $mysqli,
      $digits
    );

    if ($auth) {
      $map[$digits] = $auth;
    }
  }

  return $map;
}

function db_upsert_access($mysqli, $cpfDigits11, $senha, $email, $telefone) {
  $cpf = onlyDigits($cpfDigits11);
  $email = normEmail($email);
  $telefone = normTelefone($telefone);
  $senha = (string)$senha;

  if (strlen($cpf) !== 11) return ['ok'=>false,'error'=>'CPF inválido'];
  if (strlen(trim($senha)) < 6) return ['ok'=>false,'error'=>'Senha muito curta (mínimo 6).'];
  if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) return ['ok'=>false,'error'=>'Informe um e-mail válido.'];
  if (strlen($telefone) < 10 || strlen($telefone) > 11) return ['ok'=>false,'error'=>'Informe um telefone válido com DDD.'];

  $hash = password_hash($senha, PASSWORD_BCRYPT);

  $stmt = $mysqli->prepare("SELECT cpf FROM associados_auth WHERE cpf=? LIMIT 1");
  if (!$stmt) return ['ok'=>false,'error'=>'Falha prepare (exists)'];

  $stmt->bind_param("s", $cpf);
  $stmt->execute();
  $res = $stmt->get_result();
  $exists = ($res && $res->num_rows > 0);

  if ($exists) {
    $stmt2 = $mysqli->prepare("UPDATE associados_auth SET senha_hash=?, email=?, telefone=?, tentativas=0, bloqueado_ate=NULL WHERE cpf=?");
    if (!$stmt2) return ['ok'=>false,'error'=>'Falha prepare (update)'];
    $stmt2->bind_param("ssss", $hash, $email, $telefone, $cpf);
    if (!$stmt2->execute()) return ['ok'=>false,'error'=>'Falha ao atualizar acesso'];
    return ['ok'=>true,'updated'=>true,'cpf'=>$cpf];
  } else {
    $stmt2 = $mysqli->prepare("
      INSERT INTO associados_auth
        (cpf, senha_hash, email, telefone, email_verificado, telefone_verificado, tentativas, bloqueado_ate, ultimo_login)
      VALUES
        (?, ?, ?, ?, 0, 0, 0, NULL, NULL)
    ");
    if (!$stmt2) return ['ok'=>false,'error'=>'Falha prepare (insert)'];
    $stmt2->bind_param("ssss", $cpf, $hash, $email, $telefone);
    if (!$stmt2->execute()) return ['ok'=>false,'error'=>'Falha ao criar acesso'];
    return ['ok'=>true,'created'=>true,'cpf'=>$cpf];
  }
}

function db_admin_reset_password($mysqli, $cpfDigits11) {
  $cpf = onlyDigits($cpfDigits11);
  if (strlen($cpf) !== 11) return ['ok'=>false,'error'=>'CPF inválido'];

  $row = db_get_auth_by_cpf($mysqli, $cpf);
  if (!$row) return ['ok'=>false,'error'=>'Acesso não existe para este CPF.'];

  $email = normEmail($row['email'] ?? '');
  if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    return ['ok'=>false,'error'=>'Sem e-mail válido cadastrado para este CPF.'];
  }

  $temp = makeTempPassword(10);
  $hash = password_hash($temp, PASSWORD_BCRYPT);

  $stmt = $mysqli->prepare("UPDATE associados_auth SET senha_hash=?, tentativas=0, bloqueado_ate=NULL, reset_code_hash=NULL, reset_expires_at=NULL, reset_attempts=0 WHERE cpf=?");
  if (!$stmt) return ['ok'=>false,'error'=>'Falha prepare reset'];

  $stmt->bind_param("ss", $hash, $cpf);
  if (!$stmt->execute()) return ['ok'=>false,'error'=>'Falha ao resetar senha'];

  $subject = "Senha temporária - Plano PAI (Acesso do App)";
  $msg  = "Olá!\n\n";
  $msg .= "Sua senha temporária de acesso ao App foi gerada:\n\n";
  $msg .= "Senha: $temp\n\n";
  $msg .= "Recomendamos alterar a senha após o login.\n";
  $msg .= "Se você não solicitou, contate o suporte.\n\n";
  $msg .= "Atenciosamente,\nPlano PAI\n";

  $sent = sendMailSimple($email, $subject, $msg);
  return ['ok'=>true, 'cpf'=>$cpf, 'email'=>$email, 'temp_password'=>$temp, 'email_sent'=>$sent ? true : false];
}

/**
 * ==========================
 * Normalização de contrato (Unypax -> Front)
 * ==========================
 */
function pick_first($arr, $keys, $default = null) {
  foreach ($keys as $k) {
    if (is_array($arr) && array_key_exists($k, $arr) && $arr[$k] !== null && $arr[$k] !== '') return $arr[$k];
  }
  return $default;
}

function contract_to_front($row) {
  if (!is_array($row)) return null;

  $id = (int) pick_first($row, ['ID','Id','id'], 0);

  $cpf = (string) pick_first($row, ['CPFCNPJ','CpfCnpj','cpf_cnpj','cpf','CPF'], '');
  $nome = (string) pick_first($row, ['Nome','NOME','nome','Titular','NomeTitular'], '');

  $contrato = (string) pick_first($row, ['Contrato','CONTRATO','contrato','NumeroContrato','numeroContrato'], '');
  $contratoNumero = (string) pick_first($row, ['ContratoNumero','contrato_numero','Numero','numero','NumeroContrato','numeroContrato'], '');

  $plano = (string) pick_first($row, ['Plano','PLANO','plano'], '');
  $cobertura = (string) pick_first($row, ['Cobertura','COBERTURA','cobertura','PlanoCobertura','planoCobertura'], '');

  $cidade = (string) pick_first($row, ['Cidade','CIDADE','cidade','Municipio','municipio','CidadeNome','cidadeNome'], '');

  $situacao = (string) pick_first($row, ['Situacao','SITUACAO','situacao','DescricaoSituacao','descricaoSituacao'], '');
  $idSituacao = (int) pick_first($row, ['IdSituacao','IDSituacao','idSituacao'], 0);

  $foneTitular = (string) pick_first($row, ['FoneTitular','foneTitular','fone','Fone'], '');
  $celularTitular = (string) pick_first($row, ['CelularTitular','celularTitular','celular','Celular'], '');

  $ultPag = pick_first($row, [
    'DataUltimoPagamento','dataUltimoPagamento',
    'DataUltPagto','dataUltPagto',
    'UltimoPagamento','ultimoPagamento',
    'dataultimopagamento'
  ], null);

  return [
    'id' => $id,
    'contrato_numero' => $contratoNumero ?: $contrato,
    'contrato' => $contrato ?: $contratoNumero,
    'situacao' => $situacao,
    'idSituacao' => $idSituacao ?: null,
    'cpf_cnpj' => $cpf,
    'nome' => $nome,
    'plano' => $plano,
    'cobertura' => $cobertura,
    'cidade' => $cidade,
    'foneTitular' => $foneTitular,
    'celularTitular' => $celularTitular,
    'dataultimopagamento' => $ultPag,
  ];
}

function str_norm_u($s) {
  $s = (string)$s;
  $s = trim($s);
  $s = mb_strtoupper($s, 'UTF-8');
  return $s;
}

/**
 * Normalização "forte": remove acentos, normaliza espaços e caixa
 * (ajuda muito em Cidade/Situação/Plano)
 */
function norm_key($s) {
  $s = (string)$s;
  $s = trim($s);
  $s = preg_replace('/\s+/', ' ', $s);
  $s = mb_strtoupper($s, 'UTF-8');

  // remove acentos (se possível)
  $conv = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
  if ($conv !== false) $s = $conv;

  // remove caracteres estranhos mantendo letras/números/espaço
  $s = preg_replace('/[^A-Z0-9 ]/', '', $s);
  $s = trim($s);

  return $s;
}


/**
 * ==========================
 * Pesquisa local de contratos
 * ==========================
 *
 * A API atual não garante textToSearch no SearchAsync.
 * Quando há pesquisa, o backend percorre as páginas da Unypax
 * sem depender desse parâmetro e filtra nome, CPF e contrato localmente.
 */

/**
 * Busca por nome em níveis (usada pela lista de associados e pela Aurora):
 *   1 = texto inteiro dentro do nome, CPF ou contrato (regra original);
 *   2 = todas as palavras digitadas no nome, em qualquer ordem
 *       (palavra igual ou início de palavra, a partir de 3 letras);
 *   3 = aproximada: tolera letras trocadas, faltando ou sobrando
 *       (1 diferença até 7 letras; 2 a partir de 8).
 * Conectivos (DA, DE, DO, DAS, DOS, E) são ignorados nos níveis 2 e 3.
 */
function search_name_tokens($text) {
  $out = [];
  foreach (explode(' ', norm_key($text)) as $w) {
    if ($w === '' || ctype_digit($w)) continue;
    if (in_array($w, ['DA','DE','DO','DAS','DOS','E','D'], true)) continue;
    $out[] = $w;
  }
  return $out;
}

function search_name_simplify($w) {
  // Grafias que costumam variar no cadastro: Y/I, W/V, PH/F, TH/T, letras dobradas.
  $w = strtr($w, ['Y'=>'I', 'W'=>'V']);
  $w = str_replace(['PH','TH'], ['F','T'], $w);
  return preg_replace('/(.)\\1+/', '$1', $w);
}

function search_word_matches($q, $w, $nivel) {
  if ($q === $w) return true;
  if (strlen($q) >= 3 && strpos($w, $q) === 0) return true;
  if ($nivel < 3 || strlen($q) < 4) return false;

  $qs = search_name_simplify($q);
  $ws = search_name_simplify($w);
  if ($qs === $ws) return true;
  if (strlen($qs) >= 3 && strpos($ws, $qs) === 0) return true;

  $limite = strlen($qs) >= 8 ? 2 : 1;
  if (abs(strlen($qs) - strlen($ws)) > $limite) return false;
  return levenshtein($qs, $ws) <= $limite;
}

function contract_matches_search($frontRow, $query, $nivel = 1) {
  if (!is_array($frontRow)) return false;

  if ($nivel >= 2) {
    $qTokens = search_name_tokens($query);
    if (!$qTokens) return false;
    $nTokens = search_name_tokens($frontRow['nome'] ?? '');
    if (!$nTokens) return false;

    foreach ($qTokens as $q) {
      $achou = false;
      foreach ($nTokens as $w) {
        if (search_word_matches($q, $w, $nivel)) { $achou = true; break; }
      }
      if (!$achou) return false;
    }
    return true;
  }

  $rawQuery = trim((string)$query);
  if ($rawQuery === '') return true;

  $queryText = norm_key($rawQuery);
  $queryDigits = onlyDigits($rawQuery);

  $nome = norm_key($frontRow['nome'] ?? '');

  $cpfDigits = onlyDigits(
    $frontRow['cpf_cnpj'] ?? ''
  );

  $contratoNumero = (string)(
    $frontRow['contrato_numero'] ??
    $frontRow['contrato'] ??
    ''
  );

  $contratoText = norm_key($contratoNumero);
  $contratoDigits = onlyDigits($contratoNumero);

  if (
    $queryText !== '' &&
    $nome !== '' &&
    strpos($nome, $queryText) !== false
  ) {
    return true;
  }

  if (
    $queryDigits !== '' &&
    $cpfDigits !== '' &&
    strpos($cpfDigits, $queryDigits) !== false
  ) {
    return true;
  }

  if (
    $queryDigits !== '' &&
    $contratoDigits !== '' &&
    strpos($contratoDigits, $queryDigits) !== false
  ) {
    return true;
  }

  if (
    $queryText !== '' &&
    $contratoText !== '' &&
    strpos($contratoText, $queryText) !== false
  ) {
    return true;
  }

  return false;
}

/**
 * Aplica a busca do nível 1 ao 3 e para no primeiro nível que achar algo.
 * $extra (opcional) é um filtro adicional aplicado em todos os níveis.
 * Retorna ['rows'=>[...], 'nivel'=>1|2|3|0].
 */
function contract_search_progressive($rows, $query, $extra = null) {
  for ($nivel = 1; $nivel <= 3; $nivel++) {
    $found = [];
    foreach ((array)$rows as $row) {
      if (!is_array($row)) continue;
      if (!contract_matches_search($row, $query, $nivel)) continue;
      if ($extra && !$extra($row)) continue;
      $found[] = $row;
    }
    if ($found) return ['rows'=>$found, 'nivel'=>$nivel];
  }
  return ['rows'=>[], 'nivel'=>0];
}

function contract_matches_front_filters(
  $frontRow,
  $fCidade,
  $fPlano,
  $fSitTxt
) {
  if (!is_array($frontRow)) return false;

  $fCidade = trim((string)$fCidade);
  $fPlano = trim((string)$fPlano);
  $fSitTxt = trim((string)$fSitTxt);

  if ($fCidade !== '') {
    if (
      norm_key($frontRow['cidade'] ?? '') !==
      norm_key($fCidade)
    ) {
      return false;
    }
  }

  if ($fPlano !== '') {
    $planLike =
      $frontRow['cobertura'] ??
      $frontRow['plano'] ??
      '';

    if (
      norm_key($planLike) !==
      norm_key($fPlano)
    ) {
      return false;
    }
  }

  if ($fSitTxt !== '') {
    if (
      norm_key($frontRow['situacao'] ?? '') !==
      norm_key($fSitTxt)
    ) {
      return false;
    }
  }

  return true;
}

function make_local_pagination(
  $page,
  $pageSize,
  $totalItemCount
) {
  $page = max(1, (int)$page);
  $pageSize = max(1, (int)$pageSize);
  $total = max(0, (int)$totalItemCount);

  $pageCount =
    $total > 0
      ? (int)ceil($total / $pageSize)
      : 0;

  $offset = ($page - 1) * $pageSize;

  $firstItem =
    ($total > 0 && $offset < $total)
      ? $offset + 1
      : 0;

  $lastItem =
    $firstItem > 0
      ? min($offset + $pageSize, $total)
      : 0;

  return [
    'pageNumber' => $page,
    'pageSize' => $pageSize,
    'pageCount' => $pageCount,
    'totalItemCount' => $total,
    'hasPreviousPage' => $page > 1 && $pageCount > 0,
    'hasNextPage' => $pageCount > 0 && $page < $pageCount,
    'isFirstPage' => $page <= 1,
    'isLastPage' => $pageCount === 0 || $page >= $pageCount,
    'firstItemOnPage' => $firstItem,
    'lastItemOnPage' => $lastItem,
  ];
}


function curl_multi_contract_pages(
  $pageNumbers,
  $pageSize,
  $situArr,
  $tokenUnypax,
  $bracketArrays = false,
  $concurrency = 5
) {
  $pageNumbers = array_values(array_filter(
    array_map('intval', (array)$pageNumbers),
    function ($page) { return $page > 0; }
  ));

  if (!$pageNumbers) return [];

  $concurrency = max(1, min(8, (int)$concurrency));
  $results = [];

  foreach (array_chunk($pageNumbers, $concurrency) as $batch) {
    $mh = curl_multi_init();
    $handles = [];

    foreach ($batch as $page) {
      $ch = curl_init();

      curl_setopt_array($ch, [
        CURLOPT_URL => uny_contracts_url(
          $page,
          $pageSize,
          $situArr,
          '',
          $bracketArrays
        ),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'POST',
        CURLOPT_HTTPHEADER => [
          'Accept: application/json',
          'Content-Type: application/json',
          'UnyAuth: ' . (string)$tokenUnypax,
        ],
        CURLOPT_POSTFIELDS => '{}',
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_ENCODING => '',
      ]);

      curl_multi_add_handle($mh, $ch);

      $handleKey = function_exists('spl_object_id')
        ? spl_object_id($ch)
        : (int)$ch;

      $handles[$handleKey] = [
        'handle'=>$ch,
        'page'=>$page,
      ];
    }

    $running = null;
    do {
      $status = curl_multi_exec($mh, $running);

      if ($running && $status === CURLM_OK) {
        $selected = curl_multi_select($mh, 1.0);
        if ($selected === -1) usleep(10000);
      }
    } while ($running && $status === CURLM_OK);

    foreach ($handles as $meta) {
      $ch = $meta['handle'];
      $page = (int)$meta['page'];

      $raw = curl_multi_getcontent($ch);
      $error = curl_error($ch);
      $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

      $json = null;
      if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE) {
          $json = $decoded;
        }
      }

      $ok =
        $error === '' &&
        $http >= 200 &&
        $http < 300 &&
        is_array($json);

      $results[$page] = [
        'ok'=>$ok,
        'page'=>$page,
        'http'=>$http,
        'error'=>$error !== ''
          ? $error
          : ($ok ? null : uny_error_message($json, 'Resposta inválida da Unypax.')),
        'json'=>$json,
      ];

      curl_multi_remove_handle($mh, $ch);
      curl_close($ch);
    }

    curl_multi_close($mh);
  }

  ksort($results, SORT_NUMERIC);
  return $results;
}

/**
 * Catálogo normalizado para a pesquisa administrativa.
 *
 * O front dispara a busca após debounce. Sem este cache, cada tecla
 * faria o PHP percorrer novamente todas as páginas da Unypax.
 *
 * O cache é por sessão administrativa e curto (10 minutos).
 */
function contracts_catalog_cache_key() {
  return 'contracts_catalog_search_v6'; // v6: guarda listTag e aditivo_permite
}

function contracts_catalog_cache_get($ttl = 600) {
  $cached = pai_cache_get(contracts_catalog_cache_key(), $ttl);

  if (
    !is_array($cached) ||
    !isset($cached['rows']) ||
    !is_array($cached['rows'])
  ) {
    return null;
  }

  return [
    'rows'=>$cached['rows'],
    'pages_read'=>(int)($cached['pages_read'] ?? 0),
    'total_upstream'=>(int)($cached['total_upstream'] ?? 0),
  ];
}

function contracts_catalog_cache_set($rows, $pagesRead, $totalUpstream = 0) {
  if (!is_array($rows)) return false;

  return pai_cache_set(
    contracts_catalog_cache_key(),
    [
      'rows'=>array_values($rows),
      'pages_read'=>(int)$pagesRead,
      'total_upstream'=>(int)$totalUpstream,
    ]
  );
}

function contracts_catalog_cache_delete() {
  pai_cache_delete(contracts_catalog_cache_key());
}

function catalog_append_normalized_rows($items, &$rowsByKey) {
  foreach ((array)$items as $row) {
    $frontRow = contract_to_front(is_array($row) ? $row : []);
    if (!$frontRow) continue;

    // Guarda as etiquetas e o aditivo_permite para a leitura das etiquetas.
    if (is_array($row)) {
      $frontRow['listTag'] = pick_first($row, ['listTag','ListTag','listTags','tags'], []);
      if (!is_array($frontRow['listTag'])) $frontRow['listTag'] = [];
      $frontRow['aditivo_permite'] = pick_first($row, ['aditivo_permite','aditivoPermite'], null);
    }

    $id = (int)($frontRow['id'] ?? 0);
    $cpf = onlyDigits($frontRow['cpf_cnpj'] ?? '');
    $contrato = trim((string)(
      $frontRow['contrato_numero'] ??
      $frontRow['contrato'] ??
      ''
    ));

    $key = $id > 0
      ? 'ID|' . $id
      : 'CPF|' . $cpf . '|CT|' . $contrato;

    $rowsByKey[$key] = $frontRow;
  }
}

function load_contract_catalog_for_local_search($situArr, $maxPages = 1000) {
  $cached = contracts_catalog_cache_get(10 * 60);

  if (is_array($cached)) {
    return [
      'ok'=>true,
      'http'=>200,
      'rows'=>$cached['rows'],
      'pages_read'=>$cached['pages_read'],
      'total_upstream'=>$cached['total_upstream'],
      'cached'=>true,
    ];
  }

  $lock = pai_cache_acquire_lock(contracts_catalog_cache_key() . '_build');

  if ($lock) {
    $cached = contracts_catalog_cache_get(10 * 60);

    if (is_array($cached)) {
      pai_cache_release_lock($lock);
      return [
        'ok'=>true,
        'http'=>200,
        'rows'=>$cached['rows'],
        'pages_read'=>$cached['pages_read'],
        'total_upstream'=>$cached['total_upstream'],
        'cached'=>true,
      ];
    }
  }

  $pageSize = 100;
  $rowsByKey = [];
  $pagesRead = 0;
  $totalUpstream = 0;

  $first = uny_contracts_search(1, $pageSize, $situArr, '');

  if (empty($first['ok'])) {
    if ($lock) pai_cache_release_lock($lock);
    return [
      'ok'=>false,
      'http'=>$first['http'] ?? 502,
      'error'=>$first['error'] ?? 'Falha ao consultar contratos na Unypax.',
      'rows'=>[],
      'pages_read'=>0,
      'cached'=>false,
    ];
  }

  $items = $first['items'] ?? uny_extract_items($first['data'] ?? null);
  if (!is_array($items)) {
    if ($lock) pai_cache_release_lock($lock);
    return [
      'ok'=>false,
      'http'=>502,
      'error'=>'A primeira página de contratos veio em formato inválido.',
      'rows'=>[],
      'pages_read'=>0,
      'cached'=>false,
    ];
  }

  $pagesRead = 1;
  catalog_append_normalized_rows($items, $rowsByKey);

  $pagination = uny_pagination_from_headers($first['headers'] ?? [], 1, $pageSize);
  $pageCount = (int)($pagination['pageCount'] ?? 0);
  $totalUpstream = (int)($pagination['totalItemCount'] ?? 0);

  if ($pageCount <= 0 && $totalUpstream > 0) {
    $pageCount = (int)ceil($totalUpstream / $pageSize);
  }

  if ($pageCount > $maxPages) {
    if ($lock) pai_cache_release_lock($lock);
    return [
      'ok'=>false,
      'http'=>502,
      'error'=>'A Unypax informou mais páginas do que o limite de segurança da pesquisa.',
      'rows'=>[],
      'pages_read'=>1,
      'cached'=>false,
    ];
  }

  if ($pageCount > 1) {
    $authError = null;
    $tokens = uny_get_tokens($authError);

    if (!$tokens) {
      if ($lock) pai_cache_release_lock($lock);
      return [
        'ok'=>false,
        'http'=>502,
        'error'=>$authError ?: 'Falha ao autenticar para montar o catálogo.',
        'rows'=>[],
        'pages_read'=>1,
        'cached'=>false,
      ];
    }

    $bracketArrays = ($first['query_mode'] ?? '') === 'brackets';

    $responses = curl_multi_contract_pages(
      range(2, $pageCount),
      $pageSize,
      $situArr,
      (string)$tokens['tokenUnypax'],
      $bracketArrays,
      5
    );

    $retry401 = [];
    foreach ($responses as $page => $response) {
      if ((int)($response['http'] ?? 0) === 401) {
        $retry401[] = (int)$page;
      }
    }

    if ($retry401) {
      $authError = null;
      $freshTokens = uny_get_tokens($authError, true);

      if (!$freshTokens) {
        if ($lock) pai_cache_release_lock($lock);
        return [
          'ok'=>false,
          'http'=>502,
          'error'=>$authError ?: 'Falha ao renovar token durante a pesquisa.',
          'rows'=>[],
          'pages_read'=>$pagesRead,
          'cached'=>false,
        ];
      }

      $retried = curl_multi_contract_pages(
        $retry401,
        $pageSize,
        $situArr,
        (string)$freshTokens['tokenUnypax'],
        $bracketArrays,
        5
      );

      foreach ($retried as $page => $response) {
        $responses[$page] = $response;
      }

      ksort($responses, SORT_NUMERIC);
    }

    foreach ($responses as $page => $response) {
      if (empty($response['ok'])) {
        if ($lock) pai_cache_release_lock($lock);
        return [
          'ok'=>false,
          'http'=>(int)($response['http'] ?? 502),
          'error'=>'Falha ao carregar a página ' . (int)$page . ' do catálogo: ' .
            ($response['error'] ?? 'resposta inválida'),
          'rows'=>[],
          'pages_read'=>$pagesRead,
          'cached'=>false,
        ];
      }

      $pageItems = uny_extract_items($response['json'] ?? null);

      if (!is_array($pageItems)) {
        if ($lock) pai_cache_release_lock($lock);
        return [
          'ok'=>false,
          'http'=>502,
          'error'=>'A página ' . (int)$page . ' do catálogo veio em formato inválido.',
          'rows'=>[],
          'pages_read'=>$pagesRead,
          'cached'=>false,
        ];
      }

      catalog_append_normalized_rows($pageItems, $rowsByKey);
      $pagesRead++;
    }
  } elseif ($pageCount <= 0 && !empty($items)) {
    for ($page = 2; $page <= $maxPages; $page++) {
      $r = uny_contracts_search($page, $pageSize, $situArr, '');

      if (empty($r['ok'])) {
        if ($lock) pai_cache_release_lock($lock);
        return [
          'ok'=>false,
          'http'=>$r['http'] ?? 502,
          'error'=>$r['error'] ?? 'Falha ao continuar o catálogo.',
          'rows'=>[],
          'pages_read'=>$pagesRead,
          'cached'=>false,
        ];
      }

      $pageItems = $r['items'] ?? uny_extract_items($r['data'] ?? null);
      if (!is_array($pageItems) || empty($pageItems)) break;

      catalog_append_normalized_rows($pageItems, $rowsByKey);
      $pagesRead++;
    }
  }

  $rows = array_values($rowsByKey);

  contracts_catalog_cache_set($rows, $pagesRead, $totalUpstream);

  if ($lock) pai_cache_release_lock($lock);

  return [
    'ok'=>true,
    'http'=>200,
    'rows'=>$rows,
    'pages_read'=>$pagesRead,
    'total_upstream'=>$totalUpstream,
    'cached'=>false,
  ];
}


/**
 * ==========================
 * FINANCEIRO DO ASSOCIADO
 * ==========================
 *
 * Regras usadas pela Aurora:
 * - situação contratual e situação financeira são conceitos diferentes;
 * - uma mensalidade em atraso é uma conta TXM pendente cujo vencimento
 *   é anterior ao dia atual;
 * - o link de pagamento reúne, do mesmo contrato, todas as mensalidades
 *   vencidas e a do mês corrente (vencimento até o último dia do mês),
 *   sem juros nem multa;
 * - quando não houver atraso nem mensalidade no mês corrente, o link leva
 *   só a próxima pendente;
 * - conta_liberada_pagamento_id continua sendo a mais antiga do lote
 *   (compatibilidade); o lote completo vem em contas_liberadas_pagamento_ids;
 * - o valor enviado à UnyFintech é sempre recuperado novamente no servidor,
 *   nunca confiado ao payload recebido do chat;
 * - o link de pagamento é gerado somente após a confirmação da ação na Aurora.
 */

function pai_finance_parse_date($value) {
  $value = trim((string)$value);
  if ($value === '') return null;

  if (preg_match('#^/Date\((\d+)\)/$#', $value, $m)) {
    $seconds = (int)floor(((int)$m[1]) / 1000);
    try {
      return (new DateTimeImmutable('@' . $seconds))
        ->setTimezone(new DateTimeZone('America/Sao_Paulo'));
    } catch (Throwable $e) {
      return null;
    }
  }

  foreach (['!d/m/Y', '!d-m-Y', '!Y-m-d', '!Y-m-d H:i:s', '!d/m/Y H:i:s'] as $fmt) {
    $dt = DateTimeImmutable::createFromFormat($fmt, $value, new DateTimeZone('America/Sao_Paulo'));
    if ($dt instanceof DateTimeImmutable) return $dt;
  }

  try {
    return new DateTimeImmutable($value, new DateTimeZone('America/Sao_Paulo'));
  } catch (Throwable $e) {
    return null;
  }
}

function pai_finance_money($value) {
  if (is_int($value) || is_float($value)) return round((float)$value, 2);

  $raw = trim((string)$value);
  if ($raw === '') return 0.0;

  $raw = preg_replace('/\s+/', '', $raw);
  $raw = preg_replace('/^R\$/i', '', $raw);

  if (strpos($raw, ',') !== false) {
    $raw = str_replace('.', '', $raw);
    $raw = str_replace(',', '.', $raw);
  }

  return is_numeric($raw) ? round((float)$raw, 2) : 0.0;
}

function pai_finance_norm_text($value) {
  return norm_key((string)$value);
}

function pai_finance_allowed_types() {
  $raw = trim((string)(getenv('UNYMOS_TIPOS_MENSALIDADE_PADRAO') ?: 'TXM'));
  $out = [];

  foreach (explode(',', $raw) as $item) {
    $item = pai_finance_norm_text($item);
    if ($item !== '') $out[$item] = true;
  }

  if (!$out) $out['TXM'] = true;
  return $out;
}

function pai_finance_account_type($row) {
  if (!is_array($row)) return '';

  $parts = [];
  foreach ([
    'Tipo','tipo','TipoTitulo','tipoTitulo','TipoConta','tipoConta',
    'CodigoTipo','codigoTipo'
  ] as $key) {
    if (isset($row[$key]) && $row[$key] !== '') $parts[] = (string)$row[$key];
  }

  return pai_finance_norm_text(implode(' ', $parts));
}

function pai_finance_account_status($row) {
  if (!is_array($row)) return 'P';

  $raw = pai_finance_norm_text(pick_first(
    $row,
    ['Situacao','Situação','situacao','Status','status'],
    'P'
  ));

  if ($raw === 'B' || strpos($raw, 'BAIX') === 0 || strpos($raw, 'PAGO') !== false) return 'B';
  if ($raw === 'C' || strpos($raw, 'CANCEL') === 0) return 'C';
  return 'P';
}

function pai_finance_normalize_account($row) {
  if (!is_array($row)) return null;

  $id = (int)pick_first($row, ['ID','Id','id','ContasReceberId','contasReceberId'], 0);
  if ($id <= 0) return null;

  $parcela = trim((string)pick_first($row, ['Parcela','parcela'], 'Mensalidade'));
  $valor = pai_finance_money(pick_first($row, ['Valor','valor','ValorTitulo','valorTitulo'], 0));
  $vencimentoRaw = (string)pick_first($row, ['DataVencimento','dataVencimento','Vencimento','vencimento'], '');
  $dt = pai_finance_parse_date($vencimentoRaw);

  $tipo = pai_finance_account_type($row);
  $status = pai_finance_account_status($row);

  return [
    'id' => $id,
    'parcela' => $parcela !== '' ? $parcela : 'Mensalidade',
    'valor' => $valor,
    'vencimento' => $dt ? $dt->format('Y-m-d') : $vencimentoRaw,
    'vencimento_original' => $vencimentoRaw,
    'situacao' => $status,
    'tipo' => $tipo,
  ];
}

function pai_finance_is_standard_monthly($row) {
  if (!is_array($row)) return false;
  $tipo = pai_finance_account_type($row);
  if ($tipo === '') return false;

  foreach (pai_finance_allowed_types() as $allowed => $_) {
    if ($tipo === $allowed || strpos($tipo, $allowed) !== false) return true;
  }

  return false;
}

function pai_finance_contract_is_active($contract) {
  if (!is_array($contract)) return false;
  $situacao = pai_finance_norm_text($contract['situacao'] ?? '');
  return $situacao !== '' && strpos($situacao, 'ATIV') !== false;
}

function pai_finance_days_late($dateValue) {
  $dt = pai_finance_parse_date($dateValue);
  if (!$dt) return null;

  $today = new DateTimeImmutable('today', new DateTimeZone('America/Sao_Paulo'));
  $due = $dt->setTime(0, 0, 0);

  if ($due >= $today) return 0;
  return (int)$due->diff($today)->format('%a');
}

function uny_contasreceber_all($idContrato, $situacoes = ['P']) {
  $idContrato = (int)$idContrato;
  if ($idContrato <= 0) {
    return ['ok'=>false, 'error'=>'Contrato inválido.', 'items'=>[]];
  }

  $all = [];
  $seen = [];
  $pageSize = 200;
  $maxPages = 50;

  for ($page = 1; $page <= $maxPages; $page++) {
    $r = uny_contasreceber_search($page, $pageSize, $idContrato, $situacoes);
    if (empty($r['ok'])) {
      return [
        'ok'=>false,
        'error'=>$r['error'] ?? 'Falha ao consultar mensalidades.',
        'http'=>$r['http'] ?? 502,
        'items'=>$all,
      ];
    }

    $items = is_array($r['items'] ?? null) ? $r['items'] : [];
    if (!$items) break;

    foreach ($items as $item) {
      if (!is_array($item)) continue;
      $id = (int)pick_first($item, ['ID','Id','id','ContasReceberId','contasReceberId'], 0);
      $key = $id > 0 ? ('id:' . $id) : ('h:' . sha1(json_encode($item)));
      if (isset($seen[$key])) continue;
      $seen[$key] = true;
      $all[] = $item;
    }

    if (count($items) < $pageSize) break;
  }

  return ['ok'=>true, 'items'=>$all];
}

/**
 * Etiquetas (listTag) e campos de cobertura do contrato.
 *
 * O textToSearch do TFU_Contrato/SearchAsync é ignorado pela Unymos (devolve
 * a primeira página sem filtrar), então a leitura usa o catálogo completo de
 * contratos, que guarda o listTag desde esta versão. O catálogo é refeito a
 * cada 10 minutos: uma etiqueta nova pode levar até 10 minutos para aparecer.
 */
function pai_contract_tag_names($rawTags) {
  $tags = [];
  foreach ((is_array($rawTags) ? $rawTags : []) as $t) {
    if (is_string($t) || is_numeric($t)) {
      $nome = trim((string)$t);
    } elseif (is_array($t)) {
      $nome = trim((string)pick_first(
        $t,
        ['descricao','Descricao','nome','Nome','tag','Tag','titulo','Titulo','texto','Texto'],
        ''
      ));
    } else {
      $nome = '';
    }
    if ($nome !== '') $tags[] = $nome;
  }
  return array_values(array_unique($tags));
}

function pai_contract_live_info($idContrato, $contratoNumero = '', $cpf = '') {
  $idContrato = (int)$idContrato;
  if ($idContrato <= 0) {
    return ['ok'=>false, 'error'=>'Contrato sem id para consultar as etiquetas.', 'tags'=>[]];
  }

  $catalog = load_contract_catalog_for_local_search([1,2,3,4,5,6,7,8,9]);
  if (empty($catalog['ok'])) {
    return ['ok'=>false, 'error'=>$catalog['error'] ?? 'Falha ao carregar o catálogo de contratos.', 'tags'=>[]];
  }

  foreach (($catalog['rows'] ?? []) as $row) {
    if (!is_array($row) || (int)($row['id'] ?? 0) !== $idContrato) continue;

    if (!array_key_exists('listTag', $row)) {
      return [
        'ok'=>false,
        'error'=>'O catálogo guardado é anterior à leitura das etiquetas; tente de novo em até 10 minutos.',
        'tags'=>[],
      ];
    }

    return [
      'ok'=>true,
      'fonte'=>!empty($catalog['cached']) ? 'catalogo_guardado_ate_10_min' : 'catalogo_recem_lido',
      'tags'=>pai_contract_tag_names($row['listTag']),
      'list_tag_bruto'=>$row['listTag'],
      'aditivo_permite'=>$row['aditivo_permite'] ?? null,
      'plano'=>$row['plano'] ?? null,
      'cobertura'=>$row['cobertura'] ?? null,
      'situacao'=>$row['situacao'] ?? null,
    ];
  }

  return ['ok'=>false, 'error'=>'Contrato não localizado no catálogo.', 'tags'=>[]];
}

function pai_finance_contracts_by_cpf($cpf) {
  $cpf = onlyDigits($cpf);
  if (strlen($cpf) !== 11) {
    return ['ok'=>false, 'error'=>'CPF inválido.', 'contracts'=>[]];
  }

  $catalog = load_contract_catalog_for_local_search([1,2,3,4,5,6,7,8,9]);
  if (empty($catalog['ok'])) {
    return [
      'ok'=>false,
      'error'=>$catalog['error'] ?? 'Falha ao localizar contratos.',
      'contracts'=>[],
    ];
  }

  $matches = [];
  foreach (($catalog['rows'] ?? []) as $contract) {
    if (!is_array($contract)) continue;
    if (onlyDigits($contract['cpf_cnpj'] ?? '') === $cpf) {
      $matches[] = $contract;
    }
  }

  return ['ok'=>true, 'contracts'=>$matches];
}


/**
 * Resolve internamente o contrato/CPF para consultas financeiras.
 *
 * O usuário não precisa fornecer CPF. A busca pode ser feita por:
 * - idContrato / contrato_id;
 * - nome;
 * - textToSearch;
 * - q;
 * - busca;
 * - número do contrato.
 *
 * Nunca escolhe arbitrariamente quando há mais de uma correspondência.
 */
function pai_finance_resolve_identity($cpf = '', $requestedContractId = 0, $search = '', $contratoPublicoExato = false) {
  $cpf = onlyDigits($cpf);
  $requestedContractId = (int)$requestedContractId;
  $search = trim((string)$search);

  // Compatibilidade total com o fluxo antigo.
  if (strlen($cpf) === 11) {
    return [
      'ok'=>true,
      'cpf'=>$cpf,
      'idContrato'=>$requestedContractId > 0 ? $requestedContractId : 0,
      'resolved_by'=>'cpf',
    ];
  }

  if ($requestedContractId <= 0 && $search === '') {
    return [
      'ok'=>false,
      'code'=>'IDENTIFICADOR_AUSENTE',
      'error'=>'Informe o nome ou o número do contrato do associado.',
      'candidates'=>[],
    ];
  }

  $catalog = load_contract_catalog_for_local_search([1,2,3,4,5,6,7,8,9]);

  if (empty($catalog['ok'])) {
    return [
      'ok'=>false,
      'code'=>'FALHA_LOCALIZACAO_ASSOCIADO',
      'error'=>$catalog['error'] ?? 'Falha ao localizar o associado.',
      'candidates'=>[],
    ];
  }

  $rows = is_array($catalog['rows'] ?? null)
    ? $catalog['rows']
    : [];

  $matches = [];
  $nivelBusca = 1;

  // Somente a nova rota contrato_exato executa esta busca estrita.
  // Consultas administrativas antigas continuam com a busca progressiva.
  // Contrato público NÃO é o mesmo que idContrato (chave interna da Unypax).
  if ($contratoPublicoExato && $requestedContractId <= 0) {
    foreach ($rows as $contract) {
      if (!is_array($contract)) continue;
      $numeroCadastrado = trim((string)(
        ($contract['contrato_numero'] ?? '') ?: ($contract['contrato'] ?? '')
      ));
      if ($numeroCadastrado === '') continue;
      $equivalente = ctype_digit($search) && ctype_digit($numeroCadastrado)
        ? ltrim($search, '0') !== '' && ltrim($search, '0') === ltrim($numeroCadastrado, '0')
        : strtoupper($search) === strtoupper($numeroCadastrado);
      if ($equivalente) $matches[] = $contract;
    }
  } elseif ($requestedContractId <= 0 && $search !== '') {
    $busca = contract_search_progressive($rows, $search);
    $matches = $busca['rows'];
    $nivelBusca = (int)$busca['nivel'];
  } else {
    foreach ($rows as $contract) {
      if (!is_array($contract)) continue;
      if ($requestedContractId > 0 && (int)($contract['id'] ?? 0) !== $requestedContractId) continue;
      $matches[] = $contract;
    }
  }

  if (!$matches) {
    return [
      'ok'=>false,
      'code'=>'ASSOCIADO_NAO_ENCONTRADO',
      'error'=>'Nenhum associado foi encontrado com os dados informados.',
      'candidates'=>[],
    ];
  }

  /*
   * Uma busca parcial pode encontrar homônimos. Antes de declarar ambiguidade,
   * tenta identificar uma correspondência EXATA por nome, contrato ou CPF.
   */
  if (count($matches) > 1 && $search !== '') {
    $searchText = norm_key($search);
    $searchDigits = onlyDigits($search);
    $exact = [];

    foreach ($matches as $contract) {
      $nome = norm_key($contract['nome'] ?? '');
      $contrato = (string)(
        $contract['contrato_numero']
        ?? $contract['contrato']
        ?? ''
      );
      $contratoText = norm_key($contrato);
      $contratoDigits = onlyDigits($contrato);
      $contractCpf = onlyDigits($contract['cpf_cnpj'] ?? '');

      $isExact = false;

      if ($searchText !== '' && $nome !== '' && $nome === $searchText) {
        $isExact = true;
      }

      if (
        !$isExact &&
        $searchText !== '' &&
        $contratoText !== '' &&
        $contratoText === $searchText
      ) {
        $isExact = true;
      }

      if (
        !$isExact &&
        $searchDigits !== '' &&
        $contratoDigits !== '' &&
        $contratoDigits === $searchDigits
      ) {
        $isExact = true;
      }

      if (
        !$isExact &&
        strlen($searchDigits) === 11 &&
        strlen($contractCpf) === 11 &&
        $contractCpf === $searchDigits
      ) {
        $isExact = true;
      }

      if ($isExact) {
        $exact[] = $contract;
      }
    }

    if (count($exact) === 1) {
      $matches = $exact;
    } elseif (count($exact) > 1) {
      $matches = $exact;
    }
  }

  // Nome encontrado só pela busca aproximada (letras trocadas): nunca
  // escolhe sozinho; devolve como candidato para o usuário confirmar.
  $confirmarAproximado = ($nivelBusca === 3 && count($matches) === 1);

  if (count($matches) > 1 || $confirmarAproximado) {
    $candidates = [];

    foreach (array_slice($matches, 0, 12) as $contract) {
      $candidates[] = [
        'idContrato'=>(int)($contract['id'] ?? 0),
        'contrato'=>(string)(
          $contract['contrato_numero']
          ?? $contract['contrato']
          ?? ''
        ),
        'nome'=>(string)($contract['nome'] ?? ''),
        'plano'=>(string)(
          $contract['cobertura']
          ?? $contract['plano']
          ?? ''
        ),
        'situacao'=>(string)($contract['situacao'] ?? ''),
        'cidade'=>(string)($contract['cidade'] ?? ''),
      ];
    }

    return [
      'ok'=>false,
      'code'=>'ASSOCIADO_AMBIGUO',
      'error'=>$confirmarAproximado
        ? 'Não há associado com esse nome exato. Encontrei um nome parecido; confirme se é este contrato.'
        : 'Há mais de um associado compatível. Informe qual contrato deseja consultar.',
      'candidates'=>$candidates,
      'total_matches'=>count($matches),
      'busca_aproximada'=>$nivelBusca === 3,
    ];
  }

  $contract = $matches[0];
  $resolvedCpf = onlyDigits($contract['cpf_cnpj'] ?? '');
  $resolvedId = (int)($contract['id'] ?? 0);

  if (strlen($resolvedCpf) !== 11) {
    return [
      'ok'=>false,
      'code'=>'CPF_INTERNO_NAO_LOCALIZADO',
      'error'=>'O associado foi localizado, mas o cadastro não retornou um CPF válido para a consulta financeira.',
      'candidates'=>[],
    ];
  }

  return [
    'ok'=>true,
    'cpf'=>$resolvedCpf,
    'idContrato'=>$resolvedId,
    'nome'=>(string)($contract['nome'] ?? ''),
    'contrato'=>(string)(
      $contract['contrato_numero']
      ?? $contract['contrato']
      ?? ''
    ),
    'resolved_by'=>$requestedContractId > 0 ? 'idContrato' : 'search',
  ];
}


function pai_finance_status($cpf, $requestedContractId = 0, $search = '', $contratoPublicoExato = false) {
  $cpf = onlyDigits($cpf);
  $requestedContractId = (int)$requestedContractId;
  $search = trim((string)$search);

  /*
   * CPF continua aceito por compatibilidade, mas deixa de ser obrigatório.
   * Quando ausente, nome/contrato são resolvidos internamente.
   */
  $identity = pai_finance_resolve_identity(
    $cpf,
    $requestedContractId,
    $search,
    $contratoPublicoExato
  );

  if (empty($identity['ok'])) {
    return $identity;
  }

  $cpf = onlyDigits($identity['cpf'] ?? '');
  $resolvedContractId = (int)($identity['idContrato'] ?? 0);

  if ($requestedContractId <= 0 && $resolvedContractId > 0 && $search !== '') {
    $requestedContractId = $resolvedContractId;
  }

  $contractsResult = pai_finance_contracts_by_cpf($cpf);
  if (empty($contractsResult['ok'])) return $contractsResult;

  $contracts = $contractsResult['contracts'] ?? [];

  if ($requestedContractId > 0) {
    $contracts = array_values(array_filter(
      $contracts,
      static fn($c) => (int)($c['id'] ?? 0) === $requestedContractId
    ));

    // Nunca atribua um contrato a um CPF apenas porque o cliente informou
    // um idContrato. O vínculo precisa existir no catálogo oficial.
    if (!$contracts) {
      return [
        'ok'=>false,
        'code'=>'CONTRATO_NAO_VINCULADO',
        'error'=>'O contrato não pertence ao CPF informado ou não foi localizado.',
      ];
    }
  }

  if (!$contracts) {
    return [
      'ok'=>true,
      'cpf'=>$cpf,
      'situacao_financeira'=>'SEM_CONTRATO_LOCALIZADO',
      'inadimplente'=>false,
      'quantidade_vencidas'=>0,
      'total_vencido'=>0.0,
      'mensalidades_vencidas'=>[],
      'mensalidades_pendentes'=>[],
      'contratos'=>[],
    ];
  }

  $today = new DateTimeImmutable('today', new DateTimeZone('America/Sao_Paulo'));
  $contractRows = [];
  $overallOverdue = [];
  $overallPending = [];

  foreach ($contracts as $contract) {
    $contractId = (int)($contract['id'] ?? 0);
    if ($contractId <= 0) continue;

    $r = uny_contasreceber_all($contractId, ['P','B','C']);
    if (empty($r['ok'])) {
      $contractRows[] = [
        'id'=>$contractId,
        'contrato'=>$contract['contrato_numero'] ?? $contract['contrato'] ?? '',
        'situacao_contratual'=>$contract['situacao'] ?? '',
        'ativo'=>pai_finance_contract_is_active($contract),
        'erro_financeiro'=>$r['error'] ?? 'Falha ao consultar mensalidades.',
        'mensalidades_vencidas'=>[],
        'mensalidades_pendentes'=>[],
      ];
      continue;
    }

    $normalized = [];
    foreach (($r['items'] ?? []) as $raw) {
      if (!is_array($raw) || !pai_finance_is_standard_monthly($raw)) continue;
      $item = pai_finance_normalize_account($raw);
      if (!$item) continue;
      $normalized[] = $item;
    }

    usort($normalized, static function($a, $b) {
      $ta = pai_finance_parse_date($a['vencimento'] ?? '');
      $tb = pai_finance_parse_date($b['vencimento'] ?? '');
      return ($ta ? $ta->getTimestamp() : 0) <=> ($tb ? $tb->getTimestamp() : 0);
    });

    $pending = [];
    $overdue = [];

    foreach ($normalized as $item) {
      if (($item['situacao'] ?? '') !== 'P') continue;

      $dt = pai_finance_parse_date($item['vencimento'] ?? '');
      $days = $dt ? pai_finance_days_late($item['vencimento']) : null;
      $item['dias_atraso'] = $days;

      $pending[] = $item;

      if ($dt && $dt->setTime(0,0,0) < $today) {
        $overdue[] = $item;
      }
    }

    $payableId = 0;
    if ($overdue) {
      $payableId = (int)($overdue[0]['id'] ?? 0);
    } elseif ($pending) {
      $payableId = (int)($pending[0]['id'] ?? 0);
    }

    foreach ($pending as &$item) {
      $item['pode_pagar_agora'] = ((int)$item['id'] === $payableId);
    }
    unset($item);

    foreach ($overdue as &$item) {
      $item['pode_pagar_agora'] = ((int)$item['id'] === $payableId);
    }
    unset($item);

    $active = pai_finance_contract_is_active($contract);
    $totalOverdue = 0.0;
    foreach ($overdue as $item) $totalOverdue += (float)($item['valor'] ?? 0);

    $contractRows[] = [
      'id'=>$contractId,
      'contrato'=>$contract['contrato_numero'] ?? $contract['contrato'] ?? '',
      'nome'=>$contract['nome'] ?? '',
      'situacao_contratual'=>$contract['situacao'] ?? '',
      'ativo'=>$active,
      'quantidade_vencidas'=>count($overdue),
      'total_vencido'=>round($totalOverdue, 2),
      'mensalidades_vencidas'=>$overdue,
      'mensalidades_pendentes'=>$pending,
      'conta_liberada_pagamento_id'=>$payableId ?: null,
    ];

    if ($active || !array_filter($contracts, 'pai_finance_contract_is_active')) {
      foreach ($overdue as $item) {
        $item['contrato_id'] = $contractId;
        $overallOverdue[] = $item;
      }
      foreach ($pending as $item) {
        $item['contrato_id'] = $contractId;
        $overallPending[] = $item;
      }
    }
  }

  usort($overallOverdue, static function($a, $b) {
    $ta = pai_finance_parse_date($a['vencimento'] ?? '');
    $tb = pai_finance_parse_date($b['vencimento'] ?? '');
    return ($ta ? $ta->getTimestamp() : 0) <=> ($tb ? $tb->getTimestamp() : 0);
  });

  usort($overallPending, static function($a, $b) {
    $ta = pai_finance_parse_date($a['vencimento'] ?? '');
    $tb = pai_finance_parse_date($b['vencimento'] ?? '');
    return ($ta ? $ta->getTimestamp() : 0) <=> ($tb ? $tb->getTimestamp() : 0);
  });

  $globalPayableId = 0;
  if ($overallOverdue) {
    $globalPayableId = (int)($overallOverdue[0]['id'] ?? 0);
  } elseif ($overallPending) {
    $globalPayableId = (int)($overallPending[0]['id'] ?? 0);
  }

  $lote = pai_finance_payment_batch($overallPending, $globalPayableId);
  $loteIds = [];
  foreach ($lote as $item) $loteIds[(int)$item['id']] = true;

  foreach ($overallOverdue as &$item) {
    $item['pode_pagar_agora'] = isset($loteIds[(int)$item['id']]);
  }
  unset($item);

  foreach ($overallPending as &$item) {
    $item['pode_pagar_agora'] = isset($loteIds[(int)$item['id']]);
  }
  unset($item);

  $totalLote = 0.0;
  foreach ($lote as $item) $totalLote += (float)($item['valor'] ?? 0);

  $total = 0.0;
  foreach ($overallOverdue as $item) $total += (float)($item['valor'] ?? 0);

  return [
    'ok'=>true,
    'cpf'=>$cpf,
    'situacao_financeira'=>$overallOverdue ? 'EM_ATRASO' : 'SEM_ATRASO_IDENTIFICADO',
    'inadimplente'=>(bool)$overallOverdue,
    'criterio'=>'Mensalidade TXM pendente com vencimento anterior ao dia atual.',
    'quantidade_vencidas'=>count($overallOverdue),
    'total_vencido'=>round($total, 2),
    'mensalidades_vencidas'=>$overallOverdue,
    'mensalidades_pendentes'=>$overallPending,
    'conta_liberada_pagamento_id'=>$globalPayableId ?: null,
    'contas_liberadas_pagamento_ids'=>array_map('intval', array_keys($loteIds)),
    'mensalidades_liberadas_pagamento'=>$lote,
    'quantidade_liberada_pagamento'=>count($lote),
    'total_liberado_pagamento'=>round($totalLote, 2),
    'contratos'=>$contractRows,
  ];
}

/**
 * Lote do link de pagamento: a partir da mensalidade liberada (a mais antiga),
 * junta as pendentes do MESMO contrato com vencimento até o último dia do
 * mês corrente (vencidas + a do mês). Sem nenhuma nesse intervalo, o lote é
 * só a mensalidade liberada (próxima pendente). Lista já ordenada por vencimento.
 */
function pai_finance_payment_batch(array $pendingSorted, $payableId) {
  $payableId = (int)$payableId;
  if ($payableId <= 0) return [];

  $base = null;
  foreach ($pendingSorted as $item) {
    if ((int)($item['id'] ?? 0) === $payableId) { $base = $item; break; }
  }
  if (!$base) return [];

  $contratoBase = (int)($base['contrato_id'] ?? 0);
  $fimDoMes = (new DateTimeImmutable('last day of this month', new DateTimeZone('America/Sao_Paulo')))
    ->setTime(23, 59, 59);

  $lote = [];
  foreach ($pendingSorted as $item) {
    if (($item['situacao'] ?? 'P') !== 'P') continue;
    if ((int)($item['contrato_id'] ?? 0) !== $contratoBase) continue;

    $dt = pai_finance_parse_date($item['vencimento'] ?? '');
    if (!$dt || $dt > $fimDoMes) continue;

    $lote[] = $item;
  }

  return $lote ?: [$base];
}

function pai_finance_find_payable($cpf, $contaId, $idContrato = 0, $escopo = 'padrao') {
  $status = pai_finance_status($cpf, $idContrato);
  if (empty($status['ok'])) return $status;

  $contaId = (int)$contaId;
  $allowedId = (int)($status['conta_liberada_pagamento_id'] ?? 0);
  $lote = is_array($status['mensalidades_liberadas_pagamento'] ?? null)
    ? $status['mensalidades_liberadas_pagamento']
    : [];

  // Escopo EXCLUSIVO da página pública: quitar apenas as parcelas vencidas.
  // Preserva a regra original para o aplicativo e os demais consumidores.
  if ($escopo === 'vencidas') {
    if ((int)$idContrato <= 0) {
      return ['ok'=>false, 'code'=>'CONTRATO_INVALIDO', 'error'=>'Contrato inválido.'];
    }
    $vencidas = is_array($status['mensalidades_vencidas'] ?? null)
      ? $status['mensalidades_vencidas'] : [];
    $lote = array_values(array_filter($vencidas, static fn($m) =>
      is_array($m) && ($m['situacao'] ?? '') === 'P' &&
      (int)($m['dias_atraso'] ?? 0) > 0 &&
      (int)($m['contrato_id'] ?? 0) === (int)$idContrato
    ));
    if (!$lote) {
      return ['ok'=>false, 'code'=>'LOTE_ALTERADO',
        'error'=>'As mensalidades vencidas mudaram. Consulte novamente.'];
    }
    $allowedId = (int)$lote[0]['id'];
  }

  if ($allowedId <= 0 || !$lote) {
    return ['ok'=>false, 'error'=>'Não há mensalidade pendente liberada para pagamento.'];
  }

  // Aceita qualquer mensalidade do lote; o link sempre leva o lote inteiro.
  $noLote = false;
  foreach ($lote as $item) {
    if ((int)($item['id'] ?? 0) === $contaId) { $noLote = true; break; }
  }

  if (!$noLote) {
    return [
      'ok'=>false,
      'error'=>'Esta mensalidade não está liberada para o link. O link reúne as vencidas e a do mês corrente.',
      'conta_liberada_pagamento_id'=>$allowedId,
      'contas_liberadas_pagamento_ids'=>$status['contas_liberadas_pagamento_ids'] ?? [],
    ];
  }

  $maxDays = max(1, (int)(getenv('PAI_FINANCE_MAX_LINK_DELAY_DAYS') ?: 730));
  foreach ($lote as $item) {
    $days = (int)($item['dias_atraso'] ?? 0);
    if ($days > $maxDays) {
      return [
        'ok'=>false,
        'code'=>'VENCIMENTO_EXCEDIDO',
        'error'=>'Há mensalidade com o prazo de vencimento muito excedido. O pagamento deve ser tratado diretamente com o financeiro.',
        'mensalidade'=>$item,
      ];
    }
  }

  $total = 0.0;
  foreach ($lote as $item) $total += (float)($item['valor'] ?? 0);

  return [
    'ok'=>true,
    'status'=>$status,
    'mensalidade'=>$lote[0],
    'mensalidades'=>$lote,
    'valor_total'=>round($total, 2),
  ];
}

function pai_unyfintech_generate_payment_link($contaIds, $valor) {
  $contaIds = array_values(array_unique(array_filter(
    array_map('intval', is_array($contaIds) ? $contaIds : [$contaIds]),
    static fn($id) => $id > 0
  )));
  $valor = round((float)$valor, 2);

  if (!$contaIds || $valor <= 0) {
    return ['ok'=>false, 'error'=>'Dados inválidos para gerar link de pagamento.'];
  }

  global $UNY_CAIXA_BANCO_ID, $UNYFINTECH_API_BASE;

  $caixaBancoId = (int)$UNY_CAIXA_BANCO_ID;
  if ($caixaBancoId <= 0) {
    return [
      'ok'=>false,
      'error'=>'Configure o ID da Conta Banco em $UNY_CAIXA_BANCO_ID no início deste arquivo ou pela variável UNY_CAIXA_BANCO_ID.'
    ];
  }

  $authError = null;
  $tokens = uny_get_tokens($authError, false);
  if (!$tokens || empty($tokens['tokenUnypax'])) {
    return ['ok'=>false, 'error'=>$authError ?: 'Falha na autenticação Unypax.'];
  }

  $fintechBase = $UNYFINTECH_API_BASE !== ''
    ? $UNYFINTECH_API_BASE
    : 'https://unyfintech.unypax.com.br';
  $url = $fintechBase . '/api/v1/pix/gerar-link-pagamentov2';
  $tempo = (int)(getenv('UNY_LINK_EXPIRACAO_MINUTOS') ?: 2880);
  if ($tempo <= 0) $tempo = 2880;

  $camel = [
    'contasReceberId'=>$contaIds,
    'aplicativoOrigem'=>'APP_UNYMOS_PIX_AVULSO',
    'tempoExpiracaoEmMinutos'=>$tempo,
    'valor'=>$valor,
    'caixaBancoId'=>$caixaBancoId,
    'percJuros'=>0.0,
    'percMulta'=>0.0,
    'percDesconto'=>0.0,
  ];

  $headers = [
    'Accept: application/json',
    'Content-Type: application/json',
    'UnyAuth: ' . (string)$tokens['tokenUnypax'],
  ];

  $r = curl_json('POST', $url, $headers, $camel);

  if (
    !empty($r['ok']) &&
    (int)($r['http'] ?? 0) >= 200 &&
    (int)($r['http'] ?? 0) < 300
  ) {
    $data = is_array($r['json'] ?? null) ? $r['json'] : [];
    $chave = trim((string)($data['chave'] ?? ''));
    $urlLink = trim((string)($data['urlLinkPagamento'] ?? ''));
    $link = trim((string)($data['linkPagamento'] ?? ''));
    $mounted = $chave !== ''
      ? $fintechBase . '/pix/link-pagamentov2/PLANOPAI?linkPagamentoChave=' . rawurlencode($chave)
      : '';

    $finalUrl = $urlLink !== '' ? $urlLink : ($link !== '' ? $link : $mounted);
    if ($finalUrl === '') {
      return ['ok'=>false, 'error'=>'Link gerado, mas a UnyFintech não retornou URL/chave.'];
    }

    return [
      'ok'=>true,
      'url'=>$finalUrl,
      'chave'=>$chave !== '' ? $chave : null,
      'tried'=>'camel',
    ];
  }

  if ((int)($r['http'] ?? 0) !== 400) {
    return [
      'ok'=>false,
      'error'=>'Falha ao gerar link de pagamento.',
      'upstream_http'=>$r['http'] ?? null,
      'upstream_error'=>uny_error_message($r['json'] ?? null, (string)($r['error'] ?? '')),
    ];
  }

  $pascal = [
    'ContasRecebers'=>$contaIds,
    'AplicativoOrigem'=>'APP_UNYMOS_PIX_AVULSO',
    'TempoExpiracaoEmMinutos'=>$tempo,
    'Valor'=>$valor,
    'CaixaBancoId'=>$caixaBancoId,
    'PercJuros'=>0.0,
    'PercMulta'=>0.0,
    'PercDesconto'=>0.0,
    'FormaPagamentoId'=>28,
  ];

  $r2 = curl_json('POST', $url, $headers, $pascal);
  if (
    empty($r2['ok']) ||
    (int)($r2['http'] ?? 0) < 200 ||
    (int)($r2['http'] ?? 0) >= 300
  ) {
    return [
      'ok'=>false,
      'error'=>'Falha ao gerar link de pagamento.',
      'upstream_http'=>$r2['http'] ?? null,
      'upstream_error'=>uny_error_message($r2['json'] ?? null, (string)($r2['error'] ?? '')),
    ];
  }

  $data = is_array($r2['json'] ?? null) ? $r2['json'] : [];
  $chave = trim((string)($data['chave'] ?? ''));
  $urlLink = trim((string)($data['urlLinkPagamento'] ?? ''));
  $link = trim((string)($data['linkPagamento'] ?? ''));
  $mounted = $chave !== ''
    ? $fintechBase . '/pix/link-pagamentov2/PLANOPAI?linkPagamentoChave=' . rawurlencode($chave)
    : '';

  $finalUrl = $urlLink !== '' ? $urlLink : ($link !== '' ? $link : $mounted);
  if ($finalUrl === '') {
    return ['ok'=>false, 'error'=>'Link gerado, mas a UnyFintech não retornou URL/chave.'];
  }

  return [
    'ok'=>true,
    'url'=>$finalUrl,
    'chave'=>$chave !== '' ? $chave : null,
    'tried'=>'pascal',
  ];
}


/**
 * ==========================
 * ROUTER
 * ==========================
 */
$op = $_GET['op'] ?? '';

/**
 * ==========================
 * PROTEÇÃO DAS CONSULTAS FINANCEIRAS (20/10/2026)
 * ==========================
 *
 * financial_status e payment_link não pediam login nem chave. Este bloco:
 * - reconhece a chamada do site (link-de-pagamento.php), que envia X-PAI-Public-Payment-Key;
 * - reconhece outras chaves internas cadastradas em pai-chaves.php ('associados_chaves_internas');
 * - registra quem chama cada op (sem CPF, sem valores) em /home2/pla48587/pai-logs/associados-chamadas.log;
 * - só BLOQUEIA quando pai-chaves.php tiver 'associados_protecao' => 'exigir'.
 *
 * Padrão 'observar': nada muda para o app, a Aurora, o Club e o MCP. O bloqueio só
 * deve ser ligado depois que todos esses chamadores enviarem uma chave (ver o log).
 */
function pai_protecao_chave_site(array $config): string {
  $s = trim((string)($config['public_payment_secret'] ?? ''));
  if (strlen($s) < 32) {
    $f = trim((string)($config['access_link_secret'] ?? ''));
    $s = strlen($f) >= 16 ? hash_hmac('sha256', 'pai-public-payment-ticket-2026', $f) : '';
  }
  return $s === '' ? '' : hash_hmac('sha256', 'pai-public-payment-upstream', $s);
}

function pai_protecao_quem_chama(array $config): string {
  $site = $_SERVER['HTTP_X_PAI_PUBLIC_PAYMENT_KEY'] ?? '';
  $chaveSite = pai_protecao_chave_site($config);
  if ($site !== '' && $chaveSite !== '' && hash_equals($chaveSite, (string)$site)) return 'site';

  $interna = (string)($_SERVER['HTTP_X_PAI_INTERNAL_KEY'] ?? '');
  $lista = $config['associados_chaves_internas'] ?? [];
  if ($interna !== '' && is_array($lista)) {
    foreach ($lista as $nome => $chave) {
      $chave = (string)$chave;
      if (strlen($chave) >= 32 && hash_equals($chave, $interna)) return 'interna:' . (is_string($nome) ? $nome : 'chave');
    }
  }
  return '';
}

function pai_protecao_log(string $op, string $quem): void {
  global $PAI_CHAVES_FILE;
  $dir = dirname((string)$PAI_CHAVES_FILE) . DIRECTORY_SEPARATOR . 'pai-logs';
  if (!is_dir($dir) && !@mkdir($dir, 0700, true)) return;
  $arq = $dir . DIRECTORY_SEPARATOR . 'associados-chamadas.log';
  if (is_file($arq) && @filesize($arq) > 2 * 1024 * 1024) @rename($arq, $arq . '.1');
  $limpa = static fn($v, $n) => substr(preg_replace('/[\r\n\t]+/', ' ', (string)$v) ?? '', 0, $n);
  $linha = implode("\t", [
    date('Y-m-d H:i:s'),
    $limpa($op, 40),
    $limpa($_SERVER['REQUEST_METHOD'] ?? '', 8),
    $quem !== '' ? $quem : 'sem-chave',
    'origem=' . $limpa($_SERVER['HTTP_ORIGIN'] ?? '-', 80),
    'ip=' . $limpa($_SERVER['REMOTE_ADDR'] ?? '-', 45),
    'ua=' . $limpa($_SERVER['HTTP_USER_AGENT'] ?? '-', 120),
  ]) . "\n";
  @file_put_contents($arq, $linha, FILE_APPEND | LOCK_EX);
}

$PAI_OPS_FINANCEIRAS = ['financial_status', 'payment_link'];
if ($op !== '' && $op !== 'ping') {
  $PAI_QUEM_CHAMA = pai_protecao_quem_chama($PAI_CONFIG);
  pai_protecao_log($op, $PAI_QUEM_CHAMA);
  $PAI_MODO_PROTECAO = strtolower(trim((string)($PAI_CONFIG['associados_protecao'] ?? 'observar')));
  if ($PAI_MODO_PROTECAO === 'exigir' && in_array($op, $PAI_OPS_FINANCEIRAS, true) && $PAI_QUEM_CHAMA === '') {
    out(401, ['ok'=>false, 'code'=>'CHAVE_AUSENTE', 'error'=>'Acesso não autorizado.']);
  }
}


/**
 * GET ?op=financial_status&cpf=...&idContrato=...
 * GET ?op=financial_status&nome=...
 * GET ?op=financial_status&textToSearch=...
 *
 * CPF é opcional quando nome/contrato permitem identificar unicamente o associado.
 *
 * Retorna situação financeira, mensalidades vencidas, total vencido,
 * pendências e qual conta pode ser paga agora.
 */
if ($op === 'financial_status' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  $cpf = onlyDigits($_GET['cpf'] ?? '');
  $idContrato = (int)($_GET['idContrato'] ?? $_GET['contrato_id'] ?? 0);

  // CPF não é obrigatório: nome/contrato podem ser resolvidos internamente.
  $contratoPublicoExato = isset($_GET['contrato_exato']);
  $search = trim((string)(
    $_GET['contrato_exato']
    ?? $_GET['textToSearch']
    ?? $_GET['q']
    ?? $_GET['busca']
    ?? $_GET['nome']
    ?? $_GET['contrato']
    ?? ''
  ));

  $result = pai_finance_status($cpf, $idContrato, $search, $contratoPublicoExato);
  if (empty($result['ok'])) {
    out(400, $result);
  }

  out(200, $result);
}

/**
 * POST ?op=payment_link
 * body: { cpf, conta_receber_id, idContrato? }
 *
 * O valor NÃO é aceito do cliente. O servidor consulta novamente a
 * mensalidade e usa o valor oficial retornado pela Unypax.
 */
if ($op === 'payment_link' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = bodyAny();

  $cpf = onlyDigits($body['cpf'] ?? '');
  $contaId = (int)($body['conta_receber_id'] ?? $body['contasReceberId'] ?? 0);
  $idContrato = (int)($body['idContrato'] ?? $body['contrato_id'] ?? 0);
  $escopo = (string)($body['escopo_pagamento'] ?? 'padrao');
  if (!in_array($escopo, ['padrao', 'vencidas'], true)) {
    out(400, ['ok'=>false, 'code'=>'ESCOPO_INVALIDO', 'error'=>'Escopo de pagamento inválido.']);
  }
  if ($escopo === 'vencidas' && ($PAI_QUEM_CHAMA ?? '') !== 'site') {
    out(403, ['ok'=>false, 'code'=>'ACESSO_NEGADO', 'error'=>'Operação não autorizada.']);
  }

  if (strlen($cpf) !== 11 || $contaId <= 0) {
    out(400, [
      'ok'=>false,
      'error'=>'Informe CPF e conta_receber_id válidos.',
    ]);
  }

  $payable = pai_finance_find_payable($cpf, $contaId, $idContrato, $escopo);
  if (empty($payable['ok'])) {
    $status = in_array(($payable['code'] ?? ''), ['VENCIMENTO_EXCEDIDO','LOTE_ALTERADO'], true) ? 409 : 400;
    out($status, $payable);
  }

  $mensalidade = $payable['mensalidade'];
  $mensalidades = $payable['mensalidades'] ?? [$mensalidade];
  $valorTotal = (float)($payable['valor_total'] ?? $mensalidade['valor']);

  // Aurora confirma exatamente o lote mostrado ao operador. Recusa se houve
  // quitação, nova parcela, mudança de valor ou alteração de vencimento.
  if (isset($body['esperado_lote']) || isset($body['esperado_total_centavos'])) {
    $esperado = $body['esperado_lote'] ?? null;
    $centavos = $body['esperado_total_centavos'] ?? null;
    if (!is_array($esperado) || !is_numeric($centavos)) {
      out(409, ['ok'=>false, 'error'=>'Confirmação financeira inválida. Consulte novamente.']);
    }
    $atual = [];
    foreach ($mensalidades as $m) {
      $atual[] = [
        'id'=>(int)($m['id'] ?? 0),
        'parcela'=>(string)($m['parcela'] ?? ''),
        'vencimento'=>(string)($m['vencimento'] ?? ''),
        'valor_centavos'=>(int)round((float)($m['valor'] ?? 0)*100),
      ];
    }
    $esperadoNormalizado = [];
    foreach ($esperado as $e) {
      if (!is_array($e)) out(409, ['ok'=>false, 'error'=>'Confirmação financeira inválida.']);
      $esperadoNormalizado[] = [
        'id'=>(int)($e['id'] ?? 0),
        'parcela'=>(string)($e['parcela'] ?? ''),
        'vencimento'=>(string)($e['vencimento'] ?? ''),
        'valor_centavos'=>(int)($e['valor_centavos'] ?? -1),
      ];
    }
    if ($atual !== $esperadoNormalizado || (int)round($valorTotal*100) !== (int)$centavos) {
      out(409, ['ok'=>false, 'code'=>'LOTE_ALTERADO', 'error'=>'As mensalidades ou valores mudaram. Consulte novamente e confirme o novo total antes de gerar o link.']);
    }
  }
  $generated = pai_unyfintech_generate_payment_link(
    array_map(static fn($m) => (int)$m['id'], $mensalidades),
    $valorTotal
  );

  if (empty($generated['ok'])) {
    out(502, $generated);
  }

  out(200, [
    'ok'=>true,
    'tipo'=>'link_pagamento',
    'cpf'=>$cpf,
    'mensalidade'=>$mensalidade,
    'mensalidades'=>$mensalidades,
    'quantidade_parcelas'=>count($mensalidades),
    'valor_total'=>round($valorTotal, 2),
    'url'=>$generated['url'],
    'chave'=>$generated['chave'] ?? null,
    'tried'=>$generated['tried'] ?? null,
  ]);
}


/**
 * GET ?op=ping
 */
if ($op === 'ping' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  out(200, ['ok'=>true, 'pong'=>true, 'ts'=>date('c')]);
}

/**
 * GET ?op=filter_options
 * Retorna opções para selects: cidades, planos, situacoes
 */
if ($op === 'filter_options' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  $catalog = load_contract_catalog_for_local_search([1,2,3,4,5,6,7,8,9]);

  if (empty($catalog['ok'])) {
    out(502, [
      'ok'=>false,
      'error'=>$catalog['error'] ?? 'Falha ao carregar opções dos filtros.',
      'upstream_http'=>$catalog['http'] ?? null,
    ]);
  }

  $setCidade = [];
  $setPlano = [];
  $setSit = [];

  foreach (($catalog['rows'] ?? []) as $frontRow) {
    if (!is_array($frontRow)) continue;

    $cidade = trim((string)($frontRow['cidade'] ?? ''));
    if ($cidade !== '') $setCidade[$cidade] = true;

    $planLike = trim((string)(
      $frontRow['cobertura'] ??
      $frontRow['plano'] ??
      ''
    ));
    if ($planLike !== '') $setPlano[$planLike] = true;

    $sit = trim((string)($frontRow['situacao'] ?? ''));
    if ($sit !== '') $setSit[$sit] = true;
  }

  $cidades = array_keys($setCidade);
  $planos = array_keys($setPlano);
  $situacoes = array_keys($setSit);

  sort($cidades, SORT_LOCALE_STRING);
  sort($planos, SORT_LOCALE_STRING);
  sort($situacoes, SORT_LOCALE_STRING);

  out(200, [
    'ok'=>true,
    'cached'=>!empty($catalog['cached']),
    'pages_read'=>(int)($catalog['pages_read'] ?? 0),
    'cidades'=>$cidades,
    'planos'=>$planos,
    'situacoes'=>$situacoes,
  ]);
}

/**
 * GET ?op=contracts&page=1&pageSize=10&textToSearch=...
 * + (opcional do front) &cidade=...&plano=...&situacaoText=...
 *
 * OBS:
 * - "plano" aqui = valor do select (na prática, cobertura quando existir)
 * - "situacaoText" é separado de "situacao" (ids numéricos)
 */
if ($op === 'contracts' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  $page = max(1, (int)($_GET['page'] ?? 1));
  $pageSize = min(
    100,
    max(1, (int)($_GET['pageSize'] ?? 10))
  );

  $text = trim(
    (string)(
      $_GET['textToSearch']
      ?? $_GET['q']
      ?? $_GET['busca']
      ?? $_GET['nome']
      ?? ''
    )
  );

  $fCidade = trim(
    (string)($_GET['cidade'] ?? '')
  );

  $fPlano = trim(
    (string)($_GET['plano'] ?? '')
  );

  $fSitTxt = trim(
    (string)($_GET['situacaoText'] ?? '')
  );

  $situ = trim(
    (string)($_GET['situacao_ids'] ?? '')
  );

  if ($situ === '') {
    $situ = trim(
      (string)($_GET['situacao'] ?? '')
    );
  }

  $situArr = [];

  if (
    $situ !== '' &&
    preg_match('/^\d+(,\d+)*$/', $situ)
  ) {
    foreach (explode(',', $situ) as $s) {
      $s = trim($s);

      if (
        $s !== '' &&
        ctype_digit($s)
      ) {
        $situArr[] = (int)$s;
      }
    }
  }

  if (empty($situArr)) {
    $situArr = [1,2,3,4,5,6,7,8,9];
  }

  /**
   * PESQUISA E FILTROS GLOBAIS GARANTIDOS
   *
   * Não depende de filtros textuais/pesquisa da Unypax como fonte de verdade.
   */
  $hasGlobalFilter =
    $text !== '' ||
    $fCidade !== '' ||
    $fPlano !== '' ||
    $fSitTxt !== '';

  if ($hasGlobalFilter) {
    $catalog =
      load_contract_catalog_for_local_search(
        $situArr
      );

    if (empty($catalog['ok'])) {
      out(502, [
        'ok' => false,
        'error' =>
          $catalog['error'] ??
          'Falha ao pesquisar contratos.',
        'upstream_http' =>
          $catalog['http'] ??
          null,
      ]);
    }

    $filtroTela = static function($frontRow) use ($fCidade, $fPlano, $fSitTxt) {
      return contract_matches_front_filters($frontRow, $fCidade, $fPlano, $fSitTxt);
    };

    $nivelBusca = 0;
    if ($text !== '') {
      $busca = contract_search_progressive($catalog['rows'] ?? [], $text, $filtroTela);
      $matched = $busca['rows'];
      $nivelBusca = (int)$busca['nivel'];
    } else {
      $matched = array_values(array_filter(
        (array)($catalog['rows'] ?? []),
        static fn($r) => is_array($r) && $filtroTela($r)
      ));
    }

    $total = count($matched);
    $offset = ($page - 1) * $pageSize;

    $pageItems = array_slice(
      $matched,
      $offset,
      $pageSize
    );

    foreach ($pageItems as &$frontRow) {
      $cpfDigits = onlyDigits(
        $frontRow['cpf_cnpj'] ?? ''
      );

      $frontRow['has_access'] =
        (
          strlen($cpfDigits) === 11 &&
          db_has_auth_by_cpf(
            $mysqli,
            $cpfDigits
          )
        )
          ? 1
          : 0;
    }

    unset($frontRow);

    $localPagination =
      make_local_pagination(
        $page,
        $pageSize,
        $total
      );

    header(
      'X-Pagination: ' .
      json_encode(
        $localPagination,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
      )
    );

    out(200, [
      'ok' => true,
      'data' => $pageItems,
      'pagination' => $localPagination,
      'search_mode' => 'local_catalog',
      'search_query' => $text,
      // 1 = texto exato, 2 = palavras em qualquer ordem, 3 = nome parecido
      'search_level' => $nivelBusca,
      'busca_aproximada' => $nivelBusca === 3,
      'filters' => [
        'cidade' => $fCidade,
        'plano' => $fPlano,
        'situacao' => $fSitTxt,
      ],
      'pages_read' =>
        (int)($catalog['pages_read'] ?? 0),
      'catalog_cached' => !empty($catalog['cached']),
      'total_matches' => $total,
    ]);
  }

  /**
   * LISTAGEM NORMAL
   * Sem pesquisa, mantém a consulta paginada rápida.
   */
  $r = uny_contracts_search(
    $page,
    $pageSize,
    $situArr,
    ''
  );

  if (!$r['ok']) {
    out(502, [
      'ok'=>false,
      'error'=>
        $r['error'] ??
        'Falha ao consultar contratos na Unypax.',
      'upstream_http'=>
        $r['http'] ??
        null,
    ]);
  }

  $items =
    $r['items'] ??
    uny_extract_items(
      $r['data'] ?? null
    );

  if (!is_array($items)) {
    out(502, [
      'ok'=>false,
      'error'=>
        'A resposta da Unypax não contém uma lista de contratos reconhecível.',
    ]);
  }

  $pagination =
    uny_pagination_from_headers(
      $r['headers'] ?? [],
      $page,
      $pageSize
    );

  if (
    $page === 1 &&
    empty($items) &&
    is_array($pagination) &&
    (int)(
      $pagination['totalItemCount'] ?? 0
    ) > 0
  ) {
    out(502, [
      'ok'=>false,
      'error'=>
        'A Unypax informou contratos na paginação, mas retornou a lista vazia. Verifique o formato atual da resposta da API.',
      'upstream_http'=>
        $r['http'] ??
        null,
    ]);
  }

  $outItems = [];

  foreach ($items as $row) {
    $frontRow = contract_to_front(
      is_array($row) ? $row : []
    );

    if (!$frontRow) {
      continue;
    }

    $cpfDigits = onlyDigits(
      $frontRow['cpf_cnpj'] ?? ''
    );

    $frontRow['has_access'] =
      (
        strlen($cpfDigits) === 11 &&
        db_has_auth_by_cpf(
          $mysqli,
          $cpfDigits
        )
      )
        ? 1
        : 0;

    if (
      !contract_matches_front_filters(
        $frontRow,
        $fCidade,
        $fPlano,
        $fSitTxt
      )
    ) {
      continue;
    }

    $outItems[] = $frontRow;
  }

  $canonicalPagination =
    make_response_pagination(
      $pagination,
      $page,
      $pageSize,
      count($outItems)
    );

  header(
    'X-Pagination: ' .
    json_encode(
      $canonicalPagination,
      JSON_UNESCAPED_UNICODE |
      JSON_UNESCAPED_SLASHES
    )
  );

  out(200, [
    'ok'=>true,
    'data'=>$outItems,
    'pagination'=>$canonicalPagination,
    'search_mode'=>'none',
  ]);
}

/**
 * GET ?op=contract_detail&idContrato=123&cpf=...
 * GET ?op=contract_detail&idContrato=123
 * GET ?op=contract_detail&nome=...
 * GET ?op=contract_detail&textToSearch=...
 *
 * IMPORTANTE:
 * - a consulta de beneficiários da Unypax depende do CPF do titular;
 * - quando o CPF não vier na requisição, este endpoint resolve o titular
 *   internamente pelo idContrato/nome/contrato antes de consultar beneficiários;
 * - isso permite que consumidores como a Aurora consultem dependentes sem
 *   precisar pedir CPF ao colaborador.
 */
if ($op === 'contract_detail' && $_SERVER['REQUEST_METHOD'] === 'GET') {
  $idContrato = (int)(
    $_GET['idContrato']
    ?? $_GET['contrato_id']
    ?? 0
  );

  $cpf = onlyDigits($_GET['cpf'] ?? '');

  $search = trim((string)(
    $_GET['textToSearch']
    ?? $_GET['q']
    ?? $_GET['busca']
    ?? $_GET['nome']
    ?? $_GET['contrato']
    ?? ''
  ));

  $resolvedIdentity = null;

  /*
   * O endpoint antigo aceitava idContrato sem CPF, porém nesse caso não
   * executava uny_beneficiario_by_cpf() e devolvia beneficiarios=[].
   *
   * Reaproveitamos o mesmo resolvedor já usado pelo financial_status para
   * descobrir o CPF do titular de forma segura e sem duplicar regras de busca.
   */
  if (strlen($cpf) !== 11) {
    if ($idContrato <= 0 && $search === '') {
      out(400, [
        'ok'=>false,
        'code'=>'IDENTIFICADOR_AUSENTE',
        'error'=>'Informe idContrato, CPF, nome ou contrato para localizar o associado.',
      ]);
    }

    $resolvedIdentity = pai_finance_resolve_identity(
      $cpf,
      $idContrato,
      $search
    );

    if (empty($resolvedIdentity['ok'])) {
      $status = (($resolvedIdentity['code'] ?? '') === 'ASSOCIADO_AMBIGUO')
        ? 409
        : 400;

      out($status, $resolvedIdentity);
    }

    $cpf = onlyDigits(
      $resolvedIdentity['cpf'] ?? ''
    );

    if ($idContrato <= 0) {
      $idContrato = (int)(
        $resolvedIdentity['idContrato'] ?? 0
      );
    }
  }

  if (strlen($cpf) !== 11) {
    out(400, [
      'ok'=>false,
      'code'=>'CPF_INTERNO_NAO_LOCALIZADO',
      'error'=>'O associado foi localizado, mas não foi possível obter um CPF válido para consultar os beneficiários.',
    ]);
  }

  $localAuth = null;
  $benefRaw = null;
  $beneficiarios = [];
  $contas = null;
  $benefError = null;
  $accessMap = [];

  if (strlen($cpf) === 11) {
    $localAuth = db_get_auth_by_cpf($mysqli, $cpf);

    $b = uny_beneficiario_by_cpf($cpf);

    if ($b['ok']) {
      $benefRaw = $b['data'];
      $beneficiarios = normalize_beneficiarios_payload(
        $benefRaw,
        $cpf,
        $mysqli
      );
    } else {
      $benefError = $b['error'] ?? 'Falha ao consultar beneficiários.';
    }
  }

  /*
   * Reúne todos os CPFs que apareceram tanto na lista normalizada
   * quanto no JSON bruto. Isso é importante porque algumas respostas
   * trazem o CPF somente no formato bruto.
   */
  $cpfSet = [];

  if (strlen($cpf) === 11) {
    $cpfSet[$cpf] = true;
  }

  foreach ($beneficiarios as $beneficiarioItem) {
    $itemCpf = onlyDigits(
      $beneficiarioItem['CPF'] ??
      $beneficiarioItem['cpf'] ??
      ''
    );

    if (strlen($itemCpf) === 11) {
      $cpfSet[$itemCpf] = true;
    }
  }

  collect_cpfs_from_payload(
    $benefRaw,
    $cpfSet
  );

  $accessMap = db_get_auth_map_by_cpfs(
    $mysqli,
    array_keys($cpfSet)
  );

  /*
   * Atualiza a lista normalizada usando o mapa de acessos por CPF.
   */
  foreach ($beneficiarios as &$beneficiarioStatusItem) {
    $statusCpf = onlyDigits(
      $beneficiarioStatusItem['CPF'] ??
      $beneficiarioStatusItem['cpf'] ??
      ''
    );

    $statusAuth =
      strlen($statusCpf) === 11
        ? ($accessMap[$statusCpf] ?? null)
        : null;

    $beneficiarioStatusItem['local_auth'] =
      $statusAuth;

    $beneficiarioStatusItem['has_access'] =
      $statusAuth ? 1 : 0;
  }
  unset($beneficiarioStatusItem);

  /*
   * Cada pessoa válida recebe um token assinado pelo servidor.
   * Esse token comprova o vínculo no momento do salvamento.
   */
  foreach ($beneficiarios as &$beneficiarioItem) {
    $itemTipo = strtoupper(
      trim((string)($beneficiarioItem['Tipo'] ?? ''))
    );

    $itemCpf = onlyDigits(
      $beneficiarioItem['CPF'] ?? ''
    );

    if (
      strlen($itemCpf) === 11 &&
      in_array($itemTipo, ['T','D','A'], true)
    ) {
      $beneficiarioItem['access_token'] =
        create_access_token(
          $cpf,
          $itemCpf,
          $itemTipo,
          $beneficiarioItem['Nome'] ?? '',
          $idContrato
        );
    }
  }
  unset($beneficiarioItem);

  if ($idContrato > 0) {
    $c = uny_contasreceber_search(1, 50, $idContrato, ['P','B','C']);
    $contas = $c['ok'] ? $c['data'] : null;
  }

  // Etiquetas (listTag) lidas na hora da Unymos, sem a cópia guardada.
  $contratoAoVivo = pai_contract_live_info(
    $idContrato,
    (string)($resolvedIdentity['contrato'] ?? ''),
    $cpf
  );

  out(200, [
    'contrato_tags'=>$contratoAoVivo['tags'] ?? [],
    'contrato_ao_vivo'=>$contratoAoVivo,
    'ok'=>true,
    'titular_cpf'=>$cpf,
    'resolved_identity'=>$resolvedIdentity ? [
      'idContrato'=>(int)($resolvedIdentity['idContrato'] ?? $idContrato),
      'nome'=>(string)($resolvedIdentity['nome'] ?? ''),
      'contrato'=>(string)($resolvedIdentity['contrato'] ?? ''),
      'resolved_by'=>(string)($resolvedIdentity['resolved_by'] ?? ''),
    ] : null,
    'local_auth'=>$localAuth,

    // Campo normalizado usado pela página administrativa.
    'beneficiarios'=>$beneficiarios,
    'beneficiarios_count'=>count($beneficiarios),

    /*
     * Mapa indexado pelo CPF, usado pela página para marcar
     * "Com acesso" mesmo quando o CPF veio somente no JSON bruto.
     */
    'access_map'=>$accessMap,

    // Mantido por compatibilidade com a página anterior.
    'beneficiario'=>$benefRaw,
    'beneficiario_error'=>$benefError,

    'contas_receber'=>$contas,
  ]);
}

/**
 * POST ?op=upsert_access
 * body:
 * {
 *   cpf, senha, email, telefone,
 *   titular_cpf, idContrato, tipo, nome, access_token
 * }
 */
if ($op === 'upsert_access' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $b = bodyAny();

  /*
   * O acesso é salvo diretamente pelo CPF informado pela tela
   * administrativa. Não é feita uma segunda consulta à Unypax e
   * não é exigida validação de vínculo com o contrato.
   */
  $cpf = onlyDigits($b['cpf'] ?? '');
  $senha = (string)($b['senha'] ?? '');
  $email = (string)($b['email'] ?? '');
  $telefone = (string)($b['telefone'] ?? '');

  if (strlen($cpf) !== 11) {
    out(400, [
      'ok'=>false,
      'error'=>'CPF do associado inválido.',
    ]);
  }

  /*
   * titular_cpf, idContrato, tipo, nome e access_token continuam
   * aceitos por compatibilidade com a page.tsx atual, mas não são
   * usados para autorizar ou bloquear o salvamento.
   */
  $titularCpf = onlyDigits(
    $b['titular_cpf'] ??
    $b['titularCpf'] ??
    ''
  );

  $idContrato = (int)(
    $b['idContrato'] ??
    $b['id_contrato'] ??
    0
  );

  $requestedTipo = strtoupper(
    trim((string)($b['tipo'] ?? ''))
  );

  $requestedNome = trim(
    (string)($b['nome'] ?? '')
  );

  $r = db_upsert_access(
    $mysqli,
    $cpf,
    $senha,
    $email,
    $telefone
  );

  if (!$r['ok']) {
    out(400, [
      'ok'=>false,
      'error'=>$r['error'],
    ]);
  }

  $savedAuth = db_get_auth_by_cpf(
    $mysqli,
    $cpf
  );

  out(200, array_merge($r, [
    'tipo'=>$requestedTipo ?: null,
    'nome'=>$requestedNome ?: null,
    'titular_cpf'=>$titularCpf ?: null,
    'idContrato'=>$idContrato ?: null,
    'has_access'=>$savedAuth ? 1 : 0,
    'local_auth'=>$savedAuth,
  ]));
}

/**
 * POST ?op=reset_access body: { cpf }
 */
if ($op === 'reset_access' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $b = bodyAny();
  $cpf = onlyDigits($b['cpf'] ?? '');
  if (strlen($cpf) !== 11) out(400, ['ok'=>false,'error'=>'CPF inválido']);
  $r = db_admin_reset_password($mysqli, $cpf);
  if (!$r['ok']) out(400, ['ok'=>false,'error'=>$r['error']]);
  out(200, $r);
}

out(404, ['ok'=>false, 'error'=>'Operação inválida']);