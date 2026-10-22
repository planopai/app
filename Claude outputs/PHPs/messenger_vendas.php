<?php
/**
 * messenger_vendas.php — Aurora consultora de vendas e propostas de adesão (19/10/2026).
 * Carregado pelo messenger_nucleo.php (não é endereço público). A ficha pública fica em adesao.php.
 *
 * Valores: Manual de Procedimentos 4.2 — em vigor desde 08/10/2026 (substituem o reajuste de 5% que estava previsto
 * para 01/01/2027). Dependente extra = 20% da mensalidade. Quem calcula é o servidor — a Aurora só apresenta.
 *  LIGHT  adesão 50  · R$ 46 (+ R$ 9,20 por extra, até 2 extras) · casal, filhos solteiros, pais ou sogros · até 200 km
 *  FLEX   adesão 50  · pela idade da pessoa mais velha: 48 (≤54) · 57 (55–64) · 69 (65–74) · 82 (75+) · titular + até 9 · urna pet · 500 km
 *         aditivos: Tanatopraxia (+20%) · Translado Nacional "De Volta pra Casa" (R$ 30)
 *  PLUS   adesão 100 · R$ 110 (+ R$ 22,00 por extra a partir do 3º) · 1.000 km · tanatopraxia incluída · aditivo Translado Nacional (R$ 30)
 *  MAX    adesão 100 · R$ 150 (+ R$ 30 por extra a partir do 3º) · translado Brasil todo · tanatopraxia e telemedicina incluídas
 * "Extras" seguem o texto da tabela: LIGHT conta extras além do grupo familiar básico (titular + cônjuge + filhos/pais/sogros
 * é o grupo; a equipe confirma os extras na ficha); PLUS e MAX: até 2 extras sem custo, cobrança a partir do 3º.
 */

const VENDA_PLANOS = ['LIGHT', 'FLEX', 'PLUS', 'MAX'];

function msgVendaReajuste(string $plano, ?string $data = null): float
{
    return 1.0; // valores de 08/10/2026 já em vigor; próximo reajuste anual pelo IPCA (atualizar a tabela aqui)
}

/**
 * Valores do plano para a família. $extras = pessoas além do grupo básico do plano (o que a tabela chama de "extra").
 * Retorna adesão, mensalidade (com extras e aditivos) e a composição, ou null se o plano não aceitar a combinação.
 */
function msgVendaCalcular(string $plano, int $idadeMaisVelho, int $pessoas, int $extras, bool $tanato, bool $translado, ?string $data = null): ?array
{
    $plano = mb_strtoupper(trim($plano));
    if (!in_array($plano, VENDA_PLANOS, true)) {
        return null;
    }
    $f = msgVendaReajuste($plano, $data);
    $linhas = [];
    $avisos = [];
    switch ($plano) {
        case 'LIGHT':
            $adesao = 50.0;
            $base = 46.0;
            $porExtra = 9.20;
            if ($extras > 2) {
                return null; // LIGHT aceita até 2 extras
            }
            $valorExtras = $extras * $porExtra;
            if ($tanato || $translado) {
                $avisos[] = 'O LIGHT não tem aditivos de tanatopraxia nem de translado nacional.';
            }
            $tanato = $translado = false;
            break;
        case 'FLEX':
            $adesao = 50.0;
            $base = $idadeMaisVelho >= 75 ? 82.0 : ($idadeMaisVelho >= 65 ? 69.0 : ($idadeMaisVelho >= 55 ? 57.0 : 48.0));
            if ($pessoas > 10) {
                return null; // titular + até 9
            }
            $valorExtras = 0.0;
            break;
        case 'PLUS':
            $adesao = 100.0;
            $base = 110.0;
            $valorExtras = max(0, $extras - 2) * 22.00;
            if ($tanato) {
                $avisos[] = 'No PLUS a tanatopraxia simples já está incluída.';
            }
            $tanato = false;
            break;
        default: // MAX
            $adesao = 100.0;
            $base = 150.0;
            $valorExtras = max(0, $extras - 2) * 30.0;
            $tanato = $translado = false; // já incluídos
            break;
    }
    $mens = round($base * $f, 2);
    $linhas[] = ['item' => 'Mensalidade ' . $plano . ($plano === 'FLEX' ? ' (pela idade da pessoa mais velha)' : ''), 'valor' => $mens];
    if ($valorExtras > 0) {
        $linhas[] = ['item' => 'Dependentes extras', 'valor' => round($valorExtras * $f, 2)];
    }
    $total = $mens + round($valorExtras * $f, 2);
    if ($tanato && $plano === 'FLEX') {
        $v = round($total * 0.20, 2);
        $linhas[] = ['item' => 'Aditivo de Tanatopraxia (+20%)', 'valor' => $v];
        $total += $v;
    }
    if ($translado && in_array($plano, ['FLEX', 'PLUS'], true)) {
        $linhas[] = ['item' => 'Aditivo de Translado Nacional "De Volta pra Casa"', 'valor' => 30.0];
        $total += 30.0;
    }
    return ['plano' => $plano, 'adesao' => $adesao, 'mensalidade' => round($total, 2), 'composicao' => $linhas, 'avisos' => $avisos];
}

