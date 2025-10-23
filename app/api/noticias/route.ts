// src/app/api/noticias/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";



const TARGET =
    process.env.PAI_NEWS_PHP_URL ||
    "https://planoassistencialintegrado.com.br/noticias.php";
const API_KEY = process.env.PAI_PARTNERS_API_KEY || "PlanoPAI2024#";

const HOP = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "content-length",
    "host",
    "content-encoding",
]);

function copyHeaders(req: NextRequest): Headers {
    const h = new Headers();
    req.headers.forEach((v, k) => {
        const low = k.toLowerCase();
        if (!HOP.has(low)) h.set(k, v);
    });
    // exigidos pelo PHP
    h.set("X-PAI-KEY", API_KEY);
    h.set("X-Requested-With", "XMLHttpRequest");
    // evitar compressão no upstream
    h.set("accept-encoding", "identity");
    return h;
}

function targetWithSearch(req: NextRequest): string {
    const search = req.nextUrl.search; // ex.: ?list=1&id=123&_method=PUT
    return search ? `${TARGET}${search}` : TARGET;
}

async function pass(req: NextRequest, url: string): Promise<NextResponse> {
    const method = req.method.toUpperCase();
    const headers = copyHeaders(req);
    const hasBody = !["GET", "HEAD"].includes(method);
    const body = hasBody ? await req.arrayBuffer() : undefined;

    const upstream = await fetch(url, {
        method,
        headers,
        body,
        redirect: "follow",
        cache: "no-store",
    });

    const outHeaders = new Headers();
    upstream.headers.forEach((v, k) => {
        const low = k.toLowerCase();
        if (!HOP.has(low)) outHeaders.set(k, v);
    });

    outHeaders.delete("content-encoding");
    outHeaders.delete("content-length");
    outHeaders.delete("transfer-encoding");
    outHeaders.set("cache-control", "no-store");

    if (!outHeaders.get("content-type")) {
        outHeaders.set("content-type", "application/json; charset=utf-8");
    }

    return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: outHeaders,
    });
}

export async function GET(req: NextRequest) { return pass(req, targetWithSearch(req)); }
export async function POST(req: NextRequest) { return pass(req, targetWithSearch(req)); }
export async function PUT(req: NextRequest) { return pass(req, targetWithSearch(req)); }
export async function PATCH(req: NextRequest) { return pass(req, targetWithSearch(req)); }
export async function DELETE(req: NextRequest) { return pass(req, targetWithSearch(req)); }
export async function OPTIONS(req: NextRequest) { return pass(req, targetWithSearch(req)); }
export async function HEAD(req: NextRequest) { return pass(req, targetWithSearch(req)); }
