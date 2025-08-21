"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PermissionStateX = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

type Opts = {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maxAge?: number;
};

type Stats = {
    distanceKm: number;
    lastKmh: number;
    avgKmh: number;
    headingDeg: number | null;
};

function haversineMeters(a: GeolocationCoordinates, b: GeolocationCoordinates) {
    const R = 6371000;
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
    const lat1 = (a.latitude * Math.PI) / 180;
    const lat2 = (b.latitude * Math.PI) / 180;
    const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

export function useGeolocation(opts: Opts = {}) {
    const [permission, setPermission] = useState<PermissionStateX>("unknown");
    const [isTracking, setIsTracking] = useState(false);
    const [lastPosition, setLastPosition] = useState<GeolocationPosition | null>(null);
    const [path, setPath] = useState<GeolocationPosition[]>([]);
    const [error, setError] = useState<string | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const startTsRef = useRef<number | null>(null);
    const metersTotalRef = useRef<number>(0);

    // check permission on mount
    useEffect(() => {
        if (!("geolocation" in navigator)) {
            setPermission("unsupported");
            return;
        }
        const permAPI = (navigator as any).permissions;
        if (permAPI?.query) {
            permAPI.query({ name: "geolocation" as any }).then((res: any) => {
                setPermission(res.state as PermissionStateX);
                res.onchange = () => setPermission(res.state as PermissionStateX);
            }).catch(() => setPermission("unknown"));
        } else {
            setPermission("prompt");
        }
    }, []);

    const startTracking = useCallback(() => {
        if (!("geolocation" in navigator)) {
            setPermission("unsupported");
            setError("Seu navegador não suporta geolocalização.");
            return;
        }
        if (watchIdRef.current != null) return;

        setError(null);
        setIsTracking(true);
        startTsRef.current = Date.now();
        metersTotalRef.current = 0;
        setPath([]);

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                setLastPosition(pos);
                setPath((prev) => {
                    if (prev.length) {
                        const meters = haversineMeters(prev[prev.length - 1].coords, pos.coords);
                        if (Number.isFinite(meters)) metersTotalRef.current += meters;
                    }
                    return [...prev, pos];
                });
            },
            (err) => {
                setError(err.message || "Falha ao obter posição.");
                setIsTracking(false);
                if (watchIdRef.current != null) {
                    navigator.geolocation.clearWatch(watchIdRef.current);
                    watchIdRef.current = null;
                }
            },
            {
                enableHighAccuracy: opts.enableHighAccuracy ?? true,
                maximumAge: opts.maxAge ?? 0,
                timeout: opts.timeout ?? 20000,
            }
        );
    }, [opts.enableHighAccuracy, opts.maxAge, opts.timeout]);

    const stopTracking = useCallback(() => {
        if (watchIdRef.current != null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setIsTracking(false);
    }, []);

    useEffect(() => () => {
        // cleanup on unmount
        if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    }, []);

    const stats: Stats = useMemo(() => {
        const msElapsed = startTsRef.current ? Date.now() - startTsRef.current : 0;
        const hours = msElapsed / 3600000;
        const distanceKm = metersTotalRef.current / 1000;
        const avgKmh = hours > 0 ? distanceKm / hours : NaN;

        const last = lastPosition?.coords;
        const lastKmh = last?.speed != null && last.speed >= 0 ? last.speed * 3.6 : NaN;
        const headingDeg = last?.heading != null && last.heading >= 0 ? last.heading : null;

        return { distanceKm, avgKmh, lastKmh, headingDeg };
    }, [lastPosition]);

    return {
        permission,
        isTracking,
        startTracking,
        stopTracking,
        lastPosition,
        path,
        error,
        stats,
    };
}
