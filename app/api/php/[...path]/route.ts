// app/api/php/[...path]/route.ts
import type { NextRequest } from "next/server";

const TARGET_BASE = "https://planoassistencialintegrado.com.br"; // PHP está AQUI
export const dynamic = "force-dynamic"; // evita cache do Next

function buildTargetUrl(req: NextRequest, pathSegs?: string[]) {
    const path = pathSegs && pathSegs.length ? "/" + pathSegs.join("/") : "";
    const url = new URL(TARGET_BASE + path);
    // repassa os query params
    req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
    return url.toString();
}

async function handler(req: NextRequest, ctx: { params: { path?: string[] } }) {
    const target = buildTargetUrl(req, ctx.params.path);

    // Monte headers sem colocar undefined
    const fwd = new Headers();
    fwd.set("X-Requested-With", "XMLHttpRequest");
    const ct = req.headers.get("content-type");
    if (ct) fwd.set("Content-Type", ct);
    const cookie = req.headers.get("cookie");
    if (cookie) fwd.set("cookie", cookie);
    const auth = req.headers.get("authorization");
    if (auth) fwd.set("authorization", auth);

    const isBodyless = req.method === "GET" || req.method === "HEAD";
    const init: RequestInit = {
        method: req.method,
        headers: fwd,
        body: isBodyless ? undefined : await req.arrayBuffer(),
        // estes dois campos não fazem diferença no fetch do servidor do Next,
        // mas deixo por clareza
        redirect: "manual",
    };

    const resp = await fetch(target, init);

    // Copie headers da resposta, mas remova os que quebram no proxy
    const h = new Headers(resp.headers);
    h.delete("content-encoding");
    h.delete("transfer-encoding");
    // Opcional: permitir uso desse endpoint via browser sem CORS
    h.set("Access-Control-Allow-Origin", "*");

    return new Response(resp.body, { status: resp.status, headers: h });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
