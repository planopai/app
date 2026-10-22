<?php
/**
 * planos-novos.php — adesões de planos feitas pelo site (PHP 8.1+).
 * Versão 1.0 (22/10/2026). Fica na API: https://api.planoassistencialintegrado.com.br/planos-novos.php
 *
 * Quem chama o quê:
 *   Site (navegador, tela /adesao/)
 *     GET  ?acao=tabela                → valores e regras (mensalidade, dependentes, agregados)
 *     POST {"acao":"cadastrar", ...}   → grava o cadastro e devolve o código
 *   Site (servidor do WordPress/WooCommerce, cabeçalho X-PAI-Planos-Key)
 *     POST {"acao":"consultar_codigo","codigo":"..."}       → dados para montar o pedido
 *     POST {"acao":"pedido","codigo":"...","pedido":123}     → liga o pedido do WooCommerce
 *     POST {"acao":"pagamento","codigo":"...","pedido":123,"situacao":"pago|cancelado", ...}
 *          → marca pago (início da carência) e envia a notificação OneSignal
 *   App PAI (tela Novos planos, sessão do app + página 'novos-planos')
 *     GET  ?acao=me | ?acao=listar | ?acao=detalhar&id=
 *     POST {"acao":"contrato","id":1,"numero_contrato":"..."}
 *     POST {"acao":"situacao","id":1,"status":"cancelado|aguardando_pagamento|pago","motivo":"..."}
 *     POST {"acao":"observacao","id":1,"texto":"..."}
 *
 * Regras de quem entra (iguais ao simulador do site e aos Termos de Adesão):
 *   - LIGHT: dependentes sem custo (cônjuge, filhos solteiros até 35 anos, até 2 entre pai/mãe/sogro/sogra);
 *            agregados (demais): até 2, 20% da mensalidade cada.
 *   - FLEX : titular + até 9 pessoas de qualquer parentesco, sem custo por pessoa;
 *            mensalidade pela idade da pessoa mais velha.
 *   - PLUS : dependentes como o LIGHT; agregados até 9, os 2 primeiros sem custo, a partir do 3º 20% cada.
 *   - MAX  : como o PLUS (20% de R$ 150 = R$ 30).
 *   Filho(a) com mais de 35 anos completos passa a agregado. A partir da 3ª pessoa entre pai/mãe/sogro/sogra, agregado.
 *
 * pai-chaves.php: db_*, onesignal_app_id, onesignal_api_key (os mesmos das coroas) e
 *   'planos_novos_chave' => '<40+ caracteres>'  (a mesma no wp-config.php do site: PAI_PLANOS_CHAVE)
 *
 * Banco: tabela planos_novos (SQL aprovado em 22/10/2026).
 */

declare(strict_types=1);
date_default_timezone_set(getenv('PAI_TIMEZONE') ?: 'America/Sao_Paulo');

const PN_VERSAO = '1.0';
const PN_ACEITE_VERSAO = 'termos-2026-10-02/precos-2026-10-08';
const PN_APP_URL = 'https://pai.planoassistencialintegrado.com.br/novos-planos';
const PN_PAGINA = 'novos-planos';
const PN_MAX_BODY = 32768;

/* ---------------- CORS do sistema ---------------- */
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
header('X-Content-Type-Options: nosniff');

/* ---------------- Respostas ---------------- */
$GLOBALS['PN_RESPONDEU'] = false;

function pn_out(int $status, array $body): never
{
    $body += ['erro' => $status >= 400];
    http_response_code($status);
    $GLOBALS['PN_RESPONDEU'] = true;
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function pn_erro(int $status, string $msg, array $extra = []): never
{
    pn_out($status, ['erro' => true, 'msg' => $msg] + $extra);
}

function pn_log(string $msg): void
{
    error_log('[planos-novos.php] ' . $msg);
}

register_shutdown_function(static function (): void {
    if (!empty($GLOBALS['PN_RESPONDEU'])) return;
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') return;
    $e = error_get_last();
    pn_log('encerrado sem resposta: ' . (is_array($e) ? ($e['message'] . ' em ' . $e['file'] . ':' . $e['line']) : '-'));
    if (!headers_sent()) { http_response_code(500); header('Content-Type: application/json; charset=utf-8'); }
    echo '{"erro":true,"msg":"Falha interna. Tente novamente em instantes."}';
});

set_exception_handler(static function (Throwable $t): void {
    $msg = $t->getMessage();
    pn_log(get_class($t) . ': ' . $msg . ' em ' . $t->getFile() . ':' . $t->getLine());
    if ($t instanceof PDOException && str_contains($msg, 'planos_novos') && (str_contains($msg, "doesn't exist") || str_contains($msg, '1146'))) {
        pn_erro(500, 'A tabela planos_novos ainda não foi criada no banco.');
    }
    pn_erro(500, 'Não foi possível concluir agora. Tente novamente em instantes.');
});

/* ---------------- Configuração e banco ---------------- */
$PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';
if (!is_file($PAI_CHAVES_FILE) || !is_readable($PAI_CHAVES_FILE)) {
    pn_erro(500, 'Arquivo privado de configuração não encontrado.');
}
$PAI_CONFIG = require $PAI_CHAVES_FILE;
if (!is_array($PAI_CONFIG)) pn_erro(500, 'Arquivo privado de configuração inválido.');

function pn_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $c = $GLOBALS['PAI_CONFIG'];
    $pdo = new PDO(
        'mysql:host=' . trim((string)($c['db_host'] ?? 'localhost')) . ';dbname=' . trim((string)($c['db_name'] ?? '')) . ';charset=utf8mb4',
        trim((string)($c['db_user'] ?? '')),
        (string)($c['db_password'] ?? ''),
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
    );
    $pdo->exec("SET time_zone = '" . (new DateTime())->format('P') . "'");
    return $pdo;
}

/* ---------------- Tabela de valores e regras ---------------- */
/**
 * Valores em vigor desde 08/10/2026 (Manual 1.15, seção 4.2). Para mudar, ajuste aqui
 * ou em pai-chaves.php: 'planos_novos_precos' => ['LIGHT' => ['mensalidade' => 46, 'adesao' => 50], ...]
 */
