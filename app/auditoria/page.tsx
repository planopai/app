"use client";

import React, {
    FormEvent,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    IconActivity,
    IconAlertTriangle,
    IconBell,
    IconBox,
    IconBuildingWarehouse,
    IconCalendar,
    IconCar,
    IconChevronDown,
    IconChevronUp,
    IconClipboardCheck,
    IconClock,
    IconFilter,
    IconFlower,
    IconHeartHandshake,
    IconRefresh,
    IconSearch,
    IconShieldCheck,
    IconTimeline,
    IconUser,
    IconUsers,
    IconX,
} from "@tabler/icons-react";

const API_URL =
    "https://api.planoassistencialintegrado.com.br/auditoria.php";

type AuditModule =
    | "atendimentos"
    | "estoque"
    | "requisicoes"
    | "coroas"
    | "telemetria"
    | "visitas"
    | "pos_atendimento"
    | "homenagens"
    | "avisos"
    | string;

type AuditLog = {
    id: string;
    source?: string | null;
    source_id?: number | string | null;

    datahora: string;

    usuario_id?: number | null;
    usuario_nome?: string | null;
    usuario_login?: string | null;

    modulo: AuditModule;
    categoria?: string | null;
    acao: string;

    titulo: string;
    descricao?: string | null;

    entidade?: string | null;
    entidade_id?: number | string | null;

    status_anterior?: string | null;
    status_novo?: string | null;

    origem?: string | null;
    detalhes?: any;
};

type SelectOption = {
    value: string;
    label: string;
};

type UserOption = {
    id: number;
    nome?: string | null;
    usuario?: string | null;
};

type ApiResponse = {
    ok?: boolean;
    logs?: AuditLog[];
    total?: number;
    page?: number;
    limite?: number;
    total_pages?: number;
    categorias?: SelectOption[];
    usuarios?: UserOption[];
    acoes?: SelectOption[];
    warnings?: Array<{ modulo?: string; msg?: string }>;
    msg?: string;
    message?: string;
    erro?: boolean | string;
};

function pad2(value: number) {
    return String(value).padStart(2, "0");
}

