<?php
declare(strict_types=1);
/**
 * aurora_15.php — histórico da Mango no Messenger (21/11/2026)
 *
 * Arquivo NOVO e separado: usa o messenger_nucleo.php. Não muda nenhum PHP existente.
 *
 * O QUE FAZ (decisão da gestão, 21/11/2026):
 *  - importa o backup da Mango (pacote gerado a partir do backup: contatos_NNN, atendimentos_NNN e mensagens_NNN,
 *    em .ndjson.gz) dos dois números (escritório e plantão) e dos canais antigos (financeiro, cobrança, Instagram);
 *  - contatos entram em chat_contatos_externos (sem duplicar; só completa o nome vazio); as etiquetas da Mango,
 *    já mapeadas para as do Conecta, ficam em chat_mango_etiquetas (máx. 4 por contato);
 *  - atendimentos e mensagens ficam em tabelas próprias, só de leitura (chat_mango_atendimentos e chat_mango_mensagens);
 *  - pode rodar de novo com uma exportação mais nova: não duplica (mango_id único) e atualiza o fim dos atendimentos;
 *  - entrega o histórico de um contato para a conversa ("Histórico da Mango"), só texto (mídias como [foto] etc.).
 *
 * PASTA DO PACOTE: /home2/pla48587/mango_import (fora do site; outra pasta: chave mango_pasta no pai-chaves.php).
 * O andamento fica em estado.json nessa pasta. Para importar de novo um pacote inteiro, apague o estado.json.
 *
 * BANCO (SQL de 21/11/2026, rodado pelo usuário): chat_mango_atendimentos, chat_mango_mensagens e chat_mango_etiquetas.
 *
 * AÇÕES
 *   CLI: php aurora_15.php importar                      → importa tudo o que falta
 *   GET  importar (só Gestão)                           → importa por ~20 s e devolve o andamento
 *        importar&tela=1                                → página que se recarrega sozinha até terminar
 *   GET  situacao (só Gestão)                           → andamento, sem importar
 *   GET  resumo (conversa_id)                           → {atendimentos, mensagens} do contato (para mostrar o botão)
 *   GET  historico (conversa_id, antes?, limite?)       → atendimentos antigos com as mensagens, mais recentes primeiro
 */

date_default_timezone_set('America/Bahia');

$cli = PHP_SAPI === 'cli';
$origin = '';
$allowedOrigins = [];

if (!$cli) {
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
        header('Access-Control-Allow-Methods: GET, OPTIONS');
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
}

register_shutdown_function(function () use ($cli) {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('[aurora_15] fatal: ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
        if ($cli) {
            echo 'Erro: ' . $e['message'] . "\n";
            return;
        }
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['erro' => true, 'msg' => 'Erro interno no servidor (PHP): ' . preg_replace('#/[^\s:]*/#', '', (string) $e['message']) . ' — ' . basename((string) $e['file']) . ':' . $e['line']], JSON_UNESCAPED_UNICODE);
    }
});

if (!is_file(__DIR__ . '/messenger_nucleo.php')) {
    if (!$cli) {
        http_response_code(500);
    }
    echo json_encode(['erro' => true, 'msg' => 'Arquivo ausente no servidor: messenger_nucleo.php.'], JSON_UNESCAPED_UNICODE);
    exit;
}
require_once __DIR__ . '/messenger_nucleo.php';

const A15_NUMEROS = ['escritorio' => 'Escritório', 'plantao' => 'Plantão', 'financeiro' => 'Financeiro', 'cobranca' => 'Cobrança', 'instagram' => 'Instagram/Facebook'];
const A15_TIPOS = ['texto', 'audio', 'imagem', 'video', 'documento', 'figurinha', 'localizacao', 'contato', 'ligacao'];
const A15_LOTE = 500;

function a15Pasta(): string
{
    $p = trim((string) msgConfig('mango_pasta', ''));
    return rtrim($p !== '' ? $p : '/home2/pla48587/mango_import', '/');
}

function a15Estado(): array
{
    $f = a15Pasta() . '/estado.json';
    $j = is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
    return is_array($j) ? $j + ['feitos' => [], 'contagem' => []] : ['feitos' => [], 'contagem' => []];
}