function pn_tabela(): array
{
    $t = [
        'LIGHT' => ['nome' => 'LIGHT', 'adesao' => 50.0, 'mensalidade' => 46.0, 'agregados_max' => 2, 'agregados_sem_custo' => 0, 'pessoas_max' => 15],
        'FLEX'  => ['nome' => 'FLEX', 'adesao' => 50.0, 'faixas' => [[54, 48.0], [64, 57.0], [74, 69.0], [999, 82.0]], 'pessoas_max' => 9],
        'PLUS'  => ['nome' => 'PLUS', 'adesao' => 100.0, 'mensalidade' => 110.0, 'agregados_max' => 9, 'agregados_sem_custo' => 2, 'pessoas_max' => 20],
        'MAX'   => ['nome' => 'MAX', 'adesao' => 100.0, 'mensalidade' => 150.0, 'agregados_max' => 9, 'agregados_sem_custo' => 2, 'pessoas_max' => 20],
    ];
    $over = $GLOBALS['PAI_CONFIG']['planos_novos_precos'] ?? [];
    if (is_array($over)) {
        foreach ($over as $plano => $v) {
            $plano = strtoupper((string)$plano);
            if (!isset($t[$plano]) || !is_array($v)) continue;
            foreach (['adesao', 'mensalidade'] as $k) {
                if (isset($v[$k]) && is_numeric($v[$k])) $t[$plano][$k] = (float)$v[$k];
            }
            if ($plano === 'FLEX' && isset($v['faixas']) && is_array($v['faixas'])) $t['FLEX']['faixas'] = $v['faixas'];
        }
    }
    foreach ($t as $k => $p) {
        if (isset($p['mensalidade'])) $t[$k]['valor_agregado'] = round($p['mensalidade'] * 0.2, 2);
    }
    return $t;
}

/** Parentescos. 'grupo' = regra de dependente; quem não tem grupo é sempre agregado. */
function pn_parentescos(): array
{
    return [
        'conjuge'        => ['rotulo' => 'Cônjuge ou companheiro(a)', 'grupo' => 'conjuge'],
        'filho_solteiro' => ['rotulo' => 'Filho(a) solteiro(a)', 'grupo' => 'filho'],
        'pai'            => ['rotulo' => 'Pai', 'grupo' => 'pais_sogros'],
        'mae'            => ['rotulo' => 'Mãe', 'grupo' => 'pais_sogros'],
        'sogro'          => ['rotulo' => 'Sogro', 'grupo' => 'pais_sogros'],
        'sogra'          => ['rotulo' => 'Sogra', 'grupo' => 'pais_sogros'],
        'filho_casado'   => ['rotulo' => 'Filho(a) casado(a)', 'grupo' => ''],
        'enteado'        => ['rotulo' => 'Enteado(a)', 'grupo' => ''],
        'neto'           => ['rotulo' => 'Neto(a)', 'grupo' => ''],
        'irmao'          => ['rotulo' => 'Irmão(ã)', 'grupo' => ''],
        'genro_nora'     => ['rotulo' => 'Genro ou nora', 'grupo' => ''],
        'cunhado'        => ['rotulo' => 'Cunhado(a)', 'grupo' => ''],
        'sobrinho'       => ['rotulo' => 'Sobrinho(a)', 'grupo' => ''],
        'tio'            => ['rotulo' => 'Tio(a)', 'grupo' => ''],
        'avo'            => ['rotulo' => 'Avô ou avó', 'grupo' => ''],
        'primo'          => ['rotulo' => 'Primo(a)', 'grupo' => ''],
        'outro'          => ['rotulo' => 'Outro familiar', 'grupo' => ''],
    ];
}

function pn_religioes(): array
{
    return ['Católica', 'Evangélica', 'Espírita', 'Matriz africana', 'Sem religião', 'Outra'];
}

const PN_IDADE_FILHO_MAX = 35;      // acima disso, agregado
const PN_PAIS_SOGROS_MAX = 2;       // até 2 entre pai, mãe, sogro e sogra

/* ---------------- Utilidades ---------------- */
function pn_txt(mixed $v, int $max): string
{
    $s = trim(preg_replace('/\s+/u', ' ', (string)$v) ?? '');
    return function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max);
}

function pn_cpf(string $v): string
{
    $c = preg_replace('/\D/', '', $v) ?? '';
    if (strlen($c) !== 11 || preg_match('/^(\d)\1{10}$/', $c)) return '';
    for ($t = 9; $t < 11; $t++) {
        $s = 0;
        for ($i = 0; $i < $t; $i++) $s += (int)$c[$i] * ($t + 1 - $i);
        if ((int)$c[$t] !== ((10 * $s) % 11) % 10) return '';
    }
    return $c;
}

function pn_data(string $v): ?DateTimeImmutable
{
    $v = trim($v);
    foreach (['!Y-m-d', '!d/m/Y'] as $f) {
        $d = DateTimeImmutable::createFromFormat($f, $v);
        if ($d && $d->format(str_replace('!', '', $f)) === $v) {
            $hoje = new DateTimeImmutable('today');
            if ($d > $hoje || (int)$d->format('Y') < 1900) return null;
            return $d;
        }
    }
    return null;
}

function pn_idade(DateTimeImmutable $nasc): int
{
    return (int)$nasc->diff(new DateTimeImmutable('today'))->y;
}

function pn_mascara_cpf(?string $cpf): string
{
    $cpf = (string)$cpf;
    return strlen($cpf) === 11 ? substr($cpf, 0, 3) . '.***.***-' . substr($cpf, -2) : '';
}

