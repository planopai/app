"use client";

/**
 * Números mostrados como selo no menu e na barra de baixo (e no resumo do Início).
 *
 * Usa dados que o sistema já tem; cada número falha em silêncio (null = não mostra). A consulta é única para a tela
 * inteira (menu, barra de baixo e Início usam o mesmo resultado) e se atualiza a cada 15 s (aba visível, com rede) e quando a janela volta ao foco.
 *
 *  - servicos / recolher / aguardando: informativo.php?listar=1, com a MESMA regra do Quadro (concluídos não contam)
 *  - coroas: coroas.php?listar=1&grupo=confeccao (fila de confecção)
 *  - requisicoes: requisicoes.php (fila, para quem opera; senão, as minhas abertas)
 *  - minhasRequisicoes: requisicoes.php?action=minhas (as requisições abertas do próprio usuário; atalho do Início, 15/10/2026)
 *  - estoque: materiais_gerais.php?init=1 (produtos no mínimo ou abaixo)
 *  - avisos: avisos.php?listar=1 (os que ainda não foram finalizados), com o MESMO filtro da tela Avisos (28/10/2026):
 *    aviso de atendimento ("Atendimento: NOME: ...") só conta enquanto o atendimento estiver no Quadro
 *
 * Chat: hoje o Chat é a Aurora e não tem contador de não lidas; o selo do Chat só existirá quando houver chat interno.
 */

import { useEffect, useState } from "react";
import { aguardaAcaoDe, aguardandoRecolhimento, atendimentoDeveFicarNoQuadro, type RegistroRegra } from "@/components/atendimentos/regrasQuadro";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const INTERVALO_MS = 15_000; // igual à home antiga; só consulta com a aba visível e com rede

export type Contadores = {
    nome: string;
    servicos: number | null;
    recolher: number | null;
    aguardando: number | null;
    coroas: number | null;
    requisicoes: number | null;
    minhasRequisicoes: number | null;
    estoque: number | null;
    avisos: number | null;
};

const VAZIO: Contadores = { nome: "", servicos: null, recolher: null, aguardando: null, coroas: null, requisicoes: null, minhasRequisicoes: null, estoque: null, avisos: null };

let estado: Contadores = { ...VAZIO };
const ouvintes = new Set<() => void>();
let temAcesso: (slug: string) => boolean = () => false;
let timer: number | undefined;
let ctl: AbortController | null = null;
let emAndamento = false;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
    try {
        const r = await fetch(url, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" }, signal });
        if (!r.ok) return null;
        return (await r.json()) as T;
    } catch {
        return null;
    }
}

function publicar(parcial: Partial<Contadores>) {
    estado = { ...estado, ...parcial };
    ouvintes.forEach((f) => f());
}

type PedidoCoroaContador = { status?: string | null; quantidade_coroas?: number | string | null; itens?: { status?: string | null }[] | null };

/** Coroas na Confecção que ainda não foram entregues (cada coroa conta 1). */
function contarCoroasNaoEntregues(pedidos: PedidoCoroaContador[]): number {
    let total = 0;
    for (const p of pedidos) {
        const statusPedido = String(p?.status ?? "").trim().toLowerCase();
        const itens = Array.isArray(p?.itens) ? p.itens : [];
        if (!itens.length) {
            if (statusPedido !== "entregue") total += Math.max(1, Number(p?.quantidade_coroas) || 1);
            continue;
        }
        for (const it of itens) {
            const st = String(it?.status ?? statusPedido).trim().toLowerCase();
            if (st !== "entregue") total += 1;
        }
    }
    return total;
}

