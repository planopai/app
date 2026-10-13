// app/api/auth/login/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

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

// Apenas inicial maiúscula, restante como veio
function capitalizeFirst(s: string) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Cria uma identidade assinada para a contingência.
 *
 * Importante:
 * - não substitui o PHPSESSID;
 * - não altera o login atual;
 * - não depende do Supabase;
 * - somente pode ser gerada pelo servidor Next.js;
 * - validade: 8 horas.
 *
 * Se PAI_SESSION_SECRET não estiver configurado,
 * retorna null para NÃO quebrar o login existente.
 */
function criarSessaoAssinada(usuario: string): string | null {
    const secret = process.env.PAI_SESSION_SECRET;

    if (!secret) {
        if (process.env.NODE_ENV !== "production") {
            console.warn(
                "[auth] PAI_SESSION_SECRET não configurado. " +
                "Login continuará normalmente, mas sem sessão de contingência."
            );
        }

        return null;
    }

    const agora = Math.floor(Date.now() / 1000);

    const payload = {
        usuario,
        iat: agora,
        exp: agora + 60 * 60 * 8,
    };

    const payloadBase64 = Buffer.from(
        JSON.stringify(payload),
        "utf8"
    ).toString("base64url");

    const assinatura = crypto
        .createHmac("sha256", secret)
        .update(payloadBase64)
        .digest("base64url");

    return `${payloadBase64}.${assinatura}`;
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

        usuario = usuario.trim();

        if (!usuario || !senha) {
            return NextResponse.json(
                {
                    sucesso: false,
                    error: "Credenciais ausentes.",
                },
                {
                    status: 400,
                }
            );
        }

        // ============================================================
        // LOGIN ATUAL — permanece igual
        // ============================================================

        // autentica no PHP do domínio raiz
        const resp = await fetch(`${TARGET_BASE}${PHP_LOGIN}`, {
            method: "POST",

            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },

            body: new URLSearchParams({
                usuario,
                senha,
            }),

            redirect: "manual",
        });

        const raw = await resp.text();

        if (process.env.NODE_ENV !== "production") {
            console.log("[auth/php] status:", resp.status);
            console.log("[auth/php] body:", raw);
            console.log(
                "[auth/php] set-cookie:",
                resp.headers.get("set-cookie")
            );
        }

        let data: any = {};

        try {
            data = JSON.parse(raw);
        } catch {
            // fica vazio e tratamos abaixo
        }

        const sucesso =
            data?.sucesso === true ||
            data?.success === true;

        if (!resp.ok || !sucesso) {
            const msg =
                data?.msg ||
                data?.error ||
                `Login inválido (status ${resp.status})`;

            return NextResponse.json(
                {
                    sucesso: false,
                    error: msg,
                },
                {
                    status: 401,
                }
            );
        }

        // extrai o PHPSESSID retornado pelo PHP
        // ou pega do JSON, se enviado
        const setCookie = resp.headers.get("set-cookie");

        const phpSess =
            extractPhpSessId(setCookie) ||
            data?.sessid ||
            "";

        const nomeOriginal = (data?.nome ?? usuario) as string;

        const nomeExibicao = capitalizeFirst(
            nomeOriginal.trim()
        );

        const isProd =
            process.env.NODE_ENV === "production";

        // ============================================================
        // NOVO — identidade assinada da contingência
        // ============================================================

        const paiSession =
            criarSessaoAssinada(usuario);

        // ============================================================
        // RESPOSTA
        // ============================================================

        const res = NextResponse.json({
            sucesso: true,
            nome: nomeExibicao,
        });

        res.headers.set(
            "Cache-Control",
            "no-store"
        );

        // opções de cookie no domínio RAIZ
        // (.planoassistencialintegrado.com.br)
        const baseOpts = {
            httpOnly: true,
            sameSite: "lax" as const,
            secure: isProd,
            path: "/",
            domain: ".planoassistencialintegrado.com.br",
            maxAge: 60 * 60 * 8, // 8h
        };

        // ============================================================
        // COOKIES ATUAIS — permanecem iguais
        // ============================================================

        // sinal de login
        res.cookies.set(
            "pai_auth",
            "1",
            baseOpts
        );

        // nome legível pelo front
        res.cookies.set(
            "pai_name",
            nomeExibicao,
            {
                ...baseOpts,
                httpOnly: false,
            }
        );

        // alias do usuário
        res.cookies.set(
            "pai_user",
            usuario,
            {
                ...baseOpts,
                httpOnly: false,
            }
        );

        // propaga o MESMO PHPSESSID
        if (phpSess) {
            res.cookies.set(
                "PHPSESSID",
                phpSess,
                baseOpts
            );
        }

        // ============================================================
        // NOVO COOKIE DE CONTINGÊNCIA
        // ============================================================

        /*
         * Esse cookie não pode ser lido nem alterado diretamente
         * pelo JavaScript do navegador.
         *
         * Se alguém tentar modificar seu conteúdo manualmente,
         * a assinatura HMAC deixará de conferir.
         */
        if (paiSession) {
            res.cookies.set(
                "pai_session",
                paiSession,
                {
                    ...baseOpts,
                    httpOnly: true,
                }
            );
        }

        return res;

    } catch (e) {
        if (process.env.NODE_ENV !== "production") {
            console.error("[auth] erro:", e);
        }

        return NextResponse.json(
            {
                sucesso: false,
                error: "Falha no login.",
            },
            {
                status: 500,
            }
        );
    }
}