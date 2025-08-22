"use client";

import dynamic from "next/dynamic";
import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Compass as CompassIcon, Map as MapIcon, Gauge as GaugeIcon, Play, Square, Copy } from "lucide-react";

// Carrega o mapa só no cliente (Leaflet depende de window)
const MapRealtime = dynamic(() => import("@/components/MapRealtime"), { ssr: false });

/**
 * Página estilo "painel de carro" — HUD
 * - Painel com velocímetro em arco, bússola, precisão, distância, média
 * - Mapa com trilha em tempo real e overlay HUD
 * - Botões grandes de Iniciar/Parar com feedback visual
 * - Layout responsivo (grade 2 colunas no desktop, pilha no mobile)
 */
export default function GPSPage() {
    const {
        permission, // "granted" | "denied" | "prompt" | "unsupported" | "unknown"
        isTracking,
        startTracking,
        stopTracking,
        lastPosition,
        path,
        error,
        stats, // { distanceKm, avgKmh, lastKmh, headingDeg }
    } = useGeolocation({ enableHighAccuracy: true, maxAge: 2000, timeout: 15000 });

    const info = useMemo(() => {
        const coords = lastPosition?.coords;
        const fmt = (v: number | undefined, digits = 5) =>
            typeof v === "number" ? v.toFixed(digits) : "—";

        const headingNum: number = stats.headingDeg ?? NaN; // corrige undefined
        const speedNum: number | null = Number.isFinite(stats.lastKmh) ? (stats.lastKmh as number) : null;

        return {
            lat: fmt(coords?.latitude),
            lng: fmt(coords?.longitude),
            acc: typeof coords?.accuracy === "number" ? `${coords.accuracy.toFixed(0)} m` : "—",
            speedNum,
            speed: speedNum !== null ? `${speedNum.toFixed(1)}` : "—",
            headingNum,
            headingFmt: Number.isFinite(headingNum) ? `${headingNum.toFixed(0)}°` : "—",
            total: `${stats.distanceKm.toFixed(3)} km`,
            avg: Number.isFinite(stats.avgKmh) ? `${stats.avgKmh.toFixed(1)} km/h` : "—",
            ts: lastPosition ? new Date(lastPosition.timestamp).toLocaleTimeString() : "—",
        };
    }, [lastPosition, stats]);

    const statusBadge = (() => {
        switch (permission) {
            case "granted":
                return <span className="rounded bg-emerald-200/60 px-2 py-0.5 text-xs text-emerald-900">Permissão concedida</span>;
            case "prompt":
                return <span className="rounded bg-amber-200/70 px-2 py-0.5 text-xs text-amber-900">Permissão pendente</span>;
            case "denied":
                return <span className="rounded bg-rose-200/70 px-2 py-0.5 text-xs text-rose-900">Permissão negada</span>;
            case "unsupported":
                return <span className="rounded bg-slate-200/70 px-2 py-0.5 text-xs text-slate-900">Sem suporte</span>;
            default:
                return <span className="rounded bg-slate-200/70 px-2 py-0.5 text-xs text-slate-900">Verificando…</span>;
        }
    })();

    return (
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
            {/* Fundo com gradiente sutil para clima de HUD */}
            <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800" />

            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">HUD GPS — Painel</h1>
                    <p className="text-sm text-slate-300">
                        Posição, velocidade, direção e trilha em tempo real — com visual de painel automotivo.
                    </p>
                </div>
                <div className="flex items-center gap-2">{statusBadge}</div>
            </header>

            <section className="grid gap-4 md:grid-cols-[1.6fr,1fr]">
                {/* MAPA + HUD OVERLAY */}
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-2xl shadow-black/30">
                    <div className="border-b border-white/10 p-3 text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <MapIcon className="h-4 w-4" /> Mapa com trilha
                    </div>
                    <div className="relative h-[64vh]">
                        <MapRealtime current={lastPosition ?? undefined} path={path} />

                        {/* HUD translúcido no topo do mapa */}
                        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between gap-3 p-3">
                            <HUDTag label="Precisão" value={info.acc} />
                            <HUDTag label="Leitura" value={info.ts} align="right" />
                        </div>
                    </div>
                </div>

                {/* PAINEL LATERAL */}
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 shadow-2xl shadow-black/30">
                    <div className="border-b border-white/10 p-3 text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <GaugeIcon className="h-4 w-4" /> Painel de Controle
                    </div>

                    <div className="p-4 space-y-4">
                        {/* Botões primários */}
                        <div className="flex gap-2">
                            {!isTracking ? (
                                <motion.button
                                    onClick={startTracking}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                    title="Iniciar rastreamento"
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <Play className="h-4 w-4" /> Iniciar
                                </motion.button>
                            ) : (
                                <motion.button
                                    onClick={stopTracking}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-400"
                                    title="Parar rastreamento"
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <Square className="h-4 w-4" /> Parar
                                </motion.button>
                            )}

                            <motion.button
                                onClick={() => navigator.clipboard?.writeText(`${info.lat},${info.lng}`)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-400/30 bg-slate-50/5 px-4 py-3 text-sm font-medium text-slate-200 hover:bg-slate-50/10 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                                title="Copiar coordenadas"
                                whileTap={{ scale: 0.98 }}
                            >
                                <Copy className="h-4 w-4" /> Copiar
                            </motion.button>
                        </div>

                        {permission === "denied" && (
                            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                                O acesso à localização foi <b>negado</b>. Permita o uso de localização para este site no navegador/app.
                            </div>
                        )}

                        {error && (
                            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                                {error}
                            </div>
                        )}

                        {/* Velocímetro + Bússola */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                                    <span>Velocidade</span>
                                    <span>km/h</span>
                                </div>
                                <SpeedGauge value={info.speedNum} max={140} />
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                                    <span>Direção</span>
                                    <span>{info.headingFmt}</span>
                                </div>
                                <Compass headingDeg={info.headingNum} />
                            </div>
                        </div>

                        {/* KPIs */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <KPI label="Latitude" value={info.lat} />
                            <KPI label="Longitude" value={info.lng} />
                            <KPI label="Precisão" value={info.acc} />
                            <KPI label="Média" value={info.avg} />
                            <KPI label="Distância total" value={info.total} />
                            <KPI label="Última leitura" value={info.ts} />
                        </div>

                        <p className="text-xs text-slate-400">
                            Dica: em iOS/Safari, para maior estabilidade, mantenha a tela ativa e use HTTPS.
                        </p>
                    </div>
                </div>
            </section>
        </main>
    );
}

// === Componentes de UI ===
function HUDTag({ label, value, align = "left" }: { label: string; value: string; align?: "left" | "right" }) {
    return (
        <div
            className={
                "pointer-events-auto rounded-xl border border-white/20 bg-black/30 px-3 py-2 backdrop-blur " +
                (align === "right" ? "ml-auto" : "")
            }
        >
            <div className="text-[10px] uppercase tracking-wide text-slate-300">{label}</div>
            <div className="font-mono text-sm text-white">{value}</div>
        </div>
    );
}

function KPI({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-slate-400">{label}</div>
            <div className="font-mono text-slate-100">{value}</div>
        </div>
    );
}

/**
 * Velocímetro em arco (SVG) com animação.
 * value: km/h (null = sem leitura)
 */
function SpeedGauge({ value, max = 140 }: { value: number | null; max?: number }) {
    const clamped = value === null ? null : Math.max(0, Math.min(max, value));
    const pct = clamped === null ? 0 : clamped / max;
    const startAngle = -120; // graus
    const endAngle = 120;
    const angle = startAngle + (endAngle - startAngle) * pct;

    const radius = 64;
    const cx = 80;
    const cy = 80;

    const arcBg = describeArc(cx, cy, radius, startAngle, endAngle);
    const arcVal = describeArc(cx, cy, radius, startAngle, angle);

    return (
        <div className="flex flex-col items-center">
            <svg width={160} height={120} className="block">
                {/* trilha */}
                <path d={arcBg} stroke="rgba(255,255,255,0.15)" strokeWidth={10} fill="none" strokeLinecap="round" />
                {/* valor */}
                <motion.path
                    d={arcVal}
                    stroke="white"
                    strokeOpacity={0.85}
                    strokeWidth={10}
                    fill="none"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: pct }}
                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
                {/* marcas principais */}
                {Array.from({ length: 7 }).map((_, i) => {
                    const t = i / 6; // 0..1
                    const a = startAngle + (endAngle - startAngle) * t;
                    const [x1, y1] = polar(cx, cy, radius - 6, a);
                    const [x2, y2] = polar(cx, cy, radius + 4, a);
                    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.3)" strokeWidth={2} />;
                })}
            </svg>

            <div className="-mt-2 flex items-baseline gap-2">
                <div className="font-mono text-5xl tabular-nums text-white">
                    {clamped === null ? "—" : clamped.toFixed(1)}
                </div>
                <div className="text-slate-300">km/h</div>
            </div>
        </div>
    );
}

