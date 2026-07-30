import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * middleware.ts
 *
 * Proteção de rotas do PAI.
 *
 * Principais correções:
 * - /login nunca consulta PHP/MySQL;
 * - timeout nas chamadas à API;
 * - valida status HTTP e tamanho da resposta;
 * - evita liberar rota esquecida por padrão;
 * - corrige quadro-atendimento x quadro-acompanhamento;
 * - limpa cookies usando o domínio correto;
 * - consulta diretamente api.planoassistencialintegrado.com.br,
 *   quando PAI_API_ORIGIN estiver configurada;
 * - libera somente extensões estáticas conhecidas;
 * - protege a Home apenas por autenticação;
 * - protege as demais páginas por autenticação e permissão.
 */

/* ============================================================
 * CONFIGURAÇÕES
 * ============================================================ */

const RAW_API_ORIGIN = process.env.PAI_API_ORIGIN?.trim() ?? "";
const API_ORIGIN = RAW_API_ORIGIN.replace(/\/+$/, "");

const API_TIMEOUT_MS = 3_000;
const MAX_API_RESPONSE_SIZE = 64 * 1024;

const ROOT_COOKIE_DOMAIN = ".planoassistencialintegrado.com.br";

const AUTH_COOKIE_NAMES = [
    "pai_auth",
    "pai_uid",
    "pai_user",
] as const;

/**
 * Libera somente extensões realmente estáticas.
 *
 * Não inclui PDF, CSV, XLSX ou arquivos que possam conter
 * documentos privados.
 */
const PUBLIC_FILE =
    /\.(?:css|js|mjs|map|png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|otf|eot|txt|xml|webmanifest)$/i;

/**
 * Caminhos públicos exatos.
 *
 * A Home "/" não está aqui porque exige autenticação.
 */
const PUBLIC_PATHS = new Set<string>([
    "/login",
    "/ajuda",
]);

/**
 * Prefixos internos ou APIs que não devem ser protegidos por este
 * middleware.
 *
 * IMPORTANTE:
 * A liberação aqui não substitui a validação de autenticação e
 * autorização dentro dos próprios endpoints.
 */
const PUBLIC_PREFIXES = [
    "/_next",
    "/static",
    "/api/auth",
    "/api/php",
    "/api/wp",
    "/api/wc",
    "/.well-known",
] as const;

/**
 * Relação entre o slug usado na URL e a permissão salva no MySQL.
 *
 * Chave: slug da rota Next.js.
 * Valor: permissoes.pagina no MySQL.
 *
 * A rota antiga utilizava "quadro-atendimento", enquanto a lista
 * do PHP utiliza "quadro-acompanhamento". O mapa permite manter a
 * URL atual sem deixar a permissão inconsistente.
 */
const ROUTE_PERMISSION_MAP = new Map<string, string>([
    ["quadro-atendimento", "quadro-acompanhamento"],
    ["quadro-acompanhamento", "quadro-acompanhamento"],

    ["acompanhamento", "acompanhamento"],
    ["memorial", "memorial"],
    ["obituario", "obituario"],
    ["clube", "clube"],
    ["leads", "leads"],
    ["coroa-de-flores", "coroa-de-flores"],
    ["relatorio", "relatorio"],
    ["administrativo", "administrativo"],
    ["servicos-funerarios", "servicos-funerarios"],
    ["plano", "plano"],
    ["associados", "associados"],
    ["avisos", "avisos"],

    ["dashboard", "dashboard"],
    ["api", "api"],
    ["atendimento", "atendimento"],
    ["catalogo", "catalogo"],
    ["medicos", "medicos"],
    ["relatorio-guias", "relatorio-guias"],
    ["mensagens", "mensagens"],
    ["noticias", "noticias"],
    ["offline", "offline"],
    ["parceiros", "parceiros"],
    ["permissoes", "permissoes"],
    ["config-catalogo", "config-catalogo"],
    ["salas", "salas"],
    ["seguranca", "seguranca"],
    ["sorteios", "sorteios"],
    ["tela", "tela"],
    ["telemetria", "telemetria"],
    ["usuarios", "usuarios"],

    ["estoque", "estoque"],
    ["assistencia", "assistencia"],
    ["geral", "geral"],
    ["produtos", "produtos"],
    ["requisicao", "requisicao"],
    ["minhas-solicitacoes", "minhas-solicitacoes"],
    ["requisicoes", "requisicoes"],
    ["solicitar-produto", "solicitar-produto"],
    ["dashboard-requisicoes", "dashboard-requisicoes"],
    ["desempenho", "desempenho"],
]);

