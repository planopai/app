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
    premios: Array<{ id: number; nome: string; ordem: number }>;
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

type HistoryResp = {
    ok: boolean;
    sorteios: Sorteio[];
    error?: string;
};

type ApiResp<T = Record<string, never>> = { ok: boolean; error?: string } & T;

type NewSorteioForm = {
    titulo: string;
    premiosText: string;
    scheduledAtInput: string;
};

type PageDataState = {
    latestSorteio: Sorteio | null;
    latestResultados: Resultado[];
    history: Sorteio[];
};

type ModalStep = "hidden" | "progress" | "form";

type SubmitKind = "idle" | "running" | "scheduling";

const API_URL =
    process.env.NEXT_PUBLIC_SORTEIOS_API_URL ||
    "https://api.planoassistencialintegrado.com.br/sorteios.php";

/**
 * Mantido apenas por compatibilidade com a API atual.
 * O ideal é não expor token administrativo no client.
 */
const OPTIONAL_ADMIN_TOKEN = process.env.NEXT_PUBLIC_SORTEIOS_ADMIN_TOKEN || "";

const DEFAULT_TITLE = "Novo Sorteio";
const PROGRESS_MESSAGE = "Verificando Associados Aptos a Participarem Do Sorteio.";

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

function formatBR(mysqlDatetime?: string | null) {
    const dt = parseMysqlDateTime(mysqlDatetime);
    return dt ? dt.toLocaleString("pt-BR") : mysqlDatetime || "—";
}

function localInputToMysql(value: string) {
    if (!value) return "";
    const [datePart, timePart] = value.split("T");
    if (!datePart || !timePart) return "";
    return `${datePart} ${timePart}:00`;
}

function maskCpf(cpf: string) {
    const digits = cpf.replace(/\D+/g, "");
    if (digits.length !== 11) return cpf;
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

function uniqueTrimmedLines(text: string) {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        if (seen.has(line)) continue;
        seen.add(line);
        lines.push(line);
    }

    return lines;
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}

function sanitizeStatus(value?: string | null): SorteioStatus {
    const allowed: SorteioStatus[] = ["draft", "scheduled", "running", "done", "canceled"];
    return allowed.includes(value as SorteioStatus) ? (value as SorteioStatus) : "draft";
}

function getDefaultForm(): NewSorteioForm {
    return {
        titulo: DEFAULT_TITLE,
        premiosText: "",
        scheduledAtInput: toLocalInputValue(addOneHour()),
    };
}

