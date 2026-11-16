<?php
declare(strict_types=1);
/**
 * aurora_13.php — Aurora no site, no Facebook e no Instagram: canais do Messenger além do WhatsApp (16/11/2026)
 *
 * DOIS PAPÉIS:
 *  1. Endereço do chat do site (o widget aurora-chat.js chama este arquivo):
 *     https://api.planoassistencialintegrado.com.br/aurora_13.php
 *  2. Biblioteca dos canais, carregada pelo messenger_nucleo.php, pelo messenger.php, pelo messenger_aurora.php e pelo
 *     aurora_14.php (Facebook e Instagram): entrada da mensagem no Messenger, envio pelo canal certo e instruções da Aurora.
 *
 * DECISÃO DA GESTÃO (16/11/2026): site, Facebook e Instagram entram no MESMO Messenger, com a mesma Aurora, a mesma Base de
 * Conhecimento, as mesmas habilidades por setor e a mesma fila. No site, o atendimento é imediato e 24 horas: a Aurora faz o
 * primeiro atendimento, tira as dúvidas e, quando precisa de uma pessoa, pede nome e celular antes de transferir (falecimento
 * e emergência não esperam). Fora do horário, a conversa fica na fila do setor; a equipe pode continuar pelo WhatsApp
 * (Nova conversa) com o celular informado.
 *
 * BANCO: não cria tabela nem coluna. Usa as colunas que já existem:
 *  - chat_contatos_externos.canal = 'site' | 'facebook' | 'instagram'; wa_id guarda o identificador do canal com prefixo
 *    (site:<hash do aparelho>, fb:<id da pessoa na Página>, ig:<id da pessoa no Instagram>); telefone_e164 só quando a
 *    pessoa informa o celular.
 *  - chat_conversas.canal = o mesmo canal do contato; janela_ate: site +30 dias a cada mensagem (sem regra da Meta);
 *    Facebook e Instagram +24 h, como no WhatsApp.
 *  Se a coluna canal for ENUM só com 'interno' e 'whatsapp', o chat responde que falta o SQL (ver a13CanalAceito()).
 *
 * pai-chaves.php (Facebook e Instagram, só para o aurora_14.php):
 *  meta_page_id, meta_page_token (token da Página, com pages_messaging e instagram_manage_messages), meta_ig_id (id da conta do Instagram),
 *  meta_human_agent (true depois que a Meta liberar a marcação HUMAN_AGENT: resposta da equipe até 7 dias).
 *  site_chat_ativo (false desliga o chat do site; padrão ligado).
 *
 * SEGURANÇA DO CHAT DO SITE: sem login. O aparelho guarda um código aleatório (token) e o banco guarda só o hash dele.
 * Limites por aparelho e por IP (arquivos temporários, sem banco), campo isca contra robô, texto até 1.000 caracteres.
 * O site só recebe as mensagens da própria conversa: sem notas internas, sem mensagens de sistema e sem dados de outros.
 */

const A13_CANAIS = ['site' => 'Site', 'facebook' => 'Facebook', 'instagram' => 'Instagram'];
const A13_PREFIXO = ['site' => 'site:', 'facebook' => 'fb:', 'instagram' => 'ig:'];

// =====================================================================
// Funções comuns dos canais
// =====================================================================

/** Canal do contato (whatsapp, site, facebook, instagram). */
function a13CanalDoContato(PDO $pdo, int $contatoId): string
{
    $st = $pdo->prepare('SELECT canal FROM chat_contatos_externos WHERE id = :id');
    $st->execute([':id' => $contatoId]);
    $c = (string) $st->fetchColumn();
    return $c !== '' ? $c : 'whatsapp';
}

/** true quando o canal é um dos novos (não WhatsApp). */
function a13CanalNovo(string $canal): bool
{
    return isset(A13_CANAIS[$canal]);
}

/** A coluna canal aceita o valor? (ENUM antigo só com interno/whatsapp recusa). */
function a13CanalAceito(PDO $pdo, string $canal): bool
{
    static $cache = [];
    if (isset($cache[$canal])) {
        return $cache[$canal];
    }
    $ok = true;
    foreach (['chat_contatos_externos', 'chat_conversas'] as $tabela) {
        try {
            $col = $pdo->query("SHOW COLUMNS FROM {$tabela} LIKE 'canal'")->fetch();
            $tipo = strtolower((string) ($col['Type'] ?? ''));
            if (str_starts_with($tipo, 'enum(') && !str_contains($tipo, "'" . $canal . "'")) {
                $ok = false;
            }
        } catch (Throwable $e) {
            $ok = false;
        }
    }
    return $cache[$canal] = $ok;
}

