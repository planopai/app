import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
    const res = NextResponse.json({ ok: true });

    const baseOpts = {
        path: "/",
        domain: ".planoassistencialintegrado.com.br",
        maxAge: 0,
    };

    res.cookies.set("pai_auth", "", baseOpts);
    res.cookies.set("php_session", "", baseOpts);
    res.cookies.set("pai_name", "", { ...baseOpts, httpOnly: false });
    res.cookies.set("pai_user", "", { ...baseOpts, httpOnly: false });
    res.cookies.set("PHPSESSID", "", baseOpts);
    // 27/10/2026 (segurança): apaga também o login assinado e o id, que o login grava e continuavam valendo após sair.
    res.cookies.set("pai_session", "", baseOpts);
    res.cookies.set("pai_uid", "", { ...baseOpts, httpOnly: false });

    return res;
}
