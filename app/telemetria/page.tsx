"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API } from "../acompanhamento/components/constants";
import MapRoute from "./MapRoute";

/* ======================= Tipos ======================= */
type Ponto = { lat: number; lng: number; t?: number; v?: number };

type TelemetriaRegistro = {
    id: number;
    sepultamento_id: number | null;
    agente: string | null;
    falecido: string | null;

    inicio_iso?: string | null;
    fim_iso?: string | null;

    velocidade_max?: number | null;
    velocidade_media?: number | null;
    distancia_km?: number | null;
    duracao_s?: number | null;

    paradas?: number | null;
    acel_fortes?: number | null;
    frenagens_fortes?: number | null;

    origem?: string | null;
    observacao?: string | null;

    pontos_json?: string | null;
    eventos_json?: string | null;
    extra_json?: string | null;

    criado_em?: string | null;
    atualizado_em?: string | null;
};

/* ======================= Helpers ======================= */
const isFiniteNum = (v: any): v is number => Number.isFinite(Number(v));

/** agora aceita default number | null | undefined  */
const n = (v: any, d: number | null | undefined = 0): number =>
    isFiniteNum(v) ? Number(v) : (d ?? 0);

function fmtKm(x: any) {
    const val = n(x, 0);
    return `${val.toFixed(2).replace(".", ",")} km`;
}
function fmtKmH(x: any) {
    const val = n(x, 0);
    return `${val.toFixed(1).replace(".", ",")} km/h`;
}
function fmtDur(seg: any) {
    const s = Math.max(0, Math.floor(n(seg, 0)));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(ss)}`;
}
function fmtDataHora(iso?: string | null) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d as any)) return String(iso);
    return d.toLocaleString();
}

function parsePontosJson(pontos_json?: string | null): Ponto[] {
    if (!pontos_json) return [];
    try {
        const arr = JSON.parse(pontos_json);
        if (!Array.isArray(arr)) return [];
        return arr
            .map((p) => ({
                lat: Number(p?.lat),
                lng: Number(p?.lng),
                t: p?.t != null ? Number(p.t) : undefined,
                v: p?.v != null ? Number(p.v) : undefined,
            }))
            .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    } catch {
        return [];
    }
}

/* ======================= UI menores ======================= */
function KPI({
    label,
    value,
    sub,
}: {
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <div className="rounded-xl border p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-semibold">{value}</div>
            {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
    );
}

/** Mini fallback em SVG (quando houver 0 ou 1 ponto) */
function MiniMap({ pontos }: { pontos: Ponto[] }) {
    const [w, h, pad] = [320, 180, 10];
    if (pontos.length === 0) {
        return (
            <div className="flex h-[180px] w-full items-center justify-center rounded-lg border text-xs text-slate-500">
                Sem pontos de rota
            </div>
        );
    }

    const xs = pontos.map((p) => p.lng);
    const ys = pontos.map((p) => p.lat);
    const minX = Math.min(...xs),
        maxX = Math.max(...xs),
        minY = Math.min(...ys),
        maxY = Math.max(...ys);
    const dx = Math.max(1e-9, maxX - minX);
    const dy = Math.max(1e-9, maxY - minY);
    const sx = (w - 2 * pad) / dx;
    const sy = (h - 2 * pad) / dy;
    const s = Math.min(sx, sy);

    const tr = (p: Ponto) => {
        const x = pad + (p.lng - minX) * s;
        const y = h - pad - (p.lat - minY) * s;
        return `${x},${y}`;
    };

    const d = pontos.map(tr).join(" ");

    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-lg border bg-white">
            <polyline
                points={d}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* início */}
            <circle
                cx={pad + (pontos[0].lng - minX) * s}
                cy={h - pad - (pontos[0].lat - minY) * s}
                r={5}
                fill="#10b981"
                stroke="white"
                strokeWidth={1.5}
            />
            {/* fim */}
            <circle
                cx={pad + (pontos[pontos.length - 1].lng - minX) * s}
                cy={h - pad - (pontos[pontos.length - 1].lat - minY) * s}
                r={5}
                fill="#ef4444"
                stroke="white"
                strokeWidth={1.5}
            />
        </svg>
    );
}

/* ======================= Página ======================= */
export default function TelemetriaPage() {
    const [rows, setRows] = useState<TelemetriaRegistro[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        setMsg(null);
        try {
            const r = await fetch(
                `${API}/api/php/telemetria.php?listar=1&_t=${Date.now()}`,
                { credentials: "include", cache: "no-store" }
            );
            const data = (await r.json()) as any;
            if (!Array.isArray(data)) {
                setRows([]);
                setMsg(data?.msg || "Nenhum dado.");
            } else {
                setRows(
                    data.map((d: any) => ({
                        ...d,
                        velocidade_max: n(d.velocidade_max, null),
                        velocidade_media: n(d.velocidade_media, null),
                        distancia_km: n(d.distancia_km, null),
                        duracao_s: n(d.duracao_s, null),
                        paradas: n(d.paradas, null),
                        acel_fortes: n(d.acel_fortes, null),
                        frenagens_fortes: n(d.frenagens_fortes, null),
                    }))
                );
            }
        } catch (e: any) {
            setMsg(e?.message || "Falha ao carregar.");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    const resumo = useMemo(() => {
        const total = rows.length;
        const dist = rows.reduce((a, r) => a + n(r.distancia_km, 0), 0);
        const dur = rows.reduce((a, r) => a + n(r.duracao_s, 0), 0);
        const vmax = rows.reduce((m, r) => Math.max(m, n(r.velocidade_max, 0)), 0);
        const vmed =
            rows.length > 0
                ? rows.reduce((a, r) => a + n(r.velocidade_media, 0), 0) / rows.length
                : 0;

        return { total, dist, dur, vmax, vmed };
    }, [rows]);

    return (
        <div className="p-6">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Relatório de Telemetria</h1>
                    <p className="text-sm text-slate-500">
                        Sessões registradas com rota, velocidades e estatísticas.
                    </p>
                </div>
                <button
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    onClick={fetchRows}
                    disabled={loading}
                >
                    {loading ? "Atualizando..." : "Atualizar"}
                </button>
            </header>

            {/* KPIs gerais */}
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KPI label="Sessões" value={String(resumo.total)} />
                <KPI label="Distância total" value={fmtKm(resumo.dist)} />
                <KPI label="Tempo total" value={fmtDur(resumo.dur)} />
                <KPI
                    label="Velocidade"
                    value={fmtKmH(resumo.vmed)}
                    sub={`V. Máxima: ${fmtKmH(resumo.vmax)}`}
                />
            </div>

            {msg && (
                <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    {msg}
                </div>
            )}

            {/* Lista de sessões */}
            <div className="space-y-6">
                {rows.map((r) => {
                    const pontos = parsePontosJson(r.pontos_json);
                    return (
                        <div
                            key={r.id}
                            className="rounded-2xl border bg-white p-4 shadow-sm"
                        >
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm text-slate-500">
                                        #{r.id} {r.origem ? `• ${r.origem}` : ""}
                                    </div>
                                    <div className="text-lg font-semibold">
                                        {r.falecido || "Falecido(a) — não informado"}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        Agente: <b>{r.agente || "-"}</b>
                                    </div>
                                </div>
                                <div className="text-right text-xs text-slate-500">
                                    <div>Início: {fmtDataHora(r.inicio_iso)}</div>
                                    <div>Fim: {fmtDataHora(r.fim_iso)}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                {/* Mapa */}
                                <div className="lg:col-span-2">
                                    {pontos.length >= 2 ? (
                                        <MapRoute pontos={pontos} />
                                    ) : (
                                        <MiniMap pontos={pontos} />
                                    )}
                                </div>

                                {/* Métricas */}
                                <div className="grid grid-cols-2 gap-3">
                                    <KPI label="Distância" value={fmtKm(r.distancia_km)} />
                                    <KPI label="Duração" value={fmtDur(r.duracao_s)} />
                                    <KPI label="V. Média" value={fmtKmH(r.velocidade_media)} />
                                    <KPI label="V. Máxima" value={fmtKmH(r.velocidade_max)} />
                                    <KPI label="Paradas" value={String(n(r.paradas, 0))} />
                                    <KPI
                                        label="Eventos"
                                        value={`${n(r.acel_fortes, 0)} acel / ${n(
                                            r.frenagens_fortes,
                                            0
                                        )} freios`}
                                    />
                                </div>
                            </div>

                            {r.observacao && (
                                <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                                    <b>Observação:</b> {r.observacao}
                                </div>
                            )}
                        </div>
                    );
                })}

                {rows.length === 0 && !loading && (
                    <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
                        Nenhuma sessão de telemetria encontrada.
                    </div>
                )}
            </div>
        </div>
    );
}
