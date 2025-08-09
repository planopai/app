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
} from "@tabler/icons-react";

// ===== Tipos
interface FalecidoItem {
    sepultamento_id: string;
    falecido: string;
    ultima_datahora?: string; // "YYYY-MM-DD HH:mm:ss"
    [key: string]: any;
}
interface LogItem {
    datahora?: string; // "YYYY-MM-DD HH:mm:ss"
    acao?: string;
    usuario?: string;
    status_novo?: string;
    detalhes?: string | Record<string, string>;
    [key: string]: any;
}

// ===== Mapeamentos e utils
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
        if (statusNovo === "clinica") return "🏥";
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
    return String(txt).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ===== Endpoints PHP (use um proxy /api/php/... se estiver em outro domínio)
const LISTAR_FALECIDOS = "/historico_sepultamentos.php?listar_falecidos=1";
const LOG_POR_ID = (id: string) => `/historico_sepultamentos.php?log=1&id=${encodeURIComponent(id)}`;

// ===== Página
export default function HistoricoSepultamentosPage() {
    // Tema sincronizado com localStorage 'pai-theme'
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

    // Carrega html2pdf por CDN (garante download funcionar)
    const html2pdfLoadedRef = useRef(false);
    useEffect(() => {
        if (html2pdfLoadedRef.current) return;
        const script = document.createElement("script");
        script.src =
            "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
        script.async = true;
        script.onload = () => {
            html2pdfLoadedRef.current = true;
        };
        document.body.appendChild(script);
        return () => {
            document.body.removeChild(script);
        };
    }, []);

    // Carrega falecidos
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

    // Seleciona e carrega log
    const selecionarRegistro = useCallback(async (item: FalecidoItem) => {
        setSelecionado(item);
        setLog([]);
        setLoadingLog(true);
        try {
            const res = await fetch(`${LOG_POR_ID(item.sepultamento_id)}&_nocache=${Date.now()}`, { cache: "no-store" });
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

    // Exporta PDF
    const exportarPdf = useCallback(() => {
        if (!selecionado) return;
        const anyWin = window as any;
        if (!anyWin.html2pdf) {
            alert("Ferramenta de PDF ainda carregando. Tente novamente em 2 segundos.");
            return;
        }

        // Clona a área do log e força fundo branco
        const exportNode = document.getElementById("logAreaExport");
        if (!exportNode) return;

        const wrapper = document.createElement("div");
        wrapper.style.fontFamily = "'Nunito', sans-serif";
        wrapper.style.fontSize = "1.01rem";
        wrapper.style.padding = "20px 8px 18px 8px";
        wrapper.style.maxWidth = "680px";
        wrapper.innerHTML = `<h2 style="text-align:center;margin-top:0;font-size:1.32em;font-weight:900;">
      Histórico dos Sepultamentos<br/>
      <span style="font-size:.91em;font-weight:700;color:#059cdf">${sanitize(selecionado.falecido)}</span>
    </h2>`;

        const clone = exportNode.cloneNode(true) as HTMLElement;
        clone.style.boxShadow = "none";
        clone.style.background = "#fff";
        clone.querySelectorAll<HTMLElement>(".log-entry").forEach((e) => (e.style.background = "#fff"));
        wrapper.appendChild(clone);

        anyWin.html2pdf(wrapper, {
            margin: [18, 16, 38, 16],
            filename: `historico_sepultamento_${(sanitize(selecionado.falecido) || "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")}.pdf`,
            image: { type: "jpeg", quality: 0.97 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: "#fff", scrollY: 0 },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        });
    }, [selecionado]);

    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            {/* Título */}
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Histórico dos Sepultamentos</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Busque pelo nome, filtre por data e visualize o histórico completo. Baixe em PDF quando quiser.
                </p>
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

            {/* Conteúdo: lista + log */}
            <div className="mt-5 grid gap-4 md:grid-cols-[1fr,2fr]">
                {/* Lista de falecidos */}
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
                                            <span className="text-xs text-muted-foreground">
                                                {formataDataHora(item.ultima_datahora)}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {/* Paginação */}
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

                {/* Log selecionado */}
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
                            disabled={!selecionado || log.length === 0}
                            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold border-primary text-primary hover:bg-primary/5 disabled:opacity-50"
                            title="Baixar PDF"
                        >
                            <IconDownload className="size-5" />
                            Baixar PDF
                        </button>
                    </div>

                    <div className="p-4" id="logAreaExport">
                        {!selecionado ? (
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                                Selecione um registro para visualizar o histórico completo.
                            </div>
                        ) : loadingLog ? (
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                                Carregando histórico...
                            </div>
                        ) : log.length === 0 ? (
                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                                Nenhum log encontrado para este registro.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {log.map((ent, i) => {
                                    // Monta detalhes
                                    let detalhesHtml = "";
                                    const raw = ent.detalhes;
                                    try {
                                        const obj =
                                            raw && typeof raw === "string" ? (JSON.parse(raw) as Record<string, string>) : (raw as Record<string, string>);
                                        if (obj && typeof obj === "object") {
                                            const partes: string[] = [];
                                            for (const key in obj) {
                                                if (key === "id" || key === "acao") continue;
                                                let val = obj[key];
                                                if (!val || typeof val !== "string" || !val.trim()) continue;
                                                let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                                                if (val.startsWith && val.startsWith("fase") && FASES_NOMES[val]) val = FASES_NOMES[val];
                                                partes.push(
                                                    `<span class="inline-block rounded border px-2 py-1 text-xs mr-2 mb-2"><b>${nome}:</b> ${sanitize(
                                                        val
                                                    )}</span>`
                                                );
                                            }
                                            if (partes.length) detalhesHtml = `<div class="mt-2">${partes.join("")}</div>`;
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
                              ${ent.acao ? sanitize(ent.acao[0].toUpperCase() + ent.acao.slice(1)) : ""}
                              ${ent.status_novo
                                                        ? ` <span class="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">${sanitize(
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
        </div>
    );
}
