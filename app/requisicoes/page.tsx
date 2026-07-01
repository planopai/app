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

type Deposito = {
    id: ID;
    nome: string;
};

type Produto = {
    id: ID;
    nome: string;
    codigo_barras?: string | null;
    foto_url?: string | null;
    categoria_nome?: string | null;
    classificacao_nome?: string | null;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number | string;
    minimo?: number | string;
    maximo?: number | string;
};

type StatusOption = {
    id: StatusId;
    nome: string;
};

type Contadores = {
    por_status?: Partial<Record<StatusId, number>>;
    atrasadas_24h?: number;
    status_labels?: Partial<Record<StatusId, string>>;
};

type InitResp = {
    ok: boolean;
    me?: Me;
    depositos?: Deposito[];
    produtos?: Produto[];
    saldos?: Saldo[];
    status?: StatusOption[];
    contadores?: Contadores;
    alertas?: {
        transito_24h?: ReqListRow[];
        estoque_minimo?: unknown[];
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

type DetailResp = {
    ok: boolean;
    row?: ReqDetail;
    msg?: string;
    need_login?: 1;
};

type ActionResp = {
    ok: boolean;
    msg?: string;
    row?: ReqDetail;
    need_login?: 1;
};

type SendItemDraft = {
    id: ID;
    produto_id: ID;
    nome: string;
    solicitada: number;
    quantidade_enviada: string;
};

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/requisicoes.php`;

const STATUS_OPTIONS: StatusOption[] = [
    { id: "PENDENTE", nome: "Pendentes" },
    { id: "EM_SEPARACAO", nome: "Em separação" },
    { id: "EM_TRANSITO", nome: "Em trânsito" },
    { id: "ENTREGUE", nome: "Entregues" },
    { id: "RECUSADA", nome: "Recusadas" },
    { id: "CANCELADA", nome: "Canceladas" },
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

function numberBR(v: unknown, decimals = 3) {
    const n = Number(String(v ?? "0").replace(",", "."));
    const safe = Number.isFinite(n) ? n : 0;

    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    }).format(safe);
}

function asNumber(v: unknown) {
    const n = Number(String(v ?? "0").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

function normalizeDecimalInput(raw: string) {
    const clean = raw.replace(/[^0-9,\.]/g, "").replace(".", ",");
    const parts = clean.split(",");

    if (parts.length <= 1) return parts[0] || "";

    return `${parts[0]},${parts.slice(1).join("").slice(0, 3)}`;
}

function decimalToApi(v: string | number) {
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "0";

    const raw = String(v ?? "0").trim();
    if (!raw) return "0";

    if (raw.includes(",")) {
        return raw.replace(/\./g, "").replace(",", ".");
    }

    return raw.replace(/[^0-9.\-]/g, "");
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

function destinationText(row?: ReqListRow | ReqDetail | null) {
    if (!row) return "-";
    return row.unidade_destino_nome || row.unidade_destino_texto || "-";
}

function reqCode(row?: ReqListRow | ReqDetail | null) {
    if (!row) return "REQ";
    return row.codigo || `REQ-${row.id}`;
}

function isTruthy(v: unknown) {
    return v === 1 || v === "1" || v === true || String(v).toLowerCase() === "true";
}

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

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>{children}</section>;
}

function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "soft" | "ghost" | "danger" }) {
    const base =
        "inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-[15px] font-semibold shadow-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50";

    const cls =
        variant === "solid"
            ? "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
            : variant === "danger"
                ? "border border-rose-700 bg-rose-700 text-white hover:bg-rose-800"
                : variant === "soft"
                    ? "border border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>
            {children}
        </label>
    );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className || "",
            ].join(" ")}
        />
    );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none",
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
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className || "",
            ].join(" ")}
        />
    );
}

function Badge({ status }: { status: unknown }) {
    return <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold", statusClass(status)].join(" ")}>{statusLabel(status)}</span>;
}

function Modal({
    open,
    title,
    onClose,
    children,
    maxWidth = "max-w-2xl",
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    maxWidth?: string;
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
        <div className="fixed inset-0 z-50 flex min-h-[100dvh] items-start justify-center bg-slate-950/55 p-3 pt-5 sm:items-center sm:p-4" role="dialog" aria-modal="true">
            <div className={["flex max-h-[calc(100dvh-2.5rem)] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl", maxWidth].join(" ")}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                    <h2 className="truncate text-lg font-bold text-slate-900">{title}</h2>
                    <button className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" type="button" onClick={onClose} aria-label="Fechar">
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
            </div>
        </div>
    );
}

function EmptyState({ title, text }: { title: string; text: string }) {
    return (
        <Card className="p-6 text-center">
            <h3 className="font-bold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{text}</p>
        </Card>
    );
}

export default function OperarRequisicoesPage() {
    const [me, setMe] = useState<Me | null>(null);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);
    const [contadores, setContadores] = useState<Contadores | null>(null);

    const [rows, setRows] = useState<ReqListRow[]>([]);
    const [selectedStatus, setSelectedStatus] = useState<StatusId | "TODAS">("PENDENTE");
    const [q, setQ] = useState("");
    const [dataIni, setDataIni] = useState("");
    const [dataFim, setDataFim] = useState("");
    const [showFilters, setShowFilters] = useState(false);

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [okMsg, setOkMsg] = useState("");

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detail, setDetail] = useState<ReqDetail | null>(null);

    const [sendOpen, setSendOpen] = useState(false);
    const [sendReq, setSendReq] = useState<ReqDetail | null>(null);
    const [sendDepositoId, setSendDepositoId] = useState<number>(0);
    const [sendItems, setSendItems] = useState<SendItemDraft[]>([]);
    const [sendObs, setSendObs] = useState("");

    const [reasonOpen, setReasonOpen] = useState<"RECUSAR" | "CANCELAR" | null>(null);
    const [reasonReq, setReasonReq] = useState<ReqListRow | ReqDetail | null>(null);
    const [reason, setReason] = useState("");

    const produtoById = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

    const saldoMap = useMemo(() => {
        const map = new Map<string, number>();

        for (const s of saldos) {
            map.set(`${Number(s.produto_id)}:${Number(s.deposito_id)}`, asNumber(s.quantidade));
        }

        return map;
    }, [saldos]);

    const totalGeral = useMemo(() => {
        const porStatus = contadores?.por_status || {};
        return STATUS_OPTIONS.reduce((acc, item) => acc + Number(porStatus[item.id] || 0), 0);
    }, [contadores]);

    const filteredStatusText = selectedStatus === "TODAS" ? "PENDENTE,EM_SEPARACAO,EM_TRANSITO,ENTREGUE,RECUSADA,CANCELADA" : selectedStatus;

    const loadInit = useCallback(async () => {
        const data = await apiGet<InitResp>({ action: "init" });

        if (!data.ok) throw new Error(data.msg || "Não foi possível carregar a tela.");

        setMe(data.me || null);
        setDepositos(data.depositos || []);
        setProdutos(data.produtos || []);
        setSaldos(data.saldos || []);
        setContadores(data.contadores || null);
    }, []);

    const loadRows = useCallback(async () => {
        const data = await apiGet<ListResp>({
            action: "fila",
            status: filteredStatusText,
            q: q.trim() || undefined,
            de: dataIni || undefined,
            ate: dataFim || undefined,
            limit: 200,
        });

        if (!data.ok) throw new Error(data.msg || "Não foi possível carregar a fila.");

        setRows(data.rows || []);
    }, [dataFim, dataIni, filteredStatusText, q]);

    const refreshAll = useCallback(async () => {
        setError("");
        setOkMsg("");
        setLoading(true);

        try {
            await loadInit();
            await loadRows();
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar dados.");
        } finally {
            setLoading(false);
        }
    }, [loadInit, loadRows]);

    useEffect(() => {
        void refreshAll();
    }, [refreshAll]);

    async function refreshAfterAction(msg?: string) {
        await loadInit();
        await loadRows();

        if (msg) setOkMsg(msg);
    }

    async function openDetail(row: ReqListRow | ReqDetail) {
        setDetailOpen(true);
        setDetailLoading(true);
        setDetail(null);
        setError("");

        try {
            const data = await apiGet<DetailResp>({ action: "detalhar", id: row.id });

            if (!data.ok || !data.row) throw new Error(data.msg || "Não foi possível abrir a requisição.");

            setDetail(data.row);
            apiPost<ActionResp>({ action: "visualizar", id: row.id }).catch(() => undefined);
        } catch (e: any) {
            setError(e?.message || "Erro ao abrir detalhe.");
            setDetailOpen(false);
        } finally {
            setDetailLoading(false);
        }
    }

    async function startSeparation(row: ReqListRow | ReqDetail) {
        if (busy) return;

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiPost<ActionResp>({ action: "iniciar_separacao", id: row.id });

            if (!data.ok) throw new Error(data.msg || "Não foi possível iniciar a separação.");

            await refreshAfterAction(data.msg || "Separação iniciada.");
        } catch (e: any) {
            setError(e?.message || "Erro ao iniciar separação.");
        } finally {
            setBusy(false);
        }
    }

    async function prepareSend(row: ReqListRow | ReqDetail) {
        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiGet<DetailResp>({ action: "detalhar", id: row.id });

            if (!data.ok || !data.row) throw new Error(data.msg || "Não foi possível carregar itens.");

            const items = (data.row.items || []).map((it) => ({
                id: Number(it.id),
                produto_id: Number(it.produto_id),
                nome: it.produto_nome_snapshot || it.produto_nome_atual || `Produto #${it.produto_id}`,
                solicitada: asNumber(it.quantidade_solicitada),
                quantidade_enviada: String(asNumber(it.quantidade_solicitada)).replace(".", ","),
            }));

            setSendReq(data.row);
            setSendItems(items);
            setSendDepositoId(Number(data.row.deposito_origem_id || 0));
            setSendObs("");
            setSendOpen(true);
        } catch (e: any) {
            setError(e?.message || "Erro ao preparar envio.");
        } finally {
            setBusy(false);
        }
    }

    function updateSendItem(itemId: ID, value: string) {
        setSendItems((items) => items.map((it) => (it.id === itemId ? { ...it, quantidade_enviada: normalizeDecimalInput(value) } : it)));
    }

    const sendValidation = useMemo(() => {
        if (!sendReq) return { ok: false, msg: "Requisição não carregada." };
        if (!sendDepositoId) return { ok: false, msg: "Selecione o depósito de origem." };
        if (!sendItems.length) return { ok: false, msg: "Requisição sem itens." };

        for (const item of sendItems) {
            const qtd = asNumber(decimalToApi(item.quantidade_enviada));
            const disponivel = saldoMap.get(`${item.produto_id}:${sendDepositoId}`) || 0;

            if (qtd <= 0) return { ok: false, msg: `Quantidade inválida para ${item.nome}.` };
            if (qtd - 0.0001 > item.solicitada) return { ok: false, msg: `Quantidade enviada maior que a solicitada em ${item.nome}.` };
            if (qtd - 0.0001 > disponivel) return { ok: false, msg: `Saldo insuficiente para ${item.nome}.` };
        }

        return { ok: true, msg: "Pronto para envio." };
    }, [saldoMap, sendDepositoId, sendItems, sendReq]);

    async function confirmSend() {
        if (!sendReq || !sendValidation.ok || busy) return;

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiPost<ActionResp>({
                action: "enviar_material",
                id: sendReq.id,
                deposito_origem_id: sendDepositoId,
                observacao: sendObs.trim(),
                itens: sendItems.map((it) => ({
                    id: it.id,
                    quantidade_enviada: decimalToApi(it.quantidade_enviada),
                })),
            });

            if (!data.ok) throw new Error(data.msg || "Não foi possível enviar o material.");

            setSendOpen(false);
            setSendReq(null);
            setSendItems([]);
            await refreshAfterAction(data.msg || "Material enviado.");
        } catch (e: any) {
            setError(e?.message || "Erro ao enviar material.");
        } finally {
            setBusy(false);
        }
    }

    function openReason(kind: "RECUSAR" | "CANCELAR", row: ReqListRow | ReqDetail) {
        setReasonOpen(kind);
        setReasonReq(row);
        setReason("");
        setError("");
        setOkMsg("");
    }

    async function confirmReason() {
        if (!reasonOpen || !reasonReq || busy) return;

        if (!reason.trim()) {
            setError(reasonOpen === "RECUSAR" ? "Informe o motivo da recusa." : "Informe o motivo do cancelamento.");
            return;
        }

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const action = reasonOpen === "RECUSAR" ? "recusar" : "cancelar";
            const data = await apiPost<ActionResp>({ action, id: reasonReq.id, motivo: reason.trim() });

            if (!data.ok) throw new Error(data.msg || "Não foi possível concluir a ação.");

            setReasonOpen(null);
            setReasonReq(null);
            setReason("");
            await refreshAfterAction(data.msg || "Ação registrada.");
        } catch (e: any) {
            setError(e?.message || "Erro ao registrar ação.");
        } finally {
            setBusy(false);
        }
    }

    const counter = (status: StatusId) => Number(contadores?.por_status?.[status] || 0);

    return (
        <main className="min-h-[100dvh] bg-gray-50 px-3 py-4 text-slate-900 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl space-y-4">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Requisições</h1>
                        {me ? <p className="mt-1 text-xs text-slate-500">Operador: {me.nome || me.usuario}</p> : null}
                    </div>

                    <div className="flex gap-2">
                        <Button type="button" variant="ghost" onClick={() => setShowFilters(true)}>
                            Filtrar
                        </Button>
                        <Button type="button" onClick={refreshAll} disabled={loading || busy}>
                            Atualizar
                        </Button>
                    </div>
                </header>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                    <StatusButton label="Todas" value={totalGeral} active={selectedStatus === "TODAS"} onClick={() => setSelectedStatus("TODAS")} />

                    {STATUS_OPTIONS.map((s) => (
                        <StatusButton key={s.id} label={s.nome} value={counter(s.id)} active={selectedStatus === s.id} onClick={() => setSelectedStatus(s.id)} />
                    ))}
                </div>

                {Number(contadores?.atrasadas_24h || 0) > 0 ? (
                    <Card className="border-rose-200 bg-rose-50 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="font-bold text-rose-900">{contadores?.atrasadas_24h} em trânsito há mais de 24 horas.</p>
                            <Button type="button" variant="danger" onClick={() => setSelectedStatus("EM_TRANSITO")}>
                                Ver
                            </Button>
                        </div>
                    </Card>
                ) : null}

                {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div> : null}
                {okMsg ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{okMsg}</div> : null}

                <Card className="p-3 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1">
                            <Field label="Busca">
                                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Produto, solicitante, atendimento ou código" />
                            </Field>
                        </div>

                        <div className="flex gap-2">
                            <Button type="button" onClick={loadRows} disabled={loading || busy}>
                                Buscar
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    setQ("");
                                    setDataIni("");
                                    setDataFim("");
                                }}
                            >
                                Limpar
                            </Button>
                        </div>
                    </div>
                </Card>

                {loading ? (
                    <Card className="p-6 text-center text-sm font-semibold text-slate-600">Carregando...</Card>
                ) : rows.length === 0 ? (
                    <EmptyState title="Nenhuma requisição encontrada" text="Ajuste os filtros ou atualize a tela." />
                ) : (
                    <div className="space-y-3">
                        {rows.map((row) => (
                            <RequestCard
                                key={row.id}
                                row={row}
                                busy={busy}
                                onOpen={() => openDetail(row)}
                                onStart={() => startSeparation(row)}
                                onSend={() => prepareSend(row)}
                                onReject={() => openReason("RECUSAR", row)}
                                onCancel={() => openReason("CANCELAR", row)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <Modal open={showFilters} title="Filtros" onClose={() => setShowFilters(false)}>
                <div className="space-y-4">
                    <Field label="Status">
                        <Select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as StatusId | "TODAS")}>
                            <option value="TODAS">Todas</option>
                            {STATUS_OPTIONS.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Data inicial">
                            <TextInput type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} />
                        </Field>
                        <Field label="Data final">
                            <TextInput type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                        </Field>
                    </div>

                    <Field label="Busca">
                        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Produto, solicitante, atendimento ou código" />
                    </Field>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                            type="button"
                            onClick={async () => {
                                setShowFilters(false);
                                await loadRows();
                            }}
                        >
                            Aplicar
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                setSelectedStatus("PENDENTE");
                                setQ("");
                                setDataIni("");
                                setDataFim("");
                            }}
                        >
                            Resetar
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal open={detailOpen} title={detail ? reqCode(detail) : "Detalhe"} onClose={() => setDetailOpen(false)} maxWidth="max-w-4xl">
                {detailLoading ? (
                    <div className="p-5 text-center text-sm font-semibold text-slate-600">Carregando...</div>
                ) : detail ? (
                    <DetailContent
                        detail={detail}
                        onStart={() => startSeparation(detail)}
                        onSend={() => prepareSend(detail)}
                        onReject={() => openReason("RECUSAR", detail)}
                        onCancel={() => openReason("CANCELAR", detail)}
                        busy={busy}
                    />
                ) : null}
            </Modal>

            <Modal open={sendOpen} title="Enviar material" onClose={() => setSendOpen(false)} maxWidth="max-w-4xl">
                <div className="space-y-4">
                    <Field label="Depósito de origem">
                        <Select value={sendDepositoId || ""} onChange={(e) => setSendDepositoId(Number(e.target.value || 0))}>
                            <option value="">Selecione...</option>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <div className="space-y-2">
                        {sendItems.map((item) => {
                            const disponivel = sendDepositoId ? saldoMap.get(`${item.produto_id}:${sendDepositoId}`) || 0 : 0;
                            const qtd = asNumber(decimalToApi(item.quantidade_enviada));
                            const produto = produtoById.get(item.produto_id);
                            const invalid = sendDepositoId > 0 && qtd > disponivel + 0.0001;

                            return (
                                <div key={item.id} className={["rounded-2xl border p-3", invalid ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"].join(" ")}>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="font-bold text-slate-900">{item.nome}</p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Solicitado: <b>{numberBR(item.solicitada)}</b>
                                                {produto?.codigo_barras ? (
                                                    <>
                                                        {" "}| CB: <b>{produto.codigo_barras}</b>
                                                    </>
                                                ) : null}
                                            </p>
                                            <p className={["mt-1 text-xs", invalid ? "font-bold text-rose-700" : "text-slate-500"].join(" ")}>
                                                Disponível: <b>{numberBR(disponivel)}</b>
                                            </p>
                                        </div>

                                        <div className="w-full sm:w-44">
                                            <Field label="Qtd. enviada">
                                                <TextInput inputMode="decimal" value={item.quantidade_enviada} onChange={(e) => updateSendItem(item.id, e.target.value)} />
                                            </Field>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <Field label="Observação">
                        <TextArea rows={3} value={sendObs} onChange={(e) => setSendObs(e.target.value)} />
                    </Field>

                    <div className={["rounded-2xl border p-3 text-sm font-semibold", sendValidation.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"].join(" ")}>
                        {sendValidation.msg}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button type="button" onClick={confirmSend} disabled={busy || !sendValidation.ok}>
                            Confirmar envio
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setSendOpen(false)}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal open={reasonOpen !== null} title={reasonOpen === "RECUSAR" ? "Recusar" : "Cancelar"} onClose={() => setReasonOpen(null)}>
                <div className="space-y-4">
                    <Field label="Motivo">
                        <TextArea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
                    </Field>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button type="button" variant={reasonOpen === "RECUSAR" ? "danger" : "solid"} onClick={confirmReason} disabled={busy}>
                            Confirmar
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setReasonOpen(null)}>
                            Voltar
                        </Button>
                    </div>
                </div>
            </Modal>
        </main>
    );
}

function StatusButton({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "rounded-2xl border p-3 text-left shadow-sm transition",
                active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
            ].join(" ")}
        >
            <span className="block truncate text-xs font-semibold opacity-75">{label}</span>
            <span className="mt-1 block text-xl font-black">{value}</span>
        </button>
    );
}

function RequestCard({
    row,
    busy,
    onOpen,
    onStart,
    onSend,
    onReject,
    onCancel,
}: {
    row: ReqListRow;
    busy: boolean;
    onOpen: () => void;
    onStart: () => void;
    onSend: () => void;
    onReject: () => void;
    onCancel: () => void;
}) {
    const status = toStatus(row.status);
    const canStart = status === "PENDENTE";
    const canSend = status === "EM_SEPARACAO" || status === "PENDENTE";
    const canReject = status === "PENDENTE" || status === "EM_SEPARACAO";
    const canCancel = status === "PENDENTE" || status === "EM_SEPARACAO";

    return (
        <Card className={isTruthy(row.atrasada_24h) ? "border-rose-200" : ""}>
            <div className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-black text-slate-950">{reqCode(row)}</h2>
                            <Badge status={row.status} />
                            {isTruthy(row.atrasada_24h) ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800">+24h</span> : null}
                        </div>

                        <p className="mt-2 text-sm font-semibold text-slate-900">{row.itens_resumo || "Itens não informados"}</p>

                        <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                            <p>
                                Solicitante: <b>{row.solicitante_nome || "-"}</b>
                            </p>
                            <p>
                                Destino: <b>{destinationText(row)}</b>
                            </p>
                            <p>
                                Aberta em: <b>{fmtDateTime(row.criado_em)}</b>
                            </p>
                            <p>
                                Atendimento: <b>{row.id_atendimento || "-"}</b>
                            </p>
                            {row.deposito_origem_nome ? (
                                <p>
                                    Origem: <b>{row.deposito_origem_nome}</b>
                                </p>
                            ) : null}
                            {row.enviado_em ? (
                                <p>
                                    Enviada em: <b>{fmtDateTime(row.enviado_em)}</b>
                                </p>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 sm:w-48">
                        {canStart ? (
                            <Button type="button" onClick={onStart} disabled={busy}>
                                Iniciar
                            </Button>
                        ) : null}
                        {canSend ? (
                            <Button type="button" variant={canStart ? "soft" : "solid"} onClick={onSend} disabled={busy}>
                                Enviar
                            </Button>
                        ) : null}
                        <Button type="button" variant="ghost" onClick={onOpen}>
                            Detalhes
                        </Button>
                        {canReject ? (
                            <Button type="button" variant="ghost" onClick={onReject} disabled={busy}>
                                Recusar
                            </Button>
                        ) : null}
                        {canCancel ? (
                            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
                                Cancelar
                            </Button>
                        ) : null}
                    </div>
                </div>
            </div>
        </Card>
    );
}

function DetailContent({
    detail,
    onStart,
    onSend,
    onReject,
    onCancel,
    busy,
}: {
    detail: ReqDetail;
    onStart: () => void;
    onSend: () => void;
    onReject: () => void;
    onCancel: () => void;
    busy: boolean;
}) {
    const status = toStatus(detail.status);
    const canStart = status === "PENDENTE";
    const canSend = status === "PENDENTE" || status === "EM_SEPARACAO";
    const canReject = status === "PENDENTE" || status === "EM_SEPARACAO";
    const canCancel = status === "PENDENTE" || status === "EM_SEPARACAO";

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <InfoBox label="Status" value={statusLabel(detail.status)} />
                <InfoBox label="Solicitante" value={detail.solicitante_nome || detail.solicitante_usuario || "-"} />
                <InfoBox label="Destino" value={destinationText(detail)} />
                <InfoBox label="Aberta em" value={fmtDateTime(detail.criado_em)} />
                <InfoBox label="Atendimento" value={detail.id_atendimento || "-"} />
                <InfoBox label="Tipo" value={detail.destino_tipo === "DEPOSITO" ? "Depósito" : "Consumo"} />
            </div>

            {detail.justificativa ? (
                <Card className="p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Justificativa</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{detail.justificativa}</p>
                </Card>
            ) : null}

            <div>
                <h3 className="mb-2 text-sm font-black text-slate-900">Itens</h3>
                <div className="space-y-2">
                    {(detail.items || []).map((item) => (
                        <Card key={item.id} className="p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <p className="font-bold text-slate-900">{item.produto_nome_snapshot}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Produto #{item.produto_id}
                                        {item.codigo_barras_snapshot ? (
                                            <>
                                                {" "}| CB: <b>{item.codigo_barras_snapshot}</b>
                                            </>
                                        ) : null}
                                    </p>
                                    {item.observacao ? <p className="mt-2 text-sm text-slate-600">{item.observacao}</p> : null}
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center text-xs sm:w-72">
                                    <QtyMini label="Solicitada" value={item.quantidade_solicitada} />
                                    <QtyMini label="Enviada" value={item.quantidade_enviada} />
                                    <QtyMini label="Recebida" value={item.quantidade_recebida} />
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {canStart ? (
                    <Button type="button" onClick={onStart} disabled={busy}>
                        Iniciar
                    </Button>
                ) : null}
                {canSend ? (
                    <Button type="button" onClick={onSend} disabled={busy}>
                        Enviar
                    </Button>
                ) : null}
                {canReject ? (
                    <Button type="button" variant="danger" onClick={onReject} disabled={busy}>
                        Recusar
                    </Button>
                ) : null}
                {canCancel ? (
                    <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
                        Cancelar
                    </Button>
                ) : null}
            </div>

            <div>
                <h3 className="mb-2 text-sm font-black text-slate-900">Linha do tempo</h3>
                {(detail.eventos || []).length ? (
                    <div className="space-y-2">
                        {(detail.eventos || []).map((ev) => (
                            <div key={ev.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm font-bold text-slate-900">{eventLabel(ev.evento)}</p>
                                    <p className="text-xs text-slate-500">{fmtDateTime(ev.criado_em)}</p>
                                </div>
                                <p className="mt-1 text-xs text-slate-600">
                                    Usuário: <b>{ev.usuario_nome || ev.usuario_login || ev.usuario_id}</b>
                                </p>
                                {ev.observacao ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{ev.observacao}</p> : null}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Nenhum evento registrado.</p>
                )}
            </div>
        </div>
    );
}

function InfoBox({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
        </div>
    );
}

function QtyMini({ label, value }: { label: string; value?: string | number | null }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-900">{value === null || value === undefined || value === "" ? "-" : numberBR(value)}</p>
        </div>
    );
}

function eventLabel(ev: string) {
    const s = String(ev || "").toUpperCase();
    const map: Record<string, string> = {
        CRIADA: "Criada",
        VISUALIZADA: "Visualizada",
        INICIOU_SEPARACAO: "Separação iniciada",
        ENVIOU_MATERIAL: "Material enviado",
        CONFIRMOU_RECEBIMENTO: "Recebimento confirmado",
        RECUSADA: "Recusada",
        CANCELADA: "Cancelada",
    };

    return map[s] || ev;
}
