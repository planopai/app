"use client";
import React, { useEffect, useRef, useState } from "react";
import { LogItem } from "./TiposHistorico";
import { RESUMO_ORDER } from "./ConstantesResumo";
import { formataDataHora, formataSeDataIso, formataDataDia } from "./UtilDatas";
import { overrideCampoNome, substituirRotuloVisual, titleCaseFromSnake, capitalize } from "./UtilTexto";
import { traduzirFase } from "./ConstantesFases";
import { asBool } from "./Normalizadores";

/* =============== Props =============== */
interface Props {
    desabilitado: boolean;
    selecionadoNome: string;
    /** Opcional: nome do responsável para assinar as páginas extras. */
    selecionadoAssinatura?: string;
    criacaoSelecionado?: string;
    logVisiveis: LogItem[];
    resumoFinal?: Record<string, string>;
}

/* =============== jsPDF via CDN =============== */
function useJsPdfCdn() {
    const [ready, setReady] = useState(false);
    const once = useRef(false);
    useEffect(() => {
        if (once.current) return;
        once.current = true;
        if ((window as any).jspdf?.jsPDF) { setReady(true); return; }
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => setReady(Boolean((window as any).jspdf?.jsPDF));
        script.onerror = () => setReady(false);
        document.body.appendChild(script);
    }, []);
    return ready;
}

/* =============== Fonte Nunito (opcional) =============== */
const nunitoStateRef: { current: "none" | "ok" | "fail" } = { current: "none" };
async function ensureNunito(doc: any): Promise<boolean> {
    if (nunitoStateRef.current === "ok") return true;
    if (nunitoStateRef.current === "fail") return false;
    try {
        const regularUrl = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nunito/Nunito-Regular.ttf";
        const boldUrl = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nunito/Nunito-Bold.ttf";
        async function fetchTTF(u: string) {
            const r = await fetch(u);
            if (!r.ok) throw new Error("Fonte não encontrada");
            const b = await r.arrayBuffer();
            let binary = "";
            const bytes = new Uint8Array(b);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        }
        const [regB64, boldB64] = await Promise.all([fetchTTF(regularUrl), fetchTTF(boldUrl)]);
        (doc as any).addFileToVFS("Nunito-Regular.ttf", regB64);
        (doc as any).addFont("Nunito-Regular.ttf", "Nunito", "normal");
        (doc as any).addFileToVFS("Nunito-Bold.ttf", boldB64);
        (doc as any).addFont("Nunito-Bold.ttf", "Nunito", "bold");
        nunitoStateRef.current = "ok";
        return true;
    } catch {
        nunitoStateRef.current = "fail";
        return false;
    }
}

/* =============== Helpers de layout do PDF =============== */
function ensurePageSpace(doc: any, y: number, needed: number, marginTop = 22) {
    const pageH = doc.internal.pageSize.getHeight();
    if (y + needed > pageH - 20) { doc.addPage(); return marginTop; }
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
    const padX = 4, padY = 4;
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

/* =============== Materiais da Assistência (rótulos) =============== */
const MATERIAL_LABELS: Record<string, string> = {
    cadeiras: "Cadeiras metálicas",
    bebedouros: "Bebedouro (20 litros)",
    kit_lanche: "Kit de Lanche",
    placa: "Placa Luminosa",
    suporte_coroa: "1 Coroa de flores artificiais com suporte",
    tenda: "Barraca sanfonada 3m x 2m",
    velas: "Velas",
    paramentacao: "Paramentação",
};

/* =============== Extração de materiais =============== */
/** Usa o ÚLTIMO `materiais_json` dos logs (estado atual da Assistência). Se não houver, faz fallback somando *_qtd. */
function extrairMateriaisAssistencia(logs: LogItem[]): Record<string, number> {
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
        } catch { /* ignore */ }
    }
    if (ultimoMj && typeof ultimoMj === "object") {
        const out: Record<string, number> = {};
        Object.entries(ultimoMj).forEach(([k, v]: any) => {
            const qtd = Number(v?.qtd ?? 0);
            const marcado = String(v?.checked ?? "").toLowerCase();
            if (qtd > 0 && (marcado === "true" || marcado === "1" || marcado === "sim")) {
                out[k.toLowerCase()] = qtd;
            }
        });
        return out;
    }

    // fallback
    const total: Record<string, number> = {};
    for (const l of logs) {
        const raw = l.detalhes as any;
        let obj: Record<string, any> = {};
        if (typeof raw === "string") {
            try { obj = JSON.parse(raw); } catch { obj = {}; }
        } else if (raw && typeof raw === "object") obj = raw;

        for (const key of Object.keys(obj)) {
            const m = key.match(/^materiais_(.+?)_qtd$/i);
            if (m) {
                const base = m[1].toLowerCase();
                const qtd = Number(obj[key] ?? 0);
                if (Number.isFinite(qtd) && qtd > 0) total[base] = (total[base] || 0) + qtd;
            }
        }
    }
    return total;
}

