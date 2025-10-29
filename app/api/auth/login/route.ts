// app/api/auth/login/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_BASE = "https://planoassistencialintegrado.com.br";
const PHP_LOGIN = "/autentica.php";

function extractPhpSessId(setCookieHeader: string | null): string | null {
    if (!setCookieHeader) return null;
    const m = setCookieHeader.match(/PHPSESSID=([^;,\s]+)/i);
    return m?.[1] || null;
}

function stripBOM(s: string) {
    return s.replace(/^\uFEFF/, "").trim();
}

export async function POST(req: NextRequest) {
    try {
        // aceita JSON e x-www-form-urlencoded
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

        const raw = stripBOM(await resp.text());

        if (process.env.NODE_ENV !== "production") {
            console.log("[auth/php] status:", resp.status);
            console.log("[auth/php] body:", raw);
            console.log("[auth/php] set-cookie:", resp.headers.get("set-cookie"));
        }

        let data: any = {};
        try {
            data = JSON.parse(raw);
        } catch {
            // ignora; trata abaixo
        }

        const sucesso = data?.sucesso === true || data?.success === true;
        if (!resp.ok || !sucesso) {
            const msg = data?.msg || data?.error || `Login inválido (status ${resp.status})`;
            return NextResponse.json({ sucesso: false, error: msg }, { status: 401 });
        }

        // IMPORTANTE: precisamos do ID do usuário para preencher pai_uid
        const userId =
            Number(data?.id || data?.user_id || data?.uid) || 0; // ajuste se seu PHP usar outro campo
        if (!userId) {
            return NextResponse.json(
                { sucesso: false, error: "Resposta do servidor sem ID do usuário." },
                { status: 500 }
            );
        }

        // extrai o PHPSESSID retornado
        const setCookie = resp.headers.get("set-cookie");
        const phpSess = extractPhpSessId(setCookie) || data?.sessid || "";

        const nome = String(data?.nome || data?.name || usuario).trim();
        const isProd = process.env.NODE_ENV === "production";

        const res = NextResponse.json({ sucesso: true, nome, uid: userId });
        res.headers.set("Cache-Control", "no-store");

        // 1) Cookies HOST-ONLY (sem domain) -> SSR do seu app enxerga imediatamente
        const hostOnly = {
            httpOnly: true,
            sameSite: "lax" as const,
            secure: isProd,
            path: "/",
            maxAge: 60 * 60 * 8, // 8h
        };
        res.cookies.set("pai_auth", "1", hostOnly);
        res.cookies.set("pai_uid", String(userId), hostOnly);

        // opcional: info não-httpOnly para UI
        res.cookies.set("pai_name", nome, { ...hostOnly, httpOnly: false });
        res.cookies.set("pai_user", usuario, { ...hostOnly, httpOnly: false });

        // 2) Cookies no DOMÍNIO PAI -> PHP de apex/subdomínios também recebe
        const parent = {
            ...hostOnly,
            domain: ".planoassistencialintegrado.com.br",
        };
        res.cookies.set("pai_auth", "1", parent);
        res.cookies.set("pai_uid", String(userId), parent);
        if (phpSess) {
            res.cookies.set("PHPSESSID", phpSess, parent);
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
