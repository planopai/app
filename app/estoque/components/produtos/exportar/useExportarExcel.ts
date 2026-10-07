"use client";

import { catalogoApiGet } from "../../api";
import type { CatalogoProdutoLinhasResp, ID } from "../../tipos";
import type { ListaProdutos } from "../useListaProdutos";

// Exportação da lista de produtos em Excel (3 abas).

export function useExportarExcel(prod: ListaProdutos) {
    const { estoqueRows } = prod;

    // ✅ EXCEL REAL (.xlsx)
    // Gera 3 abas no mesmo arquivo:
    // 1) Produtos: Produto, Código de Barras, Linha, Valor e barcode para leitura.
    // 2) Frente: etiquetas em grade 4 x 4 por página A4, com produto e linha.
    // 3) Verso: mesma grade 4 x 4 por página A4, com barcode e código numérico.
    //
    // Ajustes desta versão:
    // - Fonte Nunito em todas as células textuais das três abas.
    // - Linha do produto posicionada mais acima na aba Frente.
    // - Barcode mais centralizado na aba Verso.
    // - Número do código de barras maior e mais legível na aba Verso.
    // - Remoção de quebras manuais de página, evitando estruturas que o Excel pode reparar.
    async function exportarEstoqueExcel() {
        if (!estoqueRows.length) {
            alert("Nenhum item para exportar com os filtros atuais.");
            return;
        }

        try {
            // A coluna Linha vem do vínculo do produto com o catálogo.
            const linhasResp = await catalogoApiGet<CatalogoProdutoLinhasResp>({
                produto_linhas: 1,
                _ts: Date.now(),
            });

            if (!linhasResp.ok) {
                throw new Error(
                    linhasResp.msg || "Não foi possível carregar as linhas do catálogo."
                );
            }

            const linhaByProdutoId = new Map<ID, string>();
            for (const item of linhasResp.rows || []) {
                const produtoId = Number(item.produto_id || 0);
                if (!produtoId) continue;
                linhaByProdutoId.set(produtoId, String(item.linha || "").trim());
            }

            // Imports sob demanda para não aumentar o carregamento inicial da tela.
            const [ExcelJS, JsBarcodeModule] = await Promise.all([
                import("exceljs"),
                import("jsbarcode"),
            ]);

            const JsBarcode = JsBarcodeModule.default;
            const workbook = new ExcelJS.Workbook();

            workbook.creator = "Sistema de Materiais";
            workbook.lastModifiedBy = "Sistema de Materiais";
            workbook.created = new Date();
            workbook.modified = new Date();

            const FONT_NAME = "Nunito";

            type ProdutoExcel = {
                id: ID;
                nome: string;
                codigoBarras: string;
                linha: string;
                valor: number;
            };

            // A mesma lista filtrada da tela alimenta as três abas.
            const produtosExcel: ProdutoExcel[] = estoqueRows.map(({ p }) => ({
                id: Number(p.id),
                nome: String(p.nome || "").trim(),
                codigoBarras: String(p.codigo_barras || "").trim(),
                linha: linhaByProdutoId.get(Number(p.id)) || "",
                valor: Number(p.valor) || 0,
            }));

            // Cache único: o mesmo barcode é reutilizado nas abas Produtos e Verso.
            const barcodeCache = new Map<
                string,
                { dataUrl: string; imageId: number }
            >();

            function getBarcodeAsset(
                codigo: string
            ): { dataUrl: string; imageId: number } | null {
                const valor = String(codigo || "").trim();
                if (!valor) return null;

                const cached = barcodeCache.get(valor);
                if (cached) return cached;

                try {
                    const canvas = document.createElement("canvas");

                    JsBarcode(canvas, valor, {
                        format: "CODE128",
                        // O número é escrito em uma célula separada para podermos
                        // controlar fonte, tamanho e alinhamento independentemente.
                        displayValue: false,
                        height: 52,
                        width: 2,
                        margin: 4,
                        background: "#ffffff",
                        lineColor: "#000000",
                    });

                    const dataUrl = canvas.toDataURL("image/png");
                    const imageId = workbook.addImage({
                        base64: dataUrl,
                        extension: "png",
                    });

                    const asset = { dataUrl, imageId };
                    barcodeCache.set(valor, asset);
                    return asset;
                } catch (err) {
                    console.warn(
                        `Não foi possível gerar o código de barras ${valor}.`,
                        err
                    );
                    return null;
                }
            }

            /* =========================================================
               ABA 1: PRODUTOS
            ========================================================= */

            const worksheet = workbook.addWorksheet("Produtos");

            worksheet.columns = [
                { header: "Produto", key: "produto", width: 38 },
                { header: "Código de Barras", key: "codigo", width: 22 },
                { header: "Linha", key: "linha", width: 28 },
                { header: "Valor", key: "valor", width: 16 },
                {
                    header: "Código de Barras para Leitura",
                    key: "barcodeImagem",
                    width: 34,
                },
            ];

            const headerRow = worksheet.getRow(1);
            headerRow.height = 30;
            headerRow.font = {
                name: FONT_NAME,
                size: 11,
                bold: true,
                color: { argb: "FF000000" },
            };
            headerRow.alignment = {
                vertical: "middle",
                horizontal: "center",
                wrapText: true,
            };

            headerRow.eachCell((cell) => {
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FFF1F5F9" },
                };
                cell.border = {
                    bottom: {
                        style: "thin",
                        color: { argb: "FFD1D5DB" },
                    },
                };
            });

            worksheet.views = [
                {
                    state: "frozen",
                    ySplit: 1,
                    activeCell: "A1",
                },
            ];
            worksheet.autoFilter = { from: "A1", to: "E1" };

            // Código em texto para preservar zeros à esquerda e códigos longos.
            worksheet.getColumn("codigo").numFmt = "@";
            worksheet.getColumn("valor").numFmt = 'R$ #,##0.00';

            for (const produto of produtosExcel) {
                const row = worksheet.addRow({
                    produto: produto.nome,
                    codigo: produto.codigoBarras,
                    linha: produto.linha,
                    valor: produto.valor,
                    barcodeImagem: "",
                });

                row.height = 58;
                row.font = {
                    name: FONT_NAME,
                    size: 10,
                    color: { argb: "FF000000" },
                };
                row.alignment = {
                    vertical: "middle",
                    wrapText: true,
                };

                // Reforça o tipo texto do código.
                const codigoCell = row.getCell(2);
                codigoCell.value = produto.codigoBarras;
                codigoCell.numFmt = "@";
                codigoCell.font = {
                    name: FONT_NAME,
                    size: 10,
                    color: { argb: "FF000000" },
                };
                codigoCell.alignment = {
                    vertical: "middle",
                    horizontal: "center",
                };

                row.getCell(1).font = {
                    name: FONT_NAME,
                    size: 10,
                    color: { argb: "FF000000" },
                };
                row.getCell(3).font = {
                    name: FONT_NAME,
                    size: 10,
                    color: { argb: "FF000000" },
                };
                row.getCell(4).font = {
                    name: FONT_NAME,
                    size: 10,
                    color: { argb: "FF000000" },
                };
                row.getCell(4).alignment = {
                    vertical: "middle",
                    horizontal: "right",
                };
                row.getCell(5).font = {
                    name: FONT_NAME,
                    size: 10,
                    color: { argb: "FF000000" },
                };
                row.getCell(5).alignment = {
                    vertical: "middle",
                    horizontal: "center",
                };

                const barcodeAsset = getBarcodeAsset(produto.codigoBarras);
                if (barcodeAsset) {
                    worksheet.addImage(barcodeAsset.imageId, {
                        tl: {
                            col: 4.12,
                            row: row.number - 0.84,
                        },
                        ext: {
                            width: 202,
                            height: 47,
                        },
                        editAs: "oneCell",
                    });
                }
            }

            /* =========================================================
               ABAS 2 E 3: FRENTE / VERSO
               Cada página A4 possui 4 colunas x 4 linhas = 16 produtos.
            ========================================================= */

            const frente = workbook.addWorksheet("Frente");
            const verso = workbook.addWorksheet("Verso");

            const ETIQUETAS_POR_LINHA = 4;
            const LINHAS_POR_PAGINA = 4;
            const ETIQUETAS_POR_PAGINA =
                ETIQUETAS_POR_LINHA * LINHAS_POR_PAGINA;

            // Cada etiqueta ocupa 8 linhas e uma linha curta de respiro.
            const LINHAS_ETIQUETA = 8;
            const LINHA_RESPIRO = 1;
            const BLOCO_LINHAS = LINHAS_ETIQUETA + LINHA_RESPIRO;
            const LINHAS_POR_PAGINA_EXCEL = LINHAS_POR_PAGINA * BLOCO_LINHAS;

            // Etiquetas em A, C, E e G. B, D e F são espaços entre cartões.
            const COLUNAS_ETIQUETA = [1, 3, 5, 7];

            const totalPaginas = Math.max(
                1,
                Math.ceil(produtosExcel.length / ETIQUETAS_POR_PAGINA)
            );
            const totalSlots = totalPaginas * ETIQUETAS_POR_PAGINA;
            const totalLinhasImpressao =
                totalPaginas * LINHAS_POR_PAGINA_EXCEL;

            const bordaFina = {
                style: "thin",
                color: { argb: "FF000000" },
            } as const;

            function letraColuna(numero: number): string {
                let n = numero;
                let out = "";

                while (n > 0) {
                    const resto = (n - 1) % 26;
                    out = String.fromCharCode(65 + resto) + out;
                    n = Math.floor((n - 1) / 26);
                }

                return out;
            }

            function configurarFolhaEtiquetas(sheet: any) {
                // Largura dos quatro cartões.
                for (const col of COLUNAS_ETIQUETA) {
                    sheet.getColumn(col).width = 24;
                }

                // Espaçamento entre os cartões.
                sheet.getColumn(2).width = 2.5;
                sheet.getColumn(4).width = 2.5;
                sheet.getColumn(6).width = 2.5;

                // Alturas fixas mantêm o desenho 4 x 4 constante.
                for (let page = 0; page < totalPaginas; page++) {
                    const pageStart = page * LINHAS_POR_PAGINA_EXCEL + 1;

                    for (let fila = 0; fila < LINHAS_POR_PAGINA; fila++) {
                        const inicio = pageStart + fila * BLOCO_LINHAS;

                        for (let r = inicio; r < inicio + LINHAS_ETIQUETA; r++) {
                            sheet.getRow(r).height = 22;
                        }

                        sheet.getRow(inicio + LINHAS_ETIQUETA).height = 8;
                    }
                }

                sheet.views = [{ showGridLines: false }];

                // A4 retrato.
                // Não são usadas quebras manuais via addPageBreak(), pois a combinação
                // de rowBreaks + merges + imagens pode fazer algumas versões do Excel
                // abrirem o arquivo pedindo reparo.
                sheet.pageSetup = {
                    paperSize: 9,
                    orientation: "portrait",
                    fitToPage: true,
                    fitToWidth: 1,
                    fitToHeight: totalPaginas,
                    pageOrder: "downThenOver",
                    horizontalCentered: true,
                    verticalCentered: false,
                    margins: {
                        left: 0.18,
                        right: 0.18,
                        top: 0.20,
                        bottom: 0.20,
                        header: 0.1,
                        footer: 0.1,
                    },
                    printArea: `$A$1:$G$${totalLinhasImpressao}`,
                };

                sheet.headerFooter = {
                    oddHeader: "",
                    oddFooter: "",
                };
            }

            configurarFolhaEtiquetas(frente);
            configurarFolhaEtiquetas(verso);

            /* =========================================================
               FRENTE
            ========================================================= */

            function desenharFrente(
                sheet: any,
                coluna: number,
                linhaInicial: number,
                produto: ProdutoExcel | null
            ) {
                const letra = letraColuna(coluna);
                const linhaFinal = linhaInicial + LINHAS_ETIQUETA - 1;

                // Produto ocupa as 6 primeiras linhas.
                // A Linha ocupa as duas últimas linhas, ficando visivelmente
                // mais alta do que na versão anterior, onde ficava só na última.
                const linhaFinalProduto = linhaInicial + 5;
                const linhaInicialLinha = linhaInicial + 6;

                const faixaProduto =
                    `${letra}${linhaInicial}:${letra}${linhaFinalProduto}`;
                const faixaLinha =
                    `${letra}${linhaInicialLinha}:${letra}${linhaFinal}`;

                sheet.mergeCells(faixaProduto);
                sheet.mergeCells(faixaLinha);

                const produtoCell = sheet.getCell(linhaInicial, coluna);
                produtoCell.value = produto?.nome || "";
                produtoCell.font = {
                    name: FONT_NAME,
                    size: 10,
                    bold: false,
                    color: { argb: "FF000000" },
                };
                produtoCell.alignment = {
                    horizontal: "center",
                    vertical: "middle",
                    wrapText: true,
                    shrinkToFit: true,
                };
                produtoCell.border = {
                    top: bordaFina,
                    left: bordaFina,
                    right: bordaFina,
                };

                const linhaCell = sheet.getCell(linhaInicialLinha, coluna);
                linhaCell.value = produto?.linha || "";
                linhaCell.font = {
                    name: FONT_NAME,
                    size: 8,
                    bold: true,
                    color: { argb: "FF000000" },
                };
                linhaCell.alignment = {
                    horizontal: "center",
                    vertical: "middle",
                    wrapText: true,
                    shrinkToFit: true,
                };
                linhaCell.border = {
                    bottom: bordaFina,
                    left: bordaFina,
                    right: bordaFina,
                };
            }

            /* =========================================================
               VERSO
            ========================================================= */

            function desenharVerso(
                sheet: any,
                coluna: number,
                linhaInicial: number,
                produto: ProdutoExcel | null
            ) {
                const letra = letraColuna(coluna);
                const linhaFinal = linhaInicial + LINHAS_ETIQUETA - 1;
                const linhaFinalImagem = linhaInicial + 5;
                const linhaInicialCodigo = linhaInicial + 6;

                const faixaImagem =
                    `${letra}${linhaInicial}:${letra}${linhaFinalImagem}`;
                const faixaCodigo =
                    `${letra}${linhaInicialCodigo}:${letra}${linhaFinal}`;

                sheet.mergeCells(faixaImagem);
                sheet.mergeCells(faixaCodigo);

                const imagemCell = sheet.getCell(linhaInicial, coluna);
                imagemCell.value = "";
                imagemCell.font = {
                    name: FONT_NAME,
                    size: 10,
                    color: { argb: "FF000000" },
                };
                imagemCell.alignment = {
                    horizontal: "center",
                    vertical: "middle",
                };
                imagemCell.border = {
                    top: bordaFina,
                    left: bordaFina,
                    right: bordaFina,
                };

                const codigoCell = sheet.getCell(linhaInicialCodigo, coluna);
                codigoCell.value = produto?.codigoBarras || "";
                codigoCell.numFmt = "@";
                codigoCell.font = {
                    name: FONT_NAME,
                    // Aumentado de 7 para 10 para melhorar a leitura.
                    size: 10,
                    bold: false,
                    color: { argb: "FF000000" },
                };
                codigoCell.alignment = {
                    horizontal: "center",
                    vertical: "middle",
                    wrapText: false,
                    shrinkToFit: true,
                };
                codigoCell.border = {
                    bottom: bordaFina,
                    left: bordaFina,
                    right: bordaFina,
                };

                if (!produto?.codigoBarras) return;

                const barcodeAsset = getBarcodeAsset(produto.codigoBarras);
                if (!barcodeAsset) return;

                // O barcode foi deslocado para a direita em relação à versão anterior,
                // corrigindo a aparência de imagem puxada para a esquerda.
                sheet.addImage(barcodeAsset.imageId, {
                    tl: {
                        col: coluna - 1 + 0.14,
                        row: linhaInicial - 1 + 1.62,
                    },
                    ext: {
                        width: 145,
                        height: 50,
                    },
                    editAs: "oneCell",
                });
            }

            // Cria todos os 16 slots de cada página, inclusive os vazios da última.
            // Isso mantém a geometria das folhas Frente e Verso idêntica.
            for (let slot = 0; slot < totalSlots; slot++) {
                const pagina = Math.floor(slot / ETIQUETAS_POR_PAGINA);
                const slotNaPagina = slot % ETIQUETAS_POR_PAGINA;
                const fila = Math.floor(slotNaPagina / ETIQUETAS_POR_LINHA);
                const colunaNaPagina = slotNaPagina % ETIQUETAS_POR_LINHA;

                const colunaExcel = COLUNAS_ETIQUETA[colunaNaPagina];
                const linhaInicial =
                    pagina * LINHAS_POR_PAGINA_EXCEL +
                    fila * BLOCO_LINHAS +
                    1;

                const produto = produtosExcel[slot] || null;

                desenharFrente(frente, colunaExcel, linhaInicial, produto);
                desenharVerso(verso, colunaExcel, linhaInicial, produto);
            }

            /* =========================================================
               GERAÇÃO / DOWNLOAD
            ========================================================= */

            const buffer = await workbook.xlsx.writeBuffer();

            // Cria um Uint8Array independente antes do Blob. Isso evita problemas
            // com buffers que tenham offset interno em alguns navegadores.
            const bytes = new Uint8Array(buffer as ArrayBuffer);

            const blob = new Blob([bytes], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });

            const url = URL.createObjectURL(blob);
            const safeName = `produtos_frente_verso_${new Date()
                .toISOString()
                .slice(0, 19)
                .replace(/[:T]/g, "-")}`;

            const a = document.createElement("a");
            a.href = url;
            a.download = `${safeName}.xlsx`;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            a.remove();

            // Não revoga imediatamente; dá tempo para o navegador consumir o Blob.
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        } catch (err: any) {
            console.error("Falha ao exportar Excel:", err);
            alert(
                err?.message
                    ? `Não foi possível gerar o Excel: ${err.message}`
                    : "Não foi possível gerar o arquivo Excel."
            );
        }
    }

    return {
        exportarEstoqueExcel,
    };
}

export type ExportarExcel = ReturnType<typeof useExportarExcel>;
