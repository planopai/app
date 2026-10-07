"use client";

import { clampInt, moneyBRL, roundCost } from "../../formato";
import type { EstoqueDados } from "../../useEstoqueDados";
import type { ListaProdutos } from "../useListaProdutos";

// Lista de produtos em PDF.

export function useExportarPDF(n: EstoqueDados, prod: ListaProdutos) {
    const { catById, fabById } = n;
    const { custoMedioMovelProduto, estoqueRows, getFiltroResumo } = prod;

    // ✅ PDF REAL (download direto) - Estoque filtrado com custo unitário e total
    async function exportarEstoquePDF() {
        if (!estoqueRows.length) {
            alert("Nenhum item para exportar com os filtros atuais.");
            return;
        }

        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;

        const LOGO_URL =
            "https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1";

        const f = getFiltroResumo();
        const geradoEm = new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date());

        const norm = (s: string) =>
            (s || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim()
                .toUpperCase();

        // Mesma lista filtrada exibida na aba Produtos.
        const sortedRows = [...estoqueRows].sort((a, b) => {
            const depA = norm(a.d?.nome || "");
            const depB = norm(b.d?.nome || "");
            if (depA !== depB) return depA.localeCompare(depB, "pt-BR");

            const catA = norm(a.p?.categoria_nome || "");
            const catB = norm(b.p?.categoria_nome || "");
            if (catA !== catB) return catA.localeCompare(catB, "pt-BR");

            const fabA = norm(a.p?.fabricante_nome || "");
            const fabB = norm(b.p?.fabricante_nome || "");
            if (fabA !== fabB) return fabA.localeCompare(fabB, "pt-BR");

            return (a.p?.nome || "").localeCompare(b.p?.nome || "", "pt-BR");
        });

        const isEmpty = (v: any) =>
            v === null || v === undefined || String(v).trim() === "";

        const hasCodigo = sortedRows.some((r) => !isEmpty(r.p?.codigo_barras));
        const hasDeposito = sortedRows.some((r) => !isEmpty(r.d?.nome));
        const hasCategoria = sortedRows.some((r) => !isEmpty(r.p?.categoria_nome));
        const hasFabricante = sortedRows.some((r) => !isEmpty(r.p?.fabricante_nome));

        let totalQuantidade = 0;
        let totalCustoEstoque = 0;
        const totalModelos = new Set(sortedRows.map((r) => Number(r.p.id))).size;

        const body = sortedRows.map(({ p, d, qtd }) => {
            const categoria =
                p.categoria_nome ||
                (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") ||
                "";

            const fabricante =
                p.fabricante_nome ||
                (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") ||
                "";

            const quantidade = clampInt(qtd);
            const precoCustoUnitario = custoMedioMovelProduto(p.id);
            // Regra solicitada: Total = quantidade total x preço de custo unitário.
            const totalItem = roundCost(quantidade * precoCustoUnitario);

            totalQuantidade += quantidade;
            totalCustoEstoque += totalItem;

            const row: any[] = [p.nome];
            if (hasCodigo) row.push(p.codigo_barras || "");
            if (hasDeposito) row.push(d?.nome || "");
            if (hasCategoria) row.push(categoria);
            if (hasFabricante) row.push(fabricante);
            row.push(String(quantidade));
            row.push(moneyBRL(precoCustoUnitario));
            row.push(moneyBRL(totalItem));
            return row;
        });

        totalCustoEstoque = roundCost(totalCustoEstoque);

        async function toDataUrl(url: string): Promise<string | null> {
            try {
                const r = await fetch(url, { mode: "cors", cache: "no-store" });
                const b = await r.blob();
                return await new Promise<string>((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onerror = () => reject(new Error("Falha ao ler logo"));
                    fr.onload = () => resolve(String(fr.result || ""));
                    fr.readAsDataURL(b);
                });
            } catch {
                return null;
            }
        }

        const logoDataUrl = await toDataUrl(LOGO_URL);
        const logoFormat = logoDataUrl?.startsWith("data:image/jpeg") ? "JPEG" : "PNG";

        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const pageW = doc.internal.pageSize.getWidth();
        const marginX = 10;
        let y = 10;

        if (logoDataUrl) {
            doc.addImage(logoDataUrl, logoFormat as any, marginX, y, 55, 14);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Relatório de Estoque", marginX + 62, y + 8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Gerado em: ${geradoEm}`, marginX + 62, y + 14);

        y += 22;

        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(marginX, y, pageW - marginX * 2, 22, 2, 2, "FD");
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(8.5);

        doc.text(`Depósito: ${f.deposito}`, marginX + 3, y + 6);
        doc.text(`Categoria: ${f.categoria}`, marginX + 3, y + 11);
        doc.text(`Fabricante: ${f.fabricante}`, marginX + 3, y + 16);
        doc.text(`Classificação: ${(f as any).classificacao}`, marginX + 3, y + 21);
        doc.text(`Somente em alerta: ${f.somenteAlerta}`, pageW / 2, y + 6);
        doc.text(`Somente saldo > 0: ${(f as any).somenteSaldoPositivo}`, pageW / 2, y + 11);

        y += 28;

        // IMPORTANTE: estas são as ÚNICAS colunas do PDF.
        const head: string[] = [
            "Produto",
            ...(hasCodigo ? ["Código"] : []),
            ...(hasDeposito ? ["Depósito"] : []),
            ...(hasCategoria ? ["Categoria"] : []),
            ...(hasFabricante ? ["Fabricante"] : []),
            "Quantidade",
            "Preço de Custo (un)",
            "Total",
        ];

        const footRow = new Array(head.length).fill("");
        footRow[0] = `Modelos: ${totalModelos}`;

        const idxQtd = head.indexOf("Quantidade");
        if (idxQtd >= 0) footRow[idxQtd] = String(totalQuantidade);

        const idxTotal = head.indexOf("Total");
        if (idxTotal >= 0) footRow[idxTotal] = moneyBRL(totalCustoEstoque);

        autoTable(doc, {
            startY: y,
            head: [head],
            body,
            foot: [footRow],
            showFoot: "lastPage",
            margin: { left: marginX, right: marginX },
            styles: {
                font: "helvetica",
                fontSize: 8.2,
                cellPadding: 1.8,
                valign: "middle",
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
            },
            headStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: "bold",
                valign: "middle",
            },
            footStyles: {
                fillColor: [248, 250, 252],
                textColor: [15, 23, 42],
                fontStyle: "bold",
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
            },
            didParseCell: (data) => {
                const colName = head[data.column.index];
                if (["Quantidade", "Preço de Custo (un)", "Total"].includes(colName)) {
                    data.cell.styles.halign = "right";
                }
            },
            columnStyles: {
                0: { cellWidth: 76, overflow: "linebreak" },
            },
        });

        const safeName = `estoque_${new Date()
            .toISOString()
            .slice(0, 19)
            .replace(/[:T]/g, "-")}`.replace(/\s+/g, "_");

        doc.save(`${safeName}.pdf`);
    }

    return {
        exportarEstoquePDF,
    };
}

export type ExportarPDF = ReturnType<typeof useExportarPDF>;
