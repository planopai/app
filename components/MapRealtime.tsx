"use client";

import "leaflet/dist/leaflet.css";
import L, { Map as LeafletMap, Marker, Circle, Polyline } from "leaflet";
import React, { useEffect, useRef } from "react";

type Props = {
    current?: GeolocationPosition;
    path: GeolocationPosition[];
};

const DEFAULT = { lat: -15.793889, lng: -47.882778, zoom: 13 }; // Brasília como fallback

// Ajusta o ícone padrão (corrige bug do Leaflet com bundlers)
const DefaultIcon = L.icon({
    iconUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

export default function MapRealtime({ current, path }: Props) {
    const mapRef = useRef<LeafletMap | null>(null);
    const elRef = useRef<HTMLDivElement | null>(null);
    const markerRef = useRef<Marker | null>(null);
    const circleRef = useRef<Circle | null>(null);
    const lineRef = useRef<Polyline | null>(null);

    // init
    useEffect(() => {
        if (!elRef.current || mapRef.current) return;

        const center = current
            ? [current.coords.latitude, current.coords.longitude] as [number, number]
            : [DEFAULT.lat, DEFAULT.lng] as [number, number];

        const map = L.map(elRef.current, {
            center,
            zoom: current ? 16 : DEFAULT.zoom,
            zoomControl: true,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        }).addTo(map);

        mapRef.current = map;

        // polyline
        lineRef.current = L.polyline([], { weight: 4 }).addTo(map);

        return () => {
            map.remove();
            mapRef.current = null;
            markerRef.current = null;
            circleRef.current = null;
            lineRef.current = null;
        };
    }, []);

    // update current marker / accuracy
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !current) return;

        const { latitude, longitude, accuracy } = current.coords;
        const latlng = L.latLng(latitude, longitude);

        if (!markerRef.current) {
            markerRef.current = L.marker(latlng).addTo(map);
        } else {
            markerRef.current.setLatLng(latlng);
        }

        if (!circleRef.current) {
            circleRef.current = L.circle(latlng, {
                radius: accuracy || 0,
                color: "#2563eb",
                weight: 1,
                fillOpacity: 0.1,
            }).addTo(map);
        } else {
            circleRef.current.setLatLng(latlng);
            circleRef.current.setRadius(accuracy || 0);
        }
    }, [current]);

    // update path polyline & fit
    useEffect(() => {
        const map = mapRef.current;
        const line = lineRef.current;
        if (!map || !line) return;

        const latlngs = path.map(p => [p.coords.latitude, p.coords.longitude]) as [number, number][];
        line.setLatLngs(latlngs);

        if (latlngs.length === 1) {
            map.setView(latlngs[0], 16);
        } else if (latlngs.length > 1) {
            const bounds = L.latLngBounds(latlngs);
            map.fitBounds(bounds.pad(0.2), { animate: false });
        }
    }, [path]);

    return <div ref={elRef} className="h-full w-full rounded-b-2xl" />;
}
