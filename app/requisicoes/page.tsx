"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type ID = number;

type StatusId = "PENDENTE" | "EM_SEPARACAO" | "EM_TRANSITO" | "ENTREGUE" | "CANCELADA" | "RECUSADA";

type Me = {
    id: ID;
    nome: string;
    usuario: string;
};

type Deposito = {
    id: ID;
    nome: string;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number | string;
    minimo?: number | string;
    maximo?: number | string;
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

type ReqDetail = ReqListRow & {
    items?: ReqItem[];
    solicitante_usuario?: string | null;
    separado_por_nome?: string | null;
    enviado_por_nome?: string | null;
    recebido_por_nome?: string | null;
    recusado_por_nome?: string | null;
    cancelado_por_nome?: string | null;
};

type InitResp = {
    ok: boolean;
    me?: Me;
    depositos?: Deposito[];
    saldos?: Saldo[];
    msg?: string;
    need_login?: 1;
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

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/requisicoes.php`;

// A tela mostra somente requisições em andamento.
// ENTREGUE, RECUSADA e CANCELADA não aparecem aqui.
const STATUS_FILA = "PENDENTE,EM_SEPARACAO,EM_TRANSITO";

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

function numberBR(v: unknown, decimals = 3) {
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    }).format(asNumber(v));
}

function decimalToApi(v: string | number | null | undefined) {
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "danger" }) {
    const base =
        "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-[15px] font-bold shadow-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50";

    const cls =
        variant === "danger"
            ? "border border-rose-700 bg-rose-700 text-white hover:bg-rose-800"
            : variant === "ghost"
                ? "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                : "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-700">{label}</span>
            {children}
        </label>
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

function Badge({ status }: { status: unknown }) {
    return <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold", statusClass(status)].join(" ")}>{statusLabel(status)}</span>;
}

function Modal({
    open,
    title,
    onClose,
    children,
    maxWidth = "max-w-xl",
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
                    <h2 className="truncate text-lg font-black text-slate-900">{title}</h2>
                    <button className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" type="button" onClick={onClose} aria-label="Fechar">
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <Card className="p-6 text-center">
            <h3 className="font-black text-slate-900">Nenhuma requisição em andamento</h3>
            <p className="mt-1 text-sm text-slate-600">Quando uma requisição for concluída, recusada ou cancelada, ela sai automaticamente desta tela.</p>
        </Card>
    );
}

export default function OperarRequisicoesPage() {
    const [me, setMe] = useState<Me | null>(null);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);
    const [rows, setRows] = useState<ReqListRow[]>([]);

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [okMsg, setOkMsg] = useState("");

    const [sendOpen, setSendOpen] = useState(false);
    const [sendReq, setSendReq] = useState<ReqDetail | null>(null);
    const [sendDepositoId, setSendDepositoId] = useState<number>(0);
    const [sendObs, setSendObs] = useState("");

    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReq, setRejectReq] = useState<ReqListRow | null>(null);
    const [rejectReason, setRejectReason] = useState("");

    const saldoMap = useMemo(() => {
        const map = new Map<string, number>();

        for (const s of saldos) {
            map.set(`${Number(s.produto_id)}:${Number(s.deposito_id)}`, asNumber(s.quantidade));
        }

        return map;
    }, [saldos]);

    const loadInit = useCallback(async () => {
        const data = await apiGet<InitResp>({ action: "init" });

        if (!data.ok) throw new Error(data.msg || "Não foi possível carregar a tela.");

        setMe(data.me || null);
        setDepositos(data.depositos || []);
        setSaldos(data.saldos || []);
    }, []);

    const loadRows = useCallback(async () => {
        const data = await apiGet<ListResp>({
            action: "fila",
            status: STATUS_FILA,
            limit: 200,
        });

        if (!data.ok) throw new Error(data.msg || "Não foi possível carregar as requisições.");

        setRows(data.rows || []);
    }, []);

    const refreshAll = useCallback(async () => {
        setLoading(true);
        setError("");

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

    async function startSeparation(row: ReqListRow) {
        if (busy) return;

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiPost<ActionResp>({ action: "iniciar_separacao", id: row.id });

            if (!data.ok) throw new Error(data.msg || "Não foi possível iniciar a separação.");

            await refreshAfterAction(data.msg || "Separação iniciada. Próximo passo: enviar.");
        } catch (e: any) {
            setError(e?.message || "Erro ao iniciar separação.");
        } finally {
            setBusy(false);
        }
    }

    async function prepareSend(row: ReqListRow) {
        if (busy) return;

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiGet<DetailResp>({ action: "detalhar", id: row.id });

            if (!data.ok || !data.row) throw new Error(data.msg || "Não foi possível carregar os itens da requisição.");

            setSendReq(data.row);
            setSendDepositoId(Number(data.row.deposito_origem_id || (depositos.length === 1 ? depositos[0].id : 0)));
            setSendObs("");
            setSendOpen(true);
        } catch (e: any) {
            setError(e?.message || "Erro ao preparar envio.");
        } finally {
            setBusy(false);
        }
    }

    const sendValidation = useMemo(() => {
        if (!sendReq) return { ok: false, msg: "Requisição não carregada." };
        if (!sendReq.items?.length) return { ok: false, msg: "Requisição sem itens." };
        if (!sendDepositoId) return { ok: false, msg: "Selecione o depósito de origem." };

        for (const item of sendReq.items) {
            const qtd = asNumber(item.quantidade_solicitada);
            const disponivel = saldoMap.get(`${Number(item.produto_id)}:${sendDepositoId}`) || 0;
            const nome = item.produto_nome_snapshot || item.produto_nome_atual || `Produto #${item.produto_id}`;

            if (qtd <= 0) return { ok: false, msg: `Quantidade inválida para ${nome}.` };
            if (qtd - 0.0001 > disponivel) return { ok: false, msg: `Saldo insuficiente para ${nome}.` };
        }

        return { ok: true, msg: "Pronto para enviar." };
    }, [saldoMap, sendDepositoId, sendReq]);

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
                itens: (sendReq.items || []).map((it) => ({
                    id: it.id,
                    quantidade_enviada: decimalToApi(it.quantidade_solicitada),
                })),
            });

            if (!data.ok) throw new Error(data.msg || "Não foi possível enviar o material.");

            setSendOpen(false);
            setSendReq(null);
            setSendObs("");
            await refreshAfterAction(data.msg || "Material enviado. Próximo passo: concluir.");
        } catch (e: any) {
            setError(e?.message || "Erro ao enviar material.");
        } finally {
            setBusy(false);
        }
    }

    async function finishRequest(row: ReqListRow) {
        if (busy) return;

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const detailResp = await apiGet<DetailResp>({ action: "detalhar", id: row.id });
            const detail = detailResp.ok ? detailResp.row : null;

            const data = await apiPost<ActionResp>({
                action: "confirmar_recebimento",
                id: row.id,
                itens: (detail?.items || []).map((it) => ({
                    id: it.id,
                    quantidade_recebida: decimalToApi(it.quantidade_enviada || it.quantidade_solicitada),
                })),
            });

            if (!data.ok) throw new Error(data.msg || "Não foi possível concluir a requisição.");

            await refreshAfterAction(data.msg || "Requisição concluída.");
        } catch (e: any) {
            setError(e?.message || "Erro ao concluir requisição.");
        } finally {
            setBusy(false);
        }
    }

    function openReject(row: ReqListRow) {
        setRejectReq(row);
        setRejectReason("");
        setRejectOpen(true);
        setError("");
        setOkMsg("");
    }

    async function confirmReject() {
        if (!rejectReq || busy) return;

        if (!rejectReason.trim()) {
            setError("Informe o motivo da recusa.");
            return;
        }

        setBusy(true);
        setError("");
        setOkMsg("");

        try {
            const data = await apiPost<ActionResp>({
                action: "recusar",
                id: rejectReq.id,
                motivo: rejectReason.trim(),
            });

            if (!data.ok) throw new Error(data.msg || "Não foi possível recusar a requisição.");

            setRejectOpen(false);
            setRejectReq(null);
            setRejectReason("");
            await refreshAfterAction(data.msg || "Requisição recusada.");
        } catch (e: any) {
            setError(e?.message || "Erro ao recusar requisição.");
        } finally {
            setBusy(false);
        }
    }

    async function handleMainAction(row: ReqListRow) {
        const status = toStatus(row.status);

        if (status === "PENDENTE") {
            await startSeparation(row);
            return;
        }

        if (status === "EM_SEPARACAO") {
            await prepareSend(row);
            return;
        }

        if (status === "EM_TRANSITO") {
            await finishRequest(row);
        }
    }

    return (
        <main className="min-h-[100dvh] bg-gray-50 px-3 py-4 text-slate-900 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-5xl space-y-4">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-slate-950">Requisições</h1>
                        <p className="mt-1 text-sm text-slate-600">Somente requisições em andamento aparecem nesta tela.</p>
                        {me ? <p className="mt-1 text-xs text-slate-500">Operador: {me.nome || me.usuario}</p> : null}
                    </div>

                    <Button type="button" variant="ghost" onClick={refreshAll} disabled={loading || busy}>
                        Atualizar
                    </Button>
                </header>

                {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div> : null}
                {okMsg ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{okMsg}</div> : null}

                {loading ? (
                    <Card className="p-6 text-center text-sm font-bold text-slate-600">Carregando...</Card>
                ) : rows.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="space-y-3">
                        {rows.map((row) => (
                            <RequestCard
                                key={row.id}
                                row={row}
                                busy={busy}
                                onMain={() => handleMainAction(row)}
                                onReject={() => openReject(row)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <Modal open={sendOpen} title={sendReq ? `Enviar ${reqCode(sendReq)}` : "Enviar requisição"} onClose={() => setSendOpen(false)} maxWidth="max-w-2xl">
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
                        {(sendReq?.items || []).map((item) => {
                            const qtd = asNumber(item.quantidade_solicitada);
                            const disponivel = sendDepositoId ? saldoMap.get(`${Number(item.produto_id)}:${sendDepositoId}`) || 0 : 0;
                            const invalid = sendDepositoId > 0 && qtd - 0.0001 > disponivel;

                            return (
                                <div key={item.id} className={["rounded-2xl border p-3", invalid ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"].join(" ")}>
                                    <p className="font-bold text-slate-900">{item.produto_nome_snapshot || item.produto_nome_atual || `Produto #${item.produto_id}`}</p>
                                    <p className="mt-1 text-xs text-slate-600">
                                        Solicitado: <b>{numberBR(item.quantidade_solicitada)}</b> | Disponível: <b>{numberBR(disponivel)}</b>
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <Field label="Observação, opcional">
                        <TextArea rows={3} value={sendObs} onChange={(e) => setSendObs(e.target.value)} />
                    </Field>

                    <div className={["rounded-2xl border p-3 text-sm font-bold", sendValidation.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"].join(" ")}>
                        {sendValidation.msg}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button type="button" onClick={confirmSend} disabled={busy || !sendValidation.ok}>
                            Enviar
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setSendOpen(false)}>
                            Voltar
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal open={rejectOpen} title={rejectReq ? `Recusar ${reqCode(rejectReq)}` : "Recusar requisição"} onClose={() => setRejectOpen(false)}>
                <div className="space-y-4">
                    <Field label="Motivo da recusa obrigatório">
                        <TextArea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Digite o motivo da recusa..." />
                    </Field>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button type="button" variant="danger" onClick={confirmReject} disabled={busy || !rejectReason.trim()}>
                            Confirmar recusa
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setRejectOpen(false)}>
                            Voltar
                        </Button>
                    </div>
                </div>
            </Modal>
        </main>
    );
}

function RequestCard({ row, busy, onMain, onReject }: { row: ReqListRow; busy: boolean; onMain: () => void; onReject: () => void }) {
    const status = toStatus(row.status);
    const canReject = status === "PENDENTE" || status === "EM_SEPARACAO";

    const mainLabel = status === "PENDENTE" ? "Iniciar" : status === "EM_SEPARACAO" ? "Enviar" : status === "EM_TRANSITO" ? "Concluir" : "Finalizada";
    const nextText = status === "PENDENTE" ? "Próximo passo: enviar" : status === "EM_SEPARACAO" ? "Próximo passo: concluir" : status === "EM_TRANSITO" ? "Ao concluir, sai da tela" : "";

    return (
        <Card className={isTruthy(row.atrasada_24h) ? "border-rose-200" : ""}>
            <div className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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

                        {nextText ? <p className="mt-2 text-xs font-bold text-slate-500">{nextText}</p> : null}
                    </div>

                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-64">
                        <Button type="button" onClick={onMain} disabled={busy || status === "ENTREGUE" || status === "RECUSADA" || status === "CANCELADA"}>
                            {mainLabel}
                        </Button>
                        <Button type="button" variant="danger" onClick={onReject} disabled={busy || !canReject} title={!canReject ? "Só é possível recusar pendente ou em separação." : undefined}>
                            Recusar
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
}
