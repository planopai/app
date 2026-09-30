"use client";

/*
 * PAINEL DE ATENDIMENTOS — restrito à gerência
 *
 * Usa só os PHPs que o app já tem (mesmas chamadas do Dashboard de desempenho e do Quadro):
 *   balanco.php?inicio&fim         → atendimentos oficiais do período e do período anterior
 *   informativo.php?listar=1       → registros completos
 *   historico_sepultamentos.php    → fases, responsáveis e horários (6 consultas por vez)
 *   visita.php?action=painel_avaliacoes → visitas, pós-atendimentos e notas por colaborador
 *   visita.php?action=obter        → respostas e fotos de uma avaliação (ficha)
 * Os cálculos são feitos no navegador.
 * Visual: mesmas variáveis --dash-* e fonte Nunito do Dashboard de desempenho.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Nunito } from "next/font/google";

const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800", "900"] });


/* =========================================================
   TIPOS (estrutura montada pelo cálculo do painel)
========================================================= */

type Contagem = { nome: string; total: number };
type EtapaResumo = { chave: string; rotulo: string; tipo: "execucao" | "espera"; n: number; mediana_h: number | null; media_h: number | null; p90_h: number | null };
type MatrizLinha = { agente: string; etapas: Record<string, { n: number; horas: number; mediana_h: number | null }>; total_n: number; total_h: number };
type Pontual = { n: number; no_horario_pct: number; atraso_mediana_min: number | null };
type ListaItem = {
    id: number; falecido: string; criado_em: string; data_falecimento: string | null; data_sepultamento: string | null;
    idade: number | null; convenio: string; agente: string; velorio: string; local_velorio: string | null; cemiterio: string;
    urna: string; roupa: string | null; religiao: string; status: string; status_rotulo: string; no_quadro: boolean;
    ciclo_h: number | null; ocioso_h: number | null; etapas: Record<string, { h: number; quem: string }>;
};
type Painel = {
    ok: boolean; need_login?: number; sem_permissao?: number; msg?: string; gerado_em: string;
    periodo: { inicio: string; fim: string; ref: string; dias: number; anterior: { inicio: string; fim: string; total: number } };
    resumo: {
        total: number; anterior: number; variacao_pct: number | null; media_dia: number; pico: { data: string; total: number } | null;
        idade_media: number | null; idade_n: number; ciclo_mediana_h: number | null; ciclo_p90_h: number | null; ciclo_n: number;
        em_andamento_periodo: number; com_historico: number;
    };
    serie: { granularidade: "dia" | "semana" | "mes"; pontos: { chave: string; rotulo: string; total: number; por_convenio: Record<string, number> }[] };
    convenios: Contagem[]; heatmap: number[][]; dia_semana: { dia: string; total: number; dias: number; media: number }[];
    velorio: Contagem[]; cemiterio: Contagem[];
    equipe: {
        etapas: EtapaResumo[]; ocioso: { n: number; mediana_h: number | null; p90_h: number | null };
        matriz: MatrizLinha[]; meses: string[]; mensal: { agente: string; meses: Record<string, number> }[];
        pontualidade: { velorio: Pontual & { por_agente: (Pontual & { agente: string })[] }; sepultamento: Pontual & { por_agente: (Pontual & { agente: string })[] } };
        registro_lote: { agente: string; trocas: number; em_lote: number; pct: number }[];
        evidencias: { agente: string; ornamentacao: { n: number; com_foto: number; pct: number }; entrega: { n: number; com_foto: number; pct: number } }[];
        titulares: Contagem[];
    };
    perfil: {
        servicos: { nome: string; total: number; pct: number }[]; urnas: Contagem[]; roupas: Contagem[]; religiao: Contagem[];
        faixas_etarias: Contagem[]; qualidade: { campo: string; total: number; pct: number }[];
        qualidade_agente: { agente: string; pct: number; n: number }[]; status: { status: string; rotulo: string; total: number }[];
    };
    lista: ListaItem[];
    etapas_definicao: { chave: string; rotulo: string; inicio: string; fim: string; credito: string; tipo: "execucao" | "espera" }[];
    em_andamento: { id: number; falecido: string; status: string; status_rotulo: string; convenio: string; velorio: string; horas_desde_cadastro: number | null }[];
    opcoes: { convenios: string[]; agentes: string[] };
};

/* =========================================================
   HELPERS
========================================================= */

