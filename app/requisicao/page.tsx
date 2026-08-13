"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    IconChartBar,
    IconClipboardList,
    IconClipboardPlus,
    IconPackage,
    IconTruckDelivery,
} from "@tabler/icons-react";
import { usePerms } from "../_perms/PermsProvider";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/requisicoes.php`;

type ID = number;

type StatusId =
    | "PENDENTE"
    | "EM_SEPARACAO"
    | "EM_TRANSITO"
    | "ENTREGUE"
    | "CANCELADA"
    | "RECUSADA";

type ReqListRow = {
    id: ID;
    codigo?: string | null;
    status: StatusId | string;
    status_label?: string | null;
    solicitante_usuario_id?: ID;
    solicitante_nome?: string | null;
    unidade_destino_nome?: string | null;
    unidade_destino_texto?: string | null;
    id_atendimento?: string | null;
    justificativa?: string | null;
    deposito_origem_nome?: string | null;
    itens_resumo?: string | null;
    total_itens?: number | string;
    total_quantidade?: number | string;
    criado_em: string;
    separado_em?: string | null;
    enviado_em?: string | null;
    recebido_em?: string | null;
    atrasada_24h?: 0 | 1 | number | string;
};

type ListResp = {
    ok: boolean;
    rows?: ReqListRow[];
    msg?: string;
    need_login?: 1;
};

type MutResp = {
    ok: boolean;
    msg?: string;
    row?: ReqListRow;
    need_login?: 1;
};

type QuickItem = {
    title: string;
    href: string;
    slug: string;
    icon: React.ElementType<{ size?: number }>;
};

async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";

    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Resposta inesperada. ${txt ? txt.slice(0, 180) : ""}`.trim());
    }

    return (await r.json()) as T;
}

async function apiGet<T>(qs: Record<string, string | number | boolean | undefined>) {
    const u = new URL(API_BASE);

    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined || v === "") return;
        u.searchParams.set(k, String(v));
    });

    const r = await fetch(u.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });

    return safeJson<T>(r);
}

