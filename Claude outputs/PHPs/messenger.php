<?php
declare(strict_types=1);
/**
 * messenger.php — Endpoint do Messenger do app PAI (chamado pelo front Next.js)
 *
 * Convenção: ?action=<ação>. GET lê parâmetros da URL; POST lê JSON no corpo.
 * Resposta: { erro: bool, msg: string, dados: ... }  ·  401 com need_login sem login.
 * Toda ação exige login e a página "messenger" liberada ao usuário (permissoes ou cargo_paginas).
 *
 * Ações (GET):  perfil · ably_token · conversas · nao_lidas_total · mensagens · novidades · anexo_url · usuarios ·
 *               fila · atendentes · modelos · historico_clientes · historico_mensagens
 * conversas aceita ?aba=equipe|clientes e ?tipo=grupo (botão Grupos); nao_lidas_total traz grupos_com_novas (contador do botão).
 * Ações (POST): enviar · upload_url · marcar_lida · digitando · apagar_mensagem · abrir_individual · criar_grupo ·
 *               grupo_editar · sair_grupo · silenciar · assumir · transferir · encerrar
 *
 * Clientes do WhatsApp (regras de 06/10/2026): todos com o Messenger atendem (fila manual: o primeiro que assumir).
 * Só o responsável responde ao cliente; quem transferiu acompanha como observador, sem responder.
 * Gestão (página messenger-historico): vê toda conversa de cliente na fila ou em andamento sem participar,
 * transfere e encerra; no histórico vê todos os atendimentos. Os demais veem no histórico só os atendimentos
 * em que participaram (responsável, transferência, mensagem enviada ou encerramento).
 *
 * Arquivos na mesma pasta: messenger_nucleo.php.
 */

// CORS e cabeçalhos: mesmo bloco do sistema (references/backend-php.md).
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

// Erro fatal do PHP vira JSON (em vez de 500 vazio).
register_shutdown_function(function () {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('[messenger] fatal: ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['erro' => true, 'msg' => 'Erro interno no servidor (PHP): ' . preg_replace('#/[^\s:]*/#', '', (string) $e['message']) . ' — ' . basename((string) $e['file']) . ':' . $e['line']], JSON_UNESCAPED_UNICODE);
    }
});

if (!is_file(__DIR__ . '/messenger_nucleo.php')) {
    http_response_code(500);
    echo json_encode(['erro' => true, 'msg' => 'Arquivo ausente no servidor: messenger_nucleo.php (subir na mesma pasta do messenger.php).'], JSON_UNESCAPED_UNICODE);
    exit;
}
require_once __DIR__ . '/messenger_nucleo.php';

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

// ---------------------------------------------------------------------
// Auxiliares do endpoint
// ---------------------------------------------------------------------

function entrada(string $nome, $padrao = null)
{
    global $metodo, $corpo;
    return $metodo === 'POST' ? ($corpo[$nome] ?? $padrao) : ($_GET[$nome] ?? $padrao);
}

function entradaInt(string $nome, int $padrao = 0): int
{
    $v = entrada($nome, $padrao);
    return is_numeric($v) ? (int) $v : $padrao;
}

function exigirMetodo(string $esperado): void
{
    global $metodo;
    if ($metodo !== $esperado) {
        msgErro('Método não permitido para esta ação.', 405);
    }
}

/** Conversa que o usuário pode ver (participante; na fila, atendente/adm). */
function conversaVisivel(PDO $pdo, array $usuario, int $conversaId): array
{
    $c = $conversaId > 0 ? msgConversa($pdo, $conversaId) : null;
    if (!$c) {
        msgErro('Conversa não encontrada.', 404);
    }
    if (!msgPodeVer($pdo, $c, $usuario)) {
        msgErro('Você não participa desta conversa.', 403);
    }
    return $c;
}

/** Conversa em que o usuário é participante ativo. Retorna [conversa, participação]. */
function conversaParticipante(PDO $pdo, array $usuario, int $conversaId): array
{
    $c = $conversaId > 0 ? msgConversa($pdo, $conversaId) : null;
    if (!$c) {
        msgErro('Conversa não encontrada.', 404);
    }
    $part = msgParticipantes($pdo, (int) $c['id']);
    if (!isset($part[(int) $usuario['id']])) {
        msgErro('Você não participa desta conversa.', 403);
    }
    return [$c, $part[(int) $usuario['id']]];
}

function exigirAtendente(PDO $pdo, array $usuario): void
{
    if (!msgEhAtendente($pdo, (int) $usuario['id'])) {
        msgErro('Apenas quem tem a permissão de atender clientes do WhatsApp.', 403);
    }
}

function exigirGestao(PDO $pdo, array $usuario): void
{
    if (!msgEhGestao($pdo, (int) $usuario['id'])) {
        msgErro('Apenas a Gestão consulta o histórico de atendimentos.', 403);
    }
}

function janelaAberta(array $conversa): bool
{
    return !empty($conversa['janela_ate']) && strtotime((string) $conversa['janela_ate']) > time();
}

