"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    IconMessageCircle2,
    IconCheck,
    IconTrash,
    IconRefresh,
    IconDoor,
    IconDownload,
    IconListSearch,
    IconUserCheck,
    IconSearch,
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

const btn =
    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold " +
    "border-primary text-primary hover:bg-primary/5 active:bg-primary/10 disabled:opacity-50 disabled:pointer-events-none";

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
    if (status === "em_andamento") return "border-green-200 bg-green-50 text-green-700";
    if (status === "agendado") return "border-blue-200 bg-blue-50 text-blue-700";
    if (status === "encerrado") return "border-slate-200 bg-slate-50 text-slate-600";
    return "border-amber-200 bg-amber-50 text-amber-700";
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

function FilterButton({
    label,
    active,
    onClick,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 font-semibold transition",
                active
                    ? "border-primary/70 bg-primary/5 text-primary ring-1 ring-primary/30"
                    : "border-muted text-foreground hover:bg-muted/40",
            ].join(" ")}
        >
            <IconDoor className="size-4" />
            {label}
        </button>
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
            className={[
                "w-full rounded-2xl border p-4 text-left shadow-sm transition",
                active
                    ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                    : "border-muted bg-white hover:bg-muted/20",
            ].join(" ")}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate text-base font-bold text-foreground">
                        {item.falecido}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-muted-foreground">
                        Atendimento #{item.atendimento_id} · {normalizeSala(item.sala)}
                    </div>
                </div>

                <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${periodClass(status)}`}>
                    {periodLabel(status)}
                </span>
            </div>

            {periodo ? (
                <div className="mt-2 text-xs font-medium text-muted-foreground">
                    {periodo}
                </div>
            ) : null}

            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border bg-card/60 px-2 py-2">
                    <div className="font-black text-foreground">{item.pendentes || 0}</div>
                    <div className="text-muted-foreground">Pendentes</div>
                </div>
                <div className="rounded-lg border bg-card/60 px-2 py-2">
                    <div className="font-black text-foreground">{item.aprovadas || 0}</div>
                    <div className="text-muted-foreground">Aprovadas</div>
                </div>
                <div className="rounded-lg border bg-card/60 px-2 py-2">
                    <div className="font-black text-foreground">{item.total || 0}</div>
                    <div className="text-muted-foreground">Total</div>
                </div>
            </div>
        </button>
    );
}

function MessageCard({
    item,
    actions,
}: {
    item: MessageItem;
    actions?: React.ReactNode;
}) {
    const src = resolveImageSrc(item.image);
    const isAudio = String(item.arquivo_mime || "").startsWith("audio/");
    const isVideo = String(item.arquivo_mime || "").startsWith("video/");

    return (
        <div className="min-w-0 rounded-xl border bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-start gap-3">
                {isAudio ? (
                    <div className="grid size-16 shrink-0 place-items-center rounded-md border bg-muted/30 text-xs font-bold text-muted-foreground sm:size-20">
                        Áudio
                    </div>
                ) : isVideo ? (
                    <div className="grid size-16 shrink-0 place-items-center rounded-md border bg-muted/30 text-xs font-bold text-muted-foreground sm:size-20">
                        Vídeo
                    </div>
                ) : (
                    <img
                        src={src}
                        alt={item.name}
                        className="size-16 shrink-0 rounded-md border object-cover sm:size-20"
                        loading="lazy"
                        onError={(e) => {
                            const img = e.currentTarget as HTMLImageElement;
                            if (img.src !== FALLBACK_IMG) img.src = FALLBACK_IMG;
                        }}
                    />
                )}

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base font-semibold">{item.name}</div>
                        {item.tipo ? (
                            <span className="rounded-full border bg-muted/20 px-2 py-0.5 text-[11px] font-bold uppercase text-muted-foreground">
                                {item.tipo}
                            </span>
                        ) : null}
                    </div>

                    {item.criado_em ? (
                        <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                            {String(item.criado_em).replace("T", " ")}
                        </div>
                    ) : null}

                    {item.text ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                            {item.text}
                        </p>
                    ) : (
                        <p className="mt-2 text-sm italic text-muted-foreground">
                            Homenagem enviada sem texto.
                        </p>
                    )}

                    {isAudio && item.image ? (
                        <audio className="mt-3 w-full" controls src={resolveImageSrc(item.image)} />
                    ) : null}

                    {isVideo && item.image ? (
                        <video className="mt-3 max-h-72 w-full rounded-lg border bg-black" controls src={resolveImageSrc(item.image)} />
                    ) : null}

                    {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
                </div>
            </div>
        </div>
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

    const [showModal, setShowModal] = useState(false);
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
        setSelected(item);
        setFalecido(item.falecido || "");
        setNascimento(normalizeDate(item.data_nascimento));
        setFalecimento(normalizeDate(item.data_falecimento));
        lastLoadedAtendimentoRef.current = item.atendimento_id;
        await loadMessages(item);
    };

    const approveMessage = async (id: number) => {
        if (!selectedAtendimentoId) {
            alert("Selecione um atendimento.");
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
        } catch (e: any) {
            alert(e?.message || "Erro ao aprovar a mensagem.");
        } finally {
            setActionLoadingId(null);
        }
    };

    const deleteMessage = async (id: number) => {
        if (!selectedAtendimentoId) {
            alert("Selecione um atendimento.");
            return;
        }

        if (!confirm("Deseja excluir esta homenagem?")) {
            return;
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
        } catch (e: any) {
            alert(e?.message || "Erro ao excluir a mensagem.");
        } finally {
            setActionLoadingId(null);
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
            alert("Selecione um atendimento.");
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
        setShowModal(true);
    };

    const onSubmitGenerate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!falecido.trim()) {
            alert("Informe o nome do falecido.");
            return;
        }

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
            alert(err?.message || "Falha ao gerar o PDF.");
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

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold leading-tight">
                        Homenagens Ativas
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Nas salas, o atendimento ativo abre direto. No atendimento externo, use a lista para selecionar.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={refreshAll} className={btn} title="Atualizar">
                        <IconRefresh className="size-4" />
                        Atualizar
                    </button>
                </div>
            </div>

            <div className="mb-5 rounded-2xl border bg-card/60 p-3 shadow-sm sm:p-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                    <FilterButton label="Ativos" active={filter === "todos"} onClick={() => setFilter("todos")} />
                    <FilterButton label="Sala 01" active={filter === "sala01"} onClick={() => { setQuery(""); setFilter("sala01"); }} />
                    <FilterButton label="Sala 02" active={filter === "sala02"} onClick={() => { setQuery(""); setFilter("sala02"); }} />
                    <FilterButton label="Sala 03" active={filter === "sala03"} onClick={() => { setQuery(""); setFilter("sala03"); }} />
                    <FilterButton label="Atendimento Externo" active={filter === "externo"} onClick={() => setFilter("externo")} />
                </div>

                {showAtendimentoList ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <div className="relative flex-1">
                            <IconSearch className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") onSearch();
                                }}
                                placeholder="Buscar por nome do falecido, ID do atendimento ou código da homenagem…"
                                className="w-full rounded-xl border bg-white px-9 py-2.5 text-sm outline-none focus:border-primary"
                            />
                        </div>

                        <button type="button" onClick={onSearch} className={btn}>
                            <IconListSearch className="size-4" />
                            Buscar
                        </button>
                    </div>
                ) : null}

                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:max-w-md">
                    <div className="rounded-lg border bg-white px-2 py-2">
                        <div className="font-black">{totals.pendentes}</div>
                        <div className="text-muted-foreground">Pendentes</div>
                    </div>
                    <div className="rounded-lg border bg-white px-2 py-2">
                        <div className="font-black">{totals.aprovadas}</div>
                        <div className="text-muted-foreground">Aprovadas</div>
                    </div>
                    <div className="rounded-lg border bg-white px-2 py-2">
                        <div className="font-black">{totals.total}</div>
                        <div className="text-muted-foreground">Total</div>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className={showAtendimentoList ? "grid gap-5 lg:grid-cols-[390px_minmax(0,1fr)]" : "grid gap-5"}>
                {showAtendimentoList ? (
                    <aside className="min-w-0">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <IconUserCheck className="size-5 text-muted-foreground" />
                                <h2 className="text-lg font-semibold">Atendimentos ativos</h2>
                            </div>
                            {loadingAtendimentos ? (
                                <span className="text-xs font-semibold text-muted-foreground">Carregando…</span>
                            ) : null}
                        </div>

                        {atendimentos.length === 0 ? (
                            <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                                Nenhum atendimento em andamento encontrado.
                            </div>
                        ) : (
                            <div className="grid max-h-[70vh] gap-3 overflow-auto pr-1">
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

                <main className="min-w-0">
                    {!selected ? (
                        <div className="rounded-2xl border bg-card/60 p-8 text-center">
                            <IconMessageCircle2 className="mx-auto mb-3 size-9 text-muted-foreground" />
                            <h2 className="text-xl font-bold">
                                {isSalaFilter(filter) ? "Nenhum atendimento ativo nesta sala" : "Selecione um atendimento"}
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {isSalaFilter(filter)
                                    ? "Quando houver atendimento em andamento dentro do horário do velório, ele será aberto automaticamente aqui."
                                    : "As mensagens pendentes e aprovadas serão exibidas de acordo com o atendimento selecionado."}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="text-xs font-bold uppercase text-muted-foreground">
                                            Atendimento #{selected.atendimento_id} · {normalizeSala(selected.sala)}
                                        </div>
                                        <h2 className="mt-1 truncate text-2xl font-black">
                                            {selected.falecido}
                                        </h2>
                                        <div className="mt-1 text-sm text-muted-foreground">
                                            {[formatDateBR(selected.data_nascimento), formatDateBR(selected.data_falecimento)]
                                                .filter(Boolean)
                                                .join(" - ")}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={() => loadMessages(selected)} className={btn}>
                                            <IconRefresh className="size-4" />
                                            Atualizar mensagens
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onOpenModal}
                                            className={btn}
                                            disabled={!approved.length}
                                            title="Gerar Livro de Homenagens"
                                        >
                                            <IconDownload className="size-4" />
                                            Baixar Mensagens
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                    <span className={`rounded-full border px-2 py-1 font-bold ${periodClass(derivePeriodStatusStrict(selected))}`}>
                                        {periodLabel(derivePeriodStatusStrict(selected))}
                                    </span>
                                    {selected.link_publico ? (
                                        <a
                                            href={selected.link_publico}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-full border px-2 py-1 font-bold text-primary hover:bg-primary/5"
                                        >
                                            Abrir Legado de Luz
                                        </a>
                                    ) : null}
                                </div>
                            </div>

                            {loadingMessages && (
                                <div className="mb-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                                    Carregando mensagens do atendimento…
                                </div>
                            )}

                            <section className="mb-6">
                                <div className="mb-3 flex items-center gap-2">
                                    <IconMessageCircle2 className="size-5 text-muted-foreground" />
                                    <h2 className="text-lg font-semibold">
                                        Mensagens Pendentes
                                    </h2>
                                </div>

                                {received.length === 0 ? (
                                    <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                                        Nenhuma mensagem pendente neste atendimento.
                                    </div>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                                        {received.map((m) => (
                                            <MessageCard
                                                key={`r-${m.id}`}
                                                item={m}
                                                actions={
                                                    <>
                                                        <button
                                                            onClick={() => approveMessage(m.id)}
                                                            disabled={actionLoadingId === m.id}
                                                            className={`${btn} hover:bg-green-50`}
                                                            title="Aprovar"
                                                        >
                                                            <IconCheck className="size-4 text-green-600" />
                                                            Aprovar
                                                        </button>
                                                        <button
                                                            onClick={() => deleteMessage(m.id)}
                                                            disabled={actionLoadingId === m.id}
                                                            className={`${btn} hover:bg-red-50`}
                                                            title="Excluir"
                                                        >
                                                            <IconTrash className="size-4 text-red-600" />
                                                            Excluir
                                                        </button>
                                                    </>
                                                }
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section>
                                <div className="mb-3 flex items-center gap-2">
                                    <IconMessageCircle2 className="size-5 text-muted-foreground" />
                                    <h2 className="text-lg font-semibold">
                                        Mensagens Aprovadas
                                    </h2>
                                </div>

                                {approved.length === 0 ? (
                                    <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                                        Não há mensagem aprovada neste atendimento.
                                    </div>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                                        {approved.map((m) => (
                                            <MessageCard
                                                key={`a-${m.id}`}
                                                item={m}
                                                actions={
                                                    <button
                                                        onClick={() => deleteMessage(m.id)}
                                                        disabled={actionLoadingId === m.id}
                                                        className={`${btn} hover:bg-red-50`}
                                                        title="Excluir"
                                                    >
                                                        <IconTrash className="size-4 text-red-600" />
                                                        Excluir
                                                    </button>
                                                }
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </main>
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
                    <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-semibold">Gerar Livro de Homenagens</h3>
                                <p className="text-sm text-muted-foreground">
                                    O livro será gerado apenas com as mensagens aprovadas deste atendimento.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="rounded-md border px-3 py-1.5 text-sm"
                            >
                                Fechar
                            </button>
                        </div>

                        <form onSubmit={onSubmitGenerate} className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium">Nome do falecido</label>
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded-md border px-3 py-2 outline-none"
                                    value={falecido}
                                    onChange={(e) => setFalecido(e.target.value)}
                                    placeholder="Ex.: João Batista de Jesus"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="block text-sm font-medium">Nascimento</label>
                                    <input
                                        type="date"
                                        className="mt-1 w-full rounded-md border px-3 py-2 outline-none"
                                        value={nascimento}
                                        onChange={(e) => setNascimento(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Falecimento</label>
                                    <input
                                        type="date"
                                        className="mt-1 w-full rounded-md border px-3 py-2 outline-none"
                                        value={falecimento}
                                        onChange={(e) => setFalecimento(e.target.value)}
                                    />
                                </div>
                            </div>

                            {generating ? (
                                <div className="rounded-md border bg-muted/20 p-3">
                                    <div className="mb-2 text-sm">{progressMsg}</div>
                                    <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
                                        <div
                                            className="h-full bg-blue-600 transition-all"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            ) : null}

                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    disabled={generating}
                                    onClick={() => setShowModal(false)}
                                    className="rounded-md border px-3 py-2 text-sm"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={generating}
                                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                >
                                    Gerar Livro de Homenagens
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
