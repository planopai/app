"use client";
import React from "react";

/* ================================ Tipos ================================ */

export interface FalecidoItem {
    sepultamento_id: string;
    falecido: string;
    ultima_datahora?: string;

    /** Nome do responsável que assina o termo (“Eu, ____”) */
    assinatura?: string;

    /** Dados do falecido/responsável vindos do informativo.php / sepultamentos */
    data_nascimento?: string;
    data_falecimento?: string;
    foto_falecido?: string;
    nome_responsavel?: string;
    cpf_responsavel?: string;

    [key: string]: any;
}

export interface LogItem {
    datahora?: string;
    acao?: string;
    usuario?: string;
    status_novo?: string;
    detalhes?: string | Record<string, any>;

    /** Também podem vir no log por JOIN com sepultamentos */
    data_nascimento?: string;
    data_falecimento?: string;
    foto_falecido?: string;
    nome_responsavel?: string;
    cpf_responsavel?: string;

    [key: string]: any;
}

/** Registros para a Análise Geral (informativo.php?listar=1) */
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

    /** Novos dados disponíveis na tabela sepultamentos */
    data_nascimento?: string;
    data_falecimento?: string;
    foto_falecido?: string;
    nome_responsavel?: string;
    cpf_responsavel?: string;

    [key: string]: any;
}

export type {
    FalecidoItem as TFalecidoItem,
    LogItem as TLogItem,
    RegistroAnalise as TRegistroAnalise
};