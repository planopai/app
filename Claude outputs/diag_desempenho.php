<?php
declare(strict_types=1);

/**
 * diag_desempenho.php — diagnóstico de velocidade do servidor (19/11/2026). SÓ LEITURA.
 *
 * Mostra: versão do PHP, OPcache (ligado? quanto acerta?), APCu, limites, carga do servidor e
 * quanto tempo leva para conectar ao banco e fazer consultas simples. NÃO mostra senhas nem dados.
 *
 * Uso: https://api.planoassistencialintegrado.com.br/diag_desempenho.php?chave=3a6303ae19207ff81538869c
 * Segurança: só responde com a chave acima e para de funcionar sozinho depois de 22/11/2026.
 * APAGUE o arquivo do servidor depois de usar.
 */

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

$inicio = microtime(true);
if (($_GET['chave'] ?? '') !== '3a6303ae19207ff81538869c' || time() > strtotime('2026-11-22 23:59:59')) {
    http_response_code(404);
    exit;
}

function ms(float $desde): string { return number_format((microtime(true) - $desde) * 1000, 1, ',', '') . ' ms'; }
function sn($v): string { return $v ? 'SIM' : 'NÃO'; }

$l = [];
$l[] = '=== PHP ===';
$l[] = 'Versão do PHP: ' . PHP_VERSION;
$l[] = 'Modo (SAPI): ' . PHP_SAPI;
$l[] = 'memory_limit: ' . ini_get('memory_limit') . ' · max_execution_time: ' . ini_get('max_execution_time') . ' s';
$l[] = 'realpath_cache_size: ' . ini_get('realpath_cache_size');

$l[] = '';
$l[] = '=== OPcache (guarda o PHP já compilado; sem ele, todo arquivo é recompilado a cada chamada) ===';
$opExt = extension_loaded('Zend OPcache');
$l[] = 'Extensão carregada: ' . sn($opExt);
$l[] = 'opcache.enable: ' . var_export(ini_get('opcache.enable'), true);
if ($opExt && function_exists('opcache_get_status')) {
    $st = @opcache_get_status(false);
    if (is_array($st)) {
        $l[] = 'Ligado agora: ' . sn($st['opcache_enabled'] ?? false);
        $m = $st['memory_usage'] ?? [];
        $e = $st['opcache_statistics'] ?? [];
        $l[] = 'Memória usada/livre: ' . round(($m['used_memory'] ?? 0) / 1048576, 1) . ' MB / ' . round(($m['free_memory'] ?? 0) / 1048576, 1) . ' MB';
        $l[] = 'Arquivos em cache: ' . ($e['num_cached_scripts'] ?? '?') . ' · acertos: ' . round((float)($e['opcache_hit_rate'] ?? 0), 1) . '%';
        $l[] = 'Reinícios por falta de memória: ' . ($e['oom_restarts'] ?? '?');
    } else {
        $l[] = 'Status: indisponível (OPcache desligado ou restrito pela hospedagem)';
    }
}
$l[] = 'opcache.memory_consumption: ' . ini_get('opcache.memory_consumption') . ' MB · max_accelerated_files: ' . ini_get('opcache.max_accelerated_files');
$l[] = 'opcache.validate_timestamps: ' . ini_get('opcache.validate_timestamps') . ' · revalidate_freq: ' . ini_get('opcache.revalidate_freq') . ' s';

$l[] = '';
$l[] = '=== APCu (cache em memória usado pelo coroas.php) ===';
$l[] = 'Extensão carregada: ' . sn(extension_loaded('apcu')) . ' · ligado: ' . sn(filter_var((string)ini_get('apc.enabled'), FILTER_VALIDATE_BOOLEAN));

$l[] = '';
$l[] = '=== Servidor ===';
if (function_exists('sys_getloadavg')) {
    $c = sys_getloadavg();
    $l[] = 'Carga (1/5/15 min): ' . implode(' / ', array_map(fn($x) => number_format((float)$x, 2, ',', ''), $c));
}
$l[] = 'Compressão gzip do PHP (zlib.output_compression): ' . var_export(ini_get('zlib.output_compression'), true);

$l[] = '';
$l[] = '=== Tempos ===';
$t = microtime(true);
$cfg = @include '/home2/pla48587/pai-chaves.php';
$l[] = 'Ler o arquivo de configuração: ' . ms($t);

if (is_array($cfg)) {
    try {
        $t = microtime(true);
        $pdo = new PDO(
            'mysql:host=' . ($cfg['db_host'] ?? '') . ';dbname=' . ($cfg['db_name'] ?? '') . ';charset=utf8mb4',
            (string)($cfg['db_user'] ?? ''), (string)($cfg['db_password'] ?? ''),
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $l[] = 'Conectar ao banco: ' . ms($t);

        $t = microtime(true);
        $pdo->query('SELECT 1')->fetchColumn();
        $l[] = 'Consulta mínima (SELECT 1): ' . ms($t);

        $t = microtime(true);
        $n = $pdo->query("SELECT COUNT(*) FROM sepultamentos WHERE (material_recolhido = 0 OR material_recolhido IS NULL)")->fetchColumn();
        $l[] = 'Contar atendimentos da lista: ' . ms($t) . " ({$n})";

        $t = microtime(true);
        $rows = $pdo->query("SELECT * FROM sepultamentos WHERE (material_recolhido = 0 OR material_recolhido IS NULL)")->fetchAll(PDO::FETCH_ASSOC);
        $l[] = 'Ler os atendimentos inteiros para o PHP (o que o listar faz hoje): ' . ms($t) . ' (' . count($rows) . ')';

        $t = microtime(true);
        $json = json_encode($rows, JSON_UNESCAPED_UNICODE);
        $l[] = 'Transformar em JSON: ' . ms($t) . ' (' . round(strlen((string)$json) / 1024) . ' KB)';
        unset($rows, $json);
    } catch (Throwable $e) {
        $l[] = 'Banco: erro ao conectar ou consultar (' . get_class($e) . ').';
    }
} else {
    $l[] = 'Arquivo de configuração não encontrado neste caminho.';
}

$l[] = '';
$l[] = 'Tempo total deste diagnóstico: ' . ms($inicio);
$l[] = '';
$l[] = 'Lembre: APAGUE este arquivo do servidor depois de usar.';

echo implode("\n", $l), "\n";
