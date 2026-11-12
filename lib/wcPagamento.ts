// lib/wcPagamento.ts
/**
 * 12/11/2026 (Financeiro · Contas a receber): como o pedido da loja foi pago, lido do plugin Loja5 Cielo
 * (meta _dados_cielo_api e log_cielo). Vai no campo "pagamento" do importar_online do coroas.php, que grava
 * na tabela fin_coroa_pagamento (fin_coroas_site.php).
 * O NSU (ProofOfSale) é a chave para casar o pedido com o arquivo de vendas da Cielo, no cartão e no Pix.
 * Não leva número de cartão, nome do titular nem CPF.
 */
type PedidoLoja = {
    total?: string | number;
    payment_method?: string;
    payment_method_title?: string;
    date_paid?: string | null;
    meta_data?: Array<{ key?: string; value?: unknown }>;
};

export function pagamentoDoPedido(order: PedidoLoja): Record<string, unknown> {
    const metas = order.meta_data || [];
    const metodo = String(order.payment_method || "").trim();
    const titulo = String(order.payment_method_title || "").trim();

    let p: Record<string, any> = {};
    const bruto = metas.find((m) => String(m?.key || "") === "_dados_cielo_api")?.value;
    try {
        const j: any = typeof bruto === "string" ? JSON.parse(bruto) : bruto;
        if (j && typeof j === "object" && j.Payment && typeof j.Payment === "object") p = j.Payment;
    } catch {
        p = {};
    }

    const log = String(metas.find((m) => String(m?.key || "") === "log_cielo")?.value || "");
    const bandeira =
        (log.match(/\bno\s+([A-Za-zÀ-ú]+)\s*\(/) || [])[1] ||
        String(p?.CreditCard?.Brand || p?.DebitCard?.Brand || "").trim();

    const tipo = String(p?.Type || "");
    const texto = `${metodo} ${titulo}`.toLowerCase();
    const forma =
        tipo === "Pix" || texto.includes("pix")
            ? "PIX"
            : tipo === "DebitCard" || texto.includes("debit") || texto.includes("débito")
              ? "DEBITO"
              : tipo === "CreditCard" || texto.includes("cred") || texto.includes("créd") || texto.includes("cart")
                ? "CREDITO"
                : "OUTRO";

    return {
        metodo,
        titulo,
        forma,
        nsu: String(p?.ProofOfSale || "").trim(),
        tid: String(p?.Tid || "").trim(),
        autorizacao: String(p?.AuthorizationCode || "").trim(),
        payment_id: String(p?.PaymentId || "").trim(),
        pedido_cielo: String(p?.SentOrderId || p?.MerchantOrderId || "").trim(),
        bandeira,
        parcelas: Math.max(1, Number(p?.Installments || 1) || 1),
        valor: Number(order.total || 0) || null,
        pago_em: String(order.date_paid || "").trim() || null,
    };
}
