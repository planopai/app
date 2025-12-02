"use client";

import React, { useEffect, useRef, useState } from "react";
import { LogItem } from "./TiposHistorico";
import { RESUMO_ORDER } from "./ConstantesResumo";
import { formataDataHora, formataSeDataIso } from "./UtilDatas";
import {
    overrideCampoNome,
    substituirRotuloVisual,
    titleCaseFromSnake,
    capitalize,
} from "./UtilTexto";
import { traduzirFase } from "./ConstantesFases";
import { asBool } from "./Normalizadores";

/* ==== helpers de API para pegar assinaturas e normalizar URL ==== */
import {
    pegarAssinaturasInfoPorId,
    normalizarUrlAssinatura as normAssUrl,
    type MateriaisMap,
} from "./Api";

/* =============== Props =============== */
interface Props {
    desabilitado: boolean;
    selecionadoNome: string;
    selecionadoAssinatura?: string;
    criacaoSelecionado?: string;
    logVisiveis: LogItem[];
    resumoFinal?: Record<string, string>;
    assinaturaResponsavelUrl?: string;
    assinaturaRequerenteUrl?: string;
    sepultamentoId?: string | number;
    materiaisMap?: MateriaisMap;
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

/** Carrega imagem em <img>. */
function loadImgFromBlob(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
}

/** Carrega + redimensiona + COMPRIME fundo como JPEG */
async function loadAndCompressBackground(pathOrUrl: string, maxWidth = 1240, quality = 0.6) {
    try {
        const res = await fetch(pathOrUrl, { cache: "no-store" });
        if (!res.ok) return undefined;
        const blob = await res.blob();
        const img = await loadImgFromBlob(blob);

        const scale = Math.min(1, maxWidth / (img.naturalWidth || img.width || maxWidth));
        const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);

        return canvas.toDataURL("image/jpeg", quality);
    } catch {
        return undefined;
    }
}

/**
 * Carrega assinatura (PNG) e exporta PNG com fundo branco
 */
async function loadSignatureImage(url: string, maxWidth = 800): Promise<string> {
    const res = await fetch(url, { cache: "no-store", credentials: "include" });
    if (!res.ok) throw new Error("Falha ao carregar assinatura");
    const blob = await res.blob();
    const img = await loadImgFromBlob(blob);

    const scale = Math.min(1, maxWidth / (img.naturalWidth || img.width || maxWidth));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    return canvas.toDataURL("image/png");
}

function makeBackgroundDrawer(doc: any, bgB64?: string) {
    return (d: any) => {
        if (!bgB64) return;
        const w = d.internal.pageSize.getWidth();
        const h = d.internal.pageSize.getHeight();
        d.addImage(bgB64, "JPEG", 0, 0, w, h, undefined, "FAST");
    };
}

/* =============== JSON helper =============== */
function safeJsonParse(v: any) {
    if (v == null) return null;
    if (typeof v === "object") return v;
    if (typeof v !== "string") return null;
    try {
        return JSON.parse(v);
    } catch {
        return null;
    }
}

/* =============== Buscas de assinatura (URLs) =============== */
function assinaturaFromResumo(resumo?: Record<string, string>, key?: "responsavel" | "requerente") {
    if (!resumo) return undefined;
    const k = key === "responsavel" ? "assinatura_responsavel" : "assinatura_requerente";
    const v =
        resumo[k] ||
        resumo[k.toUpperCase()] ||
        resumo[k.replace(/_/g, " ")] ||
        resumo[k.replace(/_/g, "-")];
    return isLikelyUrl(v) ? String(v) : undefined;
}

function assinaturaFromLogs(logs: LogItem[], tipo: "responsavel" | "requerente") {
    const alvoCampo = tipo === "responsavel" ? "assinatura_responsavel" : "assinatura_requerente";
    const ordered = [...logs].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    for (let i = ordered.length - 1; i >= 0; i--) {
        const l = ordered[i];
        const acao = (l.acao || "").toLowerCase();
        const det = l.detalhes;
        if (acao.includes("assinou") && acao.includes(alvoCampo)) {
            if (typeof det === "string" && isLikelyUrl(det)) return det;
            try {
                const d = typeof det === "string" ? JSON.parse(det) : det;
                if (typeof d === "string" && isLikelyUrl(d)) return d;
                if ((d as any)?.url && isLikelyUrl((d as any).url)) return (d as any).url;
            } catch { }
        }
        if (typeof det === "string" && det.includes("/uploads/assinaturas/")) {
            const m = det.match(/\/uploads\/assinaturas\/[A-Za-z0-9._-]+/);
            if (m?.[0]) return m[0];
        }
    }
    return undefined;
}