/** Contato do canal pelo identificador externo (sem o prefixo). Cria se não existir. */
function a13Contato(PDO $pdo, string $canal, string $idExterno, string $nome = ''): int
{
    $wa = A13_PREFIXO[$canal] . $idExterno;
    $st = $pdo->prepare('SELECT id, nome FROM chat_contatos_externos WHERE canal = :c AND wa_id = :w');
    $st->execute([':c' => $canal, ':w' => $wa]);
    $c = $st->fetch();
    if ($c) {
        if ($nome !== '' && trim((string) $c['nome']) === '') {
            $pdo->prepare('UPDATE chat_contatos_externos SET nome = :n, atualizado_em = NOW() WHERE id = :id')
                ->execute([':n' => mb_substr($nome, 0, 150), ':id' => $c['id']]);
        }
        return (int) $c['id'];
    }
    $pdo->prepare('INSERT INTO chat_contatos_externos (canal, wa_id, telefone_e164, nome) VALUES (:c, :w, NULL, :n)')
        ->execute([':c' => $canal, ':w' => $wa, ':n' => $nome !== '' ? mb_substr($nome, 0, 150) : null]);
    return (int) $pdo->lastInsertId();
}

/** Conversa única do contato, com um atendimento em andamento (igual ao WhatsApp). Retorna [conversa, atendimento, novo]. */
function a13Conversa(PDO $pdo, int $contatoId, string $canal): array
{
    $st = $pdo->prepare('SELECT id, status_atendimento, atendimento_atual_id FROM chat_conversas WHERE contato_externo_id = :c FOR UPDATE');
    $st->execute([':c' => $contatoId]);
    $c = $st->fetch();
    if (!$c) {
        $pdo->prepare("INSERT INTO chat_conversas (tipo, canal, contato_externo_id) VALUES ('externo', :canal, :c)")
            ->execute([':canal' => $canal, ':c' => $contatoId]);
        $id = (int) $pdo->lastInsertId();
        return [$id, msgNovoAtendimento($pdo, $id), true];
    }
    if ($c['atendimento_atual_id'] === null || $c['status_atendimento'] === 'encerrado' || $c['status_atendimento'] === null) {
        return [(int) $c['id'], msgNovoAtendimento($pdo, (int) $c['id']), true];
    }
    return [(int) $c['id'], (int) $c['atendimento_atual_id'], false];
}

/**
 * Mensagem que chegou por um canal novo: grava no Messenger e, depois da resposta, roda a Aurora, a fila e os avisos.
 * Retorna [mensagem_id, conversa_id] ou null (repetida).
 */
function a13Receber(PDO $pdo, string $canal, string $idExterno, string $nome, string $tipo, string $texto, array $anexos, string $externoId, ?int $ts = null, string $origem = ''): ?array
{
    if ($externoId !== '') {
        $st = $pdo->prepare('SELECT 1 FROM chat_mensagens WHERE externo_id = :w');
        $st->execute([':w' => $externoId]);
        if ($st->fetchColumn()) {
            return null;
        }
    }
    $ts = $ts ?? time();
    $texto = msgTextoMensagem($texto);
    $pdo->beginTransaction();
    try {
        $contatoId = a13Contato($pdo, $canal, $idExterno, $nome);
        // resposta da avaliação (nota de 1 a 5) depois do encerramento não abre atendimento novo
        $nota = 0;
        $sb = $pdo->prepare('SELECT id, bot_estado, bot_ref FROM chat_conversas WHERE contato_externo_id = :c');
        $sb->execute([':c' => $contatoId]);
        $estadoBot = $sb->fetch();
        if ($estadoBot && $estadoBot['bot_estado'] === 'avaliacao') {
            if ($tipo === 'texto' && preg_match('/^\s*([1-5])\s*(estrelas?|⭐+)?\s*[.!]?\s*$/iu', $texto, $mn) && $estadoBot['bot_ref']) {
                $nota = (int) $mn[1];
            } else {
                $pdo->prepare('UPDATE chat_conversas SET bot_estado = NULL, bot_ref = NULL WHERE id = :id')->execute([':id' => $estadoBot['id']]);
            }
        }
        if ($nota) {
            [$conversaId, $atendimentoId, $novo] = [(int) $estadoBot['id'], (int) $estadoBot['bot_ref'], false];
        } else {
            [$conversaId, $atendimentoId, $novo] = a13Conversa($pdo, $contatoId, $canal);
        }
        if ($novo && $origem !== '') {
            msgSistema($pdo, $conversaId, $origem); // de onde veio (fica só no sistema; o cliente não vê)
        }
        $mensagemId = msgGravar($pdo, $conversaId, [
            'atendimento_id' => $atendimentoId,
            'autor_tipo' => 'contato',
            'autor_contato_id' => $contatoId,
            'tipo' => $tipo,
            'texto' => $texto !== '' ? $texto : null,
            'externo_id' => $externoId !== '' ? $externoId : null,
            'criado_em' => date('Y-m-d H:i:s.v', $ts),
            'anexos' => $anexos,
        ]);
        // site: sem regra de janela (30 dias a cada mensagem); Facebook e Instagram: 24 h, como no WhatsApp
        $janela = $canal === 'site' ? 30 * 86400 : 86400;
        $pdo->prepare('UPDATE chat_conversas SET janela_ate = GREATEST(COALESCE(janela_ate, :z), :j) WHERE id = :id')
            ->execute([':z' => '1970-01-02 00:00:00', ':j' => date('Y-m-d H:i:s', $ts + $janela), ':id' => $conversaId]);
        // site: celular informado na conversa fica no contato (a equipe continua pelo WhatsApp e a Unymos é consultada)
        $novoCelular = false;
        if ($canal === 'site' && $tipo === 'texto' && ($cel = a13CelularDoTexto($texto)) !== '') {
            $sc = $pdo->prepare('SELECT telefone_e164 FROM chat_contatos_externos WHERE id = :id');
            $sc->execute([':id' => $contatoId]);
            if ((string) $sc->fetchColumn() !== $cel) {
                $pdo->prepare('UPDATE chat_contatos_externos SET telefone_e164 = :t, uny_busca_em = NULL, atualizado_em = NOW() WHERE id = :id')
                    ->execute([':t' => $cel, ':id' => $contatoId]);
                $novoCelular = true;
            }
        }
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (($e->errorInfo[1] ?? 0) === 1062) {
            return null; // gravada por um aviso simultâneo
        }
        throw $e;
    }
    $mime = (string) ($anexos[0]['mime'] ?? '');
    msgDepois(fn() => a13DepoisDeGravar($pdo, $conversaId, $mensagemId, (int) $atendimentoId, $novo, $nota, $tipo, $texto, $mime, $novoCelular, $contatoId));
    return [$mensagemId, $conversaId];
}

