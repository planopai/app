"use client";

/**
 * Materiais (novo/antigo)
 * - key pode ser "123" (antigo) ou "item:123" / "subitem:456" (novo)
 * - helpers.ts já aceita campos extras; aqui tipamos para evitar TS reclamar
 */
export type MateriaisItemState = {
    checked: boolean;
    qtd: number;
    nome: string;
    categoria_id?: number | string;

    // extras do formato novo (opcionais)
    item_id?: number | string; // quando key for subitem, pode referenciar o item pai
    tipo?: "item" | "subitem" | string;
    raw_id?: number | string;
};

export type MateriaisState = Record<string, MateriaisItemState>; // key = string (id antigo ou "item:X"/"subitem:Y")

export type SubItem = {
    id: number | string;
    item_id: number | string;
    nome: string;
    ativo: number | boolean;
    ordem: number | string;
};

export type Item = {
    id: number | string;
    categoria_id: number | string;
    nome: string;
    ativo: number | boolean;
    ordem: number | string;
    subitens?: SubItem[];
};

export type Categoria = {
    id: number | string;
    nome: string;
    ativo: number | boolean;
    ordem: number | string;
    itens?: Item[];
};

/**
 * Arrumação
 * - hoje continua no formato antigo (checkboxes)
 * - o backend também aceita arrumacao_json string
 */
export type ArrumacaoState = {
    luvas: boolean;
    palha: boolean;
    tamponamento: boolean;
    maquiagem: boolean;
    algodao: boolean;
    cordao: boolean;
    barba: boolean;
    ta32: boolean;
    fluido_cavitario?: boolean;
    formol: boolean;
    mascara: boolean;
};

/**
 * Metas de estoque por item (URNA / ROUPA / INVOL / CORDAO)
 */
export type DepositoNomeUrna = "MEMORIAL" | "FUNERARIA";
export type DepositoNomeArmario = "ARMARIO SANDRO" | "ARMARIO ILDO";
export type DepositoNomeRoupa = DepositoNomeArmario | "FUNERARIA";
export type DepositoNomeInvol = DepositoNomeArmario;

// ✅ Cordão sai de: ARMARIO SANDRO | ARMARIO ILDO | FUNERARIA
export type DepositoNomeCordao = DepositoNomeArmario | "FUNERARIA";

/**
 * Registro (sepultamentos)
 * - inclui novas colunas: urna_* / roupa_* / invol_* / cordao_*
 * - mantém [k:string]: any para compatibilidade com colunas antigas
 */
export type Registro = {
    id?: number | string;

    status?: string;
    falecido?: string;
    agente?: string;

    contato?: string;
    religiao?: string;
    convenio?: string;

    // textos (mostrados no wizard)
    urna?: string;
    roupa?: string;
    invol?: string;

    assistencia?: string;
    tanato?: string;

    ornamentacao?: string;
    ornamentacao_tipo?: string;

    tipo_atendimento?: "funerario" | "terceiro";

    local?: string;
    local_velorio?: string;
    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    hora_inicio_velorio?: string;
    hora_fim_velorio?: string;

    observacao_atendimento?: string;
    observacao_itens?: string;
    observacao_velorio01?: string;
    observacao_velorio02?: string;

    // jsons persistidos no banco
    materiais_json?: string;
    arrumacao_json?: string;

    // estados usados no front
    materiais?: MateriaisState;
    arrumacao?: ArrumacaoState;

    // =========================
    // ✅ META URNA (estoque)
    // =========================
    urna_deposito_nome?: DepositoNomeUrna | string;
    urna_produto_id?: number;
    urna_codigo_barras?: string;

    // =========================
    // ✅ META ROUPA (estoque)
    // =========================
    roupa_deposito_nome?: DepositoNomeRoupa | string;
    roupa_produto_id?: number;
    roupa_codigo_barras?: string;

    // =========================
    // ✅ META INVOL (estoque)
    // =========================
    invol_deposito_nome?: DepositoNomeInvol | string;
    invol_produto_id?: number;
    invol_codigo_barras?: string;

    // texto exibido no wizard (usado no front)
    invol_item?: string;

    // =========================
    // ✅ META CORDAO SAO FRANCISCO (estoque)
    // =========================
    cordao_deposito_nome?: DepositoNomeCordao | string;
    cordao_produto_id?: number;
    cordao_codigo_barras?: string;

    // opcional: se você quiser guardar também o texto/nome do cordão no registro
    cordao?: string;

    [k: string]: any;
};

export type Aviso = {
    id: number | string;
    usuario: string;
    mensagem: string;
    criado_em: string;
    finalizado?: number;
};
