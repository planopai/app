/**
 * Termos do atendimento (Termo de recebimento de material e Termo de requisição de veículo).
 *
 * No banco (tabela sepultamentos) a assinatura de cada termo fica em:
 *   recebimento → assinatura_responsavel (+ assinatura_responsavel_nome / assinatura_responsavel_cpf)
 *   requisição  → assinatura_requerente  (+ assinatura_requerente_nome  / assinatura_requerente_cpf)
 * Os nomes antigos (assinatura_recebimento_url / assinatura_requisicao_url) continuam aceitos.
 * É a mesma lista de chaves que o SignatureModal já usava para preencher a assinatura existente.
 */
import type { Registro } from "./types";

export type TipoTermo = "recebimento" | "requisicao";

const CHAVES: Record<TipoTermo, { url: string[]; nome: string[]; cpf: string[] }> = {
    recebimento: {
        url: ["assinatura_responsavel", "assinatura_recebimento_url", "assinatura_responsavel_url"],
        nome: ["assinatura_responsavel_nome", "nome_assinatura_responsavel", "nome_responsavel_assinatura"],
        cpf: ["assinatura_responsavel_cpf", "cpf_assinatura_responsavel", "cpf_responsavel_assinatura"],
    },
    requisicao: {
        url: ["assinatura_requerente", "assinatura_requisicao_url", "assinatura_requerente_url"],
        nome: ["assinatura_requerente_nome", "nome_assinatura_requerente", "nome_requerente_assinatura"],
        cpf: ["assinatura_requerente_cpf", "cpf_assinatura_requerente", "cpf_requerente_assinatura"],
    },
};

function primeiro(reg: any, chaves: string[]): string {
    for (const k of chaves) {
        const v = reg?.[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
}

export type SituacaoTermo = { assinado: boolean; url: string; nome: string; cpf: string };

/** Situação do termo no registro vindo do servidor (assinado = existe a imagem da assinatura gravada). */
export function situacaoTermo(registro: Registro | null | undefined, tipo: TipoTermo): SituacaoTermo {
    const c = CHAVES[tipo];
    const url = primeiro(registro, c.url);
    return { assinado: url !== "", url, nome: primeiro(registro, c.nome), cpf: primeiro(registro, c.cpf) };
}

/** CPF só com o começo e o fim à mostra (123.***.***-01). */
export function cpfParcial(cpf: string): string {
    const d = String(cpf || "").replace(/\D+/g, "");
    if (d.length !== 11) return "";
    return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}