const pad2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dataBR = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");
const dataHoraBR = (s?: string | null) => (s ? `${dataBR(s)}${s.length > 10 ? " " + s.slice(11, 16) : ""}` : "—");
const fmtN = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const fmtP = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: n < 10 ? 1 : 0 })}%`);
function fmtH(h: number | null | undefined) {
    if (h == null) return "—";
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 48) return `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
    return `${(h / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
}
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesRotulo = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

type Preset = "hoje" | "7d" | "30d" | "mes" | "mesant" | "90d" | "ano" | "custom";
const PRESETS: [Preset, string][] = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["mesant", "Mês anterior"], ["90d", "90 dias"], ["ano", "Este ano"]];
function rangeDe(p: Preset): { inicio: string; fim: string } {
    const h = new Date();
    switch (p) {
        case "hoje": return { inicio: iso(h), fim: iso(h) };
        case "7d": return { inicio: iso(addDias(h, -6)), fim: iso(h) };
        case "30d": return { inicio: iso(addDias(h, -29)), fim: iso(h) };
        case "90d": return { inicio: iso(addDias(h, -89)), fim: iso(h) };
        case "mes": return { inicio: iso(new Date(h.getFullYear(), h.getMonth(), 1)), fim: iso(h) };
        case "mesant": return { inicio: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), fim: iso(new Date(h.getFullYear(), h.getMonth(), 0)) };
        case "ano": return { inicio: `${h.getFullYear()}-01-01`, fim: iso(h) };
        default: return { inicio: iso(addDias(h, -29)), fim: iso(h) };
    }
}

const CONV_COR: Record<string, string> = {
    "Prefeitura de Barreiras": "var(--dash-blue)",
    Particular: "var(--dash-yellow)",
    "Associado(a)": "var(--dash-teal)",
    "Prefeitura de Angical": "var(--dash-slate)",
};
const corConv = (c: string) => CONV_COR[c] ?? "var(--dash-blue-dark)";

const FASE_ROTULO: Record<string, string> = {
    aguardando: "Aguardando", fase01: "Indo retirar o óbito", fase02: "Corpo na clínica", fase03: "Início da conservação", fase04: "Fim da conservação",
    fase05: "Início da ornamentação", fase06: "Fim da ornamentação", fase12: "Corpo pronto", fase07: "Transportando p/ velório",
    fase08: "Entrega de corpo", fase09: "Transportando p/ sepultamento", fase10: "Sepultamento concluído", fase11: "Material recolhido",
};
const faseNome = (s?: string | null) => { const k = String(s ?? "").trim().toLowerCase(); return FASE_ROTULO[k] ?? (s || "—"); };

const STATUS_COR: Record<string, string> = {
    aguardando: "bg-slate-500", fase01: "bg-amber-600", fase02: "bg-zinc-600", fase03: "bg-blue-600", fase04: "bg-fuchsia-600",
    fase05: "bg-rose-600", fase06: "bg-fuchsia-700", fase12: "bg-emerald-600", fase07: "bg-cyan-600", fase08: "bg-violet-600",
    fase09: "bg-orange-600", fase10: "bg-green-700", fase11: "bg-slate-700",
};

/* =========================================================
   FONTES DE DADOS (os mesmos PHPs que o app já usa)
   - balanco.php?inicio&fim  → atendimentos oficiais do período
   - informativo.php?listar=1 → registros completos dos atendimentos
   - historico_sepultamentos.php?log=1&id= → fases, responsáveis e horários
========================================================= */

const INFORMATIVO_URL = "/api/php/informativo.php?listar=1";
const BALANCO_URL = "https://api.planoassistencialintegrado.com.br/balanco.php";
const HISTORICO_URL = "/api/php/historico_sepultamentos.php?log=1&id=";

type Registro = { [k: string]: any };
type LogItem = { id?: number | string; datahora?: string; acao?: string; status_anterior?: string | null; status_novo?: string | null; detalhes?: any; usuario?: string };
type BalancoRow = { atendimento_id: number | string; falecido?: string; convenio?: string; data_referencia?: string;[k: string]: any };
type BalancoResp = { ok?: boolean; need_login?: any; msg?: string; resumo?: { atendimentos?: number }; atendimentos?: BalancoRow[] };

class LoginError extends Error { }

async function getJson<T>(url: string, timeoutMs = 20000): Promise<T> {
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), timeoutMs);
    try {
        const sep = url.includes("?") ? "&" : "?";
        const res = await fetch(`${url}${sep}_ts=${Date.now()}`, { method: "GET", credentials: "include", cache: "no-store", signal: ac.signal });
        if (res.status === 401) throw new LoginError("Sessão expirada. Faça login novamente.");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as any;
        if (json && typeof json === "object" && !Array.isArray(json) && json.need_login) throw new LoginError(json.msg || "Sessão expirada. Faça login novamente.");
        return json as T;
    } finally {
        window.clearTimeout(t);
    }
}

function extrairArray<T>(json: any): T[] {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.dados)) return json.dados;
    if (json && Array.isArray(json.data)) return json.data;
    return [];
}

/* Cache do histórico em memória: atendimentos encerrados mudam pouco. */
const HIST_CACHE = new Map<string, { exp: number; logs: LogItem[] }>();
async function carregarHistorico(id: string, encerrado: boolean): Promise<LogItem[]> {
    const hit = HIST_CACHE.get(id);
    if (hit && hit.exp > Date.now()) return hit.logs;
    const json = await getJson<any>(`${HISTORICO_URL}${encodeURIComponent(id)}`, 15000);
    const logs = extrairArray<LogItem>(json).slice().sort((a, b) => tsOf(a.datahora) - tsOf(b.datahora));
    HIST_CACHE.set(id, { exp: Date.now() + (encerrado ? 30 : 2) * 60_000, logs });
    return logs;
}

/* =========================================================
   NORMALIZAÇÃO E REGRAS
========================================================= */

const norm = (v: any) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const nomeProprio = (v: any) => norm(v).replace(/(^|\s)\S/g, (m) => m.toUpperCase());
const ehSim = (v: any) => ["sim", "s"].includes(norm(v));
const ehNao = (v: any) => ["nao", "n"].includes(norm(v));
const dataValida = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && !s.startsWith("0000");
function tsOf(s: any): number {
    const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m || m[1] === "0000") return NaN;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime();
}
const isoDe = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function parseDet(d: any): any { if (d == null) return null; if (typeof d === "object") return d; try { return JSON.parse(String(d)); } catch { return null; } }
function faseKey(s: any): string {
    const n = norm(s);
    const m = n.match(/^fase\s?(\d+)$/);
    return m ? `fase${m[1].padStart(2, "0")}` : n;
}
const mediana = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const media = (v: number[]) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : null);
const quantil = (v: number[], q: number) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[Math.round(q * (s.length - 1))]; };
const r2 = (v: number | null, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
function conta<T>(itens: T[], f: (x: T) => string | null | undefined): { nome: string; total: number }[] {
    const m = new Map<string, number>();
    itens.forEach((x) => { const k = f(x); if (k) m.set(k, (m.get(k) ?? 0) + 1); });
    return [...m.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
}

const FASE_ROTULO_APP: Record<string, string> = {
    aguardando: "Aguardando", fase01: "Removendo", fase02: "Aguardando procedimento", fase03: "Preparando", fase04: "Aguardando ornamentação",
    fase05: "Ornamentando", fase06: "Aguardando corpo pronto", fase12: "Corpo pronto", fase07: "Transportando p/ velório", fase08: "Velando",
    fase09: "Transportando p/ sepultamento", fase10: "Sepultamento concluído", fase11: "Material recolhido",
};

/** Mesma regra do atendimentoDeveFicarNoQuadro() do Quadro. */
function noQuadro(r: Registro): boolean {
    const st = faseKey(r.status);
    if (!st || !FASE_ROTULO_APP[st]) return true;
    if (st === "fase11") return false;
    const tipo = norm(r.tipo_atendimento);
    const terceiro = tipo === "terceiro" || (tipo !== "funerario" && ehNao(r.assistencia) && ehNao(r.tanato) && ehNao(r.ornamentacao));
    if (!terceiro && ehSim(r.assistencia)) return true;
    if (!ehNao(r.realiza_sepultamento)) return st !== "fase10";
    if (!ehNao(r.realiza_velorio)) return !["fase08", "fase09", "fase10"].includes(st);
    return !["fase12", "fase07", "fase08", "fase09", "fase10"].includes(st);
}

function grupoVelorio(r: Registro): string {
    if (ehNao(r.realiza_velorio)) return "Sem velório";
    const n = norm(r.local_velorio);
    if (!n || n === "nao informado") return "Não informado";
    if (/sem velorio|nao vai ter|nao tem|nao havera/.test(n)) return "Sem velório";
    if (n.includes("bonfim") || (n.includes("memorial") && !n.includes("cuid"))) { const m = n.match(/sala\s*0?(\d)/); return m ? `Memorial · Sala 0${m[1]}` : "Memorial"; }
    if (n.includes("cuid")) return "Rede Cuidar";
    if (/capela|igreja|missao mundial/.test(n)) return "Igreja / capela";
    return "Residência / endereço";
}
function chaveCemiterio(s: any): string {
    let n = norm(s).replace(/^cemiterio[:\s-]*/, "").replace(/^(de|do|da|dos)\s+/, "").replace(/[.(].*$/, "").trim();
    if (!n || n === "nao informado") return "Não informado";
    if (n.startsWith("a def")) return "A definir";
    return n;
}
function chaveUrna(s: any): string {
    const n = norm(s);
    if (!n) return "Não informada";
    if (n.includes("anjo")) return "Urna Anjo (infantil)";
    const m = n.match(/(\d{1,3})/);
    return m ? `Urna ${m[1].padStart(3, "0")}` : nomeProprio(n);
}
function religiao(s: any): string {
    const n = norm(s);
    if (!n || n === "nao informado") return "Não informado";
    if (n.includes("catol")) return "Católico";
    if (n.includes("evang")) return "Evangélico";
    if (n.includes("espir")) return "Espírita";
    return "Outras";
}
function idadeDe(r: Registro, criadoTs: number): number | null {
    if (!dataValida(r.data_nascimento)) return null;
    const ref = dataValida(r.data_falecimento) ? tsOf(String(r.data_falecimento).slice(0, 10)) : criadoTs;
    const nasc = tsOf(String(r.data_nascimento).slice(0, 10));
    if (Number.isNaN(ref) || Number.isNaN(nasc)) return null;
    const a = new Date(ref), b = new Date(nasc);
    let anos = a.getFullYear() - b.getFullYear();
    if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) anos--;
    return anos >= 0 && anos <= 115 ? anos : null;
}

/**
 * Registro a partir do histórico, para atendimentos que já saíram do informativo.php:
 * o log "criou" traz o cadastro completo e cada "editou" traz os campos alterados.
 */
function registroDoHistorico(logs: LogItem[]): Registro {
    const r: Registro = {};
    for (const l of logs) {
        const acao = norm(l.acao);
        const det = parseDet(l.detalhes);
        if (det && typeof det === "object" && !Array.isArray(det) && !det.sem_alteracoes && (acao === "criou" || acao.startsWith("edit"))) {
            for (const [k, v] of Object.entries(det)) if (v !== undefined && typeof v !== "object") r[k] = v;
        }
        if (acao.includes("foto") && acao.includes("ornament")) { r.foto_fim_ornamentacao_em = l.datahora; r.foto_fim_ornamentacao_usuario = l.usuario; }
        if (acao.includes("foto") && acao.includes("entrega")) { r.foto_entrega_corpo_em = l.datahora; r.foto_entrega_corpo_usuario = l.usuario; }
        if (acao.startsWith("assinou")) r.__assinatura = true;
        if (l.status_novo) r.status = l.status_novo;
    }
    return r;
}

/* ---------------- Etapas (manual de procedimentos) ---------------- */

type EtapaDef = { chave: string; rotulo: string; inicio: string; fim: string; credito: string; tipo: "execucao" | "espera"; max: number };
const ETAPAS: EtapaDef[] = [
    { chave: "resposta", rotulo: "Resposta ao chamado", inicio: "criado", fim: "fase01", credito: "fase01", tipo: "espera", max: 48 },
    { chave: "remocao", rotulo: "Remoção", inicio: "fase01", fim: "fase02", credito: "fase01", tipo: "execucao", max: 24 },
    { chave: "esp_conserv", rotulo: "Espera p/ conservação", inicio: "fase02", fim: "fase03", credito: "fase03", tipo: "espera", max: 72 },
    { chave: "conservacao", rotulo: "Conservação", inicio: "fase03", fim: "fase04", credito: "fase03", tipo: "execucao", max: 24 },
    { chave: "esp_ornam", rotulo: "Espera p/ ornamentação", inicio: "fase04", fim: "fase05", credito: "fase05", tipo: "espera", max: 72 },
    { chave: "ornamentacao", rotulo: "Ornamentação", inicio: "fase05", fim: "fase06", credito: "fase05", tipo: "execucao", max: 24 },
    { chave: "esp_pronto", rotulo: "Espera p/ corpo pronto", inicio: "fase06", fim: "fase12", credito: "fase12", tipo: "espera", max: 72 },
    { chave: "esp_saida", rotulo: "Espera p/ saída ao velório", inicio: "fase12", fim: "fase07", credito: "fase07", tipo: "espera", max: 72 },
    { chave: "transporte", rotulo: "Transporte ao velório", inicio: "fase07", fim: "fase08", credito: "fase07", tipo: "execucao", max: 24 },
    { chave: "velorio", rotulo: "Velório", inicio: "fase08", fim: "fase09", credito: "fase08", tipo: "execucao", max: 96 },
    { chave: "sepultamento", rotulo: "Sepultamento", inicio: "fase09", fim: "fase10", credito: "fase09", tipo: "execucao", max: 24 },
    { chave: "recolhimento", rotulo: "Recolhimento do material", inicio: "fase10", fim: "fase11", credito: "fase11", tipo: "execucao", max: 240 },
];

function marcos(criadoTs: number, agente: string, logs: LogItem[]) {
    const T: Record<string, number> = {}, U: Record<string, string> = {};
    if (!Number.isNaN(criadoTs)) T.criado = criadoTs;
    U.criado = agente;
    const trocas: [number, string][] = [];
    for (const l of logs) {
        const ts = tsOf(l.datahora);
        if (Number.isNaN(ts)) continue;
        const acao = norm(l.acao);
        if (acao === "criou") { T.criado = Math.min(T.criado ?? ts, ts); if (l.usuario) U.criado = nomeProprio(l.usuario); continue; }
        const novo = faseKey(l.status_novo), ant = faseKey(l.status_anterior);
        if (!novo || novo === ant || !FASE_ROTULO_APP[novo]) continue;
        trocas.push([ts, nomeProprio(l.usuario)]);
        if (T[novo] === undefined) { T[novo] = ts; U[novo] = nomeProprio(l.usuario); }
    }
    return { T, U, trocas };
}
function etapasDe(T: Record<string, number>, U: Record<string, string>) {
    const out: Record<string, { h: number; quem: string; tipo: "execucao" | "espera"; ini: number }> = {};
    for (const e of ETAPAS) {
        if (T[e.inicio] === undefined || T[e.fim] === undefined) continue;
        const h = (T[e.fim] - T[e.inicio]) / 36e5;
        if (h < 0 || h > e.max) continue;
        out[e.chave] = { h, quem: U[e.credito] ?? "", tipo: e.tipo, ini: T[e.inicio] };
    }
    return out;
}

/* =========================================================
   CÁLCULO DO PAINEL (no navegador)
========================================================= */

type Base = { id: string; r: Registro; logs: LogItem[] | null; criadoTs: number; dataRef: string; convenio: string; agente: string };

function calcularPainel(base: Base[], p: { inicio: string; fim: string; dias: number; anterior: number; antInicio: string; antFim: string }): Omit<Painel, "em_andamento" | "opcoes" | "ok" | "gerado_em"> {
    const n = base.length;
    const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

    // nome exibido do cemitério = forma mais digitada de cada chave
    const formas = new Map<string, Map<string, number>>();
    base.forEach((b) => { const k = chaveCemiterio(b.r.local); const o = String(b.r.local ?? "").trim().replace(/\s+/g, " "); const m = formas.get(k) ?? new Map(); m.set(o, (m.get(o) ?? 0) + 1); formas.set(k, m); });
    const nomeCem = (k: string) => {
        if (k === "Não informado" || k === "A definir") return k;
        const top = [...(formas.get(k) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? k;
        const s = top.replace(/^cemit[eé]rio\b[:\s]*/i, "Cemitério ");
        return /^cemit/i.test(s) ? s.trim() : `Cemitério ${s}`.trim();
    };

    const itens = base.map((b) => {
        const { T, U, trocas } = marcos(b.criadoTs, b.agente, b.logs ?? []);
        const et = etapasDe(T, U);
        let ciclo = T.fase10 !== undefined && T.criado !== undefined ? (T.fase10 - T.criado) / 36e5 : null;
        if (ciclo !== null && (ciclo <= 0 || ciclo > 168)) ciclo = null;
        const esperas = Object.values(et).filter((e) => e.tipo === "espera");
        return {
            b, r: b.r, T, U, trocas, et, ciclo, ocioso: esperas.length ? esperas.reduce((a, e) => a + e.h, 0) : null,
            idade: idadeDe(b.r, b.criadoTs), velorio: grupoVelorio(b.r), cemiterio: nomeCem(chaveCemiterio(b.r.local)),
            urna: chaveUrna(b.r.urna), religiao: religiao(b.r.religiao), status: faseKey(b.r.status), temHist: !!(b.logs && b.logs.length),
        };
    });
    type It = (typeof itens)[number];

    /* ---- resumo ---- */
    const porDia = conta(itens, (x) => x.b.dataRef);
    const idades = itens.map((x) => x.idade).filter((v): v is number => v != null);
    const ciclos = itens.map((x) => x.ciclo).filter((v): v is number => v != null);
    const resumo = {
        total: n, anterior: p.anterior, variacao_pct: p.anterior ? r2(((n - p.anterior) / p.anterior) * 100, 1) : null,
        media_dia: r2(n / Math.max(1, p.dias))!, pico: porDia[0] ? { data: porDia[0].nome, total: porDia[0].total } : null,
        idade_media: r2(media(idades), 0), idade_n: idades.length,
        ciclo_mediana_h: r2(mediana(ciclos)), ciclo_p90_h: r2(quantil(ciclos, 0.9)), ciclo_n: ciclos.length,
        em_andamento_periodo: itens.filter((x) => x.b.r.status && noQuadro(x.r)).length,
        com_historico: itens.filter((x) => x.temHist).length,
    };

    /* ---- série por convênio ---- */
    const gran: "dia" | "semana" | "mes" = p.dias <= 62 ? "dia" : p.dias <= 210 ? "semana" : "mes";
    const chaveDe = (d: string) => {
        if (gran === "dia") return d;
        if (gran === "mes") return d.slice(0, 7);
        const t = tsOf(d); const dt = new Date(t); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return isoDe(dt.getTime());
    };
    const pontos = new Map<string, { chave: string; rotulo: string; total: number; por_convenio: Record<string, number> }>();
    {
        let c = chaveDe(p.inicio); const fimK = chaveDe(p.fim); let g = 0;
        while (c <= fimK && g++ < 2000) {
            let rot: string, prox: string;
            if (gran === "mes") { rot = `${MES[+c.slice(5, 7) - 1]}/${c.slice(2, 4)}`; const [y, m] = c.split("-").map(Number); prox = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }
            else { rot = `${c.slice(8, 10)}/${c.slice(5, 7)}`; const d = new Date(tsOf(c)); d.setDate(d.getDate() + (gran === "dia" ? 1 : 7)); prox = isoDe(d.getTime()); }
            pontos.set(c, { chave: c, rotulo: rot, total: 0, por_convenio: {} }); c = prox;
        }
    }
    itens.forEach((x) => { const pt = pontos.get(chaveDe(x.b.dataRef)); if (!pt) return; pt.total++; pt.por_convenio[x.b.convenio] = (pt.por_convenio[x.b.convenio] ?? 0) + 1; });

    /* ---- demanda ---- */
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    itens.forEach((x) => { const t = x.T.criado; if (t !== undefined) { const d = new Date(t); heat[d.getDay()][d.getHours()]++; } });
    const nDias = Array(7).fill(0), nAt = Array(7).fill(0);
    for (let t = tsOf(p.inicio), g = 0; t <= tsOf(p.fim) && g < 5000; g++) { nDias[new Date(t).getDay()]++; const d = new Date(t); d.setDate(d.getDate() + 1); t = d.getTime(); }
    itens.forEach((x) => { const t = tsOf(x.b.dataRef); if (!Number.isNaN(t)) nAt[new Date(t).getDay()]++; });
    const dia_semana = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ dia: DOW[d], total: nAt[d], dias: nDias[d], media: nDias[d] ? r2(nAt[d] / nDias[d])! : 0 }));

    /* ---- equipe ---- */
    const matriz: Record<string, Record<string, number[]>> = {}, mensal: Record<string, Record<string, number>> = {}, mesesSet = new Set<string>();
    const etapas = ETAPAS.map((e) => {
        const hs: number[] = [];
        itens.forEach((x) => {
            const s = x.et[e.chave]; if (!s) return;
            hs.push(s.h);
            if (e.tipo === "execucao" && s.quem) {
                ((matriz[s.quem] ??= {})[e.chave] ??= []).push(s.h);
                const m = isoDe(s.ini).slice(0, 7); mesesSet.add(m);
                (mensal[s.quem] ??= {})[m] = ((mensal[s.quem] ??= {})[m] ?? 0) + 1;
            }
        });
        return { chave: e.chave, rotulo: e.rotulo, tipo: e.tipo, n: hs.length, mediana_h: r2(mediana(hs)), media_h: r2(media(hs)), p90_h: r2(quantil(hs, 0.9)) };
    });
    const matrizOut = Object.entries(matriz).map(([agente, pe]) => {
        const et: Record<string, { n: number; horas: number; mediana_h: number | null }> = {};
        let tn = 0, th = 0;
        Object.entries(pe).forEach(([k, hs]) => { const s = hs.reduce((a, v) => a + v, 0); et[k] = { n: hs.length, horas: r2(s, 1)!, mediana_h: r2(mediana(hs)) }; tn += hs.length; th += s; });
        return { agente, etapas: et, total_n: tn, total_h: r2(th, 1)! };
    }).sort((a, b) => b.total_n - a.total_n);
    const meses = [...mesesSet].sort();
    const mensalOut = Object.entries(mensal).map(([agente, pm]) => ({ agente, meses: Object.fromEntries(meses.map((m) => [m, pm[m] ?? 0])) }))
        .sort((a, b) => Object.values(b.meses).reduce((s, v) => s + v, 0) - Object.values(a.meses).reduce((s, v) => s + v, 0));

    const pontual = (fase: string, campoData: string, campoHora: string, faseAutor: string) => {
        const geral: number[] = [], porAg: Record<string, number[]> = {};
        itens.forEach((x) => {
            const real = x.T[fase], d = x.r[campoData], h = x.r[campoHora];
            if (real === undefined || !dataValida(d) || !h || h === "00:00:00" || h === "00:00") return;
            const comb = tsOf(`${String(d).slice(0, 10)} ${h}`);
            if (Number.isNaN(comb)) return;
            const min = (real - comb) / 60000;
            if (Math.abs(min) > 1440) return;
            geral.push(min);
            const ag = x.U[faseAutor]; if (ag) (porAg[ag] ??= []).push(min);
        });
        const f = (v: number[]) => ({ n: v.length, no_horario_pct: pct(v.filter((m) => m <= 15).length, v.length), atraso_mediana_min: r2(mediana(v), 0) });
        return { ...f(geral), por_agente: Object.entries(porAg).map(([agente, v]) => ({ agente, ...f(v) })).sort((a, b) => b.n - a.n) };
    };

    const lote: Record<string, { trocas: number; em_lote: number }> = {};
    itens.forEach((x) => {
        const tr = [...x.trocas].sort((a, b) => a[0] - b[0]);
        tr.forEach(([t, ag], i) => { if (!ag) return; const l = (lote[ag] ??= { trocas: 0, em_lote: 0 }); l.trocas++; if (i > 0 && t - tr[i - 1][0] < 60_000) l.em_lote++; });
    });
    const ev: Record<string, { on: number; ook: number; en: number; eok: number }> = {};
    itens.forEach((x) => {
        if (x.T.fase06 !== undefined) { const ag = x.U.fase05 || x.U.fase06; if (ag) { const e = (ev[ag] ??= { on: 0, ook: 0, en: 0, eok: 0 }); e.on++; if (x.r.foto_fim_ornamentacao_em) e.ook++; } }
        if (x.T.fase08 !== undefined) { const ag = x.U.fase07 || x.U.fase08; if (ag) { const e = (ev[ag] ??= { on: 0, ook: 0, en: 0, eok: 0 }); e.en++; if (x.r.foto_entrega_corpo_em) e.eok++; } }
    });
    const ociosos = itens.map((x) => x.ocioso).filter((v): v is number => v != null);

    /* ---- perfil ---- */
    const servicosDef: [string, (r: Registro) => boolean][] = [
        ["Tanatopraxia", (r) => ehSim(r.tanato)], ["Ornamentação", (r) => ehSim(r.ornamentacao)],
        ["· flores naturais", (r) => ehSim(r.ornamentacao) && norm(r.ornamentacao_tipo) === "natural"],
        ["· flores artificiais", (r) => ehSim(r.ornamentacao) && norm(r.ornamentacao_tipo) === "artificial"],
        ["Assistência (materiais)", (r) => ehSim(r.assistencia)], ["Véu", (r) => ehSim(r.veu)], ["Cordão", (r) => ehSim(r.cordao)],
        ["Invol", (r) => ehSim(r.invol)], ["Coroa de flores", (r) => ehSim(r.coroa_flores)], ["Velório online", (r) => ehSim(r.velorio_online)], ["Kit lanche", (r) => ehSim(r.kit_lanche)],
    ];
    const camposDef: [string, (x: It) => boolean][] = [
        ["Data de falecimento", (x) => dataValida(x.r.data_falecimento)], ["Data de nascimento", (x) => dataValida(x.r.data_nascimento)],
        ["Foto do falecido", (x) => !!x.r.foto_falecido], ["Religião", (x) => x.religiao !== "Não informado"],
        ["Local do velório", (x) => x.velorio !== "Não informado"],
        ["Horário do velório", (x) => { const h = String(x.r.hora_inicio_velorio ?? ""); return !!h && !h.startsWith("00:00"); }],
        ["Cemitério", (x) => !["Não informado", "A definir"].includes(x.cemiterio)], ["Urna", (x) => x.urna !== "Não informada"],
        ["CPF do responsável (opcional)", (x) => !!x.r.cpf_responsavel],
        ["Assinatura (opcional)", (x) => !!(x.r.assinatura_responsavel || x.r.assinatura_requerente || x.r.__assinatura)],
        ["Tipo de atendimento", (x) => !!String(x.r.tipo_atendimento ?? "").trim()],
    ];
    const essenciais = ["Data de nascimento", "Foto do falecido", "Religião", "Horário do velório", "Cemitério", "Urna"];
    const qa: Record<string, number[]> = {};
    itens.forEach((x) => { const ok = camposDef.filter(([l, f]) => essenciais.includes(l) && f(x)).length; (qa[x.b.agente] ??= []).push((ok / essenciais.length) * 100); });
    const faixas: [string, number, number][] = [["0–17", 0, 17], ["18–39", 18, 39], ["40–59", 40, 59], ["60–69", 60, 69], ["70–79", 70, 79], ["80–89", 80, 89], ["90+", 90, 200]];

    return {
        periodo: { inicio: p.inicio, fim: p.fim, ref: "criacao", dias: p.dias, anterior: { inicio: p.antInicio, fim: p.antFim, total: p.anterior } },
        resumo,
        serie: { granularidade: gran, pontos: [...pontos.values()] },
        convenios: conta(itens, (x) => x.b.convenio),
        heatmap: heat, dia_semana,
        velorio: conta(itens, (x) => x.velorio), cemiterio: conta(itens, (x) => x.cemiterio),
        equipe: {
            etapas, ocioso: { n: ociosos.length, mediana_h: r2(mediana(ociosos)), p90_h: r2(quantil(ociosos, 0.9)) },
            matriz: matrizOut, meses, mensal: mensalOut,
            pontualidade: { velorio: pontual("fase08", "data_inicio_velorio", "hora_inicio_velorio", "fase07"), sepultamento: pontual("fase10", "data_fim_velorio", "hora_fim_velorio", "fase09") },
            registro_lote: Object.entries(lote).map(([agente, v]) => ({ agente, ...v, pct: pct(v.em_lote, v.trocas) })).sort((a, b) => b.trocas - a.trocas),
            evidencias: Object.entries(ev).map(([agente, v]) => ({ agente, ornamentacao: { n: v.on, com_foto: v.ook, pct: pct(v.ook, v.on) }, entrega: { n: v.en, com_foto: v.eok, pct: pct(v.eok, v.en) } }))
                .sort((a, b) => b.ornamentacao.n + b.entrega.n - (a.ornamentacao.n + a.entrega.n)),
            titulares: conta(itens, (x) => x.b.agente),
        },
        perfil: {
            servicos: servicosDef.map(([nome, f]) => { const c = itens.filter((x) => f(x.r)).length; return { nome, total: c, pct: pct(c, n) }; }),
            urnas: conta(itens, (x) => x.urna),
            roupas: conta(itens, (x) => { const v = String(x.r.roupa ?? "").trim(); return v ? v.toUpperCase() : "Não informada"; }),
            religiao: conta(itens, (x) => x.religiao),
            faixas_etarias: faixas.map(([nome, a, b]) => ({ nome, total: idades.filter((v) => v >= a && v <= b).length })),
            qualidade: camposDef.map(([campo, f]) => { const c = itens.filter(f).length; return { campo, total: c, pct: pct(c, n) }; }),
            qualidade_agente: Object.entries(qa).map(([agente, v]) => ({ agente, pct: Math.round(media(v) ?? 0), n: v.length })).sort((a, b) => b.pct - a.pct),
            status: conta(itens, (x) => x.status || null).map((s) => ({ status: s.nome, rotulo: FASE_ROTULO_APP[s.nome] ?? s.nome, total: s.total })),
        },
        lista: itens.map((x) => ({
            id: Number(x.b.id), falecido: String(x.r.falecido ?? "").trim() || "(sem nome)",
            criado_em: x.T.criado !== undefined ? `${isoDe(x.T.criado)} ${new Date(x.T.criado).toTimeString().slice(0, 8)}` : x.b.dataRef,
            data_falecimento: dataValida(x.r.data_falecimento) ? String(x.r.data_falecimento).slice(0, 10) : null,
            data_sepultamento: dataValida(x.r.data) ? String(x.r.data).slice(0, 10) : null,
            idade: x.idade, convenio: x.b.convenio, agente: x.b.agente, velorio: x.velorio, local_velorio: x.r.local_velorio ?? null,
            cemiterio: x.cemiterio, urna: x.urna, roupa: x.r.roupa ?? null, religiao: x.religiao,
            status: x.status, status_rotulo: FASE_ROTULO_APP[x.status] ?? (x.r.status || "—"), no_quadro: x.r.status ? noQuadro(x.r) : false,
            ciclo_h: r2(x.ciclo), ocioso_h: r2(x.ocioso),
            etapas: Object.fromEntries(Object.entries(x.et).map(([k, e]) => [k, { h: r2(e.h)!, quem: e.quem }])),
        })),
        etapas_definicao: ETAPAS.map(({ chave, rotulo, inicio, fim, credito, tipo }) => ({ chave, rotulo, inicio, fim, credito, tipo })),
    };
}

/* =========================================================
   COMPONENTES BASE
========================================================= */

function ThemeStyles() {
    return (
        <style jsx global>{`
            :root, html:not(.dark) {
                --dash-bg: #f5fafe; --dash-card: #ffffff; --dash-card-soft: #f8fcff; --dash-text: #1f3552; --dash-text-soft: #5c7492;
                --dash-border-light: #cfe4f3; --dash-border-strong: #2f6f91; --dash-blue: #4d8fd5; --dash-blue-dark: #226385;
                --dash-yellow: #f2bc00; --dash-green: #1f7a2d; --dash-teal: #0f8b8d; --dash-slate: #5a6f86; --dash-empty: #e6eef5;
                --dash-danger-border: #f2b0b0; --dash-danger-bg: #fff5f5; --dash-danger-text: #b53b3b; --dash-warn: #9a6700;
                --dash-heat-1: #d6e8f8; --dash-heat-2: #a9cdf0; --dash-heat-3: #6aa9ee; --dash-heat-4: #2f7ec5; --dash-heat-5: #174f86;
                color-scheme: light;
            }
            html.dark {
                --dash-bg: #07111f; --dash-card: #101c2b; --dash-card-soft: #0b1624; --dash-text: #eaf4ff; --dash-text-soft: #9fb8d3;
                --dash-border-light: #213952; --dash-border-strong: #62b48f; --dash-blue: #6aa9ee; --dash-blue-dark: #2f7ea5;
                --dash-yellow: #f4c400; --dash-green: #45a85a; --dash-teal: #2db5b7; --dash-slate: #89a2ba; --dash-empty: #243446;
                --dash-danger-border: #8a3b44; --dash-danger-bg: #321820; --dash-danger-text: #ffb7c0; --dash-warn: #e3b341;
                --dash-heat-1: #16304c; --dash-heat-2: #1e4f7c; --dash-heat-3: #2f7ec5; --dash-heat-4: #6aa9ee; --dash-heat-5: #b9d9fb;
                color-scheme: dark;
            }
            html, body { background: var(--dash-bg) !important; }
        `}</style>
    );
}

function Card({ titulo, dica, acao, children, className = "" }: { titulo?: string; dica?: string; acao?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <section className={`rounded-2xl border p-4 sm:p-5 min-w-0 ${className}`} style={{ background: "var(--dash-card)", borderColor: "var(--dash-border-light)" }}>
            {(titulo || acao) && (
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                        {titulo && <h3 className="text-base font-extrabold" style={{ color: "var(--dash-text)" }}>{titulo}</h3>}
                        {dica && <p className="text-xs" style={{ color: "var(--dash-text-soft)" }}>{dica}</p>}
                    </div>
                    {acao}
                </div>
            )}
            {children}
        </section>
    );
}

function Kpi({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: React.ReactNode; detalhe?: React.ReactNode; alerta?: "ruim" | "atencao" }) {
    const faixa = alerta === "ruim" ? "var(--dash-danger-text)" : alerta === "atencao" ? "var(--dash-warn)" : "transparent";
    return (
        <div className="rounded-2xl border p-4 min-w-0" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border-light)", borderLeft: `5px solid ${faixa}` }}>
            <div className="text-xs font-bold" style={{ color: "var(--dash-text-soft)" }}>{rotulo}</div>
            <div className="mt-1 text-2xl font-black tabular-nums" style={{ color: "var(--dash-text)" }}>{valor}</div>
            {detalhe && <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--dash-text-soft)" }}>{detalhe}</div>}
        </div>
    );
}

function Vazio({ texto = "Sem dados no período" }: { texto?: string }) {
    return <div className="py-8 text-center text-sm" style={{ color: "var(--dash-text-soft)" }}>{texto}</div>;
}

/** Barras horizontais com rótulo, valor e participação. */
function Barras({ itens, total, cor = "var(--dash-blue)", formato, semParticipacao, onClick, ativo, max }: {
    itens: { nome: string; total: number; cor?: string; extra?: string }[]; total?: number; cor?: string;
    formato?: (v: number) => string; semParticipacao?: boolean; onClick?: (nome: string) => void; ativo?: string; max?: number;
}) {
    if (!itens.length || !itens.some((i) => i.total)) return <Vazio />;
    const m = max ?? Math.max(...itens.map((i) => i.total));
    const soma = total ?? itens.reduce((a, i) => a + i.total, 0);
    return (
        <div className="flex flex-col gap-1.5">
            {itens.map((i) => (
                <button key={i.nome} type="button" disabled={!onClick} onClick={() => onClick?.(i.nome)} title={i.extra ?? `${i.nome}: ${fmtN(i.total)}`}
                    className={`grid grid-cols-[minmax(90px,42%)_1fr] items-center gap-2 rounded-md px-1 py-0.5 text-left ${onClick ? "hover:bg-[var(--dash-card-soft)] cursor-pointer" : "cursor-default"}`}>
                    <span className={`truncate text-right text-xs ${ativo === i.nome ? "font-extrabold" : "font-semibold"}`} style={{ color: "var(--dash-text)" }}>{i.nome}</span>
                    <span className="flex items-center gap-2 min-w-0">
                        <span className="h-3 rounded" style={{ width: `${Math.max(i.total ? 2 : 0, (i.total / (m || 1)) * 75)}%`, background: i.cor ?? cor }} />
                        <span className="whitespace-nowrap text-xs tabular-nums" style={{ color: "var(--dash-text)" }}>
                            {formato ? formato(i.total) : fmtN(i.total)}
                            {!semParticipacao && <span style={{ color: "var(--dash-text-soft)" }}> · {fmtP(soma ? (i.total / soma) * 100 : 0)}</span>}
                        </span>
                    </span>
                </button>
            ))}
        </div>
    );
}

/** Colunas empilhadas (SVG) para a série temporal. */
function Colunas({ pontos, series, altura = 220 }: { pontos: { rotulo: string; titulo: string; valores: number[] }[]; series: { nome: string; cor: string }[]; altura?: number }) {
    const [hover, setHover] = useState<number | null>(null);
    const totais = pontos.map((p) => p.valores.reduce((a, v) => a + v, 0));
    if (!pontos.length || !totais.some(Boolean)) return <Vazio />;
    const W = 1000, H = altura, ml = 34, mb = 24, mt = 8;
    const max = Math.max(1, ...totais), passo = (W - ml) / pontos.length, bw = Math.max(2, Math.min(34, passo * 0.7));
    const y = (v: number) => mt + (H - mt - mb) * (1 - v / max);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f * 10) / 10);
    const cada = Math.ceil(pontos.length / 14);
    return (
        <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none" role="img" aria-label="Atendimentos no período">
                {ticks.map((t) => (<g key={t}><line x1={ml} x2={W} y1={y(t)} y2={y(t)} stroke="var(--dash-border-light)" /><text x={ml - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--dash-text-soft)">{t}</text></g>))}
                {pontos.map((p, i) => {
                    let acc = 0;
                    const x = ml + passo * i + (passo - bw) / 2;
                    return (
                        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                            <rect x={ml + passo * i} y={mt} width={passo} height={H - mt - mb} fill="transparent" />
                            {p.valores.map((v, si) => {
                                if (!v) return null;
                                const y1 = y(acc + v), h = y(acc) - y1 - (acc ? 1 : 0);
                                acc += v;
                                return <rect key={si} x={x} y={y1} width={bw} height={Math.max(0, h)} rx={2} fill={series[si].cor} opacity={hover === null || hover === i ? 1 : 0.55} />;
                            })}
                            {i % cada === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--dash-text-soft)">{p.rotulo}</text>}
                        </g>
                    );
                })}
            </svg>
            {hover !== null && (
                <div className="pointer-events-none absolute top-0 right-0 rounded-lg px-3 py-2 text-xs shadow-lg" style={{ background: "var(--dash-text)", color: "var(--dash-bg)" }}>
                    <div className="font-bold">{pontos[hover].titulo}</div>
                    {series.map((s, si) => pontos[hover].valores[si] ? <div key={s.nome} className="flex justify-between gap-4 tabular-nums"><span>{s.nome}</span><span>{pontos[hover].valores[si]}</span></div> : null)}
                    <div className="flex justify-between gap-4 font-bold tabular-nums"><span>Total</span><span>{totais[hover]}</span></div>
                </div>
            )}
        </div>
    );
}

function MapaCalor({ m }: { m: number[][] }) {
    const max = Math.max(0, ...m.flat());
    if (!max) return <Vazio />;
    const dias = [1, 2, 3, 4, 5, 6, 0], nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const nivel = (v: number) => (v ? `var(--dash-heat-${1 + Math.min(4, Math.floor((v / max) * 4.999))})` : "var(--dash-empty)");
    return (
        <div className="overflow-x-auto">
            <div className="grid min-w-[560px] gap-[3px]" style={{ gridTemplateColumns: "34px repeat(24, minmax(0,1fr))" }}>
                {dias.map((d) => (
                    <React.Fragment key={d}>
                        <span className="text-right text-[11px] pr-1" style={{ color: "var(--dash-text-soft)" }}>{nomes[d]}</span>
                        {m[d].map((v, h) => <span key={h} title={`${nomes[d]} ${pad2(h)}h: ${v}`} className="h-5 rounded-[3px]" style={{ background: nivel(v) }} />)}
                    </React.Fragment>
                ))}
                <span />
                {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[10px]" style={{ color: "var(--dash-text-soft)" }}>{h % 3 === 0 ? `${pad2(h)}h` : ""}</span>)}
            </div>
        </div>
    );
}

function Tabela({ cabecalho, linhas, larguraMin = 640 }: { cabecalho: React.ReactNode[]; linhas: React.ReactNode[][]; larguraMin?: number }) {
    if (!linhas.length) return <Vazio />;
    return (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--dash-border-light)" }}>
            <table className="w-full text-sm" style={{ minWidth: larguraMin, color: "var(--dash-text)" }}>
                <thead><tr style={{ background: "var(--dash-card-soft)" }}>{cabecalho.map((c, i) => <th key={i} className={`px-3 py-2 text-xs font-bold whitespace-nowrap ${i ? "text-right" : "text-left"}`} style={{ color: "var(--dash-text-soft)" }}>{c}</th>)}</tr></thead>
                <tbody>{linhas.map((l, i) => <tr key={i} className="border-t" style={{ borderColor: "var(--dash-border-light)" }}>{l.map((c, j) => <td key={j} className={`px-3 py-2 tabular-nums whitespace-nowrap ${j ? "text-right" : "text-left font-semibold"}`}>{c}</td>)}</tr>)}</tbody>
            </table>
        </div>
    );
}


/* =========================================================
   AVALIAÇÕES (visita.php?action=painel_avaliacoes)
========================================================= */
const VISITA_URL = "/api/php/visita.php";

type Avaliacao = {
    id: number; atendimento_id: number; tipo: string; falecido_nome: string;
    avaliador_id: number | null; avaliador_nome: string; avaliador_cargo: string; status: string;
    inicio_em: string | null; fim_em: string | null; duracao_segundos: number | null;
    fase08_em: string | null; tempo_fase08_ate_visita_segundos: number | null;
    com_quem_conversou: string | null; grau_parentesco: string | null; observacao_geral: string | null;
};
type NotaColab = {
    avaliacao_id: number; atendimento_id: number; tipo_avaliacao: string; pergunta_numero: number;
    pergunta_codigo: string; pergunta_titulo: string; nota_original: string; nota_valor: number | null;
    responsavel_usuario_id: number | null; responsavel_nome: string | null; responsavel_login: string | null;
    fase_referencia: string | null; avaliador_nome: string | null; criado_em: string | null;
};
type AvalResp = {
    sucesso?: boolean; erro?: boolean; msg?: string; sem_permissao?: boolean;
    permissoes?: { visita: boolean; pos_atendimento: boolean };
    avaliacoes?: Avaliacao[]; notas?: NotaColab[];
};
type AvalEstado = { carregando: boolean; erro: string | null; semPermissao: boolean; dados: AvalResp | null };

/** Pergunta da avaliação → etapa do painel (mesma atribuição de responsável feita pelo visita.php). */
const PERGUNTA_ETAPA: Record<string, string> = {
    primeiro_atendimento: "resposta", remocao: "remocao", preparacao: "conservacao", apresentacao_corpo: "ornamentacao",
    cerimonia_horario: "transporte", montagem_ambiente: "velorio", sepultamento: "sepultamento",
};
const PERGUNTA_TITULO: Record<string, string> = {
    primeiro_atendimento: "Primeiro atendimento", remocao: "Remoção", preparacao: "Preparação", apresentacao_corpo: "Apresentação do corpo",
    cerimonia_horario: "Cerimônia no horário", montagem_ambiente: "Montagem do ambiente", sepultamento: "Sepultamento",
};
const TIPO_AVAL: Record<string, string> = { visita: "Visita", pos_atendimento: "Pós-atendimento" };

/** Notas de 1 a 5 exibidas em % (5 = 100%). */
const NOTA_MAX = 5;
const notaPct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round((v / NOTA_MAX) * 100)}%`);
const corNota = (m: number) => { const p = m / NOTA_MAX; return p >= 0.9 ? "var(--dash-green)" : p >= 0.75 ? "var(--dash-blue)" : p >= 0.6 ? "var(--dash-yellow)" : "var(--dash-danger-text)"; };
const avConcluida = (a: Avaliacao) => norm(a.status) === "visitado";
const segH = (s: number | null | undefined) => (s == null ? null : s / 3600);

