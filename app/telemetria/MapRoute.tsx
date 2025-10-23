"use client";

import { B612 } from "next/font/google";
import React, { useEffect, useMemo, useRef, useState } from "react";

type Ponto = { lat: number; lng: number; t?: number; v?: number };

function loadLeafletFromCDN(): Promise<typeof window.L> {
    return new Promise((resolve, reject) => {
        if (typeof window !== "undefined" && (window as any).L) {
            resolve((window as any).L);
            return;
        }

        // CSS
        if (!document.getElementById("leaflet-css")) {
            const link = document.createElement("link");
            link.id = "leaflet-css";
            link.rel = "stylesheet";
            link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
            document.head.appendChild(link);
        }

        // JS
        const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
        if (existing && (window as any).L) {
            resolve((window as any).L);
            return;
        }

        const script = existing ?? document.createElement("script");
        script.id = "leaflet-js";
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.async = true;

        script.onload = () => {
            if ((window as any).L) resolve((window as any).L);
            else reject(new Error("Leaflet não disponível após carregar o script."));
        };
        script.onerror = () => reject(new Error("Falha ao carregar Leaflet (CDN)."));

        if (!existing) document.body.appendChild(script);
    });
}

export default function MapRoute({
    pontos,
    height = 220,
    className = "",
}: {
    pontos: Ponto[];
    height?: number;
    className?: string;
}) {
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<any>(null);
    const [error, setError] = useState<string | null>(null);

    const valid = useMemo(
        () => pontos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
        [pontos]
    );

    useEffect(() => {
        let canceled = false;
        if (!mapDivRef.current) return;
        if (valid.length < 2) {
            setError("Sem pontos suficientes para traçar rota.");
            return;
        }

        async function run() {
            try {
                const L = await loadLeafletFromCDN();
                if (canceled || !mapDivRef.current) return;

                // destrói anterior se existir
                if (mapRef.current) {
                    mapRef.current.remove();
                    mapRef.current = null;
                }

                const first = valid[0];
                const map = L.map(mapDivRef.current, { zoomControl: true, attributionControl: true })
                    .setView([first.lat, first.lng], 13);

                L.tileLayer(
                    // Para produção, use um provedor com chave/limite apropriado
                    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                    { maxZoom: 19, attribution: "&copy; OpenStreetMap" }
                ).addTo(map);

                // polyline
                const latlngs = valid.map((p) => [p.lat, p.lng]) as [number, number][];
                const line = L.polyline(latlngs, { color: "#0ea5e9", weight: 4 }).addTo(map);
                map.fitBounds(line.getBounds(), { padding: [20, 20] });

                // markers início/fim
                L.circleMarker(latlngs[0], { radius: 6, color: "#10b981", fillOpacity: 1 }).addTo(map);
                L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: "#ef4444", fillOpacity: 1 }).addTo(map);

                mapRef.current = map;
                setError(null);
            } catch (e: any) {
                setError(e?.message || "Falha ao carregar mapa.");
            }
        }
        run();

        return () => {
            canceled = true;
            if (mapRef.current) {
                mapRef.current.remove?.();
                mapRef.current = null;
            }
        };
    }, [valid]);

    return (
        <div className={className}>
            <div
                ref={mapDivRef}
                style={{ height }}
                className="w-full overflow-hidden rounded-lg border"
            />
            {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
        </div>
    );
}