/** Depois da resposta: avaliação, mensagens automáticas e Aurora, fila, avisos à equipe e vínculo com a Unymos. */
function a13DepoisDeGravar(PDO $pdo, int $conversaId, int $mensagemId, int $atendimentoId, bool $novo, int $nota, string $tipo, string $texto, string $mime, bool $novoCelular, int $contatoId): void
{
    if ($nota) {
        $pdo->prepare('UPDATE chat_atendimentos SET avaliacao_nota = :n, avaliacao_em = NOW() WHERE id = :a')->execute([':n' => $nota, ':a' => $atendimentoId]);
        $pdo->prepare('UPDATE chat_conversas SET bot_estado = NULL, bot_ref = NULL WHERE id = :id')->execute([':id' => $conversaId]);
        msgBotEnviar($pdo, $conversaId, msgBotTexto($pdo, 'avaliacao_obrigado'), $atendimentoId);
        msgDifundir($pdo, $conversaId, $mensagemId, null);
        return;
    }
    $avisarFila = $novo;
    if (msgBotTexto($pdo, 'auto_ativo') === '1') {
        try {
            $avisarFila = msgBotAoChegar($pdo, $conversaId, $novo, $texto, $tipo, $mime, $mensagemId);
        } catch (Throwable $e) {
            error_log('[aurora_13] mensagem automática: ' . $e->getMessage());
            $avisarFila = $novo;
        }
    }
    if ($avisarFila) {
        msgAvisarFila($pdo, $conversaId);
    }
    msgDifundir($pdo, $conversaId, $mensagemId, null);
    if ($novoCelular && function_exists('msgAutoVincular')) {
        try {
            @set_time_limit(120);
            msgAutoVincular($pdo, $contatoId, $conversaId, true);
        } catch (Throwable $e) {
            error_log('[aurora_13] vínculo automático: ' . $e->getMessage());
        }
    }
    try {
        msgEncerrarOciososTalvez($pdo);
    } catch (Throwable $e) {
        error_log('[aurora_13] ociosos: ' . $e->getMessage());
    }
}

/** Celular brasileiro escrito no texto, no formato +55DDDNÚMERO; vazio se não houver. */
function a13CelularDoTexto(string $texto): string
{
    if (!preg_match_all('/(?:\+?\s*55[\s.-]*)?\(?\s*\d{2}\s*\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]*\d{4}/u', $texto, $m)) {
        return '';
    }
    foreach ($m[0] as $cand) {
        $d = preg_replace('/\D/', '', $cand) ?? '';
        if (strlen($d) >= 12 && str_starts_with($d, '55')) {
            $d = substr($d, 2);
        }
        if (strlen($d) === 11 && $d[2] === '9' && (int) substr($d, 0, 2) >= 11) {
            return '+55' . $d;
        }
        if (strlen($d) === 10 && (int) substr($d, 0, 2) >= 11 && in_array($d[2], ['6', '7', '8', '9'], true)) {
            return '+55' . substr($d, 0, 2) . '9' . substr($d, 2); // celular antigo sem o 9
        }
    }
    return '';
}

