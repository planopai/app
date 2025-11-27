"use client";

export type MateriaisItemState = {
    checked: boolean;
    qtd: number;
    nome: string;
    categoria_id?: number | string;
};

export type MateriaisState = Record<string, MateriaisItemState>; // key = itemId (string)

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

export type Registro = {
    id?: number | string;
    status?: string;
    falecido?: string;
    agente?: string;
    contato?: string;
    religiao?: string;
    convenio?: string;
    urna?: string;
    roupa?: string;

    assistencia?: string;
    tanato?: string;

    ornamentacao?: string;
    ornamentacao_tipo?: string;
    invol?: string;

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

    materiais_json?: string;
    arrumacao_json?: string;

    materiais?: MateriaisState;
    arrumacao?: ArrumacaoState;

    [k: string]: any;
};

export type Aviso = {
    id: number | string;
    usuario: string;
    mensagem: string;
    criado_em: string;
    finalizado?: number;
};
