"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API } from "../acompanhamento/components/constants";
import MapRoute from "./MapRoute";


declare global {
    interface Window {
        L?: any;
    }
}

/**
 * TelemetriaOperacionalPage
 *
 * Painel avançado para:
 * - Ver localização atual dos veículos iTrack.
 * - Cruzar veículos com atendimentos funerários.
 * - Selecionar atendimento e consultar rota/histórico da placa.
 * - Ver distância por hodômetro.
 * - Usar cache local ou consultar iTrack em tempo real.
 *
 * Requer o backend:
 * /api/php/telemetria.php
 *   GET ?listar=1
 *   GET ?itrack=listaveiculos&salvar=1
 *   GET ?itrack=historico&placa=...&inicio=...&fim=...&salvar=1
 *   GET ?itrack=distancia&placa=...&inicio=...&fim=...&salvar=1
 *   GET ?itrack=veiculos_cache
 *   GET ?itrack=distancia_cache[&placa=...]
 */

type Ponto = {
    lat: number;
    lng: number;
    t?: number;
    v?: number;
    label?: string;
    localizacao?: string;
};

type TelemetriaRegistro = {
    id: number;
    sepultamento_id: number | null;
    agente?: string | null;
    falecido?: string | null;
    tipo?: "remocao" | "para_velorio" | "para_sepultamento" | string;
    veiculo_nome?: string | null;
    placa?: string | null;
    id_veiculo_itrack?: number | null;
    id_rastreador_itrack?: string | null;
    nome_motorista?: string | null;
    veiculo_obs?: string | null;
    inicio_iso?: string | null;
    fim_iso?: string | null;
    inicio_ts?: string | null;
    fim_ts?: string | null;
    velocidade_max?: number | null;
    velocidade_media?: number | null;
    vel_max_kmh?: number | null;
    vel_media_kmh?: number | null;
    distancia_km?: number | null;
    duracao_s?: number | null;
    duracao_seg?: number | null;
    hodometro_inicial?: number | null;
    hodometro_final?: number | null;
    distancia_hodometro_m?: number | null;
    origem?: string | null;
    origem_dados?: string | null;
    observacao?: string | null;
    pontos_json?: string | Ponto[] | null;
    eventos_json?: string | null;
    criado_em?: string | null;
    atualizado_em?: string | null;
};

type ItrackEvento = {
    idEvento?: number;
    descricaoEvento?: string;
};

type ItrackVeiculo = {
    idVeiculo?: number;
    id_veiculo?: number;
    placa: string;
    descricaoVeiculo?: string;
    descricao_veiculo?: string;
    grupoVeiculo?: string;
    grupo_veiculo?: string;
    idCliente?: number;
    id_cliente?: number;
    nomeCliente?: string;
    nome_cliente?: string;
    idRastreador?: string;
    id_rastreador?: string;
    latitude?: number;
    longitude?: number;
    localizacao?: string;
    velocidade?: number;
    dataHoraPosicao?: string;
    data_hora_posicao?: string;
    hodometro?: number;
    ignicao?: number;
    gps?: number;
    nomeMotorista?: string;
    nome_motorista?: string;
    eventos?: ItrackEvento[];
    eventos_json?: string | ItrackEvento[] | null;
    atualizado_em?: string;
};

type ItrackHistoricoItem = {
    cliente?: any;
    rastreador?: any;
    veiculo?: {
        cod?: number;
        placa?: string;
        descricao?: string;
        descricaoCurta?: string;
        marca?: string;
        modelo?: string;
        ano?: string;
        tipo?: string;
    } | null;
    posicoes?: ItrackPosicao[] | null;
};

type ItrackPosicao = {
    ignicao?: number;
    gps?: number;
    latitude?: number;
    longitude?: number;
    localizacao?: string;
    velocidade?: number;
    dataHoraPosicao?: string;
    dataHoraServidor?: string;
    data_hora_posicao?: string;
    data_hora_servidor?: string;
    hodometro?: number;
    nomeMotorista?: string;
    nome_motorista?: string;
    cercas?: string;
    temperaturaEmbarcada?: string;
    temperaturaSensores?: string;
    eventos?: ItrackEvento[];
};

type ItrackDistancia = {
    id?: number;
    descricaoVeiculo?: string;
    descricao_veiculo?: string;
    placa?: string;
    cliente?: string;
    idRastreador?: string;
    id_rastreador?: string;
    distanciaPercorrida?: number;
    distancia_percorrida_m?: number;
    distancia_percorrida_km?: number;
    hodometroInicial?: number;
    hodometro_inicial?: number;
    hodometroFinal?: number;
    hodometro_final?: number;
    data_inicio?: string;
    data_fim?: string;
};

type Tab = "ao_vivo" | "atendimentos" | "historico" | "distancias";

/* ======================= Helpers ======================= */
const TELEMETRIA_URL = `${API}/api/php/telemetria.php`;

const isFiniteNum = (v: any): v is number => Number.isFinite(Number(v));

const n = (v: any, d: number | null = 0): number | null => {
    if (v === null || v === undefined || v === "") return d;
    const num = Number(v);
    return Number.isFinite(num) ? num : d;
};

function fmtKm(v?: number | null) {
    if (!isFiniteNum(v)) return "-";
    return `${Number(v).toFixed(2).replace(".", ",")} km`;
}

function fmtM(v?: number | null) {
    if (!isFiniteNum(v)) return "-";
    return `${Number(v).toLocaleString("pt-BR")} m`;
}

function fmtKmH(v?: number | null) {
    if (!isFiniteNum(v)) return "-";
    return `${Number(v).toFixed(1).replace(".", ",")} km/h`;
}

function fmtDur(seg?: number | null) {
    if (!isFiniteNum(seg)) return "-";
    const s = Math.max(0, Number(seg));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = Math.floor(s % 60);
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
    if (m > 0) return `${m}min ${String(r).padStart(2, "0")}s`;
    return `${r}s`;
}

function fmtDataHora(v?: string | number | null) {
    if (!v) return "-";

    if (typeof v === "number") {
        const ms = v > 1000000000000 ? v : v * 1000;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("pt-BR");
    }

    const s = String(v).trim();
    if (!s) return "-";

    if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(s)) return s;

    const normalized = s.includes("T") ? s : s.replace(" ", "T");
    const d = new Date(normalized);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("pt-BR");

    return s;
}