function pn_corpo(): array
{
    $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($len > PN_MAX_BODY) pn_erro(413, 'Dados grandes demais.');
    $raw = file_get_contents('php://input', false, null, 0, PN_MAX_BODY + 1);
    if (!is_string($raw) || strlen($raw) > PN_MAX_BODY) pn_erro(413, 'Dados grandes demais.');
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function pn_ip(): string
{
    return (string)($_SERVER['REMOTE_ADDR'] ?? '');
}

/** Limite simples por chave, por hora, sem gravar dado pessoal legível. */
function pn_limite(string $chave, int $max): void
{
    $dir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'pai-planos-novos';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) return;
    $arq = $dir . DIRECTORY_SEPARATOR . hash('sha256', $chave) . '.json';
    $fp = @fopen($arq, 'c+');
    if ($fp === false) return;
    $n = 0; $desde = time();
    if (flock($fp, LOCK_EX)) {
        $d = json_decode((string)stream_get_contents($fp), true);
        $desde = (int)($d['desde'] ?? 0);
        $n = (is_array($d) && time() - $desde < 3600) ? (int)($d['n'] ?? 0) : 0;
        if ($n === 0) $desde = time();
        $n++;
        rewind($fp); ftruncate($fp, 0); fwrite($fp, json_encode(['desde' => $desde, 'n' => $n])); fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
    if ($n > $max) pn_erro(429, 'Muitas tentativas seguidas. Aguarde um pouco ou fale com a nossa equipe pelo WhatsApp.');
}

function pn_evento(array $eventos, string $tipo, string $quem, array $extra = []): array
{
    $eventos[] = ['em' => date('Y-m-d H:i:s'), 'tipo' => $tipo, 'por' => $quem] + $extra;
    return array_slice($eventos, -100);
}

function pn_eventos(?string $json): array
{
    $e = json_decode((string)$json, true);
    return is_array($e) ? $e : [];
}

function pn_codigo(): string
{
    $alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $s = '';
    for ($i = 0; $i < 12; $i++) $s .= $alfabeto[random_int(0, strlen($alfabeto) - 1)];
    return $s;
}

/* ---------------- Cálculo (mesma regra do front) ---------------- */
/**
 * $pessoas: [['parentesco'=>..., 'nascimento'=>DateTimeImmutable, ...], ...] (sem o titular)
 * Devolve as pessoas com 'tipo' (dependente|agregado) e 'paga' (bool), e o resumo de valores.
 */
function pn_calcular(string $plano, DateTimeImmutable $titularNasc, array $pessoas): array
{
    $tab = pn_tabela();
    $p = $tab[$plano];
    $par = pn_parentescos();

    if (count($pessoas) > $p['pessoas_max']) {
        pn_erro(422, 'O plano ' . $plano . ' aceita até ' . $p['pessoas_max'] . ' pessoas além do titular.');
    }

    if ($plano === 'FLEX') {
        $maior = pn_idade($titularNasc);
        foreach ($pessoas as $i => $x) {
            $maior = max($maior, pn_idade($x['nascimento']));
            $pessoas[$i]['tipo'] = 'dependente';
            $pessoas[$i]['paga'] = false;
        }
        $mensal = end($p['faixas'])[1];
        foreach ($p['faixas'] as [$ate, $valor]) {
            if ($maior <= $ate) { $mensal = (float)$valor; break; }
        }
        return [
            'pessoas' => $pessoas, 'qtd_dependentes' => count($pessoas), 'qtd_agregados' => 0, 'qtd_agregados_pagos' => 0,
            'valor_agregados' => 0.0, 'valor_mensalidade' => round($mensal, 2), 'valor_adesao' => $p['adesao'],
            'maior_idade' => $maior,
        ];
    }

    $conjuges = 0; $paisSogros = 0;
    foreach ($pessoas as $i => $x) {
        $grupo = $par[$x['parentesco']]['grupo'] ?? '';
        $tipo = 'agregado';
        if ($grupo === 'conjuge') {
            $conjuges++;
            if ($conjuges > 1) pn_erro(422, 'Informe só um cônjuge ou companheiro(a).');
            $tipo = 'dependente';
        } elseif ($grupo === 'filho') {
            $tipo = pn_idade($x['nascimento']) > PN_IDADE_FILHO_MAX ? 'agregado' : 'dependente';
        } elseif ($grupo === 'pais_sogros') {
            $paisSogros++;
            $tipo = $paisSogros <= PN_PAIS_SOGROS_MAX ? 'dependente' : 'agregado';
        }
        $pessoas[$i]['tipo'] = $tipo;
        $pessoas[$i]['paga'] = false;
    }

    $agregados = 0;
    foreach ($pessoas as $i => $x) {
        if ($x['tipo'] !== 'agregado') continue;
        $agregados++;
        $pessoas[$i]['paga'] = $agregados > $p['agregados_sem_custo'];
    }
    if ($agregados > $p['agregados_max']) {
        pn_erro(422, 'O plano ' . $plano . ' aceita até ' . $p['agregados_max'] . ' agregados. Você informou ' . $agregados . '.');
    }
    $pagos = max(0, $agregados - $p['agregados_sem_custo']);
    $valorAgregados = round($pagos * $p['valor_agregado'], 2);

    return [
        'pessoas' => $pessoas,
        'qtd_dependentes' => count($pessoas) - $agregados,
        'qtd_agregados' => $agregados,
        'qtd_agregados_pagos' => $pagos,
        'valor_agregados' => $valorAgregados,
        'valor_mensalidade' => round($p['mensalidade'] + $valorAgregados, 2),
        'valor_adesao' => $p['adesao'],
        'maior_idade' => null,
    ];
}

/* ---------------- Autenticação ---------------- */
function pn_chave_ok(): bool
{
    $chave = trim((string)($GLOBALS['PAI_CONFIG']['planos_novos_chave'] ?? ''));
    $enviada = (string)($_SERVER['HTTP_X_PAI_PLANOS_KEY'] ?? '');
    return strlen($chave) >= 32 && $enviada !== '' && hash_equals($chave, $enviada);
}

function pn_exigir_chave(): void
{
    if (!pn_chave_ok()) pn_erro(401, 'Acesso não autorizado.');
}

/** Mesma sessão e permissões do app (os_auth_pai.php / convenio.php). */
function pn_usuario(): ?array
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        $vida = 8 * 60 * 60;
        ini_set('session.gc_maxlifetime', (string)$vida);
        ini_set('session.cookie_lifetime', (string)$vida);
        session_set_cookie_params(['lifetime' => $vida, 'path' => '/', 'domain' => '.planoassistencialintegrado.com.br',
            'secure' => true, 'httponly' => true, 'samesite' => 'None']);
        session_start();
    }
    $norm = static fn(string $v): string => trim(preg_replace('/\s+/u', ' ', $v) ?? '');
    if (empty($_SESSION['usuario_nome']) && ($_COOKIE['pai_auth'] ?? '') === '1') {
        $quem = $_COOKIE['pai_user'] ?? $_COOKIE['pai_nome'] ?? $_COOKIE['user'] ?? null;
        if (!empty($quem)) $_SESSION['usuario_nome'] = $norm((string)$quem);
    }
    if (empty($_SESSION['usuario_nome'])) return null;

    $pdo = pn_pdo();
    $idSessao = (int)($_SESSION['user_id'] ?? $_SESSION['usuario_id'] ?? $_COOKIE['pai_uid'] ?? 0);
    $login = $norm((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
    $nome = $norm((string)$_SESSION['usuario_nome']);
    $row = null;
    foreach ([['id', $idSessao > 0 ? $idSessao : null], ['usuario', $login !== '' ? $login : null], ['nome', $nome !== '' ? $nome : null]] as [$col, $v]) {
        if ($v === null || $row) continue;
        $st = $pdo->prepare("SELECT id, usuario, nome, cargo FROM usuarios WHERE {$col} = :v LIMIT 1");
        $st->execute(['v' => $v]);
        $row = $st->fetch() ?: null;
    }
    session_write_close();
    if (!$row) return null;

    $paginas = [];
    $st = $pdo->prepare('SELECT pagina FROM permissoes WHERE user_id = :u');
    $st->execute(['u' => (int)$row['id']]);
    $paginas = array_merge($paginas, $st->fetchAll(PDO::FETCH_COLUMN));
    try {
        $st = $pdo->prepare('SELECT cp.pagina FROM usuarios u INNER JOIN cargos c ON c.slug = u.cargo AND c.ativo = 1
                             INNER JOIN cargo_paginas cp ON cp.cargo_id = c.id WHERE u.id = :u');
        $st->execute(['u' => (int)$row['id']]);
        $paginas = array_merge($paginas, $st->fetchAll(PDO::FETCH_COLUMN));
    } catch (PDOException $e) {
        // tabelas de cargo ausentes: fica só com as permissões diretas
    }
    $cargo = strtolower($norm((string)($row['cargo'] ?? '')));
    return [
        'id' => (int)$row['id'],
        'nome' => (string)($row['nome'] ?? $nome),
        'cargo' => $cargo,
        'paginas' => array_values(array_unique(array_map('strval', $paginas))),
    ];
}

function pn_exigir_usuario(): array
{
    $u = pn_usuario();
    if (!$u) pn_out(401, ['erro' => true, 'need_login' => true, 'msg' => 'Faça login novamente.']);
    $admin = in_array($u['cargo'], ['adm', 'admin', 'administrador', 'gestao'], true);
    if (!$admin && !in_array(PN_PAGINA, $u['paginas'], true)) {
        pn_erro(403, 'Você não tem acesso à tela Novos planos.');
    }
    return $u;
}

/* ---------------- OneSignal ---------------- */
function pn_notificar_pago(array $row): array
{
    $c = $GLOBALS['PAI_CONFIG'];
    $appId = trim((string)($c['onesignal_app_id'] ?? ''));
    $apiKey = trim((string)($c['onesignal_api_key'] ?? $c['onesignal_rest_api_key'] ?? ''));
    if ($appId === '' || $apiKey === '' || !function_exists('curl_init')) {
        return ['enviada' => false, 'erro' => 'OneSignal não configurado.'];
    }
    $primeiro = explode(' ', trim((string)$row['titular_nome']))[0] ?? '';
    $pessoas = 1 + (int)$row['qtd_dependentes'] + (int)$row['qtd_agregados'];
    $titulo = '🛡️ NOVO PLANO ' . $row['plano'];
    $corpo = sprintf('%s · %d %s · adesão R$ %s paga',
        $primeiro !== '' ? $primeiro : 'Novo associado',
        $pessoas, $pessoas > 1 ? 'pessoas' : 'pessoa',
        number_format((float)($row['valor_pago'] ?? $row['valor_adesao']), 2, ',', '.'));
    $payload = [
        'app_id' => $appId,
        'included_segments' => ['All'],
        'headings' => ['pt' => $titulo, 'en' => $titulo],
        'contents' => ['pt' => $corpo, 'en' => $corpo],
        'data' => ['tipo' => 'novo_plano', 'id' => (int)$row['id'], 'plano' => $row['plano']],
        'url' => PN_APP_URL . '?id=' . (int)$row['id'],
    ];
    $ch = curl_init('https://onesignal.com/api/v1/notifications');
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8', 'Authorization: Basic ' . $apiKey],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 8,
    ]);
    $resp = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false || $http < 200 || $http >= 300) {
        pn_log('OneSignal falhou: HTTP ' . $http . ' ' . $err . ' ' . substr((string)$resp, 0, 300));
        return ['enviada' => false, 'erro' => 'OneSignal HTTP ' . $http];
    }
    return ['enviada' => true];
}

