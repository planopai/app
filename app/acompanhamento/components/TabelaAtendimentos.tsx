"use client";

import React from "react";
import { IconShare3 } from "@tabler/icons-react";
import { Registro } from "./types";
import { capitalizeStatus } from "./helpers";

interface Props {
    registros: Registro[];
    onAcao: (id: Registro["id"]) => void;
    onInfo: (id: Registro["id"]) => void;
    onCompartilhar: (id: Registro["id"]) => void;
}

const statusClasses: Record<string, string> = {
    fase00: "bg-slate-300 text-slate-900",
    fase01: "bg-blue-100 text-blue-800",
    fase02: "bg-green-100 text-green-800",
    fase03: "bg-yellow-100 text-yellow-900",
    fase04: "bg-amber-100 text-amber-900",
    fase05: "bg-purple-100 text-purple-800",
    fase06: "bg-indigo-100 text-indigo-800",
    fase07: "bg-cyan-100 text-cyan-800",
    fase08: "bg-pink-100 text-pink-800",
    fase09: "bg-teal-100 text-teal-800",
    fase10: "bg-slate-200 text-slate-900",
    fase11: "bg-slate-300 text-slate-900",
    falecido: "bg-red-600 text-white",
    concluido: "bg-emerald-600 text-white",
};

function statusBg(s?: string) {
    const key = String(s || "").toLowerCase();
    return statusClasses[key] || "bg-muted text-foreground";
}

function isNao(v?: string) {
    const s = (v || "").toString().trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n";
}

function isSim(v?: string) {
    return (v || "").toString().trim().toLowerCase() === "sim";
}

function isTerceiro(r: Registro) {
    // Não inferir pelo conteúdo dos campos: um atendimento funerário normal
    // também pode ter Assistência, Tanato e Ornamentação marcados como Não.
    return String((r as any).tipo_atendimento ?? "").trim().toLowerCase() === "terceiro";
}

export default function TabelaAtendimentos({
    registros,
    onAcao,
    onInfo,
    onCompartilhar,
}: Props) {
    /**
     * Regras de visibilidade:
     * - fase11 continua sendo o encerramento quando há material para recolher;
     * - registros antigos, sem os novos campos, mantêm o fluxo anterior;
     * - sem Assistência, o registro some na última fase operacional aplicável;
     * - sem Sepultamento, a última fase pode ser Entrega de Corpo (fase08);
     * - sem Velório e sem Sepultamento, a última fase pode ser Corpo Pronto (fase12).
     */
    const visiveis = registros.filter((r) => {
        if (r.status === "fase11") return false;

        if (isTerceiro(r)) {
            return r.status !== "fase10";
        }

        // Com assistência, ainda existe a etapa final de Material Recolhido.
        if (isSim(r.assistencia)) return true;

        const semVelorio = isNao((r as any).realiza_velorio);
        const semSepultamento = isNao((r as any).realiza_sepultamento);

        if (!semSepultamento) {
            return r.status !== "fase10";
        }

        if (!semVelorio) {
            return r.status !== "fase08";
        }

        return r.status !== "fase12";
    });

    return (
        <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                    <tr>
                        <th className="w-40 px-3 py-2 text-left font-semibold">Status</th>
                        <th className="px-3 py-2 text-left font-semibold">Falecido(a)</th>
                        <th className="hidden w-48 px-3 py-2 text-left font-semibold sm:table-cell">Agente</th>
                        <th className="w-40 px-3 py-2 text-left font-semibold">Ações</th>
                        <th className="hidden w-28 px-3 py-2 text-left font-semibold sm:table-cell">Info</th>
                        <th className="hidden w-20 px-3 py-2 text-left font-semibold sm:table-cell">Compart.</th>
                    </tr>
                </thead>

                <tbody id="tb-registros">
                    {visiveis.length === 0 ? (
                        <tr>
                            <td className="px-3 py-6 text-center opacity-70" colSpan={6}>
                                Nenhum registro cadastrado.
                            </td>
                        </tr>
                    ) : (
                        visiveis.map((r, idx) => (
                            <tr key={String(r.id ?? `row-${idx}`)} className="border-t">
                                <td className="px-3 py-2">
                                    <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBg(r.status)}`}
                                    >
                                        {capitalizeStatus(r.status)}
                                    </span>
                                </td>

                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{r.falecido || ""}</span>
                                    </div>
                                </td>

                                <td className="hidden px-3 py-2 sm:table-cell">
                                    {r.agente || ""}
                                </td>

                                <td className="px-3 py-2">
                                    <div className="flex flex-col gap-2">
                                        <button
                                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
                                            onClick={() => r.id != null && onAcao(r.id)}
                                        >
                                            Ações
                                        </button>

                                        {/* Mobile: Info e Compartilhar aparecem dentro da coluna Ações */}
                                        <button
                                            className="rounded-md bg-blue-400 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 sm:hidden"
                                            onClick={() => r.id != null && onInfo(r.id)}
                                        >
                                            Info
                                        </button>

                                        <button
                                            className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 sm:hidden"
                                            onClick={() => r.id != null && onCompartilhar(r.id)}
                                            title="Compartilhar"
                                        >
                                            <IconShare3 className="size-4" />
                                            Compartilhar
                                        </button>
                                    </div>
                                </td>

                                <td className="hidden px-3 py-2 sm:table-cell">
                                    <button
                                        className="rounded-md bg-blue-400 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                                        onClick={() => r.id != null && onInfo(r.id)}
                                    >
                                        Info
                                    </button>
                                </td>

                                <td className="hidden px-3 py-2 sm:table-cell">
                                    <button
                                        className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                        onClick={() => r.id != null && onCompartilhar(r.id)}
                                        title="Compartilhar"
                                        aria-label="Compartilhar"
                                    >
                                        <IconShare3 className="size-4" />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}