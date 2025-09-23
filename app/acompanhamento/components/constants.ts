"use client";
import type { MaterialKey } from "./types";

export const wizardStepTitles = ["Atendimento", "Itens", "Velório", "Sepultamento"];

/**
 * ✅ ATUALIZADO: dois campos foram adicionados após “tanato”,
 * então os índices seguintes andam +2.
 */
export const wizardStepIndexes = [
    // Atendimento → observação agora no índice 17
    [0, 1, 2, 3, 17],

    // Itens:
    // Urna(4), Roupa(5), Assistência(6), Tanato(7),
    // Ornamentação(8), Tipo(9), Conservação do Corpo(10), Obs Itens(18)
    [4, 5, 6, 7, 8, 9, 10, 18],

    // Velório 01 → Local(11), Local Velório(12), Data Início(13), Obs(19)
    [11, 12, 13, 19],

    // Velório 02 → Data Fim(14), Hora Início(15), Hora Fim(16), Obs(20)
    [14, 15, 16, 20],
];

export const steps = [
    { label: "Nome do Falecido(a)", id: "falecido", type: "input", placeholder: "Digite o nome" },
    { label: "Contato", id: "contato", type: "input", placeholder: "Contato/telefone" },
    {
        label: "Religião",
        id: "religiao",
        type: "select",
        options: ["", "Evangélico", "Católico", "Espirita", "Ateu", "Outras", "Não Informado"],
    },
    {
        label: "Convênio",
        id: "convenio",
        type: "select",
        options: [
            "",
            "Particular",
            "Prefeitura de Barreiras",
            "Prefeitura de Angical",
            "Prefeitura de São Desidério",
            "Associado(a)",
        ],
    },
    { label: "Urna", id: "urna", type: "input", placeholder: "Digite o Modelo Da Urna" },

    // 🔄 ROUPA AGORA É DATALIST (EDITÁVEL)
    {
        label: "Roupa",
        id: "roupa",
        type: "datalist",
        placeholder: "Escolha ou digite a roupa",
        datalist: [
            "ROUPA PRÓPRIA",
            "CONJ. MASCULINO - RENASCER",
            "LA BELLE CINZA - NORMAL",
            "CONJ. MASCULINO - RENASCER",
            "CONJ. FEMININO - RENASCER",
            "CONJ. MASCULINO GG",
            "CONJ. FEMININO GG",
            "CONJ. MASCULINO INFANTIL TAM P",
            "CONJ. MASCULINO INFANTIL TAM M",
            "CONJ, MASCULINO INFANTIL TAM G",
            "CONJ. FEMININO INFANTIL TAM P",
            "CONJ. FEMININO INFANTIL TAM M",
            "CONJ. FEMININO INFANTIL TAM G",
        ],
    },

    // Assistência
    {
        label: "Assistência (Materiais)",
        id: "assistencia",
        type: "select",
        options: ["", "Sim", "Não"],
    },

    // Tanatopraxia
    { label: "Tanatopraxia", id: "tanato", type: "select", options: ["", "Sim", "Não"] },

    // ✅ NOVOS CAMPOS
    { label: "Ornamentação", id: "ornamentacao", type: "select", options: ["", "Sim", "Não"] },
    {
        label: "Tipo de Ornamentação",
        id: "ornamentacao_tipo",
        type: "select",
        options: ["", "Natural", "Artificial"],
    },

    // Conservação do Corpo (custom abre modal)
    {
        label: "Conservação do Corpo",
        id: "arrumacao",
        type: "custom",
    },

    {
        label: "Local do Sepultamento",
        id: "local",
        type: "datalist",
        placeholder: "Digite ou escolha",
        datalist: [
            "Cemitério São João Batista",
            "Cemitério São Sebastião",
            "Cemitério Jardim da Saudade",
            "Cemitério de São Desiderio",
            "Cemitério de Angical",
            "Cemitério de Richão                 Neves",
        ],
    },
    {
        label: "Local do Velório",
        id: "local_velorio",
        type: "datalist",
        placeholder: "Digite ou escolha",
        datalist: ["Memorial - Sala 01", "Memorial - Sala 02", "Memorial - Sala 03"],
    },
    { label: "Data de Início do Velório", id: "data_inicio_velorio", type: "date" },
    { label: "Data de Fim do Velório", id: "data_fim_velorio", type: "date" },
    { label: "Hora de Início do Velório", id: "hora_inicio_velorio", type: "time" },
    { label: "Hora de Fim do Velório", id: "hora_fim_velorio", type: "time" },

    {
        label: "Observações do Atendimento",
        id: "observacao_atendimento",
        type: "textarea",
        placeholder: "Digite observações do atendimento (opcional)",
    },
    {
        label: "Observações de Itens",
        id: "observacao_itens",
        type: "textarea",
        placeholder: "Digite observações de itens (opcional)",
    },
    {
        label: "Observações do Velório e Sepultamento",
        id: "observacao_velorio01",
        type: "textarea",
        placeholder: "Digite Aqui As Observações (opcional)",
    },
    {
        label: "Observações do Velório e Sepultamento",
        id: "observacao_velorio02",
        type: "textarea",
        placeholder: "Digite Aqui As Observações (opcional)",
    },
] as const;

export const obrigatorios = ["falecido", "contato", "convenio", "religiao", "urna"];

export const salasMemorial = ["Memorial - Sala 01", "Memorial - Sala 02", "Memorial - Sala 03"];

export const fases = [
    "fase01",
    "fase02",
    "fase03",
    "fase04",
    "fase05",
    "fase06",
    "fase07",
    "fase08",
    "fase09",
    "fase10",
    "fase11",
] as const;

export const LOGIN_ABSOLUTE = "https://pai.planoassistencialintegrado.com.br/login";
export const API = "https://pai.planoassistencialintegrado.com.br";

export const materiaisConfig: { key: MaterialKey; label: string }[] = [
    { key: "cadeiras", label: "Cadeiras" },
    { key: "bebedouros", label: "Bebedouros" },
    { key: "suporte_coroa", label: "Suporte para Coroa" },
    { key: "kit_lanche", label: "Kit Lanche" },
    { key: "velas", label: "Velas" },
    { key: "tenda", label: "Tenda" },
    { key: "placa", label: "Placa" },
    { key: "paramentacao", label: "Paramentação" },
];
