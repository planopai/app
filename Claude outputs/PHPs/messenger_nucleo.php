<?php
declare(strict_types=1);
/**
 * messenger_nucleo.php — regras comuns do Messenger do app PAI
 *
 * Usado por messenger.php (app) e whatsapp_webhook.php (Meta). Não é endpoint: acessado direto, não faz nada.
 *
 * Conteúdo:
 *  - configuração (pai-chaves.php), banco, respostas JSON e tarefas depois da resposta
 *  - login e permissão por página (mesmo modelo do convenio.php: permissoes + cargos/cargo_paginas)
 *  - Ably (credencial temporária e aviso em tempo real, por REST)
 *  - Cloudflare R2 (links assinados de envio/leitura, envio pelo servidor)
 *  - notificações: pelo OneSignal, com as mesmas chaves e o mesmo envio do informativo.php (07/10/2026),
 *    só para o(s) destinatário(s) da mensagem; a Ably fica só para o tempo real
 *  - WhatsApp Cloud API (envio, mídia, modelos)
 *  - regras de mensagem: gravar, avisar, notificar, distribuir conversas de clientes
 *
 * Chaves usadas do pai-chaves.php (só as do banco são obrigatórias para o chat interno funcionar sem tempo real):
 *   db_host, db_name, db_user, db_password
 *   ably_api_key
 *   r2_account_id, r2_access_key_id, r2_secret_access_key, r2_bucket, r2_endpoint
 *   onesignal_app_id e onesignal_api_key (as mesmas do informativo.php) — notificações
 *   app_url (opcional; padrão https://pai.planoassistencialintegrado.com.br)
 *   notificacoes_canal: não é mais usada (as notificações saem sempre pelo OneSignal)
 *   meta_verify_token, meta_app_secret, meta_access_token, meta_phone_number_id, meta_waba_id, meta_graph_versao
 */

if (defined('MSG_NUCLEO_CARREGADO')) {
    return;
}
define('MSG_NUCLEO_CARREGADO', true);

const MSG_PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';
const MSG_PAGINA = 'messenger';
// 06/10/2026: todos com o Messenger atendem clientes (a página messenger-clientes deixou de ser usada).
const MSG_PAGINA_ATENDENTE = MSG_PAGINA;
// Gestão: vê todos os atendimentos (em andamento e histórico) sem participar; transfere e encerra.
const MSG_PAGINA_GESTAO = 'messenger-historico';
const MSG_CARGO_ADMIN = 'adm';
const MSG_MINUTOS_APAGAR = 15;
const MSG_TEXTO_MAX = 4000;

date_default_timezone_set(getenv('PAI_TIMEZONE') ?: 'America/Sao_Paulo');

// =====================================================================
// Configuração, banco e respostas
// =====================================================================

function msgConfig(?string $chave = null, $padrao = null)
{
    static $cfg = null;
    if ($cfg === null) {
        $arquivo = getenv('PAI_CHAVES_FILE') ?: MSG_PAI_CHAVES_FILE;
        if (!is_file($arquivo) || !is_readable($arquivo)) {
            msgErro('Arquivo privado de configuração não encontrado ou sem permissão de leitura.', 500);
        }
        $lido = require $arquivo;
        if (!is_array($lido)) {
            msgErro('Configuração privada inválida.', 500);
        }
        $cfg = $lido;
    }
    if ($chave === null) {
        return $cfg;
    }
    $v = $cfg[$chave] ?? null;
    return ($v === null || $v === '') ? $padrao : $v;
}

function msgPdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $host = trim((string) msgConfig('db_host', ''));
    $nome = trim((string) msgConfig('db_name', ''));
    $user = trim((string) msgConfig('db_user', ''));
    $pass = (string) msgConfig('db_password', '');
    if ($host === '' || $nome === '' || $user === '') {
        msgErro('Configuração do banco incompleta.', 500);
    }
    try {
        $pdo = new PDO("mysql:host={$host};dbname={$nome};charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '-03:00'");
    } catch (Throwable $e) {
        error_log('[messenger] banco: ' . $e->getMessage());
        msgErro('Não foi possível conectar ao banco.', 500);
    }
    if (!msgTabelaExiste($pdo, 'chat_mensagens')) {
        msgErro('Tabelas do Messenger não encontradas. Rode o messenger.sql no banco.', 500);
    }
    msgGarantirEsquema($pdo);
    return $pdo;
}

/**
 * Pacote 3 (14/10/2026): tabelas e colunas novas do Messenger, criadas sozinhas uma única vez.
 * Versão 4 (15/10/2026): chat_mensagens_fixadas e criação de colunas à prova de acessos simultâneos.
 * Só mexe em tabelas chat_*. Depois da primeira vez, custa uma consulta (a marca em chat_config).
 *  - chat_config: configurações da tela "Configurações do Messenger" (chave → valor)
 *  - chat_respostas_rapidas: respostas rápidas da empresa e pessoais
 *  - chat_reacoes: reações com emoji
 *  - chat_mensagens.interna: nota interna (só a equipe vê; nunca vai ao WhatsApp)
 *  - chat_contatos_externos.nome_salvo: nome dado pela equipe (o do perfil do WhatsApp não sobrescreve)
 */
function msgGarantirEsquema(PDO $pdo): void
{
    // um único processo por vez cria/atualiza o esquema (os outros esperam até 10 s)
    $trava = false;
    try {
        $trava = (bool) $pdo->query("SELECT GET_LOCK('pai_messenger_esquema', 10)")->fetchColumn();
    } catch (PDOException $e) {
        $trava = false;
    }
    try {
        msgGarantirEsquemaAgora($pdo);
    } finally {
        if ($trava) {
            try {
                $pdo->query("SELECT RELEASE_LOCK('pai_messenger_esquema')");
            } catch (PDOException $e) {
                // sem trava para soltar
            }
        }
    }
}

