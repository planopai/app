"use client";
import React from "react";
import { FalecidoItem } from "./TiposHistorico";

interface Props {
    registros: FalecidoItem[];
    loading: boolean;
    pagina: number;
    totalPaginas: number;
    onPaginaAnterior: () => void;
    onPaginaProxima: () => void;
    selecionadoId?: string;
    onSelecionar: (item: FalecidoItem) => void;
}

export default function ListaRegistros({
    registros,
    loading,
    pagina,
    totalPaginas,
    onPaginaAnterior,
    onPaginaProxima,
    selecionadoId,
    onSelecionar,
}: Props) {
    return (
        <div className="flex flex-col border rounded overflow-hidden h-full">
            <div className="bg-gray-100 p-2 font-semibold">Registros</div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-4 text-center">Carregando...</div>
                ) : registros.length === 0 ? (
                    <div className="p-4 text-center">Nenhum registro encontrado.</div>
                ) : (
                    <ul>
                        {registros.map((item) => (
                            <li key={item.sepultamento_id}>
                                <button
                                    type="button"
                                    className={`w-full text-left p-2 border-b hover:bg-muted/40 ${selecionadoId === item.sepultamento_id ? "bg-blue-50" : ""
                                        }`}
                                    onClick={() => onSelecionar(item)}
                                >
                                    <div className="font-medium">{item.falecido}</div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="flex justify-between items-center p-2 border-t bg-gray-50">
                <button onClick={onPaginaAnterior} disabled={pagina <= 1} className="px-2 py-1 border rounded disabled:opacity-50">
                    ← Anterior
                </button>
                <span className="text-sm">
                    Página {pagina} / {Math.max(1, totalPaginas)}
                </span>
                <button
                    onClick={onPaginaProxima}
                    disabled={pagina >= totalPaginas}
                    className="px-2 py-1 border rounded disabled:opacity-50"
                >
                    Próxima →
                </button>
            </div>
        </div>
    );
}
