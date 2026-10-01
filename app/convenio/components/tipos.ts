/** Tipos e regras do convênio (Sim/Não + produto padrão), como gravados pelo convenio.php. */

export type SimNao = "" | "Sim" | "Não";

export type ProdutoRegra = {
    valor: SimNao;
    produto_id: number;
    nome: string;
    codigo_barras: string;
    deposito_nome: string;
    quantidade: number;
};

export type BooleanRegra = {
    valor: SimNao;
    tipo?: "" | "Natural" | "Artificial";
};

export type CoroaRegra = ProdutoRegra & {
    tipo: "" | "Natural" | "Artificial";
};

export type RegrasConvenio = {
    schema_version: 1;
    urna: ProdutoRegra;
    roupa: ProdutoRegra;
    invol: ProdutoRegra;
    veu: ProdutoRegra;
    cordao: ProdutoRegra;
    kit_lanche: BooleanRegra;
    coroa_flores: CoroaRegra;
    assistencia: BooleanRegra;
    tanato: BooleanRegra;
    ornamentacao: BooleanRegra & { tipo?: "" | "Natural" | "Artificial" };
    realiza_velorio: BooleanRegra;
    realiza_sepultamento: BooleanRegra;
};

export type Convenio = {
    id: number;
    nome: string;
    slug: string;
    ativo: boolean;
    ordem: number;
    observacao: string;
    regras: RegrasConvenio;
    versao: number;
    criado_em?: string;
    atualizado_em?: string;
};

export type EstoqueRow = {
    id?: number;
    produto_id?: number;
    est_produto_id?: number;
    nome: string;
    codigo_barras?: string | null;
    deposito_nome?: string | null;
    saldo_total?: number | string | null;
    foto_url?: string | null;
    valor?: number | string | null;
};

export const DEP_URNA = ["MEMORIAL", "FUNERARIA"];
export const DEP_ROUPA = ["ARMARIO SANDRO", "ARMARIO ILDO", "FUNERARIA"];
export const DEP_INVOL = ["ARMARIO SANDRO", "ARMARIO ILDO"];
export const DEP_VEU = ["ARMARIO SANDRO", "ARMARIO ILDO", "FUNERARIA"];
export const DEP_CORDAO = ["ARMARIO SANDRO", "ARMARIO ILDO", "FUNERARIA"];
export const DEP_COROA = ["MEMORIAL", "FUNERARIA"];

export function regraProduto(): ProdutoRegra {
    return {
        valor: "",
        produto_id: 0,
        nome: "",
        codigo_barras: "",
        deposito_nome: "",
        quantidade: 1,
    };
}

export function regrasVazias(): RegrasConvenio {
    return {
        schema_version: 1,
        urna: regraProduto(),
        roupa: regraProduto(),
        invol: regraProduto(),
        veu: regraProduto(),
        cordao: regraProduto(),
        kit_lanche: { valor: "" },
        coroa_flores: { ...regraProduto(), tipo: "" },
        assistencia: { valor: "" },
        tanato: { valor: "" },
        ornamentacao: { valor: "", tipo: "" },
        realiza_velorio: { valor: "" },
        realiza_sepultamento: { valor: "" },
    };
}

export function normalizeProduto(raw: any): ProdutoRegra {
    return {
        valor: raw?.valor === "Sim" || raw?.valor === "Não" ? raw.valor : "",
        produto_id: Math.max(0, Number(raw?.produto_id ?? 0) || 0),
        nome: String(raw?.nome ?? ""),
        codigo_barras: String(raw?.codigo_barras ?? ""),
        deposito_nome: String(raw?.deposito_nome ?? ""),
        quantidade: Math.max(1, Number(raw?.quantidade ?? 1) || 1),
    };
}

export function normalizeRegras(raw: any): RegrasConvenio {
    const b = (v: any): BooleanRegra => ({
        valor: v?.valor === "Sim" || v?.valor === "Não" ? v.valor : "",
    });

    const coroaRaw = raw?.coroa_flores ?? {};
    const ornRaw = raw?.ornamentacao ?? {};

    return {
        schema_version: 1,
        urna: normalizeProduto(raw?.urna),
        roupa: normalizeProduto(raw?.roupa),
        invol: normalizeProduto(raw?.invol),
        veu: normalizeProduto(raw?.veu),
        cordao: normalizeProduto(raw?.cordao),
        kit_lanche: b(raw?.kit_lanche),
        coroa_flores: {
            ...normalizeProduto(coroaRaw),
            tipo:
                coroaRaw?.tipo === "Natural" || coroaRaw?.tipo === "Artificial"
                    ? coroaRaw.tipo
                    : "",
        },
        assistencia: b(raw?.assistencia),
        tanato: b(raw?.tanato),
        ornamentacao: {
            ...b(ornRaw),
            tipo:
                ornRaw?.tipo === "Natural" || ornRaw?.tipo === "Artificial"
                    ? ornRaw.tipo
                    : "",
        },
        realiza_velorio: b(raw?.realiza_velorio),
        realiza_sepultamento: b(raw?.realiza_sepultamento),
    };
}

export function convenioNovo(): Convenio {
    return {
        id: 0,
        nome: "",
        slug: "",
        ativo: true,
        ordem: 0,
        observacao: "",
        regras: regrasVazias(),
        versao: 0,
    };
}

export function getProdutoId(row: EstoqueRow): number {
    return (
        Number(row.id ?? row.produto_id ?? row.est_produto_id ?? 0) || 0
    );
}
