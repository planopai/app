/**
 * Catálogo dos modelos da Meta para a escolha por motivo (24/11/2026, modelo C).
 * Dá a cada modelo aprovado um nome amigável, uma linha dizendo para que serve, o assunto e o nome de cada campo.
 * Modelo aprovado que não estiver aqui entra em "Outros", com o nome técnico escrito por extenso — basta acrescentá-lo
 * abaixo para ele ganhar nome e assunto. A ordem dentro de cada assunto segue a ordem desta lista.
 */

export type TemaModelo = { id: string; nome: string; desc: string; marketing?: boolean };
export type InfoModelo = { tema: string; titulo: string; desc: string; campos?: string[] };

export const TEMAS_MODELO: TemaModelo[] = [
    { id: "pagamento", nome: "Cobrança e pagamento", desc: "Mensalidade em aberto, Pix, comprovante, acordo" },
    { id: "pos", nome: "Pós-atendimento funerário", desc: "Pesquisa, documentos e valores do funeral" },
    { id: "coroas", nome: "Coroas de flores", desc: "Pedido recebido, pronta, entregue" },
    { id: "contrato", nome: "Contrato e cadastro", desc: "Reajuste, vencimento, dados, retorno" },
    { id: "servicos", nome: "Serviços e benefícios", desc: "Material ortopédico, app, telemedicina, remoção" },
    { id: "vendas", nome: "Vendas e relacionamento", desc: "Planos, sorteio, reativação", marketing: true },
    { id: "outros", nome: "Outros", desc: "Modelos ainda sem assunto definido" },
];

