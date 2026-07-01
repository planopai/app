"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

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

type SaldoMinimoAlerta = {
    produto_id: ID;
    deposito_id: ID;
    quantidade: number | string;
    minimo: number | string;
    maximo?: number | string | null;
    produto_nome: string;
    codigo_barras?: string | null;
    deposito_nome: string;
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
        estoque_minimo?: SaldoMinimoAlerta[];
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
    estoque_minimo?: SaldoMinimoAlerta[];
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
    PENDENTE: "border-amber-200 bg-amber-50 text-amber-800",
    EM_SEPARACAO: "border-sky-200 bg-sky-50 text-sky-800",
    EM_TRANSITO: "border-violet-200 bg-violet-50 text-violet-800",
    ENTREGUE: "border-emerald-200 bg-emerald-50 text-emerald-800",
    CANCELADA: "border-slate-200 bg-slate-100 text-slate-700",
    RECUSADA: "border-rose-200 bg-rose-50 text-rose-800",
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

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>{children}</section>;
}

function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" | "danger" }) {
    const base =
        "inline-flex items-center justify-center rounded-xl px-3 py-2 text-[15px] font-medium shadow-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50";

    const cls =
        variant === "solid"
            ? "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
            : variant === "soft"
                ? "border border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200"
                : variant === "danger"
                    ? "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
        </label>
    );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className || "",
            ].join(" ")}
        />
    );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className || "",
            ].join(" ")}
        />
    );
}

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold", className].join(" ")}>{children}</span>;
}