/**
 * Entrega ao canal uma mensagem já gravada. $texto é o texto final (com a assinatura quando o canal mostra).
 * Retorna ['ok' => bool, 'externo' => string, 'erro' => string].
 */
function a13Entregar(PDO $pdo, string $canal, string $waId, string $texto, ?array $anexo = null): array
{
    if ($canal === 'site') {
        // o site busca as mensagens da conversa; não há envio
        return ['ok' => true, 'externo' => 'site.' . bin2hex(random_bytes(8)), 'erro' => ''];
    }
    if ($canal === 'facebook' || $canal === 'instagram') {
        $destino = substr($waId, strlen(A13_PREFIXO[$canal]));
        return a13MetaEnviar($pdo, $canal, $destino, $texto, $anexo);
    }
    return ['ok' => false, 'externo' => '', 'erro' => 'Canal desconhecido.'];
}

/** Chamada à Graph API com o token da Página (Facebook e Instagram). */
function a13MetaPagina(string $metodo, string $caminho, ?array $corpo = null, int $timeout = 15): array
{
    $token = (string) msgConfig('meta_page_token', '');
    if ($token === '') {
        return ['ok' => false, 'status' => 0, 'json' => [], 'erro' => 'Token da Página não configurado (meta_page_token no pai-chaves.php).'];
    }
    $url = msgMetaUrl($caminho);
    $url .= (str_contains($url, '?') ? '&' : '?') . 'access_token=' . rawurlencode($token);
    $r = msgHttp($metodo, $url, ['Content-Type: application/json'], $corpo === null ? null : json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $timeout);
    $json = json_decode((string) $r['corpo'], true);
    $json = is_array($json) ? $json : [];
    $ok = $r['erro'] === null && $r['status'] >= 200 && $r['status'] < 300;
    $erro = $ok ? '' : (string) ($json['error']['error_user_msg'] ?? $json['error']['message'] ?? $r['erro'] ?? ('HTTP ' . $r['status']));
    return ['ok' => $ok, 'status' => $r['status'], 'json' => $json, 'erro' => mb_substr($erro, 0, 250)];
}