/* =============== Helpers texto & layout =============== */
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

/* ===== Parâmetros de assinatura ===== */
const SIGN_IMG_W = 60;
const SIGN_IMG_H = 26;
const LINE_Y_OFFSET = 232;
const IMG_ABOVE_LINE_GAP = 1;
const LINE_WIDTH = 0.35;

/* ===== Helpers Nome/CPF ===== */
function soDigitos(s?: string) {
    return (s || "").replace(/\D+/g, "");
}
function formatCpf(s?: string) {
    const d = soDigitos(s);
    if (d.length !== 11) return s || "";
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function getNomeCpfAssinatura(
    resumo: Record<string, string> | undefined,
    tipo: "responsavel" | "requerente",
    fallbackNome?: string
) {
    const out = { nome: "", cpf: "" };
    if (!resumo) {
        out.nome = fallbackNome || "";
        return out;
    }

    const nomesPossiveis = [
        `nome_assinatura_${tipo}`,
        `nome_${tipo}`,
        `assinatura_${tipo}_nome`,
        `nome assinatura ${tipo}`,
    ];
    const cpfsPossiveis = [
        `cpf_assinatura_${tipo}`,
        `cpf_${tipo}`,
        `assinatura_${tipo}_cpf`,
        `cpf assinatura ${tipo}`,
    ];

    for (const k of nomesPossiveis) {
        const v = resumo[k] || resumo[k.toUpperCase()] || resumo[k.replace(/_/g, " ")] || resumo[k.replace(/_/g, "-")];
        if (v) {
            out.nome = String(v);
            break;
        }
    }
    for (const k of cpfsPossiveis) {
        const v = resumo[k] || resumo[k.toUpperCase()] || resumo[k.replace(/_/g, " ")] || resumo[k.replace(/_/g, "-")];
        if (v) {
            out.cpf = formatCpf(String(v));
            break;
        }
    }

    if (!out.nome) out.nome = fallbackNome || "";
    return out;
}

/* ======================= Materiais (materiais_json) ======================= */
function labelFromMateriaisKey(rawKey: string) {
    const k = String(rawKey || "").trim();
    const m = k.match(/^(item|subitem)\s*:\s*(.+)$/i);
    if (m) {
        const tipo = m[1].toLowerCase() === "subitem" ? "Subitem" : "Item";
        return `${tipo} ${String(m[2]).trim()}`;
    }
    return overrideCampoNome(k, titleCaseFromSnake(k.replace(/:/g, "_")));
}

function normMatKey(k: string) {
    return String(k || "").trim().toLowerCase().replace(/\s+/g, "");
}

function resolveMaterialLabel(key: string, v: any, materiaisMap?: MateriaisMap): { categoria: string; nome: string } {
    const overrideNome =
        (typeof v?.nome === "string" && v.nome.trim()) ||
        (typeof v?.rotulo === "string" && v.rotulo.trim()) ||
        (typeof v?.label === "string" && v.label.trim()) ||
        "";

    const fromMap = materiaisMap?.[normMatKey(key)];

    const categoria =
        (typeof v?.categoria_nome === "string" && v.categoria_nome.trim()) ||
        (typeof v?.categoria === "string" && v.categoria.trim()) ||
        fromMap?.categoria ||
        "Material";

    const nome = overrideNome || fromMap?.nome || labelFromMateriaisKey(String(key));
    return { categoria, nome };
}

type MatLinha = { categoria: string; nome: string; qtd: number };

function agruparMateriais(mats: MatLinha[]) {
    const map = new Map<string, MatLinha[]>();
    for (const it of mats) {
        const cat = (it.categoria || "").trim() || "Material";
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat)!.push(it);
    }

    const grupos = Array.from(map.entries()).sort(([a], [b]) =>
        a.localeCompare(b, "pt-BR", { sensitivity: "base" })
    );

    for (const [, arr] of grupos) {
        arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    }

    return grupos;
}

