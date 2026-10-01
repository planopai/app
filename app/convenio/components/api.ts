/** Endereços e chamadas de API compartilhados pela tela de convênios (mesmo padrão: cookie de sessão). */
export const API_BASE = "https://api.planoassistencialintegrado.com.br";
export const CONVENIO_API = `${API_BASE}/convenio.php`;
export const ESTOQUE_API = `${API_BASE}/materiais_gerais.php`;
export const OS_API = `${API_BASE}/os_principal.php`;
export const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

export async function apiJson(url: string, init?: RequestInit) {
    const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        ...init,
    });

    const json = await res.json().catch(() => null);

    if (res.status === 401 || json?.need_login) {
        window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }

    if (!res.ok || json?.erro) {
        const err: any = new Error(json?.msg || `Falha na requisição (${res.status}).`);
        err.status = res.status;
        err.code = json?.code;
        throw err;
    }

    return json;
}

/** Módulo da OS: GET ?<acao>=1&params */
export function osGet(acao: string, params: Record<string, any> = {}) {
    const u = new URL(OS_API);
    u.searchParams.set(acao, "1");
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.searchParams.set(k, String(v)));
    u.searchParams.set("_", String(Date.now()));
    return apiJson(u.toString());
}

/** Módulo da OS: POST em formulário (o back-end lê $_REQUEST). */
export function osPost(acao: string, params: Record<string, any> = {}) {
    const body = new URLSearchParams({ [acao]: "1" });
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && body.set(k, String(v)));
    return apiJson(OS_API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
}
