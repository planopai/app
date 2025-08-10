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

    // Repassa headers (sem hop-by-hop)
    const headers = buildUpstreamHeaders(req);

    // Só envia body para métodos com corpo
    const hasBody = !["GET", "HEAD"].includes(req.method.toUpperCase());
    const body = hasBody ? await req.arrayBuffer() : undefined;

    const init: RequestInit = {
        method: req.method,
        headers,
        body,
        // "follow" resolve redirecionamentos no servidor
        redirect: "follow",
        // Evita cache no lado do servidor
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