/** Formata conversas para a lista (título, prévia, não lidas, cliente, responsável). */
function formatarConversas(PDO $pdo, array $linhas, int $uid): array
{
    if (!$linhas) {
        return [];
    }
    $ids = array_map(fn($l) => (int) $l['id'], $linhas);
    $marc = implode(',', array_fill(0, count($ids), '?'));

    // participantes ativos de todas as conversas
    $sp = $pdo->prepare("SELECT p.conversa_id, p.usuario_id, p.papel, p.ultima_lida_id, u.nome
                           FROM chat_participantes p LEFT JOIN usuarios u ON u.id = p.usuario_id
                          WHERE p.conversa_id IN ({$marc}) AND p.saiu_em IS NULL");
    $sp->execute($ids);
    $participantes = [];
    foreach ($sp->fetchAll() as $p) {
        $participantes[(int) $p['conversa_id']][] = $p;
    }

    // não lidas: mensagens de outros depois da última lida (quem não participa: do cliente depois da última resposta)
    $naoLidas = [];
    $sn = $pdo->prepare("SELECT m.conversa_id, COUNT(*) AS qtd
                           FROM chat_mensagens m
                           INNER JOIN chat_conversas c ON c.id = m.conversa_id
                           LEFT JOIN chat_participantes p ON p.conversa_id = m.conversa_id AND p.usuario_id = ? AND p.saiu_em IS NULL
                          WHERE m.conversa_id IN ({$marc})
                            AND m.autor_tipo <> 'sistema'
                            AND (m.autor_usuario_id IS NULL OR m.autor_usuario_id <> ?)
                            AND (c.tipo <> 'externo' OR m.atendimento_id = c.atendimento_atual_id)
                            AND m.id > COALESCE(p.ultima_lida_id, 0)
                          GROUP BY m.conversa_id");
    $sn->execute(array_merge([$uid], $ids, [$uid]));
    foreach ($sn->fetchAll() as $r) {
        $naoLidas[(int) $r['conversa_id']] = (int) $r['qtd'];
    }

    // últimas mensagens
    $ultimas = [];
    $idsUltimas = array_values(array_filter(array_map(fn($l) => (int) ($l['ultima_mensagem_id'] ?? 0), $linhas)));
    if ($idsUltimas) {
        $mu = implode(',', array_fill(0, count($idsUltimas), '?'));
        foreach (msgBuscarMensagens($pdo, "m.id IN ({$mu})", $idsUltimas, count($idsUltimas)) as $m) {
            $ultimas[$m['conversa_id']] = $m;
        }
    }

    // clientes e responsáveis
    $contatos = [];
    $contratosDe = [];
    $idsContatos = array_values(array_filter(array_map(fn($l) => (int) ($l['contato_externo_id'] ?? 0), $linhas)));
    if ($idsContatos) {
        $mc = implode(',', array_fill(0, count($idsContatos), '?'));
        $sc = $pdo->prepare("SELECT id, nome, nome_salvo, COALESCE(telefone_e164, IF(username IS NOT NULL, CONCAT('@', username), 'Usuário do WhatsApp')) AS telefone_e164 FROM chat_contatos_externos WHERE id IN ({$mc})");
        $sc->execute($idsContatos);
        foreach ($sc->fetchAll() as $c) {
            $contatos[(int) $c['id']] = $c;
        }
        // contratos vinculados (selo "Contrato …" na conversa e na lista), com a situação da cópia diária da Unymos
        try {
            $sv = $pdo->prepare("SELECT v.contato_id, v.contrato, COALESCE(u.plano, v.plano) AS plano, u.cobertura, u.situacao, u.tags
                                   FROM chat_contato_contratos v
                                   LEFT JOIN chat_uny_contratos u ON u.numero = TRIM(LEADING '0' FROM v.contrato)
                                  WHERE v.contato_id IN ({$mc}) ORDER BY v.criado_em");
            $sv->execute($idsContatos);
            $vistos = [];
            foreach ($sv->fetchAll() as $v) {
                $chave = (int) $v['contato_id'] . '|' . ltrim((string) $v['contrato'], '0');
                if (isset($vistos[$chave])) {
                    continue; // o mesmo contrato vinculado duas vezes (com e sem zeros) aparece uma vez só
                }
                $vistos[$chave] = true;
                $contratosDe[(int) $v['contato_id']][] = [
                    'contrato' => (string) $v['contrato'], 'plano' => msgUnyPlanoCurto((string) ($v['cobertura'] ?? ''), (string) ($v['plano'] ?? '')),
                    'situacao' => (string) ($v['situacao'] ?? ''), 'tags' => msgUnyTags((string) ($v['tags'] ?? '')),
                ];
            }
        } catch (PDOException $e) {
            // tabelas ainda não criadas
        }
    }
    $nomesResp = msgNomesUsuarios($pdo, array_map(fn($l) => (int) ($l['responsavel_usuario_id'] ?? 0), $linhas));

    $saida = [];
    foreach ($linhas as $l) {
        $id = (int) $l['id'];
        $membros = $participantes[$id] ?? [];
        $eu = null;
        $outro = null;
        foreach ($membros as $p) {
            if ((int) $p['usuario_id'] === $uid) {
                $eu = $p;
            } elseif ($outro === null) {
                $outro = $p;
            }
        }
        $titulo = (string) ($l['titulo'] ?? '');
        $contato = null;
        if ($l['tipo'] === 'individual') {
            $titulo = $outro['nome'] ?? 'Conversa';
        } elseif ($l['tipo'] === 'externo') {
            $c = $contatos[(int) $l['contato_externo_id']] ?? null;
            $nomeSalvo = $c ? trim((string) ($c['nome_salvo'] ?? '')) : '';
            $contato = $c ? ['id' => (int) $c['id'], 'nome' => $nomeSalvo !== '' ? $nomeSalvo : $c['nome'], 'nome_whatsapp' => $c['nome'], 'salvo' => $nomeSalvo !== '', 'telefone' => $c['telefone_e164'], 'contratos' => $contratosDe[(int) $c['id']] ?? []] : null;
            $titulo = $c ? ($nomeSalvo !== '' ? $nomeSalvo : ($c['nome'] ?: $c['telefone_e164'])) : 'Cliente';
        }
        $resp = $l['responsavel_usuario_id'] !== null ? (int) $l['responsavel_usuario_id'] : null;
        // Gestão vendo um atendimento em andamento sem participar: só acompanha (sem contador de não lidas)
        $gestaoAcompanha = $eu === null && $l['tipo'] === 'externo' && $l['status_atendimento'] === 'em_atendimento';
        $saida[] = [
            'id' => $id,
            'tipo' => $l['tipo'],
            'canal' => $l['canal'],
            'titulo' => $titulo,
            'outro_usuario_id' => $l['tipo'] === 'individual' && $outro ? (int) $outro['usuario_id'] : null,
            'membros' => array_map(fn($p) => ['usuario_id' => (int) $p['usuario_id'], 'nome' => $p['nome'], 'papel' => $p['papel'], 'ultima_lida_id' => (int) $p['ultima_lida_id']], $membros),
            'meu_papel' => $eu['papel'] ?? null,
            'posso_responder' => $l['tipo'] === 'externo'
                ? ((int) ($l['responsavel_usuario_id'] ?? 0) === $uid && $l['status_atendimento'] === 'em_atendimento')
                : $eu !== null,
            'participo' => $eu !== null,
            'silenciada' => isset($l['silenciada']) ? ((int) $l['silenciada'] === 1) : false,
            'nao_lidas' => $gestaoAcompanha ? 0 : ($naoLidas[$id] ?? 0),
            'gestao_acompanha' => $gestaoAcompanha,
            'ultima_mensagem' => $ultimas[$id] ?? null,
            'ultima_mensagem_em' => msgDataIso($l['ultima_mensagem_em'] ?? null) ?? msgDataIso($l['criado_em']),
            'contato' => $contato,
            'status_atendimento' => $l['status_atendimento'],
            'responsavel' => $resp ? ['id' => $resp, 'nome' => $nomesResp[$resp] ?? null] : null,
            'janela_ate' => msgDataIso($l['janela_ate'] ?? null),
            'janela_aberta' => $l['tipo'] === 'externo' ? janelaAberta($l) : null,
            'atendimento_id' => $l['tipo'] === 'externo' && $l['atendimento_atual_id'] !== null ? (int) $l['atendimento_atual_id'] : null,
            'setor_id' => isset($l['setor_id']) && $l['setor_id'] !== null ? (int) $l['setor_id'] : null,
            'prioridade' => (int) ($l['prioridade'] ?? 0),
            'orcamento_ia' => in_array((int) $l['id'], msgOrcamentosIaPendentes($pdo), true),
        ];
    }
    return acrescentarSetorEtiquetas($pdo, $saida, $uid);
}

/** Pacote 4A: setor (nome e cor) e etiquetas visíveis para quem pede (da empresa + as suas) em cada conversa. */
function acrescentarSetorEtiquetas(PDO $pdo, array $conversas, int $uid): array
{
    if (!$conversas) {
        return $conversas;
    }
    $setores = [];
    $etiquetas = [];
    try {
        foreach ($pdo->query('SELECT id, nome, cor FROM chat_setores')->fetchAll() as $r) {
            $setores[(int) $r['id']] = ['id' => (int) $r['id'], 'nome' => $r['nome'], 'cor' => $r['cor']];
        }
        $ids = array_map(fn($c) => (int) $c['id'], $conversas);
        $marc = implode(',', array_fill(0, count($ids), '?'));
        $st = $pdo->prepare("SELECT ce.conversa_id, e.id, e.nome, e.cor FROM chat_conversa_etiquetas ce
                               INNER JOIN chat_etiquetas e ON e.id = ce.etiqueta_id AND (e.usuario_id IS NULL OR e.usuario_id = ?)
                              WHERE ce.conversa_id IN ({$marc}) ORDER BY e.nome");
        $st->execute(array_merge([$uid], $ids));
        foreach ($st->fetchAll() as $r) {
            $etiquetas[(int) $r['conversa_id']][] = ['id' => (int) $r['id'], 'nome' => $r['nome'], 'cor' => $r['cor']];
        }
    } catch (PDOException $e) {
        // tabelas ainda não criadas
    }
    foreach ($conversas as &$c) {
        $c['setor'] = $c['setor_id'] !== null ? ($setores[$c['setor_id']] ?? null) : null;
        $c['etiquetas'] = $etiquetas[(int) $c['id']] ?? [];
    }
    unset($c);
    return $conversas;
}

/** Lista dos setores com atendentes, horários, exceções e a situação agora. */
function carregarSetores(PDO $pdo): array
{
    $setores = $pdo->query('SELECT * FROM chat_setores ORDER BY ativo DESC, ordem, nome')->fetchAll();
    if (!$setores) {
        return [];
    }
    $membros = [];
    foreach ($pdo->query('SELECT setor_id, usuario_id FROM chat_setor_membros')->fetchAll() as $r) {
        $membros[(int) $r['setor_id']][] = (int) $r['usuario_id'];
    }
    $nomes = msgNomesUsuarios($pdo, array_values(array_unique(array_merge([], ...array_values($membros ?: [[]])))));
    $horarios = [];
    foreach ($pdo->query('SELECT setor_id, dia_semana, inicio, fim FROM chat_setor_horarios ORDER BY dia_semana, inicio')->fetchAll() as $r) {
        $horarios[(int) $r['setor_id']][] = $r;
    }
    $excecoes = [];
    foreach ($pdo->query('SELECT setor_id, data, descricao, fechado, inicio, fim FROM chat_setor_excecoes WHERE data >= CURDATE() - INTERVAL 1 DAY ORDER BY data')->fetchAll() as $r) {
        $excecoes[(int) $r['setor_id']][] = $r;
    }
    $saida = [];
    foreach ($setores as $st) {
        $id = (int) $st['id'];
        $situ = msgSituacaoSetor($st, $horarios[$id] ?? [], $excecoes[$id] ?? []);
        $saida[] = [
            'id' => $id,
            'nome' => $st['nome'],
            'cor' => $st['cor'],
            'ativo' => (int) $st['ativo'] === 1,
            'plantao' => (int) $st['plantao'] === 1,
            'ordem' => (int) $st['ordem'],
            'msg_boas_vindas' => $st['msg_boas_vindas'],
            'msg_fora_horario' => $st['msg_fora_horario'],
            'texto_menu' => $st['texto_menu'] ?? null,
            'descricao_ia' => $st['descricao_ia'] ?? null,
            'no_menu' => (int) ($st['no_menu'] ?? 1) === 1,
            'membros' => array_map(fn($u) => ['id' => $u, 'nome' => $nomes[$u] ?? '—'], $membros[$id] ?? []),
            'horarios' => array_map(fn($h) => ['dia' => (int) $h['dia_semana'], 'inicio' => substr($h['inicio'], 0, 5), 'fim' => substr($h['fim'], 0, 5)], $horarios[$id] ?? []),
            'excecoes' => array_map(fn($e) => ['data' => $e['data'], 'descricao' => $e['descricao'], 'fechado' => (int) $e['fechado'] === 1, 'inicio' => $e['inicio'] ? substr($e['inicio'], 0, 5) : null, 'fim' => $e['fim'] ? substr($e['fim'], 0, 5) : null], $excecoes[$id] ?? []),
            'aberto' => $situ['aberto'],
            'situacao' => $situ['texto'],
        ];
    }
    return $saida;
}

function horaValida(string $h): ?string
{
    return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $h) ? $h : null;
}

/**
 * Preferências de cada pessoa por conversa (09/10/2026): fixar no topo e "marcar como não lida", como no WhatsApp.
 * Tabela própria (chat_preferencias), criada sozinha na primeira vez que alguém fixa ou marca; não altera nenhuma
 * tabela existente.
 */
const MAX_FIXADAS = 3;
const MSG_PAGINA_CONFIG = 'messenger-config';

function garantirTabelaPreferencias(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS chat_preferencias (
                  conversa_id BIGINT UNSIGNED NOT NULL,
                  usuario_id INT NOT NULL,
                  fixada_em DATETIME NULL,
                  marcada_nao_lida TINYINT(1) NOT NULL DEFAULT 0,
                  PRIMARY KEY (conversa_id, usuario_id),
                  KEY ix_chat_pref_usuario (usuario_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

/** [conversa_id => ['fixada_em' => ?string, 'marcada' => bool]] do usuário; vazio se a tabela ainda não existe. */
function preferenciasDoUsuario(PDO $pdo, int $uid): array
{
    try {
        $st = $pdo->prepare('SELECT conversa_id, fixada_em, marcada_nao_lida FROM chat_preferencias WHERE usuario_id = :u');
        $st->execute([':u' => $uid]);
    } catch (PDOException $e) {
        if ($e->getCode() === '42S02') {
            return [];
        }
        throw $e;
    }
    $saida = [];
    foreach ($st->fetchAll() as $r) {
        $saida[(int) $r['conversa_id']] = ['fixada_em' => $r['fixada_em'], 'marcada' => (int) $r['marcada_nao_lida'] === 1];
    }
    return $saida;
}

/** Acrescenta "fixada" e "marcada_nao_lida" às conversas e põe as fixadas no topo (a fixada por último primeiro). */
function aplicarPreferencias(PDO $pdo, array $conversas, int $uid): array
{
    $prefs = preferenciasDoUsuario($pdo, $uid);
    foreach ($conversas as &$c) {
        $p = $prefs[(int) $c['id']] ?? null;
        $c['fixada'] = !empty($p['fixada_em']);
        $c['fixada_em'] = !empty($p['fixada_em']) ? msgDataIso($p['fixada_em']) : null;
        $c['marcada_nao_lida'] = !empty($p['marcada']);
    }
    unset($c);
    $fixadas = array_values(array_filter($conversas, fn($c) => $c['fixada']));
    usort($fixadas, fn($a, $b) => strcmp((string) $b['fixada_em'], (string) $a['fixada_em']));
    $outras = array_values(array_filter($conversas, fn($c) => !$c['fixada']));
    return array_merge($fixadas, $outras);
}

/** Mensagens fixadas no topo da conversa (a mais recente primeiro). */
function mensagensFixadas(PDO $pdo, int $conversaId): array
{
    try {
        $st = $pdo->prepare('SELECT mensagem_id FROM chat_mensagens_fixadas WHERE conversa_id = :c ORDER BY fixada_em DESC LIMIT 3');
        $st->execute([':c' => $conversaId]);
        $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    } catch (PDOException $e) {
        return [];
    }
    $saida = [];
    foreach ($ids as $id) {
        $m = msgMensagemPorId($pdo, $id);
        if ($m && !$m['apagada']) {
            $saida[] = $m;
        }
    }
    return $saida;
}

/** Até quantos segundos depois do último aviso o colega aparece como "online". */
const PRESENCA_ONLINE_S = 120;

/**
 * Grava "visto agora" do usuário. A tabela chat_presenca é criada sozinha na primeira vez
 * (só ela; não altera nenhuma tabela existente).
 */
function registrarPresenca(PDO $pdo, int $uid, bool $visivel = true): void
{
    $sql = 'INSERT INTO chat_presenca (usuario_id, visto_em, visivel) VALUES (:u, NOW(), :v) ON DUPLICATE KEY UPDATE visto_em = NOW(), visivel = :v2';
    $params = [':u' => $uid, ':v' => $visivel ? 1 : 0, ':v2' => $visivel ? 1 : 0];
    try {
        $pdo->prepare($sql)->execute($params);
    } catch (PDOException $e) {
        $codigo = (string) $e->getCode();
        if ($codigo === '42S02') {
            $pdo->exec('CREATE TABLE IF NOT EXISTS chat_presenca (
                          usuario_id INT NOT NULL,
                          visto_em DATETIME NOT NULL,
                          visivel TINYINT(1) NOT NULL DEFAULT 1,
                          PRIMARY KEY (usuario_id),
                          KEY ix_chat_presenca_visto (visto_em)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        } elseif ($codigo === '42S22') {
            // tabela criada pela versão anterior, sem a coluna "visivel"
            $pdo->exec('ALTER TABLE chat_presenca ADD COLUMN visivel TINYINT(1) NOT NULL DEFAULT 1');
        } else {
            throw $e;
        }
        $pdo->prepare($sql)->execute($params);
    }
}

function conversaFormatada(PDO $pdo, int $conversaId, int $uid): array
{
    $st = $pdo->prepare('SELECT c.*, p.silenciada FROM chat_conversas c
                           LEFT JOIN chat_participantes p ON p.conversa_id = c.id AND p.usuario_id = :u AND p.saiu_em IS NULL
                          WHERE c.id = :id');
    $st->execute([':u' => $uid, ':id' => $conversaId]);
    $l = $st->fetch();
    return $l ? (formatarConversas($pdo, [$l], $uid)[0] ?? []) : [];
}

/** Anexo enviado pelo app: confere que é do usuário, que existe no R2 e que o tipo combina. */
function validarAnexo(array $anexo, string $tipo, int $uid): array
{
    if (!msgR2Configurado()) {
        msgErro('Armazenamento de mídias não configurado (R2 no pai-chaves.php).', 503);
    }
    $prefixo = 'chat/u' . $uid . '/';
    $chave = (string) ($anexo['chave'] ?? '');
    if ($chave === '' || !str_starts_with($chave, $prefixo) || str_contains($chave, '..')) {
        msgErro('Arquivo inválido.');
    }
    $info = msgR2Info($chave);
    if ($info === null) {
        msgErro('Arquivo não encontrado no armazenamento. Envie de novo.', 409);
    }
    $mime = msgMimeBase($info['mime'] !== '' ? $info['mime'] : (string) ($anexo['mime'] ?? ''));
    $aceitos = msgMimesAceitos();
    if (!isset($aceitos[$mime]) || $aceitos[$mime][0] !== $tipo) {
        msgErro('Tipo de arquivo não aceito para esta mensagem.');
    }
    if ($info['tamanho'] > msgLimiteTamanho($tipo)) {
        msgErro('Arquivo maior que o limite permitido.');
    }
    $miniatura = (string) ($anexo['miniatura_chave'] ?? '');
    if ($miniatura !== '' && (!str_starts_with($miniatura, $prefixo) || str_contains($miniatura, '..'))) {
        $miniatura = '';
    }
    $int = fn($v) => is_numeric($v) && (int) $v > 0 ? (int) $v : null;
    return [
        'chave_r2' => $chave,
        'nome_original' => mb_substr(msgTexto((string) ($anexo['nome_original'] ?? '')), 0, 255) ?: null,
        'mime' => $mime,
        'tamanho_bytes' => $info['tamanho'],
        'duracao_s' => $int($anexo['duracao_s'] ?? null),
        'largura' => $int($anexo['largura'] ?? null),
        'altura' => $int($anexo['altura'] ?? null),
        'miniatura_chave' => $miniatura !== '' ? $miniatura : null,
    ];
}

/** Envia ao WhatsApp a mensagem já gravada e atualiza o status. */
function enviarAoWhatsApp(PDO $pdo, array $conversa, int $mensagemId, ?array $modelo, ?array $extra = null): void
{
    $st = $pdo->prepare('SELECT * FROM chat_mensagens WHERE id = :id');
    $st->execute([':id' => $mensagemId]);
    $m = $st->fetch();
    $sc = $pdo->prepare('SELECT * FROM chat_contatos_externos WHERE id = :id');
    $sc->execute([':id' => $conversa['contato_externo_id']]);
    $contato = $sc->fetch();
    $falhar = function (string $motivo) use ($pdo, $mensagemId) {
        $pdo->prepare("UPDATE chat_mensagens SET status_envio = 'falhou', erro_envio = :e WHERE id = :id")
            ->execute([':e' => mb_substr($motivo, 0, 255), ':id' => $mensagemId]);
    };
    if (!$m || !$contato) {
        $falhar('Cliente não encontrado.');
        return;
    }
    if (!msgMetaConfigurado()) {
        $falhar('WhatsApp não configurado (credenciais da Meta no pai-chaves.php).');
        return;
    }
    $payload = ['messaging_product' => 'whatsapp', 'recipient_type' => 'individual', ...msgDestinoWhats((string) $contato['wa_id'])];
    if (!empty($m['responde_a_id'])) {
        $sr = $pdo->prepare('SELECT externo_id FROM chat_mensagens WHERE id = :id');
        $sr->execute([':id' => $m['responde_a_id']]);
        $wamid = $sr->fetchColumn();
        if ($wamid) {
            $payload['context'] = ['message_id' => $wamid];
        }
    }
    $sa = $pdo->prepare('SELECT * FROM chat_anexos WHERE mensagem_id = :id ORDER BY id LIMIT 1');
    $sa->execute([':id' => $mensagemId]);
    $anexo = $sa->fetch() ?: null;
    $texto = (string) ($m['texto'] ?? '');
    // 14/10/2026: o cliente vê quem respondeu, como no WhatsApp da empresa: "*Nome do atendente:*" + quebra de linha.
    // No sistema a mensagem fica sem esse prefixo. Desliga com 'whatsapp_assinatura' => false no pai-chaves.php.
    // Modo vem da tela Configurações do Messenger (aba Geral): completo | primeiro | nao
    $assinatura = '';
    $modoAssinatura = msgConfigTela($pdo, 'assinatura', (bool) msgConfig('whatsapp_assinatura', true) ? 'completo' : 'nao');
    if ($modoAssinatura !== 'nao' && !empty($m['autor_usuario_id'])) {
        $nomeAtendente = trim((string) (msgNomesUsuarios($pdo, [(int) $m['autor_usuario_id']])[(int) $m['autor_usuario_id']] ?? ''));
        if ($modoAssinatura === 'primeiro') {
            $nomeAtendente = explode(' ', $nomeAtendente)[0];
        }
        if ($nomeAtendente !== '') {
            $assinatura = '*' . $nomeAtendente . ':*';
        }
    }
    $comAssinatura = fn(string $t) => $assinatura === '' ? $t : ($t === '' ? $assinatura : $assinatura . "\n" . $t);
    if ($extra !== null) {
        // localização (mapa) ou cartão de contato, no formato nativo do WhatsApp
        $payload = $payload + $extra;
        $r = msgMeta('POST', msgConfig('meta_phone_number_id', '') . '/messages', $payload);
        $wamid = (string) ($r['json']['messages'][0]['id'] ?? '');
        if (!$r['ok'] || $wamid === '') {
            $falhar($r['erro'] !== '' ? $r['erro'] : 'A Meta não aceitou a mensagem.');
            return;
        }
        $pdo->prepare("UPDATE chat_mensagens SET status_envio = 'enviada', externo_id = :w, erro_envio = NULL WHERE id = :id")
            ->execute([':w' => $wamid, ':id' => $mensagemId]);
        return;
    }
    switch ($m['tipo']) {
        case 'texto':
            $payload['type'] = 'text';
            $payload['text'] = ['preview_url' => true, 'body' => $comAssinatura($texto)];
            break;
        case 'imagem':
        case 'audio':
        case 'documento':
            if (!$anexo) {
                $falhar('Anexo não encontrado.');
                return;
            }
            if ($anexo['mime'] === 'audio/webm') {
                $falhar('Formato de áudio (WebM) não aceito pelo WhatsApp.');
                return;
            }
            $link = msgR2LinkAssinado('GET', $anexo['chave_r2'], 3600);
            if ($m['tipo'] === 'imagem') {
                $payload['type'] = 'image';
                $payload['image'] = array_filter(['link' => $link, 'caption' => $comAssinatura($texto)]);
            } elseif ($m['tipo'] === 'audio') {
                $payload['type'] = 'audio';
                $payload['audio'] = ['link' => $link];
            } elseif (str_starts_with($anexo['mime'], 'video/')) {
                $payload['type'] = 'video';
                $payload['video'] = array_filter(['link' => $link, 'caption' => $comAssinatura($texto)]);
            } else {
                $payload['type'] = 'document';
                $payload['document'] = array_filter(['link' => $link, 'filename' => $anexo['nome_original'] ?: 'documento', 'caption' => $comAssinatura($texto)]);
            }
            break;
        case 'modelo':
            $template = ['name' => $modelo['nome'], 'language' => ['code' => $modelo['idioma']]];
            if (!empty($modelo['parametros'])) {
                $template['components'] = [[
                    'type' => 'body',
                    'parameters' => array_map(fn($p) => ['type' => 'text', 'text' => (string) $p], $modelo['parametros']),
                ]];
            }
            $payload['type'] = 'template';
            $payload['template'] = $template;
            break;
        default:
            $falhar('Tipo de mensagem não enviável ao WhatsApp.');
            return;
    }
    $r = msgMeta('POST', msgConfig('meta_phone_number_id', '') . '/messages', $payload);
    $wamid = (string) ($r['json']['messages'][0]['id'] ?? '');
    if (!$r['ok'] || $wamid === '') {
        $falhar($r['erro'] !== '' ? $r['erro'] : 'A Meta não aceitou a mensagem.');
        return;
    }
    $pdo->prepare("UPDATE chat_mensagens SET status_envio = 'enviada', externo_id = :w, erro_envio = NULL WHERE id = :id")
        ->execute([':w' => $wamid, ':id' => $mensagemId]);
}

// ---------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------

try {
    switch ($acao) {

        // ===== Perfil e tempo real =====

        case 'perfil':
            // Dados do usuário para a tela: quem é, se atende clientes, se é Gestão e se o tempo real/notificação/mídias estão ligados.
            exigirMetodo('GET');
            msgOk([
                'id' => $uid,
                'nome' => $usuario['nome'],
                'atendente' => msgEhAtendente($pdo, $uid),
                'gestao' => msgEhGestao($pdo, $uid),
                // página "Messenger · Configurações" (respostas rápidas da empresa, assinatura, limites)
                'configurar' => msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG),
                'tempo_real' => msgConfig('ably_api_key', '') !== '',
                'midias' => msgR2Configurado(),
                'whatsapp' => msgMetaConfigurado(),
                'notificacoes' => msgNotificacoesConfiguradas(),
                // por onde saem as notificações (sempre um só): 'ably' → o app ativa o Web Push da Ably neste aparelho
                'notificacoes_canal' => msgCanalNotificacoes(),
            ]);

        case 'ably_token':
            exigirMetodo('GET');
            msgOk(msgAblyTokenRequest($uid));

        // ===== Listas =====

        case 'conversas':
            exigirMetodo('GET');
            $aba = (string) ($_GET['aba'] ?? '');
            $filtro = $aba === 'clientes' ? "AND c.canal = 'whatsapp'" : ($aba === 'equipe' ? "AND c.canal = 'interno'" : '');
            $tipoFiltro = (string) ($_GET['tipo'] ?? '');
            if (in_array($tipoFiltro, ['individual', 'grupo'], true)) {
                $filtro .= " AND c.tipo = '{$tipoFiltro}'"; // botão Grupos: só os grupos
            }
            $st = $pdo->prepare("SELECT c.*, p.silenciada FROM chat_participantes p
                                   INNER JOIN chat_conversas c ON c.id = p.conversa_id
                                  WHERE p.usuario_id = :u AND p.saiu_em IS NULL {$filtro}
                                  ORDER BY COALESCE(c.ultima_mensagem_em, c.criado_em) DESC
                                  LIMIT 300");
            $st->execute([':u' => $uid]);
            $linhas = $st->fetchAll();
            if ($aba !== 'equipe' && $tipoFiltro !== 'grupo' && msgEhGestao($pdo, $uid)) {
                // Gestão: também os atendimentos de clientes em andamento de que não participa (só acompanha)
                $ja = array_map(fn($l) => (int) $l['id'], $linhas);
                $sg = $pdo->query("SELECT c.*, 0 AS silenciada FROM chat_conversas c
                                     WHERE c.tipo = 'externo' AND c.status_atendimento = 'em_atendimento'
                                     ORDER BY COALESCE(c.ultima_mensagem_em, c.criado_em) DESC LIMIT 300");
                foreach ($sg->fetchAll() as $l) {
                    if (!in_array((int) $l['id'], $ja, true)) {
                        $linhas[] = $l;
                    }
                }
                usort($linhas, fn($a, $b) => strcmp((string) ($b['ultima_mensagem_em'] ?? $b['criado_em']), (string) ($a['ultima_mensagem_em'] ?? $a['criado_em'])));
            }
            msgOk(aplicarPreferencias($pdo, formatarConversas($pdo, $linhas, $uid), $uid));

        // ===== Pacote 3 (14/10/2026): respostas rápidas, configurações, reações, encaminhar e contatos =====
        case 'respostas':
            // respostas da empresa (todos usam) e as pessoais de quem pede
            exigirMetodo('GET');
            $st = $pdo->prepare('SELECT id, atalho, texto, usuario_id FROM chat_respostas_rapidas WHERE usuario_id IS NULL OR usuario_id = :u ORDER BY atalho');
            $st->execute([':u' => $uid]);
            msgOk(array_map(fn($r) => ['id' => (int) $r['id'], 'atalho' => $r['atalho'], 'texto' => $r['texto'], 'pessoal' => $r['usuario_id'] !== null], $st->fetchAll()));

        case 'resposta_salvar':
            exigirMetodo('POST');
            $id = (int) ($corpo['id'] ?? 0);
            $atalho = strtolower(preg_replace('/[^a-z0-9_-]/i', '', (string) ($corpo['atalho'] ?? '')) ?? '');
            $texto = msgTextoMensagem((string) ($corpo['texto'] ?? ''));
            $pessoal = !empty($corpo['pessoal']);
            if ($atalho === '' || mb_strlen($atalho) > 40) {
                msgErro('Atalho inválido: use letras, números, - ou _ (até 40).');
            }
            if ($texto === '') {
                msgErro('Escreva o texto da resposta.');
            }
            if (!$pessoal && !msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG)) {
                msgErro('Só quem tem acesso às Configurações do Messenger cria respostas da empresa.', 403);
            }
            if ($id > 0) {
                $sr = $pdo->prepare('SELECT usuario_id FROM chat_respostas_rapidas WHERE id = :id');
                $sr->execute([':id' => $id]);
                $dono = $sr->fetch();
                if (!$dono) {
                    msgErro('Resposta não encontrada.', 404);
                }
                $ehDaEmpresa = $dono['usuario_id'] === null;
                if ($ehDaEmpresa ? !msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG) : (int) $dono['usuario_id'] !== $uid) {
                    msgErro('Você não pode alterar esta resposta.', 403);
                }
                $pdo->prepare('UPDATE chat_respostas_rapidas SET atalho = :a, texto = :t WHERE id = :id')->execute([':a' => $atalho, ':t' => $texto, ':id' => $id]);
            } else {
                $pdo->prepare('INSERT INTO chat_respostas_rapidas (atalho, texto, usuario_id, criado_por) VALUES (:a, :t, :u, :c)')
                    ->execute([':a' => $atalho, ':t' => $texto, ':u' => $pessoal ? $uid : null, ':c' => $uid]);
            }
            msgOk(null, 'Resposta salva.');

        case 'resposta_apagar':
            exigirMetodo('POST');
            $id = (int) ($corpo['id'] ?? 0);
            $sr = $pdo->prepare('SELECT usuario_id FROM chat_respostas_rapidas WHERE id = :id');
            $sr->execute([':id' => $id]);
            $dono = $sr->fetch();
            if (!$dono) {
                msgErro('Resposta não encontrada.', 404);
            }
            if ($dono['usuario_id'] === null ? !msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG) : (int) $dono['usuario_id'] !== $uid) {
                msgErro('Você não pode apagar esta resposta.', 403);
            }
            $pdo->prepare('DELETE FROM chat_respostas_rapidas WHERE id = :id')->execute([':id' => $id]);
            msgOk(null, 'Resposta apagada.');

        case 'config':
            exigirMetodo('GET');
            $automaticas = [];
            foreach (array_keys(msgBotPadroes()) as $chave) {
                $automaticas[$chave] = msgBotTexto($pdo, $chave);
            }
            msgOk([
                'assinatura' => msgConfigTela($pdo, 'assinatura', (bool) msgConfig('whatsapp_assinatura', true) ? 'completo' : 'nao'),
                'max_fixadas' => (int) msgConfigTela($pdo, 'max_fixadas', (string) MAX_FIXADAS),
                'max_etiquetas' => msgMaxEtiquetas($pdo),
                'pode_editar' => msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG),
                'automaticas' => $automaticas,
                'precos' => msgPrecosMeta($pdo),
                // Aurora no atendimento (16/10/2026)
                'ia' => [
                    'ativa' => msgConfigTela($pdo, 'ia_ativa', '0') === '1',
                    'disponivel' => trim((string) msgConfig('openai_api_key', '')) !== '',
                    'responder' => msgConfigTela($pdo, 'ia_responder', '1') === '1',
                    'limite' => (int) msgConfigTela($pdo, 'ia_limite', '3'),
                    'limites' => msgIaLimites($pdo),
                    'instrucoes' => (string) msgConfigTela($pdo, 'ia_instrucoes', ''),
                    'departamentos' => array_values(array_filter(array_map('intval', explode(',', (string) msgConfigTela($pdo, 'ia_kb_departamentos', ''))))),
                    'velorios' => msgConfigTela($pdo, 'ia_velorios', '1') === '1',
                    'funeral' => msgConfigTela($pdo, 'ia_funeral', '1') === '1',
                    'coroa' => msgConfigTela($pdo, 'ia_coroa_sugerir', '1') === '1',
                    'coroa_link' => (string) msgConfigTela($pdo, 'ia_coroa_link', 'https://planoassistencialintegrado.com.br/coroas-de-flores/'),
                    'vendas' => msgConfigTela($pdo, 'ia_vendas', '1') === '1',
                    'cobranca' => msgConfigTela($pdo, 'ia_cobranca', '1') === '1',
                    'coroa_vender' => msgConfigTela($pdo, 'ia_coroa_vender', '1') === '1',
                    'saudacao' => msgConfigTela($pdo, 'ia_saudacao', '1') === '1',
                ],
                'ocioso' => ['aurora_min' => (int) msgConfigTela($pdo, 'ocioso_aurora_min', '60'), 'atendimento_min' => (int) msgConfigTela($pdo, 'ocioso_atendimento_min', '0'),
                    'msg' => (string) msgConfigTela($pdo, 'ocioso_msg', 'Como não tivemos mais retorno, vou encerrar este atendimento por aqui. Se precisar, é só mandar uma nova mensagem que a gente continua de onde parou. 💙'),
                    'teste_contrato' => (string) msgConfigTela($pdo, 'teste_contrato', '')],
                'kb_departamentos' => (function () use ($pdo) {
                    try {
                        return array_map(fn($d) => ['id' => (int) $d['id'], 'nome' => $d['nome']], $pdo->query('SELECT id, nome FROM aurora_kb_departamentos ORDER BY nome')->fetchAll());
                    } catch (PDOException $e) {
                        return [];
                    }
                })(),
                'menu_previa' => msgBotMenuTexto($pdo, msgBotSetores($pdo)),
            ]);

        case 'config_salvar':
            exigirMetodo('POST');
            if (!msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG)) {
                msgErro('Sem acesso às Configurações do Messenger.', 403);
            }
            $valores = [];
            if (array_key_exists('assinatura', $corpo)) {
                $a = (string) $corpo['assinatura'];
                if (!in_array($a, ['completo', 'primeiro', 'nao'], true)) {
                    msgErro('Opção de assinatura inválida.');
                }
                $valores['assinatura'] = $a;
            }
            if (array_key_exists('max_fixadas', $corpo)) {
                $valores['max_fixadas'] = (string) max(1, min(10, (int) $corpo['max_fixadas']));
            }
            if (array_key_exists('max_etiquetas', $corpo)) {
                $valores['max_etiquetas'] = (string) max(1, min(10, (int) $corpo['max_etiquetas']));
            }
            // 16/10/2026: preços da Meta por categoria (R$)
            if (is_array($corpo['precos'] ?? null)) {
                foreach (['service', 'utility', 'marketing', 'authentication'] as $cat) {
                    if (isset($corpo['precos'][$cat]) && is_numeric(str_replace(',', '.', (string) $corpo['precos'][$cat]))) {
                        $valores['preco_' . $cat] = (string) round((float) str_replace(',', '.', (string) $corpo['precos'][$cat]), 4);
                    }
                }
            }
            // encerramento de conversa parada e contrato usado nos testes da Aurora
            if (is_array($corpo['ocioso'] ?? null)) {
                $o = $corpo['ocioso'];
                foreach (['aurora_min' => 'ocioso_aurora_min', 'atendimento_min' => 'ocioso_atendimento_min'] as $k => $chave) {
                    if (array_key_exists($k, $o)) {
                        $valores[$chave] = (string) max(0, min(10080, (int) $o[$k]));
                    }
                }
                if (array_key_exists('msg', $o)) {
                    $valores['ocioso_msg'] = mb_substr(trim((string) $o['msg']), 0, 600);
                }
                if (array_key_exists('teste_contrato', $o)) {
                    $valores['teste_contrato'] = mb_substr(preg_replace('/[^0-9]/', '', (string) $o['teste_contrato']), 0, 20);
                }
            }
            // Aurora no atendimento
            if (is_array($corpo['ia'] ?? null)) {
                $ia = $corpo['ia'];
                if (array_key_exists('ativa', $ia)) {
                    $valores['ia_ativa'] = !empty($ia['ativa']) ? '1' : '0';
                }
                if (array_key_exists('responder', $ia)) {
                    $valores['ia_responder'] = !empty($ia['responder']) ? '1' : '0';
                }
                if (array_key_exists('limite', $ia)) {
                    $valores['ia_limite'] = (string) max(0, min(40, (int) $ia['limite']));
                }
                foreach (['vendas' => [40, 'ia_limite_vendas'], 'pedidos' => [30, 'ia_limite_pedidos'], 'funeral' => [40, 'ia_limite_funeral'], 'espera' => [10, 'ia_limite_espera']] as $k => [$max, $chave]) {
                    if (array_key_exists($k, (array) ($ia['limites'] ?? []))) {
                        $valores[$chave] = (string) max(0, min($max, (int) $ia['limites'][$k]));
                    }
                }
                if (array_key_exists('instrucoes', $ia)) {
                    $valores['ia_instrucoes'] = mb_substr(trim((string) $ia['instrucoes']), 0, 2000);
                }
                foreach (['velorios' => 'ia_velorios', 'funeral' => 'ia_funeral', 'coroa' => 'ia_coroa_sugerir', 'vendas' => 'ia_vendas', 'cobranca' => 'ia_cobranca', 'coroa_vender' => 'ia_coroa_vender', 'saudacao' => 'ia_saudacao'] as $k => $chave) {
                    if (array_key_exists($k, $ia)) {
                        $valores[$chave] = !empty($ia[$k]) ? '1' : '0';
                    }
                }
                if (array_key_exists('coroa_link', $ia)) {
                    $l = trim((string) $ia['coroa_link']);
                    if ($l !== '' && !preg_match('#^https://[^\s]+$#i', $l)) {
                        msgErro('Informe o link completo do site, começando com https://');
                    }
                    $valores['ia_coroa_link'] = mb_substr($l, 0, 300);
                }
                if (array_key_exists('departamentos', $ia) && is_array($ia['departamentos'])) {
                    $valores['ia_kb_departamentos'] = implode(',', array_unique(array_filter(array_map('intval', $ia['departamentos']))));
                }
            }
            // Pacote 4B: mensagens automáticas e avaliação
            foreach (msgBotPadroes() as $chave => $padrao) {
                if (!array_key_exists($chave, is_array($corpo['automaticas'] ?? null) ? $corpo['automaticas'] : [])) {
                    continue;
                }
                $valor = $corpo['automaticas'][$chave];
                $valores[$chave] = in_array($padrao, ['0', '1'], true) ? (!empty($valor) && $valor !== '0' ? '1' : '0') : mb_substr(msgTextoMensagem((string) $valor), 0, 1000);
            }
            $sv = $pdo->prepare('INSERT INTO chat_config (chave, valor, atualizado_por) VALUES (:c, :v, :u) ON DUPLICATE KEY UPDATE valor = :v2, atualizado_por = :u2');
            foreach ($valores as $chave => $valor) {
                $sv->execute([':c' => $chave, ':v' => $valor, ':u' => $uid, ':v2' => $valor, ':u2' => $uid]);
            }
            msgOk(null, 'Configurações salvas.');

        case 'reagir':
            // reação com emoji (emoji vazio = tirar a reação). Em conversa de cliente, a reação também vai ao WhatsApp.
            exigirMetodo('POST');
            $mid = (int) ($corpo['mensagem_id'] ?? 0);
            $emoji = mb_substr(trim((string) ($corpo['emoji'] ?? '')), 0, 8);
            $sm = $pdo->prepare('SELECT id, conversa_id, externo_id, autor_tipo, interna FROM chat_mensagens WHERE id = :id AND apagada_em IS NULL');
            $sm->execute([':id' => $mid]);
            $alvo = $sm->fetch();
            if (!$alvo) {
                msgErro('Mensagem não encontrada.', 404);
            }
            $c = conversaVisivel($pdo, $usuario, (int) $alvo['conversa_id']);
            if ($emoji === '') {
                $pdo->prepare('DELETE FROM chat_reacoes WHERE mensagem_id = :m AND usuario_id = :u')->execute([':m' => $mid, ':u' => $uid]);
            } else {
                $pdo->prepare('INSERT INTO chat_reacoes (mensagem_id, usuario_id, emoji) VALUES (:m, :u, :e) ON DUPLICATE KEY UPDATE emoji = :e2, criado_em = NOW()')
                    ->execute([':m' => $mid, ':u' => $uid, ':e' => $emoji, ':e2' => $emoji]);
            }
            if ($c['tipo'] === 'externo' && empty($alvo['interna']) && !empty($alvo['externo_id']) && (int) ($c['responsavel_usuario_id'] ?? 0) === $uid && janelaAberta($c)) {
                $paraWa = $pdo->prepare('SELECT wa_id FROM chat_contatos_externos WHERE id = :id');
                $paraWa->execute([':id' => $c['contato_externo_id']]);
                $wa = (string) $paraWa->fetchColumn();
                if ($wa !== '') {
                    msgDepois(fn() => msgMeta('POST', msgConfig('meta_phone_number_id', '') . '/messages', [
                        'messaging_product' => 'whatsapp', 'recipient_type' => 'individual', ...msgDestinoWhats($wa),
                        'type' => 'reaction', 'reaction' => ['message_id' => $alvo['externo_id'], 'emoji' => $emoji],
                    ]));
                }
            }
            $m = msgMensagemPorId($pdo, $mid);
            $dados = ['conversa_id' => (int) $c['id'], 'mensagem_id' => $mid, 'reacoes' => $m['reacoes'] ?? []];
            $dest = msgDestinatarios($pdo, $c);
            msgDepois(fn() => msgAblyAvisar($dest, 'reacao', $dados));
            msgOk($dados);

        case 'encaminhar':
            // encaminha uma mensagem (texto, foto, áudio ou documento) para até 10 conversas em que a pessoa pode escrever
            exigirMetodo('POST');
            $mid = (int) ($corpo['mensagem_id'] ?? 0);
            $destinos = array_slice(array_values(array_unique(array_filter(array_map('intval', is_array($corpo['conversa_ids'] ?? null) ? $corpo['conversa_ids'] : [])))), 0, 10);
            $sm = $pdo->prepare('SELECT * FROM chat_mensagens WHERE id = :id AND apagada_em IS NULL');
            $sm->execute([':id' => $mid]);
            $orig = $sm->fetch();
            if (!$orig || !empty($orig['interna']) || in_array($orig['tipo'], ['sistema', 'modelo'], true)) {
                msgErro('Esta mensagem não pode ser encaminhada.');
            }
            conversaVisivel($pdo, $usuario, (int) $orig['conversa_id']);
            if (!$destinos) {
                msgErro('Escolha para quem encaminhar.');
            }
            $sa = $pdo->prepare('SELECT * FROM chat_anexos WHERE mensagem_id = :id ORDER BY id');
            $sa->execute([':id' => $mid]);
            $anexosOrig = array_map(fn($a) => [
                'chave_r2' => $a['chave_r2'], 'nome_original' => $a['nome_original'], 'mime' => $a['mime'], 'tamanho_bytes' => $a['tamanho_bytes'],
                'duracao_s' => $a['duracao_s'], 'largura' => $a['largura'], 'altura' => $a['altura'], 'miniatura_chave' => $a['miniatura_chave'],
            ], $sa->fetchAll());
            $ok = 0;
            $recusadas = [];
            foreach ($destinos as $did) {
                $cd = msgConversa($pdo, $did);
                $sp = $pdo->prepare('SELECT 1 FROM chat_participantes WHERE conversa_id = :c AND usuario_id = :u AND saiu_em IS NULL');
                $sp->execute([':c' => $did, ':u' => $uid]);
                $podeEscrever = $cd && $sp->fetchColumn();
                $ext = $cd && $cd['tipo'] === 'externo';
                if ($ext) {
                    $podeEscrever = $podeEscrever && (int) ($cd['responsavel_usuario_id'] ?? 0) === $uid && $cd['status_atendimento'] === 'em_atendimento' && janelaAberta($cd);
                }
                if (!$podeEscrever) {
                    $recusadas[] = $did;
                    continue;
                }
                $pdo->beginTransaction();
                $nid = msgGravar($pdo, $did, [
                    'atendimento_id' => $ext ? (int) $cd['atendimento_atual_id'] : null,
                    'autor_tipo' => 'usuario',
                    'autor_usuario_id' => $uid,
                    'tipo' => $orig['tipo'],
                    'texto' => $orig['texto'],
                    'status_envio' => $ext ? 'pendente' : null,
                    'anexos' => $anexosOrig,
                ]);
                $pdo->commit();
                if ($ext) {
                    enviarAoWhatsApp($pdo, $cd, $nid, null);
                }
                msgDifundir($pdo, $did, $nid, $uid);
                $ok++;
            }
            msgOk(['encaminhadas' => $ok, 'recusadas' => $recusadas], $ok ? 'Mensagem encaminhada.' : 'Não foi possível encaminhar para as conversas escolhidas.');

        // ===== Pacote 4A (15/10/2026): setores, etiquetas e transferir para setor =====
        case 'setores':
            exigirMetodo('GET');
            msgOk(['setores' => carregarSetores($pdo), 'meus' => msgSetoresDoUsuario($pdo, $uid), 'pode_editar' => msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG)]);

        case 'setor_salvar':
            exigirMetodo('POST');
            if (!msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG)) {
                msgErro('Sem acesso às Configurações do Messenger.', 403);
            }
            $id = (int) ($corpo['id'] ?? 0);
            $nome = mb_substr(msgTexto((string) ($corpo['nome'] ?? '')), 0, 80);
            $cor = preg_match('/^#[0-9A-Fa-f]{6}$/', (string) ($corpo['cor'] ?? '')) ? strtoupper((string) $corpo['cor']) : '#3D6A99';
            if ($nome === '') {
                msgErro('Dê um nome ao setor.');
            }
            $horarios = [];
            foreach (is_array($corpo['horarios'] ?? null) ? $corpo['horarios'] : [] as $h) {
                $dia = (int) ($h['dia'] ?? -1);
                $ini = horaValida((string) ($h['inicio'] ?? ''));
                $fim = horaValida((string) ($h['fim'] ?? ''));
                if ($dia < 0 || $dia > 6 || !$ini || !$fim || $fim <= $ini) {
                    msgErro('Confira os horários: o fim de cada faixa tem que ser depois do início.');
                }
                $horarios[] = [$dia, $ini, $fim];
            }
            $excecoes = [];
            foreach (is_array($corpo['excecoes'] ?? null) ? $corpo['excecoes'] : [] as $e) {
                $data = (string) ($e['data'] ?? '');
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $data)) {
                    msgErro('Data de exceção inválida.');
                }
                $fechado = !empty($e['fechado']);
                $ini = $fechado ? null : horaValida((string) ($e['inicio'] ?? ''));
                $fim = $fechado ? null : horaValida((string) ($e['fim'] ?? ''));
                if (!$fechado && (!$ini || !$fim || $fim <= $ini)) {
                    msgErro('Na exceção de ' . date('d/m', strtotime($data)) . ', informe o horário ou marque como fechado.');
                }
                $excecoes[] = [$data, mb_substr(msgTexto((string) ($e['descricao'] ?? '')), 0, 120), $fechado ? 1 : 0, $ini, $fim];
            }
            $membros = array_values(array_unique(array_filter(array_map('intval', is_array($corpo['membros'] ?? null) ? $corpo['membros'] : []))));
            $campos = [
                ':n' => $nome, ':c' => $cor, ':a' => !empty($corpo['ativo']) ? 1 : 0, ':p' => !empty($corpo['plantao']) ? 1 : 0,
                ':o' => (int) ($corpo['ordem'] ?? 0),
                ':bv' => ($t = msgTextoMensagem((string) ($corpo['msg_boas_vindas'] ?? ''))) !== '' ? $t : null,
                ':fh' => ($t = msgTextoMensagem((string) ($corpo['msg_fora_horario'] ?? ''))) !== '' ? $t : null,
                ':tm' => mb_substr(trim((string) ($corpo['texto_menu'] ?? '')), 0, 90) ?: null,
                ':di' => mb_substr(trim((string) ($corpo['descricao_ia'] ?? '')), 0, 600) ?: null,
                ':nm' => array_key_exists('no_menu', $corpo) && empty($corpo['no_menu']) ? 0 : 1,
            ];
            $pdo->beginTransaction();
            if ($id > 0) {
                $pdo->prepare('UPDATE chat_setores SET nome = :n, cor = :c, ativo = :a, plantao = :p, ordem = :o, msg_boas_vindas = :bv, msg_fora_horario = :fh, texto_menu = :tm, descricao_ia = :di, no_menu = :nm WHERE id = :id')
                    ->execute($campos + [':id' => $id]);
            } else {
                $pdo->prepare('INSERT INTO chat_setores (nome, cor, ativo, plantao, ordem, msg_boas_vindas, msg_fora_horario, texto_menu, descricao_ia, no_menu) VALUES (:n, :c, :a, :p, :o, :bv, :fh, :tm, :di, :nm)')->execute($campos);
                $id = (int) $pdo->lastInsertId();
            }
            $pdo->prepare('DELETE FROM chat_setor_membros WHERE setor_id = :s')->execute([':s' => $id]);
            $pdo->prepare('DELETE FROM chat_setor_horarios WHERE setor_id = :s')->execute([':s' => $id]);
            $pdo->prepare('DELETE FROM chat_setor_excecoes WHERE setor_id = :s')->execute([':s' => $id]);
            $im = $pdo->prepare('INSERT INTO chat_setor_membros (setor_id, usuario_id) VALUES (:s, :u)');
            foreach ($membros as $u) {
                $im->execute([':s' => $id, ':u' => $u]);
            }
            $ih = $pdo->prepare('INSERT INTO chat_setor_horarios (setor_id, dia_semana, inicio, fim) VALUES (:s, :d, :i, :f)');
            foreach ($horarios as [$d, $i, $f]) {
                $ih->execute([':s' => $id, ':d' => $d, ':i' => $i, ':f' => $f]);
            }
            $ie = $pdo->prepare('INSERT INTO chat_setor_excecoes (setor_id, data, descricao, fechado, inicio, fim) VALUES (:s, :d, :ds, :fe, :i, :f)');
            foreach ($excecoes as [$d, $ds, $fe, $i, $f]) {
                $ie->execute([':s' => $id, ':d' => $d, ':ds' => $ds !== '' ? $ds : null, ':fe' => $fe, ':i' => $i, ':f' => $f]);
            }
            $pdo->commit();
            msgOk(['id' => $id, 'setores' => carregarSetores($pdo)], 'Setor salvo.');

        case 'etiquetas':
            exigirMetodo('GET');
            $st = $pdo->prepare('SELECT e.id, e.nome, e.cor, e.usuario_id, e.quando_usar, (SELECT COUNT(*) FROM chat_conversa_etiquetas ce WHERE ce.etiqueta_id = e.id) AS uso
                                   FROM chat_etiquetas e WHERE e.usuario_id IS NULL OR e.usuario_id = :u ORDER BY e.usuario_id IS NOT NULL, e.nome');
            $st->execute([':u' => $uid]);
            msgOk(array_map(fn($r) => ['id' => (int) $r['id'], 'nome' => $r['nome'], 'cor' => $r['cor'], 'pessoal' => $r['usuario_id'] !== null, 'uso' => (int) $r['uso'], 'quando_usar' => $r['quando_usar']], $st->fetchAll()));

        case 'etiqueta_salvar':
            exigirMetodo('POST');
            $id = (int) ($corpo['id'] ?? 0);
            $nome = mb_substr(msgTexto((string) ($corpo['nome'] ?? '')), 0, 60);
            $cor = preg_match('/^#[0-9A-Fa-f]{6}$/', (string) ($corpo['cor'] ?? '')) ? strtoupper((string) $corpo['cor']) : '#3D6A99';
            $pessoal = !empty($corpo['pessoal']);
            // "Quando usar": orienta a equipe e, no futuro, a Aurora na hora de etiquetar
            $quandoUsar = mb_substr(trim((string) ($corpo['quando_usar'] ?? '')), 0, 400) ?: null;
            if ($nome === '') {
                msgErro('Dê um nome à etiqueta.');
            }
            if ($id > 0) {
                $sd = $pdo->prepare('SELECT usuario_id FROM chat_etiquetas WHERE id = :id');
                $sd->execute([':id' => $id]);
                $dono = $sd->fetch();
                if (!$dono) {
                    msgErro('Etiqueta não encontrada.', 404);
                }
                if ($dono['usuario_id'] === null ? !msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG) : (int) $dono['usuario_id'] !== $uid) {
                    msgErro('Você não pode alterar esta etiqueta.', 403);
                }
                $pdo->prepare('UPDATE chat_etiquetas SET nome = :n, cor = :c, quando_usar = :q WHERE id = :id')->execute([':n' => $nome, ':c' => $cor, ':q' => $quandoUsar, ':id' => $id]);
            } else {
                if (!$pessoal && !msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG)) {
                    msgErro('Só quem tem acesso às Configurações do Messenger cria etiquetas da empresa.', 403);
                }
                $pdo->prepare('INSERT INTO chat_etiquetas (nome, cor, usuario_id, criado_por, quando_usar) VALUES (:n, :c, :u, :cp, :q)')
                    ->execute([':n' => $nome, ':c' => $cor, ':u' => $pessoal ? $uid : null, ':cp' => $uid, ':q' => $quandoUsar]);
            }
            msgOk(null, 'Etiqueta salva.');

        case 'etiqueta_apagar':
            exigirMetodo('POST');
            $id = (int) ($corpo['id'] ?? 0);
            $sd = $pdo->prepare('SELECT usuario_id FROM chat_etiquetas WHERE id = :id');
            $sd->execute([':id' => $id]);
            $dono = $sd->fetch();
            if (!$dono) {
                msgErro('Etiqueta não encontrada.', 404);
            }
            if ($dono['usuario_id'] === null ? !msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG) : (int) $dono['usuario_id'] !== $uid) {
                msgErro('Você não pode apagar esta etiqueta.', 403);
            }
            $pdo->prepare('DELETE FROM chat_conversa_etiquetas WHERE etiqueta_id = :id')->execute([':id' => $id]);
            $pdo->prepare('DELETE FROM chat_etiquetas WHERE id = :id')->execute([':id' => $id]);
            msgOk(null, 'Etiqueta apagada.');

        case 'conversa_etiquetas':
            // marca as etiquetas da conversa (troca as que a pessoa pode ver pela lista enviada)
            exigirMetodo('POST');
            $c = conversaVisivel($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            $cid = (int) $c['id'];
            $pedidas = array_values(array_unique(array_filter(array_map('intval', is_array($corpo['etiqueta_ids'] ?? null) ? $corpo['etiqueta_ids'] : []))));
            $sv = $pdo->prepare('SELECT id FROM chat_etiquetas WHERE usuario_id IS NULL OR usuario_id = :u');
            $sv->execute([':u' => $uid]);
            $visiveis = array_map('intval', $sv->fetchAll(PDO::FETCH_COLUMN));
            $pedidas = array_values(array_intersect($pedidas, $visiveis));
            // limite de etiquetas por conversa (Configurações › Geral); conta também as pessoais de outras pessoas
            $maxEtiquetas = msgMaxEtiquetas($pdo);
            $outras = 0;
            if ($visiveis) {
                $so = $pdo->prepare('SELECT COUNT(*) FROM chat_conversa_etiquetas WHERE conversa_id = :c AND etiqueta_id NOT IN (' . implode(',', $visiveis) . ')');
                $so->execute([':c' => $cid]);
                $outras = (int) $so->fetchColumn();
            }
            if (count($pedidas) + $outras > $maxEtiquetas) {
                msgErro('Cada conversa pode ter até ' . $maxEtiquetas . ' etiquetas.', 422);
            }
            if ($visiveis) {
                $marc = implode(',', $visiveis);
                $pdo->prepare("DELETE FROM chat_conversa_etiquetas WHERE conversa_id = :c AND etiqueta_id IN ({$marc})")->execute([':c' => $cid]);
            }
            $ie = $pdo->prepare('INSERT IGNORE INTO chat_conversa_etiquetas (conversa_id, etiqueta_id, criado_por) VALUES (:c, :e, :u)');
            foreach ($pedidas as $e) {
                $ie->execute([':c' => $cid, ':e' => $e, ':u' => $uid]);
            }
            $dest = msgDestinatarios($pdo, $c);
            msgDepois(fn() => msgAblyAvisar($dest, 'conversa', ['conversa_id' => $cid]));
            msgOk(conversaFormatada($pdo, $cid, $uid), 'Etiquetas atualizadas.');

        case 'transferir_setor':
            // devolve o cliente à fila de outro setor (os atendentes daquele setor são avisados); o histórico do atendimento continua
            exigirMetodo('POST');
            $c = msgConversa($pdo, (int) ($corpo['conversa_id'] ?? 0));
            if (!$c || $c['tipo'] !== 'externo' || !in_array($c['status_atendimento'], ['aguardando', 'em_atendimento'], true)) {
                msgErro('Atendimento em andamento não encontrado.', 404);
            }
            $anterior = $c['responsavel_usuario_id'] !== null ? (int) $c['responsavel_usuario_id'] : null;
            if ($anterior !== $uid && !msgEhGestao($pdo, $uid) && !($c['status_atendimento'] === 'aguardando' && msgEhAtendente($pdo, $uid))) {
                msgErro('Só o responsável pela conversa ou a Gestão pode transferir.', 403);
            }
            $sid = (int) ($corpo['setor_id'] ?? 0);
            $ss = $pdo->prepare('SELECT id, nome FROM chat_setores WHERE id = :id AND ativo = 1');
            $ss->execute([':id' => $sid]);
            $setor = $ss->fetch();
            if (!$setor) {
                msgErro('Escolha um setor ativo.');
            }
            $obs = mb_substr(msgTexto((string) ($corpo['observacao'] ?? '')), 0, 500);
            $cid = (int) $c['id'];
            $pdo->beginTransaction();
            $pdo->prepare("UPDATE chat_conversas SET setor_id = :s, status_atendimento = 'aguardando', responsavel_usuario_id = NULL, atribuida_em = NULL, bot_estado = NULL WHERE id = :id")
                ->execute([':s' => $sid, ':id' => $cid]);
            $pdo->prepare("UPDATE chat_atendimentos a INNER JOIN chat_conversas c ON c.atendimento_atual_id = a.id
                              SET a.responsavel_usuario_id = NULL, a.status = 'aguardando' WHERE c.id = :id")->execute([':id' => $cid]);
            $pdo->prepare("UPDATE chat_participantes SET saiu_em = NOW() WHERE conversa_id = :c AND saiu_em IS NULL")->execute([':c' => $cid]);
            // (a transferência para setor fica registrada na mensagem de sistema da conversa)
            $pdo->commit();
            msgSistema($pdo, $cid, 'Transferida para o setor ' . $setor['nome'] . ($obs !== '' ? ': ' . $obs : ''));
            msgAvisarFila($pdo, $cid);
            $paraSetor = array_values(array_diff(msgAtendentesDoSetor($pdo, $sid), [$uid]));
            $notif = ['titulo' => 'PAI Messenger', 'corpo' => 'Cliente na fila do setor ' . $setor['nome'],
                      'conversa_id' => $cid, 'url' => '/messenger?conversa=' . $cid, 'tag' => 'conversa-' . $cid];
            msgDepois(fn() => msgPushEnviar($pdo, $paraSetor, $notif));
            msgOk(['conversa_id' => $cid, 'setor_id' => $sid], 'Conversa enviada para a fila do setor ' . $setor['nome'] . '.');

        // ===== Painel de monitoramento (15/10/2026) — só a Gestão =====
        case 'painel':
            exigirMetodo('GET');
            if (!msgEhGestao($pdo, $uid)) {
                msgErro('O painel de monitoramento é da Gestão.', 403);
            }
            $de = !empty($_GET['de']) && strtotime((string) $_GET['de']) ? date('Y-m-d 00:00:00', strtotime((string) $_GET['de'])) : date('Y-m-d 00:00:00');
            $ate = !empty($_GET['ate']) && strtotime((string) $_GET['ate']) ? date('Y-m-d 23:59:59', strtotime((string) $_GET['ate'])) : date('Y-m-d 23:59:59');
            $agora = (string) $pdo->query('SELECT NOW()')->fetchColumn();
            $setoresLista = carregarSetores($pdo);
            $setorNome = [];
            foreach ($setoresLista as $st) {
                $setorNome[$st['id']] = $st;
            }

            // --- fila agora
            $fila = $pdo->query("SELECT c.id, c.setor_id, c.bot_estado, a.aberto_em, COALESCE(ce.nome_salvo, ce.nome) AS nome, ce.telefone_e164,
                                        TIMESTAMPDIFF(SECOND, a.aberto_em, NOW()) AS espera_s
                                   FROM chat_conversas c
                                   INNER JOIN chat_atendimentos a ON a.id = c.atendimento_atual_id
                                   LEFT JOIN chat_contatos_externos ce ON ce.id = c.contato_externo_id
                                  WHERE c.tipo = 'externo' AND c.status_atendimento = 'aguardando' AND COALESCE(c.teste, 0) = 0
                                  ORDER BY a.aberto_em ASC LIMIT 200")->fetchAll();
            // --- em atendimento agora
            $emAtend = $pdo->query("SELECT c.id, c.setor_id, c.responsavel_usuario_id, TIMESTAMPDIFF(SECOND, COALESCE(a.atribuido_em, a.aberto_em), NOW()) AS duracao_s
                                      FROM chat_conversas c INNER JOIN chat_atendimentos a ON a.id = c.atendimento_atual_id
                                     WHERE c.tipo = 'externo' AND c.status_atendimento = 'em_atendimento'")->fetchAll();
            // --- presença dos atendentes
            $atendentes = msgAtendentesAtivos($pdo);
            $nomes = msgNomesUsuarios($pdo, $atendentes);
            $online = [];
            try {
                foreach ($pdo->query('SELECT usuario_id FROM chat_presenca WHERE visto_em >= NOW() - INTERVAL 120 SECOND')->fetchAll(PDO::FETCH_COLUMN) as $u) {
                    $online[(int) $u] = true;
                }
            } catch (PDOException $e) {
                $online = [];
            }
            // --- atendimentos do período
            $sp = $pdo->prepare("SELECT a.id, a.conversa_id, a.responsavel_usuario_id, a.status, a.aberto_em, a.atribuido_em, a.encerrado_em, a.avaliacao_nota, c.setor_id,
                                        (SELECT MIN(m.criado_em) FROM chat_mensagens m WHERE m.atendimento_id = a.id AND m.autor_tipo = 'usuario' AND m.interna = 0) AS primeira_resposta
                                   FROM chat_atendimentos a INNER JOIN chat_conversas c ON c.id = a.conversa_id
                                  WHERE a.aberto_em BETWEEN :de AND :ate");
            $sp->execute([':de' => $de, ':ate' => $ate]);
            $periodo = $sp->fetchAll();

            $porAtendente = [];
            foreach ($atendentes as $a) {
                $porAtendente[$a] = ['id' => $a, 'nome' => $nomes[$a] ?? '—', 'online' => isset($online[$a]), 'em_andamento' => 0, 'encerrados' => 0, 'resp_soma' => 0, 'resp_qtd' => 0, 'nota_soma' => 0, 'nota_qtd' => 0];
            }
            foreach ($emAtend as $e) {
                $r = (int) $e['responsavel_usuario_id'];
                if (isset($porAtendente[$r])) {
                    $porAtendente[$r]['em_andamento']++;
                }
            }
            $porDia = [];
            $porSetor = [];
            $notas = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
            $esperaSoma = 0;
            $esperaQtd = 0;
            $duracaoSoma = 0;
            $duracaoQtd = 0;
            $encerrados = 0;
            foreach ($periodo as $p) {
                $dia = substr($p['aberto_em'], 0, 10);
                $porDia[$dia] = ($porDia[$dia] ?? 0) + 1;
                $sid = $p['setor_id'] !== null ? (int) $p['setor_id'] : 0;
                $porSetor[$sid] = ($porSetor[$sid] ?? 0) + 1;
                $r = $p['responsavel_usuario_id'] !== null ? (int) $p['responsavel_usuario_id'] : 0;
                if ($p['atribuido_em']) {
                    $esperaSoma += max(0, strtotime($p['atribuido_em']) - strtotime($p['aberto_em']));
                    $esperaQtd++;
                }
                if ($p['status'] === 'encerrado' && $p['encerrado_em']) {
                    $encerrados++;
                    $duracaoSoma += max(0, strtotime($p['encerrado_em']) - strtotime($p['atribuido_em'] ?: $p['aberto_em']));
                    $duracaoQtd++;
                    if (isset($porAtendente[$r])) {
                        $porAtendente[$r]['encerrados']++;
                    }
                }
                if ($p['primeira_resposta'] && isset($porAtendente[$r])) {
                    $porAtendente[$r]['resp_soma'] += max(0, strtotime($p['primeira_resposta']) - strtotime($p['atribuido_em'] ?: $p['aberto_em']));
                    $porAtendente[$r]['resp_qtd']++;
                }
                if ($p['avaliacao_nota'] !== null) {
                    $n = (int) $p['avaliacao_nota'];
                    if (isset($notas[$n])) {
                        $notas[$n]++;
                    }
                    if (isset($porAtendente[$r])) {
                        $porAtendente[$r]['nota_soma'] += $n;
                        $porAtendente[$r]['nota_qtd']++;
                    }
                }
            }
            // dias sem atendimento aparecem com zero
            $dias = [];
            for ($t = strtotime(substr($de, 0, 10)); $t <= strtotime(substr($ate, 0, 10)) && count($dias) < 93; $t += 86400) {
                $d = date('Y-m-d', $t);
                $dias[] = ['dia' => $d, 'total' => $porDia[$d] ?? 0];
            }
            // etiquetas (da empresa) nas conversas dos atendimentos do período
            $porEtiqueta = [];
            $convIds = array_values(array_unique(array_map(fn($p) => (int) $p['conversa_id'], $periodo)));
            if ($convIds) {
                $marc = implode(',', $convIds);
                foreach ($pdo->query("SELECT e.id, e.nome, e.cor, COUNT(*) AS total FROM chat_conversa_etiquetas ce INNER JOIN chat_etiquetas e ON e.id = ce.etiqueta_id AND e.usuario_id IS NULL
                                       WHERE ce.conversa_id IN ({$marc}) GROUP BY e.id, e.nome, e.cor ORDER BY total DESC")->fetchAll() as $e) {
                    $porEtiqueta[] = ['id' => (int) $e['id'], 'nome' => $e['nome'], 'cor' => $e['cor'], 'total' => (int) $e['total']];
                }
            }
            $totalNotas = array_sum($notas);
            $somaNotas = 0;
            foreach ($notas as $n => $q) {
                $somaNotas += $n * $q;
            }
            $filaPorSetor = [];
            foreach ($fila as $f) {
                $k = $f['setor_id'] !== null ? (int) $f['setor_id'] : 0;
                $filaPorSetor[$k] = ($filaPorSetor[$k] ?? 0) + 1;
            }
            $atendPorSetor = [];
            foreach ($emAtend as $e) {
                $k = $e['setor_id'] !== null ? (int) $e['setor_id'] : 0;
                $atendPorSetor[$k] = ($atendPorSetor[$k] ?? 0) + 1;
            }
            // --- mensagens no WhatsApp e custos da Meta (16/10/2026)
            $sm = $pdo->prepare("SELECT m.autor_tipo, m.autor_usuario_id, m.tipo, m.status_envio, m.cobravel, m.categoria_meta, a.responsavel_usuario_id AS resp
                                   FROM chat_mensagens m
                                   INNER JOIN chat_conversas c ON c.id = m.conversa_id AND c.tipo = 'externo'
                                   LEFT JOIN chat_atendimentos a ON a.id = m.atendimento_id
                                  WHERE m.criado_em BETWEEN :de AND :ate AND m.interna = 0 AND m.tipo <> 'sistema'");
            $sm->execute([':de' => $de, ':ate' => $ate]);
            $precos = msgPrecosMeta($pdo);
            $msg = ['recebidas' => 0, 'enviadas' => 0, 'equipe' => 0, 'automaticas' => 0, 'modelos' => 0, 'falhas' => 0];
            $custos = [];
            foreach (['service', 'utility', 'marketing', 'authentication'] as $cat) {
                $custos[$cat] = ['categoria' => $cat, 'entregues' => 0, 'cobradas' => 0, 'preco' => $precos[$cat], 'total' => 0.0];
            }
            $semInfo = 0;
            $porUsuario = [];
            $linhaUsuario = function ($id, $nome) use (&$porUsuario) {
                if (!isset($porUsuario[$id])) {
                    $porUsuario[$id] = ['id' => $id, 'nome' => $nome, 'enviadas' => 0, 'recebidas' => 0, 'modelos' => 0, 'custo' => 0.0];
                }
            };
            $todosNomes = msgNomesUsuarios($pdo, array_merge($atendentes, array_map('intval', array_column($sm->fetchAll() ?: [], 'autor_usuario_id'))));
            $sm->execute([':de' => $de, ':ate' => $ate]);
            foreach ($sm->fetchAll() as $r) {
                if ($r['autor_tipo'] === 'contato') {
                    $msg['recebidas']++;
                    if ($r['resp'] !== null) {
                        $linhaUsuario((int) $r['resp'], $todosNomes[(int) $r['resp']] ?? '—');
                        $porUsuario[(int) $r['resp']]['recebidas']++;
                    }
                    continue;
                }
                $msg['enviadas']++;
                $quem = $r['autor_tipo'] === 'sistema' ? 0 : (int) $r['autor_usuario_id'];
                $msg[$quem ? 'equipe' : 'automaticas']++;
                $linhaUsuario($quem, $quem ? ($todosNomes[$quem] ?? '—') : 'Mensagens automáticas');
                $porUsuario[$quem]['enviadas']++;
                if ($r['tipo'] === 'modelo') {
                    $msg['modelos']++;
                    $porUsuario[$quem]['modelos']++;
                }
                if ($r['status_envio'] === 'falhou') {
                    $msg['falhas']++;
                    continue;
                }
                $cat = (string) ($r['categoria_meta'] ?? '');
                if (!isset($custos[$cat])) {
                    if (in_array($r['status_envio'], ['entregue', 'lida'], true)) {
                        $semInfo++;
                    }
                    continue;
                }
                $custos[$cat]['entregues']++;
                if ((int) $r['cobravel'] === 1) {
                    $custos[$cat]['cobradas']++;
                    $custos[$cat]['total'] += $precos[$cat];
                    $porUsuario[$quem]['custo'] += $precos[$cat];
                }
            }
            $totalCusto = round(array_sum(array_map(fn($c) => $c['total'], $custos)), 2);
            $diasPeriodo = max(1, (int) round((strtotime(substr($ate, 0, 10)) - strtotime(substr($de, 0, 10))) / 86400) + 1);
            $mesAtual = substr($de, 0, 7) === date('Y-m') && substr($de, 8, 2) === '01' && substr($ate, 0, 10) === date('Y-m-d');
            msgOk([
                'agora' => msgDataIso($agora),
                'periodo' => ['de' => substr($de, 0, 10), 'ate' => substr($ate, 0, 10)],
                'mensagens' => $msg,
                'custos' => [
                    'categorias' => array_values(array_map(fn($c) => array_merge($c, ['total' => round($c['total'], 2)]), $custos)),
                    'total' => $totalCusto,
                    'sem_informacao' => $semInfo,
                    'projecao_mes' => $mesAtual ? round($totalCusto / $diasPeriodo * (int) date('t'), 2) : null,
                ],
                'por_usuario' => array_values(array_map(fn($u) => array_merge($u, ['custo' => round($u['custo'], 2)]), $porUsuario)),
                'indicadores' => [
                    'fila' => count($fila),
                    'no_menu' => count(array_filter($fila, fn($f) => $f['bot_estado'] === 'menu')),
                    'maior_espera_s' => $fila ? (int) max(array_map(fn($f) => (int) $f['espera_s'], $fila)) : 0,
                    'em_atendimento' => count($emAtend),
                    'atendentes_online' => count(array_filter($porAtendente, fn($a) => $a['online'])),
                    'atendentes_total' => count($porAtendente),
                    'abertos_periodo' => count($periodo),
                    'encerrados_periodo' => $encerrados,
                    'espera_media_s' => $esperaQtd ? (int) round($esperaSoma / $esperaQtd) : null,
                    'duracao_media_s' => $duracaoQtd ? (int) round($duracaoSoma / $duracaoQtd) : null,
                    'nota_media' => $totalNotas ? round($somaNotas / $totalNotas, 1) : null,
                    'avaliacoes' => $totalNotas,
                ],
                'setores' => array_values(array_map(fn($st) => [
                    'id' => $st['id'], 'nome' => $st['nome'], 'cor' => $st['cor'], 'aberto' => $st['aberto'], 'situacao' => $st['situacao'], 'ativo' => $st['ativo'],
                    'fila' => $filaPorSetor[$st['id']] ?? 0, 'em_atendimento' => $atendPorSetor[$st['id']] ?? 0, 'periodo' => $porSetor[$st['id']] ?? 0,
                ], array_filter($setoresLista, fn($st) => $st['ativo']))),
                'sem_setor' => ['fila' => $filaPorSetor[0] ?? 0, 'em_atendimento' => $atendPorSetor[0] ?? 0, 'periodo' => $porSetor[0] ?? 0],
                'fila' => array_map(fn($f) => [
                    'conversa_id' => (int) $f['id'], 'nome' => $f['nome'] ?: $f['telefone_e164'], 'telefone' => $f['telefone_e164'],
                    'setor' => $f['setor_id'] !== null && isset($setorNome[(int) $f['setor_id']]) ? ['nome' => $setorNome[(int) $f['setor_id']]['nome'], 'cor' => $setorNome[(int) $f['setor_id']]['cor']] : null,
                    'no_menu' => $f['bot_estado'] === 'menu', 'espera_s' => (int) $f['espera_s'],
                ], $fila),
                'atendentes' => array_values(array_map(fn($a) => [
                    'id' => $a['id'], 'nome' => $a['nome'], 'online' => $a['online'], 'em_andamento' => $a['em_andamento'], 'encerrados' => $a['encerrados'],
                    'primeira_resposta_media_s' => $a['resp_qtd'] ? (int) round($a['resp_soma'] / $a['resp_qtd']) : null,
                    'nota_media' => $a['nota_qtd'] ? round($a['nota_soma'] / $a['nota_qtd'], 1) : null, 'avaliacoes' => $a['nota_qtd'],
                ], $porAtendente)),
                'por_dia' => $dias,
                'por_etiqueta' => $porEtiqueta,
                'notas' => array_map(fn($n) => ['nota' => $n, 'total' => $notas[$n]], array_keys($notas)),
            ]);

        // ===== Pacote 5B/5C (16/10/2026): cliente na Unymos (painel da conversa) — integração em messenger_unymos.php =====
        case 'cliente_painel':
            exigirMetodo('GET');
            @set_time_limit(90);
            $c = conversaVisivel($pdo, $usuario, (int) ($_GET['conversa_id'] ?? 0));
            if ($c['tipo'] !== 'externo') {
                msgErro('Só conversas de clientes têm contrato.');
            }
            $contatoId = (int) $c['contato_externo_id'];
            $vinculos = msgVinculosContato($pdo, $contatoId);
            try {
                if (!$vinculos && msgAutoVincular($pdo, $contatoId, (int) $c['id'], !empty($_GET['procurar']))) {
                    $vinculos = msgVinculosContato($pdo, $contatoId);
                }
                msgUnyConferirPix($pdo, (int) $c['id']);
            } catch (Throwable $e) {
                error_log('[messenger] painel do cliente: ' . $e->getMessage());
            }
            if (!$vinculos) {
                msgOk(['vinculos' => [], 'atual' => null]);
            }
            $pedido = trim((string) ($_GET['contrato'] ?? ''));
            $atual = $vinculos[0];
            foreach ($vinculos as $v) {
                if ($pedido !== '' && (string) $v['contrato'] === $pedido) {
                    $atual = $v;
                }
            }
            $sv = $pdo->prepare('SELECT titular_cpf FROM chat_contato_contratos WHERE contato_id = :c AND contrato = :n');
            $sv->execute([':c' => $contatoId, ':n' => $atual['contrato']]);
            $cpf = preg_replace('/\D/', '', (string) $sv->fetchColumn());
            try {
                $k = msgUnyContrato($pdo, (string) $atual['contrato'], $cpf);
            } catch (RuntimeException $e) {
                msgErro($e->getMessage(), 502);
            }
            if (!$k) {
                msgOk(['vinculos' => $vinculos, 'atual' => $atual, 'nao_encontrado' => true]);
            }
            $aut = null;
            try {
                $aut = msgUnyAutorizacao($pdo, $k['beneficiario_id']);
            } catch (RuntimeException $e) {
                $aut = null;
            }
            $f = msgUnyFinanceiro($k['contas']);
            $ids = array_column($f['lote'], 'id');
            $mapa = fn($p) => $p + ['no_lote' => in_array($p['id'], $ids, true)];
            $sc = $pdo->prepare('SELECT c.*, u.nome AS por FROM chat_cobrancas c LEFT JOIN usuarios u ON u.id = c.criado_por WHERE c.conversa_id = :c ORDER BY c.id DESC LIMIT 5');
            $sc->execute([':c' => $c['id']]);
            msgOk([
                'vinculos' => $vinculos,
                'atual' => $atual,
                'contrato' => ['plano' => $k['plano'], 'titular' => $k['titular'], 'data_contrato' => $k['data_contrato'], 'cidade' => $k['cidade']],
                'copia' => msgUnyContratoCopia($pdo, (string) $atual['contrato']), // situação, plano, etiquetas e aditivo (cópia diária)
                'autorizacao' => $aut,
                'beneficiarios' => $k['beneficiarios'],
                'financeiro' => [
                    'em_atraso' => (bool) $f['vencidas'], 'total_vencido' => $f['total_vencido'],
                    'abertas' => array_map($mapa, array_slice($f['abertas'], 0, 14)),
                    'vencidas_ids' => array_column($f['vencidas'], 'id'),
                    'total_lote' => $f['total_lote'], 'quantidade_lote' => count($f['lote']),
                    'pagas' => $f['pagas'],
                    'proxima' => $f['abertas'][0] ?? null,
                    'ultima_paga' => $f['pagas'][0] ?? null,
                    'pago_ano' => round(array_sum(array_map(fn($p) => str_starts_with($p['vencimento'], date('Y')) ? $p['valor'] : 0, $f['pagas'])), 2),
                    'pagas_ano' => count(array_filter($f['pagas'], fn($p) => str_starts_with($p['vencimento'], date('Y')))),
                ],
                'notas' => array_slice($k['notas'], 0, 3),
                'cobrancas' => array_map(fn($x) => [
                    'tipo' => $x['tipo'], 'valor' => (float) $x['valor'], 'situacao' => $x['situacao'], 'por' => $x['por'],
                    'criado_em' => msgDataIso($x['criado_em']), 'pago_em' => $x['pago_em'] ? msgDataIso($x['pago_em']) : null,
                ], $sc->fetchAll()),
            ]);

        case 'contratos_buscar':
            // número do contrato, CPF ou nome do titular (direto na Unymos, sem catálogo)
            exigirMetodo('GET');
            @set_time_limit(60);
            $q = trim((string) ($_GET['q'] ?? ''));
            $dig = preg_replace('/\D/', '', $q);
            if (mb_strlen($q) < 3 && $dig === '') {
                msgOk([]);
            }
            $filtro = strlen($dig) === 11 && preg_match('/^[\d.\-\s]+$/', $q) ? ['CPF' => msgUnyCpfFormatado($dig)]
                : (preg_match('/^\d{1,10}$/', $q) ? ['NumeroContrato' => $q] : ['Nome' => $q]);
            try {
                $achados = msgUnyBuscar($pdo, $filtro);
            } catch (RuntimeException $e) {
                msgErro($e->getMessage(), 502);
            }
            msgOk(array_map(fn($a) => [
                'contrato' => $a['contrato'], 'titular' => $a['titular'], 'plano' => $a['plano'], 'cidade' => $a['cidade'],
                'cpf' => strlen($a['cpf']) === 11 ? '***.' . substr($a['cpf'], 3, 3) . '.' . substr($a['cpf'], 6, 3) . '-**' : '',
            ], array_slice($achados, 0, 15)));

        case 'contato_vincular':
            exigirMetodo('POST');
            $c = conversaVisivel($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            if ($c['tipo'] !== 'externo') {
                msgErro('Só conversas de clientes têm contrato.');
            }
            $contrato = trim((string) ($corpo['contrato'] ?? ''));
            $relacao = in_array((string) ($corpo['relacao'] ?? ''), ['titular', 'dependente', 'filho', 'conjuge', 'familiar', 'responsavel', 'outro'], true) ? (string) $corpo['relacao'] : 'outro';
            if ($contrato === '') {
                msgErro('Escolha o contrato.');
            }
            try {
                $k = msgUnyContrato($pdo, $contrato);
            } catch (RuntimeException $e) {
                msgErro($e->getMessage(), 502);
            }
            if (!$k) {
                msgErro('Contrato não encontrado na Unymos.', 404);
            }
            msgUnyGravarVinculo($pdo, (int) $c['contato_externo_id'], $k, $relacao, !empty($corpo['pode_pagar']), $uid);
            msgSistema($pdo, (int) $c['id'], $usuario['nome'] . ' vinculou este contato ao contrato ' . $k['contrato']);
            msgOk(msgVinculosContato($pdo, (int) $c['contato_externo_id']), 'Contato vinculado ao contrato.');

        case 'contato_desvincular':
            exigirMetodo('POST');
            $c = conversaVisivel($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            $pdo->prepare('DELETE FROM chat_contato_contratos WHERE contato_id = :c AND contrato = :n')
                ->execute([':c' => $c['contato_externo_id'], ':n' => (string) ($corpo['contrato'] ?? '')]);
            msgOk(msgVinculosContato($pdo, (int) $c['contato_externo_id']), 'Vínculo removido.');

        case 'contratos_copia':
            // situação da cópia diária dos contratos da Unymos (Configurações › Geral)
            exigirMetodo('GET');
            $e = json_decode((string) msgConfigTela($pdo, 'uny_copia_estado', ''), true) ?: [];
            msgOk(['concluida_em' => $e['concluida_em'] ?? null, 'total' => $e['total'] ?? null, 'em_andamento' => !empty($e['em_andamento']), 'pode' => msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG)]);

        case 'contratos_copia_atualizar':
            // a tela chama em sequência até terminar (10 páginas de 100 contratos por vez)
            exigirMetodo('POST');
            if (!msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG)) {
                msgErro('Só quem tem a página "Messenger · Configurações" atualiza a cópia dos contratos.', 403);
            }
            @set_time_limit(180);
            if (!empty($corpo['recomecar'])) {
                $pdo->prepare("DELETE FROM chat_config WHERE chave = 'uny_copia_estado'")->execute();
            }
            try {
                $r = msgUnySincronizarContratos($pdo, 10);
            } catch (RuntimeException $e) {
                msgErro($e->getMessage(), 502);
            }
            msgOk($r, $r['fim'] ? 'Cópia dos contratos atualizada.' : 'Atualizando…');

        // ===== Orçamento preparado pela Aurora (19/10/2026): o atendente confere e envia =====
        case 'orc_ia':
            exigirMetodo('GET');
            $c = conversaVisivel($pdo, $usuario, (int) ($_GET['conversa_id'] ?? 0));
            try {
                $st = $pdo->prepare("SELECT * FROM chat_orcamentos_ia WHERE conversa_id = :c AND status IN ('aguardando','aprovado') ORDER BY id DESC LIMIT 1");
                $st->execute([':c' => $c['id']]);
                $o = $st->fetch();
            } catch (PDOException $e) {
                $o = null;
            }
            if (!$o) {
                msgOk(null);
            }
            require_once __DIR__ . '/messenger_funeral.php';
            $calc = json_decode((string) $o['resultado_json'], true) ?: [];
            msgOk([
                'id' => (int) $o['id'], 'status' => $o['status'], 'falecido' => $o['falecido'], 'criado_em' => msgDataIso($o['criado_em']),
                'escolhas' => json_decode((string) $o['escolhas_json'], true), 'linhas' => $calc['linhas'] ?? [], 'familia' => (float) ($calc['familia'] ?? 0),
                'coberto' => (float) ($calc['coberto'] ?? 0), 'pendentes' => (int) ($calc['pendentes'] ?? 0), 'convenio' => (string) ($calc['convenio'] ?? ''),
                'avisos' => $calc['avisos'] ?? [], 'texto' => msgFunTextoFamilia($calc, (string) ($o['falecido'] ?? '')),
            ]);

        case 'orc_ia_decidir':
            exigirMetodo('POST');
            $c = conversaVisivel($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            $aprovar = ($corpo['decisao'] ?? '') === 'aprovar';
            $st = $pdo->prepare("UPDATE chat_orcamentos_ia SET status = :s, aprovado_por = :u, atualizado_em = NOW() WHERE id = :id AND conversa_id = :c AND status = 'aguardando'");
            $st->execute([':s' => $aprovar ? 'aprovado' : 'descartado', ':u' => $uid, ':id' => (int) ($corpo['id'] ?? 0), ':c' => $c['id']]);
            if (!$st->rowCount()) {
                msgErro('Este orçamento já foi decidido.', 409);
            }
            msgSistema($pdo, (int) $c['id'], 'Orçamento da Aurora ' . ($aprovar ? 'conferido por ' : 'descartado por ') . $usuario['nome']);
            msgOk(null, $aprovar ? 'Orçamento no campo de mensagem. Revise e envie à família.' : 'Orçamento descartado.');

        // ===== Propostas de adesão (19/10/2026): ficha preenchida pelo cliente → Administrativo lança na Unymos =====
        case 'propostas':
            exigirMetodo('GET');
            if (!msgTemPagina($pdo, $uid, 'associados') && !msgEhGestao($pdo, $uid)) {
                msgErro('As propostas de adesão são de quem cadastra associados.', 403);
            }
            msgVendaGarantirTabela($pdo);
            $filtro = (string) ($_GET['status'] ?? '');
            $sql = 'SELECT id, conversa_id, nome, telefone, plano, status, contrato, origem, criado_em, ficha_em, decidido_em, expira_em, resumo_json FROM chat_propostas';
            $par = [];
            if (in_array($filtro, ['aguardando_ficha', 'ficha_preenchida', 'cadastrada', 'desistiu'], true)) {
                $sql .= ' WHERE status = :s';
                $par[':s'] = $filtro;
            }
            $st = $pdo->prepare($sql . ' ORDER BY FIELD(status, "ficha_preenchida", "aguardando_ficha", "cadastrada", "desistiu"), id DESC LIMIT 300');
            $st->execute($par);
            msgOk(array_map(function ($r) {
                $res = json_decode((string) $r['resumo_json'], true) ?: [];
                return [
                    'id' => (int) $r['id'], 'conversa_id' => $r['conversa_id'] !== null ? (int) $r['conversa_id'] : null, 'nome' => $r['nome'], 'telefone' => $r['telefone'],
                    'plano' => $r['plano'], 'status' => $r['status'], 'contrato' => $r['contrato'], 'origem' => $r['origem'],
                    'mensalidade' => (float) ($res['calculo']['mensalidade'] ?? 0), 'adesao' => (float) ($res['calculo']['adesao'] ?? 0),
                    'criado_em' => msgDataIso($r['criado_em']), 'ficha_em' => $r['ficha_em'] ? msgDataIso($r['ficha_em']) : null,
                    'vencida' => $r['status'] === 'aguardando_ficha' && strtotime((string) $r['expira_em']) < time(),
                ];
            }, $st->fetchAll()));

        case 'proposta':
            exigirMetodo('GET');
            if (!msgTemPagina($pdo, $uid, 'associados') && !msgEhGestao($pdo, $uid)) {
                msgErro('As propostas de adesão são de quem cadastra associados.', 403);
            }
            msgVendaGarantirTabela($pdo);
            $st = $pdo->prepare('SELECT p.*, u.nome AS decidido_nome FROM chat_propostas p LEFT JOIN usuarios u ON u.id = p.decidido_por WHERE p.id = :id');
            $st->execute([':id' => (int) ($_GET['id'] ?? 0)]);
            $r = $st->fetch();
            if (!$r) {
                msgErro('Proposta não encontrada.', 404);
            }
            msgOk([
                'id' => (int) $r['id'], 'conversa_id' => $r['conversa_id'] !== null ? (int) $r['conversa_id'] : null, 'nome' => $r['nome'], 'telefone' => $r['telefone'],
                'plano' => $r['plano'], 'status' => $r['status'], 'contrato' => $r['contrato'], 'origem' => $r['origem'],
                'resumo' => json_decode((string) $r['resumo_json'], true), 'ficha' => $r['ficha_json'] ? json_decode((string) $r['ficha_json'], true) : null,
                'criado_em' => msgDataIso($r['criado_em']), 'ficha_em' => $r['ficha_em'] ? msgDataIso($r['ficha_em']) : null,
                'decidido_em' => $r['decidido_em'] ? msgDataIso($r['decidido_em']) : null, 'decidido_por' => $r['decidido_nome'],
            ]);

        case 'proposta_decidir':
            // cadastrada (com o número do contrato da Unymos) ou desistiu; ao cadastrar, CPF/RG ficam mascarados
            exigirMetodo('POST');
            if (!msgTemPagina($pdo, $uid, 'associados') && !msgEhGestao($pdo, $uid)) {
                msgErro('Só quem cadastra associados conclui a proposta.', 403);
            }
            $id = (int) ($corpo['id'] ?? 0);
            $dec = (string) ($corpo['decisao'] ?? '');
            $st = $pdo->prepare('SELECT * FROM chat_propostas WHERE id = :id');
            $st->execute([':id' => $id]);
            $r = $st->fetch();
            if (!$r || !in_array($dec, ['cadastrada', 'desistiu'], true) || in_array($r['status'], ['cadastrada', 'desistiu'], true)) {
                msgErro('Proposta não encontrada ou já concluída.');
            }
            $contrato = mb_substr(trim((string) ($corpo['contrato'] ?? '')), 0, 40);
            if ($dec === 'cadastrada' && $contrato === '') {
                msgErro('Informe o número do contrato criado na Unymos.');
            }
            $ficha = $r['ficha_json'] ? json_decode((string) $r['ficha_json'], true) : null;
            $pdo->prepare('UPDATE chat_propostas SET status = :s, contrato = :c, ficha_json = :f, decidido_em = NOW(), decidido_por = :u WHERE id = :id')->execute([
                ':s' => $dec, ':c' => $contrato ?: null, ':u' => $uid, ':id' => $id,
                ':f' => $ficha ? json_encode($dec === 'cadastrada' ? msgVendaMascarar($ficha) : $ficha, JSON_UNESCAPED_UNICODE) : null,
            ]);
            if ($r['conversa_id']) {
                msgSistema($pdo, (int) $r['conversa_id'], $dec === 'cadastrada' ? $usuario['nome'] . ' cadastrou a adesão na Unymos — contrato ' . $contrato : $usuario['nome'] . ' marcou a proposta de adesão como desistência');
                if ($dec === 'cadastrada' && $r['contato_id']) {
                    // o vínculo pelo telefone passa a achar o contrato na próxima consulta
                    $pdo->prepare('UPDATE chat_contatos_externos SET uny_busca_em = NULL WHERE id = :id')->execute([':id' => $r['contato_id']]);
                }
            }
            msgOk(null, $dec === 'cadastrada' ? 'Adesão marcada como cadastrada.' : 'Proposta marcada como desistência.');

        // ===== O que os clientes perguntam à Aurora (19/10/2026) — aprendizado para a Base =====
        case 'ia_perguntas':
            exigirMetodo('GET');
            if (!msgEhGestao($pdo, $uid)) {
                msgErro('Só a Gestão vê as perguntas dos clientes.', 403);
            }
            $de = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['de'] ?? '')) ? $_GET['de'] : date('Y-m-d', strtotime('-29 days'));
            $ate = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET['ate'] ?? '')) ? $_GET['ate'] : date('Y-m-d');
            $par = [':de' => $de . ' 00:00:00', ':ate' => $ate . ' 23:59:59'];
            try {
                $q = fn($sql) => (function () use ($pdo, $sql, $par) { $st = $pdo->prepare($sql); $st->execute($par); return $st->fetchAll(); })();
                $total = $q('SELECT COUNT(*) AS n, SUM(respondida_base) AS base, SUM(transferida) AS transf FROM chat_ia_perguntas WHERE criado_em BETWEEN :de AND :ate')[0] ?? [];
                $porIntencao = $q('SELECT intencao, COUNT(*) AS total FROM chat_ia_perguntas WHERE criado_em BETWEEN :de AND :ate GROUP BY intencao ORDER BY total DESC LIMIT 12');
                $assuntos = $q('SELECT assunto, COUNT(*) AS total, SUM(respondida_base) AS base, SUM(transferida) AS transf, MAX(pergunta) AS exemplo, MAX(criado_em) AS ultima
                                 FROM chat_ia_perguntas WHERE criado_em BETWEEN :de AND :ate GROUP BY assunto ORDER BY total DESC LIMIT 25');
                $semBase = $q("SELECT assunto, COUNT(*) AS total, MAX(pergunta) AS exemplo FROM chat_ia_perguntas
                                WHERE criado_em BETWEEN :de AND :ate AND respondida_base = 0 AND intencao IN ('duvida', 'outro', 'plano_novo', 'associado', 'informacao_velorio')
                                GROUP BY assunto ORDER BY total DESC LIMIT 15");
            } catch (PDOException $e) {
                msgOk(['total' => 0, 'respondidas_base' => 0, 'transferidas' => 0, 'por_intencao' => [], 'assuntos' => [], 'sem_base' => []]);
            }
            msgOk([
                'total' => (int) ($total['n'] ?? 0), 'respondidas_base' => (int) ($total['base'] ?? 0), 'transferidas' => (int) ($total['transf'] ?? 0),
                'por_intencao' => array_map(fn($r) => ['intencao' => $r['intencao'], 'total' => (int) $r['total']], $porIntencao),
                'assuntos' => array_map(fn($r) => ['assunto' => $r['assunto'], 'total' => (int) $r['total'], 'base' => (int) $r['base'], 'transferidas' => (int) $r['transf'], 'exemplo' => $r['exemplo'], 'ultima' => msgDataIso($r['ultima'])], $assuntos),
                'sem_base' => array_map(fn($r) => ['assunto' => $r['assunto'], 'total' => (int) $r['total'], 'exemplo' => $r['exemplo']], $semBase),
            ]);

        // ===== Testes da Aurora (21/10/2026): simulador e cenários avaliados pelo Claude =====
        case 'ia_sim_enviar':
        case 'ia_sim_reiniciar':
        case 'ia_cenarios':
        case 'ia_cenario_passo':
        case 'ia_cenario_avaliar':
            if (!msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG)) {
                msgErro('Os testes da Aurora são de quem tem a página "Messenger · Configurações".', 403);
            }
            @set_time_limit(120);
            msgTesteLimpezaAntiga($pdo);
            if ($acao === 'ia_cenarios') {
                exigirMetodo('GET');
                $lista = [];
                foreach (msgTesteCenarios($pdo) as $id => $cen) {
                    $lista[] = ['id' => $id, 'titulo' => $cen['titulo'], 'regras' => $cen['regras'], 'max' => (int) $cen['max']];
                }
                $res = [];
                try {
                    $st = $pdo->query('SELECT t.*, u.nome AS por FROM chat_ia_testes t LEFT JOIN usuarios u ON u.id = t.criado_por ORDER BY t.id DESC LIMIT 60');
                    foreach ($st->fetchAll() as $r) {
                        $res[] = ['id' => (int) $r['id'], 'rodada' => $r['rodada'], 'cenario' => $r['cenario'], 'titulo' => $r['titulo'], 'nota' => $r['nota'] !== null ? (int) $r['nota'] : null,
                            'aprovado' => $r['aprovado'] !== null ? (bool) $r['aprovado'] : null, 'avaliacao' => json_decode((string) $r['avaliacao_json'], true),
                            'conversa' => json_decode((string) $r['conversa_json'], true), 'criado_em' => msgDataIso($r['criado_em']), 'por' => $r['por']];
                    }
                } catch (PDOException $e) {
                    // tabela ainda não criada
                }
                msgOk(['cenarios' => $lista, 'resultados' => $res, 'claude' => trim((string) msgConfig('anthropic_api_key', '')) !== '', 'aurora' => trim((string) msgConfig('openai_api_key', '')) !== '']);
            }
            exigirMetodo('POST');
            if ($acao === 'ia_sim_reiniciar') {
                $s = msgTesteSessao($pdo, $uid, (string) ($corpo['sessao'] ?? 'manual'));
                msgTesteApagar($pdo, $s['contato_id']);
                msgOk(null, 'Conversa de teste apagada.');
            }
            if ($acao === 'ia_sim_enviar') {
                $texto = trim((string) ($corpo['texto'] ?? ''));
                if ($texto === '') {
                    msgErro('Escreva a mensagem do cliente.');
                }
                $s = msgTesteSessao($pdo, $uid, (string) ($corpo['sessao'] ?? 'manual'), 'Cliente de teste');
                $novas = msgTesteEnviar($pdo, $s, $texto, ['contrato' => trim((string) ($corpo['contrato'] ?? '')), 'anuncio' => trim((string) ($corpo['anuncio'] ?? ''))]);
                msgOk(['conversa_id' => $s['conversa_id'], 'mensagens' => $novas, 'conversa' => msgTesteTranscricao($pdo, $s['conversa_id'])]);
            }
            $cenario = (string) ($corpo['cenario'] ?? '');
            $sessao = 'cen' . preg_replace('/[^a-z0-9]/', '', strtolower((string) ($corpo['rodada'] ?? ''))) . substr(md5($cenario), 0, 6);
            try {
                if ($acao === 'ia_cenario_passo') {
                    msgOk(msgTestePasso($pdo, $uid, $cenario, $sessao));
                }
                msgOk(msgTesteAvaliar($pdo, $uid, $cenario, $sessao, mb_substr((string) ($corpo['rodada'] ?? date('YmdHi')), 0, 20)));
            } catch (RuntimeException $e) {
                msgErro($e->getMessage(), 502);
            }

        // ===== Aprendizado da Aurora (22/10/2026): 👍/👎 dos atendentes e a tela de aprovação =====
        case 'ia_feedback':
            exigirMetodo('POST');
            $mid = (int) ($corpo['mensagem_id'] ?? 0);
            $sm = $pdo->prepare('SELECT conversa_id FROM chat_mensagens WHERE id = :id');
            $sm->execute([':id' => $mid]);
            conversaVisivel($pdo, $usuario, (int) $sm->fetchColumn());
            if (!msgAprPronto($pdo)) {
                msgErro('O aprendizado da Aurora ainda não foi instalado (tabelas).', 409);
            }
            try {
                msgAprFeedback($pdo, $uid, $mid, !empty($corpo['util']), (string) ($corpo['motivo'] ?? ''));
            } catch (RuntimeException $e) {
                msgErro($e->getMessage());
            }
            msgOk(null, 'Obrigado! Isso entra na próxima análise da Aurora.');

        case 'apr_listar':
        case 'apr_decidir':
        case 'apr_analisar':
            if (!msgTemPagina($pdo, $uid, MSG_PAGINA_CONFIG)) {
                msgErro('O aprendizado da Aurora é de quem tem a página "Messenger · Configurações".', 403);
            }
            if (!msgAprPronto($pdo)) {
                msgOk(['instalado' => false]);
            }
            if ($acao === 'apr_listar') {
                exigirMetodo('GET');
                $q = fn($sql) => $pdo->query($sql)->fetchAll();
                $cen = [];
                try {
                    $cen = $q("SELECT id, titulo, persona, regras, max_turnos, status, criado_em FROM chat_ia_cenarios WHERE status <> 'inativo' ORDER BY status = 'proposto' DESC, id DESC LIMIT 60");
                } catch (PDOException $e) {
                }
                $fb = [];
                try {
                    $fb = $q("SELECT f.id, f.util, f.motivo, f.criado_em, f.analisado, m.texto, u.nome AS por FROM chat_ia_feedback f INNER JOIN chat_mensagens m ON m.id = f.mensagem_id LEFT JOIN usuarios u ON u.id = f.usuario_id ORDER BY f.id DESC LIMIT 40");
                } catch (PDOException $e) {
                }
                msgOk([
                    'instalado' => true, 'claude' => trim((string) msgConfig('anthropic_api_key', '')) !== '',
                    'ultima_analise' => ($ua = msgConfigTela($pdo, 'apr_ultima_analise', '')) ? msgDataIso($ua) : null,
                    'licoes' => $q("SELECT l.id, l.tipo, l.habilidade, l.titulo, l.texto, l.descricao, l.motivo, l.status, l.criado_em, l.decidido_em, u.nome AS por FROM chat_ia_licoes l LEFT JOIN usuarios u ON u.id = l.decidido_por WHERE l.status <> 'rejeitada' OR l.criado_em > NOW() - INTERVAL 30 DAY ORDER BY l.status = 'proposta' DESC, l.id DESC LIMIT 200"),
                    'exemplos' => $q("SELECT id, intencao, titulo, resumo, dialogo, motivo, status, criado_em FROM chat_ia_exemplos WHERE status <> 'rejeitado' ORDER BY status = 'proposto' DESC, id DESC LIMIT 60"),
                    'cenarios' => $cen, 'feedback' => $fb,
                ]);
            }
            exigirMetodo('POST');
            if ($acao === 'apr_analisar') {
                @set_time_limit(180);
                try {
                    $r = msgAprAnalisar($pdo);
                } catch (RuntimeException $e) {
                    msgErro($e->getMessage(), 502);
                }
                msgOk($r, $r['msg']);
            }
            // apr_decidir: aprovar, rejeitar, desativar, publicar (documento), editar o texto
            $tipo = (string) ($corpo['tipo'] ?? '');
            $id = (int) ($corpo['id'] ?? 0);
            $dec = (string) ($corpo['decisao'] ?? '');
            $tabelas = ['licao' => ['chat_ia_licoes', ['aprovada', 'rejeitada', 'desativada', 'publicada', 'proposta']], 'exemplo' => ['chat_ia_exemplos', ['aprovado', 'rejeitado', 'proposto']], 'cenario' => ['chat_ia_cenarios', ['ativo', 'inativo', 'proposto']]];
            if (!isset($tabelas[$tipo]) || !in_array($dec, $tabelas[$tipo][1], true)) {
                msgErro('Decisão inválida.');
            }
            [$tab] = $tabelas[$tipo];
            $sets = 'status = :s, decidido_em = NOW(), decidido_por = :u';
            $par = [':s' => $dec, ':u' => $uid, ':id' => $id];
            if (isset($corpo['texto']) && trim((string) $corpo['texto']) !== '') {
                $campo = $tipo === 'exemplo' ? 'dialogo' : ($tipo === 'cenario' ? 'regras' : 'texto');
                $sets .= ", {$campo} = :t";
                $par[':t'] = mb_substr(trim((string) $corpo['texto']), 0, 8000);
            }
            if ($tipo === 'licao' && isset($corpo['habilidade']) && in_array($corpo['habilidade'], APR_HABILIDADES, true)) {
                $sets .= ', habilidade = :h';
                $par[':h'] = $corpo['habilidade'];
            }
            $st = $pdo->prepare("UPDATE {$tab} SET {$sets} WHERE id = :id");
            $st->execute($par);
            if (!$st->rowCount()) {
                msgErro('Item não encontrado.', 404);
            }
            msgOk(null, 'Pronto.');

        case 'cliente_cobrar':
            // link Pix/cartão, Pix (QR), boleto ou recibo — o atendente revisa e envia pela conversa
            exigirMetodo('POST');
            @set_time_limit(90);
            $c = conversaVisivel($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            $tipo = (string) ($corpo['tipo'] ?? '');
            if (!in_array($tipo, ['link', 'pix', 'boleto', 'recibo'], true)) {
                msgErro('Tipo de cobrança inválido.');
            }
            $sv = $pdo->prepare('SELECT * FROM chat_contato_contratos WHERE contato_id = :c AND contrato = :n');
            $sv->execute([':c' => $c['contato_externo_id'], ':n' => (string) ($corpo['contrato'] ?? '')]);
            $v = $sv->fetch();
            if (!$v) {
                msgErro('Vincule o contato ao contrato antes.');
            }
            if ($tipo !== 'recibo' && !(int) $v['pode_pagar']) {
                msgErro('Este contato não está autorizado a receber cobranças deste contrato.', 403);
            }
            try {
                $k = msgUnyContrato($pdo, (string) $v['contrato'], preg_replace('/\D/', '', (string) $v['titular_cpf']));
                if (!$k) {
                    msgErro('Contrato não encontrado na Unymos.', 404);
                }
                $f = msgUnyFinanceiro($k['contas']);
                $brl = fn($x) => 'R$ ' . number_format($x, 2, ',', '.');
                $registrar = function (float $valor, array $ids, ?int $lote = null) use ($pdo, $c, $v, $tipo, $uid) {
                    $pdo->prepare('INSERT INTO chat_cobrancas (conversa_id, contato_id, contrato, tipo, valor, contas, pix_lote_id, criado_por) VALUES (:c, :ct, :n, :t, :v, :ids, :l, :u)')
                        ->execute([':c' => $c['id'], ':ct' => $c['contato_externo_id'], ':n' => $v['contrato'], ':t' => $tipo, ':v' => $valor, ':ids' => implode(',', $ids), ':l' => $lote ?: null, ':u' => $uid]);
                };
                $nomes = ['link' => 'link de pagamento', 'pix' => 'Pix', 'boleto' => 'boleto', 'recibo' => 'recibo'];
                if ($tipo === 'link' || $tipo === 'pix') {
                    if (!$f['lote']) {
                        msgErro('Não há mensalidade em aberto para cobrar.');
                    }
                    // antecipação: até a parcela escolhida, sempre em ordem (nenhuma parcela fica pulada)
                    $cobrar = $f['lote'];
                    $ate = (int) ($corpo['ate_conta_id'] ?? 0);
                    if ($ate > 0) {
                        $pos = array_search($ate, array_column($f['abertas'], 'id'), true);
                        if ($pos === false) {
                            msgErro('Essa parcela não está mais em aberto. Atualize o painel.');
                        }
                        if ($pos + 1 > count($cobrar)) {
                            $cobrar = array_slice($f['abertas'], 0, $pos + 1);
                        }
                    }
                    $ids = array_column($cobrar, 'id');
                    $qtd = count($ids);
                    $antecipadas = $qtd - count($f['lote']);
                    $f['total_lote'] = round(array_sum(array_column($cobrar, 'valor')), 2);
                    $desc = $brl($f['total_lote']) . ' (' . $qtd . ' mensalidade' . ($qtd > 1 ? 's' : '') . ($antecipadas > 0 ? ', com ' . $antecipadas . ' antecipada' . ($antecipadas > 1 ? 's' : '') : '') . ')';
                    if ($tipo === 'link') {
                        $url = msgUnyLink($pdo, $ids, $f['total_lote']);
                        $registrar($f['total_lote'], $ids);
                        $saida = ['texto' => "Segue o link para pagamento por Pix ou cartão de {$desc}:\n{$url}"];
                    } else {
                        $pix = msgUnyPix($pdo, $ids, $f['total_lote']);
                        $registrar($f['total_lote'], $ids, $pix['lote_id']);
                        $saida = ['texto' => "Pix de {$desc}. Copie o código abaixo e cole no app do seu banco (Pix copia e cola):\n\n" . $pix['copia_cola'], 'qr_base64' => $pix['qr_base64']];
                    }
                    msgSistema($pdo, (int) $c['id'], $usuario['nome'] . ' gerou ' . $nomes[$tipo] . ' de ' . $desc);
                } else {
                    $contaId = (int) ($corpo['conta_id'] ?? 0);
                    $conta = null;
                    foreach ($k['contas'] as $cc) {
                        if ($cc['id'] === $contaId) {
                            $conta = $cc;
                        }
                    }
                    if ($tipo === 'boleto' && !$conta && $f['abertas']) {
                        $conta = $f['abertas'][0]; // sem escolha: a mais antiga em aberto
                    }
                    if (!$conta || ($tipo === 'boleto' && $conta['situacao'] !== 'P') || ($tipo === 'recibo' && $conta['situacao'] !== 'B')) {
                        msgErro($tipo === 'boleto' ? 'Escolha uma parcela em aberto.' : 'O recibo é só de parcela paga.');
                    }
                    $pdf = msgUnyPdf($pdo, $tipo, $conta['id']);
                    $registrar($conta['valor'], [$conta['id']]);
                    msgSistema($pdo, (int) $c['id'], $usuario['nome'] . ' gerou ' . $nomes[$tipo] . ' da parcela ' . ($conta['parcela'] ?: $conta['vencimento']) . ' (' . $brl($conta['valor']) . ')');
                    $saida = ['pdf_base64' => $pdf, 'nome' => ($tipo === 'boleto' ? 'boleto' : 'recibo') . '-' . preg_replace('/[^\w\-]/', '-', $conta['parcela'] ?: $conta['vencimento']) . '.pdf'];
                }
            } catch (RuntimeException $e) {
                msgErro($e->getMessage(), 502);
            }
            msgOk($saida, ucfirst($nomes[$tipo]) . ' gerado. Revise e envie ao cliente.');

        case 'fixar_mensagem':
            // fixa (ou solta) uma mensagem no topo da conversa, para todos que participam; até 3 por conversa
            exigirMetodo('POST');
            $mid = (int) ($corpo['mensagem_id'] ?? 0);
            $fixar = !empty($corpo['fixar']);
            $sm = $pdo->prepare('SELECT id, conversa_id FROM chat_mensagens WHERE id = :id AND apagada_em IS NULL');
            $sm->execute([':id' => $mid]);
            $alvo = $sm->fetch();
            if (!$alvo) {
                msgErro('Mensagem não encontrada.', 404);
            }
            $c = conversaVisivel($pdo, $usuario, (int) $alvo['conversa_id']);
            $cid = (int) $c['id'];
            if ($fixar) {
                $sq = $pdo->prepare('SELECT COUNT(*) FROM chat_mensagens_fixadas WHERE conversa_id = :c AND mensagem_id <> :m');
                $sq->execute([':c' => $cid, ':m' => $mid]);
                if ((int) $sq->fetchColumn() >= 3) {
                    msgErro('Esta conversa já tem 3 mensagens fixadas. Desafixe uma para fixar esta.', 409);
                }
                $pdo->prepare('INSERT INTO chat_mensagens_fixadas (conversa_id, mensagem_id, fixada_por) VALUES (:c, :m, :u) ON DUPLICATE KEY UPDATE fixada_por = :u2, fixada_em = NOW()')
                    ->execute([':c' => $cid, ':m' => $mid, ':u' => $uid, ':u2' => $uid]);
            } else {
                $pdo->prepare('DELETE FROM chat_mensagens_fixadas WHERE conversa_id = :c AND mensagem_id = :m')->execute([':c' => $cid, ':m' => $mid]);
            }
            $lista = mensagensFixadas($pdo, $cid);
            $dest = msgDestinatarios($pdo, $c);
            msgDepois(fn() => msgAblyAvisar($dest, 'fixadas', ['conversa_id' => $cid, 'fixadas' => $lista]));
            msgOk(['conversa_id' => $cid, 'fixadas' => $lista], $fixar ? 'Mensagem fixada.' : 'Mensagem desafixada.');

        case 'contato_salvar':
            // dá um nome ao cliente (o nome do perfil do WhatsApp continua guardado, mas não substitui este)
            exigirMetodo('POST');
            $c = conversaVisivel($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            if ($c['tipo'] !== 'externo') {
                msgErro('Só conversas de clientes têm contato para salvar.');
            }
            if ((int) ($c['responsavel_usuario_id'] ?? 0) !== $uid && !msgEhGestao($pdo, $uid) && $c['status_atendimento'] !== 'aguardando') {
                msgErro('Só o responsável pelo atendimento ou a Gestão salva o contato.', 403);
            }
            $nome = mb_substr(msgTexto((string) ($corpo['nome'] ?? '')), 0, 150);
            $pdo->prepare('UPDATE chat_contatos_externos SET nome_salvo = :n, atualizado_em = NOW() WHERE id = :id')
                ->execute([':n' => $nome !== '' ? $nome : null, ':id' => $c['contato_externo_id']]);
            $dest = msgDestinatarios($pdo, $c);
            $cid = (int) $c['id'];
            msgDepois(fn() => msgAblyAvisar($dest, 'conversa', ['conversa_id' => $cid]));
            msgOk(conversaFormatada($pdo, $cid, $uid), $nome !== '' ? 'Contato salvo.' : 'Nome do contato removido.');

        case 'contatos':
            // clientes já conhecidos (para encaminhar contato), por nome ou telefone
            exigirMetodo('GET');
            $q = trim((string) ($_GET['q'] ?? ''));
            $digitos = preg_replace('/\D/', '', $q) ?? '';
            $st = $pdo->prepare("SELECT id, COALESCE(nome_salvo, nome) AS nome, telefone_e164 FROM chat_contatos_externos
                                  WHERE :q = '' OR nome LIKE :l1 OR nome_salvo LIKE :l2 OR (:d <> '' AND telefone_e164 LIKE :l3)
                                  ORDER BY COALESCE(nome_salvo, nome) LIMIT 30");
            $st->execute([':q' => $q, ':l1' => "%{$q}%", ':l2' => "%{$q}%", ':d' => $digitos, ':l3' => "%{$digitos}%"]);
            msgOk(array_map(fn($r) => ['id' => (int) $r['id'], 'nome' => $r['nome'], 'telefone' => $r['telefone_e164']], $st->fetchAll()));

        // ===== Fixar e marcar como não lida (09/10/2026) =====
        case 'fixar':
            exigirMetodo('POST');
            [$c] = conversaParticipante($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            $fixar = !empty($corpo['fixar']);
            garantirTabelaPreferencias($pdo);
            if ($fixar) {
                $sq = $pdo->prepare('SELECT COUNT(*) FROM chat_preferencias f
                                       INNER JOIN chat_participantes p ON p.conversa_id = f.conversa_id AND p.usuario_id = f.usuario_id AND p.saiu_em IS NULL
                                      WHERE f.usuario_id = :u AND f.fixada_em IS NOT NULL AND f.conversa_id <> :c');
                $sq->execute([':u' => $uid, ':c' => $c['id']]);
                $maxFixadas = max(1, (int) msgConfigTela($pdo, 'max_fixadas', (string) MAX_FIXADAS));
                if ((int) $sq->fetchColumn() >= $maxFixadas) {
                    msgErro('Você pode fixar até ' . $maxFixadas . ' conversas. Desafixe uma para fixar esta.', 409);
                }
            }
            $pdo->prepare('INSERT INTO chat_preferencias (conversa_id, usuario_id, fixada_em) VALUES (:c, :u, ' . ($fixar ? 'NOW()' : 'NULL') . ')
                           ON DUPLICATE KEY UPDATE fixada_em = ' . ($fixar ? 'NOW()' : 'NULL'))
                ->execute([':c' => $c['id'], ':u' => $uid]);
            msgOk(['conversa_id' => (int) $c['id'], 'fixada' => $fixar]);

        case 'marcar_nao_lida':
            exigirMetodo('POST');
            [$c] = conversaParticipante($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            $marcar = !empty($corpo['nao_lida']);
            garantirTabelaPreferencias($pdo);
            $pdo->prepare('INSERT INTO chat_preferencias (conversa_id, usuario_id, marcada_nao_lida) VALUES (:c, :u, :m)
                           ON DUPLICATE KEY UPDATE marcada_nao_lida = :m2')
                ->execute([':c' => $c['id'], ':u' => $uid, ':m' => $marcar ? 1 : 0, ':m2' => $marcar ? 1 : 0]);
            msgOk(['conversa_id' => (int) $c['id'], 'marcada_nao_lida' => $marcar]);

        // ===== Presença ("online" / "visto por último") — 07/10/2026 =====
        case 'presenca':
            // o app avisa que este usuário está com o app aberto (a cada minuto, de qualquer tela)
            exigirMetodo('POST');
            // visivel = false quando a pessoa sai do app (tela bloqueada, outra aba): volta a receber notificação no aparelho
            registrarPresenca($pdo, $uid, !array_key_exists('visivel', $corpo) || !empty($corpo['visivel']));
            msgOk(['ok' => true]);

        case 'presencas':
            // quando cada colega foi visto pela última vez (últimos 7 dias) + a hora do servidor
            exigirMetodo('GET');
            registrarPresenca($pdo, $uid);
            $st = $pdo->query('SELECT usuario_id, visto_em FROM chat_presenca WHERE visto_em >= NOW() - INTERVAL 7 DAY');
            $lista = [];
            foreach ($st->fetchAll() as $r) {
                $lista[(string) (int) $r['usuario_id']] = msgDataIso($r['visto_em']);
            }
            msgOk(['agora' => msgDataIso((string) $pdo->query('SELECT NOW()')->fetchColumn()), 'online_segundos' => PRESENCA_ONLINE_S, 'vistos' => (object) $lista]);

        case 'nao_lidas_total':
            exigirMetodo('GET');
            $st = $pdo->prepare("SELECT COUNT(*) FROM chat_participantes p
                                   INNER JOIN chat_mensagens m ON m.conversa_id = p.conversa_id AND m.id > p.ultima_lida_id
                                  INNER JOIN chat_conversas c ON c.id = p.conversa_id
                                  WHERE p.usuario_id = :u AND p.saiu_em IS NULL AND p.silenciada = 0
                                    AND (c.tipo <> 'externo' OR m.atendimento_id = c.atendimento_atual_id)
                                    AND m.autor_tipo <> 'sistema' AND (m.autor_usuario_id IS NULL OR m.autor_usuario_id <> :u2)");
            $st->execute([':u' => $uid, ':u2' => $uid]);
            $total = (int) $st->fetchColumn();
            // conversas marcadas como "não lida" (sem mensagem nova) contam 1 cada
            try {
                $sm = $pdo->prepare('SELECT COUNT(*) FROM chat_preferencias f
                                       INNER JOIN chat_participantes p ON p.conversa_id = f.conversa_id AND p.usuario_id = f.usuario_id
                                       INNER JOIN chat_conversas c ON c.id = f.conversa_id
                                      WHERE f.usuario_id = :u AND f.marcada_nao_lida = 1 AND p.saiu_em IS NULL AND p.silenciada = 0
                                        AND (c.ultima_mensagem_id IS NULL OR c.ultima_mensagem_id <= p.ultima_lida_id)');
                $sm->execute([':u' => $uid]);
                $total += (int) $sm->fetchColumn();
            } catch (PDOException $e) {
                if ($e->getCode() !== '42S02') {
                    throw $e;
                }
            }
            // botão Grupos: quantos grupos têm mensagem não lida
            $sg = $pdo->prepare("SELECT COUNT(DISTINCT p.conversa_id) FROM chat_participantes p
                                   INNER JOIN chat_conversas c ON c.id = p.conversa_id AND c.tipo = 'grupo'
                                   INNER JOIN chat_mensagens m ON m.conversa_id = p.conversa_id AND m.id > p.ultima_lida_id
                                  WHERE p.usuario_id = :u AND p.saiu_em IS NULL
                                    AND m.autor_tipo <> 'sistema' AND (m.autor_usuario_id IS NULL OR m.autor_usuario_id <> :u2)");
            $sg->execute([':u' => $uid, ':u2' => $uid]);
            $gruposComNovas = (int) $sg->fetchColumn();
            $fila = 0;
            if (msgEhAtendente($pdo, $uid)) {
                $fila = (int) $pdo->query("SELECT COUNT(*) FROM chat_conversas WHERE tipo = 'externo' AND status_atendimento = 'aguardando'")->fetchColumn();
            }
            msgOk(['total' => $total, 'fila' => $fila, 'grupos_com_novas' => $gruposComNovas]);

        case 'mensagens':
            exigirMetodo('GET');
            $c = conversaVisivel($pdo, $usuario, entradaInt('conversa_id'));
            $limite = max(1, min(100, entradaInt('limite', 50)));
            $antes = entradaInt('antes_id');
            $onde = 'm.conversa_id = :c' . ($antes > 0 ? ' AND m.id < :a' : '');
            $params = [':c' => $c['id']] + ($antes > 0 ? [':a' => $antes] : []);
            if ($c['tipo'] === 'externo') {
                // só o atendimento em andamento; os encerrados ficam no histórico (Gestão)
                $onde .= ' AND m.atendimento_id = :atd';
                $params[':atd'] = (int) ($c['atendimento_atual_id'] ?? 0);
            }
            $lista = array_reverse(msgBuscarMensagens($pdo, $onde, $params, $limite + 1, 'DESC'));
            $temMais = count($lista) > $limite;
            if ($temMais) {
                array_shift($lista);
            }
            msgOk([
                'conversa' => conversaFormatada($pdo, (int) $c['id'], $uid),
                'mensagens' => $lista,
                'tem_mais' => $temMais,
                'fixadas' => mensagensFixadas($pdo, (int) $c['id']),
            ]);

        case 'novidades':
            // Contingência e ressincronização: tudo o que chegou depois de desde_id (e apagadas depois de desde_em).
            exigirMetodo('GET');
            $servidorEm = date('Y-m-d H:i:s');
            if (entradaInt('desde_id') < 0) {
                // marcador inicial: só informa o último id visível, para o app começar dali
                $fila0 = msgEhAtendente($pdo, $uid) ? " OR (cv.tipo = 'externo' AND cv.status_atendimento = 'aguardando')" : '';
                $fila0 .= msgEhGestao($pdo, $uid) ? " OR (cv.tipo = 'externo' AND cv.status_atendimento IN ('aguardando', 'em_atendimento'))" : '';
                $sm = $pdo->prepare("SELECT COALESCE(MAX(m.id), 0) FROM chat_mensagens m WHERE EXISTS (SELECT 1 FROM chat_conversas cv WHERE cv.id = m.conversa_id
                                       AND (cv.tipo <> 'externo' OR m.atendimento_id = cv.atendimento_atual_id)
                                       AND (cv.id IN (SELECT p.conversa_id FROM chat_participantes p WHERE p.usuario_id = :u AND p.saiu_em IS NULL){$fila0}))");
                $sm->execute([':u' => $uid]);
                msgOk(['mensagens' => [], 'apagadas' => [], 'ultimo_id' => (int) $sm->fetchColumn(), 'tem_mais' => false, 'servidor_em' => msgDataIso($servidorEm)]);
            }
            $desde = max(0, entradaInt('desde_id'));
            $fila = msgEhAtendente($pdo, $uid) ? " OR (cv.tipo = 'externo' AND cv.status_atendimento = 'aguardando')" : '';
            // Gestão acompanha todos os atendimentos de clientes na fila ou em andamento
            $fila .= msgEhGestao($pdo, $uid) ? " OR (cv.tipo = 'externo' AND cv.status_atendimento IN ('aguardando', 'em_atendimento'))" : '';
            $visiveis = "EXISTS (SELECT 1 FROM chat_conversas cv WHERE cv.id = m.conversa_id
                                   AND (cv.tipo <> 'externo' OR m.atendimento_id = cv.atendimento_atual_id)
                                   AND (cv.id IN (SELECT p.conversa_id FROM chat_participantes p WHERE p.usuario_id = :u AND p.saiu_em IS NULL){$fila}))";
            $novas = msgBuscarMensagens($pdo, "m.id > :d AND {$visiveis}", [':d' => $desde, ':u' => $uid], 500);
            $apagadas = [];
            $desdeEm = (string) ($_GET['desde_em'] ?? '');
            if ($desdeEm !== '' && ($t = strtotime($desdeEm)) !== false) {
                $sa = $pdo->prepare("SELECT m.id, m.conversa_id FROM chat_mensagens m WHERE m.apagada_em >= :t AND m.id <= :d AND {$visiveis}");
                $sa->execute([':t' => date('Y-m-d H:i:s', $t), ':d' => $desde, ':u' => $uid]);
                $apagadas = array_map(fn($r) => ['mensagem_id' => (int) $r['id'], 'conversa_id' => (int) $r['conversa_id']], $sa->fetchAll());
            }
            $ultimo = $novas ? end($novas)['id'] : $desde;
            msgOk([
                'mensagens' => $novas,
                'apagadas' => $apagadas,
                'ultimo_id' => $ultimo,
                'tem_mais' => count($novas) >= 500,
                'servidor_em' => msgDataIso($servidorEm),
            ]);

        case 'usuarios':
            exigirMetodo('GET');
            $ids = array_values(array_diff(msgUsuariosComAcesso($pdo), [$uid]));
            $nomes = msgNomesUsuarios($pdo, $ids);
            $atendentes = array_flip(msgAtendentesAtivos($pdo));  // página messenger-clientes
            $lista = [];
            foreach ($nomes as $id => $nome) {
                $lista[] = ['id' => $id, 'nome' => $nome, 'atendente_whatsapp' => isset($atendentes[$id])];
            }
            usort($lista, fn($a, $b) => strcasecmp($a['nome'], $b['nome']));
            msgOk($lista);

        // ===== Mensagens =====

        case 'upload_url':
            exigirMetodo('POST');
            if (!msgR2Configurado()) {
                msgErro('Armazenamento de mídias não configurado (R2 no pai-chaves.php).', 503);
            }
            $mime = msgMimeBase((string) ($corpo['mime'] ?? ''));
            $tamanho = (int) ($corpo['tamanho_bytes'] ?? 0);
            $finalidade = (string) ($corpo['finalidade'] ?? 'arquivo');
            $aceitos = msgMimesAceitos();
            if (!isset($aceitos[$mime])) {
                msgErro('Tipo de arquivo não aceito.');
            }
            [$tipo, $ext] = $aceitos[$mime];
            if ($finalidade === 'miniatura' && !in_array($mime, ['image/jpeg', 'image/webp'], true)) {
                msgErro('A miniatura deve ser JPEG ou WebP.');
            }
            if ($tamanho <= 0 || $tamanho > msgLimiteTamanho($tipo)) {
                msgErro('Arquivo maior que o limite permitido (' . (int) (msgLimiteTamanho($tipo) / 1048576) . ' MB).');
            }
            $chave = msgR2NovaChave('u' . $uid, $ext);
            msgOk([
                'chave' => $chave,
                'tipo' => $tipo,
                'url_envio' => msgR2LinkAssinado('PUT', $chave, 300),
                'metodo' => 'PUT',
                'cabecalhos' => ['Content-Type' => $mime],
                'expira_em_s' => 300,
            ]);

        case 'anexo_url':
            exigirMetodo('GET');
            $st = $pdo->prepare('SELECT a.*, m.conversa_id, m.atendimento_id, m.apagada_em, c.tipo AS conversa_tipo, c.atendimento_atual_id
                                   FROM chat_anexos a INNER JOIN chat_mensagens m ON m.id = a.mensagem_id
                                   INNER JOIN chat_conversas c ON c.id = m.conversa_id WHERE a.id = :id');
            $st->execute([':id' => entradaInt('anexo_id')]);
            $a = $st->fetch();
            if (!$a || $a['apagada_em'] !== null) {
                msgErro('Arquivo não encontrado.', 404);
            }
            $gestaoHistorico = $a['conversa_tipo'] === 'externo' && msgEhGestao($pdo, $uid);
            $encerrado = $a['conversa_tipo'] === 'externo' && (int) $a['atendimento_id'] !== (int) $a['atendimento_atual_id'];
            if (!$gestaoHistorico) {
                if ($encerrado) {
                    // atendimento encerrado: só quem participou dele (histórico)
                    if (!msgParticipouAtendimento($pdo, (int) $a['atendimento_id'], $uid)) {
                        msgErro('Este arquivo é de um atendimento encerrado em que você não participou.', 403);
                    }
                } else {
                    conversaVisivel($pdo, $usuario, (int) $a['conversa_id']);
                }
            }
            if (!msgR2Configurado()) {
                msgErro('Armazenamento de mídias não configurado (R2 no pai-chaves.php).', 503);
            }
            $miniatura = ($_GET['variante'] ?? '') === 'miniatura' && !empty($a['miniatura_chave']);
            // baixar=1: o link já vem como download, com o nome do arquivo (salvar no computador/celular)
            $extras = [];
            if (!empty($_GET['baixar']) && !$miniatura) {
                $ext = msgMimesAceitos()[$a['mime']][1] ?? 'bin';
                $nome = trim((string) ($a['nome_original'] ?? '')) ?: ('arquivo-' . (int) $a['id'] . '.' . $ext);
                $ascii = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string) iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nome)) ?: 'arquivo.' . $ext;
                $extras['response-content-disposition'] = 'attachment; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($nome);
            }
            msgOk([
                'url' => msgR2LinkAssinado('GET', $miniatura ? $a['miniatura_chave'] : $a['chave_r2'], 3600, null, $extras),
                'mime' => $miniatura ? 'image/jpeg' : $a['mime'],
                'nome_original' => $a['nome_original'],
                'expira_em_s' => 3600,
            ]);

        case 'enviar':
            exigirMetodo('POST');
            // nota interna: quem vê a conversa escreve (inclusive a Gestão que só acompanha); o resto, só quem participa
            $c = !empty($corpo['interna'])
                ? conversaVisivel($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0))
                : conversaParticipante($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0))[0];
            $tipo = (string) ($corpo['tipo'] ?? 'texto');
            if (!in_array($tipo, ['texto', 'imagem', 'audio', 'documento', 'modelo', 'localizacao', 'contato'], true)) {
                msgErro('Tipo de mensagem inválido.');
            }
            // 14/10/2026: nota interna = só a equipe vê (nunca vai ao WhatsApp); localização e contato viram texto no sistema
            // e vão ao WhatsApp no formato nativo (mapa e cartão de contato)
            $interna = !empty($corpo['interna']);
            $extraWhats = null;
            if ($tipo === 'localizacao') {
                $lat = (float) ($corpo['latitude'] ?? 0);
                $lng = (float) ($corpo['longitude'] ?? 0);
                if ((abs($lat) < 0.0001 && abs($lng) < 0.0001) || abs($lat) > 90 || abs($lng) > 180) {
                    msgErro('Localização inválida.');
                }
                $nomeLocal = mb_substr(msgTexto((string) ($corpo['nome'] ?? '')), 0, 120);
                $extraWhats = ['type' => 'location', 'location' => ['latitude' => $lat, 'longitude' => $lng] + ($nomeLocal !== '' ? ['name' => $nomeLocal] : [])];
                $corpo['texto'] = '📍 ' . ($nomeLocal !== '' ? $nomeLocal : 'Localização') . "\nhttps://maps.google.com/?q=" . round($lat, 6) . ',' . round($lng, 6);
                $tipo = 'texto';
            } elseif ($tipo === 'contato') {
                $ct = is_array($corpo['contato'] ?? null) ? $corpo['contato'] : [];
                $nomeCt = mb_substr(msgTexto((string) ($ct['nome'] ?? '')), 0, 120);
                $telCt = preg_replace('/\D/', '', (string) ($ct['telefone'] ?? '')) ?? '';
                if ($nomeCt === '' || strlen($telCt) < 10) {
                    msgErro('Informe o nome e o telefone (com DDD) do contato.');
                }
                if (strlen($telCt) <= 11) {
                    $telCt = '55' . $telCt; // número do Brasil sem o código do país
                }
                $extraWhats = ['type' => 'contacts', 'contacts' => [[
                    'name' => ['formatted_name' => $nomeCt, 'first_name' => explode(' ', $nomeCt)[0]],
                    'phones' => [['phone' => '+' . $telCt, 'type' => 'CELL', 'wa_id' => $telCt]],
                ]]];
                $corpo['texto'] = '👤 ' . $nomeCt . "\n+" . $telCt;
                $tipo = 'texto';
            }
            $clienteUuid = strtolower(trim((string) ($corpo['cliente_uuid'] ?? '')));
            if ($clienteUuid !== '' && !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $clienteUuid)) {
                msgErro('cliente_uuid inválido.');
            }
            if ($clienteUuid !== '') {
                // reenvio após falha de rede: devolve a mesma mensagem, sem duplicar
                $sd = $pdo->prepare('SELECT id, autor_usuario_id FROM chat_mensagens WHERE cliente_uuid = :cu');
                $sd->execute([':cu' => $clienteUuid]);
                if ($dup = $sd->fetch()) {
                    if ((int) $dup['autor_usuario_id'] !== $uid) {
                        msgErro('cliente_uuid já usado.', 409);
                    }
                    msgOk(msgMensagemPorId($pdo, (int) $dup['id']));
                }
            }
            $externo = $c['tipo'] === 'externo' && !$interna; // nota interna em conversa de cliente não vai ao WhatsApp
            if ($interna && $tipo !== 'texto') {
                msgErro('A nota interna é só texto.');
            }
            if ($externo && ((int) ($c['responsavel_usuario_id'] ?? 0) !== $uid || $c['status_atendimento'] !== 'em_atendimento')) {
                msgErro('Só o responsável pelo atendimento responde ao cliente. Para falar, peça que a conversa seja transferida para você.', 403, ['so_responsavel' => 1]);
            }
            if ($tipo === 'modelo' && !$externo) {
                msgErro('Modelos só existem em conversas de clientes.');
            }
            if ($externo && $tipo !== 'modelo' && !janelaAberta($c)) {
                msgErro('Janela de 24 horas fechada: envie um modelo aprovado.', 409, ['janela_fechada' => 1]);
            }
            $texto = msgTextoMensagem((string) ($corpo['texto'] ?? ''));
            $anexos = [];
            $modelo = null;
            if ($tipo === 'texto' && $texto === '') {
                msgErro('Escreva a mensagem.');
            }
            if (in_array($tipo, ['imagem', 'audio', 'documento'], true)) {
                $anexos[] = validarAnexo(is_array($corpo['anexo'] ?? null) ? $corpo['anexo'] : [], $tipo, $uid);
                if ($externo && $tipo === 'audio' && $anexos[0]['mime'] === 'audio/webm') {
                    msgErro('Este aparelho gravou o áudio em um formato que o WhatsApp não aceita (WebM).', 422);
                }
            }
            if ($tipo === 'modelo') {
                $m = is_array($corpo['modelo'] ?? null) ? $corpo['modelo'] : [];
                $modelo = [
                    'nome' => preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($m['nome'] ?? ''))),
                    'idioma' => preg_replace('/[^A-Za-z_]/', '', (string) ($m['idioma'] ?? 'pt_BR')),
                    'parametros' => array_values(array_map(fn($p) => mb_substr(msgTexto((string) $p), 0, 500), is_array($m['parametros'] ?? null) ? $m['parametros'] : [])),
                ];
                if ($modelo['nome'] === '') {
                    msgErro('Escolha o modelo.');
                }
                if ($texto === '') {
                    $texto = 'Modelo: ' . $modelo['nome'];
                }
            }
            $respondeA = (int) ($corpo['responde_a_id'] ?? 0);
            if ($respondeA > 0) {
                $sr = $pdo->prepare('SELECT 1 FROM chat_mensagens WHERE id = :id AND conversa_id = :c');
                $sr->execute([':id' => $respondeA, ':c' => $c['id']]);
                if (!$sr->fetchColumn()) {
                    $respondeA = 0;
                }
            }
            $pdo->beginTransaction();
            $id = msgGravar($pdo, (int) $c['id'], [
                'atendimento_id' => $c['tipo'] === 'externo' ? (int) $c['atendimento_atual_id'] : null,
                'autor_tipo' => 'usuario',
                'autor_usuario_id' => $uid,
                'tipo' => $tipo,
                'texto' => $texto !== '' ? $texto : null,
                'responde_a_id' => $respondeA > 0 ? $respondeA : null,
                'cliente_uuid' => $clienteUuid !== '' ? $clienteUuid : null,
                'status_envio' => $externo ? 'pendente' : null,
                'anexos' => $anexos,
            ]);
            if ($interna) {
                $pdo->prepare('UPDATE chat_mensagens SET interna = 1 WHERE id = :id')->execute([':id' => $id]);
            }
            $pdo->commit();
            if ($externo) {
                enviarAoWhatsApp($pdo, $c, $id, $modelo, $extraWhats);
            }
            msgDifundir($pdo, (int) $c['id'], $id, $uid);
            msgOk(msgMensagemPorId($pdo, $id));

        case 'marcar_lida':
            exigirMetodo('POST');
            [$c, $eu] = conversaParticipante($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            // abriu a conversa: tira a marca "não lida" que a pessoa tinha posto
            try {
                $pdo->prepare('UPDATE chat_preferencias SET marcada_nao_lida = 0 WHERE conversa_id = :c AND usuario_id = :u AND marcada_nao_lida = 1')
                    ->execute([':c' => $c['id'], ':u' => $uid]);
            } catch (PDOException $e) {
                if ($e->getCode() !== '42S02') {
                    throw $e;
                }
            }
            $ate = min((int) ($corpo['ate_id'] ?? 0), (int) ($c['ultima_mensagem_id'] ?? 0));
            if ($ate > $eu['ultima_lida_id']) {
                $pdo->prepare('UPDATE chat_participantes SET ultima_lida_id = GREATEST(ultima_lida_id, :a) WHERE conversa_id = :c AND usuario_id = :u')
                    ->execute([':a' => $ate, ':c' => $c['id'], ':u' => $uid]);
                $outros = array_values(array_diff(array_keys(msgParticipantes($pdo, (int) $c['id'])), [$uid]));
                $dados = ['conversa_id' => (int) $c['id'], 'usuario_id' => $uid, 'ultima_lida_id' => $ate];
                msgDepois(fn() => msgAblyAvisar($outros, 'leitura', $dados));
                if ($c['tipo'] === 'externo' && msgMetaConfigurado()) {
                    // confirma leitura ao cliente no WhatsApp (tiques azuis)
                    $sw = $pdo->prepare("SELECT externo_id FROM chat_mensagens WHERE conversa_id = :c AND autor_tipo = 'contato'
                                            AND externo_id IS NOT NULL AND id <= :a AND id > :antes ORDER BY id DESC LIMIT 1");
                    $sw->execute([':c' => $c['id'], ':a' => $ate, ':antes' => $eu['ultima_lida_id']]);
                    if ($wamid = $sw->fetchColumn()) {
                        msgDepois(fn() => msgMeta('POST', msgConfig('meta_phone_number_id', '') . '/messages',
                            ['messaging_product' => 'whatsapp', 'status' => 'read', 'message_id' => $wamid], 8));
                    }
                }
            }
            msgOk(['ultima_lida_id' => max($ate, $eu['ultima_lida_id'])]);

        case 'digitando':
            exigirMetodo('POST');
            [$c] = conversaParticipante($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            $outros = array_values(array_diff(array_keys(msgParticipantes($pdo, (int) $c['id'])), [$uid]));
            $dados = ['conversa_id' => (int) $c['id'], 'usuario_id' => $uid, 'nome' => $usuario['nome']];
            msgDepois(fn() => msgAblyAvisar($outros, 'digitando', $dados));
            msgOk(null);

        case 'apagar_mensagem':
            exigirMetodo('POST');
            $st = $pdo->prepare('SELECT m.*, c.canal FROM chat_mensagens m INNER JOIN chat_conversas c ON c.id = m.conversa_id WHERE m.id = :id');
            $st->execute([':id' => (int) ($corpo['mensagem_id'] ?? 0)]);
            $m = $st->fetch();
            if (!$m || (int) $m['autor_usuario_id'] !== $uid || $m['autor_tipo'] !== 'usuario') {
                msgErro('Você só pode apagar as suas próprias mensagens.', 403);
            }
            if ($m['canal'] !== 'interno') {
                msgErro('Mensagens enviadas ao WhatsApp do cliente não podem ser apagadas.', 409);
            }
            if ($m['apagada_em'] !== null) {
                msgOk(null);
            }
            $upd = $pdo->prepare('UPDATE chat_mensagens SET apagada_em = NOW()
                                   WHERE id = :id AND apagada_em IS NULL AND criado_em >= (NOW() - INTERVAL ' . MSG_MINUTOS_APAGAR . ' MINUTE)');
            $upd->execute([':id' => $m['id']]);
            if ($upd->rowCount() === 0) {
                msgErro('Só é possível apagar até ' . MSG_MINUTOS_APAGAR . ' minutos depois do envio.', 409);
            }
            $c = msgConversa($pdo, (int) $m['conversa_id']);
            $dest = msgDestinatarios($pdo, $c);
            $dados = ['conversa_id' => (int) $m['conversa_id'], 'mensagem_id' => (int) $m['id']];
            msgDepois(fn() => msgAblyAvisar($dest, 'mensagem_apagada', $dados));
            msgOk(null, 'Mensagem apagada.');

        // ===== Conversas da equipe =====

        case 'abrir_individual':
            exigirMetodo('POST');
            $outro = (int) ($corpo['usuario_id'] ?? 0);
            if ($outro <= 0 || $outro === $uid || !msgTemPagina($pdo, $outro)) {
                msgErro('Colega inválido ou sem acesso ao Messenger.');
            }
            $chave = min($uid, $outro) . '-' . max($uid, $outro);
            $st = $pdo->prepare('SELECT id FROM chat_conversas WHERE chave_individual = :k');
            $st->execute([':k' => $chave]);
            $cid = (int) $st->fetchColumn();
            if ($cid === 0) {
                try {
                    $pdo->prepare("INSERT INTO chat_conversas (tipo, canal, chave_individual, criado_por) VALUES ('individual', 'interno', :k, :u)")
                        ->execute([':k' => $chave, ':u' => $uid]);
                    $cid = (int) $pdo->lastInsertId();
                } catch (PDOException $e) {
                    $st->execute([':k' => $chave]); // criada ao mesmo tempo pelo colega
                    $cid = (int) $st->fetchColumn();
                    if ($cid === 0) {
                        throw $e;
                    }
                }
            }
            msgAdicionarParticipante($pdo, $cid, $uid);
            msgAdicionarParticipante($pdo, $cid, $outro);
            msgOk(conversaFormatada($pdo, $cid, $uid));

        case 'criar_grupo':
            exigirMetodo('POST');
            $titulo = mb_substr(msgTexto((string) ($corpo['titulo'] ?? '')), 0, 120);
            if ($titulo === '') {
                msgErro('Dê um nome ao grupo.');
            }
            $comAcesso = array_flip(msgUsuariosComAcesso($pdo));
            $membros = array_values(array_unique(array_filter(array_map('intval', is_array($corpo['membros'] ?? null) ? $corpo['membros'] : []),
                fn($id) => $id !== $uid && isset($comAcesso[$id]))));
            if (!$membros) {
                msgErro('Escolha pelo menos um colega para o grupo.');
            }
            $pdo->beginTransaction();
            $pdo->prepare("INSERT INTO chat_conversas (tipo, canal, titulo, criado_por) VALUES ('grupo', 'interno', :t, :u)")
                ->execute([':t' => $titulo, ':u' => $uid]);
            $cid = (int) $pdo->lastInsertId();
            msgAdicionarParticipante($pdo, $cid, $uid, 'admin');
            foreach ($membros as $m) {
                msgAdicionarParticipante($pdo, $cid, $m);
            }
            $pdo->commit();
            msgSistema($pdo, $cid, $usuario['nome'] . ' criou o grupo "' . $titulo . '"');
            msgAvisarConversa($pdo, msgConversa($pdo, $cid), 'criada');
            msgOk(conversaFormatada($pdo, $cid, $uid));

        case 'grupo_editar':
            exigirMetodo('POST');
            [$c, $eu] = conversaParticipante($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            if ($c['tipo'] !== 'grupo') {
                msgErro('Só grupos podem ser editados.');
            }
            if ($eu['papel'] !== 'admin') {
                msgErro('Apenas administradores do grupo podem fazer isso.', 403);
            }
            $operacao = (string) ($corpo['operacao'] ?? '');
            $alvos = array_values(array_unique(array_filter(array_map('intval', is_array($corpo['usuario_ids'] ?? null) ? $corpo['usuario_ids'] : [(int) ($corpo['usuario_id'] ?? 0)]))));
            $extras = [];
            switch ($operacao) {
                case 'renomear':
                    $titulo = mb_substr(msgTexto((string) ($corpo['titulo'] ?? '')), 0, 120);
                    if ($titulo === '') {
                        msgErro('Dê um nome ao grupo.');
                    }
                    $pdo->prepare('UPDATE chat_conversas SET titulo = :t WHERE id = :id')->execute([':t' => $titulo, ':id' => $c['id']]);
                    msgSistema($pdo, (int) $c['id'], $usuario['nome'] . ' renomeou o grupo para "' . $titulo . '"');
                    break;
                case 'adicionar':
                    $comAcesso = array_flip(msgUsuariosComAcesso($pdo));
                    $alvos = array_values(array_filter($alvos, fn($id) => isset($comAcesso[$id])));
                    if (!$alvos) {
                        msgErro('Escolha quem adicionar.');
                    }
                    foreach ($alvos as $a) {
                        msgAdicionarParticipante($pdo, (int) $c['id'], $a);
                    }
                    $nomes = msgNomesUsuarios($pdo, $alvos);
                    msgSistema($pdo, (int) $c['id'], $usuario['nome'] . ' adicionou ' . implode(', ', $nomes));
                    break;
                case 'remover':
                    $alvos = array_values(array_diff($alvos, [$uid]));
                    if (!$alvos) {
                        msgErro('Escolha quem remover (para sair, use "Sair do grupo").');
                    }
                    $nomes = msgNomesUsuarios($pdo, $alvos);
                    foreach ($alvos as $a) {
                        msgRemoverParticipante($pdo, (int) $c['id'], $a);
                    }
                    $extras = $alvos;
                    msgSistema($pdo, (int) $c['id'], $usuario['nome'] . ' removeu ' . implode(', ', $nomes));
                    break;
                case 'promover':
                case 'rebaixar':
                    $papel = $operacao === 'promover' ? 'admin' : 'membro';
                    foreach ($alvos as $a) {
                        $pdo->prepare('UPDATE chat_participantes SET papel = :p WHERE conversa_id = :c AND usuario_id = :u AND saiu_em IS NULL')
                            ->execute([':p' => $papel, ':c' => $c['id'], ':u' => $a]);
                    }
                    break;
                default:
                    msgErro('Operação inválida.');
            }
            msgAvisarConversa($pdo, msgConversa($pdo, (int) $c['id']), 'editada', $extras);
            msgOk(conversaFormatada($pdo, (int) $c['id'], $uid));

        case 'sair_grupo':
            exigirMetodo('POST');
            [$c] = conversaParticipante($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            if ($c['tipo'] !== 'grupo') {
                msgErro('Só é possível sair de grupos.');
            }
            msgRemoverParticipante($pdo, (int) $c['id'], $uid);
            $restantes = msgParticipantes($pdo, (int) $c['id']);
            if ($restantes && !in_array('admin', array_column($restantes, 'papel'), true)) {
                // grupo sem administrador: o membro mais antigo assume
                $pdo->prepare("UPDATE chat_participantes SET papel = 'admin' WHERE conversa_id = :c AND saiu_em IS NULL ORDER BY entrou_em ASC LIMIT 1")
                    ->execute([':c' => $c['id']]);
            }
            msgSistema($pdo, (int) $c['id'], $usuario['nome'] . ' saiu do grupo');
            msgAvisarConversa($pdo, msgConversa($pdo, (int) $c['id']), 'editada', [$uid]);
            msgOk(null, 'Você saiu do grupo.');

        case 'silenciar':
            exigirMetodo('POST');
            [$c] = conversaParticipante($pdo, $usuario, (int) ($corpo['conversa_id'] ?? 0));
            $silenciada = !empty($corpo['silenciada']) ? 1 : 0;
            $pdo->prepare('UPDATE chat_participantes SET silenciada = :s WHERE conversa_id = :c AND usuario_id = :u')
                ->execute([':s' => $silenciada, ':c' => $c['id'], ':u' => $uid]);
            msgOk(['silenciada' => $silenciada === 1]);

        // ===== Atendimento de clientes (WhatsApp) =====

        case 'fila':
            msgDepois(fn() => msgEncerrarOciososTalvez($pdo)); // encerra conversas paradas (Configurações › Mensagens automáticas)
            exigirMetodo('GET');
            exigirAtendente($pdo, $usuario);
            // 15/10/2026: quem atende em setores vê a fila dos seus setores, os clientes sem setor e os de setores
            // sem atendentes cadastrados; a Gestão e quem não está em nenhum setor veem tudo
            $meusSetores = msgEhGestao($pdo, $uid) ? [] : msgSetoresDoUsuario($pdo, $uid);
            $filtro = '';
            if ($meusSetores) {
                $filtro = ' AND (c.setor_id IS NULL OR c.setor_id IN (' . implode(',', $meusSetores) . ')
                                OR NOT EXISTS (SELECT 1 FROM chat_setor_membros sm WHERE sm.setor_id = c.setor_id))';
            }
            $st = $pdo->query("SELECT c.*, 0 AS silenciada FROM chat_conversas c
                                WHERE c.tipo = 'externo' AND c.status_atendimento = 'aguardando' AND COALESCE(c.teste, 0) = 0{$filtro}
                                ORDER BY c.prioridade DESC, COALESCE(c.ultima_mensagem_em, c.criado_em) ASC LIMIT 200");
            msgOk(formatarConversas($pdo, $st->fetchAll(), $uid));

        case 'assumir':
            exigirMetodo('POST');
            exigirAtendente($pdo, $usuario);
            $cid = (int) ($corpo['conversa_id'] ?? 0);
            $upd = $pdo->prepare("UPDATE chat_conversas SET responsavel_usuario_id = :u, status_atendimento = 'em_atendimento', atribuida_em = NOW(), encerrada_em = NULL,
                                          bot_estado = NULL, bot_tentativas = 0
                                   WHERE id = :id AND tipo = 'externo' AND status_atendimento = 'aguardando'");
            $upd->execute([':u' => $uid, ':id' => $cid]);
            if ($upd->rowCount() === 0) {
                msgErro('Esta conversa já foi assumida por outro atendente.', 409);
            }
            msgAtribuir($pdo, $cid, $uid, $usuario['nome'] . ' assumiu o atendimento');
            msgOk(conversaFormatada($pdo, $cid, $uid));

        case 'transferir':
            // Só o responsável (ou a Gestão) transfere. 14/10/2026: quem transferiu SAI da conversa (não acompanha mais);
            // o novo responsável vê todas as mensagens deste atendimento, inclusive as trocadas com o atendente anterior.
            exigirMetodo('POST');
            $c = msgConversa($pdo, (int) ($corpo['conversa_id'] ?? 0));
            if (!$c || $c['tipo'] !== 'externo' || $c['status_atendimento'] !== 'em_atendimento') {
                msgErro('Atendimento em andamento não encontrado.', 404);
            }
            $anterior = $c['responsavel_usuario_id'] !== null ? (int) $c['responsavel_usuario_id'] : null;
            if ($anterior !== $uid && !msgEhGestao($pdo, $uid)) {
                msgErro('Só o responsável pela conversa ou a Gestão pode transferir.', 403);
            }
            $para = (int) ($corpo['para_usuario_id'] ?? 0);
            if ($para <= 0 || $para === $anterior || !msgEhAtendente($pdo, $para)) {
                msgErro('Escolha outro atendente (usuário com a permissão de atender clientes).');
            }
            $obs = mb_substr(msgTexto((string) ($corpo['observacao'] ?? '')), 0, 500);
            $pdo->beginTransaction();
            $pdo->prepare('INSERT INTO chat_transferencias (conversa_id, atendimento_id, de_usuario_id, para_usuario_id, observacao, criado_por)
                           VALUES (:c, :a, :de, :para, :o, :u)')
                ->execute([':c' => $c['id'], ':a' => $c['atendimento_atual_id'], ':de' => $anterior, ':para' => $para, ':o' => $obs !== '' ? $obs : null, ':u' => $uid]);
            if ($anterior !== null) {
                msgRemoverParticipante($pdo, (int) $c['id'], $anterior);
                // quem ainda estava como observador (regra antiga) também sai
                $pdo->prepare("UPDATE chat_participantes SET saiu_em = NOW() WHERE conversa_id = :c AND papel = 'observador' AND saiu_em IS NULL")
                    ->execute([':c' => $c['id']]);
            }
            $pdo->commit();
            $nomes = msgNomesUsuarios($pdo, array_filter([$anterior, $para]));
            $texto = 'Transferida ' . ($anterior ? 'de ' . ($nomes[$anterior] ?? '?') . ' ' : '') . 'para ' . ($nomes[$para] ?? '?')
                . ($obs !== '' ? ': ' . $obs : '');
            msgAtribuir($pdo, (int) $c['id'], $para, $texto);
            $notif = ['titulo' => 'PAI Messenger', 'corpo' => 'Um atendimento foi transferido para você',
                      'conversa_id' => (int) $c['id'], 'url' => '/messenger?conversa=' . (int) $c['id'], 'tag' => 'conversa-' . (int) $c['id']];
            msgDepois(fn() => msgPushEnviar($pdo, [$para], $notif));
            msgOk(['conversa_id' => (int) $c['id'], 'transferida_para' => $para], 'Conversa transferida.');

        case 'encerrar':
            // Encerrado, o atendimento vai para o histórico: sai da lista de todos e só a Gestão consulta.
            exigirMetodo('POST');
            $c = msgConversa($pdo, (int) ($corpo['conversa_id'] ?? 0));
            if (!$c || $c['tipo'] !== 'externo') {
                msgErro('Conversa de cliente não encontrada.', 404);
            }
            if ((int) ($c['responsavel_usuario_id'] ?? 0) !== $uid && !msgEhGestao($pdo, $uid)) {
                msgErro('Só o responsável pela conversa ou a Gestão pode encerrar.', 403);
            }
            if ($c['status_atendimento'] !== 'em_atendimento') {
                msgErro('Não há atendimento em andamento nesta conversa.', 409);
            }
            msgSistema($pdo, (int) $c['id'], 'Atendimento encerrado por ' . $usuario['nome']);
            $dest = msgDestinatarios($pdo, $c);
            $pdo->beginTransaction();
            $pdo->prepare("UPDATE chat_atendimentos SET status = 'encerrado', encerrado_em = NOW(), encerrado_por = :u WHERE id = :a")
                ->execute([':u' => $uid, ':a' => $c['atendimento_atual_id']]);
            $pdo->prepare("UPDATE chat_conversas SET status_atendimento = 'encerrado', encerrada_em = NOW() WHERE id = :id")->execute([':id' => $c['id']]);
            $pdo->prepare('UPDATE chat_participantes SET saiu_em = NOW() WHERE conversa_id = :c AND saiu_em IS NULL')->execute([':c' => $c['id']]);
            $pdo->commit();
            $dados = ['conversa_id' => (int) $c['id'], 'motivo' => 'encerrada'];
            msgDepois(fn() => msgAblyAvisar($dest, 'conversa', $dados));
            // Pacote 4B: pergunta a nota ao cliente (se a avaliação estiver ligada e a janela de 24 h aberta)
            try {
                $encerrada = msgConversa($pdo, (int) $c['id']);
                if ($encerrada) {
                    msgBotPedirAvaliacao($pdo, $encerrada);
                }
            } catch (Throwable $e) {
                error_log('[messenger] avaliação: ' . $e->getMessage());
            }
            msgOk(null, 'Atendimento encerrado e guardado no histórico.');

        case 'historico_clientes':
            // Atendimentos encerrados, do mais recente para o mais antigo.
            // Gestão vê todos; os demais, só os atendimentos em que participaram.
            exigirMetodo('GET');
            $q = msgTexto((string) ($_GET['q'] ?? ''));
            $limite = max(1, min(100, entradaInt('limite', 30)));
            $antes = entradaInt('antes_id');
            $onde = ["a.status = 'encerrado'"];
            $params = [];
            if ($q !== '') {
                $onde[] = '(ce.nome LIKE :q OR ce.nome_salvo LIKE :q3 OR ce.telefone_e164 LIKE :q2)';
                $params[':q'] = '%' . $q . '%';
                $params[':q3'] = '%' . $q . '%';
                $params[':q2'] = '%' . preg_replace('/\D/', '', $q) . '%';
            }
            if (!empty($_GET['de']) && strtotime((string) $_GET['de'])) {
                $onde[] = 'a.encerrado_em >= :de';
                $params[':de'] = date('Y-m-d 00:00:00', strtotime((string) $_GET['de']));
            }
            if (!empty($_GET['ate']) && strtotime((string) $_GET['ate'])) {
                $onde[] = 'a.encerrado_em <= :ate';
                $params[':ate'] = date('Y-m-d 23:59:59', strtotime((string) $_GET['ate']));
            }
            if ($antes > 0) {
                $onde[] = 'a.id < :antes';
                $params[':antes'] = $antes;
            }
            if (!msgEhGestao($pdo, $uid)) {
                $onde[] = '(a.responsavel_usuario_id = :pu1 OR a.encerrado_por = :pu2
                            OR EXISTS (SELECT 1 FROM chat_transferencias t WHERE t.atendimento_id = a.id AND (t.de_usuario_id = :pu3 OR t.para_usuario_id = :pu4))
                            OR EXISTS (SELECT 1 FROM chat_mensagens mp WHERE mp.atendimento_id = a.id AND mp.autor_usuario_id = :pu5))';
                $params += [':pu1' => $uid, ':pu2' => $uid, ':pu3' => $uid, ':pu4' => $uid, ':pu5' => $uid];
            }
            $st = $pdo->prepare('SELECT a.*, COALESCE(ce.nome_salvo, ce.nome) AS cliente_nome, ce.telefone_e164, u.nome AS responsavel_nome, ue.nome AS encerrado_por_nome,
                                        (SELECT COUNT(*) FROM chat_mensagens m WHERE m.atendimento_id = a.id AND m.autor_tipo <> \'sistema\') AS mensagens
                                   FROM chat_atendimentos a
                                   INNER JOIN chat_conversas c ON c.id = a.conversa_id
                                   LEFT JOIN chat_contatos_externos ce ON ce.id = c.contato_externo_id
                                   LEFT JOIN usuarios u ON u.id = a.responsavel_usuario_id
                                   LEFT JOIN usuarios ue ON ue.id = a.encerrado_por
                                  WHERE ' . implode(' AND ', $onde) . '
                                  ORDER BY a.id DESC LIMIT ' . ($limite + 1));
            $st->execute($params);
            $linhas = $st->fetchAll();
            $temMais = count($linhas) > $limite;
            $linhas = array_slice($linhas, 0, $limite);
            msgOk([
                'atendimentos' => array_map(fn($r) => [
                    'id' => (int) $r['id'],
                    'conversa_id' => (int) $r['conversa_id'],
                    'cliente' => ['nome' => $r['cliente_nome'], 'telefone' => $r['telefone_e164']],
                    'responsavel' => $r['responsavel_usuario_id'] !== null ? ['id' => (int) $r['responsavel_usuario_id'], 'nome' => $r['responsavel_nome']] : null,
                    'aberto_em' => msgDataIso($r['aberto_em']),
                    'encerrado_em' => msgDataIso($r['encerrado_em']),
                    'encerrado_por' => $r['encerrado_por_nome'],
                    'mensagens' => (int) $r['mensagens'],
                    'avaliacao' => isset($r['avaliacao_nota']) && $r['avaliacao_nota'] !== null ? (int) $r['avaliacao_nota'] : null,
                ], $linhas),
                'tem_mais' => $temMais,
                'gestao' => msgEhGestao($pdo, $uid),
            ]);

        case 'historico_mensagens':
            // Mensagens e transferências de um atendimento: Gestão vê todos; os demais, só os que participaram.
            exigirMetodo('GET');
            $st = $pdo->prepare('SELECT a.*, COALESCE(ce.nome_salvo, ce.nome) AS cliente_nome, ce.telefone_e164 FROM chat_atendimentos a
                                   INNER JOIN chat_conversas c ON c.id = a.conversa_id
                                   LEFT JOIN chat_contatos_externos ce ON ce.id = c.contato_externo_id WHERE a.id = :id');
            $st->execute([':id' => entradaInt('atendimento_id')]);
            $a = $st->fetch();
            if (!$a || (!msgEhGestao($pdo, $uid) && !msgParticipouAtendimento($pdo, (int) $a['id'], $uid))) {
                msgErro('Atendimento não encontrado ou você não participou dele.', 404);
            }
            $st = $pdo->prepare('SELECT t.*, ud.nome AS de_nome, up.nome AS para_nome FROM chat_transferencias t
                                   LEFT JOIN usuarios ud ON ud.id = t.de_usuario_id LEFT JOIN usuarios up ON up.id = t.para_usuario_id
                                  WHERE t.atendimento_id = :a ORDER BY t.id');
            $st->execute([':a' => $a['id']]);
            msgOk([
                'atendimento' => ['id' => (int) $a['id'], 'status' => $a['status'], 'aberto_em' => msgDataIso($a['aberto_em']), 'encerrado_em' => msgDataIso($a['encerrado_em']),
                                  'cliente' => ['nome' => $a['cliente_nome'], 'telefone' => $a['telefone_e164']]],
                'mensagens' => msgBuscarMensagens($pdo, 'm.atendimento_id = :a', [':a' => $a['id']], 1000),
                'transferencias' => array_map(fn($t) => ['de' => $t['de_nome'], 'para' => $t['para_nome'], 'observacao' => $t['observacao'], 'em' => msgDataIso($t['criado_em'])], $st->fetchAll()),
            ]);

        case 'modelos':
            exigirMetodo('GET');
            exigirAtendente($pdo, $usuario);
            $waba = (string) msgConfig('meta_waba_id', '');
            if (!msgMetaConfigurado() || $waba === '') {
                msgErro('WhatsApp não configurado (credenciais da Meta no pai-chaves.php).', 503);
            }
            $r = msgMeta('GET', $waba . '/message_templates?status=APPROVED&limit=100&fields=name,language,status,category,components');
            if (!$r['ok']) {
                msgErro('Não foi possível consultar os modelos na Meta: ' . $r['erro'], 502);
            }
            $lista = [];
            foreach ($r['json']['data'] ?? [] as $t) {
                $corpoModelo = '';
                foreach ($t['components'] ?? [] as $comp) {
                    if (($comp['type'] ?? '') === 'BODY') {
                        $corpoModelo = (string) ($comp['text'] ?? '');
                    }
                }
                preg_match_all('/\{\{\s*(\d+)\s*\}\}/', $corpoModelo, $ph);
                $lista[] = [
                    'nome' => $t['name'] ?? '',
                    'idioma' => $t['language'] ?? 'pt_BR',
                    'categoria' => $t['category'] ?? '',
                    'corpo' => $corpoModelo,
                    'parametros' => count(array_unique($ph[1] ?? [])),
                ];
            }
            msgOk($lista);

        // ===== Configuração (administrador) =====

        case 'atendentes':
            // Lista para transferir: usuários com a permissão de atender clientes (página messenger-clientes).
            exigirMetodo('GET');
            if (!msgEhAtendente($pdo, $uid) && !msgEhGestao($pdo, $uid)) {
                exigirAtendente($pdo, $usuario);
            }
            $ids = array_values(array_diff(msgAtendentesAtivos($pdo), [$uid]));
            $nomes = msgNomesUsuarios($pdo, $ids);
            $abertas = [];
            foreach ($pdo->query("SELECT responsavel_usuario_id, COUNT(*) AS n FROM chat_conversas WHERE status_atendimento = 'em_atendimento' GROUP BY responsavel_usuario_id")->fetchAll() as $r) {
                $abertas[(int) $r['responsavel_usuario_id']] = (int) $r['n'];
            }
            $lista = [];
            foreach ($nomes as $id => $nome) {
                $lista[] = ['usuario_id' => $id, 'nome' => $nome, 'em_atendimento' => $abertas[$id] ?? 0];
            }
            usort($lista, fn($a, $b) => strcasecmp($a['nome'], $b['nome']));
            msgOk($lista);

        default:
            msgErro('Ação inválida.', 400);
    }
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[messenger] ' . $acao . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    msgErro('Não foi possível concluir a operação. Tente de novo.', 500);
}
