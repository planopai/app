/**
 * PDF da folha da OS gerado no próprio aparelho, só com o jsPDF já instalado (+ jspdf-autotable) — 08/10/2026.
 *
 * A folha continua sendo montada pelo servidor (os_documentos.php, formato=visualizar): as regras ficam num lugar só
 * (sem "diferença", coroas agrupadas, NP, declaração, assinatura). Aqui ela é lida e redesenhada em A4:
 *  - faixa de cores, logo e cabeçalho; quadros (.caixa) e molduras (.moldura) com os campos;
 *  - a tabela de itens pelo autotable (quebra de folha entre linhas, cabeçalho repetido);
 *  - o bloco final (pagamento, NP, declaração, assinatura e rodapé) nunca se divide: se não couber, vai inteiro para a
 *    folha seguinte, com o número da OS e o falecido no topo.
 * Fonte Helvetica do próprio PDF (caracteres fora dela são trocados por equivalentes).
 */
import type { jsPDF as JsPDF } from "jspdf";

type Run = { t: string; b: boolean };

const MM = 0.3528; // 1 pt em mm
const PAG_W = 210;
const PAG_H = 297;
const MARG = 11;
const LARG = PAG_W - 2 * MARG;
const TOPO = 10;
const BASE = PAG_H - 10;
const COR_TEXTO: [number, number, number] = [49, 60, 85];
const COR_CINZA: [number, number, number] = [74, 84, 104];

/** Só caracteres que a Helvetica do PDF tem (WinAnsi). */
const FORA_DA_FONTE = /[^\x09\x0a\x0d\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]/gu;

function limpar(s: string): string {
    return s
        .replace(/[\u00a0\u2007\u2009\u202f]/g, " ")
        .replace(/\u2212/g, "-")
        .replace(/[\u2010\u2011]/g, "-")
        .replace(/[\u2713\u2714]/g, "OK")
        // letra que a fonte não tem vira a letra base (ex.: "ẽ" → "e", "ő" → "o"); o resto (emoji etc.) vira "?"
        .replace(FORA_DA_FONTE, (c) => {
            const base = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return base && !new RegExp(FORA_DA_FONTE.source, "u").test(base) ? base : /\p{Extended_Pictographic}|[\u200d\ufe0f]/u.test(c) ? "" : "?";
        })
        .replace(/\s+/g, " ");
}

function oculto(el: Element): boolean {
    const st = (el.getAttribute("style") || "").replace(/\s/g, "").toLowerCase();
    return (
        el.classList.contains("nao-imprime") ||
        el.classList.contains("continuacao") ||
        el.classList.contains("btn-ajuste") ||
        ["SCRIPT", "STYLE", "BUTTON"].includes(el.tagName) ||
        st.includes("display:none")
    );
}

/** Texto do elemento em pedaços normal/negrito (b, strong, .tag e .val ficam em negrito). */
function runs(el: Node, negrito = false, out: Run[] = []): Run[] {
    el.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
            const t = limpar(n.textContent || "");
            if (t) out.push({ t, b: negrito });
        } else if (n.nodeType === 1) {
            const e = n as Element;
            if (oculto(e)) return;
            if (e.tagName === "BR") {
                out.push({ t: "\n", b: negrito });
                return;
            }
            const b = negrito || ["B", "STRONG"].includes(e.tagName) || e.classList.contains("tag") || e.classList.contains("val") || e.classList.contains("total") || e.classList.contains("titulo");
            const ehTag = e.classList.contains("tag");
            if (ehTag) out.push({ t: " [", b });
            runs(e, b, out);
            if (ehTag) out.push({ t: "] ", b });
        }
    });
    return out;
}