/* =============== Página 1: Termo de Recebimento =============== */
function desenharTermoRecebimento(doc: any, params: {
    responsavel: string;
    cpfResponsavel: string;
    falecido: string;
    agente: string;
    dataVelorio: string;
    materiais: Array<{ categoria: string; itens: Array<{ rotulo: string; qtd: number }> }>;
    fonts: { normal: [string, string]; bold: [string, string] };
    assinaturaResponsavelB64?: string;
}) {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const maxW = pageW - margin * 2;
    let y = 30;

    doc.setFont(params.fonts.bold[0], params.fonts.bold[1]);
    doc.setFontSize(14);
    doc.text("TERMO DE RECEBIMENTO DE MATERIAL PARA ASSISTÊNCIA", pageW / 2, y, { align: "center" });
    y += 12;

    y += drawLabelValueLine(doc, margin, y, "Responsável", params.responsavel || "________________________", maxW, params.fonts, 11);
    y += drawLabelValueLine(doc, margin, y, "CPF", params.cpfResponsavel || "____.____.____-__", maxW, params.fonts, 11);
    y += drawLabelValueLine(doc, margin, y, "Falecido(a)", params.falecido || "________________________", maxW, params.fonts, 11);
    y += drawLabelValueLine(doc, margin, y, "Entregue por (Agente)", params.agente || "________________________", maxW, params.fonts, 11);

    y += drawParagraph(
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

    const grupos = params.materiais || [];
    const existeAlgo = grupos.some((g) => (g.itens || []).length > 0);

    if (!existeAlgo) {
        doc.setFont(params.fonts.normal[0], params.fonts.normal[1]);
        doc.setFontSize(11);
        y += drawParagraph(doc, "— Nenhum item selecionado na assistência —", margin, y, maxW, params.fonts.normal, 11);
    } else {
        for (const g of grupos) {
            if (g.categoria) {
                doc.setFont(params.fonts.bold[0], params.fonts.bold[1]);
                doc.setFontSize(11.5);
                doc.text(g.categoria, margin, y);
                y += 6;
            }

            doc.setFont(params.fonts.normal[0], params.fonts.normal[1]);
            doc.setFontSize(11);

            const itens = [...(g.itens || [])].sort((a, b) =>
                a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" })
            );

            for (const it of itens) {
                const used = drawBulletWrapped(doc, margin, y, `${it.rotulo}: ${it.qtd}`, maxW);
                y += used;
                if (y > 260) {
                    doc.addPage();
                    (doc as any).__drawBg?.(doc);
                    y = 20;
                }
            }

            y += 2;
        }
    }

    // assinatura
    y = Math.max(y, LINE_Y_OFFSET);
    const lineY = y + 26;
    doc.setLineWidth(LINE_WIDTH);
    doc.line(margin + 6, lineY, pageW - margin - 6, lineY);

    if (params.assinaturaResponsavelB64) {
        const x = pageW / 2 - SIGN_IMG_W / 2;
        const imgY = lineY - SIGN_IMG_H - IMG_ABOVE_LINE_GAP;
        doc.addImage(params.assinaturaResponsavelB64, "PNG", x, imgY, SIGN_IMG_W, SIGN_IMG_H, undefined, "FAST");
    }

    doc.setFont(params.fonts.normal[0], params.fonts.normal[1]);
    doc.setFontSize(11);
    doc.text("Responsável pelo recebimento (assinatura)", pageW / 2, lineY + 7, { align: "center" });

    doc.setFontSize(10);
    const centerX = pageW / 2;
    doc.text(params.cpfResponsavel || "____.____.____-__", centerX - 40, lineY + 14, { align: "center" });
    doc.text(params.responsavel || "________________________", centerX + 40, lineY + 14, { align: "center" });

    doc.setFont(params.fonts.bold[0], params.fonts.bold[1]);
    doc.text(`Barreiras-BA, ${params.dataVelorio || "____/____/____"}`, margin + 6, lineY - 8);
}

/* =============== Página 2: Requisição de Veículo =============== */
function desenharRequisicaoVeiculo(doc: any, params: {
    requerente: string;
    cpfRequerente: string;
    falecido: string;
    dataSepultamento?: string;
    horaSepultamento?: string;
    fonts: { normal: [string, string]; bold: [string, string] };
    assinaturaRequerenteB64?: string;
}) {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const maxW = pageW - margin * 2;
    let y = 30;

    doc.setFont(params.fonts.bold[0], params.fonts.bold[1]);
    doc.setFontSize(14);
    doc.text("REQUISIÇÃO DE VEÍCULO FUNERÁRIO PARA SEPULTAMENTO", pageW / 2, y, { align: "center" });
    y += 12;

    y += drawLabelValueLine(doc, margin, y, "Requerente", params.requerente || "________________________", maxW, params.fonts, 11);
    y += drawLabelValueLine(doc, margin, y, "CPF", params.cpfRequerente || "____.____.____-__", maxW, params.fonts, 11);

    y += drawLabelValueLine(doc, margin, y, "Falecido(a)", params.falecido || "________________________", maxW, params.fonts, 11);
    y += drawLabelValueLine(doc, margin, y, "Data do Sepultamento", params.dataSepultamento || "____/____/____", maxW, params.fonts, 11);
    y += drawLabelValueLine(doc, margin, y, "Horário", params.horaSepultamento || "____:____", maxW, params.fonts, 11);

    y += drawParagraph(
        doc,
        "Solicito à empresa PAI - Plano Assistencial Integrado, veículo funerário para realização de sepultamento. Desde já, tenho conhecimento que esse pedido deve ser realizado com antecedência mínima de 05 (cinco) horas. Caso o atendimento ocorra fora desse horário, a empresa está isenta de responsabilidades por qualquer contratempo.",
        margin,
        y,
        maxW,
        params.fonts.normal,
        11
    ) + 18;

    const yBase = Math.max(y, LINE_Y_OFFSET - 8);
    const lineY = yBase + 26;
    doc.setLineWidth(LINE_WIDTH);
    doc.line(margin + 6, lineY, pageW - margin - 6, lineY);

    if (params.assinaturaRequerenteB64) {
        const x = pageW / 2 - SIGN_IMG_W / 2;
        const imgY = lineY - SIGN_IMG_H - IMG_ABOVE_LINE_GAP;
        doc.addImage(params.assinaturaRequerenteB64, "PNG", x, imgY, SIGN_IMG_W, SIGN_IMG_H, undefined, "FAST");
    }

    doc.setFont(params.fonts.normal[0], params.fonts.normal[1]);
    doc.setFontSize(11);
    doc.text("Requerente (assinatura)", pageW / 2, lineY + 7, { align: "center" });

    doc.setFontSize(10);
    const centerX = pageW / 2;
    doc.text(params.cpfRequerente || "____.____.____-__", centerX - 40, lineY + 14, { align: "center" });
    doc.text(params.requerente || "________________________", centerX + 40, lineY + 14, { align: "center" });
}

/* =============== Materiais – pega últimos selecionados (agrupado) =============== */
function extrairMateriaisAssistencia(
    logs: LogItem[],
    materiaisMap?: MateriaisMap
): Array<{ categoria: string; itens: Array<{ rotulo: string; qtd: number }> }> {
    const byDate = [...logs].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    let ultimoMj: any = null;

    for (let i = byDate.length - 1; i >= 0; i--) {
        const det = byDate[i]?.detalhes;
        if (!det) continue;
        try {
            const obj = typeof det === "string" ? JSON.parse(det) : det;
            if (obj && obj.materiais_json) {
                ultimoMj = typeof obj.materiais_json === "string" ? safeJsonParse(obj.materiais_json) : obj.materiais_json;
                break;
            }
        } catch { }
    }

    const mats: MatLinha[] = [];
    if (ultimoMj && typeof ultimoMj === "object") {
        Object.entries(ultimoMj).forEach(([k, vv]: any) => {
            const v: any = vv || {};
            const qtd = Number(v?.qtd ?? 0);
            const checked = asBool(v?.checked) || qtd > 0;

            if (qtd > 0 && checked) {
                const { categoria, nome } = resolveMaterialLabel(String(k), v, materiaisMap);
                mats.push({ categoria, nome, qtd });
            }
        });
    }

    const grupos = agruparMateriais(mats);

    return grupos.map(([categoria, items]) => ({
        categoria,
        itens: items.map((it) => ({ rotulo: it.nome, qtd: it.qtd })),
    }));
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
    return byDate.at(-1)?.usuario || "";
}

/* ===== Tentar descobrir o ID do sepultamento ===== */
function inferirSepultamentoId(sepultamentoId?: string | number, resumoFinal?: Record<string, string>, logs?: LogItem[]): string | undefined {
    if (sepultamentoId != null && sepultamentoId !== "") return String(sepultamentoId);

    const keys = ["id", "sepultamento_id", "atendimento_id"];
    for (const k of keys) {
        const v = resumoFinal?.[k] || resumoFinal?.[k.toUpperCase()] || resumoFinal?.[k.replace(/_/g, " ")];
        if (v) return String(v);
    }

    if (logs && logs.length) {
        for (const l of logs) {
            // @ts-ignore
            if ((l as any).sepultamento_id) return String((l as any).sepultamento_id);
            const det = l.detalhes;
            try {
                const obj = typeof det === "string" ? JSON.parse(det) : det;
                const cand = obj?.id || obj?.sepultamento_id || obj?.atendimento_id;
                if (cand) return String(cand);
            } catch { }
        }
    }
    return undefined;
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
    sepultamentoId,
    materiaisMap,
}: Props) {
    const [gerando, setGerando] = useState(false);
    const jsPdfOk = useJsPdfCdn();

    const normLine = (s: string) =>
        s
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ");

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
            const marginL = 14,
                marginR = 14;
            const contentW = pageW - marginL - marginR;

            const titleFont: [string, string] = ["helvetica", "bold"];
            const normalFont: [string, string] = ["helvetica", "normal"];
            const fonts = { normal: normalFont, bold: titleFont };

            // Fundo
            const bgB64 = await loadAndCompressBackground("/timbrado.png", 1240, 0.6);
            const drawBg = makeBackgroundDrawer(doc, bgB64);
            (doc as any).__drawBg = drawBg;
            drawBg(doc); // página 1

            // assinaturas
            const idInferido = inferirSepultamentoId(sepultamentoId, resumoFinal, logVisiveis);
            const assinDb = idInferido ? await pegarAssinaturasInfoPorId(idInferido) : {};

            const urlResp = normAssUrl(
                assinaturaResponsavelUrl ||
                (assinDb as any).responsavel?.url ||
                assinaturaFromResumo(resumoFinal, "responsavel") ||
                assinaturaFromLogs(logVisiveis, "responsavel")
            );
            const urlReq = normAssUrl(
                assinaturaRequerenteUrl ||
                (assinDb as any).requerente?.url ||
                assinaturaFromResumo(resumoFinal, "requerente") ||
                assinaturaFromLogs(logVisiveis, "requerente")
            );

            let assinaturaRespB64: string | undefined;
            let assinaturaReqB64: string | undefined;
            try {
                if (urlResp) assinaturaRespB64 = await loadSignatureImage(urlResp, 800);
            } catch { }
            try {
                if (urlReq) assinaturaReqB64 = await loadSignatureImage(urlReq, 800);
            } catch { }

            const respFromResumo = getNomeCpfAssinatura(resumoFinal, "responsavel", selecionadoAssinatura);
            const reqFromResumo = getNomeCpfAssinatura(resumoFinal, "requerente", selecionadoAssinatura);

            const respInfo = {
                nome: (assinDb as any).responsavel?.nome || respFromResumo.nome || "",
                cpf: formatCpf((assinDb as any).responsavel?.cpf) || respFromResumo.cpf || "",
            };
            const reqInfo = {
                nome: (assinDb as any).requerente?.nome || reqFromResumo.nome || "",
                cpf: formatCpf((assinDb as any).requerente?.cpf) || reqFromResumo.cpf || "",
            };

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

                    if (cursorX === marginL) cursorX = marginL + colW + gap;
                    else {
                        cursorX = marginL;
                        cursorY += used + 3;
                    }
                }
                if (cursorX !== marginL) cursorY += 8;
                y = cursorY + 4;
            }

            // Cards de Log
            const cardPadX = 6,
                cardPadY = 6;

            const writeLine = (text: string | string[], x: number, yy: number, size = 11, bold = false) => {
                doc.setFont(bold ? titleFont[0] : normalFont[0], bold ? titleFont[1] : normalFont[1]);
                doc.setFontSize(size);
                doc.text(Array.isArray(text) ? text : [text], x, yy);
            };

            const logsParaImprimir = logVisiveis.filter((l) => {
                const det = l.detalhes;
                try {
                    const obj = typeof det === "string" ? JSON.parse(det) : det;
                    if (obj && typeof obj === "object" && (obj as any).sem_alteracoes === true) return false;
                } catch { }
                return true;
            });

            for (const ent of logsParaImprimir) {
                const dataLine = formataDataHora(ent.datahora) || "";
                const t = mapAcaoTitulo(ent.acao || "");
                const statusTxt = ent.status_novo ? traduzirFase(ent.status_novo) : "";
                const acaoFull = statusTxt ? `${t.titulo} — ${statusTxt}` : t.titulo;
                const usuarioLine = ent.usuario ? `Usuário: ${ent.usuario}` : "";

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
                const matsTmp: MatLinha[] = [];

                try {
                    const obj =
                        raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);

                    if (obj && typeof obj === "object") {
                        // materiais_json -> coleta e agrupa
                        if (!t.assinatura && obj.materiais_json) {
                            const mj = safeJsonParse(obj.materiais_json) || obj.materiais_json;
                            if (mj && typeof mj === "object") {
                                for (const [k, vv] of Object.entries(mj)) {
                                    const v: any = vv || {};
                                    const qtd = Number(v?.qtd ?? 0);
                                    const checked = asBool(v?.checked) || qtd > 0;
                                    if (qtd > 0 && checked) {
                                        const { categoria, nome } = resolveMaterialLabel(String(k), v, materiaisMap);
                                        matsTmp.push({ categoria, nome, qtd });
                                    }
                                }
                            }
                        }

                        if (!t.assinatura) {
                            for (const key of Object.keys(obj)) {
                                if (["materiais_json", "id", "acao", "sem_alteracoes"].includes(key)) continue;

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

                                // legado (materiais_*_qtd)
                                const m = key.match(/^materiais_(.+?)_qtd$/i);
                                if (m) {
                                    const nomeBase = titleCaseFromSnake(m[1]);
                                    const nome = overrideCampoNome(m[1], nomeBase);
                                    const qtd = (obj as any)[key];
                                    if (qtd != null && String(qtd).trim() !== "") {
                                        // legado não tem categoria: mantém na seção "Materiais" depois
                                        matsTmp.push({ categoria: "Material", nome, qtd: Number(qtd) || 0 });
                                    }
                                    continue;
                                }

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

                                if (/\/uploads\/assinaturas\//i.test(v)) continue;
                                addLine(`${nome}: ${v}`);
                            }
                        }
                    }
                } catch {
                    let detalhesRaw = String(raw || "");
                    if (/\/uploads\/assinaturas\//i.test(detalhesRaw)) detalhesRaw = "";
                    detalhesRaw = substituirRotuloVisual(detalhesRaw);
                    if (detalhesRaw.trim()) addLine(detalhesRaw.trim());
                }

                if (matsTmp.length && !t.assinatura) {
                    addLine("Materiais:");
                    const grupos = agruparMateriais(matsTmp);

                    for (const [cat, items] of grupos) {
                        if (cat) addLine(cat);
                        for (const it of items) addLine(`• ${it.nome}: ${it.qtd}`);
                    }
                }

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
            const materiais = extrairMateriaisAssistencia(logsParaImprimir, materiaisMap);
            const agente = pegarAgenteEntrega(logsParaImprimir);

            const dataInicioVelorioRaw =
                resumoFinal?.data_inicio_velorio ||
                pegarUltimoValorDosLogs(logsParaImprimir, ["data_inicio_velorio", "data de inicio do velorio"]);

            const dataFimVelorioRaw =
                resumoFinal?.data_fim_velorio ||
                pegarUltimoValorDosLogs(logsParaImprimir, ["data_fim_velorio", "data do fim do velorio", "data do sepultamento"]);

            const horaFimVelorioRaw =
                resumoFinal?.hora_fim_velorio ||
                pegarUltimoValorDosLogs(logsParaImprimir, ["hora_fim_velorio", "horario do sepultamento"]);

            const dataVelorio = dataInicioVelorioRaw ? formataSeDataIso(String(dataInicioVelorioRaw)) : "";
            const dataSep = dataFimVelorioRaw ? formataSeDataIso(String(dataFimVelorioRaw)) : "";
            const horaSep = horaFimVelorioRaw ? String(horaFimVelorioRaw) : "";

            // 1) Termo
            doc.addPage();
            drawBg(doc);
            desenharTermoRecebimento(doc, {
                responsavel: respInfo.nome || "",
                cpfResponsavel: respInfo.cpf || "",
                falecido: selecionadoNome,
                agente,
                dataVelorio,
                materiais,
                fonts,
                assinaturaResponsavelB64: assinaturaRespB64,
            });

            // 2) Requisição
            doc.addPage();
            drawBg(doc);
            desenharRequisicaoVeiculo(doc, {
                requerente: reqInfo.nome || "",
                cpfRequerente: reqInfo.cpf || "",
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
