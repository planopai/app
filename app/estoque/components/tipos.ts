// Tipos usados pela tela de Estoque.

export type ID = number;

export type Usuario = { id: ID; nome: string; usuario: string };
export type Deposito = { id: ID; nome: string };

export type Categoria = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };
export type Fabricante = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };
// ✅ NOVO
export type Classificacao = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };

export type ProdutoFoto = {
    id?: ID;
    produto_id?: ID;
    arquivo?: string | null;
    foto_url?: string | null;
    legenda?: string | null;
    ordem?: number;
    is_principal?: 0 | 1 | number;
};

export type Produto = {
    id: ID;
    nome: string;
    descricao?: string | null;
    codigo_barras: string;
    valor: string | number;
    preco_custo?: string | number | null;
    minimo: number;
    maximo?: number;
    foto_url?: string | null;
    fotos?: ProdutoFoto[];
    ativo: 0 | 1 | number;
    atualizado_em: string;

    categoria_id?: ID | null;
    fabricante_id?: ID | null;

    classificacao_id?: ID | null;
    classificacao_nome?: string | null;

    categoria_nome?: string | null;
    fabricante_nome?: string | null;

    /** Repaginada (07/10/2026): produto feito na casa (kit lanche, coroas…). 0 até o SQL novo rodar. */
    confeccionado_casa?: 0 | 1 | number;
};

export type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number;
    minimo: number;
    maximo: number;
    atualizado_em: string;
};

export type Me = { id: ID; nome: string; usuario: string };

export type InitResp = {
    ok: boolean;
    me: Me;
    usuarios: Usuario[];
    depositos: Deposito[];
    categorias: Categoria[];
    fabricantes: Fabricante[];
    classificacoes: Classificacao[];
    produtos: Produto[];
    saldos: Saldo[];
    msg?: string;
    need_login?: 1;
};

export type HistoricoRow = {
    id: number;
    tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "CONFECCAO" | "AJUSTE" | "CADASTRO_PRODUTO";
    produto_id: ID;
    codigo_barras_snapshot: string;
    lote_id?: ID | null;
    numero_lote_snapshot?: string | null;
    custo_base_unitario_snapshot?: string | number | null;
    frete_total_snapshot?: string | number | null;
    frete_unitario_snapshot?: string | number | null;
    custo_unitario_snapshot?: string | number | null;
    custo_total_snapshot?: string | number | null;
    registro_custo_tipo?: "ENTRADA" | "NOVO_PRECO" | string;
    ajuste_custo_id?: ID | null;
    custo_atual?: string | number | null;
    custo_base_atual?: string | number | null;
    frete_total_atual?: string | number | null;
    frete_unitario_atual?: string | number | null;
    quantidade: number | null;
    deposito_origem_id: ID | null;
    deposito_destino_id: ID | null;
    destino_texto: string | null;
    solicitante_usuario_id: ID | null;
    operador_usuario_id: ID;
    observacao: string | null;
    criado_em: string;

    produto_nome?: string;
    operador_nome?: string;
    solicitante_nome?: string | null;
    deposito_origem_nome?: string | null;
    deposito_destino_nome?: string | null;
    confeccao_id?: number | null;
    confeccao_tipo?: "KIT_LANCHE" | "COROA_ARTIFICIAL" | "PRODUTO" | string | null;

    /** Repaginada: código do lançamento (TRF-000001, ENT-000001, AJ-000001). */
    lancamento_codigo?: string | null;
    /** Repaginada: insumos de uma confecção (linha sintética CONFECCAO). */
    insumos?: Array<{ produto_id: ID; nome: string; codigo_barras: string; quantidade: number; custo_total: number | string }>;
};

export type HistoricoResp = {
    ok: boolean;
    rows: HistoricoRow[];
    msg?: string;
    need_login?: 1;
};

export type ConfeccaoTipo = "KIT_LANCHE" | "COROA_ARTIFICIAL" | "PRODUTO";

export type ConfeccaoPreviewItem = {
    produto_id: ID;
    nome: string;
    codigo_barras: string;
    quantidade_por_unidade: number;
    quantidade_total: number;
    saldo_disponivel: number;
    disponivel: boolean;
    custo_total_previsto: string | number;
};

export type ConfeccaoPreviewResp = {
    ok: boolean;
    tipo?: ConfeccaoTipo;
    quantidade?: number;
    disponivel?: boolean;
    produto_final?: { id: ID; nome: string; codigo_barras: string };
    deposito_insumos?: Deposito;
    deposito_destino?: Deposito;
    itens?: ConfeccaoPreviewItem[];
    custo_total?: string | number;
    custo_unitario?: string | number;
    msg?: string;
    need_login?: 1;
};

export type ConfeccaoExecutarResp = {
    ok: boolean;
    msg?: string;
    confeccao_id?: number;
    tipo?: ConfeccaoTipo;
    quantidade?: number;
    custo_total?: string | number;
    custo_unitario?: string | number;
};


export type DashboardMovimentoTipo = "TODOS" | "SAIDA" | "TRANSFERENCIA";

export type DashboardProdutoRow = {
    produto_id: ID;
    produto_nome: string;
    codigo_barras: string;
    categoria_nome: string;
    fabricante_nome: string;
    classificacao_nome: string;
    saida: number;
    transferencia: number;
    total: number;
    movimentos: number;
};


export type ProdutoEditTab = "DADOS" | "ESTOQUE" | "VALOR" | "CUSTO";


