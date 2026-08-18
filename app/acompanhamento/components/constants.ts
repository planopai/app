"use client";

export const wizardStepTitles = ["Atendimento", "Itens", "Velório", "Sepultamento"];

/**
 * Configuração dos grupos e campos do Wizard.
 *
 * Urna e Roupa continuam usando os mesmos campos e metadados de estoque.
 * A escolha visual Sim ou Não é controlada no Wizard.tsx:
 * - Sim: mostra o seletor de estoque.
 * - Não: salva o campo principal vazio e limpa os metadados.
 *
 * KIT LANCHE usa apenas Sim ou Não. O produto, o código de barras e o
 * depósito são fixos no backend e não são exibidos no Wizard.
 */
export const wizardStepIndexes = [
    // Atendimento
    [0, 29, 27, 28, 2, 3, 30, 31, 1, 23],

    // Itens
    // urna, roupa, veu, veu_item, cordao, cordao_item, kit_lanche,
    // assistencia, tanato, ornamentacao, tipo, invol, invol_item,
    // arrumacao, observações
    [4, 5, 6, 7, 8, 9, 34, 10, 11, 12, 13, 14, 15, 16, 24],

    // Velório
    [18, 32, 33, 19, 21, 20, 22, 25],

    // Sepultamento
    [17, 26],
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

    { label: "Urna", id: "urna", type: "async_urna", placeholder: "Digite para buscar a urna no estoque..." },
    { label: "Roupa", id: "roupa", type: "async_roupa", placeholder: 'Selecione no estoque ou use "ROUPA PRÓPRIA"...' },

    { label: "Véu", id: "veu", type: "select", options: ["", "Sim", "Não"] },
    { label: "Véu (estoque)", id: "veu_item", type: "async_veu", placeholder: "Selecione o véu no estoque..." },

    { label: "Cordão São Francisco", id: "cordao", type: "select", options: ["", "Sim", "Não"] },
    { label: "Cordão (estoque)", id: "cordao_item", type: "async_cordao", placeholder: "Selecione o cordão no estoque..." },

    { label: "Assistência (Materiais)", id: "assistencia", type: "select", options: ["", "Sim", "Não"] },
    { label: "Tanatopraxia", id: "tanato", type: "select", options: ["", "Sim", "Não"] },
    { label: "Ornamentação", id: "ornamentacao", type: "select", options: ["", "Sim", "Não"] },
    { label: "Tipo de Ornamentação", id: "ornamentacao_tipo", type: "select", options: ["", "Natural", "Artificial"] },
    { label: "Invol", id: "invol", type: "select", options: ["", "Sim", "Não"] },
    { label: "Invol (estoque)", id: "invol_item", type: "async_invol", placeholder: "Digite para buscar o INVOL no estoque..." },

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

    { label: "Data de Nascimento", id: "data_nascimento", type: "date" },
    { label: "Data de Falecimento", id: "data_falecimento", type: "date" },
    { label: "Foto do Falecido(a)", id: "foto_falecido", type: "file", accept: "image/*" },
    { label: "Nome do Responsável", id: "nome_responsavel", type: "input", placeholder: "Nome do responsável" },
    { label: "CPF do Responsável", id: "cpf_responsavel", type: "input", placeholder: "Apenas números" },

    { label: "Sala do Velório", id: "sala_velorio", type: "select", options: ["", "Sala 01", "Sala 02", "Sala 03"] },
    { label: "Velório Online", id: "velorio_online", type: "select", options: ["", "Sim", "Não"] },

    // Mantido no final para não deslocar os índices antigos usados pelo fluxo "terceiro".
    { label: "Kit Lanche", id: "kit_lanche", type: "select", options: ["", "Sim", "Não"] },
] as const;

/**
 * Obrigatórios incondicionais após Corpo na Clínica.
 *
 * Urna e Roupa não aparecem aqui porque são condicionais:
 * o Wizard exige a seleção do estoque apenas quando o usuário marca Sim.
 */
export const obrigatorios = [
    // Atendimento
    "falecido",
    "data_nascimento",
    "data_falecimento",
    "nome_responsavel",
    "contato",
    "convenio",
    "religiao",

    // Itens com resposta obrigatória Sim ou Não
    "assistencia",
    "tanato",
    "ornamentacao",
    "invol",
    "veu",
    "cordao",
    "kit_lanche",
];

export const salasMemorial = ["Memorial - Sala 01", "Memorial - Sala 02", "Memorial - Sala 03"];
export const salasVelorio = ["Sala 01", "Sala 02", "Sala 03"] as const;
export const opcoesVelorioOnline = ["", "Sim", "Não"] as const;

/**
 * Ordem lógica do fluxo.
 *
 * A fase12 é um checkpoint novo e intencionalmente fica entre fase06 e fase07.
 * Os códigos 07..11 não foram renumerados para preservar registros históricos,
 * integrações, quadros e telemetria que já usam esses identificadores.
 */
export const fases = [
    "fase01",
    "fase02",
    "fase03",
    "fase04",
    "fase05",
    "fase06",
    "fase12", // Corpo Pronto + baixa dos itens
    "fase07",
    "fase08",
    "fase09",
    "fase10",
    "fase11",
] as const;

export const LOGIN_ABSOLUTE = "https://pai.planoassistencialintegrado.com.br/login";
export const API = "https://pai.planoassistencialintegrado.com.br";