/** Agente (usuário) que entregou o corpo (fase 08) ou último usuário. */
function pegarAgenteEntrega(logs: LogItem[]): string {
    const byDate = [...logs].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    const fase8 = [...byDate].reverse().find(
        (l) => ((l.status_novo || "").toLowerCase() === "fase08") || /entrega.*corpo/i.test(l.status_novo || "")
    );
    if (fase8?.usuario) return fase8.usuario;
    const ult = byDate.at(-1);
    return ult?.usuario || "";
}

/* =============== Helpers de texto com quebra automática =============== */
function drawParagraph(doc: any, text: string, x: number, y: number, maxWidth: number, font: [string, string], size = 11) {
    doc.setFont(font[0], font[1]);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return lines.length * 6; // altura aproximada consumida
}

/** Checkbox com quebra automática do texto na largura informada. Retorna altura consumida. */
function drawCheckBoxWrapped(doc: any, x: number, y: number, text: string, maxWidth: number) {
    doc.rect(x, y - 4, 4, 4);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x + 6, y);
    const used = (lines.length - 1) * 6 + 7;
    return used;
}

/* =============== Página 1 extra: Termo de recebimento (usa data do velório) =============== */
function desenharTermoRecebimento(doc: any, params: {
    responsavel: string;
    falecido: string;
    agente: string;
    dataVelorio: string; // dd/mm/aaaa
    materiais: Record<string, number>;
}) {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const maxW = pageW - margin * 2;
    let y = 18;

    doc.setFontSize(14);
    doc.text("TERMO DE RECEBIMENTO DE MATERIAL PARA ASSISTÊNCIA", pageW / 2, y, { align: "center" });
    y += 12;

    y += drawParagraph(
        doc,
        `Eu, ${params.responsavel || "________________________"}, confirmo o recebimento do material para o velório do(a) ${params.falecido || "________________________"}, entregue pela pessoa de ${params.agente || "________________________"} representante do PAI – Plano Assistencial Integrado. Atesto o recebimento e me comprometo a zelar e devolver nas mesmas condições os seguintes itens:`,
        margin, y, maxW, ["helvetica", "normal"], 11
    ) + 4;

    doc.setFontSize(12);
    doc.text("Itens:", margin, y);
    y += 8;
    doc.setFontSize(11);

    const colGap = 8;
    const colW = (maxW - colGap) / 2;
    const colX = [margin, margin + colW + colGap];
    let col = 0;
    const keys = Object.keys(MATERIAL_LABELS);
    for (const k of keys) {
        const label = MATERIAL_LABELS[k] || k;
        const qtd = params.materiais[k] || 0;
        const text = qtd > 0 ? `${label}: ${qtd}` : label;

        const used = drawCheckBoxWrapped(doc, colX[col], y, text, colW - 10);
        y += used;

        if (y > 240) { // troca de coluna/página
            if (col === 0) { col = 1; y = 26; }
            else { doc.addPage(); y = 20; col = 0; }
        }
    }

    y = Math.max(y, 230);
    doc.setLineWidth(0.3);
    doc.line(margin + 6, y + 25, pageW - margin - 6, y + 25);
    doc.text("Responsável pelo recebimento (assinatura)", pageW / 2, y + 30, { align: "center" });
    doc.text(`Barreiras-BA, ${params.dataVelorio || "____/____/____"}`, margin + 6, y + 18);
}

