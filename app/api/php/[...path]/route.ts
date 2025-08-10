// app/api/php/[...path]/route.ts  (ou src/app/...)
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TARGET_BASE = "https://planoassistencialintegrado.com.br";

async function handler(
    req: NextRequest,
    { params }: { params: { path?: string[] } }
) {
    const targetPath = "/" + (params.path?.join("/") ?? "");
    const url = new URL(TARGET_BASE + targetPath);
    // replica querystring
    for (const [k, v] of req.nextUrl.searchParams) url.searchParams.set(k, v);

    // monta headers sem undefined
    const headers = new Headers();
    const ct = req.headers.get("content-type");
    if (ct) headers.set("Content-Type", ct);
    headers.set("X-Requested-With", "XMLHttpRequest");
    const cookie = req.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);

    const init: RequestInit = {
        method: req.method,
        headers,
        body:
            req.method === "GET" || req.method === "HEAD"
                ? undefined
                : await req.arrayBuffer(),
        redirect: "manual",
    };

    const resp = await fetch(url.toString(), init);

    // ajusta headers de saída (evita ERR_CONTENT_DECODING_FAILED)
    const out = new Headers(resp.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    out.set("Cache-Control", "no-store");

    return new Response(resp.body, { status: resp.status, headers: out });
}

export {
    handler as GET,
    handler as POST,
    handler as PUT,
    handler as PATCH,
    handler as DELETE,
    handler as OPTIONS,
};
