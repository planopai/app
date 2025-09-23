"use client";
import React from "react";
import { formataDataDia } from "./UtilDatas";

/* =========================
   Tipos
   ========================= */
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

    /** Linhas brutas vindas do backend (podem ter vários tipos) */
    rows: Row[];

    /** Quantos registros (atendimentos) caem no período filtrado */
    registrosComEventoNoPeriodo: number;

    /** Lista de tanatos do período (opcional), cada “Sim” representa 1 */
    listaTanatoPeriodo: Evento[];

    /** KPIs adicionais (vêm do backend) */
    totalAssistencias?: number;
    convenios?: {
        particular?: number;
        prefeitura?: number;
        associado?: number;
    };

    loading: boolean;
    onRecarregar: () => void;
}

/* =========================
   Helpers
   ========================= */
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

function normalize(s: string) {
    return (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}
function isYes(v: string) {
    const s = normalize(v);
    return s === "sim" || s === "yes" || s === "true" || s === "1";
}

/* =========================
   Gráfico simples (SVG)
   ========================= */
function BarChart({
    data,
    height = 340,
    padding = 48,
    barW = 32,
    gap = 24,
    yTicks = 5,
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
    const items = data.slice(0, 10);
    const maxVal = Math.max(1, ...items.map((d) => d.value));
    const width =
        padding * 2 + items.length * barW + Math.max(0, items.length - 1) * gap;

    return (
        <div className="w-full">
            {title && (
                <div className="px-4 pt-4 text-sm font-semibold text-gray-700">
                    {title}
                </div>
            )}
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[360px]">
                {Array.from({ length: yTicks }, (_, i) => i + 1).map((tick) => {
                    const t = tick / yTicks;
                    const y = height - padding - (height - padding * 2) * t;
                    const val = Math.round(maxVal * t);
                    return (
                        <g key={tick}>
                            <line
                                x1={padding}
                                y1={y}
                                x2={width - padding}
                                y2={y}
                                stroke="#eef2f7"
                            />
                            <text
                                x={padding - 8}
                                y={y + 3}
                                textAnchor="end"
                                fontSize="10"
                                fill="#6b7280"
                            >
                                {val}
                            </text>
                        </g>
                    );
                })}
                <line
                    x1={padding}
                    y1={padding}
                    x2={padding}
                    y2={height - padding}
                    stroke="#e5e7eb"
                />
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

/* =========================
   Componente
   ========================= */
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
    totalAssistencias = 0,
    convenios = {},
    loading,
    onRecarregar,
}: Props) {
    if (!aberto) return null;

    // limpa seleção ao trocar filtros
    React.useEffect(() => {
        setSelectedItem(undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aDe, aAte, somenteTanato]);

    // Conjuntos normalizados
    const consumoAssistencia = React.useMemo(
        () => new Set(["velas", "kit lanche"].map(normalize)),
        []
    );
    const conservacaoCorpo = React.useMemo(
        () =>
            new Set(
                [
                    "luvas",
                    "palha",
                    "tamponamento",
                    "maquiagem",
                    "algodão",
                    "algodao",
                    "cordão",
                    "cordao",
                    "barba",
                    "ta-32",
                    "ta 32",
                    "ta32",
                    "formol",
                    "fluído cavitário",
                    "fluido cavitario",
                    "máscara",
                    "mascara",
                    "invol",
                    "invólucro",
                    "involucro",
                ].map(normalize)
            ),
        []
    );

    // Particiona/soma com normalização forte
    const {
        itensFiltrados,
        totalItensUsados,
        tanatoCount,
        tipoTotais,
        topItens,
    } = React.useMemo(() => {
        const itens: Row[] = [];
        let tanatos = 0;

        // para exibir rótulos “bonitos” quando agregamos por item
        const displayLabel = new Map<string, string>();

        const somasPorTipo = new Map<string, number>();
        const somasTop = new Map<string, number>();

        for (const r of rows || []) {
            const tipoRaw = (r.tipo || "").trim();
            const itemRaw = (r.item || "").trim();
            const q = Number(r.quantidade || 0);

            const tipoN = normalize(tipoRaw);
            const itemN = normalize(itemRaw);

            // 1) Tanato: conta só “Sim”
            if (tipoN.includes("tanato")) {
                if (isYes(itemRaw)) tanatos += q || 0;
                continue;
            }

            // 2) Assistência – só Velas e Kit Lanche
            if (
                tipoN.includes("assistencia") ||
                tipoN.includes("assistência") ||
                tipoN.includes("materiais para assistencia") ||
                tipoN.includes("materiais para assistência")
            ) {
                if (consumoAssistencia.has(itemN)) {
                    const labelTipo = "Assistência";
                    displayLabel.set(itemN, itemRaw || "—");

                    const row: Row = {
                        key: `${labelTipo}:${itemN}`,
                        item: displayLabel.get(itemN)!,
                        tipo: labelTipo,
                        quantidade: q || 0,
                    };
                    itens.push(row);

                    somasPorTipo.set(labelTipo, (somasPorTipo.get(labelTipo) || 0) + (q || 0));
                    const label = `${labelTipo}: ${row.item}`;
                    somasTop.set(label, (somasTop.get(label) || 0) + (q || 0));
                }
                continue;
            }

            // 3) Conservação do Corpo – qualquer item marcado = 1 (se não vier qtd)
            if (
                tipoN.includes("conservacao do corpo") ||
                tipoN.includes("conservacao") ||
                tipoN.includes("conservação") ||
                tipoN.includes("arrumacao") ||
                tipoN.includes("arrumação") ||
                tipoN.includes("corpo")
            ) {
                if (conservacaoCorpo.has(itemN)) {
                    displayLabel.set(itemN, itemRaw || "—");
                    const val = q > 0 ? q : 1;
                    const labelTipo = "Conservação do Corpo";
                    const row: Row = {
                        key: `${labelTipo}:${itemN}`,
                        item: displayLabel.get(itemN)!,
                        tipo: labelTipo,
                        quantidade: val,
                    };
                    itens.push(row);
                    somasPorTipo.set(labelTipo, (somasPorTipo.get(labelTipo) || 0) + val);
                    const label = `${labelTipo}: ${row.item}`;
                    somasTop.set(label, (somasTop.get(label) || 0) + val);
                }
                continue;
            }

            // 4) Outros tipos: ignorar (não-consumo)
        }

        const totalItens = itens.reduce((s, r) => s + (r.quantidade || 0), 0);

        const arrTipo = Array.from(somasPorTipo, ([tipo, quantidade]) => ({
            tipo,
            quantidade,
        })).sort((a, b) => b.quantidade - a.quantidade);

        const arrTop = Array.from(somasTop, ([label, value]) => ({
            label,
            value,
        })).sort((a, b) => b.value - a.value);

        return {
            itensFiltrados: itens,
            totalItensUsados: totalItens,
            tanatoCount: tanatos,
            tipoTotais: arrTipo,
            topItens: arrTop,
        };
    }, [rows, consumoAssistencia, conservacaoCorpo]);

    const linhasVisiveis = React.useMemo<Row[]>(() => {
        if (!Array.isArray(itensFiltrados)) return [];
        return somenteTanato ? [] : itensFiltrados;
    }, [itensFiltrados, somenteTanato]);

    const totalGeralTabela = linhasVisiveis.reduce(
        (s, r) => s + (r.quantidade || 0),
        0
    );

    // eventos (hoje só tanato costuma vir)
    const eventosSelecionados = React.useMemo(() => {
        if (!selectedItem) return [];
        const hasKey =
            Array.isArray(listaTanatoPeriodo) &&
            listaTanatoPeriodo.some((e) => !!e.itemKey);
        return hasKey
            ? listaTanatoPeriodo.filter((e) => e.itemKey === selectedItem)
            : [];
    }, [selectedItem, listaTanatoPeriodo]);

    const handleLinhaClick = (k: string) => {
        setSelectedItem(selectedItem === k ? undefined : k);
    };

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
                            {/* KPIs */}
                            <div className="grid gap-4 lg:grid-cols-3 mb-6">
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">Itens usados no período</div>
                                    <div className="mt-1 text-3xl font-bold">
                                        {fmt0(totalItensUsados)}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Somatório de consumo real
                                    </div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">
                                        Tanatopraxias realizadas
                                    </div>
                                    <div className="mt-1 text-3xl font-bold">
                                        {fmt0(tanatoCount)}
                                    </div>
                                    <div className="text-xs text-gray-500">Contagem de “Sim”</div>
                                </div>
                                <div className="rounded-xl border p-4">
                                    <div className="text-xs text-gray-500">
                                        Assistências realizadas
                                    </div>
                                    <div className="mt-1 text-3xl font-bold">
                                        {fmt0(totalAssistencias)}
                                    </div>
                                    <div className="text-xs text-gray-500">Total no período</div>
                                </div>
                            </div>

                            {/* Convênios */}
                            <div className="rounded-xl border p-4 mb-6">
                                <div className="text-xs text-gray-500 mb-2">
                                    Atendimentos por convênio
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="rounded-full border px-2 py-0.5 text-xs">
                                        Particular: <b>{fmt0(convenios.particular ?? 0)}</b>
                                    </span>
                                    <span className="rounded-full border px-2 py-0.5 text-xs">
                                        Prefeitura: <b>{fmt0(convenios.prefeitura ?? 0)}</b>
                                    </span>
                                    <span className="rounded-full border px-2 py-0.5 text-xs">
                                        Associado: <b>{fmt0(convenios.associado ?? 0)}</b>
                                    </span>
                                </div>
                            </div>

                            {/* GRÁFICO */}
                            <div className="rounded-2xl border overflow-hidden mb-6">
                                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                                    <div className="text-sm font-semibold">
                                        Top itens do período (consumo real)
                                    </div>
                                    <div className="text-xs text-gray-500">máx. 10 itens</div>
                                </div>
                                <div className="p-2 md:p-4">
                                    <BarChart
                                        data={topItens}
                                        height={360}
                                        padding={52}
                                        barW={32}
                                        gap={26}
                                        yTicks={5}
                                    />
                                </div>
                            </div>

                            {/* TABELA DE ITENS */}
                            {!somenteTanato && (
                                <div className="rounded-2xl border overflow-hidden mb-6">
                                    <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">
                                        Detalhamento por item (consumo real)
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
                                                        <td className="p-2 border text-right">
                                                            {fmt0(r.quantidade)}
                                                        </td>
                                                        <td className="p-2 border text-right">
                                                            {pct1(r.quantidade, totalGeralTabela)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-gray-50 font-semibold">
                                                    <td className="p-2 border" colSpan={2}>
                                                        Total (itens)
                                                    </td>
                                                    <td className="p-2 border text-right">
                                                        {fmt0(totalGeralTabela)}
                                                    </td>
                                                    <td className="p-2 border text-right">100%</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* LISTA TANATO */}
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

                            {/* (Opcional) Eventos por item selecionado */}
                            {selectedItem && (
                                <div className="rounded-2xl border overflow-hidden mt-6">
                                    <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold">
                                        Eventos — {selectedItem}
                                    </div>
                                    <div className="p-4">
                                        {/* hoje o backend normalmente só envia tanato;
                        quando enviar por item, isto vai listar */}
                                        <div className="text-sm text-gray-600">
                                            Sem eventos vinculados a este item.
                                        </div>
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
