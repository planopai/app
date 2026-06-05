"use client";
import React from "react";

/* ======================== Fases / Etapas ======================== */

export const FASES_NOMES: Record<string, string> = {
    fase01: "Indo Retirar o Óbito",
    fase02: "Corpo na Clínica",
    fase03: "Ínicio de Conservação",
    fase04: "Fim da Conservação",
    fase05: "Ínicio da Ornamentação",
    fase06: "Fim da Ornamentação",
    fase07: "Transportando Óbito P/Velório",
    fase08: "Entrega de Corpo",
    fase09: "Transportando P/ Sepultamento",
    fase10: "Sepultamento Concluído",
    fase11: "Material Recolhido",
};

/**
 * Ícones por fase.
 * Esses ícones são usados nos logs do relatório para representar exatamente a tarefa executada.
 */
export const FASES_ICONES: Record<string, string> = {
    fase01: "🚑", // Indo Retirar o Óbito
    fase02: "🏥", // Corpo na Clínica
    fase03: "🧪", // Início de Conservação
    fase04: "✅", // Fim da Conservação
    fase05: "🌸", // Início da Ornamentação
    fase06: "🌸", // Fim da Ornamentação
    fase07: "🚐", // Transportando para Velório
    fase08: "⚰️", // Entrega de Corpo
    fase09: "🚐", // Transportando para Sepultamento
    fase10: "✅", // Sepultamento Concluído
    fase11: "📦", // Material Recolhido
};

function normalizarFase(fase?: string) {
    const raw = String(fase || "").trim();

    if (!raw) return "";

    const low = raw.toLowerCase();

    if (low.startsWith("fase")) {
        const n = low.replace(/\D+/g, "");
        if (!n) return low;
        return `fase${n.padStart(2, "0")}`;
    }

    const semAcento = low
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const map: Record<string, string> = {
        removendo: "fase01",
        "indo retirar o obito": "fase01",

        "corpo na clinica": "fase02",
        "aguardando procedimento": "fase02",

        preparando: "fase03",
        "inicio de conservacao": "fase03",
        "início de conservação": "fase03",

        "fim da conservacao": "fase04",
        "fim da conservação": "fase04",
        "aguardando ornamentacao": "fase04",

        ornamentando: "fase05",
        "inicio da ornamentacao": "fase05",
        "início da ornamentação": "fase05",

        "fim da ornamentacao": "fase06",
        "fim da ornamentação": "fase06",
        "corpo pronto": "fase06",

        transportando: "fase07",
        "transportando obito p/velorio": "fase07",
        "transportando obito para velorio": "fase07",
        "transportando p/ velorio": "fase07",
        "transportando para velorio": "fase07",

        velando: "fase08",
        "entrega de corpo": "fase08",

        sepultando: "fase09",
        "transportando p/ sepultamento": "fase09",
        "transportando para sepultamento": "fase09",

        "sepultamento concluido": "fase10",
        "sepultamento concluído": "fase10",

        "material recolhido": "fase11",
        concluido: "fase11",
        concluído: "fase11",
    };

    return map[semAcento] || raw;
}

export function traduzirFase(fase?: string) {
    const f = normalizarFase(fase);
    return f ? FASES_NOMES[f] || fase || "" : "";
}

export function iconeAcao(acao?: string, statusNovo?: string) {
    const fase = normalizarFase(statusNovo);

    if (fase && FASES_ICONES[fase]) {
        return FASES_ICONES[fase];
    }

    const a = (acao || "").toLowerCase();

    if (a.includes("criou")) return "🟢";
    if (a.includes("editou")) return "✏️";
    if (a.includes("assinou")) return "🖊️";
    if (a.includes("foto")) return "🖼️";

    return "📝";
}