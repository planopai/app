// app/api/wc/webhook/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ========= OneSignal helper ========= */
async function sendOneSignal({
    title,
    body,
    imageUrl,
    data,
}: {
    title: string;
    body: string;
    imageUrl?: string;
    data?: Record<string, any>;
}) {
    const appId = process.env.ONESIGNAL_APP_ID!;
    const apiKey = process.env.ONESIGNAL_API_KEY!;
    if (!appId || !apiKey) throw new Error("ONESIGNAL_APP_ID/ONESIGNAL_API_KEY ausentes");

    const payload: any = {
        app_id: appId,
        included_segments: ["All"], // ajuste se quiser segmentar
        headings: { pt: title, en: title },
        contents: { pt: body, en: body },
        data: data || {},
    };
    if (imageUrl) {
        payload.big_picture = imageUrl;              // Android
        payload.ios_attachments = { img1: imageUrl };// iOS
    }

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

/* ========= Utils ========= */
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

function fmtBRL(v: string | number, currency = "BRL") {
    const num = typeof v === "string" ? Number(v) : v;
    if (Number.isNaN(num)) return String(v);
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(num);
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
        const order =
            payload?.id
                ? payload
                : payload?.data?.object || payload?.order || payload;

        const status = String(order?.status || "").toLowerCase();

        // Só dispara quando o pedido estiver pago/concluído.
        // (Para incluir 'processing', troque por: if (!["completed","processing"].includes(status)) { ... })
        if (status !== "completed") {
            return NextResponse.json({ ok: true, skipped: "status_nao_completed", topic, status });
        }

        // Monta campos básicos
        const orderId = order?.id;
        const orderNumber = order?.number || orderId;
        const total = order?.total ?? "0";
        const currency = order?.currency || "BRL";
        const valorFmt = fmtBRL(total, currency);
        const cliente = `${order?.billing?.first_name ?? ""} ${order?.billing?.last_name ?? ""}`.trim();
        const endereco = [order?.shipping?.address_1, order?.shipping?.address_2].filter(Boolean).join(" - ");
        const falecido = order?.shipping?.first_name ?? "";

        // Imagem do primeiro item (se o payload trouxer)
        let imageUrl: string | undefined;
        const withImg = (order?.line_items || []).find((li: any) => li?.image?.src);
        if (withImg?.image?.src) imageUrl = withImg.image.src;

        // Mensagem
        const title = "ATENÇÃO: Novo Pedido!";
        const body = `Pedido #${orderNumber} — ${cliente || "Cliente"} — ${valorFmt}`;

        // Dados extras (aparecem no payload da notificação)
        const data = {
            tipo: "pedido_novo",
            order_id: orderId,
            detalhes: {
                pedido: orderNumber,
                status,
                cliente,
                valor: valorFmt,
                falecido: falecido || "",
                local_entrega: endereco || "—",
                itens: (order?.line_items || []).map((i: any) => i?.name).filter(Boolean),
            },
            idem_key: `wc-order-${orderId}-completed`, // ajuda a evitar duplicidade se Woo reenviar
        };

        const resp = await sendOneSignal({ title, body, imageUrl, data });

        return NextResponse.json({ ok: true, sent: true, topic, status, onesignal: resp });
    } catch (e: any) {
        console.error("[wc/webhook] erro:", e?.message || e);
        return NextResponse.json({ ok: false, error: e?.message || "erro" }, { status: 500 });
    }
}
