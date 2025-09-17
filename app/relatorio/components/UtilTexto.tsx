"use client";
import React from "react";

/* ======================== Textos ======================== */

export function sanitize(txt?: string) {
    if (!txt) return "";
    return String(txt)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function capitalize(s?: string) {
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function titleCaseFromSnake(s: string) {
    return s
        .split("_")
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
        .join(" ");
}

/** Override VISUAL de rótulos */
export function overrideCampoNome(originalKey: string, nomeAtual: string) {
    const k = (originalKey || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\d]+/gu, "_")
        .replace(/^_+|_+$/g, "");
    const MAP: Record<string, string> = {
        assistencia: "Assistência",
        ornamentaca: "Ornamentação",
        ornamentacao_tipo: "Tipo de Ornamentação",
        religiao: "Religião",
        convenio: "Convênio",
        local_velorio: "Local do Velório",
        data_inicio_velorio: "Data de Início do Velório",
        data_fim_velorio: "Data do Fim do Velório",
        hora_inicio_velorio: "Horário de Início do Velório",
        hora_fim_velorio: "Horário do Sepultamento",
        observacao_velorio01: "Observação de Velório",
        observacao_velorio02: "Observação de Sepultamento",
        observacao_atendimento: "Observação do Atendimento",
        observacao_itens: "Observação dos Itens",
    };
    return MAP[k] ?? nomeAtual;
}

/** Substitui rótulos em textos livres vindos do backend */
export function substituirRotuloVisual(texto: string) {
    if (!texto) return texto;
    const repl = (src: string | RegExp, dst: string) => (texto = texto.replace(src as any, dst));
    repl(/\brelig[ií]ao\b/gi, "Religião");
    repl(/\bconvenio\b/gi, "Convênio");
    repl(/\blocal[_\s]*vel[oó]rio\b/gi, "Local do Velório");
    repl(/\bdata[_\s]*inicio[_\s]*vel[oó]rio\b/gi, "Data de Início do Velório");
    repl(/\bdata[_\s]*fim[_\s]*vel[oó]rio\b/gi, "Data do Fim do Velório");
    repl(/\bhora[_\s]*inicio[_\s]*vel[oó]rio\b/gi, "Horário de Início do Velório");
    repl(/\bhora[_\s]*fim[_\s]*vel[oó]rio\b/gi, "Horário do Sepultamento");
    repl(/\bobservacao[_\s]*velorio01\b/gi, "Observação de Velório");
    repl(/\bobservacao[_\s]*velorio02\b/gi, "Observação de Sepultamento");
    repl(/\bobservacao[_\s]*atendimento\b/gi, "Observação do Atendimento");
    repl(/\bobservacao[_\s]*itens?\b/gi, "Observação dos Itens");
    return texto;
}
