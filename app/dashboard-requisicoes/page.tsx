"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconDownload, IconFilter, IconRefresh, IconSearch, IconX } from "@tabler/icons-react";
import ItensTabela from "@/components/requisicoes/ItensTabela";

type ID = number;

type StatusId =
    | "PENDENTE"
    | "EM_SEPARACAO"
    | "EM_TRANSITO"
    | "ENTREGUE"
    | "CANCELADA"
    | "RECUSADA";

type Me = {
    id: ID;
    nome: string;
    usuario: string;
};

type Usuario = {
    id: ID;
    nome: string;
    usuario: string;
};

type Deposito = {
    id: ID;
    nome: string;
};

type Produto = {
    id: ID;
    nome: string;
    codigo_barras?: string | null;
    categoria_nome?: string | null;
    classificacao_nome?: string | null;
};


type StatusOption = {
    id: StatusId;
    nome: string;
};

type DashboardData = {
    por_status?: Partial<Record<StatusId, number>>;
    atrasadas_24h?: number;
    status_labels?: Partial<Record<StatusId, string>>;
};

type InitResp = {
    ok: boolean;
    me?: Me;
    usuarios?: Usuario[];
    depositos?: Deposito[];
    produtos?: Produto[];
    status?: StatusOption[];
    contadores?: DashboardData;
    alertas?: {
        transito_24h?: ReqListRow[];
    };
    msg?: string;
    need_login?: 1;
};

type ReqListRow = {
    id: ID;
    codigo?: string | null;
    status: StatusId | string;
    status_label?: string | null;
    solicitante_usuario_id?: ID;
    solicitante_nome?: string | null;
    unidade_destino_id?: ID | null;
    unidade_destino_nome?: string | null;
    unidade_destino_texto?: string | null;
    destino_tipo?: "DEPOSITO" | "CONSUMO" | string;
    id_atendimento?: string | null;
    justificativa?: string | null;
    deposito_origem_id?: ID | null;
    deposito_origem_nome?: string | null;
    total_itens?: number | string;
    total_quantidade?: number | string;
    itens_resumo?: string | null;
    atrasada_24h?: 0 | 1 | number | string;
    criado_em: string;
    separado_em?: string | null;
    enviado_em?: string | null;
    recebido_em?: string | null;
    motivo_recusa?: string | null;
    motivo_cancelamento?: string | null;
};

type ReqItem = {
    id: ID;
    requisicao_id: ID;
    produto_id: ID;
    produto_nome_snapshot: string;
    produto_nome_atual?: string | null;
    codigo_barras_snapshot?: string | null;
    quantidade_solicitada: number | string;
    quantidade_enviada?: number | string | null;
    quantidade_recebida?: number | string | null;
    observacao?: string | null;
    categoria_nome?: string | null;
    classificacao_nome?: string | null;
};

type ReqEvento = {
    id: ID;
    requisicao_id: ID;
    usuario_id: ID;
    usuario_nome?: string | null;
    usuario_login?: string | null;
    evento: string;
    status_de?: string | null;
    status_para?: string | null;
    observacao?: string | null;
    criado_em: string;
};

type ReqDetail = ReqListRow & {
    items?: ReqItem[];
    eventos?: ReqEvento[];
    solicitante_usuario?: string | null;
    separado_por_nome?: string | null;
    enviado_por_nome?: string | null;
    recebido_por_nome?: string | null;
    recusado_por_nome?: string | null;
    cancelado_por_nome?: string | null;
};

type ListResp = {
    ok: boolean;
    rows?: ReqListRow[];
    msg?: string;
    need_login?: 1;
};

type SummaryResp = {
    ok: boolean;
    data?: DashboardData;
    msg?: string;
    need_login?: 1;
};

type AlertasResp = {
    ok: boolean;
    transito_24h?: ReqListRow[];
    msg?: string;
    need_login?: 1;
};

type DetailResp = {
    ok: boolean;
    row?: ReqDetail;
    msg?: string;
    need_login?: 1;
};

