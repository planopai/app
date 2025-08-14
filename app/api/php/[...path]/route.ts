// app/api/php/[...path]/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TARGET_BASE = "https://planoassistencialintegrado.com.br";

const HOP_BY_HOP = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "accept-encoding",
    "content-length",
    "host",
]);

function buildUpstreamUrl(base: string, parts?: string[], search?: URLSearchParams) {
    const path = "/" + (parts?.join("/") ?? "");
    const url = new URL(base);
    url.pathname = new URL(path, base).pathname;
    if (search) for (const [k, v] of search) url.searchParams.set(k, v);
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

function buildUpstreamCookieHeader(req: NextRequest): string | null {
    const jar = parseCookieHeader(req.headers.get("cookie"));
    const forward: Array<[string, string]> = [];
    const phpSess = jar.get("php_session");

    for (const [k, v] of jar) {
        if (k === "pai_auth" || k === "php_session") continue;
        forward.push([k, v]);
    }
    if (phpSess) forward.push(["PHPSESSID", phpSess]);

    return forward.length ? serializeCookies(forward) : null;
}

function buildUpstreamHeaders(req: NextRequest) {
    const headers = new Headers();
    req.headers.forEach((v, k) => {
        const key = k.toLowerCase();
        if (!HOP_BY_HOP.has(key)) headers.set(key, v);
    });

    headers.set("x-requested-with", "XMLHttpRequest");
    const ct = req.headers.get("content-type");
    if (ct) headers.set("content-type", ct);

    // Preserve host/proto e encamine o IP se já existir
    headers.set("x-forwarded-host", req.headers.get("host") || "");
    headers.set("x-forwarded-proto", "https");
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) headers.set("x-forwarded-for", fwd);

    const cooked = buildUpstreamCookieHeader(req);
    if (cooked) headers.set("cookie", cooked);
    else headers.delete("cookie");

    return headers;
}

function extractPhpSessFromSetCookie(setCookieAll: string | null): string | null {
    if (!setCookieAll) return null;
    const m = setCookieAll.match(/(?:^|,)\s*PHPSESSID=([^;]+)/i);
    return m?.[1] || null;
}

async function fetchWithRedirectCookie(
    url: string,
    init: RequestInit,
    abortMs = 15000
): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), abortMs);
    try {
        const r1 = await fetch(url, { ...init, redirect: "manual", signal: ctrl.signal });
        if (![301, 302, 303, 307, 308].includes(r1.status)) return r1;

        const loc = r1.headers.get("location");
        if (!loc) return r1;

        const r2 = await fetch(new URL(loc, url).toString(), {
            ...init,
            redirect: "follow",
            signal: ctrl.signal,
        });

        const set1 = r1.headers.get("set-cookie");
        const set2 = r2.headers.get("set-cookie");
        const combined = [set1, set2].filter(Boolean).join(", ");
        const outHeaders = new Headers(r2.headers);
        if (combined) outHeaders.set("set-cookie", combined);
        return new Response(r2.body, { status: r2.status, statusText: r2.statusText, headers: outHeaders });
    } finally {
        clearTimeout(t);
    }
}

async function handler(
    req: NextRequest,
    { params }: { params: { path?: string[] } }
) {
    const upstreamUrl = buildUpstreamUrl(TARGET_BASE, params.path, req.nextUrl.searchParams);
    const headers = buildUpstreamHeaders(req);
    const hasBody = !["GET", "HEAD"].includes(req.method.toUpperCase());
    const body = hasBody ? await req.arrayBuffer() : undefined;

    const init: RequestInit = {
        method: req.method,
        headers,
        body,
        cache: "no-store",
    };

    const upstreamResp = await fetchWithRedirectCookie(upstreamUrl.toString(), init);

    const outHeaders = new Headers();
    upstreamResp.headers.forEach((v, k) => {
        const key = k.toLowerCase();
        if (!HOP_BY_HOP.has(key)) outHeaders.set(k, v);
    });
    outHeaders.delete("content-encoding");
    outHeaders.delete("content-length");
    outHeaders.delete("transfer-encoding");
    outHeaders.delete("connection");
    outHeaders.set("Cache-Control", "no-store");

    const res = new NextResponse(upstreamResp.body, {
        status: upstreamResp.status,
        headers: outHeaders,
    });

    const setCookieAll = upstreamResp.headers.get("set-cookie");
    const phpSess = extractPhpSessFromSetCookie(setCookieAll);
    if (phpSess) {
        const isProd = process.env.NODE_ENV === "production";
        res.cookies.set({
            name: "php_session",
            value: phpSess,
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: isProd,
        });
    }

    return res;
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
