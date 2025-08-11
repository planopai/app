import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
    const keys = Object.keys(process.env || {}).filter(k => k.startsWith("WC_"));
    return NextResponse.json({
        node: typeof process !== "undefined",
        keys,                                     // quais variáveis WC_* existem
        has: {
            WC_URL: !!process.env.WC_URL,
            WC_CONSUMER_KEY: !!process.env.WC_CONSUMER_KEY,
            WC_CONSUMER_SECRET: !!process.env.WC_CONSUMER_SECRET,
            WC_WEBHOOK_SECRET: !!process.env.WC_WEBHOOK_SECRET,
        },
        hint: {
            WC_URL: process.env.WC_URL || null,     // deve ser https://planoassistencialintegrado.com.br (sem / no fim)
        }
    });
}
