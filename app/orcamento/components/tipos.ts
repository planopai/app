/* Orçamento (13/10/2026) — tipos e valores iniciais. */

export type SimNao = "Sim" | "Não";

/** Item escolhido no estoque (o nome fica guardado para mostrar sem buscar de novo). */
export type ItemEscolhido = { produto_id: number; nome: string; /** depósito onde tinha saldo (vai para o Novo registro) */ local?: string } | null;

export type CoroaOrc = { tipo: "natural" | "artificial"; produto_id: number; nome: string; local?: string };

/**
 * O que foi escolhido. Mesmos nomes de campo da prévia da OS do registro (montarRascunhoOS), para o servidor
 * calcular com as mesmas regras e para o Novo registro abrir preenchido na conversão.
 */
export type Rascunho = {
    urna: ItemEscolhido;
    roupa_propria: boolean;
    roupa: ItemEscolhido;
    veu: SimNao;
    veu_item: ItemEscolhido;
    cordao: SimNao;
    cordao_item: ItemEscolhido;
    invol: SimNao;
    invol_item: ItemEscolhido;
    tanato: SimNao;
    tanato_produto_id: number;
    reconstituicao_facial: SimNao;
    ornamentacao: SimNao;
    ornamentacao_tipo: string;
    /** Sala do Memorial Senhor do Bonfim ("" = sem velório no Memorial). */
    sala_velorio: string;
    translado: SimNao;
    translado_km: string;
    translado_origem: string;
    translado_destino: string;
    coroas: CoroaOrc[];
    /** Itens Sim/Não com produto fixo do servidor (ex.: assistencia, kit_lanche). */
    extras: Record<string, SimNao>;
};

export const RASCUNHO_VAZIO: Rascunho = {
    urna: null,
    roupa_propria: false,
    roupa: null,
    veu: "Não",
    veu_item: null,
    cordao: "Não",
    cordao_item: null,
    invol: "Não",
    invol_item: null,
    tanato: "Não",
    tanato_produto_id: 0,
    reconstituicao_facial: "Não",
    ornamentacao: "Não",
    ornamentacao_tipo: "",
    sala_velorio: "",
    translado: "Não",
    translado_km: "",
    translado_origem: "",
    translado_destino: "",
    coroas: [],
    extras: {},
};

/** Formato que o servidor espera (o da prévia da OS). */
export function rascunhoParaServidor(r: Rascunho): Record<string, unknown> {
    const pid = (i: ItemEscolhido) => (i?.produto_id ? i.produto_id : 0);
    return {
        urna_produto_id: pid(r.urna),
        urna_nome: r.urna?.nome || "", urna_local: r.urna?.local || "",
        roupa_propria: r.roupa_propria ? 1 : 0,
        roupa_produto_id: r.roupa_propria ? 0 : pid(r.roupa),
        roupa_nome: r.roupa_propria ? "" : r.roupa?.nome || "", roupa_local: r.roupa_propria ? "" : r.roupa?.local || "",
        veu: r.veu, veu_produto_id: r.veu === "Sim" ? pid(r.veu_item) : 0, veu_nome: r.veu_item?.nome || "", veu_local: r.veu_item?.local || "",
        cordao: r.cordao, cordao_produto_id: r.cordao === "Sim" ? pid(r.cordao_item) : 0, cordao_nome: r.cordao_item?.nome || "", cordao_local: r.cordao_item?.local || "",
        invol: r.invol, invol_produto_id: r.invol === "Sim" ? pid(r.invol_item) : 0, invol_nome: r.invol_item?.nome || "", invol_local: r.invol_item?.local || "",
        tanato: r.tanato, tanato_produto_id: r.tanato === "Sim" ? r.tanato_produto_id : 0,
        reconstituicao_facial: r.tanato === "Sim" ? r.reconstituicao_facial : "Não",
        ornamentacao: r.ornamentacao, ornamentacao_tipo: r.ornamentacao === "Sim" ? r.ornamentacao_tipo : "",
        sala_velorio: r.sala_velorio,
        translado: r.translado,
        translado_km: r.translado === "Sim" ? r.translado_km.replace(",", ".") : 0,
        translado_origem: r.translado === "Sim" ? r.translado_origem : "",
        translado_destino: r.translado === "Sim" ? r.translado_destino : "",
        coroas: r.coroas.filter((c) => c.produto_id > 0).map((c) => ({ tipo: c.tipo, produto_id: c.produto_id, nome: c.nome, local: c.local || "" })),
        ...r.extras,
    };
}

