"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    IconActivity,
    IconAlertTriangle,
    IconBrain,
    IconCalendar,
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconClock,
    IconFilter,
    IconRefresh,
    IconRobot,
    IconSearch,
    IconShieldCheck,
    IconTrash,
    IconUser,
    IconX,
} from "@tabler/icons-react";

const API_URL = "https://api.planoassistencialintegrado.com.br/homenagens.php";

type AuditEvent =
    | "recebimento"
    | "analise_ia"
    | "aprovacao_automatica"
    | "reprovacao_automatica"
    | "exclusao_automatica"
    | "aprovacao_manual"
    | "reprovacao_manual"
    | "exclusao_manual"
    | string;

type AuditLog = {
    id: number;
    homenagem_id?: number | null;
    envio_id?: number | null;
    evento: AuditEvent;
    origem?: string | null;
    status_anterior?: string | null;
    status_novo?: string | null;
    decisao_ia?: string | null;
    confianca?: number | null;
    categoria?: string | null;
    motivo?: string | null;
    modelo?: string | null;
    openai_request_id?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    detalhes_json?: any;
    criado_em: string;

    // Campos opcionais que o endpoint pode enriquecer via JOIN.
    falecido?: string | null;
    nome_visitante?: string | null;
    mensagem?: string | null;
    tipo?: string | null;
    aprovado_por?: string | null;
    sala?: string | null;
};

type ApiResponse = {
    sucesso?: boolean;
    ok?: boolean;
    logs?: AuditLog[];
    itens?: AuditLog[];
    total?: number;
    page?: number;
    pagina?: number;
    per_page?: number;
    limite?: number;
    erro?: boolean | string;
    msg?: string;
    message?: string;
};

type EventFilter = "todos" | AuditEvent;
type OriginFilter = "todos" | "aurora" | "familiar" | "admin" | "sistema";

const EVENT_OPTIONS: Array<{ value: EventFilter; label: string }> = [
    { value: "todos", label: "Todos os eventos" },
    { value: "recebimento", label: "Recebimentos" },
    { value: "analise_ia", label: "Análises da Aurora" },
    { value: "aprovacao_automatica", label: "Aprovações da Aurora" },
    { value: "reprovacao_automatica", label: "Reprovações da Aurora" },
    { value: "exclusao_automatica", label: "Exclusões automáticas" },
    { value: "aprovacao_manual", label: "Aprovações manuais" },
    { value: "reprovacao_manual", label: "Reprovações manuais" },
    { value: "exclusao_manual", label: "Exclusões manuais" },
];

const ORIGIN_OPTIONS: Array<{ value: OriginFilter; label: string }> = [
    { value: "todos", label: "Todas as origens" },
    { value: "aurora", label: "Aurora" },
    { value: "familiar", label: "Familiar" },
    { value: "admin", label: "Administrativo" },
    { value: "sistema", label: "Sistema" },
];

function pad2(value: number) {
    return String(value).padStart(2, "0");
}

function toDateInput(date: Date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function defaultPeriod() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: toDateInput(start), end: toDateInput(end) };
}

function parseApiDate(value?: string | null): Date | null {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value?: string | null) {
    const date = parseApiDate(value);
    if (!date) return String(value ?? "-");
    return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function formatTime(value?: string | null) {
    const date = parseApiDate(value);
    if (!date) return "--:--";
    return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function formatDay(value?: string | null) {
    const date = parseApiDate(value);
    if (!date) return "Data desconhecida";
    return date.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
    });
}

function safeNumber(value: unknown, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeOrigin(value?: string | null) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw.includes("aurora") || raw.includes("ia") || raw.includes("auto")) return "aurora";
    if (raw.includes("familiar")) return "familiar";
    if (raw.includes("admin") || raw.includes("usuario") || raw.includes("painel")) return "admin";
    if (raw.includes("sistema")) return "sistema";
    return raw || "sistema";
}

