"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/balanco.php`;

type Periodo = { inicio: string; fim: string };
type Preset = "HOJE" | "SEMANA" | "MES" | "ANO" | "PERSONALIZADO";


type Resumo = {
    /** Total geral: funerários + alimentação + limpeza + descartáveis. */
    total_gasto: number;
    custo_direto: number;
    custo_consumiveis_estimado: number;
    custo_ornamentacao: number;
    custo_servicos_ativados?: number;
    atendimentos: number;
    custo_medio_atendimento: number;
    itens_utilizados: number;
    movimentos_saida: number;

    gasto_atendimentos_funerarios?: number;
    gasto_alimentacao?: number;
    gasto_material_limpeza?: number;
    gasto_material_descartavel?: number;
    saidas_sem_custo?: number;

    /** Resultado exclusivamente funerário. */
    receita_funeraria?: number;
    lucro_funerario?: number;
    margem_lucro_percentual?: number;
    receita_media_atendimento?: number;
    lucro_medio_atendimento?: number;
    assistencias_ativas?: number;
    tanatopraxias_ativas?: number;
};

type AtendimentoRow = {
    atendimento_id: number;
    falecido: string;
    convenio: string;
    data_referencia: string;
    custo_total: number;
    receita_total?: number;
    lucro_total?: number;
    margem_lucro_percentual?: number;
    assistencia_ativa?: boolean;
    tanatopraxia_ativa?: boolean;
};

type ConvenioOption = {
    value: string;
    label: string;
};

type SaidaConsumoRow = {
    movimento_id: number;
    data_referencia: string;
    produto_id: number;
    produto_nome: string;
    codigo_barras: string;
    classificacao: string;
    categoria: string;
    quantidade_saida: number;
    custo_unitario: number | null;
    custo_total: number | null;
    destino_texto?: string;
};

type SaidaConsumoDestino = {
    destino: string;
    quantidade: number;
};

type SaidaConsumoDia = {
    data: string;
    quantidade: number;
    custo_total: number | null;
    destinos: SaidaConsumoDestino[];
};

type SaidaConsumoGrupo = {
    chave: string;
    produto_id: number;
    produto_nome: string;
    codigo_barras: string;
    categoria: string;
    quantidade_total: number;
    movimentos: number;
    custo_medio: number | null;
    custo_total: number | null;
    saidas_sem_custo: number;
    destino_principal: string;
    destino_principal_quantidade: number;
    dias: SaidaConsumoDia[];
};

type Financeiro = {
    escopo?: string;
    receita_funeraria: number;
    custo_funerario: number;
    lucro_funerario: number;
    margem_lucro_percentual: number;
    receita_media_atendimento?: number;
    custo_medio_atendimento?: number;
    lucro_medio_atendimento?: number;
    regra?: string;
};

type EvolucaoRow = {
    data: string;
    atendimentos?: number;
    custo_total: number;
    receita_total?: number;
    lucro_total?: number;
};

type BalancoResponse = {
    ok: boolean;
    need_login?: 1;
    msg?: string;
    periodo?: Periodo;
    filtro_convenio?: string | string[];
    filtros_convenio?: string[];
    convenios_disponiveis?: ConvenioOption[];
    resumo?: Resumo;
    financeiro?: Financeiro;
    evolucao?: EvolucaoRow[];
    alertas?: string[];
    atendimentos?: AtendimentoRow[];
    saidas_consumo?: SaidaConsumoRow[];
};

type AreaGasto =
    | "ATENDIMENTOS_FUNERARIOS"
    | "ALIMENTACAO"
    | "MATERIAL_LIMPEZA"
    | "MATERIAL_DESCARTAVEL";

const AREAS_GASTO: Array<{ value: AreaGasto; label: string }> = [
    { value: "ATENDIMENTOS_FUNERARIOS", label: "Atendimentos Funerários" },
    { value: "ALIMENTACAO", label: "Alimentação" },
    { value: "MATERIAL_LIMPEZA", label: "Material de Limpeza" },
    { value: "MATERIAL_DESCARTAVEL", label: "Material Descartável" },
];

type DetalheItem = {
    tipo_custo:
    | "BAIXA_ESTOQUE"
    | "CONSUMIVEL_ESTIMADO"
    | "ORNAMENTACAO"
    | "SERVICO_ATIVADO";
    produto_id: number;
    produto_nome: string;
    codigo_barras: string;
    categoria_nome?: string;
    quantidade?: number;
    preco_custo?: number;
    valor_unitario?: number;
    subtotal: number;
    receita_total?: number;
    lucro_total?: number;
    descricao_calculo?: string;
};

type DetalheAtendimento = {
    id: number;
    falecido: string;
    convenio: string;
    data_referencia: string;
    custo_total: number;
    receita_total?: number;
    lucro_total?: number;
    margem_lucro_percentual?: number;
    assistencia_ativa?: boolean;
    tanatopraxia_ativa?: boolean;
};

type DetalheResponse = {
    ok: boolean;
    need_login?: 1;
    msg?: string;
    alertas?: string[];
    atendimento?: DetalheAtendimento;
    itens?: DetalheItem[];
};

function localDateValue(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function periodoPreset(preset: Exclude<Preset, "PERSONALIZADO">): Periodo {
    const now = new Date();
    const fim = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let inicio = new Date(fim);

    if (preset === "SEMANA") {
        const day = inicio.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        inicio.setDate(inicio.getDate() - diffToMonday);
    } else if (preset === "MES") {
        inicio = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === "ANO") {
        inicio = new Date(now.getFullYear(), 0, 1);
    }

    return {
        inicio: localDateValue(inicio),
        fim: localDateValue(fim),
    };
}

function moneyBRL(value: number): string {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    try {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(safe);
    } catch {
        return `R$ ${safe.toFixed(2).replace(".", ",")}`;
    }
}

function numberBR(value: number): string {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    try {
        return new Intl.NumberFormat("pt-BR").format(safe);
    } catch {
        return String(safe);
    }
}


function percentBR(value: number): string {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    try {
        return new Intl.NumberFormat("pt-BR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
        }).format(safe) + "%";
    } catch {
        return `${safe.toFixed(1).replace(".", ",")}%`;
    }
}

function dateBR(value?: string | null): string {
    const raw = String(value ?? "").trim();
    if (!raw) return "-";

    const match = raw.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
}

function safeText(value?: string | null, fallback = "-"): string {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function normalizeKey(value?: string | null): string {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();
}

function areaDaCategoria(categoria?: string | null): AreaGasto | null {
    const key = normalizeKey(categoria);
    if (key === "ALIMENTACAO") return "ALIMENTACAO";
    if (key === "MATERIAL DE LIMPEZA") return "MATERIAL_LIMPEZA";
    if (key === "MATERIAL DESCARTAVEL") return "MATERIAL_DESCARTAVEL";
    return null;
}

async function fetchFresh<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal,
    });

    const data = (await response.json().catch(() => null)) as T | null;
    if (!response.ok || !data) {
        throw new Error((data as any)?.msg || `Falha HTTP ${response.status}.`);
    }

    return data;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <section
            className={[
                "rounded-2xl border border-slate-200 bg-white shadow-sm",
                "dark:border-slate-800 dark:bg-slate-950",
                className,
            ].join(" ")}
        >
            {children}
        </section>
    );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
    return (
        <Card className="p-4 sm:p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {label}
            </div>
            <div className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                {value}
            </div>
        </Card>
    );
}

function Spinner() {
    return (
        <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            aria-hidden="true"
        />
    );
}

