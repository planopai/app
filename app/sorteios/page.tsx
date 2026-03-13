"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    rule?: string;
    strategy?: string;
};

type ApiResp<T = Record<string, never>> = { ok: boolean; error?: string } & T;

type FormState = {
    titulo: string;
    descricao: string;
    status: SorteioStatus;
    scheduledAtInput: string;
    premiosText: string;
};

type ActionKind = "idle" | "saving" | "saving-prizes" | "running" | "rerunning" | "scheduling";

const API_URL =
    process.env.NEXT_PUBLIC_SORTEIOS_API_URL ||
    "https://api.planoassistencialintegrado.com.br/sorteios.php";

/**
 * Observação:
 * Segredos administrativos não deveriam estar expostos no client.
 * Mantido apenas como fallback opcional para compatibilidade com a API atual.
 */
const OPTIONAL_ADMIN_TOKEN = process.env.NEXT_PUBLIC_SORTEIOS_ADMIN_TOKEN || "";

const DEFAULT_TITLE = "Sorteio";
const ELIGIBLE_PROGRESS_TEXT = "Verificando Associados Aptos a Participarem Do Sorteio.";

function pad2(value: number) {
    return String(value).padStart(2, "0");
}

function addOneHour(date = new Date()) {
    return new Date(date.getTime() + 60 * 60 * 1000);
}

