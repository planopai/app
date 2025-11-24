"use client";

import React, { useEffect, useMemo, useState } from "react";

/* =========================
   Tipos
   ========================= */
type Registro = {
    data?: string;
    falecido?: string;
    local_velorio?: string;
    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    hora_fim_velorio?: string;
    hora_inicio_velorio?: string;
    agente?: string;
    status?: string;
    religiao?: string;
    contato?: string;
    convenio?: string;
    observacao?: string;
    observacao_atendimento?: string;
    observacao_itens?: string;
    observacao_velorio01?: string;
    observacao_velorio02?: string;

    urna?: string;
    roupa?: string;
    assistencia?: string;
    tanato?: string;

    ornamentacao?: string;
    ornamentacao_tipo?: string;

    local?: string;
    local_sepultamento?: string;
    materiais?: string;
    material?: string;

    tipo_atendimento?: "funerario" | "terceiro";

    [key: string]: any;
};

type Aviso = { usuario?: string; mensagem?: string };

type LogItem = {
    id?: number | string;
    datahora?: string;
    acao?: string;
    status_novo?: string;
    detalhes?: any;
    usuario?: string;
};

/* =========================
   Helpers comuns
   ========================= */
const sanitize = (t?: string) =>
    t
        ? t
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
        : "";

const shown = (v?: string, fallback = "a definir") => {
    const s = String(v ?? "").trim();
    return s ? sanitize(s) : fallback;
};

/* Datas/horas → “a definir” para zeros e vazios */
const formatDateBr = (d?: string) =>
    !d ? "" : d.split("-").length === 3 ? `${d.split("-")[2]}/${d.split("-")[1]}/${d.split("-")[0]}` : d;

function dateOr(d?: string) {
    const raw = (d ?? "").trim();
    if (!raw || raw === "0000-00-00" || raw === "00/00/0000") return "a definir";
    const f = formatDateBr(raw);
    if (!f || f === "00/00/0000") return "a definir";
    return f;
}

function timeOr(t?: string) {
    const raw = (t ?? "").trim();
    if (!raw) return "a definir";
    const hhmm = raw.slice(0, 5);
    if (hhmm === "00:00") return "a definir";
    return hhmm;
}

/* ----------- Normalização de status (texto → faseNN) ----------- */
const ROTULO_PARA_FASE: Record<string, string> = {
    removendo: "fase01",
    "aguardando procedimento": "fase02",
    preparando: "fase03",
    "aguardando ornamentacao": "fase04",
    ornamentando: "fase05",
    "corpo pronto": "fase06",
    transportando: "fase07",
    "transportando p/ velorio": "fase07",
    velando: "fase08",
    sepultando: "fase09",
    "transportando p/ sepultamento": "fase09",
    "sepultamento concluido": "fase10",
    "sepultamento concluído": "fase10",
    "material recolhido": "fase11",
    concluido: "fase11",
    concluído: "fase11",
};
function normalizeKey(s: string) {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}
function normalizarStatus(status?: string): string | undefined {
    if (!status) return undefined;
    const s = String(status).trim();
    if (s.toLowerCase().startsWith("fase")) {
        const digits = s.replace(/[^0-9]/g, "");
        if (!digits) return s.toLowerCase();
        return `fase${digits.padStart(2, "0")}`.toLowerCase();
    }
    const mapeado = ROTULO_PARA_FASE[normalizeKey(s)];
    return (mapeado || s).toLowerCase();
}

/* ---------------- Status badge ---------------- */
function capStatus(s?: string) {
    switch (normalizarStatus(s)) {
        case "fase01":
            return "Removendo";
        case "fase02":
            return "Aguardando Procedimento";
        case "fase03":
            return "Preparando";
        case "fase04":
            return "Aguardando Ornamentação";
        case "fase05":
            return "Ornamentando";
        case "fase06":
            return "Corpo Pronto";
        case "fase07":
            return "Transportando P/ Velório";
        case "fase08":
            return "Velando";
        case "fase09":
            return "Transportando P/ Sepultamento";
        case "fase10":
            return "Sepultamento Concluído";
        case "fase11":
            return "Material Recolhido";
        default:
            return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
    }
}

function badgeClass(s?: string) {
    const x = (normalizarStatus(s) || "").toLowerCase();
    if (x === "fase01") return "bg-amber-600";
    if (x === "fase02") return "bg-zinc-600";
    if (x === "fase03") return "bg-blue-600";
    if (x === "fase04") return "bg-fuchsia-600";
    if (x === "fase05") return "bg-rose-600";
    if (x === "fase06") return "bg-emerald-600";
    if (x === "fase07") return "bg-cyan-600";
    if (x === "fase08") return "bg-violet-600";
    if (x === "fase09") return "bg-orange-600";
    if (x === "fase10") return "bg-green-700";
    if (x === "fase11") return "bg-slate-700";
    return "bg-slate-500";
}

/* Convenio chip */
type ConvenioKind = "Particular" | "Prefeitura" | "Associado" | "a definir";
function normalizeConvenio(s?: string): ConvenioKind {
    const v = (s || "").toLowerCase();
    if (!v) return "a definir";
    if (v.includes("prefeitura")) return "Prefeitura";
    if (v.includes("associad")) return "Associado";
    if (v.includes("particular")) return "Particular";
    return "a definir";
}
function convenioClass(kind: ConvenioKind) {
    switch (kind) {
        case "Particular":
            return "bg-amber-500";
        case "Prefeitura":
            return "bg-cyan-600";
        case "Associado":
            return "bg-emerald-600";
        default:
            return "bg-slate-500";
    }
}

