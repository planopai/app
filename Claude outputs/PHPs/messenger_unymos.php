<?php
/**
 * messenger_unymos.php — integração do Messenger com a Unymos (apiecommerce) e a UnyFintech (16/10/2026).
 *
 * Só o Messenger usa este arquivo (carregado pelo messenger_nucleo.php); ele NÃO é um endereço público:
 * quem chega aqui já passou pelo login e pelas permissões do messenger.php / pela assinatura do webhook.
 * Não passa pelo associados_geral.php nem baixa o catálogo de contratos: tudo é consulta direta
 * (beneficiário por telefone, CPF, número do contrato ou nome).
 *
 * Chaves no pai-chaves.php (as mesmas do app): uny_chave, uny_email, uny_senha, uny_caixa_banco_id, unyfintech_api_base.
 * Regra do lote de pagamento igual à do sistema: a partir da mensalidade (TXM) mais antiga em aberto, junta as do
 * mesmo contrato com vencimento até o último dia do mês corrente; sem nenhuma nesse intervalo, vai só a mais antiga.
 */

const UNY_ECOMMERCE = 'https://apiecommerce.unypax.com.br/api/v1';

/* ---------------------------------------------------------------------
 * Acesso
 * ------------------------------------------------------------------- */

/** Tokens (JWT + tokenUnypax), guardados por 110 min em chat_config. */
function msgUnyTokens(PDO $pdo, bool $renovar = false): ?array
{
    static $mem = null;
    if (!$renovar && is_array($mem) && (int) $mem['exp'] > time() + 60) {
        return $mem;
    }
    if (!$renovar) {
        $c = json_decode((string) msgConfigTela($pdo, 'uny_token', ''), true);
        if (is_array($c) && !empty($c['token']) && (int) ($c['exp'] ?? 0) > time() + 60) {
            return $mem = $c;
        }
    }
    $chave = (string) msgConfig('uny_chave', '');
    if ($chave === '') {
        return null;
    }
    $r = msgHttp('POST', UNY_ECOMMERCE . '/auth/login-usuario', ['Content-Type: application/json', 'Accept: application/json'],
        json_encode(['chave' => $chave, 'email' => (string) msgConfig('uny_email', ''), 'senha' => (string) msgConfig('uny_senha', '')]), 20);
    $j = json_decode((string) ($r['corpo'] ?? ''), true);
    if (!is_array($j) || empty($j['isValid']) || empty($j['token'])) {
        error_log('[messenger] Unymos: login recusado (HTTP ' . ($r['status'] ?? 0) . ')');
        return null;
    }
    $t = ['token' => (string) $j['token'], 'tokenUnypax' => (string) ($j['tokenUnypax'] ?? ''), 'exp' => time() + 110 * 60];
    $pdo->prepare("INSERT INTO chat_config (chave, valor) VALUES ('uny_token', :v) ON DUPLICATE KEY UPDATE valor = :v2")->execute([':v' => json_encode($t), ':v2' => json_encode($t)]);
    return $mem = $t;
}

/**
 * Chamada à Unymos/UnyFintech com o token (refaz o login uma vez se vencer).
 * Retorna ['ok' => bool, 'status' => int, 'json' => mixed]. Sem acesso, lança RuntimeException com mensagem para a tela.
 */
function msgUny(PDO $pdo, string $metodo, string $url, ?array $corpo = null, int $timeout = 30): array
{
    for ($tentativa = 0; $tentativa < 2; $tentativa++) {
        $t = msgUnyTokens($pdo, $tentativa > 0);
        if (!$t) {
            throw new RuntimeException('Não foi possível entrar na Unymos (confira uny_chave, uny_email e uny_senha no pai-chaves.php).');
        }
        $cab = ['Accept: application/json', 'Authorization: Bearer ' . $t['token'], 'UnyAuth: ' . $t['tokenUnypax']];
        if ($corpo !== null) {
            $cab[] = 'Content-Type: application/json';
        }
        $r = msgHttp($metodo, $url, $cab, $corpo !== null ? json_encode($corpo === [] ? new stdClass() : $corpo, JSON_UNESCAPED_UNICODE) : null, $timeout);
        $status = (int) ($r['status'] ?? 0);
        if ($status === 401 && $tentativa === 0) {
            continue;
        }
        if ($status === 0) {
            error_log('[messenger] Unymos sem resposta: ' . $url . ' ' . ($r['erro'] ?? ''));
            throw new RuntimeException('A Unymos não respondeu agora. Tente de novo em instantes.');
        }
        $json = json_decode((string) ($r['corpo'] ?? ''), true);
        if ($status >= 400) {
            error_log('[messenger] Unymos HTTP ' . $status . ' em ' . $url . ': ' . mb_substr((string) ($r['corpo'] ?? ''), 0, 300));
        }
        return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'json' => $json];
    }
    throw new RuntimeException('A Unymos recusou o acesso.');
}

function msgUnyFintech(): string
{
    $base = rtrim((string) msgConfig('unyfintech_api_base', ''), '/');
    return ($base !== '' ? $base : 'https://unyfintech.unypax.com.br') . '/api/v1';
}

