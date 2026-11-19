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

/* =====================================================================
   Desempenho (19/11/2026): caminho rápido, sem consultar o PHP a cada tela.
   - Login: o cookie assinado pai_session (criado no /api/auth/login com PAI_SESSION_SECRET) é conferido
     aqui mesmo. Válido → a tela abre sem esperar o PHP. Inválido, vencido, de contingência ou sem a
     chave → segue o caminho antigo (whoami no PHP), igual a antes.
   - Permissões das telas protegidas: depois da primeira consulta ao PHP, ficam num cookie assinado
     (pai_perm_cache) por 5 minutos. Mudança de permissão vale nas telas em até 5 min; os dados
     continuam protegidos na hora pelo PHP de cada tela.
   ===================================================================== */
const COOKIE_PERMS = "pai_perm_cache";
const PERMS_CACHE_SEG = 5 * 60;
const textoParaBytes = new TextEncoder();
let chaveHmac: Promise<CryptoKey> | null = null;

function obterChaveHmac(): Promise<CryptoKey> | null {
    const segredo = process.env.PAI_SESSION_SECRET;
    if (!segredo) return null;
    if (!chaveHmac) {
        chaveHmac = crypto.subtle.importKey("raw", textoParaBytes.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    }
    return chaveHmac;
}

function paraBase64Url(bytes: Uint8Array): string {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): string {
    let b = texto.replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    const bin = atob(b);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

async function assinar(texto: string): Promise<string | null> {
    const chave = obterChaveHmac();
    if (!chave) return null;
    try {
        const sig = await crypto.subtle.sign("HMAC", await chave, textoParaBytes.encode(texto));
        return paraBase64Url(new Uint8Array(sig));
    } catch {
        return null;
    }
}

function iguaisTempoConstante(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
}

/** Mesmo formato do lib/pai-session.ts: base64url(JSON {usuario, modo, iat, exp}) + "." + HMAC-SHA256 base64url. */
async function sessaoAssinada(token: string | undefined): Promise<{ usuario: string } | null> {
    if (!token) return null;
    const partes = token.split(".");
    if (partes.length !== 2) return null;
    const esperado = await assinar(partes[0]);
    if (!esperado || !iguaisTempoConstante(partes[1], esperado)) return null;
    try {
        const p = JSON.parse(deBase64Url(partes[0]));
        const agora = Math.floor(Date.now() / 1000);
        if (!p?.usuario || !p?.iat || !p?.exp || p.exp <= agora) return null;
        if (p.modo === "contingencia") return null; // contingência continua pelo caminho antigo
        return { usuario: String(p.usuario) };
    } catch {
        return null;
    }
}

async function lerPermsCache(valor: string | undefined, usuario: string): Promise<string[] | null> {
    if (!valor) return null;
    const partes = valor.split(".");
    if (partes.length !== 2) return null;
    const esperado = await assinar("perms:" + partes[0]);
    if (!esperado || !iguaisTempoConstante(partes[1], esperado)) return null;
    try {
        const p = JSON.parse(deBase64Url(partes[0]));
        if (p?.u !== usuario || !Array.isArray(p?.p) || !(p?.exp > Math.floor(Date.now() / 1000))) return null;
        return p.p.map(String);
    } catch {
        return null;
    }
}

async function gravarPermsCache(res: NextResponse, usuario: string, perms: string[]): Promise<void> {
    const relevantes = perms.filter((x) => x === "*" || PROTECTED_SLUGS.has(x));
    const corpo = paraBase64Url(textoParaBytes.encode(JSON.stringify({ u: usuario, p: relevantes, exp: Math.floor(Date.now() / 1000) + PERMS_CACHE_SEG })));
    const sig = await assinar("perms:" + corpo);
    if (!sig) return;
    res.cookies.set(COOKIE_PERMS, `${corpo}.${sig}`, { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: PERMS_CACHE_SEG });
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

    // 4a) Caminho rápido (19/11/2026): sessão assinada válida → não pergunta ao PHP.
    const sessao = hasAuthCookie ? await sessaoAssinada(req.cookies.get("pai_session")?.value) : null;
    if (sessao) {
        const slugRapido = firstSlug(pathname);
        if (!slugRapido || !PROTECTED_SLUGS.has(slugRapido)) {
            return NextResponse.next();
        }
        const permsGuardadas = await lerPermsCache(req.cookies.get(COOKIE_PERMS)?.value, sessao.usuario);
        if (permsGuardadas) {
            if (permsGuardadas.includes("*") || permsGuardadas.includes(slugRapido)) return NextResponse.next();
            return NextResponse.redirect(new URL(pickFirstAllowedPath(permsGuardadas), req.url));
        }
        // Sem as permissões guardadas: consulta o PHP (como antes) e guarda por 5 min.
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
    let permsDoServidor = false;
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
            if (Array.isArray(j)) {
                perms = j;
                permsDoServidor = true;
            }
        } catch {
            // mantém perms = []
        }
    } catch {
        // mantém perms = []
    }

    const allowed = perms.includes("*") || perms.includes(slug);
    if (allowed) {
        const res = NextResponse.next();
        if (sessao && permsDoServidor) await gravarPermsCache(res, sessao.usuario, perms);
        return res;
    }

    // 7) Sem permissão → redireciona para uma página segura
    const to = new URL(pickFirstAllowedPath(perms), req.url);
    const resSemPermissao = NextResponse.redirect(to);
    if (sessao && permsDoServidor) await gravarPermsCache(resSemPermissao, sessao.usuario, perms);
    return resSemPermissao;
}

// Onde o middleware roda
export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
