"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API } from "../acompanhamento/components/constants";
import MapRoute from "./MapRoute";

/* ======================= Tipos ======================= */
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
    agente: string | null;
    falecido: string | null;
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
    paradas?: number | null;
    acel_fortes?: number | null;
    frenagens_fortes?: number | null;
    origem?: string | null;
    origem_dados?: string | null;
    observacao?: string | null;
    pontos_json?: string | null | any[];
    eventos_json?: string | null;
    extra_json?: string | null;
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

/* ======================= Helpers ======================= */
const isFiniteNum = (v: any): v is number => Number.isFinite(Number(v));

const n = (v: any, d: number | null | undefined = 0): number =>
    isFiniteNum(v) ? Number(v) : (d ?? 0);

function fmtKm(x: any) {
    const val = n(x, 0);
    return `${val.toFixed(2).replace(".", ",")} km`;
}

function fmtM(x: any) {
    const val = n(x, 0);
    return `${Math.round(val).toLocaleString("pt-BR")} m`;
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

function fmtDataHora(value?: string | null) {
    if (!value) return "-";

    const asString = String(value);

    if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(asString)) {
        return asString;
    }

    const d = new Date(asString.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return asString;

    return d.toLocaleString("pt-BR");
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

function parsePontosJson(pontos_json?: string | null | any[]): Ponto[] {
    if (!pontos_json) return [];

    let arr: any[] | null = null;

    if (Array.isArray(pontos_json)) {
        arr = pontos_json;
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
            if (p?.spd_ms != null) v = Number(p.spd_ms) * 3.6;
            else if (p?.spd_kmh != null) v = Number(p.spd_kmh);
            else if (p?.spd != null) v = Number(p.spd) * 3.6;
            else if (p?.v != null) v = Number(p.v);
            else if (p?.velocidade != null) v = Number(p.velocidade);

            return {
                lat,
                lng,
                t,
                v,
                label: p?.label,
                localizacao: p?.localizacao,
            };
        })
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

function normalizeRow(raw: any): TelemetriaRegistro {
    return {
        ...raw,
        velocidade_max: n(raw.velocidade_max ?? raw.vel_max_kmh),
        velocidade_media: n(raw.velocidade_media ?? raw.vel_media_kmh),
        distancia_km: n(raw.distancia_km),
        duracao_s: n(raw.duracao_s ?? raw.duracao_seg),
        paradas: n(raw.paradas),
        acel_fortes: n(raw.acel_fortes),
        frenagens_fortes: n(raw.frenagens_fortes),
        inicio_iso: raw.inicio_iso ?? raw.inicio_ts,
        fim_iso: raw.fim_iso ?? raw.fim_ts,
        criado_em: raw.criado_em ?? raw.inicio_ts,
        pontos_json: parsePontosJson(raw.pontos_json),
    };
}

function normalizePlaca(v: string) {
    return v.toUpperCase().replace(/\s+/g, "");
}

function todayStart14() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}000000`;
}

function todayEnd14() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}235959`;
}

