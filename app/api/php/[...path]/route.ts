// src/app/api/php/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PHP_ORIGIN = process.env.PHP_ORIGIN || "https://planoassistencialintegrado.com.br";

function buildTargetUrl(req: NextRequest, pathParam: string[]) {
    const path = (pathParam ?? []).join("/");
    const qs = req.nextUrl.search || "";
    return `${PHP_ORIGIN}/${path}${qs}`;
}

function pickForwardHeaders(req: NextRequest) {
    const out = new Headers();
    const h = req.headers;

    // Encaminhe o mínimo necessário
    for (const k of ["content-type", "authorization", "cookie", "x-requested-with", "referer"]) {
        const v = h.get(k);
        if (v) out.set(k, v);
    }

    // **IMPORTANTE**: peça ao upstream para NÃO comprimir
    out.set("accept-encoding", "identity");

    // Identificação opcional
    out.set("x-proxy-from", "pai");
    return out;
}

function applyUpstreamHeaders(upstream: Response, res: NextResponse) {
    upstream.headers.forEach((value, key) => {
        const k = key.toLowerCase();

        // Não repasse headers que quebram a resposta no proxy
        if (k === "content-encoding") return;   // <- evita o ERR_CONTENT_DECODING_FAILED
        if (k === "content-length") return;     // body pode ter mudado
        if (k === "transfer-encoding") return;
        if (k === "connection") return;

        if (k === "set-cookie") res.headers.append("set-cookie", value);
        else res.headers.set(key, value);
    });

    // Garanta um Content-Type se o upstream não mandou
    if (!res.headers.get("content-type")) {
        const ct = upstream.headers.get("content-type") || "application/octet-stream";
        res.headers.set("content-type", ct);
    }
}

async function proxy(method: string, req: NextRequest, ctx: { params: { path: string[] } }) {
    const targetUrl = buildTargetUrl(req, ctx.params.path);
    const headers = pickForwardHeaders(req);

    let body: BodyInit | undefined = undefined;
    if (!["GET", "HEAD"].includes(method)) {
        const ab = await req.arrayBuffer();
        body = ab.byteLength ? Buffer.from(ab) : undefined;

        // NUNCA envie content-length manual aqui; deixe o fetch calcular
        headers.delete("content-length");
    }

    const upstream = await fetch(targetUrl, {
        method,
        headers,
        body,
        redirect: "manual",
        // Garantir que nada de cache atrapalhe
        cache: "no-store",
    });

    const res = new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
    });

    applyUpstreamHeaders(upstream, res);
    return res;
}

export const GET = (req: NextRequest, ctx: any) => proxy("GET", req, ctx);
export const POST = (req: NextRequest, ctx: any) => proxy("POST", req, ctx);
export const PUT = (req: NextRequest, ctx: any) => proxy("PUT", req, ctx);
export const PATCH = (req: NextRequest, ctx: any) => proxy("PATCH", req, ctx);
export const DELETE = (req: NextRequest, ctx: any) => proxy("DELETE", req, ctx);
export const OPTIONS = async () => NextResponse.json({}, { status: 204 });
