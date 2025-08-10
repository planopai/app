// app/api/php/[...path]/route.ts
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TARGET_BASE = "https://planoassistencialintegrado.com.br";

/** Headers que não devem ser repassados ao upstream */
const HOP_BY_HOP = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "accept-encoding", // evita problemas de decodificação
    "content-length",  // será recalculado
    "host",
]);

function buildUpstreamUrl(base: string, parts?: string[], search?: URLSearchParams) {
    const path = "/" + (parts?.join("/") ?? "");
    const url = new URL(base);
    // Garante concatenação correta de path
    url.pathname = new URL(path, base).pathname;
    if (search) {
        for (const [k, v] of search) url.searchParams.set(k, v);
    }
    return url;
}

function parseCookieHeader(cookieHeader: string | null) {
    const map = new Map<string, string>();
    if (!cookieHeader) return map;
    cookieHeader.split(/; */).forEach((p) => {
        if (!p) return;
        const [k, ...rest] = p.split("=");
        const v = rest.join("=") ?? "";
        map.set(k.trim(), decodeURIComponent(v));
    });
    return map;
}

function serializeCookies(cookies: Array<[string, string]>) {
    return cookies.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
}

/**
 * Reescreve cookies para o upstream:
 * - Remove cookies internos (pai_auth, php_session)
 * - Se existir php_session no cliente, envia como PHPSESSID para o PHP
 */
function buildUpstreamCookieHeader(req: NextRequest): string | null {
    const jar = parseCookieHeader(req.headers.get("cookie"));
    const forward: Array<[string, string]> = [];
    const phpSess = jar.get("php_session");

    for (const [k, v] of jar) {
        if (k === "pai_auth" || k === "php_session") continue; // não precisa no WordPress/PHP
        forward.push([k, v]);
    }
    if (phpSess) forward.push(["PHPSESSID", phpSess]);

    return forward.length ? serializeCookies(forward) : null;
}

function buildUpstreamHeaders(req: NextRequest) {
    const headers = new Headers();
    // Copia somente o que é seguro/útil
    req.headers.forEach((v, k) => {
        const key = k.toLowerCase();
        if (!HOP_BY_HOP.has(key)) headers.set(key, v);
    });
    // Garante alguns cabeçalhos úteis
    headers.set("x-requested-with", "XMLHttpRequest");
    // Content-Type: apenas se existir no request original
    const ct = req.headers.get("content-type");
    if (ct) headers.set("content-type", ct);

    // 🔁 Cookies reescritos para o upstream (php_session -> PHPSESSID)
    const cooked = buildUpstreamCookieHeader(req);
    if (cooked) headers.set("cookie", cooked);
    else headers.delete("cookie");

    return headers;
}

async function handler(
    req: NextRequest,
    { params }: { params: { path?: string[] } }
) {
    // Monta URL final do upstream
    const upstreamUrl = buildUpstreamUrl(
        TARGET_BASE,
        params.path,
        req.nextUrl.searchParams
    );

    // Repassa headers (sem hop-by-hop) + cookie reescrito
    const headers = buildUpstreamHeaders(req);

    // Só envia body para métodos com corpo
    const hasBody = !["GET", "HEAD"].includes(req.method.toUpperCase());
    const body = hasBody ? await req.arrayBuffer() : undefined;

    const init: RequestInit = {
        method: req.method,
        headers,
        body,
        // "follow" lida com redirects do WP (ex.: trailing slash). Para capturar Set-Cookie
        // em redirects, preferir "manual" e tratar Location, mas para avisos/informativo não é necessário.
        redirect: "follow",
        cache: "no-store",
    };

    const upstreamResp = await fetch(upstreamUrl.toString(), init);

    // Ajusta headers de saída (cliente)
    const out = new Headers(upstreamResp.headers);
    // Remove encodings e length (serão recalculados pelo Next)
    out.delete("content-encoding");
    out.delete("content-length");
    out.delete("transfer-encoding");
    out.delete("connection");
    // Política de cache
    out.set("Cache-Control", "no-store");

    // ❗ Opcional: se o upstream devolver um PHPSESSID novo, podemos espelhar em "php_session"
    const setCookie = upstreamResp.headers.get("set-cookie");
    if (setCookie) {
        const m = setCookie.match(/PHPSESSID=([^;]+)/i);
        if (m && m[1]) {
            const isProd = process.env.NODE_ENV === "production";
            const ours =
                `php_session=${encodeURIComponent(m[1])}; Path=/; HttpOnly; SameSite=Lax;` +
                (isProd ? " Secure;" : "");
            // Anexa nosso cookie sem remover o do upstream
            out.append("set-cookie", ours);
        }
    }

    // Retorna o corpo tal como veio do upstream
    return new Response(upstreamResp.body, {
        status: upstreamResp.status,
        headers: out,
    });
}

export {
    handler as GET,
    handler as POST,
    handler as PUT,
    handler as PATCH,
    handler as DELETE,
    handler as OPTIONS,
    handler as HEAD,
};
