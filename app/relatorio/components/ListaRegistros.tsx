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
        <div className="flex flex-col border rounded overflow-hidden w-full">
            <div className="bg-gray-100 p-3 font-semibold">Registros</div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-4 text-center">Carregando...</div>
                ) : registros.length === 0 ? (
                    <div className="p-4 text-center">Nenhum registro encontrado.</div>
                ) : (
                    <ul>
                        {registros.map((item) => {
                            const id = String(item.sepultamento_id);
                            const criadoEm = criacaoMap[id];
                            return (
                                <li key={id}>
                                    <button
                                        type="button"
                                        className={`w-full p-3 border-b hover:bg-muted/40 ${selecionadoId === id ? "bg-blue-50" : ""
                                            }`}
                                        onClick={() => onSelecionar(item)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="font-medium flex-1 truncate">{item.falecido}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {criadoEm ? formataDataHora(criadoEm) : "—"}
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
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
