"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API } from "../acompanhamento/components/constants";
import MapRoute from "./MapRoute";

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
    latitude?: number | string;
    longitude?: number | string;
    localizacao?: string;
    velocidade?: number | string;
    dataHoraPosicao?: string;
    data_hora_posicao?: string;
    hodometro?: number | string;
    ignicao?: number | string;
    gps?: number | string;
    nomeMotorista?: string;
    nome_motorista?: string;
    eventos?: ItrackEvento[];
    eventos_json?: string | ItrackEvento[] | null;
    atualizado_em?: string;
};

type ItrackHistoricoItem = {
    cliente?: unknown;
    rastreador?: unknown;
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
    ignicao?: number | string;
    gps?: number | string;
    latitude?: number | string;
    longitude?: number | string;
    localizacao?: string;
    velocidade?: number | string;
    dataHoraPosicao?: string;
    dataHoraServidor?: string;
    data_hora_posicao?: string;
    data_hora_servidor?: string;
    hodometro?: number | string;
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
    distanciaPercorrida?: number | string;
    distancia_percorrida_m?: number | string;
    distancia_percorrida_km?: number | string;
    hodometroInicial?: number | string;
    hodometro_inicial?: number | string;
    hodometroFinal?: number | string;
    hodometro_final?: number | string;
    data_inicio?: string;
    data_fim?: string;
};

type PeriodoRapido = "1d" | "7d" | "30d" | "custom";
type VeiculoFiltroStatus = "todos" | "em_movimento" | "ligado_parado" | "desligado" | "sem_localizacao" | "excesso_velocidade";
type SortDirection = "asc" | "desc";
type MotoristaSortKey = "motorista" | "velocidade_media" | "velocidade_maxima" | "km_total";
type HistoricoSortKey = "placa" | "distancia" | "hodometro_final";

type MotoristaResumo = {
    motorista?: string | null;
    nome_motorista?: string | null;
    total_posicoes?: number | string | null;
    total_veiculos?: number | string | null;
    placas?: string | null;
    velocidade_media?: number | string | null;
    velocidade_minima?: number | string | null;
    velocidadeMinima?: number | string | null;
    velocidade_maxima?: number | string | null;
    velocidadeMaxima?: number | string | null;
    total_km?: number | string | null;
    km_total?: number | string | null;
    distancia_km?: number | string | null;
    distancia_percorrida_km?: number | string | null;
    distancia_percorrida_m?: number | string | null;
    primeira_posicao?: string | null;
    ultima_posicao?: string | null;
};

type HistoricoVeicularResumo = {
    placa?: string | null;
    descricao_veiculo?: string | null;
    descricaoVeiculo?: string | null;
    cliente?: string | null;
    id_rastreador?: string | null;
    idRastreador?: string | null;
    distancia_percorrida_m?: number | string | null;
    distancia_percorrida_km?: number | string | null;
    distanciaPercorrida?: number | string | null;
    hodometro_inicial?: number | string | null;
    hodometroInicial?: number | string | null;
    hodometro_final?: number | string | null;
    hodometroFinal?: number | string | null;
    data_inicio?: string | null;
    data_fim?: string | null;
    total_registros?: number | string | null;
    total_posicoes?: number | string | null;
    velocidade_media?: number | string | null;
    velocidade_maxima?: number | string | null;
    fonte_distancia?: string | null;
};

type ApiError = Error & { status?: number; raw?: string };
type Tab = "ao_vivo" | "lista_veiculos" | "atendimentos" | "motoristas" | "historico_veicular";

const TELEMETRIA_URL = `${API}/api/php/telemetria.php`;
const LIVE_REFRESH_MS = 10_000;
const LIMITE_VELOCIDADE_ALERTA = 80;

const isPresentNumber = (v: unknown): v is number | string => {
    if (v === null || v === undefined || v === "") return false;
    return Number.isFinite(Number(v));
};

const n = (v: unknown, d: number | null = 0): number | null => {
    if (v === null || v === undefined || v === "") return d;
    const num = Number(v);
    return Number.isFinite(num) ? num : d;
};

const numOrUndefined = (v: unknown): number | undefined => {
    if (!isPresentNumber(v)) return undefined;
    return Number(v);
};

function fmtKm(v?: number | string | null) {
    if (!isPresentNumber(v)) return "-";
    return `${Number(v).toFixed(2).replace(".", ",")} km`;
}

function fmtM(v?: number | string | null) {
    if (!isPresentNumber(v)) return "-";
    return `${Number(v).toLocaleString("pt-BR")} m`;
}

function fmtKmH(v?: number | string | null) {
    if (!isPresentNumber(v)) return "-";
    return `${Number(v).toFixed(1).replace(".", ",")} km/h`;
}

function fmtDur(seg?: number | string | null) {
    if (!isPresentNumber(seg)) return "-";
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
        const ms = v > 1_000_000_000_000 ? v : v * 1000;
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

async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
    const r = await fetch(url, init);
    const text = await r.text();

    if (!r.ok) {
        const error = new Error(`Erro HTTP ${r.status} ao consultar o servidor.`) as ApiError;
        error.status = r.status;
        error.raw = text;
        throw error;
    }

    try {
        return JSON.parse(text) as T;
    } catch {
        const error = new Error("Resposta inválida do servidor. O backend não retornou JSON válido.") as ApiError;
        error.raw = text;
        throw error;
    }
}