function eventMeta(event: AuditEvent) {
    switch (event) {
        case "recebimento":
            return {
                label: "Mensagem recebida",
                icon: IconActivity,
                badge: "border-sky-200 bg-sky-50 text-sky-700",
                dot: "bg-sky-500",
            };
        case "analise_ia":
            return {
                label: "Análise da Aurora",
                icon: IconBrain,
                badge: "border-violet-200 bg-violet-50 text-violet-700",
                dot: "bg-violet-500",
            };
        case "aprovacao_automatica":
            return {
                label: "Aprovado pela Aurora",
                icon: IconRobot,
                badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
                dot: "bg-emerald-500",
            };
        case "reprovacao_automatica":
            return {
                label: "Reprovado pela Aurora",
                icon: IconShieldCheck,
                badge: "border-red-200 bg-red-50 text-red-700",
                dot: "bg-red-500",
            };
        case "exclusao_automatica":
            return {
                label: "Excluído automaticamente",
                icon: IconTrash,
                badge: "border-rose-200 bg-rose-50 text-rose-700",
                dot: "bg-rose-500",
            };

        case "aprovacao_manual":
            return {
                label: "Aprovação manual",
                icon: IconCheck,
                badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
                dot: "bg-emerald-500",
            };
        case "reprovacao_manual":
            return {
                label: "Reprovação manual",
                icon: IconX,
                badge: "border-orange-200 bg-orange-50 text-orange-700",
                dot: "bg-orange-500",
            };
        case "exclusao_manual":
            return {
                label: "Exclusão manual",
                icon: IconTrash,
                badge: "border-slate-300 bg-slate-100 text-slate-700",
                dot: "bg-slate-500",
            };
        default:
            return {
                label: String(event || "Evento"),
                icon: IconActivity,
                badge: "border-slate-200 bg-slate-50 text-slate-700",
                dot: "bg-slate-400",
            };
    }
}

function confidenceText(value?: number | null) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const pct = n <= 1 ? n * 100 : n;
    return `${pct.toFixed(pct >= 99.95 ? 0 : 1).replace(".0", "")}%`;
}

function originLabel(origin?: string | null) {
    switch (normalizeOrigin(origin)) {
        case "aurora":
            return "Aurora";
        case "familiar":
            return "Familiar";
        case "admin":
            return "Administrativo";
        case "sistema":
            return "Sistema";
        default:
            return origin || "Sistema";
    }
}

function truncate(value: unknown, max = 220) {
    const text = String(value ?? "").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}

async function apiPost(payload: Record<string, any>): Promise<ApiResponse> {
    const response = await fetch(API_URL, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as ApiResponse | null;

    if (!response.ok || !data || data.erro || data.sucesso === false || data.ok === false) {
        const msg = data?.msg || data?.message || (typeof data?.erro === "string" ? data.erro : "") || "Falha ao carregar auditoria.";
        throw new Error(msg);
    }

    return data;
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="space-y-1.5">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
            {children}
        </label>
    );
}

function SummaryCard({
    label,
    value,
    icon: Icon,
}: {
    label: string;
    value: number | string;
    icon: React.ComponentType<{ className?: string }>;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <div className="text-2xl font-bold leading-none text-slate-950">{value}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">{label}</div>
                </div>
            </div>
        </div>
    );
}