/** Valores dos 4 planos para a família (para a Aurora comparar com números certos). */
function msgVendaComparar(array $v): string
{
    $idade = max(0, (int) ($v['idade_mais_velho'] ?? 0));
    $pessoas = max(1, (int) ($v['pessoas'] ?? 1));
    $extras = max(0, (int) ($v['extras'] ?? 0));
    if ($idade <= 0) {
        return '';
    }
    $brl = fn($x) => 'R$ ' . number_format((float) $x, 2, ',', '.');
    $t = "VALORES CALCULADOS PARA ESTA FAMÍLIA (use exatamente estes; {$pessoas} pessoa(s), mais velha com {$idade} anos, {$extras} extra(s)):\n";
    foreach (VENDA_PLANOS as $p) {
        $c = msgVendaCalcular($p, $idade, $pessoas, $extras, !empty($v['aditivo_tanato']), !empty($v['aditivo_translado']));
        if (!$c) {
            $t .= "- {$p}: não atende esta composição de família\n";
            continue;
        }
        $t .= "- {$p}: adesão {$brl($c['adesao'])} · mensalidade {$brl($c['mensalidade'])}" . ($c['avisos'] ? ' (' . implode(' ', $c['avisos']) . ')' : '') . "\n";
    }
    return $t;
}

