// lib/wcSessao.ts
import { NextResponse } from "next/server";

/**
 * 12/11/2026 (segurança): as rotas /api/wc ficam fora do middleware porque o aviso (webhook) da loja
 * precisa entrar sem login. Por isso as rotas que leem ou alteram pedidos da loja (nome, CPF, e-mail,
 * telefone e endereço do comprador) checam aqui: usuário logado no app (whoami do PHP, igual ao
 * middleware) e com a página coroa-de-flores (ou acesso total "*").
 * Devolve null quando pode seguir, ou a resposta (401/403) para a rota devolver.
 * O webhook da loja e o verify_internal do coroas.php continuam livres: eles são protegidos pela assinatura.
 */
export async function exigirAcessoPedidosLoja(req: Request): Promise<NextResponse | null> {
    const cookie = req.headers.get("cookie") || "";
    const semLogin = () =>
        NextResponse.json(
            { error: true, need_login: 1, message: "Faça login no app para ver os pedidos da loja." },
            { status: 401, headers: { "Cache-Control": "no-store" } },
        );

    if (!/(?:^|;\s*)pai_auth=1(?:;|$)/.test(cookie)) return semLogin();

    const origin = new URL(req.url).origin;
    const headers = { "x-requested-with": "XMLHttpRequest", cookie };
    const lerJson = async (res: Response) => {
        const texto = (await res.text()).replace(/^\uFEFF/, "").trim();
        try {
            return texto ? JSON.parse(texto) : null;
        } catch {
            return null;
        }
    };

    try {
        const who = await lerJson(await fetch(`${origin}/api/php/pai_api.php?action=whoami`, { headers, cache: "no-store" }));
        const uid = Number(who?.id || 0);
        if (!uid) return semLogin();

        const perms = await lerJson(
            await fetch(`${origin}/api/php/pai_api.php?action=list_permissions&user_id=${uid}`, { headers, cache: "no-store" }),
        );
        if (Array.isArray(perms) && (perms.includes("*") || perms.includes("coroa-de-flores"))) return null;

        return NextResponse.json(
            { error: true, message: "Sem permissão para os pedidos da loja." },
            { status: 403, headers: { "Cache-Control": "no-store" } },
        );
    } catch {
        return semLogin();
    }
}
