"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconMessageCircle2,
    IconCheck,
    IconTrash,
    IconX,
    IconRefresh,
    IconDownload,
    IconSearch,
    IconBook2,
    IconExternalLink,
    IconMicrophone,
    IconPlayerPlay,
    IconSparkles,
} from "@tabler/icons-react";

type AttendanceFilter = "todos" | "sala01" | "sala02" | "sala03" | "externo";
type PeriodStatus = "em_andamento" | "agendado" | "encerrado" | "sem_horario";
type MessageStatus = "pendente" | "aprovado" | "reprovado" | "excluido";

type MessageItem = {
    id: number;
    tipo?: string;
    name: string;
    text: string;
    image?: string | null;
    status?: MessageStatus | string;
    criado_em?: string | null;
    arquivo_mime?: string | null;
    aprovado_por?: string | null;
    aprovado_em?: string | null;
    moderacao_decisao?: string | null;
    moderacao_confianca?: number | null;
    moderacao_categoria?: string | null;
    moderacao_motivo?: string | null;
    moderacao_modelo?: string | null;
    moderado_em?: string | null;
};

type AtendimentoItem = {
    id: number;
    atendimento_id: number;
    homenagem_id?: number | null;
    codigo_homenagem?: string;
    slug?: string;
    falecido: string;
    sala?: string | null;
    atendimento_tabela?: string | null;
    data_nascimento?: string | null;
    data_falecimento?: string | null;
    data_inicio_velorio?: string | null;
    hora_inicio_velorio?: string | null;
    data_fim_velorio?: string | null;
    hora_fim_velorio?: string | null;
    inicio?: string | null;
    fim?: string | null;
    pendentes?: number;
    aprovadas?: number;
    total?: number;
    status_periodo?: PeriodStatus | string;
    link_publico?: string | null;
    raw?: any;
};

type ApiMessagesResponse = {
    receivedMessages?: MessageItem[];
    approvedMessages?: MessageItem[];
    pendentes?: any[];
    aprovadas?: any[];
    envios?: any[];
    mensagens?: any[];
};

const API_URL = "https://api.planoassistencialintegrado.com.br/homenagens.php";
const PUBLIC_BASE_URL = "https://planoassistencialintegrado.com.br";
const API_BASE_URL = "https://api.planoassistencialintegrado.com.br";
const FALLBACK_IMG = "https://via.placeholder.com/100";

const ADMIN_ACTIONS = {
    listarAtendimentos: "admin_listar_atendimentos",
    listarMensagens: "admin_listar_mensagens_atendimento",
    aprovar: "admin_aprovar_mensagem",
    excluir: "admin_excluir_mensagem",
};

function onlyDigits(v: unknown): string {
    return String(v ?? "").replace(/\D+/g, "");
}

function asNumber(v: unknown, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function pad2(v: string | number): string {
    return String(v).padStart(2, "0");
}

function normalizeDate(v?: string | null): string {
    const s = String(v ?? "").trim();
    if (!s || s === "0000-00-00" || s === "0000-00-00 00:00:00") return "";

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        return s.slice(0, 10);
    }

    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) {
        return `${br[3]}-${br[2]}-${br[1]}`;
    }

    return s;
}

function normalizeHour(v?: string | null): string {
    const s = String(v ?? "").trim();
    if (!s) return "";
    const m = s.match(/(\d{1,2}):(\d{2})/);
    if (!m) return "";
    return `${pad2(m[1])}:${m[2]}`;
}

function formatDateBR(v?: string | null): string {
    const d = normalizeDate(v);
    if (!d) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const [y, m, day] = d.split("-");
        return `${day}/${m}/${y}`;
    }
    return d;
}

function formatHourBR(v?: string | null): string {
    return normalizeHour(v);
}

function buildDateTime(data?: string | null, hora?: string | null): Date | null {
    const d = normalizeDate(data);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;

    const h = normalizeHour(hora) || "00:00";
    const dt = new Date(`${d}T${h}:00`);

    if (Number.isNaN(dt.getTime())) return null;

    return dt;
}

function derivePeriodStatus(a: AtendimentoItem): PeriodStatus {
    const status = String(a.status_periodo ?? "").toLowerCase().trim();

    if (["em_andamento", "andamento", "ativo", "aberto", "durante"].includes(status)) return "em_andamento";
    if (["agendado", "futuro", "aguardando"].includes(status)) return "agendado";
    if (["encerrado", "finalizado", "fechado"].includes(status)) return "encerrado";

    const inicio = a.inicio
        ? new Date(String(a.inicio).replace(" ", "T"))
        : buildDateTime(a.data_inicio_velorio, a.hora_inicio_velorio);

    const fim = a.fim
        ? new Date(String(a.fim).replace(" ", "T"))
        : buildDateTime(a.data_fim_velorio, a.hora_fim_velorio);

    if (!inicio || !fim || Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
        return "sem_horario";
    }

    const now = new Date();

    if (now < inicio) return "agendado";
    if (now > fim) return "encerrado";
    return "em_andamento";
}

function parseDateTimeStrict(value?: string | null): Date | null {
    const s = String(value ?? "").trim();

    if (!s || s === "0000-00-00" || s === "0000-00-00 00:00:00") {
        return null;
    }

    const normalized = s.replace(" ", "T");
    const dt = new Date(normalized);

    if (Number.isNaN(dt.getTime())) {
        return null;
    }

    return dt;
}

function buildDateTimeStrict(data?: string | null, hora?: string | null): Date | null {
    const d = normalizeDate(data);
    const h = normalizeHour(hora);

    if (!d || !h || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return null;
    }

    const dt = new Date(`${d}T${h}:00`);

    if (Number.isNaN(dt.getTime())) {
        return null;
    }

    return dt;
}

function getStrictPeriodRange(a: AtendimentoItem): { inicio: Date; fim: Date } | null {
    const inicioCampos = buildDateTimeStrict(a.data_inicio_velorio, a.hora_inicio_velorio);
    const fimCampos = buildDateTimeStrict(a.data_fim_velorio, a.hora_fim_velorio);

    if (inicioCampos && fimCampos) {
        return { inicio: inicioCampos, fim: fimCampos };
    }

    const inicioCompleto = parseDateTimeStrict(a.inicio);
    const fimCompleto = parseDateTimeStrict(a.fim);

    if (inicioCompleto && fimCompleto) {
        return { inicio: inicioCompleto, fim: fimCompleto };
    }

    return null;
}

function isAtendimentoNoPeriodoAtual(a: AtendimentoItem): boolean {
    const periodo = getStrictPeriodRange(a);

    if (!periodo) {
        return false;
    }

    const now = new Date();

    return now >= periodo.inicio && now <= periodo.fim;
}

function derivePeriodStatusStrict(a: AtendimentoItem): PeriodStatus {
    const periodo = getStrictPeriodRange(a);

    if (!periodo) {
        return "sem_horario";
    }

    const now = new Date();

    if (now < periodo.inicio) return "agendado";
    if (now > periodo.fim) return "encerrado";
    return "em_andamento";
}

function periodLabel(status: PeriodStatus): string {
    if (status === "em_andamento") return "Em andamento";
    if (status === "agendado") return "Agendado";
    if (status === "encerrado") return "Encerrado";
    return "Sem horário";
}

function periodClass(status: PeriodStatus): string {
    if (status === "em_andamento") return "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20 dark:text-white";
    if (status === "agendado") return "border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white";
    if (status === "encerrado") return "border-[#C9D1DE] bg-[#EEF2F7] text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]";
    return "border-[#F2CB3F] bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white";
}

