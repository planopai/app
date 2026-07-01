"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ID = number;

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
    descricao?: string | null;
    codigo_barras?: string | null;
    valor?: string | number | null;
    preco_custo?: string | number | null;
    minimo?: number | string | null;
    maximo?: number | string | null;
    foto_url?: string | null;
    ativo?: 0 | 1 | number;
    atualizado_em?: string;
    categoria_id?: ID | null;
    categoria_nome?: string | null;
    fabricante_id?: ID | null;
    fabricante_nome?: string | null;
    classificacao_id?: ID | null;
    classificacao_nome?: string | null;
    exige_atendimento?: 0 | 1 | number | string;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number | string;
    minimo?: number | string;
    maximo?: number | string;
    atualizado_em?: string;
};

type StatusId =
    | "PENDENTE"
    | "EM_SEPARACAO"
    | "EM_TRANSITO"
    | "ENTREGUE"
    | "CANCELADA"
    | "RECUSADA";

type StatusOption = {
    id: StatusId;
    nome: string;
};

type InitResp = {
    ok: boolean;
    me?: Me;
    usuarios?: Usuario[];
    depositos?: Deposito[];
    produtos?: Produto[];
    saldos?: Saldo[];
    status?: StatusOption[];
    msg?: string;
    need_login?: 1;
};

type ReqListRow = {
    id: ID;
    codigo?: string | null;
    status: StatusId | string;
    status_label?: string;
    solicitante_usuario_id?: ID;
    solicitante_nome?: string | null;
    unidade_destino_id?: ID | null;
    unidade_destino_nome?: string | null;
    unidade_destino_texto?: string | null;
    destino_tipo?: "DEPOSITO" | "CONSUMO" | string;
    id_atendimento?: string | null;
    justificativa?: string | null;
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
    evento: string;
    status_de?: string | null;
    status_para?: string | null;
    observacao?: string | null;
    criado_em: string;
};

type ReqDetalhe = ReqListRow & {
    solicitante_usuario?: string | null;
    separado_por_nome?: string | null;
    enviado_por_nome?: string | null;
    recebido_por_nome?: string | null;
    cancelado_por_nome?: string | null;
    recusado_por_nome?: string | null;
    deposito_origem_nome?: string | null;
    items: ReqItem[];
    eventos: ReqEvento[];
};

type ListResp = {
    ok: boolean;
    rows?: ReqListRow[];
    msg?: string;
    need_login?: 1;
};

type DetailResp = {
    ok: boolean;
    row?: ReqDetalhe;
    msg?: string;
    need_login?: 1;
};

type MutResp = {
    ok: boolean;
    msg?: string;
    id?: ID;
    codigo?: string;
    row?: ReqDetalhe;
    need_login?: 1;
};

