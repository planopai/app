<?php
/**
 * messenger_funeral.php — habilidades da Aurora no atendimento funerário (19/10/2026).
 * Carregado pelo messenger_aurora.php só quando precisa (não é endereço público).
 *
 *  ℹ️ Informações de velório: velórios em andamento/próximos (sepultamentos, sem cancelados nem encerrados),
 *     só o que é público: nome, local, sala e horários.
 *  🕊️ Atendimento funerário: opções para a família (urnas com saldo e preço, salas do Memorial, tanatopraxia) e o
 *     orçamento calculado pelo MESMO motor da OS/Orçamento (previaOSAtendimento do os_regras.php):
 *     associado → convênio do plano (coberto × família paga); particular → tudo pela tabela.
 *     O orçamento fica "aguardando aprovação"; o atendente confere e envia (nada vai para a OS nem para o estoque).
 */

/** Carrega o motor da OS (os_regras.php, na mesma pasta) uma vez. */
function msgFunMotor(): ?PDO
{
    static $pdo = false;
    if ($pdo !== false) {
        return $pdo;
    }
    $arquivo = __DIR__ . '/os_regras.php';
    if (!is_file($arquivo)) {
        error_log('[messenger] Aurora funerário: os_regras.php não encontrado');
        return $pdo = null;
    }
    try {
        require_once $arquivo;
        $pdo = conectarBanco();
    } catch (Throwable $e) {
        error_log('[messenger] Aurora funerário: motor da OS indisponível: ' . $e->getMessage());
        $pdo = null;
    }
    return $pdo;
}

