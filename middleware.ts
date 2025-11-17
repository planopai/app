import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Arquivos estáticos (css, js, imagens etc.)
const PUBLIC_FILE = /\.(.*)$/;

// Slugs protegidos (devem bater com 'permissoes.pagina' no MySQL)
// ⚠️ Não inclua 'inicio' aqui; sua Home está em "/"
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
// ⚠️ "/" NÃO aparece aqui, para que a Home exija login
const PUBLIC_PATHS = new Set<string>([
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

    // Arquivos estáticos e APIs que SEMPRE passam
    const isAssetOrApiPublic =
        pathname.startsWith("/_next") ||
        pathname.startsWith("/static") ||
        pathname.startsWith("/public") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/php") || // PHP fica livre; ele mesmo valida a sessão
        pathname.startsWith("/api/wp") ||
        pathname.startsWith("/api/wc") ||
        PUBLIC_FILE.test(pathname);

    if (isAssetOrApiPublic) {
        return NextResponse.next();
    }

    // Páginas realmente públicas (ajuda, etc.), exceto /login que tratamos separado
    if (pathname !== "/login" && PUBLIC_PATHS.has(pathname)) {
        return NextResponse.next();
    }

    const hasAuthCookie = req.cookies.get("pai_auth")?.value === "1";
    const cookieHeader = req.headers.get("cookie") || "";
    const origin = req.nextUrl.origin;

    // uid vindo do PHP (0 = não logado / sessão inválida)
    let uid = 0;

    if (hasAuthCookie) {
        try {
            const r1 = await fetch(`${origin}/api/php/pai_api.php?action=whoami`, {
                headers: {
                    "x-requested-with": "XMLHttpRequest",
                    cookie: cookieHeader,
                },
                cache: "no-store",
            });
            const t1 = await r1.text();
            let who: any = null;
            try {
                who = JSON.parse(t1.replace(/^\uFEFF/, "").trim());
            } catch {
                who = null;
            }
            uid = who?.id ? Number(who.id) : 0;
        } catch {
            // Falha de rede → trata como não autenticado
            uid = 0;
        }
    }

    // --- Tratamento da tela de login ---
    if (pathname === "/login") {
        // Se PHP reconhece o usuário, manda para Home (ou outra segura)
        if (uid > 0) {
            return NextResponse.redirect(new URL("/", req.url));
        }

        // Não está logado de verdade → permite ver o login
        const res = NextResponse.next();
        // se existir cookie "fantasma", apaga
        if (hasAuthCookie) {
            res.cookies.set("pai_auth", "0", { path: "/", maxAge: 0 });
        }
        return res;
    }

    // --- Todas as OUTRAS rotas privadas precisam de uid válido ---
    if (!uid) {
        const loginUrl = new URL("/login", req.url);
        const nextParam = pathname + (search || "");
        loginUrl.searchParams.set("next", nextParam);

        const res = NextResponse.redirect(loginUrl);
        // garante que cookie de auth antigo não fique pendurado
        if (hasAuthCookie) {
            res.cookies.set("pai_auth", "0", { path: "/", maxAge: 0 });
        }
        return res;
    }

    // A partir daqui: usuário está autenticado no PHP (uid > 0)

    const slug = firstSlug(pathname);

    // Se não tiver slug protegido (ex.: "/", páginas não listadas), basta estar logado
    if (!slug || !PROTECTED_SLUGS.has(slug)) {
        return NextResponse.next();
    }

    // --- Checagem de permissões por slug ---
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
            // mantém perms = []
        }
    } catch {
        // mantém perms = []
    }

    const allowed = perms.includes("*") || perms.includes(slug);
    if (allowed) return NextResponse.next();

    // Sem permissão → redireciona para uma página segura permitida
    const to = new URL(pickFirstAllowedPath(perms), req.url);
    return NextResponse.redirect(to);
}

// Onde o middleware roda
export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
