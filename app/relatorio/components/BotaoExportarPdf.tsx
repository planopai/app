"use client";
import React, { useEffect, useRef, useState } from "react";
import { LogItem } from "./TiposHistorico";
import { RESUMO_ORDER } from "./ConstantesResumo";
import { formataDataHora, formataSeDataIso } from "./UtilDatas";
import { overrideCampoNome, substituirRotuloVisual, titleCaseFromSnake, capitalize } from "./UtilTexto";
import { traduzirFase } from "./ConstantesFases";
import { asBool } from "./Normalizadores";

/* =============== Props =============== */
interface Props {
    desabilitado: boolean;
    selecionadoNome: string;
    /** Opcional: nome do responsável/requerente para assinar as páginas extras. */
    selecionadoAssinatura?: string;
    criacaoSelecionado?: string;
    logVisiveis: LogItem[];
    resumoFinal?: Record<string, string>;

    /** Opcional: URLs já conhecidas das assinaturas (caso você prefira passar por props) */
    assinaturaResponsavelUrl?: string;
    assinaturaRequerenteUrl?: string;
}

/* =============== jsPDF via CDN =============== */
function useJsPdfCdn() {
    const [ready, setReady] = useState(false);
    const once = useRef(false);
    useEffect(() => {
        if (once.current) return;
        once.current = true;
        if ((window as any).jspdf?.jsPDF) {
            setReady(true);
            return;
        }
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => setReady(Boolean((window as any).jspdf?.jsPDF));
        script.onerror = () => setReady(false);
        document.body.appendChild(script);
    }, []);
    return ready;
}

/* =============== Helpers de imagem =============== */
function isLikelyUrl(s?: string | null) {
    if (!s) return false;
    const v = String(s).trim();
    return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/uploads/");
}

/** Normaliza e envia via PROXY local para evitar CORS. */
function normalizarUrlAssinatura(url?: string) {
    if (!url) return undefined;
    let u = String(url).trim();

    // Se vier relativo
    if (u.startsWith("/uploads/")) {
        return `/api/php/proxy_assinatura.php?file=${encodeURIComponent(u)}`;
    }

    // Força domínio principal -> extrai path e usa proxy
    try {
        const parsed = new URL(u);
        if (parsed.hostname.endsWith("planoassistencialintegrado.com.br")) {
            return `/api/php/proxy_assinatura.php?file=${encodeURIComponent(parsed.pathname + parsed.search)}`;
        }
        // Se vier do subdomínio pai., ainda usa proxy com o path
        if (parsed.hostname.startsWith("pai.")) {
            const path = parsed.pathname + parsed.search;
            return `/api/php/proxy_assinatura.php?file=${encodeURIComponent(path)}`;
        }
    } catch {
        /* string não era uma URL absoluta */
    }

    // fallback: mantém original (pode ser outro host com CORS liberado)
    return u;
}