function getStatusBadge(status?: SorteioStatus | null) {
    switch (status) {
        case "done":
            return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
        case "scheduled":
            return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
        case "running":
            return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
        case "canceled":
            return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
        default:
            return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
}

function getStatusLabel(status?: SorteioStatus | null) {
    switch (status) {
        case "done":
            return "Realizado";
        case "scheduled":
            return "Agendado";
        case "running":
            return "Em execução";
        case "canceled":
            return "Cancelado";
        default:
            return "Rascunho";
    }
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

function ProgressModal({
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-white p-6 shadow-2xl dark:bg-gray-950">
                <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        <Spinner size={22} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white">
                            Consultando elegíveis
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
                    </div>
                </div>

                <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-300">
                        <span>Aguarde enquanto a verificação é concluída</span>
                        <span>{progress}%</span>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                        <div
                            className="h-full rounded-full bg-emerald-600 transition-[width] duration-100 ease-linear"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function NovoSorteioModal({
    open,
    form,
    setForm,
    submitKind,
    eligibleTotal,
    successMessage,
    errorMessage,
    onClose,
    onRunNow,
    onSchedule,
}: {
    open: boolean;
    form: NewSorteioForm;
    setForm: React.Dispatch<React.SetStateAction<NewSorteioForm>>;
    submitKind: SubmitKind;
    eligibleTotal: number | null;
    successMessage: string | null;
    errorMessage: string | null;
    onClose: () => void;
    onRunNow: () => void;
    onSchedule: () => void;
}) {
    if (!open) return null;

    const premiosList = uniqueTrimmedLines(form.premiosText);
    const loading = submitKind !== "idle";

    return (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]">
            <div className="flex min-h-dvh items-center justify-center p-4">
                <div className="flex w-full max-w-2xl max-h-[92dvh] flex-col overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl dark:bg-gray-950">
                    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                Novo Sorteio
                            </h3>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                Configure o sorteio e escolha entre realizar agora ou agendar.
                            </p>
                        </div>

                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
                        >
                            Fechar
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                        <div className="space-y-5">
                            {eligibleTotal !== null ? (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                                    Elegíveis encontrados: <strong>{eligibleTotal}</strong>
                                </div>
                            ) : null}

                            {successMessage ? (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                                    <strong>Concluído.</strong> {successMessage}
                                </div>
                            ) : null}

                            {errorMessage ? (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                                    {errorMessage}
                                </div>
                            ) : null}

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Nome do sorteio
                                    </label>
                                    <input
                                        value={form.titulo}
                                        onChange={(e) =>
                                            setForm((prev) => ({ ...prev, titulo: e.target.value }))
                                        }
                                        maxLength={140}
                                        placeholder="Ex.: Sorteio de Páscoa"
                                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Prêmios (1 por linha)
                                    </label>
                                    <textarea
                                        value={form.premiosText}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                premiosText: e.target.value,
                                            }))
                                        }
                                        rows={8}
                                        placeholder={`Ex.:
1 Televisor 50"
1 Smartphone
1 Air Fryer`}
                                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                    />
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                        Total único: <strong>{premiosList.length}</strong> prêmio(s)
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Data/Hora para agendar
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={form.scheduledAtInput}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                scheduledAtInput: e.target.value,
                                            }))
                                        }
                                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <button
                                onClick={onSchedule}
                                disabled={loading}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-950/30"
                            >
                                {submitKind === "scheduling" ? <Spinner size={16} /> : null}
                                {submitKind === "scheduling" ? "Agendando..." : "Agendar"}
                            </button>

                            <button
                                onClick={onRunNow}
                                disabled={loading}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {submitKind === "running" ? <Spinner size={16} /> : null}
                                {submitKind === "running" ? "Realizando..." : "Realizar Agora"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SorteiosAdminPage() {
    const dashboardAbortRef = useRef<AbortController | null>(null);
    const historyAbortRef = useRef<AbortController | null>(null);
    const statsAbortRef = useRef<AbortController | null>(null);
    const progressIntervalRef = useRef<number | null>(null);
    const progressTimeoutRef = useRef<number | null>(null);
    const isMountedRef = useRef(true);

    const [pageLoading, setPageLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [pageData, setPageData] = useState<PageDataState>({
        latestSorteio: null,
        latestResultados: [],
        history: [],
    });

    const [modalStep, setModalStep] = useState<ModalStep>("hidden");
    const [progressValue, setProgressValue] = useState(0);

    const [eligibleTotal, setEligibleTotal] = useState<number | null>(null);
    const [statsError, setStatsError] = useState<string | null>(null);

    const [form, setForm] = useState<NewSorteioForm>(getDefaultForm());
    const [submitKind, setSubmitKind] = useState<SubmitKind>("idle");
    const [modalError, setModalError] = useState<string | null>(null);
    const [modalSuccess, setModalSuccess] = useState<string | null>(null);

    const modalOpen = modalStep === "form";
    const progressOpen = modalStep === "progress";
    const latestResultados = pageData.latestResultados;
    const latestSorteio = pageData.latestSorteio;
    const history = pageData.history;

    const premiosList = useMemo(() => uniqueTrimmedLines(form.premiosText), [form.premiosText]);

    const clearProgressTimers = useCallback(() => {
        if (progressIntervalRef.current !== null) {
            window.clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
        if (progressTimeoutRef.current !== null) {
            window.clearTimeout(progressTimeoutRef.current);
            progressTimeoutRef.current = null;
        }
    }, []);

    const startProgressLoop = useCallback(() => {
        clearProgressTimers();
        setProgressValue(0);

        progressIntervalRef.current = window.setInterval(() => {
            setProgressValue((prev) => {
                if (prev >= 95) return prev;
                return Math.min(95, prev + 1);
            });
        }, 120);
    }, [clearProgressTimers]);

    const finishProgressSmoothly = useCallback(async () => {
        clearProgressTimers();

        await new Promise<void>((resolve) => {
            progressIntervalRef.current = window.setInterval(() => {
                setProgressValue((prev) => {
                    const next = Math.min(100, prev + 1);
                    if (next >= 100) {
                        clearProgressTimers();
                        resolve();
                    }
                    return next;
                });
            }, 80);
        });

        await new Promise((resolve) => {
            progressTimeoutRef.current = window.setTimeout(resolve, 220);
        });
    }, [clearProgressTimers]);

    const resetModalState = useCallback(() => {
        setForm(getDefaultForm());
        setEligibleTotal(null);
        setStatsError(null);
        setModalError(null);
        setModalSuccess(null);
        setSubmitKind("idle");
    }, []);

    const closeModal = useCallback(() => {
        resetModalState();
        setModalStep("hidden");
    }, [resetModalState]);

    const loadDashboard = useCallback(async () => {
        dashboardAbortRef.current?.abort();
        const ac = new AbortController();
        dashboardAbortRef.current = ac;

        const data = await apiJson<DashboardResp>(
            `${API_URL}?op=admin_dashboard&_=${Date.now()}`,
            "GET",
            undefined,
            ac.signal
        );

        if (!data?.ok) {
            throw new Error(data?.error || "Falha ao carregar dados do sorteio.");
        }

        return data;
    }, []);

    const loadHistory = useCallback(async () => {
        historyAbortRef.current?.abort();
        const ac = new AbortController();
        historyAbortRef.current = ac;

        try {
            const data = await apiJson<HistoryResp>(
                `${API_URL}?op=admin_history&_=${Date.now()}`,
                "GET",
                undefined,
                ac.signal
            );

            if (!data?.ok) {
                throw new Error(data?.error || "Falha ao carregar histórico.");
            }

            return Array.isArray(data.sorteios) ? data.sorteios : [];
        } catch {
            return null;
        }
    }, []);

    const refreshPageData = useCallback(async () => {
        setPageError(null);

        const [dashboardResp, historyResp] = await Promise.all([loadDashboard(), loadHistory()]);

        if (!isMountedRef.current) return;

        const latest = dashboardResp.sorteio ?? null;
        const fallbackHistory = latest ? [latest] : [];

        setPageData({
            latestSorteio: latest,
            latestResultados: dashboardResp.resultados || [],
            history:
                historyResp?.length && Array.isArray(historyResp)
                    ? [...historyResp].sort((a, b) => b.id - a.id)
                    : fallbackHistory,
        });
    }, [loadDashboard, loadHistory]);

    const openNovoSorteioFlow = useCallback(async () => {
        resetModalState();
        setModalStep("progress");
        startProgressLoop();

        statsAbortRef.current?.abort();
        const ac = new AbortController();
        statsAbortRef.current = ac;

        try {
            const data = await apiJson<PoolStatsResp>(
                `${API_URL}?op=admin_pool_stats&_=${Date.now()}`,
                "GET",
                undefined,
                ac.signal
            );

            if (!data?.ok) {
                throw new Error(data?.error || "Falha ao consultar elegíveis.");
            }

            if (!isMountedRef.current) return;
            setEligibleTotal(data.eligible_total ?? null);
            setStatsError(null);
        } catch (error) {
            if ((error as { name?: string })?.name === "AbortError") return;
            if (!isMountedRef.current) return;
            setStatsError(getErrorMessage(error, "Falha ao consultar elegíveis."));
        } finally {
            await finishProgressSmoothly();
            if (!isMountedRef.current) return;
            setModalStep("form");
        }
    }, [finishProgressSmoothly, resetModalState, startProgressLoop]);

    const createBaseSorteio = useCallback(
        async (status: SorteioStatus) => {
            const titulo = form.titulo.trim();
            if (!titulo) {
                throw new Error("Informe o nome do sorteio.");
            }

            if (premiosList.length === 0) {
                throw new Error("Informe pelo menos um prêmio.");
            }

            if (status === "scheduled" && !form.scheduledAtInput) {
                throw new Error("Informe a data e hora do agendamento.");
            }

            const saveResp = await apiJson<ApiResp<{ id?: number }>>(
                `${API_URL}?op=admin_save_sorteio`,
                "POST",
                {
                    titulo,
                    descricao: "",
                    scheduled_at:
                        status === "scheduled" ? localInputToMysql(form.scheduledAtInput) : "",
                    status,
                }
            );

            if (!saveResp?.ok || !saveResp.id) {
                throw new Error(saveResp?.error || "Falha ao criar sorteio.");
            }

            const sorteioId = saveResp.id;

            const premiosResp = await apiJson<ApiResp<{ premios_total?: number }>>(
                `${API_URL}?op=admin_set_premios`,
                "POST",
                {
                    sorteio_id: sorteioId,
                    premios: premiosList,
                }
            );

            if (!premiosResp?.ok) {
                throw new Error(premiosResp?.error || "Falha ao salvar prêmios.");
            }

            return sorteioId;
        },
        [form.scheduledAtInput, form.titulo, premiosList]
    );

    const runNow = useCallback(async () => {
        setSubmitKind("running");
        setModalError(null);
        setModalSuccess(null);

        try {
            const sorteioId = await createBaseSorteio("draft");

            const runResp = await apiJson<
                ApiResp<{
                    eligible_total?: number;
                    took_ms?: number;
                    rule?: string;
                    strategy?: string;
                }>
            >(`${API_URL}?op=admin_run`, "POST", {
                sorteio_id: sorteioId,
                force: 0,
            });

            if (!runResp?.ok) {
                throw new Error(runResp?.error || "Falha ao realizar sorteio.");
            }

            await refreshPageData();

            if (!isMountedRef.current) return;

            setModalSuccess("Sorteio realizado com sucesso.");
            setSubmitKind("idle");

            window.setTimeout(() => {
                if (!isMountedRef.current) return;
                closeModal();
            }, 1200);
        } catch (error) {
            if (!isMountedRef.current) return;
            setModalError(getErrorMessage(error, "Falha ao realizar sorteio."));
            setSubmitKind("idle");
        }
    }, [closeModal, createBaseSorteio, refreshPageData]);

    const scheduleDraw = useCallback(async () => {
        setSubmitKind("scheduling");
        setModalError(null);
        setModalSuccess(null);

        try {
            await createBaseSorteio("scheduled");
            await refreshPageData();

            if (!isMountedRef.current) return;

            setModalSuccess("Sorteio agendado com sucesso.");
            setSubmitKind("idle");

            window.setTimeout(() => {
                if (!isMountedRef.current) return;
                closeModal();
            }, 1200);
        } catch (error) {
            if (!isMountedRef.current) return;
            setModalError(getErrorMessage(error, "Falha ao agendar sorteio."));
            setSubmitKind("idle");
        }
    }, [closeModal, createBaseSorteio, refreshPageData]);

    useEffect(() => {
        isMountedRef.current = true;
        setPageLoading(true);

        void refreshPageData()
            .catch((error) => {
                if (!isMountedRef.current) return;
                setPageError(getErrorMessage(error, "Falha ao carregar a página."));
            })
            .finally(() => {
                if (isMountedRef.current) {
                    setPageLoading(false);
                }
            });

        return () => {
            isMountedRef.current = false;
            dashboardAbortRef.current?.abort();
            historyAbortRef.current?.abort();
            statsAbortRef.current?.abort();
            clearProgressTimers();
        };
    }, [clearProgressTimers, refreshPageData]);

    if (pageLoading) {
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
            <ProgressModal
                open={progressOpen}
                progress={Math.round(progressValue)}
                message={PROGRESS_MESSAGE}
            />

            <NovoSorteioModal
                open={modalOpen}
                form={form}
                setForm={setForm}
                submitKind={submitKind}
                eligibleTotal={eligibleTotal}
                successMessage={modalSuccess}
                errorMessage={modalError || statsError}
                onClose={closeModal}
                onRunNow={() => void runNow()}
                onSchedule={() => void scheduleDraw()}
            />

            <main className="min-h-screen bg-gray-50 px-4 py-6 font-[Nunito] dark:bg-gray-950 sm:px-6 xl:px-8">
                <div className="mx-auto max-w-7xl space-y-6">
                    <header className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                    Sorteios (Admin)
                                </h1>
                                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                                    Visualize os sorteios realizados e crie um novo sorteio de forma
                                    simples.
                                </p>
                            </div>

                            <button
                                onClick={() => void openNovoSorteioFlow()}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                            >
                                Novo Sorteio
                            </button>
                        </div>

                        {pageError ? (
                            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                                {pageError}
                            </div>
                        ) : null}
                    </header>

                    <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Lista de sorteios
                            </h2>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                            ID
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                            Sorteio
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                            Agendado
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                            Executado
                                        </th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                    {history.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-6 py-8 text-sm text-gray-600 dark:text-gray-300"
                                            >
                                                Nenhum sorteio encontrado.
                                            </td>
                                        </tr>
                                    ) : (
                                        history.map((item) => (
                                            <tr key={item.id} className="h-14">
                                                <td className="px-6 py-3 text-sm text-gray-800 dark:text-gray-200">
                                                    #{item.id}
                                                </td>
                                                <td className="px-6 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                    {item.titulo}
                                                </td>
                                                <td className="px-6 py-3 text-sm">
                                                    <span
                                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getStatusBadge(
                                                            sanitizeStatus(item.status)
                                                        )}`}
                                                    >
                                                        {getStatusLabel(item.status)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-200">
                                                    {formatBR(item.scheduled_at)}
                                                </td>
                                                <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-200">
                                                    {formatBR(item.executed_at)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Últimos ganhadores
                                </h2>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    Sorteio atual:{" "}
                                    <strong>{latestSorteio?.titulo || "Nenhum sorteio disponível"}</strong>
                                </div>
                            </div>
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
                                    {latestResultados.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={3}
                                                className="px-6 py-8 text-sm text-gray-600 dark:text-gray-300"
                                            >
                                                Nenhum ganhador disponível no momento.
                                            </td>
                                        </tr>
                                    ) : (
                                        latestResultados.map((resultado, idx) => (
                                            <tr
                                                key={
                                                    resultado.id ??
                                                    `${resultado.premio_id}-${resultado.cpf}-${idx}`
                                                }
                                                className="h-12"
                                            >
                                                <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                                                    {resultado.premio_nome}
                                                </td>
                                                <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                                                    {resultado.nome}
                                                </td>
                                                <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-200">
                                                    {maskCpf(resultado.cpf)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="border-t border-gray-200 px-5 py-4 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                            Executado em: <strong>{formatBR(latestSorteio?.executed_at || null)}</strong>
                        </div>
                    </section>
                </div>
            </main>
        </>
    );
}