async function carregarAvaliacoes(inicio: string, fim: string): Promise<AvalResp> {
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), 30000);
    try {
        const res = await fetch(`${VISITA_URL}?action=painel_avaliacoes&data_de=${inicio}&data_ate=${fim}&_ts=${Date.now()}`, { method: "GET", credentials: "include", cache: "no-store", signal: ac.signal });
        const json = (await res.json().catch(() => null)) as AvalResp | null;
        if (res.status === 401 || (json as any)?.need_login) throw new LoginError(json?.msg || "Sessão expirada. Faça login novamente.");
        if (res.status === 403) return { erro: true, sem_permissao: true, msg: json?.msg || "Usuário sem permissão para visualizar avaliações." };
        if (!res.ok || !json || json.erro) throw new Error(json?.msg || `HTTP ${res.status}`);
        return json;
    } finally {
        window.clearTimeout(t);
    }
}

/**
 * Casa o responsável da nota (nome completo ou login do cadastro de usuários) com o nome usado no histórico de fases.
 * Tenta nome, depois login, depois o primeiro nome quando ele é único entre os conhecidos.
 */
function resolverNome(n: NotaColab, conhecidos: Set<string>): string {
    const cands = [n.responsavel_nome, n.responsavel_login].map((v) => nomeProprio(v)).filter(Boolean);
    for (const c of cands) if (conhecidos.has(c)) return c;
    for (const c of cands) {
        const p = c.split(" ")[0];
        const hits = [...conhecidos].filter((k) => k.split(" ")[0] === p);
        if (hits.length === 1) return hits[0];
    }
    return cands[0] || "Não identificado";
}
function nomesConhecidos(d: Painel): Set<string> {
    const s = new Set<string>();
    d.lista.forEach((x) => { if (x.agente) s.add(x.agente); Object.values(x.etapas).forEach((e) => e.quem && s.add(e.quem)); });
    d.equipe.matriz.forEach((l) => s.add(l.agente));
    return s;
}
/** Avaliações e notas só dos atendimentos que estão no painel (respeita período, convênio e agente). */
function avalDoPainel(d: Painel, av: AvalResp | null) {
    const ids = new Set(d.lista.map((x) => x.id));
    const avaliacoes = (av?.avaliacoes ?? []).filter((a) => ids.has(Number(a.atendimento_id)));
    const notas = (av?.notas ?? []).filter((n) => ids.has(Number(n.atendimento_id)));
    return { avaliacoes, notas };
}

