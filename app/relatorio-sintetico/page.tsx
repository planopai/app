"use client";

import React, { useEffect, useMemo, useState } from "react";

type ID = number;

type Deposito = { id: ID; nome: string };
type Categoria = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em?: string };
type Fabricante = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em?: string };
type Classificacao = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em?: string };

type Produto = {
    id: ID;
    nome: string;
    descricao?: string | null;
    codigo_barras: string;
    valor: string | number;
    preco_custo?: string | number | null;
    minimo: number;
    maximo?: number;
    foto_url?: string | null;
    ativo: 0 | 1 | number;
    atualizado_em?: string;
    categoria_id?: ID | null;
    fabricante_id?: ID | null;
    classificacao_id?: ID | null;
    categoria_nome?: string | null;
    fabricante_nome?: string | null;
    classificacao_nome?: string | null;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number;
    minimo: number;
    maximo: number;
    atualizado_em?: string;
};

type InitResp = {
    ok: boolean;
    depositos: Deposito[];
    categorias: Categoria[];
    fabricantes: Fabricante[];
    classificacoes: Classificacao[];
    produtos: Produto[];
    saldos: Saldo[];
    msg?: string;
    need_login?: 1;
};

type LoteRow = {
    id: number;
    produto_id: ID;
    deposito_id: ID;
    numero_lote: string;
    custo_unitario: string | number;
    quantidade_inicial: number;
    quantidade_atual: number;
    criado_em?: string | null;
    atualizado_em?: string | null;
    produto_nome?: string | null;
    codigo_barras?: string | null;
    deposito_nome?: string | null;
    custo_total_atual?: string | number | null;
    is_sintetico_sem_lote?: boolean;
};

type LotesResp = {
    ok: boolean;
    rows: LoteRow[];
    msg?: string;
    need_login?: 1;
};

type HistoricoRow = {
    id: number;
    tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "AJUSTE" | "CADASTRO_PRODUTO" | string;
    produto_id: ID;
    codigo_barras_snapshot?: string | null;
    quantidade: number | null;
    deposito_origem_id: ID | null;
    deposito_destino_id: ID | null;
    destino_texto?: string | null;
    solicitante_usuario_id?: ID | null;
    operador_usuario_id?: ID | null;
    observacao?: string | null;
    criado_em: string;
    produto_nome?: string | null;
    operador_nome?: string | null;
    solicitante_nome?: string | null;
    deposito_origem_nome?: string | null;
    deposito_destino_nome?: string | null;
};

type HistoricoResp = {
    ok: boolean;
    rows: HistoricoRow[];
    msg?: string;
    need_login?: 1;
};

type ModoRelatorio = "estoque" | "consumo";
type PeriodoConsumo = "dia" | "semana" | "mes" | "ano" | "personalizado";
type VisaoRelatorio = "produto_deposito" | "produto";

type PeriodoRange = {
    inicio: Date | null;
    fim: Date | null;
    dias: number;
    label: string;
};

type ReportRow = {
    key: string;
    produto_id: ID;
    produto_nome: string;
    codigo_barras: string;
    deposito_id: ID | null;
    deposito_nome: string;
    categoria_nome: string;
    fabricante_nome: string;
    classificacao_nome: string;
    quantidade: number;
    valor_total: number;
    custo_medio: number;
    custo_min: number;
    custo_max: number;
    lotes_ativos: number;
    qtd_sem_lote: number;
};

type ConsumoRow = {
    key: string;
    produto_id: ID;
    produto_nome: string;
    codigo_barras: string;
    deposito_id: ID | null;
    deposito_nome: string;
    categoria_nome: string;
    fabricante_nome: string;
    classificacao_nome: string;
    consumo_total: number;
    saidas: number;
    media_dia: number;
    projecao_semana: number;
    projecao_mes: number;
    projecao_ano: number;
    estoque_atual: number;
    custo_medio: number;
    valor_consumido_estimado: number;
    dias_cobertura: number | null;
    sugestao_compra: number;
    ultima_saida?: string | null;
};

