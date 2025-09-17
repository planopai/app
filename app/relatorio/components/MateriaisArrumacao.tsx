"use client";
import React from "react";

/* ===== Materiais (análise) — exatamente como no original ===== */
export const MATERIAL_KEYS = [
    "cadeiras",
    "bebedouros",
    "suporte_coroa",
    "kit_lanche",
    "velas",
    "tenda",
    "placa",
    "paramentacao",
] as const;
export type MaterialKey = (typeof MATERIAL_KEYS)[number];

export const MATERIAL_LABELS: Record<MaterialKey, string> = {
    cadeiras: "Cadeiras",
    bebedouros: "Bebedouros",
    suporte_coroa: "Suporte Coroa",
    kit_lanche: "Kit Lanche",
    velas: "Velas",
    tenda: "Tenda",
    placa: "Placa",
    paramentacao: "Paramentação",
};

/* ===== Arrumação (análise) — exatamente como no original ===== */
export const ARR_KEYS = [
    "luvas",
    "palha",
    "tamponamento",
    "maquiagem",
    "algodao",
    "cordao",
    "barba",
    "ta32",
    "fluido_cavitario",
    "formol",
    "mascara",
    "invol",
] as const;
export type ArrKey = (typeof ARR_KEYS)[number];

export const ARR_LABELS: Record<ArrKey, string> = {
    luvas: "Luvas",
    palha: "Palha",
    tamponamento: "Tamponamento",
    maquiagem: "Maquiagem",
    algodao: "Algodão",
    cordao: "Cordão",
    barba: "Barba",
    ta32: "TA-32",
    fluido_cavitario: "Fluído Cavitário",
    formol: "Formol",
    mascara: "Máscara",
    invol: "Invol",
};

/* ===== Combinações ===== */
export type AllItemKey = MaterialKey | ArrKey | "assistencia_sim" | "assistencia_nao" | "tanato_sim" | "tanato_nao";
export const ALL_ITEMS: AllItemKey[] = [...MATERIAL_KEYS, ...ARR_KEYS, "assistencia_sim", "assistencia_nao", "tanato_sim", "tanato_nao"];

export const ALL_ITEM_LABELS: Record<AllItemKey, string> = {
    cadeiras: MATERIAL_LABELS.cadeiras,
    bebedouros: MATERIAL_LABELS.bebedouros,
    suporte_coroa: MATERIAL_LABELS.suporte_coroa,
    kit_lanche: MATERIAL_LABELS.kit_lanche,
    velas: MATERIAL_LABELS.velas,
    tenda: MATERIAL_LABELS.tenda,
    placa: MATERIAL_LABELS.placa,
    paramentacao: MATERIAL_LABELS.paramentacao,
    luvas: ARR_LABELS.luvas,
    palha: ARR_LABELS.palha,
    tamponamento: ARR_LABELS.tamponamento,
    maquiagem: ARR_LABELS.maquiagem,
    algodao: ARR_LABELS.algodao,
    cordao: ARR_LABELS.cordao,
    barba: ARR_LABELS.barba,
    ta32: ARR_LABELS.ta32,
    fluido_cavitario: ARR_LABELS.fluido_cavitario,
    formol: ARR_LABELS.formol,
    mascara: ARR_LABELS.mascara,
    invol: ARR_LABELS.invol,
    assistencia_sim: "Assistência (Sim)",
    assistencia_nao: "Assistência (Não)",
    tanato_sim: "Tanatopraxia (Sim)",
    tanato_nao: "Tanatopraxia (Não)",
};

export const ALL_ITEM_TIPO: Record<AllItemKey, "Material" | "Arrumação" | "Assistência" | "Tanatopraxia"> = {
    cadeiras: "Material",
    bebedouros: "Material",
    suporte_coroa: "Material",
    kit_lanche: "Material",
    velas: "Material",
    tenda: "Material",
    placa: "Material",
    paramentacao: "Material",
    luvas: "Arrumação",
    palha: "Arrumação",
    tamponamento: "Arrumação",
    maquiagem: "Arrumação",
    algodao: "Arrumação",
    cordao: "Arrumação",
    barba: "Arrumação",
    ta32: "Arrumação",
    fluido_cavitario: "Arrumação",
    formol: "Arrumação",
    mascara: "Arrumação",
    invol: "Arrumação",
    assistencia_sim: "Assistência",
    assistencia_nao: "Assistência",
    tanato_sim: "Tanatopraxia",
    tanato_nao: "Tanatopraxia",
};

/* ===== Helpers usados na Análise Geral (iguais ao original) ===== */
export function normSimNao(s?: string) {
    const v = (s || "").trim().toLowerCase();
    if (v === "sim") return "sim";
    if (v === "não" || v === "nao") return "nao";
    return "";
}

/** Lê estado de materiais de um objeto de log/registro */
export function extrairEstadoMateriais(obj: any): Record<string, number> {
    const out: Record<string, number> = {};
    if (obj?.materiais_json) {
        try {
            const mj = JSON.parse(obj.materiais_json);
            for (const k of Object.keys(mj || {})) {
                const it = mj[k];
                const qtd = Number(it?.qtd || 0);
                const checked = !!it?.checked;
                if (checked && qtd > 0) out[k] = (out[k] || 0) + qtd;
            }
        } catch { }
    }
    for (const k of MATERIAL_KEYS) {
        const col = obj?.[`materiais_${k}_qtd`];
        const qtd = Number(col || 0);
        if (qtd > 0) out[k] = (out[k] || 0) + qtd;
    }
    return out;
}

/** Lê estado de arrumação (booleans) de um objeto de log/registro */
export function extrairEstadoArrumacao(obj: any): Record<string, boolean> {
    const out: Record<string, boolean> = {} as any;
    for (const k of ARR_KEYS) out[k] = false;
    if (obj?.arrumacao_json) {
        try {
            const a = JSON.parse(obj.arrumacao_json);
            for (const k of ARR_KEYS) out[k] = !!a?.[k];
        } catch { }
    }
    return out;
}
