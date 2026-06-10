"use client";
import React from "react";

/* ======================== Ordem dos Campos do Resumo ======================== */

export const RESUMO_ORDER: string[] = [
    // Dados do falecido/responsável
    "data_nascimento",
    "data_falecimento",
    "nome_responsavel",
    "cpf_responsavel",

    // Dados gerais
    "assistencia",
    "convenio",
    "religiao",
    "local_velorio",
    "data_inicio_velorio",
    "data_fim_velorio",
    "hora_inicio_velorio",
    "hora_fim_velorio",
    "ornamentacao_tipo",
    "ornamentacao",
];

/* Tipo utilitário para chaves possíveis no resumo */
export type ResumoKey = (typeof RESUMO_ORDER)[number];