function msgUnyErro(mixed $json, string $padrao): string
{
    if (is_array($json)) {
        foreach (['errors', 'erros'] as $k) {
            if (!empty($json[$k]) && is_array($json[$k])) {
                return implode(' ', array_map('strval', $json[$k]));
            }
        }
        foreach (['message', 'mensagem', 'error', 'title'] as $k) {
            if (!empty($json[$k]) && is_string($json[$k])) {
                return $json[$k];
            }
        }
    }
    return $padrao;
}

/* ---------------------------------------------------------------------
 * Leitura tolerante dos campos (a Unymos alterna maiúsculas e acentos)
 * ------------------------------------------------------------------- */
function msgUnyCampo(array $a, array $nomes, mixed $padrao = null): mixed
{
    foreach ($nomes as $n) {
        if (array_key_exists($n, $a) && $a[$n] !== null && $a[$n] !== '') {
            return $a[$n];
        }
    }
    $min = array_change_key_case($a, CASE_LOWER);
    foreach ($nomes as $n) {
        $k = mb_strtolower($n);
        if (array_key_exists($k, $min) && $min[$k] !== null && $min[$k] !== '') {
            return $min[$k];
        }
    }
    return $padrao;
}

function msgUnyData(mixed $v): string
{
    $v = trim((string) $v);
    if ($v === '') {
        return '';
    }
    if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $v, $m)) {
        return $m[1];
    }
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})/', $v, $m)) {
        return "{$m[3]}-{$m[2]}-{$m[1]}";
    }
    return $v;
}

function msgUnyValor(mixed $v): float
{
    if (is_numeric($v)) {
        return round((float) $v, 2);
    }
    $s = preg_replace('/[^\d,.\-]/', '', (string) $v);
    if (str_contains($s, ',')) {
        $s = str_replace(['.', ','], ['', '.'], $s);
    }
    return round((float) $s, 2);
}

/** Um titular da resposta "Pesquisar Beneficiário", com as listas separadas pelo tipo de conteúdo. */
function msgUnyNormalizar(array $b): array
{
    $saida = [
        'beneficiario_id' => (int) msgUnyCampo($b, ['beneficiarioId', 'BeneficiarioId'], 0),
        'contrato' => (string) msgUnyCampo($b, ['numeroContrato', 'NumeroContrato'], ''),
        'titular' => (string) msgUnyCampo($b, ['titular', 'Titular', 'nome', 'Nome'], ''),
        'nome' => (string) msgUnyCampo($b, ['nome', 'Nome'], ''),
        'plano' => (string) msgUnyCampo($b, ['planoCobertura', 'PlanoCobertura'], ''),
        'cpf' => preg_replace('/\D/', '', (string) msgUnyCampo($b, ['cpf', 'CPF', 'Cpf'], '')),
        'data_contrato' => msgUnyData(msgUnyCampo($b, ['dataContrato', 'DataContrato'], '')),
        'cidade' => (string) msgUnyCampo($b, ['cidadeNome', 'enderecoCidade', 'CidadeNome'], ''),
        // confirmação de dados pela Aurora (22/10/2026): fica só no servidor, nunca vai para a IA nem para a tela
        'nascimento' => msgUnyData(msgUnyCampo($b, ['dataNascimento', 'DataNascimento', 'dataNascimentoTitular', 'DataNascimentoTitular'], '')),
        'fones' => [],
        'beneficiarios' => [],
        'contas' => [],
        'notas' => [],
    ];
    foreach ($b as $chave => $valor) {
        if (is_scalar($valor) && preg_match('/fone|telefone|celular/i', (string) $chave)) {
            $d = preg_replace('/\D/', '', (string) $valor);
            if (strlen($d) >= 8) {
                $saida['fones'][] = $d;
            }
            continue;
        }
        if (!is_array($valor) || !array_is_list($valor)) {
            continue;
        }
        foreach ($valor as $item) {
            if (!is_array($item)) {
                continue;
            }
            if (msgUnyCampo($item, ['DataVencimento', 'dataVencimento']) !== null) {
                $sit = mb_strtoupper(trim((string) msgUnyCampo($item, ['Situação', 'Situacao', 'situacao', 'situação', 'Status'], 'P')));
                $saida['contas'][] = [
                    'id' => (int) msgUnyCampo($item, ['ID', 'Id', 'id'], 0),
                    'situacao' => str_starts_with($sit, 'B') || str_contains($sit, 'PAGO') ? 'B' : (str_starts_with($sit, 'C') ? 'C' : 'P'),
                    'parcela' => (string) msgUnyCampo($item, ['Parcela', 'parcela'], ''),
                    'valor' => msgUnyValor(msgUnyCampo($item, ['Valor', 'valor'], 0)),
                    'vencimento' => msgUnyData(msgUnyCampo($item, ['DataVencimento', 'dataVencimento'], '')),
                    'tipo' => mb_strtoupper(trim((string) msgUnyCampo($item, ['Tipo', 'tipo'], ''))),
                    'pago_em' => msgUnyData(msgUnyCampo($item, ['DataPagamento', 'dataPagamento', 'DataBaixa', 'dataBaixa', 'DataRecebimento', 'dataRecebimento'], '')),
                    'forma' => trim((string) msgUnyCampo($item, ['FormaPagamento', 'formaPagamento', 'Cobranca', 'cobranca'], '')),
                ];
            } elseif (msgUnyCampo($item, ['NumeroRPS', 'numeroRPS']) !== null) {
                $saida['notas'][] = [
                    'id' => (int) msgUnyCampo($item, ['ID', 'Id', 'id'], 0),
                    'numero' => (string) msgUnyCampo($item, ['NumeroRPS', 'numeroRPS'], ''),
                    'data' => msgUnyData(msgUnyCampo($item, ['DataEmissao', 'dataEmissao'], '')),
                    'valor' => msgUnyValor(msgUnyCampo($item, ['Valor', 'valor'], 0)),
                ];
            } elseif (msgUnyCampo($item, ['Nome', 'nome', 'NomeBeneficiario', 'nomeBeneficiario']) !== null) {
                $tipo = mb_strtoupper(trim((string) msgUnyCampo($item, ['Tipo', 'tipo', 'TipoBeneficiario', 'tipoBeneficiario', 'Vinculo', 'vinculo'], '')));
                $tipo = match (true) {
                    str_starts_with($tipo, 'TIT') => 'T', str_starts_with($tipo, 'DEP') => 'D',
                    str_starts_with($tipo, 'AGR') => 'A', str_starts_with($tipo, 'PET') => 'P',
                    default => mb_substr($tipo, 0, 1),
                };
                $nasc = msgUnyData(msgUnyCampo($item, ['DataNascimento', 'dataNascimento'], ''));
                $grau = trim((string) msgUnyCampo($item, ['GrauParentesco', 'grauParentesco', 'Parentesco', 'parentesco', 'Grau', 'grau'], ''));
                if (preg_match('/^(.*?)\s*-\s*\((.*?)\)\s*$/u', $grau, $gm)) {
                    $grau = trim($gm[1]);
                    $t2 = mb_strtoupper(trim($gm[2]));
                    $tipo = $tipo !== '' ? $tipo : mb_substr($t2, 0, 1);
                    if (str_starts_with($t2, 'AGR')) {
                        $tipo = 'A';
                    } elseif (str_starts_with($t2, 'DEP')) {
                        $tipo = 'D';
                    }
                }
                if ($tipo === 'T' && $saida['nascimento'] === '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $nasc)) {
                    $saida['nascimento'] = $nasc; // data de nascimento do titular (lista de beneficiários)
                }
                $saida['beneficiarios'][] = [
                    'nome' => (string) msgUnyCampo($item, ['Nome', 'nome', 'NomeBeneficiario', 'nomeBeneficiario'], ''),
                    'tipo' => $tipo,
                    'grau' => mb_strtolower($grau) === 'titular' ? '' : $grau,
                    'idade' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $nasc) ? (int) (new DateTime($nasc))->diff(new DateTime('today'))->y : null,
                ];
            }
        }
    }
    $saida['fones'] = array_values(array_unique($saida['fones']));
    $saida['contas'] = array_values(array_filter($saida['contas'], fn($c) => $c['id'] > 0));
    usort($saida['beneficiarios'], fn($a, $b) => ($a['tipo'] === 'T' ? 0 : 1) <=> ($b['tipo'] === 'T' ? 0 : 1));
    return $saida;
}

