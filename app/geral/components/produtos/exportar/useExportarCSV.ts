"use client";

import { escapeCsvCell, moneyBRL } from "../../formato";
import type { EstoqueDados } from "../../useEstoqueDados";
import type { ListaProdutos } from "../useListaProdutos";

// Exportação da lista de produtos em CSV.

export function useExportarCSV(n: EstoqueDados, prod: ListaProdutos) {
    const { catById, fabById } = n;
    const { custoMedioMovelProduto, custoTotalMovelProduto, estoqueRows } = prod;

    function exportarEstoqueCSV() {
        if (!estoqueRows.length) {
            alert("Nenhum item para exportar com os filtros atuais.");
            return;
        }

        const sep = ";";
        const header = ["Produto", "Código de Barras", "Depósito", "Categoria", "Fabricante", "Quantidade", "Min", "Rep", "Valor (un)", "Preço de Custo (un)", "Custo Total"];


        const lines: string[] = [];
        lines.push("\uFEFF" + header.map((h) => escapeCsvCell(h, sep)).join(sep));

        for (const { p, d, qtd, s, min, rep } of estoqueRows) {
            const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
            const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
            const valorNum = Number(p.valor) || 0;
            const precoCustoNum = custoMedioMovelProduto(p.id);
            const custoTotalItem = custoTotalMovelProduto(p.id, qtd);

            lines.push(
                [p.nome, p.codigo_barras, d.nome, cat, fab, qtd, min, rep, moneyBRL(valorNum), moneyBRL(precoCustoNum), moneyBRL(custoTotalItem)]

                    .map((x) => escapeCsvCell(x, sep))
                    .join(sep)
            );
        }

        const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const safeName = `estoque_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    return {
        exportarEstoqueCSV,
    };
}

export type ExportarCSV = ReturnType<typeof useExportarCSV>;
