"use client";

import React, { useEffect, useMemo, useState } from "react";

/* =========================
   Tipos
========================= */
type GuiaStatus = "ativa" | "utilizada" | "expirada" | "cancelada" | "bloqueada";

type GuiaRow = {
    id: number;
    token: string;
    status: GuiaStatus;
    data_emissao: string;
    data_expiracao: string;
    data_utilizacao?: string | null;
    data_cancelamento?: string | null;
    associado_cpf: string;
    titular_nome: string;
    titular_cpf: string;
    contrato: string;
    plano_nome?: string | null;
    plano_id?: string | null;
    plano_codigo?: string | null;
    plano_status?: string | null;
    beneficiario_id_externo?: string | null;
    beneficiario_nome: string;
    beneficiario_tipo: "T" | "D" | "A" | "P" | "O";
    beneficiario_grau?: string | null;
    conveniado_id: string | number;
    conveniado_nome: string;
    conveniado_categoria?: string | null;
    conveniado_especialidade?: string | null;
    conveniado_unidade?: string | null;
    conveniado_endereco?: string | null;
    conveniado_cep?: string | null;
    conveniado_telefone?: string | null;
    conveniado_whatsapp?: string | null;
    conveniado_site?: string | null;
    origem_emissao?: string | null;
    created_at?: string;
    updated_at?: string;
};

type ApiListResponse = {
    ok: true;
    items: GuiaRow[];
};

type ApiError = {
    ok: false;
    error: string;
};

type Filtros = {
    dataInicio: string;
    dataFim: string;
    status: "" | GuiaStatus;
    conveniadoNome: string;
    titularNome: string;
    beneficiarioNome: string;
    cpf: string;
};

type ChartDatum = {
    label: string;
    value: number;
};

type StatusCountMap = Record<GuiaStatus, number>;

/* =========================
   Constantes
========================= */
const GUIAS_API_URL = "https://api.planoassistencialintegrado.com.br/guias.php";

const STATUS_LABELS: Record<GuiaStatus, string> = {
    ativa: "Ativa",
    utilizada: "Utilizada",
    expirada: "Expirada",
    cancelada: "Cancelada",
    bloqueada: "Bloqueada",
};

const STATUS_COLORS: Record<GuiaStatus, string> = {
    ativa: "#10b981",
    utilizada: "#3b82f6",
    expirada: "#f59e0b",
    cancelada: "#f43f5e",
    bloqueada: "#64748b",
};

/* =========================
   Helpers
========================= */
function fallback(value?: string | null) {
    const v = String(value ?? "").trim();
    return v || "—";
}

function onlyDigits(value?: string | null) {
    return String(value ?? "").replace(/\D+/g, "");
}

function fmtDatePtBr(date = new Date()) {
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
}

function fmtDateTimePtBr(dateString?: string | null) {
    if (!dateString) return "—";
    const d = new Date(String(dateString).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return fallback(dateString);

    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d);
}

function fmtDateIsoToPtBr(dateIso?: string) {
    if (!dateIso) return "—";
    const [y, m, d] = dateIso.split("-");
    if (!y || !m || !d) return dateIso;
    return `${d}/${m}/${y}`;
}