/* ---------------- Leitura ---------------- */
function pn_buscar(string $campo, string|int $valor, bool $travar = false): ?array
{
    $sql = "SELECT * FROM planos_novos WHERE {$campo} = :v LIMIT 1" . ($travar ? ' FOR UPDATE' : '');
    $st = pn_pdo()->prepare($sql);
    $st->execute(['v' => $valor]);
    $r = $st->fetch();
    return $r ?: null;
}

function pn_formatar(array $r, bool $completo): array
{
    $deps = json_decode((string)$r['dependentes'], true);
    $out = [
        'id' => (int)$r['id'],
        'codigo' => $r['codigo'],
        'plano' => $r['plano'],
        'status' => $r['status'],
        'titular_nome' => $r['titular_nome'],
        'titular_cpf' => $completo ? $r['titular_cpf'] : pn_mascara_cpf($r['titular_cpf']),
        'titular_celular' => $r['titular_celular'],
        'cidade' => $r['cidade'],
        'uf' => $r['uf'],
        'qtd_dependentes' => (int)$r['qtd_dependentes'],
        'qtd_agregados' => (int)$r['qtd_agregados'],
        'valor_adesao' => (float)$r['valor_adesao'],
        'valor_mensalidade' => (float)$r['valor_mensalidade'],
        'valor_pago' => $r['valor_pago'] !== null ? (float)$r['valor_pago'] : null,
        'pago_em' => $r['pago_em'],
        'wc_pedido_id' => $r['wc_pedido_id'] !== null ? (int)$r['wc_pedido_id'] : null,
        'numero_contrato' => $r['numero_contrato'],
        'criado_em' => $r['criado_em'],
    ];
    if (!$completo) return $out;
    $carencia = null;
    if (!empty($r['pago_em'])) {
        $p = new DateTimeImmutable((string)$r['pago_em']);
        $carencia = ['inicio' => $p->format('Y-m-d H:i:s'), 'natural_ate' => $p->modify('+90 days')->format('Y-m-d'), 'acidental_ate' => $p->modify('+24 hours')->format('Y-m-d H:i:s')];
    }
    return $out + [
        'titular_nascimento' => $r['titular_nascimento'],
        'titular_religiao' => $r['titular_religiao'],
        'titular_email' => $r['titular_email'],
        'endereco' => [
            'cep' => $r['cep'], 'logradouro' => $r['logradouro'], 'numero' => $r['numero'], 'complemento' => $r['complemento'],
            'bairro' => $r['bairro'], 'cidade' => $r['cidade'], 'uf' => $r['uf'],
        ],
        'dependentes' => is_array($deps) ? $deps : [],
        'qtd_agregados_pagos' => (int)$r['qtd_agregados_pagos'],
        'valor_agregados' => (float)$r['valor_agregados'],
        'sucessor_nome' => $r['sucessor_nome'],
        'sucessor_cpf' => $r['sucessor_cpf'],
        'aceite' => ['em' => $r['aceite_em'], 'ip' => $r['aceite_ip'], 'versao' => $r['aceite_versao'], 'religiao' => (bool)$r['consentimento_religiao']],
        'pagamento_metodo' => $r['pagamento_metodo'],
        'carencia' => $carencia,
        'contrato_por' => $r['contrato_por'],
        'contrato_em' => $r['contrato_em'],
        'origem' => $r['origem'],
        'observacao' => $r['observacao'],
        'eventos' => pn_eventos($r['eventos']),
        'atualizado_em' => $r['atualizado_em'],
    ];
}

