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
    sepultamento_id?: string;
    data?: string; // data de criação
    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    assistencia?: string; // "Sim" | "Não" | ""
    tanato?: string; // "Sim" | "Não" | ""
    materiais_json?: string;
    arrumacao_json?: string;
    [key: string]: any; // também recebemos materiais_*_qtd
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

/** Datas no formato brasileiro (UI: com hora; PDF: só data) */
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
        timeZone: "America/Sao_Paulo",
        hour12: false,
    });
}
function formataDataDia(str?: string) {
    if (!str) return "";
    const dt = new Date(str.replace(" ", "T"));
    if (Number.isNaN(dt.getTime())) return str;
    return dt.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "America/Sao_Paulo",
    });
}

/** Detecta texto ISO (YYYY-MM-DD[ HH:mm[:ss]]) e formata para pt-BR */
function formataSeDataIso(v?: string) {
    if (!v) return v;
    const s = String(v).trim();

    // ISO só data
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const dt = new Date(s + "T00:00:00");
        if (!Number.isNaN(dt.getTime())) {
            return dt.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                timeZone: "America/Sao_Paulo",
            });
        }
    }

    // ISO com hora
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
        const dt = new Date(s.replace(" ", "T"));
        if (!Number.isNaN(dt.getTime())) {
            return dt.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: s.length >= 19 ? "2-digit" : undefined,
                timeZone: "America/Sao_Paulo",
                hour12: false,
            });
        }
    }

    return v;
}

function sanitize(txt?: string) {
    if (!txt) return "";
    return String(txt).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

/** Normalizador seguro para booleanos vindos como string/number */
function asBool(v: any): boolean {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        return s === "1" || s === "true" || s === "sim" || s === "on";
    }
    return false;
}

/* ===== Materiais (análise) ===== */
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
type MaterialKey = (typeof MATERIAL_KEYS)[number];

const MATERIAL_LABELS: Record<MaterialKey, string> = {
    cadeiras: "Cadeiras",
    bebedouros: "Bebedouros",
    suporte_coroa: "Suporte Coroa",
    kit_lanche: "Kit Lanche",
    velas: "Velas",
    tenda: "Tenda",
    placa: "Placa",
    paramentacao: "Paramentação",
};

/* ===== Arrumação (análise) ===== */
// ⚠️ inclui os 5 novos itens solicitados
const ARR_KEYS = [
    "luvas",
    "palha",
    "tamponamento",
    "maquiagem",
    "algodao",
    "cordao",
    "barba",
    "ta32",
    "fluido_cavitario",
    "formol",
    "mascara",
    "invol",
] as const;
type ArrKey = (typeof ARR_KEYS)[number];

const ARR_LABELS: Record<ArrKey, string> = {
    luvas: "Luvas",
    palha: "Palha",
    tamponamento: "Tamponamento",
    maquiagem: "Maquiagem",
    algodao: "Algodão",
    cordao: "Cordão",
    barba: "Barba",
    ta32: "TA-32",
    fluido_cavitario: "Fluído Cavitário",
    formol: "Formol",
    mascara: "Máscara",
    invol: "Invol",
};

/* ===== Itens combinados (select único) ===== */
type AllItemKey = MaterialKey | ArrKey | "assistencia_sim" | "assistencia_nao" | "tanato_sim" | "tanato_nao";

const ALL_ITEMS: AllItemKey[] = [...MATERIAL_KEYS, ...ARR_KEYS, "assistencia_sim", "assistencia_nao", "tanato_sim", "tanato_nao"];