/* =============== Página 2 extra: Requisição de veículo (usa data/hora do sepultamento) =============== */
function desenharRequisicaoVeiculo(doc: any, params: {
    requerente: string;
    falecido: string;
    dataSepultamento?: string; // dd/mm/aaaa
    horaSepultamento?: string; // hh:mm
}) {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const maxW = pageW - margin * 2;
    let y = 18;

    doc.setFontSize(14);
    doc.text("REQUISIÇÃO DE VEÍCULO FUNERÁRIO PARA SEPULTAMENTO", pageW / 2, y, { align: "center" });
    y += 12;

    y += drawParagraph(
        doc,
        `Eu, ${params.requerente || "________________________"}, solicito à empresa PAI – Plano Assistencial Integrado, veículo funerário para o sepultamento do corpo de ${params.falecido || "________________________"}, que ocorrerá no dia ${params.dataSepultamento || "____/____/____"} às ${params.horaSepultamento || "____:____"}.`,
        margin, y, maxW, ["helvetica", "normal"], 11
    ) + 6;

    y += drawParagraph(
        doc,
        "Desde já, tenho conhecimento de que este pedido deve ser realizado com antecedência mínima de 05 (cinco) horas e, caso ocorra fora desse horário, a empresa está isenta de responsabilidades por qualquer contratempo.",
        margin, y, maxW, ["helvetica", "normal"], 11
    ) + 18;

    doc.setLineWidth(0.3);
    doc.line(margin + 6, y + 25, pageW - margin - 6, y + 25);
    doc.text("Requerente (assinatura)", pageW / 2, y + 30, { align: "center" });
}

