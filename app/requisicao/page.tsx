"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
    IconChartBar,
    IconChevronRight,
    IconClipboardList,
    IconClipboardPlus,
    IconTruckDelivery,
    IconX,
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
    /** Cor do chip do ícone, igual ao mockup (c1 azul claro, c2 verde claro, c3 amarelo claro). */
    chip: string;
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

const CHIP_C1 = "bg-[#E9EFF6] dark:bg-[#3D6A99]/20";
const CHIP_C2 = "bg-[#EEF5D6] dark:bg-[#B3CE52]/[0.18]";
const CHIP_C3 = "bg-[#FCF3CC] dark:bg-[#F2CB3F]/[0.16]";

const items: QuickItem[] = [
    {
        title: "Solicitar Produto",
        href: "/solicitar-produto",
        slug: "solicitar-produto",
        icon: IconClipboardPlus,
        chip: CHIP_C1,
    },
    {
        title: "Minhas Solicitações",
        href: "/minhas-solicitacoes",
        slug: "minhas-solicitacoes",
        icon: IconClipboardList,
        chip: CHIP_C2,
    },
    {
        title: "Requisições",
        href: "/requisicoes",
        slug: "requisicoes",
        icon: IconTruckDelivery,
        chip: CHIP_C3,
    },
    {
        title: "Dashboard Requisições",
        href: "/dashboard-requisicoes",
        slug: "dashboard-requisicoes",
        icon: IconChartBar,
        chip: CHIP_C1,
    },
];

/* Classes visuais do mockup (06/10/2026). Celular: botões de 48px; computador (lg): 44px. */
const BTN_BASE =
    "inline-flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] px-[18px] text-[15px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45 lg:h-11 lg:border lg:text-sm";
const BTN_SEC =
    "border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08]";
const BTN_PRI =
    "border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
const BTN_DNG =
    "border-[#B42318] bg-white text-[#B42318] hover:bg-[#FDECEA] dark:border-[#FF9C92] dark:bg-[#232B3F] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15";
const BOX = "rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
const LBL_SECAO = "mb-3 hidden text-xs font-extrabold uppercase tracking-[.12em] text-[#5B6478] dark:text-[#AEB9CF] lg:block";

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

    if (s === "EM_SEPARACAO") return "border-[#3D6A99] bg-[#3D6A99] text-white";
    if (s === "EM_TRANSITO") return "border-[#313C55] bg-[#313C55] text-white dark:border-[#51607F] dark:bg-[#51607F]";
    if (s === "ENTREGUE") return "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20 dark:text-white";
    if (s === "CANCELADA") return "border-[#C9D1DE] bg-[#EEF2F7] text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]";
    if (s === "RECUSADA") return "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]";

    return "border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white";
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
                "inline-flex h-[26px] items-center whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-extrabold",
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
    variant?: "primary" | "danger" | "secondary";
}) {
    const cls = variant === "danger" ? BTN_DNG : variant === "secondary" ? BTN_SEC : BTN_PRI;

    return (
        <button {...props} className={[BTN_BASE, cls, props.className || ""].join(" ")}>
            {children}
        </button>
    );
}

/**
 * Janela aberta direto no <body> (06/10/2026). A página rola dentro de um contêiner e, no iPhone,
 * a barra de baixo (z-40) ficava por cima. Só chama createPortal depois de montar no cliente.
 */
