"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

/* ============================================================
   CONFIG
   ============================================================ */

const API_BASE = "https://api.planoassistencialintegrado.com.br";

const ENDPOINTS = {
    informativo: `${API_BASE}/informativo.php?listar=1`,
    telemetria: `${API_BASE}/telemetria.php`,
};

type PeriodPreset =
    | "hoje"
    | "ontem"
    | "7d"
    | "mes_atual"
    | "30d"
    | "custom";

type PeriodRange = {
    preset: PeriodPreset;
    inicio: string; // yyyy-mm-dd
    fim: string; // yyyy-mm-dd
    label: string;
};

type Registro = {
    id?: number | string;
    sepultamento_id?: number | string;

    falecido?: string;
    agente?: string;
    usuario?: string;

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

    materiais_json?: any;
    arrumacao_json?: any;

    local?: string;
    local_velorio?: string;
    local_sepultamento?: string;

    [key: string]: any;
};

type MotoristaRow = {
    motorista?: string;
    total_posicoes?: number | string;
    total_veiculos?: number | string;
    placas?: string;
    velocidade_media?: number | string;
    velocidade_maxima?: number | string;
    primeira_posicao?: string;
    ultima_posicao?: string;
    [key: string]: any;
};

type VeiculoRow = {
    placa?: string;
    descricao_veiculo?: string;
    veiculo?: string;
    motorista?: string;
    nome_motorista?: string;
    distancia_percorrida_km?: number | string;
    distancia_km?: number | string;
    velocidade_media?: number | string;
    velocidade_maxima?: number | string;
    [key: string]: any;
};

type ApiListResponse<T> = T[] | { sucesso?: boolean; erro?: boolean; msg?: string; dados?: T[]; total?: number; total_km?: number };

