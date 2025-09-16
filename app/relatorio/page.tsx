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
    data?: string;
    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    assistencia?: string;
    tanato?: string;
    materiais_json?: string;
    arrumacao_json?: string;
    [key: string]: any;
}

/* ========================= Mapeamentos & utilitarios Que Vem Das Funções de Ações ======================== */
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

/** === Override VISUAL de rótulos === */
/** === Override VISUAL de rótulos (para chaves/colunas) === */
function overrideCampoNome(originalKey: string, nomeAtual: string) {
    // normaliza chave vinda do BD ou do texto ("Observacao Velorio01", "observacao_velorio01", etc.)
    const k = (originalKey || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos para comparar
        .replace(/[^\p{L}\d]+/gu, "_")                     // espaços, traços, etc. -> _
        .replace(/^_+|_+$/g, "");                          // trim

    const MAP: Record<string, string> = {
        // —— campos com acento e textos “bonitos”
        assistencia: "Assistência",
        ornamentacao_tipo: "Ornamentação",
        religiao: "Religião",
        convenio: "Convênio",
        local_velorio: "Local do Velório",

        data_inicio_velorio: "Data de Início do Velório",
        data_fim_velorio: "Data do Fim do Velório",
        hora_inicio_velorio: "Horário de Início do Velório",
        hora_fim_velorio: "Horário do Sepultamento", // já existia

        observacao_velorio01: "Observação de Velório",
        observacao_velorio02: "Observação de Sepultamento",
        observacao_atendimento: "Observação do Atendimento",
        observacao_itens: "Observação dos Itens",

        // (opcional) se quiser padronizar “tanato”:
        // tanato: "Tanatopraxia",
    };

    return MAP[k] ?? nomeAtual;
}

/** Substitui rótulos em textos livres vindos do backend (corrige acentos e nomes) */
function substituirRotuloVisual(texto: string) {
    if (!texto) return texto;

    const repl = (src: string | RegExp, dst: string) => (texto = texto.replace(src as any, dst));

    // tolera variações com/sem acento, com espaço/underscore, maiúsculas/minúsculas
    repl(/\brelig[ií]ao\b/gi, "Religião");
    repl(/\bconvenio\b/gi, "Convênio");
    repl(/\blocal[_\s]*vel[oó]rio\b/gi, "Local do Velório");

    repl(/\bdata[_\s]*inicio[_\s]*vel[oó]rio\b/gi, "Data de Início do Velório");
    repl(/\bdata[_\s]*fim[_\s]*vel[oó]rio\b/gi, "Data do Fim do Velório");
    repl(/\bhora[_\s]*inicio[_\s]*vel[oó]rio\b/gi, "Horário de Início do Velório");
    repl(/\bhora[_\s]*fim[_\s]*vel[oó]rio\b/gi, "Horário do Sepultamento");

    repl(/\bobservacao[_\s]*velorio01\b/gi, "Observação de Velório");
    repl(/\bobservacao[_\s]*velorio02\b/gi, "Observação de Sepultamento");
    repl(/\bobservacao[_\s]*atendimento\b/gi, "Observação do Atendimento");
    repl(/\bobservacao[_\s]*itens?\b/gi, "Observação dos Itens");

    // (opcional) padronizar “Tanato”
    // repl(/\btanato\b/gi, "Tanatopraxia");

    return texto;
}


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

/** Datas */
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
function formataSeDataIso(v?: string): string {
    if (!v) return ""; // <— garante string
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const dt = new Date(s + "T00:00:00");
        if (!Number.isNaN(dt.getTime())) {
            return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
        }
    }
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
    return s;
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

// >>> IGNORAR LOGS QUE NÃO FORAM DE FATO EDITADOS
function isNoChangeKey(k: string) {
    // aceita "sem_alteracoes", "sem alteracoes", "sem alterações", etc.
    return /^sem[\s_]*alterac(?:o|oe)es?$/i.test((k || "").trim());
}

/** Descobre se o log é "edição sem alterações" (para ocultar) */
function isNoChangeEntry(ent: LogItem): boolean {
    const ac = (ent.acao || "").toLowerCase();
    // só ocultamos edições; criação/atualização de fase continuam visíveis
    if (!ac.includes("editou")) return false;

    const raw = ent.detalhes as any;
    if (!raw) return true;

    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!obj || typeof obj !== "object") return true;

        // 1) flag explícita
        if (asBool((obj as any).sem_alteracoes)) return true;
        if (isNoChangeKey("sem_alteracoes") && asBool((obj as any)["sem_alteracoes"])) return true;

        // 2) varre campos e procura algo realmente informativo
        for (const key of Object.keys(obj)) {
            if (["id", "acao"].includes(key)) continue;

            // arrumacao_json: se houver algum true, houve mudança
            if (/^arruma[cç][aã]o(\s*json|_json)?$/i.test(key)) {
                let aobj: any = obj[key];
                if (typeof aobj === "string") {
                    try { aobj = JSON.parse(aobj); } catch { aobj = {}; }
                }
                if (aobj && typeof aobj === "object") {
                    for (const v of Object.values(aobj)) if (asBool(v)) return false;
                }
                continue;
            }

            // materiais_*_qtd: quantidade (>0) indica mudança
            const m = key.match(/^materiais_(.+?)_qtd$/i);
            if (m) {
                const qtd = obj[key];
                if (qtd != null && String(qtd).trim() !== "" && Number(qtd) > 0) return false;
                continue;
            }

            // campos simples
            const v = obj[key];
            if (v == null) continue;
            if (typeof v === "object") continue;
            if (isNoChangeKey(key) && asBool(v)) continue;
            if (String(v).trim() !== "") return false;
        }

        return true; // nada relevante
    } catch {
        // Detalhes em texto: limpa marcadores e vê se sobra algo
        let s = String(raw || "");
        s = s.replace(/sem[\s_]*alterac(?:o|oe)es?\s*:\s*true/gi, "");
        s = s.replace(/Arruma[cç][aã]o\s*Json\s*:\s*\{[\s\S]*?\}/gi, "");
        s = s.replace(/arruma[cç][aã]o\s*json\s*:[^\n]*/gi, "");
        s = s.replace(/materiais\s*:\s*\[[^\]]*\]/gi, "");
        s = s.trim();
        return s === "";
    }
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
    cadeiras: MATERIAL_LABELS.cadeiras,
    bebedouros: MATERIAL_LABELS.bebedouros,
    suporte_coroa: MATERIAL_LABELS.suporte_coroa,
    kit_lanche: MATERIAL_LABELS.kit_lanche,
    velas: MATERIAL_LABELS.velas,
    tenda: MATERIAL_LABELS.tenda,
    placa: MATERIAL_LABELS.placa,
    paramentacao: MATERIAL_LABELS.paramentacao,
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