function toDateInputValue(date: Date) {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function startOfMonthInput() {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

function todayInput() {
    return toDateInputValue(new Date());
}

function isApiListResponse(v: unknown): v is ApiListResponse {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return o.ok === true && Array.isArray(o.items);
}

function compareDescByDate(a: GuiaRow, b: GuiaRow) {
    return new Date(String(b.data_emissao).replace(" ", "T")).getTime() - new Date(String(a.data_emissao).replace(" ", "T")).getTime();
}

function buildCsv(rows: GuiaRow[]) {
    const headers = [
        "ID",
        "Token",
        "Status",
        "Data Emissao",
        "Data Expiracao",
        "Associado CPF",
        "Titular Nome",
        "Titular CPF",
        "Contrato",
        "Plano",
        "Beneficiario",
        "Tipo Beneficiario",
        "Conveniado",
        "Categoria Conveniado",
        "Especialidade",
        "Unidade",
        "Endereco",
        "Telefone",
        "Whatsapp",
        "Origem Emissao",
    ];

    const escapeCsv = (value: unknown) => {
        const text = String(value ?? "");
        if (/[",;\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
        return text;
    };

    const lines = rows.map((row) =>
        [
            row.id,
            row.token,
            row.status,
            row.data_emissao,
            row.data_expiracao,
            row.associado_cpf,
            row.titular_nome,
            row.titular_cpf,
            row.contrato,
            row.plano_nome,
            row.beneficiario_nome,
            row.beneficiario_tipo,
            row.conveniado_nome,
            row.conveniado_categoria,
            row.conveniado_especialidade,
            row.conveniado_unidade,
            row.conveniado_endereco,
            row.conveniado_telefone,
            row.conveniado_whatsapp,
            row.origem_emissao,
        ]
            .map(escapeCsv)
            .join(";"),
    );

    return [headers.join(";"), ...lines].join("\n");
}

function downloadCsv(filename: string, rows: GuiaRow[]) {
    const csv = "\uFEFF" + buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
}

async function fetchGuiasPage(params: URLSearchParams): Promise<GuiaRow[]> {
    const response = await fetch(`${GUIAS_API_URL}?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });

    const raw: unknown = await response.json().catch(() => null);

    if (!response.ok) {
        const maybeErr = raw as ApiError | null;
        throw new Error(maybeErr?.error || "Erro ao carregar relatório.");
    }

    if (!isApiListResponse(raw)) {
        throw new Error("Resposta inválida do servidor.");
    }

    return raw.items;
}

async function fetchAllGuias(filters: Filtros): Promise<GuiaRow[]> {
    const pageSize = 500;
    const result: GuiaRow[] = [];

    for (let offset = 0; offset < 5000; offset += pageSize) {
        const params = new URLSearchParams();
        params.set("list", "1");
        params.set("limit", String(pageSize));
        params.set("offset", String(offset));

        if (filters.dataInicio) params.set("data_inicio", `${filters.dataInicio} 00:00:00`);
        if (filters.dataFim) params.set("data_fim", `${filters.dataFim} 23:59:59`);
        if (filters.status) params.set("status", filters.status);
        if (filters.conveniadoNome.trim()) params.set("conveniado_nome", filters.conveniadoNome.trim());
        if (filters.titularNome.trim()) params.set("titular_nome", filters.titularNome.trim());
        if (filters.beneficiarioNome.trim()) params.set("beneficiario_nome", filters.beneficiarioNome.trim());
        if (onlyDigits(filters.cpf)) params.set("cpf", onlyDigits(filters.cpf));

        const page = await fetchGuiasPage(params);
        result.push(...page);

        if (page.length < pageSize) break;
    }

    return result.sort(compareDescByDate);
}

/* =========================
   Componentes visuais
========================= */
function Card({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={[
                "rounded-3xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]",
                "dark:border-slate-800 dark:bg-slate-900",
                className,
            ].join(" ")}
        >
            {children}
        </div>
    );
}

function StatCard({
    title,
    value,
    subtitle,
}: {
    title: string;
    value: string | number;
    subtitle?: string;
}) {
    return (
        <Card className="p-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                {title}
            </p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                {value}
            </p>
            {subtitle ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
        </Card>
    );
}

function SectionTitle({
    title,
    subtitle,
}: {
    title: string;
    subtitle?: string;
}) {
    return (
        <div className="mb-4">
            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                {title}
            </h2>
            {subtitle ? (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {message}
        </div>
    );
}

function SimpleBarChart({
    data,
    color = "#039adc",
    height = 260,
}: {
    data: ChartDatum[];
    color?: string;
    height?: number;
}) {
    const max = Math.max(...data.map((d) => d.value), 1);

    if (!data.length) {
        return <EmptyState message="Sem dados para exibir neste gráfico." />;
    }

    return (
        <div className="overflow-x-auto">
            <div className="min-w-[560px]">
                <div
                    className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                    style={{ height }}
                >
                    {data.map((item) => {
                        const barHeight = Math.max((item.value / max) * (height - 90), 8);

                        return (
                            <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                    {item.value}
                                </span>

                                <div
                                    className="w-full rounded-t-xl transition-all"
                                    style={{
                                        height: `${barHeight}px`,
                                        background: color,
                                    }}
                                    title={`${item.label}: ${item.value}`}
                                />

                                <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
                                    {item.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function DonutChart({
    data,
}: {
    data: { label: string; value: number; color: string }[];
}) {
    const total = data.reduce((acc, item) => acc + item.value, 0);

    if (!total) {
        return <EmptyState message="Sem dados para exibir neste gráfico." />;
    }

    const radius = 62;
    const stroke = 22;
    const normalizedRadius = radius;
    const circumference = 2 * Math.PI * normalizedRadius;
    let cumulative = 0;

    return (
        <div className="grid gap-5 md:grid-cols-[220px_1fr] md:items-center">
            <div className="flex items-center justify-center">
                <div className="relative h-[180px] w-[180px]">
                    <svg
                        width="180"
                        height="180"
                        viewBox="0 0 180 180"
                        className="-rotate-90"
                    >
                        <circle
                            cx="90"
                            cy="90"
                            r={normalizedRadius}
                            stroke="#e2e8f0"
                            strokeWidth={stroke}
                            fill="transparent"
                        />
                        {data.map((item) => {
                            const fraction = item.value / total;
                            const dash = fraction * circumference;
                            const gap = circumference - dash;
                            const offset = -cumulative * circumference;
                            cumulative += fraction;

                            return (
                                <circle
                                    key={item.label}
                                    cx="90"
                                    cy="90"
                                    r={normalizedRadius}
                                    stroke={item.color}
                                    strokeWidth={stroke}
                                    strokeDasharray={`${dash} ${gap}`}
                                    strokeDashoffset={offset}
                                    strokeLinecap="butt"
                                    fill="transparent"
                                />
                            );
                        })}
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            Total
                        </span>
                        <span className="mt-1 text-3xl font-black text-slate-900 dark:text-white">
                            {total}
                        </span>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                {data.map((item) => {
                    const pct = total ? ((item.value / total) * 100).toFixed(1) : "0.0";

                    return (
                        <div
                            key={item.label}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950"
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <span
                                    className="h-3.5 w-3.5 rounded-full"
                                    style={{ backgroundColor: item.color }}
                                />
                                <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    {item.label}
                                </span>
                            </div>

                            <div className="text-right">
                                <div className="text-sm font-black text-slate-900 dark:text-white">
                                    {item.value}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {pct}%
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* =========================
   Página
========================= */
export default function RelatorioGuiasPage() {
    const [filters, setFilters] = useState<Filtros>({
        dataInicio: startOfMonthInput(),
        dataFim: todayInput(),
        status: "",
        conveniadoNome: "",
        titularNome: "",
        beneficiarioNome: "",
        cpf: "",
    });

    const [items, setItems] = useState<GuiaRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChangeFilter = (key: keyof Filtros, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const rows = await fetchAllGuias(filters);
            setItems(rows);
        } catch (err) {
            setItems([]);
            setError(err instanceof Error ? err.message : "Erro ao carregar relatório.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resumo = useMemo(() => {
        const total = items.length;

        const statusMap: StatusCountMap = {
            ativa: 0,
            utilizada: 0,
            expirada: 0,
            cancelada: 0,
            bloqueada: 0,
        };

        const porConvenioMap = new Map<string, number>();
        const porDiaMap = new Map<string, number>();
        const porCategoriaMap = new Map<string, number>();
        const porPlanoMap = new Map<string, number>();

        for (const row of items) {
            statusMap[row.status] += 1;

            const convenio = fallback(row.conveniado_nome);
            porConvenioMap.set(convenio, (porConvenioMap.get(convenio) || 0) + 1);

            const categoria = fallback(row.conveniado_categoria);
            porCategoriaMap.set(categoria, (porCategoriaMap.get(categoria) || 0) + 1);

            const plano = fallback(row.plano_nome);
            porPlanoMap.set(plano, (porPlanoMap.get(plano) || 0) + 1);

            const d = String(row.data_emissao || "").slice(0, 10);
            if (d) porDiaMap.set(d, (porDiaMap.get(d) || 0) + 1);
        }

        const topConvenios = [...porConvenioMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([label, value]) => ({ label, value }));

        const porDia = [...porDiaMap.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-10)
            .map(([label, value]) => ({
                label: fmtDateIsoToPtBr(label),
                value,
            }));

        const porCategoria = [...porCategoriaMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([label, value]) => ({ label, value }));

        const porPlano = [...porPlanoMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([label, value]) => ({ label, value }));

        const statusDonut = (Object.keys(statusMap) as GuiaStatus[]).map((key) => ({
            label: STATUS_LABELS[key],
            value: statusMap[key],
            color: STATUS_COLORS[key],
        }));

        const conveniosUnicos = porConvenioMap.size;
        const maisUsado = topConvenios[0];
        const ticketsDia = porDiaMap.size ? (total / porDiaMap.size).toFixed(1) : "0";

        return {
            total,
            statusMap,
            statusDonut,
            topConvenios,
            porDia,
            porCategoria,
            porPlano,
            conveniosUnicos,
            maisUsado,
            ticketsDia,
        };
    }, [items]);

    const ultimasGuias = useMemo(() => items.slice(0, 12), [items]);

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-6 font-[Nunito] dark:bg-slate-950 md:px-8">
            <div className="mx-auto max-w-7xl">
                <header className="mb-6">
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                        Relatório de Guias
                    </h1>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Acompanhe emissões, convênios mais utilizados, distribuição por status e evolução por período.
                    </p>
                </header>

                <Card className="mb-6 p-5 md:p-6">
                    <SectionTitle
                        title="Filtros"
                        subtitle="Use os filtros abaixo para consultar as guias emitidas no período desejado."
                    />

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <FilterField label="Data inicial">
                            <input
                                type="date"
                                value={filters.dataInicio}
                                onChange={(e) => handleChangeFilter("dataInicio", e.target.value)}
                                className={inputClassName}
                            />
                        </FilterField>

                        <FilterField label="Data final">
                            <input
                                type="date"
                                value={filters.dataFim}
                                onChange={(e) => handleChangeFilter("dataFim", e.target.value)}
                                className={inputClassName}
                            />
                        </FilterField>

                        <FilterField label="Status">
                            <select
                                value={filters.status}
                                onChange={(e) => handleChangeFilter("status", e.target.value)}
                                className={inputClassName}
                            >
                                <option value="">Todos</option>
                                <option value="ativa">Ativa</option>
                                <option value="utilizada">Utilizada</option>
                                <option value="expirada">Expirada</option>
                                <option value="cancelada">Cancelada</option>
                                <option value="bloqueada">Bloqueada</option>
                            </select>
                        </FilterField>

                        <FilterField label="CPF do associado">
                            <input
                                type="text"
                                value={filters.cpf}
                                onChange={(e) => handleChangeFilter("cpf", e.target.value)}
                                placeholder="Somente números"
                                className={inputClassName}
                            />
                        </FilterField>

                        <FilterField label="Convênio">
                            <input
                                type="text"
                                value={filters.conveniadoNome}
                                onChange={(e) => handleChangeFilter("conveniadoNome", e.target.value)}
                                placeholder="Nome do convênio"
                                className={inputClassName}
                            />
                        </FilterField>

                        <FilterField label="Titular">
                            <input
                                type="text"
                                value={filters.titularNome}
                                onChange={(e) => handleChangeFilter("titularNome", e.target.value)}
                                placeholder="Nome do titular"
                                className={inputClassName}
                            />
                        </FilterField>

                        <FilterField label="Beneficiário">
                            <input
                                type="text"
                                value={filters.beneficiarioNome}
                                onChange={(e) => handleChangeFilter("beneficiarioNome", e.target.value)}
                                placeholder="Nome do beneficiário"
                                className={inputClassName}
                            />
                        </FilterField>

                        <div className="flex flex-col justify-end gap-3 sm:col-span-2 xl:col-span-1">
                            <button
                                type="button"
                                onClick={loadData}
                                disabled={loading}
                                className="rounded-2xl bg-[#039adc] px-4 py-3 text-sm font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
                            >
                                {loading ? "Carregando..." : "Aplicar filtros"}
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                const reset: Filtros = {
                                    dataInicio: startOfMonthInput(),
                                    dataFim: todayInput(),
                                    status: "",
                                    conveniadoNome: "",
                                    titularNome: "",
                                    beneficiarioNome: "",
                                    cpf: "",
                                };
                                setFilters(reset);
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            Limpar filtros
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                downloadCsv(
                                    `relatorio-guias-${filters.dataInicio || "inicio"}-${filters.dataFim || "fim"}.csv`,
                                    items,
                                )
                            }
                            disabled={!items.length}
                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                        >
                            Exportar CSV
                        </button>
                    </div>
                </Card>

                {error ? (
                    <Card className="mb-6 p-6">
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-100">
                            {error}
                        </div>
                    </Card>
                ) : null}

                <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <StatCard title="Total de guias" value={resumo.total} subtitle="No filtro atual" />
                    <StatCard title="Guias ativas" value={resumo.statusMap.ativa} />
                    <StatCard title="Guias utilizadas" value={resumo.statusMap.utilizada} />
                    <StatCard title="Convênios únicos" value={resumo.conveniosUnicos} />
                    <StatCard
                        title="Média por dia"
                        value={resumo.ticketsDia}
                        subtitle="Considerando dias com emissão"
                    />
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                    <Card className="p-5 md:p-6">
                        <SectionTitle
                            title="Distribuição por status"
                            subtitle="Quantidade de guias em cada situação."
                        />
                        <DonutChart data={resumo.statusDonut} />
                    </Card>

                    <Card className="p-5 md:p-6">
                        <SectionTitle
                            title="Top convênios"
                            subtitle="Convênios com mais emissões no período."
                        />
                        <SimpleBarChart data={resumo.topConvenios} color="#039adc" />
                    </Card>

                    <Card className="p-5 md:p-6">
                        <SectionTitle
                            title="Emissões por dia"
                            subtitle="Últimos dias com emissão dentro do filtro selecionado."
                        />
                        <SimpleBarChart data={resumo.porDia} color="#14b8a6" />
                    </Card>

                    <Card className="p-5 md:p-6">
                        <SectionTitle
                            title="Por categoria de convênio"
                            subtitle="Ranking das categorias mais acionadas."
                        />
                        <SimpleBarChart data={resumo.porCategoria} color="#8b5cf6" />
                    </Card>

                    <Card className="p-5 md:p-6 xl:col-span-2">
                        <SectionTitle
                            title="Planos mais emitidos"
                            subtitle="Distribuição por nome do plano registrado na guia."
                        />
                        <SimpleBarChart data={resumo.porPlano} color="#f97316" />
                    </Card>
                </div>

                <Card className="mt-6 p-5 md:p-6">
                    <SectionTitle
                        title="Últimas guias emitidas"
                        subtitle="Visualização rápida das emissões mais recentes."
                    />

                    {loading ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                            Carregando relatório...
                        </div>
                    ) : !ultimasGuias.length ? (
                        <EmptyState message="Nenhuma guia encontrada com os filtros atuais." />
                    ) : (
                        <>
                            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block dark:border-slate-800">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-50 dark:bg-slate-950">
                                            <tr className="text-left text-slate-500 dark:text-slate-400">
                                                <th className="px-4 py-3 font-bold">Emissão</th>
                                                <th className="px-4 py-3 font-bold">Beneficiário</th>
                                                <th className="px-4 py-3 font-bold">Titular</th>
                                                <th className="px-4 py-3 font-bold">Convênio</th>
                                                <th className="px-4 py-3 font-bold">Plano</th>
                                                <th className="px-4 py-3 font-bold">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ultimasGuias.map((row) => (
                                                <tr
                                                    key={row.id}
                                                    className="border-t border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-200"
                                                >
                                                    <td className="px-4 py-3">{fmtDateTimePtBr(row.data_emissao)}</td>
                                                    <td className="px-4 py-3">{fallback(row.beneficiario_nome)}</td>
                                                    <td className="px-4 py-3">{fallback(row.titular_nome)}</td>
                                                    <td className="px-4 py-3">{fallback(row.conveniado_nome)}</td>
                                                    <td className="px-4 py-3">{fallback(row.plano_nome)}</td>
                                                    <td className="px-4 py-3">
                                                        <StatusBadge status={row.status} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="space-y-3 md:hidden">
                                {ultimasGuias.map((row) => (
                                    <div
                                        key={row.id}
                                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-black text-slate-900 dark:text-white">
                                                    {fallback(row.beneficiario_nome)}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                    {fmtDateTimePtBr(row.data_emissao)}
                                                </p>
                                            </div>
                                            <StatusBadge status={row.status} />
                                        </div>

                                        <div className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                                            <p>
                                                <strong>Titular:</strong> {fallback(row.titular_nome)}
                                            </p>
                                            <p>
                                                <strong>Convênio:</strong> {fallback(row.conveniado_nome)}
                                            </p>
                                            <p>
                                                <strong>Plano:</strong> {fallback(row.plano_nome)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </Card>
            </div>
        </main>
    );
}

function FilterField({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                {label}
            </span>
            {children}
        </label>
    );
}

function StatusBadge({ status }: { status: GuiaStatus }) {
    const palette: Record<GuiaStatus, string> = {
        ativa: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200",
        utilizada: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200",
        expirada: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200",
        cancelada: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200",
        bloqueada: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    };

    return (
        <span
            className={[
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.18em]",
                palette[status],
            ].join(" ")}
        >
            {STATUS_LABELS[status]}
        </span>
    );
}

const inputClassName =
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#039adc] focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-950/40";