/** Envia texto (em partes, se for longo) e anexo pelo Messenger do Facebook ou pelo Direct do Instagram. */
function a13MetaEnviar(PDO $pdo, string $canal, string $destino, string $texto, ?array $anexo): array
{
    if ($destino === '') {
        return ['ok' => false, 'externo' => '', 'erro' => 'Destinatário vazio.'];
    }
    // dentro de 24 h da última mensagem da pessoa: resposta comum; depois, só com a marcação HUMAN_AGENT (até 7 dias)
    $base = ['recipient' => ['id' => $destino], 'messaging_type' => 'RESPONSE'];
    if ((bool) msgConfig('meta_human_agent', false)) {
        $sj = $pdo->prepare("SELECT c.janela_ate FROM chat_conversas c INNER JOIN chat_contatos_externos ce ON ce.id = c.contato_externo_id
                              WHERE ce.canal = :c AND ce.wa_id = :w LIMIT 1");
        $sj->execute([':c' => $canal, ':w' => A13_PREFIXO[$canal] . $destino]);
        $ate = (string) $sj->fetchColumn();
        if ($ate !== '' && strtotime($ate) < time()) {
            $base = ['recipient' => ['id' => $destino], 'messaging_type' => 'MESSAGE_TAG', 'tag' => 'HUMAN_AGENT'];
        }
    }
    $caminho = 'me/messages'; // Página e Instagram ligado à Página: o mesmo endereço, com o token da Página
    $externo = '';
    if ($anexo) {
        $tipo = str_starts_with((string) $anexo['mime'], 'image/') ? 'image' : (str_starts_with((string) $anexo['mime'], 'audio/') ? 'audio' : (str_starts_with((string) $anexo['mime'], 'video/') ? 'video' : 'file'));
        $r = a13MetaPagina('POST', $caminho, $base + ['message' => ['attachment' => ['type' => $tipo, 'payload' => ['url' => msgR2LinkAssinado('GET', (string) $anexo['chave_r2'], 3600), 'is_reusable' => false]]]]);
        if (!$r['ok']) {
            return ['ok' => false, 'externo' => '', 'erro' => $r['erro']];
        }
        $externo = (string) ($r['json']['message_id'] ?? '');
    }
    $limite = $canal === 'instagram' ? 1000 : 2000;
    foreach (a13Partes($texto, $limite) as $parte) {
        $r = a13MetaPagina('POST', $caminho, $base + ['message' => ['text' => $parte]]);
        if (!$r['ok']) {
            return ['ok' => false, 'externo' => $externo, 'erro' => $r['erro']];
        }
        $externo = $externo !== '' ? $externo : (string) ($r['json']['message_id'] ?? '');
    }
    return ['ok' => true, 'externo' => $externo !== '' ? $externo : ('meta.' . bin2hex(random_bytes(8))), 'erro' => ''];
}

/** Divide o texto em partes de até $limite caracteres, quebrando em parágrafo ou espaço. */
function a13Partes(string $texto, int $limite): array
{
    $texto = trim($texto);
    if ($texto === '') {
        return [];
    }
    $partes = [];
    while (mb_strlen($texto) > $limite) {
        $corte = mb_strrpos(mb_substr($texto, 0, $limite), "\n");
        if ($corte === false || $corte < $limite / 2) {
            $corte = mb_strrpos(mb_substr($texto, 0, $limite), ' ');
        }
        if ($corte === false || $corte < $limite / 2) {
            $corte = $limite;
        }
        $partes[] = trim(mb_substr($texto, 0, $corte));
        $texto = trim(mb_substr($texto, $corte));
    }
    $partes[] = $texto;
    return $partes;
}

/** Texto do WhatsApp para os outros canais: *negrito* vira texto simples (Facebook, Instagram e site não usam a marcação). */
function a13TextoSimples(string $texto): string
{
    return (string) preg_replace('/\*([^*\n]+)\*/u', '$1', $texto);
}

/** Mensagem automática (Aurora) num canal novo, já gravada: entrega e atualiza o status. Chamada pelo msgBotEnviar. */
function a13BotEntregar(PDO $pdo, string $canal, string $waId, int $mensagemId, string $texto): void
{
    $nome = trim((string) msgConfigTela($pdo, 'assinatura_aurora', 'Aurora')) ?: 'Aurora';
    // site mostra o nome de quem responde no próprio chat; Facebook e Instagram recebem "Aurora:" na primeira linha
    $corpo = a13TextoSimples($texto);
    if ($canal !== 'site' && msgConfigTela($pdo, 'assinatura', 'completo') !== 'nao' && preg_match('/\s/u', $texto)) {
        $corpo = $nome . ":\n" . $corpo;
    }
    $r = a13Entregar($pdo, $canal, $waId, $corpo);
    if ($r['ok']) {
        $pdo->prepare("UPDATE chat_mensagens SET status_envio = 'enviada', externo_id = :w WHERE id = :id")->execute([':w' => $r['externo'], ':id' => $mensagemId]);
    } else {
        $pdo->prepare("UPDATE chat_mensagens SET status_envio = 'falhou', erro_envio = :e WHERE id = :id")
            ->execute([':e' => mb_substr($r['erro'] !== '' ? $r['erro'] : 'Falha no envio.', 0, 255), ':id' => $mensagemId]);
    }
}

/** Mensagem da equipe num canal novo (chamada pelo enviarAoWhatsApp do messenger.php). */
function a13EquipeEntregar(PDO $pdo, array $contato, array $m, ?array $anexo, string $assinatura): void
{
    $canal = (string) $contato['canal'];
    $falhar = function (string $motivo) use ($pdo, $m) {
        $pdo->prepare("UPDATE chat_mensagens SET status_envio = 'falhou', erro_envio = :e WHERE id = :id")->execute([':e' => mb_substr($motivo, 0, 255), ':id' => $m['id']]);
    };
    if ($m['tipo'] === 'modelo') {
        $falhar('Modelo aprovado só existe no WhatsApp.');
        return;
    }
    if (in_array($m['tipo'], ['imagem', 'audio', 'documento'], true) && !$anexo) {
        $falhar('Anexo não encontrado.');
        return;
    }
    $texto = a13TextoSimples((string) ($m['texto'] ?? ''));
    if ($canal !== 'site' && $assinatura !== '') {
        $nome = trim($assinatura, '*:');
        $texto = $texto === '' ? $nome . ':' : $nome . ":\n" . $texto;
    }
    $r = a13Entregar($pdo, $canal, (string) $contato['wa_id'], $texto, in_array($m['tipo'], ['imagem', 'audio', 'documento'], true) ? $anexo : null);
    if (!$r['ok']) {
        $falhar($r['erro'] !== '' ? $r['erro'] : 'Falha no envio.');
        return;
    }
    $pdo->prepare("UPDATE chat_mensagens SET status_envio = 'enviada', externo_id = :w, erro_envio = NULL WHERE id = :id")
        ->execute([':w' => $r['externo'], ':id' => $m['id']]);
}

/** Instruções da Aurora conforme o canal (acrescentadas às instruções do messenger_aurora.php). */
function a13InstrucoesCanal(PDO $pdo, array $conversa): string
{
    $canal = a13CanalDoContato($pdo, (int) ($conversa['contato_externo_id'] ?? 0));
    if (!a13CanalNovo($canal)) {
        return '';
    }
    $sc = $pdo->prepare('SELECT nome, nome_salvo, telefone_e164 FROM chat_contatos_externos WHERE id = :id');
    $sc->execute([':id' => $conversa['contato_externo_id']]);
    $ct = $sc->fetch() ?: [];
    $temNome = trim((string) ($ct['nome_salvo'] ?? '')) !== '' || trim((string) ($ct['nome'] ?? '')) !== '';
    $temCel = trim((string) ($ct['telefone_e164'] ?? '')) !== '';
    $comum = "- Não use *negrito* do WhatsApp: escreva texto simples.\n"
        . "- Não mande modelo nem fale em \"janela de 24 horas\".\n";
    if ($canal === 'site') {
        $dados = $temCel ? "Você JÁ TEM o celular da pessoa" . ($temNome ? ' e o nome' : '') . ": não peça de novo." : (
            "AINDA NÃO TEM o celular" . ($temNome ? '' : ' nem o nome') . " da pessoa. ANTES de passar para um atendente (transferir=true), peça em UMA mensagem curta o nome e o celular com DDD, explicando que é para a equipe continuar o atendimento, também pelo WhatsApp, se ela sair do site. Quando ela informar, transfira na mesma resposta. EXCEÇÕES: falecimento (intencao=obito) e emergência seguem as regras deles na hora, sem esperar o celular (no falecimento, peça o celular junto, na mesma mensagem, e transfira já); se a pessoa não quiser informar, transfira mesmo assim e diga que a resposta vem aqui no chat enquanto ela estiver na página.");
        return "\n\nCANAL: CHAT DO SITE (atendimento imediato, 24 horas)\n"
            . "Você está no chat do site do Plano PAI, não no WhatsApp. A pessoa pode estar escrevendo fora do horário do escritório: faça o primeiro atendimento completo, tire as dúvidas pela BASE e só passe para uma pessoa quando precisar.\n"
            . "- Fora do horário do setor, diga com naturalidade que a equipe responde assim que abrir e que o plantão funerário atende 24 horas (falecimento e urgências).\n"
            . "- {$dados}\n"
            . "- Se a pessoa disser que vai sair do site, lembre que a equipe pode continuar pelo WhatsApp no celular que ela informou.\n"
            . "- Comprovante de pagamento: no site não dá para mandar arquivo; peça para enviar pelo WhatsApp do PAI ou pelo Aplicativo do Associado.\n"
            . $comum;
    }
    $nomeCanal = A13_CANAIS[$canal];
    return "\n\nCANAL: {$nomeCanal} (mensagens da Página do Plano PAI)\n"
        . "Você está atendendo pelo {$nomeCanal}, não pelo WhatsApp. Faça o primeiro atendimento, tire as dúvidas pela BASE e passe para uma pessoa quando precisar.\n"
        . "- Antes de passar para um atendente, se ainda não tiver, peça o celular com DDD numa mensagem curta: a equipe pode continuar pelo WhatsApp (falecimento e emergência não esperam: transfira já).\n"
        . "- A equipe tem até 24 horas depois da última mensagem da pessoa para responder por aqui.\n"
        . $comum;
}

/** Depois da resposta da Aurora: guarda o nome que a pessoa informou no site, no Facebook ou no Instagram. */
function a13AposIa(PDO $pdo, array $conversa, array $d): void
{
    $canal = a13CanalDoContato($pdo, (int) ($conversa['contato_externo_id'] ?? 0));
    if (!a13CanalNovo($canal)) {
        return;
    }
    $nome = trim((string) ($d['dados']['nome_cliente'] ?? ''));
    if ($nome !== '' && mb_strlen($nome) >= 2) {
        $pdo->prepare("UPDATE chat_contatos_externos SET nome = :n, atualizado_em = NOW() WHERE id = :id AND (nome IS NULL OR nome = '')")
            ->execute([':n' => mb_substr($nome, 0, 150), ':id' => $conversa['contato_externo_id']]);
    }
}

// =====================================================================
// Endereço do chat do site (só quando este arquivo é chamado direto)
// =====================================================================

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) !== realpath(__FILE__)) {
    return; // carregado como biblioteca
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
$a13Origens = [
    'https://planoassistencialintegrado.com.br',
    'https://www.planoassistencialintegrado.com.br',
    'https://app.planoassistencialintegrado.com.br',
    'https://pai.planoassistencialintegrado.com.br',
];
$a13Origem = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
if ($a13Origem !== '' && in_array($a13Origem, $a13Origens, true)) {
    header("Access-Control-Allow-Origin: {$a13Origem}");
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
    header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code($a13Origem !== '' && in_array($a13Origem, $a13Origens, true) ? 204 : 403);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'erro' => 'Use POST.']);
    exit;
}

