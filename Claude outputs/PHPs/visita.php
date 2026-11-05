<?php
declare(strict_types=1);
// 23/10/2026 (segurança): confere o login assinado (cookie pai_session) antes de usar os cookies pai_*. Ver /home2/pla48587/pai_sessao.php
if (is_file('/home2/pla48587/pai_sessao.php')) { include_once '/home2/pla48587/pai_sessao.php'; } elseif (PHP_SAPI !== 'cli') { $paiChavesSemSessao = @include '/home2/pla48587/pai-chaves.php'; if (is_array($paiChavesSemSessao) && strtolower(trim((string) ($paiChavesSemSessao['pai_sessao_modo'] ?? ''))) === 'exigir') { error_log('[PAI] pai_sessao.php ausente com pai_sessao_modo=exigir: acesso bloqueado em ' . basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''))); if (!headers_sent()) { http_response_code(503); header('Content-Type: application/json; charset=utf-8'); header('Retry-After: 300'); } echo json_encode(['ok' => false, 'sucesso' => false, 'success' => false, 'erro' => 'Sistema em manutenção. Tente novamente em alguns minutos.', 'msg' => 'Sistema em manutenção. Tente novamente em alguns minutos.'], JSON_UNESCAPED_UNICODE); exit; } unset($paiChavesSemSessao); } // 23/10/2026: sem o pai_sessao.php e com o modo exigir, bloqueia em vez de liberar

/**
 * visita.php
 *
 * Backend unificado de avaliações do atendimento.
 *
 * Tipos suportados:
 * - visita
 * - pos_atendimento
 *
 * Compatibilidade:
 * - chamadas antigas sem ?tipo= continuam sendo tratadas como "visita".
 * - mantém as tabelas existentes visitas_avaliacao / visita_avaliacao_respostas /
 *   visita_avaliacao_registros, agora com a coluna "tipo".
 *
 * Permissões:
 * - visita            -> visita-avaliacao
 * - pos_atendimento   -> pos-atendimento-avaliacao
 *
 * Regras:
 * - Visita: início somente em fase08 e somente quando há velório.
 * - Pós-atendimento: usa as mesmas perguntas da visita e acrescenta Sepultamento
 *   quando realiza_sepultamento = Sim.
 * - O usuário que iniciou cada avaliação fica registrado nos campos visitante_*;
 *   a API também devolve aliases avaliador_* para o novo uso.
 * - Registros fotográficos continuam opcionais.
 * - Ao concluir uma avaliação, cada nota é vinculada ao colaborador
 *   responsável pela etapa e congelada em avaliacao_notas_colaboradores.
 * - "Não sei" é armazenado para auditoria, mas nota_valor fica NULL e
 *   não deve entrar em médias/rankings.
 */

