"use client";
import React from "react";
import { LogItem } from "./TiposHistorico";
import { FASES_NOMES } from "./ConstantesFases";
import { formataSeDataIso } from "./UtilDatas";
import { substituirRotuloVisual, overrideCampoNome, titleCaseFromSnake } from "./UtilTexto";

/* ======================== Helpers de Normalização (completos) ======================== */

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

/** Ignora "edições sem mudança" (igual ao grande) */
export function isNoChangeEntry(ent: LogItem): boolean {
    const ac = (ent.acao || "").toLowerCase();
    if (!ac.includes("editou")) return false;

    const raw = ent.detalhes as any;
    if (!raw) return true;

    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!obj || typeof obj !== "object") return true;

        // flag explícita
        if (asBool((obj as any).sem_alteracoes)) return true;

        // varre campos e procura algo realmente informativo
        for (const key of Object.keys(obj)) {
            if (["id", "acao"].includes(key)) continue;

            // arrumacao_json
            if (/^arruma[cç][aã]o(\s*json|_json)?$/i.test(key)) {
                let aobj: any = obj[key];
                if (typeof aobj === "string") {
                    try { aobj = JSON.parse(aobj); } catch { aobj = {}; }
                }
                if (aobj && typeof aobj === "object") {
                    for (const v of Object.values(aobj)) if (asBool(v)) return false;
                }
                continue;
            }

            // materiais_*_qtd
            const m = key.match(/^materiais_(.+?)_qtd$/i);
            if (m) {
                const qtd = obj[key];
                if (qtd != null && String(qtd).trim() !== "" && Number(qtd) > 0) return false;
                continue;
            }

            // campos simples
            const v = obj[key];
            if (v == null) continue;
            if (typeof v === "object") continue;
            if (isNoChangeKey(key) && asBool(v)) continue;
            if (String(v).trim() !== "") return false;
        }
        return true;
    } catch {
        // texto cru: se sobrar algo não-vazio, considera que houve mudança
        let s = String(raw || "");
        s = s.replace(/sem[\s_]*alterac(?:o|oe)es?\s*:\s*true/gi, "");
        s = s.replace(/Arruma[cç][aã]o\s*Json\s*:\s*\{[\s\S]*?\}/gi, "");
        s = s.replace(/arruma[cç][aã]o\s*json\s*:[^\n]*/gi, "");
        s = s.replace(/materiais\s*:\s*\[[^\]]*\]/gi, "");
        s = s.trim();
        return s === "";
    }
}

export function normalizaChave(k: string) {
    return k.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Extrai pares chave→valor dos detalhes (JSON ou texto) — com correções visuais */
export function extrairParesDoDetalhe(raw: any): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw) return out;

    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && typeof obj === "object") {
            for (const key of Object.keys(obj)) {
                if (["id", "acao", "materiais_json"].includes(key)) continue;
                if (/^arruma[cç][aã]o(\s*json|_json)?$/i.test(key)) continue;
                if (/^materiais_.+?_qtd$/i.test(key)) continue;

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
        // Fallback de texto: "Label: Valor"
        const txt = substituirRotuloVisual(String(raw));
        const regex = /([\p{L}\d _/.-]+):\s*([^\n]+)/giu;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(txt))) {
            const rot = m[1]?.trim() || "";
            if (isNoChangeKey(rot)) continue;
            const val = (m[2] || "").trim();
            if (!rot || !val) continue;
            const nomeVis = overrideCampoNome(rot, rot.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()));
            const kNorm = normalizaChave(nomeVis);
            out[kNorm] = formataSeDataIso(val);
        }
    }
    return out;
}

/** Varre o log cronológico e retorna o último valor visto de cada campo */
export function montarResumoFinalDoLog(log: LogItem[]) {
    const resumo: Record<string, string> = {};
    const ord = [...log].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    for (const ent of ord) {
        const pares = extrairParesDoDetalhe(ent.detalhes);
        for (const [k, v] of Object.entries(pares)) resumo[k] = v;
    }
    // rótulos finais já vêm normalizados em extrairParesDoDetalhe
    return resumo;
}

export function estaFinalizado(log: LogItem[]) {
    if (!log?.length) return false;
    const ult = [...log].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || "")).at(-1);
    const s = (ult?.status_novo || "").toLowerCase();
    return s === "fase11" || s === "material recolhido";
}