require_once __DIR__ . '/messenger_nucleo.php';

if (!(bool) msgConfig('site_chat_ativo', true)) {
    msgErro('Atendimento pelo site indisponível no momento.', 503);
}

$a13Entrada = json_decode((string) file_get_contents('php://input'), true);
$a13Entrada = is_array($a13Entrada) ? $a13Entrada : [];
$a13Acao = (string) ($a13Entrada['acao'] ?? '');
$a13Token = preg_match('/^[a-f0-9]{48}$/', (string) ($a13Entrada['token'] ?? '')) ? (string) $a13Entrada['token'] : '';
$a13Ip = (string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '');

/** Limite simples por chave e janela de tempo (arquivos temporários). true = pode seguir. */
function a13Limite(string $chave, int $maximo, int $segundos): bool
{
    $dir = rtrim(sys_get_temp_dir(), '/') . '/pai_a13';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    $arq = $dir . '/' . hash('sha256', $chave . '|' . intdiv(time(), $segundos)) . '.n';
    $n = (int) @file_get_contents($arq);
    if ($n >= $maximo) {
        return false;
    }
    @file_put_contents($arq, (string) ($n + 1), LOCK_EX);
    if (random_int(1, 200) === 1) {
        foreach ((array) glob($dir . '/*.n') as $velho) {
            if (is_string($velho) && filemtime($velho) < time() - 7200) {
                @unlink($velho);
            }
        }
    }
    return true;
}

