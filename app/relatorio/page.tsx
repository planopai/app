"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    IconFilter,
    IconDownload,
    IconCalendar,
    IconUser,
    IconChevronLeft,
    IconChevronRight,
    IconListDetails,
    IconLoader2,
} from "@tabler/icons-react";

/* ================================ Tipos ================================ */
interface FalecidoItem {
    sepultamento_id: string;
    falecido: string;
    ultima_datahora?: string;
    [key: string]: any;
}
interface LogItem {
    datahora?: string;
    acao?: string;
    usuario?: string;
    status_novo?: string;
    detalhes?: string | Record<string, any>;
    [key: string]: any;
}

/* ========================= Mapeamentos & utils ======================== */
const FASES_NOMES: Record<string, string> = {
    fase01: "Indo Retirar o Óbito",
    fase02: "Corpo na Clínica",
    fase03: "Ínicio de Conservação",
    fase04: "Fim da Conservação",
    fase05: "Ínicio da Ornamentação",
    fase06: "Fim da Ornamentação",
    fase07: "Transportando Óbito P/Velório",
    fase08: "Entrega de Corpo",
    fase09: "Transportando P/ Sepultamento",
    fase10: "Sepultamento Concluído",
    fase11: "Material Recolhido",
};
const traduzirFase = (fase?: string) => (fase ? FASES_NOMES[fase] || fase : "");

function iconeAcao(acao?: string, statusNovo?: string) {
    const a = (acao || "").toLowerCase();
    if (a.includes("criou")) return "🟢";
    if (a.includes("editou")) return "✏️";
    if (a.includes("atualizou")) {
        if (statusNovo === "concluido") return "✅";
        if (statusNovo === "velando") return "🕯️";
        if (statusNovo === "sepultando") return "⚰️";
        if (statusNovo === "preparando") return "🔧";
        if (statusNovo === "removendo") return "🚑";
        if (statusNovo === "Material Recolhido" || statusNovo === "fase11") return "📦";
        if (statusNovo && statusNovo.startsWith("fase")) return "🔄";
        return "🔄";
    }
    return "📝";
}
function formataDataHora(str?: string) {
    if (!str) return "";
    const dt = new Date(str.replace(" ", "T"));
    if (Number.isNaN(dt.getTime())) return str;
    return dt.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}
