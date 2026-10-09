"use client";

/* Correções operacionais (09/10/2026) — chamadas ao correcoes.php (só Gestão; reembolso também Financeiro). */

export const CORRECOES_API = "https://api.planoassistencialintegrado.com.br/correcoes.php";
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

export async function correcoesJson(params: Record<string, string | number> | null, body?: Record<string, unknown>) {
    const url = new URL(CORRECOES_API);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    url.searchParams.set("_", String(Date.now()));
    const res = await fetch(url.toString(), {
        method: body ? "POST" : "GET",
        credentials: "include",
        cache: "no-store",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const json: any = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || !json || json.erro) {
        throw new Error(json?.msg || `Falha na requisição (${res.status}).`);
    }
    return json as { erro: false; msg: string; dados: any };
}

export type PodeCorrigir = { gestao: boolean; reembolso: boolean };

let podeCache: Promise<PodeCorrigir> | null = null;

/** Pergunta uma vez por carregamento de página o que o usuário pode fazer nas correções. */
export function consultarPodeCorrigir(): Promise<PodeCorrigir> {
    if (!podeCache) {
        podeCache = correcoesJson({ pode: 1 })
            .then((r) => ({ gestao: !!r.dados?.gestao, reembolso: !!r.dados?.reembolso }))
            .catch(() => {
                podeCache = null;
                return { gestao: false, reembolso: false };
            });
    }
    return podeCache;
}

export const brl = (v: unknown) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataHoraBR = (s?: string | null) =>
    s ? new Date(String(s).replace(" ", "T")).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