/* ============================================================
 * TIPOS
 * ============================================================ */

type WhoamiResponse = {
    id?: number | string | null;
    nome?: string | null;
    name?: string | null;
    usuario?: string | null;
};

type AuthenticatedUser = {
    uid: number;
    userName: string;
};

/* ============================================================
 * FUNÇÕES AUXILIARES DE ROTA
 * ============================================================ */

function normalizePathname(pathname: string): string {
    if (pathname === "/") {
        return "/";
    }

    return pathname.replace(/\/+$/, "") || "/";
}

function firstSlug(pathname: string): string {
    return pathname.split("/").filter(Boolean)[0] ?? "";
}

function pathHasPrefix(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublicPrefix(pathname: string): boolean {
    return PUBLIC_PREFIXES.some((prefix) =>
        pathHasPrefix(pathname, prefix)
    );
}

function isPublicRequest(pathname: string): boolean {
    return (
        PUBLIC_PATHS.has(pathname) ||
        isPublicPrefix(pathname) ||
        PUBLIC_FILE.test(pathname)
    );
}

/* ============================================================
 * API
 * ============================================================ */

/**
 * Retorna o endpoint do pai_api.php.
 *
 * Produção recomendada:
 * PAI_API_ORIGIN=https://api.planoassistencialintegrado.com.br
 *
 * Caso a variável não exista, usa o proxy interno /api/php.
 */
function buildApiUrl(
    req: NextRequest,
    action: string,
    params: Record<string, string | number> = {}
): URL {
    const endpoint = API_ORIGIN
        ? `${API_ORIGIN}/pai_api.php`
        : `${req.nextUrl.origin}/api/php/pai_api.php`;

    const url = new URL(endpoint);

    url.searchParams.set("action", action);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
    }

    return url;
}

/**
 * Faz uma chamada JSON com timeout.
 *
 * Retorna null quando:
 * - ocorre timeout;
 * - a API fica indisponível;
 * - a resposta não é 2xx;
 * - a resposta é muito grande;
 * - o conteúdo não é um JSON válido.
 */
async function fetchJsonWithTimeout<T>(
    url: URL,
    cookieHeader: string
): Promise<T | null> {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, API_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "x-requested-with": "XMLHttpRequest",
                cookie: cookieHeader,
            },
            cache: "no-store",
            redirect: "manual",
            signal: controller.signal,
        });

        if (!response.ok) {
            console.error("[PAI middleware] API respondeu com erro", {
                action: url.searchParams.get("action"),
                status: response.status,
            });

            return null;
        }

        const contentLengthHeader =
            response.headers.get("content-length");

        if (contentLengthHeader) {
            const contentLength = Number(contentLengthHeader);

            if (
                Number.isFinite(contentLength) &&
                contentLength > MAX_API_RESPONSE_SIZE
            ) {
                console.error(
                    "[PAI middleware] Resposta da API acima do limite",
                    {
                        action: url.searchParams.get("action"),
                        contentLength,
                    }
                );

                return null;
            }
        }

        const text = await response.text();

        if (text.length > MAX_API_RESPONSE_SIZE) {
            console.error(
                "[PAI middleware] Corpo da API acima do limite",
                {
                    action: url.searchParams.get("action"),
                    size: text.length,
                }
            );

            return null;
        }

        const cleanText = text
            .replace(/^\uFEFF/, "")
            .trim();

        if (!cleanText) {
            return null;
        }

        try {
            return JSON.parse(cleanText) as T;
        } catch {
            console.error(
                "[PAI middleware] API retornou JSON inválido",
                {
                    action: url.searchParams.get("action"),
                }
            );

            return null;
        }
    } catch (error) {
        const isAbortError =
            error instanceof Error &&
            error.name === "AbortError";

        console.error(
            isAbortError
                ? "[PAI middleware] Timeout na API"
                : "[PAI middleware] Falha ao consultar API",
            {
                action: url.searchParams.get("action"),
            }
        );

        return null;
    } finally {
        clearTimeout(timeout);
    }
}

