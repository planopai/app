<?php
/**
 * os_regras.php — Regras de negócio da Ordem de Serviço digital (revisão 2)
 * PAI – Plano Assistencial Integrado
 *
 * ESTADO: código de referência AINDA NÃO IMPLANTADO. Ver CHECKLIST_ANTES_DE_SUBIR.md.
 *
 * Decisões desta revisão (todas corrigem achados da análise):
 *  - Configuração em arquivo (os_config.php), não em getenv(): o plano da HostGator não tem variáveis de ambiente.
 *  - Autenticação por gancho: o app define `autenticarUsuarioPAI(): ?array` (['id'=>int,'cargo'=>string]).
 *    Sem ele, tudo dá 401 — exceto em modo_teste.
 *  - Toda operação de várias etapas roda em transação, com lock de linha.
 *  - Erros de regra de negócio usam RegraNegocioException (PDOException também é RuntimeException;
 *    misturar os dois vazava mensagem de SQL para o cliente).
 *  - Nota promissória só existe para OS de natureza PARTICULAR; o texto é o mesmo no fluxo simples e no de plataforma,
 *    e no fluxo de plataforma o texto da NP vai DENTRO do documento enviado para assinatura.
 *  - (rev. 3) Preço do item editável (acima da referência livre; abaixo = desconto com limite), confirmação dos valores antes de assinar,
 *    documentos (OS e NP) exportáveis em HTML/impressão/PDF/PNG — ver os_documentos.php.
 *  - Assinatura por plataforma externa continua no escopo, sem provedor definido (provedor_assinatura = null).
 *    Existe o provedor SIMULADO (só em modo_teste) para exercitar o fluxo completo sem contratar nada.
 */

const LIMITE_DESCONTO_AGENTE = 20.00; // % padrão — soma de TODOS os descontos da OS (itens + geral) sobre o valor com acréscimos.
// Ajustável no os_config.php: 'limite_desconto_percentual' => 20 (22/10/2026; antes 8%). Use limiteDescontoAgente().
const TOLERANCIA_CENTAVO = 0.01;
const FORMAS_PAGAMENTO = ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'TRANSFERENCIA', 'CHEQUE', 'BOLETO', 'OUTRO'];

date_default_timezone_set('America/Bahia');

/** Erro de regra de negócio, com o status HTTP que o endpoint deve devolver. */
class RegraNegocioException extends RuntimeException {
    public int $codigoHttp;
    public function __construct(string $mensagem, int $codigoHttp = 400) {
        parent::__construct($mensagem);
        $this->codigoHttp = $codigoHttp;
    }
}

/* =====================================================================
 * CONFIGURAÇÃO, CONEXÃO, AUTENTICAÇÃO
 * ===================================================================== */

/** Arquivo privado do sistema com a conexão do banco (o mesmo do convenio.php e do pai_api.php). */
const PAI_CHAVES_FILE = '/home2/pla48587/pai-chaves.php';

/**
 * Configuração da OS:
 *  1) banco: lido do pai-chaves.php do sistema (db_host, db_name, db_user, db_password) — nada a duplicar;
 *  2) ajustes da OS (opcional): os_config.php na mesma pasta (ou OS_CONFIG_PATH / ../pai_config/os_config.php),
 *     que sobrescreve o que precisar (ex.: translado.produto_id, mapa_atendimento).
 */
/** Limite de desconto do agente, em % (soma de todos os descontos da OS). os_config.php → limite_desconto_percentual; padrão 20%. */
function limiteDescontoAgente(): float {
    $v = osConfig('limite_desconto_percentual', LIMITE_DESCONTO_AGENTE);
    $v = is_numeric($v) ? (float) $v : LIMITE_DESCONTO_AGENTE;
    return max(0.0, min(100.0, $v));
}

function osConfig(?string $chave = null, $padrao = null) {
    static $cfg = null;
    if ($cfg === null) {
        $cfg = [];
        $chaves = getenv('PAI_CHAVES_FILE') ?: PAI_CHAVES_FILE;
        if (!getenv('OS_CONFIG_PATH') && is_file($chaves) && is_readable($chaves)) {
            $pai = require $chaves;
            if (is_array($pai)) {
                $cfg = ['db_host' => $pai['db_host'] ?? '', 'db_name' => $pai['db_name'] ?? '', 'db_user' => $pai['db_user'] ?? '',
                        'db_pass' => $pai['db_password'] ?? ($pai['db_pass'] ?? '')];
            }
        }
        $candidatos = [];
        if (getenv('OS_CONFIG_PATH')) {
            $candidatos[] = getenv('OS_CONFIG_PATH');
        }
        if (!empty($_SERVER['DOCUMENT_ROOT'])) {
            $candidatos[] = rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/../pai_config/os_config.php';
        }
        $candidatos[] = __DIR__ . '/os_config.php';
        foreach ($candidatos as $caminho) {
            if (is_file($caminho)) {
                $lido = require $caminho;
                if (is_array($lido)) {
                    $cfg = array_replace($cfg, $lido);
                }
                break;
            }
        }
    }
    return $chave === null ? $cfg : ($cfg[$chave] ?? $padrao);
}

function modoTeste(): bool {
    return (bool) osConfig('modo_teste', false);
}

function conectarBanco(): PDO {
    $host = osConfig('db_host', 'localhost');
    $db   = osConfig('db_name', '');
    if ($db === '') {
        throw new RuntimeException('Configuração do banco não encontrada (pai-chaves.php do sistema ou os_config.php).');
    }
    $pdo = new PDO("mysql:host={$host};dbname={$db};charset=utf8mb4", osConfig('db_user', ''), osConfig('db_pass', ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => true,
    ]);
    $pdo->exec("SET time_zone = '-03:00'"); // Bahia: NOW() do banco alinhado com date() do PHP
    pdoAtual($pdo);
    return $pdo;
}

/** Conexão da requisição (usada pelas consultas ao cadastro de convênios). */
function pdoAtual(?PDO $novo = null): ?PDO {
    static $pdo = null;
    if ($novo) {
        $pdo = $novo;
    }
    return $pdo;
}

/**
 * Cadastro de convênios = tabela `convenios` do app (convenio.php). A OS usa as colunas os_* (alteracoes_convenios.sql):
 * os_tipo (PARTICULAR/ASSOCIADO/PREFEITURA), os_codigo (ASSOCIADO_FLEX, PREFEITURA_BARREIRAS…), os_codigo_numero (Bar),
 * os_aditivos. Ativo/nome/regras continuam sendo mantidos pela tela de convênios.
 * Retorna ['id','codigo','tipo','nome','codigo_numero','aditivos_permitidos'(array),'ativo','regras'] ou null.
 */
function convenioCadastrado(string $codigo): ?array {
    $pdo = pdoAtual();
    if (!$pdo) {
        return null;
    }
    try {
        $st = $pdo->prepare('SELECT * FROM convenios WHERE os_codigo = :c LIMIT 1');
        $st->execute(['c' => strtoupper(trim($codigo))]);
        $r = $st->fetch();
    } catch (Throwable $e) {
        return null;
    }
    return $r ? mapearConvenioOS($r) : null;
}

function mapearConvenioOS(array $r): array {
    $nome = (string) $r['nome'];
    if ($r['os_tipo'] === 'PREFEITURA') {   // "Prefeitura de Barreiras" -> "Barreiras"
        $nome = trim(preg_replace('/^prefeitura( municipal)?( de| da| do)?\s+/iu', '', $nome)) ?: $nome;
    } elseif ($r['os_tipo'] === 'ASSOCIADO') {
        $nome = trim(preg_replace('/^(plano|associado)\s+/iu', '', $nome)) ?: $nome;
    }
    $regras = json_decode((string) ($r['regras_json'] ?? ''), true);
    return [
        'id' => (int) $r['id'], 'codigo' => (string) $r['os_codigo'], 'tipo' => (string) $r['os_tipo'], 'nome' => $nome,
        'nome_cadastro' => (string) $r['nome'], 'slug' => (string) ($r['slug'] ?? ''),
        'codigo_numero' => $r['os_codigo_numero'] !== null ? (string) $r['os_codigo_numero'] : null,
        'aditivos_permitidos' => array_values(array_filter(array_map('trim', explode(',', strtoupper((string) $r['os_aditivos']))))),
        'ativo' => (int) $r['ativo'] === 1, 'regras' => is_array($regras) ? $regras : [],
    ];
}

/** Tela de convênios ("Dados da OS" do convênio): tipo, código do número (Prefeitura) e aditivos (plano). O código não muda depois de definido. */
function definirConvenioOS(PDO $pdo, int $convenioId, string $tipo, ?string $codigoNumero, ?string $aditivos): array {
    $tipo = strtoupper(trim($tipo));
    if (!in_array($tipo, ['PARTICULAR', 'PREFEITURA', 'ASSOCIADO'], true)) {
        throw new RegraNegocioException('Tipo da OS inválido (PARTICULAR, ASSOCIADO ou PREFEITURA).');
    }
    $st = $pdo->prepare('SELECT * FROM convenios WHERE id = :id');
    $st->execute(['id' => $convenioId]);
    $c = $st->fetch();
    if (!$c) {
        throw new RegraNegocioException('Convênio não encontrado.', 404);
    }
    if ($c['os_codigo'] && $c['os_tipo'] && $c['os_tipo'] !== $tipo) {
        throw new RegraNegocioException('O tipo da OS deste convênio já foi definido (' . $c['os_tipo'] . ') e não muda, porque as OS já usam o código ' . $c['os_codigo'] . '.', 409);
    }
    $codigo = $c['os_codigo'];
    if (!$codigo) {
        $base = strtoupper(trim(preg_replace('/[^A-Za-z0-9]+/', '_', iconv('UTF-8', 'ASCII//TRANSLIT', (string) $c['nome'])), '_'));
        $base = preg_replace('/^(PREFEITURA(_MUNICIPAL)?(_DE|_DA|_DO)?|PLANO|ASSOCIADO)_/', '', $base);
        $codigo = $tipo === 'PARTICULAR' ? 'PARTICULAR' . ($base !== 'PARTICULAR' ? '_' . $base : '') : $tipo . '_' . $base;
        $codigo = substr($codigo, 0, 40);
    }
    $num = null;
    if ($tipo === 'PREFEITURA') {
        $num = $codigoNumero !== null && trim($codigoNumero) !== '' ? trim($codigoNumero) : ucfirst(strtolower(substr(preg_replace('/^PREFEITURA_/', '', $codigo), 0, 3)));
        if (!preg_match('/^[A-Za-z]{3}$/', $num)) {
            throw new RegraNegocioException('O código do número da OS da Prefeitura tem 3 letras (ex.: Bar).');
        }
        $num = ucfirst(strtolower($num));
    }
    $lista = '';
    if ($tipo === 'ASSOCIADO' && $aditivos !== null) {
        $itens = array_values(array_unique(array_filter(array_map('trim', explode(',', strtoupper($aditivos))))));
        foreach ($itens as $a) {
            if (!in_array($a, SERVICOS_CONDICIONAIS, true)) {
                throw new RegraNegocioException('Aditivo inválido: ' . $a . ' (use ' . implode(', ', SERVICOS_CONDICIONAIS) . ').');
            }
        }
        $lista = implode(',', $itens);
    }
    try {
        $pdo->prepare('UPDATE convenios SET os_tipo = :t, os_codigo = :c, os_codigo_numero = :n, os_aditivos = :a WHERE id = :id')
            ->execute(['t' => $tipo, 'c' => $codigo, 'n' => $num, 'a' => $tipo === 'ASSOCIADO' ? $lista : null, 'id' => $convenioId]);
    } catch (PDOException $e) {
        if ((string) $e->getCode() === '23000') {
            throw new RegraNegocioException("Já existe outro convênio com o código {$codigo}.", 409);
        }
        throw $e;
    }
    return convenioCadastrado($codigo);
}

function listarConvenios(PDO $pdo): array {
    return array_map(function ($r) {
        return $r['os_codigo'] ? mapearConvenioOS($r)
            : ['id' => (int) $r['id'], 'codigo' => null, 'tipo' => null, 'nome' => (string) $r['nome'], 'nome_cadastro' => (string) $r['nome'], 'ativo' => (int) $r['ativo'] === 1];
    }, $pdo->query('SELECT * FROM convenios ORDER BY ordem, nome')->fetchAll());
}

/** Convênio desativado não abre OS nova (as OS já lançadas não mudam). */
function exigirConvenioAtivo(?string $convenio): void {
    $c = strtoupper((string) $convenio);
    if (strpos($c, 'PREFEITURA') !== 0 && strpos($c, 'ASSOCIADO') !== 0) {
        return;
    }
    $cad = convenioCadastrado($c);
    if ($cad && !$cad['ativo']) {
        throw new RegraNegocioException("Convênio {$cad['nome']} está desativado — não abre OS nova.", 422);
    }
}

/**
 * Usuário autenticado. Produção: o app deve definir autenticarUsuarioPAI() retornando
 * ['id' => int, 'cargo' => string] ou null. Em modo_teste, aceita usuario_id/usuario_cargo do request.
 */
function usuarioAutenticado(): ?array {
    if (function_exists('autenticarUsuarioPAI')) {
        $u = autenticarUsuarioPAI();
        if (!is_array($u) || empty($u['id'])) {
            return null;
        }
        $out = ['id' => (int) $u['id'], 'cargo' => (string) ($u['cargo'] ?? '')];
        if (array_key_exists('paginas', $u)) {   // login do sistema: permissões por página (pai_api.php)
            $out['paginas'] = array_values((array) $u['paginas']);
            $out['nome'] = (string) ($u['nome'] ?? '');
        }
        return $out;
    }
    if (modoTeste()) {
        return ['id' => (int) ($_REQUEST['usuario_id'] ?? 1), 'cargo' => (string) ($_REQUEST['usuario_cargo'] ?? 'agente')];
    }
    return null;
}

function cargoEhAdmin(string $cargo): bool {
    return $cargo !== '' && $cargo === osConfig('cargo_admin', 'adm');
}

function exigirCargo(array $usuario, array $cargosPermitidos): void {
    if (!in_array($usuario['cargo'], $cargosPermitidos, true)) {
        throw new RegraNegocioException('Seu cargo não tem permissão para esta operação.', 403);
    }
}

/** Página do sistema usada por cada área da OS (as páginas são as do pai_api.php; nada é criado ou alterado lá). */
function paginaDaArea(string $area): string {
    $mapa = (array) osConfig('paginas_permissao', ['financeiro' => 'administrativo', 'convenios' => 'convenio', 'atendimento' => 'atendimento']);
    return (string) ($mapa[$area] ?? $area);
}

function temPagina(array $usuario, string $area): bool {
    return cargoEhAdmin((string) $usuario['cargo']) || in_array(paginaDaArea($area), (array) ($usuario['paginas'] ?? []), true);
}

/**
 * Exige a permissão da área. Com o login do sistema (os_auth_pai.php) vale a permissão de PÁGINA (permissoes/cargo_paginas);
 * sem ele (modo_teste), vale a lista de cargos de reserva.
 */
function exigirArea(array $usuario, string $area, array $cargosReserva = []): void {
    if (array_key_exists('paginas', $usuario)) {
        if (!temPagina($usuario, $area)) {
            throw new RegraNegocioException('Sem permissão para esta operação (página "' . paginaDaArea($area) . '").', 403);
        }
        return;
    }
    exigirCargo($usuario, $cargosReserva);
}

function emTransacao(PDO $pdo, callable $fn) {
    if ($pdo->inTransaction()) {
        return $fn();
    }
    $pdo->beginTransaction();
    try {
        $resultado = $fn();
        $pdo->commit();
        return $resultado;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/* =====================================================================
 * UTILITÁRIOS (CPF, extenso, datas, dinheiro)
 * ===================================================================== */

function dinheiro(float $v): float {
    return round($v, 2);
}

function formatarReais(float $v): string {
    return 'R$ ' . number_format($v, 2, ',', '.');
}

function validarCpf(string $cpf): bool {
    $d = preg_replace('/\D/', '', $cpf);
    if (strlen($d) !== 11 || preg_match('/^(\d)\1{10}$/', $d)) {
        return false;
    }
    for ($t = 9; $t < 11; $t++) {
        $soma = 0;
        for ($i = 0; $i < $t; $i++) {
            $soma += (int) $d[$i] * (($t + 1) - $i);
        }
        if ((int) $d[$t] !== ((10 * $soma) % 11) % 10) {
            return false;
        }
    }
    return true;
}

function mascararCpf(?string $cpf): ?string {
    if ($cpf === null || $cpf === '') {
        return null;
    }
    $d = preg_replace('/\D/', '', $cpf);
    return strlen($d) === 11 ? '***.***.***-' . substr($d, -2) : '***';
}

function validarData(string $data): string {
    $dt = DateTime::createFromFormat('!Y-m-d', $data);
    if (!$dt || $dt->format('Y-m-d') !== $data) {
        throw new RegraNegocioException("Data inválida: '{$data}' (use AAAA-MM-DD).", 400);
    }
    return $data;
}

function dataPorExtenso(string $dataYmd): string {
    $meses = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    [$a, $m, $d] = array_map('intval', explode('-', $dataYmd));
    return "{$d} de {$meses[$m]} de {$a}";
}

function grupoPorExtenso(int $n): string { // 1..999
    $un = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
           'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    $dz = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    $ct = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    if ($n === 100) {
        return 'cem';
    }
    $partes = [];
    $c = intdiv($n, 100);
    $r = $n % 100;
    if ($c > 0) {
        $partes[] = $ct[$c];
    }
    if ($r > 0) {
        $partes[] = $r < 20 ? $un[$r] : $dz[intdiv($r, 10)] . ($r % 10 ? ' e ' . $un[$r % 10] : '');
    }
    return implode(' e ', $partes);
}

function numeroPorExtenso(int $n): string {
    if ($n === 0) {
        return 'zero';
    }
    $partes = []; // cada parte: [texto, valor do grupo]
    $milhoes = intdiv($n, 1000000);
    $mil = intdiv($n % 1000000, 1000);
    $resto = $n % 1000;
    if ($milhoes > 0) {
        $partes[] = [$milhoes === 1 ? 'um milhão' : grupoPorExtenso($milhoes) . ' milhões', $milhoes];
    }
    if ($mil > 0) {
        $partes[] = [$mil === 1 ? 'mil' : grupoPorExtenso($mil) . ' mil', $mil];
    }
    if ($resto > 0) {
        $partes[] = [grupoPorExtenso($resto), $resto];
    }
    $texto = $partes[0][0];
    for ($i = 1; $i < count($partes); $i++) {
        $valor = $partes[$i][1];
        $ultima = $i === count($partes) - 1;
        $texto .= ($ultima && ($valor < 100 || $valor % 100 === 0)) ? ' e ' : ' ';
        $texto .= $partes[$i][0];
    }
    return $texto;
}

/** 443.75 => "quatrocentos e quarenta e três reais e setenta e cinco centavos" */
function valorPorExtenso(float $valor): string {
    $centavosTotal = (int) round($valor * 100);
    $reais = intdiv($centavosTotal, 100);
    $cent = $centavosTotal % 100;
    $partes = [];
    if ($reais > 0) {
        $sufixo = $reais === 1 ? ' real' : (($reais % 1000000 === 0) ? ' de reais' : ' reais');
        $partes[] = numeroPorExtenso($reais) . $sufixo;
    }
    if ($cent > 0) {
        $partes[] = numeroPorExtenso($cent) . ($cent === 1 ? ' centavo' : ' centavos');
    }
    return $partes ? implode(' e ', $partes) : 'zero real';
}

function mascararOSParaResposta(array $os): array {
    $os['assinatura_responsavel_cpf'] = mascararCpf($os['assinatura_responsavel_cpf'] ?? null);
    return $os;
}

/* =====================================================================
 * DIAGNÓSTICO DE SCHEMA — rode primeiro (100% leitura, INFORMATION_SCHEMA)
 * ===================================================================== */

function diagnosticoSchema(PDO $pdo): array {
    $fonte = osConfig('fonte_preco', []) + ['tabela' => 'est_produto', 'coluna_id' => 'id', 'coluna_preco' => 'valor', 'coluna_nome' => 'nome'];
    $tabelasEsperadas = [
        $fonte['tabela'] => ['origem' => 'ASSUMIDA (já existe no projeto)', 'usada_para' => 'preço de venda — buscarPrecoVenda(). ATENÇÃO: mesmo que a tabela/coluna existam, o valor pode não ser o usado pela tela de OS (isso o diagnóstico não detecta).', 'colunas_esperadas' => [$fonte['coluna_id'], $fonte['coluna_preco'], $fonte['coluna_nome'] ?? 'nome']],
        'sepultamentos' => ['origem' => 'ASSUMIDA (já existe no projeto)', 'usada_para' => 'vínculo da OS com o atendimento e dados impressos no documento (falecido, cemitério, responsável, contato, velório, agente)', 'colunas_esperadas' => ['id', 'falecido', 'local', 'nome_responsavel', 'cpf_responsavel', 'contato', 'local_velorio', 'agente', 'convenio']],
        'usuarios' => ['origem' => 'ASSUMIDA (já existe no projeto)', 'usada_para' => 'cargo do usuário — necessário para implementar autenticarUsuarioPAI()', 'colunas_esperadas' => ['id', 'cargo']],
        'os_sequencia' => ['origem' => 'NOVA', 'usada_para' => 'numeração das OS', 'colunas_esperadas' => ['sufixo', 'ultimo']],
        'os_pacote_padrao' => ['origem' => 'NOVA', 'usada_para' => 'pacote padrão por convênio — 16.1', 'colunas_esperadas' => ['id', 'convenio', 'categoria', 'produto_id', 'valor_contrato', 'ativo']],
        'os_ordens' => ['origem' => 'NOVA', 'usada_para' => 'a OS — 16.2/16.3/16.4', 'colunas_esperadas' => ['id', 'numero_os', 'tipo', 'atendimento_id', 'natureza', 'status', 'valor_total', 'confirmada_em', 'confirmada_valor_total', 'pago_no_ato', 'envelope_id']],
        'os_itens' => ['origem' => 'NOVA', 'usada_para' => 'itens da OS — 16.2', 'colunas_esperadas' => ['id', 'os_id', 'produto_id', 'tipo_item', 'frase_faixa', 'valor_unitario_travado', 'valor_unitario_aplicado', 'valor_final']],
        'os_eventos' => ['origem' => 'NOVA', 'usada_para' => 'linha do tempo da OS', 'colunas_esperadas' => ['id', 'os_id', 'tipo', 'descricao', 'usuario_id', 'criado_em']],
        'os_convenio_regras' => ['origem' => 'NOVA', 'usada_para' => 'rotina de valores e regras dos convênios', 'colunas_esperadas' => ['id', 'convenio', 'chave', 'valor', 'vigente_desde']],
        'os_convenio_pacotes' => ['origem' => 'NOVA', 'usada_para' => 'pacotes da Prefeitura (rotina)', 'colunas_esperadas' => ['id', 'convenio', 'nome', 'valor', 'vigente_desde']],
        'convenios' => ['origem' => 'EXISTENTE (convenio.php) + colunas os_*', 'usada_para' => 'cadastro de convênios', 'colunas_esperadas' => ['id', 'nome', 'slug', 'ativo', 'regras_json', 'os_tipo', 'os_codigo', 'os_codigo_numero', 'os_aditivos']],
        'os_np' => ['origem' => 'NOVA', 'usada_para' => 'nota promissória única da OS (saldo, à vista) — 16.4', 'colunas_esperadas' => ['id', 'os_id', 'valor', 'emitida_em', 'status', 'baixada_em']],
        'os_webhook_assinatura_log' => ['origem' => 'NOVA', 'usada_para' => 'auditoria de webhooks', 'colunas_esperadas' => ['id', 'envelope_id', 'payload_bruto']],
        'os_descontos_log' => ['origem' => 'NOVA', 'usada_para' => 'auditoria de descontos — 16.5', 'colunas_esperadas' => ['id', 'os_item_id', 'usuario_id', 'percentual_solicitado']],
        'os_financeiro' => ['origem' => 'NOVA', 'usada_para' => 'proposta financeira — 16.6', 'colunas_esperadas' => ['id', 'os_id', 'tipo_proposta', 'valor_alvo', 'status']],
        'os_financeiro_pagamentos' => ['origem' => 'NOVA', 'usada_para' => 'recebimentos — 16.6', 'colunas_esperadas' => ['id', 'financeiro_id', 'forma_pagamento', 'valor', 'data_pagamento', 'estornado']],
        'os_precos_log' => ['origem' => 'NOVA', 'usada_para' => 'auditoria de edição de valores', 'colunas_esperadas' => ['id', 'os_item_id', 'valor_referencia', 'valor_anterior', 'valor_novo', 'tipo']],
        'os_documentos_log' => ['origem' => 'NOVA', 'usada_para' => 'auditoria de exportação/impressão de OS e NP', 'colunas_esperadas' => ['id', 'os_id', 'tipo', 'formato', 'usuario_id']],
        'os_financeiro_comprovantes' => ['origem' => 'NOVA', 'usada_para' => 'fotos de comprovante — 16.6', 'colunas_esperadas' => ['id', 'pagamento_id', 'arquivo_url']],
    ];

    $resultado = [];
    foreach ($tabelasEsperadas as $tabela => $info) {
        $stmt = $pdo->prepare('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t');
        $stmt->execute(['t' => $tabela]);
        $reais = array_column($stmt->fetchAll(), 'COLUMN_NAME');
        $existe = count($reais) > 0;
        $faltando = $existe ? array_values(array_diff($info['colunas_esperadas'], $reais)) : $info['colunas_esperadas'];
        $resultado[$tabela] = $info + ['existe' => $existe, 'colunas_encontradas' => $reais, 'colunas_faltando' => $faltando, 'ok' => $existe && !$faltando];
    }
    $tudoOk = !in_array(false, array_column($resultado, 'ok'), true);
    return [
        'banco_nome' => $pdo->query('SELECT DATABASE()')->fetchColumn(),
        'tudo_ok' => $tudoOk,
        'tabelas' => $resultado,
        'proximo_passo' => $tudoOk
            ? 'Schema confere. Faltam as ressalvas que o diagnóstico não checa: fonte de preço real, autenticarUsuarioPAI(), segredo do webhook — ver CHECKLIST_ANTES_DE_SUBIR.md.'
            : 'Há tabela/coluna faltando ou com nome diferente — ajuste os nomes assumidos (os_config.php → fonte_preco) ou o schema antes de testar os endpoints.',
    ];
}

/* =====================================================================
 * PACOTE PADRÃO, PREÇO, NÚMERO E BUSCA DE OS
 * ===================================================================== */

function buscarPacotePadrao(PDO $pdo, string $convenio, string $categoria): ?array {
    if (strpos(strtoupper($convenio), 'PREFEITURA') === 0) {
        $p = pacoteVigente($pdo, $convenio);
        foreach ($p['itens'] ?? [] as $it) {
            if ($it['categoria'] === strtoupper($categoria)) {
                return ['convenio' => $p['convenio'], 'categoria' => $it['categoria'], 'produto_id' => $it['produto_id'], 'valor_contrato' => null, 'pacote_id' => $p['id'], 'valor_item' => $it['valor_item'], 'aceitos' => $p['aceitos'][$it['categoria']] ?? []];
            }
        }
        return null;
    }
    $stmt = $pdo->prepare('SELECT * FROM os_pacote_padrao WHERE convenio = :c AND categoria = :cat AND ativo = 1 LIMIT 1');
    $stmt->execute(['c' => $convenio, 'cat' => $categoria]);
    if ($row = $stmt->fetch()) {
        return $row;
    }
    if (($sala = padraoSalaVelorioAssociado($convenio, $categoria)) !== null) {
        return $sala;
    }
    return padraoDasRegrasDoConvenio($convenio, $categoria);
}

/**
 * Sala do velório do Memorial para associado (06/10/2026): entra na OS pelo preço particular e o plano garante a dedução.
 * Todas as salas do mapa (itens_por_tipo.SALA_VELORIO) são aceitas, então a sala escolhida fica coberta pelo valor dela.
 * Prefeitura não passa por aqui (sem padrão: a sala vai inteira para a Dif.Prf) e Particular paga o valor cheio.
 */
function padraoSalaVelorioAssociado(string $convenio, string $categoria): ?array {
    if (strtoupper($categoria) !== 'SALA_VELORIO' || strpos(strtoupper($convenio), 'ASSOCIADO') !== 0) {
        return null;
    }
    $salas = array_values(array_filter(array_map('intval', (array) (mapaAtendimento()['itens_por_tipo']['SALA_VELORIO'][2] ?? []))));
    if (!$salas) {
        return null;
    }
    return ['convenio' => strtoupper($convenio), 'categoria' => 'SALA_VELORIO', 'produto_id' => $salas[0], 'valor_contrato' => null, 'aceitos' => $salas];
}

/**
 * Item padrão a partir das regras Sim/Não da tela de convênios (convenios.regras_json): produto do item marcado "Sim".
 * Serviços (ornamentação, assistência): o produto de serviço vem de os_config.php → mapa_atendimento.
 */
function padraoDasRegrasDoConvenio(string $convenio, string $categoria): ?array {
    $cad = convenioCadastrado($convenio);
    if (!$cad) {
        return null;
    }
    $chaves = ['URNA' => 'urna', 'ROUPA' => 'roupa', 'INVOLUCRO' => 'invol', 'VEU' => 'veu', 'CORDAO' => 'cordao', 'COROA' => 'coroa_flores'];
    $cat = strtoupper($categoria);
    $r = regrasDoPacoteEscolhido((string) $cad['codigo']) ?? $cad['regras'];   // pacote escolhido no atendimento, senão o padrão do convênio
    $prod = 0;
    $aceitos = [];
    if (isset($chaves[$cat])) {
        $item = $r[$chaves[$cat]] ?? [];
        $prod = (($item['valor'] ?? '') === 'Sim') ? (int) ($item['produto_id'] ?? 0) : 0;
        if ($prod > 0) {
            foreach ((array) ($item['produtos'] ?? []) as $pp) {
                $aceitos[] = (int) ($pp['produto_id'] ?? 0);
            }
        }
    } elseif ($cat === 'ORNAMENTACAO' && (($r['ornamentacao']['valor'] ?? '') === 'Sim')) {
        $porTipo = (array) (mapaAtendimento()['itens_por_tipo']['ORNAMENTACAO'][2] ?? []);
        $prod = (int) ($porTipo[$r['ornamentacao']['tipo'] ?? ''] ?? 0);
    } elseif ($cat === 'ASSISTENCIA' && (($r['assistencia']['valor'] ?? '') === 'Sim')) {
        $prod = (int) (mapaAtendimento()['itens']['ASSISTENCIA'][2] ?? 0);
    }
    return $prod > 0 ? ['convenio' => $cad['codigo'], 'categoria' => $cat, 'produto_id' => $prod, 'valor_contrato' => null, 'aceitos' => array_values(array_filter(array_unique($aceitos)))] : null;
}

/**
 * Preço de venda vigente. A fonte vem de os_config.php → fonte_preco.
 * PADRÃO PROVISÓRIO: est_produto.valor (preço de venda; `preco_custo` é o custo). ATENÇÃO — em 30/09/2026 esse valor
 * NÃO bateu com os preços da OS lançada pelo agente (atendimento 1095) em 4 de 5 itens conferidos (ornamentação natural,
 * tanatopraxia, véu luxo, invol grande); só a coroa MOD 09 bateu. A fonte de preço da tela de OS ainda precisa ser
 * identificada. Quando for, basta ajustar 'fonte_preco' no os_config.php — sem mexer em código.
 */
function buscarPrecoVenda(PDO $pdo, int $produtoId): float {
    $fonte = osConfig('fonte_preco', ['tabela' => 'est_produto', 'coluna_id' => 'id', 'coluna_preco' => 'valor']);
    foreach (['tabela', 'coluna_id', 'coluna_preco'] as $k) {
        if (!preg_match('/^[A-Za-z0-9_]+$/', (string) ($fonte[$k] ?? ''))) {
            throw new RuntimeException("fonte_preco.{$k} inválido no os_config.php.");
        }
    }
    $stmt = $pdo->prepare("SELECT `{$fonte['coluna_preco']}` AS preco FROM `{$fonte['tabela']}` WHERE `{$fonte['coluna_id']}` = :id LIMIT 1");
    $stmt->execute(['id' => $produtoId]);
    $row = $stmt->fetch();
    if (!$row) {
        throw new RegraNegocioException("Produto {$produtoId} não encontrado.", 404);
    }
    $preco = dinheiro((float) $row['preco']);
    if ($preco <= 0) {
        throw new RegraNegocioException("Produto {$produtoId} está sem preço de venda válido.", 422);
    }
    return $preco;
}

/**
 * Sufixo do número da OS (revisão 6). A numeração é ÚNICA; o sufixo só diz o tipo:
 *   Prt = Particular · Soc = Associado (plano) · Prf.Bar = Prefeitura de Barreiras · Prf.Ang = Angical · Cor = coroa
 *   Dif.Soc = diferença paga pela família sobre o plano · Dif.Prf = diferença sobre o convênio de Prefeitura (qualquer município)
 */
function sufixoNumeroOS(string $tipo, string $natureza, ?string $convenio): string {
    $c = strtoupper((string) $convenio);
    // Coroa autorizada pela Prefeitura: a autorização vale mais que o tipo — OS Prf (e Dif.Prf para a diferença da família).
    if ($tipo === 'COROA' && strpos($c, 'PREFEITURA') !== 0) {
        return 'Cor';
    }
    $base = null;
    if (strpos($c, 'PREFEITURA') === 0) {
        $base = 'Prf.' . dadosPrefeitura($c)['codigo'];
    } elseif (strpos($c, 'ASSOCIADO') === 0) {
        $base = 'Soc';
    }
    if ($natureza === 'PARTICULAR') {   // a Dif vem sempre logo após a OS de origem: não precisa da cidade
        return $base === null ? 'Prt' : ($base === 'Soc' ? 'Dif.Soc' : 'Dif.Prf');
    }
    if ($base === null) {
        throw new RegraNegocioException("Convênio '{$convenio}' não reconhecido para numerar a OS (esperado ASSOCIADO_* ou PREFEITURA_*).", 422);
    }
    return $base;
}

/** Prefeituras conveniadas (os_config.php → prefeituras). Código = 3 letras usadas no número (Prf.Bra). */
function dadosPrefeitura(string $convenio): array {
    $cad = convenioCadastrado($convenio);
    if ($cad && $cad['tipo'] === 'PREFEITURA') {
        $pc = (array) osConfig('prefeituras', []);
        $cfg = (array) ($pc[strtoupper(trim($convenio))] ?? []);
        return ['convenio' => $cad['codigo'], 'nome' => $cad['nome'], 'codigo' => $cad['codigo_numero'] ?: ucfirst(strtolower(substr($cad['nome'], 0, 3))),
                'precos_contrato' => (array) ($cfg['precos_contrato'] ?? []), 'ativo' => $cad['ativo']];
    }
    $lista = (array) osConfig('prefeituras', [
        'PREFEITURA_BARREIRAS' => ['nome' => 'Barreiras', 'codigo' => 'Bar', 'precos_contrato' => []],
        'PREFEITURA_ANGICAL' => ['nome' => 'Angical', 'codigo' => 'Ang', 'precos_contrato' => []],
    ]);
    $c = strtoupper(trim($convenio));
    if (!isset($lista[$c])) {
        throw new RegraNegocioException("Prefeitura '{$convenio}' não cadastrada (os_config.php → prefeituras).", 422);
    }
    return ['convenio' => $c, 'nome' => (string) $lista[$c]['nome'], 'codigo' => (string) ($lista[$c]['codigo'] ?? ucfirst(strtolower(substr($lista[$c]['nome'], 0, 3)))),
            'precos_contrato' => (array) ($lista[$c]['precos_contrato'] ?? [])];
}

/* ---------- serviços condicionais: tanatopraxia e translado ----------
 * Associado: cobertos só se o plano cobrir (os_config.php → servicos_cobertos_por_plano) ou se o contrato tiver o aditivo;
 *            senão vão inteiros para a Dif.Soc.
 * Prefeitura: se a Prefeitura autorizar, entram no contrato com o preço do contrato (prefeituras → precos_contrato) e não aparecem
 *            na folha; senão vão para a Dif.Prf com o preço de tabela. */
const SERVICOS_CONDICIONAIS = ['TANATOPRAXIA', 'TRANSLADO'];
const SERVICOS_SEMPRE_DIFERENCA = ['TANATOPRAXIA_AVANCADA', 'EMBALSAMAMENTO']; // sempre geram diferença (Associado e Prefeitura); descontam a tanatopraxia normal coberta

/** A coluna existe na tabela? (cache da requisição). O cadastro de pacotes ganhou colunas novas (ativo, padrao…) com o convenio.php. */
function colunaExisteOS(PDO $pdo, string $tabela, string $coluna): bool {
    static $cache = [];
    $k = $tabela . '.' . $coluna;
    if (!array_key_exists($k, $cache)) {
        $st = $pdo->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c LIMIT 1');
        $st->execute(['t' => $tabela, 'c' => $coluna]);
        $cache[$k] = (bool) $st->fetchColumn();
    }
    return $cache[$k];
}

/**
 * Pacote ESCOLHIDO no registro do atendimento: vale enquanto a OS do atendimento é montada ou a prévia é calculada.
 * ['convenio' => código, 'pacote_id' => ?int, 'atendimento_id' => ?int]. Sem contexto (ou sem pacote_id) = pacote PADRÃO do convênio.
 */
function contextoPacote(?array $definir = null, bool $limpar = false): ?array {
    static $ctx = null;
    if ($limpar) {
        $ctx = null;
    }
    if ($definir !== null) {
        $ctx = $definir;
    }
    return $ctx;
}

/** A OS deste convênio está sendo montada SEM o pacote (Prefeitura não autorizou o atendimento funerário)? */
function pacoteSuspensoNoAtendimento(string $convenio): bool {
    $ctx = contextoPacote();
    return $ctx && !empty($ctx['sem_pacote']) && ($ctx['convenio'] ?? '') === strtoupper($convenio);
}

/** Regras (Sim/Não, produtos aceitos) do pacote escolhido no atendimento, ou null quando vale o padrão do convênio. */
function regrasDoPacoteEscolhido(string $codigo): ?array {
    $ctx = contextoPacote();
    $pdo = pdoAtual();
    if (!$pdo || !$ctx || ($ctx['convenio'] ?? '') !== strtoupper($codigo) || (int) ($ctx['pacote_id'] ?? 0) <= 0 || !colunaExisteOS($pdo, 'os_convenio_pacotes', 'regras_json')) {
        return null;
    }
    $st = $pdo->prepare('SELECT regras_json FROM os_convenio_pacotes WHERE id = :id AND convenio = :c');
    $st->execute(['id' => (int) $ctx['pacote_id'], 'c' => strtoupper($codigo)]);
    $j = $st->fetchColumn();
    $r = $j ? json_decode((string) $j, true) : null;
    return is_array($r) ? $r : null;
}

/**
 * Pacote do convênio com os itens inclusos (ou null).
 *  - Se o atendimento escolheu um pacote (contextoPacote), vale ele (mesmo que desativado depois, desde que a OS já o tenha aplicado).
 *  - Senão: o pacote PADRÃO ATIVO do convênio; sem padrão, o ativo mais recente. Pacote desativado nunca é escolhido sozinho.
 * 'itens' = linhas do pacote (uma por produto aceito); 'aceitos' = categoria => ids dos produtos aceitos.
 */
function pacoteVigente(PDO $pdo, string $convenio, ?string $data = null): ?array {
    $codigo = strtoupper($convenio);
    $temAtivo = colunaExisteOS($pdo, 'os_convenio_pacotes', 'ativo');
    $temPadrao = colunaExisteOS($pdo, 'os_convenio_pacotes', 'padrao');
    $p = null;
    $ctx = contextoPacote();
    // Prefeitura que NÃO autorizou o atendimento (09/10/2026): enquanto a OS é montada, o pacote não vale (não cobre nada).
    if ($ctx && !empty($ctx['sem_pacote']) && ($ctx['convenio'] ?? '') === $codigo) {
        return null;
    }
    if ($ctx && ($ctx['convenio'] ?? '') === $codigo && (int) ($ctx['pacote_id'] ?? 0) > 0) {
        $st = $pdo->prepare('SELECT * FROM os_convenio_pacotes WHERE id = :id AND convenio = :c');
        $st->execute(['id' => (int) $ctx['pacote_id'], 'c' => $codigo]);
        $p = $st->fetch() ?: null;
        if ($p && $temAtivo && (int) $p['ativo'] !== 1) {
            $usado = false;
            if (!empty($ctx['atendimento_id'])) {
                $q = $pdo->prepare("SELECT 1 FROM os_ordens WHERE atendimento_id = :a AND pacote_id = :p AND status <> 'CANCELADA' LIMIT 1");
                $q->execute(['a' => (int) $ctx['atendimento_id'], 'p' => (int) $p['id']]);
                $usado = (bool) $q->fetchColumn();
            }
            if (!$usado) {
                $p = null;
            }
        }
    }
    if (!$p) {
        $temTipo = colunaExisteOS($pdo, 'os_convenio_pacotes', 'tipo');   // pacote de Produto (ex.: coroa) nunca é o pacote do atendimento
        $st = $pdo->prepare('SELECT * FROM os_convenio_pacotes WHERE convenio = :c AND vigente_desde <= :d' . ($temAtivo ? ' AND ativo = 1' : '')
            . ($temTipo ? " AND tipo = 'ATENDIMENTO'" : '')
            . ' ORDER BY ' . ($temPadrao ? 'padrao DESC, ' : '') . (colunaExisteOS($pdo, 'os_convenio_pacotes', 'ordem') ? 'ordem, ' : '') . 'vigente_desde DESC, id DESC LIMIT 1');
        $st->execute(['c' => $codigo, 'd' => $data ?? date('Y-m-d')]);
        $p = $st->fetch() ?: null;
    }
    if (!$p) {
        return null;
    }
    $it = $pdo->prepare('SELECT categoria, produto_id, valor_item FROM os_convenio_pacote_itens WHERE pacote_id = :id ORDER BY id');
    $it->execute(['id' => $p['id']]);
    $p['itens'] = [];
    $p['aceitos'] = [];
    foreach ($it->fetchAll() as $r) {
        $cat = strtoupper((string) $r['categoria']);
        $pid = (int) $r['produto_id'];
        $p['itens'][] = ['categoria' => $r['categoria'], 'produto_id' => $pid, 'valor_item' => $r['valor_item'] !== null ? (float) $r['valor_item'] : null];
        $p['aceitos'][$cat][] = $pid;   // a categoria pode ter VÁRIOS produtos aceitos, todos com o mesmo valor de contrato
    }
    $p['valor'] = (float) $p['valor'];
    return $p;
}

/** Rotina: nova versão do pacote da Prefeitura (nome, valor fechado, itens inclusos). As anteriores ficam no histórico. */
function salvarPacoteConvenio(PDO $pdo, string $convenio, string $nome, float $valor, array $itens, ?string $vigenteDesde, ?string $obs, int $usuarioId): array {
    $convenio = strtoupper(trim($convenio));
    if (strpos($convenio, 'PREFEITURA_') !== 0) {
        throw new RegraNegocioException('Pacote com itens inclusos é da Prefeitura (PREFEITURA_<MUNICÍPIO>).');
    }
    dadosPrefeitura($convenio);
    $nome = trim($nome);
    if ($nome === '' || $valor <= 0) {
        throw new RegraNegocioException('Informe o nome e o valor do pacote.');
    }
    if (!$itens) {
        throw new RegraNegocioException('Informe os itens inclusos no pacote.');
    }
    $vistos = [];
    foreach ($itens as $i => $it) {
        $cat = strtoupper(trim((string) ($it['categoria'] ?? '')));
        if ($cat === '' || in_array($cat, SERVICOS_CONDICIONAIS, true) || in_array($cat, SERVICOS_SEMPRE_DIFERENCA, true)) {
            throw new RegraNegocioException("Item {$i}: categoria inválida (tanatopraxia e translado têm preço próprio; avançada/embalsamamento são sempre diferença).");
        }
        if (isset($vistos[$cat])) {
            throw new RegraNegocioException("Categoria {$cat} repetida no pacote.");
        }
        $vistos[$cat] = true;
        buscarPrecoVenda($pdo, (int) ($it['produto_id'] ?? 0));
        if (!isset($it['valor_item']) || $it['valor_item'] === '' || (float) $it['valor_item'] <= 0) {
            throw new RegraNegocioException("Item {$cat}: informe o valor do item no contrato.");
        }
    }
    $soma = dinheiro(array_sum(array_map(fn($it) => (float) $it['valor_item'], $itens)));
    if (abs($soma - dinheiro($valor)) > TOLERANCIA_CENTAVO) {
        throw new RegraNegocioException('A soma dos itens (' . formatarReais($soma) . ') tem que ser igual ao valor do pacote (' . formatarReais($valor) . ').');
    }
    $vig = validarData($vigenteDesde ?: date('Y-m-d'));
    return emTransacao($pdo, function () use ($pdo, $convenio, $nome, $valor, $itens, $vig, $obs, $usuarioId) {
        $pdo->prepare('INSERT INTO os_convenio_pacotes (convenio, nome, valor, vigente_desde, observacao, criado_por) VALUES (:c, :n, :v, :d, :o, :u)')
            ->execute(['c' => $convenio, 'n' => mb_substr($nome, 0, 120), 'v' => dinheiro($valor), 'd' => $vig, 'o' => $obs, 'u' => $usuarioId]);
        $id = (int) $pdo->lastInsertId();
        $ins = $pdo->prepare('INSERT INTO os_convenio_pacote_itens (pacote_id, categoria, produto_id, valor_item) VALUES (:p, :c, :pr, :v)');
        foreach ($itens as $it) {
            $ins->execute(['p' => $id, 'c' => strtoupper(trim($it['categoria'])), 'pr' => (int) $it['produto_id'], 'v' => isset($it['valor_item']) && $it['valor_item'] !== '' ? dinheiro((float) $it['valor_item']) : null]);
        }
        return listarPacotesConvenio($pdo, $convenio);
    });
}

function listarPacotesConvenio(PDO $pdo, string $convenio): array {
    $st = $pdo->prepare('SELECT id FROM os_convenio_pacotes WHERE convenio = :c ORDER BY vigente_desde DESC, id DESC');
    $st->execute(['c' => strtoupper($convenio)]);
    $versoes = [];
    foreach ($st->fetchAll() as $r) {
        $p = $pdo->prepare('SELECT * FROM os_convenio_pacotes WHERE id = :id');
        $p->execute(['id' => $r['id']]);
        $row = $p->fetch();
        $it = $pdo->prepare('SELECT categoria, produto_id, valor_item FROM os_convenio_pacote_itens WHERE pacote_id = :id ORDER BY id');
        $it->execute(['id' => $r['id']]);
        $row['itens'] = $it->fetchAll();
        $versoes[] = $row;
    }
    $vig = pacoteVigente($pdo, $convenio);
    return ['vigente' => $vig, 'versoes' => $versoes,
            'precos_avulsos' => ['TANATOPRAXIA' => precoContratoPrefeitura($pdo, $convenio, 'TANATOPRAXIA'), 'TRANSLADO_KM' => precoContratoPrefeitura($pdo, $convenio, 'TRANSLADO_KM')]];
}

/** Aplica o pacote da Prefeitura na OS (uma vez): guarda a versão e o valor fechado. */
function aplicarPacoteNaOS(PDO $pdo, array $osConv): array {
    if ($osConv['pacote_id'] !== null) {
        return $osConv;
    }
    $p = pacoteVigente($pdo, (string) $osConv['convenio']);
    if (!$p) {
        throw new RegraNegocioException('Pacote da ' . 'Prefeitura de ' . dadosPrefeitura((string) $osConv['convenio'])['nome'] . ' não cadastrado — cadastre na rotina de convênios.', 422);
    }
    $pdo->prepare('UPDATE os_ordens SET pacote_id = :p, valor_pacote = :v WHERE id = :id')->execute(['p' => $p['id'], 'v' => $p['valor'], 'id' => $osConv['id']]);
    registrarEvento($pdo, (int) $osConv['id'], 'ITEM_INCLUIDO', "Pacote \"{$p['nome']}\" aplicado: " . formatarReais($p['valor']) . ' (faturado à Prefeitura)', null, $p['valor']);
    recalcularTotalPrefeitura($pdo, (int) $osConv['id']);
    return buscarOSPorId($pdo, (int) $osConv['id']);
}

/**
 * Tanatopraxia avançada (substitui a normal). Se a tanatopraxia normal é coberta — plano/aditivo no Associado, ou autorizada pela
 * Prefeitura — o convênio cobre o valor da normal e a família paga só a diferença; senão a avançada vai inteira para a Dif.
 *   Associado: valor coberto = preço de tabela da tanatopraxia normal (produto "Tanatopraxia" do estoque)
 *   Vale igual para o EMBALSAMAMENTO. Normal, avançada e embalsamamento são exclusivos: lançar um substitui o outro.
 *   Prefeitura: valor coberto = preço de contrato da tanatopraxia (rotina), faturado à Prefeitura
 */
function lancarTanatopraxiaAvancada(PDO $pdo, int $atendimentoId, string $convenio, int $produtoId, ?int $criadoPor, ?bool $autorizadoPrefeitura, string $categoria = 'TANATOPRAXIA_AVANCADA'): array {
    $ehPref = strpos($convenio, 'PREFEITURA') === 0;
    $osConv = obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO', $convenio, $criadoPor);
    if ($ehPref && pacoteVigente($pdo, $convenio)) {
        $osConv = aplicarPacoteNaOS($pdo, $osConv);
    }
    $osDif = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR');
    foreach (['TANATOPRAXIA', 'TANATOPRAXIA_AVANCADA', 'EMBALSAMAMENTO'] as $cat) {   // preparo do corpo: um só (substitui o anterior) nas duas OS
        removerItensDaCategoria($pdo, (int) $osConv['id'], $cat, ['PADRAO', 'REFERENCIA']);
        if ($osDif) {
            exigirOSAberta($osDif);
            removerItensDaCategoria($pdo, (int) $osDif['id'], $cat, ['DIFERENCA', 'DIRETO', 'ADICIONAL']);
        }
    }
    $preco = buscarPrecoVenda($pdo, $produtoId);
    $cobertoNormal = 0.0;
    if ($ehPref) {
        if ($autorizadoPrefeitura === null) {
            throw new RegraNegocioException('Informe se a Prefeitura autorizou a tanatopraxia (autorizado_prefeitura = 1 ou 0).');
        }
        if ($autorizadoPrefeitura) {
            $cobertoNormal = (float) (precoContratoPrefeitura($pdo, $convenio, 'TANATOPRAXIA') ?? 0);
            if ($cobertoNormal <= 0) {
                throw new RegraNegocioException('Preço de contrato da tanatopraxia não cadastrado — cadastre na rotina de convênios.', 422);
            }
            $ref = inserirItem($pdo, (int) $osConv['id'], $produtoId, $categoria, 1, $preco, true, 'REFERENCIA');
            $pdo->prepare('UPDATE os_itens SET valor_contrato_item = :v WHERE id = :id')->execute(['v' => $cobertoNormal, 'id' => $ref['id']]);
        }
        recalcularTotalPrefeitura($pdo, (int) $osConv['id']);
    } elseif (planoCobreServico($convenio, 'TANATOPRAXIA', $pdo) || in_array('TANATOPRAXIA', aditivosDoContrato($osConv), true)) {
        $cobertoNormal = min($preco, buscarPrecoVenda($pdo, produtoTanatopraxiaNormal($pdo)));
        inserirItemCoberto($pdo, (int) $osConv['id'], $produtoId, $categoria, 1, $preco, $cobertoNormal);
        marcarComoCoberto($pdo, (int) $osConv['id']);
    }
    $dif = dinheiro($preco - $cobertoNormal);
    $item = null;
    if ($dif > 0) {
        $osDif = $osDif ?: obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR', $convenio, $criadoPor);
        $item = inserirItem($pdo, (int) $osDif['id'], $produtoId, $categoria, 1, $dif, false, 'DIFERENCA');
        recalcularValorTotal($pdo, (int) $osDif['id']);
    }
    $desc = nomeProduto($pdo, $produtoId) . ' — ' . ($cobertoNormal > 0
        ? 'tanatopraxia normal coberta (' . formatarReais($cobertoNormal) . '); família paga a diferença de ' . formatarReais($dif)
        : 'sem cobertura da tanatopraxia: cobrada inteira como diferença (' . formatarReais($preco) . ')');
    registrarEvento($pdo, (int) ($osDif['id'] ?? $osConv['id']), 'ITEM_INCLUIDO', $desc, $criadoPor, $dif);
    return ['os_convenio' => buscarOSPorId($pdo, (int) $osConv['id']), 'os_particular' => $osDif ? buscarOSPorId($pdo, (int) $osDif['id']) : null,
            'os' => buscarOSPorId($pdo, (int) ($osDif['id'] ?? $osConv['id'])), 'item' => $item, 'coberto' => $cobertoNormal > 0,
            'valor_coberto' => dinheiro($cobertoNormal), 'diferenca' => $dif];
}

/** Produto da tanatopraxia normal: o cadastrado como "Tanatopraxia" no estoque (os_config.php → tanatopraxia.produto_id fixa outro). */
function produtoTanatopraxiaNormal(PDO $pdo): int {
    $cfg = (array) osConfig('tanatopraxia', []);
    if (!empty($cfg['produto_id'])) {
        return (int) $cfg['produto_id'];
    }
    $st = $pdo->query("SELECT id FROM est_produto WHERE UPPER(TRIM(nome)) = 'TANATOPRAXIA' ORDER BY id LIMIT 2");
    $ids = $st->fetchAll(PDO::FETCH_COLUMN);
    if (count($ids) !== 1) {
        throw new RegraNegocioException(count($ids) ? 'Há mais de um produto chamado "Tanatopraxia" — defina tanatopraxia.produto_id no os_config.php.' : 'Produto "Tanatopraxia" não encontrado no estoque.', 422);
    }
    return (int) $ids[0];
}

/** Item que nunca tem cobertura (tanatopraxia avançada, embalsamamento) ou fora do pacote da Prefeitura: inteiro na Dif. */
function lancarDiretoNaDiferenca(PDO $pdo, int $atendimentoId, string $convenio, string $categoria, int $produtoId, int $quantidade, ?int $criadoPor, string $motivo): array {
    $osConv = obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO', $convenio, $criadoPor);
    $osDif = obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR', $convenio, $criadoPor);
    removerItensDaCategoria($pdo, (int) $osDif['id'], $categoria, ['DIFERENCA']);
    $preco = buscarPrecoVenda($pdo, $produtoId);
    $item = inserirItem($pdo, (int) $osDif['id'], $produtoId, $categoria, $quantidade, $preco, false, 'DIFERENCA');
    recalcularValorTotal($pdo, (int) $osDif['id']);
    registrarEvento($pdo, (int) $osDif['id'], 'ITEM_INCLUIDO', nomeProduto($pdo, $produtoId) . " ({$categoria}) — {$motivo}: " . formatarReais($preco * $quantidade), $criadoPor, $preco * $quantidade);
    return ['os_convenio' => buscarOSPorId($pdo, (int) $osConv['id']), 'os_particular' => buscarOSPorId($pdo, (int) $osDif['id']), 'os' => buscarOSPorId($pdo, (int) $osDif['id']), 'item' => $item, 'coberto' => false];
}

/**
 * Uso pelo FLUXO DO ATENDIMENTO (não é uma tela à parte): ao definir as etapas de um atendimento de Prefeitura, o app chama isto
 * (ou adicionar_item item a item) com as escolhas e as coberturas daquele atendimento. Lança o atendimento de Prefeitura de uma vez: todos os itens do pacote (o agente só escolhe os modelos, ex. urna e roupa),
 * tanatopraxia e translado autorizados (ou não) e itens extras. Devolve o faturado à Prefeitura e a diferença da família.
 */
function lancarAtendimentoPrefeitura(PDO $pdo, int $atendimentoId, string $convenio, array $escolhas, ?array $tanatopraxia, ?array $translado, ?int $usuarioId): array {
    $convenio = strtoupper(trim($convenio));
    dadosPrefeitura($convenio);
    $p = pacoteVigente($pdo, $convenio);
    if (!$p) {
        throw new RegraNegocioException('Pacote da Prefeitura não cadastrado — cadastre na rotina de convênios.', 422);
    }
    return emTransacao($pdo, function () use ($pdo, $atendimentoId, $convenio, $p, $escolhas, $tanatopraxia, $translado, $usuarioId) {
        $vistas = [];
        foreach ($p['itens'] as $it) {
            if (isset($vistas[$it['categoria']])) {
                continue;   // categoria com vários produtos aceitos: lança uma vez
            }
            $vistas[$it['categoria']] = true;
            $prod = (int) ($escolhas[$it['categoria']] ?? $it['produto_id']);
            adicionarItemComparandoPadrao($pdo, 'ATENDIMENTO', $atendimentoId, null, $convenio, $it['categoria'], $prod, 1, $usuarioId);
        }
        if ($tanatopraxia) {
            adicionarItemComparandoPadrao($pdo, 'ATENDIMENTO', $atendimentoId, null, $convenio, strtoupper($tanatopraxia['categoria'] ?? 'TANATOPRAXIA'), (int) $tanatopraxia['produto_id'], 1, $usuarioId, false, null, (bool) ($tanatopraxia['autorizado'] ?? false));
        }
        if ($translado) {
            adicionarTranslado($pdo, $atendimentoId, $convenio, (string) $translado['origem'], (string) $translado['destino'], (float) $translado['km'], $usuarioId, (bool) ($translado['autorizado'] ?? false));
        }
        $conv = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO');
        $dif = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR');
        return ['os_prefeitura' => $conv, 'os_diferenca' => $dif, 'faturar_prefeitura' => dinheiro((float) $conv['valor_total']),
                'diferenca_familia' => $dif ? dinheiro((float) $dif['valor_total']) : 0.0, 'pacote' => ['nome' => $p['nome'], 'valor' => $p['valor']]];
    });
}

const CHAVES_REGRA_ASSOCIADO = ['TETO_URNA', 'TRANSLADO_KM_COBERTO', 'TANATOPRAXIA_COBERTA'];
const CHAVES_REGRA_PREFEITURA = ['TANATOPRAXIA', 'TRANSLADO_KM'];

/**
 * Data de referência da OS que está sendo montada (16/10/2026): a data do falecimento (ou a data do atendimento).
 * Os valores do convênio valem pela vigência: a OS ABERTA usa o valor vigente nessa data, não o de hoje.
 * Fora da montagem/prévia fica null e as funções usam a data de hoje, como antes.
 */
function dataReferenciaOS(?string $definir = null, bool $limpar = false): ?string {
    static $data = null;
    if ($limpar) {
        $data = null;
    }
    if ($definir !== null) {
        $data = $definir;
    }
    return $data;
}

/** Data de referência de um atendimento (ou do rascunho da prévia): falecimento → data → hoje. */
function dataDoAtendimentoOS(array $at): string {
    foreach (['data_falecimento', 'data'] as $c) {
        $v = substr(trim((string) ($at[$c] ?? '')), 0, 10);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && $v !== '0000-00-00') {
            return $v;
        }
    }
    return date('Y-m-d');
}

/** Valor vigente de uma regra do convênio (rotina os_convenio_regras). ['existe' => bool, 'valor' => ?float (null = ilimitado)]. */
function regraConvenio(PDO $pdo, string $convenio, string $chave, ?string $data = null): array {
    $ref = $data ?? dataReferenciaOS();
    $st = $pdo->prepare('SELECT valor FROM os_convenio_regras WHERE convenio = :c AND chave = :k AND vigente_desde <= :d ORDER BY vigente_desde DESC, id DESC LIMIT 1');
    $st->execute(['c' => strtoupper($convenio), 'k' => $chave, 'd' => $ref ?? date('Y-m-d')]);
    $row = $st->fetch();
    if (!$row && $data === null && $ref !== null) {
        // Atendimento anterior à primeira vigência cadastrada: usa a primeira vigência (16/10/2026), para a OS não ficar sem preço.
        $st = $pdo->prepare('SELECT valor FROM os_convenio_regras WHERE convenio = :c AND chave = :k ORDER BY vigente_desde ASC, id ASC LIMIT 1');
        $st->execute(['c' => strtoupper($convenio), 'k' => $chave]);
        $row = $st->fetch();
    }
    return $row ? ['existe' => true, 'valor' => $row['valor'] === null ? null : (float) $row['valor']] : ['existe' => false, 'valor' => null];
}

/**
 * Pacote da OS da Prefeitura ABERTA alterado no cadastro de Convênios depois de aplicado (16/10/2026).
 * O pacote é editado no próprio registro (mesmo id), então a vigência é o vigente_desde dele:
 *  - vigente_desde <= data do atendimento: a OS recebe o valor novo do pacote e as categorias lançadas antes da
 *    alteração são relançadas (a diferença da família é refeita com os valores novos);
 *  - vigente_desde > data do atendimento: a OS fica com os valores que já tinha.
 * Alguma OS do atendimento confirmada/assinada/fechada: nada muda e volta o aviso (o Financeiro reabre).
 * Devolve ['relancar' => [categorias], 'aviso' => ?string].
 */
function atualizarPacoteDaOSPrefeitura(PDO $pdo, int $atendimentoId, string $convenio, ?int $usuarioId): array {
    $nada = ['relancar' => [], 'aviso' => null];
    $osConv = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO');
    if (!$osConv || $osConv['pacote_id'] === null || strtoupper((string) $osConv['convenio']) !== strtoupper($convenio)) {
        return $nada;
    }
    $st = $pdo->prepare('SELECT * FROM os_convenio_pacotes WHERE id = :id');
    $st->execute(['id' => (int) $osConv['pacote_id']]);
    $pac = $st->fetch();
    if (!$pac) {
        return $nada;
    }
    $ref = dataReferenciaOS() ?? date('Y-m-d');
    if ((string) ($pac['vigente_desde'] ?? '') > $ref) {
        return $nada;   // alteração vale só a partir de uma data posterior ao atendimento
    }
    $valorMudou = dinheiro((float) $pac['valor']) !== dinheiro((float) ($osConv['valor_pacote'] ?? 0));
    $relancar = [];
    $alteradoEm = (string) ($pac['atualizado_em'] ?? '');
    if ($alteradoEm !== '') {
        try {
            $it = $pdo->prepare('SELECT DISTINCT categoria FROM os_convenio_pacote_itens WHERE pacote_id = :p');
            $it->execute(['p' => (int) $pac['id']]);
            $cats = $it->fetchAll(PDO::FETCH_COLUMN);
        } catch (Throwable $e) {
            $cats = array_map(fn ($i) => (string) $i['categoria'], (array) (pacoteVigente($pdo, $convenio)['itens'] ?? []));
        }
        $q = $pdo->prepare("SELECT MAX(i.criado_em) FROM os_itens i JOIN os_ordens o ON o.id = i.os_id
                             WHERE o.tipo = 'ATENDIMENTO' AND o.atendimento_id = :a AND o.status <> 'CANCELADA' AND i.categoria = :c");
        foreach (array_unique($cats) as $cat) {
            $q->execute(['a' => $atendimentoId, 'c' => $cat]);
            $lancadoEm = (string) ($q->fetchColumn() ?: '');
            if ($lancadoEm !== '' && $lancadoEm < $alteradoEm) {
                $relancar[] = (string) $cat;
            }
        }
    }
    if (!$valorMudou && !$relancar) {
        return $nada;
    }
    $todas = $pdo->prepare("SELECT numero_os, status FROM os_ordens WHERE tipo = 'ATENDIMENTO' AND atendimento_id = :a AND status <> 'CANCELADA'");
    $todas->execute(['a' => $atendimentoId]);
    foreach ($todas->fetchAll() as $o) {
        if ($o['status'] !== 'ABERTA') {
            return ['relancar' => [], 'aviso' => "OS {$o['numero_os']} está {$o['status']}: os valores do pacote mudaram no convênio, mas a OS não foi recalculada — reabra a OS para aplicar."];
        }
    }
    $aviso = null;
    if ($valorMudou) {
        $pdo->prepare('UPDATE os_ordens SET valor_pacote = :v WHERE id = :id')->execute(['v' => $pac['valor'], 'id' => $osConv['id']]);
        registrarEvento($pdo, (int) $osConv['id'], 'VALOR_EDITADO', "Pacote \"{$pac['nome']}\" com valor novo do convênio: " . formatarReais((float) $osConv['valor_pacote'])
            . ' → ' . formatarReais((float) $pac['valor']) . " (vigente desde {$pac['vigente_desde']})", $usuarioId, (float) $pac['valor']);
        recalcularTotalPrefeitura($pdo, (int) $osConv['id']);
        $aviso = 'Pacote recalculado com o valor novo do convênio: ' . formatarReais((float) $pac['valor']) . '.';
    }
    return ['relancar' => $relancar, 'aviso' => $aviso];
}

/** Km de translado coberto pelo plano: null = ilimitado; 0 = não cobre. */
function kmTransladoCobertoPeloPlano(PDO $pdo, string $convenio): ?float {
    $r = regraConvenio($pdo, $convenio, 'TRANSLADO_KM_COBERTO');
    if ($r['existe']) {
        return $r['valor'];
    }
    $mapa = (array) osConfig('translado_km_por_plano', []);
    $plano = planoDoConvenio($convenio);
    return array_key_exists($plano, $mapa) ? ($mapa[$plano] === null ? null : (float) $mapa[$plano]) : 0.0;
}

/** Preço de contrato da Prefeitura (rotina; reserva: os_config.php → prefeituras → precos_contrato). */
function precoContratoPrefeitura(PDO $pdo, string $convenio, string $chave): ?float {
    $r = regraConvenio($pdo, $convenio, $chave);
    if ($r['existe'] && $r['valor'] !== null) {
        return (float) $r['valor'];
    }
    $p = dadosPrefeitura($convenio)['precos_contrato'][$chave] ?? null;
    return $p === null ? null : (float) $p;
}

/** Rotina: cadastra um novo valor de regra (histórico preservado). valor null = ilimitado (só TRANSLADO_KM_COBERTO). */
function definirRegraConvenio(PDO $pdo, string $convenio, string $chave, ?float $valor, ?string $vigenteDesde, ?string $obs, int $usuarioId): array {
    $convenio = strtoupper(trim($convenio));
    $chave = strtoupper(trim($chave));
    if (strpos($convenio, 'ASSOCIADO_') === 0) {
        $cad = convenioCadastrado($convenio);
        if (!$cad || $cad['tipo'] !== 'ASSOCIADO') {
            tetoUrnaDoPlano($convenio); // sem cadastro: só os planos do os_config.php
        }
        $validas = CHAVES_REGRA_ASSOCIADO;
    } elseif (strpos($convenio, 'PREFEITURA_') === 0) {
        dadosPrefeitura($convenio);
        $validas = CHAVES_REGRA_PREFEITURA;
    } else {
        throw new RegraNegocioException('Convênio inválido (use ASSOCIADO_<PLANO> ou PREFEITURA_<MUNICÍPIO>).');
    }
    if (!in_array($chave, $validas, true)) {
        throw new RegraNegocioException("Regra '{$chave}' não se aplica a {$convenio} — use " . implode(', ', $validas) . '.');
    }
    if ($valor === null && $chave !== 'TRANSLADO_KM_COBERTO') {
        throw new RegraNegocioException('Informe o valor (só o km de translado coberto aceita "ilimitado").');
    }
    if ($valor !== null && $valor < 0) {
        throw new RegraNegocioException('O valor não pode ser negativo.');
    }
    if ($chave === 'TANATOPRAXIA_COBERTA' && !in_array((int) $valor, [0, 1], true)) {
        throw new RegraNegocioException('TANATOPRAXIA_COBERTA é 1 (cobre) ou 0 (não cobre).');
    }
    $vig = validarData($vigenteDesde ?: date('Y-m-d'));
    $pdo->prepare('INSERT INTO os_convenio_regras (convenio, chave, valor, vigente_desde, observacao, criado_por) VALUES (:c, :k, :v, :d, :o, :u)')
        ->execute(['c' => $convenio, 'k' => $chave, 'v' => $valor, 'd' => $vig, 'o' => $obs !== null ? mb_substr(trim($obs), 0, 255) : null, 'u' => $usuarioId]);
    return listarRegrasConvenio($pdo, $convenio);
}

/** Valores vigentes (e o histórico) das regras de um convênio ou de todos. */
function listarRegrasConvenio(PDO $pdo, ?string $convenio = null): array {
    $sql = 'SELECT * FROM os_convenio_regras' . ($convenio ? ' WHERE convenio = :c' : '') . ' ORDER BY convenio, chave, vigente_desde DESC, id DESC';
    $st = $pdo->prepare($sql);
    $st->execute($convenio ? ['c' => strtoupper($convenio)] : []);
    $vigentes = [];
    $historico = [];
    foreach ($st->fetchAll() as $r) {
        $k = $r['convenio'] . '|' . $r['chave'];
        $r['valor'] = $r['valor'] === null ? null : (float) $r['valor'];
        $historico[] = $r;
        if (!isset($vigentes[$k]) && $r['vigente_desde'] <= date('Y-m-d')) {
            $vigentes[$k] = ['convenio' => $r['convenio'], 'chave' => $r['chave'], 'valor' => $r['valor'], 'vigente_desde' => $r['vigente_desde']];
        }
    }
    return ['vigentes' => array_values($vigentes), 'historico' => $historico];
}

/** Rotina: item do pacote padrão do convênio (produto e, na Prefeitura, valor de contrato). Substitui o da categoria. */
function definirPacotePadrao(PDO $pdo, string $convenio, string $categoria, int $produtoId, ?float $valorContrato): array {
    $convenio = strtoupper(trim($convenio));
    $categoria = strtoupper(trim($categoria));
    if (strpos($convenio, 'PREFEITURA_') === 0) {
        throw new RegraNegocioException('Prefeitura usa pacote com itens inclusos — use convenio_pacote_salvar.');
    } elseif (strpos($convenio, 'ASSOCIADO_') !== 0) {
        throw new RegraNegocioException('Convênio inválido (use ASSOCIADO_<PLANO> ou PREFEITURA_<MUNICÍPIO>).');
    }
    if ($categoria === '' || in_array($categoria, SERVICOS_CONDICIONAIS, true)) {
        throw new RegraNegocioException('Categoria inválida para o pacote (tanatopraxia e translado têm regra própria).');
    }
    buscarPrecoVenda($pdo, $produtoId); // produto existe e tem preço
    return emTransacao($pdo, function () use ($pdo, $convenio, $categoria, $produtoId, $valorContrato) {
        // um item por convênio/categoria (uk_convenio_categoria): atualiza no lugar; as OS já lançadas guardam o valor que usaram
        $pdo->prepare('INSERT INTO os_pacote_padrao (convenio, categoria, produto_id, valor_contrato, ativo) VALUES (:c, :k, :p, :v, 1)
                       ON DUPLICATE KEY UPDATE produto_id = VALUES(produto_id), valor_contrato = VALUES(valor_contrato), ativo = 1')
            ->execute(['c' => $convenio, 'k' => $categoria, 'p' => $produtoId, 'v' => $valorContrato]);
        return buscarPacotePadrao($pdo, $convenio, $categoria);
    });
}

function planoCobreServico(string $convenio, string $servico, ?PDO $pdo = null): bool {
    if ($pdo && $servico === 'TANATOPRAXIA') {
        $r = regraConvenio($pdo, $convenio, 'TANATOPRAXIA_COBERTA');
        if ($r['existe']) {
            return (int) $r['valor'] === 1;
        }
    }
    $mapa = (array) osConfig('servicos_cobertos_por_plano', ['TANATOPRAXIA' => [], 'TRANSLADO' => []]);
    return in_array(planoDoConvenio($convenio), array_map('strtoupper', (array) ($mapa[$servico] ?? [])), true);
}

/** Aditivos possíveis por plano (os_config.php → aditivos_por_plano). */
function aditivosPermitidosDoPlano(string $convenio): array {
    $cad = convenioCadastrado($convenio);
    if ($cad && $cad['tipo'] === 'ASSOCIADO') {
        return $cad['aditivos_permitidos'];
    }
    $mapa = (array) osConfig('aditivos_por_plano', ['LIGHT' => ['TRANSLADO', 'TANATOPRAXIA'], 'FLEX' => ['TRANSLADO', 'TANATOPRAXIA'], 'PLUS' => ['TRANSLADO'], 'MAX' => []]);
    return array_map('strtoupper', (array) ($mapa[planoDoConvenio($convenio)] ?? []));
}

function aditivosDoContrato(?array $osConv): array {
    return $osConv ? array_values(array_filter(array_map('trim', explode(',', strtoupper((string) $osConv['contrato_aditivos']))))) : [];
}

/** Translado acima do limite do plano: km cobertos na Soc e o excedente na Dif.Soc (mesmo trajeto nas duas). */
function lancarTransladoParcial(PDO $pdo, int $atendimentoId, string $convenio, array $osConv, ?array $osDif, int $produtoId, float $valorKm,
                                array $translado, float $kmCoberto, ?int $criadoPor): array {
    $km = (float) $translado[2];
    $kmExcedente = round($km - $kmCoberto, 1);
    $vCob = dinheiro($kmCoberto * $valorKm);
    $vExc = dinheiro($kmExcedente * $valorKm);
    $itemCob = inserirItemCoberto($pdo, (int) $osConv['id'], $produtoId, 'TRANSLADO', 1, $vCob, $vCob);
    marcarComoCoberto($pdo, (int) $osConv['id']);
    $osDif = $osDif ?: obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR', $convenio, $criadoPor);
    $itemExc = inserirItem($pdo, (int) $osDif['id'], $produtoId, 'TRANSLADO', 1, $vExc, false, 'DIFERENCA');
    recalcularValorTotal($pdo, (int) $osDif['id']);
    $up = $pdo->prepare('UPDATE os_itens SET translado_origem = :o, translado_destino = :d, translado_km = :k WHERE id = :id');
    $up->execute(['o' => $translado[0], 'd' => $translado[1], 'k' => $kmCoberto, 'id' => $itemCob['id']]);
    $up->execute(['o' => $translado[0], 'd' => $translado[1], 'k' => $kmExcedente, 'id' => $itemExc['id']]);
    $trecho = "Translado {$translado[0]} → {$translado[1]} (" . number_format($km, 1, ',', '.') . ' km)';
    registrarEvento($pdo, (int) $osConv['id'], 'ITEM_INCLUIDO', "{$trecho} — plano cobre " . number_format($kmCoberto, 1, ',', '.') . ' km: ' . formatarReais($vCob), $criadoPor);
    registrarEvento($pdo, (int) $osDif['id'], 'ITEM_INCLUIDO', "{$trecho} — excedente de " . number_format($kmExcedente, 1, ',', '.') . ' km acima do limite do plano: ' . formatarReais($vExc), $criadoPor, $vExc);
    return ['os_convenio' => buscarOSPorId($pdo, (int) $osConv['id']), 'os_particular' => buscarOSPorId($pdo, (int) $osDif['id']), 'os' => buscarOSPorId($pdo, (int) $osDif['id']),
            'item' => buscarItem($pdo, (int) $itemExc['id']), 'item_coberto' => buscarItem($pdo, (int) $itemCob['id']), 'coberto' => true,
            'km_coberto' => $kmCoberto, 'km_excedente' => $kmExcedente];
}

/**
 * Lança tanatopraxia ou translado num atendimento de convênio (regras acima). $translado = [origem, destino, km] ou null.
 * $valorTabelaUnit: preço de tabela (translado: km x valor do km da tabela). Lançar de novo substitui.
 */
function lancarServicoCondicional(PDO $pdo, int $atendimentoId, string $convenio, string $servico, int $produtoId, int $quantidade,
                                  float $valorTabelaUnit, ?int $criadoPor, ?bool $autorizadoPrefeitura, ?array $translado): array {
    $ehPref = strpos($convenio, 'PREFEITURA') === 0;
    $osConv = obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO', $convenio, $criadoPor);
    if ($ehPref && pacoteVigente($pdo, $convenio)) {
        $osConv = aplicarPacoteNaOS($pdo, $osConv);
    }
    $osDif = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR');
    if ($osDif) {
        exigirOSAberta($osDif);
        removerItensDaCategoria($pdo, (int) $osDif['id'], $servico, ['DIFERENCA', 'DIRETO', 'ADICIONAL']);
    }
    removerItensDaCategoria($pdo, (int) $osConv['id'], $servico, ['PADRAO', 'REFERENCIA']);
    if ($servico === 'TANATOPRAXIA') {   // preparo do corpo é um só: a normal substitui avançada/embalsamamento lançados antes
        foreach (SERVICOS_SEMPRE_DIFERENCA as $cat) {
            removerItensDaCategoria($pdo, (int) $osConv['id'], $cat, ['PADRAO', 'REFERENCIA']);
            if ($osDif) {
                removerItensDaCategoria($pdo, (int) $osDif['id'], $cat, ['DIFERENCA']);
                recalcularValorTotal($pdo, (int) $osDif['id']);
            }
        }
    }
    if ($ehPref) {
        recalcularTotalPrefeitura($pdo, (int) $osConv['id']);
    }
    $nome = $servico === 'TRANSLADO' ? 'Translado ' . $translado[0] . ' → ' . $translado[1] . ' (' . number_format($translado[2], 1, ',', '.') . ' km)' : nomeProduto($pdo, $produtoId);

    if ($ehPref) {
        $pref = dadosPrefeitura($convenio);
        if ($autorizadoPrefeitura === null) {
            throw new RegraNegocioException("Informe se a Prefeitura de {$pref['nome']} autorizou " . ($servico === 'TRANSLADO' ? 'o translado' : 'a tanatopraxia') . ' (autorizado_prefeitura = 1 ou 0).');
        }
        $coberto = $autorizadoPrefeitura;
    } else {
        $porAditivo = in_array($servico, aditivosDoContrato($osConv), true);
        if ($servico === 'TRANSLADO' && !$porAditivo) {
            // Plano cobre o translado até o limite de km (LIGHT 200, FLEX 500, PLUS 1000, MAX ilimitado); o excedente vai para a Dif.Soc.
            $limite = kmTransladoCobertoPeloPlano($pdo, $convenio);
            $km = (float) $translado[2];
            $kmCoberto = $limite === null ? $km : min($km, max(0.0, $limite));
            if ($kmCoberto > 0 && $kmCoberto < $km) {
                return lancarTransladoParcial($pdo, $atendimentoId, $convenio, $osConv, $osDif, $produtoId, $valorTabelaUnit / $km, $translado, $kmCoberto, $criadoPor);
            }
            $coberto = $kmCoberto > 0;
        } else {
            $coberto = $porAditivo || planoCobreServico($convenio, $servico, $pdo);
        }
    }

    $item = null;
    if ($coberto && $ehPref) {
        $chave = $servico === 'TRANSLADO' ? 'TRANSLADO_KM' : $servico;
        $precoContrato = precoContratoPrefeitura($pdo, $convenio, $chave);
        if ($precoContrato === null || $precoContrato <= 0) {
            throw new RegraNegocioException("Preço de contrato de {$chave} não configurado para a Prefeitura de {$pref['nome']} — cadastre na rotina de valores dos convênios.", 422);
        }
        $valorContrato = dinheiro((float) $precoContrato * ($servico === 'TRANSLADO' ? (float) $translado[2] : $quantidade));
        $item = inserirItem($pdo, (int) $osConv['id'], $produtoId, $servico, $quantidade, $valorTabelaUnit, true, 'REFERENCIA');
        $pdo->prepare('UPDATE os_itens SET valor_contrato_item = :v WHERE id = :id')->execute(['v' => $valorContrato, 'id' => $item['id']]);
        recalcularTotalPrefeitura($pdo, (int) $osConv['id']);
        registrarEvento($pdo, (int) $osConv['id'], 'ITEM_INCLUIDO', "{$nome} — autorizado pela Prefeitura (contrato: " . formatarReais($valorContrato) . ')', $criadoPor, $valorContrato);
        $destino = $osConv;
    } elseif ($coberto) {
        $item = inserirItemCoberto($pdo, (int) $osConv['id'], $produtoId, $servico, $quantidade, $valorTabelaUnit, $valorTabelaUnit);
        marcarComoCoberto($pdo, (int) $osConv['id']);
        registrarEvento($pdo, (int) $osConv['id'], 'ITEM_INCLUIDO', "{$nome} — coberto " . (in_array($servico, aditivosDoContrato($osConv), true) ? 'pelo aditivo do contrato' : 'pelo plano') . ': ' . formatarReais($valorTabelaUnit * $quantidade), $criadoPor);
        $destino = $osConv;
    } else {
        $osDif = $osDif ?: obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR', $convenio, $criadoPor);
        $item = inserirItem($pdo, (int) $osDif['id'], $produtoId, $servico, $quantidade, $valorTabelaUnit, false, 'DIFERENCA');
        recalcularValorTotal($pdo, (int) $osDif['id']);
        registrarEvento($pdo, (int) $osDif['id'], 'ITEM_INCLUIDO', "{$nome} — " . ($ehPref ? 'não autorizado pela Prefeitura' : 'sem cobertura do plano/aditivo') . ', cobrado como diferença: ' . formatarReais($valorTabelaUnit * $quantidade), $criadoPor);
        $destino = $osDif;
    }
    if ($translado) {
        $pdo->prepare('UPDATE os_itens SET translado_origem = :o, translado_destino = :d, translado_km = :k WHERE id = :id')
            ->execute(['o' => $translado[0], 'd' => $translado[1], 'k' => $translado[2], 'id' => $item['id']]);
    }
    return ['os_convenio' => buscarOSPorId($pdo, (int) $osConv['id']), 'os_particular' => $osDif ? buscarOSPorId($pdo, (int) $osDif['id']) : null,
            'os' => buscarOSPorId($pdo, (int) $destino['id']), 'item' => buscarItem($pdo, (int) $item['id']), 'coberto' => $coberto];
}

/** Teto de cobertura da URNA por plano (os_config.php → teto_urna_por_plano). Convênio ASSOCIADO_FLEX -> plano FLEX. */
function planoDoConvenio(string $convenio): string {
    return strtoupper(substr(trim($convenio), strlen('ASSOCIADO_')));
}
function tetoUrnaDoPlano(string $convenio, ?PDO $pdo = null): float {
    if ($pdo) {
        $r = regraConvenio($pdo, $convenio, 'TETO_URNA');
        if ($r['existe'] && $r['valor'] !== null) {
            return dinheiro($r['valor']);
        }
    }
    $tetos = (array) osConfig('teto_urna_por_plano', ['LIGHT' => 3000, 'FLEX' => 3000, 'PLUS' => 6000, 'MAX' => 6000]);
    $plano = planoDoConvenio($convenio);
    $cad = convenioCadastrado($convenio);
    if ($cad && $cad['tipo'] === 'ASSOCIADO' && !isset($tetos[$plano])) {
        throw new RegraNegocioException("Plano {$cad['nome']} sem teto de urna — cadastre na rotina de convênios.", 422);
    }
    if (!isset($tetos[$plano])) {
        throw new RegraNegocioException("Plano '{$plano}' sem teto de urna configurado (os_config.php → teto_urna_por_plano).", 422);
    }
    return dinheiro((float) $tetos[$plano]);
}

/** Reserva $quantos números seguidos da sequência única e devolve o primeiro. Atômico (LAST_INSERT_ID) — dentro da transação. */
function reservarNumeros(PDO $pdo, int $quantos = 1): int {
    $pdo->exec("INSERT IGNORE INTO os_sequencia (sufixo, ultimo) VALUES ('GERAL', 0)");
    $pdo->prepare("UPDATE os_sequencia SET ultimo = LAST_INSERT_ID(ultimo + :k) WHERE sufixo = 'GERAL'")->execute(['k' => $quantos]);
    return (int) $pdo->query('SELECT LAST_INSERT_ID()')->fetchColumn() - $quantos + 1;
}

function formatarNumeroOS(int $n, string $sufixo): string {
    return sprintf('%04d-%s', $n, $sufixo);
}

/** Compatibilidade: próximo número único já com o sufixo do tipo. */
function proximoNumeroOS(PDO $pdo, string $tipo, string $natureza, ?string $convenio = null): string {
    return formatarNumeroOS(reservarNumeros($pdo, 1), sufixoNumeroOS($tipo, $natureza, $convenio));
}

function buscarOSPorId(PDO $pdo, int $osId, bool $paraAtualizar = false): array {
    $stmt = $pdo->prepare('SELECT * FROM os_ordens WHERE id = :id' . ($paraAtualizar ? ' FOR UPDATE' : ''));
    $stmt->execute(['id' => $osId]);
    $row = $stmt->fetch();
    if (!$row) {
        throw new RegraNegocioException("OS {$osId} não encontrada.", 404);
    }
    return $row;
}

/** Última OS não cancelada do atendimento/pedido para a natureza pedida (ou null). Com lock. */
function localizarOS(PDO $pdo, string $tipo, ?int $atendimentoId, ?int $coroaPedidoId, string $natureza): ?array {
    if ($tipo === 'COROA') {
        if (!$coroaPedidoId) {
            throw new RegraNegocioException('coroa_pedido_id é obrigatório para tipo COROA.');
        }
        $filtro = 'coroa_pedido_id = :ref';
        $ref = $coroaPedidoId;
    } elseif ($tipo === 'ATENDIMENTO') {
        if (!$atendimentoId) {
            throw new RegraNegocioException('atendimento_id é obrigatório para tipo ATENDIMENTO.');
        }
        $filtro = 'atendimento_id = :ref';
        $ref = $atendimentoId;
    } else {
        throw new RegraNegocioException("tipo inválido: {$tipo} (use ATENDIMENTO ou COROA).");
    }
    // Associado com apoio da Prefeitura (09/10/2026): o atendimento pode ter a Soc e a Prf (as duas de natureza CONVENIO).
    // A OS "do convênio" do atendimento é sempre a do plano; a Prf do apoio é achada por localizarOSApoioPrefeitura().
    $stmt = $pdo->prepare(
        "SELECT * FROM os_ordens WHERE tipo = :tipo AND natureza = :natureza AND {$filtro} AND status <> 'CANCELADA'
         ORDER BY (convenio LIKE 'PREFEITURA%') ASC, id DESC LIMIT 1 FOR UPDATE"
    );
    $stmt->execute(['tipo' => $tipo, 'natureza' => $natureza, 'ref' => $ref]);
    return $stmt->fetch() ?: null;
}

/**
 * OS da Prefeitura que paga a diferença de um atendimento de ASSOCIADO (09/10/2026): tanatopraxia e/ou translado que o plano
 * não cobre. Fica ao lado da Soc e da Dif.Soc (3 OS no atendimento). Só existe em atendimento de associado.
 */
function localizarOSApoioPrefeitura(PDO $pdo, int $atendimentoId): ?array {
    $st = $pdo->prepare("SELECT * FROM os_ordens WHERE tipo = 'ATENDIMENTO' AND atendimento_id = :a AND natureza = 'CONVENIO'
                         AND convenio LIKE 'PREFEITURA%' AND status <> 'CANCELADA' ORDER BY id DESC LIMIT 1 FOR UPDATE");
    $st->execute(['a' => $atendimentoId]);
    return $st->fetch() ?: null;
}

function exigirOSAberta(array $os): void {
    if ($os['status'] !== 'ABERTA') {
        throw new RegraNegocioException("OS {$os['numero_os']} está {$os['status']} — reabra a OS antes de alterar itens.", 409);
    }
}

/**
 * OS ABERTA do tipo/natureza; cria se não existir (se existir em outro status, recusa).
 * Numeração (06/10/2026): cada OS pega o seu número só quando é criada. A OS de convênio NÃO reserva mais o número da futura
 * diferença: a Dif só ganha número se houver diferença de verdade (pode não ficar colada na Prf). OS antigas que já têm
 * seq_dif_reservada continuam usando o número reservado.
 */
function obterOuCriarOS(PDO $pdo, string $tipo, ?int $atendimentoId, ?int $coroaPedidoId, string $natureza, ?string $convenio, ?int $criadoPor): array {
    $existente = localizarOS($pdo, $tipo, $atendimentoId, $coroaPedidoId, $natureza);
    if ($existente) {
        exigirOSAberta($existente);
        return $existente;
    }
    exigirConvenioAtivo($convenio);
    $sufixo = sufixoNumeroOS($tipo, $natureza, $convenio);
    $reservaDif = null;
    if ($natureza === 'CONVENIO') {
        $n = reservarNumeros($pdo, 1);
    } elseif (strpos($sufixo, 'Dif.') === 0) {
        $conv = localizarOS($pdo, $tipo, $atendimentoId, $coroaPedidoId, 'CONVENIO');
        $n = ($conv && $conv['seq_dif_reservada']) ? (int) $conv['seq_dif_reservada'] : reservarNumeros($pdo, 1);
    } else {
        $n = reservarNumeros($pdo, 1);
    }
    $pdo->prepare(
        'INSERT INTO os_ordens (numero_os, numero_seq, seq_dif_reservada, tipo, atendimento_id, coroa_pedido_id, natureza, convenio, status, criado_por)
         VALUES (:numero, :seq, :res, :tipo, :atendimento, :coroa, :natureza, :convenio, \'ABERTA\', :criadoPor)'
    )->execute([
        'numero' => formatarNumeroOS($n, $sufixo), 'seq' => $n, 'res' => $reservaDif, 'tipo' => $tipo, 'atendimento' => $atendimentoId,
        'coroa' => $coroaPedidoId, 'natureza' => $natureza, 'convenio' => $convenio, 'criadoPor' => $criadoPor,
    ]);
    $os = buscarOSPorId($pdo, (int) $pdo->lastInsertId());
    registrarEvento($pdo, (int) $os['id'], 'OS_CRIADA', "OS {$os['numero_os']} aberta (" . rotuloTipoOS($os) . ')', $criadoPor);
    return $os;
}

/**
 * OS de diferença sem nada a cobrar (06/10/2026): a Dif ABERTA cujos itens somam zero (ou que ficou sem itens) é apagada,
 * para não ocupar número nem aparecer zerada no Financeiro. Não mexe em Dif confirmada/assinada, com proposta no financeiro
 * ou com nota promissória. Se o número dela foi o último usado, o contador volta um (o próximo número sai sem buraco).
 * Devolve o aviso para a lista de alterações, ou null se nada foi apagado.
 */
function descartarDiferencaVazia(PDO $pdo, string $tipo, ?int $atendimentoId, ?int $coroaPedidoId): ?string {
    $dif = localizarOS($pdo, $tipo, $atendimentoId, $coroaPedidoId, 'PARTICULAR');
    if (!$dif || $dif['status'] !== 'ABERTA' || !empty($dif['confirmada_em']) || strpos(strtoupper((string) $dif['convenio']), 'PARTICULAR') === 0) {
        return null;   // só a OS de diferença (Dif.Prf / Dif.Soc), ainda em rascunho
    }
    $osId = (int) $dif['id'];
    $soma = $pdo->prepare('SELECT COALESCE(SUM(valor_unitario_aplicado * quantidade), 0) FROM os_itens WHERE os_id = :id AND referencia_apenas = 0');
    $soma->execute(['id' => $osId]);
    if ((float) $soma->fetchColumn() > 0.004) {
        return null;
    }
    foreach (['SELECT COUNT(*) FROM os_financeiro WHERE os_id = :id', 'SELECT COUNT(*) FROM os_np WHERE os_id = :id'] as $sql) {
        $q = $pdo->prepare($sql);
        $q->execute(['id' => $osId]);
        if ((int) $q->fetchColumn() > 0) {
            return null;
        }
    }
    foreach (['os_precos_log', 'os_documentos_log'] as $tabela) {   // logs sem chave estrangeira
        $pdo->prepare("DELETE FROM {$tabela} WHERE os_id = :id")->execute(['id' => $osId]);
    }
    $pdo->prepare('DELETE FROM os_itens WHERE os_id = :id')->execute(['id' => $osId]);
    $pdo->prepare('DELETE FROM os_eventos WHERE os_id = :id')->execute(['id' => $osId]);
    $pdo->prepare('DELETE FROM os_ordens WHERE id = :id')->execute(['id' => $osId]);
    // Contador: se esta Dif tinha o último número, devolve o número (e solta a reserva antiga da OS do convênio, se for o mesmo).
    $seq = (int) $dif['numero_seq'];
    $ult = $pdo->query("SELECT ultimo FROM os_sequencia WHERE sufixo = 'GERAL' FOR UPDATE")->fetchColumn();
    if ($seq > 0 && (int) $ult === $seq) {
        $pdo->prepare("UPDATE os_sequencia SET ultimo = ultimo - 1 WHERE sufixo = 'GERAL' AND ultimo = :s")->execute(['s' => $seq]);
        $pdo->prepare('UPDATE os_ordens SET seq_dif_reservada = NULL WHERE seq_dif_reservada = :s')->execute(['s' => $seq]);
    }
    return "OS {$dif['numero_os']} descartada: sem diferença a cobrar da família.";
}

/** Rótulo do tipo da OS (para telas, relatórios e linha do tempo). */
function rotuloTipoOS(array $os): string {
    $sufixo = substr((string) $os['numero_os'], strpos((string) $os['numero_os'], '-') + 1);
    $c = strtoupper((string) $os['convenio']);
    if ($os['tipo'] === 'COROA' && strpos($c, 'PREFEITURA') !== 0) {
        return 'Coroa';
    }
    if (strpos($c, 'PREFEITURA') === 0) {
        $p = dadosPrefeitura($c);
        return ($os['natureza'] === 'PARTICULAR' ? 'Diferença — Prefeitura de ' : 'Prefeitura de ') . $p['nome'] . ($os['tipo'] === 'COROA' ? ' (coroa)' : '');
    }
    if (strpos($c, 'ASSOCIADO') === 0) {
        return ($os['natureza'] === 'PARTICULAR' ? 'Diferença — Associado (plano ' : 'Associado (plano ') . planoDoConvenio($c) . ')';
    }
    return 'Particular';
}

/** Grupo do tipo para filtros: PRT, SOC, PRF, DIF_SOC, DIF_PRF, COR. */
function grupoTipoOS(array $os): string {
    $c = strtoupper((string) $os['convenio']);
    if ($os['tipo'] === 'COROA' && strpos($c, 'PREFEITURA') !== 0) {
        return 'COR';
    }
    if (strpos($c, 'PREFEITURA') === 0) {
        return $os['natureza'] === 'PARTICULAR' ? 'DIF_PRF' : 'PRF';
    }
    if (strpos($c, 'ASSOCIADO') === 0) {
        return $os['natureza'] === 'PARTICULAR' ? 'DIF_SOC' : 'SOC';
    }
    return 'PRT';
}

/* ---------- linha do tempo, nomes e acesso por agente ---------- */

function registrarEvento(PDO $pdo, int $osId, string $tipo, string $descricao, ?int $usuarioId = null, ?float $valor = null): void {
    $pdo->prepare('INSERT INTO os_eventos (os_id, tipo, descricao, valor, usuario_id) VALUES (:os, :t, :d, :v, :u)')
        ->execute(['os' => $osId, 't' => $tipo, 'd' => mb_substr($descricao, 0, 400), 'v' => $valor, 'u' => $usuarioId]);
}

function nomeProduto(PDO $pdo, int $produtoId): string {
    $stmt = $pdo->prepare('SELECT nome FROM est_produto WHERE id = :id');
    $stmt->execute(['id' => $produtoId]);
    return (string) ($stmt->fetchColumn() ?: "produto #{$produtoId}");
}

/** Nome do usuário (os_config.php → fonte_usuarios). Sem tabela, devolve "usuário #id". */
function nomeUsuario(PDO $pdo, ?int $usuarioId): ?string {
    if (!$usuarioId) {
        return null;
    }
    static $cache = [];
    if (isset($cache[$usuarioId])) {
        return $cache[$usuarioId];
    }
    $f = (array) osConfig('fonte_usuarios', ['tabela' => 'usuarios', 'coluna_id' => 'id', 'coluna_nome' => 'nome']);
    $nome = null;
    if (preg_match('/^[A-Za-z0-9_]+$/', (string) ($f['tabela'] ?? '')) && preg_match('/^[A-Za-z0-9_]+$/', (string) ($f['coluna_id'] ?? '')) && preg_match('/^[A-Za-z0-9_]+$/', (string) ($f['coluna_nome'] ?? ''))) {
        try {
            $stmt = $pdo->prepare("SELECT `{$f['coluna_nome']}` FROM `{$f['tabela']}` WHERE `{$f['coluna_id']}` = :id");
            $stmt->execute(['id' => $usuarioId]);
            $nome = $stmt->fetchColumn() ?: null;
        } catch (Throwable $e) {
            $nome = null;
        }
    }
    return $cache[$usuarioId] = $nome ?: "usuário #{$usuarioId}";
}

/** Financeiro e admin veem todas as OS nas listas (painel do financeiro); em Minhas OS o agente vê as que ele abriu (os_config.php → cargos_ver_todas_os). */
function podeVerTodasOS(array $usuario): bool {
    if (array_key_exists('paginas', $usuario)) {
        return temPagina($usuario, 'financeiro');
    }
    return cargoEhAdmin($usuario['cargo']) || in_array($usuario['cargo'], (array) osConfig('cargos_ver_todas_os', ['adm', 'financeiro']), true);
}
/*
 * Acesso às OS (decisão do usuário em 07/10/2026, regime de plantão): NÃO há mais trava por "quem abriu a OS".
 * Uma equipe começa o atendimento e outra termina; qualquer usuário com a página do Atendimento acessa as OS.
 * O que continua valendo:
 *  - permissão de página (feita no os_principal.php: atendimento / financeiro / convênios);
 *  - as regras do registro do atendimento, que são do informativo.php (trava dos itens no Corpo Pronto, Gestão altera);
 *  - as regras de negócio da OS deste arquivo (OS fechada não muda — exigirOSAberta —, limite de desconto, valores da Prefeitura só no financeiro).
 * As três funções abaixo ficam com o mesmo nome para o os_principal.php não precisar mudar a cada chamada.
 */
function exigirAcessoOS(PDO $pdo, array $usuario, int $osId): array {
    return buscarOSPorId($pdo, $osId);   // só confere se a OS existe
}
function exigirAcessoItem(PDO $pdo, array $usuario, int $itemId): void {
    // sem trava por dono da OS (plantão)
}
function exigirAcessoReferencia(PDO $pdo, array $usuario, string $tipo, ?int $atendimentoId, ?int $coroaPedidoId): void {
    // sem trava por dono da OS (plantão)
}

/* =====================================================================
 * ITENS, PADRÃO DO CONVÊNIO E DESCONTOS
 * ===================================================================== */

function inserirItem(PDO $pdo, int $osId, int $produtoId, string $categoria, int $quantidade, float $valorUnitario, bool $referenciaApenas, string $tipoItem, ?string $frase = null): array {
    $valorFinal = $referenciaApenas ? 0.0 : dinheiro($valorUnitario * $quantidade);
    $pdo->prepare(
        'INSERT INTO os_itens (os_id, produto_id, categoria, tipo_item, quantidade, frase_faixa, valor_unitario_travado, valor_unitario_aplicado, valor_final, referencia_apenas)
         VALUES (:os, :produto, :categoria, :tipo, :qtd, :frase, :valor, :aplicado, :final, :ref)'
    )->execute([
        'os' => $osId, 'produto' => $produtoId, 'categoria' => $categoria, 'tipo' => $tipoItem,
        'qtd' => $quantidade, 'frase' => $frase, 'valor' => $valorUnitario, 'aplicado' => $valorUnitario, 'final' => $valorFinal, 'ref' => $referenciaApenas ? 1 : 0,
    ]);
    return buscarItem($pdo, (int) $pdo->lastInsertId());
}

function buscarItem(PDO $pdo, int $itemId): array {
    $stmt = $pdo->prepare('SELECT * FROM os_itens WHERE id = :id');
    $stmt->execute(['id' => $itemId]);
    $row = $stmt->fetch();
    if (!$row) {
        throw new RegraNegocioException("Item {$itemId} não encontrado.", 404);
    }
    return $row;
}

/** Mesmo produto/categoria/tipo na mesma OS: soma a quantidade mantendo o preço já travado; senão insere. */
function upsertItemPorProduto(PDO $pdo, int $osId, int $produtoId, string $categoria, int $quantidade, float $valorUnitario, string $tipoItem): array {
    $stmt = $pdo->prepare(
        'SELECT * FROM os_itens WHERE os_id = :os AND produto_id = :p AND categoria = :c AND tipo_item = :t AND referencia_apenas = 0 LIMIT 1 FOR UPDATE'
    );
    $stmt->execute(['os' => $osId, 'p' => $produtoId, 'c' => $categoria, 't' => $tipoItem]);
    $existente = $stmt->fetch();
    if (!$existente) {
        return inserirItem($pdo, $osId, $produtoId, $categoria, $quantidade, $valorUnitario, false, $tipoItem);
    }
    $novaQtd = (int) $existente['quantidade'] + $quantidade;
    $final = max(0.0, dinheiro((float) $existente['valor_unitario_aplicado'] * $novaQtd - (float) ($existente['desconto_valor'] ?? 0)));
    $pdo->prepare('UPDATE os_itens SET quantidade = :q, valor_final = :f WHERE id = :id')
        ->execute(['q' => $novaQtd, 'f' => $final, 'id' => $existente['id']]);
    return buscarItem($pdo, (int) $existente['id']);
}

function removerItensDaCategoria(PDO $pdo, int $osId, string $categoria, array $tipos): void {
    $marcas = implode(',', array_fill(0, count($tipos), '?'));
    $pdo->prepare("DELETE FROM os_itens WHERE os_id = ? AND categoria = ? AND tipo_item IN ({$marcas})")
        ->execute(array_merge([$osId, $categoria], $tipos));
}

function marcarComoCoberto(PDO $pdo, int $osConvenioId): void {
    $pdo->prepare("UPDATE os_ordens SET status_pagamento = 'PAGO', valor_total = 0 WHERE id = :id AND natureza = 'CONVENIO' AND convenio LIKE 'ASSOCIADO%'")
        ->execute(['id' => $osConvenioId]);
}

/** Item da OS do plano: produto ESCOLHIDO, preço de tabela guardado e a parte coberta como valor (a folha mostra valor, cobertura e total zero). */
function inserirItemCoberto(PDO $pdo, int $osId, int $produtoId, string $categoria, int $quantidade, float $precoTabela, float $coberto): array {
    $item = inserirItem($pdo, $osId, $produtoId, $categoria, $quantidade, $coberto, false, 'PADRAO');
    $pdo->prepare('UPDATE os_itens SET valor_unitario_travado = :t WHERE id = :id')->execute(['t' => $precoTabela, 'id' => $item['id']]);
    return buscarItem($pdo, (int) $item['id']);
}

/** Prefeitura: total da OS = soma do valor de contrato das categorias lançadas. */
function recalcularTotalPrefeitura(PDO $pdo, int $osId): void {
    $pdo->prepare('UPDATE os_ordens SET valor_total = COALESCE(valor_pacote, 0) + (SELECT COALESCE(SUM(valor_contrato_item), 0) FROM os_itens WHERE os_id = :a) WHERE id = :b')
        ->execute(['a' => $osId, 'b' => $osId]);
}

function limparConfirmacao(PDO $pdo, int $osId): void {
    $pdo->prepare('UPDATE os_ordens SET confirmada_em = NULL, confirmada_por = NULL, confirmada_valor_total = NULL WHERE id = :id')->execute(['id' => $osId]);
}

/** OS de CONVÊNIO não soma itens (Associado = 0; Prefeitura = valor do contrato) — só a OS Particular é recalculada. */
function recalcularValorTotal(PDO $pdo, int $osId): void {
    limparConfirmacao($pdo, $osId); // toda mudança de item/valor/desconto exige nova confirmação
    $os = buscarOSPorId($pdo, $osId);
    if ($os['natureza'] !== 'PARTICULAR') {
        return;
    }
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(valor_final), 0) AS total FROM os_itens WHERE os_id = :id AND referencia_apenas = 0');
    $stmt->execute(['id' => $osId]);
    $global = osTemDescontoNovo($pdo) ? resumoDescontoOS($pdo, $osId)['desconto_global'] : 0.0;   // desconto geral, depois dos itens
    $total = max(0.0, dinheiro((float) $stmt->fetch()['total'] - $global - (float) $os['abatimento_convenio']));
    $pdo->prepare('UPDATE os_ordens SET valor_total = :t WHERE id = :id')->execute(['t' => $total, 'id' => $osId]);
    sincronizarValorAlvoComTotal($pdo, $osId, $total);
}

/**
 * 11/11/2026: a proposta financeira em aberto acompanha o total da OS.
 * Antes, o valor_alvo ficava parado no total do dia em que a proposta foi criada: na OS 0195-Prt a urna foi
 * trocada depois (total de R$ 3.822,00 para R$ 5.822,00) e o Saldo continuou R$ 3.822,00, porque a nova
 * conclusão reaproveitou a proposta antiga. Não mexe na proposta FATURADA/CANCELADA nem na que foi aberta
 * de propósito com valor diferente do total (essa tem justificativa em observacao).
 */
function sincronizarValorAlvoComTotal(PDO $pdo, int $osId, float $total): void {
    if ($total <= 0) {
        return;
    }
    $pdo->prepare("UPDATE os_financeiro SET valor_alvo = :t
                    WHERE os_id = :id AND status NOT IN ('FATURADO','CANCELADO')
                      AND (observacao IS NULL OR TRIM(observacao) = '')
                      AND ABS(valor_alvo - :t2) > 0.009")
        ->execute(['t' => dinheiro($total), 't2' => dinheiro($total), 'id' => $osId]);
}

/**
 * Lança um item no atendimento/pedido comparando com o pacote padrão do convênio (16.2/16.3).
 *  - $adicional = true: item extra (ex.: cadeiras extras do velório) — vai SEMPRE para a OS Particular, cobrado inteiro,
 *    sem comparar com o padrão da categoria.
 *  - Particular: sem padrão; tudo vai para a OS Particular (mesmo produto = soma quantidade).
 *  - Prefeitura: item entra só como referência; total = valor do contrato. Reescolher a categoria substitui.
 *  - Associado: escolher de novo a categoria SUBSTITUI a escolha anterior (padrão e diferença); igual/mais barato que o
 *    padrão = coberto; mais caro = padrão na OS do convênio + DIFERENÇA na OS Particular.
 */
function adicionarItemComparandoPadrao(
    PDO $pdo, string $tipo, ?int $atendimentoId, ?int $coroaPedidoId, string $convenio, string $categoria,
    int $produtoEscolhidoId, int $quantidade, ?int $criadoPor, bool $adicional = false, ?string $frase = null, ?bool $autorizadoPrefeitura = null
): array {
    if ($quantidade < 1 || $quantidade > 999) {
        throw new RegraNegocioException('quantidade deve ser entre 1 e 999.');
    }

    return emTransacao($pdo, function () use ($pdo, $tipo, $atendimentoId, $coroaPedidoId, $convenio, $categoria, $produtoEscolhidoId, $quantidade, $criadoPor, $adicional, $frase, $autorizadoPrefeitura) {
        if ($adicional || strpos($convenio, 'PARTICULAR') === 0) {
            $osPart = obterOuCriarOS($pdo, $tipo, $atendimentoId, $coroaPedidoId, 'PARTICULAR', $convenio, $criadoPor);
            $preco = buscarPrecoVenda($pdo, $produtoEscolhidoId);
            if ($tipo === 'COROA') {
                // OS de coroa: cada coroa é uma linha própria (quantidade 1) com a SUA frase de faixa — nunca se somam.
                if ($quantidade !== 1) {
                    throw new RegraNegocioException('Em OS de coroa cada coroa é lançada separadamente (quantidade 1), com a sua própria frase de faixa.', 422);
                }
                $frase = $frase !== null ? trim($frase) : null;
                if ($frase !== null && mb_strlen($frase) > 200) {
                    throw new RegraNegocioException('A frase da faixa deve ter no máximo 200 caracteres.');
                }
                $item = inserirItem($pdo, (int) $osPart['id'], $produtoEscolhidoId, $categoria, 1, $preco, false, $adicional ? 'ADICIONAL' : 'DIRETO', $frase !== '' ? $frase : null);
            } else {
                $item = upsertItemPorProduto($pdo, (int) $osPart['id'], $produtoEscolhidoId, $categoria, $quantidade, $preco, $adicional ? 'ADICIONAL' : 'DIRETO');
            }
            recalcularValorTotal($pdo, (int) $osPart['id']);
            registrarEvento($pdo, (int) $osPart['id'], 'ITEM_INCLUIDO', nomeProduto($pdo, $produtoEscolhidoId) . " ({$categoria})" . ($frase ? " — faixa “{$frase}”" : '') . ' — ' . formatarReais($preco), $criadoPor);
            return ['os_convenio' => null, 'os_particular' => buscarOSPorId($pdo, (int) $osPart['id']), 'item' => $item];
        }

        $ehPrefeitura = strpos($convenio, 'PREFEITURA') === 0;
        if ($ehPrefeitura) {
            dadosPrefeitura($convenio); // recusa município não cadastrado antes de qualquer outra checagem
        }
        if (in_array($categoria, SERVICOS_SEMPRE_DIFERENCA, true)) {
            if ($tipo !== 'ATENDIMENTO' || !$atendimentoId) {
                throw new RegraNegocioException("{$categoria} só se lança em atendimento.");
            }
            return lancarTanatopraxiaAvancada($pdo, $atendimentoId, $convenio, $produtoEscolhidoId, $criadoPor, $autorizadoPrefeitura, $categoria);
            return lancarDiretoNaDiferenca($pdo, $atendimentoId, $convenio, $categoria, $produtoEscolhidoId, $quantidade, $criadoPor, 'sempre cobrado como diferença');
        }
        if (in_array($categoria, SERVICOS_CONDICIONAIS, true)) {
            if ($tipo !== 'ATENDIMENTO' || !$atendimentoId) {
                throw new RegraNegocioException("{$categoria} só se lança em atendimento.");
            }
            if ($categoria === 'TRANSLADO') {
                throw new RegraNegocioException('Translado se lança por adicionar_translado (origem, destino e km).');
            }
            return lancarServicoCondicional($pdo, $atendimentoId, $convenio, $categoria, $produtoEscolhidoId, $quantidade, buscarPrecoVenda($pdo, $produtoEscolhidoId), $criadoPor, $autorizadoPrefeitura, null);
        }
        $ehUrnaDoPlano = !$ehPrefeitura && $categoria === 'URNA';
        if ($ehPrefeitura && pacoteSuspensoNoAtendimento($convenio)) {   // atendimento não autorizado: o item vai inteiro para a Dif.Prf
            if ($tipo !== 'ATENDIMENTO' || !$atendimentoId) {
                throw new RegraNegocioException('Item fora do pacote só em atendimento.');
            }
            return lancarDiretoNaDiferenca($pdo, $atendimentoId, $convenio, $categoria, $produtoEscolhidoId, $quantidade, $criadoPor, 'a Prefeitura não autorizou o atendimento');
        }
        if ($ehPrefeitura && !pacoteVigente($pdo, $convenio)) {
            throw new RegraNegocioException('Pacote da Prefeitura de ' . dadosPrefeitura($convenio)['nome'] . ' não cadastrado — cadastre na rotina de convênios.', 422);
        }
        $padrao = buscarPacotePadrao($pdo, $convenio, $categoria);
        if (!$padrao && $ehPrefeitura) {   // item fora do pacote da Prefeitura: inteiro na Dif.Prf
            if ($tipo !== 'ATENDIMENTO' || !$atendimentoId) {
                throw new RegraNegocioException('Item fora do pacote só em atendimento.');
            }
            return lancarDiretoNaDiferenca($pdo, $atendimentoId, $convenio, $categoria, $produtoEscolhidoId, $quantidade, $criadoPor, 'fora do pacote da Prefeitura');
        }
        if (!$padrao && !$ehUrnaDoPlano) {   // item fora do pacote do plano: inteiro na Dif.Soc
            if ($tipo !== 'ATENDIMENTO' || !$atendimentoId) {
                throw new RegraNegocioException("Nenhum pacote padrão cadastrado para {$convenio} / {$categoria}.", 422);
            }
            return lancarDiretoNaDiferenca($pdo, $atendimentoId, $convenio, $categoria, $produtoEscolhidoId, $quantidade, $criadoPor, 'fora do pacote do plano');
        }
        $osConv = obterOuCriarOS($pdo, $tipo, $atendimentoId, $coroaPedidoId, 'CONVENIO', $convenio, $criadoPor);
        if ($ehPrefeitura) {
            $osConv = aplicarPacoteNaOS($pdo, $osConv);
        }

        // Limpa a escolha anterior da categoria nas duas OS (convênio e diferença).
        $osPartExistente = localizarOS($pdo, $tipo, $atendimentoId, $coroaPedidoId, 'PARTICULAR');
        if ($osPartExistente) {
            exigirOSAberta($osPartExistente);
            removerItensDaCategoria($pdo, (int) $osPartExistente['id'], $categoria, ['DIFERENCA']);
        }
        removerItensDaCategoria($pdo, (int) $osConv['id'], $categoria, ['PADRAO', 'REFERENCIA']);

        // A saída do estoque é sempre do produto ESCOLHIDO; o convênio cobre até o valor do padrão (ou o teto do plano, na urna).
        $valorEscolhido = buscarPrecoVenda($pdo, $produtoEscolhidoId);
        if ($ehUrnaDoPlano) {
            $cobertoUnit = min($valorEscolhido, tetoUrnaDoPlano($convenio, $pdo));
        } elseif ($ehPrefeitura) {
            // Prefeitura: a troca desconta o VALOR DO ITEM NO CONTRATO (a tabela é preço particular). Item padrão: sem diferença.
            $valorContratoItem = (float) ($padrao['valor_item'] ?? 0);
            $cobertoUnit = ($produtoEscolhidoId === (int) $padrao['produto_id'] || in_array($produtoEscolhidoId, (array) ($padrao['aceitos'] ?? []), true) || $valorEscolhido <= $valorContratoItem) ? $valorEscolhido : $valorContratoItem;
        } else {
            $valorPadrao = buscarPrecoVenda($pdo, (int) $padrao['produto_id']);
            $cobertoUnit = ($produtoEscolhidoId === (int) $padrao['produto_id'] || in_array($produtoEscolhidoId, (array) ($padrao['aceitos'] ?? []), true) || $valorEscolhido <= $valorPadrao) ? $valorEscolhido : $valorPadrao;
        }
        $diferencaUnit = dinheiro($valorEscolhido - $cobertoUnit);

        if ($ehPrefeitura) {
            $item = inserirItem($pdo, (int) $osConv['id'], $produtoEscolhidoId, $categoria, $quantidade, $valorEscolhido, true, 'REFERENCIA');
            recalcularTotalPrefeitura($pdo, (int) $osConv['id']); // o item está no pacote: o faturado é o valor fechado do pacote
        } else {
            $item = inserirItemCoberto($pdo, (int) $osConv['id'], $produtoEscolhidoId, $categoria, $quantidade, $valorEscolhido, $cobertoUnit);
            marcarComoCoberto($pdo, (int) $osConv['id']);
        }
        $nomeProd = nomeProduto($pdo, $produtoEscolhidoId);
        registrarEvento($pdo, (int) $osConv['id'], 'ITEM_INCLUIDO', "{$nomeProd} ({$categoria})" . ($ehPrefeitura ? ' — incluso no pacote da Prefeitura' : ' — coberto pelo plano: ' . formatarReais($cobertoUnit * $quantidade)), $criadoPor);

        $itemDif = null;
        $osPart = $osPartExistente;
        if ($diferencaUnit > 0) {
            $osPart = $osPartExistente ?: obterOuCriarOS($pdo, $tipo, $atendimentoId, $coroaPedidoId, 'PARTICULAR', $convenio, $criadoPor);
            $itemDif = inserirItem($pdo, (int) $osPart['id'], $produtoEscolhidoId, $categoria, $quantidade, $diferencaUnit, false, 'DIFERENCA');
            registrarEvento($pdo, (int) $osPart['id'], 'ITEM_INCLUIDO', "{$nomeProd} ({$categoria}) — diferença " . formatarReais($diferencaUnit * $quantidade), $criadoPor);
        }
        if ($osPart) {
            recalcularValorTotal($pdo, (int) $osPart['id']);
        }
        return [
            'os_convenio' => buscarOSPorId($pdo, (int) $osConv['id']),
            'os_particular' => $osPart ? buscarOSPorId($pdo, (int) $osPart['id']) : null,
            'item' => $item, 'item_padrao' => $item, 'item_diferenca' => $itemDif,
        ];
    });
}

/**
 * Translado: produto próprio (os_config.php → translado.produto_id) com o valor do km. O agente informa origem, destino e km;
 * valor = km x valor do km. Particular: na OS Prt. Convênio: regra de serviços condicionais (plano/aditivo ou autorização da Prefeitura). Lançar de novo substitui.
 */
function adicionarTranslado(PDO $pdo, int $atendimentoId, string $convenio, string $origem, string $destino, float $km, ?int $usuarioId, ?bool $autorizadoPrefeitura = null): array {
    $cfgTranslado = (array) osConfig('translado', []);
    $produtoId = (int) ($cfgTranslado['produto_id'] ?? 0);
    if ($produtoId <= 0) {
        throw new RegraNegocioException('Produto de translado não configurado (os_config.php → translado.produto_id).', 422);
    }
    $origem = trim($origem);
    $destino = trim($destino);
    if ($origem === '' || $destino === '' || mb_strlen($origem) > 100 || mb_strlen($destino) > 100) {
        throw new RegraNegocioException('Informe a cidade de partida e a de destino do translado.');
    }
    if ($km <= 0 || $km > 20000) {
        throw new RegraNegocioException('Quilometragem do translado inválida.');
    }
    $km = round($km, 1);
    return emTransacao($pdo, function () use ($pdo, $atendimentoId, $convenio, $origem, $destino, $km, $produtoId, $usuarioId, $autorizadoPrefeitura) {
        $conv = strtoupper(trim($convenio));
        if (strpos($conv, 'ASSOCIADO') === 0 || strpos($conv, 'PREFEITURA') === 0) {
            return lancarServicoCondicional($pdo, $atendimentoId, $conv, 'TRANSLADO', $produtoId, 1, dinheiro($km * buscarPrecoVenda($pdo, $produtoId)), $usuarioId, $autorizadoPrefeitura, [$origem, $destino, $km]);
        }
        $os = obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR', $convenio, $usuarioId);
        removerItensDaCategoria($pdo, (int) $os['id'], 'TRANSLADO', ['DIRETO', 'ADICIONAL']);
        $valorKm = buscarPrecoVenda($pdo, $produtoId);
        $valor = dinheiro($km * $valorKm);
        $item = inserirItem($pdo, (int) $os['id'], $produtoId, 'TRANSLADO', 1, $valor, false, 'DIRETO');
        $pdo->prepare('UPDATE os_itens SET translado_origem = :o, translado_destino = :d, translado_km = :k WHERE id = :id')
            ->execute(['o' => $origem, 'd' => $destino, 'k' => $km, 'id' => $item['id']]);
        recalcularValorTotal($pdo, (int) $os['id']);
        registrarEvento($pdo, (int) $os['id'], 'ITEM_INCLUIDO', "Translado {$origem} → {$destino}: " . number_format($km, 1, ',', '.') . ' km × ' . formatarReais($valorKm) . ' = ' . formatarReais($valor), $usuarioId, $valor);
        return ['os' => buscarOSPorId($pdo, (int) $os['id']), 'item' => buscarItem($pdo, (int) $item['id'])];
    });
}

/** Associado: número do contrato do titular (buscado no cadastro de associados pelo front) e nome do titular. */
function definirContratoAssociado(PDO $pdo, int $osId, string $numero, ?string $titular, ?int $usuarioId, ?string $aditivos = null): array {
    $numero = trim($numero);
    if ($numero === '' || mb_strlen($numero) > 40) {
        throw new RegraNegocioException('Informe o número do contrato do titular.');
    }
    $listaAditivos = null;
    if ($aditivos !== null) {
        $listaAditivos = array_values(array_unique(array_filter(array_map('trim', explode(',', strtoupper($aditivos))))));
        foreach ($listaAditivos as $a) {
            if (!in_array($a, SERVICOS_CONDICIONAIS, true)) {
                throw new RegraNegocioException('Aditivo inválido: ' . $a . ' (use ' . implode(', ', SERVICOS_CONDICIONAIS) . ').');
            }
        }
    }
    $osPlano = buscarOSPorId($pdo, $osId);
    if ($listaAditivos) {   // PLUS já cobre tanatopraxia (só aditivo de translado); MAX cobre tudo (sem aditivo)
        $permitidos = aditivosPermitidosDoPlano((string) $osPlano['convenio']);
        foreach ($listaAditivos as $a) {
            if (!in_array($a, $permitidos, true)) {
                throw new RegraNegocioException('O plano ' . planoDoConvenio((string) $osPlano['convenio']) . ' não tem aditivo de ' . strtolower($a)
                    . ($permitidos ? ' (aditivos possíveis: ' . implode(', ', $permitidos) . ').' : ' — já cobre tudo.'));
            }
        }
    }
    return emTransacao($pdo, function () use ($pdo, $osId, $numero, $titular, $usuarioId, $listaAditivos) {
        $os = buscarOSPorId($pdo, $osId, true);
        if ($os['natureza'] !== 'CONVENIO' || strpos(strtoupper((string) $os['convenio']), 'ASSOCIADO') !== 0) {
            throw new RegraNegocioException('Contrato do titular só se aplica à OS do plano (Associado).', 422);
        }
        exigirOSAberta($os);
        $pdo->prepare('UPDATE os_ordens SET contrato_numero = :n, contrato_titular = :t, contrato_aditivos = COALESCE(:a, contrato_aditivos) WHERE id = :id')
            ->execute(['n' => $numero, 't' => $titular !== null ? mb_substr(trim($titular), 0, 150) : null, 'a' => $listaAditivos !== null ? implode(',', $listaAditivos) : null, 'id' => $osId]);
        registrarEvento($pdo, $osId, 'CONTRATO', "Contrato do titular nº {$numero}" . ($titular ? " — {$titular}" : '') . ($listaAditivos ? ' · aditivos: ' . implode(', ', $listaAditivos) : ''), $usuarioId);
        return buscarOSPorId($pdo, $osId);
    });
}

/**
 * Remove um item de OS ABERTA. Itens PADRAO/DIFERENCA/REFERENCIA saem juntos (a escolha da categoria inteira),
 * nas duas OS do mesmo atendimento/pedido, para não sobrar diferença órfã.
 */
function removerItemDaOS(PDO $pdo, int $osItemId, ?int $usuarioId = null): array {
    return emTransacao($pdo, function () use ($pdo, $osItemId, $usuarioId) {
        $item = buscarItem($pdo, $osItemId);
        $os = buscarOSPorId($pdo, (int) $item['os_id'], true);
        exigirOSAberta($os);
        registrarEvento($pdo, (int) $os['id'], 'ITEM_REMOVIDO', nomeProduto($pdo, (int) $item['produto_id']) . " ({$item['categoria']}) removido", $usuarioId);

        if (in_array($item['tipo_item'], ['PADRAO', 'DIFERENCA', 'REFERENCIA'], true)) {
            $osIds = [(int) $os['id']];
            $colunaRef = $os['tipo'] === 'COROA' ? 'coroa_pedido_id' : 'atendimento_id';
            $ref = $os['tipo'] === 'COROA' ? $os['coroa_pedido_id'] : $os['atendimento_id'];
            $irmas = $pdo->prepare("SELECT id, status FROM os_ordens WHERE tipo = :t AND {$colunaRef} = :ref AND status <> 'CANCELADA' AND id <> :id FOR UPDATE");
            $irmas->execute(['t' => $os['tipo'], 'ref' => $ref, 'id' => $os['id']]);
            foreach ($irmas->fetchAll() as $irma) {
                if ($irma['status'] === 'ABERTA') {
                    $osIds[] = (int) $irma['id'];
                }
            }
            foreach ($osIds as $id) {
                removerItensDaCategoria($pdo, $id, $item['categoria'], ['PADRAO', 'DIFERENCA', 'REFERENCIA']);
                recalcularValorTotal($pdo, $id);
            }
        } else {
            $pdo->prepare('DELETE FROM os_itens WHERE id = :id')->execute(['id' => $osItemId]);
            recalcularValorTotal($pdo, (int) $os['id']);
        }
        return ['os' => buscarOSPorId($pdo, (int) $os['id'])];
    });
}

/* ---------------------------------------------------------------------------------------------------------------------
 * VALOR, ACRÉSCIMO E DESCONTO DOS ITENS (regras aprovadas em 05/10/2026)
 *  - Acréscimo: o valor unitário do item pode SUBIR livremente (nunca desce abaixo da tabela por aqui). Não aparece como acréscimo:
 *    a tela mostra só Valor (já com o acréscimo), Desconto e Final.
 *  - Desconto do item: só em R$ (os_itens.desconto_valor, sobre o total do item).
 *  - Desconto geral: % ou R$ (os_ordens.desconto_global_*), calculado DEPOIS dos descontos dos itens (sobre o subtotal).
 *  - Limite: a soma de TODOS os descontos (itens + geral) até o limite (padrão 20%) do valor com acréscimos. Gestão e Financeiro (páginas gestao ou
 *    financeiro, os_config.php → paginas_libera_desconto) e o administrador podem passar.
 *  - Translado: quantidade = km (translado_km), valor = valor do km. Só o valor muda; a quantidade não.
 * ------------------------------------------------------------------------------------------------------------------- */

/** As colunas novas (desconto_valor nos itens e desconto_global_* na OS) existem? Sem elas vale o cálculo antigo. */
function osTemDescontoNovo(PDO $pdo): bool {
    return colunaExisteOS($pdo, 'os_itens', 'desconto_valor') && colunaExisteOS($pdo, 'os_ordens', 'desconto_global_valor');
}

function exigirDescontoNovo(PDO $pdo): void {
    if (!osTemDescontoNovo($pdo)) {
        throw new RegraNegocioException('Faltam as colunas do desconto (os_itens.desconto_valor e os_ordens.desconto_global_*). Rode alteracoes_atendimento_sugeridas.sql.', 500);
    }
}

/** Quem pode passar do limite de desconto: administrador, ou quem tem a página de Gestão ou do Financeiro. */
function podePassarLimiteDesconto(array $usuario): bool {
    if (cargoEhAdmin((string) $usuario['cargo'])) {
        return true;
    }
    if (array_key_exists('paginas', $usuario)) {
        $libera = (array) osConfig('paginas_libera_desconto', ['gestao', 'financeiro']);
        $libera[] = paginaDaArea('financeiro');
        return (bool) array_intersect(array_unique($libera), (array) $usuario['paginas']);
    }
    return in_array((string) $usuario['cargo'], (array) osConfig('cargos_libera_desconto', ['adm', 'gestao', 'financeiro']), true);
}

/**
 * Produto com valor mínimo próprio (13/10/2026): fica FORA do limite de desconto (nem entra na base, nem gasta o limite). O agente dá
 * desconto nele até o valor mínimo sem liberação; abaixo do mínimo, só Gestão ou Financeiro. Padrão: Tanatopraxia (simples), R$ 600,00.
 * os_config.php → 'valor_minimo_desconto_livre' => [produto_id => valor mínimo] troca a lista (vazia = sem exceção).
 */
function valoresMinimosDescontoLivre(PDO $pdo): array {
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $cfg = osConfig('valor_minimo_desconto_livre', null);
    if (is_array($cfg)) {
        $cache = [];
        foreach ($cfg as $pid => $v) {
            if ((int) $pid > 0 && is_numeric($v) && (float) $v >= 0) {
                $cache[(int) $pid] = dinheiro((float) $v);
            }
        }
        return $cache;
    }
    try {
        $cache = [produtoTanatopraxiaNormal($pdo) => 600.00];
    } catch (Throwable $e) {
        $cache = [];
    }
    return $cache;
}

/** Valor mínimo do item (total, pela quantidade) quando o produto tem regra própria; null = item comum, dentro do limite de desconto. */
function valorMinimoDoItem(PDO $pdo, array $it): ?float {
    $minimos = valoresMinimosDescontoLivre($pdo);
    $pid = (int) ($it['produto_id'] ?? 0);
    if (!isset($minimos[$pid]) || (int) ($it['referencia_apenas'] ?? 0) === 1) {
        return null;
    }
    return dinheiro($minimos[$pid] * max(1, (int) $it['quantidade']));
}

/** Valor do item com acréscimo (base do desconto). Item antigo com valor abaixo da tabela: a base é a tabela. */
function valorBaseItem(array $it): float {
    return dinheiro(max((float) $it['valor_unitario_aplicado'], (float) $it['valor_unitario_travado']) * (int) $it['quantidade']);
}

/** Final do item = base − desconto em R$ (e a redução antiga, quando o valor ficou abaixo da tabela). */
function valorFinalItem(array $it): float {
    $apl = (float) $it['valor_unitario_aplicado'];
    return max(0.0, dinheiro($apl * (int) $it['quantidade'] - (float) ($it['desconto_valor'] ?? 0)));
}

/** Quantidade e valor unitário como aparecem na tela e na folha (translado: km × valor do km). */
function exibicaoItem(array $it): array {
    $km = isset($it['translado_km']) && $it['translado_km'] !== null ? (float) $it['translado_km'] : 0.0;
    $base = valorBaseItem($it);
    if ($it['categoria'] === 'TRANSLADO' && $km > 0) {
        return ['quantidade' => $km, 'unidade' => 'km', 'valor_unitario' => dinheiro($base / $km), 'quantidade_editavel' => false];
    }
    $q = max(1, (int) $it['quantidade']);
    return ['quantidade' => $q, 'unidade' => 'un', 'valor_unitario' => dinheiro($base / $q), 'quantidade_editavel' => false];
}

/**
 * Resumo dos descontos da OS em valores:
 *  bruto = soma dos itens com acréscimo; itens = descontos dos itens; subtotal = bruto − itens;
 *  global = desconto geral (% sobre o subtotal, ou R$); reducao = itens + global; percentual = reducao / bruto.
 */
function resumoDescontoOS(PDO $pdo, int $osId): array {
    $stmt = $pdo->prepare('SELECT * FROM os_itens WHERE os_id = :id AND referencia_apenas = 0');
    $stmt->execute(['id' => $osId]);
    $bruto = 0.0;
    $subtotal = 0.0;
    $baseProprios = 0.0;      // itens com valor mínimo próprio (ex.: Tanatopraxia): fora da base e do limite de desconto
    $descProprios = 0.0;
    $abaixoMinimo = 0.0;      // quanto esses itens ficaram abaixo do mínimo (só Gestão ou Financeiro)
    $novo = osTemDescontoNovo($pdo);
    foreach ($stmt->fetchAll() as $it) {
        if (!$novo) {
            $it['desconto_valor'] = 0;
        }
        $bruto += valorBaseItem($it);
        $subtotal += valorFinalItem($it);
        $min = valorMinimoDoItem($pdo, $it);
        if ($min !== null) {
            $baseProprios += valorBaseItem($it);
            $descProprios += valorBaseItem($it) - valorFinalItem($it);
            $abaixoMinimo += max(0.0, $min - valorFinalItem($it));
        }
    }
    $baseProprios = dinheiro($baseProprios);
    $descProprios = dinheiro($descProprios);
    $abaixoMinimo = dinheiro($abaixoMinimo);
    $bruto = dinheiro($bruto);
    $subtotal = dinheiro($subtotal);
    $descItens = dinheiro($bruto - $subtotal);
    $tipoGlobal = null;
    $pctGlobal = 0.0;
    $global = 0.0;
    if ($novo) {
        $os = buscarOSPorId($pdo, $osId);
        $tipoGlobal = $os['desconto_global_tipo'] ?: null;
        if ($tipoGlobal === 'PERCENTUAL') {
            $pctGlobal = (float) $os['desconto_global_percentual'];
            $global = dinheiro($subtotal * $pctGlobal / 100);
        } elseif ($tipoGlobal === 'VALOR') {
            $global = min($subtotal, dinheiro((float) $os['desconto_global_valor']));
        }
    }
    $reducao = dinheiro($descItens + $global);
    // Limite de desconto (13/10/2026): só sobre os itens sem valor mínimo próprio; o desconto deles e o desconto geral gastam o limite.
    $baseLimite = max(0.0, dinheiro($bruto - $baseProprios));
    $limite = dinheiro($baseLimite * limiteDescontoAgente() / 100);
    $noLimite = max(0.0, dinheiro($descItens - $descProprios + $global));
    return [
        'bruto' => $bruto, 'desconto_itens' => $descItens, 'subtotal' => $subtotal,
        'desconto_global_tipo' => $tipoGlobal, 'desconto_global_percentual' => $pctGlobal, 'desconto_global' => $global,
        'reducao' => $reducao, 'percentual' => $bruto > 0 ? round($reducao / $bruto * 100, 4) : 0.0,
        'base_limite' => $baseLimite, 'desconto_valor_minimo' => $descProprios, 'abaixo_do_minimo' => $abaixoMinimo,
        'reducao_no_limite' => $noLimite, 'percentual_no_limite' => $baseLimite > 0 ? round($noLimite / $baseLimite * 100, 4) : ($noLimite > 0 ? 100.0 : 0.0),
        'limite_percentual' => limiteDescontoAgente(), 'limite_valor' => $limite, 'disponivel' => max(0.0, dinheiro($limite - $noLimite)),
    ];
}

/** Carrega item + OS (com lock) e confere o que vale para qualquer edição de valor. */
function carregarItemParaEdicaoDeValor(PDO $pdo, int $osItemId): array {
    $stmt = $pdo->prepare('SELECT * FROM os_itens WHERE id = :id FOR UPDATE');
    $stmt->execute(['id' => $osItemId]);
    $item = $stmt->fetch();
    if (!$item) {
        throw new RegraNegocioException("Item {$osItemId} não encontrado.", 404);
    }
    $os = buscarOSPorId($pdo, (int) $item['os_id'], true);
    exigirOSAberta($os);
    if ($os['natureza'] !== 'PARTICULAR') {
        throw new RegraNegocioException('Valor e desconto só se aplicam a itens de OS Particular.', 422);
    }
    if ((int) $item['referencia_apenas'] === 1) {
        throw new RegraNegocioException('Item de referência não tem valor editável.', 422);
    }
    return [$item, $os];
}

/** Desconto além do que veio do orçamento: só a Gestão (página gestao) ou o administrador (14/10/2026). */
function podeDescontoAlemDoOrcamento(array $usuario): bool {
    if (cargoEhAdmin((string) ($usuario['cargo'] ?? ''))) {
        return true;
    }
    if (array_key_exists('paginas', $usuario)) {
        return in_array('gestao', (array) $usuario['paginas'], true);
    }
    return in_array((string) ($usuario['cargo'] ?? ''), ['adm', 'gestao'], true);
}

/**
 * Orçamento que virou este atendimento e já tinha desconto (14/10/2026). Os valores tratados no orçamento migram para a OS
 * (orcamento.php → converter); depois disso, desconto a mais nessa OS só a Gestão. null = OS sem orçamento com desconto.
 */
function orcamentoComDescontoDaOS(PDO $pdo, array $os): ?array {
    if (($os['tipo'] ?? '') !== 'ATENDIMENTO' || ($os['natureza'] ?? '') !== 'PARTICULAR' || empty($os['atendimento_id'])) {
        return null;
    }
    try {
        if (!colunaExisteOS($pdo, 'orcamentos', 'atendimento_id')) {
            return null;
        }
        $st = $pdo->prepare("SELECT id, criado_em, linhas_json, valor_total FROM orcamentos WHERE atendimento_id = :a AND status = 'CONVERTIDO' ORDER BY id DESC LIMIT 1");
        $st->execute(['a' => (int) $os['atendimento_id']]);
        $o = $st->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        return null;
    }
    if (!$o) {
        return null;
    }
    $bruto = 0.0;
    $desc = 0.0;
    foreach ((array) (json_decode((string) $o['linhas_json'], true) ?: []) as $l) {
        if (($l['valor'] ?? null) === null) {
            continue;
        }
        $bruto += (float) $l['valor'];
        $desc += (float) ($l['desconto'] ?? 0);
    }
    $global = max(0.0, dinheiro($bruto - $desc - (float) $o['valor_total']));
    if ($desc + $global <= 0.005) {
        return null;
    }
    return ['id' => (int) $o['id'], 'numero' => str_pad((string) $o['id'], 4, '0', STR_PAD_LEFT) . '-Orc/' . substr((string) $o['criado_em'], 2, 2)];
}

/**
 * Confere o limite de desconto depois de uma alteração (já gravada, dentro da transação).
 * Recusa quando o desconto da OS passa do limite E a alteração aumentou o percentual — quem não pode passar do limite nunca piora
 * a situação, mas pode sempre reduzir desconto ou voltar valores. Devolve true quando a OS ficou acima do limite (liberado).
 */
function conferirLimiteDesconto(PDO $pdo, int $osId, array $antes, array $usuario): bool {
    // Produto com valor mínimo próprio (ex.: Tanatopraxia até R$ 600) fica fora do limite: tem a regra do mínimo (13/10/2026).
    $depois = resumoDescontoOS($pdo, $osId);
    // OS que veio de orçamento com desconto (14/10/2026): o desconto já foi dado no orçamento; mais desconto, só a Gestão.
    if ($depois['reducao'] > ($antes['reducao'] ?? 0.0) + 0.005 && !podeDescontoAlemDoOrcamento($usuario)) {
        $orc = orcamentoComDescontoDaOS($pdo, buscarOSPorId($pdo, $osId));
        if ($orc) {
            throw new RegraNegocioException('Esta OS veio do orçamento ' . $orc['numero'] . ', que já teve desconto. Desconto a mais, só a Gestão.', 403);
        }
    }
    $pode = podePassarLimiteDesconto($usuario);
    $abaixo = $depois['abaixo_do_minimo'] > 0.005;
    if ($abaixo && $depois['abaixo_do_minimo'] > ($antes['abaixo_do_minimo'] ?? 0.0) + 0.005 && !$pode) {
        $minimos = valoresMinimosDescontoLivre($pdo);
        $textos = [];
        foreach ($minimos as $pid => $v) {
            $textos[] = nomeProduto($pdo, (int) $pid) . ' até ' . formatarReais($v);
        }
        throw new RegraNegocioException('Desconto abaixo do valor mínimo liberado (' . implode('; ', $textos) . '). Abaixo disso, só Gestão ou Financeiro.', 403);
    }
    $acima = $depois['reducao_no_limite'] > $depois['limite_valor'] + 0.005;
    if ($acima && $depois['percentual_no_limite'] > ($antes['percentual_no_limite'] ?? $antes['percentual']) + 0.0001 && !$pode) {
        throw new RegraNegocioException(sprintf(
            'Os descontos da OS somariam %s (%s%%), acima do limite de %s%% (%s sobre %s). Disponível para desconto: %s. Acima disso, só Gestão ou Financeiro.',
            formatarReais($depois['reducao_no_limite']), number_format($depois['percentual_no_limite'], 2, ',', '.'), number_format(limiteDescontoAgente(), 0, ',', '.'),
            formatarReais($depois['limite_valor']), formatarReais($depois['base_limite']), formatarReais($antes['disponivel'])
        ), 403);   // o rollback da transação desfaz a alteração
    }
    return $acima || $abaixo;
}

function registrarLogPreco(PDO $pdo, array $os, array $item, int $usuarioId, float $anterior, float $novo, string $tipo, bool $acima): void {
    $pdo->prepare(
        'INSERT INTO os_precos_log (os_id, os_item_id, produto_id, usuario_id, valor_referencia, valor_anterior, valor_novo, tipo, acima_limite)
         VALUES (:os, :item, :prod, :u, :ref, :ant, :novo, :tipo, :acima)'
    )->execute([
        'os' => $os['id'], 'item' => $item['id'], 'prod' => $item['produto_id'], 'u' => $usuarioId, 'ref' => (float) $item['valor_unitario_travado'],
        'ant' => $anterior, 'novo' => $novo, 'tipo' => $tipo, 'acima' => $acima ? 1 : 0,
    ]);
}

/** Grava valor final do item a partir do valor unitário e do desconto em R$. */
function gravarValoresDoItem(PDO $pdo, int $itemId, float $unit, float $descontoValor, int $qtd, ?int $usuarioId, bool $acima, float $base): void {
    $final = max(0.0, dinheiro($unit * $qtd - $descontoValor));
    $pct = $base > 0 ? round($descontoValor / $base * 100, 2) : 0.0;
    $pdo->prepare(
        'UPDATE os_itens SET valor_unitario_aplicado = :a, desconto_valor = :dv, desconto_percentual = :p, desconto_aplicado_por = :u,
                desconto_acima_limite = :l, valor_final = :f WHERE id = :id'
    )->execute(['a' => $unit, 'dv' => $descontoValor, 'p' => $pct, 'u' => $descontoValor > 0 ? $usuarioId : null, 'l' => $acima ? 1 : 0, 'f' => $final, 'id' => $itemId]);
}

/**
 * Ajuste do VALOR do item (acréscimo livre). O valor unitário não pode ficar abaixo da tabela — desconto é só em R$ (aplicarDescontoEmReais).
 * Translado: informe o valor do km ($valorKm); a quantidade (km) não muda. Item e quantidade nunca mudam por aqui.
 */
function editarValorItem(PDO $pdo, int $osItemId, float $novoValor, array $usuario, ?float $valorKm = null): array {
    exigirDescontoNovo($pdo);
    return emTransacao($pdo, function () use ($pdo, $osItemId, $novoValor, $usuario, $valorKm) {
        [$item, $os] = carregarItemParaEdicaoDeValor($pdo, $osItemId);
        $qtd = (int) $item['quantidade'];
        $km = (float) ($item['translado_km'] ?? 0);
        if ($valorKm !== null && $item['categoria'] === 'TRANSLADO' && $km > 0) {
            $novoValor = $valorKm * $km;   // o item do translado guarda o total do trecho (quantidade 1)
        }
        $novo = dinheiro($novoValor);
        $ref = dinheiro((float) $item['valor_unitario_travado']);
        if ($novo > 9999999.99) {
            throw new RegraNegocioException('Valor inválido.');
        }
        if ($novo < $ref - 0.004) {
            throw new RegraNegocioException('O valor não pode ficar abaixo da tabela (' . formatarReais($ref) . '). Para reduzir, use o desconto em R$.', 422);
        }
        $anterior = dinheiro((float) $item['valor_unitario_aplicado']);
        $antes = resumoDescontoOS($pdo, (int) $os['id']);
        $desc = dinheiro((float) $item['desconto_valor']);
        $base = dinheiro($novo * $qtd);
        if ($desc > $base) {
            $desc = $base;
        }
        gravarValoresDoItem($pdo, (int) $item['id'], $novo, $desc, $qtd, (int) $usuario['id'], false, $base);
        $acima = conferirLimiteDesconto($pdo, (int) $os['id'], $antes, $usuario);
        if (abs($novo - $anterior) > 0.004) {
            registrarLogPreco($pdo, $os, $item, (int) $usuario['id'], $anterior, $novo, abs($novo - $ref) < 0.005 ? 'REFERENCIA' : 'AUMENTO', $acima);
            registrarEvento($pdo, (int) $os['id'], 'VALOR_EDITADO', nomeProduto($pdo, (int) $item['produto_id']) . ': valor ajustado para ' . formatarReais($base), (int) $usuario['id']);
        }
        recalcularValorTotal($pdo, (int) $os['id']);
        return respostaItemValor($pdo, (int) $item['id'], (int) $os['id']);
    });
}

/** Desconto em R$ no item (SET, não acumula; 0 tira o desconto). Vale o limite de desconto somando todos os descontos da OS. */
function aplicarDescontoEmReais(PDO $pdo, int $osItemId, float $valorDesconto, array $usuario): array {
    exigirDescontoNovo($pdo);
    if ($valorDesconto < 0) {
        throw new RegraNegocioException('O desconto não pode ser negativo.');
    }
    return emTransacao($pdo, function () use ($pdo, $osItemId, $valorDesconto, $usuario) {
        [$item, $os] = carregarItemParaEdicaoDeValor($pdo, $osItemId);
        $qtd = (int) $item['quantidade'];
        $unit = max((float) $item['valor_unitario_aplicado'], (float) $item['valor_unitario_travado']);   // item antigo abaixo da tabela volta à tabela
        $base = dinheiro($unit * $qtd);
        $desc = dinheiro($valorDesconto);
        if ($desc > $base + TOLERANCIA_CENTAVO) {
            throw new RegraNegocioException('O desconto (' . formatarReais($desc) . ') é maior que o valor do item (' . formatarReais($base) . ').', 422);
        }
        $antes = resumoDescontoOS($pdo, (int) $os['id']);
        $anteriorDesc = dinheiro((float) $item['desconto_valor']);
        gravarValoresDoItem($pdo, (int) $item['id'], $unit, $desc, $qtd, (int) $usuario['id'], false, $base);
        $acima = conferirLimiteDesconto($pdo, (int) $os['id'], $antes, $usuario);
        if ($acima) {
            $pdo->prepare('UPDATE os_itens SET desconto_acima_limite = 1 WHERE id = :id')->execute(['id' => $item['id']]);
        }
        if (abs($desc - $anteriorDesc) > 0.004) {
            $pct = $base > 0 ? round($desc / $base * 100, 2) : 0.0;
            registrarLogPreco($pdo, $os, $item, (int) $usuario['id'], dinheiro($base - $anteriorDesc), dinheiro($base - $desc), 'REDUCAO', $acima);
            registrarEvento($pdo, (int) $os['id'], 'DESCONTO', 'Desconto de ' . formatarReais($desc) . ' em ' . nomeProduto($pdo, (int) $item['produto_id'])
                . ($acima ? ' — acima do limite de ' . limiteDescontoAgente() . '%, liberado (Gestão/Financeiro)' : ''), (int) $usuario['id'], $desc);
            $pdo->prepare('INSERT INTO os_descontos_log (os_item_id, usuario_id, percentual_solicitado, limite_padrao, aprovado_por_admin) VALUES (:i, :u, :p, :l, :a)')
                ->execute(['i' => $item['id'], 'u' => $usuario['id'], 'p' => $pct, 'l' => limiteDescontoAgente(), 'a' => $acima ? $usuario['id'] : null]);
        }
        recalcularValorTotal($pdo, (int) $os['id']);
        return respostaItemValor($pdo, (int) $item['id'], (int) $os['id']);
    });
}

/** Desconto de item em % não existe mais: só em R$. Mantido para o endpoint antigo responder com uma mensagem clara. */
function validarEAplicarDesconto(PDO $pdo, int $osItemId, float $percentual, array $usuario): void {
    throw new RegraNegocioException('O desconto do item é só em R$ (valor_desconto). Desconto em % só no desconto geral da OS.', 422);
}

/** Linha do item para a tela: Qtd, Valor (com acréscimo), Desconto e Final. O acréscimo não sai separado. */
function itemParaTela(PDO $pdo, array $it): array {
    $ex = exibicaoItem($it);
    $base = valorBaseItem($it);
    $final = valorFinalItem($it);
    return [
        'id' => (int) $it['id'], 'os_id' => (int) $it['os_id'], 'produto_id' => (int) $it['produto_id'], 'produto_nome' => nomeProduto($pdo, (int) $it['produto_id']),
        'categoria' => $it['categoria'], 'tipo_item' => $it['tipo_item'],
        'quantidade' => $ex['quantidade'], 'unidade' => $ex['unidade'], 'valor_unitario' => $ex['valor_unitario'],
        'valor' => $base, 'desconto' => dinheiro($base - $final), 'valor_final' => $final,
        'valor_tabela_unitario' => $it['categoria'] === 'TRANSLADO' && (float) ($it['translado_km'] ?? 0) > 0
            ? dinheiro((float) $it['valor_unitario_travado'] / (float) $it['translado_km']) : dinheiro((float) $it['valor_unitario_travado']),
        'translado_origem' => $it['translado_origem'] ?? null, 'translado_destino' => $it['translado_destino'] ?? null,
        'frase_faixa' => $it['frase_faixa'] ?? null, 'referencia_apenas' => (int) $it['referencia_apenas'] === 1,
    ];
}

function respostaItemValor(PDO $pdo, int $itemId, int $osId): array {
    return ['item' => itemParaTela($pdo, buscarItem($pdo, $itemId)), 'resumo' => resumoDescontoOS($pdo, $osId),
            'total_os' => dinheiro((float) buscarOSPorId($pdo, $osId)['valor_total'])];
}

/**
 * Confirmação dos valores da OS (passo obrigatório antes de assinar uma OS Particular).
 * Qualquer alteração posterior (item, valor, desconto, remoção) desfaz a confirmação — item e valor continuam editáveis até o
 * fechamento da OS; é só confirmar de novo.
 */
function confirmarOS(PDO $pdo, int $osId, int $usuarioId): array {
    return emTransacao($pdo, function () use ($pdo, $osId, $usuarioId) {
        $os = buscarOSPorId($pdo, $osId, true);
        exigirOSAberta($os);
        if ($os['natureza'] !== 'PARTICULAR') {
            throw new RegraNegocioException('Confirmação de valores só se aplica a OS Particular.', 422);
        }
        $n = $pdo->prepare('SELECT COUNT(*) FROM os_itens WHERE os_id = :id AND referencia_apenas = 0');
        $n->execute(['id' => $osId]);
        if ((int) $n->fetchColumn() === 0 || dinheiro((float) $os['valor_total']) <= 0) {
            throw new RegraNegocioException("OS {$os['numero_os']} não tem itens com valor a confirmar.", 422);
        }
        $pdo->prepare('UPDATE os_ordens SET confirmada_em = NOW(), confirmada_por = :u, confirmada_valor_total = valor_total WHERE id = :id')
            ->execute(['u' => $usuarioId, 'id' => $osId]);
        registrarEvento($pdo, $osId, 'CONFIRMADA', 'Valores confirmados (' . formatarReais((float) $os['valor_total']) . ')', $usuarioId, (float) $os['valor_total']);
        return buscarOSPorId($pdo, $osId);
    });
}

/**
 * Desconto geral da OS: tipo PERCENTUAL (sobre o subtotal, depois dos descontos dos itens) ou VALOR (R$). 0 tira o desconto.
 * Vale o limite de desconto somando os descontos dos itens e o geral (Gestão/Financeiro passam).
 */
function aplicarDescontoGlobal(PDO $pdo, int $osId, string $tipo, float $valor, array $usuario): array {
    exigirDescontoNovo($pdo);
    $tipo = strtoupper(trim($tipo));
    if (!in_array($tipo, ['PERCENTUAL', 'VALOR'], true)) {
        throw new RegraNegocioException('Tipo do desconto geral: PERCENTUAL ou VALOR.');
    }
    if ($valor < 0 || ($tipo === 'PERCENTUAL' && $valor > 100)) {
        throw new RegraNegocioException($tipo === 'PERCENTUAL' ? 'O percentual deve estar entre 0 e 100.' : 'O desconto não pode ser negativo.');
    }
    return emTransacao($pdo, function () use ($pdo, $osId, $tipo, $valor, $usuario) {
        $os = buscarOSPorId($pdo, $osId, true);
        exigirOSAberta($os);
        if ($os['natureza'] !== 'PARTICULAR') {
            throw new RegraNegocioException('Desconto só se aplica a OS Particular.', 422);
        }
        $antes = resumoDescontoOS($pdo, $osId);
        if ($antes['bruto'] <= 0) {
            throw new RegraNegocioException('A OS não tem itens cobráveis para receber desconto.', 422);
        }
        if ($tipo === 'VALOR' && $valor > $antes['subtotal'] + TOLERANCIA_CENTAVO) {
            throw new RegraNegocioException('O desconto (' . formatarReais($valor) . ') é maior que o subtotal da OS (' . formatarReais($antes['subtotal']) . ').', 422);
        }
        $zero = $valor <= 0;
        $pdo->prepare('UPDATE os_ordens SET desconto_global_tipo = :t, desconto_global_percentual = :p, desconto_global_valor = :v WHERE id = :id')->execute([
            't' => $zero ? null : $tipo,
            'p' => !$zero && $tipo === 'PERCENTUAL' ? round($valor, 4) : null,
            'v' => !$zero && $tipo === 'VALOR' ? dinheiro($valor) : 0,
            'id' => $osId,
        ]);
        $acima = conferirLimiteDesconto($pdo, $osId, $antes, $usuario);
        $r = resumoDescontoOS($pdo, $osId);
        registrarEvento($pdo, $osId, 'DESCONTO', $zero ? 'Desconto geral retirado' : ('Desconto geral de ' . formatarReais($r['desconto_global'])
            . ($tipo === 'PERCENTUAL' ? ' (' . rtrim(rtrim(number_format($valor, 2, ',', '.'), '0'), ',') . '% sobre ' . formatarReais($r['subtotal']) . ')' : '')
            . ($acima ? ' — acima do limite de ' . limiteDescontoAgente() . '%, liberado (Gestão/Financeiro)' : '')), (int) $usuario['id'], $r['desconto_global']);
        recalcularValorTotal($pdo, $osId);
        return ['os' => buscarOSPorId($pdo, $osId), 'resumo' => resumoDescontoOS($pdo, $osId)];
    });
}

/** Itens da OS para a tela (Qtd, Valor, Desconto, Final) + resumo dos descontos e quem pode passar do limite. */
function itensDaOSParaTela(PDO $pdo, int $osId, array $usuario): array {
    $st = $pdo->prepare('SELECT * FROM os_itens WHERE os_id = :id ORDER BY id');
    $st->execute(['id' => $osId]);
    $novo = osTemDescontoNovo($pdo);
    $itens = [];
    foreach ($st->fetchAll() as $it) {
        if (!$novo) {
            $it['desconto_valor'] = 0;
        }
        $itens[] = itemParaTela($pdo, $it);
    }
    return ['os_id' => $osId, 'itens' => $itens, 'resumo' => resumoDescontoOS($pdo, $osId), 'pode_passar_limite' => podePassarLimiteDesconto($usuario),
            'colunas_desconto' => $novo];
}

/* =====================================================================
 * FECHAMENTO, REABERTURA E ASSINATURA
 * ===================================================================== */

/** Trava a OS (Corpo Pronto ou assinatura). Só age sobre OS ABERTA ou AGUARDANDO_ASSINATURA. */
function fecharOS(PDO $pdo, int $osId, string $motivo): void {
    if (!in_array($motivo, ['CORPO_PRONTO', 'ASSINATURA'], true)) {
        throw new InvalidArgumentException('motivo de fechamento inválido');
    }
    $pdo->prepare("UPDATE os_ordens SET status = 'FECHADA', motivo_fechamento = :m WHERE id = :id AND status IN ('ABERTA','AGUARDANDO_ASSINATURA')")
        ->execute(['m' => $motivo, 'id' => $osId]);
}

/**
 * Pagamento informado na assinatura. Devolve ['valor','forma','data','saldo'].
 *  - OS de convênio (Associado/Prefeitura): sem pagamento e sem nota promissória;
 *  - OS Particular: total > 0; valor entre 0 e o total. Com valor > 0 exige forma válida e data (padrão hoje, nunca futura).
 *  - saldo = total - pago: é o valor da nota promissória (à vista). Saldo 0 = quitada no ato, sem NP.
 */
function validarPagamentoNoAto(array $os, ?array $pag, float $jaPago = 0.0): array {
    $valor = dinheiro((float) ($pag['valor'] ?? 0));
    if ($os['natureza'] !== 'PARTICULAR') {
        if ($valor > 0) {
            throw new RegraNegocioException('OS de convênio não tem pagamento nem nota promissória.', 422);
        }
        return ['valor' => 0.0, 'forma' => null, 'data' => null, 'saldo' => 0.0];
    }
    $total = dinheiro((float) $os['valor_total'] - $jaPago); // Dif de conversão: o que a família já pagou na OS original
    if ($total <= 0) {
        throw new RegraNegocioException("OS {$os['numero_os']} está sem valor a cobrar — lance os itens antes de assinar.", 422);
    }
    if ($valor < 0) {
        throw new RegraNegocioException('O valor pago no ato não pode ser negativo.');
    }
    if ($valor > $total + TOLERANCIA_CENTAVO) {
        throw new RegraNegocioException('O valor pago no ato (' . formatarReais($valor) . ') é maior que o ' . ($jaPago > 0 ? 'saldo' : 'total') . ' da OS (' . formatarReais($total) . ').', 422);
    }
    $forma = null;
    $data = null;
    if ($valor > 0) {
        $forma = strtoupper(trim((string) ($pag['forma'] ?? '')));
        if (!in_array($forma, FORMAS_PAGAMENTO, true)) {
            throw new RegraNegocioException('Informe a forma do pagamento no ato: ' . implode(', ', FORMAS_PAGAMENTO) . '.');
        }
        $data = validarData((string) ($pag['data'] ?? date('Y-m-d')));
        if ($data > date('Y-m-d')) {
            throw new RegraNegocioException('A data do pagamento no ato não pode ser futura.');
        }
    }
    $saldo = dinheiro($total - $valor);
    return ['valor' => $valor, 'forma' => $forma, 'data' => $data, 'saldo' => $saldo < TOLERANCIA_CENTAVO ? 0.0 : $saldo, 'ja_pago' => dinheiro($jaPago)];
}

/** Regras comuns a qualquer forma de assinatura. Devolve o CPF normalizado (só dígitos) ou null. */
function validarAssinante(PDO $pdo, array $os, string $nome, ?string $cpf): ?string {
    // Conclusão da venda (09/10/2026): a assinatura vem DEPOIS de concluir (a conclusão fecha a OS e trava os valores).
    if ($os['status'] === 'ABERTA') {
        throw new RegraNegocioException("Conclua a venda da OS {$os['numero_os']} antes de colher a assinatura.", 409);
    }
    if ($os['status'] !== 'FECHADA' || !empty($os['assinada_em'])) {
        throw new RegraNegocioException("OS {$os['numero_os']} " . (!empty($os['assinada_em']) ? 'já está assinada.' : "está {$os['status']} — não pode ser assinada."), 409);
    }
    if (trim($nome) === '') {
        throw new RegraNegocioException('nome_responsavel é obrigatório.');
    }
    $cpfLimpo = null;
    if ($cpf !== null && trim($cpf) !== '') {
        if (!validarCpf($cpf)) {
            throw new RegraNegocioException('CPF do responsável inválido.');
        }
        $cpfLimpo = preg_replace('/\D/', '', $cpf);
    }
    $n = $pdo->prepare('SELECT COUNT(*) FROM os_itens WHERE os_id = :id');
    $n->execute(['id' => $os['id']]);
    if ((int) $n->fetchColumn() === 0) {
        throw new RegraNegocioException("OS {$os['numero_os']} não tem itens — não há o que assinar.", 422);
    }
    return $cpfLimpo;
}

/**
 * Reabre a OS (manual 16.4: alterar depois de assinar invalida a assinatura).
 * Recusa quando: a OS já está ABERTA/CANCELADA; foi fechada por Corpo Pronto (estoque já baixado); ou já há
 * recebimento lançado (estorne antes). Apaga a nota promissória (ela é refeita na nova assinatura).
 * @return array ['os' => ..., 'aviso' => ?string]
 */
function invalidarAssinaturaEReabrir(PDO $pdo, int $osId, ?int $usuarioId = null, string $motivo = ''): array {
    return emTransacao($pdo, function () use ($pdo, $osId, $usuarioId, $motivo) {
        $os = buscarOSPorId($pdo, $osId, true);
        if ($os['status'] === 'CONVERTIDA') {
            throw new RegraNegocioException("OS {$os['numero_os']} foi convertida — trabalhe nas OS geradas pela conversão.", 409);
        }
        if ($os['status'] === 'ABERTA') {
            throw new RegraNegocioException("OS {$os['numero_os']} já está aberta.", 409);
        }
        if ($os['status'] === 'CANCELADA') {
            throw new RegraNegocioException("OS {$os['numero_os']} está cancelada.", 409);
        }
        if ($os['status'] === 'FECHADA' && !in_array($os['motivo_fechamento'], ['ASSINATURA', 'CONCLUSAO'], true)) {
            throw new RegraNegocioException("OS {$os['numero_os']} foi fechada por {$os['motivo_fechamento']} (estoque já baixado) — reabertura exige procedimento próprio.", 409);
        }
        $pag = $pdo->prepare(
            'SELECT COUNT(*) FROM os_financeiro_pagamentos p JOIN os_financeiro f ON f.id = p.financeiro_id
             WHERE f.os_id = :id AND f.status <> \'CANCELADO\' AND p.estornado = 0'
        );
        $pag->execute(['id' => $osId]);
        if ((int) $pag->fetchColumn() > 0) {
            throw new RegraNegocioException("OS {$os['numero_os']} já tem recebimento lançado — estorne os pagamentos no financeiro antes de reabrir.", 409);
        }

        $aviso = cancelarEnvelopeNaPlataforma($os);
        if ($os['envelope_id']) {
            registrarLogWebhook($pdo, $osId, $os['envelope_id'], 'REABERTA', json_encode(['motivo' => 'OS reaberta pelo sistema', 'envelope_status' => $os['envelope_status']]), true, $aviso);
        }

        $pdo->prepare('DELETE FROM os_np WHERE os_id = :id')->execute(['id' => $osId]);
        $pdo->prepare(
            "UPDATE os_ordens SET status = 'ABERTA', assinada_em = NULL, assinatura_tipo = NULL, assinatura_responsavel_nome = NULL,
                 assinatura_responsavel_cpf = NULL, assinatura_arquivo = NULL, motivo_fechamento = NULL,
                 envelope_id = NULL, envelope_status = NULL, envelope_link_assinatura = NULL, envelope_documento_url = NULL,
                 envelope_pendente_json = NULL, pago_no_ato = 0, pago_antes = 0, forma_pagamento_no_ato = NULL, confirmada_em = NULL, confirmada_por = NULL, confirmada_valor_total = NULL
             WHERE id = :id"
        )->execute(['id' => $osId]);
        if (colunaExisteOS($pdo, 'os_ordens', 'concluida_em')) {
            $pdo->prepare('UPDATE os_ordens SET concluida_em = NULL, concluida_por = NULL WHERE id = :id')->execute(['id' => $osId]);
        }
        registrarEvento($pdo, $osId, 'REABERTA', 'OS reaberta — conclusão, assinatura e nota promissória invalidadas' . ($motivo !== '' ? '. Motivo: ' . $motivo : ''), $usuarioId);
        return ['os' => mascararOSParaResposta(buscarOSPorId($pdo, $osId)), 'aviso' => $aviso];
    });
}

/**
 * Assinatura SIMPLES (captura em tela) — UMA assinatura cobre a OS e a nota promissória do saldo.
 * Pagamento no ato é opcional: se informado, é lançado no financeiro; o que sobrar vira a NP (à vista). Tudo numa transação.
 * @return array ['pagamento' => [...], 'np' => ?array]
 */
function assinarOS(PDO $pdo, int $osId, string $nomeResponsavel, ?string $cpfResponsavel, string $arquivoAssinatura, ?array $pagamentoNoAto = null, ?int $usuarioId = null): array {
    if (trim($arquivoAssinatura) === '') {
        throw new RegraNegocioException('arquivo_assinatura é obrigatório.');
    }
    return emTransacao($pdo, function () use ($pdo, $osId, $nomeResponsavel, $cpfResponsavel, $arquivoAssinatura, $pagamentoNoAto, $usuarioId) {
        $os = buscarOSPorId($pdo, $osId, true);
        $cpf = validarAssinante($pdo, $os, $nomeResponsavel, $cpfResponsavel);
        exigirContratoSeAssociado($os);
        // O pagamento é lançado na conclusão; a assinatura só registra quem assinou e emite a NP do saldo (total − tudo o que já entrou).
        if ($pagamentoNoAto !== null && (float) ($pagamentoNoAto['valor'] ?? 0) > 0) {
            throw new RegraNegocioException('O pagamento agora é lançado na conclusão da venda. Atualize o aplicativo.', 422);
        }
        $pagamento = ['valor' => 0.0, 'forma' => null, 'data' => null, 'saldo' => 0.0, 'ja_pago' => 0.0];
        if ($os['natureza'] === 'PARTICULAR') {
            $saldo = dinheiro((float) $os['valor_total'] - valorJaPagoDaOS($pdo, $osId));
            $pagamento['saldo'] = $saldo < TOLERANCIA_CENTAVO ? 0.0 : $saldo;
        }

        $pdo->prepare(
            "UPDATE os_ordens SET assinada_em = NOW(), assinatura_tipo = 'SIMPLES', assinatura_responsavel_nome = :nome,
                 assinatura_responsavel_cpf = :cpf, assinatura_arquivo = :arq WHERE id = :id"
        )->execute(['nome' => trim($nomeResponsavel), 'cpf' => $cpf, 'arq' => $arquivoAssinatura, 'id' => $osId]);
        fecharOS($pdo, $osId, 'ASSINATURA');
        finalizarAssinatura($pdo, $osId, $pagamento, date('Y-m-d'), $usuarioId);

        $np = $pdo->prepare('SELECT * FROM os_np WHERE os_id = :id');
        $np->execute(['id' => $osId]);
        return ['pagamento' => $pagamento, 'np' => $np->fetch() ?: null];
    });
}

/* ---------------------------------------------------------------------
 * ASSINATURA POR PLATAFORMA EXTERNA — no escopo, SEM provedor definido.
 * Fluxo: iniciarAssinaturaViaPlataforma() → OS fica AGUARDANDO_ASSINATURA →
 * webhook → confirmarAssinaturaPorWebhook() fecha a OS, lança o pagamento no ato e emite a NP do saldo.
 * Com provedor_assinatura = null o início lança erro claro; a assinatura SIMPLES segue funcionando.
 * O provedor SIMULADO (só em modo_teste) permite testar o fluxo inteiro sem contratar plataforma.
 * --------------------------------------------------------------------- */

function provedorAssinaturaAtivo(): ?string {
    $p = osConfig('provedor_assinatura', null);
    if ($p === 'SIMULADO' && !modoTeste()) {
        return null; // nunca vale em produção
    }
    return in_array($p, ['D4SIGN', 'ZAPSIGN', 'SIMULADO'], true) ? $p : null;
}

function credenciaisProvedorAssinatura(): array {
    return [
        'D4SIGN' => osConfig('d4sign', []) + ['base_url' => 'https://secure.d4sign.com.br/api/v1', 'token_api' => '', 'crypt_key' => '', 'uuid_cofre' => ''],
        'ZAPSIGN' => osConfig('zapsign', []) + ['base_url' => 'https://api.zapsign.com.br/api/v1', 'api_token' => ''],
    ];
}

/**
 * Abre o envelope. Sequência (sem segurar lock durante a chamada externa):
 *  1) transação curta: valida e marca AGUARDANDO_ASSINATURA/CRIANDO (bloqueia edição e envelope duplo);
 *  2) chama o provedor; 3) grava envelope_id/link. Se o provedor falhar, volta a OS para ABERTA.
 * O documento enviado contém a declaração e o texto COMPLETO da nota promissória do saldo (valor, extenso, à vista) —
 * o que o responsável assina é a NP, não só um resumo da OS. O pagamento no ato é lançado quando a plataforma confirmar.
 */
function iniciarAssinaturaViaPlataforma(PDO $pdo, int $osId, string $nome, ?string $cpf, string $email, ?string $telefone, ?array $pagamentoNoAto = null, ?int $usuarioId = null): array {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RegraNegocioException('email_responsavel inválido.');
    }
    if (provedorAssinaturaAtivo() === null) {
        throw new RegraNegocioException(
            'Nenhum provedor de assinatura configurado (provedor_assinatura no os_config.php). A plataforma ainda está em definição — use a assinatura simples (?assinar=1).', 502
        );
    }

    $preparo = emTransacao($pdo, function () use ($pdo, $osId, $nome, $cpf, $pagamentoNoAto) {
        $os = buscarOSPorId($pdo, $osId, true);
        $cpfLimpo = validarAssinante($pdo, $os, $nome, $cpf);
        exigirContratoSeAssociado($os);
        $pagamentoOk = validarPagamentoNoAto($os, $pagamentoNoAto, valorJaPagoDaOS($pdo, $osId));
        $pdo->prepare("UPDATE os_ordens SET status = 'AGUARDANDO_ASSINATURA', assinatura_tipo = 'PLATAFORMA', envelope_status = 'CRIANDO' WHERE id = :id")
            ->execute(['id' => $osId]);
        return ['os' => $os, 'cpf' => $cpfLimpo, 'pagamento' => $pagamentoOk];
    });

    $emissao = date('Y-m-d');
    try {
        $osParaTexto = array_merge($preparo['os'], ['assinatura_responsavel_nome' => trim($nome), 'assinatura_responsavel_cpf' => $preparo['cpf']]);
        $texto = montarTextoParaAssinatura($pdo, $osParaTexto, $preparo['pagamento'], $emissao);
        $envelope = chamarApiPlataformaDeAssinatura($osParaTexto, trim($nome), $preparo['cpf'], $email, $telefone, $texto);
        if (empty($envelope['envelope_id'])) {
            throw new RuntimeException('O provedor não devolveu envelope_id.');
        }
    } catch (Throwable $e) {
        $pdo->prepare("UPDATE os_ordens SET status = 'ABERTA', assinatura_tipo = NULL, envelope_status = NULL WHERE id = :id AND status = 'AGUARDANDO_ASSINATURA' AND envelope_id IS NULL")
            ->execute(['id' => $osId]);
        throw $e instanceof RegraNegocioException ? $e : new RegraNegocioException('Falha ao criar o envelope de assinatura: ' . $e->getMessage(), 502);
    }

    $pdo->prepare(
        "UPDATE os_ordens SET assinatura_responsavel_nome = :nome, assinatura_responsavel_cpf = :cpf, envelope_id = :eid,
             envelope_status = 'PENDENTE', envelope_link_assinatura = :link, envelope_pendente_json = :json WHERE id = :id"
    )->execute([
        'nome' => trim($nome), 'cpf' => $preparo['cpf'], 'eid' => $envelope['envelope_id'], 'link' => $envelope['link_assinatura'] ?? null,
        'json' => json_encode(['emissao' => $emissao, 'pagamento' => $preparo['pagamento'], 'usuario_id' => $usuarioId]), 'id' => $osId,
    ]);
    return $envelope;
}

/** Cancelamento do envelope no provedor ao reabrir a OS. Sem provedor definido, devolve um aviso para ação manual. */
function cancelarEnvelopeNaPlataforma(array $os): ?string {
    if (empty($os['envelope_id'])) {
        return null;
    }
    $p = provedorAssinaturaAtivo();
    if ($p === null || $p === 'SIMULADO') {
        return null;
    }
    return "O envelope {$os['envelope_id']} NÃO foi cancelado automaticamente na plataforma {$p} (cancelamento ainda não implementado) — cancele-o no painel do provedor.";
}

function chamarApiPlataformaDeAssinatura(array $os, string $nome, ?string $cpf, string $email, ?string $telefone, string $textoDocumento): array {
    switch (provedorAssinaturaAtivo()) {
        case 'D4SIGN':
            return chamarD4Sign($os, $nome, $cpf, $email, $telefone, $textoDocumento);
        case 'ZAPSIGN':
            return chamarZapSign($os, $nome, $cpf, $email, $telefone, $textoDocumento);
        case 'SIMULADO':
            return ['envelope_id' => 'SIM-' . bin2hex(random_bytes(6)), 'link_assinatura' => 'https://exemplo.invalid/assinar/' . bin2hex(random_bytes(4))];
        default:
            throw new RegraNegocioException('Nenhum provedor de assinatura configurado.', 502);
    }
}

/** D4Sign — 3 chamadas (upload → signatário → envio). Mantido como estava; provedor ainda não decidido. */
function chamarD4Sign(array $os, string $nome, ?string $cpf, string $email, ?string $telefone, string $textoDocumento): array {
    $cred = credenciaisProvedorAssinatura()['D4SIGN'];
    if (!$cred['token_api'] || !$cred['uuid_cofre']) {
        throw new RegraNegocioException('Configure d4sign.token_api e d4sign.uuid_cofre no os_config.php.', 502);
    }
    $auth = 'tokenAPI=' . urlencode($cred['token_api']) . ($cred['crypt_key'] ? '&cryptKey=' . urlencode($cred['crypt_key']) : '');
    $pdf = gerarPdfDocumentoParaAssinatura($textoDocumento);
    $up = chamarHttpMultipart("{$cred['base_url']}/documents/{$cred['uuid_cofre']}/upload?{$auth}", [
        'file' => ['conteudo' => $pdf, 'nome' => "os_{$os['numero_os']}.pdf", 'tipo' => 'application/pdf'],
        'workflow' => '2',
    ]);
    $uuid = $up['uuid'] ?? null;
    if (!$uuid) {
        throw new RuntimeException('D4Sign não devolveu uuid no upload: ' . json_encode($up));
    }
    chamarHttpJson('POST', "{$cred['base_url']}/documents/{$uuid}/createlist?{$auth}", [
        'signers' => [['email' => $email, 'act' => '1', 'foreign' => '0', 'certificadoicpbr' => '1', 'assinatura_presencial' => '0']],
    ]);
    chamarHttpJson('POST', "{$cred['base_url']}/documents/{$uuid}/sendtosigner?{$auth}", [
        'skip_email' => '0', 'workflow' => '1', 'message' => "OS nº {$os['numero_os']} — assine para confirmar o atendimento.",
    ]);
    return ['envelope_id' => $uuid, 'link_assinatura' => null];
}

/** ZapSign — 1 chamada. Mantido como estava; formato do webhook a confirmar na documentação atual. */
function chamarZapSign(array $os, string $nome, ?string $cpf, string $email, ?string $telefone, string $textoDocumento): array {
    $cred = credenciaisProvedorAssinatura()['ZAPSIGN'];
    if (!$cred['api_token']) {
        throw new RegraNegocioException('Configure zapsign.api_token no os_config.php.', 502);
    }
    $pdf = gerarPdfDocumentoParaAssinatura($textoDocumento);
    $signer = ['name' => $nome, 'email' => $email, 'auth_mode' => 'tokenEmail'];
    if ($telefone) {
        $signer['phone_country'] = '55';
        $signer['phone_number'] = preg_replace('/\D/', '', $telefone);
    }
    $resp = chamarHttpJson('POST', "{$cred['base_url']}/docs/", [
        'name' => "OS {$os['numero_os']} — Nota Promissória", 'base64_pdf' => base64_encode($pdf), 'signers' => [$signer],
    ], ['Authorization: Bearer ' . $cred['api_token']]);
    return ['envelope_id' => $resp['token'] ?? null, 'link_assinatura' => $resp['signers'][0]['sign_url'] ?? null];
}

/** Normaliza o payload do webhook (D4Sign: uuid+type_post; ZapSign: token+status; SIMULADO só em modo_teste). */
function normalizarWebhookAssinatura(array $payload): array {
    if (modoTeste() && ($payload['simulado'] ?? false) === true && isset($payload['envelope_id'], $payload['status'])) {
        return ['envelope_id' => (string) $payload['envelope_id'], 'status' => (string) $payload['status'], 'documento_url' => $payload['documento_url'] ?? null];
    }
    if (isset($payload['uuid'], $payload['type_post'])) {
        $mapa = ['1' => 'ASSINADO', '4' => 'ASSINADO', '3' => 'RECUSADO'];
        return ['envelope_id' => (string) $payload['uuid'], 'status' => $mapa[(string) $payload['type_post']] ?? 'DESCONHECIDO', 'documento_url' => $payload['url_doc'] ?? $payload['document_url'] ?? null];
    }
    if (isset($payload['token'], $payload['status'])) {
        $mapa = ['signed' => 'ASSINADO', 'refused' => 'RECUSADO', 'expired' => 'EXPIRADO'];
        return ['envelope_id' => (string) $payload['token'], 'status' => $mapa[$payload['status']] ?? 'DESCONHECIDO', 'documento_url' => $payload['signed_file'] ?? null];
    }
    throw new RegraNegocioException('Payload de webhook não reconhecido.', 400);
}

function gerarPdfDocumentoParaAssinatura(string $textoOuHtml): string {
    if (!function_exists('gerarPdfDeHtml')) {
        require_once __DIR__ . '/os_documentos.php';
    }
    $html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Documento para assinatura</title>'
          . '<style>body{font-family:Nunito,Helvetica,sans-serif;font-size:12pt;line-height:1.45;color:#313C55} pre{font-family:inherit;white-space:pre-wrap}</style></head><body><pre>'
          . htmlspecialchars($textoOuHtml, ENT_QUOTES, 'UTF-8') . '</pre></body></html>';
    return gerarPdfDeHtml($html);
}

/** Documento enviado para assinatura: resumo da OS (com valores) + declaração + texto COMPLETO da nota promissória do saldo. */
function montarTextoParaAssinatura(PDO $pdo, array $os, array $pagamento, string $emissao): string {
    $itens = $pdo->prepare('SELECT * FROM os_itens WHERE os_id = :id AND referencia_apenas = 0 ORDER BY id');
    $itens->execute(['id' => $os['id']]);
    $linhas = [];
    foreach ($itens->fetchAll() as $it) {
        $frase = trim((string) $it['frase_faixa']) !== '' ? ' — faixa: “' . trim($it['frase_faixa']) . '”' : '';
        $linhas[] = "- {$it['categoria']} (produto #{$it['produto_id']}), qtd {$it['quantidade']}{$frase}: " . formatarReais((float) $it['valor_final']);
    }
    $texto = "ORDEM DE SERVIÇO Nº {$os['numero_os']}\n\nItens:\n" . implode("\n", $linhas) . "\n\n";
    if ($os['natureza'] === 'CONVENIO') {
        $coberto = valorCobertoPeloPlano($pdo, (int) $os['id']);
        $texto .= 'Valor coberto pelo plano: ' . formatarReais($coberto) . "\n\n" . declaracaoDaOS($os, $coberto, false);
        return $texto;
    }
    $texto .= 'Total: ' . formatarReais((float) $os['valor_total']) . "\n";
    if ($pagamento['valor'] > 0) {
        $texto .= 'Pago no ato: ' . formatarReais($pagamento['valor']) . ' (' . $pagamento['forma'] . ")\n";
    }
    if ($pagamento['saldo'] > 0) {
        $texto .= 'Saldo: ' . formatarReais($pagamento['saldo']) . "\n\n" . str_repeat('-', 60) . "\n" . montarTextoNotaPromissoria($os, $pagamento['saldo'], $emissao) . "\n\n";
    } else {
        $texto .= "Quitada no ato — nenhuma nota promissória.\n\n";
    }
    return $texto . declaracaoDaOS($os, 0.0, $pagamento['saldo'] > 0);
}

function chamarHttpJson(string $metodo, string $url, array $corpo, array $headersExtras = []): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_POSTFIELDS => json_encode($corpo),
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json', 'Accept: application/json'], $headersExtras),
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,
    ]);
    $bruta = curl_exec($ch);
    if ($bruta === false) {
        $e = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException("Erro de rede ao chamar {$url}: {$e}");
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($status >= 400) {
        throw new RuntimeException("Erro HTTP {$status} ao chamar {$url}: {$bruta}");
    }
    return json_decode($bruta, true) ?? [];
}

function chamarHttpMultipart(string $url, array $campos): array {
    $post = [];
    $temporarios = [];
    foreach ($campos as $chave => $valor) {
        if (is_array($valor) && isset($valor['conteudo'])) {
            $tmp = tmpfile();
            $temporarios[] = $tmp; // mantém o arquivo vivo até o envio
            fwrite($tmp, $valor['conteudo']);
            $post[$chave] = new CURLFile(stream_get_meta_data($tmp)['uri'], $valor['tipo'] ?? 'application/octet-stream', $valor['nome'] ?? 'arquivo');
        } else {
            $post[$chave] = $valor;
        }
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $post, CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60]);
    $bruta = curl_exec($ch);
    if ($bruta === false) {
        $e = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException("Erro de rede ao chamar {$url}: {$e}");
    }
    curl_close($ch);
    return json_decode($bruta, true) ?? [];
}

function registrarLogWebhook(PDO $pdo, ?int $osId, ?string $envelopeId, string $evento, string $payloadBruto, bool $processado, ?string $erro = null): void {
    $pdo->prepare(
        'INSERT INTO os_webhook_assinatura_log (os_id, envelope_id, evento, payload_bruto, processado, erro) VALUES (:os, :env, :ev, :pl, :pr, :er)'
    )->execute(['os' => $osId, 'env' => $envelopeId, 'ev' => $evento, 'pl' => $payloadBruto, 'pr' => $processado ? 1 : 0, 'er' => $erro !== null ? mb_substr($erro, 0, 255) : null]);
}

/**
 * Confirmação da plataforma. Toda chamada é logada ANTES de qualquer efeito (e o log sobrevive mesmo se houver erro).
 * Idempotente: provedores reenviam eventos; um reenvio para OS já FECHADA é registrado como duplicado e ignorado
 * (antes duplicava a nota promissória).
 * @return string OK | DUPLICADO | DESCONHECIDO | IGNORADO | REGISTRADO
 */
function confirmarAssinaturaPorWebhook(PDO $pdo, string $envelopeId, string $eventoStatus, ?string $documentoUrl, string $payloadBruto): string {
    return emTransacao($pdo, function () use ($pdo, $envelopeId, $eventoStatus, $documentoUrl, $payloadBruto) {
        $stmt = $pdo->prepare('SELECT * FROM os_ordens WHERE envelope_id = :e LIMIT 1 FOR UPDATE');
        $stmt->execute(['e' => $envelopeId]);
        $os = $stmt->fetch();

        if (!$os) {
            registrarLogWebhook($pdo, null, $envelopeId, $eventoStatus, $payloadBruto, false, 'Nenhuma OS encontrada para este envelope_id.');
            return 'DESCONHECIDO';
        }
        $osId = (int) $os['id'];
        if (!in_array($eventoStatus, ['ASSINADO', 'RECUSADO', 'EXPIRADO'], true)) {
            registrarLogWebhook($pdo, $osId, $envelopeId, $eventoStatus, $payloadBruto, false, "Status de evento não reconhecido: {$eventoStatus}.");
            return 'IGNORADO';
        }
        if ($os['status'] !== 'AGUARDANDO_ASSINATURA') {
            $msg = $os['status'] === 'FECHADA' ? 'Evento duplicado — OS já fechada; nada foi reprocessado.' : "OS não está aguardando assinatura (status {$os['status']}).";
            registrarLogWebhook($pdo, $osId, $envelopeId, $eventoStatus, $payloadBruto, true, $msg);
            return 'DUPLICADO';
        }
        if ($eventoStatus !== 'ASSINADO') {
            // Recusa/expiração: só registra; a OS segue AGUARDANDO_ASSINATURA para decisão manual.
            $pdo->prepare('UPDATE os_ordens SET envelope_status = :s WHERE id = :id')->execute(['s' => $eventoStatus, 'id' => $osId]);
            registrarLogWebhook($pdo, $osId, $envelopeId, $eventoStatus, $payloadBruto, true);
            return 'REGISTRADO';
        }

        $pdo->prepare("UPDATE os_ordens SET assinada_em = NOW(), envelope_status = 'ASSINADO', envelope_documento_url = :u WHERE id = :id")
            ->execute(['u' => $documentoUrl, 'id' => $osId]);
        fecharOS($pdo, $osId, 'ASSINATURA');

        $pendente = $os['envelope_pendente_json'] ? json_decode($os['envelope_pendente_json'], true) : [];
        $pagamento = $pendente['pagamento'] ?? ['valor' => 0.0, 'forma' => null, 'data' => null, 'saldo' => 0.0];
        $emissao = $pendente['emissao'] ?? date('Y-m-d');
        $osAtual = buscarOSPorId($pdo, $osId);
        if ($osAtual['natureza'] === 'PARTICULAR' && $pagamento['valor'] <= 0) {
            $pagamento['saldo'] = dinheiro((float) $osAtual['valor_total']); // sem pagamento no ato: a NP cobre o total
        }
        finalizarAssinatura($pdo, $osId, $pagamento, $emissao, $pendente['usuario_id'] ?? ($os['confirmada_por'] !== null ? (int) $os['confirmada_por'] : null));

        $pdo->prepare('UPDATE os_ordens SET envelope_pendente_json = NULL WHERE id = :id')->execute(['id' => $osId]);
        registrarLogWebhook($pdo, $osId, $envelopeId, $eventoStatus, $payloadBruto, true);
        return 'OK';
    });
}

/* =====================================================================
 * NOTA PROMISSÓRIA ÚNICA, PAGAMENTO NO ATO E DECLARAÇÕES
 * Uma assinatura cobre a OS e a NP. A NP é do SALDO (total - pago no ato), à vista, e não existe se a OS foi quitada no ato.
 * O parcelamento/negociação acontece depois, no financeiro; a NP é baixada quando o saldo da OS zera.
 * ===================================================================== */

/** Emite a NP (uma por OS, só Particular, só com saldo > 0). */
function exigirContratoSeAssociado(array $os): void {
    if ($os['natureza'] === 'CONVENIO' && strpos(strtoupper((string) $os['convenio']), 'ASSOCIADO') === 0 && trim((string) $os['contrato_numero']) === '') {
        throw new RegraNegocioException("Informe o número do contrato do titular na OS {$os['numero_os']} antes de assinar.", 422);
    }
}

/** Total já recebido (não estornado) nas propostas vigentes da OS. */
function valorJaPagoDaOS(PDO $pdo, int $osId): float {
    $stmt = $pdo->prepare("SELECT COALESCE(SUM(p.valor), 0) FROM os_financeiro_pagamentos p JOIN os_financeiro f ON f.id = p.financeiro_id
                           WHERE f.os_id = :id AND f.status <> 'CANCELADO' AND p.estornado = 0");
    $stmt->execute(['id' => $osId]);
    return dinheiro((float) $stmt->fetchColumn());
}

function emitirNotaPromissoria(PDO $pdo, int $osId, float $valor, string $emissao): void {
    $os = buscarOSPorId($pdo, $osId);
    $valor = dinheiro($valor);
    if ($os['natureza'] !== 'PARTICULAR' || $valor <= 0) {
        return;
    }
    $ja = $pdo->prepare('SELECT COUNT(*) FROM os_np WHERE os_id = :id');
    $ja->execute(['id' => $osId]);
    if ((int) $ja->fetchColumn() > 0) {
        throw new RegraNegocioException("OS {$os['numero_os']} já tem nota promissória.", 409);
    }
    $pdo->prepare('INSERT INTO os_np (os_id, valor, emitida_em) VALUES (:os, :v, :em)')->execute(['os' => $osId, 'v' => $valor, 'em' => $emissao]);
}

/**
 * Passos comuns depois de a OS ser assinada (simples ou plataforma): lança o pagamento no ato no financeiro
 * (proposta + recebimento) e emite a NP do saldo.
 */
function finalizarAssinatura(PDO $pdo, int $osId, array $pagamento, string $emissao, ?int $usuarioId): void {
    // Marco no log de documentos: reimpressão da NP (via única) conta só as emissões POSTERIORES a este marco (rascunhos impressos antes não contam).
    $pdo->prepare("INSERT INTO os_documentos_log (os_id, tipo, formato, usuario_id) VALUES (:os, 'OS', 'ASSINATURA', :u)")->execute(['os' => $osId, 'u' => (int) $usuarioId]);
    $os = buscarOSPorId($pdo, $osId);
    if ($os['natureza'] !== 'PARTICULAR') {
        registrarEvento($pdo, $osId, 'ASSINADA', 'OS assinada por ' . $os['assinatura_responsavel_nome'], $usuarioId);
        return;
    }
    if ($pagamento['valor'] > 0) {
        // Dif de conversão já traz a proposta (com os recebimentos da OS original): lança nela. Senão, cria a proposta.
        $existente = $pdo->prepare("SELECT id FROM os_financeiro WHERE os_id = :id AND status NOT IN ('FATURADO','CANCELADO') ORDER BY id DESC LIMIT 1");
        $existente->execute(['id' => $osId]);
        $finId = $existente->fetchColumn();
        $fin = $finId ? buscarFinanceiroPorId($pdo, (int) $finId)
            : criarPropostaFinanceira($pdo, $osId, $pagamento['saldo'] > 0 ? 'MISTO' : 'A_VISTA', dinheiro((float) $os['valor_total']), null, $usuarioId);
        registrarPagamentoFinanceiro($pdo, (int) $fin['id'], (string) $pagamento['forma'], (float) $pagamento['valor'], (string) $pagamento['data'], 'Pagamento no ato da assinatura', $usuarioId);
        $pdo->prepare('UPDATE os_ordens SET pago_no_ato = :v, forma_pagamento_no_ato = :f WHERE id = :id')
            ->execute(['v' => $pagamento['valor'], 'f' => $pagamento['forma'], 'id' => $osId]);
    }
    if (($pagamento['ja_pago'] ?? 0) > 0) {
        $pdo->prepare('UPDATE os_ordens SET pago_antes = :v WHERE id = :id')->execute(['v' => $pagamento['ja_pago'], 'id' => $osId]);
    }
    if ($pagamento['saldo'] > 0) {
        emitirNotaPromissoria($pdo, $osId, (float) $pagamento['saldo'], $emissao);
    }
    $osFim = buscarOSPorId($pdo, $osId);
    registrarEvento($pdo, $osId, 'ASSINADA', 'OS assinada por ' . $osFim['assinatura_responsavel_nome']
        . ($pagamento['valor'] > 0 ? ' — ' . formatarReais($pagamento['valor']) . ' pagos no ato (' . $pagamento['forma'] . ')' : ''), $usuarioId, $pagamento['valor'] > 0 ? $pagamento['valor'] : null);
    if ($pagamento['saldo'] > 0) {
        registrarEvento($pdo, $osId, 'NP_EMITIDA', 'Nota promissória de ' . formatarReais($pagamento['saldo']) . ' emitida na folha da OS (à vista)', $usuarioId, $pagamento['saldo']);
    }
}

/** Soma do que o plano (Associado) cobriu: valor dos itens da OS de convênio. */
function valorCobertoPeloPlano(PDO $pdo, int $osId): float {
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(valor_final), 0) FROM os_itens WHERE os_id = :id AND referencia_apenas = 0');
    $stmt->execute(['id' => $osId]);
    return dinheiro((float) $stmt->fetchColumn());
}

/**
 * Declaração que a pessoa assina (singular, texto único na folha).
 *  - Associado (convênio): ciente de que o plano custeou os itens e do ressarcimento, conforme o contrato;
 *  - Particular com NP: de acordo com itens/valores e compromisso de pagar o saldo pela NP;
 *  - Particular quitada: de acordo com itens/valores.
 */
function declaracaoDaOS(array $os, float $valorCoberto, bool $temNP): string {
    if ($os['natureza'] === 'CONVENIO') {
        if (strpos(strtoupper((string) $os['convenio']), 'PREFEITURA') === 0) {
            return 'Declaro estar de acordo com os itens e serviços desta Ordem de Serviço, prestados no âmbito do convênio com a ' . (function_exists('rotuloConvenio') ? rotuloConvenio($os['convenio']) : 'Prefeitura') . '.';
        }
        return 'Declaro estar ciente de que os itens e serviços acima, no valor total de ' . formatarReais($valorCoberto)
            . ', foram custeados pelo plano contratado, sem custo para mim neste ato, e de que o descumprimento do contrato por parte do CONTRATANTE '
            . 'sujeita ao ressarcimento previsto na cláusula de ressarcimento, conforme contrato.';
    }
    return $temNP
        ? 'Declaro estar de acordo com os itens e valores desta Ordem de Serviço e comprometo-me a pagar o saldo indicado, conforme a nota promissória desta folha.'
        : 'Declaro estar de acordo com os itens e valores desta Ordem de Serviço.';
}

/** Corpo da nota promissória (à vista, singular). */
function corpoNotaPromissoria(array $os, float $valor, string $emissaoYmd): string {
    $v = formatarReais($valor);
    $ext = valorPorExtenso($valor);
    return "À vista, eu pagarei por esta única via de NOTA PROMISSÓRIA a PAI — Plano Assistencial Integrado, ou à sua ordem, a quantia de {$v} ({$ext}), "
        . 'em moeda corrente nacional, pagável em Barreiras-BA. Emitida em Barreiras-BA, ' . dataPorExtenso($emissaoYmd) . ". Referente à Ordem de Serviço nº {$os['numero_os']}.";
}

/** Texto completo da NP (usado no documento enviado à plataforma de assinatura). REVISAR COM O ADVOGADO antes de produção. */
function montarTextoNotaPromissoria(array $os, float $valor, string $emissaoYmd): string {
    $cpf = mascararCpf($os['assinatura_responsavel_cpf'] ?? null);
    $emitente = ($os['assinatura_responsavel_nome'] ?? '') . ($cpf ? " — CPF {$cpf}" : '');
    return "NOTA PROMISSÓRIA\n\nNº {$os['numero_os']}          Valor: " . formatarReais($valor) . "\n(" . valorPorExtenso($valor) . ")\n\nVencimento: à vista\n\n"
        . corpoNotaPromissoria($os, $valor, $emissaoYmd) . "\n\n_________________________________________\nEmitente: {$emitente}";
}

/* =====================================================================
 * FINANCEIRO DA OS — faturamento independente do fechamento (manual 16.6)
 * Funciona em QUALQUER status da OS (inclusive FECHADA); nunca mexe em itens, descontos nem estoque.
 * Regra predominante: só FATURA ao chegar em 100% do valor_alvo.
 * Ligação com a OS: cada lançamento/estorno chama sincronizarStatusPagamentoOS(), que atualiza
 * os_ordens.status_pagamento e baixa a NP (única) quando o saldo da OS zera.
 * ===================================================================== */

function buscarFinanceiroPorId(PDO $pdo, int $financeiroId, bool $paraAtualizar = false): array {
    $stmt = $pdo->prepare('SELECT * FROM os_financeiro WHERE id = :id' . ($paraAtualizar ? ' FOR UPDATE' : ''));
    $stmt->execute(['id' => $financeiroId]);
    $row = $stmt->fetch();
    if (!$row) {
        throw new RegraNegocioException("Proposta financeira {$financeiroId} não encontrada.", 404);
    }
    return $row;
}

/** Soma só pagamentos NÃO estornados. */
function calcularSaldoFinanceiro(PDO $pdo, int $financeiroId): array {
    $fin = buscarFinanceiroPorId($pdo, $financeiroId);
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(valor), 0) AS pago FROM os_financeiro_pagamentos WHERE financeiro_id = :id AND estornado = 0');
    $stmt->execute(['id' => $financeiroId]);
    $pago = dinheiro((float) $stmt->fetch()['pago']);
    $alvo = dinheiro((float) $fin['valor_alvo']);
    return [
        'financeiro_id' => $financeiroId,
        'status' => $fin['status'],
        'valor_alvo' => $alvo,
        'total_pago' => $pago,
        'saldo_restante' => (float) max(0, dinheiro($alvo - $pago)),
        'percentual_pago' => $alvo > 0 ? round(min(100, $pago / $alvo * 100), 2) : 0.0,
    ];
}

function sincronizarStatusPagamentoOS(PDO $pdo, int $financeiroId, ?int $usuarioId = null): void {
    $fin = buscarFinanceiroPorId($pdo, $financeiroId);
    $saldo = calcularSaldoFinanceiro($pdo, $financeiroId);
    $pago = $saldo['total_pago'];
    $osId = (int) $fin['os_id'];
    $quitada = $pago > 0 && $pago + TOLERANCIA_CENTAVO >= $saldo['valor_alvo'];

    $statusPag = $pago <= 0 ? 'AGUARDANDO' : ($quitada ? 'PAGO' : 'PARCIAL');
    $pdo->prepare('UPDATE os_ordens SET status_pagamento = :s WHERE id = :id')->execute(['s' => $statusPag, 'id' => $osId]);

    // A NP (única) é baixada quando o saldo zera; um estorno que reabre o saldo volta a NP para ABERTA. NP SUBSTITUIDA não muda.
    $np = $pdo->prepare('SELECT status FROM os_np WHERE os_id = :id');
    $np->execute(['id' => $osId]);
    $antes = $np->fetchColumn();
    if ($antes === false || $antes === 'SUBSTITUIDA') {
        return;
    }
    if ($quitada && $antes !== 'BAIXADA') {
        $pdo->prepare("UPDATE os_np SET status = 'BAIXADA', baixada_em = NOW() WHERE os_id = :id")->execute(['id' => $osId]);
        registrarEvento($pdo, $osId, 'NP_BAIXADA', 'Saldo zerado — nota promissória baixada (devolver ao emitente)', $usuarioId);
    } elseif (!$quitada && $antes === 'BAIXADA') {
        $pdo->prepare("UPDATE os_np SET status = 'ABERTA', baixada_em = NULL WHERE os_id = :id")->execute(['id' => $osId]);
        registrarEvento($pdo, $osId, 'NP_REABERTA', 'Saldo reaberto por estorno — nota promissória volta a ABERTA', $usuarioId);
    }
}

/**
 * Abre a proposta. Uma proposta em aberto por OS (garantido por lock da linha da OS). A OS não pode estar CANCELADA.
 * Se valor_alvo divergir do total da OS, `observacao` é obrigatória (justificativa).
 */
function criarPropostaFinanceira(PDO $pdo, int $osId, string $tipoProposta, float $valorAlvo, ?string $observacao, ?int $usuarioId): array {
    if (!in_array($tipoProposta, ['A_VISTA', 'PARCELADO', 'MISTO'], true)) {
        throw new RegraNegocioException('tipo_proposta inválido — use A_VISTA, PARCELADO ou MISTO.');
    }
    $valorAlvo = dinheiro($valorAlvo);
    if ($valorAlvo <= 0) {
        throw new RegraNegocioException('valor_alvo precisa ser maior que zero.');
    }
    return emTransacao($pdo, function () use ($pdo, $osId, $tipoProposta, $valorAlvo, $observacao, $usuarioId) {
        $os = buscarOSPorId($pdo, $osId, true);
        if ($os['status'] === 'CANCELADA') {
            throw new RegraNegocioException("OS {$os['numero_os']} está cancelada.", 409);
        }
        $aberta = $pdo->prepare("SELECT id FROM os_financeiro WHERE os_id = :id AND status NOT IN ('FATURADO','CANCELADO') LIMIT 1");
        $aberta->execute(['id' => $osId]);
        if ($aberta->fetch()) {
            throw new RegraNegocioException("Já existe proposta financeira em aberto para a OS {$os['numero_os']}. Cancele-a antes de abrir outra.", 409);
        }
        if (abs($valorAlvo - dinheiro((float) $os['valor_total'])) > TOLERANCIA_CENTAVO && trim((string) $observacao) === '') {
            throw new RegraNegocioException(
                'valor_alvo (' . formatarReais($valorAlvo) . ') difere do total da OS (' . formatarReais((float) $os['valor_total']) . ') — informe a justificativa em observacao.'
            );
        }
        $pdo->prepare('INSERT INTO os_financeiro (os_id, tipo_proposta, valor_alvo, status, observacao, criado_por) VALUES (:os, :t, :v, \'PROPOSTA\', :o, :u)')
            ->execute(['os' => $osId, 't' => $tipoProposta, 'v' => $valorAlvo, 'o' => $observacao, 'u' => $usuarioId]);
        return buscarFinanceiroPorId($pdo, (int) $pdo->lastInsertId());
    });
}

/** Cancela uma proposta sem recebimentos vigentes (com recebimento: estorne primeiro). Não cancela FATURADA. */
function cancelarPropostaFinanceira(PDO $pdo, int $financeiroId, string $motivo, ?int $usuarioId): array {
    if (trim($motivo) === '') {
        throw new RegraNegocioException('motivo é obrigatório para cancelar a proposta.');
    }
    return emTransacao($pdo, function () use ($pdo, $financeiroId, $motivo, $usuarioId) {
        $fin = buscarFinanceiroPorId($pdo, $financeiroId, true);
        if ($fin['status'] === 'CANCELADO') {
            throw new RegraNegocioException('Proposta já está cancelada.', 409);
        }
        if ($fin['status'] === 'FATURADO') {
            throw new RegraNegocioException('Proposta FATURADA não pode ser cancelada — estorne os pagamentos (admin).', 409);
        }
        if (calcularSaldoFinanceiro($pdo, $financeiroId)['total_pago'] > 0) {
            throw new RegraNegocioException('A proposta tem recebimentos — estorne-os (admin) antes de cancelar.', 409);
        }
        $nota = trim((string) $fin['observacao'] . "\n[Cancelada por usuário " . (int) $usuarioId . ' em ' . date('d/m/Y H:i') . ': ' . trim($motivo) . ']');
        $pdo->prepare("UPDATE os_financeiro SET status = 'CANCELADO', observacao = :o WHERE id = :id")->execute(['o' => $nota, 'id' => $financeiroId]);
        sincronizarStatusPagamentoOS($pdo, $financeiroId);
        return buscarFinanceiroPorId($pdo, $financeiroId);
    });
}

/**
 * Lança um recebimento. Regras: forma válida; valor > 0; data válida e não futura; proposta não FATURADA/CANCELADA;
 * valor não pode passar do saldo restante (sobra = lançar só o que falta). Fatura sozinho ao zerar o saldo.
 */
function registrarPagamentoFinanceiro(PDO $pdo, int $financeiroId, string $formaPagamento, float $valor, string $dataPagamento, ?string $observacao, ?int $usuarioId): array {
    $formas = FORMAS_PAGAMENTO;
    if (!in_array($formaPagamento, $formas, true)) {
        throw new RegraNegocioException('forma_pagamento inválida — use uma de: ' . implode(', ', $formas));
    }
    $valor = dinheiro($valor);
    if ($valor <= 0) {
        throw new RegraNegocioException('valor do pagamento precisa ser maior que zero.');
    }
    $dataPagamento = validarData($dataPagamento);
    if ($dataPagamento > date('Y-m-d')) {
        throw new RegraNegocioException('data_pagamento não pode ser futura.');
    }
    if ($observacao !== null && mb_strlen($observacao) > 255) {
        throw new RegraNegocioException('observacao do pagamento: máximo 255 caracteres.');
    }

    return emTransacao($pdo, function () use ($pdo, $financeiroId, $formaPagamento, $valor, $dataPagamento, $observacao, $usuarioId) {
        $fin = buscarFinanceiroPorId($pdo, $financeiroId, true);
        if ($fin['status'] === 'FATURADO') {
            throw new RegraNegocioException("Proposta {$financeiroId} já está FATURADA — abra uma nova proposta para valor adicional.", 409);
        }
        if ($fin['status'] === 'CANCELADO') {
            throw new RegraNegocioException("Proposta {$financeiroId} está CANCELADA.", 409);
        }
        $restante = calcularSaldoFinanceiro($pdo, $financeiroId)['saldo_restante'];
        if ($valor > $restante + TOLERANCIA_CENTAVO) {
            throw new RegraNegocioException('Valor ' . formatarReais($valor) . ' maior que o saldo restante (' . formatarReais($restante) . ').', 422);
        }
        $pdo->prepare(
            'INSERT INTO os_financeiro_pagamentos (financeiro_id, forma_pagamento, valor, data_pagamento, observacao, lancado_por)
             VALUES (:f, :forma, :v, :d, :o, :u)'
        )->execute(['f' => $financeiroId, 'forma' => $formaPagamento, 'v' => $valor, 'd' => $dataPagamento, 'o' => $observacao, 'u' => $usuarioId]);
        $pagamentoId = (int) $pdo->lastInsertId();
        if (is_file(__DIR__ . '/fin_receber_origens.php')) { require_once __DIR__ . '/fin_receber_origens.php'; froPagamentoDaOS($pdo, $pagamentoId, (int) $fin['os_id'], $formaPagamento, $valor, $dataPagamento, $usuarioId); } // 13/11/2026: baixa no contas a receber (caixa, banco, cartão com NSU)

        if (dinheiro($restante - $valor) <= TOLERANCIA_CENTAVO) {
            $pdo->prepare("UPDATE os_financeiro SET status = 'FATURADO', faturado_em = NOW(), faturado_por = :u WHERE id = :id")
                ->execute(['u' => $usuarioId, 'id' => $financeiroId]);
        } else {
            $pdo->prepare("UPDATE os_financeiro SET status = 'EM_NEGOCIACAO' WHERE id = :id AND status = 'PROPOSTA'")->execute(['id' => $financeiroId]);
        }
        $finOs = buscarFinanceiroPorId($pdo, $financeiroId);
        if ($observacao !== 'Pagamento no ato da assinatura') // o pago no ato já aparece no evento da assinatura
        registrarEvento($pdo, (int) $finOs['os_id'], 'RECEBIMENTO', 'Recebimento de ' . formatarReais($valor) . ' (' . $formaPagamento . ')' . (trim((string) $observacao) !== '' ? ' — ' . trim($observacao) : ''), $usuarioId, $valor);
        sincronizarStatusPagamentoOS($pdo, $financeiroId, $usuarioId);
        return ['pagamento_id' => $pagamentoId, 'saldo' => calcularSaldoFinanceiro($pdo, $financeiroId)];
    });
}

/**
 * Estorna um lançamento (não apaga: fica no histórico, sai da soma). Se a proposta estava FATURADA, volta a
 * EM_NEGOCIACAO (ou PROPOSTA se não sobrar pagamento). A NP é re-sincronizada (volta a ABERTA se o saldo reabrir). Quem autoriza (admin)
 * é decidido no endpoint.
 */
function estornarPagamentoFinanceiro(PDO $pdo, int $pagamentoId, string $motivo, ?int $usuarioId): array {
    if (trim($motivo) === '') {
        throw new RegraNegocioException('motivo é obrigatório para estornar.');
    }
    return emTransacao($pdo, function () use ($pdo, $pagamentoId, $motivo, $usuarioId) {
        $stmt = $pdo->prepare('SELECT * FROM os_financeiro_pagamentos WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $pagamentoId]);
        $pag = $stmt->fetch();
        if (!$pag) {
            throw new RegraNegocioException("Pagamento {$pagamentoId} não encontrado.", 404);
        }
        if ((int) $pag['estornado'] === 1) {
            throw new RegraNegocioException('Pagamento já estornado.', 409);
        }
        $fin = buscarFinanceiroPorId($pdo, (int) $pag['financeiro_id'], true);
        if ($fin['status'] === 'CANCELADO') {
            throw new RegraNegocioException('Proposta cancelada — não há o que estornar.', 409);
        }
        $pdo->prepare('UPDATE os_financeiro_pagamentos SET estornado = 1, estornado_em = NOW(), estornado_por = :u, motivo_estorno = :m WHERE id = :id')
            ->execute(['u' => $usuarioId, 'm' => mb_substr(trim($motivo), 0, 255), 'id' => $pagamentoId]);
        if (is_file(__DIR__ . '/fin_receber_origens.php')) { require_once __DIR__ . '/fin_receber_origens.php'; froEstornoDaOS($pdo, $pagamentoId, trim($motivo), $usuarioId); } // 13/11/2026: estorna a baixa do contas a receber junto

        $restam = calcularSaldoFinanceiro($pdo, (int) $fin['id'])['total_pago'] > 0;
        $novo = $restam ? 'EM_NEGOCIACAO' : 'PROPOSTA';
        $pdo->prepare('UPDATE os_financeiro SET status = :s, faturado_em = NULL, faturado_por = NULL WHERE id = :id')->execute(['s' => $novo, 'id' => $fin['id']]);
        registrarEvento($pdo, (int) $fin['os_id'], 'ESTORNO', 'Estorno de ' . formatarReais((float) $pag['valor']) . ' — motivo: ' . trim($motivo), $usuarioId, (float) $pag['valor']);
        sincronizarStatusPagamentoOS($pdo, (int) $fin['id'], $usuarioId);
        return ['pagamento_id' => $pagamentoId, 'saldo' => calcularSaldoFinanceiro($pdo, (int) $fin['id'])];
    });
}

/** Anexa a referência (URL/caminho) de um comprovante. O binário já subiu pelo upload genérico do app. */
function anexarComprovanteFinanceiro(PDO $pdo, int $pagamentoId, string $arquivoUrl, ?int $usuarioId): array {
    $arquivoUrl = trim($arquivoUrl);
    if ($arquivoUrl === '' || mb_strlen($arquivoUrl) > 500 || preg_match('/[\x00-\x1F]/', $arquivoUrl) || preg_match('#^\s*(javascript|data):#i', $arquivoUrl)) {
        throw new RegraNegocioException('arquivo_url inválido.');
    }
    return emTransacao($pdo, function () use ($pdo, $pagamentoId, $arquivoUrl, $usuarioId) {
        $stmt = $pdo->prepare('SELECT estornado FROM os_financeiro_pagamentos WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $pagamentoId]);
        $pag = $stmt->fetch();
        if (!$pag) {
            throw new RegraNegocioException("Pagamento {$pagamentoId} não encontrado.", 404);
        }
        if ((int) $pag['estornado'] === 1) {
            throw new RegraNegocioException('Pagamento estornado — não recebe novo comprovante.', 409);
        }
        $pdo->prepare('INSERT INTO os_financeiro_comprovantes (pagamento_id, arquivo_url, enviado_por) VALUES (:p, :a, :u)')
            ->execute(['p' => $pagamentoId, 'a' => $arquivoUrl, 'u' => $usuarioId]);
        return ['comprovante_id' => (int) $pdo->lastInsertId()];
    });
}

/** Proposta mais recente da OS + pagamentos (inclusive estornados, marcados) + comprovantes + saldo. */
function listarFinanceiroDaOS(PDO $pdo, int $osId): ?array {
    $stmt = $pdo->prepare('SELECT * FROM os_financeiro WHERE os_id = :os ORDER BY id DESC LIMIT 1');
    $stmt->execute(['os' => $osId]);
    $fin = $stmt->fetch();
    if (!$fin) {
        return null;
    }
    $pags = $pdo->prepare('SELECT * FROM os_financeiro_pagamentos WHERE financeiro_id = :id ORDER BY data_pagamento, id');
    $pags->execute(['id' => $fin['id']]);
    $pagamentos = $pags->fetchAll();
    foreach ($pagamentos as &$p) {
        $c = $pdo->prepare('SELECT * FROM os_financeiro_comprovantes WHERE pagamento_id = :id ORDER BY enviado_em, id');
        $c->execute(['id' => $p['id']]);
        $p['comprovantes'] = $c->fetchAll();
    }
    unset($p);
    return ['financeiro' => $fin, 'pagamentos' => $pagamentos, 'saldo' => calcularSaldoFinanceiro($pdo, (int) $fin['id'])];
}

/* =====================================================================
 * PAINEL FINANCEIRO, RELATÓRIO, LINHA DO TEMPO, DEVOLUÇÕES E CONVERSÃO (revisão 6)
 * ===================================================================== */

const GRUPOS_TIPO_OS = ['PRT', 'SOC', 'PRF', 'DIF_SOC', 'DIF_PRF', 'COR'];

/** Filtros comuns: período (data da OS), agente, tipo e convênio. O agente sempre fica restrito às próprias OS. */
function filtrosOS(array $f, array $usuario, bool $incluirCanceladas = false): array {
    $ini = validarData((string) ($f['data_inicio'] ?? date('Y-m-01')));
    $fim = validarData((string) ($f['data_fim'] ?? date('Y-m-d')));
    if ($fim < $ini) {
        throw new RegraNegocioException('A data final do período é anterior à inicial.');
    }
    // OS cancelada (atendimento ou pedido de coroa cancelado) só aparece no painel do Financeiro, com a tarja (13/10/2026).
    $w = $incluirCanceladas ? ['1 = 1'] : ["o.status <> 'CANCELADA'"];
    $p = [];
    if (!podeVerTodasOS($usuario)) {
        $w[] = 'o.criado_por = :agente';
        $p['agente'] = (int) $usuario['id'];
    } elseif (!empty($f['agente_id'])) {   // um ou vários (separados por vírgula)
        $ids = array_values(array_unique(array_filter(array_map('intval', explode(',', (string) $f['agente_id'])))));
        if ($ids) {
            $w[] = 'o.criado_por IN (' . implode(',', $ids) . ')';
        }
    }
    $tipo = strtoupper(trim((string) ($f['tipo'] ?? '')));
    $cond = [
        'PRT' => "o.tipo = 'ATENDIMENTO' AND o.natureza = 'PARTICULAR' AND (o.convenio IS NULL OR o.convenio LIKE 'PARTICULAR%')",
        'SOC' => "o.natureza = 'CONVENIO' AND o.convenio LIKE 'ASSOCIADO%'",
        'PRF' => "o.natureza = 'CONVENIO' AND o.convenio LIKE 'PREFEITURA%'",
        'DIF_SOC' => "o.tipo = 'ATENDIMENTO' AND o.natureza = 'PARTICULAR' AND o.convenio LIKE 'ASSOCIADO%'",
        'DIF_PRF' => "o.natureza = 'PARTICULAR' AND o.convenio LIKE 'PREFEITURA%'",
        'COR' => "o.tipo = 'COROA' AND (o.convenio IS NULL OR o.convenio NOT LIKE 'PREFEITURA%')",
    ];
    if ($tipo !== '') {
        $tipos = array_filter(array_map('trim', explode(',', $tipo)));
        foreach ($tipos as $t) {
            if (!isset($cond[$t])) {
                throw new RegraNegocioException('tipo inválido — use ' . implode(', ', GRUPOS_TIPO_OS) . '.');
            }
        }
        $w[] = '((' . implode(') OR (', array_map(fn($t) => $cond[$t], $tipos)) . '))';
    }
    if (!empty($f['convenio'])) {   // um ou vários (separados por vírgula)
        $convs = array_values(array_unique(array_filter(array_map(fn ($c) => strtoupper(trim($c)), explode(',', (string) $f['convenio'])))));
        $marcas = [];
        foreach ($convs as $i => $c) {
            $marcas[] = ':conv' . $i;
            $p['conv' . $i] = $c;
        }
        if ($marcas) {
            $w[] = 'o.convenio IN (' . implode(',', $marcas) . ')';
        }
    }
    // Situação (um ou várias): ABERTA (rascunho e valores confirmados), AGUARDANDO_ASSINATURA, FECHADA (assinada), CONVERTIDA, PAGA.
    if (trim((string) ($f['situacao'] ?? '')) !== '') {
        $condSit = [
            'ABERTA' => "o.status = 'ABERTA'",
            'AGUARDANDO_ASSINATURA' => "o.status = 'AGUARDANDO_ASSINATURA'",
            'FECHADA' => "o.status = 'FECHADA'",                               // venda fechada (concluída ou assinada)
            'CONCLUIDA' => "o.status = 'FECHADA' AND o.assinada_em IS NULL",   // concluída, ainda sem assinatura
            'ASSINADA' => "o.status = 'FECHADA' AND o.assinada_em IS NOT NULL",
            'CONVERTIDA' => "o.status = 'CONVERTIDA'",
            'PAGA' => "o.status_pagamento = 'PAGO'",
            'CANCELADA' => "o.status = 'CANCELADA'",   // só o Financeiro lista as canceladas (13/10/2026)
        ];
        $sits = array_values(array_unique(array_filter(array_map(fn ($x) => strtoupper(trim($x)), explode(',', (string) $f['situacao'])))));
        foreach ($sits as $x) {
            if (!isset($condSit[$x])) {
                throw new RegraNegocioException('situacao inválida — use ' . implode(', ', array_keys($condSit)) . '.');
            }
        }
        if ($sits) {
            $w[] = '((' . implode(') OR (', array_map(fn ($x) => $condSit[$x], $sits)) . '))';
        }
    }
    return ['where' => implode(' AND ', $w), 'params' => $p, 'ini' => $ini, 'fim' => $fim];
}

/** Dados de exibição (falecido/responsável) para listas — usa os leitores de os_documentos.php quando carregados. */
function dadosExibicaoOS(PDO $pdo, array $os): array {
    if ($os['tipo'] === 'COROA') {
        $ped = function_exists('carregarPedidoCoroa') ? carregarPedidoCoroa($pdo, $os['coroa_pedido_id'] !== null ? (int) $os['coroa_pedido_id'] : null) : null;
        return ['falecido' => $ped['falecido'] ?? null, 'responsavel' => $ped['solicitante'] ?? null];
    }
    $at = function_exists('carregarAtendimento') ? carregarAtendimento($pdo, $os['atendimento_id'] !== null ? (int) $os['atendimento_id'] : null) : null;
    return ['falecido' => $at['falecido'] ?? null, 'responsavel' => $at['nome_responsavel'] ?? null];
}

function linhaPainelOS(PDO $pdo, array $o): array {
    $recebido = valorJaPagoDaOS($pdo, (int) $o['id']);
    $grupo = grupoTipoOS($o);
    $cobravel = in_array($grupo, ['PRT', 'DIF_SOC', 'DIF_PRF', 'COR', 'PRF'], true) && $o['status'] !== 'CONVERTIDA';
    $assinadaOuContrato = $o['status'] === 'FECHADA' || $grupo === 'PRF';
    $np = $pdo->prepare('SELECT valor, status, devolvida_em FROM os_np WHERE os_id = :id');
    $np->execute(['id' => $o['id']]);
    $npRow = $np->fetch() ?: null;
    return [
        'os_id' => (int) $o['id'], 'numero_os' => $o['numero_os'], 'tipo' => $grupo, 'tipo_rotulo' => rotuloTipoOS($o), 'convenio' => $o['convenio'],
        'status' => $o['status'], 'status_pagamento' => $o['status_pagamento'], 'agente_id' => $o['criado_por'] !== null ? (int) $o['criado_por'] : null,
        'agente' => ($o['origem_venda'] ?? null) === 'SITE' ? 'Site (online)' : nomeUsuario($pdo, $o['criado_por'] !== null ? (int) $o['criado_por'] : null),
        'criado_em' => $o['criado_em'], 'assinada_em' => $o['assinada_em'], 'concluida_em' => $o['concluida_em'] ?? null, 'origem_venda' => $o['origem_venda'] ?? null,
        'valor_total' => $grupo === 'SOC' ? valorCobertoPeloPlano($pdo, (int) $o['id']) : dinheiro((float) $o['valor_total']),
        'recebido' => $recebido,
        'saldo' => ($cobravel && $assinadaOuContrato && $o['status'] !== 'CANCELADA') ? max(0.0, dinheiro((float) $o['valor_total'] - $recebido)) : null,
        // OS cancelada (13/10/2026): reembolso ao cliente, quando houve recebimento
        'reembolso_valor' => isset($o['reembolso_valor']) && $o['reembolso_valor'] !== null ? dinheiro((float) $o['reembolso_valor']) : null,
        'reembolso_status' => $o['reembolso_status'] ?? null,
        'nota_promissoria' => $npRow ? ['valor' => dinheiro((float) $npRow['valor']), 'status' => $npRow['status'], 'devolvida' => $npRow['devolvida_em'] !== null] : null,
        'credito_a_devolver' => ($o['credito_devolvido_em'] === null && (float) $o['credito_a_devolver'] > 0) ? dinheiro((float) $o['credito_a_devolver']) : 0.0,
        'os_origem_id' => $o['os_origem_id'] !== null ? (int) $o['os_origem_id'] : null,
    ] + dadosExibicaoOS($pdo, $o);
}

/**
 * Filtro "Pagamento" do Financeiro (08/10/2026), um ou vários separados por vírgula — usa o mesmo saldo do cartão "A receber":
 *  A_RECEBER   venda (assinada, ou contrato da Prefeitura) com saldo a receber (inclui as recebidas em parte);
 *  PARCIAL     recebida em parte (já entrou algum valor e ainda há saldo);
 *  QUITADA     venda sem saldo.
 * OS do plano (Soc) e convertidas não entram em nenhum.
 */
function filtrarPorPagamento(array $linhas, string $pagamento): array {
    $opcoes = array_values(array_unique(array_filter(array_map(fn ($x) => strtoupper(trim($x)), explode(',', $pagamento)))));
    if (!$opcoes) {
        return $linhas;
    }
    $validas = ['A_RECEBER', 'PARCIAL', 'QUITADA'];
    foreach ($opcoes as $x) {
        if (!in_array($x, $validas, true)) {
            throw new RegraNegocioException('pagamento inválido — use ' . implode(', ', $validas) . '.');
        }
    }
    return array_values(array_filter($linhas, function (array $l) use ($opcoes): bool {
        if ($l['status'] === 'CONVERTIDA' || $l['status'] === 'CANCELADA' || $l['tipo'] === 'SOC' || $l['saldo'] === null) {
            return false;
        }
        $saldo = (float) $l['saldo'];
        $recebido = (float) $l['recebido'];
        foreach ($opcoes as $x) {
            if (($x === 'A_RECEBER' && $saldo > TOLERANCIA_CENTAVO)
                || ($x === 'PARCIAL' && $saldo > TOLERANCIA_CENTAVO && $recebido > TOLERANCIA_CENTAVO)
                || ($x === 'QUITADA' && $saldo <= TOLERANCIA_CENTAVO)) {
                return true;
            }
        }
        return false;
    }));
}

/** Painel do financeiro (e "Minhas OS" do agente, que já chega filtrado pelas próprias OS). */
function painelFinanceiro(PDO $pdo, array $f, array $usuario): array {
    sincronizarOSDeCoroa($pdo, (int) $usuario['id']);   // pedidos de coroa novos (site e venda direta) ganham a OS Cor — falha não impede o painel
    // Financeiro: a OS cancelada fica na lista com a tarja "Cancelada" e não entra nos cartões. Minhas OS (cargo __agente__): não aparece.
    $incluirCanceladas = ($usuario['cargo'] ?? '') !== '__agente__';
    $fl = filtrosOS($f, $usuario, $incluirCanceladas);
    $stmt = $pdo->prepare("SELECT o.* FROM os_ordens o WHERE {$fl['where']} AND DATE(o.criado_em) BETWEEN :ini AND :fim ORDER BY o.numero_seq DESC, o.id DESC");
    $stmt->execute($fl['params'] + ['ini' => $fl['ini'], 'fim' => $fl['fim']]);
    $linhas = array_map(fn($o) => linhaPainelOS($pdo, $o), $stmt->fetchAll());
    $linhas = filtrarPorPagamento($linhas, (string) ($f['pagamento'] ?? ''));

    $card = ['total_vendas' => 0.0, 'vendas_por_tipo' => array_fill_keys(['PRT', 'DIF_SOC', 'DIF_PRF', 'COR', 'PRF'], 0.0), 'a_receber' => 0.0,
             'nps_abertas' => ['quantidade' => 0, 'valor' => 0.0], 'aguardando_assinatura' => ['quantidade' => 0, 'valor' => 0.0],
             'creditos_a_devolver' => 0.0, 'nps_a_devolver' => 0, 'cobertura_planos' => 0.0];
    foreach ($linhas as $l) {
        if ($l['status'] === 'CONVERTIDA' || $l['status'] === 'CANCELADA') {
            continue;
        }
        if ($l['tipo'] === 'SOC') {
            $card['cobertura_planos'] = dinheiro($card['cobertura_planos'] + $l['valor_total']);
            continue;
        }
        if ($l['status'] === 'FECHADA' || $l['tipo'] === 'PRF') {
            $card['total_vendas'] = dinheiro($card['total_vendas'] + $l['valor_total']);
            $card['vendas_por_tipo'][$l['tipo']] = dinheiro($card['vendas_por_tipo'][$l['tipo']] + $l['valor_total']);
            $card['a_receber'] = dinheiro($card['a_receber'] + (float) $l['saldo']);
        } elseif (in_array($l['status'], ['ABERTA', 'AGUARDANDO_ASSINATURA'], true) && $l['valor_total'] > 0) {
            $card['aguardando_assinatura']['quantidade']++;
            $card['aguardando_assinatura']['valor'] = dinheiro($card['aguardando_assinatura']['valor'] + $l['valor_total']);
        }
        if ($l['nota_promissoria'] && $l['nota_promissoria']['status'] === 'ABERTA') {
            $card['nps_abertas']['quantidade']++;
            $card['nps_abertas']['valor'] = dinheiro($card['nps_abertas']['valor'] + $l['nota_promissoria']['valor']);
        }
        $card['creditos_a_devolver'] = dinheiro($card['creditos_a_devolver'] + $l['credito_a_devolver']);
    }
    foreach ($linhas as $l) {   // NP baixada/substituída ainda não devolvida (inclui OS convertidas)
        if ($l['nota_promissoria'] && in_array($l['nota_promissoria']['status'], ['BAIXADA', 'SUBSTITUIDA'], true) && !$l['nota_promissoria']['devolvida']) {
            $card['nps_a_devolver']++;
        }
    }
    // Recebido no período: pela data do recebimento (mesmos filtros de agente/tipo/convênio, sem o filtro de data da OS).
    $rec = $pdo->prepare("SELECT COALESCE(SUM(p.valor), 0) FROM os_financeiro_pagamentos p JOIN os_financeiro f ON f.id = p.financeiro_id JOIN os_ordens o ON o.id = f.os_id
                          WHERE {$fl['where']} AND p.estornado = 0 AND f.status <> 'CANCELADO' AND p.data_pagamento BETWEEN :ini AND :fim");
    $rec->execute($fl['params'] + ['ini' => $fl['ini'], 'fim' => $fl['fim']]);
    $card['recebido_no_periodo'] = dinheiro((float) $rec->fetchColumn());
    return ['periodo' => ['inicio' => $fl['ini'], 'fim' => $fl['fim']], 'indicadores' => $card, 'os' => $linhas];
}

/** Relatório de atendimentos (Particular, Dif e Coroa) assinados no período, SEM os valores de translado. */
function relatorioAtendimentos(PDO $pdo, array $f, array $usuario, bool $pelaDataDaOS = false): array {
    if (empty($f['tipo'])) {
        $f['tipo'] = 'PRT,DIF_SOC,DIF_PRF,COR';
    }
    foreach (explode(',', strtoupper((string) $f['tipo'])) as $t) {
        if (!in_array(trim($t), ['PRT', 'DIF_SOC', 'DIF_PRF', 'COR'], true)) {
            throw new RegraNegocioException('O relatório de atendimentos é de Particular, Dif e Coroa (tipo PRT, DIF_SOC, DIF_PRF ou COR).');
        }
    }
    $fl = filtrosOS($f, $usuario);
    // Sem situação escolhida: só as OS assinadas (FECHADA), como sempre foi. Com situação: as escolhidas (ex.: também as abertas).
    $soFechadas = trim((string) ($f['situacao'] ?? '')) === '' ? " AND o.status = 'FECHADA'" : " AND o.status <> 'CONVERTIDA'";
    $colConclusao = colunaExisteOS($pdo, 'os_ordens', 'concluida_em') ? 'o.concluida_em, ' : '';   // data da venda = conclusão
    // Cálculo de Bônus: data da venda (conclusão). Os outros relatórios (16/10/2026): data da OS (abertura), nunca a do pagamento.
    $colData = $pelaDataDaOS ? 'o.criado_em' : "COALESCE({$colConclusao}o.assinada_em, o.criado_em)";
    $stmt = $pdo->prepare("SELECT o.*, (SELECT COALESCE(SUM(i.valor_final), 0) FROM os_itens i WHERE i.os_id = o.id AND i.categoria = 'TRANSLADO') AS translado
                           FROM os_ordens o WHERE {$fl['where']}{$soFechadas} AND DATE({$colData}) BETWEEN :ini AND :fim
                           ORDER BY o.numero_seq, o.id");
    $stmt->execute($fl['params'] + ['ini' => $fl['ini'], 'fim' => $fl['fim']]);
    $linhas = [];
    $tot = [];
    $geral = ['quantidade' => 0, 'valor_total' => 0.0, 'translado' => 0.0, 'valor_sem_translado' => 0.0];
    foreach ($stmt->fetchAll() as $o) {
        $grupo = grupoTipoOS($o);
        $translado = dinheiro((float) $o['translado']);
        $total = dinheiro((float) $o['valor_total']);
        $sem = max(0.0, dinheiro($total - $translado));
        $linhas[] = ['os_id' => (int) $o['id'], 'numero_os' => $o['numero_os'], 'tipo' => $grupo, 'tipo_rotulo' => rotuloTipoOS($o), 'status' => $o['status'],
                     'status_pagamento' => $o['status_pagamento'], 'assinada_em' => $o['assinada_em'],
                     'data' => substr((string) ($pelaDataDaOS ? $o['criado_em'] : ($o['concluida_em'] ?? $o['assinada_em'] ?? $o['criado_em'])), 0, 10),
                     'agente_id' => $o['criado_por'] !== null ? (int) $o['criado_por'] : null,
                     'agente' => nomeUsuario($pdo, $o['criado_por'] !== null ? (int) $o['criado_por'] : null), 'valor_total' => $total, 'translado' => $translado,
                     'valor_sem_translado' => $sem] + dadosExibicaoOS($pdo, $o);
        $tot[$grupo] = $tot[$grupo] ?? ['quantidade' => 0, 'valor_sem_translado' => 0.0];
        $tot[$grupo]['quantidade']++;
        $tot[$grupo]['valor_sem_translado'] = dinheiro($tot[$grupo]['valor_sem_translado'] + $sem);
        $geral['quantidade']++;
        $geral['valor_total'] = dinheiro($geral['valor_total'] + $total);
        $geral['translado'] = dinheiro($geral['translado'] + $translado);
        $geral['valor_sem_translado'] = dinheiro($geral['valor_sem_translado'] + $sem);
    }
    return ['periodo' => ['inicio' => $fl['ini'], 'fim' => $fl['fim']], 'linhas' => $linhas, 'totais_por_tipo' => $tot, 'total_geral' => $geral,
            'por_agente' => totaisPorAgenteRelatorio($linhas, ['valor_total', 'translado', 'valor_sem_translado'])];
}

/* =====================================================================
   RELATÓRIOS DA OS (16/10/2026) — Relatório Particular (Cálculo de Bônus e Completo), Relatório Prefeitura (Prestação de
   Contas) e Relatório Sócio (Acompanhamento). Só leitura. Mesmos filtros do Financeiro (filtrosOS) e mesma área.
   ===================================================================== */

/** Soma por agente (ordem: maior total primeiro). $campos = chaves numéricas das linhas a somar. */
function totaisPorAgenteRelatorio(array $linhas, array $campos): array {
    $ag = [];
    foreach ($linhas as $l) {
        $k = (string) ($l['agente_id'] ?? '') . '|' . (string) ($l['agente'] ?? '—');
        if (!isset($ag[$k])) {
            $ag[$k] = ['agente_id' => $l['agente_id'] ?? null, 'agente' => $l['agente'] ?? '—', 'quantidade' => 0] + array_fill_keys($campos, 0.0);
        }
        $ag[$k]['quantidade']++;
        foreach ($campos as $c) {
            $ag[$k][$c] = dinheiro($ag[$k][$c] + (float) ($l[$c] ?? 0));
        }
    }
    $out = array_values($ag);
    usort($out, fn ($a, $b) => ($b[$campos[0]] <=> $a[$campos[0]]) ?: strcmp((string) $a['agente'], (string) $b['agente']));
    return $out;
}

/** Relatório Particular - Completo: as mesmas OS do Cálculo de Bônus, com bruto, desconto, recebido, a receber e pagamentos. */
function relatorioParticularCompleto(PDO $pdo, array $f, array $usuario): array {
    $base = relatorioAtendimentos($pdo, $f, $usuario, true);   // pela data da OS
    $temParcelas = colunaExisteOS($pdo, 'os_financeiro_pagamentos', 'parcelas');
    $pg = $pdo->prepare('SELECT p.forma_pagamento, ' . ($temParcelas ? 'p.parcelas' : 'NULL AS parcelas') . ', SUM(p.valor) AS valor
                         FROM os_financeiro_pagamentos p JOIN os_financeiro f ON f.id = p.financeiro_id
                         WHERE f.os_id = :id AND f.status <> \'CANCELADO\' AND p.estornado = 0
                         GROUP BY p.forma_pagamento' . ($temParcelas ? ', p.parcelas' : '') . ' ORDER BY SUM(p.valor) DESC');
    $formas = [];
    $geral = ['quantidade' => 0, 'bruto' => 0.0, 'desconto' => 0.0, 'valor_total' => 0.0, 'translado' => 0.0, 'recebido' => 0.0, 'a_receber' => 0.0];
    foreach ($base['linhas'] as &$l) {
        $total = (float) $l['valor_total'];
        $desc = dinheiro((float) (resumoDescontoOS($pdo, (int) $l['os_id'])['reducao'] ?? 0));
        $l['desconto'] = $desc;
        $l['bruto'] = dinheiro($total + $desc);   // o acréscimo não aparece: bruto = total + desconto
        $l['recebido'] = valorJaPagoDaOS($pdo, (int) $l['os_id']);
        $l['a_receber'] = max(0.0, dinheiro($total - $l['recebido']));
        $pg->execute(['id' => $l['os_id']]);
        $l['pagamentos'] = [];
        foreach ($pg->fetchAll() as $r) {
            $rot = rotuloFormaPagamento((string) $r['forma_pagamento']) . ((int) ($r['parcelas'] ?? 0) > 1 ? ' ' . (int) $r['parcelas'] . 'x' : '');
            $l['pagamentos'][] = ['forma' => $rot, 'valor' => dinheiro((float) $r['valor'])];
            $chave = rotuloFormaPagamento((string) $r['forma_pagamento']);
            $formas[$chave] = dinheiro(($formas[$chave] ?? 0) + (float) $r['valor']);
        }
        foreach (['bruto', 'desconto', 'valor_total', 'translado', 'recebido', 'a_receber'] as $c) {
            $geral[$c] = dinheiro($geral[$c] + (float) $l[$c]);
        }
        $geral['quantidade']++;
    }
    unset($l);
    arsort($formas);
    $base['total_completo'] = $geral;
    $base['por_forma'] = array_map(fn ($k, $v) => ['forma' => $k, 'valor' => $v], array_keys($formas), array_values($formas));
    $base['por_agente_completo'] = totaisPorAgenteRelatorio($base['linhas'], ['valor_total', 'bruto', 'desconto', 'recebido', 'a_receber']);
    return $base;
}

/**
 * Relatório Prefeitura - Prestação de Contas: OS da Prefeitura (Prf) do período, pelos valores de contrato da OS
 * (composicaoContratoOS — a mesma conta do Financeiro). Resumo por serviço (pacote de atendimento, tanatopraxia,
 * translado por km e cada pacote de coroa), relação de atendimentos e relação de translados (origem e destino).
 * A composição interna dos pacotes não entra (é configuração interna). Contém valores de contrato: área do Financeiro.
 */
function relatorioPrestacaoPrefeitura(PDO $pdo, array $f, array $usuario): array {
    $f['tipo'] = 'PRF';
    unset($f['situacao']);
    $fl = filtrosOS($f, $usuario);
    $stmt = $pdo->prepare("SELECT o.* FROM os_ordens o WHERE {$fl['where']} AND o.status NOT IN ('CANCELADA', 'CONVERTIDA')
                           AND DATE(o.criado_em) BETWEEN :ini AND :fim ORDER BY o.criado_em, o.numero_seq, o.id");
    $stmt->execute($fl['params'] + ['ini' => $fl['ini'], 'fim' => $fl['fim']]);
    $ordemPac = [];
    try {
        $temOrdem = colunaExisteOS($pdo, 'os_convenio_pacotes', 'ordem');
        foreach ($pdo->query('SELECT id, nome' . ($temOrdem ? ', ordem' : ', 0 AS ordem') . ' FROM os_convenio_pacotes')->fetchAll() as $r) {
            $ordemPac[(string) $r['nome']] = (int) $r['ordem'];
        }
    } catch (Throwable $e) {
        $ordemPac = [];
    }
    $servicos = [];
    $linhas = [];
    $translados = [];
    $convs = [];
    $tot = ['quantidade' => 0, 'atendimentos' => 0, 'servico' => 0.0, 'tanatopraxia' => 0.0, 'translado' => 0.0, 'translado_km' => 0.0, 'coroa' => 0.0, 'coroas' => 0, 'tanatos' => 0, 'translados' => 0, 'valor_total' => 0.0];
    $somar = function (string $chave, string $grupo, string $nome, string $unid, float $qtd, float $valor) use (&$servicos) {
        if (!isset($servicos[$chave])) {
            $servicos[$chave] = ['grupo' => $grupo, 'descricao' => $nome, 'unidade' => $unid, 'quantidade' => 0.0, 'total' => 0.0];
        }
        $servicos[$chave]['quantidade'] += $qtd;
        $servicos[$chave]['total'] = dinheiro($servicos[$chave]['total'] + $valor);
    };
    // Só os itens do contrato do convênio, pelo valor da tabela do convênio (19/10/2026): pacote, tanatopraxia, translado (km) e
    // pacote de coroa. Item de diferença (pago pela família, OS Dif) e itens sem valor de contrato não entram — diferença é Particular.
    $itQ = $pdo->prepare("SELECT * FROM os_itens WHERE os_id = :id AND valor_contrato_item IS NOT NULL AND COALESCE(tipo_item, '') <> 'DIFERENCA'
                          AND categoria IN ('TANATOPRAXIA', 'TANATOPRAXIA_AVANCADA', 'EMBALSAMAMENTO', 'TRANSLADO', 'COROA') ORDER BY id");
    $pacQ = $pdo->prepare('SELECT nome FROM os_convenio_pacotes WHERE id = :id');
    // Coroa do atendimento só entra se a Prefeitura autorizou (campo do atendimento). OS de coroa avulsa da Prefeitura já nasce autorizada.
    $coroaAut = function (?int $atendimentoId) use ($pdo): bool {
        if (!$atendimentoId) {
            return false;
        }
        try {
            $q = $pdo->prepare('SELECT coroa_autorizada_prefeitura FROM sepultamentos WHERE id = :id');
            $q->execute(['id' => $atendimentoId]);
            return simNao((string) $q->fetchColumn());
        } catch (Throwable $e) {
            return true;   // sem a coluna: vale o que está na OS
        }
    };
    $coroaDoConv = [];
    $nomeCoroa = function (string $conv, int $pid) use ($pdo, &$coroaDoConv): string {
        if (!array_key_exists($conv, $coroaDoConv)) {
            $coroaDoConv[$conv] = [];
            try {
                $c = $pdo->prepare('SELECT * FROM convenios WHERE UPPER(os_codigo) = :c LIMIT 1');
                $c->execute(['c' => strtoupper($conv)]);
                if ($row = $c->fetch()) {
                    $coroaDoConv[$conv] = pacotesDeCoroa($pdo, $row);
                }
            } catch (Throwable $e) {
                $coroaDoConv[$conv] = [];
            }
        }
        $n = $coroaDoConv[$conv] ? (string) (contratoDaCoroa($coroaDoConv[$conv], $pid)['pacote'] ?? '') : '';
        return $n !== '' ? $n : 'Coroa de flores';
    };
    $todasOS = $stmt->fetchAll();
    $semContrato = [];   // conferência: OS do período que ficaram fora (nada do contrato)
    foreach ($todasOS as $o) {
        $convs[strtoupper((string) $o['convenio'])] = rotuloTipoOS(['numero_os' => $o['numero_os'], 'convenio' => $o['convenio'], 'natureza' => 'CONVENIO', 'tipo' => 'ATENDIMENTO']);
        $l = ['os_id' => (int) $o['id'], 'numero_os' => $o['numero_os'], 'tipo_os' => $o['tipo'], 'status' => $o['status'], 'status_pagamento' => $o['status_pagamento'],
              'assinada_em' => $o['assinada_em'], 'data' => substr((string) $o['criado_em'], 0, 10), 'convenio' => $o['convenio'],
              'agente_id' => $o['criado_por'] !== null ? (int) $o['criado_por'] : null, 'agente' => nomeUsuario($pdo, $o['criado_por'] !== null ? (int) $o['criado_por'] : null),
              'servico' => null, 'valor_servico' => 0.0, 'tanatopraxia' => 0.0, 'translado' => 0.0, 'translado_km' => 0.0, 'coroas' => [], 'valor_coroas' => 0.0,
              'valor_total' => 0.0] + dadosExibicaoOS($pdo, $o);
        // 1) pacote do convênio (valor fechado da tabela do convênio)
        $vPac = dinheiro((float) ($o['valor_pacote'] ?? 0));
        if ($o['pacote_id'] !== null || $vPac > 0) {
            $nome = 'Pacote';
            if ($o['pacote_id'] !== null) {
                $pacQ->execute(['id' => (int) $o['pacote_id']]);
                $nome = (string) ($pacQ->fetchColumn() ?: 'Pacote');
            }
            if ($o['tipo'] === 'COROA') {   // OS de coroa avulsa da Prefeitura: o pacote é a coroa
                if ($vPac > 0) {
                    $l['coroas'][] = ['nome' => $nome, 'quantidade' => 1, 'valor' => $vPac];
                    $l['valor_coroas'] = dinheiro($l['valor_coroas'] + $vPac);
                    $somar('COROA|' . $nome, 'COROA', $nome, 'UNID', 1, $vPac);
                    $tot['coroas']++;
                }
            } else {
                $l['servico'] = $nome;
                $l['valor_servico'] = $vPac;
                $somar('PACOTE|' . $nome, 'PACOTE', $nome, 'UNID', 1, $vPac);
            }
        }
        // 2) serviços do contrato com valor próprio
        $itQ->execute(['id' => $o['id']]);
        $coroasOS = [];
        $coroaOk = $o['tipo'] === 'COROA' || $coroaAut($o['atendimento_id'] !== null ? (int) $o['atendimento_id'] : null);
        foreach ($itQ->fetchAll() as $it) {
            $v = dinheiro((float) $it['valor_contrato_item']);
            $cat = (string) $it['categoria'];
            if ($cat === 'TRANSLADO') {
                $km = (float) $it['translado_km'];
                $l['translado'] = dinheiro($l['translado'] + $v);
                $l['translado_km'] = round($l['translado_km'] + $km, 1);
                $somar('TRANSLADO', 'TRANSLADO', 'Translado', 'KM', $km, $v);
                $translados[] = ['os_id' => $l['os_id'], 'numero_os' => $l['numero_os'], 'data' => $l['data'], 'falecido' => $l['falecido'] ?? null,
                                 'origem' => trim((string) $it['translado_origem']), 'destino' => trim((string) $it['translado_destino']), 'km' => round($km, 1),
                                 'valor_km' => $km > 0 ? dinheiro($v / $km) : null, 'valor' => $v];
                $tot['translados']++;
            } elseif ($cat === 'COROA') {
                if (!$coroaOk) {
                    continue;   // coroa não autorizada pela Prefeitura: é da família (Particular)
                }
                $nome = $nomeCoroa((string) $o['convenio'], (int) $it['produto_id']);
                $coroasOS[$nome] = $coroasOS[$nome] ?? ['nome' => $nome, 'quantidade' => 0, 'valor' => 0.0];
                $coroasOS[$nome]['quantidade'] += max(1, (int) $it['quantidade']);
                $coroasOS[$nome]['valor'] = dinheiro($coroasOS[$nome]['valor'] + $v);
                $l['valor_coroas'] = dinheiro($l['valor_coroas'] + $v);
                $somar('COROA|' . $nome, 'COROA', $nome, 'UNID', max(1, (int) $it['quantidade']), $v);
                $tot['coroas'] += max(1, (int) $it['quantidade']);
            } else {   // tanatopraxia (normal, avançada ou embalsamamento: o convênio paga o valor da tanatopraxia do contrato)
                $l['tanatopraxia'] = dinheiro($l['tanatopraxia'] + $v);
                $somar('TANATO', 'TANATOPRAXIA', 'Tanatopraxia', 'UNID', 1, $v);
                $tot['tanatos']++;
            }
        }
        $l['coroas'] = array_values($coroasOS) ?: $l['coroas'];
        $l['valor_total'] = dinheiro($l['valor_servico'] + $l['tanatopraxia'] + $l['translado'] + $l['valor_coroas']);
        if ($l['valor_total'] <= 0 && $l['servico'] === null && !$l['coroas']) {
            $semContrato[] = $o['numero_os'];
            continue;   // OS sem nada do contrato: fora da prestação de contas
        }
        $tot['quantidade']++;
        if ($o['tipo'] === 'ATENDIMENTO') {
            $tot['atendimentos']++;
        }
        foreach (['servico' => 'valor_servico', 'tanatopraxia' => 'tanatopraxia', 'translado' => 'translado', 'coroa' => 'valor_coroas', 'valor_total' => 'valor_total'] as $k => $c) {
            $tot[$k] = dinheiro($tot[$k] + (float) $l[$c]);
        }
        $tot['translado_km'] = round($tot['translado_km'] + $l['translado_km'], 1);
        $linhas[] = $l;
    }
    // Ordem do resumo: pacotes de atendimento (ordem do cadastro), tanatopraxia, translado, outros, pacotes de coroa.
    $peso = ['PACOTE' => 0, 'TANATOPRAXIA' => 1, 'TRANSLADO' => 2, 'OUTRO' => 3, 'COROA' => 4];
    $lista = array_values($servicos);
    usort($lista, fn ($a, $b) => ($peso[$a['grupo']] <=> $peso[$b['grupo']]) ?: (($ordemPac[$a['descricao']] ?? 999) <=> ($ordemPac[$b['descricao']] ?? 999)) ?: strcmp($a['descricao'], $b['descricao']));
    foreach ($lista as $i => &$sv) {
        $sv['item'] = $i + 1;
        $sv['quantidade'] = $sv['unidade'] === 'KM' ? round($sv['quantidade'], 1) : (int) round($sv['quantidade']);
        $sv['valor_unitario'] = $sv['quantidade'] > 0 ? dinheiro($sv['total'] / $sv['quantidade']) : 0.0;
    }
    unset($sv);
    return ['periodo' => ['inicio' => $fl['ini'], 'fim' => $fl['fim']], 'convenios' => array_values($convs), 'resumo_servicos' => $lista,
            'linhas' => $linhas, 'translados' => $translados, 'total_geral' => $tot,
            'conferencia' => ['os_no_periodo' => count($todasOS), 'fora_por_nao_ter_item_do_contrato' => $semContrato]];
}

/**
 * Relatório Coroas: todas as coroas (itens COROA) das OS do período, pela data da OS — avulsa (OS de Coroa), no atendimento
 * (Particular e Dif), plano do sócio e Prefeitura. Natural/artificial pela categoria do produto no estoque.
 * Cobrado: família = valor final do item; Prefeitura = valor de contrato; plano = coberta (sem valor).
 * Custo: custo médio gravado na baixa do estoque (só artificiais têm baixa; naturais vêm sem custo).
 */
function relatorioCoroas(PDO $pdo, array $f, array $usuario): array {
    unset($f['tipo'], $f['situacao']);
    $fl = filtrosOS($f, $usuario);
    $base = "FROM os_ordens o JOIN os_itens i ON i.os_id = o.id LEFT JOIN est_produto p ON p.id = i.produto_id %s
             WHERE {$fl['where']} AND o.status NOT IN ('CANCELADA', 'CONVERTIDA') AND i.categoria = 'COROA'
               AND DATE(o.criado_em) BETWEEN :ini AND :fim ORDER BY o.criado_em, o.numero_seq, o.id, i.id";
    $campos = 'SELECT o.*, i.id AS item_id, i.produto_id AS item_produto, i.quantidade AS item_qtd, i.valor_final AS item_valor,
                      i.valor_contrato_item AS item_contrato, i.referencia_apenas AS item_ref, i.frase_faixa AS item_faixa, p.nome AS produto_nome';
    $params = $fl['params'] + ['ini' => $fl['ini'], 'fim' => $fl['fim']];
    try {
        $st = $pdo->prepare($campos . ', c.nome AS categoria_nome ' . sprintf($base, 'LEFT JOIN est_categoria c ON c.id = p.categoria_id'));
        $st->execute($params);
    } catch (Throwable $e) {   // sem a tabela de categorias: o tipo sai pelo nome do produto
        $st = $pdo->prepare($campos . ', NULL AS categoria_nome ' . sprintf($base, ''));
        $st->execute($params);
    }
    $temCusto = colunaExisteOS($pdo, 'est_movimento', 'custo_unitario_snapshot') && colunaExisteOS($pdo, 'est_movimento', 'estornado_em');
    $cu = $temCusto ? $pdo->prepare("SELECT custo_unitario_snapshot FROM est_movimento WHERE tipo = 'SAIDA' AND produto_id = :p AND destino_texto = :d
                                     AND estornado_em IS NULL AND custo_unitario_snapshot IS NOT NULL ORDER BY id DESC LIMIT 1") : null;
    $rotOrigem = ['COR' => 'Avulsa', 'PRT' => 'No atendimento', 'DIF_SOC' => 'No atendimento', 'DIF_PRF' => 'No atendimento', 'SOC' => 'Plano do sócio', 'PRF' => 'Prefeitura'];
    $linhas = [];
    $origens = array_fill_keys(['Avulsa', 'No atendimento', 'Plano do sócio', 'Prefeitura'], null);
    $modelos = [];
    $semanas = [];
    $tot = ['quantidade' => 0, 'naturais' => 0, 'artificiais' => 0, 'cobrado_familia' => 0.0, 'cobrado_prefeitura' => 0.0, 'cobrado' => 0.0,
            'plano' => 0, 'custo' => 0.0, 'custo_plano' => 0.0, 'sem_custo' => 0];
    $iniTs = strtotime($fl['ini']);
    foreach ($st->fetchAll() as $r) {
        $grupo = grupoTipoOS($r);
        if ($grupo !== 'PRF' && (int) $r['item_ref'] === 1) {
            continue;   // item só de referência (não é uma coroa a mais)
        }
        $qtd = max(1, (int) $r['item_qtd']);
        $origem = $rotOrigem[$grupo] ?? 'No atendimento';
        if ($grupo === 'PRF') {
            $valor = $r['item_contrato'] !== null ? dinheiro((float) $r['item_contrato'])
                   : ($r['tipo'] === 'COROA' && (float) $r['valor_pacote'] > 0 ? dinheiro((float) $r['valor_pacote']) : null);
            $paga = 'Prefeitura';
        } elseif ($grupo === 'SOC') {
            $valor = null;
            $paga = 'Plano ' . planoDoConvenio((string) $r['convenio']);
        } else {
            $valor = dinheiro((float) $r['item_valor']);
            $paga = 'Família';
        }
        $txtTipo = mb_strtoupper((string) ($r['categoria_nome'] ?? '') . ' ' . (string) $r['produto_nome'], 'UTF-8');
        $tipo = strpos($txtTipo, 'ARTIFICI') !== false ? 'Artificial' : 'Natural';
        $custo = null;
        if ($cu && $r['atendimento_id'] !== null && $r['item_produto'] !== null) {
            $cu->execute(['p' => $r['item_produto'], 'd' => 'Atendimento #' . (int) $r['atendimento_id']]);
            $c = $cu->fetchColumn();
            $custo = $c !== false ? dinheiro((float) $c * $qtd) : null;
        }
        $modelo = trim((string) ($r['produto_nome'] ?? '')) ?: 'Coroa';
        $data = substr((string) $r['criado_em'], 0, 10);
        $l = ['os_id' => (int) $r['id'], 'numero_os' => $r['numero_os'], 'tipo_os' => $grupo, 'status' => $r['status'], 'status_pagamento' => $r['status_pagamento'],
              'assinada_em' => $r['assinada_em'], 'data' => $data, 'origem' => $origem, 'tipo' => $tipo, 'modelo' => $modelo, 'quantidade' => $qtd,
              'faixa' => trim((string) $r['item_faixa']) ?: null, 'paga' => $paga, 'valor' => $valor, 'custo' => $custo,
              'agente_id' => $r['criado_por'] !== null ? (int) $r['criado_por'] : null, 'agente' => nomeUsuario($pdo, $r['criado_por'] !== null ? (int) $r['criado_por'] : null)]
             + dadosExibicaoOS($pdo, $r);
        $linhas[] = $l;
        $o = $origens[$origem] ?? ['origem' => $origem, 'paga' => $grupo === 'SOC' ? 'Plano' : $paga, 'quantidade' => 0, 'naturais' => 0, 'artificiais' => 0, 'cobrado' => 0.0, 'custo' => 0.0];
        $o['quantidade'] += $qtd;
        $o[$tipo === 'Natural' ? 'naturais' : 'artificiais'] += $qtd;
        $o['cobrado'] = dinheiro($o['cobrado'] + (float) $valor);
        $o['custo'] = dinheiro($o['custo'] + (float) $custo);
        $origens[$origem] = $o;
        $km = $tipo . '|' . $modelo;
        $m = $modelos[$km] ?? ['tipo' => $tipo, 'modelo' => $modelo, 'quantidade' => 0, 'com_custo' => 0, 'custo' => 0.0];
        $m['quantidade'] += $qtd;
        if ($custo !== null) {
            $m['com_custo'] += $qtd;
            $m['custo'] = dinheiro($m['custo'] + $custo);
        }
        $modelos[$km] = $m;
        $sem = (int) floor((strtotime($data) - $iniTs) / 604800);
        $semanas[$sem] = $semanas[$sem] ?? ['naturais' => 0, 'artificiais' => 0];
        $semanas[$sem][$tipo === 'Natural' ? 'naturais' : 'artificiais'] += $qtd;
        $tot['quantidade'] += $qtd;
        $tot[$tipo === 'Natural' ? 'naturais' : 'artificiais'] += $qtd;
        if ($paga === 'Família') {
            $tot['cobrado_familia'] = dinheiro($tot['cobrado_familia'] + (float) $valor);
        } elseif ($paga === 'Prefeitura') {
            $tot['cobrado_prefeitura'] = dinheiro($tot['cobrado_prefeitura'] + (float) $valor);
        } else {
            $tot['plano'] += $qtd;
            $tot['custo_plano'] = dinheiro($tot['custo_plano'] + (float) $custo);
        }
        $tot['custo'] = dinheiro($tot['custo'] + (float) $custo);
        if ($custo === null) {
            $tot['sem_custo'] += $qtd;
        }
    }
    $tot['cobrado'] = dinheiro($tot['cobrado_familia'] + $tot['cobrado_prefeitura']);
    $modelos = array_values($modelos);
    usort($modelos, fn ($a, $b) => strcmp($b['tipo'], $a['tipo']) ?: ($b['quantidade'] <=> $a['quantidade']) ?: strcmp($a['modelo'], $b['modelo']));
    foreach ($modelos as &$m) {
        $m['custo_medio'] = $m['com_custo'] > 0 ? dinheiro($m['custo'] / $m['com_custo']) : null;
    }
    unset($m);
    ksort($semanas);
    $porSemana = [];
    foreach ($semanas as $i => $v) {
        $a = date('Y-m-d', $iniTs + $i * 604800);
        $b = min($fl['fim'], date('Y-m-d', $iniTs + $i * 604800 + 6 * 86400));
        $porSemana[] = ['inicio' => $a, 'fim' => $b] + $v;
    }
    return ['periodo' => ['inicio' => $fl['ini'], 'fim' => $fl['fim']], 'linhas' => $linhas, 'por_origem' => array_values(array_filter($origens)),
            'por_modelo' => $modelos, 'por_semana' => $porSemana, 'total_geral' => $tot];
}

/**
 * Relatório Pendências: o que está em aberto HOJE (sem período), agrupado — vendas não concluídas, sem assinatura,
 * a receber, NP a devolver, crédito a devolver e OS da Prefeitura ainda abertas — com os dias parada.
 * Financeiro: todas (filtro de agente opcional). Minhas OS: só as do agente (filtrosOS já restringe).
 */
function relatorioPendencias(PDO $pdo, array $f, array $usuario): array {
    unset($f['situacao'], $f['tipo'], $f['data_inicio'], $f['data_fim'], $f['pagamento']);
    $fl = filtrosOS($f, $usuario);
    $stmt = $pdo->prepare("SELECT o.* FROM os_ordens o WHERE {$fl['where']} AND o.status <> 'CANCELADA' AND (
              o.status IN ('ABERTA', 'AGUARDANDO_ASSINATURA')
              OR (o.status = 'FECHADA' AND (o.assinada_em IS NULL OR COALESCE(o.status_pagamento, '') <> 'PAGO'))
              OR (o.credito_a_devolver > 0 AND o.credito_devolvido_em IS NULL)
              OR EXISTS (SELECT 1 FROM os_np n WHERE n.os_id = o.id AND n.status IN ('BAIXADA', 'SUBSTITUIDA') AND n.devolvida_em IS NULL))
            ORDER BY o.criado_em, o.id");
    $stmt->execute($fl['params']);
    $npQ = $pdo->prepare('SELECT valor, status, baixada_em, devolvida_em FROM os_np WHERE os_id = :id');
    $hoje = date('Y-m-d');
    $dias = function (?string $desde) use ($hoje): ?int {
        if (!$desde) {
            return null;
        }
        return max(0, (int) floor((strtotime($hoje) - strtotime(substr($desde, 0, 10))) / 86400));
    };
    $dm = fn (?string $d) => $d ? date('d/m', strtotime(substr($d, 0, 10))) : '';
    $titulos = ['VENDA_ABERTA' => 'Vendas não concluídas', 'SEM_ASSINATURA' => 'Sem assinatura', 'A_RECEBER' => 'A receber',
                'NP_DEVOLVER' => 'NP a devolver', 'CREDITO_DEVOLVER' => 'Crédito a devolver', 'PREFEITURA_ABERTA' => 'Prefeitura em aberto'];
    $grupos = array_map(fn ($t) => ['titulo' => $t, 'itens' => []], $titulos);
    foreach ($stmt->fetchAll() as $o) {
        $l = linhaPainelOS($pdo, $o);
        $base = ['os_id' => $l['os_id'], 'numero_os' => $l['numero_os'], 'tipo' => $l['tipo'], 'tipo_rotulo' => $l['tipo_rotulo'], 'status' => $l['status'],
                 'status_pagamento' => $l['status_pagamento'], 'assinada_em' => $l['assinada_em'], 'falecido' => $l['falecido'] ?? null,
                 'agente_id' => $l['agente_id'], 'agente' => $l['agente']];
        $add = function (string $g, string $detalhe, float $valor, ?string $desde) use (&$grupos, $base, $dias) {
            $grupos[$g]['itens'][] = $base + ['detalhe' => $detalhe, 'valor' => dinheiro($valor), 'desde' => $desde ? substr($desde, 0, 10) : null, 'dias' => $dias($desde)];
        };
        $grupo = $l['tipo'];
        $aberta = in_array($o['status'], ['ABERTA', 'AGUARDANDO_ASSINATURA'], true);
        $concluida = $o['concluida_em'] ?? $o['assinada_em'] ?? $o['criado_em'];
        if ($grupo === 'PRF' && $aberta) {
            $add('PREFEITURA_ABERTA', $l['tipo_rotulo'], (float) $l['valor_total'], $o['criado_em']);
        } elseif ($grupo !== 'SOC' && $grupo !== 'PRF' && $aberta && (float) $l['valor_total'] > 0) {
            $add('VENDA_ABERTA', 'OS aberta', (float) $l['valor_total'], $o['criado_em']);
        }
        if ($o['status'] === 'FECHADA' && $o['assinada_em'] === null && !in_array($grupo, ['SOC', 'PRF'], true) && ($o['origem_venda'] ?? null) !== 'SITE') {
            $add('SEM_ASSINATURA', 'Concluída em ' . $dm($o['concluida_em'] ?? $o['criado_em']), (float) $l['valor_total'], $concluida);
        }
        if ($o['status'] === 'FECHADA' && $l['saldo'] !== null && (float) $l['saldo'] > TOLERANCIA_CENTAVO) {
            $np = $l['nota_promissoria'];
            $det = $grupo === 'PRF' ? 'Prefeitura' : (($np && $np['status'] === 'ABERTA') ? 'Com nota promissória' : 'Sem nota promissória');
            $add('A_RECEBER', $det, (float) $l['saldo'], $concluida);
        }
        if ($l['nota_promissoria'] && in_array($l['nota_promissoria']['status'], ['BAIXADA', 'SUBSTITUIDA'], true) && !$l['nota_promissoria']['devolvida']) {
            $npQ->execute(['id' => $o['id']]);
            $np = $npQ->fetch() ?: [];
            $add('NP_DEVOLVER', $l['nota_promissoria']['status'] === 'BAIXADA' ? 'Quitada em ' . $dm($np['baixada_em'] ?? null) : 'NP substituída',
                 (float) $l['nota_promissoria']['valor'], $np['baixada_em'] ?? $concluida);
        }
        if ((float) $l['credito_a_devolver'] > 0) {
            $add('CREDITO_DEVOLVER', 'Pago a mais', (float) $l['credito_a_devolver'], $concluida);
        }
    }
    $porAgente = [];
    $tot = ['quantidade' => 0, 'mais_antiga' => 0, 'a_receber' => 0.0, 'a_receber_os' => 0, 'a_receber_com_np' => 0];
    foreach ($grupos as $cod => &$g) {
        usort($g['itens'], fn ($a, $b) => ($b['dias'] ?? -1) <=> ($a['dias'] ?? -1));
        $g['codigo'] = $cod;
        $g['quantidade'] = count($g['itens']);
        $g['total'] = dinheiro(array_sum(array_column($g['itens'], 'valor')));
        foreach ($g['itens'] as $it) {
            $tot['quantidade']++;
            $tot['mais_antiga'] = max($tot['mais_antiga'], (int) $it['dias']);
            $k = (string) ($it['agente_id'] ?? '') . '|' . (string) $it['agente'];
            $porAgente[$k] = $porAgente[$k] ?? ['agente_id' => $it['agente_id'], 'agente' => $it['agente'] ?? '—', 'quantidade' => 0, 'a_receber' => 0.0];
            $porAgente[$k]['quantidade']++;
            if ($cod === 'A_RECEBER') {
                $porAgente[$k]['a_receber'] = dinheiro($porAgente[$k]['a_receber'] + $it['valor']);
                $tot['a_receber'] = dinheiro($tot['a_receber'] + $it['valor']);
                $tot['a_receber_os']++;
                if ($it['detalhe'] === 'Com nota promissória') {
                    $tot['a_receber_com_np']++;
                }
            }
        }
    }
    unset($g);
    $porAgente = array_values($porAgente);
    usort($porAgente, fn ($a, $b) => ($b['quantidade'] <=> $a['quantidade']) ?: strcmp((string) $a['agente'], (string) $b['agente']));
    return ['data' => $hoje, 'grupos' => array_values($grupos), 'por_agente' => $porAgente, 'total_geral' => $tot];
}

/** Custo dos itens que saíram do estoque para o atendimento (custo médio gravado na baixa; baixas antigas não têm custo). */
function custoEstoqueDoAtendimento(PDO $pdo, ?int $atendimentoId): ?array {
    static $ok = null;
    if ($ok === null) {
        $ok = colunaExisteOS($pdo, 'est_movimento', 'custo_total_snapshot') && colunaExisteOS($pdo, 'est_movimento', 'estornado_em');
    }
    if (!$ok || !$atendimentoId) {
        return null;
    }
    $st = $pdo->prepare("SELECT COUNT(*) AS saidas, SUM(CASE WHEN custo_total_snapshot IS NULL THEN 1 ELSE 0 END) AS sem_custo, COALESCE(SUM(custo_total_snapshot), 0) AS custo
                         FROM est_movimento WHERE tipo = 'SAIDA' AND destino_texto = :d AND estornado_em IS NULL");
    $st->execute(['d' => 'Atendimento #' . $atendimentoId]);
    $r = $st->fetch();
    return ['custo' => dinheiro((float) $r['custo']), 'saidas' => (int) $r['saidas'], 'sem_custo' => (int) $r['sem_custo']];
}

/** Relatório Sócio - Acompanhamento: OS do plano (Soc) do período — coberto pelo plano, Dif da família, aditivos e custo dos itens. */
function relatorioAcompanhamentoSocio(PDO $pdo, array $f, array $usuario): array {
    $f['tipo'] = 'SOC';
    unset($f['situacao']);
    $fl = filtrosOS($f, $usuario);
    $stmt = $pdo->prepare("SELECT o.* FROM os_ordens o WHERE {$fl['where']} AND o.tipo = 'ATENDIMENTO' AND o.status NOT IN ('CANCELADA', 'CONVERTIDA')
                           AND DATE(o.criado_em) BETWEEN :ini AND :fim ORDER BY o.criado_em, o.numero_seq, o.id");
    $stmt->execute($fl['params'] + ['ini' => $fl['ini'], 'fim' => $fl['fim']]);
    $dif = $pdo->prepare("SELECT COALESCE(SUM(valor_total), 0) FROM os_ordens WHERE tipo = 'ATENDIMENTO' AND atendimento_id = :a AND natureza = 'PARTICULAR'
                          AND status NOT IN ('CANCELADA', 'CONVERTIDA')");
    $itens = $pdo->prepare('SELECT categoria, quantidade, translado_km FROM os_itens WHERE os_id = :id AND referencia_apenas = 0');
    $rot = fn (string $c) => function_exists('rotuloCategoria') ? rotuloCategoria($c) : mb_convert_case(str_replace('_', ' ', mb_strtolower($c)), MB_CASE_TITLE, 'UTF-8');
    $linhas = [];
    $planos = [];
    $cobertos = [];
    $tot = ['quantidade' => 0, 'coberto' => 0.0, 'diferenca' => 0.0, 'custo' => 0.0, 'com_custo' => 0, 'translado_km' => 0.0];
    foreach ($stmt->fetchAll() as $o) {
        $atId = $o['atendimento_id'] !== null ? (int) $o['atendimento_id'] : null;
        $coberto = valorCobertoPeloPlano($pdo, (int) $o['id']);
        $dif->execute(['a' => $atId]);
        $vDif = dinheiro((float) $dif->fetchColumn());
        $itens->execute(['id' => $o['id']]);
        $km = 0.0;
        foreach ($itens->fetchAll() as $it) {
            $cat = $rot((string) $it['categoria']);
            $cobertos[$cat] = ($cobertos[$cat] ?? 0) + max(1, (int) $it['quantidade']);
            if ($it['categoria'] === 'TRANSLADO') {
                $km += (float) $it['translado_km'];
            }
        }
        $aditivos = array_values(array_filter(array_map('trim', explode(',', (string) ($o['contrato_aditivos'] ?? '')))));
        $custo = custoEstoqueDoAtendimento($pdo, $atId);
        $plano = planoDoConvenio((string) $o['convenio']);
        $l = ['os_id' => (int) $o['id'], 'numero_os' => $o['numero_os'], 'status' => $o['status'], 'status_pagamento' => $o['status_pagamento'], 'assinada_em' => $o['assinada_em'],
              'data' => substr((string) $o['criado_em'], 0, 10), 'plano' => $plano, 'contrato' => trim((string) ($o['contrato_numero'] ?? '')) ?: null,
              'titular' => $o['contrato_titular'] ?? null, 'aditivos' => array_map(fn ($a) => mb_convert_case(mb_strtolower($a), MB_CASE_TITLE, 'UTF-8'), $aditivos),
              'translado_km' => round($km, 1), 'agente_id' => $o['criado_por'] !== null ? (int) $o['criado_por'] : null,
              'agente' => nomeUsuario($pdo, $o['criado_por'] !== null ? (int) $o['criado_por'] : null),
              'valor_total' => $coberto, 'coberto' => $coberto, 'diferenca' => $vDif,
              'custo' => $custo ? $custo['custo'] : null, 'custo_parcial' => $custo ? ($custo['sem_custo'] > 0) : true] + dadosExibicaoOS($pdo, $o);
        $linhas[] = $l;
        $planos[$plano] = $planos[$plano] ?? ['plano' => $plano, 'quantidade' => 0, 'coberto' => 0.0, 'custo' => 0.0, 'diferenca' => 0.0];
        $planos[$plano]['quantidade']++;
        $planos[$plano]['coberto'] = dinheiro($planos[$plano]['coberto'] + $coberto);
        $planos[$plano]['diferenca'] = dinheiro($planos[$plano]['diferenca'] + $vDif);
        $planos[$plano]['custo'] = dinheiro($planos[$plano]['custo'] + (float) ($l['custo'] ?? 0));
        $tot['quantidade']++;
        $tot['coberto'] = dinheiro($tot['coberto'] + $coberto);
        $tot['diferenca'] = dinheiro($tot['diferenca'] + $vDif);
        $tot['custo'] = dinheiro($tot['custo'] + (float) ($l['custo'] ?? 0));
        $tot['translado_km'] = round($tot['translado_km'] + $km, 1);
        if ($l['custo'] !== null && !$l['custo_parcial']) {
            $tot['com_custo']++;
        }
    }
    $ordem = ['LIGHT' => 1, 'FLEX' => 2, 'PLUS' => 3, 'MAX' => 4];
    $planos = array_values($planos);
    usort($planos, fn ($a, $b) => ($ordem[$a['plano']] ?? 9) <=> ($ordem[$b['plano']] ?? 9));
    arsort($cobertos);
    return ['periodo' => ['inicio' => $fl['ini'], 'fim' => $fl['fim']], 'linhas' => $linhas, 'por_plano' => $planos,
            'itens_cobertos' => array_map(fn ($k, $v) => ['categoria' => $k, 'quantidade' => $v], array_keys($cobertos), array_values($cobertos)),
            'total_geral' => $tot];
}

/** Linha do tempo: eventos da OS e das OS ligadas (mesmo atendimento/pedido e conversões), em ordem. */
function linhaDoTempo(PDO $pdo, int $osId): array {
    $os = buscarOSPorId($pdo, $osId);
    $col = $os['tipo'] === 'COROA' ? 'coroa_pedido_id' : 'atendimento_id';
    $ref = $os['tipo'] === 'COROA' ? $os['coroa_pedido_id'] : $os['atendimento_id'];
    $ids = [$osId];
    if ($ref !== null) {
        $st = $pdo->prepare("SELECT id FROM os_ordens WHERE tipo = :t AND {$col} = :r");
        $st->execute(['t' => $os['tipo'], 'r' => $ref]);
        $ids = array_map('intval', array_column($st->fetchAll(), 'id'));
    }
    $in = implode(',', array_map('intval', $ids));
    $ev = $pdo->query("SELECT e.*, o.numero_os FROM os_eventos e JOIN os_ordens o ON o.id = e.os_id WHERE e.os_id IN ({$in}) ORDER BY e.id")->fetchAll();
    return array_map(fn($e) => ['data' => $e['criado_em'], 'os' => $e['numero_os'], 'tipo' => $e['tipo'], 'descricao' => $e['descricao'],
                                'valor' => $e['valor'] !== null ? dinheiro((float) $e['valor']) : null, 'usuario' => nomeUsuario($pdo, $e['usuario_id'] !== null ? (int) $e['usuario_id'] : null)], $ev);
}

/** Registra que a NP baixada (ou substituída na conversão) foi devolvida ao emitente. */
function registrarDevolucaoNP(PDO $pdo, int $osId, ?string $obs, int $usuarioId): array {
    return emTransacao($pdo, function () use ($pdo, $osId, $obs, $usuarioId) {
        $os = buscarOSPorId($pdo, $osId, true);
        $st = $pdo->prepare('SELECT * FROM os_np WHERE os_id = :id FOR UPDATE');
        $st->execute(['id' => $osId]);
        $np = $st->fetch();
        if (!$np) {
            throw new RegraNegocioException("OS {$os['numero_os']} não tem nota promissória.", 404);
        }
        if (!in_array($np['status'], ['BAIXADA', 'SUBSTITUIDA'], true)) {
            throw new RegraNegocioException('Só a nota promissória baixada (saldo zerado) ou substituída pode ser devolvida.', 409);
        }
        if ($np['devolvida_em'] !== null) {
            throw new RegraNegocioException('Esta nota promissória já foi devolvida ao emitente.', 409);
        }
        $pdo->prepare('UPDATE os_np SET devolvida_em = NOW(), devolvida_por = :u, devolucao_obs = :o WHERE id = :id')
            ->execute(['u' => $usuarioId, 'o' => $obs !== null ? mb_substr(trim($obs), 0, 255) : null, 'id' => $np['id']]);
        registrarEvento($pdo, $osId, 'NP_DEVOLVIDA', 'Nota promissória devolvida ao emitente' . ($obs ? ' — ' . trim($obs) : ''), $usuarioId);
        $st->execute(['id' => $osId]);
        return $st->fetch();
    });
}

/** Registra a devolução à família do crédito gerado numa conversão. */
function registrarDevolucaoCredito(PDO $pdo, int $osId, ?string $obs, int $usuarioId): array {
    return emTransacao($pdo, function () use ($pdo, $osId, $obs, $usuarioId) {
        $os = buscarOSPorId($pdo, $osId, true);
        if ((float) $os['credito_a_devolver'] <= 0 || $os['credito_devolvido_em'] !== null) {
            throw new RegraNegocioException("OS {$os['numero_os']} não tem crédito a devolver.", 409);
        }
        $pdo->prepare('UPDATE os_ordens SET credito_devolvido_em = NOW() WHERE id = :id')->execute(['id' => $osId]);
        registrarEvento($pdo, $osId, 'CREDITO_DEVOLVIDO', 'Crédito de ' . formatarReais((float) $os['credito_a_devolver']) . ' devolvido à família' . ($obs ? ' — ' . trim($obs) : ''), $usuarioId, (float) $os['credito_a_devolver']);
        return buscarOSPorId($pdo, $osId);
    });
}

/**
 * Conversão (só admin): OS Particular já FECHADA que passa a ter convênio com a Prefeitura.
 * Regra por ITEM, igual ao atendimento de Prefeitura (o desconto é o valor do item no CONTRATO, não a tabela particular):
 *  - item do pacote com o mesmo produto do padrão: coberto pela Prefeitura, sem diferença;
 *  - item do pacote trocado: Dif = valor lançado na OS Particular − valor do item no contrato;
 *  - item fora do pacote: inteiro na Dif;
 *  - tanatopraxia / translado: autorizados → contrato (preço de contrato); não autorizados → inteiros na Dif.
 *    Avançada/embalsamamento com tanatopraxia autorizada: Dif = valor lançado − preço de contrato da tanatopraxia.
 *  - Faturado à Prefeitura = valor do pacote + serviços autorizados (calculado, não digitado).
 * A OS original vira CONVERTIDA (fora de vendas e saldo); a NP aberta vira SUBSTITUIDA (devolver); os recebimentos passam
 * para a Dif. Resta saldo: Dif ABERTA para assinar com a NP do novo saldo; pago igual: quitada; pago a mais: crédito a devolver.
 * $simular = true: calcula e devolve o resultado sem gravar nada (prévia da tela).
 */
function converterParaPrefeitura(PDO $pdo, int $osId, string $convenioPref, bool $tanatoAutorizada, bool $transladoAutorizado, string $motivo, int $usuarioId, bool $simular = false): array {
    $motivo = trim($motivo);
    if ($motivo === '' && !$simular) {
        throw new RegraNegocioException('Informe o motivo da conversão.');
    }
    $pref = dadosPrefeitura($convenioPref);
    $pacote = pacoteVigente($pdo, $pref['convenio']);
    if (!$pacote) {
        throw new RegraNegocioException("Pacote da Prefeitura de {$pref['nome']} não cadastrado — cadastre na tela de convênios.", 422);
    }
    $executar = function () use ($pdo, $osId, $pref, $pacote, $tanatoAutorizada, $transladoAutorizado, $motivo, $usuarioId) {
        $orig = buscarOSPorId($pdo, $osId, true);
        if ($orig['tipo'] !== 'ATENDIMENTO' || $orig['natureza'] !== 'PARTICULAR' || strpos(strtoupper((string) $orig['convenio']), 'PARTICULAR') !== 0) {
            throw new RegraNegocioException('Só uma OS Particular (Prt) pode ser convertida para Prefeitura + Dif.', 422);
        }
        if ($orig['status'] !== 'FECHADA') {
            throw new RegraNegocioException("OS {$orig['numero_os']} está {$orig['status']} — a conversão é para OS já fechada.", 409);
        }
        $precoTanato = precoContratoPrefeitura($pdo, $pref['convenio'], 'TANATOPRAXIA');
        $precoKm = precoContratoPrefeitura($pdo, $pref['convenio'], 'TRANSLADO_KM');
        $doPacote = [];
        foreach ($pacote['itens'] as $it) {
            $doPacote[$it['categoria']] = $it;
        }
        $itens = $pdo->prepare('SELECT * FROM os_itens WHERE os_id = :id ORDER BY id');
        $itens->execute(['id' => $orig['id']]);
        $itens = $itens->fetchAll();

        // Plano por item: [item, vai para a Prefeitura?, valor de contrato extra (serviço autorizado), diferença da família]
        $plano = [];
        foreach ($itens as $it) {
            $cat = (string) $it['categoria'];
            $lancado = dinheiro((float) $it['valor_final']);
            $qtd = max(1, (int) $it['quantidade']);
            if (isset($doPacote[$cat])) {
                $pad = $doPacote[$cat];
                $mesmo = (int) $it['produto_id'] === (int) $pad['produto_id'];
                $dif = $mesmo ? 0.0 : max(0.0, dinheiro($lancado - (float) $pad['valor_item'] * $qtd));
                $plano[] = [$it, true, null, $dif, $mesmo ? 'incluso no pacote' : 'troca: lançado ' . formatarReais($lancado) . ' − contrato ' . formatarReais((float) $pad['valor_item'] * $qtd)];
            } elseif ($cat === 'TANATOPRAXIA' && $tanatoAutorizada) {
                if (!$precoTanato) {
                    throw new RegraNegocioException('Preço de contrato da tanatopraxia não cadastrado para esta Prefeitura.', 422);
                }
                $plano[] = [$it, true, dinheiro($precoTanato), 0.0, 'autorizada pela Prefeitura'];
            } elseif (in_array($cat, SERVICOS_SEMPRE_DIFERENCA, true) && $tanatoAutorizada) {
                if (!$precoTanato) {
                    throw new RegraNegocioException('Preço de contrato da tanatopraxia não cadastrado para esta Prefeitura.', 422);
                }
                $plano[] = [$it, true, dinheiro($precoTanato), max(0.0, dinheiro($lancado - $precoTanato)), 'tanatopraxia autorizada; família paga a diferença'];
            } elseif ($cat === 'TRANSLADO' && $transladoAutorizado) {
                if (!$precoKm) {
                    throw new RegraNegocioException('Preço de contrato do km de translado não cadastrado para esta Prefeitura.', 422);
                }
                $plano[] = [$it, true, dinheiro($precoKm * (float) ($it['translado_km'] ?: 0)), 0.0, 'autorizado pela Prefeitura'];
            } else {
                $plano[] = [$it, false, null, $lancado, 'fora do pacote / não autorizado'];
            }
        }

        $n = reservarNumeros($pdo, 2);
        $novaOS = function (string $natureza, string $sufixo, int $seq, ?int $reserva) use ($pdo, $orig, $pref): int {
            $pdo->prepare(
                "INSERT INTO os_ordens (numero_os, numero_seq, seq_dif_reservada, tipo, atendimento_id, natureza, convenio, status, valor_total, os_origem_id, criado_por)
                 VALUES (:num, :seq, :res, 'ATENDIMENTO', :at, :nat, :conv, 'ABERTA', 0, :orig, :cp)"
            )->execute(['num' => formatarNumeroOS($seq, $sufixo), 'seq' => $seq, 'res' => $reserva, 'at' => $orig['atendimento_id'], 'nat' => $natureza,
                        'conv' => $pref['convenio'], 'orig' => $orig['id'], 'cp' => $orig['criado_por']]);
            return (int) $pdo->lastInsertId();
        };
        $prfId = $novaOS('CONVENIO', 'Prf.' . $pref['codigo'], $n, $n + 1);
        $difId = $novaOS('PARTICULAR', 'Dif.Prf', $n + 1, null);
        $pdo->prepare('UPDATE os_ordens SET pacote_id = :p, valor_pacote = :v WHERE id = :id')->execute(['p' => $pacote['id'], 'v' => $pacote['valor'], 'id' => $prfId]);

        $ins = $pdo->prepare(
            'INSERT INTO os_itens (os_id, produto_id, categoria, tipo_item, quantidade, frase_faixa, valor_unitario_travado, valor_unitario_aplicado, valor_final,
                                   desconto_percentual, desconto_acima_limite, referencia_apenas, valor_contrato_item, translado_origem, translado_destino, translado_km)
             VALUES (:os, :p, :c, :t, :q, :fr, :tr, :ap, :fi, 0, 0, :ref, :vc, :to, :td, :tk)'
        );
        $detalhe = [];
        foreach ($plano as [$it, $naPrefeitura, $contratoExtra, $dif, $motivoItem]) {
            $base = ['p' => $it['produto_id'], 'c' => $it['categoria'], 'q' => $it['quantidade'], 'fr' => $it['frase_faixa'],
                     'to' => $it['translado_origem'], 'td' => $it['translado_destino'], 'tk' => $it['translado_km']];
            if ($naPrefeitura) {   // na folha da Prefeitura, sem valores
                $ins->execute($base + ['os' => $prfId, 't' => 'REFERENCIA', 'tr' => $it['valor_unitario_aplicado'], 'ap' => $it['valor_unitario_aplicado'], 'fi' => 0, 'ref' => 1, 'vc' => $contratoExtra]);
            }
            if ($dif > 0) {
                $unit = dinheiro($dif / max(1, (int) $it['quantidade']));
                $ins->execute($base + ['os' => $difId, 't' => $naPrefeitura ? 'DIFERENCA' : $it['tipo_item'], 'tr' => $naPrefeitura ? $unit : $it['valor_unitario_travado'],
                                       'ap' => $naPrefeitura ? $unit : $it['valor_unitario_aplicado'], 'fi' => $dif, 'ref' => 0, 'vc' => null]);
            }
            $detalhe[] = ['item' => nomeProduto($pdo, (int) $it['produto_id']), 'categoria' => $it['categoria'], 'lancado' => dinheiro((float) $it['valor_final']),
                          'prefeitura' => $naPrefeitura, 'diferenca' => dinheiro($dif), 'regra' => $motivoItem];
        }
        recalcularTotalPrefeitura($pdo, $prfId);
        recalcularValorTotal($pdo, $difId);
        $prf = buscarOSPorId($pdo, $prfId);
        $dif = buscarOSPorId($pdo, $difId);
        $valorPrefeitura = dinheiro((float) $prf['valor_total']);
        $novoTotal = dinheiro((float) $dif['valor_total']);

        // Recebimentos vão com a família para a Dif.
        $pdo->prepare("UPDATE os_financeiro SET os_id = :dif, valor_alvo = :v WHERE os_id = :orig AND status <> 'CANCELADO'")
            ->execute(['dif' => $difId, 'v' => $novoTotal, 'orig' => $orig['id']]);
        $pago = valorJaPagoDaOS($pdo, $difId);

        $pdo->prepare("UPDATE os_ordens SET status = 'CONVERTIDA', convertida_em = NOW(), convertida_por = :u, conversao_motivo = :m WHERE id = :id")
            ->execute(['u' => $usuarioId, 'm' => mb_substr($motivo, 0, 255), 'id' => $orig['id']]);
        $pdo->prepare("UPDATE os_np SET status = 'SUBSTITUIDA' WHERE os_id = :id AND status = 'ABERTA'")->execute(['id' => $orig['id']]);

        $credito = 0.0;
        $precisaAssinar = $pago + TOLERANCIA_CENTAVO < $novoTotal;
        if (!$precisaAssinar) {
            $credito = max(0.0, dinheiro($pago - $novoTotal));
            $pdo->prepare("UPDATE os_ordens SET status = 'FECHADA', motivo_fechamento = 'CONVERSAO', credito_a_devolver = :c, status_pagamento = :sp WHERE id = :id")
                ->execute(['c' => $credito, 'sp' => $pago > 0 ? 'PAGO' : 'AGUARDANDO', 'id' => $difId]);
            $pdo->prepare("UPDATE os_financeiro SET status = 'FATURADO', faturado_em = NOW(), faturado_por = :u WHERE os_id = :id AND status NOT IN ('CANCELADO','FATURADO')")
                ->execute(['u' => $usuarioId, 'id' => $difId]);
        } else {
            $fin = $pdo->prepare("SELECT id FROM os_financeiro WHERE os_id = :id AND status <> 'CANCELADO' ORDER BY id DESC LIMIT 1");
            $fin->execute(['id' => $difId]);
            if ($finId = $fin->fetchColumn()) {
                sincronizarStatusPagamentoOS($pdo, (int) $finId, $usuarioId);
            }
        }
        $prf = buscarOSPorId($pdo, $prfId);
        $dif = buscarOSPorId($pdo, $difId);
        $desc = "Convertida para {$prf['numero_os']} (Prefeitura de {$pref['nome']}: " . formatarReais($valorPrefeitura) . ") + {$dif['numero_os']} (família: " . formatarReais($novoTotal) . ") — motivo: {$motivo}";
        registrarEvento($pdo, (int) $orig['id'], 'CONVERTIDA', $desc, $usuarioId);
        registrarEvento($pdo, $prfId, 'OS_CRIADA', "OS {$prf['numero_os']} criada pela conversão da {$orig['numero_os']} — pacote \"{$pacote['nome']}\" + serviços autorizados: " . formatarReais($valorPrefeitura), $usuarioId, $valorPrefeitura);
        registrarEvento($pdo, $difId, 'OS_CRIADA', "OS {$dif['numero_os']} criada pela conversão da {$orig['numero_os']} — diferença por item " . formatarReais($novoTotal) . '; ' . formatarReais($pago) . ' já pagos'
            . ($precisaAssinar ? '; falta assinar com a NP do novo saldo (' . formatarReais($novoTotal - $pago) . ')' : ($credito > 0 ? '; crédito a devolver ' . formatarReais($credito) : '; quitada')), $usuarioId, $novoTotal);
        return ['os_original' => buscarOSPorId($pdo, (int) $orig['id']), 'os_prefeitura' => $prf, 'os_diferenca' => $dif, 'valor_prefeitura' => $valorPrefeitura,
                'valor_familia' => $novoTotal, 'ja_pago' => $pago, 'novo_saldo' => max(0.0, dinheiro($novoTotal - $pago)), 'credito_a_devolver' => $credito,
                'precisa_assinar' => $precisaAssinar, 'itens' => $detalhe];
    };
    if (!$simular) {
        return emTransacao($pdo, $executar);
    }
    // Prévia: executa tudo numa transação e desfaz (nada fica gravado, nem a numeração).
    $pdo->beginTransaction();
    try {
        $r = $executar();
        $r['simulacao'] = true;
        unset($r['os_original'], $r['os_prefeitura']['id'], $r['os_diferenca']['id']);
        return $r;
    } finally {
        $pdo->rollBack();
    }
}

/* =====================================================================
 * MONTAGEM AUTOMÁTICA DA OS A PARTIR DO ATENDIMENTO (revisão 6)
 * O agente só preenche as etapas do atendimento (Sim/Não + modelo). Esta função lê o atendimento e monta as OS
 * pelas regras do convênio. Pode ser chamada de novo a cada alteração: só refaz a categoria cujo produto/marcação mudou
 * (itens iguais mantêm valor editado e desconto).
 * ===================================================================== */

/** Mapa do atendimento (os_config.php → mapa_atendimento). */
function mapaAtendimento(): array {
    $padrao = [
        'tabela' => 'sepultamentos',
        'convenios' => ['Particular' => 'PARTICULAR', 'Prefeitura de Barreiras' => 'PREFEITURA_BARREIRAS', 'Prefeitura de Angical' => 'PREFEITURA_ANGICAL', 'Associado(a)' => 'ASSOCIADO'],
        // categoria => [campo Sim/Não (null = sempre que houver produto), campo do produto, produto fixo (quando a etapa não escolhe modelo)]
        'itens' => [
            'URNA' => [null, 'urna_produto_id', null], 'ROUPA' => [null, 'roupa_produto_id', null],
            'INVOLUCRO' => ['invol', 'invol_produto_id', null], 'VEU' => ['veu', 'veu_produto_id', null], 'CORDAO' => ['cordao', 'cordao_produto_id', null],
            'COROA' => ['coroa_flores', 'coroa_produto_id', null],
        ],
        // etapas Sim/Não sem modelo no atendimento: produto fixo por tipo (preencher). Ex.: 'ORNAMENTACAO' => ['ornamentacao', 'ornamentacao_tipo', ['Natural' => 491, 'Artificial' => 0]]
        'itens_por_tipo' => [
            // Sala do velório do Memorial Senhor do Bonfim (06/10/2026): produto de serviço por sala, só com Velório = Sim.
            // O front só deixa escolher sala quando o local do velório é o Memorial (sepultamentos.local_cerimonia).
            // SALA 01 - PRESENÇA (cód. 12345697) = id 515 · SALA 02 - ENCONTRO (cód. 12345698) = id 514 · SALA 03 - REFÚGIO (cód. 12345699) = id 496
            'SALA_VELORIO' => ['realiza_velorio', 'sala_velorio', ['Sala 01' => 515, 'Sala 02' => 514, 'Sala 03' => 496]],
        ],
    ];
    $cfg = (array) osConfig('mapa_atendimento', []);
    return array_replace_recursive($padrao, $cfg);
}

function simNao($v): bool {
    return in_array(mb_strtolower(trim((string) $v)), ['sim', 's', '1', 'true'], true);
}

/** Produto atual de uma categoria nas OS do atendimento (ou null). */
function produtoAtualDaCategoria(PDO $pdo, int $atendimentoId, string $categoria): ?int {
    $st = $pdo->prepare("SELECT i.produto_id FROM os_itens i JOIN os_ordens o ON o.id = i.os_id WHERE o.tipo = 'ATENDIMENTO' AND o.atendimento_id = :a
                         AND o.status <> 'CANCELADA' AND i.categoria = :c AND i.tipo_item <> 'ADICIONAL' ORDER BY i.id LIMIT 1");
    $st->execute(['a' => $atendimentoId, 'c' => $categoria]);
    $v = $st->fetchColumn();
    return $v === false ? null : (int) $v;
}

function removerCategoriaDoAtendimento(PDO $pdo, int $atendimentoId, string $categoria): void {
    $st = $pdo->prepare("SELECT id FROM os_ordens WHERE tipo = 'ATENDIMENTO' AND atendimento_id = :a AND status <> 'CANCELADA'");
    $st->execute(['a' => $atendimentoId]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $osId) {
        $os = buscarOSPorId($pdo, (int) $osId);
        exigirOSAberta($os);
        removerItensDaCategoria($pdo, (int) $osId, $categoria, ['PADRAO', 'DIFERENCA', 'REFERENCIA', 'DIRETO']);
        if ($os['natureza'] === 'PARTICULAR') {
            recalcularValorTotal($pdo, (int) $osId);
        } elseif (strpos((string) $os['convenio'], 'PREFEITURA') === 0) {
            recalcularTotalPrefeitura($pdo, (int) $osId);
        }
    }
}

/**
 * O item já lançado ainda segue o pacote de hoje? (06/10/2026)
 * Convênio com padrão na categoria = o item fica na OS do convênio; sem padrão = vai inteiro para a diferença da família.
 * Se o lançado não bate com isso (o pacote foi alterado depois), a categoria é relançada. Só mexe com todas as OS ABERTAS.
 */
function coberturaDaCategoriaMudou(PDO $pdo, int $atendimentoId, string $convenio, string $categoria): bool {
    if (strpos($convenio, 'PARTICULAR') === 0) {
        return false;
    }
    $st = $pdo->prepare("SELECT id, natureza, status FROM os_ordens WHERE tipo = 'ATENDIMENTO' AND atendimento_id = :a AND status <> 'CANCELADA'");
    $st->execute(['a' => $atendimentoId]);
    $osLista = $st->fetchAll();
    foreach ($osLista as $o) {
        if ($o['status'] !== 'ABERTA') {
            return false;   // confirmada/assinada: não mexe
        }
    }
    $noConvenio = false;
    foreach ($osLista as $o) {
        if ($o['natureza'] !== 'CONVENIO') {
            continue;
        }
        $q = $pdo->prepare("SELECT COUNT(*) FROM os_itens WHERE os_id = :o AND categoria = :c AND tipo_item IN ('PADRAO', 'REFERENCIA')");
        $q->execute(['o' => (int) $o['id'], 'c' => $categoria]);
        $noConvenio = $noConvenio || ((int) $q->fetchColumn() > 0);
    }
    try {
        $temPadrao = buscarPacotePadrao($pdo, $convenio, $categoria) !== null
            || (strpos($convenio, 'PREFEITURA') !== 0 && $categoria === 'URNA');   // urna do plano fica sempre na OS do plano
    } catch (Throwable $e) {
        return false;
    }
    return $temPadrao !== $noConvenio;
}

/**
 * Monta/atualiza as OS do atendimento a partir das etapas preenchidas.
 * Associado: o plano vem do contrato do titular (informe $plano e o contrato na primeira montagem; depois fica na OS).
 */
function montarOSDoAtendimento(PDO $pdo, int $atendimentoId, ?int $usuarioId, ?string $plano = null, ?string $contrato = null, ?string $titular = null): array {
    $mapa = mapaAtendimento();
    if (!preg_match('/^[A-Za-z0-9_]+$/', (string) $mapa['tabela'])) {
        throw new RuntimeException('mapa_atendimento.tabela inválida');
    }
    $st = $pdo->prepare("SELECT * FROM `{$mapa['tabela']}` WHERE id = :id");
    $st->execute(['id' => $atendimentoId]);
    $at = $st->fetch();
    if (!$at) {
        throw new RegraNegocioException("Atendimento {$atendimentoId} não encontrado.", 404);
    }
    // As coroas do atendimento ficam no pedido de coroas (coroas.php); o registro guarda só a primeira ("MOD 08 +1").
    $coroasDoPedido = coroasDoPedidoDoAtendimento($pdo, $atendimentoId);
    if ($coroasDoPedido) {
        $at['coroas_itens'] = $coroasDoPedido;
    }
    $convTexto = trim((string) ($at['convenio'] ?? ''));
    $convOS = strtoupper(trim((string) ($at['convenio_os'] ?? '')));   // campo novo sugerido: código do convênio da OS
    if ($convOS !== '') {
        $mapa['convenios'][$convTexto] = $convOS;
    }
    // Vínculo com o cadastro de Convênios (registro novo): o código do convênio vem do cadastro, não do texto do campo.
    $convenioId = (int) ($at['convenio_id'] ?? 0);
    $cadVinculo = null;
    if ($convenioId > 0) {
        $q = $pdo->prepare('SELECT * FROM convenios WHERE id = :id');
        $q->execute(['id' => $convenioId]);
        $cadVinculo = $q->fetch() ?: null;
        if ($cadVinculo) {
            $codigoVinculo = strtoupper(trim((string) ($cadVinculo['os_codigo'] ?? '')));
            if ($codigoVinculo === '') {
                throw new RegraNegocioException("O convênio '{$cadVinculo['nome']}' ainda não tem o tipo da OS definido — defina em Convênios (Dados da OS).", 422);
            }
            $convOS = $codigoVinculo;
            $mapa['convenios'][$convTexto] = $convOS;
        }
    }
    $contrato = $contrato ?: (trim((string) ($at['contrato_numero'] ?? '')) ?: null);   // campo novo sugerido
    if (!isset($mapa['convenios'][$convTexto])) {
        throw new RegraNegocioException("Convênio do atendimento ('{$convTexto}') não mapeado (os_config.php → mapa_atendimento.convenios).", 422);
    }
    $convenio = $mapa['convenios'][$convTexto];
    if ($convenio === 'ASSOCIADO') {
        $soc = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO');
        if ($soc) {
            $convenio = (string) $soc['convenio'];
        } elseif ($plano || strpos($convOS, 'ASSOCIADO_') === 0) {
            $convenio = $plano ? 'ASSOCIADO_' . strtoupper(trim($plano)) : $convOS;
            tetoUrnaDoPlano($convenio); // plano válido
        } else {
            throw new RegraNegocioException('Atendimento de associado: informe o plano do contrato do titular (busque o contrato) para montar a OS.', 422);
        }
    }
    $ehPref = strpos($convenio, 'PREFEITURA') === 0;
    // Pacote escolhido no registro e autorização da Prefeitura (só para atendimento ligado ao cadastro de Convênios).
    $pacoteEscolhido = $cadVinculo ? (int) ($at['pacote_id'] ?? 0) : 0;
    if ($cadVinculo) {
        contextoPacote(['convenio' => $convenio, 'pacote_id' => $pacoteEscolhido, 'atendimento_id' => $atendimentoId]);
    }
    dataReferenciaOS(dataDoAtendimentoOS($at));   // valores do convênio pela vigência na data do atendimento (16/10/2026)
    try {
        // Coroa da Prefeitura: com pacote de PRODUTO de coroa no convênio, a coroa segue a pergunta própria (vale mesmo sem o pacote de atendimento).
        $convPref = ($cadVinculo && $ehPref) ? $convenio : null;
        $pacotesCoroa = $convPref ? pacotesDeCoroa($pdo, $cadVinculo) : [];
        $coroasPref = ($pacotesCoroa && simNao($at['coroa_flores'] ?? '')) ? coroasDoRegistro($at) : [];
        if ($coroasPref && trim((string) ($at['coroa_autorizada_prefeitura'] ?? '')) === '') {
            throw new RegraNegocioException('Informe se a Prefeitura autorizou a coroa.', 422);
        }
        $coroaAutorizada = $coroasPref ? simNao($at['coroa_autorizada_prefeitura'] ?? '') : false;
        $pacoteEfetivo = ($cadVinculo && ($ehPref || strpos($convenio, 'ASSOCIADO') === 0)) ? (pacoteVigente($pdo, $convenio)['id'] ?? null) : null;
        $semPacote = false;   // Prefeitura não autorizou o atendimento, mas autorizou algum serviço: OS Prf só com o autorizado
        if ($cadVinculo && $ehPref && $pacoteEfetivo !== null) {
            $autPacote = trim((string) ($at['pacote_autorizado_prefeitura'] ?? ''));
            if ($autPacote === '') {
                throw new RegraNegocioException('Informe se a Prefeitura autorizou o atendimento funerário.', 422);
            }
            if (mb_strtolower($autPacote) === 'não' || mb_strtolower($autPacote) === 'nao') {
                // Sem autorização do atendimento o pacote não cobre nada (09/10/2026). Tanatopraxia, translado e coroa têm autorização própria:
                //  - algum deles autorizado → OS da Prefeitura só com o autorizado (preço de contrato); o resto na Dif.Prf, pelo preço particular;
                //  - nenhum autorizado → a OS é toda da família (OS Particular), sem OS da Prefeitura.
                $algoAutorizado = (simNao($at['tanato'] ?? '') && simNao($at['tanato_autorizado_prefeitura'] ?? ''))
                    || (simNao($at['translado'] ?? '') && simNao($at['translado_autorizado_prefeitura'] ?? ''))
                    || ($coroasPref && $coroaAutorizada);
                $pacoteEfetivo = null;
                if ($algoAutorizado) {
                    $semPacote = true;
                    contextoPacote(['convenio' => $convenio, 'pacote_id' => $pacoteEscolhido, 'atendimento_id' => $atendimentoId, 'sem_pacote' => true]);
                } else {
                    $convenio = 'PARTICULAR';
                    $ehPref = false;
                }
            }
        }
        return emTransacao($pdo, function () use ($pdo, $at, $atendimentoId, $convenio, $ehPref, $mapa, $usuarioId, $contrato, $titular, $cadVinculo, $pacoteEfetivo,
                                                  $convPref, $pacotesCoroa, $coroasPref, $coroaAutorizada, $semPacote) {
        $alteradas = [];
        // Mudou o convênio, o pacote ou a autorização? Com as OS ainda ABERTAS elas são refeitas; confirmada/assinada fica como está e avisa.
        if ($cadVinculo) {
            $bloqueada = false;
            $aviso = reconciliarOSComVinculo($pdo, $atendimentoId, $convenio, $pacoteEfetivo !== null ? (int) $pacoteEfetivo : null, $usuarioId, $bloqueada,
                ($coroasPref && $coroaAutorizada) ? $convPref : null, $semPacote);
            if ($aviso !== null) {
                $alteradas[] = $aviso;
            }
            if ($bloqueada) {   // OS já confirmada/assinada: não mexe em nada, só avisa
                $convAtual = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO');
                $partAtual = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR');
                $apoioAtual = strpos($convenio, 'ASSOCIADO') === 0 ? localizarOSApoioPrefeitura($pdo, $atendimentoId) : null;
                return ['convenio' => $convenio, 'alteracoes' => $alteradas,
                        'os_convenio' => $convAtual ? buscarOSPorId($pdo, (int) $convAtual['id']) : null, 'os_particular' => $partAtual ? buscarOSPorId($pdo, (int) $partAtual['id']) : null,
                        'os_prefeitura' => $apoioAtual ? buscarOSPorId($pdo, (int) $apoioAtual['id']) : null];
            }
        }
        // 0) Prefeitura: pacote alterado no convênio depois de aplicado (16/10/2026) — valor novo e categorias a relançar
        $relancarPacote = [];
        if ($cadVinculo && $ehPref && !$semPacote) {
            $atuPac = atualizarPacoteDaOSPrefeitura($pdo, $atendimentoId, $convenio, $usuarioId);
            $relancarPacote = $atuPac['relancar'];
            if ($atuPac['aviso'] !== null) {
                $alteradas[] = $atuPac['aviso'];
            }
        }
        // 1) itens com modelo escolhido na etapa
        $desejados = [];
        $usado = [];   // a categoria foi usada no atendimento? (13/10/2026: item com Não, ou roupa própria, não entra pelo pacote)
        foreach ($mapa['itens'] as $cat => [$campoSim, $campoProd, $fixo]) {
            $marcado = $campoSim === null ? true : simNao($at[$campoSim] ?? '');
            if ($cat === 'ROUPA' && $campoSim === null) {   // roupa sem Sim/Não: sem roupa (vazio) ou roupa própria = não usou roupa do estoque
                $txtRoupa = trim((string) ($at['roupa'] ?? ''));
                $marcado = !empty($at[$campoProd]) || ($txtRoupa !== '' && !preg_match('/pr[óo]pri/iu', $txtRoupa) && (int) ($at['roupa_propria'] ?? 0) !== 1);
            }
            $usado[$cat] = $marcado;
            $prod = $marcado ? (int) ($at[$campoProd] ?? 0) : 0;
            $desejados[$cat] = $prod > 0 ? $prod : ($marcado && $fixo ? (int) $fixo : 0);
        }
        foreach ($mapa['itens_por_tipo'] as $cat => [$campoSim, $campoTipo, $porTipo]) {
            $usado[$cat] = simNao($at[$campoSim] ?? '');
            $desejados[$cat] = $usado[$cat] ? (int) ($porTipo[trim((string) ($at[$campoTipo] ?? ''))] ?? 0) : 0;
        }
        // Prefeitura: categorias do pacote marcadas sem modelo escolhido entram com o padrão do pacote.
        // Item marcado Não (ou roupa própria / sem roupa) NÃO entra: só vai para a OS o que foi usado (13/10/2026).
        if ($ehPref && ($pac = pacoteVigente($pdo, $convenio))) {
            foreach ($pac['itens'] as $it) {
                $catPac = (string) $it['categoria'];
                $foiUsado = $usado[$catPac] ?? (array_key_exists(strtolower($catPac), $at) ? simNao($at[strtolower($catPac)]) : true);
                if (empty($desejados[$catPac]) && $foiUsado) {
                    $desejados[$it['categoria']] = $it['produto_id'];
                }
            }
        }
        if ($coroasPref) {   // a coroa da Prefeitura segue a pergunta própria (lancarCoroasPrefeitura, abaixo)
            unset($desejados['COROA']);
        }
        foreach ($desejados as $cat => $prod) {
            $atual = produtoAtualDaCategoria($pdo, $atendimentoId, $cat);
            if ($prod === 0) {
                if ($atual !== null) {
                    removerCategoriaDoAtendimento($pdo, $atendimentoId, $cat);
                    $alteradas[] = "{$cat}: removido";
                }
                continue;
            }
            if ($atual === $prod && !in_array($cat, $relancarPacote, true) && !coberturaDaCategoriaMudou($pdo, $atendimentoId, $convenio, $cat)) {
                continue; // igual: mantém valor editado/desconto
            }
            if ($atual === $prod && in_array($cat, $relancarPacote, true)) {
                $alteradas[] = "{$cat}: recalculado com os valores novos do convênio";
            }
            if ($atual === $prod) {
                // Mesmo produto, mas o pacote mudou (ex.: o modelo passou a ser aceito, ou a categoria entrou/saiu do pacote):
                // relança a categoria para a OS bater com a prévia do registro.
                removerCategoriaDoAtendimento($pdo, $atendimentoId, $cat);
            }
            if ($atual !== null && strpos($convenio, 'PARTICULAR') === 0) {
                removerCategoriaDoAtendimento($pdo, $atendimentoId, $cat);
            }
            adicionarItemComparandoPadrao($pdo, 'ATENDIMENTO', $atendimentoId, null, $convenio, $cat, $prod, 1, $usuarioId);
            $alteradas[] = "{$cat}: " . nomeProduto($pdo, $prod);
        }
        // Associado: registrar a cobertura no contrato ANTES de lançar o procedimento.
        // Outros aditivos (como TRANSLADO) permanecem intactos. Nunca confiar em aditivos do request.
        if (strpos($convenio, 'ASSOCIADO') === 0 && $contrato && (simNao($at['tanato'] ?? '') || simNao($at['translado'] ?? ''))) {
            if (!function_exists('paiAssocCoberturasVerificadas')) {
                throw new RegraNegocioException('Integração contratual indisponível; a OS não pode ser sincronizada.', 503);
            }
            try {
                $tagsVerificadas = paiAssocCoberturasVerificadas((string)$contrato);
            } catch (Throwable $e) {
                error_log('[os_sincronizar_coberturas] ' . $e->getMessage());
                throw new RegraNegocioException('Não foi possível conferir os aditivos do contrato. Nenhuma OS foi alterada.', 503);
            }
            $osAssociado = obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO', $convenio, $usuarioId);
            $aditivosAtuais = array_values(array_filter(aditivosDoContrato($osAssociado), static fn($a) => $a !== 'TANATOPRAXIA'));
            if (simNao($at['tanato'] ?? '') && $tagsVerificadas['tanato'] && !planoCobreServico($convenio, 'TANATOPRAXIA', $pdo)) {
                $aditivosAtuais[] = 'TANATOPRAXIA';
            }
            if (simNao($at['translado'] ?? '') && $tagsVerificadas['km_ilimitado']) {
                // A tag dispensa qualquer limite de quilômetros. Reaproveita a cobertura
                // integral de TRANSLADO existente no motor, sem alterar outros planos.
                $permitidos = aditivosPermitidosDoPlano($convenio);
                if (in_array('TRANSLADO', $permitidos, true)) {
                    $aditivosAtuais[] = 'TRANSLADO';
                } elseif (kmTransladoCobertoPeloPlano($pdo, $convenio) !== null) {
                    throw new RegraNegocioException('KM ILIMITADO confirmado, mas o plano não permite registrar a cobertura integral. Verifique a configuração do convênio.', 422);
                }
            }
            definirContratoAssociado($pdo, (int)$osAssociado['id'], (string)$contrato, $titular, $usuarioId, implode(',', array_unique($aditivosAtuais)));
        }
        // 2) tanatopraxia (normal, avançada ou embalsamamento) e translado: relançados conforme a etapa e a autorização
        $autTanato = $ehPref ? simNao($at['tanato_autorizado_prefeitura'] ?? '') : null;
        if (simNao($at['tanato'] ?? '')) {
            $prodTan = (int) ($at['tanato_produto_id'] ?? 0) ?: produtoTanatopraxiaNormal($pdo);
            $catTan = 'TANATOPRAXIA';
            // modelo escolhido na etapa: avançada/embalsamamento pela configuração (produtos_preparo) ou pelo nome do produto
            $preparo = (array) osConfig('produtos_preparo', []);
            $nomeTan = mb_strtoupper(nomeProduto($pdo, $prodTan));
            foreach (['TANATOPRAXIA_AVANCADA' => 'AVANÇ', 'EMBALSAMAMENTO' => 'EMBALSAM'] as $c => $trecho) {
                if (in_array($prodTan, array_map('intval', (array) ($preparo[$c] ?? [])), true) || strpos($nomeTan, $trecho) !== false) {
                    $catTan = $c;
                }
            }
            if (strpos($convenio, 'PARTICULAR') === 0) {
                if (produtoAtualDaCategoria($pdo, $atendimentoId, $catTan) !== $prodTan) {
                    foreach (array_merge(['TANATOPRAXIA'], SERVICOS_SEMPRE_DIFERENCA) as $c) { removerCategoriaDoAtendimento($pdo, $atendimentoId, $c); }
                    adicionarItemComparandoPadrao($pdo, 'ATENDIMENTO', $atendimentoId, null, $convenio, $catTan, $prodTan, 1, $usuarioId);
                }
            } else {
                adicionarItemComparandoPadrao($pdo, 'ATENDIMENTO', $atendimentoId, null, $convenio, $catTan, $prodTan, 1, $usuarioId, false, null, $autTanato);
            }
            $alteradas[] = "{$catTan}: " . nomeProduto($pdo, $prodTan) . ($ehPref ? ' (Prefeitura autorizou: ' . ($autTanato ? 'Sim' : 'Não') . ')' : '');
        } else {
            foreach (array_merge(['TANATOPRAXIA'], SERVICOS_SEMPRE_DIFERENCA) as $c) {
                if (produtoAtualDaCategoria($pdo, $atendimentoId, $c) !== null) {
                    removerCategoriaDoAtendimento($pdo, $atendimentoId, $c);
                    $alteradas[] = "{$c}: removido";
                }
            }
        }
        // 2b) reconstituição facial: serviço ADICIONAL ao procedimento (só com tanatopraxia = Sim). Não faz parte do pacote,
        //     então o lançamento já cai inteiro na diferença da família (convênio) ou na OS particular.
        $catRec = 'RECONSTITUICAO_FACIAL';
        if (simNao($at['tanato'] ?? '') && simNao($at['reconstituicao_facial'] ?? '')) {
            $prodRec = produtoReconstituicaoFacial($pdo);
            if (produtoAtualDaCategoria($pdo, $atendimentoId, $catRec) !== $prodRec) {
                removerCategoriaDoAtendimento($pdo, $atendimentoId, $catRec);
                adicionarItemComparandoPadrao($pdo, 'ATENDIMENTO', $atendimentoId, null, $convenio, $catRec, $prodRec, 1, $usuarioId);
            }
            $alteradas[] = "{$catRec}: " . nomeProduto($pdo, $prodRec);
        } elseif (produtoAtualDaCategoria($pdo, $atendimentoId, $catRec) !== null) {
            removerCategoriaDoAtendimento($pdo, $atendimentoId, $catRec);
            $alteradas[] = "{$catRec}: removido";
        }
        if (simNao($at['translado'] ?? '')) {
            adicionarTranslado($pdo, $atendimentoId, $convenio, (string) ($at['translado_origem'] ?? ''), (string) ($at['translado_destino'] ?? ''), (float) ($at['translado_km'] ?? 0),
                $usuarioId, $ehPref ? simNao($at['translado_autorizado_prefeitura'] ?? '') : null);
            $alteradas[] = 'TRANSLADO: ' . ($at['translado_km'] ?? 0) . ' km' . ($ehPref ? ' (Prefeitura autorizou: ' . (simNao($at['translado_autorizado_prefeitura'] ?? '') ? 'Sim' : 'Não') . ')' : '');
        } elseif (produtoAtualDaCategoria($pdo, $atendimentoId, 'TRANSLADO') !== null) {
            removerCategoriaDoAtendimento($pdo, $atendimentoId, 'TRANSLADO');
            $alteradas[] = 'TRANSLADO: removido';
        }
        // 2c) coroa da Prefeitura (pacote de produto): autorizada → OS da Prefeitura; não → família, preço particular
        if ($coroasPref) {
            $alteradas = array_merge($alteradas, lancarCoroasPrefeitura($pdo, $atendimentoId, $convPref, $convenio, $coroasPref, $coroaAutorizada, $pacotesCoroa, $usuarioId));
        } elseif ($pacotesCoroa && produtoAtualDaCategoria($pdo, $atendimentoId, 'COROA') !== null && !simNao($at['coroa_flores'] ?? '')) {
            removerCategoriaDoAtendimento($pdo, $atendimentoId, 'COROA');
            $alteradas[] = 'COROA: removido';
        }
        // 2d) associado com apoio da Prefeitura (09/10/2026): o que a Prefeitura paga sai da Dif.Soc e vai para a OS Prf
        if (strpos($convenio, 'ASSOCIADO') === 0) {
            $alteradas = array_merge($alteradas, aplicarApoioPrefeituraAssociado($pdo, $atendimentoId, $at, $usuarioId));
        }
        // 3) contrato do titular (Associado)
        $conv = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO');
        if ($conv && $contrato && strpos($convenio, 'ASSOCIADO') === 0) {
            definirContratoAssociado($pdo, (int) $conv['id'], $contrato, $titular, $usuarioId);
        }
        // Associado: guarda na OS do plano qual pacote foi aplicado (a Prefeitura já guarda em aplicarPacoteNaOS).
        if ($conv && $cadVinculo && $pacoteEfetivo !== null && strpos($convenio, 'ASSOCIADO') === 0 && $conv['pacote_id'] === null) {
            $pdo->prepare('UPDATE os_ordens SET pacote_id = :p WHERE id = :id')->execute(['p' => (int) $pacoteEfetivo, 'id' => (int) $conv['id']]);
        }
        // Dif sem nada a cobrar não fica no sistema (não ocupa número nem aparece zerada no Financeiro).
        if (($descartada = descartarDiferencaVazia($pdo, 'ATENDIMENTO', $atendimentoId, null)) !== null) {
            $alteradas[] = $descartada;
        }
        $part = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR');
        $apoio = strpos($convenio, 'ASSOCIADO') === 0 ? localizarOSApoioPrefeitura($pdo, $atendimentoId) : null;
        return ['convenio' => $convenio, 'alteracoes' => $alteradas,
                'os_convenio' => $conv ? buscarOSPorId($pdo, (int) $conv['id']) : null, 'os_particular' => $part ? buscarOSPorId($pdo, (int) $part['id']) : null,
                'os_prefeitura' => $apoio ? buscarOSPorId($pdo, (int) $apoio['id']) : null];
        });
    } finally {
        contextoPacote(null, true);
        dataReferenciaOS(null, true);
    }
}

/**
 * Convênio, pacote ou autorização do atendimento mudaram em relação às OS já geradas?
 *  - todas as OS ABERTAS: itens apagados e OS canceladas (a montagem seguinte cria as novas, já com o pacote e a autorização certos);
 *  - alguma já confirmada/assinada: nada é mexido; devolve o aviso para o agente reabrir a OS.
 */
function reconciliarOSComVinculo(PDO $pdo, int $atendimentoId, string $convenioNovo, ?int $pacoteNovoId, ?int $usuarioId, bool &$bloqueada = false, ?string $convenioCoroa = null, bool $semPacote = false): ?string {
    $st = $pdo->prepare("SELECT * FROM os_ordens WHERE tipo = 'ATENDIMENTO' AND atendimento_id = :a AND status <> 'CANCELADA' ORDER BY id FOR UPDATE");
    $st->execute(['a' => $atendimentoId]);
    $ordens = $st->fetchAll();
    $diverge = false;
    foreach ($ordens as $o) {
        // OS só da coroa autorizada (Prefeitura sem o pacote de atendimento): convive com a OS da família
        $soCoroa = $convenioCoroa !== null && $o['natureza'] === 'CONVENIO' && $o['pacote_id'] === null && strtoupper((string) $o['convenio']) === strtoupper($convenioCoroa);
        // OS Prf que paga a diferença do associado (09/10/2026): convive com a Soc e a Dif.Soc; a troca de Prefeitura é tratada
        // por aplicarApoioPrefeituraAssociado (refaz só a Prf).
        $apoioAssoc = strpos(strtoupper($convenioNovo), 'ASSOCIADO') === 0 && $o['natureza'] === 'CONVENIO' && $o['pacote_id'] === null
            && strpos(strtoupper((string) $o['convenio']), 'PREFEITURA') === 0;
        if ($apoioAssoc) {
            continue;
        }
        if (!$soCoroa && strtoupper((string) $o['convenio']) !== strtoupper($convenioNovo)) {
            $diverge = true;
        }
        if ($o['natureza'] === 'CONVENIO' && $pacoteNovoId !== null && $o['pacote_id'] !== null && (int) $o['pacote_id'] !== $pacoteNovoId) {
            $diverge = true;
        }
        // Autorização do atendimento mudou com o mesmo convênio (09/10/2026): Sim → Não (a OS da Prefeitura tinha o pacote)
        // ou Não → Sim (a OS da Prefeitura estava sem o pacote, com os itens inteiros na Dif.Prf). Refaz as OS.
        if ($o['natureza'] === 'CONVENIO' && strtoupper((string) $o['convenio']) === strtoupper($convenioNovo) && strpos(strtoupper($convenioNovo), 'PREFEITURA') === 0) {
            if ($semPacote && $o['pacote_id'] !== null) {
                $diverge = true;
            } elseif (!$semPacote && !$soCoroa && $pacoteNovoId !== null && $o['pacote_id'] === null) {
                $diverge = true;
            }
        }
    }
    if (!$diverge) {
        return null;
    }
    foreach ($ordens as $o) {
        if ($o['status'] !== 'ABERTA') {
            $bloqueada = true;
            return "OS {$o['numero_os']} está {$o['status']}: o convênio, o pacote ou a autorização mudou, mas a OS não foi refeita — reabra a OS para aplicar.";
        }
    }
    foreach ($ordens as $o) {
        $pdo->prepare('DELETE FROM os_itens WHERE os_id = :id')->execute(['id' => $o['id']]);
        $pdo->prepare("UPDATE os_ordens SET status = 'CANCELADA', valor_total = 0, pacote_id = NULL, valor_pacote = NULL WHERE id = :id")->execute(['id' => $o['id']]);
        registrarEvento($pdo, (int) $o['id'], 'OS_CANCELADA', 'OS refeita: o convênio, o pacote ou a autorização da Prefeitura do atendimento mudou.', $usuarioId);
    }
    return 'OS refeita: o convênio, o pacote ou a autorização da Prefeitura mudou.';
}

/* =====================================================================================================================
 * ASSOCIADO COM APOIO DA PREFEITURA (09/10/2026)
 *
 * No registro de um associado, a tanatopraxia e o translado que o plano não cobre ganham o botão Particular | Prefeitura
 * (Particular já marcado). Com Prefeitura, a parte que iria para a família sai da Dif.Soc e vai para uma OS Prf do atendimento:
 *  - tanatopraxia simples sem cobertura do plano: a Prefeitura paga tudo (preço do contrato);
 *  - tanatopraxia avançada / embalsamamento sem cobertura: a Prefeitura paga o valor da simples do contrato e a família
 *    paga o resto (preço do escolhido − contrato), na Dif.Soc;
 *  - translado: o plano cobre até o limite de km; os km excedentes vão para a Prefeitura, pelo preço do km do contrato.
 * Campos do atendimento: tanato_autorizado_prefeitura / translado_autorizado_prefeitura = 'Sim' (Prefeitura) e
 * prefeitura_apoio_convenio_id (a Prefeitura escolhida, do cadastro de Convênios).
 * Desde 24/11/2026 o botão vale também para o que o plano JÁ cobre: com Prefeitura, a tanatopraxia sai da OS do plano (Soc)
 * e vai para a OS Prf pelo preço do contrato da Prefeitura (avançada e embalsamamento: a Prefeitura paga a simples do
 * contrato e a família paga o resto). No translado informa-se o total de km e os "Km pagos pela Prefeitura"
 * (translado_km_prefeitura): 1º a Prefeitura paga esses km, 2º o plano cobre o restante até o limite, 3º a família paga o
 * que sobrar; cada OS fica só com os seus km.
 * As OS nascem nesta ordem: Soc, Dif.Soc e por último a Prf. Se a Dif.Soc ficar sem nada, é apagada (regra de 06/10).
 * ===================================================================================================================== */

const CATEGORIAS_PREPARO = ['TANATOPRAXIA', 'TANATOPRAXIA_AVANCADA', 'EMBALSAMAMENTO'];

/** Prefeitura escolhida no registro (cadastro de Convênios): código da OS e nome. Erro claro se não servir. */
function prefeituraDoApoio(PDO $pdo, int $convenioId): array {
    $q = $pdo->prepare('SELECT * FROM convenios WHERE id = :id');
    $q->execute(['id' => $convenioId]);
    $cad = $q->fetch();
    $codigo = $cad ? strtoupper(trim((string) ($cad['os_codigo'] ?? ''))) : '';
    if (!$cad || previaTipoDoCadastro($cad) !== 'PREFEITURA' || $codigo === '') {
        throw new RegraNegocioException('A Prefeitura escolhida para pagar a diferença não é uma Prefeitura do cadastro de Convênios. Escolha de novo.', 422);
    }
    if ((int) ($cad['ativo'] ?? 1) !== 1) {
        throw new RegraNegocioException("A {$cad['nome']} está desativada em Convênios: escolha outra Prefeitura ou Particular.", 422);
    }
    return ['codigo' => $codigo, 'nome' => (string) $cad['nome']];
}

/** Apaga a OS ainda em rascunho (sem financeiro e sem NP; o número volta se for o último) ou, se não der, cancela. */
function descartarOSRascunho(PDO $pdo, array $os, ?int $usuarioId, string $motivo): string {
    $osId = (int) $os['id'];
    $temMovimento = false;
    foreach (['SELECT COUNT(*) FROM os_financeiro WHERE os_id = :id', 'SELECT COUNT(*) FROM os_np WHERE os_id = :id'] as $sql) {
        $q = $pdo->prepare($sql);
        $q->execute(['id' => $osId]);
        $temMovimento = $temMovimento || (int) $q->fetchColumn() > 0;
    }
    if ($temMovimento || $os['status'] !== 'ABERTA') {
        $pdo->prepare('DELETE FROM os_itens WHERE os_id = :id')->execute(['id' => $osId]);
        $pdo->prepare("UPDATE os_ordens SET status = 'CANCELADA', valor_total = 0 WHERE id = :id")->execute(['id' => $osId]);
        registrarEvento($pdo, $osId, 'OS_CANCELADA', $motivo, $usuarioId);
        return "OS {$os['numero_os']} cancelada: {$motivo}";
    }
    foreach (['os_precos_log', 'os_documentos_log'] as $tabela) {
        $pdo->prepare("DELETE FROM {$tabela} WHERE os_id = :id")->execute(['id' => $osId]);
    }
    $pdo->prepare('DELETE FROM os_itens WHERE os_id = :id')->execute(['id' => $osId]);
    $pdo->prepare('DELETE FROM os_eventos WHERE os_id = :id')->execute(['id' => $osId]);
    $pdo->prepare('DELETE FROM os_ordens WHERE id = :id')->execute(['id' => $osId]);
    $seq = (int) $os['numero_seq'];
    $ult = $pdo->query("SELECT ultimo FROM os_sequencia WHERE sufixo = 'GERAL' FOR UPDATE")->fetchColumn();
    if ($seq > 0 && (int) $ult === $seq) {
        $pdo->prepare("UPDATE os_sequencia SET ultimo = ultimo - 1 WHERE sufixo = 'GERAL' AND ultimo = :s")->execute(['s' => $seq]);
    }
    return "OS {$os['numero_os']} descartada: {$motivo}";
}

/** Cria a OS Prf do apoio ao associado (natureza CONVENIO, sem pacote). Não usa obterOuCriarOS: a OS do convênio do atendimento é a Soc. */
function criarOSApoioPrefeitura(PDO $pdo, int $atendimentoId, string $codigo, ?int $usuarioId): array {
    exigirConvenioAtivo($codigo);
    $n = reservarNumeros($pdo, 1);
    $pdo->prepare(
        'INSERT INTO os_ordens (numero_os, numero_seq, seq_dif_reservada, tipo, atendimento_id, coroa_pedido_id, natureza, convenio, status, criado_por)
         VALUES (:numero, :seq, NULL, \'ATENDIMENTO\', :atendimento, NULL, \'CONVENIO\', :convenio, \'ABERTA\', :criadoPor)'
    )->execute([
        'numero' => formatarNumeroOS($n, sufixoNumeroOS('ATENDIMENTO', 'CONVENIO', $codigo)), 'seq' => $n,
        'atendimento' => $atendimentoId, 'convenio' => $codigo, 'criadoPor' => $usuarioId,
    ]);
    $os = buscarOSPorId($pdo, (int) $pdo->lastInsertId());
    registrarEvento($pdo, (int) $os['id'], 'OS_CRIADA', "OS {$os['numero_os']} aberta (" . rotuloTipoOS($os) . ' — paga a diferença do associado)', $usuarioId);
    return $os;
}

/**
 * Passa para a OS Prf o que a Prefeitura paga num atendimento de associado. Roda no fim da montagem (montarOSDoAtendimento),
 * depois que a tanatopraxia e o translado já foram lançados pelas regras do plano (o que o plano não cobre está na Dif.Soc).
 * Devolve as linhas para a lista de alterações.
 */
function aplicarApoioPrefeituraAssociado(PDO $pdo, int $atendimentoId, array $at, ?int $usuarioId): array {
    $alteradas = [];
    $convApoioId = (int) ($at['prefeitura_apoio_convenio_id'] ?? 0);
    $querTan = $convApoioId > 0 && simNao($at['tanato'] ?? '') && simNao($at['tanato_autorizado_prefeitura'] ?? '');
    $querTra = $convApoioId > 0 && simNao($at['translado'] ?? '') && simNao($at['translado_autorizado_prefeitura'] ?? '');
    $pref = ($querTan || $querTra) ? prefeituraDoApoio($pdo, $convApoioId) : null;

    $prf = localizarOSApoioPrefeitura($pdo, $atendimentoId);
    if ($prf && $prf['status'] !== 'ABERTA') {
        if (!$pref || strtoupper((string) $prf['convenio']) !== $pref['codigo']) {
            throw new RegraNegocioException("OS {$prf['numero_os']} (Prefeitura) está " . rotuloStatusSimples($prf) . ': para mudar quem paga, o Financeiro reabre a OS.', 409);
        }
    } elseif ($prf && (!$pref || strtoupper((string) $prf['convenio']) !== $pref['codigo'])) {
        $alteradas[] = descartarOSRascunho($pdo, $prf, $usuarioId, 'a Prefeitura deixou de pagar a diferença do associado.');
        $prf = null;
    }
    if (!$pref) {
        return $alteradas;
    }

    // 1) o que sai da Dif.Soc (lançado agora pelas regras do plano)
    $dif = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR');
    $soc = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO');
    $mover = [];
    $marcas = implode(',', array_fill(0, count(CATEGORIAS_PREPARO), '?'));
    $mexeuSoc = false;
    // Serviço que o plano JÁ cobre e a Prefeitura vai pagar (24/11/2026): sai da OS do plano (Soc) e vai inteiro para a Prf,
    // pelo preço do contrato da Prefeitura. Tanatopraxia avançada/embalsamamento: a Prefeitura paga a simples do contrato e a
    // família paga o resto (preço do escolhido − contrato), como no apoio sem cobertura.
    if ($querTan && $soc) {
        $q = $pdo->prepare("SELECT * FROM os_itens WHERE os_id = ? AND tipo_item = 'PADRAO' AND categoria IN ({$marcas}) ORDER BY id");
        $q->execute(array_merge([(int) $soc['id']], CATEGORIAS_PREPARO));
        $itensSoc = $q->fetchAll();
        if ($itensSoc) {
            exigirOSAberta($soc);
            $contrato = (float) (precoContratoPrefeitura($pdo, $pref['codigo'], 'TANATOPRAXIA') ?? 0);
            if ($contrato <= 0) {
                throw new RegraNegocioException("Preço de contrato da tanatopraxia não cadastrado para a {$pref['nome']} — cadastre na rotina de valores dos convênios.", 422);
            }
            $apagarDif = [];
            if ($dif) {
                $q = $pdo->prepare("SELECT id FROM os_itens WHERE os_id = ? AND tipo_item = 'DIFERENCA' AND categoria IN ({$marcas})");
                $q->execute(array_merge([(int) $dif['id']], CATEGORIAS_PREPARO));
                $apagarDif = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));
                if ($apagarDif) {
                    exigirOSAberta($dif);
                }
            }
            foreach ($itensSoc as $i => $it) {
                $pid = (int) $it['produto_id'];
                $preco = buscarPrecoVenda($pdo, $pid);
                $mover[] = ['item' => $it, 'apagar' => $i === 0 ? $apagarDif : [], 'categoria' => (string) $it['categoria'], 'produto_id' => $pid, 'tabela' => $preco,
                            'contrato' => dinheiro($contrato * max(1, (int) $it['quantidade'])),
                            'resta_familia' => $it['categoria'] === 'TANATOPRAXIA' ? 0.0 : max(0.0, dinheiro($preco - $contrato)), 'translado' => null, 'coberto_plano' => true];
            }
            $mexeuSoc = true;
            $querTan = false;   // já resolvido acima
        }
    }
    // Translado com a Prefeitura (24/11/2026): um total de km e os "Km pagos pela Prefeitura" (translado_km_prefeitura).
    // Ordem: 1º a Prefeitura paga os km informados (OS Prf, preço do km do contrato); 2º o plano cobre o restante até o
    // limite (aditivo/KM ILIMITADO = tudo), na Soc; 3º o que sobrar vai para a família (Dif.Soc). Cada OS fica só com os seus km.
    // Sem km informados (registros antigos): a Prefeitura paga os km excedentes ou, sem excedente, o translado inteiro.
    if ($querTra && $soc) {
        $q = $pdo->prepare("SELECT * FROM os_itens WHERE os_id = :id AND tipo_item = 'PADRAO' AND categoria = 'TRANSLADO' ORDER BY id");
        $q->execute(['id' => (int) $soc['id']]);
        $itSoc = $q->fetchAll();
        $itDif = [];
        if ($dif) {
            $q = $pdo->prepare("SELECT * FROM os_itens WHERE os_id = :id AND tipo_item = 'DIFERENCA' AND categoria = 'TRANSLADO' ORDER BY id");
            $q->execute(['id' => (int) $dif['id']]);
            $itDif = $q->fetchAll();
        }
        if ($itSoc || $itDif) {
            exigirOSAberta($soc);
            if ($itDif) {
                exigirOSAberta($dif);
            }
            $base = $itSoc[0] ?? $itDif[0];
            $pidT = (int) $base['produto_id'];
            $origem = (string) $base['translado_origem'];
            $destino = (string) $base['translado_destino'];
            $kmSoc = array_sum(array_map(fn ($i) => (float) ($i['translado_km'] ?? 0), $itSoc));
            $kmDif = array_sum(array_map(fn ($i) => (float) ($i['translado_km'] ?? 0), $itDif));
            $kmTotal = round($kmSoc + $kmDif, 1);
            $kmInformado = round((float) str_replace(',', '.', (string) ($at['translado_km_prefeitura'] ?? '')), 1);
            $kmPref = $kmInformado > 0 ? min($kmInformado, $kmTotal) : ($kmDif > 0 ? round($kmDif, 1) : $kmTotal);
            $resto = round($kmTotal - $kmPref, 1);
            $limite = in_array('TRANSLADO', aditivosDoContrato($soc), true) ? null : kmTransladoCobertoPeloPlano($pdo, (string) $soc['convenio']);
            $kmPlano = $limite === null ? $resto : round(min($resto, max(0.0, (float) $limite)), 1);
            $kmFam = round($resto - $kmPlano, 1);
            $pcKm = (float) (precoContratoPrefeitura($pdo, $pref['codigo'], 'TRANSLADO_KM') ?? 0);
            if ($pcKm <= 0) {
                throw new RegraNegocioException("Preço do km do translado não cadastrado no contrato da {$pref['nome']} — cadastre na rotina de valores dos convênios.", 422);
            }
            $valorKm = buscarPrecoVenda($pdo, $pidT);
            foreach (array_merge($itSoc, $itDif) as $it) {
                $pdo->prepare('DELETE FROM os_itens WHERE id = :id')->execute(['id' => (int) $it['id']]);
            }
            $trecho = "Translado {$origem} → {$destino} (" . number_format($kmTotal, 1, ',', '.') . ' km)';
            $upKm = $pdo->prepare('UPDATE os_itens SET translado_origem = :o, translado_destino = :d, translado_km = :k WHERE id = :id');
            if ($kmPlano > 0) {
                $v = dinheiro($kmPlano * $valorKm);
                $novo = inserirItemCoberto($pdo, (int) $soc['id'], $pidT, 'TRANSLADO', 1, $v, $v);
                $upKm->execute(['o' => $origem, 'd' => $destino, 'k' => $kmPlano, 'id' => $novo['id']]);
                marcarComoCoberto($pdo, (int) $soc['id']);
            }
            registrarEvento($pdo, (int) $soc['id'], 'ITEM_INCLUIDO', "{$trecho} — {$pref['nome']} paga " . number_format($kmPref, 1, ',', '.') . ' km; plano cobre '
                . number_format($kmPlano, 1, ',', '.') . ' km' . ($kmFam > 0 ? '; família paga ' . number_format($kmFam, 1, ',', '.') . ' km' : ''), $usuarioId);
            if ($kmFam > 0) {
                $dif = $dif ?: obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR', (string) $soc['convenio'], $usuarioId);
                $v = dinheiro($kmFam * $valorKm);
                $novo = inserirItem($pdo, (int) $dif['id'], $pidT, 'TRANSLADO', 1, $v, false, 'DIFERENCA');
                $upKm->execute(['o' => $origem, 'd' => $destino, 'k' => $kmFam, 'id' => $novo['id']]);
                registrarEvento($pdo, (int) $dif['id'], 'ITEM_INCLUIDO', "{$trecho} — " . number_format($kmFam, 1, ',', '.') . ' km pagos pela família: ' . formatarReais($v), $usuarioId, $v);
            }
            if ($kmPref > 0) {
                $mover[] = ['item' => ['id' => 0], 'apagar' => [], 'categoria' => 'TRANSLADO', 'produto_id' => $pidT,
                            'tabela' => dinheiro($kmPref * $valorKm), 'contrato' => dinheiro($pcKm * $kmPref), 'resta_familia' => 0.0,
                            'translado' => [$origem, $destino, $kmPref], 'coberto_plano' => false, 'texto_km' => ' km pagos pela Prefeitura'];
            }
            $mexeuSoc = true;
            $querTra = false;   // já resolvido acima
        }
    }
    // Serviço sem cobertura (ou km excedentes) que estava na Dif.Soc (regra de 09/10/2026)
    if ($dif && $dif['status'] === 'ABERTA') {
        if ($querTan) {
            $q = $pdo->prepare("SELECT * FROM os_itens WHERE os_id = ? AND tipo_item = 'DIFERENCA' AND categoria IN ({$marcas}) ORDER BY id");
            $q->execute(array_merge([(int) $dif['id']], CATEGORIAS_PREPARO));
            $itensTan = $q->fetchAll();
            if ($itensTan) {
                $contrato = (float) (precoContratoPrefeitura($pdo, $pref['codigo'], 'TANATOPRAXIA') ?? 0);
                if ($contrato <= 0) {
                    throw new RegraNegocioException("Preço de contrato da tanatopraxia não cadastrado para a {$pref['nome']} — cadastre na rotina de valores dos convênios.", 422);
                }
                foreach ($itensTan as $it) {
                    $pid = (int) $it['produto_id'];
                    $preco = buscarPrecoVenda($pdo, $pid);
                    $mover[] = ['item' => $it, 'apagar' => [], 'categoria' => (string) $it['categoria'], 'produto_id' => $pid, 'tabela' => $preco,
                                'contrato' => dinheiro($contrato * max(1, (int) $it['quantidade'])),
                                'resta_familia' => $it['categoria'] === 'TANATOPRAXIA' ? 0.0 : dinheiro($preco - $contrato), 'translado' => null, 'coberto_plano' => false];
                }
            }
        }
        if ($querTra) {
            $q = $pdo->prepare("SELECT * FROM os_itens WHERE os_id = :id AND tipo_item = 'DIFERENCA' AND categoria = 'TRANSLADO' ORDER BY id");
            $q->execute(['id' => (int) $dif['id']]);
            $itensTra = $q->fetchAll();
            if ($itensTra) {
                $pcKm = (float) (precoContratoPrefeitura($pdo, $pref['codigo'], 'TRANSLADO_KM') ?? 0);
                if ($pcKm <= 0) {
                    throw new RegraNegocioException("Preço do km do translado não cadastrado no contrato da {$pref['nome']} — cadastre na rotina de valores dos convênios.", 422);
                }
                foreach ($itensTra as $it) {
                    $km = (float) ($it['translado_km'] ?? 0);
                    $mover[] = ['item' => $it, 'apagar' => [], 'categoria' => 'TRANSLADO', 'produto_id' => (int) $it['produto_id'],
                                'tabela' => (float) $it['valor_unitario_travado'], 'contrato' => dinheiro($pcKm * $km), 'resta_familia' => 0.0,
                                'translado' => [(string) $it['translado_origem'], (string) $it['translado_destino'], $km], 'coberto_plano' => false];
                }
            }
        }
    }
    if ($mover || $mexeuSoc) {
        foreach ($mover as $m) {
            if ((int) $m['item']['id'] > 0) {
                $pdo->prepare('DELETE FROM os_itens WHERE id = :id')->execute(['id' => (int) $m['item']['id']]);
            }
            foreach ($m['apagar'] as $idApagar) {
                $pdo->prepare('DELETE FROM os_itens WHERE id = :id')->execute(['id' => (int) $idApagar]);
            }
            if ($m['coberto_plano'] && !$m['translado']) {
                registrarEvento($pdo, (int) $soc['id'], 'ITEM_REMOVIDO', nomeProduto($pdo, $m['produto_id'])
                    . " — coberto pelo plano, mas pago pela {$pref['nome']}: saiu desta OS", $usuarioId);
            }
            if ($m['resta_familia'] > 0) {   // avançada / embalsamamento: a família paga o que passa da tanatopraxia simples do contrato
                $dif = $dif ?: obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR', (string) $soc['convenio'], $usuarioId);
                inserirItem($pdo, (int) $dif['id'], $m['produto_id'], $m['categoria'], 1, $m['resta_familia'], false, 'DIFERENCA');
                registrarEvento($pdo, (int) $dif['id'], 'ITEM_INCLUIDO', nomeProduto($pdo, $m['produto_id']) . " — a {$pref['nome']} paga a tanatopraxia simples; a família paga a diferença de "
                    . formatarReais($m['resta_familia']), $usuarioId, $m['resta_familia']);
            }
        }
        if ($mexeuSoc) {
            recalcularValorTotal($pdo, (int) $soc['id']);   // OS do plano continua zerada; só limpa a confirmação
        }
        if ($dif) {
            recalcularValorTotal($pdo, (int) $dif['id']);
            if (($msg = descartarDiferencaVazia($pdo, 'ATENDIMENTO', $atendimentoId, null)) !== null) {
                $alteradas[] = $msg;
            }
        }
    }

    // 2) a OS Prf: refeita do zero enquanto estiver aberta (concluída fica como está)
    if ($prf && $prf['status'] !== 'ABERTA') {
        return $alteradas;
    }
    if ($prf) {
        $pdo->prepare('DELETE FROM os_itens WHERE os_id = :id')->execute(['id' => (int) $prf['id']]);
    }
    if (!$mover) {
        if ($prf) {
            $alteradas[] = descartarOSRascunho($pdo, $prf, $usuarioId, 'nada a cobrar da Prefeitura neste atendimento.');
        }
        return $alteradas;
    }
    $prf = $prf ?: criarOSApoioPrefeitura($pdo, $atendimentoId, $pref['codigo'], $usuarioId);
    foreach ($mover as $m) {
        $novo = inserirItem($pdo, (int) $prf['id'], $m['produto_id'], $m['categoria'], 1, $m['tabela'], true, 'REFERENCIA');
        $pdo->prepare('UPDATE os_itens SET valor_contrato_item = :v WHERE id = :id')->execute(['v' => $m['contrato'], 'id' => $novo['id']]);
        if ($m['translado']) {
            $pdo->prepare('UPDATE os_itens SET translado_origem = :o, translado_destino = :d, translado_km = :k WHERE id = :id')
                ->execute(['o' => $m['translado'][0], 'd' => $m['translado'][1], 'k' => $m['translado'][2], 'id' => $novo['id']]);
        }
        $nome = $m['translado']
            ? 'Translado ' . $m['translado'][0] . ' → ' . $m['translado'][1] . ' — ' . number_format($m['translado'][2], 1, ',', '.') . ($m['texto_km'] ?? ($m['coberto_plano'] ? ' km (coberto pelo plano)' : ' km acima do limite do plano'))
            : nomeProduto($pdo, $m['produto_id']) . ($m['coberto_plano'] ? ' (coberta pelo plano)' : '');
        registrarEvento($pdo, (int) $prf['id'], 'ITEM_INCLUIDO', "{$nome} — pago pela {$pref['nome']} (contrato: " . formatarReais($m['contrato']) . ')', $usuarioId, $m['contrato']);
        $alteradas[] = ($m['translado'] ? (isset($m['texto_km']) ? 'TRANSLADO (' . number_format($m['translado'][2], 1, ',', '.') . ' km)' : ($m['coberto_plano'] ? 'TRANSLADO' : 'TRANSLADO (km excedentes)')) : $m['categoria']) . ": pago pela {$pref['nome']} ({$prf['numero_os']})";
    }
    recalcularTotalPrefeitura($pdo, (int) $prf['id']);
    return $alteradas;
}


/* =====================================================================================================================
 * DADOS DA OS NO ATENDIMENTO (tela "Editar registro")
 *
 * O app salva o atendimento no informativo.php, que não conhece as colunas novas da OS. Estas rotinas gravam e leem SOMENTE
 * as colunas novas sugeridas em alteracoes_atendimento_sugeridas.sql (lista fechada abaixo), na tabela do mapa_atendimento.
 * Depois de gravar, o app chama sincronizar_os_atendimento para montar/atualizar as OS.
 * ===================================================================================================================== */

/** Colunas novas da OS no atendimento: tipo de validação de cada uma. */
function camposOSAtendimento(): array {
    return [
        'convenio_os' => 'convenio_os',
        'convenio_id' => 'idpositivo',                    // convênio do cadastro (convenio.php)
        'pacote_id' => 'idpositivo',                      // pacote escolhido no registro
        'pacote_autorizado_prefeitura' => 'simnao',       // Prefeitura: autorizou o pacote de atendimento?
        'contrato_numero' => 'contrato',
        'tanato_produto_id' => 'produto',
        'tanato_autorizado_prefeitura' => 'simnao',
        'reconstituicao_facial' => 'simnao',
        'translado' => 'simnao',
        'translado_origem' => 'cidade',
        'translado_destino' => 'cidade',
        'translado_km' => 'km',
        'translado_autorizado_prefeitura' => 'simnao',
        'translado_km_prefeitura' => 'km',                // associado: km do translado pagos pela Prefeitura do apoio (24/11/2026)
        'coroa_autorizada_prefeitura' => 'simnao',        // Prefeitura com pacote de coroa: autorizou a coroa? (vale sem o pacote de atendimento)
        'prefeitura_apoio_convenio_id' => 'idpositivo',   // associado: Prefeitura que paga a diferença da tanatopraxia/translado (09/10/2026)
        'local_cerimonia' => 'local_cerimonia',           // local do velório (lista fixa no front; aqui só grava o texto)
        // 16/11/2026: serviço terceirizado (só registro operacional; NÃO muda o cálculo da OS).
        'tanato_terceirizado' => 'simnao',                // Sim = conservação feita por terceiros (sem Início/Fim da conservação)
        'translado_terceirizado' => 'simnao',             // Sim = remoção feita por terceiros (sem Indo retirar o óbito)
    ];
}

function tabelaAtendimentoValida(): string {
    $tabela = (string) mapaAtendimento()['tabela'];
    if (!preg_match('/^[A-Za-z0-9_]+$/', $tabela)) {
        throw new RuntimeException('mapa_atendimento.tabela inválida');
    }
    return $tabela;
}

/** Quais das colunas novas existem na tabela do atendimento. */
function colunasOSExistentes(PDO $pdo): array {
    $tabela = tabelaAtendimentoValida();
    $st = $pdo->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t');
    $st->execute(['t' => $tabela]);
    $existentes = array_map('strtolower', $st->fetchAll(PDO::FETCH_COLUMN));
    $r = [];
    foreach (array_keys(camposOSAtendimento()) as $c) {
        $r[$c] = in_array(strtolower($c), $existentes, true);
    }
    return $r;
}

/** Lê os campos da OS do atendimento (para preencher a tela ao editar). */
function lerDadosOSAtendimento(PDO $pdo, int $atendimentoId): array {
    $tabela = tabelaAtendimentoValida();
    $existe = colunasOSExistentes($pdo);
    $faltando = array_keys(array_filter($existe, fn ($v) => !$v));
    $cols = array_keys(array_filter($existe));
    $linha = [];
    $sel = array_merge(['id', 'convenio'], $cols);
    $st = $pdo->prepare('SELECT `' . implode('`,`', $sel) . "` FROM `{$tabela}` WHERE id = :id");
    $st->execute(['id' => $atendimentoId]);
    $linha = $st->fetch();
    if (!$linha) {
        throw new RegraNegocioException("Atendimento {$atendimentoId} não encontrado.", 404);
    }
    $campos = [];
    foreach (array_keys(camposOSAtendimento()) as $c) {
        $campos[$c] = $existe[$c] ? ($linha[$c] ?? null) : null;
    }
    return ['atendimento_id' => $atendimentoId, 'convenio_texto' => (string) ($linha['convenio'] ?? ''), 'campos' => $campos, 'colunas_faltando' => $faltando];
}

function validarCampoOS(string $campo, string $tipo, $valor, array $config) {
    $v = is_string($valor) ? trim($valor) : $valor;
    switch ($tipo) {
        case 'convenio_os': {
            $v = strtoupper((string) $v);
            if ($v === '' || $v === 'PARTICULAR') {
                return $v === '' ? null : $v;
            }
            if (strpos($v, 'ASSOCIADO_') === 0) {
                $planos = array_keys((array) osConfig('teto_urna_por_plano', []));
                if (!in_array(substr($v, 10), $planos, true)) {
                    throw new RegraNegocioException('Plano do associado inválido: ' . substr($v, 10) . '.');
                }
                return $v;
            }
            if (strpos($v, 'PREFEITURA_') === 0) {
                if (!array_key_exists($v, (array) osConfig('prefeituras', []))) {
                    throw new RegraNegocioException("Prefeitura '{$v}' não está em os_config.php → prefeituras.");
                }
                return $v;
            }
            throw new RegraNegocioException('convenio_os inválido (use PARTICULAR, ASSOCIADO_<PLANO> ou PREFEITURA_<MUNICÍPIO>).');
        }
        case 'contrato':
            $v = (string) $v;
            if ($v !== '' && !preg_match('/^[0-9A-Za-z.\/\- ]{1,40}$/', $v)) {
                throw new RegraNegocioException('Número do contrato inválido.');
            }
            return $v === '' ? null : $v;
        case 'idpositivo':   // id do convênio / do pacote no cadastro de Convênios (vazio ou 0 = sem vínculo)
            if ($v === '' || $v === null) {
                return null;
            }
            if (!ctype_digit((string) $v)) {
                throw new RegraNegocioException("{$campo}: valor inválido.");
            }
            return (int) $v > 0 ? (int) $v : null;
        case 'produto':
            if ($v === '' || $v === null || (int) $v === 0) {
                return null;
            }
            if (!ctype_digit((string) $v)) {
                throw new RegraNegocioException('Modelo de tanatopraxia inválido.');
            }
            return (int) $v;
        case 'local_cerimonia': {
            $t = trim(preg_replace('/\s+/u', ' ', (string) $v));
            if ($t === '') {
                return null;
            }
            if (mb_strlen($t) > 80) {
                throw new RegraNegocioException('Local do velório: no máximo 80 caracteres.');
            }
            return $t;
        }
        case 'simnao': {
            $t = mb_strtolower((string) $v);
            if ($t === '') {
                return null;
            }
            if (in_array($t, ['sim', 's', '1', 'true'], true)) {
                return 'Sim';
            }
            if (in_array($t, ['não', 'nao', 'n', '0', 'false'], true)) {
                return 'Não';
            }
            throw new RegraNegocioException("{$campo}: use Sim ou Não.");
        }
        case 'cidade':
            $v = preg_replace('/\s+/u', ' ', (string) $v);
            if (mb_strlen($v) > 100) {
                throw new RegraNegocioException("{$campo}: máximo de 100 caracteres.");
            }
            return $v === '' ? null : $v;
        case 'km': {
            $s = str_replace(',', '.', (string) $v);
            if ($s === '') {
                return null;
            }
            if (!is_numeric($s) || (float) $s < 0 || (float) $s > 99999) {
                throw new RegraNegocioException('Distância (km) inválida.');
            }
            return round((float) $s, 1);
        }
    }
    throw new RuntimeException("Tipo de campo desconhecido: {$tipo}");
}

/**
 * Grava só os campos recebidos (lista fechada). Campo que não vier não é alterado.
 * Se faltar coluna no banco, devolve erro explicando qual SQL rodar (nada é gravado pela metade).
 */
function salvarDadosOSAtendimento(PDO $pdo, int $atendimentoId, array $entrada): array {
    $tabela = tabelaAtendimentoValida();
    $existe = colunasOSExistentes($pdo);
    $sets = [];
    $par = ['id' => $atendimentoId];
    $faltam = [];
    foreach (camposOSAtendimento() as $campo => $tipo) {
        if (!array_key_exists($campo, $entrada)) {
            continue;
        }
        if (!$existe[$campo]) {
            // Coluna nova do apoio da Prefeitura (09/10/2026): vazia não exige a coluna (o app manda o campo em todo associado).
            if (($campo === 'prefeitura_apoio_convenio_id' || $campo === 'translado_km_prefeitura') && validarCampoOS($campo, $tipo, $entrada[$campo], []) === null) {
                continue;
            }
            // Terceirizado (16/11/2026): sem a coluna (SQL ainda não rodado) não trava o salvamento do atendimento.
            if ($campo === 'tanato_terceirizado' || $campo === 'translado_terceirizado') {
                error_log("os_regras: coluna {$campo} ausente; rode o terceirizado_tanato_translado.sql");
                continue;
            }
            $faltam[] = $campo;
            continue;
        }
        $sets[] = "`{$campo}` = :{$campo}";
        $par[$campo] = validarCampoOS($campo, $tipo, $entrada[$campo], []);
    }
    if ($faltam) {
        throw new RegraNegocioException('Faltam colunas na tabela ' . $tabela . ': ' . implode(', ', $faltam) . '. Rode o alteracoes_atendimento_sugeridas.sql.', 409);
    }
    if ($sets) {
        $st = $pdo->prepare("UPDATE `{$tabela}` SET " . implode(', ', $sets) . ' WHERE id = :id');
        $st->execute($par);
    }
    return lerDadosOSAtendimento($pdo, $atendimentoId);
}

/** Modelos do campo "Tipo de procedimento": tanatopraxia, tanatopraxia avançada e embalsamamento. A reconstituição facial NÃO é uma opção: é um adicional Sim/Não (reconstituicao_facial). */
function listarModelosTanatopraxia(PDO $pdo): array {
    $preparo = (array) osConfig('produtos_preparo', []);
    $ids = [];
    foreach ($preparo as $lista) {
        foreach ((array) $lista as $i) {
            $ids[] = (int) $i;
        }
    }
    try {
        $ids[] = produtoTanatopraxiaNormal($pdo);
    } catch (RegraNegocioException $e) {
        // sem produto "Tanatopraxia" único: segue só com a busca por nome
    }
    $porNome = $pdo->query("SELECT id FROM est_produto WHERE UPPER(nome) LIKE 'TANATOPRAXIA%' OR UPPER(nome) LIKE 'EMBALSAM%' ORDER BY nome")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($porNome as $i) {
        $ids[] = (int) $i;
    }
    $ids = array_values(array_unique(array_filter($ids)));
    $r = [];
    foreach ($ids as $i) {
        $r[] = ['produto_id' => $i, 'nome' => nomeProduto($pdo, $i)];
    }
    usort($r, fn ($a, $b) => strcmp($a['nome'], $b['nome']));
    return $r;
}

/** Produto do serviço adicional "Reconstituição facial": os_config.php → produto_reconstituicao_facial, ou o 1º produto cujo nome começa por RECONSTITU. */
function produtoReconstituicaoFacial(PDO $pdo): int {
    $cfg = (int) osConfig('produto_reconstituicao_facial', 0);
    if ($cfg > 0) {
        return $cfg;
    }
    $id = $pdo->query("SELECT id FROM est_produto WHERE UPPER(nome) LIKE 'RECONSTITU%' ORDER BY id LIMIT 1")->fetchColumn();
    if (!$id) {
        throw new RegraNegocioException('Cadastre o produto "Reconstituição facial" (ou informe produto_reconstituicao_facial no os_config.php).');
    }
    return (int) $id;
}

/**
 * Valor do contrato da Prefeitura NÃO aparece para o agente (só no financeiro, para quem vê todas as OS).
 * A diferença da família (OS particular) continua aparecendo. Cargos de gestão (cargos_ver_todas_os) veem tudo.
 */
function ocultarContratoPrefeitura(?array $os, ?string $cargo): ?array {
    if ($os === null) {
        return null;
    }
    $verTudo = in_array((string) $cargo, array_map('strval', (array) osConfig('cargos_ver_todas_os', ['adm', 'financeiro'])), true);
    if (!$verTudo && ($os['natureza'] ?? '') === 'CONVENIO' && strpos((string) ($os['convenio'] ?? ''), 'PREFEITURA') === 0) {
        foreach (['valor_total', 'confirmada_valor_total'] as $campo) {
            if (array_key_exists($campo, $os)) {
                $os[$campo] = null;
            }
        }
        $os['valor_oculto'] = true;
    }
    return $os;
}

/**
 * Financeiro (06/10/2026): composição do valor da OS de convênio da Prefeitura, para conferência.
 *  - o pacote de atendimento aplicado, com o valor lançado na OS, e embaixo só os itens usados no atendimento que ele cobre;
 *  - cada serviço com valor de contrato próprio (tanatopraxia, translado por km, coroa do pacote de coroa...), com o valor e os itens.
 * Só leitura. Contém valores de contrato: a ação exige a área do Financeiro.
 */
function composicaoContratoOS(PDO $pdo, int $osId): array {
    $os = buscarOSPorId($pdo, $osId);
    $rotulo = function (string $cat): string {
        return function_exists('rotuloCategoria') ? rotuloCategoria($cat) : mb_convert_case(str_replace('_', ' ', mb_strtolower($cat)), MB_CASE_TITLE, 'UTF-8');
    };
    $st = $pdo->prepare('SELECT * FROM os_itens WHERE os_id = :id ORDER BY id');
    $st->execute(['id' => $osId]);
    $itens = $st->fetchAll();
    $descricao = function (array $it) use ($pdo, $rotulo): array {
        $d = ['nome' => nomeProduto($pdo, (int) $it['produto_id']), 'categoria' => $rotulo((string) $it['categoria']), 'quantidade' => (int) $it['quantidade'], 'detalhe' => ''];
        if ($it['categoria'] === 'TRANSLADO' && $it['translado_km'] !== null) {
            $d['detalhe'] = trim((string) $it['translado_origem']) . ' → ' . trim((string) $it['translado_destino']) . ' · ' . number_format((float) $it['translado_km'], 1, ',', '.') . ' km';
        }
        return $d;
    };
    $grupos = [];
    // 1) pacote de atendimento: valor lançado na OS + itens do atendimento que ele cobre (os que não têm contrato próprio)
    $doPacote = array_values(array_filter($itens, fn ($it) => $it['valor_contrato_item'] === null));
    if ($os['pacote_id'] !== null || (float) ($os['valor_pacote'] ?? 0) > 0) {
        $nome = 'Pacote';
        if ($os['pacote_id'] !== null) {
            $q = $pdo->prepare('SELECT nome FROM os_convenio_pacotes WHERE id = :id');
            $q->execute(['id' => (int) $os['pacote_id']]);
            $nome = (string) ($q->fetchColumn() ?: 'Pacote');
        }
        $grupos[] = ['tipo' => 'PACOTE', 'titulo' => $nome, 'subtitulo' => 'Pacote de atendimento', 'valor' => dinheiro((float) ($os['valor_pacote'] ?? 0)),
                     'itens' => array_map($descricao, $doPacote)];
    } elseif ($doPacote) {
        $grupos[] = ['tipo' => 'SEM_VALOR', 'titulo' => 'Itens sem valor de contrato', 'subtitulo' => 'Sem pacote aplicado nesta OS', 'valor' => 0.0,
                     'itens' => array_map($descricao, $doPacote)];
    }
    // 2) serviços com valor de contrato próprio, um grupo por serviço (coroas: um grupo por pacote de coroa)
    $pacotesCoroa = null;
    $porChave = [];
    foreach ($itens as $it) {
        if ($it['valor_contrato_item'] === null) {
            continue;
        }
        $cat = (string) $it['categoria'];
        $titulo = $rotulo($cat);
        $sub = 'Valor de contrato';
        if ($cat === 'COROA') {
            if ($pacotesCoroa === null) {
                $pacotesCoroa = [];
                try {
                    $c = $pdo->prepare('SELECT * FROM convenios WHERE UPPER(os_codigo) = :c LIMIT 1');
                    $c->execute(['c' => strtoupper((string) $os['convenio'])]);
                    if ($row = $c->fetch()) {
                        $pacotesCoroa = pacotesDeCoroa($pdo, $row);
                    }
                } catch (Throwable $e) {
                    $pacotesCoroa = [];
                }
            }
            $nomePac = $pacotesCoroa ? (string) contratoDaCoroa($pacotesCoroa, (int) $it['produto_id'])['pacote'] : '';
            $titulo = $nomePac !== '' ? $nomePac : 'Coroa de flores';
            $sub = 'Pacote de coroa';
        } elseif ($cat === 'TRANSLADO' && (float) $it['translado_km'] > 0) {
            $sub = 'Contrato: ' . formatarReais(dinheiro((float) $it['valor_contrato_item'] / (float) $it['translado_km'])) . ' por km';
        } elseif (in_array($cat, ['TANATOPRAXIA', 'TANATOPRAXIA_AVANCADA', 'EMBALSAMAMENTO'], true)) {
            $titulo = 'Tanatopraxia';
            $sub = 'Valor de contrato (autorizada pela Prefeitura)';
        }
        $chave = $cat . '|' . $titulo;
        if (!isset($porChave[$chave])) {
            $porChave[$chave] = ['tipo' => 'CONTRATO', 'titulo' => $titulo, 'subtitulo' => $sub, 'valor' => 0.0, 'itens' => []];
        }
        $porChave[$chave]['valor'] = dinheiro($porChave[$chave]['valor'] + (float) $it['valor_contrato_item']);
        $porChave[$chave]['itens'][] = $descricao($it);
    }
    $grupos = array_merge($grupos, array_values($porChave));
    $soma = dinheiro(array_sum(array_column($grupos, 'valor')));
    return ['os_id' => $osId, 'numero_os' => $os['numero_os'], 'grupos' => $grupos, 'soma' => $soma, 'valor_total' => dinheiro((float) $os['valor_total'])];
}

/** OS já montadas para o atendimento (só leitura; não cria nem altera nada). */
function osDoAtendimento(PDO $pdo, int $atendimentoId, ?string $cargo): array {
    $conv = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO');
    $part = localizarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR');
    // Associado com apoio da Prefeitura (09/10/2026): a terceira OS do atendimento (Prf), sem o valor do contrato para agentes.
    $apoio = ($conv && strpos(strtoupper((string) $conv['convenio']), 'ASSOCIADO') === 0) ? localizarOSApoioPrefeitura($pdo, $atendimentoId) : null;
    return [
        'os_convenio' => $conv ? ocultarContratoPrefeitura(mascararOSParaResposta(buscarOSPorId($pdo, (int) $conv['id'])), $cargo) : null,
        'os_particular' => $part ? mascararOSParaResposta(buscarOSPorId($pdo, (int) $part['id'])) : null,
        'os_prefeitura' => $apoio ? ocultarContratoPrefeitura(mascararOSParaResposta(buscarOSPorId($pdo, (int) $apoio['id'])), $cargo) : null,
    ];
}


/* =====================================================================================================================
 * VÍNCULO DO REGISTRO COM OS CONVÊNIOS + PRÉVIA DA OS (nada é gravado)
 *
 *  convenios_opcoes      → convênios ativos e os pacotes ativos de cada um (campo Convênio, escolha do pacote).
 *  previa_os_atendimento → como a OS ficaria com o que está na tela agora (rascunho do registro). Usa as MESMAS funções e contas
 *                          do motor (pacote escolhido, produtos aceitos, teto da urna, km coberto, preço de contrato…); só não grava.
 *                          O valor do contrato da Prefeitura só sai para quem tem a página de convênios.
 * ===================================================================================================================== */

function previaTipoDoCadastro(array $c): string {
    $t = strtoupper(trim((string) ($c['os_tipo'] ?? '')));
    return in_array($t, ['PARTICULAR', 'ASSOCIADO', 'PREFEITURA'], true) ? $t : '';
}

/** Pacotes ATIVOS do convênio (o padrão primeiro). Sem nenhum, usa as regras do próprio convênio como "Pacote padrão" (id 0). */
function previaPacotesAtivos(PDO $pdo, array $conv, string $tipo = 'ATENDIMENTO'): array {
    $out = [];
    $temAtivo = colunaExisteOS($pdo, 'os_convenio_pacotes', 'ativo');
    $temPadrao = colunaExisteOS($pdo, 'os_convenio_pacotes', 'padrao');
    $temRegras = colunaExisteOS($pdo, 'os_convenio_pacotes', 'regras_json');
    $temTipo = colunaExisteOS($pdo, 'os_convenio_pacotes', 'tipo');
    $temOrdem = colunaExisteOS($pdo, 'os_convenio_pacotes', 'ordem');
    $codigo = strtoupper(trim((string) ($conv['os_codigo'] ?? '')));
    if ($codigo !== '' && ($temTipo || $tipo === 'ATENDIMENTO')) {
        // Ordem do cadastro (setas na tela de convênios); sem a coluna, o padrão primeiro e depois o nome.
        $st = $pdo->prepare('SELECT * FROM os_convenio_pacotes WHERE convenio = :c' . ($temAtivo ? ' AND ativo = 1' : '')
            . ($temTipo ? ' AND tipo = :t' : '')
            . ' ORDER BY ' . ($temOrdem ? 'ordem, ' : '') . ($temPadrao ? 'padrao DESC, ' : '') . 'nome, id');
        $st->execute($temTipo ? ['c' => $codigo, 't' => $tipo] : ['c' => $codigo]);
        foreach ($st->fetchAll() as $row) {
            $regras = $temRegras && $row['regras_json'] ? json_decode((string) $row['regras_json'], true) : null;
            $out[] = ['id' => (int) $row['id'], 'nome' => (string) $row['nome'], 'padrao' => $temPadrao ? (int) $row['padrao'] === 1 : false,
                      'regras' => is_array($regras) ? $regras : [], 'pacote_id_linhas' => (int) $row['id'], 'tipo' => $temTipo ? (string) $row['tipo'] : 'ATENDIMENTO',
                      'valor' => (float) ($row['valor'] ?? 0)];
        }
    }
    if (!$out && $tipo === 'ATENDIMENTO') {
        $regras = json_decode((string) ($conv['regras_json'] ?? ''), true);
        if (is_array($regras)) {
            foreach ($regras as $it) {
                if (is_array($it) && ($it['valor'] ?? '') === 'Sim') {
                    return [['id' => 0, 'nome' => 'Pacote padrão', 'padrao' => true, 'regras' => $regras, 'pacote_id_linhas' => 0]];
                }
            }
        }
    }
    return $out;
}

const PREVIA_ROTULOS_REGRA = [
    'urna' => 'Urna', 'roupa' => 'Roupa', 'invol' => 'Invol', 'veu' => 'Véu', 'cordao' => 'Cordão São Francisco', 'coroa_flores' => 'Coroa de flores',
    'ornamentacao' => 'Ornamentação', 'assistencia' => 'Assistência (Materiais)', 'kit_lanche' => 'Kit Lanche', 'tanato' => 'Tanatopraxia', 'translado' => 'Translado',
];

/** Itens "Sim" do pacote (sem valores de contrato, a não ser que $verContrato). */
function previaItensDoPacote(PDO $pdo, array $p, bool $verContrato): array {
    $out = [];
    foreach (PREVIA_ROTULOS_REGRA as $k => $rot) {
        $it = $p['regras'][$k] ?? null;
        if (!is_array($it) || ($it['valor'] ?? '') !== 'Sim') {
            continue;
        }
        $prods = [];
        foreach ((array) ($it['produtos'] ?? []) as $pp) {
            $pid = (int) ($pp['produto_id'] ?? 0);
            if ($pid > 0) {
                $prods[] = ['produto_id' => $pid, 'nome' => trim((string) ($pp['nome'] ?? '')) ?: nomeProduto($pdo, $pid)];
            }
        }
        $linha = ['chave' => $k, 'rotulo' => $rot, 'quantidade' => max(1, (int) ($it['quantidade'] ?? 1)), 'tipo' => (string) ($it['tipo'] ?? ''), 'produtos' => $prods];
        if ($verContrato) {
            $linha['valor_contrato'] = isset($it['valor_contrato']) && $it['valor_contrato'] !== null ? (float) $it['valor_contrato'] : null;
        }
        $out[] = $linha;
    }
    if (!$out && !empty($p['pacote_id_linhas'])) {   // pacote antigo sem regras_json: lista as categorias das linhas
        $st = $pdo->prepare('SELECT DISTINCT categoria FROM os_convenio_pacote_itens WHERE pacote_id = :p ORDER BY categoria');
        $st->execute(['p' => (int) $p['pacote_id_linhas']]);
        $mapa = ['URNA' => 'urna', 'ROUPA' => 'roupa', 'INVOLUCRO' => 'invol', 'VEU' => 'veu', 'CORDAO' => 'cordao', 'COROA' => 'coroa_flores', 'ORNAMENTACAO' => 'ornamentacao', 'ASSISTENCIA' => 'assistencia', 'KIT_LANCHE' => 'kit_lanche'];
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $cat) {
            $k = $mapa[strtoupper((string) $cat)] ?? null;
            if ($k) {
                $out[] = ['chave' => $k, 'rotulo' => PREVIA_ROTULOS_REGRA[$k], 'quantidade' => 1, 'tipo' => '', 'produtos' => []];
            }
        }
    }
    return $out;
}

/** Convênios ativos com os pacotes ativos de cada um (campo Convênio e escolha do pacote no registro). */
function opcoesConveniosAtendimento(PDO $pdo, bool $verContrato): array {
    $out = [];
    foreach ($pdo->query('SELECT * FROM convenios WHERE ativo = 1 ORDER BY ordem, nome')->fetchAll() as $c) {
        $tipo = previaTipoDoCadastro($c);
        $pacotes = [];
        if ($tipo === 'PREFEITURA' || $tipo === 'ASSOCIADO') {
            foreach (previaPacotesAtivos($pdo, $c) as $p) {
                $pacotes[] = ['id' => $p['id'], 'nome' => $p['nome'], 'padrao' => $p['padrao'], 'itens' => previaItensDoPacote($pdo, $p, $verContrato),
                              'realiza_velorio' => (($p['regras']['realiza_velorio']['valor'] ?? '') === 'Sim'),
                              'realiza_sepultamento' => (($p['regras']['realiza_sepultamento']['valor'] ?? '') === 'Sim')];
            }
        }
        $coroa = $tipo === 'PREFEITURA' ? pacotesDeCoroa($pdo, $c) : [];
        $out[] = ['id' => (int) $c['id'], 'nome' => (string) $c['nome'], 'tipo' => $tipo, 'codigo' => (string) ($c['os_codigo'] ?? ''), 'pacotes' => $pacotes,
                  // Prefeitura com pacote de Produto de coroa: o registro pergunta "A Prefeitura autorizou a coroa?"
                  'tem_pacote_coroa' => (bool) $coroa,
                  'coroas_aceitas' => array_values(array_unique(array_merge([], ...array_map(fn($p) => $p['aceitos'], $coroa ?: [['aceitos' => []]])))),
                  'aditivos_permitidos' => array_values(array_filter(array_map('trim', explode(',', strtoupper((string) ($c['os_aditivos'] ?? '')))))) ];
    }
    return ['convenios' => $out];
}

function previaPreco(PDO $pdo, int $produtoId): ?float {
    if ($produtoId <= 0) {
        return null;
    }
    try {
        return buscarPrecoVenda($pdo, $produtoId);
    } catch (Throwable $e) {
        return null;
    }
}

function previaLinha(PDO $pdo, string $chave, string $rotulo, int $pid, string $destino, string $motivo, ?float $valor, bool $oculto = false, string $nome = ''): array {
    return ['chave' => $chave, 'rotulo' => $rotulo, 'produto_id' => $pid, 'nome' => $nome !== '' ? $nome : ($pid > 0 ? nomeProduto($pdo, $pid) : ''),
            'qtd' => 1, 'destino' => $destino, 'motivo' => $motivo, 'valor' => $valor, 'valor_oculto' => $oculto, 'valor_pendente' => $destino === 'FAMILIA' && $valor === null];
}

/**
 * Prévia da OS do atendimento a partir do RASCUNHO do registro (nada é gravado).
 * Mesma lógica do motor (montarOSDoAtendimento / adicionarItemComparandoPadrao / lancarServicoCondicional / lancarTanatopraxiaAvancada):
 *  - Particular, ou Prefeitura sem pacote / sem autorização do pacote: tudo para a família, ao preço de tabela.
 *  - Prefeitura autorizada: itens do pacote entram sozinhos (valor fechado, faturado à Prefeitura); produto aceito pelo pacote = sem diferença;
 *    produto fora da lista paga a diferença acima do valor do item no contrato; item fora do pacote vai inteiro para a família.
 *  - Associado: produto aceito ou até o preço do padrão = coberto; acima, a família paga a diferença; urna cobre até o teto do plano.
 *  - Tanatopraxia, translado: pelas regras do plano / autorização da Prefeitura (preço de contrato). Avançada/embalsamamento: sempre diferença.
 */
function previaOSAtendimento(PDO $pdo, array $d, bool $verContrato): array {
    $rotulos = ['URNA' => 'Urna', 'ROUPA' => 'Roupa', 'INVOLUCRO' => 'Invol', 'VEU' => 'Véu', 'CORDAO' => 'Cordão São Francisco', 'COROA' => 'Coroa de flores',
                'ORNAMENTACAO' => 'Ornamentação', 'ASSISTENCIA' => 'Assistência (Materiais)', 'KIT_LANCHE' => 'Kit Lanche', 'TANATOPRAXIA' => 'Tanatopraxia',
                'TANATOPRAXIA_AVANCADA' => 'Tanatopraxia avançada', 'EMBALSAMAMENTO' => 'Embalsamamento', 'RECONSTITUICAO_FACIAL' => 'Reconstituição facial', 'TRANSLADO' => 'Translado',
                'SALA_VELORIO' => 'Sala do velório'];
    $avisos = [];
    $linhas = [];
    $cad = null;
    $convenio = 'PARTICULAR';
    $tipo = 'PARTICULAR';
    $convId = (int) ($d['convenio_id'] ?? 0);
    if ($convId > 0) {
        $q = $pdo->prepare('SELECT * FROM convenios WHERE id = :id');
        $q->execute(['id' => $convId]);
        $cad = $q->fetch() ?: null;
        if ($cad) {
            $codigo = strtoupper(trim((string) ($cad['os_codigo'] ?? '')));
            $tp = previaTipoDoCadastro($cad);
            if ($codigo === '' || $tp === '') {
                $avisos[] = 'Este convênio ainda não tem o tipo da OS definido (Convênios → Dados da OS).';
            } else {
                $convenio = $codigo;
                $tipo = $tp;
            }
        }
    }
    $ehPref = $tipo === 'PREFEITURA';
    $ehAssoc = $tipo === 'ASSOCIADO';
    // Só o servidor confirma o aditivo; ignorar indicadores de cobertura do navegador.
    $aditivoTanatoValidado = false;
    if ($ehAssoc && simNao($d['tanato'] ?? '') && trim((string)($d['contrato_numero'] ?? '')) !== '') {
        if (!function_exists('paiAssocTanatoVerificado')) {
            throw new RegraNegocioException('Integração do contrato não está carregada. Prévia indisponível.', 503);
        }
        try {
            $aditivoTanatoValidado = paiAssocTanatoVerificado((string)$d['contrato_numero']);
        } catch (Throwable $e) {
            error_log('[os_previa_tanato] ' . $e->getMessage());
            throw new RegraNegocioException('Não foi possível confirmar a cobertura de tanatopraxia. Tente novamente antes de cobrar.', 503);
        }
    }
    // A tag KM ILIMITADO prevalece sobre a franquia por plano somente para o contrato conferido.
    $kmIlimitadoValidado = false;
    if ($ehAssoc && simNao($d['translado'] ?? '') && trim((string)($d['contrato_numero'] ?? '')) !== '') {
        if (!function_exists('paiAssocKmIlimitadoVerificado')) {
            throw new RegraNegocioException('Integração contratual indisponível. Prévia de translado não confirmada.', 503);
        }
        try {
            $kmIlimitadoValidado = paiAssocKmIlimitadoVerificado((string)$d['contrato_numero']);
        } catch (Throwable $e) {
            error_log('[os_previa_km_ilimitado] ' . $e->getMessage());
            throw new RegraNegocioException('Não foi possível confirmar a tag KM ILIMITADO. Tente novamente antes de cobrar.', 503);
        }
    }
    // Associado com apoio da Prefeitura (09/10/2026): botão Particular | Prefeitura na tanatopraxia e no translado sem cobertura do plano.
    $apoioPossivel = ['tanatopraxia' => false, 'translado' => false];
    $apoioPref = null;
    if ($ehAssoc && (int) ($d['prefeitura_apoio_convenio_id'] ?? 0) > 0) {
        try {
            $apoioPref = prefeituraDoApoio($pdo, (int) $d['prefeitura_apoio_convenio_id']);
        } catch (RegraNegocioException $e) {
            $avisos[] = $e->getMessage();
        }
    }
    $pacotesCoroa = [];
    $autPacote = mb_strtolower(trim((string) ($d['pacote_autorizado_prefeitura'] ?? '')));
    $simNaoPref = fn ($k) => mb_strtolower(trim((string) ($d[$k] ?? '')));
    $id = fn (string $k): int => (int) ($d[$k] ?? 0);

    contextoPacote(['convenio' => $convenio, 'pacote_id' => $id('pacote_id'), 'atendimento_id' => null]);
    dataReferenciaOS(dataDoAtendimentoOS($d));   // mesma vigência da OS (16/10/2026)
    try {
        $pacote = ($ehPref || $ehAssoc) ? pacoteVigente($pdo, $convenio) : null;
        $familiaTudo = !$ehPref && !$ehAssoc;
        // Atendimento NÃO autorizado (09/10/2026): os itens vão para a família, mas tanatopraxia e translado seguem a autorização própria.
        $servicosPref = $ehPref;
        if ($ehPref) {
            if (!$pacote) {
                $avisos[] = 'Este convênio não tem pacote ativo cadastrado em Convênios: todos os itens ficam com a família.';
                $familiaTudo = true;
            } elseif ($autPacote === '') {
                $avisos[] = 'Informe se a Prefeitura autorizou o atendimento funerário.';
                $familiaTudo = true;
            } elseif (in_array($autPacote, ['não', 'nao'], true)) {
                $avisos[] = 'Sem a autorização do atendimento, o pacote não cobre nada: os itens ficam com a família. Tanatopraxia, translado e coroa seguem a autorização própria.';
                $familiaTudo = true;
            }
            $servicosPref = $pacote && ($autPacote === 'sim' || in_array($autPacote, ['não', 'nao'], true));
        }
        // ---- itens com produto (mesma ordem do motor)
        $desejados = ['URNA' => $id('urna_produto_id'), 'ROUPA' => !empty($d['roupa_propria']) ? 0 : $id('roupa_produto_id')];
        foreach (['INVOLUCRO' => ['invol', 'invol_produto_id'], 'VEU' => ['veu', 'veu_produto_id'], 'CORDAO' => ['cordao', 'cordao_produto_id']] as $cat => [$sim, $campo]) {
            $desejados[$cat] = simNao($d[$sim] ?? '') ? $id($campo) : 0;
        }
        // Itens Sim/Não com produto fixo (ex.: assistência = serviço do os_config), como o motor (mapa_atendimento.itens)
        foreach ((array) (mapaAtendimento()['itens'] ?? []) as $cat => $cfgItem) {
            [$campoSim, $campoProd, $fixo] = array_pad((array) $cfgItem, 3, null);
            if ($campoSim !== null && $campoProd === null && (int) $fixo > 0 && !isset($desejados[$cat])) {
                $desejados[$cat] = simNao($d[$campoSim] ?? '') ? (int) $fixo : 0;
            }
        }
        // Itens Sim/Não com produto por tipo (ex.: ornamentação Natural/Artificial), como o motor (mapa_atendimento.itens_por_tipo)
        foreach ((array) (mapaAtendimento()['itens_por_tipo'] ?? []) as $cat => $cfgTipo) {
            [$campoSim, $campoTipo, $porTipo] = array_pad((array) $cfgTipo, 3, []);
            $desejados[$cat] = simNao($d[$campoSim] ?? '') ? (int) (((array) $porTipo)[trim((string) ($d[$campoTipo] ?? ''))] ?? 0) : 0;
        }
        if (!empty($d['roupa_propria'])) {
            $linhas[] = previaLinha($pdo, 'ROUPA', 'Roupa própria', 0, 'SEM_COBRANCA', 'Roupa trazida pela família', null, false, 'Roupa própria da família');
        }
        if ($ehPref && !$familiaTudo && $pacote) {   // Prefeitura: categorias do pacote marcadas sem modelo entram com o padrão do pacote
            // Item marcado Não, roupa própria ou sem roupa: não entra (13/10/2026), igual ao motor.
            $usadoPrev = ['ROUPA' => empty($d['roupa_propria']) && (!array_key_exists('roupa', $d) || simNao($d['roupa'] ?? '') || $id('roupa_produto_id') > 0),
                          'INVOLUCRO' => simNao($d['invol'] ?? ''), 'VEU' => simNao($d['veu'] ?? ''), 'CORDAO' => simNao($d['cordao'] ?? ''),
                          'COROA' => !empty($d['coroas'])];
            foreach ((array) (mapaAtendimento()['itens'] ?? []) as $catM => $cfgM) {
                $campoSimM = ((array) $cfgM)[0] ?? null;
                if ($campoSimM !== null && !isset($usadoPrev[$catM])) {
                    $usadoPrev[$catM] = simNao($d[$campoSimM] ?? '');
                }
            }
            foreach ((array) (mapaAtendimento()['itens_por_tipo'] ?? []) as $catM => $cfgM) {
                $usadoPrev[$catM] = simNao($d[((array) $cfgM)[0] ?? ''] ?? '');
            }
            foreach ($pacote['itens'] as $it) {
                $catPac = (string) $it['categoria'];
                $foiUsado = $usadoPrev[$catPac] ?? (array_key_exists(strtolower($catPac), $d) ? simNao($d[strtolower($catPac)]) : true);
                if (!$foiUsado) {
                    continue;
                }
                if (empty($desejados[$it['categoria']])) {
                    $desejados[$it['categoria']] = $it['produto_id'];
                }
            }
        }
        foreach ($desejados as $cat => $pid) {
            if ($pid <= 0) {
                continue;
            }
            $rot = $rotulos[$cat] ?? $cat;
            $preco = previaPreco($pdo, $pid);
            if ($familiaTudo) {
                $linhas[] = previaLinha($pdo, $cat, $rot, $pid, 'FAMILIA', '', $preco);
                continue;
            }
            try {
                $padrao = buscarPacotePadrao($pdo, $convenio, $cat);
            } catch (Throwable $e) {
                $padrao = null;
            }
            $urnaDoPlano = !$ehPref && $cat === 'URNA';
            if (!$padrao && !$urnaDoPlano) {
                $linhas[] = previaLinha($pdo, $cat, $rot, $pid, 'FAMILIA', $ehPref ? 'Fora do pacote da Prefeitura' : 'Fora do pacote do plano', $preco);
                continue;
            }
            if ($preco === null) {
                $linhas[] = previaLinha($pdo, $cat, $rot, $pid, 'FAMILIA', 'Produto sem preço de tabela', null);
                continue;
            }
            $aceitos = (array) ($padrao['aceitos'] ?? []);
            $motivoCob = '';
            if ($urnaDoPlano) {
                try {
                    $teto = tetoUrnaDoPlano($convenio, $pdo);
                } catch (Throwable $e) {
                    $teto = 0.0;
                }
                $coberto = min($preco, $teto);
                $motivoCob = 'Coberto pelo plano (urna até o teto)';
            } elseif ($ehPref) {
                $vci = (float) ($padrao['valor_item'] ?? 0);
                $coberto = ($pid === (int) $padrao['produto_id'] || in_array($pid, $aceitos, true) || $preco <= $vci) ? $preco : $vci;
                $motivoCob = 'Pacote da Prefeitura';
            } else {
                $vp = previaPreco($pdo, (int) $padrao['produto_id']) ?? $preco;
                $coberto = ($pid === (int) $padrao['produto_id'] || in_array($pid, $aceitos, true) || $preco <= $vp) ? $preco : $vp;
                $motivoCob = 'Coberto pelo plano';
            }
            $dif = dinheiro($preco - $coberto);
            if ($ehPref) {
                $linhas[] = previaLinha($pdo, $cat, $rot, $pid, 'CONVENIO', $motivoCob, $verContrato ? (float) ($padrao['valor_item'] ?? 0) : null, !$verContrato);
            } else {
                $linhas[] = previaLinha($pdo, $cat, $rot, $pid, 'CONVENIO', $motivoCob, $coberto);
            }
            if ($dif > 0) {
                $linhas[] = previaLinha($pdo, $cat, $rot, $pid, 'FAMILIA', $ehPref ? 'Acima do valor do item no contrato' : 'Acima do padrão do plano', $dif);
            }
        }

        // ---- coroas da Prefeitura com pacote de coroa (pacote de produto): pergunta própria, vale mesmo sem o pacote de atendimento
        $pacotesCoroa = ($ehPref && $cad) ? pacotesDeCoroa($pdo, $cad) : [];
        if ($pacotesCoroa && !empty($d['coroas'])) {
            $autC = $simNaoPref('coroa_autorizada_prefeitura');
            if ($autC === '') {
                $avisos[] = 'Informe se a Prefeitura autorizou a coroa.';
            }
            foreach ((array) $d['coroas'] as $c) {
                $pidC = (int) (is_array($c) ? ($c['produto_id'] ?? 0) : 0);
                if ($pidC <= 0) {
                    continue;
                }
                $precoC = previaPreco($pdo, $pidC);
                $ctC = contratoDaCoroa($pacotesCoroa, $pidC, (string) ($c['tipo'] ?? ''));
                $vcC = $ctC['valor_contrato'];
                if ($autC === 'sim') {
                    $linhas[] = previaLinha($pdo, 'COROA', 'Coroa de flores', $pidC, 'CONVENIO', 'Coroa autorizada pela Prefeitura', $verContrato ? $vcC : null, !$verContrato);
                    if (!$ctC['aceito'] && $precoC !== null && dinheiro($precoC - $vcC) > 0) {
                        $linhas[] = previaLinha($pdo, 'COROA', 'Coroa de flores', $pidC, 'FAMILIA', 'Modelo fora do pacote de coroa da Prefeitura', dinheiro($precoC - $vcC));
                    }
                } else {
                    $linhas[] = previaLinha($pdo, 'COROA', 'Coroa de flores', $pidC, 'FAMILIA', $autC === 'não' || $autC === 'nao' ? 'A Prefeitura não autorizou a coroa' : '', $precoC);
                }
            }
            $d['coroas'] = [];
        }
        // ---- coroas: são pedidas à parte (OS de coroa); aqui só aparecem para lembrar
        foreach ((array) ($d['coroas'] ?? []) as $c) {
            $c = is_array($c) ? $c : [];
            $linhas[] = previaLinha($pdo, 'COROA_PEDIDO', 'Coroa de flores', (int) ($c['produto_id'] ?? 0), 'A_PARTE', 'Pedido de coroa à parte: conferido no pedido', null, false,
                trim('Coroa ' . (string) ($c['tipo'] ?? '')));
        }

        // ---- tanatopraxia (+ reconstituição facial)
        if (simNao($d['tanato'] ?? '')) {
            $prodTan = $id('tanato_produto_id');
            if ($prodTan <= 0) {
                try {
                    $prodTan = produtoTanatopraxiaNormal($pdo);
                } catch (Throwable $e) {
                    $avisos[] = 'Escolha o tipo de procedimento da tanatopraxia.';
                }
            }
            if ($prodTan > 0) {
                $catTan = 'TANATOPRAXIA';
                $preparo = (array) osConfig('produtos_preparo', []);
                $nomeTan = mb_strtoupper(nomeProduto($pdo, $prodTan));
                foreach (['TANATOPRAXIA_AVANCADA' => 'AVANÇ', 'EMBALSAMAMENTO' => 'EMBALSAM'] as $c => $trecho) {
                    if (in_array($prodTan, array_map('intval', (array) ($preparo[$c] ?? [])), true) || strpos($nomeTan, $trecho) !== false) {
                        $catTan = $c;
                    }
                }
                $rot = $rotulos[$catTan];
                $preco = previaPreco($pdo, $prodTan);
                $autTan = $simNaoPref('tanato_autorizado_prefeitura');
                if ($servicosPref && $autTan === '') {
                    $avisos[] = 'Informe se a Prefeitura autorizou a tanatopraxia.';
                }
                $prefAutorizaTan = $servicosPref && $autTan === 'sim';
                if ($familiaTudo && !$servicosPref) {
                    $linhas[] = previaLinha($pdo, $catTan, $rot, $prodTan, 'FAMILIA', '', $preco);
                } elseif (in_array($catTan, SERVICOS_SEMPRE_DIFERENCA, true)) {
                    $cobertoNormal = 0.0;
                    if ($ehPref) {
                        $cobertoNormal = $prefAutorizaTan ? (float) (precoContratoPrefeitura($pdo, $convenio, 'TANATOPRAXIA') ?? 0) : 0.0;
                    } elseif ((planoCobreServico($convenio, 'TANATOPRAXIA', $pdo) || $aditivoTanatoValidado)) {
                        try {
                            $cobertoNormal = min((float) $preco, buscarPrecoVenda($pdo, produtoTanatopraxiaNormal($pdo)));
                        } catch (Throwable $e) {
                            $cobertoNormal = 0.0;
                        }
                    }
                    if ($ehAssoc) {   // com ou sem cobertura do plano (24/11/2026)
                        $apoioPossivel['tanatopraxia'] = true;
                        if ($apoioPref && $autTan === 'sim') {   // a Prefeitura paga a simples do contrato; a família, o resto
                            $ct = (float) (precoContratoPrefeitura($pdo, $apoioPref['codigo'], 'TANATOPRAXIA') ?? 0);
                            if ($ct <= 0) {
                                $avisos[] = "Preço de contrato da tanatopraxia não cadastrado para a {$apoioPref['nome']}.";
                            }
                            $linhas[] = previaLinha($pdo, $catTan, $rot, $prodTan, 'PREFEITURA', 'Tanatopraxia simples paga pela ' . $apoioPref['nome'], $verContrato ? $ct : null, !$verContrato);
                            $linhas[] = previaLinha($pdo, $catTan, $rot, $prodTan, 'FAMILIA', 'Diferença acima da tanatopraxia simples paga pela Prefeitura', $preco === null ? null : max(0.0, dinheiro($preco - $ct)));
                            $cobertoNormal = -1.0;   // linhas já feitas
                        }
                    }
                    if ($cobertoNormal < 0) {
                        // apoio da Prefeitura: linhas acima
                    } elseif ($cobertoNormal > 0) {
                        $linhas[] = previaLinha($pdo, $catTan, $rot, $prodTan, 'CONVENIO', 'Tanatopraxia normal coberta', $ehPref ? ($verContrato ? $cobertoNormal : null) : $cobertoNormal, $ehPref && !$verContrato);
                    }
                    if ($cobertoNormal >= 0) {
                        $linhas[] = previaLinha($pdo, $catTan, $rot, $prodTan, 'FAMILIA', $cobertoNormal > 0 ? 'Diferença acima da tanatopraxia normal coberta' : 'Sempre cobrada como diferença', $preco === null ? null : max(0.0, dinheiro($preco - $cobertoNormal)));
                    }
                } else {
                    $coberto = $ehPref ? $prefAutorizaTan : (planoCobreServico($convenio, 'TANATOPRAXIA', $pdo) || $aditivoTanatoValidado);
                    if ($coberto && $ehAssoc && $apoioPref && $autTan === 'sim') {
                        // Coberta pelo plano, mas a Prefeitura paga (24/11/2026): sai da OS do plano e vai para a OS Prf
                        $apoioPossivel['tanatopraxia'] = true;
                        $ct = precoContratoPrefeitura($pdo, $apoioPref['codigo'], 'TANATOPRAXIA');
                        if ($ct === null || $ct <= 0) {
                            $avisos[] = "Preço de contrato da tanatopraxia não cadastrado para a {$apoioPref['nome']}.";
                        }
                        $linhas[] = previaLinha($pdo, $catTan, $rot, $prodTan, 'PREFEITURA', 'Coberta pelo plano, paga pela ' . $apoioPref['nome'], $verContrato ? $ct : null, !$verContrato);
                    } elseif ($coberto) {
                        $apoioPossivel['tanatopraxia'] = $apoioPossivel['tanatopraxia'] || $ehAssoc;
                        $vContr = $ehPref ? precoContratoPrefeitura($pdo, $convenio, 'TANATOPRAXIA') : $preco;
                        $linhas[] = previaLinha($pdo, $catTan, $rot, $prodTan, 'CONVENIO', $ehPref ? 'Autorizada pela Prefeitura' : 'Coberta pelo plano', $ehPref ? ($verContrato ? $vContr : null) : $preco, $ehPref && !$verContrato);
                    } elseif ($ehAssoc && $apoioPref && $autTan === 'sim') {
                        $apoioPossivel['tanatopraxia'] = true;
                        $ct = precoContratoPrefeitura($pdo, $apoioPref['codigo'], 'TANATOPRAXIA');
                        if ($ct === null || $ct <= 0) {
                            $avisos[] = "Preço de contrato da tanatopraxia não cadastrado para a {$apoioPref['nome']}.";
                        }
                        $linhas[] = previaLinha($pdo, $catTan, $rot, $prodTan, 'PREFEITURA', 'Paga pela ' . $apoioPref['nome'], $verContrato ? $ct : null, !$verContrato);
                    } else {
                        $apoioPossivel['tanatopraxia'] = $apoioPossivel['tanatopraxia'] || $ehAssoc;
                        $linhas[] = previaLinha($pdo, $catTan, $rot, $prodTan, 'FAMILIA', $ehPref ? 'A Prefeitura não autorizou' : 'Sem cobertura do plano', $preco);
                    }
                }
            }
            if (simNao($d['reconstituicao_facial'] ?? '')) {
                try {
                    $prodRec = produtoReconstituicaoFacial($pdo);
                    $linhas[] = previaLinha($pdo, 'RECONSTITUICAO_FACIAL', $rotulos['RECONSTITUICAO_FACIAL'], $prodRec, 'FAMILIA', 'Serviço adicional (fora do pacote)', previaPreco($pdo, $prodRec));
                } catch (Throwable $e) {
                    $linhas[] = previaLinha($pdo, 'RECONSTITUICAO_FACIAL', $rotulos['RECONSTITUICAO_FACIAL'], 0, 'FAMILIA', 'Produto da reconstituição facial não encontrado no estoque', null, false, 'Reconstituição facial');
                }
            }
        }

        // ---- translado
        if (simNao($d['translado'] ?? '')) {
            $km = round((float) str_replace(',', '.', (string) ($d['translado_km'] ?? 0)), 1);
            $cfgT = (array) osConfig('translado', []);
            $pidT = (int) ($cfgT['produto_id'] ?? 0);
            $valorKm = previaPreco($pdo, $pidT);
            $fmtKm = fn (float $v): string => number_format($v, 1, ',', '.') . ' km';
            if ($km <= 0) {
                $avisos[] = 'Informe a distância do translado.';
            } elseif ($valorKm === null) {
                $avisos[] = 'O produto do translado (valor do km) não está configurado.';
            } else {
                $total = dinheiro($km * $valorKm);
                $nome = 'Translado (' . $fmtKm($km) . ')';
                $autT = $simNaoPref('translado_autorizado_prefeitura');
                if ($servicosPref && $autT === '') {
                    $avisos[] = 'Informe se a Prefeitura autorizou o translado.';
                }
                if ($familiaTudo && !$servicosPref) {
                    $linhas[] = previaLinha($pdo, 'TRANSLADO', 'Translado', $pidT, 'FAMILIA', '', $total, false, $nome);
                } elseif ($ehPref) {
                    if ($autT === 'sim') {
                        $pc = precoContratoPrefeitura($pdo, $convenio, 'TRANSLADO_KM');
                        $linhas[] = previaLinha($pdo, 'TRANSLADO', 'Translado', $pidT, 'CONVENIO', 'Autorizado pela Prefeitura', $verContrato && $pc !== null ? dinheiro($pc * $km) : null, !$verContrato, $nome);
                    } else {
                        $linhas[] = previaLinha($pdo, 'TRANSLADO', 'Translado', $pidT, 'FAMILIA', 'A Prefeitura não autorizou o translado', $total, false, $nome);
                    }
                } else {
                    $limite = $kmIlimitadoValidado ? null : kmTransladoCobertoPeloPlano($pdo, $convenio);
                    $kmCob = $limite === null ? $km : min($km, max(0.0, $limite));
                    $apoioPossivel['translado'] = true;   // com ou sem cobertura do plano, a Prefeitura pode pagar (24/11/2026)
                    if ($apoioPref && $autT === 'sim') {
                        // 1º Prefeitura (km informados), 2º plano até o limite, 3º família (24/11/2026)
                        $kmInf = round((float) str_replace(',', '.', (string) ($d['translado_km_prefeitura'] ?? '')), 1);
                        $kmExc0 = round($km - $kmCob, 1);
                        if ($kmInf <= 0) {
                            $avisos[] = 'Informe quantos km do translado a ' . $apoioPref['nome'] . ' paga.';
                        } elseif ($kmInf > $km) {
                            $avisos[] = 'Os km pagos pela Prefeitura passam do total do translado: ficou o total (' . $fmtKm($km) . ').';
                        }
                        $kmPref = $kmInf > 0 ? min($kmInf, $km) : ($kmExc0 > 0 ? $kmExc0 : $km);
                        $resto = round($km - $kmPref, 1);
                        $kmPlano = $limite === null ? $resto : round(min($resto, max(0.0, $limite)), 1);
                        $kmFam = round($resto - $kmPlano, 1);
                        $pcKm = precoContratoPrefeitura($pdo, $apoioPref['codigo'], 'TRANSLADO_KM');
                        if ($pcKm === null || $pcKm <= 0) {
                            $avisos[] = "Preço do km do translado não cadastrado no contrato da {$apoioPref['nome']}.";
                        }
                        if ($kmPref > 0) {
                            $linhas[] = previaLinha($pdo, 'TRANSLADO', 'Translado', $pidT, 'PREFEITURA', 'Pago pela ' . $apoioPref['nome'], $verContrato && $pcKm !== null ? dinheiro($pcKm * $kmPref) : null, !$verContrato, 'Translado — ' . $fmtKm($kmPref) . ' pela Prefeitura');
                        }
                        if ($kmPlano > 0) {
                            $linhas[] = previaLinha($pdo, 'TRANSLADO', 'Translado', $pidT, 'CONVENIO', 'Coberto pelo plano', dinheiro($kmPlano * $valorKm), false, 'Translado — ' . $fmtKm($kmPlano) . ' cobertos');
                        }
                        if ($kmFam > 0) {
                            $linhas[] = previaLinha($pdo, 'TRANSLADO', 'Translado', $pidT, 'FAMILIA', $limite !== null && $limite > 0 ? 'Km acima do limite do plano' : 'O plano não cobre translado', dinheiro($kmFam * $valorKm), false, 'Translado — ' . $fmtKm($kmFam) . ' pela família');
                        }
                    } elseif ($kmCob >= $km) {
                        $linhas[] = previaLinha($pdo, 'TRANSLADO', 'Translado', $pidT, 'CONVENIO', $limite === null ? 'Coberto pelo plano (sem limite de km)' : 'Coberto pelo plano', $total, false, $nome);
                    } else {
                        // Km acima do limite do plano: a família paga
                        $kmExc = round($km - $kmCob, 1);
                        if ($kmCob > 0) {
                            $linhas[] = previaLinha($pdo, 'TRANSLADO', 'Translado', $pidT, 'CONVENIO', 'Coberto pelo plano', dinheiro($kmCob * $valorKm), false, 'Translado — ' . $fmtKm($kmCob) . ' cobertos');
                        }
                        $nomeExc = $kmCob > 0 ? 'Translado — ' . $fmtKm($kmExc) . ' excedentes' : $nome;
                        $linhas[] = previaLinha($pdo, 'TRANSLADO', 'Translado', $pidT, 'FAMILIA', $kmCob > 0 ? 'Km acima do limite do plano' : 'O plano não cobre translado', dinheiro($kmExc * $valorKm), false, $nomeExc);
                    }
                }
            }
        }
    } finally {
        contextoPacote(null, true);
        dataReferenciaOS(null, true);
    }

    $familia = 0.0;
    $pend = 0;
    $cobertos = 0;
    foreach ($linhas as $l) {
        if ($l['destino'] === 'FAMILIA') {
            $l['valor'] === null ? $pend++ : $familia += (float) $l['valor'];
        } elseif ($l['destino'] === 'CONVENIO') {
            $cobertos++;
        }
    }
    return [
        'estimativa' => true,
        'convenio' => $cad ? ['id' => (int) $cad['id'], 'nome' => (string) $cad['nome'], 'tipo' => $tipo, 'codigo' => $convenio] : null,
        'pacote' => !empty($pacote) ? ['id' => (int) $pacote['id'], 'nome' => (string) ($pacote['nome'] ?? '')] : null,
        'pacote_autorizado' => $ehPref ? ($autPacote === '' ? null : $autPacote === 'sim') : null,
        'pergunta_coroa' => !empty($pacotesCoroa),
        // Associado: serviços sem cobertura do plano que podem ser pagos pela Prefeitura (botão Particular | Prefeitura)
        'aditivo_tanatopraxia_validado' => $aditivoTanatoValidado,
        'km_ilimitado_validado' => $kmIlimitadoValidado,
        'apoio_prefeitura' => ['tanatopraxia' => $apoioPossivel['tanatopraxia'], 'translado' => $apoioPossivel['translado'],
                               'prefeitura' => $apoioPref ? $apoioPref['nome'] : null],
        'linhas' => $linhas,
        'totais' => ['familia' => dinheiro($familia), 'familia_valores_pendentes' => $pend, 'itens_cobertos' => $cobertos,
                     'itens_familia' => count(array_filter($linhas, fn ($l) => $l['destino'] === 'FAMILIA')),
                     'itens_prefeitura' => count(array_filter($linhas, fn ($l) => $l['destino'] === 'PREFEITURA'))],
        'avisos' => $avisos,
    ];
}

/* =====================================================================================================================
 * TIPO E ORDEM DOS PACOTES DO CONVÊNIO (05/10/2026)
 *  - Tipo ATENDIMENTO: o pacote do atendimento (o registro só mostra estes, na ordem do cadastro).
 *  - Tipo PRODUTO: pacote de produto da Prefeitura (ex.: coroa de flores autorizada sem o atendimento).
 *  - Ordem: setas na tela de convênios. Colunas os_convenio_pacotes.tipo e .ordem (alteracoes_atendimento_sugeridas.sql).
 * ===================================================================================================================== */

function codigoDoConvenioCadastro(PDO $pdo, int $convenioId): string {
    $q = $pdo->prepare('SELECT os_codigo FROM convenios WHERE id = :id');
    $q->execute(['id' => $convenioId]);
    $c = strtoupper(trim((string) $q->fetchColumn()));
    if ($c === '') {
        throw new RegraNegocioException('Convênio sem o tipo da OS definido (Dados do convênio).', 422);
    }
    return $c;
}

function exigirColunasTipoOrdemPacote(PDO $pdo): void {
    if (!colunaExisteOS($pdo, 'os_convenio_pacotes', 'tipo') || !colunaExisteOS($pdo, 'os_convenio_pacotes', 'ordem')) {
        throw new RegraNegocioException('Faltam as colunas tipo e ordem em os_convenio_pacotes. Rode alteracoes_atendimento_sugeridas.sql.', 500);
    }
}

/** [{id, tipo, ordem}] dos pacotes do convênio (todos, ativos ou não). */
function classificacaoPacotesConvenio(PDO $pdo, int $convenioId): array {
    if ($convenioId <= 0) {
        throw new RegraNegocioException('Informe o convênio.');
    }
    $codigo = codigoDoConvenioCadastro($pdo, $convenioId);
    $temTipo = colunaExisteOS($pdo, 'os_convenio_pacotes', 'tipo');
    $temOrdem = colunaExisteOS($pdo, 'os_convenio_pacotes', 'ordem');
    $st = $pdo->prepare('SELECT id' . ($temTipo ? ', tipo' : '') . ($temOrdem ? ', ordem' : '') . ' FROM os_convenio_pacotes WHERE convenio = :c ORDER BY '
        . ($temOrdem ? 'ordem, ' : '') . 'id');
    $st->execute(['c' => $codigo]);
    $out = [];
    foreach ($st->fetchAll() as $i => $r) {
        $out[] = ['id' => (int) $r['id'], 'tipo' => $temTipo ? (string) $r['tipo'] : 'ATENDIMENTO', 'ordem' => $temOrdem ? (int) $r['ordem'] : $i + 1];
    }
    return ['pacotes' => $out, 'colunas' => $temTipo && $temOrdem];
}

function classificarPacoteConvenio(PDO $pdo, int $pacoteId, string $tipo): array {
    exigirColunasTipoOrdemPacote($pdo);
    $tipo = strtoupper(trim($tipo));
    if (!in_array($tipo, ['ATENDIMENTO', 'PRODUTO'], true)) {
        throw new RegraNegocioException('Tipo do pacote: ATENDIMENTO ou PRODUTO.');
    }
    $st = $pdo->prepare('SELECT id, convenio, ordem FROM os_convenio_pacotes WHERE id = :id');
    $st->execute(['id' => $pacoteId]);
    $p = $st->fetch();
    if (!$p) {
        throw new RegraNegocioException('Pacote não encontrado.', 404);
    }
    $ordem = (int) $p['ordem'];
    if ($ordem <= 0) {   // pacote novo vai para o fim da lista
        $m = $pdo->prepare('SELECT COALESCE(MAX(ordem), 0) + 1 FROM os_convenio_pacotes WHERE convenio = :c');
        $m->execute(['c' => $p['convenio']]);
        $ordem = (int) $m->fetchColumn();
    }
    $pdo->prepare('UPDATE os_convenio_pacotes SET tipo = :t, ordem = :o WHERE id = :id')->execute(['t' => $tipo, 'o' => $ordem, 'id' => $pacoteId]);
    return ['id' => $pacoteId, 'tipo' => $tipo, 'ordem' => $ordem];
}

/** Grava a ordem na sequência recebida (ids do convênio; os que faltarem vão para o fim). */
function ordenarPacotesConvenio(PDO $pdo, int $convenioId, array $ids): array {
    exigirColunasTipoOrdemPacote($pdo);
    $codigo = codigoDoConvenioCadastro($pdo, $convenioId);
    return emTransacao($pdo, function () use ($pdo, $convenioId, $codigo, $ids) {
        $st = $pdo->prepare('SELECT id FROM os_convenio_pacotes WHERE convenio = :c ORDER BY ordem, id');
        $st->execute(['c' => $codigo]);
        $existentes = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
        $seq = array_values(array_unique(array_filter(array_map('intval', $ids), fn ($i) => in_array($i, $existentes, true))));
        foreach ($existentes as $i) {
            if (!in_array($i, $seq, true)) {
                $seq[] = $i;
            }
        }
        $up = $pdo->prepare('UPDATE os_convenio_pacotes SET ordem = :o WHERE id = :id');
        foreach ($seq as $n => $id) {
            $up->execute(['o' => $n + 1, 'id' => $id]);
        }
        return classificacaoPacotesConvenio($pdo, $convenioId);
    });
}

/* =====================================================================================================================
 * COROA AUTORIZADA PELA PREFEITURA (05/10/2026)
 * A coroa da Prefeitura é um pacote de PRODUTO do convênio (regra coroa_flores = Sim). O registro pergunta "A Prefeitura autorizou
 * a coroa?" — vale mesmo sem o pacote de atendimento.
 *  - Sim: a coroa vai na OS da Prefeitura (valor do contrato do pacote de coroa, nunca mostrado no registro). Modelo fora dos aceitos
 *    do pacote: a família paga a diferença sobre o valor do contrato.
 *  - Não: a coroa vai para a família pelo preço de venda particular.
 * ===================================================================================================================== */

/** Pacotes de Produto ativos do convênio que incluem coroa: [{id, nome, aceitos[], valor_contrato}]. */
function pacotesDeCoroa(PDO $pdo, array $conv): array {
    if (!colunaExisteOS($pdo, 'os_convenio_pacotes', 'tipo')) {
        return [];
    }
    $out = [];
    foreach (previaPacotesAtivos($pdo, $conv, 'PRODUTO') as $p) {
        $it = $p['regras']['coroa_flores'] ?? null;
        if (!is_array($it) || ($it['valor'] ?? '') !== 'Sim') {
            continue;
        }
        $aceitos = [(int) ($it['produto_id'] ?? 0)];
        foreach ((array) ($it['produtos'] ?? []) as $pp) {
            $aceitos[] = (int) ($pp['produto_id'] ?? 0);
        }
        $vc = isset($it['valor_contrato']) && $it['valor_contrato'] !== null && $it['valor_contrato'] !== '' ? (float) $it['valor_contrato'] : (float) $p['valor'];
        $out[] = ['id' => $p['id'], 'nome' => $p['nome'], 'aceitos' => array_values(array_filter(array_unique($aceitos))), 'valor_contrato' => $vc];
    }
    return $out;
}

/**
 * Coroas do pedido ligado ao atendimento (coroas.atendimento_origem_id → coroas_itens), uma linha por coroa.
 * Sem pedido (registro antigo) ou sem as tabelas: lista vazia, e vale o coroa_produto_id do registro.
 */
function coroasDoPedidoDoAtendimento(PDO $pdo, int $atendimentoId): array {
    if ($atendimentoId <= 0) {
        return [];
    }
    try {
        $st = $pdo->prepare('SELECT ci.produto_id, ci.tipo_coroa FROM coroas c JOIN coroas_itens ci ON ci.coroa_id = c.id
                             WHERE c.atendimento_origem_id = :a ORDER BY ci.ordem, ci.id');
        $st->execute(['a' => $atendimentoId]);
        return array_values(array_filter($st->fetchAll(PDO::FETCH_ASSOC), fn ($r) => (int) $r['produto_id'] > 0));
    } catch (Throwable $e) {
        // Sem as tabelas de coroa vale o registro (1 coroa). Fica no log para não esconder um erro de consulta.
        error_log('[OS] coroasDoPedidoDoAtendimento(' . $atendimentoId . '): ' . $e->getMessage());
        return [];
    }
}

/** Coroas do registro: coroas_itens (lista) quando existir; senão coroa_produto_id. */
function coroasDoRegistro(array $at): array {
    $lista = $at['coroas_itens'] ?? null;
    if (is_string($lista)) {
        $lista = json_decode($lista, true);
    }
    $out = [];   // [produto_id, tipo (natural|artificial|'')]
    if (is_array($lista)) {
        foreach ($lista as $c) {
            $pid = (int) (is_array($c) ? ($c['produto_id'] ?? 0) : 0);
            if ($pid > 0) {
                $out[] = [$pid, strtolower(trim((string) ($c['tipo_coroa'] ?? '')))];
            }
        }
    }
    if (!$out && (int) ($at['coroa_produto_id'] ?? 0) > 0) {
        $out[] = [(int) $at['coroa_produto_id'], strtolower(trim((string) ($at['coroa_tipo'] ?? '')))];
    }
    return $out;
}

/**
 * Valor do contrato de UMA coroa: o pacote de coroa que aceita o modelo; senão o do mesmo tipo (natural/artificial, pelo nome
 * do pacote); senão o primeiro. Cada pacote de coroa tem o seu valor (ex.: Coroa Natural x Coroa Artificial).
 * Devolve ['aceito' => bool, 'valor_contrato' => float, 'pacote' => nome].
 */
function contratoDaCoroa(array $pacotes, int $pid, string $tipo = ''): array {
    foreach ($pacotes as $p) {
        if (in_array($pid, $p['aceitos'], true)) {
            return ['aceito' => true, 'valor_contrato' => (float) $p['valor_contrato'], 'pacote' => $p['nome']];
        }
    }
    $tipo = strtolower(trim($tipo));
    if ($tipo !== '') {
        foreach ($pacotes as $p) {
            $nome = strtolower(strtr((string) $p['nome'], ['á' => 'a', 'Á' => 'a']));
            if (strpos($nome, $tipo) !== false) {
                return ['aceito' => false, 'valor_contrato' => (float) $p['valor_contrato'], 'pacote' => $p['nome']];
            }
        }
    }
    return ['aceito' => false, 'valor_contrato' => (float) ($pacotes[0]['valor_contrato'] ?? 0), 'pacote' => $pacotes[0]['nome'] ?? ''];
}

/**
 * Lança as coroas de um atendimento de Prefeitura com pacote de coroa. $convFamilia = convênio das demais OS (o código da Prefeitura,
 * ou PARTICULAR quando o pacote de atendimento não foi autorizado). Só refaz quando algo mudou (preserva desconto da coroa na OS da família).
 */
function lancarCoroasPrefeitura(PDO $pdo, int $atendimentoId, string $convPref, string $convFamilia, array $coroas, bool $autorizada, array $pacotesCoroa, ?int $usuarioId): array {
    // estado desejado: lista de [natureza, tipo_item, produto]
    $desejado = [];
    foreach ($coroas as [$pid, $tipoC]) {
        if ($autorizada) {
            $desejado[] = ['CONVENIO', 'REFERENCIA', $pid];
            $preco = buscarPrecoVenda($pdo, $pid);
            $ct = contratoDaCoroa($pacotesCoroa, $pid, $tipoC);
            if (!$ct['aceito'] && dinheiro($preco - $ct['valor_contrato']) > 0) {
                $desejado[] = ['PARTICULAR', 'DIFERENCA', $pid];
            }
        } else {
            $desejado[] = ['PARTICULAR', strpos($convFamilia, 'PARTICULAR') === 0 ? 'DIRETO' : 'DIFERENCA', $pid];
        }
    }
    $st = $pdo->prepare("SELECT o.natureza, i.tipo_item, i.produto_id FROM os_itens i JOIN os_ordens o ON o.id = i.os_id
                         WHERE o.tipo = 'ATENDIMENTO' AND o.atendimento_id = :a AND o.status <> 'CANCELADA' AND i.categoria = 'COROA' AND i.tipo_item <> 'ADICIONAL'");
    $st->execute(['a' => $atendimentoId]);
    $atual = array_map(fn ($r) => [$r['natureza'], $r['tipo_item'], (int) $r['produto_id']], $st->fetchAll());
    $chave = function (array $l) { $s = array_map(fn ($x) => implode('|', $x), $l); sort($s); return implode(';', $s); };
    if ($chave($atual) === $chave($desejado)) {
        return [];
    }
    removerCategoriaDoAtendimento($pdo, $atendimentoId, 'COROA');
    $feito = [];
    foreach ($coroas as [$pid, $tipoC]) {
        $preco = buscarPrecoVenda($pdo, $pid);
        $nome = nomeProduto($pdo, $pid);
        if ($autorizada) {
            $osConv = obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'CONVENIO', $convPref, $usuarioId);
            $item = inserirItem($pdo, (int) $osConv['id'], $pid, 'COROA', 1, $preco, true, 'REFERENCIA');
            $ct = contratoDaCoroa($pacotesCoroa, $pid, $tipoC);
            $aceito = $ct['aceito'];
            $valorContrato = $ct['valor_contrato'];
            $contrato = $aceito ? $valorContrato : min($preco, $valorContrato);
            $pdo->prepare('UPDATE os_itens SET valor_contrato_item = :v WHERE id = :id')->execute(['v' => $contrato, 'id' => $item['id']]);
            recalcularTotalPrefeitura($pdo, (int) $osConv['id']);
            registrarEvento($pdo, (int) $osConv['id'], 'ITEM_INCLUIDO', "{$nome} (COROA) — coroa autorizada pela Prefeitura (pacote de produto)", $usuarioId);
            $dif = $aceito ? 0.0 : dinheiro($preco - $valorContrato);
            if ($dif > 0) {
                $osPart = obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR', $convFamilia, $usuarioId);
                inserirItem($pdo, (int) $osPart['id'], $pid, 'COROA', 1, $dif, false, 'DIFERENCA');
                recalcularValorTotal($pdo, (int) $osPart['id']);
                registrarEvento($pdo, (int) $osPart['id'], 'ITEM_INCLUIDO', "{$nome} (COROA) — modelo fora do pacote de coroa da Prefeitura: diferença " . formatarReais($dif), $usuarioId, $dif);
            }
            $feito[] = "COROA: {$nome} (Prefeitura autorizou)";
        } else {
            $osPart = obterOuCriarOS($pdo, 'ATENDIMENTO', $atendimentoId, null, 'PARTICULAR', $convFamilia, $usuarioId);
            inserirItem($pdo, (int) $osPart['id'], $pid, 'COROA', 1, $preco, false, strpos($convFamilia, 'PARTICULAR') === 0 ? 'DIRETO' : 'DIFERENCA');
            recalcularValorTotal($pdo, (int) $osPart['id']);
            registrarEvento($pdo, (int) $osPart['id'], 'ITEM_INCLUIDO', "{$nome} (COROA) — a Prefeitura não autorizou a coroa: preço particular " . formatarReais($preco), $usuarioId, $preco);
            $feito[] = "COROA: {$nome} (Prefeitura não autorizou)";
        }
    }
    return $feito;
}

/* =====================================================================================================================
 * PEDIDO DE COROA AVULSO AUTORIZADO PELA PREFEITURA (06/10/2026)
 * Pedido feito na tela Coroa de Flores, sem atendimento, com convênio de Prefeitura e "A Prefeitura autorizou a coroa?" = Sim.
 * A autorização vale mais que o tipo: a OS é Prf (número Prf.<cidade>), não Cor. Cada coroa entra pelo valor do contrato do
 * pacote de coroa (pacote de Produto); modelo fora do pacote → a família paga a diferença na Dif.Prf.
 * Com "Não" (ou sem convênio) nada é lançado aqui: o pedido segue como venda direta, pago pela família na tela de coroas.
 * Lançar de novo refaz as OS enquanto estiverem abertas (o app chama depois de criar ou editar o pedido).
 * ===================================================================================================================== */
function lancarPedidoCoroaPrefeitura(PDO $pdo, int $pedidoId, ?int $usuarioId): array {
    $tabela = (string) (((array) osConfig('fonte_coroa', []))['tabela'] ?? '') ?: 'coroas';
    if (!preg_match('/^[A-Za-z0-9_]+$/', $tabela)) {
        throw new RuntimeException('fonte_coroa.tabela inválida');
    }
    if (!colunaExisteOS($pdo, $tabela, 'convenio_id') || !colunaExisteOS($pdo, $tabela, 'coroa_autorizada_prefeitura')) {
        throw new RegraNegocioException("Faltam as colunas convenio_id e coroa_autorizada_prefeitura na tabela {$tabela}. Rode alteracoes_atendimento_sugeridas.sql.", 500);
    }
    $st = $pdo->prepare("SELECT * FROM `{$tabela}` WHERE id = :id");
    $st->execute(['id' => $pedidoId]);
    $ped = $st->fetch();
    if (!$ped) {
        throw new RegraNegocioException("Pedido de coroa {$pedidoId} não encontrado.", 404);
    }
    $convId = (int) ($ped['convenio_id'] ?? 0);
    $autorizada = simNao($ped['coroa_autorizada_prefeitura'] ?? '');
    $cad = null;
    if ($convId > 0) {
        $q = $pdo->prepare('SELECT * FROM convenios WHERE id = :id');
        $q->execute(['id' => $convId]);
        $cad = $q->fetch() ?: null;
    }
    $codigo = $cad ? strtoupper(trim((string) ($cad['os_codigo'] ?? ''))) : '';
    $ehPref = $cad && previaTipoDoCadastro($cad) === 'PREFEITURA' && $codigo !== '';

    return emTransacao($pdo, function () use ($pdo, $pedidoId, $usuarioId, $cad, $codigo, $ehPref, $autorizada) {
        // OS que já existem para o pedido (Prf e Dif.Prf de uma autorização anterior)
        $st = $pdo->prepare("SELECT * FROM os_ordens WHERE tipo = 'COROA' AND coroa_pedido_id = :p AND status <> 'CANCELADA' AND convenio LIKE 'PREFEITURA%' FOR UPDATE");
        $st->execute(['p' => $pedidoId]);
        $existentes = $st->fetchAll();
        foreach ($existentes as $o) {
            if ($o['status'] !== 'ABERTA') {
                return ['lancado' => false, 'aviso' => "OS {$o['numero_os']} está {$o['status']}: reabra no Financeiro para refazer.",
                        'os_convenio' => null, 'os_particular' => null];
            }
        }
        $cancelar = function () use ($pdo, $existentes, $usuarioId) {
            foreach ($existentes as $o) {
                $pdo->prepare('DELETE FROM os_itens WHERE os_id = :id')->execute(['id' => $o['id']]);
                $pdo->prepare("UPDATE os_ordens SET status = 'CANCELADA', valor_total = 0 WHERE id = :id")->execute(['id' => $o['id']]);
                registrarEvento($pdo, (int) $o['id'], 'OS_CANCELADA', 'OS refeita: o pedido de coroa ou a autorização da Prefeitura mudou.', $usuarioId);
            }
        };
        if (!$ehPref || !$autorizada) {
            $cancelar();
            return ['lancado' => false, 'aviso' => $existentes ? 'A autorização da Prefeitura foi retirada: as OS da Prefeitura deste pedido foram canceladas.' : null,
                    'os_convenio' => null, 'os_particular' => null];
        }
        $pacotes = pacotesDeCoroa($pdo, $cad);
        if (!$pacotes) {
            throw new RegraNegocioException("O convênio {$cad['nome']} não tem pacote de coroa (pacote do tipo Produto com coroa). Cadastre em Convênios.", 422);
        }
        $it = $pdo->prepare('SELECT produto_id, frase, tipo_coroa FROM coroas_itens WHERE coroa_id = :p ORDER BY ordem, id');
        $it->execute(['p' => $pedidoId]);
        $coroas = array_values(array_filter($it->fetchAll(), fn ($r) => (int) $r['produto_id'] > 0));
        if (!$coroas) {
            throw new RegraNegocioException('O pedido não tem coroas com modelo do estoque.', 422);
        }
        $cancelar();   // refaz do zero (as OS estavam abertas)
        $osConv = obterOuCriarOS($pdo, 'COROA', null, $pedidoId, 'CONVENIO', $codigo, $usuarioId);
        $osPart = null;
        foreach ($coroas as $c) {
            $pid = (int) $c['produto_id'];
            $frase = trim((string) ($c['frase'] ?? '')) ?: null;
            $preco = buscarPrecoVenda($pdo, $pid);
            $ct = contratoDaCoroa($pacotes, $pid, (string) ($c['tipo_coroa'] ?? ''));
            $aceito = $ct['aceito'];
            $valorContrato = $ct['valor_contrato'];
            $item = inserirItem($pdo, (int) $osConv['id'], $pid, 'COROA', 1, $preco, true, 'REFERENCIA', $frase);
            $pdo->prepare('UPDATE os_itens SET valor_contrato_item = :v WHERE id = :id')->execute(['v' => $aceito ? $valorContrato : min($preco, $valorContrato), 'id' => $item['id']]);
            $dif = $aceito ? 0.0 : dinheiro($preco - $valorContrato);
            if ($dif > 0) {
                $osPart = $osPart ?: obterOuCriarOS($pdo, 'COROA', null, $pedidoId, 'PARTICULAR', $codigo, $usuarioId);
                inserirItem($pdo, (int) $osPart['id'], $pid, 'COROA', 1, $dif, false, 'DIFERENCA', $frase);
                registrarEvento($pdo, (int) $osPart['id'], 'ITEM_INCLUIDO', nomeProduto($pdo, $pid) . ' — modelo fora do pacote de coroa da Prefeitura: diferença ' . formatarReais($dif), $usuarioId, $dif);
            }
        }
        recalcularTotalPrefeitura($pdo, (int) $osConv['id']);
        registrarEvento($pdo, (int) $osConv['id'], 'ITEM_INCLUIDO', count($coroas) . ' coroa(s) autorizada(s) pela Prefeitura — pedido de coroa nº ' . $pedidoId, $usuarioId);
        if ($osPart) {
            recalcularValorTotal($pdo, (int) $osPart['id']);
        }
        return ['lancado' => true, 'aviso' => null, 'os_convenio' => buscarOSPorId($pdo, (int) $osConv['id']),
                'os_particular' => $osPart ? buscarOSPorId($pdo, (int) $osPart['id']) : null];
    });
}

/**
 * Quem paga o pedido de coroa direto (09/10/2026): botão Particular | Prefeitura no pedido (Particular já marcado).
 *  - Prefeitura: o pedido fica pago (sem comprovante), a OS Cor ainda aberta é descartada e sai a OS Prf (e a Dif.Prf do modelo
 *    fora do pacote de coroa), como o pedido avulso autorizado de 06/10.
 *  - Particular: as OS da Prefeitura do pedido são canceladas e o pedido volta a esperar o pagamento (a não ser que já tenha
 *    comprovante); a OS Cor sai no "Concluir venda", como na venda direta.
 * Venda já concluída (OS fechada) não troca: o Financeiro reabre a OS antes. Coroa do atendimento e pedido do site não usam o botão.
 */
function definirPagadorPedidoCoroa(PDO $pdo, int $pedidoId, int $convenioId, ?int $usuarioId): array {
    if (!colunaExisteOS($pdo, 'coroas', 'convenio_id') || !colunaExisteOS($pdo, 'coroas', 'coroa_autorizada_prefeitura')) {
        throw new RegraNegocioException('Faltam as colunas convenio_id e coroa_autorizada_prefeitura na tabela coroas. Rode alteracoes_atendimento_sugeridas.sql.', 500);
    }
    return emTransacao($pdo, function () use ($pdo, $pedidoId, $convenioId, $usuarioId) {
        $st = $pdo->prepare('SELECT * FROM coroas WHERE id = :id FOR UPDATE');
        $st->execute(['id' => $pedidoId]);
        $ped = $st->fetch();
        if (!$ped) {
            throw new RegraNegocioException("Pedido de coroa {$pedidoId} não encontrado.", 404);
        }
        if ((int) ($ped['atendimento_origem_id'] ?? 0) > 0 || ($ped['origem'] ?? '') === 'ordem_servico') {
            throw new RegraNegocioException('Coroa do atendimento: quem paga segue o registro do atendimento.', 422);
        }
        if (trim((string) ($ped['origem_externa_id'] ?? '')) !== '') {
            throw new RegraNegocioException('Pedido do site: já foi pago pelo cliente no site.', 422);
        }
        if (!empty($ped['cancelado_em'])) {
            throw new RegraNegocioException('Pedido cancelado: não muda quem paga.', 409);
        }
        $pref = null;
        if ($convenioId > 0) {
            $pref = prefeituraDoApoio($pdo, $convenioId);
            $q = $pdo->prepare('SELECT * FROM convenios WHERE id = :id');
            $q->execute(['id' => $convenioId]);
            if (!pacotesDeCoroa($pdo, $q->fetch() ?: [])) {
                throw new RegraNegocioException("A {$pref['nome']} não tem pacote de coroa em Convênios: cadastre o pacote (tipo Produto) antes.", 422);
            }
        }
        $alteracoes = [];
        // OS da Prefeitura já concluídas impedem a troca
        $q = $pdo->prepare("SELECT * FROM os_ordens WHERE tipo = 'COROA' AND coroa_pedido_id = :p AND status <> 'CANCELADA' AND convenio LIKE 'PREFEITURA%' ORDER BY id");
        $q->execute(['p' => $pedidoId]);
        foreach ($q->fetchAll() as $o) {
            $mesma = $pref && strtoupper((string) $o['convenio']) === $pref['codigo'];
            if ($o['status'] !== 'ABERTA' && !$mesma) {
                throw new RegraNegocioException("OS {$o['numero_os']} está " . rotuloStatusSimples($o) . ': para mudar quem paga, o Financeiro reabre a OS.', 409);
            }
        }
        // Venda direta (OS Cor) aberta: descartada quando a Prefeitura passa a pagar
        if ($pref) {
            $q = $pdo->prepare("SELECT * FROM os_ordens WHERE tipo = 'COROA' AND coroa_pedido_id = :p AND natureza = 'PARTICULAR'
                                AND status NOT IN ('CANCELADA','CONVERTIDA') AND (convenio IS NULL OR convenio NOT LIKE 'PREFEITURA%') ORDER BY id DESC LIMIT 1 FOR UPDATE");
            $q->execute(['p' => $pedidoId]);
            if ($cor = $q->fetch()) {
                $f = $pdo->prepare('SELECT COUNT(*) FROM os_financeiro WHERE os_id = :id');
                $f->execute(['id' => (int) $cor['id']]);
                if ($cor['status'] !== 'ABERTA' || (int) $f->fetchColumn() > 0) {
                    throw new RegraNegocioException("A venda deste pedido já foi concluída na OS {$cor['numero_os']}. Para passar para a Prefeitura, o Financeiro reabre a OS.", 409);
                }
                $alteracoes[] = descartarOSRascunho($pdo, $cor, $usuarioId, "a coroa passou a ser paga pela {$pref['nome']}.");
            }
        }
        $temComprovante = trim((string) ($ped['comprovante_url'] ?? '')) !== '';
        $pdo->prepare('UPDATE coroas SET convenio_id = :c, coroa_autorizada_prefeitura = :a, status_pagamento = :p, atualizado_em = NOW() WHERE id = :id')
            ->execute(['c' => $pref ? $convenioId : null, 'a' => $pref ? 'Sim' : null,
                       'p' => $pref ? 'pago' : ($temComprovante ? (string) $ped['status_pagamento'] : 'aguardando_pagamento'), 'id' => $pedidoId]);
        $r = lancarPedidoCoroaPrefeitura($pdo, $pedidoId, $usuarioId);
        if (!empty($r['aviso'])) {
            $alteracoes[] = $r['aviso'];
        }
        return ['pagador' => $pref ? 'PREFEITURA' : 'PARTICULAR', 'prefeitura' => $pref['nome'] ?? null,
                'os_convenio' => $r['os_convenio'], 'os_particular' => $r['os_particular'], 'alteracoes' => $alteracoes];
    });
}

/* =====================================================================
 * CONCLUSÃO DA VENDA (09/10/2026)
 * Aberta → Concluída (fecha a venda: status FECHADA, motivo CONCLUSAO, valores travados, vai para o financeiro;
 * o pagamento do momento é lançado aqui, com uma ou mais formas, parcelas no cartão de crédito e comprovante)
 * → Assinada (opcional quando quitada: registra quem assinou e emite a NP do saldo = total − tudo o que já entrou).
 * Script do banco: os_migracao_conclusao.php.
 * ===================================================================== */

const ORIGEM_PAGAMENTO_CONCLUSAO = 'CONCLUSAO';
const ORIGEM_PAGAMENTO_SITE = 'SITE';
const COMPROVANTE_DISPENSADO = ['DINHEIRO'];   // dinheiro não tem comprovante; o pedido do site também não

/** Valor de os_parametros (null se a tabela ou a chave não existir). */
function parametroOS(PDO $pdo, string $chave): ?string {
    try {
        $st = $pdo->prepare('SELECT valor FROM os_parametros WHERE chave = :c');
        $st->execute(['c' => $chave]);
        $v = $st->fetchColumn();
        return $v === false ? null : (string) $v;
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * Formas de pagamento da conclusão: [['forma','valor','parcelas','comprovante_url'], ...] (pode ser vazia = tudo a receber).
 * OS de convênio não recebe pagamento. A soma não passa do que falta receber. Comprovante obrigatório, menos no dinheiro
 * e no pagamento do site. Parcelas só no cartão de crédito (1 a 24).
 */
function validarPagamentosConclusao(array $os, array $pagamentos, float $jaPago, bool $doSite = false): array {
    $pagamentos = array_values(array_filter($pagamentos, fn ($p) => is_array($p) && ((float) ($p['valor'] ?? 0) > 0 || trim((string) ($p['forma'] ?? '')) !== '')));
    if ($os['natureza'] !== 'PARTICULAR') {
        if ($pagamentos) {
            throw new RegraNegocioException("OS {$os['numero_os']} é de convênio: não recebe pagamento.", 422);
        }
        return [];
    }
    $falta = dinheiro((float) $os['valor_total'] - $jaPago);
    $soma = 0.0;
    $saida = [];
    foreach ($pagamentos as $i => $p) {
        $n = $i + 1;
        $forma = strtoupper(trim((string) ($p['forma'] ?? '')));
        $valor = dinheiro((float) ($p['valor'] ?? 0));
        if (!in_array($forma, FORMAS_PAGAMENTO, true)) {
            throw new RegraNegocioException("Pagamento {$n}: escolha a forma.");
        }
        if ($valor <= 0) {
            throw new RegraNegocioException("Pagamento {$n}: informe o valor.");
        }
        $parcelas = null;
        if ($forma === 'CARTAO_CREDITO') {
            $parcelas = (int) ($p['parcelas'] ?? 1);
            if ($parcelas < 1 || $parcelas > 24) {
                throw new RegraNegocioException("Pagamento {$n}: parcelas do cartão de 1 a 24.");
            }
        }
        $comprovante = trim((string) ($p['comprovante_url'] ?? ''));
        if (!$doSite && $comprovante === '' && !in_array($forma, COMPROVANTE_DISPENSADO, true)) {
            throw new RegraNegocioException("Pagamento {$n} (" . rotuloFormaPagamento($forma) . '): anexe a foto do comprovante.');
        }
        $soma = dinheiro($soma + $valor);
        $saida[] = ['forma' => $forma, 'valor' => $valor, 'parcelas' => $parcelas, 'comprovante_url' => $comprovante !== '' ? $comprovante : null,
                    'observacao' => isset($p['observacao']) ? mb_substr(trim((string) $p['observacao']), 0, 200) : null];
    }
    if ($soma > $falta + TOLERANCIA_CENTAVO) {
        throw new RegraNegocioException('Os pagamentos somam ' . formatarReais($soma) . ', mais que o total a receber da OS (' . formatarReais($falta) . ').', 422);
    }
    return $saida;
}

function rotuloFormaPagamento(string $forma): string {
    $r = ['DINHEIRO' => 'Dinheiro', 'PIX' => 'PIX', 'CARTAO_DEBITO' => 'Cartão de débito', 'CARTAO_CREDITO' => 'Cartão de crédito',
          'TRANSFERENCIA' => 'Transferência', 'CHEQUE' => 'Cheque', 'BOLETO' => 'Boleto', 'OUTRO' => 'Outro'];
    return $r[$forma] ?? $forma;
}

/** "PIX R$ 3.000,00 · Cartão de crédito 3x R$ 2.000,00" — recebimentos vigentes da OS (com as parcelas, se houver). */
function resumoPagamentosDaOS(PDO $pdo, int $osId): string {
    $temParcelas = colunaExisteOS($pdo, 'os_financeiro_pagamentos', 'parcelas');
    $st = $pdo->prepare('SELECT p.forma_pagamento, p.valor' . ($temParcelas ? ', p.parcelas' : ', NULL AS parcelas') . ', p.observacao
                         FROM os_financeiro_pagamentos p JOIN os_financeiro f ON f.id = p.financeiro_id
                         WHERE f.os_id = :id AND f.status <> \'CANCELADO\' AND p.estornado = 0 ORDER BY p.id');
    $st->execute(['id' => $osId]);
    $partes = [];
    foreach ($st->fetchAll() as $p) {
        $parc = (int) $p['parcelas'] > 1 ? ' ' . (int) $p['parcelas'] . 'x' : '';
        $partes[] = rotuloFormaPagamento((string) $p['forma_pagamento']) . $parc . ' ' . formatarReais((float) $p['valor']);
    }
    return implode(' · ', $partes);
}

/**
 * Conclui a venda: fecha a OS (FECHADA/CONCLUSAO), trava os valores e lança os pagamentos do momento
 * (cada forma vira um recebimento no financeiro, com parcelas e comprovante). Tudo numa transação.
 */
function concluirOS(PDO $pdo, int $osId, array $pagamentos, ?int $usuarioId, bool $doSite = false): array {
    return emTransacao($pdo, function () use ($pdo, $osId, $pagamentos, $usuarioId, $doSite) {
        $os = buscarOSPorId($pdo, $osId, true);
        if ($os['status'] !== 'ABERTA') {
            throw new RegraNegocioException("OS {$os['numero_os']} está " . rotuloStatusSimples($os) . ' — só OS aberta pode ser concluída.', 409);
        }
        $n = $pdo->prepare('SELECT COUNT(*) FROM os_itens WHERE os_id = :id');
        $n->execute(['id' => $osId]);
        if ((int) $n->fetchColumn() === 0) {
            throw new RegraNegocioException("OS {$os['numero_os']} não tem itens — não há venda a concluir.", 422);
        }
        if ($os['natureza'] === 'PARTICULAR' && dinheiro((float) $os['valor_total']) <= 0) {
            throw new RegraNegocioException("OS {$os['numero_os']} está sem valor — lance os itens antes de concluir.", 422);
        }
        $jaPago = valorJaPagoDaOS($pdo, $osId);
        $pags = validarPagamentosConclusao($os, $pagamentos, $jaPago, $doSite);

        $temConclusao = colunaExisteOS($pdo, 'os_ordens', 'concluida_em');
        if (!$temConclusao) {
            throw new RegraNegocioException('Falta rodar o script do banco da conclusão (os_migracao_conclusao.php).', 500);
        }
        $pdo->prepare("UPDATE os_ordens SET status = 'FECHADA', motivo_fechamento = 'CONCLUSAO', concluida_em = NOW(), concluida_por = :u,
                           confirmada_em = COALESCE(confirmada_em, NOW()), confirmada_por = COALESCE(confirmada_por, :u2), confirmada_valor_total = valor_total
                       WHERE id = :id AND status = 'ABERTA'")
            ->execute(['u' => $usuarioId, 'u2' => $usuarioId, 'id' => $osId]);

        $pagoAgora = 0.0;
        if ($pags) {
            $existente = $pdo->prepare("SELECT id FROM os_financeiro WHERE os_id = :id AND status NOT IN ('FATURADO','CANCELADO') ORDER BY id DESC LIMIT 1");
            $existente->execute(['id' => $osId]);
            $finId = $existente->fetchColumn();
            $soma = array_sum(array_map(fn ($p) => $p['valor'], $pags));
            $fin = $finId ? buscarFinanceiroPorId($pdo, (int) $finId)
                : criarPropostaFinanceira($pdo, $osId, ($jaPago + $soma) < (float) $os['valor_total'] - TOLERANCIA_CENTAVO ? 'MISTO' : 'A_VISTA',
                    dinheiro((float) $os['valor_total']), null, $usuarioId);
            $temParcelas = colunaExisteOS($pdo, 'os_financeiro_pagamentos', 'parcelas');
            $temOrigem = colunaExisteOS($pdo, 'os_financeiro_pagamentos', 'origem');
            foreach ($pags as $p) {
                $obs = $p['observacao'] ?: ($doSite ? 'Pagamento online (site)' : 'Pagamento na conclusão da venda');
                if ((int) $p['parcelas'] > 1) {
                    $obs .= ' · cartão em ' . (int) $p['parcelas'] . 'x';
                }
                $r = registrarPagamentoFinanceiro($pdo, (int) $fin['id'], $p['forma'], $p['valor'], date('Y-m-d'), mb_substr($obs, 0, 255), $usuarioId);
                $pagId = (int) $r['pagamento_id'];
                if ($temParcelas || $temOrigem) {
                    $sets = [];
                    $par = ['id' => $pagId];
                    if ($temParcelas) {
                        $sets[] = 'parcelas = :parc';
                        $par['parc'] = $p['parcelas'];
                    }
                    if ($temOrigem) {
                        $sets[] = 'origem = :orig';
                        $par['orig'] = $doSite ? ORIGEM_PAGAMENTO_SITE : ORIGEM_PAGAMENTO_CONCLUSAO;
                    }
                    $pdo->prepare('UPDATE os_financeiro_pagamentos SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($par);
                }
                if ($p['comprovante_url']) {
                    anexarComprovanteFinanceiro($pdo, $pagId, $p['comprovante_url'], $usuarioId);
                }
                $pagoAgora = dinheiro($pagoAgora + $p['valor']);
            }
            $pdo->prepare('UPDATE os_ordens SET pago_no_ato = :v, forma_pagamento_no_ato = :f WHERE id = :id')
                ->execute(['v' => $pagoAgora, 'f' => count($pags) === 1 ? $pags[0]['forma'] : null, 'id' => $osId]);
        }
        $osFim = buscarOSPorId($pdo, $osId);
        $saldo = $osFim['natureza'] === 'PARTICULAR' ? max(0.0, dinheiro((float) $osFim['valor_total'] - valorJaPagoDaOS($pdo, $osId))) : 0.0;
        $descr = 'Venda concluída — total ' . formatarReais((float) $osFim['valor_total']);
        if ($pags) {
            $descr .= '; pago agora ' . formatarReais($pagoAgora) . ' (' . resumoPagamentosDaOS($pdo, $osId) . ')';
        }
        if ($osFim['natureza'] === 'PARTICULAR') {
            $descr .= $saldo > 0 ? '; a receber ' . formatarReais($saldo) . ' (nota promissória na assinatura)' : '; quitada';
        }
        registrarEvento($pdo, $osId, 'CONCLUIDA', $descr, $usuarioId, (float) $osFim['valor_total']);
        // OS de coroa quitada: o pedido de coroa fica "Pago" na tela de coroas.
        if ($osFim['tipo'] === 'COROA' && $osFim['coroa_pedido_id'] !== null && $saldo <= 0 && $osFim['natureza'] === 'PARTICULAR') {
            $pdo->prepare("UPDATE coroas SET status_pagamento = 'pago' WHERE id = :id")->execute(['id' => (int) $osFim['coroa_pedido_id']]);
        }
        return ['os' => $osFim, 'pago_agora' => $pagoAgora, 'saldo' => $saldo];
    });
}

function rotuloStatusSimples(array $os): string {
    if ($os['status'] === 'FECHADA') {
        return !empty($os['assinada_em']) ? 'assinada' : 'concluída';
    }
    return mb_strtolower(str_replace('_', ' ', (string) $os['status']));
}

/* ---------------------------------------------------------------------
 * OS DE COROA (Cor) — venda direta e pedido online (09/10/2026)
 * Só pedidos criados a partir de os_parametros.os_cor_inicio (gravado pelo script do banco). Ficam de fora a coroa do
 * atendimento (entra na OS do atendimento) e a coroa autorizada pela Prefeitura (OS Prf/Dif.Prf).
 * Venda direta: a OS nasce ABERTA e é concluída pelo botão "Concluir venda" do pedido.
 * Site: a OS nasce já concluída e quitada pelo total pago no site (o frete, se houver, vai junto e fica descrito).
 * --------------------------------------------------------------------- */

/** Pedido de coroa ou null. */
function pedidoCoroaPorId(PDO $pdo, int $pedidoId): ?array {
    $st = $pdo->prepare('SELECT * FROM coroas WHERE id = :id');
    $st->execute(['id' => $pedidoId]);
    return $st->fetch() ?: null;
}

/** O pedido gera OS Cor? (avulso, não autorizado pela Prefeitura, criado depois do início). Devolve o motivo quando não. */
function motivoSemOSDeCoroa(PDO $pdo, array $ped): ?string {
    $inicio = parametroOS($pdo, 'os_cor_inicio');
    if ($inicio === null) {
        return 'O script do banco da conclusão ainda não foi rodado.';
    }
    if (!empty($ped['cancelado_em'])) {   // 13/10/2026
        return 'Pedido de coroa cancelado.';
    }
    // Só a coroa GERADA pelo atendimento entra na OS dele (atendimento_origem_id). Venda direta para um falecido do quadro gera OS Cor.
    if ((int) ($ped['atendimento_origem_id'] ?? 0) > 0 || ($ped['origem'] ?? '') === 'ordem_servico') {
        return 'Coroa do atendimento: entra na OS do próprio atendimento.';
    }
    if (array_key_exists('coroa_autorizada_prefeitura', $ped) && simNao($ped['coroa_autorizada_prefeitura'] ?? '')) {
        return 'Coroa autorizada pela Prefeitura: vai na OS da Prefeitura.';
    }
    if ((string) $ped['criado_em'] < $inicio) {
        return 'Pedido anterior ao início da OS de coroa.';
    }
    return null;
}

/**
 * OS Cor do pedido: devolve a existente ou cria (ABERTA, uma linha por coroa, pelo valor do pedido).
 * $valorTotal (pedido do site): o total pago; a diferença para a soma das coroas (frete) entra nas linhas e fica descrita.
 */
function garantirOSDaCoroa(PDO $pdo, int $pedidoId, ?int $usuarioId, ?float $valorTotal = null, ?string $origemVenda = null): array {
    return emTransacao($pdo, function () use ($pdo, $pedidoId, $usuarioId, $valorTotal, $origemVenda) {
        $existente = $pdo->prepare("SELECT * FROM os_ordens WHERE tipo = 'COROA' AND coroa_pedido_id = :p AND natureza = 'PARTICULAR'
                                    AND status NOT IN ('CANCELADA','CONVERTIDA') AND (convenio IS NULL OR convenio NOT LIKE 'PREFEITURA%') ORDER BY id DESC LIMIT 1 FOR UPDATE");
        $existente->execute(['p' => $pedidoId]);
        if ($os = $existente->fetch()) {
            return $os;
        }
        $ped = pedidoCoroaPorId($pdo, $pedidoId);
        if (!$ped) {
            throw new RegraNegocioException("Pedido de coroa {$pedidoId} não encontrado.", 404);
        }
        if ($motivo = motivoSemOSDeCoroa($pdo, $ped)) {
            throw new RegraNegocioException($motivo, 422);
        }
        $it = $pdo->prepare('SELECT produto_id, frase, valor FROM coroas_itens WHERE coroa_id = :p ORDER BY ordem, id');
        $it->execute(['p' => $pedidoId]);
        $coroas = array_values(array_filter($it->fetchAll(), fn ($r) => (int) $r['produto_id'] > 0));
        if (!$coroas) {
            throw new RegraNegocioException('O pedido não tem coroas com modelo do estoque.', 422);
        }
        $valores = array_map(fn ($c) => (float) $c['valor'] > 0 ? dinheiro((float) $c['valor']) : buscarPrecoVenda($pdo, (int) $c['produto_id']), $coroas);
        // Total pago no site: distribui a diferença (frete/taxa) pelas coroas, proporcional; o centavo que sobrar vai na última.
        if ($valorTotal !== null && $valorTotal > 0) {
            $soma = array_sum($valores);
            $alvo = dinheiro($valorTotal);
            if ($soma > 0 && abs($alvo - $soma) > TOLERANCIA_CENTAVO) {
                $acum = 0.0;
                foreach ($valores as $i => $v) {
                    $valores[$i] = $i === count($valores) - 1 ? dinheiro($alvo - $acum) : dinheiro($v * $alvo / $soma);
                    $acum = dinheiro($acum + $valores[$i]);
                }
            }
        }
        $os = obterOuCriarOS($pdo, 'COROA', null, $pedidoId, 'PARTICULAR', 'PARTICULAR', $usuarioId);
        if ($origemVenda !== null && colunaExisteOS($pdo, 'os_ordens', 'origem_venda')) {
            $pdo->prepare('UPDATE os_ordens SET origem_venda = :o WHERE id = :id')->execute(['o' => $origemVenda, 'id' => $os['id']]);
        }
        foreach ($coroas as $i => $c) {
            $frase = trim((string) ($c['frase'] ?? '')) ?: null;
            inserirItem($pdo, (int) $os['id'], (int) $c['produto_id'], 'COROA', 1, $valores[$i], false, 'PADRAO', $frase);
        }
        recalcularValorTotal($pdo, (int) $os['id']);
        registrarEvento($pdo, (int) $os['id'], 'ITEM_INCLUIDO', count($coroas) . ' coroa(s) do pedido de coroa nº ' . $pedidoId
            . ($origemVenda === 'SITE' ? ' (pedido do site)' : ' (venda direta)'), $usuarioId);
        return buscarOSPorId($pdo, (int) $os['id']);
    });
}

/**
 * Pedidos de coroa novos sem OS: o do site ganha a OS já concluída e quitada (total pago, frete descrito, sem comprovante);
 * o de venda direta ganha a OS aberta (concluída depois, no pedido). Cada pedido é tratado à parte: um erro não trava os outros
 * nem a tela (fica no log do PHP). Pode rodar quantas vezes for: pedido com OS é pulado.
 */
function sincronizarOSDeCoroa(PDO $pdo, ?int $usuarioId = null): array {
    $feitos = ['site' => 0, 'venda_direta' => 0, 'erros' => 0];
    $inicio = parametroOS($pdo, 'os_cor_inicio');
    if ($inicio === null) {
        return $feitos;
    }
    try {
        $colTotal = colunaExisteOS($pdo, 'coroas', 'total_pago') ? 'c.total_pago, c.frete' : 'NULL AS total_pago, NULL AS frete';
        // Pedido cancelado não ganha OS de novo (13/10/2026: a OS cancelada não pode voltar como OS nova na sincronização).
        $semCancelado = colunaExisteOS($pdo, 'coroas', 'cancelado_em') ? ' AND c.cancelado_em IS NULL' : '';
        $st = $pdo->prepare("SELECT c.id, c.origem_externa_id, c.status_pagamento, c.criado_por, {$colTotal} FROM coroas c
                             WHERE c.criado_em >= :ini AND COALESCE(c.origem, '') <> 'ordem_servico'
                               AND c.atendimento_origem_id IS NULL{$semCancelado}
                               AND NOT EXISTS (SELECT 1 FROM os_ordens o WHERE o.tipo = 'COROA' AND o.coroa_pedido_id = c.id AND o.status <> 'CANCELADA')
                             ORDER BY c.id LIMIT 50");
        $st->execute(['ini' => $inicio]);
        $pendentes = $st->fetchAll();
    } catch (Throwable $e) {
        error_log('[OS] sincronizarOSDeCoroa: ' . $e->getMessage());
        return $feitos;
    }
    foreach ($pendentes as $p) {
        $site = trim((string) ($p['origem_externa_id'] ?? '')) !== '';
        try {
            if ($site) {
                if (strtolower((string) $p['status_pagamento']) !== 'pago') {
                    continue;   // o site só manda pedido pago; se não estiver, espera
                }
                emTransacao($pdo, function () use ($pdo, $p, $usuarioId) {
                    $total = $p['total_pago'] !== null ? (float) $p['total_pago'] : null;
                    $os = garantirOSDaCoroa($pdo, (int) $p['id'], null, $total, 'SITE');
                    $frete = $p['frete'] !== null ? dinheiro((float) $p['frete']) : 0.0;
                    $obs = 'Pagamento online (site) — pedido nº ' . $p['origem_externa_id'] . ($frete > 0 ? ' · inclui frete ' . formatarReais($frete) : '');
                    // recebimento lançado em nome de quem abriu o painel (a OS fica com "Site (online)" como origem)
                    concluirOS($pdo, (int) $os['id'], [['forma' => 'OUTRO', 'valor' => (float) $os['valor_total'], 'observacao' => $obs]], $usuarioId, true);
                });
                $feitos['site']++;
            } else {
                garantirOSDaCoroa($pdo, (int) $p['id'], is_numeric($p['criado_por'] ?? null) ? (int) $p['criado_por'] : $usuarioId, null, 'VENDA_DIRETA');
                $feitos['venda_direta']++;
            }
        } catch (Throwable $e) {
            $feitos['erros']++;
            error_log('[OS] OS de coroa do pedido ' . $p['id'] . ': ' . $e->getMessage());
        }
    }
    return $feitos;
}
