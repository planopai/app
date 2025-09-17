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
        <div className="rounded-2xl border bg-card/60 shadow-sm backdrop-blur h-full flex flex-col">
            {/* Cabeçalho */}
            <div className="border-b p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    Registros
                </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-2">
                {loading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
                ) : registros.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</div>
                ) : (
                    <ul className="flex flex-col">
                        {registros.map((item) => {
                            const id = String(item.sepultamento_id);
                            const criacao = criacaoMap[id]; // pode não existir ainda (prefetch)
                            const selecionado = selecionadoId === item.sepultamento_id;

                            return (
                                <li key={item.sepultamento_id} className="mb-2 last:mb-0">
                                    <button
                                        type="button"
                                        onClick={() => onSelecionar(item)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                onSelecionar(item);
                                            }
                                        }}
                                        className={[
                                            "group flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition",
                                            "hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40",
                                            selecionado ? "border-primary/60 bg-primary/5" : "",
                                        ].join(" ")}
                                        aria-pressed={selecionado}
                                    >
                                        <span className="font-medium">{item.falecido}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {criacao ? formataDataHora(criacao) : "—"}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Paginação */}
            <div className="flex items-center justify-between gap-2 p-2 border-t bg-gray-50/60">
                <button
                    onClick={onPaginaAnterior}
                    disabled={pagina <= 1}
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
                >
                    ← Anterior
                </button>
                <span className="text-xs text-muted-foreground">
                    Página <b>{pagina}</b> de <b>{totalPaginas}</b>
                </span>
                <button
                    onClick={onPaginaProxima}
                    disabled={pagina >= totalPaginas}
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
                >
                    Próxima →
                </button>
            </div>
        </div>
    );
}