/* ============================================================
   FETCH
   ============================================================ */

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
    const ttlMs = opts?.ttlMs ?? 15_000;
    const timeoutMs = opts?.timeoutMs ?? 18_000;
    const cacheKey = opts?.cacheKey ?? url;

    const cached = getCache<T>(cacheKey);
    if (cached) return cached;

    const inflight = INFLIGHT.get(cacheKey);
    if (inflight) return (await inflight) as T;

    const promise = (async () => {
        const ac = new AbortController();
        const timer = window.setTimeout(() => ac.abort(), timeoutMs);

        try {
            const res = await fetch(url, {
                method: "GET",
                cache: "no-store",
                credentials: "include",
                signal: ac.signal,
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = (await res.json()) as T;
            setCache(cacheKey, data, ttlMs);
            return data;
        } finally {
            window.clearTimeout(timer);
            INFLIGHT.delete(cacheKey);
        }
    })();

    INFLIGHT.set(cacheKey, promise);
    return promise as Promise<T>;
}

/* ============================================================
   HELPERS
   ============================================================ */

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function toIsoDate(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function todayRange(): PeriodRange {
    const now = new Date();
    const iso = toIsoDate(now);
    return { preset: "hoje", inicio: iso, fim: iso, label: "Hoje" };
}

function makeRange(preset: PeriodPreset, customInicio?: string, customFim?: string): PeriodRange {
    const now = new Date();

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

    if (preset === "mes_atual") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
            preset,
            inicio: toIsoDate(start),
            fim: toIsoDate(now),
            label: "Mês atual",
        };
    }

    if (preset === "custom") {
        const ini = customInicio || toIsoDate(now);
        const fim = customFim || ini;
        return {
            preset,
            inicio: ini <= fim ? ini : fim,
            fim: fim >= ini ? fim : ini,
            label: `${formatDateBR(ini <= fim ? ini : fim)} até ${formatDateBR(fim >= ini ? fim : ini)}`,
        };
    }

    return todayRange();
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

function rangeToDates(range: PeriodRange) {
    return {
        start: startOfDay(new Date(`${range.inicio}T00:00:00`)),
        end: endOfDay(new Date(`${range.fim}T00:00:00`)),
    };
}

function rangeTo14(range: PeriodRange) {
    const inicio = range.inicio.replaceAll("-", "") + "000000";
    const fim = range.fim.replaceAll("-", "") + "235959";
    return { inicio, fim };
}

function formatDateBR(iso?: string) {
    if (!iso) return "—";
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${m[1]}`;
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
    return s === "sim" || s === "s" || s === "1" || s === "true";
}

function number(v: any) {
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

function fmtKm(n: number) {
    return `${fmt1(n)} km`;
}

function average(nums: number[]) {
    const arr = nums.filter((n) => Number.isFinite(n));
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function countBy<T>(
    arr: T[],
    getKey: (item: T) => string,
    fallback = "Não informado"
): Array<{ label: string; value: number }> {
    const map = new Map<string, number>();
    for (const item of arr) {
        const raw = getKey(item);
        const key = String(raw || "").trim() || fallback;
        map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
}

function normalizeConvenio(v: any) {
    const s = norm(v);
    if (!s) return "Não informado";
    if (s.includes("pref")) return "Prefeitura";
    if (s.includes("part")) return "Particular";
    if (s.includes("assoc")) return "Associado";
    return String(v).trim();
}

function getAgente(r: Registro) {
    return String(r.agente || r.usuario || r.operador || r.responsavel || "Não informado").trim();
}

function getStatus(r: Registro) {
    const s = norm(r.status_novo || r.status);

    if (s.includes("fase01") || s.includes("remov")) return "remoção";
    if (s.includes("fase02") || s.includes("clinica") || s.includes("clínica")) return "clínica";
    if (s.includes("fase03") || s.includes("conserv")) return "conservação";
    if (s.includes("fase04")) return "fim conservação";
    if (s.includes("fase05") || s.includes("ornament")) return "ornamentação";
    if (s.includes("fase06") || s.includes("corpo pronto")) return "corpo pronto";
    if (s.includes("fase07") || s.includes("velorio") || s.includes("velório")) return "velório";
    if (s.includes("fase08") || s.includes("velando")) return "velando";
    if (s.includes("fase09") || s.includes("sepultando")) return "sepultamento";
    if (s.includes("fase10") || s.includes("concluido") || s.includes("concluído")) return "concluído";
    if (s.includes("fase11") || s.includes("material recolhido")) return "material recolhido";

    return "atendimento";
}

function getTanatoAgente(r: Registro) {
    const anyR = r as any;
    return String(
        anyR.agente_tanato ||
        anyR.tanatopraxista ||
        anyR.usuario_tanato ||
        anyR.agente_conservacao ||
        anyR.responsavel_tanato ||
        anyR.agente ||
        "Não informado"
    ).trim();
}

function hasMaterial(r: Registro) {
    if (r.materiais_json) {
        try {
            const obj = typeof r.materiais_json === "string" ? JSON.parse(r.materiais_json) : r.materiais_json;
            if (obj && typeof obj === "object") {
                return Object.values(obj).some((v: any) => {
                    const qtd = number(v?.qtd);
                    return qtd > 0 || v?.checked === true || v?.checked === "true" || v?.checked === "1";
                });
            }
        } catch {
            // segue fallback
        }
    }

    return Object.keys(r).some((k) => /^materiais_.+_qtd$/i.test(k) && number((r as any)[k]) > 0);
}

function getOrnamentacaoTipo(r: Registro) {
    const txt = norm(`${r.ornamentacao_tipo || ""} ${r.ornamentacao || ""}`);
    if (!txt) return "Não informado";
    if (txt.includes("natural")) return "Natural";
    if (txt.includes("artificial")) return "Artificial";
    if (txt.includes("flores")) return "Flores";
    return r.ornamentacao_tipo || r.ornamentacao || "Não informado";
}

function getVehicleLabel(v: VeiculoRow) {
    return String(v.descricao_veiculo || v.veiculo || v.placa || "Veículo").trim();
}

function getVehicleKm(v: VeiculoRow) {
    return number(v.distancia_percorrida_km ?? v.distancia_km);
}

function getMotoristaLabel(m: MotoristaRow) {
    return String(m.motorista || "Não informado").trim();
}

/* ============================================================
   UI COMPONENTS
   ============================================================ */

function LoadingBar({ show }: { show: boolean }) {
    if (!show) return null;
    return (
        <div className="fixed left-0 top-0 z-[80] h-1 w-full overflow-hidden bg-blue-100">
            <div className="h-full w-1/3 animate-[loading_1s_ease-in-out_infinite] bg-blue-600" />
            <style jsx>{`
                @keyframes loading {
                    0% {
                        transform: translateX(-100%);
                    }
                    100% {
                        transform: translateX(400%);
                    }
                }
            `}</style>
        </div>
    );
}

function Card({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
            {children}
        </div>
    );
}

function SectionTitle({
    title,
    subtitle,
}: {
    title: string;
    subtitle?: string;
}) {
    return (
        <div className="mb-3">
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 sm:text-lg">
                {title}
            </h2>
            {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
    );
}

function KpiCard({
    label,
    value,
    sub,
    icon,
}: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    icon: React.ReactNode;
}) {
    return (
        <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {label}
                    </div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
                    {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
                </div>
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-2xl text-blue-600">
                    {icon}
                </div>
            </div>
        </Card>
    );
}

function MiniStatusCard({
    icon,
    title,
    qtd,
    media,
}: {
    icon: React.ReactNode;
    title: string;
    qtd: number;
    media?: string;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            <div className="mx-auto grid h-12 w-12 place-items-center text-4xl text-blue-500">
                {icon}
            </div>
            <div className="mt-2 text-lg font-black text-slate-900">{fmt0(qtd)}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {title}
            </div>
            {media ? <div className="mt-1 text-xs text-slate-500">Média: {media}</div> : null}
        </div>
    );
}

const CHART_COLORS = [
    "#0f6b8f",
    "#fbbf24",
    "#167a2f",
    "#4f8fd8",
    "#7c3aed",
    "#ef4444",
    "#14b8a6",
    "#f97316",
];

function DonutChart({
    title,
    data,
    emptyLabel = "Sem dados",
}: {
    title: string;
    data: Array<{ label: string; value: number }>;
    emptyLabel?: string;
}) {
    const total = data.reduce((s, x) => s + x.value, 0);
    let acc = 0;

    const gradient =
        total <= 0
            ? "#e5e7eb"
            : data
                .map((d, i) => {
                    const start = (acc / total) * 100;
                    acc += d.value;
                    const end = (acc / total) * 100;
                    return `${CHART_COLORS[i % CHART_COLORS.length]} ${start}% ${end}%`;
                })
                .join(", ");

    return (
        <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-slate-100 via-white to-slate-200 p-4">
                <h3 className="text-center text-xl font-black uppercase tracking-tight text-slate-800">
                    {title}
                </h3>

                <div className="mt-4 grid items-center gap-4 sm:grid-cols-[160px_1fr]">
                    <div className="relative mx-auto h-40 w-40">
                        <div
                            className="h-40 w-40 rounded-full shadow-inner"
                            style={{
                                background: total > 0 ? `conic-gradient(${gradient})` : "#e5e7eb",
                            }}
                        />
                        <div className="absolute inset-8 grid place-items-center rounded-full bg-white shadow">
                            <div className="text-center">
                                <div className="text-2xl font-black text-slate-900">
                                    {fmt0(total)}
                                </div>
                                <div className="text-[10px] uppercase text-slate-500">total</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {total <= 0 ? (
                            <div className="rounded-xl border bg-white/70 p-3 text-sm text-slate-500">
                                {emptyLabel}
                            </div>
                        ) : (
                            data.slice(0, 8).map((d, i) => (
                                <div key={d.label} className="flex items-center gap-2 text-sm">
                                    <span
                                        className="h-3 w-3 rounded-sm"
                                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                                    />
                                    <span className="min-w-0 flex-1 truncate text-slate-700">
                                        {d.label}
                                    </span>
                                    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-white">
                                        {fmt0(d.value)}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}

function BarChart({
    title,
    subtitle,
    data,
    valueSuffix = "",
}: {
    title: string;
    subtitle?: string;
    data: Array<{ label: string; value: number }>;
    valueSuffix?: string;
}) {
    const max = Math.max(1, ...data.map((d) => d.value));

    return (
        <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-slate-100 via-white to-slate-200 p-4">
                <h3 className="text-center text-sm font-black uppercase tracking-tight text-slate-700">
                    {title}
                </h3>
                {subtitle ? <p className="text-center text-[11px] text-slate-500">{subtitle}</p> : null}

                <div className="mt-5 flex h-44 items-end gap-3 border-b border-slate-500 px-2">
                    {data.length === 0 ? (
                        <div className="grid h-full flex-1 place-items-center text-sm text-slate-500">
                            Sem dados
                        </div>
                    ) : (
                        data.slice(0, 6).map((d, i) => {
                            const h = Math.max(8, (d.value / max) * 130);
                            return (
                                <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center">
                                    <div
                                        className="mb-1 grid w-full max-w-[64px] place-items-center rounded-t bg-sky-700 text-xs font-black text-white shadow"
                                        style={{ height: h }}
                                    >
                                        {fmt1(d.value)}
                                        {valueSuffix}
                                    </div>
                                    <div className="mt-2 max-w-[80px] truncate text-center text-xs font-semibold text-slate-700">
                                        {d.label}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </Card>
    );
}

function HorizontalBarChart({
    title,
    data,
    valueSuffix = "",
}: {
    title: string;
    data: Array<{ label: string; value: number }>;
    valueSuffix?: string;
}) {
    const max = Math.max(1, ...data.map((d) => d.value));

    return (
        <Card className="p-4">
            <SectionTitle title={title} />
            <div className="space-y-3">
                {data.length === 0 ? (
                    <div className="rounded-xl border bg-slate-50 p-4 text-center text-sm text-slate-500">
                        Sem dados para o período.
                    </div>
                ) : (
                    data.slice(0, 8).map((d, i) => (
                        <div key={d.label}>
                            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                                <span className="truncate font-semibold text-slate-700">{d.label}</span>
                                <span className="font-black text-slate-900">
                                    {fmt1(d.value)}
                                    {valueSuffix}
                                </span>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${Math.max(4, (d.value / max) * 100)}%`,
                                        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                                    }}
                                />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Card>
    );
}