type ItemDraft = {
    local_id: string;
    produto_id: ID;
    produto_nome: string;
    codigo_barras?: string | null;
    quantidade: string;
    observacao: string;
};

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/requisicoes.php`;

const STATUS_FALLBACK: StatusOption[] = [
    { id: "PENDENTE", nome: "Pendente" },
    { id: "EM_SEPARACAO", nome: "Em separação" },
    { id: "EM_TRANSITO", nome: "Em trânsito" },
    { id: "ENTREGUE", nome: "Entregue" },
    { id: "CANCELADA", nome: "Cancelada" },
    { id: "RECUSADA", nome: "Recusada" },
];

function parseNum(v: unknown) {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}

function clampQtdText(v: string) {
    const raw = (v || "").replace(/[^0-9,.]/g, "");
    const firstComma = raw.indexOf(",");
    const firstDot = raw.indexOf(".");

    if (firstComma >= 0 && firstDot >= 0) {
        const decimalChar = firstComma > firstDot ? "," : ".";
        const parts = raw.split(decimalChar);
        return `${parts.shift() || ""}${decimalChar}${parts.join("").replace(/[,.]/g, "")}`;
    }

    if (firstComma >= 0) {
        const parts = raw.split(",");
        return `${parts.shift() || ""},${parts.join("").replace(/[,.]/g, "")}`;
    }

    if (firstDot >= 0) {
        const parts = raw.split(".");
        return `${parts.shift() || ""}.${parts.join("").replace(/[,.]/g, "")}`;
    }

    return raw;
}

function fmtQtd(v: unknown) {
    const n = parseNum(v);
    if (!Number.isFinite(n)) return "0";
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
    }).format(n);
}

function fmtDateTime(value?: string | null) {
    if (!value) return "-";
    try {
        const normalized = value.includes("T") ? value : value.replace(" ", "T");
        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date(normalized));
    } catch {
        return value;
    }
}

function normalizeText(s: string) {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function statusLabel(status: string, options: StatusOption[]) {
    return options.find((s) => s.id === status)?.nome || STATUS_FALLBACK.find((s) => s.id === status)?.nome || status;
}

type JustificativaId =
    | "MERCADORIA_REVENDA"
    | "USO_CONSUMO"
    | "INSUMOS_ATENDIMENTO";

type JustificativaOption = {
    id: JustificativaId;
    label: string;
    valor: string;
    destino_tipo: "CONSUMO" | "DEPOSITO";
    classificacoes: string[];
};

const JUSTIFICATIVAS: JustificativaOption[] = [
    {
        id: "MERCADORIA_REVENDA",
        label: "Reposição de Estoque",
        valor: "Reposição de Estoque",
        destino_tipo: "DEPOSITO",
        classificacoes: ["MERCADORIA PARA REVENDA"],
    },
    {
        id: "USO_CONSUMO",
        label: "Consumo Interno",
        valor: "Consumo Interno",
        destino_tipo: "CONSUMO",
        classificacoes: ["MATERIAL DE USO E CONSUMO"],
    },
    {
        id: "INSUMOS_ATENDIMENTO",
        label: "Insumos Para Atendimentos Funerários",
        valor: "Insumos Para Atendimentos Funerários",
        destino_tipo: "DEPOSITO",
        classificacoes: ["INSUMOS"],
    },
];

function classificacaoProduto(p?: Produto | null) {
    return normalizeText(p?.classificacao_nome || "");
}

function produtoPermitidoPorJustificativa(p: Produto, justificativaId: JustificativaId | "") {
    if (!justificativaId) return false;

    const regra = JUSTIFICATIVAS.find((j) => j.id === justificativaId);
    if (!regra) return false;

    const classificacao = classificacaoProduto(p);

    return regra.classificacoes.some((classe) => classificacao === normalizeText(classe));
}

function destinoTipoDaJustificativa(justificativaId: JustificativaId | ""): "CONSUMO" | "DEPOSITO" {
    return JUSTIFICATIVAS.find((j) => j.id === justificativaId)?.destino_tipo || "CONSUMO";
}

function justificativaValor(justificativaId: JustificativaId | "") {
    return JUSTIFICATIVAS.find((j) => j.id === justificativaId)?.valor || "";
}

function destinoLabel(row: ReqListRow) {
    if (row.unidade_destino_nome) return row.unidade_destino_nome;
    if (row.unidade_destino_texto) return row.unidade_destino_texto;
    if (row.unidade_destino_id) return `Depósito #${row.unidade_destino_id}`;
    return "Não informado";
}