@ini_set('display_errors', '0');
@ini_set('html_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$allowedOrigins = [
    'https://app.planoassistencialintegrado.com.br',
    'https://pai.planoassistencialintegrado.com.br',
    'https://planoassistencialintegrado.com.br',
    'https://club.planoassistencialintegrado.com.br',
    'https://www.planoassistencialintegrado.com.br',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $allowedOrigins, true)) {
    header_remove('Access-Control-Allow-Origin');
    header_remove('Access-Control-Allow-Credentials');
    header_remove('Access-Control-Allow-Methods');
    header_remove('Access-Control-Allow-Headers');
    header_remove('Access-Control-Max-Age');

    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization, Expires, Cache-Control, Pragma');
    header('Access-Control-Max-Age: 86400');
    header('Vary: Origin');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$sessionLifetime = 8 * 60 * 60;
ini_set('session.gc_maxlifetime', (string)$sessionLifetime);
ini_set('session.cookie_lifetime', (string)$sessionLifetime);
session_set_cookie_params([
    'lifetime' => $sessionLifetime,
    'path' => '/',
    'domain' => '.planoassistencialintegrado.com.br',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'None',
]);
session_start();

date_default_timezone_set(getenv('PAI_TIMEZONE') ?: 'America/Sao_Paulo');

function responder(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function normalizar_cargo($value): string {
    $s = trim((string)$value);
    if ($s === '') return '';

    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    if ($ascii !== false) $s = $ascii;

    $s = strtolower($s);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim((string)$s, '-');
}

function texto_len(string $value): int {
    return function_exists('mb_strlen')
        ? mb_strlen($value, 'UTF-8')
        : strlen($value);
}

function table_exists(PDO $pdo, string $table): bool {
    static $cache = [];

    if (array_key_exists($table, $cache)) {
        return $cache[$table];
    }

    $st = $pdo->prepare("
        SELECT 1
          FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table
         LIMIT 1
    ");
    $st->execute([':table' => $table]);

    return $cache[$table] = (bool)$st->fetchColumn();
}

function column_exists(PDO $pdo, string $table, string $column): bool {
    static $cache = [];

    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    $st = $pdo->prepare("
        SELECT 1
          FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table
           AND COLUMN_NAME = :column
         LIMIT 1
    ");
    $st->execute([
        ':table' => $table,
        ':column' => $column,
    ]);

    return $cache[$key] = (bool)$st->fetchColumn();
}

function garantir_sessao_minima(): void {
    if (!empty($_SESSION['usuario_nome'])) return;

    if (!empty($_COOKIE['pai_auth']) && $_COOKIE['pai_auth'] === '1') {
        $who =
            $_COOKIE['pai_user']
            ?? $_COOKIE['pai_nome']
            ?? $_COOKIE['user']
            ?? null;

        if (!empty($who)) {
            $_SESSION['usuario_nome'] = trim((string)$who);
        }
    }
}

function usuario_atual(PDO $pdo): array {
    garantir_sessao_minima();

    $login = trim((string)($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
    $nomeSessao = trim((string)($_SESSION['usuario_nome'] ?? ''));

    $sessionId = (int)(
        $_SESSION['user_id']
        ?? $_SESSION['usuario_id']
        ?? $_COOKIE['pai_uid']
        ?? 0
    );

    $row = null;

    if ($sessionId > 0) {
        $st = $pdo->prepare("
            SELECT id, nome, usuario, cargo
              FROM usuarios
             WHERE id = :id
             LIMIT 1
        ");
        $st->execute([':id' => $sessionId]);
        $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    if (!$row && $login !== '') {
        $st = $pdo->prepare("
            SELECT id, nome, usuario, cargo
              FROM usuarios
             WHERE usuario = :usuario
             LIMIT 1
        ");
        $st->execute([':usuario' => $login]);
        $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    if (!$row && $nomeSessao !== '') {
        $st = $pdo->prepare("
            SELECT id, nome, usuario, cargo
              FROM usuarios
             WHERE nome = :nome
             LIMIT 1
        ");
        $st->execute([':nome' => $nomeSessao]);
        $row = $st->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    if (!$row) {
        responder([
            'erro' => true,
            'msg' => 'Sessão expirada ou usuário não identificado.',
            'need_login' => true,
        ], 401);
    }

    $row['id'] = (int)$row['id'];
    $row['cargo'] = normalizar_cargo($row['cargo'] ?? '');

    $_SESSION['user_id'] = $row['id'];

    return $row;
}

function normalizar_tipo_avaliacao($value): string {
    $tipo = strtolower(trim((string)$value));

    if ($tipo === '' || $tipo === 'visita') {
        return 'visita';
    }

    if (in_array($tipo, ['pos_atendimento', 'pos-atendimento', 'pos'], true)) {
        return 'pos_atendimento';
    }

    responder([
        'erro' => true,
        'msg' => 'Tipo de avaliação inválido.',
    ], 400);
}

function permissao_por_tipo(string $tipo): string {
    return $tipo === 'pos_atendimento'
        ? 'pos-atendimento-avaliacao'
        : 'visita-avaliacao';
}

function usuario_tem_permissao_avaliacao(
    PDO $pdo,
    array $user,
    string $tipo
): bool {
    $pagina = permissao_por_tipo($tipo);

    // 05/11/2026: vale o modelo de grupos (27/10/2026). O usuário pode = páginas do grupo
    // (cargo_paginas, pelo usuarios.cargo = cargos.slug) + extras (permissoes).
    // Quem tem Gestão (cargo 'adm' ou página 'gestao' no grupo ou como extra) também pode.
    if (($user['cargo'] ?? '') === 'adm') {
        return true;
    }

    $paginasAceitas = [$pagina, 'gestao'];

    if (table_exists($pdo, 'permissoes')) {
        $st = $pdo->prepare("
            SELECT 1
              FROM permissoes
             WHERE user_id = :user_id
               AND pagina IN (:pagina1, :pagina2)
             LIMIT 1
        ");
        $st->execute([
            ':user_id' => (int)$user['id'],
            ':pagina1' => $paginasAceitas[0],
            ':pagina2' => $paginasAceitas[1],
        ]);
        if ($st->fetchColumn()) {
            return true;
        }
    }

    if (table_exists($pdo, 'cargos') && table_exists($pdo, 'cargo_paginas')) {
        $filtroAtivo = column_exists($pdo, 'cargos', 'ativo') ? ' AND c.ativo = 1' : '';
        $st = $pdo->prepare("
            SELECT 1
              FROM usuarios u
              JOIN cargos c ON LOWER(TRIM(c.slug)) = LOWER(TRIM(u.cargo)){$filtroAtivo}
              JOIN cargo_paginas cp ON cp.cargo_id = c.id
             WHERE u.id = :user_id
               AND cp.pagina IN (:pagina1, :pagina2)
             LIMIT 1
        ");
        $st->execute([
            ':user_id' => (int)$user['id'],
            ':pagina1' => $paginasAceitas[0],
            ':pagina2' => $paginasAceitas[1],
        ]);
        if ($st->fetchColumn()) {
            return true;
        }
    }

    return false;
}

function exigir_autorizacao(
    PDO $pdo,
    string $tipo
): array {
    $user = usuario_atual($pdo);

    if (!usuario_tem_permissao_avaliacao($pdo, $user, $tipo)) {
        $nome = $tipo === 'pos_atendimento'
            ? 'Pós-Atendimento'
            : 'Visita de Avaliação';

        responder([
            'erro' => true,
            'msg' => "Usuário sem permissão para {$nome}.",
            'autorizado' => false,
            'tipo' => $tipo,
        ], 403);
    }

    return $user;
}

function normalize_status_key($value): string {
    $s = trim((string)$value);

    if ($s === '') {
        return '';
    }

    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);

    if ($ascii !== false) {
        $s = $ascii;
    }

    $s = strtolower(trim($s));
    $s = preg_replace('/\s+/u', ' ', $s) ?: $s;

    return $s;
}

function visita_valor_sim($value): bool {
    $s = normalize_status_key($value);
    return in_array($s, ['sim', 's', '1', 'true'], true);
}

function visita_valor_nao($value): bool {
    $s = normalize_status_key($value);
    return in_array($s, ['nao', 'n', '0', 'false'], true);
}

function visita_velorio_memorial(array $atendimento): bool {
    $local = normalize_status_key($atendimento['local_velorio'] ?? '');
    $sala = normalize_status_key($atendimento['sala_velorio'] ?? '');

    // O próprio acompanhamento trata Sala 01/02/03 como salas internas
    // do Memorial Senhor do Bonfim.
    if (
        strpos($local, 'memorial senhor do bonfim') !== false
        || strpos($local, 'memorial - sala') !== false
    ) {
        return true;
    }

    return in_array($sala, [
        'sala 01', 'sala 1', '01', '1',
        'sala 02', 'sala 2', '02', '2',
        'sala 03', 'sala 3', '03', '3',
    ], true);
}

function normalize_status_code($status): ?string {
    if ($status === null || $status === '') {
        return null;
    }

    $s = strtolower(trim((string)$status));

    // Aceita "fase1", "fase01", "fase 08", etc.
    if (strpos($s, 'fase') === 0) {
        $num = preg_replace('/\D+/', '', $s);

        if ($num === '') {
            return $s;
        }

        return 'fase' . str_pad($num, 2, '0', STR_PAD_LEFT);
    }

    $map = [
        normalize_status_key('Removendo') => 'fase01',
        normalize_status_key('Aguardando Procedimento') => 'fase02',
        normalize_status_key('Preparando') => 'fase03',
        normalize_status_key('Aguardando Ornamentação') => 'fase04',
        normalize_status_key('Ornamentando') => 'fase05',
        normalize_status_key('Fim da Ornamentação') => 'fase06',
        normalize_status_key('Aguardando Corpo Pronto') => 'fase06',
        normalize_status_key('Corpo Pronto') => 'fase12',
        normalize_status_key('Transportando') => 'fase07',
        normalize_status_key('Transportando Óbito p/Velório') => 'fase07',
        normalize_status_key('Transportando Óbito Para Velório') => 'fase07',
        normalize_status_key('Velando') => 'fase08',
        normalize_status_key('Entrega de Corpo') => 'fase08',
        normalize_status_key('Sepultando') => 'fase09',
        normalize_status_key('Transportando P/ Sepultamento') => 'fase09',
        normalize_status_key('Transportando Óbito Para o Sepultamento') => 'fase09',
        normalize_status_key('Sepultamento Concluído') => 'fase10',
        normalize_status_key('Sepultamento Concluido') => 'fase10',
        normalize_status_key('Material Recolhido') => 'fase11',
    ];

    $key = normalize_status_key($s);

    return $map[$key] ?? null;
}

function atendimento(PDO $pdo, int $id): array {
    if ($id <= 0) {
        responder(['erro' => true, 'msg' => 'Atendimento inválido.'], 400);
    }

    $st = $pdo->prepare("
        SELECT
            id,
            falecido,
            status,
            agente,
            tanato,
            ornamentacao,
            realiza_velorio,
            local_velorio,
            sala_velorio,
            realiza_sepultamento,
            responsavel_velorio_id,
            responsavel_velorio_nome,
            responsavel_sepultamento_id,
            responsavel_sepultamento_nome,
            tipo_atendimento
          FROM sepultamentos
         WHERE id = :id
         LIMIT 1
    ");
    $st->execute([':id' => $id]);

    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        responder(['erro' => true, 'msg' => 'Atendimento não encontrado.'], 404);
    }

    $row['id'] = (int)$row['id'];
    $row['status'] = normalize_status_code($row['status'] ?? null);

    return $row;
}

function historico_tem_fase(PDO $pdo, int $atendimentoId, array $fases): bool {
    if (!table_exists($pdo, 'historico_sepultamentos')) return false;

    $st = $pdo->prepare("
        SELECT status_novo
          FROM historico_sepultamentos
         WHERE sepultamento_id = :id
         ORDER BY id DESC
         LIMIT 120
    ");
    $st->execute([':id' => $atendimentoId]);

    $wanted = array_fill_keys($fases, true);

    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $fase = normalize_status_code($row['status_novo'] ?? null);
        if (isset($wanted[$fase])) return true;
    }

    return false;
}

function fase08_em(PDO $pdo, int $atendimentoId): ?string {
    if (!table_exists($pdo, 'historico_sepultamentos')) return null;

    $st = $pdo->prepare("
        SELECT status_novo, datahora
          FROM historico_sepultamentos
         WHERE sepultamento_id = :id
         ORDER BY id ASC
         LIMIT 200
    ");
    $st->execute([':id' => $atendimentoId]);

    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        if (normalize_status_code($row['status_novo'] ?? null) === 'fase08') {
            $dt = trim((string)($row['datahora'] ?? ''));
            return $dt !== '' ? $dt : null;
        }
    }

    return null;
}

function remocao_foi_outra_empresa(PDO $pdo, int $atendimentoId): bool {
    if ($atendimentoId <= 0 || !table_exists($pdo, 'telemetria')) {
        return false;
    }

    /**
     * A fonte real do veículo é a tabela telemetria.
     *
     * O TelemetriaModal envia:
     *   - sepultamento_id
     *   - tipo = remocao
     *   - veiculo_nome
     *   - placa
     *
     * Usamos somente a remoção encerrada mais recente para impedir que
     * transportes posteriores (para_velorio / para_sepultamento) interfiram
     * na regra da pergunta 2.
     */
    $st = $pdo->prepare("
        SELECT
            id,
            veiculo_nome,
            placa
          FROM telemetria
         WHERE sepultamento_id = :id
           AND tipo = 'remocao'
           AND encerrado = 1
         ORDER BY id DESC
         LIMIT 1
    ");
    $st->execute([':id' => $atendimentoId]);

    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        return false;
    }

    $nome = normalize_status_key($row['veiculo_nome'] ?? '');

    return $nome === 'outra empresa';
}

function codigo_pergunta(int $numero): string {
    $map = [
        1 => 'primeiro_atendimento',
        2 => 'remocao',
        3 => 'preparacao',
        4 => 'apresentacao_corpo',
        5 => 'cerimonia_horario',
        6 => 'montagem_ambiente',
        7 => 'sepultamento',
    ];

    return $map[$numero] ?? ('pergunta_' . $numero);
}

function perguntas_aplicaveis(
    PDO $pdo,
    array $atendimento,
    string $tipo = 'visita'
): array {
    $tipo = normalizar_tipo_avaliacao($tipo);
    $id = (int)$atendimento['id'];

    $temVelorio = !visita_valor_nao($atendimento['realiza_velorio'] ?? '');
    $temSepultamento = visita_valor_sim($atendimento['realiza_sepultamento'] ?? '');

    // 1) Primeiro atendimento: sempre.
    $q1 = true;

    // 2) Remoção: não aparece se foi OUTRA EMPRESA.
    $q2 = !remocao_foi_outra_empresa($pdo, $id);

    // 3) Preparação: somente Tanatopraxia = Sim.
    $q3 = visita_valor_sim($atendimento['tanato'] ?? '');

    // 4) Apresentação do corpo: somente Ornamentação = Sim.
    $q4 = visita_valor_sim($atendimento['ornamentacao'] ?? '');

    // 5) Cerimônia no horário: somente quando houve velório.
    $q5 = $temVelorio;

    // 6) Montagem do ambiente: somente quando houve velório fora das
    //    salas internas do Memorial Senhor do Bonfim.
    $q6 = $temVelorio && !visita_velorio_memorial($atendimento);

    $perguntas = [
        [
            'numero' => 1,
            'codigo' => codigo_pergunta(1),
            'titulo' => 'Primeiro atendimento',
            'descricao' => 'Acolhimento, clareza das informações e tempo de resposta ao chamado.',
            'aplicavel' => $q1,
            'motivo_nao_aplicavel' => null,
        ],
        [
            'numero' => 2,
            'codigo' => codigo_pergunta(2),
            'titulo' => 'Remoção',
            'descricao' => 'Pontualidade na chegada, cuidado e respeito da equipe.',
            'aplicavel' => $q2,
            'motivo_nao_aplicavel' => $q2
                ? null
                : 'Remoção realizada por outra empresa.',
        ],
        [
            'numero' => 3,
            'codigo' => codigo_pergunta(3),
            'titulo' => 'Preparação',
            'descricao' => 'Aspecto do corpo após a preparação.',
            'aplicavel' => $q3,
            'motivo_nao_aplicavel' => $q3
                ? null
                : 'Tanatopraxia não realizada.',
        ],
        [
            'numero' => 4,
            'codigo' => codigo_pergunta(4),
            'titulo' => 'Apresentação do corpo',
            'descricao' => 'Aspecto, roupa e arrumo das flores.',
            'aplicavel' => $q4,
            'motivo_nao_aplicavel' => $q4
                ? null
                : 'Ornamentação não realizada.',
        ],
        [
            'numero' => 5,
            'codigo' => codigo_pergunta(5),
            'titulo' => 'Cerimônia no horário',
            'descricao' => 'O corpo chegou no horário combinado?',
            'aplicavel' => $q5,
            'motivo_nao_aplicavel' => $q5 ? null : 'Não houve velório.',
        ],
        [
            'numero' => 6,
            'codigo' => codigo_pergunta(6),
            'titulo' => 'Montagem do ambiente',
            'descricao' => 'Materiais, organização e limpeza.',
            'aplicavel' => $q6,
            'motivo_nao_aplicavel' => $q6
                ? null
                : (
                    !$temVelorio
                        ? 'Não houve velório.'
                        : 'Velório realizado em sala interna do Memorial Senhor do Bonfim.'
                ),
        ],
    ];

    if ($tipo === 'pos_atendimento') {
        $perguntas[] = [
            'numero' => 7,
            'codigo' => codigo_pergunta(7),
            'titulo' => 'Sepultamento',
            'descricao' => 'Pontualidade, organização, condução da equipe e cuidado com a família.',
            'aplicavel' => $temSepultamento,
            'motivo_nao_aplicavel' => $temSepultamento
                ? null
                : 'Não houve sepultamento.',
        ];
    }

    return $perguntas;
}

function avaliacao_do_atendimento(
    PDO $pdo,
    int $atendimentoId,
    string $tipo = 'visita'
): ?array {
    $tipo = normalizar_tipo_avaliacao($tipo);

    $st = $pdo->prepare("
        SELECT *
          FROM visitas_avaliacao
         WHERE atendimento_id = :atendimento_id
           AND tipo = :tipo
         LIMIT 1
    ");
    $st->execute([
        ':atendimento_id' => $atendimentoId,
        ':tipo' => $tipo,
    ]);

    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;

    $row['id'] = (int)$row['id'];
    $row['atendimento_id'] = (int)$row['atendimento_id'];
    $row['visitante_id'] = (int)$row['visitante_id'];

    // Aliases semânticos para o modelo novo.
    $row['avaliador_id'] = (int)$row['visitante_id'];
    $row['avaliador_nome'] = (string)($row['visitante_nome'] ?? '');
    $row['avaliador_usuario'] = (string)($row['visitante_usuario'] ?? '');
    $row['avaliador_cargo'] = (string)($row['visitante_cargo'] ?? '');

    foreach (['latitude_inicio', 'longitude_inicio', 'precisao_inicio_m'] as $key) {
        $row[$key] = $row[$key] !== null ? (float)$row[$key] : null;
    }

    return $row;
}

function resposta_rows(PDO $pdo, int $visitaId): array {
    $st = $pdo->prepare("
        SELECT
            id,
            pergunta_numero,
            pergunta_codigo,
            nota,
            observacao,
            foto_url
          FROM visita_avaliacao_respostas
         WHERE visita_id = :visita_id
         ORDER BY pergunta_numero ASC
    ");
    $st->execute([':visita_id' => $visitaId]);

    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($rows as &$row) {
        $row['id'] = (int)$row['id'];
        $row['pergunta_numero'] = (int)$row['pergunta_numero'];
    }
    unset($row);

    return $rows;
}


/* ============================================================
   MOTOR DE ATRIBUIÇÃO DE NOTAS A COLABORADORES
   ============================================================ */

function usuario_por_identificacao(PDO $pdo, $valor): ?array {
    $raw = trim((string)$valor);
    if ($raw === '' || !table_exists($pdo, 'usuarios')) {
        return null;
    }

    // Se for um ID explícito, prioriza a busca por ID.
    if (ctype_digit($raw) && (int)$raw > 0) {
        $st = $pdo->prepare("
            SELECT id, nome, usuario, cargo
              FROM usuarios
             WHERE id = :id
             LIMIT 1
        ");
        $st->execute([':id' => (int)$raw]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if ($row) {
            return [
                'id' => (int)$row['id'],
                'nome' => trim((string)($row['nome'] ?? '')),
                'usuario' => trim((string)($row['usuario'] ?? '')),
                'cargo' => trim((string)($row['cargo'] ?? '')),
            ];
        }
    }

    // O histórico atual grava "usuario" como texto; em alguns registros
    // esse texto pode ser login e em outros pode ser nome.
    $st = $pdo->prepare("
        SELECT id, nome, usuario, cargo
          FROM usuarios
         WHERE usuario = :usuario
            OR nome = :nome
         LIMIT 1
    ");
    $st->execute([
        ':usuario' => $raw,
        ':nome' => $raw,
    ]);

    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;

    return [
        'id' => (int)$row['id'],
        'nome' => trim((string)($row['nome'] ?? '')),
        'usuario' => trim((string)($row['usuario'] ?? '')),
        'cargo' => trim((string)($row['cargo'] ?? '')),
    ];
}

function responsavel_historico_fase(
    PDO $pdo,
    int $atendimentoId,
    string $fase
): ?array {
    if (
        $atendimentoId <= 0
        || !table_exists($pdo, 'historico_sepultamentos')
    ) {
        return null;
    }

    $st = $pdo->prepare("
        SELECT id, usuario, status_novo, datahora
          FROM historico_sepultamentos
         WHERE sepultamento_id = :id
         ORDER BY id DESC
         LIMIT 200
    ");
    $st->execute([':id' => $atendimentoId]);

    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        if (
            normalize_status_code($row['status_novo'] ?? null)
            !== $fase
        ) {
            continue;
        }

        $usuarioTexto = trim((string)($row['usuario'] ?? ''));
        if ($usuarioTexto === '') continue;

        $usuario = usuario_por_identificacao($pdo, $usuarioTexto);

        return [
            'usuario_id' => $usuario ? (int)$usuario['id'] : null,
            'usuario_nome' => $usuario
                ? (string)($usuario['nome'] ?: $usuarioTexto)
                : $usuarioTexto,
            'usuario_login' => $usuario
                ? (string)($usuario['usuario'] ?? '')
                : '',
            'usuario_cargo' => $usuario
                ? (string)($usuario['cargo'] ?? '')
                : '',
            'fase_referencia' => $fase,
            'fonte' => 'historico_sepultamentos',
            'fonte_detalhe' => 'historico:' . $fase,
            'data_referencia' => trim((string)($row['datahora'] ?? '')) ?: null,
        ];
    }

    return null;
}

function responsavel_historico_priorizado(
    PDO $pdo,
    int $atendimentoId,
    array $fases
): ?array {
    foreach ($fases as $fase) {
        $r = responsavel_historico_fase(
            $pdo,
            $atendimentoId,
            (string)$fase
        );

        if ($r) return $r;
    }

    return null;
}

function responsavel_snapshot_sepultamento(
    PDO $pdo,
    array $atendimento,
    string $segmento
): ?array {
    $ehVelorio = $segmento === 'velorio';

    $id = (int)(
        $atendimento[
            $ehVelorio
                ? 'responsavel_velorio_id'
                : 'responsavel_sepultamento_id'
        ] ?? 0
    );

    $nome = trim((string)(
        $atendimento[
            $ehVelorio
                ? 'responsavel_velorio_nome'
                : 'responsavel_sepultamento_nome'
        ] ?? ''
    ));

    if ($id > 0) {
        $usuario = usuario_por_identificacao($pdo, (string)$id);

        return [
            'usuario_id' => $id,
            'usuario_nome' => $nome !== ''
                ? $nome
                : (string)($usuario['nome'] ?? ''),
            'usuario_login' => (string)($usuario['usuario'] ?? ''),
            'usuario_cargo' => (string)($usuario['cargo'] ?? ''),
            'fase_referencia' => $ehVelorio ? 'fase07' : 'fase09',
            'fonte' => 'sepultamentos',
            'fonte_detalhe' => $ehVelorio
                ? 'responsavel_velorio'
                : 'responsavel_sepultamento',
            'data_referencia' => null,
        ];
    }

    if ($nome !== '') {
        $usuario = usuario_por_identificacao($pdo, $nome);

        return [
            'usuario_id' => $usuario ? (int)$usuario['id'] : null,
            'usuario_nome' => $usuario
                ? (string)($usuario['nome'] ?: $nome)
                : $nome,
            'usuario_login' => $usuario
                ? (string)($usuario['usuario'] ?? '')
                : '',
            'usuario_cargo' => $usuario
                ? (string)($usuario['cargo'] ?? '')
                : '',
            'fase_referencia' => $ehVelorio ? 'fase07' : 'fase09',
            'fonte' => 'sepultamentos',
            'fonte_detalhe' => $ehVelorio
                ? 'responsavel_velorio_nome'
                : 'responsavel_sepultamento_nome',
            'data_referencia' => null,
        ];
    }

    // Compatibilidade com atendimentos antigos.
    return responsavel_historico_fase(
        $pdo,
        (int)$atendimento['id'],
        $ehVelorio ? 'fase07' : 'fase09'
    );
}

function resolver_responsavel_pergunta(
    PDO $pdo,
    array $atendimento,
    string $perguntaCodigo
): ?array {
    $atendimentoId = (int)$atendimento['id'];

    switch ($perguntaCodigo) {
        case 'primeiro_atendimento':
            // "agente" já é exibido pelo acompanhamento como responsável
            // do atendimento inicial. Não inventamos fallback para outra fase:
            // se não houver agente identificável, a nota fica sem colaborador.
            $agente = trim((string)($atendimento['agente'] ?? ''));

            if ($agente === '') return null;

            $usuario = usuario_por_identificacao($pdo, $agente);

            return [
                'usuario_id' => $usuario ? (int)$usuario['id'] : null,
                'usuario_nome' => $usuario
                    ? (string)($usuario['nome'] ?: $agente)
                    : $agente,
                'usuario_login' => $usuario
                    ? (string)($usuario['usuario'] ?? '')
                    : '',
                'usuario_cargo' => $usuario
                    ? (string)($usuario['cargo'] ?? '')
                    : '',
                'fase_referencia' => null,
                'fonte' => 'sepultamentos',
                'fonte_detalhe' => 'agente',
                'data_referencia' => null,
            ];

        case 'remocao':
            return responsavel_historico_priorizado(
                $pdo,
                $atendimentoId,
                ['fase01']
            );

        case 'preparacao':
            // Fim da conservação é preferido por representar a entrega da
            // preparação; fase03 é fallback para registros sem fase04.
            return responsavel_historico_priorizado(
                $pdo,
                $atendimentoId,
                ['fase04', 'fase03']
            );

        case 'apresentacao_corpo':
            // Fim da ornamentação é preferido; fase05 é fallback.
            return responsavel_historico_priorizado(
                $pdo,
                $atendimentoId,
                ['fase06', 'fase05']
            );

        case 'cerimonia_horario':
        case 'montagem_ambiente':
            // O sistema atual define fase07/responsavel_velorio como
            // responsável operacional pelo trecho até Entrega de Corpo.
            return responsavel_snapshot_sepultamento(
                $pdo,
                $atendimento,
                'velorio'
            );

        case 'sepultamento':
            // O sistema atual define fase09/responsavel_sepultamento como
            // responsável operacional pelo trecho até a conclusão.
            return responsavel_snapshot_sepultamento(
                $pdo,
                $atendimento,
                'sepultamento'
            );

        default:
            return null;
    }
}

function congelar_notas_colaboradores(
    PDO $pdo,
    array $avaliacao,
    array $atendimento,
    string $tipo
): void {
    if (!table_exists($pdo, 'avaliacao_notas_colaboradores')) {
        throw new RuntimeException(
            'Migração pendente: tabela avaliacao_notas_colaboradores não encontrada.'
        );
    }

    $avaliacaoId = (int)$avaliacao['id'];
    $atendimentoId = (int)$atendimento['id'];

    $st = $pdo->prepare("
        SELECT
            id,
            pergunta_numero,
            pergunta_codigo,
            aplicavel,
            nota
          FROM visita_avaliacao_respostas
         WHERE visita_id = :avaliacao_id
         ORDER BY pergunta_numero ASC
    ");
    $st->execute([':avaliacao_id' => $avaliacaoId]);

    $respostas = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $upsert = $pdo->prepare("
        INSERT INTO avaliacao_notas_colaboradores (
            avaliacao_id,
            resposta_id,
            atendimento_id,
            tipo_avaliacao,
            pergunta_numero,
            pergunta_codigo,
            nota_original,
            nota_valor,

            responsavel_usuario_id,
            responsavel_nome,
            responsavel_login,
            responsavel_cargo,

            fase_referencia,
            fonte_responsavel,
            fonte_detalhe,
            data_referencia,

            avaliador_id,
            avaliador_nome,

            criado_em,
            atualizado_em
        ) VALUES (
            :avaliacao_id,
            :resposta_id,
            :atendimento_id,
            :tipo_avaliacao,
            :pergunta_numero,
            :pergunta_codigo,
            :nota_original,
            :nota_valor,

            :responsavel_usuario_id,
            :responsavel_nome,
            :responsavel_login,
            :responsavel_cargo,

            :fase_referencia,
            :fonte_responsavel,
            :fonte_detalhe,
            :data_referencia,

            :avaliador_id,
            :avaliador_nome,

            NOW(),
            NOW()
        )
        ON DUPLICATE KEY UPDATE
            resposta_id = VALUES(resposta_id),
            pergunta_numero = VALUES(pergunta_numero),
            nota_original = VALUES(nota_original),
            nota_valor = VALUES(nota_valor),

            responsavel_usuario_id = VALUES(responsavel_usuario_id),
            responsavel_nome = VALUES(responsavel_nome),
            responsavel_login = VALUES(responsavel_login),
            responsavel_cargo = VALUES(responsavel_cargo),

            fase_referencia = VALUES(fase_referencia),
            fonte_responsavel = VALUES(fonte_responsavel),
            fonte_detalhe = VALUES(fonte_detalhe),
            data_referencia = VALUES(data_referencia),

            avaliador_id = VALUES(avaliador_id),
            avaliador_nome = VALUES(avaliador_nome),

            atualizado_em = NOW()
    ");

    foreach ($respostas as $resposta) {
        if ((int)($resposta['aplicavel'] ?? 0) !== 1) {
            continue;
        }

        $codigo = trim((string)($resposta['pergunta_codigo'] ?? ''));
        $nota = trim((string)($resposta['nota'] ?? ''));

        if ($codigo === '' || $nota === '') {
            continue;
        }

        // "Não sei" é preservado, porém fica fora dos cálculos.
        $notaValor = in_array($nota, ['1', '2', '3', '4', '5'], true)
            ? (int)$nota
            : null;

        $responsavel = resolver_responsavel_pergunta(
            $pdo,
            $atendimento,
            $codigo
        );

        $upsert->execute([
            ':avaliacao_id' => $avaliacaoId,
            ':resposta_id' => (int)$resposta['id'],
            ':atendimento_id' => $atendimentoId,
            ':tipo_avaliacao' => $tipo,
            ':pergunta_numero' => (int)$resposta['pergunta_numero'],
            ':pergunta_codigo' => $codigo,
            ':nota_original' => $nota,
            ':nota_valor' => $notaValor,

            ':responsavel_usuario_id' => $responsavel['usuario_id'] ?? null,
            ':responsavel_nome' => $responsavel['usuario_nome'] ?? null,
            ':responsavel_login' => $responsavel['usuario_login'] ?? null,
            ':responsavel_cargo' => $responsavel['usuario_cargo'] ?? null,

            ':fase_referencia' => $responsavel['fase_referencia'] ?? null,
            ':fonte_responsavel' => $responsavel['fonte'] ?? 'nao_identificado',
            ':fonte_detalhe' => $responsavel['fonte_detalhe'] ?? null,
            ':data_referencia' => $responsavel['data_referencia'] ?? null,

            ':avaliador_id' => (int)($avaliacao['visitante_id'] ?? 0) ?: null,
            ':avaliador_nome' => trim((string)($avaliacao['visitante_nome'] ?? '')) ?: null,
        ]);
    }
}

function registro_rows(PDO $pdo, int $visitaId): array {

    $st = $pdo->prepare("
        SELECT
            id,
            foto_url,
            legenda,
            ordem,
            criado_em
          FROM visita_avaliacao_registros
         WHERE visita_id = :visita_id
         ORDER BY ordem ASC, id ASC
    ");
    $st->execute([':visita_id' => $visitaId]);

    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($rows as &$row) {
        $row['id'] = (int)$row['id'];
        $row['ordem'] = (int)$row['ordem'];
    }
    unset($row);

    return $rows;
}

function public_upload_url(string $relative): string {
    return 'https://api.planoassistencialintegrado.com.br/' . ltrim($relative, '/');
}

function salvar_foto_visita(array $file, int $atendimentoId, int $visitaId, int $pergunta): string {
    if (
        !isset($file['error'])
        || (int)$file['error'] !== UPLOAD_ERR_OK
        || empty($file['tmp_name'])
    ) {
        throw new RuntimeException("Foto inválida da pergunta {$pergunta}.");
    }

    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > 5 * 1024 * 1024) {
        throw new RuntimeException("A foto da pergunta {$pergunta} excede o limite de 5 MB.");
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string)$finfo->file($file['tmp_name']);

    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        throw new RuntimeException("Formato de foto inválido na pergunta {$pergunta}.");
    }

    $baseDir = __DIR__ . '/uploads/visitas/' . date('Y/m');
    if (!is_dir($baseDir) && !@mkdir($baseDir, 0755, true) && !is_dir($baseDir)) {
        throw new RuntimeException('Não foi possível criar a pasta de fotos da visita.');
    }

    $name =
        'visita-'
        . $visitaId
        . '-atendimento-'
        . $atendimentoId
        . '-q'
        . $pergunta
        . '-'
        . bin2hex(random_bytes(8))
        . '.jpg';

    $target = $baseDir . '/' . $name;

    // O frontend já envia JPEG carimbado. Rejeitamos extensões declaradas
    // e usamos apenas o MIME real + nome gerado pelo servidor.
    if ($mime === 'image/jpeg') {
        if (!move_uploaded_file($file['tmp_name'], $target)) {
            throw new RuntimeException("Falha ao salvar a foto da pergunta {$pergunta}.");
        }
    } else {
        // PNG/WebP só entram como compatibilidade defensiva.
        // Não alteramos o conteúdo sem GD/Imagick; a extensão acompanha o MIME real.
        $ext = $mime === 'image/png' ? 'png' : 'webp';
        $target = preg_replace('/\.jpg$/', '.' . $ext, $target);
        $name = preg_replace('/\.jpg$/', '.' . $ext, $name);

        if (!move_uploaded_file($file['tmp_name'], $target)) {
            throw new RuntimeException("Falha ao salvar a foto da pergunta {$pergunta}.");
        }
    }

    $relative = 'uploads/visitas/' . date('Y/m') . '/' . $name;
    return public_upload_url($relative);
}

function salvar_foto_registro(array $file, int $atendimentoId, int $visitaId): string {
    if (
        !isset($file['error'])
        || (int)$file['error'] !== UPLOAD_ERR_OK
        || empty($file['tmp_name'])
    ) {
        throw new RuntimeException('Registro fotográfico inválido.');
    }

    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > 5 * 1024 * 1024) {
        throw new RuntimeException('O registro fotográfico excede o limite de 5 MB.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string)$finfo->file($file['tmp_name']);

    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        throw new RuntimeException('Formato de registro fotográfico inválido.');
    }

    $baseDir = __DIR__ . '/uploads/visitas/' . date('Y/m');
    if (!is_dir($baseDir) && !@mkdir($baseDir, 0755, true) && !is_dir($baseDir)) {
        throw new RuntimeException('Não foi possível criar a pasta de registros da visita.');
    }

    $ext = $mime === 'image/png'
        ? 'png'
        : ($mime === 'image/webp' ? 'webp' : 'jpg');

    $name =
        'visita-'
        . $visitaId
        . '-atendimento-'
        . $atendimentoId
        . '-registro-'
        . bin2hex(random_bytes(8))
        . '.'
        . $ext;

    $target = $baseDir . '/' . $name;

    if (!move_uploaded_file($file['tmp_name'], $target)) {
        throw new RuntimeException('Falha ao salvar o registro fotográfico.');
    }

    $relative = 'uploads/visitas/' . date('Y/m') . '/' . $name;
    return public_upload_url($relative);
}

function payload_multipart(): array {
    $raw = (string)($_POST['payload'] ?? '');
    if ($raw === '') {
        responder(['erro' => true, 'msg' => 'Payload ausente.'], 400);
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        responder(['erro' => true, 'msg' => 'Payload JSON inválido.'], 400);
    }

    return $data;
}

function payload_json(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode((string)$raw, true);

    if (!is_array($data)) {
        responder(['erro' => true, 'msg' => 'JSON inválido.'], 400);
    }

    return $data;
}

function validar_nota($value): ?string {
    if ($value === null || $value === '') return null;
    $s = trim((string)$value);

    return in_array($s, ['1', '2', '3', '4', '5', 'nao_sei'], true)
        ? $s
        : null;
}

function grau_parentesco_valido(string $value): bool {
    return in_array($value, [
        'Cônjuge/companheiro(a)',
        'Filho(a)',
        'Pai/Mãe',
        'Irmão(ã)',
        'Neto(a)',
        'Avô/Avó',
        'Outro parente',
        'Amigo/não-parente',
    ], true);
}

// ===== CONFIGURAÇÃO PRIVADA / DB =====
$PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';

if (!is_file($PAI_CHAVES_FILE) || !is_readable($PAI_CHAVES_FILE)) {
    responder([
        'erro' => true,
        'msg' => 'Arquivo privado de configuração não encontrado ou sem permissão de leitura.',
    ], 500);
}

$PAI_CONFIG = require $PAI_CHAVES_FILE;

if (!is_array($PAI_CONFIG)) {
    responder(['erro' => true, 'msg' => 'Arquivo privado de configuração inválido.'], 500);
}

$servername = trim((string)($PAI_CONFIG['db_host'] ?? ''));
$username = trim((string)($PAI_CONFIG['db_user'] ?? ''));
$password = (string)($PAI_CONFIG['db_password'] ?? '');
$dbname = trim((string)($PAI_CONFIG['db_name'] ?? ''));

if ($servername === '' || $username === '' || $password === '' || $dbname === '') {
    responder(['erro' => true, 'msg' => 'Configuração de banco incompleta.'], 500);
}

try {
    $pdo = new PDO(
        "mysql:host={$servername};dbname={$dbname};charset=utf8mb4",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (Throwable $e) {
    responder(['erro' => true, 'msg' => 'Erro ao conectar ao banco de dados.'], 500);
}

foreach (['usuarios', 'sepultamentos', 'telemetria', 'visitas_avaliacao', 'visita_avaliacao_respostas', 'visita_avaliacao_registros', 'avaliacao_notas_colaboradores'] as $requiredTable) {
    if (!table_exists($pdo, $requiredTable)) {
        responder([
            'erro' => true,
            'msg' => "Tabela obrigatória ausente: {$requiredTable}. Execute primeiro o SQL da visita.",
        ], 500);
    }
}

foreach ([
    ['visitas_avaliacao', 'observacao_geral'],
    ['visitas_avaliacao', 'tipo'],
    ['visita_avaliacao_respostas', 'pergunta_codigo'],
] as [$tabelaMigracao, $colunaMigracao]) {
    if (!column_exists($pdo, $tabelaMigracao, $colunaMigracao)) {
        responder([
            'erro' => true,
            'msg' => "Migração pendente: {$tabelaMigracao}.{$colunaMigracao} não encontrada. Execute avaliacao_migracao.sql.",
        ], 500);
    }
}

$action = trim((string)($_GET['action'] ?? ''));

/* ============================================================
   DASHBOARD DE AVALIAÇÕES
   ============================================================ */

function dashboard_data_valida($value, string $fallback): string {
    $s = trim((string)$value);

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
        return $fallback;
    }

    [$y, $m, $d] = array_map('intval', explode('-', $s));

    return checkdate($m, $d, $y) ? $s : $fallback;
}

function dashboard_tipo($value): string {
    $s = strtolower(trim((string)$value));

    if ($s === '' || $s === 'todos') {
        return 'todos';
    }

    if ($s === 'visita') {
        return 'visita';
    }

    if (in_array($s, ['pos_atendimento', 'pos-atendimento', 'pos'], true)) {
        return 'pos_atendimento';
    }

    responder([
        'erro' => true,
        'msg' => 'Tipo de avaliação inválido.',
    ], 400);
}

function dashboard_pergunta_titulo(string $codigo): string {
    $map = [
        'primeiro_atendimento' => 'Primeiro atendimento',
        'remocao' => 'Remoção',
        'preparacao' => 'Preparação',
        'apresentacao_corpo' => 'Apresentação do corpo',
        'cerimonia_horario' => 'Cerimônia no horário',
        'montagem_ambiente' => 'Montagem do ambiente',
        'sepultamento' => 'Sepultamento',
    ];

    return $map[$codigo] ?? $codigo;
}

function dashboard_pergunta_ordem(string $codigo): int {
    $map = [
        'primeiro_atendimento' => 1,
        'remocao' => 2,
        'preparacao' => 3,
        'apresentacao_corpo' => 4,
        'cerimonia_horario' => 5,
        'montagem_ambiente' => 6,
        'sepultamento' => 7,
    ];

    return $map[$codigo] ?? 999;
}

if (
    ($_SERVER['REQUEST_METHOD'] ?? '') === 'GET'
    && $action === 'dashboard'
) {
    $dashboardStage = 'inicio';

    try {
        $dashboardStage = 'autenticacao';
        $userDashboard = usuario_atual($pdo);

    $podeVisita = usuario_tem_permissao_avaliacao(
        $pdo,
        $userDashboard,
        'visita'
    );

    $podePos = usuario_tem_permissao_avaliacao(
        $pdo,
        $userDashboard,
        'pos_atendimento'
    );

    if (!$podeVisita && !$podePos) {
        responder([
            'erro' => true,
            'msg' => 'Usuário sem permissão para visualizar avaliações.',
        ], 403);
    }

    $hoje = date('Y-m-d');
    $primeiroDiaMes = date('Y-m-01');

    $dataDe = dashboard_data_valida(
        $_GET['data_de'] ?? '',
        $primeiroDiaMes
    );
    $dataAte = dashboard_data_valida(
        $_GET['data_ate'] ?? '',
        $hoje
    );

    if ($dataAte < $dataDe) {
        [$dataDe, $dataAte] = [$dataAte, $dataDe];
    }

    $inicio = $dataDe . ' 00:00:00';
    $fim = $dataAte . ' 23:59:59';

    $tipoDashboard = dashboard_tipo($_GET['tipo'] ?? 'todos');

    if ($tipoDashboard === 'visita' && !$podeVisita) {
        responder([
            'erro' => true,
            'msg' => 'Usuário sem permissão para visualizar Visita.',
        ], 403);
    }

    if ($tipoDashboard === 'pos_atendimento' && !$podePos) {
        responder([
            'erro' => true,
            'msg' => 'Usuário sem permissão para visualizar Pós-Atendimento.',
        ], 403);
    }

    $tiposPermitidos = [];

    if (
        $podeVisita
        && in_array($tipoDashboard, ['todos', 'visita'], true)
    ) {
        $tiposPermitidos[] = 'visita';
    }

    if (
        $podePos
        && in_array($tipoDashboard, ['todos', 'pos_atendimento'], true)
    ) {
        $tiposPermitidos[] = 'pos_atendimento';
    }

    if (!$tiposPermitidos) {
        responder([
            'erro' => true,
            'msg' => 'Nenhum tipo de avaliação disponível para este usuário.',
        ], 403);
    }

    $avaliadorId = max(0, (int)($_GET['avaliador_id'] ?? 0));

    // --------------------------------------------------------
    // Atendimentos do período
    // A data de criação é derivada do primeiro evento do histórico.
    // --------------------------------------------------------
    $dashboardStage = 'atendimentos_periodo';
    $atendimentos = [];

    if (table_exists($pdo, 'historico_sepultamentos')) {
        $stAt = $pdo->prepare("
            SELECT
                s.id,
                s.realiza_velorio,
                s.realiza_sepultamento
              FROM sepultamentos s
              INNER JOIN (
                    SELECT
                        sepultamento_id,
                        MIN(datahora) AS criacao
                      FROM historico_sepultamentos
                     GROUP BY sepultamento_id
              ) h
                ON h.sepultamento_id = s.id
             WHERE h.criacao >= ?
               AND h.criacao <= ?
        ");
        $stAt->execute([$inicio, $fim]);
        $atendimentos = $stAt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    $atendimentoIds = [];
    $atendimentosComVelorio = 0;
    $atendimentosComSepultamento = 0;

    foreach ($atendimentos as $at) {
        $idAt = (int)($at['id'] ?? 0);
        if ($idAt > 0) {
            $atendimentoIds[] = $idAt;
        }

        if (!visita_valor_nao($at['realiza_velorio'] ?? '')) {
            $atendimentosComVelorio++;
        }

        if (visita_valor_sim($at['realiza_sepultamento'] ?? '')) {
            $atendimentosComSepultamento++;
        }
    }

    // --------------------------------------------------------
    // Status das avaliações dos atendimentos do período
    // --------------------------------------------------------
    $dashboardStage = 'status_avaliacoes';
    $statusMap = [
        'visita' => [],
        'pos_atendimento' => [],
    ];

    if ($atendimentoIds) {
        // Evita query gigante em períodos muito longos.
        foreach (array_chunk($atendimentoIds, 500) as $chunk) {
            $placeholders = implode(',', array_fill(0, count($chunk), '?'));

            $sqlStatus = "
                SELECT atendimento_id, tipo, status
                  FROM visitas_avaliacao
                 WHERE atendimento_id IN ({$placeholders})
                   AND tipo IN ('visita', 'pos_atendimento')
            ";

            $stStatus = $pdo->prepare($sqlStatus);
            $stStatus->execute($chunk);

            while ($row = $stStatus->fetch(PDO::FETCH_ASSOC)) {
                $t = (string)($row['tipo'] ?? '');
                $idAt = (int)($row['atendimento_id'] ?? 0);

                if (
                    isset($statusMap[$t])
                    && $idAt > 0
                ) {
                    $statusMap[$t][$idAt] = (string)($row['status'] ?? '');
                }
            }
        }
    }

    $visitasConcluidas = 0;
    $visitasEmAndamento = 0;
    $visitasPendentes = 0;
    $visitasNaoAplicaveis = 0;

    $posConcluidos = 0;
    $posEmAndamento = 0;
    $posPendentes = 0;

    foreach ($atendimentos as $at) {
        $idAt = (int)($at['id'] ?? 0);
        $temVelorio = !visita_valor_nao($at['realiza_velorio'] ?? '');

        $sv = $statusMap['visita'][$idAt] ?? '';

        if (!$temVelorio) {
            $visitasNaoAplicaveis++;
        } elseif ($sv === 'visitado') {
            $visitasConcluidas++;
        } elseif ($sv === 'em_andamento') {
            $visitasEmAndamento++;
        } else {
            $visitasPendentes++;
        }

        $sp = $statusMap['pos_atendimento'][$idAt] ?? '';

        if ($sp === 'visitado') {
            $posConcluidos++;
        } elseif ($sp === 'em_andamento') {
            $posEmAndamento++;
        } else {
            $posPendentes++;
        }
    }

    $denVisita = max(
        0,
        count($atendimentos) - $visitasNaoAplicaveis
    );

    $coberturaVisita = $denVisita > 0
        ? round(($visitasConcluidas / $denVisita) * 100, 1)
        : null;

    $denPos = count($atendimentos);

    $coberturaPos = $denPos > 0
        ? round(($posConcluidos / $denPos) * 100, 1)
        : null;

    // --------------------------------------------------------
    // Filtros SQL compartilhados da tabela congelada de notas
    // --------------------------------------------------------
    $whereNotas = [
        'n.criado_em >= ?',
        'n.criado_em <= ?',
    ];
    $paramsNotas = [$inicio, $fim];

    if (count($tiposPermitidos) === 1) {
        $whereNotas[] = 'n.tipo_avaliacao = ?';
        $paramsNotas[] = $tiposPermitidos[0];
    }

    if ($avaliadorId > 0) {
        $whereNotas[] = 'n.avaliador_id = ?';
        $paramsNotas[] = $avaliadorId;
    }

    $whereNotasSql = implode(' AND ', $whereNotas);

    // --------------------------------------------------------
    // Médias gerais
    // --------------------------------------------------------
    $dashboardStage = 'medias_gerais';
    $stMedias = $pdo->prepare("
        SELECT
            n.tipo_avaliacao,
            COUNT(n.nota_valor) AS quantidade,
            AVG(n.nota_valor) AS media
          FROM avaliacao_notas_colaboradores n
         WHERE {$whereNotasSql}
           AND n.nota_valor IS NOT NULL
         GROUP BY n.tipo_avaliacao
    ");
    $stMedias->execute($paramsNotas);

    $mediaVisita = null;
    $mediaPos = null;

    while ($row = $stMedias->fetch(PDO::FETCH_ASSOC)) {
        if (($row['tipo_avaliacao'] ?? '') === 'visita') {
            $mediaVisita = $row['media'] !== null
                ? round((float)$row['media'], 2)
                : null;
        }

        if (($row['tipo_avaliacao'] ?? '') === 'pos_atendimento') {
            $mediaPos = $row['media'] !== null
                ? round((float)$row['media'], 2)
                : null;
        }
    }

    // --------------------------------------------------------
    // Notas baixas / sem responsável
    // --------------------------------------------------------
    $dashboardStage = 'resumo_notas';
    $stResumoNotas = $pdo->prepare("
        SELECT
            SUM(
                CASE
                    WHEN n.nota_valor IN (1, 2) THEN 1
                    ELSE 0
                END
            ) AS notas_baixas,
            SUM(
                CASE
                    WHEN n.responsavel_usuario_id IS NULL THEN 1
                    ELSE 0
                END
            ) AS sem_responsavel
          FROM avaliacao_notas_colaboradores n
         WHERE {$whereNotasSql}
    ");
    $stResumoNotas->execute($paramsNotas);
    $rowResumoNotas = $stResumoNotas->fetch(PDO::FETCH_ASSOC) ?: [];

    // --------------------------------------------------------
    // Comparativo por pergunta
    // --------------------------------------------------------
    $dashboardStage = 'comparativo_perguntas';
    $stPerguntas = $pdo->prepare("
        SELECT
            n.pergunta_codigo,
            n.tipo_avaliacao,
            COUNT(n.nota_valor) AS quantidade,
            AVG(n.nota_valor) AS media
          FROM avaliacao_notas_colaboradores n
         WHERE {$whereNotasSql}
           AND n.nota_valor IS NOT NULL
         GROUP BY
            n.pergunta_codigo,
            n.tipo_avaliacao
    ");
    $stPerguntas->execute($paramsNotas);

    $perguntasMap = [];

    while ($row = $stPerguntas->fetch(PDO::FETCH_ASSOC)) {
        $codigo = trim((string)($row['pergunta_codigo'] ?? ''));
        if ($codigo === '') continue;

        if (!isset($perguntasMap[$codigo])) {
            $perguntasMap[$codigo] = [
                'pergunta_codigo' => $codigo,
                'pergunta_titulo' => dashboard_pergunta_titulo($codigo),
                'ordem' => dashboard_pergunta_ordem($codigo),
                'visita_media' => null,
                'visita_quantidade' => 0,
                'pos_media' => null,
                'pos_quantidade' => 0,
                'diferenca_pos_menos_visita' => null,
            ];
        }

        $media = $row['media'] !== null
            ? round((float)$row['media'], 2)
            : null;
        $qtd = (int)($row['quantidade'] ?? 0);

        if (($row['tipo_avaliacao'] ?? '') === 'visita') {
            $perguntasMap[$codigo]['visita_media'] = $media;
            $perguntasMap[$codigo]['visita_quantidade'] = $qtd;
        } elseif (($row['tipo_avaliacao'] ?? '') === 'pos_atendimento') {
            $perguntasMap[$codigo]['pos_media'] = $media;
            $perguntasMap[$codigo]['pos_quantidade'] = $qtd;
        }
    }

    foreach ($perguntasMap as &$p) {
        if (
            $p['visita_media'] !== null
            && $p['pos_media'] !== null
        ) {
            $p['diferenca_pos_menos_visita'] = round(
                (float)$p['pos_media'] - (float)$p['visita_media'],
                2
            );
        }
    }
    unset($p);

    $perguntas = array_values($perguntasMap);

    usort(
        $perguntas,
        fn(array $a, array $b): int =>
            ((int)$a['ordem']) <=> ((int)$b['ordem'])
    );

    // --------------------------------------------------------
    // Distribuição 1..5
    // --------------------------------------------------------
    $distMap = [
        '1' => ['nota' => '1', 'visita' => 0, 'pos_atendimento' => 0],
        '2' => ['nota' => '2', 'visita' => 0, 'pos_atendimento' => 0],
        '3' => ['nota' => '3', 'visita' => 0, 'pos_atendimento' => 0],
        '4' => ['nota' => '4', 'visita' => 0, 'pos_atendimento' => 0],
        '5' => ['nota' => '5', 'visita' => 0, 'pos_atendimento' => 0],
    ];

    $dashboardStage = 'distribuicao_notas';
    $stDist = $pdo->prepare("
        SELECT
            n.nota_valor,
            n.tipo_avaliacao,
            COUNT(*) AS quantidade
          FROM avaliacao_notas_colaboradores n
         WHERE {$whereNotasSql}
           AND n.nota_valor BETWEEN 1 AND 5
         GROUP BY
            n.nota_valor,
            n.tipo_avaliacao
    ");
    $stDist->execute($paramsNotas);

    while ($row = $stDist->fetch(PDO::FETCH_ASSOC)) {
        $nota = (string)(int)($row['nota_valor'] ?? 0);
        $tipoRow = (string)($row['tipo_avaliacao'] ?? '');

        if (
            isset($distMap[$nota])
            && isset($distMap[$nota][$tipoRow])
        ) {
            $distMap[$nota][$tipoRow] = (int)$row['quantidade'];
        }
    }

    // --------------------------------------------------------
    // Colaboradores
    // --------------------------------------------------------
    $dashboardStage = 'colaboradores';
    $stColab = $pdo->prepare("
        SELECT
            n.responsavel_usuario_id,
            COALESCE(
                NULLIF(n.responsavel_nome, ''),
                'Não identificado'
            ) AS responsavel_nome,
            MAX(n.responsavel_cargo) AS cargo,

            COUNT(n.nota_valor) AS quantidade_notas,

            SUM(
                CASE
                    WHEN n.tipo_avaliacao = 'visita'
                         AND n.nota_valor IS NOT NULL
                    THEN 1 ELSE 0
                END
            ) AS quantidade_visita,

            SUM(
                CASE
                    WHEN n.tipo_avaliacao = 'pos_atendimento'
                         AND n.nota_valor IS NOT NULL
                    THEN 1 ELSE 0
                END
            ) AS quantidade_pos,

            AVG(
                CASE
                    WHEN n.tipo_avaliacao = 'visita'
                    THEN n.nota_valor
                    ELSE NULL
                END
            ) AS media_visita,

            AVG(
                CASE
                    WHEN n.tipo_avaliacao = 'pos_atendimento'
                    THEN n.nota_valor
                    ELSE NULL
                END
            ) AS media_pos

          FROM avaliacao_notas_colaboradores n
         WHERE {$whereNotasSql}
           AND n.nota_valor IS NOT NULL
         GROUP BY
            n.responsavel_usuario_id,
            n.responsavel_nome
         ORDER BY quantidade_notas DESC, responsavel_nome ASC
         LIMIT 200
    ");
    $stColab->execute($paramsNotas);

    $colaboradores = [];

    while ($row = $stColab->fetch(PDO::FETCH_ASSOC)) {
        $colaboradores[] = [
            'usuario_id' => $row['responsavel_usuario_id'] !== null
                ? (int)$row['responsavel_usuario_id']
                : null,
            'nome' => (string)$row['responsavel_nome'],
            'cargo' => $row['cargo'] !== null
                ? (string)$row['cargo']
                : null,
            'quantidade_notas' => (int)$row['quantidade_notas'],
            'quantidade_visita' => (int)$row['quantidade_visita'],
            'quantidade_pos' => (int)$row['quantidade_pos'],
            'media_visita' => $row['media_visita'] !== null
                ? round((float)$row['media_visita'], 2)
                : null,
            'media_pos' => $row['media_pos'] !== null
                ? round((float)$row['media_pos'], 2)
                : null,
        ];
    }

    // --------------------------------------------------------
    // Notas 1 e 2
    // --------------------------------------------------------
    $dashboardStage = 'alertas';
    $stAlertas = $pdo->prepare("
        SELECT
            n.atendimento_id,
            s.falecido,
            n.tipo_avaliacao,
            n.pergunta_codigo,
            n.nota_valor,
            n.responsavel_nome,
            n.avaliador_nome,
            n.criado_em
          FROM avaliacao_notas_colaboradores n
          INNER JOIN sepultamentos s
            ON s.id = n.atendimento_id
         WHERE {$whereNotasSql}
           AND n.nota_valor IN (1, 2)
         ORDER BY n.criado_em DESC, n.id DESC
         LIMIT 100
    ");
    $stAlertas->execute($paramsNotas);

    $alertas = [];

    while ($row = $stAlertas->fetch(PDO::FETCH_ASSOC)) {
        $codigo = (string)$row['pergunta_codigo'];

        $alertas[] = [
            'atendimento_id' => (int)$row['atendimento_id'],
            'falecido' => (string)($row['falecido'] ?? ''),
            'tipo_avaliacao' => (string)$row['tipo_avaliacao'],
            'pergunta_codigo' => $codigo,
            'pergunta_titulo' => dashboard_pergunta_titulo($codigo),
            'nota' => (int)$row['nota_valor'],
            'responsavel_nome' => $row['responsavel_nome'],
            'avaliador_nome' => $row['avaliador_nome'],
            'criado_em' => $row['criado_em'],
        ];
    }

    // --------------------------------------------------------
    // Divergências Visita x Pós do mesmo atendimento/pergunta
    // --------------------------------------------------------
    $paramsDiv = [$inicio, $fim];

    if ($avaliadorId > 0) {
        $filtroAvaliadorDiv = ' AND n.avaliador_id = ? ';
        $paramsDiv[] = $avaliadorId;
    } else {
        $filtroAvaliadorDiv = '';
    }

    $dashboardStage = 'divergencias';
    $stDiv = $pdo->prepare("
        SELECT
            x.atendimento_id,
            s.falecido,
            x.pergunta_codigo,
            x.visita_nota,
            x.pos_nota,
            (CAST(x.pos_nota AS SIGNED) - CAST(x.visita_nota AS SIGNED)) AS diferenca,
            x.responsavel_nome
          FROM (
                SELECT
                    n.atendimento_id,
                    n.pergunta_codigo,
                    MAX(
                        CASE
                            WHEN n.tipo_avaliacao = 'visita'
                            THEN n.nota_valor
                            ELSE NULL
                        END
                    ) AS visita_nota,
                    MAX(
                        CASE
                            WHEN n.tipo_avaliacao = 'pos_atendimento'
                            THEN n.nota_valor
                            ELSE NULL
                        END
                    ) AS pos_nota,
                    MAX(n.responsavel_nome) AS responsavel_nome
                  FROM avaliacao_notas_colaboradores n
                 WHERE n.criado_em >= ?
                   AND n.criado_em <= ?
                   AND n.nota_valor IS NOT NULL
                   {$filtroAvaliadorDiv}
                 GROUP BY
                    n.atendimento_id,
                    n.pergunta_codigo
          ) x
          INNER JOIN sepultamentos s
            ON s.id = x.atendimento_id
         WHERE x.visita_nota IS NOT NULL
           AND x.pos_nota IS NOT NULL
         ORDER BY ABS(CAST(x.pos_nota AS SIGNED) - CAST(x.visita_nota AS SIGNED)) DESC
         LIMIT 100
    ");
    $stDiv->execute($paramsDiv);

    $divergencias = [];

    while ($row = $stDiv->fetch(PDO::FETCH_ASSOC)) {
        $codigo = (string)$row['pergunta_codigo'];

        $divergencias[] = [
            'atendimento_id' => (int)$row['atendimento_id'],
            'falecido' => (string)($row['falecido'] ?? ''),
            'pergunta_codigo' => $codigo,
            'pergunta_titulo' => dashboard_pergunta_titulo($codigo),
            'visita_nota' => $row['visita_nota'] !== null
                ? (float)$row['visita_nota']
                : null,
            'pos_nota' => $row['pos_nota'] !== null
                ? (float)$row['pos_nota']
                : null,
            'diferenca' => $row['diferenca'] !== null
                ? round((float)$row['diferenca'], 2)
                : null,
            'responsavel_nome' => $row['responsavel_nome'],
        ];
    }

    // --------------------------------------------------------
    // Evolução diária
    // --------------------------------------------------------
    $dashboardStage = 'evolucao';
    $stEvolucao = $pdo->prepare("
        SELECT
            DATE(n.criado_em) AS dia,
            n.tipo_avaliacao,
            COUNT(n.nota_valor) AS quantidade,
            AVG(n.nota_valor) AS media
          FROM avaliacao_notas_colaboradores n
         WHERE {$whereNotasSql}
           AND n.nota_valor IS NOT NULL
         GROUP BY
            DATE(n.criado_em),
            n.tipo_avaliacao
         ORDER BY dia ASC
    ");
    $stEvolucao->execute($paramsNotas);

    $evolucaoMap = [];

    while ($row = $stEvolucao->fetch(PDO::FETCH_ASSOC)) {
        $dia = (string)$row['dia'];
        if ($dia === '') continue;

        if (!isset($evolucaoMap[$dia])) {
            $dt = DateTime::createFromFormat('Y-m-d', $dia);

            $evolucaoMap[$dia] = [
                'periodo' => $dt ? $dt->format('d/m') : $dia,
                'visita_media' => null,
                'pos_media' => null,
                'visitas' => 0,
                'pos' => 0,
            ];
        }

        if (($row['tipo_avaliacao'] ?? '') === 'visita') {
            $evolucaoMap[$dia]['visita_media'] = $row['media'] !== null
                ? round((float)$row['media'], 2)
                : null;
            $evolucaoMap[$dia]['visitas'] = (int)$row['quantidade'];
        } elseif (($row['tipo_avaliacao'] ?? '') === 'pos_atendimento') {
            $evolucaoMap[$dia]['pos_media'] = $row['media'] !== null
                ? round((float)$row['media'], 2)
                : null;
            $evolucaoMap[$dia]['pos'] = (int)$row['quantidade'];
        }
    }

    // --------------------------------------------------------
    // Avaliadores disponíveis
    // --------------------------------------------------------
    $dashboardStage = 'avaliadores';
    $stAvaliadores = $pdo->prepare("
        SELECT DISTINCT
            v.visitante_id AS id,
            v.visitante_nome AS nome
          FROM visitas_avaliacao v
         WHERE v.inicio_em >= ?
           AND v.inicio_em <= ?
           AND v.visitante_id IS NOT NULL
           AND v.visitante_id > 0
         ORDER BY nome ASC
    ");
    $stAvaliadores->execute([$inicio, $fim]);

    $avaliadores = [];

    while ($row = $stAvaliadores->fetch(PDO::FETCH_ASSOC)) {
        $avaliadores[] = [
            'id' => (int)$row['id'],
            'nome' => (string)($row['nome'] ?? ''),
        ];
    }

        $dashboardStage = 'resposta';
        responder([
            'sucesso' => true,
            'periodo' => [
                'de' => $dataDe,
                'ate' => $dataAte,
            ],
            'permissoes' => [
                'visita' => $podeVisita,
                'pos_atendimento' => $podePos,
            ],
            'resumo' => [
                'atendimentos_total' => count($atendimentos),
                'atendimentos_com_velorio' => $atendimentosComVelorio,
                'atendimentos_com_sepultamento' => $atendimentosComSepultamento,

                'visitas_concluidas' => $visitasConcluidas,
                'visitas_pendentes' => $visitasPendentes,
                'visitas_em_andamento' => $visitasEmAndamento,
                'visitas_nao_aplicaveis' => $visitasNaoAplicaveis,

                'pos_concluidos' => $posConcluidos,
                'pos_pendentes' => $posPendentes,
                'pos_em_andamento' => $posEmAndamento,

                'cobertura_visita_pct' => $coberturaVisita,
                'cobertura_pos_pct' => $coberturaPos,

                'media_visita' => $mediaVisita,
                'media_pos' => $mediaPos,

                'notas_baixas' => (int)($rowResumoNotas['notas_baixas'] ?? 0),
                'sem_responsavel' => (int)($rowResumoNotas['sem_responsavel'] ?? 0),
            ],
            'perguntas' => $perguntas,
            'distribuicao_notas' => array_values($distMap),
            'colaboradores' => $colaboradores,
            'alertas' => $alertas,
            'divergencias' => $divergencias,
            'evolucao' => array_values($evolucaoMap),
            'avaliadores' => $avaliadores,
        ]);
    } catch (Throwable $e) {
        // Retorna JSON válido em vez de deixar uma exceção PDO virar HTML/500 genérico.
        // A etapa ajuda a localizar exatamente qual consulta falhou.
        responder([
            'erro' => true,
            'msg' => 'Falha no dashboard [' . $dashboardStage . ']: ' . $e->getMessage(),
            'etapa' => $dashboardStage,
        ], 500);
    }
}

/* ============================================================
   PAINEL DE ATENDIMENTOS — LEITURA DAS AVALIAÇÕES (somente leitura)
   ------------------------------------------------------------
   Uso:
   GET visita.php?action=painel_avaliacoes&data_de=AAAA-MM-DD&data_ate=AAAA-MM-DD

   Devolve, para os atendimentos CRIADOS no período (mesma regra de
   data do dashboard e do balanco.php: primeiro evento do histórico):
   - avaliacoes: as avaliações de visita e pós-atendimento;
   - notas: as notas congeladas por colaborador (avaliacao_notas_colaboradores),
     já com a pergunta e o responsável de cada nota.
   Só devolve os tipos que o usuário tem permissão de ver.
   ============================================================ */
if (
    ($_SERVER['REQUEST_METHOD'] ?? '') === 'GET'
    && $action === 'painel_avaliacoes'
) {
    $etapaPainel = 'inicio';

    try {
        $etapaPainel = 'autenticacao';
        $userPainel = usuario_atual($pdo);

        $podeVisitaPainel = usuario_tem_permissao_avaliacao($pdo, $userPainel, 'visita');
        $podePosPainel = usuario_tem_permissao_avaliacao($pdo, $userPainel, 'pos_atendimento');

        if (!$podeVisitaPainel && !$podePosPainel) {
            responder([
                'erro' => true,
                'msg' => 'Usuário sem permissão para visualizar avaliações.',
                'sem_permissao' => true,
            ], 403);
        }

        $tiposPainel = [];
        if ($podeVisitaPainel) $tiposPainel[] = 'visita';
        if ($podePosPainel) $tiposPainel[] = 'pos_atendimento';

        $hojePainel = date('Y-m-d');
        $dataDePainel = dashboard_data_valida($_GET['data_de'] ?? '', date('Y-m-01'));
        $dataAtePainel = dashboard_data_valida($_GET['data_ate'] ?? '', $hojePainel);

        if ($dataAtePainel < $dataDePainel) {
            [$dataDePainel, $dataAtePainel] = [$dataAtePainel, $dataDePainel];
        }

        // Atendimentos criados no período (primeiro evento do histórico).
        $etapaPainel = 'atendimentos_periodo';
        $idsPainel = [];

        if (table_exists($pdo, 'historico_sepultamentos')) {
            $stIds = $pdo->prepare("
                SELECT sepultamento_id
                  FROM historico_sepultamentos
                 GROUP BY sepultamento_id
                HAVING MIN(datahora) >= ?
                   AND MIN(datahora) <= ?
            ");
            $stIds->execute([$dataDePainel . ' 00:00:00', $dataAtePainel . ' 23:59:59']);

            while ($row = $stIds->fetch(PDO::FETCH_ASSOC)) {
                $idAt = (int)($row['sepultamento_id'] ?? 0);
                if ($idAt > 0) $idsPainel[] = $idAt;
            }
        }

        $avaliacoesPainel = [];
        $notasPainel = [];

        if ($idsPainel) {
            $phTipos = implode(',', array_fill(0, count($tiposPainel), '?'));

            foreach (array_chunk($idsPainel, 500) as $chunk) {
                $phIds = implode(',', array_fill(0, count($chunk), '?'));

                $etapaPainel = 'avaliacoes';
                $stAv = $pdo->prepare("
                    SELECT
                        id,
                        atendimento_id,
                        tipo,
                        falecido_nome,
                        visitante_id,
                        visitante_nome,
                        visitante_cargo,
                        status,
                        inicio_em,
                        fim_em,
                        duracao_segundos,
                        fase08_em,
                        tempo_fase08_ate_visita_segundos,
                        com_quem_conversou,
                        grau_parentesco,
                        observacao_geral
                      FROM visitas_avaliacao
                     WHERE atendimento_id IN ({$phIds})
                       AND tipo IN ({$phTipos})
                ");
                $stAv->execute(array_merge($chunk, $tiposPainel));

                while ($row = $stAv->fetch(PDO::FETCH_ASSOC)) {
                    $avaliacoesPainel[] = [
                        'id' => (int)$row['id'],
                        'atendimento_id' => (int)$row['atendimento_id'],
                        'tipo' => (string)$row['tipo'],
                        'falecido_nome' => (string)($row['falecido_nome'] ?? ''),
                        'avaliador_id' => $row['visitante_id'] !== null ? (int)$row['visitante_id'] : null,
                        'avaliador_nome' => (string)($row['visitante_nome'] ?? ''),
                        'avaliador_cargo' => (string)($row['visitante_cargo'] ?? ''),
                        'status' => (string)($row['status'] ?? ''),
                        'inicio_em' => $row['inicio_em'],
                        'fim_em' => $row['fim_em'],
                        'duracao_segundos' => $row['duracao_segundos'] !== null ? (int)$row['duracao_segundos'] : null,
                        'fase08_em' => $row['fase08_em'],
                        'tempo_fase08_ate_visita_segundos' => $row['tempo_fase08_ate_visita_segundos'] !== null
                            ? (int)$row['tempo_fase08_ate_visita_segundos']
                            : null,
                        'com_quem_conversou' => $row['com_quem_conversou'],
                        'grau_parentesco' => $row['grau_parentesco'],
                        'observacao_geral' => $row['observacao_geral'],
                    ];
                }

                $etapaPainel = 'notas';
                $stNotas = $pdo->prepare("
                    SELECT
                        avaliacao_id,
                        atendimento_id,
                        tipo_avaliacao,
                        pergunta_numero,
                        pergunta_codigo,
                        nota_original,
                        nota_valor,
                        responsavel_usuario_id,
                        responsavel_nome,
                        responsavel_login,
                        fase_referencia,
                        avaliador_nome,
                        criado_em
                      FROM avaliacao_notas_colaboradores
                     WHERE atendimento_id IN ({$phIds})
                       AND tipo_avaliacao IN ({$phTipos})
                ");
                $stNotas->execute(array_merge($chunk, $tiposPainel));

                while ($row = $stNotas->fetch(PDO::FETCH_ASSOC)) {
                    $codigo = (string)($row['pergunta_codigo'] ?? '');

                    $notasPainel[] = [
                        'avaliacao_id' => (int)$row['avaliacao_id'],
                        'atendimento_id' => (int)$row['atendimento_id'],
                        'tipo_avaliacao' => (string)$row['tipo_avaliacao'],
                        'pergunta_numero' => (int)$row['pergunta_numero'],
                        'pergunta_codigo' => $codigo,
                        'pergunta_titulo' => dashboard_pergunta_titulo($codigo),
                        'nota_original' => (string)($row['nota_original'] ?? ''),
                        // NULL = "Não sei": fica fora das médias.
                        'nota_valor' => $row['nota_valor'] !== null ? (int)$row['nota_valor'] : null,
                        'responsavel_usuario_id' => $row['responsavel_usuario_id'] !== null
                            ? (int)$row['responsavel_usuario_id']
                            : null,
                        'responsavel_nome' => $row['responsavel_nome'],
                        'responsavel_login' => $row['responsavel_login'],
                        'fase_referencia' => $row['fase_referencia'],
                        'avaliador_nome' => $row['avaliador_nome'],
                        'criado_em' => $row['criado_em'],
                    ];
                }
            }
        }

        $etapaPainel = 'resposta';
        responder([
            'sucesso' => true,
            'periodo' => ['de' => $dataDePainel, 'ate' => $dataAtePainel],
            'permissoes' => [
                'visita' => $podeVisitaPainel,
                'pos_atendimento' => $podePosPainel,
            ],
            'avaliacoes' => $avaliacoesPainel,
            'notas' => $notasPainel,
        ]);
    } catch (Throwable $e) {
        responder([
            'erro' => true,
            'msg' => 'Falha ao carregar as avaliações [' . $etapaPainel . ']: ' . $e->getMessage(),
            'etapa' => $etapaPainel,
        ], 500);
    }
}

$tipo = normalizar_tipo_avaliacao($_GET['tipo'] ?? 'visita');

// ===== ME =====
// Compatível com a Visita atual e já informa as duas permissões.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && $action === 'me') {
    $user = usuario_atual($pdo);

    $podeVisita = usuario_tem_permissao_avaliacao($pdo, $user, 'visita');
    $podePos = usuario_tem_permissao_avaliacao($pdo, $user, 'pos_atendimento');

    responder([
        'sucesso' => true,
        'autenticado' => true,
        'autorizado' => $tipo === 'pos_atendimento' ? $podePos : $podeVisita,
        'tipo' => $tipo,
        'permissoes_avaliacao' => [
            'visita' => $podeVisita,
            'pos_atendimento' => $podePos,
        ],
        'id' => (int)$user['id'],
        'nome' => (string)($user['nome'] ?? ''),
        'usuario' => (string)($user['usuario'] ?? ''),
        'cargo' => (string)($user['cargo'] ?? ''),
    ]);
}

// ===== STATUS DAS DUAS AVALIAÇÕES PARA RELATÓRIO =====
// Não altera o status_batch usado pela tela de acompanhamento.
if (
    ($_SERVER['REQUEST_METHOD'] ?? '') === 'GET'
    && $action === 'status_avaliacoes_batch'
) {
    $userStatus = usuario_atual($pdo);
    $podeVisita = usuario_tem_permissao_avaliacao($pdo, $userStatus, 'visita');
    $podePos = usuario_tem_permissao_avaliacao($pdo, $userStatus, 'pos_atendimento');

    if (!$podeVisita && !$podePos) {
        responder([
            'erro' => true,
            'msg' => 'Usuário sem permissão para avaliações.',
        ], 403);
    }

    $rawIds = trim((string)($_GET['ids'] ?? ''));
    $ids = [];

    foreach (explode(',', $rawIds) as $part) {
        $n = (int)trim($part);
        if ($n > 0) $ids[$n] = true;
    }

    $ids = array_keys($ids);

    if (count($ids) > 300) {
        responder(['erro' => true, 'msg' => 'Máximo de 300 atendimentos por consulta.'], 400);
    }

    if (!$ids) {
        responder([
            'sucesso' => true,
            'permissoes' => [
                'visita' => $podeVisita,
                'pos_atendimento' => $podePos,
            ],
            'rows' => [],
        ]);
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    $st = $pdo->prepare("
        SELECT
            s.id AS atendimento_id,
            s.realiza_velorio,
            s.realiza_sepultamento,

            vv.status AS visita_status_banco,
            vv.visitante_id AS visita_avaliador_id,
            vv.visitante_nome AS visita_avaliador_nome,
            vv.fim_em AS visita_fim_em,

            vp.status AS pos_status_banco,
            vp.visitante_id AS pos_avaliador_id,
            vp.visitante_nome AS pos_avaliador_nome,
            vp.fim_em AS pos_fim_em

          FROM sepultamentos s

          LEFT JOIN visitas_avaliacao vv
            ON vv.atendimento_id = s.id
           AND vv.tipo = 'visita'

          LEFT JOIN visitas_avaliacao vp
            ON vp.atendimento_id = s.id
           AND vp.tipo = 'pos_atendimento'

         WHERE s.id IN ({$placeholders})
    ");
    $st->execute($ids);

    $rows = [];

    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $visitaBanco = strtolower(trim((string)($row['visita_status_banco'] ?? '')));
        $posBanco = strtolower(trim((string)($row['pos_status_banco'] ?? '')));

        if ($visitaBanco === 'visitado') {
            $visitaStatus = 'concluida';
        } elseif ($visitaBanco === 'em_andamento') {
            $visitaStatus = 'em_andamento';
        } elseif (visita_valor_nao($row['realiza_velorio'] ?? '')) {
            $visitaStatus = 'nao_aplicavel';
        } else {
            // No relatório histórico, se houve velório e não existe avaliação,
            // a visita é pendente mesmo que a fase08 já tenha passado.
            $visitaStatus = 'pendente';
        }

        if ($posBanco === 'visitado') {
            $posStatus = 'concluida';
        } elseif ($posBanco === 'em_andamento') {
            $posStatus = 'em_andamento';
        } else {
            $posStatus = 'pendente';
        }

        $rows[] = [
            'atendimento_id' => (int)$row['atendimento_id'],
            'visita' => $podeVisita ? [
                'status' => $visitaStatus,
                'avaliador_id' => $row['visita_avaliador_id'] !== null
                    ? (int)$row['visita_avaliador_id']
                    : null,
                'avaliador_nome' => $row['visita_avaliador_nome'] ?? null,
                'fim_em' => $row['visita_fim_em'] ?? null,
            ] : null,
            'pos_atendimento' => $podePos ? [
                'status' => $posStatus,
                'avaliador_id' => $row['pos_avaliador_id'] !== null
                    ? (int)$row['pos_avaliador_id']
                    : null,
                'avaliador_nome' => $row['pos_avaliador_nome'] ?? null,
                'fim_em' => $row['pos_fim_em'] ?? null,
            ] : null,
        ];
    }

    responder([
        'sucesso' => true,
        'permissoes' => [
            'visita' => $podeVisita,
            'pos_atendimento' => $podePos,
        ],
        'rows' => $rows,
    ]);
}

// A partir daqui a autorização depende do tipo solicitado.
$user = exigir_autorizacao($pdo, $tipo);

// ===== STATUS EM LOTE =====
// Compatibilidade com o componente Visita atual.
// Sem ?tipo= continua sendo "visita".
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && $action === 'status_batch') {
    $rawIds = trim((string)($_GET['ids'] ?? ''));
    $ids = [];

    foreach (explode(',', $rawIds) as $part) {
        $n = (int)trim($part);
        if ($n > 0) $ids[$n] = true;
    }

    $ids = array_keys($ids);

    if (count($ids) > 300) {
        responder(['erro' => true, 'msg' => 'Máximo de 300 atendimentos por consulta.'], 400);
    }

    if (!$ids) {
        responder(['sucesso' => true, 'tipo' => $tipo, 'rows' => []]);
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    $sql = "
        SELECT
            s.id AS atendimento_id,
            s.status AS atendimento_status,
            s.realiza_velorio,
            s.realiza_sepultamento,
            v.status AS avaliacao_status
          FROM sepultamentos s
          LEFT JOIN visitas_avaliacao v
            ON v.atendimento_id = s.id
           AND v.tipo = ?
         WHERE s.id IN ({$placeholders})
    ";

    $st = $pdo->prepare($sql);
    $st->execute(array_merge([$tipo], $ids));

    $rows = [];

    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $avaliacaoStatus = strtolower(trim((string)($row['avaliacao_status'] ?? '')));
        $atendimentoStatus = normalize_status_code($row['atendimento_status'] ?? null);

        if ($avaliacaoStatus === 'visitado') {
            $status = 'visitado';
        } elseif ($avaliacaoStatus === 'em_andamento') {
            $status = 'em_andamento';
        } elseif ($tipo === 'visita') {
            if (
                $atendimentoStatus === 'fase08'
                && !visita_valor_nao($row['realiza_velorio'] ?? '')
            ) {
                $status = 'visitar';
            } else {
                $status = 'indisponivel';
            }
        } else {
            // Para o Pós-Atendimento, a regra fina de "quando liberar" será
            // controlada pela tela de relatório na próxima etapa.
            // No backend ele já pode ser criado para um atendimento existente.
            $status = 'avaliar';
        }

        $rows[] = [
            'atendimento_id' => (int)$row['atendimento_id'],
            'status' => $status,
        ];
    }

    responder([
        'sucesso' => true,
        'tipo' => $tipo,
        'rows' => $rows,
    ]);
}

// ===== OBTER =====
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && $action === 'obter') {
    $atendimentoId = (int)($_GET['atendimento_id'] ?? 0);
    $at = atendimento($pdo, $atendimentoId);
    $avaliacao = avaliacao_do_atendimento($pdo, $atendimentoId, $tipo);

    $respostas = $avaliacao
        ? resposta_rows($pdo, (int)$avaliacao['id'])
        : [];

    $registros = $avaliacao
        ? registro_rows($pdo, (int)$avaliacao['id'])
        : [];

    responder([
        'sucesso' => true,
        'tipo' => $tipo,
        'atendimento' => [
            'id' => (int)$at['id'],
            'falecido' => (string)($at['falecido'] ?? ''),
            'status' => (string)$at['status'],
            'tanato' => (string)($at['tanato'] ?? ''),
            'ornamentacao' => (string)($at['ornamentacao'] ?? ''),
            'realiza_velorio' => (string)($at['realiza_velorio'] ?? ''),
            'local_velorio' => (string)($at['local_velorio'] ?? ''),
            'sala_velorio' => (string)($at['sala_velorio'] ?? ''),
            'realiza_sepultamento' => (string)($at['realiza_sepultamento'] ?? ''),
        ],
        // "visita" é mantido para não quebrar o Visita.tsx atual.
        'visita' => $avaliacao,
        'avaliacao' => $avaliacao,
        'perguntas' => perguntas_aplicaveis($pdo, $at, $tipo),
        'respostas' => $respostas,
        'registros' => $registros,
    ]);
}

// ===== INICIAR =====
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && $action === 'iniciar') {
    $body = payload_json();
    $atendimentoId = (int)($body['atendimento_id'] ?? 0);
    $at = atendimento($pdo, $atendimentoId);

    $lat = null;
    $lng = null;
    $accuracy = null;

    if ($tipo === 'visita') {
        $latValidada = filter_var($body['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
        $lngValidada = filter_var($body['longitude'] ?? null, FILTER_VALIDATE_FLOAT);
        $accuracyValidada = filter_var($body['precisao_m'] ?? null, FILTER_VALIDATE_FLOAT);

        if ($latValidada === false || $lngValidada === false) {
            responder([
                'erro' => true,
                'msg' => 'Localização obrigatória para iniciar a visita.',
            ], 400);
        }

        if (
            $latValidada < -90 || $latValidada > 90
            || $lngValidada < -180 || $lngValidada > 180
        ) {
            responder([
                'erro' => true,
                'msg' => 'Coordenadas de localização inválidas.',
            ], 400);
        }

        if (visita_valor_nao($at['realiza_velorio'] ?? '')) {
            responder([
                'erro' => true,
                'msg' => 'Este atendimento não possui velório e não pode receber visita de avaliação.',
            ], 409);
        }

        if ((string)$at['status'] !== 'fase08') {
            responder([
                'erro' => true,
                'msg' => 'A visita só pode ser iniciada quando o atendimento estiver em Velando (fase08).',
            ], 409);
        }

        $lat = (float)$latValidada;
        $lng = (float)$lngValidada;
        $accuracy = $accuracyValidada === false ? null : (float)$accuracyValidada;
    }

    $existente = avaliacao_do_atendimento($pdo, $atendimentoId, $tipo);

    if ($existente) {
        responder([
            'sucesso' => true,
            'tipo' => $tipo,
            'id' => (int)$existente['id'],
            'status' => (string)$existente['status'],
            'msg' => $tipo === 'visita'
                ? 'A visita já havia sido iniciada.'
                : 'O Pós-Atendimento já havia sido iniciado.',
        ]);
    }

    $fase08Em = $tipo === 'visita'
        ? fase08_em($pdo, $atendimentoId)
        : null;

    $st = $pdo->prepare("
        INSERT INTO visitas_avaliacao (
            atendimento_id,
            tipo,
            falecido_nome,
            visitante_id,
            visitante_nome,
            visitante_usuario,
            visitante_cargo,
            status,
            inicio_em,
            latitude_inicio,
            longitude_inicio,
            precisao_inicio_m,
            fase08_em,
            tempo_fase08_ate_visita_segundos,
            criado_em,
            atualizado_em
        ) VALUES (
            :atendimento_id,
            :tipo,
            :falecido_nome,
            :visitante_id,
            :visitante_nome,
            :visitante_usuario,
            :visitante_cargo,
            'em_andamento',
            NOW(),
            :latitude,
            :longitude,
            :precisao,
            :fase08_em,
            CASE
                WHEN :fase08_em_calc IS NULL THEN NULL
                ELSE TIMESTAMPDIFF(SECOND, :fase08_em_calc2, NOW())
            END,
            NOW(),
            NOW()
        )
    ");

    try {
        $st->execute([
            ':atendimento_id' => $atendimentoId,
            ':tipo' => $tipo,
            ':falecido_nome' => (string)($at['falecido'] ?? ''),
            ':visitante_id' => (int)$user['id'],
            ':visitante_nome' => (string)($user['nome'] ?? $user['usuario'] ?? ''),
            ':visitante_usuario' => (string)($user['usuario'] ?? ''),
            ':visitante_cargo' => (string)($user['cargo'] ?? ''),
            ':latitude' => $lat,
            ':longitude' => $lng,
            ':precisao' => $accuracy,
            ':fase08_em' => $fase08Em,
            ':fase08_em_calc' => $fase08Em,
            ':fase08_em_calc2' => $fase08Em,
        ]);
    } catch (PDOException $e) {
        // UNIQUE(atendimento_id, tipo)
        if ((string)$e->getCode() === '23000') {
            $existente = avaliacao_do_atendimento($pdo, $atendimentoId, $tipo);
            if ($existente) {
                responder([
                    'sucesso' => true,
                    'tipo' => $tipo,
                    'id' => (int)$existente['id'],
                    'status' => (string)$existente['status'],
                ]);
            }
        }

        throw $e;
    }

    responder([
        'sucesso' => true,
        'tipo' => $tipo,
        'id' => (int)$pdo->lastInsertId(),
        'status' => 'em_andamento',
    ], 201);
}

// ===== RASCUNHO / FINALIZAR =====
if (
    ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'
    && in_array($action, ['salvar_rascunho', 'finalizar'], true)
) {
    $body = payload_multipart();
    $finalizar = $action === 'finalizar';

    $avaliacaoId = (int)(
        $body['avaliacao_id']
        ?? $body['visita_id']
        ?? 0
    );
    $atendimentoId = (int)($body['atendimento_id'] ?? 0);

    if ($avaliacaoId <= 0 || $atendimentoId <= 0) {
        responder([
            'erro' => true,
            'msg' => 'Avaliação ou atendimento inválido.',
        ], 400);
    }

    $at = atendimento($pdo, $atendimentoId);
    $avaliacao = avaliacao_do_atendimento($pdo, $atendimentoId, $tipo);

    if (!$avaliacao || (int)$avaliacao['id'] !== $avaliacaoId) {
        responder(['erro' => true, 'msg' => 'Avaliação não encontrada.'], 404);
    }

    if ((string)$avaliacao['status'] === 'visitado') {
        responder([
            'erro' => true,
            'msg' => 'Esta avaliação já foi concluída.',
        ], 409);
    }

    if ((int)$avaliacao['visitante_id'] !== (int)$user['id']) {
        responder([
            'erro' => true,
            'msg' => 'A avaliação foi iniciada por outro usuário.',
        ], 403);
    }

    $responsavel = trim((string)(
        $body['responsavel']
        ?? $body['com_quem_conversou']
        ?? ''
    ));
    $parentesco = trim((string)($body['grau_parentesco'] ?? ''));
    $observacaoGeral = trim((string)($body['observacao_geral'] ?? ''));

    if (texto_len($responsavel) > 180) {
        responder(['erro' => true, 'msg' => 'Campo "Responsável" muito longo.'], 400);
    }

    if ($parentesco !== '' && !grau_parentesco_valido($parentesco)) {
        responder(['erro' => true, 'msg' => 'Grau de parentesco inválido.'], 400);
    }

    if (texto_len($observacaoGeral) > 4000) {
        responder(['erro' => true, 'msg' => 'Conclusão muito longa.'], 400);
    }

    $perguntas = perguntas_aplicaveis($pdo, $at, $tipo);
    $aplicaveis = [];
    $codigosPerguntas = [];

    foreach ($perguntas as $p) {
        $numero = (int)$p['numero'];
        $aplicaveis[$numero] = !empty($p['aplicavel']);
        $codigosPerguntas[$numero] = (string)($p['codigo'] ?? codigo_pergunta($numero));
    }

    $respostasBody = is_array($body['respostas'] ?? null)
        ? $body['respostas']
        : [];

    $respostasPorNumero = [];

    foreach ($respostasBody as $r) {
        if (!is_array($r)) continue;

        $n = (int)($r['pergunta_numero'] ?? 0);
        if (!array_key_exists($n, $aplicaveis)) continue;

        $obs = trim((string)($r['observacao'] ?? ''));

        if (texto_len($obs) > 2000) {
            responder([
                'erro' => true,
                'msg' => "Observação da pergunta {$n} muito longa.",
            ], 400);
        }

        $respostasPorNumero[$n] = [
            'nota' => validar_nota($r['nota'] ?? null),
            'observacao' => $obs,
        ];
    }

    $registrosExistentesBody = is_array($body['registros_existentes'] ?? null)
        ? $body['registros_existentes']
        : [];

    $registrosNovosBody = is_array($body['registros_novos'] ?? null)
        ? $body['registros_novos']
        : [];

    $registrosRemover = is_array($body['registros_remover'] ?? null)
        ? array_values(array_unique(array_map('intval', $body['registros_remover'])))
        : [];

    $registrosExistentesAtual = registro_rows($pdo, $avaliacaoId);
    $registrosExistentesPorId = [];

    foreach ($registrosExistentesAtual as $registroAtual) {
        $registrosExistentesPorId[(int)$registroAtual['id']] = $registroAtual;
    }

    foreach ($registrosExistentesBody as $item) {
        if (!is_array($item)) continue;

        $idRegistro = (int)($item['id'] ?? 0);
        $legendaRegistro = trim((string)($item['legenda'] ?? ''));

        if ($idRegistro <= 0 || !isset($registrosExistentesPorId[$idRegistro])) {
            continue;
        }

        if (texto_len($legendaRegistro) > 500) {
            responder(['erro' => true, 'msg' => 'Legenda de registro muito longa.'], 400);
        }
    }

    foreach ($registrosNovosBody as $item) {
        if (!is_array($item)) continue;

        $legendaRegistro = trim((string)($item['legenda'] ?? ''));

        if (texto_len($legendaRegistro) > 500) {
            responder(['erro' => true, 'msg' => 'Legenda de registro muito longa.'], 400);
        }
    }

    $existentes = [];
    foreach (resposta_rows($pdo, $avaliacaoId) as $r) {
        $existentes[(int)$r['pergunta_numero']] = $r;
    }

    if ($finalizar) {
        if ($responsavel === '') {
            responder(['erro' => true, 'msg' => 'Informe o responsável.'], 400);
        }

        if ($parentesco === '') {
            responder(['erro' => true, 'msg' => 'Informe o grau de parentesco.'], 400);
        }

        foreach ($aplicaveis as $n => $ehAplicavel) {
            if (!$ehAplicavel) continue;

            $nota = $respostasPorNumero[$n]['nota']
                ?? validar_nota($existentes[$n]['nota'] ?? null);

            if ($nota === null) {
                responder([
                    'erro' => true,
                    'msg' => "Selecione uma nota para a pergunta {$n}.",
                ], 400);
            }
        }
    }

    $pdo->beginTransaction();

    $createdFiles = [];
    $deletedFiles = [];

    try {
        $stUpdate = $pdo->prepare("
            UPDATE visitas_avaliacao
               SET com_quem_conversou = :responsavel,
                   grau_parentesco = :parentesco,
                   observacao_geral = :observacao_geral,
                   atualizado_em = NOW()
             WHERE id = :id
               AND tipo = :tipo
        ");
        $stUpdate->execute([
            ':responsavel' => $responsavel !== '' ? $responsavel : null,
            ':parentesco' => $parentesco !== '' ? $parentesco : null,
            ':observacao_geral' => $observacaoGeral !== '' ? $observacaoGeral : null,
            ':id' => $avaliacaoId,
            ':tipo' => $tipo,
        ]);

        $stUpsert = $pdo->prepare("
            INSERT INTO visita_avaliacao_respostas (
                visita_id,
                pergunta_numero,
                pergunta_codigo,
                aplicavel,
                nota,
                observacao,
                foto_url,
                criado_em,
                atualizado_em
            ) VALUES (
                :visita_id,
                :pergunta_numero,
                :pergunta_codigo,
                :aplicavel,
                :nota,
                :observacao,
                :foto_url,
                NOW(),
                NOW()
            )
            ON DUPLICATE KEY UPDATE
                pergunta_codigo = VALUES(pergunta_codigo),
                aplicavel = VALUES(aplicavel),
                nota = VALUES(nota),
                observacao = VALUES(observacao),
                foto_url = COALESCE(VALUES(foto_url), foto_url),
                atualizado_em = NOW()
        ");

        foreach ($aplicaveis as $n => $ehAplicavel) {
            $r = $respostasPorNumero[$n] ?? [
                'nota' => validar_nota($existentes[$n]['nota'] ?? null),
                'observacao' => (string)($existentes[$n]['observacao'] ?? ''),
            ];

            $stUpsert->execute([
                ':visita_id' => $avaliacaoId,
                ':pergunta_numero' => (int)$n,
                ':pergunta_codigo' => $codigosPerguntas[$n] ?? codigo_pergunta((int)$n),
                ':aplicavel' => $ehAplicavel ? 1 : 0,
                ':nota' => $ehAplicavel ? $r['nota'] : null,
                ':observacao' => $ehAplicavel
                    ? trim((string)$r['observacao'])
                    : null,
                ':foto_url' => null,
            ]);
        }

        // Atualiza legendas de registros existentes.
        $stLegenda = $pdo->prepare("
            UPDATE visita_avaliacao_registros
               SET legenda = :legenda,
                   atualizado_em = NOW()
             WHERE id = :id
               AND visita_id = :visita_id
        ");

        foreach ($registrosExistentesBody as $item) {
            if (!is_array($item)) continue;

            $idRegistro = (int)($item['id'] ?? 0);

            if ($idRegistro <= 0 || !isset($registrosExistentesPorId[$idRegistro])) {
                continue;
            }

            $legendaRegistro = trim((string)($item['legenda'] ?? ''));

            $stLegenda->execute([
                ':legenda' => $legendaRegistro !== '' ? $legendaRegistro : null,
                ':id' => $idRegistro,
                ':visita_id' => $avaliacaoId,
            ]);
        }

        // Remove registros solicitados.
        if ($registrosRemover) {
            $stBuscaRemover = $pdo->prepare("
                SELECT id, foto_url
                  FROM visita_avaliacao_registros
                 WHERE id = :id
                   AND visita_id = :visita_id
                 LIMIT 1
            ");

            $stRemove = $pdo->prepare("
                DELETE FROM visita_avaliacao_registros
                 WHERE id = :id
                   AND visita_id = :visita_id
            ");

            foreach ($registrosRemover as $idRegistro) {
                if ($idRegistro <= 0) continue;

                $stBuscaRemover->execute([
                    ':id' => $idRegistro,
                    ':visita_id' => $avaliacaoId,
                ]);
                $registroRemover = $stBuscaRemover->fetch(PDO::FETCH_ASSOC);

                if (!$registroRemover) continue;

                $stRemove->execute([
                    ':id' => $idRegistro,
                    ':visita_id' => $avaliacaoId,
                ]);

                $deletedFiles[] = (string)($registroRemover['foto_url'] ?? '');
            }
        }

        // Próxima ordem dos registros.
        $stMaxOrdem = $pdo->prepare("
            SELECT COALESCE(MAX(ordem), 0)
              FROM visita_avaliacao_registros
             WHERE visita_id = :visita_id
        ");
        $stMaxOrdem->execute([':visita_id' => $avaliacaoId]);
        $proximaOrdem = (int)$stMaxOrdem->fetchColumn();

        $stInsertRegistro = $pdo->prepare("
            INSERT INTO visita_avaliacao_registros (
                visita_id,
                foto_url,
                legenda,
                ordem,
                criado_em,
                atualizado_em
            ) VALUES (
                :visita_id,
                :foto_url,
                :legenda,
                :ordem,
                NOW(),
                NOW()
            )
        ");

        foreach ($registrosNovosBody as $item) {
            if (!is_array($item)) continue;

            $localId = preg_replace(
                '/[^a-zA-Z0-9_-]/',
                '',
                (string)($item['local_id'] ?? '')
            );

            if ($localId === '') continue;

            $fileKey = 'registro_' . $localId;

            if (
                !isset($_FILES[$fileKey])
                || (int)($_FILES[$fileKey]['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
            ) {
                continue;
            }

            $fotoUrl = salvar_foto_registro(
                $_FILES[$fileKey],
                $atendimentoId,
                $avaliacaoId
            );
            $createdFiles[] = $fotoUrl;

            $proximaOrdem++;

            $legendaRegistro = trim((string)($item['legenda'] ?? ''));

            $stInsertRegistro->execute([
                ':visita_id' => $avaliacaoId,
                ':foto_url' => $fotoUrl,
                ':legenda' => $legendaRegistro !== '' ? $legendaRegistro : null,
                ':ordem' => $proximaOrdem,
            ]);
        }

        if ($finalizar) {
            // Congela, dentro da mesma transação, quem recebe cada nota.
            // Se não for possível identificar o colaborador, a linha é gravada
            // mesmo assim com responsavel_usuario_id NULL, permitindo medir
            // qualidade de dados sem atribuir nota à pessoa errada.
            $avaliacaoAtualizada = avaliacao_do_atendimento(
                $pdo,
                $atendimentoId,
                $tipo
            );

            if (!$avaliacaoAtualizada) {
                throw new RuntimeException(
                    'Avaliação não encontrada para congelamento das notas.'
                );
            }

            congelar_notas_colaboradores(
                $pdo,
                $avaliacaoAtualizada,
                $at,
                $tipo
            );

            $stFinish = $pdo->prepare("
                UPDATE visitas_avaliacao
                   SET status = 'visitado',
                       fim_em = NOW(),
                       duracao_segundos = TIMESTAMPDIFF(SECOND, inicio_em, NOW()),
                       atualizado_em = NOW()
                 WHERE id = :id
                   AND tipo = :tipo
                   AND status = 'em_andamento'
            ");
            $stFinish->execute([
                ':id' => $avaliacaoId,
                ':tipo' => $tipo,
            ]);

            if ($stFinish->rowCount() !== 1) {
                throw new RuntimeException('Não foi possível concluir a avaliação.');
            }
        }

        $pdo->commit();

        foreach ($deletedFiles as $url) {
            $path = parse_url($url, PHP_URL_PATH);
            if (!$path) continue;

            $local = __DIR__ . '/' . ltrim((string)$path, '/');
            if (is_file($local)) @unlink($local);
        }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        foreach ($createdFiles as $url) {
            $path = parse_url($url, PHP_URL_PATH);
            if (!$path) continue;

            $local = __DIR__ . '/' . ltrim((string)$path, '/');
            if (is_file($local)) @unlink($local);
        }

        responder([
            'erro' => true,
            'msg' => 'Falha ao salvar a avaliação: ' . $e->getMessage(),
        ], 500);
    }

    responder([
        'sucesso' => true,
        'tipo' => $tipo,
        'status' => $finalizar ? 'visitado' : 'em_andamento',
    ]);
}


// ===== REPROCESSAR / BACKFILL DE NOTAS DE COLABORADORES =====
// Uso administrativo para avaliações já concluídas antes desta migração.
// Processa em lotes pequenos para evitar timeout.
// Exemplo:
// POST visita.php?action=reprocessar_notas&tipo=visita
// {"after_id":0,"limit":100}
if (
    ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'
    && $action === 'reprocessar_notas'
) {
    $body = payload_json();

    $afterId = max(0, (int)($body['after_id'] ?? 0));
    $limit = (int)($body['limit'] ?? 100);
    $limit = max(1, min(200, $limit));

    $st = $pdo->prepare("
        SELECT id, atendimento_id
          FROM visitas_avaliacao
         WHERE tipo = :tipo
           AND status = 'visitado'
           AND id > :after_id
         ORDER BY id ASC
         LIMIT {$limit}
    ");
    $st->execute([
        ':tipo' => $tipo,
        ':after_id' => $afterId,
    ]);

    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $processados = 0;
    $falhas = [];
    $ultimoId = $afterId;

    foreach ($rows as $row) {
        $avaliacaoId = (int)$row['id'];
        $atendimentoId = (int)$row['atendimento_id'];
        $ultimoId = max($ultimoId, $avaliacaoId);

        try {
            $avaliacao = avaliacao_do_atendimento(
                $pdo,
                $atendimentoId,
                $tipo
            );
            $at = atendimento($pdo, $atendimentoId);

            if (!$avaliacao) {
                throw new RuntimeException('Avaliação não encontrada.');
            }

            $pdo->beginTransaction();

            congelar_notas_colaboradores(
                $pdo,
                $avaliacao,
                $at,
                $tipo
            );

            $pdo->commit();
            $processados++;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            $falhas[] = [
                'avaliacao_id' => $avaliacaoId,
                'atendimento_id' => $atendimentoId,
                'msg' => $e->getMessage(),
            ];
        }
    }

    responder([
        'sucesso' => true,
        'tipo' => $tipo,
        'processados' => $processados,
        'falhas' => $falhas,
        'after_id' => $ultimoId,
        'tem_mais' => count($rows) === $limit,
    ]);
}

responder(['erro' => true, 'msg' => 'Ação inválida.'], 400);
