<?php
/**
 * fin_cielo.php — Financeiro · etapa 3: cartões a receber e conferência com a Cielo.                         12/11/2026
 * Usa as funções do fin_base.php (mesmo login, CORS e regras; por enquanto só a Gestão) e a biblioteca fin_receber_origens.php.
 *
 * Cartão a receber (fin_cartao_receber) = o equivalente à REC da Unymos: nasce na baixa em cartão (contas a receber, Tesouraria,
 * cartão passado na OS e pedidos do site), uma linha por parcela, já com a taxa cadastrada. A conferência tem 2 etapas:
 *   1) venda × arquivo de vendas da Cielo, pelo NSU (sem NSU: mesma máquina, mesmo dia e mesmo valor) → CONFERIDO ou DIVERGENTE;
 *   2) depósito diário da Cielo no Banco do Brasil (extrato) quita o lote do dia → DEPOSITADO.
 *
 * GET  ?action=cartoes&sit=pendentes|a_conferir|conferido|divergente|depositado|cancelado|todos&canal=&td=venda|previsao&de=&ate=&pagina=&pp=
 * GET  ?action=conferencia&de=&ate=           → vendas (Cielo × sistema), depósitos por dia (previsto × extrato do BB) e taxas
 * GET  ?action=taxas                           → taxas cadastradas
 * POST ?action=importar     multipart: arquivo (CSV de vendas exportado do site da Cielo; ignora as não aprovadas)
 * POST ?action=casar                           → casa de novo as vendas da Cielo com os cartões a receber
 * POST ?action=ligar        { cartao_ids: [..], cielo_venda_id }   casa à mão
 * POST ?action=depositar    { data, extrato_id? }    marca como depositado o lote com previsão nessa data (e concilia a linha do extrato)
 * POST ?action=taxa         { id?, canal, bandeira, modalidade, pct, prazo_dias, ativo }
 *
 * O arquivo da Cielo não traz número de cartão nem nome do portador. Nada é apagado; tudo vai para o fin_log.
 */
define('FIN_BASE_SO_FUNCOES', true);
define('FIN_BASE_PAGINAS', ['contas-receber-gestao']); // 17/11/2026: uma chave por tela: cartões e Cielo são da parte de gestão do contas a receber
require_once __DIR__ . '/fin_base.php';
require_once __DIR__ . '/fin_receber_origens.php';

/** Máquinas e e-commerce da Cielo (final do número lógico / estabelecimento) → canal. */
const FC_CANAIS = [
    'term' => ['423' => 'MAQUINA_ESCRITORIO', '424' => 'MAQUINA_OS'],
    'estab' => ['2897038882' => 'SITE'],
];
const FC_CANAL_NOME = ['MAQUINA_ESCRITORIO' => 'Máquina …423 · escritório', 'MAQUINA_OS' => 'Máquina …424 · OS', 'SITE' => 'Site · coroas'];

function fcSemAcento(string $s): string
{
    $s = mb_strtolower(trim($s));
    return strtr($s, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'é' => 'e', 'ê' => 'e', 'í' => 'i', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ú' => 'u', 'ç' => 'c', 'º' => '', '°' => '']);
}

function fcNum(string $s): ?float
{
    $s = trim(str_replace(['R$', ' ', "\u{00A0}", '%'], '', $s));
    if ($s === '' || $s === '-') return null;
    if (strpos($s, ',') !== false) $s = str_replace(',', '.', str_replace('.', '', $s));
    return is_numeric($s) ? round((float) $s, 2) : null;
}

function fcData(string $s): ?string
{
    $s = trim($s);
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})/', $s, $m)) return "{$m[3]}-{$m[2]}-{$m[1]}";
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $s, $m)) return "{$m[1]}-{$m[2]}-{$m[3]}";
    return null;
}

function fcCanal(string $estab, string $terminal): string
{
    $estab = preg_replace('/\D/', '', $estab);
    if (isset(FC_CANAIS['estab'][$estab])) return FC_CANAIS['estab'][$estab];
    $t = preg_replace('/\D/', '', $terminal);
    $fim = substr($t, -3);
    if (isset(FC_CANAIS['term'][$fim])) return FC_CANAIS['term'][$fim];
    if ($terminal !== '' && preg_match('/[a-z]/i', $terminal)) return 'SITE';   // e-commerce: "ECO77777" etc.
    return 'MAQUINA_ESCRITORIO';
}

function fcModalidade(string $forma, int $parcelas): string
{
    $f = fcSemAcento($forma);
    if (strpos($f, 'pix') !== false) return 'PIX';
    if (strpos($f, 'debito') !== false) return 'DEBITO';
    if (strpos($f, 'parcel') !== false || $parcelas > 1) return 'PARCELADO';
    return 'CREDITO';
}