/** Volta do servidor (orçamento salvo) para o formulário. */
export function rascunhoDoServidor(s: Record<string, any> | null | undefined, camposExtras: string[] = [], nomes: Record<string, string> = {}): Rascunho {
    const d = s || {};
    const sn = (v: unknown): SimNao => (String(v ?? "").trim().toLowerCase() === "sim" ? "Sim" : "Não");
    const item = (pid: unknown, nome: unknown, local?: unknown): ItemEscolhido => {
        const n = Number(pid) || 0;
        return n > 0 ? { produto_id: n, nome: String(nome || nomes[String(n)] || `Produto #${n}`), local: String(local || "") || undefined } : null;
    };
    const extras: Record<string, SimNao> = {};
    camposExtras.forEach((k) => {
        if (k in d) extras[k] = sn(d[k]);
    });
    return {
        ...RASCUNHO_VAZIO,
        urna: item(d.urna_produto_id, d.urna_nome, d.urna_local),
        roupa_propria: Number(d.roupa_propria) === 1,
        roupa: item(d.roupa_produto_id, d.roupa_nome, d.roupa_local),
        veu: sn(d.veu), veu_item: item(d.veu_produto_id, d.veu_nome, d.veu_local),
        cordao: sn(d.cordao), cordao_item: item(d.cordao_produto_id, d.cordao_nome, d.cordao_local),
        invol: sn(d.invol), invol_item: item(d.invol_produto_id, d.invol_nome, d.invol_local),
        tanato: sn(d.tanato), tanato_produto_id: Number(d.tanato_produto_id) || 0,
        reconstituicao_facial: sn(d.reconstituicao_facial),
        ornamentacao: sn(d.ornamentacao), ornamentacao_tipo: String(d.ornamentacao_tipo || ""),
        sala_velorio: String(d.sala_velorio || ""),
        translado: sn(d.translado), translado_km: Number(d.translado_km) > 0 ? String(d.translado_km).replace(".", ",") : "",
        translado_origem: String(d.translado_origem || ""), translado_destino: String(d.translado_destino || ""),
        coroas: Array.isArray(d.coroas)
            ? d.coroas.map((c: any) => ({ tipo: c?.tipo === "artificial" ? "artificial" : "natural", produto_id: Number(c?.produto_id) || 0, nome: String(c?.nome || ""), local: String(c?.local || "") || undefined }))
            : [],
        extras,
    };
}

export type Linha = { chave: string; rotulo: string; nome: string; qtd: number; valor: number | null; obs?: string };

export type Previa = { linhas: Linha[]; total: number; valores_pendentes: number; avisos: string[] };

export type OpcaoProduto = { valor?: string; produto_id: number; nome: string; preco: number | null };

export type Opcoes = {
    validade_dias: number;
    salas: OpcaoProduto[];
    ornamentacao: OpcaoProduto[];
    sim_nao: { campo: string; rotulo: string; produto_id: number; preco: number | null }[];
    tanato_modelos: OpcaoProduto[];
    reconstituicao_preco: number | null;
    translado_km_preco: number | null;
};

export type Situacao = "ABERTO" | "VENCIDO" | "CONVERTIDO" | "CANCELADO";

export type ResumoLista = {
    id: number;
    numero: string;
    falecido: string;
    contato: string;
    telefone: string;
    valor_total: number;
    validade: string;
    status: string;
    situacao: Situacao;
    atendimento_id: number | null;
    criado_em: string;
    criado_por_nome: string;
    atualizado_em: string;
};

export type Orcamento = ResumoLista & {
    observacao: string;
    rascunho: Record<string, any>;
    linhas: Linha[];
    convertido_em: string | null;
    cancelado_em: string | null;
    cancelado_por_nome: string | null;
    motivo_cancelamento: string | null;
};

export const brl = (v: number | null | undefined) =>
    v === null || v === undefined ? "a confirmar" : (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataBR = (s?: string | null) => {
    if (!s) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());   // só a data: sem fuso (senão vira o dia anterior)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(String(s).replace(" ", "T")).toLocaleDateString("pt-BR");
};
