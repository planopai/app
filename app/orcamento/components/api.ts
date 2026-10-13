/* Orçamento (13/10/2026) — chamadas ao servidor. Tudo com o cookie de sessão (credentials: "include"). */

import type { Linha, Opcoes, Orcamento, Rascunho, ResumoLista, Previa } from "./tipos";

const API = "https://api.planoassistencialintegrado.com.br";
export const ORC_API = `${API}/orcamento.php`;
/** Mesma busca de estoque do registro do atendimento (urnas, roupas, véus, cordões, invol e coroas). */
export const ESTOQUE_API = `${API}/materiais_gerais.php`;
const LOGIN = "/login";

async function lerJson(res: Response) {
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        if (typeof window !== "undefined") window.location.href = LOGIN;
        throw new Error("Sessão expirada. Faça login novamente.");
    }
    if (!res.ok || !json || json.erro) throw new Error(json?.msg || `Falha na comunicação com o servidor (${res.status}).`);
    return json;
}

async function orcGet<T>(params: Record<string, string | number>): Promise<T> {
    const u = new URL(ORC_API);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    u.searchParams.set("_", String(Date.now()));
    const j = await lerJson(await fetch(u.toString(), { credentials: "include", cache: "no-store" }));
    return j.dados as T;
}

async function orcPost<T>(corpo: Record<string, unknown>): Promise<{ dados: T; msg: string }> {
    const j = await lerJson(
        await fetch(ORC_API, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpo),
        }),
    );
    return { dados: j.dados as T, msg: String(j.msg || "") };
}

export const carregarOpcoes = () => orcGet<Opcoes>({ opcoes: 1 });
export const listarOrcamentos = (status: string, busca: string) => orcGet<ResumoLista[]>({ listar: 1, status, busca });
export const lerOrcamento = (id: number) => orcGet<Orcamento>({ detalhe: 1, id });
/** Calcula a folha. Com 'antes', o servidor diz se este usuário pode aplicar o ajuste (bloqueio = motivo; "" = pode). */
export const calcularPrevia = (rascunho: Rascunho | Record<string, unknown>, antes?: Record<string, unknown>) =>
    orcPost<Previa>(antes ? { acao: "previa", rascunho, antes } : { acao: "previa", rascunho }).then((r) => r.dados);
export const salvarOrcamento = (dados: { id?: number; falecido: string; contato: string; telefone: string; observacao: string; rascunho: Rascunho }) =>
    orcPost<Orcamento>({ acao: "salvar", ...dados });
export const cancelarOrcamento = (id: number, motivo: string) => orcPost<{ id: number }>({ acao: "cancelar", id, motivo });

export async function precosDe(ids: number[]): Promise<Record<string, number | null>> {
    const lista = Array.from(new Set(ids.filter((i) => i > 0)));
    if (!lista.length) return {};
    return orcGet<Record<string, number | null>>({ precos: 1, ids: lista.join(",") });
}

export const urlFolha = (id: number, imprimir = false) => `${ORC_API}?folha=1&id=${id}${imprimir ? "&formato=impressao" : ""}&_=${Date.now()}`;

/** Folha pronta (HTML do servidor, sem abrir a impressão) para mostrar na tela e gerar o PDF. */
export async function buscarFolhaHtml(id: number): Promise<string> {
    const res = await fetch(urlFolha(id), { credentials: "include", cache: "no-store" });
    const html = await res.text();
    if (res.status === 401) {
        if (typeof window !== "undefined") window.location.href = LOGIN;
        throw new Error("Sessão expirada. Faça login novamente.");
    }
    if (!res.ok || !html.includes("<body")) {
        let msg = "";
        try {
            msg = JSON.parse(html)?.msg || "";
        } catch {
            /* não era JSON */
        }
        throw new Error(msg || `Não foi possível montar a folha (${res.status}).`);
    }
    return html;
}

/* ---------------------------------------------------------------- estoque */

export type ProdutoEstoque = { produto_id: number; nome: string; codigo_barras?: string; saldo?: number; local?: string };

const pidDe = (r: any) => Number(r?.produto_id ?? r?.est_produto_id ?? r?.id ?? 0) || 0;

/**
 * Busca no estoque juntando os locais (o orçamento não escolhe de onde sai: isso é no atendimento).
 * Cada produto aparece uma vez, com o local onde tem saldo.
 */
export async function buscarNoEstoque(action: string, locais: string[], q: string, sinal?: AbortSignal): Promise<ProdutoEstoque[]> {
    const vistos = new Map<number, ProdutoEstoque>();
    const respostas = await Promise.all(
        locais.map(async (local) => {
            const u = new URL(ESTOQUE_API);
            u.searchParams.set("action", action);
            u.searchParams.set("q", q.trim());
            u.searchParams.set("somente_com_saldo", "1");
            u.searchParams.set("limit", "60");
            u.searchParams.set("deposito_nome", local);
            const res = await fetch(u.toString(), { credentials: "include", cache: "no-store", signal: sinal });
            const j = await res.json().catch(() => null);
            if (!j?.ok) throw new Error(j?.msg || `Falha ao buscar no estoque (${res.status}).`);
            return { local, rows: (j.rows || []) as any[] };
        }),
    );
    respostas.forEach(({ local, rows }) =>
        rows.forEach((r) => {
            const pid = pidDe(r);
            if (pid <= 0 || vistos.has(pid)) return;
            vistos.set(pid, { produto_id: pid, nome: String(r?.nome || "").trim(), codigo_barras: r?.codigo_barras, saldo: Number(r?.saldo_total ?? 0) || undefined, local });
        }),
    );
    return Array.from(vistos.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Modelos de coroa (natural não depende de saldo; artificial, dos depósitos MEMORIAL e FUNERARIA). */
export async function buscarCoroas(tipo: "natural" | "artificial", q: string, sinal?: AbortSignal): Promise<ProdutoEstoque[]> {
    const locais = tipo === "artificial" ? ["MEMORIAL", "FUNERARIA"] : [""];
    const vistos = new Map<number, ProdutoEstoque>();
    for (const local of locais) {
        const u = new URL(ESTOQUE_API);
        u.searchParams.set("action", "coroas_buscar");
        u.searchParams.set("tipo", tipo);
        if (local) u.searchParams.set("deposito", local);
        u.searchParams.set("q", q.trim());
        u.searchParams.set("limit", "100");
        const res = await fetch(u.toString(), { credentials: "include", cache: "no-store", signal: sinal });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) throw new Error(j?.msg || "Não foi possível carregar as coroas.");
        (Array.isArray(j.rows) ? j.rows : []).forEach((r: any) => {
            const pid = Number(r?.id ?? r?.produto_id ?? 0) || 0;
            if (pid > 0 && !vistos.has(pid)) vistos.set(pid, { produto_id: pid, nome: String(r?.nome || "").trim(), codigo_barras: r?.codigo_barras, local: local || undefined });
        });
    }
    return Array.from(vistos.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type { Linha };

/** Chamado pelo Atendimento depois de salvar o Novo registro que veio do orçamento. */
export const marcarOrcamentoConvertido = (id: number, atendimentoId: number | string) =>
    orcPost<{ id: number; atendimento_id: number }>({ acao: "converter", id, atendimento_id: Number(atendimentoId) });