/** Lê o CSV de vendas da Cielo. Devolve [linhas aprovadas, ignoradas]. */
function fcLerCsv(string $txt): array
{
    if (!mb_check_encoding($txt, 'UTF-8')) $txt = mb_convert_encoding($txt, 'UTF-8', 'Windows-1252');
    $txt = preg_replace('/^\xEF\xBB\xBF/', '', $txt);
    $linhas = preg_split('/\r\n|\r|\n/', $txt);
    $ih = null;
    foreach ($linhas as $i => $l) {
        if (preg_match('/nsu/i', $l) && (substr_count($l, ';') + substr_count($l, ',') + substr_count($l, "\t")) >= 3) { $ih = $i; break; }
    }
    if ($ih === null) finResp(true, 'Não achei o cabeçalho do arquivo (coluna NSU). Exporte as vendas da Cielo em CSV.', null, 400);
    $h = $linhas[$ih];
    $sep = substr_count($h, ';') >= substr_count($h, ',') ? (substr_count($h, "\t") > substr_count($h, ';') ? "\t" : ';') : ',';
    $cab = array_map(fn($c) => fcSemAcento(trim($c, " \"'")), str_getcsv($h, $sep));
    $achar = function (array $tem, array $nao = []) use ($cab): ?int {
        foreach ($cab as $i => $c) {
            $ok = true;
            foreach ($tem as $t) if (strpos($c, $t) === false) { $ok = false; break; }
            foreach ($nao as $t) if (strpos($c, $t) !== false) { $ok = false; break; }
            if ($ok) return $i;
        }
        return null;
    };
    $col = [
        'data' => $achar(['data', 'venda']) ?? $achar(['data'], ['previs', 'pagamento', 'credito']),
        'hora' => $achar(['hora']),
        'estab' => $achar(['estabelecimento']) ?? $achar(['ec']),
        'term' => $achar(['maquina']) ?? $achar(['terminal']) ?? $achar(['logico']) ?? $achar(['pos']),
        'nsu' => $achar(['nsu']),
        'aut' => $achar(['autoriza']),
        'tid' => $achar(['tid']),
        'ped' => $achar(['pedido']),
        'band' => $achar(['bandeira']),
        'forma' => $achar(['forma', 'pagamento']) ?? $achar(['produto']) ?? $achar(['modalidade']) ?? $achar(['tipo']),
        'parc' => $achar(['parcela'], ['valor']),
        'bruto' => $achar(['valor', 'bruto']) ?? $achar(['valor', 'venda']),
        'taxa' => $achar(['valor', 'taxa']) ?? $achar(['valor', 'descont']) ?? $achar(['taxa'], ['%', 'mdr']),
        'liq' => $achar(['liquido']),
        'prev' => $achar(['previs']) ?? $achar(['data', 'pagamento']) ?? $achar(['data', 'credito']),
        'status' => $achar(['status']) ?? $achar(['situa']),
    ];
    if ($col['nsu'] === null || $col['data'] === null || $col['bruto'] === null) {
        finResp(true, 'O arquivo não tem as colunas esperadas (data da venda, NSU e valor bruto).', null, 400);
    }
    $v = fn(array $r, string $k) => $col[$k] !== null && isset($r[$col[$k]]) ? trim((string) $r[$col[$k]], " \"'") : '';
    $out = [];
    $ign = 0;
    for ($i = $ih + 1; $i < count($linhas); $i++) {
        if (trim($linhas[$i]) === '') continue;
        $r = str_getcsv($linhas[$i], $sep);
        $nsu = froNsu($v($r, 'nsu'));
        $data = fcData($v($r, 'data'));
        $bruto = fcNum($v($r, 'bruto'));
        if ($nsu === '' || !$data || $bruto === null) { $ign++; continue; }
        $st = fcSemAcento($v($r, 'status'));
        if ($st !== '' && (strpos($st, 'nao aprov') !== false || strpos($st, 'negad') !== false || strpos($st, 'cancel') !== false || strpos($st, 'desfeit') !== false)) { $ign++; continue; }
        $parc = max(1, (int) preg_replace('/\D/', '', $v($r, 'parc')) ?: 1);
        $forma = $v($r, 'forma');
        if (preg_match('/(\d+)\s*x/i', $forma, $m)) $parc = max($parc, (int) $m[1]);
        $liq = fcNum($v($r, 'liq'));
        $taxa = fcNum($v($r, 'taxa'));
        if ($taxa !== null) $taxa = abs($taxa);
        if ($taxa === null && $liq !== null) $taxa = round($bruto - $liq, 2);
        if ($liq === null) $liq = round($bruto - (float) $taxa, 2);
        $estab = preg_replace('/\D/', '', $v($r, 'estab'));
        $term = $v($r, 'term');
        $out[] = [
            'estab' => $estab !== '' ? $estab : 'CIELO', 'term' => mb_substr($term, 0, 20), 'data' => $data,
            'hora' => preg_match('/^\d{1,2}:\d{2}/', $v($r, 'hora')) ? substr($v($r, 'hora'), 0, 8) : null, 'nsu' => $nsu,
            'aut' => mb_substr($v($r, 'aut'), 0, 20) ?: null, 'tid' => mb_substr($v($r, 'tid'), 0, 60) ?: null, 'ped' => mb_substr($v($r, 'ped'), 0, 40) ?: null,
            'band' => froBandeira($v($r, 'band')), 'mod' => fcModalidade($forma, $parc), 'parc' => $parc, 'bruto' => $bruto, 'taxa' => (float) $taxa, 'liq' => (float) $liq,
            'prev' => fcData($v($r, 'prev')), 'status' => mb_substr($v($r, 'status') ?: 'Aprovada', 0, 30), 'canal' => fcCanal($estab, $term),
        ];
    }
    return [$out, $ign];
}

