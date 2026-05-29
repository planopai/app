"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

/* =========================================================
   CONFIG
========================================================= */

const API_BASE = "https://api.planoassistencialintegrado.com.br";

const INFORMATICO_URL = `${API_BASE}/informativo.php?listar=1`;
const TELEMETRIA_URL = `${API_BASE}/telemetria.php`;

type PeriodPreset = "hoje" | "ontem" | "7d" | "mes" | "30d" | "custom";

type PeriodRange = {
    preset: PeriodPreset;
    inicio: string; // yyyy-mm-dd
    fim: string; // yyyy-mm-dd
    label: string;
};

type Registro = {
    id?: string | number;
    sepultamento_id?: string | number;

    falecido?: string;
    agente?: string;
    usuario?: string;
    operador?: string;
    responsavel?: string;

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
        dados?: T[];
        data?: T[];
        total?: number;
        msg?: string;
    };

/* =========================================================
   FETCH / CACHE
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
    const timeoutMs = opts?.timeoutMs ?? 18000;
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

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            setCache(cacheKey, data, ttlMs);
            return data as T;
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
        return {
            preset,
            inicio: toIsoDate(start),
            fim: toIsoDate(now),
            label: "Últimos 7 dias",
        };
    }

    if (preset === "mes") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
            preset,
            inicio: toIsoDate(start),
            fim: toIsoDate(now),
            label: "Mês atual",
        };
    }

    if (preset === "30d") {
        const start = new Date(now);
        start.setDate(start.getDate() - 29);
        return {
            preset,
            inicio: toIsoDate(start),
            fim: toIsoDate(now),
            label: "Últimos 30 dias",
        };
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

function getRegistroDate(r: Registro): Date | null {
    const candidates = [
        r.data,
        r.created_at,
        r.datahora,
        r.ultima_datahora,
        r.data_inicio_velorio,
        r.data_fim_velorio,
    ];

    for (const c of candidates) {
        const d = parseDateFlex(String(c || ""));
        if (d) return d;
    }
    return null;
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

function getTanatoNome(r: Registro) {
    return String(
        r.agente_tanato ||
        r.tanatopraxista ||
        r.usuario_tanato ||
        r.agente_conservacao ||
        r.agente ||
        "SEM NOME"
    )
        .trim()
        .toUpperCase();
}

function hasMateriais(r: Registro) {
    if (r.materiais_json) {
        try {
            const obj =
                typeof r.materiais_json === "string"
                    ? JSON.parse(r.materiais_json)
                    : r.materiais_json;

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

/* =========================================================
   ÍCONES
========================================================= */

function IconCalendar() {
    return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
    );
}

function IconAssistencia() {
    return (
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 4v16M4 12h16" />
        </svg>
    );
}

function IconTanato() {
    return (
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2.1">
            <path d="M4 20l6-6M10 14l8-8" />
            <path d="M13 3l8 8" />
            <circle cx="18" cy="6" r="2" />
        </svg>
    );
}

function IconOrnamentacao() {
    return (
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="2.2" />
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M18.5 5.5l-2.8 2.8M8.3 15.7l-2.8 2.8" />
        </svg>
    );
}

function IconInvol() {
    return (
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor">
            <path d="M12 2l7 4 2 8-9 8-9-8 2-8 7-4z" opacity=".9" />
            <path d="M7 19l10-11" fill="none" stroke="white" strokeWidth="1.7" />
        </svg>
    );
}

function IconVelorio() {
    return (
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 14h18M5 14v-3a3 3 0 013-3h5a5 5 0 015 5v1" />
            <circle cx="7" cy="17" r="2" />
            <circle cx="17" cy="17" r="2" />
        </svg>
    );
}

function IconMaterial() {
    return (
        <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-4z" />
            <path d="M12 7v5l3 2" />
            <path d="M4 9l3-1M17 8l3 1M6 19l2-2M16 17l2 2" />
        </svg>
    );
}

const METRICAS = [
    {
        key: "assistencia",
        label: "Assistência",
        icon: <IconAssistencia />,
        match: (r: Registro) => isSim(r.assistencia),
    },
    {
        key: "tanato",
        label: "Tanato",
        icon: <IconTanato />,
        match: (r: Registro) => isSim(r.tanato),
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
        key: "invol",
        label: "Invol",
        icon: <IconInvol />,
        match: (r: Registro) => isSim(r.invol),
    },
    {
        key: "velorio",
        label: "Velório",
        icon: <IconVelorio />,
        match: (r: Registro) => !!String(r.local_velorio || r.data_inicio_velorio || "").trim(),
    },
    {
        key: "material",
        label: "Material",
        icon: <IconMaterial />,
        match: (r: Registro) => hasMateriais(r),
    },
] as const;

