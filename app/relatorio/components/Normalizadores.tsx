"use client";
import React from "react";
import { LogItem } from "./TiposHistorico";
import { FASES_NOMES } from "./ConstantesFases";
import { formataSeDataIso } from "./UtilDatas";
import { substituirRotuloVisual, overrideCampoNome, titleCaseFromSnake } from "./UtilTexto";

/* ======================== Helpers de Normalização ======================== */

export function asBool(v: any): boolean {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        return s === "1" || s === "true" || s === "sim" || s === "on";
    }
    return false;
}

export function isNoChangeKey(k: string) {
    return /^sem[\s_]*alterac(?:o|oe)es?$/i.test((k || "").trim());
}

export function isNoChangeEntry(ent: LogItem): boolean {
    const ac = (ent.acao || "").toLowerCase();
    if (!ac.includes("editou")) return false;
    const raw = ent.detalhes as any;
    if (!raw) return true;
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!obj || typeof obj !== "object") return true;
        if (asBool((obj as any).sem_alteracoes)) return true;
        for (const key of Object.keys(obj)) {
            if (["id", "acao"].includes(key)) continue;
            const v = obj[key];
            if (v == null) continue;
            if (typeof v === "object") continue;
            if (isNoChangeKey(key) && asBool(v)) continue;
            if (String(v).trim() !== "") return false;
        }
        return true;
    } catch {
        return String(raw || "").trim() === "";
    }
}

export function normalizaChave(k: string) {
    return k.trim().toLowerCase().replace(/\s+/g, "_");
}

export function extrairParesDoDetalhe(raw: any): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw) return out;
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && typeof obj === "object") {
            for (const key of Object.keys(obj)) {
                if (["id", "acao", "materiais_json"].includes(key)) continue;
                const val = (obj as any)[key];
                if (isNoChangeKey(key) && asBool(val)) continue;
                if (val == null) continue;
                if (typeof val === "object") continue;
                let v = String(val).trim();
                if (!v) continue;
                if (v.startsWith("fase") && FASES_NOMES[v]) v = FASES_NOMES[v];
                v = formataSeDataIso(v);
                v = substituirRotuloVisual(v);
                const nomeVis = overrideCampoNome(key, titleCaseFromSnake(key));
                const kNorm = normalizaChave(nomeVis);
                out[kNorm] = v;
            }
            return out;
        }
    } catch {
        return {};
    }
    return out;
}

export function montarResumoFinalDoLog(log: LogItem[]) {
    const resumo: Record<string, string> = {};
    const ord = [...log].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    for (const ent of ord) {
        const pares = extrairParesDoDetalhe(ent.detalhes);
        for (const [k, v] of Object.entries(pares)) resumo[k] = v;
    }
    return resumo;
}

export function estaFinalizado(log: LogItem[]) {
    if (!log?.length) return false;
    const ult = [...log].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || "")).at(-1);
    const s = (ult?.status_novo || "").toLowerCase();
    return s === "fase11" || s === "material recolhido";
}