function msgVendaGarantirTabela(PDO $pdo): void
{
    static $feito = false;
    if ($feito) {
        return;
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS chat_propostas (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  token CHAR(32) NOT NULL,
                  conversa_id BIGINT UNSIGNED NULL,
                  contato_id BIGINT UNSIGNED NULL,
                  telefone VARCHAR(20) NULL,
                  nome VARCHAR(150) NULL,
                  plano VARCHAR(10) NOT NULL,
                  resumo_json TEXT NOT NULL,
                  ficha_json MEDIUMTEXT NULL,
                  origem VARCHAR(200) NULL,
                  status VARCHAR(20) NOT NULL DEFAULT 'aguardando_ficha',
                  contrato VARCHAR(40) NULL,
                  tentativas TINYINT NOT NULL DEFAULT 0,
                  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  expira_em DATETIME NOT NULL,
                  ficha_em DATETIME NULL,
                  decidido_em DATETIME NULL,
                  decidido_por INT NULL,
                  UNIQUE KEY uq_chat_proposta_token (token),
                  KEY ix_chat_proposta_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $feito = true;
}

/** Cria (ou atualiza, se ainda sem ficha) a proposta da conversa e devolve o link da ficha de adesão. */
function msgVendaProposta(PDO $pdo, array $c, array $venda, ?array $calc, string $origem = ''): array
{
    if (msgEmTeste()) {
        return ['id' => 0, 'token' => 'teste', 'link' => 'https://api.planoassistencialintegrado.com.br/adesao.php?t=teste']; // simulador
    }
    msgVendaGarantirTabela($pdo);
    $sc = $pdo->prepare('SELECT nome, nome_salvo, telefone_e164 FROM chat_contatos_externos WHERE id = :id');
    $sc->execute([':id' => $c['contato_externo_id']]);
    $ct = $sc->fetch() ?: [];
    $resumo = json_encode(['venda' => $venda, 'calculo' => $calc], JSON_UNESCAPED_UNICODE);
    $st = $pdo->prepare("SELECT id, token FROM chat_propostas WHERE conversa_id = :c AND status = 'aguardando_ficha' AND expira_em > NOW() ORDER BY id DESC LIMIT 1");
    $st->execute([':c' => $c['id']]);
    $ja = $st->fetch();
    if ($ja) {
        $pdo->prepare('UPDATE chat_propostas SET plano = :p, resumo_json = :r WHERE id = :id')->execute([':p' => $venda['plano'], ':r' => $resumo, ':id' => $ja['id']]);
        $token = $ja['token'];
        $id = (int) $ja['id'];
    } else {
        $token = bin2hex(random_bytes(16));
        $pdo->prepare('INSERT INTO chat_propostas (token, conversa_id, contato_id, telefone, nome, plano, resumo_json, origem, expira_em)
                       VALUES (:t, :c, :ct, :tel, :n, :p, :r, :o, NOW() + INTERVAL 7 DAY)')
            ->execute([':t' => $token, ':c' => $c['id'], ':ct' => $c['contato_externo_id'], ':tel' => $ct['telefone_e164'] ?? null,
                ':n' => mb_substr((string) (($ct['nome_salvo'] ?? '') ?: ($ct['nome'] ?? '')), 0, 150) ?: null, ':p' => $venda['plano'], ':r' => $resumo, ':o' => mb_substr($origem, 0, 200) ?: null]);
        $id = (int) $pdo->lastInsertId();
    }
    $base = rtrim((string) msgConfig('adesao_url', 'https://api.planoassistencialintegrado.com.br/adesao.php'), '?&');
    return ['id' => $id, 'token' => $token, 'link' => $base . (str_contains($base, '?') ? '&' : '?') . 't=' . $token];
}

/** Mascara CPF/RG da ficha depois do cadastro na Unymos (os dados já estão lá). */
function msgVendaMascarar(array $ficha): array
{
    $m = function ($v) {
        $d = preg_replace('/\D/', '', (string) $v);
        return $d === '' ? '' : str_repeat('*', max(0, strlen($d) - 3)) . substr($d, -3);
    };
    foreach (['cpf', 'rg'] as $k) {
        if (isset($ficha['titular'][$k])) {
            $ficha['titular'][$k] = $m($ficha['titular'][$k]);
        }
    }
    foreach ((array) ($ficha['beneficiarios'] ?? []) as $i => $b) {
        if (isset($b['cpf'])) {
            $ficha['beneficiarios'][$i]['cpf'] = $m($b['cpf']);
        }
    }
    return $ficha;
}

/**
 * Notificação de plano novo (19/10/2026): avisa quem cadastra associados (página "associados") e os atendentes do setor
 * da conversa (Vendas). O toque abre a tela Propostas de adesão.
 */
function msgVendaNotificar(PDO $pdo, ?int $conversaId, string $titulo, string $corpo, string $pagina = 'associados', string $rota = '/messenger-propostas'): void
{
    if (msgEmTeste()) {
        return;
    }
    try {
        $ids = msgUsuariosComAcesso($pdo, $pagina);
        if ($conversaId) {
            $st = $pdo->prepare('SELECT m.usuario_id FROM chat_setor_membros m INNER JOIN chat_conversas c ON c.setor_id = m.setor_id WHERE c.id = :c');
            $st->execute([':c' => $conversaId]);
            $ids = array_merge($ids, array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN)));
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        if (!$ids) {
            return;
        }
        $dados = ['titulo' => $titulo, 'corpo' => $corpo, 'rota' => $rota, 'tag' => 'proposta-' . (int) $conversaId . '-' . md5($titulo)];
        msgDepois(fn() => msgPushEnviar($pdo, $ids, $dados));
        msgDepois(fn() => msgAblyAvisar($ids, 'proposta', ['titulo' => $titulo, 'corpo' => $corpo, 'conversa_id' => $conversaId]));
    } catch (Throwable $e) {
        error_log('[messenger] aviso de plano novo: ' . $e->getMessage());
    }
}