function FilterIcon() {
    return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 5h16l-6.5 7.5V19l-3 1v-7.5L4 5Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function RefreshIcon() {
    return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M20 6v5h-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19 11a7 7 0 1 0 1 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}


type ConvenioMultiSelectProps = {
    options: ConvenioOption[];
    value: string[];
    onChange: (values: string[]) => void;
    disabled?: boolean;
};

function ConvenioMultiSelect({
    options,
    value,
    onChange,
    disabled = false,
}: ConvenioMultiSelectProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const root = rootRef.current;
            if (!root || root.contains(event.target as Node)) return;
            setOpen(false);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);
        window.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const todos = value.length === 0;

    const selectedLabels = value.map((selectedValue) => {
        const option = options.find((item) => item.value === selectedValue);
        return option?.label ?? selectedValue;
    });

    const buttonLabel =
        todos
            ? "Todos"
            : selectedLabels.length === 1
                ? selectedLabels[0]
                : selectedLabels.length === 2
                    ? selectedLabels.join(", ")
                    : `${selectedLabels.length} convênios selecionados`;

    function toggleOption(optionValue: string) {
        if (todos) {
            onChange([optionValue]);
            return;
        }

        if (value.includes(optionValue)) {
            onChange(value.filter((item) => item !== optionValue));
            return;
        }

        onChange([...value, optionValue]);
    }

    return (
        <div ref={rootRef} className="relative">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Convênio
            </span>

            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={[
                    "flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 text-left text-sm outline-none transition",
                    "border-slate-300 ring-sky-200 hover:border-slate-400 focus:ring-2",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    "dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600",
                ].join(" ")}
            >
                <span className="min-w-0 truncate">{buttonLabel}</span>
                <svg
                    viewBox="0 0 20 20"
                    className={[
                        "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                        open ? "rotate-180" : "",
                    ].join(" ")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                >
                    <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {open ? (
                <div
                    role="listbox"
                    aria-multiselectable="true"
                    className="absolute left-0 right-0 z-50 mt-1 max-h-72 min-w-[260px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-950"
                >
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-900">
                        <input
                            type="checkbox"
                            checked={todos}
                            onChange={() => onChange([])}
                            className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                        />
                        <span className="font-medium">Todos</span>
                    </label>

                    {options.length > 0 ? (
                        <>
                            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                            {options.map((option) => {
                                const checked = !todos && value.includes(option.value);

                                return (
                                    <label
                                        key={option.value}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-900"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleOption(option.value)}
                                            className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                                        />
                                        <span className="min-w-0 flex-1">{option.label}</span>
                                    </label>
                                );
                            })}
                        </>
                    ) : (
                        <div className="px-3 py-3 text-xs text-slate-400">
                            Nenhum convênio disponível.
                        </div>
                    )}
                </div>
            ) : null}

            <span className="mt-1 block text-[11px] text-slate-400">
                Você pode marcar um ou vários convênios.
            </span>
        </div>
    );
}


type FinancialMetricProps = {
    label: string;
    value: string;
    helper?: string;
    tone?: "default" | "positive" | "negative" | "info";
};

function FinancialMetric({ label, value, helper, tone = "default" }: FinancialMetricProps) {
    const toneClass =
        tone === "positive"
            ? "text-emerald-700 dark:text-emerald-300"
            : tone === "negative"
                ? "text-rose-700 dark:text-rose-300"
                : tone === "info"
                    ? "text-sky-700 dark:text-sky-300"
                    : "text-slate-900 dark:text-white";

    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {label}
            </div>
            <div className={`mt-2 text-2xl font-semibold tracking-tight ${toneClass}`}>
                {value}
            </div>
            {helper ? (
                <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    {helper}
                </div>
            ) : null}
        </div>
    );
}

