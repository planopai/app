"use client";
import { FalecidoItem, LogItem, RegistroAnalise } from "./TiposHistorico";

/* ======================== Endpoints (iguais ao código grande) ======================== */

export const LISTAR_FALECIDOS =
    "/api/php/historico_sepultamentos.php?listar_falecidos=1";

export const LISTAR_ANALITICO =
    "/api/php/informativo.php?listar=1";

export const LOG_POR_ID = (id: string) =>
    `/api/php/historico_sepultamentos.php?log=1&id=${encodeURIComponent(id)}`;

/* ======================== Helper ======================== */

async function fetchJson<T = any>(url: string): Promise<T> {
    // evita cache agressivo em produção (Vercel)
    const res = await fetch(`${url}&_nocache=${Date.now()}`, { cache: "no-store" });
    return res.json();
}

/* ======================== Fetchers ======================== */

export async function listarFalecidos(): Promise<FalecidoItem[]> {
    try {
        const json = await fetchJson<any>(LISTAR_FALECIDOS);
        // Backend pode retornar {sucesso, dados: []} ou [] diretamente
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
