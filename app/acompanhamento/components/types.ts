export type MaterialKey =
    | "cadeiras"
    | "bebedouros"
    | "suporte_coroa"
    | "kit_lanche"
    | "velas"
    | "tenda"
    | "placa"
    | "paramentacao";

export type MateriaisState = Record<
    MaterialKey,
    {
        checked: boolean;
        qtd: number;
    }
>;

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
    invol: boolean;
};

export type Registro = {
    id?: number | string;
    status?: string; // fase01..fase11
    falecido?: string;
    agente?: string;
    contato?: string;
    religiao?: string;
    convenio?: string;
    urna?: string;
    roupa?: string;
    assistencia?: string; // "Sim" | "Não"
    tanato?: string; // "Sim" | "Não"
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
    materiais_cadeiras_qtd?: string | number;
    materiais_bebedouros_qtd?: string | number;
    materiais_suporte_coroa_qtd?: string | number;
    materiais_kit_lanche_qtd?: string | number;
    materiais_velas_qtd?: string | number;
    materiais_tenda_qtd?: string | number;
    materiais_placa_qtd?: string | number;
    materiais_paramentacao_qtd?: string | number;

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
