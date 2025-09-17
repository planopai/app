"use client";
import React from "react";
import { formataDataDia } from "./UtilDatas";

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
    rows: Array<{ key: string; item: string; tipo: string; quantidade: number }>;
    registrosComEventoNoPeriodo: number;
    listaTanatoPeriodo: Array<{ nome: string; data: string }>;
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

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white w-[90%] md:w-3/4 lg:w-2/3 rounded shadow-lg max-h-[90%] overflow-y-auto">
                <div className="flex justify-between items-center p-3 border-b">
                    <h2 className="font-bold">Análise Geral</h2>
                    <button onClick={onFechar} className="text-red-600">X</button>
                </div>

                {/* Filtros */}
                <div className="p-3 flex flex-wrap gap-2">
                    <input
                        type="date"
                        value={aDe}
                        onChange={(e) => setADe(e.target.value)}
                        className="border p-1 rounded"
                    />
                    <input
                        type="date"
                        value={aAte}
                        onChange={(e) => setAAte(e.target.value)}
                        className="border p-1 rounded"
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
                        className="bg-blue-600 text-white px-3 py-1 rounded"
                    >
                        Recarregar
                    </button>
                </div>

                <div className="p-3">
                    {loading ? (
                        <div>Carregando...</div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600 mb-2">
                                {registrosComEventoNoPeriodo} registros no período.
                            </p>

                            {/* Tabela de contagens */}
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm border">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="p-1 border">Item</th>
                                            <th className="p-1 border">Tipo</th>
                                            <th className="p-1 border">Qtd.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r) => (
                                            <tr
                                                key={r.key}
                                                className={`cursor-pointer ${selectedItem === r.key ? "bg-blue-100" : ""
                                                    }`}
                                                onClick={() =>
                                                    setSelectedItem(
                                                        selectedItem === r.key ? undefined : r.key
                                                    )
                                                }
                                            >
                                                <td className="p-1 border">{r.item}</td>
                                                <td className="p-1 border">{r.tipo}</td>
                                                <td className="p-1 border text-right">{r.quantidade}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Lista tanato */}
                            {selectedItem && (
                                <div className="mt-3">
                                    <h3 className="font-semibold">Eventos: {selectedItem}</h3>
                                    <ul className="list-disc ml-5">
                                        {listaTanatoPeriodo.map((r, idx) => (
                                            <li key={idx}>
                                                {r.nome} — {formataDataDia(r.data)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