export const CATALOGO_MODELOS: Record<string, InfoModelo> = {
    // cobrança e pagamento
    mensalidade_em_aberto: { tema: "pagamento", titulo: "Mensalidade em aberto", desc: "Avisa valor e vencimento e oferece o Pix", campos: ["Nome", "Quem envia", "Contrato", "Valor em aberto", "Vencimento"] },
    link_pagamento_mensalidade: { tema: "pagamento", titulo: "Link de pagamento (Pix)", desc: "Envia o link da mensalidade", campos: ["Nome", "Contrato", "Link do Pix"] },
    pagamento_confirmar_comprovante: { tema: "pagamento", titulo: "Confirmar comprovante", desc: "Pede o comprovante de um pagamento recebido", campos: ["Nome", "Quem envia", "Valor recebido", "Data do pagamento"] },
    pagamento_confirmado_recibo: { tema: "pagamento", titulo: "Pagamento confirmado", desc: "Confirma o pagamento e oferece o recibo", campos: ["Nome", "Contrato", "Mês"] },
    acordo_parcela_lembrete: { tema: "pagamento", titulo: "Parcela do acordo", desc: "Lembra a parcela de um acordo de dívida", campos: ["Nome", "Quem envia", "Valor da parcela", "Vencimento"] },
    lembrete_vence_amanha: { tema: "pagamento", titulo: "Lembrete: vence amanhã", desc: "O lembrete automático, enviado à mão", campos: ["Nome", "Valor", "Vencimento"] },
    lembrete_venceu_ontem: { tema: "pagamento", titulo: "Lembrete: venceu ontem", desc: "O lembrete automático, enviado à mão", campos: ["Nome", "Valor", "Vencimento"] },
    // pós-atendimento funerário
    pos_atendimento_pesquisa: { tema: "pos", titulo: "Pesquisa de satisfação", desc: "Pergunta à família como foi o atendimento", campos: ["Nome", "Quem envia", "Falecido(a)", "Data do serviço"] },
    funeral_documentos_pendentes: { tema: "pos", titulo: "Documentos pendentes", desc: "Pede os documentos que faltam do atendimento", campos: ["Nome", "Quem envia", "Falecido(a)", "O que falta"] },
    funeral_documento_disponivel: { tema: "pos", titulo: "Documento disponível", desc: "Avisa que um documento está pronto para retirar", campos: ["Nome", "Documento", "Falecido(a)"] },
    funeral_valor_em_aberto: { tema: "pos", titulo: "Valor em aberto do serviço", desc: "Cobra valor pendente do serviço funerário", campos: ["Nome", "Quem envia", "Valor", "Falecido(a)"] },
    // coroas
    coroa_pedido_recebido: { tema: "coroas", titulo: "Pedido recebido", desc: "Confirma o pedido de coroa na fila", campos: ["Nome", "Nº do pedido", "Em homenagem a"] },
    coroa_pronta: { tema: "coroas", titulo: "Coroa pronta", desc: "Avisa que a coroa está pronta, com a foto", campos: ["Nome", "Nº do pedido", "Em homenagem a", "Local de entrega"] },
    coroa_entregue: { tema: "coroas", titulo: "Coroa entregue", desc: "Confirma a entrega no velório", campos: ["Nome", "Nº do pedido", "Em homenagem a", "Local de entrega"] },
    // contrato e cadastro
    reajuste_mensalidade: { tema: "contrato", titulo: "Reajuste da mensalidade", desc: "Informa o novo valor a partir de uma data", campos: ["Nome", "A partir de", "Contrato", "Novo valor"] },
    vencimento_alterado: { tema: "contrato", titulo: "Vencimento alterado", desc: "Confirma a troca do dia de vencimento", campos: ["Nome", "Contrato", "Novo dia", "Próximo vencimento"] },
    cadastro_atualizacao: { tema: "contrato", titulo: "Atualizar cadastro", desc: "Pede um dado que falta no contrato", campos: ["Nome", "Quem envia", "Contrato", "O que atualizar"] },
    retorno_solicitacao: { tema: "contrato", titulo: "Retorno de solicitação", desc: "Retoma qualquer pedido do cliente", campos: ["Nome", "Quem envia", "Assunto"] },
    // serviços e benefícios
    material_ortopedico_prazo: { tema: "servicos", titulo: "Material ortopédico: devolução", desc: "Avisa a data de devolução, o endereço e a opção de locação", campos: ["Nome", "Quem envia", "Material", "Emprestado em (mês e ano)", "Data da devolução"] }, // 25/11/2026: texto novo
    app_associado_acesso: { tema: "servicos", titulo: "Acesso ao app do associado", desc: "Envia o link do Aplicativo do Associado", campos: ["Nome", "Contrato", "Link do app"] },
    telemedicina_cadastro: { tema: "servicos", titulo: "Cadastro da telemedicina", desc: "Pede dados para concluir o cadastro", campos: ["Nome", "Quem envia", "Contrato"] },
    remocao_ambulancia_confirmar: { tema: "servicos", titulo: "Confirmar remoção", desc: "Confirma a remoção em ambulância agendada", campos: ["Nome", "Quem envia", "Paciente", "Data e hora"] },
    // vendas e relacionamento (marketing)
    venda_retorno_planos: { tema: "vendas", titulo: "Retorno sobre os planos", desc: "Para quem pediu informação de plano", campos: ["Nome", "Quem envia"] },
    sorteio_contemplado: { tema: "vendas", titulo: "Contemplado no sorteio", desc: "Avisa o ganhador e como retirar o prêmio", campos: ["Nome", "Quem envia", "Sorteio de", "Prêmio"] },
    reativacao_plano: { tema: "vendas", titulo: "Reativar plano", desc: "Convida a reativar um plano inativo", campos: ["Nome", "Quem envia"] },
    // modelos antigos de contato geral
    contato_atendimento: { tema: "outros", titulo: "Contato do atendimento", desc: "Abertura geral de conversa" },
    contato_assunto: { tema: "outros", titulo: "Contato sobre um assunto", desc: "Abertura geral, informando o assunto" },
};

const ORDEM = Object.keys(CATALOGO_MODELOS);

/** Nome técnico por extenso: "remocao_ambulancia_confirmar" → "Remocao ambulancia confirmar". */
function porExtenso(nome: string): string {
    const t = nome.replace(/[_-]+/g, " ").trim();
    return t ? t[0].toUpperCase() + t.slice(1) : nome;
}

/** Informações de um modelo aprovado (do catálogo ou, se faltar, montadas a partir do nome). */
export function infoModelo(nome: string): InfoModelo {
    return CATALOGO_MODELOS[nome] || { tema: "outros", titulo: porExtenso(nome), desc: "Modelo aprovado na Meta" };
}

/** Posição para ordenar os modelos de um assunto (os do catálogo primeiro, na ordem da lista). */
export function ordemModelo(nome: string): number {
    const i = ORDEM.indexOf(nome);
    return i < 0 ? 999 : i;
}

/** Texto sem acentos e em minúsculas, para a busca. */
export function semAcento(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
