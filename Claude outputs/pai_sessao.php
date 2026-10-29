<?php
/**
 * pai_sessao.php — conferência do login assinado do app PAI (cookie pai_session).        23/10/2026
 *
 * ONDE FICA: /home2/pla48587/pai_sessao.php (ao lado do pai-chaves.php, fora da pasta pública).
 * QUEM USA:  os PHPs que identificavam o usuário pelos cookies pai_auth / pai_uid / pai_user (26 arquivos),
 *            com uma linha no começo:  include_once '/home2/pla48587/pai_sessao.php';
 *
 * O PROBLEMA: os cookies pai_auth, pai_uid e pai_user podem ser criados por qualquer pessoa no navegador.
 * A SOLUÇÃO:  o login do app (Next, /api/auth/login) cria o cookie pai_session = base64url(JSON{usuario,iat,exp}) + "."
 *             + assinatura HMAC-SHA256 com a PAI_SESSION_SECRET. Ninguém cria um válido sem o segredo.
 *
 * MODO (pai-chaves.php → 'pai_sessao_modo'):
 *   'desligado' (padrão, ou sem segredo) — não faz nada.
 *   'observar'  — não muda nada; só registra no log quem chegou com cookies pai_* sem um pai_session válido
 *                 ou com usuário diferente do assinado.
 *   'exigir'    — os cookies pai_user/user passam a ser o usuário do pai_session; pai_uid e pai_nome são removidos
 *                 (o sistema busca o id pelo login). Sem pai_session válido, os cookies pai_* são removidos e o
 *                 PHP responde como "não logado", do jeito que já faz hoje.
 *
 * CHAVES NO pai-chaves.php:
 *   'pai_session_secret' => '(o mesmo valor da PAI_SESSION_SECRET da Vercel do app)',
 *   'pai_sessao_modo'    => 'observar',
 *
 * LOG: /home2/pla48587/logs_pai/pai_sessao_AAAA-MM-DD.log (fora da pasta pública) e o contador diário
 *      pai_sessao_AAAA-MM-DD_ok.txt (quantos acessos tinham assinatura válida).
 *
 * RENOVAÇÃO (29/10/2026, v7): a cada uso, quando o pai_session é válido e foi emitido há mais de 5 min, este arquivo
 *   emite um novo valendo PAI_SESSAO_VIDA (24 h) a partir de agora (mesmo formato e mesma assinatura do login do app).
 *   Ou seja: a contagem recomeça sempre que o usuário usa o app. Quem ficar mais de 24 h sem usar precisa entrar de
 *   novo. Só renova em modo 'observar' ou 'exigir'. Manter igual ao SESSION_SECONDS do app/api/auth/login/route.ts.
 *   (v2, 23/10/2026: renovava +8 h só quando faltavam menos de 4 h.)
 * LOG ENXUTO (v2): no máximo uma linha por usuário + arquivo + motivo + domínio a cada hora.
 * SESSÃO (v3, só no modo 'exigir'): um filtro na LEITURA da sessão do PHP (save handler que estende o padrão).
 *   Se a sessão guarda a identidade de outro usuário, ou uma identidade que veio de cookie sem conferência,
 *   o PHP recebe a sessão vazia (como se fosse nova) e refaz a identidade a partir dos cookies já conferidos.
 *   Na gravação, marca a sessão com 'pai_sessao_login' para não repetir a limpeza. Não muda o id da sessão.
 *
 * PROTEÇÃO DE ARQUIVOS SEM LOGIN (v4, parte 4): paiProtecao('login'|'admin', [páginas], 'rótulo', 'grupo').
 *   Usa só o login assinado (pai_session). 'admin' = cargo 'adm' OU uma das páginas informadas (permissoes/cargo).
 *   Modo por grupo no pai-chaves.php: 'geral' usa 'pai_protecao_modo'; os demais grupos (usuarios, leads, vendas)
 *   usam só 'pai_protecao_modo_<grupo>' e, sem ela, ficam em 'observar'.
 *   Padrão 'observar' (só registra 'protecao_seria_negada' no log). Com 'exigir', responde 401/403 em JSON.
 *   Pedidos OPTIONS (pré-voo do navegador) nunca são barrados.
 *
 * CHAMADAS ENTRE SERVIDORES (v6, 23/10/2026): paiProtecao também aceita o cabeçalho X-PAI-Internal-Key quando ele
 *   bate com paiChaveInternaServidor() (derivada do pai_session_secret, para os PHPs do próprio servidor) ou com uma
 *   das chaves de 'associados_chaves_internas' (Aurora, MCP etc.). paiCabecalhoInterno() devolve o cabeçalho pronto.
 *   paiProtecaoModo('grupo') devolve o modo do grupo; paiProtecaoQuem() identifica sem bloquear (login ou chave).
 *
 * Este arquivo nunca derruba a requisição: qualquer erro interno é ignorado e o PHP segue como antes.
 */

