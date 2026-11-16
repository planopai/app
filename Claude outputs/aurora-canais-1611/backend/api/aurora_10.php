<?php
declare(strict_types=1);
/**
 * aurora_10.php — gestão do funil de vendas do Messenger (27/10/2026)
 *
 * Arquivo NOVO e separado: usa o messenger_nucleo.php e as tabelas do funil (chat_funil, chat_funil_historico) que o
 * aurora_04.php alimenta. Não muda o aurora_04.php nem o webhook.
 *
 * O QUE FAZ (decisão da gestão, 27/10/2026), só para a Gestão:
 *  - funil e conversão no período (quantos chegaram a cada etapa, passagem entre etapas, tempo médio até fechar);
 *  - origem dos leads por canal (leads, fechados, conversão, valor);
 *  - desempenho por atendente, com a Aurora numa linha (card sem responsável que veio de conversa);
 *  - motivos de perda e leads parados há mais de X dias.
 * CANAL do lead (coluna chat_funil.canal), preenchido aqui para os cards ainda sem canal:
 *  anúncio → pelo aviso "Veio do anúncio" que o webhook grava (link da Meta: instagram → anuncio_instagram, senão
 *  anuncio_facebook); orgânico → pela frase da primeira mensagem do cliente ("Vim pelo Instagram/Facebook/site");
 *  indicação → pelo que a Aurora anotou em "origem"; o resto, WhatsApp direto (ou "outro" se não veio de conversa).
 *  A Gestão corrige à mão (canal_salvar).
 *
 * BANCO (SQL de 27/10/2026, rodado pelo usuário):
 *   ALTER TABLE chat_funil ADD COLUMN canal VARCHAR(20) NULL, ADD INDEX idx_funil_canal (canal);
 *
 * AÇÕES (?action=), com login e página "messenger":
 *   GET  canais                       → {id do card: canal} dos cards do quadro (todos que veem o funil)
 *   GET  gestao (de, ate, parados)    → painel (só Gestão)
 *   POST canal_salvar (id, canal)     → só Gestão
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
}

register_shutdown_function(function () use ($cli) {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('[aurora_10] fatal: ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
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

if ($cli) {
    echo "aurora_10.php não tem tarefa de linha de comando.\n";
    exit(0);
}

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($metodo === 'POST' && $origin !== '' && !in_array($origin, $allowedOrigins, true)) {
    msgErro('Origem não autorizada.', 403);
}
$pdo = msgPdo();
$usuario = msgUsuario($pdo);
$uid = (int) $usuario['id'];
if (!msgTemPagina($pdo, $uid)) {
    msgErro('Usuário sem permissão para o Messenger.', 403);
}
$acao = strtolower(msgTexto((string) ($_GET['action'] ?? '')));
$corpo = [];
if ($metodo === 'POST') {
    $bruto = (string) file_get_contents('php://input');
    $corpo = $bruto === '' ? [] : json_decode($bruto, true);
    if (!is_array($corpo)) {
        msgErro('Corpo da requisição inválido (JSON esperado).');
    }
}

const A10_CANAIS = [
    'anuncio_facebook' => 'Anúncio Facebook',
    'anuncio_instagram' => 'Anúncio Instagram',
    'instagram' => 'Instagram',
    'facebook' => 'Facebook',
    'site' => 'Site',
    'indicacao' => 'Indicação',
    'whatsapp' => 'WhatsApp direto',
    'outro' => 'Outro',
];
const A10_ETAPAS = ['novo' => 'Novo', 'em_conversa' => 'Em conversa', 'proposta' => 'Proposta enviada', 'ficha' => 'Ficha preenchida', 'fechado' => 'Fechado'];
const A10_ORDEM = ['novo' => 1, 'em_conversa' => 2, 'proposta' => 3, 'ficha' => 4, 'fechado' => 5];

function a10Metodo(string $esperado): void
{
    global $metodo;
    if ($metodo !== $esperado) {
        msgErro('Método não permitido para esta ação.', 405);
    }
}

function a10TemCanal(PDO $pdo): bool
{
    static $tem = null;
    if ($tem === null) {
        try {
            $tem = (bool) $pdo->query("SHOW COLUMNS FROM chat_funil LIKE 'canal'")->fetch();
        } catch (PDOException $e) {
            $tem = false;
        }
    }
    return $tem;
}

/** Canal pelo texto (aviso do anúncio, primeira mensagem ou origem anotada). '' se não der para saber. */
function a10CanalTexto(string $t, bool $anuncio = false): string
{
    $t = mb_strtolower($t);
    if ($t === '') {
        return '';
    }
    if ($anuncio || preg_match('/an[uú]ncio|patrocinad|\bads?\b/u', $t)) {
        return preg_match('/instagram|\binsta\b|\big\b/u', $t) ? 'anuncio_instagram' : 'anuncio_facebook';
    }
    if (preg_match('/instagram|\binsta\b/u', $t)) {
        return 'instagram';
    }
    if (preg_match('/facebook|\bface\b|\bfb\b/u', $t)) {
        return 'facebook';
    }
    if (preg_match('/\bsite\b|landing|p[aá]gina do pai|planoassistencialintegrado/u', $t)) {
        return 'site';
    }
    if (preg_match('/indica[cç][aã]o|indicou|indicad|me falou|me passou o n[uú]mero|recomend/u', $t)) {
        return 'indicacao';
    }
    return '';
}

