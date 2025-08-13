// app/_osw/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ⛳️ use o worker v15 (sem /web/v16/)
const ONE_SIGNAL_SDK = "https://cdn.onesignal.com/sdks/OneSignalSDKWorker.js";

export async function GET() {
    try {
        const r = await fetch(ONE_SIGNAL_SDK, { cache: "no-store" });
        const js = await r.text();
        return new NextResponse(js, {
            status: r.status,
            headers: {
                "Content-Type": "application/javascript; charset=utf-8",
                "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
                "Service-Worker-Allowed": "/push/", // mantém o escopo /push/
            },
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Falha ao proxy o SDK OneSignal.";
        return NextResponse.json({ error: true, message }, { status: 502 });
    }
}
