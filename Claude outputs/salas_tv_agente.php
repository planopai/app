<?php
declare(strict_types=1);

/**
 * salas_tv_agente.php — usado SÓ pelo agente do PC do Memorial (agente_salas.pyw).
 *
 * Autenticação: cabeçalho X-Agente-Chave. O servidor guarda só o resumo SHA-256 da chave,
 * no arquivo privado /home2/pla48587/pai-tv-agente.php (gerado no PC pelo instalar_agente.bat).
 * Não usa sessão nem cookies, e não responde a navegadores (sem CORS).
 *
 * POST ?action=buscar     {versao, maquina, status?: [{tv, estado, volume, volume_max}]}
 *        → marca o agente como online, grava o estado das TVs e entrega os pedidos pendentes
 *          (já marcados como "executando", para não serem entregues duas vezes).
 * POST ?action=resultado  {id, final: bool, ok?: bool, msg}
 *        → final=false: só atualiza o andamento; final=true: conclui (concluido/falhou).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

require __DIR__ . '/salas_tv_comum.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    tvResponder(['erro' => true, 'msg' => 'Use POST.'], 405);
}

// ---------------------------------------------------------------------------
// Chave do agente
// ---------------------------------------------------------------------------
function conferirChaveAgente(): void
{
    $chave = (string)($_SERVER['HTTP_X_AGENTE_CHAVE'] ?? '');
    if (!is_file(TV_ARQ_CHAVE_AGENTE) || !is_readable(TV_ARQ_CHAVE_AGENTE)) {
        error_log('salas_tv_agente.php: arquivo da chave do agente ausente.');
        tvResponder(['erro' => true, 'msg' => 'Chave do agente não configurada no servidor (pai-tv-agente.php).'], 500);
    }
    $cfg = require TV_ARQ_CHAVE_AGENTE;
    $esperado = is_array($cfg) ? strtolower((string)($cfg['token_sha256'] ?? '')) : '';
    if (strlen($esperado) !== 64 || strlen($chave) < 32 || !hash_equals($esperado, hash('sha256', $chave))) {
        usleep(300000); // atrapalha tentativa de adivinhar
        tvResponder(['erro' => true, 'msg' => 'Chave do agente inválida.'], 401);
    }
}

try {
    conferirChaveAgente();
    $pdo = tvConectar('salas_tv_agente.php');
    $action = (string)($_GET['action'] ?? '');
    $d = tvLerJson();
    $agora = tvAgora();

    if ($action === 'buscar') {
        $pdo->prepare(
            'INSERT INTO tv_agente (id, visto_em, versao, maquina) VALUES (1, :v, :ver, :m)
             ON DUPLICATE KEY UPDATE visto_em = VALUES(visto_em), versao = VALUES(versao), maquina = VALUES(maquina)'
        )->execute([':v' => $agora, ':ver' => tvTexto($d['versao'] ?? '', 20), ':m' => tvTexto($d['maquina'] ?? '', 80)]);

        if (isset($d['status']) && is_array($d['status'])) {
            $tvsValidas = [];
            foreach (TV_SALAS as $par) { $tvsValidas[$par['painel']] = true; $tvsValidas[$par['dentro']] = true; }
            $up = $pdo->prepare(
                'INSERT INTO tv_status (tv, estado, volume, volume_max, atualizado_em) VALUES (:tv, :e, :v, :m, :a)
                 ON DUPLICATE KEY UPDATE estado = VALUES(estado), volume = VALUES(volume),
                                         volume_max = VALUES(volume_max), atualizado_em = VALUES(atualizado_em)'
            );
            foreach ($d['status'] as $s) {
                if (!is_array($s)) continue;
                $tv = strtoupper(tvTexto($s['tv'] ?? '', 30));
                $estado = (string)($s['estado'] ?? '');
                if (!isset($tvsValidas[$tv]) || !in_array($estado, TV_ESTADOS, true)) continue;
                $up->execute([
                    ':tv' => $tv, ':e' => $estado,
                    ':v' => isset($s['volume']) && is_numeric($s['volume']) ? (int)$s['volume'] : null,
                    ':m' => isset($s['volume_max']) && is_numeric($s['volume_max']) ? (int)$s['volume_max'] : null,
                    ':a' => $agora,
                ]);
            }
        }

        tvVencerPedidos($pdo);

        // Entrega os pendentes (no máximo 1 por sala) e marca como executando, numa transação.
        $pdo->beginTransaction();
        $rows = $pdo->query(
            "SELECT id, sala, acao, valor FROM tv_comandos
              WHERE situacao = 'pendente' ORDER BY id ASC LIMIT 10 FOR UPDATE"
        )->fetchAll();
        $entregar = [];
        $salasVistas = [];
        foreach ($rows as $r) {
            if (isset($salasVistas[$r['sala']])) continue; // o próximo da mesma sala vai na próxima busca
            $salasVistas[$r['sala']] = true;
            $entregar[] = [
                'id' => (int)$r['id'], 'sala' => $r['sala'], 'acao' => $r['acao'],
                'valor' => $r['valor'] === null ? null : (int)$r['valor'],
                'tvs' => TV_SALAS[$r['sala']] ?? null,
            ];
        }
        if ($entregar) {
            $ids = implode(',', array_map(static fn($c) => (int)$c['id'], $entregar));
            $pdo->prepare("UPDATE tv_comandos SET situacao = 'executando', pego_em = :a, resultado = 'Recebido pelo Memorial…'
                            WHERE id IN ({$ids}) AND situacao = 'pendente'")->execute([':a' => $agora]);
        }
        $pdo->commit();

        tvResponder(['erro' => false, 'comandos' => array_values(array_filter($entregar, static fn($c) => $c['tvs'] !== null)), 'agora' => $agora]);
    }

    if ($action === 'resultado') {
        $id = (int)($d['id'] ?? 0);
        $msg = tvTexto($d['msg'] ?? '', 480);
        if ($id <= 0) tvResponder(['erro' => true, 'msg' => 'Pedido inválido.'], 400);
        if (!empty($d['final'])) {
            $situacao = !empty($d['ok']) ? 'concluido' : 'falhou';
            $pdo->prepare("UPDATE tv_comandos SET situacao = :s, resultado = :r, concluido_em = :a
                            WHERE id = :id AND situacao = 'executando'")
                ->execute([':s' => $situacao, ':r' => $msg, ':a' => $agora, ':id' => $id]);
        } else {
            $pdo->prepare("UPDATE tv_comandos SET resultado = :r WHERE id = :id AND situacao = 'executando'")
                ->execute([':r' => $msg, ':id' => $id]);
        }
        $pdo->prepare('UPDATE tv_agente SET visto_em = :v WHERE id = 1')->execute([':v' => $agora]);
        tvResponder(['erro' => false]);
    }

    tvResponder(['erro' => true, 'msg' => 'Ação inválida.'], 400);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('salas_tv_agente.php: ' . $e->getMessage());
    tvResponder(['erro' => true, 'msg' => 'Erro no servidor (agente).'], 500);
}
