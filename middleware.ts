// middleware.ts (na RAIZ do projeto)
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// arquivos estáticos (ex.: /favicon.ico, /arquivo.png)
const PUBLIC_FILE = /\.(.*)$/;

export function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    const isPublic =
        pathname === "/login" ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/static") ||
        pathname.startsWith("/public") ||
        pathname.startsWith("/api/auth") || // login/logout
        pathname.startsWith("/api/php") ||  // seu proxy PHP (libere se precisar antes de logar)
        pathname.startsWith("/api/wp") ||   // seu proxy WP/imagens
        PUBLIC_FILE.test(pathname);

    const isAuthed = req.cookies.get("pai_auth")?.value === "1";

    // Já logado tentando ir pro /login -> manda pra home
    if (pathname === "/login" && isAuthed) {
        return NextResponse.redirect(new URL("/", req.url));
    }

    // Rotas públicas: deixa passar
    if (isPublic) return NextResponse.next();

    // Rotas protegidas: exige cookie
    if (!isAuthed) {
        const login = new URL("/login", req.url);
        // guarda o destino pra pós-login
        const next = pathname + (search || "");
        login.searchParams.set("next", next);
        return NextResponse.redirect(login);
    }

    return NextResponse.next();
}

// Rode o middleware em “tudo”, exceto o que já filtramos acima com regex
export const config = {
    matcher: [
        // aplica em todas as rotas que não sejam _next, estáticos, login e auth
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
    ],
};