/* =========================================================
   ABAS
========================================================= */

function AbaGeral({ d, filtrar }: { d: Painel; filtrar: (campo: "convenio", v: string) => void }) {
    const r = d.resumo;
    const series = d.convenios.map((c) => ({ nome: c.nome, cor: corConv(c.nome) }));
    const pontos = d.serie.pontos.map((p) => ({
        rotulo: p.rotulo,
        titulo: d.serie.granularidade === "semana" ? `Semana de ${p.rotulo}` : p.rotulo,
        valores: series.map((s) => p.por_convenio[s.nome] ?? 0),
    }));
    const piorQual = [...d.perfil.qualidade].sort((a, b) => a.pct - b.pct)[0];
    const lenta = [...d.equipe.etapas].filter((e) => e.tipo === "execucao" && e.chave !== "velorio" && e.n >= 3).sort((a, b) => (b.mediana_h ?? 0) - (a.mediana_h ?? 0))[0];
    const topDia = [...d.dia_semana].sort((a, b) => b.media - a.media)[0];
    const destaques: [string, React.ReactNode][] = [];
    if (r.variacao_pct != null) destaques.push(["Tendência", <><b>{fmtN(r.total)}</b> atendimentos, <b>{r.variacao_pct >= 0 ? `${fmtP(r.variacao_pct)} a mais` : `${fmtP(-r.variacao_pct)} a menos`}</b> que no período anterior ({fmtN(r.anterior)}).</>]);
    if (topDia) destaques.push(["Pico de demanda", <><b>{topDia.dia}</b> é o dia mais movimentado ({topDia.media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia).</>]);
    if (d.convenios[0]) destaques.push(["Convênio", <><b>{d.convenios[0].nome}</b> responde por {fmtP((d.convenios[0].total / (r.total || 1)) * 100)} dos atendimentos.</>]);
    if (lenta) destaques.push(["Etapa mais longa", <>Fora o velório, <b>{lenta.rotulo.toLowerCase()}</b> tem a maior mediana: <b>{fmtH(lenta.mediana_h)}</b>.</>]);
    if (piorQual) destaques.push(["Atenção ao cadastro", <><b>{piorQual.campo}</b> preenchido em só {fmtP(piorQual.pct)} dos atendimentos.</>]);

    return (
        <div className="flex flex-col gap-4">
            {d.em_andamento.length > 0 && (
                <div>
                    <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-text-soft)" }}>Em andamento agora · {d.em_andamento.length}</h2>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                        {d.em_andamento.map((a) => (
                            <div key={a.id} className="min-w-[240px] rounded-xl border p-3" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border-light)" }}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-extrabold" style={{ color: "var(--dash-text)" }}>{a.falecido}</span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${STATUS_COR[a.status] ?? "bg-slate-500"}`}>{a.status_rotulo}</span>
                                </div>
                                <div className="mt-1 text-xs" style={{ color: "var(--dash-text-soft)" }}>{a.velorio} · {a.convenio}</div>
                                <div className="text-xs" style={{ color: "var(--dash-text-soft)" }}>Aberto há {fmtH(a.horas_desde_cadastro)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Kpi rotulo="Atendimentos" valor={fmtN(r.total)} detalhe={r.variacao_pct == null ? `anterior: ${fmtN(r.anterior)}` : <span style={{ color: r.variacao_pct >= 0 ? "var(--dash-green)" : "var(--dash-danger-text)" }}>{r.variacao_pct >= 0 ? "▲" : "▼"} {fmtP(Math.abs(r.variacao_pct))} vs {fmtN(r.anterior)}</span>} />
                <Kpi rotulo="Média por dia" valor={r.media_dia.toLocaleString("pt-BR")} detalhe={`${d.periodo.dias} dia(s)`} />
                <Kpi rotulo="Pico em um dia" valor={r.pico ? fmtN(r.pico.total) : "—"} detalhe={r.pico ? `em ${dataBR(r.pico.data)}` : ""} />
                <Kpi rotulo="Idade média" valor={r.idade_media != null ? `${r.idade_media} anos` : "—"} detalhe={`${fmtN(r.idade_n)} com nascimento`} />
                <Kpi rotulo="Cadastro → sepultamento" valor={fmtH(r.ciclo_mediana_h)} detalhe={r.ciclo_n ? `mediana · 90% em até ${fmtH(r.ciclo_p90_h)}` : "sem marcações"} />
                <Kpi rotulo="Ainda no quadro" valor={fmtN(r.em_andamento_periodo)} detalhe="deste período" alerta={r.em_andamento_periodo ? "atencao" : undefined} />
            </div>

            {destaques.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {destaques.map(([k, v]) => (
                        <div key={k} className="rounded-xl border p-3 text-sm" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border-light)", color: "var(--dash-text-soft)" }}>
                            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-blue-dark)" }}>{k}</div>
                            <div style={{ color: "var(--dash-text)" }}>{v}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-3">
                <Card titulo="Volume de atendimentos" dica={`Por ${d.serie.granularidade} · empilhado por convênio`} className="xl:col-span-2"
                    acao={<div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--dash-text-soft)" }}>{series.map((s) => <span key={s.nome} className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />{s.nome}</span>)}</div>}>
                    <Colunas pontos={pontos} series={series} />
                </Card>
                <Card titulo="Mix por convênio" dica="Clique para filtrar">
                    <Barras itens={d.convenios.map((c) => ({ ...c, cor: corConv(c.nome) }))} onClick={(v) => filtrar("convenio", v)} />
                </Card>
                <Card titulo="Quando os atendimentos chegam" dica="Horário de cadastro por dia da semana" className="xl:col-span-2"><MapaCalor m={d.heatmap} /></Card>
                <Card titulo="Média por dia da semana" dica="Atendimentos por dia no período">
                    <Barras itens={d.dia_semana.map((x) => ({ nome: x.dia, total: x.media, extra: `${x.total} em ${x.dias} dia(s)` }))} formato={(v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} semParticipacao />
                </Card>
                <Card titulo="Local do velório" dica="Agrupado"><Barras itens={d.velorio} total={r.total} /></Card>
                <Card titulo="Local de sepultamento" dica="Top 8"><Barras itens={d.cemiterio.slice(0, 8)} total={r.total} /></Card>
            </div>
        </div>
    );
}

function AbaEquipe({ d, av }: { d: Painel; av: AvalEstado }) {
    const [modo, setModo] = useState<"hn" | "n" | "horas">("hn");
    const e = d.equipe;
    const exec = e.etapas.filter((x) => x.tipo === "execucao");
    const esp = e.etapas.filter((x) => x.tipo === "espera");
    const pv = e.pontualidade.velorio, ps = e.pontualidade.sepultamento;
    const loteTot = e.registro_lote.reduce((a, x) => a + x.trocas, 0), loteN = e.registro_lote.reduce((a, x) => a + x.em_lote, 0);
    const semHistorico = d.resumo.com_historico < d.resumo.total;

    /* Notas da família por pessoa e por etapa (pergunta → etapa, responsável definido pelo visita.php) */
    const { notasPorEtapa, notasGerais, pessoasSoComNota } = useMemo(() => {
        const { notas } = avalDoPainel(d, av.dados);
        const conhecidos = nomesConhecidos(d);
        const porEtapa: Record<string, Record<string, number[]>> = {}, gerais: Record<string, number[]> = {};
        notas.forEach((n) => {
            if (n.nota_valor == null || !n.responsavel_nome && !n.responsavel_login) return;
            const w = resolverNome(n, conhecidos);
            (gerais[w] ??= []).push(n.nota_valor);
            const et = PERGUNTA_ETAPA[n.pergunta_codigo];
            if (et) ((porEtapa[w] ??= {})[et] ??= []).push(n.nota_valor);
        });
        const naMatriz = new Set(e.matriz.map((l) => l.agente));
        return { notasPorEtapa: porEtapa, notasGerais: gerais, pessoasSoComNota: Object.keys(gerais).filter((w) => !naMatriz.has(w)).sort((a, b) => a.localeCompare(b, "pt-BR")) };
    }, [d, av.dados, e.matriz]);

    const linhas: MatrizLinha[] = modo === "hn" ? [...e.matriz, ...pessoasSoComNota.map((agente) => ({ agente, etapas: {}, total_n: 0, total_h: 0 }))] : e.matriz;
    const colMax: Record<string, number> = {};
    const val = (c?: { n: number; horas: number; mediana_h: number | null }) => (!c ? null : modo === "n" ? c.n : c.horas);
    exec.forEach((x) => { colMax[x.chave] = Math.max(0, ...e.matriz.map((l) => val(l.etapas[x.chave]) ?? 0)); });
    const tom = (v: number | null, m: number) => {
        if (!v || !m) return {};
        const t = v / m, k = t > 0.8 ? 5 : t > 0.6 ? 4 : t > 0.4 ? 3 : t > 0.2 ? 2 : 1;
        return { background: `var(--dash-heat-${k})`, color: k >= 4 ? "#fff" : "var(--dash-text)" };
    };
    const chip = (arr?: number[]) => {
        if (!arr || !arr.length) return <span className="text-[11px]" style={{ color: "var(--dash-text-soft)" }}>sem nota</span>;
        const m = media(arr)!;
        return <span className="mt-0.5 inline-block rounded-full px-2 text-[11px] font-extrabold tabular-nums text-white" style={{ background: corNota(m) }} title={`${arr.length} nota(s) da família`}>{notaPct(m)}</span>;
    };
    const infoNotas = av.semPermissao ? "Sem permissão para ver as avaliações." : av.erro ? `Notas indisponíveis: ${av.erro}` : av.carregando ? "Carregando as notas…" : `${fmtN(Object.values(notasGerais).reduce((a, v) => a + v.length, 0))} notas da família no período.`;

    return (
        <div className="flex flex-col gap-4">
            {semHistorico && (
                <div className="rounded-xl border px-4 py-2 text-xs" style={{ borderColor: "var(--dash-border-light)", color: "var(--dash-text-soft)", background: "var(--dash-card)" }}>
                    {fmtN(d.resumo.total - d.resumo.com_historico)} atendimento(s) do período não têm histórico de fases e ficam de fora dos tempos.
                </div>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <Kpi rotulo="Cadastro → sepultamento" valor={fmtH(d.resumo.ciclo_mediana_h)} detalhe={`mediana · n=${fmtN(d.resumo.ciclo_n)}`} />
                <Kpi rotulo="Tempo ocioso por atendimento" valor={fmtH(e.ocioso.mediana_h)} detalhe={`mediana · 90% até ${fmtH(e.ocioso.p90_h)}`} />
                <Kpi rotulo="Velório no horário" valor={fmtP(pv.no_horario_pct)} detalhe={`até 15 min · atraso mediano ${pv.atraso_mediana_min ?? "—"} min · n=${pv.n}`} alerta={pv.n && pv.no_horario_pct < 70 ? "atencao" : undefined} />
                <Kpi rotulo="Sepultamento no horário" valor={fmtP(ps.no_horario_pct)} detalhe={`até 15 min · atraso mediano ${ps.atraso_mediana_min ?? "—"} min · n=${ps.n}`} alerta={ps.n && ps.no_horario_pct < 70 ? "atencao" : undefined} />
                <Kpi rotulo="Fases marcadas em lote" valor={fmtP(loteTot ? (loteN / loteTot) * 100 : 0)} detalhe="< 60 s da fase anterior" alerta={loteTot && loteN / loteTot > 0.15 ? "atencao" : undefined} />
            </div>

            <Card titulo="Tempo por etapa" dica="Mediana entre o início e o fim de cada etapa (manual de procedimentos)">
                <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
                    {exec.map((x) => (
                        <div key={x.chave} className="rounded-xl p-3" style={{ background: "var(--dash-card-soft)", border: "1px solid var(--dash-border-light)" }} title={`Média ${fmtH(x.media_h)} · 90% até ${fmtH(x.p90_h)}`}>
                            <div className="text-xs font-bold" style={{ color: "var(--dash-text-soft)" }}>{x.rotulo}</div>
                            <div className="text-xl font-black tabular-nums" style={{ color: "var(--dash-text)" }}>{x.n ? fmtH(x.mediana_h) : "—"}</div>
                            <div className="text-[11px] tabular-nums" style={{ color: "var(--dash-text-soft)" }}>n={x.n}{x.n ? ` · 90% até ${fmtH(x.p90_h)}` : ""}</div>
                        </div>
                    ))}
                </div>
                <div className="mt-3 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-text-soft)" }}>Esperas entre etapas</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
                    {esp.map((x) => (
                        <div key={x.chave} className="rounded-lg px-3 py-2" style={{ background: "var(--dash-empty)" }}>
                            <div className="text-xs" style={{ color: "var(--dash-text-soft)" }}>{x.rotulo}</div>
                            <div className="text-base font-extrabold tabular-nums" style={{ color: "var(--dash-text)" }}>{x.n ? fmtH(x.mediana_h) : "—"} <span className="text-[11px] font-normal" style={{ color: "var(--dash-text-soft)" }}>n={x.n}</span></div>
                        </div>
                    ))}
                </div>
            </Card>

            <Card titulo="Etapas por agente"
                dica={modo === "hn" ? `Tempo médio de cada etapa e a nota média da família para quem foi responsável por ela (notas de 1 a 5 em %, 5 = 100%) · ${infoNotas}` : modo === "n" ? "Quantas etapas cada agente iniciou (quem tocou o comando de início)" : "Horas somadas das etapas que cada agente iniciou"}
                acao={<div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: "var(--dash-border-light)" }}>{([["hn", "Horas médias e nota"], ["n", "Quantidade"], ["horas", "Horas totais"]] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setModo(k)} className="rounded-md px-3 py-1 text-xs font-bold" style={modo === k ? { background: "var(--dash-blue-dark)", color: "#fff" } : { color: "var(--dash-text-soft)" }}>{l}</button>))}</div>}>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] border-separate text-sm" style={{ borderSpacing: 3, color: "var(--dash-text)" }}>
                        <thead><tr>
                            <th className="text-left text-xs" style={{ color: "var(--dash-text-soft)" }}>Agente</th>
                            {modo === "hn" && <th className="text-center text-xs font-bold" style={{ color: "var(--dash-text-soft)" }} title="Nota do primeiro atendimento (agente que abriu o atendimento)">1º atendimento</th>}
                            {exec.map((x) => <th key={x.chave} className="text-center text-xs font-bold" style={{ color: "var(--dash-text-soft)" }}>{x.rotulo}</th>)}
                            <th className="text-center text-xs" style={{ color: "var(--dash-text-soft)" }}>Total</th>
                        </tr></thead>
                        <tbody>
                            {linhas.map((l) => {
                                const np = notasPorEtapa[l.agente] ?? {};
                                return (
                                    <tr key={l.agente}>
                                        <td className="font-bold whitespace-nowrap">{l.agente}</td>
                                        {modo === "hn" && <td className="rounded-md px-2 py-1.5 text-center" style={{ background: np.resposta?.length ? "var(--dash-card-soft)" : undefined }}>{np.resposta?.length ? chip(np.resposta) : <span style={{ color: "var(--dash-text-soft)" }}>—</span>}</td>}
                                        {exec.map((x) => {
                                            const c = l.etapas[x.chave];
                                            const tip = c ? `${c.n} vez(es) · ${fmtH(c.horas)} somadas · média ${fmtH(c.horas / c.n)} · mediana ${fmtH(c.mediana_h)}` : "";
                                            if (modo === "hn") {
                                                const nt = np[x.chave];
                                                if (!c && !nt?.length) return <td key={x.chave} className="text-center" style={{ color: "var(--dash-text-soft)" }}>—</td>;
                                                return (
                                                    <td key={x.chave} className="rounded-md px-2 py-1.5 text-center leading-tight" style={{ background: "var(--dash-card-soft)" }} title={`${tip}${nt?.length ? ` · nota ${notaPct(media(nt))} (${nt.length})` : ""}`}>
                                                        <div className="tabular-nums">{c ? fmtH(c.horas / c.n) : "—"}</div>
                                                        {chip(nt)}
                                                    </td>
                                                );
                                            }
                                            const v = val(c);
                                            return <td key={x.chave} className="rounded-md px-2 py-1.5 text-center tabular-nums" style={tom(v, colMax[x.chave])} title={tip}>{v == null ? <span style={{ color: "var(--dash-text-soft)" }}>—</span> : modo === "n" ? v : fmtH(v)}</td>;
                                        })}
                                        <td className="rounded-md px-2 py-1.5 text-center font-extrabold tabular-nums leading-tight" style={{ background: "var(--dash-card-soft)" }}>
                                            {modo === "hn" ? (<><div>{l.total_n ? fmtH(l.total_h / l.total_n) : "—"}</div>{chip(notasGerais[l.agente])}</>) : modo === "n" ? l.total_n : fmtH(l.total_h)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {!linhas.length && <Vazio />}
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--dash-text-soft)" }}>
                    {modo === "hn"
                        ? "Nota: verde a partir de 90%, azul a partir de 75%, amarelo a partir de 60%, vermelho abaixo. \"Não sei\" não entra na média. Primeiro atendimento: nota do agente que abriu o atendimento."
                        : "Cores mais fortes = valor maior dentro da mesma etapa."}
                </p>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card titulo="Etapas concluídas por mês" dica="Etapas de execução iniciadas por cada agente">
                    <Tabela cabecalho={["Agente", ...e.meses.map(mesRotulo), "Total"]} linhas={e.mensal.map((l) => [l.agente, ...e.meses.map((m) => l.meses[m] || "—"), <b key="t">{Object.values(l.meses).reduce((a, v) => a + v, 0)}</b>])} larguraMin={420} />
                </Card>
                <Card titulo="Pontualidade por agente" dica="% no horário combinado (até 15 min) · atraso mediano">
                    <Tabela cabecalho={["Agente", "Velório (n)", "No horário", "Atraso", "Sepult. (n)", "No horário", "Atraso"]}
                        linhas={Array.from(new Set([...pv.por_agente.map((x) => x.agente), ...ps.por_agente.map((x) => x.agente)])).map((ag) => {
                            const a = pv.por_agente.find((x) => x.agente === ag), b = ps.por_agente.find((x) => x.agente === ag);
                            return [ag, a?.n ?? "—", a ? fmtP(a.no_horario_pct) : "—", a?.atraso_mediana_min != null ? `${a.atraso_mediana_min} min` : "—", b?.n ?? "—", b ? fmtP(b.no_horario_pct) : "—", b?.atraso_mediana_min != null ? `${b.atraso_mediana_min} min` : "—"];
                        })} larguraMin={560} />
                </Card>
                <Card titulo="Evidências e registro no momento real" dica="Fotos obrigatórias (meta 100%) e fases marcadas a menos de 60 s da anterior">
                    <Tabela cabecalho={["Agente", "Foto ornamentação", "Foto entrega", "Trocas de fase", "Em lote"]}
                        linhas={Array.from(new Set([...e.evidencias.map((x) => x.agente), ...e.registro_lote.map((x) => x.agente)])).map((ag) => {
                            const v = e.evidencias.find((x) => x.agente === ag), l = e.registro_lote.find((x) => x.agente === ag);
                            return [ag, v?.ornamentacao.n ? `${fmtP(v.ornamentacao.pct)} (${v.ornamentacao.n})` : "—", v?.entrega.n ? `${fmtP(v.entrega.pct)} (${v.entrega.n})` : "—", l?.trocas ?? "—",
                                l ? <span key="l" style={{ color: l.pct > 15 ? "var(--dash-danger-text)" : undefined }}>{fmtP(l.pct)}</span> : "—"];
                        })} larguraMin={520} />
                </Card>
                <Card titulo="Atendimentos abertos por agente" dica="Quem cadastrou o atendimento (campo agente)">
                    <Barras itens={e.titulares.slice(0, 12)} total={d.resumo.total} />
                </Card>
            </div>
        </div>
    );
}

const ORDEM_FASES = ["aguardando", "fase01", "fase02", "fase03", "fase04", "fase05", "fase06", "fase12", "fase07", "fase08", "fase09", "fase10", "fase11"];
const rankFase = (s: string) => ORDEM_FASES.indexOf(s);

function Pill({ ok, texto }: { ok: boolean; texto: string }) {
    return <span className="rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap" style={ok ? { background: "color-mix(in srgb, var(--dash-green) 16%, transparent)", color: "var(--dash-green)" } : { background: "color-mix(in srgb, var(--dash-yellow) 22%, transparent)", color: "var(--dash-warn)" }}>{texto}</span>;
}
function ChipNota({ m, n }: { m: number | null; n?: number }) {
    if (m == null) return <span className="text-xs" style={{ color: "var(--dash-text-soft)" }}>—</span>;
    return <span className="inline-block rounded-full px-2 text-xs font-extrabold tabular-nums text-white" style={{ background: corNota(m) }} title={n != null ? `${n} nota(s)` : undefined}>{notaPct(m)}</span>;
}

type LinhaAgente = { w: string; n: number; aval: number; media: number; dist: number[]; max: number; baixas: number; vis: number; pos: number; atuou: number; cob: number | null };

function AbaVisitas({ d, av, abrirAtendimento }: { d: Painel; av: AvalEstado; abrirAtendimento: (id: number) => void }) {
    const [ordem, setOrdem] = useState<{ k: keyof LinhaAgente; dir: 1 | -1 }>({ k: "media", dir: -1 });
    const [aberta, setAberta] = useState<Avaliacao | null>(null);

    const c = useMemo(() => {
        const { avaliacoes, notas } = avalDoPainel(d, av.dados);
        const vis = avaliacoes.filter((a) => a.tipo === "visita"), pos = avaliacoes.filter((a) => a.tipo === "pos_atendimento");
        const visOk = new Set(vis.filter(avConcluida).map((a) => a.atendimento_id)), posOk = new Set(pos.filter(avConcluida).map((a) => a.atendimento_id));
        const visAlguma = new Set(vis.map((a) => a.atendimento_id)), posAlguma = new Set(pos.map((a) => a.atendimento_id));
        const elegVis = d.lista.filter((x) => x.velorio !== "Sem velório" && rankFase(x.status) >= rankFase("fase08"));
        const elegPos = d.lista.filter((x) => x.status === "fase10" || x.status === "fase11");
        const tAte = vis.map((a) => segH(a.tempo_fase08_ate_visita_segundos)).filter((v): v is number => v != null && v >= 0);
        const dur = avaliacoes.filter(avConcluida).map((a) => segH(a.duracao_segundos)).filter((v): v is number => v != null && v >= 0);
        const validas = notas.filter((n) => n.nota_valor != null);
        const mediaTipo = (t: string) => media(validas.filter((n) => n.tipo_avaliacao === t).map((n) => n.nota_valor!));

        /* Desempenho por agente */
        const conhecidos = nomesConhecidos(d);
        const atuou: Record<string, Set<number>> = {};
        d.lista.forEach((x) => { [x.agente, ...Object.values(x.etapas).map((e) => e.quem)].filter(Boolean).forEach((w) => (atuou[w] ??= new Set()).add(x.id)); });
        const G: Record<string, { notas: number[]; av: Set<number>; at: Set<number>; vis: Set<number>; pos: Set<number> }> = {};
        validas.forEach((n) => {
            const w = (n.responsavel_nome || n.responsavel_login) ? resolverNome(n, conhecidos) : "Não identificado";
            const g = (G[w] ??= { notas: [], av: new Set(), at: new Set(), vis: new Set(), pos: new Set() });
            g.notas.push(n.nota_valor!); g.av.add(n.avaliacao_id); g.at.add(n.atendimento_id);
            (n.tipo_avaliacao === "pos_atendimento" ? g.pos : g.vis).add(n.avaliacao_id);
        });
        const agentes: LinhaAgente[] = Object.entries(G).map(([w, g]) => {
            const nAt = atuou[w]?.size ?? 0;
            return {
                w, n: g.notas.length, aval: g.av.size, media: media(g.notas)!, dist: [1, 2, 3, 4, 5].map((k) => g.notas.filter((v) => v === k).length),
                max: (g.notas.filter((v) => v === NOTA_MAX).length / g.notas.length) * 100, baixas: g.notas.filter((v) => v <= 2).length,
                vis: g.vis.size, pos: g.pos.size, atuou: nAt, cob: nAt ? Math.min(100, ([...g.at].filter((id) => atuou[w].has(id)).length / nAt) * 100) : null,
            };
        });

        /* Por pergunta: visita x pós */
        const perg: Record<string, { v: number[]; p: number[] }> = {};
        validas.forEach((n) => { const g = (perg[n.pergunta_codigo] ??= { v: [], p: [] }); (n.tipo_avaliacao === "pos_atendimento" ? g.p : g.v).push(n.nota_valor!); });
        const perguntas = Object.entries(perg).map(([k, g]) => ({ k, titulo: PERGUNTA_TITULO[k] ?? k, v: media(g.v), nv: g.v.length, p: media(g.p), np: g.p.length }))
            .sort((a, b) => Object.keys(PERGUNTA_TITULO).indexOf(a.k) - Object.keys(PERGUNTA_TITULO).indexOf(b.k));

        const porAvaliador = conta(avaliacoes, (a) => nomeProprio(a.avaliador_nome) || "Não informado");
        const baixas = validas.filter((n) => n.nota_valor! <= 2).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
        const falecido = new Map(d.lista.map((x) => [x.id, x.falecido]));
        return {
            avaliacoes: [...avaliacoes].sort((a, b) => String(b.inicio_em).localeCompare(String(a.inicio_em))), notas, vis, pos, visOk, posOk, elegVis, elegPos, tAte, dur,
            mediaVis: mediaTipo("visita"), mediaPos: mediaTipo("pos_atendimento"), semResp: notas.filter((n) => n.responsavel_usuario_id == null && !n.responsavel_nome).length,
            agentes, perguntas, porAvaliador, baixas, falecido,
            semVisita: elegVis.filter((x) => !visAlguma.has(x.id)), semPos: elegPos.filter((x) => !posAlguma.has(x.id)),
        };
    }, [d, av.dados]);

    if (av.semPermissao) return <Card><Vazio texto="Seu usuário não tem permissão para ver as avaliações (visita-avaliacao ou pos-atendimento-avaliacao)." /></Card>;
    if (av.erro) return <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: "var(--dash-danger-bg)", borderColor: "var(--dash-danger-border)", color: "var(--dash-danger-text)" }}>Não foi possível carregar as avaliações: {av.erro}</div>;
    if (av.carregando && !av.dados) return <Vazio texto="Carregando as avaliações…" />;

    const cobV = c.elegVis.filter((x) => c.visOk.has(x.id)).length, cobP = c.elegPos.filter((x) => c.posOk.has(x.id)).length;
    const sub = (arr: Avaliacao[]) => `${fmtN(arr.filter(avConcluida).length)} concluídas · ${fmtN(arr.filter((a) => !avConcluida(a)).length)} em andamento`;
    const agentes = [...c.agentes].sort((a, b) => {
        const va = a[ordem.k], vb = b[ordem.k];
        if (ordem.k === "w") return ordem.dir * String(va).localeCompare(String(vb), "pt-BR");
        return ordem.dir * (((va as number) ?? -1) - ((vb as number) ?? -1)) || b.n - a.n;
    });
    const MIN = 3;
    const DC = ["var(--dash-danger-text)", "#e8743b", "var(--dash-yellow)", "var(--dash-blue)", "var(--dash-green)"];
    const COLS: [keyof LinhaAgente | "dist", string][] = [["w", "Agente"], ["aval", "Avaliações"], ["media", "Nota média"], ["dist", "Distribuição"], ["max", "Nota máxima"], ["baixas", "Notas baixas"], ["vis", "Visita"], ["pos", "Pós"], ["atuou", "Atendimentos em que atuou"], ["cob", "Atendimentos avaliados"]];
    const cov = (rot: string, a: number, b: number) => {
        const p = b ? (a / b) * 100 : 0;
        return (
            <div>
                <div className="mb-1 flex justify-between gap-2 text-sm"><b>{rot}</b><span className="tabular-nums" style={{ color: "var(--dash-text-soft)" }}>{fmtN(a)} de {fmtN(b)} · {b ? fmtP(p) : "—"}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--dash-empty)" }}><div className="h-full rounded-full" style={{ width: `${p}%`, background: p >= 80 ? "var(--dash-green)" : p >= 50 ? "var(--dash-yellow)" : "var(--dash-danger-text)" }} /></div>
            </div>
        );
    };
    const lista = (arr: ListaItem[], vazio: string) => arr.length ? (
        <ul className="max-h-80 overflow-y-auto">
            {arr.map((x) => (
                <li key={x.id}><button type="button" onClick={() => abrirAtendimento(x.id)} className="flex w-full justify-between gap-3 border-b px-1 py-1.5 text-left text-sm hover:bg-[var(--dash-card-soft)]" style={{ borderColor: "var(--dash-border-light)" }}>
                    <span className="font-semibold">{x.falecido}</span><span className="text-xs whitespace-nowrap tabular-nums" style={{ color: "var(--dash-text-soft)" }}>{x.status_rotulo} · {dataBR(x.criado_em)}</span>
                </button></li>))}
        </ul>
    ) : <Vazio texto={vazio} />;

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Kpi rotulo="Visitas" valor={fmtN(c.vis.length)} detalhe={sub(c.vis)} />
                <Kpi rotulo="Pós-atendimentos" valor={fmtN(c.pos.length)} detalhe={sub(c.pos)} />
                <Kpi rotulo="Cobertura de visita" valor={c.elegVis.length ? fmtP(pct(cobV, c.elegVis.length)) : "—"} detalhe={`${fmtN(cobV)} de ${fmtN(c.elegVis.length)} com velório`} alerta={c.elegVis.length && pct(cobV, c.elegVis.length) < 50 ? "atencao" : undefined} />
                <Kpi rotulo="Cobertura de pós" valor={c.elegPos.length ? fmtP(pct(cobP, c.elegPos.length)) : "—"} detalhe={`${fmtN(cobP)} de ${fmtN(c.elegPos.length)} concluídos`} alerta={c.elegPos.length && pct(cobP, c.elegPos.length) < 50 ? "atencao" : undefined} />
                <Kpi rotulo="Nota média" valor={<span className="flex gap-3"><span title="Visita">{notaPct(c.mediaVis)}</span><span style={{ color: "var(--dash-text-soft)" }}>·</span><span title="Pós-atendimento">{notaPct(c.mediaPos)}</span></span>} detalhe="visita · pós-atendimento (5 = 100%)" />
                <Kpi rotulo="Entrega de corpo → visita" valor={c.tAte.length ? fmtH(mediana(c.tAte)) : "—"} detalhe={c.tAte.length ? `mediana · duração da avaliação ${fmtH(mediana(c.dur))}` : "Sem visitas no período"} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card titulo="Cobertura" dica="Visita: atendimentos com velório que já chegaram à Entrega de corpo · Pós: atendimentos concluídos · conta só avaliações concluídas">
                    <div className="flex flex-col gap-4">{cov("Visita durante o velório", cobV, c.elegVis.length)}{cov("Pós-atendimento", cobP, c.elegPos.length)}</div>
                    <p className="mt-3 text-xs" style={{ color: "var(--dash-text-soft)" }}>Verde a partir de 80%, amarelo a partir de 50%.{c.semResp ? ` ${fmtN(c.semResp)} nota(s) sem responsável identificado.` : ""}</p>
                </Card>
                <Card titulo="Avaliações por avaliador" dica="Quem fez a visita ou o pós-atendimento">
                    <Barras itens={c.porAvaliador} />
                </Card>
            </div>

            <Card titulo="Desempenho por agente nas avaliações" dica="Notas da família a cada colaborador (1 a 5 em %, 5 = 100%) · o responsável de cada nota é definido pelo visita.php · clique no cabeçalho para ordenar">
                {agentes.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-sm" style={{ color: "var(--dash-text)" }}>
                            <thead><tr style={{ background: "var(--dash-card-soft)" }}>
                                {COLS.map(([k, l]) => (
                                    <th key={k} className={`px-2 py-2 text-xs font-bold whitespace-nowrap ${k === "w" ? "text-left" : "text-center"} ${k !== "dist" ? "cursor-pointer" : ""}`} style={{ color: "var(--dash-text-soft)" }}
                                        onClick={() => k !== "dist" && setOrdem((o) => ({ k: k as keyof LinhaAgente, dir: o.k === k ? (o.dir === 1 ? -1 : 1) : k === "w" ? 1 : -1 }))}>
                                        {l}{ordem.k === k ? (ordem.dir === 1 ? " ↑" : " ↓") : ""}
                                    </th>))}
                            </tr></thead>
                            <tbody>
                                {agentes.map((r) => (
                                    <tr key={r.w} className="border-t" style={{ borderColor: "var(--dash-border-light)", opacity: r.n < MIN ? 0.62 : 1 }}>
                                        <td className="px-2 py-1.5 font-bold whitespace-nowrap">{r.w}{r.n < MIN && <span className="ml-2 rounded px-1.5 text-[10px] font-semibold" style={{ background: "var(--dash-empty)" }}>amostra pequena</span>}</td>
                                        <td className="px-2 text-center tabular-nums">{fmtN(r.aval)}</td>
                                        <td className="px-2"><span className="flex items-center gap-2"><span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--dash-empty)", minWidth: 70 }}><span className="block h-full rounded-full" style={{ width: `${(r.media / NOTA_MAX) * 100}%`, background: corNota(r.media) }} /></span><b className="tabular-nums">{notaPct(r.media)}</b></span></td>
                                        <td className="px-2"><span className="flex h-2.5 w-32 overflow-hidden rounded" style={{ background: "var(--dash-empty)" }} title={r.dist.map((q, i) => `${(i + 1) * 20}%: ${q}`).join(" · ")}>{r.dist.map((q, i) => q ? <span key={i} style={{ width: `${(q / r.n) * 100}%`, background: DC[i] }} /> : null)}</span></td>
                                        <td className="px-2 text-center tabular-nums">{fmtP(r.max)}</td>
                                        <td className="px-2 text-center tabular-nums" style={{ color: r.baixas ? "var(--dash-danger-text)" : undefined, fontWeight: r.baixas ? 800 : undefined }}>{r.baixas}</td>
                                        <td className="px-2 text-center tabular-nums">{r.vis}</td>
                                        <td className="px-2 text-center tabular-nums">{r.pos}</td>
                                        <td className="px-2 text-center tabular-nums">{r.atuou || "—"}</td>
                                        <td className="px-2 text-center tabular-nums">{r.cob != null ? fmtP(r.cob) : "—"}</td>
                                    </tr>))}
                            </tbody>
                        </table>
                    </div>
                ) : <Vazio texto={av.carregando ? "Carregando as notas…" : "Nenhuma nota de colaborador nas avaliações do período."} />}
                <p className="mt-2 text-xs" style={{ color: "var(--dash-text-soft)" }}>
                    Distribuição: <span style={{ color: DC[0] }}>■</span> 20% <span style={{ color: DC[1] }}>■</span> 40% <span style={{ color: DC[2] }}>■</span> 60% <span style={{ color: DC[3] }}>■</span> 80% <span style={{ color: DC[4] }}>■</span> 100% · nota máxima = % de notas 100% · notas baixas = 20% ou 40% (nota 1 ou 2) · &quot;Não sei&quot; fica fora · menos de {MIN} notas = amostra pequena · atendimentos avaliados = atendimentos com nota para a pessoa ÷ atendimentos em que ela atuou.
                </p>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card titulo="Nota média por agente" dica={`Só agentes com ${MIN} notas ou mais`}>
                    <Barras itens={c.agentes.filter((r) => r.n >= MIN).sort((a, b) => b.media - a.media).map((r) => ({ nome: r.w, total: Math.round((r.media / NOTA_MAX) * 100), cor: corNota(r.media), extra: `${r.w}: ${notaPct(r.media)} em ${r.n} notas` }))} max={100} semParticipacao formato={(v) => `${v}%`} />
                </Card>
                <Card titulo="Nota por pergunta" dica="Visita × pós-atendimento · média em % (5 = 100%)">
                    {c.perguntas.length ? (
                        <Tabela cabecalho={["Pergunta", "Visita", "Pós", "Diferença"]} larguraMin={380}
                            linhas={c.perguntas.map((p) => [p.titulo, <ChipNota key="v" m={p.v} n={p.nv} />, <ChipNota key="p" m={p.p} n={p.np} />,
                            p.v != null && p.p != null ? <span key="d" className="font-bold" style={{ color: p.p - p.v < 0 ? "var(--dash-danger-text)" : "var(--dash-green)" }}>{p.p - p.v >= 0 ? "+" : ""}{Math.round(((p.p - p.v) / NOTA_MAX) * 100)} pts</span> : "—"])} />
                    ) : <Vazio />}
                </Card>
            </div>

            <Card titulo="Notas baixas (1 ou 2)" dica="Para retorno à família e à equipe · clique para abrir a avaliação">
                {c.baixas.length ? (
                    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><tbody>
                        {c.baixas.slice(0, 60).map((n, i) => {
                            const a = c.avaliacoes.find((x) => x.id === n.avaliacao_id);
                            return (
                                <tr key={i} className="border-t cursor-pointer hover:bg-[var(--dash-card-soft)]" style={{ borderColor: "var(--dash-border-light)" }} onClick={() => a && setAberta(a)}>
                                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{dataHoraBR(n.criado_em)}</td>
                                    <td className="px-2 font-semibold">{c.falecido.get(n.atendimento_id) ?? `#${n.atendimento_id}`}</td>
                                    <td className="px-2">{TIPO_AVAL[n.tipo_avaliacao] ?? n.tipo_avaliacao}</td>
                                    <td className="px-2">{PERGUNTA_TITULO[n.pergunta_codigo] ?? n.pergunta_titulo}</td>
                                    <td className="px-2"><ChipNota m={n.nota_valor} /></td>
                                    <td className="px-2">{n.responsavel_nome || "Não identificado"}</td>
                                    <td className="px-2" style={{ color: "var(--dash-text-soft)" }}>{n.avaliador_nome || "—"}</td>
                                </tr>);
                        })}
                    </tbody></table></div>
                ) : <Vazio texto="Nenhuma nota 1 ou 2 no período." />}
            </Card>

            <Card titulo={`Avaliações do período · ${fmtN(c.avaliacoes.length)}`} dica="Clique para ver as respostas, observações e fotos">
                {c.avaliacoes.length ? (
                    <div className="max-h-[460px] overflow-auto rounded-lg border" style={{ borderColor: "var(--dash-border-light)" }}>
                        <table className="w-full min-w-[980px] text-sm" style={{ color: "var(--dash-text)" }}>
                            <thead className="sticky top-0" style={{ background: "var(--dash-card-soft)" }}><tr>{["Início", "Tipo", "Falecido", "Avaliador", "Situação", "Entrega de corpo → visita", "Duração", "Conversou com", "Nota"].map((h) => <th key={h} className="px-2 py-2 text-left text-xs font-bold whitespace-nowrap" style={{ color: "var(--dash-text-soft)" }}>{h}</th>)}</tr></thead>
                            <tbody>
                                {c.avaliacoes.map((a) => {
                                    const ns = c.notas.filter((n) => n.avaliacao_id === a.id && n.nota_valor != null).map((n) => n.nota_valor!);
                                    return (
                                        <tr key={a.id} className="border-t cursor-pointer hover:bg-[var(--dash-card-soft)]" style={{ borderColor: "var(--dash-border-light)" }} onClick={() => setAberta(a)}>
                                            <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{dataHoraBR(a.inicio_em)}</td>
                                            <td className="px-2">{TIPO_AVAL[a.tipo] ?? a.tipo}</td>
                                            <td className="px-2 font-semibold">{a.falecido_nome || c.falecido.get(a.atendimento_id) || "—"}</td>
                                            <td className="px-2">{a.avaliador_nome || "—"}</td>
                                            <td className="px-2"><Pill ok={avConcluida(a)} texto={avConcluida(a) ? "Concluída" : "Em andamento"} /></td>
                                            <td className="px-2 tabular-nums">{a.tipo === "visita" ? fmtH(segH(a.tempo_fase08_ate_visita_segundos)) : "—"}</td>
                                            <td className="px-2 tabular-nums">{fmtH(segH(a.duracao_segundos))}</td>
                                            <td className="px-2">{[a.com_quem_conversou, a.grau_parentesco].filter(Boolean).join(" · ") || "—"}</td>
                                            <td className="px-2"><ChipNota m={media(ns)} n={ns.length} /></td>
                                        </tr>);
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : <Vazio texto="Nenhuma avaliação para os atendimentos do período." />}
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card titulo={`Sem visita · ${fmtN(c.semVisita.length)}`} dica="Com velório, já na Entrega de corpo ou depois, sem visita registrada · clique para abrir">{lista(c.semVisita, "Todos os atendimentos elegíveis têm visita.")}</Card>
                <Card titulo={`Sem pós-atendimento · ${fmtN(c.semPos.length)}`} dica="Concluídos sem pós-atendimento registrado · clique para abrir">{lista(c.semPos, "Todos os concluídos têm pós-atendimento.")}</Card>
            </div>

            {aberta && <FichaAvaliacao a={aberta} notas={c.notas.filter((n) => n.avaliacao_id === aberta.id)} fechar={() => setAberta(null)} abrirAtendimento={(id) => { setAberta(null); abrirAtendimento(id); }} />}
        </div>
    );
}

function FichaAvaliacao({ a, notas, fechar, abrirAtendimento }: { a: Avaliacao; notas: NotaColab[]; fechar: () => void; abrirAtendimento: (id: number) => void }) {
    const [det, setDet] = useState<any | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    useEffect(() => {
        let vivo = true;
        setDet(null); setErro(null);
        getJson<any>(`${VISITA_URL}?action=obter&tipo=${encodeURIComponent(a.tipo)}&atendimento_id=${a.atendimento_id}`)
            .then((j) => { if (vivo) { if (j?.erro) setErro(j.msg || "Falha ao carregar."); else setDet(j); } })
            .catch((e) => vivo && setErro(e?.message || "Não foi possível carregar as respostas."));
        return () => { vivo = false; };
    }, [a.id, a.tipo, a.atendimento_id]);
    useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && fechar(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [fechar]);

    const respostas: any[] = det?.respostas ?? [];
    const perguntas: any[] = (det?.perguntas ?? []).filter((p: any) => p.aplicavel);
    const itens = perguntas.length ? perguntas.map((p: any) => ({ codigo: String(p.codigo), titulo: String(p.titulo), descricao: String(p.descricao ?? ""), r: respostas.find((r) => Number(r.pergunta_numero) === Number(p.numero)) }))
        : notas.map((n) => ({ codigo: n.pergunta_codigo, titulo: PERGUNTA_TITULO[n.pergunta_codigo] ?? n.pergunta_titulo, descricao: "", r: { nota: n.nota_original } as any }));
    const registros: any[] = det?.registros ?? [];

    return (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal>
            <div className="absolute inset-0 bg-black/40" onClick={fechar} aria-hidden />
            <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden shadow-2xl" style={{ background: "var(--dash-card)", color: "var(--dash-text)" }}>
                <div className="flex items-start justify-between gap-3 border-b p-4" style={{ borderColor: "var(--dash-border-light)" }}>
                    <div>
                        <h2 className="text-xl font-black">{a.falecido_nome || `Atendimento #${a.atendimento_id}`}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--dash-text-soft)" }}>
                            <Pill ok={avConcluida(a)} texto={avConcluida(a) ? "Concluída" : "Em andamento"} /><span>{TIPO_AVAL[a.tipo] ?? a.tipo}</span><span>· atendimento #{a.atendimento_id}</span>
                        </div>
                    </div>
                    <button type="button" onClick={fechar} className="rounded-md border px-2 py-1 text-sm" style={{ borderColor: "var(--dash-border-light)" }} aria-label="Fechar">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 text-sm">
                    <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1">
                        {[["Avaliador", [a.avaliador_nome, a.avaliador_cargo].filter(Boolean).join(" · ") || "—"], ["Início", dataHoraBR(a.inicio_em)], ["Fim", dataHoraBR(a.fim_em)], ["Duração", fmtH(segH(a.duracao_segundos))],
                        ...(a.tipo === "visita" ? [["Entrega de corpo", dataHoraBR(a.fase08_em)], ["Entrega de corpo → visita", fmtH(segH(a.tempo_fase08_ate_visita_segundos))]] : []),
                        ["Conversou com", a.com_quem_conversou || "—"], ["Parentesco", a.grau_parentesco || "—"]].map(([k, v]) => (
                            <React.Fragment key={k}><dt style={{ color: "var(--dash-text-soft)" }}>{k}</dt><dd className="break-words">{v}</dd></React.Fragment>))}
                    </dl>
                    {a.observacao_geral && <p className="mt-3 whitespace-pre-wrap rounded-lg p-3" style={{ background: "var(--dash-card-soft)" }}>{a.observacao_geral}</p>}

                    <h4 className="mt-5 mb-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-text-soft)" }}>Respostas</h4>
                    {erro && !notas.length ? <p style={{ color: "var(--dash-danger-text)" }}>{erro}</p> : !det && !erro ? <p style={{ color: "var(--dash-text-soft)" }}>Carregando…</p> : (
                        <div className="flex flex-col gap-2">
                            {itens.map((it) => {
                                const nota = String(it.r?.nota ?? "");
                                const nv = /^[1-5]$/.test(nota) ? Number(nota) : null;
                                const resp = notas.find((n) => n.pergunta_codigo === it.codigo);
                                return (
                                    <div key={it.codigo} className="rounded-lg p-3" style={{ background: "var(--dash-card-soft)" }}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div><div className="font-bold">{it.titulo}</div>{it.descricao && <div className="text-xs" style={{ color: "var(--dash-text-soft)" }}>{it.descricao}</div>}</div>
                                            {nv != null ? <ChipNota m={nv} /> : <span className="text-xs font-bold" style={{ color: "var(--dash-text-soft)" }}>{nota === "nao_sei" ? "Não sei" : "Sem nota"}</span>}
                                        </div>
                                        {resp && <div className="mt-1 text-xs" style={{ color: "var(--dash-text-soft)" }}>Responsável: <b>{resp.responsavel_nome || "não identificado"}</b></div>}
                                        {it.r?.observacao && <div className="mt-1 whitespace-pre-wrap">{it.r.observacao}</div>}
                                        {it.r?.foto_url && <a href={it.r.foto_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-bold underline" style={{ color: "var(--dash-blue-dark)" }}>Ver foto</a>}
                                    </div>);
                            })}
                            {!itens.length && <p style={{ color: "var(--dash-text-soft)" }}>Sem respostas registradas.</p>}
                        </div>
                    )}

                    {registros.length > 0 && (<>
                        <h4 className="mt-5 mb-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-text-soft)" }}>Registros fotográficos</h4>
                        <div className="grid grid-cols-3 gap-2">
                            {registros.map((r) => (
                                <a key={r.id} href={r.foto_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border" style={{ borderColor: "var(--dash-border-light)" }} title={r.legenda || ""}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={r.foto_url} alt={r.legenda || "Registro da avaliação"} className="h-24 w-full object-cover" loading="lazy" />
                                    {r.legenda && <div className="p-1 text-[11px]">{r.legenda}</div>}
                                </a>))}
                        </div>
                    </>)}

                    <button type="button" onClick={() => abrirAtendimento(a.atendimento_id)} className="mt-5 rounded-lg border px-3 py-1.5 text-sm font-bold" style={{ borderColor: "var(--dash-border-light)" }}>Abrir o atendimento</button>
                </div>
            </aside>
        </div>
    );
}

