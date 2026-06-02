"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Nunito } from "next/font/google";

const nunito = Nunito({
    subsets: ["latin"],
    weight: ["400", "600", "700", "800", "900"],
});

/* =========================================================
   CONFIG
========================================================= */

const INFORMATICO_URL = "/api/php/informativo.php?listar=1";
const TELEMETRIA_URL = "/api/php/telemetria.php";

const COLORS = {
    bg: "var(--dash-bg)",
    card: "var(--dash-card)",
    cardSoft: "var(--dash-card-soft)",
    cell: "var(--dash-cell)",
    text: "var(--dash-text)",
    textSoft: "var(--dash-text-soft)",
    borderLight: "var(--dash-border-light)",
    borderStrong: "var(--dash-border-strong)",
    blue: "var(--dash-blue)",
    blueDark: "var(--dash-blue-dark)",
    yellow: "var(--dash-yellow)",
    green: "var(--dash-green)",
    teal: "var(--dash-teal)",
    slate: "var(--dash-slate)",
    empty: "var(--dash-empty)",
    dangerBorder: "var(--dash-danger-border)",
    dangerBg: "var(--dash-danger-bg)",
    dangerText: "var(--dash-danger-text)",
};

type PeriodPreset = "hoje" | "ontem" | "7d" | "mes" | "30d" | "custom";

type PeriodRange = {
    preset: PeriodPreset;
    inicio: string;
    fim: string;
    label: string;
};

type Registro = {
    id?: number | string;
    sepultamento_id?: number | string;
    sepultamentoId?: number | string;
    id_sepultamento?: number | string;
    atendimento_id?: number | string;
    atendimentoId?: number | string;

    falecido?: string;
    agente?: string;
    usuario?: string;
    operador?: string;
    responsavel?: string;

    agente_tanato?: string;
    tanatopraxista?: string;
    usuario_tanato?: string;
    agente_conservacao?: string;
    usuario_conservacao?: string;
    nome_tanato?: string;
    tanato_por?: string;

    data?: string;
    created_at?: string;
    datahora?: string;
    ultima_datahora?: string;

    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    hora_inicio_velorio?: string;
    hora_fim_velorio?: string;

    status?: string;
    status_novo?: string;
    status_anterior?: string;

    convenio?: string;
    assistencia?: string;
    tanato?: string;
    ornamentacao?: string;
    ornamentacao_tipo?: string;
    invol?: string;
    local_velorio?: string;
    materiais_json?: any;

    [key: string]: any;
};

type MotoristaRow = {
    motorista?: string;
    nome_motorista?: string;
    placas?: string;
    velocidade_media?: number | string;
    velocidade_maxima?: number | string;
    total_posicoes?: number | string;
    distancia_km?: number | string;
    distancia_percorrida_km?: number | string;
    [key: string]: any;
};

type VeiculoRow = {
    placa?: string;
    descricao_veiculo?: string;
    veiculo?: string;
    motorista?: string;
    nome_motorista?: string;
    distancia_km?: number | string;
    distancia_percorrida_km?: number | string;
    velocidade_media?: number | string;
    velocidade_maxima?: number | string;
    [key: string]: any;
};

type ApiResp<T> =
    | T[]
    | {
        sucesso?: boolean;
        erro?: boolean;
        need_login?: boolean;
        dados?: T[];
        data?: T[];
        msg?: string;
    };

type TanatoAgent = "SANDRO" | "JOSEILDO";

/* =========================================================
   CACHE / FETCH
========================================================= */

type CacheEntry = { exp: number; data: any };
const MEM_CACHE = new Map<string, CacheEntry>();
const INFLIGHT = new Map<string, Promise<any>>();

function getCache<T>(key: string): T | null {
    const hit = MEM_CACHE.get(key);
    if (!hit) return null;
    if (Date.now() > hit.exp) {
        MEM_CACHE.delete(key);
        return null;
    }
    return hit.data as T;
}

function setCache(key: string, data: any, ttlMs: number) {
    MEM_CACHE.set(key, { exp: Date.now() + ttlMs, data });
}

