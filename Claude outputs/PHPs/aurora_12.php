<?php
/**
 * aurora_12.php — sala do Memorial nos pedidos de coroa (11/11/2026)
 *
 * Biblioteca (não é endpoint): carregada pelo coroas.php em dois pontos.
 *
 * REGRA (decisão da gestão, 11/11/2026): velório no Memorial = Local de Entrega da coroa sempre com a sala
 * do atendimento ("Memorial Senhor do Bonfim – Sala 03"). Com três velórios ao mesmo tempo, a sala digitada
 * à mão já levou coroa para a sala errada. A tela de Coroas usa a mesma regra (localEntregaDoAtendimento).
 *
 *  1. a12LocalEntregaAtendimento(): pedido gerado pelo atendimento (OS). Roda a cada salvamento do atendimento
 *     (sincronizar_atendimento), então a troca de sala no atendimento chega ao pedido.
 *  2. a12VincularPedidoOnline(): pedido da loja do site. Procura o velório em andamento pelo nome do falecido
 *     informado no checkout. Um único velório encontrado: vincula o pedido (falecido_atendimento_id) e, no Memorial,
 *     troca o local pela sala (o endereço digitado no site fica nas Observações). Nenhum ou mais de um: grava o aviso
 *     "CONFIRMAR VELÓRIO" nas Observações e a equipe vincula na tela de Coroas.
 *
 * Não cria tabela nem coluna. Erros não interrompem a importação do pedido (ficam no error_log).
 */

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}

const A12_MEMORIAL = 'Memorial Senhor do Bonfim';

function a12Txt($v): string
{
    return trim((string) ($v ?? ''));
}

function a12NoMemorial(array $at): bool
{
    if (a12Txt($at['sala_velorio'] ?? '') !== '') return true;
    $local = mb_strtolower(a12Txt($at['local_cerimonia'] ?? '') . ' ' . a12Txt($at['local_velorio'] ?? ''), 'UTF-8');
    return mb_strpos($local, 'memorial') !== false;
}

/** Local de Entrega que vem do atendimento: Memorial com a sala; fora do Memorial, devolve o padrão de quem chamou. */
function a12LocalEntregaAtendimento(array $at, string $padrao): string
{
    if (!a12NoMemorial($at)) return $padrao;
    $sala = a12Txt($at['sala_velorio'] ?? '');
    return $sala !== '' ? A12_MEMORIAL . ' – ' . $sala : A12_MEMORIAL;
}

/** Palavras do nome sem acento, sem "de/da/do/das/dos". */
function a12Palavras(string $nome): array
{
    $s = mb_strtolower($nome, 'UTF-8');
    $s = strtr($s, [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n',
    ]);
    $s = preg_replace('/[^a-z0-9 ]+/', ' ', $s) ?? '';
    $saida = [];
    foreach (preg_split('/\s+/', $s) ?: [] as $p) {
        if (strlen($p) > 1 && !in_array($p, ['de', 'da', 'do', 'das', 'dos'], true)) $saida[] = $p;
    }
    return $saida;
}

function a12Nao($v): bool { return in_array(mb_strtolower(a12Txt($v), 'UTF-8'), ['não', 'nao', 'n'], true); }

function a12Fase($status): string
{
    $s = mb_strtolower(a12Txt($status), 'UTF-8');
    if (strpos($s, 'fase') === 0) {
        $d = preg_replace('/\D+/', '', $s);
        return $d !== '' ? 'fase' . str_pad($d, 2, '0', STR_PAD_LEFT) : $s;
    }
    return $s;
}

/**
 * Atendimento em andamento: mesma regra da tela de Coroas (regrasQuadro.ts: atendimentoDeveFicarNoQuadro
 * e não está só aguardando o recolhimento do material).
 */
function a12EmAndamento(array $r): bool
{
    $st = a12Fase($r['status'] ?? '');
    if ($st === '') return true;
    if ($st === 'fase11') return false;
    // A última rota do atendimento terminou = não está mais em andamento. Com assistência, o Quadro mantém
    // o atendimento até recolher o material; para a coroa ele já terminou (mesmo resultado da tela).
    $ativa = static fn($v) => a12Txt($v) === '' || !a12Nao($v);
    if ($ativa($r['realiza_sepultamento'] ?? '')) $fim = ['fase10'];
    elseif ($ativa($r['realiza_velorio'] ?? '')) $fim = ['fase08', 'fase09', 'fase10'];
    else $fim = ['fase12', 'fase07', 'fase08', 'fase09', 'fase10'];
    return !in_array($st, $fim, true);
}