async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Resposta inesperada da API. ${txt ? txt.slice(0, 180) : ""}`.trim());
    }
    return (await r.json()) as T;
}

async function apiGet<T>(qs: Record<string, string | number | boolean | undefined>) {
    const u = new URL(API_BASE, window.location.origin);
    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined || v === "") return;
        u.searchParams.set(k, String(v));
    });

    const r = await fetch(u.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });

    return await safeJson<T>(r);
}

async function apiPost<T>(body: Record<string, unknown>) {
    const r = await fetch(API_BASE, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    return await safeJson<T>(r);
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>{children}</section>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-[11px] leading-4 text-slate-500">{hint}</span> : null}
        </label>
    );
}

const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(props, ref) {
    return (
        <input
            ref={ref}
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[16px] text-slate-900 shadow-sm outline-none",
                "placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-500",
                props.className || "",
            ].join(" ")}
        />
    );
});

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[16px] text-slate-900 shadow-sm outline-none",
                "placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-500",
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
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[16px] text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-500",
                props.className || "",
            ].join(" ")}
        />
    );
}

function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "soft" | "ghost" | "danger" }) {
    const base =
        "inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-[15px] font-bold shadow-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50";

    const style =
        variant === "solid"
            ? "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
            : variant === "soft"
                ? "border border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200"
                : variant === "danger"
                    ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

    return (
        <button {...props} className={[base, style, className].join(" ")}>
            {children}
        </button>
    );
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <span className={["inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold", className].join(" ")}>{children}</span>;
}

function StatusBadge({ status, options }: { status: string; options: StatusOption[] }) {
    const cls =
        status === "PENDENTE"
            ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
            : status === "EM_SEPARACAO"
                ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200"
                : status === "EM_TRANSITO"
                    ? "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200"
                    : status === "ENTREGUE"
                        ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                        : status === "RECUSADA"
                            ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
                            : status === "CANCELADA"
                                ? "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                                : "bg-slate-100 text-slate-700 ring-1 ring-slate-200";

    return <Pill className={cls}>{statusLabel(status, options)}</Pill>;
}

function Modal({
    open,
    title,
    subtitle,
    onClose,
    children,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
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
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex min-h-[100dvh] items-end justify-center bg-slate-950/55 p-3 sm:items-center sm:p-4">
            <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-900">{title}</h2>
                        {subtitle ? <p className="mt-1 text-sm leading-5 text-slate-600">{subtitle}</p> : null}
                    </div>
                    <button type="button" onClick={onClose} className="rounded-2xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100" aria-label="Fechar">
                        ✕
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
            </div>
        </div>
    );
}

function ProductCombobox({
    label,
    placeholder,
    produtos,
    valueId,
    onChangeId,
    query,
    setQuery,
    saldoTotalByProd,
}: {
    label: string;
    placeholder?: string;
    produtos: Produto[];
    valueId: ID;
    onChangeId: (id: ID) => void;
    query: string;
    setQuery: (v: string) => void;
    saldoTotalByProd: Map<ID, number>;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    const list = useMemo(() => {
        const qq = normalizeText(query);
        const base = !qq
            ? produtos
            : produtos.filter((p) => normalizeText(`${p.nome} ${p.codigo_barras || ""} ${p.categoria_nome || ""} ${p.classificacao_nome || ""}`).includes(qq));
        return base.slice(0, 40);
    }, [produtos, query]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const selected = produtos.find((p) => p.id === valueId) || null;

    return (
        <Field label={label} hint={selected ? `Código: ${selected.codigo_barras || "sem código"}` : undefined}>
            <div ref={wrapRef} className="relative">
                <TextInput
                    value={query}
                    onFocus={() => setOpen(true)}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        onChangeId(0);
                        setOpen(true);
                    }}
                    placeholder={placeholder || "Busque por nome ou código"}
                />

                {open ? (
                    <div className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                        {list.length === 0 ? (
                            <div className="p-4 text-sm text-slate-500">Nenhum produto encontrado.</div>
                        ) : (
                            list.map((p) => {
                                const saldo = saldoTotalByProd.get(p.id) || 0;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            onChangeId(p.id);
                                            setQuery(p.nome);
                                            setOpen(false);
                                        }}
                                        className="flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50"
                                    >
                                        <div className="min-w-0">
                                            <div className="line-clamp-2 text-sm font-bold text-slate-900">{p.nome}</div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                {p.codigo_barras || "Sem código"}
                                                {p.categoria_nome ? ` • ${p.categoria_nome}` : ""}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div className="text-xs text-slate-500">Saldo total</div>
                                            <div className="text-sm font-bold text-slate-900">{fmtQtd(saldo)}</div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                ) : null}
            </div>
        </Field>
    );
}

function EmptyState({ title, text }: { title: string; text: string }) {
    return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <p className="text-sm font-bold text-slate-900">{title}</p>
            <p className="mt-1 text-sm leading-5 text-slate-600">{text}</p>
        </div>
    );
}

function RequestCard({
    row,
    statusOptions,
    onOpen,
    onCancel,
    onReceive,
}: {
    row: ReqListRow;
    statusOptions: StatusOption[];
    onOpen: (id: ID) => void;
    onCancel: (row: ReqListRow) => void;
    onReceive: (row: ReqListRow) => void;
}) {
    const status = String(row.status);
    const canCancel = status === "PENDENTE" || status === "EM_SEPARACAO";
    const canReceive = status === "EM_TRANSITO";
    const atrasada = Number(row.atrasada_24h || 0) === 1;

    return (
        <Card className="overflow-hidden">
            <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">{row.codigo || `REQ-${row.id}`}</h3>
                            <StatusBadge status={status} options={statusOptions} />
                            {atrasada ? <Pill className="bg-rose-50 text-rose-800 ring-1 ring-rose-200">+24h</Pill> : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Aberta em {fmtDateTime(row.criado_em)}</p>
                    </div>
                    <button type="button" onClick={() => onOpen(row.id)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">
                        Ver
                    </button>
                </div>

                <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="line-clamp-2 text-sm font-bold text-slate-900">{row.itens_resumo || "Itens não carregados"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                        {Number(row.total_itens || 0) || 1} item(ns), total solicitado: {fmtQtd(row.total_quantidade || 0)}
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <div>
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Destino</span>
                        <div className="font-bold text-slate-900">{destinoLabel(row)}</div>
                    </div>
                </div>

                {row.justificativa ? <p className="line-clamp-2 text-sm leading-5 text-slate-600">{row.justificativa}</p> : null}

                {status === "RECUSADA" && row.motivo_recusa ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{row.motivo_recusa}</div> : null}
                {status === "CANCELADA" && row.motivo_cancelamento ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{row.motivo_cancelamento}</div> : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                    {canReceive ? (
                        <Button type="button" onClick={() => onReceive(row)} className="w-full">
                            Confirmar recebimento
                        </Button>
                    ) : null}
                    {canCancel ? (
                        <Button type="button" variant="ghost" onClick={() => onCancel(row)} className="w-full">
                            Cancelar minha requisição
                        </Button>
                    ) : null}
                </div>
            </div>
        </Card>
    );
}

function DetailModal({
    open,
    row,
    statusOptions,
    onClose,
}: {
    open: boolean;
    row: ReqDetalhe | null;
    statusOptions: StatusOption[];
    onClose: () => void;
}) {
    return (
        <Modal open={open} title={row ? row.codigo || `REQ-${row.id}` : "Detalhes"} subtitle={row ? destinoLabel(row) : undefined} onClose={onClose}>
            {!row ? (
                <div className="p-4 text-sm text-slate-500">Carregando...</div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge status={String(row.status)} options={statusOptions} />
                        <Pill className="bg-slate-100 text-slate-700">{row.destino_tipo === "DEPOSITO" ? "Transferência" : "Saída"}</Pill>
                    </div>

                    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Solicitante</div>
                            <div className="font-bold text-slate-900">{row.solicitante_nome || "-"}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Criada em</div>
                            <div className="font-bold text-slate-900">{fmtDateTime(row.criado_em)}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Enviada em</div>
                            <div className="font-bold text-slate-900">{fmtDateTime(row.enviado_em)}</div>
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Recebida em</div>
                            <div className="font-bold text-slate-900">{fmtDateTime(row.recebido_em)}</div>
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-2 text-sm font-bold text-slate-900">Itens</h3>
                        <div className="space-y-2">
                            {row.items?.map((item) => (
                                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                                    <div className="text-sm font-bold text-slate-900">{item.produto_nome_snapshot}</div>
                                    <div className="mt-1 text-xs text-slate-500">Código: {item.codigo_barras_snapshot || "sem código"}</div>
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                                        <div className="rounded-2xl bg-slate-50 p-2">
                                            <div className="text-slate-500">Solicitada</div>
                                            <div className="font-bold text-slate-900">{fmtQtd(item.quantidade_solicitada)}</div>
                                        </div>
                                        <div className="rounded-2xl bg-slate-50 p-2">
                                            <div className="text-slate-500">Enviada</div>
                                            <div className="font-bold text-slate-900">{item.quantidade_enviada == null ? "-" : fmtQtd(item.quantidade_enviada)}</div>
                                        </div>
                                        <div className="rounded-2xl bg-slate-50 p-2">
                                            <div className="text-slate-500">Recebida</div>
                                            <div className="font-bold text-slate-900">{item.quantidade_recebida == null ? "-" : fmtQtd(item.quantidade_recebida)}</div>
                                        </div>
                                    </div>
                                    {item.observacao ? <p className="mt-2 text-sm text-slate-600">{item.observacao}</p> : null}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-2 text-sm font-bold text-slate-900">Linha do tempo</h3>
                        <div className="space-y-2">
                            {row.eventos?.length ? (
                                row.eventos.map((ev) => (
                                    <div key={ev.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-bold text-slate-900">{ev.evento.replace(/_/g, " ")}</div>
                                                <div className="text-xs text-slate-500">{ev.usuario_nome || `Usuário #${ev.usuario_id}`}</div>
                                            </div>
                                            <div className="shrink-0 text-right text-xs text-slate-500">{fmtDateTime(ev.criado_em)}</div>
                                        </div>
                                        {ev.observacao ? <p className="mt-2 text-sm text-slate-600">{ev.observacao}</p> : null}
                                    </div>
                                ))
                            ) : (
                                <EmptyState title="Sem eventos" text="A linha do tempo ainda não foi registrada." />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}