function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    return montado ? createPortal(children, document.body) : null;
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
        <article className={[BOX, "p-3.5 lg:px-6 lg:py-5"].join(" ")}>
            <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-extrabold text-[#313C55] dark:text-white lg:text-lg">
                            {reqCode(row)}
                        </span>

                        <RequestStatusBadge status={row.status} />

                        {isTruthy(row.atrasada_24h) ? (
                            <span className="inline-flex h-[26px] items-center rounded-full border-[1.5px] border-[#F2CB3F] bg-[#F2CB3F] px-2.5 text-[12.5px] font-extrabold text-[#313C55]">
                                +24h
                            </span>
                        ) : null}
                    </div>

                    <div className="mt-2.5 rounded-xl bg-[#E9EFF6] px-3 py-2 dark:bg-[#3D6A99]/20 lg:mt-3.5 lg:inline-block lg:min-w-[320px] lg:max-w-full lg:rounded-[14px] lg:px-4 lg:py-2.5">
                        <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF] lg:text-xs">
                            Solicitante
                        </p>

                        <p className="break-words text-lg font-extrabold text-[#313C55] dark:text-white lg:mt-0.5 lg:text-[22px]">
                            {solicitante}
                        </p>
                    </div>
                </div>

                <div className="hidden size-12 shrink-0 place-items-center rounded-full bg-[#EEF2F7] text-[#313C55] dark:bg-white/[0.08] dark:text-white lg:grid">
                    <IconTruckDelivery size={20} stroke={1.8} />
                </div>
            </div>

            <ItensTabela resumo={row.itens_resumo} className="mt-2.5 lg:mt-4" />

            <div className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:mt-2.5 lg:grid lg:grid-cols-3 lg:gap-x-6 lg:gap-y-2 lg:text-sm">
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
                <div className="mt-2.5 rounded-xl border border-[#E3E8F0] bg-[#E9EFF6] px-3 py-2 text-[13px] font-bold text-[#313C55] dark:border-white/[0.12] dark:bg-[#3D6A99]/20 dark:text-white lg:mt-3.5 lg:px-3.5 lg:py-2.5 lg:text-sm">
                    Sua requisição está sendo separada.
                </div>
            ) : null}

            {status === "EM_TRANSITO" ? (
                <div className="mt-2.5 rounded-xl border border-[#E3E8F0] bg-[#EEF2F7] px-3 py-2 text-[13px] font-bold text-[#313C55] dark:border-white/[0.12] dark:bg-white/[0.08] dark:text-white lg:mt-3.5 lg:px-3.5 lg:py-2.5 lg:text-sm">
                    O material foi enviado. Somente você, como solicitante, pode confirmar o recebimento.
                </div>
            ) : null}

            {canCancel || canReceive ? (
                <div className="mt-3 flex flex-col gap-2 lg:mt-4 lg:flex-row lg:gap-3">
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

/**
 * Janela de cancelamento. Computador (lg): diálogo centralizado. Celular: folha que sobe de baixo.
 */
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

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);

        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <NoCorpo>
            <div
                role="dialog" data-pai-overlay
                aria-modal="true"
                aria-label="Cancelar requisição"
                className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6"
            >
                <div className="flex max-h-[90dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-full lg:max-w-[520px] lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12]">
                    <div className="flex items-start gap-2 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:gap-3 lg:px-6 lg:py-5">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[19px] font-extrabold leading-tight lg:text-xl">
                                Cancelar {row ? reqCode(row) : "requisição"}
                            </h2>
                            <p className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:mt-1 lg:text-sm">
                                Informe o motivo. O cancelamento ficará registrado no histórico.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="grid size-11 shrink-0 place-items-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-50 dark:text-white dark:hover:bg-white/[0.08]"
                            aria-label="Fechar"
                        >
                            <IconX size={20} stroke={1.8} />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3.5 lg:px-6 lg:py-5">
                        <textarea
                            value={motivo}
                            onChange={(e) => onChange(e.target.value)}
                            rows={4}
                            autoFocus
                            placeholder="Digite o motivo do cancelamento"
                            aria-label="Motivo do cancelamento"
                            className="block w-full resize-y rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 py-3 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]"
                        />
                    </div>

                    <div className="flex gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end lg:gap-3 lg:px-6 lg:py-4">
                        <ActionButton type="button" variant="secondary" onClick={onClose} disabled={saving} className="flex-1 lg:flex-none">
                            Voltar
                        </ActionButton>

                        <ActionButton
                            type="button"
                            variant="danger"
                            onClick={onConfirm}
                            disabled={saving || !motivo.trim()}
                            className="flex-1 lg:flex-none"
                        >
                            {saving ? "Cancelando..." : "Confirmar cancelamento"}
                        </ActionButton>
                    </div>
                </div>
            </div>
        </NoCorpo>
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

    const closeCancel = useCallback(() => {
        if (saving) return;
        setCancelOpen(false);
        setCancelRow(null);
        setCancelMotivo("");
    }, [saving]);

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
        <div className="min-h-[calc(100dvh-1px)] bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto flex max-w-[1120px] flex-col gap-3.5 px-4 pb-5 pt-4 lg:block lg:px-10 lg:pb-12 lg:pt-8">
                <header className="lg:mb-6">
                    <h1 className="text-2xl font-extrabold leading-tight text-[#313C55] dark:text-white lg:text-[28px]">
                        Requisição de Material
                    </h1>
                    <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                        Acompanhe as requisições abertas e confirme o recebimento quando o material chegar.
                    </p>
                </header>

                {error ? (
                    <div role="alert" className="rounded-[14px] border border-[#B42318] bg-[#FDECEA] px-4 py-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92] lg:mb-4">
                        {error}
                    </div>
                ) : null}

                {okMsg ? (
                    <div role="status" className="rounded-[14px] border border-[#B3CE52] bg-[#EEF5D6] px-4 py-3 text-sm font-bold text-[#313C55] dark:bg-[#B3CE52]/[0.18] dark:text-white lg:mb-4">
                        {okMsg}
                    </div>
                ) : null}

                <section>
                    <h2 className={LBL_SECAO}>Suas requisições abertas</h2>

                    {loading ? (
                        <div className={[BOX, "p-[18px] text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF] lg:p-6 lg:text-[15px]"].join(" ")}>
                            Carregando suas requisições...
                        </div>
                    ) : requisicoesAbertas.length ? (
                        <div className="grid grid-cols-1 items-start gap-3 max-lg:landscape:grid-cols-2 lg:gap-4">
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
                        <div className={[BOX, "p-[18px] text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF] lg:p-6 lg:text-[15px]"].join(" ")}>
                            Você não possui requisição pendente, em separação ou em trânsito.
                        </div>
                    )}
                </section>

                <section className="lg:mt-9">
                    <h2 className={LBL_SECAO}>O que você quer fazer?</h2>

                    {perms == null ? (
                        <div className={[BOX, "p-[18px] text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF] lg:p-6"].join(" ")}>
                            Carregando permissões...
                        </div>
                    ) : actions.length ? (
                        <div className="overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F] max-lg:divide-y max-lg:divide-[#E3E8F0] max-lg:dark:divide-white/[0.12] lg:grid lg:grid-cols-2 lg:gap-4 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:dark:bg-transparent">
                            {actions.map(({ title, href, icon: Icon, chip }) => (
                                <Link
                                    key={href}
                                    href={href}
                                    className="flex min-h-[60px] items-center gap-3.5 px-4 text-[#313C55] transition-colors hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/[0.08] lg:min-h-0 lg:rounded-2xl lg:border lg:border-[#E3E8F0] lg:bg-white lg:p-4 lg:hover:border-[#313C55] lg:hover:bg-white lg:dark:border-white/[0.12] lg:dark:bg-[#232B3F] lg:dark:hover:border-white lg:dark:hover:bg-[#232B3F]"
                                >
                                    <span className={["grid size-10 shrink-0 place-items-center rounded-xl text-[#313C55] dark:text-white lg:size-11 lg:rounded-[14px]", chip].join(" ")}>
                                        <Icon size={20} stroke={1.8} />
                                    </span>

                                    <span className="min-w-0 flex-1 text-[15px] font-extrabold">{title}</span>

                                    <IconChevronRight size={20} stroke={1.8} className="shrink-0 text-[#5B6478] dark:text-[#AEB9CF]" />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className={[BOX, "p-[18px] text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF] lg:p-6"].join(" ")}>
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
                onClose={closeCancel}
                onConfirm={confirmCancel}
            />
        </div>
    );
}
