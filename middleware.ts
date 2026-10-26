import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Arquivos estáticos (css, js, imagens etc.)
const PUBLIC_FILE = /\.(.*)$/;

// Slugs protegidos (devem bater com permissoes.pagina / cargo_paginas.pagina)
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
  "/login",
  "/ajuda",
]);

type AccessResponse = {
  ok: boolean;
  modo?: "primario" | "contingencia";
  uid?: number;
  userName?: string;
  perms?: string[];
  error?: string;
};

function firstSlug(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] || "";
}

function pickFirstAllowedPath(perms: string[]): string {
  if (perms.includes("*")) return "/";

  for (const slug of perms) {
    if (PROTECTED_SLUGS.has(slug)) {
      return `/${slug}`;
    }
  }

  return "/";
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Rotas técnicas protegidas pelas próprias chaves Bearer.
  // Não devem depender de sessão de usuário/PHP.
  if (
    pathname === "/api/sync/hostgator" ||
    pathname === "/api/failback/hostgator"
  ) {
    return NextResponse.next();
  }

  // Assets e APIs que possuem autenticação própria ou precisam ficar acessíveis
  // durante login/failover.
  const isAssetOrApiPublic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/php") ||
    pathname.startsWith("/api/wp") ||
    pathname.startsWith("/api/wc") ||
    PUBLIC_FILE.test(pathname);

  if (isAssetOrApiPublic) {
    return NextResponse.next();
  }

  if (pathname !== "/login" && PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const origin = req.nextUrl.origin;
  const cookieHeader = req.headers.get("cookie") || "";

  const redirectToLogin = () => {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname + (search || ""));

    const res = NextResponse.redirect(loginUrl);

    // Limpa apenas o cookie legado de indicação visual.
    // A sessão assinada é validada pela /api/auth/access.
    if (req.cookies.get("pai_auth")?.value) {
      res.cookies.set("pai_auth", "0", {
        path: "/",
        maxAge: 0,
      });
    }

    return res;
  };

  async function fetchAccess(): Promise<AccessResponse> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(`${origin}/api/auth/access`, {
          method: "GET",
          headers: {
            cookie: cookieHeader,
            "x-pai-middleware": "1",
          },
          cache: "no-store",
          signal: controller.signal,
        });

        const body = (await response.json().catch(() => null)) as
          | AccessResponse
          | null;

        if (!response.ok || !body?.ok) {
          return {
            ok: false,
            error: body?.error || `HTTP ${response.status}`,
          };
        }

        return {
          ok: true,
          modo:
            body.modo === "contingencia"
              ? "contingencia"
              : "primario",
          uid: Number(body.uid || 0),
          userName: String(body.userName || "").trim(),
          perms: Array.isArray(body.perms)
            ? body.perms.map((p) => String(p))
            : [],
        };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return {
        ok: false,
        error: "Falha ao validar sessão.",
      };
    }
  }

  // /login: se a sessão já for válida em qualquer modo, volta para a Home.
  if (pathname === "/login") {
    const access = await fetchAccess();

    if (
      access.ok &&
      Number(access.uid || 0) > 0 &&
      String(access.userName || "").trim()
    ) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    const res = NextResponse.next();

    if (req.cookies.get("pai_auth")?.value) {
      res.cookies.set("pai_auth", "0", {
        path: "/",
        maxAge: 0,
      });
    }

    return res;
  }

  // Todas as páginas privadas dependem da sessão assinada.
  // A rota /api/auth/access escolhe automaticamente:
  // - primário -> PHP/HostGator
  // - contingência -> Supabase
  const access = await fetchAccess();

  if (
    !access.ok ||
    !Number(access.uid || 0) ||
    !String(access.userName || "").trim()
  ) {
    return redirectToLogin();
  }

  const slug = firstSlug(pathname);

  // Home e rotas não cadastradas como protegidas continuam liberadas
  // para qualquer usuário autenticado.
  if (!slug || !PROTECTED_SLUGS.has(slug)) {
    return NextResponse.next();
  }

  const perms = Array.isArray(access.perms) ? access.perms : [];

  const allowed =
    perms.includes("*") ||
    perms.includes(slug);

  if (allowed) {
    return NextResponse.next();
  }

  return NextResponse.redirect(
    new URL(pickFirstAllowedPath(perms), req.url),
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
