"use client";

import React from "react";
import { organizarResumoRelatorio } from "./FormatadorRelatorio";
import type { MateriaisMap } from "./Api";

interface Props {
    visivel: boolean;
    resumo: Record<string, any>;
    titulo?: string;
    subtitulo?: string;
    materiaisMap?: MateriaisMap;
}

export default function ResumoFinal({
    visivel,
    resumo,
    titulo = "Resumo do Atendimento",
    subtitulo = "Informações organizadas por assunto para facilitar a conferência.",
    materiaisMap,
}: Props) {
    if (!visivel) return null;

    const { secoes, tecnicos } = organizarResumoRelatorio(resumo, materiaisMap);
    if (!secoes.length && !tecnicos.length) return null;

    return (
        <section className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3 sm:px-5">
                <h4 className="text-sm font-semibold text-slate-900">{titulo}</h4>
                <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-2">
                {secoes.map((secao) => (
                    <div
                        key={secao.id}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40"
                    >
                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {secao.titulo}
                        </div>

                        <dl className="divide-y divide-slate-100 bg-white">
                            {secao.campos.map((campo) => (
                                <div
                                    key={`${secao.id}-${campo.chave}`}
                                    className="grid grid-cols-1 gap-0.5 px-3 py-2.5 sm:grid-cols-[150px_1fr] sm:gap-3"
                                >
                                    <dt className="text-xs font-medium text-slate-500">
                                        {campo.label}
                                    </dt>
                                    <dd className="min-w-0 break-words text-sm text-slate-900">
                                        {campo.valor}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                ))}
            </div>

            {tecnicos.length > 0 && (
                <div className="border-t px-4 py-3 sm:px-5">
                    <details className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60">
                        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600">
                            Ver dados técnicos ({tecnicos.length})
                        </summary>
                        <dl className="divide-y divide-slate-200 border-t border-dashed border-slate-300 px-3">
                            {tecnicos.map((campo, index) => (
                                <div
                                    key={`${campo.chave}-${index}`}
                                    className="grid grid-cols-1 gap-1 py-2 text-xs sm:grid-cols-[180px_1fr]"
                                >
                                    <dt className="font-medium text-slate-500">{campo.label}</dt>
                                    <dd className="break-all text-slate-700">{campo.valor}</dd>
                                </div>
                            ))}
                        </dl>
                    </details>
                </div>
            )}
        </section>
    );
}
