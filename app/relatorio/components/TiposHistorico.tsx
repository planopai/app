"use client";

/* ================================ Tipos ================================ */

export interface FalecidoItem {
    sepultamento_id: string;
    falecido: string;
    ultima_datahora?: string;
    [key: string]: any;
}

export interface LogItem {
    datahora?: string;
    acao?: string;
    usuario?: string;
    status_novo?: string;
    detalhes?: string | Record<string, any>;
    [key: string]: any;
}

/** Registros que vêm do PHP (informativo.php?listar=1) para a Análise Geral */
export interface RegistroAnalise {
    id?: number | string;
    sepultamento_id?: string;
    data?: string;
    data_inicio_velorio?: string;
    data_fim_velorio?: string;
    assistencia?: string;
    tanato?: string;
    materiais_json?: string;
    arrumacao_json?: string;
    [key: string]: any;
}

export type {
    FalecidoItem as TFalecidoItem,
    LogItem as TLogItem,
    RegistroAnalise as TRegistroAnalise,
};
