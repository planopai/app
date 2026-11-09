/* =====================================================================
   reciboLoja.ts — Recibo do pedido da Loja On-line (09/11/2026)

   O mesmo recibo do app do WooCommerce ("Ver recibo"), montado pelo app do PAI com os dados do pedido
   que já chegam da loja (/api/wc/orders/{id}): quantia paga, data do pagamento, status, método de
   pagamento e resumo do pedido. Não depende de plugin nem da versão da loja.
   Visual dos documentos do PAI (logo, rodapé com endereço e CNPJ). Sem React.
   ===================================================================== */

import { carregarLogoPai } from "@/app/acompanhamento/components/termoVelorioOnline";

type Meta = { key?: string; value?: unknown };

export type PedidoLojaRecibo = {
    id: number;
    number?: string;
    status?: string;
    currency?: string;
    total?: string | number;
    shipping_total?: string | number;
    discount_total?: string | number;
    date_created?: string | null;
    date_paid?: string | null;
    payment_method_title?: string;
    transaction_id?: string;
    billing?: { first_name?: string; last_name?: string; phone?: string; email?: string };
    line_items?: Array<{ name?: string; quantity?: number; total?: string | number; meta_data?: Meta[] }>;
    shipping_lines?: Array<{ method_title?: string; total?: string | number }>;
    fee_lines?: Array<{ name?: string; total?: string | number }>;
};

const COR = { azul: "#313C55", cinza: "#6B7487", linha: "#DCE2EB", suave: "#F6F8FB", verde: "#EEF5D6" };
const PAG_W = 210;
const PAG_H = 297;
const MARG = 18;
const LARG = PAG_W - MARG * 2;

const STATUS: Record<string, string> = {
    completed: "Sucesso (concluído)",
    processing: "Sucesso (processando)",
    "on-hold": "Aguardando",
    pending: "Pendente",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
    failed: "Falhou",
};

function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function brl(v: unknown): string {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num(v));
}

