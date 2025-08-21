"use client";

import dynamic from "next/dynamic";
import React, { useMemo } from "react";
import { useGeolocation } from "@/hooks/useGeolocation";

// carrega o mapa só no cliente (Leaflet depende de window)
const MapRealtime = dynamic(() => import("@/components/MapRealtime"), { ssr: false });

export default function GPSPage() {
    const {
        permission,            // "granted" | "denied" | "prompt" | "unsupported" | "unknown"
        isTracking,            // boolean
        startTracking,         // () => void
        stopTracking,          // () => void
        lastPosition,          // GeolocationPosition | null
        path,                  // GeolocationPosition[]
        error,                 // string | null
        stats                  // { distanceKm, avgKmh, lastKmh, headingDeg }
    } = useGeolocation({ enableHighAccuracy: true, maxAge: 2000, timeout: 15000 });

    const info = useMemo(() => {
        const coords = lastPosition?.coords;
        const fmt = (v: number | undefined, digits = 5) =>
            typeof v === "number" ? v.toFixed(digits) : "—";

        // 🔧 Corrige o erro: garante que é number (NaN quando null)
        const headingNum: number = stats.headingDeg ?? NaN;

        return {
            lat: fmt(coords?.latitude),
            lng: fmt(coords?.longitude),
            acc: typeof coords?.accuracy === "number" ? `${coords.accuracy.toFixed(0)} m` : "—",
            speed: Number.isFinite(stats.lastKmh) ? `${stats.lastKmh.toFixed(1)} km/h` : "—",
            heading: Number.isFinite(headingNum) ? `${headingNum.toFixed(0)}°` : "—",
            total: `${stats.distanceKm.toFixed(3)} km`,
            avg: Number.isFinite(stats.avgKmh) ? `${stats.avgKmh.toFixed(1)} km/h` : "—",
            ts: lastPosition ? new Date(lastPosition.timestamp).toLocaleTimeString() : "—",
        };
    }, [lastPosition, stats]);

    const statusBadge = (() => {
        switch (permission) {
            case "granted": return <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">Permissão concedida</span>;
            case "prompt": return <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Permissão pendente</span>;
            case "denied": return <span className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Permissão negada</span>;
            case "unsupported": return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">Sem suporte</span>;
            default: return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">Verificando…</span>;
        }
    })();

    return (
        <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">GPS em tempo real</h1>
                    <p className="text-sm text-muted-foreground">
                        Mostra sua posição atual, precisão, velocidade, direção e a trilha percorrida.
                    </p>
                </div>
                <div className="flex items-center gap-2">{statusBadge}</div>
            </header>

            <section className="grid gap-4 md:grid-cols-[2fr,1fr]">
                <div className="rounded-2xl border bg-card/60 shadow-sm backdrop-blur">
                    <div className="border-b p-3 text-sm font-semibold">Mapa</div>
                    <div className="h-[65vh]">
                        <MapRealtime current={lastPosition ?? undefined} path={path} />
                    </div>
                </div>

                <div className="rounded-2xl border bg-card/60 shadow-sm backdrop-blur">
                    <div className="border-b p-3 text-sm font-semibold">Painel</div>

                    <div className="p-4 space-y-4">
                        <div className="flex gap-2">
                            {!isTracking ? (
                                <button
                                    onClick={startTracking}
                                    className="inline-flex items-center justify-center rounded-md border border-green-600 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                                    disabled={permission === "denied" || permission === "unsupported"}
                                    title="Iniciar rastreamento"
                                >
                                    ▶ Iniciar rastreamento
                                </button>
                            ) : (
                                <button
                                    onClick={stopTracking}
                                    className="inline-flex items-center justify-center rounded-md border border-rose-600 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                                    title="Parar rastreamento"
                                >
                                    ■ Parar
                                </button>
                            )}
                            <button
                                onClick={() => navigator.clipboard?.writeText(`${info.lat},${info.lng}`)}
                                className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
                                title="Copiar coordenadas para a área de transferência"
                            >
                                Copiar coordenadas
                            </button>
                        </div>

                        {permission === "denied" && (
                            <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
                                O acesso à localização foi <b>negado</b>. Vá nas configurações do navegador/app e permita o uso da localização para este site.
                            </div>
                        )}

                        {error && (
                            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                                {error}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">Latitude</div>
                                <div className="font-mono">{info.lat}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">Longitude</div>
                                <div className="font-mono">{info.lng}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">Precisão</div>
                                <div className="font-mono">{info.acc}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">Velocidade</div>
                                <div className="font-mono">{info.speed}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">Direção</div>
                                <div className="font-mono">{info.heading}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">Última leitura</div>
                                <div className="font-mono">{info.ts}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">Distância total</div>
                                <div className="font-mono">{info.total}</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-xs text-muted-foreground">Média</div>
                                <div className="font-mono">{info.avg}</div>
                            </div>
                        </div>

                        <div className="text-xs text-muted-foreground">
                            Dica: em iOS/Safari, para maior estabilidade, mantenha a tela ativa e o site em HTTPS.
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
