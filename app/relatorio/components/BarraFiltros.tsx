"use client";

import React, { useEffect, useState } from "react";
import {
    IconFilter,
    IconCalendar,
    IconUser,
    IconChartBar,
    IconX,
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
 * Barra de Filtros
 *
 * Desktop:
 * - mantém nome + datas visíveis;
 * - mantém o botão "Análise Geral" no cabeçalho.
 *
 * Mobile:
 * - mostra somente a busca por nome;
 * - mostra um botão de filtro no canto direito;
 * - datas ficam dentro de um bottom sheet/modal;
 * - "Análise Geral" fica dentro do mesmo painel para não poluir a tela;
 * - o ícone de filtro mostra indicador quando há datas aplicadas.
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
    const [filtrosMobileOpen, setFiltrosMobileOpen] = useState(false);
    const [draftDe, setDraftDe] = useState(filtroDe);
    const [draftAte, setDraftAte] = useState(filtroAte);

    const temFiltroData = Boolean(filtroDe || filtroAte);

    useEffect(() => {
        if (!filtrosMobileOpen) return;

        setDraftDe(filtroDe);
        setDraftAte(filtroAte);
    }, [filtrosMobileOpen, filtroDe, filtroAte]);

    useEffect(() => {
        if (!filtrosMobileOpen) return;

        const body = document.body;
        const html = document.documentElement;

        const oldBodyOverflow = body.style.overflow;
        const oldHtmlOverflow = html.style.overflow;

        body.style.overflow = "hidden";
        html.style.overflow = "hidden";

        return () => {
            body.style.overflow = oldBodyOverflow;
            html.style.overflow = oldHtmlOverflow;
        };
    }, [filtrosMobileOpen]);

    function aplicarFiltrosMobile() {
        onChangeDe(draftDe);
        onChangeAte(draftAte);
        setFiltrosMobileOpen(false);
    }

    function limparFiltrosMobile() {
        setDraftDe("");
        setDraftAte("");
        onChangeDe("");
        onChangeAte("");
        setFiltrosMobileOpen(false);
    }

    return (
        <>
            <div className="rounded-2xl border bg-card/60 p-3 shadow-sm backdrop-blur sm:p-5">
                {/* =========================
                    MOBILE
                   ========================= */}
                <div className="sm:hidden">
                    <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => e.preventDefault()}
                    >
                        <label className="min-w-0 flex-1">
                            <span className="sr-only">
                                Nome do falecido
                            </span>

                            <div className="relative">
                                <IconUser className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                                <input
                                    type="text"
                                    value={filtroNome}
                                    onChange={(e) =>
                                        onChangeNome(e.target.value)
                                    }
                                    placeholder="Buscar por nome..."
                                    className="input h-11 w-full rounded-xl pl-10 pr-3 text-base"
                                    autoComplete="off"
                                />
                            </div>
                        </label>

                        <button
                            type="button"
                            onClick={() =>
                                setFiltrosMobileOpen(true)
                            }
                            className={[
                                "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition",
                                temFiltroData
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "bg-background text-foreground hover:bg-muted/50",
                            ].join(" ")}
                            title="Filtros"
                            aria-label="Abrir filtros"
                        >
                            <IconFilter className="size-5" />

                            {temFiltroData ? (
                                <span
                                    className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-slate-900"
                                    aria-hidden="true"
                                />
                            ) : null}
                        </button>
                    </form>
                </div>

                {/* =========================
                    DESKTOP / TABLET
                   ========================= */}
                <div className="hidden sm:block">
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

                    <form
                        className="grid gap-3 sm:grid-cols-3"
                        onSubmit={(e) => e.preventDefault()}
                    >
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                                Nome do falecido
                            </span>

                            <div className="relative">
                                <IconUser className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />

                                <input
                                    type="text"
                                    value={filtroNome}
                                    onChange={(e) =>
                                        onChangeNome(e.target.value)
                                    }
                                    placeholder="Buscar por nome..."
                                    className="input w-full pl-10"
                                    autoComplete="off"
                                />
                            </div>
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                                Data inicial
                            </span>

                            <div className="relative">
                                <IconCalendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />

                                <input
                                    type="date"
                                    value={filtroDe}
                                    onChange={(e) =>
                                        onChangeDe(e.target.value)
                                    }
                                    className="input w-full pl-10"
                                />
                            </div>
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                                Data final
                            </span>

                            <div className="relative">
                                <IconCalendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />

                                <input
                                    type="date"
                                    value={filtroAte}
                                    onChange={(e) =>
                                        onChangeAte(e.target.value)
                                    }
                                    className="input w-full pl-10"
                                />
                            </div>
                        </label>
                    </form>
                </div>
            </div>

            {/* =========================
                MODAL / BOTTOM SHEET MOBILE
               ========================= */}
            {filtrosMobileOpen ? (
                <div
                    className="fixed inset-0 z-[100] flex items-end bg-black/45 sm:hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Filtros do relatório"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setFiltrosMobileOpen(false);
                        }
                    }}
                >
                    <div
                        className="w-full rounded-t-3xl border-x border-t bg-background shadow-2xl"
                        style={{
                            maxHeight: "min(86dvh, 620px)",
                        }}
                    >
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div className="flex items-center gap-2">
                                <IconFilter className="size-5 text-muted-foreground" />

                                <div>
                                    <h3 className="text-sm font-semibold">
                                        Filtros
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Filtre os registros por período.
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setFiltrosMobileOpen(false)
                                }
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border hover:bg-muted/50"
                                aria-label="Fechar filtros"
                                title="Fechar"
                            >
                                <IconX className="size-5" />
                            </button>
                        </div>

                        <div
                            className="overflow-y-auto p-4"
                            style={{
                                WebkitOverflowScrolling: "touch",
                                overscrollBehaviorY: "contain",
                            }}
                        >
                            <div className="space-y-4">
                                <label className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        Data inicial
                                    </span>

                                    <div className="relative">
                                        <IconCalendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                                        <input
                                            type="date"
                                            value={draftDe}
                                            onChange={(e) =>
                                                setDraftDe(
                                                    e.target.value,
                                                )
                                            }
                                            className="input h-11 w-full rounded-xl pl-10 text-base"
                                        />
                                    </div>
                                </label>

                                <label className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        Data final
                                    </span>

                                    <div className="relative">
                                        <IconCalendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                                        <input
                                            type="date"
                                            value={draftAte}
                                            onChange={(e) =>
                                                setDraftAte(
                                                    e.target.value,
                                                )
                                            }
                                            className="input h-11 w-full rounded-xl pl-10 text-base"
                                        />
                                    </div>
                                </label>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setFiltrosMobileOpen(false);
                                        onAbrirAnalise();
                                    }}
                                    className="flex w-full items-center justify-between rounded-xl border bg-muted/20 px-4 py-3 text-left"
                                >
                                    <span>
                                        <span className="block text-sm font-semibold">
                                            Análise Geral
                                        </span>
                                        <span className="mt-0.5 block text-xs text-muted-foreground">
                                            Abrir indicadores e análise dos
                                            atendimentos.
                                        </span>
                                    </span>

                                    <IconChartBar className="size-5 shrink-0 text-muted-foreground" />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                            <button
                                type="button"
                                onClick={limparFiltrosMobile}
                                className="rounded-xl border px-4 py-3 text-sm font-semibold hover:bg-muted/50"
                            >
                                Limpar
                            </button>

                            <button
                                type="button"
                                onClick={aplicarFiltrosMobile}
                                className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                            >
                                Aplicar
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