/* ============================================================
 * AUTENTICAÇÃO E PERMISSÕES
 * ============================================================ */

async function fetchWhoami(
    req: NextRequest,
    cookieHeader: string
): Promise<AuthenticatedUser | null> {
    const url = buildApiUrl(req, "whoami");

    const who = await fetchJsonWithTimeout<WhoamiResponse>(
        url,
        cookieHeader
    );

    if (!who) {
        return null;
    }

    const uid = Number(who.id);

    const userName = String(
        who.nome ??
        who.name ??
        who.usuario ??
        ""
    ).trim();

    if (
        !Number.isSafeInteger(uid) ||
        uid <= 0 ||
        userName === ""
    ) {
        return null;
    }

    return {
        uid,
        userName,
    };
}

async function fetchPermissions(
    req: NextRequest,
    cookieHeader: string,
    uid: number
): Promise<string[] | null> {
    const url = buildApiUrl(req, "list_permissions", {
        user_id: uid,
    });

    const result = await fetchJsonWithTimeout<unknown>(
        url,
        cookieHeader
    );

    if (!Array.isArray(result)) {
        return null;
    }

    const permissions = result
        .filter(
            (permission): permission is string =>
                typeof permission === "string"
        )
        .map((permission) => permission.trim())
        .filter(Boolean);

    return [...new Set(permissions)];
}

function hasPermission(
    permissions: string[],
    permission: string
): boolean {
    return (
        permissions.includes("*") ||
        permissions.includes(permission)
    );
}

/**
 * Encontra uma rota que o usuário pode acessar.
 *
 * Caso não tenha nenhuma permissão específica, retorna a Home,
 * que exige somente autenticação.
 */
function pickFirstAllowedPath(
    permissions: string[]
): string {
    if (permissions.includes("*")) {
        return "/";
    }

    for (const [routeSlug, permission] of ROUTE_PERMISSION_MAP) {
        if (permissions.includes(permission)) {
            return `/${routeSlug}`;
        }
    }

    return "/";
}

/* ============================================================
 * RESPOSTAS
 * ============================================================ */

function isPaiProductionDomain(req: NextRequest): boolean {
    const hostname = req.nextUrl.hostname.toLowerCase();

    return (
        hostname === "planoassistencialintegrado.com.br" ||
        hostname.endsWith(
            ".planoassistencialintegrado.com.br"
        )
    );
}

function clearAuthenticationCookies(
    req: NextRequest,
    response: NextResponse
): void {
    const useRootDomain = isPaiProductionDomain(req);

    for (const cookieName of AUTH_COOKIE_NAMES) {
        response.cookies.set(cookieName, "", {
            path: "/",
            ...(useRootDomain
                ? { domain: ROOT_COOKIE_DOMAIN }
                : {}),
            secure: req.nextUrl.protocol === "https:",
            httpOnly: true,
            sameSite: "lax",
            expires: new Date(0),
            maxAge: 0,
        });
    }
}

function redirectToLogin(
    req: NextRequest,
    pathname: string,
    search: string
): NextResponse {
    const loginUrl = new URL("/login", req.url);

    const requestedDestination =
        `${pathname}${search}`.slice(0, 2_000);

    loginUrl.searchParams.set(
        "next",
        requestedDestination
    );

    const response = NextResponse.redirect(loginUrl);

    clearAuthenticationCookies(req, response);

    response.headers.set("Cache-Control", "no-store");

    return response;
}

