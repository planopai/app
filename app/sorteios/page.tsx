"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * =========================================================
 * Tipos
 * =========================================================
 */
type SorteioStatus = "draft" | "scheduled" | "running" | "done" | "canceled";

type Sorteio = {
    id: number;
    titulo: string;
    descricao: string | null;
    scheduled_at: string | null;
    executed_at: string | null;
    status: SorteioStatus;
    created_at?: string;
};

type Premio = {
    id: number;
    nome: string;
    ordem: number;
    created_at?: string;
};

type Resultado = {
    id?: number;
    cpf: string;
    nome: string;
    created_at?: string;
    premio_id: number;
    premio_nome: string;
    ordem?: number;
};

type DashboardResp = {
    ok: boolean;
    sorteio: Sorteio | null;
    premios: Premio[];
    resultados: Resultado[];
    error?: string;
};

type PoolStatsResp = {
    ok: boolean;
    eligible_total?: number;
    calculated_at?: string;
    took_ms?: number;
    cached_ttl_s?: number;
    diag?: Record<string, unknown>;
    error?: string;
    detail?: string;
};

type ApiResp<T = unknown> = { ok: boolean; error?: string } & T;

/**
 * =========================================================
 * Configurações
 * =========================================================
 */
const API_URL =
    process.env.NEXT_PUBLIC_SORTEIOS_API_URL ||
    "https://api.planoassistencialintegrado.com.br/sorteios.php";

/**
 * Uso opcional.
 * Atenção: NEXT_PUBLIC_* fica exposto ao browser.
 * O ideal é usar proxy server-side ou sessão protegida.
 */
const ADMIN_TOKEN = process.env.NEXT_PUBLIC_SORTEIOS_ADMIN_TOKEN || "";

/**
 * Se true, carrega estatísticas automaticamente
 * após o dashboard. Como o backend agora está otimizado,
 * isso pode ser usado, mas continua sendo uma operação
 * potencialmente mais pesada que o dashboard.
 */
const AUTO_LOAD_STATS = true;

/**
 * =========================================================
 * Helpers de data / hora
 * =========================================================
 */
function pad2(value: number) {
    return String(value).padStart(2, "0");
}

function dateToLocalInputValue(date: Date) {
    return [
        date.getFullYear(),
        "-",
        pad2(date.getMonth() + 1),
        "-",
        pad2(date.getDate()),
        "T",
        pad2(date.getHours()),
        ":",
        pad2(date.getMinutes()),
    ].join("");
}

function mysqlToLocalInputValue(mysqlDatetime?: string | null) {
    if (!mysqlDatetime) return "";
    const normalized = mysqlDatetime.replace(" ", "T");
    const dt = new Date(normalized);
    if (Number.isNaN(dt.getTime())) return "";
    return dateToLocalInputValue(dt);
}

function localInputToMysql(value: string) {
    if (!value) return "";
    const [d, t] = value.split("T");
    if (!d || !t) return "";
    return `${d} ${t}:00`;
}

function formatBR(mysqlDatetime?: string | null) {
    if (!mysqlDatetime) return "—";
    const normalized = mysqlDatetime.replace(" ", "T");
    const dt = new Date(normalized);
    if (Number.isNaN(dt.getTime())) return mysqlDatetime;
    return dt.toLocaleString("pt-BR");
}

