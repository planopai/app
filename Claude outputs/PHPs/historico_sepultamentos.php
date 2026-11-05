<?php
// 09/10/2026: atendimento cancelado sai da lista de falecidos; etapa desfeita (Voltar etapa) sai do log
//             (use &incluir_desfeitas=1 para ver tudo); nomes das ações novas.
// SEMPRE RETORNAR JSON
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

date_default_timezone_set(getenv('PAI_TIMEZONE') ?: 'America/Sao_Paulo');

// CONFIGURAÇÃO PRIVADA - mesmo padrão do informativo.php
$PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';

if (!is_file($PAI_CHAVES_FILE) || !is_readable($PAI_CHAVES_FILE)) {
    responder([
        'erro' => true,
        'msg' => 'Arquivo privado de configuração não encontrado ou sem permissão de leitura.'
    ], 500);
}

$PAI_CONFIG = require $PAI_CHAVES_FILE;
// 23/10/2026 (segurança, parte 4): exige o login assinado do app. Ver paiProtecao() em /home2/pla48587/pai_sessao.php
if (is_file('/home2/pla48587/pai_sessao.php')) { include_once '/home2/pla48587/pai_sessao.php'; } elseif (PHP_SAPI !== 'cli') { $paiChavesSemSessao = @include '/home2/pla48587/pai-chaves.php'; if (is_array($paiChavesSemSessao) && strtolower(trim((string) ($paiChavesSemSessao['pai_sessao_modo'] ?? ''))) === 'exigir') { error_log('[PAI] pai_sessao.php ausente com pai_sessao_modo=exigir: acesso bloqueado em ' . basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''))); if (!headers_sent()) { http_response_code(503); header('Content-Type: application/json; charset=utf-8'); header('Retry-After: 300'); } echo json_encode(['ok' => false, 'sucesso' => false, 'success' => false, 'erro' => 'Sistema em manutenção. Tente novamente em alguns minutos.', 'msg' => 'Sistema em manutenção. Tente novamente em alguns minutos.'], JSON_UNESCAPED_UNICODE); exit; } unset($paiChavesSemSessao); } // 23/10/2026: sem o pai_sessao.php e com o modo exigir, bloqueia em vez de liberar
if (function_exists('paiProtecao')) { paiProtecao('login', [], 'historico_sepultamentos'); }

if (!is_array($PAI_CONFIG)) {
    responder([
        'erro' => true,
        'msg' => 'Arquivo privado de configuração inválido.'
    ], 500);
}

$servername = trim((string)($PAI_CONFIG['db_host'] ?? ''));
$username   = trim((string)($PAI_CONFIG['db_user'] ?? ''));
$password   = (string)($PAI_CONFIG['db_password'] ?? '');
$dbname     = trim((string)($PAI_CONFIG['db_name'] ?? ''));

if ($servername === '' || $username === '' || $password === '' || $dbname === '') {
    responder(['erro' => true, 'msg' => 'Configuração do banco ausente ou incompleta em pai-chaves.php.'], 500);
}

