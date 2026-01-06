"use client";
import { FalecidoItem, LogItem, RegistroAnalise } from "./TiposHistorico";

/* ======================== Endpoints ======================== */

export const LISTAR_FALECIDOS =
    "/api/php/historico_sepultamentos.php?listar_falecidos=1";

export const LISTAR_ANALITICO = "/api/php/informativo.php?listar=1";

export const LOG_POR_ID = (id: string) =>
    `/api/php/historico_sepultamentos.php?log=1&id=${encodeURIComponent(id)}`;

/** ✅ Materiais (árvore) — usado para mapear item/subitem -> categoria */
export const LISTAR_MATERIAIS_ALL =
    "/api/php/materiais_admin.php?op=list&all=1";

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

/* ======================== Materiais Map ======================== */

export type MateriaisMap = Record<string, { categoria: string; nome: string }>;

function normMatKey(k: string) {
    return String(k || "").trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * ✅ Monta um mapa: "item:10" -> {categoria:"Urnas", nome:"Urna Luxo"}
 * e "subitem:55" -> {categoria:"Urnas", nome:"Alça Dourada"}
 *
 * Isso permite mostrar o NOME DA CATEGORIA no relatório (tela + PDF),
 * mesmo em logs antigos (que não tinham categoria dentro do materiais_json).
 */
export async function obterMateriaisMap(force = false): Promise<MateriaisMap> {
    const cacheKey = "materiais_map_v1";
    if (!force) {
        const hit = getCache<MateriaisMap>(cacheKey);
        if (hit) return hit;
    }

    try {
        const json = await fetchJson<any>(LISTAR_MATERIAIS_ALL, {
            ttlMs: 5 * 60_000, // 5 min
            timeoutMs: 12_000,
            useCache: false, // vamos usar cacheKey fixo acima
        });

        if (json?.need_login) {
            window.location.href = "/login";
            return {};
        }

        const data = Array.isArray(json?.data) ? json.data : [];
        const map: MateriaisMap = {};

        for (const c of data) {
            const catNome = String(c?.nome ?? "").trim();
            const itens = Array.isArray(c?.itens) ? c.itens : [];
            for (const it of itens) {
                map[normMatKey(`item:${it?.id}`)] = {
                    categoria: catNome || "Material",
                    nome: String(it?.nome ?? "").trim() || `Item ${String(it?.id ?? "")}`,
                };
                const subs = Array.isArray(it?.subitens) ? it.subitens : [];
                for (const sub of subs) {
                    map[normMatKey(`subitem:${sub?.id}`)] = {
                        categoria: catNome || "Material",
                        nome:
                            String(sub?.nome ?? "").trim() ||
                            `Subitem ${String(sub?.id ?? "")}`,
                    };
                }
            }
        }

        setCache(cacheKey, map, 5 * 60_000);
        return map;
    } catch {
        return {};
    }
}

/* ======================== Fetchers básicos ======================== */

export async function listarFalecidos(): Promise<FalecidoItem[]> {
    try {
        const json = await fetchJson<any>(LISTAR_FALECIDOS, { ttlMs: 10_000 });
        if (json?.sucesso && Array.isArray(json?.dados))
            return json.dados as FalecidoItem[];
        if (Array.isArray(json)) return json as FalecidoItem[];
        return [];
    } catch {
        return [];
    }
}

export async function listarLogPorId(id: string): Promise<LogItem[]> {
    try {
        const json = await fetchJson<any>(LOG_POR_ID(id), { ttlMs: 20_000 });
        if (json?.sucesso && Array.isArray(json?.dados))
            return json.dados as LogItem[];
        if (Array.isArray(json)) return json as LogItem[];
        return [];
    } catch {
        return [];
    }
}

export async function listarAnalitico(): Promise<RegistroAnalise[]> {
    try {
        const json = await fetchJson<any>(LISTAR_ANALITICO, { ttlMs: 10_000 });
        if (json?.sucesso && Array.isArray(json?.dados))
            return json.dados as RegistroAnalise[];
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
 *
 * ✅ Correções:
 * - resolve ID como `sepultamento_id` OU `id` (para não virar "")
 * - só grava no criacaoMap se tiver ID válido (evita chave "")
 * - fallback de data inclui created_at/datahora/ultima_datahora
 * - injeta `criacao` no item para UI ordenar/filtrar
 */
export async function listarFalecidosComCriacao(): Promise<{
    lista: FalecidoComCriacao[];
    criacaoMap: Record<string, string>;
}> {
    const listaRaw = await listarFalecidos();

    const criacaoMap: Record<string, string> = {};

    const lista = (listaRaw || []).map((r: any) => {
        const id = String(r?.sepultamento_id ?? r?.id ?? "").trim();

        const criacao = String(
            r?.criacao ??
            r?.created_at ??
            r?.ultima_datahora ??
            r?.datahora ??
            ""
        ).trim();

        // evita sobrescrever tudo em criacaoMap[""]
        if (id) criacaoMap[id] = criacao;

        return {
            ...r,
            // garante consistência para o resto do app
            sepultamento_id: id || String(r?.sepultamento_id || "").trim(),
            criacao,
        } as FalecidoComCriacao;
    });

    return { lista, criacaoMap };
}