function maskCpf(cpf: string) {
    const digits = cpf.replace(/\D+/g, "");
    if (digits.length !== 11) return cpf;
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/**
 * =========================================================
 * API helper
 * =========================================================
 */
async function apiJson<T = unknown>(
    url: string,
    method: "GET" | "POST",
    body?: unknown,
    signal?: AbortSignal
): Promise<T> {
    const headers: Record<string, string> = {
        Accept: "application/json",
    };

    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    if (ADMIN_TOKEN) {
        headers["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    }

    const res = await fetch(url, {
        method,
        signal,
        credentials: "include",
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
    });

    const text = await res.text();

    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        data = {
            ok: false,
            error: "Resposta inválida do servidor",
            raw: text,
        };
    }

    if (!res.ok) {
        throw new Error(data?.error || `Erro HTTP ${res.status}`);
    }

    return data as T;
}

/**
 * =========================================================
 * Página
 * =========================================================
 */
export default function SorteiosAdminPage() {
    /**
     * -----------------------------------------
     * Estados de dashboard
     * -----------------------------------------
     */
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState<string | null>(null);
    const [dashboard, setDashboard] = useState<DashboardResp | null>(null);

    /**
     * -----------------------------------------
     * Estados de estatísticas
     * -----------------------------------------
     */
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [stats, setStats] = useState<PoolStatsResp | null>(null);

    /**
     * -----------------------------------------
     * Estados de ações
     * -----------------------------------------
     */
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    /**
     * -----------------------------------------
     * Formulário
     * -----------------------------------------
     */
    const [titulo, setTitulo] = useState("Sorteio");
    const [descricao, setDescricao] = useState("");
    const [status, setStatus] = useState<SorteioStatus>("draft");
    const [scheduledAtInput, setScheduledAtInput] = useState("");
    const [premiosText, setPremiosText] = useState("");

    /**
     * -----------------------------------------
     * Refs para abort
     * -----------------------------------------
     */
    const dashboardAbortRef = useRef<AbortController | null>(null);
    const statsAbortRef = useRef<AbortController | null>(null);
    const autoStatsTriggeredRef = useRef(false);

    const sorteio = dashboard?.sorteio ?? null;

    const premiosList = useMemo(() => {
        return premiosText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
    }, [premiosText]);

    const hasResults = (dashboard?.resultados?.length ?? 0) > 0;

    /**
     * =========================================================
     * Carregar dashboard
     * =========================================================
     */
    const loadDashboard = useCallback(async () => {
        dashboardAbortRef.current?.abort();
        const ac = new AbortController();
        dashboardAbortRef.current = ac;

        setDashboardLoading(true);
        setDashboardError(null);

        try {
            const data = await apiJson<DashboardResp>(
                `${API_URL}?op=admin_dashboard&_=${Date.now()}`,
                "GET",
                undefined,
                ac.signal
            );

            if (!data?.ok) {
                throw new Error(data?.error || "Falha ao carregar dashboard");
            }

            setDashboard(data);

            if (data.sorteio) {
                setTitulo(data.sorteio.titulo || "Sorteio");
                setDescricao(data.sorteio.descricao || "");
                setStatus(data.sorteio.status);
                setScheduledAtInput(mysqlToLocalInputValue(data.sorteio.scheduled_at));
            } else {
                setTitulo("Sorteio");
                setDescricao("");
                setStatus("draft");

                const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
                setScheduledAtInput(dateToLocalInputValue(inOneHour));
            }

            const premiosDb = (data.premios || [])
                .slice()
                .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
                .map((p) => p.nome);

            setPremiosText(premiosDb.join("\n"));
        } catch (error: any) {
            if (error?.name === "AbortError") return;

            setDashboard(null);
            setDashboardError(error?.message || "Falha ao carregar dashboard");
        } finally {
            setDashboardLoading(false);
        }
    }, []);

    /**
     * =========================================================
     * Carregar estatísticas
     * =========================================================
     */
    const loadStats = useCallback(async () => {
        statsAbortRef.current?.abort();
        const ac = new AbortController();
        statsAbortRef.current = ac;

        setStatsLoading(true);
        setStatsError(null);

        try {
            const data = await apiJson<PoolStatsResp>(
                `${API_URL}?op=admin_pool_stats&_=${Date.now()}`,
                "GET",
                undefined,
                ac.signal
            );

            if (!data?.ok) {
                setStats(data || null);
                throw new Error(data?.error || "Falha ao calcular elegíveis");
            }

            setStats(data);
        } catch (error: any) {
            if (error?.name === "AbortError") return;
            setStats(null);
            setStatsError(error?.message || "Falha ao calcular elegíveis");
        } finally {
            setStatsLoading(false);
        }
    }, []);

    /**
     * =========================================================
     * Montagem inicial
     * =========================================================
     */
    useEffect(() => {
        void loadDashboard();

        return () => {
            dashboardAbortRef.current?.abort();
            statsAbortRef.current?.abort();
        };
    }, [loadDashboard]);

    /**
     * =========================================================
     * Auto-load de stats
     * =========================================================
     */
    useEffect(() => {
        if (!AUTO_LOAD_STATS) return;
        if (dashboardLoading) return;
        if (dashboardError) return;
        if (autoStatsTriggeredRef.current) return;

        autoStatsTriggeredRef.current = true;

        const timeout = window.setTimeout(() => {
            void loadStats();
        }, 350);

        return () => window.clearTimeout(timeout);
    }, [dashboardLoading, dashboardError, loadStats]);

    /**
     * =========================================================
     * Salvar sorteio
     * =========================================================
     */
    async function saveSorteio(): Promise<number | null> {
        setActionLoading(true);
        setActionError(null);

        try {
            const payload = {
                id: sorteio?.id ?? undefined,
                titulo: titulo.trim() || "Sorteio",
                descricao: descricao.trim(),
                scheduled_at: localInputToMysql(scheduledAtInput),
                status,
            };

            const response = await apiJson<ApiResp<{ id?: number }>>(
                `${API_URL}?op=admin_save_sorteio`,
                "POST",
                payload
            );

            if (!response?.ok) {
                throw new Error(response?.error || "Falha ao salvar sorteio");
            }

            await loadDashboard();
            return response.id ?? null;
        } catch (error: any) {
            setActionError(error?.message || "Falha ao salvar sorteio");
            return null;
        } finally {
            setActionLoading(false);
        }
    }

    /**
     * =========================================================
     * Salvar prêmios
     * =========================================================
     */
    async function savePremios() {
        setActionLoading(true);
        setActionError(null);

        try {
            let sorteioId = sorteio?.id ?? 0;

            if (!sorteioId) {
                const newId = await saveSorteio();
                sorteioId = newId ?? 0;
            }

            if (!sorteioId) {
                throw new Error("Crie o sorteio antes de salvar os prêmios.");
            }

            if (premiosList.length === 0) {
                throw new Error("Informe pelo menos um prêmio.");
            }

            const response = await apiJson<ApiResp<{ premios_total?: number }>>(
                `${API_URL}?op=admin_set_premios`,
                "POST",
                {
                    sorteio_id: sorteioId,
                    premios: premiosList,
                }
            );

            if (!response?.ok) {
                throw new Error(response?.error || "Falha ao salvar prêmios");
            }

            await loadDashboard();
        } catch (error: any) {
            setActionError(error?.message || "Falha ao salvar prêmios");
        } finally {
            setActionLoading(false);
        }
    }

    /**
     * =========================================================
     * Executar sorteio
     * =========================================================
     */
    async function runNow(force = false) {
        setActionLoading(true);
        setActionError(null);

        try {
            const sorteioId = sorteio?.id ?? 0;
            if (!sorteioId) {
                throw new Error("Crie o sorteio antes de executar.");
            }

            if (premiosList.length === 0) {
                throw new Error("Cadastre os prêmios antes de executar.");
            }

            const response = await apiJson<ApiResp<{ eligible_total?: number; took_ms?: number }>>(
                `${API_URL}?op=admin_run`,
                "POST",
                {
                    sorteio_id: sorteioId,
                    force: force ? 1 : 0,
                }
            );

            if (!response?.ok) {
                throw new Error(response?.error || "Falha ao executar sorteio");
            }

            await loadDashboard();
            void loadStats();
        } catch (error: any) {
            setActionError(error?.message || "Falha ao executar sorteio");
        } finally {
            setActionLoading(false);
        }
    }

    /**
     * =========================================================
     * Loading inicial
     * =========================================================
     */
    if (dashboardLoading) {
        return (
            <main className="min-h-[70vh] grid place-items-center px-4">
                <div className="text-center">
                    <div className="mb-4 inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-gray-300 border-t-emerald-600" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Carregando admin de sorteios…
                    </h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-300">Aguarde um instante.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="p-4 sm:p-6 xl:p-8 font-[Nunito]">
            <div className="mx-auto max-w-6xl space-y-6">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Sorteios (Admin)</h1>
                        <p className="mt-2 text-gray-700 dark:text-gray-200">
                            Cadastre prêmios, agende, acompanhe elegíveis e execute o sorteio com segurança.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => void loadDashboard()}
                            disabled={dashboardLoading || actionLoading}
                            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            Atualizar dashboard
                        </button>

                        <button
                            onClick={() => void loadStats()}
                            disabled={statsLoading || actionLoading}
                            title="Recalcula ou usa o cache do total elegível"
                            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            {statsLoading ? "Calculando…" : "Atualizar elegíveis"}
                        </button>
                    </div>
                </header>

                {dashboardError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                        <div className="font-semibold">Erro no dashboard</div>
                        <div className="mt-1">{dashboardError}</div>
                    </div>
                ) : null}

                {actionError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                        <div className="font-semibold">Erro da ação</div>
                        <div className="mt-1">{actionError}</div>
                    </div>
                ) : null}

                {statsError ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                        <div className="font-semibold">Erro ao calcular elegíveis</div>
                        <div className="mt-1">{statsError}</div>

                        {stats?.diag ? (
                            <pre className="mt-3 overflow-auto rounded-xl bg-white/60 p-3 text-xs text-gray-800 dark:bg-black/30 dark:text-gray-100">
                                {JSON.stringify(stats.diag, null, 2)}
                            </pre>
                        ) : null}
                    </div>
                ) : null}

                {/* Configuração */}
                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            Configuração do sorteio
                        </h2>
                    </div>

                    <div className="space-y-4 p-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Título
                                </label>
                                <input
                                    value={titulo}
                                    onChange={(e) => setTitulo(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                    placeholder="Ex.: Sorteio de Natal"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Status
                                </label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as SorteioStatus)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                >
                                    <option value="draft">Rascunho</option>
                                    <option value="scheduled">Agendado</option>
                                    <option value="canceled">Cancelado</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Descrição
                            </label>
                            <textarea
                                value={descricao}
                                onChange={(e) => setDescricao(e.target.value)}
                                rows={3}
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                placeholder="Descrição opcional do sorteio"
                            />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Data/Hora do sorteio
                                </label>
                                <input
                                    type="datetime-local"
                                    value={scheduledAtInput}
                                    onChange={(e) => setScheduledAtInput(e.target.value)}
                                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                />
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30">
                                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300">Situação atual</div>

                                <div className="mt-2 space-y-1 text-sm text-gray-900 dark:text-gray-100">
                                    <div>
                                        <span className="font-semibold">ID:</span> {sorteio?.id ?? "—"}
                                    </div>
                                    <div>
                                        <span className="font-semibold">Status:</span> {sorteio?.status ?? "—"}
                                    </div>
                                    <div>
                                        <span className="font-semibold">Agendado:</span> {formatBR(sorteio?.scheduled_at)}
                                    </div>
                                    <div>
                                        <span className="font-semibold">Executado:</span> {formatBR(sorteio?.executed_at)}
                                    </div>
                                    <div className="pt-2">
                                        <span className="font-semibold">Titulares ativos e em dia:</span>{" "}
                                        {statsLoading ? "Calculando…" : stats?.ok ? stats.eligible_total ?? "—" : "—"}
                                    </div>

                                    {stats?.ok ? (
                                        <div className="pt-1 text-xs text-gray-600 dark:text-gray-300">
                                            {stats.calculated_at ? (
                                                <>
                                                    Calculado em <b>{new Date(stats.calculated_at).toLocaleString("pt-BR")}</b>.{" "}
                                                </>
                                            ) : null}
                                            {typeof stats.took_ms === "number" ? (
                                                <>
                                                    Tempo: <b>{stats.took_ms}ms</b>.{" "}
                                                </>
                                            ) : null}
                                            {typeof stats.cached_ttl_s === "number" ? (
                                                <>
                                                    Cache: <b>{stats.cached_ttl_s}s</b>.
                                                </>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => void saveSorteio()}
                                disabled={actionLoading}
                                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {actionLoading ? "Processando..." : "Salvar sorteio"}
                            </button>

                            <button
                                onClick={() => void runNow(false)}
                                disabled={actionLoading || !sorteio?.id || premiosList.length === 0}
                                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Executar agora
                            </button>

                            <button
                                onClick={() => void runNow(true)}
                                disabled={actionLoading || !sorteio?.id || premiosList.length === 0}
                                className="inline-flex items-center justify-center rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:text-red-200 dark:hover:bg-red-950/30"
                            >
                                Re-sortear (FORCE)
                            </button>
                        </div>
                    </div>
                </section>

                {/* Prêmios */}
                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            Prêmios (1 por linha)
                        </h2>
                    </div>

                    <div className="space-y-3 p-5">
                        <textarea
                            value={premiosText}
                            onChange={(e) => setPremiosText(e.target.value)}
                            rows={8}
                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            placeholder={`Ex.:
1 Televisor 50"
1 Smartphone
1 Air Fryer`}
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                                Total: <b>{premiosList.length}</b> prêmio(s)
                            </div>

                            <button
                                onClick={() => void savePremios()}
                                disabled={actionLoading}
                                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {actionLoading ? "Processando..." : "Salvar prêmios"}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Resultados */}
                <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Resultados</h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                        Prêmio
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                        Associado(a)
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                        CPF
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {!hasResults ? (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-6 text-sm text-gray-600 dark:text-gray-300">
                                            Nenhum resultado ainda. Execute o sorteio para gerar os vencedores.
                                        </td>
                                    </tr>
                                ) : (
                                    (dashboard?.resultados || []).map((r, idx) => (
                                        <tr key={`${r.premio_id}-${idx}`} className="h-12">
                                            <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                                                {r.premio_nome}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                                                {r.nome}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-200">
                                                {maskCpf(r.cpf)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">
                        Executado em: <b>{formatBR(sorteio?.executed_at || null)}</b>
                    </div>
                </section>

                {/* Diagnóstico */}
                {stats?.diag ? (
                    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Diagnóstico técnico
                            </h2>
                        </div>

                        <div className="p-5">
                            <pre className="overflow-auto rounded-xl bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-100">
                                {JSON.stringify(stats.diag, null, 2)}
                            </pre>
                        </div>
                    </section>
                ) : null}
            </div>
        </main>
    );
}