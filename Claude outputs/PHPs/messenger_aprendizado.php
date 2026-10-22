<?php
/**
 * messenger_aprendizado.php — aprendizado contínuo da Aurora (22/10/2026). Carregado pelo messenger_nucleo.php.
 * As tabelas (chat_ia_licoes, chat_ia_exemplos, chat_ia_feedback, chat_ia_cenarios) são criadas à mão pelo SQL
 * aprovado pela Gestão — este arquivo NÃO cria nem altera tabelas. Sem elas, tudo aqui só fica inativo.
 *
 * Ciclo: o Claude analisa (toda noite pelo cron, ou no botão "Analisar agora") o que aconteceu desde a última análise —
 * testes reprovados, atendimentos em que uma pessoa assumiu depois da Aurora, notas baixas, 👎 dos atendentes,
 * perguntas sem resposta na Base e bons atendimentos — e PROPÕE: lições, exemplos, rascunhos de documento e cenários.
 * Nada entra na Aurora sem a Gestão aprovar na tela Aprendizado da Aurora. As regras principais (respeito, documentos,
 * valores do sistema, falecimento sempre para uma pessoa) ficam no código e prevalecem sobre qualquer lição.
 */

const APR_HABILIDADES = ['geral', 'falecimento', 'velorio', 'coroa', 'vendas', 'cobranca', 'duvidas', 'reclamacao'];

function msgAprPronto(PDO $pdo): bool
{
    static $ok = null;
    if ($ok === null) {
        try {
            $pdo->query('SELECT 1 FROM chat_ia_licoes LIMIT 1');
            $pdo->query('SELECT 1 FROM chat_ia_exemplos LIMIT 1');
            $ok = true;
        } catch (PDOException $e) {
            $ok = false;
        }
    }
    return $ok;
}

/** O que a Aurora recebe: lições aprovadas (por habilidade) e até 2 exemplos parecidos com a mensagem do cliente. */
function msgAprTextoParaAurora(PDO $pdo, string $texto): string
{
    if (!msgAprPronto($pdo)) {
        return '';
    }
    $saida = '';
    try {
        $st = $pdo->query("SELECT habilidade, texto FROM chat_ia_licoes WHERE tipo = 'licao' AND status = 'aprovada' ORDER BY habilidade, id LIMIT 40");
        $por = [];
        foreach ($st->fetchAll() as $l) {
            $por[$l['habilidade']][] = '- ' . trim(preg_replace('/\s+/u', ' ', (string) $l['texto']));
        }
        if ($por) {
            $saida .= "LIÇÕES APROVADAS PELA GESTÃO (aplique quando o assunto for o da habilidade; as REGRAS acima sempre prevalecem):\n";
            foreach ($por as $hab => $linhas) {
                $saida .= strtoupper($hab) . ":\n" . implode("\n", $linhas) . "\n";
            }
        }
        // exemplos: os 2 com mais palavras em comum com a mensagem do cliente
        $palavras = array_values(array_unique(array_filter(preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($texto)) ?: [], fn($w) => mb_strlen($w) >= 4)));
        if ($palavras) {
            $ex = $pdo->query("SELECT titulo, resumo, dialogo, intencao FROM chat_ia_exemplos WHERE status = 'aprovado' ORDER BY id DESC LIMIT 80")->fetchAll();
            usort($ex, function ($a, $b) use ($palavras) {
                $n = fn($e) => count(array_filter($palavras, fn($w) => str_contains(mb_strtolower($e['titulo'] . ' ' . $e['resumo']), $w)));
                return $n($b) <=> $n($a);
            });
            $ex = array_filter(array_slice($ex, 0, 2), fn($e) => count(array_filter($palavras, fn($w) => str_contains(mb_strtolower($e['titulo'] . ' ' . $e['resumo']), $w))) > 0);
            if ($ex) {
                $saida .= "\nEXEMPLOS DE BONS ATENDIMENTOS DO PAI (inspire-se no tom e na condução; não copie dados):\n";
                foreach ($ex as $e) {
                    $saida .= "### {$e['titulo']}\n" . mb_substr((string) $e['dialogo'], 0, 1500) . "\n";
                }
            }
        }
    } catch (PDOException $e) {
        return '';
    }
    return $saida;
}

