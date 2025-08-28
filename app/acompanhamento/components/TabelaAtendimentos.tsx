"use client";
import React from "react";
import { Registro } from "./types";
import { capitalizeStatus } from "./helpers";

interface Props {
    registros: Registro[];
    onAcao: (idx: number) => void;
    onInfo: (idx: number) => void;
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
                        <th className="w-48 px-3 py-2 text-left font-semibold">Agente</th>
                        <th className="w-36 px-3 py-2 text-left font-semibold">Ações</th>
                        <th className="w-28 px-3 py-2 text-left font-semibold">Info</th>
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
                                    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                                        {capitalizeStatus(r.status)}
                                    </span>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{r.falecido || ""}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-2">{r.agente || ""}</td>
                                <td className="px-3 py-2">
                                    <button
                                        className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                                        onClick={() => onAcao(idx)}
                                    >
                                        Ações
                                    </button>
                                </td>
                                <td className="px-3 py-2">
                                    <button
                                        className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
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
