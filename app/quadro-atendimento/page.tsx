"use client";

import { useEffect, useMemo, useState } from "react";

/* =========================
   Tipos
   ========================= */
type Registro = {
    data?: string;
    falecido?: string;
    local_velorio?: string;
    hora_fim_velorio?: string;
    agente?: string;
    status?: string;
    // o backend envia outros campos também:
    [key: string]: any;
};

type Aviso = { usuario?: string; mensagem?: string };

/* =========================
   Regras de etapas & helpers
   ========================= */
const etapasCampos: (string | string[])[][] = [
    ["falecido", "contato", "religiao", "convenio"],
    ["urna", "roupa", "assistencia", "tanato"],
    [["local_sepultamento", "local"], "local_velorio", "data_inicio_velorio"],
    ["data_fim_velorio", "hora_inicio_velorio", "hora_fim_velorio", "observacao"],
];

function etapasPreenchidas(registro: Registro) {
    return etapasCampos.map((campos) =>
        campos.every((k) => {
            if (Array.isArray(k)) {
                return k.some(
                    (key) =>
                        registro[key] &&
                        String(registro[key]).trim() &&
                        !["selecionar...", "selecione..."].includes(
                            String(registro[key]).toLowerCase()
                        )
                );
            }
            return (
                registro[k] &&
                String(registro[k]).trim() &&
                !["selecionar...", "selecione..."].includes(
                    String(registro[k]).toLowerCase()
                )
            );
        })
    );
}

function capStatus(s?: string) {
    switch (s) {
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
        default:
            return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
    }
}

function badgeClass(s?: string) {
    switch ((s || "").toLowerCase()) {
        case "removendo":
            return "bg-amber-500";
        case "velando":
            return "bg-violet-600";
        case "preparando":
            return "bg-blue-600";
        case "sepultando":
            return "bg-orange-600";
        case "concluido":
            return "bg-green-600";
        default:
            return "bg-neutral-500";
    }
}

const sanitize = (t?: string) =>
    t
        ? t
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
        : "";

/* Fallback elegante para exibição na UI */
const shown = (v?: string, fallback = "a definir") => {
    const s = String(v ?? "").trim();
    return s ? sanitize(s) : fallback;
};

const formatDateBr = (d?: string) =>
    !d
        ? ""
        : d.split("-").length === 3
            ? `${d.split("-")[2]}/${d.split("-")[1]}/${d.split("-")[0]}`
            : d;

const formatTime = (hhmm?: string) =>
    (hhmm || "").length >= 5 ? (hhmm || "").slice(0, 5) : hhmm || "";

const dateOr = (d?: string) => {
    const f = formatDateBr(d);
    return f ? f : "a definir";
};
const timeOr = (t?: string) => {
    const f = formatTime(t);
    return f ? f : "a definir";
};

/* =========================
   Labels & ordem no modal
   ========================= */
const FIELD_LABELS: Record<string, string> = {
    falecido: "Falecido",
    contato: "Contato",
    religiao: "Religião",
    convenio: "Convênio",
    observacao: "Observação",
    urna: "Urna",
    roupa: "Roupa",
    assistencia: "Assistência",
    tanato: "Tanato",
    local: "Local",
    local_velorio: "Local Velório",
    local_sepultamento: "Local Sepultamento",
    data: "Data",
    data_inicio_velorio: "Data Início Velório",
    data_fim_velorio: "Data Fim Velório",
    hora_inicio_velorio: "Hora Início Velório",
    hora_fim_velorio: "Hora Fim Velório",
    agente: "Agente",
    status: "Status",
};

const FIELD_ORDER = [
    "falecido",
    "contato",
    "religiao",
    "convenio",
    "observacao",
    "urna",
    "roupa",
    "assistencia",
    "tanato",
    "local",
    "local_velorio",
    "local_sepultamento",
    "data",
    "data_inicio_velorio",
    "data_fim_velorio",
    "hora_inicio_velorio",
    "hora_fim_velorio",
    "agente",
];