/** Velórios de agora (até 2 dias atrás e próximos 3 dias), só os dados públicos. */
function msgFunVelorios(PDO $pdo): array
{
    try {
        $filtro = '';
        $cols = $pdo->query('SHOW COLUMNS FROM sepultamentos')->fetchAll(PDO::FETCH_COLUMN);
        if (in_array('cancelado_em', $cols, true)) {
            $filtro .= ' AND cancelado_em IS NULL';
        }
        $st = $pdo->query("SELECT falecido, local_velorio, sala_velorio, data_inicio_velorio, hora_inicio_velorio, data_fim_velorio, hora_fim_velorio,
                                  " . (in_array('local_sepultamento', $cols, true) ? 'local_sepultamento' : "'' AS local_sepultamento") . "
                             FROM sepultamentos
                            WHERE (material_recolhido = 0 OR material_recolhido IS NULL){$filtro}
                              AND data_inicio_velorio BETWEEN CURDATE() - INTERVAL 2 DAY AND CURDATE() + INTERVAL 3 DAY
                            ORDER BY data_inicio_velorio, hora_inicio_velorio LIMIT 15");
        $saida = [];
        foreach ($st->fetchAll() as $r) {
            if (trim((string) $r['falecido']) === '') {
                continue;
            }
            $d = fn($data, $hora) => ($data ? date('d/m', strtotime((string) $data)) : '') . ($hora ? ' às ' . substr((string) $hora, 0, 5) : '');
            $saida[] = '- ' . trim((string) $r['falecido']) . ': velório ' . trim(($r['local_velorio'] ?: 'local a confirmar') . ($r['sala_velorio'] ? ' (' . $r['sala_velorio'] . ')' : ''))
                . ', começa ' . ($d($r['data_inicio_velorio'], $r['hora_inicio_velorio']) ?: 'horário a confirmar')
                . ($r['data_fim_velorio'] || $r['hora_fim_velorio'] ? ', encerramento ' . $d($r['data_fim_velorio'], $r['hora_fim_velorio']) : '')
                . (trim((string) $r['local_sepultamento']) !== '' ? ', sepultamento: ' . trim((string) $r['local_sepultamento']) : '');
        }
        return $saida;
    } catch (Throwable $e) {
        error_log('[messenger] Aurora: velórios indisponíveis: ' . $e->getMessage());
        return [];
    }
}

/** Modelos de coroa de flores com preço (para a Aurora sugerir a homenagem a quem pergunta do velório). */
function msgFunCoroas(PDO $os): array
{
    try {
        $st = $os->query("SELECT p.id, p.nome FROM est_produto p LEFT JOIN est_categoria c ON c.id = p.categoria_id
                           WHERE p.ativo = 1 AND UPPER(p.nome) LIKE '%COROA%' AND COALESCE(p.valor, 0) >= 30 ORDER BY p.nome LIMIT 30");
        $saida = [];
        foreach ($st->fetchAll() as $c) {
            $preco = previaPreco($os, (int) $c['id']);
            if ($preco !== null && $preco > 0) {
                $saida[] = ['nome' => (string) $c['nome'], 'preco' => (float) $preco];
            }
        }
        usort($saida, fn($a, $b) => $a['preco'] <=> $b['preco']);
        return $saida;
    } catch (Throwable $e) {
        return [];
    }
}

/** Convênio do plano do associado (ex.: "LIGHT" → convênio ASSOCIADO com código LIGHT). */
function msgFunConvenioDoPlano(PDO $os, string $plano): ?array
{
    $p = mb_strtoupper(trim(preg_replace('/^PLANO\s+/iu', '', $plano)));
    if ($p === '') {
        return null;
    }
    try {
        $st = $os->prepare("SELECT id, nome, os_codigo FROM convenios WHERE UPPER(COALESCE(os_tipo,'')) = 'ASSOCIADO'
                              AND (UPPER(COALESCE(os_codigo,'')) = :p OR UPPER(nome) LIKE :l) ORDER BY (UPPER(COALESCE(os_codigo,'')) = :p2) DESC LIMIT 1");
        $st->execute([':p' => $p, ':l' => '%' . $p . '%', ':p2' => $p]);
        return $st->fetch() ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

/** Opções que a Aurora pode oferecer (urnas com saldo, salas, tanatopraxia, km do translado). */
function msgFunOpcoes(PDO $os, ?array $convenio): array
{
    $urnas = [];
    try {
        $st = $os->query("SELECT p.id, p.nome, COALESCE(SUM(s.quantidade), 0) AS saldo FROM est_produto p
                            LEFT JOIN est_categoria c ON c.id = p.categoria_id LEFT JOIN est_saldo s ON s.produto_id = p.id
                           WHERE p.ativo = 1 AND (UPPER(p.nome) LIKE '%URNA%' OR UPPER(COALESCE(c.nome,'')) LIKE '%URNA%')
                           GROUP BY p.id HAVING saldo > 0 ORDER BY p.nome LIMIT 60");
        $teto = $convenio ? (float) tetoUrnaDoPlano((string) $convenio['os_codigo'], $os) : 0.0;
        foreach ($st->fetchAll() as $u) {
            $preco = previaPreco($os, (int) $u['id']);
            if ($preco === null || $preco <= 0) {
                continue;
            }
            $urnas[] = ['id' => (int) $u['id'], 'nome' => (string) $u['nome'], 'preco' => (float) $preco, 'no_plano' => $convenio ? ($teto <= 0 || $preco <= $teto + 0.009) : null];
        }
        usort($urnas, fn($a, $b) => $a['preco'] <=> $b['preco']);
    } catch (Throwable $e) {
        error_log('[messenger] Aurora: urnas indisponíveis: ' . $e->getMessage());
    }
    $salas = [];
    $tanato = null;
    $km = null;
    try {
        foreach ((array) (mapaAtendimento()['itens_por_tipo']['SALA_VELORIO'][2] ?? []) as $rotulo => $pid) {
            if ((int) $pid > 0) {
                $salas[] = ['valor' => (string) $rotulo, 'preco' => previaPreco($os, (int) $pid)];
            }
        }
        $pidTan = produtoTanatopraxiaNormal($os);
        $tanato = ['produto_id' => $pidTan, 'preco' => previaPreco($os, $pidTan)];
        $pidKm = (int) (((array) osConfig('translado', []))['produto_id'] ?? 0);
        $km = $pidKm > 0 ? previaPreco($os, $pidKm) : null;
    } catch (Throwable $e) {
        // segue sem esses itens
    }
    return ['urnas' => $urnas, 'salas' => $salas, 'tanato' => $tanato, 'km' => $km];
}

/** Texto das opções para a Aurora (com ids das urnas para ela escolher). */
function msgFunOpcoesTexto(array $op, bool $associado): string
{
    $t = "URNAS COM ESTOQUE (use o id em funeral.urna_id; ofereça no máximo 3, da mais simples à melhor" . ($associado ? ', primeiro as do plano' : '') . "):\n";
    $lista = $op['urnas'];
    if ($associado) {
        usort($lista, fn($a, $b) => [($a['no_plano'] ? 0 : 1), $a['preco']] <=> [($b['no_plano'] ? 0 : 1), $b['preco']]);
    }
    foreach (array_slice($lista, 0, 12) as $u) {
        $t .= "- id {$u['id']}: {$u['nome']} · " . ($associado && $u['no_plano'] ? 'coberta pelo plano' : 'R$ ' . number_format($u['preco'], 2, ',', '.')) . "\n";
    }
    if ($op['salas']) {
        $t .= "SALAS DE VELÓRIO DO MEMORIAL (funeral.sala = nome exato; ou vazio se for outro local):\n";
        foreach ($op['salas'] as $s) {
            $t .= "- {$s['valor']}" . ($s['preco'] !== null && !$associado ? ' · R$ ' . number_format((float) $s['preco'], 2, ',', '.') : '') . "\n";
        }
    }
    if ($op['tanato']) {
        $t .= 'TANATOPRAXIA (preparação do corpo para velório mais longo)' . (!$associado && $op['tanato']['preco'] ? ': R$ ' . number_format((float) $op['tanato']['preco'], 2, ',', '.') : '') . "\n";
    }
    if ($op['km']) {
        $t .= 'TRANSLADO para outra cidade: cobrado por km' . (!$associado ? ' (R$ ' . number_format((float) $op['km'], 2, ',', '.') . '/km)' : '') . "\n";
    }
    return $t;
}

/**
 * Calcula o orçamento pelas escolhas (mesmo motor do Orçamento/OS). Retorna linhas e totais.
 * $f: urna_id, tanatopraxia (sim/nao), sala, translado_km, translado_destino, roupa_propria (sim/nao), coroa (sim/nao).
 */
function msgFunCalcular(PDO $os, array $f, ?array $convenio, array $op): array
{
    $sim = fn($v) => in_array(mb_strtolower(trim((string) $v)), ['sim', 's', 'true', '1'], true);
    $km = max(0.0, (float) ($f['translado_km'] ?? 0));
    $r = [
        'convenio_id' => $convenio ? (int) $convenio['id'] : 0, 'pacote_id' => 0,
        'urna_produto_id' => (int) ($f['urna_id'] ?? 0),
        'roupa_propria' => $sim($f['roupa_propria'] ?? 'sim') ? 1 : 0, 'roupa_produto_id' => 0,
        'veu' => 'Não', 'cordao' => 'Não', 'invol' => 'Não', 'coroas' => [],
        'ornamentacao' => 'Não', 'ornamentacao_tipo' => '',
        'tanato' => $sim($f['tanatopraxia'] ?? '') ? 'Sim' : 'Não', 'tanato_produto_id' => $sim($f['tanatopraxia'] ?? '') ? (int) ($op['tanato']['produto_id'] ?? 0) : 0,
        'reconstituicao_facial' => 'Não',
        'translado' => $km > 0 ? 'Sim' : 'Não', 'translado_km' => $km, 'translado_origem' => 'Barreiras', 'translado_destino' => (string) ($f['translado_destino'] ?? ''),
        'velorio_memorial' => trim((string) ($f['sala'] ?? '')) !== '' ? 'Sim' : 'Não',
        'realiza_velorio' => 'Sim', 'sala_velorio' => trim((string) ($f['sala'] ?? '')),
    ];
    $p = previaOSAtendimento($os, $r, false);
    $linhas = [];
    $familia = 0.0;
    $coberto = 0.0;
    $pendentes = 0;
    foreach ((array) ($p['linhas'] ?? []) as $l) {
        $dest = (string) ($l['destino'] ?? '');
        if ($dest === 'SEM_COBRANCA') {
            continue;
        }
        $valor = $l['valor'] === null ? null : round((float) $l['valor'], 2);
        $cob = $dest !== 'FAMILIA';
        if (!$cob) {
            $valor === null ? $pendentes++ : $familia += $valor;
        } elseif ($valor !== null) {
            $coberto += $valor;
        }
        $linhas[] = ['rotulo' => (string) $l['rotulo'], 'nome' => (string) $l['nome'], 'coberto' => $cob, 'valor' => $valor, 'obs' => (string) ($l['motivo'] ?? ''), 'oculto' => !empty($l['valor_oculto'])];
    }
    if ($sim($f['coroa'] ?? '')) {
        $linhas[] = ['rotulo' => 'Coroa de flores', 'nome' => 'modelo a escolher com o atendente', 'coberto' => false, 'valor' => null, 'obs' => '', 'oculto' => false];
        $pendentes++;
    }
    return [
        'rascunho' => $r, 'linhas' => $linhas, 'familia' => round($familia, 2), 'coberto' => round($coberto, 2), 'pendentes' => $pendentes,
        'convenio' => $convenio ? (string) $convenio['nome'] : 'Particular', 'avisos' => array_values((array) ($p['avisos'] ?? [])),
    ];
}

/** Guarda (ou atualiza) o orçamento da Aurora deste atendimento, aguardando a aprovação de um atendente. */
function msgFunSalvarOrcamento(PDO $pdo, array $c, array $escolhas, array $calc, string $falecido): int
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_orcamentos_ia (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  conversa_id BIGINT UNSIGNED NOT NULL,
                  atendimento_id BIGINT UNSIGNED NULL,
                  falecido VARCHAR(150) NULL,
                  escolhas_json TEXT NOT NULL,
                  resultado_json MEDIUMTEXT NOT NULL,
                  status VARCHAR(12) NOT NULL DEFAULT 'aguardando',
                  aprovado_por INT NULL,
                  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  atualizado_em DATETIME NULL,
                  KEY ix_chat_orc_ia (conversa_id, status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $st = $pdo->prepare("SELECT id FROM chat_orcamentos_ia WHERE conversa_id = :c AND (atendimento_id <=> :a) AND status = 'aguardando' ORDER BY id DESC LIMIT 1");
    $st->execute([':c' => $c['id'], ':a' => $c['atendimento_atual_id']]);
    $id = (int) $st->fetchColumn();
    $par = [':e' => json_encode($escolhas, JSON_UNESCAPED_UNICODE), ':r' => json_encode($calc, JSON_UNESCAPED_UNICODE), ':f' => mb_substr($falecido, 0, 150) ?: null];
    if ($id) {
        $pdo->prepare('UPDATE chat_orcamentos_ia SET escolhas_json = :e, resultado_json = :r, falecido = COALESCE(:f, falecido), atualizado_em = NOW() WHERE id = :id')->execute($par + [':id' => $id]);
        return $id;
    }
    $pdo->prepare('INSERT INTO chat_orcamentos_ia (conversa_id, atendimento_id, falecido, escolhas_json, resultado_json) VALUES (:c, :a, :f, :e, :r)')
        ->execute($par + [':c' => $c['id'], ':a' => $c['atendimento_atual_id']]);
    return (int) $pdo->lastInsertId();
}

/** Texto do orçamento para a família (o atendente revisa no campo de mensagem antes de enviar). */
function msgFunTextoFamilia(array $calc, string $falecido): string
{
    $brl = fn($v) => 'R$ ' . number_format((float) $v, 2, ',', '.');
    $t = "*Orçamento do atendimento" . ($falecido !== '' ? " de {$falecido}" : '') . "*\n";
    $cob = array_filter($calc['linhas'], fn($l) => $l['coberto']);
    $fam = array_filter($calc['linhas'], fn($l) => !$l['coberto']);
    if ($cob) {
        $t .= "\n✅ *Coberto pelo plano:*\n" . implode("\n", array_map(fn($l) => '• ' . $l['rotulo'] . ($l['nome'] !== '' ? ' — ' . $l['nome'] : ''), $cob)) . "\n";
    }
    if ($fam) {
        $t .= "\n" . ($cob ? '💳 *Por conta da família:*' : '💳 *Itens:*') . "\n" . implode("\n", array_map(fn($l) => '• ' . $l['rotulo'] . ($l['nome'] !== '' ? ' — ' . $l['nome'] : '') . ': ' . ($l['valor'] === null ? 'a confirmar' : $brl($l['valor'])), $fam)) . "\n";
    }
    $t .= "\n*Total para a família: " . $brl($calc['familia']) . '*' . ($calc['pendentes'] ? ' (+ itens a confirmar)' : '');
    $t .= "\n\nValores válidos por 7 dias. Qualquer dúvida, estamos aqui.";
    return $t;
}


/* ---------------------------------------------------------------------
 * Venda de coroa pela Aurora (19/10/2026): mesmo cadastro do coroas.php (coroas + coroas_itens, origem venda_direta)
 * e a OS Cor aberta pelo motor da OS (garantirOSDaCoroa). O pedido entra na fila de confecção e no Quadro.
 * ------------------------------------------------------------------- */

/** Modelos de coroa vendáveis: naturais ativas e artificiais com saldo no MEMORIAL ou na FUNERARIA. */
function msgFunCoroasModelos(PDO $os): array
{
    try {
        $st = $os->query("SELECT p.id, p.nome, p.valor, LOWER(c.nome) AS categoria,
                                 (SELECT COALESCE(SUM(s.quantidade), 0) FROM est_saldo s INNER JOIN est_deposito d ON d.id = s.deposito_id
                                   WHERE s.produto_id = p.id AND UPPER(TRIM(d.nome)) IN ('MEMORIAL', 'FUNERARIA')) AS saldo
                            FROM est_produto p INNER JOIN est_categoria c ON c.id = p.categoria_id
                           WHERE p.ativo = 1 AND LOWER(c.nome) IN ('coroas naturais', 'coroas artificiais') AND COALESCE(p.valor, 0) >= 30
                             AND UPPER(p.nome) LIKE '%COROA%'
                           ORDER BY p.valor, p.nome");
        $saida = [];
        foreach ($st->fetchAll() as $p) {
            $tipo = str_contains((string) $p['categoria'], 'natura') ? 'natural' : 'artificial';
            if ($tipo === 'artificial' && (float) $p['saldo'] <= 0) {
                continue;
            }
            $saida[] = ['id' => (int) $p['id'], 'nome' => trim((string) $p['nome']), 'valor' => (float) $p['valor'], 'tipo' => $tipo];
        }
        return $saida;
    } catch (Throwable $e) {
        error_log('[messenger] Aurora: modelos de coroa: ' . $e->getMessage());
        return [];
    }
}

/** Velórios de agora com id (para a entrega da coroa). */
function msgFunVeloriosLista(PDO $os): array
{
    try {
        $cols = $os->query('SHOW COLUMNS FROM sepultamentos')->fetchAll(PDO::FETCH_COLUMN);
        $filtro = in_array('cancelado_em', $cols, true) ? ' AND cancelado_em IS NULL' : '';
        $st = $os->query("SELECT id, falecido, local_velorio, sala_velorio FROM sepultamentos
                           WHERE (material_recolhido = 0 OR material_recolhido IS NULL){$filtro}
                             AND data_inicio_velorio BETWEEN CURDATE() - INTERVAL 1 DAY AND CURDATE() + INTERVAL 3 DAY
                           ORDER BY data_inicio_velorio, hora_inicio_velorio LIMIT 15");
        return array_values(array_filter(array_map(fn($r) => ['id' => (int) $r['id'], 'falecido' => trim((string) $r['falecido']),
            'local' => trim(($r['local_velorio'] ?: 'local a confirmar') . ($r['sala_velorio'] ? ' (' . $r['sala_velorio'] . ')' : ''))], $st->fetchAll()), fn($v) => $v['falecido'] !== ''));
    } catch (Throwable $e) {
        return [];
    }
}

/** Cria o pedido de coroa (fila de confecção) e a OS Cor aberta. Retorna ['id' => pedido, 'os' => número ou null]. */
function msgFunCriarPedidoCoroa(PDO $os, array $p): array
{
    if (msgEmTeste()) {
        return ['id' => 0, 'os' => null]; // simulador: o pedido não vai para a fila de coroas
    }
    $m = $p['modelo'];
    $deposito = null;
    if ($m['tipo'] === 'artificial') {
        $sd = $os->prepare("SELECT UPPER(TRIM(d.nome)) FROM est_saldo s INNER JOIN est_deposito d ON d.id = s.deposito_id
                             WHERE s.produto_id = :p AND UPPER(TRIM(d.nome)) IN ('MEMORIAL', 'FUNERARIA') AND s.quantidade > 0
                             ORDER BY FIELD(UPPER(TRIM(d.nome)), 'MEMORIAL', 'FUNERARIA') LIMIT 1");
        $sd->execute([':p' => $m['id']]);
        $deposito = $sd->fetchColumn() ?: null;
        if (!$deposito) {
            throw new RuntimeException('A coroa artificial escolhida ficou sem saldo.');
        }
    }
    $vel = $p['velorio'] ?? null;
    $os->beginTransaction();
    try {
        $os->prepare("INSERT INTO coroas (solicitante, telefone, local_entrega, observacoes, quantidade_coroas, modelo_coroa, frase, falecido,
                                          falecido_atendimento_id, status_pagamento, origem, status, criado_por, criado_em, atualizado_em)
                      VALUES (:s, :t, :l, :o, 1, :m, :f, :fal, :fa, 'aguardando_pagamento', 'venda_direta', 'novo', :u, NOW(), NOW())")
            ->execute([
                ':s' => mb_substr((string) $p['solicitante'], 0, 150), ':t' => mb_substr((string) $p['telefone'], 0, 30),
                ':l' => mb_substr($vel ? $vel['local'] : (string) $p['local'], 0, 200), ':o' => 'Pedido feito pela Aurora no WhatsApp',
                ':m' => $m['nome'], ':f' => mb_substr((string) $p['frase'], 0, 255), ':fal' => mb_substr($vel ? $vel['falecido'] : '', 0, 150),
                ':fa' => $vel ? (int) $vel['id'] : 0, ':u' => (int) (msgConfig('aurora_usuario_id', 0)) ?: null,
            ]);
        $id = (int) $os->lastInsertId();
        $os->prepare('INSERT INTO coroas_itens (coroa_id, ordem, tipo_coroa, produto_id, deposito_nome, modelo_coroa, frase, valor, foto_produto_url, criado_em, atualizado_em)
                      VALUES (:c, 1, :t, :p, :d, :m, :f, :v, NULL, NOW(), NOW())')
            ->execute([':c' => $id, ':t' => $m['tipo'], ':p' => $m['id'], ':d' => $deposito, ':m' => $m['nome'], ':f' => mb_substr((string) $p['frase'], 0, 255), ':v' => $m['valor']]);
        $os->commit();
    } catch (Throwable $e) {
        if ($os->inTransaction()) {
            $os->rollBack();
        }
        throw $e;
    }
    $numero = null;
    try {
        $osCor = garantirOSDaCoroa($os, $id, null);
        $numero = (string) ($osCor['numero_formatado'] ?? $osCor['numero'] ?? $osCor['id'] ?? '');
    } catch (Throwable $e) {
        error_log('[messenger] Aurora: OS da coroa ' . $id . ': ' . $e->getMessage()); // o pedido fica na fila; a OS sai na próxima sincronização
    }
    return ['id' => $id, 'os' => $numero ?: null];
}