/** Tamanho da letra (pt) pelo papel do elemento na folha. */
function tamanho(el: Element): number {
    const c = el.classList;
    if (c.contains("titulo")) return 15;
    if (c.contains("total")) return 13.5;
    if (c.contains("val")) return 9.5;
    if (c.contains("lbl")) return 7.2;
    if (c.contains("pequeno") || c.contains("rodape")) return 7.2;
    const st = el.getAttribute("style") || "";
    const m = st.match(/font-size:\s*([\d.]+)px/);
    if (m) return Math.max(7, Math.min(14, Number(m[1]) * 0.72));
    return 8.6;
}

class Folha {
    y = TOPO;
    constructor(public doc: JsPDF, public cabecalhoContinua: string) { }

    novaPagina() {
        this.doc.addPage();
        this.y = TOPO;
        if (this.cabecalhoContinua) {
            this.doc.setFont("helvetica", "normal");
            this.doc.setFontSize(7.5);
            this.doc.setTextColor(...COR_CINZA);
            this.doc.text(this.cabecalhoContinua, MARG, this.y + 3);
            this.y += 6;
        }
    }

    /**
     * Escreve pedaços com quebra de linha e negrito misturado. Devolve a altura usada.
     * Com desenhar=false só mede (para decidir quebras de folha).
     */
    texto(rs: Run[], x: number, y: number, w: number, pt: number, alinhar: "left" | "right" | "center" | "justify", desenhar: boolean, cor = COR_TEXTO): number {
        const d = this.doc;
        d.setFontSize(pt);
        const lh = pt * MM * 1.22;
        type Peca = { t: string; b: boolean; w: number };
        const linhas: Peca[][] = [[]];
        let usado = 0;
        const largura = (t: string, b: boolean) => {
            d.setFont("helvetica", b ? "bold" : "normal");
            return d.getTextWidth(t);
        };
        const espaco = largura(" ", false);
        let espacoPendente = false; // espaço no fim de um pedaço vale antes da próxima palavra (ex.: "OS nº " + <b>0034</b>)
        for (const r of rs) {
            if (r.t === "\n") {
                linhas.push([]);
                usado = 0;
                espacoPendente = false;
                continue;
            }
            const palavras = r.t.split(" ");
            palavras.forEach((p, i) => {
                if (p === "") {
                    if (i > 0 || palavras.length > 1) espacoPendente = true;
                    return;
                }
                const pw = largura(p, r.b);
                const atual = linhas[linhas.length - 1];
                const precisaEspaco = atual.length > 0 && (i > 0 || espacoPendente);
                espacoPendente = false;
                if (atual.length && usado + (precisaEspaco ? espaco : 0) + pw > w) {
                    linhas.push([{ t: p, b: r.b, w: pw }]);
                    usado = pw;
                } else {
                    if (precisaEspaco) {
                        atual.push({ t: " ", b: false, w: espaco });
                        usado += espaco;
                    }
                    atual.push({ t: p, b: r.b, w: pw });
                    usado += pw;
                }
            });
        }
        const validas = linhas.filter((l, i) => l.length || i < linhas.length - 1);
        if (desenhar) {
            d.setTextColor(...cor);
            validas.forEach((l, i) => {
                const total = l.reduce((a, p) => a + p.w, 0);
                let cx = alinhar === "right" ? x + w - total : alinhar === "center" ? x + (w - total) / 2 : x;
                const ly = y + lh * (i + 1) - lh * 0.22;
                l.forEach((p) => {
                    d.setFont("helvetica", p.b ? "bold" : "normal");
                    if (p.t !== " ") d.text(p.t, cx, ly);
                    cx += p.w;
                });
            });
        }
        return validas.length * lh;
    }

