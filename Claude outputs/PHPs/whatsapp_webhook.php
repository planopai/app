<?php
declare(strict_types=1);
/**
 * whatsapp_webhook.php — recebe da Meta as mensagens dos clientes e os avisos de entrega/leitura.
 *
 * Não usa o login do app: quem chama é a Meta. Segurança:
 *  - GET (verificação do cadastro): hub.verify_token precisa ser igual a meta_verify_token do pai-chaves.php;
 *  - POST (avisos): cabeçalho X-Hub-Signature-256 conferido com meta_app_secret (HMAC SHA-256 do corpo).
 *
 * Endereço a informar na Meta: https://api.planoassistencialintegrado.com.br/whatsapp_webhook.php
 * Campo a assinar no webhook: messages.
 * Arquivos na mesma pasta: messenger_nucleo.php.
 */

// Mesmo bloco de CORS do sistema. A Meta não envia Origin, então ele não interfere.
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

register_shutdown_function(function () {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('[whatsapp_webhook] fatal: ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
        if (!headers_sent()) {
            http_response_code(500);
        }
    }
});

require_once __DIR__ . '/messenger_nucleo.php';

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

// ---------------------------------------------------------------------
// Verificação do cadastro (a Meta chama uma vez, ao salvar o webhook)
// ---------------------------------------------------------------------
if ($metodo === 'GET') {
    $token = (string) msgConfig('meta_verify_token', '');
    $modo = (string) ($_GET['hub_mode'] ?? '');
    $recebido = (string) ($_GET['hub_verify_token'] ?? '');
    if ($token !== '' && $modo === 'subscribe' && hash_equals($token, $recebido)) {
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
// Avisos (mensagens e status)
// ---------------------------------------------------------------------
$bruto = (string) file_get_contents('php://input');
$segredo = (string) msgConfig('meta_app_secret', '');
$assinatura = (string) ($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
if ($segredo === '' || !hash_equals('sha256=' . hash_hmac('sha256', $bruto, $segredo), $assinatura)) {
    error_log('[whatsapp_webhook] assinatura inválida ou meta_app_secret ausente');
    http_response_code(403);
    echo json_encode(['erro' => true, 'msg' => 'Assinatura inválida.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$aviso = json_decode($bruto, true);
if (!is_array($aviso) || ($aviso['object'] ?? '') !== 'whatsapp_business_account') {
    msgOk(null, 'Ignorado.');
}

$pdo = msgPdo();
$numeroPai = (string) msgConfig('meta_phone_number_id', '');

try {
    foreach ($aviso['entry'] ?? [] as $entrada) {
        foreach ($entrada['changes'] ?? [] as $mudanca) {
            $valor = $mudanca['value'] ?? [];
            if (($mudanca['field'] ?? '') === 'user_id_update' && is_array($valor)) {
                webhookTrocaBsuid($pdo, $valor['user_id_update'] ?? []); // o identificador (BSUID) do cliente mudou
                continue;
            }
            if (($mudanca['field'] ?? '') !== 'messages' || !is_array($valor)) {
                continue;
            }
            if ($numeroPai !== '' && (string) ($valor['metadata']['phone_number_id'] ?? '') !== $numeroPai) {
                continue; // aviso de outro número da conta
            }
            // nomes por telefone e por BSUID (cliente com nome de usuário pode vir sem telefone)
            $nomes = [];
            foreach ($valor['contacts'] ?? [] as $ct) {
                $dados = ['nome' => (string) ($ct['profile']['name'] ?? ''), 'username' => (string) ($ct['profile']['username'] ?? '')];
                foreach ([(string) ($ct['wa_id'] ?? ''), (string) ($ct['user_id'] ?? '')] as $chave) {
                    if ($chave !== '') {
                        $nomes[$chave] = $dados;
                    }
                }
            }
            foreach ($valor['messages'] ?? [] as $m) {
                webhookMensagem($pdo, $m, $nomes);
            }
            foreach ($valor['statuses'] ?? [] as $s) {
                webhookStatus($pdo, $s);
            }
        }
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[whatsapp_webhook] ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    // 500 faz a Meta tentar de novo; a mesma mensagem nunca é gravada duas vezes (externo_id único).
    msgErro('Falha ao processar o aviso.', 500);
}

msgOk(null, 'Recebido.');

// ---------------------------------------------------------------------
// Funções do webhook
// ---------------------------------------------------------------------

/**
 * Contato do cliente pelo telefone e/ou pelo BSUID (identificador da Meta, obrigatório desde 2026:
 * quem usa nome de usuário no WhatsApp pode chegar sem telefone). wa_id guarda o telefone; sem telefone, o BSUID.
 */
function webhookContato(PDO $pdo, string $telefone, string $bsuid, string $nome, string $username = ''): int
{
    $c = null;
    if ($bsuid !== '') {
        $sb = $pdo->prepare("SELECT * FROM chat_contatos_externos WHERE canal = 'whatsapp' AND bsuid = :b");
        $sb->execute([':b' => $bsuid]);
        $c = $sb->fetch() ?: null;
    }
    if (!$c && $telefone !== '') {
        $st = $pdo->prepare("SELECT * FROM chat_contatos_externos WHERE canal = 'whatsapp' AND wa_id = :w");
        $st->execute([':w' => $telefone]);
        $c = $st->fetch() ?: null;
    }
    if ($c) {
        $mud = [];
        $par = [':id' => $c['id']];
        if ($nome !== '' && $nome !== $c['nome']) {
            $mud[] = 'nome = :n';
            $par[':n'] = mb_substr($nome, 0, 150);
        }
        if ($bsuid !== '' && $bsuid !== (string) $c['bsuid']) {
            $mud[] = 'bsuid = :b';
            $par[':b'] = $bsuid;
        }
        if ($username !== '' && $username !== (string) $c['username']) {
            $mud[] = 'username = :u';
            $par[':u'] = mb_substr($username, 0, 60);
        }
        if ($telefone !== '' && !preg_match('/^\d+$/', (string) $c['wa_id'])) {
            $mud[] = 'wa_id = :w, telefone_e164 = :t'; // agora a Meta mandou o telefone
            $par[':w'] = $telefone;
            $par[':t'] = '+' . $telefone;
        }
        if ($mud) {
            $pdo->prepare('UPDATE chat_contatos_externos SET ' . implode(', ', $mud) . ', atualizado_em = NOW() WHERE id = :id')->execute($par);
        }
        return (int) $c['id'];
    }
    $pdo->prepare("INSERT INTO chat_contatos_externos (canal, wa_id, telefone_e164, nome, bsuid, username) VALUES ('whatsapp', :w, :t, :n, :b, :u)")
        ->execute([
            ':w' => $telefone !== '' ? $telefone : $bsuid, ':t' => $telefone !== '' ? '+' . $telefone : null,
            ':n' => $nome !== '' ? mb_substr($nome, 0, 150) : null, ':b' => $bsuid !== '' ? $bsuid : null, ':u' => $username !== '' ? mb_substr($username, 0, 60) : null,
        ]);
    return (int) $pdo->lastInsertId();
}

/** O BSUID do cliente mudou (troca de número): atualiza o contato. */
function webhookTrocaBsuid(PDO $pdo, array $trocas): void
{
    foreach ($trocas as $t) {
        $antigo = (string) ($t['user_id']['previous'] ?? '');
        $novo = (string) ($t['user_id']['current'] ?? '');
        if ($antigo === '' || $novo === '') {
            continue;
        }
        $pdo->prepare("UPDATE chat_contatos_externos SET bsuid = :n, wa_id = IF(wa_id = :a1, :n2, wa_id), atualizado_em = NOW() WHERE bsuid = :a2")
            ->execute([':n' => $novo, ':n2' => $novo, ':a1' => $antigo, ':a2' => $antigo]);
    }
}

/** Cliente apagou ou editou uma mensagem no WhatsApp. */
function webhookApagadaOuEditada(PDO $pdo, array $m, string $tipoWa): void
{
    $bloco = $m[$tipoWa] ?? [];
    $original = (string) ($bloco['original_message_id'] ?? $bloco['message_id'] ?? $m['context']['id'] ?? '');
    if ($original === '') {
        error_log('[whatsapp_webhook] ' . $tipoWa . ' sem a mensagem original: ' . json_encode($m));
        return;
    }
    $sm = $pdo->prepare("SELECT id, conversa_id FROM chat_mensagens WHERE externo_id = :w AND autor_tipo = 'contato'");
    $sm->execute([':w' => $original]);
    $alvo = $sm->fetch();
    if (!$alvo) {
        return;
    }
    $conversa = msgConversa($pdo, (int) $alvo['conversa_id']);
    if (!$conversa) {
        return;
    }
    $dest = msgDestinatarios($pdo, $conversa);
    if ($tipoWa === 'revoke') {
        $pdo->prepare('UPDATE chat_mensagens SET apagada_em = NOW() WHERE id = :id AND apagada_em IS NULL')->execute([':id' => $alvo['id']]);
        $dados = ['conversa_id' => (int) $alvo['conversa_id'], 'mensagem_id' => (int) $alvo['id']];
        msgDepois(fn() => msgAblyAvisar($dest, 'mensagem_apagada', $dados));
        return;
    }
    $novo = (string) ($bloco['message']['text']['body'] ?? $bloco['text']['body'] ?? $bloco['body'] ?? $m['text']['body'] ?? '');
    if ($novo === '') {
        error_log('[whatsapp_webhook] edit sem texto novo: ' . json_encode($m));
        return;
    }
    $pdo->prepare('UPDATE chat_mensagens SET texto = :t WHERE id = :id')->execute([':t' => msgTextoMensagem($novo) . ' (editada)', ':id' => $alvo['id']]);
    $msg = msgMensagemPorId($pdo, (int) $alvo['id']);
    if ($msg) {
        msgDepois(fn() => msgAblyAvisar($dest, 'mensagem', $msg + ['notificar' => false]));
    }
}

/**
 * Conversa única do cliente, com um atendimento em andamento.
 * Se não houver (primeiro contato, ou o anterior foi encerrado e está no histórico), abre um novo na fila.
 * Retorna [conversa_id, atendimento_id, abriu_novo].
 */
function webhookConversa(PDO $pdo, int $contatoId): array
{
    $st = $pdo->prepare('SELECT id, status_atendimento, atendimento_atual_id FROM chat_conversas WHERE contato_externo_id = :c FOR UPDATE');
    $st->execute([':c' => $contatoId]);
    $c = $st->fetch();
    if (!$c) {
        $pdo->prepare("INSERT INTO chat_conversas (tipo, canal, contato_externo_id) VALUES ('externo', 'whatsapp', :c)")
            ->execute([':c' => $contatoId]);
        $id = (int) $pdo->lastInsertId();
        return [$id, msgNovoAtendimento($pdo, $id), true];
    }
    if ($c['atendimento_atual_id'] === null || $c['status_atendimento'] === 'encerrado' || $c['status_atendimento'] === null) {
        return [(int) $c['id'], msgNovoAtendimento($pdo, (int) $c['id']), true];
    }
    return [(int) $c['id'], (int) $c['atendimento_atual_id'], false];
}

/** Guarda no R2 uma mídia recebida. Retorna o anexo ou null. */
function webhookMidia(string $mediaId, ?string $nomeArquivo): ?array
{
    if (!msgMetaConfigurado() || !msgR2Configurado()) {
        return null;
    }
    $midia = msgMetaBaixarMidia($mediaId);
    if ($midia === null) {
        return null;
    }
    $aceitos = msgMimesAceitos();
    $ext = $aceitos[$midia['mime']][1] ?? 'bin';
    $chave = msgR2NovaChave('whatsapp', $ext);
    if (!msgR2Enviar($chave, $midia['bytes'], $midia['mime'])) {
        return null;
    }
    return [
        'chave_r2' => $chave,
        'nome_original' => $nomeArquivo !== null && $nomeArquivo !== '' ? mb_substr($nomeArquivo, 0, 255) : null,
        'mime' => $midia['mime'],
        'tamanho_bytes' => strlen($midia['bytes']),
    ];
}

function webhookMensagem(PDO $pdo, array $m, array $nomes): void
{
    $wamid = (string) ($m['id'] ?? '');
    $waId = preg_replace('/\D/', '', (string) ($m['from'] ?? '')) ?? '';
    $bsuid = trim((string) ($m['from_user_id'] ?? ''));
    if ($wamid === '' || ($waId === '' && $bsuid === '')) {
        return;
    }
    $st = $pdo->prepare('SELECT 1 FROM chat_mensagens WHERE externo_id = :w');
    $st->execute([':w' => $wamid]);
    if ($st->fetchColumn()) {
        return; // a Meta reenviou um aviso já gravado
    }
    $tipoWa = (string) ($m['type'] ?? '');
    if ($tipoWa === 'revoke' || $tipoWa === 'edit') {
        webhookApagadaOuEditada($pdo, $m, $tipoWa);
        return;
    }
    if ($tipoWa === 'system') {
        // cliente trocou de número: o BSUID muda
        $sys = $m['system'] ?? [];
        if (($sys['type'] ?? '') === 'user_changed_user_id' && $bsuid !== '' && !empty($sys['user_id'])) {
            webhookTrocaBsuid($pdo, [['user_id' => ['previous' => $bsuid, 'current' => (string) $sys['user_id']]]]);
        }
        return;
    }
    if ($tipoWa === 'reaction') {
        return;
    }

    // conteúdo
    $tipo = 'texto';
    $texto = '';
    $anexos = [];
    $semAnexo = false;
    switch ($tipoWa) {
        case 'text':
            $texto = (string) ($m['text']['body'] ?? '');
            break;
        case 'image':
        case 'sticker':
        case 'audio':
        case 'voice':
        case 'video':
        case 'document':
            $bloco = $m[$tipoWa] ?? [];
            $tipo = match ($tipoWa) {
                'image', 'sticker' => 'imagem',
                'audio', 'voice' => 'audio',
                default => 'documento',
            };
            $texto = (string) ($bloco['caption'] ?? '');
            $anexo = webhookMidia((string) ($bloco['id'] ?? ''), $bloco['filename'] ?? null);
            if ($anexo) {
                $anexos[] = $anexo;
            } else {
                $semAnexo = true;
            }
            break;
        case 'location':
            $loc = $m['location'] ?? [];
            $lat = (string) ($loc['latitude'] ?? '');
            $lng = (string) ($loc['longitude'] ?? '');
            $texto = '📍 Localização' . (!empty($loc['name']) ? ': ' . $loc['name'] : '') . (!empty($loc['address']) ? ' — ' . $loc['address'] : '')
                . "\nhttps://maps.google.com/?q={$lat},{$lng}";
            break;
        case 'contacts':
            $partes = [];
            foreach ($m['contacts'] ?? [] as $ct) {
                $partes[] = trim(($ct['name']['formatted_name'] ?? '') . ' ' . ($ct['phones'][0]['phone'] ?? ''));
            }
            $texto = '👤 Contato compartilhado: ' . implode('; ', array_filter($partes));
            break;
        case 'button':
            $texto = (string) ($m['button']['text'] ?? '');
            break;
        case 'interactive':
            $i = $m['interactive'] ?? [];
            $texto = (string) ($i['button_reply']['title'] ?? $i['list_reply']['title'] ?? '');
            break;
        default:
            $texto = '[Mensagem do tipo "' . $tipoWa . '" não suportada pelo Messenger. Veja no aparelho do WhatsApp.]';
    }
    if ($semAnexo) {
        $tipo = 'texto';
        $texto = trim('[Arquivo recebido, mas não foi possível baixar.] ' . $texto);
    }
    $texto = msgTextoMensagem($texto);

    // resposta a uma mensagem anterior
    $respondeA = null;
    if (!empty($m['context']['id'])) {
        $sr = $pdo->prepare('SELECT id FROM chat_mensagens WHERE externo_id = :w');
        $sr->execute([':w' => (string) $m['context']['id']]);
        $respondeA = ($v = $sr->fetchColumn()) ? (int) $v : null;
    }

    $ts = (int) ($m['timestamp'] ?? time());
    $pdo->beginTransaction();
    $perfil = $nomes[$waId] ?? $nomes[$bsuid] ?? ['nome' => '', 'username' => ''];
    $contatoId = webhookContato($pdo, $waId, $bsuid, (string) $perfil['nome'], (string) $perfil['username']);
    // Pacote 4B: resposta da avaliação (nota de 1 a 5) depois do encerramento não abre atendimento novo
    $notaAvaliacao = 0;
    $sb = $pdo->prepare('SELECT id, bot_estado, bot_ref FROM chat_conversas WHERE contato_externo_id = :c');
    $sb->execute([':c' => $contatoId]);
    $estadoBot = $sb->fetch();
    if ($estadoBot && $estadoBot['bot_estado'] === 'avaliacao') {
        if ($tipo === 'texto' && preg_match('/^\s*([1-5])\s*(estrelas?|⭐+)?\s*[.!]?\s*$/iu', $texto, $mn) && $estadoBot['bot_ref']) {
            $notaAvaliacao = (int) $mn[1];
        } else {
            $pdo->prepare('UPDATE chat_conversas SET bot_estado = NULL, bot_ref = NULL WHERE id = :id')->execute([':id' => $estadoBot['id']]);
        }
    }
    if ($notaAvaliacao) {
        [$conversaId, $atendimentoId, $novoAtendimento] = [(int) $estadoBot['id'], (int) $estadoBot['bot_ref'], false];
    } else {
        [$conversaId, $atendimentoId, $novoAtendimento] = webhookConversa($pdo, $contatoId);
    }
    try {
        $mensagemId = msgGravar($pdo, $conversaId, [
            'atendimento_id' => $atendimentoId,
            'autor_tipo' => 'contato',
            'autor_contato_id' => $contatoId,
            'tipo' => $tipo,
            'texto' => $texto !== '' ? $texto : null,
            'responde_a_id' => $respondeA,
            'externo_id' => $wamid,
            'criado_em' => date('Y-m-d H:i:s.v', $ts),
            'anexos' => $anexos,
        ]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        if (($e->errorInfo[1] ?? 0) === 1062) {
            return; // gravada por um aviso simultâneo
        }
        throw $e;
    }
    // janela de 24 h a partir da última mensagem do cliente
    $pdo->prepare('UPDATE chat_conversas SET janela_ate = GREATEST(COALESCE(janela_ate, :z), :j) WHERE id = :id')
        ->execute([':z' => '1970-01-02 00:00:00', ':j' => date('Y-m-d H:i:s', $ts + 86400), ':id' => $conversaId]);
    $pdo->commit();

    // Regra da Meta: responder 200 ao webhook logo. As mensagens automáticas e os avisos saem depois da resposta.
    // lead de anúncio (Click-to-WhatsApp do Facebook/Instagram): a Meta manda o "referral" com o anúncio de origem
    if (is_array($m['referral'] ?? null)) {
        $ref = $m['referral'];
        $origem = trim(implode(' · ', array_filter([(string) ($ref['headline'] ?? ''), (string) ($ref['source_type'] ?? '') === 'ad' ? 'anúncio' : (string) ($ref['source_type'] ?? ''), (string) ($ref['source_url'] ?? '')])));
        if ($origem !== '') {
            try {
                $pdo->prepare("UPDATE chat_conversas SET ia_venda_json = :j WHERE id = :id AND (ia_venda_json IS NULL OR ia_venda_json = '')")
                    ->execute([':j' => json_encode(['origem' => mb_substr($origem, 0, 200)], JSON_UNESCAPED_UNICODE), ':id' => $conversaId]);
                msgSistema($pdo, $conversaId, '📣 Veio do anúncio: ' . mb_substr($origem, 0, 200));
            } catch (Throwable $e) {
                error_log('[whatsapp_webhook] referral: ' . $e->getMessage());
            }
        }
    }
    // o tipo vem do WhatsApp (vale mesmo se a mídia não pôde ser baixada)
    $tipoBot = match ($tipoWa) {
        'image' => 'imagem',
        'audio', 'voice' => 'audio',
        'document' => 'documento',
        default => $tipo,
    };
    $mime = (string) ($anexos[0]['mime'] ?? ($m[$tipoWa]['mime_type'] ?? ''));
    msgDepois(fn() => webhookDepoisDeGravar($pdo, $conversaId, $mensagemId, (int) $atendimentoId, $novoAtendimento, $notaAvaliacao, $tipoBot, $texto, $mime));
}

function webhookDepoisDeGravar(PDO $pdo, int $conversaId, int $mensagemId, int $atendimentoId, bool $novoAtendimento, int $notaAvaliacao, string $tipo, string $texto, string $mime): void
{
    if ($notaAvaliacao) {
        $pdo->prepare('UPDATE chat_atendimentos SET avaliacao_nota = :n, avaliacao_em = NOW() WHERE id = :a')->execute([':n' => $notaAvaliacao, ':a' => $atendimentoId]);
        $pdo->prepare('UPDATE chat_conversas SET bot_estado = NULL, bot_ref = NULL WHERE id = :id')->execute([':id' => $conversaId]);
        msgBotEnviar($pdo, $conversaId, msgBotTexto($pdo, 'avaliacao_obrigado'), $atendimentoId);
        $msgNota = msgMensagemPorId($pdo, $mensagemId);
        $conv = msgConversa($pdo, $conversaId);
        if ($msgNota && $conv) {
            $dest = msgDestinatarios($pdo, $conv);
            msgDepois(fn() => msgAblyAvisar($dest, 'mensagem', $msgNota + ['notificar' => false]));
        }
        return;
    }
    // Pacote 4B: boas-vindas, menu de setores e fora do horário (se ligados em Configurações › Mensagens automáticas)
    $avisarFila = $novoAtendimento;
    if (msgBotTexto($pdo, 'auto_ativo') === '1') {
        try {
            $avisarFila = msgBotAoChegar($pdo, $conversaId, $novoAtendimento, $texto, $tipo, $mime, $mensagemId);
        } catch (Throwable $e) {
            error_log('[whatsapp_webhook] mensagem automática: ' . $e->getMessage());
            $avisarFila = $novoAtendimento;
        }
    }
    if ($avisarFila) {
        msgAvisarFila($pdo, $conversaId); // distribuição manual: entra na fila e um atendente assume
    }
    msgDifundir($pdo, $conversaId, $mensagemId, null);
    // Pacote 5B: atendimento novo — procura o telefone do cliente nos contratos da Unymos.
    // Fica por ÚLTIMO: a mensagem, o menu e o aviso à equipe já saíram; a Unymos lenta não atrasa nada disso.
    if ($novoAtendimento) {
        msgDepois(function () use ($pdo, $conversaId) {
            try {
                @set_time_limit(120);
                $sc = $pdo->prepare('SELECT contato_externo_id FROM chat_conversas WHERE id = :id');
                $sc->execute([':id' => $conversaId]);
                msgAutoVincular($pdo, (int) $sc->fetchColumn(), $conversaId);
            } catch (Throwable $e) {
                error_log('[whatsapp_webhook] vínculo automático: ' . $e->getMessage());
            }
        });
    }
    // Pacote 5C: confere os Pix gerados pelo Messenger que ainda estão pendentes (avisa na conversa quando pagos)
    msgDepois(function () use ($pdo) {
        try {
            msgUnyConferirPix($pdo);
            msgUnyCopiaAosPoucos($pdo); // sem cron: renova a cópia dos contratos aos poucos quando passa de 24 h
            msgEncerrarOciososTalvez($pdo); // encerra conversas paradas (no máximo a cada 2 min)
        } catch (Throwable $e) {
            error_log('[whatsapp_webhook] Unymos em segundo plano: ' . $e->getMessage());
        }
    });
}

function webhookStatus(PDO $pdo, array $s): void
{
    $wamid = (string) ($s['id'] ?? '');
    $novo = match ((string) ($s['status'] ?? '')) {
        'sent' => 'enviada',
        'delivered' => 'entregue',
        'read' => 'lida',
        'failed' => 'falhou',
        default => null,
    };
    if ($wamid === '' || $novo === null) {
        return;
    }
    $st = $pdo->prepare('SELECT id, conversa_id, status_envio FROM chat_mensagens WHERE externo_id = :w');
    $st->execute([':w' => $wamid]);
    $m = $st->fetch();
    if (!$m) {
        return;
    }
    // custo informado pela Meta: cobrável ou não e a categoria (service, utility, marketing, authentication)
    if (is_array($s['pricing'] ?? null)) {
        $pdo->prepare('UPDATE chat_mensagens SET cobravel = :c, categoria_meta = :g, tipo_preco = :t WHERE id = :id')->execute([
            ':c' => !empty($s['pricing']['billable']) ? 1 : 0,
            ':g' => mb_substr((string) ($s['pricing']['category'] ?? ''), 0, 20) ?: null,
            ':t' => mb_substr((string) ($s['pricing']['type'] ?? ''), 0, 30) ?: null,
            ':id' => $m['id'],
        ]);
    }
    // só avança (enviada → entregue → lida); "falhou" sempre vale
    $ordem = ['pendente' => 0, 'enviada' => 1, 'entregue' => 2, 'lida' => 3, 'falhou' => 4];
    if ($novo !== 'falhou' && ($ordem[$m['status_envio'] ?? 'pendente'] ?? 0) >= $ordem[$novo]) {
        return;
    }
    $erro = null;
    if ($novo === 'falhou') {
        $e = $s['errors'][0] ?? [];
        $erro = mb_substr(trim((string) ($e['error_data']['details'] ?? $e['title'] ?? $e['message'] ?? 'Falha na entrega.')), 0, 255);
    }
    $pdo->prepare('UPDATE chat_mensagens SET status_envio = :s, erro_envio = :e WHERE id = :id')
        ->execute([':s' => $novo, ':e' => $erro, ':id' => $m['id']]);
    $conversa = msgConversa($pdo, (int) $m['conversa_id']);
    if ($conversa) {
        $dest = msgDestinatarios($pdo, $conversa);
        $dados = ['conversa_id' => (int) $m['conversa_id'], 'mensagem_id' => (int) $m['id'], 'status_envio' => $novo, 'erro_envio' => $erro];
        msgDepois(fn() => msgAblyAvisar($dest, 'status_envio', $dados));
    }
}