function AbaPerfil({ d }: { d: Painel }) {
    const p = d.perfil, n = d.resumo.total;
    const corQ = (v: number) => (v >= 85 ? "var(--dash-green)" : v >= 50 ? "var(--dash-yellow)" : "var(--dash-danger-text)");
    return (
        <div className="grid gap-4 xl:grid-cols-3">
            <Card titulo="Adesão a serviços e itens" dica="% dos atendimentos do período">
                <Barras itens={p.servicos.map((s) => ({ nome: s.nome, total: s.pct, cor: s.nome.startsWith("·") ? "var(--dash-heat-3)" : "var(--dash-blue)", extra: `${s.total} de ${n}` }))} formato={(v) => fmtP(v)} semParticipacao max={100} />
            </Card>
            <Card titulo="Urnas mais utilizadas" dica="Agrupadas pelo número do modelo"><Barras itens={p.urnas.slice(0, 8)} total={n} /></Card>
            <Card titulo="Roupas mais utilizadas" dica="Top 8"><Barras itens={p.roupas.slice(0, 8)} total={n} /></Card>
            <Card titulo="Faixa etária do falecido" dica={`${fmtN(d.resumo.idade_n)} de ${fmtN(n)} com data de nascimento`}><Barras itens={p.faixas_etarias} cor="var(--dash-slate)" /></Card>
            <Card titulo="Religião"><Barras itens={p.religiao} /></Card>
            <Card titulo="Fase atual" dica="Situação registrada no sistema">
                <Barras itens={p.status.map((s) => ({ nome: s.rotulo, total: s.total }))} cor="var(--dash-teal)" />
            </Card>
            <Card titulo="Qualidade do cadastro" dica="% com o campo preenchido · verde ≥ 85%, amarelo ≥ 50%" className="xl:col-span-2">
                <Barras itens={[...p.qualidade].sort((a, b) => b.pct - a.pct).map((q) => ({ nome: q.campo, total: q.pct, cor: corQ(q.pct), extra: `${q.total} de ${n}` }))} formato={(v) => fmtP(v)} semParticipacao max={100} />
            </Card>
            <Card titulo="Qualidade por agente" dica="Campos essenciais preenchidos nos atendimentos que abriu">
                <Barras itens={p.qualidade_agente.filter((q) => q.n >= 2).map((q) => ({ nome: q.agente, total: q.pct, cor: corQ(q.pct), extra: `${q.n} atendimento(s)` }))} formato={(v) => `${v}%`} semParticipacao max={100} />
            </Card>
        </div>
    );
}

