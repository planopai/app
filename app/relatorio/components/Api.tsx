"use client";
import { FalecidoItem, LogItem, RegistroAnalise } from "./TiposHistorico";

/* ======================== Endpoints ======================== */

export const LISTAR_FALECIDOS =
    "/api/php/historico_sepultamentos.php?listar_falecidos=1";

export const LISTAR_ANALITICO = "/api/php/informativo.php?listar=1";

export const LOG_POR_ID = (id: string) =>
    `/api/php/historico_sepultamentos.php?log=1&id=${encodeURIComponent(id)}`;

/* ======================== Cache simples (client) ======================== */
/**
 * Cache em memória com TTL para deixar a tela “snappy”
 * sem depender do cache do fetch (você usa no-store).
 */
type CacheEntry = { exp: number; data: any };
const MEM_CACHE = new Map<string, CacheEntry>();

function getCache<T>(key: string): T | null {
    const hit = MEM_CACHE.get(key);
    if (!hit) return null;
    if (Date.now() > hit.exp) {
        MEM_CACHE.delete(key);
        return null;
    }
    return hit.data as T;
}
function setCache(key: string, data: any, ttlMs: number) {
    MEM_CACHE.set(key, { exp: Date.now() + ttlMs, data });
}

async function fetchJson<T = any>(
    url: string,
    opts?: { ttlMs?: number; timeoutMs?: number; useCache?: boolean }
): Promise<T> {
    const ttlMs = opts?.ttlMs ?? 10_000; // 10s é suficiente p/ relatório
    const timeoutMs = opts?.timeoutMs ?? 12_000;
    const useCache = opts?.useCache ?? true;

    const cacheKey = url; // sem nocache, pra poder reutilizar
    if (useCache) {
        const cached = getCache<T>(cacheKey);
        if (cached) return cached;
    }

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
        // Mantém no-store para evitar cache “agressivo” de infra,
        // mas usamos nosso cache em memória pra ficar rápido no front.
        const res = await fetch(url, {
            cache: "no-store",
            credentials: "include",
            signal: ac.signal,
        });

        // evita erro silencioso / JSON inválido
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const data = (await res.json()) as T;
        if (useCache) setCache(cacheKey, data, ttlMs);
        return data;
    } finally {
        clearTimeout(t);
    }
}

/* ======================== Helpers ======================== */

function primeiroLogDatahora(logs: LogItem[]): string {
    if (!logs?.length) return "";
    // logs podem vir ASC do PHP: primeiro já é a criação
    const first = logs[0]?.datahora || "";
    if (first) return first;
    // fallback
    const ord = logs
        .slice()
        .sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    return ord[0]?.datahora || "";
}

/**
 * Normaliza URLs de assinaturas para evitar erro de CORS.
 */
export function normalizarUrlAssinatura(url?: string): string | undefined {
    if (!url) return undefined;
    let u = String(url).trim();

    if (u.startsWith("/uploads/")) {
        return `/api/php/proxy_assinatura.php?file=${encodeURIComponent(u)}`;
    }

    if (u.startsWith("https://planoassistencialintegrado.com.br/uploads/")) {
        const path = u.replace("https://planoassistencialintegrado.com.br", "");
        return `/api/php/proxy_assinatura.php?file=${encodeURIComponent(path)}`;
    }

    u = u.replace(
        "https://pai.planoassistencialintegrado.com.br",
        "https://planoassistencialintegrado.com.br"
    );

    return u;
}

/* ===== Assinaturas ===== */

export type AssinaturaInfo = {
    sucesso?: boolean;
    responsavel?: { url?: string; nome?: string; cpf?: string };
    requerente?: { url?: string; nome?: string; cpf?: string };
};

export async function pegarAssinaturasInfoPorId(
    id: string | number
): Promise<AssinaturaInfo> {
    if (!id) return {};
    try {
        const url = `/api/php/proxy_assinatura.php?info=1&id=${encodeURIComponent(
            String(id)
        )}`;
        return (await fetchJson<AssinaturaInfo>(url, { ttlMs: 30_000 })) || {};
    } catch {
        return {};
    }
}

/* ======================== Fetchers básicos ======================== */

export async function listarFalecidos(): Promise<FalecidoItem[]> {
    try {
        const json = await fetchJson<any>(LISTAR_FALECIDOS, { ttlMs: 10_000 });
        if (json?.sucesso && Array.isArray(json?.dados)) return json.dados as FalecidoItem[];
        if (Array.isArray(json)) return json as FalecidoItem[];
        return [];
    } catch {
        return [];
    }
}

export async function listarLogPorId(id: string): Promise<LogItem[]> {
    try {
        const json = await fetchJson<any>(LOG_POR_ID(id), { ttlMs: 20_000 });
        if (json?.sucesso && Array.isArray(json?.dados)) return json.dados as LogItem[];
        if (Array.isArray(json)) return json as LogItem[];
        return [];
    } catch {
        return [];
    }
}

export async function listarAnalitico(): Promise<RegistroAnalise[]> {
    try {
        const json = await fetchJson<any>(LISTAR_ANALITICO, { ttlMs: 10_000 });
        if (json?.sucesso && Array.isArray(json?.dados)) return json.dados as RegistroAnalise[];
        if (Array.isArray(json)) return json as RegistroAnalise[];
        return [];
    } catch {
        return [];
    }
}

/* ======================== Lista com criação (SEM N+1) ======================== */

export type FalecidoComCriacao = FalecidoItem & { criacao?: string };

/**
 * Agora a criação vem do backend (campo `criacao` do seu SQL).
 * Zero chamadas extras de log: MUITO mais rápido.
 */
export async function listarFalecidosComCriacao(): Promise<{
    lista: FalecidoComCriacao[];
    criacaoMap: Record<string, string>;
}> {
    const listaRaw = await listarFalecidos();

    const criacaoMap: Record<string, string> = {};
    const lista = (listaRaw || []).map((r: any) => {
        const id = String(r.sepultamento_id || "");
        const criacao = String(r.criacao || r.ultima_datahora || r.ultima_datahora || "");
        criacaoMap[id] = criacao;
        return { ...r, criacao } as FalecidoComCriacao;
    });

    return { lista, criacaoMap };
}