/* ---------------- Etapas (bolinhas) ---------------- */
const STAGE_DOT_FILLED = [
    "bg-emerald-500 border-emerald-600",
    "bg-sky-500 border-sky-600",
    "bg-violet-500 border-violet-600",
    "bg-amber-500 border-amber-600",
];
const STAGE_DOT_EMPTY = "bg-transparent border-slate-300 dark:border-slate-600";

/*
  Regras das etapas:
  - D (0): falecido, contato, religiao, convenio (todos)
  - I (1): urna, roupa, assistencia, tanato (todos)
  - V (2): local_velorio e data_inicio_velorio e (local_sepultamento OU local)
  - S (3): hora_inicio_velorio OU (data_fim_velorio E hora_fim_velorio)
*/
const LABELS: Record<string, string> = {
    falecido: "Falecido",
    contato: "Contato",
    religiao: "Religião",
    convenio: "Convênio",
    urna: "Urna",
    roupa: "Roupa",
    assistencia: "Assistência",
    tanato: "Tanatopraxia",
    local_velorio: "Local do Velório",
    data_inicio_velorio: "Data Início Velório",
    data_fim_velorio: "Data Fim Velório",
    hora_inicio_velorio: "Início Velório",
    hora_fim_velorio: "Fim Velório",
    local: "Local (Geral)",
    local_sepultamento: "Local Sepultamento",
};

const isFilled = (registro: Registro, key?: string) => {
    if (!key) return false;
    const v = registro[key];
    if (v == null) return false;
    const s = String(v).trim().toLowerCase();
    if (!s) return false;
    if (["selecionar...", "selecione...", "a definir"].includes(s)) return false;
    if (key.startsWith("data") && (s === "0000-00-00" || s === "00/00/0000")) return false;
    if (key.startsWith("hora") && s.startsWith("00:00")) return false;
    return true;
};

function etapasPreenchidas(registro: Registro) {
    const d = [false, false, false, false];

    d[0] = ["falecido", "contato", "religiao", "convenio"].every((k) => isFilled(registro, k));
    d[1] = ["urna", "roupa", "assistencia", "tanato"].every((k) => isFilled(registro, k));
    d[2] =
        isFilled(registro, "local_velorio") &&
        isFilled(registro, "data_inicio_velorio") &&
        (isFilled(registro, "local_sepultamento") || isFilled(registro, "local"));
    d[3] =
        isFilled(registro, "hora_inicio_velorio") ||
        (isFilled(registro, "data_fim_velorio") && isFilled(registro, "hora_fim_velorio"));

    return d;
}

/* =========================
   Texto para copiar
   ========================= */
function buildClipboardText(r: Registro) {
    const v = (k: string) => String(r?.[k] ?? "").trim();
    const atend = (v("convenio") || "A DEFINIR").toUpperCase();

    const ornTipoRaw = v("ornamentacao_tipo") || v("ornamentacao");
    const ornTipo =
        ornTipoRaw
            ? (ornTipoRaw.charAt(0).toUpperCase() + ornTipoRaw.slice(1)).replace(/\s+/g, " ")
            : "A DEFINIR";

    const lines = [
        `*ATENDIMENTO ${atend}*`,
        `*Falecido:* ${v("falecido") || "A DEFINIR"}`,
        `*Contato:* ${v("contato") || "A DEFINIR"}`,
        `*Religião:* ${v("religiao") || "A DEFINIR"}`,
        `*Urna:* ${v("urna") || "A DEFINIR"}`,
        `*Roupa:* ${v("roupa") || "A DEFINIR"}`,
        `*Assistência:* ${v("assistencia") || "A DEFINIR"}`,
        `*Tanato:* ${v("tanato") || "A DEFINIR"}`,
        `*Ornamentação:* ${ornTipo || "A DEFINIR"}`,
        `*Local do Velório:* ${v("local_velorio") || "A DEFINIR"}`,
        `*Agente:* ${v("agente") || "A DEFINIR"}`,
        `*Observação:* ${v("observacao") || "A DEFINIR"}`,
    ];
    return lines.join("\n\n");
}

/* =========================
   Regras do painel
   ========================= */
function isNao(v?: string) {
    const s = (v || "").toString().trim().toLowerCase();
    return s === "não" || s === "nao" || s === "n";
}
function isSim(v?: string) {
    const s = (v || "").toString().trim().toLowerCase();
    return s === "sim" || s === "s";
}
function isTerceiroRegistro(r: Registro) {
    if ((r as any).tipo_atendimento === "terceiro") return true;
    return isNao(r.assistencia) && isNao(r.tanato) && isNao(r.ornamentacao);
}

/* ===== Helpers Linha do Tempo ===== */
const PAGE_SIZE = 5;

function parseRegistroDateTime(r: Registro) {
    const d = (r.data || "").trim();
    const h = (r.hora_fim_velorio || r.hora_inicio_velorio || "").trim() || "00:00";
    if (!d) return 0;
    const [yyyy, mm, dd] = d.split("-");
    const iso = `${yyyy}-${mm}-${dd}T${h}:00`;
    const ts = Date.parse(iso);
    return Number.isNaN(ts) ? 0 : ts;
}