function TimelineItem({ item, isLast }: { item: AuditLog; isLast: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const meta = eventMeta(item.evento);
    const Icon = meta.icon;
    const confidence = confidenceText(item.confianca);
    const details = item.detalhes_json && typeof item.detalhes_json === "object" ? item.detalhes_json : null;

    return (
        <div className="relative grid grid-cols-[84px_24px_minmax(0,1fr)] gap-3 md:grid-cols-[110px_28px_minmax(0,1fr)]">
            <div className="pt-1 text-right">
                <div className="text-sm font-bold tabular-nums text-slate-800">{formatTime(item.criado_em)}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">#{item.id}</div>
            </div>

            <div className="relative flex justify-center">
                {!isLast ? <div className="absolute bottom-[-12px] top-5 w-px bg-slate-200" /> : null}
                <div className={`relative z-10 mt-1.5 h-3 w-3 rounded-full ring-4 ring-white ${meta.dot}`} />
            </div>

            <article className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.badge}`}>
                                    <Icon className="h-3.5 w-3.5" />
                                    {meta.label}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                    {normalizeOrigin(item.origem) === "aurora" ? <IconRobot className="h-3.5 w-3.5" /> : <IconUser className="h-3.5 w-3.5" />}
                                    {originLabel(item.origem)}
                                </span>
                                {confidence ? (
                                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                                        Confiança {confidence}
                                    </span>
                                ) : null}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                {item.envio_id ? <span>Envio #{item.envio_id}</span> : null}
                                {item.homenagem_id ? <span>Homenagem #{item.homenagem_id}</span> : null}
                                {item.falecido ? <span>Falecido: <strong className="font-semibold text-slate-700">{item.falecido}</strong></span> : null}
                                {item.sala ? <span>{item.sala}</span> : null}
                            </div>

                            {item.nome_visitante || item.mensagem ? (
                                <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                                    {item.nome_visitante ? (
                                        <div className="text-xs font-bold text-slate-700">{item.nome_visitante}</div>
                                    ) : null}
                                    {item.mensagem ? (
                                        <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                                            “{truncate(item.mensagem, expanded ? 5000 : 260)}”
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            {(item.status_anterior || item.status_novo) ? (
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                    <span className="text-slate-500">Status:</span>
                                    <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                                        {item.status_anterior || "—"}
                                    </span>
                                    <span className="text-slate-400">→</span>
                                    <span className="rounded-lg bg-slate-950 px-2 py-1 font-semibold text-white">
                                        {item.status_novo || "—"}
                                    </span>
                                </div>
                            ) : null}

                            {(item.decisao_ia || item.categoria || item.motivo) ? (
                                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                                    {item.decisao_ia ? (
                                        <div><span className="text-slate-400">Decisão IA:</span> <strong className="text-slate-700">{item.decisao_ia}</strong></div>
                                    ) : null}
                                    {item.categoria ? (
                                        <div><span className="text-slate-400">Categoria:</span> <strong className="text-slate-700">{item.categoria}</strong></div>
                                    ) : null}
                                    {item.motivo ? (
                                        <div className="sm:col-span-2"><span className="text-slate-400">Motivo:</span> <span className="text-slate-700">{item.motivo}</span></div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            onClick={() => setExpanded((v) => !v)}
                            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                            {expanded ? <IconChevronUp className="h-4 w-4" /> : <IconChevronDown className="h-4 w-4" />}
                            {expanded ? "Menos" : "Detalhes"}
                        </button>
                    </div>

                    {expanded ? (
                        <div className="mt-4 border-t border-slate-100 pt-4">
                            <div className="grid gap-3 text-xs md:grid-cols-2 xl:grid-cols-3">
                                <Detail label="Data/hora" value={formatDateTime(item.criado_em)} />
                                <Detail label="Modelo" value={item.modelo} />
                                <Detail label="OpenAI Request ID" value={item.openai_request_id} mono />
                                <Detail label="IP" value={item.ip} mono />
                                <Detail label="Tipo" value={item.tipo} />
                                <Detail label="Aprovado por" value={item.aprovado_por} />
                            </div>

                            {item.user_agent ? (
                                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
                                    <strong className="text-slate-700">User agent:</strong> {item.user_agent}
                                </div>
                            ) : null}

                            {details ? (
                                <div className="mt-3">
                                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Detalhes JSON</div>
                                    <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                                        {JSON.stringify(details, null, 2)}
                                    </pre>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </article>
        </div>
    );
}

function Detail({ label, value, mono = false }: { label: string; value?: unknown; mono?: boolean }) {
    const text = value == null || String(value).trim() === "" ? "—" : String(value);
    return (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
            <div className={`mt-1 break-all text-slate-700 ${mono ? "font-mono text-[11px]" : "font-semibold"}`}>{text}</div>
        </div>
    );
}

export default function AuditoriaHomenagensPage() {
    const initial = useMemo(() => defaultPeriod(), []);
    const [inicio, setInicio] = useState(initial.start);
    const [fim, setFim] = useState(initial.end);
    const [evento, setEvento] = useState<EventFilter>("todos");
    const [origem, setOrigem] = useState<OriginFilter>("todos");
    const [busca, setBusca] = useState("");
    const [buscaAplicada, setBuscaAplicada] = useState("");
    const [page, setPage] = useState(1);
    const [limit] = useState(100);

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const loadLogs = useCallback(async (targetPage = page) => {
        setLoading(true);
        setError("");

        try {
            const data = await apiPost({
                acao: "admin_listar_logs_moderacao",
                inicio,
                fim,
                evento: evento === "todos" ? null : evento,
                origem: origem === "todos" ? null : origem,
                q: buscaAplicada.trim() || null,
                page: targetPage,
                limite: limit,
            });

            const rows = Array.isArray(data.logs) ? data.logs : Array.isArray(data.itens) ? data.itens : [];
            setLogs(rows.map((row: any) => ({
                ...row,
                id: safeNumber(row?.id),
                homenagem_id: row?.homenagem_id == null ? null : safeNumber(row.homenagem_id),
                envio_id: row?.envio_id == null ? null : safeNumber(row.envio_id),
                confianca: row?.confianca == null ? null : Number(row.confianca),
                detalhes_json:
                    typeof row?.detalhes_json === "string"
                        ? (() => {
                            try { return JSON.parse(row.detalhes_json); } catch { return row.detalhes_json; }
                        })()
                        : row?.detalhes_json,
            })));
            setTotal(safeNumber(data.total, rows.length));
            setPage(safeNumber(data.page ?? data.pagina, targetPage) || targetPage);
            setLastUpdate(new Date());
        } catch (err: any) {
            setLogs([]);
            setTotal(0);
            setError(err?.message || "Não foi possível carregar os logs de auditoria.");
        } finally {
            setLoading(false);
        }
    }, [inicio, fim, evento, origem, buscaAplicada, limit, page]);

    useEffect(() => {
        loadLogs(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inicio, fim, evento, origem, buscaAplicada]);

    const grouped = useMemo(() => {
        const groups = new Map<string, AuditLog[]>();
        for (const item of logs) {
            const date = parseApiDate(item.criado_em);
            const key = date ? toDateInput(date) : "sem-data";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(item);
        }
        return Array.from(groups.entries());
    }, [logs]);

    const stats = useMemo(() => {
        let aurora = 0;
        let approved = 0;
        let rejected = 0;
        let review = 0;

        for (const log of logs) {
            if (normalizeOrigin(log.origem) === "aurora" || log.evento === "analise_ia") aurora += 1;
            if (log.evento === "aprovacao_automatica" || log.evento === "aprovacao_manual") approved += 1;
            if (["reprovacao_automatica", "reprovacao_manual", "exclusao_automatica"].includes(String(log.evento))) rejected += 1;
            if (log.evento === "analise_ia" && String(log.decisao_ia || "").toLowerCase() === "revisar") review += 1;
        }

        return { aurora, approved, rejected, review };
    }, [logs]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    function applySearch(e?: React.FormEvent) {
        e?.preventDefault();
        setPage(1);
        setBuscaAplicada(busca.trim());
    }

    function clearFilters() {
        const p = defaultPeriod();
        setInicio(p.start);
        setFim(p.end);
        setEvento("todos");
        setOrigem("todos");
        setBusca("");
        setBuscaAplicada("");
        setPage(1);
    }

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
                <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-bold text-violet-700">
                            <IconShieldCheck className="h-5 w-5" />
                            Auditoria da Aurora
                        </div>
                        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                            Linha do tempo das homenagens
                        </h1>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                            Histórico de recebimentos, análises da Aurora, aprovações, reprovações e intervenções manuais.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {lastUpdate ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                                <IconClock className="h-4 w-4" />
                                Atualizado {lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => loadLogs(page)}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                        >
                            <IconRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                            Atualizar
                        </button>
                    </div>
                </header>

                <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                        <IconFilter className="h-4 w-4" />
                        Filtros
                    </div>

                    <form onSubmit={applySearch} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[170px_170px_220px_200px_minmax(240px,1fr)_auto] xl:items-end">
                        <FilterField label="Data inicial">
                            <div className="relative">
                                <IconCalendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="date"
                                    value={inicio}
                                    onChange={(e) => { setPage(1); setInicio(e.target.value); }}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                                />
                            </div>
                        </FilterField>

                        <FilterField label="Data final">
                            <div className="relative">
                                <IconCalendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="date"
                                    value={fim}
                                    onChange={(e) => { setPage(1); setFim(e.target.value); }}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                                />
                            </div>
                        </FilterField>

                        <FilterField label="Evento">
                            <select
                                value={evento}
                                onChange={(e) => { setPage(1); setEvento(e.target.value as EventFilter); }}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                            >
                                {EVENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </FilterField>

                        <FilterField label="Origem">
                            <select
                                value={origem}
                                onChange={(e) => { setPage(1); setOrigem(e.target.value as OriginFilter); }}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                            >
                                {ORIGIN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </FilterField>

                        <FilterField label="Buscar">
                            <div className="relative">
                                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={busca}
                                    onChange={(e) => setBusca(e.target.value)}
                                    placeholder="Nome, mensagem, envio, homenagem, motivo..."
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                                />
                            </div>
                        </FilterField>

                        <div className="flex gap-2">
                            <button
                                type="submit"
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"
                            >
                                <IconSearch className="h-4 w-4" />
                                Filtrar
                            </button>
                            <button
                                type="button"
                                onClick={clearFilters}
                                title="Limpar filtros"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                            >
                                <IconX className="h-4 w-4" />
                            </button>
                        </div>
                    </form>
                </section>

                <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Eventos no resultado" value={logs.length} icon={IconActivity} />
                    <SummaryCard label="Eventos da Aurora" value={stats.aurora} icon={IconRobot} />
                    <SummaryCard label="Aprovações" value={stats.approved} icon={IconCheck} />
                    <SummaryCard label="Reprovações" value={stats.rejected} icon={IconAlertTriangle} />
                </section>

                {error ? (
                    <section className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <div className="flex items-start gap-2">
                            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                            <div>
                                <div className="font-bold">Não foi possível carregar a auditoria.</div>
                                <div className="mt-1">{error}</div>
                                <div className="mt-2 text-xs text-red-600">
                                    O endpoint <code className="rounded bg-red-100 px-1 py-0.5">admin_listar_logs_moderacao</code> precisa estar disponível no homenagens.php.
                                </div>
                            </div>
                        </div>
                    </section>
                ) : null}

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-950">Linha do tempo</h2>
                            <div className="text-xs text-slate-500">
                                {total.toLocaleString("pt-BR")} evento{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}

                            </div>
                        </div>
                        {totalPages > 1 ? (
                            <div className="text-xs font-semibold text-slate-500">Página {page} de {totalPages}</div>
                        ) : null}
                    </div>

                    {loading ? (
                        <div className="flex min-h-[280px] items-center justify-center">
                            <div className="text-center text-sm text-slate-500">
                                <IconRefresh className="mx-auto mb-3 h-6 w-6 animate-spin" />
                                Carregando auditoria...
                            </div>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60">
                            <div className="max-w-md px-6 text-center">
                                <IconActivity className="mx-auto h-9 w-9 text-slate-300" />
                                <div className="mt-3 font-bold text-slate-700">Nenhum evento encontrado</div>
                                <div className="mt-1 text-sm text-slate-500">Altere o período ou os filtros para consultar outros registros.</div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-7">
                            {grouped.map(([day, items]) => (
                                <div key={day}>
                                    <div className="sticky top-0 z-20 mb-4 flex items-center gap-3 bg-white/95 py-2 backdrop-blur">
                                        <div className="h-px flex-1 bg-slate-200" />
                                        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold capitalize text-slate-600 shadow-sm">
                                            {formatDay(items[0]?.criado_em)}
                                        </div>
                                        <div className="h-px flex-1 bg-slate-200" />
                                    </div>

                                    <div>
                                        {items.map((item, index) => (
                                            <TimelineItem key={item.id} item={item} isLast={index === items.length - 1} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && totalPages > 1 ? (
                        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                            <div className="text-xs text-slate-500">
                                Mostrando até {limit} registros por página.
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={page <= 1 || loading}
                                    onClick={() => loadLogs(page - 1)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Anterior
                                </button>
                                <span className="min-w-20 text-center text-sm font-semibold text-slate-600">{page} / {totalPages}</span>
                                <button
                                    type="button"
                                    disabled={page >= totalPages || loading}
                                    onClick={() => loadLogs(page + 1)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Próxima
                                </button>
                            </div>
                        </div>
                    ) : null}
                </section>
            </div>
        </main>
    );
}
