"use client";
import React from "react";
import { FalecidoItem } from "./TiposHistorico";
import { formataDataHora } from "./UtilDatas";

interface Props {
    registros: FalecidoItem[];
    loading: boolean;
    pagina: number;
    totalPaginas: number;
    onPaginaAnterior: () => void;
    onPaginaProxima: () => void;
    selecionadoId?: string;
    onSelecionar: (item: FalecidoItem) => void;
    criacaoMap: Record<string, string>;
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
    criacaoMap,
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
                            <li
                                key={item.sepultamento_id}
                                className={`p-2 border-b cursor-pointer ${selecionadoId === item.sepultamento_id ? "bg-blue-100" : ""
                                    }`}
                                onClick={() => onSelecionar(item)}
                            >
                                <div className="font-medium">{item.falecido}</div>
                                <div className="text-xs text-gray-600">
                                    Criado em:{" "}
                                    {formataDataHora(criacaoMap[item.sepultamento_id])}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="flex justify-between items-center p-2 border-t bg-gray-50">
                <button
                    onClick={onPaginaAnterior}
                    disabled={pagina <= 1}
                    className="px-2 py-1 border rounded disabled:opacity-50"
                >
                    ← Anterior
                </button>
                <span className="text-sm">
                    Página {pagina} / {totalPaginas}
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
