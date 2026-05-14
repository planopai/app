"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

declare global {
    interface Window {
        L?: any;
    }
}

type Ponto = {
    lat: number;
    lng: number;
    t?: number;
    v?: number;
    label?: string;
    localizacao?: string;
};

type MapRouteProps = {
    pontos: Ponto[];
    height?: number;
    className?: string;
    smoothRoute?: boolean;
    showSummary?: boolean;
};

/** Suaviza a rota com média móvel para reduzir serrilhado sem endireitar demais. */
function smooth(points: Ponto[], windowSize = 2): Ponto[] {
    if (points.length <= 2) return points;

    const out: Ponto[] = [];

    for (let i = 0; i < points.length; i++) {
        const a = Math.max(0, i - windowSize);
        const b = Math.min(points.length - 1, i + windowSize);
        let slat = 0;
        let slng = 0;
        let count = 0;

        for (let k = a; k <= b; k++) {
            slat += points[k].lat;
            slng += points[k].lng;
            count++;
        }

        out.push({
            ...points[i],
            lat: slat / count,
            lng: slng / count,
        });
    }

    return out;
}

function loadLeafletFromCDN(): Promise<any> {
    return new Promise((resolve, reject) => {
        if (typeof window !== "undefined" && window.L) {
            resolve(window.L);
            return;
        }

        if (!document.getElementById("leaflet-css")) {
            const link = document.createElement("link");
            link.id = "leaflet-css";
            link.rel = "stylesheet";
            link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
            document.head.appendChild(link);
        }

        const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;

        if (existing) {
            existing.addEventListener("load", () => {
                if (window.L) resolve(window.L);
                else reject(new Error("Leaflet não disponível após carregar o script."));
            });
            existing.addEventListener("error", () => reject(new Error("Falha ao carregar Leaflet.")));
            return;
        }

        const script = document.createElement("script");
        script.id = "leaflet-js";
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.async = true;
        script.onload = () => {
            if (window.L) resolve(window.L);
            else reject(new Error("Leaflet não disponível após carregar o script."));
        };
        script.onerror = () => reject(new Error("Falha ao carregar Leaflet via CDN."));
        document.body.appendChild(script);
    });
}

function fmtKmH(v?: number) {
    if (!Number.isFinite(Number(v))) return "-";
    return `${Number(v).toFixed(1).replace(".", ",")} km/h`;
}

function fmtTimestamp(t?: number) {
    if (!t) return "-";

    const ms = t > 1000000000000 ? t : t * 1000;
    const d = new Date(ms);

    if (Number.isNaN(d.getTime())) return "-";

    return d.toLocaleString("pt-BR");
}

