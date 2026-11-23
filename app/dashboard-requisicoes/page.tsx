"use client";

/**
 * Requisições (23/11/2026): o antigo Dashboard Requisições e a tela Separar (/requisicoes) viraram uma tela só.
 * Em cima, a fila em andamento por etapa (Para iniciar · Para enviar · Aguardando recebimento), com o solicitante
 * em destaque e as ações de separar, enviar e recusar. Embaixo, o Histórico do período (filtros, CSV, detalhes).
 * O /requisicoes redireciona para cá. As ações dashboard_* continuam exigindo a chave dashboard-requisicoes no servidor.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconDownload, IconFilter, IconRefresh, IconSearch, IconX } from "@tabler/icons-react";
import ItensTabela from "@/components/requisicoes/ItensTabela";
import { FaixaAtualizando, gravarCacheTela, lerCacheTela, travaToques } from "@/lib/cacheTela";

type ID = number;

type StatusId = "PENDENTE" | "EM_SEPARACAO" | "EM_TRANSITO" | "ENTREGUE" | "CANCELADA" | "RECUSADA";

type Me = { id: ID; nome: string; usuario: string };
type Usuario = { id: ID; nome: string; usuario: string };
type Deposito = { id: ID; nome: string };

type Produto = {
    id: ID;
    nome: string;
    codigo_barras?: string | null;
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

type StatusOption = { id: StatusId; nome: string };

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
    saldos?: Saldo[];
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
    atrasada_24h?: 0 | 1 | number | string | boolean;
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
    deposito_origem_id?: ID | null;
    deposito_origem_nome?: string | null;
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

type ListResp = { ok: boolean; rows?: ReqListRow[]; msg?: string; need_login?: 1; sem_acesso?: number };
type SummaryResp = { ok: boolean; data?: DashboardData; msg?: string; need_login?: 1; sem_acesso?: number };
type DetailResp = { ok: boolean; row?: ReqDetail; msg?: string; need_login?: 1 };
type ActionResp = { ok: boolean; msg?: string; row?: ReqDetail; need_login?: 1 };

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

/** Fila em andamento (não depende dos filtros do Histórico). */
const STATUS_FILA = "PENDENTE,EM_SEPARACAO,EM_TRANSITO";

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

/** Etapas da fila, na ordem do trabalho. */
type EtapaId = "PENDENTE" | "EM_SEPARACAO" | "EM_TRANSITO";
const ETAPAS: Array<{ id: EtapaId; nome: string; dica: string }> = [
    { id: "PENDENTE", nome: "Para iniciar", dica: "Escolher a origem e separar" },
    { id: "EM_SEPARACAO", nome: "Para enviar", dica: "Separado, falta enviar" },
    { id: "EM_TRANSITO", nome: "Aguardando recebimento", dica: "O solicitante confirma ao receber" },
];

/* ------------------------------------------------------------------ */
/* Funções                                                             */
/* ------------------------------------------------------------------ */

function toStatus(v: unknown): StatusId {
    const s = String(v || "").toUpperCase();
    if (s === "PENDENTE" || s === "EM_SEPARACAO" || s === "EM_TRANSITO" || s === "ENTREGUE" || s === "CANCELADA" || s === "RECUSADA") return s;
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
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(asNumber(v));
}

function decimalToApi(v: string | number | null | undefined) {
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "0";
    const raw = String(v ?? "0").trim();
    if (!raw) return "0";
    if (raw.includes(",")) return raw.replace(/\./g, "").replace(",", ".");
    return raw.replace(/[^0-9.\-]/g, "");
}

function isTruthy(v: unknown) {
    return v === 1 || v === "1" || v === true || String(v).toLowerCase() === "true";
}

function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStartIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function initialFilters(): Filters {
    return { de: monthStartIso(), ate: todayIso(), status: "", q: "", solicitante_id: "", unidade_destino_id: "", deposito_origem_id: "", produto_id: "", id_atendimento: "", atrasadas: false };
}

function emptyFilters(): Filters {
    return { de: "", ate: "", status: "", q: "", solicitante_id: "", unidade_destino_id: "", deposito_origem_id: "", produto_id: "", id_atendimento: "", atrasadas: false };
}

function dataDe(v?: string | null) {
    if (!v) return null;
    const d = new Date(String(v).includes("T") ? String(v) : String(v).replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateTime(v?: string | null) {
    if (!v) return "";
    const d = dataDe(v);
    if (!d) return String(v);
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}

function dataBR(v?: string | null) {
    const d = dataDe(v);
    if (!d) return "";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
}

/** "há 25 min", "há 3 h", "há 2 dias". */
function haQuanto(v?: string | null) {
    const d = dataDe(v);
    if (!d) return "";
    const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 48) return `há ${h} h`;
    return `há ${Math.floor(h / 24)} dias`;
}

/** Desde quando a requisição está na etapa atual. */
function desdeDaEtapa(row: ReqListRow) {
    const st = toStatus(row.status);
    if (st === "EM_TRANSITO") return row.enviado_em || row.criado_em;
    if (st === "EM_SEPARACAO") return row.separado_em || row.criado_em;
    return row.criado_em;
}

function textoTempo(row: ReqListRow) {
    const st = toStatus(row.status);
    const ha = haQuanto(desdeDaEtapa(row));
    if (!ha) return "";
    if (st === "EM_TRANSITO") return `enviada ${ha}`;
    if (st === "EM_SEPARACAO") return `separando ${ha}`;
    return `aberta ${ha}`;
}

function destinoLabel(row: ReqListRow | ReqDetail | null | undefined) {
    if (!row) return "-";
    return row.unidade_destino_nome || row.unidade_destino_texto || "Destino não informado";
}

function destinationDepositId(row?: ReqListRow | ReqDetail | null) {
    if (!row) return 0;
    if (String(row.destino_tipo || "").trim().toUpperCase() !== "DEPOSITO") return 0;
    const id = Number(row.unidade_destino_id || 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
}

function codigoReq(row?: Pick<ReqListRow, "id" | "codigo"> | null) {
    if (!row) return "REQ";
    return row.codigo || `REQ-${row.id}`;
}

function ehAutomatica(row: ReqListRow) {
    return /autom[aá]tica/i.test(String(row.solicitante_nome || ""));
}

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);
const SUFIXOS = new Set(["jr", "jr.", "junior", "júnior", "filho", "neto", "sobrinho"]);

/** Nome como o sistema mostra: primeiro nome + último sobrenome, só a primeira letra maiúscula. */
function nomeCurto(nome?: string | null) {
    const bruto = String(nome || "").trim().replace(/\s+/g, " ");
    if (!bruto) return "Não informado";
    const partes = bruto
        .toLowerCase()
        .split(" ")
        .map((p, i) => (i > 0 && LIGACOES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)));
    if (/autom[aá]tica/i.test(bruto)) return partes.join(" ");
    const reais = partes.filter((p, i) => i === 0 || !LIGACOES.has(p.toLowerCase()));
    if (reais.length <= 2) return reais.join(" ");
    const ultimo = reais[reais.length - 1];
    if (SUFIXOS.has(ultimo.toLowerCase()) && reais.length >= 3) return `${reais[0]} ${reais[reais.length - 2]} ${ultimo}`;
    return `${reais[0]} ${ultimo}`;
}