type Ordem = { campo: keyof ListaItem; dir: 1 | -1 };
const COLUNAS: [keyof ListaItem, string][] = [
    ["id", "ID"], ["falecido", "Falecido"], ["criado_em", "Cadastro"], ["data_sepultamento", "Sepultamento"], ["idade", "Idade"],
    ["convenio", "Convênio"], ["agente", "Agente"], ["velorio", "Velório"], ["cemiterio", "Cemitério"], ["urna", "Urna"],
    ["ciclo_h", "Ciclo"], ["status_rotulo", "Fase"],
];

function AbaLista({ d, abrir }: { d: Painel; abrir: (id: number) => void }) {
    const [busca, setBusca] = useState("");
    const [ordem, setOrdem] = useState<Ordem>({ campo: "criado_em", dir: -1 });
    const [pag, setPag] = useState(0);
    const POR = 25;
    const linhas = useMemo(() => {
        const q = busca.trim().toLowerCase();
        const base = q ? d.lista.filter((x) => [x.id, x.falecido, x.agente, x.convenio, x.urna, x.cemiterio, x.local_velorio].join(" ").toLowerCase().includes(q)) : d.lista;
        return [...base].sort((a, b) => {
            const va = a[ordem.campo] ?? "", vb = b[ordem.campo] ?? "";
            return (va > vb ? 1 : va < vb ? -1 : 0) * ordem.dir;
        });
    }, [d.lista, busca, ordem]);
    useEffect(() => setPag(0), [busca, d]);
    const paginas = Math.max(1, Math.ceil(linhas.length / POR));
    const fatia = linhas.slice(pag * POR, pag * POR + POR);

    const exportar = () => {
        const cab = ["ID", "Falecido", "Cadastro", "Falecimento", "Sepultamento", "Idade", "Convênio", "Agente", "Velório", "Local do velório", "Cemitério", "Urna", "Roupa", "Ciclo (h)", "Ocioso (h)", "Fase"];
        const q = (v: unknown) => { const s = v == null ? "" : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const csv = [cab.join(";"), ...linhas.map((x) => [x.id, x.falecido, x.criado_em, x.data_falecimento, x.data_sepultamento, x.idade, x.convenio, x.agente, x.velorio, x.local_velorio, x.cemiterio, x.urna, x.roupa, x.ciclo_h?.toString().replace(".", ","), x.ocioso_h?.toString().replace(".", ","), x.status_rotulo].map(q).join(";"))].join("\n");
        const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url; a.download = `atendimentos_${d.periodo.inicio}_a_${d.periodo.fim}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Card titulo="Lista analítica" dica={`${fmtN(linhas.length)} atendimento(s) · clique numa linha para ver a ficha`}
            acao={<div className="flex flex-wrap gap-2">
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar falecido, agente, urna…" className="rounded-lg border px-3 py-1.5 text-sm" style={{ background: "var(--dash-card-soft)", borderColor: "var(--dash-border-light)", color: "var(--dash-text)" }} />
                <button type="button" onClick={exportar} className="rounded-lg border px-3 py-1.5 text-sm font-bold" style={{ borderColor: "var(--dash-border-light)", color: "var(--dash-text)" }}>Exportar CSV</button>
            </div>}>
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--dash-border-light)" }}>
                <table className="w-full min-w-[1100px] text-sm" style={{ color: "var(--dash-text)" }}>
                    <thead><tr style={{ background: "var(--dash-card-soft)" }}>
                        {COLUNAS.map(([c, l]) => (
                            <th key={c} onClick={() => setOrdem((o) => ({ campo: c, dir: o.campo === c ? (o.dir === 1 ? -1 : 1) : 1 }))} className="cursor-pointer select-none px-3 py-2 text-left text-xs font-bold whitespace-nowrap" style={{ color: "var(--dash-text-soft)" }}>
                                {l}{ordem.campo === c ? (ordem.dir === 1 ? " ↑" : " ↓") : ""}
                            </th>))}
                    </tr></thead>
                    <tbody>
                        {fatia.map((x) => (
                            <tr key={x.id} onClick={() => abrir(x.id)} className="cursor-pointer border-t hover:bg-[var(--dash-card-soft)]" style={{ borderColor: "var(--dash-border-light)" }}>
                                <td className="px-3 py-2 tabular-nums">#{x.id}</td>
                                <td className="max-w-[240px] truncate px-3 py-2 font-bold">{x.falecido}</td>
                                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{dataHoraBR(x.criado_em)}</td>
                                <td className="px-3 py-2 tabular-nums">{dataBR(x.data_sepultamento)}</td>
                                <td className="px-3 py-2 tabular-nums">{x.idade ?? "—"}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{x.convenio}</td>
                                <td className="px-3 py-2">{x.agente}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{x.velorio}</td>
                                <td className="max-w-[200px] truncate px-3 py-2">{x.cemiterio}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{x.urna}</td>
                                <td className="px-3 py-2 tabular-nums">{fmtH(x.ciclo_h)}</td>
                                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap ${STATUS_COR[x.status] ?? "bg-slate-500"}`}>{x.status_rotulo}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!fatia.length && <Vazio texto="Nenhum atendimento com esses filtros" />}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--dash-text-soft)" }}>
                <span>{linhas.length ? `${pag * POR + 1}–${pag * POR + fatia.length} de ${linhas.length}` : ""}</span>
                <span className="flex gap-2">
                    <button type="button" disabled={pag === 0} onClick={() => setPag((p) => p - 1)} className="rounded-md border px-3 py-1 disabled:opacity-40" style={{ borderColor: "var(--dash-border-light)" }}>← Anterior</button>
                    <button type="button" disabled={pag >= paginas - 1} onClick={() => setPag((p) => p + 1)} className="rounded-md border px-3 py-1 disabled:opacity-40" style={{ borderColor: "var(--dash-border-light)" }}>Próxima →</button>
                </span>
            </div>
        </Card>
    );
}

