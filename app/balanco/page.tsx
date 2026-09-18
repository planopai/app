"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/balanco.php`;

type Periodo = { inicio: string; fim: string };
type Preset = "HOJE" | "SEMANA" | "MES" | "ANO" | "PERSONALIZADO";

type Resumo = {
    total_gasto: number;
    custo_direto: number;
    custo_consumiveis_estimado: number;
    custo_ornamentacao: number;
    atendimentos: number;
    custo_medio_atendimento: number;
    itens_utilizados: number;
    movimentos_saida: number;
};

type AtendimentoRow = {
    atendimento_id: number;
    falecido: string;
    convenio: string;
    data_referencia: string;
    custo_total: number;
};

type ConvenioOption = {
    value: string;
    label: string;
};

type BalancoResponse = {
    ok: boolean;
    need_login?: 1;
    msg?: string;
    periodo?: Periodo;
    filtro_convenio?: string;
    convenios_disponiveis?: ConvenioOption[];
    resumo?: Resumo;
    atendimentos?: AtendimentoRow[];
};

type DetalheItem = {
    tipo_custo: "BAIXA_ESTOQUE" | "CONSUMIVEL_ESTIMADO" | "ORNAMENTACAO";
    produto_id: number;
    produto_nome: string;
    codigo_barras: string;
    subtotal: number;
};

type DetalheAtendimento = {
    id: number;
    falecido: string;
    convenio: string;
    data_referencia: string;
    custo_total: number;
};

