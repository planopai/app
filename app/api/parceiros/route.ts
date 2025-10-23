// src/app/api/parceiros/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";



const TARGET =
    process.env.PAI_PARTNERS_PHP_URL ||
    "https://planoassistencialintegrado.com.br/parceiros.php";
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
    "content-encoding", // filtrado no retorno
]);

function copyHeaders(req: NextRequest): Headers {
    const h = new Headers();
    req.headers.forEach((v, k) => {
        const low = k.toLowerCase();
        if (!HOP.has(low)) h.set(k, v);
    });

    // Cabeçalhos exigidos pelo PHP (usa a variável!)
    h.set("X-PAI-KEY", API_KEY);
    h.set("X-Requested-With", "XMLHttpRequest");

    // Força resposta SEM compressão no upstream
    h.set("accept-encoding", "identity");

    // Não fixe content-type aqui; deixe o fetch definir (json/multipart/etc.)
    return h;
}

// Anexa a query string original do request ao TARGET.
// Ex.: ?id=6&_method=PUT chega ao PHP.
function targetWithSearch(req: NextRequest): string {
    const search = req.nextUrl.search; // inclui o '?' se existir
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

    // Evita ERR_CONTENT_DECODING_FAILED e afins
    outHeaders.delete("content-encoding");
    outHeaders.delete("content-length");
    outHeaders.delete("transfer-encoding");
    outHeaders.set("cache-control", "no-store");

    // Garanta JSON quando o PHP não especificar
    if (!outHeaders.get("content-type")) {
        outHeaders.set("content-type", "application/json; charset=utf-8");
    }

    return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: outHeaders,
    });
}

export async function GET(req: NextRequest) {
    return pass(req, targetWithSearch(req));
}
export async function POST(req: NextRequest) {
    return pass(req, targetWithSearch(req));
}
export async function PUT(req: NextRequest) {
    return pass(req, targetWithSearch(req));
}
export async function PATCH(req: NextRequest) {
    return pass(req, targetWithSearch(req));
}
export async function DELETE(req: NextRequest) {
    return pass(req, targetWithSearch(req));
}
export async function OPTIONS(req: NextRequest) {
    return pass(req, targetWithSearch(req));
}
export async function HEAD(req: NextRequest) {
    return pass(req, targetWithSearch(req));
}
