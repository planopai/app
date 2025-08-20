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
    IconRefresh,
    IconAdjustmentsHorizontal,
    IconX,
} from "@tabler/icons-react";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    LabelList,
} from "recharts";

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

/* Materiais e Arrumação (listas exibidas) */
type MaterialKey =
    | "cadeiras"
    | "bebedouros"
    | "suporte_coroa"
    | "kit_lanche"
    | "velas"
    | "tenda"
    | "placa"
    | "paramentacao";
const MATERIAIS: { key: MaterialKey; label: string }[] = [
    { key: "cadeiras", label: "Cadeiras" },
    { key: "bebedouros", label: "Bebedouros" },
    { key: "suporte_coroa", label: "Suporte Coroa" },
    { key: "kit_lanche", label: "Kit Lanche" },
    { key: "velas", label: "Velas" },
    { key: "tenda", label: "Tenda" },
    { key: "placa", label: "Placa" },
    { key: "paramentacao", label: "Paramentação" },
];

type ArrKey =
    | "luvas"
    | "palha"
    | "tamponamento"
    | "maquiagem"
    | "algodao"
    | "cordao"
    | "barba";
const ARRUMACAO: { key: ArrKey; label: string }[] = [
    { key: "luvas", label: "Luvas" },
    { key: "palha", label: "Palha" },
    { key: "tamponamento", label: "Tamponamento" },
    { key: "maquiagem", label: "Maquiagem" },
    { key: "algodao", label: "Algodão" },
    { key: "cordao", label: "Cordão" },
    { key: "barba", label: "Barba" },
];

/* Materiais helpers */
const MATERIAL_QTD_REGEX = /^materiais_(.+?)_qtd$/i;
function materialKeyToName(key: string) {
    const m = key.match(MATERIAL_QTD_REGEX);
    if (!m) return null;
    return titleCaseFromSnake(m[1]).replace("Suporte Coroa", "Suporte Coroa").replace("Kit Lanche", "Kit Lanche");
}

