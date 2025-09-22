"use client";
import React from "react";
import { formataDataDia } from "./UtilDatas";

/* ===== Tipos recebidos do container ===== */
type Row = { key: string; item: string; tipo: string; quantidade: number };
type Evento = { nome: string; data: string; itemKey?: string };

/* ===== Props ===== */
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

    /** Para tanato: idealmente com itemKey = "tanato|Sim" */
    listaTanatoPeriodo: Evento[];

    loading: boolean;
    onRecarregar: () => void;
}

/* ===== Helpers ===== */
const fmt0 = (n: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);

const pct1 = (num: number, den: number) =>
    den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—";

function safeFormatDate(value?: string | null): string {
    if (!value) return "-";
    try {
        return formataDataDia(value);
    } catch {
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d.toLocaleDateString();
    }
}

function isYes(v: string) {
    const s = (v || "").trim().toLowerCase();
    return s === "sim" || s === "yes" || s === "true" || s === "1";
}

/* ===== Gráfico (SVG) – mais espaçado e legível ===== */
function BarChart({
    data,
    height = 320,
    padding = 40,
    barW = 30,
    gap = 18,
    yTicks = 4,
    title,
}: {
    data: Array<{ label: string; value: number }>;
    height?: number;
    padding?: number;
    barW?: number;
    gap?: number;
    yTicks?: number;
    title?: string;
}) {
    const items = data.slice(0, 10); // até 10 barras
    const maxVal = Math.max(1, ...items.map((d) => d.value));
    const width = padding * 2 + (items.length * barW) + ((items.length - 1) * gap);

    return (
        <div className="w-full">
            {title && (
                <div className="px-4 pt-4 text-sm font-semibold text-gray-700">{title}</div>
            )}
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[320px]">
                {/* grade Y */}
                {Array.from({ length: yTicks }, (_, i) => i + 1).map((tick) => {
                    const t = tick / yTicks;
                    const y = height - padding - (height - padding * 2) * t;
                    const val = Math.round(maxVal * t);
                    return (
                        <g key={tick}>
                            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#eef2f7" />
                            <text x={padding - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#6b7280">
                                {val}
                            </text>
                        </g>
                    );
                })}
                {/* eixo Y */}
                <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" />
                {/* barras */}
                {items.map((d, i) => {
                    const x = padding + i * (barW + gap);
                    const h = Math.max(2, ((height - padding * 2) * d.value) / maxVal);
                    const y = height - padding - h;
                    return (
                        <g key={d.label}>
                            <rect
                                x={x}
                                y={y}
                                width={barW}
                                height={h}
                                rx={8}
                                className="fill-blue-500/90 hover:fill-blue-500 transition-colors"
                            />
                            <text
                                x={x + barW / 2}
                                y={y - 6}
                                textAnchor="middle"
                                fontSize="11"
                                fill="#374151"
                            >
                                {d.value}
                            </text>
                            {/* rótulo (quebra simples) */}
                            <text
                                x={x + barW / 2}
                                y={height - padding + 12}
                                textAnchor="middle"
                                fontSize="10"
                                fill="#6b7280"
                            >
                                {d.label.length > 16 ? d.label.slice(0, 16) + "…" : d.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

/* ===== Componente ===== */
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

    // Zera seleção quando filtros mudam
    React.useEffect(() => {
        setSelectedItem(undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aDe, aAte, somenteTanato]);

    // 1) Separa TANATO (conta apenas "Sim") e ITENS (tudo que não é Tanatopraxia)
    const {
        itensRows,
        totalItensUsados,
        tanatoCount,
        tipoTotais,
        topItens,
    } = React.useMemo(() => {
        const itens: Row[] = [];
        let tanatos = 0;
        const porTipo = new Map<string, number>();
        const mapTop = new Map<string, number>();

        for (const r of rows || []) {
            const isTanato = (r.tipo || "").toLowerCase().includes("tanato");
            if (isTanato) {
                // NUNCA listar "Tanato Sim/Não" como item; só somar as que forem "Sim"
                if (isYes(r.item)) tanatos += r.quantidade || 0;
                continue;
            }
            // demais itens (urna, ornamentação, assistência etc.)
            itens.push(r);
            porTipo.set(r.tipo, (porTipo.get(r.tipo) || 0) + (r.quantidade || 0));
            const label = `${r.tipo}: ${r.item}`; // evita colisão de nomes entre tipos
            mapTop.set(label, (mapTop.get(label) || 0) + (r.quantidade || 0));
        }

        const totalItens = itens.reduce((s, r) => s + (r.quantidade || 0), 0);

        const arrTipo = Array.from(porTipo, ([tipo, quantidade]) => ({
            tipo,
            quantidade,
        })).sort((a, b) => b.quantidade - a.quantidade);

        const arrTop = Array.from(mapTop, ([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

        return {
            itensRows: itens,
            totalItensUsados: totalItens,
            tanatoCount: tanatos,
            tipoTotais: arrTipo,
            topItens: arrTop,
        };
    }, [rows]);

    // Filtragem "Apenas tanatopraxia" agora só afeta os KPIs/tabela de itens (mantemos tanatoCount à parte)
    const linhasVisiveis = React.useMemo<Row[]>(() => {
        if (!Array.isArray(itensRows)) return [];
        return somenteTanato ? [] : itensRows;
    }, [itensRows, somenteTanato]);

    const totalGeralTabela = linhasVisiveis.reduce((s, r) => s + (r.quantidade || 0), 0);

    // Eventos do item selecionado (no momento, o container envia só para Tanato)
    const eventosSelecionados = React.useMemo(() => {
        if (!selectedItem) return [];
        // tentamos filtrar por itemKey quando disponível
        const possuiVinculo = Array.isArray(listaTanatoPeriodo) && listaTanatoPeriodo.some((e) => !!e.itemKey);
        if (possuiVinculo) {
            return listaTanatoPeriodo.filter((e) => e.itemKey === selectedItem);
        }
        return [];
    }, [selectedItem, listaTanatoPeriodo]);

    const handleLinhaClick = (k: string) => {
        setSelectedItem(selectedItem === k ? undefined : k);
    };

    /* ===== UI ===== */
    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white w-[96%] md:w-[92%] lg:w-[84%] rounded-2xl shadow-2xl max-h-[95%] overflow-y-auto">
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
                <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                        <span className="text-sm">Ocultar tabela de itens</span>
                    </label>
                    <div className="text-sm text-gray-500 self-center">
                        {registrosComEventoNoPeriodo} registro(s) no período
                    </div>
                </div>

                {/* Corpo */}
                <div className="p-4 pt-0">
                    {loading ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
                            Carregando análise…
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-gray-500">
                            Nenhum dado para o período/filtro selecionado.
                        </div>
                    ) : (
                        <>
                            {/* KPIs – separados e sem “Local do Velório” */}
                            <div className="grid gap-4 lg:grid-cols-3 mb-6">
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Itens usados no período</div>
                                    <div className="mt-1 text-3xl font-bold">{fmt0(totalItensUsados)}</div>
                                    <div className="text-xs text-gray-500">Soma de todos os itens (sem Tanato)</div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Tanatopraxias realizadas</div>
                                    <div className="mt-1 text-3xl font-bold">{fmt0(tanatoCount)}</div>
                                    <div className="text-xs text-gray-500">
                                        Contagem de “Sim” (1 por registro)
                                    </div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Tipos mais usados (itens)</div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {tipoTotais.slice(0, 3).map((t) => (
                                            <span
                                                key={t.tipo}
                                                className="rounded-full border px-2 py-0.5 text-xs"
                                                title={`${t.tipo}: ${fmt0(t.quantidade)} (${pct1(t.quantidade, totalItensUsados)})`}
                                            >
                                                {t.tipo} — {pct1(t.quantidade, totalItensUsados)}
                                            </span>
                                        ))}
                                        {tipoTotais.length === 0 && (
                                            <span className="text-xs text-gray-500">—</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* GRÁFICO EM CARTÃO PRÓPRIO (bem separado e espaçado) */}
                            <div className="rounded-2xl border overflow-hidden mb-6">
                                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                                    <div className="text-sm font-semibold">Top itens do período (sem Tanato)</div>
                                    <div className="text-xs text-gray-500">máx. 10 itens</div>
                                </div>
                                <div className="p-2 md:p-4">
                                    <BarChart
                                        data={topItens}            // já excluído tanato
                                        height={340}
                                        padding={48}
                                        barW={32}
                                        gap={24}                   // barras mais separadas
                                        yTicks={5}
                                    />
                                </div>
                            </div>

                            {/* TABELA DE ITENS (sem Tanato) */}
                            {!somenteTanato && (
                                <div className="rounded-2xl border overflow-hidden mb-6">
                                    <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">
                                        Detalhamento por item (sem Tanatopraxia)
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
                                                        <td className="p-2 border text-right">{fmt0(r.quantidade)}</td>
                                                        <td className="p-2 border text-right">
                                                            {pct1(r.quantidade, totalGeralTabela)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-gray-50 font-semibold">
                                                    <td className="p-2 border" colSpan={2}>
                                                        Total (itens)
                                                    </td>
                                                    <td className="p-2 border text-right">{fmt0(totalGeralTabela)}</td>
                                                    <td className="p-2 border text-right">100%</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* LISTA DE TANATO — nomes dos falecidos (se o container enviar) */}
                            <div className="rounded-2xl border overflow-hidden">
                                <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">
                                    Tanatopraxias no período — {fmt0(tanatoCount)}
                                </div>
                                <div className="p-4">
                                    {listaTanatoPeriodo.length === 0 ? (
                                        <div className="text-sm text-gray-600">
                                            Sem eventos de tanatopraxia para o período selecionado.
                                        </div>
                                    ) : (
                                        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                            {listaTanatoPeriodo.map((ev, idx) => (
                                                <li key={`${ev.nome}-${ev.data}-${idx}`} className="rounded-md border p-2">
                                                    <div className="text-sm font-medium truncate">{ev.nome}</div>
                                                    <div className="text-xs text-gray-500">{safeFormatDate(ev.data)}</div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            {/* (Opcional) Área de eventos do item selecionado
                  — hoje seu container só popula para Tanato.
                  Mantive para quando você expandir e enviar itemKey dos outros itens. */}
                            {selectedItem && (
                                <div className="rounded-2xl border overflow-hidden mt-6">
                                    <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">
                                        Eventos — {selectedItem}
                                    </div>
                                    <div className="p-4">
                                        {eventosSelecionados.length === 0 ? (
                                            <div className="text-sm text-gray-600">
                                                Sem eventos vinculados a este item (o backend ainda não envia a
                                                lista por item). Os nomes acima listam somente tanatopraxias.
                                            </div>
                                        ) : (
                                            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                {eventosSelecionados.map((ev, idx) => (
                                                    <li key={`${ev.nome}-${ev.data}-${idx}`} className="rounded-md border p-2">
                                                        <div className="text-sm font-medium truncate">{ev.nome}</div>
                                                        <div className="text-xs text-gray-500">{safeFormatDate(ev.data)}</div>
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