/* ======================== RESUMO FINAL APÓS A CONCLUSÃO DO SERVIÇO (helpers) ======================= */
const RESUMO_ORDER = [
    "falecido",
    "contato",
    "religiao",
    "convenio",
    "urna",
    "roupa",
    "assistencia",
    "tanato",
    "local",
    "local_velorio",
    "data_inicio_velorio",
    "hora_inicio_velorio",
    "hora_fim_velorio",
    "data_fim_velorio",
] as const;
type ResumoKey = (typeof RESUMO_ORDER)[number];

function normalizaChave(k: string) {
    return k.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Lê pares chave→valor de um "detalhes" (JSON ou string) para compor o estado final. */
function extrairParesDoDetalhe(raw: any): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw) return out;

    // Tenta tratar como JSON
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && typeof obj === "object") {
            for (const key of Object.keys(obj)) {
                if (["id", "acao", "materiais_json"].includes(key)) continue;
                if (/^arruma[cç][aã]o(\s*json|_json)?$/i.test(key)) continue;
                if (/^materiais_.+?_qtd$/i.test(key)) continue;

                const val = (obj as any)[key];
                if (isNoChangeKey(key) && asBool(val)) continue; // << IGNORA "Sem Alterações: true"
                if (val == null) continue;
                if (typeof val === "object") continue;

                let v = String(val).trim();
                if (!v) continue;

                if (v.startsWith("fase") && FASES_NOMES[v]) v = FASES_NOMES[v];
                v = formataSeDataIso(v);
                v = substituirRotuloVisual(v);

                const nomeVis = overrideCampoNome(key, titleCaseFromSnake(key));
                const kNorm = normalizaChave(nomeVis);
                out[kNorm] = v;
            }
            return out;
        }
    } catch {
        // Fallback: parse "Label: Valor" em texto
        const cleaned = String(raw).replace(/sem[\s_]*alterac(?:o|oe)es?\s*:\s*true/gi, ""); // << remove texto cru
        const txt = substituirRotuloVisual(cleaned);
        const regex = /([\p{L}\d _/.-]+):\s*([^\n]+)/giu;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(txt))) {
            const rot = m[1]?.trim() || "";
            if (isNoChangeKey(rot)) continue; // segurança
            const val = (m[2] || "").trim();
            if (!rot || !val) continue;
            const nomeVis = overrideCampoNome(rot, rot.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()));
            const kNorm = normalizaChave(nomeVis);
            out[kNorm] = formataSeDataIso(val);
        }
    }
    return out;
}

