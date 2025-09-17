"use client";
import React from "react";
import { RESUMO_ORDER } from "./ConstantesResumo";
import {
    overrideCampoNome,
    substituirRotuloVisual,
    titleCaseFromSnake,
} from "./UtilTexto";

interface Props {
    visivel: boolean;
    resumo: Record<string, string>;
}

export default function ResumoFinal({ visivel, resumo }: Props) {
    if (!visivel) return null;

    const chaves = [
        ...RESUMO_ORDER,
        ...Object.keys(resumo).filter((k) => !RESUMO_ORDER.includes(k)),
    ];

    return (
        <div className="mt-4 rounded-2xl border bg-card/60 shadow-sm backdrop-blur">
            <div className="border-b p-3 font-semibold">Relatório Final</div>
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {chaves.map((k) => {
                    const valor = substituirRotuloVisual(resumo[k] ?? "");
                    if (!valor) return null; // não mostra vazio

                    return (
                        <div
                            key={k}
                            className="rounded-xl border bg-white/50 p-3 shadow-sm"
                        >
                            <div className="font-medium">
                                {overrideCampoNome(k, titleCaseFromSnake(k))}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">{valor}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