// CONEXÃO PDO
try {
    $pdo = new PDO(
        "mysql:host=$servername;dbname=$dbname;charset=utf8mb4",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(
        ['erro' => true, 'msg' => 'Erro ao conectar: ' . $e->getMessage()],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

// FUNÇÃO PADRÃO DE SAÍDA
function responder($arr, $code = 200) {
    http_response_code($code);
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

function intParam(string $key, ?int $default = null): ?int {
    if (!isset($_GET[$key])) return $default;
    $v = $_GET[$key];
    if ($v === '' || $v === null) return $default;
    if (!is_numeric($v)) return $default;
    return (int)$v;
}

function table_exists(PDO $pdo, string $table): bool {
    $st = $pdo->prepare("
        SELECT 1
          FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :t
         LIMIT 1
    ");
    $st->execute([':t' => $table]);
    return (bool)$st->fetchColumn();
}

function column_exists(PDO $pdo, string $table, string $col): bool {
    $st = $pdo->prepare("
        SELECT 1
          FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :t
           AND COLUMN_NAME = :c
         LIMIT 1
    ");
    $st->execute([':t' => $table, ':c' => $col]);
    return (bool)$st->fetchColumn();
}

/**
 * Monta expressão SQL segura para coluna opcional.
 * Se a tabela/coluna não existir, retorna NULL AS coluna.
 */
function optional_col(PDO $pdo, string $alias, string $table, string $col, string $as): string {
    if (table_exists($pdo, $table) && column_exists($pdo, $table, $col)) {
        return "{$alias}.{$col} AS {$as}";
    }

    return "NULL AS {$as}";
}

/**
 * 05/11/2026: tanatopraxia do atendimento (Painel de Atendimentos e Relatório).
 * Devolve os campos do SELECT e o JOIN com est_produto para o nome do procedimento
 * (Tanatopraxia, Tanatopraxia avançada ou Embalsamamento). Somente leitura.
 * Se a tabela/coluna não existir, os campos voltam NULL sem quebrar.
 */
function tanato_campos(PDO $pdo, bool $hasSep): array {
    $temProdutoId = $hasSep && column_exists($pdo, 'sepultamentos', 'tanato_produto_id');
    $temProduto = $temProdutoId && table_exists($pdo, 'est_produto');

    $campos = [
        ($hasSep && column_exists($pdo, 'sepultamentos', 'tanato')) ? "s.tanato AS tanato" : "NULL AS tanato",
        $temProdutoId ? "s.tanato_produto_id AS tanato_produto_id" : "NULL AS tanato_produto_id",
        ($hasSep && column_exists($pdo, 'sepultamentos', 'reconstituicao_facial')) ? "s.reconstituicao_facial AS reconstituicao_facial" : "NULL AS reconstituicao_facial",
        $temProduto ? "tp.nome AS tanato_procedimento" : "NULL AS tanato_procedimento",
    ];
    $join = $temProduto ? " LEFT JOIN est_produto tp ON tp.id = s.tanato_produto_id" : "";

    return [$campos, $join];
}

/** Normaliza os campos da tanatopraxia de uma linha (strings para o front). */
function tanato_normalizar(array &$r): void {
    $r['tanato'] = (string)($r['tanato'] ?? '');
    $r['tanato_produto_id'] = (isset($r['tanato_produto_id']) && (int)$r['tanato_produto_id'] > 0) ? (int)$r['tanato_produto_id'] : null;
    $r['reconstituicao_facial'] = (string)($r['reconstituicao_facial'] ?? '');
    $r['tanato_procedimento'] = trim((string)($r['tanato_procedimento'] ?? ''));
}

/**
 * ==================== LISTA DE FALECIDOS PRINCIPAL =====================
 *
 * Usado pelo front:
 * /api/php/historico_sepultamentos.php?listar_falecidos=1
 *
 * Agora também retorna:
 * - data_nascimento
 * - data_falecimento
 * - foto_falecido
 * - nome_responsavel
 * - cpf_responsavel
 *
 * Esses dados vêm preferencialmente da tabela sepultamentos.
 */
if (isset($_GET['listar_falecidos'])) {
    try {
        // Paginação opcional
        $limit  = intParam('limit', null);
        $offset = intParam('offset', 0);

        if ($offset === null || $offset < 0) {
            $offset = 0;
        }

        if ($limit !== null) {
            if ($limit < 1) $limit = 1;
            if ($limit > 2000) $limit = 2000;
        }

        $limitSql = ($limit !== null) ? " LIMIT :limit OFFSET :offset " : "";

        $hasSep = table_exists($pdo, 'sepultamentos');

        // Campos opcionais de sepultamentos.
        // Se alguma coluna não existir, volta NULL sem quebrar.
        $extraSelect = [];

        if ($hasSep) {
            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'data_nascimento')
                ? "s.data_nascimento AS data_nascimento"
                : "NULL AS data_nascimento";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'data_falecimento')
                ? "s.data_falecimento AS data_falecimento"
                : "NULL AS data_falecimento";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'foto_falecido')
                ? "s.foto_falecido AS foto_falecido"
                : "NULL AS foto_falecido";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'nome_responsavel')
                ? "s.nome_responsavel AS nome_responsavel"
                : "NULL AS nome_responsavel";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'cpf_responsavel')
                ? "s.cpf_responsavel AS cpf_responsavel"
                : "NULL AS cpf_responsavel";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'local')
                ? "s.local AS local"
                : "NULL AS local";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'local_velorio')
                ? "s.local_velorio AS local_velorio"
                : "NULL AS local_velorio";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'data_inicio_velorio')
                ? "s.data_inicio_velorio AS data_inicio_velorio"
                : "NULL AS data_inicio_velorio";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'data_fim_velorio')
                ? "s.data_fim_velorio AS data_fim_velorio"
                : "NULL AS data_fim_velorio";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'hora_inicio_velorio')
                ? "s.hora_inicio_velorio AS hora_inicio_velorio"
                : "NULL AS hora_inicio_velorio";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'hora_fim_velorio')
                ? "s.hora_fim_velorio AS hora_fim_velorio"
                : "NULL AS hora_fim_velorio";
        } else {
            $extraSelect = [
                "NULL AS data_nascimento",
                "NULL AS data_falecimento",
                "NULL AS foto_falecido",
                "NULL AS nome_responsavel",
                "NULL AS cpf_responsavel",
                "NULL AS local",
                "NULL AS local_velorio",
                "NULL AS data_inicio_velorio",
                "NULL AS data_fim_velorio",
                "NULL AS hora_inicio_velorio",
                "NULL AS hora_fim_velorio",
            ];
        }

        [$tanatoCampos, $tanatoJoin] = tanato_campos($pdo, $hasSep);
        $extraSelect = array_merge($extraSelect, $tanatoCampos);

        $extraSelectSql = implode(",\n                ", $extraSelect);

        $joinSep = $hasSep
            ? "LEFT JOIN sepultamentos s ON s.id = u.sepultamento_id" . $tanatoJoin
            : "";

        // Cancelados (09/10/2026) não entram no relatório.
        if ($hasSep && column_exists($pdo, 'sepultamentos', 'cancelado_em')) {
            $joinSep .= " WHERE s.cancelado_em IS NULL";
        }

        // Último registro por sepultamento_id + primeira data de criação.
        // Desempate: se max(datahora) tiver mais de uma linha, pega MAX(id).
        $sql = "
            SELECT
                u.sepultamento_id,
                u.falecido,
                u.ultima_datahora,
                u.ultima_acao,
                c.criacao,

                {$extraSelectSql}

            FROM (
                SELECT
                    h.sepultamento_id,
                    h.falecido,
                    h.datahora AS ultima_datahora,
                    h.acao     AS ultima_acao
                FROM historico_sepultamentos h
                JOIN (
                    SELECT sepultamento_id, MAX(datahora) AS maxdh
                    FROM historico_sepultamentos
                    GROUP BY sepultamento_id
                ) m
                  ON m.sepultamento_id = h.sepultamento_id
                 AND m.maxdh          = h.datahora
                JOIN (
                    SELECT sepultamento_id, datahora, MAX(id) AS maxid
                    FROM historico_sepultamentos
                    GROUP BY sepultamento_id, datahora
                ) mx
                  ON mx.sepultamento_id = h.sepultamento_id
                 AND mx.datahora        = h.datahora
                 AND mx.maxid           = h.id
            ) u
            JOIN (
                SELECT sepultamento_id, MIN(datahora) AS criacao
                FROM historico_sepultamentos
                GROUP BY sepultamento_id
            ) c
              ON c.sepultamento_id = u.sepultamento_id

            {$joinSep}

            ORDER BY u.ultima_datahora DESC
            {$limitSql}
        ";

        if ($limit !== null) {
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':limit',  $limit,  PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $registros = $stmt->fetchAll();
        } else {
            $stmt = $pdo->query($sql);
            $registros = $stmt->fetchAll();
        }

        $map = [
            'criou'               => 'Criou registro',
            'editou'              => 'Editou registro',
            'editou registro'     => 'Editou registro',
            'atualizou status'    => 'Atualizou status',
            'material_recolhido'  => 'Material recolhido',
            'voltou etapa'        => 'Voltou etapa',
            'cancelou atendimento'=> 'Cancelou atendimento',
        ];

        foreach ($registros as &$r) {
            $acao = strtolower(trim((string)($r['ultima_acao'] ?? '')));
            $r['ultima_acao'] = $map[$acao] ?? ($acao ? ucfirst($acao) : '');

            // Garante strings para o front não quebrar.
            $r['data_nascimento']      = (string)($r['data_nascimento'] ?? '');
            $r['data_falecimento']     = (string)($r['data_falecimento'] ?? '');
            $r['foto_falecido']        = (string)($r['foto_falecido'] ?? '');
            $r['nome_responsavel']     = (string)($r['nome_responsavel'] ?? '');
            $r['cpf_responsavel']      = (string)($r['cpf_responsavel'] ?? '');
            $r['local']                = (string)($r['local'] ?? '');
            $r['local_velorio']        = (string)($r['local_velorio'] ?? '');
            $r['data_inicio_velorio']  = (string)($r['data_inicio_velorio'] ?? '');
            $r['data_fim_velorio']     = (string)($r['data_fim_velorio'] ?? '');
            $r['hora_inicio_velorio']  = (string)($r['hora_inicio_velorio'] ?? '');
            $r['hora_fim_velorio']     = (string)($r['hora_fim_velorio'] ?? '');
            tanato_normalizar($r);
        }

        responder(['sucesso' => true, 'dados' => $registros]);
    } catch (Exception $e) {
        responder(['erro' => true, 'msg' => 'Erro ao listar: ' . $e->getMessage()], 500);
    }
}