function toDateInput(date: Date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
        date.getDate()
    )}`;
}

function defaultPeriod() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    return {
        start: toDateInput(start),
        end: toDateInput(end),
    };
}

function parseApiDate(value?: string | null): Date | null {
    const raw = String(value ?? "").trim();

    if (!raw) return null;

    const normalized = raw.includes("T")
        ? raw
        : raw.replace(" ", "T");

    const date = new Date(normalized);

    return Number.isNaN(date.getTime())
        ? null
        : date;
}

function formatTime(value?: string | null) {
    const date = parseApiDate(value);

    if (!date) return "--:--:--";

    return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function formatDateTime(value?: string | null) {
    const date = parseApiDate(value);

    if (!date) return String(value ?? "—");

    return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
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

function normalizeText(value?: string | null) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}

function humanize(value?: string | null) {
    const raw = String(value ?? "")
        .trim()
        .replace(/[_-]+/g, " ");

    if (!raw) return "Evento";

    return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

function moduleMeta(module: AuditModule) {
    switch (module) {
        case "atendimentos":
            return {
                label: "Atendimentos",
                icon: IconUsers,
                badge:
                    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
                dot: "bg-violet-500",
            };

        case "estoque":
            return {
                label: "Estoque",
                icon: IconBuildingWarehouse,
                badge:
                    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
                dot: "bg-sky-500",
            };

        case "requisicoes":
            return {
                label: "Requisições",
                icon: IconClipboardCheck,
                badge:
                    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                dot: "bg-amber-500",
            };

        case "coroas":
            return {
                label: "Coroas",
                icon: IconFlower,
                badge:
                    "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-300",
                dot: "bg-pink-500",
            };

        case "telemetria":
            return {
                label: "Telemetria",
                icon: IconCar,
                badge:
                    "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
                dot: "bg-cyan-500",
            };

        case "visitas":
            return {
                label: "Visitas",
                icon: IconHeartHandshake,
                badge:
                    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                dot: "bg-emerald-500",
            };

        case "pos_atendimento":
            return {
                label: "Pós-Atendimento",
                icon: IconShieldCheck,
                badge:
                    "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
                dot: "bg-teal-500",
            };

        case "homenagens":
            return {
                label: "Homenagens",
                icon: IconActivity,
                badge:
                    "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
                dot: "bg-fuchsia-500",
            };

        case "avisos":
            return {
                label: "Avisos",
                icon: IconBell,
                badge:
                    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
                dot: "bg-orange-500",
            };

        default:
            return {
                label: humanize(module),
                icon: IconActivity,
                badge:
                    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
                dot: "bg-slate-400",
            };
    }
}

function displayUser(item: AuditLog) {
    return (
        String(item.usuario_nome ?? "").trim()
        || String(item.usuario_login ?? "").trim()
        || (
            normalizeText(item.origem).includes("aurora")
                ? "Aurora"
                : "Sistema"
        )
    );
}

function parseDetails(value: unknown) {
    if (!value) return null;

    if (typeof value === "object") {
        return value;
    }

    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    return value;
}

async function apiPost(
    payload: Record<string, unknown>
): Promise<ApiResponse> {
    const response = await fetch(API_URL, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = (await response
        .json()
        .catch(() => null)) as ApiResponse | null;

    if (
        !response.ok
        || !data
        || data.ok === false
        || data.erro
    ) {
        const msg =
            data?.msg
            || data?.message
            || (
                typeof data?.erro === "string"
                    ? data.erro
                    : ""
            )
            || "Falha ao carregar a auditoria.";

        throw new Error(msg);
    }

    return data;
}

function FilterField({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="space-y-1.5">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {label}
            </span>

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
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                    <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                    <div className="text-2xl font-bold leading-none text-slate-950 dark:text-white">
                        {value}
                    </div>

                    <div className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {label}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Detail({
    label,
    value,
    mono = false,
}: {
    label: string;
    value?: unknown;
    mono?: boolean;
}) {
    const text =
        value == null || String(value).trim() === ""
            ? "—"
            : String(value);

    return (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {label}
            </div>

            <div
                className={[
                    "mt-1 break-all text-slate-700 dark:text-slate-200",
                    mono
                        ? "font-mono text-[11px]"
                        : "font-semibold",
                ].join(" ")}
            >
                {text}
            </div>
        </div>
    );
}

function TimelineItem({
    item,
    isLast,
}: {
    item: AuditLog;
    isLast: boolean;
}) {
    const [expanded, setExpanded] = useState(false);

    const meta = moduleMeta(item.modulo);
    const Icon = meta.icon;
    const details = parseDetails(item.detalhes);

    return (
        <div className="relative grid grid-cols-[74px_20px_minmax(0,1fr)] gap-2 sm:grid-cols-[92px_24px_minmax(0,1fr)] sm:gap-3 md:grid-cols-[112px_28px_minmax(0,1fr)]">
            <div className="pt-1 text-right">
                <div className="text-xs font-bold tabular-nums text-slate-800 sm:text-sm dark:text-slate-200">
                    {formatTime(item.datahora)}
                </div>

                <div className="mt-0.5 hidden text-[10px] text-slate-400 sm:block">
                    {item.source_id != null
                        ? `#${item.source_id}`
                        : ""}
                </div>
            </div>

            <div className="relative flex justify-center">
                {!isLast ? (
                    <div className="absolute bottom-[-12px] top-5 w-px bg-slate-200 dark:bg-slate-800" />
                ) : null}

                <div
                    className={[
                        "relative z-10 mt-1.5 h-3 w-3 rounded-full ring-4 ring-slate-50 dark:ring-slate-950",
                        meta.dot,
                    ].join(" ")}
                />
            </div>

            <article className="mb-3 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                        <div
                            className={[
                                "mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border sm:flex",
                                meta.badge,
                            ].join(" ")}
                        >
                            <Icon className="h-4.5 w-4.5" />
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                    className={[
                                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold sm:text-[11px]",
                                        meta.badge,
                                    ].join(" ")}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {meta.label}
                                </span>

                                <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                    <IconUser className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">
                                        {displayUser(item)}
                                    </span>
                                </span>

                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                                    {humanize(item.acao)}
                                </span>
                            </div>

                            <div className="mt-2 text-sm font-bold leading-5 text-slate-950 sm:text-[15px] dark:text-white">
                                {item.titulo}
                            </div>

                            {item.descricao ? (
                                <div className="mt-1 break-words text-xs leading-5 text-slate-600 sm:text-sm dark:text-slate-400">
                                    {item.descricao}
                                </div>
                            ) : null}

                            {(item.status_anterior || item.status_novo) ? (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs">
                                    <span className="text-slate-400">
                                        Status:
                                    </span>

                                    <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                        {item.status_anterior || "—"}
                                    </span>

                                    <span className="text-slate-400">
                                        →
                                    </span>

                                    <span className="rounded-lg bg-slate-950 px-2 py-1 font-semibold text-white dark:bg-white dark:text-slate-950">
                                        {item.status_novo || "—"}
                                    </span>
                                </div>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            onClick={() => setExpanded((value) => !value)}
                            className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 sm:text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                            {expanded ? (
                                <IconChevronUp className="h-4 w-4" />
                            ) : (
                                <IconChevronDown className="h-4 w-4" />
                            )}

                            <span className="hidden sm:inline">
                                {expanded ? "Menos" : "Detalhes"}
                            </span>
                        </button>
                    </div>

                    {expanded ? (
                        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                <Detail
                                    label="Data / hora"
                                    value={formatDateTime(item.datahora)}
                                />

                                <Detail
                                    label="Usuário"
                                    value={displayUser(item)}
                                />

                                <Detail
                                    label="Ação"
                                    value={humanize(item.acao)}
                                />

                                <Detail
                                    label="Origem"
                                    value={item.origem}
                                />

                                <Detail
                                    label="Entidade"
                                    value={item.entidade}
                                />

                                <Detail
                                    label="ID da entidade"
                                    value={item.entidade_id}
                                    mono
                                />

                                <Detail
                                    label="Fonte"
                                    value={item.source}
                                />

                                <Detail
                                    label="ID da fonte"
                                    value={item.source_id}
                                    mono
                                />
                            </div>

                            {details != null ? (
                                <div className="mt-3">
                                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        Detalhes técnicos
                                    </div>

                                    <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] leading-5 text-slate-100 sm:text-[11px]">
                                        {typeof details === "string"
                                            ? details
                                            : JSON.stringify(
                                                details,
                                                null,
                                                2
                                            )}
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

export default function AuditoriaGeralPage() {
    const initial = useMemo(() => defaultPeriod(), []);

    const [inicio, setInicio] = useState(initial.start);
    const [fim, setFim] = useState(initial.end);

    const [categoria, setCategoria] = useState("todos");
    const [usuarioId, setUsuarioId] = useState("");
    const [acao, setAcao] = useState("");

    const [busca, setBusca] = useState("");
    const [buscaAplicada, setBuscaAplicada] = useState("");

    const [page, setPage] = useState(1);
    const [limit] = useState(100);

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    const [categorias, setCategorias] = useState<SelectOption[]>([
        {
            value: "todos",
            label: "Todas as categorias",
        },
    ]);

    const [usuarios, setUsuarios] = useState<UserOption[]>([]);
    const [acoes, setAcoes] = useState<SelectOption[]>([]);

    const [warnings, setWarnings] = useState<
        Array<{ modulo?: string; msg?: string }>
    >([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [lastUpdate, setLastUpdate] =
        useState<Date | null>(null);

    const loadLogs = useCallback(
        async (targetPage = page) => {
            setLoading(true);
            setError("");

            try {
                const data = await apiPost({
                    acao: "listar",
                    inicio,
                    fim,
                    categoria,
                    usuario_id:
                        usuarioId !== ""
                            ? Number(usuarioId)
                            : null,
                    acao_filtro: acao || null,
                    q: buscaAplicada.trim() || null,
                    page: targetPage,
                    limite: limit,
                });

                const rows = Array.isArray(data.logs)
                    ? data.logs
                    : [];

                setLogs(
                    rows.map((row: AuditLog) => ({
                        ...row,
                        id: String(row.id),
                        detalhes: parseDetails(row.detalhes),
                    }))
                );

                setTotal(
                    safeNumber(
                        data.total,
                        rows.length
                    )
                );

                setPage(
                    Math.max(
                        1,
                        safeNumber(
                            data.page,
                            targetPage
                        )
                    )
                );

                setTotalPages(
                    Math.max(
                        1,
                        safeNumber(
                            data.total_pages,
                            1
                        )
                    )
                );

                if (
                    Array.isArray(data.categorias)
                    && data.categorias.length
                ) {
                    setCategorias(data.categorias);
                }

                if (Array.isArray(data.usuarios)) {
                    setUsuarios(data.usuarios);
                }

                if (Array.isArray(data.acoes)) {
                    setAcoes(data.acoes);
                }

                setWarnings(
                    Array.isArray(data.warnings)
                        ? data.warnings
                        : []
                );

                setLastUpdate(new Date());
            } catch (err: any) {
                setLogs([]);
                setTotal(0);
                setTotalPages(1);
                setWarnings([]);

                setError(
                    err?.message
                    || "Não foi possível carregar os logs de auditoria."
                );
            } finally {
                setLoading(false);
            }
        },
        [
            inicio,
            fim,
            categoria,
            usuarioId,
            acao,
            buscaAplicada,
            limit,
            page,
        ]
    );

    useEffect(() => {
        loadLogs(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        inicio,
        fim,
        categoria,
        usuarioId,
        acao,
        buscaAplicada,
    ]);

    const grouped = useMemo(() => {
        const groups = new Map<string, AuditLog[]>();

        for (const item of logs) {
            const date = parseApiDate(item.datahora);

            const key = date
                ? toDateInput(date)
                : "sem-data";

            if (!groups.has(key)) {
                groups.set(key, []);
            }

            groups.get(key)!.push(item);
        }

        return Array.from(groups.entries());
    }, [logs]);

    const stats = useMemo(() => {
        const modules = new Set<string>();
        const users = new Set<string>();

        let operational = 0;

        for (const log of logs) {
            modules.add(log.modulo);

            const user = displayUser(log);
            if (user) users.add(user);

            if (
                [
                    "estoque",
                    "requisicoes",
                    "atendimentos",
                    "telemetria",
                    "coroas",
                ].includes(log.modulo)
            ) {
                operational += 1;
            }
        }

        return {
            modules: modules.size,
            users: users.size,
            operational,
        };
    }, [logs]);

    function applySearch(
        event?: FormEvent<HTMLFormElement>
    ) {
        event?.preventDefault();

        setPage(1);
        setBuscaAplicada(busca.trim());
    }

    function clearFilters() {
        const period = defaultPeriod();

        setInicio(period.start);
        setFim(period.end);
        setCategoria("todos");
        setUsuarioId("");
        setAcao("");
        setBusca("");
        setBuscaAplicada("");
        setPage(1);
    }

    return (
        <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-6 sm:py-5 lg:px-8">
                <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300">
                            <IconShieldCheck className="h-5 w-5" />
                            Auditoria do Sistema
                        </div>

                        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
                            Linha do tempo geral
                        </h1>

                        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                            Eventos registrados nos módulos do PAI,
                            organizados por data, hora e segundo.
                            Use os filtros para isolar usuário,
                            categoria ou ação.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {lastUpdate ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                                <IconClock className="h-4 w-4" />
                                Atualizado{" "}
                                {lastUpdate.toLocaleTimeString(
                                    "pt-BR",
                                    {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                    }
                                )}
                            </span>
                        ) : null}

                        <button
                            type="button"
                            onClick={() => loadLogs(page)}
                            disabled={loading}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            <IconRefresh
                                className={[
                                    "h-4 w-4",
                                    loading
                                        ? "animate-spin"
                                        : "",
                                ].join(" ")}
                            />
                            Atualizar
                        </button>
                    </div>
                </header>

                <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                        <IconFilter className="h-4 w-4" />
                        Filtros
                    </div>

                    <form
                        onSubmit={applySearch}
                        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[160px_160px_190px_230px_220px_minmax(240px,1fr)_auto] xl:items-end"
                    >
                        <FilterField label="Data inicial">
                            <div className="relative">
                                <IconCalendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                                <input
                                    type="date"
                                    value={inicio}
                                    onChange={(event) => {
                                        setPage(1);
                                        setInicio(
                                            event.target.value
                                        );
                                    }}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                />
                            </div>
                        </FilterField>

                        <FilterField label="Data final">
                            <div className="relative">
                                <IconCalendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                                <input
                                    type="date"
                                    value={fim}
                                    onChange={(event) => {
                                        setPage(1);
                                        setFim(
                                            event.target.value
                                        );
                                    }}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                />
                            </div>
                        </FilterField>

                        <FilterField label="Categoria">
                            <select
                                value={categoria}
                                onChange={(event) => {
                                    setPage(1);
                                    setCategoria(
                                        event.target.value
                                    );
                                }}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                                {categorias.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </FilterField>

                        <FilterField label="Usuário">
                            <select
                                value={usuarioId}
                                onChange={(event) => {
                                    setPage(1);
                                    setUsuarioId(
                                        event.target.value
                                    );
                                }}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                                <option value="">
                                    Todos os usuários
                                </option>

                                {usuarios.map((user) => (
                                    <option
                                        key={user.id}
                                        value={user.id}
                                    >
                                        {user.nome
                                            || user.usuario
                                            || `Usuário #${user.id}`}
                                        {user.usuario
                                            && user.nome
                                            && user.usuario !== user.nome
                                            ? ` (${user.usuario})`
                                            : ""}
                                    </option>
                                ))}
                            </select>
                        </FilterField>

                        <FilterField label="Ação">
                            <select
                                value={acao}
                                onChange={(event) => {
                                    setPage(1);
                                    setAcao(
                                        event.target.value
                                    );
                                }}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                                <option value="">
                                    Todas as ações
                                </option>

                                {acoes.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </FilterField>

                        <FilterField label="Buscar">
                            <div className="relative">
                                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                                <input
                                    value={busca}
                                    onChange={(event) =>
                                        setBusca(
                                            event.target.value
                                        )
                                    }
                                    placeholder="Usuário, produto, atendimento, ação..."
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                />
                            </div>
                        </FilterField>

                        <div className="flex gap-2">
                            <button
                                type="submit"
                                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                            >
                                <IconSearch className="h-4 w-4" />
                                Filtrar
                            </button>

                            <button
                                type="button"
                                onClick={clearFilters}
                                title="Limpar filtros"
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                            >
                                <IconX className="h-4 w-4" />
                            </button>
                        </div>
                    </form>
                </section>

                <section className="mb-5 grid gap-3 grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        label="Eventos nesta página"
                        value={logs.length}
                        icon={IconTimeline}
                    />

                    <SummaryCard
                        label="Total encontrado"
                        value={total.toLocaleString("pt-BR")}
                        icon={IconActivity}
                    />

                    <SummaryCard
                        label="Categorias nesta página"
                        value={stats.modules}
                        icon={IconBox}
                    />

                    <SummaryCard
                        label="Usuários nesta página"
                        value={stats.users}
                        icon={IconUser}
                    />
                </section>

                {warnings.length ? (
                    <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        <div className="flex items-start gap-2">
                            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

                            <div>
                                <div className="font-bold">
                                    Algumas fontes não puderam
                                    ser consultadas.
                                </div>

                                <div className="mt-1 text-xs">
                                    A linha do tempo abaixo
                                    continua mostrando os módulos
                                    disponíveis.
                                </div>
                            </div>
                        </div>
                    </section>
                ) : null}

                {error ? (
                    <section className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                        <div className="flex items-start gap-2">
                            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

                            <div>
                                <div className="font-bold">
                                    Não foi possível carregar
                                    a auditoria.
                                </div>

                                <div className="mt-1">
                                    {error}
                                </div>

                                <div className="mt-2 text-xs">
                                    Verifique se{" "}
                                    <code className="rounded bg-red-100 px-1 py-0.5 dark:bg-red-950">
                                        auditoria.php
                                    </code>{" "}
                                    foi publicado no endpoint
                                    configurado nesta página.
                                </div>
                            </div>
                        </div>
                    </section>
                ) : null}

                <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                                Linha do tempo
                            </h2>

                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                {total.toLocaleString("pt-BR")}{" "}
                                evento
                                {total === 1 ? "" : "s"}{" "}
                                encontrado
                                {total === 1 ? "" : "s"}
                            </div>
                        </div>

                        {totalPages > 1 ? (
                            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                Página {page} de {totalPages}
                            </div>
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
                        <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
                            <div className="max-w-md px-6 text-center">
                                <IconTimeline className="mx-auto h-9 w-9 text-slate-300" />

                                <div className="mt-3 font-bold text-slate-700 dark:text-slate-200">
                                    Nenhum evento encontrado
                                </div>

                                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    Altere o período ou os
                                    filtros para consultar
                                    outros registros.
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-7">
                            {grouped.map(([day, items]) => (
                                <div key={day}>
                                    <div className="sticky top-0 z-20 mb-4 flex items-center gap-3 bg-white/95 py-2 backdrop-blur dark:bg-slate-950/95">
                                        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />

                                        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-center text-[10px] font-bold capitalize text-slate-600 shadow-sm sm:text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                            {formatDay(
                                                items[0]?.datahora
                                            )}
                                        </div>

                                        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                                    </div>

                                    <div>
                                        {items.map(
                                            (
                                                item,
                                                index
                                            ) => (
                                                <TimelineItem
                                                    key={
                                                        item.id
                                                    }
                                                    item={
                                                        item
                                                    }
                                                    isLast={
                                                        index
                                                        === items.length
                                                        - 1
                                                    }
                                                />
                                            )
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && totalPages > 1 ? (
                        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                Mostrando até {limit} registros
                                por página.
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={
                                        page <= 1 || loading
                                    }
                                    onClick={() =>
                                        loadLogs(page - 1)
                                    }
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    Anterior
                                </button>

                                <span className="min-w-20 text-center text-sm font-semibold text-slate-600 dark:text-slate-300">
                                    {page} / {totalPages}
                                </span>

                                <button
                                    type="button"
                                    disabled={
                                        page >= totalPages
                                        || loading
                                    }
                                    onClick={() =>
                                        loadLogs(page + 1)
                                    }
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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
