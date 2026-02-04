"use client";

export const wizardStepTitles = ["Atendimento", "Itens", "Velório", "Sepultamento"];

/**
 * ✅ AJUSTADO:
 * Agora existem 2 novos steps:
 * - "roupa" (async_roupa) para selecionar do estoque (ou ROUPA PRÓPRIA no próprio componente)
 * - "invol_item" (async_invol) para selecionar do estoque quando invol = "Sim"
 *
 * Com isso, os índices a partir de "arrumacao" foram deslocados.
 */
export const wizardStepIndexes = [
    // Atendimento: dados iniciais + observação do atendimento
    [0, 1, 2, 3, 19],

    // Itens: urna/roupa + assistencia/tanato/ornamentacao + invol + invol_item + arrumacao + obs itens
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 20],

    // Velório: (mantido no seu padrão) local sepultamento + local velorio + data inicio + obs 01
    [13, 14, 15, 21],

    // Sepultamento: data fim + horas + obs 02
    [16, 17, 18, 22],
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

    // ✅ URNA: autocomplete puxando do estoque
    { label: "Urna", id: "urna", type: "async_urna", placeholder: "Digite para buscar a urna no estoque..." },

    /**
     * ✅ ROUPA: agora precisa permitir seleção do estoque (meta roupa_*),
     * porque o PHP valida: se roupa != "ROUPA PRÓPRIA" e tiver texto => precisa roupa_produto_id e roupa_deposito_nome.
     */
    { label: "Roupa", id: "roupa", type: "async_roupa", placeholder: 'Selecione no estoque ou use "ROUPA PRÓPRIA"...' },

    { label: "Assistência (Materiais)", id: "assistencia", type: "select", options: ["", "Sim", "Não"] },
    { label: "Tanatopraxia", id: "tanato", type: "select", options: ["", "Sim", "Não"] },
    { label: "Ornamentação", id: "ornamentacao", type: "select", options: ["", "Sim", "Não"] },
    { label: "Tipo de Ornamentação", id: "ornamentacao_tipo", type: "select", options: ["", "Natural", "Artificial"] },

    { label: "Invol", id: "invol", type: "select", options: ["", "Sim", "Não"] },

    /**
     * ✅ INVOL (estoque): somente quando invol = "Sim"
     * O PHP valida: se invol = sim => precisa invol_produto_id e invol_deposito_nome (ARMARIO SANDRO/ILDO).
     */
    { label: "Invol (estoque)", id: "invol_item", type: "async_invol", placeholder: "Digite para buscar o INVOL no estoque..." },

    // Conservação / Insumos Tanato (continua usando arrumacao_json)
    { label: "Conservação do Corpo", id: "arrumacao", type: "custom" },

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

    { label: "Observações do Atendimento", id: "observacao_atendimento", type: "textarea", placeholder: "Digite observações do atendimento (opcional)" },
    { label: "Observações de Itens", id: "observacao_itens", type: "textarea", placeholder: "Digite observações de itens (opcional)" },
    { label: "Observações do Velório e Sepultamento", id: "observacao_velorio01", type: "textarea", placeholder: "Digite Aqui As Observações (opcional)" },
    { label: "Observações do Velório e Sepultamento", id: "observacao_velorio02", type: "textarea", placeholder: "Digite Aqui As Observações (opcional)" },
] as const;

/**
 * ✅ Mantém: Urna Obrigatoria 
 * (ROUPA e INVOL não são obrigatórios, mas quando preenchidos precisam do vínculo no estoque — regra do PHP)
 */
export const obrigatorios = ["falecido", "contato", "convenio", "religiao", "urna"];

export const salasMemorial = ["Memorial - Sala 01", "Memorial - Sala 02", "Memorial - Sala 03"];

export const fases = ["fase01", "fase02", "fase03", "fase04", "fase05", "fase06", "fase07", "fase08", "fase09", "fase10", "fase11"] as const;

export const LOGIN_ABSOLUTE = "https://pai.planoassistencialintegrado.com.br/login";
export const API = "https://pai.planoassistencialintegrado.com.br";