function sanitize(txt?: string) {
    if (!txt) return "";
    return String(txt)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function capitalize(s?: string) {
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function titleCaseFromSnake(s: string) {
    return s
        .split("_")
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
        .join(" ");
}

/* Materiais helpers */
const MATERIAL_QTD_REGEX = /^materiais_(.+?)_qtd$/i;
function materialKeyToName(key: string) {
    const m = key.match(MATERIAL_QTD_REGEX);
    if (!m) return null;
    return titleCaseFromSnake(m[1]);
}

/* Arrumação helpers */
function parseArrumacao(val: any): string[] {
    try {
        const obj = typeof val === "string" ? JSON.parse(val) : val;
        if (!obj || typeof obj !== "object") return [];
        const checked: string[] = [];
        for (const [k, v] of Object.entries(obj)) {
            if (v) checked.push(`✅ ${titleCaseFromSnake(k)}`);
        }
        return checked;
    } catch {
        return [];
    }
}

/* ========================== Endpoints (proxy) ========================= */
const LISTAR_FALECIDOS = "/api/php/historico_sepultamentos.php?listar_falecidos=1";
const LOG_POR_ID = (id: string) => `/api/php/historico_sepultamentos.php?log=1&id=${encodeURIComponent(id)}`;

/* =============================== Página =============================== */
export default function HistoricoSepultamentosPage() {
    // Tema
    useEffect(() => {
        const KEY = "pai-theme";
        const saved = localStorage.getItem(KEY);
        if (saved) document.documentElement.setAttribute("data-theme", saved);
        const onStorage = (e: StorageEvent) => {
            if (e.key === KEY && e.newValue) document.documentElement.setAttribute("data-theme", e.newValue);
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    // Estado
    const [lista, setLista] = useState<FalecidoItem[]>([]);
    const [loadingLista, setLoadingLista] = useState(false);
    const [filtroNome, setFiltroNome] = useState("");
    const [filtroDe, setFiltroDe] = useState("");
    const [filtroAte, setFiltroAte] = useState("");

    const [pagina, setPagina] = useState(1);
    const porPagina = 10;

    const [selecionado, setSelecionado] = useState<FalecidoItem | null>(null);
    const [log, setLog] = useState<LogItem[]>([]);
    const [loadingLog, setLoadingLog] = useState(false);

    const [gerandoPdf, setGerandoPdf] = useState(false);

    // Carrega jsPDF (UMD)
    useEffect(() => {
        const KEY = "__jspdf_loaded__";
        if ((window as any)[KEY]) return;
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => ((window as any)[KEY] = true);
        document.body.appendChild(script);
    }, []);

    // Carregar lista de falecidos
    const carregarFalecidos = useCallback(async () => {
        try {
            setLoadingLista(true);
            const res = await fetch(`${LISTAR_FALECIDOS}&_nocache=${Date.now()}`, { cache: "no-store" });
            const json = await res.json();
            let arr: FalecidoItem[] = [];
            if (json && json.sucesso && json.dados) arr = json.dados;
            else if (Array.isArray(json)) arr = json;
            setLista(arr);
            setPagina(1);
        } catch {
            setLista([]);
        } finally {
            setLoadingLista(false);
        }
    }, []);

    useEffect(() => {
        carregarFalecidos();
        const t = setInterval(carregarFalecidos, 20000);
        return () => clearInterval(t);
    }, [carregarFalecidos]);

    // Filtro + paginação
    const filtrados = useMemo(() => {
        const nome = filtroNome.trim().toLowerCase();
        return (lista || []).filter((reg) => {
            let ok = true;
            if (nome && reg.falecido && !reg.falecido.toLowerCase().includes(nome)) ok = false;
            const dataReg = reg.ultima_datahora ? reg.ultima_datahora.substring(0, 10) : "";
            if (filtroDe && dataReg && dataReg < filtroDe) ok = false;
            if (filtroAte && dataReg && dataReg > filtroAte) ok = false;
            return ok;
        });
    }, [lista, filtroNome, filtroDe, filtroAte]);

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
    const paginaDados = useMemo(() => {
        const ini = (pagina - 1) * porPagina;
        return filtrados.slice(ini, ini + porPagina);
    }, [filtrados, pagina]);

    // Seleção + carregamento do log
    const selecionarRegistro = useCallback(async (item: FalecidoItem) => {
        setSelecionado(item);
        setLog([]);
        setLoadingLog(true);
        try {
            const res = await fetch(`${LOG_POR_ID(item.sepultamento_id)}&_nocache=${Date.now()}`, {
                cache: "no-store",
            });
            const json = await res.json();
            let arr: LogItem[] = [];
            if (json && json.sucesso && json.dados) arr = json.dados;
            else if (Array.isArray(json)) arr = json;
            setLog(arr || []);
        } catch {
            setLog([]);
        } finally {
            setLoadingLog(false);
        }
    }, []);

    // ===== Nunito no jsPDF (com fallback) =====
    const nunitoStateRef = useRef<"none" | "ok" | "fail">("none");
    async function ensureNunito(doc: any): Promise<boolean> {
        if (nunitoStateRef.current === "ok") return true;
        if (nunitoStateRef.current === "fail") return false;
        try {
            const regularUrl = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nunito/Nunito-Regular.ttf";
            const boldUrl = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nunito/Nunito-Bold.ttf";

            async function fetchTTF(u: string) {
                const r = await fetch(u);
                if (!r.ok) throw new Error("Fonte não encontrada");
                const b = await r.arrayBuffer();
                let binary = "";
                const bytes = new Uint8Array(b);
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                return btoa(binary);
            }

            const [regB64, boldB64] = await Promise.all([fetchTTF(regularUrl), fetchTTF(boldUrl)]);
            doc.addFileToVFS("Nunito-Regular.ttf", regB64);
            doc.addFont("Nunito-Regular.ttf", "Nunito", "normal");
            doc.addFileToVFS("Nunito-Bold.ttf", boldB64);
            doc.addFont("Nunito-Bold.ttf", "Nunito", "bold");

            nunitoStateRef.current = "ok";
            return true;
        } catch {
            nunitoStateRef.current = "fail";
            return false;
        }
    }

    // Exportar PDF (jsPDF puro)
    const exportarPdf = useCallback(async () => {
        if (!selecionado || log.length === 0) return;

        setGerandoPdf(true);
        try {
            const w: any = window as any;
            const jspdf = w.jspdf;
            if (!jspdf || !jspdf.jsPDF) {
                alert("Ferramenta de PDF ainda carregando. Tente novamente em alguns segundos.");
                setGerandoPdf(false);
                return;
            }
            const { jsPDF } = jspdf;
            const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
            const hasNunito = await ensureNunito(doc);

            // dimensões
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const marginL = 14;
            const marginR = 14;
            const contentW = pageW - marginL - marginR;

            // fontes
            const titleFont: [string, string] = hasNunito ? ["Nunito", "bold"] : ["helvetica", "bold"];
            const normalFont: [string, string] = hasNunito ? ["Nunito", "normal"] : ["helvetica", "normal"];

            let y = 22;

            // Título
            doc.setFont(titleFont[0], titleFont[1]);
            doc.setFontSize(18);
            doc.text("Histórico dos Sepultamentos", pageW / 2, y, { align: "center" });
            y += 8;

            // Nome do falecido
            doc.setFont(titleFont[0], titleFont[1]);
            doc.setFontSize(13);
            doc.text((selecionado.falecido || "").toString(), pageW / 2, y, { align: "center" });
            y += 12;

            // Card layout
            const cardPadX = 6;
            const cardPadY = 6;
            const lineGap = 3; // espaço entre linhas

            const writeLine = (
                text: string | string[],
                x: number,
                yy: number,
                size = 11,
                bold = false
            ) => {
                doc.setFont(bold ? titleFont[0] : normalFont[0], bold ? titleFont[1] : normalFont[1]);
                doc.setFontSize(size);
                if (Array.isArray(text)) doc.text(text, x, yy);
                else doc.text(text, x, yy);
            };

            for (const ent of log) {
                // 1) Data/hora
                const dataLine = formataDataHora(ent.datahora) || "";

                // 2) Ação + status
                const acao = capitalize(ent.acao || "");
                const statusTxt = ent.status_novo ? traduzirFase(ent.status_novo) : "";
                const acaoFull = statusTxt ? `${acao} — ${statusTxt}` : acao;

                // 3) Usuário
                const usuarioLine = ent.usuario ? `Usuário: ${ent.usuario}` : "";

                // 4) Detalhes (sem objetos crus; materiais formatados; arrumação com ✅)
                const detalhesLines: string[] = [];
                const raw = ent.detalhes as any;

                const materiaisLines: string[] = [];
                const arrumacaoChecked: string[] = [];

                try {
                    const obj = raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);

                    if (obj && typeof obj === "object") {
                        for (const key of Object.keys(obj)) {
                            if (["materiais_json", "id", "acao"].includes(key)) continue;

                            if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
                                if (/^arrumacao(_json)?$/i.test(key)) {
                                    arrumacaoChecked.push(...parseArrumacao(obj[key]));
                                }
                                continue;
                            }

                            const matName = materialKeyToName(key);
                            if (matName) {
                                const qtd = obj[key];
                                if (qtd != null && String(qtd).trim() !== "") {
                                    materiaisLines.push(`${matName}: ${String(qtd)}`);
                                }
                                continue;
                            }

                            if (/^arrumacao(_json)?$/i.test(key)) {
                                arrumacaoChecked.push(...parseArrumacao(obj[key]));
                                continue;
                            }

                            let v = obj[key];
                            if (v == null || String(v).trim() === "") continue;
                            let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                            v = String(v);
                            if (v.startsWith("fase") && FASES_NOMES[v]) v = FASES_NOMES[v];
                            detalhesLines.push(`${nome}: ${v}`);
                        }
                    }
                } catch {
                    let detalhesRaw = String(raw || "");
                    if (/arrumacao\s*json/i.test(detalhesRaw) || /materiais\s*:\s*\[/i.test(detalhesRaw)) {
                        detalhesRaw = "";
                    }
                    Object.keys(FASES_NOMES).forEach((cod) => {
                        const faseNome = FASES_NOMES[cod];
                        const regEx = new RegExp(cod, "g");
                        detalhesRaw = detalhesRaw.replace(regEx, faseNome);
                    });
                    if (detalhesRaw.trim()) detalhesLines.push(detalhesRaw.trim());
                }

                if (materiaisLines.length) {
                    detalhesLines.unshift("Materiais:");
                    for (const l of materiaisLines) detalhesLines.push(`• ${l}`);
                }
                if (arrumacaoChecked.length) {
                    detalhesLines.push("Arrumação:");
                    for (const item of arrumacaoChecked) detalhesLines.push(`• ${item}`);
                }

                // Quebra em largura disponível
                doc.setFont(normalFont[0], normalFont[1]);
                doc.setFontSize(9);
                const dataWrapped = doc.splitTextToSize(dataLine, contentW - cardPadX * 2);

                doc.setFont(titleFont[0], titleFont[1]);
                doc.setFontSize(12);
                const acaoWrapped = doc.splitTextToSize(acaoFull, contentW - cardPadX * 2);

                doc.setFont(normalFont[0], normalFont[1]);
                doc.setFontSize(10);
                const usuarioWrapped = doc.splitTextToSize(usuarioLine, contentW - cardPadX * 2);

                doc.setFont(normalFont[0], normalFont[1]);
                doc.setFontSize(11);
                const detalhesWrapped = detalhesLines.flatMap((l) => doc.splitTextToSize(l, contentW - cardPadX * 2));

                const hData = dataWrapped.length ? 4 + (dataWrapped.length - 1) * 4 : 0;
                const hAcao = acaoWrapped.length * 5;
                const hUsuario = usuarioWrapped.length ? usuarioWrapped.length * 5 : 0;
                const hDetalhes = detalhesWrapped.length ? detalhesWrapped.length * 5 : 0;

                const innerHeight = (hData ? hData + lineGap : 0) + hAcao + (hUsuario ? lineGap + hUsuario : 0) + (hDetalhes ? lineGap + hDetalhes : 0);
                const cardH = innerHeight + cardPadY * 2;

                if (y + cardH + 8 > pageH) {
                    doc.addPage();
                    y = 22;
                }

                doc.setDrawColor(210);
                doc.setLineWidth(0.25);
                doc.roundedRect(marginL, y, contentW, cardH, 3, 3);

                let yy = y + cardPadY;

                if (dataWrapped.length) {
                    writeLine(dataWrapped, marginL + cardPadX, yy, 9, false);
                    yy += hData + lineGap;
                }

                writeLine(acaoWrapped, marginL + cardPadX, yy, 12, true);
                yy += hAcao;

                if (usuarioWrapped.length) {
                    yy += lineGap;
                    writeLine(usuarioWrapped, marginL + cardPadX, yy, 10, false);
                    yy += hUsuario;
                }

                if (detalhesWrapped.length) {
                    yy += lineGap;
                    writeLine(detalhesWrapped, marginL + cardPadX, yy, 11, false);
                    yy += hDetalhes;
                }

                y += cardH + 8;
            }

            const filename = `historico_sepultamento_${(sanitize(selecionado.falecido) || "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pdf`;
            doc.save(filename);
        } catch (err) {
            console.error("Falha ao gerar PDF:", err);
            alert("Não consegui gerar o PDF agora. Veja o console para detalhes.");
        } finally {
            setGerandoPdf(false);
        }
    }, [selecionado, log]);

    /* ================================ UI ================================ */
    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Histórico dos Sepultamentos</h1>
                <p className="mt-1 text-sm text-muted-foreground">Busque pelo nome, filtre por data e visualize o histórico completo. Baixe em PDF quando quiser.</p>
            </header>

            {/* Filtros */}
            <div className="rounded-2xl border bg-card/60 p-4 sm:p-5 shadow-sm backdrop-blur">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <IconFilter className="size-4 text-muted-foreground" />
                    Filtros
                </div>
                <form
                    className="grid gap-3 sm:grid-cols-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                    }}
                >
                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Nome do falecido</span>
                        <div className="relative">
                            <IconUser className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                            <input
                                type="text"
                                value={filtroNome}
                                onChange={(e) => {
                                    setFiltroNome(e.target.value);
                                    setPagina(1);
                                }}
                                placeholder="Buscar por nome..."
                                className="input pl-10"
                            />
                        </div>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Data inicial</span>
                        <div className="relative">
                            <IconCalendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                            <input
                                type="date"
                                value={filtroDe}
                                onChange={(e) => {
                                    setFiltroDe(e.target.value);
                                    setPagina(1);
                                }}
                                className="input pl-10"
                            />
                        </div>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">Data final</span>
                        <div className="relative">
                            <IconCalendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-60" />
                            <input
                                type="date"
                                value={filtroAte}
                                onChange={(e) => {
                                    setFiltroAte(e.target.value);
                                    setPagina(1);
                                }}
                                className="input pl-10"
                            />
                        </div>
                    </label>
                </form>
            </div>

            {/* Lista + Log */}
            <div className="mt-5 grid gap-4 md:grid-cols-[1fr,2fr]">
                {/* Lista */}
                <div className="rounded-2xl border bg-card/60 shadow-sm backdrop-blur">
                    <div className="border-b p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <IconListDetails className="size-4 text-muted-foreground" />
                            Selecione um registro
                        </div>
                    </div>

                    <div className="p-2">
                        {loadingLista ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
                        ) : filtrados.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</div>
                        ) : (
                            <ul className="flex flex-col">
                                {paginaDados.map((item) => (
                                    <li key={item.sepultamento_id}>
                                        <button
                                            type="button"
                                            onClick={() => selecionarRegistro(item)}
                                            className={`group flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition hover:bg-muted/40 ${selecionado?.sepultamento_id === item.sepultamento_id ? "border-primary/60 bg-primary/5" : ""
                                                }`}
                                        >
                                            <span className="font-medium">{item.falecido}</span>
                                            <span className="text-xs text-muted-foreground">{formataDataHora(item.ultima_datahora)}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {filtrados.length > 0 && (
                            <div className="mt-3 flex items-center justify-between gap-2 px-1">
                                <button
                                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
                                    disabled={pagina <= 1}
                                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                                >
                                    <IconChevronLeft className="size-4" />
                                    Anterior
                                </button>
                                <div className="text-xs text-muted-foreground">
                                    Página <b>{pagina}</b> de <b>{totalPaginas}</b>
                                </div>
                                <button
                                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
                                    disabled={pagina >= totalPaginas}
                                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                                >
                                    Próximo
                                    <IconChevronRight className="size-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Log */}
                <div className="rounded-2xl border bg-card/60 shadow-sm backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                        <div>
                            <div className="text-sm font-semibold">Histórico</div>
                            <div className="text-xs text-muted-foreground">{selecionado ? sanitize(selecionado.falecido) : "Selecione um registro para visualizar"}</div>
                        </div>

                        <button
                            type="button"
                            onClick={exportarPdf}
                            disabled={!selecionado || log.length === 0 || gerandoPdf}
                            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold border-primary text-primary hover:bg-primary/5 disabled:opacity-50"
                            title="Baixar PDF"
                        >
                            {gerandoPdf ? <IconLoader2 className="size-5 animate-spin" /> : <IconDownload className="size-5" />}
                            {gerandoPdf ? "Gerando…" : "Baixar PDF"}
                        </button>
                    </div>

                    <div className="p-4" id="logAreaExport">
                        {!selecionado ? (
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Selecione um registro para visualizar o histórico completo.</div>
                        ) : loadingLog ? (
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Carregando histórico...</div>
                        ) : log.length === 0 ? (
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhum log encontrado para este registro.</div>
                        ) : (
                            <div className="space-y-3">
                                {log.map((ent, i) => {
                                    let detalhesHtml = "";
                                    const raw = ent.detalhes as any;

                                    try {
                                        const obj = raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);

                                        if (obj && typeof obj === "object") {
                                            const chips: string[] = [];

                                            for (const key of Object.keys(obj)) {
                                                if (["materiais_json", "id", "acao"].includes(key)) continue;

                                                if (/^arrumacao(_json)?$/i.test(key)) {
                                                    const items = parseArrumacao(obj[key]);
                                                    if (items.length) {
                                                        chips.push(`<div class=\"mt-2\"><b>Arrumação:</b> ${items.map((t) => `<span class=\"inline-block rounded border px-2 py-1 text-xs mr-2 mb-2\">${sanitize(t)}</span>`).join("")}</div>`);
                                                    }
                                                    continue;
                                                }

                                                const matName = materialKeyToName(key);
                                                if (matName) {
                                                    const val = obj[key];
                                                    if (val != null && String(val).trim() !== "") {
                                                        chips.push(`<span class=\"inline-block rounded border px-2 py-1 text-xs mr-2 mb-2\"><b>${sanitize(matName)}:</b> ${sanitize(String(val))}</span>`);
                                                    }
                                                    continue;
                                                }

                                                if (typeof obj[key] === "object" && !Array.isArray(obj[key])) continue;

                                                let val = obj[key];
                                                if (val == null || String(val).trim() === "") continue;
                                                let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                                                val = String(val);
                                                if (val.startsWith("fase") && FASES_NOMES[val]) val = FASES_NOMES[val];
                                                chips.push(`<span class=\"inline-block rounded border px-2 py-1 text-xs mr-2 mb-2\"><b>${sanitize(nome)}:</b> ${sanitize(val)}</span>`);
                                            }

                                            if (chips.length) detalhesHtml = `<div class=\"mt-2\">${chips.join("")}</div>`;
                                        }
                                    } catch {
                                        let detalhesRaw = String(raw || "");
                                        if (/Arrumacao\s*Json\s*:/i.test(detalhesRaw) || /Materiais\s*:\s*\[object\s+Object\]/i.test(detalhesRaw)) {
                                            detalhesRaw = detalhesRaw.replace(/Arrumacao\s*Json\s*:[^\n]*/gi, "");
                                            detalhesRaw = detalhesRaw.replace(/Materiais\s*:\s*\[object\s+Object\]/gi, "");
                                        }
                                        Object.keys(FASES_NOMES).forEach((cod) => {
                                            const faseNome = FASES_NOMES[cod];
                                            const regEx = new RegExp(cod, "g");
                                            detalhesRaw = detalhesRaw.replace(regEx, faseNome);
                                        });
                                        if (detalhesRaw.trim()) {
                                            detalhesHtml = `<div class=\"mt-2 text-sm\">${sanitize(detalhesRaw)}</div>`;
                                        }
                                    }

                                    return (
                                        <div
                                            key={i}
                                            className="log-entry rounded-xl border bg-background/60 p-3 shadow-sm"
                                            // eslint-disable-next-line react/no-danger
                                            dangerouslySetInnerHTML={{
                                                __html: `
                          <div class=\"flex gap-3\">
                            <div class=\"text-xl leading-none\">${iconeAcao(ent.acao, ent.status_novo)}</div>
                            <div class=\"flex-1\">
                              <div class=\"text-xs text-muted-foreground\">${formataDataHora(ent.datahora)}</div>
                              <div class=\"text-sm\">
                                ${ent.acao ? sanitize(capitalize(ent.acao)) : ""}
                                ${ent.status_novo
                                                        ? `<span class=\"ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary\">${sanitize(
                                                            traduzirFase(ent.status_novo)
                                                        )}</span>`
                                                        : ""
                                                    }
                              </div>
                              <div class=\"text-xs text-muted-foreground\">Usuário: ${sanitize(ent.usuario || "")}</div>
                              ${detalhesHtml}
                            </div>
                          </div>
                        `,
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