function normalizeSala(v?: string | null): string {
    const s = String(v ?? "").trim().toLowerCase();

    if (!s) return "Atendimento Externo";
    if (s === "1" || s === "01" || s.includes("sala 01") || s.includes("sala-01") || s.includes("sala_01")) return "Sala 01";
    if (s === "2" || s === "02" || s.includes("sala 02") || s.includes("sala-02") || s.includes("sala_02")) return "Sala 02";
    if (s === "3" || s === "03" || s.includes("sala 03") || s.includes("sala-03") || s.includes("sala_03")) return "Sala 03";

    if (s.includes("extern")) return "Atendimento Externo";

    return v || "Atendimento Externo";
}

function filterParam(f: AttendanceFilter): string {
    if (f === "sala01") return "01";
    if (f === "sala02") return "02";
    if (f === "sala03") return "03";
    if (f === "externo") return "externo";
    return "todos";
}

function isSalaFilter(f: AttendanceFilter): boolean {
    return f === "sala01" || f === "sala02" || f === "sala03";
}

function shouldShowAtendimentoList(f: AttendanceFilter): boolean {
    // Nas salas 01, 02 e 03 há apenas um atendimento ativo por vez.
    // A lista lateral fica apenas para "Ativos" geral e Atendimento Externo.
    return f === "todos" || f === "externo";
}

function resolveImageSrc(src?: string | null): string {
    if (!src) return FALLBACK_IMG;

    let s = String(src).trim();

    if (!s) return FALLBACK_IMG;

    if (/^(data:|blob:)/i.test(s)) {
        return s;
    }

    // Os uploads das homenagens ficam no domínio da API.
    // Se o backend ou algum registro antigo vier com o domínio público, normaliza para a API.
    if (/^https?:\/\/planoassistencialintegrado\.com\.br\/uploads\//i.test(s)) {
        return s.replace(/^https?:\/\/planoassistencialintegrado\.com\.br/i, API_BASE_URL);
    }

    if (/^https?:\/\/www\.planoassistencialintegrado\.com\.br\/uploads\//i.test(s)) {
        return s.replace(/^https?:\/\/www\.planoassistencialintegrado\.com\.br/i, API_BASE_URL);
    }

    if (/^https?:\/\//i.test(s)) {
        return s;
    }

    s = s.replace(/^\.?\//, "");

    if (s.startsWith("uploads/")) {
        return `${API_BASE_URL}/${s}`;
    }

    return `${PUBLIC_BASE_URL}/${s}`;
}

function normalizeMessage(raw: any): MessageItem {
    const id = asNumber(raw?.id ?? raw?.envio_id);
    const name = String(raw?.name ?? raw?.nome_visitante ?? raw?.nome ?? "Visitante").trim() || "Visitante";
    const text = String(raw?.text ?? raw?.mensagem ?? "").trim();
    const image = raw?.image ?? raw?.arquivo_url ?? raw?.foto ?? null;

    return {
        id,
        tipo: raw?.tipo ? String(raw.tipo) : undefined,
        name,
        text,
        image,
        status: raw?.status,
        criado_em: raw?.criado_em ?? null,
        arquivo_mime: raw?.arquivo_mime ?? null,
        aprovado_por: raw?.aprovado_por == null ? null : String(raw.aprovado_por),
        aprovado_em: raw?.aprovado_em ?? null,
        moderacao_decisao: raw?.moderacao_decisao == null ? null : String(raw.moderacao_decisao),
        moderacao_confianca: raw?.moderacao_confianca == null || !Number.isFinite(Number(raw.moderacao_confianca))
            ? null
            : Number(raw.moderacao_confianca),
        moderacao_categoria: raw?.moderacao_categoria == null ? null : String(raw.moderacao_categoria),
        moderacao_motivo: raw?.moderacao_motivo == null ? null : String(raw.moderacao_motivo),
        moderacao_modelo: raw?.moderacao_modelo == null ? null : String(raw.moderacao_modelo),
        moderado_em: raw?.moderado_em ?? null,
    };
}

function normalizeAtendimento(raw: any): AtendimentoItem {
    const atendimentoId = asNumber(
        raw?.atendimento_id ??
        raw?.legado_luz_atendimento_id ??
        raw?.id
    );

    const homenagemId = raw?.homenagem_id ?? raw?.homenagem?.id ?? raw?.id_homenagem ?? null;
    const falecido = String(
        raw?.falecido ??
        raw?.nome_falecido ??
        raw?.nome_completo ??
        raw?.homenagem?.falecido ??
        "Atendimento sem nome"
    ).trim();

    const sala = raw?.sala ?? raw?.nome_sala ?? raw?.local_velorio ?? raw?.local ?? null;

    return {
        id: atendimentoId,
        atendimento_id: atendimentoId,
        homenagem_id: homenagemId !== null && homenagemId !== undefined ? asNumber(homenagemId) : null,
        codigo_homenagem: raw?.codigo_homenagem ?? raw?.slug ?? raw?.legado_luz_slug ?? raw?.homenagem?.slug ?? "",
        slug: raw?.slug ?? raw?.codigo_homenagem ?? raw?.legado_luz_slug ?? raw?.homenagem?.slug ?? "",
        falecido,
        sala,
        atendimento_tabela: raw?.atendimento_tabela ?? raw?.tabela ?? "sepultamentos",
        data_nascimento: raw?.data_nascimento ?? raw?.nascimento ?? raw?.data_nascimento_falecido ?? null,
        data_falecimento: raw?.data_falecimento ?? raw?.falecimento ?? raw?.data_obito ?? raw?.obito ?? null,
        data_inicio_velorio: raw?.data_inicio_velorio ?? raw?.data_inicio ?? raw?.inicio_data ?? null,
        hora_inicio_velorio: raw?.hora_inicio_velorio ?? raw?.hora_inicio ?? raw?.inicio_hora ?? null,
        data_fim_velorio: raw?.data_fim_velorio ?? raw?.data_fim ?? raw?.fim_data ?? null,
        hora_fim_velorio: raw?.hora_fim_velorio ?? raw?.hora_fim ?? raw?.fim_hora ?? null,
        inicio: raw?.inicio ?? raw?.inicio_velorio ?? null,
        fim: raw?.fim ?? raw?.fim_velorio ?? null,
        pendentes: asNumber(raw?.pendentes ?? raw?.total_pendentes ?? raw?.qtd_pendentes ?? 0),
        aprovadas: asNumber(raw?.aprovadas ?? raw?.total_aprovadas ?? raw?.qtd_aprovadas ?? 0),
        total: asNumber(raw?.total ?? raw?.total_envios ?? raw?.qtd_total ?? 0),
        status_periodo: raw?.status_periodo ?? raw?.status_janela ?? raw?.periodo_status,
        link_publico: raw?.link_publico ?? raw?.legado_luz_link ?? raw?.homenagem_link_publico ?? null,
        raw,
    };
}

async function apiPost(payload: Record<string, any>): Promise<any> {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.erro || data?.success === false || data?.sucesso === false) {
        throw new Error(data?.msg || data?.message || data?.erro || "Falha ao consultar homenagens.php.");
    }

    return data;
}

async function apiGet(params: Record<string, any>): Promise<any> {
    const url = new URL(API_URL);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    });

    url.searchParams.set("_cb", String(Date.now()));

    const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.erro || data?.success === false || data?.sucesso === false) {
        throw new Error(data?.msg || data?.message || data?.erro || "Falha ao carregar homenagem.");
    }

    return data;
}

/* =========================================================
   VISUAL (padrão repaginado do app PAI)
   ========================================================= */

const CARD = "rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
const TXT_SEC = "text-[#5B6478] dark:text-[#AEB9CF]";
const BTN_BASE =
    "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-[#3D6A99]/30 disabled:cursor-not-allowed disabled:opacity-45";
const BTN_SEC =
    `${BTN_BASE} border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:border`;
const BTN_PRI =
    `${BTN_BASE} border-[1.5px] border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30] lg:border`;
const BTN_APROVAR =
    `${BTN_BASE} bg-[#B3CE52] font-extrabold text-[#313C55] hover:bg-[#A3BE45]`;
