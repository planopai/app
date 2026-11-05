<?php
/**
 * rh_colaboradores.php — colaboradores e usuários numa tela só (/usuarios).                05/11/2026
 *
 * MODELO (decidido pelo usuário em 05/11/2026):
 *   - rh_colaborador: cadastro da pessoa como colaborador (função, CBO, admissão, salário, vínculo, situação,
 *     dados de pagamento, desligamento). Tabela nova.
 *   - rh_colaborador_historico: linha do tempo (admissão, função, salário, férias, afastamento, retorno,
 *     desligamento, observação), com antes, depois e quem lançou. Tabela nova.
 *   - usuarios (já existe): login, senha protegida, grupo de acesso (usuarios.cargo = cargos.slug) e ativo (coluna nova).
 *   - Ligação: rh_colaborador.usuario_id → usuarios.id (login é opcional; também existe acesso sem colaborador).
 *   - Desligar o colaborador bloqueia o login (usuarios.ativo = 0). Usuário não é excluído: é inativado.
 *   - Permissões extras continuam na tela Permissões (grupos.php); aqui só se escolhe o grupo.
 *
 * ACESSO: só Gestão (cargo 'adm' ou página 'gestao'), igual ao create_user/update_user do pai_api.php.
 *
 * TRAVAS:
 *   - Login único, sem espaço e sem acento; senha com no mínimo 6 caracteres, gravada com password_hash.
 *   - Ninguém bloqueia o próprio acesso nem desliga a si mesmo.
 *   - Sempre sobra pelo menos um usuário ativo com Gestão.
 *   - O grupo escolhido precisa existir e estar ativo na tabela cargos.
 *
 * AÇÕES (https://api.planoassistencialintegrado.com.br/rh_colaboradores.php?action=...):
 *   GET  painel                → { pessoas[], grupos[], eu{} }
 *   GET  ficha&id=N            → { colaborador{}, historico[] }          (id do colaborador)
 *   POST salvar                { colaborador{...}, acesso{...}? }        (sem colaborador.id cria)
 *   POST acesso_salvar         { usuario_id?, nome, login, senha?, grupo } (acesso sem colaborador)
 *   POST desligar              { id, data, tipo, motivo }
 *   POST reativar              { id }
 *   POST acesso_ativo          { usuario_id, ativo }
 *   POST historico_incluir     { id, data, tipo, descricao }
 *
 * Resposta: { erro: bool, msg, dados }. Sem login: 401 com need_login. Sem permissão: 403.
 * Não cria tabela nem coluna (o SQL é rodado à parte, aprovado pela Gestão).
 */

header('Content-Type: application/json; charset=utf-8');

$allowedOrigins = [
    'https://app.planoassistencialintegrado.com.br',
    'https://pai.planoassistencialintegrado.com.br',
    'https://planoassistencialintegrado.com.br',
    'https://club.planoassistencialintegrado.com.br',
    'https://www.planoassistencialintegrado.com.br',
];
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header_remove('Access-Control-Allow-Origin');
    header_remove('Access-Control-Allow-Credentials');
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization, Cache-Control, Pragma, Expires');
    header('Access-Control-Max-Age: 86400');
    header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    if ($origin === '' || !in_array($origin, $allowedOrigins, true)) { http_response_code(403); exit; }
    http_response_code(204); exit;
}
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