/* ==================== Rotas ==================== */
$metodo = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');
$corpo = $metodo === 'POST' ? pn_corpo() : [];
$acao = trim((string)($_GET['acao'] ?? $corpo['acao'] ?? ''));

if ($acao === 'ping') {
    pn_out(200, ['erro' => false, 'servico' => 'planos-novos', 'versao' => PN_VERSAO]);
}

/* ---------- Tabela pública (site) ---------- */
if ($acao === 'tabela' && $metodo === 'GET') {
    $par = [];
    foreach (pn_parentescos() as $k => $v) $par[] = ['valor' => $k, 'rotulo' => $v['rotulo'], 'grupo' => $v['grupo']];
    pn_out(200, [
        'erro' => false,
        'planos' => pn_tabela(),
        'parentescos' => $par,
        'religioes' => pn_religioes(),
        'idade_filho_max' => PN_IDADE_FILHO_MAX,
        'pais_sogros_max' => PN_PAIS_SOGROS_MAX,
        'aceite_versao' => PN_ACEITE_VERSAO,
    ]);
}

/* ---------- Cadastro (site, navegador) ---------- */
if ($acao === 'cadastrar' && $metodo === 'POST') {
    pn_limite('ip:' . pn_ip(), 15);
    $b = $corpo;
    if (trim((string)($b['site'] ?? '')) !== '') pn_erro(400, 'Envio inválido.'); // campo-armadilha para robôs

    $plano = strtoupper(trim((string)($b['plano'] ?? '')));
    if (!isset(pn_tabela()[$plano])) pn_erro(422, 'Escolha um dos planos: LIGHT, FLEX, PLUS ou MAX.');

    $t = is_array($b['titular'] ?? null) ? $b['titular'] : [];
    $nome = pn_txt($t['nome'] ?? '', 150);
    if (mb_strlen($nome) < 5 || !str_contains($nome, ' ')) pn_erro(422, 'Informe o nome completo do titular.', ['campo' => 'titular_nome']);
    $cpf = pn_cpf((string)($t['cpf'] ?? ''));
    if ($cpf === '') pn_erro(422, 'CPF do titular inválido.', ['campo' => 'titular_cpf']);
    pn_limite('cpf:' . $cpf, 6);
    $nasc = pn_data((string)($t['nascimento'] ?? ''));
    if (!$nasc) pn_erro(422, 'Data de nascimento do titular inválida.', ['campo' => 'titular_nascimento']);
    if (pn_idade($nasc) < 18) pn_erro(422, 'O titular precisa ter 18 anos ou mais.', ['campo' => 'titular_nascimento']);
    $religiao = pn_txt($t['religiao'] ?? '', 60);
    if ($religiao === '') pn_erro(422, 'Informe a religião do titular.', ['campo' => 'titular_religiao']);
    $cel = preg_replace('/\D/', '', (string)($t['celular'] ?? '')) ?? '';
    if (strlen($cel) < 10 || strlen($cel) > 11) pn_erro(422, 'Informe um celular com DDD.', ['campo' => 'titular_celular']);
    $email = trim((string)($t['email'] ?? ''));
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) pn_erro(422, 'E-mail inválido.', ['campo' => 'titular_email']);

    $e = is_array($b['endereco'] ?? null) ? $b['endereco'] : [];
    $cep = preg_replace('/\D/', '', (string)($e['cep'] ?? '')) ?? '';
    $end = [
        'cep' => strlen($cep) === 8 ? $cep : null,
        'logradouro' => pn_txt($e['logradouro'] ?? '', 150),
        'numero' => pn_txt($e['numero'] ?? '', 20),
        'complemento' => pn_txt($e['complemento'] ?? '', 80),
        'bairro' => pn_txt($e['bairro'] ?? '', 80),
        'cidade' => pn_txt($e['cidade'] ?? '', 80),
        'uf' => strtoupper(pn_txt($e['uf'] ?? '', 2)),
    ];
    if ($end['logradouro'] === '' || $end['numero'] === '' || $end['bairro'] === '' || $end['cidade'] === '' || strlen($end['uf']) !== 2) {
        pn_erro(422, 'Preencha o endereço completo (rua, número, bairro, cidade e UF).', ['campo' => 'endereco']);
    }

    $par = pn_parentescos();
    $pessoas = [];
    $lista = is_array($b['pessoas'] ?? null) ? array_values($b['pessoas']) : [];
    if (count($lista) > 25) pn_erro(422, 'Pessoas demais no cadastro.');
    foreach ($lista as $i => $x) {
        if (!is_array($x)) continue;
        $n = $i + 1;
        $pk = (string)($x['parentesco'] ?? '');
        if (!isset($par[$pk])) pn_erro(422, 'Escolha o parentesco da pessoa ' . $n . '.', ['campo' => 'pessoa_' . $i]);
        $dn = pn_data((string)($x['nascimento'] ?? ''));
        if (!$dn) pn_erro(422, 'Data de nascimento inválida na pessoa ' . $n . '.', ['campo' => 'pessoa_' . $i]);
        $cpfDep = trim((string)($x['cpf'] ?? ''));
        $cpfOk = $cpfDep === '' ? '' : pn_cpf($cpfDep);
        if ($cpfDep !== '' && $cpfOk === '') pn_erro(422, 'CPF inválido na pessoa ' . $n . ' (deixe em branco se não souber).', ['campo' => 'pessoa_' . $i]);
        if ($cpfOk !== '' && $cpfOk === $cpf) pn_erro(422, 'A pessoa ' . $n . ' está com o CPF do titular.', ['campo' => 'pessoa_' . $i]);
        $pessoas[] = [
            'nome' => pn_txt($x['nome'] ?? '', 150),
            'cpf' => $cpfOk,
            'nascimento' => $dn,
            'parentesco' => $pk,
            'religiao' => pn_txt($x['religiao'] ?? '', 60),
        ];
    }

    $calc = pn_calcular($plano, $nasc, $pessoas);

    $sucNome = null; $sucCpf = null;
    $suc = $b['sucessor'] ?? null;
    if ($suc !== null && $suc !== '' && is_numeric($suc)) {
        $s = $calc['pessoas'][(int)$suc] ?? null;
        if (!$s) pn_erro(422, 'Sucessor inválido.', ['campo' => 'sucessor']);
        if (pn_idade($s['nascimento']) < 18) pn_erro(422, 'O sucessor precisa ser maior de idade.', ['campo' => 'sucessor']);
        if ($s['nome'] === '') pn_erro(422, 'Informe o nome da pessoa indicada como sucessora.', ['campo' => 'sucessor']);
        $sucNome = $s['nome'];
        $sucCpf = $s['cpf'] !== '' ? $s['cpf'] : null;
    }

    if (empty($b['aceite_termo'])) pn_erro(422, 'É preciso aceitar as condições do Termo de Adesão.', ['campo' => 'aceite']);
    if (empty($b['aceite_religiao'])) pn_erro(422, 'É preciso autorizar o uso da religião informada.', ['campo' => 'aceite']);

    $deps = [];
    foreach ($calc['pessoas'] as $x) {
        $deps[] = [
            'nome' => $x['nome'], 'cpf' => $x['cpf'], 'nascimento' => $x['nascimento']->format('Y-m-d'),
            'idade' => pn_idade($x['nascimento']), 'parentesco' => $x['parentesco'], 'parentesco_rotulo' => $par[$x['parentesco']]['rotulo'],
            'religiao' => $x['religiao'], 'tipo' => $x['tipo'], 'paga' => $x['paga'],
        ];
    }

    $origemTxt = pn_txt(($b['origem'] ?? ''), 255);
    $pdo = pn_pdo();
    $pdo->beginTransaction();
    try {
        // Cadastro anterior do mesmo CPF ainda sem pagamento: fica como cancelado (substituído).
        $st = $pdo->prepare("SELECT id, eventos FROM planos_novos WHERE titular_cpf = :c AND status = 'aguardando_pagamento' AND wc_pedido_id IS NULL FOR UPDATE");
        $st->execute(['c' => $cpf]);
        foreach ($st->fetchAll() as $old) {
            $ev = pn_evento(pn_eventos($old['eventos']), 'substituido', 'site', ['motivo' => 'Novo cadastro do mesmo CPF']);
            $pdo->prepare("UPDATE planos_novos SET status = 'cancelado', eventos = :e WHERE id = :id")
                ->execute(['e' => json_encode($ev, JSON_UNESCAPED_UNICODE), 'id' => (int)$old['id']]);
        }

        $codigo = '';
        for ($tentativa = 0; $tentativa < 5; $tentativa++) {
            $codigo = pn_codigo();
            $st = $pdo->prepare('SELECT 1 FROM planos_novos WHERE codigo = :c');
            $st->execute(['c' => $codigo]);
            if (!$st->fetchColumn()) break;
        }
        $eventos = pn_evento([], 'cadastro', 'site', ['ip' => pn_ip()]);
        $sql = 'INSERT INTO planos_novos (codigo, plano, status, titular_nome, titular_cpf, titular_nascimento, titular_religiao,
                titular_celular, titular_email, cep, logradouro, numero, complemento, bairro, cidade, uf, dependentes,
                qtd_dependentes, qtd_agregados, qtd_agregados_pagos, sucessor_nome, sucessor_cpf, valor_adesao, valor_mensalidade,
                valor_agregados, aceite_em, aceite_ip, aceite_versao, consentimento_religiao, origem, eventos)
                VALUES (:codigo, :plano, \'aguardando_pagamento\', :nome, :cpf, :nasc, :religiao, :cel, :email, :cep, :logradouro,
                :numero, :complemento, :bairro, :cidade, :uf, :deps, :qd, :qa, :qap, :sn, :sc, :va, :vm, :vag, NOW(), :ip, :versao, 1,
                :origem, :eventos)';
        $pdo->prepare($sql)->execute([
            'codigo' => $codigo, 'plano' => $plano, 'nome' => $nome, 'cpf' => $cpf, 'nasc' => $nasc->format('Y-m-d'),
            'religiao' => $religiao, 'cel' => $cel, 'email' => $email !== '' ? $email : null,
            'cep' => $end['cep'], 'logradouro' => $end['logradouro'], 'numero' => $end['numero'],
            'complemento' => $end['complemento'] !== '' ? $end['complemento'] : null, 'bairro' => $end['bairro'],
            'cidade' => $end['cidade'], 'uf' => $end['uf'],
            'deps' => json_encode($deps, JSON_UNESCAPED_UNICODE),
            'qd' => $calc['qtd_dependentes'], 'qa' => $calc['qtd_agregados'], 'qap' => $calc['qtd_agregados_pagos'],
            'sn' => $sucNome, 'sc' => $sucCpf, 'va' => $calc['valor_adesao'], 'vm' => $calc['valor_mensalidade'],
            'vag' => $calc['valor_agregados'], 'ip' => pn_ip(), 'versao' => PN_ACEITE_VERSAO,
            'origem' => $origemTxt !== '' ? $origemTxt : null,
            'eventos' => json_encode($eventos, JSON_UNESCAPED_UNICODE),
        ]);
        $pdo->commit();
    } catch (Throwable $t) {
        $pdo->rollBack();
        throw $t;
    }

    pn_out(200, [
        'erro' => false,
        'codigo' => $codigo,
        'plano' => $plano,
        'valor_adesao' => $calc['valor_adesao'],
        'valor_mensalidade' => $calc['valor_mensalidade'],
        'qtd_dependentes' => $calc['qtd_dependentes'],
        'qtd_agregados' => $calc['qtd_agregados'],
        'qtd_agregados_pagos' => $calc['qtd_agregados_pagos'],
    ]);
}

