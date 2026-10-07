import { applyCacheBuster } from "./versao";

// Acesso à API (materiais_gerais.php e catalogo_api.php), com cookie de sessão.

export const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
export const API_BASE = `${ENDPOINT}/materiais_gerais.php`;
export const CATALOGO_API_BASE = `${ENDPOINT}/catalogo_api.php`;

export async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(
            `Resposta inesperada (${ct || "sem content-type"}). ${txt ? `Conteúdo: ${txt.slice(0, 160)}...` : ""
                }`.trim()
        );
    }
    return (await r.json()) as T;
}

export async function apiGet<T>(qs: Record<string, string | number | boolean | undefined>) {
    const u = new URL(API_BASE, window.location.origin);
    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined) return;
        u.searchParams.set(k, String(v));
    });

    applyCacheBuster(u);

    const r = await fetch(u.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });
    return await safeJson<T>(r);
}

export async function catalogoApiGet<T>(qs: Record<string, string | number | boolean | undefined>) {
    const u = new URL(CATALOGO_API_BASE, window.location.origin);
    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined) return;
        u.searchParams.set(k, String(v));
    });

    applyCacheBuster(u);

    const r = await fetch(u.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });
    return await safeJson<T>(r);
}

export async function apiPost<T>(body: any) {
    const u = new URL(API_BASE, window.location.origin);
    applyCacheBuster(u);

    const r = await fetch(u.toString(), {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        // Content-Type já é permitido pelo CORS do materiais_gerais.php.
        // Não adicionar Expires/Pragma/Cache-Control aqui.
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    return await safeJson<T & { ok?: boolean; msg?: string; need_login?: 1 }>(r);
}