function Ficha({ item, etapasDef, fechar }: { item: ListaItem; etapasDef: { chave: string; rotulo: string; tipo: string }[]; fechar: () => void }) {
    const [hist, setHist] = useState<any[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    useEffect(() => {
        let vivo = true;
        setHist(null); setErro(null);
        carregarHistorico(String(item.id), !item.no_quadro)
            .then((arr) => { if (vivo) setHist(arr); })
            .catch(() => vivo && setErro("Não foi possível carregar o histórico."));
        return () => { vivo = false; };
    }, [item.id]);
    useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && fechar(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [fechar]);
    const trocas = (hist ?? []).filter((h) => h?.status_novo && h.status_novo !== h.status_anterior);

    return (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal>
            <div className="absolute inset-0 bg-black/40" onClick={fechar} aria-hidden />
            <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden shadow-2xl" style={{ background: "var(--dash-card)", color: "var(--dash-text)" }}>
                <div className="flex items-start justify-between gap-3 border-b p-4" style={{ borderColor: "var(--dash-border-light)" }}>
                    <div>
                        <h2 className="text-xl font-black">{item.falecido}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--dash-text-soft)" }}>
                            <span className={`rounded-full px-2 py-0.5 font-bold text-white ${STATUS_COR[item.status] ?? "bg-slate-500"}`}>{item.status_rotulo}</span>
                            <span>#{item.id}</span><span>· {item.convenio}</span><span>· aberto por {item.agente}</span>
                        </div>
                    </div>
                    <button type="button" onClick={fechar} className="rounded-md border px-2 py-1 text-sm" style={{ borderColor: "var(--dash-border-light)" }} aria-label="Fechar">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 text-sm">
                    <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1">
                        {[["Cadastro", dataHoraBR(item.criado_em)], ["Falecimento", dataBR(item.data_falecimento)], ["Idade", item.idade != null ? `${item.idade} anos` : "—"], ["Religião", item.religiao],
                        ["Velório", `${item.velorio}${item.local_velorio && !/^https?:/.test(item.local_velorio) ? ` — ${item.local_velorio}` : ""}`], ["Sepultamento", `${item.cemiterio} · ${dataBR(item.data_sepultamento)}`],
                        ["Urna", item.urna], ["Roupa", item.roupa || "—"], ["Ciclo total", fmtH(item.ciclo_h)], ["Tempo ocioso", fmtH(item.ocioso_h)]].map(([k, v]) => (
                            <React.Fragment key={k}><dt style={{ color: "var(--dash-text-soft)" }}>{k}</dt><dd className="break-words">{v}</dd></React.Fragment>))}
                    </dl>
                    <h4 className="mt-5 mb-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-text-soft)" }}>Tempo por etapa</h4>
                    {Object.keys(item.etapas).length ? (
                        <div className="flex flex-col gap-1">
                            {etapasDef.filter((e) => item.etapas[e.chave]).map((e) => (
                                <div key={e.chave} className="flex justify-between gap-3 rounded-md px-2 py-1" style={{ background: e.tipo === "espera" ? "var(--dash-empty)" : "var(--dash-card-soft)" }}>
                                    <span style={{ color: e.tipo === "espera" ? "var(--dash-text-soft)" : "var(--dash-text)" }}>{e.rotulo}</span>
                                    <span className="tabular-nums whitespace-nowrap">{fmtH(item.etapas[e.chave].h)}{item.etapas[e.chave].quem ? ` · ${item.etapas[e.chave].quem}` : ""}</span>
                                </div>))}
                        </div>
                    ) : <p style={{ color: "var(--dash-text-soft)" }}>Sem histórico de fases.</p>}
                    <h4 className="mt-5 mb-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--dash-text-soft)" }}>Linha do tempo</h4>
                    {erro ? <p style={{ color: "var(--dash-danger-text)" }}>{erro}</p> : hist === null ? <p style={{ color: "var(--dash-text-soft)" }}>Carregando…</p> : (
                        <ol className="border-l-2 pl-4" style={{ borderColor: "var(--dash-border-light)" }}>
                            {trocas.map((h, i) => (
                                <li key={i} className="mb-2">
                                    <div className="font-semibold">{faseNome(h.status_novo)} <span className="text-xs font-normal" style={{ color: "var(--dash-text-soft)" }}>({h.status_novo})</span></div>
                                    <div className="text-xs tabular-nums" style={{ color: "var(--dash-text-soft)" }}>{dataHoraBR(String(h.datahora ?? ""))} · {h.usuario ?? "—"}</div>
                                </li>))}
                            {!trocas.length && <li style={{ color: "var(--dash-text-soft)" }}>Sem trocas de fase registradas.</li>}
                        </ol>
                    )}
                </div>
            </aside>
        </div>
    );
}