/**
 * Bússola simples com ponteiro animado.
 */
function Compass({ headingDeg }: { headingDeg: number }) {
    const deg = Number.isFinite(headingDeg) ? headingDeg : 0;
    return (
        <div className="flex flex-col items-center">
            <div className="relative h-36 w-36">
                <div className="absolute inset-0 rounded-full border border-white/15 bg-black/20" />
                {/* Rosa dos ventos */}
                {[
                    { l: "N", a: 0 },
                    { l: "E", a: 90 },
                    { l: "S", a: 180 },
                    { l: "W", a: 270 },
                ].map((p) => (
                    <CompassMark key={p.l} label={p.l} angle={p.a} />
                ))}
                {/* Ponteiro */}
                <motion.div
                    className="absolute left-1/2 top-1/2 h-1/2 w-[2px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-white"
                    animate={{ rotate: deg }}
                    transition={{ type: "spring", stiffness: 60, damping: 12 }}
                    style={{ transformOrigin: "bottom center" }}
                />
            </div>
            <div className="mt-2 font-mono text-xl text-white">{Number.isFinite(headingDeg) ? `${Math.round(headingDeg)}°` : "—"}</div>
        </div>
    );
}

function CompassMark({ label, angle }: { label: string; angle: number }) {
    const [x, y] = polar(72, 72, 64, angle); // posição do texto
    return (
        <div
            className="absolute -translate-x-1/2 -translate-y-1/2 text-xs font-semibold text-slate-200"
            style={{ left: x, top: y }}
        >
            {label}
        </div>
    );
}

// === Utilitários geométricos (SVG) ===
function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
    const a = (angleDeg - 90) * (Math.PI / 180);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
    const start = polar(cx, cy, r, endAngle);
    const end = polar(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
    return [
        "M",
        start[0],
        start[1],
        "A",
        r,
        r,
        0,
        largeArc,
        0,
        end[0],
        end[1],
    ].join(" ");
}