function toLocalInputValue(date: Date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
        date.getHours()
    )}:${pad2(date.getMinutes())}`;
}

function parseMysqlDateTime(mysqlDatetime?: string | null) {
    if (!mysqlDatetime) return null;

    const normalized = mysqlDatetime.trim().replace("T", " ");
    const match = normalized.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (!match) return null;

    const [, y, m, d, hh = "00", mm = "00", ss = "00"] = match;
    const date = new Date(
        Number(y),
        Number(m) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        Number(ss),
        0
    );

    return Number.isNaN(date.getTime()) ? null : date;
}

function mysqlToLocalInputValue(mysqlDatetime?: string | null) {
    const dt = parseMysqlDateTime(mysqlDatetime);
    return dt ? toLocalInputValue(dt) : "";
}

function localInputToMysql(value: string) {
    if (!value) return "";
    const [datePart, timePart] = value.split("T");
    if (!datePart || !timePart) return "";
    return `${datePart} ${timePart}:00`;
}

function formatBR(mysqlDatetime?: string | null) {
    const dt = parseMysqlDateTime(mysqlDatetime);
    return dt ? dt.toLocaleString("pt-BR") : mysqlDatetime || "—";
}

function formatIsoDateBR(iso?: string | null) {
    if (!iso) return "—";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("pt-BR");
}

function maskCpf(cpf: string) {
    const digits = cpf.replace(/\D+/g, "");
    if (digits.length !== 11) return cpf;
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

function uniqueTrimmedLines(text: string) {
    const seen = new Set<string>();
    const lines: string[] = [];

    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        if (seen.has(line)) continue;
        seen.add(line);
        lines.push(line);
    }

    return lines;
}

function sanitizeStatus(status?: string | null): SorteioStatus {
    const allowed: SorteioStatus[] = ["draft", "scheduled", "running", "done", "canceled"];
    return allowed.includes(status as SorteioStatus) ? (status as SorteioStatus) : "draft";
}

function getDefaultFormState(): FormState {
    return {
        titulo: DEFAULT_TITLE,
        descricao: "",
        status: "draft",
        scheduledAtInput: toLocalInputValue(addOneHour()),
        premiosText: "",
    };
}

function buildFormFromDashboard(data: DashboardResp | null): FormState {
    const sorteio = data?.sorteio ?? null;

    if (!sorteio) {
        return getDefaultFormState();
    }

    const premiosDb = [...(data?.premios || [])]
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map((p) => p.nome)
        .join("\n");

    return {
        titulo: sorteio.titulo || DEFAULT_TITLE,
        descricao: sorteio.descricao || "",
        status: sanitizeStatus(sorteio.status),
        scheduledAtInput: mysqlToLocalInputValue(sorteio.scheduled_at) || toLocalInputValue(addOneHour()),
        premiosText: premiosDb,
    };
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}

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

    if (OPTIONAL_ADMIN_TOKEN) {
        headers["Authorization"] = `Bearer ${OPTIONAL_ADMIN_TOKEN}`;
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

    let data: unknown;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { ok: false, error: "Resposta inválida do servidor" };
    }

    const parsed =
        typeof data === "object" && data !== null
            ? (data as { ok?: boolean; error?: string })
            : { ok: false, error: "Resposta inválida do servidor" };

    if (!res.ok) {
        throw new Error(parsed.error || `Erro HTTP ${res.status}`);
    }

    return data as T;
}

function Spinner({ size = 18 }: { size?: number }) {
    return (
        <span
            aria-hidden="true"
            className="inline-block animate-spin rounded-full border-2 border-current border-r-transparent"
            style={{ width: size, height: size }}
        />
    );
}

function ProgressOverlay({
    open,
    progress,
    message,
}: {
    open: boolean;
    progress: number;
    message: string;
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-white p-6 shadow-2xl dark:bg-gray-950">
                <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <Spinner size={20} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">
                            Consultando elegíveis
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
                    </div>
                </div>

                <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-300">
                        <span>Aguarde enquanto o progresso termina</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                        <div
                            className="h-full rounded-full bg-emerald-600 transition-[width] duration-200 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SorteiosAdminPage() {
    const dashboardAbortRef = useRef<AbortController | null>(null);
    const statsAbortRef = useRef<AbortController | null>(null);
    const progressTimerRef = useRef<number | null>(null);
    const isMountedRef = useRef(true);
    const hydratedSorteioIdRef = useRef<number | null>(null);

    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState<string | null>(null);
    const [dashboard, setDashboard] = useState<DashboardResp | null>(null);

    const [statsLoading, setStatsLoading] = useState(false);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [stats, setStats] = useState<PoolStatsResp | null>(null);

    const [actionKind, setActionKind] = useState<ActionKind>("idle");
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [form, setForm] = useState<FormState>(getDefaultFormState());
    const [isDirty, setIsDirty] = useState(false);

    const [progressOpen, setProgressOpen] = useState(false);
    const [progressValue, setProgressValue] = useState(0);

    const sorteio = dashboard?.sorteio ?? null;
    const actionLoading = actionKind !== "idle";

    const premiosList = useMemo(() => uniqueTrimmedLines(form.premiosText), [form.premiosText]);

    const hasResults = (dashboard?.resultados?.length ?? 0) > 0;

    const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setIsDirty(true);
    }, []);

    const clearProgressTimer = useCallback(() => {
        if (progressTimerRef.current !== null) {
            window.clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
        }
    }, []);

    const startFakeProgress = useCallback(() => {
        clearProgressTimer();
        setProgressValue(0);
        setProgressOpen(true);

        progressTimerRef.current = window.setInterval(() => {
            setProgressValue((prev) => {
                if (prev >= 90) return prev;
                const increment =
                    prev < 30 ? 7 : prev < 60 ? 5 : prev < 80 ? 3 : 1;
                return Math.min(90, prev + increment);
            });
        }, 160);
    }, [clearProgressTimer]);

    const finishFakeProgress = useCallback(async () => {
        clearProgressTimer();

        await new Promise<void>((resolve) => {
            setProgressValue((prev) => Math.max(prev, 94));
            window.setTimeout(() => {
                setProgressValue(100);
                window.setTimeout(() => {
                    if (isMountedRef.current) {
                        setProgressOpen(false);
                        setProgressValue(0);
                    }
                    resolve();
                }, 280);
            }, 180);
        });
    }, [clearProgressTimer]);

    const hydrateFormFromDashboard = useCallback(
        (data: DashboardResp | null, force = false) => {
            const nextSorteioId = data?.sorteio?.id ?? null;
            const shouldHydrate =
                force ||
                !isDirty ||
                hydratedSorteioIdRef.current !== nextSorteioId;

            if (!shouldHydrate) return;

            hydratedSorteioIdRef.current = nextSorteioId;
            setForm(buildFormFromDashboard(data));
            setIsDirty(false);
        },
        [isDirty]
    );

    const loadDashboard = useCallback(
        async (options?: { preserveForm?: boolean }) => {
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

                if (!isMountedRef.current) return;

                setDashboard(data);
                hydrateFormFromDashboard(data, !options?.preserveForm);
            } catch (error) {
                if ((error as { name?: string })?.name === "AbortError") return;
                if (!isMountedRef.current) return;
                setDashboard(null);
                setDashboardError(getErrorMessage(error, "Falha ao carregar dashboard"));
            } finally {
                if (isMountedRef.current) {
                    setDashboardLoading(false);
                }
            }
        },
        [hydrateFormFromDashboard]
    );

    const loadStats = useCallback(async () => {
        statsAbortRef.current?.abort();
        const ac = new AbortController();
        statsAbortRef.current = ac;

        setStatsLoading(true);
        setStatsError(null);
        startFakeProgress();

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

            if (!isMountedRef.current) return;
            setStats(data);
        } catch (error) {
            if ((error as { name?: string })?.name === "AbortError") return;
            if (!isMountedRef.current) return;
            setStats(null);
            setStatsError(getErrorMessage(error, "Falha ao calcular elegíveis"));
        } finally {
            await finishFakeProgress();
            if (isMountedRef.current) {
                setStatsLoading(false);
            }
        }
    }, [finishFakeProgress, startFakeProgress]);

    const validateBeforePersist = useCallback(() => {
        if (!form.titulo.trim()) {
            throw new Error("Informe um título para o sorteio.");
        }

        if (form.status === "scheduled" && !form.scheduledAtInput) {
            throw new Error("Informe a data e hora do agendamento.");
        }
    }, [form]);

    const saveSorteioCore = useCallback(
        async (override?: Partial<FormState>): Promise<number> => {
            const payloadStatus = sanitizeStatus(override?.status ?? form.status);
            const payloadDate = override?.scheduledAtInput ?? form.scheduledAtInput;

            const payload = {
                id: sorteio?.id ?? undefined,
                titulo: (override?.titulo ?? form.titulo).trim() || DEFAULT_TITLE,
                descricao: (override?.descricao ?? form.descricao).trim(),
                scheduled_at: localInputToMysql(payloadDate),
                status: payloadStatus,
            };

            const response = await apiJson<ApiResp<{ id?: number }>>(
                `${API_URL}?op=admin_save_sorteio`,
                "POST",
                payload
            );

            if (!response?.ok || !response.id) {
                throw new Error(response?.error || "Falha ao salvar sorteio");
            }

            return response.id;
        },
        [form, sorteio?.id]
    );

    const runAction = useCallback(
        async <T,>(
            kind: ActionKind,
            action: () => Promise<T>,
            successText?: string
        ): Promise<T | null> => {
            setActionKind(kind);
            setActionError(null);
            setSuccessMessage(null);

            try {
                const result = await action();
                if (!isMountedRef.current) return null;
                if (successText) setSuccessMessage(successText);
                return result;
            } catch (error) {
                if (!isMountedRef.current) return null;
                setActionError(getErrorMessage(error, "Ocorreu um erro inesperado."));
                return null;
            } finally {
                if (isMountedRef.current) {
                    setActionKind("idle");
                }
            }
        },
        []
    );

    const saveSorteio = useCallback(async () => {
        validateBeforePersist();

        const savedId = await runAction(
            "saving",
            async () => {
                const id = await saveSorteioCore();
                await loadDashboard();
                return id;
            },
            "Sorteio salvo com sucesso."
        );

        return savedId;
    }, [loadDashboard, runAction, saveSorteioCore, validateBeforePersist]);

    const savePremios = useCallback(async () => {
        await runAction(
            "saving-prizes",
            async () => {
                let sorteioId = sorteio?.id ?? 0;

                validateBeforePersist();

                if (!sorteioId) {
                    sorteioId = await saveSorteioCore();
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
                return response;
            },
            "Prêmios salvos com sucesso."
        );
    }, [loadDashboard, premiosList, runAction, saveSorteioCore, sorteio?.id, validateBeforePersist]);

    const scheduleDraw = useCallback(async () => {
        await runAction(
            "scheduling",
            async () => {
                if (!form.scheduledAtInput) {
                    throw new Error("Informe a data e hora para agendar o sorteio.");
                }

                if (premiosList.length === 0) {
                    throw new Error("Cadastre pelo menos um prêmio antes de agendar.");
                }

                await saveSorteioCore({ status: "scheduled" });
                await loadDashboard();
                return true;
            },
            "Sorteio agendado com sucesso."
        );
    }, [form.scheduledAtInput, loadDashboard, premiosList.length, runAction, saveSorteioCore]);

    const runNow = useCallback(
        async (force = false) => {
            await runAction(
                force ? "rerunning" : "running",
                async () => {
                    const sorteioId = sorteio?.id ?? 0;

                    if (!sorteioId) {
                        throw new Error("Crie o sorteio antes de executar.");
                    }

                    if (premiosList.length === 0) {
                        throw new Error("Cadastre os prêmios antes de executar.");
                    }

                    const response = await apiJson<
                        ApiResp<{
                            eligible_total?: number;
                            took_ms?: number;
                            rule?: string;
                            strategy?: string;
                        }>
                    >(`${API_URL}?op=admin_run`, "POST", {
                        sorteio_id: sorteioId,
                        force: force ? 1 : 0,
                    });

                    if (!response?.ok) {
                        throw new Error(response?.error || "Falha ao executar sorteio");
                    }

                    await Promise.all([loadDashboard(), loadStats()]);
                    return response;
                },
                force
                    ? "Sorteio reexecutado com sucesso."
                    : "Sorteio executado com sucesso."
            );
        },
        [loadDashboard, loadStats, premiosList.length, runAction, sorteio?.id]
    );

    const resetForm = useCallback(() => {
        hydrateFormFromDashboard(dashboard, true);
        setSuccessMessage(null);
        setActionError(null);
    }, [dashboard, hydrateFormFromDashboard]);

    useEffect(() => {
        isMountedRef.current = true;
        void loadDashboard();

        return () => {
            isMountedRef.current = false;
            dashboardAbortRef.current?.abort();
            statsAbortRef.current?.abort();
            clearProgressTimer();
        };
    }, [clearProgressTimer, loadDashboard]);

    const actionLabel = useMemo(() => {
        switch (actionKind) {
            case "saving":
                return "Salvando...";
            case "saving-prizes":
                return "Salvando prêmios...";
            case "running":
                return "Executando...";
            case "rerunning":
                return "Reexecutando...";
            case "scheduling":
                return "Agendando...";
            default:
                return "";
        }
    }, [actionKind]);

    if (dashboardLoading) {
        return (
            <main className="grid min-h-[70vh] place-items-center px-4">
                <div className="text-center">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border-4 border-gray-300 border-t-emerald-600 text-emerald-600">
                        <Spinner size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Carregando admin de sorteios…
                    </h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-300">Aguarde um instante.</p>
                </div>
            </main>
        );
    }

    return (
        <>
            <ProgressOverlay
                open={progressOpen}
                progress={progressValue}
                message={ELIGIBLE_PROGRESS_TEXT}
            />

            <main className="min-h-screen bg-gray-50 px-4 py-6 font-[Nunito] dark:bg-gray-950 sm:px-6 xl:px-8">
                <div className="mx-auto max-w-7xl space-y-6">
                    <header className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                    Sorteios (Admin)
                                </h1>
                                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                                    O sorteio considera somente titulares ativos com{" "}
                                    <strong>0 mensalidades vencidas</strong>.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => void loadDashboard({ preserveForm: true })}
                                    disabled={dashboardLoading || actionLoading}
                                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    Atualizar dashboard
                                </button>

                                <button
                                    onClick={() => void loadStats()}
                                    disabled={statsLoading || actionLoading}
                                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                                    title="Calcula o total de titulares ativos com 0 mensalidades vencidas"
                                >
                                    {statsLoading ? "Consultando elegíveis..." : "Consultar elegíveis"}
                                </button>
                            </div>
                        </div>

                        {successMessage ? (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                                <div className="font-semibold">Sucesso</div>
                                <div className="mt-1">{successMessage}</div>
                            </div>
                        ) : null}

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
                            </div>
                        ) : null}
                    </header>

                    <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
                        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Configuração do sorteio
                                </h2>
                            </div>

                            <div className="space-y-5 p-5">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                            Título
                                        </label>
                                        <input
                                            value={form.titulo}
                                            onChange={(e) => setField("titulo", e.target.value)}
                                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                            placeholder="Ex.: Sorteio de Natal"
                                            maxLength={140}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                            Status
                                        </label>
                                        <select
                                            value={form.status}
                                            onChange={(e) =>
                                                setField("status", sanitizeStatus(e.target.value))
                                            }
                                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                        >
                                            <option value="draft">Rascunho</option>
                                            <option value="scheduled">Agendado</option>
                                            <option value="running">Em execução</option>
                                            <option value="done">Concluído</option>
                                            <option value="canceled">Cancelado</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Descrição
                                    </label>
                                    <textarea
                                        value={form.descricao}
                                        onChange={(e) => setField("descricao", e.target.value)}
                                        rows={4}
                                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                        placeholder="Descrição opcional do sorteio"
                                        maxLength={1200}
                                    />
                                </div>

                                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                            Data/Hora do sorteio
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={form.scheduledAtInput}
                                            onChange={(e) =>
                                                setField("scheduledAtInput", e.target.value)
                                            }
                                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Use esta data ao agendar o sorteio.
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/30">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                            Situação atual
                                        </div>

                                        <div className="mt-3 space-y-2 text-sm text-gray-900 dark:text-gray-100">
                                            <div>
                                                <span className="font-semibold">ID:</span>{" "}
                                                {sorteio?.id ?? "—"}
                                            </div>
                                            <div>
                                                <span className="font-semibold">Status:</span>{" "}
                                                {sorteio?.status ?? "—"}
                                            </div>
                                            <div>
                                                <span className="font-semibold">Agendado:</span>{" "}
                                                {formatBR(sorteio?.scheduled_at)}
                                            </div>
                                            <div>
                                                <span className="font-semibold">Executado:</span>{" "}
                                                {formatBR(sorteio?.executed_at)}
                                            </div>
                                            <div className="pt-2">
                                                <span className="font-semibold">
                                                    Titulares ativos com 0 mensalidades vencidas:
                                                </span>{" "}
                                                {statsLoading
                                                    ? "Consultando..."
                                                    : stats?.ok
                                                        ? stats.eligible_total ?? "—"
                                                        : "—"}
                                            </div>

                                            {stats?.ok ? (
                                                <div className="pt-1 text-xs text-gray-600 dark:text-gray-300">
                                                    {stats.calculated_at ? (
                                                        <>
                                                            Calculado em{" "}
                                                            <strong>
                                                                {formatIsoDateBR(stats.calculated_at)}
                                                            </strong>
                                                            .{" "}
                                                        </>
                                                    ) : null}
                                                    {typeof stats.took_ms === "number" ? (
                                                        <>
                                                            Tempo:{" "}
                                                            <strong>{stats.took_ms}ms</strong>.{" "}
                                                        </>
                                                    ) : null}
                                                    {typeof stats.cached_ttl_s === "number" ? (
                                                        <>
                                                            Cache:{" "}
                                                            <strong>{stats.cached_ttl_s}s</strong>.
                                                        </>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-1">
                                    <button
                                        onClick={() => void saveSorteio()}
                                        disabled={actionLoading}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {actionKind === "saving" ? <Spinner size={16} /> : null}
                                        {actionKind === "saving" ? actionLabel : "Salvar sorteio"}
                                    </button>

                                    <button
                                        onClick={() => void scheduleDraw()}
                                        disabled={actionLoading || premiosList.length === 0}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-950/30"
                                    >
                                        {actionKind === "scheduling" ? <Spinner size={16} /> : null}
                                        {actionKind === "scheduling" ? actionLabel : "Agendar sorteio"}
                                    </button>

                                    <button
                                        onClick={() => void runNow(false)}
                                        disabled={actionLoading || !sorteio?.id || premiosList.length === 0}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        {actionKind === "running" ? <Spinner size={16} /> : null}
                                        {actionKind === "running" ? actionLabel : "Realizar sorteio agora"}
                                    </button>

                                    <button
                                        onClick={() => void runNow(true)}
                                        disabled={actionLoading || !sorteio?.id || premiosList.length === 0}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-200 dark:hover:bg-red-950/30"
                                    >
                                        {actionKind === "rerunning" ? <Spinner size={16} /> : null}
                                        {actionKind === "rerunning" ? actionLabel : "Re-sortear (FORCE)"}
                                    </button>

                                    <button
                                        onClick={resetForm}
                                        disabled={actionLoading || !isDirty}
                                        className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                                    >
                                        Descartar alterações
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                                <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Prêmios (1 por linha)
                                    </h2>
                                </div>

                                <div className="space-y-3 p-5">
                                    <textarea
                                        value={form.premiosText}
                                        onChange={(e) => setField("premiosText", e.target.value)}
                                        rows={11}
                                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                        placeholder={`Ex.:
1 Televisor 50"
1 Smartphone
1 Air Fryer`}
                                    />

                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-800/30">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="text-gray-700 dark:text-gray-200">
                                                Total único: <strong>{premiosList.length}</strong> prêmio(s)
                                            </div>
                                            <button
                                                onClick={() => void savePremios()}
                                                disabled={actionLoading}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {actionKind === "saving-prizes" ? (
                                                    <Spinner size={16} />
                                                ) : null}
                                                {actionKind === "saving-prizes"
                                                    ? actionLabel
                                                    : "Salvar prêmios"}
                                            </button>
                                        </div>
                                    </div>

                                    {premiosList.length > 0 ? (
                                        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                                            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                Pré-visualização
                                            </div>
                                            <div className="max-h-64 space-y-2 overflow-auto pr-1">
                                                {premiosList.map((premio, idx) => (
                                                    <div
                                                        key={`${premio}-${idx}`}
                                                        className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900"
                                                    >
                                                        <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-100 px-2 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                                            {idx + 1}
                                                        </span>
                                                        <span className="text-gray-800 dark:text-gray-200">
                                                            {premio}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </section>

                            {stats?.diag ? (
                                <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                                    <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                            Diagnóstico técnico
                                        </h2>
                                    </div>

                                    <div className="p-5">
                                        <pre className="overflow-auto rounded-2xl bg-gray-50 p-4 text-xs text-gray-800 dark:bg-gray-950 dark:text-gray-100">
                                            {JSON.stringify(stats.diag, null, 2)}
                                        </pre>
                                    </div>
                                </section>
                            ) : null}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Resultados
                            </h2>
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
                                            <td
                                                colSpan={3}
                                                className="px-6 py-8 text-sm text-gray-600 dark:text-gray-300"
                                            >
                                                Nenhum resultado ainda. Realize o sorteio para gerar os vencedores.
                                            </td>
                                        </tr>
                                    ) : (
                                        (dashboard?.resultados || []).map((r, idx) => (
                                            <tr
                                                key={r.id ?? `${r.premio_id}-${r.cpf}-${idx}`}
                                                className="h-12"
                                            >
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

                        <div className="grid gap-3 border-t border-gray-200 px-5 py-4 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:grid-cols-2">
                            <div>
                                Executado em: <strong>{formatBR(sorteio?.executed_at || null)}</strong>
                            </div>
                            <div className="sm:text-right">
                                Status atual: <strong>{sorteio?.status ?? "—"}</strong>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </>
    );
}