/* =========================================================
   CHARTS
========================================================= */

const COLORS = ["#0C6289", "#F4BC00", "#1F7A25", "#4C8ED6", "#7C3AED", "#EF4444"];

function PieChart({
    title,
    data,
}: {
    title: string;
    data: Array<{ label: string; value: number }>;
}) {
    const size = 170;
    const cx = size / 2;
    const cy = size / 2;
    const r = 54;
    const total = data.reduce((s, d) => s + d.value, 0);

    let acc = 0;

    function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
        const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
        return {
            x: centerX + radius * Math.cos(angleInRadians),
            y: centerY + radius * Math.sin(angleInRadians),
        };
    }

    function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
        const start = polarToCartesian(x, y, radius, endAngle);
        const end = polarToCartesian(x, y, radius, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        return `M ${x} ${y} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
    }

    return (
        <div className="rounded-sm bg-[#d9d9d9] p-3 shadow-inner">
            <div className="mb-2 text-center text-[18px] font-black tracking-tight text-[#414141] md:text-[20px]">
                {title.toUpperCase()}
            </div>

            <div className="grid grid-cols-[180px_1fr] items-center gap-2">
                <div className="flex items-center justify-center">
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                        {total <= 0 ? (
                            <circle cx={cx} cy={cy} r={r} fill="#cfcfcf" />
                        ) : (
                            data.map((d, i) => {
                                const startAngle = (acc / total) * 360;
                                acc += d.value;
                                const endAngle = (acc / total) * 360;
                                const path = describeArc(cx, cy, r, startAngle, endAngle);

                                const mid = (startAngle + endAngle) / 2;
                                const pos = polarToCartesian(cx, cy, 28, mid);

                                return (
                                    <g key={d.label}>
                                        <path d={path} fill={COLORS[i % COLORS.length]} />
                                        <rect
                                            x={pos.x - 12}
                                            y={pos.y - 10}
                                            rx="2"
                                            ry="2"
                                            width="24"
                                            height="20"
                                            fill="#404040"
                                            opacity="0.92"
                                        />
                                        <text
                                            x={pos.x}
                                            y={pos.y + 4}
                                            textAnchor="middle"
                                            fontSize="12"
                                            fontWeight="700"
                                            fill="white"
                                        >
                                            {fmt0(d.value)}
                                        </text>
                                    </g>
                                );
                            })
                        )}
                    </svg>
                </div>

                <div className="space-y-2 bg-white/25 p-2">
                    {data.length === 0 ? (
                        <div className="text-sm text-[#555]">Sem dados</div>
                    ) : (
                        data.map((d, i) => (
                            <div key={d.label} className="flex items-start gap-2 text-[13px] text-[#4b4b4b]">
                                <span
                                    className="mt-1 inline-block h-3 w-3 shrink-0"
                                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                                />
                                <span className="break-words">{d.label}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function SimpleBarChart({
    title,
    data,
}: {
    title: string;
    data: Array<{ label: string; value: number }>;
}) {
    const max = Math.max(1, ...data.map((d) => d.value));

    return (
        <div className="rounded-sm bg-[#d9d9d9] p-3 shadow-inner">
            <div className="mb-3 text-center text-[10px] font-black uppercase tracking-wide text-[#505050]">
                {title}
            </div>

            <div className="h-[120px] rounded-sm bg-white/10 p-2">
                <div className="flex h-[86px] items-end gap-3 border-b-2 border-[#555] px-1">
                    {data.length === 0 ? (
                        <div className="grid h-full w-full place-items-center text-xs text-[#666]">
                            Sem dados
                        </div>
                    ) : (
                        data.slice(0, 6).map((d) => {
                            const h = Math.max(16, (d.value / max) * 62);
                            return (
                                <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center">
                                    <div
                                        className="mb-1 flex w-full max-w-[56px] items-center justify-center bg-[#3E7C9A] text-[12px] font-black text-white"
                                        style={{ height: h }}
                                    >
                                        {fmt0(d.value)}
                                    </div>
                                    <div className="mt-2 max-w-[64px] truncate text-center text-[11px] text-[#4d4d4d]">
                                        {d.label}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

/* =========================================================
   MODAL PERÍODO
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

    const botoes: Array<{ key: PeriodPreset; label: string }> = [
        { key: "hoje", label: "Hoje" },
        { key: "ontem", label: "Ontem" },
        { key: "7d", label: "Semana" },
        { key: "mes", label: "Mês atual" },
        { key: "30d", label: "30 dias" },
        { key: "custom", label: "Personalizado" },
    ];

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
                <div className="border-b p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Filtrar período</h2>
                            <p className="text-sm text-slate-500">
                                Escolha um período para atualizar todos os gráficos.
                            </p>
                        </div>
                        <button
                            onClick={onFechar}
                            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
                        >
                            Fechar
                        </button>
                    </div>
                </div>

                <div className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {botoes.map((b) => (
                            <button
                                key={b.key}
                                type="button"
                                onClick={() => {
                                    setPreset(b.key);
                                    if (b.key !== "custom") {
                                        const r = makeRange(b.key, inicio, fim);
                                        setInicio(r.inicio);
                                        setFim(r.fim);
                                    }
                                }}
                                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${preset === b.key
                                    ? "border-blue-600 bg-blue-50 text-blue-700"
                                    : "hover:bg-slate-50"
                                    }`}
                            >
                                {b.label}
                            </button>
                        ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                                Data inicial
                            </span>
                            <input
                                type="date"
                                value={inicio}
                                onChange={(e) => {
                                    setInicio(e.target.value);
                                    setPreset("custom");
                                }}
                                className="w-full rounded-xl border px-3 py-2 outline-none focus:border-blue-600"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase text-slate-500">
                                Data final
                            </span>
                            <input
                                type="date"
                                value={fim}
                                onChange={(e) => {
                                    setFim(e.target.value);
                                    setPreset("custom");
                                }}
                                className="w-full rounded-xl border px-3 py-2 outline-none focus:border-blue-600"
                            />
                        </label>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
                    <button
                        onClick={onFechar}
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:bg-slate-100"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            const r = makeRange(preset, inicio, fim);
                            onAplicar(r);
                            onFechar();
                        }}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                    >
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
}

