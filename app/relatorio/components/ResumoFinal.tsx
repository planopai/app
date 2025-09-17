"use client";
import React from "react";
import { RESUMO_ORDER } from "./ConstantesResumo";
import { overrideCampoNome, substituirRotuloVisual, titleCaseFromSnake } from "./UtilTexto";

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
        <div className="border rounded mt-4">
            <div className="bg-gray-100 p-2 font-semibold">Relatório Final</div>
            <div className="p-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                {chaves.map((k) => (
                    <div
                        key={k}
                        className="border p-2 rounded bg-white shadow-sm text-sm"
                    >
                        <div className="font-medium">
                            {overrideCampoNome(k, titleCaseFromSnake(k))}
                        </div>
                        <div>{substituirRotuloVisual(resumo[k])}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