/** Varre o log cronológico, guardando o *último valor* visto de cada campo. */
function montarResumoFinalDoLog(log: LogItem[]) {
    const resumo: Record<string, string> = {};
    const ord = [...log].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));

    for (const ent of ord) {
        const pares = extrairParesDoDetalhe(ent.detalhes);
        for (const [k, v] of Object.entries(pares)) resumo[k] = v;
    }

    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(resumo)) {
        const nomeVis = overrideCampoNome(k, titleCaseFromSnake(k));
        const nomeClean = substituirRotuloVisual(nomeVis);
        result[normalizaChave(nomeClean)] = v;
    }
    return result;
}

/** Último status é fase11/Material Recolhido? */
function estaFinalizado(log: LogItem[]) {
    if (!log?.length) return false;
    const ult = [...log].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || "")).at(-1);
    const s = (ult?.status_novo || "").toLowerCase();
    return s === "fase11" || s === "material recolhido";
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
    // Logs que realmente têm alterações (esconde "editou" sem mudança)
    const logVisiveis = useMemo(() => {
        return (log || []).filter((ent) => !isNoChangeEntry(ent));
    }, [log]);
    const [loadingLog, setLoadingLog] = useState(false);

    const [gerandoPdf, setGerandoPdf] = useState(false);

    // data/hora de criação (primeiro log) do registro selecionado
    const [criacaoSelecionado, setCriacaoSelecionado] = useState<string>("");

    // Cache de data de criação por registro (para mostrar na lista e filtrar)
    const [criacaoMap, setCriacaoMap] = useState<Record<string, string>>({});

    // ===== Novo: estado do Resumo Final
    const [resumoFinal, setResumoFinal] = useState<Record<string, string>>({});
    const [finalizado, setFinalizado] = useState(false);

    // jsPDF via CDN
    useEffect(() => {
        const KEY = "__jspdf_loaded__";
        if ((window as any)[KEY]) return;
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => ((window as any)[KEY] = true);
        document.body.appendChild(script);
    }, []);

    // Carregar Lista
    const carregarFalecidos = useCallback(async () => {
        try {
            setLoadingLista(true);
            const res = await fetch(`${LISTAR_FALECIDOS}&_nocache=${Date.now()}`, { cache: "no-store" });
            const json = await res.json();
            let arr: FalecidoItem[] = [];
            if (json && json.sucesso && json.dados) arr = json.dados;
            else if (Array.isArray(json)) arr = json;
            setLista(arr);
        } catch {
            setLista([]);
        } finally {
            setLoadingLista(false);
        }
    }, []);

    useEffect(() => {
        carregarFalecidos();
        const onVis = () => {
            if (!document.hidden) carregarFalecidos();
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [carregarFalecidos]);

    const paginaDados = useMemo(() => {
        const ini = (pagina - 1) * porPagina;
        return (lista || []).slice(ini, ini + porPagina);
    }, [lista, pagina]);

    const prefetchCriacao = useCallback(
        async (id: string) => {
            if (criacaoMap[id]) return;
            try {
                const res = await fetch(`${LOG_POR_ID(id)}&_nocache=${Date.now()}`, { cache: "no-store" });
                const json = await res.json();
                const arr: LogItem[] = json && json.sucesso && json.dados ? json.dados : Array.isArray(json) ? json : [];
                const ord = (arr || []).slice().sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
                const primeiro = ord[0]?.datahora || "";
                if (primeiro) setCriacaoMap((prev) => ({ ...prev, [id]: primeiro }));
            } catch { }
        },
        [criacaoMap]
    );

    useEffect(() => {
        paginaDados.forEach((it) => prefetchCriacao(String(it.sepultamento_id)));
    }, [paginaDados, prefetchCriacao]);

    const filtrados = useMemo(() => {
        const nome = filtroNome.trim().toLowerCase();
        return (lista || []).filter((reg) => {
            let ok = true;
            if (nome && reg.falecido && !reg.falecido.toLowerCase().includes(nome)) ok = false;

            const id = String(reg.sepultamento_id);
            const dataBase = (criacaoMap[id] || reg.ultima_datahora || "").substring(0, 10);

            if (filtroDe && dataBase && dataBase < filtroDe) ok = false;
            if (filtroAte && dataBase && dataBase > filtroAte) ok = false;
            return ok;
        });
    }, [lista, filtroNome, filtroDe, filtroAte, criacaoMap]);

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));

    useEffect(() => {
        if (pagina > totalPaginas) setPagina(totalPaginas);
        if (pagina < 1) setPagina(1);
    }, [totalPaginas]);

    const selecionarRegistro = useCallback(async (item: FalecidoItem) => {
        setSelecionado(item);
        setLog([]);
        setCriacaoSelecionado("");
        setResumoFinal({});
        setFinalizado(false);
        setLoadingLog(true);
        try {
            const res = await fetch(`${LOG_POR_ID(item.sepultamento_id)}&_nocache=${Date.now()}`, { cache: "no-store" });
            const json = await res.json();
            let arr: LogItem[] = [];
            if (json && json.sucesso && json.dados) arr = json.dados;
            else if (Array.isArray(json)) arr = json;
            const ord = (arr || []).slice().sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
            const primeiro = ord[0]?.datahora || "";
            setCriacaoSelecionado(primeiro);
            if (primeiro) setCriacaoMap((prev) => ({ ...prev, [String(item.sepultamento_id)]: primeiro }));
            setLog(arr || []);

            const fin = estaFinalizado(arr || []);
            setFinalizado(fin);
            setResumoFinal(fin ? montarResumoFinalDoLog(arr || []) : {});
        } catch {
            setLog([]);
        } finally {
            setLoadingLog(false);
        }
    }, []);

    useEffect(() => {
        const fin = estaFinalizado(log || []);
        setFinalizado(fin);
        setResumoFinal(fin ? montarResumoFinalDoLog(log || []) : {});
    }, [log]);

    // Nunito no jsPDF
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
            (doc as any).addFileToVFS("Nunito-Regular.ttf", regB64);
            (doc as any).addFont("Nunito-Regular.ttf", "Nunito", "normal");
            (doc as any).addFileToVFS("Nunito-Bold.ttf", boldB64);
            (doc as any).addFont("Nunito-Bold.ttf", "Nunito", "bold");
            nunitoStateRef.current = "ok";
            return true;
        } catch {
            nunitoStateRef.current = "fail";
            return false;
        }
    }

    // === Helpers de desenho para o PDF ===
    function ensurePageSpace(doc: any, y: number, needed: number, marginTop = 22) {
        const pageH = doc.internal.pageSize.getHeight();
        if (y + needed > pageH - 20) {
            doc.addPage();
            return marginTop;
        }
        return y;
    }

    function textHeight(doc: any, text: string | string[], maxWidth: number, lineGap = 4) {
        const lines = Array.isArray(text) ? text : doc.splitTextToSize(String(text || ""), maxWidth);
        const h = lines.length * lineGap;
        return { lines, h };
    }

    function drawCard(
        doc: any,
        x: number,
        y: number,
        w: number,
        label: string,
        value: string,
        fonts: { normal: [string, string]; title: [string, string] }
    ) {
        const padX = 4;
        const padY = 4;

        doc.setFont(fonts.normal[0], fonts.normal[1]);
        doc.setFontSize(8.5);
        const { lines: labelLines, h: hLabel } = textHeight(doc, label, w - padX * 2, 3.8);

        // valor (destaque)
        doc.setFont(fonts.title[0], fonts.title[1]);
        doc.setFontSize(11);
        const { lines: valueLines, h: hValue } = textHeight(doc, value, w - padX * 2, 5);

        const innerH = hLabel + 2 + hValue;
        const cardH = innerH + padY * 2;

        // container
        doc.setDrawColor(210);
        doc.setFillColor(248, 250, 252);
        (doc as any).roundedRect(x, y, w, cardH, 2.5, 2.5, "DF");

        // conteúdo
        let yy = y + padY;

        doc.setTextColor(120);
        doc.setFont(fonts.normal[0], fonts.normal[1]);
        doc.setFontSize(8.5);
        doc.text(labelLines, x + padX, yy + 3.5);
        yy += hLabel + 2;

        doc.setTextColor(20);
        doc.setFont(fonts.title[0], fonts.title[1]);
        doc.setFontSize(11);
        doc.text(valueLines, x + padX, yy + 4.5);

        return cardH;
    }

    // Exportar PDF
    const exportarPdf = useCallback(async () => {
        if (!selecionado || logVisiveis.length === 0) return;

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

            if (criacaoSelecionado) {
                doc.setFont(normalFont[0], normalFont[1]);
                doc.setFontSize(10);
                doc.text(`Criado em: ${formataDataDia(criacaoSelecionado)}`, pageW / 2, y, { align: "center" });
                y += 6;
            }

            // Resumo Final (se finalizado)
            const fin = estaFinalizado(log);
            const resumo = fin ? montarResumoFinalDoLog(log) : null;

            if (resumo && Object.keys(resumo).length) {
                doc.setFont(titleFont[0], titleFont[1]);
                doc.setFontSize(12.5);
                doc.text("Relatório Final", marginL, y);
                y += 5;

                const pairs: Array<[string, string]> = [];
                for (const k of RESUMO_ORDER) {
                    const v = resumo[k];
                    if (v) pairs.push([substituirRotuloVisual(overrideCampoNome(k, titleCaseFromSnake(k))).toUpperCase(), String(v)]);
                }
                for (const [k, v] of Object.entries(resumo)) {
                    if (!RESUMO_ORDER.includes(k as ResumoKey) && v) {
                        pairs.push([substituirRotuloVisual(overrideCampoNome(k, titleCaseFromSnake(k))).toUpperCase(), String(v)]);
                    }
                }

                const gap = 4;
                const colW = (contentW - gap) / 2;

                doc.setFont(normalFont[0], normalFont[1]);
                let cursorX = marginL;
                let cursorY = y;

                for (let i = 0; i < pairs.length; i++) {
                    const [label, value] = pairs[i];

                    doc.setFont(normalFont[0], normalFont[1]);
                    doc.setFontSize(8.5);
                    const labelH = textHeight(doc, label, colW - 8, 3.8).h;
                    doc.setFont(titleFont[0], titleFont[1]);
                    doc.setFontSize(11);
                    const valueH = textHeight(doc, value, colW - 8, 5).h;

                    const cardH = labelH + 2 + valueH + 8;
                    cursorY = ensurePageSpace(doc, cursorY, cardH);

                    const used = drawCard(doc, cursorX, cursorY, colW, label, value, { normal: normalFont, title: titleFont });

                    if (cursorX === marginL) {
                        cursorX = marginL + colW + gap;
                    } else {
                        cursorX = marginL;
                        cursorY += used + 3;
                    }
                }

                if (cursorX !== marginL) cursorY += 8;

                y = cursorY + 4;
            }

            const cardPadX = 6;
            const cardPadY = 6;

            const writeLine = (text: string | string[], x: number, yy: number, size = 11, bold = false) => {
                doc.setFont(bold ? titleFont[0] : normalFont[0], bold ? titleFont[1] : normalFont[1]);
                doc.setFontSize(size);
                if (Array.isArray(text)) doc.text(text, x, yy);
                else doc.text(text, x, yy);
            };

            for (const ent of logVisiveis) {
                const dataLine = formataDataHora(ent.datahora) || "";
                const acao = capitalize(ent.acao || "");
                const statusTxt = ent.status_novo ? traduzirFase(ent.status_novo) : "";
                const acaoFull = statusTxt ? `${acao} — ${statusTxt}` : acao;
                const usuarioLine = ent.usuario ? `Usuário: ${ent.usuario}` : "";

                const detalhesLines: string[] = [];
                const raw = ent.detalhes as any;

                const materiaisLines: string[] = [];

                try {
                    const obj = raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);
                    if (obj && typeof obj === "object") {
                        for (const key of Object.keys(obj)) {
                            if (["materiais_json", "id", "acao"].includes(key)) continue;

                            // Arrumação
                            if (/^arrum[aã]cao(\s*json|_json)?$/i.test(key)) {
                                let aobj: any = {};
                                const val = obj[key];
                                if (typeof val === "string") {
                                    try {
                                        aobj = JSON.parse(val);
                                    } catch {
                                        aobj = {};
                                    }
                                } else if (typeof val === "object" && val) {
                                    aobj = val;
                                }
                                for (const [k, v] of Object.entries(aobj)) {
                                    if (asBool(v)) detalhesLines.push(`${titleCaseFromSnake(k)}: Sim`);
                                }
                                continue;
                            }

                            // Materiais_*_qtd
                            const m = key.match(/^materiais_(.+?)_qtd$/i);
                            if (m) {
                                const nomeBase = titleCaseFromSnake(m[1]);
                                const nome = overrideCampoNome(m[1], nomeBase);
                                const qtd = obj[key];
                                if (qtd != null && String(qtd).trim() !== "") materiaisLines.push(`${nome}: ${String(qtd)}`);
                                continue;
                            }

                            // Campos simples
                            if (typeof obj[key] === "object" && !Array.isArray(obj[key])) continue;
                            let v = obj[key];
                            if (v == null || String(v).trim() === "") continue;

                            // IGNORAR "Sem Alterações: true"
                            if (isNoChangeKey(key) && asBool(v)) continue;

                            let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                            nome = overrideCampoNome(key, nome);
                            v = String(v);
                            if (v.startsWith("fase") && FASES_NOMES[v]) v = FASES_NOMES[v];
                            v = formataSeDataIso(v);
                            nome = substituirRotuloVisual(nome);
                            v = substituirRotuloVisual(v);
                            detalhesLines.push(`${nome}: ${v}`);
                        }
                    }
                } catch {
                    let detalhesRaw = String(raw || "");
                    detalhesRaw = detalhesRaw.replace(/Arruma[cç][aã]o\s*Json\s*:\s*\{[\s\S]*?\}/gi, "");
                    detalhesRaw = detalhesRaw.replace(/arruma[cç][aã]o\s*json\s*:[^\n]*/gi, "");
                    detalhesRaw = detalhesRaw.replace(/materiais\s*:\s*\[[^\]]*\]/gi, "");
                    detalhesRaw = detalhesRaw.replace(/sem[\s_]*alterac(?:o|oe)es?\s*:\s*true/gi, ""); // << remove texto cru
                    Object.keys(FASES_NOMES).forEach((cod) => {
                        const faseNome = FASES_NOMES[cod];
                        const regEx = new RegExp(cod, "g");
                        detalhesRaw = detalhesRaw.replace(regEx, faseNome);
                    });
                    detalhesRaw = substituirRotuloVisual(detalhesRaw);
                    if (detalhesRaw.trim()) detalhesLines.push(detalhesRaw.trim());
                }

                if (materiaisLines.length) {
                    detalhesLines.unshift("Materiais:");
                    for (const l of materiaisLines) detalhesLines.push(`• ${l}`);
                }

                // ---- Render do card ----
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
                const cardH = innerHeight + 2 * cardPadY;

                if (y + cardH + 8 > pageH) {
                    doc.addPage();
                    y = 22;
                }

                doc.setDrawColor(210);
                doc.setLineWidth(0.25);
                (doc as any).roundedRect(marginL, y, contentW, cardH, 3, 3);

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

            const filename = `${String(selecionado.falecido || "").toUpperCase()}.pdf`;
            doc.save(filename);
        } catch (err) {
            console.error("Falha ao gerar PDF:", err);
            alert("Não consegui gerar o PDF agora. Veja o console para detalhes.");
        } finally {
            setGerandoPdf(false);
        }
    }, [selecionado, logVisiveis, criacaoSelecionado]);

    /* =========================== ANÁLISE GERAL =========================== */
    const [analiseOpen, setAnaliseOpen] = useState(false);
    const [loadingAnalise, setLoadingAnalise] = useState(false);
    const [dadosAnalise, setDadosAnalise] = useState<RegistroAnalise[]>([]);
    const [aDe, setADe] = useState("");
    const [aAte, setAAte] = useState("");
    type SelectedItem = "ALL" | AllItemKey;
    const [selectedItem, setSelectedItem] = useState<SelectedItem>("ALL");
    const [somenteTanato, setSomenteTanato] = useState(false);
    const [logsCache, setLogsCache] = useState<Record<string, LogItem[]>>({});

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

    async function carregarLogsParaAnalise(regs: RegistroAnalise[], maxConc = 5) {
        const ids = regs.map((r) => String(r.id ?? (r as any).sepultamento_id ?? "")).filter(Boolean);
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

    useEffect(() => {
        if (!analiseOpen || dadosAnalise.length === 0) return;
        carregarLogsParaAnalise(dadosAnalise);
    }, [analiseOpen, dadosAnalise, aDe, aAte]);

    function dataDia(s?: string) {
        return (s || "").slice(0, 10);
    }
    function estaNoPeriodo(datahora?: string) {
        const d = dataDia(datahora);
        if (aDe && d && d < aDe) return false;
        if (aAte && d && d > aAte) return false;
        return true;
    }
    function dataPreferidaRegistro(r: RegistroAnalise) {
        return r.data_inicio_velorio || r.data || "";
    }

    const registrosBaseConsiderados = useMemo(() => {
        if (!somenteTanato) return dadosAnalise;
        return dadosAnalise.filter((r) => normSimNao(r.tanato) === "sim");
    }, [dadosAnalise, somenteTanato]);

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
                                {filtrados.slice((pagina - 1) * porPagina, (pagina - 1) * porPagina + porPagina).map((item) => {
                                    const id = String(item.sepultamento_id);
                                    const criacao = criacaoMap[id];
                                    return (
                                        <li key={item.sepultamento_id}>
                                            <button
                                                type="button"
                                                onClick={() => selecionarRegistro(item)}
                                                className={`group flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition hover:bg-muted/40 ${selecionado?.sepultamento_id === item.sepultamento_id ? "border-primary/60 bg-primary/5" : ""
                                                    }`}
                                            >
                                                <span className="font-medium">{item.falecido}</span>
                                                <span className="text-xs text-muted-foreground">{criacao ? formataDataHora(criacao) : "—"}</span>
                                            </button>
                                        </li>
                                    );
                                })}
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
                            {criacaoSelecionado && (
                                <div className="text-xs text-muted-foreground">
                                    Criado em: <b>{formataDataHora(criacaoSelecionado)}</b>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={exportarPdf}
                            disabled={!selecionado || logVisiveis.length === 0 || gerandoPdf}
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
                        ) : logVisiveis.length === 0 ? (
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhum log encontrado para este registro.</div>
                        ) : (
                            <div className="space-y-3">
                                {logVisiveis.map((ent, i) => {
                                    // Render dos detalhes (JSON ou texto)
                                    let detalhesHtml = "";
                                    const raw = ent.detalhes as any;

                                    try {
                                        const obj = raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, any>) : (raw as Record<string, any>);
                                        if (obj && typeof obj === "object") {
                                            const chips: string[] = [];
                                            const arrSet = new Set<string>();

                                            for (const key of Object.keys(obj)) {
                                                if (["materiais_json", "id", "acao"].includes(key)) continue;

                                                // Arrumação
                                                if (/^arrum[aã]cao(\s*json|_json)?$/i.test(key)) {
                                                    const aobj = obj[key] || {};
                                                    for (const [k, v] of Object.entries(aobj)) if (asBool(v)) arrSet.add(`✅ ${titleCaseFromSnake(k)}`);
                                                    continue;
                                                }

                                                // Materiais_*_qtd
                                                const m = key.match(/^materiais_(.+?)_qtd$/i);
                                                if (m) {
                                                    const valRaw = obj[key];
                                                    if (valRaw != null && String(valRaw).trim() !== "") {
                                                        const nomeBase = titleCaseFromSnake(m[1]);
                                                        const nome = overrideCampoNome(m[1], nomeBase);
                                                        const valFmt = formataSeDataIso(String(valRaw));
                                                        chips.push(
                                                            `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2"><b>${sanitize(
                                                                nome
                                                            )}:</b> ${sanitize(String(valFmt))}</span>`
                                                        );
                                                    }
                                                    continue;
                                                }

                                                // Campos simples
                                                if (typeof obj[key] === "object" && !Array.isArray(obj[key])) continue;
                                                let val = obj[key];
                                                if (val == null || String(val).trim() === "") continue;
                                                if (isNoChangeKey(key) && asBool(val)) continue;
                                                let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                                                nome = overrideCampoNome(key, nome);
                                                val = String(val);
                                                if (val.startsWith("fase") && FASES_NOMES[val]) val = FASES_NOMES[val];
                                                val = formataSeDataIso(val);
                                                nome = substituirRotuloVisual(nome);
                                                val = substituirRotuloVisual(val);
                                                

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
                                        detalhesRaw = detalhesRaw.replace(/sem[\s_]*alterac(?:o|oe)es?\s*:\s*true/gi, "");
                                        detalhesRaw = detalhesRaw.replace(/Arruma[cç][aã]o\s*Json\s*:\s*\{[\s\S]*?\}/gi, "");
                                        detalhesRaw = detalhesRaw.replace(/arruma[cç][aã]o\s*json\s*:[^\n]*/gi, "");
                                        detalhesRaw = detalhesRaw.replace(/materiais\s*:\s*\[[^\]]*\]/gi, "");
                                        Object.keys(FASES_NOMES).forEach((cod) => {
                                            const faseNome = FASES_NOMES[cod];
                                            const regEx = new RegExp(cod, "g");
                                            detalhesRaw = detalhesRaw.replace(regEx, faseNome);
                                        });
                                        detalhesRaw = substituirRotuloVisual(detalhesRaw);
                                        if (detalhesRaw.trim()) detalhesHtml = `<div class="mt-2 text-sm">${sanitize(detalhesRaw)}</div>`;
                                    }

                                    const acao = ent.acao ? sanitize(capitalize(ent.acao)) : "";
                                    const statusBadg = ent.status_novo
                                        ? `<span class="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">${sanitize(
                                            traduzirFase(ent.status_novo)
                                        )}</span>`
                                        : "";

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
                              <div class="text-sm">${acao} ${statusBadg}</div>
                              <div class="text-xs text-muted-foreground">Usuário: ${sanitize(ent.usuario || "")}</div>
                              ${detalhesHtml}
                            </div>
                          </div>
                        `,
                                            }}
                                        />
                                    );
                                })}

                                {/* ==== RESUMO FINAL VISUAL (exibido somente quando finalizado) ==== */}
                                {finalizado && Object.keys(resumoFinal).length > 0 && (
                                    <div className="rounded-xl border bg-emerald-50/60 p-4">
                                        <div className="mb-2 text-sm font-semibold text-emerald-900">Relatório Final (Após Conclusão do Serviço)</div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {/* Ordem priorizada */}
                                            {RESUMO_ORDER.map((k) => {
                                                const kk = k as string;                 // ajuda a inferência
                                                const v: string = resumoFinal[kk] ?? ""; // <- garante string
                                                if (!v) return null;
                                                return (
                                                    <div key={kk} className="rounded-lg border bg-white/60 px-3 py-2">
                                                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                            {substituirRotuloVisual(overrideCampoNome(kk, titleCaseFromSnake(kk)))}
                                                        </div>
                                                        <div className="text-sm font-medium">{v}</div>
                                                    </div>
                                                );
                                            })}
                                            {/* Demais campos que porventura não estão na ordem priorizada */}
                                            {(Object.entries(resumoFinal) as Array<[string, string | undefined]>)
                                                .filter(([k]) => !RESUMO_ORDER.includes(k as ResumoKey))
                                                .map(([k, v]) => {
                                                    const vv: string = v ?? "";
                                                    if (!vv) return null;
                                                    return (
                                                        <div key={k} className="rounded-lg border bg-white/60 px-3 py-2">
                                                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                                                {substituirRotuloVisual(overrideCampoNome(k, titleCaseFromSnake(k)))}
                                                            </div>
                                                            <div className="text-sm font-medium">{vv}</div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}
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
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setAnaliseOpen(false);
                    }}
                >
                    <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border bg-white shadow-xl">
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

                        <div className="h-[calc(90vh-56px)] overflow-auto">
                            <div className="grid gap-3 p-4 md:grid-cols-4">
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Data inicial</span>
                                    <input type="date" value={aDe} onChange={(e) => setADe(e.target.value)} className="input" />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">Data final</span>
                                    <input type="date" value={aAte} onChange={(e) => setAAte(e.target.value)} className="input" />
                                </label>

                                <label className="flex items-center gap-2 md:col-span-2">
                                    <input type="checkbox" className="h-4 w-4" checked={somenteTanato} onChange={(e) => setSomenteTanato(e.target.checked)} />
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

                            {somenteTanato && (
                                <div className="px-4 pt-3">
                                    <div className="rounded-lg border p-3">
                                        <div className="text-sm font-semibold">
                                            Serviços com Tanatopraxia no período: <span className="font-bold">{listaTanatoPeriodo.length}</span>
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

                            <div className="p-4">
                                {dadosAnalise.length === 0 ? (
                                    <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Sem dados para análise no momento.</div>
                                ) : rows.length === 0 ? (
                                    <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhum item consumido no período selecionado.</div>
                                ) : (
                                    <>
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