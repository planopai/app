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

const COROAS_API = "https://api.planoassistencialintegrado.com.br/coroas.php";
const STATUS_CONFECCAO = new Set(["processing", "completed"]);

const FRASE_KEYS = [
    "frase_para_a_faixa",
    "frase da coroa",
    "frase da faixa",
    "frase_faixa",
    "texto da faixa",
    "texto_faixa",
    "mensagem",
    "faixa",
];

const FALECIDO_KEYS = [
    "shipping_falecido_nome",
    "falecido_nome",
    "nome_falecido",
    "nome_do_falecido",
    "falecido",
];

function webhookSecret(): string {
    return String(process.env.WC_WEBHOOK_SECRET || "").trim();
}

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
    return STATUS_CONFECCAO.has(String(order?.status || "").trim().toLowerCase());
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

function assinaturaBase64(payload: string, secret: string): string {
    return createHmac("sha256", secret).update(payload, "utf8").digest("base64");
}

function assinaturaValida(payload: string, recebida: string, secret: string): boolean {
    if (!payload || !recebida || !secret) return false;

    const esperada = assinaturaBase64(payload, secret);
    const a = Buffer.from(esperada, "utf8");
    const b = Buffer.from(recebida.trim(), "utf8");

    return a.length === b.length && timingSafeEqual(a, b);
}

function positiveInt(value: string | null, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

function payloadImportacao(order: WcOrderForProduction): Record<string, unknown> {
    const itens = itensParaConfeccao(order);

    if (!itens.length) {
        throw new Error(`Pedido WooCommerce #${order.id} não possui itens.`);
    }

    return {
        acao: "importar_online",
        woocommerce_order_id: String(order.id),
        solicitante: nomeCliente(order) || "Cliente Online",
        telefone: String(order.billing?.phone || "").trim(),
        local_entrega: localEntrega(order),
        observacoes: String(order.customer_note || "").trim(),
        falecido: falecido(order),
        status_pagamento: "pago",
        itens,
    };
}

async function enviarPedidoParaConfeccao(order: WcOrderForProduction, requestOrigin: string) {
    if (!order?.id) throw new Error("Pedido WooCommerce sem ID.");

    if (!pedidoLiberadoParaConfeccao(order)) {
        return {
            sincronizado: false,
            ignorado: true,
            motivo: `status_${String(order.status || "desconhecido")}_nao_liberado`,
        };
    }

    const secret = webhookSecret();
    if (!secret) {
        throw new Error("WC_WEBHOOK_SECRET não configurado no Next.js.");
    }

    const body = JSON.stringify(payloadImportacao(order));
    const signature = assinaturaBase64(body, secret);
    const verifyUrl = new URL("/api/wc/orders?verify_internal=1", requestOrigin).toString();

    const res = await fetch(COROAS_API, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-PAI-Internal-Signature": signature,
            "X-PAI-Verify-Url": verifyUrl,
        },
        cache: "no-store",
        body,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.sucesso) {
        const detalhe = json?.msg || json?.message || `HTTP ${res.status}`;
        throw new Error(
            `Falha ao enviar pedido WooCommerce #${order.id} para Confecção: ${detalhe}`,
        );
    }

    return { sincronizado: true, resultado: json };
}

async function listarStatusCompleto(
    wc: ReturnType<typeof getWC>,
    status: "processing" | "completed",
    after?: string,
): Promise<WcOrderForProduction[]> {
    const out: WcOrderForProduction[] = [];
    let page = 1;
    const maxPages = 5;

    while (page <= maxPages) {
        const params: Record<string, unknown> = {
            status,
            page,
            per_page: 100,
        };
        if (after) params.after = after;

        const { data, headers } = await wc.get("orders", params);

        if (Array.isArray(data)) out.push(...(data as WcOrderForProduction[]));

        const totalPages = Math.max(1, Number(headers["x-wp-totalpages"] || 1));
        if (page >= totalPages) break;
        page += 1;
    }

    return out;
}

/**
 * GET normal: lista para a aba Pedidos Online.
 * GET ?sync_confeccao=1: reconcilia pedidos processing/completed com coroas.php.
 */
export async function GET(req: Request) {
    try {
        const wc = getWC();
        const url = new URL(req.url);
        const { searchParams } = url;

        if (searchParams.get("sync_confeccao") === "1") {
            // Pedidos em processing continuam ativos até serem produzidos.
            // Completed entra na reconciliação somente se for recente, para evitar
            // importar pedidos históricos antigos na primeira implantação.
            const completedAfter = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

            const [processing, completed] = await Promise.all([
                listarStatusCompleto(wc, "processing"),
                listarStatusCompleto(wc, "completed", completedAfter),
            ]);

            const pedidos = Array.from(
                new Map([...processing, ...completed].map((order) => [Number(order.id), order])).values(),
            );

            const resultados = await Promise.allSettled(
                pedidos.map((order) => enviarPedidoParaConfeccao(order, url.origin)),
            );

            const erros: Array<{ order_id: number; message: string }> = [];
            let sincronizados = 0;
            let duplicadosOuExistentes = 0;

            resultados.forEach((resultado, index) => {
                const orderId = Number(pedidos[index]?.id || 0);

                if (resultado.status === "fulfilled") {
                    sincronizados += 1;
                    if ((resultado.value as any)?.resultado?.duplicado) {
                        duplicadosOuExistentes += 1;
                    }
                    return;
                }

                erros.push({
                    order_id: orderId,
                    message: resultado.reason?.message || "Falha ao sincronizar pedido.",
                });
            });

            return NextResponse.json({
                ok: erros.length === 0,
                encontrados: pedidos.length,
                sincronizados,
                duplicados_ou_existentes: duplicadosOuExistentes,
                erros,
            });
        }

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
 * POST ?verify_internal=1 é usado pelo coroas.php apenas para validar
 * a assinatura interna do JSON. O segredo nunca sai do Next.js.
 * POST normal continua sendo o webhook do WooCommerce.
 */
export async function POST(req: Request) {
    const url = new URL(req.url);
    const secret = webhookSecret();

    if (!secret) {
        console.error("WC integration: WC_WEBHOOK_SECRET não configurado.");
        return NextResponse.json(
            { error: true, message: "WC_WEBHOOK_SECRET não configurado no servidor." },
            { status: 500 },
        );
    }

    if (url.searchParams.get("verify_internal") === "1") {
        const body = await req.json().catch(() => null) as
            | { payload?: unknown; signature?: unknown }
            | null;

        const payload = typeof body?.payload === "string" ? body.payload : "";
        const signature = typeof body?.signature === "string" ? body.signature : "";
        const valid = assinaturaValida(payload, signature, secret);

        return NextResponse.json({ valid }, { status: valid ? 200 : 401 });
    }

    const rawBody = await req.text();
    const assinaturaWoo = req.headers.get("x-wc-webhook-signature") || "";

    if (!assinaturaValida(rawBody, assinaturaWoo, secret)) {
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
        const resultado = await enviarPedidoParaConfeccao(order, url.origin);
        return NextResponse.json({ ok: true, order_id: order.id, ...resultado });
    } catch (err: any) {
        console.error(
            `Falha ao sincronizar pedido WooCommerce #${order.id} com Confecção:`,
            err?.message || err,
        );

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