function PeriodModal({
    open,
    value,
    onClose,
    onApply,
}: {
    open: boolean;
    value: PeriodRange;
    onClose: () => void;
    onApply: (range: PeriodRange) => void;
}) {
    const [preset, setPreset] = useState<PeriodPreset>(value.preset);
    const [inicio, setInicio] = useState(value.inicio);
    const [fim, setFim] = useState(value.fim);

    useEffect(() => {
        if (!open) return;
        setPreset(value.preset);
        setInicio(value.inicio);
        setFim(value.fim);
    }, [open, value]);

    if (!open) return null;

    const presets: Array<{ key: PeriodPreset; label: string; desc: string }> = [
        { key: "hoje", label: "Hoje", desc: "00:00 até agora" },
        { key: "ontem", label: "Ontem", desc: "Dia anterior" },
        { key: "7d", label: "Semana", desc: "Últimos 7 dias" },
        { key: "mes_atual", label: "Mês atual", desc: "Do dia 1 até hoje" },
        { key: "30d", label: "30 dias", desc: "Últimos 30 dias" },
        { key: "custom", label: "Personalizado", desc: "Escolher datas" },
    ];

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="border-b p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-black text-slate-900">Filtrar período</h2>
                            <p className="text-sm text-slate-500">
                                Todos os indicadores serão recalculados com base nas datas selecionadas.
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                        >
                            Fechar
                        </button>
                    </div>
                </div>

                <div className="max-h-[75vh] overflow-auto p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {presets.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => {
                                    setPreset(p.key);
                                    const next = makeRange(p.key, inicio, fim);
                                    if (p.key !== "custom") {
                                        setInicio(next.inicio);
                                        setFim(next.fim);
                                    }
                                }}
                                className={`rounded-2xl border p-4 text-left transition ${preset === p.key
                                        ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                                        : "hover:bg-slate-50"
                                    }`}
                            >
                                <div className="font-black text-slate-900">{p.label}</div>
                                <div className="mt-1 text-xs text-slate-500">{p.desc}</div>
                            </button>
                        ))}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="text-xs font-bold uppercase text-slate-500">
                                Data inicial
                            </span>
                            <input
                                type="date"
                                value={inicio}
                                onChange={(e) => {
                                    setInicio(e.target.value);
                                    setPreset("custom");
                                }}
                                className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:border-blue-600"
                            />
                        </label>

                        <label className="block">
                            <span className="text-xs font-bold uppercase text-slate-500">
                                Data final
                            </span>
                            <input
                                type="date"
                                value={fim}
                                onChange={(e) => {
                                    setFim(e.target.value);
                                    setPreset("custom");
                                }}
                                className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:border-blue-600"
                            />
                        </label>
                    </div>
                </div>

                <div className="flex flex-col gap-2 border-t bg-slate-50 p-5 sm:flex-row sm:justify-end">
                    <button
                        onClick={onClose}
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:bg-slate-100"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            const next = makeRange(preset, inicio, fim);
                            onApply(next);
                            onClose();
                        }}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                    >
                        Aplicar filtro
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function Page() {
    const [periodo, setPeriodo] = useState<PeriodRange>(() => makeRange("7d"));
    const [periodOpen, setPeriodOpen] = useState(false);

    const [registros, setRegistros] = useState<Registro[]>([]);
    const [motoristas, setMotoristas] = useState<MotoristaRow[]>([]);
    const [veiculos, setVeiculos] = useState<VeiculoRow[]>([]);

    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro(null);

        try {
            const { inicio, fim } = rangeTo14(periodo);

            const infoUrl = `${ENDPOINTS.informativo}&_ts=${Date.now()}`;
            const motoristasUrl =
                `${ENDPOINTS.telemetria}?itrack=motoristas` +
                `&inicio=${encodeURIComponent(inicio)}` +
                `&fim=${encodeURIComponent(fim)}` +
                `&_ts=${Date.now()}`;

            const veiculosUrl =
                `${ENDPOINTS.telemetria}?itrack=historico_veicular` +
                `&inicio=${encodeURIComponent(inicio)}` +
                `&fim=${encodeURIComponent(fim)}` +
                `&_ts=${Date.now()}`;

            const [infoJson, motJson, veiJson] = await Promise.all([
                fetchJson<ApiListResponse<Registro>>(infoUrl, {
                    ttlMs: 8_000,
                    cacheKey: `info-${periodo.inicio}-${periodo.fim}`,
                }),
                fetchJson<ApiListResponse<MotoristaRow>>(motoristasUrl, {
                    ttlMs: 20_000,
                    cacheKey: `mot-${periodo.inicio}-${periodo.fim}`,
                }),
                fetchJson<ApiListResponse<VeiculoRow>>(veiculosUrl, {
                    ttlMs: 20_000,
                    cacheKey: `vei-${periodo.inicio}-${periodo.fim}`,
                }),
            ]);

            const infoArr = Array.isArray(infoJson) ? infoJson : infoJson?.dados || [];
            const motArr = Array.isArray(motJson) ? motJson : motJson?.dados || [];
            const veiArr = Array.isArray(veiJson) ? veiJson : veiJson?.dados || [];

            setRegistros(infoArr);
            setMotoristas(motArr);
            setVeiculos(veiArr);
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

    const metricas = useMemo(() => {
        const total = dadosPeriodo.length;

        const assistenciaSim = dadosPeriodo.filter((r) => isSim(r.assistencia)).length;
        const tanatoSim = dadosPeriodo.filter((r) => isSim(r.tanato)).length;
        const involSim = dadosPeriodo.filter((r) => isSim(r.invol)).length;
        const comMaterial = dadosPeriodo.filter(hasMaterial).length;

        const ornamentacao = dadosPeriodo.filter((r) => {
            const txt = norm(`${r.ornamentacao || ""} ${r.ornamentacao_tipo || ""}`);
            return txt && txt !== "nao" && txt !== "não";
        }).length;

        const velorio = dadosPeriodo.filter((r) => r.local_velorio || r.data_inicio_velorio).length;
        const sepultamento = dadosPeriodo.filter((r) => {
            const s = getStatus(r);
            return s === "sepultamento" || s === "concluído" || !!r.local_sepultamento;
        }).length;

        const convenios = countBy(dadosPeriodo, (r) => normalizeConvenio(r.convenio));
        const status = countBy(dadosPeriodo, (r) => getStatus(r));
        const porAgente = countBy(dadosPeriodo, (r) => getAgente(r));

        const tanatoPorAgente = countBy(
            dadosPeriodo.filter((r) => isSim(r.tanato)),
            (r) => getTanatoAgente(r)
        );

        const ornamentacaoTipos = countBy(
            dadosPeriodo.filter((r) => {
                const t = getOrnamentacaoTipo(r);
                return norm(t) !== "nao informado";
            }),
            (r) => getOrnamentacaoTipo(r)
        );

        return {
            total,
            assistenciaSim,
            tanatoSim,
            involSim,
            comMaterial,
            ornamentacao,
            velorio,
            sepultamento,
            convenios,
            status,
            porAgente,
            tanatoPorAgente,
            ornamentacaoTipos,
        };
    }, [dadosPeriodo]);

    const telemetria = useMemo(() => {
        const kmPorVeiculo = (veiculos || [])
            .map((v) => ({
                label: getVehicleLabel(v),
                value: getVehicleKm(v),
            }))
            .filter((x) => x.value > 0)
            .sort((a, b) => b.value - a.value);

        const totalKm = kmPorVeiculo.reduce((s, x) => s + x.value, 0);

        const kmPorMotorista = (motoristas || [])
            .map((m) => ({
                label: getMotoristaLabel(m),
                value: number(m.total_posicoes),
                velocidadeMedia: number(m.velocidade_media),
                velocidadeMaxima: number(m.velocidade_maxima),
                placas: String(m.placas || ""),
            }))
            .sort((a, b) => b.value - a.value);

        const velocidadeMediaGeral = average(
            motoristas.map((m) => number(m.velocidade_media)).filter((n) => n > 0)
        );

        const velocidadeMaximaGeral = Math.max(
            0,
            ...motoristas.map((m) => number(m.velocidade_maxima))
        );

        return {
            kmPorVeiculo,
            totalKm,
            kmPorMotorista,
            velocidadeMediaGeral,
            velocidadeMaximaGeral,
        };
    }, [motoristas, veiculos]);

    const cardsStatus = [
        {
            icon: "✚",
            title: "Assistência",
            qtd: metricas.assistenciaSim,
        },
        {
            icon: "💉",
            title: "Tanato",
            qtd: metricas.tanatoSim,
        },
        {
            icon: "✿",
            title: "Ornamentação",
            qtd: metricas.ornamentacao,
        },
        {
            icon: "⚰️",
            title: "Invol",
            qtd: metricas.involSim,
        },
        {
            icon: "🚗",
            title: "Velório",
            qtd: metricas.velorio,
        },
        {
            icon: "🔁",
            title: "Material",
            qtd: metricas.comMaterial,
        },
    ];

    return (
        <main className="min-h-screen bg-slate-50 p-3 sm:p-5">
            <LoadingBar show={loading} />

            <div className="mx-auto w-full max-w-7xl">
                {/* HEADER */}
                <div className="mb-4 flex flex-col gap-3 rounded-3xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                            Análise de Desempenho
                        </h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Indicadores gerais por período, atendimentos, tanatopraxia e telemetria.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                            type="button"
                            onClick={() => setPeriodOpen(true)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-100"
                        >
                            <span>📅</span>
                            <span>{periodo.label}</span>
                        </button>

                        <button
                            type="button"
                            onClick={carregar}
                            disabled={loading}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                            <span>↻</span>
                            <span>Atualizar</span>
                        </button>
                    </div>
                </div>

                {erro ? (
                    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                        {erro}
                    </div>
                ) : null}

                {/* RESUMO SUPERIOR NO ESTILO DA IMAGEM */}
                <Card className="mb-4 p-4">
                    <div className="grid gap-4 lg:grid-cols-[190px_1fr]">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-sm font-black uppercase text-slate-900">Período</div>
                            <div className="mt-3 text-xs text-slate-500">
                                {formatDateBR(periodo.inicio)} até {formatDateBR(periodo.fim)}
                            </div>

                            <div className="mt-5 grid grid-cols-[1fr_auto] gap-y-3 text-sm">
                                <div className="font-semibold uppercase text-slate-600">
                                    Qntd. de atendimentos
                                </div>
                                <div className="font-black text-slate-900">{fmt0(metricas.total)}</div>

                                <div className="font-semibold uppercase text-slate-600">
                                    Km total
                                </div>
                                <div className="font-black text-slate-900">{fmtKm(telemetria.totalKm)}</div>

                                <div className="font-semibold uppercase text-slate-600">
                                    Vel. média
                                </div>
                                <div className="font-black text-slate-900">
                                    {fmt1(telemetria.velocidadeMediaGeral)} km/h
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                            {cardsStatus.map((c) => (
                                <MiniStatusCard key={c.title} icon={c.icon} title={c.title} qtd={c.qtd} />
                            ))}
                        </div>
                    </div>
                </Card>

                {/* KPIS */}
                <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                        label="Atendimentos no período"
                        value={fmt0(metricas.total)}
                        sub="Registros filtrados por data"
                        icon="📋"
                    />
                    <KpiCard
                        label="Tanatopraxias"
                        value={fmt0(metricas.tanatoSim)}
                        sub={`${metricas.total ? fmt1((metricas.tanatoSim / metricas.total) * 100) : "0"}% dos atendimentos`}
                        icon="💉"
                    />
                    <KpiCard
                        label="Quilometragem total"
                        value={fmtKm(telemetria.totalKm)}
                        sub={`${fmt0(telemetria.kmPorVeiculo.length)} veículo(s) com movimentação`}
                        icon="🚗"
                    />
                    <KpiCard
                        label="Velocidade máxima"
                        value={`${fmt1(telemetria.velocidadeMaximaGeral)} km/h`}
                        sub="Com base na telemetria por motorista"
                        icon="📈"
                    />
                </div>

                {/* GRÁFICOS PRINCIPAIS */}
                <div className="mb-4 grid gap-4 lg:grid-cols-2">
                    <DonutChart
                        title="Atendimentos"
                        data={metricas.convenios.slice(0, 6)}
                        emptyLabel="Nenhum atendimento encontrado no período."
                    />

                    <DonutChart
                        title="Tanatopraxia"
                        data={metricas.tanatoPorAgente.slice(0, 6)}
                        emptyLabel="Nenhuma tanatopraxia encontrada no período."
                    />
                </div>

                <div className="mb-4 grid gap-4 lg:grid-cols-2">
                    <BarChart
                        title="Quilometragem por veículo (km)"
                        data={telemetria.kmPorVeiculo.slice(0, 6)}
                    />

                    <BarChart
                        title="Telemetria por colaborador"
                        subtitle="Quantidade de posições registradas no período"
                        data={telemetria.kmPorMotorista.slice(0, 6)}
                    />
                </div>

                {/* LISTAS E RANKINGS */}
                <div className="grid gap-4 lg:grid-cols-3">
                    <HorizontalBarChart
                        title="Atendimentos por colaborador"
                        data={metricas.porAgente}
                    />

                    <HorizontalBarChart
                        title="Status dos atendimentos"
                        data={metricas.status}
                    />

                    <HorizontalBarChart
                        title="Tipos de ornamentação"
                        data={metricas.ornamentacaoTipos}
                    />
                </div>

                {/* TABELAS */}
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <Card className="overflow-hidden">
                        <div className="border-b p-4">
                            <SectionTitle
                                title="Ranking de veículos"
                                subtitle="Distância percorrida no período selecionado"
                            />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Veículo</th>
                                        <th className="px-4 py-3">Placa</th>
                                        <th className="px-4 py-3 text-right">Km</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {veiculos.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                                                Sem dados de veículo no período.
                                            </td>
                                        </tr>
                                    ) : (
                                        veiculos.slice(0, 10).map((v, idx) => (
                                            <tr key={`${v.placa || idx}`} className="border-t">
                                                <td className="px-4 py-3 font-semibold text-slate-800">
                                                    {getVehicleLabel(v)}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">
                                                    {v.placa || "—"}
                                                </td>
                                                <td className="px-4 py-3 text-right font-black text-slate-900">
                                                    {fmtKm(getVehicleKm(v))}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <Card className="overflow-hidden">
                        <div className="border-b p-4">
                            <SectionTitle
                                title="Ranking de motoristas"
                                subtitle="Velocidade média, máxima e placas vinculadas"
                            />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Motorista</th>
                                        <th className="px-4 py-3">Placas</th>
                                        <th className="px-4 py-3 text-right">Vel. média</th>
                                        <th className="px-4 py-3 text-right">Vel. máx.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {motoristas.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                                                Sem dados de motoristas no período.
                                            </td>
                                        </tr>
                                    ) : (
                                        motoristas.slice(0, 10).map((m, idx) => (
                                            <tr key={`${m.motorista || idx}`} className="border-t">
                                                <td className="px-4 py-3 font-semibold text-slate-800">
                                                    {getMotoristaLabel(m)}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">
                                                    {m.placas || "—"}
                                                </td>
                                                <td className="px-4 py-3 text-right font-black text-slate-900">
                                                    {fmt1(number(m.velocidade_media))} km/h
                                                </td>
                                                <td className="px-4 py-3 text-right font-black text-slate-900">
                                                    {fmt1(number(m.velocidade_maxima))} km/h
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>

                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800">
                    <b>Observação:</b> esta página filtra os registros que o endpoint de atendimento retornar.
                    Se o seu <code className="font-bold">informativo.php?listar=1</code> estiver retornando
                    somente atendimentos ainda não recolhidos, a análise histórica de atendimentos também ficará
                    limitada a esses dados. Para histórico completo, o backend precisa liberar a listagem por período
                    incluindo registros já finalizados.
                </div>
            </div>

            <PeriodModal
                open={periodOpen}
                value={periodo}
                onClose={() => setPeriodOpen(false)}
                onApply={setPeriodo}
            />
        </main>
    );
}