function a15SalvarEstado(array $e): void
{
    if (@file_put_contents(a15Pasta() . '/estado.json', json_encode($e, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) === false) {
        throw new RuntimeException('Não foi possível gravar o estado.json na pasta do pacote (permissão de escrita).');
    }
}

/** Arquivos do pacote na ordem certa: contatos, atendimentos, mensagens. */
function a15Arquivos(): array
{
    $pasta = a15Pasta();
    if (!is_dir($pasta)) {
        throw new RuntimeException('Pasta do pacote não encontrada: ' . $pasta);
    }
    $todos = [];
    foreach (['contatos', 'atendimentos', 'mensagens'] as $i => $tipo) {
        $lista = glob($pasta . '/' . $tipo . '_*.ndjson.gz') ?: [];
        sort($lista, SORT_STRING);
        foreach ($lista as $f) {
            $todos[] = basename($f);
        }
    }
    return $todos;
}

function a15Linhas(string $arquivo): array
{
    $gz = @gzopen(a15Pasta() . '/' . $arquivo, 'rb');
    if (!$gz) {
        throw new RuntimeException('Não foi possível abrir ' . $arquivo);
    }
    $linhas = [];
    while (!gzeof($gz)) {
        $l = trim((string) gzgets($gz, 1 << 20));
        if ($l !== '') {
            $j = json_decode($l, true);
            if (is_array($j)) {
                $linhas[] = $j;
            }
        }
    }
    gzclose($gz);
    return $linhas;
}

/** Telefone com e sem o 9 do celular (formato antigo do WhatsApp). */
function a15Variantes(string $t): array
{
    $v = [$t];
    if (strlen($t) === 13 && $t[4] === '9') {
        $v[] = substr($t, 0, 4) . substr($t, 5);
    } elseif (strlen($t) === 12 && in_array($t[4], ['6', '7', '8', '9'], true)) {
        $v[] = substr($t, 0, 4) . '9' . substr($t, 4);
    }
    return $v;
}

/** Mapa telefone → id dos contatos de WhatsApp do Conecta (carregado uma vez por chamada). */
function &a15MapaContatos(PDO $pdo): array
{
    static $mapa = null;
    if ($mapa === null) {
        $mapa = [];
        foreach ($pdo->query("SELECT id, wa_id, telefone_e164 FROM chat_contatos_externos WHERE canal = 'whatsapp' ORDER BY id DESC") as $r) {
            foreach ([(string) $r['wa_id'], preg_replace('/\D/', '', (string) $r['telefone_e164']) ?? ''] as $t) {
                if ($t !== '' && ctype_digit($t)) {
                    $mapa[$t] = (int) $r['id']; // ORDER BY id DESC: fica o mais antigo
                }
            }
        }
    }
    return $mapa;
}

function a15ContatoId(PDO $pdo, string $t): ?int
{
    $mapa = &a15MapaContatos($pdo);
    foreach (a15Variantes($t) as $v) {
        if (isset($mapa[$v])) {
            return $mapa[$v];
        }
    }
    return null;
}

/** Guarda no mapa o contato que acabou de ser criado. */
function a15LembrarContato(PDO $pdo, string $t, int $id): void
{
    $mapa = &a15MapaContatos($pdo);
    $mapa[$t] = $id;
}

function a15Data(?string $v): ?string
{
    $v = (string) $v;
    return preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $v) ? $v : null;
}

function a15ImportarContatos(PDO $pdo, array $linhas): int
{
    $etiquetas = [];
    foreach ($pdo->query('SELECT id, nome FROM chat_etiquetas WHERE usuario_id IS NULL') as $e) {
        $etiquetas[mb_strtolower(trim((string) $e['nome']))] = (int) $e['id'];
    }
    $novo = $pdo->prepare("INSERT INTO chat_contatos_externos (canal, wa_id, telefone_e164, nome) VALUES ('whatsapp', :w, :t, :n)");
    $nome = $pdo->prepare("UPDATE chat_contatos_externos SET nome = :n WHERE id = :id AND (nome IS NULL OR nome = '')");
    $etq = $pdo->prepare('INSERT IGNORE INTO chat_mango_etiquetas (contato_externo_id, etiqueta_id) VALUES (:c, :e)');
    $n = 0;
    foreach ($linhas as $l) {
        $t = preg_replace('/\D/', '', (string) ($l['t'] ?? '')) ?? '';
        if (strlen($t) < 12 || strlen($t) > 13) {
            continue;
        }
        $nm = mb_substr(trim((string) ($l['n'] ?? '')), 0, 150);
        $id = a15ContatoId($pdo, $t);
        if ($id === null) {
            $novo->execute([':w' => $t, ':t' => '+' . $t, ':n' => $nm !== '' ? $nm : null]);
            $id = (int) $pdo->lastInsertId();
            a15LembrarContato($pdo, $t, $id);
        } elseif ($nm !== '') {
            $nome->execute([':n' => $nm, ':id' => $id]);
        }
        foreach (array_slice((array) ($l['e'] ?? []), 0, 4) as $e) {
            $eid = $etiquetas[mb_strtolower(trim((string) $e))] ?? 0;
            if ($eid) {
                $etq->execute([':c' => $id, ':e' => $eid]);
            }
        }
        $n++;
    }
    return $n;
}