/* Arrumação helpers */
function parseArrumacao(val: any): Partial<Record<ArrKey, boolean>> {
    try {
        const obj = typeof val === "string" ? JSON.parse(val) : val;
        if (!obj || typeof obj !== "object") return {};
        const res: Partial<Record<ArrKey, boolean>> = {};
        for (const [k, v] of Object.entries(obj)) {
            const kk = k.toLowerCase() as ArrKey;
            if (["luvas", "palha", "tamponamento", "maquiagem", "algodao", "cordao", "barba"].includes(kk)) {
                res[kk] = !!v;
            }
        }
        return res;
    } catch {
        return {};
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
            const res = await fetch(`${LISTAR_FALECIDOS}&'_nocache'=${Date.now()}`, { cache: "no-store" });
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

    // ===== PDF (igual ao seu anterior) =====
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
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const marginL = 14;
            const marginR = 14;
            const contentW = pageW - marginL - marginR;
            const titleFont: [string, string] = hasNunito ? ["Nunito", "bold"] : ["helvetica", "bold"];
            const normalFont: [string, string] = hasNunito ? ["Nunito", "normal"] : ["helvetica", "normal"];
            let y = 22;
            doc.setFont(titleFont[0], titleFont[1]);
            doc.setFontSize(18);
            doc.text("Histórico dos Sepultamentos", pageW / 2, y, { align: "center" });
            y += 8;
            doc.setFont(titleFont[0], titleFont[1]);
            doc.setFontSize(13);
            doc.text((selecionado.falecido || "").toString(), pageW / 2, y, { align: "center" });
            y += 12;
            const cardPadX = 6;
            const cardPadY = 6;
            const lineGap = 3;
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
                const dataLine = formataDataHora(ent.datahora) || "";
                const acao = capitalize(ent.acao || "");
                const statusTxt = ent.status_novo ? traduzirFase(ent.status_novo) : "";
                const acaoFull = statusTxt ? `${acao} — ${statusTxt}` : acao;
                const usuarioLine = ent.usuario ? `Usuário: ${ent.usuario}` : "";
                const detalhesLines: string[] = [];
                const raw = ent.detalhes as any;
                const materiaisLines: string[] = [];
                const arrSet = new Set<string>();
                try {
                    const obj =
                        raw && typeof raw === "string"
                            ? (JSON.parse(raw) as Record<string, any>)
                            : (raw as Record<string, any>);
                    if (obj && typeof obj === "object") {
                        for (const key of Object.keys(obj)) {
                            if (["materiais_json", "id", "acao"].includes(key)) continue;
                            if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
                                if (/^arrumacao(_json)?$/i.test(key)) {
                                    const arr = parseArrumacao(obj[key]);
                                    for (const [k, v] of Object.entries(arr)) if (v) arrSet.add(`✅ ${titleCaseFromSnake(k)}`);
                                }
                                continue;
                            }
                            const matName = materialKeyToName(key);
                            if (matName) {
                                const qtd = obj[key];
                                if (qtd != null && String(qtd).trim() !== "") materiaisLines.push(`${matName}: ${String(qtd)}`);
                                continue;
                            }
                            if (/^arrumacao(_json)?$/i.test(key)) {
                                const arr = parseArrumacao(obj[key]);
                                for (const [k, v] of Object.entries(arr)) if (v) arrSet.add(`✅ ${titleCaseFromSnake(k)}`);
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
                const innerHeight =
                    (hData ? hData + lineGap : 0) + hAcao + (hUsuario ? lineGap + hUsuario : 0) + (hDetalhes ? lineGap + hDetalhes : 0);
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

    /* ===================== ESTADO: Análise Geral ===================== */
    const [analiseOpen, setAnaliseOpen] = useState(false);
    const [analiseFrom, setAnaliseFrom] = useState<string>("");
    const [analiseTo, setAnaliseTo] = useState<string>("");

    const [analiseMateriais, setAnaliseMateriais] = useState<Record<MaterialKey, boolean>>(
        () =>
            MATERIAIS.reduce((acc, m) => {
                acc[m.key] = true;
                return acc;
            }, {} as Record<MaterialKey, boolean>)
    );
    const [analiseArr, setAnaliseArr] = useState<Record<ArrKey, boolean>>(
        () =>
            ARRUMACAO.reduce((acc, a) => {
                acc[a.key] = true;
                return acc;
            }, {} as Record<ArrKey, boolean>)
    );

    const [analiseLoading, setAnaliseLoading] = useState(false);
    const [analiseError, setAnaliseError] = useState<string | null>(null);
    const [analiseLogs, setAnaliseLogs] = useState<Record<string, LogItem[]>>({});

    // resultados agregados
    const [matTotals, setMatTotals] = useState<Record<MaterialKey, number>>({
        cadeiras: 0, bebedouros: 0, suporte_coroa: 0, kit_lanche: 0, velas: 0, tenda: 0, placa: 0, paramentacao: 0,
    });
    const [arrTotals, setArrTotals] = useState<Record<ArrKey, number>>({
        luvas: 0, palha: 0, tamponamento: 0, maquiagem: 0, algodao: 0, cordao: 0, barba: 0,
    });
    const [analiseConsiderados, setAnaliseConsiderados] = useState<number>(0);

    const [ordenarDesc, setOrdenarDesc] = useState(true);
    const [ocultarZero, setOcultarZero] = useState(true);

    // Busca logs de TODOS registros (usa a lista já carregada)
    const baixarDadosAnalise = useCallback(async () => {
        setAnaliseError(null);
        setAnaliseLoading(true);
        try {
            const ids = lista.map((r) => r.sepultamento_id).filter(Boolean);
            const chunks: string[][] = [];
            const chunkSize = 15; // throttle leve
            for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));

            const out: Record<string, LogItem[]> = {};
            for (const c of chunks) {
                const results = await Promise.allSettled(
                    c.map(async (id) => {
                        const r = await fetch(`${LOG_POR_ID(id)}&_nocache=${Date.now()}`, { cache: "no-store" });
                        const j = await r.json();
                        let arr: LogItem[] = [];
                        if (j && j.sucesso && j.dados) arr = j.dados;
                        else if (Array.isArray(j)) arr = j;
                        return { id, logs: arr || [] };
                    })
                );
                results.forEach((p) => {
                    if (p.status === "fulfilled") out[p.value.id] = p.value.logs;
                });
            }
            setAnaliseLogs(out);
        } catch (e: any) {
            setAnaliseError("Não foi possível carregar os dados para análise.");
        } finally {
            setAnaliseLoading(false);
        }
    }, [lista]);

    // Recalcula agregados localmente com base nos logs baixados + filtros
    const aplicarFiltrosAnalise = useCallback(() => {
        // parse datas
        const fromDate = analiseFrom ? new Date(`${analiseFrom}T00:00:00`) : null;
        const toDate = analiseTo ? new Date(`${analiseTo}T23:59:59.999`) : null;

        // totais
        const mats: Record<MaterialKey, number> = {
            cadeiras: 0, bebedouros: 0, suporte_coroa: 0, kit_lanche: 0, velas: 0, tenda: 0, placa: 0, paramentacao: 0,
        };
        const arrs: Record<ArrKey, number> = {
            luvas: 0, palha: 0, tamponamento: 0, maquiagem: 0, algodao: 0, cordao: 0, barba: 0,
        };

        let considerados = 0;

        // para cada registro, pegamos o "último estado" dentro do período
        for (const [id, logs] of Object.entries(analiseLogs)) {
            // filtra por data
            const logsFiltrados = logs
                .filter((l) => {
                    if (!l.datahora) return false;
                    const d = new Date(l.datahora.replace(" ", "T"));
                    if (Number.isNaN(d.getTime())) return false;
                    if (fromDate && d < fromDate) return false;
                    if (toDate && d > toDate) return false;
                    return true;
                })
                .sort((a, b) => {
                    const da = new Date((a.datahora || "").replace(" ", "T")).getTime();
                    const db = new Date((b.datahora || "").replace(" ", "T")).getTime();
                    return da - db;
                });

            if (logsFiltrados.length === 0) continue;

            // estado final por registro dentro do período
            const matFinal: Partial<Record<MaterialKey, number>> = {};
            const arrFinal: Partial<Record<ArrKey, boolean>> = {};

            for (const ent of logsFiltrados) {
                const raw = ent.detalhes as any;
                try {
                    const obj =
                        raw && typeof raw === "string"
                            ? (JSON.parse(raw) as Record<string, any>)
                            : (raw as Record<string, any>);

                    if (obj && typeof obj === "object") {
                        // materiais_*_qtd
                        for (const [k, v] of Object.entries(obj)) {
                            const mName = materialKeyToName(k);
                            if (mName) {
                                // converte label -> key do nosso enum
                                const keySnake = (k.match(MATERIAL_QTD_REGEX)?.[1] || "") as MaterialKey;
                                const key = keySnake as MaterialKey;
                                const qtd = v == null || v === "" ? undefined : Number(v);
                                if (!Number.isNaN(qtd as number)) matFinal[key] = qtd as number;
                            }
                        }
                        // arrumacao
                        for (const [k, v] of Object.entries(parseArrumacao(obj.arrumacao ?? obj.arrumacao_json))) {
                            const kk = k as ArrKey;
                            arrFinal[kk] = !!v;
                        }
                    }
                } catch {
                    // Ignora detalhes não-JSON neste agregado
                }
            }

            // Só considera o registro se ele tem alguma info relevante
            const temMateriais = Object.keys(matFinal).length > 0;
            const temArr = Object.keys(arrFinal).length > 0;
            if (!temMateriais && !temArr) continue;

            considerados++;

            // Aplica seleção de filtros e soma
            MATERIAIS.forEach(({ key }) => {
                if (!analiseMateriais[key]) return;
                const qtd = matFinal[key];
                if (typeof qtd === "number") mats[key] += qtd;
            });
            ARRUMACAO.forEach(({ key }) => {
                if (!analiseArr[key]) return;
                if (arrFinal[key]) arrs[key] += 1;
            });
        }

        setMatTotals(mats);
        setArrTotals(arrs);
        setAnaliseConsiderados(considerados);
    }, [analiseLogs, analiseFrom, analiseTo, analiseMateriais, analiseArr]);

    // Dados para os gráficos
    const materiaisChartData = useMemo(() => {
        let data = MATERIAIS.map(({ key, label }) => ({
            name: label,
            total: matTotals[key] || 0,
        }));
        if (ocultarZero) data = data.filter((d) => d.total > 0);
        if (ordenarDesc) data = data.sort((a, b) => b.total - a.total);
        return data;
    }, [matTotals, ordenarDesc, ocultarZero]);

    const arrumacaoChartData = useMemo(() => {
        let data = ARRUMACAO.map(({ key, label }) => ({
            name: label,
            total: arrTotals[key] || 0,
        }));
        if (ocultarZero) data = data.filter((d) => d.total > 0);
        if (ordenarDesc) data = data.sort((a, b) => b.total - a.total);
        return data;
    }, [arrTotals, ordenarDesc, ocultarZero]);

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
                <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <IconFilter className="size-4 text-muted-foreground" />
                        Filtros
                    </div>

                    <button
                        type="button"
                        onClick={() => setAnaliseOpen(true)}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs sm:text-sm hover:bg-muted/60"
                        title="Abrir análise geral"
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
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhum log encontrado para este registro.</div>
                        ) : (
                            <div className="space-y-3">
                                {log.map((ent, i) => {
                                    let detalhesHtml = "";
                                    const raw = ent.detalhes as any;
                                    try {
                                        const obj =
                                            raw && typeof raw === "string"
                                                ? (JSON.parse(raw) as Record<string, any>)
                                                : (raw as Record<string, any>);
                                        if (obj && typeof obj === "object") {
                                            const chips: string[] = [];
                                            const arrSet = new Set<string>();
                                            for (const key of Object.keys(obj)) {
                                                if (["materiais_json", "id", "acao"].includes(key)) continue;
                                                if (/^arrumacao(_json)?$/i.test(key)) {
                                                    const arr = parseArrumacao(obj[key]);
                                                    Object.entries(arr).forEach(([kk, vv]) => {
                                                        if (vv) arrSet.add(`✅ ${titleCaseFromSnake(kk)}`);
                                                    });
                                                    continue;
                                                }
                                                const matName = materialKeyToName(key);
                                                if (matName) {
                                                    const val = obj[key];
                                                    if (val != null && String(val).trim() !== "") {
                                                        chips.push(
                                                            `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2"><b>${sanitize(
                                                                matName
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
                                            // eslint-disable-next-line react/no-danger
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

            {/* ===================== MODAL: ANÁLISE GERAL ===================== */}
            {analiseOpen && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Análise Geral"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setAnaliseOpen(false);
                    }}
                >
                    <div className="w-full max-w-6xl rounded-2xl bg-white p-4 shadow-xl">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <IconChartBar className="size-5 text-muted-foreground" />
                                <h2 className="text-lg font-semibold">Análise Geral</h2>
                                <span className="text-xs text-muted-foreground">Registros: {Object.keys(analiseLogs).length || lista.length}</span>
                            </div>
                            <button
                                onClick={() => setAnaliseOpen(false)}
                                className="rounded-md border px-2 py-1 text-sm hover:bg-muted"
                                aria-label="Fechar"
                            >
                                <IconX className="size-4" />
                            </button>
                        </div>

                        {/* Filtros da análise */}
                        <div className="grid gap-3 lg:grid-cols-[1fr,1fr]">
                            <div className="rounded-xl border p-3">
                                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                                    <IconAdjustmentsHorizontal className="size-4 text-muted-foreground" />
                                    Período & Controles
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground">De</span>
                                        <input
                                            type="date"
                                            className="input"
                                            value={analiseFrom}
                                            onChange={(e) => setAnaliseFrom(e.target.value)}
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs text-muted-foreground">Até</span>
                                        <input
                                            type="date"
                                            className="input"
                                            value={analiseTo}
                                            onChange={(e) => setAnaliseTo(e.target.value)}
                                        />
                                    </label>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                    <label className="inline-flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={ordenarDesc} onChange={(e) => setOrdenarDesc(e.target.checked)} />
                                        Ordenar por valor (desc)
                                    </label>
                                    <label className="inline-flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={ocultarZero} onChange={(e) => setOcultarZero(e.target.checked)} />
                                        Ocultar itens com zero
                                    </label>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={baixarDadosAnalise}
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                                        disabled={analiseLoading}
                                        title="Baixar/atualizar logs de todos os registros"
                                    >
                                        {analiseLoading ? <IconLoader2 className="size-4 animate-spin" /> : <IconRefresh className="size-4" />}
                                        {analiseLoading ? "Carregando dados…" : "Atualizar dados"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={aplicarFiltrosAnalise}
                                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                        title="Aplicar filtros e recalcular"
                                    >
                                        <IconFilter className="size-4" />
                                        Aplicar filtros
                                    </button>
                                    <span className="text-xs text-muted-foreground self-center">
                                        Considerados no período: <b>{analiseConsiderados}</b>
                                    </span>
                                </div>

                                {analiseError && (
                                    <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{analiseError}</div>
                                )}
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                <div className="rounded-xl border p-3">
                                    <div className="mb-2 text-sm font-semibold">Materiais (selecione)</div>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                        {MATERIAIS.map(({ key, label }) => (
                                            <label key={key} className="inline-flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={!!analiseMateriais[key]}
                                                    onChange={(e) =>
                                                        setAnaliseMateriais((prev) => ({ ...prev, [key]: e.target.checked }))
                                                    }
                                                />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex gap-2">
                                        <button
                                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                            onClick={() =>
                                                setAnaliseMateriais(
                                                    MATERIAIS.reduce((acc, m) => {
                                                        acc[m.key] = true;
                                                        return acc;
                                                    }, {} as Record<MaterialKey, boolean>)
                                                )
                                            }
                                        >
                                            Marcar todos
                                        </button>
                                        <button
                                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                            onClick={() =>
                                                setAnaliseMateriais(
                                                    MATERIAIS.reduce((acc, m) => {
                                                        acc[m.key] = false;
                                                        return acc;
                                                    }, {} as Record<MaterialKey, boolean>)
                                                )
                                            }
                                        >
                                            Desmarcar todos
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded-xl border p-3">
                                    <div className="mb-2 text-sm font-semibold">Arrumação (selecione)</div>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                        {ARRUMACAO.map(({ key, label }) => (
                                            <label key={key} className="inline-flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={!!analiseArr[key]}
                                                    onChange={(e) =>
                                                        setAnaliseArr((prev) => ({ ...prev, [key]: e.target.checked }))
                                                    }
                                                />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex gap-2">
                                        <button
                                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                            onClick={() =>
                                                setAnaliseArr(
                                                    ARRUMACAO.reduce((acc, a) => {
                                                        acc[a.key] = true;
                                                        return acc;
                                                    }, {} as Record<ArrKey, boolean>)
                                                )
                                            }
                                        >
                                            Marcar todos
                                        </button>
                                        <button
                                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                            onClick={() =>
                                                setAnaliseArr(
                                                    ARRUMACAO.reduce((acc, a) => {
                                                        acc[a.key] = false;
                                                        return acc;
                                                    }, {} as Record<ArrKey, boolean>)
                                                )
                                            }
                                        >
                                            Desmarcar todos
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Gráficos */}
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border p-3">
                                <div className="mb-2 text-sm font-semibold">Materiais mais consumidos (soma de quantidades)</div>
                                <div className="h-[320px]">
                                    {materiaisChartData.length === 0 ? (
                                        <div className="grid h-full place-items-center text-sm text-muted-foreground">
                                            Sem dados para exibir.
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={materiaisChartData} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={50} />
                                                <YAxis allowDecimals={false} />
                                                <Tooltip />
                                                <Bar dataKey="total">
                                                    <LabelList dataKey="total" position="top" />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-2xl border p-3">
                                <div className="mb-2 text-sm font-semibold">Arrumação (quantidade de atendimentos com ✅)</div>
                                <div className="h-[320px]">
                                    {arrumacaoChartData.length === 0 ? (
                                        <div className="grid h-full place-items-center text-sm text-muted-foreground">
                                            Sem dados para exibir.
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={arrumacaoChartData} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={50} />
                                                <YAxis allowDecimals={false} />
                                                <Tooltip />
                                                <Bar dataKey="total">
                                                    <LabelList dataKey="total" position="top" />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 text-xs text-muted-foreground">
                            Dica: clique em <b>Atualizar dados</b> para baixar/atualizar os logs de todos os registros. Em seguida,
                            ajuste o período e seleções e clique em <b>Aplicar filtros</b> para recalcular os gráficos localmente.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
