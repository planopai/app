"use client";
import React, { useEffect, useState } from "react";
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

export default function BotaoExportarPdf({
    desabilitado,
    selecionadoNome,
    criacaoSelecionado,
    logVisiveis,
    resumoFinal,
}: Props) {
    const [loading, setLoading] = useState(false);
    const [jsPDF, setJsPDF] = useState<any>(null);

    useEffect(() => {
        (async () => {
            const mod = await import("jspdf");
            setJsPDF(() => mod.default); // ✅ aqui é o certo
        })();
    }, []);

    async function gerarPdf() {
        if (!jsPDF) return;
        setLoading(true);
        try {
            const doc = new jsPDF();
            doc.setFontSize(14);
            doc.text(`Histórico de ${selecionadoNome}`, 10, 10);
            if (criacaoSelecionado) {
                doc.setFontSize(10);
                doc.text(`Criado em: ${formataDataHora(criacaoSelecionado)}`, 10, 16);
            }

            // Resumo Final do Relatório
            if (resumoFinal) {
                doc.setFontSize(12);
                doc.text("Resumo Final", 10, 26);
                let y = 32;
                for (const k of [
                    ...RESUMO_ORDER,
                    ...Object.keys(resumoFinal).filter((x) => !RESUMO_ORDER.includes(x)),
                ]) {
                    const label = overrideCampoNome(k, titleCaseFromSnake(k));
                    const val = substituirRotuloVisual(resumoFinal[k]);
                    doc.text(`${label}: ${val}`, 10, y);
                    y += 6;
                }
            }

            // Logs
            let y = 100;
            doc.setFontSize(12);
            doc.text("Logs", 10, y);
            y += 6;
            for (const l of logVisiveis) {
                if (y > 280) {
                    doc.addPage();
                    y = 20;
                }
                doc.setFontSize(10);
                doc.text(
                    `${formataDataHora(l.datahora)} - ${l.acao} (${l.usuario || "?"})`,
                    10,
                    y
                );
                y += 5;
            }

            doc.save(`historico-${selecionadoNome}.pdf`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <button
            onClick={gerarPdf}
            disabled={desabilitado || loading}
            className="bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50"
        >
            {loading ? "Gerando..." : "Baixar PDF"}
        </button>
    );
}