/* ---------------------------------------------------------------------
 * Consultas
 * ------------------------------------------------------------------- */

/**
 * Titulares por um filtro da Unymos: ['CPF' => '000.000.000-00'] | ['NumeroContrato' => '00010'] | ['Fone' => '(77) 99945-1155'] | ['Nome' => '...'].
 * Número do contrato (22/10/2026): aceita com ou sem zeros à esquerda, pontos ou espaços ("13580", "013580", "13.580").
 * Se a Unymos não achar como foi digitado, tenta de novo com 6 dígitos (zeros à esquerda) e sem os zeros.
 */
function msgUnyBuscar(PDO $pdo, array $filtro): array
{
    if (!isset($filtro['NumeroContrato'])) {
        return msgUnyBuscarFiltro($pdo, $filtro);
    }
    $digitos = preg_replace('/\D/', '', (string) $filtro['NumeroContrato']);
    $semZeros = ltrim($digitos, '0');
    if ($semZeros === '') {
        return [];
    }
    $tentativas = array_values(array_unique([$digitos, str_pad($semZeros, 6, '0', STR_PAD_LEFT), $semZeros]));
    foreach ($tentativas as $numero) {
        $achados = msgUnyBuscarFiltro($pdo, ['NumeroContrato' => $numero] + $filtro);
        if ($achados) {
            return $achados;
        }
    }
    return [];
}

/** Uma consulta "Pesquisar Beneficiário" na Unymos, com o filtro exatamente como veio. */
function msgUnyBuscarFiltro(PDO $pdo, array $filtro): array
{
    $r = msgUny($pdo, 'GET', UNY_ECOMMERCE . '/convenio/beneficiario?' . http_build_query($filtro), null, 30);
    $j = $r['json'];
    if (!is_array($j)) {
        return [];
    }
    $lista = array_is_list($j) ? $j : [is_array($j['object'] ?? null) ? $j['object'] : (is_array($j['data'] ?? null) ? $j['data'] : $j)];
    if ($lista && array_is_list($lista) && isset($lista[0]) && is_array($lista[0]) && array_is_list($lista[0])) {
        $lista = $lista[0]; // { data: [ ... ] }
    }
    $saida = [];
    foreach ($lista as $b) {
        if (is_array($b)) {
            $n = msgUnyNormalizar($b);
            if ($n['contrato'] !== '') {
                $saida[] = $n;
            }
        }
    }
    return $saida;
}