/** Velórios em andamento cujo nome bate com o informado (todas as palavras do nome mais curto, no mínimo 2). */
function a12BuscarVelorios(PDO $pdo, string $falecido): array
{
    $alvo = a12Palavras($falecido);
    if (count($alvo) < 2) return [];
    $temCancelado = (bool) $pdo->query("SHOW COLUMNS FROM sepultamentos LIKE 'cancelado_em'")->fetch(PDO::FETCH_ASSOC);
    $rows = $pdo->query(
        'SELECT * FROM sepultamentos WHERE (material_recolhido = 0 OR material_recolhido IS NULL)'
        . ($temCancelado ? ' AND cancelado_em IS NULL' : '') . ' ORDER BY id DESC LIMIT 200'
    )->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $achados = [];
    foreach ($rows as $r) {
        if (!a12EmAndamento($r)) continue;
        $nome = a12Palavras(a12Txt($r['falecido'] ?? ''));
        [$curto, $longo] = count($alvo) <= count($nome) ? [$alvo, $nome] : [$nome, $alvo];
        if (count($curto) < 2) continue;
        if (!array_diff($curto, $longo)) $achados[] = $r;
    }
    return $achados;
}

/** Pedido do site recém-importado: vincula ao velório e põe a sala do Memorial, ou marca para conferência. */
function a12VincularPedidoOnline(PDO $pdo, int $pedidoId, string $falecido, string $localEntrega): void
{
    if ($pedidoId <= 0) return;
    try {
        $st = $pdo->prepare('SELECT observacoes, local_entrega, falecido_atendimento_id FROM coroas WHERE id = :id LIMIT 1');
        $st->execute([':id' => $pedidoId]);
        $pedido = $st->fetch(PDO::FETCH_ASSOC);
        if (!$pedido || (int) ($pedido['falecido_atendimento_id'] ?? 0) > 0) return;

        $obs = a12Txt($pedido['observacoes'] ?? '');
        $local = a12Txt($pedido['local_entrega'] ?? $localEntrega);
        $achados = a12BuscarVelorios($pdo, $falecido);

        if (count($achados) === 1) {
            $at = $achados[0];
            $novoLocal = $local;
            $retirada = stripos($local, 'Retirada no local') === 0;
            if (!$retirada && a12NoMemorial($at)) {
                $novoLocal = a12LocalEntregaAtendimento($at, $local);
                if ($local !== '' && $local !== $novoLocal) {
                    $nota = 'Local digitado no site: ' . $local;
                    $obs = $obs !== '' ? $obs . "\n\n" . $nota : $nota;
                }
            }
            $up = $pdo->prepare('UPDATE coroas SET falecido_atendimento_id = :at, local_entrega = :loc, observacoes = :obs,
                                 atualizado_em = NOW() WHERE id = :id LIMIT 1');
            $up->execute([
                ':at' => (int) $at['id'],
                ':loc' => mb_substr($novoLocal, 0, 255),
                ':obs' => $obs !== '' ? $obs : null,
                ':id' => $pedidoId,
            ]);
            return;
        }

        $aviso = count($achados) > 1
            ? 'CONFIRMAR VELÓRIO: o nome informado no site bate com mais de um velório em andamento. Vincule o pedido ao velório certo na tela de Coroas.'
            : 'CONFIRMAR VELÓRIO: o nome informado no site não corresponde a um velório em andamento. Vincule o pedido ao velório na tela de Coroas.';
        $obs = $obs !== '' ? $aviso . "\n\n" . $obs : $aviso;
        $up = $pdo->prepare('UPDATE coroas SET observacoes = :obs, atualizado_em = NOW() WHERE id = :id LIMIT 1');
        $up->execute([':obs' => $obs, ':id' => $pedidoId]);
    } catch (Throwable $e) {
        error_log('[aurora_12] vincular pedido online #' . $pedidoId . ': ' . $e->getMessage());
    }
}
