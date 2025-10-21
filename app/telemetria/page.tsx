"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API } from "../acompanhamento/components/constants";

/* -------------------- utils num/format -------------------- */
function num(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function sum(nums: any[], key: string) {
    return nums.reduce((acc, it) => acc + (num((it as any)[key]) ?? 0), 0);
}
function fmtFixed(v: any, d = 1): string {
    const n = num(v);
    return n === null ? "-" : n.toFixed(d);
}
function fmtDateTime(s?: string | null) {
    if (!s) return "-";
    const d = new Date(s);
    return isNaN(d.getTime()) ? "-" : d.toLocaleString();
}
function secsToHMS(sec: any) {
    const s = num(sec);
    if (s === null) return "-";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${ss}s`;
    return `${ss}s`;
}

/* -------------------- types -------------------- */
type Row = {
    id: number | string;
    sepultamento_id: number | string;
    tipo: "remocao" | "para_velorio" | "para_sepultamento" | string;
    agente?: string | null;
    falecido?: string | null;
    veiculo_nome?: string | null;
    veiculo_obs?: string | null;
    inicio_ts?: string | null;
    inicio_lat?: number | string | null;
    inicio_lng?: number | string | null;
    fim_ts?: string | null;
    fim_lat?: number | string | null;
    fim_lng?: number | string | null;
    distancia_km?: number | string | null;
    duracao_seg?: number | string | null;
    vel_media_kmh?: number | string | null;
    vel_max_kmh?: number | string | null;
    amostras?: number | string | null;
    pontos_json?: string | null;
    source_device?: string | null;
    encerrado?: 0 | 1 | string | null;
    criado_em?: string | null;
    atualizado_em?: string | null;
};

type Ponto = { lat: number; lng: number; t?: number; v?: number };

/* -------------------- MiniMap (SVG, sem libs) -------------------- */
function MiniMap({ pontos, width = 320, height = 200 }: { pontos: Ponto[]; width?: number; height?: number }) {
    // bounds
    const valid = pontos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (valid.length < 2) {
        return (
            <div className="flex h-[200px] w-full items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-500">
                Sem pontos…
            </div>
        );
    }
    const lats = valid.map((p) => p.lat);
    const lngs = valid.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const pad = 12;
    const W = width, H = height;

    const project = (pt: Ponto) => {
        // escala linear simples (não é projeção geográfica perfeita, mas funciona para preview)
        const x = pad + ((pt.lng - minLng) / (maxLng - minLng || 1)) * (W - pad * 2);
        const y = pad + ((maxLat - pt.lat) / (maxLat - minLat || 1)) * (H - pad * 2);
        return [x, y];
    };

    const d = valid.map(project).map(([x, y]) => `${x},${y}`).join(" ");
    const start = project(valid[0]);
    const end = project(valid[valid.length - 1]);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="rounded-lg bg-slate-50">
            {/* grade leve */}
            <g stroke="#e5e7eb">
                {[0.25, 0.5, 0.75].map((r) => (
                    <line key={`h${r}`} x1={0} x2={W} y1={H * r} y2={H * r} />
                ))}
                {[0.25, 0.5, 0.75].map((r) => (
                    <line key={`v${r}`} y1={0} y2={H} x1={W * r} x2={W * r} />
                ))}
            </g>
            {/* rota */}
            <polyline points={d} fill="none" stroke="#0ea5e9" strokeWidth={3} />
            {/* start/end */}
            <circle cx={start[0]} cy={start[1]} r={5} fill="#10b981" />
            <circle cx={end[0]} cy={end[1]} r={5} fill="#ef4444" />
        </svg>
    );
}

/* -------------------- Gauge semicircular -------------------- */
function SpeedGauge({
    maxMark = 120,
    media,
    maxima,
}: {
    maxMark?: number;
    media: number | null;
    maxima: number | null;
}) {
    const W = 220, H = 120; // semicírculo
    const cx = W / 2, cy = H, R = H - 8;
    const angle = (v: number) => Math.PI * (1 + (v / maxMark)); // 180° a 360°
    const needle = (v: number) => {
        const a = angle(Math.max(0, Math.min(maxMark, v)));
        return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    };

    const mediaPt = media != null ? needle(media) : null;
    const maxPt = maxima != null ? needle(maxima) : null;

    // arcos de fundo
    const arc = (ratio: number, color: string) => {
        const a0 = Math.PI, a1 = Math.PI * (1 + ratio);
        const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
        const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
        return <path d={`M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`} stroke={color} strokeWidth={10} fill="none" />;
    };

    return (
        <svg viewBox={`0 0 ${W} ${H + 10}`} width="100%" className="rounded-lg">
            {arc(1.0, "#e5e7eb")}
            <text x={cx} y={H - 10} fontSize="10" textAnchor="middle" fill="#64748b">0</text>
            <text x={8} y={H - 10} fontSize="10" fill="#64748b">km/h</text>
            <text x={W - 12} y={H - 10} fontSize="10" textAnchor="end" fill="#64748b">{maxMark}</text>

            {/* ponteiros */}
            {mediaPt && (
                <line x1={cx} y1={cy} x2={mediaPt[0]} y2={mediaPt[1]} stroke="#0ea5e9" strokeWidth={4} />
            )}
            {maxPt && (
                <line x1={cx} y1={cy} x2={maxPt[0]} y2={maxPt[1]} stroke="#ef4444" strokeWidth={4} />
            )}

            {/* legendas */}
            <rect x={12} y={6} width={12} height={4} rx={2} fill="#0ea5e9" />
            <text x={30} y={10} fontSize="10" fill="#0f172a">Média: {media == null ? "-" : `${media.toFixed(1)} km/h`}</text>
            <rect x={12} y={20} width={12} height={4} rx={2} fill="#ef4444" />
            <text x={30} y={24} fontSize="10" fill="#0f172a">Máxima: {maxima == null ? "-" : `${maxima.toFixed(1)} km/h`}</text>
        </svg>
    );
}

/* -------------------- Page -------------------- */
export default function TelemetriaDashboard() {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    // filtros
    const [fSepId, setFSepId] = useState("");
    const [fTipo, setFTipo] = useState("");

    const fetchList = useCallback(async () => {
        setLoading(true);
        setMsg(null);
        try {
            const qs = new URLSearchParams({ listar: "1" });
            if (fSepId.trim()) qs.set("sepultamento_id", fSepId.trim());
            if (fTipo.trim()) qs.set("tipo", fTipo.trim());
            const r = await fetch(`${API}/api/php/telemetria.php?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
                headers: {
                    Pragma: "no-cache",
                    Expires: "0",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            });
            const j = await r.json();
            if (j?.sucesso) {
                setRows(Array.isArray(j.dados) ? j.dados : []);
            } else {
                setMsg(j?.msg || "Erro ao listar.");
                setRows([]);
            }
        } catch (e: any) {
            setMsg(e?.message || "Falha ao listar.");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [fSepId, fTipo]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    /* -------- KPIs globais -------- */
    const totalKm = useMemo(() => sum(rows as any[], "distancia_km"), [rows]);
    const totalSeg = useMemo(() => sum(rows as any[], "duracao_seg"), [rows]);
    const vmax = useMemo(() => {
        let m = 0;
        rows.forEach((r) => {
            const v = num(r.vel_max_kmh) ?? 0;
            if (v > m) m = v;
        });
        return m;
    }, [rows]);

    /* -------- seed para testes -------- */
    const seedNow = useCallback(async () => {
        setMsg(null);
        try {
            const r = await fetch(`${API}/api/php/telemetria.php`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ acao: "seed" }),
            });
            const j = await r.json();
            if (j?.sucesso) {
                setMsg("Seed inserido.");
                fetchList();
            } else setMsg(j?.msg || "Falha ao inserir seed.");
        } catch (e: any) {
            setMsg(e?.message || "Erro no seed.");
        }
    }, [fetchList]);

    return (
        <div className="p-6">
            {/* header */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Telemetria — Painel</h1>
                    <p className="text-sm text-muted-foreground">
                        Visualização moderna de deslocamentos: mini-mapa, “velocímetro” e métricas.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button className="rounded-md border px-3 py-2 text-sm" onClick={fetchList} disabled={loading}>
                        Atualizar
                    </button>
                    <button
                        className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white"
                        onClick={seedNow}
                        title="Insere dados de teste (remova em produção)"
                    >
                        Inserir dados de teste
                    </button>
                </div>
            </div>

            {/* filtros */}
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                    <label className="mb-1 block text-sm font-medium">Sepultamento ID</label>
                    <input
                        value={fSepId}
                        onChange={(e) => setFSepId(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="ex.: 101"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium">Tipo</label>
                    <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={fTipo}
                        onChange={(e) => setFTipo(e.target.value)}
                    >
                        <option value="">Todos</option>
                        <option value="remocao">Remoção</option>
                        <option value="para_velorio">Para Velório</option>
                        <option value="para_sepultamento">Para Sepultamento</option>
                    </select>
                </div>
                <div className="self-end">
                    <button className="rounded-md border px-3 py-2 text-sm" onClick={fetchList} disabled={loading}>
                        Filtrar
                    </button>
                </div>
                {msg && <div className="self-end text-sm text-red-600">{msg}</div>}
            </div>

            {/* KPIs topo */}
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border p-4">
                    <div className="text-xs text-slate-500">Distância total</div>
                    <div className="mt-1 text-2xl font-semibold">{fmtFixed(totalKm, 2)} km</div>
                </div>
                <div className="rounded-xl border p-4">
                    <div className="text-xs text-slate-500">Tempo total</div>
                    <div className="mt-1 text-2xl font-semibold">
                        {Math.floor(totalSeg / 3600)}h {Math.floor((totalSeg % 3600) / 60)}m
                    </div>
                </div>
                <div className="rounded-xl border p-4">
                    <div className="text-xs text-slate-500">Velocidade máxima (global)</div>
                    <div className="mt-1 text-2xl font-semibold">{fmtFixed(vmax, 1)} km/h</div>
                </div>
            </div>

            {/* cards por trajeto */}
            {rows.length === 0 ? (
                <div className="rounded-xl border p-8 text-center text-slate-500">Nenhum trajeto encontrado.</div>
            ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {rows.map((r) => {
                        let pontos: Ponto[] = [];
                        try {
                            const arr = JSON.parse(String(r.pontos_json || "[]"));
                            if (Array.isArray(arr)) {
                                pontos = arr
                                    .map((p: any) => ({
                                        lat: Number(p.lat ?? p.latitude),
                                        lng: Number(p.lng ?? p.longitude),
                                        t: Number(p.ts ?? p.t),
                                        v: Number(p.v ?? p.speed),
                                    }))
                                    .filter((p: Ponto) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
                            }
                        } catch { }

                        const media = num(r.vel_media_kmh);
                        const maxima = num(r.vel_max_kmh);
                        const dist = num(r.distancia_km);
                        const dur = num(r.duracao_seg);

                        return (
                            <div key={String(r.id)} className="rounded-2xl border p-4 shadow-sm">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium">
                                            #{r.sepultamento_id}
                                        </span>
                                        <span className="text-sm font-medium">
                                            {r.tipo === "remocao"
                                                ? "Remoção"
                                                : r.tipo === "para_velorio"
                                                    ? "Para Velório"
                                                    : r.tipo === "para_sepultamento"
                                                        ? "Para Sepultamento"
                                                        : String(r.tipo || "")}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        ID: {r.id}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {/* mapa */}
                                    <div>
                                        <MiniMap pontos={pontos} />
                                    </div>

                                    {/* velocímetro + métricas */}
                                    <div className="flex flex-col">
                                        <SpeedGauge maxMark={Math.max(80, Math.ceil((maxima ?? 0) / 10) * 10)} media={media} maxima={maxima} />
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                            <div className="rounded-lg bg-slate-50 p-3">
                                                <div className="text-xs text-slate-500">Distância</div>
                                                <div className="font-semibold">{fmtFixed(dist, 2)} km</div>
                                            </div>
                                            <div className="rounded-lg bg-slate-50 p-3">
                                                <div className="text-xs text-slate-500">Duração</div>
                                                <div className="font-semibold">{secsToHMS(dur)}</div>
                                            </div>
                                            <div className="rounded-lg bg-slate-50 p-3">
                                                <div className="text-xs text-slate-500">Amostras</div>
                                                <div className="font-semibold">{num(r.amostras) ?? "-"}</div>
                                            </div>
                                            <div className="rounded-lg bg-slate-50 p-3">
                                                <div className="text-xs text-slate-500">Dispositivo</div>
                                                <div className="truncate font-semibold">{r.source_device || "-"}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <div className="rounded-lg border p-3">
                                        <div className="text-xs text-slate-500">Agente</div>
                                        <div className="font-medium">{r.agente || "-"}</div>
                                    </div>
                                    <div className="rounded-lg border p-3">
                                        <div className="text-xs text-slate-500">Falecido(a)</div>
                                        <div className="font-medium">{r.falecido || "-"}</div>
                                    </div>
                                    <div className="rounded-lg border p-3">
                                        <div className="text-xs text-slate-500">Veículo</div>
                                        <div className="font-medium">{r.veiculo_nome || "-"}</div>
                                        {r.veiculo_obs && <div className="text-xs text-slate-500">{r.veiculo_obs}</div>}
                                    </div>
                                </div>

                                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="rounded-lg border p-3">
                                        <div className="text-xs text-slate-500">Início</div>
                                        <div className="font-medium">{fmtDateTime(r.inicio_ts)}</div>
                                    </div>
                                    <div className="rounded-lg border p-3">
                                        <div className="text-xs text-slate-500">Fim</div>
                                        <div className="font-medium">{fmtDateTime(r.fim_ts)}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
