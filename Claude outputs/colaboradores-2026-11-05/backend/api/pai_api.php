<?php
declare(strict_types=1);
// 23/10/2026 (segurança): confere o login assinado (cookie pai_session) antes de usar os cookies pai_*. Ver /home2/pla48587/pai_sessao.php
if (is_file('/home2/pla48587/pai_sessao.php')) { include_once '/home2/pla48587/pai_sessao.php'; } elseif (PHP_SAPI !== 'cli') { $paiChavesSemSessao = @include '/home2/pla48587/pai-chaves.php'; if (is_array($paiChavesSemSessao) && strtolower(trim((string) ($paiChavesSemSessao['pai_sessao_modo'] ?? ''))) === 'exigir') { error_log('[PAI] pai_sessao.php ausente com pai_sessao_modo=exigir: acesso bloqueado em ' . basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''))); if (!headers_sent()) { http_response_code(503); header('Content-Type: application/json; charset=utf-8'); header('Retry-After: 300'); } echo json_encode(['ok' => false, 'sucesso' => false, 'success' => false, 'erro' => 'Sistema em manutenção. Tente novamente em alguns minutos.', 'msg' => 'Sistema em manutenção. Tente novamente em alguns minutos.'], JSON_UNESCAPED_UNICODE); exit; } unset($paiChavesSemSessao); } // 23/10/2026: sem o pai_sessao.php e com o modo exigir, bloqueia em vez de liberar

/**
 * pai_api.php — CRUD de usuários, cargos, permissões por usuário/cargo e whoami
 * Banco: configurado externamente em pai-chaves.php
 * Tabela extra criada automaticamente: permissoes
 */

// ---------- Saída limpa (evita BOM/avisos) ----------
@ini_set('display_errors', '0');
@ini_set('html_errors', '0');
@ini_set('zlib.output_compression', '0');
if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');
while (ob_get_level()) { @ob_end_clean(); }

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function json_ok($arr){ echo json_encode($arr, JSON_UNESCAPED_UNICODE); exit; }
function json_err($code,$msg,$extra=[]){ http_response_code($code); echo json_encode(array_merge(['erro'=>$msg],$extra), JSON_UNESCAPED_UNICODE); exit; }

// ---------- CONFIGURAÇÃO PRIVADA / DB ----------
$PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';

if (!is_file($PAI_CHAVES_FILE) || !is_readable($PAI_CHAVES_FILE)) {
  json_err(500, "Arquivo privado de configuração não encontrado ou sem permissão de leitura.");
}

$PAI_CONFIG = require $PAI_CHAVES_FILE;

if (!is_array($PAI_CONFIG)) {
  json_err(500, "Arquivo privado pai-chaves.php inválido.");
}

$servername = trim((string)($PAI_CONFIG['db_host'] ?? ''));
$username   = trim((string)($PAI_CONFIG['db_user'] ?? ''));
$password   = (string)($PAI_CONFIG['db_password'] ?? '');
$dbname     = trim((string)($PAI_CONFIG['db_name'] ?? ''));

if ($servername === '' || $username === '' || $password === '' || $dbname === '') {
  json_err(500, "Configuração do banco ausente ou incompleta em pai-chaves.php.");
}

$conn = @new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) json_err(500, "Erro na conexão com o banco de dados.");
$conn->set_charset('utf8mb4');

