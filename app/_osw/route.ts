// app/_osw/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_SIGNAL_SDK =
    "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js";

export async function GET() {
    try {
        const r = await fetch(ONE_SIGNAL_SDK, { cache: "no-store" });
        const js = await r.text();
        return new NextResponse(js, {
            status: r.status,
            headers: {
                "Content-Type": "application/javascript; charset=utf-8",
                "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
                // 👇 permite escopo fora do path do script
                "Service-Worker-Allowed": "/push/",
            },
        });
    } catch (e: any) {
        return NextResponse.json(
            { error: true, message: e?.message || "Falha ao proxy o SDK OneSignal." },
            { status: 502 }
        );
    }
}