function msgUnyCpfFormatado(string $cpf): string
{
    $d = preg_replace('/\D/', '', $cpf);
    return strlen($d) === 11 ? substr($d, 0, 3) . '.' . substr($d, 3, 3) . '.' . substr($d, 6, 3) . '-' . substr($d, 9) : $d;
}

/** O contrato do vínculo, lido na hora (pelo número; confere o CPF do titular quando houver mais de um resultado). */
function msgUnyContrato(PDO $pdo, string $contrato, string $cpf = ''): ?array
{
    $achados = msgUnyBuscar($pdo, ['NumeroContrato' => $contrato]);
    if (!$achados && strlen($cpf) === 11) {
        $achados = msgUnyBuscar($pdo, ['CPF' => msgUnyCpfFormatado($cpf)]);
    }
    $alvo = ltrim(preg_replace('/\D/', '', $contrato), '0');
    foreach ($achados as $a) {
        if (ltrim(preg_replace('/\D/', '', $a['contrato']), '0') === $alvo && ($cpf === '' || $a['cpf'] === '' || $a['cpf'] === $cpf)) {
            return $a;
        }
    }
    return $achados[0] ?? null;
}

/**
 * Confere os dados que o cliente informou com o cadastro da Unymos (22/10/2026), para liberar a cobrança de quem
 * ainda não tem o telefone vinculado ao contrato. Precisa da data de nascimento do titular E de mais um dado:
 * os 3 últimos dígitos do CPF do titular OU os 4 últimos dígitos de um telefone do cadastro.
 * Retorna 'ok' (confere), 'nao_confere' ou 'sem_dados' (o cadastro não tem o que comparar: vai para uma pessoa).
 */
function msgUnyConferirDados(array $k, string $nascimento, string $cpfFinal, string $foneFinal): string
{
    $nascimento = msgUnyData($nascimento);
    $cpfFinal = preg_replace('/\D/', '', $cpfFinal);
    $foneFinal = preg_replace('/\D/', '', $foneFinal);
    $temCpf = strlen((string) $k['cpf']) === 11;
    $temFone = !empty($k['fones']);
    if ($k['nascimento'] === '' || (!$temCpf && !$temFone)) {
        return 'sem_dados';
    }
    if ($nascimento !== $k['nascimento']) {
        return 'nao_confere';
    }
    if ($temCpf && strlen($cpfFinal) === 3 && substr((string) $k['cpf'], -3) === $cpfFinal) {
        return 'ok';
    }
    if ($temFone && strlen($foneFinal) === 4) {
        foreach ($k['fones'] as $f) {
            if (substr($f, -4) === $foneFinal) {
                return 'ok';
            }
        }
    }
    return 'nao_confere';
}

/** Autorização do beneficiário (autorizado ou negado, com os motivos). */
function msgUnyAutorizacao(PDO $pdo, int $beneficiarioId): ?array
{
    if ($beneficiarioId <= 0) {
        return null;
    }
    $r = msgUny($pdo, 'POST', UNY_ECOMMERCE . '/convenio/beneficiario-autorizar', ['BeneficiarioId' => $beneficiarioId], 20);
    $j = is_array($r['json']) ? $r['json'] : [];
    if (!array_key_exists('isValid', $j)) {
        return null;
    }
    return ['autorizado' => !empty($j['isValid']), 'motivos' => array_values(array_map('strval', (array) ($j['errors'] ?? $j['erros'] ?? [])))];
}

/** Mensalidades em aberto (só os tipos de mensalidade, padrão TXM), em ordem de vencimento, e o lote do pagamento. */
function msgUnyFinanceiro(array $contas): array
{
    $tipos = array_filter(array_map('trim', explode(',', mb_strtoupper((string) msgConfig('uny_tipos_mensalidade', 'TXM')))));
    $eMensalidade = function (array $c) use ($tipos): bool {
        foreach ($tipos as $t) {
            if ($c['tipo'] === $t || str_contains($c['tipo'], $t)) {
                return true;
            }
        }
        return false;
    };
    $abertas = array_values(array_filter($contas, fn($c) => $c['situacao'] === 'P' && $eMensalidade($c)));
    usort($abertas, fn($a, $b) => strcmp($a['vencimento'], $b['vencimento']));
    $hoje = date('Y-m-d');
    $fimMes = date('Y-m-t');
    $vencidas = array_values(array_filter($abertas, fn($c) => $c['vencimento'] !== '' && $c['vencimento'] < $hoje));
    $lote = array_values(array_filter($abertas, fn($c) => $c['vencimento'] !== '' && $c['vencimento'] <= $fimMes));
    if (!$lote && $abertas) {
        $lote = [$abertas[0]];
    }
    $pagas = array_values(array_filter($contas, fn($c) => $c['situacao'] === 'B'));
    usort($pagas, fn($a, $b) => strcmp($b['vencimento'], $a['vencimento']));
    return [
        'abertas' => $abertas,
        'vencidas' => $vencidas,
        'lote' => $lote,
        'total_vencido' => round(array_sum(array_column($vencidas, 'valor')), 2),
        'total_lote' => round(array_sum(array_column($lote, 'valor')), 2),
        'pagas' => array_slice($pagas, 0, 36),
    ];
}

