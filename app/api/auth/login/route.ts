// app/api/auth/login/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_BASE = "https://planoassistencialintegrado.com.br";
const PHP_LOGIN = "/autentica.php";

function extractPhpSessId(setCookieHeader: string | null): string | null {
    if (!setCookieHeader) return null;
    // tenta capturar o primeiro PHPSESSID em qualquer posição
    const m = setCookieHeader.match(/PHPSESSID=([^;,\s]+)/i);
    return m?.[1] || null;
}

export async function POST(req: NextRequest) {
    try {
        // aceita JSON { usuario, senha } e também x-www-form-urlencoded
        let usuario = "";
        let senha = "";

        const ct = req.headers.get("content-type") || "";
        if (ct.includes("application/x-www-form-urlencoded")) {
            const form = await req.formData();
            usuario = String(form.get("usuario") || "");
            senha = String(form.get("senha") || "");
        } else {
            const body = (await req.json().catch(() => ({}))) as any;
            usuario = body?.usuario || "";
            senha = body?.senha || "";
        }

        if (!usuario || !senha) {
            return NextResponse.json(
                { sucesso: false, error: "Credenciais ausentes." },
                { status: 400 }
            );
        }

        // autentica no PHP do domínio raiz
        const resp = await fetch(`${TARGET_BASE}${PHP_LOGIN}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ usuario, senha }),
            redirect: "manual",
        });

        const raw = await resp.text();

        if (process.env.NODE_ENV !== "production") {
            console.log("[auth/php] status:", resp.status);
            console.log("[auth/php] body:", raw);
            console.log("[auth/php] set-cookie:", resp.headers.get("set-cookie"));
        }

        let data: any = {};
        try {
            data = JSON.parse(raw);
        } catch {
            // fica vazio e tratamos abaixo
        }

        const sucesso = data?.sucesso === true || data?.success === true;
        if (!resp.ok || !sucesso) {
            const msg = data?.msg || data?.error || `Login inválido (status ${resp.status})`;
            return NextResponse.json({ sucesso: false, error: msg }, { status: 401 });
        }

        // extrai o PHPSESSID retornado pelo PHP (ou pega do JSON, se enviado)
        const setCookie = resp.headers.get("set-cookie");
        const phpSess = extractPhpSessId(setCookie) || data?.sessid || "";

        const nome = data?.nome ?? usuario;
        const isProd = process.env.NODE_ENV === "production";

        const res = NextResponse.json({ sucesso: true, nome });
        res.headers.set("Cache-Control", "no-store");

        // opções de cookie no domínio RAIZ (.planoassistencialintegrado.com.br)
        const baseOpts = {
            httpOnly: true,
            sameSite: "lax" as const,
            secure: isProd,
            path: "/",
            domain: ".planoassistencialintegrado.com.br",
            maxAge: 60 * 60 * 8, // 8h
        };

        // sinal de login
        res.cookies.set("pai_auth", "1", baseOpts);

        // nome legível pelo front (não httpOnly) — sem encodeURIComponent
        res.cookies.set("pai_name", nome, {
            ...baseOpts,
            httpOnly: false,
        });

        // alias opcional do usuário — sem encodeURIComponent
        res.cookies.set("pai_user", usuario, {
            ...baseOpts,
            httpOnly: false,
        });

        // **propaga o MESMO PHPSESSID** para o domínio raiz
        if (phpSess) {
            res.cookies.set("PHPSESSID", phpSess, baseOpts);
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
