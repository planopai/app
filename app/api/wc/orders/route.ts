import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getWC } from "@/lib/woocommerce";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Meta = {
    key?: string;
    value?: unknown;
};

type WcLineItem = {
    id: number;
    name?: string;
    quantity?: number;
    total?: string | number;
    product_id?: number;
    variation_id?: number;
    sku?: string;
    meta_data?: Meta[];
    image?: {
        id?: number | string;
        src?: string;
    };
};

type WcOrderForProduction = {
    id: number;
    number?: string;
    status?: string;
    customer_note?: string;
    billing?: {
        first_name?: string;
        last_name?: string;
        phone?: string;
        email?: string;
    };
    shipping?: {
        first_name?: string;
        last_name?: string;
        address_1?: string;
        address_2?: string;
        city?: string;
        state?: string;
        postcode?: string;
    };
    meta_data?: Meta[];
    line_items?: WcLineItem[];
};

const COROAS_API =
    process.env.PAI_COROAS_API_URL ||
    "https://api.planoassistencialintegrado.com.br/coroas.php";

const FRASE_KEYS = [
    "frase_para_a_faixa",
    "frase da coroa",
    "frase da faixa",
    "frase_faixa",
    "faixa",
    "mensagem",
];

const FALECIDO_KEYS = [
    "shipping_falecido_nome",
    "falecido_nome",
    "nome_falecido",
    "nome_do_falecido",
];

function metaToString(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value == null) return "";

    try {
        const json = JSON.stringify(value);
        return json === "{}" || json === "[]" ? "" : json;
    } catch {
        return "";
    }
}

function findMetaValue(metas: Meta[] | undefined, keys: string[]): string {
    if (!Array.isArray(metas) || metas.length === 0) return "";

    const needles = keys.map((key) => key.toLocaleLowerCase("pt-BR"));

    for (const meta of metas) {
        const key = String(meta?.key || "").toLocaleLowerCase("pt-BR");
        if (!needles.some((needle) => key.includes(needle))) continue;

        const value = metaToString(meta?.value);
        if (value) return value;
    }

    return "";
}

function pedidoLiberadoParaConfeccao(order: WcOrderForProduction): boolean {
    const status = String(order?.status || "").trim().toLowerCase();
    return status === "processing" || status === "completed";
}

function nomeCliente(order: WcOrderForProduction): string {
    return [order.billing?.first_name, order.billing?.last_name]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" ");
}

function falecido(order: WcOrderForProduction): string {
    return (
        findMetaValue(order.meta_data, FALECIDO_KEYS) ||
        String(order.shipping?.first_name || "").trim()
    );
}

