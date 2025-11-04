"use client";

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { API } from "../acompanhamento/components/constants";
import MapRoute from "./MapRoute";

/* ======================= Tipos ======================= */
type Ponto = { lat: number; lng: number; t?: number; v?: number };

type TelemetriaRegistro = {
    id: number;
    sepultamento_id: number | null;
    agente: string | null;
    falecido: string | null;
    tipo?: "remocao" | "para_velorio" | "para_sepultamento" | string;
    veiculo_nome?: string | null;
    veiculo_obs?: string | null;
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
    pontos_json?: string | null | any[];
    eventos_json?: string | null;
    extra_json?: string | null;
    criado_em?: string | null;
    atualizado_em?: string | null;
};

type TipoTab = "remocao" | "para_velorio" | "para_sepultamento" | "geral";

/* ======================= Helpers ======================= */
const isFiniteNum = (v: any): v is number => Number.isFinite(Number(v));
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

/** Parse coerente (sem heurística de v<60) e ordenado por tempo. */
function parsePontosJson(pontos_json?: string | null | any[]): Ponto[] {
    if (!pontos_json) return [];
    let arr: any[] | null = null;

    if (Array.isArray(pontos_json)) {
        arr = pontos_json as any[];
    } else if (typeof pontos_json === "string") {
        try {
            const parsed = JSON.parse(pontos_json);
            arr = Array.isArray(parsed) ? parsed : null;
        } catch {
            arr = null;
        }
    }

    if (!arr) return [];

    return arr
        .map((p: any) => {
            const lat = Number(p?.lat ?? p?.latitude);
            const lng = Number(p?.lng ?? p?.longitude);
            const tRaw = p?.t ?? p?.ts ?? p?.timestamp;
            const t = tRaw != null ? Number(tRaw) : undefined;

            let v: number | undefined;
            if (p?.spd_ms != null && Number.isFinite(Number(p.spd_ms))) {
                v = Number(p.spd_ms) * 3.6;
            } else if (p?.spd_kmh != null && Number.isFinite(Number(p.spd_kmh))) {
                v = Number(p.spd_kmh);
            } else if (p?.v != null && Number.isFinite(Number(p.v))) {
                v = Number(p.v);
            }

            return { lat, lng, t, v };
        })
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

/* ======================= IndexedDB (fila offline) ======================= */
function idbOpen(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
        const req = indexedDB.open("telemetria_db", 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("queue")) {
                db.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
            }
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
}
async function idbAdd(item: any) {
    const db = await idbOpen();
    await new Promise<void>((res, rej) => {
        const tx = db.transaction("queue", "readwrite");
        tx.objectStore("queue").add(item);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
    db.close();
}
async function idbAll(): Promise<any[]> {
    const db = await idbOpen();
    const items = await new Promise<any[]>((res, rej) => {
        const tx = db.transaction("queue", "readonly");
        const req = tx.objectStore("queue").getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => rej(req.error);
    });
    db.close();
    return items;
}
async function idbDelete(ids: number[]) {
    if (!ids.length) return;
    const db = await idbOpen();
    await new Promise<void>((res, rej) => {
        const tx = db.transaction("queue", "readwrite");
        const store = tx.objectStore("queue");
        ids.forEach((id) => store.delete(id));
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
    db.close();
}

/* ======================= Envio com retry ======================= */
async function postJSON(body: any) {
    const r = await fetch(`${API}/api/php/telemetria.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

async function flushQueueOnce() {
    const items = await idbAll();
    const successes: number[] = [];
    for (const it of items) {
        try {
            await postJSON(it.payload);
            successes.push(it.id);
        } catch {
            // mantém na fila
        }
    }
    if (successes.length) await idbDelete(successes);
}

async function registerBackgroundSync() {
    // intencionalmente vazio
}

/* ======================= Coleta (watchPosition + Wake Lock) ======================= */
let watchId: number | null = null;
let wakeLock: any | null = null;

async function requestWakeLock() {
    try {
        // Mantém a tela ligada enquanto grava
        // @ts-ignore
        if ("wakeLock" in navigator && (navigator as any).wakeLock) {
            // @ts-ignore
            wakeLock = await (navigator as any).wakeLock.request("screen");
        }
    } catch { }
}
function releaseWakeLock() {
    try { wakeLock?.release?.(); } catch { }
    wakeLock = null;
}

/* ======================= UI menores ======================= */
function KPI({ label, value, sub }: { label: string; value: string; sub?: string; }) {
    return (
        <div className="rounded-xl border p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-semibold">{value}</div>
            {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
    );
}

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
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
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
            <polyline points={d} fill="none" stroke="#0ea5e9" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={pad + (pontos[0].lng - minX) * s} cy={h - pad - (pontos[0].lat - minY) * s} r={5} fill="#10b981" stroke="white" strokeWidth={1.5} />
            <circle cx={pad + (pontos[pontos.length - 1].lng - minX) * s} cy={h - pad - (pontos[pontos.length - 1].lat - minY) * s} r={5} fill="#ef4444" stroke="white" strokeWidth={1.5} />
        </svg>
    );
}

/* ======================= Página ======================= */
export default function TelemetriaPage() {
    const [rows, setRows] = useState<TelemetriaRegistro[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [fltVeiculo, setFltVeiculo] = useState<string>("");
    const [fltAgente, setFltAgente] = useState<string>("");
    const [fltFalecido, setFltFalecido] = useState<string>("");

    const [openKey, setOpenKey] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TipoTab>("geral");

    const pontosSessionRef = useRef<Ponto[]>([]);
    const [gravando, setGravando] = useState(false);
    const [amostras, setAmostras] = useState(0);

    /* ========= 📡 NOVO: Listener para mensagens do Flutter ========== */
    useEffect(() => {
        (window as any).onNativeLocation = (data: any) => {
            try {
                const loc = typeof data === "string" ? JSON.parse(data) : data;
                console.log("📍 Localização recebida do app nativo:", loc);
                // Aqui você pode opcionalmente salvar no IndexedDB ou atualizar o mapa
            } catch (err) {
                console.error("Erro ao processar mensagem nativa:", err);
            }
        };
    }, []);

    /* ================================================================ */

    const normalizeRow = (d: any): TelemetriaRegistro => {
        const velocidade_max = d.velocidade_max ?? d.vel_max_kmh ?? d.vel_max ?? null;
        const velocidade_media = d.velocidade_media ?? d.vel_media_kmh ?? d.vel_media ?? null;
        const distancia_km = d.distancia_km ?? d.distancia_total_km ?? null;
        const duracao_s = d.duracao_s ?? d.duracao_seg ?? null;
        const inicio_iso = d.inicio_iso ?? d.inicio_ts ?? d.inicio ?? null;
        const fim_iso = d.fim_iso ?? d.fim_ts ?? d.fim ?? null;
        const pontos_json = d.pontos_json ?? d.pontos ?? null;

        return {
            id: Number(d.id),
            sepultamento_id: d.sepultamento_id != null ? Number(d.sepultamento_id) : null,
            agente: d.agente ?? d.usuario ?? null,
            falecido: d.falecido ?? d.nome ?? null,
            tipo: d.tipo ?? null,
            veiculo_nome: d.veiculo_nome ?? null,
            veiculo_obs: d.veiculo_obs ?? null,
            inicio_iso, fim_iso,
            velocidade_max: isFiniteNum(velocidade_max) ? Number(velocidade_max) : null,
            velocidade_media: isFiniteNum(velocidade_media) ? Number(velocidade_media) : null,
            distancia_km: isFiniteNum(distancia_km) ? Number(distancia_km) : null,
            duracao_s: isFiniteNum(duracao_s) ? Number(duracao_s) : null,
            paradas: isFiniteNum(d.paradas) ? Number(d.paradas) : null,
            acel_fortes: isFiniteNum(d.acel_fortes) ? Number(d.acel_fortes) : null,
            frenagens_fortes: isFiniteNum(d.frenagens_fortes) ? Number(d.frenagens_fortes) : null,
            origem: d.origem ?? d.source_device ?? null,
            observacao: d.observacao ?? d.veiculo_obs ?? null,
            pontos_json,
            eventos_json: d.eventos_json ?? null,
            extra_json: d.extra_json ?? null,
            criado_em: d.criado_em ?? d.created_at ?? null,
            atualizado_em: d.atualizado_em ?? d.updated_at ?? null,
        };
    };

    const fetchRows = useCallback(async () => {
        setLoading(true);
        setMsg(null);
        try {
            const r = await fetch(`${API}/api/php/telemetria.php?listar=1&_t=${Date.now()}`, { credentials: "include", cache: "no-store" });
            const payload: any = await r.json();
            const list: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.dados) ? payload.dados : [];
            if (!Array.isArray(list)) {
                setRows([]); setMsg(payload?.msg || "Nenhum dado.");
            } else {
                setRows(list.map(normalizeRow));
            }
        } catch (e: any) {
            setMsg(e?.message || "Falha ao carregar."); setRows([]);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    /* ---------- 📍 Iniciar gravação ---------- */
    const iniciarGravacao = async () => {
        if (!("geolocation" in navigator)) { alert("Geolocalização não disponível."); return; }

        // 🔹 NOVO: notifica o app Flutter, se estiver rodando dentro do WebView
        if ((window as any).Native) {
            (window as any).Native.postMessage(JSON.stringify({ type: "start_tracking" }));
        }

        pontosSessionRef.current = [];
        setAmostras(0);
        setGravando(true);
        await requestWakeLock();

        watchId = navigator.geolocation.watchPosition(
            pos => {
                const { latitude, longitude, speed } = pos.coords;
                const t = Math.floor(Date.now() / 1000);
                const v = Number.isFinite(speed) ? (speed as number) * 3.6 : undefined;
                const p = { lat: latitude, lng: longitude, t, v };
                pontosSessionRef.current.push(p);
                setAmostras(pontosSessionRef.current.length);
            },
            err => { console.warn("GPS", err); },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
    };

    /* ---------- 📍 Encerrar ---------- */
    const encerrarEEnfileirar = async (payloadBase: any) => {
        // 🔹 NOVO: sinaliza o app Flutter para parar coleta
        if ((window as any).Native) {
            (window as any).Native.postMessage(JSON.stringify({ type: "stop_tracking" }));
        }

        if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        releaseWakeLock();
        setGravando(false);

        const pts = pontosSessionRef.current.slice();
        if (pts.length === 0) { alert("Sem pontos coletados."); return; }

        const body = {
            acao: "inserir",
            ...payloadBase,
            pontos_json: pts,
            amostras: pts.length,
            encerrado: 1,
            source_device: "pwa",
        };

        await idbAdd({ createdAt: Date.now(), payload: body });
        await flushQueueOnce();
        await registerBackgroundSync();
        pontosSessionRef.current = [];
        setAmostras(0);
        fetchRows();
    };

    useEffect(() => {
        const onOnline = () => { flushQueueOnce(); };
        window.addEventListener("online", onOnline);
        return () => window.removeEventListener("online", onOnline);
    }, []);

    /* ---------- render ---------- */
    return (
        <div className="p-6">
            <header className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Relatório de Telemetria</h1>
                    <p className="text-sm text-slate-500">Sessões registradas com rota, velocidades e estatísticas.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="rounded-lg border px-3 py-2 text-sm" onClick={fetchRows} disabled={loading}>
                        {loading ? "Atualizando..." : "Atualizar"}
                    </button>
                    {!gravando ? (
                        <button className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={iniciarGravacao}>
                            Iniciar gravação
                        </button>
                    ) : (
                        <button
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white"
                            onClick={() =>
                                encerrarEEnfileirar({
                                    tipo: "para_sepultamento",
                                    sepultamento_id: 0,
                                    falecido: "Sem nome",
                                    veiculo_nome: "Veículo",
                                })
                            }
                        >
                            Encerrar & enviar ({amostras} pts)
                        </button>
                    )}
                </div>
            </header>

            {/* resto do layout inalterado */}
            {/* ... */}
        </div>
    );
}

