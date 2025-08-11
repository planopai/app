"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    IconFilter,
    IconCalendar,
    IconUser,
    IconChevronLeft,
    IconChevronRight,
    IconListDetails,
    IconPrinter,
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

/* ========================== Endpoints (proxy) ========================= */
const LISTAR_FALECIDOS = "/api/php/historico_sepultamentos.php?listar_falecidos=1";
const LOG_POR_ID = (id: string) =>
    `/api/php/historico_sepultamentos.php?log=1&id=${encodeURIComponent(id)}`;

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

    // ---------- imprimir/salvar em PDF via print() ----------
    const imprimirPdf = useCallback(() => {
        if (!selecionado) return;
        const area = document.getElementById("logAreaExport");
        if (!area) return;

        // Clona o conteúdo a imprimir
        const clone = area.cloneNode(true) as HTMLElement;

        // Janela de impressão
        const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
        if (!w) return;

        // Mapeia as variáveis de cor (todas em HEX/RGB, sem oklch)
        const VARS: Record<string, string> = {
            "--background": "#ffffff",
            "--foreground": "#111827",
            "--card": "#ffffff",
            "--card-foreground": "#111827",
            "--popover": "#ffffff",
            "--popover-foreground": "#111827",
            "--primary": "#0ea5e9",
            "--primary-foreground": "#ffffff",
            "--secondary": "#f3f4f6",
            "--secondary-foreground": "#111827",
            "--muted": "#f3f4f6",
            "--muted-foreground": "#6b7280",
            "--accent": "#f3f4f6",
            "--accent-foreground": "#111827",
            "--destructive": "#ef4444",
            "--border": "#e5e7eb",
            "--input": "#e5e7eb",
            "--ring": "#e5e7eb",
            // extras usadas pelo seu layout
            "--sidebar": "#f8fafc",
            "--sidebar-foreground": "#111827",
            "--sidebar-border": "#e5e7eb",
            "--sidebar-primary": "#0ea5e9",
            "--sidebar-primary-foreground": "#ffffff",
            "--sidebar-accent": "#f3f4f6",
            "--sidebar-accent-foreground": "#111827",
        };

        // CSS mínimo e seguro (sem oklch)
        const css = `
      @page { size: A4; margin: 14mm; }
      :root { ${Object.entries(VARS).map(([k, v]) => `${k}:${v};`).join("")} }
      * { box-sizing: border-box; }
      body {
        margin: 0; font-family: "Nunito", system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
        color: var(--foreground); background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      h1,h2,h3 { margin: 0 0 8px; }
      .log-entry { border: 1px solid var(--border); border-radius: 12px; background: #fff; padding: 12px; }
      .log-entry + .log-entry { margin-top: 10px; }
      .chip { display: inline-block; border: 1px solid var(--border); border-radius: 9999px; padding: 2px 8px; font-size: 12px; }
      .muted { color: #6b7280; }
      .title { text-align:center; margin-top:0; font-size: 18px; font-weight: 900; }
      .subtitle { text-align:center; color:#059cdf; font-weight:700; margin-bottom: 10px; }
      /* remove qualquer gradient/sombra residual */
      * { background-image: none !important; box-shadow: none !important; filter: none !important; }
    `;

        // Template HTML do print
        const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Histórico dos Sepultamentos</title>
<style>${css}</style>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;900&display=swap" rel="stylesheet">
</head>
<body>
  <h2 class="title">Histórico dos Sepultamentos</h2>
  <div class="subtitle">${sanitize(selecionado.falecido)}</div>
  <div id="print-root"></div>
  <script>
    // chama impressão quando carregar
    window.addEventListener('load', () => {
      setTimeout(() => { window.print(); setTimeout(() => window.close(), 300); }, 200);
    });
  </script>
</body>
</html>`;

        w.document.open();
        w.document.write(html);
        w.document.close();

        // injeta o conteúdo clonado
        const tryAppend = () => {
            const root = w.document.getElementById("print-root");
            if (root) {
                root.appendChild(clone);
            } else {
                setTimeout(tryAppend, 20);
            }
        };
        tryAppend();
    }, [selecionado]);

    /* ================================ UI ================================ */
    return (
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Histórico dos Sepultamentos</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Busque pelo nome, filtre por data e visualize o histórico completo. Imprima/Salve em PDF quando quiser.
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
                            onClick={imprimirPdf}
                            disabled={!selecionado || log.length === 0}
                            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold border-primary text-primary hover:bg-primary/5 disabled:opacity-50"
                            title="Imprimir / Salvar PDF"
                        >
                            <IconPrinter className="size-5" />
                            Imprimir / Salvar PDF
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
                                    // ------- Monta chips de detalhes (esconde JSON cru de materiais) --------
                                    let detalhesHtml = "";
                                    const raw = ent.detalhes;

                                    try {
                                        const obj =
                                            raw && typeof raw === "string"
                                                ? (JSON.parse(raw) as Record<string, any>)
                                                : (raw as Record<string, any>);

                                        if (obj && typeof obj === "object") {
                                            const partes: string[] = [];

                                            for (const key in obj) {
                                                if (key === "materiais_json") continue;

                                                if (key === "materiais_cadeiras_qtd" || key === "materiais_bebedouros_qtd") {
                                                    const nome =
                                                        key === "materiais_cadeiras_qtd" ? "Materiais Cadeiras Qtd" : "Materiais Bebedouros Qtd";
                                                    const val = obj[key];
                                                    if (val != null && String(val).trim() !== "") {
                                                        partes.push(
                                                            `<span class="chip"><b>${nome}:</b> ${sanitize(String(val))}</span>`
                                                        );
                                                    }
                                                    continue;
                                                }

                                                if (key === "id" || key === "acao") continue;
                                                let val = obj[key];
                                                if (val == null || String(val).trim() === "") continue;

                                                let nome = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
                                                val = String(val);
                                                if (val.startsWith("fase") && FASES_NOMES[val]) val = FASES_NOMES[val];

                                                partes.push(`<span class="chip"><b>${nome}:</b> ${sanitize(val)}</span>`);
                                            }

                                            if (partes.length) detalhesHtml = `<div class="mt-2">${partes.join(" ")}</div>`;
                                        }
                                    } catch {
                                        let detalhesRaw = String(raw || "");
                                        Object.keys(FASES_NOMES).forEach((cod) => {
                                            const faseNome = FASES_NOMES[cod];
                                            const regEx = new RegExp(cod, "g");
                                            detalhesRaw = detalhesRaw.replace(regEx, faseNome);
                                        });
                                        if (/^\s*\{/.test(detalhesRaw) && /materiais_json/i.test(detalhesRaw)) {
                                            detalhesRaw = "";
                                        }
                                        if (detalhesRaw.trim()) {
                                            detalhesHtml = `<div class="mt-2">${sanitize(detalhesRaw)}</div>`;
                                        }
                                    }

                                    return (
                                        <div
                                            key={i}
                                            className="log-entry"
                                            // eslint-disable-next-line react/no-danger
                                            dangerouslySetInnerHTML={{
                                                __html: `
                          <div style="display:flex; gap:12px;">
                            <div style="font-size:20px; line-height:1;">${iconeAcao(ent.acao, ent.status_novo)}</div>
                            <div style="flex:1;">
                              <div class="muted" style="font-size:12px;">${formataDataHora(ent.datahora)}</div>
                              <div style="font-size:14px; margin:2px 0 4px 0;">
                                ${ent.acao ? sanitize(ent.acao[0].toUpperCase() + ent.acao.slice(1)) : ""}
                                ${ent.status_novo
                                                        ? ` <span style="background: rgba(14,165,233,.1); color:#0ea5e9; border-radius:6px; padding:2px 6px; font-size:11px; font-weight:700;">${sanitize(
                                                            traduzirFase(ent.status_novo)
                                                        )}</span>`
                                                        : ""
                                                    }
                              </div>
                              <div class="muted" style="font-size:12px;">Usuário: ${sanitize(ent.usuario || "")}</div>
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