    /** Desenha (ou mede) um elemento de bloco dentro da largura dada. Devolve a altura. */
    bloco(el: Element, x: number, y: number, w: number, desenhar: boolean): number {
        if (oculto(el)) return 0;
        const tag = el.tagName;
        const st = (el.getAttribute("style") || "").toLowerCase();
        if (tag === "TABLE") return this.tabela(el as HTMLTableElement, x, y, w, desenhar);
        if (tag === "IMG") {
            const src = el.getAttribute("src") || "";
            if (!src.startsWith("data:image")) return 0;
            const ehLogo = (el.getAttribute("alt") || "").startsWith("PAI");
            const hh = ehLogo ? 13 : 12;
            const ww = ehLogo ? 40 : 34;
            if (desenhar) {
                try {
                    this.doc.addImage(src, src.includes("png") ? "PNG" : "JPEG", x, y, ww, hh, undefined, "FAST");
                } catch {
                    /* imagem que o PDF não lê: segue sem ela */
                }
            }
            return hh + 1;
        }
        if (st.includes("border-bottom:2px") && !el.textContent?.trim()) {
            if (desenhar) {
                this.doc.setDrawColor(...COR_TEXTO);
                this.doc.setLineWidth(0.5);
                this.doc.line(x, y + 1, x + w, y + 1);
            }
            return 2.5;
        }
        const assinatura = el.classList.contains("linha-assinatura");
        if (assinatura && desenhar) {
            this.doc.setDrawColor(...COR_TEXTO);
            this.doc.setLineWidth(0.4);
            this.doc.line(x, y + 0.3, x + w * 0.92, y + 0.3);
        }
        // Elemento com blocos dentro (div com divs/tabelas): empilha; texto solto entre eles vira parágrafo.
        const ehBloco = (n: Node) => n.nodeType === 1 && ["DIV", "TABLE", "IMG"].includes((n as Element).tagName) && !oculto(n as Element);
        if (Array.from(el.childNodes).some(ehBloco)) {
            let h = assinatura ? 1.2 : 0;
            let soltos: Node[] = [];
            const despejar = () => {
                if (!soltos.length) return;
                const tmp = el.ownerDocument.createElement("div");
                const alin = st.match(/text-align:\s*(right|center)/);
                if (alin) tmp.setAttribute("style", `text-align:${alin[1]}`);
                soltos.forEach((n) => tmp.appendChild(n.cloneNode(true)));
                h += this.bloco(tmp, x, y + h, w, desenhar);
                soltos = [];
            };
            el.childNodes.forEach((n) => {
                if (ehBloco(n)) {
                    despejar();
                    h += this.bloco(n as Element, x, y + h, w, desenhar);
                } else if ((n.nodeType === 1 && !oculto(n as Element)) || (n.nodeType === 3 && (n.textContent || "").trim())) {
                    soltos.push(n);
                }
            });
            despejar();
            return h;
        }
        const negrito = ["val", "total", "titulo"].some((c) => el.classList.contains(c)) || /font-weight:\s*bold/.test(st);
        const rs = runs(el, negrito);
        if (!rs.length) return 0;
        const pt = tamanho(el);
        const alinhar = st.includes("text-align:right") ? "right" : st.includes("text-align:center") ? "center" : "left";
        const cor = el.classList.contains("lbl") || el.classList.contains("pequeno") || el.classList.contains("rodape") ? COR_CINZA : COR_TEXTO;
        const lbl = el.classList.contains("lbl");
        const conteudo = lbl ? rs.map((r) => ({ t: r.t.toUpperCase(), b: true })) : rs;
        const h = this.texto(conteudo, x, y + (assinatura ? 1.2 : 0), w, pt, alinhar, desenhar, cor) + (assinatura ? 1.2 : 0);
        return h + (lbl ? 0.4 : 0.8);
    }