/* monta texto para copiar (com linha em branco entre itens)
   e cabeçalho ATENDIMENTO <CONVÊNIO> */
function buildClipboardText(r: Registro) {
    const v = (k: string) => String(r?.[k] ?? "").trim();

    const atend = (v("convenio") || "A DEFINIR").toUpperCase();
    const lines = [
        `*ATENDIMENTO ${atend}*`,
        `*Falecido:* ${v("falecido") || "A DEFINIR"}`,
        `*Contato:* ${v("contato") || "A DEFINIR"}`,
        `*Religião:* ${v("religiao") || "A DEFINIR"}`,
        `*Urna:* ${v("urna") || "A DEFINIR"}`,
        `*Roupa:* ${v("roupa") || "A DEFINIR"}`,
        `*Assistência:* ${v("assistencia") || "A DEFINIR"}`,
        `*Tanato:* ${v("tanato") || "A DEFINIR"}`,
        `*Local do Velório:* ${v("local_velorio") || "A DEFINIR"}`,
        `*Agente:* ${v("agente") || "A DEFINIR"}`,
        `*Observação:* ${v("observacao") || "A DEFINIR"}`,
    ];

    // linha em branco entre cada informação
    return lines.join("\n\n");
}

/* =========================
   Página
   ========================= */
export default function QuadroAtendimentoPage() {
    const [clockTime, setClockTime] = useState("");
    const [clockDate, setClockDate] = useState("");
    const [registros, setRegistros] = useState<Registro[]>([]);
    const [avisos, setAvisos] = useState<Aviso[]>([]);

    // modal
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<Registro | null>(null);
    const [copied, setCopied] = useState(false);

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
                { cache: "no-store" }
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

    // abrir/fechar modal
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
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeDetail();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const ativos = useMemo(
        () =>
            registros.filter(
                (r) =>
                    String(r.status).toLowerCase() !== "concluido" &&
                    String(r.status).toLowerCase() !== "fase10" &&
                    capStatus(r.status).toLowerCase() !== "sepultamento concluído"
            ),
        [registros]
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
            // fallback
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

    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 space-y-6">
            {/* Header/clock */}
            <div className="rounded-2xl border bg-card/60 p-5 sm:p-6 shadow-sm">
                <h1 className="text-2xl font-bold tracking-tight">
                    Quadro de Atendimentos
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Atualizado em tempo real —{" "}
                    <span className="font-medium">{clockTime}</span> • {clockDate}
                </p>
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
                                                <div className="flex items-center gap-3">
                                                    {["D", "I", "V", "S"].map((label, k) => (
                                                        <div key={k} className="flex items-center gap-1.5">
                                                            <span className="text-[11px] text-muted-foreground">
                                                                {label}
                                                            </span>
                                                            <span
                                                                className={`h-3.5 w-3.5 rounded-full border ${preenchidas[k]
                                                                        ? "bg-green-500 border-green-600"
                                                                        : "bg-transparent"
                                                                    }`}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
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
                        return (
                            <div
                                key={i}
                                className="rounded-xl border bg-card/60 p-4 shadow-sm"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <button
                                        className="text-left text-base font-semibold underline-offset-2 hover:underline"
                                        onClick={() => showDetail(r)}
                                        title="Ver detalhes"
                                    >
                                        {shown(r.falecido)}
                                    </button>
                                    <span
                                        className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${badgeClass(
                                            r.status
                                        )}`}
                                    >
                                        {capStatus(r.status) || "a definir"}
                                    </span>
                                </div>

                                <div className="mt-3 space-y-1.5 text-sm">
                                    <div>
                                        <span className="text-muted-foreground">Data:</span>{" "}
                                        {dateOr(r.data)}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Hora:</span>{" "}
                                        {timeOr(r.hora_fim_velorio)}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Agente:</span>{" "}
                                        {shown(r.agente)}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Local:</span>{" "}
                                        {shown(r.local_velorio)}
                                    </div>
                                    <div className="pt-1">
                                        <span className="text-muted-foreground">Etapas:</span>
                                        <div className="mt-1 flex items-center gap-3">
                                            {["D", "I", "V", "S"].map((label, k) => (
                                                <div key={k} className="flex items-center gap-1.5">
                                                    <span className="text-[11px] text-muted-foreground">
                                                        {label}
                                                    </span>
                                                    <span
                                                        className={`h-3.5 w-3.5 rounded-full border ${preenchidas[k]
                                                                ? "bg-green-500 border-green-600"
                                                                : "bg-transparent"
                                                            }`}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
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
                                <strong>{sanitize(a.usuario)}:</strong>
                                <span>{sanitize(a.mensagem)}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ===== Modal de Detalhes (com botão Copiar) ===== */}
            {open && detail && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6"
                    aria-modal
                    role="dialog"
                >
                    {/* overlay */}
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={closeDetail}
                        aria-hidden
                    />

                    {/* painel */}
                    <div
                        className="
              relative z-10 w-full max-w-4xl
              rounded-xl border bg-card shadow-2xl
              max-h-[80vh] overflow-y-auto overscroll-contain
            "
                    >
                        {/* header compacto e sticky */}
                        <div
                            className="
                sticky top-0 z-[1] flex items-start justify-between gap-3
                border-b bg-card/95 backdrop-blur
                px-3 py-2 sm:px-4 sm:py-3
              "
                        >
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
                                {detail.status && (
                                    <span
                                        className={`hidden sm:inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white ${badgeClass(
                                            detail.status
                                        )}`}
                                        title="Status"
                                    >
                                        {capStatus(detail.status)}
                                    </span>
                                )}
                                <button
                                    onClick={async () => {
                                        await handleCopy();
                                    }}
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

                        {/* conteúdo */}
                        <div className="px-3 py-3 sm:px-4 sm:py-4">
                            {/* status (aparece no mobile aqui) */}
                            {detail.status && (
                                <div className="mb-3 sm:hidden">
                                    <span
                                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white ${badgeClass(
                                            detail.status
                                        )}`}
                                    >
                                        {capStatus(detail.status)}
                                    </span>
                                </div>
                            )}

                            {/* chips em 2 colunas no mobile / 3 no desktop */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {FIELD_ORDER.filter((k) => detail[k])
                                    .concat(
                                        Object.keys(detail).filter(
                                            (k) =>
                                                !FIELD_ORDER.includes(k) &&
                                                !["status", "falecido"].includes(k) &&
                                                typeof detail[k] !== "object" &&
                                                String(detail[k] ?? "").trim() !== ""
                                        )
                                    )
                                    .map((key) => {
                                        const label = FIELD_LABELS[key] || key.replace(/_/g, " ");
                                        let value = String(detail[key] ?? "");
                                        if (key.startsWith("data")) value = dateOr(value);
                                        else if (key.startsWith("hora")) value = timeOr(value);
                                        else value = shown(value);
                                        return (
                                            <div
                                                key={key}
                                                className="
                          rounded-lg border bg-background
                          px-3 py-2 text-[13px] sm:text-[15px]
                        "
                                            >
                                                <b>{label}:</b>{" "}
                                                <span className="text-foreground">{value}</span>
                                            </div>
                                        );
                                    })}
                            </div>

                            {/* etapas */}
                            <div className="mt-4 rounded-xl border bg-background p-3">
                                <div className="text-[12px] sm:text-sm text-muted-foreground mb-2">
                                    Etapas preenchidas
                                </div>
                                <EtapasRow registro={detail} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* Linha de etapas usada no modal */
function EtapasRow({ registro }: { registro: Registro }) {
    const preenchidas = etapasPreenchidas(registro);
    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {["D", "I", "V", "S"].map((label, k) => (
                <div key={k} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span
                        className={`h-4 w-4 rounded-full border ${preenchidas[k]
                                ? "bg-green-500 border-green-600"
                                : "bg-transparent"
                            }`}
                    />
                </div>
            ))}
        </div>
    );
}
