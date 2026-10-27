"use client";

/**
 * Leads do Velório Online (/leads).
 *
 * 27/10/2026 (visual novo, só front; mesmo obter_leads.php):
 * - cabeçalho com resumo (total, últimos 30 dias, estados);
 * - busca por nome, cidade, estado ou telefone; filtros de período (usa data_registro, que o servidor já
 *   devolvia) e de estado (nomes e siglas juntos: "Pr", "Parana" e "Paraná" viram PR);
 * - ordem: mais recentes (padrão), nome A–Z ou cidade;
 * - computador em tabela, celular em cartão; telefone formatado com botão do WhatsApp;
 * - seleção com barra fixa (Exportar selecionados / Limpar) e "Exportar" do que está filtrado;
 * - CSV com ";" e acentos certos para abrir direto no Excel, com a data de registro;
 * - paginação com total e registros por página. Sem alert(): avisos na própria tela.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    IconBrandWhatsapp,
    IconChevronLeft,
    IconChevronRight,
    IconChevronsLeft,
    IconChevronsRight,
    IconDownload,
    IconRefresh,
    IconSearch,
    IconX,
} from "@tabler/icons-react";

/* ============================== tipos ============================== */

type ApiLead = {
    id: number | string;
    nome: string | null;
    pais: string | null;
    estado: string | null;
    cidade: string | null;
    telefone: string | null;
    data_registro?: string | null;
};

type Lead = {
    id: number;
    nome: string;
    pais: string;
    estado: string;
    uf: string;
    cidade: string;
    telefone: string;
    foneDigitos: string;
    registro: Date | null;
    registroTxt: string;
    busca: string;
};

const ENDPOINT = "https://api.planoassistencialintegrado.com.br/obter_leads.php";

/* ============================== utilidades ============================== */

