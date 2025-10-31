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
                v = Number(p.spd_ms) * 3.6; // m/s -> km/h
            } else if (p?.spd_kmh != null && Number.isFinite(Number(p.spd_kmh))) {
                v = Number(p.spd_kmh);
            } else if (p?.v != null && Number.isFinite(Number(p.v))) {
                v = Number(p.v); // assuma km/h
            }

            return { lat, lng, t, v };
        })
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

/* ======================= IndexedDB (fila offline) ======================= */
// DB: telemetria_db / store: queue
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
        } catch (e) {
            // deixa na fila
        }
    }
    if (successes.length) await idbDelete(successes);
}

/**
 * NO-OP: removido uso de Service Worker/SyncManager deste arquivo.
 * O flush continuará acontecendo via listener 'online' abaixo.
 */
async function registerBackgroundSync() {
    // intencionalmente vazio
}

/* ======================= Coleta (watchPosition + Wake Lock) ======================= */
let watchId: number | null = null;
let wakeLock: any | null = null;

async function requestWakeLock() {
    try {
        // Mantém a tela ligada enquanto grava (PWA não coleta de tela realmente apagada na maioria dos browsers)
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

/* ======================= Agregadores ======================= */
function mergePontos(list: TelemetriaRegistro[]): Ponto[] {
    const out: Ponto[] = [];
    list.forEach((r) => { out.push(...parsePontosJson(r.pontos_json)); });
    return out;
}
function sumStats(list: TelemetriaRegistro[]) {
    const dist = list.reduce((a, r) => a + n(r.distancia_km, 0), 0);
    const dur = list.reduce((a, r) => a + n(r.duracao_s, 0), 0);
    const vmax = list.reduce((m, r) => Math.max(m, n(r.velocidade_max, 0)), 0);
    const vmed = dur > 0 ? dist / (dur / 3600) : 0;
    return { dist, dur, vmax, vmed };
}
function titleForTab(tab: TipoTab) {
    switch (tab) {
        case "remocao": return "Remoção";
        case "para_velorio": return "Transporte para Velório";
        case "para_sepultamento": return "Transporte para Sepultamento";
        default: return "Geral";
    }
}

/* ======================= Página ======================= */
export default function TelemetriaPage() {
    const [rows, setRows] = useState<TelemetriaRegistro[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    // filtros
    const [fltVeiculo, setFltVeiculo] = useState<string>("");
    const [fltAgente, setFltAgente] = useState<string>("");
    const [fltFalecido, setFltFalecido] = useState<string>("");

    // UI seleção
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TipoTab>("geral");

    // coleta local
    const pontosSessionRef = useRef<Ponto[]>([]);
    const [gravando, setGravando] = useState(false);
    const [amostras, setAmostras] = useState(0);

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

    // Filtros de pesquisa para veiculos
    const allVeiculos = useMemo(() => {
        const s = new Set<string>();
        rows.forEach((r) => { if (r.veiculo_nome) s.add(r.veiculo_nome); });
        return Array.from(s).sort((a, b) => a.localeCompare(b));
    }, [rows]);

    const allAgentes = useMemo(() => {
        const s = new Set<string>();
        rows.forEach((r) => { if (r.agente) s.add(r.agente); });
        return Array.from(s).sort((a, b) => a.localeCompare(b));
    }, [rows]);

    const filtered = useMemo(() => {
        const qAg = fltAgente.trim().toLowerCase();
        const qFa = fltFalecido.trim().toLowerCase();
        const qVe = fltVeiculo.trim();
        return rows.filter((r) => {
            const okVeiculo = qVe ? (r.veiculo_nome || "") === qVe : true;
            const okAgente = qAg ? (r.agente || "").toLowerCase().includes(qAg) : true;
            const okFalecido = qFa ? (r.falecido || "").toLowerCase().includes(qFa) : true;
            return okVeiculo && okAgente && okFalecido;
        });
    }, [rows, fltAgente, fltFalecido, fltVeiculo]);

    // Agrupa
    type Group = { key: string; sepultamento_id: number | null; falecido: string; agentes: string[]; veiculos: string[]; sessions: TelemetriaRegistro[]; };

    const groups = useMemo<Group[]>(() => {
        const map = new Map<string, Group>();
        filtered.forEach((r) => {
            const key = `${r.sepultamento_id ?? "null"}::${r.falecido ?? ""}`;
            const g = map.get(key) ?? { key, sepultamento_id: r.sepultamento_id ?? null, falecido: r.falecido ?? "(sem nome)", agentes: [], veiculos: [], sessions: [] };
            g.sessions.push(r);
            if (r.agente && !g.agentes.includes(r.agente)) g.agentes.push(r.agente);
            if (r.veiculo_nome && !g.veiculos.includes(r.veiculo_nome)) g.veiculos.push(r.veiculo_nome);
            map.set(key, g);
        });
        const arr = Array.from(map.values());
        arr.sort((a, b) => {
            const aMax = Math.max(...a.sessions.map((x) => x.id));
            const bMax = Math.max(...b.sessions.map((x) => x.id));
            return bMax - aMax;
        });
        return arr;
    }, [filtered]);

    const resumo = useMemo(() => {
        const dist = filtered.reduce((a, r) => a + n(r.distancia_km, 0), 0);
        const dur = filtered.reduce((a, r) => a + n(r.duracao_s, 0), 0);
        const vmax = filtered.reduce((m, r) => Math.max(m, n(r.velocidade_max, 0)), 0);
        const vmed = dur > 0 ? dist / (dur / 3600) : 0;
        return { total: groups.length, dist, dur, vmax, vmed };
    }, [filtered, groups.length]);

    /* ---------- Coleta: iniciar/parar ---------- */
    const iniciarGravacao = async () => {
        if (!("geolocation" in navigator)) { alert("Geolocalização não disponível."); return; }
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

    const encerrarEEnfileirar = async (payloadBase: any) => {
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

        // Enfileira no IDB e tenta enviar agora
        await idbAdd({ createdAt: Date.now(), payload: body });
        await flushQueueOnce();
        await registerBackgroundSync(); // no-op
        pontosSessionRef.current = [];
        setAmostras(0);
        // Recarrega lista
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
                                    tipo: "para_sepultamento", // ajuste conforme fluxo
                                    sepultamento_id: 0,        // ajuste conforme fluxo
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

            {/* Filtros */}
            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                    <label className="mb-1 block text-xs text-slate-500">Veículo</label>
                    <select className="w-full rounded-md border px-3 py-2 text-sm" value={fltVeiculo} onChange={(e) => setFltVeiculo(e.target.value)}>
                        <option value="">Todos</option>
                        {allVeiculos.map((v) => (<option key={v} value={v}>{v}</option>))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-xs text-slate-500">Agente</label>
                    <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Filtrar por agente..." value={fltAgente} onChange={(e) => setFltAgente(e.target.value)} list="agentes-sug" />
                    <datalist id="agentes-sug">
                        {allAgentes.map((a) => (<option key={a} value={a} />))}
                    </datalist>
                </div>
                <div>
                    <label className="mb-1 block text-xs text-slate-500">Falecido(a)</label>
                    <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Filtrar por falecido(a)..." value={fltFalecido} onChange={(e) => setFltFalecido(e.target.value)} />
                </div>
            </div>

            {/* KPIs gerais */}
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KPI label="Registros (agrupados)" value={String(resumo.total)} />
                <KPI label="Distância total" value={fmtKm(resumo.dist)} />
                <KPI label="Tempo total" value={fmtDur(resumo.dur)} />
                <KPI label="Velocidade" value={fmtKmH(resumo.vmed)} sub={`V. Máxima: ${fmtKmH(resumo.vmax)}`} />
            </div>

            {msg && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}

            {/* LISTA */}
            <div className="space-y-4">
                {groups.map((g) => {
                    const isOpen = openKey === g.key;
                    const listRem = g.sessions.filter((s) => s.tipo === "remocao");
                    const listVel = g.sessions.filter((s) => s.tipo === "para_velorio");
                    const listSep = g.sessions.filter((s) => s.tipo === "para_sepultamento");
                    const listAll = g.sessions;
                    const currentList = activeTab === "remocao" ? listRem : activeTab === "para_velorio" ? listVel : activeTab === "para_sepultamento" ? listSep : listAll;
                    const stats = sumStats(currentList);
                    const pontos = mergePontos(currentList);

                    return (
                        <div key={g.key} className="rounded-2xl border bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-lg font-semibold truncate">{g.falecido || "Falecido(a) — não informado"}</div>
                                    <div className="mt-0.5 text-xs text-slate-500">
                                        {g.agentes.length > 0 && <>Agente(s): <b>{g.agentes.join(", ")}</b>{" • "}</>}
                                        {g.veiculos.length > 0 && <>Veículo(s): <b>{g.veiculos.join(", ")}</b></>}
                                    </div>
                                </div>
                                <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
                                    onClick={() => { setOpenKey(isOpen ? null : g.key); if (!isOpen && !activeTab) setActiveTab("geral"); }}>
                                    {isOpen ? "Fechar" : "Ver detalhes"}
                                </button>
                            </div>

                            {isOpen && (
                                <div className="mt-4">
                                    <div className="mb-3 flex flex-wrap gap-2">
                                        {(["remocao", "para_velorio", "para_sepultamento", "geral"] as TipoTab[]).map((tab) => (
                                            <button key={tab}
                                                className={`rounded-full border px-3 py-1 text-xs ${activeTab === tab ? "bg-primary text-primary-foreground" : "hover:bg-slate-50"}`}
                                                onClick={() => setActiveTab(tab)}>
                                                {titleForTab(tab)}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                        <div className="lg:col-span-2">
                                            {pontos.length >= 2 ? <MapRoute pontos={pontos} /> : <MiniMap pontos={pontos} />}
                                            <div className="mt-1 text-xs text-slate-500">
                                                {currentList.length > 0 ? (
                                                    <>Início: {fmtDataHora(currentList[0].inicio_iso || currentList[0].criado_em)} • Fim: {fmtDataHora(currentList[currentList.length - 1].fim_iso || currentList[currentList.length - 1].atualizado_em)} • {pontos.length} ponto(s)</>
                                                ) : "Sem datas registradas para este filtro."}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <KPI label="Distância" value={fmtKm(stats.dist)} />
                                            <KPI label="Duração" value={fmtDur(stats.dur)} />
                                            <KPI label="V. Média" value={fmtKmH(stats.vmed)} />
                                            <KPI label="V. Máxima" value={fmtKmH(stats.vmax)} />
                                            <KPI label="Paradas" value={String(currentList.reduce((a, r) => a + n(r.paradas, 0), 0))} />
                                            <KPI label="Eventos" value={`${currentList.reduce((a, r) => a + n(r.acel_fortes, 0), 0)} acel / ${currentList.reduce((a, r) => a + n(r.frenagens_fortes, 0), 0)} freios`} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {groups.length === 0 && !loading && (
                    <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
                        Nenhum registro encontrado com os filtros atuais.
                    </div>
                )}
            </div>
        </div>
    );
}