function havKm(a: Ponto, b: Ponto) {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;

    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function routeDistanceKm(points: Ponto[]) {
    let total = 0;

    for (let i = 1; i < points.length; i++) {
        total += havKm(points[i - 1], points[i]);
    }

    return total;
}

function pointPopup(p: Ponto, title: string) {
    const parts = [
        `<strong>${escapeHtml(title)}</strong>`,
        p.label ? escapeHtml(String(p.label)) : "",
        p.localizacao ? escapeHtml(String(p.localizacao)) : "",
        `Lat/Lng: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`,
        p.v != null ? `Velocidade: ${escapeHtml(fmtKmH(p.v))}` : "",
        p.t ? `Horário: ${escapeHtml(fmtTimestamp(p.t))}` : "",
    ].filter(Boolean);

    return parts.join("<br/>");
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export default function MapRoute({
    pontos,
    height = 260,
    className = "",
    smoothRoute = true,
    showSummary = true,
}: MapRouteProps) {
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<any>(null);
    const layersRef = useRef<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const valid = useMemo(() => {
        return (pontos ?? [])
            .map((p) => ({
                ...p,
                lat: Number(p.lat),
                lng: Number(p.lng),
                t: p.t != null ? Number(p.t) : undefined,
                v: p.v != null ? Number(p.v) : undefined,
            }))
            .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    }, [pontos]);

    const routePoints = useMemo(() => {
        return smoothRoute ? smooth(valid, 2) : valid;
    }, [valid, smoothRoute]);

    const summary = useMemo(() => {
        const velocities = valid
            .map((p) => Number(p.v))
            .filter((v) => Number.isFinite(v) && v >= 0);

        const vmax = velocities.length ? Math.max(...velocities) : null;
        const distanceKm = valid.length >= 2 ? routeDistanceKm(valid) : 0;

        return {
            total: valid.length,
            vmax,
            distanceKm,
            start: valid[0],
            end: valid[valid.length - 1],
        };
    }, [valid]);

    useEffect(() => {
        let canceled = false;

        async function run() {
            if (!mapDivRef.current) return;

            if (valid.length === 0) {
                setError("Sem pontos para exibir no mapa.");
                if (mapRef.current) {
                    mapRef.current.remove?.();
                    mapRef.current = null;
                }
                return;
            }

            try {
                const L = await loadLeafletFromCDN();

                if (canceled || !mapDivRef.current) return;

                if (mapRef.current) {
                    layersRef.current.forEach((layer) => {
                        try {
                            mapRef.current.removeLayer(layer);
                        } catch {
                            // ignora
                        }
                    });
                    layersRef.current = [];
                } else {
                    const first = valid[0];
                    mapRef.current = L.map(mapDivRef.current, {
                        zoomControl: true,
                        attributionControl: true,
                    }).setView([first.lat, first.lng], 14);

                    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                        maxZoom: 19,
                        attribution: "&copy; OpenStreetMap",
                    }).addTo(mapRef.current);
                }

                const map = mapRef.current;
                const latlngs = routePoints.map((p) => [p.lat, p.lng]) as [number, number][];

                if (latlngs.length >= 2) {
                    const line = L.polyline(latlngs, {
                        color: "#0ea5e9",
                        weight: 4,
                        opacity: 0.9,
                    }).addTo(map);
                    layersRef.current.push(line);

                    map.fitBounds(line.getBounds(), { padding: [24, 24] });
                } else {
                    map.setView(latlngs[0], 15);
                }

                const start = valid[0];
                const end = valid[valid.length - 1];

                const startMarker = L.circleMarker([start.lat, start.lng], {
                    radius: 7,
                    color: "#16a34a",
                    fillColor: "#16a34a",
                    fillOpacity: 1,
                    weight: 2,
                })
                    .bindPopup(pointPopup(start, valid.length === 1 ? "Posição" : "Início"))
                    .addTo(map);
                layersRef.current.push(startMarker);

                if (valid.length >= 2) {
                    const endMarker = L.circleMarker([end.lat, end.lng], {
                        radius: 7,
                        color: "#dc2626",
                        fillColor: "#dc2626",
                        fillOpacity: 1,
                        weight: 2,
                    })
                        .bindPopup(pointPopup(end, "Fim"))
                        .addTo(map);
                    layersRef.current.push(endMarker);
                }

                if (valid.length > 2) {
                    const step = Math.max(1, Math.ceil(valid.length / 12));

                    valid.forEach((p, idx) => {
                        if (idx === 0 || idx === valid.length - 1 || idx % step !== 0) return;

                        const marker = L.circleMarker([p.lat, p.lng], {
                            radius: 3,
                            color: "#475569",
                            fillColor: "#475569",
                            fillOpacity: 0.7,
                            weight: 1,
                        })
                            .bindPopup(pointPopup(p, `Ponto ${idx + 1}`))
                            .addTo(map);

                        layersRef.current.push(marker);
                    });
                }

                setError(null);

                setTimeout(() => {
                    try {
                        map.invalidateSize();
                    } catch {
                        // ignora
                    }
                }, 100);
            } catch (e: any) {
                setError(e?.message || "Falha ao carregar mapa.");
            }
        }

        run();

        return () => {
            canceled = true;
        };
    }, [valid, routePoints]);

    useEffect(() => {
        return () => {
            if (mapRef.current) {
                mapRef.current.remove?.();
                mapRef.current = null;
            }
            layersRef.current = [];
        };
    }, []);

    return (
        <div className={className}>
            <div
                ref={mapDivRef}
                style={{ height }}
                className="w-full overflow-hidden rounded-lg border"
            />

            {showSummary && valid.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>{summary.total} ponto(s)</span>
                    {summary.distanceKm > 0 && (
                        <span>• distância estimada: {summary.distanceKm.toFixed(2).replace(".", ",")} km</span>
                    )}
                    {summary.vmax != null && <span>• vel. máx.: {fmtKmH(summary.vmax)}</span>}
                    {summary.start?.t && <span>• início: {fmtTimestamp(summary.start.t)}</span>}
                    {summary.end?.t && valid.length > 1 && <span>• fim: {fmtTimestamp(summary.end.t)}</span>}
                </div>
            )}

            {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
        </div>
    );
}