async function loadImageAsBase64(url: string): Promise<string> {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Falha ao carregar imagem");
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/** Carrega imagem do /public (mesma origem) como base64. */
async function loadPublicAsBase64(pathFromPublic: string): Promise<string | undefined> {
    try {
        const res = await fetch(pathFromPublic, { cache: "no-store" });
        if (!res.ok) return undefined;
        const blob = await res.blob();
        return await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
    } catch {
        return undefined;
    }
}

/** Fundo: desenha o timbrado em página inteira. */
function drawBackground(doc: any, bgB64?: string) {
    if (!bgB64) return;
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    // desenha no (0,0), ocupando a página inteira
    doc.addImage(bgB64, "PNG", 0, 0, w, h);
}

/* =============== Assinaturas (resumo/logs) =============== */
/** Pega URL da assinatura a partir do resumo, se existir. */
function assinaturaFromResumo(resumo?: Record<string, string>, key?: "responsavel" | "requerente") {
    if (!resumo) return undefined;
    const k = key === "responsavel" ? "assinatura_responsavel" : "assinatura_requerente";
    const v = resumo[k] || resumo[k.toUpperCase()] || resumo[k.replace(/_/g, " ")] || resumo[k.replace(/_/g, "-")];
    return isLikelyUrl(v) ? String(v) : undefined;
}

/** Pega URL da assinatura pelos logs (procura último evento "assinou assinatura_*" ou detalhe com /uploads/assinaturas/ ). */
function assinaturaFromLogs(logs: LogItem[], tipo: "responsavel" | "requerente") {
    const alvoCampo = tipo === "responsavel" ? "assinatura_responsavel" : "assinatura_requerente";
    const ordered = [...logs].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    for (let i = ordered.length - 1; i >= 0; i--) {
        const l = ordered[i];
        const acao = (l.acao || "").toLowerCase();
        const det = l.detalhes;
        // a API de histórico grava acao "assinou assinatura_responsavel" e detalhes = url pública
        if (acao.includes("assinou") && acao.includes(alvoCampo)) {
            if (typeof det === "string" && isLikelyUrl(det)) return det;
            try {
                const d = typeof det === "string" ? JSON.parse(det) : det;
                if (typeof d === "string" && isLikelyUrl(d)) return d;
                if (d?.url && isLikelyUrl(d.url)) return d.url;
            } catch {
                /* ignore */
            }
        }
        // fallback: qualquer detalhe com caminho de uploads
        if (typeof det === "string" && det.includes("/uploads/assinaturas/")) {
            const m = det.match(/\/uploads\/assinaturas\/[A-Za-z0-9._-]+/);
            if (m?.[0]) return m[0];
        }
    }
    return undefined;
}

/* =============== Helpers de layout do PDF =============== */
function ensurePageSpace(doc: any, y: number, needed: number, drawBg?: (doc: any) => void, marginTop = 22) {
    const pageH = doc.internal.pageSize.getHeight();
    if (y + needed > pageH - 20) {
        doc.addPage();
        if (drawBg) drawBg(doc);
        return marginTop;
    }
    return y;
}
function textHeight(doc: any, text: string | string[], maxWidth: number, lineGap = 4) {
    const lines = Array.isArray(text) ? text : doc.splitTextToSize(String(text || ""), maxWidth);
    const h = lines.length * lineGap;
    return { lines, h };
}
function drawCard(
    doc: any,
    x: number,
    y: number,
    w: number,
    label: string,
    value: string,
    fonts: { normal: [string, string]; title: [string, string] }
) {
    const padX = 4,
        padY = 4;
    doc.setFont(fonts.normal[0], fonts.normal[1]);
    doc.setFontSize(8.5);
    const { lines: labelLines, h: hLabel } = textHeight(doc, label, w - padX * 2, 3.8);
    doc.setFont(fonts.title[0], fonts.title[1]);
    doc.setFontSize(11);
    const { lines: valueLines, h: hValue } = textHeight(doc, value, w - padX * 2, 5);
    const innerH = hLabel + 2 + hValue;
    const cardH = innerH + padY * 2;

    doc.setDrawColor(210);
    doc.setFillColor(248, 250, 252);
    (doc as any).roundedRect(x, y, w, cardH, 2.5, 2.5, "DF");

    let yy = y + padY;
    doc.setTextColor(120);
    doc.setFont(fonts.normal[0], fonts.normal[1]);
    doc.setFontSize(8.5);
    doc.text(labelLines, x + padX, yy + 3.5);
    yy += hLabel + 2;

    doc.setTextColor(20);
    doc.setFont(fonts.title[0], fonts.title[1]);
    doc.setFontSize(11);
    doc.text(valueLines, x + padX, yy + 4.5);

    return cardH;
}

/* =============== Materiais (APENAS materiais_json) =============== */
function extrairMateriaisAssistencia(logs: LogItem[]): Array<{ rotulo: string; qtd: number }> {
    const byDate = [...logs].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    let ultimoMj: any = null;
    for (let i = byDate.length - 1; i >= 0; i--) {
        const det = byDate[i]?.detalhes;
        if (!det) continue;
        try {
            const obj = typeof det === "string" ? JSON.parse(det) : det;
            if (obj && obj.materiais_json) {
                ultimoMj = typeof obj.materiais_json === "string" ? JSON.parse(obj.materiais_json) : obj.materiais_json;
                break;
            }
        } catch {
            /* ignore */
        }
    }
    const out: Array<{ rotulo: string; qtd: number }> = [];
    if (ultimoMj && typeof ultimoMj === "object") {
        Object.entries(ultimoMj).forEach(([k, v]: any) => {
            const qtd = Number(v?.qtd ?? 0);
            const marcado = String(v?.checked ?? "").toLowerCase();
            if (qtd > 0 && (marcado === "true" || marcado === "1" || marcado === "sim")) {
                const rot = (typeof v?.rotulo === "string" && v.rotulo.trim()) || overrideCampoNome(k, titleCaseFromSnake(k));
                out.push({ rotulo: rot, qtd });
            }
        });
    }
    return out;
}

/* =============== Fallback pelos logs para datas/horas =============== */
function normalizeKey(s: string) {
    return (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_");
}
function pegarUltimoValorDosLogs(logs: LogItem[], candidatas: string[]): string | undefined {
    const normSet = candidatas.map(normalizeKey);
    const ordered = [...logs].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    for (let i = ordered.length - 1; i >= 0; i--) {
        const det = ordered[i]?.detalhes as any;
        if (!det) continue;
        let obj: any;
        try {
            obj = typeof det === "string" ? JSON.parse(det) : det;
        } catch {
            obj = undefined;
        }
        if (!obj || typeof obj !== "object") continue;
        for (const k of Object.keys(obj)) {
            const nk = normalizeKey(k);
            if (normSet.includes(nk)) {
                const v = obj[k];
                if (v != null && String(v).trim() !== "") return String(v);
            }
        }
    }
    return undefined;
}

/* =============== Agente =============== */
function pegarAgenteEntrega(logs: LogItem[]): string {
    const byDate = [...logs].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    const fase8 = [...byDate].reverse().find(
        (l) => (l.status_novo || "").toLowerCase() === "fase08" || /entrega.*corpo/i.test(l.status_novo || "")
    );
    if (fase8?.usuario) return fase8.usuario;
    const ult = byDate.at(-1);
    return ult?.usuario || "";
}

/* =============== Helpers de texto (quebra / negrito) =============== */
function drawParagraph(doc: any, text: string, x: number, y: number, maxWidth: number, font: [string, string], size = 11) {
    doc.setFont(font[0], font[1]);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return lines.length * 6;
}
function drawLabelValueLine(
    doc: any,
    x: number,
    y: number,
    label: string,
    value: string,
    maxWidth: number,
    fonts: { normal: [string, string]; bold: [string, string] },
    size = 11
) {
    const labelTxt = `${label}: `;
    doc.setFont(fonts.bold[0], fonts.bold[1]);
    doc.setFontSize(size);
    const labelW = doc.getTextWidth(labelTxt);
    if (labelW >= maxWidth) {
        const used = drawParagraph(doc, labelTxt, x, y, maxWidth, fonts.bold, size);
        doc.setFont(fonts.normal[0], fonts.normal[1]);
        const used2 = drawParagraph(doc, value, x, y + used, maxWidth, fonts.normal, size);
        return used + used2 + 2;
    }
    doc.text(labelTxt, x, y);
    const vLines = doc.splitTextToSize(value || "", maxWidth - labelW);
    doc.setFont(fonts.normal[0], fonts.normal[1]);
    if (vLines.length) doc.text(vLines[0], x + labelW, y);
    for (let i = 1; i < vLines.length; i++) doc.text(vLines[i], x, y + i * 6);
    return (vLines.length - 1) * 6 + 6;
}
function drawBulletWrapped(doc: any, x: number, y: number, text: string, maxWidth: number) {
    const marker = "– ";
    const mW = doc.getTextWidth(marker);
    doc.text(marker, x, y);
    const lines = doc.splitTextToSize(text, maxWidth - mW);
    doc.text(lines, x + mW, y);
    return (lines.length - 1) * 7.5 + 8;
}

/* =============== Página 1: Termo de Recebimento =============== */
function desenharTermoRecebimento(doc: any, params: {
    responsavel: string;
    falecido: string;
    agente: string;
    dataVelorio: string; // dd/mm/aaaa
    materiais: Array<{ rotulo: string; qtd: number }>;
    fonts: { normal: [string, string]; bold: [string, string] };
    assinaturaResponsavelB64?: string; // dataURL (PNG)
}) {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const maxW = pageW - margin * 2;
    let y = 30;

    doc.setFont(params.fonts.bold[0], params.fonts.bold[1]);
    doc.setFontSize(14);
    doc.text("TERMO DE RECEBIMENTO DE MATERIAL PARA ASSISTÊNCIA", pageW / 2, y, { align: "center" });
    y += 12;

    y += drawLabelValueLine(doc, margin, y, "Falecido(a)", params.falecido || "________________________", maxW, params.fonts, 11);
    y += drawLabelValueLine(doc, margin, y, "Entregue por (Agente)", params.agente || "________________________", maxW, params.fonts, 11);
    y +=
        drawParagraph(
            doc,
            "Confirmo o recebimento do material e me comprometo a zelar e devolver nas mesmas condições os seguintes itens:",
            margin,
            y,
            maxW,
            params.fonts.normal,
            11
        ) + 6;

    doc.setFont(params.fonts.bold[0], params.fonts.bold[1]);
    doc.setFontSize(12);
    doc.text("Itens:", margin, y);
    y += 8;
    doc.setFont(params.fonts.normal[0], params.fonts.normal[1]);
    doc.setFontSize(11);

    const itens = [...params.materiais].sort((a, b) => a.rotulo.localeCompare(b.rotulo));
    if (itens.length === 0) {
        y += drawParagraph(doc, "— Nenhum item selecionado na assistência —", margin, y, maxW, params.fonts.normal, 11);
    } else {
        for (const it of itens) {
            const used = drawBulletWrapped(doc, margin, y, `${it.rotulo}: ${it.qtd}`, maxW);
            y += used;
            if (y > 260) {
                doc.addPage();
                // redesenha o fundo quando cria página
                if ((doc as any).__drawBg) (doc as any).__drawBg(doc);
                y = 20;
            }
        }
    }

    y = Math.max(y, 232); // ligeiramente mais baixo

    // assinatura (imagem, se houver) ou linha — ligeiro deslocamento p/ baixo (~2mm)
    const down = 50;
    if (params.assinaturaResponsavelB64) {
        const imgW = 60, imgH = 30;
        const x = pageW / 2 - imgW / 2;
        doc.addImage(params.assinaturaResponsavelB64, "PNG", x, y + down, imgW, imgH);
        doc.setFont(params.fonts.normal[0], params.fonts.normal[1]);
        doc.setFontSize(11);
        doc.text("Responsável pelo recebimento (assinatura)", pageW / 2, y + down + imgH + 8, { align: "center" });
        y += down + imgH + 12;
    } else {
        doc.setLineWidth(0.3);
        doc.line(margin + 6, y + down + 25, pageW - margin - 6, y + down + 25);
        doc.setFont(params.fonts.normal[0], params.fonts.normal[1]);
        doc.setFontSize(11);
        doc.text("Responsável pelo recebimento (assinatura)", pageW / 2, y + down + 30, { align: "center" });
        y += down + 32;
    }

    doc.setFont(params.fonts.bold[0], params.fonts.bold[1]);
    doc.text(`Barreiras-BA, ${params.dataVelorio || "____/____/____"}`, margin + 6, y - 14);
}

/* =============== Página 2: Requisição de Veículo =============== */
function desenharRequisicaoVeiculo(doc: any, params: {
    requerente: string;
    falecido: string;
    dataSepultamento?: string; // dd/mm/aaaa
    horaSepultamento?: string; // hh:mm
    fonts: { normal: [string, string]; bold: [string, string] };
    assinaturaRequerenteB64?: string; // dataURL (PNG)
}) {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const maxW = pageW - margin * 2;
    let y = 30;

    doc.setFont(params.fonts.bold[0], params.fonts.bold[1]);
    doc.setFontSize(14);
    doc.text("REQUISIÇÃO DE VEÍCULO FUNERÁRIO PARA SEPULTAMENTO", pageW / 2, y, { align: "center" });
    y += 12;

    y += drawLabelValueLine(doc, margin, y, "Falecido(a)", params.falecido || "________________________", maxW, params.fonts, 11);
    y += drawLabelValueLine(doc, margin, y, "Data do Sepultamento", params.dataSepultamento || "____/____/____", maxW, params.fonts, 11);
    y += drawLabelValueLine(doc, margin, y, "Horário", params.horaSepultamento || "____:____", maxW, params.fonts, 11);

    y +=
        drawParagraph(
            doc,
            "Solicito à empresa PAI - Plano Assistencial Integrado, veículo funerário para realização de sepultamento. Desde já, tenho conhecimento que esse pedido deve ser realizado com antecedência mínima de 05 (cinco) horas. Caso o atendimento ocorra fora desse horário, a empresa está isenta de responsabilidades por qualquer contratempo.",
            margin,
            y,
            maxW,
            params.fonts.normal,
            11
        ) + 18;

    // assinatura (imagem, se houver) ou linha — ligeiro deslocamento p/ baixo (~2mm)
    const down = 50;
    if (params.assinaturaRequerenteB64) {
        const imgW = 60, imgH = 30;
        const x = pageW / 2 - imgW / 2;
        doc.addImage(params.assinaturaRequerenteB64, "PNG", x, y + down, imgW, imgH);
        doc.setFont(params.fonts.normal[0], params.fonts.normal[1]);
        doc.setFontSize(11);
        doc.text("Requerente (assinatura)", pageW / 2, y + down + imgH + 8, { align: "center" });
    } else {
        doc.setLineWidth(0.3);
        doc.line(margin + 6, y + down + 25, pageW - margin - 6, y + down + 25);
        doc.setFont(params.fonts.normal[0], params.fonts.normal[1]);
        doc.setFontSize(11);
        doc.text("Requerente (assinatura)", pageW / 2, y + down + 30, { align: "center" });
    }
}

/* =============== Componente principal =============== */
export default function BotaoExportarPdf({
    desabilitado,
    selecionadoNome,
    selecionadoAssinatura,
    criacaoSelecionado,
    logVisiveis,
    resumoFinal,
    assinaturaResponsavelUrl,
    assinaturaRequerenteUrl,
}: Props) {
    const [gerando, setGerando] = useState(false);
    const jsPdfOk = useJsPdfCdn();

    // Normalizador para remoção de duplicidades de linha
    const normLine = (s: string) =>
        s
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ");

    // Renomeia títulos das ações de assinatura e informa se é evento de assinatura
    function mapAcaoTitulo(acaoRaw: string) {
        const a = (acaoRaw || "").toLowerCase();
        if (a.includes("assinou") && a.includes("assinatura_responsavel")) {
            return { titulo: "Assinou o Termo de Recebimento de Material", assinatura: "responsavel" as const };
        }
        if (a.includes("assinou") && a.includes("assinatura_requerente")) {
            return { titulo: "Assinou o Termo de Requisição de Veículo", assinatura: "requerente" as const };
        }
        return { titulo: capitalize(acaoRaw || ""), assinatura: null as null };
    }

    async function gerarPdf() {
        if (!jsPdfOk || logVisiveis.length === 0) return;

        setGerando(true);
        try {
            const { jsPDF } = (window as any).jspdf;
            const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

            const pageW = doc.internal.pageSize.getWidth();
            const marginL = 14, marginR = 14;
            const contentW = pageW - marginL - marginR;

            // fontes fixas (sem Nunito)
            const titleFont: [string, string] = ["helvetica", "bold"];
            const normalFont: [string, string] = ["helvetica", "normal"];
            const fonts = { normal: normalFont, bold: titleFont };

            // Carregar fundo (timbrado.png em /public)
            const bgB64 = await loadPublicAsBase64("/timbrado.png");
            const drawBg = (d: any) => drawBackground(d, bgB64);
            (doc as any).__drawBg = drawBg;
            drawBg(doc);

            // Resolver URLs das assinaturas -> proxy anti-CORS
            const urlResp = normalizarUrlAssinatura(
                assinaturaResponsavelUrl || assinaturaFromResumo(resumoFinal, "responsavel") || assinaturaFromLogs(logVisiveis, "responsavel")
            );
            const urlReq = normalizarUrlAssinatura(
                assinaturaRequerenteUrl || assinaturaFromResumo(resumoFinal, "requerente") || assinaturaFromLogs(logVisiveis, "requerente")
            );

            // Converter para Base64 (jsPDF precisa de dataURL)
            let assinaturaRespB64: string | undefined;
            let assinaturaReqB64: string | undefined;
            try { if (urlResp) assinaturaRespB64 = await loadImageAsBase64(urlResp); } catch { }
            try { if (urlReq) assinaturaReqB64 = await loadImageAsBase64(urlReq); } catch { }

            let y = 22;

            // Cabeçalho
            doc.setFont(titleFont[0], titleFont[1]);
            doc.setFontSize(18);
            doc.text("Relatório de Atendimento", pageW / 2, y, { align: "center" });
            y += 8;

            doc.setFont(titleFont[0], titleFont[1]);
            doc.setFontSize(13);
            doc.text((selecionadoNome || "").toString(), pageW / 2, y, { align: "center" });
            y += 12;

            if (criacaoSelecionado) {
                doc.setFont(normalFont[0], normalFont[1]);
                doc.setFontSize(10);
                doc.text(`Criado em: ${formataDataHora(criacaoSelecionado)}`, pageW / 2, y, { align: "center" });
                y += 6;
            }

            // Relatório Final
            if (resumoFinal && Object.keys(resumoFinal).length) {
                doc.setFont(titleFont[0], titleFont[1]);
                doc.setFontSize(12.5);
                doc.text("Relatório Final", marginL, y);
                y += 5;

                const pairs: Array<[string, string]> = [];
                for (const k of RESUMO_ORDER as string[]) {
                    const v = resumoFinal[k];
                    if (v) pairs.push([substituirRotuloVisual(overrideCampoNome(k, titleCaseFromSnake(k))).toUpperCase(), String(v)]);
                }
                for (const [k, v] of Object.entries(resumoFinal)) {
                    if (!(RESUMO_ORDER as readonly string[]).includes(k) && v) {
                        pairs.push([substituirRotuloVisual(overrideCampoNome(k, titleCaseFromSnake(k))).toUpperCase(), String(v)]);
                    }
                }

                const gap = 4;
                const colW = (contentW - gap) / 2;

                doc.setFont(normalFont[0], normalFont[1]);
                let cursorX = marginL;
                let cursorY = y;

                for (let i = 0; i < pairs.length; i++) {
                    const [label, value] = pairs[i];

                    doc.setFont(normalFont[0], normalFont[1]);
                    doc.setFontSize(8.5);
                    const labelH = textHeight(doc, label, colW - 8, 3.8).h;
                    doc.setFont(titleFont[0], titleFont[1]);
                    doc.setFontSize(11);
                    const valueH = textHeight(doc, value, colW - 8, 5).h;

                    const cardH = labelH + 2 + valueH + 8;
                    cursorY = ensurePageSpace(doc, cursorY, cardH, drawBg);

                    const used = drawCard(doc, cursorX, cursorY, colW, label, value, { normal: normalFont, title: titleFont });

                    if (cursorX === marginL) {
                        cursorX = marginL + colW + gap;
                    } else {
                        cursorX = marginL;
                        cursorY += used + 3;
                    }
                }
                if (cursorX !== marginL) cursorY += 8;
                y = cursorY + 4;
            }

            // Cards de Log
            const cardPadX = 6, cardPadY = 6;
            const writeLine = (text: string | string[], x: number, yy: number, size = 11, bold = false) => {
                doc.setFont(bold ? titleFont[0] : normalFont[0], bold ? titleFont[1] : normalFont[1]);
                doc.setFontSize(size);
                doc.text(Array.isArray(text) ? text : [text], x, yy);
            };

            // (3) Filtra logs “sem_alteracoes”
            const logsParaImprimir = logVisiveis.filter((l) => {
                const det = l.detalhes;
                try {
                    const obj = typeof det === "string" ? JSON.parse(det) : det;
                    if (obj && typeof obj === "object" && obj.sem_alteracoes === true) return false;
                } catch { /* ignore */ }
                return true;
            });

            for (const ent of logsParaImprimir) {
                const dataLine = formataDataHora(ent.datahora) || "";

                // (2) Renomeia títulos de assinatura
                const t = mapAcaoTitulo(ent.acao || "");
                const statusTxt = ent.status_novo ? traduzirFase(ent.status_novo) : "";
                const acaoFull = statusTxt ? `${t.titulo} — ${statusTxt}` : t.titulo;

                const usuarioLine = ent.usuario ? `Usuário: ${ent.usuario}` : "";

                // (1) Montagem de detalhes sem duplicar
                const detalhesLines: string[] = [];
                const ja = new Set<string>();
                const addLine = (s: string) => {
                    const key = normLine(s);
                    if (key && !ja.has(key)) {
                        ja.add(key);
                        detalhesLines.push(s);
                    }
                };

                const raw = ent.detalhes as any;
                const materiaisLines: string[] = [];

                try {
                    const obj = raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);
                    if (obj && typeof obj === "object") {
                        // se for log de assinatura, não exibe nenhum detalhe (especialmente a URL)
                        if (t.assinatura) {
                            // nada
                        } else {
                            for (const key of Object.keys(obj)) {
                                if (["materiais_json", "id", "acao", "sem_alteracoes"].includes(key)) continue;

                                // Arrumação
                                if (/^arruma[cç][aã]o(\s*json|_json)?$/i.test(key)) {
                                    let aobj: any = {};
                                    const val = obj[key];
                                    if (typeof val === "string") {
                                        try {
                                            aobj = JSON.parse(val);
                                        } catch {
                                            aobj = {};
                                        }
                                    } else if (typeof val === "object" && val) aobj = val;

                                    for (const [k, v] of Object.entries(aobj)) {
                                        if (asBool(v)) addLine(`${titleCaseFromSnake(k)}: Sim`);
                                    }
                                    continue;
                                }

                                // Materiais_*_qtd (apenas para exibir no LOG)
                                const m = key.match(/^materiais_(.+?)_qtd$/i);
                                if (m) {
                                    const nomeBase = titleCaseFromSnake(m[1]);
                                    const nome = overrideCampoNome(m[1], nomeBase);
                                    const qtd = (obj as any)[key];
                                    if (qtd != null && String(qtd).trim() !== "") materiaisLines.push(`${nome}: ${String(qtd)}`);
                                    continue;
                                }

                                // Campos simples
                                if (typeof (obj as any)[key] === "object" && !Array.isArray((obj as any)[key])) continue;
                                let v = (obj as any)[key];
                                if (v == null || String(v).trim() === "") continue;

                                let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
                                nome = overrideCampoNome(key, nome);
                                v = String(v);
                                if (v.startsWith("fase")) v = traduzirFase(v);
                                v = formataSeDataIso(v);
                                nome = substituirRotuloVisual(nome);
                                v = substituirRotuloVisual(v);

                                // (2) nunca exibir caminhos de assinatura
                                if (/\/uploads\/assinaturas\//i.test(v)) continue;

                                addLine(`${nome}: ${v}`);
                            }
                        }
                    }
                } catch {
                    let detalhesRaw = String(raw || "");
                    // (2) oculta URL de assinatura em detalhe simples
                    if (/\/uploads\/assinaturas\//i.test(detalhesRaw)) {
                        detalhesRaw = "";
                    }
                    detalhesRaw = substituirRotuloVisual(detalhesRaw);
                    if (detalhesRaw.trim()) addLine(detalhesRaw.trim());
                }

                if (materiaisLines.length && !t.assinatura) {
                    addLine("Materiais:");
                    for (const l of materiaisLines) addLine(`• ${l}`);
                }

                // Medidas
                doc.setFont(normalFont[0], normalFont[1]);
                doc.setFontSize(9);
                const dataWrapped = doc.splitTextToSize(dataLine, contentW - cardPadX * 2);

                doc.setFont(titleFont[0], titleFont[1]);
                doc.setFontSize(12);
                const acaoWrapped = doc.splitTextToSize(acaoFull, contentW - cardPadX * 2);

                doc.setFont(normalFont[0], normalFont[1]);
                doc.setFontSize(10);
                const usuarioWrapped = doc.splitTextToSize(usuarioLine, contentW - cardPadX * 2);

                doc.setFont(normalFont[0], normalFont[1]);
                doc.setFontSize(11);
                const detalhesWrapped = detalhesLines.flatMap((l) => doc.splitTextToSize(l, contentW - cardPadX * 2));

                const hData = dataWrapped.length ? 4 + (dataWrapped.length - 1) * 4 : 0;
                const hAcao = acaoWrapped.length * 5;
                const hUsuario = usuarioWrapped.length ? usuarioWrapped.length * 5 : 0;
                const hDetalhes = detalhesWrapped.length ? detalhesWrapped.length * 5 : 0;

                const innerHeight = (hData ? hData + hUsuario + hDetalhes + 3 : hUsuario + hDetalhes + 3) + hAcao;
                const cardH = innerHeight + 2 * cardPadY;

                y = ensurePageSpace(doc, y, cardH + 8, drawBg);

                doc.setDrawColor(210);
                doc.setLineWidth(0.25);
                (doc as any).roundedRect(marginL, y, contentW, cardH, 3, 3);

                let yy = y + cardPadY;
                if (dataWrapped.length) {
                    writeLine(dataWrapped, marginL + cardPadX, yy, 9, false);
                    yy += 4 + (dataWrapped.length - 1) * 4 + 3;
                }
                writeLine(acaoWrapped, marginL + cardPadX, yy, 12, true);
                yy += hAcao;
                if (usuarioWrapped.length) {
                    writeLine(usuarioWrapped, marginL + cardPadX, yy, 10, false);
                    yy += usuarioWrapped.length * 5;
                }
                if (detalhesWrapped.length) {
                    writeLine(detalhesWrapped, marginL + cardPadX, yy, 11, false);
                    yy += detalhesWrapped.length * 5;
                }
                y += cardH + 8;
            }

            // ====== PÁGINAS EXTRAS ======
            const materiais = extrairMateriaisAssistencia(logsParaImprimir); // somente materiais_json
            const agente = pegarAgenteEntrega(logsParaImprimir);

            // Fallbacks pelos logs (caso resumoFinal não traga)
            const dataInicioVelorioRaw =
                resumoFinal?.data_inicio_velorio || pegarUltimoValorDosLogs(logsParaImprimir, ["data_inicio_velorio", "data de inicio do velorio"]);

            const dataFimVelorioRaw =
                resumoFinal?.data_fim_velorio ||
                pegarUltimoValorDosLogs(logsParaImprimir, ["data_fim_velorio", "data do fim do velorio", "data do sepultamento"]);

            const horaFimVelorioRaw =
                resumoFinal?.hora_fim_velorio || pegarUltimoValorDosLogs(logsParaImprimir, ["hora_fim_velorio", "horario do sepultamento"]);

            // Formata
            const dataVelorio = dataInicioVelorioRaw ? formataSeDataIso(String(dataInicioVelorioRaw)) : "";
            const dataSep = dataFimVelorioRaw ? formataSeDataIso(String(dataFimVelorioRaw)) : "";
            const horaSep = horaFimVelorioRaw ? String(horaFimVelorioRaw) : "";

            // 1) Termo — data do velório (INÍCIO)
            doc.addPage();
            drawBg(doc);
            desenharTermoRecebimento(doc, {
                responsavel: selecionadoAssinatura || "",
                falecido: selecionadoNome,
                agente,
                dataVelorio,
                materiais,
                fonts,
                assinaturaResponsavelB64: assinaturaRespB64,
            });

            // 2) Requisição — data/hora do sepultamento (FIM / hora_fim)
            doc.addPage();
            drawBg(doc);
            desenharRequisicaoVeiculo(doc, {
                requerente: selecionadoAssinatura || "",
                falecido: selecionadoNome,
                dataSepultamento: dataSep,
                horaSepultamento: horaSep,
                fonts,
                assinaturaRequerenteB64: assinaturaReqB64,
            });

            const filename = `${String(selecionadoNome || "").toUpperCase()}.pdf`;
            doc.save(filename);
        } finally {
            setGerando(false);
        }
    }

    const disabled = desabilitado || gerando || !jsPdfOk || logVisiveis.length === 0;

    return (
        <button
            onClick={gerarPdf}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold border-primary text-primary hover:bg-primary/5 disabled:opacity-50"
            title="Baixar PDF"
        >
            {gerando ? "Gerando…" : "Baixar PDF"}
        </button>
    );
}