const semAcento = (s: string) =>
    String(s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim();

const UFS: Record<string, string> = {
    acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF",
    "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
    "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI",
    "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
    "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
const SIGLAS = new Set(Object.values(UFS));

/** "Paraná", "Parana", "Pr" e "PR" viram "PR". Fora do Brasil ou desconhecido: o texto como veio. */
function paraUF(estado: string): string {
    const e = semAcento(estado);
    if (!e) return "";
    if (UFS[e]) return UFS[e];
    const up = e.toUpperCase();
    if (up.length === 2 && SIGLAS.has(up)) return up;
    return estado.trim();
}

function digitos(s: string) {
    return String(s || "").replace(/\D/g, "");
}

/** Telefone do Brasil formatado; outros formatos ficam como vieram. */
function formataFone(bruto: string): { texto: string; whats: string | null } {
    let d = digitos(bruto);
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
    if (d.length === 11) return { texto: `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`, whats: `55${d}` };
    if (d.length === 10) return { texto: `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`, whats: `55${d}` };
    return { texto: String(bruto || "").trim() || "—", whats: null };
}

function parseData(s?: string | null): Date | null {
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d.getTime()) ? null : d;
}

const p2 = (n: number) => String(n).padStart(2, "0");
function dataCurta(d: Date | null) {
    if (!d) return "—";
    const ano = d.getFullYear() !== new Date().getFullYear() ? `/${d.getFullYear()}` : "";
    return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}${ano}`;
}
function dataCompleta(d: Date | null) {
    if (!d) return "";
    return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Primeira letra de cada palavra maiúscula, só para exibir (o CSV leva o texto original). */
function capitaliza(s: string) {
    const minusculas = new Set(["da", "de", "do", "das", "dos", "e"]);
    return String(s || "")
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join(" ");
}

function lugar(l: Lead) {
    return [l.cidade ? capitaliza(l.cidade) : "", l.uf].filter(Boolean).join(" · ") || "—";
}

/* CSV para o Excel do Brasil: separador ";" e BOM para os acentos. */
function csvCampo(v: string) {
    return `"${String(v ?? "").replace(/"/g, '""')}"`;
}
function baixarCSV(nome: string, leads: Lead[]) {
    const cab = ["Nome Completo", "País", "Estado", "Cidade", "Telefone", "Data de registro"];
    const linhas = leads.map((l) => [l.nome, l.pais, l.estado, l.cidade, l.telefone, l.registroTxt].map(csvCampo).join(";"));
    const blob = new Blob(["﻿" + [cab.map(csvCampo).join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function hojeArquivo() {
    const d = new Date();
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/* ============================== estilos ============================== */

const CAMPO =
    "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334] dark:text-white";
const BTN_SEC =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3.5 text-[14px] font-extrabold text-[#313C55] transition hover:border-[#313C55] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white";
const CARTAO = "rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]";
const CHECK = "size-5 cursor-pointer accent-[#313C55] dark:accent-[#3D6A99]";

type Periodo = "todos" | "7" | "30" | "mes";
const PERIODOS: [Periodo, string][] = [
    ["todos", "Todo o período"],
    ["7", "7 dias"],
    ["30", "30 dias"],
    ["mes", "Este mês"],
];
type Ordem = "recentes" | "nome" | "cidade";

/* ============================== peças ============================== */

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={ativo}
            className={[
                "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xl border px-3.5 text-[14px] font-bold transition",
                ativo
                    ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                    : "border-[#E3E8F0] bg-white text-[#313C55] hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#C8CFDC]",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function Indicador({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
    return (
        <div className={`${CARTAO} p-4`}>
            <div className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">{rotulo}</div>
            <div className="mt-1 text-[26px] font-extrabold leading-none">{valor}</div>
            {sub ? <div className="mt-1.5 truncate text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{sub}</div> : null}
        </div>
    );
}

function BotaoWhats({ numero, nome }: { numero: string | null; nome: string }) {
    if (!numero) return null;
    return (
        <a
            href={`https://wa.me/${numero}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Abrir conversa com ${nome} no WhatsApp`}
            aria-label={`Abrir conversa com ${nome} no WhatsApp`}
            onClick={(e) => e.stopPropagation()}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#B3CE52] bg-[#EEF5D6] text-[#3F5A0A] transition hover:bg-[#E3EEC2] dark:border-[#B3CE52]/50 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]"
        >
            <IconBrandWhatsapp size={20} stroke={1.8} />
        </a>
    );
}

/* ============================== página ============================== */

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const [busca, setBusca] = useState("");
    const [periodo, setPeriodo] = useState<Periodo>("todos");
    const [uf, setUf] = useState("");
    const [ordem, setOrdem] = useState<Ordem>("recentes");
    const [selected, setSelected] = useState<Set<number>>(new Set());

    const [porPagina, setPorPagina] = useState(20);
    const [page, setPage] = useState(1);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setErro(null);
            setSelected(new Set());
            const res = await fetch(`${ENDPOINT}?_=${Date.now()}`, { cache: "no-store", credentials: "include" }); // envia o login (pai_session) ao PHP
            if (res.status === 401) {
                window.location.href = "/login";
                return;
            }
            if (!res.ok) throw new Error("Não foi possível carregar os leads. Tente de novo.");
            const data = (await res.json()) as ApiLead[];
            if (!Array.isArray(data)) throw new Error("Resposta inesperada do servidor.");
            const mapped: Lead[] = data.map((item) => {
                const nome = String(item.nome ?? "").trim();
                const estado = String(item.estado ?? "").trim();
                const cidade = String(item.cidade ?? "").trim();
                const telefone = String(item.telefone ?? "").trim();
                const registro = parseData(item.data_registro);
                const ufx = paraUF(estado);
                return {
                    id: Number(item.id),
                    nome,
                    pais: String(item.pais ?? "").trim(),
                    estado,
                    uf: ufx,
                    cidade,
                    telefone,
                    foneDigitos: digitos(telefone),
                    registro,
                    registroTxt: registro ? dataCompleta(registro) : String(item.data_registro ?? ""),
                    busca: semAcento([nome, cidade, estado, ufx].join(" ")),
                };
            });
            setLeads(mapped);
            setPage(1);
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os leads.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    // Aviso some sozinho.
    useEffect(() => {
        if (!aviso) return;
        const t = window.setTimeout(() => setAviso(null), 3500);
        return () => window.clearTimeout(t);
    }, [aviso]);

    /* ---- resumo ---- */
    const resumo = useMemo(() => {
        const lim = Date.now() - 30 * 86400000;
        const ult30 = leads.filter((l) => l.registro && l.registro.getTime() >= lim).length;
        const porUf = new Map<string, number>();
        for (const l of leads) if (l.uf) porUf.set(l.uf, (porUf.get(l.uf) || 0) + 1);
        const ufs = Array.from(porUf.entries()).sort((a, b) => b[1] - a[1]);
        const porCidade = new Map<string, number>();
        for (const l of leads) {
            const c = l.cidade ? `${capitaliza(l.cidade)}${l.uf ? ` · ${l.uf}` : ""}` : "";
            if (c) porCidade.set(c, (porCidade.get(c) || 0) + 1);
        }
        const topCidade = Array.from(porCidade.entries()).sort((a, b) => b[1] - a[1])[0];
        return { ult30, ufs, topCidade };
    }, [leads]);

    /* ---- filtro e ordem ---- */
    const filtered = useMemo(() => {
        const q = semAcento(busca);
        const qd = digitos(busca);
        const agora = new Date();
        let desde: number | null = null;
        if (periodo === "7") desde = Date.now() - 7 * 86400000;
        if (periodo === "30") desde = Date.now() - 30 * 86400000;
        if (periodo === "mes") desde = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();

        const arr = leads.filter((l) => {
            if (uf && l.uf !== uf) return false;
            if (desde !== null && (!l.registro || l.registro.getTime() < desde)) return false;
            if (q) {
                const porTexto = q.split(/\s+/).every((p) => l.busca.indexOf(p) >= 0);
                const porFone = qd.length >= 4 && l.foneDigitos.indexOf(qd) >= 0;
                if (!porTexto && !porFone) return false;
            }
            return true;
        });

        arr.sort((a, b) => {
            if (ordem === "nome") return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
            if (ordem === "cidade") return lugar(a).localeCompare(lugar(b), "pt-BR", { sensitivity: "base" }) || a.nome.localeCompare(b.nome, "pt-BR");
            return (b.registro?.getTime() ?? 0) - (a.registro?.getTime() ?? 0) || b.id - a.id;
        });
        return arr;
    }, [leads, busca, periodo, uf, ordem]);

    const pages = Math.max(1, Math.ceil(filtered.length / porPagina));
    useEffect(() => {
        if (page > pages) setPage(pages);
    }, [page, pages]);

    const pageData = useMemo(() => filtered.slice((page - 1) * porPagina, page * porPagina), [filtered, page, porPagina]);

    const temFiltro = Boolean(busca || uf || periodo !== "todos");
    const limparFiltros = () => {
        setBusca("");
        setUf("");
        setPeriodo("todos");
        setPage(1);
    };

    /* ---- seleção ---- */
    const toggle = (id: number) =>
        setSelected((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
        });

    const paginaToda = pageData.length > 0 && pageData.every((l) => selected.has(l.id));
    const paginaParte = !paginaToda && pageData.some((l) => selected.has(l.id));
    const togglePagina = () =>
        setSelected((prev) => {
            const n = new Set(prev);
            if (paginaToda) pageData.forEach((l) => n.delete(l.id));
            else pageData.forEach((l) => n.add(l.id));
            return n;
        });
    const selecionarFiltrados = () => setSelected(new Set(filtered.map((l) => l.id)));

    /* ---- exportar ---- */
    const exportarFiltrados = () => {
        if (filtered.length === 0) return;
        baixarCSV(temFiltro ? `leads_filtrados_${hojeArquivo()}.csv` : `leads_${hojeArquivo()}.csv`, filtered);
        setAviso(`${filtered.length} ${filtered.length === 1 ? "lead exportado" : "leads exportados"}.`);
    };
    const exportarSelecionados = () => {
        const escolhidos = leads.filter((l) => selected.has(l.id));
        if (escolhidos.length === 0) return;
        baixarCSV(`leads_selecionados_${hojeArquivo()}.csv`, escolhidos);
        setAviso(`${escolhidos.length} ${escolhidos.length === 1 ? "lead exportado" : "leads exportados"}.`);
    };

    const ini = filtered.length ? (page - 1) * porPagina + 1 : 0;
    const fim = Math.min(filtered.length, page * porPagina);

    /* ============================== render ============================== */

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(7rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
                {/* Cabeçalho */}
                <header className="mb-4 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[24px] font-extrabold leading-tight lg:text-[28px]">Leads do Velório Online</h1>
                        <p className="mt-1 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">
                            Pessoas que deixaram nome e telefone para acompanhar o velório online.
                        </p>
                    </div>
                    <button type="button" onClick={() => void load()} disabled={loading} className={BTN_SEC} title="Atualizar a lista">
                        <IconRefresh size={18} className={loading ? "animate-spin" : ""} />
                        <span className="hidden sm:inline">Atualizar</span>
                    </button>
                </header>

                {/* Resumo */}
                {leads.length > 0 ? (
                    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
                        <Indicador rotulo="Total de leads" valor={leads.length.toLocaleString("pt-BR")} />
                        <Indicador rotulo="Últimos 30 dias" valor={resumo.ult30.toLocaleString("pt-BR")} sub={resumo.ult30 ? "novos contatos" : "nenhum novo contato"} />
                        <div className="hidden lg:block">
                            <Indicador
                                rotulo="Cidade com mais leads"
                                valor={resumo.topCidade ? resumo.topCidade[0] : "—"}
                                sub={resumo.topCidade ? `${resumo.topCidade[1]} leads · ${resumo.ufs.length} ${resumo.ufs.length === 1 ? "estado" : "estados"} no total` : undefined}
                            />
                        </div>
                    </div>
                ) : null}

                {/* Filtros */}
                <div className={`${CARTAO} mb-4 p-3 sm:p-4`}>
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_200px]">
                        <div className="relative">
                            <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8396]" />
                            <input
                                value={busca}
                                onChange={(e) => {
                                    setBusca(e.target.value);
                                    setPage(1);
                                }}
                                placeholder="Nome, cidade ou telefone"
                                aria-label="Buscar leads"
                                className={`${CAMPO} pl-10 ${busca ? "pr-11" : ""}`}
                                autoComplete="off"
                                enterKeyHint="search"
                            />
                            {busca ? (
                                <button
                                    type="button"
                                    onClick={() => setBusca("")}
                                    aria-label="Limpar busca"
                                    className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-[#5B6478] hover:bg-[#E3E8F0] dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                                >
                                    <IconX size={18} />
                                </button>
                            ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-3 lg:contents">
                            <select
                                value={uf}
                                onChange={(e) => {
                                    setUf(e.target.value);
                                    setPage(1);
                                }}
                                aria-label="Estado"
                                className={CAMPO}
                            >
                                <option value="">Estado: todos</option>
                                {resumo.ufs.map(([u, n]) => (
                                    <option key={u} value={u}>
                                        {u} ({n})
                                    </option>
                                ))}
                            </select>
                            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordem" className={CAMPO}>
                                <option value="recentes">Mais recentes</option>
                                <option value="nome">Nome (A–Z)</option>
                                <option value="cidade">Cidade (A–Z)</option>
                            </select>
                        </div>
                    </div>

                    <div className="-mx-3 mt-3 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
                        <div className="flex w-max items-center gap-2 sm:w-auto sm:flex-wrap">
                            {PERIODOS.map(([v, r]) => (
                                <Chip
                                    key={v}
                                    ativo={periodo === v}
                                    onClick={() => {
                                        setPeriodo(v);
                                        setPage(1);
                                    }}
                                >
                                    {r}
                                </Chip>
                            ))}
                            {temFiltro ? (
                                <button
                                    type="button"
                                    onClick={limparFiltros}
                                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[14px] font-bold text-[#5B6478] hover:bg-[#F1F4F8] hover:text-[#313C55] dark:text-[#AEB9CF] dark:hover:bg-white/[0.06] dark:hover:text-white"
                                >
                                    <IconX size={16} />
                                    Limpar filtros
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* Mensagens */}
                {erro ? (
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#F3B8B2] bg-[#FDECEA] px-4 py-3 text-[14px] font-semibold text-[#B42318] dark:border-[#FF9C92]/30 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                        <span className="min-w-0 flex-1">{erro}</span>
                        <button type="button" onClick={() => void load()} className="min-h-11 shrink-0 rounded-lg px-3 font-extrabold underline underline-offset-4">
                            Tentar de novo
                        </button>
                    </div>
                ) : null}
                {aviso ? (
                    <div role="status" className="mb-4 rounded-xl border border-[#7BA11A]/50 bg-[#EEF5D6] px-4 py-3 text-[14px] font-semibold text-[#3F5A0A] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]">
                        {aviso}
                    </div>
                ) : null}

                {/* Lista */}
                <div className={`${CARTAO} overflow-hidden`}>
                    {/* Barra da lista */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#E3E8F0] px-4 py-2.5 dark:border-white/[0.08]">
                        <label className="inline-flex min-h-11 cursor-pointer items-center gap-3">
                            <input
                                type="checkbox"
                                className={CHECK}
                                checked={paginaToda}
                                ref={(el) => {
                                    if (el) el.indeterminate = paginaParte;
                                }}
                                onChange={togglePagina}
                                disabled={pageData.length === 0}
                                aria-label="Selecionar os leads desta página"
                            />
                            <span className="text-[15px] font-extrabold">
                                {loading && leads.length === 0
                                    ? "Carregando…"
                                    : `${filtered.length.toLocaleString("pt-BR")} ${filtered.length === 1 ? "lead" : "leads"}`}
                                {temFiltro && leads.length ? (
                                    <span className="ml-1 text-[13px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">de {leads.length.toLocaleString("pt-BR")}</span>
                                ) : null}
                            </span>
                        </label>
                        {selected.size > 0 && selected.size < filtered.length ? (
                            <button type="button" onClick={selecionarFiltrados} className="min-h-11 text-[13px] font-bold text-[#3D6A99] underline underline-offset-4 dark:text-[#A9BED6]">
                                Selecionar todos os {filtered.length.toLocaleString("pt-BR")}
                            </button>
                        ) : null}
                        <div className="ml-auto">
                            <button type="button" onClick={exportarFiltrados} disabled={filtered.length === 0} className={BTN_SEC} title="Baixa uma planilha com os leads da lista (respeita a busca e os filtros)">
                                <IconDownload size={18} />
                                {temFiltro ? "Exportar filtrados" : "Exportar todos"}
                            </button>
                        </div>
                    </div>

                    {loading && leads.length === 0 ? (
                        <ul aria-hidden="true">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <li key={i} className="border-b border-[#EEF1F6] px-4 py-4 last:border-b-0 dark:border-white/[0.06]">
                                    <div className="h-4 w-1/3 animate-pulse rounded bg-[#E9EEF5] dark:bg-white/[0.08]" />
                                    <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-[#F1F4F8] dark:bg-white/[0.05]" />
                                </li>
                            ))}
                        </ul>
                    ) : pageData.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-[15px] font-extrabold">Nenhum lead encontrado.</p>
                            {temFiltro ? (
                                <button type="button" onClick={limparFiltros} className={`${BTN_SEC} mt-3`}>
                                    Limpar filtros
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            {/* Computador: tabela */}
                            <table className="hidden w-full text-left lg:table">
                                <thead>
                                    <tr className="border-b border-[#E3E8F0] text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:border-white/[0.08] dark:text-[#AEB9CF]">
                                        <th className="w-14 py-2.5 pl-4" />
                                        <th className="py-2.5 pr-4">Nome</th>
                                        <th className="py-2.5 pr-4">Cidade</th>
                                        <th className="py-2.5 pr-4">Telefone</th>
                                        <th className="py-2.5 pr-4 text-right">Registro</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageData.map((l) => {
                                        const f = formataFone(l.telefone);
                                        const sel = selected.has(l.id);
                                        return (
                                            <tr
                                                key={l.id}
                                                onClick={() => toggle(l.id)}
                                                className={[
                                                    "cursor-pointer border-b border-[#EEF1F6] transition last:border-b-0 dark:border-white/[0.06]",
                                                    sel ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : "hover:bg-[#F6F8FB] dark:hover:bg-white/[0.03]",
                                                ].join(" ")}
                                            >
                                                <td className="py-2 pl-4" onClick={(e) => e.stopPropagation()}>
                                                    <label className="grid size-11 cursor-pointer place-items-center">
                                                        <input type="checkbox" className={CHECK} checked={sel} onChange={() => toggle(l.id)} aria-label={`Selecionar ${l.nome}`} />
                                                    </label>
                                                </td>
                                                <td className="py-2 pr-4 text-[15px] font-extrabold">{capitaliza(l.nome) || "Sem nome"}</td>
                                                <td className="py-2 pr-4 text-[14px] text-[#4A5368] dark:text-[#C8CFDC]">
                                                    {lugar(l)}
                                                    {l.pais && semAcento(l.pais) !== "brasil" ? <span className="ml-1 text-[#7A8396]">({l.pais})</span> : null}
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-[132px] text-[14px] font-semibold tabular-nums">{f.texto}</span>
                                                        <BotaoWhats numero={f.whats} nome={l.nome} />
                                                    </div>
                                                </td>
                                                <td className="py-2 pr-4 text-right text-[13px] text-[#5B6478] dark:text-[#AEB9CF]" title={dataCompleta(l.registro)}>
                                                    {dataCurta(l.registro)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Celular e tablet: cartões */}
                            <ul className="lg:hidden">
                                {pageData.map((l) => {
                                    const f = formataFone(l.telefone);
                                    const sel = selected.has(l.id);
                                    return (
                                        <li
                                            key={l.id}
                                            className={[
                                                "flex items-center gap-2 border-b border-[#EEF1F6] py-2 pl-2 pr-3 last:border-b-0 dark:border-white/[0.06]",
                                                sel ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : "",
                                            ].join(" ")}
                                        >
                                            <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
                                                <input type="checkbox" className={CHECK} checked={sel} onChange={() => toggle(l.id)} aria-label={`Selecionar ${l.nome}`} />
                                            </label>
                                            <button type="button" onClick={() => toggle(l.id)} className="min-w-0 flex-1 py-1 text-left">
                                                <span className="block truncate text-[15px] font-extrabold">{capitaliza(l.nome) || "Sem nome"}</span>
                                                <span className="block truncate text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                    {lugar(l)} · {dataCurta(l.registro)}
                                                </span>
                                                <span className="block text-[13px] font-semibold tabular-nums">{f.texto}</span>
                                            </button>
                                            <BotaoWhats numero={f.whats} nome={l.nome} />
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}

                    {/* Paginação */}
                    {filtered.length > 0 ? (
                        <div className="flex flex-col gap-3 border-t border-[#E3E8F0] bg-[#F6F8FB] p-3 dark:border-white/[0.08] dark:bg-[#1C2334] sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center justify-between gap-3 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] sm:justify-start">
                                <span>
                                    Mostrando <b className="text-[#313C55] dark:text-white">{ini}–{fim}</b> de{" "}
                                    <b className="text-[#313C55] dark:text-white">{filtered.length.toLocaleString("pt-BR")}</b>
                                </span>
                                <label className="inline-flex items-center gap-2">
                                    <span className="hidden sm:inline">Por página</span>
                                    <select
                                        value={porPagina}
                                        onChange={(e) => {
                                            setPorPagina(Number(e.target.value));
                                            setPage(1);
                                        }}
                                        aria-label="Leads por página"
                                        className="h-11 rounded-xl border-0 bg-white px-3 text-[15px] font-bold text-[#313C55] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#232B3F] dark:text-white"
                                    >
                                        {[20, 50, 100].map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            <div className="flex items-center justify-between gap-2 sm:justify-end">
                                <button type="button" className={`${BTN_SEC} w-11 px-0`} onClick={() => setPage(1)} disabled={page <= 1} aria-label="Primeira página">
                                    <IconChevronsLeft size={18} />
                                </button>
                                <button type="button" className={`${BTN_SEC} w-11 px-0`} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Página anterior">
                                    <IconChevronLeft size={18} />
                                </button>
                                <span className="min-w-[80px] text-center text-[14px] font-bold">
                                    {page} de {pages}
                                </span>
                                <button type="button" className={`${BTN_SEC} w-11 px-0`} onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Próxima página">
                                    <IconChevronRight size={18} />
                                </button>
                                <button type="button" className={`${BTN_SEC} w-11 px-0`} onClick={() => setPage(pages)} disabled={page >= pages} aria-label="Última página">
                                    <IconChevronsRight size={18} />
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Barra de seleção (fica por cima, acima da barra de baixo do celular) */}
            {selected.size > 0 ? (
                <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-4 lg:bottom-6">
                    <div className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl bg-[#313C55] p-2 pl-4 text-white shadow-2xl dark:bg-[#1C2334] dark:ring-1 dark:ring-white/[0.12]">
                        <span className="min-w-0 flex-1 text-[14px] font-extrabold">
                            {selected.size} {selected.size === 1 ? "selecionado" : "selecionados"}
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelected(new Set())}
                            className="min-h-11 rounded-xl px-3 text-[14px] font-bold text-white/80 hover:bg-white/10 hover:text-white"
                        >
                            Limpar
                        </button>
                        <button
                            type="button"
                            onClick={exportarSelecionados}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F2CB3F] px-4 text-[14px] font-extrabold text-[#313C55] hover:bg-[#E4BC30]"
                        >
                            <IconDownload size={18} />
                            Exportar selecionados
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