function redirectToAllowedPage(
    req: NextRequest,
    permissions: string[]
): NextResponse {
    let destination = pickFirstAllowedPath(permissions);

    const currentPath = normalizePathname(
        req.nextUrl.pathname
    );

    /*
     * Proteção adicional contra eventual loop de redirecionamento.
     */
    if (destination === currentPath) {
        destination = "/";
    }

    const url = new URL(destination, req.url);

    const response = NextResponse.redirect(url);

    response.headers.set("Cache-Control", "no-store");

    return response;
}

function serviceUnavailable(): NextResponse {
    return new NextResponse(
        "O serviço de autenticação está temporariamente indisponível. Tente novamente.",
        {
            status: 503,
            headers: {
                "Content-Type":
                    "text/plain; charset=utf-8",
                "Cache-Control":
                    "no-store, no-cache, must-revalidate",
                "Retry-After": "5",
            },
        }
    );
}

/* ============================================================
 * MIDDLEWARE
 * ============================================================ */

export async function middleware(
    req: NextRequest
): Promise<NextResponse> {
    const pathname = normalizePathname(
        req.nextUrl.pathname
    );

    const search = req.nextUrl.search;

    /*
     * 1. Arquivos, APIs e páginas explicitamente públicas.
     *
     * /login não consulta PHP. Portanto, uma falha no PHP ou
     * MySQL não impede a abertura da página de login.
     */
    if (isPublicRequest(pathname)) {
        return NextResponse.next();
    }

    /*
     * 2. Cookies são somente um indício inicial.
     *
     * A autenticação real ainda será validada pelo whoami.
     */
    const hasAuthCookie =
        req.cookies.get("pai_auth")?.value === "1";

    const hasUserCookie =
        Boolean(
            req.cookies
                .get("pai_user")
                ?.value?.trim()
        );

    if (!hasAuthCookie || !hasUserCookie) {
        return redirectToLogin(
            req,
            pathname,
            search
        );
    }

    const cookieHeader =
        req.headers.get("cookie") ?? "";

    /*
     * 3. Valida o usuário na API.
     *
     * Essa chamada possui timeout de 3 segundos e não poderá
     * manter o middleware pendurado até o limite da Vercel.
     */
    const user = await fetchWhoami(
        req,
        cookieHeader
    );

    if (!user) {
        return redirectToLogin(
            req,
            pathname,
            search
        );
    }

    /*
     * 4. A Home exige autenticação, mas não exige uma permissão
     * específica.
     */
    if (pathname === "/") {
        return NextResponse.next();
    }

    const routeSlug = firstSlug(pathname);

    /*
     * 5. Proteção por padrão.
     *
     * Uma rota que não estiver cadastrada no mapa não será
     * liberada automaticamente.
     *
     * Isso impede que uma nova página administrativa seja
     * publicada sem verificação de permissão por esquecimento.
     */
    const requiredPermission =
        ROUTE_PERMISSION_MAP.get(routeSlug);

    if (!requiredPermission) {
        console.warn(
            "[PAI middleware] Rota privada não cadastrada",
            {
                pathname,
                routeSlug,
            }
        );

        return NextResponse.redirect(
            new URL("/", req.url)
        );
    }

    /*
     * 6. Busca as permissões somente quando a rota realmente
     * exige uma permissão específica.
     */
    const permissions = await fetchPermissions(
        req,
        cookieHeader,
        user.uid
    );

    /*
     * Falha fechada:
     * se a API de permissões estiver indisponível, não libera a
     * página protegida.
     */
    if (permissions === null) {
        return serviceUnavailable();
    }

    /*
     * 7. Usuário autorizado.
     */
    if (
        hasPermission(
            permissions,
            requiredPermission
        )
    ) {
        return NextResponse.next();
    }

    /*
     * 8. Usuário autenticado, mas sem permissão.
     */
    return redirectToAllowedPage(
        req,
        permissions
    );
}

/* ============================================================
 * MATCHER
 * ============================================================ */

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
    ],
};