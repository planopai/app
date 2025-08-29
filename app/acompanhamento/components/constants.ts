import type { MaterialKey } from "./types";

export const wizardStepTitles = ["Atendimento", "Itens", "Velório 01", "Velório 02"];

export const wizardStepIndexes = [
    // Atendimento: indices ajustados (observação foi de 14 -> 15)
    [0, 1, 2, 3, 15],

    // Itens: agora inclui o novo passo "Arrumação do Corpo" (índice 8)
    // e a observação de itens mudou de 15 -> 16
    [4, 5, 6, 7, 8, 16],

    // Velório 01: todos +1 após inserção
    // local: 9, local_velorio: 10, data_inicio_velorio: 11, observação 01: 17
    [9, 10, 11, 17],

    // Velório 02: todos +1 após inserção
    // data_fim: 12, hora_inicio: 13, hora_fim: 14, observação 02: 18
    [12, 13, 14, 18],
];

export const steps = [
    { label: "Nome do Falecido(a)", id: "falecido", type: "input", placeholder: "Digite o nome" },
    { label: "Contato", id: "contato", type: "input", placeholder: "Contato/telefone" },
    { label: "Religião", id: "religiao", type: "select", options: ["", "Evangélico", "Católico", "Espirita", "Ateu", "Outras", "Não Informado"] },
    { label: "Convênio", id: "convenio", type: "select", options: ["", "Particular", "Prefeitura de Barreiras", "Prefeitura de Angical", "Prefeitura de São Desidério", "Associado(a)"] },
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

    // 🔹 Assistência agora explicitamente só materiais (nome opcional)
    { label: "Assistência (Materiais)", id: "assistencia", type: "select", options: ["", "Sim", "Não"] },

    // Mantém Tanatopraxia
    { label: "Tanatopraxia", id: "tanato", type: "select", options: ["", "Sim", "Não"] },

    // 🔹 NOVO: Arrumação do Corpo — sempre disponível e independente
    // O "type" aqui pode ser o que seu form já entende (por ex. "custom" / "button")
    // se você abre o ArrumacaoModal ao clicar nesse passo.
    { label: "Arrumação do Corpo", id: "arrumacao", type: "custom" },

    // (daqui pra baixo, todos os índices foram deslocados +1)
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

    { label: "Observações do Atendimento", id: "observacao_atendimento", type: "textarea", placeholder: "Digite observações do atendimento (opcional)" },
    { label: "Observações de Itens", id: "observacao_itens", type: "textarea", placeholder: "Digite observações de itens (opcional)" },
    { label: "Observações do Velório 01", id: "observacao_velorio01", type: "textarea", placeholder: "Digite observações do velório 01 (opcional)" },
    { label: "Observações do Velório 02", id: "observacao_velorio02", type: "textarea", placeholder: "Digite observações do velório 02 (opcional)" },
] as const;

export const obrigatorios = ["falecido", "contato", "convenio", "religiao", "urna"];

export const salasMemorial = ["Memorial - Sala 01", "Memorial - Sala 02", "Memorial - Sala 03"];

export const fases = ["fase01", "fase02", "fase03", "fase04", "fase05", "fase06", "fase07", "fase08", "fase09", "fase10", "fase11"] as const;

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