if (!function_exists('paiSessaoValidar')) {

    /** Duração do login assinado, em segundos (24 h). */
    if (!defined('PAI_SESSAO_VIDA')) {
        define('PAI_SESSAO_VIDA', 24 * 60 * 60);
    }
    /** Intervalo mínimo entre renovações, em segundos (5 min), para não reemitir o cookie a cada requisição. */
    if (!defined('PAI_SESSAO_RENOVAR_APOS')) {
        define('PAI_SESSAO_RENOVAR_APOS', 5 * 60);
    }

    function paiSessaoConfig(): array
    {
        static $cfg = null;
        if ($cfg === null) {
            $cfg = [];
            $arq = '/home2/pla48587/pai-chaves.php';
            if (is_file($arq) && is_readable($arq)) {
                $c = require $arq;
                if (is_array($c)) {
                    $cfg = $c;
                }
            }
        }
        return $cfg;
    }

    function paiSessaoB64urlDecode(string $s): string
    {
        $s = strtr($s, '-_', '+/');
        $pad = strlen($s) % 4;
        if ($pad) {
            $s .= str_repeat('=', 4 - $pad);
        }
        $d = base64_decode($s, true);
        return $d === false ? '' : $d;
    }

    /** Confere o cookie pai_session. Devolve ['ok'=>bool, 'usuario'=>?string, 'motivo'=>string]. */
    function paiSessaoValidar(?string $token, string $segredo): array
    {
        if ($segredo === '') {
            return ['ok' => false, 'usuario' => null, 'motivo' => 'sem_segredo_no_pai_chaves'];
        }
        $token = trim((string) $token);
        if ($token === '') {
            return ['ok' => false, 'usuario' => null, 'motivo' => 'sem_pai_session'];
        }
        $partes = explode('.', $token);
        if (count($partes) !== 2 || $partes[0] === '' || $partes[1] === '') {
            return ['ok' => false, 'usuario' => null, 'motivo' => 'formato_invalido'];
        }
        [$payload, $assinatura] = $partes;
        $esperada = rtrim(strtr(base64_encode(hash_hmac('sha256', $payload, $segredo, true)), '+/', '-_'), '=');
        if (!hash_equals($esperada, $assinatura)) {
            return ['ok' => false, 'usuario' => null, 'motivo' => 'assinatura_invalida'];
        }
        $dados = json_decode(paiSessaoB64urlDecode($payload), true);
        if (!is_array($dados) || empty($dados['usuario']) || empty($dados['exp'])) {
            return ['ok' => false, 'usuario' => null, 'motivo' => 'conteudo_invalido'];
        }
        if ((int) $dados['exp'] <= time()) {
            return ['ok' => false, 'usuario' => (string) $dados['usuario'], 'motivo' => 'expirado'];
        }
        return ['ok' => true, 'usuario' => trim((string) $dados['usuario']), 'motivo' => 'ok', 'exp' => (int) $dados['exp']];
    }

    function paiSessaoB64urlEncode(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    /** Emite um pai_session novo para o login, valendo 24 h a partir de agora. Mesmo formato do /api/auth/login do app. */
    function paiSessaoRenovar(string $usuario, string $segredo): void
    {
        try {
            if ($usuario === '' || $segredo === '' || headers_sent()) {
                return;
            }
            $agora = time();
            $vida = PAI_SESSAO_VIDA;
            $payload = paiSessaoB64urlEncode(json_encode(
                ['usuario' => $usuario, 'iat' => $agora, 'exp' => $agora + $vida],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            ));
            $token = $payload . '.' . paiSessaoB64urlEncode(hash_hmac('sha256', $payload, $segredo, true));
            setcookie('pai_session', $token, [
                'expires' => $agora + $vida,
                'path' => '/',
                'domain' => '.planoassistencialintegrado.com.br',
                'secure' => true,
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
            $_COOKIE['pai_session'] = $token;
        } catch (Throwable $e) {
            // renovação é opcional
        }
    }

    /** true se esta combinação já foi registrada nesta hora (evita milhares de linhas iguais). */
    function paiSessaoJaRegistrado(string $chave): bool
    {
        try {
            $dir = '/home2/pla48587/logs_pai/repetidos_' . date('YmdH');
            if (!is_dir($dir)) {
                @mkdir($dir, 0750, true);
                // limpeza ocasional das pastas de horas antigas
                if (mt_rand(1, 20) === 1) {
                    foreach ((array) glob('/home2/pla48587/logs_pai/repetidos_*', GLOB_ONLYDIR) as $velha) {
                        if ($velha !== $dir && @filemtime($velha) < time() - 7200) {
                            foreach ((array) glob($velha . '/*') as $f) { @unlink($f); }
                            @rmdir($velha);
                        }
                    }
                }
            }
            $marca = $dir . '/' . md5($chave);
            if (is_file($marca)) {
                return true;
            }
            @touch($marca);
            return false;
        } catch (Throwable $e) {
            return false;
        }
    }

    /** Lê um valor simples (texto ou número) de primeiro nível do formato de sessão 'php'. */
    function paiSessaoValorSessao(string $dados, string $chave): ?string
    {
        $k = preg_quote($chave, '/');
        if (preg_match('/(?:^|[;}])' . $k . '\|s:\d+:"(.*?)";/s', $dados, $m)) {
            return $m[1];
        }
        if (preg_match('/(?:^|[;}])' . $k . '\|i:(-?\d+);/', $dados, $m)) {
            return $m[1];
        }
        return null;
    }

    if (class_exists('SessionHandler') && !class_exists('PaiSessaoFiltro')) {
        /** Filtro da sessão no modo exigir (ver cabeçalho). */
        class PaiSessaoFiltro extends SessionHandler
        {
            public function read(string $id): string|false
            {
                $dados = parent::read($id);
                try {
                    if (!is_string($dados) || $dados === '' || ini_get('session.serialize_handler') !== 'php') {
                        return $dados;
                    }
                    $login = $GLOBALS['PAI_SESSAO_LOGIN'] ?? null;
                    $login = $login !== null ? mb_strtolower((string) $login) : null;
                    $loginSessao = paiSessaoValorSessao($dados, 'usuario_usuario');
                    $loginSessao = ($loginSessao !== null && trim($loginSessao) !== '') ? mb_strtolower(trim($loginSessao)) : null;
                    $marca = paiSessaoValorSessao($dados, 'pai_sessao_login');
                    $marca = $marca !== null ? mb_strtolower($marca) : null;
                    $temIdentidade = false;
                    foreach (['user_id', 'usuario_id', 'usuario_nome', 'usuario_usuario'] as $k) {
                        $v = paiSessaoValorSessao($dados, $k);
                        if ($v !== null && $v !== '' && $v !== '0') {
                            $temIdentidade = true;
                        }
                    }
                    $limpar = false;
                    if ($login === null) {
                        $limpar = $temIdentidade;
                    } elseif ($loginSessao !== null && $loginSessao !== $login) {
                        $limpar = true;
                    } elseif ($loginSessao === null && $marca !== $login && $temIdentidade) {
                        $limpar = true;
                    }
                    if ($limpar) {
                        if (!paiSessaoJaRegistrado('sessao_limpa|' . (string) $login . '|' . $id)) {
                            paiSessaoLog(['modo' => 'exigir', 'acao' => 'sessao_limpa',
                                'motivo' => $login === null ? 'sem_pai_session' : 'identidade_da_sessao_nao_conferida',
                                'arquivo' => basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')),
                                'host' => (string) ($_SERVER['HTTP_HOST'] ?? ''), 'assinado' => $login,
                                'ip' => (string) ($_SERVER['REMOTE_ADDR'] ?? '')]);
                        }
                        return '';
                    }
                } catch (Throwable $e) {
                    // em caso de dúvida, devolve a sessão como estava
                }
                return $dados;
            }

            public function write(string $id, string $data): bool
            {
                try {
                    $login = $GLOBALS['PAI_SESSAO_LOGIN'] ?? null;
                    if ($login !== null && ini_get('session.serialize_handler') === 'php') {
                        $marca = 'pai_sessao_login|' . serialize((string) $login);
                        if (strpos($data, $marca) === false) {
                            $data = preg_replace('/(^|[;}])pai_sessao_login\|s:\d+:".*?";/s', '$1', $data) . $marca;
                        }
                    }
                } catch (Throwable $e) {
                    // grava como veio
                }
                return parent::write($id, $data);
            }
        }
    }

    /** Modo exigir: instala o filtro antes de o PHP abrir a sessão. */
    function paiSessaoInstalarFiltro(): void
    {
        try {
            if (session_status() !== PHP_SESSION_NONE || headers_sent() || !class_exists('PaiSessaoFiltro')
                || ini_get('session.save_handler') !== 'files') {
                return;
            }
            session_set_save_handler(new PaiSessaoFiltro(), true);
        } catch (Throwable $e) {
            // sem filtro, o PHP segue como antes
        }
    }

    /** Usuário do login assinado: ['id','usuario','nome','cargo','paginas'] ou null. */
    function paiProtecaoUsuario(): ?array
    {
        static $cache = false;
        if ($cache !== false) {
            return $cache;
        }
        $cache = null;
        try {
            $cfg = paiSessaoConfig();
            $login = $GLOBALS['PAI_SESSAO_LOGIN'] ?? null;
            if ($login === null) {
                $v = paiSessaoValidar($_COOKIE['pai_session'] ?? null, (string) ($cfg['pai_session_secret'] ?? ''));
                $login = $v['ok'] ? $v['usuario'] : null;
            }
            if ($login === null || $login === '') {
                return null;
            }
            $pdo = new PDO('mysql:host=' . trim((string) ($cfg['db_host'] ?? 'localhost')) . ';dbname='
                . trim((string) ($cfg['db_name'] ?? '')) . ';charset=utf8mb4',
                trim((string) ($cfg['db_user'] ?? '')), (string) ($cfg['db_password'] ?? ''),
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
            $st = $pdo->prepare('SELECT id, usuario, nome, cargo FROM usuarios WHERE usuario = :u LIMIT 1');
            $st->execute([':u' => $login]);
            $u = $st->fetch();
            if (!$u) {
                return null;
            }
            $paginas = [];
            try {
                $st = $pdo->prepare('SELECT pagina FROM permissoes WHERE user_id = :i');
                $st->execute([':i' => (int) $u['id']]);
                $paginas = $st->fetchAll(PDO::FETCH_COLUMN);
            } catch (Throwable $e) {
            }
            try {
                $st = $pdo->prepare('SELECT cp.pagina FROM cargos c INNER JOIN cargo_paginas cp ON cp.cargo_id = c.id
                                     WHERE c.slug = :s AND c.ativo = 1');
                $st->execute([':s' => (string) ($u['cargo'] ?? '')]);
                $paginas = array_merge($paginas, $st->fetchAll(PDO::FETCH_COLUMN));
            } catch (Throwable $e) {
            }
            $cache = [
                'id' => (int) $u['id'],
                'usuario' => (string) $u['usuario'],
                'nome' => (string) ($u['nome'] ?? ''),
                'cargo' => strtolower(trim((string) ($u['cargo'] ?? ''))),
                'paginas' => array_values(array_unique(array_map('strval', $paginas))),
            ];
        } catch (Throwable $e) {
            $cache = null;
        }
        return $cache;
    }

    /**
     * Exige login ('login') ou administrador ('admin' = cargo adm ou uma das $paginas).
     * Devolve o usuário (ou null no modo observar). No modo exigir, responde 401/403 e encerra.
     */
    /** Limite de tentativas (v6): arquivos em logs_pai/limites. Devolve true se alguma chave está bloqueada. */
    function paiLimiteBloqueado(string $escopo, array $chaves, int $max, int $janela): bool
    {
        try {
            foreach ($chaves as $c) {
                $arq = paiLimiteArquivo($escopo, (string) $c);
                if (!is_file($arq)) {
                    continue;
                }
                $d = json_decode((string) @file_get_contents($arq), true);
                if (is_array($d) && (int) ($d['n'] ?? 0) >= $max && time() - (int) ($d['t'] ?? 0) < $janela) {
                    return true;
                }
            }
        } catch (Throwable $e) {
        }
        return false;
    }

    function paiLimiteFalha(string $escopo, array $chaves, int $janela): void
    {
        try {
            foreach ($chaves as $c) {
                $arq = paiLimiteArquivo($escopo, (string) $c);
                $d = is_file($arq) ? json_decode((string) @file_get_contents($arq), true) : null;
                if (!is_array($d) || time() - (int) ($d['t'] ?? 0) >= $janela) {
                    $d = ['n' => 0, 't' => time()];
                }
                $d['n'] = (int) $d['n'] + 1;
                @file_put_contents($arq, json_encode($d), LOCK_EX);
            }
        } catch (Throwable $e) {
        }
    }

    function paiLimiteLimpar(string $escopo, array $chaves): void
    {
        foreach ($chaves as $c) {
            $arq = paiLimiteArquivo($escopo, (string) $c);
            if (is_file($arq)) {
                @unlink($arq);
            }
        }
    }

    function paiLimiteArquivo(string $escopo, string $chave): string
    {
        $dir = '/home2/pla48587/logs_pai/limites';
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        return $dir . '/' . preg_replace('/[^a-z0-9_]/', '', strtolower($escopo)) . '_' . sha1($chave) . '.json';
    }

    /** Chave para chamadas entre PHPs do próprio servidor (mesmo pai-chaves.php). '' sem segredo. */
    function paiChaveInternaServidor(): string
    {
        $s = (string) (paiSessaoConfig()['pai_session_secret'] ?? '');
        return strlen($s) < 16 ? '' : hash_hmac('sha256', 'pai-chave-interna-servidor-v1', $s);
    }

    /** Cabeçalho para curl: ['X-PAI-Internal-Key: ...'] ou [] sem segredo. */
    function paiCabecalhoInterno(): array
    {
        $k = paiChaveInternaServidor();
        return $k === '' ? [] : ['X-PAI-Internal-Key: ' . $k];
    }

    /** Quem chama por chave interna: 'servidor', 'interna:<nome>' ou ''. */
    function paiChamadaInterna(): string
    {
        $h = (string) ($_SERVER['HTTP_X_PAI_INTERNAL_KEY'] ?? '');
        if ($h === '' || strlen($h) < 32) {
            return '';
        }
        $k = paiChaveInternaServidor();
        if ($k !== '' && hash_equals($k, $h)) {
            return 'servidor';
        }
        $lista = paiSessaoConfig()['associados_chaves_internas'] ?? [];
        if (is_array($lista)) {
            foreach ($lista as $nome => $chave) {
                $chave = (string) $chave;
                if (strlen($chave) >= 32 && hash_equals($chave, $h)) {
                    return 'interna:' . (is_string($nome) ? $nome : 'chave');
                }
            }
        }
        return '';
    }

    /** Modo do grupo: 'geral' usa pai_protecao_modo; os demais, pai_protecao_modo_<grupo> (padrão observar). */
    function paiProtecaoModo(string $grupo = 'geral'): string
    {
        $cfg = paiSessaoConfig();
        $m = strtolower(trim((string) ($cfg['pai_protecao_modo_' . $grupo]
            ?? ($grupo === 'geral' ? ($cfg['pai_protecao_modo'] ?? 'observar') : 'observar'))));
        return in_array($m, ['desligado', 'observar', 'exigir'], true) ? $m : 'observar';
    }

    /**
     * Texto de erro para devolver ao navegador (v6). Erros técnicos (banco, caminhos, avisos do PHP) viram
     * "Erro interno no servidor (ref. XXXXXXXX)" e o texto completo vai para logs_pai/erros_AAAA-MM-DD.log.
     * Mensagens de validação (as que o próprio sistema escreve para o usuário) passam como estão.
     */
    function paiErroTexto(Throwable $e): string
    {
        $m = (string) $e->getMessage();
        $tecnico = ($e instanceof PDOException) || ($e instanceof mysqli_sql_exception) || ($e instanceof Error)
            || preg_match('~SQLSTATE|mysqli|PDO|/home\d*/|\.php\b|Stack trace|Undefined (index|offset|array key|variable)|Call to |Unknown column|Table \'|syntax error|Access denied|Connection refused~i', $m);
        if (!$tecnico) {
            return $m;
        }
        $ref = strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        try {
            $dir = '/home2/pla48587/logs_pai';
            if (!is_dir($dir)) {
                @mkdir($dir, 0750, true);
            }
            @file_put_contents($dir . '/erros_' . date('Y-m-d') . '.log', json_encode([
                'em' => date('Y-m-d H:i:s'), 'ref' => $ref,
                'arquivo' => basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')),
                'classe' => get_class($e), 'erro' => substr($m, 0, 2000),
                'onde' => basename($e->getFile()) . ':' . $e->getLine(),
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
        } catch (Throwable $x) {
        }
        return 'Erro interno no servidor (ref. ' . $ref . ').';
    }

    /** Login do pai_session válido (sem consultar o banco), ou null. */
    function paiLoginAssinado(): ?string
    {
        $l = $GLOBALS['PAI_SESSAO_LOGIN'] ?? null;
        if ($l === null) {
            $v = paiSessaoValidar($_COOKIE['pai_session'] ?? null, (string) (paiSessaoConfig()['pai_session_secret'] ?? ''));
            $l = $v['ok'] ? $v['usuario'] : null;
        }
        return ($l === null || $l === '') ? null : (string) $l;
    }

    /** Identifica sem bloquear: usuário do login assinado, chamada interna, ou null. */
    function paiProtecaoQuem(): ?array
    {
        $int = paiChamadaInterna();
        if ($int !== '') {
            return ['id' => 0, 'usuario' => $int, 'nome' => $int, 'cargo' => 'interno', 'paginas' => [], 'interna' => true];
        }
        return paiProtecaoUsuario();
    }

    function paiProtecao(string $nivel = 'login', array $paginas = [], string $rotulo = '', string $grupo = 'geral'): ?array
    {
        if (PHP_SAPI === 'cli' || ($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            return null;
        }
        // Grupo 'geral' segue 'pai_protecao_modo'. Os outros só mudam com a chave própria (padrão observar),
        // para o exigir geral não quebrar telas que ainda dependem de atualização do front.
        $modo = paiProtecaoModo($grupo);
        if ($modo === 'desligado') {
            return null;
        }
        // Chamada entre servidores com chave interna válida passa direto. As chaves de 'associados_chaves_internas'
        // (Aurora, MCP) valem só no grupo 'associados'; a chave do servidor vale em todos.
        $int = paiChamadaInterna();
        if ($int !== '' && ($int === 'servidor' || $grupo === 'associados')) {
            return ['id' => 0, 'usuario' => $int, 'nome' => $int, 'cargo' => 'interno', 'paginas' => [], 'interna' => true];
        }
        $u = paiProtecaoUsuario();
        $motivo = null;
        if ($u === null) {
            $motivo = 'sem_login_assinado';
        } elseif ($nivel === 'admin' && $u['cargo'] !== 'adm' && !array_intersect($paginas, $u['paginas'])) {
            $motivo = 'sem_permissao';
        }
        if ($motivo === null) {
            return $u;
        }
        $arquivo = basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''));
        $chave = 'protecao|' . $modo . '|' . $motivo . '|' . $rotulo . '|' . ($u['usuario'] ?? '') . '|' . ($_SERVER['REMOTE_ADDR'] ?? '');
        if (!paiSessaoJaRegistrado($chave)) {
            paiSessaoLog([
                'modo' => 'protecao_' . $modo, 'grupo' => $grupo,
                'acao' => $modo === 'exigir' ? 'protecao_negada' : 'protecao_seria_negada',
                'motivo' => $motivo, 'rotulo' => $rotulo, 'arquivo' => $arquivo,
                'host' => (string) ($_SERVER['HTTP_HOST'] ?? ''), 'metodo' => (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
                'usuario' => $u['usuario'] ?? null, 'cargo' => $u['cargo'] ?? null,
                'pai_user_cookie' => substr((string) ($_COOKIE['pai_user'] ?? ''), 0, 80),
                'ip' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
                'encaminhado' => substr((string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''), 0, 120),
            ]);
        }
        if ($modo !== 'exigir') {
            return $u;
        }
        $msg = $motivo === 'sem_login_assinado' ? 'Sessão expirada. Faça login novamente.' : 'Sem permissão para esta ação.';
        if (!headers_sent()) {
            http_response_code($motivo === 'sem_login_assinado' ? 401 : 403);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
        }
        echo json_encode(['ok' => false, 'sucesso' => false, 'success' => false, 'erro' => $msg, 'error' => $msg,
            'msg' => $msg, 'message' => $msg, 'need_login' => $motivo === 'sem_login_assinado' ? 1 : 0],
            JSON_UNESCAPED_UNICODE);
        exit;
    }

    function paiSessaoLog(array $linha): void
    {
        try {
            $dir = '/home2/pla48587/logs_pai';
            if (!is_dir($dir)) {
                @mkdir($dir, 0750, true);
            }
            $linha = ['em' => date('Y-m-d H:i:s')] + $linha;
            @file_put_contents($dir . '/pai_sessao_' . date('Y-m-d') . '.log',
                json_encode($linha, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
        } catch (Throwable $e) {
            // log é opcional
        }
    }

    function paiSessaoContarOk(): void
    {
        try {
            $dir = '/home2/pla48587/logs_pai';
            if (!is_dir($dir)) {
                @mkdir($dir, 0750, true);
            }
            $arq = $dir . '/pai_sessao_' . date('Y-m-d') . '_ok.txt';
            $fp = @fopen($arq, 'c+');
            if (!$fp) {
                return;
            }
            if (@flock($fp, LOCK_EX)) {
                $n = (int) stream_get_contents($fp);
                ftruncate($fp, 0);
                rewind($fp);
                fwrite($fp, (string) ($n + 1));
                fflush($fp);
                flock($fp, LOCK_UN);
            }
            fclose($fp);
        } catch (Throwable $e) {
            // contador é opcional
        }
    }

    /** Roda uma vez por requisição, no começo do PHP que incluiu este arquivo. */
    function paiSessaoAplicar(): void
    {
        if (PHP_SAPI === 'cli' || !empty($GLOBALS['PAI_SESSAO_APLICADO'])) {
            return;
        }
        $GLOBALS['PAI_SESSAO_APLICADO'] = true;

        $cfg = paiSessaoConfig();
        $modo = strtolower(trim((string) ($cfg['pai_sessao_modo'] ?? 'desligado')));
        if (!in_array($modo, ['observar', 'exigir'], true)) {
            return;
        }
        $segredo = (string) ($cfg['pai_session_secret'] ?? '');

        $nomesIdentidade = ['pai_auth', 'pai_uid', 'pai_user', 'user', 'pai_nome'];
        $temIdentidade = false;
        foreach ($nomesIdentidade as $n) {
            if (isset($_COOKIE[$n]) && trim((string) $_COOKIE[$n]) !== '' && !($n === 'pai_auth' && $_COOKIE[$n] !== '1')) {
                $temIdentidade = true;
                break;
            }
        }

        $v = paiSessaoValidar($_COOKIE['pai_session'] ?? null, $segredo);
        $GLOBALS['PAI_SESSAO_LOGIN'] = $v['ok'] ? $v['usuario'] : null;

        // Requisição pública (sem cookies de login): nada a conferir.
        if (!$temIdentidade && !$v['ok']) {
            return;
        }

        $loginCookie = trim((string) ($_COOKIE['pai_user'] ?? $_COOKIE['user'] ?? ''));
        $divergente = $v['ok'] && $loginCookie !== '' && mb_strtolower($loginCookie) !== mb_strtolower((string) $v['usuario']);

        if ($v['ok'] && !$divergente) {
            paiSessaoContarOk();
            // renova a cada uso: se o login foi emitido há mais de 5 min, emite um novo com 24 h a partir de agora
            if ((int) ($v['exp'] ?? 0) - time() < PAI_SESSAO_VIDA - PAI_SESSAO_RENOVAR_APOS) {
                paiSessaoRenovar((string) $v['usuario'], $segredo);
            }
        } else {
            $motivoLog = $divergente ? 'usuario_diferente_do_assinado' : $v['motivo'];
            $arquivoLog = basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? ''));
            $chaveLog = $modo . '|' . $motivoLog . '|' . $arquivoLog . '|' . ($_SERVER['HTTP_HOST'] ?? '') . '|' . mb_strtolower($loginCookie);
            if (!paiSessaoJaRegistrado($chaveLog)) paiSessaoLog([
                'modo' => $modo,
                'acao' => $modo === 'exigir' ? 'bloqueado' : 'seria_bloqueado',
                'motivo' => $divergente ? 'usuario_diferente_do_assinado' : $v['motivo'],
                'arquivo' => basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')),
                'host' => (string) ($_SERVER['HTTP_HOST'] ?? ''),
                'metodo' => (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
                'action' => substr((string) ($_GET['action'] ?? $_GET['op'] ?? ''), 0, 60),
                'pai_user' => substr($loginCookie, 0, 80),
                'pai_uid' => substr((string) ($_COOKIE['pai_uid'] ?? ''), 0, 20),
                'assinado' => $v['usuario'],
                'ip' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
                'encaminhado' => substr((string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''), 0, 120),
            ]);
        }

        if ($modo !== 'exigir') {
            return;
        }

        // Modo exigir: só o usuário assinado vale.
        foreach ($nomesIdentidade as $n) {
            unset($_COOKIE[$n]);
        }
        if ($v['ok']) {
            $_COOKIE['pai_auth'] = '1';
            $_COOKIE['pai_user'] = $v['usuario'];
            $_COOKIE['user'] = $v['usuario'];
        }
        paiSessaoInstalarFiltro();
    }

    try {
        paiSessaoAplicar();
    } catch (Throwable $e) {
        // nunca derruba o PHP que incluiu este arquivo
    }
}
