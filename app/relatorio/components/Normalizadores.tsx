"use client";

import React from "react";
import { LogItem } from "./TiposHistorico";
import { FASES_NOMES } from "./ConstantesFases";
import { formataSeDataIso } from "./UtilDatas";
import { substituirRotuloVisual, overrideCampoNome, titleCaseFromSnake } from "./UtilTexto";
import type { MateriaisMap } from "./Api";

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

function safeJsonParse(v: any) {
    if (v == null) return null;
    if (typeof v === "object") return v;
    if (typeof v !== "string") return null;
    try {
        return JSON.parse(v);
    } catch {
        return null;
    }
}

function isPlainObject(v: any) {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export function isNoChangeKey(k: string) {
    return /^sem[\s_]*alterac(?:o|oe)es?$/i.test((k || "").trim());
}

/** Detecta se existe "algo selecionado" em materiais_json (novo) */
function hasMateriaisJsonChanges(materiaisJson: any): boolean {
    const mj = safeJsonParse(materiaisJson);
    if (!mj || typeof mj !== "object") return false;

    for (const [, vv] of Object.entries(mj)) {
        const v: any = vv || {};
        const qtdNum = Number(v?.qtd ?? 0);
        const qtd = Number.isFinite(qtdNum) ? Math.max(0, Math.floor(qtdNum)) : 0;
        const checked = asBool(v?.checked) || qtd > 0;
        if (checked && qtd > 0) return true;
    }
    return false;
}

/** Ignora "edições sem mudança" */
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

        // ✅ novo: materiais_json
        if (Object.prototype.hasOwnProperty.call(obj, "materiais_json")) {
            if (hasMateriaisJsonChanges((obj as any).materiais_json)) return false;
        }

        // varre campos e procura algo realmente informativo
        for (const key of Object.keys(obj)) {
            if (["id", "acao", "materiais_json"].includes(key)) continue;

            // arrumacao_json
            if (/^arruma[cç][aã]o(\s*json|_json)?$/i.test(key)) {
                let aobj: any = obj[key];
                if (typeof aobj === "string") aobj = safeJsonParse(aobj) || {};
                if (aobj && typeof aobj === "object") {
                    for (const v of Object.values(aobj)) if (asBool(v)) return false;
                }
                continue;
            }

            // materiais_*_qtd (legado)
            const m = key.match(/^materiais_(.+?)_qtd$/i);
            if (m) {
                const qtd = obj[key];
                if (qtd != null && String(qtd).trim() !== "" && Number(qtd) > 0) return false;
                continue;
            }

            // campos simples
            const v = (obj as any)[key];
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

function labelFromKey(key: string) {
    // suporta chaves novas tipo "item:123" / "subitem:45"
    const m = String(key).match(/^(item|subitem)\s*:\s*(.+)$/i);
    if (m) {
        const tipo = m[1].toLowerCase() === "subitem" ? "Subitem" : "Item";
        return `${tipo} ${String(m[2]).trim()}`;
    }
    return overrideCampoNome(key, titleCaseFromSnake(key.replace(/:/g, "_")));
}

function normMatKey(k: string) {
    return String(k || "").trim().toLowerCase().replace(/\s+/g, "");
}

function resolveMaterialLabel(
    key: string,
    v: any,
    materiaisMap?: MateriaisMap
): { categoria: string; nome: string } {
    const overrideNome =
        (typeof v?.nome === "string" && v.nome.trim()) ||
        (typeof v?.rotulo === "string" && v.rotulo.trim()) ||
        (typeof v?.label === "string" && v.label.trim()) ||
        "";

    const fromMap = materiaisMap?.[normMatKey(key)];

    const categoria =
        (typeof v?.categoria_nome === "string" && v.categoria_nome.trim()) ||
        (typeof v?.categoria === "string" && v.categoria.trim()) ||
        fromMap?.categoria ||
        "Material";

    const nome = overrideNome || fromMap?.nome || labelFromKey(String(key));

    return { categoria, nome };
}

/* ======================== Materiais ======================== */

function extrairMateriaisResumo(materiaisJson: any, materiaisMap?: MateriaisMap): string | undefined {
    const mj = safeJsonParse(materiaisJson);
    if (!mj || typeof mj !== "object") return undefined;

    const parts: string[] = [];

    for (const [k, vv] of Object.entries(mj)) {
        const v: any = vv || {};
        const qtdNum = Number(v?.qtd ?? 0);
        const qtd = Number.isFinite(qtdNum) ? Math.max(0, Math.floor(qtdNum)) : 0;
        const checked = asBool(v?.checked) || qtd > 0;

        if (!checked || qtd <= 0) continue;

        const { categoria, nome } = resolveMaterialLabel(String(k), v, materiaisMap);
        parts.push(`${categoria} — ${nome}: ${qtd}`);
    }

    if (!parts.length) return undefined;

    parts.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
    return parts.join(" • ");
}

/** Extrai pares chave→valor dos detalhes (JSON ou texto) — com correções visuais */
export function extrairParesDoDetalhe(raw: any, materiaisMap?: MateriaisMap): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw) return out;

    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && typeof obj === "object") {
            // ✅ novo: materiais_json entra como campo "materiais" (legível)
            if (Object.prototype.hasOwnProperty.call(obj, "materiais_json")) {
                const resumoMats = extrairMateriaisResumo((obj as any).materiais_json, materiaisMap);
                if (resumoMats) out["materiais"] = substituirRotuloVisual(resumoMats);
            }

            for (const key of Object.keys(obj)) {
                if (["id", "acao", "materiais_json"].includes(key)) continue;
                if (/^arruma[cç][aã]o(\s*json|_json)?$/i.test(key)) continue;
                if (/^materiais_.+?_qtd$/i.test(key)) continue;

                const val = (obj as any)[key];

                if (isNoChangeKey(key) && asBool(val)) continue;
                if (val == null) continue;

                // não entra objeto/array bruto no resumo final (exceto materiais_json que já tratamos)
                if (isPlainObject(val) || Array.isArray(val)) continue;

                let v = String(val).trim();
                if (!v) continue;

                if (v.startsWith("fase") && FASES_NOMES[v]) v = FASES_NOMES[v];
                v = formataSeDataIso(v);
                v = substituirRotuloVisual(v);

                const kNorm = normalizaChave(key);
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

            const nomeVis = overrideCampoNome(
                rot,
                rot.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
            );

            let kNorm = normalizaChave(rot);

            if (kNorm === "local_do_velório" || kNorm === "local_do_velorio") {
                kNorm = "local_velorio";
            }

            out[kNorm] = formataSeDataIso(val);
        }
    }

    return out;
}

/** Varre o log cronológico e retorna o último valor visto de cada campo */
export function montarResumoFinalDoLog(log: LogItem[], materiaisMap?: MateriaisMap) {
    const resumo: Record<string, string> = {};
    const ord = [...log].sort((a, b) => (a.datahora || "").localeCompare(b.datahora || ""));
    for (const ent of ord) {
        const pares = extrairParesDoDetalhe(ent.detalhes, materiaisMap);
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
