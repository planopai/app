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
    IconChartBar,
    IconX,
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

/** Registros brutos para a Análise Geral (vem do informativo.php?listar=1) */
interface RegistroAnalise {
    id?: number | string;
    data?: string; // data de criação
    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    assistencia?: string; // "Sim" | "Não" | ""
    tanato?: string;      // "Sim" | "Não" | ""
    materiais_json?: string;
    arrumacao_json?: string;
    // Colunas *_qtd podem vir como string ou number
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

/* Materiais para a análise */
const MATERIAL_KEYS = [
    "cadeiras",
    "bebedouros",
    "suporte_coroa",
    "kit_lanche",
    "velas",
    "tenda",
    "placa",
    "paramentacao",
] as const;
const MATERIAL_LABELS: Record<typeof MATERIAL_KEYS[number], string> = {
    cadeiras: "Cadeiras",
    bebedouros: "Bebedouros",
    suporte_coroa: "Suporte Coroa",
    kit_lanche: "Kit Lanche",
    velas: "Velas",
    tenda: "Tenda",
    placa: "Placa",
    paramentacao: "Paramentação",
};

/* Arrumação para a análise */
const ARR_KEYS = ["luvas", "palha", "tamponamento", "maquiagem", "algodao", "cordao", "barba"] as const;
const ARR_LABELS: Record<typeof ARR_KEYS[number], string> = {
    luvas: "Luvas",
    palha: "Palha",
    tamponamento: "Tamponamento",
    maquiagem: "Maquiagem",
    algodao: "Algodão",
    cordao: "Cordão",
    barba: "Barba",
};

/* Helpers para materiais e arrumação (análise) */
function parseMateriaisRegistro(r: RegistroAnalise): Record<string, number> {
    const base: Record<string, number> = {};
    MATERIAL_KEYS.forEach((k) => (base[k] = 0));

    // via JSON
    if (r.materiais_json) {
        try {
            const obj = JSON.parse(String(r.materiais_json));
            if (obj && typeof obj === "object") {
                MATERIAL_KEYS.forEach((k) => {
                    const it = obj[k];
                    if (it && typeof it === "object") {
                        const qtd = Number((it as any).qtd ?? 0);
                        const checked = !!(it as any).checked;
                        if (checked && qtd > 0) base[k] += qtd;
                    }
                });
            }
        } catch {
            // ignora
        }
    }
    // via colunas *_qtd
    MATERIAL_KEYS.forEach((k) => {
        const col = (r as any)[`materiais_${k}_qtd`];
        const qtd = Number(col ?? 0);
        if (!Number.isNaN(qtd) && qtd > 0) base[k] += qtd;
    });

    return base;
}

function parseArrumacaoRegistro(r: RegistroAnalise): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    ARR_KEYS.forEach((k) => (out[k] = false));
    if (r.arrumacao_json) {
        try {
            const obj = JSON.parse(String(r.arrumacao_json));
            if (obj && typeof obj === "object") {
                ARR_KEYS.forEach((k) => {
                    out[k] = !!(obj as any)[k];
                });
            }
        } catch {
            // ignora
        }
    }
    return out;
}

/* ========================== Endpoints (proxy) ========================= */
const LISTAR_FALECIDOS = "/api/php/historico_sepultamentos.php?listar_falecidos=1";
const LOG_POR_ID = (id: string) => `/api/php/historico_sepultamentos.php?log=1&id=${encodeURIComponent(id)}`;