const ALL_ITEM_LABELS: Record<AllItemKey, string> = {
    // Materiais
    cadeiras: MATERIAL_LABELS.cadeiras,
    bebedouros: MATERIAL_LABELS.bebedouros,
    suporte_coroa: MATERIAL_LABELS.suporte_coroa,
    kit_lanche: MATERIAL_LABELS.kit_lanche,
    velas: MATERIAL_LABELS.velas,
    tenda: MATERIAL_LABELS.tenda,
    placa: MATERIAL_LABELS.placa,
    paramentacao: MATERIAL_LABELS.paramentacao,
    // Arrumação
    luvas: ARR_LABELS.luvas,
    palha: ARR_LABELS.palha,
    tamponamento: ARR_LABELS.tamponamento,
    maquiagem: ARR_LABELS.maquiagem,
    algodao: ARR_LABELS.algodao,
    cordao: ARR_LABELS.cordao,
    barba: ARR_LABELS.barba,
    ta32: ARR_LABELS.ta32,
    fluido_cavitario: ARR_LABELS.fluido_cavitario,
    formol: ARR_LABELS.formol,
    mascara: ARR_LABELS.mascara,
    invol: ARR_LABELS.invol,
    // Assistência / Tanato
    assistencia_sim: "Assistência (Sim)",
    assistencia_nao: "Assistência (Não)",
    tanato_sim: "Tanatopraxia (Sim)",
    tanato_nao: "Tanatopraxia (Não)",
};
const ALL_ITEM_TIPO: Record<AllItemKey, "Material" | "Arrumação" | "Assistência" | "Tanatopraxia"> = {
    cadeiras: "Material",
    bebedouros: "Material",
    suporte_coroa: "Material",
    kit_lanche: "Material",
    velas: "Material",
    tenda: "Material",
    placa: "Material",
    paramentacao: "Material",
    luvas: "Arrumação",
    palha: "Arrumação",
    tamponamento: "Arrumação",
    maquiagem: "Arrumação",
    algodao: "Arrumação",
    cordao: "Arrumação",
    barba: "Arrumação",
    ta32: "Arrumação",
    fluido_cavitario: "Arrumação",
    formol: "Arrumação",
    mascara: "Arrumação",
    invol: "Arrumação",
    assistencia_sim: "Assistência",
    assistencia_nao: "Assistência",
    tanato_sim: "Tanatopraxia",
    tanato_nao: "Tanatopraxia",
};

function normSimNao(s?: string) {
    const v = (s || "").trim().toLowerCase();
    if (v === "sim") return "sim";
    if (v === "não" || v === "nao") return "nao";
    return "";
}