/* Helpers diversos usados também na Linha do Tempo */
function capitalize(str?: string): string {
    if (!str) return "";
    const s = str.toString().trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function formatLogDateTime(value?: string): string {
    if (!value) return "";
    const s = value.replace(" ", "T");
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return value;
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, "0");
    const mi = d.getMinutes().toString().padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function asBool(val: unknown): boolean {
    if (typeof val === "boolean") return val;
    const s = String(val ?? "").trim().toLowerCase();
    if (!s) return false;
    return ["1", "true", "t", "sim", "s", "yes", "y"].includes(s);
}

function titleCaseFromSnake(key: string): string {
    return key
        .split("_")
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(" ");
}

function overrideCampoNome(key: string, defaultName: string): string {
    return defaultName;
}

function substituirRotuloVisual(text: string): string {
    return text;
}

function formataSeDataIso(value: string): string {
    const v = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const [yyyy, mm, dd] = v.split("-");
        return `${dd}/${mm}/${yyyy}`;
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)) {
        const [datePart, timePart] = v.split(" ");
        const [yyyy, mm, dd] = datePart.split("-");
        const hhmm = timePart.slice(0, 5);
        return `${dd}/${mm}/${yyyy} ${hhmm}`;
    }
    return v;
}

function traduzirFase(s?: string) {
    return capStatus(s) || (s ?? "");
}

function iconForAction(acao?: string, status?: string): string {
    const a = (acao || "").toLowerCase();
    if (a.includes("criou") || a.includes("novo") || a.includes("inser")) return "🟢";
    if (a.includes("edit") || a.includes("atualiz") || a.includes("alter")) return "✏️";
    if (a.includes("exclu") || a.includes("delet") || a.includes("remove")) return "🗑️";
    const st = (status || "").toLowerCase();
    if (st.startsWith("fase")) return "🔁";
    return "•";
}

/* =========================
   Página
   ========================= */