async function fetchJson<T>(
    url: string,
    opts?: { ttlMs?: number; timeoutMs?: number; cacheKey?: string }
): Promise<T> {
    const ttlMs = opts?.ttlMs ?? 12000;
    const timeoutMs = opts?.timeoutMs ?? 20000;
    const cacheKey = opts?.cacheKey ?? url;

    const cached = getCache<T>(cacheKey);
    if (cached) return cached;

    const inflight = INFLIGHT.get(cacheKey);
    if (inflight) return inflight as Promise<T>;

    const promise = (async () => {
        const ac = new AbortController();
        const timer = window.setTimeout(() => ac.abort(), timeoutMs);

        try {
            const res = await fetch(url, {
                method: "GET",
                credentials: "include",
                cache: "no-store",
                signal: ac.signal,
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = (await res.json()) as T;
            setCache(cacheKey, json, ttlMs);
            return json;
        } finally {
            clearTimeout(timer);
            INFLIGHT.delete(cacheKey);
        }
    })();

    INFLIGHT.set(cacheKey, promise);
    return promise;
}

function extractArray<T>(json: ApiResp<T>): T[] {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray((json as any).dados)) return (json as any).dados;
    if (json && Array.isArray((json as any).data)) return (json as any).data;
    return [];
}

async function listarLogPorId(id: string | number): Promise<any[]> {
    const safeId = encodeURIComponent(String(id ?? "").trim());
    if (!safeId) return [];

    const urls = [
        `/api/php/historico_sepultamentos.php?log=1&id=${safeId}`,
        `/api/php/log_sepultamento.php?listar=1&sepultamento_id=${safeId}`,
        `/api/php/log_sepultamento.php?listar=1&id=${safeId}`,
        `/api/php/logs_sepultamento.php?listar=1&sepultamento_id=${safeId}`,
        `/api/php/logs_sepultamento.php?listar=1&id=${safeId}`,
        `/api/php/historico.php?listar=1&sepultamento_id=${safeId}`,
        `/api/php/historico.php?listar=1&id=${safeId}`,
        `/api/php/log.php?listar=1&sepultamento_id=${safeId}`,
        `/api/php/log.php?listar=1&id=${safeId}`,
    ];

    for (const url of urls) {
        try {
            const json = await fetchJson<ApiResp<any>>(url, {
                ttlMs: 30000,
                timeoutMs: 12000,
                cacheKey: `tanato-log:${url}`,
            });

            const arr = extractArray<any>(json);
            if (arr.length) return arr;
        } catch {
            // tenta o próximo
        }
    }

    return [];
}

/* =========================================================
   HELPERS
========================================================= */

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function toIsoDate(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateBR(iso?: string) {
    if (!iso) return "—";
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseDateFlex(v?: string | null): Date | null {
    if (!v) return null;
    const s = String(v).trim();
    if (!s || s === "0000-00-00" || s === "00/00/0000") return null;

    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
        const [, yyyy, mm, dd, hh = "00", mi = "00", ss = "00"] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
        const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function endOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

function norm(v: any) {
    return String(v ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function isSim(v: any) {
    const s = norm(v);
    return s === "sim" || s === "1" || s === "true" || s === "s";
}

function num(v: any) {
    const n = Number(String(v ?? "0").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

function fmt0(n: number) {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n || 0);
}

function fmt1(n: number) {
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
    }).format(n || 0);
}

function fmtHm(totalMinutes?: number | null) {
    if (totalMinutes == null || !Number.isFinite(totalMinutes)) return "—";
    const mins = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
}

function average(values: Array<number | null | undefined>) {
    const arr = values.filter((v): v is number => v != null && Number.isFinite(v));
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function makeRange(preset: PeriodPreset, inicioCustom?: string, fimCustom?: string): PeriodRange {
    const now = new Date();

    if (preset === "hoje") {
        const iso = toIsoDate(now);
        return { preset, inicio: iso, fim: iso, label: "Hoje" };
    }

    if (preset === "ontem") {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        const iso = toIsoDate(d);
        return { preset, inicio: iso, fim: iso, label: "Ontem" };
    }

    if (preset === "7d") {
        const start = new Date(now);
        start.setDate(start.getDate() - 6);
        return { preset, inicio: toIsoDate(start), fim: toIsoDate(now), label: "Últimos 7 dias" };
    }

    if (preset === "mes") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { preset, inicio: toIsoDate(start), fim: toIsoDate(now), label: "Mês atual" };
    }

    if (preset === "30d") {
        const start = new Date(now);
        start.setDate(start.getDate() - 29);
        return { preset, inicio: toIsoDate(start), fim: toIsoDate(now), label: "Últimos 30 dias" };
    }

    const ini = inicioCustom || toIsoDate(now);
    const fim = fimCustom || ini;
    const start = ini <= fim ? ini : fim;
    const end = fim >= ini ? fim : ini;

    return {
        preset: "custom",
        inicio: start,
        fim: end,
        label: `${formatDateBR(start)} a ${formatDateBR(end)}`,
    };
}

function rangeToDates(range: PeriodRange) {
    return {
        start: startOfDay(new Date(`${range.inicio}T00:00:00`)),
        end: endOfDay(new Date(`${range.fim}T00:00:00`)),
    };
}

function rangeTo14(range: PeriodRange) {
    return {
        inicio: range.inicio.replaceAll("-", "") + "000000",
        fim: range.fim.replaceAll("-", "") + "235959",
    };
}

function getRegistroDates(r: Registro): Date[] {
    const candidates = [
        r.data,
        r.created_at,
        r.datahora,
        r.ultima_datahora,
        r.data_inicio_velorio,
        r.data_fim_velorio,
    ];

    const dates: Date[] = [];
    const seen = new Set<number>();

    for (const c of candidates) {
        const d = parseDateFlex(String(c || ""));
        if (!d) continue;

        const t = d.getTime();
        if (Number.isNaN(t) || seen.has(t)) continue;

        seen.add(t);
        dates.push(d);
    }

    return dates;
}

function getRegistroDate(r: Registro): Date | null {
    return getRegistroDates(r)[0] || null;
}

function registroDentroDoPeriodo(r: Registro, start: Date, end: Date): boolean {
    const dates = getRegistroDates(r);
    if (!dates.length) return false;
    return dates.some((d) => d >= start && d <= end);
}

function getStartDate(r: Registro): Date | null {
    const candidates = [r.created_at, r.data, r.datahora, r.data_inicio_velorio];
    for (const c of candidates) {
        const d = parseDateFlex(String(c || ""));
        if (d) return d;
    }
    return null;
}

function getEndDate(r: Registro): Date | null {
    const candidates = [r.data_fim_velorio, r.ultima_datahora, r.datahora];
    for (const c of candidates) {
        const d = parseDateFlex(String(c || ""));
        if (d) return d;
    }
    return null;
}

function getDurationMinutes(r: Registro): number | null {
    const start = getStartDate(r);
    const end = getEndDate(r);
    if (!start || !end) return null;
    const diff = (end.getTime() - start.getTime()) / 60000;
    if (!Number.isFinite(diff) || diff < 0) return null;
    return diff;
}

function normalizeConvenio(v: any) {
    const s = norm(v);
    if (!s) return "PARTICULAR";
    if (s.includes("part")) return "PARTICULAR";
    if (s.includes("pref")) return "PREFEITURA";
    if (s.includes("assoc")) return "ASSOCIADO";
    return String(v || "PARTICULAR").toUpperCase();
}

function getAgenteNome(r: Registro) {
    return String(r.agente || r.usuario || r.operador || r.responsavel || "SEM NOME")
        .trim()
        .toUpperCase();
}

function normalizeTanatoAgentName(v: any): TanatoAgent | "" {
    const s = norm(v);
    if (!s) return "";
    if (s.includes("sandro")) return "SANDRO";
    if (s.includes("joseildo")) return "JOSEILDO";
    return "";
}

function getTanatoNome(r: Registro): TanatoAgent | "" {
    return normalizeTanatoAgentName(
        r.agente_tanato ||
        r.tanatopraxista ||
        r.usuario_tanato ||
        r.agente_conservacao ||
        r.usuario_conservacao ||
        r.nome_tanato ||
        r.tanato_por ||
        ""
    );
}

function getIdsParaTentar(r: Registro): string[] {
    const candidates = [
        r.sepultamento_id,
        r.sepultamentoId,
        r.id_sepultamento,
        r.atendimento_id,
        r.atendimentoId,
        r.id,
    ]
        .map((x: any) => String(x || "").trim())
        .filter(Boolean);

    return Array.from(new Set(candidates));
}

function getEntityKey(r: Registro): string {
    const primary = String(r.sepultamento_id || r.sepultamentoId || r.id_sepultamento || "").trim();
    if (primary) return primary;
    const ids = getIdsParaTentar(r);
    return ids[0] || "";
}

function logTs(log: any): number {
    const d = parseDateFlex(String(log?.datahora || log?.data || log?.created_at || ""));
    return d ? d.getTime() : Number.NaN;
}

function agenteDoLog(log: any): string {
    const pick = (o: any) =>
        o?.usuario ||
        o?.usuario_nome ||
        o?.usuarioNome ||
        o?.nome_usuario ||
        o?.user ||
        o?.user_name ||
        o?.username ||
        o?.operador ||
        o?.agente ||
        o?.nome ||
        o?.name ||
        "";

    const direct = pick(log);
    if (direct) return String(direct).trim();

    try {
        const det = typeof log?.detalhes === "string" ? JSON.parse(log.detalhes) : log?.detalhes;
        const poss = pick(det) || det?.usuario_nome || det?.user_name || det?.nome_usuario;
        if (poss) return String(poss).trim();
    } catch {
        // ignora
    }

    return "";
}

function isDetalhesVazio(log: any): boolean {
    const d = log?.detalhes;

    if (d === null || d === undefined) return true;

    if (typeof d === "string") {
        const s = d.trim();
        if (!s || s === "null" || s === "{}") return true;

        try {
            const obj = JSON.parse(s);
            if (obj === null) return true;
            if (typeof obj === "object" && obj && Object.keys(obj).length === 0) return true;
            return false;
        } catch {
            return false;
        }
    }

    if (typeof d === "object") return Object.keys(d || {}).length === 0;

    return false;
}

function isInicioConservacaoPuro(log: any): boolean {
    const acao = norm(log?.acao || "");
    const statusAnterior = norm(log?.status_anterior || "");
    const statusNovo = norm(log?.status_novo || log?.status || "");
    const titulo = norm(log?.titulo || "");
    const texto = `${acao} ${statusNovo} ${titulo}`;

    if (acao.includes("edit")) return false;

    const matchMudancaStatus =
        acao.includes("atualizou status") ||
        acao.includes("atualizou situacao") ||
        acao.includes("alterou status") ||
        acao.includes("mudou status") ||
        acao.includes("status");

    if (!matchMudancaStatus) return false;

    const temFases = !!(log?.status_anterior || log?.status_novo);
    if (temFases) {
        if (!(statusAnterior === "fase02" && statusNovo === "fase03")) return false;
    } else {
        const matchConservacao =
            /inicio\s*(de\s*)?conservacao/.test(texto) ||
            /iniciou\s*conservacao/.test(texto) ||
            /conservacao\s*iniciada/.test(texto) ||
            /fase\s*0*3\b/.test(texto);
        if (!matchConservacao) return false;
    }

    return isDetalhesVazio(log);
}

function findPrimeiroInicioPuroNoPeriodo(logs: any[], start: Date, end: Date): any | null {
    let best: any | null = null;

    for (const log of logs || []) {
        if (!isInicioConservacaoPuro(log)) continue;

        const t = logTs(log);
        if (Number.isNaN(t)) continue;
        if (t < start.getTime() || t > end.getTime()) continue;

        if (!best || t < logTs(best)) best = log;
    }

    return best;
}

function hasMateriais(r: Registro) {
    if (r.materiais_json) {
        try {
            const obj = typeof r.materiais_json === "string" ? JSON.parse(r.materiais_json) : r.materiais_json;

            if (obj && typeof obj === "object") {
                return Object.values(obj).some((v: any) => {
                    const qtd = num(v?.qtd);
                    const checked =
                        v?.checked === true ||
                        v?.checked === "true" ||
                        v?.checked === "1" ||
                        v?.checked === 1;
                    return checked || qtd > 0;
                });
            }
        } catch {
            //
        }
    }

    return Object.keys(r).some((k) => /^materiais_.+_qtd$/i.test(k) && num((r as any)[k]) > 0);
}

function getVeiculoNome(v: VeiculoRow) {
    return String(v.descricao_veiculo || v.veiculo || v.placa || "VEÍCULO").trim().toUpperCase();
}

function getVeiculoKm(v: VeiculoRow) {
    return num(v.distancia_percorrida_km ?? v.distancia_km);
}

function dedupeRegistros(records: Registro[]) {
    const map = new Map<string, Registro>();

    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const key =
            getEntityKey(r) ||
            `${String(r.falecido || "").trim()}-${String(r.data || r.created_at || r.datahora || i).trim()}`;

        const prev = map.get(key);
        if (!prev) {
            map.set(key, r);
            continue;
        }

        const prevTs = getRegistroDate(prev)?.getTime() ?? 0;
        const currTs = getRegistroDate(r)?.getTime() ?? 0;

        if (currTs >= prevTs) map.set(key, r);
    }

    return Array.from(map.values());
}

/* =========================================================
   ÍCONES
========================================================= */

function IconCalendar() {
    return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
    );
}


function IconRemocao() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 16h13l4-5" />
            <path d="M5 16l2 4M15 16l2 4" />
            <path d="M7 12h8l2-3H9z" />
            <circle cx="8" cy="20" r="1.5" />
            <circle cx="17" cy="20" r="1.5" />
        </svg>
    );
}

function IconSepultamento() {
    return (
        <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 20h12" />
            <path d="M8 20V8a4 4 0 018 0v12" />
            <path d="M10 11h4" />
            <path d="M12 9v6" />
        </svg>
    );
}

function IconTanato() {
    return (
        <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth="2.1">
            <path d="M4 20l6-6M10 14l8-8" />
            <path d="M13 3l8 8" />
            <circle cx="18" cy="6" r="2" />
        </svg>
    );
}

function IconOrnamentacao() {
    return (
        <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="2.2" />
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M18.5 5.5l-2.8 2.8M8.3 15.7l-2.8 2.8" />
        </svg>
    );
}

function IconInvol() {
    return (
        <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-8 sm:w-8" fill="currentColor">
            <path d="M12 2l7 4 2 8-9 8-9-8 2-8 7-4z" opacity=".92" />
            <path d="M7 19l10-11" fill="none" stroke="white" strokeWidth="1.8" />
        </svg>
    );
}

function IconVelorio() {
    return (
        <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 14h18M5 14v-3a3 3 0 013-3h5a5 5 0 015 5v1" />
            <circle cx="7" cy="17" r="2" />
            <circle cx="17" cy="17" r="2" />
        </svg>
    );
}

function IconMaterial() {
    return (
        <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-4z" />
            <path d="M12 7v5l3 2" />
            <path d="M4 9l3-1M17 8l3 1M6 19l2-2M16 17l2 2" />
        </svg>
    );
}

const METRICAS = [
    {
        key: "remocao",
        label: "Remoção",
        icon: <IconRemocao />,
        match: (_r: Registro) => true,
    },
    {
        key: "tanato",
        label: "Tanato",
        icon: <IconTanato />,
        match: (_r: Registro) => false,
    },
    {
        key: "ornamentacao",
        label: "Ornamentação",
        icon: <IconOrnamentacao />,
        match: (r: Registro) => {
            const s = norm(`${r.ornamentacao || ""} ${r.ornamentacao_tipo || ""}`);
            return !!s && s !== "nao" && s !== "não";
        },
    },
    {
        key: "velorio",
        label: "Velório",
        icon: <IconVelorio />,
        match: (r: Registro) => !!String(r.local_velorio || r.data_inicio_velorio || "").trim(),
    },
    {
        key: "sepultamento",
        label: "Sepultamento",
        icon: <IconSepultamento />,
        match: (_r: Registro) => true,
    },
    {
        key: "material",
        label: "Material",
        icon: <IconMaterial />,
        match: (r: Registro) => hasMateriais(r),
    },
] as const;

/* =========================================================
   COMPONENTES BASE
========================================================= */

function DashboardThemeStyles() {
    return (
        <style jsx global>{`
            :root,
            html:not(.dark) {
                --dash-bg: #f5fafe;
                --dash-card: #ffffff;
                --dash-card-soft: #f8fcff;
                --dash-cell: #ffffff;
                --dash-text: #1f3552;
                --dash-text-soft: #5c7492;
                --dash-border-light: #cfe4f3;
                --dash-border-strong: #2f6f91;
                --dash-blue: #4d8fd5;
                --dash-blue-dark: #226385;
                --dash-yellow: #f2bc00;
                --dash-green: #1f7a2d;
                --dash-teal: #0f8b8d;
                --dash-slate: #5a6f86;
                --dash-empty: #e6eef5;
                --dash-danger-border: #f2b0b0;
                --dash-danger-bg: #fff5f5;
                --dash-danger-text: #b53b3b;
                color-scheme: light;
            }

            html.dark {
                --dash-bg: #07111f;
                --dash-card: #101c2b;
                --dash-card-soft: #0b1624;
                --dash-cell: #132238;
                --dash-text: #eaf4ff;
                --dash-text-soft: #9fb8d3;
                --dash-border-light: #213952;
                --dash-border-strong: #62b48f;
                --dash-blue: #6aa9ee;
                --dash-blue-dark: #2f7ea5;
                --dash-yellow: #f4c400;
                --dash-green: #45a85a;
                --dash-teal: #2db5b7;
                --dash-slate: #89a2ba;
                --dash-empty: #243446;
                --dash-danger-border: #8a3b44;
                --dash-danger-bg: #321820;
                --dash-danger-text: #ffb7c0;
                color-scheme: dark;
            }

            html,
            body {
                background: var(--dash-bg) !important;
            }

            html.dark .dashboard-desempenho-page,
            html.dark .dashboard-desempenho-page * {
                scrollbar-color: var(--dash-border-light) var(--dash-bg);
            }
        `}</style>
    );
}

function Surface({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`rounded-[22px] border shadow-[0_6px_18px_rgba(34,99,133,0.05)] ${className}`}
            style={{
                borderColor: COLORS.borderLight,
                backgroundColor: COLORS.card,
            }}
        >
            {children}
        </div>
    );
}

