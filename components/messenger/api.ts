/**
 * Chamadas ao back-end do Messenger e da barra personalizável.
 * Mesmo padrão das telas do app: apiJson com cookie de sessão; 401 / need_login → login.
 */
export const API_BASE = "https://api.planoassistencialintegrado.com.br";
export const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";
export const MESSENGER_API = `${API_BASE}/messenger.php`;
export const BARRA_API = `${API_BASE}/barra_atalhos.php`;

/**
 * `redirecionar = false`: para o menu e os contadores, que rodam em todas as telas —
 * sem sessão, só falha em silêncio (quem leva ao login é a tela aberta).
 */
export async function apiJson(url: string, init?: RequestInit, redirecionar = true) {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const json = await res.json().catch(() => null);
    if (res.status === 401 || json?.need_login) {
        if (redirecionar) window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro) {
        const e: any = new Error(json?.msg || `Falha na requisição (${res.status}).`);
        e.detalhe = json;
        e.status = res.status;
        throw e;
    }
    return json;
}

function urlCom(base: string, acao: string, params: Record<string, any> = {}) {
    const u = new URL(base);
    u.searchParams.set("action", acao);
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.searchParams.set(k, String(v)));
    u.searchParams.set("_", String(Date.now()));
    return u.toString();
}

/** GET no messenger.php — devolve `dados`. */
export async function msgGet<T = any>(acao: string, params: Record<string, any> = {}, redirecionar = true): Promise<T> {
    const j = await apiJson(urlCom(MESSENGER_API, acao, params), undefined, redirecionar);
    return j.dados as T;
}

/** POST (JSON) no messenger.php — devolve a resposta inteira ({ erro, msg, dados }). */
export async function msgPost(acao: string, corpo: Record<string, any> = {}) {
    return apiJson(`${MESSENGER_API}?action=${encodeURIComponent(acao)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
    });
}

export async function barraGet<T = any>(acao: string, params: Record<string, any> = {}, redirecionar = true): Promise<T> {
    const j = await apiJson(urlCom(BARRA_API, acao, params), undefined, redirecionar);
    return j.dados as T;
}

export async function barraPost(acao: string, corpo: Record<string, any> = {}) {
    return apiJson(`${BARRA_API}?action=${encodeURIComponent(acao)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
    });
}

/** Envia um arquivo ao R2: pede o link assinado e faz o PUT direto. Devolve a chave. */
export async function enviarArquivo(arquivo: Blob, mime: string, finalidade: "arquivo" | "miniatura" = "arquivo"): Promise<string> {
    const r = await msgPost("upload_url", { mime, tamanho_bytes: arquivo.size, finalidade });
    const d = r.dados;
    const put = await fetch(d.url_envio, { method: "PUT", headers: d.cabecalhos, body: arquivo });
    if (!put.ok) throw new Error(`Falha ao enviar o arquivo (${put.status}).`);
    return d.chave as string;
}

export function novoUuid(): string {
    if (typeof crypto !== "undefined" && (crypto as any).randomUUID) return (crypto as any).randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}