/** Conversa do aparelho (pelo token) ou null. */
function a13ConversaDoToken(PDO $pdo, string $token): ?array
{
    if ($token === '') {
        return null;
    }
    $st = $pdo->prepare("SELECT c.id AS conversa_id, ce.id AS contato_id FROM chat_contatos_externos ce
                           LEFT JOIN chat_conversas c ON c.contato_externo_id = ce.id
                          WHERE ce.canal = 'site' AND ce.wa_id = :w LIMIT 1");
    $st->execute([':w' => A13_PREFIXO['site'] . hash('sha256', $token)]);
    $r = $st->fetch();
    return $r && $r['conversa_id'] !== null ? $r : null;
}

/** Mensagens que o site pode mostrar (da pessoa, da Aurora e da equipe), depois do id informado. */
function a13MensagensSite(PDO $pdo, int $conversaId, int $depois): array
{
    $st = $pdo->prepare("SELECT m.id, m.autor_tipo, m.autor_usuario_id, m.tipo, m.texto, m.criado_em
                           FROM chat_mensagens m
                          WHERE m.conversa_id = :c AND m.id > :d AND m.apagada_em IS NULL AND COALESCE(m.interna, 0) = 0
                            AND m.tipo <> 'sistema' AND m.autor_tipo IN ('contato', 'sistema', 'usuario')
                          ORDER BY m.id DESC LIMIT 60");
    $st->execute([':c' => $conversaId, ':d' => $depois]);
    $linhas = array_reverse($st->fetchAll());
    if (!$linhas) {
        return [];
    }
    $ids = array_values(array_filter(array_map(fn($l) => (int) ($l['autor_usuario_id'] ?? 0), $linhas)));
    $nomes = $ids ? msgNomesUsuarios($pdo, $ids) : [];
    $modo = (string) msgConfigTela($pdo, 'assinatura', 'completo');
    $aurora = trim((string) msgConfigTela($pdo, 'assinatura_aurora', 'Aurora')) ?: 'Aurora';
    $anexos = [];
    $sa = $pdo->prepare('SELECT mensagem_id, chave_r2, nome_original, mime FROM chat_anexos WHERE mensagem_id IN (' . implode(',', array_map(fn($l) => (int) $l['id'], $linhas)) . ')');
    $sa->execute();
    foreach ($sa->fetchAll() as $a) {
        $anexos[(int) $a['mensagem_id']] = $a;
    }
    $saida = [];
    foreach ($linhas as $l) {
        $de = $l['autor_tipo'] === 'contato' ? 'voce' : ($l['autor_tipo'] === 'usuario' ? 'equipe' : 'aurora');
        $nome = 'Você';
        if ($de === 'aurora') {
            $nome = $aurora;
        } elseif ($de === 'equipe') {
            $n = trim((string) ($nomes[(int) $l['autor_usuario_id']] ?? ''));
            $nome = $modo === 'nao' || $n === '' ? 'Atendimento PAI' : ($modo === 'primeiro' ? explode(' ', $n)[0] : $n);
        }
        $item = ['id' => (int) $l['id'], 'de' => $de, 'nome' => $nome, 'texto' => a13TextoSimples((string) ($l['texto'] ?? '')), 'em' => (string) $l['criado_em']];
        if (isset($anexos[(int) $l['id']]) && $de !== 'voce' && msgR2Configurado()) {
            $a = $anexos[(int) $l['id']];
            $item['anexo'] = ['url' => msgR2LinkAssinado('GET', (string) $a['chave_r2'], 3600), 'nome' => (string) ($a['nome_original'] ?: 'arquivo'), 'mime' => (string) $a['mime']];
        }
        $saida[] = $item;
    }
    return $saida;
}

$pdo = msgPdo();

try {
    switch ($a13Acao) {
        case 'iniciar':
            // aparelho já conhecido: devolve a conversa; novo: só um token (o contato nasce na primeira mensagem)
            if (!a13Limite('ini|' . $a13Ip, 120, 3600)) {
                msgErro('Muitas tentativas. Aguarde um pouco.', 429);
            }
            $cv = a13ConversaDoToken($pdo, $a13Token);
            if (!$cv) {
                msgOk(['token' => $a13Token !== '' ? $a13Token : bin2hex(random_bytes(24)), 'mensagens' => []]);
            }
            msgOk(['token' => $a13Token, 'mensagens' => a13MensagensSite($pdo, (int) $cv['conversa_id'], 0)]);

        case 'mensagens':
            if (!a13Limite('msg|' . $a13Token . '|' . $a13Ip, 1500, 3600)) {
                msgErro('Muitas consultas. Aguarde um pouco.', 429);
            }
            $cv = a13ConversaDoToken($pdo, $a13Token);
            msgOk(['mensagens' => $cv ? a13MensagensSite($pdo, (int) $cv['conversa_id'], max(0, (int) ($a13Entrada['depois'] ?? 0))) : []]);

        case 'enviar':
            if ($a13Token === '') {
                msgErro('Recarregue a página e tente de novo.', 400);
            }
            if (trim((string) ($a13Entrada['site'] ?? '')) !== '') {
                msgOk(['mensagens' => []]); // campo isca preenchido: robô
            }
            $texto = trim((string) ($a13Entrada['texto'] ?? ''));
            if ($texto === '') {
                msgErro('Escreva a sua mensagem.', 400);
            }
            if (mb_strlen($texto) > 1000) {
                msgErro('Mensagem muito longa (até 1.000 caracteres).', 400);
            }
            if (!a13Limite('env|' . $a13Token, 40, 3600) || !a13Limite('envip|' . $a13Ip, 80, 3600) || !a13Limite('envrap|' . $a13Token, 1, 2)) {
                msgErro('Muitas mensagens seguidas. Aguarde um pouco.', 429);
            }
            if (!a13CanalAceito($pdo, 'site')) {
                error_log('[aurora_13] a coluna canal não aceita "site": rode o SQL da entrega de 16/11/2026');
                msgErro('Atendimento pelo site em configuração. Fale com a gente pelo WhatsApp.', 503);
            }
            $novaConversa = a13ConversaDoToken($pdo, $a13Token) === null;
            if ($novaConversa && !a13Limite('novo|' . $a13Ip, 6, 3600)) {
                msgErro('Muitas conversas novas deste endereço. Aguarde um pouco.', 429);
            }
            $pagina = mb_substr(preg_replace('/[^\x20-\x7E]/', '', (string) ($a13Entrada['pagina'] ?? '')) ?? '', 0, 200);
            $origem = '🌐 Veio do site' . ($pagina !== '' ? ': ' . $pagina : '');
            $r = a13Receber($pdo, 'site', hash('sha256', $a13Token), '', 'texto', $texto, [], 'site.c.' . bin2hex(random_bytes(10)), null, $origem);
            $cv = a13ConversaDoToken($pdo, $a13Token);
            msgOk(['mensagens' => $cv ? a13MensagensSite($pdo, (int) $cv['conversa_id'], max(0, (int) ($a13Entrada['depois'] ?? 0))) : [], 'id' => $r[0] ?? 0]);

        default:
            msgErro('Ação inválida.', 400);
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[aurora_13] ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    msgErro('Não foi possível agora. Tente de novo em instantes.', 500);
}
