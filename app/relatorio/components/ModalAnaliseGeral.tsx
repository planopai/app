"use client";
import React, { Fragment } from "react";
import { formataDataDia } from "./UtilDatas";

interface Row {
    key: string;
    item: string;
    tipo: string;
    quantidade: number;
}

interface EventoTanato {
    nome: string;
    data: string;
}

interface Props {
    aberto: boolean;
    onFechar: () => void;
    aDe: string;
    aAte: string;
    setADe: (v: string) => void;
    setAAte: (v: string) => void;
    somenteTanato: boolean;
    setSomenteTanato: (v: boolean) => void;
    selectedItem?: string;
    setSelectedItem: (v?: string) => void;
    rows: Row[];
    registrosComEventoNoPeriodo: number;
    listaTanatoPeriodo: EventoTanato[];
    loading: boolean;
    onRecarregar: () => void;
}

export default function ModalAnaliseGeral({
    aberto,
    onFechar,
    aDe,
    aAte,
    setADe,
    setAAte,
    somenteTanato,
    setSomenteTanato,
    selectedItem,
    setSelectedItem,
    rows,
    registrosComEventoNoPeriodo,
    listaTanatoPeriodo,
    loading,
    onRecarregar,
}: Props) {
    if (!aberto) return null;

    const eventosSelecionados = selectedItem
        ? listaTanatoPeriodo.filter((ev) => ev.nome === selectedItem)
        : [];

    return (
        <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
            role="dialog"
            aria-modal="true"
            aria-label="Modal de Análise Geral"
        >
            <div className="bg-white w-[90%] md:w-3/4 lg:w-2/3 rounded shadow-lg max-h-[90%] overflow-y-auto">
                {/* Cabeçalho */}
                <div className="flex justify-between items-center p-3 border-b">
                    <h2 className="font-bold text-lg">Análise Geral</h2>
                    <button
                        onClick={onFechar}
                        className="text-red-600 font-bold text-xl"
                        aria-label="Fechar modal"
                    >
                        ×
                    </button>
                </div>

                {/* Filtros */}
                <div className="p-3 flex flex-wrap gap-2 items-center">
                    <input
                        type="date"
                        value={aDe}
                        onChange={(e) => setADe(e.target.value)}
                        className="border p-1 rounded"
                        aria-label="Data inicial"
                    />
                    <input
                        type="date"
                        value={aAte}
                        onChange={(e) => setAAte(e.target.value)}
                        className="border p-1 rounded"
                        aria-label="Data final"
                    />
                    <label className="flex items-center gap-1">
                        <input
                            type="checkbox"
                            checked={somenteTanato}
                            onChange={(e) => setSomenteTanato(e.target.checked)}
                        />
                        Apenas Tanatopraxia
                    </label>
                    <button
                        onClick={onRecarregar}
                        className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition"
                    >
                        Recarregar
                    </button>
                </div>

                {/* Conteúdo */}
                <div className="p-3">
                    {loading ? (
                        <div className="text-center text-gray-500">Carregando...</div>
                    ) : (
                        <Fragment>
                            <p className="text-sm text-gray-600 mb-2">
                                {registrosComEventoNoPeriodo} registros no período.
                            </p>

                            {/* Tabela */}
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm border">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="p-2 border text-left">Item</th>
                                            <th className="p-2 border text-left">Tipo</th>
                                            <th className="p-2 border text-right">Qtd.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r) => (
                                            <tr
                                                key={r.key}
                                                className={`cursor-pointer hover:bg-blue-50 transition ${selectedItem === r.key ? "bg-blue-100" : ""
                                                    }`}
                                                onClick={() =>
                                                    setSelectedItem(
                                                        selectedItem === r.key ? undefined : r.key
                                                    )
                                                }
                                                tabIndex={0}
                                                aria-label={`Selecionar item ${r.item}`}
                                            >
                                                <td className="p-2 border">{r.item}</td>
                                                <td className="p-2 border">{r.tipo}</td>
                                                <td className="p-2 border text-right">{r.quantidade}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Lista de eventos */}
                            {selectedItem && (
                                <div className="mt-4">
                                    <h3 className="font-semibold text-base mb-2">
                                        Eventos: {selectedItem}
                                    </h3>
                                    {eventosSelecionados.length > 0 ? (
                                        <ul className="list-disc ml-5 space-y-1">
                                            {eventosSelecionados.map((ev, idx) => (
                                                <li key={idx}>
                                                    {ev.nome} — {formataDataDia(ev.data)}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-sm text-gray-500">
                                            Nenhum evento encontrado para este item.
                                        </p>
                                    )}
                                </div>
                            )}
                        </Fragment>
                    )}
                </div>
            </div>
        </div>
    );
}
