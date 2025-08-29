"use client";
import React from "react";
import { Registro } from "./types";
import { capitalizeStatus } from "./helpers";

interface Props {
    registros: Registro[];
    onAcao: (idx: number) => void;
    onInfo: (idx: number) => void;
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

export default function TabelaAtendimentos({ registros, onAcao, onInfo }: Props) {
    const visiveis = registros.filter((r) => r.status !== "fase11");

    return (
        <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                    <tr>
                        <th className="w-40 px-3 py-2 text-left font-semibold">Status</th>
                        <th className="px-3 py-2 text-left font-semibold">Falecido(a)</th>

                        {/* Agente: escondido no mobile, visível a partir de sm */}
                        <th className="hidden w-48 px-3 py-2 text-left font-semibold sm:table-cell">Agente</th>

                        {/* Ações: no mobile funciona também como coluna de Info (empilhado) */}
                        <th className="w-36 px-3 py-2 text-left font-semibold">Ações</th>

                        {/* Info: somente desktop/tablet */}
                        <th className="hidden w-28 px-3 py-2 text-left font-semibold sm:table-cell">Info</th>
                    </tr>
                </thead>
                <tbody id="tb-registros">
                    {visiveis.length === 0 ? (
                        <tr>
                            <td className="px-3 py-6 text-center opacity-70" colSpan={5}>
                                Nenhum registro cadastrado.
                            </td>
                        </tr>
                    ) : (
                        visiveis.map((r, idx) => (
                            <tr key={String(r.id ?? `row-${idx}`)} className="border-t">
                                <td className="px-3 py-2">
                                    <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBg(
                                            r.status
                                        )}`}
                                    >
                                        {capitalizeStatus(r.status)}
                                    </span>
                                </td>

                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{r.falecido || ""}</span>
                                    </div>
                                </td>

                                {/* Agente: escondido no mobile, visível a partir de sm */}
                                <td className="hidden px-3 py-2 sm:table-cell">{r.agente || ""}</td>

                                {/* Ações: no mobile empilha Ações (azul escuro) e Info (azul claro) */}
                                <td className="px-3 py-2">
                                    <div className="flex flex-col gap-2">
                                        <button
                                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
                                            onClick={() => onAcao(idx)}
                                        >
                                            Ações
                                        </button>

                                        {/* Info no mobile (fica dentro da mesma coluna) */}
                                        <button
                                            className="rounded-md bg-blue-400 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 sm:hidden"
                                            onClick={() => onInfo(idx)}
                                        >
                                            Info
                                        </button>
                                    </div>
                                </td>

                                {/* Info no desktop/tablet: coluna separada */}
                                <td className="hidden px-3 py-2 sm:table-cell">
                                    <button
                                        className="rounded-md bg-blue-400 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                                        onClick={() => onInfo(idx)}
                                    >
                                        Info
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
