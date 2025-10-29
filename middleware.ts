import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Arquivos estáticos
const PUBLIC_FILE = /\.(.*)$/;

// Slugs protegidos (devem bater com 'permissoes.pagina' no MySQL)
// ⚠️ Removido 'inicio' (sua Home está em "/")
const PROTECTED_SLUGS = new Set<string>([
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
    // "login", // NÃO proteger login
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

// Rotas livres (além de estáticos e /api/php)
const PUBLIC_PATHS = new Set<string>([
    "/",
    "/login",
    "/ajuda",
]);

function firstSlug(pathname: string): string {
    return pathname.split("/").filter(Boolean)[0] || "";
}

function pickFirstAllowedPath(perms: string[]): string {
    if (perms.includes("*")) return "/";
    for (const slug of perms) {
        // Considera apenas slugs conhecidos/protegidos
        if (PROTECTED_SLUGS.has(slug)) return `/${slug}`;
    }
    // fallback seguro
    return "/";
}

export async function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    // /login deve ser sempre público
    if (pathname === "/login") {
        return NextResponse.next();
    }

    // Públicos / estáticos
    const isPublic =
        PUBLIC_PATHS.has(pathname) ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/static") ||
        pathname.startsWith("/public") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/php") || // proxy PHP deve ficar livre
        pathname.startsWith("/api/wp") ||
        pathname.startsWith("/api/wc") ||
        PUBLIC_FILE.test(pathname);

    const isAuthed = req.cookies.get("pai_auth")?.value === "1";

    // Já logado indo para /login → manda para local seguro
    if (pathname === "/login" && isAuthed) {
        return NextResponse.redirect(new URL("/", req.url));
    }

    // Rotas públicas passam
    if (isPublic) return NextResponse.next();

    // Exige login
    if (!isAuthed) {
        const login = new URL("/login", req.url);
        const next = pathname + (search || "");
        login.searchParams.set("next", next);
        return NextResponse.redirect(login);
    }

    // Checagem por slug
    const slug = firstSlug(pathname);
    if (!slug || !PROTECTED_SLUGS.has(slug)) {
        return NextResponse.next();
    }

    // Repassa cookies ao proxy (importante para PHP enxergar sessão)
    const cookieHeader = req.headers.get("cookie") || "";
    const origin = req.nextUrl.origin;

    // 1) whoami → descobre uid no backend PHP
    let who: any = null;
    try {
        const r1 = await fetch(`${origin}/api/php/pai_api.php?action=whoami`, {
            headers: {
                "x-requested-with": "XMLHttpRequest",
                cookie: cookieHeader,
            },
            cache: "no-store",
        });
        const t1 = await r1.text();
        try { who = JSON.parse(t1.replace(/^\uFEFF/, "").trim()); } catch { who = null; }
    } catch {
        // erro de rede → trate como não logado
    }

    const uid = who?.id ? Number(who.id) : 0;
    if (!uid) {
        // sessão morreu no backend → manda pro login preservando o destino
        const login = new URL("/login", req.url);
        const next = pathname + (search || "");
        login.searchParams.set("next", next);
        return NextResponse.redirect(login);
    }

    // 2) lista permissions do usuário
    let perms: string[] = [];
    try {
        const r2 = await fetch(
            `${origin}/api/php/pai_api.php?action=list_permissions&user_id=${uid}`,
            {
                headers: {
                    "x-requested-with": "XMLHttpRequest",
                    cookie: cookieHeader,
                },
                cache: "no-store",
            }
        );
        const t2 = await r2.text();
        try {
            const j = JSON.parse(t2.replace(/^\uFEFF/, "").trim());
            if (Array.isArray(j)) perms = j;
        } catch {
            // se não veio JSON, mantém perms = []
        }
    } catch {
        // erro de rede → mantém perms = []
    }

    const allowed = perms.includes("*") || perms.includes(slug);
    if (allowed) return NextResponse.next();

    // Sem permissão → redireciona para uma página segura
    const to = new URL(pickFirstAllowedPath(perms), req.url);
    return NextResponse.redirect(to);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