function localEntrega(order: WcOrderForProduction): string {
    return [
        order.shipping?.address_1,
        order.shipping?.address_2,
        order.shipping?.city,
        order.shipping?.state,
        order.shipping?.postcode,
    ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(", ");
}

function itensParaConfeccao(order: WcOrderForProduction) {
    const frasePedido = findMetaValue(order.meta_data, FRASE_KEYS);

    return (order.line_items || []).map((item) => ({
        wc_line_item_id: item.id,
        wc_product_id: item.product_id || null,
        wc_variation_id: item.variation_id || null,
        sku: String(item.sku || "").trim(),
        nome: String(item.name || "").trim(),
        quantidade: Math.max(1, Number(item.quantity || 1)),
        total: Number(item.total || 0),
        frase: findMetaValue(item.meta_data, FRASE_KEYS) || frasePedido,
        foto_url: String(item.image?.src || "").trim() || null,
    }));
}

async function enviarPedidoParaConfeccao(order: WcOrderForProduction) {
    if (!order?.id) {
        throw new Error("Pedido WooCommerce sem ID.");
    }

    if (!pedidoLiberadoParaConfeccao(order)) {
        return {
            sincronizado: false,
            ignorado: true,
            motivo: `status_${String(order.status || "desconhecido")}_nao_liberado`,
        };
    }

    const integrationKey = String(process.env.PAI_COROAS_INTEGRATION_KEY || "").trim();

    if (!integrationKey) {
        throw new Error("PAI_COROAS_INTEGRATION_KEY não configurada no Next.js.");
    }

    const itens = itensParaConfeccao(order);

    if (!itens.length) {
        throw new Error(`Pedido WooCommerce #${order.id} não possui itens.`);
    }

    const res = await fetch(COROAS_API, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-PAI-Integration-Key": integrationKey,
        },
        cache: "no-store",
        body: JSON.stringify({
            acao: "importar_online",
            woocommerce_order_id: String(order.id),
            solicitante: nomeCliente(order) || "Cliente Online",
            telefone: String(order.billing?.phone || "").trim(),
            local_entrega: localEntrega(order),
            observacoes: String(order.customer_note || "").trim(),
            falecido: falecido(order),
            status_pagamento: "pago",
            itens,
        }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.sucesso) {
        const detalhe = json?.msg || json?.message || `HTTP ${res.status}`;
        throw new Error(
            `Falha ao enviar pedido WooCommerce #${order.id} para Confecção: ${detalhe}`,
        );
    }

    return {
        sincronizado: true,
        resultado: json,
    };
}

function assinaturaWebhookValida(rawBody: string, recebida: string, secret: string): boolean {
    if (!recebida || !secret) return false;

    const esperada = createHmac("sha256", secret)
        .update(rawBody, "utf8")
        .digest("base64");

    const a = Buffer.from(esperada, "utf8");
    const b = Buffer.from(recebida.trim(), "utf8");

    return a.length === b.length && timingSafeEqual(a, b);
}

function positiveInt(value: string | null, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

/**
 * Lista os pedidos WooCommerce para a aba Pedidos Online.
 */
export async function GET(req: Request) {
    try {
        const wc = getWC();
        const { searchParams } = new URL(req.url);
        const page = positiveInt(searchParams.get("page"), 1);
        const per_page = Math.min(positiveInt(searchParams.get("per_page"), 20), 100);
        const status = searchParams.get("status") || undefined;
        const search = searchParams.get("search") || undefined;
        const after = searchParams.get("after") || undefined;
        const before = searchParams.get("before") || undefined;

        const params: Record<string, unknown> = { page, per_page };
        if (status) params.status = status;
        if (search) params.search = search;
        if (after) params.after = after;
        if (before) params.before = before;

        const { data, headers } = await wc.get("orders", params);
        const total = Number(headers["x-wp-total"] || 0);
        const totalPages = Number(headers["x-wp-totalpages"] || 0);

        return NextResponse.json({
            data,
            meta: { page, per_page, total, totalPages },
        });
    } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data;

        console.error("WC orders error:", status, data || err?.message);

        return NextResponse.json(
            {
                error: true,
                status,
                message: data?.message || err?.message || "Falha ao consultar WooCommerce.",
                details: data || null,
            },
            { status },
        );
    }
}

/**
 * Este POST é o webhook do WooCommerce.
 * Configure no WooCommerce a URL deste endpoint e o mesmo secret definido
 * em WC_WEBHOOK_SECRET. Quando o pedido chegar a processing/completed,
 * ele é inserido em coroas.php com status novo e aparece em Confecção.
 */
export async function POST(req: Request) {
    const rawBody = await req.text();
    const webhookSecret = String(process.env.WC_WEBHOOK_SECRET || "").trim();

    if (!webhookSecret) {
        console.error("WC webhook: WC_WEBHOOK_SECRET não configurado.");
        return NextResponse.json(
            { error: true, message: "Webhook WooCommerce não configurado no servidor." },
            { status: 500 },
        );
    }

    const assinatura = req.headers.get("x-wc-webhook-signature") || "";

    if (!assinaturaWebhookValida(rawBody, assinatura, webhookSecret)) {
        return NextResponse.json(
            { error: true, message: "Assinatura do webhook WooCommerce inválida." },
            { status: 401 },
        );
    }

    let order: WcOrderForProduction;

    try {
        order = JSON.parse(rawBody) as WcOrderForProduction;
    } catch {
        return NextResponse.json(
            { error: true, message: "JSON inválido no webhook WooCommerce." },
            { status: 400 },
        );
    }

    if (!order?.id) {
        return NextResponse.json(
            { error: true, message: "Pedido WooCommerce sem ID." },
            { status: 400 },
        );
    }

    if (!pedidoLiberadoParaConfeccao(order)) {
        return NextResponse.json({
            ok: true,
            ignorado: true,
            order_id: order.id,
            status: order.status || null,
        });
    }

    try {
        const resultado = await enviarPedidoParaConfeccao(order);

        return NextResponse.json({
            ok: true,
            order_id: order.id,
            ...resultado,
        });
    } catch (err: any) {
        console.error(
            `Falha ao sincronizar pedido WooCommerce #${order.id} com Confecção:`,
            err?.message || err,
        );

        // Retornamos 500 para que o WooCommerce considere a entrega malsucedida
        // e possa tentar o webhook novamente.
        return NextResponse.json(
            {
                error: true,
                order_id: order.id,
                message: err?.message || "Falha ao enviar pedido para Confecção.",
            },
            { status: 500 },
        );
    }
}