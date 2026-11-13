<?php
declare(strict_types=1);

/**
 * salas_tv_comum.php — peças usadas pelos dois endpoints das Salas do Memorial:
 *   salas_tv.php         (App PAI, usuário logado, página "salas-tv")
 *   salas_tv_agente.php  (agente do PC do Memorial, chave própria)
 *
 * Não é chamado direto pelo navegador (sai com 404 se for).
 */

if (basename((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

date_default_timezone_set(getenv('PAI_TIMEZONE') ?: 'America/Sao_Paulo');

/** Salas e o par de TVs de cada uma (mesmo par do salas.json do agente). */
const TV_SALAS = [
    'SALA 01' => ['painel' => 'PAINEL 01', 'dentro' => 'SALA 01'],
    'SALA 02' => ['painel' => 'PAINEL 02', 'dentro' => 'SALA 02'],
    'SALA 03' => ['painel' => 'PAINEL 03', 'dentro' => 'SALA 03'],
];

/** Ações que o app pode pedir. Nada fora desta lista chega ao agente. */
const TV_ACOES = ['ligar', 'desligar', 'atualizar', 'volume'];

const TV_ESTADOS = ['ligada', 'tela_apagada', 'desligada', 'nao_autorizada', 'desconhecida'];

/** Agente sem dar notícia há mais que isso = Memorial offline. */
const TV_AGENTE_ONLINE_SEG = 45;
/** Pedido pendente que ninguém buscou nesse tempo vence (não executa horas depois, de surpresa). */
const TV_PENDENTE_VENCE_SEG = 120;
/** Pedido em execução sem resultado nesse tempo vira falha. */
const TV_EXECUTANDO_VENCE_SEG = 300;

/** Arquivo privado com o resumo (SHA-256) da chave do agente. Fica fora da pasta pública. */
const TV_ARQ_CHAVE_AGENTE = '/home2/pla48587/pai-tv-agente.php';
const PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';

function tvResponder(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function tvAgora(): string
{
    return date('Y-m-d H:i:s');
}

function tvHaSegundos(int $seg): string
{
    return date('Y-m-d H:i:s', time() - $seg);
}

function tvTexto(mixed $v, int $max): string
{
    $s = trim(preg_replace('/\s+/u', ' ', (string)$v) ?? '');
    return mb_substr($s, 0, $max);
}

function tvLerJson(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $d = json_decode($raw, true);
    if (!is_array($d)) {
        tvResponder(['erro' => true, 'msg' => 'JSON inválido.'], 400);
    }
    return $d;
}

function tvConectar(string $origem): PDO
{
    if (!is_file(PAI_CHAVES_FILE) || !is_readable(PAI_CHAVES_FILE)) {
        tvResponder(['erro' => true, 'msg' => 'Arquivo privado de configuração não encontrado ou sem permissão de leitura.'], 500);
    }
    $config = require PAI_CHAVES_FILE;
    if (!is_array($config)) {
        tvResponder(['erro' => true, 'msg' => 'Configuração privada inválida.'], 500);
    }
    $host = trim((string)($config['db_host'] ?? ''));
    $user = trim((string)($config['db_user'] ?? ''));
    $pass = (string)($config['db_password'] ?? '');
    $name = trim((string)($config['db_name'] ?? ''));
    if ($host === '' || $user === '' || $pass === '' || $name === '') {
        tvResponder(['erro' => true, 'msg' => 'Configuração do banco incompleta.'], 500);
    }
    try {
        $pdo = new PDO("mysql:host={$host};dbname={$name};charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        error_log("{$origem} DB: " . $e->getMessage());
        tvResponder(['erro' => true, 'msg' => 'Não foi possível conectar ao banco.'], 500);
    }
    foreach (['tv_comandos', 'tv_status', 'tv_agente'] as $t) {
        $st = $pdo->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t LIMIT 1');
        $st->execute([':t' => $t]);
        if (!$st->fetchColumn()) {
            tvResponder(['erro' => true, 'msg' => "Tabela {$t} não encontrada. Rode o salas_tv.sql no phpMyAdmin."], 500);
        }
    }
    return $pdo;
}

/** Vence pedidos esquecidos. Chamado nos dois endpoints (não depende de cron). */
function tvVencerPedidos(PDO $pdo): void
{
    $pdo->prepare(
        "UPDATE tv_comandos
            SET situacao = 'expirado', concluido_em = :agora,
                resultado = 'O Memorial não recebeu o pedido a tempo (PC desligado ou sem internet).'
          WHERE situacao = 'pendente' AND criado_em < :limite"
    )->execute([':agora' => tvAgora(), ':limite' => tvHaSegundos(TV_PENDENTE_VENCE_SEG)]);

    $pdo->prepare(
        "UPDATE tv_comandos
            SET situacao = 'falhou', concluido_em = :agora,
                resultado = CONCAT(COALESCE(resultado, ''), ' (sem resposta do Memorial)')
          WHERE situacao = 'executando' AND pego_em < :limite"
    )->execute([':agora' => tvAgora(), ':limite' => tvHaSegundos(TV_EXECUTANDO_VENCE_SEG)]);
}

function tvAgente(PDO $pdo): array
{
    $row = $pdo->query('SELECT visto_em, versao FROM tv_agente WHERE id = 1')->fetch() ?: null;
    $visto = $row['visto_em'] ?? null;
    $seg = $visto ? max(0, time() - (int)strtotime((string)$visto)) : null;
    return [
        'online' => $seg !== null && $seg <= TV_AGENTE_ONLINE_SEG,
        'visto_em' => $visto,
        'segundos' => $seg,
        'versao' => $row['versao'] ?? null,
    ];
}
