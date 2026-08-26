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
    item_id?: number | string;
    tipo?: "item" | "subitem" | string;
    raw_id?: number | string;
};

export type MateriaisState = Record<string, MateriaisItemState>;

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
 * Metas de estoque por item.
 */
export type DepositoNomeUrna = "MEMORIAL" | "FUNERARIA";
export type DepositoNomeArmario = "ARMARIO SANDRO" | "ARMARIO ILDO";
export type DepositoNomeRoupa = DepositoNomeArmario | "FUNERARIA";
export type DepositoNomeInvol = DepositoNomeArmario;
export type DepositoNomeVeu = DepositoNomeArmario | "FUNERARIA";
export type DepositoNomeCordao = DepositoNomeArmario | "FUNERARIA";


export type CoroaTipoItem = "" | "natural" | "artificial";
export type CoroaDepositoNome = "" | "MEMORIAL" | "FUNERARIA";

export type CoroaAtendimentoItem = {
    ordem: number;
    tipo_coroa: CoroaTipoItem;
    produto_id: number;
    modelo_coroa: string;
    codigo_barras?: string;
    deposito_nome?: CoroaDepositoNome | string;
    frase: string;
    valor?: number | null;
    foto_produto_url?: string | null;
};

export type SalaVelorio = "Sala 01" | "Sala 02" | "Sala 03";
export type VelorioOnline = "Sim" | "Não";

/**
 * Registro (sepultamentos)
 */
export type Registro = {
    id?: number | string;

    status?: string;
    falecido?: string;
    agente?: string;

    contato?: string;
    religiao?: string;
    convenio?: string;

    data_nascimento?: string;
    data_falecimento?: string;
    foto_falecido?: string;
    nome_responsavel?: string;
    cpf_responsavel?: string;

    urna?: string;
    roupa?: string;
    invol?: string;

    assistencia?: string;
    tanato?: string;

    ornamentacao?: string;
    ornamentacao_tipo?: string;

    // KIT LANCHE: resposta visual Sim ou Não.
    // Produto 678560 e depósito MEMORIAL são resolvidos no backend.
    kit_lanche?: string;

    // COROA DE FLORES
    // Natural é apenas registrada no atendimento. Artificial também gera baixa no estoque.
    coroa_flores?: string;
    coroa_tipo?: "Natural" | "Artificial" | string;
    coroa_produto_id?: number;
    coroa_modelo?: string;
    coroa_codigo_barras?: string;
    coroa_deposito_nome?: string;
    // Itens completos do pedido. Campo de front/API de coroas; não exige coluna em sepultamentos.
    coroas_itens?: CoroaAtendimentoItem[];
    coroas_pedido_id?: number | null;

    // Roteamento do atendimento. Campo vazio é tratado como fluxo legado (Sim).
    realiza_velorio?: string;
    realiza_sepultamento?: string;

    tipo_atendimento?: "funerario" | "terceiro";

    local?: string;
    local_velorio?: string;
    sala_velorio?: SalaVelorio | string;
    velorio_online?: VelorioOnline | string;
    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    hora_inicio_velorio?: string;
    hora_fim_velorio?: string;

    observacao_atendimento?: string;
    observacao_itens?: string;
    observacao_velorio01?: string;
    observacao_velorio02?: string;

    materiais_json?: string;
    arrumacao_json?: string;

    materiais?: MateriaisState;
    arrumacao?: ArrumacaoState;

    urna_deposito_nome?: DepositoNomeUrna | string;
    urna_produto_id?: number;
    urna_codigo_barras?: string;

    roupa_deposito_nome?: DepositoNomeRoupa | string;
    roupa_produto_id?: number;
    roupa_codigo_barras?: string;
    roupa_propria?: number | boolean | string;

    invol_deposito_nome?: DepositoNomeInvol | string;
    invol_produto_id?: number;
    invol_codigo_barras?: string;
    invol_item?: string;

    veu?: string;
    veu_item?: string;
    veu_deposito_nome?: DepositoNomeVeu | string;
    veu_produto_id?: number;
    veu_codigo_barras?: string;

    cordao?: string;
    cordao_item?: string;
    cordao_deposito_nome?: DepositoNomeCordao | string;
    cordao_produto_id?: number;
    cordao_codigo_barras?: string;

    foto_fim_ornamentacao_url?: string;
    foto_fim_ornamentacao_path?: string;
    foto_fim_ornamentacao_em?: string;
    foto_fim_ornamentacao_usuario?: string;
    foto_entrega_corpo_url?: string;
    foto_entrega_corpo_path?: string;
    foto_entrega_corpo_em?: string;
    foto_entrega_corpo_usuario?: string;

    // Responsabilidade operacional.
    // fase07 define o responsável pelo trecho até a Entrega de Corpo (fase08).
    responsavel_velorio_id?: number | string | null;
    responsavel_velorio_nome?: string | null;
    responsavel_velorio_desde?: string | null;

    // fase09 define o responsável pelo trecho até Sepultamento Concluído (fase10).
    responsavel_sepultamento_id?: number | string | null;
    responsavel_sepultamento_nome?: string | null;
    responsavel_sepultamento_desde?: string | null;

    // Metadados somente do cliente offline. Nunca são autoridade do backend.
    __cachedAt?: number;
    __syncStatus?: "synced" | "pending" | "requires_attention" | string;
    __pendingCount?: number;
    __lastOfflineOccurredAt?: string;
    __pendingActions?: any[];

    assinatura_responsavel?: string;
    assinatura_requerente?: string;
    assinatura_responsavel_nome?: string;
    assinatura_responsavel_cpf?: string;
    assinatura_requerente_nome?: string;
    assinatura_requerente_cpf?: string;
    assinatura_recebimento_url?: string;
    assinatura_requisicao_url?: string;

    [k: string]: any;
};

export type Aviso = {
    id: number | string;
    usuario: string;
    mensagem: string;
    criado_em: string;
    finalizado?: number;
};
