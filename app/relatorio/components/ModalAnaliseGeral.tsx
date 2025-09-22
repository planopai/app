"use client";
import React from "react";
import { formataDataDia } from "./UtilDatas";

/* ========= Tipos ========= */
type Row = { key: string; item: string; tipo: string; quantidade: number };
type Evento = { nome: string; data: string; itemKey?: string };

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

/* ========= Helpers ========= */
const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);

const pct = (num: number, den: number) =>
    den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—";

/** Formata data com tolerância */
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

/* ========= Gráfico (SVG) – Top N ========= */
function BarChart({
    data,
    height = 260,
    barGap = 8,
    padding = 28,
}: {
    data: Array<{ label: string; value: number }>;
    height?: number;
    barGap?: number;
    padding?: number;
}) {
    // limita a 8 itens pra caber legal
    const items = data.slice(0, 8);
    const maxVal = Math.max(1, ...items.map((d) => d.value));
    const barW = 28;
    const width = padding * 2 + items.length * barW + (items.length - 1) * barGap;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Gráfico de barras - Top itens"
            className="w-full h-[260px]"
        >
            {/* eixo Y simples */}
            <line
                x1={padding - 6}
                y1={padding}
                x2={padding - 6}
                y2={height - padding}
                stroke="#e5e7eb"
            />
            {/* barras */}
            {items.map((d, i) => {
                const x = padding + i * (barW + barGap);
                const h = Math.max(2, ((height - padding * 2) * d.value) / maxVal);
                const y = height - padding - h;
                return (
                    <g key={d.label}>
                        <rect
                            x={x}
                            y={y}
                            width={barW}
                            height={h}
                            rx={6}
                            className="fill-blue-500 hover:opacity-80 transition-opacity"
                        />
                        {/* valor acima da barra */}
                        <text
                            x={x + barW / 2}
                            y={y - 6}
                            textAnchor="middle"
                            fontSize="10"
                            className="fill-gray-700"
                        >
                            {d.value}
                        </text>
                        {/* rótulo no eixo X */}
                        <text
                            x={x + barW / 2}
                            y={height - padding + 12}
                            textAnchor="middle"
                            fontSize="10"
                            className="fill-gray-600"
                        >
                            {d.label.length > 10 ? d.label.slice(0, 10) + "…" : d.label}
                        </text>
                    </g>
                );
            })}
            {/* ticks % (25/50/75/100) */}
            {[0.25, 0.5, 0.75, 1].map((t, idx) => {
                const y = height - padding - (height - padding * 2) * t;
                const val = Math.round(maxVal * t);
                return (
                    <g key={idx}>
                        <line
                            x1={padding - 6}
                            y1={y}
                            x2={width - padding}
                            y2={y}
                            stroke="#f3f4f6"
                        />
                        <text
                            x={padding - 10}
                            y={y + 3}
                            textAnchor="end"
                            fontSize="10"
                            className="fill-gray-500"
                        >
                            {val}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

/* ========= Componente ========= */
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

    // Linhas visíveis
    const linhasVisiveis = React.useMemo(() => {
        if (!Array.isArray(rows)) return [] as Row[];
        const base = rows;
        if (!somenteTanato) return base;
        return base.filter((r) => r.tipo?.toLowerCase().includes("tanato"));
    }, [rows, somenteTanato]);

    // Totais e agregações
    const { totalGeral, porTipo, topItens } = React.useMemo(() => {
        const total = linhasVisiveis.reduce((s, r) => s + r.quantidade, 0);
        const mapTipo = new Map<string, number>();
        const mapItem = new Map<string, number>();

        for (const r of linhasVisiveis) {
            mapTipo.set(r.tipo, (mapTipo.get(r.tipo) || 0) + r.quantidade);
            // top itens considera label composto por tipo:item para evitar colisão
            const label = `${r.tipo}: ${r.item}`;
            mapItem.set(label, (mapItem.get(label) || 0) + r.quantidade);
        }

        const arrTipo = Array.from(mapTipo, ([tipo, quantidade]) => ({
            tipo,
            quantidade,
        })).sort((a, b) => b.quantidade - a.quantidade);

        const arrTop = Array.from(mapItem, ([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12);

        return { totalGeral: total, porTipo: arrTipo, topItens: arrTop };
    }, [linhasVisiveis]);

    // Evento(s) do item selecionado
    const eventosSelecionados = React.useMemo<Evento[]>(() => {
        if (!selectedItem) return [];
        if (!Array.isArray(listaTanatoPeriodo)) return [];
        const possuiVinculo = listaTanatoPeriodo.some((e) => !!e.itemKey);
        if (possuiVinculo) {
            return listaTanatoPeriodo.filter((e) => e.itemKey === selectedItem);
        }
        // sem vínculo -> mostra todos do período
        return listaTanatoPeriodo;
    }, [selectedItem, listaTanatoPeriodo]);

    const handleLinhaClick = (k: string) => {
        setSelectedItem(selectedItem === k ? undefined : k);
    };

    // KPIs
    const itemMaisUsado = topItens[0]?.label ?? "—";
    const maiorTipo = porTipo[0]?.tipo ?? "—";
    const qtdMaiorTipo = porTipo[0]?.quantidade ?? 0;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white w-[96%] md:w-[90%] lg:w-[80%] rounded-2xl shadow-2xl max-h-[95%] overflow-y-auto">
                {/* Cabeçalho */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white/90 p-4 backdrop-blur">
                    <div>
                        <h2 className="text-lg font-bold leading-tight">Análise Geral</h2>
                        <p className="text-xs text-gray-500">
                            Período: {aDe || "—"} a {aAte || "—"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onRecarregar}
                            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                            Recarregar
                        </button>
                        <button
                            onClick={onFechar}
                            className="rounded-lg border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                        >
                            Fechar
                        </button>
                    </div>
                </div>

                {/* Filtros */}
                <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Data inicial</span>
                        <input
                            type="date"
                            value={aDe || ""}
                            onChange={(e) => setADe(e.target.value)}
                            className="rounded-md border px-3 py-2"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Data final</span>
                        <input
                            type="date"
                            value={aAte || ""}
                            onChange={(e) => setAAte(e.target.value)}
                            className="rounded-md border px-3 py-2"
                        />
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={!!somenteTanato}
                            onChange={(e) => setSomenteTanato(e.target.checked)}
                        />
                        <span className="text-sm">Apenas Tanatopraxia</span>
                    </label>
                    <div className="text-sm text-gray-500 self-center">
                        {registrosComEventoNoPeriodo} registro(s) encontrados
                    </div>
                </div>

                {/* Corpo */}
                <div className="p-4 pt-0">
                    {loading ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
                            Carregando análise…
                        </div>
                    ) : linhasVisiveis.length === 0 ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
                            Nenhum dado para o período/filtro selecionado.
                        </div>
                    ) : (
                        <>
                            {/* KPI Cards */}
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Total de usos (itens)</div>
                                    <div className="mt-1 text-2xl font-bold">{fmt(totalGeral)}</div>
                                    <div className="text-xs text-gray-500">
                                        em {linhasVisiveis.length} linha(s) agregadas
                                    </div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Tipo mais recorrente</div>
                                    <div className="mt-1 text-lg font-semibold">{maiorTipo}</div>
                                    <div className="text-xs text-gray-500">
                                        {fmt(qtdMaiorTipo)} ({pct(qtdMaiorTipo, totalGeral)})
                                    </div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Item mais usado</div>
                                    <div className="mt-1 text-lg font-semibold">
                                        {itemMaisUsado.replace(/^[^:]+:\s*/, "")}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        dentro do tipo {itemMaisUsado.split(":")[0] || "—"}
                                    </div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Registros (sepultamentos)</div>
                                    <div className="mt-1 text-2xl font-bold">
                                        {fmt(registrosComEventoNoPeriodo)}
                                    </div>
                                    <div className="text-xs text-gray-500">no período</div>
                                </div>
                            </div>

                            {/* Gráfico: Top Itens */}
                            <div className="rounded-2xl border overflow-hidden mb-4">
                                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                                    <div className="text-sm font-semibold">Top Itens no Período</div>
                                    <div className="text-xs text-gray-500">
                                        Mostrando até 8 itens
                                    </div>
                                </div>
                                <div className="p-2">
                                    <BarChart data={topItens} />
                                </div>
                            </div>

                            {/* Resumo por tipo */}
                            <div className="rounded-2xl border overflow-hidden mb-4">
                                <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">
                                    Resumo por Tipo
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 p-3">
                                    {porTipo.map((t) => (
                                        <div key={t.tipo} className="rounded-lg border p-3">
                                            <div className="text-sm font-semibold">{t.tipo}</div>
                                            <div className="text-xs text-gray-500">
                                                {fmt(t.quantidade)} ({pct(t.quantidade, totalGeral)})
                                            </div>
                                            {/* mini barra de progresso */}
                                            <div className="mt-2 h-2 rounded bg-gray-100">
                                                <div
                                                    className="h-2 rounded bg-blue-500"
                                                    style={{
                                                        width:
                                                            totalGeral > 0
                                                                ? `${(t.quantidade / totalGeral) * 100}%`
                                                                : "0%",
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Tabela detalhada */}
                            <div className="rounded-2xl border overflow-hidden">
                                <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">
                                    Detalhamento por Item
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="p-2 border text-left">Item</th>
                                                <th className="p-2 border text-left">Tipo</th>
                                                <th className="p-2 border text-right">Qtd.</th>
                                                <th className="p-2 border text-right">% do total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {linhasVisiveis.map((r) => (
                                                <tr
                                                    key={r.key}
                                                    className={`cursor-pointer hover:bg-blue-50 ${selectedItem === r.key ? "bg-blue-100" : ""
                                                        }`}
                                                    onClick={() => handleLinhaClick(r.key)}
                                                    role="button"
                                                    tabIndex={0}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ")
                                                            handleLinhaClick(r.key);
                                                    }}
                                                >
                                                    <td className="p-2 border">{r.item}</td>
                                                    <td className="p-2 border">{r.tipo}</td>
                                                    <td className="p-2 border text-right">{fmt(r.quantidade)}</td>
                                                    <td className="p-2 border text-right">
                                                        {pct(r.quantidade, totalGeral)}
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* totalizador */}
                                            <tr className="bg-gray-50 font-semibold">
                                                <td className="p-2 border" colSpan={2}>
                                                    Total
                                                </td>
                                                <td className="p-2 border text-right">
                                                    {fmt(totalGeral)}
                                                </td>
                                                <td className="p-2 border text-right">100%</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Eventos do item selecionado */}
                            {selectedItem && (
                                <div className="rounded-2xl border overflow-hidden mt-4">
                                    <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">
                                        Eventos — {selectedItem}
                                    </div>
                                    <div className="p-4">
                                        {eventosSelecionados.length === 0 ? (
                                            <div className="text-sm text-gray-600">
                                                Nenhum evento para este item/período.
                                                {!listaTanatoPeriodo.some((e) => e.itemKey) &&
                                                    listaTanatoPeriodo.length > 0 && (
                                                        <span className="block mt-1">
                                                            Observação: os eventos recebidos não possuem vínculo com
                                                            as linhas (<code>itemKey</code>). Inclua esse campo em{" "}
                                                            <em>listaTanatoPeriodo</em> para filtrar por item.
                                                        </span>
                                                    )}
                                            </div>
                                        ) : (
                                            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                {eventosSelecionados.map((ev, idx) => (
                                                    <li
                                                        key={`${ev.nome}-${ev.data}-${idx}`}
                                                        className="rounded-md border p-2"
                                                    >
                                                        <div className="text-sm font-medium truncate">
                                                            {ev.nome}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {safeFormatDate(ev.data)}
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