type Filters = {
    de: string;
    ate: string;
    status: "" | StatusId;
    q: string;
    solicitante_id: string;
    unidade_destino_id: string;
    deposito_origem_id: string;
    produto_id: string;
    id_atendimento: string;
    atrasadas: boolean;
};

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/requisicoes.php`;

const STATUS_OPTIONS: StatusOption[] = [
    { id: "PENDENTE", nome: "Pendente" },
    { id: "EM_SEPARACAO", nome: "Em separação" },
    { id: "EM_TRANSITO", nome: "Em trânsito" },
    { id: "ENTREGUE", nome: "Entregue" },
    { id: "RECUSADA", nome: "Recusada" },
    { id: "CANCELADA", nome: "Cancelada" },
];

const STATUS_LABEL: Record<StatusId, string> = {
    PENDENTE: "Pendente",
    EM_SEPARACAO: "Em separação",
    EM_TRANSITO: "Em trânsito",
    ENTREGUE: "Entregue",
    CANCELADA: "Cancelada",
    RECUSADA: "Recusada",
};

const STATUS_BADGE_CLASS: Record<StatusId, string> = {
    PENDENTE: "border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white",
    EM_SEPARACAO: "border-[#3D6A99] bg-[#3D6A99] text-white",
    EM_TRANSITO: "border-[#313C55] bg-[#313C55] text-white dark:border-[#51607F] dark:bg-[#51607F]",
    ENTREGUE: "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20 dark:text-white",
    CANCELADA: "border-[#C9D1DE] bg-[#EEF2F7] text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]",
    RECUSADA: "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]",
};

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
    return STATUS_LABEL[toStatus(v)] || String(v || "");
}

function statusClass(v: unknown) {
    return STATUS_BADGE_CLASS[toStatus(v)] || STATUS_BADGE_CLASS.PENDENTE;
}

function asNumber(v: unknown) {
    const n = Number(String(v ?? "0").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

function numberBR(v: unknown, decimals = 0) {
    const n = asNumber(v);
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    }).format(n);
}

function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function monthStartIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
}

function initialFilters(): Filters {
    return {
        de: monthStartIso(),
        ate: todayIso(),
        status: "",
        q: "",
        solicitante_id: "",
        unidade_destino_id: "",
        deposito_origem_id: "",
        produto_id: "",
        id_atendimento: "",
        atrasadas: false,
    };
}

function emptyFilters(): Filters {
    return {
        de: "",
        ate: "",
        status: "",
        q: "",
        solicitante_id: "",
        unidade_destino_id: "",
        deposito_origem_id: "",
        produto_id: "",
        id_atendimento: "",
        atrasadas: false,
    };
}

function fmtDateTime(v?: string | null) {
    if (!v) return "";

    try {
        const date = new Date(String(v).replace(" ", "T"));
        if (Number.isNaN(date.getTime())) return String(v);
        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(date);
    } catch {
        return String(v);
    }
}

function shortDate(v?: string | null) {
    if (!v) return "";

    try {
        const date = new Date(String(v).replace(" ", "T"));
        if (Number.isNaN(date.getTime())) return String(v);
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
        }).format(date);
    } catch {
        return String(v);
    }
}

function destinoLabel(row: ReqListRow | ReqDetail) {
    return row.unidade_destino_nome || row.unidade_destino_texto || "Destino não informado";
}

function codigoReq(row: Pick<ReqListRow, "id" | "codigo">) {
    return row.codigo || `REQ-${row.id}`;
}

function hoursSince(v?: string | null) {
    if (!v) return null;
    const t = new Date(String(v).replace(" ", "T")).getTime();
    if (!Number.isFinite(t)) return null;
    const diff = Date.now() - t;
    if (diff < 0) return null;
    return Math.floor(diff / 36e5);
}

function compactEventName(v: string) {
    const s = String(v || "").replace(/_/g, " ").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(
            `Resposta inesperada (${ct || "sem content-type"}). ${txt ? txt.slice(0, 180) : ""}`.trim()
        );
    }
    return (await r.json()) as T;
}

function buildUrl(action: string, filters?: Partial<Filters>, extra?: Record<string, string | number | boolean | undefined>) {
    const u = new URL(API_BASE);
    u.searchParams.set("action", action);

    const f = filters || {};

    if (f.de) u.searchParams.set("de", f.de);
    if (f.ate) u.searchParams.set("ate", f.ate);
    if (f.status) u.searchParams.set("status", f.status);
    if (f.q?.trim()) u.searchParams.set("q", f.q.trim());
    if (f.solicitante_id) u.searchParams.set("solicitante_id", f.solicitante_id);
    if (f.unidade_destino_id) u.searchParams.set("unidade_destino_id", f.unidade_destino_id);
    if (f.deposito_origem_id) u.searchParams.set("deposito_origem_id", f.deposito_origem_id);
    if (f.produto_id) u.searchParams.set("produto_id", f.produto_id);
    if (f.id_atendimento?.trim()) u.searchParams.set("id_atendimento", f.id_atendimento.trim());
    if (f.atrasadas) u.searchParams.set("atrasadas", "1");

    Object.entries(extra || {}).forEach(([k, v]) => {
        if (v === undefined || v === "") return;
        u.searchParams.set(k, String(v));
    });

    return u;
}

async function apiGet<T>(action: string, filters?: Partial<Filters>, extra?: Record<string, string | number | boolean | undefined>) {
    const r = await fetch(buildUrl(action, filters, extra).toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });
    return await safeJson<T>(r);
}

/* ------------------------------------------------------------------ */
/* Apresentação (mockup "Dashboard Requisições", 06/10/2026)           */
/* ------------------------------------------------------------------ */

const FIELD_CLS =
    "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]";

const LABEL_CLS = "mb-2 block text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

const TH_CLS = "text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]", className].join(" ")}>{children}</section>;
}

function Button({
    children,
    variant = "ghost",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }) {
    const base =
        "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-[18px] text-[15px] font-bold outline-none transition focus:ring-2 focus:ring-[#3D6A99]/20 disabled:cursor-not-allowed disabled:opacity-45";

    const cls =
        variant === "solid"
            ? "border-[1.5px] border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]"
            : "border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08]";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block min-w-0">
            <span className={LABEL_CLS}>{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{hint}</span> : null}
        </label>
    );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input {...props} className={[FIELD_CLS, props.className || ""].join(" ")} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props} className={[FIELD_CLS, props.className || ""].join(" ")} />;
}

/** Chip de status (.sp do mockup). */
function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <span className={["inline-flex h-[26px] items-center whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-extrabold", className].join(" ")}>
            {children}
        </span>
    );
}

/** Alerta de atraso (.late): amarelo sempre com texto #313C55. */
function LatePill({ children, small }: { children: React.ReactNode; small?: boolean }) {
    return (
        <span
            className={[
                "inline-flex items-center whitespace-nowrap rounded-full border-[1.5px] border-[#F2CB3F] bg-[#F2CB3F] font-extrabold text-[#313C55]",
                small ? "h-[22px] px-2.5 text-xs" : "h-[26px] px-2.5 text-[12.5px]",
            ].join(" ")}
        >
            {children}
        </span>
    );
}

/** Selo com o número de filtros ativos. */
function CountBadge({ n }: { n: number }) {
    return (
        <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#F2CB3F] px-1.5 text-xs font-extrabold text-[#313C55]">
            {n}
        </span>
    );
}

/**
 * Janelas abertas direto no <body> (06/10/2026). A página rola dentro de um contêiner e, no iPhone,
 * a barra de baixo (z-40) ficava por cima. Só chama createPortal depois de montar no cliente.
 */
function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    return montado ? createPortal(children, document.body) : null;
}

/**
 * Janela reutilizável.
 *
 * Computador (lg): diálogo centralizado com cabeçalho, corpo que rola e rodapé fixo
 * (botões à direita). Celular: folha que sobe de baixo, com os botões lado a lado no rodapé.
 * Esc fecha. O scroll do body fica bloqueado enquanto está aberta.
 */
function Modal({
    open,
    title,
    subtitle,
    onClose,
    children,
    footer,
    maxWidth = "lg:max-w-[760px]",
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: string;
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
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <NoCorpo>
            <div role="dialog" data-pai-overlay aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6">
                <div
                    className={[
                        "flex max-h-[90dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-full lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12]",
                        maxWidth,
                    ].join(" ")}
                >
                    <div className="flex items-start gap-2 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:gap-3 lg:px-6 lg:py-5">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[19px] font-extrabold leading-tight lg:text-xl">{title}</h2>
                            {subtitle ? <p className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:mt-1 lg:text-sm">{subtitle}</p> : null}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="grid size-11 shrink-0 place-items-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/[0.08]"
                            aria-label="Fechar"
                        >
                            <IconX size={20} stroke={1.8} aria-hidden="true" />
                        </button>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-5 py-3.5 lg:gap-4 lg:px-6 lg:py-5">{children}</div>

                    {footer ? (
                        <div className="flex gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end lg:gap-3 lg:px-6 lg:py-4 [&>*]:flex-1 lg:[&>*]:flex-none">
                            {footer}
                        </div>
                    ) : null}
                </div>
            </div>
        </NoCorpo>
    );
}

function StatCard({
    label,
    value,
    hint,
    active,
    danger,
    onClick,
}: {
    label: string;
    value: number;
    hint?: string;
    active?: boolean;
    danger?: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={!!active}
            className={[
                "block rounded-2xl px-3.5 pb-3 pt-3 text-left text-[#313C55] dark:text-white lg:pt-3.5",
                active ? "border-2 border-[#313C55] dark:border-white" : danger ? "border border-[#F2CB3F]" : "border border-[#E3E8F0] dark:border-white/[0.12]",
                danger ? "bg-[#FCF3CC] dark:bg-[#F2CB3F]/[0.16]" : "bg-white dark:bg-[#232B3F]",
            ].join(" ")}
        >
            <span className="block text-[12.5px] font-extrabold">{label}</span>
            <span className="mt-0.5 block text-[26px] font-extrabold leading-[1.15] lg:text-[30px]">{numberBR(value)}</span>
            <span className="mt-0.5 block min-h-[15px] text-xs text-[#5B6478] dark:text-[#AEB9CF]">{hint || ""}</span>
        </button>
    );
}

function FilterChip({ children, onClear }: { children: React.ReactNode; onClear?: () => void }) {
    return (
        <span
            className={[
                "inline-flex h-8 items-center gap-1 rounded-full bg-[#EEF2F7] text-[13px] font-bold text-[#313C55] dark:bg-white/[0.08] dark:text-white",
                onClear ? "pl-3.5 pr-1" : "px-3.5",
            ].join(" ")}
        >
            {children}
            {onClear ? (
                <button
                    type="button"
                    onClick={onClear}
                    aria-label="Remover filtro"
                    className="relative grid size-7 place-items-center rounded-full hover:bg-black/5 after:absolute after:-inset-2 after:content-[''] dark:hover:bg-white/10"
                >
                    <IconX size={16} stroke={2} aria-hidden="true" />
                </button>
            ) : null}
        </span>
    );
}

function ProductSelect({ produtos, value, onChange }: { produtos: Produto[]; value: string; onChange: (v: string) => void }) {
    const [q, setQ] = useState("");

    const filtered = useMemo(() => {
        const qq = q.trim().toLowerCase();
        if (!qq) return produtos.slice(0, 120);

        return produtos
            .filter((p) => {
                const hay = `${p.nome} ${p.codigo_barras || ""} ${p.categoria_nome || ""} ${p.classificacao_nome || ""}`.toLowerCase();
                return hay.includes(qq);
            })
            .slice(0, 120);
    }, [produtos, q]);

    return (
        <div className="space-y-2">
            <div className="relative">
                <IconSearch size={20} stroke={1.8} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5B6478] dark:text-[#AEB9CF]" />
                <TextInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto por nome ou código" aria-label="Buscar produto" className="pl-11" />
            </div>
            <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Produto">
                <option value="">Todos os produtos</option>
                {filtered.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.nome}
                        {p.codigo_barras ? ` | ${p.codigo_barras}` : ""}
                    </option>
                ))}
            </Select>
        </div>
    );
}

/** Linha secundária pequena com as informações extras da requisição (origem, atendimento). */
function extrasReq(row: ReqListRow) {
    const parts: string[] = [];
    if (row.deposito_origem_nome) parts.push(`Origem ${row.deposito_origem_nome}`);
    if (row.id_atendimento) parts.push(`Atendimento ${row.id_atendimento}`);
    return parts.join(" · ");
}

const DESK_COLS = "grid-cols-[2.6fr_1.6fr_1.1fr_1.3fr_.8fr_.6fr]";

/** Linha da tabela (computador). */
function RequisitionRow({ row, onOpen }: { row: ReqListRow; onOpen: (id: ID) => void }) {
    const late = Number(row.atrasada_24h || 0) === 1;
    const transitHours = late ? hoursSince(row.enviado_em) : null;
    const extras = extrasReq(row);

    return (
        <div className={["grid items-center gap-3 border-t border-[#E3E8F0] px-6 py-3 text-sm dark:border-white/[0.12]", DESK_COLS].join(" ")}>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <b className="font-extrabold">{codigoReq(row)}</b>
                    <Badge className={["h-[22px] text-xs", statusClass(row.status)].join(" ")}>{statusLabel(row.status)}</Badge>
                    {late ? <LatePill small>+24h</LatePill> : null}
                </div>
                <ItensTabela resumo={row.itens_resumo} vazio="Itens não carregados" className="mt-1.5" />
                {extras ? <div className="mt-1 truncate text-xs text-[#5B6478] dark:text-[#AEB9CF]">{extras}</div> : null}
            </div>
            <div className="min-w-0 break-words">{row.solicitante_nome || "Não informado"}</div>
            <div className="min-w-0 break-words">{destinoLabel(row)}</div>
            <div className="min-w-0 text-[#5B6478] dark:text-[#AEB9CF]">
                {fmtDateTime(row.criado_em)}
                {late && transitHours !== null ? <div className="mt-1 text-xs font-bold text-[#313C55] dark:text-white">{transitHours}h em trânsito</div> : null}
            </div>
            <div className="text-right font-extrabold">{numberBR(row.total_quantidade, 3)}</div>
            <div className="text-right">
                <Button type="button" onClick={() => onOpen(row.id)} className="!h-11 !px-3">
                    Ver
                </Button>
            </div>
        </div>
    );
}

/** Cartão inteiro tocável (celular). */
function RequisitionCard({ row, onOpen }: { row: ReqListRow; onOpen: (id: ID) => void }) {
    const late = Number(row.atrasada_24h || 0) === 1;
    const transitHours = late ? hoursSince(row.enviado_em) : null;
    const extras = extrasReq(row);

    return (
        <button
            type="button"
            onClick={() => onOpen(row.id)}
            aria-label={`Ver detalhes de ${codigoReq(row)}`}
            className="block w-full rounded-2xl border border-[#E3E8F0] bg-white px-3.5 py-3 text-left text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08]"
        >
            <span className="flex flex-wrap items-center gap-1.5">
                <b className="text-sm font-extrabold">{codigoReq(row)}</b>
                <Badge className={["h-[22px] text-xs", statusClass(row.status)].join(" ")}>{statusLabel(row.status)}</Badge>
                {late ? <LatePill small>+24h</LatePill> : null}
            </span>
            <ItensTabela resumo={row.itens_resumo} vazio="Itens não carregados" className="mt-1.5" />
            <span className="mt-0.5 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                {row.solicitante_nome || "Não informado"} · {destinoLabel(row)}
            </span>
            <span className="block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                {fmtDateTime(row.criado_em)} · Qtd {numberBR(row.total_quantidade, 3)}
                {late && transitHours !== null ? ` · ${transitHours}h em trânsito` : ""}
            </span>
            {extras ? <span className="block truncate text-xs text-[#5B6478] dark:text-[#AEB9CF]">{extras}</span> : null}
        </button>
    );
}

function DetailInfo({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">{label}</div>
            <div className="break-words font-extrabold">{children}</div>
        </div>
    );
}

const SEC_TITLE = "mb-2 text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

function DetailModal({ detail, loading, onClose }: { detail: ReqDetail | null; loading: boolean; onClose: () => void }) {
    return (
        <Modal
            open={!!detail || loading}
            title={detail ? codigoReq(detail) : "Carregando requisição"}
            subtitle={detail ? `${detail.solicitante_nome || "Solicitante não informado"} para ${destinoLabel(detail)}` : undefined}
            onClose={onClose}
            maxWidth="lg:max-w-[680px]"
            footer={
                <Button type="button" onClick={onClose}>
                    Fechar
                </Button>
            }
        >
            {loading ? (
                <div className="rounded-xl border border-[#E3E8F0] bg-[#F6F8FB] p-4 text-sm dark:border-white/[0.12] dark:bg-[#1C2334]">Carregando detalhes...</div>
            ) : detail ? (
                <>
                    <div className="flex flex-wrap gap-2">
                        <Badge className={statusClass(detail.status)}>{statusLabel(detail.status)}</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[14px] border border-[#E3E8F0] bg-[#F6F8FB] px-4 py-3.5 dark:border-white/[0.12] dark:bg-[#1C2334]">
                        <DetailInfo label="Solicitante">{detail.solicitante_nome || "-"}</DetailInfo>
                        <DetailInfo label="Origem">{detail.deposito_origem_nome || "-"}</DetailInfo>
                        <DetailInfo label="Criada em">{fmtDateTime(detail.criado_em) || "-"}</DetailInfo>
                        <DetailInfo label="Enviada em">{fmtDateTime(detail.enviado_em) || "-"}</DetailInfo>
                        <DetailInfo label="Atendimento">{detail.id_atendimento || "Sem vínculo"}</DetailInfo>
                    </div>

                    <div>
                        <h3 className={SEC_TITLE}>Justificativa</h3>
                        <p className="whitespace-pre-wrap rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 text-sm leading-6 dark:border-white/[0.12]">{detail.justificativa || "Não informada."}</p>
                    </div>

                    <div>
                        <h3 className={SEC_TITLE}>Itens</h3>
                        <div className="flex flex-col gap-2">
                            {(detail.items || []).map((item) => {
                                const extras: string[] = [];
                                if (item.quantidade_enviada != null) extras.push(`Enviada ${numberBR(item.quantidade_enviada, 3)}`);
                                if (item.quantidade_recebida != null) extras.push(`Recebida ${numberBR(item.quantidade_recebida, 3)}`);

                                return (
                                    <div key={item.id} className="rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 dark:border-white/[0.12]">
                                        <div className="flex items-center gap-3">
                                            <span className="min-w-0 flex-1 break-words text-sm font-bold">{item.produto_nome_snapshot}</span>
                                            <span className="whitespace-nowrap text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                Qtd <b className="text-[15px] text-[#313C55] dark:text-white">{numberBR(item.quantidade_solicitada, 3)}</b>
                                            </span>
                                        </div>
                                        {extras.length ? <div className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">{extras.join(" · ")}</div> : null}
                                        {item.observacao ? <div className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">Obs.: {item.observacao}</div> : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <h3 className={SEC_TITLE}>Linha do tempo</h3>
                        <div className="flex flex-col gap-2">
                            {(detail.eventos || []).length === 0 ? (
                                <div className="rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 text-sm text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]">Nenhum evento registrado.</div>
                            ) : (
                                (detail.eventos || []).map((ev) => (
                                    <div key={ev.id} className="flex gap-3 rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 dark:border-white/[0.12]">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-extrabold">{compactEventName(ev.evento)}</div>
                                            <div className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                {ev.usuario_nome || ev.usuario_login || `Usuário #${ev.usuario_id}`}
                                                {ev.status_de || ev.status_para ? ` | ${ev.status_de || ""} para ${ev.status_para || ""}` : ""}
                                            </div>
                                            {ev.observacao ? <div className="mt-1 text-[13px]">{ev.observacao}</div> : null}
                                        </div>
                                        <div className="whitespace-nowrap text-right text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{fmtDateTime(ev.criado_em)}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            ) : null}
        </Modal>
    );
}