export default function RequisitarMateriaisPage() {
    const [me, setMe] = useState<Me | null>(null);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);
    const [statusOptions, setStatusOptions] = useState<StatusOption[]>(STATUS_FALLBACK);

    const [loadingInit, setLoadingInit] = useState(true);
    const [loadingRows, setLoadingRows] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");
    const [okMsg, setOkMsg] = useState("");

    const [view, setView] = useState<"NOVA" | "MINHAS">("NOVA");
    const [rows, setRows] = useState<ReqListRow[]>([]);
    const [filtroStatus, setFiltroStatus] = useState<string>("");
    const [filtroQ, setFiltroQ] = useState("");

    const [destinoDepositoId, setDestinoDepositoId] = useState<ID>(0);
    const [justificativaId, setJustificativaId] = useState<JustificativaId | "">("");

    const [produtoId, setProdutoId] = useState<ID>(0);
    const [produtoQuery, setProdutoQuery] = useState("");
    const [quantidade, setQuantidade] = useState("1");
    const [itemObs, setItemObs] = useState("");
    const [itens, setItens] = useState<ItemDraft[]>([]);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detail, setDetail] = useState<ReqDetalhe | null>(null);

    const saldoTotalByProd = useMemo(() => {
        const map = new Map<ID, number>();
        for (const s of saldos) {
            const pid = Number(s.produto_id || 0);
            if (!pid) continue;
            map.set(pid, (map.get(pid) || 0) + parseNum(s.quantidade));
        }
        return map;
    }, [saldos]);

    const produtoById = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

    const destinoTipo = useMemo(() => destinoTipoDaJustificativa(justificativaId), [justificativaId]);

    const justificativaSelecionada = useMemo(
        () => JUSTIFICATIVAS.find((j) => j.id === justificativaId) || null,
        [justificativaId]
    );

    const produtosFiltradosPorJustificativa = useMemo(
        () => produtos.filter((p) => produtoPermitidoPorJustificativa(p, justificativaId)),
        [produtos, justificativaId]
    );

    async function loadInit() {
        setLoadingInit(true);
        setErr("");

        try {
            const data = await apiGet<InitResp>({ action: "init" });
            if (!data.ok) throw new Error(data.msg || "Falha ao carregar dados iniciais.");

            setMe(data.me || null);
            setDepositos(data.depositos || []);
            setProdutos(data.produtos || []);
            setSaldos(data.saldos || []);
            setStatusOptions(data.status?.length ? data.status : STATUS_FALLBACK);
        } catch (e: any) {
            setErr(e?.message || "Não foi possível carregar a página.");
        } finally {
            setLoadingInit(false);
        }
    }

    async function loadMinhas() {
        setLoadingRows(true);
        setErr("");

        try {
            const data = await apiGet<ListResp>({
                action: "minhas",
                status: filtroStatus || undefined,
                q: filtroQ.trim() || undefined,
                limit: 80,
            });

            if (!data.ok) throw new Error(data.msg || "Falha ao carregar suas requisições.");
            setRows(data.rows || []);
        } catch (e: any) {
            setErr(e?.message || "Não foi possível carregar suas requisições.");
        } finally {
            setLoadingRows(false);
        }
    }

    useEffect(() => {
        loadInit();
    }, []);

    useEffect(() => {
        if (view !== "MINHAS") return;
        loadMinhas();
    }, [view]);

    function resetItemFields() {
        setProdutoId(0);
        setProdutoQuery("");
        setQuantidade("1");
        setItemObs("");
    }

    function handleJustificativaChange(next: JustificativaId | "") {
        if (next === justificativaId) return;

        setJustificativaId(next);
        setItens([]);
        resetItemFields();
    }

    function addItem() {
        setErr("");
        setOkMsg("");

        const produto = produtoById.get(produtoId) || null;
        const qtd = parseNum(quantidade);

        if (!produto) {
            setErr("Selecione um produto.");
            return;
        }

        if (qtd <= 0) {
            setErr("Informe uma quantidade maior que zero.");
            return;
        }

        if (!justificativaId) {
            setErr("Selecione a justificativa antes de adicionar produtos.");
            return;
        }

        if (!produtoPermitidoPorJustificativa(produto, justificativaId)) {
            setErr("Este produto não pertence à classificação permitida para a justificativa escolhida.");
            resetItemFields();
            return;
        }

        const exists = itens.some((i) => i.produto_id === produto.id);
        if (exists) {
            setErr("Este produto já está na requisição. Remova o item anterior ou escolha outro produto.");
            return;
        }

        setItens((prev) => [
            ...prev,
            {
                local_id: `${produto.id}-${Date.now()}`,
                produto_id: produto.id,
                produto_nome: produto.nome,
                codigo_barras: produto.codigo_barras || null,
                quantidade: quantidade.trim() || "1",
                observacao: itemObs.trim(),
            },
        ]);

        resetItemFields();
    }

    function removeItem(localId: string) {
        setItens((prev) => prev.filter((i) => i.local_id !== localId));
    }

    function validateForm() {
        if (!me) return "Sessão inválida. Recarregue a página.";
        if (!justificativaId) return "Selecione a justificativa.";
        if (!destinoDepositoId) return "Selecione o destino ou setor.";
        if (!itens.length) return "Inclua pelo menos um item.";

        const invalidItem = itens.find((i) => {
            const produto = produtoById.get(i.produto_id);
            return !produto || !produtoPermitidoPorJustificativa(produto, justificativaId);
        });

        if (invalidItem) return "Há item incompatível com a justificativa escolhida. Remova o item e selecione novamente.";

        return "";
    }

    async function submitReq() {
        setErr("");
        setOkMsg("");

        const validation = validateForm();
        if (validation) {
            setErr(validation);
            return;
        }

        setSaving(true);

        try {
            const destino = depositos.find((d) => Number(d.id) === Number(destinoDepositoId));
            const payload = {
                action: "criar",
                destino_tipo: destinoTipo,
                unidade_destino_id: destinoDepositoId,
                unidade_destino_texto: destinoTipo === "CONSUMO" ? (destino?.nome || "") : "",
                id_atendimento: "",
                justificativa: justificativaValor(justificativaId),
                itens: itens.map((i) => ({
                    produto_id: i.produto_id,
                    quantidade: i.quantidade,
                    observacao: i.observacao,
                })),
            };

            const data = await apiPost<MutResp>(payload);
            if (!data.ok) throw new Error(data.msg || "Não foi possível criar a requisição.");

            setOkMsg(`${data.codigo || "Requisição"} criada com sucesso.`);
            setItens([]);
            setJustificativaId("");
            setDestinoDepositoId(0);
            resetItemFields();
            setView("MINHAS");
            await loadMinhas();
        } catch (e: any) {
            setErr(e?.message || "Não foi possível criar a requisição.");
        } finally {
            setSaving(false);
        }
    }

    async function openDetail(id: ID) {
        setDetailOpen(true);
        setDetailLoading(true);
        setDetail(null);
        setErr("");

        try {
            const data = await apiGet<DetailResp>({ action: "detalhar", id });
            if (!data.ok || !data.row) throw new Error(data.msg || "Não foi possível abrir a requisição.");
            setDetail(data.row);
        } catch (e: any) {
            setErr(e?.message || "Não foi possível abrir a requisição.");
            setDetailOpen(false);
        } finally {
            setDetailLoading(false);
        }
    }

    async function cancelReq(row: ReqListRow) {
        const motivo = window.prompt(`Motivo do cancelamento de ${row.codigo || `REQ-${row.id}`}:`, "Cancelamento solicitado pelo usuário.");
        if (motivo === null) return;

        setErr("");
        setOkMsg("");

        try {
            const data = await apiPost<MutResp>({ action: "cancelar_minha", id: row.id, motivo });
            if (!data.ok) throw new Error(data.msg || "Não foi possível cancelar.");
            setOkMsg(data.msg || "Requisição cancelada.");
            await loadMinhas();
        } catch (e: any) {
            setErr(e?.message || "Não foi possível cancelar a requisição.");
        }
    }

    async function receiveReq(row: ReqListRow) {
        const ok = window.confirm(`Confirmar recebimento de ${row.codigo || `REQ-${row.id}`}?`);
        if (!ok) return;

        setErr("");
        setOkMsg("");

        try {
            const data = await apiPost<MutResp>({ action: "confirmar_recebimento", id: row.id });
            if (!data.ok) throw new Error(data.msg || "Não foi possível confirmar o recebimento.");
            setOkMsg(data.msg || "Recebimento confirmado.");
            await loadMinhas();
        } catch (e: any) {
            setErr(e?.message || "Não foi possível confirmar o recebimento.");
        }
    }

    const selectedProduto = produtoById.get(produtoId) || null;

    return (
        <main className="min-h-[100dvh] bg-gray-50 pb-[calc(2rem+env(safe-area-inset-bottom))] text-slate-900">
            <div className="mx-auto w-full max-w-5xl px-5 py-5">
                <header className="mb-5 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" className="text-sky-700">
                                <path d="M7 4h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" />
                                <path d="M8.5 9h7M8.5 13h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                <path d="M15 16h5M17.5 13.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                        </div>

                        <div className="min-w-0">
                            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">Solicitar Produto</h1>
                        </div>
                    </div>

                    {me ? (
                        <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-xs shadow-sm sm:block">
                            <div className="text-slate-500">Usuário</div>
                            <div className="font-bold text-slate-900">{me.nome || me.usuario || `#${me.id}`}</div>
                        </div>
                    ) : null}
                </header>

                <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                    <button
                        type="button"
                        onClick={() => setView("NOVA")}
                        className={[
                            "rounded-2xl px-3 py-3 text-sm font-bold transition",
                            view === "NOVA" ? "bg-slate-900 text-white shadow-sm" : "text-slate-700 hover:bg-slate-50",
                        ].join(" ")}
                    >
                        Nova requisição
                    </button>
                    <button
                        type="button"
                        onClick={() => setView("MINHAS")}
                        className={[
                            "rounded-2xl px-3 py-3 text-sm font-bold transition",
                            view === "MINHAS" ? "bg-slate-900 text-white shadow-sm" : "text-slate-700 hover:bg-slate-50",
                        ].join(" ")}
                    >
                        Minhas solicitações
                    </button>
                </div>

                {loadingInit ? (
                    <Card className="p-6 text-center text-sm text-slate-500">Carregando dados da requisição...</Card>
                ) : err ? (
                    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{err}</div>
                ) : null}

                {okMsg ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{okMsg}</div> : null}

                {view === "NOVA" ? (
                    <div className="space-y-4">
                        <Card className="overflow-hidden">
                            <div className="border-b border-slate-100 p-4">
                                <h2 className="text-base font-bold text-slate-900">Dados da solicitação</h2>
                            </div>

                            <div className="space-y-4 p-4">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Field label="Justificativa">
                                        <Select value={justificativaId} onChange={(e) => handleJustificativaChange(e.target.value as JustificativaId | "")}>
                                            <option value="">Selecione</option>
                                            {JUSTIFICATIVAS.map((j) => (
                                                <option key={j.id} value={j.id}>
                                                    {j.label}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Destino ou Setor">
                                        <Select value={destinoDepositoId} onChange={(e) => setDestinoDepositoId(Number(e.target.value))}>
                                            <option value={0}>Selecione</option>
                                            {depositos.map((d) => (
                                                <option key={d.id} value={d.id}>
                                                    {d.nome}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                </div>

                                {justificativaSelecionada ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
                                        Tipo definido automaticamente: <b>{justificativaSelecionada.destino_tipo === "DEPOSITO" ? "Transferência" : "Saída"}</b>
                                    </div>
                                ) : null}
                            </div>
                        </Card>

                        <Card className="overflow-visible">
                            <div className="border-b border-slate-100 p-4">
                                <h2 className="text-base font-bold text-slate-900">Produto</h2>
                            </div>

                            <div className="space-y-4 p-4">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
                                    <ProductCombobox
                                        label="Produto"
                                        produtos={produtosFiltradosPorJustificativa}
                                        valueId={produtoId}
                                        onChangeId={setProdutoId}
                                        query={produtoQuery}
                                        setQuery={setProdutoQuery}
                                        saldoTotalByProd={saldoTotalByProd}
                                    />

                                    <Field label="Quantidade">
                                        <TextInput value={quantidade} onChange={(e) => setQuantidade(clampQtdText(e.target.value))} inputMode="decimal" placeholder="1" />
                                    </Field>
                                </div>

                                {selectedProduto ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                        <div className="font-bold text-slate-900">{selectedProduto.nome}</div>
                                        <div className="mt-1 text-xs text-slate-500">Saldo total no sistema: {fmtQtd(saldoTotalByProd.get(selectedProduto.id) || 0)}</div>
                                    </div>
                                ) : null}

                                <Field label="Observação">
                                    <TextInput value={itemObs} onChange={(e) => setItemObs(e.target.value)} placeholder="Opcional" />
                                </Field>

                                <Button type="button" variant="soft" onClick={addItem} className="w-full sm:w-auto">
                                    Adicionar item
                                </Button>

                                {itens.length ? (
                                    <div className="space-y-2">
                                        {itens.map((item) => (
                                            <div key={item.local_id} className="rounded-2xl border border-slate-200 bg-white p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="line-clamp-2 text-sm font-bold text-slate-900">{item.produto_nome}</div>
                                                        <div className="mt-1 text-xs text-slate-500">
                                                            {item.codigo_barras || "Sem código"} • Qtd {fmtQtd(item.quantidade)}
                                                        </div>
                                                        {item.observacao ? <div className="mt-2 text-sm text-slate-600">{item.observacao}</div> : null}
                                                    </div>
                                                    <button type="button" onClick={() => removeItem(item.local_id)} className="rounded-2xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">
                                                        Remover
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState title="Nenhum item" text="Adicione o produto solicitado." />
                                )}
                            </div>
                        </Card>

                        <div className="sticky bottom-0 -mx-5 border-t border-slate-200 bg-gray-50/95 p-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
                            <Button type="button" onClick={submitReq} disabled={saving || loadingInit} className="w-full">
                                {saving ? "Enviando..." : "Enviar requisição"}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <Card className="p-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
                                <Field label="Status">
                                    <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                                        <option value="">Todos</option>
                                        {statusOptions.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.nome}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>

                                <Field label="Busca">
                                    <TextInput value={filtroQ} onChange={(e) => setFiltroQ(e.target.value)} placeholder="Produto, código ou destino" />
                                </Field>

                                <Button type="button" variant="soft" onClick={loadMinhas} disabled={loadingRows} className="w-full sm:w-auto">
                                    {loadingRows ? "Atualizando..." : "Atualizar"}
                                </Button>
                            </div>
                        </Card>

                        {loadingRows ? (
                            <Card className="p-6 text-center text-sm text-slate-500">Carregando suas solicitações...</Card>
                        ) : rows.length === 0 ? (
                            <EmptyState title="Nenhuma requisição" text="Não há registros para mostrar." />
                        ) : (
                            <div className="space-y-3">
                                {rows.map((row) => (
                                    <RequestCard key={row.id} row={row} statusOptions={statusOptions} onOpen={openDetail} onCancel={cancelReq} onReceive={receiveReq} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <DetailModal open={detailOpen} row={detailLoading ? null : detail} statusOptions={statusOptions} onClose={() => setDetailOpen(false)} />
        </main>
    );
}
