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
import ItensTabela from "@/components/requisicoes/ItensTabela";

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
    icon: React.ElementType<any>;
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
            className="grid h-11 w-11 place-items-center rounded-full bg-[#E6F7FE] text-[#313C55] transition-colors group-hover:bg-[#313C55] group-hover:text-white dark:bg-[#00AEEC]/20 dark:text-white dark:group-hover:bg-[#F2CB3F] dark:group-hover:text-[#313C55]"
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

    if (s === "EM_SEPARACAO") return "border-[#00AEEC] bg-[#00AEEC] text-[#0F1626]";
    if (s === "EM_TRANSITO") return "border-[#313C55] bg-[#313C55] text-white dark:border-[#51607F] dark:bg-[#51607F]";
    if (s === "ENTREGUE") return "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20 dark:text-white";
    if (s === "CANCELADA") return "border-[#C9D1DE] bg-[#EEF2F7] text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]";
    if (s === "RECUSADA") return "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]";

    return "border-[#8FD6F4] bg-[#E6F7FE] text-[#313C55] dark:border-[#00AEEC]/50 dark:bg-[#00AEEC]/20 dark:text-white";
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
            ? "border-[#B42318] bg-white text-[#B42318] hover:bg-[#FDECEA] dark:border-[#FF9C92] dark:bg-[#232B3F] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15"
            : "border-[#313C55] dark:border-[#F2CB3F] bg-[#313C55] dark:bg-[#F2CB3F] text-white hover:bg-[#232B40] dark:hover:bg-[#E4BC30] dark:text-[#313C55]";

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
        <article className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-5 shadow-sm lg:col-span-3">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-black text-[#313C55] dark:text-white">
                            {reqCode(row)}
                        </span>

                        <RequestStatusBadge status={row.status} />

                        {isTruthy(row.atrasada_24h) ? (
                            <span className="rounded-full border border-[#F2CB3F] bg-[#F2CB3F] text-[#313C55] px-3 py-1 text-xs font-black">
                                +24h
                            </span>
                        ) : null}
                    </div>

                    <div className="mt-4 max-w-md rounded-2xl border border-[#00AEEC]/30 bg-[#E6F7FE] dark:bg-[#00AEEC]/20 px-4 py-3">
                        <p className="text-[11px] font-black uppercase tracking-wide text-[#313C55] dark:text-white">
                            Solicitante
                        </p>

                        <p className="mt-1 truncate text-2xl font-black tracking-tight text-[#313C55] dark:text-white">
                            {solicitante}
                        </p>
                    </div>
                </div>

                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[#EEF2F7] dark:bg-white/10 text-[#313C55] dark:text-[#D6DCE8]">
                    <IconTruckDelivery size={23} />
                </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-[#5B6478] dark:text-[#AEB9CF] sm:grid-cols-2">
                <ItensTabela resumo={row.itens_resumo} className="sm:col-span-2" />

                <p>
                    Destino:{" "}
                    <b className="text-[#313C55] dark:text-white">{destinationText(row)}</b>
                </p>

                <p>
                    Aberta em:{" "}
                    <b className="text-[#313C55] dark:text-white">{fmtDateTime(row.criado_em)}</b>
                </p>

                {row.id_atendimento ? (
                    <p>
                        Atendimento:{" "}
                        <b className="text-[#313C55] dark:text-white">{row.id_atendimento}</b>
                    </p>
                ) : null}

                {row.deposito_origem_nome ? (
                    <p>
                        Origem:{" "}
                        <b className="text-[#313C55] dark:text-white">{row.deposito_origem_nome}</b>
                    </p>
                ) : null}

                {row.enviado_em ? (
                    <p>
                        Enviada em:{" "}
                        <b className="text-[#313C55] dark:text-white">{fmtDateTime(row.enviado_em)}</b>
                    </p>
                ) : null}
            </div>

            {status === "EM_SEPARACAO" ? (
                <div className="mt-4 rounded-xl border border-[#00AEEC]/50 bg-[#E6F7FE] dark:bg-[#00AEEC]/20 px-3 py-2 text-sm font-bold text-[#313C55] dark:text-white">
                    Sua requisição está sendo separada.
                </div>
            ) : null}

            {status === "EM_TRANSITO" ? (
                <div className="mt-4 rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#EEF2F7] dark:bg-white/10 px-3 py-2 text-sm font-bold text-[#313C55] dark:text-white">
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
            role="dialog" data-pai-overlay
            aria-modal="true"
            className="fixed inset-0 z-50 flex min-h-[100dvh] items-end justify-center bg-[#313C55]/45 p-3 sm:items-center sm:p-4"
        >
            <div className="w-full max-w-lg rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-4 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-base font-black text-[#313C55] dark:text-white">
                            Cancelar {row ? reqCode(row) : "requisição"}
                        </h2>
                        <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                            Informe o motivo. O cancelamento ficará registrado no histórico.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-xl px-3 py-2 text-sm font-black text-[#5B6478] dark:text-[#AEB9CF] hover:bg-[#EEF2F7] dark:hover:bg-white/10 disabled:opacity-50"
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
                    className="mt-4 w-full rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2.5 text-[16px] text-[#313C55] dark:text-white shadow-sm outline-none focus:border-[#00AEEC] focus:ring-2 focus:ring-[#00AEEC]/30"
                />

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="min-h-11 rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-4 py-2 text-sm font-black text-[#313C55] dark:text-[#D6DCE8] shadow-sm hover:bg-[#EEF2F7] dark:hover:bg-white/10 disabled:opacity-50"
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
        <div className="min-h-[calc(100dvh-1px)] bg-[#F6F8FB] dark:bg-[#161C2A]">
            <div className="mx-auto max-w-6xl px-5 py-5">
                <header className="mb-5 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F]">
                        <IconPackage className="size-5 text-primary" />
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-[#313C55] dark:text-white">
                            Requisição de Material
                        </h1>
                        <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                            Acompanhe as requisições abertas e confirme o recebimento quando o material chegar.
                        </p>
                    </div>
                </header>

                {error ? (
                    <div className="mb-4 rounded-2xl border border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-4 text-sm font-bold text-[#B42318] dark:text-[#FF9C92]">
                        {error}
                    </div>
                ) : null}

                {okMsg ? (
                    <div className="mb-4 rounded-2xl border border-[#7BA11A]/50 dark:border-[#B3CE52]/40 bg-[#EEF5D6] dark:bg-[#B3CE52]/20 p-4 text-sm font-bold text-[#313C55] dark:text-white">
                        {okMsg}
                    </div>
                ) : null}

                <section className="mb-5">
                    {loading ? (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                            <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-5 text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF] shadow-sm lg:col-span-3">
                                Carregando suas requisições...
                            </div>
                        </div>
                    ) : requisicoesAbertas.length ? (
                        <div className="grid grid-cols-1 gap-3 sm:landscape:grid-cols-2 lg:grid-cols-4">
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
                            <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-5 text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF] shadow-sm lg:col-span-3">
                                Você não possui requisição pendente, em separação ou em trânsito.
                            </div>
                        </div>
                    )}
                </section>

                <section>
                    {perms == null ? (
                        <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-5 text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF] shadow-sm">
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
                                        border border-[#E3E8F0]
                                        bg-white
                                        px-3 py-4
                                        shadow-sm
                                        transition-all
                                        hover:-translate-y-[1px]
                                        hover:shadow-md
                                        dark:border-white/[0.12] dark:bg-[#232B3F]
                                    "
                                >
                                    <QuickIcon>
                                        <Icon size={22} />
                                    </QuickIcon>

                                    <span className="text-center text-[13px] font-extrabold leading-tight tracking-tight text-[#313C55] dark:text-white">
                                        {title}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-5 text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF] shadow-sm">
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