/** 👍/👎 do atendente numa mensagem da Aurora. */
function msgAprFeedback(PDO $pdo, int $uid, int $mensagemId, bool $util, string $motivo): void
{
    $st = $pdo->prepare("SELECT id, conversa_id FROM chat_mensagens WHERE id = :id AND autor_tipo = 'sistema' AND tipo = 'texto'");
    $st->execute([':id' => $mensagemId]);
    $m = $st->fetch();
    if (!$m) {
        throw new RuntimeException('Só dá para avaliar mensagens da Aurora.');
    }
    $pdo->prepare('INSERT INTO chat_ia_feedback (mensagem_id, conversa_id, usuario_id, util, motivo) VALUES (:m, :c, :u, :t, :mo)
                   ON DUPLICATE KEY UPDATE util = VALUES(util), motivo = VALUES(motivo), analisado = 0, criado_em = NOW()')
        ->execute([':m' => $mensagemId, ':c' => $m['conversa_id'], ':u' => $uid, ':t' => $util ? 1 : 0, ':mo' => mb_substr(trim($motivo), 0, 300) ?: null]);
}

/** Conversa de um atendimento em texto, com os números longos escondidos (CPF, telefone, contrato). */
function msgAprTranscricao(PDO $pdo, int $atendimentoId, int $limite = 40): string
{
    $st = $pdo->prepare("SELECT autor_tipo, tipo, texto, transcricao, interna FROM chat_mensagens WHERE atendimento_id = :a AND apagada_em IS NULL ORDER BY id LIMIT {$limite}");
    $st->execute([':a' => $atendimentoId]);
    $saida = '';
    foreach ($st->fetchAll() as $m) {
        $quem = $m['autor_tipo'] === 'contato' ? 'CLIENTE' : ($m['autor_tipo'] === 'usuario' ? 'ATENDENTE' : (!empty($m['interna']) ? 'NOTA' : ($m['tipo'] === 'sistema' ? 'SISTEMA' : 'AURORA')));
        $t = trim((string) ($m['transcricao'] ?: $m['texto']));
        if ($t === '') {
            continue;
        }
        $saida .= $quem . ': ' . preg_replace('/\d[\d.\-\/ ]{6,}\d/u', '[número]', mb_substr($t, 0, 600)) . "\n";
    }
    return $saida;
}

/**
 * Análise: junta o que aconteceu desde a última análise e pede ao Claude as propostas. Retorna o resumo do que entrou.
 * Roda pelo cron (messenger_cron.php) e pelo botão "Analisar agora".
 */
function msgAprAnalisar(PDO $pdo): array
{
    if (!msgAprPronto($pdo)) {
        throw new RuntimeException('As tabelas do aprendizado ainda não foram criadas (rode o SQL aprovado).');
    }
    $desde = (string) msgConfigTela($pdo, 'apr_ultima_analise', date('Y-m-d H:i:s', strtotime('-7 days')));
    $agora = (string) $pdo->query('SELECT NOW()')->fetchColumn();
    $partes = [];
    $consulta = function (string $sql, array $par = []) use ($pdo) {
        try {
            $st = $pdo->prepare($sql);
            $st->execute($par);
            return $st->fetchAll();
        } catch (PDOException $e) {
            return [];
        }
    };
    // 1) testes reprovados
    $testes = $consulta('SELECT titulo, avaliacao_json FROM chat_ia_testes WHERE criado_em > :d AND aprovado = 0 ORDER BY id DESC LIMIT 12', [':d' => $desde]);
    if ($testes) {
        $partes[] = "TESTES REPROVADOS (avaliação do Claude):\n" . implode("\n", array_map(function ($t) {
            $a = json_decode((string) $t['avaliacao_json'], true) ?: [];
            return '- ' . $t['titulo'] . ': ' . ($a['resumo'] ?? '') . ' | falhas: ' . implode(' ; ', array_map(fn($f) => ($f['regra'] ?? '') . ' → ' . ($f['sugestao'] ?? ''), (array) ($a['falhas'] ?? [])));
        }, $testes));
    }
    // 2) 👎 dos atendentes
    $fb = $consulta("SELECT f.id, f.motivo, m.texto, (SELECT texto FROM chat_mensagens x WHERE x.conversa_id = m.conversa_id AND x.id < m.id AND x.autor_tipo = 'contato' ORDER BY x.id DESC LIMIT 1) AS antes
                       FROM chat_ia_feedback f INNER JOIN chat_mensagens m ON m.id = f.mensagem_id WHERE f.analisado = 0 AND f.util = 0 ORDER BY f.id DESC LIMIT 20");
    if ($fb) {
        $partes[] = "MENSAGENS DA AURORA MARCADAS COMO RUINS PELOS ATENDENTES:\n" . implode("\n", array_map(fn($f) => '- Cliente: "' . mb_substr((string) $f['antes'], 0, 200) . '" | Aurora: "' . mb_substr((string) $f['texto'], 0, 300) . '" | motivo do atendente: ' . ($f['motivo'] ?: '(sem motivo)'), $fb));
    }
    // 3) atendimentos reais em que a Aurora falou e uma pessoa assumiu; notas baixas; e os melhores (nota 5)
    $ats = $consulta("SELECT a.id, a.avaliacao_nota FROM chat_atendimentos a INNER JOIN chat_conversas c ON c.id = a.conversa_id
                       WHERE a.encerrado_em > :d AND COALESCE(c.teste, 0) = 0
                         AND EXISTS (SELECT 1 FROM chat_mensagens m WHERE m.atendimento_id = a.id AND m.autor_tipo = 'sistema' AND m.tipo = 'texto' AND m.interna = 0)
                       ORDER BY (a.avaliacao_nota IS NOT NULL AND a.avaliacao_nota <= 3) DESC, a.avaliacao_nota = 5 DESC, a.id DESC LIMIT 12", [':d' => $desde]);
    $ruins = [];
    $bons = [];
    foreach ($ats as $a) {
        $t = msgAprTranscricao($pdo, (int) $a['id']);
        if ($t === '') {
            continue;
        }
        $bloco = "[atendimento {$a['id']}" . ($a['avaliacao_nota'] ? " · nota do cliente {$a['avaliacao_nota']}" : '') . "]\n" . mb_substr($t, 0, 3500);
        ((int) $a['avaliacao_nota'] === 5) ? $bons[] = $bloco : $ruins[] = $bloco;
    }
    if ($ruins) {
        $partes[] = "ATENDIMENTOS REAIS COM A AURORA (veja o que o ATENDENTE precisou fazer depois e onde a Aurora poderia ter feito melhor):\n" . implode("\n\n", array_slice($ruins, 0, 8));
    }
    if ($bons) {
        $partes[] = "ATENDIMENTOS COM NOTA 5 DO CLIENTE (candidatos a exemplo):\n" . implode("\n\n", array_slice($bons, 0, 4));
    }
    // 4) perguntas que a Base não respondeu
    $sem = $consulta("SELECT assunto, COUNT(*) AS n, MAX(pergunta) AS exemplo FROM chat_ia_perguntas WHERE criado_em > :d AND respondida_base = 0
                       AND intencao IN ('duvida','outro','plano_novo','associado','informacao_velorio') GROUP BY assunto ORDER BY n DESC LIMIT 12", [':d' => $desde]);
    if ($sem) {
        $partes[] = "PERGUNTAS QUE A BASE DE CONHECIMENTO NÃO RESPONDEU:\n" . implode("\n", array_map(fn($p) => "- {$p['assunto']} ({$p['n']}x) · ex.: \"" . mb_substr((string) $p['exemplo'], 0, 200) . '"', $sem));
    }
    if (!$partes) {
        $pdo->prepare("INSERT INTO chat_config (chave, valor) VALUES ('apr_ultima_analise', :v) ON DUPLICATE KEY UPDATE valor = :v2")->execute([':v' => $agora, ':v2' => $agora]);
        return ['licoes' => 0, 'exemplos' => 0, 'documentos' => 0, 'cenarios' => 0, 'msg' => 'Nada novo para analisar desde a última análise.'];
    }
    $existentes = $consulta("SELECT habilidade, texto FROM chat_ia_licoes WHERE tipo = 'licao' AND status IN ('proposta','aprovada') ORDER BY id DESC LIMIT 80");
    $listaExist = implode("\n", array_map(fn($l) => "- [{$l['habilidade']}] " . mb_substr((string) $l['texto'], 0, 200), $existentes));
    $sistema = "Você melhora a Aurora, assistente virtual de WhatsApp do Plano PAI (funerária e plano funerário em Barreiras-BA). "
        . "Leia os dados e proponha melhorias GERAIS e reutilizáveis (não correções de um caso só). Regras fixas que você NÃO pode mudar nem contradizer: respeito absoluto com a família e com quem faleceu; nunca pedir CPF, RG, documento ou cartão pelo WhatsApp; valores e coberturas só do sistema/Base; falecimento, reclamação, cancelamento e pedido de atendente vão para uma pessoa.\n"
        . "Responda SÓ com JSON: {\"licoes\": [{\"habilidade\": \"" . implode('|', APR_HABILIDADES) . "\", \"texto\": \"regra curta e acionável, no imperativo, até 40 palavras\", \"motivo\": \"por que, citando a evidência\"}], "
        . "\"exemplos\": [{\"atendimento\": id, \"intencao\": \"obito|coroa|plano_novo|pagamento|duvida|informacao_velorio|reclamacao\", \"titulo\": \"...\", \"resumo\": \"1 frase\", \"dialogo\": \"CLIENTE: ...\\nAURORA: ... (anonimizado: troque nomes por [nome], sem números)\"}], "
        . "\"documentos\": [{\"titulo\": \"...\", \"descricao\": \"1 a 2 frases\", \"conteudo\": \"texto no padrão da Base, em parágrafos; NÃO invente fatos: onde faltar informação escreva [PREENCHER: o que falta]\"}], "
        . "\"cenarios\": [{\"titulo\": \"...\", \"persona\": \"quem é o cliente e o que quer (sem dados reais)\", \"regras\": \"o que a Aurora deve fazer\", \"max\": 4-9}]}. "
        . "No máximo 6 lições, 3 exemplos (só de atendimentos com nota 5), 3 documentos (só das perguntas sem resposta na Base) e 3 cenários (só de falhas reais). Não repita lições que já existem:\n" . ($listaExist ?: '(nenhuma ainda)');
    $resp = msgTesteJson((string) msgTesteClaude($sistema, implode("\n\n", $partes), 7000));
    if (!$resp) {
        throw new RuntimeException('O Claude não devolveu as propostas no formato certo. Tente de novo.');
    }
    $n = ['licoes' => 0, 'exemplos' => 0, 'documentos' => 0, 'cenarios' => 0];
    $insL = $pdo->prepare("INSERT INTO chat_ia_licoes (tipo, habilidade, titulo, texto, descricao, motivo, origem) VALUES (:t, :h, :ti, :x, :d, :m, 'analise')");
    foreach (array_slice((array) ($resp['licoes'] ?? []), 0, 6) as $l) {
        $hab = in_array($l['habilidade'] ?? '', APR_HABILIDADES, true) ? $l['habilidade'] : 'geral';
        if (trim((string) ($l['texto'] ?? '')) === '') {
            continue;
        }
        $insL->execute([':t' => 'licao', ':h' => $hab, ':ti' => null, ':x' => mb_substr(trim((string) $l['texto']), 0, 600), ':d' => null, ':m' => mb_substr((string) ($l['motivo'] ?? ''), 0, 1000)]);
        $n['licoes']++;
    }
    foreach (array_slice((array) ($resp['documentos'] ?? []), 0, 3) as $d) {
        if (trim((string) ($d['conteudo'] ?? '')) === '') {
            continue;
        }
        $insL->execute([':t' => 'documento', ':h' => 'duvidas', ':ti' => mb_substr((string) ($d['titulo'] ?? 'Rascunho'), 0, 200), ':x' => (string) $d['conteudo'], ':d' => mb_substr((string) ($d['descricao'] ?? ''), 0, 1000), ':m' => 'Perguntas sem resposta na Base']);
        $n['documentos']++;
    }
    $insE = $pdo->prepare('INSERT INTO chat_ia_exemplos (intencao, titulo, resumo, dialogo, motivo, origem_conversa_id) VALUES (:i, :t, :r, :d, :m, NULL)');
    foreach (array_slice((array) ($resp['exemplos'] ?? []), 0, 3) as $e) {
        if (trim((string) ($e['dialogo'] ?? '')) === '') {
            continue;
        }
        $insE->execute([':i' => mb_substr((string) ($e['intencao'] ?? 'outro'), 0, 30), ':t' => mb_substr((string) ($e['titulo'] ?? 'Exemplo'), 0, 150), ':r' => mb_substr((string) ($e['resumo'] ?? ''), 0, 300),
            ':d' => preg_replace('/\d[\d.\-\/ ]{6,}\d/u', '[número]', mb_substr((string) $e['dialogo'], 0, 4000)), ':m' => 'Atendimento ' . (int) ($e['atendimento'] ?? 0) . ' com nota 5']);
        $n['exemplos']++;
    }
    try {
        $insC = $pdo->prepare('INSERT IGNORE INTO chat_ia_cenarios (chave, titulo, persona, regras, max_turnos) VALUES (:k, :t, :p, :r, :m)');
        foreach (array_slice((array) ($resp['cenarios'] ?? []), 0, 3) as $c) {
            if (trim((string) ($c['persona'] ?? '')) === '') {
                continue;
            }
            $insC->execute([':k' => 'auto' . date('ymdHis') . $n['cenarios'], ':t' => mb_substr((string) ($c['titulo'] ?? 'Cenário'), 0, 150), ':p' => (string) $c['persona'], ':r' => (string) ($c['regras'] ?? ''), ':m' => max(3, min(9, (int) ($c['max'] ?? 6)))]);
            $n['cenarios']++;
        }
    } catch (PDOException $e) {
        // tabela de cenários ainda não criada
    }
    try {
        $pdo->exec('UPDATE chat_ia_feedback SET analisado = 1 WHERE analisado = 0');
    } catch (PDOException $e) {
        // sem a tabela de feedback
    }
    $pdo->prepare("INSERT INTO chat_config (chave, valor) VALUES ('apr_ultima_analise', :v) ON DUPLICATE KEY UPDATE valor = :v2")->execute([':v' => $agora, ':v2' => $agora]);
    return $n + ['msg' => "Análise feita: {$n['licoes']} lição(ões), {$n['documentos']} rascunho(s) para a Base, {$n['exemplos']} exemplo(s) e {$n['cenarios']} cenário(s) para aprovar."];
}

/** Cenários de teste vindos das conversas reais (aprovados) — entram na tela de testes junto dos 8 fixos. */
function msgAprCenariosAtivos(PDO $pdo): array
{
    try {
        $st = $pdo->query("SELECT chave, titulo, persona, regras, max_turnos FROM chat_ia_cenarios WHERE status = 'ativo' ORDER BY id");
        $saida = [];
        foreach ($st->fetchAll() as $c) {
            $saida[(string) $c['chave']] = ['titulo' => '🔁 ' . $c['titulo'], 'persona' => $c['persona'], 'regras' => $c['regras'], 'max' => (int) $c['max_turnos']];
        }
        return $saida;
    } catch (PDOException $e) {
        return [];
    }
}