const BTN_PERIGO =
    `${BTN_BASE} border-[1.5px] border-[#B42318] bg-[#B42318] font-extrabold text-white hover:bg-[#9A1D14] dark:border-[#FF9C92] dark:bg-[#FF9C92] dark:text-[#313C55] lg:border`;
const BTN_ICONE =
    "inline-grid size-11 shrink-0 place-items-center rounded-xl border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-45 dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:border";
const CAMPO =
    "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]";
const ROTULO = "mb-2 block text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

/** "2026-10-27 14:30:00" -> "27/10 às 14:30" (ano só quando não é o atual). */
function fmtEnviadoEm(v?: string | null): string {
    if (!v) return "";
    const d = parseDateTimeStrict(String(v));
    if (!d) return String(v).replace("T", " ");
    const dia = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
    const ano = d.getFullYear() !== new Date().getFullYear() ? `/${d.getFullYear()}` : "";
    return `${dia}${ano} às ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Iniciais do nome para a bolinha (quando não há foto ou a foto falha). */
function iniciais(nome: string): string {
    const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "?";
    const a = partes[0].charAt(0);
    const b = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
    return (a + b).toUpperCase();
}

const CORES_AVATAR = [
    "bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/25 dark:text-white",
    "bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/20 dark:text-white",
    "bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/20 dark:text-white",
];

function corAvatar(nome: string): string {
    let h = 0;
    for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
    return CORES_AVATAR[h % CORES_AVATAR.length];
}

/**
 * Janelas abertas direto no <body> (a página rola dentro de um contêiner e, no iPhone,
 * a barra de baixo ficava por cima). Só chama createPortal depois de montar no cliente.
 */
function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    return montado ? createPortal(children, document.body) : null;
}

/**
 * Janela padrão: diálogo centralizado no computador, folha que sobe de baixo no celular.
 * Esc fecha (quando permitido). Rodapé com os botões na ordem Voltar → ação.
 */
function Janela({
    open,
    titulo,
    subtitulo,
    icone,
    onClose,
    podeFechar = true,
    rodape,
    larga = false,
    children,
}: {
    open: boolean;
    titulo: string;
    subtitulo?: string;
    icone?: React.ReactNode;
    onClose: () => void;
    podeFechar?: boolean;
    rodape: React.ReactNode;
    larga?: boolean;
    children: React.ReactNode;
}) {
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && podeFechar) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onClose, podeFechar]);

    if (!open) return null;

    return (
        <NoCorpo>
            <div
                role="dialog"
                data-pai-overlay
                aria-modal="true"
                aria-label={titulo}
                className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget && podeFechar) onClose();
                }}
            >
                <div
                    className={[
                        "flex max-h-[90dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-full lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12]",
                        larga ? "lg:max-w-[640px]" : "lg:max-w-[480px]",
                    ].join(" ")}
                >
                    <div className="flex items-start gap-3 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:px-6 lg:py-5">
                        {icone ? <div className="mt-0.5 shrink-0">{icone}</div> : null}
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[19px] font-extrabold leading-tight lg:text-xl">{titulo}</h2>
                            {subtitulo ? <p className={`mt-0.5 text-[13px] lg:mt-1 lg:text-sm ${TXT_SEC}`}>{subtitulo}</p> : null}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={!podeFechar}
                            className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[#EEF2F7] disabled:opacity-40 dark:hover:bg-white/[0.08]"
                            aria-label="Fechar"
                        >
                            <IconX size={20} stroke={1.8} />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6 lg:py-5">{children}</div>

                    <div className="flex gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end lg:gap-3 lg:px-6 lg:py-4 [&>*]:flex-1 lg:[&>*]:flex-none">
                        {rodape}
                    </div>
                </div>
            </div>
        </NoCorpo>
    );
}

/** Chip de filtro (Ativos, Sala 01...). Mostra o nº de pendentes quando conhecido. */
function FilterChip({
    label,
    active,
    pendentes,
    onClick,
}: {
    label: string;
    active: boolean;
    pendentes?: number;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={[
                "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] px-4 text-sm font-bold transition",
                active
                    ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]"
                    : "border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08]",
            ].join(" ")}
        >
            {label}
            {pendentes ? (
                <span
                    className="grid h-6 min-w-6 place-items-center rounded-full bg-[#F2CB3F] px-1.5 text-[12px] font-extrabold text-[#313C55]"
                    title={`${pendentes} pendente(s)`}
                >
                    {pendentes}
                </span>
            ) : null}
        </button>
    );
}

/** Número pequeno do cartão do atendimento (pendentes em amarelo quando > 0). */
function Contador({ valor, rotulo, alerta = false }: { valor: number; rotulo: string; alerta?: boolean }) {
    const ativo = alerta && valor > 0;
    return (
        <span
            className={[
                "inline-flex h-7 items-center gap-1 rounded-full border-[1.5px] px-2.5 text-[12.5px] font-bold",
                ativo
                    ? "border-[#F2CB3F] bg-[#F2CB3F] text-[#313C55]"
                    : "border-[#E3E8F0] bg-[#F6F8FB] text-[#5B6478] dark:border-white/[0.12] dark:bg-[#1C2334] dark:text-[#AEB9CF]",
            ].join(" ")}
        >
            <b className={ativo ? "" : "text-[#313C55] dark:text-white"}>{valor}</b> {rotulo}
        </span>
    );
}

function AtendimentoCard({
    item,
    active,
    onClick,
}: {
    item: AtendimentoItem;
    active: boolean;
    onClick: () => void;
}) {
    const status = derivePeriodStatusStrict(item);
    const periodo =
        item.inicio || item.fim
            ? `${String(item.inicio || "").replace("T", " ")} ${item.fim ? "até " + String(item.fim).replace("T", " ") : ""}`
            : [
                formatDateBR(item.data_inicio_velorio),
                formatHourBR(item.hora_inicio_velorio),
                item.data_fim_velorio || item.hora_fim_velorio ? "até" : "",
                formatDateBR(item.data_fim_velorio),
                formatHourBR(item.hora_fim_velorio),
            ].filter(Boolean).join(" ");

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={[
                "w-full rounded-2xl border-[1.5px] px-4 py-3 text-left transition",
                active
                    ? "border-[#313C55] bg-[#E9EFF6] dark:border-[#3D6A99] dark:bg-[#3D6A99]/20"
                    : "border-[#E3E8F0] bg-white hover:bg-[#F6F8FB] dark:border-white/[0.12] dark:bg-[#232B3F] dark:hover:bg-white/[0.06]",
            ].join(" ")}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate text-[15px] font-extrabold text-[#313C55] dark:text-white">{item.falecido}</div>
                    <div className={`mt-0.5 text-[12.5px] ${TXT_SEC}`}>
                        {normalizeSala(item.sala)} · nº {item.atendimento_id}
                    </div>
                </div>

                <span className={`shrink-0 rounded-full border-[1.5px] px-2.5 py-0.5 text-[11.5px] font-extrabold ${periodClass(status)}`}>
                    {periodLabel(status)}
                </span>
            </div>

            {periodo ? <div className={`mt-1 text-[12.5px] ${TXT_SEC}`}>{periodo}</div> : null}

            <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Contador valor={item.pendentes || 0} rotulo="pendentes" alerta />
                <Contador valor={item.aprovadas || 0} rotulo="aprovadas" />
            </div>
        </button>
    );
}

/** Foto da homenagem; sem foto (ou se falhar) mostra as iniciais de quem enviou. */
function MidiaHomenagem({ item }: { item: MessageItem }) {
    const [falhou, setFalhou] = useState(false);
    const mime = String(item.arquivo_mime || "");
    const caixa = "grid size-14 shrink-0 place-items-center rounded-xl sm:size-16";

    if (mime.startsWith("audio/")) {
        return (
            <div className={`${caixa} bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/25 dark:text-white`} title="Áudio">
                <IconMicrophone size={24} stroke={1.8} />
            </div>
        );
    }

    if (mime.startsWith("video/")) {
        return (
            <div className={`${caixa} bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/25 dark:text-white`} title="Vídeo">
                <IconPlayerPlay size={24} stroke={1.8} />
            </div>
        );
    }

    if (!item.image || falhou) {
        return (
            <div className={`${caixa} text-lg font-extrabold ${corAvatar(item.name)}`} aria-hidden="true">
                {iniciais(item.name)}
            </div>
        );
    }

    return (
        <img
            src={resolveImageSrc(item.image)}
            alt={item.name}
            className="size-14 shrink-0 rounded-xl border border-[#E3E8F0] object-cover dark:border-white/[0.12] sm:size-16"
            loading="lazy"
            onError={() => setFalhou(true)}
        />
    );
}

function MessageCard({
    item,
    pendente,
    ocupado,
    onAprovar,
    onExcluir,
}: {
    item: MessageItem;
    pendente: boolean;
    ocupado: boolean;
    onAprovar?: () => void;
    onExcluir: () => void;
}) {
    const isAudio = String(item.arquivo_mime || "").startsWith("audio/");
    const isVideo = String(item.arquivo_mime || "").startsWith("video/");
    const aurora = String(item.aprovado_por || "").trim().toLowerCase() === "aurora";
    const confianca = item.moderacao_confianca != null ? Math.round(item.moderacao_confianca * 100) : null;

    return (
        <article className={`flex min-w-0 flex-col ${CARD} p-3.5 sm:p-4`}>
            <div className="flex items-start gap-3">
                <MidiaHomenagem item={item} />

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="min-w-0 truncate text-[15px] font-extrabold">{item.name}</span>
                        {item.tipo ? (
                            <span className="rounded-full border border-[#C9D1DE] bg-[#EEF2F7] px-2 py-0.5 text-[11px] font-bold uppercase text-[#5B6478] dark:border-white/25 dark:bg-white/10 dark:text-[#AEB9CF]">
                                {item.tipo}
                            </span>
                        ) : null}
                        {aurora ? (
                            <span
                                className="inline-flex items-center gap-1 rounded-full border border-[#7BA11A]/50 bg-[#EEF5D6] px-2 py-0.5 text-[11px] font-extrabold text-[#4A6310] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]"
                                title={[
                                    "Aprovado automaticamente pela Aurora",
                                    item.moderacao_categoria ? `Categoria: ${item.moderacao_categoria}` : "",
                                    confianca != null ? `Confiança: ${confianca}%` : "",
                                    item.moderacao_motivo ? `Motivo: ${item.moderacao_motivo}` : "",
                                ].filter(Boolean).join(" • ")}
                            >
                                <IconSparkles size={12} stroke={2} />
                                Aurora{confianca != null ? ` · ${confianca}%` : ""}
                            </span>
                        ) : null}
                    </div>

                    {item.criado_em ? <div className={`mt-0.5 text-[12.5px] ${TXT_SEC}`}>{fmtEnviadoEm(item.criado_em)}</div> : null}
                </div>
            </div>

            {item.text ? (
                <p className="mt-3 whitespace-pre-wrap break-words text-[14.5px] leading-6 text-[#313C55] dark:text-[#D6DCE8]">{item.text}</p>
            ) : (
                <p className={`mt-3 text-sm italic ${TXT_SEC}`}>Homenagem enviada sem texto.</p>
            )}

            {isAudio && item.image ? <audio className="mt-3 w-full" controls src={resolveImageSrc(item.image)} /> : null}

            {isVideo && item.image ? (
                <video className="mt-3 max-h-72 w-full rounded-xl border bg-black" controls src={resolveImageSrc(item.image)} />
            ) : null}

            <div className="mt-auto flex items-center gap-2 pt-3">
                {pendente && onAprovar ? (
                    <button type="button" onClick={onAprovar} disabled={ocupado} className={`${BTN_APROVAR} flex-1 sm:flex-none sm:min-w-[140px]`}>
                        <IconCheck size={18} stroke={2.2} />
                        {ocupado ? "Aguarde..." : "Aprovar"}
                    </button>
                ) : null}

                <button
                    type="button"
                    onClick={onExcluir}
                    disabled={ocupado}
                    className="ml-auto inline-grid size-11 shrink-0 place-items-center rounded-xl text-[#B42318] hover:bg-[#FDECEA] disabled:opacity-45 dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15"
                    title="Excluir homenagem"
                    aria-label="Excluir homenagem"
                >
                    <IconTrash size={20} stroke={1.8} />
                </button>
            </div>
        </article>
    );
}
export default function MensagensPage() {
    const [filter, setFilter] = useState<AttendanceFilter>("todos");
    const [query, setQuery] = useState("");
    const [loadingAtendimentos, setLoadingAtendimentos] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
    const [atendimentos, setAtendimentos] = useState<AtendimentoItem[]>([]);
    const [selected, setSelected] = useState<AtendimentoItem | null>(null);
    const [received, setReceived] = useState<MessageItem[]>([]);
    const [approved, setApproved] = useState<MessageItem[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Visual: aviso na tela (no lugar do alert), aba Pendentes/Aprovadas, pendentes por filtro e erro do livro.
    const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
    const [aba, setAba] = useState<"pendentes" | "aprovadas">("pendentes");
    const [pendPorFiltro, setPendPorFiltro] = useState<Partial<Record<AttendanceFilter, number>>>({});
    const [livroErro, setLivroErro] = useState("");
    const avisoTimer = useRef<number | null>(null);

    const mostrarAviso = useCallback((tipo: "ok" | "erro", texto: string) => {
        if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
        setAviso({ tipo, texto });
        if (tipo === "ok") {
            avisoTimer.current = window.setTimeout(() => setAviso(null), 4000);
        }
    }, []);

    useEffect(() => () => {
        if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
    }, []);

    const [showModal, setShowModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<MessageItem | null>(null);
    const [falecido, setFalecido] = useState("");
    const [nascimento, setNascimento] = useState("");
    const [falecimento, setFalecimento] = useState("");
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMsg, setProgressMsg] = useState("");

    const selectedAtendimentoId = selected?.atendimento_id || 0;

    useEffect(() => {
        const KEY = "__jspdf_loaded__";
        if ((window as any)[KEY]) return;

        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => ((window as any)[KEY] = true);
        document.body.appendChild(script);
    }, []);

    const dataUrlCache = useRef<Map<string, string>>(new Map());
    const lastLoadedAtendimentoRef = useRef<number>(0);

    async function toDataURL(url: string): Promise<string> {
        const cache = dataUrlCache.current;
        if (cache.has(url)) return cache.get(url)!;

        try {
            const resp = await fetch(url, { credentials: "include" });
            if (!resp.ok) throw new Error("Falha ao carregar imagem.");

            const blob = await resp.blob();
            const dataUrl: string = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(String(fr.result));
                fr.onerror = reject;
                fr.readAsDataURL(blob);
            });

            cache.set(url, dataUrl);
            return dataUrl;
        } catch {
            return FALLBACK_IMG;
        }
    }

    const nunitoStateRef = useRef<"none" | "ok" | "fail">("none");

    async function ensureNunito(doc: any): Promise<boolean> {
        if (nunitoStateRef.current === "ok") return true;
        if (nunitoStateRef.current === "fail") return false;

        try {
            const nunitoUrl = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nunito/Nunito%5Bwght%5D.ttf";
            const r = await fetch(nunitoUrl);
            if (!r.ok) throw new Error("Fonte não encontrada");

            const buf = await r.arrayBuffer();
            let binary = "";
            const bytes = new Uint8Array(buf);

            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }

            const b64 = btoa(binary);

            doc.addFileToVFS("Nunito.ttf", b64);
            doc.addFont("Nunito.ttf", "Nunito", "normal");
            doc.addFont("Nunito.ttf", "Nunito", "bold");

            nunitoStateRef.current = "ok";
            return true;
        } catch {
            nunitoStateRef.current = "fail";
            return false;
        }
    }

    const sanitizeForPdf = (input?: string) => {
        let s = (input ?? "").normalize("NFC");
        s = s.replace(/\r\n?/g, "\n").replace(/\u00A0/g, " ");
        s = s.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\uFE0F/g, "");
        s = s.replace(/([#*0-9])\uFE0F?\u20E3/gu, "$1");
        s = s.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, "•");
        s = s.replace(
            /[\u2764\u2665\u2661\u{1F494}\u{1F493}\u{1F495}-\u{1F49F}\u{1F9E1}\u{1FA77}]/gu,
            "♥"
        );

        try {
            s = s.replace(/\p{Extended_Pictographic}/gu, "•");
        } catch {
            s = s.replace(/[\u2600-\u27BF\u{1F300}-\u{1FAFF}]/gu, "•");
        }

        return s;
    };

    function wrapText(
        doc: any,
        text: string,
        x: number,
        y: number,
        maxW: number,
        fontName: string,
        fontStyle: "normal" | "bold",
        fontSize: number,
        draw: boolean
    ) {
        const clean = sanitizeForPdf(text);

        doc.setFont(fontName, fontStyle);
        doc.setFontSize(fontSize);

        const lines = doc.splitTextToSize(clean, maxW) as string[];
        const mmPerPt = 0.352777778;
        const lh = fontSize * 1.15 * mmPerPt;
        const height = Math.max(lh * lines.length, lh);

        if (draw) {
            let cy = y;

            for (const ln of lines) {
                doc.text(ln, x, cy, { baseline: "top", align: "left" });
                cy += lh;
            }
        }

        return { lines, height, lineHeight: lh };
    }

    const loadAtendimentos = useCallback(async () => {
        try {
            setLoadingAtendimentos(true);
            setError(null);

            const data = await apiPost({
                acao: ADMIN_ACTIONS.listarAtendimentos,
                filtro: filterParam(filter),
                q: query.trim(),
                limite: 500,
                somente_periodo_atual: true,
            });

            const rows = data?.atendimentos ?? data?.dados ?? data?.items ?? [];
            const normalized = Array.isArray(rows) ? rows.map(normalizeAtendimento) : [];

            // Regra principal deste painel:
            // exibir somente atendimentos cujo período do velório esteja acontecendo agora.
            // Atendimentos futuros, encerrados ou sem data/hora completa ficam fora da tela.
            const atuais = normalized.filter(isAtendimentoNoPeriodoAtual);

            setAtendimentos(atuais);

            // Nº de pendentes nos chips de filtro (só com os dados já carregados, sem consulta extra).
            const somaPend = (lista: AtendimentoItem[]) => lista.reduce((t, a) => t + (a.pendentes || 0), 0);
            setPendPorFiltro((prev) => {
                const novo = { ...prev, [filter]: somaPend(atuais) };
                if (filter === "todos") {
                    novo.sala01 = somaPend(atuais.filter((a) => normalizeSala(a.sala) === "Sala 01"));
                    novo.sala02 = somaPend(atuais.filter((a) => normalizeSala(a.sala) === "Sala 02"));
                    novo.sala03 = somaPend(atuais.filter((a) => normalizeSala(a.sala) === "Sala 03"));
                    novo.externo = somaPend(atuais.filter((a) => normalizeSala(a.sala) === "Atendimento Externo"));
                }
                return novo;
            });

            if (isSalaFilter(filter)) {
                const atualDaSala = atuais[0] ?? null;

                if (atualDaSala) {
                    setSelected(atualDaSala);
                    setFalecido(atualDaSala.falecido || "");
                    setNascimento(normalizeDate(atualDaSala.data_nascimento));
                    setFalecimento(normalizeDate(atualDaSala.data_falecimento));
                } else {
                    setSelected(null);
                    setReceived([]);
                    setApproved([]);
                }

                return;
            }

            if (selected) {
                const stillExists = atuais.find((a) => a.atendimento_id === selected.atendimento_id);
                if (stillExists) {
                    setSelected(stillExists);
                } else {
                    setSelected(null);
                    setReceived([]);
                    setApproved([]);
                }
            }
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar atendimentos.");
            setAtendimentos([]);
            setSelected(null);
            setReceived([]);
            setApproved([]);
        } finally {
            setLoadingAtendimentos(false);
        }
    }, [filter, query, selected]);

    const loadMessages = useCallback(async (atendimento?: AtendimentoItem | null) => {
        const item = atendimento ?? selected;

        if (!item?.atendimento_id) {
            setReceived([]);
            setApproved([]);
            return;
        }

        try {
            setLoadingMessages(true);
            setError(null);

            const data: ApiMessagesResponse = await apiPost({
                acao: ADMIN_ACTIONS.listarMensagens,
                atendimento_id: item.atendimento_id,
                homenagem_id: item.homenagem_id,
                codigo: item.codigo_homenagem || item.slug || "",
            });

            let pendentes: MessageItem[] = [];
            let aprovadas: MessageItem[] = [];

            if (Array.isArray(data.receivedMessages) || Array.isArray(data.approvedMessages)) {
                pendentes = (data.receivedMessages || []).map(normalizeMessage);
                aprovadas = (data.approvedMessages || []).map(normalizeMessage);
            } else if (Array.isArray(data.pendentes) || Array.isArray(data.aprovadas)) {
                pendentes = (data.pendentes || []).map(normalizeMessage);
                aprovadas = (data.aprovadas || []).map(normalizeMessage);
            } else {
                const envios = data.envios ?? data.mensagens ?? [];
                const normalized = Array.isArray(envios) ? envios.map(normalizeMessage) : [];

                pendentes = normalized.filter((m) => String(m.status || "").toLowerCase() === "pendente");
                aprovadas = normalized.filter((m) => String(m.status || "").toLowerCase() === "aprovado");
            }

            setReceived(pendentes);
            setApproved(aprovadas);
        } catch (e: any) {
            setError(e?.message || "Erro ao carregar mensagens do atendimento.");
            setReceived([]);
            setApproved([]);
        } finally {
            setLoadingMessages(false);
        }
    }, [selected]);

    const refreshAll = useCallback(async () => {
        await loadAtendimentos();

        if (selected) {
            await loadMessages(selected);
        }
    }, [loadAtendimentos, loadMessages, selected]);

    useEffect(() => {
        const id = selected?.atendimento_id || 0;

        if (!id) {
            lastLoadedAtendimentoRef.current = 0;
            return;
        }

        if (lastLoadedAtendimentoRef.current === id) {
            return;
        }

        lastLoadedAtendimentoRef.current = id;
        loadMessages(selected);
    }, [selected?.atendimento_id, loadMessages, selected]);

    useEffect(() => {
        loadAtendimentos();
    }, [filter]);

    const onSearch = () => {
        loadAtendimentos();
    };

    const onPickAtendimento = async (item: AtendimentoItem) => {
        setAba("pendentes");
        setSelected(item);
        setFalecido(item.falecido || "");
        setNascimento(normalizeDate(item.data_nascimento));
        setFalecimento(normalizeDate(item.data_falecimento));
        lastLoadedAtendimentoRef.current = item.atendimento_id;
        await loadMessages(item);
    };

    const approveMessage = async (id: number) => {
        if (!selectedAtendimentoId) {
            mostrarAviso("erro", "Selecione um atendimento.");
            return;
        }

        try {
            setActionLoadingId(id);

            await apiPost({
                acao: ADMIN_ACTIONS.aprovar,
                atendimento_id: selectedAtendimentoId,
                homenagem_id: selected?.homenagem_id,
                codigo: selected?.codigo_homenagem || selected?.slug || "",
                envio_id: id,
            });

            await loadMessages(selected);
            await loadAtendimentos();
            mostrarAviso("ok", "Homenagem aprovada.");
        } catch (e: any) {
            mostrarAviso("erro", e?.message || "Erro ao aprovar a mensagem.");
        } finally {
            setActionLoadingId(null);
        }
    };

    const deleteMessage = async (id: number): Promise<boolean> => {
        if (!selectedAtendimentoId) {
            mostrarAviso("erro", "Selecione um atendimento.");
            return false;
        }

        try {
            setActionLoadingId(id);

            await apiPost({
                acao: ADMIN_ACTIONS.excluir,
                atendimento_id: selectedAtendimentoId,
                homenagem_id: selected?.homenagem_id,
                codigo: selected?.codigo_homenagem || selected?.slug || "",
                envio_id: id,
            });

            await loadMessages(selected);
            await loadAtendimentos();
            mostrarAviso("ok", "Homenagem excluída.");
            return true;
        } catch (e: any) {
            mostrarAviso("erro", e?.message || "Erro ao excluir a mensagem.");
            return false;
        } finally {
            setActionLoadingId(null);
        }
    };

    const requestDeleteMessage = (item: MessageItem) => {
        setDeleteTarget(item);
    };

    const confirmDeleteMessage = async () => {
        if (!deleteTarget) return;

        const deleted = await deleteMessage(deleteTarget.id);

        if (deleted) {
            setDeleteTarget(null);
        }
    };

    const loadPublicApprovedAsFallback = async () => {
        if (!selected?.atendimento_id) return;

        const data = await apiGet({
            acao: "carregar",
            atendimento_id: selected.atendimento_id,
        });

        const envios = Array.isArray(data?.envios_aprovados) ? data.envios_aprovados : [];
        setApproved(envios.map(normalizeMessage));
    };

    const runExport = useCallback(
        async (meta: { nome: string; nasc: string; obito: string }) => {
            const w: any = window as any;
            const jspdf = w.jspdf;

            if (!jspdf || !jspdf.jsPDF) {
                throw new Error("Ferramenta de PDF ainda carregando. Tente novamente.");
            }

            if (!approved.length) {
                throw new Error("Não há mensagens aprovadas para gerar o livro.");
            }

            const { jsPDF } = jspdf;
            const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const centerX = pageW / 2;

            setProgress(5);
            setProgressMsg("Carregando fonte…");

            const nunitoOk = await ensureNunito(doc);
            const FONT = nunitoOk ? "Nunito" : "helvetica";

            setProgress(12);
            setProgressMsg("Montando capa…");

            try {
                const capa = await toDataURL("/capa.png");
                doc.addImage(capa, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
            } catch {
                doc.setFillColor(248, 250, 252);
                doc.rect(0, 0, pageW, pageH, "F");
            }

            doc.setTextColor(34, 51, 80);
            doc.setFont(FONT, "bold");
            doc.setFontSize(44);

            const maxTitleW = pageW * 0.82;
            const nameLines = doc.splitTextToSize(sanitizeForPdf(meta.nome), maxTitleW) as string[];
            const mmPerPt = 0.352777778;
            const nameLH = 44 * 1.15 * mmPerPt;
            const blockH = nameLH * nameLines.length;
            const nameY = pageH * 0.42 - blockH / 2;

            doc.text(nameLines, centerX, nameY, { align: "center", baseline: "top" });

            const d1 = formatDateBR(meta.nasc);
            const d2 = formatDateBR(meta.obito);

            if (d1 || d2) {
                doc.setFont(FONT, "normal");
                doc.setFontSize(22);
                doc.text([d1, d2].filter(Boolean).join("  |  "), centerX, nameY + blockH + 10, {
                    align: "center",
                    baseline: "top",
                });
            }

            setProgress(24);
            setProgressMsg("Preparando páginas…");

            const startContentPage = async () => {
                doc.addPage();

                try {
                    const bgData = await toDataURL("/fundo.png");
                    doc.addImage(bgData, "PNG", 0, 0, pageW, pageH, undefined, "FAST");
                } catch {
                    doc.setFillColor(255, 255, 255);
                    doc.rect(0, 0, pageW, pageH, "F");
                }
            };

            await startContentPage();

            const margin = { top: 16, right: 14, bottom: 16, left: 14 };
            const contentW = pageW - margin.left - margin.right;
            const cardsPerPage = 4;
            const gapY = 8;
            const cardH = 58;
            const cardPadX = 8;
            const cardPadY = 8;
            const imgSize = 27;
            const innerGap = 8;

            for (let i = 0; i < approved.length; i++) {
                const m = approved[i];
                const idx = i % cardsPerPage;

                if (i > 0 && idx === 0) {
                    await startContentPage();
                }

                const cardX = margin.left;
                const cardY = margin.top + idx * (cardH + gapY);

                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(218, 226, 236);
                doc.setLineWidth(0.5);
                doc.roundedRect(cardX, cardY, contentW, cardH, 6, 6, "FD");

                const imgX = cardX + cardPadX;
                const imgY = cardY + cardPadY;

                if (m.image && !String(m.arquivo_mime || "").startsWith("audio/") && !String(m.arquivo_mime || "").startsWith("video/")) {
                    try {
                        const imgData = await toDataURL(resolveImageSrc(m.image));
                        doc.addImage(imgData, "JPEG", imgX, imgY, imgSize, imgSize, undefined, "FAST");
                    } catch {
                        doc.setFillColor(241, 245, 249);
                        doc.roundedRect(imgX, imgY, imgSize, imgSize, 3, 3, "F");
                    }
                } else {
                    doc.setFillColor(241, 245, 249);
                    doc.roundedRect(imgX, imgY, imgSize, imgSize, 3, 3, "F");
                }

                const textX = imgX + imgSize + innerGap;
                const textTop = cardY + cardPadY;
                const textMaxW = contentW - (textX - cardX) - cardPadX;
                const maxH = cardH - 2 * cardPadY;

                const title = wrapText(doc, m.name || "", textX, textTop, textMaxW, FONT, "bold", 12, false);

                let bodySize = 10.5;
                let body = wrapText(
                    doc,
                    m.text || "Registrou uma homenagem.",
                    textX,
                    textTop + title.height + 5,
                    textMaxW,
                    FONT,
                    "normal",
                    bodySize,
                    false
                );

                while (title.height + 5 + body.height > maxH && bodySize > 8.5) {
                    bodySize -= 0.5;
                    body = wrapText(
                        doc,
                        m.text || "Registrou uma homenagem.",
                        textX,
                        textTop + title.height + 5,
                        textMaxW,
                        FONT,
                        "normal",
                        bodySize,
                        false
                    );
                }

                wrapText(doc, m.name || "", textX, textTop, textMaxW, FONT, "bold", 12, true);
                wrapText(
                    doc,
                    m.text || "Registrou uma homenagem.",
                    textX,
                    textTop + title.height + 5,
                    textMaxW,
                    FONT,
                    "normal",
                    bodySize,
                    true
                );

                const pct = 24 + Math.round(((i + 1) / approved.length) * 72);
                setProgress(pct);
                setProgressMsg(`Gerando mensagens (${i + 1}/${approved.length})…`);
            }

            setProgress(98);
            setProgressMsg("Finalizando documento…");

            const safeName = (meta.nome || selected?.falecido || `atendimento_${selectedAtendimentoId}`)
                .replace(/[^\p{L}\p{N}\s_-]/gu, "")
                .replace(/\s+/g, "_")
                .toLowerCase();

            doc.save(`livro_homenagens_${safeName}.pdf`);

            setProgress(100);
            setProgressMsg("Concluído!");
        },
        [approved, selected, selectedAtendimentoId]
    );

    const onOpenModal = async () => {
        if (!selected) {
            mostrarAviso("erro", "Selecione um atendimento.");
            return;
        }

        if (!approved.length) {
            try {
                await loadPublicApprovedAsFallback();
            } catch {
                // Mantém mensagem padrão abaixo.
            }
        }

        setFalecido(selected.falecido || "");
        setNascimento(normalizeDate(selected.data_nascimento));
        setFalecimento(normalizeDate(selected.data_falecimento));
        setProgress(0);
        setProgressMsg("");
        setLivroErro("");
        setShowModal(true);
    };

    const onSubmitGenerate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!falecido.trim()) {
            setLivroErro("Informe o nome do falecido.");
            return;
        }

        setLivroErro("");

        try {
            setGenerating(true);
            setProgress(1);
            setProgressMsg("Iniciando…");

            await runExport({
                nome: falecido.trim(),
                nasc: nascimento,
                obito: falecimento,
            });

            setGenerating(false);
            setShowModal(false);
        } catch (err: any) {
            setGenerating(false);
            setProgress(0);
            setProgressMsg("");
            setLivroErro(err?.message || "Falha ao gerar o PDF.");
        }
    };

    const showAtendimentoList = shouldShowAtendimentoList(filter);

    const totals = useMemo(() => {
        return atendimentos.reduce(
            (acc, item) => {
                acc.pendentes += item.pendentes || 0;
                acc.aprovadas += item.aprovadas || 0;
                acc.total += item.total || 0;
                return acc;
            },
            { pendentes: 0, aprovadas: 0, total: 0 }
        );
    }, [atendimentos]);

    const FILTROS: { id: AttendanceFilter; label: string }[] = [
        { id: "todos", label: "Ativos" },
        { id: "sala01", label: "Sala 01" },
        { id: "sala02", label: "Sala 02" },
        { id: "sala03", label: "Sala 03" },
        { id: "externo", label: "Externo" },
    ];

    const escolherFiltro = (f: AttendanceFilter) => {
        if (isSalaFilter(f)) setQuery("");
        setFilter(f);
    };

    const listaAtual = aba === "pendentes" ? received : approved;

    return (
        <div className="min-h-[calc(100dvh-1px)] bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-4 lg:px-10 lg:pb-12 lg:pt-8">
                {/* TOPO */}
                <header className="mb-4 flex items-start justify-between gap-3 lg:mb-6">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-extrabold leading-tight lg:text-[28px]">Homenagens Ativas</h1>
                        <p className={`mt-1 text-sm ${TXT_SEC}`}>
                            <b className={totals.pendentes > 0 ? "text-[#313C55] dark:text-[#F2CB3F]" : ""}>{totals.pendentes}</b> pendentes ·{" "}
                            <b>{totals.aprovadas}</b> aprovadas
                            <span className="hidden sm:inline"> · {totals.total} no total</span>
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={refreshAll}
                        disabled={loadingAtendimentos || loadingMessages}
                        className={BTN_ICONE}
                        title="Atualizar"
                        aria-label="Atualizar"
                    >
                        <IconRefresh size={20} stroke={1.8} className={loadingAtendimentos || loadingMessages ? "animate-spin" : ""} />
                    </button>
                </header>

                {/* FILTROS */}
                <div className={`mb-4 ${CARD} p-3 lg:mb-5 lg:p-4`}>
                    <div className="-mx-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="Local">
                        {FILTROS.map((f) => (
                            <FilterChip
                                key={f.id}
                                label={f.label}
                                active={filter === f.id}
                                pendentes={pendPorFiltro[f.id]}
                                onClick={() => escolherFiltro(f.id)}
                            />
                        ))}
                    </div>

                    {showAtendimentoList ? (
                        <div className="mt-3 flex gap-2">
                            <span className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-transparent bg-[#F1F4F8] px-3 text-[#5B6478] focus-within:border-[#3D6A99] focus-within:ring-2 focus-within:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                <IconSearch size={20} stroke={1.8} className="shrink-0" />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") onSearch();
                                    }}
                                    placeholder="Nome, nº do atendimento ou código"
                                    aria-label="Buscar atendimento"
                                    className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] dark:text-white dark:placeholder:text-[#8893AA]"
                                />
                            </span>

                            <button type="button" onClick={onSearch} className={`${BTN_SEC} shrink-0`}>
                                Buscar
                            </button>
                        </div>
                    ) : null}
                </div>

                {/* AVISOS */}
                {aviso ? (
                    <div
                        role={aviso.tipo === "erro" ? "alert" : "status"}
                        className={[
                            "mb-4 flex items-start gap-2 rounded-[14px] border px-4 py-3 text-sm font-bold",
                            aviso.tipo === "erro"
                                ? "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
                                : "border-[#B3CE52] bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/[0.18] dark:text-white",
                        ].join(" ")}
                    >
                        <span className="min-w-0 flex-1">{aviso.texto}</span>
                        <button type="button" onClick={() => setAviso(null)} className="-my-1 grid size-8 shrink-0 place-items-center rounded-lg hover:bg-black/5" aria-label="Fechar aviso">
                            <IconX size={16} stroke={2} />
                        </button>
                    </div>
                ) : null}

                {error ? (
                    <div role="alert" className="mb-4 rounded-[14px] border border-[#B42318] bg-[#FDECEA] px-4 py-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                        {error}
                    </div>
                ) : null}

                <div className={showAtendimentoList ? "grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-6" : "grid gap-4"}>
                    {showAtendimentoList ? (
                        <aside className="min-w-0">
                            <div className="mb-2.5 flex items-center justify-between gap-2">
                                <h2 className={`text-xs font-extrabold uppercase tracking-[.12em] ${TXT_SEC}`}>Atendimentos ativos</h2>
                                {loadingAtendimentos ? <span className={`text-xs font-bold ${TXT_SEC}`}>Carregando…</span> : null}
                            </div>

                            {atendimentos.length === 0 ? (
                                <div className={`${CARD} p-4 text-sm ${TXT_SEC}`}>Nenhum atendimento em andamento encontrado.</div>
                            ) : (
                                <div className="grid max-h-[40dvh] gap-2 overflow-auto pr-1 lg:max-h-[70vh]">
                                    {atendimentos.map((item) => (
                                        <AtendimentoCard
                                            key={`${item.atendimento_id}-${item.homenagem_id || "h"}`}
                                            item={item}
                                            active={selected?.atendimento_id === item.atendimento_id}
                                            onClick={() => onPickAtendimento(item)}
                                        />
                                    ))}
                                </div>
                            )}
                        </aside>
                    ) : null}

                    <section className="min-w-0">
                        {!selected ? (
                            <div className={`${CARD} px-6 py-10 text-center`}>
                                <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                                    <IconMessageCircle2 size={28} stroke={1.8} />
                                </span>
                                <h2 className="text-lg font-extrabold">
                                    {isSalaFilter(filter) ? "Nenhum atendimento ativo nesta sala" : "Selecione um atendimento"}
                                </h2>
                                <p className={`mx-auto mt-1.5 max-w-md text-sm ${TXT_SEC}`}>
                                    {isSalaFilter(filter)
                                        ? "Quando houver atendimento em andamento dentro do horário do velório, ele será aberto automaticamente aqui."
                                        : "As homenagens pendentes e aprovadas aparecem aqui ao escolher um atendimento."}
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* CABEÇALHO DO ATENDIMENTO */}
                                <div className={`mb-4 ${CARD} p-4 lg:px-5`}>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`text-xs font-extrabold uppercase tracking-[.08em] ${TXT_SEC}`}>
                                                    {normalizeSala(selected.sala)} · nº {selected.atendimento_id}
                                                </span>
                                                <span className={`rounded-full border-[1.5px] px-2.5 py-0.5 text-[11.5px] font-extrabold ${periodClass(derivePeriodStatusStrict(selected))}`}>
                                                    {periodLabel(derivePeriodStatusStrict(selected))}
                                                </span>
                                            </div>
                                            <h2 className="mt-1 truncate text-[22px] font-extrabold leading-tight lg:text-2xl">{selected.falecido}</h2>
                                            <div className={`mt-0.5 text-sm ${TXT_SEC}`}>
                                                {[formatDateBR(selected.data_nascimento), formatDateBR(selected.data_falecimento)].filter(Boolean).join(" – ")}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {selected.link_publico ? (
                                                <a href={selected.link_publico} target="_blank" rel="noreferrer" className={`${BTN_SEC} flex-1 sm:flex-none`}>
                                                    <IconExternalLink size={18} stroke={1.8} />
                                                    Legado de Luz
                                                </a>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={onOpenModal}
                                                className={`${BTN_PRI} flex-1 sm:flex-none`}
                                                disabled={!approved.length}
                                                title={approved.length ? "Gerar Livro de Homenagens em PDF" : "Sem mensagens aprovadas"}
                                            >
                                                <IconBook2 size={18} stroke={1.8} />
                                                <span className="sm:hidden">Livro (PDF)</span>
                                                <span className="hidden sm:inline">Gerar livro (PDF)</span>
                                            </button>
                                        </div>
                                    </div>
                                    {!approved.length ? <p className={`mt-2 text-xs ${TXT_SEC} sm:text-right`}>O livro fica disponível quando houver homenagem aprovada.</p> : null}
                                </div>

                                {/* ABAS PENDENTES / APROVADAS */}
                                <div className="mb-3 flex items-center gap-2">
                                    <div className="flex rounded-xl border border-[#E3E8F0] bg-white p-1 dark:border-white/[0.12] dark:bg-[#232B3F]" role="tablist">
                                        {(["pendentes", "aprovadas"] as const).map((a) => {
                                            const on = aba === a;
                                            const n = a === "pendentes" ? received.length : approved.length;
                                            return (
                                                <button
                                                    key={a}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={on}
                                                    onClick={() => setAba(a)}
                                                    className={[
                                                        "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold transition",
                                                        on ? "bg-[#313C55] text-white dark:bg-[#3D6A99]" : `${TXT_SEC} hover:text-[#313C55] dark:hover:text-white`,
                                                    ].join(" ")}
                                                >
                                                    {a === "pendentes" ? "Pendentes" : "Aprovadas"}
                                                    <span
                                                        className={[
                                                            "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[12px] font-extrabold",
                                                            a === "pendentes" && n > 0
                                                                ? "bg-[#F2CB3F] text-[#313C55]"
                                                                : on
                                                                    ? "bg-white/20 text-white"
                                                                    : "bg-[#EEF2F7] text-[#5B6478] dark:bg-white/10 dark:text-[#AEB9CF]",
                                                        ].join(" ")}
                                                    >
                                                        {n}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => loadMessages(selected)}
                                        disabled={loadingMessages}
                                        className={`${BTN_ICONE} ml-auto`}
                                        title="Atualizar mensagens"
                                        aria-label="Atualizar mensagens"
                                    >
                                        <IconRefresh size={20} stroke={1.8} className={loadingMessages ? "animate-spin" : ""} />
                                    </button>
                                </div>

                                {loadingMessages && listaAtual.length === 0 ? (
                                    <div className={`${CARD} p-4 text-sm font-bold ${TXT_SEC}`}>Carregando homenagens…</div>
                                ) : listaAtual.length === 0 ? (
                                    <div className={`${CARD} px-4 py-8 text-center text-sm ${TXT_SEC}`}>
                                        {aba === "pendentes" ? "Nenhuma homenagem esperando aprovação." : "Ainda não há homenagem aprovada neste atendimento."}
                                    </div>
                                ) : (
                                    <div className="grid items-start gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                                        {listaAtual.map((m) => (
                                            <MessageCard
                                                key={`${aba}-${m.id}`}
                                                item={m}
                                                pendente={aba === "pendentes"}
                                                ocupado={actionLoadingId === m.id}
                                                onAprovar={() => approveMessage(m.id)}
                                                onExcluir={() => requestDeleteMessage(m)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </div>
            </div>

            {/* JANELA: EXCLUIR */}
            <Janela
                open={!!deleteTarget}
                titulo="Excluir homenagem?"
                subtitulo="Esta ação não poderá ser desfeita."
                icone={
                    <span className="grid size-10 place-items-center rounded-xl bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                        <IconTrash size={20} stroke={1.8} />
                    </span>
                }
                onClose={() => setDeleteTarget(null)}
                podeFechar={!deleteTarget || actionLoadingId !== deleteTarget.id}
                rodape={
                    <>
                        <button
                            type="button"
                            onClick={() => setDeleteTarget(null)}
                            disabled={!!deleteTarget && actionLoadingId === deleteTarget.id}
                            className={BTN_SEC}
                        >
                            Voltar
                        </button>
                        <button
                            type="button"
                            onClick={confirmDeleteMessage}
                            disabled={!!deleteTarget && actionLoadingId === deleteTarget.id}
                            className={BTN_PERIGO}
                        >
                            {deleteTarget && actionLoadingId === deleteTarget.id ? "Excluindo..." : "Excluir"}
                        </button>
                    </>
                }
            >
                {deleteTarget ? (
                    <div className="rounded-[14px] border border-[#E3E8F0] bg-[#F6F8FB] px-4 py-3 dark:border-white/[0.12] dark:bg-[#1C2334]">
                        <div className="text-sm font-extrabold">{deleteTarget.name || "Visitante"}</div>
                        <p className={`mt-1 line-clamp-3 whitespace-pre-wrap text-sm ${TXT_SEC}`}>
                            {deleteTarget.text || "Homenagem enviada sem texto."}
                        </p>
                    </div>
                ) : null}
            </Janela>

            {/* JANELA: LIVRO DE HOMENAGENS */}
            <Janela
                open={showModal}
                larga
                titulo="Gerar Livro de Homenagens"
                subtitulo="O livro usa apenas as homenagens aprovadas deste atendimento."
                onClose={() => setShowModal(false)}
                podeFechar={!generating}
                rodape={
                    <>
                        <button type="button" disabled={generating} onClick={() => setShowModal(false)} className={BTN_SEC}>
                            Voltar
                        </button>
                        <button type="submit" form="form-livro" disabled={generating} className={BTN_PRI}>
                            <IconDownload size={18} stroke={1.8} />
                            {generating ? "Gerando..." : "Gerar PDF"}
                        </button>
                    </>
                }
            >
                <form id="form-livro" onSubmit={onSubmitGenerate} className="space-y-4">
                    <label className="block">
                        <span className={ROTULO}>Nome do falecido</span>
                        <input
                            type="text"
                            className={CAMPO}
                            value={falecido}
                            onChange={(e) => setFalecido(e.target.value)}
                            placeholder="Ex.: João Batista de Jesus"
                            required
                        />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className={ROTULO}>Nascimento</span>
                            <input type="date" className={CAMPO} value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
                        </label>
                        <label className="block">
                            <span className={ROTULO}>Falecimento</span>
                            <input type="date" className={CAMPO} value={falecimento} onChange={(e) => setFalecimento(e.target.value)} />
                        </label>
                    </div>

                    <p className={`text-[13px] ${TXT_SEC}`}>
                        {approved.length === 1 ? "1 homenagem aprovada entrará no livro." : `${approved.length} homenagens aprovadas entrarão no livro.`}
                    </p>

                    {livroErro ? (
                        <div role="alert" className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-3 py-2 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                            {livroErro}
                        </div>
                    ) : null}

                    {generating ? (
                        <div className="rounded-xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334]">
                            <div className="mb-2 flex justify-between text-sm font-bold">
                                <span>{progressMsg}</span>
                                <span>{Math.round(progress)}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[#E3E8F0] dark:bg-white/10">
                                <div className="h-full rounded-full bg-[#3D6A99] transition-all" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    ) : null}
                </form>
            </Janela>
        </div>
    );
}