/* ---------- Site (servidor WordPress, com chave) ---------- */
if ($acao === 'consultar_codigo' && $metodo === 'POST') {
    pn_exigir_chave();
    $r = pn_buscar('codigo', strtoupper(pn_txt($corpo['codigo'] ?? '', 12)));
    if (!$r) pn_erro(404, 'Cadastro não encontrado.');
    pn_out(200, ['erro' => false, 'cadastro' => [
        'codigo' => $r['codigo'], 'plano' => $r['plano'], 'status' => $r['status'],
        'wc_pedido_id' => $r['wc_pedido_id'] !== null ? (int)$r['wc_pedido_id'] : null,
        'valor_adesao' => (float)$r['valor_adesao'], 'valor_mensalidade' => (float)$r['valor_mensalidade'],
        'titular_nome' => $r['titular_nome'], 'titular_cpf' => $r['titular_cpf'], 'titular_celular' => $r['titular_celular'],
        'titular_email' => $r['titular_email'], 'cep' => $r['cep'], 'logradouro' => $r['logradouro'], 'numero' => $r['numero'],
        'complemento' => $r['complemento'], 'bairro' => $r['bairro'], 'cidade' => $r['cidade'], 'uf' => $r['uf'],
        'qtd_pessoas' => 1 + (int)$r['qtd_dependentes'] + (int)$r['qtd_agregados'],
    ]]);
}