/* ---------------------------------------------------------------------
 * Cobrança (UnyFintech)
 * ------------------------------------------------------------------- */

/** Link de pagamento Pix/cartão (mesmo formato do sistema: camelCase e, se recusar, PascalCase). */
function msgUnyLink(PDO $pdo, array $contaIds, float $valor): string
{
    $caixa = (int) msgConfig('uny_caixa_banco_id', 0);
    if ($caixa <= 0) {
        throw new RuntimeException('Configure uny_caixa_banco_id no pai-chaves.php.');
    }
    $tempo = 2880;
    $url = msgUnyFintech() . '/pix/gerar-link-pagamentov2';
    $r = msgUny($pdo, 'POST', $url, [
        'contasReceberId' => $contaIds, 'aplicativoOrigem' => 'APP_UNYMOS_PIX_AVULSO', 'tempoExpiracaoEmMinutos' => $tempo,
        'valor' => $valor, 'caixaBancoId' => $caixa, 'percJuros' => 0.0, 'percMulta' => 0.0, 'percDesconto' => 0.0,
    ], 40);
    if (!$r['ok'] && $r['status'] === 400) {
        $r = msgUny($pdo, 'POST', $url, [
            'ContasRecebers' => $contaIds, 'AplicativoOrigem' => 'APP_UNYMOS_PIX_AVULSO', 'TempoExpiracaoEmMinutos' => $tempo,
            'Valor' => $valor, 'CaixaBancoId' => $caixa, 'PercJuros' => 0.0, 'PercMulta' => 0.0, 'PercDesconto' => 0.0, 'FormaPagamentoId' => 28,
        ], 40);
    }
    $j = is_array($r['json']) ? $r['json'] : [];
    if (!$r['ok']) {
        throw new RuntimeException('A UnyFintech não gerou o link: ' . msgUnyErro($j, 'erro ' . $r['status']));
    }
    $chave = trim((string) ($j['chave'] ?? ''));
    $link = trim((string) ($j['urlLinkPagamento'] ?? $j['linkPagamento'] ?? ''));
    if ($link === '' && $chave !== '') {
        $link = rtrim((string) msgConfig('unyfintech_api_base', 'https://unyfintech.unypax.com.br'), '/') . '/pix/link-pagamentov2/PLANOPAI?linkPagamentoChave=' . rawurlencode($chave);
    }
    if ($link === '') {
        throw new RuntimeException('A UnyFintech gerou o link mas não devolveu o endereço.');
    }
    return $link;
}

/** Pix com QR Code (copia e cola + imagem base64 + id do lote para acompanhar o pagamento). */
function msgUnyPix(PDO $pdo, array $contaIds, float $valor): array
{
    $r = msgUny($pdo, 'POST', msgUnyFintech() . '/pix/gerar-pix-avulso', [
        'ContasRecebers' => $contaIds, 'AplicativoOrigem' => 'APP_UNYMOS_PIX_AVULSO', 'TempoExpiracaoEmMinutos' => 2880,
        'Valor' => $valor, 'DataBase' => date('Y-m-d\TH:i:s'), 'PercJuros' => 0.0, 'PercMulta' => 0.0, 'PercDesconto' => 0.0, 'FormaPagamentoId' => 28,
    ], 40);
    $j = is_array($r['json']) ? $r['json'] : [];
    if (!$r['ok'] || empty($j['pixCopiaECola'])) {
        throw new RuntimeException('A UnyFintech não gerou o Pix: ' . msgUnyErro($j, 'erro ' . $r['status']));
    }
    return [
        'copia_cola' => (string) $j['pixCopiaECola'],
        'qr_base64' => (string) ($j['pixQrCodeBase64'] ?? ''),
        'lote_id' => (int) ($j['pixLoteId'] ?? 0),
        'expira' => (string) ($j['dataExpiracao'] ?? ''),
        'link' => (string) ($j['linkPagamento'] ?? ''),
    ];
}

/** Situação do Pix: P = pendente, F = pago, C = cancelado. */
function msgUnyPixSituacao(PDO $pdo, int $loteId): string
{
    $r = msgUny($pdo, 'GET', msgUnyFintech() . '/pix/consulta-pix/' . $loteId, null, 20);
    $s = mb_strtoupper(trim((string) (is_array($r['json']) ? ($r['json']['situacao'] ?? '') : '')));
    return in_array($s, ['P', 'F', 'C'], true) ? $s : '';
}

/** PDF (base64) do boleto ou do recibo de uma conta a receber. */
function msgUnyPdf(PDO $pdo, string $tipo, int $contaId): string
{
    $r = $tipo === 'boleto'
        ? msgUny($pdo, 'POST', msgUnyFintech() . '/contas-receber/gerar-boleto', ['contasReceberId' => $contaId], 40)
        : msgUny($pdo, 'GET', msgUnyFintech() . '/contas-receber/imprimir-recibo-contas-receber/' . $contaId, null, 40);
    $pdf = is_array($r['json']) ? (string) ($r['json']['base64Pdf'] ?? '') : '';
    if (!$r['ok'] || $pdf === '') {
        throw new RuntimeException('A UnyFintech não gerou o ' . ($tipo === 'boleto' ? 'boleto' : 'recibo') . ': ' . msgUnyErro($r['json'], 'erro ' . $r['status']));
    }
    return preg_replace('/^data:application\/pdf;base64,/', '', $pdf);
}

