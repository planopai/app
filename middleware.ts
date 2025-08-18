// middleware.ts (na RAIZ do projeto)
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Duração padrão da sessão (usada na renovação deslizante)
const SESSION_MS = 60 * 60 * 1000; // 1 hora
const SLIDING_RENEW_THRESHOLD_MS = 5 * 60 * 1000; // renova se faltar < 5 min

// Rotas realmente públicas (antes do login)
// ❗ NÃO inclua /api/php aqui para manter os endpoints protegidos
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/wp", "/api/wc"];

export function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    // --- Sessão ativa? (cookie + expiração) ---
    const authed = req.cookies.get("pai_auth")?.value === "1";
    const exp = Number(req.cookies.get("pai_auth_exp")?.value || 0);
    const expired = !authed || !exp || exp <= Date.now();

    // --- Rota pública? ---
    const isPublic =
        PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));

    // Já logado tentando ir para /login -> manda para Home
    if (pathname === "/login" && authed && !expired) {
        return NextResponse.redirect(new URL("/", req.url));
    }

    // Rotas públicas passam sem exigir sessão
    if (isPublic) return NextResponse.next();

    // Rotas protegidas: exige sessão válida
    if (expired) {
        const loginUrl = req.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.search = "";
        // guarda destino para pós-login
        loginUrl.searchParams.set("next", pathname + (search || ""));

        const res = NextResponse.redirect(loginUrl);
        // limpa cookies vencidos (higiene)
        res.cookies.set("pai_auth", "", { maxAge: 0, path: "/" });
        res.cookies.set("pai_auth_exp", "", { maxAge: 0, path: "/" });
        return res;
    }

    // Renovação deslizante: estende a sessão se estiver perto de expirar
    if (exp - Date.now() < SLIDING_RENEW_THRESHOLD_MS) {
        const fresh = NextResponse.next();
        const newExp = Date.now() + SESSION_MS;
        fresh.cookies.set("pai_auth_exp", String(newExp), {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
        });
        return fresh;
    }

    return NextResponse.next();
}

// Protege tudo que não for asset/estático conhecido
export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|map|woff2?)$).*)",
    ],
};
