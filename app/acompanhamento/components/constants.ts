import type { MaterialKey } from "./types";

export const wizardStepTitles = ["Atendimento", "Itens", "Velório 01", "Velório 02"];

export const wizardStepIndexes = [
    // Atendimento → agora observação do atendimento é índice 15
    [0, 1, 2, 3, 15],

    // Itens → inclui Assistência (6), Tanato (7), Arrumação (8) e observação de itens virou 16
    [4, 5, 6, 7, 8, 16],

    // Velório 01 → indices +1 depois da inserção, observação virou 17
    [9, 10, 11, 17],

    // Velório 02 → indices +1 depois da inserção, observação virou 18
    [12, 13, 14, 18],
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
    {
        label: "Roupa",
        id: "roupa",
        type: "select",
        options: [
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

    // Assistência → renomeada para só materiais
    {
        label: "Assistência (Materiais)",
        id: "assistencia",
        type: "select",
        options: ["", "Sim", "Não"],
    },

    // Tanatopraxia → mantida
    { label: "Tanatopraxia", id: "tanato", type: "select", options: ["", "Sim", "Não"] },

    // NOVO: Arrumação do Corpo → sempre disponível
    {
        label: "Arrumação do Corpo",
        id: "arrumacao",
        type: "custom", // você trata no Wizard/InfoModal para abrir ArrumacaoModal
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
            "Cemitério de Richão Das Neves",
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
        label: "Observações do Velório 01",
        id: "observacao_velorio01",
        type: "textarea",
        placeholder: "Digite observações do velório 01 (opcional)",
    },
    {
        label: "Observações do Velório 02",
        id: "observacao_velorio02",
        type: "textarea",
        placeholder: "Digite observações do velório 02 (opcional)",
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
