/**
 * Chamadas ao os_principal.php e leitura de valores digitados, comuns às telas da OS (16/10/2026).
 * Antes cada tela tinha a sua cópia (Financeiro, Minhas OS, Relatório, OS do atendimento).
 */
export const API_BASE_OS = "https://api.planoassistencialintegrado.com.br";
export const OS_API = `${API_BASE_OS}/os_principal.php`;
export const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

/** Busca JSON com o cookie da sessão; 401 leva ao login; erro do servidor vira Error (com .status). */
export async function apiJson(url: string, init?: RequestInit) {
    const res = await fetch(url, { credentials: "include", cache: "no-store", ...init });
    const texto = await res.text();
    let json: any = null;
    try {
        json = texto ? JSON.parse(texto) : null;
    } catch {
        json = null;
    }
    if (res.status === 401 || json?.need_login) {
        window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }
    if (!res.ok || json?.erro || json?.sucesso === false) {
        const err: any = new Error(json?.msg || `Falha na requisição (${res.status}).`);
        err.status = res.status;
        throw err;
    }
    // Resposta que não é JSON (aviso do PHP antes do JSON, por exemplo): mostra o começo do texto.
    if (json === null) throw new Error(`Resposta inválida do servidor: ${texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "vazia"}`);
    return json;
}

export function osGet(acao: string, params: Record<string, any> = {}) {
    const u = new URL(OS_API);
    u.searchParams.set(acao, "1");
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && u.searchParams.set(k, String(v)));
    u.searchParams.set("_", String(Date.now()));
    return apiJson(u.toString());
}

/** POST. manterVazios: envia também os campos vazios (o Financeiro usa para limpar observação, por exemplo). */
export function osPost(acao: string, params: Record<string, any> = {}, manterVazios = false) {
    const body = new URLSearchParams({ [acao]: "1" });
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && (manterVazios || v !== "") && body.set(k, String(v)));
    return apiJson(OS_API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
}

/**
 * Valor digitado em reais → número. Aceita "1.500,00", "1500,5", "1.500" (milhar) e "1500.50" (ponto decimal).
 * Antes: "1.500,00" no recebimento virava 1,50; "1500.50" no Concluir venda virava 150.050; "1.500" nos itens virava 1,50.
 */
export function valorDigitado(s: any): number {
    const t = String(s ?? "").trim().replace(/\s|R\$/g, "").replace(/[^\d,.-]/g, "");
    if (!t) return 0;
    let n: string;
    if (t.includes(",")) n = t.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, "");
    else n = t;
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
}
