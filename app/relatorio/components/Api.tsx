"use client";
import { FalecidoItem, LogItem, RegistroAnalise } from "./TiposHistorico";

/* ======================== Endpoints ======================== */

export const LISTAR_FALECIDOS =
    "/api/php/historico_sepultamentos.php?listar_falecidos=1";

export const LISTAR_ANALITICO =
    "/api/php/informativo.php?listar=1";

export const LOG_POR_ID = (id: string) =>
    `/api/php/historico_sepultamentos.php?log=1&id=${encodeURIComponent(id)}`;

/* ======================== Helpers ======================== */

async function fetchJson<T = any>(url: string): Promise<T> {
    // evita cache agressivo (Vercel)
    const res = await fetch(`${url}&_nocache=${Date.now()}`, { cache: "no-store" });
    return res.json();
}

function primeiroLogDatahora(logs: LogItem[]): string {
    if (!logs?.length) return "";
    const ord = logs.slice().sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    return ord[0]?.datahora || "";
}

/**
 * Normaliza URLs de assinaturas para evitar erro de CORS.
 * - Se for relativo (/uploads/assinaturas/...), converte para proxy local.
 * - Se for do domínio errado (pai.), corrige para o principal.
 * - Caso contrário, mantém a URL original.
 */
export function normalizarUrlAssinatura(url?: string): string | undefined {
    if (!url) return undefined;
    let u = String(url).trim();

    // Se vier só o caminho relativo (/uploads/...)
    if (u.startsWith("/uploads/")) {
        return `/api/php/proxy_assinatura.php?file=${encodeURIComponent(u)}`;
    }

    // Se vier do domínio principal, converte para proxy (evita CORS)
    if (u.startsWith("https://planoassistencialintegrado.com.br/uploads/")) {
        const path = u.replace("https://planoassistencialintegrado.com.br", "");
        return `/api/php/proxy_assinatura.php?file=${encodeURIComponent(path)}`;
    }

    // Se vier com o subdomínio pai., troca
    u = u.replace(
        "https://pai.planoassistencialintegrado.com.br",
        "https://planoassistencialintegrado.com.br"
    );

    return u;
}

/* ======================== Fetchers básicos ======================== */

export async function listarFalecidos(): Promise<FalecidoItem[]> {
    try {
        const json = await fetchJson<any>(LISTAR_FALECIDOS);
        if (json?.sucesso && Array.isArray(json?.dados)) return json.dados as FalecidoItem[];
        if (Array.isArray(json)) return json as FalecidoItem[];
        return [];
    } catch {
        return [];
    }
}

export async function listarLogPorId(id: string): Promise<LogItem[]> {
    try {
        const json = await fetchJson<any>(LOG_POR_ID(id));
        if (json?.sucesso && Array.isArray(json?.dados)) return json.dados as LogItem[];
        if (Array.isArray(json)) return json as LogItem[];
        return [];
    } catch {
        return [];
    }
}

export async function listarAnalitico(): Promise<RegistroAnalise[]> {
    try {
        const json = await fetchJson<any>(LISTAR_ANALITICO);
        if (json?.sucesso && Array.isArray(json?.dados)) return json.dados as RegistroAnalise[];
        if (Array.isArray(json)) return json as RegistroAnalise[];
        return [];
    } catch {
        return [];
    }
}

/* ======================== Carregar CRIAÇÃO junto com a lista ======================== */

export type FalecidoComCriacao = FalecidoItem & { criacao?: string };

/** Busca as datas de criação (primeiro log) com limite de concorrência. */
export async function pegarCriacoes(
    ids: string[],
    maxConc = 8
): Promise<Record<string, string>> {
    const pend = Array.from(new Set(ids.filter(Boolean)));
    const out: Record<string, string> = {};
    let i = 0;

    async function worker() {
        while (i < pend.length) {
            const id = pend[i++];
            try {
                const logs = await listarLogPorId(id);
                out[id] = primeiroLogDatahora(logs);
            } catch {
                out[id] = "";
            }
        }
    }

    const workers = Array.from({ length: Math.min(maxConc, pend.length) }, worker);
    await Promise.all(workers);
    return out;
}

/**
 * Retorna a lista **já com** a data de criação resolvida.
 * Use esta função na tela para evitar o “piscar” das datas.
 */
export async function listarFalecidosComCriacao(
    maxConc = 8
): Promise<{ lista: FalecidoComCriacao[]; criacaoMap: Record<string, string> }> {
    const lista = await listarFalecidos();
    const ids = lista.map((r) => String(r.sepultamento_id || ""));
    const criacaoMap = await pegarCriacoes(ids, maxConc);

    const listaCom = lista.map<FalecidoComCriacao>((r) => ({
        ...r,
        criacao: criacaoMap[String(r.sepultamento_id || "")] || r.ultima_datahora || "",
    }));

    return { lista: listaCom, criacaoMap };
}