export default function DashboardRequisicoesPage() {
    const [, setMe] = useState<Me | null>(null);
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [filters, setFilters] = useState<Filters>(() => initialFilters());
    const [appliedFilters, setAppliedFilters] = useState<Filters>(() => initialFilters());
    const [rows, setRows] = useState<ReqListRow[]>([]);
    const [summary, setSummary] = useState<DashboardData>({});
    const [alertasTransito, setAlertasTransito] = useState<ReqListRow[]>([]);
    const [limit, setLimit] = useState(100);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState("");
    const [filterOpen, setFilterOpen] = useState(false);
    const [detail, setDetail] = useState<ReqDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [exporting, setExporting] = useState(false);

    const statusOptions = STATUS_OPTIONS;

    const totalFiltrado = useMemo(() => {
        const m = summary.por_status || {};
        return STATUS_OPTIONS.reduce((acc, s) => acc + Number(m[s.id] || 0), 0);
    }, [summary]);

    const chartRows = useMemo(() => {
        const m = summary.por_status || {};
        const max = Math.max(1, ...STATUS_OPTIONS.map((s) => Number(m[s.id] || 0)));
        return STATUS_OPTIONS.map((s) => ({
            ...s,
            total: Number(m[s.id] || 0),
            percent: Math.max(3, Math.round((Number(m[s.id] || 0) / max) * 100)),
        }));
    }, [summary]);

    const activeFilterChips = useMemo(() => {
        const chips: Array<{ key: keyof Filters | "periodo"; label: string }> = [];

        if (appliedFilters.de || appliedFilters.ate) {
            chips.push({ key: "periodo", label: `${appliedFilters.de || "início"} até ${appliedFilters.ate || "hoje"}` });
        }
        if (appliedFilters.status) chips.push({ key: "status", label: `Status: ${statusLabel(appliedFilters.status)}` });
        if (appliedFilters.q) chips.push({ key: "q", label: `Busca: ${appliedFilters.q}` });
        if (appliedFilters.id_atendimento) chips.push({ key: "id_atendimento", label: `Atendimento: ${appliedFilters.id_atendimento}` });
        if (appliedFilters.atrasadas) chips.push({ key: "atrasadas", label: "Atrasadas" });

        const usuario = usuarios.find((u) => String(u.id) === appliedFilters.solicitante_id);
        if (usuario) chips.push({ key: "solicitante_id", label: `Solicitante: ${usuario.nome}` });

        const destino = depositos.find((d) => String(d.id) === appliedFilters.unidade_destino_id);
        if (destino) chips.push({ key: "unidade_destino_id", label: `Destino: ${destino.nome}` });

        const origem = depositos.find((d) => String(d.id) === appliedFilters.deposito_origem_id);
        if (origem) chips.push({ key: "deposito_origem_id", label: `Origem: ${origem.nome}` });

        const produto = produtos.find((p) => String(p.id) === appliedFilters.produto_id);
        if (produto) chips.push({ key: "produto_id", label: `Produto: ${produto.nome}` });

        return chips;
    }, [appliedFilters, depositos, produtos, usuarios]);

    const loadMeta = useCallback(async () => {
        const init = await apiGet<InitResp>("init", {}, { limit: 30 });
        if (!init.ok) throw new Error(init.msg || "Não foi possível carregar a inicialização.");

        setMe(init.me || null);
        setUsuarios(init.usuarios || []);
        setDepositos(init.depositos || []);
        setProdutos(init.produtos || []);
    }, []);

    const loadDashboard = useCallback(
        async (f: Filters, nextOffset = offset, nextLimit = limit) => {
            setLoading(true);
            setMsg("");

            try {
                const [summaryResp, listResp, alertasResp] = await Promise.all([
                    apiGet<SummaryResp>("dashboard_resumo", f),
                    apiGet<ListResp>("dashboard_listar", f, { limit: nextLimit, offset: nextOffset }),
                    apiGet<AlertasResp>("dashboard_alertas", f, { limit: 100 }),
                ]);

                if (!summaryResp.ok) throw new Error(summaryResp.msg || "Erro ao carregar resumo.");
                if (!listResp.ok) throw new Error(listResp.msg || "Erro ao carregar lista.");
                if (!alertasResp.ok) throw new Error(alertasResp.msg || "Erro ao carregar alertas.");

                setSummary(summaryResp.data || {});
                setRows(listResp.rows || []);
                setAlertasTransito(alertasResp.transito_24h || []);
            } catch (e: any) {
                setMsg(e?.message || "Erro ao carregar dashboard.");
            } finally {
                setLoading(false);
            }
        },
        [limit, offset]
    );

    useEffect(() => {
        let cancelled = false;

        async function run() {
            setLoading(true);
            setMsg("");
            try {
                await loadMeta();
                if (!cancelled) await loadDashboard(appliedFilters, 0, limit);
            } catch (e: any) {
                if (!cancelled) setMsg(e?.message || "Erro ao carregar dashboard.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        run();

        return () => {
            cancelled = true;
        };
    }, []);

    async function applyFilters(next?: Filters) {
        const f = next || filters;
        setAppliedFilters(f);
        setOffset(0);
        setFilterOpen(false);
        await loadDashboard(f, 0, limit);
    }

    async function goPage(direction: "prev" | "next") {
        const nextOffset = direction === "prev" ? Math.max(0, offset - limit) : offset + limit;
        setOffset(nextOffset);
        await loadDashboard(appliedFilters, nextOffset, limit);
    }

    async function openDetail(id: ID) {
        setDetailLoading(true);
        setDetail(null);

        try {
            const resp = await apiGet<DetailResp>("detalhar", {}, { id });
            if (!resp.ok || !resp.row) throw new Error(resp.msg || "Requisição não encontrada.");
            setDetail(resp.row);
        } catch (e: any) {
            setMsg(e?.message || "Erro ao abrir detalhes.");
        } finally {
            setDetailLoading(false);
        }
    }

    async function exportCsv() {
        setExporting(true);
        setMsg("");

        try {
            const url = buildUrl("dashboard_export_csv", appliedFilters, { limit: 500, offset: 0 });
            const r = await fetch(url.toString(), {
                method: "GET",
                cache: "no-store",
                credentials: "include",
            });

            if (!r.ok) {
                const txt = await r.text().catch(() => "");
                throw new Error(txt || "Não foi possível exportar o CSV.");
            }

            const blob = await r.blob();
            const objectUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = `requisicoes_materiais_${todayIso()}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(objectUrl);
        } catch (e: any) {
            setMsg(e?.message || "Erro ao exportar CSV.");
        } finally {
            setExporting(false);
        }
    }

    function removeFilter(key: keyof Filters | "periodo") {
        const next = { ...appliedFilters };

        if (key === "periodo") {
            next.de = "";
            next.ate = "";
        } else if (key === "atrasadas") {
            next.atrasadas = false;
        } else {
            next[key] = "" as never;
        }

        setFilters(next);
        void applyFilters(next);
    }

    const nFiltros = activeFilterChips.length;
    const nAtrasadas = Number(summary.atrasadas_24h || 0);

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] px-4 pb-6 pt-3.5 text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:px-10 lg:pb-12 lg:pt-8">
            <div className="mx-auto flex max-w-[1120px] flex-col gap-3.5 lg:gap-0">
                <div className="flex flex-col gap-3 lg:mb-5 lg:flex-row lg:items-center">
                    <h1 className="text-[28px] font-extrabold leading-tight lg:flex-1">Dashboard Requisições</h1>

                    <div className="flex gap-2 lg:gap-3">
                        <Button type="button" onClick={() => setFilterOpen(true)} aria-haspopup="dialog" className="flex-1 !px-2 sm:!px-[18px] lg:flex-none">
                            <IconFilter size={20} stroke={1.8} aria-hidden="true" className="max-sm:hidden" />
                            Filtrar
                            {nFiltros > 0 ? <CountBadge n={nFiltros} /> : null}
                        </Button>
                        <Button type="button" onClick={() => void loadDashboard(appliedFilters, offset, limit)} disabled={loading} className="flex-1 !px-2 sm:!px-[18px] lg:flex-none">
                            <IconRefresh size={20} stroke={1.8} aria-hidden="true" className="max-sm:hidden" />
                            Atualizar
                        </Button>
                        <Button type="button" onClick={() => void exportCsv()} disabled={exporting} className="flex-1 !px-2 sm:!px-[18px] lg:flex-none">
                            <IconDownload size={20} stroke={1.8} aria-hidden="true" className="max-sm:hidden" />
                            {exporting ? "Exportando..." : "CSV"}
                        </Button>
                    </div>
                </div>

                {msg ? (
                    <div className="rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm font-semibold text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92] lg:mb-4">
                        {msg}
                    </div>
                ) : null}

                <div className="flex flex-wrap gap-1.5 lg:mb-4 lg:gap-2">
                    {activeFilterChips.length === 0 ? (
                        <FilterChip>Nenhum filtro aplicado</FilterChip>
                    ) : (
                        activeFilterChips.map((chip) => (
                            <FilterChip key={`${chip.key}-${chip.label}`} onClear={() => removeFilter(chip.key)}>
                                {chip.label}
                            </FilterChip>
                        ))
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 max-lg:landscape:grid-cols-4 lg:gap-3 xl:grid-cols-7">
                    <StatCard
                        label="Total"
                        value={totalFiltrado}
                        hint="No filtro atual"
                        active={!appliedFilters.status && !appliedFilters.atrasadas}
                        onClick={() => void applyFilters({ ...appliedFilters, status: "", atrasadas: false })}
                    />
                    {STATUS_OPTIONS.map((s) => {
                        const danger = s.id === "EM_TRANSITO" && nAtrasadas > 0;
                        return (
                            <StatCard
                                key={s.id}
                                label={s.nome}
                                value={Number(summary.por_status?.[s.id] || 0)}
                                hint={danger ? `${numberBR(nAtrasadas)} acima de 24h` : undefined}
                                active={appliedFilters.status === s.id && !appliedFilters.atrasadas}
                                danger={danger}
                                onClick={() => void applyFilters({ ...appliedFilters, status: s.id, atrasadas: false })}
                            />
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 gap-3.5 lg:mt-5 lg:grid-cols-[1.35fr_.85fr] lg:gap-5">
                    <Card className="p-3.5 lg:px-6 lg:py-5">
                        <div className="flex items-baseline">
                            <h2 className="flex-1 text-base font-extrabold lg:text-lg">Distribuição por status</h2>
                            <span className="text-[12.5px] font-bold text-[#5B6478] dark:text-[#AEB9CF] lg:text-[13px]">Total: {numberBR(totalFiltrado)}</span>
                        </div>

                        <div className="mt-2 flex flex-col gap-0.5 lg:mt-3.5 lg:gap-1.5">
                            {chartRows.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => void applyFilters({ ...appliedFilters, status: r.id, atrasadas: false })}
                                    aria-label={`Filtrar por ${r.nome}`}
                                    className="grid min-h-10 w-full grid-cols-[96px_1fr_28px] items-center gap-2.5 text-left text-[13.5px] lg:min-h-0 lg:grid-cols-[120px_1fr_36px] lg:gap-3 lg:py-1.5 lg:text-sm"
                                >
                                    <span className="truncate font-bold">{r.nome}</span>
                                    <span className="block h-2.5 overflow-hidden rounded-full bg-[#EEF2F7] dark:bg-white/[0.08] lg:h-3">
                                        <span className="block h-full rounded-full bg-[#313C55] dark:bg-[#51607F]" style={{ width: `${r.total === 0 ? 0 : r.percent}%` }} />
                                    </span>
                                    <span className="text-right font-extrabold">{numberBR(r.total)}</span>
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card className="p-3.5 lg:px-6 lg:py-5">
                        <div className="flex items-center gap-2">
                            <h2 className="flex-1 text-base font-extrabold lg:text-lg">Alertas</h2>
                            <LatePill>{numberBR(nAtrasadas)} atrasadas</LatePill>
                        </div>

                        <button
                            type="button"
                            onClick={() => void applyFilters({ ...appliedFilters, status: "EM_TRANSITO", atrasadas: true })}
                            className="mt-2.5 block w-full rounded-[14px] border border-[#F2CB3F] bg-[#FCF3CC] px-3.5 py-3 text-left dark:bg-[#F2CB3F]/[0.16] lg:mt-3.5 lg:px-4 lg:py-3.5"
                        >
                            <span className="block text-sm font-extrabold">Em trânsito acima de 24h</span>
                            <span className="block text-[28px] font-extrabold leading-tight lg:text-[30px]">{numberBR(summary.atrasadas_24h || alertasTransito.length || 0)}</span>
                            <span className="block text-[12.5px]">
                                <span className="lg:hidden">Toque</span>
                                <span className="hidden lg:inline">Clique</span> para filtrar somente as atrasadas.
                            </span>
                        </button>
                    </Card>
                </div>

                {alertasTransito.length > 0 ? (
                    <Card className="p-3.5 lg:mt-5 lg:px-6 lg:py-5">
                        <h2 className="mb-2.5 text-base font-extrabold lg:mb-3.5 lg:text-lg">Trânsito acima de 24h</h2>

                        <div className="flex flex-col gap-2">
                            {alertasTransito.slice(0, 6).map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => void openDetail(r.id)}
                                    className="block w-full rounded-xl border border-[#E3E8F0] bg-white px-3 py-2.5 text-left hover:bg-[#EEF2F7] dark:border-white/[0.12] dark:bg-[#232B3F] dark:hover:bg-white/[0.08] lg:rounded-[14px] lg:px-4 lg:py-3"
                                >
                                    <span className="flex items-center gap-2 lg:gap-3">
                                        <span className="flex-1 text-sm font-extrabold lg:text-base">{codigoReq(r)}</span>
                                        <LatePill>{hoursSince(r.enviado_em) || "+24"}h</LatePill>
                                    </span>

                                    <ItensTabela resumo={r.itens_resumo} className="mt-1.5" />

                                    <span className="mt-0.5 block text-xs text-[#5B6478] dark:text-[#AEB9CF] lg:text-[12.5px]">
                                        {destinoLabel(r)} | Enviado em {fmtDateTime(r.enviado_em)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </Card>
                ) : null}

                {/* Requisições filtradas: celular = cartões; computador = tabela */}
                <section className="lg:mt-5 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-[#E3E8F0] lg:bg-white lg:dark:border-white/[0.12] lg:dark:bg-[#232B3F]">
                    <div className="mb-2.5 mt-1.5 flex items-center gap-3 lg:m-0 lg:border-b lg:border-[#E3E8F0] lg:px-6 lg:py-[18px] lg:dark:border-white/[0.12]">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-base font-extrabold lg:text-lg">Requisições filtradas</h2>
                            <p className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:text-[13.5px]">
                                {loading ? "Carregando..." : `${numberBR(rows.length)} registros nesta página`}
                                {offset > 0 ? ` | A partir do registro ${offset + 1}` : ""}
                            </p>
                        </div>
                        <Select value={limit} onChange={(e) => setLimit(Number(e.target.value) || 100)} aria-label="Registros por página" className="!w-24 shrink-0 pr-9">
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={200}>200</option>
                            <option value={500}>500</option>
                        </Select>
                    </div>

                    {loading ? (
                        <div className="rounded-2xl border border-[#E3E8F0] bg-white p-5 text-center text-sm text-[#5B6478] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#AEB9CF] lg:rounded-none lg:border-0 lg:p-8">
                            Carregando dashboard...
                        </div>
                    ) : (
                        <>
                            {/* Celular (em pé: 1 coluna; deitado: 2 colunas) */}
                            <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2 max-lg:landscape:grid-cols-2 lg:hidden">
                                {rows.map((row) => (
                                    <RequisitionCard key={row.id} row={row} onOpen={openDetail} />
                                ))}
                                {rows.length === 0 ? (
                                    <div className="rounded-2xl border border-[#E3E8F0] bg-white p-5 text-center text-sm text-[#5B6478] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#AEB9CF] md:col-span-2 max-lg:landscape:col-span-2">
                                        Nenhuma requisição encontrada com os filtros atuais.
                                    </div>
                                ) : null}
                            </div>

                            {/* Computador: tabela com cabeçalho */}
                            <div className="hidden overflow-x-auto lg:block">
                                <div className="min-w-[900px]">
                                    <div className={["grid gap-3 bg-[#F6F8FB] px-6 py-3 dark:bg-[#1C2334]", DESK_COLS].join(" ")}>
                                        <div className={TH_CLS}>Itens</div>
                                        <div className={TH_CLS}>Solicitante</div>
                                        <div className={TH_CLS}>Destino</div>
                                        <div className={TH_CLS}>Abertura</div>
                                        <div className={[TH_CLS, "text-right"].join(" ")}>Quantidade</div>
                                        <div className={[TH_CLS, "text-right"].join(" ")}>Detalhes</div>
                                    </div>
                                    {rows.map((row) => (
                                        <RequisitionRow key={row.id} row={row} onOpen={openDetail} />
                                    ))}
                                    {rows.length === 0 ? (
                                        <div className="border-t border-[#E3E8F0] p-8 text-center text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]">
                                            Nenhuma requisição encontrada com os filtros atuais.
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </>
                    )}

                    <div className="mt-3 flex gap-2 lg:mt-0 lg:justify-end lg:border-t lg:border-[#E3E8F0] lg:px-6 lg:py-3.5 lg:dark:border-white/[0.12]">
                        <Button type="button" onClick={() => void goPage("prev")} disabled={offset <= 0 || loading} className="flex-1 lg:flex-none">
                            Anterior
                        </Button>
                        <Button type="button" onClick={() => void goPage("next")} disabled={rows.length < limit || loading} className="flex-1 lg:flex-none">
                            Próxima
                        </Button>
                    </div>
                </section>
            </div>

            <Modal
                open={filterOpen}
                title="Filtros"
                onClose={() => setFilterOpen(false)}
                footer={
                    <>
                        <Button
                            type="button"
                            onClick={() => {
                                const next = emptyFilters();
                                setFilters(next);
                            }}
                            className="!px-2 lg:mr-auto lg:!px-[18px]"
                        >
                            <span className="lg:hidden">Limpar</span>
                            <span className="hidden lg:inline">Limpar campos</span>
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                const next = initialFilters();
                                setFilters(next);
                            }}
                            className="!px-2 lg:!px-[18px]"
                        >
                            Mês atual
                        </Button>
                        <Button type="button" variant="solid" onClick={() => void applyFilters()} className="!flex-[1.5] !px-2 lg:!flex-none lg:!px-[18px]">
                            Aplicar filtros
                        </Button>
                    </>
                }
            >
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Data inicial">
                        <TextInput type="date" value={filters.de} onChange={(e) => setFilters((f) => ({ ...f, de: e.target.value }))} />
                    </Field>

                    <Field label="Data final">
                        <TextInput type="date" value={filters.ate} onChange={(e) => setFilters((f) => ({ ...f, ate: e.target.value }))} />
                    </Field>

                    <Field label="Status">
                        <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters["status"] }))}>
                            <option value="">Todos</option>
                            {statusOptions.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Atrasadas">
                        <Select
                            value={filters.atrasadas ? "1" : ""}
                            onChange={(e) => {
                                const on = e.target.value === "1";
                                if (on === filters.atrasadas) return;
                                setFilters((f) => ({ ...f, atrasadas: !f.atrasadas, status: !f.atrasadas ? "EM_TRANSITO" : f.status }));
                            }}
                        >
                            <option value="">Todas</option>
                            <option value="1">Somente atrasadas</option>
                        </Select>
                    </Field>
                </div>

                <Field label="Busca geral" hint="Código, produto, solicitante, destino ou justificativa.">
                    <TextInput value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Buscar..." />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                    <Field label="Solicitante">
                        <Select value={filters.solicitante_id} onChange={(e) => setFilters((f) => ({ ...f, solicitante_id: e.target.value }))}>
                            <option value="">Todos</option>
                            {usuarios.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.nome || u.usuario}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Unidade de destino">
                        <Select value={filters.unidade_destino_id} onChange={(e) => setFilters((f) => ({ ...f, unidade_destino_id: e.target.value }))}>
                            <option value="">Todas</option>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Depósito de origem">
                        <Select value={filters.deposito_origem_id} onChange={(e) => setFilters((f) => ({ ...f, deposito_origem_id: e.target.value }))}>
                            <option value="">Todos</option>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="ID de atendimento">
                        <TextInput value={filters.id_atendimento} onChange={(e) => setFilters((f) => ({ ...f, id_atendimento: e.target.value }))} placeholder="Ex.: 8831" />
                    </Field>
                </div>

                <div>
                    <span className={LABEL_CLS}>Produto</span>
                    <ProductSelect produtos={produtos} value={filters.produto_id} onChange={(v) => setFilters((f) => ({ ...f, produto_id: v }))} />
                </div>
            </Modal>

            <DetailModal
                detail={detail}
                loading={detailLoading}
                onClose={() => {
                    setDetail(null);
                    setDetailLoading(false);
                }}
            />
        </main>
    );
}
