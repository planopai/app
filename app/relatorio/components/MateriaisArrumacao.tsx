"use client";
import React from "react";

/* ======================== Materiais e Arrumação ======================== */

export const MATERIAL_KEYS = [
    "urnas", "paramentos", "paramentos2", "capela", "flores", "mesa",
    "coroas", "tapete", "podia", "cruz", "vela", "carpete", "castical",
    "frontal", "imagem", "livro_presenca", "porta_retrato",
];

export const MATERIAL_LABELS: Record<string, string> = {
    urnas: "Urnas",
    paramentos: "Paramentos",
    paramentos2: "Paramentos 2",
    capela: "Capela",
    flores: "Flores",
    mesa: "Mesa",
    coroas: "Coroas",
    tapete: "Tapete",
    podia: "Pódia",
    cruz: "Cruz",
    vela: "Velas",
    carpete: "Carpete",
    castical: "Castiçal",
    frontal: "Frontal",
    imagem: "Imagem",
    livro_presenca: "Livro de Presença",
    porta_retrato: "Porta-Retrato",
};

export const ARR_KEYS = [
    "paramentos", "flores", "mesa", "coroas", "tapete",
    "podia", "cruz", "vela", "carpete", "castical", "frontal", "imagem",
];

export const ARR_LABELS: Record<string, string> = {
    paramentos: "Paramentos",
    flores: "Flores",
    mesa: "Mesa",
    coroas: "Coroas",
    tapete: "Tapete",
    podia: "Pódia",
    cruz: "Cruz",
    vela: "Velas",
    carpete: "Carpete",
    castical: "Castiçal",
    frontal: "Frontal",
    imagem: "Imagem",
};

/* ======================== Combinações ======================== */

export const ALL_ITEMS = [...new Set([...MATERIAL_KEYS, ...ARR_KEYS])];
export const ALL_ITEM_LABELS: Record<string, string> = {
    ...MATERIAL_LABELS,
    ...ARR_LABELS,
};
export const ALL_ITEM_TIPO: Record<string, string> = {
    ...Object.fromEntries(MATERIAL_KEYS.map((k) => [k, "Material"])),
    ...Object.fromEntries(ARR_KEYS.map((k) => [k, "Arrumação"])),
};

/* ======================== Helpers ======================== */

export function normSimNao(s: any): boolean {
    if (s == null) return false;
    if (typeof s === "boolean") return s;
    if (typeof s === "number") return s === 1;
    if (typeof s === "string") {
        const st = s.trim().toLowerCase();
        return st === "sim" || st === "1" || st === "true";
    }
    return false;
}

export function extrairEstadoMateriais(obj: any): Record<string, number> {
    const out: Record<string, number> = {};
    if (!obj) return out;
    for (const k of MATERIAL_KEYS) {
        const v = obj[k];
        if (v == null) continue;
        if (typeof v === "number") out[k] = v;
        else if (typeof v === "string" && /^\d+$/.test(v)) out[k] = parseInt(v);
    }
    return out;
}

export function extrairEstadoArrumacao(obj: any): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    if (!obj) return out;
    for (const k of ARR_KEYS) {
        const v = obj[k];
        if (v == null) continue;
        out[k] = normSimNao(v);
    }
    return out;
}
