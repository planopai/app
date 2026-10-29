// app/api/auth/login/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

import { supabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_BASE = "https://planoassistencialintegrado.com.br";
const PHP_LOGIN = "/autentica.php";

const SESSION_SECONDS = 60 * 60 * 24; // 24h
const AUTH_CACHE_DAYS = 30;
const PRIMARY_TIMEOUT_MS = 8_000;

const MAX_FALHAS_CONTINGENCIA = 5;
const BLOQUEIO_MINUTOS = 15;

type UsuarioPai = {
    id: number | string;
    nome: string | null;
    usuario: string | null;
    cargo: string | null;
};

type AuthContingenciaRow = {
    usuario_id: number | string;
    usuario: string;
    senha_salt: string;
    senha_hash: string;
    algoritmo: string;
    sincronizado_em: string;
    valido_ate: string;
    ultimo_login_contingencia_em: string | null;
    tentativas_falhas: number;
    bloqueado_ate: string | null;
};

function extractPhpSessId(setCookieHeader: string | null): string | null {
    if (!setCookieHeader) return null;
    const m = setCookieHeader.match(/PHPSESSID=([^;,\s]+)/i);
    return m?.[1] || null;
}

function capitalizeFirst(s: string) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function criarSessaoAssinada(
    usuario: string,
    modo: "primario" | "contingencia"
): string | null {
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
        modo,
        iat: agora,
        exp: agora + SESSION_SECONDS,
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

function gerarHashSenha(senha: string) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(senha, salt, 64);

    return {
        salt: salt.toString("base64"),
        hash: hash.toString("base64"),
    };
}

function validarHashSenha(
    senha: string,
    saltBase64: string,
    hashBase64: string
): boolean {
    try {
        const salt = Buffer.from(saltBase64, "base64");
        const esperado = Buffer.from(hashBase64, "base64");
        const recebido = crypto.scryptSync(senha, salt, esperado.length);

        if (recebido.length !== esperado.length) return false;
        return crypto.timingSafeEqual(recebido, esperado);
    } catch {
        return false;
    }
}

async function localizarUsuarioSupabase(login: string): Promise<UsuarioPai | null> {
    const { data, error } = await supabase
        .schema("pai")
        .from("usuarios")
        .select("id,nome,usuario,cargo")
        .ilike("usuario", login)
        .limit(1)
        .maybeSingle();

    if (error || !data) return null;
    return data as UsuarioPai;
}

async function atualizarCofreContingencia(
    usuario: UsuarioPai,
    senha: string
): Promise<void> {
    const usuarioLogin = String(usuario.usuario ?? "").trim();
    const usuarioId = Number(usuario.id);

    if (!usuarioLogin || !Number.isInteger(usuarioId) || usuarioId <= 0) {
        return;
    }

    const credencial = gerarHashSenha(senha);
    const agora = new Date();
    const validoAte = new Date(
        agora.getTime() + AUTH_CACHE_DAYS * 24 * 60 * 60 * 1000
    );

    const { error } = await supabase
        .schema("pai")
        .from("auth_contingencia")
        .upsert(
            {
                usuario_id: usuarioId,
                usuario: usuarioLogin,
                senha_salt: credencial.salt,
                senha_hash: credencial.hash,
                algoritmo: "scrypt-v1",
                sincronizado_em: agora.toISOString(),
                valido_ate: validoAte.toISOString(),
                tentativas_falhas: 0,
                bloqueado_ate: null,
                atualizado_em: agora.toISOString(),
            },
            {
                onConflict: "usuario_id",
            }
        );

    if (error && process.env.NODE_ENV !== "production") {
        console.error("[auth/contingencia] falha ao atualizar cofre:", error.message);
    }
}

async function registrarFalhaContingencia(
    row: AuthContingenciaRow
): Promise<void> {
    const atuais = Number(row.tentativas_falhas ?? 0);
    const novas = atuais + 1;

    const patch: Record<string, unknown> = {
        tentativas_falhas: novas,
        atualizado_em: new Date().toISOString(),
    };

    if (novas >= MAX_FALHAS_CONTINGENCIA) {
        patch.bloqueado_ate = new Date(
            Date.now() + BLOQUEIO_MINUTOS * 60 * 1000
        ).toISOString();
        patch.tentativas_falhas = 0;
    }

    await supabase
        .schema("pai")
        .from("auth_contingencia")
        .update(patch)
        .eq("usuario_id", row.usuario_id);
}

async function autenticarContingencia(
    usuarioInformado: string,
    senha: string
): Promise<{
    ok: boolean;
    status: number;
    msg?: string;
    usuario?: UsuarioPai;
}> {
    const { data: rowData, error: rowError } = await supabase
        .schema("pai")
        .from("auth_contingencia")
        .select(
            "usuario_id,usuario,senha_salt,senha_hash,algoritmo,sincronizado_em,valido_ate,ultimo_login_contingencia_em,tentativas_falhas,bloqueado_ate"
        )
        .ilike("usuario", usuarioInformado)
        .limit(1)
        .maybeSingle();

    if (rowError) {
        if (process.env.NODE_ENV !== "production") {
            console.error("[auth/contingencia] leitura do cofre:", rowError.message);
        }

        return {
            ok: false,
            status: 503,
            msg: "Contingência de login indisponível.",
        };
    }

    if (!rowData) {
        return {
            ok: false,
            status: 503,
            msg:
                "Login de contingência ainda não preparado para este usuário. " +
                "É necessário ao menos um login normal bem-sucedido antes da indisponibilidade.",
        };
    }

    const row = rowData as AuthContingenciaRow;
    const agora = Date.now();

    if (
        row.bloqueado_ate &&
        new Date(row.bloqueado_ate).getTime() > agora
    ) {
        return {
            ok: false,
            status: 429,
            msg: "Muitas tentativas. Tente novamente mais tarde.",
        };
    }

    if (
        !row.valido_ate ||
        new Date(row.valido_ate).getTime() <= agora
    ) {
        return {
            ok: false,
            status: 503,
            msg:
                "Credencial de contingência expirada. " +
                "É necessário um novo login normal para renová-la.",
        };
    }

    if (row.algoritmo !== "scrypt-v1") {
        return {
            ok: false,
            status: 503,
            msg: "Formato de credencial de contingência não suportado.",
        };
    }

    const senhaValida = validarHashSenha(
        senha,
        row.senha_salt,
        row.senha_hash
    );

    if (!senhaValida) {
        await registrarFalhaContingencia(row);

        return {
            ok: false,
            status: 401,
            msg: "Usuário ou senha inválidos.",
        };
    }

    const { data: usuarioData, error: usuarioError } = await supabase
        .schema("pai")
        .from("usuarios")
        .select("id,nome,usuario,cargo")
        .eq("id", row.usuario_id)
        .maybeSingle();

    if (usuarioError || !usuarioData) {
        return {
            ok: false,
            status: 403,
            msg: "Usuário não está disponível na base de contingência.",
        };
    }

    const usuario = usuarioData as UsuarioPai;

    // Garante que o login do cofre ainda corresponde ao usuário atual.
    if (
        String(usuario.usuario ?? "").trim().toLowerCase() !==
        String(row.usuario ?? "").trim().toLowerCase()
    ) {
        return {
            ok: false,
            status: 403,
            msg: "Identidade de contingência desatualizada.",
        };
    }

    const { data: cargo, error: cargoError } = await supabase
        .schema("pai")
        .from("cargos")
        .select("id,slug,ativo")
        .eq("slug", String(usuario.cargo ?? ""))
        .eq("ativo", true)
        .maybeSingle();

    if (cargoError || !cargo) {
        return {
            ok: false,
            status: 403,
            msg: "Cargo inválido ou inativo.",
        };
    }

    await supabase
        .schema("pai")
        .from("auth_contingencia")
        .update({
            tentativas_falhas: 0,
            bloqueado_ate: null,
            ultimo_login_contingencia_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
        })
        .eq("usuario_id", row.usuario_id);

    return {
        ok: true,
        status: 200,
        usuario,
    };
}

function respostaLoginSucesso(params: {
    usuarioLogin: string;
    nomeOriginal: string;
    usuarioId?: number | null;
    phpSess?: string | null;
    modo: "primario" | "contingencia";
}) {
    const {
        usuarioLogin,
        nomeOriginal,
        usuarioId = null,
        phpSess = null,
        modo,
    } = params;

    const nomeExibicao = capitalizeFirst(nomeOriginal.trim());
    const isProd = process.env.NODE_ENV === "production";
    const paiSession = criarSessaoAssinada(usuarioLogin, modo);

    const res = NextResponse.json({
        sucesso: true,
        nome: nomeExibicao,
        modo,
    });

    res.headers.set("Cache-Control", "no-store");

    const baseOpts = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: isProd,
        path: "/",
        domain: ".planoassistencialintegrado.com.br",
        maxAge: SESSION_SECONDS,
    };

    res.cookies.set("pai_auth", "1", baseOpts);

    res.cookies.set("pai_name", nomeExibicao, {
        ...baseOpts,
        httpOnly: false,
    });

    res.cookies.set("pai_user", usuarioLogin, {
        ...baseOpts,
        httpOnly: false,
    });

    if (usuarioId && Number.isInteger(usuarioId) && usuarioId > 0) {
        res.cookies.set("pai_uid", String(usuarioId), {
            ...baseOpts,
            httpOnly: false,
        });
    }

    // Só existe no modo primário.
    if (phpSess) {
        res.cookies.set("PHPSESSID", phpSess, baseOpts);
    }

    if (paiSession) {
        res.cookies.set("pai_session", paiSession, {
            ...baseOpts,
            httpOnly: true,
        });
    }

    return res;
}