/* =========================================================
   PAGE
========================================================= */

export default function Page() {
    const [periodo, setPeriodo] = useState<PeriodRange>(() => makeRange("7d"));
    const [modalAberto, setModalAberto] = useState(false);

    const [registros, setRegistros] = useState<Registro[]>([]);
    const [motoristas, setMotoristas] = useState<MotoristaRow[]>([]);
    const [veiculos, setVeiculos] = useState<VeiculoRow[]>([]);

    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

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
                    cacheKey: `informativo-${periodo.inicio}-${periodo.fim}`,
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
            setErro(e?.message || "Falha ao carregar análise.");
        } finally {
            setLoading(false);
        }
    }, [periodo]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    const dadosPeriodo = useMemo(() => {
        const { start, end } = rangeToDates(periodo);
        return (registros || []).filter((r) => {
            const d = getRegistroDate(r);
            if (!d) return false;
            return d >= start && d <= end;
        });
    }, [registros, periodo]);

    const metricasGerais = useMemo(() => {
        return METRICAS.map((m) => {
            const subset = dadosPeriodo.filter(m.match);
            return {
                key: m.key,
                label: m.label,
                icon: m.icon,
                qtd: subset.length,
                tempoMedio: average(subset.map(getDurationMinutes)),
            };
        });
    }, [dadosPeriodo]);

    const colaboradores = useMemo(() => {
        const map = new Map<string, number>();

        for (const r of dadosPeriodo) {
            const nome = getAgenteNome(r);
            map.set(nome, (map.get(nome) || 0) + 1);
        }

        return Array.from(map.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 8)
            .map(([nome]) => nome);
    }, [dadosPeriodo]);

    const matrizColaboradores = useMemo(() => {
        return colaboradores.map((nome) => {
            const doAgente = dadosPeriodo.filter((r) => getAgenteNome(r) === nome);

            const colunas = METRICAS.map((m) => {
                const subset = doAgente.filter(m.match);
                return {
                    key: m.key,
                    qtd: subset.length,
                    tempoMedio: average(subset.map(getDurationMinutes)),
                };
            });

            return { nome, colunas };
        });
    }, [colaboradores, dadosPeriodo]);

    const pieAtendimentos = useMemo(() => {
        const map = new Map<string, number>();

        for (const r of dadosPeriodo) {
            const c = normalizeConvenio(r.convenio);
            map.set(c, (map.get(c) || 0) + 1);
        }

        return Array.from(map.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 4);
    }, [dadosPeriodo]);

    const pieTanato = useMemo(() => {
        const map = new Map<string, number>();

        for (const r of dadosPeriodo.filter((x) => isSim(x.tanato))) {
            const nome = getTanatoNome(r);
            map.set(nome, (map.get(nome) || 0) + 1);
        }

        return Array.from(map.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 4);
    }, [dadosPeriodo]);

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

        // 1) tenta km por motorista vindo do histórico veicular
        for (const v of veiculos || []) {
            const nome = String(v.motorista || v.nome_motorista || "").trim().toUpperCase();
            const km = getVeiculoKm(v);
            if (!nome || km <= 0) continue;
            map.set(nome, (map.get(nome) || 0) + km);
        }

        // 2) fallback motoristas
        if (map.size === 0) {
            for (const m of motoristas || []) {
                const nome = String(m.motorista || m.nome_motorista || "SEM NOME").trim().toUpperCase();
                const km = num(m.distancia_km ?? m.distancia_percorrida_km);
                if (km > 0) {
                    map.set(nome, (map.get(nome) || 0) + km);
                }
            }
        }

        return Array.from(map.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 4);
    }, [veiculos, motoristas]);

    return (
        <main className="min-h-screen bg-[#efefef] p-2 sm:p-3 md:p-4">
            <div className="mx-auto max-w-[1400px]">
                {/* topo */}
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-[#333] sm:text-2xl">
                            ANÁLISE DE DESEMPENHO
                        </h1>
                        <div className="text-xs text-[#666]">
                            Período: {formatDateBR(periodo.inicio)} até {formatDateBR(periodo.fim)}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setModalAberto(true)}
                            className="inline-flex items-center gap-2 rounded-lg border border-[#6b9fc5] bg-white px-3 py-2 text-sm font-bold text-[#2c6f96] hover:bg-[#f4faff]"
                        >
                            <IconCalendar />
                            Filtrar período
                        </button>

                        <button
                            onClick={carregar}
                            disabled={loading}
                            className="rounded-lg bg-[#2f6f91] px-3 py-2 text-sm font-bold text-white hover:bg-[#245e7a] disabled:opacity-60"
                        >
                            {loading ? "Carregando..." : "Atualizar"}
                        </button>
                    </div>
                </div>

                {erro ? (
                    <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {erro}
                    </div>
                ) : null}

                {/* layout principal exatamente no espírito da imagem */}
                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.95fr]">
                    {/* ESQUERDA */}
                    <div className="overflow-hidden rounded-sm bg-[#efefef]">
                        <div className="overflow-x-auto">
                            <div className="min-w-[930px]">
                                <div
                                    className="grid"
                                    style={{
                                        gridTemplateColumns: "190px repeat(6, 1fr)",
                                    }}
                                >
                                    {/* cabeçalho esquerda */}
                                    <div className="border-b-2 border-r-2 border-[#1E7096] px-3 pb-4 pt-4">
                                        <div className="text-[18px] font-black text-[#1f1f1f]">PERIODO</div>

                                        <div className="mt-8 grid grid-cols-[1fr_auto] gap-y-3 text-[#1f1f1f]">
                                            <div className="text-[12px] leading-tight">
                                                QNTD. DE
                                                <br />
                                                ATENDIMENTOS
                                            </div>
                                            <div className="text-[16px]">{fmt0(dadosPeriodo.length)}</div>

                                            <div className="text-[12px] leading-tight">
                                                TEMPO
                                                <br />
                                                MÉDIO
                                            </div>
                                            <div className="text-[16px]">
                                                {fmtHm(average(dadosPeriodo.map(getDurationMinutes)))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* cabeçalho métricas */}
                                    {metricasGerais.map((m) => (
                                        <div
                                            key={m.key}
                                            className="border-b-2 border-[#1E7096] px-2 pb-4 pt-3 text-center"
                                        >
                                            <div className="mx-auto flex h-[46px] w-[46px] items-center justify-center text-[#4C8ED6]">
                                                {m.icon}
                                            </div>
                                            <div className="mt-2 text-[15px] text-[#1f1f1f]">{fmt0(m.qtd)}</div>
                                            <div className="text-[14px] text-[#1f1f1f]">
                                                {fmtHm(m.tempoMedio)}
                                            </div>
                                        </div>
                                    ))}

                                    {/* linhas colaboradores */}
                                    {matrizColaboradores.map((row) => (
                                        <React.Fragment key={row.nome}>
                                            <div className="border-r-2 border-[#1E7096] px-3 py-3 text-center text-[20px] leading-none text-[#161616]">
                                                {row.nome}
                                            </div>

                                            {row.colunas.map((c) => (
                                                <div key={`${row.nome}-${c.key}`} className="px-2 py-3 text-center">
                                                    <div className="text-[15px] leading-tight text-[#1f1f1f]">
                                                        {fmt0(c.qtd)}
                                                    </div>
                                                    <div className="text-[14px] leading-tight text-[#1f1f1f]">
                                                        {fmtHm(c.tempoMedio)}
                                                    </div>
                                                </div>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* DIREITA */}
                    <div className="grid gap-3 md:grid-cols-2">
                        <PieChart title="Atendimentos" data={pieAtendimentos} />
                        <PieChart title="Tanatopraxia" data={pieTanato} />
                        <SimpleBarChart title="Quilometragem por veículo (km)" data={barVeiculos} />
                        <SimpleBarChart title="Quilometragem por colaborador" data={barColaboradores} />
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