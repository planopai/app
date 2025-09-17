"use client";
import React from "react";

interface Props {
    filtroNome: string;
    filtroDe: string;
    filtroAte: string;
    onChangeNome: (v: string) => void;
    onChangeDe: (v: string) => void;
    onChangeAte: (v: string) => void;
    onAbrirAnalise: () => void;
}

export default function BarraFiltros({
    filtroNome,
    filtroDe,
    filtroAte,
    onChangeNome,
    onChangeDe,
    onChangeAte,
    onAbrirAnalise,
}: Props) {
    return (
        <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col">
                <label className="text-sm">Nome</label>
                <input
                    value={filtroNome}
                    onChange={(e) => onChangeNome(e.target.value)}
                    className="border p-1 rounded"
                />
            </div>
            <div className="flex flex-col">
                <label className="text-sm">De</label>
                <input
                    type="date"
                    value={filtroDe}
                    onChange={(e) => onChangeDe(e.target.value)}
                    className="border p-1 rounded"
                />
            </div>
            <div className="flex flex-col">
                <label className="text-sm">Até</label>
                <input
                    type="date"
                    value={filtroAte}
                    onChange={(e) => onChangeAte(e.target.value)}
                    className="border p-1 rounded"
                />
            </div>
            <button
                onClick={onAbrirAnalise}
                className="ml-auto bg-blue-600 text-white px-3 py-1 rounded"
            >
                Abrir Análise Geral
            </button>
        </div>
    );
}