function Modal({
    open,
    title,
    subtitle,
    onClose,
    children,
    footer,
    maxWidth = "max-w-5xl",
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
        <div className="fixed inset-0 z-50 flex min-h-[100dvh] items-start justify-center bg-slate-950/55 p-3 pt-6 sm:items-center sm:p-4">
            <div className={["flex max-h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl", maxWidth].join(" ")}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
                    <div className="min-w-0">
                        <h2 className="text-base font-bold tracking-tight text-slate-950">{title}</h2>
                        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
                    </div>
                    <button
                        className="rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
                        onClick={onClose}
                        type="button"
                        aria-label="Fechar"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>

                {footer ? <div className="border-t border-slate-100 bg-slate-50 p-4 sm:p-5">{footer}</div> : null}
            </div>
        </div>
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
            className={[
                "rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md",
                active ? "border-slate-900 ring-2 ring-slate-200" : danger ? "border-rose-200" : "border-slate-200",
            ].join(" ")}
        >
            <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
                {danger ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">ALERTA</span> : null}
            </div>
            <div className={["mt-3 text-2xl font-bold tracking-tight", danger ? "text-rose-700" : "text-slate-950"].join(" ")}>{numberBR(value)}</div>
            {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
        </button>
    );
}

function FilterChip({ children, onClear }: { children: React.ReactNode; onClear?: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
            {children}
            {onClear ? (
                <button type="button" onClick={onClear} className="ml-1 rounded-full px-1 text-slate-500 hover:bg-slate-100" aria-label="Remover filtro">
                    ×
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
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto por nome ou código" />
            <Select value={value} onChange={(e) => onChange(e.target.value)}>
                <option value="">Todos os produtos</option>
                {filtered.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.nome}{p.codigo_barras ? ` | ${p.codigo_barras}` : ""}
                    </option>
                ))}
            </Select>
        </div>
    );
}

function RequisitionCard({ row, onOpen }: { row: ReqListRow; onOpen: (id: ID) => void }) {
    const late = Number(row.atrasada_24h || 0) === 1;
    const transitHours = late ? hoursSince(row.enviado_em) : null;

    return (
        <Card className="overflow-hidden">
            <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold tracking-tight text-slate-950">{codigoReq(row)}</h3>
                            <Badge className={statusClass(row.status)}>{statusLabel(row.status)}</Badge>
                            {late ? <Badge className="border-rose-200 bg-rose-50 text-rose-800">+24h em trânsito</Badge> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-800">{row.itens_resumo || "Itens não carregados"}</p>
                    </div>
                    <Button variant="ghost" type="button" onClick={() => onOpen(row.id)} className="shrink-0 px-3 py-2 text-sm">
                        Detalhes
                    </Button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="font-bold uppercase tracking-wide text-slate-500">Solicitante</div>
                        <div className="mt-1 truncate font-semibold text-slate-900">{row.solicitante_nome || "Não informado"}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="font-bold uppercase tracking-wide text-slate-500">Destino</div>
                        <div className="mt-1 truncate font-semibold text-slate-900">{destinoLabel(row)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="font-bold uppercase tracking-wide text-slate-500">Abertura</div>
                        <div className="mt-1 font-semibold text-slate-900">{fmtDateTime(row.criado_em)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="font-bold uppercase tracking-wide text-slate-500">Quantidade</div>
                        <div className="mt-1 font-semibold text-slate-900">{numberBR(row.total_quantidade, 3)}</div>
                    </div>
                </div>

                {row.id_atendimento || row.deposito_origem_nome || late ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {row.id_atendimento ? <FilterChip>Atendimento {row.id_atendimento}</FilterChip> : null}
                        {row.deposito_origem_nome ? <FilterChip>Origem {row.deposito_origem_nome}</FilterChip> : null}
                        {late && transitHours !== null ? <FilterChip>{transitHours}h desde envio</FilterChip> : null}
                    </div>
                ) : null}
            </div>
        </Card>
    );
}

function DetailModal({ detail, loading, onClose }: { detail: ReqDetail | null; loading: boolean; onClose: () => void }) {
    return (
        <Modal
            open={!!detail || loading}
            title={detail ? `${codigoReq(detail)} | ${statusLabel(detail.status)}` : "Carregando requisição"}
            subtitle={detail ? `${detail.solicitante_nome || "Solicitante não informado"} para ${destinoLabel(detail)}` : undefined}
            onClose={onClose}
        >
            {loading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Carregando detalhes...</div>
            ) : detail ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</div>
                            <div className="mt-2">
                                <Badge className={statusClass(detail.status)}>{statusLabel(detail.status)}</Badge>
                            </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Criada em</div>
                            <div className="mt-2 text-sm font-bold text-slate-950">{fmtDateTime(detail.criado_em)}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Atendimento</div>
                            <div className="mt-2 text-sm font-bold text-slate-950">{detail.id_atendimento || "Sem vínculo"}</div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Justificativa</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{detail.justificativa || "Não informada."}</p>
                    </div>

                    <div>
                        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Itens</h3>
                        <div className="space-y-2">
                            {(detail.items || []).map((item) => (
                                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-950">{item.produto_nome_snapshot}</div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                {item.codigo_barras_snapshot ? `CB ${item.codigo_barras_snapshot}` : "Sem código informado"}
                                                {item.categoria_nome ? ` | ${item.categoria_nome}` : ""}
                                                {item.classificacao_nome ? ` | ${item.classificacao_nome}` : ""}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-[260px]">
                                            <div className="rounded-xl bg-slate-50 p-2">
                                                <div className="font-bold text-slate-500">Solicitada</div>
                                                <div className="mt-1 font-bold text-slate-900">{numberBR(item.quantidade_solicitada, 3)}</div>
                                            </div>
                                            <div className="rounded-xl bg-slate-50 p-2">
                                                <div className="font-bold text-slate-500">Enviada</div>
                                                <div className="mt-1 font-bold text-slate-900">{item.quantidade_enviada == null ? "-" : numberBR(item.quantidade_enviada, 3)}</div>
                                            </div>
                                            <div className="rounded-xl bg-slate-50 p-2">
                                                <div className="font-bold text-slate-500">Recebida</div>
                                                <div className="mt-1 font-bold text-slate-900">{item.quantidade_recebida == null ? "-" : numberBR(item.quantidade_recebida, 3)}</div>
                                            </div>
                                        </div>
                                    </div>
                                    {item.observacao ? <p className="mt-2 text-xs text-slate-600">Obs.: {item.observacao}</p> : null}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Linha do tempo</h3>
                        <div className="space-y-2">
                            {(detail.eventos || []).length === 0 ? (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Nenhum evento registrado.</div>
                            ) : (
                                (detail.eventos || []).map((ev) => (
                                    <div key={ev.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="font-bold text-slate-950">{compactEventName(ev.evento)}</div>
                                            <div className="text-xs font-semibold text-slate-500">{fmtDateTime(ev.criado_em)}</div>
                                        </div>
                                        <div className="mt-1 text-xs text-slate-600">
                                            {ev.usuario_nome || ev.usuario_login || `Usuário #${ev.usuario_id}`}
                                            {ev.status_de || ev.status_para ? ` | ${ev.status_de || ""} para ${ev.status_para || ""}` : ""}
                                        </div>
                                        {ev.observacao ? <div className="mt-2 text-sm text-slate-700">{ev.observacao}</div> : null}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
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
    const [alertasMinimo, setAlertasMinimo] = useState<SaldoMinimoAlerta[]>([]);
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
        if (appliedFilters.status) chips.push({ key: "status", label: statusLabel(appliedFilters.status) });
        if (appliedFilters.q) chips.push({ key: "q", label: `Busca: ${appliedFilters.q}` });
        if (appliedFilters.id_atendimento) chips.push({ key: "id_atendimento", label: `Atendimento: ${appliedFilters.id_atendimento}` });
        if (appliedFilters.atrasadas) chips.push({ key: "atrasadas", label: "Somente atrasadas" });

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
                setAlertasMinimo(alertasResp.estoque_minimo || []);
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

    return (
        <main className="min-h-[100dvh] bg-gray-50 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950">Dashboard Requisições</h1>

                    <div className="grid grid-cols-3 gap-2 sm:flex">
                        <Button type="button" variant="ghost" onClick={() => setFilterOpen(true)}>
                            Filtrar
                        </Button>
                        <Button type="button" variant="soft" onClick={() => void loadDashboard(appliedFilters, offset, limit)} disabled={loading}>
                            Atualizar
                        </Button>
                        <Button type="button" onClick={() => void exportCsv()} disabled={exporting}>
                            {exporting ? "Exportando..." : "CSV"}
                        </Button>
                    </div>
                </div>

                {msg ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{msg}</div> : null}

                <div className="flex flex-wrap gap-2">
                    {activeFilterChips.length === 0 ? (
                        <FilterChip>Nenhum filtro aplicado</FilterChip>
                    ) : (
                        activeFilterChips.map((chip) => <FilterChip key={`${chip.key}-${chip.label}`} onClear={() => removeFilter(chip.key)}>{chip.label}</FilterChip>)
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                    <StatCard label="Total" value={totalFiltrado} hint="No filtro atual" active={!appliedFilters.status && !appliedFilters.atrasadas} onClick={() => void applyFilters({ ...appliedFilters, status: "", atrasadas: false })} />
                    {STATUS_OPTIONS.map((s) => (
                        <StatCard
                            key={s.id}
                            label={s.nome}
                            value={Number(summary.por_status?.[s.id] || 0)}
                            active={appliedFilters.status === s.id}
                            danger={s.id === "EM_TRANSITO" && Number(summary.atrasadas_24h || 0) > 0}
                            onClick={() => void applyFilters({ ...appliedFilters, status: s.id, atrasadas: false })}
                        />
                    ))}
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_0.85fr]">
                    <Card className="p-4 sm:p-5">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 className="text-base font-bold tracking-tight text-slate-950">Distribuição por status</h2>

                            </div>
                            <div className="text-xs font-semibold text-slate-500">Total: {numberBR(totalFiltrado)}</div>
                        </div>

                        <div className="mt-5 space-y-3">
                            {chartRows.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => void applyFilters({ ...appliedFilters, status: r.id, atrasadas: false })}
                                    className="grid w-full grid-cols-[120px_1fr_48px] items-center gap-3 text-left text-sm sm:grid-cols-[160px_1fr_64px]"
                                >
                                    <div className="truncate font-bold text-slate-700">{r.nome}</div>
                                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                                        <div className="h-full rounded-full bg-slate-900" style={{ width: `${r.total === 0 ? 0 : r.percent}%` }} />
                                    </div>
                                    <div className="text-right font-bold text-slate-950">{numberBR(r.total)}</div>
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-base font-bold tracking-tight text-slate-950">Alertas</h2>

                            </div>
                            <Badge className="border-rose-200 bg-rose-50 text-rose-800">{numberBR(summary.atrasadas_24h || 0)} atrasadas</Badge>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3">
                            <button
                                type="button"
                                onClick={() => void applyFilters({ ...appliedFilters, status: "EM_TRANSITO", atrasadas: true })}
                                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-left"
                            >
                                <div className="text-sm font-bold text-rose-900">Em trânsito acima de 24h</div>
                                <div className="mt-1 text-2xl font-bold text-rose-800">{numberBR(summary.atrasadas_24h || alertasTransito.length || 0)}</div>
                                <div className="mt-1 text-xs text-rose-700">Toque para filtrar somente as atrasadas.</div>
                            </button>

                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                <div className="text-sm font-bold text-amber-900">Produtos no mínimo</div>
                                <div className="mt-1 text-2xl font-bold text-amber-800">{numberBR(alertasMinimo.length)}</div>
                                <div className="mt-1 text-xs text-amber-700">Quantidade igual ou abaixo do mínimo configurado.</div>
                            </div>
                        </div>
                    </Card>
                </div>

                {alertasTransito.length > 0 || alertasMinimo.length > 0 ? (
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                        {alertasTransito.length > 0 ? (
                            <Card className="p-4 sm:p-5">
                                <h2 className="text-base font-bold tracking-tight text-slate-950">Trânsito acima de 24h</h2>
                                <div className="mt-4 space-y-2">
                                    {alertasTransito.slice(0, 6).map((r) => (
                                        <button key={r.id} type="button" onClick={() => void openDetail(r.id)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="font-bold text-slate-950">{codigoReq(r)}</div>
                                                <Badge className="border-rose-200 bg-rose-50 text-rose-800">{hoursSince(r.enviado_em) || "+24"}h</Badge>
                                            </div>
                                            <div className="mt-1 line-clamp-1 text-sm font-semibold text-slate-700">{r.itens_resumo}</div>
                                            <div className="mt-1 text-xs text-slate-500">{destinoLabel(r)} | Enviado em {fmtDateTime(r.enviado_em)}</div>
                                        </button>
                                    ))}
                                </div>
                            </Card>
                        ) : null}

                        {alertasMinimo.length > 0 ? (
                            <Card className="p-4 sm:p-5">
                                <h2 className="text-base font-bold tracking-tight text-slate-950">Estoque mínimo</h2>
                                <div className="mt-4 space-y-2">
                                    {alertasMinimo.slice(0, 6).map((a, idx) => (
                                        <div key={`${a.produto_id}-${a.deposito_id}-${idx}`} className="rounded-xl border border-slate-200 bg-white p-3">
                                            <div className="font-bold text-slate-950">{a.produto_nome}</div>
                                            <div className="mt-1 text-xs text-slate-500">{a.deposito_nome}{a.codigo_barras ? ` | CB ${a.codigo_barras}` : ""}</div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <FilterChip>Saldo {numberBR(a.quantidade, 3)}</FilterChip>
                                                <FilterChip>Mínimo {numberBR(a.minimo, 3)}</FilterChip>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ) : null}
                    </div>
                ) : null}

                <Card className="overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                        <div>
                            <h2 className="text-base font-bold tracking-tight text-slate-950">Requisições filtradas</h2>
                            <p className="mt-1 text-sm text-slate-600">
                                {loading ? "Carregando..." : `${numberBR(rows.length)} registros nesta página`}
                                {offset > 0 ? ` | A partir do registro ${offset + 1}` : ""}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Select value={limit} onChange={(e) => setLimit(Number(e.target.value) || 100)} className="w-auto py-2 text-sm">
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={200}>200</option>
                                <option value={500}>500</option>
                            </Select>
                            <Button type="button" variant="ghost" onClick={() => void goPage("prev")} disabled={offset <= 0 || loading}>
                                Anterior
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => void goPage("next")} disabled={rows.length < limit || loading}>
                                Próxima
                            </Button>
                        </div>
                    </div>

                    <div className="p-4 sm:p-5">
                        {loading ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Carregando dashboard...</div>
                        ) : rows.length === 0 ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">Nenhuma requisição encontrada para os filtros aplicados.</div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                {rows.map((row) => (
                                    <RequisitionCard key={row.id} row={row} onOpen={openDetail} />
                                ))}
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            <Modal
                open={filterOpen}
                title="Filtros"
                onClose={() => setFilterOpen(false)}
                footer={
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                const next = emptyFilters();
                                setFilters(next);
                            }}
                        >
                            Limpar campos
                        </Button>
                        <Button
                            type="button"
                            variant="soft"
                            onClick={() => {
                                const next = initialFilters();
                                setFilters(next);
                            }}
                        >
                            Mês atual
                        </Button>
                        <Button type="button" onClick={() => void applyFilters()}>
                            Aplicar filtros
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

                    <Field label="Busca geral" hint="Código, produto, solicitante, destino ou justificativa.">
                        <TextInput value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Buscar..." />
                    </Field>

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

                    <Field label="Atrasadas">
                        <button
                            type="button"
                            onClick={() => setFilters((f) => ({ ...f, atrasadas: !f.atrasadas, status: !f.atrasadas ? "EM_TRANSITO" : f.status }))}
                            className={[
                                "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[15px] font-bold shadow-sm",
                                filters.atrasadas ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-700",
                            ].join(" ")}
                        >
                            <span>Somente trânsito acima de 24h</span>
                            <span>{filters.atrasadas ? "Ativo" : "Inativo"}</span>
                        </button>
                    </Field>

                    <div className="sm:col-span-2 lg:col-span-3">
                        <Field label="Produto">
                            <ProductSelect produtos={produtos} value={filters.produto_id} onChange={(v) => setFilters((f) => ({ ...f, produto_id: v }))} />
                        </Field>
                    </div>
                </div>
            </Modal>

            <DetailModal detail={detail} loading={detailLoading} onClose={() => { setDetail(null); setDetailLoading(false); }} />
        </main>
    );
}
