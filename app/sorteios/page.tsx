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
};

type PremioResumo = {
    nome: string;
    quantidade: number;
};

type ExecutionSnapshot = {
    titulo: string;
    premios: string[];
    resumo: PremioResumo[];
    totalPremios: number;
};

type ConfirmationStep = "form" | "review" | "notification";

type PageDataState = {
    latestSorteio: Sorteio | null;
    latestResultados: Resultado[];
    history: Sorteio[];
};

type ModalStep = "hidden" | "progress" | "form";

type SubmitKind = "idle" | "running";

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
    return dt ? dt.toLocaleString("pt-BR") : mysqlDatetime || "-";
}

function maskCpf(cpf: string) {
    const digits = cpf.replace(/\D+/g, "");
    if (digits.length !== 11) return cpf;
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

function getPremiosList(text: string) {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

function summarizePremios(premios: string[]): PremioResumo[] {
    const grouped = new Map<string, PremioResumo>();

    for (const premio of premios) {
        const key = premio.toLocaleLowerCase("pt-BR");
        const current = grouped.get(key);

        if (current) {
            current.quantidade += 1;
        } else {
            grouped.set(key, {
                nome: premio,
                quantidade: 1,
            });
        }
    }

    return Array.from(grouped.values());
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
    confirmationStep,
    snapshot,
    allowEditing,
    eligibleTotal,
    successMessage,
    errorMessage,
    onClose,
    onReview,
    onBackToForm,
    onBackToReview,
    onAdvanceToNotification,
    onRunNow,
}: {
    open: boolean;
    form: NewSorteioForm;
    setForm: React.Dispatch<React.SetStateAction<NewSorteioForm>>;
    submitKind: SubmitKind;
    confirmationStep: ConfirmationStep;
    snapshot: ExecutionSnapshot | null;
    allowEditing: boolean;
    eligibleTotal: number | null;
    successMessage: string | null;
    errorMessage: string | null;
    onClose: () => void;
    onReview: () => void;
    onBackToForm: () => void;
    onBackToReview: () => void;
    onAdvanceToNotification: () => void;
    onRunNow: () => void;
}) {
    if (!open) return null;

    const premiosList = getPremiosList(form.premiosText);
    const premiosResumo = summarizePremios(premiosList);
    const loading = submitKind === "running";

    const title =
        confirmationStep === "form"
            ? "Novo Sorteio"
            : confirmationStep === "review"
                ? "Revise o sorteio"
                : "Confirmação final";

    const subtitle =
        confirmationStep === "form"
            ? "Configure o sorteio. A execução só ocorrerá após duas confirmações."
            : confirmationStep === "review"
                ? "Confira o nome, os prêmios e as quantidades antes de continuar."
                : "Esta é a última etapa antes da realização do sorteio.";

    return (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]">
            <div className="flex min-h-dvh items-center justify-center p-4">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="novo-sorteio-title"
                    className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-white shadow-2xl dark:bg-gray-950"
                >
                    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
                        <div>
                            <h3
                                id="novo-sorteio-title"
                                className="text-lg font-bold text-gray-900 dark:text-white"
                            >
                                {title}
                            </h3>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                {subtitle}
                            </p>
                        </div>

                        <button
                            type="button"
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
                                <div
                                    role="alert"
                                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200"
                                >
                                    {errorMessage}
                                </div>
                            ) : null}

                            {confirmationStep === "form" ? (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label
                                            htmlFor="sorteio-titulo"
                                            className="text-sm font-semibold text-gray-700 dark:text-gray-200"
                                        >
                                            Nome do sorteio
                                        </label>
                                        <input
                                            id="sorteio-titulo"
                                            value={form.titulo}
                                            onChange={(event) =>
                                                setForm((prev) => ({
                                                    ...prev,
                                                    titulo: event.target.value,
                                                }))
                                            }
                                            maxLength={140}
                                            placeholder="Ex.: Sorteio de Páscoa"
                                            disabled={loading}
                                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label
                                            htmlFor="sorteio-premios"
                                            className="text-sm font-semibold text-gray-700 dark:text-gray-200"
                                        >
                                            Prêmios, 1 unidade por linha
                                        </label>
                                        <textarea
                                            id="sorteio-premios"
                                            value={form.premiosText}
                                            onChange={(event) =>
                                                setForm((prev) => ({
                                                    ...prev,
                                                    premiosText: event.target.value,
                                                }))
                                            }
                                            rows={8}
                                            placeholder={`Ex.:
Televisor 50"
Smartphone
Air Fryer
Air Fryer`}
                                            disabled={loading}
                                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                        />
                                        <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                                            <p>
                                                Total: <strong>{premiosList.length}</strong>{" "}
                                                unidade(s) em{" "}
                                                <strong>{premiosResumo.length}</strong> tipo(s) de
                                                prêmio.
                                            </p>
                                            <p>
                                                Para sortear mais de uma unidade do mesmo prêmio,
                                                repita o nome em linhas diferentes.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {confirmationStep === "review" && snapshot ? (
                                <div className="space-y-5">
                                    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-center text-sm font-extrabold uppercase tracking-wide text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                                        VERIFIQUE SE TODAS AS INFORMAÇÕES ESTÃO CORRETAS E CLIQUE
                                        EM CONFIRMAR.
                                    </div>

                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Sorteio
                                        </p>
                                        <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
                                            {snapshot.titulo}
                                        </p>
                                    </div>

                                    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                                            <thead className="bg-gray-50 dark:bg-gray-900">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                                        Prêmio
                                                    </th>
                                                    <th className="w-32 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                                                        Quantidade
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-950">
                                                {snapshot.resumo.map((premio) => (
                                                    <tr key={premio.nome.toLocaleLowerCase("pt-BR")}>
                                                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                            {premio.nome}
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-gray-100">
                                                            {premio.quantidade}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-gray-50 dark:bg-gray-900">
                                                <tr>
                                                    <td className="px-4 py-3 text-sm font-bold text-gray-800 dark:text-gray-200">
                                                        Total de prêmios
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-sm font-extrabold text-gray-900 dark:text-white">
                                                        {snapshot.totalPremios}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            ) : null}

                            {confirmationStep === "notification" && snapshot ? (
                                <div className="space-y-5">
                                    <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 text-center text-sm font-extrabold uppercase leading-6 tracking-wide text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                                        AO CLICAR EM CONFIRMAR, TODOS OS ASSOCIADOS RECEBERÃO UMA
                                        MENSAGEM COM O RESULTADO DO SORTEIO.
                                    </div>

                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                    Sorteio
                                                </p>
                                                <p className="mt-1 font-bold text-gray-900 dark:text-white">
                                                    {snapshot.titulo}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                    Total
                                                </p>
                                                <p className="mt-1 text-lg font-extrabold text-gray-900 dark:text-white">
                                                    {snapshot.totalPremios}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-center text-sm text-gray-600 dark:text-gray-300">
                                        Depois da confirmação, aguarde a conclusão sem fechar esta
                                        janela.
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
                        {confirmationStep === "form" ? (
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={onReview}
                                    disabled={loading}
                                    className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Realizar Agora
                                </button>
                            </div>
                        ) : null}

                        {confirmationStep === "review" ? (
                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={onBackToForm}
                                    disabled={loading || !allowEditing}
                                    className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                                >
                                    Voltar e corrigir
                                </button>
                                <button
                                    type="button"
                                    onClick={onAdvanceToNotification}
                                    disabled={loading}
                                    className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Confirmar
                                </button>
                            </div>
                        ) : null}

                        {confirmationStep === "notification" ? (
                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={onBackToReview}
                                    disabled={loading || !allowEditing}
                                    className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                                >
                                    Voltar e revisar
                                </button>
                                <button
                                    type="button"
                                    onClick={onRunNow}
                                    disabled={loading}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loading ? <Spinner size={16} /> : null}
                                    {loading ? "Realizando..." : "Confirmar e realizar sorteio"}
                                </button>
                            </div>
                        ) : null}
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
    const closeTimeoutRef = useRef<number | null>(null);
    const pendingSorteioIdRef = useRef<number | null>(null);
    const executionLockRef = useRef(false);
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
    const [confirmationStep, setConfirmationStep] =
        useState<ConfirmationStep>("form");
    const [executionSnapshot, setExecutionSnapshot] =
        useState<ExecutionSnapshot | null>(null);
    const [executionPrepared, setExecutionPrepared] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [modalSuccess, setModalSuccess] = useState<string | null>(null);

    const modalOpen = modalStep === "form";
    const progressOpen = modalStep === "progress";
    const latestResultados = pageData.latestResultados;
    const latestSorteio = pageData.latestSorteio;
    const history = pageData.history;

    const premiosList = useMemo(() => getPremiosList(form.premiosText), [form.premiosText]);
    const premiosResumo = useMemo(() => summarizePremios(premiosList), [premiosList]);

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
        if (closeTimeoutRef.current !== null) {
            window.clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }

        setForm(getDefaultForm());
        setEligibleTotal(null);
        setStatsError(null);
        setModalError(null);
        setModalSuccess(null);
        setSubmitKind("idle");
        setConfirmationStep("form");
        setExecutionSnapshot(null);
        setExecutionPrepared(false);

        pendingSorteioIdRef.current = null;
        executionLockRef.current = false;
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

    const prepareReview = useCallback(() => {
        setModalError(null);
        setModalSuccess(null);

        const titulo = form.titulo.trim();

        if (!titulo) {
            setModalError("Informe o nome do sorteio.");
            return;
        }

        if (premiosList.length === 0) {
            setModalError("Informe pelo menos um prêmio.");
            return;
        }

        if (eligibleTotal !== null && premiosList.length > eligibleTotal) {
            setModalError(
                `Existem ${premiosList.length} prêmios, mas apenas ${eligibleTotal} associados elegíveis. Reduza a quantidade de prêmios antes de continuar.`
            );
            return;
        }

        setExecutionSnapshot({
            titulo,
            premios: [...premiosList],
            resumo: premiosResumo.map((premio) => ({ ...premio })),
            totalPremios: premiosList.length,
        });
        setConfirmationStep("review");
    }, [eligibleTotal, form.titulo, premiosList, premiosResumo]);

    const backToForm = useCallback(() => {
        if (executionPrepared) return;

        setModalError(null);
        setModalSuccess(null);
        setExecutionSnapshot(null);
        setConfirmationStep("form");
    }, [executionPrepared]);

    const backToReview = useCallback(() => {
        if (executionPrepared) return;

        setModalError(null);
        setModalSuccess(null);
        setConfirmationStep("review");
    }, [executionPrepared]);

    const advanceToNotification = useCallback(() => {
        if (!executionSnapshot) {
            setModalError("Não foi possível preparar a confirmação do sorteio.");
            setConfirmationStep("form");
            return;
        }

        setModalError(null);
        setModalSuccess(null);
        setConfirmationStep("notification");
    }, [executionSnapshot]);

    const createBaseSorteio = useCallback(async (snapshot: ExecutionSnapshot) => {
        const saveResp = await apiJson<ApiResp<{ id?: number }>>(
            `${API_URL}?op=admin_save_sorteio`,
            "POST",
            {
                titulo: snapshot.titulo,
                descricao: "",
                scheduled_at: "",
                status: "draft",
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
                premios: snapshot.premios,
            }
        );

        if (!premiosResp?.ok) {
            throw new Error(premiosResp?.error || "Falha ao salvar prêmios.");
        }

        return sorteioId;
    }, []);

    const finishSuccessfulRun = useCallback(async () => {
        await refreshPageData();

        if (!isMountedRef.current) return;

        setModalSuccess("Sorteio realizado com sucesso.");
        setModalError(null);
        setSubmitKind("idle");

        if (closeTimeoutRef.current !== null) {
            window.clearTimeout(closeTimeoutRef.current);
        }

        closeTimeoutRef.current = window.setTimeout(() => {
            if (!isMountedRef.current) return;
            closeModal();
        }, 1400);
    }, [closeModal, refreshPageData]);

    const runNow = useCallback(async () => {
        if (executionLockRef.current) return;

        if (!executionSnapshot) {
            setModalError("Revise as informações do sorteio antes de confirmar.");
            setConfirmationStep("form");
            return;
        }

        executionLockRef.current = true;
        setSubmitKind("running");
        setModalError(null);
        setModalSuccess(null);

        let sorteioId = pendingSorteioIdRef.current;

        try {
            if (!sorteioId) {
                sorteioId = await createBaseSorteio(executionSnapshot);
                pendingSorteioIdRef.current = sorteioId;
                setExecutionPrepared(true);
            }

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

            await finishSuccessfulRun();
        } catch (error) {
            if (!isMountedRef.current) return;

            let completedDespiteError = false;

            if (sorteioId) {
                try {
                    const dashboard = await loadDashboard();
                    completedDespiteError =
                        dashboard.sorteio?.id === sorteioId &&
                        sanitizeStatus(dashboard.sorteio.status) === "done";
                } catch {
                    completedDespiteError = false;
                }
            }

            if (completedDespiteError) {
                await finishSuccessfulRun();
                return;
            }

            setModalError(
                getErrorMessage(
                    error,
                    "Falha ao realizar sorteio. Não clique novamente até verificar a mensagem exibida."
                )
            );
            setSubmitKind("idle");
        } finally {
            executionLockRef.current = false;
        }
    }, [createBaseSorteio, executionSnapshot, finishSuccessfulRun, loadDashboard]);

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

            if (closeTimeoutRef.current !== null) {
                window.clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
            }
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
                confirmationStep={confirmationStep}
                snapshot={executionSnapshot}
                allowEditing={!executionPrepared}
                eligibleTotal={eligibleTotal}
                successMessage={modalSuccess}
                errorMessage={modalError || statsError}
                onClose={closeModal}
                onReview={prepareReview}
                onBackToForm={backToForm}
                onBackToReview={backToReview}
                onAdvanceToNotification={advanceToNotification}
                onRunNow={() => void runNow()}
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
                                    Visualize os sorteios realizados e execute novos sorteios com
                                    confirmação em duas etapas.
                                </p>
                            </div>

                            <button
                                type="button"
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
                                            Executado
                                        </th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                    {history.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={4}
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