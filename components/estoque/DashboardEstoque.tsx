"use client";

/**
 * Dashboard do estoque (13/10/2026) — conferência e reposição.
 * Abas: Reposições · Divergências · Atendimentos · Contagem · Relatórios.
 * Back-end: estoque_dashboard.php, reposicao_auto.php e materiais_gerais.php (saldo_setar, para o ajuste).
 * Celular primeiro: sem rolagem lateral, filtros atrás de botão, janelas por portal no <body> (z-[70]).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronRight, IconFilter, IconHelp, IconRefresh, IconX } from "@tabler/icons-react";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_DASH = `${ENDPOINT}/estoque_dashboard.php`;
const API_REPO = `${ENDPOINT}/reposicao_auto.php`;
const API_MAT = `${ENDPOINT}/materiais_gerais.php`;

/* ============================== tipos ============================== */

type Aba = "rep" | "div" | "at" | "cont" | "rel";

type ReqItem = { produto: string; qtd: string | number; quantidade_enviada?: string | number | null; observacao?: string | null };
type ReqAuto = {
    id: number;
    codigo: string;
    status: string;
    criado_em: string;
    enviado_em?: string | null;
    recebido_em?: string | null;
    justificativa?: string | null;
    destino?: string | null;
    origem?: string | null;
    recebido_por?: string | null;
    min_transito?: number | string | null;
    min_criada?: number | string | null;
    recebe: string;
    itens: ReqItem[];
    aviso?: { nivel: number; detalhe: string } | null;
};
type SemRepo = { produto_id?: number | null; deposito_id?: number | null; produto: string; local: string; motivo: string; precisa?: number | null; origem?: string | null };
type Pausa = { id: number; produto: string; local: string; motivo?: string | null; por?: string | null; criado_em: string };
type Execucao = { id: number; chave_janela?: string | null; origem: string; status: string; reqs_criadas: number; itens: number; faltas: number; bloqueados: number; erro?: string | null; iniciado_em: string };
type RepResp = {
    ok: boolean; msg?: string; need_login?: 1;
    pode_gerir: boolean; ligado: boolean; base_definida_em?: string | null; proxima?: string | null;
    reqs: ReqAuto[]; sem_reposicao: SemRepo[]; pausas: Pausa[]; execucoes: Execucao[]; ultima_geracao?: string | null;
};

type Alerta = {
    id: number; tipo: string; status: string; origem_evento: string; pausa_reposicao: number | string;
    produto_id?: number | null; deposito_id?: number | null; produto?: string | null; local?: string | null;
    requisicao_codigo?: string | null; origem_item?: string | null;
    qtd_sistema?: string | null; qtd_contada?: string | null; qtd_enviada?: string | null; qtd_recebida?: string | null; diferenca?: string | null;
    detalhe?: string | null; criado_em: string; criado_por_nome?: string | null; nivel_aviso?: number | string;
    saldo_atual?: string | number; sugestao_saldo?: number | null; falecidos: { id: number; nome: string }[];
    resolvido_em?: string | null; resolvido_por_nome?: string | null; motivo_resolucao?: string | null; ajuste_codigo?: string | null;
};
type DivResp = { ok: boolean; msg?: string; need_login?: 1; pode_gerir: boolean; rows: Alerta[]; resolvidas_7d: number };

type AtItem = { produto: string; tipo: string; local: string; qtd: number; estornado: boolean };
type Atend = { id: number; falecido: string; quando?: string | null; por: string; itens: AtItem[]; alertas: string[]; status: string; conferencia?: { por: string; em: string; observacao?: string | null } | null };
type AtResp = { ok: boolean; msg?: string; need_login?: 1; ini: string; fim: string; rows: Atend[] };

type Local = { deposito_id: number; nome: string };
type ContItem = { produto_id: number; nome: string; codigo_barras?: string; sistema?: string | number };
type ContResp = { ok: boolean; msg?: string; need_login?: 1; locais: Local[]; deposito_id: number; cega: boolean; ultima?: { criado_em: string; usuario?: string; com_diferenca: number } | null; itens: ContItem[] };

type RelRow = { produto_id: number; produto: string; inicio: number; entradas: number; transf_recebidas: number; transf_enviadas: number; saidas: number; ajustes: number; final: number; contado: number | null; diferenca: number | null; contado_em?: string | null };
type RelMov = { produto_id: number; tipo: string; efeito: number; quando: string; ref: string; por: string };
type Guardada = { id: number; local: string; inicio: string; fim: string; total_produtos: number; total_diferenca: string; criado_em: string; usuario?: string };
type RelResp = { ok: boolean; msg?: string; need_login?: 1; ini: string; fim: string; deposito_id: number; depositos: { id: number; nome: string }[]; guardadas: Guardada[]; rows: RelRow[]; movs: RelMov[] };

type Mut = { ok: boolean; msg?: string; need_login?: 1; codigo?: string | null; [k: string]: unknown };

/* ============================== API ============================== */

async function lerJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const t = await r.text().catch(() => "");
        throw new Error(`Resposta inesperada do servidor. ${t.slice(0, 160)}`.trim());
    }
    const data = (await r.json()) as T & { need_login?: 1 };
    if (r.status === 401 || data?.need_login) {
        window.location.href = "/login";
        throw new Error("Login necessário.");
    }
    return data;
}

async function apiGet<T>(base: string, qs: Record<string, string | number | undefined>): Promise<T> {
    const u = new URL(base);
    Object.entries(qs).forEach(([k, v]) => {
        if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
    });
    return lerJson<T>(await fetch(u.toString(), { cache: "no-store", credentials: "include" }));
}