/**
 * Confere os Pix gerados pelo Messenger que ainda estão pendentes (até 3 dias) e avisa na conversa quando forem pagos.
 * Chamado ao abrir o painel do cliente e depois dos avisos do WhatsApp (no máximo 5 por vez, cada um a cada 2 min).
 */
function msgUnyConferirPix(PDO $pdo, ?int $conversaId = null): void
{
    $sql = "SELECT * FROM chat_cobrancas WHERE tipo = 'pix' AND situacao = 'P' AND pix_lote_id IS NOT NULL
             AND criado_em > NOW() - INTERVAL 3 DAY AND (verificado_em IS NULL OR verificado_em < NOW() - INTERVAL 2 MINUTE)"
        . ($conversaId ? ' AND conversa_id = :c' : '') . ' ORDER BY verificado_em LIMIT 5';
    $st = $pdo->prepare($sql);
    $st->execute($conversaId ? [':c' => $conversaId] : []);
    foreach ($st->fetchAll() as $cb) {
        try {
            $sit = msgUnyPixSituacao($pdo, (int) $cb['pix_lote_id']);
        } catch (Throwable $e) {
            $sit = '';
        }
        $pdo->prepare('UPDATE chat_cobrancas SET verificado_em = NOW()' . ($sit === 'F' ? ", situacao = 'F', pago_em = NOW()" : ($sit === 'C' ? ", situacao = 'C'" : '')) . ' WHERE id = :id')
            ->execute([':id' => $cb['id']]);
        if ($sit === 'F') {
            msgSistema($pdo, (int) $cb['conversa_id'], '✅ Pix de R$ ' . number_format((float) $cb['valor'], 2, ',', '.') . ' pago' . ($cb['contrato'] ? ' (contrato ' . $cb['contrato'] . ')' : ''));
            $conv = msgConversa($pdo, (int) $cb['conversa_id']);
            if ($conv) {
                $dest = msgDestinatarios($pdo, $conv);
                $cid = (int) $cb['conversa_id'];
                msgDepois(fn() => msgAblyAvisar($dest, 'conversa', ['conversa_id' => $cid, 'motivo' => 'pix_pago']));
            }
        }
    }
}

/* ---------------------------------------------------------------------
 * Vínculo automático pelo telefone
 * ------------------------------------------------------------------- */

/** Titulares com este telefone (formatos "(77) 99945-1155" e sem o 9). $falhou = a Unymos não respondeu. */
function msgUnyPorTelefone(PDO $pdo, string $e164, bool &$falhou = false): array
{
    $d = preg_replace('/\D/', '', $e164);
    if (str_starts_with($d, '55') && strlen($d) >= 12) {
        $d = substr($d, 2);
    }
    if (strlen($d) < 10) {
        return [];
    }
    $ddd = substr($d, 0, 2);
    $num = substr($d, 2);
    $variantes = [$num];
    if (strlen($num) === 8) {
        $variantes[] = '9' . $num;
    } elseif (strlen($num) === 9 && $num[0] === '9') {
        $variantes[] = substr($num, 1);
    }
    $achados = [];
    foreach ($variantes as $n) {
        $fone = '(' . $ddd . ') ' . (strlen($n) === 9 ? substr($n, 0, 5) . '-' . substr($n, 5) : substr($n, 0, 4) . '-' . substr($n, 4));
        try {
            foreach (msgUnyBuscar($pdo, ['Fone' => $fone]) as $a) {
                $achados[$a['contrato']] = $a;
            }
        } catch (RuntimeException $e) {
            $falhou = true;
        }
    }
    return array_values($achados);
}

/** Vincula sozinho o contato aos contratos em que o telefone dele está na Unymos (de novo só depois de 1 dia, ou na hora com $forcar). */
function msgAutoVincular(PDO $pdo, int $contatoId, ?int $conversaId = null, bool $forcar = false): int
{
    $sc = $pdo->prepare('SELECT telefone_e164, uny_busca_em FROM chat_contatos_externos WHERE id = :id');
    $sc->execute([':id' => $contatoId]);
    $ct = $sc->fetch();
    if (!$ct || empty($ct['telefone_e164'])) {
        return 0;
    }
    if (!$forcar && $ct['uny_busca_em'] && strtotime((string) $ct['uny_busca_em']) > time() - 86400) {
        return 0;
    }
    $falhou = false;
    $novos = 0;
    foreach (msgUnyPorTelefone($pdo, (string) $ct['telefone_e164'], $falhou) as $a) {
        if (msgUnyGravarVinculo($pdo, $contatoId, $a, 'titular', true, null) && $conversaId) {
            $novos++;
            msgSistema($pdo, $conversaId, 'Contrato ' . $a['contrato'] . ' vinculado automaticamente pelo telefone cadastrado na Unymos');
        }
    }
    if (!$falhou) {
        $pdo->prepare('UPDATE chat_contatos_externos SET uny_busca_em = NOW() WHERE id = :id')->execute([':id' => $contatoId]);
    }
    return $novos;
}