export async function POST(req: NextRequest) {
    try {
        let usuario = "";
        let senha = "";

        const ct = req.headers.get("content-type") || "";

        if (ct.includes("application/x-www-form-urlencoded")) {
            const form = await req.formData();
            usuario = String(form.get("usuario") || "");
            senha = String(form.get("senha") || "");
        } else {
            const body = (await req.json().catch(() => ({}))) as any;
            usuario = String(body?.usuario || "");
            senha = String(body?.senha || "");
        }

        usuario = usuario.trim();

        if (!usuario || !senha) {
            return NextResponse.json(
                {
                    sucesso: false,
                    error: "Credenciais ausentes.",
                },
                { status: 400 }
            );
        }

        // ============================================================
        // 1) TENTA SEMPRE O PRIMÁRIO PRIMEIRO
        // ============================================================

        let respPrimario: Response | null = null;
        let rawPrimario = "";
        let falhaTecnicaPrimario =
            process.env.PAI_AUTH_FORCE_CONTINGENCIA === "1";

        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            PRIMARY_TIMEOUT_MS
        );

        try {
            if (!falhaTecnicaPrimario) {
                respPrimario = await fetch(`${TARGET_BASE}${PHP_LOGIN}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    usuario,
                    senha,
                }),
                redirect: "manual",
                cache: "no-store",
                    signal: controller.signal,
                });

                rawPrimario = await respPrimario.text();
            }
        } catch (error) {
            falhaTecnicaPrimario = true;

            if (process.env.NODE_ENV !== "production") {
                console.error("[auth/php] indisponível:", error);
            }
        } finally {
            clearTimeout(timeout);
        }

        if (respPrimario) {
            if (process.env.NODE_ENV !== "production") {
                console.log("[auth/php] status:", respPrimario.status);
            }

            let data: any = null;

            try {
                data = JSON.parse(rawPrimario);
            } catch {
                data = null;
            }

            const sucesso =
                data?.sucesso === true ||
                data?.success === true;

            // Primário autenticou corretamente.
            if (respPrimario.ok && sucesso) {
                const setCookie = respPrimario.headers.get("set-cookie");

                const phpSess =
                    extractPhpSessId(setCookie) ||
                    data?.sessid ||
                    "";

                // Preferimos o login canônico cadastrado no Supabase,
                // mas não quebramos o login primário se a leitura falhar.
                const usuarioSupabase =
                    await localizarUsuarioSupabase(usuario);

                const usuarioLogin = String(
                    usuarioSupabase?.usuario ?? usuario
                ).trim();

                const nomeOriginal = String(
                    data?.nome ??
                    usuarioSupabase?.nome ??
                    usuarioLogin
                );

                if (usuarioSupabase) {
                    // Só armazenamos SALT + HASH scrypt.
                    // Falha ao atualizar o cofre NÃO derruba o login normal.
                    await atualizarCofreContingencia(
                        usuarioSupabase,
                        senha
                    );
                }

                return respostaLoginSucesso({
                    usuarioLogin,
                    nomeOriginal,
                    usuarioId: usuarioSupabase
                        ? Number(usuarioSupabase.id)
                        : null,
                    phpSess,
                    modo: "primario",
                });
            }

            // Falhas 5xx são indisponibilidade técnica.
            if (respPrimario.status >= 500) {
                falhaTecnicaPrimario = true;
            } else {
                // 4xx / resposta válida de "senha errada":
                // NUNCA fazemos fallback, para não aceitar uma senha antiga.
                const msg =
                    data?.msg ||
                    data?.error ||
                    "Usuário ou senha inválidos.";

                return NextResponse.json(
                    {
                        sucesso: false,
                        error: msg,
                        modo: "primario",
                    },
                    { status: 401 }
                );
            }

            // HTTP 2xx/3xx sem JSON de autenticação válido:
            // consideramos falha técnica do endpoint, não credencial inválida.
            if (
                respPrimario.status < 500 &&
                respPrimario.status < 400 &&
                !sucesso
            ) {
                falhaTecnicaPrimario = true;
            }
        }

        // ============================================================
        // 2) FALLBACK SOMENTE EM FALHA TÉCNICA DO PRIMÁRIO
        // ============================================================

        if (!falhaTecnicaPrimario) {
            return NextResponse.json(
                {
                    sucesso: false,
                    error: "Falha no login.",
                },
                { status: 500 }
            );
        }

        const contingencia =
            await autenticarContingencia(usuario, senha);

        if (!contingencia.ok || !contingencia.usuario) {
            return NextResponse.json(
                {
                    sucesso: false,
                    error:
                        contingencia.msg ||
                        "Falha no login de contingência.",
                    modo: "contingencia",
                },
                {
                    status: contingencia.status,
                }
            );
        }

        const usuarioFallback = contingencia.usuario;
        const usuarioLogin = String(
            usuarioFallback.usuario ?? usuario
        ).trim();

        return respostaLoginSucesso({
            usuarioLogin,
            nomeOriginal: String(
                usuarioFallback.nome ?? usuarioLogin
            ),
            usuarioId: Number(usuarioFallback.id),
            phpSess: null,
            modo: "contingencia",
        });
    } catch (e) {
        if (process.env.NODE_ENV !== "production") {
            console.error("[auth] erro:", e);
        }

        return NextResponse.json(
            {
                sucesso: false,
                error: "Falha no login.",
            },
            { status: 500 }
        );
    }
}
