// middleware.ts (na RAIZ do projeto)
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// ===== Arquivos públicos (ex.: /favicon.ico, /arquivo.png) =====
const PUBLIC_FILE = /\.(.*)$/;

// ===== Slugs protegidos (pastas/rotas que exigem permissão) =====
// Use os mesmos slugs que você editou na página de Permissões
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
    "login",          // normalmente pública, deixe aqui só se quiser controlar
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

// ===== Rotas SEM verificação de permissão (além das estáticas) =====
const PUBLIC_PATHS = new Set<string>([
    "/",         // homepage se quiser pública
    "/login",
    "/ajuda",
]);

/** Extrai o primeiro segmento do pathname → "/usuarios/abc" => "usuarios" */
function firstSlug(pathname: string): string {
    const seg = pathname.split("/").filter(Boolean)[0] || "";
    return seg;
}

export async function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    // ——— 1) Arquivos/rotas públicas (antes de qualquer coisa) ———
    const isPublic =
        PUBLIC_PATHS.has(pathname) ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/static") ||
        pathname.startsWith("/public") ||
        pathname.startsWith("/api/auth") || // login/logout NextAuth (se houver)
        pathname.startsWith("/api/php") ||  // seu proxy PHP (deixe público)
        pathname.startsWith("/api/wp") ||   // seu proxy WP
        pathname.startsWith("/api/wc") ||   // seu proxy WC
        PUBLIC_FILE.test(pathname);

    const isAuthed = req.cookies.get("pai_auth")?.value === "1";

    // Se já está logado e tenta ir pra /login → manda pra home
    if (pathname === "/login" && isAuthed) {
        return NextResponse.redirect(new URL("/", req.url));
    }

    // Rotas/arquivos públicos passam direto
    if (isPublic) return NextResponse.next();

    // ——— 2) Checagem de LOGIN (igual ao seu) ———
    if (!isAuthed) {
        const login = new URL("/login", req.url);
        const next = pathname + (search || "");
        login.searchParams.set("next", next);
        return NextResponse.redirect(login);
    }

    // ——— 3) Checagem de PERMISSÃO por slug ———
    // Se a rota não é de uma página protegida, deixa passar
    const slug = firstSlug(pathname);
    if (!slug || !PROTECTED_SLUGS.has(slug)) {
        return NextResponse.next();
    }

    // Descobre quem é o usuário logado (via cookie encaminhado)
    // Obs: chamamos o SEU proxy Next -> PHP do domínio principal
    const origin = req.nextUrl.origin;
    let who: any = null;
    try {
        const r1 = await fetch(`${origin}/api/php/pai_api.php?action=whoami`, {
            headers: { "x-requested-with": "XMLHttpRequest" },
            cache: "no-store",
        });
        who = await r1.json();
    } catch {
        // se der erro, trate como não logado
    }

    const uid = who?.id ? Number(who.id) : 0;
    if (!uid) {
        // perdeu sessão no backend? volte ao login mantendo destino
        const login = new URL("/login", req.url);
        const next = pathname + (search || "");
        login.searchParams.set("next", next);
        return NextResponse.redirect(login);
    }

    // Busca as permissões do usuário
    let perms: string[] = [];
    try {
        const r2 = await fetch(
            `${origin}/api/php/pai_api.php?action=list_permissions&user_id=${uid}`,
            { headers: { "x-requested-with": "XMLHttpRequest" }, cache: "no-store" }
        );
        const j = await r2.json();
        if (Array.isArray(j)) perms = j;
    } catch {
        // sem perms = bloqueia abaixo
    }

    // Regra: se tiver "*" (admin) OU o slug da rota, libera
    const allowed = perms.includes("*") || perms.includes(slug);

    if (allowed) return NextResponse.next();

    // Sem permissão → redireciona para alguma página segura
    const to = new URL("/inicio", req.url);
    return NextResponse.redirect(to);
}

// Onde o middleware roda
export const config = {
    matcher: [
        // aplica em tudo, exceto assets básicos; /api/php fica liberado por regra acima
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
    ],
};