function MarginGauge({ margem, lucro }: { margem: number; lucro: number }) {
    const clamped = Math.max(0, Math.min(100, margem));
    const positive = lucro >= 0;

    return (
        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-3 text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    Margem
                </div>
            </div>

            <div className="relative grid h-40 w-40 place-items-center">
                <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90" aria-hidden="true">
                    <circle
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="12"
                        className="text-slate-200 dark:text-slate-800"
                    />
                    <circle
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="12"
                        strokeLinecap="round"
                        pathLength="100"
                        strokeDasharray={`${clamped} ${100 - clamped}`}
                        className={positive ? "text-emerald-500" : "text-rose-500"}
                    />
                </svg>

                <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                        <div className={`text-3xl font-semibold ${positive ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                            {percentBR(margem)}
                        </div>
                        <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            margem
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function FinancialTrendChart({ rows }: { rows: EvolucaoRow[] }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [containerWidth, setContainerWidth] = useState(760);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const updateWidth = () => {
            const nextWidth = Math.max(280, Math.floor(element.clientWidth));
            setContainerWidth(nextWidth);
        };

        updateWidth();

        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(updateWidth);
            observer.observe(element);
            return () => observer.disconnect();
        }

        window.addEventListener("resize", updateWidth);
        return () => window.removeEventListener("resize", updateWidth);
    }, []);

    const compact = containerWidth < 560;
    const data = rows.slice(compact ? -14 : -31);

    if (!data.length) {
        return (
            <div className="flex min-h-64 min-w-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900/40">
                Ainda não há dados suficientes para montar o gráfico financeiro no período selecionado.
            </div>
        );
    }

    const width = containerWidth;
    const height = compact ? 250 : 280;
    const left = compact ? 46 : 60;
    const right = compact ? 10 : 18;
    const top = 24;
    const bottom = 42;
    const chartW = Math.max(1, width - left - right);
    const chartH = height - top - bottom;

    const maxValue = Math.max(
        1,
        ...data.flatMap((row) => [
            Math.max(0, Number(row.receita_total ?? 0)),
            Math.max(0, Number(row.custo_total ?? 0)),
            Math.max(0, Number(row.lucro_total ?? 0)),
        ]),
    );

    const xFor = (index: number) =>
        left + (data.length <= 1 ? chartW / 2 : (index / (data.length - 1)) * chartW);

    const yFor = (value: number) =>
        top + chartH - (Math.max(0, value) / maxValue) * chartH;

    const makePath = (getValue: (row: EvolucaoRow) => number) =>
        data
            .map((row, index) => {
                const x = xFor(index);
                const y = yFor(getValue(row));
                return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(" ");

    const receitaPath = makePath((row) => Number(row.receita_total ?? 0));
    const custoPath = makePath((row) => Number(row.custo_total ?? 0));
    const retornoPath = makePath((row) => Math.max(0, Number(row.lucro_total ?? 0)));

    const gridValues = compact ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];

    const axisMoney = (value: number) => {
        const absolute = Math.abs(value);
        if (absolute >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
        if (absolute >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`;
        return `R$ ${Math.round(value)}`;
    };

    return (
        <div
            ref={containerRef}
            className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/70 sm:p-4"
        >
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                        Receita × custo × retorno
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                        Evolução diária dos atendimentos funerários
                    </div>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                        Receita
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                        Custo
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        Retorno
                    </span>
                </div>
            </div>

            <div className="min-w-0 w-full max-w-full overflow-hidden">
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="block h-auto w-full max-w-full"
                    role="img"
                    aria-label="Gráfico de receita, custo e retorno"
                >
                    {gridValues.map((fraction) => {
                        const value = maxValue * fraction;
                        const y = yFor(value);

                        return (
                            <g key={fraction}>
                                <line
                                    x1={left}
                                    x2={width - right}
                                    y1={y}
                                    y2={y}
                                    className="stroke-slate-200 dark:stroke-slate-800"
                                    strokeDasharray="4 5"
                                />
                                <text
                                    x={left - 7}
                                    y={y + 4}
                                    textAnchor="end"
                                    className="fill-slate-400 text-[10px]"
                                >
                                    {axisMoney(value)}
                                </text>
                            </g>
                        );
                    })}

                    <path d={receitaPath} fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-sky-500" />
                    <path d={custoPath} fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-amber-500" />
                    <path d={retornoPath} fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-emerald-500" />

                    {data.map((row, index) => {
                        const x = xFor(index);
                        const receita = Number(row.receita_total ?? 0);
                        const custo = Number(row.custo_total ?? 0);
                        const retorno = Number(row.lucro_total ?? 0);

                        return (
                            <g key={`${row.data}-${index}`}>
                                <circle cx={x} cy={yFor(receita)} r={compact ? 3 : 4} className="fill-sky-500">
                                    <title>{`${dateBR(row.data)} · Receita ${moneyBRL(receita)}`}</title>
                                </circle>
                                <circle cx={x} cy={yFor(custo)} r={compact ? 3 : 4} className="fill-amber-500">
                                    <title>{`${dateBR(row.data)} · Custo ${moneyBRL(custo)}`}</title>
                                </circle>
                                {retorno >= 0 ? (
                                    <circle cx={x} cy={yFor(retorno)} r={compact ? 3 : 4} className="fill-emerald-500">
                                        <title>{`${dateBR(row.data)} · Retorno ${moneyBRL(retorno)}`}</title>
                                    </circle>
                                ) : null}
                            </g>
                        );
                    })}

                    <text
                        x={left}
                        y={height - 12}
                        textAnchor="start"
                        className="fill-slate-400 text-[10px]"
                    >
                        {dateBR(data[0]?.data)}
                    </text>
                    <text
                        x={width - right}
                        y={height - 12}
                        textAnchor="end"
                        className="fill-slate-400 text-[10px]"
                    >
                        {dateBR(data[data.length - 1]?.data)}
                    </text>
                </svg>
            </div>

            {data.some((row) => Number(row.lucro_total ?? 0) < 0) ? (
                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                    Existem dias com retorno negativo. A linha de retorno mostra apenas a parte positiva; os valores negativos continuam considerados nos indicadores.
                </div>
            ) : null}
        </div>
    );
}

type PaginationControlsProps = {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
};

function PaginationControls({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
}: PaginationControlsProps) {
    if (totalItems <= 0) return null;

    const safePage = Math.max(1, Math.min(currentPage, totalPages));
    const firstItem = (safePage - 1) * pageSize + 1;
    const lastItem = Math.min(safePage * pageSize, totalItems);

    return (
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Mostrando {numberBR(firstItem)}–{numberBR(lastItem)} de {numberBR(totalItems)}
            </div>

            <div className="flex items-center justify-between gap-2 sm:justify-end">
                <button
                    type="button"
                    onClick={() => onPageChange(Math.max(1, safePage - 1))}
                    disabled={safePage <= 1}
                    className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                    Anterior
                </button>

                <div className="min-w-[92px] text-center text-xs font-medium text-slate-600 dark:text-slate-300">
                    {numberBR(safePage)} / {numberBR(totalPages)}
                </div>

                <button
                    type="button"
                    onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
                    disabled={safePage >= totalPages}
                    className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                    Próxima
                </button>
            </div>
        </div>
    );
}

export default function BalancoPage() {
    const initialPeriodo = useMemo(() => periodoPreset("MES"), []);

    const [inicio, setInicio] = useState(initialPeriodo.inicio);
    const [fim, setFim] = useState(initialPeriodo.fim);
    const [conveniosFiltro, setConveniosFiltro] = useState<string[]>([]);
    const [preset, setPreset] = useState<Preset>("MES");

    const [draftInicio, setDraftInicio] = useState(initialPeriodo.inicio);
    const [draftFim, setDraftFim] = useState(initialPeriodo.fim);
    const [draftConvenios, setDraftConvenios] = useState<string[]>([]);
    const [draftPreset, setDraftPreset] = useState<Preset>("MES");
    const [filtersOpen, setFiltersOpen] = useState(false);

    const [data, setData] = useState<BalancoResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [areaGasto, setAreaGasto] = useState<AreaGasto>("ATENDIMENTOS_FUNERARIOS");
    const [pageSize, setPageSize] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedConsumoKey, setExpandedConsumoKey] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<DetalheResponse | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");

    const requestSeq = useRef(0);
    const detailSeq = useRef(0);

    async function carregarBalanco(
        nextInicio = inicio,
        nextFim = fim,
        nextConvenios = conveniosFiltro,
    ) {
        const seq = ++requestSeq.current;
        setLoading(true);
        setError("");

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 30_000);

        try {
            const url = new URL(API_BASE, window.location.origin);
            url.searchParams.set("action", "resumo");
            url.searchParams.set("inicio", nextInicio);
            url.searchParams.set("fim", nextFim);
            for (const convenioSelecionado of nextConvenios) {
                url.searchParams.append("convenio[]", convenioSelecionado);
            }
            url.searchParams.set("_ts", String(Date.now()));

            const response = await fetchFresh<BalancoResponse>(url.toString(), controller.signal);
            if (seq !== requestSeq.current) return;
            if (!response.ok) {
                throw new Error(response.msg || "Não foi possível carregar o balanço.");
            }

            setData(response);
        } catch (e: any) {
            if (seq !== requestSeq.current) return;
            setError(
                e?.name === "AbortError"
                    ? "A consulta demorou mais de 30 segundos. Tente novamente."
                    : e?.message || "Não foi possível carregar o balanço.",
            );
        } finally {
            window.clearTimeout(timeout);
            if (seq === requestSeq.current) setLoading(false);
        }
    }

    async function abrirDetalhe(atendimentoId: number) {
        const seq = ++detailSeq.current;
        setSelectedId(atendimentoId);
        setDetail(null);
        setDetailError("");
        setDetailLoading(true);

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 30_000);

        try {
            const url = new URL(API_BASE, window.location.origin);
            url.searchParams.set("action", "detalhe");
            url.searchParams.set("atendimento_id", String(atendimentoId));
            url.searchParams.set("inicio", inicio);
            url.searchParams.set("fim", fim);
            url.searchParams.set("_ts", String(Date.now()));

            const response = await fetchFresh<DetalheResponse>(url.toString(), controller.signal);
            if (seq !== detailSeq.current) return;
            if (!response.ok) {
                throw new Error(response.msg || "Não foi possível abrir o atendimento.");
            }

            setDetail(response);
        } catch (e: any) {
            if (seq !== detailSeq.current) return;
            setDetailError(
                e?.name === "AbortError"
                    ? "A consulta demorou mais de 30 segundos."
                    : e?.message || "Não foi possível abrir o atendimento.",
            );
        } finally {
            window.clearTimeout(timeout);
            if (seq === detailSeq.current) setDetailLoading(false);
        }
    }

    function fecharDetalhe() {
        detailSeq.current++;
        setSelectedId(null);
        setDetail(null);
        setDetailError("");
        setDetailLoading(false);
    }

    function abrirFiltros() {
        setDraftInicio(inicio);
        setDraftFim(fim);
        setDraftConvenios([...conveniosFiltro]);
        setDraftPreset(preset);
        setFiltersOpen(true);
    }

    function escolherPreset(nextPreset: Exclude<Preset, "PERSONALIZADO">) {
        const periodo = periodoPreset(nextPreset);
        setDraftPreset(nextPreset);
        setDraftInicio(periodo.inicio);
        setDraftFim(periodo.fim);
    }

    function aplicarFiltros() {
        if (!draftInicio || !draftFim) {
            setError("Informe a data inicial e a data final.");
            return;
        }

        if (draftInicio > draftFim) {
            setError("A data inicial não pode ser posterior à data final.");
            return;
        }

        setInicio(draftInicio);
        setFim(draftFim);
        setConveniosFiltro([...draftConvenios]);
        setPreset(draftPreset);
        setFiltersOpen(false);
        setCurrentPage(1);
        fecharDetalhe();
        void carregarBalanco(draftInicio, draftFim, draftConvenios);
    }

    function limparFiltros() {
        const periodo = periodoPreset("MES");
        setDraftPreset("MES");
        setDraftInicio(periodo.inicio);
        setDraftFim(periodo.fim);
        setDraftConvenios([]);
    }

    useEffect(() => {
        void carregarBalanco(initialPeriodo.inicio, initialPeriodo.fim, []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedId === null) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") fecharDetalhe();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [selectedId]);

    const atendimentosFiltrados = useMemo(() => {
        const rows = data?.atendimentos ?? [];
        const q = query.trim().toLocaleLowerCase("pt-BR");
        if (!q) return rows;

        return rows.filter((row) => {
            const id = String(row.atendimento_id);
            const falecido = String(row.falecido ?? "").toLocaleLowerCase("pt-BR");
            const convenioRow = String(row.convenio ?? "").toLocaleLowerCase("pt-BR");
            return id.includes(q) || falecido.includes(q) || convenioRow.includes(q);
        });
    }, [data?.atendimentos, query]);

    const saidasConsumoAgrupadas = useMemo<SaidaConsumoGrupo[]>(() => {
        if (areaGasto === "ATENDIMENTOS_FUNERARIOS") return [];

        type GrupoInterno = {
            chave: string;
            produto_id: number;
            produto_nome: string;
            codigo_barras: string;
            categoria: string;
            quantidade_total: number;
            movimentos: number;
            custo_total_conhecido: number;
            quantidade_com_custo: number;
            saidas_sem_custo: number;
            destinos: Map<string, number>;
            dias: Map<string, {
                quantidade: number;
                custo_total_conhecido: number;
                tem_custo: boolean;
                destinos: Map<string, number>;
            }>;
        };

        const grupos = new Map<string, GrupoInterno>();

        for (const row of data?.saidas_consumo ?? []) {
            if (normalizeKey(row.classificacao) !== "MATERIAL DE USO E CONSUMO") continue;
            if (areaDaCategoria(row.categoria) !== areaGasto) continue;

            const produtoId = Number(row.produto_id ?? 0);
            const codigo = String(row.codigo_barras ?? "").trim();
            const nome = String(row.produto_nome ?? "").trim();
            const chave = produtoId > 0
                ? `id:${produtoId}`
                : codigo
                    ? `cb:${codigo}`
                    : `nome:${normalizeKey(nome)}`;

            const quantidade = Math.max(0, Number(row.quantidade_saida ?? 0));
            if (quantidade <= 0) continue;

            const destinoRaw = String(row.destino_texto ?? "").trim();
            const destino = destinoRaw || "Sem destino informado";
            const dataKey = String(row.data_referencia ?? "").slice(0, 10) || "SEM_DATA";

            let grupo = grupos.get(chave);
            if (!grupo) {
                grupo = {
                    chave,
                    produto_id: produtoId,
                    produto_nome: nome || "Produto",
                    codigo_barras: codigo,
                    categoria: String(row.categoria ?? ""),
                    quantidade_total: 0,
                    movimentos: 0,
                    custo_total_conhecido: 0,
                    quantidade_com_custo: 0,
                    saidas_sem_custo: 0,
                    destinos: new Map<string, number>(),
                    dias: new Map(),
                };
                grupos.set(chave, grupo);
            }

            grupo.quantidade_total += quantidade;
            grupo.movimentos += 1;
            grupo.destinos.set(destino, (grupo.destinos.get(destino) ?? 0) + quantidade);

            if (row.custo_total == null) {
                grupo.saidas_sem_custo += 1;
            } else {
                grupo.custo_total_conhecido += Number(row.custo_total) || 0;
                grupo.quantidade_com_custo += quantidade;
            }

            let dia = grupo.dias.get(dataKey);
            if (!dia) {
                dia = {
                    quantidade: 0,
                    custo_total_conhecido: 0,
                    tem_custo: false,
                    destinos: new Map<string, number>(),
                };
                grupo.dias.set(dataKey, dia);
            }

            dia.quantidade += quantidade;
            dia.destinos.set(destino, (dia.destinos.get(destino) ?? 0) + quantidade);
            if (row.custo_total != null) {
                dia.custo_total_conhecido += Number(row.custo_total) || 0;
                dia.tem_custo = true;
            }
        }

        const q = query.trim().toLocaleLowerCase("pt-BR");

        return Array.from(grupos.values())
            .map((grupo): SaidaConsumoGrupo => {
                const destinosOrdenados = Array.from(grupo.destinos.entries())
                    .map(([destino, quantidade]) => ({ destino, quantidade }))
                    .sort((a, b) =>
                        b.quantidade - a.quantidade ||
                        a.destino.localeCompare(b.destino, "pt-BR"),
                    );

                const dias = Array.from(grupo.dias.entries())
                    .map(([data, dia]): SaidaConsumoDia => ({
                        data,
                        quantidade: dia.quantidade,
                        custo_total: dia.tem_custo ? dia.custo_total_conhecido : null,
                        destinos: Array.from(dia.destinos.entries())
                            .map(([destino, quantidade]) => ({ destino, quantidade }))
                            .sort((a, b) =>
                                b.quantidade - a.quantidade ||
                                a.destino.localeCompare(b.destino, "pt-BR"),
                            ),
                    }))
                    .sort((a, b) => b.data.localeCompare(a.data));

                return {
                    chave: grupo.chave,
                    produto_id: grupo.produto_id,
                    produto_nome: grupo.produto_nome,
                    codigo_barras: grupo.codigo_barras,
                    categoria: grupo.categoria,
                    quantidade_total: grupo.quantidade_total,
                    movimentos: grupo.movimentos,
                    custo_medio:
                        grupo.quantidade_com_custo > 0
                            ? grupo.custo_total_conhecido / grupo.quantidade_com_custo
                            : null,
                    custo_total:
                        grupo.quantidade_com_custo > 0
                            ? grupo.custo_total_conhecido
                            : null,
                    saidas_sem_custo: grupo.saidas_sem_custo,
                    destino_principal: destinosOrdenados[0]?.destino ?? "Sem destino informado",
                    destino_principal_quantidade: destinosOrdenados[0]?.quantidade ?? 0,
                    dias,
                };
            })
            .filter((grupo) => {
                if (!q) return true;
                return (
                    grupo.produto_nome.toLocaleLowerCase("pt-BR").includes(q) ||
                    grupo.codigo_barras.toLocaleLowerCase("pt-BR").includes(q) ||
                    grupo.categoria.toLocaleLowerCase("pt-BR").includes(q) ||
                    grupo.destino_principal.toLocaleLowerCase("pt-BR").includes(q)
                );
            })
            .sort((a, b) =>
                b.quantidade_total - a.quantidade_total ||
                (b.custo_total ?? 0) - (a.custo_total ?? 0) ||
                a.produto_nome.localeCompare(b.produto_nome, "pt-BR"),
            );
    }, [areaGasto, data?.saidas_consumo, query]);

    const totalItensLista =
        areaGasto === "ATENDIMENTOS_FUNERARIOS"
            ? atendimentosFiltrados.length
            : saidasConsumoAgrupadas.length;

    const totalPaginas = Math.max(1, Math.ceil(totalItensLista / pageSize));
    const paginaAtual = Math.min(currentPage, totalPaginas);
    const inicioPagina = (paginaAtual - 1) * pageSize;

    const atendimentosPaginados = useMemo(
        () => atendimentosFiltrados.slice(inicioPagina, inicioPagina + pageSize),
        [atendimentosFiltrados, inicioPagina, pageSize],
    );

    const saidasConsumoPaginadas = useMemo(
        () => saidasConsumoAgrupadas.slice(inicioPagina, inicioPagina + pageSize),
        [saidasConsumoAgrupadas, inicioPagina, pageSize],
    );


    const resumo: Resumo = data?.resumo ?? {
        total_gasto: 0,
        custo_direto: 0,
        custo_consumiveis_estimado: 0,
        custo_ornamentacao: 0,
        custo_servicos_ativados: 0,
        atendimentos: 0,
        custo_medio_atendimento: 0,
        itens_utilizados: 0,
        movimentos_saida: 0,
        gasto_atendimentos_funerarios: 0,
        gasto_alimentacao: 0,
        gasto_material_limpeza: 0,
        gasto_material_descartavel: 0,
        saidas_sem_custo: 0,
        receita_funeraria: 0,
        lucro_funerario: 0,
        margem_lucro_percentual: 0,
        receita_media_atendimento: 0,
        lucro_medio_atendimento: 0,
    };

    const gastosConsumoCalculados = useMemo(() => {
        const totais: Record<Exclude<AreaGasto, "ATENDIMENTOS_FUNERARIOS">, number> = {
            ALIMENTACAO: 0,
            MATERIAL_LIMPEZA: 0,
            MATERIAL_DESCARTAVEL: 0,
        };

        for (const row of data?.saidas_consumo ?? []) {
            if (normalizeKey(row.classificacao) !== "MATERIAL DE USO E CONSUMO") continue;
            const area = areaDaCategoria(row.categoria);
            if (!area || area === "ATENDIMENTOS_FUNERARIOS" || row.custo_total == null) continue;
            totais[area] += Number(row.custo_total) || 0;
        }

        return totais;
    }, [data?.saidas_consumo]);

    const temDadosNovos =
        Array.isArray(data?.saidas_consumo) ||
        typeof data?.resumo?.gasto_atendimentos_funerarios === "number" ||
        typeof data?.resumo?.gasto_alimentacao === "number" ||
        typeof data?.resumo?.gasto_material_limpeza === "number" ||
        typeof data?.resumo?.gasto_material_descartavel === "number";

    const gastoAtendimentos = typeof resumo.gasto_atendimentos_funerarios === "number"
        ? Number(resumo.gasto_atendimentos_funerarios)
        : Number(resumo.total_gasto ?? 0);
    const gastoAlimentacao = typeof resumo.gasto_alimentacao === "number"
        ? Number(resumo.gasto_alimentacao)
        : gastosConsumoCalculados.ALIMENTACAO;
    const gastoLimpeza = typeof resumo.gasto_material_limpeza === "number"
        ? Number(resumo.gasto_material_limpeza)
        : gastosConsumoCalculados.MATERIAL_LIMPEZA;
    const gastoDescartavel = typeof resumo.gasto_material_descartavel === "number"
        ? Number(resumo.gasto_material_descartavel)
        : gastosConsumoCalculados.MATERIAL_DESCARTAVEL;
    const totalGastoGeral = temDadosNovos
        ? gastoAtendimentos + gastoAlimentacao + gastoLimpeza + gastoDescartavel
        : Number(resumo.total_gasto ?? 0);

    const financeiro: Financeiro = data?.financeiro ?? {
        receita_funeraria: Number(resumo.receita_funeraria ?? 0),
        custo_funerario: gastoAtendimentos,
        lucro_funerario: Number(
            resumo.lucro_funerario ??
            (Number(resumo.receita_funeraria ?? 0) - gastoAtendimentos),
        ),
        margem_lucro_percentual: Number(resumo.margem_lucro_percentual ?? 0),
        receita_media_atendimento: Number(resumo.receita_media_atendimento ?? 0),
        custo_medio_atendimento: Number(resumo.custo_medio_atendimento ?? 0),
        lucro_medio_atendimento: Number(resumo.lucro_medio_atendimento ?? 0),
    };

    const receitaFuneraria = Number(financeiro.receita_funeraria ?? 0);
    const custoFunerario = Number(financeiro.custo_funerario ?? gastoAtendimentos);
    const lucroFunerario = Number(
        financeiro.lucro_funerario ??
        (receitaFuneraria - custoFunerario),
    );
    const margemFuneraria = Number(
        financeiro.margem_lucro_percentual ??
        (receitaFuneraria > 0 ? (lucroFunerario / receitaFuneraria) * 100 : 0),
    );

    const gastosPorArea: Record<AreaGasto, number> = {
        ATENDIMENTOS_FUNERARIOS: gastoAtendimentos,
        ALIMENTACAO: gastoAlimentacao,
        MATERIAL_LIMPEZA: gastoLimpeza,
        MATERIAL_DESCARTAVEL: gastoDescartavel,
    };

    const areaAtual = AREAS_GASTO.find((area) => area.value === areaGasto) ?? AREAS_GASTO[0];
    const convenios = data?.convenios_disponiveis ?? [];
    const detailItens = detail?.itens ?? [];
    const evolucaoFinanceira = data?.evolucao ?? [];

    function selecionarArea(nextArea: AreaGasto) {
        setAreaGasto(nextArea);
        setQuery("");
        setCurrentPage(1);
        setExpandedConsumoKey(null);
        fecharDetalhe();
    }

    return (
        <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
            <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6 lg:p-8">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Balanço</h1>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={filtersOpen ? () => setFiltersOpen(false) : abrirFiltros}
                            className={[
                                "grid h-10 w-10 place-items-center rounded-xl border shadow-sm transition",
                                filtersOpen || conveniosFiltro.length > 0 || preset !== "MES"
                                    ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800",
                            ].join(" ")}
                            aria-label="Filtros"
                            title="Filtros"
                        >
                            <FilterIcon />
                        </button>

                        <button
                            type="button"
                            onClick={() => void carregarBalanco()}
                            disabled={loading}
                            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                            aria-label="Atualizar"
                            title="Atualizar"
                        >
                            {loading ? <Spinner /> : <RefreshIcon />}
                        </button>
                    </div>
                </div>

                {filtersOpen ? (
                    <Card className="p-4 sm:p-5">
                        <div className="flex flex-wrap gap-2">
                            {([[
                                "HOJE",
                                "Hoje",
                            ], [
                                "SEMANA",
                                "Semana",
                            ], [
                                "MES",
                                "Mês",
                            ], [
                                "ANO",
                                "Ano",
                            ]] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => escolherPreset(value)}
                                    className={[
                                        "rounded-xl px-4 py-2 text-sm font-medium transition",
                                        draftPreset === value
                                            ? "bg-sky-600 text-white shadow-sm"
                                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
                                    ].join(" ")}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Data inicial</span>
                                <input
                                    type="date"
                                    value={draftInicio}
                                    onChange={(e) => {
                                        setDraftInicio(e.target.value);
                                        setDraftPreset("PERSONALIZADO");
                                    }}
                                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Data final</span>
                                <input
                                    type="date"
                                    value={draftFim}
                                    onChange={(e) => {
                                        setDraftFim(e.target.value);
                                        setDraftPreset("PERSONALIZADO");
                                    }}
                                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
                                />
                            </label>

                            <ConvenioMultiSelect
                                options={convenios}
                                value={draftConvenios}
                                onChange={setDraftConvenios}
                                disabled={loading}
                            />
                        </div>

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={limparFiltros}
                                className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                Limpar
                            </button>
                            <button
                                type="button"
                                onClick={aplicarFiltros}
                                disabled={loading}
                                className="h-10 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                            >
                                Aplicar
                            </button>
                        </div>
                    </Card>
                ) : null}

                {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                        {error}
                    </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <SummaryCard label="Gasto total" value={moneyBRL(totalGastoGeral)} />
                    <SummaryCard label="Atendimentos" value={numberBR(resumo.atendimentos)} />
                    <SummaryCard label="Custo médio" value={moneyBRL(resumo.custo_medio_atendimento)} />
                    <SummaryCard label="Itens com baixa" value={numberBR(resumo.itens_utilizados)} />

                    {AREAS_GASTO.map((area) => {
                        const selected = area.value === areaGasto;

                        return (
                            <button
                                key={area.value}
                                type="button"
                                onClick={() => selecionarArea(area.value)}
                                aria-pressed={selected}
                                className={[
                                    "rounded-2xl border bg-white p-4 text-left shadow-sm transition sm:p-5 dark:bg-slate-950",
                                    selected
                                        ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100 dark:border-sky-700 dark:bg-sky-950/30 dark:ring-sky-900/40"
                                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900",
                                ].join(" ")}
                            >
                                <div
                                    className={[
                                        "text-[11px] font-semibold uppercase tracking-[0.12em]",
                                        selected
                                            ? "text-sky-700 dark:text-sky-300"
                                            : "text-slate-500 dark:text-slate-400",
                                    ].join(" ")}
                                >
                                    {area.label}
                                </div>
                                <div className="mt-2 break-words text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                                    {moneyBRL(gastosPorArea[area.value])}
                                </div>
                            </button>
                        );
                    })}
                </div>

                <Card className="overflow-hidden">
                    <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
                        <h2 className="text-lg font-semibold">Resultado</h2>
                    </div>

                    <div className="min-w-0 p-4 sm:p-5">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <FinancialMetric
                                label="Receita"
                                value={moneyBRL(receitaFuneraria)}
                                tone="info"
                            />
                            <FinancialMetric
                                label="Custo"
                                value={moneyBRL(custoFunerario)}
                            />
                            <FinancialMetric
                                label="Retorno"
                                value={moneyBRL(lucroFunerario)}
                                tone={lucroFunerario >= 0 ? "positive" : "negative"}
                            />
                            <FinancialMetric
                                label="Margem"
                                value={percentBR(margemFuneraria)}
                                tone={lucroFunerario >= 0 ? "positive" : "negative"}
                            />
                        </div>

                        <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                            <FinancialTrendChart rows={evolucaoFinanceira} />
                            <MarginGauge margem={margemFuneraria} lucro={lucroFunerario} />
                        </div>
                    </div>
                </Card>

                <Card className="overflow-hidden">
                    <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold">{areaAtual.label}</h2>
                                {areaGasto !== "ATENDIMENTOS_FUNERARIOS" ? (
                                    <div className="mt-1 text-xs text-slate-400">
                                        Classificação: MATERIAL DE USO E CONSUMO
                                    </div>
                                ) : null}
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row">
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(e) => {
                                        setQuery(e.target.value);
                                        setCurrentPage(1);
                                        setExpandedConsumoKey(null);
                                    }}
                                    placeholder={
                                        areaGasto === "ATENDIMENTOS_FUNERARIOS"
                                            ? "Buscar falecido ou convênio"
                                            : "Buscar produto, código ou destino"
                                    }
                                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
                                />

                                <label className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                    <span className="whitespace-nowrap">Por página</span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => {
                                            setPageSize(Number(e.target.value));
                                            setCurrentPage(1);
                                            setExpandedConsumoKey(null);
                                        }}
                                        className="bg-transparent text-sm font-semibold text-slate-900 outline-none dark:text-white"
                                    >
                                        {[10, 20, 50, 100].map((size) => (
                                            <option key={size} value={size}>
                                                {size}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </div>
                    </div>

                    {loading && !data ? (
                        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
                            <Spinner /> Carregando...
                        </div>
                    ) : areaGasto === "ATENDIMENTOS_FUNERARIOS" ? (
                        atendimentosFiltrados.length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                                Nenhum atendimento encontrado.
                            </div>
                        ) : (
                            <>
                                <div className="hidden overflow-x-auto md:block">
                                    <table className="w-full min-w-[1080px] text-left text-sm">
                                        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                                            <tr>
                                                <th className="px-5 py-3">Data</th>
                                                <th className="px-5 py-3">Convênio</th>
                                                <th className="px-5 py-3">Falecido</th>
                                                <th className="px-5 py-3 text-right">Custo</th>
                                                <th className="px-5 py-3 text-right">Receita</th>
                                                <th className="px-5 py-3 text-right">Retorno</th>
                                                <th className="px-5 py-3 text-right">Margem</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {atendimentosPaginados.map((row) => {
                                                const lucro = Number(row.lucro_total ?? 0);
                                                const receita = Number(row.receita_total ?? 0);
                                                const margem = Number(row.margem_lucro_percentual ?? 0);

                                                return (
                                                    <tr
                                                        key={row.atendimento_id}
                                                        className="hover:bg-slate-50/80 dark:hover:bg-slate-900/70"
                                                    >
                                                        <td className="whitespace-nowrap px-5 py-4">
                                                            {dateBR(row.data_referencia)}
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            {safeText(row.convenio, "Sem convênio")}
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <button
                                                                type="button"
                                                                onClick={() => void abrirDetalhe(row.atendimento_id)}
                                                                className="font-semibold text-sky-700 hover:underline dark:text-sky-300"
                                                            >
                                                                {safeText(row.falecido, `Atendimento #${row.atendimento_id}`)}
                                                            </button>
                                                            {(row.assistencia_ativa || row.tanatopraxia_ativa) ? (
                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                    {row.assistencia_ativa ? (
                                                                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                                                            Assistência
                                                                        </span>
                                                                    ) : null}
                                                                    {row.tanatopraxia_ativa ? (
                                                                        <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-medium text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300">
                                                                            Tanatopraxia
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            ) : null}
                                                        </td>
                                                        <td className="px-5 py-4 text-right font-medium text-slate-700 dark:text-slate-200">
                                                            {moneyBRL(row.custo_total)}
                                                        </td>
                                                        <td className="px-5 py-4 text-right font-semibold text-sky-700 dark:text-sky-300">
                                                            {moneyBRL(receita)}
                                                        </td>
                                                        <td
                                                            className={[
                                                                "px-5 py-4 text-right font-semibold",
                                                                lucro >= 0
                                                                    ? "text-emerald-700 dark:text-emerald-300"
                                                                    : "text-rose-700 dark:text-rose-300",
                                                            ].join(" ")}
                                                        >
                                                            {moneyBRL(lucro)}
                                                        </td>
                                                        <td
                                                            className={[
                                                                "px-5 py-4 text-right font-medium",
                                                                lucro >= 0
                                                                    ? "text-emerald-700 dark:text-emerald-300"
                                                                    : "text-rose-700 dark:text-rose-300",
                                                            ].join(" ")}
                                                        >
                                                            {receita > 0 ? percentBR(margem) : "-"}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
                                    {atendimentosPaginados.map((row) => {
                                        const lucro = Number(row.lucro_total ?? 0);
                                        const receita = Number(row.receita_total ?? 0);

                                        return (
                                            <button
                                                key={row.atendimento_id}
                                                type="button"
                                                onClick={() => void abrirDetalhe(row.atendimento_id)}
                                                className="block w-full p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
                                            >
                                                <div className="text-xs text-slate-400">
                                                    {dateBR(row.data_referencia)} · {safeText(row.convenio, "Sem convênio")}
                                                </div>
                                                <div className="mt-1 truncate font-semibold text-sky-700 dark:text-sky-300">
                                                    {safeText(row.falecido, `Atendimento #${row.atendimento_id}`)}
                                                </div>

                                                {(row.assistencia_ativa || row.tanatopraxia_ativa) ? (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {row.assistencia_ativa ? (
                                                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                                                Assistência
                                                            </span>
                                                        ) : null}
                                                        {row.tanatopraxia_ativa ? (
                                                            <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-medium text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300">
                                                                Tanatopraxia
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                ) : null}

                                                <div className="mt-3 grid grid-cols-3 gap-2">
                                                    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-900">
                                                        <div className="text-[10px] font-medium uppercase text-slate-400">Custo</div>
                                                        <div className="mt-1 text-xs font-semibold">{moneyBRL(row.custo_total)}</div>
                                                    </div>
                                                    <div className="rounded-xl bg-sky-50 p-2 dark:bg-sky-950/30">
                                                        <div className="text-[10px] font-medium uppercase text-sky-500">Receita</div>
                                                        <div className="mt-1 text-xs font-semibold text-sky-700 dark:text-sky-300">{moneyBRL(receita)}</div>
                                                    </div>
                                                    <div className={lucro >= 0 ? "rounded-xl bg-emerald-50 p-2 dark:bg-emerald-950/30" : "rounded-xl bg-rose-50 p-2 dark:bg-rose-950/30"}>
                                                        <div className={lucro >= 0 ? "text-[10px] font-medium uppercase text-emerald-500" : "text-[10px] font-medium uppercase text-rose-500"}>Retorno</div>
                                                        <div className={lucro >= 0 ? "mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300" : "mt-1 text-xs font-semibold text-rose-700 dark:text-rose-300"}>
                                                            {moneyBRL(lucro)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )

                    ) : saidasConsumoAgrupadas.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            Nenhuma saída encontrada para {areaAtual.label.toLocaleLowerCase("pt-BR")} no período selecionado.
                        </div>
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[980px] text-left text-sm">
                                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                                        <tr>
                                            <th className="px-5 py-3">Produto</th>
                                            <th className="px-5 py-3">Código</th>
                                            <th className="px-5 py-3 text-right">Qtd. total</th>
                                            <th className="px-5 py-3">Destino principal</th>
                                            <th className="px-5 py-3 text-right">Custo médio</th>
                                            <th className="px-5 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {saidasConsumoPaginadas.map((grupo) => {
                                            const expanded = expandedConsumoKey === grupo.chave;

                                            return (
                                                <React.Fragment key={grupo.chave}>
                                                    <tr
                                                        role="button"
                                                        tabIndex={0}
                                                        aria-expanded={expanded}
                                                        onClick={() =>
                                                            setExpandedConsumoKey((current) =>
                                                                current === grupo.chave ? null : grupo.chave,
                                                            )
                                                        }
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                setExpandedConsumoKey((current) =>
                                                                    current === grupo.chave ? null : grupo.chave,
                                                                );
                                                            }
                                                        }}
                                                        className="cursor-pointer transition hover:bg-slate-50/80 focus:bg-slate-50 focus:outline-none dark:hover:bg-slate-900/70 dark:focus:bg-slate-900/70"
                                                    >
                                                        <td className="px-5 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <span
                                                                    className={[
                                                                        "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs transition",
                                                                        expanded
                                                                            ? "rotate-90 border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                                                                            : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-950",
                                                                    ].join(" ")}
                                                                    aria-hidden="true"
                                                                >
                                                                    ›
                                                                </span>
                                                                <div className="min-w-0">
                                                                    <div className="font-medium text-slate-900 dark:text-white">
                                                                        {safeText(grupo.produto_nome, "Produto")}
                                                                    </div>
                                                                    <div className="mt-0.5 text-[11px] text-slate-400">
                                                                        {numberBR(grupo.movimentos)} lançamento(s) · {numberBR(grupo.dias.length)} dia(s)
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-4 text-slate-500 dark:text-slate-400">
                                                            {safeText(grupo.codigo_barras)}
                                                        </td>
                                                        <td className="px-5 py-4 text-right text-base font-semibold text-slate-900 dark:text-white">
                                                            {numberBR(grupo.quantidade_total)}
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <div className="max-w-[280px] truncate text-slate-700 dark:text-slate-200">
                                                                {grupo.destino_principal}
                                                            </div>
                                                            <div className="mt-0.5 text-[11px] text-slate-400">
                                                                {numberBR(grupo.destino_principal_quantidade)} unidade(s)
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-4 text-right">
                                                            {grupo.custo_medio == null
                                                                ? "Sem custo"
                                                                : moneyBRL(grupo.custo_medio)}
                                                        </td>
                                                        <td className="px-5 py-4 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                                                            {grupo.custo_total == null
                                                                ? "-"
                                                                : moneyBRL(grupo.custo_total)}
                                                        </td>
                                                    </tr>

                                                    {expanded ? (
                                                        <tr>
                                                            <td colSpan={6} className="bg-slate-50/70 px-5 py-4 dark:bg-slate-900/45">
                                                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                                                                    <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                                                                        <div>
                                                                            <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                                                                                Histórico de saídas
                                                                            </div>
                                                                            <div className="mt-1 text-xs text-slate-400">
                                                                                Quantidade consolidada por dia
                                                                            </div>
                                                                        </div>
                                                                        <div className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
                                                                            Maior destino: <span className="font-semibold">{grupo.destino_principal}</span>
                                                                            {" · "}
                                                                            {numberBR(grupo.destino_principal_quantidade)}
                                                                        </div>
                                                                    </div>

                                                                    <div className="overflow-x-auto">
                                                                        <table className="w-full min-w-[680px] text-left text-xs">
                                                                            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                                                                                <tr>
                                                                                    <th className="px-4 py-2.5">Data</th>
                                                                                    <th className="px-4 py-2.5 text-right">Quantidade</th>
                                                                                    <th className="px-4 py-2.5">Destino(s)</th>
                                                                                    <th className="px-4 py-2.5 text-right">Custo do dia</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                                                {grupo.dias.map((dia) => (
                                                                                    <tr key={`${grupo.chave}-${dia.data}`}>
                                                                                        <td className="whitespace-nowrap px-4 py-3">
                                                                                            {dia.data === "SEM_DATA" ? "-" : dateBR(dia.data)}
                                                                                        </td>
                                                                                        <td className="px-4 py-3 text-right font-semibold">
                                                                                            {numberBR(dia.quantidade)}
                                                                                        </td>
                                                                                        <td className="px-4 py-3">
                                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                                {dia.destinos.map((destino) => (
                                                                                                    <span
                                                                                                        key={`${dia.data}-${destino.destino}`}
                                                                                                        className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                                                                                    >
                                                                                                        {destino.destino} · {numberBR(destino.quantidade)}
                                                                                                    </span>
                                                                                                ))}
                                                                                            </div>
                                                                                        </td>
                                                                                        <td className="px-4 py-3 text-right text-emerald-700 dark:text-emerald-300">
                                                                                            {dia.custo_total == null ? "-" : moneyBRL(dia.custo_total)}
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : null}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
                                {saidasConsumoPaginadas.map((grupo) => {
                                    const expanded = expandedConsumoKey === grupo.chave;

                                    return (
                                        <div key={grupo.chave}>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setExpandedConsumoKey((current) =>
                                                        current === grupo.chave ? null : grupo.chave,
                                                    )
                                                }
                                                aria-expanded={expanded}
                                                className="block w-full p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className={[
                                                                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs transition",
                                                                    expanded
                                                                        ? "rotate-90 border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                                                                        : "border-slate-200 text-slate-400 dark:border-slate-700",
                                                                ].join(" ")}
                                                                aria-hidden="true"
                                                            >
                                                                ›
                                                            </span>
                                                            <div className="min-w-0">
                                                                <div className="truncate font-semibold text-slate-900 dark:text-white">
                                                                    {safeText(grupo.produto_nome, "Produto")}
                                                                </div>
                                                                <div className="mt-0.5 text-[11px] text-slate-400">
                                                                    CB: {safeText(grupo.codigo_barras)}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                                            <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-900">
                                                                <div className="text-[10px] uppercase text-slate-400">Qtd. total</div>
                                                                <div className="mt-1 text-base font-semibold">
                                                                    {numberBR(grupo.quantidade_total)}
                                                                </div>
                                                            </div>
                                                            <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-900">
                                                                <div className="text-[10px] uppercase text-slate-400">Total</div>
                                                                <div className="mt-1 text-base font-semibold text-emerald-700 dark:text-emerald-300">
                                                                    {grupo.custo_total == null ? "-" : moneyBRL(grupo.custo_total)}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="mt-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                                                            <div className="text-[10px] uppercase text-slate-400">Destino principal</div>
                                                            <div className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                                                                {grupo.destino_principal} · {numberBR(grupo.destino_principal_quantidade)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>

                                            {expanded ? (
                                                <div className="border-t border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                        Histórico por dia
                                                    </div>
                                                    <div className="space-y-2">
                                                        {grupo.dias.map((dia) => (
                                                            <div
                                                                key={`${grupo.chave}-${dia.data}`}
                                                                className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                                                            >
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                                                        {dia.data === "SEM_DATA" ? "-" : dateBR(dia.data)}
                                                                    </div>
                                                                    <div className="text-sm font-semibold">
                                                                        {numberBR(dia.quantidade)}
                                                                    </div>
                                                                </div>
                                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                                    {dia.destinos.map((destino) => (
                                                                        <span
                                                                            key={`${dia.data}-${destino.destino}`}
                                                                            className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                                                        >
                                                                            {destino.destino} · {numberBR(destino.quantidade)}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    <PaginationControls
                        currentPage={paginaAtual}
                        totalPages={totalPaginas}
                        totalItems={totalItensLista}
                        pageSize={pageSize}
                        onPageChange={(page) => {
                            setCurrentPage(page);
                            setExpandedConsumoKey(null);
                        }}
                    />
                </Card>
            </div>

            {selectedId !== null ? (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-5"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Detalhes do atendimento"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) fecharDetalhe();
                    }}
                >
                    <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-950 sm:rounded-3xl">
                        <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
                            <div className="min-w-0">
                                <h2 className="truncate text-xl font-semibold">
                                    {detail?.atendimento?.falecido || "Carregando..."}
                                </h2>
                                {detail?.atendimento ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {detail.atendimento.assistencia_ativa ? (
                                            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                                Assistência ativa
                                            </span>
                                        ) : null}
                                        {detail.atendimento.tanatopraxia_ativa ? (
                                            <span className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300">
                                                Tanatopraxia ativa
                                            </span>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            <button
                                type="button"
                                onClick={fecharDetalhe}
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 text-xl font-medium text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                                aria-label="Fechar"
                            >
                                ×
                            </button>
                        </div>

                        <div className="overflow-y-auto">
                            {detailLoading ? (
                                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
                                    <Spinner /> Carregando...
                                </div>
                            ) : detailError ? (
                                <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                                    {detailError}
                                </div>
                            ) : detail?.atendimento ? (
                                <>
                                    {detail.alertas?.length ? (
                                        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20 sm:px-5">
                                            {detail.alertas.map((alerta, index) => (
                                                <div key={`${index}-${alerta}`} className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                                                    {alerta}
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}

                                    <div className="hidden grid-cols-[minmax(0,1fr)_80px_110px_120px_120px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900 sm:grid">
                                        <div>Item</div>
                                        <div className="text-right">Qtd.</div>
                                        <div className="text-right">Custo</div>
                                        <div className="text-right">Receita</div>
                                        <div className="text-right">Retorno</div>
                                    </div>

                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {detailItens.length ? (
                                            detailItens.map((item, index) => {
                                                const custo = Number(item.subtotal ?? 0);
                                                const receita = Number(item.receita_total ?? 0);
                                                const lucro = Number(item.lucro_total ?? (receita - custo));
                                                const isServico = item.tipo_custo === "SERVICO_ATIVADO";

                                                return (
                                                    <div
                                                        key={`${item.tipo_custo}-${item.produto_id}-${item.codigo_barras}-${index}`}
                                                        className="px-4 py-4 sm:px-5"
                                                    >
                                                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_80px_110px_120px_120px] sm:items-center sm:gap-4">
                                                            <div className="min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                                                        {safeText(item.produto_nome, "Produto")}
                                                                    </div>
                                                                    {isServico ? (
                                                                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                                                                            Serviço ativo
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </div>

                                                            <div className="sm:text-right">
                                                                <div className="text-[10px] font-medium uppercase text-slate-400 sm:hidden">
                                                                    Quantidade
                                                                </div>
                                                                <div className="text-sm font-semibold">
                                                                    {numberBR(Number(item.quantidade ?? 1))}
                                                                </div>
                                                            </div>

                                                            <div className="sm:text-right">
                                                                <div className="text-[10px] font-medium uppercase text-slate-400 sm:hidden">
                                                                    Custo
                                                                </div>
                                                                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                                    {moneyBRL(custo)}
                                                                </div>
                                                            </div>

                                                            <div className="sm:text-right">
                                                                <div className="text-[10px] font-medium uppercase text-slate-400 sm:hidden">
                                                                    Receita
                                                                </div>
                                                                <div className="text-sm font-semibold text-sky-700 dark:text-sky-300">
                                                                    {moneyBRL(receita)}
                                                                </div>
                                                            </div>

                                                            <div className="sm:text-right">
                                                                <div className="text-[10px] font-medium uppercase text-slate-400 sm:hidden">
                                                                    Retorno
                                                                </div>
                                                                <div
                                                                    className={[
                                                                        "text-sm font-semibold",
                                                                        lucro >= 0
                                                                            ? "text-emerald-700 dark:text-emerald-300"
                                                                            : "text-rose-700 dark:text-rose-300",
                                                                    ].join(" ")}
                                                                >
                                                                    {lucro >= 0 ? "+" : ""}
                                                                    {moneyBRL(lucro)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="p-6 text-center text-sm text-slate-500">
                                                Nenhum item encontrado.
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                                                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                    Custo
                                                </div>
                                                <div className="mt-1 text-xl font-semibold">
                                                    {moneyBRL(detail.atendimento.custo_total)}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/60 dark:bg-sky-950/30">
                                                <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-500">
                                                    Receita
                                                </div>
                                                <div className="mt-1 text-xl font-semibold text-sky-700 dark:text-sky-300">
                                                    {moneyBRL(Number(detail.atendimento.receita_total ?? 0))}
                                                </div>
                                            </div>

                                            <div
                                                className={[
                                                    "rounded-2xl border p-4",
                                                    Number(detail.atendimento.lucro_total ?? 0) >= 0
                                                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30"
                                                        : "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30",
                                                ].join(" ")}
                                            >
                                                <div
                                                    className={[
                                                        "text-[10px] font-semibold uppercase tracking-wide",
                                                        Number(detail.atendimento.lucro_total ?? 0) >= 0
                                                            ? "text-emerald-500"
                                                            : "text-rose-500",
                                                    ].join(" ")}
                                                >
                                                    Retorno · {percentBR(Number(detail.atendimento.margem_lucro_percentual ?? 0))}
                                                </div>
                                                <div
                                                    className={[
                                                        "mt-1 text-xl font-semibold",
                                                        Number(detail.atendimento.lucro_total ?? 0) >= 0
                                                            ? "text-emerald-700 dark:text-emerald-300"
                                                            : "text-rose-700 dark:text-rose-300",
                                                    ].join(" ")}
                                                >
                                                    {moneyBRL(Number(detail.atendimento.lucro_total ?? 0))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}

        </main>
    );
}
