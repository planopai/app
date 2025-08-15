// app/api/wc/webhooks/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ========= Helpers ========= */
function getEnv(name: string, fallback?: string) {
    const v = process.env[name] ?? fallback;
    if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
    return v;
}

function safeEqual(a: string, b: string) {
    const A = Buffer.from(a || "", "utf8");
    const B = Buffer.from(b || "", "utf8");
    return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function verifyHmac(raw: string, signature: string | null) {
    const secret = process.env.WC_WEBHOOK_SECRET || "";
    if (!secret || !signature) return false;
    const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("base64");
    return safeEqual(signature, expected);
}

/* ========= OneSignal ========= */
async function sendOneSignal({
    title,
    body,
    externalId,
    data,
}: {
    title: string;
    body: string;
    externalId?: string;
    data?: Record<string, any>;
}) {
    // aceita ambos os nomes, já que você usa NEXT_PUBLIC_* e REST_API_KEY
    const appId = process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_API_KEY || process.env.ONESIGNAL_REST_API_KEY;
    if (!appId || !apiKey) throw new Error("ONESIGNAL_APP_ID/ONESIGNAL_API_KEY ausentes");

    const payload: any = {
        app_id: appId,
        included_segments: ["All"],
        headings: { pt: title, en: title },
        contents: { pt: body, en: body },
        data: data || {},
    };

    // evita duplicidade entre reenvios do Woo
    if (externalId) payload.external_id = externalId;

    const r = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Basic ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`OneSignal ${r.status}: ${txt}`);
    }
    return r.json();
}

/* ========= Webhook ========= */
export async function POST(req: Request) {
    try {
        // corpo cru para HMAC
        const raw = await req.text();
        const signature = req.headers.get("x-wc-webhook-signature");
        const topic = req.headers.get("x-wc-webhook-topic") || ""; // ex.: order.updated / order.created

        if (!verifyHmac(raw, signature)) {
            return new NextResponse("Invalid signature", { status: 401 });
        }

        const payload = JSON.parse(raw);

        // Normaliza objeto do pedido (Woo pode mandar formatos diferentes)
        const order = payload?.id ? payload : (payload?.data?.object || payload?.order || payload);

        const status = String(order?.status || "").toLowerCase();
        const isPaid =
            status === "processing" ||
            status === "completed" ||
            // alguns payloads trazem date_paid quando efetivamente pago
            Boolean(order?.date_paid || order?.date_paid_gmt);

        if (!isPaid) {
            return NextResponse.json({ ok: true, skipped: true, reason: "status_nao_pago", topic, status });
        }

        const orderId = order?.id ?? order?.number ?? "unknown";
        const title = "ATENÇÃO";
        const body = "ATENÇÃO: Você tem um novo pedido de Coroa de Flores!";

        // external_id: garante idempotência por pedido pago
        const externalId = `wc-order-${orderId}-paid`;

        const onesignal = await sendOneSignal({
            title,
            body,
            externalId,
            data: {
                tipo: "pedido_pago",
                order_id: order?.id ?? null,
                order_number: order?.number ?? null,
                status,
            },
        });

        return NextResponse.json({ ok: true, sent: true, topic, status, onesignal });
    } catch (e: any) {
        console.error("[wc/webhooks] erro:", e?.message || e);
        return NextResponse.json({ ok: false, error: e?.message || "erro" }, { status: 500 });
    }
}