/** Fonte para a Análise Geral (registros com materiais/arrumação) */
const LISTAR_ANALITICO = "/api/php/informativo.php?listar=1";

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

    // Estado (lista e log)
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

    // ===== Carrega jsPDF via CDN (mantido) =====
    useEffect(() => {
        const KEY = "__jspdf_loaded__";
        if ((window as any)[KEY]) return;
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => ((window as any)[KEY] = true);
        document.body.appendChild(script);
    }, []);

    // ===== Carrega Chart.js via CDN sob demanda (para análise) =====
    const [chartReady, setChartReady] = useState(false);
    const ensureChartJs = useCallback(() => {
        if ((window as any).__chartjs_loaded__) {
            setChartReady(true);
            return;
        }
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/chart.js";
        s.async = true;
        s.onload = () => {
            (window as any).__chartjs_loaded__ = true;
            setChartReady(true);
        };
        document.body.appendChild(s);
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

    // Exportar PDF (jsPDF puro) — MANTIDO
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
            const lineGap = 3;

            const writeLine = (text: string | string[], x: number, yy: number, size = 11, bold = false) => {
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

                // 4) Detalhes
                const detalhesLines: string[] = [];
                const raw = ent.detalhes as any;

                const materiaisLines: string[] = [];
                const arrSet = new Set<string>();

                try {
                    const obj = raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);
                    if (obj && typeof obj === "object") {
                        for (const key of Object.keys(obj)) {
                            if (["materiais_json", "id", "acao"].includes(key)) continue;

                            if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
                                if (/^arrumacao(_json)?$/i.test(key)) {
                                    const o = obj[key] || {};
                                    for (const [k, v] of Object.entries(o)) if (v) arrSet.add(`✅ ${titleCaseFromSnake(k)}`);
                                }
                                continue;
                            }

                            // materiais_*_qtd
                            const m = key.match(/^materiais_(.+?)_qtd$/i);
                            if (m) {
                                const nome = titleCaseFromSnake(m[1]);
                                const qtd = obj[key];
                                if (qtd != null && String(qtd).trim() !== "") materiaisLines.push(`${nome}: ${String(qtd)}`);
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
                    if (/arrumacao\s*json/i.test(detalhesRaw) || /materiais\s*:\s*\[/i.test(detalhesRaw)) detalhesRaw = "";
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
                if (arrSet.size) {
                    detalhesLines.push("Arrumação:");
                    for (const item of Array.from(arrSet)) detalhesLines.push(`• ${item}`);
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

            const filename = `historico_sepultamento_${(sanitize(selecionado.falecido) || "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")}.pdf`;
            doc.save(filename);
        } catch (err) {
            console.error("Falha ao gerar PDF:", err);
            alert("Não consegui gerar o PDF agora. Veja o console para detalhes.");
        } finally {
            setGerandoPdf(false);
        }
    }, [selecionado, log]);

    /* =========================== ANÁLISE GERAL =========================== */
    const [analiseOpen, setAnaliseOpen] = useState(false);
    const [loadingAnalise, setLoadingAnalise] = useState(false);
    const [dadosAnalise, setDadosAnalise] = useState<RegistroAnalise[]>([]);

    // filtros da análise
    const [aDe, setADe] = useState("");
    const [aAte, setAAte] = useState("");
    const [aMaterial, setAMaterial] = useState<"" | typeof MATERIAL_KEYS[number]>("");
    const [aArrumacao, setAArrumacao] = useState<"" | typeof ARR_KEYS[number]>("");
    const [aAssistencia, setAAssistencia] = useState<"" | "Sim" | "Não">("");
    const [aTanato, setATanato] = useState<"" | "Sim" | "Não">("");

    const abrirAnalise = useCallback(async () => {
        setAnaliseOpen(true);
        ensureChartJs();
        if (dadosAnalise.length > 0) return;

        setLoadingAnalise(true);
        try {
            const res = await fetch(`${LISTAR_ANALITICO}&_nocache=${Date.now()}`, { cache: "no-store" });
            const json = await res.json();
            const arr: RegistroAnalise[] = Array.isArray(json) ? json : [];
            setDadosAnalise(arr);
        } catch {
            setDadosAnalise([]);
        } finally {
            setLoadingAnalise(false);
        }
    }, [dadosAnalise.length, ensureChartJs]);

    // função para escolher a data do registro para análises
    function getRegDate(r: RegistroAnalise): string {
        const cands = [r.data_inicio_velorio, r.data, r.data_fim_velorio].filter(Boolean) as string[];
        const d = (cands[0] || "").slice(0, 10);
        return d;
    }

    // Filtrados para a análise
    const dadosFiltradosAnalise = useMemo(() => {
        const de = aDe || "";
        const ate = aAte || "";
        return (dadosAnalise || []).filter((r) => {
            const date = getRegDate(r);
            if (de && date && date < de) return false;
            if (ate && date && date > ate) return false;

            if (aAssistencia && (r.assistencia || "").toLowerCase() !== aAssistencia.toLowerCase()) return false;
            if (aTanato && (r.tanato || "").toLowerCase() !== aTanato.toLowerCase()) return false;

            if (aArrumacao) {
                const arr = parseArrumacaoRegistro(r);
                if (!arr[aArrumacao]) return false;
            }
            if (aMaterial) {
                const mats = parseMateriaisRegistro(r);
                if (!mats[aMaterial] || mats[aMaterial] <= 0) return false;
            }
            return true;
        });
    }, [dadosAnalise, aDe, aAte, aAssistencia, aTanato, aArrumacao, aMaterial]);

    // Agregações
    const agregados = useMemo(() => {
        // materiais
        const matsTotal: Record<string, number> = {};
        MATERIAL_KEYS.forEach((k) => (matsTotal[k] = 0));

        // assistência
        let assistSim = 0;
        let assistNao = 0;

        // atendimentos por dia
        const porDia: Record<string, number> = {};

        // arrumação (quantos registros possuem cada marcação)
        const arrCount: Record<string, number> = {};
        ARR_KEYS.forEach((k) => (arrCount[k] = 0));

        for (const r of dadosFiltradosAnalise) {
            // materiais
            const mats = parseMateriaisRegistro(r);
            for (const k of MATERIAL_KEYS) matsTotal[k] += mats[k] || 0;

            // assistência
            const a = (r.assistencia || "").toLowerCase();
            if (a === "sim") assistSim++;
            else if (a === "não" || a === "nao" || a === "não ") assistNao++;
            else if (a === "nao") assistNao++;

            // por dia
            const d = getRegDate(r);
            if (d) porDia[d] = (porDia[d] || 0) + 1;

            // arrumação
            const ar = parseArrumacaoRegistro(r);
            for (const k of ARR_KEYS) if (ar[k]) arrCount[k] = (arrCount[k] || 0) + 1;
        }

        // ordena dias
        const dias = Object.keys(porDia).sort();
        const diasVals = dias.map((d) => porDia[d]);

        // materiais não zero
        const matsLabels = MATERIAL_KEYS.map((k) => MATERIAL_LABELS[k]);
        const matsVals = MATERIAL_KEYS.map((k) => matsTotal[k]);

        return {
            totalReg: dadosFiltradosAnalise.length,
            matsLabels,
            matsVals,
            assistSim,
            assistNao,
            diasLabels: dias,
            diasVals,
            arrCount,
        };
    }, [dadosFiltradosAnalise]);

    // ===== Gráficos (Chart.js pelo window) =====
    const barRef = useRef<HTMLCanvasElement | null>(null);
    const pieRef = useRef<HTMLCanvasElement | null>(null);
    const lineRef = useRef<HTMLCanvasElement | null>(null);

    const barChartRef = useRef<any>(null);
    const pieChartRef = useRef<any>(null);
    const lineChartRef = useRef<any>(null);

    useEffect(() => {
        if (!analiseOpen || !chartReady) return;
        const Chart: any = (window as any).Chart;
        if (!Chart) return;

        // destroy anteriores
        try {
            barChartRef.current?.destroy();
            pieChartRef.current?.destroy();
            lineChartRef.current?.destroy();
        } catch { }

        // Bar – Materiais mais consumidos
        if (barRef.current) {
            barChartRef.current = new Chart(barRef.current, {
                type: "bar",
                data: {
                    labels: agregados.matsLabels,
                    datasets: [
                        {
                            label: "Qtd total",
                            data: agregados.matsVals,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 } },
                    },
                    plugins: { legend: { display: false } },
                },
            });
        }

        // Doughnut – Assistência
        if (pieRef.current) {
            pieChartRef.current = new Chart(pieRef.current, {
                type: "doughnut",
                data: {
                    labels: ["Com assistência", "Sem assistência"],
                    datasets: [
                        {
                            data: [agregados.assistSim, agregados.assistNao],
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                },
            });
        }

        // Line – Atendimentos por dia
        if (lineRef.current) {
            lineChartRef.current = new Chart(lineRef.current, {
                type: "line",
                data: {
                    labels: agregados.diasLabels,
                    datasets: [
                        {
                            label: "Atendimentos",
                            data: agregados.diasVals,
                            fill: false,
                            tension: 0.2,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 } },
                    },
                },
            });
        }
    }, [analiseOpen, chartReady, agregados]);

    /* ================================ UI ================================ */
    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Histórico dos Sepultamentos</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Busque pelo nome, filtre por data e visualize o histórico completo. Baixe em PDF quando quiser.
                </p>
            </header>

            {/* Filtros */}
            <div className="rounded-2xl border bg-card/60 p-4 sm:p-5 shadow-sm backdrop-blur">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <IconFilter className="size-4 text-muted-foreground" />
                        Filtros
                    </div>

                    <button
                        type="button"
                        onClick={abrirAnalise}
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted/50"
                        title="Análise Geral"
                    >
                        <IconChartBar className="size-4" />
                        Análise Geral
                    </button>
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
                            <div className="text-xs text-muted-foreground">
                                {selecionado ? sanitize(selecionado.falecido) : "Selecione um registro para visualizar"}
                            </div>
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
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                                Selecione um registro para visualizar o histórico completo.
                            </div>
                        ) : loadingLog ? (
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Carregando histórico...</div>
                        ) : log.length === 0 ? (
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                                Nenhum log encontrado para este registro.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {log.map((ent, i) => {
                                    let detalhesHtml = "";
                                    const raw = ent.detalhes as any;

                                    try {
                                        const obj =
                                            raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);

                                        if (obj && typeof obj === "object") {
                                            const chips: string[] = [];
                                            const arrSet = new Set<string>(); // <— DEDUP arrumação para a tela

                                            for (const key of Object.keys(obj)) {
                                                if (["materiais_json", "id", "acao"].includes(key)) continue;

                                                if (/^arrumacao(_json)?$/i.test(key)) {
                                                    const aobj = obj[key] || {};
                                                    for (const [k, v] of Object.entries(aobj)) if (v) arrSet.add(`✅ ${titleCaseFromSnake(k)}`);
                                                    continue;
                                                }

                                                const m = key.match(/^materiais_(.+?)_qtd$/i);
                                                if (m) {
                                                    const val = obj[key];
                                                    if (val != null && String(val).trim() !== "") {
                                                        const nome = titleCaseFromSnake(m[1]);
                                                        chips.push(
                                                            `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2"><b>${sanitize(
                                                                nome
                                                            )}:</b> ${sanitize(String(val))}</span>`
                                                        );
                                                    }
                                                    continue;
                                                }

                                                if (typeof obj[key] === "object" && !Array.isArray(obj[key])) continue;

                                                let val = obj[key];
                                                if (val == null || String(val).trim() === "") continue;
                                                let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                                                val = String(val);
                                                if (val.startsWith("fase") && FASES_NOMES[val]) val = FASES_NOMES[val];
                                                chips.push(
                                                    `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2"><b>${sanitize(
                                                        nome
                                                    )}:</b> ${sanitize(val)}</span>`
                                                );
                                            }

                                            if (arrSet.size) {
                                                const items = Array.from(arrSet);
                                                chips.unshift(
                                                    `<div class="mt-2"><b>Arrumação:</b> ${items
                                                        .map((t) => `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2">${sanitize(t)}</span>`)
                                                        .join("")}</div>`
                                                );
                                            }

                                            if (chips.length) detalhesHtml = `<div class="mt-2">${chips.join("")}</div>`;
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
                                            detalhesHtml = `<div class="mt-2 text-sm">${sanitize(detalhesRaw)}</div>`;
                                        }
                                    }

                                    return (
                                        <div
                                            key={i}
                                            className="log-entry rounded-xl border bg-background/60 p-3 shadow-sm"
                                            dangerouslySetInnerHTML={{
                                                __html: `
                          <div class="flex gap-3">
                            <div class="text-xl leading-none">${iconeAcao(ent.acao, ent.status_novo)}</div>
                            <div class="flex-1">
                              <div class="text-xs text-muted-foreground">${formataDataHora(ent.datahora)}</div>
                              <div class="text-sm">
                                ${ent.acao ? sanitize(capitalize(ent.acao)) : ""}
                                ${ent.status_novo
                                                        ? `<span class="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">${sanitize(
                                                            traduzirFase(ent.status_novo)
                                                        )}</span>`
                                                        : ""
                                                    }
                              </div>
                              <div class="text-xs text-muted-foreground">Usuário: ${sanitize(ent.usuario || "")}</div>
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

            {/* ============ MODAL: ANÁLISE GERAL ============ */}
            {analiseOpen && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Análise Geral"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setAnaliseOpen(false);
                    }}
                >
                    <div className="w-full rounded-2xl border bg-white p-4 shadow-xl max-w-6xl">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                                <h3 className="text-lg font-semibold">Análise Geral</h3>
                                <p className="text-xs text-muted-foreground">
                                    Filtre por datas e itens para ver os materiais mais consumidos, atendimentos por dia e proporções de assistência.
                                </p>
                            </div>
                            <button
                                className="rounded-md border p-2 text-sm hover:bg-muted"
                                onClick={() => setAnaliseOpen(false)}
                                title="Fechar"
                            >
                                <IconX className="size-4" />
                            </button>
                        </div>

                        {/* Filtros da análise (Selects ao invés de checklists) */}
                        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">Data inicial</span>
                                <input type="date" value={aDe} onChange={(e) => setADe(e.target.value)} className="input" />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">Data final</span>
                                <input type="date" value={aAte} onChange={(e) => setAAte(e.target.value)} className="input" />
                            </label>

                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">Material (contém)</span>
                                <select
                                    className="input"
                                    value={aMaterial}
                                    onChange={(e) => setAMaterial((e.target.value || "") as any)}
                                >
                                    <option value="">Todos</option>
                                    {MATERIAL_KEYS.map((k) => (
                                        <option key={k} value={k}>
                                            {MATERIAL_LABELS[k]}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">Arrumação (contém)</span>
                                <select
                                    className="input"
                                    value={aArrumacao}
                                    onChange={(e) => setAArrumacao((e.target.value || "") as any)}
                                >
                                    <option value="">Todas</option>
                                    {ARR_KEYS.map((k) => (
                                        <option key={k} value={k}>
                                            {ARR_LABELS[k]}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">Assistência</span>
                                <select
                                    className="input"
                                    value={aAssistencia}
                                    onChange={(e) => setAAssistencia((e.target.value || "") as any)}
                                >
                                    <option value="">Todos</option>
                                    <option value="Sim">Sim</option>
                                    <option value="Não">Não</option>
                                </select>
                            </label>

                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-muted-foreground">Tanatopraxia</span>
                                <select className="input" value={aTanato} onChange={(e) => setATanato((e.target.value || "") as any)}>
                                    <option value="">Todos</option>
                                    <option value="Sim">Sim</option>
                                    <option value="Não">Não</option>
                                </select>
                            </label>
                        </div>

                        {/* Info topo */}
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded bg-muted px-2 py-1">
                                Registros considerados: <b>{agregados.totalReg}</b>
                            </span>
                            {aMaterial ? (
                                <span className="rounded bg-muted px-2 py-1">
                                    Material: <b>{MATERIAL_LABELS[aMaterial]}</b>
                                </span>
                            ) : null}
                            {aArrumacao ? (
                                <span className="rounded bg-muted px-2 py-1">
                                    Arrumação: <b>{ARR_LABELS[aArrumacao]}</b>
                                </span>
                            ) : null}
                            {aAssistencia ? (
                                <span className="rounded bg-muted px-2 py-1">
                                    Assistência: <b>{aAssistencia}</b>
                                </span>
                            ) : null}
                            {aTanato ? (
                                <span className="rounded bg-muted px-2 py-1">
                                    Tanatopraxia: <b>{aTanato}</b>
                                </span>
                            ) : null}
                        </div>

                        {/* Corpo do modal */}
                        <div className="mt-4">
                            {loadingAnalise ? (
                                <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                                    Carregando dados para análise...
                                </div>
                            ) : dadosAnalise.length === 0 ? (
                                <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                                    Sem dados para análise no momento.
                                </div>
                            ) : (
                                <>
                                    {/* GRID de gráficos */}
                                    <div className="grid gap-4 md:grid-cols-2">
                                        {/* Materiais mais consumidos */}
                                        <div className="rounded-xl border p-3">
                                            <div className="mb-2 text-sm font-semibold">Materiais mais consumidos</div>
                                            <div className="h-[320px]">
                                                <canvas ref={barRef} />
                                            </div>
                                        </div>

                                        {/* % Assistência */}
                                        <div className="rounded-xl border p-3">
                                            <div className="mb-2 text-sm font-semibold">Distribuição de Assistência</div>
                                            <div className="h-[320px]">
                                                <canvas ref={pieRef} />
                                            </div>
                                        </div>

                                        {/* Atendimentos por dia */}
                                        <div className="rounded-xl border p-3 md:col-span-2">
                                            <div className="mb-2 text-sm font-semibold">Atendimentos por dia</div>
                                            <div className="h-[320px]">
                                                <canvas ref={lineRef} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Resumo de arrumação */}
                                    <div className="mt-4 rounded-xl border p-3">
                                        <div className="mb-2 text-sm font-semibold">Arrumação (quantidade de registros que possuem)</div>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            {ARR_KEYS.map((k) => (
                                                <span key={k} className="rounded border px-2 py-1">
                                                    {ARR_LABELS[k]}: <b>{agregados.arrCount[k] || 0}</b>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
