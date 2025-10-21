"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API } from "../acompanhamento/components/constants";

/** Coerção e formatação seguras para números vindos como string */
function num(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function fmtFixed(v: any, d: number): string {
    const n = num(v);
    return n === null ? "-" : n.toFixed(d);
}
function fmtLatLng(lat: any, lng: any): string | null {
    const la = num(lat);
    const ln = num(lng);
    if (la === null || ln === null) return null;
    return `${la.toFixed(5)}, ${ln.toFixed(5)}`;
}
function secsToMinSec(s: any): string {
    const n = num(s);
    if (n === null) return "-";
    const mm = Math.floor(n / 60);
    const ss = Math.floor(n % 60);
    return `${mm}m ${ss}s`;
}

type Row = {
    id: number | string;
    sepultamento_id: number | string;
    tipo: "remocao" | "para_velorio" | "para_sepultamento" | string;
    agente?: string | null;
    falecido?: string | null;
    veiculo_nome?: string | null;
    veiculo_obs?: string | null;
    inicio_ts?: string | null;
    inicio_lat?: number | string | null;
    inicio_lng?: number | string | null;
    fim_ts?: string | null;
    fim_lat?: number | string | null;
    fim_lng?: number | string | null;
    distancia_km?: number | string | null;
    duracao_seg?: number | string | null;
    vel_media_kmh?: number | string | null;
    vel_max_kmh?: number | string | null;
    amostras?: number | string | null;
    pontos_json?: string | null;
    source_device?: string | null;
    encerrado?: 0 | 1 | string | null;
    criado_em?: string | null;
    atualizado_em?: string | null;
};

export default function TelemetriaPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [fSepId, setFSepId] = useState<string>("");
    const [fTipo, setFTipo] = useState<string>("");

    const fetchList = useCallback(async () => {
        setLoading(true);
        setMsg(null);
        try {
            const qs = new URLSearchParams({ listar: "1" });
            if (fSepId.trim()) qs.set("sepultamento_id", fSepId.trim());
            if (fTipo.trim()) qs.set("tipo", fTipo.trim());

            const r = await fetch(`${API}/api/php/telemetria.php?${qs.toString()}`, {
                credentials: "include",
                cache: "no-store",
                headers: {
                    Pragma: "no-cache",
                    Expires: "0",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            });
            const j = await r.json();
            if (j?.sucesso) {
                const arr = Array.isArray(j.dados) ? j.dados : [];
                setRows(arr);
            } else {
                setMsg(j?.msg || "Erro ao listar.");
            }
        } catch (e: any) {
            setMsg(e?.message || "Falha ao listar.");
        } finally {
            setLoading(false);
        }
    }, [fSepId, fTipo]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const totalKm = useMemo(
        () => rows.reduce((acc, r) => acc + (num(r.distancia_km) ?? 0), 0),
        [rows]
    );
    const totalSeg = useMemo(
        () => rows.reduce((acc, r) => acc + (num(r.duracao_seg) ?? 0), 0),
        [rows]
    );

    const seedNow = useCallback(async () => {
        setMsg(null);
        try {
            const r = await fetch(`${API}/api/php/telemetria.php`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ acao: "seed" }),
            });
            const j = await r.json();
            if (j?.sucesso) {
                setMsg("Seed inserido.");
                fetchList();
            } else setMsg(j?.msg || "Falha ao inserir seed.");
        } catch (e: any) {
            setMsg(e?.message || "Erro no seed.");
        }
    }, [fetchList]);

    return (
        <div className="p-6">
            <header className="mb-5 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Relatório de Telemetria (teste)</h1>
                    <p className="text-sm text-muted-foreground">
                        Armazenamento e listagem inicial dos deslocamentos (sem mapa por enquanto).
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        className="rounded-md border px-3 py-2 text-sm"
                        onClick={fetchList}
                        disabled={loading}
                    >
                        Atualizar
                    </button>
                    <button
                        className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white"
                        onClick={seedNow}
                        title="Insere 3 linhas de exemplo no banco (remova em produção)"
                    >
                        Inserir dados de teste
                    </button>
                </div>
            </header>

            {/* Filtros */}
            <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                    <label className="mb-1 block text-sm font-medium">Sepultamento ID</label>
                    <input
                        type="text"
                        className="w-40 rounded-md border px-3 py-2 text-sm"
                        value={fSepId}
                        onChange={(e) => setFSepId(e.target.value)}
                        placeholder="ex.: 101"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium">Tipo</label>
                    <select
                        className="w-48 rounded-md border px-3 py-2 text-sm"
                        value={fTipo}
                        onChange={(e) => setFTipo(e.target.value)}
                    >
                        <option value="">Todos</option>
                        <option value="remocao">Remoção</option>
                        <option value="para_velorio">Para Velório</option>
                        <option value="para_sepultamento">Para Sepultamento</option>
                    </select>
                </div>
                <button className="rounded-md border px-3 py-2 text-sm" onClick={fetchList} disabled={loading}>
                    Filtrar
                </button>
                {msg && <span className="ml-2 text-sm text-red-600">{msg}</span>}
            </div>

            {/* KPIs resumidos */}
            <div className="mb-3 flex flex-wrap gap-3 text-sm">
                <span className="rounded bg-slate-100 px-3 py-1">
                    Registros: <b>{rows.length}</b>
                </span>
                <span className="rounded bg-slate-100 px-3 py-1">
                    Distância total: <b>{fmtFixed(totalKm, 3)} km</b>
                </span>
                <span className="rounded bg-slate-100 px-3 py-1">
                    Tempo total:{" "}
                    <b>
                        {Math.floor(totalSeg / 3600)}h {Math.floor((totalSeg % 3600) / 60)}m
                    </b>
                </span>
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto rounded-xl border">
                <table className="min-w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="px-3 py-2 text-left">ID</th>
                            <th className="px-3 py-2 text-left">Sepultamento</th>
                            <th className="px-3 py-2 text-left">Tipo</th>
                            <th className="px-3 py-2 text-left">Agente</th>
                            <th className="px-3 py-2 text-left">Falecido(a)</th>
                            <th className="px-3 py-2 text-left">Veículo</th>
                            <th className="px-3 py-2 text-left">Início</th>
                            <th className="px-3 py-2 text-left">Fim</th>
                            <th className="px-3 py-2 text-left">Dist. (km)</th>
                            <th className="px-3 py-2 text-left">Duração</th>
                            <th className="px-3 py-2 text-left">V. média</th>
                            <th className="px-3 py-2 text-left">V. máx</th>
                            <th className="px-3 py-2 text-left">Amostras</th>
                            <th className="px-3 py-2 text-left">Obs</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={14} className="px-3 py-6 text-center opacity-70">
                                    Nenhum dado.
                                </td>
                            </tr>
                        ) : (
                            rows.map((r) => {
                                const inicioCoords = fmtLatLng(r.inicio_lat, r.inicio_lng);
                                const fimCoords = fmtLatLng(r.fim_lat, r.fim_lng);
                                return (
                                    <tr key={String(r.id)} className="border-t">
                                        <td className="px-3 py-2">{r.id}</td>
                                        <td className="px-3 py-2">{r.sepultamento_id}</td>
                                        <td className="px-3 py-2">
                                            {r.tipo === "remocao"
                                                ? "Remoção"
                                                : r.tipo === "para_velorio"
                                                    ? "Para Velório"
                                                    : r.tipo === "para_sepultamento"
                                                        ? "Para Sepultamento"
                                                        : String(r.tipo || "")}
                                        </td>
                                        <td className="px-3 py-2">{r.agente || ""}</td>
                                        <td className="px-3 py-2">{r.falecido || ""}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-col">
                                                <span>{r.veiculo_nome || ""}</span>
                                                {r.veiculo_obs ? (
                                                    <span className="text-xs text-muted-foreground">{r.veiculo_obs}</span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-col">
                                                <span>{r.inicio_ts ? new Date(r.inicio_ts).toLocaleString() : "-"}</span>
                                                {inicioCoords ? (
                                                    <span className="text-xs text-muted-foreground">{inicioCoords}</span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-col">
                                                <span>{r.fim_ts ? new Date(r.fim_ts).toLocaleString() : "-"}</span>
                                                {fimCoords ? (
                                                    <span className="text-xs text-muted-foreground">{fimCoords}</span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">{fmtFixed(r.distancia_km, 3)}</td>
                                        <td className="px-3 py-2">{secsToMinSec(r.duracao_seg)}</td>
                                        <td className="px-3 py-2">{fmtFixed(r.vel_media_kmh, 2)}</td>
                                        <td className="px-3 py-2">{fmtFixed(r.vel_max_kmh, 2)}</td>
                                        <td className="px-3 py-2">{num(r.amostras) ?? "-"}</td>
                                        <td className="px-3 py-2">{r.source_device || ""}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
                Dica: use o filtro de <b>Sepultamento ID</b> para ver as viagens de um atendimento específico.
            </p>
        </div>
    );
}
