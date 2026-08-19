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

export async function GET(_: Request, { params }: { params: { id: string } }) {
    try {
        const wc = getWC();
        const { data } = await wc.get(`orders/${params.id}`);
        return NextResponse.json(data);
    } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data;

        console.error("WC order detail error:", status, data || err?.message);

        return NextResponse.json(
            {
                error: true,
                status,
                message: data?.message || err?.message || "Falha ao consultar pedido WooCommerce.",
                details: data || null,
            },
            { status },
        );
    }
}

/**
 * Atualiza o status no WooCommerce. Se o novo status liberar a produção,
 * o mesmo pedido também é sincronizado com coroas.php.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const wc = getWC();
        const body = await req.json();
        const { data } = await wc.put(`orders/${params.id}`, body);

        let confeccao: unknown = null;

        if (pedidoLiberadoParaConfeccao(data)) {
            try {
                confeccao = await enviarPedidoParaConfeccao(data);
            } catch (syncError: any) {
                // O status do WooCommerce já foi atualizado. Mantemos essa alteração
                // e informamos separadamente a eventual falha da sincronização.
                console.error(
                    `Pedido WC #${params.id} atualizado, mas falhou ao sincronizar com Confecção:`,
                    syncError?.message || syncError,
                );

                confeccao = {
                    sincronizado: false,
                    erro: syncError?.message || "Falha ao sincronizar com a Confecção.",
                };
            }
        }

        return NextResponse.json({
            ...data,
            _confeccao: confeccao,
        });
    } catch (err: any) {
        const status = err?.response?.status || 500;
        const data = err?.response?.data;

        console.error("WC order patch error:", status, data || err?.message);

        return NextResponse.json(
            {
                error: true,
                status,
                message: data?.message || err?.message || "Falha ao atualizar WooCommerce.",
                details: data || null,
            },
            { status },
        );
    }
}