function a15ImportarAtendimentos(PDO $pdo, array $linhas): int
{
    $n = 0;
    foreach (array_chunk($linhas, A15_LOTE) as $lote) {
        $vals = [];
        $par = [];
        foreach ($lote as $l) {
            $t = preg_replace('/\D/', '', (string) ($l['t'] ?? '')) ?? '';
            $ini = a15Data($l['ini'] ?? null);
            $mid = (string) ($l['id'] ?? '');
            if ($mid === '' || !$ini) {
                continue;
            }
            $num = isset(A15_NUMEROS[$l['num'] ?? '']) ? $l['num'] : 'escritorio';
            $vals[] = '(?, ?, ?, ?, ?, ?, ?, ?)';
            array_push($par, mb_substr($mid, 0, 32), $t !== '' ? a15ContatoId($pdo, $t) : null, $t !== '' ? $t : null, $num,
                ($l['setor'] ?? '') !== '' ? mb_substr((string) $l['setor'], 0, 60) : null,
                ($l['por'] ?? '') !== '' ? mb_substr((string) $l['por'], 0, 100) : null, $ini, a15Data($l['fim'] ?? null));
            $n++;
        }
        if ($vals) {
            $pdo->prepare('INSERT INTO chat_mango_atendimentos (mango_id, contato_externo_id, telefone, numero, setor, encerrado_por, inicio, fim) VALUES '
                . implode(', ', $vals)
                . ' ON DUPLICATE KEY UPDATE fim = VALUES(fim), encerrado_por = VALUES(encerrado_por), setor = VALUES(setor),
                    contato_externo_id = COALESCE(VALUES(contato_externo_id), contato_externo_id)')->execute($par);
        }
    }
    return $n;
}

function a15ImportarMensagens(PDO $pdo, array $linhas): int
{
    $n = 0;
    foreach (array_chunk($linhas, A15_LOTE) as $lote) {
        $ids = array_values(array_unique(array_filter(array_map(fn($l) => (string) ($l['a'] ?? ''), $lote))));
        $atend = [];
        if ($ids) {
            $st = $pdo->prepare('SELECT id, mango_id FROM chat_mango_atendimentos WHERE mango_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
            $st->execute($ids);
            foreach ($st as $r) {
                $atend[$r['mango_id']] = (int) $r['id'];
            }
        }
        $vals = [];
        $par = [];
        foreach ($lote as $l) {
            $mid = (string) ($l['id'] ?? '');
            $em = a15Data($l['em'] ?? null);
            if ($mid === '' || !$em) {
                continue;
            }
            $t = preg_replace('/\D/', '', (string) ($l['t'] ?? '')) ?? '';
            $au = ['c' => 'cliente', 'e' => 'equipe', 'a' => 'automatico'][$l['au'] ?? ''] ?? 'automatico';
            $tp = in_array($l['tp'] ?? '', A15_TIPOS, true) ? $l['tp'] : 'texto';
            $num = isset(A15_NUMEROS[$l['num'] ?? '']) ? $l['num'] : 'escritorio';
            $vals[] = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            array_push($par, mb_substr($mid, 0, 32), $atend[(string) ($l['a'] ?? '')] ?? null, $t !== '' ? a15ContatoId($pdo, $t) : null,
                $t !== '' ? $t : null, $num, $au, ($l['an'] ?? '') !== '' ? mb_substr((string) $l['an'], 0, 100) : null, $tp,
                ($l['tx'] ?? '') !== '' ? (string) $l['tx'] : null, $em);
            $n++;
        }
        if ($vals) {
            $pdo->prepare('INSERT IGNORE INTO chat_mango_mensagens (mango_id, atendimento_id, contato_externo_id, telefone, numero, autor, autor_nome, tipo, texto, enviada_em) VALUES '
                . implode(', ', $vals))->execute($par);
        }
    }
    return $n;
}

/** Importa os arquivos que faltam até o tempo-limite (0 = sem limite). */
function a15Importar(PDO $pdo, int $segundos): array
{
    @set_time_limit($segundos > 0 ? $segundos + 40 : 0);
    @ini_set('memory_limit', '512M');
    $inicio = microtime(true);
    $estado = a15Estado();
    $arquivos = a15Arquivos();
    foreach ($arquivos as $arq) {
        if (in_array($arq, $estado['feitos'], true)) {
            continue;
        }
        if ($segundos > 0 && microtime(true) - $inicio > $segundos) {
            break;
        }
        $linhas = a15Linhas($arq);
        $pdo->beginTransaction();
        try {
            $tipo = explode('_', $arq)[0];
            $qtd = match ($tipo) {
                'contatos' => a15ImportarContatos($pdo, $linhas),
                'atendimentos' => a15ImportarAtendimentos($pdo, $linhas),
                default => a15ImportarMensagens($pdo, $linhas),
            };
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw new RuntimeException($arq . ': ' . $e->getMessage());
        }
        $estado['feitos'][] = $arq;
        $estado['contagem'][$tipo] = (int) ($estado['contagem'][$tipo] ?? 0) + $qtd;
        $estado['atualizado_em'] = date('Y-m-d H:i:s');
        a15SalvarEstado($estado);
    }
    return a15Situacao($arquivos, $estado);
}

function a15Situacao(?array $arquivos = null, ?array $estado = null): array
{
    $arquivos ??= a15Arquivos();
    $estado ??= a15Estado();
    $faltam = array_values(array_diff($arquivos, $estado['feitos']));
    return [
        'total' => count($arquivos), 'feitos' => count($arquivos) - count($faltam), 'faltam' => count($faltam),
        'proximo' => $faltam[0] ?? null, 'concluido' => !$faltam && $arquivos, 'contagem' => $estado['contagem'],
        'atualizado_em' => $estado['atualizado_em'] ?? null,
    ];
}

function a15Tela(array $s, string $erro = ''): never
{
    header('Content-Type: text/html; charset=utf-8');
    $pct = $s['total'] ? (int) round(100 * $s['feitos'] / $s['total']) : 0;
    $c = $s['contagem'];
    $recarregar = !$erro && !$s['concluido'] && $s['total'];
    echo '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . ($recarregar ? '<meta http-equiv="refresh" content="2">' : '')
        . '<title>Importação da Mango</title></head><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1F2638">'
        . '<h1 style="font-size:22px">Importação do histórico da Mango</h1>'
        . '<div style="background:#E6E9EE;border-radius:8px;height:16px;overflow:hidden"><div style="background:#3D6A99;height:16px;width:' . $pct . '%"></div></div>'
        . '<p><b>' . $pct . '%</b> · ' . $s['feitos'] . ' de ' . $s['total'] . ' arquivos</p>'
        . '<p>Contatos: ' . (int) ($c['contatos'] ?? 0) . ' · Atendimentos: ' . (int) ($c['atendimentos'] ?? 0) . ' · Mensagens: ' . (int) ($c['mensagens'] ?? 0) . '</p>'
        . ($erro !== '' ? '<p style="color:#B42318;font-weight:700">Erro: ' . htmlspecialchars($erro) . '</p><p><a href="?action=importar&amp;tela=1">Tentar de novo</a></p>' : '')
        . ($s['concluido'] ? '<p style="color:#2F7A1F;font-weight:700">Concluído. Pode fechar esta página.</p>' : ($recarregar ? '<p>Importando… não feche esta página.</p>' : ''))
        . '</body></html>';
    exit;
}

/** Contato da conversa (só conversas de cliente que o usuário pode ver, ou a Gestão). */
function a15ContatoDaConversa(PDO $pdo, array $usuario, int $conversaId): array
{
    $c = msgConversa($pdo, $conversaId);
    if (!$c || $c['tipo'] !== 'externo' || !(msgPodeVer($pdo, $c, $usuario) || msgEhGestao($pdo, (int) $usuario['id']))) {
        msgErro('Conversa não encontrada.', 404);
    }
    $st = $pdo->prepare('SELECT id, wa_id, telefone_e164 FROM chat_contatos_externos WHERE id = :id');
    $st->execute([':id' => (int) $c['contato_externo_id']]);
    $ct = $st->fetch();
    if (!$ct) {
        msgErro('Contato não encontrado.', 404);
    }
    $t = preg_replace('/\D/', '', (string) ($ct['wa_id'] ?: $ct['telefone_e164'])) ?? '';
    return ['id' => (int) $ct['id'], 'tels' => ctype_digit($t) && $t !== '' ? a15Variantes($t) : ['-']];
}

/** Filtro SQL do contato: pelo id gravado na importação ou pelo telefone (contato criado depois com outro formato). */
function a15Onde(array $ct, string $alias, array &$par): string
{
    $par[] = $ct['id'];
    $marcas = implode(',', array_fill(0, count($ct['tels']), '?'));
    array_push($par, ...$ct['tels']);
    return "({$alias}.contato_externo_id = ? OR {$alias}.telefone IN ({$marcas}))";
}

function a15Mensagem(array $m): array
{
    return [
        'autor' => $m['autor'], 'autor_nome' => $m['autor_nome'], 'tipo' => $m['tipo'], 'texto' => $m['texto'],
        'em' => $m['enviada_em'], 'numero' => $m['numero'],
    ];
}

if ($cli) {
    $tarefa = strtolower((string) ($argv[1] ?? ''));
    if ($tarefa !== 'importar') {
        echo "Uso: php aurora_15.php importar\n";
        exit(1);
    }
    try {
        $s = a15Importar(msgPdo(), 0);
        echo 'Importação: ' . $s['feitos'] . ' de ' . $s['total'] . ' arquivos. ' . json_encode($s['contagem'], JSON_UNESCAPED_UNICODE) . "\n";
        exit(0);
    } catch (Throwable $e) {
        echo 'Erro: ' . $e->getMessage() . "\n";
        exit(1);
    }
}

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($metodo !== 'GET') {
    msgErro('Método não permitido.', 405);
}
$pdo = msgPdo();
$usuario = msgUsuario($pdo);
$uid = (int) $usuario['id'];
if (!msgTemPagina($pdo, $uid)) {
    msgErro('Usuário sem permissão para o Messenger.', 403);
}
$acao = strtolower(msgTexto((string) ($_GET['action'] ?? '')));

try {
    switch ($acao) {
        case 'importar':
        case 'situacao':
            if (!msgEhGestao($pdo, $uid)) {
                msgErro('Só a Gestão importa o histórico da Mango.', 403);
            }
            $tela = !empty($_GET['tela']);
            try {
                $s = $acao === 'importar' ? a15Importar($pdo, 20) : a15Situacao();
            } catch (Throwable $e) {
                error_log('[aurora_15] importar: ' . $e->getMessage());
                if ($tela) {
                    $s0 = ['total' => 0, 'feitos' => 0, 'concluido' => false, 'contagem' => []];
                    try { $s0 = a15Situacao(); } catch (Throwable $e2) { }
                    a15Tela($s0, $e->getMessage());
                }
                msgErro($e->getMessage(), 500);
            }
            if ($tela) {
                a15Tela($s);
            }
            msgOk($s);

        case 'resumo':
            $ct = a15ContatoDaConversa($pdo, $usuario, (int) ($_GET['conversa_id'] ?? 0));
            $par = [];
            $st = $pdo->prepare('SELECT COUNT(*) FROM chat_mango_mensagens m WHERE ' . a15Onde($ct, 'm', $par));
            $st->execute($par);
            $msgs = (int) $st->fetchColumn();
            $par = [];
            $sa = $pdo->prepare('SELECT COUNT(*), MIN(a.inicio), MAX(a.inicio) FROM chat_mango_atendimentos a WHERE ' . a15Onde($ct, 'a', $par));
            $sa->execute($par);
            [$qtd, $de, $ate] = $sa->fetch(PDO::FETCH_NUM);
            msgOk(['mensagens' => $msgs, 'atendimentos' => (int) $qtd, 'de' => $de, 'ate' => $ate]);

        case 'historico':
            $ct = a15ContatoDaConversa($pdo, $usuario, (int) ($_GET['conversa_id'] ?? 0));
            $limite = max(1, min(30, (int) ($_GET['limite'] ?? 10)));
            $antes = a15Data((string) ($_GET['antes'] ?? '')) ?? '9999-12-31 23:59:59';

            // etiquetas antigas do contato
            $se = $pdo->prepare('SELECT e.nome, e.cor FROM chat_mango_etiquetas me JOIN chat_etiquetas e ON e.id = me.etiqueta_id WHERE me.contato_externo_id = :c ORDER BY e.nome');
            $se->execute([':c' => $ct['id']]);
            $etiquetas = $se->fetchAll();

            // atendimentos da página (mais recentes primeiro)
            $par = [];
            $onde = a15Onde($ct, 'a', $par);
            $par[] = $antes;
            $sa = $pdo->prepare("SELECT a.id, a.numero, a.setor, a.encerrado_por, a.inicio, a.fim FROM chat_mango_atendimentos a
                                  WHERE {$onde} AND a.inicio < ? ORDER BY a.inicio DESC LIMIT " . ($limite + 1));
            $sa->execute($par);
            $atend = $sa->fetchAll();
            $mais = count($atend) > $limite;
            $atend = array_slice($atend, 0, $limite);
            $piso = $mais && $atend ? end($atend)['inicio'] : '0000-01-01 00:00:00';

            $grupos = [];
            if ($atend) {
                $ids = array_map(fn($a) => (int) $a['id'], $atend);
                $sm = $pdo->prepare('SELECT atendimento_id, autor, autor_nome, tipo, texto, enviada_em, numero FROM chat_mango_mensagens
                                      WHERE atendimento_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY enviada_em, id');
                $sm->execute($ids);
                $porAtend = [];
                foreach ($sm as $m) {
                    $porAtend[(int) $m['atendimento_id']][] = a15Mensagem($m);
                }
                foreach ($atend as $a) {
                    $grupos[] = [
                        'chave' => 'a' . $a['id'], 'numero' => $a['numero'], 'numero_nome' => A15_NUMEROS[$a['numero']] ?? $a['numero'],
                        'setor' => $a['setor'], 'encerrado_por' => $a['encerrado_por'], 'inicio' => $a['inicio'], 'fim' => $a['fim'],
                        'mensagens' => $porAtend[(int) $a['id']] ?? [],
                    ];
                }
            }
            // mensagens fora de atendimento (lembretes, campanhas) no mesmo intervalo, agrupadas por dia
            $par = [];
            $onde = a15Onde($ct, 'm', $par);
            array_push($par, $piso, $antes);
            $sl = $pdo->prepare("SELECT autor, autor_nome, tipo, texto, enviada_em, numero FROM chat_mango_mensagens m
                                  WHERE {$onde} AND m.atendimento_id IS NULL AND m.enviada_em >= ? AND m.enviada_em < ? ORDER BY m.enviada_em, m.id LIMIT 500");
            $sl->execute($par);
            $dias = [];
            foreach ($sl as $m) {
                $d = substr((string) $m['enviada_em'], 0, 10);
                $dias[$d] ??= ['chave' => 'd' . $d, 'numero' => $m['numero'], 'numero_nome' => A15_NUMEROS[$m['numero']] ?? $m['numero'],
                    'setor' => null, 'encerrado_por' => null, 'inicio' => $m['enviada_em'], 'fim' => null, 'avulsas' => true, 'mensagens' => []];
                $dias[$d]['mensagens'][] = a15Mensagem($m);
            }
            $grupos = array_merge($grupos, array_values($dias));
            usort($grupos, fn($x, $y) => strcmp((string) $y['inicio'], (string) $x['inicio']));

            msgOk(['etiquetas' => $etiquetas, 'grupos' => $grupos, 'mais' => $mais, 'antes' => $mais ? $piso : null]);

        default:
            msgErro('Ação desconhecida.', 404);
    }
} catch (PDOException $e) {
    error_log('[aurora_15] banco: ' . $e->getMessage());
    msgErro(str_contains($e->getMessage(), 'chat_mango_') ? 'Tabelas do histórico da Mango não encontradas: rode o SQL de 21/11/2026.' : 'Erro no banco.', 500);
}
