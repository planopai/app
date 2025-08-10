import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
    const res = NextResponse.json({ ok: true });
    // apaga cookies
    res.cookies.set("pai_auth", "", { path: "/", maxAge: 0 });
    res.cookies.set("php_session", "", { path: "/", maxAge: 0 });
    return res;
}
