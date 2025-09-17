"use client";
import React from "react";
import { FalecidoItem, LogItem, RegistroAnalise } from "./TiposHistorico";

/* ======================== Endpoints ======================== */

const BASE = "/php";

export const LISTAR_FALECIDOS = `${BASE}/falecidos.php?listar=1`;
export const LISTAR_ANALITICO = `${BASE}/informativo.php?listar=1`;
export const LOG_POR_ID = (id: string) => `${BASE}/log.php?sepultamento_id=${id}`;

/* ======================== Fetchers ======================== */

export async function listarFalecidos(): Promise<FalecidoItem[]> {
    const res = await fetch(LISTAR_FALECIDOS);
    const json = await res.json();
    return json?.sucesso ? (json.dados as FalecidoItem[]) : [];
}

export async function listarLogPorId(id: string): Promise<LogItem[]> {
    const res = await fetch(LOG_POR_ID(id));
    const json = await res.json();
    return json?.sucesso ? (json.dados as LogItem[]) : [];
}

export async function listarAnalitico(): Promise<RegistroAnalise[]> {
    const res = await fetch(LISTAR_ANALITICO);
    const json = await res.json();
    return json?.sucesso ? (json.dados as RegistroAnalise[]) : [];
}
