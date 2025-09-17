"use client";

import React from "react";
import {
    IconFilter,
    IconCalendar,
    IconUser,
    IconChartBar,
} from "@tabler/icons-react";

interface Props {
    filtroNome: string;
    filtroDe: string;
    filtroAte: string;
    onChangeNome: (v: string) => void;
    onChangeDe: (v: string) => void;
    onChangeAte: (v: string) => void;
    onAbrirAnalise: () => void;
}

/**
 * Barra de Filtros — versão compatível com o visual do código grande
 * - Mantém os mesmos handlers do pai
 * - O pai deve cuidar de resetar a paginação (setPagina(1)) ao alterar filtros
 */
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
        <div className="rounded-2xl border bg-card/60 p-4 sm:p-5 shadow-sm backdrop-blur">
            {/* Cabeçalho */}
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <IconFilter className="size-4 text-muted-foreground" />
                    Filtros
                </div>

                <button
                    type="button"
                    onClick={onAbrirAnalise}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted/50"
                    title="Análise Geral"
                >
                    <IconChartBar className="size-4" />
                    Análise Geral
                </button>
            </div>

            {/* Form */}
            <form
                className="grid gap-3 sm:grid-cols-3"
                onSubmit={(e) => e.preventDefault()}
            >
                {/* Nome */}
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Nome do falecido</span>
                    <div className="relative">
                        <IconUser className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                        <input
                            type="text"
                            value={filtroNome}
                            onChange={(e) => onChangeNome(e.target.value)}
                            placeholder="Buscar por nome..."
                            className="input pl-10"
                        />
                    </div>
                </label>

                {/* Data inicial */}
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Data inicial</span>
                    <div className="relative">
                        <IconCalendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                        <input
                            type="date"
                            value={filtroDe}
                            onChange={(e) => onChangeDe(e.target.value)}
                            className="input pl-10"
                        />
                    </div>
                </label>

                {/* Data final */}
                <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Data final</span>
                    <div className="relative">
                        <IconCalendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                        <input
                            type="date"
                            value={filtroAte}
                            onChange={(e) => onChangeAte(e.target.value)}
                            className="input pl-10"
                        />
                    </div>
                </label>
            </form>
        </div>
    );
}