export type CustoAjusteTipo = "NOVO_PRECO" | "LOTE";
export type CustoAjusteHistoricoTipo = CustoAjusteTipo | "REFERENCIA" | "REAVALIACAO";

export type CustoProdutoLote = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    deposito_nome?: string | null;
    numero_lote: string;
    quantidade_inicial: number;
    quantidade_atual: number;
    custo_base_unitario?: string | number | null;
    frete_total?: string | number | null;
    frete_unitario?: string | number | null;
    custo_unitario: string | number;
    custo_entrada_original?: string | number | null;
    usuario_nome?: string | null;
    criado_em: string;
    origem_movimento_id?: ID | null;
};

export type CustoAjusteHistorico = {
    id: number;
    operacao_uuid: string;
    produto_id: ID;
    tipo: CustoAjusteHistoricoTipo;
    custo_referencia_anterior: string | number;
    custo_referencia_novo: string | number;
    novo_custo: string | number;
    custo_base_novo?: string | number | null;
    frete_total?: string | number | null;
    frete_unitario?: string | number | null;
    quantidade_rateio?: number | null;
    motivo?: string | null;
    observacao?: string | null;
    usuario_id: ID;
    usuario_nome?: string | null;
    criado_em: string;
    lotes_afetados: number;
    quantidade_afetada: number;
    valor_anterior: string | number;
    valor_novo: string | number;
    valor_diferenca: string | number;
};

export type CustoProdutoDetalheResp = {
    ok: boolean;
    produto?: {
        id: ID;
        nome: string;
        codigo_barras: string;
        preco_custo: string | number;
    };
    resumo?: {
        quantidade_disponivel: number;
        lotes_disponiveis: number;
        valor_estoque: string | number;
        custo_medio: string | number;
        quantidade_saldo_total?: number;
    };
    lotes?: CustoProdutoLote[];
    entradas?: HistoricoRow[];
    ajustes?: CustoAjusteHistorico[];
    msg?: string;
    need_login?: 1;
};

export type CustoMedioMovelProduto = {
    produto_id: ID;
    quantidade_atual: number;
    custo_medio: string | number;
    valor_estoque: string | number;
};

export type CustosMediosMoveisResp = {
    ok: boolean;
    rows?: CustoMedioMovelProduto[];
    msg?: string;
    need_login?: 1;
};

export type CatalogoProdutoLinhaRow = {
    produto_id: ID;
    linha?: string | null;
};

export type CatalogoProdutoLinhasResp = {
    ok: boolean;
    rows?: CatalogoProdutoLinhaRow[];
    msg?: string;
    need_login?: 1;
};

export type EstoquePageSize = 10 | 50 | 100 | 500 | "ALL";

export type EstoqueColumnKey =
    | "produto"
    | "categoria"
    | "fabricante"
    | "classificacao"
    | "qtd"
    | "custo"
    | "total";


// ✅ CONFERÊNCIAS (REGISTROS SALVOS)
export type ConferenciaStatus = "CONTAGEM" | "REVISAO" | "CONCLUIDA";

export type ConferenciaRegistro = {
    id: number;
    deposito_id: ID;
    deposito_nome?: string;
    operador_usuario_id: ID;
    operador_nome?: string;
    total_itens: number;
    total_dif: number;
    criado_em: string;

    // Repaginada (07/10/2026): conferência por etapas
    codigo?: string;
    status?: ConferenciaStatus;
    total_sistema?: number;
    total_fisico?: number;
    categoria_id?: ID | null;
    fabricante_id?: ID | null;
    contagem_cega?: number;
    incluir_sem_saldo?: number;
    categorias_ids?: string | null;
    fabricantes_ids?: string | null;
    atualizado_em?: string | null;
    concluido_em?: string | null;
    ajuste_codigo?: string | null;
};

export type ConferenciasListResp = {
    ok: boolean;
    rows: ConferenciaRegistro[];
    msg?: string;
    need_login?: 1;
};

export type ConferenciaItem = {
    id: number;
    conferencia_id: number;
    produto_id: ID | null;
    produto_nome_snapshot: string;
    codigo_barras_snapshot: string | null;
    qtd_sistema: number;
    qtd_fisica: number;
    dif: number;
};

export type ConferenciaDetalheHead = {
    id: number;
    deposito_id: ID;
    deposito_nome?: string;
    operador_usuario_id: ID;
    operador_nome?: string;
    total_itens: number;
    total_dif: number;
    criado_em: string;
};

export type ConferenciaEscopoItem = { produto_id: ID; nome: string; codigo_barras: string; saldo: number | string };

export type ConferenciaDetalheResp = {
    ok: boolean;
    head: ConferenciaDetalheHead & ConferenciaRegistro;
    items: ConferenciaItem[];
    /** Repaginada: produtos da conferência em andamento, com o saldo atual. */
    escopo?: ConferenciaEscopoItem[];
    msg?: string;
    need_login?: 1;
};


export type UiTab = "MENU" | "HOME" | "CONFECCAO" | "ENTRADA" | "ESTOQUE" | "CONFERENCIA" | "HISTORICO" | "DASHBOARD" | "GESTAO" | "AVANCADO";

export type EntradaItem = {
    id: number;
    payload: any;
    resumo: string;
    nome: string;
    qtd: number;
    custoBaseUnitario: number;
    freteTotal: number;
    freteUnitario: number;
    custoUnitario: number;
    custoTotal: number;
};
export type SaidaItem = { id: number; payload: any; resumo: string };
export type TrfItem = { id: number; payload: any; resumo: string };

export type Opt = { id: ID; nome: string };