export default function QuadroAtendimentoPage() {
    const [clockTime, setClockTime] = useState("");
    const [clockDate, setClockDate] = useState("");
    const [registros, setRegistros] = useState<Registro[]>([]);
    const [avisos, setAvisos] = useState<Aviso[]>([]);

    // modal detalhes
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<Registro | null>(null);
    const [copied, setCopied] = useState(false);

    // modal linha do tempo
    const [timelineOpen, setTimelineOpen] = useState(false);
    const [timelinePage, setTimelinePage] = useState(0);
    const [timelineSearch, setTimelineSearch] = useState("");
    const [selectedRegistro, setSelectedRegistro] = useState<Registro | null>(null);
    const [timelineLogs, setTimelineLogs] = useState<LogItem[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [timelineError, setTimelineError] = useState<string | null>(null);

    // relógio
    useEffect(() => {
        const update = () => {
            const now = new Date();
            const h = now.getHours().toString().padStart(2, "0");
            const m = now.getMinutes().toString().padStart(2, "0");
            const s = now.getSeconds().toString().padStart(2, "0");
            setClockTime(`${h}:${m}:${s}`);
            const dias = [
                "Domingo",
                "Segunda-feira",
                "Terça-feira",
                "Quarta-feira",
                "Quinta-feira",
                "Sexta-feira",
                "Sábado",
            ];
            const dd = now.getDate().toString().padStart(2, "0");
            const mm = (now.getMonth() + 1).toString().padStart(2, "0");
            const yyyy = now.getFullYear();
            setClockDate(`${dias[now.getDay()]}, ${dd}/${mm}/${yyyy}`);
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, []);

    // dados
    useEffect(() => {
        const load = () =>
            fetch(
                `https://planoassistencialintegrado.com.br/informativo.php?listar=1&_nocache=${Date.now()}`,
                {
                    cache: "no-store",
                }
            )
                .then((r) => r.json())
                .then((j) => setRegistros(Array.isArray(j) ? j : []))
                .catch(() => setRegistros([]));
        load();
        const id = setInterval(load, 8000);
        return () => clearInterval(id);
    }, []);

    // avisos
    useEffect(() => {
        const load = () =>
            fetch(
                `https://planoassistencialintegrado.com.br/avisos.php?listar=1&_nocache=${Date.now()}`,
                { cache: "no-store" }
            )
                .then((r) => r.json())
                .then((j) => setAvisos(Array.isArray(j) ? j : []))
                .catch(() => setAvisos([]));
        load();
        const id = setInterval(load, 20000);
        return () => clearInterval(id);
    }, []);

    // abrir/fechar modal detalhes
    function showDetail(r: Registro) {
        setDetail(r);
        setOpen(true);
        setCopied(false);
    }
    function closeDetail() {
        setOpen(false);
        setDetail(null);
        setCopied(false);
    }

    // abrir/fechar Linha do Tempo
    function openTimeline() {
        setTimelineOpen(true);
        setTimelinePage(0);
        setTimelineSearch("");
        setSelectedRegistro(null);
        setTimelineLogs([]);
        setTimelineError(null);
    }
    function closeTimeline() {
        setTimelineOpen(false);
        setSelectedRegistro(null);
        setTimelineLogs([]);
        setTimelineError(null);
        setTimelineSearch("");
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeDetail();
                closeTimeline();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    /* =========================
       ATIVOS: aplica as 3 regras do painel
       ========================= */
    const ativos = useMemo(() => {
        return registros.filter((r) => {
            const status = normalizarStatus(r.status);

            if (status === "fase11") return false;

            if (isTerceiroRegistro(r)) {
                return status !== "fase10";
            }

            if (!isSim(r.assistencia)) {
                return status !== "fase10";
            }

            return true;
        });
    }, [registros]);

    // lista completa ordenada por data/hora (mais recentes primeiro)
    const falecidosOrdenados = useMemo(
        () =>
            [...registros]
                .filter((r) => r.falecido)
                .sort((a, b) => parseRegistroDateTime(b) - parseRegistroDateTime(a)),
        [registros]
    );

    // filtro por nome (barra de pesquisa)
    const falecidosFiltrados = useMemo(() => {
        const termo = timelineSearch.trim().toLowerCase();
        if (!termo) return falecidosOrdenados;
        return falecidosOrdenados.filter((r) =>
            (r.falecido || "").toLowerCase().includes(termo)
        );
    }, [falecidosOrdenados, timelineSearch]);

    // resetar página quando o filtro mudar
    useEffect(() => {
        setTimelinePage(0);
    }, [timelineSearch]);

    const totalTimelinePages = Math.max(
        1,
        Math.ceil(falecidosFiltrados.length / PAGE_SIZE)
    );
    const falecidosPaginaAtual = falecidosFiltrados.slice(
        timelinePage * PAGE_SIZE,
        timelinePage * PAGE_SIZE + PAGE_SIZE
    );

    // copiar para clipboard
    async function handleCopy() {
        if (!detail) return;
        const text = buildClipboardText(detail);
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand("copy");
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } finally {
                document.body.removeChild(ta);
            }
        }
    }

    // carregar histórico da Linha do Tempo
    async function carregarHistorico(r: Registro) {
        setSelectedRegistro(r);
        setTimelineLogs([]);
        setTimelineError(null);
        setTimelineLoading(true);

        try {
            const sepId =
                (r as any).sepultamento_id ??
                (r as any).sepultamentoId ??
                (r as any).id ??
                (r as any).id_atendimento ??
                (r as any).codigo;

            if (!sepId) {
                console.warn("Registro sem sepultamento_id para histórico:", r);
                setTimelineLogs([]);
                setTimelineLoading(false);
                return;
            }

            const url = `https://planoassistencialintegrado.com.br/historico_sepultamentos.php?log=1&id=${encodeURIComponent(
                String(sepId)
            )}&_nocache=${Date.now()}`;

            const resp = await fetch(url, { cache: "no-store" });

            if (!resp.ok) {
                console.error(
                    "Falha HTTP ao buscar histórico:",
                    resp.status,
                    resp.statusText
                );
                setTimelineError(
                    "Não foi possível carregar o histórico deste atendimento."
                );
                setTimelineLogs([]);
                return;
            }

            const json: any = await resp.json();

            let logs: LogItem[] = [];
            if (Array.isArray(json)) {
                logs = json as LogItem[];
            } else if (json?.sucesso && Array.isArray(json.dados)) {
                logs = json.dados as LogItem[];
            }

            setTimelineLogs(logs);
        } catch (e) {
            console.error(e);
            setTimelineError(
                "Não foi possível carregar o histórico deste atendimento."
            );
        } finally {
            setTimelineLoading(false);
        }
    }

    // helpers para observações por container
    const obsList = (missing: string[]) =>
        missing.length
            ? `Pendências: ${missing.map((k) => LABELS[k] ?? k).join(", ")}.`
            : "Completo.";

    const missingEtapa0 = (r: Registro) =>
        ["falecido", "contato", "religiao", "convenio"].filter((k) => !isFilled(r, k));
    const missingEtapa1 = (r: Registro) =>
        ["urna", "roupa", "assistencia", "tanato"].filter((k) => !isFilled(r, k));
    const missingEtapa2 = (r: Registro) => {
        const miss: string[] = [];
        if (!isFilled(r, "local_velorio")) miss.push("local_velorio");
        if (!isFilled(r, "data_inicio_velorio")) miss.push("data_inicio_velorio");
        if (!(isFilled(r, "local_sepultamento") || isFilled(r, "local")))
            miss.push("local_sepultamento");
        return miss;
    };
    const noteEtapa3 = (r: Registro) => {
        const hasInicio = isFilled(r, "hora_inicio_velorio");
        const hasFim =
            isFilled(r, "data_fim_velorio") && isFilled(r, "hora_fim_velorio");
        if (hasInicio && hasFim) return "Horários definidos.";
        if (hasInicio) return "Horário de início definido.";
        if (hasFim) return "Horário de encerramento definido.";
        return "Pendências de horário.";
    };

    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 space-y-6">
            {/* Header/clock + botão Linha do Tempo */}
            <div className="rounded-2xl border bg-card/60 p-5 sm:p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Quadro de Atendimentos
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Atualizado em tempo real —{" "}
                            <span className="font-medium">{clockTime}</span> • {clockDate}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={openTimeline}
                        className="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        Linha do Tempo
                    </button>
                </div>
            </div>

            {/* Tabela (desktop) */}
            <div className="hidden sm:block rounded-2xl border bg-card/60 p-0 shadow-sm">
                <div className="overflow-x-auto rounded-2xl">
                    <table className="min-w-full text-sm">
                        <thead className="bg-muted/60 text-muted-foreground">
                            <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-left">
                                <th>Data</th>
                                <th>Falecido(a)</th>
                                <th>Local</th>
                                <th>Hora</th>
                                <th>Agente</th>
                                <th>Status</th>
                                <th>Etapas</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {ativos.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-4 py-6 text-center text-muted-foreground"
                                    >
                                        Nenhum atendimento encontrado.
                                    </td>
                                </tr>
                            ) : (
                                ativos.map((r, i) => {
                                    const preenchidas = etapasPreenchidas(r);
                                    return (
                                        <tr key={i} className="[&>td]:px-4 [&>td]:py-3">
                                            <td>{dateOr(r.data)}</td>
                                            <td>
                                                <button
                                                    className="font-semibold underline-offset-2 hover:underline"
                                                    onClick={() => showDetail(r)}
                                                    title="Ver detalhes"
                                                >
                                                    {shown(r.falecido)}
                                                </button>
                                            </td>
                                            <td>{shown(r.local_velorio)}</td>
                                            <td>{timeOr(r.hora_fim_velorio)}</td>
                                            <td>{shown(r.agente)}</td>
                                            <td>
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white ${badgeClass(
                                                        r.status
                                                    )}`}
                                                >
                                                    {capStatus(r.status) || "a definir"}
                                                </span>
                                            </td>
                                            <td>
                                                <EtapasInlineDots filled={preenchidas} />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Cards (mobile) */}
            <div className="sm:hidden space-y-3">
                {ativos.length === 0 ? (
                    <div className="rounded-xl border bg-card/60 p-4 text-center text-muted-foreground">
                        Nenhum atendimento encontrado.
                    </div>
                ) : (
                    ativos.map((r, i) => {
                        const preenchidas = etapasPreenchidas(r);
                        const dataBR = dateOr(r.data);
                        const hora = timeOr(r.hora_fim_velorio);
                        const statusTxt = capStatus(r.status) || "a definir";
                        const statusBg = badgeClass(r.status);
                        const localSep = shown(r.local_sepultamento || r.local);
                        const convKind = normalizeConvenio(r.convenio);
                        return (
                            <div
                                key={i}
                                className="rounded-xl border bg-card/60 p-4 shadow-sm box-border"
                            >
                                {/* Linha 1: Título + Data */}
                                <div className="flex items-start justify-between gap-3">
                                    <button
                                        className="text-left text-[17px] font-semibold leading-tight underline-offset-2 hover:underline"
                                        onClick={() => showDetail(r)}
                                        title="Ver detalhes"
                                    >
                                        {shown(r.falecido)}
                                    </button>
                                    <div className="shrink-0 text-xs text-muted-foreground mt-0.5">
                                        {dataBR}
                                    </div>
                                </div>

                                {/* Linha 2: Chips + Agente */}
                                <div className="mt-2 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white ${statusBg}`}
                                        >
                                            {statusTxt}
                                        </span>
                                        <span
                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${convenioClass(
                                                convKind
                                            )}`}
                                            title="Convênio"
                                        >
                                            {convKind}
                                        </span>
                                    </div>
                                    <div className="text-xs">
                                        <span className="text-muted-foreground">
                                            Agente:&nbsp;
                                        </span>
                                        <b>{shown(r.agente)}</b>
                                    </div>
                                </div>

                                {/* Linha 3: Local (velório) */}
                                <div className="mt-2 text-sm">
                                    <span className="text-muted-foreground">Local:&nbsp;</span>
                                    {shown(r.local_velorio)}
                                </div>

                                {/* Bloco: Sepultamento */}
                                <div className="mt-3 rounded-lg border bg-background p-3 box-border">
                                    <div className="text-sm">
                                        <span className="text-muted-foreground">
                                            Sepultamento&nbsp;
                                        </span>
                                        <b>{localSep}</b>
                                    </div>
                                    <div className="mt-1 grid grid-cols-2 text-sm">
                                        <div className="text-muted-foreground">
                                            {dateOr(r.data_fim_velorio)}
                                        </div>
                                        <div className="text-right">{hora}</div>
                                    </div>
                                </div>

                                {/* Etapas coloridas */}
                                <div className="mt-3">
                                    <div className="text-xs text-muted-foreground">Etapas:</div>
                                    <EtapasInlineDots filled={preenchidas} />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Avisos */}
            <div className="rounded-2xl border bg-card/60 p-5 sm:p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Avisos</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Mensagens importantes do sistema
                </p>
                <div className="mt-4 space-y-2">
                    {avisos.length === 0 ? (
                        <p className="text-muted-foreground">Nenhum aviso no momento.</p>
                    ) : (
                        avisos.map((a, i) => (
                            <div key={i} className="flex gap-2 text-sm">
                                <strong>{sanitize(a.usuario)}</strong>
                                <span>{sanitize(a.mensagem)}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ===== Modal de Detalhes ===== */}
            {open && detail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={closeDetail}
                        aria-hidden
                    />
                    <div className="relative z-10 w-full max-w-4xl box-border rounded-xl border bg-card shadow-2xl max-h-[80vh] overflow-y-auto overscroll-contain">
                        <div className="sticky top-0 z-[1] border-b bg-card/95 backdrop-blur px-3 py-2 sm:px-4 sm:py-3 box-border">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[12px] text-muted-foreground leading-tight">
                                        Detalhes do atendimento
                                    </div>
                                    <h3 className="truncate text-base sm:text-lg font-bold leading-tight">
                                        {shown(detail.falecido)}
                                    </h3>
                                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[12px] sm:text-sm">
                                        <span className="text-muted-foreground">
                                            Data: <b>{dateOr(detail.data)}</b>
                                        </span>
                                        <span className="text-muted-foreground">
                                            • Hora: <b>{timeOr(detail.hora_fim_velorio)}</b>
                                        </span>
                                        <span className="text-muted-foreground">
                                            • Agente: <b>{shown(detail.agente)}</b>
                                        </span>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    <span
                                        className={`hidden sm:inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white ${badgeClass(
                                            detail.status
                                        )}`}
                                        title="Status"
                                    >
                                        {capStatus(detail.status)}
                                    </span>
                                    <span className="hidden sm:inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                        ATENDIMENTO{" "}
                                        {shown(detail.convenio, "A DEFINIR").toUpperCase()}
                                    </span>
                                    <button
                                        onClick={handleCopy}
                                        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                                        aria-label="Copiar"
                                        title="Copiar informações"
                                    >
                                        {copied ? "Copiado!" : "Copiar"}
                                    </button>
                                    <button
                                        onClick={closeDetail}
                                        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                                        aria-label="Fechar"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>

                            <div className="mt-2 flex gap-2 sm:hidden">
                                <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white ${badgeClass(
                                        detail.status
                                    )}`}
                                >
                                    {capStatus(detail.status)}
                                </span>
                                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                    ATEND.{" "}
                                    {shown(detail.convenio, "A DEFINIR").toUpperCase()}
                                </span>
                            </div>
                        </div>

                        <div className="px-3 py-3 sm:px-4 sm:py-4 space-y-6 box-border">
                            <Topic title="INFORMAÇÕES GERAIS" note={obsList(missingEtapa0(detail))}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2">
                                    <Field label="Falecido" value={shown(detail.falecido)} />
                                    <Field label="Religião" value={shown(detail.religiao)} />
                                    <Field
                                        label="Contato"
                                        value={shown(detail.contato)}
                                        className="sm:col-span-2"
                                    />
                                    <Field
                                        label="Convênio"
                                        value={shown(detail.convenio)}
                                        className="sm:col-span-2"
                                    />
                                    <Field
                                        label="Obs. Atendimento"
                                        value={shown(detail.observacao_atendimento, "")}
                                        className="sm:col-span-2"
                                    />
                                </div>
                            </Topic>

                            <Topic title="ITENS" note={obsList(missingEtapa1(detail))}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2">
                                    <Field label="Urna" value={shown(detail.urna)} />
                                    <Field label="Roupa" value={shown(detail.roupa)} />
                                    <Field
                                        label="Assistência"
                                        value={shown(detail.assistencia)}
                                    />
                                    <Field label="Tanatopraxia" value={shown(detail.tanato)} />
                                    <Field
                                        label="Ornamentação"
                                        value={shown(
                                            (detail.ornamentacao_tipo ??
                                                detail.ornamentacao) as string
                                        )}
                                    />
                                    <Field
                                        label="Materiais"
                                        value={shown(
                                            (detail.materiais ?? detail.material ?? "") as string,
                                            "a definir"
                                        )}
                                        className="sm:col-span-2"
                                    />
                                    <Field
                                        label="Obs. Itens"
                                        value={shown(detail.observacao_itens, "")}
                                        className="sm:col-span-2"
                                    />
                                </div>
                            </Topic>

                            <Topic title="VELÓRIO" note={obsList(missingEtapa2(detail))}>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-2">
                                    <Field
                                        label="Local Velório"
                                        value={shown(detail.local_velorio)}
                                    />
                                    <Field
                                        label="Data Início Velório"
                                        value={dateOr(detail.data_inicio_velorio)}
                                    />
                                </div>
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2">
                                    <Field
                                        label="Início Velório"
                                        value={timeOr(detail.hora_inicio_velorio)}
                                    />
                                    <Field
                                        label="Obs. Velório"
                                        value={shown(detail.observacao_velorio01, "")}
                                        className="sm:col-span-2"
                                    />
                                </div>
                            </Topic>

                            <Topic title="SEPULTAMENTO" note={noteEtapa3(detail)}>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-2">
                                    <Field
                                        label="Local"
                                        value={shown(
                                            detail.local_sepultamento || detail.local
                                        )}
                                    />
                                    <Field
                                        label="Data"
                                        value={dateOr(detail.data_fim_velorio)}
                                    />
                                    <Field
                                        label="Hora"
                                        value={timeOr(detail.hora_fim_velorio)}
                                    />
                                    <Field
                                        label="Obs. Sepultamento"
                                        value={shown(detail.observacao_velorio02, "")}
                                        className="sm:col-span-2"
                                    />
                                </div>
                            </Topic>

                            <div className="rounded-xl border bg-background p-3 box-border">
                                <div className="text-[12px] sm:text-sm text-muted-foreground mb-2">
                                    Etapas preenchidas
                                </div>
                                <EtapasRow registro={detail} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Modal Linha do Tempo ===== */}
            {timelineOpen && (
                <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-6">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={closeTimeline}
                        aria-hidden
                    />
                    <div className="relative z-10 w-full max-w-5xl box-border rounded-xl border bg-card shadow-2xl max-h-[85vh] overflow-y-auto overscroll-contain">
                        <div className="sticky top-0 z-[1] border-b bg-card/95 backdrop-blur px-3 py-2 sm:px-4 sm:py-3 box-border">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[12px] text-muted-foreground leading-tight">
                                        Histórico de atendimentos
                                    </div>
                                    <h3 className="truncate text-base sm:text-lg font-bold leading-tight">
                                        Linha do Tempo
                                    </h3>
                                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                                        Selecione um falecido na lista para visualizar a
                                        linha do tempo dos eventos.
                                    </p>
                                </div>
                                <button
                                    onClick={closeTimeline}
                                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                                    aria-label="Fechar"
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>

                        <div className="px-3 py-3 sm:px-4 sm:py-4 grid gap-4 sm:gap-6 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)] box-border">
                            {/* Lista de falecidos (paginada + busca) */}
                            <section className="rounded-xl border bg-background p-3 sm:p-4 flex flex-col box-border">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <h4 className="text-xs sm:text-sm font-semibold text-slate-700">
                                        Últimos falecidos
                                    </h4>
                                    <span className="text-[11px] text-muted-foreground">
                                        Página {timelinePage + 1} de {totalTimelinePages}
                                    </span>
                                </div>

                                {/* Barra de pesquisa */}
                                <div className="mb-3">
                                    <input
                                        type="text"
                                        value={timelineSearch}
                                        onChange={(e) => setTimelineSearch(e.target.value)}
                                        placeholder="Pesquisar por nome..."
                                        className="w-full rounded-full border px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 box-border"
                                    />
                                </div>

                                {falecidosPaginaAtual.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        Nenhum falecido encontrado.
                                    </p>
                                ) : (
                                    <ul className="space-y-2 text-sm">
                                        {falecidosPaginaAtual.map((r, idx) => {
                                            const isSelected =
                                                selectedRegistro && selectedRegistro === r;
                                            return (
                                                <li key={idx}>
                                                    <button
                                                        type="button"
                                                        onClick={() => carregarHistorico(r)}
                                                        className={`text-left rounded-lg border px-3 py-2 transition shadow-sm box-border ${isSelected
                                                                ? "border-blue-600 bg-blue-50/80 dark:bg-blue-950/40"
                                                                : "border-transparent bg-background hover:border-blue-200 hover:bg-muted/60"
                                                            }`}
                                                        style={{ width: "100%" }}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="font-semibold text-[13px] sm:text-sm">
                                                                {shown(r.falecido)}
                                                            </span>
                                                            <span className="text-[11px] text-muted-foreground">
                                                                {dateOr(r.data)}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
                                                            <span>
                                                                {shown(
                                                                    r.local_velorio,
                                                                    "Local a definir"
                                                                )}
                                                            </span>
                                                            <span>{capStatus(r.status)}</span>
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}

                                {/* Paginação */}
                                <div className="mt-3 flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setTimelinePage((p) => Math.max(0, p - 1))
                                        }
                                        disabled={timelinePage === 0}
                                        className="rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50 hover:bg-muted box-border"
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setTimelinePage((p) =>
                                                p + 1 < totalTimelinePages ? p + 1 : p
                                            )
                                        }
                                        disabled={
                                            timelinePage + 1 >= totalTimelinePages
                                        }
                                        className="rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50 hover:bg-muted box-border"
                                    >
                                        Próxima
                                    </button>
                                </div>
                            </section>

                            {/* Linha do tempo do selecionado */}
                            <section className="rounded-xl border bg-background p-3 sm:p-4 box-border">
                                {selectedRegistro ? (
                                    <div className="max-w-xl mx-auto">
                                        <div className="mb-3">
                                            <h4 className="text-xs sm:text-sm font-semibold text-slate-700">
                                                Linha do tempo —{" "}
                                                {shown(selectedRegistro.falecido)}
                                            </h4>
                                            <p className="text-[11px] sm:text-xs text-muted-foreground">
                                                Eventos registrados para este atendimento.
                                            </p>
                                        </div>

                                        {timelineLoading && (
                                            <p className="text-sm text-muted-foreground">
                                                Carregando histórico…
                                            </p>
                                        )}

                                        {timelineError && (
                                            <p className="text-sm text-red-600">
                                                {timelineError}
                                            </p>
                                        )}

                                        {!timelineLoading &&
                                            !timelineError &&
                                            timelineLogs.length === 0 && (
                                                <p className="text-sm text-muted-foreground">
                                                    Nenhum log encontrado para este
                                                    atendimento.
                                                </p>
                                            )}

                                        {!timelineLoading &&
                                            !timelineError &&
                                            timelineLogs.length > 0 && (
                                                <LinhaDoTempoLogs
                                                    logs={timelineLogs}
                                                    usuarioVisivel
                                                />
                                            )}
                                    </div>
                                ) : (
                                    <div className="flex h-full items-center justify-center text-center">
                                        <p className="text-sm text-muted-foreground">
                                            Selecione um falecido na lista ao lado para
                                            visualizar a linha do tempo dos eventos.
                                        </p>
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ===== Componentes auxiliares ===== */

function Topic({
    title,
    children,
    note,
}: {
    title: string;
    children: React.ReactNode;
    note?: string;
}) {
    return (
        <section className="rounded-xl border bg-background p-3 sm:p-4 box-border">
            <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-semibold tracking-wide text-slate-600 mb-3">
                    {title}
                </h4>
                {note && (
                    <div className="text-[11px] sm:text-xs text-muted-foreground italic">
                        {note}
                    </div>
                )}
            </div>
            {children}
        </section>
    );
}

function Field({
    label,
    value,
    className = "",
}: {
    label: string;
    value: string;
    className?: string;
}) {
    return (
        <div className={`flex items-baseline gap-2 ${className}`}>
            <span className="min-w-[140px] text-[13px] sm:text-sm font-semibold text-slate-700">
                {label}:
            </span>
            <span className="text-[13px] sm:text-sm text-slate-900">{value}</span>
        </div>
    );
}

/* Dots coloridos inline */
function EtapasInlineDots({ filled }: { filled: boolean[] }) {
    const labels = ["D", "I", "V", "S"];
    return (
        <div className="mt-1 flex items-center gap-4">
            {labels.map((label, k) => (
                <div key={k} className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                    <span
                        className={`h-3.5 w-3.5 rounded-full border ${filled[k] ? STAGE_DOT_FILLED[k] : STAGE_DOT_EMPTY
                            }`}
                    />
                </div>
            ))}
        </div>
    );
}

/* Linha de etapas (modal) */
function EtapasRow({ registro }: { registro: Registro }) {
    const preenchidas = etapasPreenchidas(registro);
    const labels = ["D", "I", "V", "S"];
    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {labels.map((label, k) => (
                <div key={k} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span
                        className={`h-4 w-4 rounded-full border ${preenchidas[k] ? STAGE_DOT_FILLED[k] : STAGE_DOT_EMPTY
                            }`}
                    />
                </div>
            ))}
        </div>
    );
}

/* ===== Linha do Tempo (Logs) ===== */

function buildDetalhesNodes(raw: unknown): React.ReactNode {
    if (raw == null || raw === "") return null;

    let obj: unknown = raw;

    if (typeof raw === "string") {
        try {
            obj = JSON.parse(raw);
        } catch {
            const text = substituirRotuloVisual(raw.trim());
            return text ? (
                <div className="mt-2 text-sm break-words whitespace-pre-wrap">
                    {text}
                </div>
            ) : null;
        }
    }

    if (isPlainObject(obj)) {
        const plainObj = obj as Record<string, unknown>;
        const chips: React.ReactNode[] = [];
        const arrItems: string[] = [];

        for (const key of Object.keys(plainObj)) {
            if (["materiais_json", "id", "acao"].includes(key)) continue;

            const value = plainObj[key];

            // Arrumação
            if (
                /^arrum[aã]cao(\s*json|_json)?$/i.test(key) &&
                value &&
                isPlainObject(value)
            ) {
                for (const [k, v] of Object.entries(value)) {
                    if (asBool(v)) {
                        arrItems.push(`✅ ${titleCaseFromSnake(k)}`);
                    }
                }
                continue;
            }

            // Materiais_*_qtd
            const m = key.match(/^materiais_(.+?)_qtd$/i);
            if (m) {
                const valRaw = value;
                if (valRaw != null && String(valRaw).trim() !== "") {
                    const nomeBase = titleCaseFromSnake(m[1]);
                    const nome = overrideCampoNome(m[1], nomeBase);
                    const valFmt = formataSeDataIso(String(valRaw));
                    chips.push(
                        <span
                            key={key}
                            className="inline-block max-w-full break-words whitespace-pre-wrap rounded border px-2 py-1 text-xs mr-2 mb-2 box-border"
                        >
                            <b>{nome}:</b> {valFmt}
                        </span>
                    );
                }
                continue;
            }

            if (value == null) continue;
            if (typeof value === "object") continue;

            const valStr = String(value).trim();
            if (!valStr) continue;

            let nome = key.replace(/_/g, " ");
            nome = overrideCampoNome(key, titleCaseFromSnake(nome));
            let valFmt = valStr;
            if (valFmt.startsWith("fase")) valFmt = traduzirFase(valFmt);
            valFmt = formataSeDataIso(valFmt);
            nome = substituirRotuloVisual(nome);
            valFmt = substituirRotuloVisual(valFmt);

            chips.push(
                <span
                    key={key}
                    className="inline-block max-w-full break-words whitespace-pre-wrap rounded border px-2 py-1 text-xs mr-2 mb-2 box-border"
                >
                    <b>{nome}:</b> {valFmt}
                </span>
            );
        }

        return (
            <div className="mt-2 text-xs break-words whitespace-pre-wrap">
                {arrItems.length > 0 && (
                    <div className="mb-1">
                        <b>Arrumação:</b>{" "}
                        {arrItems.map((t, idx) => (
                            <span
                                key={`arr-${idx}`}
                                className="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2 box-border"
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                )}
                {chips}
            </div>
        );
    }

    const text = substituirRotuloVisual(String(obj));
    return text.trim() ? (
        <div className="mt-2 text-sm break-words whitespace-pre-wrap">{text}</div>
    ) : null;
}

function LinhaDoTempoLogs({
    logs,
    usuarioVisivel = true,
}: {
    logs: LogItem[];
    usuarioVisivel?: boolean;
}) {
    if (!logs || logs.length === 0) {
        return (
            <div className="p-4 text-center text-muted-foreground">
                Nenhum log encontrado.
            </div>
        );
    }

    return (
        <div className="space-y-3 max-w-xl mx-auto">
            {logs.map((ent, i) => {
                const acao = ent.acao ? capitalize(ent.acao) : "";
                const statusLabel = ent.status_novo ? traduzirFase(ent.status_novo) : "";
                const detalhes = buildDetalhesNodes(ent.detalhes);

                return (
                    <div
                        key={i}
                        className="log-entry rounded-xl border bg-background/60 p-3 shadow-sm overflow-hidden box-border"
                    >
                        <div className="flex gap-3">
                            <div className="text-xl leading-none flex-shrink-0">
                                {iconForAction(ent.acao, ent.status_novo)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-muted-foreground">
                                    {formatLogDateTime(ent.datahora)}
                                </div>
                                <div className="text-sm">
                                    {acao}
                                    {statusLabel && (
                                        <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                                            {statusLabel}
                                        </span>
                                    )}
                                </div>
                                {usuarioVisivel && (
                                    <div className="text-xs text-muted-foreground">
                                        Usuário: {ent.usuario ?? ""}
                                    </div>
                                )}
                                {detalhes}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