/**
 * ==================== HISTÓRICO DE UM SEPULTAMENTO =====================
 *
 * Mantém ORDER BY datahora ASC.
 * Também adiciona dados atuais do sepultamento em cada linha do log.
 */
if (isset($_GET['log']) && isset($_GET['id'])) {
    $sepultamento_id = (int)$_GET['id'];
    if (!$sepultamento_id) {
        responder(['erro' => true, 'msg' => 'ID inválido.'], 400);
    }

    try {
        $hasSep = table_exists($pdo, 'sepultamentos');

        $extraSelect = [];

        if ($hasSep) {
            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'data_nascimento')
                ? "s.data_nascimento AS data_nascimento"
                : "NULL AS data_nascimento";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'data_falecimento')
                ? "s.data_falecimento AS data_falecimento"
                : "NULL AS data_falecimento";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'foto_falecido')
                ? "s.foto_falecido AS foto_falecido"
                : "NULL AS foto_falecido";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'nome_responsavel')
                ? "s.nome_responsavel AS nome_responsavel"
                : "NULL AS nome_responsavel";

            $extraSelect[] = column_exists($pdo, 'sepultamentos', 'cpf_responsavel')
                ? "s.cpf_responsavel AS cpf_responsavel"
                : "NULL AS cpf_responsavel";

            $joinSep = "LEFT JOIN sepultamentos s ON s.id = h.sepultamento_id";
        } else {
            $extraSelect = [
                "NULL AS data_nascimento",
                "NULL AS data_falecimento",
                "NULL AS foto_falecido",
                "NULL AS nome_responsavel",
                "NULL AS cpf_responsavel",
            ];

            $joinSep = "";
        }

        [$tanatoCampos, $tanatoJoin] = tanato_campos($pdo, $hasSep);
        $extraSelect = array_merge($extraSelect, $tanatoCampos);
        if ($hasSep) {
            $joinSep .= $tanatoJoin;
        }

        $extraSelectSql = implode(",\n                ", $extraSelect);

        // Etapa desfeita pelo Voltar etapa (09/10/2026) não conta na linha do tempo nem nos tempos por etapa.
        $filtroDesfeita = (!isset($_GET['incluir_desfeitas']) && column_exists($pdo, 'historico_sepultamentos', 'desfeita'))
            ? " AND h.desfeita = 0"
            : "";

        $stmt = $pdo->prepare("
            SELECT
                h.id,
                h.sepultamento_id,
                h.falecido,
                h.usuario,
                h.acao,
                h.status_anterior,
                h.status_novo,
                h.detalhes,
                h.datahora,
                " . optional_col($pdo, 'h', 'historico_sepultamentos', 'operation_id', 'operation_id') . ",
                " . optional_col($pdo, 'h', 'historico_sepultamentos', 'usuario_id', 'usuario_id') . ",
                " . optional_col($pdo, 'h', 'historico_sepultamentos', 'origem', 'origem') . ",
                " . optional_col($pdo, 'h', 'historico_sepultamentos', 'device_id', 'device_id') . ",
                " . optional_col($pdo, 'h', 'historico_sepultamentos', 'sincronizado_em', 'sincronizado_em') . ",
                " . optional_col($pdo, 'h', 'historico_sepultamentos', 'clock_offset_ms', 'clock_offset_ms') . ",

                {$extraSelectSql}

            FROM historico_sepultamentos h
            {$joinSep}
            WHERE h.sepultamento_id = :id
            {$filtroDesfeita}
            ORDER BY h.datahora ASC, h.id ASC
        ");

        $stmt->execute([':id' => $sepultamento_id]);
        $dados = $stmt->fetchAll();

        $acao_map = [
            'criou'              => 'Registro criado',
            'editou'             => 'Registro editado',
            'editou registro'    => 'Registro editado',
            'atualizou status'   => 'Status alterado',
            'material_recolhido' => 'Material recolhido',
            'voltou etapa'       => 'Etapa voltada (correção da Gestão)',
            'cancelou atendimento' => 'Atendimento cancelado',
        ];

        foreach ($dados as &$row) {
            $acao = strtolower(trim((string)($row['acao'] ?? '')));
            $row['acao_humana'] = $acao_map[$acao] ?? ($acao ? ucfirst($acao) : '');

            $row['data_hora'] = '';
            if (!empty($row['datahora'])) {
                $ts = strtotime($row['datahora']);
                $row['data_hora'] = $ts ? date('d/m/Y H:i:s', $ts) : $row['datahora'];
            }

            if (!empty($row['detalhes'])) {
                $det = json_decode($row['detalhes'], true);
                $row['detalhes_array'] = is_array($det) ? $det : $row['detalhes'];
            } else {
                $row['detalhes_array'] = null;
            }

            $row['data_nascimento']  = (string)($row['data_nascimento'] ?? '');
            $row['data_falecimento'] = (string)($row['data_falecimento'] ?? '');
            $row['foto_falecido']    = (string)($row['foto_falecido'] ?? '');
            $row['nome_responsavel'] = (string)($row['nome_responsavel'] ?? '');
            $row['cpf_responsavel']  = (string)($row['cpf_responsavel'] ?? '');
            tanato_normalizar($row);
        }

        responder(['sucesso' => true, 'dados' => $dados]);
    } catch (Exception $e) {
        responder(['erro' => true, 'msg' => 'Erro ao consultar histórico: ' . $e->getMessage()], 500);
    }
}

// =================== RESPOSTA SE NADA FOI SOLICITADO ===================
responder(['erro' => true, 'msg' => 'Nenhuma operação especificada.'], 400);
?>