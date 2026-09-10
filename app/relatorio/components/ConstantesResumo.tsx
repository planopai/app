"use client";

export type ResumoSecaoId =
    | "falecido"
    | "responsavel"
    | "servicos"
    | "itens"
    | "velorio"
    | "observacoes";

export type ResumoSecaoConfig = {
    id: ResumoSecaoId;
    titulo: string;
    chaves: string[];
};

export const RESUMO_SECTIONS: ResumoSecaoConfig[] = [
    {
        id: "falecido",
        titulo: "Dados do falecido",
        chaves: [
            "falecido",
            "data_nascimento",
            "data_falecimento",
            "religiao",
            "convenio",
            "tipo_atendimento",
        ],
    },
    {
        id: "responsavel",
        titulo: "Responsável",
        chaves: [
            "nome_responsavel",
            "cpf_responsavel",
            "contato",
            "telefone",
            "telefone_responsavel",
            "responsavel_velorio_nome",
            "responsavel_sepultamento_nome",
        ],
    },
    {
        id: "servicos",
        titulo: "Serviços e procedimentos",
        chaves: [
            "assistencia",
            "tanato",
            "ornamentacao",
            "ornamentacao_tipo",
            "invol",
            "kit_lanche",
            "coroa_flores",
        ],
    },
    {
        id: "itens",
        titulo: "Itens do atendimento",
        chaves: [
            "urna",
            "roupa",
            "veu",
            "veu_item",
            "cordao",
            "cordao_item",
            "invol_item",
            "coroa_tipo",
            "coroa_modelo",
            "materiais",
        ],
    },
    {
        id: "velorio",
        titulo: "Velório e sepultamento",
        chaves: [
            "realiza_velorio",
            "local_velorio",
            "sala_velorio",
            "velorio_online",
            "data_inicio_velorio",
            "hora_inicio_velorio",
            "data_fim_velorio",
            "hora_fim_velorio",
            "realiza_sepultamento",
            "local",
            "local_sepultamento",
        ],
    },
    {
        id: "observacoes",
        titulo: "Observações",
        chaves: [
            "observacao_atendimento",
            "observacao_itens",
            "observacao_velorio01",
            "observacao_velorio02",
            "observacao",
        ],
    },
];

export const RESUMO_ORDER: string[] = RESUMO_SECTIONS.flatMap((secao) => secao.chaves);

export type ResumoKey = (typeof RESUMO_ORDER)[number];