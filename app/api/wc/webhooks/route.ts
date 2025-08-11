import { NextResponse } from "next/server";
import crypto from "crypto";

function safeEqual(a: string, b: string) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(req: Request) {
    const signature = req.headers.get("x-wc-webhook-signature") || "";
    const topic = req.headers.get("x-wc-webhook-topic") || ""; // ex.: order.created
    const payload = await req.text(); // precisa do corpo cru p/ HMAC

    const expected = crypto
        .createHmac("sha256", process.env.WC_WEBHOOK_SECRET!)
        .update(payload, "utf8")
        .digest("base64");

    if (!safeEqual(signature, expected)) {
        return new NextResponse("Invalid signature", { status: 401 });
    }

    // Assinatura ok — processa
    const json = JSON.parse(payload);
    // Ex.: se for novo pedido:
    if (topic === "order.created") {
        // TODO: gravar em DB, disparar notificação, revalidar cache, etc.
    }

    return NextResponse.json({ ok: true });
}