function dataBR(v?: string | null, comHora = false): string {
    const s = String(v ?? "").trim();
    if (!s) return "—";
    const d = new Date(s.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return s;
    return comHora
        ? d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
        : d.toLocaleDateString("pt-BR");
}

type Doc = any;

function fonte(doc: Doc, tam: number, negrito = false, cor = COR.azul) {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(cor);
}

/** PDF do recibo (uma página A4). */
export async function gerarPdfReciboLoja(p: PedidoLojaRecibo): Promise<Blob> {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const logo = await carregarLogoPai();
    const numero = String(p.number || p.id);
    const cliente = [p.billing?.first_name, p.billing?.last_name].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");

    // Cabeçalho
    if (logo) {
        try {
            doc.addImage(logo, "PNG", MARG, 8, 33.5, 9, undefined, "FAST");
        } catch {
            /* sem logo */
        }
    }
    fonte(doc, 6.8, false, COR.cinza);
    doc.text(`Loja On-line · Pedido #${numero}`, PAG_W - MARG, 13.5, { align: "right" });

    let y = 32;
    fonte(doc, 14, true);
    doc.text("Recibo para PAI - Plano Assistencial Integrado", PAG_W / 2, y, { align: "center" });
    y += 6;
    fonte(doc, 8.5, false, COR.cinza);
    doc.text(`Pedido #${numero} da Loja On-line${cliente ? ` · ${cliente}` : ""}`, PAG_W / 2, y, { align: "center" });
    y += 10;

    // Bloco do pagamento (2 colunas)
    const pares: Array<[string, string]> = [
        ["QUANTIA PAGA", brl(p.total)],
        ["DATA DO PAGAMENTO", dataBR(p.date_paid || p.date_created, true)],
        ["STATUS DO PAGAMENTO", STATUS[String(p.status || "")] || String(p.status || "—")],
        ["MÉTODO DE PAGAMENTO", String(p.payment_method_title || "—")],
    ];
    if (String(p.transaction_id || "").trim()) pares.push(["IDENTIFICAÇÃO DA TRANSAÇÃO", String(p.transaction_id)]);
    const linhasBloco = Math.ceil(pares.length / 2);
    const hBloco = linhasBloco * 13 + 6;
    doc.setDrawColor(COR.linha);
    doc.setFillColor(COR.suave);
    doc.roundedRect(MARG, y, LARG, hBloco, 2, 2, "FD");
    pares.forEach(([rot, val], i) => {
        const col = i % 2;
        const lin = Math.floor(i / 2);
        const x = MARG + 6 + col * (LARG / 2);
        const yy = y + 8 + lin * 13;
        fonte(doc, 7, true, COR.cinza);
        doc.text(rot, x, yy, { charSpace: 0.3 });
        fonte(doc, 11, true);
        doc.text(doc.splitTextToSize(val, LARG / 2 - 10)[0] || "—", x, yy + 5.5);
    });
    y += hBloco + 10;

    // Resumo do pedido
    fonte(doc, 7.5, true, COR.cinza);
    doc.text(`RESUMO: PEDIDO #${numero}`, MARG, y, { charSpace: 0.35 });
    y += 3;
    doc.setDrawColor(COR.azul);
    doc.setLineWidth(0.4);
    doc.line(MARG, y, MARG + LARG, y);
    y += 6;

    const linha = (rotulo: string, valor: string, negrito = false, cor = COR.azul) => {
        fonte(doc, 9.5, negrito, cor);
        const partes = doc.splitTextToSize(rotulo, LARG - 40) as string[];
        doc.text(partes, MARG, y);
        doc.text(valor, MARG + LARG, y, { align: "right" });
        y += partes.length * 4.6 + 2;
        doc.setDrawColor(COR.linha);
        doc.setLineWidth(0.2);
        doc.line(MARG, y - 1.6, MARG + LARG, y - 1.6);
        y += 2;
    };

    let subtotal = 0;
    for (const it of p.line_items || []) {
        subtotal += num(it.total);
        linha(`${String(it.name || "Item").trim()} × ${Math.max(1, num(it.quantity) || 1)}`, brl(it.total));
    }
    for (const f of p.fee_lines || []) linha(String(f.name || "Taxa"), brl(f.total));
    linha("Subtotal", brl(subtotal), false, COR.cinza);
    if (num(p.discount_total) > 0) linha("Desconto", `- ${brl(p.discount_total)}`, false, COR.cinza);
    const frete = (p.shipping_lines || [])[0];
    if (frete || num(p.shipping_total) > 0) {
        linha(`Entrega${frete?.method_title ? ` · ${frete.method_title}` : ""}`, num(p.shipping_total) > 0 ? brl(p.shipping_total) : "Grátis", false, COR.cinza);
    }

    y += 1;
    doc.setFillColor(COR.verde);
    doc.roundedRect(MARG, y - 5, LARG, 10, 1.5, 1.5, "F");
    fonte(doc, 11, true);
    doc.text("Quantia paga", MARG + 4, y + 1.5);
    doc.text(brl(p.total), MARG + LARG - 4, y + 1.5, { align: "right" });
    y += 14;

    fonte(doc, 7.4, false, COR.cinza);
    doc.text(
        doc.splitTextToSize(
            `Recibo gerado pelo app do PAI com os dados do pedido #${numero} da Loja On-line ` +
                `(criado em ${dataBR(p.date_created, true)}). Emitido em ${new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`,
            LARG,
        ),
        MARG,
        y,
    );

    // Rodapé
    const yr = PAG_H - 14;
    doc.setDrawColor(COR.linha);
    doc.setLineWidth(0.2);
    doc.line(MARG, yr - 3, PAG_W - MARG, yr - 3);
    fonte(doc, 6.4, true);
    doc.text("77 3611.3248", MARG, yr);
    doc.text("Plantão 24h · 77 3611.2440", PAG_W - MARG, yr, { align: "right" });
    fonte(doc, 6.4, false);
    doc.text("Av. Dr. Clériston Andrade, 135 – Centro, Barreiras – BA", MARG, yr + 3);
    doc.text("CNPJ 03.726.651/0001-51", MARG, yr + 6);
    doc.text("Serviços Funerários", PAG_W - MARG, yr + 3, { align: "right" });

    return doc.output("blob") as Blob;
}

export function nomeArquivoReciboLoja(p: PedidoLojaRecibo): string {
    return `RECIBO_PEDIDO_${String(p.number || p.id).replace(/[^0-9A-Za-z]+/g, "")}.pdf`;
}

/** Busca o pedido na loja (pela rota do próprio app) e devolve o PDF do recibo. */
export async function obterReciboLoja(pedidoLojaId: string | number): Promise<{ blob: Blob; nomeArquivo: string }> {
    const res = await fetch(`/api/wc/orders/${encodeURIComponent(String(pedidoLojaId))}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.error) {
        throw new Error(json?.message || `Não foi possível buscar o pedido #${pedidoLojaId} na loja.`);
    }
    const pedido = json as PedidoLojaRecibo;
    return { blob: await gerarPdfReciboLoja(pedido), nomeArquivo: nomeArquivoReciboLoja(pedido) };
}