    /** Tabela de leiaute (linhas com colunas lado a lado); .caixa e .moldura ganham fundo/contorno. */
    tabela(t: HTMLTableElement, x: number, y: number, w: number, desenhar: boolean): number {
        if (t.classList.contains("faixa")) {
            if (desenhar) {
                const cores: [number, number, number][] = [[49, 60, 85], [179, 206, 82], [242, 203, 63], [61, 106, 153]];
                const fr = [0.4, 0.25, 0.2, 0.15];
                let cx = x;
                fr.forEach((f, i) => {
                    this.doc.setFillColor(...cores[i]);
                    this.doc.rect(cx, y, w * f, 1.6, "F");
                    cx += w * f;
                });
            }
            return 2.6;
        }
        if (t.classList.contains("itens")) return 0; // desenhada à parte, pelo autotable
        const caixa = t.classList.contains("caixa");
        const moldura = t.classList.contains("moldura");
        const pad = caixa || moldura ? 2.4 : 0;
        if (desenhar && (caixa || moldura)) {
            // mede, desenha o fundo/contorno e só depois o conteúdo (para o fundo não cobrir o texto)
            const h = this.linhas(t, x, y, w, pad, false);
            if (caixa) {
                this.doc.setFillColor(243, 246, 232);
                this.doc.roundedRect(x, y, w, h, 2.5, 2.5, "F");
            } else {
                this.doc.setDrawColor(...COR_TEXTO);
                this.doc.setLineWidth(0.4);
                this.doc.roundedRect(x, y, w, h, 2.5, 2.5, "S");
            }
            this.linhas(t, x, y, w, pad, true);
            return h + 1.6;
        }
        return this.linhas(t, x, y, w, pad, desenhar) + 1.6;
    }

    private linhas(t: HTMLTableElement, x: number, y: number, w: number, pad: number, desenhar: boolean): number {
        const linhas = Array.from(t.rows).filter((r) => r.closest("table") === t);
        let h = pad;
        for (const tr of linhas) {
            const celulas = Array.from(tr.cells).filter((c) => !oculto(c));
            if (!celulas.length) continue;
            // larguras: style width em % quando houver; o resto dividido entre as demais
            const pct = celulas.map((c) => {
                const m = (c.getAttribute("style") || "").match(/width:\s*([\d.]+)%/);
                return m ? Number(m[1]) / 100 : 0;
            });
            const usado = pct.reduce((a, b) => a + b, 0);
            const semLargura = pct.filter((p) => !p).length;
            const wi = w - 2 * pad;
            const larguras = pct.map((p) => (p ? p * wi : semLargura ? (Math.max(0, 1 - usado) * wi) / semLargura : 0));
            let cx = x + pad;
            let alturaLinha = 0;
            celulas.forEach((c, i) => {
                const cw = larguras[i];
                const st = (c.getAttribute("style") || "").toLowerCase();
                const direita = st.includes("text-align:right");
                const padCel = st.includes("padding") ? 1.2 : 0;
                let ch = 0;
                const filhos = Array.from(c.childNodes);
                const ehBloco = (n: Node) => n.nodeType === 1 && ["DIV", "TABLE", "IMG"].includes((n as Element).tagName);
                if (!filhos.some(ehBloco)) {
                    const rs = runs(c);
                    if (rs.length) ch = this.texto(rs, cx + padCel, y + h, cw - 2 * padCel, 8.6, direita ? "right" : "left", desenhar);
                } else {
                    // texto solto entre os blocos vira um parágrafo; com a célula à direita, os blocos também
                    let soltos: Node[] = [];
                    const paragrafo = (nos: Node[] | Element) => {
                        const tmp = c.ownerDocument.createElement("div");
                        if (Array.isArray(nos)) nos.forEach((n) => tmp.appendChild(n.cloneNode(true)));
                        else {
                            Array.from(nos.attributes).forEach((a) => tmp.setAttribute(a.name, a.value));
                            nos.childNodes.forEach((n) => tmp.appendChild(n.cloneNode(true)));
                        }
                        if (direita && !(tmp.getAttribute("style") || "").includes("text-align")) tmp.setAttribute("style", `${tmp.getAttribute("style") || ""};text-align:right`);
                        return tmp;
                    };
                    const despejar = () => {
                        if (!soltos.length) return;
                        ch += this.bloco(paragrafo(soltos), cx + padCel, y + h + ch, cw - 2 * padCel, desenhar);
                        soltos = [];
                    };
                    for (const n of filhos) {
                        if (ehBloco(n)) {
                            despejar();
                            const e = n as Element;
                            ch += this.bloco(e.tagName === "DIV" ? paragrafo(e) : e, cx + padCel, y + h + ch, cw - 2 * padCel, desenhar);
                        } else if (n.nodeType === 1 || (n.textContent || "").trim()) {
                            soltos.push(n);
                        }
                    }
                    despejar();
                }
                alturaLinha = Math.max(alturaLinha, ch + (padCel ? 0.6 : 0));
                cx += cw;
            });
            h += alturaLinha;
        }
        return h + pad;
    }
}