if ($acao === 'pedido' && $metodo === 'POST') {
    pn_exigir_chave();
    $codigo = strtoupper(pn_txt($corpo['codigo'] ?? '', 12));
    $pedido = (int)($corpo['pedido'] ?? 0);
    if ($pedido <= 0) pn_erro(422, 'Pedido inválido.');
    $pdo = pn_pdo();
    $pdo->beginTransaction();
    $r = pn_buscar('codigo', $codigo, true);
    if (!$r) { $pdo->rollBack(); pn_erro(404, 'Cadastro não encontrado.'); }
    if ((int)$r['wc_pedido_id'] !== $pedido) {
        $ev = pn_evento(pn_eventos($r['eventos']), 'pedido', 'woocommerce', ['pedido' => $pedido]);
        $novoStatus = $r['status'] === 'cancelado' ? 'aguardando_pagamento' : $r['status'];
        $pdo->prepare('UPDATE planos_novos SET wc_pedido_id = :p, status = :s, eventos = :e WHERE id = :id')
            ->execute(['p' => $pedido, 's' => $novoStatus, 'e' => json_encode($ev, JSON_UNESCAPED_UNICODE), 'id' => (int)$r['id']]);
    }
    $pdo->commit();
    pn_out(200, ['erro' => false]);
}

if ($acao === 'pagamento' && $metodo === 'POST') {
    pn_exigir_chave();
    $codigo = strtoupper(pn_txt($corpo['codigo'] ?? '', 12));
    $pedido = (int)($corpo['pedido'] ?? 0);
    $situacao = (string)($corpo['situacao'] ?? '');
    if (!in_array($situacao, ['pago', 'cancelado'], true)) pn_erro(422, 'Situação inválida.');
    $pdo = pn_pdo();
    $pdo->beginTransaction();
    $r = pn_buscar('codigo', $codigo, true);
    if (!$r) { $pdo->rollBack(); pn_erro(404, 'Cadastro não encontrado.'); }
    if ($pedido > 0 && $r['wc_pedido_id'] !== null && (int)$r['wc_pedido_id'] !== $pedido) {
        $pdo->rollBack();
        pn_erro(409, 'Este cadastro está ligado a outro pedido.');
    }
    $notificar = false;
    $ev = pn_eventos($r['eventos']);
    if ($situacao === 'pago') {
        if (in_array($r['status'], ['pago', 'contrato_criado'], true)) { $pdo->commit(); pn_out(200, ['erro' => false, 'repetido' => true]); }
        $pagoEm = pn_data(substr((string)($corpo['pago_em'] ?? ''), 0, 10)) ? (string)$corpo['pago_em'] : date('Y-m-d H:i:s');
        if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $pagoEm)) $pagoEm = date('Y-m-d H:i:s');
        $valor = is_numeric($corpo['valor'] ?? null) ? round((float)$corpo['valor'], 2) : null;
        $ev = pn_evento($ev, 'pago', 'woocommerce', ['pedido' => $pedido, 'valor' => $valor]);
        if ($valor !== null && abs($valor - (float)$r['valor_adesao']) > 0.009) {
            $ev = pn_evento($ev, 'alerta', 'sistema', ['msg' => 'Valor pago diferente da adesão do plano']);
        }
        $pdo->prepare("UPDATE planos_novos SET status = 'pago', pago_em = :pe, valor_pago = :v, pagamento_metodo = :m,
                       wc_pedido_id = COALESCE(wc_pedido_id, :p), eventos = :e WHERE id = :id")
            ->execute(['pe' => $pagoEm, 'v' => $valor, 'm' => pn_txt($corpo['metodo'] ?? '', 60) ?: null,
                'p' => $pedido > 0 ? $pedido : null, 'e' => json_encode($ev, JSON_UNESCAPED_UNICODE), 'id' => (int)$r['id']]);
        $notificar = true;
    } else {
        if ($r['status'] === 'cancelado') { $pdo->commit(); pn_out(200, ['erro' => false, 'repetido' => true]); }
        $ev = pn_evento($ev, 'cancelado', 'woocommerce', ['pedido' => $pedido, 'motivo' => pn_txt($corpo['motivo'] ?? '', 120)]);
        $pdo->prepare("UPDATE planos_novos SET status = 'cancelado', eventos = :e WHERE id = :id")
            ->execute(['e' => json_encode($ev, JSON_UNESCAPED_UNICODE), 'id' => (int)$r['id']]);
    }
    $pdo->commit();

    $notif = null;
    if ($notificar) {
        $atual = pn_buscar('id', (int)$r['id']);
        $notif = pn_notificar_pago($atual ?: $r);
        $ev = pn_evento(pn_eventos(($atual ?: $r)['eventos']), $notif['enviada'] ? 'notificacao' : 'notificacao_falhou', 'sistema', $notif['enviada'] ? [] : ['erro' => $notif['erro'] ?? '']);
        pn_pdo()->prepare('UPDATE planos_novos SET eventos = :e WHERE id = :id')
            ->execute(['e' => json_encode($ev, JSON_UNESCAPED_UNICODE), 'id' => (int)$r['id']]);
    }
    pn_out(200, ['erro' => false, 'notificacao' => $notif]);
}

/* ---------- App PAI (tela Novos planos) ---------- */
if ($acao === 'me' && $metodo === 'GET') {
    $u = pn_exigir_usuario();
    pn_out(200, ['erro' => false, 'usuario' => ['nome' => $u['nome']]]);
}

