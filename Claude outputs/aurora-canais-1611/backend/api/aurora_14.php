<?php
declare(strict_types=1);
/**
 * aurora_14.php — recebe da Meta as mensagens do Messenger da Página (Facebook) e do Direct do Instagram (16/11/2026)
 *
 * Endereço a informar na Meta (app › Messenger e Instagram › Webhooks):
 *   https://api.planoassistencialintegrado.com.br/aurora_14.php
 * Objetos: page (campos messages, messaging_postbacks) e instagram (campos messages, messaging_postbacks).
 *
 * As mensagens entram no MESMO Messenger do WhatsApp, pelo aurora_13.php: mesma fila, mesma Aurora, mesma Base.
 * As respostas (Aurora e equipe) saem pelo aurora_13.php (a13MetaEnviar), com o token da Página.
 *
 * Segurança (igual ao whatsapp_webhook.php):
 *  - GET (verificação do cadastro): hub.verify_token = meta_verify_token do pai-chaves.php;
 *  - POST: cabeçalho X-Hub-Signature-256 conferido com meta_app_secret (ou meta_page_app_secret, se a Página usar
 *    outro app da Meta).
 *
 * pai-chaves.php: meta_page_id, meta_page_token, meta_ig_id (id da conta profissional do Instagram), opcionais
 * meta_page_app_secret e meta_human_agent. BANCO: nada novo (ver aurora_13.php).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

register_shutdown_function(function () {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('[aurora_14] fatal: ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
        if (!headers_sent()) {
            http_response_code(500);
        }
    }
});

require_once __DIR__ . '/messenger_nucleo.php'; // carrega também o aurora_13.php

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

// ---------------------------------------------------------------------
// Verificação do cadastro (a Meta chama ao salvar o webhook)
// ---------------------------------------------------------------------
if ($metodo === 'GET') {
    $token = (string) msgConfig('meta_verify_token', '');
    if ($token !== '' && (string) ($_GET['hub_mode'] ?? '') === 'subscribe' && hash_equals($token, (string) ($_GET['hub_verify_token'] ?? ''))) {
        header('Content-Type: text/plain; charset=utf-8');
        echo (string) ($_GET['hub_challenge'] ?? '');
        exit;
    }
    http_response_code(403);
    echo json_encode(['erro' => true, 'msg' => 'Verificação recusada.'], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($metodo !== 'POST') {
    http_response_code(405);
    exit;
}

// ---------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------
$bruto = (string) file_get_contents('php://input');
$assinatura = (string) ($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
$valida = false;
foreach (array_unique(array_filter([(string) msgConfig('meta_page_app_secret', ''), (string) msgConfig('meta_app_secret', '')])) as $segredo) {
    if (hash_equals('sha256=' . hash_hmac('sha256', $bruto, $segredo), $assinatura)) {
        $valida = true;
    }
}
if (!$valida) {
    error_log('[aurora_14] assinatura inválida ou meta_app_secret ausente');
    http_response_code(403);
    echo json_encode(['erro' => true, 'msg' => 'Assinatura inválida.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$aviso = json_decode($bruto, true);
$objeto = is_array($aviso) ? (string) ($aviso['object'] ?? '') : '';
if ($objeto !== 'page' && $objeto !== 'instagram') {
    msgOk(null, 'Ignorado.');
}
$canal = $objeto === 'page' ? 'facebook' : 'instagram';
$contaPai = (string) msgConfig($canal === 'facebook' ? 'meta_page_id' : 'meta_ig_id', '');

$pdo = msgPdo();
if (!a13CanalAceito($pdo, $canal)) {
    error_log('[aurora_14] a coluna canal não aceita "' . $canal . '": rode o SQL da entrega de 16/11/2026');
    msgOk(null, 'Canal não liberado no banco.');
}

try {
    foreach ($aviso['entry'] ?? [] as $entrada) {
        if ($contaPai !== '' && (string) ($entrada['id'] ?? '') !== $contaPai) {
            continue; // aviso de outra Página ou outra conta
        }
        foreach ($entrada['messaging'] ?? [] as $ev) {
            a14Evento($pdo, $canal, $contaPai, is_array($ev) ? $ev : []);
        }
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[aurora_14] ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    msgErro('Falha ao processar o aviso.', 500); // a Meta tenta de novo; a mesma mensagem não é gravada duas vezes
}

msgOk(null, 'Recebido.');

// ---------------------------------------------------------------------
// Funções
// ---------------------------------------------------------------------

/** Um evento do Messenger ou do Instagram: mensagem ou clique em botão (postback). Ignora eco, leitura e entrega. */
function a14Evento(PDO $pdo, string $canal, string $contaPai, array $ev): void
{
    $de = (string) ($ev['sender']['id'] ?? '');
    $m = is_array($ev['message'] ?? null) ? $ev['message'] : null;
    $pb = is_array($ev['postback'] ?? null) ? $ev['postback'] : null;
    if ($de === '' || ($contaPai !== '' && $de === $contaPai)) {
        return; // mensagem da própria Página
    }
    if ($m !== null && (!empty($m['is_echo']) || !empty($m['is_deleted']) || !empty($m['is_unsupported']))) {
        return; // eco (enviada pela Página, inclusive por outra ferramenta), apagada ou não suportada
    }
    if ($m === null && $pb === null) {
        return; // leitura, entrega, reação
    }
    $ts = isset($ev['timestamp']) ? intdiv((int) $ev['timestamp'], 1000) : time();
    $tipo = 'texto';
    $texto = '';
    $anexos = [];
    if ($pb !== null) {
        $mid = (string) ($pb['mid'] ?? ('pb.' . $de . '.' . ($ev['timestamp'] ?? time())));
        $texto = trim((string) ($pb['title'] ?? $pb['payload'] ?? ''));
        if ($texto === '' || strtoupper($texto) === 'GET_STARTED') {
            $texto = 'Olá';
        }
    } else {
        $mid = (string) ($m['mid'] ?? '');
        $texto = trim((string) ($m['text'] ?? ''));
        if (!empty($m['quick_reply']['payload']) && $texto === '') {
            $texto = (string) $m['quick_reply']['payload'];
        }
        if (!empty($m['reply_to']['story'])) {
            $texto = '(respondeu a um story do Instagram) ' . $texto;
        }
        foreach ($m['attachments'] ?? [] as $a) {
            $at = (string) ($a['type'] ?? '');
            $url = (string) ($a['payload']['url'] ?? '');
            if (in_array($at, ['image', 'audio', 'video', 'file'], true) && $url !== '' && !$anexos) {
                $anexo = a14Midia($url, $at);
                $tipo = $at === 'image' ? 'imagem' : ($at === 'audio' ? 'audio' : 'documento');
                if ($anexo) {
                    $anexos[] = $anexo;
                } elseif ($texto === '') {
                    $texto = '(mandou um arquivo que não pôde ser aberto)';
                    $tipo = 'texto';
                }
            } elseif ($at === 'location') {
                $texto = trim($texto . ' (mandou uma localização)');
            } elseif ($texto === '' && in_array($at, ['share', 'story_mention', 'ig_reel', 'reel', 'fallback', 'template'], true)) {
                $texto = $at === 'story_mention' ? '(mencionou o Plano PAI num story)' : '(compartilhou uma publicação)';
            }
        }
        if ($tipo === 'texto' && $texto === '') {
            return;
        }
    }
    if ($mid === '') {
        return;
    }
    $origem = $canal === 'facebook' ? '📘 Veio pelo Messenger da Página do Facebook' : '📸 Veio pelo Direct do Instagram';
    a13Receber($pdo, $canal, $de, a14Nome($pdo, $canal, $de), $tipo, $texto, $anexos, 'fbm.' . $mid, $ts, $origem);
}