async function apiPost<T>(body: Record<string, unknown>) {
    const r = await fetch(API_BASE, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    return safeJson<T>(r);
}

function QuickIcon({ children }: { children: React.ReactNode }) {
    return (
        <span
            className="
                grid h-11 w-11 place-items-center rounded-full
                bg-sky-100 text-sky-700
                transition-colors
                group-hover:bg-sky-600 group-hover:text-white
                dark:bg-sky-900/30 dark:text-sky-200
                dark:group-hover:bg-sky-600
            "
        >
            {children}
        </span>
    );
}

const items: QuickItem[] = [
    {
        title: "Solicitar Produto",
        href: "/solicitar-produto",
        slug: "solicitar-produto",
        icon: IconClipboardPlus,
    },
    {
        title: "Minhas Solicitações",
        href: "/minhas-solicitacoes",
        slug: "minhas-solicitacoes",
        icon: IconClipboardList,
    },
    {
        title: "Requisições",
        href: "/requisicoes",
        slug: "requisicoes",
        icon: IconClipboardList,
    },
    {
        title: "Dashboard Requisições",
        href: "/dashboard-requisicoes",
        slug: "dashboard-requisicoes",
        icon: IconChartBar,
    },
];

function toStatus(v: unknown): StatusId {
    const s = String(v || "").toUpperCase();

    if (
        s === "PENDENTE" ||
        s === "EM_SEPARACAO" ||
        s === "EM_TRANSITO" ||
        s === "ENTREGUE" ||
        s === "CANCELADA" ||
        s === "RECUSADA"
    ) {
        return s;
    }

    return "PENDENTE";
}

function statusLabel(v: unknown) {
    const s = toStatus(v);

    if (s === "PENDENTE") return "Pendente";
    if (s === "EM_SEPARACAO") return "Em separação";
    if (s === "EM_TRANSITO") return "Em trânsito";
    if (s === "ENTREGUE") return "Entregue";
    if (s === "CANCELADA") return "Cancelada";
    if (s === "RECUSADA") return "Recusada";

    return String(v || "");
}

function statusClass(v: unknown) {
    const s = toStatus(v);

    if (s === "EM_SEPARACAO") {
        return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200";
    }

    if (s === "EM_TRANSITO") {
        return "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200";
    }

    if (s === "ENTREGUE") {
        return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200";
    }

    if (s === "CANCELADA") {
        return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
    }

    if (s === "RECUSADA") {
        return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200";
    }

    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200";
}

function isTruthy(v: unknown) {
    return v === 1 || v === "1" || v === true || String(v).toLowerCase() === "true";
}

function fmtDateTime(value?: string | null) {
    if (!value) return "-";

    try {
        const normalized = String(value).includes("T") ? String(value) : String(value).replace(" ", "T");
        const d = new Date(normalized);

        if (Number.isNaN(d.getTime())) return String(value);

        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(d);
    } catch {
        return String(value);
    }
}

function destinationText(row?: ReqListRow | null) {
    if (!row) return "-";
    return row.unidade_destino_nome || row.unidade_destino_texto || "-";
}

function reqCode(row?: ReqListRow | null) {
    if (!row) return "REQ";
    return row.codigo || `REQ-${String(row.id).padStart(6, "0")}`;
}

function RequestStatusBadge({ status }: { status: unknown }) {
    return (
        <span
            className={[
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-black",
                statusClass(status),
            ].join(" ")}
        >
            {statusLabel(status)}
        </span>
    );
}

function ActionButton({
    children,
    variant = "primary",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "danger";
}) {
    const cls =
        variant === "danger"
            ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
            : "border-sky-700 bg-sky-700 text-white hover:bg-sky-800 dark:border-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500";

    return (
        <button
            {...props}
            className={[
                "inline-flex min-h-11 w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",
                cls,
                props.className || "",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function RequestCard({
    row,
    saving,
    onCancel,
    onReceive,
}: {
    row: ReqListRow;
    saving: boolean;
    onCancel: (row: ReqListRow) => void;
    onReceive: (row: ReqListRow) => void;
}) {
    const solicitante = row.solicitante_nome || "Solicitante não informado";
    const status = toStatus(row.status);
    const canCancel = status === "PENDENTE" || status === "EM_SEPARACAO";
    const canReceive = status === "EM_TRANSITO";

    return (
        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-3">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-black text-gray-950 dark:text-white">
                            {reqCode(row)}
                        </span>

                        <RequestStatusBadge status={row.status} />

                        {isTruthy(row.atrasada_24h) ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                                +24h
                            </span>
                        ) : null}
                    </div>

                    <div className="mt-4 max-w-md rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 dark:border-sky-900/40 dark:bg-sky-950/30">
                        <p className="text-[11px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">
                            Solicitante
                        </p>

                        <p className="mt-1 truncate text-2xl font-black tracking-tight text-sky-950 dark:text-white">
                            {solicitante}
                        </p>
                    </div>
                </div>

                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    <IconTruckDelivery size={23} />
                </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-gray-600 dark:text-gray-300 sm:grid-cols-2">
                <p className="line-clamp-2 font-black text-gray-900 dark:text-white sm:col-span-2">
                    {row.itens_resumo || "Itens não informados"}
                </p>

                <p>
                    Destino:{" "}
                    <b className="text-gray-900 dark:text-white">{destinationText(row)}</b>
                </p>

                <p>
                    Aberta em:{" "}
                    <b className="text-gray-900 dark:text-white">{fmtDateTime(row.criado_em)}</b>
                </p>

                {row.id_atendimento ? (
                    <p>
                        Atendimento:{" "}
                        <b className="text-gray-900 dark:text-white">{row.id_atendimento}</b>
                    </p>
                ) : null}

                {row.deposito_origem_nome ? (
                    <p>
                        Origem:{" "}
                        <b className="text-gray-900 dark:text-white">{row.deposito_origem_nome}</b>
                    </p>
                ) : null}

                {row.enviado_em ? (
                    <p>
                        Enviada em:{" "}
                        <b className="text-gray-900 dark:text-white">{fmtDateTime(row.enviado_em)}</b>
                    </p>
                ) : null}
            </div>

            {status === "EM_SEPARACAO" ? (
                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
                    Sua requisição está sendo separada.
                </div>
            ) : null}

            {status === "EM_TRANSITO" ? (
                <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-200">
                    O material foi enviado. Somente você, como solicitante, pode confirmar o recebimento.
                </div>
            ) : null}

            {canCancel || canReceive ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {canReceive ? (
                        <ActionButton type="button" onClick={() => onReceive(row)} disabled={saving}>
                            Confirmar recebimento
                        </ActionButton>
                    ) : null}

                    {canCancel ? (
                        <ActionButton type="button" variant="danger" onClick={() => onCancel(row)} disabled={saving}>
                            Cancelar minha requisição
                        </ActionButton>
                    ) : null}
                </div>
            ) : null}
        </article>
    );
}

function CancelModal({
    open,
    row,
    motivo,
    saving,
    onChange,
    onClose,
    onConfirm,
}: {
    open: boolean;
    row: ReqListRow | null;
    motivo: string;
    saving: boolean;
    onChange: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}) {
    useEffect(() => {
        if (!open) return;

        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex min-h-[100dvh] items-end justify-center bg-slate-950/55 p-3 sm:items-center sm:p-4"
        >
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-base font-black text-slate-950 dark:text-white">
                            Cancelar {row ? reqCode(row) : "requisição"}
                        </h2>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            Informe o motivo. O cancelamento ficará registrado no histórico.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-xl px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                        aria-label="Fechar"
                    >
                        ✕
                    </button>
                </div>

                <textarea
                    value={motivo}
                    onChange={(e) => onChange(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder="Digite o motivo do cancelamento"
                    className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[16px] text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                        Voltar
                    </button>

                    <ActionButton
                        type="button"
                        variant="danger"
                        onClick={onConfirm}
                        disabled={saving || !motivo.trim()}
                    >
                        {saving ? "Cancelando..." : "Confirmar cancelamento"}
                    </ActionButton>
                </div>
            </div>
        </div>
    );
}

export default function RequisicaoPage() {
    const { perms, has } = usePerms();

    const [rows, setRows] = useState<ReqListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [okMsg, setOkMsg] = useState("");

    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelRow, setCancelRow] = useState<ReqListRow | null>(null);
    const [cancelMotivo, setCancelMotivo] = useState("");

    const loadRequisicoes = useCallback(async () => {
        setError("");

        try {
            const data = await apiGet<ListResp>({
                action: "minhas",
                status: "PENDENTE,EM_SEPARACAO,EM_TRANSITO",
                limit: 50,
            });

            if (!data.ok) {
                throw new Error(data.msg || "Não foi possível carregar suas requisições.");
            }

            setRows(data.rows || []);
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar suas requisições.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadRequisicoes();

        const timer = window.setInterval(() => {
            void loadRequisicoes();
        }, 30000);

        return () => window.clearInterval(timer);
    }, [loadRequisicoes]);

    const requisicoesAbertas = useMemo(() => {
        return rows.filter((row) => {
            const status = toStatus(row.status);
            return status === "PENDENTE" || status === "EM_SEPARACAO" || status === "EM_TRANSITO";
        });
    }, [rows]);

    const actions = perms == null ? [] : items.filter((item) => has(item.slug));

    function askCancel(row: ReqListRow) {
        setError("");
        setOkMsg("");
        setCancelRow(row);
        setCancelMotivo("");
        setCancelOpen(true);
    }

    async function confirmCancel() {
        if (!cancelRow || saving) return;

        const motivo = cancelMotivo.trim();
        if (!motivo) {
            setError("Informe o motivo do cancelamento.");
            return;
        }

        setSaving(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiPost<MutResp>({
                action: "cancelar_minha",
                id: cancelRow.id,
                motivo,
            });

            if (!data.ok) {
                throw new Error(data.msg || "Não foi possível cancelar a requisição.");
            }

            setCancelOpen(false);
            setCancelRow(null);
            setCancelMotivo("");
            setOkMsg(data.msg || "Requisição cancelada.");
            await loadRequisicoes();
        } catch (e: any) {
            setError(e?.message || "Não foi possível cancelar a requisição.");
        } finally {
            setSaving(false);
        }
    }

    async function receiveReq(row: ReqListRow) {
        if (saving) return;

        const confirmed = window.confirm(
            `Confirmar o recebimento de ${reqCode(row)}? Esta ação finaliza a requisição.`
        );

        if (!confirmed) return;

        setSaving(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiPost<MutResp>({
                action: "confirmar_recebimento",
                id: row.id,
            });

            if (!data.ok) {
                throw new Error(data.msg || "Não foi possível confirmar o recebimento.");
            }

            setOkMsg(data.msg || "Recebimento confirmado.");
            await loadRequisicoes();
        } catch (e: any) {
            setError(e?.message || "Não foi possível confirmar o recebimento.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="min-h-[calc(100vh-1px)] bg-gray-50 dark:bg-gray-950">
            <div className="mx-auto max-w-6xl px-5 py-5">
                <header className="mb-5 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <IconPackage className="size-5 text-primary" />
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Requisição de Material
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Acompanhe as requisições abertas e confirme o recebimento quando o material chegar.
                        </p>
                    </div>
                </header>

                {error ? (
                    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                        {error}
                    </div>
                ) : null}

                {okMsg ? (
                    <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                        {okMsg}
                    </div>
                ) : null}

                <section className="mb-5">
                    {loading ? (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                            <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 lg:col-span-3">
                                Carregando suas requisições...
                            </div>
                        </div>
                    ) : requisicoesAbertas.length ? (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                            {requisicoesAbertas.map((row) => (
                                <RequestCard
                                    key={row.id}
                                    row={row}
                                    saving={saving}
                                    onCancel={askCancel}
                                    onReceive={receiveReq}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                            <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 lg:col-span-3">
                                Você não possui requisição pendente, em separação ou em trânsito.
                            </div>
                        </div>
                    )}
                </section>

                <section>
                    {perms == null ? (
                        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                            Carregando permissões...
                        </div>
                    ) : actions.length ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                            {actions.map(({ title, href, icon: Icon }) => (
                                <Link
                                    key={href}
                                    href={href}
                                    className="
                                        group flex flex-col items-center justify-center
                                        gap-2.5
                                        rounded-2xl
                                        border border-gray-200
                                        bg-white
                                        px-3 py-4
                                        shadow-sm
                                        transition-all
                                        hover:-translate-y-[1px]
                                        hover:shadow-md
                                        dark:border-gray-800 dark:bg-gray-900
                                    "
                                >
                                    <QuickIcon>
                                        <Icon size={22} />
                                    </QuickIcon>

                                    <span className="text-center text-[13px] font-extrabold leading-tight tracking-tight text-gray-900 dark:text-white">
                                        {title}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                            Nenhuma opção disponível para o seu usuário.
                        </div>
                    )}
                </section>
            </div>

            <CancelModal
                open={cancelOpen}
                row={cancelRow}
                motivo={cancelMotivo}
                saving={saving}
                onChange={setCancelMotivo}
                onClose={() => {
                    if (saving) return;
                    setCancelOpen(false);
                    setCancelRow(null);
                    setCancelMotivo("");
                }}
                onConfirm={confirmCancel}
            />
        </div>
    );
}