type ChartDatum = {
    label: string;
    value: number;
    hint?: string;
};

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/materiais_gerais.php`;
const CHART_COLORS = ["#d79a00", "#f97316", "#c2410c", "#14b8a6", "#0f766e", "#7c3aed", "#c026d3", "#64748b"];

function num(v: unknown): number {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v ?? "").trim();
    if (!s) return 0;

    const cleaned = s
        .replace(/R\$/gi, "")
        .replace(/\s/g, "")
        .replace(/[^0-9,.-]/g, "");

    if (!cleaned) return 0;

    if (cleaned.includes(",")) {
        const br = cleaned.replace(/\./g, "").replace(",", ".");
        const n = Number(br);
        return Number.isFinite(n) ? n : 0;
    }

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
}

function clampInt(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

function moneyBRL(n: number): string {
    try {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(Number.isFinite(n) ? n : 0);
    } catch {
        return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
    }
}

function compactMoneyBRL(n: number): string {
    const safe = Number.isFinite(n) ? n : 0;
    if (Math.abs(safe) >= 1000000) return `${moneyBRL(safe / 1000000)} mi`;
    if (Math.abs(safe) >= 1000) return `${moneyBRL(safe / 1000)} mil`;
    return moneyBRL(safe);
}

function intBR(n: number): string {
    try {
        return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
    } catch {
        return String(n);
    }
}

function fmtDateTime(iso?: string | null): string {
    if (!iso) return "";
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date(iso));
    } catch {
        return String(iso);
    }
}

function toDateSafe(v?: string | null): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
}

function dateInputValue(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number): Date {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    return next;
}

function parseInputDate(v: string, end = false): Date | null {
    if (!v) return null;
    const [y, m, d] = v.split("-").map((x) => Number(x));
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return end ? endOfLocalDay(dt) : startOfLocalDay(dt);
}

function diffDaysInclusive(inicio: Date | null, fim: Date | null): number {
    if (!inicio || !fim) return 1;
    const a = startOfLocalDay(inicio).getTime();
    const b = startOfLocalDay(fim).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
    return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}

function getPeriodoRange(periodo: PeriodoConsumo, dataIni: string, dataFim: string): PeriodoRange {
    const hoje = new Date();
    const fimHoje = endOfLocalDay(hoje);

    if (periodo === "dia") {
        const inicio = startOfLocalDay(hoje);
        return { inicio, fim: fimHoje, dias: 1, label: "Hoje" };
    }

    if (periodo === "semana") {
        const inicio = startOfLocalDay(addDays(hoje, -6));
        return { inicio, fim: fimHoje, dias: 7, label: "Últimos 7 dias" };
    }

    if (periodo === "mes") {
        const inicio = startOfLocalDay(addDays(hoje, -29));
        return { inicio, fim: fimHoje, dias: 30, label: "Últimos 30 dias" };
    }

    if (periodo === "ano") {
        const inicio = startOfLocalDay(addDays(hoje, -364));
        return { inicio, fim: fimHoje, dias: 365, label: "Últimos 365 dias" };
    }

    const inicio = parseInputDate(dataIni, false);
    const fim = parseInputDate(dataFim, true);

    if (inicio && fim) {
        return { inicio, fim, dias: diffDaysInclusive(inicio, fim), label: `${dataIni} até ${dataFim}` };
    }

    if (inicio && !fim) {
        return { inicio, fim: fimHoje, dias: diffDaysInclusive(inicio, fimHoje), label: `${dataIni} até hoje` };
    }

    if (!inicio && fim) {
        return { inicio: null, fim, dias: 1, label: `Até ${dataFim}` };
    }

    return { inicio: null, fim: null, dias: 1, label: "Todo histórico carregado" };
}

function isWithinRange(iso: string, range: PeriodoRange): boolean {
    const d = toDateSafe(iso);
    if (!d) return false;
    if (range.inicio && d < range.inicio) return false;
    if (range.fim && d > range.fim) return false;
    return true;
}

function escapeCsvCell(v: unknown, sep = ";"): string {
    const s = String(v ?? "");
    const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(sep);
    const escaped = s.replace(/"/g, '""');
    return mustQuote ? `"${escaped}"` : escaped;
}

async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(
            `Resposta inesperada (${ct || "sem content-type"}). ${txt ? `Conteúdo: ${txt.slice(0, 160)}...` : ""}`.trim()
        );
    }
    return (await r.json()) as T;
}

async function apiGet<T>(qs: Record<string, string | number | boolean | undefined>) {
    const u = new URL(API_BASE, window.location.origin);
    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined) return;
        u.searchParams.set(k, String(v));
    });

    const r = await fetch(u.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });

    return await safeJson<T>(r);
}

function dashboardBg(): React.CSSProperties {
    return {
        backgroundColor: "#f8fafc",
        backgroundImage:
            "radial-gradient(circle at 18px 18px, rgba(15,23,42,0.045) 1.2px, transparent 1.2px), linear-gradient(135deg, rgba(148,163,184,0.16) 25%, transparent 25%), linear-gradient(225deg, rgba(148,163,184,0.12) 25%, transparent 25%)",
        backgroundSize: "36px 36px, 32px 32px, 32px 32px",
        backgroundPosition: "0 0, 0 0, 0 0",
    };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
        </label>
    );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none sm:text-sm",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className || "",
            ].join(" ")}
        />
    );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none sm:text-sm",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className || "",
            ].join(" ")}
        />
    );
}

function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" }) {
    const base =
        "inline-flex items-center justify-center rounded-xl px-3 py-2 text-[16px] font-semibold shadow-sm outline-none sm:text-sm " +
        "focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50";

    const cls =
        variant === "solid"
            ? "border border-slate-950 bg-slate-950 text-white hover:bg-slate-800"
            : variant === "soft"
                ? "border border-slate-200 bg-slate-100 text-slate-950 hover:bg-slate-200"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-3xl border border-slate-200 bg-white/95 shadow-sm", className].join(" ")}>{children}</section>;
}

function MetricIcon({ type }: { type: "money" | "avg" | "stock" | "consume" | "buy" | "cover" }) {
    const common = "h-12 w-12 text-white/88";
    if (type === "money") {
        return (
            <svg className={common} viewBox="0 0 64 64" fill="none">
                <rect x="10" y="16" width="44" height="32" rx="4" stroke="currentColor" strokeWidth="4" />
                <path d="M18 26h28M18 38h20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                <circle cx="44" cy="38" r="4" fill="currentColor" />
            </svg>
        );
    }
    if (type === "avg") {
        return (
            <svg className={common} viewBox="0 0 64 64" fill="none">
                <path d="M12 48l12-18 10 10 18-26" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M45 14h7v7" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    if (type === "stock") {
        return (
            <svg className={common} viewBox="0 0 64 64" fill="none">
                <path d="M14 20l18-10 18 10v24L32 54 14 44V20z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
                <path d="M14 20l18 10 18-10M32 30v24" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
        );
    }
    if (type === "consume") {
        return (
            <svg className={common} viewBox="0 0 64 64" fill="none">
                <path d="M16 14h32M20 22h24M24 30h16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                <path d="M20 42c7-8 17-8 24 0M24 50c5-4 11-4 16 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
        );
    }
    if (type === "buy") {
        return (
            <svg className={common} viewBox="0 0 64 64" fill="none">
                <path d="M14 18h8l5 24h20l5-16H25" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="30" cy="50" r="4" fill="currentColor" />
                <circle cx="46" cy="50" r="4" fill="currentColor" />
            </svg>
        );
    }
    return (
        <svg className={common} viewBox="0 0 64 64" fill="none">
            <path d="M18 12h28v8c0 7-6 12-14 12S18 27 18 20v-8z" stroke="currentColor" strokeWidth="4" />
            <path d="M22 52h20M32 32v20M22 40h20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
    );
}

function MetricTile({
    label,
    value,
    hint,
    icon,
    gradient,
}: {
    label: string;
    value: string;
    hint: string;
    icon: "money" | "avg" | "stock" | "consume" | "buy" | "cover";
    gradient: string;
}) {
    return (
        <div className="relative min-h-[132px] overflow-hidden rounded-none p-4 text-white shadow-sm" style={{ background: gradient }}>
            <div className="relative z-10">
                <div className="text-[11px] font-bold uppercase tracking-wide text-white/95">{label}</div>
                <div className="mt-2 text-2xl font-black tracking-tight sm:text-[26px]">{value}</div>
                <div className="mt-1 text-[11px] font-medium text-white/85">{hint}</div>
            </div>
            <div className="absolute bottom-2 right-3 opacity-65">
                <MetricIcon type={icon} />
            </div>
            <div className="absolute -bottom-7 -right-8 h-24 w-24 rounded-full bg-white/10" />
        </div>
    );
}

function MiniBarChart({ data, valueFormatter = intBR }: { data: ChartDatum[]; valueFormatter?: (n: number) => string }) {
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <div className="flex h-56 items-end gap-2 px-2 pt-3">
            {data.length === 0 ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">Sem dados para o período.</div>
            ) : (
                data.map((d, idx) => {
                    const h = Math.max(4, (d.value / max) * 100);
                    return (
                        <div key={`${d.label}-${idx}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                            <div className="text-[10px] font-bold text-slate-500">{valueFormatter(d.value)}</div>
                            <div className="w-full max-w-[24px] rounded-t-sm" style={{ height: `${h}%`, backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                            <div className="w-full truncate text-center text-[10px] text-slate-500" title={d.label}>
                                {d.label}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

function HorizontalBarChart({ data, valueFormatter = intBR }: { data: ChartDatum[]; valueFormatter?: (n: number) => string }) {
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <div className="space-y-3 p-3">
            {data.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-slate-400">Sem dados para exibir.</div>
            ) : (
                data.map((d, idx) => (
                    <div key={`${d.label}-${idx}`} className="grid grid-cols-[110px_1fr_72px] items-center gap-2 text-xs sm:grid-cols-[150px_1fr_86px]">
                        <div className="truncate text-slate-600" title={d.label}>{d.label}</div>
                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-3 rounded-full" style={{ width: `${Math.max(4, (d.value / max) * 100)}%`, backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                        </div>
                        <div className="text-right font-bold text-slate-800">{valueFormatter(d.value)}</div>
                    </div>
                ))
            )}
        </div>
    );
}

