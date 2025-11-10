"use client";

import React, {
    useCallback,
    useEffect,
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

function parsePontosJson(pontos_json?: string | null | any[]): Ponto[] {
    if (!pontos_json) return [];
    let arr: any[] | null = null;

    if (Array.isArray(pontos_json)) arr = pontos_json;
    else if (typeof pontos_json === "string") {
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
            if (p?.spd_ms != null) v = Number(p.spd_ms) * 3.6;
            else if (p?.spd_kmh != null) v = Number(p.spd_kmh);
            else if (p?.v != null) v = Number(p.v);

            return { lat, lng, t, v };
        })
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

function normalizeRow(raw: any): TelemetriaRegistro {
    return {
        ...raw,
        velocidade_max: n(raw.velocidade_max),
        velocidade_media: n(raw.velocidade_media),
        distancia_km: n(raw.distancia_km),
        duracao_s: n(raw.duracao_s),
        paradas: n(raw.paradas),
        acel_fortes: n(raw.acel_fortes),
        frenagens_fortes: n(raw.frenagens_fortes),
        pontos_json: parsePontosJson(raw.pontos_json),
    };
}

/* ======================= Página ======================= */
export default function TelemetriaPage() {
    const [rows, setRows] = useState<TelemetriaRegistro[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [openId, setOpenId] = useState<number | null>(null);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        setMsg(null);
        try {
            const r = await fetch(`${API}/api/php/telemetria.php?listar=1&_t=${Date.now()}`, {
                credentials: "include",
                cache: "no-store",
            });
            const payload = await r.json();
            const list = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.dados)
                    ? payload.dados
                    : [];
            setRows(list.map(normalizeRow));
        } catch (e: any) {
            setMsg(e?.message || "Falha ao carregar dados.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    /* ---------- render ---------- */
    return (
        <div className="p-6">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Relatório de Telemetria</h1>
                    <p className="text-sm text-slate-500">
                        Sessões registradas com rotas e estatísticas de condução.
                    </p>
                </div>
                <button
                    onClick={fetchRows}
                    disabled={loading}
                    className="rounded-lg border px-4 py-2 text-sm"
                >
                    {loading ? "Atualizando..." : "Atualizar"}
                </button>
            </header>

            {msg && (
                <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 mb-3">
                    {msg}
                </div>
            )}

            {rows.length === 0 && !loading && (
                <div className="text-slate-500 text-sm">Nenhum registro encontrado.</div>
            )}

            <div className="space-y-4">
                {rows.map((row) => {
                    const open = openId === row.id;
                    const pontos = Array.isArray(row.pontos_json)
                        ? (row.pontos_json as Ponto[])
                        : parsePontosJson(row.pontos_json);

                    return (
                        <div
                            key={row.id}
                            className="rounded-xl border bg-white shadow-sm p-4"
                        >
                            <div
                                className="flex justify-between items-center cursor-pointer"
                                onClick={() => setOpenId(open ? null : row.id)}
                            >
                                <div>
                                    <div className="font-medium text-slate-800">
                                        {row.veiculo_nome || "Sem veículo"}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {row.falecido ? `Falecido: ${row.falecido}` : "Sem falecido"} •{" "}
                                        {row.tipo || "tipo indefinido"}
                                    </div>
                                </div>
                                <div className="text-xs text-slate-400">
                                    {fmtDataHora(row.criado_em)}
                                </div>
                            </div>

                            {open && (
                                <div className="mt-4 space-y-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <KPI label="Distância" value={fmtKm(row.distancia_km)} />
                                        <KPI label="Velocidade Média" value={fmtKmH(row.velocidade_media)} />
                                        <KPI label="Velocidade Máx." value={fmtKmH(row.velocidade_max)} />
                                        <KPI label="Duração" value={fmtDur(row.duracao_s)} />
                                    </div>

                                    <MapRoute pontos={pontos} height={260} />

                                    {row.observacao && (
                                        <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                                            Observação: {row.observacao}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ======================= UI Componentes menores ======================= */
function KPI({
    label,
    value,
    sub,
}: {
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-lg font-semibold">{value}</div>
            {sub && <div className="text-xs text-slate-400">{sub}</div>}
        </div>
    );
}
