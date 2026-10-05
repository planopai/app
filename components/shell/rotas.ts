import { ROTAS_EXISTENTES } from "@/lib/rotas-existentes";

/** "/os/[id]" casa com "/os/123"; "[...x]" casa com 1 ou mais trechos; "[[...x]]" com 0 ou mais. */
function casa(padrao: string, caminho: string): boolean {
    if (!padrao.includes("[")) return padrao === caminho;
    const p = padrao.split("/").filter(Boolean);
    const c = caminho.split("/").filter(Boolean);
    for (let i = 0; i < p.length; i++) {
        const seg = p[i];
        if (/^\[\[\.\.\./.test(seg)) return true;
        if (/^\[\.\.\./.test(seg)) return c.length > i;
        if (i >= c.length) return false;
        if (!/^\[.+\]$/.test(seg) && seg !== c[i]) return false;
    }
    return p.length === c.length;
}

/**
 * A tela existe em app/? Usa a lista gerada no build. Distingue maiúscula de minúscula (como a Vercel).
 * Sem a lista (null), assume que existe: nada é escondido.
 */
export function rotaExiste(href: string): boolean {
    if (ROTAS_EXISTENTES === null) return true;
    if (!href || !href.startsWith("/")) return true; // link externo ou âncora
    const caminho = href.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
    if (caminho === "/") return ROTAS_EXISTENTES.includes("/");
    return ROTAS_EXISTENTES.some((r) => casa(r, caminho));
}
