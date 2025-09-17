"use client";
import React, { useEffect, useRef, useState } from "react";
import { LogItem } from "./TiposHistorico";
import { RESUMO_ORDER } from "./ConstantesResumo";
import { formataDataHora } from "./UtilDatas";
import { overrideCampoNome, substituirRotuloVisual, titleCaseFromSnake } from "./UtilTexto";

interface Props {
    desabilitado: boolean;
    selecionadoNome: string;
    criacaoSelecionado?: string;
    logVisiveis: LogItem[];
    resumoFinal?: Record<string, string>;
}

/** Carrega jsPDF via CDN (sem depender do bundle). */
function useJsPdfCdn() {
    const [ready, setReady] = useState(false);
    const once = useRef(false);

    useEffect(() => {
        if (once.current) return;
        once.current = true;

        // já carregado?
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

        return () => {
            // não removemos o script para reaproveitar entre telas
        };
    }, []);

    return ready;
}

export default function BotaoExportarPdf({
    desabilitado,
    selecionadoNome,
    criacaoSelecionado,
    logVisiveis,
    resumoFinal,
}: Props) {
    const [gerando, setGerando] = useState(false);
    const jsPdfOk = useJsPdfCdn();

    async function gerarPdf() {
        if (!jsPdfOk) return; // ainda carregando
        setGerando(true);
        try {
            const { jsPDF } = (window as any).jspdf;
            const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

            let y = 14;
            doc.setFontSize(16);
            doc.text(`Histórico de ${selecionadoNome}`, 105, y, { align: "center" });
            y += 8;

            if (criacaoSelecionado) {
                doc.setFontSize(10);
                doc.text(`Criado em: ${formataDataHora(criacaoSelecionado)}`, 105, y, { align: "center" });
                y += 8;
            }

            // Resumo Final (se existir)
            if (resumoFinal && Object.keys(resumoFinal).length) {
                doc.setFontSize(12);
                doc.text("Resumo Final", 14, y);
                y += 6;

                const order = [
                    ...RESUMO_ORDER,
                    ...Object.keys(resumoFinal).filter((k) => !RESUMO_ORDER.includes(k)),
                ];

                doc.setFontSize(10);
                const maxW = 182; // 210 - 14 - 14
                for (const k of order) {
                    const label = overrideCampoNome(k, titleCaseFromSnake(k));
                    const val = substituirRotuloVisual(resumoFinal[k] ?? "");
                    const lines = doc.splitTextToSize(`${label}: ${val}`, maxW);
                    if (y + lines.length * 5 > 287) {
                        doc.addPage();
                        y = 14;
                    }
                    doc.text(lines, 14, y);
                    y += lines.length * 5;
                }
                y += 4;
            }

            // Logs
            doc.setFontSize(12);
            if (y > 280) {
                doc.addPage();
                y = 14;
            }
            doc.text("Logs", 14, y);
            y += 6;

            doc.setFontSize(10);
            const maxW = 182;
            for (const l of logVisiveis) {
                const linha = `${formataDataHora(l.datahora)} - ${l.acao} (${l.usuario || "?"})`;
                const lines = doc.splitTextToSize(linha, maxW);
                if (y + lines.length * 5 > 287) {
                    doc.addPage();
                    y = 14;
                }
                doc.text(lines, 14, y);
                y += lines.length * 5;
            }

            doc.save(`historico-${selecionadoNome}.pdf`);
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