async function apiPost<T>(base: string, body: Record<string, unknown>): Promise<T> {
    return lerJson<T>(
        await fetch(base, {
            method: "POST",
            cache: "no-store",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
    );
}

/* ============================== formatação ============================== */

function num(v: unknown) {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}
function fq(v: unknown) {
    return num(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
function fsig(v: unknown) {
    const n = num(v);
    return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
function fdh(v?: string | null) {
    if (!v) return "-";
    const d = new Date(String(v).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fd(v?: string | null) {
    if (!v) return "-";
    const [a, m, d] = String(v).slice(0, 10).split("-");
    return d && m ? `${d}/${m}${a ? "/" + a : ""}` : String(v);
}
function horas(min: unknown) {
    const m = num(min);
    if (m < 60) return `${Math.max(0, Math.round(m))} min`;
    const h = Math.floor(m / 60);
    const r = Math.round(m % 60);
    return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}
function hojeIso(delta = 0) {
    const d = new Date();
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nomeLocal(n?: string | null) {
    const s = String(n || "").toLowerCase();
    return s.replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace("Armario", "Armário").replace("Funeraria", "Funerária").replace("Escritorio", "Escritório");
}
const SO_NUMERO = /^\d+([.,]\d+)?$/;

/* ============================== estilo ============================== */

const CARD = "overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
const MUTED = "text-[#5B6478] dark:text-[#AEB9CF]";
const LINHA = "border-b border-[#E3E8F0] last:border-b-0 dark:border-white/[0.10]";
const BTN = "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-4 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-45";
const BTN_PRI = `${BTN} border-[#313C55] bg-[#313C55] text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]`;
const BTN_SEC = `${BTN} border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08]`;
const BTN_OK = `${BTN} border-[#B3CE52] bg-[#B3CE52] text-[#313C55] hover:bg-[#A3BE45]`;
const BTN_DNG = `${BTN} border-[#B42318] bg-white text-[#B42318] hover:bg-[#FDECEA] dark:border-[#FF9C92] dark:bg-[#232B3F] dark:text-[#FF9C92]`;
const CAMPO = "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-white";
const CAMPO_NUM = "h-12 w-[84px] shrink-0 rounded-xl border border-transparent bg-[#F1F4F8] text-center text-[18px] font-extrabold text-[#313C55] outline-none focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-white";
const ROTULO = "mb-1.5 block text-xs font-extrabold uppercase tracking-[.06em] text-[#5B6478] dark:text-[#AEB9CF]";

const CHIP = "inline-flex h-[26px] items-center whitespace-nowrap rounded-full border-[1.5px] px-2.5 text-[12px] font-extrabold";
const CH_PEND = `${CHIP} border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white`;
const CH_SEP = `${CHIP} border-[#3D6A99] bg-[#3D6A99] text-white`;
const CH_TRA = `${CHIP} border-[#313C55] bg-[#313C55] text-white dark:border-[#51607F] dark:bg-[#51607F]`;
const CH_OK = `${CHIP} border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20 dark:text-white`;
const CH_RED = `${CHIP} border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]`;
const CH_AMA = `${CHIP} border-[#F2CB3F] bg-[#F2CB3F] text-[#313C55]`;
const CH_CINZA = `${CHIP} border-[#C9D1DE] bg-[#EEF2F7] text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]`;

function chipStatusReq(s: string) {
    if (s === "EM_SEPARACAO") return [CH_SEP, "Em separação"];
    if (s === "EM_TRANSITO") return [CH_TRA, "Em trânsito"];
    if (s === "ENTREGUE") return [CH_OK, "Recebida"];
    if (s === "CANCELADA") return [CH_CINZA, "Cancelada"];
    if (s === "RECUSADA") return [CH_RED, "Recusada"];
    return [CH_PEND, "Pendente"];
}

const TIPO_ALERTA: Record<string, [string, string]> = {
    LOCAL_MENOS: ["Local com menos", CH_RED],
    LOCAL_MAIS: ["Local com mais", CH_RED],
    CAMINHO: ["Diferença no caminho", CH_RED],
    BAIXA_PENDENTE: ["Baixa pendente", CH_AMA],
    FALTA_ORIGEM: ["Falta na origem", CH_AMA],
    REQ_PARADA: ["REQ parada", CH_RED],
};

const MOTIVOS_AJUSTE = [
    "Baixa esquecida em atendimento",
    "Item trocado no atendimento",
    "Perda ou avaria",
    "Erro na contagem",
    "Transferência não finalizada",
    "Diferença na entrega",
    "Outro",
];

const REGRAS = [
    "Gera sozinho de segunda a sexta às 16:45 e no sábado às 10:45. Domingo não gera.",
    "Ordem dos locais: Memorial, depois Funerária, depois armários. Quem vem primeiro fica com o saldo.",
    "Origem: Escritório, depois Almoxarifado, depois Depósito. Pede só o que a origem tem, sem dividir.",
    "Quantidade: completa até o mínimo do local. Sem mínimo, até a base inicial. Desconta o que já está pedido.",
    "Sem saldo na origem: abre alerta e, se houver outra REQ para o local, anota nela.",
    "Só transferências. Uso e consumo (copa, limpeza) e saídas para Serviço Funerário não entram.",
    "Recebe: Armário Sandro só o Sandro; Armário Ildo só o Joseildo; demais locais qualquer agente.",
    "No recebimento a pessoa digita às cegas o estoque atualizado. Sem isso não conclui.",
    "Divergência pausa a reposição automática do item até o ajuste. REQ manual continua liberada.",
    "Avisos de recebimento: 2h responsável, 6h conferente, 24h Gestão.",
];

/* ============================== peças ============================== */

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [ok, setOk] = useState(false);
    useEffect(() => setOk(true), []);
    return ok ? createPortal(children, document.body) : null;
}

/** Janela padrão: computador = diálogo centralizado; celular = folha que sobe. Esc fecha. */
function Janela({
    aberta,
    titulo,
    onFechar,
    rodape,
    children,
}: {
    aberta: boolean;
    titulo: string;
    onFechar: () => void;
    rodape?: React.ReactNode;
    children: React.ReactNode;
}) {
    useEffect(() => {
        if (!aberta) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const k = (e: KeyboardEvent) => {
            if (e.key === "Escape") onFechar();
        };
        window.addEventListener("keydown", k);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", k);
        };
    }, [aberta, onFechar]);
    if (!aberta) return null;
    return (
        <NoCorpo>
            <div role="dialog" aria-modal="true" aria-label={titulo} data-pai-overlay className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6">
                <div className="flex max-h-[90dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-[86vh] lg:max-w-[560px] lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12]">
                    <div className="flex items-center gap-2 border-b border-[#E3E8F0] py-3 pl-5 pr-2 dark:border-white/[0.12] lg:px-6 lg:py-4">
                        <h2 className="min-w-0 flex-1 text-[18px] font-extrabold leading-tight">{titulo}</h2>
                        <button type="button" onClick={onFechar} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]">
                            <IconX size={20} stroke={1.8} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6">{children}</div>
                    {rodape ? (
                        <div className="flex gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end lg:px-6 lg:py-4 [&>*]:flex-1 lg:[&>*]:flex-none">
                            {rodape}
                        </div>
                    ) : null}
                </div>
            </div>
        </NoCorpo>
    );
}

/** Número compacto da linha do topo (no lugar de cartões grandes). */
function Num({ rotulo, valor, tom }: { rotulo: string; valor: React.ReactNode; tom?: "r" | "g" | "w" }) {
    const cor = tom === "r" ? "text-[#B42318] dark:text-[#FF9C92]" : tom === "g" ? "text-[#4E6B10] dark:text-[#D6EA94]" : tom === "w" ? "text-[#8A6A00] dark:text-[#F2CB3F]" : "";
    return (
        <span className="inline-flex min-h-8 items-baseline gap-1.5 rounded-xl border border-[#E3E8F0] bg-white px-2.5 py-1 text-[12px] font-bold text-[#5B6478] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#AEB9CF]">
            {rotulo} <b className={`text-[15px] font-extrabold text-[#313C55] dark:text-white ${cor}`}>{valor}</b>
        </span>
    );
}

function Aviso({ tipo, children }: { tipo: "erro" | "ok" | "info"; children: React.ReactNode }) {
    const cls =
        tipo === "erro"
            ? "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
            : tipo === "ok"
              ? "border-[#B3CE52] bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/[0.18] dark:text-white"
              : "border-[#F2CB3F]/70 bg-[#FCF3CC] text-[#5C4700] dark:bg-[#F2CB3F]/[0.14] dark:text-[#F6E3A0]";
    return <div role={tipo === "erro" ? "alert" : "status"} className={`rounded-xl border px-3.5 py-2.5 text-sm font-bold ${cls}`}>{children}</div>;
}

function Carregando() {
    return <div className={`${CARD} p-5 text-sm font-bold ${MUTED}`}>Carregando...</div>;
}

function Chips<T extends string | number>({ opcoes, valor, onChange }: { opcoes: { v: T; l: string }[]; valor: T; onChange: (v: T) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {opcoes.map((o) => (
                <button
                    key={String(o.v)}
                    type="button"
                    onClick={() => onChange(o.v)}
                    className={[
                        "min-h-11 rounded-xl border px-3.5 text-sm font-bold",
                        o.v === valor
                            ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#E9EFF6] dark:bg-[#E9EFF6] dark:text-[#313C55]"
                            : "border-[#C9D1DE] bg-white text-[#313C55] dark:border-white/[0.2] dark:bg-[#1C2334] dark:text-white",
                    ].join(" ")}
                >
                    {o.l}
                </button>
            ))}
        </div>
    );
}

function Seta({ aberta }: { aberta: boolean }) {
    return <IconChevronRight size={16} stroke={2.2} className={`shrink-0 transition-transform ${aberta ? "rotate-90" : ""}`} />;
}

/* ============================== ABA: REPOSIÇÕES ============================== */

function AbaReposicoes({ dados, recarregar, irPara, msg }: { dados: RepResp | null; recarregar: () => Promise<void>; irPara: (a: Aba) => void; msg: (t: string, erro?: boolean) => void }) {
    const [abertas, setAbertas] = useState<Record<number, boolean>>({});
    const [execOpen, setExecOpen] = useState(false);
    const [ocupado, setOcupado] = useState(false);

    if (!dados) return <Carregando />;
    const aReceber = dados.reqs.filter((r) => r.status === "EM_TRANSITO").length;
    const geradasHoje = dados.reqs.filter((r) => num(r.min_criada) <= 24 * 60).length;

    async function acaoRepo(body: Record<string, unknown>, ok: string) {
        setOcupado(true);
        try {
            const r = await apiPost<Mut>(API_REPO, body);
            if (!r.ok) throw new Error(r.msg || "Não foi possível concluir.");
            const criadas = typeof r.reqs_criadas === "number" ? ` ${r.reqs_criadas} requisição(ões) criada(s).` : "";
            msg((r.msg as string) || (r.pulado as string) || ok + criadas);
            await recarregar();
        } catch (e: any) {
            msg(e?.message || "Erro.", true);
        } finally {
            setOcupado(false);
        }
    }

    async function retomar(id: number) {
        setOcupado(true);
        try {
            const r = await apiPost<Mut>(API_DASH, { acao: "retomar", pausa_id: id });
            if (!r.ok) throw new Error(r.msg || "Não foi possível retomar.");
            msg(r.msg || "Retomado.");
            await recarregar();
        } catch (e: any) {
            msg(e?.message || "Erro.", true);
        } finally {
            setOcupado(false);
        }
    }

    const motivoTxt: Record<string, [string, string]> = {
        DIVERGENCIA: ["Divergência aberta", CH_RED],
        PAUSADO: ["Pausado", CH_CINZA],
        RESERVADO: ["Aguardando a origem", CH_PEND],
        FALTA: ["Falta", CH_AMA],
    };

    return (
        <div className="space-y-3.5">
            {!dados.ligado ? (
                <Aviso tipo="info">
                    Reposição automática desligada.
                    {dados.pode_gerir ? (
                        <span className="mt-2 flex flex-wrap gap-2">
                            {!dados.base_definida_em ? (
                                <button type="button" disabled={ocupado} className={BTN_SEC} onClick={() => acaoRepo({ acao: "definir_base" }, "Base inicial gravada.")}>
                                    Definir base inicial
                                </button>
                            ) : null}
                            <button type="button" disabled={ocupado || !dados.base_definida_em} className={BTN_PRI} onClick={() => acaoRepo({ acao: "ligar", ligado: 1 }, "Reposição automática ligada.")}>
                                Ligar
                            </button>
                        </span>
                    ) : null}
                </Aviso>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                <Num rotulo="Próxima" valor={dados.proxima || "domingo não gera"} />
                <Num rotulo="Geradas 24h" valor={geradasHoje} />
                <Num rotulo="A receber" valor={aReceber} tom={aReceber ? "w" : undefined} />
                <Num rotulo="Sem reposição" valor={dados.sem_reposicao.length + dados.pausas.length} tom={dados.sem_reposicao.length ? "r" : undefined} />
                <span className="hidden flex-1 sm:block" />
                <button type="button" className={`${BTN_SEC} min-h-9 flex-1 sm:flex-none`} onClick={() => setExecOpen(true)}>
                    Execuções
                </button>
                {dados.pode_gerir && dados.ligado ? (
                    <button type="button" disabled={ocupado} className={`${BTN_PRI} min-h-9 flex-1 sm:flex-none`} onClick={() => acaoRepo({ acao: "gerar_agora" }, "Geração concluída.")}>
                        {ocupado ? "Gerando..." : "Gerar agora"}
                    </button>
                ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                <section className={CARD}>
                    <div className={`px-4 py-3 ${LINHA}`}>
                        <h3 className="text-base font-extrabold">Requisições automáticas</h3>
                        <p className={`text-[13px] ${MUTED}`}>Últimas 24h e as que ainda estão abertas</p>
                    </div>
                    {dados.reqs.length === 0 ? <p className={`p-4 text-sm ${MUTED}`}>Nenhuma requisição automática no período.</p> : null}
                    {dados.reqs.map((r) => {
                        const ab = !!abertas[r.id];
                        const [cls, txt] = chipStatusReq(r.status);
                        const tempo =
                            r.status === "EM_TRANSITO" ? `aguardando há ${horas(r.min_transito)}` : r.status === "ENTREGUE" ? `recebida ${fdh(r.recebido_em)}${r.recebido_por ? " · " + r.recebido_por : ""}` : `criada há ${horas(r.min_criada)}`;
                        const obs = (r.justificativa || "").includes("Sem saldo") ? (r.justificativa || "").replace(/^Reposição automática[^.]*\.\s*/, "") : "";
                        return (
                            <div key={r.id} className={LINHA}>
                                <button type="button" onClick={() => setAbertas((p) => ({ ...p, [r.id]: !p[r.id] }))} aria-expanded={ab} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#F6F8FB] dark:hover:bg-white/[0.04]">
                                    <Seta aberta={ab} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words text-[15px] font-extrabold">
                                            {r.codigo} · {nomeLocal(r.destino)}
                                        </span>
                                        <span className={`block text-[13px] ${MUTED}`}>
                                            {nomeLocal(r.origem)} · {r.itens.length} {r.itens.length === 1 ? "item" : "itens"} · recebe: {r.recebe}
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 flex-col items-end gap-1">
                                        <span className={cls}>{txt}</span>
                                        <span className={`text-[12px] ${MUTED}`}>{tempo}</span>
                                    </span>
                                </button>
                                {ab ? (
                                    <div className="space-y-2 px-4 pb-3 pl-11">
                                        <ul>
                                            {r.itens.map((i, k) => (
                                                <li key={k} className="flex justify-between gap-3 border-b border-dashed border-[#E3E8F0] py-1.5 text-sm last:border-b-0 dark:border-white/[0.12]">
                                                    <span className="min-w-0 break-words">
                                                        {i.produto}
                                                        {i.observacao ? <span className={`block text-[12px] ${MUTED}`}>{i.observacao}</span> : null}
                                                    </span>
                                                    <b className="shrink-0">{fq(i.qtd)}</b>
                                                </li>
                                            ))}
                                        </ul>
                                        {obs ? <Aviso tipo="info">{obs}</Aviso> : null}
                                        {r.aviso ? <span className={r.aviso.nivel >= 3 ? CH_RED : CH_AMA}>{r.aviso.detalhe}</span> : null}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </section>

                <section className={CARD}>
                    <div className={`px-4 py-3 ${LINHA}`}>
                        <h3 className="text-base font-extrabold">Itens que ficaram sem reposição</h3>
                        <p className={`text-[13px] ${MUTED}`}>{dados.ultima_geracao ? `Última geração: ${fdh(dados.ultima_geracao)}` : "Ainda não houve geração"}</p>
                    </div>
                    {dados.sem_reposicao.length === 0 && dados.pausas.length === 0 ? <p className={`p-4 text-sm ${MUTED}`}>Nada ficou de fora.</p> : null}
                    {dados.sem_reposicao.map((b, k) => {
                        const [txt, cls] = motivoTxt[b.motivo] || [b.motivo, CH_CINZA];
                        return (
                            <div key={`b${k}`} className={`flex items-center gap-3 px-4 py-3 ${LINHA}`}>
                                <span className="min-w-0 flex-1">
                                    <span className="block break-words text-[15px] font-extrabold">{b.produto}</span>
                                    <span className={`block text-[13px] ${MUTED}`}>
                                        {nomeLocal(b.local)}
                                        {b.precisa ? ` · faltam ${fq(b.precisa)}` : ""}
                                        {b.origem ? ` · ${nomeLocal(b.origem)}` : ""}
                                    </span>
                                </span>
                                <span className="flex shrink-0 flex-col items-end gap-1">
                                    <span className={cls}>{txt}</span>
                                    {b.motivo === "DIVERGENCIA" ? (
                                        <button type="button" className={`${BTN_SEC} min-h-9 px-3 text-[13px]`} onClick={() => irPara("div")}>
                                            Resolver
                                        </button>
                                    ) : null}
                                </span>
                            </div>
                        );
                    })}
                    {dados.pausas.map((p) => (
                        <div key={`p${p.id}`} className={`flex items-center gap-3 px-4 py-3 ${LINHA}`}>
                            <span className="min-w-0 flex-1">
                                <span className="block break-words text-[15px] font-extrabold">{p.produto}</span>
                                <span className={`block text-[13px] ${MUTED}`}>
                                    {nomeLocal(p.local)} · pausado{p.por ? ` por ${p.por}` : ""} em {fd(p.criado_em)}
                                    {p.motivo ? ` · ${p.motivo}` : ""}
                                </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1">
                                <span className={CH_CINZA}>Pausado</span>
                                {dados.pode_gerir ? (
                                    <button type="button" disabled={ocupado} className={`${BTN_SEC} min-h-9 px-3 text-[13px]`} onClick={() => retomar(p.id)}>
                                        Retomar
                                    </button>
                                ) : null}
                            </span>
                        </div>
                    ))}
                </section>
            </div>

            <Janela aberta={execOpen} titulo="Execuções da reposição automática" onFechar={() => setExecOpen(false)}>
                {dados.execucoes.length === 0 ? <p className={`text-sm ${MUTED}`}>Nenhuma execução ainda.</p> : null}
                <ul>
                    {dados.execucoes.map((x) => (
                        <li key={x.id} className={`flex items-center gap-3 py-2.5 ${LINHA}`}>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-extrabold">
                                    {fdh(x.iniciado_em)} · {x.origem === "MANUAL" ? "botão" : "programada"}
                                </span>
                                <span className={`block text-[13px] ${MUTED}`}>
                                    {x.reqs_criadas} REQs · {x.faltas} faltas · {x.bloqueados} sem reposição
                                    {x.erro ? ` · ${x.erro}` : ""}
                                </span>
                            </span>
                            <span className={x.status === "OK" ? CH_OK : x.status === "ERRO" ? CH_RED : CH_PEND}>{x.status === "OK" ? "OK" : x.status === "ERRO" ? "Erro" : "Rodando"}</span>
                        </li>
                    ))}
                </ul>
            </Janela>
        </div>
    );
}

/* ============================== ABA: DIVERGÊNCIAS ============================== */

function AbaDivergencias({ dados, recarregar, msg }: { dados: DivResp | null; recarregar: (resolvidas?: boolean) => Promise<void>; msg: (t: string, erro?: boolean) => void }) {
    const [filtroOpen, setFiltroOpen] = useState(false);
    const [fTipo, setFTipo] = useState<string>("");
    const [fLocal, setFLocal] = useState<string>("");
    const [verResolvidas, setVerResolvidas] = useState(false);
    const [sel, setSel] = useState<Alerta | null>(null);
    const [novo, setNovo] = useState("");
    const [motivo, setMotivo] = useState("");
    const [ligado, setLigado] = useState("");
    const [obs, setObs] = useState("");
    const [semAjuste, setSemAjuste] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erroJanela, setErroJanela] = useState("");

    const rows = useMemo(() => (dados?.rows || []).filter((a) => (!fTipo || a.tipo === fTipo) && (!fLocal || (a.local || "") === fLocal)), [dados, fTipo, fLocal]);
    const locais = useMemo(() => Array.from(new Set((dados?.rows || []).map((a) => a.local || "").filter(Boolean))), [dados]);
    const fecharJanela = useCallback(() => {
        if (!salvando) setSel(null);
    }, [salvando]);

    if (!dados) return <Carregando />;
    const abertas = dados.rows.filter((a) => a.status === "ABERTO");
    const nLocal = abertas.filter((a) => a.tipo === "LOCAL_MENOS" || a.tipo === "LOCAL_MAIS").length;
    const nCam = abertas.filter((a) => a.tipo === "CAMINHO").length;
    const nBaixa = abertas.filter((a) => a.tipo === "BAIXA_PENDENTE").length;
    const nFiltros = (fTipo ? 1 : 0) + (fLocal ? 1 : 0);

    function abrir(a: Alerta) {
        setSel(a);
        setNovo(a.sugestao_saldo != null ? String(a.sugestao_saldo).replace(".", ",") : "");
        setMotivo("");
        setLigado("");
        setObs("");
        setSemAjuste(!["LOCAL_MENOS", "LOCAL_MAIS", "BAIXA_PENDENTE"].includes(a.tipo));
        setErroJanela("");
    }

    async function confirmar() {
        if (!sel) return;
        if (!motivo) return setErroJanela("Escolha o motivo.");
        if (!semAjuste && !SO_NUMERO.test(novo.trim())) return setErroJanela("Informe o novo saldo.");
        setSalvando(true);
        setErroJanela("");
        try {
            let codigo = "";
            if (!semAjuste) {
                const aj = await apiPost<Mut>(API_MAT, {
                    action: "saldo_setar",
                    produto_id: sel.produto_id,
                    deposito_id: sel.deposito_id,
                    quantidade: Math.round(num(novo)),
                    motivo: `${motivo}${ligado ? " · " + ligado : ""} (divergência #${sel.id})`,
                });
                if (!aj.ok) throw new Error(aj.msg || "O ajuste não foi lançado.");
                codigo = String(aj.codigo || "");
            }
            const r = await apiPost<Mut>(API_DASH, { acao: "resolver_alerta", id: sel.id, motivo, ajuste_codigo: codigo, atendimento_ligado: ligado, observacao: obs });
            if (!r.ok) throw new Error(r.msg || "Não foi possível resolver.");
            setSel(null);
            msg(codigo ? `Ajuste ${codigo} lançado. ${r.msg || ""}` : r.msg || "Resolvido.");
            await recarregar(verResolvidas);
        } catch (e: any) {
            setErroJanela(e?.message || "Erro.");
        } finally {
            setSalvando(false);
        }
    }

    async function pausar(a: Alerta) {
        try {
            const r = await apiPost<Mut>(API_DASH, { acao: "pausar", produto_id: a.produto_id, deposito_id: a.deposito_id, motivo: "Falta na origem" });
            if (!r.ok) throw new Error(r.msg || "Não foi possível pausar.");
            msg(r.msg || "Pausado.");
        } catch (e: any) {
            msg(e?.message || "Erro.", true);
        }
    }

    return (
        <div className="space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
                <Num rotulo="Abertas" valor={abertas.length} tom={abertas.length ? "r" : undefined} />
                <Num rotulo="No local" valor={nLocal} />
                <Num rotulo="No caminho" valor={nCam} />
                <Num rotulo="Baixa pendente" valor={nBaixa} tom={nBaixa ? "w" : undefined} />
                <Num rotulo="Resolvidas 7 dias" valor={dados.resolvidas_7d} tom="g" />
                <span className="hidden flex-1 sm:block" />
                <button type="button" className={`${BTN_SEC} min-h-9 flex-1 sm:flex-none`} onClick={() => setFiltroOpen(true)}>
                    <IconFilter size={18} stroke={1.8} /> Filtros{nFiltros ? <span className="rounded-full bg-[#313C55] px-2 text-[12px] text-white dark:bg-[#E9EFF6] dark:text-[#313C55]">{nFiltros}</span> : null}
                </button>
            </div>

            {verResolvidas ? <Aviso tipo="info">Mostrando as resolvidas dos últimos 30 dias.</Aviso> : null}

            <section className={CARD}>
                {rows.length === 0 ? <p className={`p-4 text-sm ${MUTED}`}>{verResolvidas ? "Nenhuma resolvida no período." : "Nenhuma divergência aberta."}</p> : null}
                {rows.map((a) => {
                    const [rot, cls] = TIPO_ALERTA[a.tipo] || [a.tipo, CH_CINZA];
                    const temNums = a.tipo === "CAMINHO" ? a.qtd_enviada != null : a.qtd_sistema != null;
                    const d = num(a.diferenca);
                    return (
                        <article key={a.id} className={`px-4 py-3.5 ${LINHA}`}>
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-[15px] font-extrabold">{a.tipo === "REQ_PARADA" ? a.requisicao_codigo || "Requisição" : a.produto}</p>
                                    <p className={`text-[13px] ${MUTED}`}>
                                        {nomeLocal(a.local)}
                                        {a.requisicao_codigo && a.tipo !== "REQ_PARADA" ? ` · ${a.requisicao_codigo}` : ""}
                                        {a.origem_item ? ` · de ${nomeLocal(a.origem_item)}` : ""} · {fdh(a.criado_em)}
                                    </p>
                                </div>
                                <span className={cls}>{rot}</span>
                            </div>
                            {temNums ? (
                                <div className="mt-2.5 grid grid-cols-3 gap-2">
                                    {(a.tipo === "CAMINHO"
                                        ? [["Enviado", fq(a.qtd_enviada)], ["Recebido", fq(a.qtd_recebida)]]
                                        : [["Sistema", fq(a.qtd_sistema)], ["Contado", fq(a.qtd_contada)]]
                                    ).map(([l, v]) => (
                                        <div key={l} className="rounded-xl bg-[#F1F4F8] px-2 py-1.5 text-center dark:bg-[#1C2334]">
                                            <small className={`block text-[11px] font-extrabold uppercase tracking-[.06em] ${MUTED}`}>{l}</small>
                                            <b className="text-lg">{v}</b>
                                        </div>
                                    ))}
                                    <div className="rounded-xl bg-[#F1F4F8] px-2 py-1.5 text-center dark:bg-[#1C2334]">
                                        <small className={`block text-[11px] font-extrabold uppercase tracking-[.06em] ${MUTED}`}>Diferença</small>
                                        <b className={`text-lg ${d < 0 ? "text-[#B42318] dark:text-[#FF9C92]" : "text-[#4E6B10] dark:text-[#D6EA94]"}`}>{fsig(d)}</b>
                                    </div>
                                </div>
                            ) : null}
                            {a.detalhe ? <p className={`mt-2 text-[13px] ${MUTED}`}>{a.detalhe}</p> : null}
                            {a.falecidos.length ? <p className="mt-1 text-[13px] font-bold">Atendimento: {a.falecidos.map((f) => f.nome).join(", ")}</p> : null}
                            {num(a.pausa_reposicao) === 1 && a.status === "ABERTO" ? (
                                <p className="mt-1 text-[13px] font-bold text-[#B42318] dark:text-[#FF9C92]">Reposição automática deste item pausada até resolver.</p>
                            ) : null}
                            {a.status !== "ABERTO" ? (
                                <p className={`mt-1 text-[13px] ${MUTED}`}>
                                    Resolvida {fdh(a.resolvido_em)}
                                    {a.resolvido_por_nome ? ` por ${a.resolvido_por_nome}` : ""} · {a.motivo_resolucao}
                                    {a.ajuste_codigo ? ` · ${a.ajuste_codigo}` : ""}
                                </p>
                            ) : dados.pode_gerir ? (
                                <div className="mt-2.5 flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
                                    {a.tipo === "REQ_PARADA" ? (
                                        <a href="/requisicoes" className={`${BTN_SEC} min-h-10`}>
                                            Abrir Requisições
                                        </a>
                                    ) : null}
                                    {a.tipo === "FALTA_ORIGEM" ? (
                                        <button type="button" className={`${BTN_SEC} min-h-10`} onClick={() => pausar(a)}>
                                            Pausar item
                                        </button>
                                    ) : null}
                                    <button type="button" className={`${BTN_PRI} min-h-10`} onClick={() => abrir(a)}>
                                        {["LOCAL_MENOS", "LOCAL_MAIS", "BAIXA_PENDENTE"].includes(a.tipo) ? "Ajustar saldo" : "Resolver"}
                                    </button>
                                </div>
                            ) : (
                                <p className={`mt-1 text-[12px] ${MUTED}`}>A correção é feita pela Gestão ou pelo Administrativo.</p>
                            )}
                        </article>
                    );
                })}
            </section>

            <Janela
                aberta={filtroOpen}
                titulo="Filtros"
                onFechar={() => setFiltroOpen(false)}
                rodape={
                    <>
                        <button
                            type="button"
                            className={BTN_SEC}
                            onClick={() => {
                                setFTipo("");
                                setFLocal("");
                            }}
                        >
                            Limpar
                        </button>
                        <button
                            type="button"
                            className={BTN_PRI}
                            onClick={async () => {
                                setFiltroOpen(false);
                                await recarregar(verResolvidas);
                            }}
                        >
                            Aplicar
                        </button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div>
                        <span className={ROTULO}>Situação</span>
                        <Chips
                            opcoes={[
                                { v: 0, l: "Abertas" },
                                { v: 1, l: "Resolvidas (30 dias)" },
                            ]}
                            valor={verResolvidas ? 1 : 0}
                            onChange={(v) => setVerResolvidas(v === 1)}
                        />
                    </div>
                    <div>
                        <span className={ROTULO}>Tipo</span>
                        <Chips opcoes={[{ v: "", l: "Todos" }, ...Object.entries(TIPO_ALERTA).map(([v, [l]]) => ({ v, l }))]} valor={fTipo} onChange={setFTipo} />
                    </div>
                    {locais.length ? (
                        <div>
                            <span className={ROTULO}>Local</span>
                            <Chips opcoes={[{ v: "", l: "Todos" }, ...locais.map((l) => ({ v: l, l: nomeLocal(l) }))]} valor={fLocal} onChange={setFLocal} />
                        </div>
                    ) : null}
                </div>
            </Janela>

            <Janela
                aberta={!!sel}
                titulo={sel && ["LOCAL_MENOS", "LOCAL_MAIS", "BAIXA_PENDENTE"].includes(sel.tipo) ? "Ajustar saldo" : "Resolver divergência"}
                onFechar={fecharJanela}
                rodape={
                    <>
                        <button type="button" className={BTN_SEC} onClick={fecharJanela} disabled={salvando}>
                            Voltar
                        </button>
                        <button type="button" className={BTN_PRI} onClick={confirmar} disabled={salvando}>
                            {salvando ? "Salvando..." : semAjuste ? "Resolver" : "Lançar ajuste e liberar"}
                        </button>
                    </>
                }
            >
                {sel ? (
                    <div className="space-y-4">
                        <div>
                            <p className="text-[15px] font-extrabold">{sel.produto || sel.requisicao_codigo}</p>
                            <p className={`text-[13px] ${MUTED}`}>
                                {nomeLocal(sel.local)} · {(TIPO_ALERTA[sel.tipo] || [sel.tipo])[0]}
                            </p>
                        </div>
                        {["LOCAL_MENOS", "LOCAL_MAIS", "BAIXA_PENDENTE"].includes(sel.tipo) ? (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="rounded-xl bg-[#F1F4F8] px-2 py-1.5 text-center dark:bg-[#1C2334]">
                                        <small className={`block text-[11px] font-extrabold uppercase ${MUTED}`}>Sistema agora</small>
                                        <b className="text-lg">{fq(sel.saldo_atual)}</b>
                                    </div>
                                    <div className="rounded-xl bg-[#F1F4F8] px-2 py-1.5 text-center dark:bg-[#1C2334]">
                                        <small className={`block text-[11px] font-extrabold uppercase ${MUTED}`}>Diferença achada</small>
                                        <b className="text-lg">{fsig(sel.diferenca)}</b>
                                    </div>
                                </div>
                                <label className="flex items-center gap-3 text-sm font-bold">
                                    <input type="checkbox" className="size-5" checked={semAjuste} onChange={(e) => setSemAjuste(e.target.checked)} />
                                    Não precisa ajustar (o sistema já está certo)
                                </label>
                                {!semAjuste ? (
                                    <div>
                                        <label className={ROTULO} htmlFor="aj-novo">
                                            Novo saldo
                                        </label>
                                        <input id="aj-novo" className={CAMPO} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={novo} onChange={(e) => setNovo(e.target.value.replace(/[^0-9.,]/g, ""))} />
                                        <p className={`mt-1 text-[12px] ${MUTED}`}>Sugestão: saldo de agora mais a diferença encontrada.</p>
                                    </div>
                                ) : null}
                            </>
                        ) : null}
                        <div>
                            <label className={ROTULO} htmlFor="aj-mot">
                                Motivo (obrigatório)
                            </label>
                            <select id="aj-mot" className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                                <option value="">Escolher...</option>
                                {(sel.tipo === "CAMINHO" ? ["Perda confirmada", "Item encontrado na origem", "Erro ao informar o recebimento", "Outro"] : sel.tipo === "FALTA_ORIGEM" ? ["Compra feita", "Enviado produto similar", "Item não será mais usado no local", "Outro"] : sel.tipo === "REQ_PARADA" ? ["Recebida", "Cancelada", "Outro"] : MOTIVOS_AJUSTE).map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={ROTULO} htmlFor="aj-fal">
                                Falecido do atendimento ligado (se houver)
                            </label>
                            <input id="aj-fal" className={CAMPO} list="aj-fal-lista" placeholder="Nome do falecido" value={ligado} onChange={(e) => setLigado(e.target.value)} />
                            <datalist id="aj-fal-lista">
                                {sel.falecidos.map((f) => (
                                    <option key={f.id} value={f.nome} />
                                ))}
                            </datalist>
                        </div>
                        <div>
                            <label className={ROTULO} htmlFor="aj-obs">
                                Observação
                            </label>
                            <input id="aj-obs" className={CAMPO} placeholder="O que foi apurado" value={obs} onChange={(e) => setObs(e.target.value)} />
                        </div>
                        {erroJanela ? <Aviso tipo="erro">{erroJanela}</Aviso> : null}
                    </div>
                ) : null}
            </Janela>
        </div>
    );
}

/* ============================== ABA: ATENDIMENTOS ============================== */

function AbaAtendimentos({ dados, carregar, msg }: { dados: AtResp | null; carregar: (ini: string, fim: string) => Promise<void>; msg: (t: string, erro?: boolean) => void }) {
    const [filtroOpen, setFiltroOpen] = useState(false);
    const [periodo, setPeriodo] = useState<"7" | "hoje" | "mes">("7");
    const [situacao, setSituacao] = useState<"abertos" | "todos" | "DIVERGENCIA" | "CONFERIDO">("abertos");
    const [sel, setSel] = useState<Atend | null>(null);
    const [mostraDiv, setMostraDiv] = useState(false);
    const [texto, setTexto] = useState("");
    const [salvando, setSalvando] = useState(false);
    const fechar = useCallback(() => {
        if (!salvando) setSel(null);
    }, [salvando]);

    if (!dados) return <Carregando />;
    const pend = dados.rows.filter((a) => a.status === "PENDENTE").length;
    const div = dados.rows.filter((a) => a.status === "DIVERGENCIA").length;
    const ok = dados.rows.filter((a) => a.status === "CONFERIDO").length;
    const lista = dados.rows.filter((a) => (situacao === "todos" ? true : situacao === "abertos" ? a.status !== "CONFERIDO" : a.status === situacao));

    function chip(s: string) {
        return s === "CONFERIDO" ? [CH_OK, "Conferido"] : s === "DIVERGENCIA" ? [CH_RED, "Divergência"] : [CH_PEND, "Pendente"];
    }

    async function marcar(status: "CONFERIDO" | "DIVERGENCIA") {
        if (!sel) return;
        if (status === "DIVERGENCIA" && !mostraDiv) {
            setMostraDiv(true);
            return;
        }
        setSalvando(true);
        try {
            const r = await apiPost<Mut>(API_DASH, { acao: "conferir_atendimento", atendimento_id: sel.id, status, observacao: texto });
            if (!r.ok) throw new Error(r.msg || "Não foi possível salvar.");
            setSel(null);
            msg(r.msg || "Salvo.");
            await carregar(dados!.ini, dados!.fim);
        } catch (e: any) {
            msg(e?.message || "Erro.", true);
        } finally {
            setSalvando(false);
        }
    }

    async function aplicar() {
        setFiltroOpen(false);
        const fim = hojeIso();
        const ini = periodo === "hoje" ? fim : periodo === "mes" ? `${fim.slice(0, 8)}01` : hojeIso(-6);
        await carregar(ini, fim);
    }

    return (
        <div className="space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
                <Num rotulo="Pendentes" valor={pend} tom={pend ? "w" : undefined} />
                <Num rotulo="Divergência" valor={div} tom={div ? "r" : undefined} />
                <Num rotulo="Conferidos" valor={ok} tom="g" />
                <span className="hidden flex-1 sm:block" />
                <button type="button" className={`${BTN_SEC} min-h-9 flex-1 sm:flex-none`} onClick={() => setFiltroOpen(true)}>
                    <IconFilter size={18} stroke={1.8} /> Filtros
                </button>
            </div>

            <section className={CARD}>
                {lista.length === 0 ? <p className={`p-4 text-sm ${MUTED}`}>Nada para conferir neste filtro.</p> : null}
                {lista.map((a) => {
                    const [cls, txt] = chip(a.status);
                    return (
                        <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                                setSel(a);
                                setMostraDiv(false);
                                setTexto(a.conferencia?.observacao || "");
                            }}
                            className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#F6F8FB] dark:hover:bg-white/[0.04] ${LINHA}`}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block break-words text-[15px] font-extrabold">{a.falecido || "Sem nome"}</span>
                                <span className={`block text-[13px] ${MUTED}`}>
                                    #{a.id} · {a.quando ? fdh(a.quando) : "sem baixa"} · {a.itens.length} itens{a.por ? ` · ${a.por}` : ""}
                                </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1">
                                <span className={cls}>{txt}</span>
                                {a.alertas.length ? <span className={CH_AMA}>Alerta</span> : null}
                            </span>
                        </button>
                    );
                })}
            </section>

            <Janela
                aberta={filtroOpen}
                titulo="Filtros"
                onFechar={() => setFiltroOpen(false)}
                rodape={
                    <button type="button" className={BTN_PRI} onClick={aplicar}>
                        Aplicar
                    </button>
                }
            >
                <div className="space-y-4">
                    <div>
                        <span className={ROTULO}>Período</span>
                        <Chips
                            opcoes={[
                                { v: "hoje", l: "Hoje" },
                                { v: "7", l: "Últimos 7 dias" },
                                { v: "mes", l: "Este mês" },
                            ]}
                            valor={periodo}
                            onChange={(v) => setPeriodo(v as typeof periodo)}
                        />
                    </div>
                    <div>
                        <span className={ROTULO}>Situação</span>
                        <Chips
                            opcoes={[
                                { v: "abertos", l: "Pendentes e divergência" },
                                { v: "DIVERGENCIA", l: "Divergência" },
                                { v: "CONFERIDO", l: "Conferidos" },
                                { v: "todos", l: "Todos" },
                            ]}
                            valor={situacao}
                            onChange={(v) => setSituacao(v as typeof situacao)}
                        />
                    </div>
                </div>
            </Janela>

            <Janela
                aberta={!!sel}
                titulo={sel ? `${sel.falecido || "Atendimento"} · #${sel.id}` : ""}
                onFechar={fechar}
                rodape={
                    <>
                        <button type="button" className={BTN_DNG} disabled={salvando || (mostraDiv && !texto.trim())} onClick={() => marcar("DIVERGENCIA")}>
                            {mostraDiv ? "Salvar divergência" : "Divergência"}
                        </button>
                        <button type="button" className={BTN_OK} disabled={salvando} onClick={() => marcar("CONFERIDO")}>
                            Conferido
                        </button>
                    </>
                }
            >
                {sel ? (
                    <div className="space-y-3">
                        <p className={`text-[13px] ${MUTED}`}>
                            {sel.quando ? `Baixa em ${fdh(sel.quando)}${sel.por ? " por " + sel.por : ""}` : "Sem baixa registrada"}
                            {sel.conferencia ? ` · última conferência: ${sel.conferencia.por} em ${fdh(sel.conferencia.em)}` : ""}
                        </p>
                        {sel.alertas.map((t, k) => (
                            <Aviso key={k} tipo="info">
                                {t}
                            </Aviso>
                        ))}
                        <ul>
                            {sel.itens.map((i, k) => (
                                <li key={k} className={`flex items-center justify-between gap-3 py-2 ${LINHA}`}>
                                    <span className="min-w-0">
                                        <span className={`block break-words text-[15px] font-bold ${i.estornado ? "line-through opacity-60" : ""}`}>
                                            {i.produto}
                                            {num(i.qtd) !== 1 ? ` × ${fq(i.qtd)}` : ""}
                                        </span>
                                        <span className={`block text-[12px] ${MUTED}`}>
                                            {i.tipo}
                                            {i.estornado ? " · estornado" : ""}
                                        </span>
                                    </span>
                                    <span className={CH_CINZA}>{nomeLocal(i.local)}</span>
                                </li>
                            ))}
                        </ul>
                        {mostraDiv ? (
                            <div>
                                <label className={ROTULO} htmlFor="at-div">
                                    O que está diferente?
                                </label>
                                <input id="at-div" className={CAMPO} placeholder="Ex.: a urna usada foi a 008, não a 002" value={texto} onChange={(e) => setTexto(e.target.value)} />
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </Janela>
        </div>
    );
}

/* ============================== ABA: CONTAGEM ============================== */

function AbaContagem({ msg, aoMudar }: { msg: (t: string, erro?: boolean) => void; aoMudar: () => void }) {
    const [dados, setDados] = useState<ContResp | null>(null);
    const [dep, setDep] = useState(0);
    const [cega, setCega] = useState(true);
    const [vals, setVals] = useState<Record<number, string>>({});
    const [resultado, setResultado] = useState<{ produto_id: number; sistema: number; contado: number; diferenca: number }[] | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");

    const carregar = useCallback(async (d: number, c: boolean) => {
        setErro("");
        try {
            const r = await apiGet<ContResp>(API_DASH, { acao: "contagem_itens", deposito_id: d || undefined, cega: c ? 1 : 0 });
            if (!r.ok) throw new Error(r.msg || "Não foi possível carregar.");
            setDados(r);
            setDep(r.deposito_id);
        } catch (e: any) {
            setErro(e?.message || "Erro.");
        }
    }, []);

    useEffect(() => {
        void carregar(0, true);
    }, [carregar]);

    if (erro && !dados) return <Aviso tipo="erro">{erro}</Aviso>;
    if (!dados) return <Carregando />;

    const feitos = dados.itens.filter((i) => SO_NUMERO.test((vals[i.produto_id] || "").trim())).length;
    const total = dados.itens.length;

    async function concluir() {
        if (!dados || feitos < total) return;
        setSalvando(true);
        try {
            const r = await apiPost<Mut & { itens?: { produto_id: number; sistema: number; contado: number; diferenca: number }[] }>(API_DASH, {
                acao: "contagem_salvar",
                deposito_id: dep,
                cega: cega ? 1 : 0,
                itens: dados.itens.map((i) => ({ produto_id: i.produto_id, contado: (vals[i.produto_id] || "").trim() })),
            });
            if (!r.ok) throw new Error(r.msg || "Não foi possível guardar.");
            setResultado(r.itens || []);
            msg(r.msg || "Contagem guardada.");
            aoMudar();
        } catch (e: any) {
            msg(e?.message || "Erro.", true);
        } finally {
            setSalvando(false);
        }
    }

    const nomeProd = (id: number) => dados.itens.find((i) => i.produto_id === id)?.nome || `#${id}`;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                <Chips
                    opcoes={dados.locais.map((l) => ({ v: l.deposito_id, l: nomeLocal(l.nome) }))}
                    valor={dep}
                    onChange={(v) => {
                        setVals({});
                        setResultado(null);
                        void carregar(v, cega);
                    }}
                />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Num rotulo="Contados" valor={`${feitos}/${total}`} />
                <Num rotulo="Última" valor={dados.ultima ? `${fd(dados.ultima.criado_em)} · ${dados.ultima.com_diferenca} dif.` : "nunca"} />
                <span className="hidden flex-1 sm:block" />
                <button
                    type="button"
                    aria-pressed={cega}
                    onClick={() => {
                        const c = !cega;
                        setCega(c);
                        void carregar(dep, c);
                    }}
                    className={`${BTN_SEC} min-h-9 flex-1 sm:flex-none`}
                >
                    <span className={`relative h-[22px] w-[38px] rounded-full ${cega ? "bg-[#B3CE52]" : "bg-[#C9D1DE] dark:bg-white/25"}`}>
                        <span className={`absolute top-[3px] size-4 rounded-full bg-white transition-all ${cega ? "left-[19px]" : "left-[3px]"}`} />
                    </span>
                    Às cegas
                </button>
            </div>

            {resultado ? (
                <section className={CARD}>
                    <div className={`px-4 py-3 ${LINHA}`}>
                        <h3 className="text-base font-extrabold">Resultado da contagem</h3>
                    </div>
                    {resultado.map((r) => (
                        <div key={r.produto_id} className={`flex items-center gap-3 px-4 py-2.5 ${LINHA}`}>
                            <span className="min-w-0 flex-1 break-words text-[15px] font-bold">{nomeProd(r.produto_id)}</span>
                            <span className={`text-[13px] ${MUTED}`}>
                                sistema {fq(r.sistema)} · contado {fq(r.contado)}
                            </span>
                            <span className={num(r.diferenca) === 0 ? CH_OK : CH_RED}>{num(r.diferenca) === 0 ? "OK" : fsig(r.diferenca)}</span>
                        </div>
                    ))}
                    <div className="p-4">
                        <button
                            type="button"
                            className={`${BTN_SEC} w-full`}
                            onClick={() => {
                                setResultado(null);
                                setVals({});
                                void carregar(dep, cega);
                            }}
                        >
                            Nova contagem
                        </button>
                    </div>
                </section>
            ) : (
                <section className={CARD}>
                    {total === 0 ? <p className={`p-4 text-sm ${MUTED}`}>Nenhum produto se moveu neste local desde a última contagem.</p> : null}
                    {dados.itens.map((i) => {
                        const v = vals[i.produto_id] || "";
                        const tem = SO_NUMERO.test(v.trim());
                        const dif = tem && i.sistema !== undefined ? num(v) - num(i.sistema) : null;
                        return (
                            <div key={i.produto_id} className={`flex items-center gap-3 px-4 py-3 ${LINHA}`}>
                                <span className="min-w-0 flex-1">
                                    <span className="block break-words text-[15px] font-extrabold">{i.nome}</span>
                                    {!cega && i.sistema !== undefined ? (
                                        <span className={`block text-[13px] ${MUTED}`}>
                                            Sistema {fq(i.sistema)}
                                            {dif !== null ? <b className={dif === 0 ? "" : dif < 0 ? " text-[#B42318] dark:text-[#FF9C92]" : " text-[#4E6B10] dark:text-[#D6EA94]"}> · dif. {fsig(dif)}</b> : null}
                                        </span>
                                    ) : null}
                                </span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    autoComplete="off"
                                    placeholder="—"
                                    aria-label={`Quantidade contada de ${i.nome}`}
                                    className={CAMPO_NUM}
                                    value={v}
                                    onChange={(e) => setVals((p) => ({ ...p, [i.produto_id]: e.target.value.replace(/[^0-9.,]/g, "") }))}
                                />
                            </div>
                        );
                    })}
                    {total > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-4 py-3 dark:border-white/[0.12] dark:bg-[#1C2334]">
                            <span className={`flex-1 text-[13px] font-bold ${MUTED}`}>{feitos < total ? `Falta preencher ${total - feitos}` : "Tudo preenchido"}</span>
                            <button type="button" className={`${BTN_PRI} w-full sm:w-auto`} disabled={salvando || feitos < total} onClick={concluir}>
                                {salvando ? "Guardando..." : "Concluir contagem"}
                            </button>
                        </div>
                    ) : null}
                </section>
            )}
        </div>
    );
}

/* ============================== ABA: RELATÓRIOS ============================== */

function baixarCsv(nome: string, linhas: (string | number)[][]) {
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
}

function imprimir(titulo: string, rows: RelRow[]) {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] || c);
    const tr = rows
        .map(
            (r) =>
                `<tr><td>${esc(r.produto)}</td><td>${fq(r.inicio)}</td><td>${fq(r.entradas)}</td><td>${fq(r.transf_recebidas)}</td><td>${fq(r.transf_enviadas)}</td><td>${fq(r.saidas)}</td><td>${fsig(r.ajustes)}</td><td>${fq(r.final)}</td><td>${r.contado === null ? "" : fq(r.contado)}</td><td>${r.diferenca === null ? "" : fsig(r.diferenca)}</td></tr>`
        )
        .join("");
    w.document.write(
        `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>body{font-family:Arial,sans-serif;font-size:11pt;margin:18mm}h1{font-size:15pt}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px 6px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#eee}.ass{margin-top:40px;display:flex;gap:40px}.ass div{flex:1;border-top:1px solid #000;padding-top:4px;text-align:center}</style></head><body><h1>${esc(titulo)}</h1><table><thead><tr><th>Produto</th><th>Início</th><th>Entradas</th><th>Transf. receb.</th><th>Transf. env.</th><th>Saídas</th><th>Ajustes</th><th>Final</th><th>Contado</th><th>Dif.</th></tr></thead><tbody>${tr}</tbody></table><div class="ass"><div>Conferente</div><div>Gestão</div></div><script>window.print()<\/script></body></html>`
    );
    w.document.close();
}

function AbaRelatorios({ msg }: { msg: (t: string, erro?: boolean) => void }) {
    const [dados, setDados] = useState<RelResp | null>(null);
    const [congelada, setCongelada] = useState<{ id: number; titulo: string } | null>(null);
    const [filtroOpen, setFiltroOpen] = useState(false);
    const [fDep, setFDep] = useState(0);
    const [fIni, setFIni] = useState(hojeIso(-7));
    const [fFim, setFFim] = useState(hojeIso());
    const [abertos, setAbertos] = useState<Record<number, boolean>>({});
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");

    const carregar = useCallback(async (dep: number, ini: string, fim: string) => {
        setErro("");
        try {
            const r = await apiGet<RelResp>(API_DASH, { acao: "relatorio", deposito_id: dep || undefined, ini, fim });
            if (!r.ok) throw new Error(r.msg || "Não foi possível gerar o relatório.");
            setDados(r);
            setFDep(r.deposito_id);
            setFIni(r.ini);
            setFFim(r.fim);
            setCongelada(null);
        } catch (e: any) {
            setErro(e?.message || "Erro.");
        }
    }, []);

    useEffect(() => {
        void carregar(0, hojeIso(-7), hojeIso());
    }, [carregar]);

    async function abrirGuardada(g: Guardada) {
        try {
            const r = await apiGet<{ ok: boolean; msg?: string; rows: RelRow[]; movs: RelMov[] }>(API_DASH, { acao: "relatorio_guardado", id: g.id });
            if (!r.ok) throw new Error(r.msg || "Não foi possível abrir.");
            setDados((d) => (d ? { ...d, rows: r.rows, movs: r.movs } : d));
            setCongelada({ id: g.id, titulo: `Conferência #${g.id} · ${nomeLocal(g.local)} · ${fd(g.inicio)} a ${fd(g.fim)}` });
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (e: any) {
            msg(e?.message || "Erro.", true);
        }
    }

    async function guardar() {
        if (!dados) return;
        setSalvando(true);
        try {
            const r = await apiPost<Mut>(API_DASH, { acao: "relatorio_guardar", deposito_id: dados.deposito_id, ini: dados.ini, fim: dados.fim });
            if (!r.ok) throw new Error(r.msg || "Não foi possível guardar.");
            msg(`${r.msg || "Guardada."} O relatório fica congelado: estornos feitos depois não mudam o que foi conferido.`);
            await carregar(dados.deposito_id, dados.ini, dados.fim);
        } catch (e: any) {
            msg(e?.message || "Erro.", true);
        } finally {
            setSalvando(false);
        }
    }

    if (erro && !dados) return <Aviso tipo="erro">{erro}</Aviso>;
    if (!dados) return <Carregando />;

    const local = nomeLocal(dados.depositos.find((d) => d.id === dados.deposito_id)?.nome);
    const titulo = congelada ? congelada.titulo : `${local} · ${fd(dados.ini)} a ${fd(dados.fim)}`;
    const tot = dados.rows.reduce(
        (a, r) => ({
            ini: a.ini + r.inicio,
            ent: a.ent + r.entradas + r.transf_recebidas,
            sai: a.sai + r.saidas + r.transf_enviadas,
            aj: a.aj + r.ajustes,
            fim: a.fim + r.final,
            dif: a.dif + (r.diferenca || 0),
        }),
        { ini: 0, ent: 0, sai: 0, aj: 0, fim: 0, dif: 0 }
    );
    const movsDe = (id: number) => dados.movs.filter((m) => m.produto_id === id);
    const toggle = (id: number) => setAbertos((p) => ({ ...p, [id]: !p[id] }));

    function csv() {
        baixarCsv(`conferencia_${local.replace(/\s+/g, "_")}_${dados!.ini}_${dados!.fim}.csv`, [
            ["Produto", "Início", "Entradas", "Transf. recebidas", "Transf. enviadas", "Saídas", "Ajustes", "Final", "Contado", "Diferença"],
            ...dados!.rows.map((r) => [r.produto, fq(r.inicio), fq(r.entradas), fq(r.transf_recebidas), fq(r.transf_enviadas), fq(r.saidas), fq(r.ajustes), fq(r.final), r.contado === null ? "" : fq(r.contado), r.diferenca === null ? "" : fq(r.diferenca)]),
        ]);
    }

    return (
        <div className="space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex min-h-9 items-center rounded-xl border border-[#E3E8F0] bg-white px-3 text-[13px] font-extrabold dark:border-white/[0.12] dark:bg-[#232B3F]">{titulo}</span>
                <span className="hidden flex-1 sm:block" />
                <button type="button" className={`${BTN_SEC} min-h-9 flex-1 sm:flex-none`} onClick={() => setFiltroOpen(true)}>
                    <IconFilter size={18} stroke={1.8} /> Filtros
                </button>
            </div>
            {congelada ? <Aviso tipo="info">Conferência guardada (congelada). Use Filtros para voltar ao relatório ao vivo.</Aviso> : null}

            <div className="flex flex-wrap gap-2">
                <Num rotulo="Início" valor={fq(tot.ini)} />
                <Num rotulo="Entrou" valor={`+${fq(tot.ent)}`} tom="g" />
                <Num rotulo="Saiu" valor={`−${fq(tot.sai)}`} tom="r" />
                {tot.aj ? <Num rotulo="Ajustes" valor={fsig(tot.aj)} /> : null}
                <Num rotulo="Final" valor={fq(tot.fim)} />
                <Num rotulo="Dif. contagens" valor={fsig(tot.dif)} tom={tot.dif ? "r" : "g"} />
            </div>

            <section className={CARD}>
                {dados.rows.length === 0 ? <p className={`p-4 text-sm ${MUTED}`}>Nenhum movimento nem saldo neste local.</p> : null}

                {/* computador */}
                <div className="hidden lg:block">
                    <table className="w-full table-fixed border-collapse text-sm">
                        <thead>
                            <tr className={`text-[11px] font-extrabold uppercase tracking-[.06em] ${MUTED}`}>
                                <th className="w-[28%] px-3 py-2.5 text-left">Produto</th>
                                {["Início", "Entradas", "Transf. receb.", "Transf. env.", "Saídas", "Ajustes", "Final", "Contado", "Dif."].map((h) => (
                                    <th key={h} className="px-2 py-2.5 text-right">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {dados.rows.map((r) => (
                                <React.Fragment key={r.produto_id}>
                                    <tr className="border-t border-[#E3E8F0] dark:border-white/[0.10]">
                                        <td className="px-3 py-2">
                                            <button type="button" className="flex min-h-10 items-center gap-2 text-left font-bold" onClick={() => toggle(r.produto_id)} aria-expanded={!!abertos[r.produto_id]}>
                                                <Seta aberta={!!abertos[r.produto_id]} />
                                                <span className="break-words">{r.produto}</span>
                                            </button>
                                        </td>
                                        {[r.inicio, r.entradas, r.transf_recebidas, r.transf_enviadas, r.saidas].map((v, k) => (
                                            <td key={k} className="px-2 py-2 text-right tabular-nums">
                                                {fq(v)}
                                            </td>
                                        ))}
                                        <td className="px-2 py-2 text-right tabular-nums">{r.ajustes ? fsig(r.ajustes) : "0"}</td>
                                        <td className="px-2 py-2 text-right font-extrabold tabular-nums">{fq(r.final)}</td>
                                        <td className="px-2 py-2 text-right tabular-nums">{r.contado === null ? "—" : fq(r.contado)}</td>
                                        <td className={`px-2 py-2 text-right font-extrabold tabular-nums ${!r.diferenca ? MUTED : r.diferenca < 0 ? "text-[#B42318] dark:text-[#FF9C92]" : "text-[#4E6B10] dark:text-[#D6EA94]"}`}>
                                            {r.diferenca === null ? "—" : fsig(r.diferenca)}
                                        </td>
                                    </tr>
                                    {abertos[r.produto_id]
                                        ? movsDe(r.produto_id).map((m, k) => (
                                              <tr key={k} className={`bg-[#F6F8FB] text-[13px] dark:bg-[#1C2334] ${MUTED}`}>
                                                  <td className="px-3 py-1.5 pl-10" colSpan={7}>
                                                      {fdh(m.quando)} · {m.tipo === "TRANSFERENCIA" ? "Transferência" : m.tipo === "SAIDA" ? "Saída" : m.tipo === "ENTRADA" ? "Entrada" : "Ajuste"} · {m.ref}
                                                      {m.por ? ` · ${m.por}` : ""}
                                                  </td>
                                                  <td className={`px-2 py-1.5 text-right font-extrabold ${m.efeito < 0 ? "text-[#B42318] dark:text-[#FF9C92]" : "text-[#4E6B10] dark:text-[#D6EA94]"}`} colSpan={3}>
                                                      {fsig(m.efeito)}
                                                  </td>
                                              </tr>
                                          ))
                                        : null}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* celular: um cartão por produto, sem rolagem lateral */}
                <div className="lg:hidden">
                    {dados.rows.map((r) => (
                        <div key={r.produto_id} className={`px-4 py-3 ${LINHA}`}>
                            <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => toggle(r.produto_id)} aria-expanded={!!abertos[r.produto_id]}>
                                <Seta aberta={!!abertos[r.produto_id]} />
                                <span className="min-w-0 flex-1 break-words text-[15px] font-extrabold">{r.produto}</span>
                                <span className={r.diferenca === null ? CH_CINZA : r.diferenca === 0 ? CH_OK : CH_RED}>{r.diferenca === null ? "sem contagem" : r.diferenca === 0 ? "OK" : `Dif. ${fsig(r.diferenca)}`}</span>
                            </button>
                            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 pl-6 text-sm tabular-nums">
                                <span>
                                    Início <b>{fq(r.inicio)}</b>
                                </span>
                                <span className={MUTED}>→</span>
                                <span className="font-bold text-[#4E6B10] dark:text-[#D6EA94]">+{fq(r.entradas + r.transf_recebidas)}</span>
                                <span className="font-bold text-[#B42318] dark:text-[#FF9C92]">−{fq(r.saidas + r.transf_enviadas)}</span>
                                {r.ajustes ? <span className="font-bold">aj. {fsig(r.ajustes)}</span> : null}
                                <span className={MUTED}>→</span>
                                <span>
                                    Final <b>{fq(r.final)}</b>
                                </span>
                                {r.contado !== null ? (
                                    <span>
                                        · Contado <b>{fq(r.contado)}</b>
                                    </span>
                                ) : null}
                            </p>
                            {abertos[r.produto_id] ? (
                                <ul className="mt-1 pl-6">
                                    {movsDe(r.produto_id).map((m, k) => (
                                        <li key={k} className={`flex justify-between gap-3 py-1 text-[13px] ${MUTED}`}>
                                            <span className="min-w-0 break-words">
                                                {fdh(m.quando)} · {m.ref}
                                            </span>
                                            <b className={m.efeito < 0 ? "text-[#B42318] dark:text-[#FF9C92]" : "text-[#4E6B10] dark:text-[#D6EA94]"}>{fsig(m.efeito)}</b>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-4 py-3 dark:border-white/[0.12] dark:bg-[#1C2334]">
                    <button type="button" className={`${BTN_SEC} flex-1 sm:flex-none`} onClick={() => imprimir(titulo, dados.rows)}>
                        PDF
                    </button>
                    <button type="button" className={`${BTN_SEC} flex-1 sm:flex-none`} onClick={csv}>
                        Excel
                    </button>
                    {!congelada ? (
                        <button type="button" className={`${BTN_PRI} w-full sm:ml-auto sm:w-auto`} disabled={salvando || dados.rows.length === 0} onClick={guardar}>
                            {salvando ? "Guardando..." : "Fechar e guardar"}
                        </button>
                    ) : null}
                </div>
            </section>

            <section className={CARD}>
                <div className={`px-4 py-3 ${LINHA}`}>
                    <h3 className="text-base font-extrabold">Conferências guardadas</h3>
                </div>
                {dados.guardadas.length === 0 ? <p className={`p-4 text-sm ${MUTED}`}>Nenhuma ainda.</p> : null}
                {dados.guardadas.map((g) => (
                    <button key={g.id} type="button" onClick={() => abrirGuardada(g)} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#F6F8FB] dark:hover:bg-white/[0.04] ${LINHA}`}>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-extrabold">
                                #{g.id} · {nomeLocal(g.local)}
                            </span>
                            <span className={`block text-[13px] ${MUTED}`}>
                                {fd(g.inicio)} a {fd(g.fim)} · {g.usuario || ""} em {fd(g.criado_em)}
                            </span>
                        </span>
                        <span className={num(g.total_diferenca) === 0 ? CH_OK : CH_RED}>{num(g.total_diferenca) === 0 ? "OK" : `Dif. ${fsig(g.total_diferenca)}`}</span>
                    </button>
                ))}
            </section>

            <Janela
                aberta={filtroOpen}
                titulo="Filtros do relatório"
                onFechar={() => setFiltroOpen(false)}
                rodape={
                    <button
                        type="button"
                        className={BTN_PRI}
                        onClick={async () => {
                            setFiltroOpen(false);
                            await carregar(fDep, fIni, fFim);
                        }}
                    >
                        Gerar relatório
                    </button>
                }
            >
                <div className="space-y-4">
                    <div>
                        <span className={ROTULO}>Local</span>
                        <Chips opcoes={dados.depositos.map((d) => ({ v: d.id, l: nomeLocal(d.nome) }))} valor={fDep} onChange={setFDep} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={ROTULO} htmlFor="rel-ini">
                                Início
                            </label>
                            <input id="rel-ini" type="date" className={CAMPO} value={fIni} max={fFim} onChange={(e) => setFIni(e.target.value)} />
                        </div>
                        <div>
                            <label className={ROTULO} htmlFor="rel-fim">
                                Fim
                            </label>
                            <input id="rel-fim" type="date" className={CAMPO} value={fFim} min={fIni} onChange={(e) => setFFim(e.target.value)} />
                        </div>
                    </div>
                    <p className={`text-[12px] ${MUTED}`}>Saldo no início = saldo de hoje menos tudo o que se moveu depois da data de início.</p>
                </div>
            </Janela>
        </div>
    );
}

/* ============================== TELA ============================== */

export default function DashboardEstoque() {
    const [aba, setAba] = useState<Aba>("rep");
    const [rep, setRep] = useState<RepResp | null>(null);
    const [div, setDiv] = useState<DivResp | null>(null);
    const [at, setAt] = useState<AtResp | null>(null);
    const [aviso, setAviso] = useState<{ t: string; erro: boolean } | null>(null);
    const [ajuda, setAjuda] = useState(false);
    const [versao, setVersao] = useState(0);

    const msg = useCallback((t: string, erro = false) => {
        setAviso({ t, erro });
        window.setTimeout(() => setAviso((a) => (a && a.t === t ? null : a)), 7000);
    }, []);

    const carregarRep = useCallback(async () => {
        try {
            const r = await apiGet<RepResp>(API_DASH, { acao: "reposicoes" });
            if (!r.ok) throw new Error(r.msg || "Não foi possível carregar as reposições.");
            setRep(r);
        } catch (e: any) {
            msg(e?.message || "Erro.", true);
        }
    }, [msg]);

    const carregarDiv = useCallback(
        async (resolvidas = false) => {
            try {
                const r = await apiGet<DivResp>(API_DASH, { acao: "divergencias", resolvidas: resolvidas ? 1 : undefined });
                if (!r.ok) throw new Error(r.msg || "Não foi possível carregar as divergências.");
                setDiv(r);
            } catch (e: any) {
                msg(e?.message || "Erro.", true);
            }
        },
        [msg]
    );

    const carregarAt = useCallback(
        async (ini: string, fim: string) => {
            try {
                const r = await apiGet<AtResp>(API_DASH, { acao: "atendimentos", ini, fim });
                if (!r.ok) throw new Error(r.msg || "Não foi possível carregar os atendimentos.");
                setAt(r);
            } catch (e: any) {
                msg(e?.message || "Erro.", true);
            }
        },
        [msg]
    );

    const tudo = useCallback(async () => {
        await Promise.all([carregarRep(), carregarDiv(), carregarAt(hojeIso(-6), hojeIso())]);
        setVersao((v) => v + 1);
    }, [carregarRep, carregarDiv, carregarAt]);

    useEffect(() => {
        void tudo();
    }, [tudo]);

    const nRep = rep ? rep.reqs.filter((r) => r.status === "EM_TRANSITO").length : 0;
    const nDiv = div ? div.rows.filter((a) => a.status === "ABERTO").length : 0;
    const nAt = at ? at.rows.filter((a) => a.status !== "CONFERIDO").length : 0;

    const abas: { k: Aba; l: string; c: string; n: number }[] = [
        { k: "rep", l: "Reposições", c: "Reposição", n: nRep },
        { k: "div", l: "Divergências", c: "Divergência", n: nDiv },
        { k: "at", l: "Atendimentos", c: "Atendim.", n: nAt },
        { k: "cont", l: "Contagem", c: "Contagem", n: 0 },
        { k: "rel", l: "Relatórios", c: "Relatório", n: 0 },
    ];

    return (
        <div className="min-h-[calc(100dvh-1px)] overflow-x-hidden bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto max-w-[1240px] px-3 pb-24 pt-3.5 lg:px-8 lg:pb-12 lg:pt-6">
                <header className="mb-3 flex items-center gap-2">
                    <h1 className="min-w-0 flex-1 text-[22px] font-extrabold leading-tight lg:text-[28px]">Dashboard do estoque</h1>
                    <button type="button" aria-label="Como funciona a reposição" onClick={() => setAjuda(true)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#C9D1DE] bg-white dark:border-white/[0.2] dark:bg-[#232B3F]">
                        <IconHelp size={20} stroke={1.8} />
                    </button>
                    <button type="button" aria-label="Atualizar" onClick={() => void tudo()} className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#C9D1DE] bg-white dark:border-white/[0.2] dark:bg-[#232B3F]">
                        <IconRefresh size={20} stroke={1.8} />
                    </button>
                </header>

                <nav role="tablist" className="mb-3 grid grid-cols-5 gap-1 lg:flex lg:gap-1.5">
                    {abas.map((a) => (
                        <button
                            key={a.k}
                            type="button"
                            role="tab"
                            aria-selected={aba === a.k}
                            onClick={() => setAba(a.k)}
                            className={[
                                "relative flex min-h-[54px] flex-col items-center justify-center rounded-xl border px-0.5 text-[11px] font-bold lg:min-h-11 lg:flex-row lg:gap-2 lg:px-4 lg:text-sm",
                                aba === a.k
                                    ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                                    : "border-[#E3E8F0] bg-white text-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#C8CFDC]",
                            ].join(" ")}
                        >
                            <span className="lg:hidden">{a.c}</span>
                            <span className="hidden lg:inline">{a.l}</span>
                            {a.n > 0 ? (
                                <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#F2CB3F] px-1 text-[11px] font-extrabold text-[#313C55] lg:static lg:h-5 lg:min-w-5">
                                    {a.n}
                                </span>
                            ) : null}
                        </button>
                    ))}
                </nav>

                {aviso ? (
                    <div className="mb-3">
                        <Aviso tipo={aviso.erro ? "erro" : "ok"}>{aviso.t}</Aviso>
                    </div>
                ) : null}

                {aba === "rep" ? <AbaReposicoes dados={rep} recarregar={carregarRep} irPara={setAba} msg={msg} /> : null}
                {aba === "div" ? (
                    <AbaDivergencias
                        dados={div}
                        recarregar={async (r) => {
                            await carregarDiv(r);
                            await carregarRep();
                        }}
                        msg={msg}
                    />
                ) : null}
                {aba === "at" ? <AbaAtendimentos dados={at} carregar={carregarAt} msg={msg} /> : null}
                {aba === "cont" ? <AbaContagem key={`c${versao}`} msg={msg} aoMudar={() => void carregarDiv()} /> : null}
                {aba === "rel" ? <AbaRelatorios key={`r${versao}`} msg={msg} /> : null}
            </div>

            <Janela aberta={ajuda} titulo="Como funciona a reposição" onFechar={() => setAjuda(false)}>
                <ol className="space-y-2.5">
                    {REGRAS.map((t, k) => (
                        <li key={k} className="flex gap-3 text-sm leading-relaxed">
                            <b className="w-5 shrink-0 text-[#8A6A00] dark:text-[#F2CB3F]">{k + 1}</b>
                            <span>{t}</span>
                        </li>
                    ))}
                </ol>
            </Janela>
        </div>
    );
}
