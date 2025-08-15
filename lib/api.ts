// lib/api.ts
export async function apiFetch(input: string, init: RequestInit = {}) {
    const res = await fetch(input, {
        credentials: "include",       // <- manda PHPSESSID
        cache: "no-store",
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
    });

    if (res.status === 401 || res.status === 440) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?next=${next}`);
        // interrompe o fluxo do chamador
        return new Promise<never>(() => { });
    }
    return res;
}

export async function apiJson<T = any>(input: string, init?: RequestInit): Promise<T> {
    const r = await apiFetch(input, init);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
        const msg = (data && (data.msg || data.error)) || `Erro (${r.status})`;
        throw new Error(msg);
    }
    return data as T;
}
