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

type ContractsByCpfsResp = {
    ok: boolean;
    sorteio_id?: number;
    contratos?: Record<string, string | number>;
    nomes?: Record<string, string>;
    origens?: Record<string, string>;
    nao_encontrados?: string[];
    consultados?: number;
    encontrados?: number;
    error?: string;
    detail?: string;
    request_errors?: Record<
        string,
        Array<{ http?: number | null; error?: string | null }>
    >;
};

type ApiResp<T = Record<string, never>> = { ok: boolean; error?: string } & T;

type PremioFormItem = {
    id: string;
    nome: string;
    quantidade: number;
};

type NewSorteioForm = {
    titulo: string;
    premios: PremioFormItem[];
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
const DECLARACAO_LOGO_URL =
    "https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1";

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

function onlyDigits(value: string) {
    return value.replace(/\D+/g, "");
}

function createPremioFormItem(id: string): PremioFormItem {
    return {
        id,
        nome: "",
        quantidade: 1,
    };
}

function createClientPremioId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `premio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePremioName(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

function getPremiosResumo(items: PremioFormItem[]): PremioResumo[] {
    return items
        .map((item) => ({
            nome: normalizePremioName(item.nome),
            quantidade: Number.isInteger(item.quantidade) ? item.quantidade : 0,
        }))
        .filter((item) => item.nome !== "");
}

function getTotalPremios(premios: PremioResumo[]) {
    return premios.reduce((total, premio) => total + premio.quantidade, 0);
}

function expandPremios(premios: PremioResumo[]) {
    const expanded: string[] = [];

    for (const premio of premios) {
        for (let index = 0; index < premio.quantidade; index += 1) {
            expanded.push(premio.nome);
        }
    }

    return expanded;
}

function getDuplicatePremioNames(premios: PremioResumo[]) {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const premio of premios) {
        const key = premio.nome.toLocaleLowerCase("pt-BR");

        if (seen.has(key)) {
            duplicates.add(premio.nome);
        } else {
            seen.add(key);
        }
    }

    return Array.from(duplicates);
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
        premios: [createPremioFormItem("premio-inicial")],
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
            ? (data as { ok?: boolean; error?: string; detail?: string })
            : { ok: false, error: "Resposta inválida do servidor" };

    if (!res.ok) {
        const serverMessage = [parsed.error, parsed.detail]
            .filter((value): value is string => Boolean(value?.trim()))
            .join(": ");

        throw new Error(
            serverMessage ||
            `Erro HTTP ${res.status}. O servidor não retornou uma mensagem JSON válida.`
        );
    }

    return data as T;
}

function formatDateOnlyBR(mysqlDatetime?: string | null) {
    const dt = parseMysqlDateTime(mysqlDatetime);
    return dt ? dt.toLocaleDateString("pt-BR") : "-";
}

function formatDateLongBR(mysqlDatetime?: string | null) {
    const dt = parseMysqlDateTime(mysqlDatetime);

    if (!dt) return "-";

    return dt.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });
}

function sanitizePdfFileName(value: string) {
    const safe = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();

    return safe || "sorteio";
}

async function loadImageAsDataUrl(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(url, {
            cache: "force-cache",
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Não foi possível carregar a logomarca (${response.status}).`);
        }

        const blob = await response.blob();

        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Falha ao converter a logomarca."));
            reader.readAsDataURL(blob);
        });
    } finally {
        window.clearTimeout(timeoutId);
    }
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

    const premiosResumo = getPremiosResumo(form.premios);
    const totalPremios = getTotalPremios(premiosResumo);
    const loading = submitKind === "running";
    const maxQuantidadePorPremio = Math.max(1, eligibleTotal ?? 999);
    const ultimoPremio = form.premios[form.premios.length - 1];
    const canAddPremio =
        Boolean(ultimoPremio) &&
        normalizePremioName(ultimoPremio.nome) !== "" &&
        Number.isInteger(ultimoPremio.quantidade) &&
        ultimoPremio.quantidade >= 1;

    const updatePremio = (
        premioId: string,
        patch: Partial<Pick<PremioFormItem, "nome" | "quantidade">>
    ) => {
        setForm((prev) => ({
            ...prev,
            premios: prev.premios.map((premio) =>
                premio.id === premioId ? { ...premio, ...patch } : premio
            ),
        }));
    };

    const addPremio = () => {
        if (!canAddPremio) return;

        setForm((prev) => ({
            ...prev,
            premios: [...prev.premios, createPremioFormItem(createClientPremioId())],
        }));
    };

    const removePremio = (premioId: string) => {
        setForm((prev) => {
            if (prev.premios.length === 1) {
                return {
                    ...prev,
                    premios: [createPremioFormItem("premio-inicial")],
                };
            }

            return {
                ...prev,
                premios: prev.premios.filter((premio) => premio.id !== premioId),
            };
        });
    };

    const title =
        confirmationStep === "form"
            ? "Novo Sorteio"
            : confirmationStep === "review"
                ? "Revise o sorteio"
                : "Confirmação final";

    const subtitle =
        confirmationStep === "form"
            ? "Cadastre cada prêmio com sua quantidade. A execução só ocorrerá após duas confirmações."
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

                                    <div className="space-y-3">
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                                Prêmios
                                            </h4>
                                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                Informe o nome e a quantidade de cada tipo de prêmio.
                                            </p>
                                        </div>

                                        <div className="space-y-3">
                                            {form.premios.map((premio, index) => (
                                                <div
                                                    key={premio.id}
                                                    className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60"
                                                >
                                                    <div className="mb-3 flex items-center justify-between gap-3">
                                                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                            Prêmio {index + 1}
                                                        </span>

                                                        <button
                                                            type="button"
                                                            onClick={() => removePremio(premio.id)}
                                                            disabled={loading}
                                                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/30"
                                                        >
                                                            Remover
                                                        </button>
                                                    </div>

                                                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                                                        <div className="space-y-2">
                                                            <label
                                                                htmlFor={`premio-nome-${premio.id}`}
                                                                className="text-xs font-semibold text-gray-600 dark:text-gray-300"
                                                            >
                                                                Nome do prêmio
                                                            </label>
                                                            <input
                                                                id={`premio-nome-${premio.id}`}
                                                                value={premio.nome}
                                                                onChange={(event) =>
                                                                    updatePremio(premio.id, {
                                                                        nome: event.target.value,
                                                                    })
                                                                }
                                                                maxLength={180}
                                                                placeholder='Ex.: Televisor 50"'
                                                                disabled={loading}
                                                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <label
                                                                htmlFor={`premio-quantidade-${premio.id}`}
                                                                className="text-xs font-semibold text-gray-600 dark:text-gray-300"
                                                            >
                                                                Quantidade
                                                            </label>
                                                            <input
                                                                id={`premio-quantidade-${premio.id}`}
                                                                type="number"
                                                                min={1}
                                                                max={maxQuantidadePorPremio}
                                                                inputMode="numeric"
                                                                value={premio.quantidade}
                                                                onChange={(event) => {
                                                                    const parsed = Number.parseInt(
                                                                        event.target.value,
                                                                        10
                                                                    );

                                                                    updatePremio(premio.id, {
                                                                        quantidade: Number.isNaN(parsed)
                                                                            ? 1
                                                                            : Math.min(
                                                                                maxQuantidadePorPremio,
                                                                                Math.max(1, parsed)
                                                                            ),
                                                                    });
                                                                }}
                                                                disabled={loading}
                                                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={addPremio}
                                            disabled={loading || !canAddPremio}
                                            className="inline-flex w-full items-center justify-center rounded-xl border border-dashed border-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/20"
                                        >
                                            + Adicionar próximo prêmio
                                        </button>

                                        {!canAddPremio ? (
                                            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                                                Preencha o nome do prêmio atual para adicionar o próximo.
                                            </p>
                                        ) : null}

                                        <div className="rounded-xl bg-gray-100 px-4 py-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span>
                                                    Tipos cadastrados:{" "}
                                                    <strong>{premiosResumo.length}</strong>
                                                </span>
                                                <span>
                                                    Total de unidades:{" "}
                                                    <strong>{totalPremios}</strong>
                                                </span>
                                            </div>
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
    const [pdfGenerating, setPdfGenerating] = useState(false);
    const [pdfError, setPdfError] = useState<string | null>(null);
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

    const premiosResumo = useMemo(() => getPremiosResumo(form.premios), [form.premios]);
    const totalPremios = useMemo(() => getTotalPremios(premiosResumo), [premiosResumo]);

    const canGenerateDeclaration =
        sanitizeStatus(latestSorteio?.status) === "done" &&
        latestResultados.length > 0;

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

        const emptyPremioIndex = form.premios.findIndex(
            (premio) => normalizePremioName(premio.nome) === ""
        );

        if (emptyPremioIndex >= 0) {
            setModalError(
                `Informe o nome do prêmio ${emptyPremioIndex + 1} ou remova essa linha.`
            );
            return;
        }

        if (premiosResumo.length === 0 || totalPremios === 0) {
            setModalError("Informe pelo menos um prêmio.");
            return;
        }

        const maxQuantidadePorPremio = Math.max(1, eligibleTotal ?? 999);
        const invalidQuantityIndex = form.premios.findIndex(
            (premio) =>
                !Number.isInteger(premio.quantidade) ||
                premio.quantidade < 1 ||
                premio.quantidade > maxQuantidadePorPremio
        );

        if (invalidQuantityIndex >= 0) {
            setModalError(
                `Informe uma quantidade válida entre 1 e ${maxQuantidadePorPremio} para o prêmio ${invalidQuantityIndex + 1
                }.`
            );
            return;
        }

        const duplicateNames = getDuplicatePremioNames(premiosResumo);

        if (duplicateNames.length > 0) {
            setModalError(
                `O prêmio "${duplicateNames[0]}" foi cadastrado mais de uma vez. Mantenha uma única linha e ajuste a quantidade.`
            );
            return;
        }

        if (eligibleTotal !== null && totalPremios > eligibleTotal) {
            setModalError(
                `Existem ${totalPremios} unidades de prêmio, mas apenas ${eligibleTotal} associados elegíveis. Reduza as quantidades antes de continuar.`
            );
            return;
        }

        const premiosExpandidos = expandPremios(premiosResumo);

        setExecutionSnapshot({
            titulo,
            premios: premiosExpandidos,
            resumo: premiosResumo.map((premio) => ({ ...premio })),
            totalPremios,
        });
        setConfirmationStep("review");
    }, [eligibleTotal, form.premios, form.titulo, premiosResumo, totalPremios]);

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

    const downloadDeclaracaoEntrega = useCallback(async () => {
        if (pdfGenerating) return;

        if (sanitizeStatus(latestSorteio?.status) !== "done" || !latestSorteio) {
            setPdfError("A declaração só pode ser gerada após a realização do sorteio.");
            return;
        }

        if (latestResultados.length === 0) {
            setPdfError("Não há ganhadores disponíveis para gerar a declaração.");
            return;
        }

        // Referências locais: a geração do PDF não altera o sorteio nem o banco.
        const sorteio = latestSorteio;
        const resultados = [...latestResultados];

        setPdfGenerating(true);
        setPdfError(null);

        try {
            const cpfs = Array.from(
                new Set(
                    resultados
                        .map((resultado) => onlyDigits(resultado.cpf))
                        .filter((cpf) => cpf.length === 11)
                )
            );

            const contractsController = new AbortController();
            const contractsTimeoutId = window.setTimeout(
                () => contractsController.abort(),
                35000
            );

            let contractsResp: ContractsByCpfsResp;

            try {
                contractsResp = await apiJson<ContractsByCpfsResp>(
                    `${API_URL}?op=admin_contracts_by_cpfs`,
                    "POST",
                    {
                        sorteio_id: sorteio.id,
                        cpfs,
                    },
                    contractsController.signal
                );
            } catch (error) {
                if ((error as { name?: string })?.name === "AbortError") {
                    throw new Error(
                        "A consulta dos contratos ultrapassou 35 segundos e foi cancelada. Tente novamente."
                    );
                }
                throw error;
            } finally {
                window.clearTimeout(contractsTimeoutId);
            }

            if (!contractsResp?.ok) {
                const serverMessage = [
                    contractsResp?.error,
                    contractsResp?.detail,
                ]
                    .filter((value): value is string => Boolean(value?.trim()))
                    .join(": ");

                throw new Error(
                    serverMessage ||
                    "Não foi possível consultar os contratos dos ganhadores."
                );
            }

            const contratosPorCpf: Record<string, string> = {};
            Object.entries(contractsResp.contratos || {}).forEach(
                ([cpf, contrato]) => {
                    const cpfKey = onlyDigits(cpf);
                    const contratoValue = String(contrato ?? "").trim();

                    if (cpfKey.length === 11 && contratoValue !== "") {
                        contratosPorCpf[cpfKey] = contratoValue;
                    }
                }
            );

            const cpfsSemContrato = cpfs.filter(
                (cpf) => !contratosPorCpf[cpf]
            );

            if (cpfsSemContrato.length > 0) {
                const lista = cpfsSemContrato
                    .slice(0, 5)
                    .map((cpf) => maskCpf(cpf))
                    .join(", ");

                const restante =
                    cpfsSemContrato.length > 5
                        ? ` e mais ${cpfsSemContrato.length - 5}`
                        : "";

                const houveFalhaDeConsulta = Object.keys(
                    contractsResp.request_errors || {}
                ).length > 0;

                throw new Error(
                    houveFalhaDeConsulta
                        ? `A consulta à Unypax falhou para: ${lista}${restante}. Tente novamente em alguns instantes.`
                        : `Não foi possível localizar o número correto do contrato para: ${lista}${restante}. O PDF não foi gerado para evitar informações incorretas.`
                );
            }

            const { jsPDF } = await import("jspdf");

            let logoDataUrl: string | null = null;
            try {
                logoDataUrl = await loadImageAsDataUrl(DECLARACAO_LOGO_URL);
            } catch {
                // Se a imagem externa bloquear CORS, o PDF continua com o nome PAI.
                logoDataUrl = null;
            }

            const doc = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
                compress: true,
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const marginX = 15;
            const contentWidth = pageWidth - marginX * 2;
            const footerY = pageHeight - 8;

            const drawHeader = (includeIntroduction: boolean) => {
                let y = 12;

                if (logoDataUrl) {
                    const logoFormat = logoDataUrl.startsWith("data:image/jpeg")
                        ? "JPEG"
                        : "PNG";
                    doc.addImage(
                        logoDataUrl,
                        logoFormat,
                        marginX,
                        y,
                        45,
                        11.25,
                        undefined,
                        "FAST"
                    );
                } else {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(18);
                    doc.text("PAI", marginX, y + 8);
                }

                doc.setFont("helvetica", "bold");
                doc.setFontSize(13);
                doc.text("DECLARAÇÃO DE ENTREGA DE PRÊMIOS", pageWidth / 2, y + 8, {
                    align: "center",
                });

                y += 19;
                doc.setDrawColor(90);
                doc.setLineWidth(0.35);
                doc.line(marginX, y, pageWidth - marginX, y);
                y += 7;

                doc.setFont("helvetica", "bold");
                doc.setFontSize(9.5);
                const titleLines = doc.splitTextToSize(
                    `SORTEIO: ${sorteio.titulo.toUpperCase()}`,
                    contentWidth
                );
                doc.text(titleLines, marginX, y);
                y += titleLines.length * 4.2 + 1;

                doc.setFont("helvetica", "normal");
                doc.text(
                    `REALIZADO EM: ${formatDateOnlyBR(sorteio.executed_at)}`,
                    marginX,
                    y
                );
                y += 7;

                if (includeIntroduction) {
                    const dataPorExtenso = formatDateLongBR(sorteio.executed_at);
                    const declaration =
                        `Eu: ________________________________________________, declaro, para os devidos fins, que presenciei a realização do sorteio no dia ${dataPorExtenso}, no escritório do PAI - Plano Assistencial Integrado, localizado na Avenida Clériston Andrade, nº 135, Centro, Barreiras - BA. Declaro, ainda, que o sorteio foi realizado de forma eletrônica, por meio do aplicativo do associado, de maneira justa e transparente, entre os associados que mantêm as parcelas do plano em dia.`;
                    const declarationLines = doc.splitTextToSize(
                        declaration,
                        contentWidth
                    );

                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(9.5);
                    doc.text(declarationLines, marginX, y, {
                        align: "justify",
                        maxWidth: contentWidth,
                    });
                    y += declarationLines.length * 4.4 + 7;

                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(11);
                    const premiosTitle = `PRÊMIOS SORTEADOS NO DIA ${dataPorExtenso.toLocaleUpperCase(
                        "pt-BR"
                    )}:`;
                    const premiosTitleLines = doc.splitTextToSize(
                        premiosTitle,
                        contentWidth
                    );
                    doc.text(premiosTitleLines, pageWidth / 2, y, {
                        align: "center",
                    });
                    y += premiosTitleLines.length * 4.8 + 3;
                } else {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(10);
                    doc.text("CONTINUAÇÃO DOS SORTEADOS", pageWidth / 2, y, {
                        align: "center",
                    });
                    y += 4;
                }

                return y;
            };

            let y = drawHeader(true);

            resultados.forEach((resultado, index) => {
                const headline = `${index + 1}. ${resultado.premio_nome.toUpperCase()} - ${resultado.nome.toUpperCase()}`;
                const headlineLines = doc.splitTextToSize(headline, contentWidth);
                const blockHeight = 51 + Math.max(0, headlineLines.length - 1) * 4.2;

                if (y + blockHeight > footerY - 4) {
                    doc.addPage();
                    y = drawHeader(false);
                }

                doc.setDrawColor(145);
                doc.setLineWidth(0.25);
                doc.line(marginX, y, pageWidth - marginX, y);
                y += 5.5;

                doc.setFont("helvetica", "bold");
                doc.setFontSize(9.5);
                doc.text(headlineLines, marginX, y);
                y += headlineLines.length * 4.2 + 2;

                doc.setFont("helvetica", "normal");
                doc.text(`CPF: ${maskCpf(resultado.cpf)}`, marginX, y);
                y += 7;

                const cpfKey = onlyDigits(resultado.cpf);
                const numeroContrato = contratosPorCpf[cpfKey];

                doc.text(`CONTRATO: ${numeroContrato}`, marginX, y);
                y += 8;

                doc.text("DATA DA RETIRADA DO PRÊMIO: ____/____/________", marginX, y);
                y += 8;

                doc.text(
                    "GRAU DE PARENTESCO: _________________________________________",
                    marginX,
                    y
                );
                y += 9;

                doc.text(
                    "ASSINATURA DO RESPONSÁVEL: _________________________________",
                    marginX,
                    y
                );
                y += 9;
            });

            const totalPages = doc.getNumberOfPages();
            for (let page = 1; page <= totalPages; page += 1) {
                doc.setPage(page);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(95);
                doc.text(
                    `PAI - Plano Assistencial Integrado | Página ${page} de ${totalPages}`,
                    pageWidth / 2,
                    footerY,
                    { align: "center" }
                );
                doc.setTextColor(0);
            }

            doc.save(
                `${sanitizePdfFileName(sorteio.titulo)}-declaracao-entrega-premios.pdf`
            );
        } catch (error) {
            setPdfError(
                getErrorMessage(error, "Falha ao gerar a declaração de entrega dos prêmios.")
            );
        } finally {
            setPdfGenerating(false);
        }
    }, [latestResultados, latestSorteio, pdfGenerating]);

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

                            <div className="flex flex-col gap-2 sm:flex-row">
                                {canGenerateDeclaration ? (
                                    <button
                                        type="button"
                                        onClick={() => void downloadDeclaracaoEntrega()}
                                        disabled={pdfGenerating}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900 dark:text-emerald-300 dark:hover:bg-emerald-950/20"
                                    >
                                        {pdfGenerating ? <Spinner size={16} /> : null}
                                        {pdfGenerating
                                            ? "Gerando declaração..."
                                            : "Declaração de Entrega"}
                                    </button>
                                ) : null}

                                <button
                                    type="button"
                                    onClick={() => void openNovoSorteioFlow()}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                                >
                                    Novo Sorteio
                                </button>
                            </div>
                        </div>

                        {pageError ? (
                            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                                {pageError}
                            </div>
                        ) : null}

                        {pdfError ? (
                            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                                {pdfError}
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