function parseJsonSafe<T = unknown>(value: unknown, fallback: T): T {
    if (value == null || value === "") return fallback;
    if (typeof value !== "string") return value as T;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function parsePontosJson(raw: unknown): Ponto[] {
    const arr = parseJsonSafe<unknown[]>(raw, []);
    if (!Array.isArray(arr)) return [];

    return arr
        .map((p: any) => ({
            lat: Number(p.lat ?? p.latitude),
            lng: Number(p.lng ?? p.longitude),
            t: p.t ?? p.ts ?? p.timestamp,
            v: numOrUndefined(p.v ?? p.velocidade ?? p.spd_kmh),
            label: p.label,
            localizacao: p.localizacao,
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function normalizePlaca(v?: string | null) {
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

function daysAgoStart14(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - Math.max(0, days - 1));
    d.setHours(0, 0, 0, 0);
    return dateTo14(d);
}

function ymdTo14Start(v: string) {
    if (!v) return todayStart14();
    return `${v.replaceAll("-", "")}000000`;
}

function ymdTo14End(v: string) {
    if (!v) return todayEnd14();
    return `${v.replaceAll("-", "")}235959`;
}

function date14ToInput(v?: string | null) {
    const s = String(v || "");
    if (!/^\d{14}$/.test(s)) return "";
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function periodoLabel(periodo: PeriodoRapido) {
    if (periodo === "1d") return "Hoje";
    if (periodo === "7d") return "Últimos 7 dias";
    if (periodo === "30d") return "Últimos 30 dias";
    return "Período específico";
}

function periodoToRange(periodo: PeriodoRapido, inicioCustom: string, fimCustom: string) {
    if (periodo === "1d") return { inicio: todayStart14(), fim: todayEnd14() };
    if (periodo === "7d") return { inicio: daysAgoStart14(7), fim: todayEnd14() };
    if (periodo === "30d") return { inicio: daysAgoStart14(30), fim: todayEnd14() };
    return {
        inicio: ymdTo14Start(inicioCustom || date14ToInput(todayStart14())),
        fim: ymdTo14End(fimCustom || date14ToInput(todayEnd14())),
    };
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

function posicoesOrdenadas(pos: ItrackPosicao[]) {
    return [...(pos || [])].sort((a, b) => {
        const da = parseDateMaybe(a.dataHoraPosicao ?? a.data_hora_posicao)?.getTime() ?? 0;
        const db = parseDateMaybe(b.dataHoraPosicao ?? b.data_hora_posicao)?.getTime() ?? 0;
        return da - db;
    });
}

function posicoesToPontos(pos: ItrackPosicao[]): Ponto[] {
    return posicoesOrdenadas(pos)
        .map((p) => ({
            lat: Number(p.latitude),
            lng: Number(p.longitude),
            v: numOrUndefined(p.velocidade),
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

function veiculoMotorista(v: ItrackVeiculo | any) {
    const candidatos = [
        v?.nomeMotorista,
        v?.nome_motorista,
        v?.motorista,
        v?.motoristaNome,
        v?.motorista_nome,
        v?.condutor,
        v?.nomeCondutor,
        v?.nome_condutor,
        v?.driverName,
        v?.driver_name,
        v?.rastreador?.nomeMotorista,
        v?.rastreador?.nome_motorista,
        v?.veiculo?.nomeMotorista,
        v?.veiculo?.nome_motorista,
    ];

    const nome = candidatos
        .map((x) => String(x ?? "").trim())
        .find((x) => x && x !== "-" && x.toLowerCase() !== "null" && x.toLowerCase() !== "undefined");

    return nome || "-";
}

function veiculoDataPosicao(v: ItrackVeiculo) {
    return v.dataHoraPosicao ?? v.data_hora_posicao ?? v.atualizado_em ?? null;
}

function veiculoEventos(v: ItrackVeiculo): ItrackEvento[] {
    if (Array.isArray(v.eventos)) return v.eventos;
    const eventos = parseJsonSafe<ItrackEvento[]>(v.eventos_json, []);
    return Array.isArray(eventos) ? eventos : [];
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
    if (d.distancia_percorrida_m != null) return n(d.distancia_percorrida_m, 0) || 0;
    return null;
}

function distanciaKm(d: ItrackDistancia) {
    if (d.distancia_percorrida_km != null) return n(d.distancia_percorrida_km, 0) || 0;

    const metros = distanciaMetros(d);
    if (metros != null) return metros / 1000;

    // Assumido como km para evitar dividir indevidamente um campo ambíguo.
    // O ideal é o backend retornar sempre distancia_percorrida_km ou distancia_percorrida_m.
    return n(d.distanciaPercorrida, 0) || 0;
}

function statusVeiculo(v: ItrackVeiculo) {
    const ignicao = Number(v.ignicao);
    const vel = Number(v.velocidade || 0);

    if (ignicao === 1 && vel > 3) return { label: "Em movimento", tone: "emerald" };
    if (ignicao === 1) return { label: "Ligado/parado", tone: "amber" };
    return { label: "Desligado", tone: "slate" };
}

function motoristaVelocidadeMedia(m: MotoristaResumo) {
    const candidatos = [
        m.velocidade_media,
        (m as any).vel_media_kmh,
        (m as any).velocidadeMedia,
        (m as any).velocidade_media_kmh,
        (m as any).media_velocidade,
    ];

    const valor = candidatos.find((x) => isPresentNumber(x));
    return valor ?? null;
}

function motoristaVelocidadeMaxima(m: MotoristaResumo) {
    const candidatos = [m.velocidade_maxima, m.velocidadeMaxima, (m as any).vel_max_kmh, (m as any).velocidade_max];
    const valor = candidatos.find((x) => isPresentNumber(x));
    return valor ?? null;
}

function motoristaKmTotal(m: MotoristaResumo) {
    const candidatos = [
        m.total_km,
        m.km_total,
        m.distancia_km,
        m.distancia_percorrida_km,
        (m as any).distanciaPercorridaKm,
        (m as any).distancia_total_km,
        (m as any).km_rodado,
        (m as any).km_rodados,
    ];

    const km = candidatos.find((x) => isPresentNumber(x));
    if (km != null) return Number(km);

    if (isPresentNumber(m.distancia_percorrida_m)) return Number(m.distancia_percorrida_m) / 1000;
    if (isPresentNumber((m as any).distancia_total_m)) return Number((m as any).distancia_total_m) / 1000;

    return null;
}

function velocidadeAlerta(v?: number | string | null) {
    return isPresentNumber(v) && Number(v) >= LIMITE_VELOCIDADE_ALERTA;
}

function parseNumeroBr(v: string | number | null | undefined) {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v).trim();
    if (!s) return 0;
    const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
}

function fmtMoeda(v?: number | string | null) {
    const num = Number(v ?? 0);
    if (!Number.isFinite(num)) return "R$ 0,00";
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function csvValue(v: unknown) {
    const value = String(v ?? "");
    return `"${value.replaceAll('"', '""')}"`;
}

function baixarCsv(nomeArquivo: string, cabecalhos: string[], linhas: unknown[][]) {
    if (typeof window === "undefined") return;
    const csv = [cabecalhos, ...linhas].map((linha) => linha.map(csvValue).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function tipoLabel(tipo?: string | null) {
    const t = String(tipo || "").toLowerCase();
    if (t === "remocao") return "Remoção";
    if (t === "para_velorio") return "Para velório";
    if (t === "para_sepultamento") return "Para sepultamento";
    return tipo || "Não informado";
}

function escapeHtml(value: unknown) {
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
            }, { once: true });
            existing.addEventListener("error", () => reject(new Error("Falha ao carregar Leaflet.")), { once: true });
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
        `Velocidade: ${escapeHtml(fmtKmH(v.velocidade))}${velocidadeAlerta(v.velocidade) ? " ⚠️" : ""}`,
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
    const markersRef = useRef<Map<string, any>>(new Map());
    const didInitialFitRef = useRef(false);
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
                markersRef.current.forEach((marker) => {
                    try { mapRef.current?.removeLayer(marker); } catch { }
                });
                markersRef.current.clear();
                didInitialFitRef.current = false;
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
                const currentKeys = new Set<string>();
                const bounds: any[] = [];

                valid.forEach(({ v, p }) => {
                    const placa = normalizePlaca(v.placa);
                    if (!placa) return;

                    currentKeys.add(placa);
                    bounds.push([p.lat, p.lng]);

                    const st = statusVeiculo(v);
                    const moving = st.label === "Em movimento";
                    const selected = normalizePlaca(selectedPlaca || "") === placa;
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

                    const existing = markersRef.current.get(placa);

                    if (existing) {
                        existing.setLatLng([p.lat, p.lng]);
                        existing.setIcon(icon);
                        existing.setPopupContent(liveVehiclePopup(v));
                    } else {
                        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
                        marker.bindPopup(liveVehiclePopup(v));
                        marker.on("click", () => onSelect?.(v));
                        markersRef.current.set(placa, marker);
                    }
                });

                markersRef.current.forEach((marker, placa) => {
                    if (!currentKeys.has(placa)) {
                        try { map.removeLayer(marker); } catch { }
                        markersRef.current.delete(placa);
                    }
                });

                if (!didInitialFitRef.current && bounds.length > 0) {
                    if (bounds.length === 1) {
                        map.setView(bounds[0], 15);
                    } else {
                        map.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 });
                    }
                    didInitialFitRef.current = true;
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
            markersRef.current.forEach((marker) => {
                try { mapRef.current?.removeLayer(marker); } catch { }
            });
            markersRef.current.clear();

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

export default function TelemetriaOperacionalPage() {
    const [tab, setTab] = useState<Tab>("ao_vivo");

    const [rows, setRows] = useState<TelemetriaRegistro[]>([]);
    const [veiculos, setVeiculos] = useState<ItrackVeiculo[]>([]);
    const [historico, setHistorico] = useState<ItrackHistoricoItem | null>(null);
    const [motoristas, setMotoristas] = useState<MotoristaResumo[]>([]);
    const [historicoVeicular, setHistoricoVeicular] = useState<HistoricoVeicularResumo[]>([]);
    const [historicoVeicularTotalKm, setHistoricoVeicularTotalKm] = useState(0);

    const [loadingRows, setLoadingRows] = useState(false);
    const [loadingVeiculos, setLoadingVeiculos] = useState(false);
    const [loadingHistorico, setLoadingHistorico] = useState(false);
    const [loadingMotoristas, setLoadingMotoristas] = useState(false);
    const [loadingHistoricoVeicular, setLoadingHistoricoVeicular] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [selectedAtendimentoId, setSelectedAtendimentoId] = useState<number | null>(null);
    const [selectedPlaca, setSelectedPlaca] = useState("");
    const [busca, setBusca] = useState("");
    const [filtroTipo, setFiltroTipo] = useState("todos");
    const [somenteComPlaca, setSomenteComPlaca] = useState(false);
    const [buscaVeiculo, setBuscaVeiculo] = useState("");
    const [filtroStatusVeiculo, setFiltroStatusVeiculo] = useState<VeiculoFiltroStatus>("todos");
    const [sortMotoristasBy, setSortMotoristasBy] = useState<MotoristaSortKey>("velocidade_maxima");
    const [sortMotoristasDirection, setSortMotoristasDirection] = useState<SortDirection>("desc");
    const [sortHistoricoBy, setSortHistoricoBy] = useState<HistoricoSortKey>("distancia");
    const [sortHistoricoDirection, setSortHistoricoDirection] = useState<SortDirection>("desc");

    const [inicio, setInicio] = useState(todayStart14());
    const [fim, setFim] = useState(todayEnd14());
    const [periodoMotorista, setPeriodoMotorista] = useState<PeriodoRapido>("7d");
    const [periodoVeicular, setPeriodoVeicular] = useState<PeriodoRapido>("7d");
    const [inicioCustom, setInicioCustom] = useState(date14ToInput(todayStart14()));
    const [fimCustom, setFimCustom] = useState(date14ToInput(todayEnd14()));
    const [ultimaAtualizacaoAoVivo, setUltimaAtualizacaoAoVivo] = useState<Date | null>(null);
    const [modalPlaca, setModalPlaca] = useState("");
    const [consumoAberto, setConsumoAberto] = useState(false);
    const [consumoPlaca, setConsumoPlaca] = useState("");
    const [consumoKmPorLitro, setConsumoKmPorLitro] = useState("10");
    const [consumoPrecoLitro, setConsumoPrecoLitro] = useState("6,00");

    const liveFetchingRef = useRef(false);
    const liveAbortRef = useRef<AbortController | null>(null);

    const loadingGeral = loadingRows || loadingVeiculos || loadingHistorico || loadingMotoristas || loadingHistoricoVeicular;

    const selectedAtendimento = useMemo(
        () => rows.find((r) => r.id === selectedAtendimentoId) || null,
        [rows, selectedAtendimentoId]
    );

    const fetchRows = useCallback(async () => {
        setLoadingRows(true);
        setMsg(null);

        try {
            const payload = await fetchJson<any>(`${TELEMETRIA_URL}?listar=1&_t=${Date.now()}`, {
                credentials: "include",
                cache: "no-store",
            });

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
            setLoadingRows(false);
        }
    }, []);

    const fetchVeiculos = useCallback(async (silent = false, force = false) => {
        if (liveFetchingRef.current) {
            if (!force) return;
            liveAbortRef.current?.abort();
        }

        const controller = new AbortController();
        liveAbortRef.current = controller;
        liveFetchingRef.current = true;
        setLoadingVeiculos(true);
        if (!silent) setMsg(null);

        try {
            const qs = new URLSearchParams({
                itrack: "listaveiculos",
                _t: String(Date.now()),
            });

            const payload = await fetchJson<any>(`${TELEMETRIA_URL}?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
                headers: { "Cache-Control": "no-cache" },
                signal: controller.signal,
            });

            if (payload?.erro) throw new Error(payload.msg || "Falha ao consultar veículos.");

            const list = payload?.dados?.data ?? payload?.dados ?? [];
            setVeiculos(Array.isArray(list) ? list : []);
            setUltimaAtualizacaoAoVivo(new Date());
        } catch (e: any) {
            if (e?.name !== "AbortError" && !silent) {
                setMsg(e?.message || "Falha ao consultar veículos.");
            }
        } finally {
            if (liveAbortRef.current === controller) {
                liveAbortRef.current = null;
                liveFetchingRef.current = false;
                setLoadingVeiculos(false);
            }
        }
    }, []);

    const fetchMotoristas = useCallback(async (periodoManual?: PeriodoRapido, atualizar = false) => {
        const periodo = periodoManual || periodoMotorista;
        const range = periodoToRange(periodo, inicioCustom, fimCustom);

        setLoadingMotoristas(true);
        setMsg(null);

        try {
            const qs = new URLSearchParams({
                itrack: "motoristas",
                periodo,
                inicio: range.inicio,
                fim: range.fim,
                _t: String(Date.now()),
            });

            if (atualizar) qs.set("atualizar", "1");

            const payload = await fetchJson<any>(`${TELEMETRIA_URL}?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
            });

            if (payload?.erro) throw new Error(payload.msg || "Falha ao carregar motoristas.");

            const list = Array.isArray(payload?.dados) ? payload.dados : [];
            setMotoristas(list);
            setInicio(payload?.inicio || range.inicio);
            setFim(payload?.fim || range.fim);
            setTab("motoristas");
            setMsg(
                atualizar
                    ? `Motoristas atualizados pela iTrack: ${list.length} registro(s) em ${periodoLabel(periodo)}.`
                    : `Motoristas carregados: ${list.length} registro(s) em ${periodoLabel(periodo)}.`
            );
        } catch (e: any) {
            setMsg(e?.message || "Falha ao carregar motoristas.");
        } finally {
            setLoadingMotoristas(false);
        }
    }, [periodoMotorista, inicioCustom, fimCustom]);

    const fetchHistoricoVeicular = useCallback(async (
        periodoManual?: PeriodoRapido,
        placaManual?: string,
        atualizar = false
    ) => {
        const periodo = periodoManual || periodoVeicular;
        const placa = normalizePlaca(placaManual ?? selectedPlaca);
        const range = periodoToRange(periodo, inicioCustom, fimCustom);

        setLoadingHistoricoVeicular(true);
        setMsg(null);
        if (placa) setSelectedPlaca(placa);

        try {
            const qs = new URLSearchParams({
                itrack: "historico_veicular",
                periodo,
                inicio: range.inicio,
                fim: range.fim,
                _t: String(Date.now()),
            });

            if (placa) qs.set("placa", placa);
            if (atualizar) qs.set("atualizar", "1");

            const payload = await fetchJson<any>(`${TELEMETRIA_URL}?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
            });

            if (payload?.erro) throw new Error(payload.msg || "Falha ao carregar histórico veicular.");

            const list = Array.isArray(payload?.dados) ? payload.dados : [];
            setHistoricoVeicular(list);
            setHistoricoVeicularTotalKm(Number(payload?.total_km ?? 0));
            setInicio(payload?.inicio || range.inicio);
            setFim(payload?.fim || range.fim);
            setTab("historico_veicular");
            setMsg(
                atualizar
                    ? `Histórico veicular atualizado pela iTrack: ${list.length} veículo(s) em ${periodoLabel(periodo)}.`
                    : `Histórico veicular carregado: ${list.length} veículo(s) em ${periodoLabel(periodo)}.`
            );
        } catch (e: any) {
            setMsg(e?.message || "Falha ao carregar histórico veicular.");
        } finally {
            setLoadingHistoricoVeicular(false);
        }
    }, [periodoVeicular, inicioCustom, fimCustom, selectedPlaca]);

    const carregarTudo = useCallback(async () => {
        await Promise.all([fetchRows(), fetchVeiculos(false, true)]);
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
        setInicioCustom(date14ToInput(periodo.inicio));
        setFimCustom(date14ToInput(periodo.fim));
        setPeriodoVeicular("custom");

        await fetchHistoricoVeicular("custom", placa, false);
    }, [fetchHistoricoVeicular, selecionarAtendimento]);

    const limparFiltrosAtendimentos = useCallback(() => {
        setBusca("");
        setFiltroTipo("todos");
        setSomenteComPlaca(false);
        setSelectedAtendimentoId(null);
    }, []);

    const limparFiltrosVeiculos = useCallback(() => {
        setBuscaVeiculo("");
        setFiltroStatusVeiculo("todos");
        setSelectedPlaca("");
        setModalPlaca("");
    }, []);

    const limparFiltroHistoricoVeicular = useCallback(() => {
        setSelectedPlaca("");
        setPeriodoVeicular("7d");
        setInicioCustom(date14ToInput(todayStart14()));
        setFimCustom(date14ToInput(todayEnd14()));
    }, []);

    const alternarOrdenacaoMotoristas = useCallback((key: MotoristaSortKey) => {
        if (sortMotoristasBy === key) {
            setSortMotoristasDirection((d) => d === "asc" ? "desc" : "asc");
            return;
        }
        setSortMotoristasBy(key);
        setSortMotoristasDirection(key === "motorista" ? "asc" : "desc");
    }, [sortMotoristasBy]);

    const alternarOrdenacaoHistorico = useCallback((key: HistoricoSortKey) => {
        if (sortHistoricoBy === key) {
            setSortHistoricoDirection((d) => d === "asc" ? "desc" : "asc");
            return;
        }
        setSortHistoricoBy(key);
        setSortHistoricoDirection(key === "placa" ? "asc" : "desc");
    }, [sortHistoricoBy]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    useEffect(() => {
        if (tab !== "ao_vivo" && tab !== "lista_veiculos") return;

        fetchVeiculos(true);

        const id = window.setInterval(() => {
            fetchVeiculos(true);
        }, LIVE_REFRESH_MS);

        return () => window.clearInterval(id);
    }, [tab, fetchVeiculos]);

    useEffect(() => {
        return () => {
            liveAbortRef.current?.abort();
        };
    }, []);

    const veiculosPontos = useMemo(() => veiculos.map(veiculoPonto).filter(Boolean) as Ponto[], [veiculos]);
    const pontosHistorico = useMemo(() => posicoesToPontos(historico?.posicoes ?? []), [historico]);

    const atendimentoSelecionadoPontos = useMemo(() => {
        if (!selectedAtendimento) return [];
        return parsePontosJson(selectedAtendimento.pontos_json);
    }, [selectedAtendimento]);

    const mapaPrincipalPontos = useMemo(() => {
        if (selectedAtendimento && atendimentoSelecionadoPontos.length > 0) return atendimentoSelecionadoPontos;
        return veiculosPontos;
    }, [selectedAtendimento, atendimentoSelecionadoPontos, veiculosPontos]);

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

    const veiculosFiltrados = useMemo(() => {
        const q = buscaVeiculo.trim().toLowerCase();

        return veiculos.filter((v) => {
            const ponto = veiculoPonto(v);
            const st = statusVeiculo(v).label;

            if (filtroStatusVeiculo === "em_movimento" && st !== "Em movimento") return false;
            if (filtroStatusVeiculo === "ligado_parado" && st !== "Ligado/parado") return false;
            if (filtroStatusVeiculo === "desligado" && st !== "Desligado") return false;
            if (filtroStatusVeiculo === "sem_localizacao" && ponto) return false;
            if (filtroStatusVeiculo === "excesso_velocidade" && !velocidadeAlerta(v.velocidade)) return false;
            if (!q) return true;

            const alvo = [
                v.placa,
                placaComTraco(v.placa),
                veiculoDescricao(v),
                veiculoCliente(v),
                veiculoRastreador(v),
                veiculoMotorista(v),
                v.localizacao,
                st,
            ].join(" ").toLowerCase();

            return alvo.includes(q);
        });
    }, [veiculos, buscaVeiculo, filtroStatusVeiculo]);

    const motoristasOrdenados = useMemo(() => {
        const valor = (m: MotoristaResumo) => {
            if (sortMotoristasBy === "motorista") return String(m.motorista ?? m.nome_motorista ?? "").toLowerCase();
            if (sortMotoristasBy === "velocidade_media") return Number(motoristaVelocidadeMedia(m) ?? -1);
            if (sortMotoristasBy === "velocidade_maxima") return Number(motoristaVelocidadeMaxima(m) ?? -1);
            if (sortMotoristasBy === "km_total") return Number(motoristaKmTotal(m) ?? -1);
            return 0;
        };

        return [...motoristas].sort((a, b) => {
            const va = valor(a);
            const vb = valor(b);
            const res = typeof va === "string" || typeof vb === "string" ? String(va).localeCompare(String(vb), "pt-BR") : Number(va) - Number(vb);
            return sortMotoristasDirection === "asc" ? res : -res;
        });
    }, [motoristas, sortMotoristasBy, sortMotoristasDirection]);

    const historicoVeicularOrdenado = useMemo(() => {
        const valor = (h: HistoricoVeicularResumo) => {
            if (sortHistoricoBy === "placa") return normalizePlaca(h.placa);
            if (sortHistoricoBy === "distancia") return Number(h.distancia_percorrida_km ?? distanciaKm(h as any));
            return Number((h as any)[sortHistoricoBy] ?? 0);
        };

        return [...historicoVeicular].sort((a, b) => {
            const va = valor(a);
            const vb = valor(b);
            const res = typeof va === "string" || typeof vb === "string" ? String(va).localeCompare(String(vb), "pt-BR") : Number(va) - Number(vb);
            return sortHistoricoDirection === "asc" ? res : -res;
        });
    }, [historicoVeicular, sortHistoricoBy, sortHistoricoDirection]);

    const exportarVeiculosCsv = useCallback(() => {
        baixarCsv("veiculos-itrack.csv", ["Placa", "Veículo", "Cliente", "Motorista", "Status", "Velocidade", "Ignição", "GPS", "Última posição", "Localização", "Hodômetro"], veiculosFiltrados.map((v) => [
            placaComTraco(v.placa),
            veiculoDescricao(v),
            veiculoCliente(v),
            veiculoMotorista(v),
            statusVeiculo(v).label,
            fmtKmH(v.velocidade),
            Number(v.ignicao) === 1 ? "Ligada" : "Desligada",
            v.gps ?? "-",
            fmtDataHora(veiculoDataPosicao(v)),
            v.localizacao || "-",
            v.hodometro != null ? fmtM(v.hodometro) : "-",
        ]));
    }, [veiculosFiltrados]);

    const exportarAtendimentosCsv = useCallback(() => {
        baixarCsv("atendimentos-telemetria.csv", ["ID", "Sepultamento", "Falecido", "Tipo", "Placa", "Veículo", "Agente", "Motorista", "Início", "Fim", "Distância", "Vel. média", "Vel. máxima", "Duração"], rowsFiltradas.map((r) => [
            r.id,
            r.sepultamento_id ?? "-",
            r.falecido || "-",
            tipoLabel(r.tipo),
            placaComTraco(r.placa),
            r.veiculo_nome || "-",
            r.agente || "-",
            r.nome_motorista || "-",
            fmtDataHora(r.inicio_iso || r.inicio_ts),
            fmtDataHora(r.fim_iso || r.fim_ts),
            fmtKm(r.distancia_km),
            fmtKmH(r.velocidade_media),
            fmtKmH(r.velocidade_max),
            fmtDur(r.duracao_s),
        ]));
    }, [rowsFiltradas]);

    const exportarMotoristasCsv = useCallback(() => {
        baixarCsv("motoristas-telemetria.csv", ["Motorista", "Vel. média", "Vel. máxima", "Km rodado"], motoristasOrdenados.map((m) => [
            m.motorista ?? m.nome_motorista ?? "Não informado",
            fmtKmH(motoristaVelocidadeMedia(m)),
            fmtKmH(motoristaVelocidadeMaxima(m)),
            fmtKm(motoristaKmTotal(m)),
        ]));
    }, [motoristasOrdenados]);

    const exportarHistoricoVeicularCsv = useCallback(() => {
        baixarCsv("historico-veicular.csv", ["Veículo", "Placa", "Hod. inicial", "Hod. final", "Km total rodado"], historicoVeicularOrdenado.map((d) => [
            d.descricao_veiculo ?? d.descricaoVeiculo ?? "-",
            placaComTraco(d.placa),
            fmtM(d.hodometro_inicial ?? d.hodometroInicial),
            fmtM(d.hodometro_final ?? d.hodometroFinal),
            fmtKm(d.distancia_percorrida_km ?? distanciaKm(d as any)),
        ]));
    }, [historicoVeicularOrdenado]);

    const kpis = useMemo(() => {
        const emMovimento = veiculos.filter((v) => statusVeiculo(v).label === "Em movimento").length;
        const ligados = veiculos.filter((v) => Number(v.ignicao) === 1).length;
        const atendComPlaca = rows.filter((r) => normalizePlaca(r.placa || "")).length;
        const semLocalizacao = veiculos.filter((v) => !veiculoPonto(v)).length;
        const excessoVelocidade = veiculos.filter((v) => velocidadeAlerta(v.velocidade)).length;

        return {
            veiculos: veiculos.length,
            emMovimento,
            ligados,
            atendimentos: rows.length,
            atendComPlaca,
            semLocalizacao,
            excessoVelocidade,
        };
    }, [veiculos, rows]);

    const resumoHistorico = useMemo(() => {
        const pos = posicoesOrdenadas(historico?.posicoes ?? []);
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

    const mensagemMapaVazio = useMemo(() => {
        if (tab === "atendimentos") return "Selecione um atendimento com pontos salvos para exibir a rota no mapa.";
        if (tab === "motoristas") return "A aba Motorista mostra velocidade média, máxima e km rodado por condutor.";
        if (tab === "historico_veicular") return "A aba Histórico Veicular mostra veículo, placa, hodômetro e km total rodado no período.";
        return "Clique em Atualizar agora para carregar as posições atuais.";
    }, [tab]);

    return (
        <div className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-6">
            <section className="mb-5 rounded-2xl border bg-white p-3 shadow-sm md:p-4">
                {tab === "ao_vivo" || tab === "lista_veiculos" ? (
                    <LiveVehiclesMap
                        veiculos={veiculos}
                        selectedPlaca={selectedPlaca}
                        loading={loadingVeiculos}
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

                {mapaPrincipalPontos.length === 0 && tab !== "ao_vivo" && tab !== "lista_veiculos" && (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                        {mensagemMapaVazio}
                    </div>
                )}

                <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="grid flex-1 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                        <KPI label="Veículos" value={String(kpis.veiculos)} />
                        <KPI label="Em movimento" value={String(kpis.emMovimento)} />
                        <KPI label="Ignição ligada" value={String(kpis.ligados)} />
                        <KPI label="Sem localização" value={String(kpis.semLocalizacao)} />
                        <KPI label="Vel. alta" value={String(kpis.excessoVelocidade)} />
                    </div>

                    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto lg:flex lg:flex-wrap">
                        <button
                            onClick={() => {
                                setTab("ao_vivo");
                                fetchVeiculos(false, true);
                            }}
                            disabled={loadingVeiculos}
                            className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
                        >
                            {loadingVeiculos ? "Consultando..." : "Atualizar agora"}
                        </button>

                        <button
                            onClick={carregarTudo}
                            disabled={loadingGeral}
                            className="inline-flex w-full items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-medium disabled:opacity-60 sm:w-auto"
                        >
                            Atualizar tudo
                        </button>
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

            <ConsumoModal
                open={consumoAberto}
                veiculos={veiculos}
                historicoVeicular={historicoVeicularOrdenado}
                placa={consumoPlaca}
                setPlaca={setConsumoPlaca}
                kmPorLitro={consumoKmPorLitro}
                setKmPorLitro={setConsumoKmPorLitro}
                precoLitro={consumoPrecoLitro}
                setPrecoLitro={setConsumoPrecoLitro}
                periodo={periodoVeicular}
                setPeriodo={setPeriodoVeicular}
                inicioCustom={inicioCustom}
                setInicioCustom={setInicioCustom}
                fimCustom={fimCustom}
                setFimCustom={setFimCustom}
                loading={loadingHistoricoVeicular}
                onConsultar={() => fetchHistoricoVeicular(periodoVeicular, consumoPlaca || selectedPlaca || undefined)}
                onClose={() => setConsumoAberto(false)}
            />

            <nav className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <TabButton active={tab === "ao_vivo"} onClick={() => {
                    setTab("ao_vivo");
                    if (veiculos.length === 0) fetchVeiculos(true);
                }}>
                    🚗 Veículos ao vivo
                </TabButton>
                <TabButton active={tab === "lista_veiculos"} onClick={() => {
                    setTab("lista_veiculos");
                    if (veiculos.length === 0) fetchVeiculos(true);
                }}>
                    Listar Veículos
                </TabButton>
                <TabButton active={tab === "atendimentos"} onClick={() => setTab("atendimentos")}>
                    Atendimentos funerários
                </TabButton>
                <TabButton active={tab === "motoristas"} onClick={() => {
                    setTab("motoristas");
                    if (motoristas.length === 0) fetchMotoristas();
                }}>
                    Motorista
                </TabButton>
                <TabButton active={tab === "historico_veicular"} onClick={() => {
                    setTab("historico_veicular");
                    if (historicoVeicular.length === 0) fetchHistoricoVeicular();
                }}>
                    Histórico Veicular
                </TabButton>
                <button
                    type="button"
                    onClick={() => {
                        const placaBase = selectedPlaca || veiculosFiltrados[0]?.placa || historicoVeicularOrdenado[0]?.placa || "";
                        setConsumoPlaca(normalizePlaca(consumoPlaca || placaBase));
                        setConsumoAberto(true);
                    }}
                    className="inline-flex w-full items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:w-auto"
                >
                    ⛽ Consumo
                </button>
            </nav>

            {tab === "lista_veiculos" && (
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Frota iTrack</h2>
                            <p className="text-sm text-slate-500">
                                {veiculosFiltrados.length} de {veiculos.length} veículo(s) • tempo real {LIVE_REFRESH_MS / 1000}s • última atualização: {ultimaAtualizacaoAoVivo ? ultimaAtualizacaoAoVivo.toLocaleTimeString("pt-BR") : "-"}
                            </p>
                        </div>

                        <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-[260px_190px_auto_auto]">
                            <input
                                value={buscaVeiculo}
                                onChange={(e) => setBuscaVeiculo(e.target.value)}
                                placeholder="Buscar placa, motorista, local..."
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                            />

                            <select
                                value={filtroStatusVeiculo}
                                onChange={(e) => setFiltroStatusVeiculo(e.target.value as VeiculoFiltroStatus)}
                                className="rounded-xl border px-3 py-2 text-sm"
                            >
                                <option value="todos">Todos os status</option>
                                <option value="em_movimento">Em movimento</option>
                                <option value="ligado_parado">Ligado/parado</option>
                                <option value="desligado">Desligado</option>
                                <option value="sem_localizacao">Sem localização</option>
                                <option value="excesso_velocidade">Velocidade alta</option>
                            </select>

                            <button
                                onClick={limparFiltrosVeiculos}
                                className="inline-flex w-full items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium xl:w-auto"
                            >
                                Limpar
                            </button>

                            <button
                                onClick={exportarVeiculosCsv}
                                disabled={veiculosFiltrados.length === 0}
                                className="inline-flex w-full items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-medium disabled:opacity-60 xl:w-auto"
                            >
                                Exportar CSV
                            </button>
                        </div>
                    </div>

                    {veiculos.length === 0 ? (
                        <EmptyState
                            title="Nenhum veículo carregado"
                            text="Clique em Atualizar agora para consultar a iTrack em tempo real."
                        />
                    ) : (
                        veiculosFiltrados.length === 0 ? (
                            <EmptyState title="Nenhum veículo encontrado" text="Ajuste a busca ou os filtros para visualizar a frota." />
                        ) : (
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {veiculosFiltrados.map((v, idx) => {
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

                                                <div className="flex flex-col items-end gap-1">
                                                    <Badge tone={st.tone}>{st.label}</Badge>
                                                    {velocidadeAlerta(v.velocidade) && <Badge tone="red">Velocidade alta</Badge>}
                                                </div>
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

                                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                <button
                                                    onClick={() => {
                                                        setSelectedPlaca(normalizePlaca(v.placa));
                                                        setTab("historico_veicular");
                                                    }}
                                                    className="rounded-xl border px-3 py-2 text-xs font-medium"
                                                >
                                                    usar placa
                                                </button>

                                                <button
                                                    onClick={() => fetchHistoricoVeicular("1d", v.placa)}
                                                    disabled={loadingHistoricoVeicular}
                                                    className="rounded-xl border px-3 py-2 text-xs font-medium disabled:opacity-60"
                                                >
                                                    histórico hoje
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                </section>
            )}

            {tab === "atendimentos" && (
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Atendimentos funerários</h2>
                            <p className="text-sm text-slate-500">
                                {kpis.atendimentos} atendimento(s), {kpis.atendComPlaca} com placa vinculada.
                            </p>
                        </div>

                        <div className="grid w-full gap-2 md:grid-cols-[1fr_auto_auto] xl:w-auto xl:grid-cols-[260px_auto_auto_auto_auto]">
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

                            <label className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={somenteComPlaca}
                                    onChange={(e) => setSomenteComPlaca(e.target.checked)}
                                />
                                com placa
                            </label>

                            <button
                                onClick={limparFiltrosAtendimentos}
                                className="inline-flex w-full items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium"
                            >
                                Limpar
                            </button>

                            <button
                                onClick={exportarAtendimentosCsv}
                                disabled={rowsFiltradas.length === 0}
                                className="inline-flex w-full items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                            >
                                Exportar CSV
                            </button>
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

                                        <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                                            <button
                                                onClick={() => selecionarAtendimento(row)}
                                                className="rounded-xl border px-3 py-2 text-xs font-medium"
                                            >
                                                selecionar
                                            </button>

                                            <button
                                                onClick={() => consultarAtendimentoCompleto(row)}
                                                disabled={loadingHistoricoVeicular || !row.placa}
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

            {tab === "motoristas" && (
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Motorista</h2>
                            <p className="text-sm text-slate-500">
                                Nome do motorista, velocidade média, velocidade máxima e total de km rodado no período selecionado.
                            </p>
                        </div>

                        <div className="grid w-full gap-2 sm:grid-cols-2 md:w-auto md:grid-cols-none md:flex md:items-end">
                            <PeriodoControls
                                periodo={periodoMotorista}
                                setPeriodo={setPeriodoMotorista}
                                inicioCustom={inicioCustom}
                                setInicioCustom={setInicioCustom}
                                fimCustom={fimCustom}
                                setFimCustom={setFimCustom}
                                onConsultar={() => fetchMotoristas()}
                                loading={loadingMotoristas}
                                buttonText="Consultar cache"
                            />

                            <button
                                onClick={() => fetchMotoristas(periodoMotorista, true)}
                                disabled={loadingMotoristas}
                                className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 md:w-auto"
                            >
                                {loadingMotoristas ? "Atualizando..." : "Atualizar iTrack"}
                            </button>

                            <button
                                onClick={exportarMotoristasCsv}
                                disabled={motoristasOrdenados.length === 0}
                                className="inline-flex w-full items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-medium disabled:opacity-60 md:w-auto"
                            >
                                Exportar CSV
                            </button>
                        </div>
                    </div>

                    {motoristasOrdenados.length === 0 ? (
                        <EmptyState title="Nenhum motorista encontrado" text="Consulte um período para ver velocidade média, velocidade máxima e km rodado por motorista." />
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-2 md:grid-cols-4">
                                <KPI label="Motoristas" value={String(motoristasOrdenados.length)} />
                                <KPI
                                    label="Maior velocidade"
                                    value={fmtKmH(Math.max(...motoristasOrdenados.map((m) => Number(motoristaVelocidadeMaxima(m) ?? 0)).filter(Number.isFinite), 0))}
                                />
                                <KPI
                                    label="Km total"
                                    value={fmtKm(motoristasOrdenados.reduce((total, m) => total + Number(motoristaKmTotal(m) ?? 0), 0))}
                                />
                                <KPI label="Período" value={periodoLabel(periodoMotorista)} />
                            </div>

                            <div className="overflow-x-auto rounded-2xl border">
                                <table className="min-w-full text-left text-sm">
                                    <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2"><SortButton active={sortMotoristasBy === "motorista"} direction={sortMotoristasDirection} onClick={() => alternarOrdenacaoMotoristas("motorista")}>Motorista</SortButton></th>
                                            <th className="px-3 py-2"><SortButton active={sortMotoristasBy === "velocidade_media"} direction={sortMotoristasDirection} onClick={() => alternarOrdenacaoMotoristas("velocidade_media")}>Vel. média</SortButton></th>
                                            <th className="px-3 py-2"><SortButton active={sortMotoristasBy === "velocidade_maxima"} direction={sortMotoristasDirection} onClick={() => alternarOrdenacaoMotoristas("velocidade_maxima")}>Vel. máxima</SortButton></th>
                                            <th className="px-3 py-2"><SortButton active={sortMotoristasBy === "km_total"} direction={sortMotoristasDirection} onClick={() => alternarOrdenacaoMotoristas("km_total")}>Km rodado</SortButton></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {motoristasOrdenados.map((m, idx) => {
                                            const motorista = m.motorista ?? m.nome_motorista ?? "Não informado";
                                            const velocidadeMaxima = motoristaVelocidadeMaxima(m);
                                            return (
                                                <tr key={`${motorista}-${idx}`} className="border-b last:border-0">
                                                    <td className="px-3 py-2 font-medium">{motorista}</td>
                                                    <td className="px-3 py-2">{fmtKmH(motoristaVelocidadeMedia(m))}</td>
                                                    <td className="px-3 py-2 font-semibold">
                                                        <span className="inline-flex items-center gap-2">
                                                            {fmtKmH(velocidadeMaxima)}
                                                            {velocidadeAlerta(velocidadeMaxima) && <Badge tone="red">Alta</Badge>}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 font-semibold">{fmtKm(motoristaKmTotal(m))}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {tab === "historico_veicular" && (
                <section className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Histórico Veicular</h2>
                            <p className="text-sm text-slate-500">
                                Veículo, placa, hodômetro inicial/final e km total rodado no período selecionado.
                            </p>
                        </div>

                        <PeriodoControls
                            periodo={periodoVeicular}
                            setPeriodo={setPeriodoVeicular}
                            inicioCustom={inicioCustom}
                            setInicioCustom={setInicioCustom}
                            fimCustom={fimCustom}
                            setFimCustom={setFimCustom}
                            onConsultar={() => fetchHistoricoVeicular()}
                            loading={loadingHistoricoVeicular}
                            buttonText="Consultar veículos"
                        />
                    </div>

                    <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[1fr_auto_auto_auto_auto]">
                        <input
                            value={selectedPlaca}
                            onChange={(e) => setSelectedPlaca(normalizePlaca(e.target.value))}
                            placeholder="Filtrar por placa, ex.: ABC1234"
                            className="rounded-xl border px-3 py-2 text-sm uppercase"
                            maxLength={7}
                        />

                        <button
                            onClick={() => fetchHistoricoVeicular(periodoVeicular, selectedPlaca || undefined)}
                            disabled={loadingHistoricoVeicular}
                            className="inline-flex w-full items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-60 xl:w-auto"
                        >
                            Filtrar placa
                        </button>

                        <button
                            onClick={() => fetchHistoricoVeicular(periodoVeicular, selectedPlaca || undefined, true)}
                            disabled={loadingHistoricoVeicular}
                            className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 xl:w-auto"
                        >
                            {loadingHistoricoVeicular ? "Atualizando..." : "Atualizar iTrack"}
                        </button>

                        <button
                            onClick={limparFiltroHistoricoVeicular}
                            className="inline-flex w-full items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium xl:w-auto"
                        >
                            Limpar
                        </button>

                        <button
                            onClick={exportarHistoricoVeicularCsv}
                            disabled={historicoVeicularOrdenado.length === 0}
                            className="inline-flex w-full items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-medium disabled:opacity-60 xl:w-auto"
                        >
                            Exportar CSV
                        </button>
                    </div>

                    {historicoVeicularOrdenado.length === 0 ? (
                        <EmptyState title="Nenhum histórico veicular encontrado" text="Consulte um período ou clique em Atualizar iTrack para buscar hodômetro e km total rodado." />
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-2 md:grid-cols-3">
                                <KPI label="Veículos" value={String(historicoVeicularOrdenado.length)} />
                                <KPI label="Km total rodado" value={fmtKm(historicoVeicularTotalKm)} />
                                <KPI label="Período" value={periodoLabel(periodoVeicular)} />
                            </div>

                            <div className="overflow-x-auto rounded-2xl border">
                                <table className="min-w-full text-left text-sm">
                                    <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2">Veículo</th>
                                            <th className="px-3 py-2"><SortButton active={sortHistoricoBy === "placa"} direction={sortHistoricoDirection} onClick={() => alternarOrdenacaoHistorico("placa")}>Placa</SortButton></th>
                                            <th className="px-3 py-2">Hod. inicial</th>
                                            <th className="px-3 py-2"><SortButton active={sortHistoricoBy === "hodometro_final"} direction={sortHistoricoDirection} onClick={() => alternarOrdenacaoHistorico("hodometro_final")}>Hod. final</SortButton></th>
                                            <th className="px-3 py-2"><SortButton active={sortHistoricoBy === "distancia"} direction={sortHistoricoDirection} onClick={() => alternarOrdenacaoHistorico("distancia")}>Km total rodado</SortButton></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historicoVeicularOrdenado.map((d, idx) => (
                                            <tr key={`${d.placa}-${idx}`} className="border-b last:border-0">
                                                <td className="px-3 py-2">{d.descricao_veiculo ?? d.descricaoVeiculo ?? "-"}</td>
                                                <td className="px-3 py-2 font-medium">{placaComTraco(d.placa)}</td>
                                                <td className="px-3 py-2">{fmtM(d.hodometro_inicial ?? d.hodometroInicial)}</td>
                                                <td className="px-3 py-2">{fmtM(d.hodometro_final ?? d.hodometroFinal)}</td>
                                                <td className="px-3 py-2 font-semibold">{fmtKm(d.distancia_percorrida_km ?? distanciaKm(d as any))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}


function PeriodoControls({
    periodo,
    setPeriodo,
    inicioCustom,
    setInicioCustom,
    fimCustom,
    setFimCustom,
    onConsultar,
    loading,
    buttonText,
}: {
    periodo: PeriodoRapido;
    setPeriodo: (p: PeriodoRapido) => void;
    inicioCustom: string;
    setInicioCustom: (v: string) => void;
    fimCustom: string;
    setFimCustom: (v: string) => void;
    onConsultar: () => void;
    loading: boolean;
    buttonText: string;
}) {
    return (
        <div className="grid w-full gap-2 sm:grid-cols-2 md:w-auto md:grid-cols-none md:flex md:items-end">
            <div className="grid gap-1">
                <label className="text-xs font-medium text-slate-500">Período</label>
                <select
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value as PeriodoRapido)}
                    className="rounded-xl border px-3 py-2 text-sm"
                >
                    <option value="1d">Hoje</option>
                    <option value="7d">Últimos 7 dias</option>
                    <option value="30d">Últimos 30 dias</option>
                    <option value="custom">Período específico</option>
                </select>
            </div>

            {periodo === "custom" && (
                <>
                    <div className="grid gap-1">
                        <label className="text-xs font-medium text-slate-500">Início</label>
                        <input
                            type="date"
                            value={inicioCustom}
                            onChange={(e) => setInicioCustom(e.target.value)}
                            className="rounded-xl border px-3 py-2 text-sm"
                        />
                    </div>

                    <div className="grid gap-1">
                        <label className="text-xs font-medium text-slate-500">Fim</label>
                        <input
                            type="date"
                            value={fimCustom}
                            onChange={(e) => setFimCustom(e.target.value)}
                            className="rounded-xl border px-3 py-2 text-sm"
                        />
                    </div>
                </>
            )}

            <button
                onClick={onConsultar}
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 md:w-auto"
            >
                {loading ? "Consultando..." : buttonText}
            </button>
        </div>
    );
}


function ConsumoModal({
    open,
    veiculos,
    historicoVeicular,
    placa,
    setPlaca,
    kmPorLitro,
    setKmPorLitro,
    precoLitro,
    setPrecoLitro,
    periodo,
    setPeriodo,
    inicioCustom,
    setInicioCustom,
    fimCustom,
    setFimCustom,
    loading,
    onConsultar,
    onClose,
}: {
    open: boolean;
    veiculos: ItrackVeiculo[];
    historicoVeicular: HistoricoVeicularResumo[];
    placa: string;
    setPlaca: (v: string) => void;
    kmPorLitro: string;
    setKmPorLitro: (v: string) => void;
    precoLitro: string;
    setPrecoLitro: (v: string) => void;
    periodo: PeriodoRapido;
    setPeriodo: (p: PeriodoRapido) => void;
    inicioCustom: string;
    setInicioCustom: (v: string) => void;
    fimCustom: string;
    setFimCustom: (v: string) => void;
    loading: boolean;
    onConsultar: () => void;
    onClose: () => void;
}) {
    const opcoesVeiculo = useMemo(() => {
        const map = new Map<string, { placa: string; label: string }>();

        historicoVeicular.forEach((h) => {
            const p = normalizePlaca(h.placa || "");
            if (!p) return;
            const nome = h.descricao_veiculo ?? h.descricaoVeiculo ?? "Veículo";
            map.set(p, { placa: p, label: `${placaComTraco(p)} • ${nome}` });
        });

        veiculos.forEach((v) => {
            const p = normalizePlaca(v.placa || "");
            if (!p || map.has(p)) return;
            map.set(p, { placa: p, label: `${placaComTraco(p)} • ${veiculoDescricao(v)}` });
        });

        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    }, [veiculos, historicoVeicular]);

    const placaNormalizada = normalizePlaca(placa);
    const historicoSelecionado = historicoVeicular.find((h) => normalizePlaca(h.placa || "") === placaNormalizada) || null;
    const veiculoSelecionado = veiculos.find((v) => normalizePlaca(v.placa || "") === placaNormalizada) || null;

    const kmRodado = historicoSelecionado ? distanciaKm(historicoSelecionado as any) : 0;
    const consumoKmLitro = parseNumeroBr(kmPorLitro);
    const preco = parseNumeroBr(precoLitro);
    const litrosEstimados = consumoKmLitro > 0 ? kmRodado / consumoKmLitro : 0;
    const gastoEstimado = litrosEstimados * preco;
    const podeCalcular = !!placaNormalizada && consumoKmLitro > 0 && preco > 0;

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
            <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border bg-white shadow-2xl">
                <div className="relative overflow-hidden rounded-t-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-5 text-white">
                    <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
                    <div className="absolute -bottom-20 left-8 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />

                    <div className="relative flex items-start justify-between gap-4">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-200">Consumo</div>
                            <h2 className="mt-2 text-2xl font-black">Estimativa de combustível</h2>
                            <p className="mt-1 max-w-xl text-sm text-slate-200">
                                Escolha o veículo, informe o consumo médio e o preço do combustível para estimar o gasto no período selecionado.
                            </p>
                        </div>

                        <button
                            onClick={onClose}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-xl font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
                            aria-label="Fechar"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div className="space-y-5 p-5">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-1 md:col-span-2">
                            <label className="text-xs font-medium text-slate-500">Veículo</label>
                            <select
                                value={placaNormalizada}
                                onChange={(e) => setPlaca(normalizePlaca(e.target.value))}
                                className="rounded-xl border px-3 py-2 text-sm"
                            >
                                <option value="">Selecione um veículo</option>
                                {opcoesVeiculo.map((op) => (
                                    <option key={op.placa} value={op.placa}>{op.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid gap-1">
                            <label className="text-xs font-medium text-slate-500">Km por litro</label>
                            <input
                                value={kmPorLitro}
                                onChange={(e) => setKmPorLitro(e.target.value)}
                                inputMode="decimal"
                                placeholder="Ex.: 10"
                                className="rounded-xl border px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="grid gap-1">
                            <label className="text-xs font-medium text-slate-500">Preço do combustível</label>
                            <input
                                value={precoLitro}
                                onChange={(e) => setPrecoLitro(e.target.value)}
                                inputMode="decimal"
                                placeholder="Ex.: 6,00"
                                className="rounded-xl border px-3 py-2 text-sm"
                            />
                        </div>
                    </div>

                    <div className="rounded-2xl border bg-slate-50 p-3">
                        <PeriodoControls
                            periodo={periodo}
                            setPeriodo={setPeriodo}
                            inicioCustom={inicioCustom}
                            setInicioCustom={setInicioCustom}
                            fimCustom={fimCustom}
                            setFimCustom={setFimCustom}
                            onConsultar={onConsultar}
                            loading={loading}
                            buttonText="Calcular consumo"
                        />
                    </div>

                    {!placaNormalizada && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            Selecione um veículo para calcular o consumo.
                        </div>
                    )}

                    {placaNormalizada && !historicoSelecionado && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                            Não há histórico carregado para {placaComTraco(placaNormalizada)} neste período. Clique em <strong>Calcular consumo</strong> para consultar o histórico veicular existente.
                        </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-4">
                        <KPI label="Período" value={periodoLabel(periodo)} compact />
                        <KPI label="Km rodado" value={fmtKm(kmRodado)} compact />
                        <KPI label="Litros estimados" value={podeCalcular ? `${litrosEstimados.toFixed(2).replace(".", ",")} L` : "-"} compact />
                        <KPI label="Gasto estimado" value={podeCalcular ? fmtMoeda(gastoEstimado) : "-"} compact />
                    </div>

                    <div className="rounded-2xl border p-4 text-sm">
                        <div className="grid gap-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">Veículo</span>
                                <span className="text-right font-semibold text-slate-900">
                                    {historicoSelecionado?.descricao_veiculo ?? historicoSelecionado?.descricaoVeiculo ?? (veiculoSelecionado ? veiculoDescricao(veiculoSelecionado) : "-")}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">Placa</span>
                                <span className="text-right font-semibold text-slate-900">{placaNormalizada ? placaComTraco(placaNormalizada) : "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">Consumo informado</span>
                                <span className="text-right font-semibold text-slate-900">{consumoKmLitro > 0 ? `${consumoKmLitro.toFixed(2).replace(".", ",")} km/L` : "-"}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">Preço por litro</span>
                                <span className="text-right font-semibold text-slate-900">{preco > 0 ? fmtMoeda(preco) : "-"}</span>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs leading-relaxed text-slate-500">
                        O cálculo é estimado: km rodado ÷ km por litro × preço do combustível. Ele usa o histórico veicular já consultado para o período selecionado.
                    </p>
                </div>
            </div>
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
    const angle = -118 + pct * 236;
    const st = statusVeiculo(veiculo);
    const isHighSpeed = velocidadeAlerta(velocidade);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
            <div className="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-white/70 bg-white shadow-2xl">
                <div className="relative overflow-hidden rounded-t-[2rem] bg-slate-950 px-5 pb-6 pt-5 text-white">
                    <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-400/20 blur-2xl" />
                    <div className="absolute -bottom-20 left-8 h-44 w-44 rounded-full bg-blue-500/20 blur-3xl" />

                    <div className="relative flex items-start justify-between gap-4">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">Painel do veículo</div>
                            <div className="mt-2 text-xl font-black leading-tight">{veiculoDescricao(veiculo)}</div>
                            <div className="mt-1 inline-flex rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white ring-1 ring-white/15">
                                {placaComTraco(veiculo.placa)}
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-xl font-bold text-white ring-1 ring-white/20 transition hover:bg-white/20"
                            aria-label="Fechar"
                        >
                            ×
                        </button>
                    </div>

                    <div className="relative mt-5 rounded-[1.5rem] bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
                        <div className="mx-auto max-w-[280px]">
                            <div className="relative mx-auto h-40 w-full overflow-hidden">
                                <div
                                    className="absolute left-1/2 top-4 h-56 w-56 -translate-x-1/2 rounded-full border border-white/10 shadow-inner"
                                    style={{
                                        background: `conic-gradient(from 242deg, #22c55e 0deg, #22c55e ${Math.min(128, pct * 236)}deg, #f59e0b ${Math.min(128, pct * 236)}deg, #f59e0b ${Math.min(190, pct * 236)}deg, #ef4444 ${Math.min(190, pct * 236)}deg, #ef4444 ${pct * 236}deg, rgba(255,255,255,0.12) ${pct * 236}deg, rgba(255,255,255,0.12) 236deg, transparent 236deg)`,
                                    }}
                                />
                                <div className="absolute left-1/2 top-10 h-44 w-44 -translate-x-1/2 rounded-full bg-slate-950 shadow-[inset_0_0_35px_rgba(15,23,42,0.9)]" />

                                {Array.from({ length: 7 }).map((_, i) => {
                                    const a = -118 + i * (236 / 6);
                                    return (
                                        <div
                                            key={i}
                                            className="absolute left-1/2 top-[124px] h-[2px] w-5 origin-left rounded-full bg-white/50"
                                            style={{ transform: `rotate(${a}deg) translateX(88px)` }}
                                        />
                                    );
                                })}

                                <div
                                    className="absolute left-1/2 top-[124px] h-1.5 w-[86px] origin-left rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.65)] transition-transform duration-500"
                                    style={{ transform: `rotate(${angle}deg) translateY(-50%)` }}
                                />
                                <div className="absolute left-1/2 top-[124px] h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-slate-950 shadow-lg" />

                                <div className="absolute inset-x-0 bottom-0 text-center">
                                    <div className="text-6xl font-black leading-none tracking-tight text-white tabular-nums">
                                        {velocidade.toFixed(0)}
                                    </div>
                                    <div className="mt-1 text-xs font-bold uppercase tracking-[0.25em] text-cyan-100">km/h</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 p-5">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border bg-slate-50 p-3">
                            <div className="text-xs font-medium text-slate-500">Status</div>
                            <div className="mt-1 text-sm font-bold text-slate-900">{st.label}</div>
                        </div>
                        <div className="rounded-2xl border bg-slate-50 p-3">
                            <div className="text-xs font-medium text-slate-500">Ignição</div>
                            <div className="mt-1 text-sm font-bold text-slate-900">{Number(veiculo.ignicao) === 1 ? "Ligada" : "Desligada"}</div>
                        </div>
                    </div>

                    {isHighSpeed && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                            Atenção: velocidade acima do limite de referência de {LIMITE_VELOCIDADE_ALERTA} km/h.
                        </div>
                    )}

                    <div className="rounded-2xl border p-4 text-sm">
                        <div className="grid gap-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">Motorista</span>
                                <span className="text-right font-semibold text-slate-900">{veiculoMotorista(veiculo)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">Última posição</span>
                                <span className="text-right font-semibold text-slate-900">{fmtDataHora(veiculoDataPosicao(veiculo))}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">Atualizado na tela</span>
                                <span className="text-right font-semibold text-slate-900">{lastUpdate ? lastUpdate.toLocaleTimeString("pt-BR") : "-"}</span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-slate-500">Localização</span>
                                <span className="max-w-[220px] text-right font-semibold text-slate-900">{veiculo.localizacao || "-"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

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
                    : tone === "red"
                        ? "bg-red-50 text-red-700 border-red-200"
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
            className={`inline-flex w-full items-center justify-center rounded-xl border px-3 py-2 text-center text-sm font-medium sm:w-auto ${active ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700"}`}
        >
            {children}
        </button>
    );
}

function SortButton({
    active,
    direction,
    onClick,
    children,
}: {
    active: boolean;
    direction: SortDirection;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1 font-semibold hover:text-slate-900"
        >
            <span>{children}</span>
            {active && <span className="text-[10px]">{direction === "asc" ? "▲" : "▼"}</span>}
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
