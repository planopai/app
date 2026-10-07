"use client";

import { catalogoApiGet } from "../../api";
import type { CatalogoProdutoLinhasResp, ID } from "../../tipos";
import type { ListaProdutos } from "../useListaProdutos";

// Etiquetas dos produtos em PDF (TAG).

export function useExportarEtiquetas(prod: ListaProdutos) {
    const { estoqueRows } = prod;

    // ✅ ETIQUETAS PDF A4 — TAG PARA CORDÃO / V08
    // Layout pensado para corte com régua + estilete:
    // - 4 colunas x 4 linhas = 16 etiquetas por lado.
    // - Etiquetas ENCOSTADAS: sem GAP, sem moldura e sem linhas internas.
    // - Apenas pequenas marcas de corte nas bordas externas da folha.
    // - Frente: X de furação no topo, nome mais abaixo e linha maior no rodapé.
    // - Verso: X no topo, CODE128 abaixo do centro, número praticamente colado
    //   ao código e mensagem institucional maior, preta e forçada em duas linhas equilibradas.
    // - Todo texto da TAG está 5% maior que na V07, preto e sem negrito (peso 300).
    // - Verso espelhado horizontalmente para duplex em "virar na borda longa".
    async function exportarEtiquetasPDF() {
        if (!estoqueRows.length) {
            alert("Nenhum item para gerar etiquetas com os filtros atuais.");
            return;
        }

        try {
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

            const [{ default: jsPDF }, JsBarcodeModule] = await Promise.all([
                import("jspdf"),
                import("jsbarcode"),
            ]);
            const JsBarcode = JsBarcodeModule.default;

            type ProdutoEtiquetaPDF = {
                id: ID;
                nome: string;
                linha: string;
                codigoBarras: string;
            };

            const produtosEtiqueta: ProdutoEtiquetaPDF[] = estoqueRows.map(({ p }) => ({
                id: Number(p.id),
                nome: String(p.nome || "").trim(),
                linha: linhaByProdutoId.get(Number(p.id)) || "",
                codigoBarras: String(p.codigo_barras || "").trim(),
            }));

            const doc = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
                compress: true,
                putOnlyUsedFonts: true,
            });

            doc.setProperties({
                title: "Etiquetas TAG de Produtos",
                subject: "Etiquetas A4 4x4 frente e verso com guias de corte",
                author: "Sistema de Materiais",
                creator: "Sistema de Materiais",
            });

            try {
                (doc as any).viewerPreferences?.({
                    PrintScaling: "None",
                    Duplex: "DuplexFlipLongEdge",
                    PickTrayByPDFSize: true,
                });
            } catch {
                // viewerPreferences não existe em todas as versões do jsPDF.
            }

            // =========================
            // GEOMETRIA FÍSICA DA FOLHA
            // =========================
            const PAGE_W = 210;
            const PAGE_H = 297;
            const COLUNAS = 4;
            const LINHAS = 4;
            const ETIQUETAS_POR_PAGINA = COLUNAS * LINHAS;

            // Margem externa pequena, suficiente para impressoras A4 comuns.
            const MARGEM_X = 5;
            const MARGEM_Y = 5;

            // IMPORTANTE: não há espaço entre as etiquetas.
            const GAP_X = 0;
            const GAP_Y = 0;

            const ETIQUETA_W = (PAGE_W - MARGEM_X * 2) / COLUNAS; // 50 mm
            const ETIQUETA_H = (PAGE_H - MARGEM_Y * 2) / LINHAS; // 71,75 mm

            const FRASE_VERSO =
                "Consulte detalhes e valores com\nnossos consultores através desse código.";

            // =========================
            // POSIÇÃO DE CADA ETIQUETA
            // =========================
            function posicaoEtiqueta(slotNaPagina: number, espelharColunas: boolean) {
                const linha = Math.floor(slotNaPagina / COLUNAS);
                const colunaOriginal = slotNaPagina % COLUNAS;
                const coluna = espelharColunas
                    ? COLUNAS - 1 - colunaOriginal
                    : colunaOriginal;

                return {
                    x: MARGEM_X + coluna * (ETIQUETA_W + GAP_X),
                    y: MARGEM_Y + linha * (ETIQUETA_H + GAP_Y),
                };
            }

            // =========================
            // GUIAS DE CORTE
            // =========================
            // NÃO desenha retângulos nem linhas internas.
            // Para cada linha de corte, desenha somente um pequeno traço nas bordas
            // superior/inferior ou esquerda/direita da folha.
            function desenharGuiasDeCorte() {
                // V07: guias mais longas e fortes para ficarem claramente visíveis
                // na impressão, sem criar linhas atravessando as etiquetas.
                const LEN_TOPO_BASE = 6.5;
                const LEN_LATERAL = 10.0;
                const BORDA = 0.5;

                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.25);

                // Cortes verticais: marcas no topo e na base.
                for (let i = 0; i <= COLUNAS; i++) {
                    const x = MARGEM_X + i * ETIQUETA_W;
                    doc.line(x, BORDA, x, BORDA + LEN_TOPO_BASE);
                    doc.line(
                        x,
                        PAGE_H - BORDA - LEN_TOPO_BASE,
                        x,
                        PAGE_H - BORDA
                    );
                }

                // Cortes horizontais: marcas laterais bem mais compridas.
                for (let i = 0; i <= LINHAS; i++) {
                    const y = MARGEM_Y + i * ETIQUETA_H;
                    doc.line(BORDA, y, BORDA + LEN_LATERAL, y);
                    doc.line(
                        PAGE_W - BORDA - LEN_LATERAL,
                        y,
                        PAGE_W - BORDA,
                        y
                    );
                }
            }

            // =========================
            // TEXTO EM SEGOE UI LIGHT
            // =========================
            // jsPDF não usa fontes do sistema diretamente. Para obter Segoe UI Light
            // sem exigir um TTF dentro do projeto, o texto é desenhado em canvas pelo
            // navegador e inserido no PDF como PNG transparente em alta resolução.
            const TEXTO_CACHE = new Map<string, string>();
            const PX_POR_MM = 13; // ~330 DPI

            function familiaSegoe() {
                // V08: volta a priorizar Segoe UI Light, sem negrito.
                return '"Segoe UI Light", "Segoe UI", Arial, sans-serif';
            }

            function quebrarLinhaCanvas(
                ctx: CanvasRenderingContext2D,
                texto: string,
                maxWidthPx: number
            ) {
                // Respeita quebras manuais (\n). Isso permite controlar mensagens
                // institucionais para que fiquem visualmente equilibradas em duas linhas.
                const blocos = String(texto || "")
                    .split(/\r?\n/)
                    .map((bloco) => bloco.trim())
                    .filter(Boolean);

                const linhas: string[] = [];

                for (const bloco of blocos) {
                    const palavras = bloco.split(/\s+/).filter(Boolean);
                    let atual = "";

                    for (const palavra of palavras) {
                        const teste = atual ? `${atual} ${palavra}` : palavra;
                        if (!atual || ctx.measureText(teste).width <= maxWidthPx) {
                            atual = teste;
                        } else {
                            linhas.push(atual);
                            atual = palavra;
                        }
                    }

                    if (atual) linhas.push(atual);
                }

                return linhas;
            }

            function criarTextoPNG({
                texto,
                larguraMm,
                alturaMm,
                fontPt,
                minFontPt,
                maxLinhas,
                cinza,
                peso = 300,
            }: {
                texto: string;
                larguraMm: number;
                alturaMm: number;
                fontPt: number;
                minFontPt: number;
                maxLinhas: number;
                cinza: number;
                peso?: number;
            }): string | null {
                const valor = String(texto || "").trim();
                if (!valor) return null;

                const cacheKey = JSON.stringify({
                    valor,
                    larguraMm,
                    alturaMm,
                    fontPt,
                    minFontPt,
                    maxLinhas,
                    cinza,
                    peso,
                });
                const cached = TEXTO_CACHE.get(cacheKey);
                if (cached) return cached;

                const canvas = document.createElement("canvas");
                canvas.width = Math.max(2, Math.round(larguraMm * PX_POR_MM));
                canvas.height = Math.max(2, Math.round(alturaMm * PX_POR_MM));
                const ctx = canvas.getContext("2d");
                if (!ctx) return null;

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = `rgb(${cinza}, ${cinza}, ${cinza})`;

                const ptToPx = (pt: number) => pt * (25.4 / 72) * PX_POR_MM;
                let tamanhoPt = fontPt;
                let linhas: string[] = [];
                const maxWidthPx = canvas.width * 0.95;

                while (tamanhoPt >= minFontPt) {
                    const fontPx = ptToPx(tamanhoPt);
                    ctx.font = `${peso} ${fontPx}px ${familiaSegoe()}`;
                    linhas = quebrarLinhaCanvas(ctx, valor, maxWidthPx);

                    const lineHeightPx = fontPx * 1.08;
                    const totalH = linhas.length * lineHeightPx;
                    if (linhas.length <= maxLinhas && totalH <= canvas.height * 0.92) {
                        break;
                    }
                    tamanhoPt -= 0.25;
                }

                if (linhas.length > maxLinhas) {
                    linhas = linhas.slice(0, maxLinhas);
                    let ultima = linhas[maxLinhas - 1] || "";
                    const fontPx = ptToPx(Math.max(minFontPt, tamanhoPt));
                    ctx.font = `${peso} ${fontPx}px ${familiaSegoe()}`;
                    while (
                        ultima.length > 1 &&
                        ctx.measureText(`${ultima}…`).width > maxWidthPx
                    ) {
                        ultima = ultima.slice(0, -1);
                    }
                    linhas[maxLinhas - 1] = `${ultima.trimEnd()}…`;
                }

                const fontPx = ptToPx(Math.max(minFontPt, tamanhoPt));
                ctx.font = `${peso} ${fontPx}px ${familiaSegoe()}`;
                const lineHeightPx = fontPx * 1.08;
                const blocoH = linhas.length * lineHeightPx;
                const startY = (canvas.height - blocoH) / 2 + lineHeightPx / 2;

                linhas.forEach((linha, index) => {
                    ctx.fillText(linha, canvas.width / 2, startY + index * lineHeightPx);
                });

                const dataUrl = canvas.toDataURL("image/png");
                TEXTO_CACHE.set(cacheKey, dataUrl);
                return dataUrl;
            }

            function adicionarTextoImagem(args: {
                texto: string;
                x: number;
                y: number;
                largura: number;
                altura: number;
                fontPt: number;
                minFontPt: number;
                maxLinhas: number;
                cinza: number;
                peso?: number;
            }) {
                const png = criarTextoPNG({
                    texto: args.texto,
                    larguraMm: args.largura,
                    alturaMm: args.altura,
                    fontPt: args.fontPt,
                    minFontPt: args.minFontPt,
                    maxLinhas: args.maxLinhas,
                    cinza: args.cinza,
                    peso: args.peso,
                });
                if (!png) return;

                doc.addImage(
                    png,
                    "PNG",
                    args.x,
                    args.y,
                    args.largura,
                    args.altura,
                    undefined,
                    "FAST"
                );
            }

            function desenharXDeFuracao(x: number, y: number) {
                // Muito pequeno e discreto: apenas guia para o vazador/furador.
                adicionarTextoImagem({
                    texto: "X",
                    x: x + ETIQUETA_W / 2 - 2.2,
                    y: y + 4.0,
                    largura: 5.544,
                    altura: 4.284,
                    fontPt: 5.292,
                    minFontPt: 5.292,
                    maxLinhas: 1,
                    cinza: 0,
                    peso: 300,
                });
            }

            // =========================
            // CODE128 DO VERSO
            // =========================
            const BARCODE_CACHE = new Map<
                string,
                { dataUrl: string; widthPx: number; heightPx: number } | null
            >();

            function gerarBarcode(codigo: string) {
                const valor = String(codigo || "").trim();
                if (!valor) return null;
                if (BARCODE_CACHE.has(valor)) return BARCODE_CACHE.get(valor) || null;

                try {
                    const canvas = document.createElement("canvas");
                    JsBarcode(canvas, valor, {
                        format: "CODE128",
                        displayValue: false,
                        width: 2.4,
                        height: 100,
                        margin: 10,
                        background: "#ffffff",
                        lineColor: "#000000",
                    });

                    const asset = {
                        dataUrl: canvas.toDataURL("image/png"),
                        widthPx: Math.max(1, canvas.width),
                        heightPx: Math.max(1, canvas.height),
                    };
                    BARCODE_CACHE.set(valor, asset);
                    return asset;
                } catch (err) {
                    console.warn(`Não foi possível gerar CODE128 para ${valor}.`, err);
                    BARCODE_CACHE.set(valor, null);
                    return null;
                }
            }

            // =========================
            // FRENTE
            // =========================
            function desenharFrente(
                slotNaPagina: number,
                produto: ProdutoEtiquetaPDF | null
            ) {
                const { x, y } = posicaoEtiqueta(slotNaPagina, false);
                desenharXDeFuracao(x, y);
                if (!produto) return;

                // Nome propositalmente mais baixo que no layout anterior.
                // Centro visual aproximado em 57% da altura da etiqueta.
                adicionarTextoImagem({
                    texto: produto.nome,
                    x: x + 5,
                    y: y + ETIQUETA_H * 0.47,
                    largura: ETIQUETA_W - 10,
                    altura: 18.9,
                    fontPt: 12.852,
                    minFontPt: 8.064,
                    maxLinhas: 3,
                    cinza: 0,
                    peso: 300,
                });

                // Linha bem menor, sem separador, próxima da base.
                if (produto.linha) {
                    adicionarTextoImagem({
                        texto: produto.linha,
                        x: x + 6,
                        y: y + ETIQUETA_H - 11.4,
                        largura: ETIQUETA_W - 12,
                        altura: 7.812,
                        fontPt: 7.686,
                        minFontPt: 6.552,
                        maxLinhas: 2,
                        cinza: 0,
                        peso: 300,
                    });
                }
            }

            // =========================
            // VERSO
            // =========================
            function desenharVerso(
                slotNaPagina: number,
                produto: ProdutoEtiquetaPDF | null
            ) {
                const { x, y } = posicaoEtiqueta(slotNaPagina, true);
                desenharXDeFuracao(x, y);
                if (!produto) return;

                const codigo = produto.codigoBarras;
                const asset = gerarBarcode(codigo);

                // O barcode fica abaixo do centro geométrico, como na referência.
                // Sua caixa começa aproximadamente em 48% da altura do cartão.
                const barcodeMaxW = 31.5;
                const barcodeMaxH = 14.5;
                let barcodeBottom = y + ETIQUETA_H * 0.48 + barcodeMaxH;

                if (asset) {
                    const scale = Math.min(
                        barcodeMaxW / asset.widthPx,
                        barcodeMaxH / asset.heightPx
                    );
                    const w = asset.widthPx * scale;
                    const h = asset.heightPx * scale;
                    const bx = x + (ETIQUETA_W - w) / 2;
                    const by = y + ETIQUETA_H * 0.48;
                    barcodeBottom = by + h;

                    doc.addImage(asset.dataUrl, "PNG", bx, by, w, h, undefined, "FAST");

                    // Número minúsculo e praticamente colado ao barcode.
                    adicionarTextoImagem({
                        texto: codigo,
                        x: x + 7,
                        // A imagem de texto começa ligeiramente sobre a base do barcode;
                        // como o texto fica centralizado no canvas, o resultado visual é
                        // o número praticamente colado às barras.
                        y: barcodeBottom - 0.55,
                        largura: ETIQUETA_W - 14,
                        altura: 3.276,
                        fontPt: 5.04,
                        minFontPt: 4.662,
                        maxLinhas: 1,
                        cinza: 0,
                        peso: 300,
                    });
                } else {
                    adicionarTextoImagem({
                        texto: codigo ? `Código inválido: ${codigo}` : "Sem código",
                        x: x + 6,
                        y: y + ETIQUETA_H * 0.49,
                        largura: ETIQUETA_W - 12,
                        altura: 10.08,
                        fontPt: 6.552,
                        minFontPt: 5.292,
                        maxLinhas: 2,
                        cinza: 0,
                        peso: 300,
                    });
                }

                // Frase institucional no rodapé, pequena e discreta.
                adicionarTextoImagem({
                    texto: FRASE_VERSO,
                    x: x + 4.0,
                    y: y + ETIQUETA_H - 10.8,
                    largura: ETIQUETA_W - 8,
                    altura: 10.08,
                    fontPt: 6.048,
                    minFontPt: 5.544,
                    maxLinhas: 2,
                    cinza: 0,
                    peso: 300,
                });
            }

            const totalPaginasFrente = Math.max(
                1,
                Math.ceil(produtosEtiqueta.length / ETIQUETAS_POR_PAGINA)
            );

            for (let pagina = 0; pagina < totalPaginasFrente; pagina++) {
                if (pagina > 0) doc.addPage("a4", "portrait");

                const inicio = pagina * ETIQUETAS_POR_PAGINA;

                // FRENTE
                desenharGuiasDeCorte();
                for (let slot = 0; slot < ETIQUETAS_POR_PAGINA; slot++) {
                    desenharFrente(slot, produtosEtiqueta[inicio + slot] || null);
                }

                // VERSO imediatamente após a frente correspondente.
                doc.addPage("a4", "portrait");
                desenharGuiasDeCorte();
                for (let slot = 0; slot < ETIQUETAS_POR_PAGINA; slot++) {
                    desenharVerso(slot, produtosEtiqueta[inicio + slot] || null);
                }
            }

            const safeName = `etiquetas_tag_v08_${new Date()
                .toISOString()
                .slice(0, 19)
                .replace(/[:T]/g, "-")}`;

            doc.save(`${safeName}.pdf`);
        } catch (err: any) {
            console.error("Falha ao gerar Etiqueta PDF TAG V08:", err);
            alert(
                err?.message
                    ? `Não foi possível gerar as etiquetas em PDF: ${err.message}`
                    : "Não foi possível gerar as etiquetas em PDF."
            );
        }
    }

    return {
        exportarEtiquetasPDF,
    };
}

export type ExportarEtiquetas = ReturnType<typeof useExportarEtiquetas>;
