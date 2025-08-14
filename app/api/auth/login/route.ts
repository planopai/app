// app/api/auth/login/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_BASE = "https://planoassistencialintegrado.com.br";
const PHP_LOGIN = "/autentica.php";

/** Extrai o primeiro PHPSESSID de um header Set-Cookie possivelmente múltiplo */
function extractPhpSessId(setCookieHeader: string | null): string | null {
    if (!setCookieHeader) return null;
    // Casa tanto "PHPSESSID=..." no início quanto após vírgulas (múltiplos cookies)
    const m = setCookieHeader.match(/(?:^|,)\s*PHPSESSID=([^;]+)/i);
    return m?.[1] || null;
}

/** Segue um redirect (1 salto) para capturar cookies do 30x e do destino */
async function fetchLoginWithCookies(url: string, init: RequestInit, abortMs = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), abortMs);
    try {
        const r1 = await fetch(url, { ...init, redirect: "manual", signal: ctrl.signal });
        const set1 = r1.headers.get("set-cookie");
        if (![301, 302, 303, 307, 308].includes(r1.status)) {
            return { resp: r1, setCookieAll: set1 || "" };
        }
        const loc = r1.headers.get("location");
        if (!loc) {
            return { resp: r1, setCookieAll: set1 || "" };
        }
        const r2 = await fetch(new URL(loc, url).toString(), {
            ...init,
            redirect: "follow",
            signal: ctrl.signal,
        });
        const set2 = r2.headers.get("set-cookie");
        const combined = [set1, set2].filter(Boolean).join(", ");
        return { resp: r2, setCookieAll: combined };
    } finally {
        clearTimeout(t);
    }
}

export async function POST(req: NextRequest) {
    try {
        // aceita JSON {usuario,senha} e também x-www-form-urlencoded
        let usuario = "";
        let senha = "";
        const ct = req.headers.get("content-type") || "";
        if (ct.includes("application/x-www-form-urlencoded")) {
            const form = await req.formData();
            usuario = String(form.get("usuario") || "");
            senha = String(form.get("senha") || "");
        } else {
            const body = await req.json().catch(() => ({} as any));
            usuario = body?.usuario || "";
            senha = body?.senha || "";
        }

        if (!usuario || !senha) {
            return NextResponse.json(
                { sucesso: false, error: "Credenciais ausentes." },
                { status: 400 }
            );
        }

        const init: RequestInit = {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ usuario, senha }),
            // server->server, não precisa credenciais do browser
        };

        // faz login capturando cookies do redirect
        const { resp, setCookieAll } = await fetchLoginWithCookies(
            `${TARGET_BASE}${PHP_LOGIN}`,
            init
        );

        const raw = await resp.text();

        if (process.env.NODE_ENV !== "production") {
            console.log("[auth/php] status:", resp.status);
            console.log("[auth/php] set-cookie(all):", setCookieAll);
            console.log("[auth/php] body:", raw);
        }

        // tenta interpretar o JSON retornado pelo PHP
        let data: any = {};
        try { data = JSON.parse(raw); } catch { }

        // sucesso se API disse sucesso OU (fallback) se ao menos recebemos PHPSESSID
        const phpSess = extractPhpSessId(setCookieAll) || data?.sessid || "";
        const sucessoApi = data?.sucesso === true || data?.success === true;
        const sucessoHeuristico = !!phpSess && resp.ok;

        if (!sucessoApi && !sucessoHeuristico) {
            const msg = data?.msg || data?.error || `Login inválido (status ${resp.status})`;
            return NextResponse.json({ sucesso: false, error: msg }, { status: 401 });
        }

        const nome = data?.nome ?? usuario;
        const isProd = process.env.NODE_ENV === "production";

        const res = NextResponse.json({ sucesso: true, nome });
        res.headers.set("Cache-Control", "no-store");

        // marca login do app
        res.cookies.set("pai_auth", "1", {
            httpOnly: true,
            sameSite: "lax",
            secure: isProd,
            path: "/",
            maxAge: 60 * 60 * 8,
        });

        res.cookies.set("pai_name", encodeURIComponent(nome), {
            httpOnly: false,
            sameSite: "lax",
            secure: isProd,
            path: "/",
            maxAge: 60 * 60 * 8,
        });

        // guarda a sessão PHP para os proxys subsequentes /api/php/...
        if (phpSess) {
            res.cookies.set("php_session", phpSess, {
                httpOnly: true,
                sameSite: "lax",
                secure: isProd,
                path: "/",
                maxAge: 60 * 60 * 8,
            });
        }

        return res;
    } catch (e) {
        if (process.env.NODE_ENV !== "production") {
            console.error("[auth] erro:", e);
        }
        return NextResponse.json(
            { sucesso: false, error: "Falha no login." },
            { status: 500 }
        );
    }
}