/* ========================== Endpoints (proxy) ========================= */
const LISTAR_FALECIDOS = "/api/php/historico_sepultamentos.php?listar_falecidos=1";
const LOG_POR_ID = (id: string) => `/api/php/historico_sepultamentos.php?log=1&id=${encodeURIComponent(id)}`;
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

    // data/hora de criação (primeiro log) do registro selecionado
    const [criacaoSelecionado, setCriacaoSelecionado] = useState<string>("");

    // jsPDF via CDN (mantido)
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
            // ⚠️ não resetar página aqui (evita "voltar para 1" ao auto-refresh)
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

    // 🔧 manter página válida quando total muda
    useEffect(() => {
        if (pagina > totalPaginas) setPagina(totalPaginas);
        if (pagina < 1) setPagina(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [totalPaginas]);

    // Seleção + carregamento do log
    const selecionarRegistro = useCallback(async (item: FalecidoItem) => {
        setSelecionado(item);
        setLog([]);
        setCriacaoSelecionado("");
        setLoadingLog(true);
        try {
            const res = await fetch(`${LOG_POR_ID(item.sepultamento_id)}&_nocache=${Date.now()}`, {
                cache: "no-store",
            });
            const json = await res.json();
            let arr: LogItem[] = [];
            if (json && json.sucesso && json.dados) arr = json.dados;
            else if (Array.isArray(json)) arr = json;
            const ord = (arr || []).slice().sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
            const primeiro = ord[0]?.datahora || "";
            setCriacaoSelecionado(primeiro);
            setLog(arr || []);
        } catch {
            setLog([]);
        } finally {
            setLoadingLog(false);
        }
    }, []);

    // Nunito no jsPDF (com fallback)
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

    // Exportar PDF
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
            doc.text("Relatório de Atendimento", pageW / 2, y, { align: "center" });
            y += 8;

            doc.setFont(titleFont[0], titleFont[1]);
            doc.setFontSize(13);
            doc.text((selecionado.falecido || "").toString(), pageW / 2, y, { align: "center" });
            y += 12;

            // se tiver “criado em”, mostra no cabeçalho
            if (criacaoSelecionado) {
                doc.setFont(normalFont[0], normalFont[1]);
                doc.setFontSize(10);
                doc.text(`Criado em: ${formataDataDia(criacaoSelecionado)}`, pageW / 2, y, { align: "center" });
                y += 6;
            }

            const cardPadX = 6;
            const cardPadY = 6;

            const writeLine = (text: string | string[], x: number, yy: number, size = 11, bold = false) => {
                doc.setFont(bold ? titleFont[0] : normalFont[0], bold ? titleFont[1] : normalFont[1]);
                doc.setFontSize(size);
                if (Array.isArray(text)) doc.text(text, x, yy);
                else doc.text(text, x, yy);
            };

            for (const ent of log) {
                // PDF: data apenas (DD/MM/AAAA)
                const dataLine = formataDataDia(ent.datahora) || "";
                const acao = capitalize(ent.acao || "");
                const statusTxt = ent.status_novo ? traduzirFase(ent.status_novo) : "";
                const acaoFull = statusTxt ? `${acao} — ${statusTxt}` : acao;
                const usuarioLine = ent.usuario ? `Usuário: ${ent.usuario}` : "";

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
                                    for (const [k, v] of Object.entries(o)) if (asBool(v)) arrSet.add(`✅ ${titleCaseFromSnake(k)}`);
                                }
                                continue;
                            }

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

                            // 🔧 corrige datas ISO dentro dos detalhes
                            v = formataSeDataIso(v);

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

                const innerHeight = (hData ? hData + hUsuario + hDetalhes + 3 : hUsuario + hDetalhes + 3) + hAcao;
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
                    yy += 4 + (dataWrapped.length - 1) * 4 + 3;
                }
                writeLine(acaoWrapped, marginL + cardPadX, yy, 12, true);
                yy += hAcao;

                if (usuarioWrapped.length) {
                    writeLine(usuarioWrapped, marginL + cardPadX, yy, 10, false);
                    yy += usuarioWrapped.length * 5;
                }
                if (detalhesWrapped.length) {
                    writeLine(detalhesWrapped, marginL + cardPadX, yy, 11, false);
                    yy += detalhesWrapped.length * 5;
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
    }, [selecionado, log, criacaoSelecionado]);

    /* =========================== ANÁLISE GERAL (TABELA) =========================== */
    const [analiseOpen, setAnaliseOpen] = useState(false);
    const [loadingAnalise, setLoadingAnalise] = useState(false);
    const [dadosAnalise, setDadosAnalise] = useState<RegistroAnalise[]>([]);
    const [aDe, setADe] = useState("");
    const [aAte, setAAte] = useState(""); // <<< CORRIGIDO: 'const', não 'aconst'
    type SelectedItem = "ALL" | AllItemKey;
    const [selectedItem, setSelectedItem] = useState<SelectedItem>("ALL");

    // NOVO: filtro para considerar somente serviços com Tanatopraxia
    const [somenteTanato, setSomenteTanato] = useState(false);

    // cache de logs por registro (para deltas/auditoria)
    const [logsCache, setLogsCache] = useState<Record<string, LogItem[]>>({});

    // abre modal e carrega lista básica (sem logs ainda)
    const abrirAnalise = useCallback(async () => {
        setAnaliseOpen(true);
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
    }, [dadosAnalise.length]);

    /** Util: extrai snapshot de materiais de um "detalhes" */
    function extrairEstadoMateriais(obj: any): Record<string, number> {
        const out: Record<string, number> = {};
        if (obj?.materiais_json) {
            try {
                const mj = JSON.parse(obj.materiais_json);
                for (const k of Object.keys(mj || {})) {
                    const it = mj[k];
                    const qtd = Number(it?.qtd || 0);
                    const checked = asBool(it?.checked);
                    if (checked && qtd > 0) out[k] = (out[k] || 0) + qtd;
                }
            } catch { }
        }
        for (const k of MATERIAL_KEYS) {
            const col = obj?.[`materiais_${k}_qtd`];
            const qtd = Number(col || 0);
            if (qtd > 0) out[k] = (out[k] || 0) + qtd;
        }
        return out;
    }

    /** Util: extrai snapshot de arrumação de um "detalhes" */
    function extrairEstadoArrumacao(obj: any): Record<string, boolean> {
        const out: Record<string, boolean> = {} as any;
        for (const k of ARR_KEYS) out[k] = false;
        if (obj?.arrumacao_json) {
            try {
                const a = JSON.parse(obj.arrumacao_json);
                for (const k of ARR_KEYS) out[k] = asBool(a?.[k]);
            } catch { }
        }
        return out;
    }

    /** Baixa logs de vários registros com limite de concorrência simples */
    async function carregarLogsParaAnalise(regs: RegistroAnalise[], maxConc = 5) {
        const ids = regs
            .map((r) => String(r.id ?? (r as any).sepultamento_id ?? ""))
            .filter(Boolean);
        const pendentes = ids.filter((id) => !logsCache[id]);
        if (pendentes.length === 0) return;

        setLoadingAnalise(true);
        const novo: Record<string, LogItem[]> = {};
        let i = 0;
        async function worker() {
            while (i < pendentes.length) {
                const id = pendentes[i++];
                try {
                    const res = await fetch(`${LOG_POR_ID(id)}&_nocache=${Date.now()}`, { cache: "no-store" });
                    const json = await res.json();
                    novo[id] = json && json.sucesso && json.dados ? json.dados : Array.isArray(json) ? json : [];
                } catch {
                    novo[id] = [];
                }
            }
        }
        const workers = Array.from({ length: Math.min(maxConc, pendentes.length) }, worker);
        await Promise.all(workers);
        setLogsCache((prev) => ({ ...prev, ...novo }));
        setLoadingAnalise(false);
    }

    // carrega logs quando modal aberto ou período mudar
    useEffect(() => {
        if (!analiseOpen || dadosAnalise.length === 0) return;
        carregarLogsParaAnalise(dadosAnalise);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analiseOpen, dadosAnalise, aDe, aAte]);

    /** Normaliza datahora "YYYY-MM-DD..." → "YYYY-MM-DD" */
    function dataDia(s?: string) {
        return (s || "").slice(0, 10);
    }

    /** Aplica filtro de período sobre a data do LOG */
    function estaNoPeriodo(datahora?: string) {
        const d = dataDia(datahora);
        if (aDe && d && d < aDe) return false;
        if (aAte && d && d > aAte) return false;
        return true;
    }

    /** Preferência de data para exibição (para lista de tanato): início de velório > data (criação) */
    function dataPreferidaRegistro(r: RegistroAnalise) {
        return r.data_inicio_velorio || r.data || "";
    }

    /** Filtro base: aplica "somenteTanato" aos registros analisados */
    const registrosBaseConsiderados = useMemo(() => {
        if (!somenteTanato) return dadosAnalise;
        return dadosAnalise.filter((r) => normSimNao(r.tanato) === "sim");
    }, [dadosAnalise, somenteTanato]);

    // registros que efetivamente têm evento no período
    const registrosComEventoNoPeriodo = useMemo(() => {
        let count = 0;
        for (const r of registrosBaseConsiderados) {
            const id = String(r.id ?? (r as any).sepultamento_id ?? "");
            const logs = logsCache[id];
            if (!logs || logs.length === 0) continue;
            if (logs.some((ent) => estaNoPeriodo(ent.datahora))) count++;
        }
        return count;
    }, [registrosBaseConsiderados, logsCache, aDe, aAte]);

    /** Calcula consumo por deltas/ativações */
    const contagemPorItem = useMemo(() => {
        const counts: Record<AllItemKey, number> = {} as any;
        ALL_ITEMS.forEach((k) => (counts[k] = 0));

        for (const r of registrosBaseConsiderados) {
            const id = String(r.id ?? (r as any).sepultamento_id ?? "");
            const logs = logsCache[id];
            if (!logs || logs.length === 0) continue;

            const ord = [...logs]
                .filter((ent) => estaNoPeriodo(ent.datahora))
                .sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));

            let prevMat: Record<string, number> = {};
            let prevArr: Record<string, boolean> = {};
            for (const ent of ord) {
                const raw = ent.detalhes as any;
                const obj =
                    raw && typeof raw === "string"
                        ? (() => {
                            try {
                                return JSON.parse(raw) as Record<string, any>;
                            } catch {
                                return {};
                            }
                        })()
                        : (raw as Record<string, any>) || {};

                const curMat = extrairEstadoMateriais(obj);
                const curArr = extrairEstadoArrumacao(obj);

                for (const k of MATERIAL_KEYS) {
                    const d = (curMat[k] || 0) - (prevMat[k] || 0);
                    if (d > 0) counts[k] += d;
                }

                for (const k of ARR_KEYS) {
                    const was = !!prevArr[k];
                    const now = !!curArr[k];
                    if (!was && now) counts[k] += 1;
                }

                prevMat = curMat;
                prevArr = curArr;
            }
        }

        for (const r of registrosBaseConsiderados) {
            const a = normSimNao(r.assistencia);
            if (a === "sim") counts.assistencia_sim += 1;
            else if (a === "nao") counts.assistencia_nao += 1;
            const t = normSimNao(r.tanato);
            if (t === "sim") counts.tanato_sim += 1;
            else if (t === "nao") counts.tanato_nao += 1;
        }

        return counts;
    }, [registrosBaseConsiderados, logsCache, aDe, aAte]);

    type Row = { key: AllItemKey; item: string; tipo: string; quantidade: number };
    const rows = useMemo<Row[]>(() => {
        const keys: AllItemKey[] = selectedItem === "ALL" ? ALL_ITEMS : [selectedItem];
        const arr = keys.map<Row>((k) => ({
            key: k,
            item: ALL_ITEM_LABELS[k],
            tipo: ALL_ITEM_TIPO[k],
            quantidade: contagemPorItem[k],
        }));
        const filtered = selectedItem === "ALL" ? arr.filter((r) => r.quantidade > 0) : arr;
        filtered.sort((a, b) => b.quantidade - a.quantidade);
        return filtered;
    }, [selectedItem, contagemPorItem]);

    /** Lista de tanato no período (nome + data) */
    const listaTanatoPeriodo = useMemo(() => {
        if (!registrosBaseConsiderados.length) return [];
        const ok = registrosBaseConsiderados.filter((r) => normSimNao(r.tanato) === "sim");
        return ok
            .filter((r) => {
                const d = dataDia(dataPreferidaRegistro(r));
                if (aDe && d && d < aDe) return false;
                if (aAte && d && d > aAte) return false;
                return true;
            })
            .map((r) => ({
                nome: (r as any).falecido || (r as any).nome || "",
                data: dataPreferidaRegistro(r),
            }))
            .sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    }, [registrosBaseConsiderados, aDe, aAte]);

    /* ================================ UI ================================ */
    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Relatório de Atendimento</h1>
                <p className="mt-1 text-sm text-muted-foreground">Busque pelo nome, filtre por data e visualize o histórico completo. Baixe em PDF quando quiser.</p>
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

                <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
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
                                            {/* mantemos ultima_datahora aqui; criação aparece na coluna da direita */}
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
                            {/* NOVO: data/hora de criação do atendimento (primeiro log) */}
                            {criacaoSelecionado && (
                                <div className="text-xs text-muted-foreground">
                                    Criado em: <b>{formataDataHora(criacaoSelecionado)}</b>
                                </div>
                            )}
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
                                        const obj = raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);

                                        if (obj && typeof obj === "object") {
                                            const chips: string[] = [];
                                            const arrSet = new Set<string>();

                                            for (const key of Object.keys(obj)) {
                                                if (["materiais_json", "id", "acao"].includes(key)) continue;

                                                if (/^arrumacao(_json)?$/i.test(key)) {
                                                    const aobj = obj[key] || {};
                                                    for (const [k, v] of Object.entries(aobj)) if (asBool(v)) arrSet.add(`✅ ${titleCaseFromSnake(k)}`);
                                                    continue;
                                                }

                                                const m = key.match(/^materiais_(.+?)_qtd$/i);
                                                if (m) {
                                                    const valRaw = obj[key];
                                                    if (valRaw != null && String(valRaw).trim() !== "") {
                                                        const nome = titleCaseFromSnake(m[1]);
                                                        const val = formataSeDataIso(String(valRaw)); // se for data, já formata
                                                        chips.push(
                                                            `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2"><b>${sanitize(nome)}:</b> ${sanitize(
                                                                String(val)
                                                            )}</span>`
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

                                                // 🔧 também formata ISO → pt-BR na UI
                                                val = formataSeDataIso(val);

                                                chips.push(
                                                    `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2"><b>${sanitize(nome)}:</b> ${sanitize(val)}</span>`
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

            {/* ============ MODAL: ANÁLISE GERAL (TABELA/CARDS) ============ */}
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
                    {/* container com altura máxima e rolagem interna (evita body-scroll) */}
                    <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border bg-white shadow-xl">
                        {/* Cabeçalho (sticky) */}
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white/90 p-4 backdrop-blur">
                            <div>
                                <h3 className="text-lg font-semibold">Análise Geral</h3>
                                <p className="text-xs text-muted-foreground">
                                    A análise soma consumo pelos <b>eventos de log</b> no período selecionado (materiais por <i>deltas</i> e arrumação por{" "}
                                    <i>ativações</i>). Você pode restringir aos serviços com Tanatopraxia.
                                </p>
                            </div>
                            <button className="rounded-md border p-2 text-sm hover:bg-muted" onClick={() => setAnaliseOpen(false)} title="Fechar">
                                <IconX className="size-4" />
                            </button>
                        </div>

                        {/* Corpo com rolagem própria */}
                        <div className="h-[calc(90vh-56px)] overflow-auto">
                            {/* Filtros */}
                            <div className="grid gap-3 p-4 md:grid-cols-4">
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Data inicial</span>
                                    <input type="date" value={aDe} onChange={(e) => setADe(e.target.value)} className="input" />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Data final</span>
                                    <input type="date" value={aAte} onChange={(e) => setAAte(e.target.value)} className="input" />
                                </label>

                                {/* NOVO: Toggle Somente Tanato */}
                                <label className="flex items-center gap-2 md:col-span-2">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={somenteTanato}
                                        onChange={(e) => setSomenteTanato(e.target.checked)}
                                    />
                                    <span className="text-sm">Somente serviços com Tanatopraxia</span>
                                </label>

                                <label className="md:col-span-2 flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Item</span>
                                    <select className="input" value={selectedItem} onChange={(e) => setSelectedItem((e.target.value as SelectedItem) || "ALL")}>
                                        <option value="ALL">Todos os itens</option>
                                        <optgroup label="Materiais">
                                            {MATERIAL_KEYS.map((k) => (
                                                <option key={k} value={k}>
                                                    {MATERIAL_LABELS[k]}
                                                </option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Arrumação">
                                            {ARR_KEYS.map((k) => (
                                                <option key={k} value={k}>
                                                    {ARR_LABELS[k]}
                                                </option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Assistência / Tanatopraxia">
                                            <option value="assistencia_sim">Assistência (Sim)</option>
                                            <option value="assistencia_nao">Assistência (Não)</option>
                                            <option value="tanato_sim">Tanatopraxia (Sim)</option>
                                            <option value="tanato_nao">Tanatopraxia (Não)</option>
                                        </optgroup>
                                    </select>
                                </label>
                            </div>

                            {/* Resumo */}
                            <div className="flex flex-wrap items-center gap-2 px-4">
                                <span className="rounded bg-muted px-2 py-1 text-xs">
                                    Registros com evento no período: <b>{registrosComEventoNoPeriodo}</b>
                                </span>
                                {loadingAnalise && (
                                    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs">
                                        <IconLoader2 className="size-3 animate-spin" />
                                        Processando…
                                    </span>
                                )}
                            </div>

                            {/* Resumo de tanato */}
                            {somenteTanato && (
                                <div className="px-4 pt-3">
                                    <div className="rounded-lg border p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm font-semibold">
                                                Serviços com Tanatopraxia no período: <span className="font-bold">{listaTanatoPeriodo.length}</span>
                                            </div>
                                        </div>
                                        {listaTanatoPeriodo.length > 0 ? (
                                            <ul className="mt-2 grid gap-1">
                                                {listaTanatoPeriodo.map((it, idx) => (
                                                    <li key={`${it.nome}-${it.data}-${idx}`} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                                                        <span className="font-medium">{it.nome || "—"}</span>
                                                        <span className="text-xs text-muted-foreground">{formataDataDia(it.data)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="mt-2 text-sm text-muted-foreground">Nenhum serviço com Tanatopraxia no período selecionado.</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Tabela (desktop) / Cards (mobile) */}
                            <div className="p-4">
                                {dadosAnalise.length === 0 ? (
                                    <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Sem dados para análise no momento.</div>
                                ) : rows.length === 0 ? (
                                    <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhum item consumido no período selecionado.</div>
                                ) : (
                                    <>
                                        {/* Desktop: tabela */}
                                        <div className="hidden md:block">
                                            <div className="overflow-hidden rounded-lg border">
                                                <table className="min-w-full text-sm">
                                                    <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-semibold">Item</th>
                                                            <th className="w-40 px-3 py-2 text-left font-semibold">Categoria</th>
                                                            <th className="w-28 px-3 py-2 text-left font-semibold">Quantidade</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {rows.map((r) => (
                                                            <tr key={r.key} className="border-t">
                                                                <td className="px-3 py-2">{r.item}</td>
                                                                <td className="px-3 py-2">{r.tipo}</td>
                                                                <td className="px-3 py-2 font-semibold">{r.quantidade}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Mobile: cards */}
                                        <div className="md:hidden">
                                            <ul className="grid gap-2">
                                                {rows.map((r) => (
                                                    <li key={r.key} className="rounded-lg border p-3">
                                                        <div className="flex items-center justify-between">
                                                            <div className="font-medium">{r.item}</div>
                                                            <div className="text-xs text-muted-foreground">{r.tipo}</div>
                                                        </div>
                                                        <div className="mt-1 text-lg font-semibold">{r.quantidade}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Rodapé fixo */}
                            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-white/90 p-3 backdrop-blur">
                                <div className="text-xs text-muted-foreground">Dica: em “Todos os itens” você vê rapidamente o que mais saiu no período.</div>
                                <div className="flex gap-2">
                                    <button
                                        className="rounded-md border px-3 py-1.5 text-sm"
                                        onClick={() => {
                                            setADe("");
                                            setAAte("");
                                            setSelectedItem("ALL");
                                            setSomenteTanato(false);
                                        }}
                                    >
                                        Limpar filtros
                                    </button>
                                    <button className="rounded-md border px-3 py-1.5 text-sm" onClick={() => carregarLogsParaAnalise(dadosAnalise)}>
                                        Recarregar dados
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