/** Descobre e grava o canal dos cards ainda sem canal (até 300 por vez). */
function a10PreencherCanais(PDO $pdo): void
{
    if (!a10TemCanal($pdo)) {
        return;
    }
    $cards = $pdo->query('SELECT id, conversa_id, origem, criado_em FROM chat_funil WHERE canal IS NULL ORDER BY id DESC LIMIT 300')->fetchAll();
    if (!$cards) {
        return;
    }
    $anuncio = $pdo->prepare("SELECT texto FROM chat_mensagens WHERE conversa_id = :c AND tipo = 'sistema' AND texto LIKE :t ORDER BY id DESC LIMIT 1");
    $primeira = $pdo->prepare("SELECT texto FROM chat_mensagens WHERE conversa_id = :c AND autor_tipo = 'contato' AND texto IS NOT NULL AND texto <> ''
                                 AND criado_em >= :d - INTERVAL 30 DAY ORDER BY id LIMIT 1");
    $grava = $pdo->prepare('UPDATE chat_funil SET canal = :canal WHERE id = :id AND canal IS NULL');
    $canalConversa = $pdo->prepare('SELECT canal FROM chat_conversas WHERE id = :c'); // 16/11/2026: site, Facebook e Instagram
    foreach ($cards as $f) {
        $canal = '';
        $conv = $f['conversa_id'] !== null ? (int) $f['conversa_id'] : 0;
        if ($conv > 0) {
            $anuncio->execute([':c' => $conv, ':t' => '%Veio do an%']);
            $a = (string) $anuncio->fetchColumn();
            if ($a !== '') {
                $canal = a10CanalTexto($a, true);
            }
            if ($canal === '') {
                $canalConversa->execute([':c' => $conv]);
                $cc = (string) $canalConversa->fetchColumn();
                if (in_array($cc, ['site', 'facebook', 'instagram'], true) && isset(A10_CANAIS[$cc])) {
                    $canal = $cc; // conversa que chegou pelo chat do site ou pela Página (aurora_13 e aurora_14)
                }
            }
            if ($canal === '') {
                $primeira->execute([':c' => $conv, ':d' => $f['criado_em']]);
                $canal = a10CanalTexto((string) $primeira->fetchColumn());
            }
        }
        if ($canal === '') {
            $canal = a10CanalTexto((string) ($f['origem'] ?? ''));
        }
        if ($canal === '') {
            $canal = $conv > 0 ? 'whatsapp' : 'outro';
        }
        $grava->execute([':canal' => $canal, ':id' => (int) $f['id']]);
    }
}

/** Data AAAA-MM-DD válida ou o padrão. */
function a10Data(string $v, string $padrao): string
{
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && strtotime($v) !== false ? $v : $padrao;
}

function a10Pct(int $parte, int $todo): ?float
{
    return $todo > 0 ? round($parte * 100 / $todo, 1) : null;
}

if (!msgTabelaExiste($pdo, 'chat_funil') || !msgTabelaExiste($pdo, 'chat_funil_historico')) {
    msgErro('As tabelas do funil ainda não foram criadas no banco (chat_funil, chat_funil_historico).', 500);
}

try {
    $gestao = msgEhGestao($pdo, $uid);
    switch ($acao) {
        case 'canais':
            a10Metodo('GET');
            if (!a10TemCanal($pdo)) {
                msgOk(['canais' => (object) [], 'nomes' => A10_CANAIS, 'tem_canal' => false]);
            }
            a10PreencherCanais($pdo);
            $mapa = [];
            foreach ($pdo->query("SELECT id, canal FROM chat_funil WHERE etapa NOT IN ('fechado', 'perdido') OR fechado_em > NOW() - INTERVAL 60 DAY")->fetchAll() as $r) {
                $mapa[(string) $r['id']] = $r['canal'];
            }
            msgOk(['canais' => (object) $mapa, 'nomes' => A10_CANAIS, 'tem_canal' => true, 'gestao' => $gestao]);

        case 'canal_salvar':
            a10Metodo('POST');
            if (!$gestao) {
                msgErro('Só a Gestão corrige o canal do lead.', 403);
            }
            if (!a10TemCanal($pdo)) {
                msgErro('Falta rodar o SQL do canal (coluna canal em chat_funil).', 500);
            }
            $canal = (string) ($corpo['canal'] ?? '');
            if (!isset(A10_CANAIS[$canal])) {
                msgErro('Canal inválido.');
            }
            $id = (int) ($corpo['id'] ?? 0);
            $st = $pdo->prepare('UPDATE chat_funil SET canal = :c WHERE id = :id');
            $st->execute([':c' => $canal, ':id' => $id]);
            msgOk(['id' => $id, 'canal' => $canal], 'Canal salvo: ' . A10_CANAIS[$canal] . '.');

        case 'gestao':
            a10Metodo('GET');
            if (!$gestao) {
                msgErro('A gestão do funil é só para a Gestão.', 403);
            }
            $temCanal = a10TemCanal($pdo);
            a10PreencherCanais($pdo);
            $de = a10Data((string) ($_GET['de'] ?? ''), date('Y-m-01'));
            $ate = a10Data((string) ($_GET['ate'] ?? ''), date('Y-m-d'));
            if ($ate < $de) {
                [$de, $ate] = [$ate, $de];
            }
            $parados = max(1, min(60, (int) ($_GET['parados'] ?? 3)));
            $ini = $de . ' 00:00:00';
            $fim = $ate . ' 23:59:59';
            $idsResp = array_map('intval', $pdo->query('SELECT DISTINCT responsavel_usuario_id FROM chat_funil WHERE responsavel_usuario_id IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN));
            $nomes = $idsResp ? msgNomesUsuarios($pdo, $idsResp) : [];

            // cards que entraram no período + os fechados/perdidos no período (para valor e perdas)
            $st = $pdo->prepare('SELECT f.*' . ($temCanal ? '' : ', NULL AS canal') . ' FROM chat_funil f
                                  WHERE (f.criado_em BETWEEN :i1 AND :f1) OR (f.fechado_em BETWEEN :i2 AND :f2)');
            $st->execute([':i1' => $ini, ':f1' => $fim, ':i2' => $ini, ':f2' => $fim]);
            $cards = $st->fetchAll();
            $ids = array_map(fn($c) => (int) $c['id'], $cards);
            $maxHist = [];
            if ($ids) {
                foreach ($pdo->query('SELECT funil_id, para_etapa FROM chat_funil_historico WHERE funil_id IN (' . implode(',', $ids) . ')')->fetchAll() as $h) {
                    $o = A10_ORDEM[$h['para_etapa']] ?? 0;
                    $maxHist[(int) $h['funil_id']] = max($maxHist[(int) $h['funil_id']] ?? 0, $o);
                }
            }
            $quem = function (array $c) use ($nomes): array {
                if ($c['responsavel_usuario_id'] !== null) {
                    $id = (int) $c['responsavel_usuario_id'];
                    return ['chave' => 'u' . $id, 'nome' => $nomes[$id] ?? ('Usuário ' . $id)];
                }
                return $c['conversa_id'] !== null ? ['chave' => 'aurora', 'nome' => 'Aurora'] : ['chave' => 'sem', 'nome' => 'Sem responsável'];
            };
            $noPeriodo = fn($d) => $d !== null && $d >= $ini && $d <= $fim;

            $etapas = array_fill_keys(array_keys(A10_ETAPAS), 0);
            $canais = [];
            $equipe = [];
            $perdas = [];
            $tempos = [];
            $entraram = 0;
            $fechados = 0;
            $perdidos = 0;
            $valor = 0.0;
            foreach ($cards as $c) {
                $entrou = $noPeriodo($c['criado_em']);
                $fechou = $c['etapa'] === 'fechado' && $noPeriodo($c['fechado_em']);
                $perdeu = $c['etapa'] === 'perdido' && $noPeriodo($c['fechado_em'] ?: $c['etapa_em']);
                $canal = $c['canal'] ?: 'outro';
                $q = $quem($c);
                $canais[$canal] ??= ['canal' => $canal, 'nome' => A10_CANAIS[$canal] ?? $canal, 'leads' => 0, 'fechados' => 0, 'perdidos' => 0, 'valor' => 0.0];
                $equipe[$q['chave']] ??= ['chave' => $q['chave'], 'nome' => $q['nome'], 'leads' => 0, 'andamento' => 0, 'fechados' => 0, 'perdidos' => 0, 'valor' => 0.0, 'dias_soma' => 0.0, 'parados' => 0];
                if ($entrou) {
                    $entraram++;
                    $canais[$canal]['leads']++;
                    $equipe[$q['chave']]['leads']++;
                    if (!in_array($c['etapa'], ['fechado', 'perdido'], true)) {
                        $equipe[$q['chave']]['andamento']++;
                    }
                    // até onde chegou (o perdido conta até a última etapa por onde passou)
                    $max = max(A10_ORDEM[$c['etapa']] ?? 0, $maxHist[(int) $c['id']] ?? 0, 1);
                    foreach (A10_ORDEM as $et => $o) {
                        if ($max >= $o) {
                            $etapas[$et]++;
                        }
                    }
                }
                if ($fechou) {
                    $fechados++;
                    $v = (float) ($c['valor_mensal'] ?? 0);
                    $valor += $v;
                    $canais[$canal]['fechados']++;
                    $canais[$canal]['valor'] += $v;
                    $equipe[$q['chave']]['fechados']++;
                    $equipe[$q['chave']]['valor'] += $v;
                    $dias = max(0, (strtotime((string) $c['fechado_em']) - strtotime((string) $c['criado_em'])) / 86400);
                    $tempos[] = $dias;
                    $equipe[$q['chave']]['dias_soma'] += $dias;
                }
                if ($perdeu) {
                    $perdidos++;
                    $canais[$canal]['perdidos']++;
                    $equipe[$q['chave']]['perdidos']++;
                    $m = trim((string) ($c['motivo_perda'] ?? '')) ?: 'Sem motivo informado';
                    $k = mb_strtolower($m);
                    $perdas[$k] ??= ['motivo' => $m, 'qtd' => 0];
                    $perdas[$k]['qtd']++;
                }
            }

            // passagem entre etapas
            $funil = [];
            $anterior = null;
            foreach (A10_ETAPAS as $et => $nome) {
                $funil[] = ['etapa' => $et, 'nome' => $nome, 'qtd' => $etapas[$et], 'da_anterior' => $anterior === null ? null : a10Pct($etapas[$et], $anterior)];
                $anterior = $etapas[$et];
            }

            // leads parados (todos em andamento, não só os do período)
            $sp = $pdo->prepare("SELECT f.id, f.nome, f.telefone, f.etapa, f.etapa_em, f.proximo_contato, f.responsavel_usuario_id, f.conversa_id, f.plano,
                                        DATEDIFF(NOW(), f.etapa_em) AS dias
                                   FROM chat_funil f WHERE f.etapa NOT IN ('fechado', 'perdido') AND f.etapa_em < NOW() - INTERVAL {$parados} DAY
                                  ORDER BY f.etapa_em LIMIT 200");
            $sp->execute();
            $listaParados = [];
            foreach ($sp->fetchAll() as $p) {
                $q = $quem($p);
                $equipe[$q['chave']] ??= ['chave' => $q['chave'], 'nome' => $q['nome'], 'leads' => 0, 'andamento' => 0, 'fechados' => 0, 'perdidos' => 0, 'valor' => 0.0, 'dias_soma' => 0.0, 'parados' => 0];
                $equipe[$q['chave']]['parados']++;
                $listaParados[] = ['id' => (int) $p['id'], 'nome' => $p['nome'], 'telefone' => $p['telefone'], 'etapa' => $p['etapa'], 'plano' => $p['plano'],
                    'dias' => (int) $p['dias'], 'proximo_contato' => $p['proximo_contato'], 'responsavel' => $q['nome']];
            }

            // tempo até assumir a conversa (atendimentos das conversas dos leads do período)
            $assumir = [];
            $convs = array_values(array_unique(array_filter(array_map(fn($c) => $c['conversa_id'] !== null && $noPeriodo($c['criado_em']) ? (int) $c['conversa_id'] : 0, $cards))));
            if ($convs) {
                try {
                    $sa = $pdo->prepare('SELECT a.responsavel_usuario_id AS u, AVG(TIMESTAMPDIFF(SECOND, a.aberto_em, a.atribuido_em)) AS s, COUNT(*) AS n
                                           FROM chat_atendimentos a WHERE a.conversa_id IN (' . implode(',', $convs) . ') AND a.atribuido_em IS NOT NULL
                                            AND a.responsavel_usuario_id IS NOT NULL AND a.aberto_em BETWEEN :i AND :f GROUP BY a.responsavel_usuario_id');
                    $sa->execute([':i' => $ini, ':f' => $fim]);
                    foreach ($sa->fetchAll() as $r) {
                        $assumir['u' . (int) $r['u']] = (int) round((float) $r['s'] / 60);
                    }
                } catch (PDOException $e) {
                    error_log('[aurora_10] tempo até assumir: ' . $e->getMessage());
                }
            }

            $linhasEquipe = [];
            foreach ($equipe as $k => $e) {
                $linhasEquipe[] = [
                    'chave' => $k, 'nome' => $e['nome'], 'leads' => $e['leads'], 'andamento' => $e['andamento'], 'fechados' => $e['fechados'],
                    'perdidos' => $e['perdidos'], 'conversao' => a10Pct($e['fechados'], $e['leads']), 'valor' => round($e['valor'], 2),
                    'dias_ate_fechar' => $e['fechados'] > 0 ? round($e['dias_soma'] / $e['fechados'], 1) : null,
                    'minutos_ate_assumir' => $assumir[$k] ?? null, 'parados' => $e['parados'],
                ];
            }
            usort($linhasEquipe, fn($a, $b) => [$b['fechados'], $b['leads']] <=> [$a['fechados'], $a['leads']]);
            $linhasCanais = array_values(array_map(fn($c) => $c + ['conversao' => a10Pct($c['fechados'], $c['leads']), 'valor' => round($c['valor'], 2)], $canais));
            usort($linhasCanais, fn($a, $b) => $b['leads'] <=> $a['leads']);
            $perdas = array_values($perdas);
            usort($perdas, fn($a, $b) => $b['qtd'] <=> $a['qtd']);

            msgOk([
                'periodo' => ['de' => $de, 'ate' => $ate, 'parados' => $parados],
                'resumo' => ['leads' => $entraram, 'fechados' => $fechados, 'perdidos' => $perdidos, 'valor' => round($valor, 2),
                    'conversao' => a10Pct($etapas['fechado'], $entraram), 'dias_ate_fechar' => $tempos ? round(array_sum($tempos) / count($tempos), 1) : null,
                    'parados' => count($listaParados)],
                'funil' => $funil,
                'canais' => $linhasCanais,
                'equipe' => $linhasEquipe,
                'perdas' => $perdas,
                'parados' => $listaParados,
                'nomes_canais' => A10_CANAIS,
                'tem_canal' => $temCanal,
            ]);

        default:
            msgErro('Ação desconhecida.', 404);
    }
} catch (PDOException $e) {
    error_log('[aurora_10] ' . $e->getMessage());
    msgErro('Erro no banco de dados.', 500);
}
