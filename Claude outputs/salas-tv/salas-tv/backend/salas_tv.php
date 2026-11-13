<?php
declare(strict_types=1);
// 23/10/2026 (segurança): confere o login assinado (cookie pai_session) antes de usar os cookies pai_*. Ver /home2/pla48587/pai_sessao.php
if (is_file('/home2/pla48587/pai_sessao.php')) { include_once '/home2/pla48587/pai_sessao.php'; } elseif (PHP_SAPI !== 'cli') { $paiChavesSemSessao = @include '/home2/pla48587/pai-chaves.php'; if (is_array($paiChavesSemSessao) && strtolower(trim((string) ($paiChavesSemSessao['pai_sessao_modo'] ?? ''))) === 'exigir') { error_log('[PAI] pai_sessao.php ausente com pai_sessao_modo=exigir: acesso bloqueado em ' . basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''))); if (!headers_sent()) { http_response_code(503); header('Content-Type: application/json; charset=utf-8'); header('Retry-After: 300'); } echo json_encode(['ok' => false, 'sucesso' => false, 'success' => false, 'erro' => 'Sistema em manutenção. Tente novamente em alguns minutos.', 'msg' => 'Sistema em manutenção. Tente novamente em alguns minutos.'], JSON_UNESCAPED_UNICODE); exit; } unset($paiChavesSemSessao); } // 23/10/2026: sem o pai_sessao.php e com o modo exigir, bloqueia em vez de liberar

/**
 * salas_tv.php — Salas do Memorial pelo App PAI (página "salas-tv").
 *
 * O app NUNCA fala com as TVs: só grava o pedido na fila (tv_comandos). O agente do PC do
 * Memorial busca o pedido em salas_tv_agente.php, executa na rede local e devolve o resultado.
 *
 * GET  ?action=estado            → agente online/offline, estado das 6 TVs por sala, últimos pedidos
 * GET  ?action=comando&id=N      → situação de um pedido
 * POST ?action=pedir  {sala, acao, valor?}  → cria o pedido (ações: ligar, desligar, atualizar, volume)
 */

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
    if ($origin === '' || !in_array($origin, $allowedOrigins, true)) { http_response_code(403); exit; }
    http_response_code(204); exit;
}
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

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

require __DIR__ . '/salas_tv_comum.php';

const PAGINA_SALAS_TV = 'salas-tv';

// ---------------------------------------------------------------------------
// Usuário e permissão (mesmo modelo do convenio.php)
// ---------------------------------------------------------------------------
function usuarioLogado(PDO $pdo): array
{
    if (empty($_SESSION['usuario_nome']) && ($_COOKIE['pai_auth'] ?? '') === '1') {
        $who = $_COOKIE['pai_user'] ?? $_COOKIE['pai_nome'] ?? $_COOKIE['user'] ?? null;
        if (!empty($who)) {
            $_SESSION['usuario_nome'] = tvTexto($who, 120);
        }
    }
    if (empty($_SESSION['usuario_nome'])) {
        tvResponder(['erro' => true, 'need_login' => 1, 'msg' => 'Sessão expirada. Faça login novamente.'], 401);
    }

    $id = (int)($_SESSION['user_id'] ?? $_SESSION['usuario_id'] ?? $_COOKIE['pai_uid'] ?? 0);
    $login = tvTexto($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? '', 120);
    $nome = tvTexto($_SESSION['usuario_nome'] ?? '', 120);

    $row = null;
    $buscas = [];
    if ($id > 0) $buscas[] = ['id = :v', $id];
    if ($login !== '') $buscas[] = ['usuario = :v', $login];
    if ($nome !== '') $buscas[] = ['nome = :v', $nome];
    foreach ($buscas as [$cond, $valor]) {
        $st = $pdo->prepare("SELECT id, usuario, nome, cargo FROM usuarios WHERE {$cond} LIMIT 1");
        $st->execute([':v' => $valor]);
        $row = $st->fetch() ?: null;
        if ($row) break;
    }
    if (!$row) {
        tvResponder(['erro' => true, 'need_login' => 1, 'msg' => 'Usuário autenticado não encontrado.'], 401);
    }
    $_SESSION['user_id'] = (int)$row['id'];
    return ['id' => (int)$row['id'], 'nome' => (string)($row['nome'] ?: $row['usuario']), 'cargo' => (string)($row['cargo'] ?? '')];
}

