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

const ehNao = (v: unknown) => ["não", "nao", "n"].includes(String(v ?? "").trim().toLowerCase());

/** Rótulo curto de cada termo (lista do quadro Documentos e título da assinatura). */
export const NOME_TERMO: Record<TipoTermo, string> = {
    recebimento: "Recebimento de material",
    requisicao: "Requisição de veículo",
};

/**
 * Termos que o atendimento tem (08/10/2026): só aparecem se houver a etapa.
 *  - recebimento de material: com Assistência (a mesma condição da etapa "Material Recolhido");
 *  - requisição de veículo (data e horário do sepultamento): com Sepultamento (etapas "Transportando P/ Sepultamento" e "Sepultamento Concluído").
 * Campo ainda sem resposta conta como tendo a etapa (como nas etapas, só o "Não" esconde).
 */
export function termosDoAtendimento(registro: Registro | null | undefined): TipoTermo[] {
    const r: any = registro || {};
    const out: TipoTermo[] = [];
    if (!ehNao(r.assistencia)) out.push("recebimento");
    if (!ehNao(r.realiza_sepultamento)) out.push("requisicao");
    return out;
}

/**
 * Termos assinados juntos, com uma assinatura só: o termo escolhido mais os outros do atendimento que ainda não foram
 * assinados. Termo já assinado abre só ele (para ver), sem misturar com os pendentes.
 */
export function termosAssinadosJuntos(registro: Registro | null | undefined, tipo: TipoTermo): TipoTermo[] {
    if (situacaoTermo(registro, tipo).assinado) return [tipo];
    const outros = termosDoAtendimento(registro).filter((t) => t !== tipo && !situacaoTermo(registro, t).assinado);
    return [tipo, ...outros];
}