type DetalheResponse = {
    ok: boolean;
    need_login?: 1;
    msg?: string;
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
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {label}
            </div>
            <div className="mt-2 break-words text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
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

export default function BalancoPage() {
    const initialPeriodo = useMemo(() => periodoPreset("MES"), []);

    const [inicio, setInicio] = useState(initialPeriodo.inicio);
    const [fim, setFim] = useState(initialPeriodo.fim);
    const [convenio, setConvenio] = useState("");
    const [preset, setPreset] = useState<Preset>("MES");

    const [draftInicio, setDraftInicio] = useState(initialPeriodo.inicio);
    const [draftFim, setDraftFim] = useState(initialPeriodo.fim);
    const [draftConvenio, setDraftConvenio] = useState("");
    const [draftPreset, setDraftPreset] = useState<Preset>("MES");
    const [filtersOpen, setFiltersOpen] = useState(false);

    const [data, setData] = useState<BalancoResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<DetalheResponse | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");

    const requestSeq = useRef(0);
    const detailSeq = useRef(0);

    async function carregarBalanco(
        nextInicio = inicio,
        nextFim = fim,
        nextConvenio = convenio,
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
            if (nextConvenio) url.searchParams.set("convenio", nextConvenio);
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
        setDraftConvenio(convenio);
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
        setConvenio(draftConvenio);
        setPreset(draftPreset);
        setFiltersOpen(false);
        fecharDetalhe();
        void carregarBalanco(draftInicio, draftFim, draftConvenio);
    }

    function limparFiltros() {
        const periodo = periodoPreset("MES");
        setDraftPreset("MES");
        setDraftInicio(periodo.inicio);
        setDraftFim(periodo.fim);
        setDraftConvenio("");
    }

    useEffect(() => {
        void carregarBalanco(initialPeriodo.inicio, initialPeriodo.fim, "");
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

    const resumo: Resumo = data?.resumo ?? {
        total_gasto: 0,
        custo_direto: 0,
        custo_consumiveis_estimado: 0,
        custo_ornamentacao: 0,
        atendimentos: 0,
        custo_medio_atendimento: 0,
        itens_utilizados: 0,
        movimentos_saida: 0,
    };

    const convenios = data?.convenios_disponiveis ?? [];
    const detailItens = detail?.itens ?? [];

    return (
        <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
            <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6 lg:p-8">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Balanço</h1>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={filtersOpen ? () => setFiltersOpen(false) : abrirFiltros}
                            className={[
                                "grid h-10 w-10 place-items-center rounded-xl border shadow-sm transition",
                                filtersOpen || convenio || preset !== "MES"
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
                                        "rounded-xl px-4 py-2 text-sm font-bold transition",
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
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Data inicial</span>
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
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Data final</span>
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

                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Convênio</span>
                                <select
                                    value={draftConvenio}
                                    onChange={(e) => setDraftConvenio(e.target.value)}
                                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
                                >
                                    <option value="">Todos</option>
                                    {convenios.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={limparFiltros}
                                className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                Limpar
                            </button>
                            <button
                                type="button"
                                onClick={aplicarFiltros}
                                disabled={loading}
                                className="h-10 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
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
                    <SummaryCard label="Gasto total" value={moneyBRL(resumo.total_gasto)} />
                    <SummaryCard label="Atendimentos" value={numberBR(resumo.atendimentos)} />
                    <SummaryCard label="Custo médio" value={moneyBRL(resumo.custo_medio_atendimento)} />
                    <SummaryCard label="Itens com baixa" value={numberBR(resumo.itens_utilizados)} />
                </div>

                <Card className="overflow-hidden">
                    <div className="border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h2 className="text-lg font-black">Atendimentos</h2>
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar falecido ou convênio"
                                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 sm:max-w-sm"
                            />
                        </div>
                    </div>

                    {loading && !data ? (
                        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
                            <Spinner /> Carregando...
                        </div>
                    ) : atendimentosFiltrados.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            Nenhum atendimento encontrado.
                        </div>
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[760px] text-left text-sm">
                                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                                        <tr>
                                            <th className="px-5 py-3">Data</th>
                                            <th className="px-5 py-3">Convênio</th>
                                            <th className="px-5 py-3">Falecido</th>
                                            <th className="px-5 py-3 text-right">Total gasto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {atendimentosFiltrados.map((row) => (
                                            <tr key={row.atendimento_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/70">
                                                <td className="px-5 py-4 whitespace-nowrap">{dateBR(row.data_referencia)}</td>
                                                <td className="px-5 py-4">{safeText(row.convenio, "Sem convênio")}</td>
                                                <td className="px-5 py-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => void abrirDetalhe(row.atendimento_id)}
                                                        className="font-black text-sky-700 hover:underline dark:text-sky-300"
                                                    >
                                                        {safeText(row.falecido, `Atendimento #${row.atendimento_id}`)}
                                                    </button>
                                                </td>
                                                <td className="px-5 py-4 text-right font-black text-emerald-700 dark:text-emerald-300">
                                                    {moneyBRL(row.custo_total)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
                                {atendimentosFiltrados.map((row) => (
                                    <button
                                        key={row.atendimento_id}
                                        type="button"
                                        onClick={() => void abrirDetalhe(row.atendimento_id)}
                                        className="block w-full p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs text-slate-400">
                                                    {dateBR(row.data_referencia)} · {safeText(row.convenio, "Sem convênio")}
                                                </div>
                                                <div className="mt-1 truncate font-black text-sky-700 dark:text-sky-300">
                                                    {safeText(row.falecido, `Atendimento #${row.atendimento_id}`)}
                                                </div>
                                            </div>
                                            <div className="shrink-0 font-black text-emerald-700 dark:text-emerald-300">
                                                {moneyBRL(row.custo_total)}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
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
                    <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-950 sm:rounded-3xl">
                        <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
                            <h2 className="min-w-0 truncate text-xl font-black">
                                {detail?.atendimento?.falecido || "Carregando..."}
                            </h2>
                            <button
                                type="button"
                                onClick={fecharDetalhe}
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 text-xl font-bold text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
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
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {detailItens.length ? (
                                            detailItens.map((item, index) => (
                                                <div
                                                    key={`${item.tipo_custo}-${item.produto_id}-${item.codigo_barras}-${index}`}
                                                    className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm font-bold text-slate-900 dark:text-white">
                                                            {safeText(item.produto_nome, "Produto")}
                                                        </div>
                                                        <div className="mt-0.5 text-xs text-slate-400">
                                                            CB: {safeText(item.codigo_barras)}
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 text-right text-sm font-black text-emerald-700 dark:text-emerald-300">
                                                        {moneyBRL(item.subtotal)}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-6 text-center text-sm text-slate-500">
                                                Nenhum item encontrado.
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
                                        <span className="font-black">Total</span>
                                        <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                                            {moneyBRL(detail.atendimento.custo_total)}
                                        </span>
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
