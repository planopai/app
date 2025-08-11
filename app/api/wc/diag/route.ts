// app/api/wc/diag/route.ts
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
    const allKeys = Object.keys(process.env || {});
    const wcKeys = allKeys.filter(k => k.startsWith("WC_"));
    return NextResponse.json({
        node: typeof process !== "undefined",
        vercelEnv: process.env.VERCEL_ENV || null, // production / preview / development
        keysAllCount: allKeys.length,
        wcKeys, // nomes presentes começando com WC_
        has: {
            WC_URL: !!process.env.WC_URL,
            WC_CONSUMER_KEY: !!process.env.WC_CONSUMER_KEY,
            WC_CONSUMER_SECRET: !!process.env.WC_CONSUMER_SECRET,
            WC_WEBHOOK_SECRET: !!process.env.WC_WEBHOOK_SECRET,
        },
        hint: { WC_URL: process.env.WC_URL || null },
    });
}
