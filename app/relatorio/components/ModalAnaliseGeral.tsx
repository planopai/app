"use client";
import React from "react";
import { formataDataDia } from "./UtilDatas";

type Row = { key: string; item: string; tipo: string; quantidade: number };
type Evento = { nome: string; data: string; itemKey?: string }; // <- opcional, usado p/ filtrar por item

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

    listaTanatoPeriodo: Evento[];
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
    rows = [],
    registrosComEventoNoPeriodo = 0,
    listaTanatoPeriodo = [],
    loading,
    onRecarregar,
}: Props) {
    if (!aberto) return null;

    // Reset da seleção ao trocar filtros
    React.useEffect(() => {
        setSelectedItem(undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aDe, aAte, somenteTanato]);

    // Filtra linhas visíveis (exemplo: apenas as com "tanato" no tipo)
    const linhasVisiveis = React.useMemo<Row[]>(() => {
        if (!Array.isArray(rows)) return [];
        if (!somenteTanato) return rows;
        return rows.filter((r) => r.tipo?.toLowerCase().includes("tanato"));
    }, [rows, somenteTanato]);

    // Eventos do item selecionado
    const eventosSelecionados = React.useMemo<Evento[]>(() => {
        if (!selectedItem) return [];
        if (!Array.isArray(listaTanatoPeriodo)) return [];

        // Se existir itemKey nos eventos, filtra por ela:
        const possuiVinculo = listaTanatoPeriodo.some((e) => !!e.itemKey);
        if (possuiVinculo) {
            return listaTanatoPeriodo.filter((e) => e.itemKey === selectedItem);
        }

        // Sem itemKey: fallback mostra todos os eventos do período
        return listaTanatoPeriodo;
    }, [selectedItem, listaTanatoPeriodo]);

    const handleLinhaClick = (k: string) => {
        setSelectedItem(selectedItem === k ? undefined : k);
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white w-[90%] md:w-3/4 lg:w-2/3 rounded shadow-lg max-h-[90%] overflow-y-auto">
                {/* Cabeçalho */}
                <div className="flex justify-between items-center p-3 border-b">
                    <h2 className="font-bold">Análise Geral</h2>
                    <button
                        onClick={onFechar}
                        className="text-red-600 font-semibold"
                        aria-label="Fechar"
                    >
                        X
                    </button>
                </div>

                {/* Filtros */}
                <div className="p-3 flex flex-wrap gap-2 items-center">
                    <input
                        type="date"
                        value={aDe || ""}
                        onChange={(e) => setADe(e.target.value)}
                        className="border p-1 rounded"
                    />
                    <input
                        type="date"
                        value={aAte || ""}
                        onChange={(e) => setAAte(e.target.value)}
                        className="border p-1 rounded"
                    />
                    <label className="flex items-center gap-1 select-none">
                        <input
                            type="checkbox"
                            checked={!!somenteTanato}
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

                {/* Corpo */}
                <div className="p-3">
                    {loading ? (
                        <div>Carregando...</div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600 mb-2">
                                {registrosComEventoNoPeriodo ?? 0} registro(s) no período.
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
                                        {linhasVisiveis.length === 0 ? (
                                            <tr>
                                                <td className="p-3 text-center text-gray-500" colSpan={3}>
                                                    Nenhum dado para o período/filtro selecionado.
                                                </td>
                                            </tr>
                                        ) : (
                                            linhasVisiveis.map((r) => (
                                                <tr
                                                    key={r.key}
                                                    className={`cursor-pointer hover:bg-blue-50 ${selectedItem === r.key ? "bg-blue-100" : ""
                                                        }`}
                                                    onClick={() => handleLinhaClick(r.key)}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") handleLinhaClick(r.key);
                                                    }}
                                                >
                                                    <td className="p-2 border">{r.item}</td>
                                                    <td className="p-2 border">{r.tipo}</td>
                                                    <td className="p-2 border text-right">{r.quantidade}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Lista de eventos */}
                            {selectedItem && (
                                <div className="mt-4">
                                    <h3 className="font-semibold mb-2">Eventos — {selectedItem}</h3>

                                    {eventosSelecionados.length === 0 ? (
                                        <div className="text-sm text-gray-600">
                                            Nenhum evento para este item/período.
                                            {!listaTanatoPeriodo.some((e) => e.itemKey) &&
                                                listaTanatoPeriodo.length > 0 && (
                                                    <span className="block mt-1">
                                                        Observação: os eventos recebidos não possuem vínculo com as
                                                        linhas (<code>itemKey</code>). Inclua esse campo em{" "}
                                                        <em>listaTanatoPeriodo</em> para filtrar por item.
                                                    </span>
                                                )}
                                        </div>
                                    ) : (
                                        <ul className="list-disc ml-5">
                                            {eventosSelecionados.map((ev, idx) => (
                                                <li key={`${ev.nome}-${ev.data}-${idx}`}>
                                                    {ev.nome} — {safeFormatDate(ev.data)}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Formata data com tolerância (evita TS2769 e quebras com valores inválidos) */
function safeFormatDate(value: string | null | undefined): string {
    if (!value) return "-";
    try {
        return formataDataDia(value);
    } catch {
        const v = String(value);
        const d = new Date(v);
        return isNaN(d.getTime()) ? v : d.toLocaleDateString();
    }
}