function msgGarantirEsquemaAgora(PDO $pdo): void
{
    try {
        $v = $pdo->query("SELECT valor FROM chat_config WHERE chave = 'esquema'")->fetchColumn();
        if ((int) $v >= 15) {
            return;
        }
    } catch (PDOException $e) {
        // chat_config ainda não existe
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_config (
                  chave VARCHAR(60) NOT NULL PRIMARY KEY,
                  valor TEXT NULL,
                  atualizado_por INT NULL,
                  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_respostas_rapidas (
                  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  atalho VARCHAR(40) NOT NULL,
                  texto TEXT NOT NULL,
                  usuario_id INT NULL,
                  criado_por INT NULL,
                  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  KEY ix_chat_resp_usuario (usuario_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_reacoes (
                  mensagem_id BIGINT UNSIGNED NOT NULL,
                  usuario_id INT NOT NULL,
                  emoji VARCHAR(16) NOT NULL,
                  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (mensagem_id, usuario_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    // 15/10/2026: mensagens fixadas no topo da conversa (até 3 por conversa)
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_mensagens_fixadas (
                  conversa_id BIGINT UNSIGNED NOT NULL,
                  mensagem_id BIGINT UNSIGNED NOT NULL,
                  fixada_por INT NOT NULL,
                  fixada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (conversa_id, mensagem_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $temColuna = function (string $tabela, string $coluna) use ($pdo): bool {
        $st = $pdo->query("SHOW COLUMNS FROM {$tabela} LIKE " . $pdo->quote($coluna));
        return (bool) $st->fetch();
    };
    // Duas requisições ao mesmo tempo podem tentar criar a mesma coluna: a segunda recebe
    // "coluna já existe" (1060) e segue normalmente (erro de 14/10/2026 no primeiro acesso).
    $acrescentarColuna = function (string $tabela, string $coluna, string $definicao) use ($pdo, $temColuna): void {
        if ($temColuna($tabela, $coluna)) {
            return;
        }
        try {
            $pdo->exec("ALTER TABLE {$tabela} ADD COLUMN {$coluna} {$definicao}");
        } catch (PDOException $e) {
            if ((int) ($e->errorInfo[1] ?? 0) !== 1060) {
                throw $e;
            }
        }
    };
    $acrescentarColuna('chat_mensagens', 'interna', 'TINYINT(1) NOT NULL DEFAULT 0');
    $acrescentarColuna('chat_contatos_externos', 'nome_salvo', 'VARCHAR(150) NULL');
    // Pacote 4A (15/10/2026): setores (com horários e exceções) e etiquetas
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_setores (
                  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  nome VARCHAR(80) NOT NULL,
                  cor VARCHAR(9) NOT NULL DEFAULT '#3D6A99',
                  ativo TINYINT(1) NOT NULL DEFAULT 1,
                  plantao TINYINT(1) NOT NULL DEFAULT 0,
                  ordem INT NOT NULL DEFAULT 0,
                  msg_boas_vindas TEXT NULL,
                  msg_fora_horario TEXT NULL,
                  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_setor_membros (
                  setor_id INT UNSIGNED NOT NULL,
                  usuario_id INT NOT NULL,
                  PRIMARY KEY (setor_id, usuario_id),
                  KEY ix_chat_setor_membro_usuario (usuario_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_setor_horarios (
                  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  setor_id INT UNSIGNED NOT NULL,
                  dia_semana TINYINT NOT NULL,
                  inicio TIME NOT NULL,
                  fim TIME NOT NULL,
                  KEY ix_chat_setor_horario (setor_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_setor_excecoes (
                  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  setor_id INT UNSIGNED NOT NULL,
                  data DATE NOT NULL,
                  descricao VARCHAR(120) NULL,
                  fechado TINYINT(1) NOT NULL DEFAULT 1,
                  inicio TIME NULL,
                  fim TIME NULL,
                  KEY ix_chat_setor_excecao (setor_id, data)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_etiquetas (
                  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  nome VARCHAR(60) NOT NULL,
                  cor VARCHAR(9) NOT NULL DEFAULT '#3D6A99',
                  usuario_id INT NULL,
                  criado_por INT NULL,
                  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  KEY ix_chat_etiqueta_usuario (usuario_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_conversa_etiquetas (
                  conversa_id BIGINT UNSIGNED NOT NULL,
                  etiqueta_id INT UNSIGNED NOT NULL,
                  criado_por INT NULL,
                  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (conversa_id, etiqueta_id),
                  KEY ix_chat_conv_etiqueta (etiqueta_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $acrescentarColuna('chat_conversas', 'setor_id', 'INT UNSIGNED NULL');
    // Pacote 4B (15/10/2026): estado do atendimento automático (menu / avaliação) e nota da avaliação
    $acrescentarColuna('chat_conversas', 'bot_estado', 'VARCHAR(20) NULL');
    $acrescentarColuna('chat_conversas', 'bot_ref', 'BIGINT UNSIGNED NULL');
    $acrescentarColuna('chat_conversas', 'bot_tentativas', 'TINYINT NOT NULL DEFAULT 0');
    $acrescentarColuna('chat_atendimentos', 'avaliacao_nota', 'TINYINT NULL');
    $acrescentarColuna('chat_atendimentos', 'avaliacao_em', 'DATETIME NULL');
    // Esquema 7 (16/10/2026): regras da Meta — identificador de usuário (BSUID), nome de usuário e custo de cada mensagem
    $mudar = function (string $sql) use ($pdo): void {
        try {
            $pdo->exec($sql);
        } catch (PDOException $e) {
            // já aplicado (índice/coluna existente)
        }
    };
    $mudar('ALTER TABLE chat_contatos_externos MODIFY wa_id VARCHAR(160) NOT NULL');
    $mudar('ALTER TABLE chat_contatos_externos MODIFY telefone_e164 VARCHAR(20) NULL');
    $acrescentarColuna('chat_contatos_externos', 'bsuid', 'VARCHAR(160) NULL');
    $acrescentarColuna('chat_contatos_externos', 'username', 'VARCHAR(60) NULL');
    $mudar('ALTER TABLE chat_contatos_externos ADD UNIQUE KEY uq_chat_contato_bsuid (bsuid)');
    $acrescentarColuna('chat_mensagens', 'cobravel', 'TINYINT NULL');
    $acrescentarColuna('chat_mensagens', 'categoria_meta', 'VARCHAR(20) NULL');
    $acrescentarColuna('chat_mensagens', 'tipo_preco', 'VARCHAR(30) NULL');
    // Esquema 8 (16/10/2026): contato vinculado a contrato da Unymos (quem não é titular/dependente) e "quando usar" das etiquetas
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_contato_contratos (
                  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  contato_id BIGINT UNSIGNED NOT NULL,
                  id_contrato INT NOT NULL,
                  contrato VARCHAR(40) NULL,
                  titular_nome VARCHAR(150) NULL,
                  titular_cpf VARCHAR(14) NULL,
                  plano VARCHAR(80) NULL,
                  relacao VARCHAR(30) NOT NULL DEFAULT 'titular',
                  pode_pagar TINYINT NOT NULL DEFAULT 1,
                  criado_por INT NULL,
                  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE KEY uq_chat_contato_contrato (contato_id, id_contrato)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $acrescentarColuna('chat_etiquetas', 'quando_usar', 'VARCHAR(400) NULL');
    // Esquema 9: quando o contrato foi procurado pelo telefone na Unymos (evita consultar a cada mensagem)
    $acrescentarColuna('chat_contatos_externos', 'uny_busca_em', 'DATETIME NULL');
    // Esquema 10: cobranças geradas pelo Messenger (link, Pix, boleto, recibo) e acompanhamento do Pix
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_cobrancas (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  conversa_id BIGINT UNSIGNED NOT NULL,
                  contato_id BIGINT UNSIGNED NOT NULL,
                  contrato VARCHAR(40) NULL,
                  tipo VARCHAR(10) NOT NULL,
                  valor DECIMAL(10,2) NOT NULL DEFAULT 0,
                  contas VARCHAR(255) NULL,
                  pix_lote_id BIGINT NULL,
                  situacao VARCHAR(2) NOT NULL DEFAULT 'P',
                  criado_por INT NULL,
                  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  verificado_em DATETIME NULL,
                  pago_em DATETIME NULL,
                  KEY ix_chat_cobranca_conversa (conversa_id),
                  KEY ix_chat_cobranca_pix (tipo, situacao)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    // Esquema 11: cópia diária dos contratos da Unymos (situação, plano, etiquetas e aditivo — só vêm na consulta geral)
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_uny_contratos (
                  numero VARCHAR(40) NOT NULL PRIMARY KEY,
                  id_unymos INT NULL,
                  situacao VARCHAR(40) NULL,
                  plano VARCHAR(120) NULL,
                  cobertura VARCHAR(120) NULL,
                  tags VARCHAR(1000) NULL,
                  aditivo_permite TINYINT NULL,
                  titular VARCHAR(150) NULL,
                  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    // Esquema 12 (16/10/2026): Aurora no atendimento — transcrição de áudio, texto do menu e orientação de cada setor, prioridade
    $acrescentarColuna('chat_mensagens', 'transcricao', 'TEXT NULL');
    $acrescentarColuna('chat_setores', 'texto_menu', 'VARCHAR(90) NULL');
    $acrescentarColuna('chat_setores', 'descricao_ia', 'VARCHAR(600) NULL');
    $acrescentarColuna('chat_setores', 'no_menu', 'TINYINT NOT NULL DEFAULT 1');
    $acrescentarColuna('chat_conversas', 'prioridade', 'TINYINT NOT NULL DEFAULT 0');
    $acrescentarColuna('chat_conversas', 'ia_nota_id', 'BIGINT UNSIGNED NULL');
    // Esquema 13 (19/10/2026): escolhas do atendimento funerário que a Aurora vai registrando
    $acrescentarColuna('chat_conversas', 'ia_funeral_json', 'TEXT NULL');
    // Esquema 14 (19/10/2026): venda de plano em andamento com a Aurora (família, plano escolhido, origem do anúncio)
    $acrescentarColuna('chat_conversas', 'ia_venda_json', 'TEXT NULL');
    // Esquema 15 (21/10/2026): conversas de teste da Aurora (simulador e cenários) e o resultado das avaliações
    $acrescentarColuna('chat_conversas', 'teste', 'TINYINT NOT NULL DEFAULT 0');
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_ia_testes (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  rodada VARCHAR(20) NOT NULL,
                  cenario VARCHAR(40) NOT NULL,
                  titulo VARCHAR(150) NOT NULL,
                  conversa_json MEDIUMTEXT NOT NULL,
                  avaliacao_json TEXT NULL,
                  nota TINYINT NULL,
                  aprovado TINYINT NULL,
                  criado_por INT NULL,
                  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  KEY ix_chat_ia_testes_rodada (rodada)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("INSERT INTO chat_config (chave, valor) VALUES ('esquema', '15') ON DUPLICATE KEY UPDATE valor = '15'");
}

/** Lê uma configuração da tela "Configurações do Messenger". */
function msgConfigTela(PDO $pdo, string $chave, ?string $padrao = null): ?string
{
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        try {
            foreach ($pdo->query('SELECT chave, valor FROM chat_config')->fetchAll() as $r) {
                $cache[$r['chave']] = $r['valor'];
            }
        } catch (PDOException $e) {
            $cache = [];
        }
    }
    return array_key_exists($chave, $cache) && $cache[$chave] !== null ? (string) $cache[$chave] : $padrao;
}

function msgTabelaExiste(PDO $pdo, string $tabela): bool
{
    static $cache = [];
    if (!array_key_exists($tabela, $cache)) {
        $st = $pdo->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t LIMIT 1');
        $st->execute([':t' => $tabela]);
        $cache[$tabela] = (bool) $st->fetchColumn();
    }
    return $cache[$tabela];
}

/** Tarefas que rodam depois que a resposta já foi entregue (avisos e notificações). */
function msgDepois(?callable $tarefa = null): array
{
    static $fila = [];
    if ($tarefa !== null) {
        $fila[] = $tarefa;
    }
    return $fila;
}

function msgResponder(array $corpo, int $status = 200): never
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    msgRodarTarefasDepois();
    exit;
}

function msgRodarTarefasDepois(): void
{
    $tarefas = msgDepois();
    if (!$tarefas) {
        return;
    }
    ignore_user_abort(true);
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } elseif (function_exists('litespeed_finish_request')) {
        litespeed_finish_request();
    } else {
        @ob_flush();
        @flush();
    }
    for ($i = 0; $i < count(msgDepois()); $i++) {
        try {
            (msgDepois()[$i])();
        } catch (Throwable $e) {
            error_log('[messenger] tarefa depois da resposta: ' . $e->getMessage());
        }
    }
}

function msgOk($dados = null, string $msg = ''): never
{
    msgResponder(['erro' => false, 'msg' => $msg, 'dados' => $dados]);
}

function msgErro(string $msg, int $status = 400, array $extra = []): never
{
    msgResponder(array_merge(['erro' => true, 'msg' => $msg], $extra), $status);
}

function msgTexto(string $v): string
{
    return trim(preg_replace('/\s+/u', ' ', $v) ?? '');
}

/** Texto de mensagem: mantém quebras de linha, tira espaços das pontas e corta no tamanho máximo. */
function msgTextoMensagem(?string $v): string
{
    $v = str_replace(["\r\n", "\r"], "\n", (string) $v);
    // remove só caracteres de controle; mantém emojis compostos (junção U+200D, seletor de variação, tons de pele)
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
    return mb_substr(trim($v), 0, MSG_TEXTO_MAX);
}

function msgAgora(): string
{
    return date('Y-m-d H:i:s');
}

function msgDataIso(?string $dataMysql): ?string
{
    if ($dataMysql === null || $dataMysql === '') {
        return null;
    }
    $t = DateTime::createFromFormat('Y-m-d H:i:s.v', $dataMysql) ?: DateTime::createFromFormat('Y-m-d H:i:s', $dataMysql);
    return $t ? $t->format('Y-m-d\TH:i:s.vP') : $dataMysql;
}

function msgUuid(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function msgB64UrlEncode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function msgB64UrlDecode(string $txt): string
{
    $txt = strtr(trim($txt), '-_', '+/');
    $pad = strlen($txt) % 4;
    if ($pad) {
        $txt .= str_repeat('=', 4 - $pad);
    }
    return (string) base64_decode($txt, true);
}

/** Requisição HTTP simples com cURL. Retorna ['status'=>int, 'corpo'=>string, 'cabecalhos'=>array, 'erro'=>?string]. */
function msgHttp(string $metodo, string $url, array $cabecalhos = [], ?string $corpo = null, int $timeout = 10): array
{
    $ch = curl_init($url);
    $recebidos = [];
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $metodo,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $cabecalhos,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => min(5, $timeout),
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HEADERFUNCTION => function ($c, string $linha) use (&$recebidos) {
            $p = strpos($linha, ':');
            if ($p !== false) {
                $recebidos[strtolower(trim(substr($linha, 0, $p)))] = trim(substr($linha, $p + 1));
            }
            return strlen($linha);
        },
    ]);
    if ($metodo === 'HEAD') {
        curl_setopt($ch, CURLOPT_NOBODY, true);
    }
    if ($corpo !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $corpo);
    }
    $resp = curl_exec($ch);
    $erro = $resp === false ? curl_error($ch) : null;
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return ['status' => $status, 'corpo' => is_string($resp) ? $resp : '', 'cabecalhos' => $recebidos, 'erro' => $erro];
}

// =====================================================================
// Login e permissão (mesmo modelo do convenio.php)
// =====================================================================

function msgIniciarSessao(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $vida = 8 * 60 * 60;
    ini_set('session.gc_maxlifetime', (string) $vida);
    ini_set('session.cookie_lifetime', (string) $vida);
    session_set_cookie_params([
        'lifetime' => $vida,
        'path' => '/',
        'domain' => '.planoassistencialintegrado.com.br',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'None',
    ]);
    session_start();
}

/** Usuário logado: ['id','usuario','nome','cargo']. Sem login → 401 com need_login. */
function msgUsuario(PDO $pdo): array
{
    msgIniciarSessao();
    if (empty($_SESSION['usuario_nome']) && ($_COOKIE['pai_auth'] ?? '') === '1') {
        $quem = $_COOKIE['pai_user'] ?? $_COOKIE['pai_nome'] ?? $_COOKIE['user'] ?? null;
        if (!empty($quem)) {
            $_SESSION['usuario_nome'] = msgTexto((string) $quem);
        }
    }
    if (empty($_SESSION['usuario_nome'])) {
        msgErro('Sessão expirada. Faça login novamente.', 401, ['need_login' => 1]);
    }
    $idSessao = (int) ($_SESSION['user_id'] ?? $_SESSION['usuario_id'] ?? $_COOKIE['pai_uid'] ?? 0);
    $login = msgTexto((string) ($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
    $nome = msgTexto((string) $_SESSION['usuario_nome']);
    $row = null;
    foreach ([['id', $idSessao > 0 ? $idSessao : null], ['usuario', $login !== '' ? $login : null], ['nome', $nome !== '' ? $nome : null]] as [$col, $v]) {
        if ($v === null || $row) {
            continue;
        }
        $st = $pdo->prepare("SELECT id, usuario, nome, cargo FROM usuarios WHERE {$col} = :v LIMIT 1");
        $st->execute([':v' => $v]);
        $row = $st->fetch() ?: null;
    }
    if (!$row) {
        msgErro('Usuário autenticado não encontrado.', 401, ['need_login' => 1]);
    }
    $_SESSION['user_id'] = (int) $row['id'];
    session_write_close(); // libera a sessão: o app faz várias chamadas ao mesmo tempo
    return [
        'id' => (int) $row['id'],
        'usuario' => (string) ($row['usuario'] ?? ''),
        'nome' => (string) ($row['nome'] ?? $nome),
        'cargo' => strtolower(msgTexto((string) ($row['cargo'] ?? ''))),
    ];
}

function msgTemPagina(PDO $pdo, int $usuarioId, string $pagina = MSG_PAGINA): bool
{
    if ($usuarioId <= 0) {
        return false;
    }
    if (msgTabelaExiste($pdo, 'permissoes')) {
        $st = $pdo->prepare('SELECT 1 FROM permissoes WHERE user_id = :u AND pagina = :p LIMIT 1');
        $st->execute([':u' => $usuarioId, ':p' => $pagina]);
        if ($st->fetchColumn()) {
            return true;
        }
    }
    if (msgTabelaExiste($pdo, 'cargos') && msgTabelaExiste($pdo, 'cargo_paginas')) {
        $st = $pdo->prepare('SELECT 1 FROM usuarios u INNER JOIN cargos c ON c.slug = u.cargo AND c.ativo = 1
                             INNER JOIN cargo_paginas cp ON cp.cargo_id = c.id
                             WHERE u.id = :u AND cp.pagina = :p LIMIT 1');
        $st->execute([':u' => $usuarioId, ':p' => $pagina]);
        if ($st->fetchColumn()) {
            return true;
        }
    }
    return false;
}

/** Ids dos usuários com acesso ao Messenger (permissão direta ou pelo cargo). */
function msgUsuariosComAcesso(PDO $pdo, string $pagina = MSG_PAGINA): array
{
    $ids = [];
    if (msgTabelaExiste($pdo, 'permissoes')) {
        $st = $pdo->prepare('SELECT user_id FROM permissoes WHERE pagina = :p');
        $st->execute([':p' => $pagina]);
        $ids = array_merge($ids, $st->fetchAll(PDO::FETCH_COLUMN));
    }
    if (msgTabelaExiste($pdo, 'cargos') && msgTabelaExiste($pdo, 'cargo_paginas')) {
        $st = $pdo->prepare('SELECT u.id FROM usuarios u INNER JOIN cargos c ON c.slug = u.cargo AND c.ativo = 1
                             INNER JOIN cargo_paginas cp ON cp.cargo_id = c.id WHERE cp.pagina = :p');
        $st->execute([':p' => $pagina]);
        $ids = array_merge($ids, $st->fetchAll(PDO::FETCH_COLUMN));
    }
    return array_values(array_unique(array_map('intval', $ids)));
}

function msgEhAdmin(array $usuario): bool
{
    return ($usuario['cargo'] ?? '') === MSG_CARGO_ADMIN;
}

function msgNomesUsuarios(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) {
        return [];
    }
    $marc = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT id, nome FROM usuarios WHERE id IN ({$marc})");
    $st->execute($ids);
    $nomes = [];
    foreach ($st->fetchAll() as $r) {
        $nomes[(int) $r['id']] = (string) $r['nome'];
    }
    return $nomes;
}

// =====================================================================
// Ably — credencial temporária e avisos em tempo real
// =====================================================================

function msgAblyCanal(int $usuarioId): string
{
    return 'pai-msg:usuario:' . $usuarioId;
}

/**
 * TokenRequest assinado (o navegador troca por um token direto com a Ably).
 * Só permite "subscribe" no canal do próprio usuário; vale 1 hora.
 */
function msgAblyTokenRequest(int $usuarioId): array
{
    $chave = (string) msgConfig('ably_api_key', '');
    if ($chave === '' || !str_contains($chave, ':')) {
        msgErro('Tempo real não configurado (ably_api_key no pai-chaves.php).', 503);
    }
    [$keyName, $segredo] = explode(':', $chave, 2);
    $ttl = 3600 * 1000;
    $recursos = [msgAblyCanal($usuarioId) => ['subscribe']];
    $capability = json_encode($recursos, JSON_UNESCAPED_SLASHES);
    $clientId = 'u' . $usuarioId;
    $timestamp = (int) floor(microtime(true) * 1000);
    $nonce = bin2hex(random_bytes(16));
    $texto = $keyName . "\n" . $ttl . "\n" . $capability . "\n" . $clientId . "\n" . $timestamp . "\n" . $nonce . "\n";
    $mac = base64_encode(hash_hmac('sha256', $texto, $segredo, true));
    return [
        'keyName' => $keyName,
        'ttl' => $ttl,
        'capability' => $capability,
        'clientId' => $clientId,
        'timestamp' => $timestamp,
        'nonce' => $nonce,
        'mac' => $mac,
    ];
}

/**
 * Avisa um evento a vários usuários (um canal por usuário), numa única chamada REST.
 * Nunca interrompe a operação: se falhar, registra no error_log (o app ressincroniza pelo MySQL).
 */
function msgAblyAvisar(array $usuarioIds, string $evento, array $dados): void
{
    $chave = (string) msgConfig('ably_api_key', '');
    $usuarioIds = array_values(array_unique(array_filter(array_map('intval', $usuarioIds))));
    if ($chave === '' || !$usuarioIds) {
        return;
    }
    $canais = array_map('msgAblyCanal', $usuarioIds);
    $corpo = json_encode([[
        'channels' => $canais,
        'messages' => [[
            'name' => $evento,
            'data' => json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'encoding' => 'json',
        ]],
    ]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $r = msgHttp('POST', 'https://rest.ably.io/messages', [
        'Authorization: Basic ' . base64_encode($chave),
        'Content-Type: application/json',
    ], $corpo, 5);
    if ($r['erro'] !== null || $r['status'] < 200 || $r['status'] >= 300) {
        error_log('[messenger] Ably: falha ao avisar (' . $r['status'] . ') ' . ($r['erro'] ?? mb_substr($r['corpo'], 0, 300)));
    }
}

// =====================================================================
// Cloudflare R2 — links assinados (AWS Signature V4, região "auto")
// =====================================================================

function msgR2Configurado(): bool
{
    return msgConfig('r2_access_key_id', '') !== '' && msgConfig('r2_secret_access_key', '') !== ''
        && msgConfig('r2_bucket', '') !== '' && msgR2Host() !== '';
}

function msgR2Host(): string
{
    $endpoint = (string) msgConfig('r2_endpoint', '');
    if ($endpoint === '') {
        $conta = (string) msgConfig('r2_account_id', '');
        return $conta === '' ? '' : $conta . '.r2.cloudflarestorage.com';
    }
    $host = parse_url($endpoint, PHP_URL_HOST);
    return is_string($host) ? $host : '';
}

/** Link assinado para GET, PUT, HEAD ou DELETE de um objeto do bucket. */
function msgR2LinkAssinado(string $metodo, string $chave, int $validadeSegundos, ?int $agora = null, array $extras = []): string
{
    $acesso = (string) msgConfig('r2_access_key_id', '');
    $segredo = (string) msgConfig('r2_secret_access_key', '');
    $bucket = (string) msgConfig('r2_bucket', '');
    $host = msgR2Host();
    $agora = $agora ?? time();
    $data = gmdate('Ymd', $agora);
    $dataHora = gmdate('Ymd\THis\Z', $agora);
    $escopo = "{$data}/auto/s3/aws4_request";
    $caminho = '/' . rawurlencode($bucket) . '/' . implode('/', array_map('rawurlencode', explode('/', $chave)));
    $params = [
        'X-Amz-Algorithm' => 'AWS4-HMAC-SHA256',
        'X-Amz-Credential' => "{$acesso}/{$escopo}",
        'X-Amz-Date' => $dataHora,
        'X-Amz-Expires' => (string) $validadeSegundos,
        'X-Amz-SignedHeaders' => 'host',
    ] + $extras; // ex.: response-content-disposition (baixar com o nome do arquivo)
    ksort($params);
    $consulta = implode('&', array_map(fn($k, $v) => rawurlencode($k) . '=' . rawurlencode($v), array_keys($params), $params));
    $canonica = "{$metodo}\n{$caminho}\n{$consulta}\nhost:{$host}\n\nhost\nUNSIGNED-PAYLOAD";
    $paraAssinar = "AWS4-HMAC-SHA256\n{$dataHora}\n{$escopo}\n" . hash('sha256', $canonica);
    $k = hash_hmac('sha256', $data, 'AWS4' . $segredo, true);
    $k = hash_hmac('sha256', 'auto', $k, true);
    $k = hash_hmac('sha256', 's3', $k, true);
    $k = hash_hmac('sha256', 'aws4_request', $k, true);
    $assinatura = hash_hmac('sha256', $paraAssinar, $k);
    return "https://{$host}{$caminho}?{$consulta}&X-Amz-Signature={$assinatura}";
}

/** Confere se o objeto existe no R2. Retorna ['tamanho'=>int,'mime'=>string] ou null. */
function msgR2Info(string $chave): ?array
{
    $r = msgHttp('HEAD', msgR2LinkAssinado('HEAD', $chave, 120), [], null, 10);
    if ($r['status'] !== 200) {
        return null;
    }
    return ['tamanho' => (int) ($r['cabecalhos']['content-length'] ?? 0), 'mime' => (string) ($r['cabecalhos']['content-type'] ?? '')];
}

/** Envia bytes ao R2 pelo próprio servidor (mídias recebidas do WhatsApp). */
function msgR2Enviar(string $chave, string $bytes, string $mime): bool
{
    $r = msgHttp('PUT', msgR2LinkAssinado('PUT', $chave, 300), ['Content-Type: ' . $mime], $bytes, 60);
    if ($r['status'] < 200 || $r['status'] >= 300) {
        error_log('[messenger] R2: falha ao enviar ' . $chave . ' (' . $r['status'] . ') ' . ($r['erro'] ?? mb_substr($r['corpo'], 0, 300)));
        return false;
    }
    return true;
}

/** Tipos aceitos: mime → [tipo de mensagem, extensão]. */
function msgMimesAceitos(): array
{
    return [
        'image/jpeg' => ['imagem', 'jpg'], 'image/png' => ['imagem', 'png'], 'image/webp' => ['imagem', 'webp'], 'image/gif' => ['imagem', 'gif'],
        'audio/ogg' => ['audio', 'ogg'], 'audio/mp4' => ['audio', 'm4a'], 'audio/mpeg' => ['audio', 'mp3'], 'audio/aac' => ['audio', 'aac'],
        'audio/webm' => ['audio', 'webm'], 'audio/amr' => ['audio', 'amr'],
        'video/mp4' => ['documento', 'mp4'], 'video/3gpp' => ['documento', '3gp'],
        'application/pdf' => ['documento', 'pdf'],
        'application/msword' => ['documento', 'doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['documento', 'docx'],
        'application/vnd.ms-excel' => ['documento', 'xls'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['documento', 'xlsx'],
        'application/vnd.ms-powerpoint' => ['documento', 'ppt'],
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => ['documento', 'pptx'],
        'text/plain' => ['documento', 'txt'],
    ];
}

/** Limite de tamanho por tipo de mensagem (bytes). */
function msgLimiteTamanho(string $tipo): int
{
    return match ($tipo) {
        'imagem' => 10 * 1024 * 1024,
        'audio' => 16 * 1024 * 1024,
        default => 20 * 1024 * 1024,
    };
}

function msgMimeBase(string $mime): string
{
    return strtolower(trim(explode(';', $mime)[0]));
}

/** Chave nova no bucket: chat/<origem>/<ano>/<mês>/<código>.<ext> */
function msgR2NovaChave(string $origem, string $ext): string
{
    return 'chat/' . $origem . '/' . date('Y') . '/' . date('m') . '/' . bin2hex(random_bytes(16)) . '.' . $ext;
}

// =====================================================================
// Notificações pelo OneSignal (o mesmo que o app já usa)
// =====================================================================
//
// O app registra cada aparelho no OneSignal com OneSignal.login(<identificador>) — hoje o nome da pessoa
// (cookie pai_name, ver components/OneSignalInit.tsx). Aqui o envio usa o mesmo identificador, lido da
// tabela usuarios: coluna definida em onesignal_identificador ('nome' por padrão; 'usuario' ou 'id' se o
// app passar a fazer login no OneSignal pelo login ou pelo id).

const MSG_ONESIGNAL_APP_ID_PADRAO = '8f845647-2474-4ede-9e74-96f911bf9c88'; // o mesmo do OneSignalInit.tsx
const MSG_APP_URL_PADRAO = 'https://pai.planoassistencialintegrado.com.br';

function msgOneSignalAppId(): string
{
    $id = trim((string) msgConfig('onesignal_app_id', ''));
    return $id !== '' ? $id : MSG_ONESIGNAL_APP_ID_PADRAO;
}

/** Mesma chave do informativo.php (onesignal_api_key); aceita também a antiga onesignal_rest_api_key. */
function msgOneSignalChave(): string
{
    $chave = trim((string) msgConfig('onesignal_api_key', ''));
    return $chave !== '' ? $chave : trim((string) msgConfig('onesignal_rest_api_key', ''));
}

function msgOneSignalConfigurado(): bool
{
    return msgOneSignalAppId() !== '' && msgOneSignalChave() !== '';
}

/** Mesmo formato de nome do informativo.php (titlecase). */
function msgTitleCase(string $s): string
{
    $s = trim($s);
    return $s === '' ? '' : mb_convert_case(mb_strtolower($s, 'UTF-8'), MB_CASE_TITLE, 'UTF-8');
}

/**
 * Identificadores (external_id) com que CADA destinatário pode estar no OneSignal.
 * O app faz OneSignal.login(cookie pai_name); como esse valor pode ser o nome ou o login (e em titlecase),
 * a busca usa as formas do PRÓPRIO usuário destinatário — nunca de outra pessoa — e o OneSignal entrega
 * só aos aparelhos ligados a ele. Com onesignal_identificador = 'nome' | 'usuario' | 'id', usa só aquela coluna.
 * Devolve [usuario_id => [identificadores]].
 */
function msgOneSignalIdentificadores(PDO $pdo, array $usuarioIds): array
{
    $usuarioIds = array_values(array_unique(array_filter(array_map('intval', $usuarioIds))));
    if (!$usuarioIds) {
        return [];
    }
    $coluna = trim((string) msgConfig('onesignal_identificador', ''));
    $marc = implode(',', array_fill(0, count($usuarioIds), '?'));
    $st = $pdo->prepare("SELECT id, nome, usuario FROM usuarios WHERE id IN ({$marc})");
    $st->execute($usuarioIds);
    $saida = [];
    foreach ($st->fetchAll() as $u) {
        $nome = trim((string) ($u['nome'] ?? ''));
        $login = trim((string) ($u['usuario'] ?? ''));
        if ($coluna === 'nome') {
            $formas = [$nome];
        } elseif ($coluna === 'usuario') {
            $formas = [$login];
        } elseif ($coluna === 'id') {
            $formas = [(string) $u['id']];
        } else {
            $formas = [$nome, $login, msgTitleCase($nome), msgTitleCase($login)];
        }
        $formas = array_values(array_unique(array_filter($formas, fn($v) => $v !== '')));
        if ($formas) {
            $saida[(int) $u['id']] = $formas;
        }
    }
    return $saida;
}

/** Canal das notificações do Messenger: sempre o OneSignal (07/10/2026). Mantido para o perfil da tela. */
function msgCanalNotificacoes(): string
{
    return 'onesignal';
}

/** Se o OneSignal está configurado (mesmas chaves do informativo.php). */
function msgNotificacoesConfiguradas(): bool
{
    return msgOneSignalConfigurado();
}

/**
 * Envia a notificação "Nova mensagem" aos destinatários (nunca ao autor). Sem o OneSignal configurado, não faz nada.
 * $dados: ['titulo','corpo','conversa_id','url','tag'].
 */
function msgPushEnviar(PDO $pdo, array $usuarioIds, array $dados): void
{
    $usuarioIds = array_values(array_unique(array_filter(array_map('intval', $usuarioIds))));
    if ($usuarioIds) {
        msgOneSignalEnviar($pdo, $usuarioIds, $dados);
    }
}

/**
 * Notificação pelo OneSignal, no mesmo formato do informativo.php (endpoint v1, Authorization: Basic,
 * chaves onesignal_app_id / onesignal_api_key do pai-chaves.php), mas SÓ para os destinatários:
 * em conversa individual, só a outra pessoa; em grupo, os outros membros; nunca quem enviou
 * (a lista vem de msgDifundir, que já tira o autor e quem silenciou a conversa).
 * Uma chamada por destinatário, para cada um receber uma única notificação, que ao ser tocada abre
 * https://pai.planoassistencialintegrado.com.br/messenger?conversa=<id> (a conversa com o remetente).
 * Cada envio é registrado em onesignal_debug.log (o mesmo arquivo do informativo.php), com prefixo MESSENGER.
 */
function msgOneSignalEnviar(PDO $pdo, array $usuarioIds, array $dados): void
{
    if (!msgOneSignalConfigurado()) {
        return;
    }
    $destinos = msgOneSignalIdentificadores($pdo, $usuarioIds);
    if (!$destinos) {
        return;
    }
    $titulo = (string) ($dados['titulo'] ?? 'Messenger');
    $corpo = (string) ($dados['corpo'] ?? 'Nova mensagem');
    $conversaId = (int) ($dados['conversa_id'] ?? 0);
    $rota = (string) ($dados['rota'] ?? ($conversaId > 0 ? '/messenger?conversa=' . $conversaId : '/messenger'));
    $clickUrl = rtrim((string) msgConfig('app_url', MSG_APP_URL_PADRAO), '/') . $rota;
    $tag = (string) ($dados['tag'] ?? ('conversa-' . $conversaId));

    foreach ($destinos as $usuarioId => $identificadores) {
        $fields = [
            'app_id' => msgOneSignalAppId(),
            'target_channel' => 'push',
            'include_aliases' => ['external_id' => $identificadores],
            'headings' => ['en' => $titulo, 'pt' => $titulo],
            'contents' => ['en' => $corpo, 'pt' => $corpo],
            // abre a conversa certa dentro do PWA
            'url' => $clickUrl,
            // Android e computador: ícone pequeno de mensagem (arquivo do app: public/push/messenger-badge.png)
            'chrome_web_badge' => rtrim((string) msgConfig('app_url', MSG_APP_URL_PADRAO), '/') . '/push/messenger-badge.png',
            // mensagens seguidas da mesma conversa substituem a anterior em vez de empilhar
            'web_push_topic' => $tag,
            'thread_id' => $tag,
            'android_group' => $tag,
            'ttl' => 86400,
            'data' => [
                'rota' => $rota,
                'tipo' => 'messenger',
                'origem' => 'messenger',
                'conversa_id' => $conversaId,
                'usuario_id' => (int) $usuarioId,
            ],
        ];
        $http = 0;
        $resp = '';
        try {
            $r = msgHttp('POST', 'https://onesignal.com/api/v1/notifications', [
                'Content-Type: application/json; charset=utf-8',
                'Authorization: Basic ' . msgOneSignalChave(),
            ], json_encode($fields, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 8);
            $http = (int) $r['status'];
            $resp = (string) ($r['erro'] ?? $r['corpo']);
        } catch (Throwable $e) {
            $resp = $e->getMessage();
        }
        @file_put_contents(
            __DIR__ . '/onesignal_debug.log',
            date('Y-m-d H:i:s') . ' MESSENGER | PARA:' . $usuarioId . ' (' . implode(' / ', $identificadores) . ')'
                . ' | CONVERSA:' . $conversaId . ' | URL:' . $clickUrl . ' | HTTP:' . $http . "\n" . $resp . "\n\n",
            FILE_APPEND
        );
    }
}

// =====================================================================
// WhatsApp Cloud API (Meta)
// =====================================================================

function msgMetaConfigurado(): bool
{
    return msgConfig('meta_access_token', '') !== '' && msgConfig('meta_phone_number_id', '') !== '';
}

function msgMetaUrl(string $caminho): string
{
    $versao = (string) msgConfig('meta_graph_versao', 'v23.0');
    return 'https://graph.facebook.com/' . $versao . '/' . ltrim($caminho, '/');
}

/** Chamada à Graph API. Retorna ['ok'=>bool, 'status'=>int, 'json'=>array, 'erro'=>string]. */
function msgMeta(string $metodo, string $caminho, ?array $corpo = null, int $timeout = 15): array
{
    // conversa de teste da Aurora (simulador): nada sai para a Meta; finge o envio aceito
    if (is_array($corpo) && str_starts_with((string) ($corpo['to'] ?? $corpo['recipient'] ?? ''), 'teste')) {
        return ['ok' => true, 'status' => 200, 'json' => ['messages' => [['id' => 'wamid.teste.' . bin2hex(random_bytes(6))]]], 'erro' => '', 'corpo' => ''];
    }
    $r = msgHttp($metodo, msgMetaUrl($caminho), [
        'Authorization: Bearer ' . msgConfig('meta_access_token', ''),
        'Content-Type: application/json',
    ], $corpo === null ? null : json_encode($corpo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $timeout);
    $json = json_decode($r['corpo'], true);
    $json = is_array($json) ? $json : [];
    $ok = $r['erro'] === null && $r['status'] >= 200 && $r['status'] < 300;
    $erro = '';
    if (!$ok) {
        $erro = (string) ($json['error']['error_user_msg'] ?? $json['error']['message'] ?? $r['erro'] ?? ('HTTP ' . $r['status']));
    }
    return ['ok' => $ok, 'status' => $r['status'], 'json' => $json, 'erro' => mb_substr($erro, 0, 250)];
}

/** Baixa uma mídia recebida do WhatsApp. Retorna ['bytes','mime'] ou null. */
function msgMetaBaixarMidia(string $mediaId): ?array
{
    $info = msgMeta('GET', $mediaId);
    $url = (string) ($info['json']['url'] ?? '');
    if (!$info['ok'] || $url === '') {
        error_log('[messenger] Meta: mídia ' . $mediaId . ' sem URL (' . $info['erro'] . ')');
        return null;
    }
    $r = msgHttp('GET', $url, ['Authorization: Bearer ' . msgConfig('meta_access_token', '')], null, 60);
    if ($r['status'] !== 200 || $r['corpo'] === '') {
        error_log('[messenger] Meta: falha ao baixar mídia ' . $mediaId . ' (' . $r['status'] . ')');
        return null;
    }
    return ['bytes' => $r['corpo'], 'mime' => msgMimeBase((string) ($info['json']['mime_type'] ?? $r['cabecalhos']['content-type'] ?? 'application/octet-stream'))];
}

// =====================================================================
// Conversas e mensagens
// =====================================================================

function msgConversa(PDO $pdo, int $conversaId): ?array
{
    $st = $pdo->prepare('SELECT * FROM chat_conversas WHERE id = :id');
    $st->execute([':id' => $conversaId]);
    return $st->fetch() ?: null;
}

/** Participantes ativos: [usuario_id => ['papel','ultima_lida_id','silenciada']]. */
function msgParticipantes(PDO $pdo, int $conversaId): array
{
    $st = $pdo->prepare('SELECT usuario_id, papel, ultima_lida_id, silenciada FROM chat_participantes WHERE conversa_id = :c AND saiu_em IS NULL');
    $st->execute([':c' => $conversaId]);
    $lista = [];
    foreach ($st->fetchAll() as $r) {
        $lista[(int) $r['usuario_id']] = ['papel' => $r['papel'], 'ultima_lida_id' => (int) $r['ultima_lida_id'], 'silenciada' => (int) $r['silenciada'] === 1];
    }
    return $lista;
}

function msgAdicionarParticipante(PDO $pdo, int $conversaId, int $usuarioId, string $papel = 'membro'): void
{
    $st = $pdo->prepare('INSERT INTO chat_participantes (conversa_id, usuario_id, papel, entrou_em, ultima_lida_id)
                         VALUES (:c, :u, :p, NOW(), COALESCE((SELECT ultima_mensagem_id FROM chat_conversas WHERE id = :c2), 0))
                         ON DUPLICATE KEY UPDATE papel = IF(saiu_em IS NULL, papel, VALUES(papel)),
                                                 entrou_em = IF(saiu_em IS NULL, entrou_em, NOW()),
                                                 saiu_em = NULL');
    $st->execute([':c' => $conversaId, ':u' => $usuarioId, ':p' => $papel, ':c2' => $conversaId]);
}

function msgRemoverParticipante(PDO $pdo, int $conversaId, int $usuarioId): void
{
    $pdo->prepare('UPDATE chat_participantes SET saiu_em = NOW() WHERE conversa_id = :c AND usuario_id = :u AND saiu_em IS NULL')
        ->execute([':c' => $conversaId, ':u' => $usuarioId]);
}

/** Atendentes do WhatsApp: usuários com a página messenger-clientes (permissão direta ou pelo cargo). */
function msgAtendentesAtivos(PDO $pdo): array
{
    return msgUsuariosComAcesso($pdo, MSG_PAGINA_ATENDENTE);
}

/**
 * Atendentes que recebem um cliente da fila: os do setor da conversa (se o setor tiver atendentes cadastrados);
 * sem setor, ou setor sem ninguém cadastrado, todos os atendentes (como antes dos setores).
 */
function msgAtendentesDoSetor(PDO $pdo, int $setorId): array
{
    $todos = msgAtendentesAtivos($pdo);
    if ($setorId <= 0) {
        return $todos;
    }
    try {
        $st = $pdo->prepare('SELECT usuario_id FROM chat_setor_membros WHERE setor_id = :s');
        $st->execute([':s' => $setorId]);
        $membros = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    } catch (PDOException $e) {
        return $todos;
    }
    $doSetor = array_values(array_intersect($membros, array_map('intval', $todos)));
    return $doSetor ?: $todos;
}

/** Setores em que o usuário atende (ativos). Vazio = não está em nenhum setor. */
function msgSetoresDoUsuario(PDO $pdo, int $usuarioId): array
{
    try {
        $st = $pdo->prepare('SELECT m.setor_id FROM chat_setor_membros m INNER JOIN chat_setores s ON s.id = m.setor_id AND s.ativo = 1 WHERE m.usuario_id = :u');
        $st->execute([':u' => $usuarioId]);
        return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    } catch (PDOException $e) {
        return [];
    }
}

/**
 * Situação de um setor agora, pelos horários e exceções cadastrados.
 * Retorna ['aberto' => bool, 'texto' => 'Aberto · fecha às 18:00' | 'Fechado · abre amanhã às 08:00' | ..., 'proximo' => 'amanhã às 08:00' | null]
 */
function msgSituacaoSetor(array $setor, array $horarios, array $excecoes, ?int $agora = null): array
{
    $agora = $agora ?? time();
    if (empty($setor['ativo'])) {
        return ['aberto' => false, 'texto' => 'Inativo', 'proximo' => null];
    }
    if (!empty($setor['plantao'])) {
        return ['aberto' => true, 'texto' => 'Plantão 24 h', 'proximo' => null];
    }
    $faixasDoDia = function (int $dia) use ($horarios, $excecoes): array {
        $data = date('Y-m-d', $dia);
        foreach ($excecoes as $e) {
            if ($e['data'] === $data) {
                return $e['fechado'] ? [] : [[substr((string) $e['inicio'], 0, 5), substr((string) $e['fim'], 0, 5)]];
            }
        }
        $semana = (int) date('w', $dia);
        $lista = [];
        foreach ($horarios as $h) {
            if ((int) $h['dia_semana'] === $semana) {
                $lista[] = [substr((string) $h['inicio'], 0, 5), substr((string) $h['fim'], 0, 5)];
            }
        }
        usort($lista, fn($a, $b) => strcmp($a[0], $b[0]));
        return $lista;
    };
    $hora = date('H:i', $agora);
    foreach ($faixasDoDia($agora) as [$ini, $fim]) {
        if ($hora >= $ini && $hora < $fim) {
            return ['aberto' => true, 'texto' => 'Aberto · fecha às ' . $fim, 'proximo' => null];
        }
    }
    $nomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    for ($d = 0; $d <= 7; $d++) {
        $dia = strtotime("+{$d} day", strtotime(date('Y-m-d 00:00:00', $agora)));
        foreach ($faixasDoDia($dia) as [$ini]) {
            if ($d === 0 && $ini <= $hora) {
                continue;
            }
            $quando = $d === 0 ? 'hoje' : ($d === 1 ? 'amanhã' : $nomes[(int) date('w', $dia)]);
            $proximo = $quando . ' às ' . $ini;
            return ['aberto' => false, 'texto' => 'Fechado · abre ' . $proximo, 'proximo' => $proximo];
        }
    }
    return ['aberto' => false, 'texto' => 'Fechado', 'proximo' => null];
}

function msgEhAtendente(PDO $pdo, int $usuarioId): bool
{
    return msgTemPagina($pdo, $usuarioId, MSG_PAGINA_ATENDENTE);
}

function msgEhGestao(PDO $pdo, int $usuarioId): bool
{
    return msgTemPagina($pdo, $usuarioId, MSG_PAGINA_GESTAO);
}

/** Muda o papel de quem já participa (ex.: responsável que vira observador). */
function msgDefinirPapel(PDO $pdo, int $conversaId, int $usuarioId, string $papel): void
{
    $pdo->prepare('UPDATE chat_participantes SET papel = :p WHERE conversa_id = :c AND usuario_id = :u AND saiu_em IS NULL')
        ->execute([':p' => $papel, ':c' => $conversaId, ':u' => $usuarioId]);
}

/**
 * Quem pode ver a conversa: participante ativo; na fila (cliente aguardando), os atendentes;
 * conversa de cliente na fila ou em andamento, também a Gestão (vê sem participar).
 */
function msgPodeVer(PDO $pdo, array $conversa, array $usuario): bool
{
    $st = $pdo->prepare('SELECT 1 FROM chat_participantes WHERE conversa_id = :c AND usuario_id = :u AND saiu_em IS NULL');
    $st->execute([':c' => $conversa['id'], ':u' => $usuario['id']]);
    if ($st->fetchColumn()) {
        return true;
    }
    if ($conversa['tipo'] === 'externo' && $conversa['status_atendimento'] === 'aguardando' && msgEhAtendente($pdo, (int) $usuario['id'])) {
        return true;
    }
    if ($conversa['tipo'] === 'externo' && in_array($conversa['status_atendimento'], ['aguardando', 'em_atendimento'], true)) {
        return msgEhGestao($pdo, (int) $usuario['id']);
    }
    return false;
}

/** Usuários da Gestão (página messenger-historico). */
function msgGestores(PDO $pdo): array
{
    return msgUsuariosComAcesso($pdo, MSG_PAGINA_GESTAO);
}

/**
 * Quem recebe os avisos de tempo real de uma conversa: participantes ativos; na fila, também os atendentes;
 * em conversa de cliente, também a Gestão (só para a lista e a conversa aberta se atualizarem).
 * $comGestao = false: só quem participa (e a fila) — é a lista usada para NOTIFICAR.
 */
function msgDestinatarios(PDO $pdo, array $conversa, bool $comGestao = true): array
{
    if (!empty($conversa['teste'])) {
        return []; // conversa do simulador: ninguém é avisado
    }
    $ids = array_keys(msgParticipantes($pdo, (int) $conversa['id']));
    if ($conversa['tipo'] === 'externo' && $conversa['status_atendimento'] === 'aguardando') {
        $ids = array_merge($ids, msgAtendentesDoSetor($pdo, isset($conversa['setor_id']) ? (int) $conversa['setor_id'] : 0));
    }
    if ($comGestao && $conversa['tipo'] === 'externo') {
        $ids = array_merge($ids, msgGestores($pdo));
    }
    return array_values(array_unique(array_map('intval', $ids)));
}

/**
 * O usuário participou deste atendimento de cliente: foi responsável, transferiu ou recebeu, escreveu nele ou encerrou.
 * Quem não é da Gestão só vê no histórico os atendimentos em que participou.
 */
function msgParticipouAtendimento(PDO $pdo, int $atendimentoId, int $usuarioId): bool
{
    $st = $pdo->prepare('SELECT 1 FROM chat_atendimentos a
                          WHERE a.id = :a AND (a.responsavel_usuario_id = :u1 OR a.encerrado_por = :u2
                             OR EXISTS (SELECT 1 FROM chat_transferencias t WHERE t.atendimento_id = a.id AND (t.de_usuario_id = :u3 OR t.para_usuario_id = :u4))
                             OR EXISTS (SELECT 1 FROM chat_mensagens m WHERE m.atendimento_id = a.id AND m.autor_usuario_id = :u5))');
    $st->execute([':a' => $atendimentoId, ':u1' => $usuarioId, ':u2' => $usuarioId, ':u3' => $usuarioId, ':u4' => $usuarioId, ':u5' => $usuarioId]);
    return (bool) $st->fetchColumn();
}

/** Busca mensagens já no formato da resposta (com anexos e nome do autor). */
function msgBuscarMensagens(PDO $pdo, string $onde, array $params, int $limite, string $ordem = 'ASC'): array
{
    $ordem = $ordem === 'DESC' ? 'DESC' : 'ASC';
    $sql = "SELECT m.*, u.nome AS autor_usuario_nome, COALESCE(NULLIF(ce.nome_salvo, ''), ce.nome) AS autor_contato_nome
              FROM chat_mensagens m
              LEFT JOIN usuarios u ON u.id = m.autor_usuario_id
              LEFT JOIN chat_contatos_externos ce ON ce.id = m.autor_contato_id
             WHERE {$onde}
             ORDER BY m.id {$ordem}
             LIMIT " . max(1, min(1000, $limite));
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $linhas = $st->fetchAll();
    if (!$linhas) {
        return [];
    }
    $ids = array_map(fn($l) => (int) $l['id'], $linhas);
    $marc = implode(',', array_fill(0, count($ids), '?'));
    $sa = $pdo->prepare("SELECT * FROM chat_anexos WHERE mensagem_id IN ({$marc}) ORDER BY id");
    $sa->execute($ids);
    $anexos = [];
    foreach ($sa->fetchAll() as $a) {
        $anexos[(int) $a['mensagem_id']][] = $a;
    }
    $reacoes = [];
    try {
        $sr = $pdo->prepare("SELECT r.mensagem_id, r.usuario_id, r.emoji, u.nome FROM chat_reacoes r LEFT JOIN usuarios u ON u.id = r.usuario_id
                              WHERE r.mensagem_id IN ({$marc}) ORDER BY r.criado_em");
        $sr->execute($ids);
        foreach ($sr->fetchAll() as $r) {
            $reacoes[(int) $r['mensagem_id']][] = ['emoji' => $r['emoji'], 'usuario_id' => (int) $r['usuario_id'], 'nome' => $r['nome']];
        }
    } catch (PDOException $e) {
        $reacoes = [];
    }
    return array_map(fn($l) => msgFormatarMensagem($l, $anexos[(int) $l['id']] ?? []) + [
        'interna' => !empty($l['interna']),
        'transcricao' => isset($l['transcricao']) && $l['transcricao'] !== '' ? $l['transcricao'] : null,
        'reacoes' => $reacoes[(int) $l['id']] ?? [],
    ], $linhas);
}

function msgFormatarMensagem(array $m, array $anexos): array
{
    $apagada = $m['apagada_em'] !== null;
    return [
        'id' => (int) $m['id'],
        'conversa_id' => (int) $m['conversa_id'],
        'autor_tipo' => $m['autor_tipo'],
        'autor_usuario_id' => $m['autor_usuario_id'] !== null ? (int) $m['autor_usuario_id'] : null,
        'autor_contato_id' => $m['autor_contato_id'] !== null ? (int) $m['autor_contato_id'] : null,
        'autor_nome' => $m['autor_tipo'] === 'contato' ? ($m['autor_contato_nome'] ?? 'Cliente') : ($m['autor_usuario_nome'] ?? null),
        'tipo' => $m['tipo'],
        'texto' => $apagada ? null : $m['texto'],
        'responde_a_id' => $m['responde_a_id'] !== null ? (int) $m['responde_a_id'] : null,
        'cliente_uuid' => $m['cliente_uuid'],
        'status_envio' => $m['status_envio'],
        'erro_envio' => $m['erro_envio'],
        'apagada' => $apagada,
        'criado_em' => msgDataIso($m['criado_em']),
        'anexos' => $apagada ? [] : array_map(fn($a) => [
            'id' => (int) $a['id'],
            'mime' => $a['mime'],
            'nome_original' => $a['nome_original'],
            'tamanho_bytes' => (int) $a['tamanho_bytes'],
            'duracao_s' => $a['duracao_s'] !== null ? (int) $a['duracao_s'] : null,
            'largura' => $a['largura'] !== null ? (int) $a['largura'] : null,
            'altura' => $a['altura'] !== null ? (int) $a['altura'] : null,
            'tem_miniatura' => !empty($a['miniatura_chave']),
        ], $anexos),
    ];
}

function msgMensagemPorId(PDO $pdo, int $id): ?array
{
    $l = msgBuscarMensagens($pdo, 'm.id = :id', [':id' => $id], 1);
    return $l[0] ?? null;
}

/**
 * Grava uma mensagem e atualiza a conversa. Retorna o id.
 * $dados: autor_tipo, autor_usuario_id, autor_contato_id, tipo, texto, responde_a_id, cliente_uuid, externo_id, status_envio, anexos[]
 */
function msgGravar(PDO $pdo, int $conversaId, array $dados): int
{
    $st = $pdo->prepare('INSERT INTO chat_mensagens (conversa_id, atendimento_id, autor_tipo, autor_usuario_id, autor_contato_id, tipo, texto, responde_a_id,
                                                     cliente_uuid, externo_id, status_envio, criado_em)
                         VALUES (:c, :atd, :at, :au, :ac, :t, :tx, :r, :cu, :ex, :se, :em)');
    $st->execute([
        ':c' => $conversaId,
        ':atd' => $dados['atendimento_id'] ?? null,
        ':at' => $dados['autor_tipo'],
        ':au' => $dados['autor_usuario_id'] ?? null,
        ':ac' => $dados['autor_contato_id'] ?? null,
        ':t' => $dados['tipo'] ?? 'texto',
        ':tx' => $dados['texto'] ?? null,
        ':r' => $dados['responde_a_id'] ?? null,
        ':cu' => $dados['cliente_uuid'] ?? null,
        ':ex' => $dados['externo_id'] ?? null,
        ':se' => $dados['status_envio'] ?? null,
        ':em' => $dados['criado_em'] ?? date('Y-m-d H:i:s.v'),
    ]);
    $id = (int) $pdo->lastInsertId();
    foreach ($dados['anexos'] ?? [] as $a) {
        $pdo->prepare('INSERT INTO chat_anexos (mensagem_id, chave_r2, nome_original, mime, tamanho_bytes, duracao_s, largura, altura, miniatura_chave)
                       VALUES (:m, :k, :n, :mi, :tb, :d, :l, :a, :mk)')->execute([
            ':m' => $id,
            ':k' => $a['chave_r2'],
            ':n' => $a['nome_original'] ?? null,
            ':mi' => $a['mime'],
            ':tb' => (int) ($a['tamanho_bytes'] ?? 0),
            ':d' => $a['duracao_s'] ?? null,
            ':l' => $a['largura'] ?? null,
            ':a' => $a['altura'] ?? null,
            ':mk' => $a['miniatura_chave'] ?? null,
        ]);
    }
    $pdo->prepare('UPDATE chat_conversas SET ultima_mensagem_id = :m, ultima_mensagem_em = NOW() WHERE id = :c')
        ->execute([':m' => $id, ':c' => $conversaId]);
    if (($dados['autor_tipo'] ?? '') === 'usuario' && !empty($dados['autor_usuario_id'])) {
        // quem escreve já leu até a própria mensagem
        $pdo->prepare('UPDATE chat_participantes SET ultima_lida_id = GREATEST(ultima_lida_id, :m) WHERE conversa_id = :c AND usuario_id = :u')
            ->execute([':m' => $id, ':c' => $conversaId, ':u' => (int) $dados['autor_usuario_id']]);
    }
    return $id;
}

/** Mensagem de sistema na conversa (ex.: "Ana criou o grupo"), já avisada a todos. */
function msgSistema(PDO $pdo, int $conversaId, string $texto): void
{
    $conversa = msgConversa($pdo, $conversaId);
    $id = msgGravar($pdo, $conversaId, ['autor_tipo' => 'sistema', 'tipo' => 'sistema', 'texto' => $texto,
                                        'atendimento_id' => $conversa['atendimento_atual_id'] ?? null]);
    $msg = msgMensagemPorId($pdo, $id);
    if ($conversa && $msg) {
        $dest = msgDestinatarios($pdo, $conversa);
        msgDepois(fn() => msgAblyAvisar($dest, 'mensagem', $msg));
    }
}

/** Texto curto para notificação e prévia da lista. */
function msgPrevia(array $msg): string
{
    if ($msg['apagada'] ?? false) {
        return 'Mensagem apagada';
    }
    return match ($msg['tipo']) {
        'imagem' => '📷 Foto' . (!empty($msg['texto']) ? ': ' . $msg['texto'] : ''),
        'audio' => '🎤 Áudio',
        'documento' => '📄 ' . ($msg['anexos'][0]['nome_original'] ?? 'Documento'),
        'modelo' => '📋 ' . ($msg['texto'] ?? 'Modelo'),
        default => (string) ($msg['texto'] ?? ''),
    };
}

/**
 * Depois de gravar: avisa todos pela Ably (tempo real) e notifica UMA vez, pelo canal configurado, quem participa,
 * não é o autor e não silenciou a conversa.
 * Roda depois da resposta, para não atrasar quem enviou.
 */
function msgDifundir(PDO $pdo, int $conversaId, int $mensagemId, ?int $autorUsuarioId): void
{
    $conversa = msgConversa($pdo, $conversaId);
    $msg = msgMensagemPorId($pdo, $mensagemId);
    if (!$conversa || !$msg) {
        return;
    }
    $destinatarios = msgDestinatarios($pdo, $conversa);
    $participantes = msgParticipantes($pdo, $conversaId);
    $paraPush = [];
    // notifica só quem participa (e, na fila, os atendentes); a Gestão que só acompanha não é notificada
    foreach (msgDestinatarios($pdo, $conversa, false) as $uid) {
        if ($uid === $autorUsuarioId) {
            continue;
        }
        if (in_array($conversa['bot_estado'] ?? null, ['menu', 'ia'], true) && !isset($participantes[$uid])) {
            continue; // cliente ainda escolhendo o setor no menu automático: a fila é avisada depois da escolha
        }
        if (isset($participantes[$uid]) && ($participantes[$uid]['papel'] ?? '') === 'observador') {
            continue; // regra antiga de observador: não é mais notificado
        }
        if (isset($participantes[$uid]) && $participantes[$uid]['silenciada']) {
            continue;
        }
        $paraPush[] = $uid;
    }
    // 07/10/2026: a notificação mostra quem enviou e a prévia da mensagem (decisão do usuário)
    [$titulo, $corpo] = msgNotificacaoTexto($conversa, $msg);
    $notificacao = [
        'titulo' => $titulo,
        'corpo' => $corpo,
        'conversa_id' => $conversaId,
        'url' => '/messenger?conversa=' . $conversaId,
        'tag' => 'conversa-' . $conversaId,
    ];
    msgDepois(function () use ($pdo, $destinatarios, $msg, $paraPush, $notificacao) {
        // 14/10/2026: "notificar" diz a cada tela se ESTA pessoa deve ver o aviso de mensagem nova.
        // Só quem participa (ou a fila, para os atendentes) é avisado; a Gestão que só acompanha, não.
        $paraPush = array_values(array_unique(array_map('intval', $paraPush)));
        $semAviso = array_values(array_diff(array_map('intval', $destinatarios), $paraPush));
        if ($paraPush) {
            msgAblyAvisar($paraPush, 'mensagem', $msg + ['notificar' => true]);
        }
        if ($semAviso) {
            msgAblyAvisar($semAviso, 'mensagem', $msg + ['notificar' => false]);
        }
        // notificação do aparelho só para quem NÃO está com o app na tela (esses já veem o aviso dentro do app)
        $naTela = msgUsuariosNaTela($pdo, $paraPush);
        msgPushEnviar($pdo, array_values(array_diff($paraPush, $naTela)), $notificacao);
    });
}

/**
 * Quem está com o app aberto e na tela agora (aviso de presença há até 75 s e não saiu do app).
 * Para essas pessoas o aviso aparece dentro do app; a notificação do aparelho não é enviada (não duplica).
 */
function msgUsuariosNaTela(PDO $pdo, array $usuarioIds): array
{
    $usuarioIds = array_values(array_unique(array_filter(array_map('intval', $usuarioIds))));
    if (!$usuarioIds) {
        return [];
    }
    $marc = implode(',', array_fill(0, count($usuarioIds), '?'));
    try {
        $st = $pdo->prepare("SELECT usuario_id FROM chat_presenca WHERE usuario_id IN ({$marc}) AND visivel = 1 AND visto_em >= NOW() - INTERVAL 75 SECOND");
        $st->execute($usuarioIds);
        return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    } catch (PDOException $e) {
        return []; // tabela/coluna ainda não criada: notifica todos, como antes
    }
}

/** Prévia curta da mensagem para a notificação: texto, "Foto", "Áudio (0:14)", "Documento: nome". */
function msgPreviaNotificacao(array $msg): string
{
    $texto = trim(preg_replace('/\s+/u', ' ', (string) ($msg['texto'] ?? '')));
    $anexo = $msg['anexos'][0] ?? null;
    switch ($msg['tipo'] ?? 'texto') {
        case 'imagem':
            $previa = 'Foto' . ($texto !== '' && !str_starts_with($texto, 'Enviando') ? ': ' . $texto : '');
            break;
        case 'audio':
            $seg = (int) ($anexo['duracao_s'] ?? 0);
            $previa = 'Áudio' . ($seg > 0 ? sprintf(' (%d:%02d)', intdiv($seg, 60), $seg % 60) : '');
            break;
        case 'documento':
            $previa = 'Documento' . (!empty($anexo['nome_original']) ? ': ' . $anexo['nome_original'] : '');
            break;
        default:
            $previa = $texto !== '' ? $texto : 'Nova mensagem';
    }
    return mb_strlen($previa) > 140 ? rtrim(mb_substr($previa, 0, 139)) . '…' : $previa;
}

/**
 * Título e texto da notificação (layout do mockup "PAI Messenger estilo WhatsApp"):
 *  - conversa individual: título = quem enviou; texto = prévia;
 *  - grupo: título = nome do grupo; texto = "Primeiro nome: prévia";
 *  - cliente do WhatsApp: título = "Nome do cliente · Cliente"; texto = prévia.
 */
function msgNotificacaoTexto(array $conversa, array $msg): array
{
    $autor = trim((string) ($msg['autor_nome'] ?? ''));
    $previa = (!empty($msg['interna']) ? 'Nota interna: ' : '') . msgPreviaNotificacao($msg);
    if (($conversa['tipo'] ?? '') === 'grupo') {
        $primeiro = $autor !== '' ? explode(' ', $autor)[0] : '';
        $titulo = trim((string) ($conversa['titulo'] ?? '')) ?: 'Grupo';
        return [$titulo, ($primeiro !== '' ? $primeiro . ': ' : '') . $previa];
    }
    if (($conversa['tipo'] ?? '') === 'externo') {
        return [($autor !== '' ? $autor : 'Cliente') . ' · Cliente', $previa];
    }
    return [$autor !== '' ? $autor : 'PAI Messenger', $previa];
}

/** Aviso de que algo da conversa mudou (grupo editado, transferida, assumida, encerrada...). */
function msgAvisarConversa(PDO $pdo, array $conversa, string $motivo, array $extrasDestinatarios = []): void
{
    $dest = array_merge(msgDestinatarios($pdo, $conversa), $extrasDestinatarios);
    $dados = ['conversa_id' => (int) $conversa['id'], 'motivo' => $motivo];
    msgDepois(fn() => msgAblyAvisar($dest, 'conversa', $dados));
}

// =====================================================================
// Conversas de clientes (WhatsApp): atendimentos e distribuição (manual)
// =====================================================================

/**
 * Abre um novo atendimento na fila ("aguardando") para a conversa do cliente.
 * Usado quando o cliente escreve pela primeira vez ou depois de um atendimento encerrado
 * (o anterior fica no histórico, visível só para a Gestão). Retorna o id do atendimento.
 */
function msgNovoAtendimento(PDO $pdo, int $conversaId): int
{
    $pdo->prepare("INSERT INTO chat_atendimentos (conversa_id, status) VALUES (:c, 'aguardando')")->execute([':c' => $conversaId]);
    $atendimentoId = (int) $pdo->lastInsertId();
    $pdo->prepare("UPDATE chat_conversas SET atendimento_atual_id = :a, status_atendimento = 'aguardando', responsavel_usuario_id = NULL,
                          atribuida_em = NULL, encerrada_em = NULL WHERE id = :id")
        ->execute([':a' => $atendimentoId, ':id' => $conversaId]);
    return $atendimentoId;
}

/** Avisa os atendentes de que há conversa nova na fila. */
function msgAvisarFila(PDO $pdo, int $conversaId): void
{
    $conversa = msgConversa($pdo, $conversaId);
    if ($conversa) {
        msgAvisarConversa($pdo, $conversa, 'fila');
    }
}

/** Define o responsável do atendimento em andamento e o coloca como participante que responde. */
function msgAtribuir(PDO $pdo, int $conversaId, int $usuarioId, ?string $textoSistema): void
{
    $pdo->prepare("UPDATE chat_conversas SET responsavel_usuario_id = :u, status_atendimento = 'em_atendimento', atribuida_em = NOW(), encerrada_em = NULL WHERE id = :id")
        ->execute([':u' => $usuarioId, ':id' => $conversaId]);
    $pdo->prepare("UPDATE chat_atendimentos a INNER JOIN chat_conversas c ON c.atendimento_atual_id = a.id
                      SET a.responsavel_usuario_id = :u, a.status = 'em_atendimento', a.atribuido_em = COALESCE(a.atribuido_em, NOW())
                    WHERE c.id = :id")
        ->execute([':u' => $usuarioId, ':id' => $conversaId]);
    msgAdicionarParticipante($pdo, $conversaId, $usuarioId, 'admin');
    msgDefinirPapel($pdo, $conversaId, $usuarioId, 'admin');
    if ($textoSistema !== null) {
        msgSistema($pdo, $conversaId, $textoSistema);
    }
    $conversa = msgConversa($pdo, $conversaId);
    msgAvisarConversa($pdo, $conversa, 'atribuida', msgAtendentesAtivos($pdo));
}


/* =====================================================================
 * Pacote 4B (15/10/2026): mensagens automáticas (boas-vindas, menu de setores, fora do horário) e avaliação.
 * Textos e liga/desliga na tela Configurações do Messenger › Mensagens automáticas (tabela chat_config).
 * As mensagens automáticas ficam no histórico como autor "sistema" do tipo texto (aparecem como enviadas pela empresa).
 * ===================================================================== */

/** Textos padrão (usados enquanto a Gestão não muda na tela). */
function msgBotPadroes(): array
{
    return [
        'auto_ativo' => '0',
        'auto_boas_vindas' => 'Olá! Você está falando com o Plano PAI - Plano Assistencial Integrado.',
        'auto_menu_ativo' => '1',
        'auto_menu_texto' => 'Para agilizar o atendimento, responda com o número do assunto:',
        'auto_menu_invalida' => 'Não entendi. Responda só com o número de uma das opções:',
        'auto_menu_desistiu' => 'Tudo bem, já vou te passar para um atendente.',
        'auto_fora_horario' => 'Nosso atendimento está fechado agora e abre {proximo_horario}. Sua mensagem ficou registrada e vamos responder assim que abrir.',
        'avaliacao_ativa' => '0',
        'avaliacao_texto' => 'Seu atendimento foi encerrado. Como você avalia nosso atendimento? Responda com uma nota de 1 a 5 (5 = ótimo).',
        'avaliacao_obrigado' => 'Obrigado pela sua avaliação!',
        // 16/10/2026: comprovante de pagamento (Pix direto no CNPJ) e clientes que preferem áudio
        'comprovante_ativo' => '1',
        'comprovante_midia' => '1',
        'comprovante_setor' => '',
        'comprovante_etiqueta' => '',
        'comprovante_resposta' => 'Recebemos seu comprovante! Nossa equipe vai confirmar e te avisa por aqui.',
        'audio_pular_menu' => '1',
        'audio_destino' => '',
        'audio_resposta' => 'Recebemos seu áudio! Já vou te passar para um atendente.',
    ];
}

function msgBotTexto(PDO $pdo, string $chave): string
{
    return (string) msgConfigTela($pdo, $chave, msgBotPadroes()[$chave] ?? '');
}

/** Setores ativos do menu, com o número que o cliente digita (o "número no menu" se todos forem distintos; senão 1, 2, 3…). */
function msgBotSetores(PDO $pdo): array
{
    try {
        $lista = $pdo->query('SELECT * FROM chat_setores WHERE ativo = 1 AND no_menu = 1 ORDER BY ordem, nome')->fetchAll();
    } catch (PDOException $e) {
        return [];
    }
    $ordens = array_map(fn($s) => (int) $s['ordem'], $lista);
    $usarOrdem = $lista && min($ordens) > 0 && count(array_unique($ordens)) === count($ordens);
    foreach ($lista as $i => &$s) {
        $s['numero'] = $usarOrdem ? (int) $s['ordem'] : $i + 1;
    }
    unset($s);
    return $lista;
}

function msgBotMenuTexto(PDO $pdo, array $setores): string
{
    $linhas = [msgBotTexto($pdo, 'auto_menu_texto')];
    foreach ($setores as $s) {
        $linhas[] = '*' . $s['numero'] . '* – ' . (trim((string) ($s['texto_menu'] ?? '')) !== '' ? $s['texto_menu'] : $s['nome']);
    }
    return implode("\n", $linhas);
}

/** Envia ao cliente uma mensagem automática e grava no histórico. */
function msgBotEnviar(PDO $pdo, int $conversaId, string $texto, ?int $atendimentoId = null): void
{
    $texto = trim($texto);
    $conversa = msgConversa($pdo, $conversaId);
    if ($texto === '' || !$conversa || $conversa['tipo'] !== 'externo' || !msgMetaConfigurado()) {
        return;
    }
    $sw = $pdo->prepare('SELECT wa_id FROM chat_contatos_externos WHERE id = :id');
    $sw->execute([':id' => $conversa['contato_externo_id']]);
    $wa = (string) $sw->fetchColumn();
    if ($wa === '') {
        return;
    }
    $id = msgGravar($pdo, $conversaId, [
        'atendimento_id' => $atendimentoId ?? ($conversa['atendimento_atual_id'] !== null ? (int) $conversa['atendimento_atual_id'] : null),
        'autor_tipo' => 'sistema',
        'tipo' => 'texto',
        'texto' => $texto,
        'status_envio' => 'pendente',
    ]);
    $r = msgMeta('POST', msgConfig('meta_phone_number_id', '') . '/messages', [
        'messaging_product' => 'whatsapp', 'recipient_type' => 'individual', ...msgDestinoWhats($wa),
        'type' => 'text', 'text' => ['preview_url' => false, 'body' => $texto],
    ]);
    $wamid = (string) ($r['json']['messages'][0]['id'] ?? '');
    if ($r['ok'] && $wamid !== '') {
        $pdo->prepare("UPDATE chat_mensagens SET status_envio = 'enviada', externo_id = :w WHERE id = :id")->execute([':w' => $wamid, ':id' => $id]);
    } else {
        $pdo->prepare("UPDATE chat_mensagens SET status_envio = 'falhou', erro_envio = :e WHERE id = :id")
            ->execute([':e' => mb_substr($r['erro'] !== '' ? $r['erro'] : 'A Meta não aceitou a mensagem.', 0, 255), ':id' => $id]);
    }
    $pdo->prepare('UPDATE chat_conversas SET ultima_mensagem_id = :m, ultima_mensagem_em = NOW() WHERE id = :c')->execute([':m' => $id, ':c' => $conversaId]);
    $msg = msgMensagemPorId($pdo, $id);
    if ($msg) {
        $dest = msgDestinatarios($pdo, $conversa);
        msgDepois(fn() => msgAblyAvisar($dest, 'mensagem', $msg + ['notificar' => false]));
    }
}

/** Depois que o cliente cai num setor: boas-vindas do setor e, se estiver fechado, a mensagem de fora do horário. */
function msgBotDepoisDoSetor(PDO $pdo, int $conversaId, ?array $setor): void
{
    if (!$setor) {
        return;
    }
    if (trim((string) ($setor['msg_boas_vindas'] ?? '')) !== '') {
        msgBotEnviar($pdo, $conversaId, (string) $setor['msg_boas_vindas']);
    }
    $sh = $pdo->prepare('SELECT dia_semana, inicio, fim FROM chat_setor_horarios WHERE setor_id = :s');
    $sh->execute([':s' => $setor['id']]);
    $se = $pdo->prepare('SELECT data, fechado, inicio, fim FROM chat_setor_excecoes WHERE setor_id = :s AND data BETWEEN CURDATE() AND CURDATE() + INTERVAL 8 DAY');
    $se->execute([':s' => $setor['id']]);
    $situ = msgSituacaoSetor($setor, $sh->fetchAll(), $se->fetchAll());
    if (!$situ['aberto']) {
        $modelo = trim((string) ($setor['msg_fora_horario'] ?? '')) !== '' ? (string) $setor['msg_fora_horario'] : msgBotTexto($pdo, 'auto_fora_horario');
        $texto = strtr($modelo, ['{proximo_horario}' => $situ['proximo'] ?? 'assim que possível', '{setor}' => (string) $setor['nome']]);
        msgBotEnviar($pdo, $conversaId, $texto);
    }
}

/**
 * Atendimento automático ao chegar mensagem do cliente (só com a fila: em atendimento, o bot não fala).
 * Retorna true quando a fila deve ser avisada agora.
 */
function msgBotAoChegar(PDO $pdo, int $conversaId, bool $novoAtendimento, string $textoCliente, string $tipo = 'texto', string $mime = '', int $mensagemId = 0): bool
{
    $c = msgConversa($pdo, $conversaId);
    if (!$c || $c['status_atendimento'] !== 'aguardando') {
        return $novoAtendimento;
    }
    if ($novoAtendimento) {
        // atendimento novo: a nota e a prioridade da Aurora começam do zero
        $pdo->prepare('UPDATE chat_conversas SET ia_nota_id = NULL, prioridade = 0, ia_funeral_json = NULL, ia_venda_json = IF(ia_venda_json LIKE \'{"origem"%\', ia_venda_json, NULL) WHERE id = :id')->execute([':id' => $conversaId]);
        $c['ia_nota_id'] = null;
    }
    // só no começo do atendimento, no menu ou conversando com a Aurora
    if ($novoAtendimento || in_array($c['bot_estado'] ?? null, ['menu', 'ia'], true)) {
        // comprovante de pagamento: não passa pelo menu e vai direto para o setor configurado.
        // 22/10/2026: com a Aurora ligada, o TEXTO não dispara mais por palavra solta ("perco o que já paguei?" não é
        // comprovante): quem decide é a Aurora (intenção "comprovante"). Imagem e PDF continuam indo direto.
        $ehComprovante = msgBotTexto($pdo, 'comprovante_ativo') === '1' && (
            (!msgIaAtiva($pdo) && preg_match('/\b(comprovante|paguei|pago|fiz o pix|pix feito|fiz um pix|transferi|depositei)\b/iu', $textoCliente))
            || (msgBotTexto($pdo, 'comprovante_midia') === '1' && ($tipo === 'imagem' || ($tipo === 'documento' && str_contains($mime, 'pdf'))))
        );
        if ($ehComprovante) {
            msgBotDirecionar($pdo, $conversaId, (int) msgBotTexto($pdo, 'comprovante_setor'), msgBotTexto($pdo, 'comprovante_resposta'), 'comprovante de pagamento');
            msgComprovanteEtiquetar($pdo, $conversaId);
            return true;
        }
    }
    // Aurora no atendimento: entende texto e áudio, encaminha, responde dúvidas e acompanha até um atendente assumir
    if (msgIaAtiva($pdo)) {
        try {
            $r = msgIaAoChegar($pdo, $conversaId, $novoAtendimento, $tipo, $textoCliente, $mensagemId);
            if ($r !== null) {
                return $r;
            }
        } catch (Throwable $e) {
            error_log('[messenger] Aurora: ' . $e->getMessage());
        }
        $c = msgConversa($pdo, $conversaId) ?: $c;
        if (($c['bot_estado'] ?? null) === 'ia_coleta' || $c['status_atendimento'] !== 'aguardando') {
            return false;
        }
        if (($c['bot_estado'] ?? null) === 'ia') {
            // a Aurora não conseguiu responder no meio da conversa: o cliente não fica sem atendimento
            msgBotDirecionar($pdo, $conversaId, 0, 'Vou te passar para um atendente.', 'Aurora indisponível');
            return true;
        }
    }
    if ($novoAtendimento || in_array($c['bot_estado'] ?? null, ['menu', 'ia'], true)) {
        // quem manda áudio (muitos não leem): não insiste no menu, vai para um atendente
        if ($tipo === 'audio' && msgBotTexto($pdo, 'audio_pular_menu') === '1') {
            msgBotDirecionar($pdo, $conversaId, (int) msgBotTexto($pdo, 'audio_destino'), msgBotTexto($pdo, 'audio_resposta'), 'áudio');
            return true;
        }
    }
    $setores = msgBotSetores($pdo);
    if ($novoAtendimento) {
        $boasVindas = msgBotTexto($pdo, 'auto_boas_vindas');
        if (count($setores) >= 2 && msgBotTexto($pdo, 'auto_menu_ativo') === '1') {
            msgBotEnviar($pdo, $conversaId, trim($boasVindas . "\n\n" . msgBotMenuTexto($pdo, $setores)));
            $pdo->prepare("UPDATE chat_conversas SET bot_estado = 'menu', bot_tentativas = 0, setor_id = NULL WHERE id = :id")->execute([':id' => $conversaId]);
            return false; // a fila é avisada quando o cliente escolher
        }
        if ($boasVindas !== '') {
            msgBotEnviar($pdo, $conversaId, $boasVindas);
        }
        $setor = count($setores) === 1 ? $setores[0] : null;
        if ($setor) {
            $pdo->prepare('UPDATE chat_conversas SET setor_id = :s WHERE id = :id')->execute([':s' => $setor['id'], ':id' => $conversaId]);
        }
        msgBotDepoisDoSetor($pdo, $conversaId, $setor);
        return true;
    }
    if (($c['bot_estado'] ?? null) !== 'menu') {
        return false;
    }
    $numero = preg_match('/\d+/', $textoCliente, $mm) ? (int) $mm[0] : 0;
    $escolhido = null;
    foreach ($setores as $s) {
        if ((int) $s['numero'] === $numero) {
            $escolhido = $s;
        }
    }
    if ($escolhido) {
        $pdo->prepare('UPDATE chat_conversas SET setor_id = :s, bot_estado = NULL, bot_tentativas = 0 WHERE id = :id')->execute([':s' => $escolhido['id'], ':id' => $conversaId]);
        msgSistema($pdo, $conversaId, 'Cliente escolheu o setor ' . $escolhido['nome'] . ' no menu automático');
        msgBotDepoisDoSetor($pdo, $conversaId, $escolhido);
        return true;
    }
    $tentativas = (int) ($c['bot_tentativas'] ?? 0) + 1;
    if ($tentativas >= 2 || !$setores) {
        // depois de 2 respostas sem número válido, vai para a fila geral (sem setor)
        $pdo->prepare('UPDATE chat_conversas SET bot_estado = NULL, bot_tentativas = 0 WHERE id = :id')->execute([':id' => $conversaId]);
        msgBotEnviar($pdo, $conversaId, msgBotTexto($pdo, 'auto_menu_desistiu'));
        return true;
    }
    $pdo->prepare('UPDATE chat_conversas SET bot_tentativas = :t WHERE id = :id')->execute([':t' => $tentativas, ':id' => $conversaId]);
    msgBotEnviar($pdo, $conversaId, trim(msgBotTexto($pdo, 'auto_menu_invalida') . "\n" . implode("\n", array_map(fn($s) => '*' . $s['numero'] . '* – ' . (trim((string) ($s['texto_menu'] ?? '')) !== '' ? $s['texto_menu'] : $s['nome']), $setores))));
    return false;
}

/** Depois de encerrar: pergunta a nota (se ligada e a janela de 24 h estiver aberta). */
function msgBotPedirAvaliacao(PDO $pdo, array $conversa): void
{
    if (msgBotTexto($pdo, 'avaliacao_ativa') !== '1' || $conversa['tipo'] !== 'externo' || $conversa['atendimento_atual_id'] === null) {
        return;
    }
    if (empty($conversa['janela_ate']) || strtotime((string) $conversa['janela_ate']) <= time()) {
        return;
    }
    msgBotEnviar($pdo, (int) $conversa['id'], msgBotTexto($pdo, 'avaliacao_texto'), (int) $conversa['atendimento_atual_id']);
    $pdo->prepare("UPDATE chat_conversas SET bot_estado = 'avaliacao', bot_ref = :a WHERE id = :id")
        ->execute([':a' => $conversa['atendimento_atual_id'], ':id' => $conversa['id']]);
}


/** Telefone (só números) vai em "to"; o identificador da Meta (BSUID, ex.: BR.123…) vai em "recipient". */
function msgDestinoWhats(string $wa): array
{
    return preg_match('/^\d+$/', $wa) ? ['to' => $wa] : ['recipient' => $wa];
}

/** Coloca o cliente direto num setor (ou na fila geral, setor 0), sem menu, e responde. */
/** Etiqueta de comprovante escolhida em Configurações; sem escolha, usa (ou cria) a etiqueta da empresa "Comprovante". */
function msgComprovanteEtiquetar(PDO $pdo, int $conversaId): void
{
    $etiqueta = (int) msgBotTexto($pdo, 'comprovante_etiqueta');
    if ($etiqueta <= 0) {
        $se = $pdo->prepare("SELECT id FROM chat_etiquetas WHERE usuario_id IS NULL AND nome = 'Comprovante' LIMIT 1");
        $se->execute();
        $etiqueta = (int) $se->fetchColumn();
        if (!$etiqueta) {
            try {
                $pdo->prepare("INSERT INTO chat_etiquetas (nome, cor, usuario_id) VALUES ('Comprovante', '#4C9A2A', NULL)")->execute();
                $etiqueta = (int) $pdo->lastInsertId();
            } catch (PDOException $e) {
                $etiqueta = 0;
            }
        }
    }
    $sq = $pdo->prepare('SELECT COUNT(*) FROM chat_conversa_etiquetas WHERE conversa_id = :c');
    $sq->execute([':c' => $conversaId]);
    if ($etiqueta > 0 && (int) $sq->fetchColumn() < msgMaxEtiquetas($pdo)) {
        $pdo->prepare('INSERT IGNORE INTO chat_conversa_etiquetas (conversa_id, etiqueta_id) VALUES (:c, :e)')->execute([':c' => $conversaId, ':e' => $etiqueta]);
    }
}

function msgBotDirecionar(PDO $pdo, int $conversaId, int $setorId, string $resposta, string $motivo): void
{
    $setor = null;
    if ($setorId > 0) {
        $ss = $pdo->prepare('SELECT * FROM chat_setores WHERE id = :id AND ativo = 1');
        $ss->execute([':id' => $setorId]);
        $setor = $ss->fetch() ?: null;
    }
    $pdo->prepare('UPDATE chat_conversas SET setor_id = :s, bot_estado = NULL, bot_tentativas = 0 WHERE id = :id')
        ->execute([':s' => $setor ? (int) $setor['id'] : null, ':id' => $conversaId]);
    msgSistema($pdo, $conversaId, 'Atendimento automático: ' . $motivo . ($setor ? ' — enviado para ' . $setor['nome'] : ' — enviado para a fila geral'));
    if (trim($resposta) !== '') {
        msgBotEnviar($pdo, $conversaId, $resposta);
    }
}

/** Preços da Meta (R$ por mensagem entregue e cobrada) — editáveis em Configurações › Geral. */
function msgPrecosMeta(PDO $pdo): array
{
    $p = ['service' => '0.0350', 'utility' => '0.0350', 'marketing' => '0.3217', 'authentication' => '0.0350'];
    $saida = [];
    foreach ($p as $cat => $padrao) {
        $saida[$cat] = (float) str_replace(',', '.', (string) msgConfigTela($pdo, 'preco_' . $cat, $padrao));
    }
    return $saida;
}


/** Quantas etiquetas cada conversa pode ter (Configurações › Geral; padrão 4). */
function msgMaxEtiquetas(PDO $pdo): int
{
    return max(1, min(10, (int) msgConfigTela($pdo, 'max_etiquetas', '4')));
}


/* =====================================================================
 * Pacote 5B (16/10/2026): dados da Unymos na conversa. Integração própria do Messenger em messenger_unymos.php
 * (API direta da Unymos/UnyFintech; não passa pelo associados_geral.php).
 * ===================================================================== */
/** Vínculos do contato com contratos da Unymos. */
function msgVinculosContato(PDO $pdo, int $contatoId): array
{
    $st = $pdo->prepare('SELECT v.*, u.nome AS criado_por_nome FROM chat_contato_contratos v LEFT JOIN usuarios u ON u.id = v.criado_por WHERE v.contato_id = :c ORDER BY v.criado_em');
    $st->execute([':c' => $contatoId]);
    return array_map(fn($v) => [
        'id_contrato' => (int) $v['id_contrato'], 'contrato' => $v['contrato'], 'titular' => $v['titular_nome'], 'plano' => $v['plano'],
        'relacao' => $v['relacao'], 'pode_pagar' => (bool) $v['pode_pagar'], 'criado_por' => $v['criado_por_nome'], 'criado_em' => msgDataIso($v['criado_em']),
    ], $st->fetchAll());
}

// Integração com a Unymos/UnyFintech e a Aurora no atendimento, só do Messenger (16/10/2026)
require_once __DIR__ . '/messenger_unymos.php';
require_once __DIR__ . '/messenger_aurora.php';
require_once __DIR__ . '/messenger_vendas.php';
require_once __DIR__ . '/messenger_testes.php';
require_once __DIR__ . '/messenger_aprendizado.php';

/** Conversas com orçamento da Aurora aguardando o atendente (selo na conversa). */
function msgOrcamentosIaPendentes(PDO $pdo): array
{
    static $ids = null;
    if ($ids === null) {
        try {
            $ids = array_map('intval', $pdo->query("SELECT DISTINCT conversa_id FROM chat_orcamentos_ia WHERE status = 'aguardando'")->fetchAll(PDO::FETCH_COLUMN));
        } catch (PDOException $e) {
            $ids = [];
        }
    }
    return $ids;
}


/* ---------------------------------------------------------------------
 * Encerramento de conversa parada (21/10/2026) — Configurações › Mensagens automáticas.
 * Encerra o atendimento quando a ÚLTIMA mensagem foi do PAI (Aurora ou atendente) e o cliente não respondeu no tempo
 * configurado. Nunca encerra: falecimento (prioridade), cliente esperando na fila por um atendente, conversa de teste.
 *  ocioso_aurora_min      — conversa com a Aurora (sem atendente)   · 0 = desligado
 *  ocioso_atendimento_min — atendimento com uma pessoa              · 0 = desligado
 *  ocioso_msg             — mensagem de despedida (só vai se a janela de 24 h estiver aberta)
 * Roda no máximo a cada 2 min, depois das requisições do Messenger e dos avisos do WhatsApp (e pelo cron).
 * ------------------------------------------------------------------- */
function msgEncerrarOciososTalvez(PDO $pdo): void
{
    try {
        $ult = (int) msgConfigTela($pdo, 'ocioso_ultima', '0');
        if ($ult > time() - 120) {
            return;
        }
        if (!$pdo->query("SELECT GET_LOCK('pai_ocioso', 0)")->fetchColumn()) {
            return;
        }
        $pdo->prepare("INSERT INTO chat_config (chave, valor) VALUES ('ocioso_ultima', :v) ON DUPLICATE KEY UPDATE valor = :v2")->execute([':v' => (string) time(), ':v2' => (string) time()]);
        try {
            msgEncerrarOciosos($pdo);
        } finally {
            $pdo->query("SELECT RELEASE_LOCK('pai_ocioso')");
        }
    } catch (Throwable $e) {
        error_log('[messenger] encerrar parados: ' . $e->getMessage());
    }
}

function msgEncerrarOciosos(PDO $pdo): int
{
    $minA = max(0, (int) msgConfigTela($pdo, 'ocioso_aurora_min', '60'));
    $minH = max(0, (int) msgConfigTela($pdo, 'ocioso_atendimento_min', '0'));
    if (!$minA && !$minH) {
        return 0;
    }
    $partes = [];
    if ($minA) {
        $partes[] = "(c.status_atendimento = 'aguardando' AND c.bot_estado IN ('ia', 'menu') AND c.ultima_mensagem_em < NOW() - INTERVAL {$minA} MINUTE)";
    }
    if ($minH) {
        $partes[] = "(c.status_atendimento = 'em_atendimento' AND c.ultima_mensagem_em < NOW() - INTERVAL {$minH} MINUTE)";
    }
    $lista = $pdo->query("SELECT c.id FROM chat_conversas c INNER JOIN chat_mensagens m ON m.id = c.ultima_mensagem_id
                           WHERE c.tipo = 'externo' AND COALESCE(c.teste, 0) = 0 AND COALESCE(c.prioridade, 0) = 0
                             AND m.autor_tipo <> 'contato' AND (" . implode(' OR ', $partes) . ") LIMIT 30")->fetchAll(PDO::FETCH_COLUMN);
    $texto = trim((string) msgConfigTela($pdo, 'ocioso_msg', 'Como não tivemos mais retorno, vou encerrar este atendimento por aqui. Se precisar, é só mandar uma nova mensagem que a gente continua de onde parou. 💙'));
    $n = 0;
    foreach ($lista as $cid) {
        $c = msgConversa($pdo, (int) $cid);
        if (!$c || !in_array($c['status_atendimento'], ['aguardando', 'em_atendimento'], true)) {
            continue;
        }
        if ($texto !== '' && !empty($c['janela_ate']) && strtotime((string) $c['janela_ate']) > time()) {
            msgBotEnviar($pdo, (int) $c['id'], $texto);
        }
        msgSistema($pdo, (int) $c['id'], 'Atendimento encerrado por inatividade (o cliente não respondeu)');
        $dest = msgDestinatarios($pdo, $c);
        $pdo->prepare("UPDATE chat_atendimentos SET status = 'encerrado', encerrado_em = NOW(), encerrado_por = NULL WHERE id = :a")->execute([':a' => $c['atendimento_atual_id']]);
        $pdo->prepare("UPDATE chat_conversas SET status_atendimento = 'encerrado', encerrada_em = NOW(), bot_estado = NULL WHERE id = :id")->execute([':id' => $c['id']]);
        $pdo->prepare('UPDATE chat_participantes SET saiu_em = NOW() WHERE conversa_id = :c AND saiu_em IS NULL')->execute([':c' => $c['id']]);
        $dados = ['conversa_id' => (int) $c['id'], 'motivo' => 'encerrada'];
        msgDepois(fn() => msgAblyAvisar($dest, 'conversa', $dados));
        $n++;
    }
    return $n;
}