/** Monta o PDF a partir do HTML da folha. Devolve o arquivo (Blob). */
export async function pdfDaFolhaHtml(html: string, numero: string): Promise<Blob> {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const dom = new DOMParser().parseFromString(html, "text/html");
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    doc.setProperties({ title: `OS ${numero}`, creator: "Sistema PAI" });
    const falecido = dom.querySelector(".continuacao")?.textContent?.replace(/\s+/g, " ").trim() || `OS nº ${numero} · continuação`;
    const f = new Folha(doc, limpar(falecido));

    const blocos = Array.from(dom.body.children).filter((e) => !oculto(e));
    for (let i = 0; i < blocos.length; i++) {
        const el = blocos[i];
        // Tabela de itens: autotable (quebra entre linhas e repete o cabeçalho)
        if (el.tagName === "TABLE" && el.classList.contains("itens")) {
            const t = el as HTMLTableElement;
            const ths = Array.from(t.querySelectorAll("thead th")).filter((c) => !oculto(c));
            const dir = ths.map((c) => c.classList.contains("d"));
            const corpo = Array.from(t.querySelectorAll("tbody tr")).map((tr) =>
                Array.from((tr as HTMLTableRowElement).cells)
                    .filter((c) => !oculto(c))
                    .map((c) => ({ content: limpar(c.textContent || "").trim(), colSpan: c.colSpan || 1, styles: { fontStyle: (c.getAttribute("style") || "").includes("bold") ? "bold" : "normal" } as any })),
            );
            const colunas: Record<number, any> = {};
            dir.forEach((d, k) => {
                if (d) colunas[k] = { halign: "right", cellWidth: "wrap" };
            });
            autoTable(doc, {
                startY: f.y,
                margin: { left: MARG, right: MARG, top: TOPO + 6, bottom: 12 },
                head: [ths.map((c) => limpar(c.textContent || "").trim())],
                body: corpo as any,
                theme: "plain",
                styles: { font: "helvetica", fontSize: 8.2, textColor: COR_TEXTO, cellPadding: { top: 0.9, bottom: 0.9, left: 1.4, right: 1.4 }, lineColor: [201, 207, 217], lineWidth: { bottom: 0.2 } as any },
                headStyles: { fontStyle: "bold", lineColor: COR_TEXTO, lineWidth: { bottom: 0.5 } as any, halign: "left" },
                columnStyles: colunas,
                didParseCell: (data: any) => {
                    if (data.section === "head" && dir[data.column.index]) data.cell.styles.halign = "right";
                },
                didDrawPage: (data: any) => {
                    if (data.pageNumber > 1 && data.cursor && data.settings.startY !== data.cursor.y) {
                        doc.setFont("helvetica", "normal");
                        doc.setFontSize(7.5);
                        doc.setTextColor(...COR_CINZA);
                        doc.text(f.cabecalhoContinua, MARG, TOPO + 3);
                    }
                },
            });
            f.y = ((doc as any).lastAutoTable?.finalY ?? f.y) + 2;
            continue;
        }
        const ehFim = el.classList.contains("fim-folha");
        const h = f.bloco(el, MARG, f.y, LARG, false);
        if (f.y + h > BASE) {
            // bloco final (pagamento, NP, declaração, assinatura) nunca se divide; os demais também passam inteiros
            if (h <= BASE - TOPO - 6) f.novaPagina();
            else if (!ehFim) f.novaPagina();
        }
        f.bloco(el, MARG, f.y, LARG, true);
        f.y += h;
    }
    return doc.output("blob");
}