// Cria tabela de permissões (se não existir)
$conn->query("
CREATE TABLE IF NOT EXISTS permissoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  pagina VARCHAR(100) NOT NULL,
  UNIQUE KEY uniq_user_pagina (user_id, pagina),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");

function s($v){ return trim((string)$v); }
function as_int($v){ return (int)$v; }

function cargo_normalize($v): string {
  return strtolower(trim((string)$v));
}

function cargo_ativo_por_slug(mysqli $conn, string $slug): ?array {
  $slug = cargo_normalize($slug);
  if ($slug === '') return null;

  $stmt = $conn->prepare("
    SELECT id, nome, slug, descricao, ativo
      FROM cargos
     WHERE slug = ?
       AND ativo = 1
     LIMIT 1
  ");
  if (!$stmt) return null;

  $stmt->bind_param('s', $slug);
  $stmt->execute();
  $row = $stmt->get_result()->fetch_assoc();
  $stmt->close();

  return $row ?: null;
}

// Helper para definir/limpar cookies no domínio raiz
function set_cookie_site($name, $value, $days = 1) {
  $opts = [
    'expires'  => time() + 86400 * $days,
    'path'     => '/',
    'domain'   => '.planoassistencialintegrado.com.br', // cobre raiz e subdomínios
    'secure'   => true,
    'httponly' => false, // precisa ser legível pelo Next no server
    'samesite' => 'Lax',
  ];
  setcookie($name, (string)$value, $opts);
}
function clear_cookie_site($name) {
  set_cookie_site($name, '', -1);
}

// ---------- Body JSON ou form ----------
$raw = file_get_contents("php://input");
$body = json_decode($raw, true);
if (!is_array($body)) $body = $_POST ?? [];

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// 23/10/2026 (segurança, parte 4): ações que gravam permissões exigem administrador (cargo adm ou página Permissões).
// As ações da tela Usuários ficam no grupo 'usuarios' (modo próprio), porque a tela ainda chama sem enviar o login.
// 27/10/2026 (grupos): páginas do usuário, páginas do grupo e criar/alterar/excluir usuário (que define o grupo)
// passam a exigir Gestão (grupo Gestão = cargo adm, ou página 'gestao'). As funções da Aurora seguem com 'permissoes'.
if (function_exists('paiProtecao')) {
  if (in_array($action, ['save_permissions', 'save_cargo_permissions'], true)) {
    paiProtecao('admin', ['gestao'], 'pai_api:' . $action, 'geral');
  } elseif (in_array($action, ['save_user_ia_departamentos', 'save_user_ia_ferramentas'], true)) {
    paiProtecao('admin', ['permissoes'], 'pai_api:' . $action, 'geral');
  } elseif (in_array($action, ['create_user', 'update_user', 'delete_user'], true)) {
    paiProtecao('admin', ['gestao'], 'pai_api:' . $action, 'usuarios');
  } elseif ($action === 'list_users') {
    paiProtecao('login', [], 'pai_api:list_users', 'usuarios');
  }
}

/* ============================================================
 * WHOAMI — identifica o usuário logado a partir do cookie pai_user
 * - Lê o cookie 'pai_user' (ou 'user' como fallback)
 * - Busca no banco por esse login
 * - Se encontrar, retorna {id, nome, usuario} e RENOVA cookies:
 *     - pai_auth=1, pai_uid={id}, pai_user={usuario}
 * - Se não houver, limpa cookies e retorna valores nulos
 * ============================================================ */
if ($action === 'whoami') {
  $login = trim((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
  if ($login === '') {
    // sem cookie → garante limpeza e responde nulo
    clear_cookie_site('pai_auth');
    clear_cookie_site('pai_uid');
    clear_cookie_site('pai_user');
    $conn->close(); json_ok(['id'=>null, 'nome'=>null, 'usuario'=>null, 'cargo'=>null, 'cargo_id'=>null, 'cargo_nome'=>null]);
  }

  $stmt = $conn->prepare("SELECT
      u.id,
      u.nome,
      u.usuario,
      u.cargo,
      COALESCE(u.ativo, 1) AS ativo,
      c.id AS cargo_id,
      c.nome AS cargo_nome
    FROM usuarios u
    LEFT JOIN cargos c
      ON c.slug = u.cargo
     AND c.ativo = 1
    WHERE u.usuario = ?
    LIMIT 1");
  if (!$stmt) { $conn->close(); json_err(500, "Erro ao preparar operação."); }
  $stmt->bind_param('s', $login);
  $stmt->execute();
  $res = $stmt->get_result()->fetch_assoc();
  $stmt->close();
  $conn->close();

  // 05/11/2026 (colaboradores): usuário inativado (desligado ou bloqueado) não é mais reconhecido; os cookies são limpos.
  if ($res && (int)($res['ativo'] ?? 1) === 0) { $res = null; }
  if (is_array($res)) { unset($res['ativo']); }

  if (!$res) {
    // cookie não bate com ninguém → limpa cookies e informa login bruto
    clear_cookie_site('pai_auth');
    clear_cookie_site('pai_uid');
    // mantemos pai_user vazio para forçar novo estado no app
    clear_cookie_site('pai_user');
    json_ok(['id'=>null, 'nome'=>null, 'usuario'=>$login, 'cargo'=>null, 'cargo_id'=>null, 'cargo_nome'=>null]);
  }

  // Usuário encontrado → renova cookies que o app usa
  set_cookie_site('pai_auth', '1', 1);
  set_cookie_site('pai_uid',  (string)$res['id'], 1);
  set_cookie_site('pai_user', (string)$res['usuario'], 1);

  if (isset($res['id'])) $res['id'] = (int)$res['id'];
  $res['cargo_id'] = isset($res['cargo_id']) && $res['cargo_id'] !== null
    ? (int)$res['cargo_id']
    : null;

  json_ok($res); // {id, nome, usuario, cargo, cargo_id, cargo_nome}
}

/* =========================== CARGOS =========================== */
if ($action === 'list_cargos') {
  $rows = [];
  $rs = $conn->query("
    SELECT id, nome, slug, descricao, ativo
      FROM cargos
     WHERE ativo = 1
     ORDER BY nome ASC
  ");

  if (!$rs) {
    $conn->close();
    json_err(500, "Erro ao listar cargos.");
  }

  while ($row = $rs->fetch_assoc()) {
    $row['id'] = (int)$row['id'];
    $row['ativo'] = (int)$row['ativo'];
    $rows[] = $row;
  }

  $conn->close();
  json_ok($rows);
}

/* =========================== USERS =========================== */
if ($action === 'list_users') {
  $rows = [];
  // 05/11/2026: devolve também se o acesso está ativo (usuário não é mais excluído, é inativado).
  $rs = $conn->query("SELECT id, nome, usuario, cargo, COALESCE(ativo, 1) AS ativo FROM usuarios ORDER BY id ASC");
  if ($rs) while($row = $rs->fetch_assoc()) $rows[] = $row;
  $conn->close(); json_ok($rows);
}

if ($action === 'create_user') {
  $nome = s($body['nome'] ?? '');
  $usuario = s($body['usuario'] ?? '');
  $senha = (string)($body['senha'] ?? '');
  $cargo = cargo_normalize($body['cargo'] ?? '');

  if ($nome === '' || $usuario === '' || $senha === '') {
    $conn->close();
    json_err(400, "Preencha nome, usuário e senha.");
  }
  // 23/10/2026 (segurança): a senha é gravada protegida (password_hash), nunca em texto puro.
  $senha = password_hash($senha, PASSWORD_DEFAULT);

  // Compatibilidade com a tela atual: cargo pode ficar vazio até a nova page.tsx ser publicada.
  // Quando vier preenchido, precisa existir e estar ativo na tabela cargos.
  if ($cargo !== '' && !cargo_ativo_por_slug($conn, $cargo)) {
    $conn->close();
    json_err(400, "Cargo inválido ou inativo.");
  }

  $stmt = $conn->prepare("
    INSERT INTO usuarios (nome, usuario, senha, cargo)
    VALUES (?, ?, ?, ?)
  ");
  if (!$stmt) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmt->bind_param('ssss', $nome, $usuario, $senha, $cargo);
  $stmt->execute();
  $ok = $stmt->affected_rows > 0;
  $id = $stmt->insert_id;
  $stmt->close();
  $conn->close();

  if ($ok) {
    json_ok([
      "sucesso" => true,
      "id" => $id,
      "cargo" => $cargo !== '' ? $cargo : null
    ]);
  }

  json_err(500, "Erro ao criar usuário.");
}

if ($action === 'update_user') {
  $id = as_int($body['id'] ?? 0);
  $nome = s($body['nome'] ?? '');
  $usuario = s($body['usuario'] ?? '');
  $senha = (string)($body['senha'] ?? '');
  // 23/10/2026 (segurança): senha nova é gravada protegida (password_hash); vazia = mantém a atual.
  if ($senha !== '') { $senha = password_hash($senha, PASSWORD_DEFAULT); }

  $cargoInformado = array_key_exists('cargo', $body);
  $cargo = $cargoInformado ? cargo_normalize($body['cargo'] ?? '') : '';

  if ($id <= 0 || $nome === '' || $usuario === '') {
    $conn->close();
    json_err(400, "Dados inválidos.");
  }

  if ($cargoInformado && $cargo !== '' && !cargo_ativo_por_slug($conn, $cargo)) {
    $conn->close();
    json_err(400, "Cargo inválido ou inativo.");
  }

  // Enquanto a page.tsx antiga não enviar cargo, o valor atual é preservado.
  if ($cargoInformado) {
    if ($senha === '') {
      $stmt = $conn->prepare("
        UPDATE usuarios
           SET nome = ?, usuario = ?, cargo = ?
         WHERE id = ?
      ");
      if (!$stmt) { $conn->close(); json_err(500, "Erro ao preparar operação."); }
      $stmt->bind_param('sssi', $nome, $usuario, $cargo, $id);
    } else {
      $stmt = $conn->prepare("
        UPDATE usuarios
           SET nome = ?, usuario = ?, senha = ?, cargo = ?
         WHERE id = ?
      ");
      if (!$stmt) { $conn->close(); json_err(500, "Erro ao preparar operação."); }
      $stmt->bind_param('ssssi', $nome, $usuario, $senha, $cargo, $id);
    }
  } else {
    if ($senha === '') {
      $stmt = $conn->prepare("
        UPDATE usuarios
           SET nome = ?, usuario = ?
         WHERE id = ?
      ");
      if (!$stmt) { $conn->close(); json_err(500, "Erro ao preparar operação."); }
      $stmt->bind_param('ssi', $nome, $usuario, $id);
    } else {
      $stmt = $conn->prepare("
        UPDATE usuarios
           SET nome = ?, usuario = ?, senha = ?
         WHERE id = ?
      ");
      if (!$stmt) { $conn->close(); json_err(500, "Erro ao preparar operação."); }
      $stmt->bind_param('sssi', $nome, $usuario, $senha, $id);
    }
  }

  $stmt->execute();
  $ok = $stmt->affected_rows >= 0;
  $stmt->close();

  if (!$ok) {
    $conn->close();
    json_err(500, "Erro ao atualizar usuário.");
  }

  $stmtUser = $conn->prepare("
    SELECT id, nome, usuario, cargo
      FROM usuarios
     WHERE id = ?
     LIMIT 1
  ");

  $updated = null;
  if ($stmtUser) {
    $stmtUser->bind_param('i', $id);
    $stmtUser->execute();
    $updated = $stmtUser->get_result()->fetch_assoc();
    $stmtUser->close();
  }

  $conn->close();
  json_ok([
    "sucesso" => true,
    "usuario" => $updated
  ]);
}

if ($action === 'delete_user') {
  // 05/11/2026 (colaboradores e usuários): usuário não é mais excluído. A ação passa a INATIVAR o acesso
  // (usuarios.ativo = 0): a pessoa não entra mais no app, mas o cadastro, as permissões e o histórico de quem fez o quê ficam.
  // Liberar de novo é na tela Colaboradores e usuários (rh_colaboradores.php, acesso_ativo).
  $id = as_int($body['id'] ?? 0);
  if ($id <= 0) { $conn->close(); json_err(400, "ID inválido."); }

  $stmt = $conn->prepare("UPDATE usuarios SET ativo = 0 WHERE id = ?");
  if (!$stmt) { $conn->close(); json_err(500, "Erro ao preparar operação."); }
  $stmt->bind_param('i', $id);
  $stmt->execute(); $ok = $stmt->affected_rows >= 0;
  $stmt->close(); $conn->close();
  if ($ok) json_ok(["sucesso" => true, "inativado" => true]);
  json_ok(["sucesso" => false, "msg" => "Usuário não encontrado."]);
}

/* ======================== PAGES (opcional) ======================== */
if ($action === 'list_pages') {
  $pages = [
    ["key"=>"inicio",             "label"=>"Início"],
    ["key"=>"quadro-acompanhamento","label"=>"Quadro de Atendimento"],
    ["key"=>"acompanhamento",    "label"=>"Acompanhamento"],
    ["key"=>"visita-avaliacao", "label"=>"Visita de Avaliação"],
    ["key"=>"pos-atendimento-avaliacao", "label"=>"Pós-Atendimento"],
    ["key"=>"clube",             "label"=>"Clube PAI"],
    ["key"=>"leads",             "label"=>"Leads"],
    ["key"=>"coroa-de-flores",   "label"=>"Coroa de Flores"],
    ["key"=>"relatorio",         "label"=>"Relatório"],
    ["key"=>"administrativo",    "label"=>"Administrativo"],
    ["key"=>"servicos-funerarios",         "label"=>"Serviços Funerários"],
    ["key"=>"plano",    "label"=>"Plano"],
    ["key"=>"associados",    "label"=>"Associados"],
    ["key"=>"novos-planos",  "label"=>"Novos planos"],
    ["key"=>"avisos",    "label"=>"Avisos"],
    // extras
    ["key"=>"dashboard",         "label"=>"Dashboard"],
    ["key"=>"api",               "label"=>"API"],
    ["key"=>"atendimento",       "label"=>"Atendimento"],
    ["key"=>"catalogo",          "label"=>"Catálogo"],
    ["key"=>"login",             "label"=>"Login"],
    ["key"=>"medicos",           "label"=>"Médicos"],
    ["key"=>"relatorio-guias",   "label"=>"Relatório de Consultas"],
    ["key"=>"mensagens",         "label"=>"Mensagens"],
    ["key"=>"noticias",          "label"=>"Notícias"],
    ["key"=>"offline",           "label"=>"Offline"],
    ["key"=>"parceiros",         "label"=>"Parceiros"],
    ["key"=>"permissoes",        "label"=>"Permissões"],
    ["key"=>"config-catalogo",   "label"=>"Configurações do Catálogo"],
    ["key"=>"sorteios",          "label"=>"Sorteios"],
    ["key"=>"tela",              "label"=>"Tela Inicial"],
    ["key"=>"telemetria",        "label"=>"Telemetria"],
    ["key"=>"usuarios",          "label"=>"Usuários"],
    ["key"=>"estoque",           "label"=>"Estoque"],
    ["key"=>"assistencia",       "label"=>"Assistência"],
    ["key"=>"geral",             "label"=>"Geral"],
    ["key"=>"produtos",          "label"=>"Produtos"],
    ["key"=>"requisicao",          "label"=>"Requisição"],
    ["key"=>"minhas-solicitacoes",          "label"=>"Minhas Solicitações"],
    ["key"=>"requisicoes",          "label"=>"Requisições"],
    ["key"=>"solicitar-produto",          "label"=>"Solicitar Produto"],
    ["key"=>"dashboard-requisicoes",          "label"=>"Dashboard Requisições"],
    ["key"=>"balanco",          "label"=>"Balanço"],
    ["key"=>"chat",          "label"=>"Chat"],
    ["key"=>"conhecimento",          "label"=>"Conhecimento IA"],
    ["key"=>"convenio",          "label"=>"Convênios"],
    ["key"=>"os-financeiro",     "label"=>"OS · Financeiro"],
    ["key"=>"os-relatorio",      "label"=>"OS · Relatório de Atendimentos"],
    ["key"=>"os-minhas",         "label"=>"OS · Minhas OS"],
	["key"=>"desempenho",          "label"=>"Desempenho"],
    // entradas dos módulos (menu novo) e telas que não tinham chave
    ["key"=>"comunicacao",         "label"=>"Comunicação (entrada do módulo)"],
    ["key"=>"modulo-estoque",      "label"=>"Estoque (entrada do módulo)"],
    ["key"=>"financeiro",          "label"=>"Financeiro (entrada do módulo)"],
    ["key"=>"gestao",              "label"=>"Gestão (entrada do módulo)"],
    ["key"=>"auditoria",           "label"=>"Auditoria"],
    ["key"=>"relatorio-sintetico", "label"=>"Relatório Sintético"],
    ["key"=>"dashboard-estoque",   "label"=>"Estoque · Dashboard de movimentações"],
    ["key"=>"painel-estoque",      "label"=>"Estoque · Painel de gestão"],
    // Messenger (pacote de 04/10/2026, autorizado na outra conversa)
    ["key"=>"messenger",           "label"=>"Messenger"],
    // messenger-clientes removida em 07/10/2026: todos com o Messenger atendem clientes
    ["key"=>"messenger-historico", "label"=>"Messenger · Histórico de clientes"],
    // 14/10/2026: Configurações do Messenger (autorizado pelo usuário)
    ["key"=>"messenger-config",    "label"=>"Messenger · Configurações"],
    // Orçamento (13/10/2026, autorizado pelo usuário)
    ["key"=>"orcamento",           "label"=>"Orçamento"],
  ];
  $conn->close(); json_ok($pages);
}


/* ==================== MY PERMISSIONS ========================== */
/*
 * Retorna as permissões efetivas do usuário logado com base no cargo.
 * O cliente não informa user_id nem cargo_id: o backend resolve tudo
 * pelo cookie pai_user -> usuarios.cargo -> cargos.id -> cargo_paginas.
 */
if ($action === 'my_permissions') {
  $login = trim((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));

  if ($login === '') {
    $conn->close();
    json_ok([]);
  }

  $stmt = $conn->prepare("
    SELECT cp.pagina
      FROM usuarios u
      INNER JOIN cargos c
        ON c.slug = u.cargo
       AND c.ativo = 1
      INNER JOIN cargo_paginas cp
        ON cp.cargo_id = c.id
     WHERE u.usuario = ?
     ORDER BY cp.pagina ASC
  ");

  if (!$stmt) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmt->bind_param('s', $login);
  $stmt->execute();
  $rs = $stmt->get_result();

  $out = [];
  while ($row = $rs->fetch_assoc()) {
    $pagina = s($row['pagina'] ?? '');
    if ($pagina !== '') $out[] = $pagina;
  }

  $stmt->close();
  $conn->close();
  json_ok($out);
}

/* =================== PERMISSIONS BY CARGO ==================== */
if ($action === 'list_cargo_permissions') {
  $cargo_id = as_int($_GET['cargo_id'] ?? 0);

  if ($cargo_id <= 0) {
    $conn->close();
    json_err(400, "cargo_id inválido.");
  }

  $stmtCargo = $conn->prepare("
    SELECT id
      FROM cargos
     WHERE id = ?
     LIMIT 1
  ");
  if (!$stmtCargo) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmtCargo->bind_param('i', $cargo_id);
  $stmtCargo->execute();
  $cargoExiste = (bool)$stmtCargo->get_result()->fetch_assoc();
  $stmtCargo->close();

  if (!$cargoExiste) {
    $conn->close();
    json_err(404, "Cargo não encontrado.");
  }

  $stmt = $conn->prepare("
    SELECT pagina
      FROM cargo_paginas
     WHERE cargo_id = ?
     ORDER BY pagina ASC
  ");
  if (!$stmt) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmt->bind_param('i', $cargo_id);
  $stmt->execute();
  $rs = $stmt->get_result();

  $out = [];
  while ($row = $rs->fetch_assoc()) {
    $pagina = s($row['pagina'] ?? '');
    if ($pagina !== '') $out[] = $pagina;
  }

  $stmt->close();
  $conn->close();
  json_ok($out);
}

if ($action === 'save_cargo_permissions') {
  $cargo_id = as_int($body['cargo_id'] ?? 0);
  $permissions = $body['permissions'] ?? [];

  if ($cargo_id <= 0 || !is_array($permissions)) {
    $conn->close();
    json_err(400, "Dados inválidos.");
  }

  $stmtCargo = $conn->prepare("
    SELECT id
      FROM cargos
     WHERE id = ?
       AND ativo = 1
     LIMIT 1
  ");
  if (!$stmtCargo) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmtCargo->bind_param('i', $cargo_id);
  $stmtCargo->execute();
  $cargoExiste = (bool)$stmtCargo->get_result()->fetch_assoc();
  $stmtCargo->close();

  if (!$cargoExiste) {
    $conn->close();
    json_err(400, "Cargo inválido ou inativo.");
  }

  // Normaliza, remove vazios e duplicados.
  $normalized = [];
  foreach ($permissions as $pg) {
    $p = s($pg);
    if ($p === '') continue;
    $normalized[$p] = true;
  }
  $normalized = array_keys($normalized);

  // Valida contra a lista oficial de páginas exposta por este endpoint.
  $allowedPages = [
    'inicio',
    'quadro-acompanhamento',
    'acompanhamento',
    'visita-avaliacao',
    'pos-atendimento-avaliacao',
    'clube',
    'leads',
    'coroa-de-flores',
    'relatorio',
    'administrativo',
    'servicos-funerarios',
    'plano',
    'associados',
    'novos-planos',
    'avisos',
    'dashboard',
    'api',
    'atendimento',
    'catalogo',
    'login',
    'medicos',
    'relatorio-guias',
    'mensagens',
    'noticias',
    'offline',
    'parceiros',
    'permissoes',
    'config-catalogo',
    'sorteios',
    'tela',
    'telemetria',
    'usuarios',
    'estoque',
    'assistencia',
    'geral',
    'produtos',
    'requisicao',
    'minhas-solicitacoes',
    'requisicoes',
    'solicitar-produto',
    'dashboard-requisicoes',
    'balanco',
    'chat',
    'conhecimento',
    'convenio',
    'os-financeiro',
    'os-relatorio',
    'os-minhas',
    'desempenho',
    'comunicacao',
    'modulo-estoque',
    'financeiro',
    'gestao',
    'auditoria',
    'relatorio-sintetico',
    'dashboard-estoque',
    'painel-estoque',
    'messenger',
    'messenger-historico',
    'messenger-config',
    'orcamento',
  ];

  $allowedMap = array_fill_keys($allowedPages, true);
  foreach ($normalized as $pagina) {
    if (!isset($allowedMap[$pagina])) {
      $conn->close();
      json_err(400, "Página inválida: " . $pagina);
    }
  }

  $conn->begin_transaction();

  try {
    $stmtDel = $conn->prepare("
      DELETE FROM cargo_paginas
       WHERE cargo_id = ?
    ");
    if (!$stmtDel) {
      throw new RuntimeException("Erro ao preparar remoção das permissões do cargo.");
    }

    $stmtDel->bind_param('i', $cargo_id);
    $stmtDel->execute();
    $stmtDel->close();

    if (count($normalized) > 0) {
      $stmtIns = $conn->prepare("
        INSERT INTO cargo_paginas (cargo_id, pagina)
        VALUES (?, ?)
      ");
      if (!$stmtIns) {
        throw new RuntimeException("Erro ao preparar gravação das permissões do cargo.");
      }

      foreach ($normalized as $pagina) {
        $stmtIns->bind_param('is', $cargo_id, $pagina);
        if (!$stmtIns->execute()) {
          throw new RuntimeException("Erro ao gravar permissão do cargo.");
        }
      }

      $stmtIns->close();
    }

    $conn->commit();
  } catch (Throwable $e) {
    $conn->rollback();
    $conn->close();
    json_err(500, "Erro ao salvar permissões do cargo.");
  }

  $conn->close();
  json_ok([
    "sucesso" => true,
    "cargo_id" => $cargo_id,
    "permissions" => $normalized,
  ]);
}



/* ==================== IA: DEPARTAMENTOS ====================== */

if ($action === 'list_ia_departamentos') {
  $rows = [];

  $rs = $conn->query("
    SELECT id, nome, slug, descricao, ordem, ativo
      FROM aurora_kb_departamentos
     WHERE ativo = 1
     ORDER BY ordem ASC, nome ASC
  ");

  if (!$rs) {
    $conn->close();
    json_err(500, "Erro ao listar departamentos da IA.");
  }

  while ($row = $rs->fetch_assoc()) {
    $row['id'] = (int)$row['id'];
    $row['ordem'] = isset($row['ordem']) ? (int)$row['ordem'] : 0;
    $row['ativo'] = isset($row['ativo']) ? (int)$row['ativo'] : 1;
    $rows[] = $row;
  }

  $conn->close();
  json_ok($rows);
}


if ($action === 'list_user_ia_departamentos') {
  $user_id = as_int($_GET['user_id'] ?? 0);

  if ($user_id <= 0) {
    $conn->close();
    json_err(400, "user_id inválido.");
  }

  $stmtUser = $conn->prepare("
    SELECT id
      FROM usuarios
     WHERE id = ?
     LIMIT 1
  ");
  if (!$stmtUser) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmtUser->bind_param('i', $user_id);
  $stmtUser->execute();
  $userExiste = (bool)$stmtUser->get_result()->fetch_assoc();
  $stmtUser->close();

  if (!$userExiste) {
    $conn->close();
    json_err(404, "Usuário não encontrado.");
  }

  $stmt = $conn->prepare("
    SELECT departamento_id
      FROM usuario_ia_departamentos
     WHERE user_id = ?
     ORDER BY departamento_id ASC
  ");
  if (!$stmt) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmt->bind_param('i', $user_id);
  $stmt->execute();
  $rs = $stmt->get_result();

  $out = [];
  while ($row = $rs->fetch_assoc()) {
    $out[] = (int)$row['departamento_id'];
  }

  $stmt->close();
  $conn->close();
  json_ok($out);
}


if ($action === 'save_user_ia_departamentos') {
  $user_id = as_int($body['user_id'] ?? 0);
  $departamentos = $body['departamentos'] ?? $body['department_ids'] ?? [];

  if ($user_id <= 0 || !is_array($departamentos)) {
    $conn->close();
    json_err(400, "Dados inválidos.");
  }

  $stmtUser = $conn->prepare("
    SELECT id
      FROM usuarios
     WHERE id = ?
     LIMIT 1
  ");
  if (!$stmtUser) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmtUser->bind_param('i', $user_id);
  $stmtUser->execute();
  $userExiste = (bool)$stmtUser->get_result()->fetch_assoc();
  $stmtUser->close();

  if (!$userExiste) {
    $conn->close();
    json_err(404, "Usuário não encontrado.");
  }

  // Normaliza IDs, remove vazios, inválidos e duplicados.
  $normalized = [];
  foreach ($departamentos as $dep) {
    $id = (int)$dep;
    if ($id > 0) $normalized[$id] = true;
  }
  $normalized = array_keys($normalized);

  // Valida os departamentos selecionados.
  if (count($normalized) > 0) {
    $placeholders = implode(',', array_fill(0, count($normalized), '?'));
    $types = str_repeat('i', count($normalized));

    $stmtDeps = $conn->prepare("
      SELECT id
        FROM aurora_kb_departamentos
       WHERE ativo = 1
         AND id IN ($placeholders)
    ");

    if (!$stmtDeps) {
      $conn->close();
      json_err(500, "Erro ao validar departamentos da IA.");
    }

    $stmtDeps->bind_param($types, ...$normalized);
    $stmtDeps->execute();
    $rsDeps = $stmtDeps->get_result();

    $validos = [];
    while ($row = $rsDeps->fetch_assoc()) {
      $validos[(int)$row['id']] = true;
    }
    $stmtDeps->close();

    foreach ($normalized as $id) {
      if (!isset($validos[$id])) {
        $conn->close();
        json_err(400, "Departamento inválido ou inativo: " . $id);
      }
    }
  }

  $conn->begin_transaction();

  try {
    $stmtDel = $conn->prepare("
      DELETE FROM usuario_ia_departamentos
       WHERE user_id = ?
    ");
    if (!$stmtDel) {
      throw new RuntimeException("Erro ao preparar remoção dos departamentos da IA.");
    }

    $stmtDel->bind_param('i', $user_id);
    $stmtDel->execute();
    $stmtDel->close();

    if (count($normalized) > 0) {
      $stmtIns = $conn->prepare("
        INSERT INTO usuario_ia_departamentos (user_id, departamento_id)
        VALUES (?, ?)
      ");
      if (!$stmtIns) {
        throw new RuntimeException("Erro ao preparar gravação dos departamentos da IA.");
      }

      foreach ($normalized as $depId) {
        $depId = (int)$depId;
        $stmtIns->bind_param('ii', $user_id, $depId);
        if (!$stmtIns->execute()) {
          throw new RuntimeException("Erro ao gravar departamento da IA.");
        }
      }

      $stmtIns->close();
    }

    $conn->commit();
  } catch (Throwable $e) {
    $conn->rollback();
    $conn->close();
    json_err(500, "Erro ao salvar departamentos da IA.");
  }

  $conn->close();
  json_ok([
    "sucesso" => true,
    "user_id" => $user_id,
    "departamentos" => array_map('intval', $normalized),
  ]);
}


/* ==================== IA: FERRAMENTAS ======================== */

function ia_ferramentas_disponiveis(): array {
  return [
    [
      "key" => "consultar_atendimentos",
      "label" => "Consultar atendimentos",
      "grupo" => "Atendimentos",
      "tipo" => "consulta"
    ],
    [
      "key" => "detalhar_atendimento",
      "label" => "Detalhar atendimento",
      "grupo" => "Atendimentos",
      "tipo" => "consulta"
    ],
    [
      "key" => "gerenciar_acao_atendimento",
      "label" => "Executar ações em atendimentos",
      "grupo" => "Atendimentos",
      "tipo" => "acao"
    ],
    [
      "key" => "preparar_novo_atendimento",
      "label" => "Criar novo atendimento",
      "grupo" => "Atendimentos",
      "tipo" => "acao"
    ],
    [
      "key" => "preparar_edicao_atendimento",
      "label" => "Editar atendimento",
      "grupo" => "Atendimentos",
      "tipo" => "acao"
    ],
    [
      "key" => "consultar_estoque",
      "label" => "Consultar estoque",
      "grupo" => "Estoque",
      "tipo" => "consulta"
    ],
    [
      "key" => "consultar_produto_estoque",
      "label" => "Consultar produto no estoque",
      "grupo" => "Estoque",
      "tipo" => "consulta"
    ],
    [
      "key" => "consultar_movimentacoes",
      "label" => "Consultar movimentações de estoque",
      "grupo" => "Estoque",
      "tipo" => "consulta"
    ],
    [
      "key" => "preparar_requisicao_material",
      "label" => "Solicitar material",
      "grupo" => "Requisições",
      "tipo" => "acao"
    ],
    [
      "key" => "consultar_requisicoes",
      "label" => "Consultar requisições",
      "grupo" => "Requisições",
      "tipo" => "consulta"
    ],
    [
      "key" => "consultar_coroas",
      "label" => "Consultar coroas de flores",
      "grupo" => "Coroas",
      "tipo" => "consulta"
    ],
    [
      "key" => "consultar_balanco",
      "label" => "Consultar balanço",
      "grupo" => "Financeiro",
      "tipo" => "consulta"
    ],
    [
      "key" => "consultar_modulo_pai",
      "label" => "Consultar módulos do PAI",
      "grupo" => "Módulos",
      "tipo" => "consulta"
    ],
    [
      "key" => "preparar_acao_modulo",
      "label" => "Executar ações em módulos do PAI",
      "grupo" => "Módulos",
      "tipo" => "acao"
    ],
  ];
}


if ($action === 'list_ia_ferramentas') {
  $conn->close();
  json_ok(ia_ferramentas_disponiveis());
}


if ($action === 'list_user_ia_ferramentas') {
  $user_id = as_int($_GET['user_id'] ?? 0);

  if ($user_id <= 0) {
    $conn->close();
    json_err(400, "user_id inválido.");
  }

  $stmtUser = $conn->prepare("
    SELECT id
      FROM usuarios
     WHERE id = ?
     LIMIT 1
  ");
  if (!$stmtUser) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmtUser->bind_param('i', $user_id);
  $stmtUser->execute();
  $userExiste = (bool)$stmtUser->get_result()->fetch_assoc();
  $stmtUser->close();

  if (!$userExiste) {
    $conn->close();
    json_err(404, "Usuário não encontrado.");
  }

  $stmt = $conn->prepare("
    SELECT ferramenta
      FROM usuario_ia_ferramentas
     WHERE user_id = ?
     ORDER BY ferramenta ASC
  ");
  if (!$stmt) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmt->bind_param('i', $user_id);
  $stmt->execute();
  $rs = $stmt->get_result();

  $out = [];
  while ($row = $rs->fetch_assoc()) {
    $ferramenta = s($row['ferramenta'] ?? '');
    if ($ferramenta !== '') $out[] = $ferramenta;
  }

  $stmt->close();
  $conn->close();
  json_ok($out);
}


if ($action === 'save_user_ia_ferramentas') {
  $user_id = as_int($body['user_id'] ?? 0);
  $ferramentas = $body['ferramentas'] ?? $body['tools'] ?? [];

  if ($user_id <= 0 || !is_array($ferramentas)) {
    $conn->close();
    json_err(400, "Dados inválidos.");
  }

  $stmtUser = $conn->prepare("
    SELECT id
      FROM usuarios
     WHERE id = ?
     LIMIT 1
  ");
  if (!$stmtUser) {
    $conn->close();
    json_err(500, "Erro ao preparar operação.");
  }

  $stmtUser->bind_param('i', $user_id);
  $stmtUser->execute();
  $userExiste = (bool)$stmtUser->get_result()->fetch_assoc();
  $stmtUser->close();

  if (!$userExiste) {
    $conn->close();
    json_err(404, "Usuário não encontrado.");
  }

  $catalogo = ia_ferramentas_disponiveis();
  $allowedMap = [];
  foreach ($catalogo as $item) {
    $key = s($item['key'] ?? '');
    if ($key !== '') $allowedMap[$key] = true;
  }

  $normalized = [];
  foreach ($ferramentas as $tool) {
    $tool = s($tool);
    if ($tool === '') continue;

    if (!isset($allowedMap[$tool])) {
      $conn->close();
      json_err(400, "Ferramenta inválida: " . $tool);
    }

    $normalized[$tool] = true;
  }
  $normalized = array_keys($normalized);

  $conn->begin_transaction();

  try {
    $stmtDel = $conn->prepare("
      DELETE FROM usuario_ia_ferramentas
       WHERE user_id = ?
    ");
    if (!$stmtDel) {
      throw new RuntimeException("Erro ao preparar remoção das ferramentas da IA.");
    }

    $stmtDel->bind_param('i', $user_id);
    $stmtDel->execute();
    $stmtDel->close();

    if (count($normalized) > 0) {
      $stmtIns = $conn->prepare("
        INSERT INTO usuario_ia_ferramentas (user_id, ferramenta)
        VALUES (?, ?)
      ");
      if (!$stmtIns) {
        throw new RuntimeException("Erro ao preparar gravação das ferramentas da IA.");
      }

      foreach ($normalized as $tool) {
        $stmtIns->bind_param('is', $user_id, $tool);
        if (!$stmtIns->execute()) {
          throw new RuntimeException("Erro ao gravar ferramenta da IA.");
        }
      }

      $stmtIns->close();
    }

    $conn->commit();
  } catch (Throwable $e) {
    $conn->rollback();
    $conn->close();
    json_err(500, "Erro ao salvar ferramentas da IA.");
  }

  $conn->close();
  json_ok([
    "sucesso" => true,
    "user_id" => $user_id,
    "ferramentas" => $normalized,
  ]);
}



/* ======================== PERMISSIONS ======================== */
if ($action === 'list_permissions') {
  $user_id = as_int($_GET['user_id'] ?? 0);
  if ($user_id <= 0) { $conn->close(); json_err(400, "user_id inválido."); }
  // 27/10/2026 (grupos): devolve as páginas que o usuário pode usar = páginas do grupo (cargo ativo) + extras.
  // A tela Permissões pede só as extras com &somente_extras=1.
  $somenteExtras = (string)($_GET['somente_extras'] ?? '') === '1';
  $stmt = $conn->prepare($somenteExtras
    ? "SELECT pagina FROM permissoes WHERE user_id = ?"
    : "SELECT pagina FROM permissoes WHERE user_id = ?
       UNION
       SELECT cp.pagina FROM usuarios u
         INNER JOIN cargos c ON c.slug = u.cargo AND c.ativo = 1
         INNER JOIN cargo_paginas cp ON cp.cargo_id = c.id
        WHERE u.id = ?");
  if (!$stmt) { $conn->close(); json_err(500, "Erro ao preparar operação."); }
  if ($somenteExtras) { $stmt->bind_param('i', $user_id); } else { $stmt->bind_param('ii', $user_id, $user_id); }
  $stmt->execute(); $rs = $stmt->get_result();
  $out = []; while ($row = $rs->fetch_assoc()) $out[] = $row['pagina'];
  $stmt->close(); $conn->close(); json_ok($out);
}

if ($action === 'save_permissions') {
  $user_id = as_int($body['user_id'] ?? 0);
  $permissions = $body['permissions'] ?? [];
  if ($user_id <= 0 || !is_array($permissions)) { $conn->close(); json_err(400, "Dados inválidos."); }

  $stmtDel = $conn->prepare("DELETE FROM permissoes WHERE user_id = ?");
  if (!$stmtDel) { $conn->close(); json_err(500, "Erro ao preparar operação."); }
  $stmtDel->bind_param('i', $user_id); $stmtDel->execute(); $stmtDel->close();

  if (count($permissions) > 0) {
    $stmtIns = $conn->prepare("INSERT INTO permissoes (user_id, pagina) VALUES (?, ?)");
    if (!$stmtIns) { $conn->close(); json_err(500, "Erro ao preparar operação."); }
    foreach ($permissions as $pg) {
      $p = s($pg); if ($p === '') continue;
      $stmtIns->bind_param('is', $user_id, $p); $stmtIns->execute();
    }
    $stmtIns->close();
  }

  $conn->close(); json_ok(["sucesso" => true]);
}

/* ======================= DEFAULT ============================= */
$conn->close(); json_err(400, "Ação inválida.");