/* =========================================================
   PÁGINA
========================================================= */

type Aba = "geral" | "equipe" | "perfil" | "visitas" | "lista";

function diasEntre(a: string, b: string) { return Math.round((tsOf(b) - tsOf(a)) / 864e5) + 1; }
function somaDias(s: string, n: number) { const d = new Date(tsOf(s)); d.setDate(d.getDate() + n); return iso(d); }
function idDe(r: Registro): string {
    for (const k of ["id", "sepultamento_id", "atendimento_id", "id_sepultamento"]) { const v = r?.[k]; if (v !== undefined && v !== null && String(v).trim()) return String(v).trim(); }
    return "";
}

export default function PainelAtendimentosPage() {
    const [preset, setPreset] = useState<Preset>("30d");
    const [range, setRange] = useState(() => rangeDe("30d"));
    const [convenio, setConvenio] = useState("");
    const [agente, setAgente] = useState("");
    const [aba, setAba] = useState<Aba>("geral");
    const [fichaId, setFichaId] = useState<number | null>(null);
    const [recarga, setRecarga] = useState(0);

    const [balanco, setBalanco] = useState<BalancoRow[] | null>(null);
    const [anterior, setAnterior] = useState(0);
    const [informativo, setInformativo] = useState<Registro[]>([]);
    const [logs, setLogs] = useState<Record<string, LogItem[]>>({});
    const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
    const [carregando, setCarregando] = useState(false);
    const [geradoEm, setGeradoEm] = useState<string>("");
    const [erro, setErro] = useState<{ tipo: "login" | "falha"; msg: string } | null>(null);
    const [aval, setAval] = useState<AvalEstado>({ carregando: false, erro: null, semPermissao: false, dados: null });

    /* Avaliações de visita e pós-atendimento do período (visita.php) */
    useEffect(() => {
        let vivo = true;
        setAval((s) => ({ ...s, carregando: true, erro: null }));
        carregarAvaliacoes(range.inicio, range.fim)
            .then((j) => { if (!vivo) return; setAval(j.sem_permissao ? { carregando: false, erro: null, semPermissao: true, dados: null } : { carregando: false, erro: null, semPermissao: false, dados: j }); })
            .catch((e) => { if (!vivo) return; if (e instanceof LoginError) setErro({ tipo: "login", msg: e.message }); setAval({ carregando: false, erro: e?.name === "AbortError" ? "O servidor demorou a responder." : e?.message || "Falha ao carregar.", semPermissao: false, dados: null }); });
        return () => { vivo = false; };
    }, [range, recarga]);

    /* 1) Atendimentos do período (balanco.php), período anterior e registros completos (informativo.php) */
    useEffect(() => {
        let vivo = true;
        (async () => {
            setCarregando(true); setErro(null);
            const dias = diasEntre(range.inicio, range.fim);
            const antFim = somaDias(range.inicio, -1), antIni = somaDias(range.inicio, -dias);
            try {
                const [bal, balAnt, info] = await Promise.all([
                    getJson<BalancoResp>(`${BALANCO_URL}?inicio=${range.inicio}&fim=${range.fim}`, 30000),
                    getJson<BalancoResp>(`${BALANCO_URL}?inicio=${antIni}&fim=${antFim}`, 30000).catch(() => null),
                    getJson<any>(INFORMATIVO_URL, 30000).catch(() => []),
                ]);
                if (!vivo) return;
                if (!bal?.ok) throw new Error(bal?.msg || "Falha ao carregar os atendimentos do período.");
                setBalanco(Array.isArray(bal.atendimentos) ? bal.atendimentos : []);
                setAnterior(typeof balAnt?.resumo?.atendimentos === "number" ? balAnt.resumo.atendimentos : (balAnt?.atendimentos?.length ?? 0));
                setInformativo(extrairArray<Registro>(info));
                const agora = new Date();
                setGeradoEm(`${iso(agora)} ${agora.toTimeString().slice(0, 8)}`);
            } catch (e: any) {
                if (!vivo) return;
                if (e instanceof LoginError) setErro({ tipo: "login", msg: e.message });
                else setErro({ tipo: "falha", msg: e?.name === "AbortError" ? "O servidor demorou a responder. Tente de novo." : e?.message || "Falha ao carregar o painel." });
            } finally {
                if (vivo) setCarregando(false);
            }
        })();
        return () => { vivo = false; };
    }, [range, recarga]);

    const infoPorId = useMemo(() => { const m = new Map<string, Registro>(); informativo.forEach((r) => { const id = idDe(r); if (id) m.set(id, r); }); return m; }, [informativo]);

    /* 2) Histórico de cada atendimento (historico_sepultamentos.php), 6 por vez, com atualização progressiva */
    useEffect(() => {
        if (!balanco) return;
        let cancelado = false;
        const ids = balanco.map((b) => String(b.atendimento_id ?? "").trim()).filter(Boolean);
        const faltam = ids.filter((id) => !logs[id]);
        if (!faltam.length) { setProgresso(null); return; }
        setProgresso({ feitos: 0, total: faltam.length });
        const lote: Record<string, LogItem[]> = {};
        let feitos = 0, i = 0, ultimo = 0;
        const descarregar = () => { if (Object.keys(lote).length) { const copia = { ...lote }; for (const k in lote) delete lote[k]; setLogs((l) => ({ ...l, ...copia })); } };
        const worker = async () => {
            while (i < faltam.length && !cancelado) {
                const id = faltam[i++];
                const info = infoPorId.get(id);
                try { lote[id] = await carregarHistorico(id, !!info && !noQuadro(info)); }
                catch (e) { if (e instanceof LoginError) { cancelado = true; setErro({ tipo: "login", msg: e.message }); } else lote[id] = []; }
                feitos++;
                if (!cancelado && Date.now() - ultimo > 700) { ultimo = Date.now(); descarregar(); setProgresso({ feitos, total: faltam.length }); }
            }
        };
        Promise.all(Array.from({ length: Math.min(6, faltam.length) }, worker)).then(() => { if (!cancelado) { descarregar(); setProgresso(null); } });
        return () => { cancelado = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [balanco, infoPorId]);

    /* 3) Base unificada: balanço (oficial) + informativo (registro completo) + histórico (fases e campos) */
    const base = useMemo<Base[]>(() => (balanco ?? []).map((b) => {
        const id = String(b.atendimento_id ?? "").trim();
        const lg = logs[id] ?? null;
        const info = infoPorId.get(id);
        const r: Registro = { ...(lg ? registroDoHistorico(lg) : {}), ...(info ?? {}) };
        if (!r.falecido && b.falecido) r.falecido = b.falecido;
        const criou = lg?.find((l) => norm(l.acao) === "criou") ?? lg?.[0];
        let criadoTs = tsOf(criou?.datahora);
        if (Number.isNaN(criadoTs)) criadoTs = tsOf(b.data_referencia);
        const dataRef = Number.isNaN(criadoTs) ? String(b.data_referencia ?? "").slice(0, 10) : iso(new Date(criadoTs));
        const conv = String(b.convenio ?? r.convenio ?? "").trim() || "Não informado";
        const ag = nomeProprio(info?.agente ?? r.agente) || (criou?.usuario ? nomeProprio(criou.usuario) : "") || "Não informado";
        return { id, r, logs: lg, criadoTs, dataRef, convenio: conv, agente: ag };
    }), [balanco, logs, infoPorId]);

    const dados = useMemo<Painel | null>(() => {
        if (!balanco) return null;
        const filtrada = base.filter((b) => (!convenio || b.convenio === convenio) && (!agente || b.agente === agente));
        const dias = diasEntre(range.inicio, range.fim);
        const calc = calcularPainel(filtrada, { inicio: range.inicio, fim: range.fim, dias, anterior, antInicio: somaDias(range.inicio, -dias), antFim: somaDias(range.inicio, -1) });
        const agora = Date.now();
        const em_andamento = informativo.filter((r) => r.status && noQuadro(r)).map((r) => {
            const id = idDe(r);
            const lg = logs[id] ?? HIST_CACHE.get(id)?.logs;
            const t = tsOf((lg?.find((l) => norm(l.acao) === "criou") ?? lg?.[0])?.datahora ?? r.criado_em ?? r.created_at ?? r.datahora_criacao);
            return { id: Number(id), falecido: String(r.falecido ?? ""), status: faseKey(r.status), status_rotulo: FASE_ROTULO_APP[faseKey(r.status)] ?? String(r.status), convenio: String(r.convenio ?? ""), velorio: grupoVelorio(r), horas_desde_cadastro: Number.isNaN(t) ? null : r2((agora - t) / 36e5, 1) };
        });
        return {
            ...calc, ok: true, gerado_em: geradoEm, em_andamento,
            opcoes: { convenios: [...new Set(base.map((b) => b.convenio))].sort(), agentes: [...new Set(base.map((b) => b.agente))].sort((a, b) => a.localeCompare(b, "pt-BR")) },
        };
    }, [base, balanco, convenio, agente, range, anterior, informativo, logs, geradoEm]);

    const escolherPreset = (p: Preset) => { setPreset(p); setRange(rangeDe(p)); };
    const filtrar = (campo: "convenio", v: string) => { if (campo === "convenio") setConvenio((c) => (c === v ? "" : v)); };
    const ficha = fichaId != null ? dados?.lista.find((x) => x.id === fichaId) ?? null : null;
    const campo = "rounded-lg border px-2 py-1.5 text-sm";
    const campoEstilo = { background: "var(--dash-card)", borderColor: "var(--dash-border-light)", color: "var(--dash-text)" } as const;

    if (erro?.tipo === "login") {
        return (
            <main className={`${nunito.className} flex min-h-screen items-center justify-center p-6`} style={{ background: "var(--dash-bg)" }}>
                <ThemeStyles />
                <div className="max-w-md rounded-2xl border p-6 text-center" style={{ background: "var(--dash-card)", borderColor: "var(--dash-border-light)", color: "var(--dash-text)" }}>
                    <h1 className="text-lg font-black">Sessão expirada</h1>
                    <p className="mt-2 text-sm" style={{ color: "var(--dash-text-soft)" }}>{erro.msg}</p>
                </div>
            </main>
        );
    }

    return (
        <main className={`${nunito.className} min-h-screen`} style={{ background: "var(--dash-bg)", color: "var(--dash-text)" }}>
            <ThemeStyles />
            <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
                <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-black">Painel de Atendimentos</h1>
                        <p className="text-sm" style={{ color: "var(--dash-text-soft)" }}>{dataBR(range.inicio)} a {dataBR(range.fim)} · por data de cadastro{geradoEm ? ` · atualizado ${dataHoraBR(geradoEm)}` : ""}</p>
                    </div>
                    <button type="button" onClick={() => { HIST_CACHE.clear(); setLogs({}); setRecarga((n) => n + 1); }} disabled={carregando} className="rounded-lg border px-3 py-1.5 text-sm font-bold disabled:opacity-50" style={campoEstilo}>{carregando ? "Carregando…" : "↻ Atualizar"}</button>
                </header>

                <div className="sticky top-0 z-20 -mx-1 mb-4 flex flex-col gap-2 px-1 py-2 backdrop-blur" style={{ background: "color-mix(in srgb, var(--dash-bg) 90%, transparent)" }}>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex flex-wrap rounded-lg border p-0.5" style={campoEstilo}>
                            {PRESETS.map(([k, l]) => (
                                <button key={k} type="button" onClick={() => escolherPreset(k)} className="rounded-md px-2.5 py-1 text-xs font-bold whitespace-nowrap"
                                    style={preset === k ? { background: "var(--dash-blue-dark)", color: "#fff" } : { color: "var(--dash-text-soft)" }}>{l}</button>))}
                        </div>
                        <input type="date" className={campo} style={campoEstilo} value={range.inicio} onChange={(e) => { if (!e.target.value) return; setPreset("custom"); setRange((r) => ({ inicio: e.target.value, fim: r.fim < e.target.value ? e.target.value : r.fim })); }} aria-label="Data inicial" />
                        <input type="date" className={campo} style={campoEstilo} value={range.fim} onChange={(e) => { if (!e.target.value) return; setPreset("custom"); setRange((r) => ({ inicio: r.inicio > e.target.value ? e.target.value : r.inicio, fim: e.target.value })); }} aria-label="Data final" />
                        <select className={campo} style={campoEstilo} value={convenio} onChange={(e) => setConvenio(e.target.value)} aria-label="Convênio">
                            <option value="">Todos os convênios</option>{(dados?.opcoes.convenios ?? []).map((c) => <option key={c}>{c}</option>)}
                        </select>
                        <select className={campo} style={campoEstilo} value={agente} onChange={(e) => setAgente(e.target.value)} aria-label="Agente que abriu">
                            <option value="">Todos os agentes</option>{(dados?.opcoes.agentes ?? []).map((c) => <option key={c}>{c}</option>)}
                        </select>
                        {(convenio || agente) && <button type="button" onClick={() => { setConvenio(""); setAgente(""); }} className="text-xs font-bold underline" style={{ color: "var(--dash-blue-dark)" }}>Limpar filtros</button>}
                    </div>
                    {progresso && (
                        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--dash-text-soft)" }}>
                            <span className="whitespace-nowrap">Carregando histórico das fases: {progresso.feitos} de {progresso.total}</span>
                            <span className="h-1.5 flex-1 overflow-hidden rounded" style={{ background: "var(--dash-empty)" }}><span className="block h-full rounded" style={{ width: `${(progresso.feitos / Math.max(1, progresso.total)) * 100}%`, background: "var(--dash-blue)" }} /></span>
                        </div>
                    )}
                    <nav className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--dash-border-light)" }} role="tablist">
                        {([["geral", "Visão geral"], ["equipe", "Desempenho da equipe"], ["perfil", "Perfil dos atendimentos"], ["visitas", `Visitas e pós-atendimento${dados && aval.dados ? ` · ${avalDoPainel(dados, aval.dados).avaliacoes.length}` : ""}`], ["lista", `Lista analítica${dados ? ` · ${dados.lista.length}` : ""}`]] as [Aba, string][]).map(([k, l]) => (
                            <button key={k} role="tab" aria-selected={aba === k} type="button" onClick={() => setAba(k)} className="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold"
                                style={{ borderColor: aba === k ? "var(--dash-blue-dark)" : "transparent", color: aba === k ? "var(--dash-text)" : "var(--dash-text-soft)" }}>{l}</button>))}
                    </nav>
                </div>

                {erro?.tipo === "falha" && (
                    <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ background: "var(--dash-danger-bg)", borderColor: "var(--dash-danger-border)", color: "var(--dash-danger-text)" }}>
                        {erro.msg} <button type="button" onClick={() => setRecarga((n) => n + 1)} className="ml-2 font-bold underline">Tentar de novo</button>
                    </div>
                )}
                {!dados && carregando && <Vazio texto="Carregando o painel…" />}
                {dados && (
                    <div style={{ opacity: carregando ? 0.6 : 1, transition: "opacity .15s" }}>
                        {aba === "geral" && <AbaGeral d={dados} filtrar={filtrar} />}
                        {aba === "equipe" && <AbaEquipe d={dados} av={aval} />}
                        {aba === "perfil" && <AbaPerfil d={dados} />}
                        {aba === "visitas" && <AbaVisitas d={dados} av={aval} abrirAtendimento={setFichaId} />}
                        {aba === "lista" && <AbaLista d={dados} abrir={setFichaId} />}
                    </div>
                )}
            </div>
            {ficha && dados && <Ficha item={ficha} etapasDef={dados.etapas_definicao ?? []} fechar={() => setFichaId(null)} />}
        </main>
    );
}