function parseDataBrItrack(s?: string | null) {
    if (!s) return undefined;
    const value = String(s);

    const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
        const [, dd, mm, yyyy, hh, mi, ss] = m;
        return Math.floor(new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`).getTime() / 1000);
    }

    const d = new Date(value.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return undefined;
    return Math.floor(d.getTime() / 1000);
}

function posicoesToPontos(posicoes: ItrackPosicao[]): Ponto[] {
    return posicoes
        .map((p) => ({
            lat: Number(p.latitude),
            lng: Number(p.longitude),
            v: Number(p.velocidade ?? 0),
            t: parseDataBrItrack(p.dataHoraPosicao ?? p.data_hora_posicao),
            label: p.dataHoraPosicao ?? p.data_hora_posicao,
            localizacao: p.localizacao,
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
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
    return v.dataHoraPosicao ?? v.data_hora_posicao ?? null;
}

function veiculoEventos(v: ItrackVeiculo): ItrackEvento[] {
    if (Array.isArray(v.eventos)) return v.eventos;
    return parseJsonSafe<ItrackEvento[]>(v.eventos_json, []);
}

function distanciaMetros(d: ItrackDistancia) {
    return n(d.distanciaPercorrida ?? d.distancia_percorrida_m, 0);
}

function distanciaKm(d: ItrackDistancia) {
    if (d.distancia_percorrida_km != null) return n(d.distancia_percorrida_km, 0);
    return distanciaMetros(d) / 1000;
}

/* ======================= Página ======================= */
export default function TelemetriaPage() {
    const [rows, setRows] = useState<TelemetriaRegistro[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [openId, setOpenId] = useState<number | null>(null);

    const [itrackLoading, setItrackLoading] = useState(false);
    const [itrackMsg, setItrackMsg] = useState<string | null>(null);
    const [veiculos, setVeiculos] = useState<ItrackVeiculo[]>([]);
    const [historico, setHistorico] = useState<ItrackHistoricoItem | null>(null);
    const [distancias, setDistancias] = useState<ItrackDistancia[]>([]);
    const [placa, setPlaca] = useState("");
    const [inicio, setInicio] = useState(todayStart14());
    const [fim, setFim] = useState(todayEnd14());
    const [usarCache, setUsarCache] = useState(false);
    const [salvarConsultas, setSalvarConsultas] = useState(true);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        setMsg(null);

        try {
            const r = await fetch(`${API}/api/php/telemetria.php?listar=1&_t=${Date.now()}`, {
                credentials: "include",
                cache: "no-store",
            });

            const payload = await r.json();

            if (payload?.erro) throw new Error(payload.msg || "Falha ao carregar dados.");

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

    const fetchItrackVeiculos = useCallback(async (cache = usarCache) => {
        setItrackLoading(true);
        setItrackMsg(null);

        try {
            const qs = new URLSearchParams({
                itrack: cache ? "veiculos_cache" : "listaveiculos",
                _t: String(Date.now()),
            });

            if (!cache && salvarConsultas) qs.set("salvar", "1");

            const r = await fetch(`${API}/api/php/telemetria.php?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
            });

            const payload = await r.json();

            if (payload?.erro) throw new Error(payload.msg || "Falha ao consultar veículos.");

            const list = cache
                ? payload?.dados
                : payload?.dados?.data;

            setVeiculos(Array.isArray(list) ? list : []);
            setItrackMsg(cache ? "Veículos carregados do cache local." : "Veículos consultados na iTrack.");
        } catch (e: any) {
            setItrackMsg(e?.message || "Falha ao consultar veículos.");
        } finally {
            setItrackLoading(false);
        }
    }, [salvarConsultas, usarCache]);

    const fetchItrackHistorico = useCallback(async () => {
        const placaNorm = normalizePlaca(placa);
        if (!placaNorm || !inicio || !fim) {
            setItrackMsg("Informe placa, início e fim.");
            return;
        }

        setItrackLoading(true);
        setItrackMsg(null);
        setHistorico(null);

        try {
            const qs = new URLSearchParams({
                itrack: "historico",
                placa: placaNorm,
                inicio,
                fim,
                _t: String(Date.now()),
            });

            if (salvarConsultas) qs.set("salvar", "1");

            const r = await fetch(`${API}/api/php/telemetria.php?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
            });

            const payload = await r.json();

            if (payload?.erro) throw new Error(payload.msg || "Falha ao consultar histórico.");

            const item = payload?.dados?.data?.[0] ?? null;
            setHistorico(item);
            setItrackMsg(
                payload?.salvo?.consulta_id
                    ? `Histórico carregado e salvo. Consulta #${payload.salvo.consulta_id}.`
                    : "Histórico carregado."
            );
        } catch (e: any) {
            setItrackMsg(e?.message || "Falha ao consultar histórico.");
        } finally {
            setItrackLoading(false);
        }
    }, [placa, inicio, fim, salvarConsultas]);

    const fetchItrackDistancia = useCallback(async () => {
        const placaNorm = normalizePlaca(placa);
        if (!placaNorm || !inicio || !fim) {
            setItrackMsg("Informe placa, início e fim.");
            return;
        }

        setItrackLoading(true);
        setItrackMsg(null);
        setDistancias([]);

        try {
            const qs = new URLSearchParams({
                itrack: "distancia",
                placa: placaNorm,
                inicio,
                fim,
                _t: String(Date.now()),
            });

            if (salvarConsultas) qs.set("salvar", "1");

            const r = await fetch(`${API}/api/php/telemetria.php?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
            });

            const payload = await r.json();

            if (payload?.erro) throw new Error(payload.msg || "Falha ao consultar distância.");

            const list = payload?.dados?.data;
            setDistancias(Array.isArray(list) ? list : []);
            setItrackMsg("Distância por hodômetro carregada.");
        } catch (e: any) {
            setItrackMsg(e?.message || "Falha ao consultar distância.");
        } finally {
            setItrackLoading(false);
        }
    }, [placa, inicio, fim, salvarConsultas]);

    const carregarCacheDistancia = useCallback(async () => {
        const placaNorm = normalizePlaca(placa);
        setItrackLoading(true);
        setItrackMsg(null);

        try {
            const qs = new URLSearchParams({
                itrack: "distancia_cache",
                _t: String(Date.now()),
            });

            if (placaNorm) qs.set("placa", placaNorm);

            const r = await fetch(`${API}/api/php/telemetria.php?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
            });

            const payload = await r.json();

            if (payload?.erro) throw new Error(payload.msg || "Falha ao carregar cache de distância.");

            setDistancias(Array.isArray(payload?.dados) ? payload.dados : []);
            setItrackMsg("Distâncias carregadas do cache local.");
        } catch (e: any) {
            setItrackMsg(e?.message || "Falha ao carregar cache de distância.");
        } finally {
            setItrackLoading(false);
        }
    }, [placa]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    const pontosHistorico = useMemo(() => {
        return posicoesToPontos(historico?.posicoes ?? []);
    }, [historico]);

    const resumoHistorico = useMemo(() => {
        const pos = historico?.posicoes ?? [];
        if (!pos.length) return null;

        const velocidades = pos.map((p) => Number(p.velocidade)).filter(Number.isFinite);
        const vmax = velocidades.length ? Math.max(...velocidades) : 0;
        const hodometros = pos.map((p) => Number(p.hodometro)).filter(Number.isFinite);
        const hIni = hodometros.length ? hodometros[0] : null;
        const hFim = hodometros.length ? hodometros[hodometros.length - 1] : null;

        return {
            total: pos.length,
            vmax,
            hIni,
            hFim,
            distanciaHodometroM: hIni != null && hFim != null ? Math.max(0, hFim - hIni) : null,
            inicio: pos[0]?.dataHoraPosicao ?? pos[0]?.data_hora_posicao,
            fim: pos[pos.length - 1]?.dataHoraPosicao ?? pos[pos.length - 1]?.data_hora_posicao,
        };
    }, [historico]);

    return (
        <div className="p-6">
            <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Relatório de Telemetria</h1>
                    <p className="text-sm text-slate-500">
                        Serviços funerários, rotas registradas e integração iTrack/Intertrack.
                    </p>
                </div>

                <button
                    onClick={fetchRows}
                    disabled={loading}
                    className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
                >
                    {loading ? "Atualizando..." : "Atualizar serviços"}
                </button>
            </header>

            {msg && (
                <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
                    {msg}
                </div>
            )}

            <section className="mb-8 rounded-xl border bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">iTrack / Intertrack</h2>
                        <p className="text-sm text-slate-500">
                            Consulte frota, histórico por placa e distância por hodômetro sem perder os dados dos serviços funerários.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                        <label className="inline-flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={salvarConsultas}
                                onChange={(e) => setSalvarConsultas(e.target.checked)}
                            />
                            salvar consultas no banco
                        </label>

                        <label className="inline-flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={usarCache}
                                onChange={(e) => setUsarCache(e.target.checked)}
                            />
                            carregar veículos do cache
                        </label>
                    </div>
                </div>

                {itrackMsg && (
                    <div className="mb-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                        {itrackMsg}
                    </div>
                )}

                <div className="mb-4 grid gap-3 md:grid-cols-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">
                            Placa
                        </label>
                        <input
                            value={placa}
                            onChange={(e) => setPlaca(normalizePlaca(e.target.value))}
                            placeholder="ABC1234 ou ABC-1234"
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">
                            Início yyyyMMddHHmmss
                        </label>
                        <input
                            value={inicio}
                            onChange={(e) => setInicio(e.target.value.replace(/\D/g, "").slice(0, 14))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">
                            Fim yyyyMMddHHmmss
                        </label>
                        <input
                            value={fim}
                            onChange={(e) => setFim(e.target.value.replace(/\D/g, "").slice(0, 14))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={() => fetchItrackVeiculos()}
                            disabled={itrackLoading}
                            className="w-full rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
                        >
                            {itrackLoading ? "Consultando..." : "Listar veículos"}
                        </button>
                    </div>
                </div>

                <div className="mb-6 flex flex-wrap gap-2">
                    <button
                        onClick={fetchItrackHistorico}
                        disabled={itrackLoading}
                        className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
                    >
                        Buscar histórico da placa
                    </button>

                    <button
                        onClick={fetchItrackDistancia}
                        disabled={itrackLoading}
                        className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
                    >
                        Buscar distância/hodômetro
                    </button>

                    <button
                        onClick={carregarCacheDistancia}
                        disabled={itrackLoading}
                        className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
                    >
                        Carregar distâncias salvas
                    </button>

                    <button
                        onClick={() => {
                            setInicio(todayStart14());
                            setFim(todayEnd14());
                        }}
                        className="rounded-lg border px-4 py-2 text-sm"
                    >
                        Usar período de hoje
                    </button>
                </div>

                {veiculos.length > 0 && (
                    <div className="mb-6">
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800">
                                Veículos iTrack ({veiculos.length})
                            </h3>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {veiculos.map((v, idx) => {
                                const eventos = veiculoEventos(v);
                                const lat = Number(v.latitude);
                                const lng = Number(v.longitude);
                                const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);

                                return (
                                    <div
                                        key={`${v.placa}-${idx}`}
                                        className="rounded-xl border bg-white p-4"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="font-semibold text-slate-800">{v.placa}</div>
                                                <div className="text-sm text-slate-600">{veiculoDescricao(v)}</div>
                                                <div className="mt-1 text-xs text-slate-500">
                                                    Cliente: {veiculoCliente(v)}
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => setPlaca(v.placa)}
                                                className="rounded-md border px-2 py-1 text-xs"
                                            >
                                                usar placa
                                            </button>
                                        </div>

                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                            <KPI label="Vel." value={fmtKmH(v.velocidade)} compact />
                                            <KPI label="Ignição" value={Number(v.ignicao) === 1 ? "Ligada" : "Deslig."} compact />
                                            <KPI label="GPS" value={String(v.gps ?? "-")} compact />
                                        </div>

                                        <div className="mt-3 text-xs text-slate-500">
                                            <div>Rastreador: {veiculoRastreador(v)}</div>
                                            <div>Motorista: {veiculoMotorista(v)}</div>
                                            <div>Última posição: {fmtDataHora(veiculoDataPosicao(v))}</div>
                                            <div>Localização: {v.localizacao || "-"}</div>
                                            <div>Hodômetro: {v.hodometro != null ? fmtM(v.hodometro) : "-"}</div>
                                        </div>

                                        {eventos.length > 0 && (
                                            <div className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                                                {eventos.map((ev, i) => (
                                                    <div key={i}>
                                                        {ev.idEvento ? `${ev.idEvento} - ` : ""}
                                                        {ev.descricaoEvento || "Evento"}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {hasPoint && (
                                            <div className="mt-3">
                                                <MapRoute
                                                    pontos={[{
                                                        lat,
                                                        lng,
                                                        v: Number(v.velocidade ?? 0),
                                                        label: v.placa,
                                                        localizacao: v.localizacao,
                                                    }]}
                                                    height={180}
                                                    showSummary={false}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {historico && (
                    <div className="mb-6 rounded-xl border p-4">
                        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                                <h3 className="font-semibold text-slate-800">
                                    Histórico: {historico.veiculo?.placa ?? placa}
                                </h3>
                                <p className="text-sm text-slate-500">
                                    {historico.veiculo?.descricao ?? "Veículo"}{" "}
                                    {historico.veiculo?.modelo ? `• ${historico.veiculo.modelo}` : ""}
                                </p>
                            </div>

                            <div className="text-xs text-slate-500 md:text-right">
                                <div>Início: {fmtDataHora(resumoHistorico?.inicio)}</div>
                                <div>Fim: {fmtDataHora(resumoHistorico?.fim)}</div>
                            </div>
                        </div>

                        {resumoHistorico && (
                            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                                <KPI label="Posições" value={String(resumoHistorico.total)} />
                                <KPI label="Vel. máx." value={fmtKmH(resumoHistorico.vmax)} />
                                <KPI label="Hod. inicial" value={resumoHistorico.hIni != null ? fmtM(resumoHistorico.hIni) : "-"} />
                                <KPI label="Hod. final" value={resumoHistorico.hFim != null ? fmtM(resumoHistorico.hFim) : "-"} />
                            </div>
                        )}

                        <MapRoute pontos={pontosHistorico} height={380} />

                        {pontosHistorico.length === 0 && (
                            <div className="mt-2 text-sm text-slate-500">
                                Nenhuma posição com latitude/longitude foi retornada para este período.
                            </div>
                        )}
                    </div>
                )}

                {distancias.length > 0 && (
                    <div className="rounded-xl border p-4">
                        <h3 className="mb-3 font-semibold text-slate-800">
                            Distância por hodômetro ({distancias.length})
                        </h3>

                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="border-b text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="px-2 py-2">Placa</th>
                                        <th className="px-2 py-2">Veículo</th>
                                        <th className="px-2 py-2">Cliente</th>
                                        <th className="px-2 py-2">Distância</th>
                                        <th className="px-2 py-2">Hod. inicial</th>
                                        <th className="px-2 py-2">Hod. final</th>
                                        <th className="px-2 py-2">Período</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {distancias.map((d, idx) => (
                                        <tr key={`${d.placa}-${d.id ?? idx}`} className="border-b last:border-0">
                                            <td className="px-2 py-2 font-medium">{d.placa ?? placa}</td>
                                            <td className="px-2 py-2">{d.descricaoVeiculo ?? d.descricao_veiculo ?? "-"}</td>
                                            <td className="px-2 py-2">{d.cliente ?? "-"}</td>
                                            <td className="px-2 py-2">{fmtKm(distanciaKm(d))}</td>
                                            <td className="px-2 py-2">{fmtM(d.hodometroInicial ?? d.hodometro_inicial)}</td>
                                            <td className="px-2 py-2">{fmtM(d.hodometroFinal ?? d.hodometro_final)}</td>
                                            <td className="px-2 py-2 text-xs text-slate-500">
                                                {fmtDataHora(d.data_inicio)} até {fmtDataHora(d.data_fim)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </section>

            <section>
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-800">Serviços funerários</h2>
                        <p className="text-sm text-slate-500">
                            Registros locais com falecido, agente, veículo e rota vinculada ao serviço.
                        </p>
                    </div>
                    <div className="text-xs text-slate-500">{rows.length} registro(s)</div>
                </div>

                {rows.length === 0 && !loading && (
                    <div className="text-sm text-slate-500">Nenhum registro encontrado.</div>
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
                                className="rounded-xl border bg-white p-4 shadow-sm"
                            >
                                <div
                                    className="flex cursor-pointer flex-col gap-2 md:flex-row md:items-center md:justify-between"
                                    onClick={() => setOpenId(open ? null : row.id)}
                                >
                                    <div>
                                        <div className="font-medium text-slate-800">
                                            {row.veiculo_nome || "Sem veículo"}
                                            {row.placa ? ` • ${row.placa}` : ""}
                                        </div>

                                        <div className="text-xs text-slate-500">
                                            {row.falecido ? `Falecido: ${row.falecido}` : "Sem falecido"} •{" "}
                                            {row.tipo || "tipo indefinido"}
                                            {row.agente ? ` • Agente: ${row.agente}` : ""}
                                        </div>
                                    </div>

                                    <div className="text-xs text-slate-400">
                                        {fmtDataHora(row.criado_em)}
                                    </div>
                                </div>

                                {open && (
                                    <div className="mt-4 space-y-4">
                                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                            <KPI label="Distância" value={fmtKm(row.distancia_km)} />
                                            <KPI label="Velocidade Média" value={fmtKmH(row.velocidade_media)} />
                                            <KPI label="Velocidade Máx." value={fmtKmH(row.velocidade_max)} />
                                            <KPI label="Duração" value={fmtDur(row.duracao_s)} />
                                        </div>

                                        {(row.hodometro_inicial || row.hodometro_final || row.distancia_hodometro_m) && (
                                            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                                <KPI label="Hod. inicial" value={row.hodometro_inicial != null ? fmtM(row.hodometro_inicial) : "-"} />
                                                <KPI label="Hod. final" value={row.hodometro_final != null ? fmtM(row.hodometro_final) : "-"} />
                                                <KPI label="Dist. hodômetro" value={row.distancia_hodometro_m != null ? fmtM(row.distancia_hodometro_m) : "-"} />
                                            </div>
                                        )}

                                        <MapRoute pontos={pontos} height={280} />

                                        <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                                            <div className="rounded-md bg-slate-50 p-2">
                                                <div>Sepultamento ID: {row.sepultamento_id ?? "-"}</div>
                                                <div>Rastreador iTrack: {row.id_rastreador_itrack ?? "-"}</div>
                                                <div>Motorista: {row.nome_motorista ?? "-"}</div>
                                            </div>

                                            <div className="rounded-md bg-slate-50 p-2">
                                                <div>Início: {fmtDataHora(row.inicio_iso)}</div>
                                                <div>Fim: {fmtDataHora(row.fim_iso)}</div>
                                                <div>Origem: {row.origem_dados ?? row.origem ?? "-"}</div>
                                            </div>
                                        </div>

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
            </section>
        </div>
    );
}

/* ======================= UI Componentes menores ======================= */
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
        <div className={`rounded-lg border text-center ${compact ? "p-2" : "p-3"}`}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`${compact ? "text-sm" : "text-lg"} font-semibold`}>
                {value}
            </div>
            {sub && <div className="text-xs text-slate-400">{sub}</div>}
        </div>
    );
}
