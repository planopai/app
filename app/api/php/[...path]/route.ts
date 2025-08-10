// src/app/api/php/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";          // garante Node runtime (melhor p/ cookies)
export const dynamic = "force-dynamic";   // nunca cachear
export const revalidate = 0;

const PHP_ORIGIN = process.env.PHP_ORIGIN || "https://planoassistencialintegrado.com.br";

// Encaminha para https://planoassistencialintegrado.com.br/<path>?<query>
function buildTargetUrl(req: NextRequest, pathParam: string[]) {
    const path = Array.isArray(pathParam) ? pathParam.join("/") : "";
    const qs = req.nextUrl.search || "";
    return `${PHP_ORIGIN}/${path}${qs}`;
}

// Apenas cabeçalhos úteis p/ upstream (não repasse Host, Content-Length etc.)
function pickForwardHeaders(req: NextRequest) {
    const out = new Headers();
    const h = req.headers;
    const ct = h.get("content-type");
    const auth = h.get("authorization");
    const cookie = h.get("cookie");
    const xrw = h.get("x-requested-with");

    if (ct) out.set("content-type", ct);
    if (auth) out.set("authorization", auth);
    if (cookie) out.set("cookie", cookie);
    if (xrw) out.set("x-requested-with", xrw);

    // Opcional: identifique que vem do proxy
    out.set("x-proxy-from", "pai.app");
    return out;
}

// Precisa repassar TODOS os set-cookie (múltiplos)
function applyUpstreamHeaders(upstream: Response, res: NextResponse) {
    upstream.headers.forEach((value, key) => {
        const k = key.toLowerCase();
        if (k === "set-cookie") {
            // pode haver vários set-cookie; use append
            res.headers.append("set-cookie", value);
        } else {
            // evite repassar transfer-encoding/connection/keep-alive
            if (!["transfer-encoding", "connection"].includes(k)) {
                res.headers.set(key, value);
            }
        }
    });
}

async function proxy(method: string, req: NextRequest, ctx: { params: { path: string[] } }) {
    const targetUrl = buildTargetUrl(req, ctx.params.path);
    const headers = pickForwardHeaders(req);

    // Corpo: só métodos com body
    let body: BodyInit | undefined = undefined;
    if (!["GET", "HEAD"].includes(method)) {
        const ab = await req.arrayBuffer(); // preserva JSON/RAW
        body = ab.byteLength ? Buffer.from(ab) : undefined;
    }

    const upstream = await fetch(targetUrl, {
        method,
        headers,
        body,
        // importante: não usar "credentials" aqui; no server o cookie vai no header já
        redirect: "manual",
    });

    // Stream da resposta + headers (incluindo set-cookie)
    const res = new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
    });
    applyUpstreamHeaders(upstream, res);
    return res;
}

// Handlers HTTP
export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
    return proxy("GET", req, ctx);
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
    return proxy("POST", req, ctx);
}
export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
    return proxy("PUT", req, ctx);
}
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
    return proxy("PATCH", req, ctx);
}
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
    return proxy("DELETE", req, ctx);
}
// Se algum PHP checar preflight (raro neste cenário), respondemos também:
export async function OPTIONS() {
    return NextResponse.json({}, { status: 204 });
}