/** Nome da pessoa (perfil público), só na primeira vez. */
function a14Nome(PDO $pdo, string $canal, string $id): string
{
    $st = $pdo->prepare("SELECT 1 FROM chat_contatos_externos WHERE canal = :c AND wa_id = :w AND nome IS NOT NULL AND nome <> ''");
    $st->execute([':c' => $canal, ':w' => A13_PREFIXO[$canal] . $id]);
    if ($st->fetchColumn()) {
        return '';
    }
    $r = a13MetaPagina('GET', rawurlencode($id) . '?fields=' . ($canal === 'facebook' ? 'first_name,last_name' : 'name,username'), null, 8);
    if (!$r['ok']) {
        return '';
    }
    $j = $r['json'];
    $nome = $canal === 'facebook'
        ? trim(((string) ($j['first_name'] ?? '')) . ' ' . ((string) ($j['last_name'] ?? '')))
        : trim((string) (($j['name'] ?? '') !== '' ? $j['name'] : ($j['username'] ?? '')));
    return mb_substr($nome, 0, 150);
}

/** Baixa a mídia do link da Meta e guarda no R2. Retorna o anexo ou null. */
function a14Midia(string $url, string $tipo): ?array
{
    if (!msgR2Configurado() || !preg_match('#^https://[^/]*(fbcdn\.net|fbsbx\.com|cdninstagram\.com|facebook\.com|instagram\.com)/#i', $url)) {
        return null;
    }
    $r = msgHttp('GET', $url, [], null, 30);
    if ($r['erro'] !== null || $r['status'] < 200 || $r['status'] >= 300 || $r['corpo'] === '' || strlen($r['corpo']) > 25 * 1024 * 1024) {
        return null;
    }
    $mime = strtolower(trim(explode(';', (string) ($r['cabecalhos']['content-type'] ?? ''))[0]));
    $aceitos = msgMimesAceitos();
    if (!isset($aceitos[$mime])) {
        $mime = match ($tipo) {
            'image' => 'image/jpeg',
            'audio' => 'audio/mp4',
            'video' => 'video/mp4',
            default => '',
        };
        if (!isset($aceitos[$mime])) {
            return null;
        }
    }
    $chave = msgR2NovaChave('meta', $aceitos[$mime][1]);
    if (!msgR2Enviar($chave, $r['corpo'], $mime)) {
        return null;
    }
    $nome = basename((string) parse_url($url, PHP_URL_PATH));
    return ['chave_r2' => $chave, 'nome_original' => $nome !== '' ? mb_substr($nome, 0, 255) : null, 'mime' => $mime, 'tamanho_bytes' => strlen($r['corpo'])];
}
