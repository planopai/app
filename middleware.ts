import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

// Slugs protegidos (mesmos da sua lista)
const PROTECTED_SLUGS = new Set<string>([
    "inicio",
    "quadro-atendimento",
    "acompanhamento",
    "memorial",
    "obituario",
    "clube",
    "leads",
    "coroa-de-flores",
    "relatorio",
    "administrativo",
    "dashboard",
    "api",
    "atendimento",
    "login",          // remova daqui se quiser que /login fique sempre público
    "medicos",
    "mensagens",
    "noticias",
    "offline",
    "parceiros",
    "permissoes",
    "salas",
    "seguranca",
    "sorteios",
    "tela",
    "telemetria",
    "usuarios",
]);

const PUBLIC_PATHS = new Set<string>([
    "/",
    "/login",
    "/ajuda",
]);

function firstSlug(pathname: string): string {
    return pathname.split("/").filter(Boolean)[0] || "";
}

export async function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    // públicos / estáticos
    const isPublic =
        PUBLIC_PATHS.has(pathname) ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/static") ||
        pathname.startsWith("/public") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/php") ||   // proxy PHP deve ficar livre
        pathname.startsWith("/api/wp") ||
        pathname.startsWith("/api/wc") ||
        PUBLIC_FILE.test(pathname);

    const isAuthed = req.cookies.get("pai_auth")?.value === "1";

    if (pathname === "/login" && isAuthed) {
        return NextResponse.redirect(new URL("/", req.url));
    }

    if (isPublic) return NextResponse.next();

    // exige login
    if (!isAuthed) {
        const login = new URL("/login", req.url);
        const next = pathname + (search || "");
        login.searchParams.set("next", next);
        return NextResponse.redirect(login);
    }

    // checagem de permissão por slug
    const slug = firstSlug(pathname);
    if (!slug || !PROTECTED_SLUGS.has(slug)) {
        return NextResponse.next();
    }

    // repassar cookies ao proxy (IMPORTANTE)
    const cookieHeader = req.headers.get("cookie") || "";
    const origin = req.nextUrl.origin;

    // whoami
    let who: any = null;
    try {
        const r1 = await fetch(`${origin}/api/php/pai_api.php?action=whoami`, {
            headers: {
                "x-requested-with": "XMLHttpRequest",
                "cookie": cookieHeader,
            },
            cache: "no-store",
        });
        who = await r1.json();
    } catch { }

    const uid = who?.id ? Number(who.id) : 0;
    if (!uid) {
        const login = new URL("/login", req.url);
        const next = pathname + (search || "");
        login.searchParams.set("next", next);
        return NextResponse.redirect(login);
    }

    // lista permissões
    let perms: string[] = [];
    try {
        const r2 = await fetch(
            `${origin}/api/php/pai_api.php?action=list_permissions&user_id=${uid}`,
            {
                headers: {
                    "x-requested-with": "XMLHttpRequest",
                    "cookie": cookieHeader,
                },
                cache: "no-store",
            }
        );
        const j = await r2.json();
        if (Array.isArray(j)) perms = j;
    } catch { }

    const allowed = perms.includes("*") || perms.includes(slug);
    if (allowed) return NextResponse.next();

    // sem permissão → redireciona
    const to = new URL("/inicio", req.url);
    return NextResponse.redirect(to);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
