import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_BASE = "https://planoassistencialintegrado.com.br";
const PHP_LOGIN = "/autentica.php";

function extractPhpSessId(setCookieHeader: string | null): string | null {
    if (!setCookieHeader) return null;
    const m = setCookieHeader.match(/PHPSESSID=([^;]+)/i);
    return m?.[1] || null;
}

export async function POST(req: NextRequest) {
    try {
        const { usuario, senha } = await req.json();

        if (!usuario || !senha) {
            return NextResponse.json(
                { sucesso: false, error: "Credenciais ausentes." },
                { status: 400 }
            );
        }

        // Encaminha para o PHP
        const resp = await fetch(`${TARGET_BASE}${PHP_LOGIN}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ usuario, senha }),
            redirect: "manual",
        });

        const text = await resp.text();
        let data: any = {};
        try { data = JSON.parse(text); } catch { }

        const ok = resp.ok && (data?.sucesso === true || data?.success === true);
        if (!ok) {
            const msg = data?.msg || data?.error || "Login inválido.";
            return NextResponse.json({ sucesso: false, error: msg }, { status: 401 });
        }

        const setCookie = resp.headers.get("set-cookie");
        const phpSess = extractPhpSessId(setCookie) || data?.sessid || "";

        const isProd = process.env.NODE_ENV === "production";
        const res = NextResponse.json({ sucesso: true, nome: data?.nome ?? usuario });

        // marca que está logado
        res.cookies.set("pai_auth", "1", {
            httpOnly: true,
            sameSite: "lax",
            secure: isProd,
            path: "/",
            maxAge: 60 * 60 * 8, // 8h
        });

        // guarda o PHPSESSID pra usar no proxy
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
    } catch {
        return NextResponse.json(
            { sucesso: false, error: "Falha no login." },
            { status: 500 }
        );
    }
}
