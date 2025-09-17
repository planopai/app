"use client";
import React from "react";
import { LogItem } from "./TiposHistorico";
import { traduzirFase, iconeAcao } from "./ConstantesFases";
import { formataDataHora, formataSeDataIso } from "./UtilDatas";
import { extrairParesDoDetalhe, isNoChangeEntry } from "./Normalizadores";
import { overrideCampoNome, substituirRotuloVisual, titleCaseFromSnake } from "./UtilTexto";

interface Props {
    logs: LogItem[];
    usuarioVisivel?: boolean;
}

export default function LinhaDoTempoLogs({ logs, usuarioVisivel = true }: Props) {
    if (!logs || logs.length === 0) {
        return <div className="p-4 text-center text-gray-500">Nenhum log encontrado.</div>;
    }

    return (
        <ul className="divide-y">
            {logs
                .filter((l) => !isNoChangeEntry(l))
                .map((l, idx) => {
                    const pares = extrairParesDoDetalhe(l.detalhes);
                    return (
                        <li key={idx} className="p-2">
                            <div className="flex items-center gap-2">
                                <span>{iconeAcao(l.acao, l.status_novo)}</span>
                                <span className="font-semibold">{l.acao}</span>
                                {l.status_novo && (
                                    <span className="text-sm text-gray-600">
                                        {traduzirFase(l.status_novo)}
                                    </span>
                                )}
                                <span className="ml-auto text-xs text-gray-500">
                                    {formataDataHora(l.datahora)}
                                </span>
                            </div>

                            {/* Detalhes */}
                            {Object.keys(pares).length > 0 && (
                                <div className="mt-1 ml-6 text-sm">
                                    {Object.entries(pares).map(([k, v]) => (
                                        <div key={k} className="flex">
                                            <span className="font-medium mr-1">
                                                {overrideCampoNome(k, titleCaseFromSnake(k))}:
                                            </span>
                                            <span>{formataSeDataIso(substituirRotuloVisual(v))}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {usuarioVisivel && (
                                <div className="ml-6 text-xs text-gray-500">
                                    Usuário: {l.usuario || "Desconhecido"}
                                </div>
                            )}
                        </li>
                    );
                })}
        </ul>
    );
}