/* Mesmo filtro da tela Avisos (app/avisos/page.tsx): avisos de atendimento começam com "Atendimento:". */
const TAG_AVISO_ATENDIMENTO = "Atendimento:";
function nomeDoAvisoDeAtendimento(msg: unknown): string | null {
    const s = String(msg ?? "");
    if (!s.startsWith(TAG_AVISO_ATENDIMENTO)) return null;
    const resto = s.slice(TAG_AVISO_ATENDIMENTO.length).trim();
    const i = resto.indexOf(":");
    return (i >= 0 ? resto.slice(0, i) : resto).trim();
}
function normNomeAviso(s: string): string {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// 11/11/2026: as consultas eram feitas uma depois da outra (quem sou → Quadro → avisos → coroas → requisições →
// estoque). Coroas esperava as três primeiras e o estoque esperava todas; por isso esses cartões demoravam mais.
// Agora saem todas juntas e cada número aparece assim que a sua resposta chega. Os últimos números ficam guardados
// na sessão do navegador e aparecem na hora ao reabrir o app (são trocados pelos novos em seguida).
const CHAVE_CACHE = "pai_contadores_v1";

function lerCache(): Partial<Contadores> | null {
    try {
        if (typeof window === "undefined") return null;
        const bruto = window.sessionStorage.getItem(CHAVE_CACHE);
        return bruto ? (JSON.parse(bruto) as Partial<Contadores>) : null;
    } catch {
        return null;
    }
}

function gravarCache() {
    try {
        if (typeof window !== "undefined") window.sessionStorage.setItem(CHAVE_CACHE, JSON.stringify(estado));
    } catch {
        /* sem armazenamento: só não guarda */
    }
}

let cacheLido = false;
function aplicarCacheUmaVez() {
    if (cacheLido) return;
    cacheLido = true;
    const c = lerCache();
    if (c) estado = { ...estado, ...c };
}

type SaldoContador = { produto_id: number; quantidade: number | string; minimo?: number | string; maximo?: number | string };

async function atualizar() {
    if (emAndamento) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    emAndamento = true;
    ctl?.abort();
    ctl = new AbortController();
    const sig = ctl.signal;
    const has = temAcesso;
    const t = Date.now();

    // Quem sou e o Quadro: o "aguardando sua ação" precisa dos dois; o resto não depende de ninguém.
    const pWho = getJson<{ nome?: string }>(`${ENDPOINT}/pai_api.php?action=whoami&_=${t}`, sig).then((who) => {
        const completo = String(who?.nome || "").trim();
        if (completo) publicar({ nome: completo });
        return completo;
    });

    // Quadro e Minhas OS são de todos: os números de atendimento também.
    const pQuadro = getJson<RegistroRegra[]>(`${ENDPOINT}/informativo.php?listar=1&_=${t}`, sig).then((lista) => {
        if (!Array.isArray(lista)) return null;
        const noQuadro = lista.filter(atendimentoDeveFicarNoQuadro);
        publicar({ servicos: noQuadro.length, recolher: noQuadro.filter(aguardandoRecolhimento).length });
        return noQuadro;
    });

    const tarefas: Promise<unknown>[] = [pWho, pQuadro];

    tarefas.push(
        Promise.all([pWho, pQuadro]).then(([completo, noQuadro]) => {
            if (noQuadro) publicar({ aguardando: completo ? noQuadro.filter((r) => aguardaAcaoDe(r, completo)).length : null });
        }),
    );

    tarefas.push(
        getJson<{ finalizado?: number | string | boolean; mensagem?: string; sepultamento_id?: unknown }[]>(
            `${ENDPOINT}/avisos.php?listar=1&_nocache=${t}`,
            sig,
        ).then(async (av) => {
            if (!Array.isArray(av)) return;
            // Igual à tela Avisos: o avisos.php novo já tira os avisos de atendimentos fora do Quadro (e devolve
            // "sepultamento_id" em todos); com o servidor antigo, o filtro é pelo nome do falecido (espera o Quadro).
            const servidorFiltra = av.length > 0 && av.every((a) => a && "sepultamento_id" in a);
            let nomesNoQuadro: Set<string> | null = null;
            if (!servidorFiltra) {
                const noQuadro = await pQuadro;
                if (noQuadro) {
                    nomesNoQuadro = new Set(
                        noQuadro.map((r) => normNomeAviso(String((r as { falecido?: unknown })?.falecido ?? ""))).filter(Boolean),
                    );
                }
            }
            const ativos = av.filter((a) => {
                if (Number(a?.finalizado) === 1 || a?.finalizado === true) return false;
                if (servidorFiltra || !nomesNoQuadro) return true;
                const nome = nomeDoAvisoDeAtendimento(a?.mensagem);
                if (!nome) return true;
                return nomesNoQuadro.has(normNomeAviso(nome));
            });
            publicar({ avisos: ativos.length });
        }),
    );

    if (has("coroa-de-flores")) {
        // Um cartão por coroa (07/10/2026): conta as COROAS ainda não entregues (etapa de cada coroa),
        // não os pedidos. Sem a etapa na coroa (servidor antigo), usa a do pedido.
        tarefas.push(
            getJson<{ sucesso?: boolean; dados?: PedidoCoroaContador[] }>(
                `${ENDPOINT}/coroas.php?listar=1&grupo=confeccao&page=1&per_page=100&fresh=${t}`,
                sig,
            ).then((j) => {
                if (j?.sucesso && Array.isArray(j.dados)) publicar({ coroas: contarCoroasNaoEntregues(j.dados) });
            }),
        );
    }

    const urlMinhas = `${ENDPOINT}/requisicoes.php?action=minhas&status=PENDENTE,EM_SEPARACAO,EM_TRANSITO&limit=50&_=${t}`;
    const operador = has("requisicoes");
    const soMinhas = !operador && has("requisicao");
    if (operador || soMinhas) {
        const url = operador ? `${ENDPOINT}/requisicoes.php?action=fila&status=PENDENTE,EM_SEPARACAO,EM_TRANSITO&limit=200&_ts=${t}` : urlMinhas;
        tarefas.push(
            getJson<{ ok?: boolean; rows?: unknown[] }>(url, sig).then((j) => {
                if (j?.ok && Array.isArray(j.rows)) {
                    publicar(operador ? { requisicoes: j.rows.length } : { requisicoes: j.rows.length, minhasRequisicoes: j.rows.length });
                }
            }),
        );
    }

    // Atalho "Minhas solicitações" do Início: requisições abertas do próprio usuário (a consulta acima já serve
    // quando é a mesma, isto é, quando a pessoa não opera a fila).
    if (has("minhas-solicitacoes") && !soMinhas) {
        tarefas.push(
            getJson<{ ok?: boolean; rows?: unknown[] }>(urlMinhas, sig).then((j) => {
                if (j?.ok && Array.isArray(j.rows)) publicar({ minhasRequisicoes: j.rows.length });
            }),
        );
    }

    if (has("geral") || has("estoque") || has("produtos")) {
        tarefas.push(
            getJson<{ ok?: boolean; saldos?: SaldoContador[] }>(`${ENDPOINT}/materiais_gerais.php?init=1&_ts=${t}`, sig).then((j) => {
                if (j?.ok && Array.isArray(j.saldos)) {
                    const baixos = new Set<number>();
                    for (const s of j.saldos) {
                        const q = Math.max(0, Math.floor(Number(s.quantidade) || 0));
                        const min = Math.max(0, Math.floor(Number(s.minimo) || 0));
                        const max = Math.max(0, Math.floor(Number(s.maximo) || 0));
                        if (min > 0 && max > 0 && q <= min) baixos.add(Number(s.produto_id));
                    }
                    publicar({ estoque: baixos.size });
                }
            }),
        );
    }

    try {
        await Promise.allSettled(tarefas);
        gravarCache();
    } finally {
        emAndamento = false;
    }
}

/** perms = o valor de usePerms().perms (null enquanto carrega); has = usePerms().has. */
export function useContadores(perms: unknown, has: (slug: string) => boolean): Contadores {
    const [, forcar] = useState(0);
    const pronto = perms != null;

    useEffect(() => {
        temAcesso = has;
    });

    useEffect(() => {
        aplicarCacheUmaVez();
        const f = () => forcar((n) => n + 1);
        f();
        ouvintes.add(f);
        return () => {
            ouvintes.delete(f);
        };
    }, []);

    useEffect(() => {
        if (!pronto) return;
        void atualizar();
        if (timer === undefined) {
            timer = window.setInterval(() => void atualizar(), INTERVALO_MS);
        }
        const aoFocar = () => void atualizar();
        window.addEventListener("focus", aoFocar);
        window.addEventListener("online", aoFocar);
        document.addEventListener("visibilitychange", aoFocar);
        return () => {
            window.removeEventListener("focus", aoFocar);
            window.removeEventListener("online", aoFocar);
            document.removeEventListener("visibilitychange", aoFocar);
            if (ouvintes.size === 0 && timer !== undefined) {
                window.clearInterval(timer);
                timer = undefined;
            }
        };
    }, [pronto]);

    return estado;
}

/** Selo no formato do mockup: 2 dígitos; vazio quando 0 ou desconhecido. */
export function formatarSelo(n: number | null | undefined): string {
    if (n == null || n <= 0) return "";
    return n > 99 ? "99+" : String(n).padStart(2, "0");
}
