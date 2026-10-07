"use client";

import React from "react";
import type { DashboardMovimentoTipo } from "../tipos";
import { Button, Card, Field, Select, TextInput } from "../ui/Basicos";
import { FilterOptionPanel, FilterPanelModal } from "../ui/Filtros";
import type { EstoqueDados } from "../useEstoqueDados";
import type { Dashboard } from "./useDashboard";

export function AbaDashboard({ n, dash }: { n: EstoqueDados; dash: Dashboard }) {
    const { tab } = n;
    const { dashboardAte, dashboardBarWidth, dashboardCategorias, dashboardClassificacoes, dashboardDe, dashboardDepositos, dashboardErr, dashboardFabricantes, dashboardFilterOpen, dashboardFilterSectionOpen, dashboardFiltroOptions, dashboardFiltrosAtivos, dashboardLoading, dashboardPeriodoLabel, dashboardQ, dashboardResumo, dashboardTipo, dashboardTop, dashboardTopRows, limparFiltrosDashboard, loadDashboardMovimentos, setDashboardAte, setDashboardCategorias, setDashboardClassificacoes, setDashboardDe, setDashboardDepositos, setDashboardFabricantes, setDashboardFilterOpen, setDashboardFilterSectionOpen, setDashboardQ, setDashboardTipo, setDashboardTop } = dash;

    return (
        <>
            {/* DASHBOARD */}
            {tab === "DASHBOARD" ? (
                <div className="space-y-4">
                    <Card className="overflow-hidden">
                        <div className="p-4 sm:p-5">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap gap-2">
                                        <span className="inline-flex h-8 items-center rounded-full border border-[#E3E8F0] bg-[#F6F8FB] px-3 text-[12px] font-bold text-[#5B6478] dark:border-white/12 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                            Período: {dashboardPeriodoLabel}
                                        </span>
            
                                        <span className="inline-flex h-8 items-center rounded-full border border-[#E3E8F0] bg-[#F6F8FB] px-3 text-[12px] font-bold text-[#5B6478] dark:border-white/12 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                            {dashboardTipo === "SAIDA"
                                                ? "Somente saídas"
                                                : dashboardTipo === "TRANSFERENCIA"
                                                    ? "Somente transferências"
                                                    : "Saídas + transferências"}
                                        </span>
            
                                        {dashboardDepositos.length ? (
                                            <span className="inline-flex h-8 items-center rounded-full border border-[#E3E8F0] bg-[#F6F8FB] px-3 text-[12px] font-bold text-[#5B6478] dark:border-white/12 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                                {dashboardDepositos.length} depósito(s)
                                            </span>
                                        ) : null}
            
                                        {dashboardCategorias.length ? (
                                            <span className="inline-flex h-8 items-center rounded-full border border-[#E3E8F0] bg-[#F6F8FB] px-3 text-[12px] font-bold text-[#5B6478] dark:border-white/12 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                                {dashboardCategorias.length} categoria(s)
                                            </span>
                                        ) : null}
            
                                        {dashboardFabricantes.length ? (
                                            <span className="inline-flex h-8 items-center rounded-full border border-[#E3E8F0] bg-[#F6F8FB] px-3 text-[12px] font-bold text-[#5B6478] dark:border-white/12 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                                {dashboardFabricantes.length} fabricante(s)
                                            </span>
                                        ) : null}
            
                                        {dashboardClassificacoes.length ? (
                                            <span className="inline-flex h-8 items-center rounded-full border border-[#E3E8F0] bg-[#F6F8FB] px-3 text-[12px] font-bold text-[#5B6478] dark:border-white/12 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                                {dashboardClassificacoes.length} classificação(ões)
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
            
                                <div className="flex w-full gap-2 lg:w-auto lg:shrink-0">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setDashboardFilterOpen(true)}
                                        className="flex-1 whitespace-nowrap lg:flex-none"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                        </svg>
                                        Filtros
                                        {dashboardFiltrosAtivos > 0 ? (
                                            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#313C55] px-1.5 text-[12px] font-extrabold text-white dark:bg-[#3D6A99]">
                                                {dashboardFiltrosAtivos}
                                            </span>
                                        ) : null}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={loadDashboardMovimentos}
                                        disabled={dashboardLoading}
                                        className="flex-1 whitespace-nowrap lg:flex-none"
                                        aria-label="Atualizar dados"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={dashboardLoading ? "animate-spin" : ""}>
                                            <path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4" />
                                        </svg>
                                        {dashboardLoading ? "Atualizando…" : "Atualizar"}
                                    </Button>
                                </div>
                            </div>
            
                            {dashboardErr ? (
                                <div className="mt-4 rounded-2xl border border-[#B42318] dark:border-[#FF9C92] bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-3 text-sm font-bold text-[#B42318] dark:text-[#FF9C92]">
                                    {dashboardErr}
                                </div>
                            ) : null}
            
                            <div className="mt-4 text-xs leading-5 text-[#7A8396] dark:text-[#8893AA]">
                                A análise usa até as 500 saídas e 500 transferências
                                mais recentes disponibilizadas pelo histórico atual.
                            </div>
                        </div>
                    </Card>
            
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                        <Card className="p-4">
                            <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                                Produtos
                            </div>
                            <div className="mt-2 text-2xl font-black tracking-tight tabular-nums text-[#313C55] dark:text-white">
                                {dashboardResumo.produtos}
                            </div>
                            <div className="mt-1 text-xs text-[#7A8396] dark:text-[#8893AA]">
                                no filtro atual
                            </div>
                        </Card>
            
                        <Card className="p-4">
                            <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                                Movimentos
                            </div>
                            <div className="mt-2 text-2xl font-black tracking-tight tabular-nums text-[#313C55] dark:text-white">
                                {dashboardResumo.movimentos}
                            </div>
                            <div className="mt-1 text-xs text-[#7A8396] dark:text-[#8893AA]">
                                registros encontrados
                            </div>
                        </Card>
            
                        <Card className="p-4">
                            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                                <span className="h-2.5 w-2.5 rounded-full bg-[#3D6A99] dark:bg-[#A9BED6]" />
                                Saídas
                            </div>
                            <div className="mt-2 text-2xl font-black tracking-tight tabular-nums text-[#313C55] dark:text-white">
                                {dashboardResumo.saida.toLocaleString(
                                    "pt-BR"
                                )}
                            </div>
                            <div className="mt-1 text-xs text-[#7A8396] dark:text-[#8893AA]">
                                unidades
                            </div>
                        </Card>
            
                        <Card className="p-4">
                            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                                <span className="h-2.5 w-2.5 rounded-full bg-[#B3CE52]" />
                                Transferências
                            </div>
                            <div className="mt-2 text-2xl font-black tracking-tight tabular-nums text-[#313C55] dark:text-white">
                                {dashboardResumo.transferencia.toLocaleString(
                                    "pt-BR"
                                )}
                            </div>
                            <div className="mt-1 text-xs text-[#7A8396] dark:text-[#8893AA]">
                                unidades
                            </div>
                        </Card>
            
                        <Card className="col-span-2 p-4 lg:col-span-1">
                            <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                                Total movimentado
                            </div>
                            <div className="mt-2 text-2xl font-black tracking-tight tabular-nums text-[#313C55] dark:text-white">
                                {dashboardResumo.total.toLocaleString(
                                    "pt-BR"
                                )}
                            </div>
                            <div className="mt-1 text-xs text-[#7A8396] dark:text-[#8893AA]">
                                saída + transferência
                            </div>
                        </Card>
                    </div>
            
                    <Card className="overflow-hidden">
                        <div className="border-b border-[#E3E8F0] dark:border-white/12 p-4 sm:p-5">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="text-[15px] font-extrabold text-[#313C55] dark:text-white">
                                        Produtos que mais saíram
                                    </h3>
                                </div>
            
                                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                                    <span className="inline-flex items-center gap-2 text-[#5B6478] dark:text-[#AEB9CF]">
                                        <span className="h-2.5 w-2.5 rounded-full bg-[#3D6A99] dark:bg-[#A9BED6]" />
                                        Saída
                                    </span>
                                    <span className="inline-flex items-center gap-2 text-[#5B6478] dark:text-[#AEB9CF]">
                                        <span className="h-2.5 w-2.5 rounded-full bg-[#B3CE52]" />
                                        Transferência
                                    </span>
                                </div>
                            </div>
                        </div>
            
                        <div className="p-4 sm:p-5">
                            {dashboardLoading ? (
                                <div className="space-y-3">
                                    {Array.from({
                                        length: 6,
                                    }).map((_, idx) => (
                                        <div
                                            key={idx}
                                            className="animate-pulse rounded-2xl border border-[#E3E8F0] dark:border-white/12 p-4"
                                        >
                                            <div className="h-4 w-2/3 rounded bg-[#EEF2F7] dark:bg-white/8" />
                                            <div className="mt-4 h-2.5 rounded-full bg-[#EEF2F7] dark:bg-white/8" />
                                            <div className="mt-2 h-2.5 w-4/5 rounded-full bg-[#EEF2F7] dark:bg-white/8" />
                                        </div>
                                    ))}
                                </div>
                            ) : dashboardTopRows.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-[#E3E8F0] dark:border-white/12 bg-[#F6F8FB] dark:bg-[#1C2334] px-4 py-10 text-center">
                                    <div className="text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF]">
                                        Nenhuma movimentação encontrada
                                    </div>
                                    <p className="mt-1 text-xs leading-5 text-[#7A8396] dark:text-[#8893AA]">
                                        Altere o período ou os filtros para visualizar o ranking.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {dashboardTopRows.map(
                                        (row, index) => (
                                            <div
                                                key={
                                                    row.produto_id
                                                }
                                                className="rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F] p-3 shadow-sm sm:p-4"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#E9EFF6] text-xs font-black text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                                                        {index + 1}
                                                    </div>
            
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                            <div className="min-w-0">
                                                                <div className="break-words text-sm font-bold leading-5 text-[#313C55] dark:text-white sm:text-[15px]">
                                                                    {
                                                                        row.produto_nome
                                                                    }
                                                                </div>
                                                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#7A8396] dark:text-[#8893AA]">
                                                                    {row.codigo_barras ? (
                                                                        <span>
                                                                            CB{" "}
                                                                            {
                                                                                row.codigo_barras
                                                                            }
                                                                        </span>
                                                                    ) : null}
                                                                    <span>
                                                                        {
                                                                            row.categoria_nome
                                                                        }
                                                                    </span>
                                                                    <span>
                                                                        {
                                                                            row.classificacao_nome
                                                                        }
                                                                    </span>
                                                                    <span>
                                                                        {
                                                                            row.fabricante_nome
                                                                        }
                                                                    </span>
                                                                </div>
                                                            </div>
            
                                                            <div className="shrink-0 rounded-xl bg-[#F6F8FB] dark:bg-[#1C2334] px-3 py-2 text-right">
                                                                <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                                                                    Total
                                                                </div>
                                                                <div className="text-base font-black text-[#313C55] dark:text-white">
                                                                    {row.total.toLocaleString(
                                                                        "pt-BR"
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
            
                                                        <div className="mt-4 space-y-2.5">
                                                            <div className="grid grid-cols-[72px_minmax(0,1fr)_54px] items-center gap-2 sm:grid-cols-[105px_minmax(0,1fr)_72px]">
                                                                <span className="text-[11px] font-bold text-[#5B6478] dark:text-[#AEB9CF]">
                                                                    Saída
                                                                </span>
                                                                <div className="h-3 overflow-hidden rounded-full bg-[#EEF2F7] dark:bg-white/8">
                                                                    <div
                                                                        className="h-full rounded-full bg-[#3D6A99] dark:bg-[#A9BED6] transition-[width] duration-500"
                                                                        style={{
                                                                            width: `${dashboardBarWidth(
                                                                                row.saida
                                                                            )}%`,
                                                                        }}
                                                                    />
                                                                </div>
                                                                <span className="text-right text-xs font-bold text-[#313C55] dark:text-white">
                                                                    {row.saida.toLocaleString(
                                                                        "pt-BR"
                                                                    )}
                                                                </span>
                                                            </div>
            
                                                            <div className="grid grid-cols-[72px_minmax(0,1fr)_54px] items-center gap-2 sm:grid-cols-[105px_minmax(0,1fr)_72px]">
                                                                <span className="text-[11px] font-bold text-[#5B6478] dark:text-[#AEB9CF]">
                                                                    Transfer.
                                                                </span>
                                                                <div className="h-3 overflow-hidden rounded-full bg-[#EEF2F7] dark:bg-white/8">
                                                                    <div
                                                                        className="h-full rounded-full bg-[#B3CE52] transition-[width] duration-500"
                                                                        style={{
                                                                            width: `${dashboardBarWidth(
                                                                                row.transferencia
                                                                            )}%`,
                                                                        }}
                                                                    />
                                                                </div>
                                                                <span className="text-right text-xs font-bold text-[#313C55] dark:text-white">
                                                                    {row.transferencia.toLocaleString(
                                                                        "pt-BR"
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </div>
            
                                                        <div className="mt-3 text-[11px] text-[#7A8396] dark:text-[#8893AA]">
                                                            {
                                                                row.movimentos
                                                            }{" "}
                                                            {row.movimentos ===
                                                                1
                                                                ? "movimento"
                                                                : "movimentos"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>
                    <FilterPanelModal
                        open={dashboardFilterOpen}
                        onClose={() => {
                            setDashboardFilterOpen(false);
                            setDashboardFilterSectionOpen(null);
                        }}
                        title="Filtros"
                        panelClassName="lg:max-w-4xl"
                        footer={
                            <div className="flex gap-2 lg:justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={limparFiltrosDashboard}
                                    className="flex-1 lg:flex-none"
                                >
                                    Limpar filtros
                                </Button>
            
                                <Button
                                    type="button"
                                    onClick={() => {
                                        setDashboardFilterOpen(false);
                                        setDashboardFilterSectionOpen(null);
                                    }}
                                    className="flex-1 lg:flex-none"
                                >
                                    Aplicar filtros
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="md:col-span-2">
                                        <Field label="Pesquisar produto">
                                            <TextInput
                                                value={dashboardQ}
                                                onChange={(e) =>
                                                    setDashboardQ(e.target.value)
                                                }
                                                placeholder="Nome, código, categoria, fabricante ou classificação..."
                                            />
                                        </Field>
                                    </div>
            
                                    <Field label="Tipo de movimentação">
                                        <Select
                                            value={dashboardTipo}
                                            onChange={(e) =>
                                                setDashboardTipo(
                                                    e.target.value as DashboardMovimentoTipo
                                                )
                                            }
                                        >
                                            <option value="TODOS">
                                                Saídas + Transferências
                                            </option>
                                            <option value="SAIDA">
                                                Somente Saídas
                                            </option>
                                            <option value="TRANSFERENCIA">
                                                Somente Transferências
                                            </option>
                                        </Select>
                                    </Field>
            
                                    <Field label="Quantidade no ranking">
                                        <Select
                                            value={dashboardTop}
                                            onChange={(e) =>
                                                setDashboardTop(
                                                    Number(e.target.value) || 10
                                                )
                                            }
                                        >
                                            <option value={5}>Top 5</option>
                                            <option value={10}>Top 10</option>
                                            <option value={15}>Top 15</option>
                                            <option value={20}>Top 20</option>
                                            <option value={30}>Top 30</option>
                                        </Select>
                                    </Field>
            
                                    <Field label="Data inicial">
                                        <TextInput
                                            type="date"
                                            value={dashboardDe}
                                            onChange={(e) =>
                                                setDashboardDe(e.target.value)
                                            }
                                            max={dashboardAte || undefined}
                                        />
                                    </Field>
            
                                    <Field label="Data final">
                                        <TextInput
                                            type="date"
                                            value={dashboardAte}
                                            onChange={(e) =>
                                                setDashboardAte(e.target.value)
                                            }
                                            min={dashboardDe || undefined}
                                        />
                                    </Field>
                                </div>
            
                            <FilterOptionPanel
                                title="Depósitos de origem"
                                options={dashboardFiltroOptions.depositos}
                                selectedIds={dashboardDepositos}
                                onChangeIds={setDashboardDepositos}
                                allLabel="Todos os depósitos"
                                open={dashboardFilterSectionOpen === "DEPOSITOS"}
                                onToggle={() =>
                                    setDashboardFilterSectionOpen((current) =>
                                        current === "DEPOSITOS"
                                            ? null
                                            : "DEPOSITOS"
                                    )
                                }
                            />
            
                            <FilterOptionPanel
                                title="Categorias"
                                options={dashboardFiltroOptions.categorias}
                                selectedIds={dashboardCategorias}
                                onChangeIds={setDashboardCategorias}
                                allLabel="Todas as categorias"
                                open={dashboardFilterSectionOpen === "CATEGORIAS"}
                                onToggle={() =>
                                    setDashboardFilterSectionOpen((current) =>
                                        current === "CATEGORIAS"
                                            ? null
                                            : "CATEGORIAS"
                                    )
                                }
                            />
            
                            <FilterOptionPanel
                                title="Fabricantes"
                                options={dashboardFiltroOptions.fabricantes}
                                selectedIds={dashboardFabricantes}
                                onChangeIds={setDashboardFabricantes}
                                allLabel="Todos os fabricantes"
                                open={dashboardFilterSectionOpen === "FABRICANTES"}
                                onToggle={() =>
                                    setDashboardFilterSectionOpen((current) =>
                                        current === "FABRICANTES"
                                            ? null
                                            : "FABRICANTES"
                                    )
                                }
                            />
            
                            <FilterOptionPanel
                                title="Classificações"
                                options={dashboardFiltroOptions.classificacoes}
                                selectedIds={dashboardClassificacoes}
                                onChangeIds={setDashboardClassificacoes}
                                allLabel="Todas as classificações"
                                open={
                                    dashboardFilterSectionOpen ===
                                    "CLASSIFICACOES"
                                }
                                onToggle={() =>
                                    setDashboardFilterSectionOpen((current) =>
                                        current === "CLASSIFICACOES"
                                            ? null
                                            : "CLASSIFICACOES"
                                    )
                                }
                            />
            
                        </div>
                    </FilterPanelModal>
            
                </div>
            ) : null}
        </>
    );
}