function DonutChart({ data, valueFormatter = intBR }: { data: ChartDatum[]; valueFormatter?: (n: number) => string }) {
    const total = data.reduce((acc, d) => acc + Math.max(0, d.value), 0);
    let cursor = 0;
    const stops = total > 0
        ? data.map((d, idx) => {
            const start = cursor;
            const pct = (Math.max(0, d.value) / total) * 100;
            cursor += pct;
            const color = CHART_COLORS[idx % CHART_COLORS.length];
            return `${color} ${start}% ${cursor}%`;
        })
        : ["#e2e8f0 0% 100%"];

    return (
        <div className="grid min-h-[230px] grid-cols-1 items-center gap-4 p-4 sm:grid-cols-[170px_1fr]">
            <div className="relative mx-auto h-36 w-36 rounded-full" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
                <div className="absolute inset-9 rounded-full bg-white shadow-inner" />
                <div className="absolute inset-0 flex items-center justify-center text-center">
                    <div>
                        <div className="text-xs font-bold text-slate-500">Total</div>
                        <div className="text-sm font-black text-slate-900">{valueFormatter(total)}</div>
                    </div>
                </div>
            </div>
            <div className="space-y-2">
                {data.length === 0 ? (
                    <div className="text-sm text-slate-400">Sem dados.</div>
                ) : (
                    data.slice(0, 8).map((d, idx) => (
                        <div key={`${d.label}-${idx}`} className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                                <span className="truncate text-slate-600" title={d.label}>{d.label}</span>
                            </div>
                            <span className="shrink-0 font-bold text-slate-800">{valueFormatter(d.value)}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
    );
}

function buildTopChart(rows: ConsumoRow[], field: "consumo_total" | "sugestao_compra" | "projecao_mes", take = 8): ChartDatum[] {
    return [...rows]
        .filter((r) => r[field] > 0)
        .sort((a, b) => b[field] - a[field])
        .slice(0, take)
        .map((r) => ({ label: r.produto_nome, value: r[field], hint: r.deposito_nome }));
}

function aggregateChart<T>(items: T[], labelFn: (item: T) => string, valueFn: (item: T) => number, take = 8): ChartDatum[] {
    const map = new Map<string, number>();
    for (const item of items) {
        const label = labelFn(item) || "Sem classificação";
        const value = valueFn(item);
        map.set(label, (map.get(label) || 0) + value);
    }
    return [...map.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, take);
}

export default function Page() {
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [fabricantes, setFabricantes] = useState<Fabricante[]>([]);
    const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);
    const [lotes, setLotes] = useState<LoteRow[]>([]);
    const [historico, setHistorico] = useState<HistoricoRow[]>([]);

    const [q, setQ] = useState("");
    const [depositoId, setDepositoId] = useState<ID>(0);
    const [categoriaId, setCategoriaId] = useState<ID>(0);
    const [fabricanteId, setFabricanteId] = useState<ID>(0);
    const [classificacaoId, setClassificacaoId] = useState<ID>(0);
    const [visao, setVisao] = useState<VisaoRelatorio>("produto_deposito");
    const [modoRelatorio, setModoRelatorio] = useState<ModoRelatorio>("consumo");
    const [mostrarSemLote, setMostrarSemLote] = useState(true);
    const [periodoConsumo, setPeriodoConsumo] = useState<PeriodoConsumo>("mes");
    const [consumoDataIni, setConsumoDataIni] = useState("");
    const [consumoDataFim, setConsumoDataFim] = useState("");
    const [diasCoberturaAlvo, setDiasCoberturaAlvo] = useState<number>(30);
    const [mostrarTabela, setMostrarTabela] = useState(true);

    const produtoById = useMemo(() => new Map(produtos.map((p) => [Number(p.id), p])), [produtos]);
    const depositoById = useMemo(() => new Map(depositos.map((d) => [Number(d.id), d])), [depositos]);
    const categoriaById = useMemo(() => new Map(categorias.map((c) => [Number(c.id), c])), [categorias]);
    const fabricanteById = useMemo(() => new Map(fabricantes.map((f) => [Number(f.id), f])), [fabricantes]);
    const classificacaoById = useMemo(() => new Map(classificacoes.map((c) => [Number(c.id), c])), [classificacoes]);

    useEffect(() => {
        setMounted(true);
        const hoje = new Date();
        setConsumoDataFim(dateInputValue(hoje));
        setConsumoDataIni(dateInputValue(addDays(hoje, -29)));
    }, []);

    async function carregar() {
        setLoading(true);
        setErr("");

        try {
            const [init, lotesResp, historicoResp] = await Promise.all([
                apiGet<InitResp>({ init: 1, _ts: Date.now() }),
                apiGet<LotesResp>({ action: "lotes_listar", somente_com_saldo: 1, _ts: Date.now() }),
                apiGet<HistoricoResp>({ historico: 1, tipo: "SAIDA", limit: 500, _ts: Date.now() }),
            ]);

            if (!init.ok) throw new Error(init.msg || "Falha ao carregar dados iniciais.");
            if (!lotesResp.ok) throw new Error(lotesResp.msg || "Falha ao carregar lotes.");
            if (!historicoResp.ok) throw new Error(historicoResp.msg || "Falha ao carregar histórico de saídas.");

            setDepositos(init.depositos || []);
            setCategorias((init.categorias || []).filter((c) => Number(c.ativo) === 1));
            setFabricantes((init.fabricantes || []).filter((f) => Number(f.ativo) === 1));
            setClassificacoes((init.classificacoes || []).filter((c) => Number(c.ativo) === 1));
            setProdutos((init.produtos || []).filter((p) => Number(p.ativo) === 1));
            setSaldos(init.saldos || []);
            setLotes(lotesResp.rows || []);
            setHistorico(historicoResp.rows || []);
        } catch (e: any) {
            setErr(e?.message || "Erro ao carregar relatório.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!mounted) return;
        carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mounted]);

    const lotesComFallback = useMemo(() => {
        const ativos = (lotes || [])
            .map((l) => ({ ...l, quantidade_atual: clampInt(l.quantidade_atual), custo_unitario: num(l.custo_unitario) }))
            .filter((l) => clampInt(l.quantidade_atual) > 0);

        if (!mostrarSemLote) return ativos;

        const loteQtyByProdDep = new Map<string, number>();
        for (const l of ativos) {
            const key = `${Number(l.produto_id)}::${Number(l.deposito_id)}`;
            loteQtyByProdDep.set(key, (loteQtyByProdDep.get(key) || 0) + clampInt(l.quantidade_atual));
        }

        const fallback: LoteRow[] = [];
        for (const s of saldos || []) {
            const qtdSaldo = clampInt(s.quantidade);
            if (qtdSaldo <= 0) continue;

            const pid = Number(s.produto_id);
            const depId = Number(s.deposito_id);
            const key = `${pid}::${depId}`;
            const qtdComLote = loteQtyByProdDep.get(key) || 0;
            const qtdSemLote = qtdSaldo - qtdComLote;
            if (qtdSemLote <= 0) continue;

            const p = produtoById.get(pid);
            const d = depositoById.get(depId);
            const custo = num(p?.preco_custo || 0);

            fallback.push({
                id: -1 * (fallback.length + 1),
                produto_id: pid,
                deposito_id: depId,
                numero_lote: "SEM_LOTE",
                custo_unitario: custo,
                quantidade_inicial: qtdSemLote,
                quantidade_atual: qtdSemLote,
                produto_nome: p?.nome || `Produto #${pid}`,
                codigo_barras: p?.codigo_barras || "",
                deposito_nome: d?.nome || `Depósito #${depId}`,
                custo_total_atual: custo * qtdSemLote,
                is_sintetico_sem_lote: true,
            });
        }

        return [...ativos, ...fallback];
    }, [lotes, mostrarSemLote, saldos, produtoById, depositoById]);

    const lotesFiltrados = useMemo(() => {
        const qq = q.trim().toLowerCase();

        return lotesComFallback.filter((l) => {
            const p = produtoById.get(Number(l.produto_id));
            const dep = depositoById.get(Number(l.deposito_id));

            if (depositoId && Number(l.deposito_id) !== Number(depositoId)) return false;
            if (categoriaId && Number(p?.categoria_id || 0) !== Number(categoriaId)) return false;
            if (fabricanteId && Number(p?.fabricante_id || 0) !== Number(fabricanteId)) return false;
            if (classificacaoId && Number(p?.classificacao_id || 0) !== Number(classificacaoId)) return false;

            if (qq) {
                const cat = p?.categoria_nome || (p?.categoria_id ? categoriaById.get(Number(p.categoria_id))?.nome : "") || "";
                const fab = p?.fabricante_nome || (p?.fabricante_id ? fabricanteById.get(Number(p.fabricante_id))?.nome : "") || "";
                const cls = p?.classificacao_nome || (p?.classificacao_id ? classificacaoById.get(Number(p.classificacao_id))?.nome : "") || "";
                const blob = [
                    p?.nome,
                    p?.codigo_barras,
                    l.produto_nome,
                    l.codigo_barras,
                    dep?.nome,
                    l.deposito_nome,
                    l.numero_lote,
                    cat,
                    fab,
                    cls,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                if (!blob.includes(qq)) return false;
            }

            return true;
        });
    }, [
        lotesComFallback,
        produtoById,
        depositoById,
        depositoId,
        categoriaId,
        fabricanteId,
        classificacaoId,
        q,
        categoriaById,
        fabricanteById,
        classificacaoById,
    ]);

    const reportRows = useMemo<ReportRow[]>(() => {
        const map = new Map<string, ReportRow>();

        for (const l of lotesFiltrados) {
            const pid = Number(l.produto_id);
            const depId = Number(l.deposito_id);
            const p = produtoById.get(pid);
            const dep = depositoById.get(depId);
            const qtd = clampInt(l.quantidade_atual);
            const custo = num(l.custo_unitario);
            if (qtd <= 0) continue;

            const key = visao === "produto" ? `p:${pid}` : `p:${pid}:d:${depId}`;
            const catNome = p?.categoria_nome || (p?.categoria_id ? categoriaById.get(Number(p.categoria_id))?.nome : "") || "";
            const fabNome = p?.fabricante_nome || (p?.fabricante_id ? fabricanteById.get(Number(p.fabricante_id))?.nome : "") || "";
            const clsNome = p?.classificacao_nome || (p?.classificacao_id ? classificacaoById.get(Number(p.classificacao_id))?.nome : "") || "";

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    produto_id: pid,
                    produto_nome: p?.nome || l.produto_nome || `Produto #${pid}`,
                    codigo_barras: p?.codigo_barras || l.codigo_barras || "",
                    deposito_id: visao === "produto" ? null : depId,
                    deposito_nome: visao === "produto" ? "Todos" : dep?.nome || l.deposito_nome || `Depósito #${depId}`,
                    categoria_nome: catNome,
                    fabricante_nome: fabNome,
                    classificacao_nome: clsNome,
                    quantidade: 0,
                    valor_total: 0,
                    custo_medio: 0,
                    custo_min: custo,
                    custo_max: custo,
                    lotes_ativos: 0,
                    qtd_sem_lote: 0,
                });
            }

            const row = map.get(key)!;
            row.quantidade += qtd;
            row.valor_total += qtd * custo;
            row.custo_min = Math.min(row.custo_min, custo);
            row.custo_max = Math.max(row.custo_max, custo);
            row.lotes_ativos += l.is_sintetico_sem_lote ? 0 : 1;
            row.qtd_sem_lote += l.is_sintetico_sem_lote ? qtd : 0;
        }

        const rows = Array.from(map.values()).map((r) => ({
            ...r,
            custo_medio: r.quantidade > 0 ? r.valor_total / r.quantidade : 0,
        }));

        rows.sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, "pt-BR") || a.deposito_nome.localeCompare(b.deposito_nome, "pt-BR"));
        return rows;
    }, [lotesFiltrados, produtoById, depositoById, categoriaById, fabricanteById, classificacaoById, visao]);

    const resumo = useMemo(() => {
        let totalUnidades = 0;
        let valorTotal = 0;
        let lotesAtivos = 0;
        let qtdSemLote = 0;
        const produtosSet = new Set<number>();
        const depositosSet = new Set<number>();

        for (const l of lotesFiltrados) {
            const qtd = clampInt(l.quantidade_atual);
            const custo = num(l.custo_unitario);
            if (qtd <= 0) continue;

            totalUnidades += qtd;
            valorTotal += qtd * custo;
            produtosSet.add(Number(l.produto_id));
            depositosSet.add(Number(l.deposito_id));
            if (l.is_sintetico_sem_lote) qtdSemLote += qtd;
            else lotesAtivos++;
        }

        return {
            totalUnidades,
            valorTotal,
            custoMedioGeral: totalUnidades > 0 ? valorTotal / totalUnidades : 0,
            produtos: produtosSet.size,
            depositos: depositosSet.size,
            lotesAtivos,
            qtdSemLote,
        };
    }, [lotesFiltrados]);

    const consumoRange = useMemo(
        () => getPeriodoRange(periodoConsumo, consumoDataIni, consumoDataFim),
        [periodoConsumo, consumoDataIni, consumoDataFim]
    );

    const estoqueByKey = useMemo(() => {
        const map = new Map<string, ReportRow>();
        for (const r of reportRows) map.set(r.key, r);
        return map;
    }, [reportRows]);

    const consumoRows = useMemo<ConsumoRow[]>(() => {
        const map = new Map<string, ConsumoRow>();
        const qq = q.trim().toLowerCase();

        for (const h of historico || []) {
            if (String(h.tipo || "").toUpperCase() !== "SAIDA") continue;
            if (!isWithinRange(h.criado_em, consumoRange)) continue;

            const pid = Number(h.produto_id || 0);
            const depOrigemId = Number(h.deposito_origem_id || 0);
            const qtd = clampInt(h.quantidade || 0);
            if (pid <= 0 || qtd <= 0) continue;

            const p = produtoById.get(pid);
            const dep = depositoById.get(depOrigemId);

            if (depositoId && depOrigemId !== Number(depositoId)) continue;
            if (categoriaId && Number(p?.categoria_id || 0) !== Number(categoriaId)) continue;
            if (fabricanteId && Number(p?.fabricante_id || 0) !== Number(fabricanteId)) continue;
            if (classificacaoId && Number(p?.classificacao_id || 0) !== Number(classificacaoId)) continue;

            const catNome = p?.categoria_nome || (p?.categoria_id ? categoriaById.get(Number(p.categoria_id))?.nome : "") || "";
            const fabNome = p?.fabricante_nome || (p?.fabricante_id ? fabricanteById.get(Number(p.fabricante_id))?.nome : "") || "";
            const clsNome = p?.classificacao_nome || (p?.classificacao_id ? classificacaoById.get(Number(p.classificacao_id))?.nome : "") || "";

            if (qq) {
                const blob = [
                    p?.nome,
                    p?.codigo_barras,
                    h.produto_nome,
                    h.codigo_barras_snapshot,
                    dep?.nome,
                    h.deposito_origem_nome,
                    h.observacao,
                    catNome,
                    fabNome,
                    clsNome,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                if (!blob.includes(qq)) continue;
            }

            const key = visao === "produto" ? `p:${pid}` : `p:${pid}:d:${depOrigemId}`;
            const estoque = estoqueByKey.get(key);
            const custoMedio = estoque?.custo_medio || num(p?.preco_custo || 0);
            const estoqueAtual = estoque?.quantidade || 0;

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    produto_id: pid,
                    produto_nome: p?.nome || h.produto_nome || `Produto #${pid}`,
                    codigo_barras: p?.codigo_barras || h.codigo_barras_snapshot || "",
                    deposito_id: visao === "produto" ? null : depOrigemId,
                    deposito_nome: visao === "produto" ? "Todos" : dep?.nome || h.deposito_origem_nome || `Depósito #${depOrigemId}`,
                    categoria_nome: catNome,
                    fabricante_nome: fabNome,
                    classificacao_nome: clsNome,
                    consumo_total: 0,
                    saidas: 0,
                    media_dia: 0,
                    projecao_semana: 0,
                    projecao_mes: 0,
                    projecao_ano: 0,
                    estoque_atual: estoqueAtual,
                    custo_medio: custoMedio,
                    valor_consumido_estimado: 0,
                    dias_cobertura: null,
                    sugestao_compra: 0,
                    ultima_saida: null,
                });
            }

            const row = map.get(key)!;
            row.consumo_total += qtd;
            row.saidas += 1;
            row.valor_consumido_estimado += qtd * custoMedio;

            const atual = toDateSafe(h.criado_em);
            const ultima = toDateSafe(row.ultima_saida || "");
            if (atual && (!ultima || atual > ultima)) row.ultima_saida = h.criado_em;
        }

        const dias = Math.max(1, consumoRange.dias || 1);
        const alvo = Math.max(1, clampInt(diasCoberturaAlvo) || 30);

        const rows = Array.from(map.values()).map((r) => {
            const mediaDia = r.consumo_total / dias;
            const diasCobertura = mediaDia > 0 ? r.estoque_atual / mediaDia : null;

            return {
                ...r,
                media_dia: mediaDia,
                projecao_semana: mediaDia * 7,
                projecao_mes: mediaDia * 30,
                projecao_ano: mediaDia * 365,
                dias_cobertura: diasCobertura,
                sugestao_compra: Math.max(0, Math.ceil(mediaDia * alvo - r.estoque_atual)),
            };
        });

        rows.sort(
            (a, b) =>
                b.sugestao_compra - a.sugestao_compra ||
                b.consumo_total - a.consumo_total ||
                a.produto_nome.localeCompare(b.produto_nome, "pt-BR")
        );

        return rows;
    }, [
        historico,
        consumoRange,
        q,
        produtoById,
        depositoById,
        depositoId,
        categoriaId,
        fabricanteId,
        classificacaoId,
        categoriaById,
        fabricanteById,
        classificacaoById,
        visao,
        estoqueByKey,
        diasCoberturaAlvo,
    ]);

    const resumoConsumo = useMemo(() => {
        let consumoTotal = 0;
        let valorConsumido = 0;
        let sugestaoCompra = 0;
        let saidas = 0;
        let coberturaSoma = 0;
        let coberturaCount = 0;
        const produtosSet = new Set<number>();

        for (const r of consumoRows) {
            consumoTotal += r.consumo_total;
            valorConsumido += r.valor_consumido_estimado;
            sugestaoCompra += r.sugestao_compra;
            saidas += r.saidas;
            produtosSet.add(Number(r.produto_id));
            if (r.dias_cobertura !== null && Number.isFinite(r.dias_cobertura)) {
                coberturaSoma += r.dias_cobertura;
                coberturaCount++;
            }
        }

        const dias = Math.max(1, consumoRange.dias || 1);

        return {
            consumoTotal,
            valorConsumido,
            sugestaoCompra,
            saidas,
            produtos: produtosSet.size,
            mediaDia: consumoTotal / dias,
            mediaSemana: (consumoTotal / dias) * 7,
            mediaMes: (consumoTotal / dias) * 30,
            coberturaMedia: coberturaCount > 0 ? coberturaSoma / coberturaCount : 0,
        };
    }, [consumoRows, consumoRange]);

    const chartConsumoTop = useMemo(() => buildTopChart(consumoRows, "consumo_total", 12), [consumoRows]);
    const chartSugestaoTop = useMemo(() => buildTopChart(consumoRows, "sugestao_compra", 8), [consumoRows]);
    const chartProjecaoTop = useMemo(() => buildTopChart(consumoRows, "projecao_mes", 8), [consumoRows]);
    const chartValorPorCategoria = useMemo(() => aggregateChart(reportRows, (r) => r.categoria_nome || "Sem categoria", (r) => r.valor_total, 8), [reportRows]);
    const chartValorPorDeposito = useMemo(() => aggregateChart(reportRows, (r) => r.deposito_nome || "Sem depósito", (r) => r.valor_total, 8), [reportRows]);
    const chartConsumoPorDeposito = useMemo(() => aggregateChart(consumoRows, (r) => r.deposito_nome || "Sem depósito", (r) => r.consumo_total, 8), [consumoRows]);

    function limparFiltros() {
        setQ("");
        setDepositoId(0);
        setCategoriaId(0);
        setFabricanteId(0);
        setClassificacaoId(0);
    }

    function exportarCsv() {
        const sep = ";";

        if (modoRelatorio === "consumo") {
            const header = [
                "Produto",
                "Código de barras",
                "Depósito",
                "Categoria",
                "Fabricante",
                "Classificação",
                "Período",
                "Consumo no período",
                "Média por dia",
                "Projeção semana",
                "Projeção mês",
                "Projeção ano",
                "Estoque atual",
                "Dias de cobertura",
                "Sugestão de compra",
                "Custo médio",
                "Valor consumido estimado",
                "Saídas",
                "Última saída",
            ];

            const lines = [header.map((h) => escapeCsvCell(h, sep)).join(sep)];

            for (const r of consumoRows) {
                lines.push(
                    [
                        r.produto_nome,
                        r.codigo_barras,
                        r.deposito_nome,
                        r.categoria_nome,
                        r.fabricante_nome,
                        r.classificacao_nome,
                        consumoRange.label,
                        r.consumo_total,
                        r.media_dia.toFixed(2).replace(".", ","),
                        r.projecao_semana.toFixed(2).replace(".", ","),
                        r.projecao_mes.toFixed(2).replace(".", ","),
                        r.projecao_ano.toFixed(2).replace(".", ","),
                        r.estoque_atual,
                        r.dias_cobertura === null ? "" : r.dias_cobertura.toFixed(1).replace(".", ","),
                        r.sugestao_compra,
                        r.custo_medio.toFixed(2).replace(".", ","),
                        r.valor_consumido_estimado.toFixed(2).replace(".", ","),
                        r.saidas,
                        r.ultima_saida ? fmtDateTime(r.ultima_saida) : "",
                    ]
                        .map((v) => escapeCsvCell(v, sep))
                        .join(sep)
                );
            }

            const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `relatorio_consumo_estoque_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return;
        }

        const header = [
            "Produto",
            "Código de barras",
            "Depósito",
            "Categoria",
            "Fabricante",
            "Classificação",
            "Quantidade",
            "Custo médio ponderado",
            "Valor em estoque",
            "Menor custo em lote",
            "Maior custo em lote",
            "Lotes ativos",
            "Qtd sem lote",
        ];

        const lines = [header.map((h) => escapeCsvCell(h, sep)).join(sep)];

        for (const r of reportRows) {
            lines.push(
                [
                    r.produto_nome,
                    r.codigo_barras,
                    r.deposito_nome,
                    r.categoria_nome,
                    r.fabricante_nome,
                    r.classificacao_nome,
                    r.quantidade,
                    r.custo_medio.toFixed(2).replace(".", ","),
                    r.valor_total.toFixed(2).replace(".", ","),
                    r.custo_min.toFixed(2).replace(".", ","),
                    r.custo_max.toFixed(2).replace(".", ","),
                    r.lotes_ativos,
                    r.qtd_sem_lote,
                ]
                    .map((v) => escapeCsvCell(v, sep))
                    .join(sep)
            );
        }

        const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `relatorio_estoque_sintetico_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    if (!mounted) {
        return (
            <main className="min-h-screen p-3 text-slate-900 sm:p-6" style={dashboardBg()}>
                <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                    Carregando relatório...
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen p-3 text-slate-900 sm:p-6" style={dashboardBg()}>
            <div className="mx-auto max-w-[1480px] space-y-4">
                <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-500">Estoque estratégico</p>
                        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Dashboard de estoque e consumo</h1>
                        <p className="mt-1 max-w-4xl text-sm text-slate-600">
                            Visão executiva para compras: custo médio por lote, valor em estoque, consumo histórico, cobertura e sugestão de reposição.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" type="button" onClick={carregar} disabled={loading}>
                            Atualizar
                        </Button>
                        <Button variant="soft" type="button" onClick={() => setMostrarTabela((v) => !v)}>
                            {mostrarTabela ? "Ocultar tabela" : "Mostrar tabela"}
                        </Button>
                        <Button type="button" onClick={exportarCsv} disabled={loading || (modoRelatorio === "estoque" ? reportRows.length === 0 : consumoRows.length === 0)}>
                            Exportar CSV
                        </Button>
                    </div>
                </div>

                {err ? (
                    <Panel className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                        <b>Erro:</b> {err}
                    </Panel>
                ) : null}

                {historico.length >= 500 ? (
                    <Panel className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        A API retornou 500 saídas no histórico. Se houver mais movimentos antigos no banco, o consumo anual ou personalizado pode ficar parcial. Para relatório anual 100% preciso, crie uma rota agregada de consumo no PHP.
                    </Panel>
                ) : null}

                <div className="grid grid-cols-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 lg:grid-cols-6">
                    <MetricTile
                        label="Valor em estoque"
                        value={compactMoneyBRL(resumo.valorTotal)}
                        hint={`${intBR(resumo.totalUnidades)} unidades`}
                        icon="money"
                        gradient="linear-gradient(135deg,#581c87,#7e22ce)"
                    />
                    <MetricTile
                        label="Custo médio"
                        value={moneyBRL(resumo.custoMedioGeral)}
                        hint="Média ponderada"
                        icon="avg"
                        gradient="linear-gradient(135deg,#6d28d9,#9333ea)"
                    />
                    <MetricTile
                        label="Produtos"
                        value={intBR(modoRelatorio === "consumo" ? resumoConsumo.produtos : resumo.produtos)}
                        hint="Itens no filtro"
                        icon="stock"
                        gradient="linear-gradient(135deg,#c026d3,#d946ef)"
                    />
                    <MetricTile
                        label="Consumo"
                        value={intBR(resumoConsumo.consumoTotal)}
                        hint={consumoRange.label}
                        icon="consume"
                        gradient="linear-gradient(135deg,#06b6d4,#14b8a6)"
                    />
                    <MetricTile
                        label="Comprar"
                        value={intBR(resumoConsumo.sugestaoCompra)}
                        hint={`${diasCoberturaAlvo} dias de cobertura`}
                        icon="buy"
                        gradient="linear-gradient(135deg,#0f766e,#0d9488)"
                    />
                    <MetricTile
                        label="Cobertura"
                        value={`${resumoConsumo.coberturaMedia.toFixed(1).replace(".", ",")} d`}
                        hint="Média dos itens consumidos"
                        icon="cover"
                        gradient="linear-gradient(135deg,#0f766e,#115e59)"
                    />
                </div>

                <Panel className="p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
                        <div className="xl:col-span-2">
                            <Field label="Buscar">
                                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Produto, código, depósito, lote..." />
                            </Field>
                        </div>

                        <Field label="Depósito">
                            <Select value={depositoId} onChange={(e) => setDepositoId(Number(e.target.value))}>
                                <option value={0}>Todos</option>
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>{d.nome}</option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Categoria">
                            <Select value={categoriaId} onChange={(e) => setCategoriaId(Number(e.target.value))}>
                                <option value={0}>Todas</option>
                                {categorias.map((c) => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Fabricante">
                            <Select value={fabricanteId} onChange={(e) => setFabricanteId(Number(e.target.value))}>
                                <option value={0}>Todos</option>
                                {fabricantes.map((f) => (
                                    <option key={f.id} value={f.id}>{f.nome}</option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Classificação">
                            <Select value={classificacaoId} onChange={(e) => setClassificacaoId(Number(e.target.value))}>
                                <option value={0}>Todas</option>
                                {classificacoes.map((c) => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Visão">
                            <Select value={visao} onChange={(e) => setVisao(e.target.value as VisaoRelatorio)}>
                                <option value="produto_deposito">Produto por depósito</option>
                                <option value="produto">Produto consolidado</option>
                            </Select>
                        </Field>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-7">
                        <Field label="Relatório">
                            <Select value={modoRelatorio} onChange={(e) => setModoRelatorio(e.target.value as ModoRelatorio)}>
                                <option value="consumo">Consumo para compra</option>
                                <option value="estoque">Estoque sintético</option>
                            </Select>
                        </Field>

                        <Field label="Período">
                            <Select value={periodoConsumo} onChange={(e) => setPeriodoConsumo(e.target.value as PeriodoConsumo)}>
                                <option value="dia">Hoje</option>
                                <option value="semana">Últimos 7 dias</option>
                                <option value="mes">Últimos 30 dias</option>
                                <option value="ano">Últimos 365 dias</option>
                                <option value="personalizado">Personalizado</option>
                            </Select>
                        </Field>

                        <Field label="Data inicial">
                            <TextInput
                                type="date"
                                value={consumoDataIni}
                                onChange={(e) => {
                                    setConsumoDataIni(e.target.value);
                                    setPeriodoConsumo("personalizado");
                                }}
                            />
                        </Field>

                        <Field label="Data final">
                            <TextInput
                                type="date"
                                value={consumoDataFim}
                                onChange={(e) => {
                                    setConsumoDataFim(e.target.value);
                                    setPeriodoConsumo("personalizado");
                                }}
                            />
                        </Field>

                        <Field label="Cobertura desejada">
                            <Select value={diasCoberturaAlvo} onChange={(e) => setDiasCoberturaAlvo(Number(e.target.value))}>
                                <option value={15}>15 dias</option>
                                <option value={30}>30 dias</option>
                                <option value={45}>45 dias</option>
                                <option value={60}>60 dias</option>
                                <option value={90}>90 dias</option>
                                <option value={120}>120 dias</option>
                            </Select>
                        </Field>

                        <div className="flex items-end">
                            <label className="flex min-h-[42px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={mostrarSemLote}
                                    onChange={(e) => setMostrarSemLote(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300"
                                />
                                Incluir sem lote
                            </label>
                        </div>

                        <div className="flex items-end gap-2">
                            <Button variant="ghost" type="button" onClick={limparFiltros} className="w-full">
                                Limpar filtros
                            </Button>
                        </div>
                    </div>
                </Panel>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                    <Panel className="xl:col-span-5">
                        <SectionTitle title="Consumo por produto" subtitle="Itens com maior saída no período selecionado" />
                        <MiniBarChart data={chartConsumoTop} />
                    </Panel>

                    <Panel className="xl:col-span-4">
                        <SectionTitle title="Sugestão de compras" subtitle="Quantidade necessária para a cobertura desejada" />
                        <HorizontalBarChart data={chartSugestaoTop} />
                    </Panel>

                    <Panel className="xl:col-span-3">
                        <SectionTitle title="Consumo por depósito" subtitle="Distribuição das saídas" />
                        <DonutChart data={chartConsumoPorDeposito} />
                    </Panel>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                    <Panel className="xl:col-span-4">
                        <SectionTitle title="Valor por categoria" subtitle="Baseado no custo médio dos lotes" />
                        <DonutChart data={chartValorPorCategoria} valueFormatter={compactMoneyBRL} />
                    </Panel>

                    <Panel className="xl:col-span-4">
                        <SectionTitle title="Valor por depósito" subtitle="Onde o capital está parado" />
                        <DonutChart data={chartValorPorDeposito} valueFormatter={compactMoneyBRL} />
                    </Panel>

                    <Panel className="xl:col-span-4">
                        <SectionTitle title="Projeção mensal" subtitle="Consumo projetado por produto em 30 dias" />
                        <HorizontalBarChart data={chartProjecaoTop} valueFormatter={(n) => n.toFixed(1).replace(".", ",")} />
                    </Panel>
                </div>

                {resumo.qtdSemLote > 0 ? (
                    <Panel className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        Existem <b>{intBR(resumo.qtdSemLote)}</b> unidades com saldo maior que a quantidade encontrada em lotes. Essas unidades aparecem como sem lote e usam o preço de custo do cadastro como referência.
                    </Panel>
                ) : null}

                {mostrarTabela ? (
                    modoRelatorio === "estoque" ? (
                        <Panel className="overflow-hidden">
                            <SectionTitle title="Tabela do estoque sintético" subtitle={loading ? "Carregando..." : `${intBR(reportRows.length)} linhas encontradas`} />
                            <div className="overflow-auto">
                                <table className="min-w-[1120px] w-full border-collapse text-sm">
                                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                        <tr>
                                            <th className="border-b border-slate-200 px-4 py-3">Produto</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Depósito</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Qtd</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Custo médio</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Valor estoque</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Menor custo</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Maior custo</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Lotes</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Sem lote</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={9}>Carregando relatório...</td></tr>
                                        ) : reportRows.length === 0 ? (
                                            <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={9}>Nenhum item encontrado.</td></tr>
                                        ) : (
                                            reportRows.map((r) => (
                                                <tr key={r.key} className="odd:bg-white even:bg-slate-50/70 hover:bg-slate-100/70">
                                                    <td className="border-b border-slate-100 px-4 py-3 align-top">
                                                        <div className="font-bold text-slate-950">{r.produto_nome}</div>
                                                        <div className="mt-0.5 text-xs text-slate-500">CB: {r.codigo_barras || "sem código"}</div>
                                                        <div className="mt-0.5 text-xs text-slate-500">{[r.categoria_nome, r.fabricante_nome, r.classificacao_nome].filter(Boolean).join(" • ")}</div>
                                                    </td>
                                                    <td className="border-b border-slate-100 px-4 py-3 align-top text-slate-700">{r.deposito_nome}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top font-bold">{intBR(r.quantidade)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top font-bold text-slate-950">{moneyBRL(r.custo_medio)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top font-black text-slate-950">{moneyBRL(r.valor_total)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top text-slate-700">{moneyBRL(r.custo_min)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top text-slate-700">{moneyBRL(r.custo_max)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top text-slate-700">{intBR(r.lotes_ativos)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top">{r.qtd_sem_lote > 0 ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">{intBR(r.qtd_sem_lote)}</span> : <span className="text-slate-400">0</span>}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    ) : (
                        <Panel className="overflow-hidden">
                            <SectionTitle title="Tabela de consumo para compras" subtitle={loading ? "Carregando..." : `${intBR(consumoRows.length)} linhas encontradas. Período: ${consumoRange.label}`} />
                            <div className="overflow-auto">
                                <table className="min-w-[1380px] w-full border-collapse text-sm">
                                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                        <tr>
                                            <th className="border-b border-slate-200 px-4 py-3">Produto</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Depósito</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Consumo</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Média/dia</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Semana</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Mês</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Ano</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Estoque</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Cobertura</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Comprar</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Custo médio</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Valor consumido</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Saídas</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Última saída</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={14}>Carregando consumo...</td></tr>
                                        ) : consumoRows.length === 0 ? (
                                            <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={14}>Nenhuma saída encontrada para os filtros e período selecionados.</td></tr>
                                        ) : (
                                            consumoRows.map((r) => (
                                                <tr key={r.key} className="odd:bg-white even:bg-slate-50/70 hover:bg-slate-100/70">
                                                    <td className="border-b border-slate-100 px-4 py-3 align-top">
                                                        <div className="font-bold text-slate-950">{r.produto_nome}</div>
                                                        <div className="mt-0.5 text-xs text-slate-500">CB: {r.codigo_barras || "sem código"}</div>
                                                        <div className="mt-0.5 text-xs text-slate-500">{[r.categoria_nome, r.fabricante_nome, r.classificacao_nome].filter(Boolean).join(" • ")}</div>
                                                    </td>
                                                    <td className="border-b border-slate-100 px-4 py-3 align-top text-slate-700">{r.deposito_nome}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top font-black text-slate-950">{intBR(r.consumo_total)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top">{r.media_dia.toFixed(2).replace(".", ",")}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top">{r.projecao_semana.toFixed(1).replace(".", ",")}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top font-bold">{r.projecao_mes.toFixed(1).replace(".", ",")}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top">{r.projecao_ano.toFixed(0)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top font-bold">{intBR(r.estoque_atual)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top">
                                                        {r.dias_cobertura === null ? <span className="text-slate-400">sem consumo</span> : <span className={r.dias_cobertura < diasCoberturaAlvo ? "font-bold text-rose-700" : "text-slate-700"}>{r.dias_cobertura.toFixed(1).replace(".", ",")} dias</span>}
                                                    </td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top">
                                                        {r.sugestao_compra > 0 ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-black text-rose-800">{intBR(r.sugestao_compra)}</span> : <span className="text-slate-400">0</span>}
                                                    </td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top">{moneyBRL(r.custo_medio)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top font-bold">{moneyBRL(r.valor_consumido_estimado)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right align-top">{intBR(r.saidas)}</td>
                                                    <td className="border-b border-slate-100 px-4 py-3 align-top text-slate-700">{r.ultima_saida ? fmtDateTime(r.ultima_saida) : ""}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    )
                ) : null}

                <Panel className="p-4 text-xs text-slate-500">
                    Fórmula do estoque: custo médio ponderado = soma de quantidade atual do lote vezes custo unitário do lote, dividida pela quantidade total atual. Fórmula do consumo: soma das saídas no histórico no período selecionado. Sugestão de compra = média diária vezes cobertura desejada, menos estoque atual.
                </Panel>
            </div>
        </main>
    );
}
