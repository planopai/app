// app/api/wc/diag/route.ts
import { NextResponse } from "next/server";
import { exigirAcessoPedidosLoja } from "@/lib/wcSessao"; // 12/11/2026: diagnóstico só com login
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
    const bloqueio = await exigirAcessoPedidosLoja(req);
    if (bloqueio) return bloqueio;

    const all = process.env ?? {};
    const wcKeys = Object.keys(all).filter(k => k.startsWith("WC_"));
    return NextResponse.json({
        node: typeof process !== "undefined",
        vercel: {
            env: all.VERCEL_ENV || null,          // production / preview / development
            url: all.VERCEL_URL || null,
            projectId: all.VERCEL_PROJECT_ID || null,
            gitRepo: `${all.VERCEL_GIT_REPO_OWNER || ""}/${all.VERCEL_GIT_REPO_SLUG || ""}` || null,
        },
        keysAllCount: Object.keys(all).length,
        wcKeys, // deveria listar ["WC_URL", "WC_CONSUMER_KEY", ...]
        has: {
            WC_URL: !!all.WC_URL,
            WC_CONSUMER_KEY: !!all.WC_CONSUMER_KEY,
            WC_CONSUMER_SECRET: !!all.WC_CONSUMER_SECRET,
            WC_WEBHOOK_SECRET: !!all.WC_WEBHOOK_SECRET,
        },
        hint: { WC_URL: all.WC_URL || null },
    });
}
