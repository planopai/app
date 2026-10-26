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
// ⚠️ "/" NÃO aparece aqui; a Home exige login
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
        if (PROTECTED_SLUGS.has(slug)) return `/${slug}`;
    }
    return "/";
}

export async function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    // 1) Arquivos estáticos e APIs PHP/WP/WC ficam sempre livres
    const isAssetOrApiPublic =
        pathname.startsWith("/_next") ||
        pathname.startsWith("/static") ||
        pathname.startsWith("/public") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/php") || // proxy PHP deve ficar livre
        pathname.startsWith("/api/wp") ||
        pathname.startsWith("/api/wc") ||
        PUBLIC_FILE.test(pathname);

    if (isAssetOrApiPublic) {
        return NextResponse.next();
    }

    // 2) Páginas públicas (exceto /login, que tratamos mais abaixo)
    if (pathname !== "/login" && PUBLIC_PATHS.has(pathname)) {
        return NextResponse.next();
    }

    const origin = req.nextUrl.origin;
    const cookieHeader = req.headers.get("cookie") || "";
    const hasAuthCookie = req.cookies.get("pai_auth")?.value === "1";

    // Helper para redirecionar ao login limpando cookie "fantasma"
    const redirectToLogin = () => {
        const loginUrl = new URL("/login", req.url);
        const nextParam = pathname + (search || "");
        loginUrl.searchParams.set("next", nextParam);

        const res = NextResponse.redirect(loginUrl);
        if (hasAuthCookie) {
            // zera o cookie para não ficar estado "meio logado"
            res.cookies.set("pai_auth", "0", { path: "/", maxAge: 0 });
        }
        return res;
    };

    // Função para consultar whoami no PHP
    async function fetchWhoami() {
        if (!hasAuthCookie) return { uid: 0, userName: "" };

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

            const uid = who?.id ? Number(who.id) : 0;
            // ajuste os campos abaixo conforme o que o PHP retorna
            const userName =
                (who?.nome ?? who?.name ?? who?.usuario ?? "").toString().trim();

            return { uid, userName };
        } catch {
            return { uid: 0, userName: "" };
        }
    }

    // 3) Tratamento da rota /login
    if (pathname === "/login") {
        const { uid, userName } = await fetchWhoami();

        // Se PHP reconhece usuário + nome, manda direto para a Home
        if (uid > 0 && userName) {
            return NextResponse.redirect(new URL("/", req.url));
        }

        // Não logado de verdade → mostra o login e limpa cookie se houver
        const res = NextResponse.next();
        if (hasAuthCookie) {
            res.cookies.set("pai_auth", "0", { path: "/", maxAge: 0 });
        }
        return res;
    }

    // 4) Qualquer outra rota privada → exige usuário válido no PHP
    const { uid, userName } = await fetchWhoami();

    if (!uid || !userName) {
        // Sem usuário reconhecido → sempre login
        return redirectToLogin();
    }

    // 5) Usuário autenticado e com nome.
    //    Se a rota não estiver na lista de slugs protegidos (inclui "/"), libera.
    const slug = firstSlug(pathname);
    if (!slug || !PROTECTED_SLUGS.has(slug)) {
        return NextResponse.next();
    }

    // 6) Para slugs protegidos, checa permissões específicas
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

    // 7) Sem permissão → redireciona para uma página segura
    const to = new URL(pickFirstAllowedPath(perms), req.url);
    return NextResponse.redirect(to);
}

// Onde o middleware roda
export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