function ChartPanel({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <Surface className="min-w-0 overflow-hidden">
            <div
                className="border-b px-3 py-2 text-center text-[10px] font-extrabold uppercase leading-none tracking-[0.08em] sm:text-[11px]"
                style={{ borderColor: COLORS.borderLight, color: COLORS.text }}
            >
                {title}
            </div>
            <div className="p-3 sm:p-4">{children}</div>
        </Surface>
    );
}

/* =========================================================
   GRÁFICOS
========================================================= */

function PieChart({
    data,
}: {
    data: Array<{ label: string; value: number }>;
}) {
    const total = data.reduce((s, d) => s + d.value, 0);
    const palette = [COLORS.blueDark, COLORS.yellow, COLORS.green, COLORS.teal, COLORS.blue];

    let acc = 0;
    const gradient =
        total > 0
            ? data
                .map((d, i) => {
                    const start = (acc / total) * 100;
                    acc += d.value;
                    const end = (acc / total) * 100;
                    return `${palette[i % palette.length]} ${start}% ${end}%`;
                })
                .join(", ")
            : COLORS.empty;

    return (
        <div className="grid items-center gap-3 sm:grid-cols-[96px_minmax(0,1fr)] lg:grid-cols-[104px_minmax(0,1fr)]">
            <div className="mx-auto flex items-center justify-center">
                <div className="relative">
                    <div
                        className="h-[92px] w-[92px] rounded-full border shadow-inner sm:h-[100px] sm:w-[100px]"
                        style={{
                            background: total > 0 ? `conic-gradient(${gradient})` : COLORS.empty,
                            borderColor: COLORS.borderLight,
                        }}
                    />
                    {total === 0 ? (
                        <div
                            className="absolute inset-0 grid place-items-center text-center text-xs font-bold"
                            style={{ color: COLORS.textSoft }}
                        >
                            Sem dados
                        </div>
                    ) : null}
                </div>
            </div>

            <div
                className="min-w-0 space-y-1 rounded-2xl border p-2"
                style={{ borderColor: COLORS.borderLight, backgroundColor: COLORS.cardSoft }}
            >
                {data.length === 0 ? (
                    <div className="py-4 text-center text-xs font-semibold" style={{ color: COLORS.textSoft }}>
                        Sem dados
                    </div>
                ) : (
                    data.map((d, i) => (
                        <div key={d.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5">
                            <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: palette[i % palette.length] }}
                            />
                            <span
                                className="min-w-0 whitespace-nowrap text-[8.5px] font-extrabold uppercase leading-none tracking-tight sm:text-[9.5px]"
                                style={{ color: COLORS.text }}
                                title={d.label}
                            >
                                {d.label}
                            </span>
                            <span
                                className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-extrabold text-white sm:text-[10px]"
                                style={{ backgroundColor: COLORS.blueDark }}
                            >
                                {fmt0(d.value)}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function BarChart({
    data,
}: {
    data: Array<{ label: string; value: number }>;
}) {
    const max = Math.max(1, ...data.map((d) => d.value));

    return (
        <div className="rounded-2xl border p-3" style={{ borderColor: COLORS.borderLight, backgroundColor: COLORS.cardSoft }}>
            {data.length === 0 ? (
                <div className="grid h-[160px] w-full place-items-center text-xs font-semibold" style={{ color: COLORS.textSoft }}>
                    Sem dados
                </div>
            ) : (
                <div className="flex h-[170px] items-end gap-2 border-b-2 px-1 pb-2" style={{ borderColor: COLORS.slate }}>
                    {data.slice(0, 4).map((d, idx) => {
                        const height = Math.max(22, (d.value / max) * 108);
                        return (
                            <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center">
                                <div
                                    className="mb-2 flex w-full max-w-[74px] items-center justify-center rounded-t-xl px-1 text-center text-[9px] font-black leading-none text-white sm:text-[10px]"
                                    style={{
                                        height,
                                        backgroundColor: idx % 2 === 0 ? COLORS.blueDark : COLORS.blue,
                                    }}
                                    title={fmt1(d.value)}
                                >
                                    {fmt1(d.value)}
                                </div>

                                <div
                                    className="max-w-[112px] whitespace-nowrap text-center text-[8px] font-extrabold uppercase leading-none tracking-tight sm:text-[8.5px]"
                                    style={{ color: COLORS.text }}
                                    title={d.label}
                                >
                                    {d.label}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* =========================================================
   MODAL
========================================================= */

function ModalPeriodo({
    aberto,
    valor,
    onFechar,
    onAplicar,
}: {
    aberto: boolean;
    valor: PeriodRange;
    onFechar: () => void;
    onAplicar: (v: PeriodRange) => void;
}) {
    const [preset, setPreset] = useState<PeriodPreset>(valor.preset);
    const [inicio, setInicio] = useState(valor.inicio);
    const [fim, setFim] = useState(valor.fim);

    useEffect(() => {
        if (!aberto) return;
        setPreset(valor.preset);
        setInicio(valor.inicio);
        setFim(valor.fim);
    }, [aberto, valor]);

    if (!aberto) return null;

    const opcoes: Array<{ key: PeriodPreset; label: string }> = [
        { key: "hoje", label: "Hoje" },
        { key: "ontem", label: "Ontem" },
        { key: "7d", label: "Semana" },
        { key: "mes", label: "Mês atual" },
        { key: "30d", label: "30 dias" },
        { key: "custom", label: "Personalizado" },
    ];

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
            <div
                className="w-full max-w-xl overflow-hidden rounded-[24px] border shadow-2xl"
                style={{ borderColor: COLORS.borderLight, backgroundColor: COLORS.card, color: COLORS.text }}
            >
                <div className="border-b px-5 py-4" style={{ borderColor: COLORS.borderLight }}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-black" style={{ color: COLORS.text }}>
                                Filtrar período
                            </h2>
                            <p className="text-sm" style={{ color: COLORS.textSoft }}>
                                Todos os números e gráficos serão recalculados.
                            </p>
                        </div>

                        <button
                            onClick={onFechar}
                            className="rounded-xl border px-3 py-1.5 text-sm font-bold hover:bg-slate-50"
                            style={{ borderColor: COLORS.borderLight, color: COLORS.text }}
                        >
                            Fechar
                        </button>
                    </div>
                </div>

                <div className="space-y-4 p-5">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {opcoes.map((o) => (
                            <button
                                key={o.key}
                                type="button"
                                onClick={() => {
                                    setPreset(o.key);
                                    if (o.key !== "custom") {
                                        const r = makeRange(o.key, inicio, fim);
                                        setInicio(r.inicio);
                                        setFim(r.fim);
                                    }
                                }}
                                className="rounded-2xl border px-3 py-2 text-sm font-extrabold transition"
                                style={{
                                    borderColor: preset === o.key ? COLORS.borderStrong : COLORS.borderLight,
                                    backgroundColor: preset === o.key ? COLORS.cardSoft : COLORS.card,
                                    color: preset === o.key ? COLORS.blueDark : COLORS.text,
                                }}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span
                                className="mb-1 block text-xs font-extrabold uppercase tracking-wide"
                                style={{ color: COLORS.textSoft }}
                            >
                                Data inicial
                            </span>
                            <input
                                type="date"
                                value={inicio}
                                onChange={(e) => {
                                    setInicio(e.target.value);
                                    setPreset("custom");
                                }}
                                className="w-full rounded-2xl border px-3 py-2 outline-none"
                                style={{ borderColor: COLORS.borderLight, color: COLORS.text, backgroundColor: COLORS.cardSoft }}
                            />
                        </label>

                        <label className="block">
                            <span
                                className="mb-1 block text-xs font-extrabold uppercase tracking-wide"
                                style={{ color: COLORS.textSoft }}
                            >
                                Data final
                            </span>
                            <input
                                type="date"
                                value={fim}
                                onChange={(e) => {
                                    setFim(e.target.value);
                                    setPreset("custom");
                                }}
                                className="w-full rounded-2xl border px-3 py-2 outline-none"
                                style={{ borderColor: COLORS.borderLight, color: COLORS.text, backgroundColor: COLORS.cardSoft }}
                            />
                        </label>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t p-4" style={{ borderColor: COLORS.borderLight, backgroundColor: COLORS.cardSoft }}>
                    <button
                        onClick={onFechar}
                        className="rounded-2xl border px-4 py-2 text-sm font-extrabold"
                        style={{ borderColor: COLORS.borderLight, color: COLORS.text }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            const r = makeRange(preset, inicio, fim);
                            onAplicar(r);
                            onFechar();
                        }}
                        className="rounded-2xl px-4 py-2 text-sm font-extrabold text-white"
                        style={{ backgroundColor: COLORS.blueDark }}
                    >
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
}

/* =========================================================
   RESUMO
========================================================= */

type MetricaResumo = {
    key: string;
    label: string;
    icon: React.ReactNode;
    qtd: number;
    tempoMedio: number | null;
};

type LinhaColaborador = {
    nome: string;
    colunas: Array<{ key: string; qtd: number; tempoMedio: number | null }>;
};

function MetricCard({ item }: { item: MetricaResumo }) {
    return (
        <div
            className="flex min-w-0 flex-col items-center justify-center rounded-2xl border px-2 py-2 text-center"
            style={{ borderColor: COLORS.borderLight, backgroundColor: COLORS.bg }}
        >
            <div className="mx-auto flex h-5 w-5 items-center justify-center sm:h-6 sm:w-6" style={{ color: COLORS.blue }}>
                {item.icon}
            </div>
            <div className="mt-1 text-[15px] font-black leading-none sm:text-[17px]" style={{ color: COLORS.text }}>
                {fmt0(item.qtd)}
            </div>
            <div
                className="mt-1 w-full truncate text-[7.5px] font-extrabold uppercase leading-none tracking-tight sm:text-[8px]"
                style={{ color: COLORS.textSoft }}
                title={item.label}
            >
                {item.label}
            </div>
            <div className="mt-1 text-[8px] font-bold leading-none sm:text-[9px]" style={{ color: COLORS.textSoft }}>
                {fmtHm(item.tempoMedio)}
            </div>
        </div>
    );
}

function ColaboradoresResumoTable({
    matrizColaboradores,
}: {
    matrizColaboradores: LinhaColaborador[];
}) {
    if (matrizColaboradores.length === 0) {
        return (
            <div
                className="rounded-2xl border p-6 text-center text-xs font-semibold"
                style={{ borderColor: COLORS.borderLight, color: COLORS.textSoft }}
            >
                Sem dados para o período.
            </div>
        );
    }

    const headers = [
        { key: "remocao", label: "Remoção" },
        { key: "ornamentacao", label: "Ornamentação" },
        { key: "velorio", label: "Velório" },
        { key: "sepultamento", label: "Sepultamento" },
        { key: "material", label: "Material" },
    ];

    return (
        <div className="w-full">
            <table className="w-full table-fixed border-separate border-spacing-y-1">
                <colgroup>
                    <col className="w-[22%]" />
                    {headers.map((h) => (
                        <col key={h.key} className="w-[15.6%]" />
                    ))}
                </colgroup>

                <thead>
                    <tr>
                        <th
                            className="px-1 pb-1 text-left text-[8px] font-black uppercase leading-none tracking-[0.08em] sm:text-[9px] lg:text-[10px]"
                            style={{ color: COLORS.textSoft }}
                        >
                            Colaborador
                        </th>

                        {headers.map((h) => (
                            <th
                                key={h.key}
                                className="px-1 pb-1 text-center text-[8px] font-black uppercase leading-none tracking-[0.06em] sm:text-[9px] lg:text-[10px]"
                                style={{ color: COLORS.textSoft }}
                                title={h.label}
                            >
                                {h.label}
                            </th>
                        ))}
                    </tr>
                </thead>

                <tbody>
                    {matrizColaboradores.map((row) => (
                        <tr key={row.nome}>
                            <td
                                className="rounded-l-xl border-y border-l px-2 py-1.5 text-[9px] font-black uppercase leading-tight sm:text-[10px] lg:text-[11px]"
                                style={{ borderColor: COLORS.borderLight, backgroundColor: COLORS.bg, color: COLORS.text }}
                                title={row.nome}
                            >
                                <span className="block truncate">{row.nome}</span>
                            </td>

                            {headers.map((h, idx) => {
                                const item = row.colunas.find((c) => c.key === h.key);
                                const isLast = idx === headers.length - 1;

                                return (
                                    <td
                                        key={`${row.nome}-${h.key}`}
                                        className={`${isLast ? "rounded-r-xl border-r" : ""} border-y px-1 py-1.5 text-center`}
                                        style={{ borderColor: COLORS.borderLight, backgroundColor: COLORS.cell }}
                                    >
                                        <div className="text-[13px] font-black leading-none sm:text-[14px] lg:text-[15px]" style={{ color: COLORS.text }}>
                                            {fmt0(item?.qtd || 0)}
                                        </div>
                                        <div className="mt-0.5 text-[8px] font-semibold leading-none sm:text-[9px]" style={{ color: COLORS.textSoft }}>
                                            {fmtHm(item?.tempoMedio ?? null)}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function IndicadorResumoCompacto({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div
            className="min-w-0 rounded-2xl border px-3 py-2"
            style={{ borderColor: COLORS.borderLight, backgroundColor: COLORS.bg }}
        >
            <div className="truncate text-[8.5px] font-extrabold uppercase leading-none tracking-wide sm:text-[9.5px]" style={{ color: COLORS.textSoft }}>
                {label}
            </div>
            <div className="mt-1 text-[19px] font-black leading-none sm:text-[22px]" style={{ color: COLORS.text }}>
                {value}
            </div>
        </div>
    );
}

function PeriodoResumoCompacto({
    periodo,
    totalAtendimentos,
    tempoMedioGeral,
    onFiltro,
}: {
    periodo: PeriodRange;
    totalAtendimentos: number;
    tempoMedioGeral: number | null;
    onFiltro: () => void;
}) {
    return (
        <Surface className="p-3">
            <div className="grid h-full gap-2">
                <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-black uppercase tracking-wide sm:text-xs" style={{ color: COLORS.text }}>
                            Período
                        </div>
                        <button
                            type="button"
                            onClick={onFiltro}
                            className="inline-flex shrink-0 items-center gap-1 rounded-xl border px-2.5 py-1 text-[10px] font-black uppercase leading-none transition hover:opacity-90"
                            style={{
                                borderColor: COLORS.blue,
                                color: COLORS.blueDark,
                                backgroundColor: COLORS.card,
                            }}
                        >
                            <IconCalendar />
                            Filtro
                        </button>
                    </div>
                    <div className="mt-1 truncate text-[12px] font-semibold sm:text-sm" style={{ color: COLORS.textSoft }}>
                        {formatDateBR(periodo.inicio)} até {formatDateBR(periodo.fim)}
                    </div>
                </div>

                <div className="grid min-w-0 grid-cols-2 gap-2">
                    <IndicadorResumoCompacto label="Qntd. de atendimentos" value={fmt0(totalAtendimentos)} />
                    <IndicadorResumoCompacto label="Tempo médio" value={fmtHm(tempoMedioGeral)} />
                </div>
            </div>
        </Surface>
    );
}

function MetricasResumoCompacto({
    metricasGerais,
}: {
    metricasGerais: MetricaResumo[];
}) {
    return (
        <Surface className="p-3">
            <div className="grid h-full grid-cols-3 gap-2 sm:grid-cols-6">
                {metricasGerais.map((m) => (
                    <MetricCard key={m.key} item={m} />
                ))}
            </div>
        </Surface>
    );
}

function SummaryMobile({
    periodo,
    totalAtendimentos,
    tempoMedioGeral,
    metricasGerais,
    matrizColaboradores,
    onFiltro,
}: {
    periodo: PeriodRange;
    totalAtendimentos: number;
    tempoMedioGeral: number | null;
    metricasGerais: MetricaResumo[];
    matrizColaboradores: LinhaColaborador[];
    onFiltro: () => void;
}) {
    return (
        <div className="space-y-3 xl:hidden">
            <PeriodoResumoCompacto
                periodo={periodo}
                totalAtendimentos={totalAtendimentos}
                tempoMedioGeral={tempoMedioGeral}
                onFiltro={onFiltro}
            />

            <MetricasResumoCompacto metricasGerais={metricasGerais} />

            <Surface className="overflow-hidden">
                <div className="border-b px-3 py-2 text-[11px] font-black uppercase tracking-wide" style={{ borderColor: COLORS.borderLight, color: COLORS.text }}>
                    Colaboradores
                </div>

                <div className="px-2 py-2 sm:px-3 sm:py-2">
                    <ColaboradoresResumoTable matrizColaboradores={matrizColaboradores} />
                </div>
            </Surface>
        </div>
    );
}

function SummaryDesktop({
    periodo,
    totalAtendimentos,
    tempoMedioGeral,
    metricasGerais,
    matrizColaboradores,
    onFiltro,
}: {
    periodo: PeriodRange;
    totalAtendimentos: number;
    tempoMedioGeral: number | null;
    metricasGerais: MetricaResumo[];
    matrizColaboradores: LinhaColaborador[];
    onFiltro: () => void;
}) {
    return (
        <div className="hidden space-y-3 xl:block">
            <div className="grid items-stretch gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
                <PeriodoResumoCompacto
                    periodo={periodo}
                    totalAtendimentos={totalAtendimentos}
                    tempoMedioGeral={tempoMedioGeral}
                    onFiltro={onFiltro}
                />

                <MetricasResumoCompacto metricasGerais={metricasGerais} />
            </div>

            <Surface className="overflow-hidden">
                <div className="border-b px-3 py-2 text-[11px] font-black uppercase tracking-wide" style={{ borderColor: COLORS.borderLight, color: COLORS.text }}>
                    Colaboradores
                </div>

                <div className="px-2 py-2 sm:px-3 sm:py-2">
                    <ColaboradoresResumoTable matrizColaboradores={matrizColaboradores} />
                </div>
            </Surface>
        </div>
    );
}

/* =========================================================
   PAGE
========================================================= */

export default function Page() {
    const [periodo, setPeriodo] = useState<PeriodRange>(() => makeRange("mes"));
    const [modalAberto, setModalAberto] = useState(false);

    const [registros, setRegistros] = useState<Registro[]>([]);
    const [motoristas, setMotoristas] = useState<MotoristaRow[]>([]);
    const [veiculos, setVeiculos] = useState<VeiculoRow[]>([]);

    const [loading, setLoading] = useState(false);
    const [loadingTanatoLogs, setLoadingTanatoLogs] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    type TanatoLogCacheEntry = { logs: any[]; fetched: boolean };
    const tanatoLogCacheRef = useRef<Record<string, TanatoLogCacheEntry>>({});
    const tanatoLogInFlightRef = useRef<Set<string>>(new Set());
    const [tanatoLogCacheVersion, setTanatoLogCacheVersion] = useState(0);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro(null);

        try {
            const r14 = rangeTo14(periodo);

            const urlInformativo = `${INFORMATICO_URL}&_ts=${Date.now()}`;
            const urlMotoristas =
                `${TELEMETRIA_URL}?itrack=motoristas` +
                `&inicio=${encodeURIComponent(r14.inicio)}` +
                `&fim=${encodeURIComponent(r14.fim)}` +
                `&_ts=${Date.now()}`;

            const urlVeiculos =
                `${TELEMETRIA_URL}?itrack=historico_veicular` +
                `&inicio=${encodeURIComponent(r14.inicio)}` +
                `&fim=${encodeURIComponent(r14.fim)}` +
                `&_ts=${Date.now()}`;

            const [infoJson, motJson, veiJson] = await Promise.all([
                fetchJson<ApiResp<Registro>>(urlInformativo, {
                    cacheKey: `informativo-geral`,
                }),
                fetchJson<ApiResp<MotoristaRow>>(urlMotoristas, {
                    cacheKey: `motoristas-${periodo.inicio}-${periodo.fim}`,
                }),
                fetchJson<ApiResp<VeiculoRow>>(urlVeiculos, {
                    cacheKey: `veiculos-${periodo.inicio}-${periodo.fim}`,
                }),
            ]);

            setRegistros(extractArray(infoJson));
            setMotoristas(extractArray(motJson));
            setVeiculos(extractArray(veiJson));
        } catch (e: any) {
            setErro(e?.message || "Falha ao carregar os dados.");
        } finally {
            setLoading(false);
        }
    }, [periodo]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    const dadosPeriodo = useMemo(() => {
        const { start, end } = rangeToDates(periodo);
        return (registros || []).filter((r) => registroDentroDoPeriodo(r, start, end));
    }, [registros, periodo]);

    const dadosPeriodoUnicos = useMemo(() => dedupeRegistros(dadosPeriodo), [dadosPeriodo]);

    const tanatoBase = useMemo(() => {
        // A Tanato precisa ser filtrada pelo horário do log de início da conservação.
        // Por isso a base considera todos os registros carregados com tanato = sim;
        // o período é aplicado depois em findPrimeiroInicioPuroNoPeriodo.
        return dedupeRegistros((registros || []).filter((r) => isSim(r.tanato)));
    }, [registros]);

    const tanatoEntities = useMemo(() => {
        const list = tanatoBase
            .map((r) => {
                const key = getEntityKey(r);
                const idsToTry = getIdsParaTentar(r);
                return { key, idsToTry, registro: r };
            })
            .filter((x) => x.key && x.idsToTry.length);

        return {
            list,
            keySet: new Set(list.map((x) => x.key)),
        };
    }, [tanatoBase]);

    useEffect(() => {
        const targets = tanatoEntities.list.filter(
            (e) => !tanatoLogCacheRef.current[e.key]?.fetched && !tanatoLogInFlightRef.current.has(e.key)
        );

        if (!targets.length) {
            setLoadingTanatoLogs(false);
            return;
        }

        let cancel = false;
        setLoadingTanatoLogs(true);

        async function run(maxConc = 4) {
            let index = 0;

            for (const target of targets) tanatoLogInFlightRef.current.add(target.key);

            async function worker() {
                while (index < targets.length && !cancel) {
                    const item = targets[index++];

                    try {
                        let logs: any[] = [];

                        for (const id of item.idsToTry) {
                            try {
                                const res = await listarLogPorId(id);
                                if (Array.isArray(res) && res.length) {
                                    logs = res;
                                    break;
                                }
                            } catch {
                                // tenta o próximo id
                            }
                        }

                        tanatoLogCacheRef.current[item.key] = { logs, fetched: true };
                    } finally {
                        tanatoLogInFlightRef.current.delete(item.key);
                    }
                }
            }

            await Promise.all(Array.from({ length: Math.min(maxConc, targets.length) }, worker));

            if (!cancel) {
                setTanatoLogCacheVersion((v) => v + 1);
                setLoadingTanatoLogs(false);
            }
        }

        run();

        return () => {
            cancel = true;
        };
    }, [tanatoEntities]);

    const tanatoStats = useMemo(() => {
        const { start, end } = rangeToDates(periodo);

        const byAgent: Record<TanatoAgent, { qtd: number; duracoes: number[] }> = {
            SANDRO: { qtd: 0, duracoes: [] },
            JOSEILDO: { qtd: 0, duracoes: [] },
        };

        const vistosPorAgente: Record<TanatoAgent, Set<string>> = {
            SANDRO: new Set<string>(),
            JOSEILDO: new Set<string>(),
        };

        for (const r of tanatoBase) {
            const entityKey =
                getEntityKey(r) ||
                `${String(r.falecido || "sem-chave")}-${String(r.data || r.created_at || "")}`;

            const cache = tanatoLogCacheRef.current[entityKey];

            // Mesma regra do outro painel:
            // só conta se houver log válido de início da conservação no período
            // e se o usuário do log for Sandro ou Joseildo.
            if (!cache?.fetched || !Array.isArray(cache.logs) || !cache.logs.length) {
                continue;
            }

            const inicio = findPrimeiroInicioPuroNoPeriodo(cache.logs, start, end);
            if (!inicio) {
                continue;
            }

            const agenteLog = normalizeTanatoAgentName(agenteDoLog(inicio));
            if (!agenteLog) {
                continue;
            }

            if (vistosPorAgente[agenteLog].has(entityKey)) {
                continue;
            }

            vistosPorAgente[agenteLog].add(entityKey);
            byAgent[agenteLog].qtd += 1;

            const duracao = getDurationMinutes(r);
            if (duracao != null && Number.isFinite(duracao)) {
                byAgent[agenteLog].duracoes.push(duracao);
            }
        }

        const total = byAgent.SANDRO.qtd + byAgent.JOSEILDO.qtd;
        const tempoMedio = average([
            ...byAgent.SANDRO.duracoes,
            ...byAgent.JOSEILDO.duracoes,
        ]);

        return { byAgent, total, tempoMedio };
    }, [periodo, tanatoBase, tanatoLogCacheVersion]);

    const metricasGerais = useMemo<MetricaResumo[]>(() => {
        return METRICAS.map((m) => {
            if (m.key === "tanato") {
                return {
                    key: m.key,
                    label: m.label,
                    icon: m.icon,
                    qtd: tanatoStats.total,
                    tempoMedio: tanatoStats.tempoMedio,
                };
            }

            const subset = dadosPeriodoUnicos.filter(m.match);
            return {
                key: m.key,
                label: m.label,
                icon: m.icon,
                qtd: subset.length,
                tempoMedio: average(subset.map(getDurationMinutes)),
            };
        });
    }, [dadosPeriodoUnicos, tanatoStats]);

    const colaboradores = useMemo(() => {
        const map = new Map<string, number>();

        for (const r of dadosPeriodoUnicos) {
            const nome = getAgenteNome(r);
            map.set(nome, (map.get(nome) || 0) + 1);
        }

        for (const nome of ["SANDRO", "JOSEILDO"] as const) {
            const qtdTanato = tanatoStats.byAgent[nome].qtd;
            if (qtdTanato > 0) map.set(nome, Math.max(map.get(nome) || 0, qtdTanato));
        }

        return Array.from(map.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 8)
            .map(([nome]) => nome);
    }, [dadosPeriodoUnicos, tanatoStats]);

    const matrizColaboradores = useMemo<LinhaColaborador[]>(() => {
        return colaboradores.map((nome) => {
            const doAgente = dadosPeriodoUnicos.filter((r) => getAgenteNome(r) === nome);

            const remocao = doAgente;

            const ornamentacao = doAgente.filter((r) => {
                const s = norm(`${r.ornamentacao || ""} ${r.ornamentacao_tipo || ""}`);
                return !!s && s !== "nao" && s !== "não";
            });

            const velorio = doAgente.filter((r) => !!String(r.local_velorio || r.data_inicio_velorio || "").trim());
            const sepultamento = doAgente;
            const material = doAgente.filter(hasMateriais);

            const colunas = [
                {
                    key: "remocao",
                    qtd: remocao.length,
                    tempoMedio: average(remocao.map(getDurationMinutes)),
                },
                {
                    key: "ornamentacao",
                    qtd: ornamentacao.length,
                    tempoMedio: average(ornamentacao.map(getDurationMinutes)),
                },
                {
                    key: "velorio",
                    qtd: velorio.length,
                    tempoMedio: average(velorio.map(getDurationMinutes)),
                },
                {
                    key: "sepultamento",
                    qtd: sepultamento.length,
                    tempoMedio: average(sepultamento.map(getDurationMinutes)),
                },
                {
                    key: "material",
                    qtd: material.length,
                    tempoMedio: average(material.map(getDurationMinutes)),
                },
            ];

            return { nome, colunas };
        });
    }, [colaboradores, dadosPeriodoUnicos]);

    const pieAtendimentos = useMemo(() => {
        const map = new Map<string, number>();

        for (const r of dadosPeriodoUnicos) {
            const convenio = normalizeConvenio(r.convenio);
            map.set(convenio, (map.get(convenio) || 0) + 1);
        }

        return Array.from(map.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [dadosPeriodoUnicos]);

    const pieTanato = useMemo(() => {
        return (["SANDRO", "JOSEILDO"] as const)
            .map((label) => ({ label, value: tanatoStats.byAgent[label].qtd }))
            .filter((x) => x.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [tanatoStats]);

    const barVeiculos = useMemo(() => {
        return (veiculos || [])
            .map((v) => ({
                label: getVeiculoNome(v),
                value: getVeiculoKm(v),
            }))
            .filter((x) => x.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 4);
    }, [veiculos]);

    const barColaboradores = useMemo(() => {
        const map = new Map<string, number>();

        for (const v of veiculos || []) {
            const nome = String(v.motorista || v.nome_motorista || "").trim().toUpperCase();
            const km = getVeiculoKm(v);
            if (!nome || km <= 0) continue;
            map.set(nome, (map.get(nome) || 0) + km);
        }

        if (map.size === 0) {
            for (const m of motoristas || []) {
                const nome = String(m.motorista || m.nome_motorista || "SEM NOME").trim().toUpperCase();
                const km = num(m.distancia_km ?? m.distancia_percorrida_km);
                if (km > 0) map.set(nome, (map.get(nome) || 0) + km);
            }
        }

        return Array.from(map.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 4);
    }, [veiculos, motoristas]);

    const tempoMedioGeral = useMemo(() => average(dadosPeriodoUnicos.map(getDurationMinutes)), [dadosPeriodoUnicos]);

    return (
        <main
            className={`${nunito.className} dashboard-desempenho-page min-h-screen overflow-x-hidden px-3 py-3 sm:px-4 lg:px-5`}
            style={{ backgroundColor: COLORS.bg }}
        >
            <DashboardThemeStyles />
            <div className="mx-auto w-full max-w-[1480px]">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h1
                        className="text-[15px] font-black uppercase leading-none tracking-[0.08em] sm:text-[17px] lg:text-[19px]"
                        style={{ color: COLORS.text }}
                    >
                        Análise de Desempenho
                    </h1>

                    {loading ? (
                        <div className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: COLORS.textSoft }}>
                            Atualizando...
                        </div>
                    ) : null}
                </div>

                {erro ? (
                    <div
                        className="mb-4 rounded-2xl border px-4 py-3 text-sm font-bold"
                        style={{
                            borderColor: COLORS.dangerBorder,
                            backgroundColor: COLORS.dangerBg,
                            color: COLORS.dangerText,
                        }}
                    >
                        {erro}
                    </div>
                ) : null}

                {loadingTanatoLogs ? (
                    <div
                        className="mb-4 rounded-2xl border px-4 py-3 text-sm font-extrabold"
                        style={{
                            borderColor: COLORS.borderLight,
                            backgroundColor: COLORS.card,
                            color: COLORS.textSoft,
                        }}
                    >
                        Buscando logs da Tanatopraxia...
                    </div>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(470px,0.82fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(560px,0.78fr)]">
                    <div className="min-w-0">
                        <SummaryMobile
                            periodo={periodo}
                            totalAtendimentos={dadosPeriodoUnicos.length}
                            tempoMedioGeral={tempoMedioGeral}
                            metricasGerais={metricasGerais}
                            matrizColaboradores={matrizColaboradores}
                            onFiltro={() => setModalAberto(true)}
                        />

                        <SummaryDesktop
                            periodo={periodo}
                            totalAtendimentos={dadosPeriodoUnicos.length}
                            tempoMedioGeral={tempoMedioGeral}
                            metricasGerais={metricasGerais}
                            matrizColaboradores={matrizColaboradores}
                            onFiltro={() => setModalAberto(true)}
                        />
                    </div>

                    <div className="min-w-0">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                            <ChartPanel title="Atendimentos">
                                <PieChart data={pieAtendimentos} />
                            </ChartPanel>

                            <ChartPanel title="Tanatopraxia">
                                <PieChart data={pieTanato} />
                            </ChartPanel>

                            <ChartPanel title="Quilometragem por veículo (km)">
                                <BarChart data={barVeiculos} />
                            </ChartPanel>

                            <ChartPanel title="Quilometragem por colaborador">
                                <BarChart data={barColaboradores} />
                            </ChartPanel>
                        </div>
                    </div>
                </div>
            </div>

            <ModalPeriodo
                aberto={modalAberto}
                valor={periodo}
                onFechar={() => setModalAberto(false)}
                onAplicar={setPeriodo}
            />
        </main>
    );
}