function iniciais(nome: string) {
    return nome
        .split(" ")
        .filter((p) => p && !LIGACOES.has(p.toLowerCase()))
        .slice(0, 2)
        .map((p) => p.charAt(0))
        .join("")
        .toUpperCase();
}

/** Ordem da fila: atrasadas, depois com atendimento ligado, depois as mais antigas na etapa. */
function ordenarFila(a: ReqListRow, b: ReqListRow) {
    const la = isTruthy(a.atrasada_24h) ? 1 : 0;
    const lb = isTruthy(b.atrasada_24h) ? 1 : 0;
    if (la !== lb) return lb - la;
    const aa = a.id_atendimento ? 1 : 0;
    const ab = b.id_atendimento ? 1 : 0;
    if (aa !== ab) return ab - aa;
    return (dataDe(desdeDaEtapa(a))?.getTime() || 0) - (dataDe(desdeDaEtapa(b))?.getTime() || 0);
}

function compactEventName(v: string) {
    const s = String(v || "").replace(/_/g, " ").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Resposta inesperada (${ct || "sem content-type"}). ${txt ? txt.slice(0, 180) : ""}`.trim());
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
    const r = await fetch(buildUrl(action, filters, extra).toString(), { method: "GET", cache: "no-store", credentials: "include" });
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
    return safeJson<T>(r);
}

/* ------------------------------------------------------------------ */
/* Peças visuais                                                       */
/* ------------------------------------------------------------------ */

const FIELD_CLS =
    "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-70 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]";

const LABEL_CLS = "mb-2 block text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";
const TH_CLS = "px-3 py-3 text-left text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";
const SEC_TITLE = "mb-2 text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";
const CINZA = "text-[#5B6478] dark:text-[#AEB9CF]";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]", className].join(" ")}>{children}</section>;
}

function Button({
    children,
    variant = "ghost",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "danger" }) {
    const base =
        "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-[18px] text-[15px] font-bold outline-none transition focus:ring-2 focus:ring-[#3D6A99]/20 disabled:cursor-not-allowed disabled:opacity-45";
    const cls =
        variant === "solid"
            ? "border-[1.5px] border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]"
            : variant === "danger"
              ? "border-[1.5px] border-[#B42318] bg-white text-[#B42318] hover:bg-[#FDECEA] dark:border-[#FF9C92] dark:bg-[#232B3F] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15"
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
            {hint ? <span className={["mt-1 block text-[12.5px]", CINZA].join(" ")}>{hint}</span> : null}
        </label>
    );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input {...props} className={[FIELD_CLS, props.className || ""].join(" ")} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props} className={[FIELD_CLS, props.className || ""].join(" ")} />;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea {...props} className={[FIELD_CLS, "h-auto resize-y py-3", props.className || ""].join(" ")} />;
}

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <span className={["inline-flex h-[24px] items-center whitespace-nowrap rounded-full border-[1.5px] px-2.5 text-[12.5px] font-extrabold", className].join(" ")}>{children}</span>;
}

/** Alerta de atraso: amarelo sempre com texto #313C55. */
function LatePill({ children }: { children: React.ReactNode }) {
    return <span className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full bg-[#F2CB3F] px-2 text-xs font-extrabold text-[#313C55]">{children}</span>;
}

function CountBadge({ n }: { n: number }) {
    return <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#F2CB3F] px-1.5 text-xs font-extrabold text-[#313C55]">{n}</span>;
}

/** Janelas abertas direto no <body> (no iPhone a barra de baixo ficava por cima). */
function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => {
        setMontado(true);
    }, []);
    return montado ? createPortal(children, document.body) : null;
}

/** Janela: diálogo centralizado no computador, folha que sobe de baixo no celular. Esc fecha. */
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
    subtitle?: React.ReactNode;
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
                            {subtitle ? <p className={["mt-0.5 text-[13px] lg:mt-1 lg:text-sm", CINZA].join(" ")}>{subtitle}</p> : null}
                        </div>
                        <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/[0.08]" aria-label="Fechar">
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

function FilterChip({ children, onClear }: { children: React.ReactNode; onClear?: () => void }) {
    return (
        <span className={["inline-flex h-8 items-center gap-1 rounded-full bg-[#EEF2F7] text-[13px] font-bold text-[#313C55] dark:bg-white/[0.08] dark:text-white", onClear ? "pl-3.5 pr-1" : "px-3.5"].join(" ")}>
            {children}
            {onClear ? (
                <button type="button" onClick={onClear} aria-label="Remover filtro" className="relative grid size-7 place-items-center rounded-full hover:bg-black/5 after:absolute after:-inset-2 after:content-[''] dark:hover:bg-white/10">
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
            .filter((p) => `${p.nome} ${p.codigo_barras || ""} ${p.categoria_nome || ""} ${p.classificacao_nome || ""}`.toLowerCase().includes(qq))
            .slice(0, 120);
    }, [produtos, q]);

    return (
        <div className="space-y-2">
            <div className="relative">
                <IconSearch size={20} stroke={1.8} aria-hidden="true" className={["pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2", CINZA].join(" ")} />
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

/* ------------------------------------------------------------------ */
/* Cartão da fila: o solicitante em destaque                           */
/* ------------------------------------------------------------------ */

function CartaoFila({
    row,
    busy,
    onMain,
    onReject,
    onDetalhe,
}: {
    row: ReqListRow;
    busy: boolean;
    onMain: () => void;
    onReject: () => void;
    onDetalhe: () => void;
}) {
    const status = toStatus(row.status);
    const late = isTruthy(row.atrasada_24h);
    const auto = ehAutomatica(row);
    const nome = nomeCurto(row.solicitante_nome);
    const tempo = textoTempo(row);

    return (
        <article
            className={[
                "rounded-2xl border p-3.5 text-[#313C55] dark:text-white",
                late ? "border-[#F2CB3F] bg-[#FFFBEA] dark:bg-[#F2CB3F]/[0.10]" : "border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]",
            ].join(" ")}
        >
            <div className="flex items-center gap-3">
                {auto ? (
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#E9EFF6] text-[11px] font-extrabold text-[#3D6A99] dark:bg-[#3D6A99]/30 dark:text-white">AUTO</span>
                ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#313C55] text-sm font-extrabold text-white dark:bg-[#3D6A99]">{iniciais(nome)}</span>
                )}
                <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 break-words text-[16px] font-extrabold leading-tight">{nome}</div>
                    <div className={["text-[13px]", CINZA].join(" ")}>
                        para <b className="text-[#313C55] dark:text-white">{destinoLabel(row)}</b>
                    </div>
                </div>
                {late ? <LatePill>+24h</LatePill> : null}
            </div>

            <ItensTabela resumo={row.itens_resumo} vazio="Itens não carregados" className="mt-2.5" />

            <div className={["mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]", CINZA].join(" ")}>
                {tempo ? <span>{tempo}</span> : null}
                {row.id_atendimento ? (
                    <span className="rounded-md bg-[#E9EFF6] px-1.5 font-extrabold text-[#313C55] dark:bg-[#3D6A99]/30 dark:text-white">Atendimento {row.id_atendimento}</span>
                ) : null}
                {row.deposito_origem_nome ? <span>sai de {row.deposito_origem_nome}</span> : null}
                <button type="button" onClick={onDetalhe} className="ml-auto min-h-[32px] rounded-lg px-1.5 font-bold underline-offset-2 hover:underline" aria-label={`Ver detalhes de ${codigoReq(row)}`}>
                    {codigoReq(row)}
                </button>
            </div>

            {status === "EM_TRANSITO" ? (
                <div className={["mt-3 rounded-xl bg-[#F6F8FB] px-3 py-2.5 text-[13px] font-bold dark:bg-[#1C2334]", CINZA].join(" ")}>
                    {auto ? "Aguardando a confirmação do recebimento" : `Aguardando ${nome.split(" ")[0]} confirmar o recebimento`}
                </div>
            ) : (
                <div className="mt-3 flex gap-2">
                    <Button type="button" variant="solid" onClick={onMain} disabled={busy} className="flex-1 !px-3">
                        {status === "PENDENTE" ? "Iniciar separação" : "Enviar"}
                    </Button>
                    <Button type="button" variant="danger" onClick={onReject} disabled={busy} className="!px-4">
                        Recusar
                    </Button>
                </div>
            )}
        </article>
    );
}

/* ------------------------------------------------------------------ */
/* Detalhes (itens e linha do tempo)                                   */
/* ------------------------------------------------------------------ */

function DetailInfo({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <div className={["text-[11px] font-extrabold uppercase tracking-[.08em]", CINZA].join(" ")}>{label}</div>
            <div className="break-words font-extrabold">{children}</div>
        </div>
    );
}

function DetailModal({ detail, loading, onClose }: { detail: ReqDetail | null; loading: boolean; onClose: () => void }) {
    return (
        <Modal
            open={!!detail || loading}
            title={detail ? nomeCurto(detail.solicitante_nome) : "Carregando requisição"}
            subtitle={detail ? `${codigoReq(detail)} · para ${destinoLabel(detail)}` : undefined}
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
                        <DetailInfo label="Solicitante">{nomeCurto(detail.solicitante_nome)}</DetailInfo>
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
                                            <span className={["whitespace-nowrap text-[13px]", CINZA].join(" ")}>
                                                Qtd <b className="text-[15px] text-[#313C55] dark:text-white">{numberBR(item.quantidade_solicitada, 3)}</b>
                                            </span>
                                        </div>
                                        {extras.length ? <div className={["mt-0.5 text-xs", CINZA].join(" ")}>{extras.join(" · ")}</div> : null}
                                        {item.observacao ? <div className={["mt-0.5 text-xs", CINZA].join(" ")}>Obs.: {item.observacao}</div> : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <h3 className={SEC_TITLE}>Linha do tempo</h3>
                        <div className="flex flex-col gap-2">
                            {(detail.eventos || []).length === 0 ? (
                                <div className={["rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 text-sm dark:border-white/[0.12]", CINZA].join(" ")}>Nenhum evento registrado.</div>
                            ) : (
                                (detail.eventos || []).map((ev) => (
                                    <div key={ev.id} className="flex gap-3 rounded-xl border border-[#E3E8F0] px-3.5 py-2.5 dark:border-white/[0.12]">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-extrabold">{compactEventName(ev.evento)}</div>
                                            <div className={["text-[12.5px]", CINZA].join(" ")}>
                                                {ev.usuario_nome ? nomeCurto(ev.usuario_nome) : ev.usuario_login || `Usuário #${ev.usuario_id}`}
                                                {ev.status_de || ev.status_para ? ` | ${ev.status_de ? statusLabel(ev.status_de) : ""} para ${ev.status_para ? statusLabel(ev.status_para) : ""}` : ""}
                                            </div>
                                            {ev.observacao ? <div className="mt-1 text-[13px]">{ev.observacao}</div> : null}
                                        </div>
                                        <div className={["whitespace-nowrap text-right text-[12.5px]", CINZA].join(" ")}>{fmtDateTime(ev.criado_em)}</div>
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

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export default function RequisicoesPage() {
    // Dados de base (init): usuários, depósitos, produtos e saldos.
    const [, setMe] = useState<Me | null>(null);
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);

    // Fila em andamento.
    const [fila, setFila] = useState<ReqListRow[]>([]);
    const [loadingFila, setLoadingFila] = useState(true);
    const [aba, setAba] = useState<EtapaId>("PENDENTE"); // celular: etapa mostrada
    const [desatualizado, setDesatualizado] = useState(false);
    const mostrandoCopiaRef = useRef(false);

    // Histórico (ações dashboard_*).
    const [filters, setFilters] = useState<Filters>(() => initialFilters());
    const [appliedFilters, setAppliedFilters] = useState<Filters>(() => initialFilters());
    const [rows, setRows] = useState<ReqListRow[]>([]);
    const [summary, setSummary] = useState<DashboardData>({});
    const [limit, setLimit] = useState(100);
    const [offset, setOffset] = useState(0);
    const [loadingHist, setLoadingHist] = useState(true);
    const [semAcesso, setSemAcesso] = useState(false); // sem a chave dashboard-requisicoes: some só o Histórico
    const [filterOpen, setFilterOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const histRef = useRef<HTMLElement | null>(null);

    // Mensagens e ações.
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const [okMsg, setOkMsg] = useState("");
    const [detail, setDetail] = useState<ReqDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Janela de separação.
    const [separationOpen, setSeparationOpen] = useState(false);
    const [separationReq, setSeparationReq] = useState<ReqDetail | null>(null);
    const [separationOrigens, setSeparationOrigens] = useState<Record<number, number>>({});
    const [separationObs, setSeparationObs] = useState("");

    // Janela de envio.
    const [sendOpen, setSendOpen] = useState(false);
    const [sendReq, setSendReq] = useState<ReqDetail | null>(null);
    const [sendOrigens, setSendOrigens] = useState<Record<number, number>>({});
    const [sendObs, setSendObs] = useState("");

    // Janela de recusa.
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectReq, setRejectReq] = useState<ReqListRow | null>(null);
    const [rejectReason, setRejectReason] = useState("");

    const saldoMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const s of saldos) map.set(`${Number(s.produto_id)}:${Number(s.deposito_id)}`, asNumber(s.quantidade));
        return map;
    }, [saldos]);

    const filaPorEtapa = useMemo(() => {
        const g: Record<EtapaId, ReqListRow[]> = { PENDENTE: [], EM_SEPARACAO: [], EM_TRANSITO: [] };
        for (const r of fila) {
            const st = toStatus(r.status);
            if (st === "PENDENTE" || st === "EM_SEPARACAO" || st === "EM_TRANSITO") g[st].push(r);
        }
        (Object.keys(g) as EtapaId[]).forEach((k) => g[k].sort(ordenarFila));
        return g;
    }, [fila]);

    const nAtrasadas = useMemo(() => fila.filter((r) => isTruthy(r.atrasada_24h)).length, [fila]);

    /* ---------- carregamento ---------- */

    const loadInit = useCallback(async () => {
        const data = await apiGet<InitResp>("init", {}, { limit: 30 });
        if (!data.ok) throw new Error(data.msg || "Não foi possível carregar a tela.");
        setMe(data.me || null);
        setUsuarios(data.usuarios || []);
        setDepositos(data.depositos || []);
        setProdutos(data.produtos || []);
        setSaldos(data.saldos || []);
        gravarCacheTela("requisicoes_init", data);
    }, []);

    const loadFila = useCallback(async () => {
        const data = await apiGet<ListResp>("fila", {}, { status: STATUS_FILA, limit: 200 });
        if (!data.ok) throw new Error(data.msg || "Não foi possível carregar as requisições.");
        setFila(data.rows || []);
        gravarCacheTela("requisicoes_fila", data.rows || []);
    }, []);

    const loadHistorico = useCallback(async (f: Filters, nextOffset: number, nextLimit: number) => {
        setLoadingHist(true);
        try {
            const [summaryResp, listResp] = await Promise.all([
                apiGet<SummaryResp>("dashboard_resumo", f),
                apiGet<ListResp>("dashboard_listar", f, { limit: nextLimit, offset: nextOffset }),
            ]);
            if (summaryResp.sem_acesso || listResp.sem_acesso) {
                setSemAcesso(true);
                return;
            }
            if (!summaryResp.ok) throw new Error(summaryResp.msg || "Erro ao carregar o resumo.");
            if (!listResp.ok) throw new Error(listResp.msg || "Erro ao carregar o histórico.");
            setSummary(summaryResp.data || {});
            setRows(listResp.rows || []);
        } catch (e: any) {
            setMsg(e?.message || "Erro ao carregar o histórico.");
        } finally {
            setLoadingHist(false);
        }
    }, []);

    const refreshAll = useCallback(async () => {
        if (!mostrandoCopiaRef.current) setLoadingFila(true);
        setMsg("");
        try {
            await loadInit();
            await Promise.all([loadFila(), loadHistorico(appliedFilters, offset, limit)]);
        } catch (e: any) {
            setMsg(e?.message || "Erro ao carregar os dados.");
        } finally {
            setLoadingFila(false);
            setDesatualizado(false);
            mostrandoCopiaRef.current = false;
        }
    }, [loadInit, loadFila, loadHistorico, appliedFilters, offset, limit]);

    useEffect(() => {
        // Mostra na hora a cópia da última visita (se houver); os dados novos chegam em seguida.
        const ini = lerCacheTela<InitResp>("requisicoes_init");
        const copia = lerCacheTela<ReqListRow[]>("requisicoes_fila");
        if (ini?.ok && Array.isArray(copia)) {
            setMe(ini.me || null);
            setUsuarios(ini.usuarios || []);
            setDepositos(ini.depositos || []);
            setProdutos(ini.produtos || []);
            setSaldos(ini.saldos || []);
            setFila(copia);
            setLoadingFila(false);
            setDesatualizado(true);
            mostrandoCopiaRef.current = true;
        }
        void refreshAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function refreshAfterAction(texto?: string) {
        await loadInit();
        await Promise.all([loadFila(), loadHistorico(appliedFilters, offset, limit)]);
        if (texto) setOkMsg(texto);
    }

    /* ---------- Histórico: filtros ---------- */

    async function applyFilters(next?: Filters, rolar = false) {
        const f = next || filters;
        setFilters(f);
        setAppliedFilters(f);
        setOffset(0);
        setFilterOpen(false);
        await loadHistorico(f, 0, limit);
        if (rolar) histRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function goPage(direction: "prev" | "next") {
        const nextOffset = direction === "prev" ? Math.max(0, offset - limit) : offset + limit;
        setOffset(nextOffset);
        await loadHistorico(appliedFilters, nextOffset, limit);
    }

    const activeFilterChips = useMemo(() => {
        const chips: Array<{ key: keyof Filters | "periodo"; label: string }> = [];
        if (appliedFilters.de || appliedFilters.ate) {
            const de = appliedFilters.de ? dataBR(appliedFilters.de + " 00:00:00") : "início";
            const ate = appliedFilters.ate ? dataBR(appliedFilters.ate + " 00:00:00") : "hoje";
            chips.push({ key: "periodo", label: `${de} até ${ate}` });
        }
        if (appliedFilters.status) chips.push({ key: "status", label: `Situação: ${statusLabel(appliedFilters.status)}` });
        if (appliedFilters.q) chips.push({ key: "q", label: `Busca: ${appliedFilters.q}` });
        if (appliedFilters.id_atendimento) chips.push({ key: "id_atendimento", label: `Atendimento: ${appliedFilters.id_atendimento}` });
        if (appliedFilters.atrasadas) chips.push({ key: "atrasadas", label: "Atrasadas" });
        const usuario = usuarios.find((u) => String(u.id) === appliedFilters.solicitante_id);
        if (usuario) chips.push({ key: "solicitante_id", label: `Solicitante: ${nomeCurto(usuario.nome)}` });
        const destino = depositos.find((d) => String(d.id) === appliedFilters.unidade_destino_id);
        if (destino) chips.push({ key: "unidade_destino_id", label: `Destino: ${destino.nome}` });
        const origem = depositos.find((d) => String(d.id) === appliedFilters.deposito_origem_id);
        if (origem) chips.push({ key: "deposito_origem_id", label: `Origem: ${origem.nome}` });
        const produto = produtos.find((p) => String(p.id) === appliedFilters.produto_id);
        if (produto) chips.push({ key: "produto_id", label: `Produto: ${produto.nome}` });
        return chips;
    }, [appliedFilters, depositos, produtos, usuarios]);

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
        void applyFilters(next);
    }

    async function openDetail(id: ID) {
        setDetailLoading(true);
        setDetail(null);
        try {
            const resp = await apiGet<DetailResp>("detalhar", {}, { id });
            if (!resp.ok || !resp.row) throw new Error(resp.msg || "Requisição não encontrada.");
            setDetail(resp.row);
        } catch (e: any) {
            setMsg(e?.message || "Erro ao abrir os detalhes.");
        } finally {
            setDetailLoading(false);
        }
    }

    async function exportCsv() {
        setExporting(true);
        setMsg("");
        try {
            const url = buildUrl("dashboard_export_csv", appliedFilters, { limit: 500, offset: 0 });
            const r = await fetch(url.toString(), { method: "GET", cache: "no-store", credentials: "include" });
            if (r.status === 403) {
                setSemAcesso(true);
                return;
            }
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
            setMsg(e?.message || "Erro ao exportar o CSV.");
        } finally {
            setExporting(false);
        }
    }

    /* ---------- Separar ---------- */

    const separationDestinoId = useMemo(() => destinationDepositId(separationReq), [separationReq]);
    const separationDepositos = useMemo(() => depositos.filter((d) => Number(d.id) !== separationDestinoId), [depositos, separationDestinoId]);

    const separationValidation = useMemo(() => {
        if (!separationReq?.items?.length) return { ok: false, msg: "Requisição sem itens." };
        const totais = new Map<string, number>();
        for (const it of separationReq.items) {
            const dep = separationOrigens[it.id] || 0;
            if (!dep) return { ok: false, msg: "Escolha o estoque de origem de cada item." };
            if (!separationDepositos.some((d) => Number(d.id) === dep)) return { ok: false, msg: "Estoque inválido." };
            const key = `${it.produto_id}:${dep}`;
            totais.set(key, (totais.get(key) || 0) + asNumber(it.quantidade_solicitada));
        }
        for (const [key, qtd] of totais) {
            if (qtd - 0.0001 > (saldoMap.get(key) || 0)) return { ok: false, msg: "Saldo insuficiente em um dos estoques selecionados." };
        }
        return { ok: true, msg: "Todos os itens têm saldo suficiente." };
    }, [separationReq, separationOrigens, separationDepositos, saldoMap]);

    async function prepareSeparation(row: ReqListRow) {
        if (busy) return;
        setBusy(true);
        setMsg("");
        setOkMsg("");
        try {
            const data = await apiGet<DetailResp>("detalhar", {}, { id: row.id });
            if (!data.ok || !data.row) throw new Error(data.msg || "Não foi possível carregar os itens da requisição.");
            if (!data.row.items?.length) throw new Error("A requisição não possui itens para separar.");
            const destinoId = destinationDepositId(data.row);
            const escolha: Record<number, number> = {};
            for (const it of data.row.items) {
                const opcoes = depositos.filter((d) => Number(d.id) !== destinoId && (saldoMap.get(`${it.produto_id}:${d.id}`) || 0) >= asNumber(it.quantidade_solicitada));
                escolha[it.id] = opcoes.length === 1 ? Number(opcoes[0].id) : 0;
            }
            setSeparationReq(data.row);
            setSeparationOrigens(escolha);
            setSeparationObs("");
            setSeparationOpen(true);
        } catch (e: any) {
            setMsg(e?.message || "Erro ao preparar a separação.");
        } finally {
            setBusy(false);
        }
    }

    async function confirmStartSeparation() {
        if (!separationReq || !separationValidation.ok || busy) return;
        setBusy(true);
        setMsg("");
        setOkMsg("");
        try {
            const data = await apiPost<ActionResp>({
                action: "iniciar_separacao",
                id: separationReq.id,
                itens: (separationReq.items || []).map((it) => ({ id: it.id, deposito_origem_id: separationOrigens[it.id] || 0 })),
                observacao: separationObs.trim(),
            });
            if (!data.ok) throw new Error(data.msg || "Não foi possível iniciar a separação.");
            setSeparationOpen(false);
            setSeparationReq(null);
            setSeparationObs("");
            await refreshAfterAction(data.msg || "Separação iniciada. Origem registrada.");
        } catch (e: any) {
            setMsg(e?.message || "Erro ao iniciar a separação.");
        } finally {
            setBusy(false);
        }
    }

    /* ---------- Enviar ---------- */

    const sendDestinoId = useMemo(() => destinationDepositId(sendReq), [sendReq]);
    const sendDepositos = useMemo(() => depositos.filter((d) => Number(d.id) !== sendDestinoId), [depositos, sendDestinoId]);

    const sendValidation = useMemo(() => {
        if (!sendReq?.items?.length) return { ok: false, msg: "Requisição sem itens." };
        const totais = new Map<string, number>();
        for (const it of sendReq.items) {
            const dep = sendOrigens[it.id] || 0;
            if (!dep) return { ok: false, msg: "Item sem depósito de origem." };
            if (!sendDepositos.some((d) => Number(d.id) === dep)) return { ok: false, msg: "Depósito inválido." };
            if (it.deposito_origem_id && Number(it.deposito_origem_id) !== dep) return { ok: false, msg: "Origem registrada não pode ser alterada." };
            const key = `${it.produto_id}:${dep}`;
            totais.set(key, (totais.get(key) || 0) + asNumber(it.quantidade_solicitada));
        }
        for (const [key, qtd] of totais) {
            if (qtd - 0.0001 > (saldoMap.get(key) || 0)) return { ok: false, msg: "Saldo insuficiente para um dos itens." };
        }
        return { ok: true, msg: "Saldo suficiente para enviar todos os itens." };
    }, [sendReq, sendOrigens, sendDepositos, saldoMap]);

    async function prepareSend(row: ReqListRow) {
        if (busy) return;
        setBusy(true);
        setMsg("");
        setOkMsg("");
        try {
            const data = await apiGet<DetailResp>("detalhar", {}, { id: row.id });
            if (!data.ok || !data.row) throw new Error(data.msg || "Não foi possível carregar os itens da requisição.");
            const destinoId = destinationDepositId(data.row);
            const escolha: Record<number, number> = {};
            for (const it of data.row.items || []) {
                const gravada = Number(it.deposito_origem_id || data.row.deposito_origem_id || 0);
                const opcoes = depositos.filter((d) => Number(d.id) !== destinoId && (saldoMap.get(`${it.produto_id}:${d.id}`) || 0) >= asNumber(it.quantidade_solicitada));
                escolha[it.id] = gravada || (opcoes.length === 1 ? Number(opcoes[0].id) : 0);
            }
            setSendReq(data.row);
            setSendOrigens(escolha);
            setSendObs("");
            setSendOpen(true);
        } catch (e: any) {
            setMsg(e?.message || "Erro ao preparar o envio.");
        } finally {
            setBusy(false);
        }
    }

    async function confirmSend() {
        if (!sendReq || !sendValidation.ok || busy) return;
        setBusy(true);
        setMsg("");
        setOkMsg("");
        try {
            const data = await apiPost<ActionResp>({
                action: "enviar_material",
                id: sendReq.id,
                itens: (sendReq.items || []).map((it) => ({ id: it.id, deposito_origem_id: sendOrigens[it.id], quantidade_enviada: decimalToApi(it.quantidade_solicitada) })),
                observacao: sendObs.trim(),
            });
            if (!data.ok) throw new Error(data.msg || "Não foi possível enviar o material.");
            setSendOpen(false);
            setSendReq(null);
            setSendObs("");
            await refreshAfterAction(data.msg || "Material enviado. Aguardando confirmação do solicitante.");
        } catch (e: any) {
            setMsg(e?.message || "Erro ao enviar o material.");
        } finally {
            setBusy(false);
        }
    }

    /* ---------- Recusar ---------- */

    function openReject(row: ReqListRow) {
        setRejectReq(row);
        setRejectReason("");
        setRejectOpen(true);
        setMsg("");
        setOkMsg("");
    }

    async function confirmReject() {
        if (!rejectReq || busy) return;
        if (!rejectReason.trim()) {
            setMsg("Informe o motivo da recusa.");
            return;
        }
        setBusy(true);
        setMsg("");
        setOkMsg("");
        try {
            const data = await apiPost<ActionResp>({ action: "recusar", id: rejectReq.id, motivo: rejectReason.trim() });
            if (!data.ok) throw new Error(data.msg || "Não foi possível recusar a requisição.");
            setRejectOpen(false);
            setRejectReq(null);
            setRejectReason("");
            await refreshAfterAction(data.msg || "Requisição recusada.");
        } catch (e: any) {
            setMsg(e?.message || "Erro ao recusar a requisição.");
        } finally {
            setBusy(false);
        }
    }

    function handleMainAction(row: ReqListRow) {
        const st = toStatus(row.status);
        if (st === "PENDENTE") void prepareSeparation(row);
        else if (st === "EM_SEPARACAO") void prepareSend(row);
    }

    const closeSeparation = useCallback(() => setSeparationOpen(false), []);
    const closeSend = useCallback(() => setSendOpen(false), []);
    const closeReject = useCallback(() => setRejectOpen(false), []);
    const closeDetail = useCallback(() => {
        setDetail(null);
        setDetailLoading(false);
    }, []);

    const nFiltros = activeFilterChips.length;
    const porStatus = summary.por_status || {};
    const SELOS: Array<{ id: StatusId; rotulo: string; cls: string }> = [
        { id: "ENTREGUE", rotulo: "entregues", cls: STATUS_BADGE_CLASS.ENTREGUE },
        { id: "RECUSADA", rotulo: "recusadas", cls: STATUS_BADGE_CLASS.RECUSADA },
        { id: "CANCELADA", rotulo: "canceladas", cls: STATUS_BADGE_CLASS.CANCELADA },
    ];

    /* ---------- tela ---------- */

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white">
            <FaixaAtualizando ativo={desatualizado} />
            <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 pb-6 pt-3.5 lg:gap-6 lg:px-10 lg:pb-12 lg:pt-8" style={travaToques(desatualizado)}>
                {/* Cabeçalho */}
                <header className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-2xl font-extrabold leading-tight lg:text-[28px]">Requisições</h1>
                        <p className={["mt-0.5 text-sm", CINZA].join(" ")}>
                            {loadingFila ? "Carregando..." : `${numberBR(fila.length)} em andamento`}
                            {!loadingFila && nAtrasadas > 0 ? ` · ${numberBR(nAtrasadas)} ${nAtrasadas === 1 ? "atrasada" : "atrasadas"}` : ""}
                        </p>
                    </div>
                    <Button type="button" onClick={() => void refreshAll()} disabled={loadingFila || busy} aria-label="Atualizar" className="!h-11 !px-3 lg:!px-[18px]">
                        <IconRefresh size={20} stroke={1.8} aria-hidden="true" />
                        <span className="max-lg:hidden">Atualizar</span>
                    </Button>
                </header>

                {msg ? (
                    <div role="alert" className="rounded-[14px] border border-[#B42318] bg-[#FDECEA] px-4 py-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                        {msg}
                    </div>
                ) : null}
                {okMsg ? (
                    <div role="status" className="rounded-[14px] border border-[#B3CE52] bg-[#EEF5D6] px-4 py-3 text-sm font-bold text-[#313C55] dark:bg-[#B3CE52]/[0.18] dark:text-white">
                        {okMsg}
                    </div>
                ) : null}

                {/* Fila: celular = etapas como botões; computador = três colunas */}
                {loadingFila ? (
                    <Card className={["p-5 text-center text-sm font-bold lg:p-8", CINZA].join(" ")}>Carregando a fila...</Card>
                ) : (
                    <section aria-label="Fila em andamento">
                        <div className="grid grid-cols-3 gap-2 lg:hidden" role="tablist">
                            {ETAPAS.map((e) => {
                                const lista = filaPorEtapa[e.id];
                                const atr = lista.filter((r) => isTruthy(r.atrasada_24h)).length;
                                const on = aba === e.id;
                                return (
                                    <button
                                        key={e.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={on}
                                        onClick={() => setAba(e.id)}
                                        className={[
                                            "min-h-[64px] rounded-2xl px-2.5 py-2 text-left",
                                            on ? "bg-[#313C55] text-white dark:bg-[#3D6A99]" : "border border-[#E3E8F0] bg-white text-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-white",
                                        ].join(" ")}
                                    >
                                        <span className="block text-[12px] font-extrabold leading-tight">{e.nome}</span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="text-[24px] font-extrabold leading-tight">{numberBR(lista.length)}</span>
                                            {atr > 0 ? <LatePill>+24h</LatePill> : null}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-3 lg:mt-0 lg:grid lg:grid-cols-3 lg:items-start lg:gap-4">
                            {ETAPAS.map((e) => {
                                const lista = filaPorEtapa[e.id];
                                const atr = lista.filter((r) => isTruthy(r.atrasada_24h)).length;
                                return (
                                    <div key={e.id} className={[aba === e.id ? "flex" : "hidden", "flex-col gap-2.5 lg:flex lg:rounded-2xl lg:bg-[#EEF2F7] lg:p-2.5 lg:dark:bg-white/[0.04]"].join(" ")}>
                                        <div className="hidden px-1.5 pt-1 lg:block">
                                            <div className="flex items-center gap-2">
                                                <h2 className="flex-1 text-[15px] font-extrabold">{e.nome}</h2>
                                                {atr > 0 ? <LatePill>{numberBR(atr)} +24h</LatePill> : null}
                                                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-[#313C55] px-2 text-sm font-extrabold text-white dark:bg-[#3D6A99]">{numberBR(lista.length)}</span>
                                            </div>
                                            <p className={["text-[12.5px]", CINZA].join(" ")}>{e.dica}</p>
                                        </div>
                                        {lista.map((row) => (
                                            <CartaoFila
                                                key={row.id}
                                                row={row}
                                                busy={busy}
                                                onMain={() => handleMainAction(row)}
                                                onReject={() => openReject(row)}
                                                onDetalhe={() => void openDetail(row.id)}
                                            />
                                        ))}
                                        {lista.length === 0 ? (
                                            <div className={["rounded-xl border border-dashed border-[#C9D1DE] p-4 text-center text-sm dark:border-white/[0.2]", CINZA].join(" ")}>Nada nesta etapa</div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Histórico do período */}
                <section ref={histRef} className="scroll-mt-4 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-[#E3E8F0] lg:bg-white lg:dark:border-white/[0.12] lg:dark:bg-[#232B3F]">
                    <div className="mb-2.5 flex flex-col gap-2.5 lg:mb-0 lg:border-b lg:border-[#E3E8F0] lg:px-6 lg:py-4 lg:dark:border-white/[0.12]">
                        <div className="flex items-center gap-2">
                            <h2 className="flex-1 text-lg font-extrabold">Histórico</h2>
                            {!semAcesso ? (
                                <>
                                    <Button type="button" onClick={() => setFilterOpen(true)} aria-haspopup="dialog" className="!h-11 !px-3.5 !text-sm">
                                        <IconFilter size={18} stroke={1.8} aria-hidden="true" className="max-sm:hidden" />
                                        Filtrar
                                        {nFiltros > 0 ? <CountBadge n={nFiltros} /> : null}
                                    </Button>
                                    <Button type="button" onClick={() => void exportCsv()} disabled={exporting} className="!h-11 !px-3.5 !text-sm">
                                        <IconDownload size={18} stroke={1.8} aria-hidden="true" className="max-sm:hidden" />
                                        {exporting ? "Exportando..." : "CSV"}
                                    </Button>
                                </>
                            ) : null}
                        </div>

                        {semAcesso ? (
                            <p className={["text-sm", CINZA].join(" ")}>O histórico e o CSV pedem a permissão do Painel de Requisições. Se precisar, peça à Gestão para liberar em Permissões.</p>
                        ) : (
                            <div className="flex flex-wrap gap-1.5 lg:gap-2">
                                {activeFilterChips.map((chip) => (
                                    <FilterChip key={`${chip.key}-${chip.label}`} onClear={() => removeFilter(chip.key)}>
                                        {chip.label}
                                    </FilterChip>
                                ))}
                                {SELOS.map((s) => {
                                    const on = appliedFilters.status === s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => void applyFilters({ ...appliedFilters, status: on ? "" : s.id, atrasadas: false })}
                                            className={["inline-flex h-8 items-center rounded-full border-[1.5px] px-3 text-[13px] font-extrabold", s.cls, on ? "ring-2 ring-[#313C55] ring-offset-1 dark:ring-white" : ""].join(" ")}
                                        >
                                            {numberBR(porStatus[s.id] || 0)} {s.rotulo}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {semAcesso ? null : loadingHist ? (
                        <div className={["rounded-2xl border border-[#E3E8F0] bg-white p-5 text-center text-sm dark:border-white/[0.12] dark:bg-[#232B3F] lg:rounded-none lg:border-0 lg:p-8", CINZA].join(" ")}>Carregando o histórico...</div>
                    ) : (
                        <>
                            {/* Celular */}
                            <div className="overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F] lg:hidden">
                                {rows.map((row, i) => (
                                    <button
                                        key={row.id}
                                        type="button"
                                        onClick={() => void openDetail(row.id)}
                                        className={["block w-full px-3.5 py-3 text-left hover:bg-[#EEF2F7] dark:hover:bg-white/[0.06]", i > 0 ? "border-t border-[#E3E8F0] dark:border-white/[0.12]" : ""].join(" ")}
                                    >
                                        <span className="flex items-center gap-2">
                                            <b className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{nomeCurto(row.solicitante_nome)}</b>
                                            {isTruthy(row.atrasada_24h) ? <LatePill>+24h</LatePill> : null}
                                            <Badge className={["h-[22px] text-xs", statusClass(row.status)].join(" ")}>{statusLabel(row.status)}</Badge>
                                        </span>
                                        <ItensTabela resumo={row.itens_resumo} vazio="Itens não carregados" className="mt-1.5" />
                                        <span className={["mt-1 block text-[12.5px]", CINZA].join(" ")}>
                                            para {destinoLabel(row)} · {fmtDateTime(row.criado_em)} · {codigoReq(row)}
                                        </span>
                                    </button>
                                ))}
                                {rows.length === 0 ? <div className={["p-5 text-center text-sm", CINZA].join(" ")}>Nenhuma requisição com os filtros atuais.</div> : null}
                            </div>

                            {/* Computador: tabela (ordena pelo clique no cabeçalho) */}
                            <div className="hidden overflow-x-auto lg:block">
                                <table className="w-full min-w-[900px] text-sm">
                                    <thead className="bg-[#F6F8FB] dark:bg-[#1C2334]">
                                        <tr>
                                            <th className={[TH_CLS, "pl-6"].join(" ")}>Solicitante</th>
                                            <th className={TH_CLS}>Itens</th>
                                            <th className={TH_CLS}>Destino</th>
                                            <th className={TH_CLS}>Abertura</th>
                                            <th className={TH_CLS}>Situação</th>
                                            <th className={[TH_CLS, "text-right"].join(" ")}>Qtd</th>
                                            <th className={[TH_CLS, "pr-6"].join(" ")} aria-label="Ações"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => (
                                            <tr key={row.id} className="border-t border-[#E3E8F0] align-top dark:border-white/[0.12]">
                                                <td className="py-3 pl-6 pr-3">
                                                    <b className="font-extrabold">{nomeCurto(row.solicitante_nome)}</b>
                                                    <div className={["text-xs", CINZA].join(" ")}>
                                                        {codigoReq(row)}
                                                        {row.id_atendimento ? ` · Atendimento ${row.id_atendimento}` : ""}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <ItensTabela resumo={row.itens_resumo} vazio="Itens não carregados" />
                                                </td>
                                                <td className="break-words px-3 py-3">{destinoLabel(row)}</td>
                                                <td className={["whitespace-nowrap px-3 py-3", CINZA].join(" ")}>{fmtDateTime(row.criado_em)}</td>
                                                <td className="px-3 py-3">
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <Badge className={["h-[22px] text-xs", statusClass(row.status)].join(" ")}>{statusLabel(row.status)}</Badge>
                                                        {isTruthy(row.atrasada_24h) ? <LatePill>+24h</LatePill> : null}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-right font-extrabold">{numberBR(row.total_quantidade, 3)}</td>
                                                <td className="py-3 pl-3 pr-6 text-right">
                                                    <Button type="button" onClick={() => void openDetail(row.id)} className="!h-11 !px-3">
                                                        Ver
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {rows.length === 0 ? <div className={["border-t border-[#E3E8F0] p-8 text-center dark:border-white/[0.12]", CINZA].join(" ")}>Nenhuma requisição com os filtros atuais.</div> : null}
                            </div>
                        </>
                    )}

                    {!semAcesso ? (
                        <div className="mt-3 flex items-center gap-2 lg:mt-0 lg:justify-end lg:border-t lg:border-[#E3E8F0] lg:px-6 lg:py-3.5 lg:dark:border-white/[0.12]">
                            <span className={["mr-auto text-[13px] max-lg:hidden", CINZA].join(" ")}>
                                {numberBR(rows.length)} nesta página{offset > 0 ? ` · a partir do registro ${offset + 1}` : ""}
                            </span>
                            <Select
                                value={limit}
                                onChange={(e) => {
                                    const n = Number(e.target.value) || 100;
                                    setLimit(n);
                                    setOffset(0);
                                    void loadHistorico(appliedFilters, 0, n);
                                }}
                                aria-label="Registros por página"
                                className="!w-24 shrink-0 pr-9"
                            >
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={200}>200</option>
                                <option value={500}>500</option>
                            </Select>
                            <Button type="button" onClick={() => void goPage("prev")} disabled={offset <= 0 || loadingHist} className="flex-1 lg:flex-none">
                                Anterior
                            </Button>
                            <Button type="button" onClick={() => void goPage("next")} disabled={rows.length < limit || loadingHist} className="flex-1 lg:flex-none">
                                Próxima
                            </Button>
                        </div>
                    ) : null}
                </section>
            </div>

            {/* Separar */}
            <Modal
                open={separationOpen}
                title={separationReq ? `Separar para ${nomeCurto(separationReq.solicitante_nome)}` : "Iniciar separação"}
                subtitle={separationReq ? `${codigoReq(separationReq)} · para ${destinoLabel(separationReq)} · escolha de onde sai cada item` : undefined}
                onClose={closeSeparation}
                maxWidth="lg:max-w-[640px]"
                footer={
                    <>
                        <Button type="button" onClick={closeSeparation}>
                            Voltar
                        </Button>
                        <Button type="button" variant="solid" onClick={() => void confirmStartSeparation()} disabled={busy || !separationValidation.ok}>
                            Iniciar separação
                        </Button>
                    </>
                }
            >
                {separationDestinoId > 0 ? (
                    <p className={["text-sm", CINZA].join(" ")}>
                        Destino: <b className="text-[#313C55] dark:text-white">{destinoLabel(separationReq)}</b>. O destino não pode ser usado como origem.
                    </p>
                ) : null}
                <div className="flex flex-col gap-3">
                    {(separationReq?.items || []).map((item) => {
                        const dep = separationOrigens[item.id] || 0;
                        const qtd = asNumber(item.quantidade_solicitada);
                        const opcoes = separationDepositos.filter((d) => (saldoMap.get(`${item.produto_id}:${d.id}`) || 0) >= qtd);
                        return (
                            <div key={item.id} className="rounded-2xl border border-[#E3E8F0] bg-[#F6F8FB] p-4 dark:border-white/[0.12] dark:bg-[#1C2334]">
                                <div className="flex gap-3">
                                    <b className="min-w-0 flex-1 break-words">{item.produto_nome_snapshot}</b>
                                    <span className={["whitespace-nowrap text-[13px]", CINZA].join(" ")}>
                                        Qtd <b className="text-[15px] text-[#313C55] dark:text-white">{numberBR(qtd, 3)}</b>
                                    </span>
                                </div>
                                <div className="mt-2">
                                    <Field label="Estoque de origem deste item">
                                        <Select value={dep || ""} disabled={busy || !opcoes.length} onChange={(e) => setSeparationOrigens((prev) => ({ ...prev, [item.id]: Number(e.target.value || 0) }))}>
                                            <option value="">Selecione...</option>
                                            {opcoes.map((d) => (
                                                <option key={d.id} value={d.id}>
                                                    {d.nome} — disponível: {numberBR(saldoMap.get(`${item.produto_id}:${d.id}`) || 0, 3)}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                </div>
                                {!opcoes.length ? <p className="mt-1 text-sm font-bold text-[#B42318] dark:text-[#FF9C92]">Nenhum estoque tem saldo suficiente para este item.</p> : null}
                            </div>
                        );
                    })}
                </div>
                <Field label="Observação, opcional">
                    <TextArea rows={3} value={separationObs} onChange={(e) => setSeparationObs(e.target.value)} />
                </Field>
                {!separationValidation.ok ? (
                    <p role="alert" className="text-sm font-bold text-[#B42318] dark:text-[#FF9C92]">
                        {separationValidation.msg}
                    </p>
                ) : null}
            </Modal>

            {/* Enviar */}
            <Modal
                open={sendOpen}
                title={sendReq ? `Enviar para ${nomeCurto(sendReq.solicitante_nome)}` : "Enviar requisição"}
                subtitle={sendReq ? `${codigoReq(sendReq)} · para ${destinoLabel(sendReq)} · confira a origem de cada item` : undefined}
                onClose={closeSend}
                maxWidth="lg:max-w-[640px]"
                footer={
                    <>
                        <Button type="button" onClick={closeSend}>
                            Voltar
                        </Button>
                        <Button type="button" variant="solid" onClick={() => void confirmSend()} disabled={busy || !sendValidation.ok}>
                            Enviar
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    {(sendReq?.items || []).map((item) => {
                        const dep = sendOrigens[item.id] || 0;
                        const travado = Number(item.deposito_origem_id || 0) > 0;
                        const qtd = asNumber(item.quantidade_solicitada);
                        const opcoes = sendDepositos.filter((d) => (saldoMap.get(`${item.produto_id}:${d.id}`) || 0) >= qtd || Number(d.id) === dep);
                        return (
                            <div key={item.id} className="rounded-2xl border border-[#E3E8F0] bg-[#F6F8FB] p-4 dark:border-white/[0.12] dark:bg-[#1C2334]">
                                <div className="flex gap-3">
                                    <b className="min-w-0 flex-1 break-words">{item.produto_nome_snapshot}</b>
                                    <span className={["whitespace-nowrap text-[13px]", CINZA].join(" ")}>
                                        Qtd <b className="text-[15px] text-[#313C55] dark:text-white">{numberBR(qtd, 3)}</b>
                                    </span>
                                </div>
                                <div className="mt-2">
                                    <Field label="Depósito de origem">
                                        <Select value={dep || ""} disabled={busy || travado} onChange={(e) => setSendOrigens((prev) => ({ ...prev, [item.id]: Number(e.target.value || 0) }))}>
                                            <option value="">Selecione...</option>
                                            {opcoes.map((d) => (
                                                <option key={d.id} value={d.id}>
                                                    {d.nome} — disponível: {numberBR(saldoMap.get(`${item.produto_id}:${d.id}`) || 0, 3)}
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <Field label="Observação, opcional">
                    <TextArea rows={3} value={sendObs} onChange={(e) => setSendObs(e.target.value)} />
                </Field>
                {!sendValidation.ok ? (
                    <p role="alert" className="text-sm font-bold text-[#B42318] dark:text-[#FF9C92]">
                        {sendValidation.msg}
                    </p>
                ) : null}
            </Modal>

            {/* Recusar */}
            <Modal
                open={rejectOpen}
                title={rejectReq ? `Recusar pedido de ${nomeCurto(rejectReq.solicitante_nome)}` : "Recusar requisição"}
                subtitle={rejectReq ? `${codigoReq(rejectReq)} · para ${destinoLabel(rejectReq)}` : undefined}
                onClose={closeReject}
                maxWidth="lg:max-w-[520px]"
                footer={
                    <>
                        <Button type="button" onClick={closeReject}>
                            Voltar
                        </Button>
                        <Button type="button" variant="danger" onClick={() => void confirmReject()} disabled={busy || !rejectReason.trim()}>
                            Confirmar recusa
                        </Button>
                    </>
                }
            >
                <Field label="Motivo da recusa (obrigatório)">
                    <TextArea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Digite o motivo da recusa..." />
                </Field>
            </Modal>

            {/* Filtros do Histórico */}
            <Modal
                open={filterOpen}
                title="Filtros do histórico"
                onClose={() => setFilterOpen(false)}
                footer={
                    <>
                        <Button type="button" onClick={() => setFilters(emptyFilters())} className="!px-2 lg:mr-auto lg:!px-[18px]">
                            <span className="lg:hidden">Limpar</span>
                            <span className="hidden lg:inline">Limpar campos</span>
                        </Button>
                        <Button type="button" onClick={() => setFilters(initialFilters())} className="!px-2 lg:!px-[18px]">
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
                    <Field label="Situação">
                        <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters["status"] }))}>
                            <option value="">Todas</option>
                            {STATUS_OPTIONS.map((s) => (
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
                                    {u.nome ? nomeCurto(u.nome) : u.usuario}
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

            <DetailModal detail={detail} loading={detailLoading} onClose={closeDetail} />
        </main>
    );
}
