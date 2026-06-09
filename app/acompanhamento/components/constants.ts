"use client";

export const wizardStepTitles = ["Atendimento", "Itens", "Velório", "Sepultamento"];

/**
 * ✅ AJUSTADO:
 * Agora existem 2 novos steps:
 * - "roupa" (async_roupa) para selecionar do estoque (ou ROUPA PRÓPRIA no próprio componente)
 * - "invol_item" (async_invol) para selecionar do estoque quando invol = "Sim"
 *
 * ✅ NOVO:
 * Foram adicionados os campos do falecido/responsável na etapa Atendimento:
 * - data_nascimento
 * - data_falecimento
 * - foto_falecido
 * - nome_responsavel
 * - cpf_responsavel
 *
 * ✅ NOVO VELÓRIO:
 * Foram adicionados os campos:
 * - sala_velorio: Sala 01 / Sala 02 / Sala 03
 * - velorio_online: Sim / Não
 *
 * ✅ ORDEM DO ATENDIMENTO:
 * Nome do Falecido, Foto, Nascimento, Falecimento,
 * Religião, Convênio, Responsável, CPF, Contato e Observações por último.
 *
 * Os novos campos foram adicionados no final do array `steps`
 * para não deslocar os índices existentes.
 */
export const wizardStepIndexes = [
    // Atendimento
    [0, 29, 27, 28, 2, 3, 30, 31, 1, 23],

    // Itens: urna, roupa, veu, veu_item, cordao, cordao_item, assistencia, tanato, ornamentacao, tipo, invol, invol_item, arrumacao, obs itens
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 24],

    // Velório
    // local sepultamento, local velório, sala velório, velório online, data início, observações velório/sepultamento
    // Obs.: sala_velorio e velorio_online foram adicionados no final do array steps como índices 32 e 33.
    [17, 18, 32, 33, 19, 25],

    // Sepultamento
    [20, 21, 22, 26],
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

    /**
     * ✅ VÉU: primeiro pergunta Sim/Não.
     * Se Sim, aparece o popup (async_veu) para escolher do estoque.
     */
    { label: "Véu", id: "veu", type: "select", options: ["", "Sim", "Não"] },
    { label: "Véu (estoque)", id: "veu_item", type: "async_veu", placeholder: "Selecione o véu no estoque..." },

    /**
     * ✅ CORDÃO: primeiro pergunta Sim/Não.
     * Se Sim, aparece o popup (async_cordao) para escolher do estoque.
     */
    { label: "Cordão São Francisco", id: "cordao", type: "select", options: ["", "Sim", "Não"] },
    { label: "Cordão (estoque)", id: "cordao_item", type: "async_cordao", placeholder: "Selecione o cordão no estoque..." },

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

    // ✅ Novos campos da etapa Atendimento
    { label: "Data de Nascimento", id: "data_nascimento", type: "date" },
    { label: "Data de Falecimento", id: "data_falecimento", type: "date" },
    { label: "Foto do Falecido(a)", id: "foto_falecido", type: "file", accept: "image/*" },
    { label: "Nome do Responsável", id: "nome_responsavel", type: "input", placeholder: "Nome do responsável" },
    { label: "CPF do Responsável", id: "cpf_responsavel", type: "input", placeholder: "Apenas números" },

    // ✅ Novos campos da etapa Velório
    // No Wizard.tsx, sala_velorio deve ser renderizado como 3 caixinhas/botões: Sala 01, Sala 02 e Sala 03.
    { label: "Sala do Velório", id: "sala_velorio", type: "select", options: ["", "Sala 01", "Sala 02", "Sala 03"] },

    // No Wizard.tsx, este campo deve aparecer somente quando sala_velorio estiver preenchido.
    // A obrigatoriedade é condicional e deve ser validada no Wizard.tsx, não no array `obrigatorios`.
    { label: "Velório Online", id: "velorio_online", type: "select", options: ["", "Sim", "Não"] },
] as const;

/**
 * ✅ Mantém: Urna Obrigatoria
 * (ROUPA e INVOL não são obrigatórios, mas quando preenchidos precisam do vínculo no estoque — regra do PHP)
 *
 * ✅ Os novos campos NÃO foram colocados como obrigatórios.
 * `velorio_online` é obrigatório somente quando `sala_velorio` estiver preenchido;
 * essa regra condicional deve ficar no Wizard.tsx e também no informativo.php.
 */
export const obrigatorios = [
    "falecido",
    "contato",
    "convenio",
    "religiao",

    // ITENS (Sim/Não obrigatórios)
    "assistencia",
    "tanato",
    "ornamentacao",
    "invol",
    "veu",
    "cordao",

    // e se quiser também obrigar a escolha da urna/roupa:
    "urna",
    "roupa",
];

export const salasMemorial = ["Memorial - Sala 01", "Memorial - Sala 02", "Memorial - Sala 03"];

export const salasVelorio = ["Sala 01", "Sala 02", "Sala 03"] as const;

export const opcoesVelorioOnline = ["", "Sim", "Não"] as const;

export const fases = ["fase01", "fase02", "fase03", "fase04", "fase05", "fase06", "fase07", "fase08", "fase09", "fase10", "fase11"] as const;

export const LOGIN_ABSOLUTE = "https://pai.planoassistencialintegrado.com.br/login";
export const API = "https://pai.planoassistencialintegrado.com.br";