function temPermissao(PDO $pdo, int $usuarioId, string $pagina): bool
{
    $st = $pdo->prepare('SELECT 1 FROM permissoes WHERE user_id = :u AND pagina = :p LIMIT 1');
    $st->execute([':u' => $usuarioId, ':p' => $pagina]);
    if ($st->fetchColumn()) return true;
    try {
        $st = $pdo->prepare(
            'SELECT 1 FROM usuarios u
               JOIN cargos c ON c.slug = u.cargo AND c.ativo = 1
               JOIN cargo_paginas cp ON cp.cargo_id = c.id
              WHERE u.id = :u AND cp.pagina = :p LIMIT 1'
        );
        $st->execute([':u' => $usuarioId, ':p' => $pagina]);
        return (bool)$st->fetchColumn();
    } catch (Throwable $e) {
        return false; // instalação sem cargos/cargo_paginas
    }
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
try {
    $pdo = tvConectar('salas_tv.php');
    $usuario = usuarioLogado($pdo);
    if (!temPermissao($pdo, $usuario['id'], PAGINA_SALAS_TV)) {
        tvResponder(['erro' => true, 'msg' => 'Você não tem permissão para a tela Salas do Memorial.'], 403);
    }
    tvVencerPedidos($pdo);

    $action = (string)($_GET['action'] ?? '');
    $metodo = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($action === 'estado' && $metodo === 'GET') {
        $status = [];
        foreach ($pdo->query('SELECT tv, estado, volume, volume_max, atualizado_em FROM tv_status') as $r) {
            $status[$r['tv']] = [
                'estado' => $r['estado'],
                'volume' => $r['volume'] === null ? null : (int)$r['volume'],
                'volume_max' => $r['volume_max'] === null ? null : (int)$r['volume_max'],
                'atualizado_em' => $r['atualizado_em'],
            ];
        }
        $vazio = ['estado' => 'desconhecida', 'volume' => null, 'volume_max' => null, 'atualizado_em' => null];

        $salas = [];
        foreach (TV_SALAS as $sala => $par) {
            $st = $pdo->prepare(
                "SELECT id, acao, valor, situacao, resultado, usuario_nome, criado_em, concluido_em
                   FROM tv_comandos WHERE sala = :s ORDER BY id DESC LIMIT 1"
            );
            $st->execute([':s' => $sala]);
            $ultimo = $st->fetch() ?: null;
            if ($ultimo) {
                $ultimo['id'] = (int)$ultimo['id'];
                $ultimo['valor'] = $ultimo['valor'] === null ? null : (int)$ultimo['valor'];
            }
            $salas[] = [
                'sala' => $sala,
                'painel' => ['tv' => $par['painel']] + ($status[$par['painel']] ?? $vazio),
                'dentro' => ['tv' => $par['dentro']] + ($status[$par['dentro']] ?? $vazio),
                'ultimo_pedido' => $ultimo,
            ];
        }

        $hist = $pdo->query(
            "SELECT id, sala, acao, valor, situacao, resultado, usuario_nome, criado_em, concluido_em
               FROM tv_comandos WHERE acao <> 'volume' ORDER BY id DESC LIMIT 8"
        )->fetchAll();
        foreach ($hist as &$h) { $h['id'] = (int)$h['id']; }
        unset($h);

        tvResponder([
            'erro' => false,
            'agente' => tvAgente($pdo),
            'salas' => $salas,
            'historico' => $hist,
            'agora' => tvAgora(),
        ]);
    }

    if ($action === 'comando' && $metodo === 'GET') {
        $id = (int)($_GET['id'] ?? 0);
        $st = $pdo->prepare('SELECT id, sala, acao, valor, situacao, resultado, criado_em, concluido_em FROM tv_comandos WHERE id = :id');
        $st->execute([':id' => $id]);
        $c = $st->fetch();
        if (!$c) tvResponder(['erro' => true, 'msg' => 'Pedido não encontrado.'], 404);
        $c['id'] = (int)$c['id'];
        tvResponder(['erro' => false, 'comando' => $c]);
    }

    if ($action === 'pedir' && $metodo === 'POST') {
        if ($origin !== '' && !in_array($origin, $allowedOrigins, true)) {
            tvResponder(['erro' => true, 'msg' => 'Origem não autorizada.'], 403);
        }
        $d = tvLerJson();
        $sala = strtoupper(tvTexto($d['sala'] ?? '', 20));
        $acao = strtolower(tvTexto($d['acao'] ?? '', 20));
        if (!isset(TV_SALAS[$sala])) tvResponder(['erro' => true, 'msg' => 'Sala inválida.'], 400);
        if (!in_array($acao, TV_ACOES, true)) tvResponder(['erro' => true, 'msg' => 'Ação inválida.'], 400);
        $valor = null;
        if ($acao === 'volume') {
            if (!isset($d['valor']) || !is_numeric($d['valor'])) tvResponder(['erro' => true, 'msg' => 'Informe o volume.'], 400);
            $valor = max(0, min(100, (int)$d['valor']));
        }

        $agente = tvAgente($pdo);
        if (!$agente['online']) {
            tvResponder(['erro' => true, 'msg' => 'O Memorial está offline (PC desligado ou sem internet). Tente de novo em instantes.'], 409);
        }

        // Um pedido de cada vez por sala (o volume substitui o volume anterior que ainda não foi feito).
        $st = $pdo->prepare("SELECT id, acao FROM tv_comandos WHERE sala = :s AND situacao IN ('pendente','executando') ORDER BY id DESC LIMIT 1");
        $st->execute([':s' => $sala]);
        $andando = $st->fetch() ?: null;
        if ($andando && $acao !== 'volume') {
            tvResponder(['erro' => true, 'msg' => 'Já tem um pedido em andamento para esta sala. Aguarde terminar.', 'id' => (int)$andando['id']], 409);
        }
        if ($acao === 'volume') {
            $pdo->prepare("UPDATE tv_comandos SET situacao = 'expirado', concluido_em = :a, resultado = 'Substituído por outro volume.'
                            WHERE sala = :s AND acao = 'volume' AND situacao = 'pendente'")
                ->execute([':a' => tvAgora(), ':s' => $sala]);
        }

        $pdo->prepare(
            'INSERT INTO tv_comandos (sala, acao, valor, situacao, usuario_id, usuario_nome, criado_em)
             VALUES (:s, :a, :v, \'pendente\', :uid, :un, :c)'
        )->execute([
            ':s' => $sala, ':a' => $acao, ':v' => $valor,
            ':uid' => $usuario['id'], ':un' => tvTexto($usuario['nome'], 120), ':c' => tvAgora(),
        ]);
        tvResponder(['erro' => false, 'msg' => 'Pedido enviado ao Memorial.', 'id' => (int)$pdo->lastInsertId()]);
    }

    tvResponder(['erro' => true, 'msg' => 'Ação inválida.'], 400);
} catch (Throwable $e) {
    error_log('salas_tv.php: ' . $e->getMessage());
    tvResponder(['erro' => true, 'msg' => 'Erro no servidor das Salas do Memorial.'], 500);
}