/** Casa as vendas da Cielo ainda soltas com os cartões a receber. Devolve quantas casou. */
function fcCasar(PDO $pdo): array
{
    $vendas = $pdo->query('SELECT v.* FROM fin_cielo_venda v WHERE NOT EXISTS (SELECT 1 FROM fin_cartao_receber c WHERE c.cielo_venda_id = v.id) ORDER BY v.data_venda, v.id')->fetchAll();
    $porNsu = $pdo->prepare("SELECT * FROM fin_cartao_receber WHERE nsu = ? AND cielo_venda_id IS NULL AND situacao <> 'CANCELADO' AND data_venda BETWEEN ? AND ? ORDER BY parcela_num");
    $semNsu = $pdo->prepare("SELECT * FROM fin_cartao_receber WHERE nsu = '' AND cielo_venda_id IS NULL AND situacao <> 'CANCELADO' AND canal = ? AND data_venda BETWEEN ? AND ?");
    $upd = $pdo->prepare('UPDATE fin_cartao_receber SET cielo_venda_id = ?, nsu = ?, autorizacao = COALESCE(autorizacao, ?), bandeira = COALESCE(?, bandeira), modalidade = ?,
                                 taxa = ?, liquido = ?, previsao = COALESCE(?, previsao), situacao = ?, conferido_em = NOW() WHERE id = ?');
    $ok = $div = 0;
    foreach ($vendas as $v) {
        $de = date('Y-m-d', strtotime($v['data_venda'] . ' -3 days'));
        $ate = date('Y-m-d', strtotime($v['data_venda'] . ' +3 days'));
        $porNsu->execute([$v['nsu'], $de, $ate]);
        $cs = $porNsu->fetchAll();
        if (!$cs) {
            // sem NSU (cartão passado na OS): mesma máquina, mesmo dia, mesmo valor e só uma opção
            $semNsu->execute([fcCanal((string) $v['estabelecimento'], (string) $v['terminal']), $v['data_venda'], $v['data_venda']]);
            $cand = [];
            $grupos = [];
            foreach ($semNsu->fetchAll() as $c) {
                $k = ($c['baixa_id'] ?? '') . '|' . ($c['os_pagamento_id'] ?? '') . '|' . $c['data_venda'];
                $grupos[$k][] = $c;
            }
            foreach ($grupos as $g) {
                if (abs(array_sum(array_column($g, 'bruto')) - (float) $v['bruto']) <= 0.01) $cand[] = $g;
            }
            if (count($cand) !== 1) continue;
            $cs = $cand[0];
        }
        $soma = round(array_sum(array_map(fn($c) => (float) $c['bruto'], $cs)), 2);
        $sit = abs($soma - (float) $v['bruto']) <= 0.05 ? 'CONFERIDO' : 'DIVERGENTE';
        $n = count($cs);
        $taxaTot = (float) $v['taxa'];
        $acum = 0.0;
        foreach ($cs as $i => $c) {
            $tx = $i === $n - 1 ? round($taxaTot - $acum, 2) : round($taxaTot * (float) $c['bruto'] / max(0.01, (float) $v['bruto']), 2);
            $acum += $tx;
            $prev = (int) $c['parcela_num'] === 1 && $v['previsao'] ? $v['previsao'] : null;
            $upd->execute([(int) $v['id'], $v['nsu'], $v['autorizacao'], $v['bandeira'], $v['modalidade'], $tx, round((float) $c['bruto'] - $tx, 2), $prev, $sit, (int) $c['id']]);
        }
        $sit === 'CONFERIDO' ? $ok++ : $div++;
    }
    return ['conferidos' => $ok, 'divergentes' => $div];
}

$action = (string) ($_GET['action'] ?? '');

try {
    $pdo = finPdo();
    if (!froPronto($pdo) || !froTabela($pdo, 'fin_cielo_venda')) {
        finResp(true, 'Falta rodar o SQL da etapa 3 do financeiro (contas a receber).', null, 503);
    }
    $hoje = date('Y-m-d');

    if ($metodo === 'GET') {
        if ($action === 'cartoes') {
            froSincronizar($pdo, $euId);
            $w = ['1 = 1'];
            $p = [];
            $sit = (string) ($_GET['sit'] ?? 'pendentes');
            $map = ['a_conferir' => 'A_CONFERIR', 'conferido' => 'CONFERIDO', 'divergente' => 'DIVERGENTE', 'depositado' => 'DEPOSITADO', 'cancelado' => 'CANCELADO'];
            if (isset($map[$sit])) { $w[] = 'c.situacao = ?'; $p[] = $map[$sit]; }
            elseif ($sit !== 'todos') { $w[] = "c.situacao IN ('A_CONFERIR','CONFERIDO','DIVERGENTE')"; }
            $canal = (string) ($_GET['canal'] ?? '');
            if (isset(FC_CANAL_NOME[$canal])) { $w[] = 'c.canal = ?'; $p[] = $canal; }
            $col = ($_GET['td'] ?? '') === 'previsao' ? 'c.previsao' : 'c.data_venda';
            if ($de = finData($_GET['de'] ?? null, 'Data inicial', false)) { $w[] = "{$col} >= ?"; $p[] = $de; }
            if ($ate = finData($_GET['ate'] ?? null, 'Data final', false)) { $w[] = "{$col} <= ?"; $p[] = $ate; }
            $q = trim((string) ($_GET['busca'] ?? ''));
            if ($q !== '') { $w[] = '(c.nsu = ? OR c.autorizacao = ?)'; $p[] = froNsu($q) ?: $q; $p[] = $q; }
            $where = implode(' AND ', $w);
            $st = $pdo->prepare("SELECT COUNT(*) n, COALESCE(SUM(c.bruto), 0) b, COALESCE(SUM(c.taxa), 0) t, COALESCE(SUM(COALESCE(c.liquido, c.bruto)), 0) l FROM fin_cartao_receber c WHERE {$where}");
            $st->execute($p);
            $tot = $st->fetch();
            $pp = max(10, min(500, (int) ($_GET['pp'] ?? 100)));
            $pag = max(0, (int) ($_GET['pagina'] ?? 0));
            $st = $pdo->prepare("SELECT c.*, t.descricao AS titulo, t.origem FROM fin_cartao_receber c LEFT JOIN fin_titulo t ON t.id = c.titulo_id
                                  WHERE {$where} ORDER BY c.previsao, c.data_venda, c.id LIMIT {$pp} OFFSET " . ($pag * $pp));
            $st->execute($p);
            $linhas = array_map(fn($c) => ['id' => (int) $c['id'], 'titulo_id' => $c['titulo_id'] !== null ? (int) $c['titulo_id'] : null, 'titulo' => $c['titulo'],
                'canal' => $c['canal'], 'canal_nome' => FC_CANAL_NOME[$c['canal']] ?? $c['canal'], 'nsu' => $c['nsu'], 'autorizacao' => $c['autorizacao'], 'bandeira' => $c['bandeira'],
                'modalidade' => $c['modalidade'], 'parcela' => $c['parcela_num'] . '/' . $c['parcela_total'], 'data_venda' => $c['data_venda'], 'previsao' => $c['previsao'],
                'bruto' => (float) $c['bruto'], 'taxa' => $c['taxa'] !== null ? (float) $c['taxa'] : null, 'liquido' => $c['liquido'] !== null ? (float) $c['liquido'] : null,
                'situacao' => $c['situacao'], 'cielo_venda_id' => $c['cielo_venda_id'] !== null ? (int) $c['cielo_venda_id'] : null], $st->fetchAll());
            // agenda: o que a Cielo deve depositar nos próximos dias
            $ag = $pdo->query("SELECT previsao, COUNT(*) n, SUM(COALESCE(liquido, bruto)) v FROM fin_cartao_receber
                                WHERE situacao IN ('A_CONFERIR','CONFERIDO','DIVERGENTE') AND previsao IS NOT NULL GROUP BY previsao ORDER BY previsao LIMIT 60")->fetchAll();
            finResp(false, 'ok', ['linhas' => $linhas, 'pagina' => $pag, 'pp' => $pp,
                'total' => ['n' => (int) $tot['n'], 'bruto' => round((float) $tot['b'], 2), 'taxa' => round((float) $tot['t'], 2), 'liquido' => round((float) $tot['l'], 2)],
                'agenda' => array_map(fn($a) => ['data' => $a['previsao'], 'n' => (int) $a['n'], 'valor' => round((float) $a['v'], 2), 'atrasado' => $a['previsao'] < $hoje], $ag),
                'canais' => FC_CANAL_NOME]);
        }

        if ($action === 'conferencia') {
            $de = finData($_GET['de'] ?? null, 'Data inicial', false) ?? date('Y-m-d', strtotime($hoje . ' -30 days'));
            $ate = finData($_GET['ate'] ?? null, 'Data final', false) ?? $hoje;
            // 1) vendas da Cielo × sistema
            $st = $pdo->prepare("SELECT v.*, (SELECT COUNT(*) FROM fin_cartao_receber c WHERE c.cielo_venda_id = v.id) AS casados,
                                        (SELECT MIN(c.situacao) FROM fin_cartao_receber c WHERE c.cielo_venda_id = v.id) AS sit
                                   FROM fin_cielo_venda v WHERE v.data_venda BETWEEN ? AND ? ORDER BY v.data_venda, v.hora, v.id");
            $st->execute([$de, $ate]);
            $vendas = array_map(fn($v) => ['id' => (int) $v['id'], 'data' => $v['data_venda'], 'hora' => $v['hora'] ? substr($v['hora'], 0, 5) : null, 'nsu' => $v['nsu'],
                'canal' => FC_CANAL_NOME[fcCanal((string) $v['estabelecimento'], (string) $v['terminal'])] ?? '', 'bandeira' => $v['bandeira'], 'modalidade' => $v['modalidade'],
                'parcelas' => (int) $v['parcelas'], 'bruto' => (float) $v['bruto'], 'taxa' => (float) $v['taxa'], 'liquido' => (float) $v['liquido'], 'previsao' => $v['previsao'], 'pedido' => $v['pedido'],
                'situacao' => (int) $v['casados'] === 0 ? 'SO_CIELO' : ($v['sit'] === 'DIVERGENTE' ? 'DIVERGENTE' : 'CASADA')], $st->fetchAll());
            $st = $pdo->prepare("SELECT c.id, c.canal, c.nsu, c.bandeira, c.modalidade, c.data_venda, SUM(c.bruto) bruto, COUNT(*) parcelas, MIN(t.descricao) titulo
                                   FROM fin_cartao_receber c LEFT JOIN fin_titulo t ON t.id = c.titulo_id
                                  WHERE c.cielo_venda_id IS NULL AND c.situacao <> 'CANCELADO' AND c.data_venda BETWEEN ? AND ?
                                  GROUP BY c.canal, c.nsu, c.data_venda, COALESCE(c.baixa_id, 0), COALESCE(c.titulo_id, 0) ORDER BY c.data_venda");
            $st->execute([$de, $ate]);
            $soSistema = array_map(fn($c) => ['id' => (int) $c['id'], 'canal' => FC_CANAL_NOME[$c['canal']] ?? $c['canal'], 'nsu' => $c['nsu'], 'bandeira' => $c['bandeira'],
                'modalidade' => $c['modalidade'], 'data' => $c['data_venda'], 'bruto' => round((float) $c['bruto'], 2), 'parcelas' => (int) $c['parcelas'], 'titulo' => $c['titulo']], $st->fetchAll());
            // 2) depósitos por dia: previsto (Cielo) × extrato do Banco do Brasil (linhas com CIELO)
            $st = $pdo->prepare("SELECT previsao d, SUM(liquido) v, COUNT(*) n FROM fin_cielo_venda WHERE previsao BETWEEN ? AND ? GROUP BY previsao ORDER BY previsao");
            $st->execute([$de, date('Y-m-d', strtotime($ate . ' +35 days'))]);
            $prev = [];
            foreach ($st->fetchAll() as $r) $prev[$r['d']] = ['previsto' => round((float) $r['v'], 2), 'vendas' => (int) $r['n']];
            $ext = [];
            if (froTabela($pdo, 'fin_extrato')) {
                $st = $pdo->prepare("SELECT e.id, e.data, e.valor, e.situacao, e.descricao FROM fin_extrato e JOIN fin_conta c ON c.id = e.conta_id
                                      WHERE c.banco = 'Banco do Brasil' AND e.valor > 0 AND UPPER(e.descricao) LIKE '%CIELO%' AND e.data BETWEEN ? AND ?");
                $st->execute([$de, date('Y-m-d', strtotime($ate . ' +35 days'))]);
                foreach ($st->fetchAll() as $e) {
                    $ext[$e['data']]['valor'] = round(($ext[$e['data']]['valor'] ?? 0) + (float) $e['valor'], 2);
                    $ext[$e['data']]['ids'][] = (int) $e['id'];
                    $ext[$e['data']]['conciliado'] = ($ext[$e['data']]['conciliado'] ?? true) && $e['situacao'] !== 'PENDENTE';
                }
            }
            $dias = array_unique(array_merge(array_keys($prev), array_keys($ext)));
            sort($dias);
            $depositos = array_map(fn($d) => ['data' => $d, 'previsto' => $prev[$d]['previsto'] ?? 0.0, 'vendas' => $prev[$d]['vendas'] ?? 0, 'extrato' => $ext[$d]['valor'] ?? null,
                'extrato_ids' => $ext[$d]['ids'] ?? [], 'conciliado' => $ext[$d]['conciliado'] ?? false,
                'diferenca' => isset($ext[$d]) ? round($ext[$d]['valor'] - ($prev[$d]['previsto'] ?? 0), 2) : null, 'futuro' => $d > $hoje], $dias);
            // 3) taxas cobradas × cadastradas
            $st = $pdo->prepare("SELECT estabelecimento, terminal, bandeira, modalidade, COUNT(*) n, SUM(bruto) b, SUM(taxa) t FROM fin_cielo_venda
                                  WHERE data_venda BETWEEN ? AND ? GROUP BY estabelecimento, terminal, bandeira, modalidade");
            $st->execute([$de, $ate]);
            $tx = [];
            foreach ($st->fetchAll() as $r) {
                $canal = fcCanal((string) $r['estabelecimento'], (string) $r['terminal']);
                $k = ($canal === 'SITE' ? 'SITE' : 'MAQUINA') . '|' . $r['bandeira'] . '|' . $r['modalidade'];
                $tx[$k] = $tx[$k] ?? ['canal' => $canal === 'SITE' ? 'Site' : 'Máquinas', 'bandeira' => $r['bandeira'], 'modalidade' => $r['modalidade'], 'n' => 0, 'bruto' => 0.0, 'taxa' => 0.0,
                    'cadastrada' => (froTaxa($pdo, $canal, $r['bandeira'], (string) $r['modalidade'])['pct'] ?? null)];
                $tx[$k]['n'] += (int) $r['n'];
                $tx[$k]['bruto'] = round($tx[$k]['bruto'] + (float) $r['b'], 2);
                $tx[$k]['taxa'] = round($tx[$k]['taxa'] + (float) $r['t'], 2);
            }
            foreach ($tx as &$t) $t['cobrada'] = $t['bruto'] > 0 ? round($t['taxa'] / $t['bruto'] * 100, 2) : null;
            unset($t);
            $ult = $pdo->query('SELECT MAX(criado_em) FROM fin_cielo_venda')->fetchColumn();
            finResp(false, 'ok', ['de' => $de, 'ate' => $ate, 'vendas' => $vendas, 'so_sistema' => $soSistema, 'depositos' => $depositos, 'taxas' => array_values($tx),
                'ultima_importacao' => $ult ?: null,
                'resumo' => ['cielo' => count($vendas), 'casadas' => count(array_filter($vendas, fn($v) => $v['situacao'] === 'CASADA')),
                    'divergentes' => count(array_filter($vendas, fn($v) => $v['situacao'] === 'DIVERGENTE')), 'so_cielo' => count(array_filter($vendas, fn($v) => $v['situacao'] === 'SO_CIELO')),
                    'so_sistema' => count($soSistema)]]);
        }

        if ($action === 'taxas') {
            $r = $pdo->query('SELECT * FROM fin_cartao_taxa ORDER BY canal, modalidade, bandeira')->fetchAll();
            finResp(false, 'ok', array_map(fn($t) => ['id' => (int) $t['id'], 'canal' => $t['canal'], 'bandeira' => $t['bandeira'], 'modalidade' => $t['modalidade'],
                'pct' => (float) $t['pct'], 'prazo_dias' => (int) $t['prazo_dias'], 'ativo' => (int) $t['ativo'] === 1], $r));
        }
        finResp(true, 'Ação inválida.', null, 400);
    }

    if ($metodo !== 'POST') {
        finResp(true, 'Ação inválida.', null, 400);
    }

    if ($action === 'importar') {
        $f = $_FILES['arquivo'] ?? null;
        if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) finResp(true, 'Envie o arquivo CSV da Cielo.', null, 400);
        if ((int) $f['size'] > 8 * 1024 * 1024) finResp(true, 'Arquivo maior que 8 MB: exporte um período menor.', null, 400);
        [$linhas, $ign] = fcLerCsv((string) file_get_contents($f['tmp_name']));
        if (!$linhas) finResp(true, 'Nenhuma venda aprovada no arquivo.', null, 400);
        $lote = date('YmdHis') . '-' . substr(bin2hex(random_bytes(3)), 0, 6);
        $pdo->beginTransaction();
        $ins = $pdo->prepare('INSERT INTO fin_cielo_venda (estabelecimento, terminal, data_venda, hora, nsu, autorizacao, tid, pedido, bandeira, modalidade, parcelas, bruto, taxa, liquido,
                                                           previsao, status, lote, importado_por)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                              ON DUPLICATE KEY UPDATE taxa = VALUES(taxa), liquido = VALUES(liquido), previsao = COALESCE(VALUES(previsao), previsao), status = VALUES(status),
                                                      bandeira = COALESCE(VALUES(bandeira), bandeira), pedido = COALESCE(VALUES(pedido), pedido)');
        $novas = 0;
        foreach ($linhas as $l) {
            $ins->execute([$l['estab'], $l['term'] ?: null, $l['data'], $l['hora'], $l['nsu'], $l['aut'], $l['tid'], $l['ped'], $l['band'], $l['mod'], $l['parc'],
                $l['bruto'], $l['taxa'], $l['liq'], $l['prev'], $l['status'], $lote, $euId ?: null]);
            if ($ins->rowCount() === 1) $novas++;
        }
        $c = fcCasar($pdo);
        finLog($pdo, 'fin_cielo_venda', null, 'importou', ['lote' => $lote, 'linhas' => count($linhas), 'novas' => $novas, 'ignoradas' => $ign] + $c);
        $pdo->commit();
        finResp(false, count($linhas) . ' venda(s) lida(s) (' . $novas . ' nova(s)' . ($ign ? ', ' . $ign . ' ignorada(s): não aprovadas ou incompletas' : '') . '). '
            . $c['conferidos'] . ' conferida(s) com o sistema' . ($c['divergentes'] ? ', ' . $c['divergentes'] . ' com diferença de valor' : '') . '.', ['novas' => $novas] + $c);
    }

    $in = finEntrada();
    switch ($action) {
        case 'casar': {
            froSincronizar($pdo, $euId, true);
            $pdo->beginTransaction();
            $c = fcCasar($pdo);
            $pdo->commit();
            finResp(false, $c['conferidos'] . ' conferida(s)' . ($c['divergentes'] ? ', ' . $c['divergentes'] . ' com diferença' : '') . '.', $c);
        }

        case 'ligar': {
            $vid = finId($in['cielo_venda_id'] ?? null) ?? finResp(true, 'Escolha a venda da Cielo.', null, 400);
            $ids = array_values(array_unique(array_filter(array_map('intval', (array) ($in['cartao_ids'] ?? [])))));
            if (!$ids) finResp(true, 'Escolha o cartão a receber.', null, 400);
            $st = $pdo->prepare('SELECT * FROM fin_cielo_venda WHERE id = ?');
            $st->execute([$vid]);
            $v = $st->fetch() ?: finResp(true, 'Venda da Cielo não encontrada.', null, 404);
            $pdo->beginTransaction();
            // se o cartão escolhido é parcela, liga todas as parcelas da mesma venda
            $todos = [];
            $sel = $pdo->prepare("SELECT * FROM fin_cartao_receber WHERE id = ? AND situacao <> 'CANCELADO'");
            $irm = $pdo->prepare("SELECT * FROM fin_cartao_receber WHERE situacao <> 'CANCELADO' AND data_venda = ? AND canal = ? AND nsu = ? AND COALESCE(baixa_id, 0) = ? AND COALESCE(titulo_id, 0) = ?");
            foreach ($ids as $cid) {
                $sel->execute([$cid]);
                $c = $sel->fetch();
                if (!$c) continue;
                $irm->execute([$c['data_venda'], $c['canal'], $c['nsu'], (int) $c['baixa_id'], (int) $c['titulo_id']]);
                foreach ($irm->fetchAll() as $x) $todos[(int) $x['id']] = $x;
            }
            if (!$todos) { $pdo->rollBack(); finResp(true, 'Cartão a receber não encontrado.', null, 404); }
            $soma = round(array_sum(array_map(fn($c) => (float) $c['bruto'], $todos)), 2);
            $sit = abs($soma - (float) $v['bruto']) <= 0.05 ? 'CONFERIDO' : 'DIVERGENTE';
            $n = count($todos);
            $acum = 0.0;
            $i = 0;
            $upd = $pdo->prepare('UPDATE fin_cartao_receber SET cielo_venda_id = ?, nsu = ?, bandeira = COALESCE(?, bandeira), taxa = ?, liquido = ?, situacao = ?, conferido_por = ?, conferido_em = NOW() WHERE id = ?');
            foreach ($todos as $c) {
                $i++;
                $tx = $i === $n ? round((float) $v['taxa'] - $acum, 2) : round((float) $v['taxa'] * (float) $c['bruto'] / max(0.01, (float) $v['bruto']), 2);
                $acum += $tx;
                $upd->execute([$vid, $v['nsu'], $v['bandeira'], $tx, round((float) $c['bruto'] - $tx, 2), $sit, $euId ?: null, (int) $c['id']]);
            }
            finLog($pdo, 'fin_cartao_receber', (int) array_key_first($todos), 'ligou_cielo', ['cielo_venda_id' => $vid, 'nsu' => $v['nsu'], 'situacao' => $sit]);
            $pdo->commit();
            finResp(false, $sit === 'CONFERIDO' ? 'Venda conferida.' : 'Ligado, mas com diferença de valor: ' . number_format($soma, 2, ',', '.') . ' no sistema × ' . number_format((float) $v['bruto'], 2, ',', '.') . ' na Cielo.');
        }

        case 'depositar': {
            $data = finData($in['data'] ?? null, 'Data do depósito');
            $extratoId = finId($in['extrato_id'] ?? null);
            $pdo->beginTransaction();
            $st = $pdo->prepare("SELECT id, liquido, bruto FROM fin_cartao_receber WHERE previsao = ? AND situacao IN ('A_CONFERIR','CONFERIDO','DIVERGENTE') FOR UPDATE");
            $st->execute([$data]);
            $cs = $st->fetchAll();
            if (!$cs) { $pdo->rollBack(); finResp(true, 'Não há cartão a receber previsto para esse dia.', null, 404); }
            $pdo->prepare("UPDATE fin_cartao_receber SET situacao = 'DEPOSITADO', extrato_id = ?, conferido_por = COALESCE(conferido_por, ?) WHERE previsao = ? AND situacao IN ('A_CONFERIR','CONFERIDO','DIVERGENTE')")
                ->execute([$extratoId, $euId ?: null, $data]);
            if ($extratoId && froTabela($pdo, 'fin_extrato')) {
                $pdo->prepare("UPDATE fin_extrato SET situacao = 'CONCILIADO', vinculo_tabela = 'fin_cartao_receber', vinculo_id = ?, conciliado_por = ?, conciliado_em = NOW() WHERE id = ? AND situacao = 'PENDENTE'")
                    ->execute([(int) $cs[0]['id'], $euId ?: null, $extratoId]);
            }
            $v = round(array_sum(array_map(fn($c) => (float) ($c['liquido'] ?? $c['bruto']), $cs)), 2);
            finLog($pdo, 'fin_cartao_receber', null, 'depositou', ['previsao' => $data, 'linhas' => count($cs), 'valor' => $v, 'extrato_id' => $extratoId]);
            $pdo->commit();
            finResp(false, count($cs) . ' cartão(ões) a receber quitado(s) pelo depósito de ' . date('d/m/Y', strtotime($data)) . ' (R$ ' . number_format($v, 2, ',', '.') . ').');
        }

        case 'taxa': {
            $canal = in_array($in['canal'] ?? '', ['MAQUINA', 'SITE'], true) ? $in['canal'] : finResp(true, 'Canal inválido.', null, 400);
            $mod = in_array($in['modalidade'] ?? '', ['DEBITO', 'CREDITO', 'PARCELADO', 'PIX'], true) ? $in['modalidade'] : finResp(true, 'Modalidade inválida.', null, 400);
            $band = $mod === 'PIX' ? 'Pix' : (froBandeira($in['bandeira'] ?? '') ?? finResp(true, 'Informe a bandeira.', null, 400));
            $pct = finNum($in['pct'] ?? null);
            if ($pct === null || $pct < 0 || $pct > 20) finResp(true, 'Informe a taxa em % (entre 0 e 20).', null, 400);
            $prazo = max(0, min(400, (int) ($in['prazo_dias'] ?? 30)));
            $ativo = !isset($in['ativo']) || !empty($in['ativo']) ? 1 : 0;
            $pdo->prepare('INSERT INTO fin_cartao_taxa (canal, bandeira, modalidade, pct, prazo_dias, ativo) VALUES (?, ?, ?, ?, ?, ?)
                           ON DUPLICATE KEY UPDATE pct = VALUES(pct), prazo_dias = VALUES(prazo_dias), ativo = VALUES(ativo)')
                ->execute([$canal, $band, $mod, $pct, $prazo, $ativo]);
            finLog($pdo, 'fin_cartao_taxa', null, 'gravou', ['canal' => $canal, 'bandeira' => $band, 'modalidade' => $mod, 'pct' => $pct, 'prazo' => $prazo, 'ativo' => $ativo]);
            finResp(false, 'Taxa gravada. Vale para os próximos cartões a receber.');
        }
    }
    finResp(true, 'Ação inválida.', null, 400);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[fin_cielo] ' . $e->getMessage() . ' @ ' . $e->getLine());
    finResp(true, 'Erro ao processar. Tente novamente.', null, 500);
}