/** Grava o vínculo (chave: número do contrato). Retorna true se for novo. */
function msgUnyGravarVinculo(PDO $pdo, int $contatoId, array $a, string $relacao, bool $podePagar, ?int $usuarioId): bool
{
    $id = (int) ltrim(preg_replace('/\D/', '', $a['contrato']), '0');
    $st = $pdo->prepare('INSERT INTO chat_contato_contratos (contato_id, id_contrato, contrato, titular_nome, titular_cpf, plano, relacao, pode_pagar, criado_por)
                         VALUES (:c, :i, :n, :t, :cpf, :p, :r, :pp, :u)
                         ON DUPLICATE KEY UPDATE relacao = IF(:manual = 1, VALUES(relacao), relacao), pode_pagar = IF(:manual2 = 1, VALUES(pode_pagar), pode_pagar),
                                                 titular_cpf = COALESCE(VALUES(titular_cpf), titular_cpf), titular_nome = COALESCE(VALUES(titular_nome), titular_nome), plano = COALESCE(VALUES(plano), plano)');
    $st->execute([
        ':c' => $contatoId, ':i' => $id, ':n' => mb_substr($a['contrato'], 0, 40), ':t' => mb_substr($a['titular'], 0, 150) ?: null,
        ':cpf' => strlen($a['cpf']) === 11 ? $a['cpf'] : null, ':p' => mb_substr($a['plano'], 0, 80) ?: null,
        ':r' => $relacao, ':pp' => $podePagar ? 1 : 0, ':u' => $usuarioId, ':manual' => $usuarioId ? 1 : 0, ':manual2' => $usuarioId ? 1 : 0,
    ]);
    return $st->rowCount() === 1;
}


/* ---------------------------------------------------------------------
 * Cópia diária dos contratos (situação, plano, etiquetas, aditivo)
 * A Unymos só entrega esses dados na consulta geral (TFU_Contrato/SearchAsync ignora o filtro de texto),
 * então o Messenger guarda uma cópia leve e a renova por partes: madrugada pelo cron e, sem cron,
 * aos poucos depois dos avisos do WhatsApp quando a cópia passa de 24 h.
 * ------------------------------------------------------------------- */
const UNY_CONTRATOS_POR_PAGINA = 100;

/** Lê até $paginas páginas a partir de onde parou. Retorna ['pagina' => próxima, 'fim' => bool, 'lidos' => n]. */
function msgUnySincronizarContratos(PDO $pdo, int $paginas = 10): array
{
    $estado = json_decode((string) msgConfigTela($pdo, 'uny_copia_estado', ''), true) ?: [];
    $pagina = max(1, (int) ($estado['proxima'] ?? 1));
    $lidos = 0;
    $fim = false;
    $grava = $pdo->prepare('INSERT INTO chat_uny_contratos (numero, id_unymos, situacao, plano, cobertura, tags, aditivo_permite, titular, atualizado_em)
                            VALUES (:n, :i, :s, :p, :c, :t, :a, :ti, NOW())
                            ON DUPLICATE KEY UPDATE id_unymos = VALUES(id_unymos), situacao = VALUES(situacao), plano = VALUES(plano), cobertura = VALUES(cobertura),
                                                    tags = VALUES(tags), aditivo_permite = VALUES(aditivo_permite), titular = VALUES(titular), atualizado_em = NOW()');
    for ($k = 0; $k < $paginas; $k++, $pagina++) {
        $url = 'https://app.unypax.com.br/api/Administracao/TFU_Contrato/SearchAsync?pageNumber=' . $pagina . '&pageSize=' . UNY_CONTRATOS_POR_PAGINA
            . implode('', array_map(fn($x) => '&situacao=' . $x, range(1, 9)));
        $r = msgUny($pdo, 'POST', $url, [], 60); // a Unymos exige corpo (objeto vazio) neste POST
        $j = $r['json'];
        $lista = is_array($j) ? (array_is_list($j) ? $j : (array) ($j['data'] ?? $j['items'] ?? [])) : [];
        if (!$r['ok']) {
            throw new RuntimeException('A Unymos recusou a consulta de contratos (HTTP ' . $r['status'] . ').');
        }
        foreach ($lista as $c) {
            if (!is_array($c)) {
                continue;
            }
            $numero = ltrim(preg_replace('/\D/', '', (string) msgUnyCampo($c, ['contrato', 'Contrato', 'contrato_numero'], '')), '0');
            if ($numero === '') {
                continue;
            }
            $tags = [];
            foreach ((array) msgUnyCampo($c, ['listTag', 'ListTag', 'listTags', 'tags'], []) as $t) {
                $nome = is_array($t) ? (string) msgUnyCampo($t, ['descricao', 'Descricao', 'nome', 'Nome', 'tag', 'Tag', 'titulo', 'texto'], '') : (string) $t;
                $cor = is_array($t) ? trim((string) msgUnyCampo($t, ['cor', 'Cor', 'color', 'corHex', 'corFundo'], '')) : '';
                if (trim($nome) !== '') {
                    $tags[] = str_replace(['|', '~'], '/', trim($nome)) . (preg_match('/^#?[0-9a-f]{6}$/i', $cor) ? '~#' . ltrim($cor, '#') : '');
                }
            }
            $ad = msgUnyCampo($c, ['aditivo_permite', 'aditivoPermite'], null);
            $grava->execute([
                ':n' => mb_substr($numero, 0, 40), ':i' => (int) msgUnyCampo($c, ['id', 'Id'], 0) ?: null,
                ':s' => mb_substr((string) msgUnyCampo($c, ['situacao', 'Situacao'], ''), 0, 40) ?: null,
                ':p' => mb_substr((string) msgUnyCampo($c, ['plano', 'Plano'], ''), 0, 120) ?: null,
                ':c' => mb_substr((string) msgUnyCampo($c, ['cobertura', 'Cobertura'], ''), 0, 120) ?: null,
                ':t' => $tags ? mb_substr(implode('|', array_unique($tags)), 0, 1000) : null,
                ':a' => $ad === null ? null : (filter_var($ad, FILTER_VALIDATE_BOOLEAN) ? 1 : 0),
                ':ti' => mb_substr((string) msgUnyCampo($c, ['nome', 'Nome'], ''), 0, 150) ?: null,
            ]);
            $lidos++;
        }
        if (count($lista) < UNY_CONTRATOS_POR_PAGINA || $pagina >= 400) {
            $fim = true;
            break;
        }
    }
    $novo = $fim
        ? ['proxima' => 1, 'concluida_em' => date('c'), 'total' => (int) $pdo->query('SELECT COUNT(*) FROM chat_uny_contratos')->fetchColumn()]
        : ['proxima' => $pagina + 1, 'concluida_em' => $estado['concluida_em'] ?? null, 'total' => $estado['total'] ?? null, 'em_andamento' => true];
    $v = json_encode($novo);
    $pdo->prepare("INSERT INTO chat_config (chave, valor) VALUES ('uny_copia_estado', :v) ON DUPLICATE KEY UPDATE valor = :v2")->execute([':v' => $v, ':v2' => $v]);
    return ['pagina' => $novo['proxima'], 'fim' => $fim, 'lidos' => $lidos, 'estado' => $novo];
}

/** Sem cron: depois dos avisos do WhatsApp, renova 3 páginas por vez quando a cópia tem mais de 24 h. */
function msgUnyCopiaAosPoucos(PDO $pdo): void
{
    $e = json_decode((string) msgConfigTela($pdo, 'uny_copia_estado', ''), true) ?: [];
    $velha = empty($e['concluida_em']) || strtotime((string) $e['concluida_em']) < time() - 86400;
    if (!$velha && empty($e['em_andamento'])) {
        return;
    }
    $trava = $pdo->query("SELECT GET_LOCK('pai_uny_copia', 0)")->fetchColumn();
    if (!$trava) {
        return;
    }
    try {
        msgUnySincronizarContratos($pdo, 3);
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('pai_uny_copia')");
    }
}

/** Dados do contrato na cópia diária. */
function msgUnyContratoCopia(PDO $pdo, string $contrato): ?array
{
    try {
        $st = $pdo->prepare('SELECT * FROM chat_uny_contratos WHERE numero = :n');
        $st->execute([':n' => ltrim(preg_replace('/\D/', '', $contrato), '0')]);
        $r = $st->fetch();
    } catch (PDOException $e) {
        return null;
    }
    if (!$r) {
        return null;
    }
    return [
        'situacao' => (string) ($r['situacao'] ?? ''), 'plano' => (string) ($r['plano'] ?? ''), 'cobertura' => (string) ($r['cobertura'] ?? ''),
        'tags' => msgUnyTags((string) ($r['tags'] ?? '')),
        'plano_curto' => msgUnyPlanoCurto((string) ($r['cobertura'] ?? ''), (string) ($r['plano'] ?? '')),
        'aditivo_permite' => $r['aditivo_permite'] === null ? null : (bool) $r['aditivo_permite'],
        'atualizado_em' => msgDataIso($r['atualizado_em']),
    ];
}


/** "TELEMEDICINA~#F0A73A|TANATOPRAXIA" → [['nome' => ..., 'cor' => '#F0A73A' | null], ...] */
function msgUnyTags(string $bruto): array
{
    $saida = [];
    foreach (array_filter(explode('|', $bruto)) as $t) {
        [$nome, $cor] = array_pad(explode('~', $t, 2), 2, null);
        $saida[] = ['nome' => $nome, 'cor' => $cor ?: null];
    }
    return $saida;
}

/** Nome curto do plano para o selo: "PLANO LIGHT" → "LIGHT" (todos os planos são familiares). */
function msgUnyPlanoCurto(string $cobertura, string $plano = ''): string
{
    $t = trim($cobertura) !== '' ? $cobertura : $plano;
    if (str_contains($t, '/')) {
        $t = trim((string) substr(strrchr($t, '/'), 1));
    }
    $t = trim(preg_replace('/^PLANO\s+/iu', '', $t));
    return mb_strtoupper(preg_replace('/\s*FAMILIAR\s*/iu', '', $t) ?: $t);
}