/* =============== Componente principal =============== */
export default function BotaoExportarPdf({
    desabilitado,
    selecionadoNome,
    selecionadoAssinatura,
    criacaoSelecionado,
    logVisiveis,
    resumoFinal,
}: Props) {
    const [gerando, setGerando] = useState(false);
    const jsPdfOk = useJsPdfCdn();

    async function gerarPdf() {
        if (!jsPdfOk || logVisiveis.length === 0) return;

        setGerando(true);
        try {
            const { jsPDF } = (window as any).jspdf;
            const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
            const hasNunito = await ensureNunito(doc);

            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const marginL = 14, marginR = 14;
            const contentW = pageW - marginL - marginR;

            const titleFont: [string, string] = hasNunito ? ["Nunito", "bold"] : ["helvetica", "bold"];
            const normalFont: [string, string] = hasNunito ? ["Nunito", "normal"] : ["helvetica", "normal"];

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
                    cursorY = ensurePageSpace(doc, cursorY, cardH);

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

            for (const ent of logVisiveis) {
                const dataLine = formataDataHora(ent.datahora) || "";
                const acao = capitalize(ent.acao || "");
                const statusTxt = ent.status_novo ? traduzirFase(ent.status_novo) : "";
                const acaoFull = statusTxt ? `${acao} — ${statusTxt}` : acao;
                const usuarioLine = ent.usuario ? `Usuário: ${ent.usuario}` : "";

                const detalhesLines: string[] = [];
                const raw = ent.detalhes as any;
                const materiaisLines: string[] = [];

                try {
                    const obj = raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);
                    if (obj && typeof obj === "object") {
                        for (const key of Object.keys(obj)) {
                            if (["materiais_json", "id", "acao"].includes(key)) continue;

                            // Arrumação
                            if (/^arruma[cç][aã]o(\s*json|_json)?$/i.test(key)) {
                                let aobj: any = {};
                                const val = obj[key];
                                if (typeof val === "string") { try { aobj = JSON.parse(val); } catch { aobj = {}; } }
                                else if (typeof val === "object" && val) aobj = val;
                                for (const [k, v] of Object.entries(aobj)) {
                                    if (asBool(v)) detalhesLines.push(`${titleCaseFromSnake(k)}: Sim`);
                                }
                                continue;
                            }

                            // Materiais_*_qtd
                            const m = key.match(/^materiais_(.+?)_qtd$/i);
                            if (m) {
                                const nomeBase = titleCaseFromSnake(m[1]);
                                const nome = overrideCampoNome(m[1], nomeBase);
                                const qtd = obj[key];
                                if (qtd != null && String(qtd).trim() !== "") materiaisLines.push(`${nome}: ${String(qtd)}`);
                                continue;
                            }

                            // Campos simples
                            if (typeof obj[key] === "object" && !Array.isArray(obj[key])) continue;
                            let v = obj[key];
                            if (v == null || String(v).trim() === "") continue;

                            let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
                            nome = overrideCampoNome(key, nome);
                            v = String(v);
                            if (v.startsWith("fase")) v = traduzirFase(v);
                            v = formataSeDataIso(v);
                            nome = substituirRotuloVisual(nome);
                            v = substituirRotuloVisual(v);
                            detalhesLines.push(`${nome}: ${v}`);
                        }
                    }
                } catch {
                    let detalhesRaw = String(raw || "");
                    detalhesRaw = substituirRotuloVisual(detalhesRaw);
                    if (detalhesRaw.trim()) detalhesLines.push(detalhesRaw.trim());
                }

                if (materiaisLines.length) {
                    detalhesLines.unshift("Materiais:");
                    for (const l of materiaisLines) detalhesLines.push(`• ${l}`);
                }

                // Medidas
                doc.setFont(normalFont[0], normalFont[1]); doc.setFontSize(9);
                const dataWrapped = doc.splitTextToSize(dataLine, contentW - cardPadX * 2);

                doc.setFont(titleFont[0], titleFont[1]); doc.setFontSize(12);
                const acaoWrapped = doc.splitTextToSize(acaoFull, contentW - cardPadX * 2);

                doc.setFont(normalFont[0], normalFont[1]); doc.setFontSize(10);
                const usuarioWrapped = doc.splitTextToSize(usuarioLine, contentW - cardPadX * 2);

                doc.setFont(normalFont[0], normalFont[1]); doc.setFontSize(11);
                const detalhesWrapped = detalhesLines.flatMap((l) => doc.splitTextToSize(l, contentW - cardPadX * 2));

                const hData = dataWrapped.length ? 4 + (dataWrapped.length - 1) * 4 : 0;
                const hAcao = acaoWrapped.length * 5;
                const hUsuario = usuarioWrapped.length ? usuarioWrapped.length * 5 : 0;
                const hDetalhes = detalhesWrapped.length ? detalhesWrapped.length * 5 : 0;

                const innerHeight = (hData ? hData + hUsuario + hDetalhes + 3 : hUsuario + hDetalhes + 3) + hAcao;
                const cardH = innerHeight + 2 * cardPadY;

                if (y + cardH + 8 > pageH) { doc.addPage(); y = 22; }

                doc.setDrawColor(210); doc.setLineWidth(0.25);
                (doc as any).roundedRect(marginL, y, contentW, cardH, 3, 3);

                let yy = y + cardPadY;
                if (dataWrapped.length) { writeLine(dataWrapped, marginL + cardPadX, yy, 9, false); yy += 4 + (dataWrapped.length - 1) * 4 + 3; }
                writeLine(acaoWrapped, marginL + cardPadX, yy, 12, true); yy += hAcao;
                if (usuarioWrapped.length) { writeLine(usuarioWrapped, marginL + cardPadX, yy, 10, false); yy += usuarioWrapped.length * 5; }
                if (detalhesWrapped.length) { writeLine(detalhesWrapped, marginL + cardPadX, yy, 11, false); yy += detalhesWrapped.length * 5; }
                y += cardH + 8;
            }

            // ====== PÁGINAS EXTRAS ======
            // Materiais e agente
            const materiais = extrairMateriaisAssistencia(logVisiveis);
            const agente = pegarAgenteEntrega(logVisiveis);

            // 1) Termo — data do velório
            doc.addPage();
            const dataVelorio =
                (resumoFinal?.data_inicio_velorio && formataSeDataIso(resumoFinal.data_inicio_velorio)) || "";
            desenharTermoRecebimento(doc, {
                responsavel: selecionadoAssinatura || "",
                falecido: selecionadoNome,
                agente,
                dataVelorio,
                materiais
            });

            // 2) Requisição — data e hora do sepultamento
            doc.addPage();
            const dataSep =
                (resumoFinal?.data_fim_velorio && formataSeDataIso(resumoFinal.data_fim_velorio)) || "";
            const horaSep =
                (resumoFinal?.hora_fim_velorio && formataSeDataIso(resumoFinal.hora_fim_velorio)) || "";
            desenharRequisicaoVeiculo(doc, {
                requerente: selecionadoAssinatura || "",
                falecido: selecionadoNome,
                dataSepultamento: dataSep,
                horaSepultamento: horaSep
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