function rhResp(bool $erro, string $msg, $dados = null, int $status = 200, array $extra = []): void
{
    http_response_code($status);
    echo json_encode(array_merge(['erro' => $erro, 'msg' => $msg, 'dados' => $dados], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

register_shutdown_function(function () {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('[rh_colaboradores] fatal: ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['erro' => true, 'msg' => 'Erro interno no servidor.'], JSON_UNESCAPED_UNICODE);
    }
});

// Depende do pai_sessao.php (login assinado). Sem ele, não libera nada.
if (!is_file('/home2/pla48587/pai_sessao.php')) {
    error_log('[rh_colaboradores] pai_sessao.php ausente: acesso bloqueado');
    rhResp(true, 'Sistema em manutenção. Tente novamente em alguns minutos.', null, 503);
}
include_once '/home2/pla48587/pai_sessao.php';
if (!function_exists('paiProtecaoUsuario')) {
    rhResp(true, 'Sistema em manutenção. Tente novamente em alguns minutos.', null, 503);
}

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($metodo === 'POST' && $origin !== '' && !in_array($origin, $allowedOrigins, true)) {
    rhResp(true, 'Origem não autorizada.', null, 403);
}

/* ---------------------------------------------------------------------
 * Banco (pai-chaves.php)
 * ------------------------------------------------------------------- */
function rhPdo(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $cfg = function_exists('paiSessaoConfig') ? paiSessaoConfig() : [];
    if (!$cfg) {
        rhResp(true, 'Configuração do servidor indisponível.', null, 500);
    }
    $pdo = new PDO(
        'mysql:host=' . trim((string) ($cfg['db_host'] ?? 'localhost')) . ';dbname=' . trim((string) ($cfg['db_name'] ?? '')) . ';charset=utf8mb4',
        trim((string) ($cfg['db_user'] ?? '')),
        (string) ($cfg['db_password'] ?? $cfg['db_pass'] ?? ''),
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    $pdo->exec("SET time_zone = '-03:00'"); // horário de Barreiras
    return $pdo;
}

/* ---------------------------------------------------------------------
 * Quem está chamando: só Gestão
 * ------------------------------------------------------------------- */
$eu = paiProtecaoUsuario();
if ($eu === null) {
    rhResp(true, 'Sessão expirada. Faça login novamente.', null, 401, ['need_login' => 1]);
}
$euId = (int) ($eu['id'] ?? 0);
$euNome = (string) ($eu['nome'] ?? $eu['usuario'] ?? ('usuario ' . $euId));
$euGestao = strtolower(trim((string) ($eu['cargo'] ?? ''))) === 'adm' || in_array('gestao', (array) ($eu['paginas'] ?? []), true);
if (!$euGestao) {
    rhResp(true, 'Só a Gestão acessa colaboradores e usuários.', null, 403);
}

/* ---------------------------------------------------------------------
 * Utilidades
 * ------------------------------------------------------------------- */
$SITUACOES = ['ATIVO', 'FERIAS', 'AFASTADO', 'DESLIGADO'];
$VINCULOS = ['CLT', 'PRESTADOR', 'ESTAGIO'];
$TIPOS_HIST = ['ADMISSAO', 'FUNCAO', 'SALARIO', 'FERIAS', 'AFASTAMENTO', 'RETORNO', 'DESLIGAMENTO', 'OBSERVACAO'];
$TIPOS_DESLIG = ['Pedido de demissão', 'Dispensa sem justa causa', 'Dispensa com justa causa', 'Acordo entre as partes', 'Fim de contrato', 'Outro'];

function rhCorpo(): array
{
    $raw = file_get_contents('php://input');
    $j = json_decode((string) $raw, true);
    return is_array($j) ? $j : ($_POST ?: []);
}

function rhTxt($v, int $max = 255): ?string
{
    $s = trim(preg_replace('/\s+/u', ' ', (string) ($v ?? '')));
    if ($s === '') {
        return null;
    }
    return mb_substr($s, 0, $max);
}

function rhData($v): ?string
{
    $s = trim((string) ($v ?? ''));
    if ($s === '') {
        return null;
    }
    $d = DateTime::createFromFormat('Y-m-d', $s);
    if (!$d || $d->format('Y-m-d') !== $s) {
        rhResp(true, 'Data inválida: ' . $s, null, 400);
    }
    return $s;
}

function rhValor($v): ?string
{
    if ($v === null || $v === '') {
        return null;
    }
    $s = str_replace(['R$', ' '], '', (string) $v);
    if (strpos($s, ',') !== false) {
        $s = str_replace(['.', ','], ['', '.'], $s);
    }
    if (!is_numeric($s) || (float) $s < 0) {
        rhResp(true, 'Valor inválido.', null, 400);
    }
    return number_format((float) $s, 2, '.', '');
}

function rhSoDigitos($v): ?string
{
    $s = preg_replace('/\D/', '', (string) ($v ?? ''));
    return $s === '' ? null : $s;
}

function rhLogin($v): string
{
    $s = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', (string) $v);
    $s = strtolower((string) $s);
    return preg_replace('/[^a-z0-9._-]/', '', $s);
}

function rhCpfValido(string $cpf): bool
{
    if (strlen($cpf) !== 11 || preg_match('/^(\d)\1{10}$/', $cpf)) {
        return false;
    }
    for ($t = 9; $t < 11; $t++) {
        $s = 0;
        for ($i = 0; $i < $t; $i++) {
            $s += (int) $cpf[$i] * (($t + 1) - $i);
        }
        $d = ((10 * $s) % 11) % 10;
        if ((int) $cpf[$t] !== $d) {
            return false;
        }
    }
    return true;
}

function rhGrupoAtivo(PDO $pdo, string $slug): bool
{
    $st = $pdo->prepare('SELECT 1 FROM cargos WHERE slug = ? AND ativo = 1 LIMIT 1');
    $st->execute([$slug]);
    return (bool) $st->fetchColumn();
}

/** Usuários ativos que têm Gestão (grupo adm, página gestao no grupo ou como extra). */
function rhIdsGestaoAtivos(PDO $pdo): array
{
    $sql = "SELECT u.id
              FROM usuarios u
             WHERE COALESCE(u.ativo, 1) = 1
               AND (LOWER(u.cargo) = 'adm'
                    OR EXISTS (SELECT 1 FROM cargos c JOIN cargo_paginas cp ON cp.cargo_id = c.id
                                WHERE c.slug = u.cargo AND c.ativo = 1 AND cp.pagina = 'gestao')
                    OR EXISTS (SELECT 1 FROM permissoes p WHERE p.user_id = u.id AND p.pagina = 'gestao'))";
    return array_map('intval', $pdo->query($sql)->fetchAll(PDO::FETCH_COLUMN));
}

/** Confere se bloquear este usuário deixaria o sistema sem ninguém da Gestão. */
function rhTravaUltimaGestao(PDO $pdo, int $usuarioId): void
{
    $ids = rhIdsGestaoAtivos($pdo);
    if (in_array($usuarioId, $ids, true) && count($ids) <= 1) {
        rhResp(true, 'Esta é a última pessoa ativa com Gestão. Dê Gestão a outra pessoa antes.', null, 409);
    }
}

function rhHistorico(PDO $pdo, int $colabId, string $data, string $tipo, ?string $descricao, ?string $antes = null, ?string $depois = null): void
{
    global $euNome;
    $pdo->prepare('INSERT INTO rh_colaborador_historico (colaborador_id, data_evento, tipo, descricao, valor_anterior, valor_novo, criado_por)
                   VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([$colabId, $data, $tipo, $descricao, $antes, $depois, mb_substr($euNome, 0, 60)]);
}

function rhBrl(?string $v): ?string
{
    return $v === null ? null : 'R$ ' . number_format((float) $v, 2, ',', '.');
}

/**
 * Cria ou altera o login. Devolve o id do usuário (ou null se nada foi pedido).
 * $acesso: { usuario_id?, login, senha?, grupo }
 */
function rhSalvarAcesso(PDO $pdo, array $acesso, string $nome, bool $bloquear): ?int
{
    global $euId;
    $uid = (int) ($acesso['usuario_id'] ?? 0);
    $login = rhLogin($acesso['login'] ?? '');
    $senha = (string) ($acesso['senha'] ?? '');
    $grupo = strtolower(trim((string) ($acesso['grupo'] ?? '')));

    if ($login === '') {
        rhResp(true, 'Preencha o login.', null, 400);
    }
    if ($grupo !== '' && !rhGrupoAtivo($pdo, $grupo)) {
        rhResp(true, 'Grupo de acesso inválido ou inativo.', null, 400);
    }
    $st = $pdo->prepare('SELECT id FROM usuarios WHERE usuario = ? AND id <> ? LIMIT 1');
    $st->execute([$login, $uid]);
    if ($st->fetchColumn()) {
        rhResp(true, "Já existe um usuário com o login \"{$login}\".", null, 409);
    }

    if ($uid <= 0) {
        if (strlen(trim($senha)) < 6) {
            rhResp(true, 'A senha precisa ter pelo menos 6 caracteres.', null, 400);
        }
        $pdo->prepare('INSERT INTO usuarios (nome, usuario, senha, cargo, ativo) VALUES (?, ?, ?, ?, ?)')
            ->execute([$nome, $login, password_hash(trim($senha), PASSWORD_DEFAULT), $grupo, $bloquear ? 0 : 1]);
        return (int) $pdo->lastInsertId();
    }

    $st = $pdo->prepare('SELECT id, cargo FROM usuarios WHERE id = ? LIMIT 1');
    $st->execute([$uid]);
    $atual = $st->fetch();
    if (!$atual) {
        rhResp(true, 'Usuário não encontrado.', null, 404);
    }
    // Trocar o próprio grupo pode tirar a própria Gestão: outra pessoa da Gestão faz isso.
    if ($uid === $euId && $grupo !== strtolower((string) $atual['cargo'])) {
        rhResp(true, 'Você não pode trocar o seu próprio grupo de acesso. Peça a outra pessoa da Gestão.', null, 409);
    }
    if ($senha !== '' && strlen(trim($senha)) < 6) {
        rhResp(true, 'A nova senha precisa ter pelo menos 6 caracteres.', null, 400);
    }
    if ($senha !== '') {
        $pdo->prepare('UPDATE usuarios SET nome = ?, usuario = ?, senha = ?, cargo = ? WHERE id = ?')
            ->execute([$nome, $login, password_hash(trim($senha), PASSWORD_DEFAULT), $grupo, $uid]);
    } else {
        $pdo->prepare('UPDATE usuarios SET nome = ?, usuario = ?, cargo = ? WHERE id = ?')
            ->execute([$nome, $login, $grupo, $uid]);
    }
    if ($grupo !== strtolower((string) $atual['cargo'])) {
        // Se a troca tirou a última Gestão ativa, a gravação não vale (a transação não é confirmada).
        if (count(rhIdsGestaoAtivos($pdo)) === 0) {
            rhResp(true, 'Esta é a última pessoa ativa com Gestão. Dê Gestão a outra pessoa antes.', null, 409);
        }
    }
    return $uid;
}

/* ---------------------------------------------------------------------
 * Ações
 * ------------------------------------------------------------------- */
$action = (string) ($_GET['action'] ?? '');

try {
    $pdo = rhPdo();

    /* ---------- painel: todo mundo numa lista ---------- */
    if ($action === 'painel' && $metodo === 'GET') {
        $colabs = $pdo->query("
            SELECT c.id AS colaborador_id, c.nome, c.cargo AS funcao, c.vinculo, c.situacao, c.data_admissao,
                   c.data_desligamento, c.codigo_dominio,
                   u.id AS usuario_id, u.usuario AS login, u.cargo AS grupo, COALESCE(u.ativo, 1) AS acesso_ativo
              FROM rh_colaborador c
              LEFT JOIN usuarios u ON u.id = c.usuario_id
        ")->fetchAll();
        $soAcesso = $pdo->query("
            SELECT NULL AS colaborador_id, u.nome, NULL AS funcao, NULL AS vinculo, NULL AS situacao, NULL AS data_admissao,
                   NULL AS data_desligamento, NULL AS codigo_dominio,
                   u.id AS usuario_id, u.usuario AS login, u.cargo AS grupo, COALESCE(u.ativo, 1) AS acesso_ativo
              FROM usuarios u
             WHERE NOT EXISTS (SELECT 1 FROM rh_colaborador c WHERE c.usuario_id = u.id)
        ")->fetchAll();
        $pessoas = array_map(function ($p) {
            foreach (['colaborador_id', 'usuario_id', 'acesso_ativo'] as $k) {
                $p[$k] = $p[$k] === null ? null : (int) $p[$k];
            }
            return $p;
        }, array_merge($colabs, $soAcesso));
        usort($pessoas, fn($a, $b) => strcoll(mb_strtolower($a['nome']), mb_strtolower($b['nome'])));

        $grupos = $pdo->query('SELECT id, nome, slug, descricao FROM cargos WHERE ativo = 1 ORDER BY nome')->fetchAll();
        rhResp(false, 'ok', [
            'pessoas' => $pessoas,
            'grupos' => $grupos,
            'eu' => ['id' => $euId],
            'tipos_desligamento' => $TIPOS_DESLIG,
        ]);
    }

    /* ---------- ficha de um colaborador ---------- */
    if ($action === 'ficha' && $metodo === 'GET') {
        $id = (int) ($_GET['id'] ?? 0);
        $st = $pdo->prepare("
            SELECT c.*, u.usuario AS login, u.cargo AS grupo, COALESCE(u.ativo, 1) AS acesso_ativo
              FROM rh_colaborador c
              LEFT JOIN usuarios u ON u.id = c.usuario_id
             WHERE c.id = ? LIMIT 1");
        $st->execute([$id]);
        $c = $st->fetch();
        if (!$c) {
            rhResp(true, 'Colaborador não encontrado.', null, 404);
        }
        $st = $pdo->prepare('SELECT id, data_evento, tipo, descricao, valor_anterior, valor_novo, criado_em, criado_por
                               FROM rh_colaborador_historico WHERE colaborador_id = ?
                              ORDER BY data_evento DESC, id DESC');
        $st->execute([$id]);
        rhResp(false, 'ok', ['colaborador' => $c, 'historico' => $st->fetchAll()]);
    }

    if ($metodo !== 'POST') {
        rhResp(true, 'Ação inválida.', null, 400);
    }
    $b = rhCorpo();

    /* ---------- salvar colaborador (+ acesso opcional) ---------- */
    if ($action === 'salvar') {
        $c = (array) ($b['colaborador'] ?? []);
        $id = (int) ($c['id'] ?? 0);
        $nome = rhTxt($c['nome'] ?? '', 150);
        if (!$nome) {
            rhResp(true, 'Preencha o nome.', null, 400);
        }
        $cpf = rhSoDigitos($c['cpf'] ?? null);
        if ($cpf !== null && !rhCpfValido($cpf)) {
            rhResp(true, 'CPF inválido.', null, 400);
        }
        $vinculo = strtoupper((string) ($c['vinculo'] ?? 'CLT'));
        if (!in_array($vinculo, $VINCULOS, true)) {
            $vinculo = 'CLT';
        }
        $situacao = strtoupper((string) ($c['situacao'] ?? 'ATIVO'));
        if (!in_array($situacao, ['ATIVO', 'FERIAS', 'AFASTADO'], true)) {
            $situacao = 'ATIVO'; // DESLIGADO só pela ação desligar
        }
        $dados = [
            'codigo_dominio' => rhTxt($c['codigo_dominio'] ?? null, 10),
            'nome' => $nome,
            'cpf' => $cpf,
            'cargo' => rhTxt($c['funcao'] ?? null, 80),
            'cbo' => rhTxt($c['cbo'] ?? null, 10),
            'departamento' => rhTxt($c['departamento'] ?? null, 20),
            'filial' => rhTxt($c['filial'] ?? null, 20),
            'vinculo' => $vinculo,
            'data_admissao' => rhData($c['data_admissao'] ?? null),
            'salario_base' => rhValor($c['salario_base'] ?? null),
            'telefone' => rhSoDigitos($c['telefone'] ?? null),
            'email' => rhTxt($c['email'] ?? null, 120),
            'pix_tipo' => rhTxt($c['pix_tipo'] ?? null, 20),
            'pix_chave' => rhTxt($c['pix_chave'] ?? null, 120),
            'banco' => rhTxt($c['banco'] ?? null, 10),
            'agencia' => rhTxt($c['agencia'] ?? null, 10),
            'conta' => rhTxt($c['conta'] ?? null, 20),
            'observacao' => rhTxt($c['observacao'] ?? null, 2000),
        ];
        if ($dados['codigo_dominio'] !== null) {
            $st = $pdo->prepare('SELECT id FROM rh_colaborador WHERE codigo_dominio = ? AND id <> ? LIMIT 1');
            $st->execute([$dados['codigo_dominio'], $id]);
            if ($st->fetchColumn()) {
                rhResp(true, 'Já existe colaborador com este código do Domínio.', null, 409);
            }
        }

        $pdo->beginTransaction();
        $hoje = date('Y-m-d');
        if ($id <= 0) {
            $cols = array_keys($dados);
            $sql = 'INSERT INTO rh_colaborador (' . implode(', ', $cols) . ', situacao, criado_por) VALUES ('
                . implode(', ', array_fill(0, count($cols), '?')) . ', ?, ?)';
            $pdo->prepare($sql)->execute(array_merge(array_values($dados), [$situacao, mb_substr($euNome, 0, 60)]));
            $id = (int) $pdo->lastInsertId();
            rhHistorico($pdo, $id, $dados['data_admissao'] ?? $hoje, 'ADMISSAO', 'Cadastro do colaborador', null, $dados['cargo']);
        } else {
            $st = $pdo->prepare('SELECT * FROM rh_colaborador WHERE id = ? FOR UPDATE');
            $st->execute([$id]);
            $antes = $st->fetch();
            if (!$antes) {
                $pdo->rollBack();
                rhResp(true, 'Colaborador não encontrado.', null, 404);
            }
            if ($antes['situacao'] === 'DESLIGADO') {
                $situacao = 'DESLIGADO';
            }
            $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($dados)));
            $pdo->prepare("UPDATE rh_colaborador SET $sets, situacao = ?, atualizado_por = ? WHERE id = ?")
                ->execute(array_merge(array_values($dados), [$situacao, mb_substr($euNome, 0, 60), $id]));

            if ((string) $antes['cargo'] !== (string) $dados['cargo']) {
                rhHistorico($pdo, $id, $hoje, 'FUNCAO', 'Mudança de função', $antes['cargo'], $dados['cargo']);
            }
            if ((string) $antes['salario_base'] !== (string) $dados['salario_base'] && !($antes['salario_base'] === null && $dados['salario_base'] === null)) {
                if ($antes['salario_base'] === null || $dados['salario_base'] === null || abs((float) $antes['salario_base'] - (float) $dados['salario_base']) >= 0.01) {
                    rhHistorico($pdo, $id, $hoje, 'SALARIO', 'Mudança de salário base', rhBrl($antes['salario_base']), rhBrl($dados['salario_base']));
                }
            }
            if ($antes['situacao'] !== $situacao) {
                $tipo = $situacao === 'FERIAS' ? 'FERIAS' : ($situacao === 'AFASTADO' ? 'AFASTAMENTO' : 'RETORNO');
                rhHistorico($pdo, $id, $hoje, $tipo, 'Situação alterada', $antes['situacao'], $situacao);
            }
        }

        // Acesso ao app (opcional)
        if (!empty($b['acesso']) && is_array($b['acesso'])) {
            $st = $pdo->prepare('SELECT usuario_id, situacao FROM rh_colaborador WHERE id = ?');
            $st->execute([$id]);
            $atual = $st->fetch();
            $acesso = (array) $b['acesso'];
            if ((int) ($acesso['usuario_id'] ?? 0) <= 0 && $atual['usuario_id']) {
                $acesso['usuario_id'] = (int) $atual['usuario_id'];
            }
            // Ligar a um login que já existe, sem criar outro.
            $vincular = (int) ($acesso['vincular_usuario_id'] ?? 0);
            if ($vincular > 0 && (int) ($acesso['usuario_id'] ?? 0) <= 0) {
                $st = $pdo->prepare('SELECT id FROM rh_colaborador WHERE usuario_id = ? AND id <> ? LIMIT 1');
                $st->execute([$vincular, $id]);
                if ($st->fetchColumn()) {
                    $pdo->rollBack();
                    rhResp(true, 'Este login já está ligado a outro colaborador.', null, 409);
                }
                $acesso['usuario_id'] = $vincular;
            }
            $uid = rhSalvarAcesso($pdo, $acesso, $nome, $atual['situacao'] === 'DESLIGADO');
            if ($uid && (int) $atual['usuario_id'] !== $uid) {
                $pdo->prepare('UPDATE rh_colaborador SET usuario_id = ? WHERE id = ?')->execute([$uid, $id]);
                rhHistorico($pdo, $id, $hoje, 'OBSERVACAO', 'Acesso ao app criado ou ligado', null, rhLogin($acesso['login'] ?? ''));
            }
        }

        $pdo->commit();
        rhResp(false, 'Salvo.', ['id' => $id]);
    }

    /* ---------- acesso sem colaborador (sócios, prestadores) ---------- */
    if ($action === 'acesso_salvar') {
        $nome = rhTxt($b['nome'] ?? '', 150);
        if (!$nome) {
            rhResp(true, 'Preencha o nome.', null, 400);
        }
        $pdo->beginTransaction();
        $uid = rhSalvarAcesso($pdo, $b, $nome, false);
        $pdo->commit();
        rhResp(false, 'Salvo.', ['usuario_id' => $uid]);
    }

    /* ---------- desligar ---------- */
    if ($action === 'desligar') {
        $id = (int) ($b['id'] ?? 0);
        $data = rhData($b['data'] ?? '') ?? rhResp(true, 'Informe a data do desligamento.', null, 400);
        $tipo = rhTxt($b['tipo'] ?? '', 40);
        $motivo = rhTxt($b['motivo'] ?? '', 255);
        if (!$tipo || !$motivo) {
            rhResp(true, 'Informe o tipo e o motivo do desligamento.', null, 400);
        }
        $st = $pdo->prepare('SELECT id, nome, situacao, usuario_id FROM rh_colaborador WHERE id = ?');
        $st->execute([$id]);
        $c = $st->fetch();
        if (!$c) {
            rhResp(true, 'Colaborador não encontrado.', null, 404);
        }
        if ($c['situacao'] === 'DESLIGADO') {
            rhResp(true, 'Este colaborador já está desligado.', null, 409);
        }
        if ((int) $c['usuario_id'] === $euId) {
            rhResp(true, 'Você não pode desligar a si mesmo.', null, 409);
        }
        $pdo->beginTransaction();
        if ($c['usuario_id']) {
            rhTravaUltimaGestao($pdo, (int) $c['usuario_id']);
            $pdo->prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?')->execute([(int) $c['usuario_id']]);
        }
        $pdo->prepare("UPDATE rh_colaborador SET situacao = 'DESLIGADO', data_desligamento = ?, tipo_desligamento = ?,
                              motivo_desligamento = ?, atualizado_por = ? WHERE id = ?")
            ->execute([$data, $tipo, $motivo, mb_substr($euNome, 0, 60), $id]);
        rhHistorico($pdo, $id, $data, 'DESLIGAMENTO', $tipo . ' — ' . $motivo, $c['situacao'], 'DESLIGADO');
        $pdo->commit();
        rhResp(false, 'Colaborador desligado. O acesso ao app foi bloqueado.');
    }

    /* ---------- reativar (recontratação ou desligamento lançado por engano) ---------- */
    if ($action === 'reativar') {
        $id = (int) ($b['id'] ?? 0);
        $st = $pdo->prepare('SELECT situacao FROM rh_colaborador WHERE id = ?');
        $st->execute([$id]);
        $sit = $st->fetchColumn();
        if ($sit === false) {
            rhResp(true, 'Colaborador não encontrado.', null, 404);
        }
        if ($sit !== 'DESLIGADO') {
            rhResp(true, 'O colaborador não está desligado.', null, 409);
        }
        $pdo->beginTransaction();
        $pdo->prepare("UPDATE rh_colaborador SET situacao = 'ATIVO', data_desligamento = NULL, tipo_desligamento = NULL,
                              motivo_desligamento = NULL, atualizado_por = ? WHERE id = ?")
            ->execute([mb_substr($euNome, 0, 60), $id]);
        rhHistorico($pdo, $id, date('Y-m-d'), 'RETORNO', 'Colaborador reativado (o acesso ao app continua bloqueado até ser liberado)', 'DESLIGADO', 'ATIVO');
        $pdo->commit();
        rhResp(false, 'Colaborador reativado. Libere o acesso ao app, se ele usar.');
    }

    /* ---------- bloquear ou liberar o login ---------- */
    if ($action === 'acesso_ativo') {
        $uid = (int) ($b['usuario_id'] ?? 0);
        $ativo = !empty($b['ativo']) ? 1 : 0;
        if ($uid <= 0) {
            rhResp(true, 'Usuário inválido.', null, 400);
        }
        if ($uid === $euId && $ativo === 0) {
            rhResp(true, 'Você não pode bloquear o seu próprio acesso.', null, 409);
        }
        if ($ativo === 1) {
            $st = $pdo->prepare("SELECT 1 FROM rh_colaborador WHERE usuario_id = ? AND situacao = 'DESLIGADO' LIMIT 1");
            $st->execute([$uid]);
            if ($st->fetchColumn()) {
                rhResp(true, 'O colaborador está desligado. Reative o colaborador antes de liberar o acesso.', null, 409);
            }
        } else {
            rhTravaUltimaGestao($pdo, $uid);
        }
        $pdo->prepare('UPDATE usuarios SET ativo = ? WHERE id = ?')->execute([$ativo, $uid]);
        $st = $pdo->prepare('SELECT id FROM rh_colaborador WHERE usuario_id = ? LIMIT 1');
        $st->execute([$uid]);
        if ($cid = $st->fetchColumn()) {
            rhHistorico($pdo, (int) $cid, date('Y-m-d'), 'OBSERVACAO', $ativo ? 'Acesso ao app liberado' : 'Acesso ao app bloqueado');
        }
        rhResp(false, $ativo ? 'Acesso liberado.' : 'Acesso bloqueado.');
    }

    /* ---------- lançamento livre no histórico ---------- */
    if ($action === 'historico_incluir') {
        $id = (int) ($b['id'] ?? 0);
        $tipo = strtoupper((string) ($b['tipo'] ?? 'OBSERVACAO'));
        if (!in_array($tipo, ['FERIAS', 'AFASTAMENTO', 'RETORNO', 'OBSERVACAO'], true)) {
            rhResp(true, 'Tipo de lançamento inválido.', null, 400);
        }
        $data = rhData($b['data'] ?? '') ?? date('Y-m-d');
        $desc = rhTxt($b['descricao'] ?? '', 255);
        if (!$desc) {
            rhResp(true, 'Descreva o lançamento.', null, 400);
        }
        $st = $pdo->prepare('SELECT 1 FROM rh_colaborador WHERE id = ?');
        $st->execute([$id]);
        if (!$st->fetchColumn()) {
            rhResp(true, 'Colaborador não encontrado.', null, 404);
        }
        rhHistorico($pdo, $id, $data, $tipo, $desc);
        rhResp(false, 'Lançado no histórico.');
    }

    rhResp(true, 'Ação inválida.', null, 400);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[rh_colaboradores] ' . $e->getMessage());
    rhResp(true, 'Não foi possível concluir. Tente de novo.', null, 500);
}