function parseJsonSafe<T = any>(value: any, fallback: T): T {
    if (value == null || value === "") return fallback;
    if (typeof value !== "string") return value as T;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function parsePontosJson(raw: any): Ponto[] {
    const arr = parseJsonSafe<any[]>(raw, []);
    if (!Array.isArray(arr)) return [];

    return arr
        .map((p) => ({
            lat: Number(p.lat ?? p.latitude),
            lng: Number(p.lng ?? p.longitude),
            t: p.t ?? p.ts ?? p.timestamp,
            v: p.v ?? p.velocidade ?? p.spd_kmh,
            label: p.label,
            localizacao: p.localizacao,
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function normalizePlaca(v: string) {
    return String(v || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 7);
}

function placaComTraco(v?: string | null) {
    const p = normalizePlaca(v || "");
    if (p.length !== 7) return p || "-";
    return `${p.slice(0, 3)}-${p.slice(3)}`;
}

function pad2(v: number) {
    return String(v).padStart(2, "0");
}

function dateTo14(d: Date) {
    return [
        d.getFullYear(),
        pad2(d.getMonth() + 1),
        pad2(d.getDate()),
        pad2(d.getHours()),
        pad2(d.getMinutes()),
        pad2(d.getSeconds()),
    ].join("");
}

function todayStart14() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return dateTo14(d);
}

function todayEnd14() {
    const d = new Date();
    d.setHours(23, 59, 59, 0);
    return dateTo14(d);
}

function parseDateMaybe(v?: string | null) {
    if (!v) return null;
    const s = String(v).trim();

    if (/^\d{14}$/.test(s)) {
        return new Date(
            Number(s.slice(0, 4)),
            Number(s.slice(4, 6)) - 1,
            Number(s.slice(6, 8)),
            Number(s.slice(8, 10)),
            Number(s.slice(10, 12)),
            Number(s.slice(12, 14))
        );
    }

    if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(s)) {
        const [date, time] = s.split(/\s+/);
        const [dd, mm, yyyy] = date.split("/").map(Number);
        const [hh, mi, ss] = time.split(":").map(Number);
        return new Date(yyyy, mm - 1, dd, hh, mi, ss);
    }

    const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
}

function rowInicioFim14(row: TelemetriaRegistro) {
    const ini = parseDateMaybe(row.inicio_iso || row.inicio_ts || row.criado_em);
    const fim = parseDateMaybe(row.fim_iso || row.fim_ts || row.atualizado_em || row.criado_em);

    if (!ini) return { inicio: todayStart14(), fim: todayEnd14() };

    const safeFim = fim && fim.getTime() > ini.getTime() ? fim : new Date(ini.getTime() + 6 * 60 * 60 * 1000);

    return {
        inicio: dateTo14(ini),
        fim: dateTo14(safeFim),
    };
}

function parseDataBrItrack(v?: string | null) {
    const d = parseDateMaybe(v);
    if (!d) return undefined;
    return Math.floor(d.getTime() / 1000);
}

function posicoesToPontos(pos: ItrackPosicao[]): Ponto[] {
    return (pos || [])
        .map((p) => ({
            lat: Number(p.latitude),
            lng: Number(p.longitude),
            v: n(p.velocidade, undefined as any) as any,
            t: parseDataBrItrack(p.dataHoraPosicao ?? p.data_hora_posicao),
            localizacao: p.localizacao,
            label: fmtDataHora(p.dataHoraPosicao ?? p.data_hora_posicao),
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function normalizeRow(r: any): TelemetriaRegistro {
    return {
        ...r,
        id: Number(r.id),
        sepultamento_id: r.sepultamento_id != null ? Number(r.sepultamento_id) : null,
        distancia_km: n(r.distancia_km, null),
        duracao_s: n(r.duracao_s ?? r.duracao_seg, null),
        duracao_seg: n(r.duracao_seg ?? r.duracao_s, null),
        velocidade_media: n(r.velocidade_media ?? r.vel_media_kmh, null),
        velocidade_max: n(r.velocidade_max ?? r.vel_max_kmh, null),
        vel_media_kmh: n(r.vel_media_kmh ?? r.velocidade_media, null),
        vel_max_kmh: n(r.vel_max_kmh ?? r.velocidade_max, null),
        hodometro_inicial: n(r.hodometro_inicial, null),
        hodometro_final: n(r.hodometro_final, null),
        distancia_hodometro_m: n(r.distancia_hodometro_m, null),
    };
}

function veiculoDescricao(v: ItrackVeiculo) {
    return v.descricaoVeiculo ?? v.descricao_veiculo ?? "Sem descrição";
}

function veiculoCliente(v: ItrackVeiculo) {
    return v.nomeCliente ?? v.nome_cliente ?? "-";
}

function veiculoRastreador(v: ItrackVeiculo) {
    return v.idRastreador ?? v.id_rastreador ?? "-";
}

function veiculoMotorista(v: ItrackVeiculo) {
    return v.nomeMotorista ?? v.nome_motorista ?? "-";
}

function veiculoDataPosicao(v: ItrackVeiculo) {
    return v.dataHoraPosicao ?? v.data_hora_posicao ?? v.atualizado_em ?? null;
}

function veiculoEventos(v: ItrackVeiculo): ItrackEvento[] {
    if (Array.isArray(v.eventos)) return v.eventos;
    return parseJsonSafe<ItrackEvento[]>(v.eventos_json, []);
}

function veiculoPonto(v: ItrackVeiculo): Ponto | null {
    const lat = Number(v.latitude);
    const lng = Number(v.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
        lat,
        lng,
        v: Number(v.velocidade ?? 0),
        label: `${placaComTraco(v.placa)} • ${veiculoDescricao(v)}`,
        localizacao: v.localizacao || "",
        t: parseDataBrItrack(veiculoDataPosicao(v)),
    };
}

function distanciaMetros(d: ItrackDistancia) {
    return n(d.distanciaPercorrida ?? d.distancia_percorrida_m, 0) || 0;
}

function distanciaKm(d: ItrackDistancia) {
    if (d.distancia_percorrida_km != null) return n(d.distancia_percorrida_km, 0) || 0;
    return distanciaMetros(d) / 1000;
}

function statusVeiculo(v: ItrackVeiculo) {
    const ignicao = Number(v.ignicao);
    const vel = Number(v.velocidade || 0);

    if (ignicao === 1 && vel > 3) return { label: "Em movimento", tone: "emerald" };
    if (ignicao === 1) return { label: "Ligado/parado", tone: "amber" };
    return { label: "Desligado", tone: "slate" };
}

function tipoLabel(tipo?: string | null) {
    const t = String(tipo || "").toLowerCase();
    if (t === "remocao") return "Remoção";
    if (t === "para_velorio") return "Para velório";
    if (t === "para_sepultamento") return "Para sepultamento";
    return tipo || "Não informado";
}

function distanciaEntreKm(a?: Ponto | null, b?: Ponto | null) {
    if (!a || !b) return null;
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


function escapeHtml(value: any) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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
                else reject(new Error("Leaflet não ficou disponível."));
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
            else reject(new Error("Leaflet não ficou disponível."));
        };
        script.onerror = () => reject(new Error("Falha ao carregar Leaflet via CDN."));
        document.body.appendChild(script);
    });
}

function liveVehiclePopup(v: ItrackVeiculo) {
    const st = statusVeiculo(v);
    const eventos = veiculoEventos(v).map((ev) => ev.descricaoEvento).filter(Boolean).join(", ");
    const parts = [
        `<strong>🚗 ${escapeHtml(placaComTraco(v.placa))}</strong>`,
        escapeHtml(veiculoDescricao(v)),
        `Status: <strong>${escapeHtml(st.label)}</strong>`,
        `Velocidade: ${escapeHtml(fmtKmH(v.velocidade))}`,
        `Ignição: ${Number(v.ignicao) === 1 ? "Ligada" : "Desligada"}`,
        `GPS: ${escapeHtml(v.gps ?? "-")}`,
        `Motorista: ${escapeHtml(veiculoMotorista(v))}`,
        `Atualizado: ${escapeHtml(fmtDataHora(veiculoDataPosicao(v)))}`,
        v.localizacao ? `Local: ${escapeHtml(v.localizacao)}` : "",
        eventos ? `Eventos: ${escapeHtml(eventos)}` : "",
    ].filter(Boolean);
    return parts.join("<br/>");
}

function LiveVehiclesMap({
    veiculos,
    selectedPlaca,
    onSelect,
    height = 430,
    loading = false,
    lastUpdate,
}: {
    veiculos: ItrackVeiculo[];
    selectedPlaca?: string;
    onSelect?: (v: ItrackVeiculo) => void;
    height?: number;
    loading?: boolean;
    lastUpdate?: Date | null;
}) {
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<any>(null);
    const layersRef = useRef<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const valid = useMemo(() => {
        return veiculos
            .map((v) => ({ v, p: veiculoPonto(v) }))
            .filter((x): x is { v: ItrackVeiculo; p: Ponto } => !!x.p);
    }, [veiculos]);

    useEffect(() => {
        let canceled = false;

        async function run() {
            if (!mapDivRef.current) return;

            if (valid.length === 0) {
                setError("Nenhum veículo com latitude/longitude para exibir.");
                if (mapRef.current) {
                    layersRef.current.forEach((layer) => {
                        try { mapRef.current.removeLayer(layer); } catch { }
                    });
                    layersRef.current = [];
                }
                return;
            }

            try {
                const L = await loadLeafletFromCDN();
                if (canceled || !mapDivRef.current) return;

                setError(null);

                if (!mapRef.current) {
                    const first = valid[0].p;
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
                layersRef.current.forEach((layer) => {
                    try { map.removeLayer(layer); } catch { }
                });
                layersRef.current = [];

                const bounds: any[] = [];

                valid.forEach(({ v, p }) => {
                    const st = statusVeiculo(v);
                    const moving = st.label === "Em movimento";
                    const selected = normalizePlaca(selectedPlaca || "") === normalizePlaca(v.placa || "");
                    const html = `
            <div class="live-car-marker ${moving ? "is-moving" : ""} ${selected ? "is-selected" : ""}">
              <span class="live-car-emoji">🚗</span>
              <span class="live-car-plate">${escapeHtml(`${veiculoDescricao(v)} • ${placaComTraco(v.placa)}`)}</span>
              ${moving ? `<span class="live-car-pulse"></span>` : ""}
            </div>
          `;

                    const icon = L.divIcon({
                        className: "live-car-div-icon",
                        html,
                        iconSize: [170, 54],
                        iconAnchor: [85, 27],
                        popupAnchor: [0, -20],
                    });

                    const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
                    marker.on("click", () => onSelect?.(v));
                    layersRef.current.push(marker);
                    bounds.push([p.lat, p.lng]);
                });

                if (bounds.length === 1) {
                    map.setView(bounds[0], 15);
                } else if (bounds.length > 1) {
                    map.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 });
                }

                setTimeout(() => {
                    try { map.invalidateSize(); } catch { }
                }, 80);
            } catch (e: any) {
                setError(e?.message || "Falha ao carregar o mapa ao vivo.");
            }
        }

        run();

        return () => {
            canceled = true;
        };
    }, [valid, selectedPlaca, onSelect]);

    useEffect(() => {
        return () => {
            if (mapRef.current) {
                try { mapRef.current.remove(); } catch { }
                mapRef.current = null;
            }
        };
    }, []);

    return (
        <div className="relative overflow-hidden rounded-2xl border bg-slate-100">
            <style jsx global>{`
        .live-car-div-icon { background: transparent; border: 0; }
        .live-car-marker {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          transform: translateY(-4px);
          filter: drop-shadow(0 8px 12px rgba(15, 23, 42, 0.25));
        }
        .live-car-emoji {
          position: relative;
          z-index: 2;
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border: 2px solid white;
          border-radius: 999px;
          background: #0f172a;
          font-size: 21px;
          line-height: 1;
        }
        .live-car-marker.is-moving .live-car-emoji {
          animation: liveCarBounce 0.9s ease-in-out infinite;
          background: #059669;
        }
        .live-car-marker.is-selected .live-car-emoji {
          outline: 4px solid rgba(59, 130, 246, 0.35);
        }
        .live-car-plate {
          position: relative;
          z-index: 3;
          margin-top: -3px;
          border-radius: 999px;
          background: white;
          padding: 1px 6px;
          color: #0f172a;
          max-width: 160px;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.02em;
          white-space: nowrap;
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.16);
        }
        .live-car-pulse {
          position: absolute;
          z-index: 1;
          width: 46px;
          height: 46px;
          border-radius: 999px;
          background: rgba(16, 185, 129, 0.25);
          animation: liveCarPulse 1.25s ease-out infinite;
        }
        @keyframes liveCarPulse {
          0% { transform: scale(0.55); opacity: 0.95; }
          100% { transform: scale(1.85); opacity: 0; }
        }
        @keyframes liveCarBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>

            <div ref={mapDivRef} style={{ height }} className="w-full" />

            <div className="pointer-events-none absolute left-3 top-3 rounded-xl border bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
                <div className="font-semibold text-slate-800">🚗 Veículos ao vivo</div>
                <div className="text-slate-500">
                    {valid.length} no mapa {loading ? "• atualizando..." : ""}
                </div>
            </div>

            <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
                <div className="flex flex-wrap gap-3 text-slate-600">
                    <span><strong className="text-emerald-700">●</strong> em movimento</span>
                    <span><strong className="text-slate-700">●</strong> parado/desligado</span>
                    <span>clique no carro para detalhes</span>
                </div>
                <div className="text-slate-500">
                    Atualizado: {lastUpdate ? lastUpdate.toLocaleTimeString("pt-BR") : "-"}
                </div>
            </div>

            {error && (
                <div className="absolute inset-x-3 bottom-16 rounded-xl border bg-white/95 p-3 text-sm text-slate-600 shadow-sm">
                    {error}
                </div>
            )}
        </div>
    );
}

/* ======================= Página ======================= */
export default function TelemetriaOperacionalPage() {
    const [tab, setTab] = useState<Tab>("ao_vivo");

    const [rows, setRows] = useState<TelemetriaRegistro[]>([]);
    const [veiculos, setVeiculos] = useState<ItrackVeiculo[]>([]);
    const [historico, setHistorico] = useState<ItrackHistoricoItem | null>(null);
    const [distancias, setDistancias] = useState<ItrackDistancia[]>([]);

    const [loading, setLoading] = useState(false);
    const [itrackLoading, setItrackLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [selectedAtendimentoId, setSelectedAtendimentoId] = useState<number | null>(null);
    const [selectedPlaca, setSelectedPlaca] = useState("");
    const [busca, setBusca] = useState("");
    const [filtroTipo, setFiltroTipo] = useState("todos");
    const [somenteComPlaca, setSomenteComPlaca] = useState(false);

    const [inicio, setInicio] = useState(todayStart14());
    const [fim, setFim] = useState(todayEnd14());
    const [salvarConsultas, setSalvarConsultas] = useState(true);
    const [usarCacheVeiculos, setUsarCacheVeiculos] = useState(false);
    const [tempoRealAtivo, setTempoRealAtivo] = useState(true);
    const [intervaloTempoRealMs, setIntervaloTempoRealMs] = useState(15000);
    const [ultimaAtualizacaoAoVivo, setUltimaAtualizacaoAoVivo] = useState<Date | null>(null);
    const [modalPlaca, setModalPlaca] = useState("");
    const liveFetchingRef = useRef(false);

    const selectedAtendimento = useMemo(
        () => rows.find((r) => r.id === selectedAtendimentoId) || null,
        [rows, selectedAtendimentoId]
    );

    const fetchRows = useCallback(async () => {
        setLoading(true);
        setMsg(null);

        try {
            const r = await fetch(`${TELEMETRIA_URL}?listar=1&_t=${Date.now()}`, {
                credentials: "include",
                cache: "no-store",
            });

            const payload = await r.json();
            if (payload?.erro) throw new Error(payload.msg || "Falha ao carregar atendimentos.");

            const list = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.dados)
                    ? payload.dados
                    : [];

            setRows(list.map(normalizeRow));
        } catch (e: any) {
            setMsg(e?.message || "Falha ao carregar atendimentos.");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchVeiculos = useCallback(async (cache = usarCacheVeiculos, silent = false) => {
        if (liveFetchingRef.current) return;
        liveFetchingRef.current = true;
        setItrackLoading(true);
        if (!silent) setMsg(null);

        try {
            const qs = new URLSearchParams({
                itrack: cache ? "veiculos_cache" : "listaveiculos",
                _t: String(Date.now()),
            });

            if (!cache && salvarConsultas) qs.set("salvar", "1");

            const r = await fetch(`${TELEMETRIA_URL}?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
            });

            const payload = await r.json();
            if (payload?.erro) throw new Error(payload.msg || "Falha ao consultar veículos.");

            const list = cache ? payload?.dados : payload?.dados?.data;
            setVeiculos(Array.isArray(list) ? list : []);
            setUltimaAtualizacaoAoVivo(new Date());
            // Sem mensagem informativa para manter a tela limpa.
        } catch (e: any) {
            if (!silent) setMsg(e?.message || "Falha ao consultar veículos.");
        } finally {
            liveFetchingRef.current = false;
            setItrackLoading(false);
        }
    }, [salvarConsultas, usarCacheVeiculos]);

    const fetchHistorico = useCallback(async (placaManual?: string, periodo?: { inicio: string; fim: string }) => {
        const placa = normalizePlaca(placaManual || selectedPlaca);
        const ini = periodo?.inicio || inicio;
        const end = periodo?.fim || fim;

        if (!placa || !ini || !end) {
            setMsg("Informe placa, início e fim para consultar o histórico.");
            return;
        }

        setItrackLoading(true);
        setMsg(null);
        setHistorico(null);
        setSelectedPlaca(placa);

        try {
            const qs = new URLSearchParams({
                itrack: "historico",
                placa,
                inicio: ini,
                fim: end,
                _t: String(Date.now()),
            });

            if (salvarConsultas) qs.set("salvar", "1");

            const r = await fetch(`${TELEMETRIA_URL}?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
            });

            const payload = await r.json();
            if (payload?.erro) throw new Error(payload.msg || "Falha ao consultar histórico.");

            const item = payload?.dados?.data?.[0] ?? null;
            setHistorico(item);
            setTab("historico");

            const total = Array.isArray(item?.posicoes) ? item.posicoes.length : 0;
            setMsg(`Histórico de ${placaComTraco(placa)} carregado com ${total} posição(ões).`);
        } catch (e: any) {
            setMsg(e?.message || "Falha ao consultar histórico.");
        } finally {
            setItrackLoading(false);
        }
    }, [selectedPlaca, inicio, fim, salvarConsultas]);

    const fetchDistancia = useCallback(async (placaManual?: string, periodo?: { inicio: string; fim: string }) => {
        const placa = normalizePlaca(placaManual || selectedPlaca);
        const ini = periodo?.inicio || inicio;
        const end = periodo?.fim || fim;

        if (!placa || !ini || !end) {
            setMsg("Informe placa, início e fim para consultar distância.");
            return;
        }

        setItrackLoading(true);
        setMsg(null);
        setSelectedPlaca(placa);

        try {
            const qs = new URLSearchParams({
                itrack: "distancia",
                placa,
                inicio: ini,
                fim: end,
                _t: String(Date.now()),
            });

            if (salvarConsultas) qs.set("salvar", "1");

            const r = await fetch(`${TELEMETRIA_URL}?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
            });

            const payload = await r.json();
            if (payload?.erro) throw new Error(payload.msg || "Falha ao consultar distância.");

            const list = payload?.dados?.data;
            setDistancias(Array.isArray(list) ? list : []);
            setTab("distancias");
            setMsg(`Distância de ${placaComTraco(placa)} carregada.`);
        } catch (e: any) {
            setMsg(e?.message || "Falha ao consultar distância.");
        } finally {
            setItrackLoading(false);
        }
    }, [selectedPlaca, inicio, fim, salvarConsultas]);

    const carregarTudo = useCallback(async () => {
        await Promise.all([fetchRows(), fetchVeiculos(false)]);
    }, [fetchRows, fetchVeiculos]);

    const selecionarAtendimento = useCallback((row: TelemetriaRegistro) => {
        setSelectedAtendimentoId(row.id);
        const placa = normalizePlaca(row.placa || "");
        if (placa) setSelectedPlaca(placa);

        const p = rowInicioFim14(row);
        setInicio(p.inicio);
        setFim(p.fim);
    }, []);

    const consultarAtendimentoCompleto = useCallback(async (row: TelemetriaRegistro) => {
        selecionarAtendimento(row);
        const placa = normalizePlaca(row.placa || "");
        if (!placa) {
            setMsg("Este atendimento não tem placa vinculada.");
            return;
        }

        const periodo = rowInicioFim14(row);
        setInicio(periodo.inicio);
        setFim(periodo.fim);

        await fetchHistorico(placa, periodo);
        await fetchDistancia(placa, periodo);
    }, [fetchHistorico, fetchDistancia, selecionarAtendimento]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    useEffect(() => {
        if (tab !== "ao_vivo" || !tempoRealAtivo) return;

        fetchVeiculos(false, veiculos.length > 0);

        const id = window.setInterval(() => {
            fetchVeiculos(false, true);
        }, intervaloTempoRealMs);

        return () => window.clearInterval(id);
    }, [tab, tempoRealAtivo, intervaloTempoRealMs, fetchVeiculos, veiculos.length]);

    const veiculosPontos = useMemo(() => veiculos.map(veiculoPonto).filter(Boolean) as Ponto[], [veiculos]);

    const pontosHistorico = useMemo(() => posicoesToPontos(historico?.posicoes ?? []), [historico]);

    const atendimentoSelecionadoPontos = useMemo(() => {
        if (!selectedAtendimento) return [];
        return parsePontosJson(selectedAtendimento.pontos_json);
    }, [selectedAtendimento]);

    const mapaPrincipalPontos = useMemo(() => {
        if (tab === "historico" && pontosHistorico.length > 0) return pontosHistorico;
        if (selectedAtendimento && atendimentoSelecionadoPontos.length > 0) return atendimentoSelecionadoPontos;
        return veiculosPontos;
    }, [tab, pontosHistorico, selectedAtendimento, atendimentoSelecionadoPontos, veiculosPontos]);

    const veiculoSelecionado = useMemo(() => {
        const placa = normalizePlaca(selectedPlaca || selectedAtendimento?.placa || "");
        if (!placa) return null;
        return veiculos.find((v) => normalizePlaca(v.placa) === placa) || null;
    }, [veiculos, selectedPlaca, selectedAtendimento]);

    const veiculoModal = useMemo(() => {
        const placa = normalizePlaca(modalPlaca);
        if (!placa) return null;
        return veiculos.find((v) => normalizePlaca(v.placa) === placa) || null;
    }, [veiculos, modalPlaca]);

    const rowsFiltradas = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return rows.filter((r) => {
            if (somenteComPlaca && !normalizePlaca(r.placa || "")) return false;
            if (filtroTipo !== "todos" && String(r.tipo || "") !== filtroTipo) return false;
            if (!q) return true;

            const alvo = [
                r.id,
                r.sepultamento_id,
                r.falecido,
                r.agente,
                r.tipo,
                r.veiculo_nome,
                r.placa,
                r.nome_motorista,
                r.observacao,
            ].join(" ").toLowerCase();

            return alvo.includes(q);
        });
    }, [rows, busca, filtroTipo, somenteComPlaca]);

    const kpis = useMemo(() => {
        const emMovimento = veiculos.filter((v) => statusVeiculo(v).label === "Em movimento").length;
        const ligados = veiculos.filter((v) => Number(v.ignicao) === 1).length;
        const atendComPlaca = rows.filter((r) => normalizePlaca(r.placa || "")).length;
        const hoje = new Date().toLocaleDateString("pt-BR");

        return {
            veiculos: veiculos.length,
            emMovimento,
            ligados,
            atendimentos: rows.length,
            atendComPlaca,
            hoje,
        };
    }, [veiculos, rows]);

    const resumoHistorico = useMemo(() => {
        const pos = historico?.posicoes ?? [];
        if (!pos.length) return null;

        const velocidades = pos.map((p) => Number(p.velocidade)).filter(Number.isFinite);
        const vmax = velocidades.length ? Math.max(...velocidades) : 0;
        const vmed = velocidades.length ? velocidades.reduce((a, b) => a + b, 0) / velocidades.length : 0;
        const hodometros = pos.map((p) => Number(p.hodometro)).filter(Number.isFinite);
        const hIni = hodometros.length ? hodometros[0] : null;
        const hFim = hodometros.length ? hodometros[hodometros.length - 1] : null;

        return {
            total: pos.length,
            vmax,
            vmed,
            hIni,
            hFim,
            distanciaHodometroM: hIni != null && hFim != null ? Math.max(0, hFim - hIni) : null,
            inicio: pos[0]?.dataHoraPosicao ?? pos[0]?.data_hora_posicao,
            fim: pos[pos.length - 1]?.dataHoraPosicao ?? pos[pos.length - 1]?.data_hora_posicao,
        };
    }, [historico]);

    const distanciaVeiculoAtendimento = useMemo(() => {
        const vp = veiculoSelecionado ? veiculoPonto(veiculoSelecionado) : null;
        const ap = atendimentoSelecionadoPontos[atendimentoSelecionadoPontos.length - 1] || atendimentoSelecionadoPontos[0];
        return distanciaEntreKm(vp, ap);
    }, [veiculoSelecionado, atendimentoSelecionadoPontos]);

    return (
        <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-6">
            <section className="mb-5 rounded-2xl border bg-white p-3 shadow-sm md:p-4">
                {tab === "ao_vivo" ? (
                    <LiveVehiclesMap
                        veiculos={veiculos}
                        selectedPlaca={selectedPlaca}
                        loading={itrackLoading}
                        lastUpdate={ultimaAtualizacaoAoVivo}
                        onSelect={(v) => {
                            const placa = normalizePlaca(v.placa);
                            setSelectedPlaca(placa);
                            setModalPlaca(placa);
                        }}
                        height={520}
                    />
                ) : (
                    <MapRoute pontos={mapaPrincipalPontos} height={520} showSummary={mapaPrincipalPontos.length > 1} />
                )}

                {mapaPrincipalPontos.length === 0 && tab !== "ao_vivo" && (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                        Clique em <strong>Onde estão os veículos</strong> para carregar as posições atuais.
                    </div>
                )}

                <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="grid flex-1 gap-2 sm:grid-cols-3">
                        <KPI label="Veículos localizados" value={String(kpis.veiculos)} />
                        <KPI label="Em movimento" value={String(kpis.emMovimento)} />
                        <KPI label="Ignição ligada" value={String(kpis.ligados)} />
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                        <button
                            onClick={() => {
                                setTab("ao_vivo");
                                fetchVeiculos(false);
                            }}
                            disabled={itrackLoading}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                            {itrackLoading ? "Consultando..." : "Onde estão os veículos"}
                        </button>

                        <button
                            onClick={carregarTudo}
                            disabled={loading || itrackLoading}
                            className="rounded-xl border bg-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                        >
                            Atualizar tudo
                        </button>

                        <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">
                            <input
                                type="checkbox"
                                checked={usarCacheVeiculos}
                                onChange={(e) => setUsarCacheVeiculos(e.target.checked)}
                            />
                            cache
                        </label>

                        <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">
                            <input
                                type="checkbox"
                                checked={tempoRealAtivo}
                                onChange={(e) => setTempoRealAtivo(e.target.checked)}
                            />
                            tempo real
                        </label>

                        <select
                            value={intervaloTempoRealMs}
                            onChange={(e) => setIntervaloTempoRealMs(Number(e.target.value))}
                            className="rounded-lg border px-3 py-2"
                            title="Intervalo de atualização"
                        >
                            <option value={5000}>5s</option>
                            <option value={10000}>10s</option>
                            <option value={15000}>15s</option>
                            <option value={30000}>30s</option>
                            <option value={60000}>60s</option>
                        </select>

                        <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">
                            <input
                                type="checkbox"
                                checked={salvarConsultas}
                                onChange={(e) => setSalvarConsultas(e.target.checked)}
                            />
                            salvar
                        </label>
                    </div>
                </div>
            </section>

            {msg && (
                <div className="mb-5 rounded-xl border bg-white p-3 text-sm text-slate-700 shadow-sm">
                    {msg}
                </div>
            )}

            <VehicleSpeedModal
                veiculo={veiculoModal}
                lastUpdate={ultimaAtualizacaoAoVivo}
                onClose={() => setModalPlaca("")}
            />

            <nav className="mb-5 flex flex-wrap gap-2">
                <TabButton active={tab === "ao_vivo"} onClick={() => {
                    setTab("ao_vivo");
                    if (veiculos.length === 0) fetchVeiculos(false);
                }}>
                    🚗 Veículos ao vivo
                </TabButton>
                <TabButton active={tab === "atendimentos"} onClick={() => setTab("atendimentos")}>
                    Atendimentos funerários
                </TabButton>
                <TabButton active={tab === "historico"} onClick={() => setTab("historico")}>
                    Histórico da placa
                </TabButton>
                <TabButton active={tab === "distancias"} onClick={() => setTab("distancias")}>
                    Distâncias/hodômetro
                </TabButton>
            </nav>

            {tab === "ao_vivo" && (
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Frota iTrack</h2>

                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                            <span>{veiculos.length} veículo(s)</span>
                            <span>•</span>
                            <span>{tempoRealAtivo ? `tempo real ${Math.round(intervaloTempoRealMs / 1000)}s` : "tempo real pausado"}</span>
                            <span>•</span>
                            <span>última atualização: {ultimaAtualizacaoAoVivo ? ultimaAtualizacaoAoVivo.toLocaleTimeString("pt-BR") : "-"}</span>
                        </div>
                    </div>

                    {veiculos.length === 0 ? (
                        <EmptyState
                            title="Nenhum veículo carregado"
                            text="Clique em 'Onde estão os veículos' para consultar a iTrack."
                        />
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {veiculos.map((v, idx) => {
                                const st = statusVeiculo(v);
                                const eventos = veiculoEventos(v);

                                return (
                                    <div key={`${v.placa}-${idx}`} className="rounded-2xl border p-4">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-lg font-bold">{placaComTraco(v.placa)}</div>
                                                <div className="text-sm text-slate-600">{veiculoDescricao(v)}</div>
                                                <div className="mt-1 text-xs text-slate-500">Cliente: {veiculoCliente(v)}</div>
                                            </div>

                                            <Badge tone={st.tone}>{st.label}</Badge>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            <KPI label="Vel." value={fmtKmH(v.velocidade)} compact />
                                            <KPI label="Ignição" value={Number(v.ignicao) === 1 ? "Ligada" : "Deslig."} compact />
                                            <KPI label="GPS" value={String(v.gps ?? "-")} compact />
                                        </div>

                                        <div className="mt-3 space-y-1 text-xs text-slate-500">
                                            <div>Rastreador: {veiculoRastreador(v)}</div>
                                            <div>Motorista: {veiculoMotorista(v)}</div>
                                            <div>Última posição: {fmtDataHora(veiculoDataPosicao(v))}</div>
                                            <div>Localização: {v.localizacao || "-"}</div>
                                            <div>Hodômetro: {v.hodometro != null ? fmtM(v.hodometro) : "-"}</div>
                                        </div>

                                        {eventos.length > 0 && (
                                            <div className="mt-3 rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
                                                {eventos.map((ev, i) => (
                                                    <div key={i}>
                                                        {ev.idEvento ? `${ev.idEvento} - ` : ""}
                                                        {ev.descricaoEvento || "Evento"}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedPlaca(normalizePlaca(v.placa));
                                                    setTab("historico");
                                                }}
                                                className="rounded-xl border px-3 py-2 text-xs font-medium"
                                            >
                                                usar placa
                                            </button>

                                            <button
                                                onClick={() => fetchHistorico(v.placa)}
                                                disabled={itrackLoading}
                                                className="rounded-xl border px-3 py-2 text-xs font-medium disabled:opacity-60"
                                            >
                                                histórico hoje
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {tab === "atendimentos" && (
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Atendimentos funerários</h2>

                        </div>

                        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                            <input
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder="Buscar por falecido, placa, agente..."
                                className="rounded-xl border px-3 py-2 text-sm"
                            />

                            <select
                                value={filtroTipo}
                                onChange={(e) => setFiltroTipo(e.target.value)}
                                className="rounded-xl border px-3 py-2 text-sm"
                            >
                                <option value="todos">Todos os tipos</option>
                                <option value="remocao">Remoção</option>
                                <option value="para_velorio">Para velório</option>
                                <option value="para_sepultamento">Para sepultamento</option>
                            </select>

                            <label className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={somenteComPlaca}
                                    onChange={(e) => setSomenteComPlaca(e.target.checked)}
                                />
                                com placa
                            </label>
                        </div>
                    </div>

                    {rowsFiltradas.length === 0 ? (
                        <EmptyState title="Nenhum atendimento encontrado" text="Ajuste os filtros ou atualize os serviços." />
                    ) : (
                        <div className="space-y-3">
                            {rowsFiltradas.map((row) => {
                                const selected = selectedAtendimentoId === row.id;
                                const pontos = parsePontosJson(row.pontos_json);

                                return (
                                    <div
                                        key={row.id}
                                        className={`rounded-2xl border p-4 ${selected ? "border-slate-900 bg-slate-50" : "bg-white"}`}
                                    >
                                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-lg font-semibold">{row.falecido || "Sem falecido"}</h3>
                                                    <Badge tone="slate">#{row.id}</Badge>
                                                    <Badge tone="blue">{tipoLabel(row.tipo)}</Badge>
                                                    {row.placa && <Badge tone="emerald">{placaComTraco(row.placa)}</Badge>}
                                                </div>

                                                <div className="mt-1 text-sm text-slate-600">
                                                    {row.veiculo_nome || "Sem veículo"} {row.agente ? `• Agente: ${row.agente}` : ""}
                                                </div>

                                                <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                                                    <div>Sepultamento: {row.sepultamento_id ?? "-"}</div>
                                                    <div>Motorista: {row.nome_motorista ?? "-"}</div>
                                                    <div>Início: {fmtDataHora(row.inicio_iso || row.inicio_ts)}</div>
                                                    <div>Fim: {fmtDataHora(row.fim_iso || row.fim_ts)}</div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:min-w-[420px]">
                                                <KPI label="Distância" value={fmtKm(row.distancia_km)} compact />
                                                <KPI label="Vel. média" value={fmtKmH(row.velocidade_media)} compact />
                                                <KPI label="Vel. máx." value={fmtKmH(row.velocidade_max)} compact />
                                                <KPI label="Duração" value={fmtDur(row.duracao_s)} compact />
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                onClick={() => selecionarAtendimento(row)}
                                                className="rounded-xl border px-3 py-2 text-xs font-medium"
                                            >
                                                selecionar
                                            </button>

                                            <button
                                                onClick={() => consultarAtendimentoCompleto(row)}
                                                disabled={itrackLoading || !row.placa}
                                                className="rounded-xl border px-3 py-2 text-xs font-medium disabled:opacity-60"
                                            >
                                                consultar iTrack
                                            </button>

                                            {pontos.length > 0 && (
                                                <button
                                                    onClick={() => {
                                                        selecionarAtendimento(row);
                                                        setTab("atendimentos");
                                                    }}
                                                    className="rounded-xl border px-3 py-2 text-xs font-medium"
                                                >
                                                    ver rota no mapa
                                                </button>
                                            )}
                                        </div>

                                        {selected && (
                                            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_280px]">
                                                <MapRoute pontos={pontos} height={260} />
                                                <div className="rounded-xl bg-white p-3 text-xs text-slate-600">
                                                    <div className="font-semibold text-slate-800">Detalhes operacionais</div>
                                                    <div className="mt-2">Rastreador iTrack: {row.id_rastreador_itrack ?? "-"}</div>
                                                    <div>Hod. inicial: {row.hodometro_inicial != null ? fmtM(row.hodometro_inicial) : "-"}</div>
                                                    <div>Hod. final: {row.hodometro_final != null ? fmtM(row.hodometro_final) : "-"}</div>
                                                    <div>Dist. hodômetro: {row.distancia_hodometro_m != null ? fmtM(row.distancia_hodometro_m) : "-"}</div>
                                                    <div>Origem: {row.origem_dados ?? row.origem ?? "-"}</div>
                                                    {row.observacao && <div className="mt-2">Obs.: {row.observacao}</div>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {tab === "historico" && (
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Histórico detalhado da placa</h2>

                        </div>
                        <div className="text-sm text-slate-500">
                            Placa: <strong>{placaComTraco(selectedPlaca || historico?.veiculo?.placa)}</strong>
                        </div>
                    </div>

                    {!historico ? (
                        <EmptyState title="Nenhum histórico carregado" text="Informe uma placa ou selecione um atendimento e clique em histórico." />
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-2xl border p-4">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <h3 className="font-semibold">{historico.veiculo?.descricao ?? "Veículo"}</h3>
                                        <p className="text-sm text-slate-500">
                                            {historico.veiculo?.marca || ""} {historico.veiculo?.modelo || ""} {historico.veiculo?.ano ? `• ${historico.veiculo.ano}` : ""}
                                        </p>
                                    </div>

                                    <div className="text-xs text-slate-500 md:text-right">
                                        <div>Início: {fmtDataHora(resumoHistorico?.inicio)}</div>
                                        <div>Fim: {fmtDataHora(resumoHistorico?.fim)}</div>
                                    </div>
                                </div>

                                {resumoHistorico && (
                                    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
                                        <KPI label="Posições" value={String(resumoHistorico.total)} />
                                        <KPI label="Vel. média" value={fmtKmH(resumoHistorico.vmed)} />
                                        <KPI label="Vel. máx." value={fmtKmH(resumoHistorico.vmax)} />
                                        <KPI label="Hod. inicial" value={resumoHistorico.hIni != null ? fmtM(resumoHistorico.hIni) : "-"} />
                                        <KPI label="Hod. final" value={resumoHistorico.hFim != null ? fmtM(resumoHistorico.hFim) : "-"} />
                                    </div>
                                )}
                            </div>

                            <MapRoute pontos={pontosHistorico} height={430} />

                            {pontosHistorico.length === 0 && (
                                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                                    A iTrack retornou histórico sem latitude/longitude no período.
                                </div>
                            )}

                            {Array.isArray(historico.posicoes) && historico.posicoes.length > 0 && (
                                <div className="overflow-x-auto rounded-2xl border">
                                    <table className="min-w-full text-left text-sm">
                                        <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                                            <tr>
                                                <th className="px-3 py-2">Data/hora</th>
                                                <th className="px-3 py-2">Localização</th>
                                                <th className="px-3 py-2">Vel.</th>
                                                <th className="px-3 py-2">Ignição</th>
                                                <th className="px-3 py-2">GPS</th>
                                                <th className="px-3 py-2">Hodômetro</th>
                                                <th className="px-3 py-2">Eventos</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historico.posicoes.slice(0, 250).map((p, idx) => (
                                                <tr key={idx} className="border-b last:border-0">
                                                    <td className="px-3 py-2 text-xs">{fmtDataHora(p.dataHoraPosicao ?? p.data_hora_posicao)}</td>
                                                    <td className="px-3 py-2">{p.localizacao || "-"}</td>
                                                    <td className="px-3 py-2">{fmtKmH(p.velocidade)}</td>
                                                    <td className="px-3 py-2">{Number(p.ignicao) === 1 ? "Ligada" : "Desligada"}</td>
                                                    <td className="px-3 py-2">{p.gps ?? "-"}</td>
                                                    <td className="px-3 py-2">{p.hodometro != null ? fmtM(p.hodometro) : "-"}</td>
                                                    <td className="px-3 py-2 text-xs">
                                                        {(p.eventos || []).map((e) => e.descricaoEvento).filter(Boolean).join(", ") || "-"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </section>
            )}

            {tab === "distancias" && (
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Distância por hodômetro</h2>

                        </div>

                        <button
                            onClick={() => fetchDistancia()}
                            disabled={itrackLoading || !selectedPlaca}
                            className="rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-60"
                        >
                            Atualizar distância
                        </button>
                    </div>

                    {distancias.length === 0 ? (
                        <EmptyState title="Nenhuma distância carregada" text="Consulte a distância de uma placa ou de um atendimento." />
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border">
                            <table className="min-w-full text-left text-sm">
                                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2">Placa</th>
                                        <th className="px-3 py-2">Veículo</th>
                                        <th className="px-3 py-2">Cliente</th>
                                        <th className="px-3 py-2">Distância</th>
                                        <th className="px-3 py-2">Hod. inicial</th>
                                        <th className="px-3 py-2">Hod. final</th>
                                        <th className="px-3 py-2">Período</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {distancias.map((d, idx) => (
                                        <tr key={`${d.placa}-${d.id ?? idx}`} className="border-b last:border-0">
                                            <td className="px-3 py-2 font-medium">{placaComTraco(d.placa ?? selectedPlaca)}</td>
                                            <td className="px-3 py-2">{d.descricaoVeiculo ?? d.descricao_veiculo ?? "-"}</td>
                                            <td className="px-3 py-2">{d.cliente ?? "-"}</td>
                                            <td className="px-3 py-2 font-semibold">{fmtKm(distanciaKm(d))}</td>
                                            <td className="px-3 py-2">{fmtM(d.hodometroInicial ?? d.hodometro_inicial)}</td>
                                            <td className="px-3 py-2">{fmtM(d.hodometroFinal ?? d.hodometro_final)}</td>
                                            <td className="px-3 py-2 text-xs text-slate-500">
                                                {fmtDataHora(d.data_inicio)} até {fmtDataHora(d.data_fim)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}


function VehicleSpeedModal({
    veiculo,
    lastUpdate,
    onClose,
}: {
    veiculo: ItrackVeiculo | null;
    lastUpdate?: Date | null;
    onClose: () => void;
}) {
    if (!veiculo) return null;

    const velocidade = Math.max(0, Number(veiculo.velocidade || 0));
    const maxSpeed = 180;
    const pct = Math.min(1, velocidade / maxSpeed);
    const angle = -130 + pct * 260;
    const st = statusVeiculo(veiculo);

    return (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center">
            <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-cyan-200/20 bg-slate-950 text-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Painel do veículo</div>
                        <div className="mt-1 text-lg font-black leading-tight">{veiculoDescricao(veiculo)}</div>
                        <div className="text-sm text-slate-300">{placaComTraco(veiculo.placa)}</div>
                    </div>
                    <button
                        onClick={onClose}
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/10 text-xl font-bold hover:bg-white/20"
                        aria-label="Fechar"
                    >
                        ×
                    </button>
                </div>

                <div className="p-5">
                    <div className="mx-auto flex aspect-square max-w-[310px] items-center justify-center rounded-full border border-cyan-200/15 bg-[radial-gradient(circle_at_center,_#1e293b_0%,_#020617_62%,_#000_100%)] p-5 shadow-[0_0_45px_rgba(34,211,238,0.20)]">
                        <div className="relative h-full w-full rounded-full border border-white/10 bg-slate-900/60">
                            <div className="absolute inset-5 rounded-full border border-cyan-300/10" />

                            {Array.from({ length: 10 }).map((_, i) => {
                                const a = -130 + i * (260 / 9);
                                const major = i % 3 === 0;
                                return (
                                    <div
                                        key={i}
                                        className="absolute left-1/2 top-1/2 origin-left"
                                        style={{ transform: `rotate(${a}deg) translateX(92px)` }}
                                    >
                                        <div className={`${major ? "h-1.5 w-7" : "h-1 w-4"} rounded-full bg-cyan-200/70`} />
                                    </div>
                                );
                            })}

                            <div className="absolute inset-x-0 top-[18%] text-center text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                                km/h
                            </div>

                            <div
                                className="absolute left-1/2 top-1/2 h-1.5 w-[38%] origin-left rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.8)] transition-transform duration-500"
                                style={{ transform: `rotate(${angle}deg) translateY(-50%)` }}
                            />
                            <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-cyan-200 bg-slate-950 shadow-[0_0_18px_rgba(103,232,249,0.75)]" />

                            <div className="absolute inset-x-0 bottom-[22%] text-center">
                                <div className="font-mono text-6xl font-black tabular-nums text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]">
                                    {velocidade.toFixed(0)}
                                </div>
                                <div className="mt-1 text-sm font-semibold text-cyan-200">{fmtKmH(velocidade)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">Motorista</span>
                            <span className="text-right font-semibold">{veiculoMotorista(veiculo)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">Status</span>
                            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold">{st.label}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">Ignição</span>
                            <span className="font-semibold">{Number(veiculo.ignicao) === 1 ? "Ligada" : "Desligada"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400">Atualizado</span>
                            <span className="text-right font-semibold">{lastUpdate ? lastUpdate.toLocaleTimeString("pt-BR") : fmtDataHora(veiculoDataPosicao(veiculo))}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ======================= Componentes menores ======================= */
function KPI({
    label,
    value,
    sub,
    compact = false,
}: {
    label: string;
    value: string;
    sub?: string;
    compact?: boolean;
}) {
    return (
        <div className={`rounded-xl border bg-white text-center ${compact ? "p-2" : "p-3"}`}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`${compact ? "text-sm" : "text-xl"} font-semibold`}>{value}</div>
            {sub && <div className="text-xs text-slate-400">{sub}</div>}
        </div>
    );
}

function Badge({
    children,
    tone = "slate",
}: {
    children: React.ReactNode;
    tone?: string;
}) {
    const cls =
        tone === "emerald"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : tone === "amber"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : tone === "blue"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-slate-50 text-slate-700 border-slate-200";

    return (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
            {children}
        </span>
    );
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`rounded-xl border px-4 py-2 text-sm font-medium ${active ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700"
                }`}
        >
            {children}
        </button>
    );
}

function EmptyState({ title, text }: { title: string; text: string }) {
    return (
        <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center">
            <div className="font-semibold text-slate-700">{title}</div>
            <div className="mt-1 text-sm text-slate-500">{text}</div>
        </div>
    );
}