if ($acao === 'listar' && $metodo === 'GET') {
    pn_exigir_usuario();
    $where = ['1=1'];
    $p = [];
    $status = (string)($_GET['status'] ?? '');
    if (in_array($status, ['aguardando_pagamento', 'pago', 'contrato_criado', 'cancelado'], true)) { $where[] = 'status = :s'; $p['s'] = $status; }
    $plano = strtoupper((string)($_GET['plano'] ?? ''));
    if (isset(pn_tabela()[$plano])) { $where[] = 'plano = :pl'; $p['pl'] = $plano; }
    $busca = pn_txt($_GET['busca'] ?? '', 80);
    if ($busca !== '') {
        $dig = preg_replace('/\D/', '', $busca) ?? '';
        $cond = ['titular_nome LIKE :b', 'codigo = :bc', 'numero_contrato = :bn'];
        $p['b'] = '%' . $busca . '%'; $p['bc'] = strtoupper($busca); $p['bn'] = $busca;
        if (strlen($dig) >= 3) { $cond[] = 'titular_cpf LIKE :bd'; $p['bd'] = $dig . '%'; }
        if (ctype_digit($busca)) { $cond[] = 'wc_pedido_id = :bp'; $p['bp'] = (int)$busca; }
        $where[] = '(' . implode(' OR ', $cond) . ')';
    }
    $de = pn_data((string)($_GET['de'] ?? ''));
    $ate = pn_data((string)($_GET['ate'] ?? ''));
    if ($de) { $where[] = 'criado_em >= :de'; $p['de'] = $de->format('Y-m-d 00:00:00'); }
    if ($ate) { $where[] = 'criado_em <= :ate'; $p['ate'] = $ate->format('Y-m-d 23:59:59'); }

    $pagina = max(1, (int)($_GET['pagina'] ?? 1));
    $porPagina = min(100, max(10, (int)($_GET['por_pagina'] ?? 30)));
    $w = implode(' AND ', $where);
    $pdo = pn_pdo();
    $st = $pdo->prepare("SELECT COUNT(*) FROM planos_novos WHERE {$w}");
    $st->execute($p);
    $total = (int)$st->fetchColumn();
    $st = $pdo->prepare("SELECT * FROM planos_novos WHERE {$w} ORDER BY criado_em DESC, id DESC LIMIT " . $porPagina . ' OFFSET ' . (($pagina - 1) * $porPagina));
    $st->execute($p);
    $rows = array_map(static fn(array $r): array => pn_formatar($r, false), $st->fetchAll());

    $cont = $pdo->query("SELECT status, COUNT(*) n FROM planos_novos GROUP BY status")->fetchAll();
    $resumo = ['aguardando_pagamento' => 0, 'pago' => 0, 'contrato_criado' => 0, 'cancelado' => 0];
    foreach ($cont as $c) $resumo[$c['status']] = (int)$c['n'];

    pn_out(200, ['erro' => false, 'rows' => $rows, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $porPagina, 'resumo' => $resumo]);
}

if ($acao === 'detalhar' && $metodo === 'GET') {
    pn_exigir_usuario();
    $r = pn_buscar('id', (int)($_GET['id'] ?? 0));
    if (!$r) pn_erro(404, 'Cadastro não encontrado.');
    pn_out(200, ['erro' => false, 'cadastro' => pn_formatar($r, true)]);
}

if (in_array($acao, ['contrato', 'situacao', 'observacao'], true) && $metodo === 'POST') {
    $u = pn_exigir_usuario();
    $id = (int)($corpo['id'] ?? 0);
    $pdo = pn_pdo();
    $pdo->beginTransaction();
    $r = pn_buscar('id', $id, true);
    if (!$r) { $pdo->rollBack(); pn_erro(404, 'Cadastro não encontrado.'); }
    $ev = pn_eventos($r['eventos']);

    if ($acao === 'contrato') {
        $num = pn_txt($corpo['numero_contrato'] ?? '', 30);
        if ($num === '' || !preg_match('/\d/', $num)) { $pdo->rollBack(); pn_erro(422, 'Informe o número do contrato criado no UnyPax.'); }
        if (!in_array($r['status'], ['pago', 'contrato_criado'], true)) { $pdo->rollBack(); pn_erro(409, 'O contrato só é informado depois do pagamento confirmado.'); }
        $ev = pn_evento($ev, 'contrato', $u['nome'], ['numero' => $num]);
        $pdo->prepare("UPDATE planos_novos SET status = 'contrato_criado', numero_contrato = :n, contrato_por = :u, contrato_em = NOW(), eventos = :e WHERE id = :id")
            ->execute(['n' => $num, 'u' => pn_txt($u['nome'], 80), 'e' => json_encode($ev, JSON_UNESCAPED_UNICODE), 'id' => $id]);
    } elseif ($acao === 'situacao') {
        $novo = (string)($corpo['status'] ?? '');
        $motivo = pn_txt($corpo['motivo'] ?? '', 200);
        if (!in_array($novo, ['aguardando_pagamento', 'pago', 'cancelado'], true)) { $pdo->rollBack(); pn_erro(422, 'Situação inválida.'); }
        if ($motivo === '') { $pdo->rollBack(); pn_erro(422, 'Informe o motivo da mudança.'); }
        $ev = pn_evento($ev, 'situacao', $u['nome'], ['de' => $r['status'], 'para' => $novo, 'motivo' => $motivo]);
        $extra = $novo === 'pago' && empty($r['pago_em']) ? ', pago_em = NOW()' : '';
        $pdo->prepare("UPDATE planos_novos SET status = :s{$extra}, eventos = :e WHERE id = :id")
            ->execute(['s' => $novo, 'e' => json_encode($ev, JSON_UNESCAPED_UNICODE), 'id' => $id]);
    } else {
        $texto = trim((string)($corpo['texto'] ?? ''));
        $texto = function_exists('mb_substr') ? mb_substr($texto, 0, 2000, 'UTF-8') : substr($texto, 0, 2000);
        $ev = pn_evento($ev, 'observacao', $u['nome']);
        $pdo->prepare('UPDATE planos_novos SET observacao = :o, eventos = :e WHERE id = :id')
            ->execute(['o' => $texto !== '' ? $texto : null, 'e' => json_encode($ev, JSON_UNESCAPED_UNICODE), 'id' => $id]);
    }
    $pdo->commit();
    pn_out(200, ['erro' => false, 'cadastro' => pn_formatar(pn_buscar('id', $id) ?? $r, true)]);
}

pn_erro(400, 'Ação inválida.');
