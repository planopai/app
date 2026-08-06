"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ID = number;

type Deposito = {
    id: ID;
    nome: string;
};

type Categoria = {
    id: ID;
    nome: string;
    ativo: 0 | 1 | number;
};

type Fabricante = {
    id: ID;
    nome: string;
    ativo: 0 | 1 | number;
};

type Classificacao = {
    id: ID;
    nome: string;
    ativo: 0 | 1 | number;
};

type Produto = {
    id: ID;
    nome: string;
    descricao?: string | null;
    codigo_barras: string;
    valor: string | number;
    preco_custo?: string | number | null;
    minimo: number;
    maximo?: number;
    foto_url?: string | null;
    ativo: 0 | 1 | number;
    atualizado_em?: string;
    categoria_id?: ID | null;
    fabricante_id?: ID | null;
    classificacao_id?: ID | null;
    categoria_nome?: string | null;
    fabricante_nome?: string | null;
    classificacao_nome?: string | null;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number;
    minimo: number;
    maximo: number;
    atualizado_em?: string;
};

type InitResp = {
    ok: boolean;
    depositos: Deposito[];
    categorias: Categoria[];
    fabricantes: Fabricante[];
    classificacoes: Classificacao[];
    produtos: Produto[];
    saldos: Saldo[];
    msg?: string;
    need_login?: 1;
};

type LoteRow = {
    id: number;
    produto_id: ID;
    deposito_id: ID;
    numero_lote: string;
    custo_unitario: string | number;
    quantidade_inicial: number;
    quantidade_atual: number;
    criado_em?: string | null;
    atualizado_em?: string | null;
    produto_nome?: string | null;
    codigo_barras?: string | null;
    deposito_nome?: string | null;
    custo_total_atual?: string | number | null;
};

type LotesResp = {
    ok: boolean;
    rows: LoteRow[];
    msg?: string;
    need_login?: 1;
};

type HistoricoRow = {
    id: number;
    tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "AJUSTE" | "CADASTRO_PRODUTO" | string;
    produto_id: ID;
    codigo_barras_snapshot?: string | null;
    numero_lote_snapshot?: string | null;
    custo_unitario_snapshot?: string | number | null;
    custo_total_snapshot?: string | number | null;
    quantidade: number | null;
    deposito_origem_id: ID | null;
    deposito_destino_id: ID | null;
    destino_texto?: string | null;
    solicitante_usuario_id?: ID | null;
    operador_usuario_id?: ID | null;
    observacao?: string | null;
    criado_em: string;
    produto_nome?: string | null;
    operador_nome?: string | null;
    solicitante_nome?: string | null;
    deposito_origem_nome?: string | null;
    deposito_destino_nome?: string | null;
};

type HistoricoResp = {
    ok: boolean;
    rows: HistoricoRow[];
    msg?: string;
    need_login?: 1;
};

type MovimentoCustoTipo =
    | "SALDO_INICIAL"
    | "ENTRADA"
    | "SAIDA"
    | "AJUSTE_CUSTO"
    | "AJUSTE_SALDO";

type CustoAjusteRow = {
    id: number;
    produto_id: ID;
    tipo: string;
    novo_custo: string | number;
    custo_base_novo?: string | number | null;
    frete_total?: string | number | null;
    frete_unitario?: string | number | null;
    observacao?: string | null;
    usuario_nome?: string | null;
    criado_em: string;
};

type CustoProdutoDetalheResp = {
    ok: boolean;
    ajustes?: CustoAjusteRow[];
    msg?: string;
    need_login?: 1;
};

type CustoMedioPasso = {
    movimento_id: number;
    tipo: MovimentoCustoTipo;
    criado_em: string;
    numero_lote?: string | null;
    quantidade_anterior: number;
    quantidade_nova: number;
    quantidade_acumulada: number;
    valor_anterior: number;
    valor_novo: number;
    valor_acumulado: number;
    custo_unitario_novo: number;
    custo_medio: number;
    custo_estimado: boolean;
};

type EstoqueDeposito = {
    deposito_id: ID;
    deposito_nome: string;
    quantidade: number;
    minimo: number;
    maximo: number;
    lotes: number;
    custo_medio: number;
    valor_estoque: number;
    qtd_sem_lote: number;
};

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/materiais_gerais.php`;
const HISTORICO_LIMIT = 500;

function num(v: unknown): number {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;

    const raw = String(v ?? "").trim();
    if (!raw) return 0;

    const cleaned = raw
        .replace(/R\$/gi, "")
        .replace(/\s/g, "")
        .replace(/[^0-9,.-]/g, "");

    if (!cleaned) return 0;

    if (cleaned.includes(",")) {
        const parsed = Number(cleaned.replace(/\./g, "").replace(",", "."));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function clampInt(v: unknown): number {
    const parsed = Number(v);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
}

function moneyBRL(value: number): string {
    try {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(Number.isFinite(value) ? value : 0);
    } catch {
        return `R$ ${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
    }
}

function intBR(value: number): string {
    try {
        return new Intl.NumberFormat("pt-BR", {
            maximumFractionDigits: 0,
        }).format(Number.isFinite(value) ? value : 0);
    } catch {
        return String(value);
    }
}

function signedIntBR(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;
    if (safeValue > 0) return `+${intBR(safeValue)}`;
    if (safeValue < 0) return `-${intBR(Math.abs(safeValue))}`;
    return "0";
}

function signedMoneyBRL(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;
    if (safeValue > 0) return `+${moneyBRL(safeValue)}`;
    if (safeValue < 0) return `-${moneyBRL(Math.abs(safeValue))}`;
    return moneyBRL(0);
}

function roundInternal(value: number, digits = 8): number {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** digits;
    const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
    return Math.abs(rounded) < 1 / factor ? 0 : rounded;
}

function decimalBR(value: number, digits = 1): string {
    try {
        return new Intl.NumberFormat("pt-BR", {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        }).format(Number.isFinite(value) ? value : 0);
    } catch {
        return (Number.isFinite(value) ? value : 0).toFixed(digits).replace(".", ",");
    }
}

function fmtDateTime(iso?: string | null): string {
    if (!iso) return "";

    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return String(iso);

    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(date);
}

function normalizeSearch(value: unknown): string {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function daysAgo(days: number): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return date;
}

async function safeJson<T>(response: Response): Promise<T> {
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
        const text = await response.text().catch(() => "");
        throw new Error(
            `Resposta inesperada (${contentType || "sem content-type"}). ${text ? `Conteúdo: ${text.slice(0, 160)}...` : ""
                }`.trim()
        );
    }

    return (await response.json()) as T;
}

async function apiGet<T>(query: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(API_BASE, window.location.origin);

    Object.entries(query).forEach(([key, value]) => {
        if (value === undefined) return;
        url.searchParams.set(key, String(value));
    });

    const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });

    return safeJson<T>(response);
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <section className={["rounded-2xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>
            {children}
        </section>
    );
}

function KpiCard({
    label,
    value,
    hint,
    emphasis = false,
}: {
    label: string;
    value: string;
    hint?: string;
    emphasis?: boolean;
}) {
    return (
        <Panel className={emphasis ? "border-slate-900 bg-slate-950 p-4 text-white" : "p-4"}>
            <div className={emphasis ? "text-xs font-bold uppercase tracking-wide text-slate-300" : "text-xs font-bold uppercase tracking-wide text-slate-500"}>
                {label}
            </div>
            <div className={emphasis ? "mt-2 text-2xl font-black tracking-tight text-white" : "mt-2 text-2xl font-black tracking-tight text-slate-950"}>
                {value}
            </div>
            {hint ? (
                <div className={emphasis ? "mt-1 text-xs text-slate-300" : "mt-1 text-xs text-slate-500"}>{hint}</div>
            ) : null}
        </Panel>
    );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div className="border-b border-slate-100 p-4">
            <h2 className="text-base font-bold text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
    );
}

function SearchIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
            <path
                d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function ProductPlaceholder({ name }: { name: string }) {
    const initial = name.trim().charAt(0).toUpperCase() || "P";

    return (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-black text-slate-500 sm:h-24 sm:w-24">
            {initial}
        </div>
    );
}

export default function Page() {
    const searchBoxRef = useRef<HTMLDivElement>(null);

    const [loadingBase, setLoadingBase] = useState(true);
    const [loadingHistorico, setLoadingHistorico] = useState(false);
    const [erro, setErro] = useState("");
    const [erroHistorico, setErroHistorico] = useState("");

    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [fabricantes, setFabricantes] = useState<Fabricante[]>([]);
    const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);
    const [lotes, setLotes] = useState<LoteRow[]>([]);
    const [historico, setHistorico] = useState<HistoricoRow[]>([]);
    const [entradas, setEntradas] = useState<HistoricoRow[]>([]);
    const [ajustesCusto, setAjustesCusto] = useState<CustoAjusteRow[]>([]);

    const [busca, setBusca] = useState("");
    const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<ID | null>(null);
    const [listaAberta, setListaAberta] = useState(false);

    const depositoById = useMemo(
        () => new Map(depositos.map((deposito) => [Number(deposito.id), deposito])),
        [depositos]
    );

    const categoriaById = useMemo(
        () => new Map(categorias.map((categoria) => [Number(categoria.id), categoria])),
        [categorias]
    );

    const fabricanteById = useMemo(
        () => new Map(fabricantes.map((fabricante) => [Number(fabricante.id), fabricante])),
        [fabricantes]
    );

    const classificacaoById = useMemo(
        () => new Map(classificacoes.map((classificacao) => [Number(classificacao.id), classificacao])),
        [classificacoes]
    );

    const produtoSelecionado = useMemo(
        () => produtos.find((produto) => Number(produto.id) === Number(produtoSelecionadoId)) || null,
        [produtos, produtoSelecionadoId]
    );

    async function carregarBase() {
        setLoadingBase(true);
        setErro("");

        try {
            const [init, lotesResp] = await Promise.all([
                apiGet<InitResp>({ init: 1, _ts: Date.now() }),
                apiGet<LotesResp>({ action: "lotes_listar", somente_com_saldo: 1, _ts: Date.now() }),
            ]);

            if (!init.ok) throw new Error(init.msg || "Falha ao carregar produtos e saldos.");
            if (!lotesResp.ok) throw new Error(lotesResp.msg || "Falha ao carregar os lotes.");

            const produtosAtivos = (init.produtos || []).filter((produto) => Number(produto.ativo) === 1);

            setDepositos(init.depositos || []);
            setCategorias((init.categorias || []).filter((categoria) => Number(categoria.ativo) === 1));
            setFabricantes((init.fabricantes || []).filter((fabricante) => Number(fabricante.ativo) === 1));
            setClassificacoes((init.classificacoes || []).filter((classificacao) => Number(classificacao.ativo) === 1));
            setProdutos(produtosAtivos);
            setSaldos(init.saldos || []);
            setLotes(lotesResp.rows || []);

            if (
                produtoSelecionadoId !== null &&
                !produtosAtivos.some((produto) => Number(produto.id) === Number(produtoSelecionadoId))
            ) {
                setProdutoSelecionadoId(null);
                setHistorico([]);
                setEntradas([]);
                setAjustesCusto([]);
                setBusca("");
            }
        } catch (error: unknown) {
            setErro(error instanceof Error ? error.message : "Erro ao carregar a consulta de produtos.");
        } finally {
            setLoadingBase(false);
        }
    }

    async function carregarHistoricoProduto(produtoId: ID) {
        setLoadingHistorico(true);
        setErroHistorico("");
        setHistorico([]);
        setEntradas([]);
        setAjustesCusto([]);

        try {
            const produto = produtos.find((item) => Number(item.id) === Number(produtoId));
            const termoBusca = String(produto?.codigo_barras || produto?.nome || "").trim();

            const [saidasResp, entradasResp, custoResp] = await Promise.all([
                apiGet<HistoricoResp>({
                    historico: 1,
                    tipo: "SAIDA",
                    produto_id: produtoId,
                    q: termoBusca,
                    limit: HISTORICO_LIMIT,
                    _ts: Date.now(),
                }),
                apiGet<HistoricoResp>({
                    historico: 1,
                    tipo: "ENTRADA",
                    produto_id: produtoId,
                    q: termoBusca,
                    limit: HISTORICO_LIMIT,
                    _ts: Date.now() + 1,
                }),
                apiGet<CustoProdutoDetalheResp>({
                    action: "custo_produto_detalhe",
                    produto_id: produtoId,
                    _ts: Date.now() + 2,
                }),
            ]);

            if (!saidasResp.ok) {
                throw new Error(saidasResp.msg || "Falha ao carregar as saídas do produto.");
            }

            if (!entradasResp.ok) {
                throw new Error(entradasResp.msg || "Falha ao carregar as entradas do produto.");
            }

            if (!custoResp.ok) {
                throw new Error(custoResp.msg || "Falha ao carregar os ajustes de custo do produto.");
            }

            const saidasRows = (saidasResp.rows || [])
                .filter(
                    (row) =>
                        Number(row.produto_id) === Number(produtoId) &&
                        String(row.tipo || "").toUpperCase() === "SAIDA"
                )
                .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());

            const entradasRows = (entradasResp.rows || [])
                .filter(
                    (row) =>
                        Number(row.produto_id) === Number(produtoId) &&
                        String(row.tipo || "").toUpperCase() === "ENTRADA"
                )
                .sort(
                    (a, b) =>
                        new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime() ||
                        Number(a.id) - Number(b.id)
                );

            const ajustesRows = (custoResp.ajustes || [])
                .filter(
                    (ajuste) =>
                        Number(ajuste.produto_id) === Number(produtoId) &&
                        String(ajuste.tipo || "").toUpperCase() === "NOVO_PRECO"
                )
                .sort(
                    (a, b) =>
                        new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime() ||
                        Number(a.id) - Number(b.id)
                );

            setHistorico(saidasRows);
            setEntradas(entradasRows);
            setAjustesCusto(ajustesRows);
        } catch (error: unknown) {
            setErroHistorico(
                error instanceof Error
                    ? error.message
                    : "Erro ao carregar as entradas e saídas do produto."
            );
        } finally {
            setLoadingHistorico(false);
        }
    }

    useEffect(() => {
        carregarBase();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        function handlePointerDown(event: MouseEvent) {
            if (!searchBoxRef.current?.contains(event.target as Node)) {
                setListaAberta(false);
            }
        }

        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, []);

    const resultadosBusca = useMemo(() => {
        const termo = normalizeSearch(busca);
        if (!termo) return [];

        return produtos
            .map((produto) => {
                const nome = normalizeSearch(produto.nome);
                const codigo = normalizeSearch(produto.codigo_barras);
                const descricao = normalizeSearch(produto.descricao);

                let prioridade = 99;
                if (codigo === termo) prioridade = 0;
                else if (nome === termo) prioridade = 1;
                else if (nome.startsWith(termo)) prioridade = 2;
                else if (codigo.startsWith(termo)) prioridade = 3;
                else if (nome.includes(termo)) prioridade = 4;
                else if (codigo.includes(termo)) prioridade = 5;
                else if (descricao.includes(termo)) prioridade = 6;

                return { produto, prioridade };
            })
            .filter((item) => item.prioridade < 99)
            .sort(
                (a, b) =>
                    a.prioridade - b.prioridade ||
                    a.produto.nome.localeCompare(b.produto.nome, "pt-BR")
            )
            .slice(0, 12)
            .map((item) => item.produto);
    }, [busca, produtos]);

    function selecionarProduto(produto: Produto) {
        setProdutoSelecionadoId(Number(produto.id));
        setBusca(produto.nome);
        setListaAberta(false);
        carregarHistoricoProduto(Number(produto.id));
    }

    function limparSelecao() {
        setBusca("");
        setProdutoSelecionadoId(null);
        setHistorico([]);
        setEntradas([]);
        setErroHistorico("");
        setListaAberta(false);
    }

    const saldosProduto = useMemo(() => {
        if (!produtoSelecionado) return [];

        return saldos.filter(
            (saldo) => Number(saldo.produto_id) === Number(produtoSelecionado.id)
        );
    }, [saldos, produtoSelecionado]);

    const lotesProduto = useMemo(() => {
        if (!produtoSelecionado) return [];

        return lotes
            .filter(
                (lote) =>
                    Number(lote.produto_id) === Number(produtoSelecionado.id) &&
                    clampInt(lote.quantidade_atual) > 0
            )
            .sort((a, b) => {
                const depositoA = depositoById.get(Number(a.deposito_id))?.nome || a.deposito_nome || "";
                const depositoB = depositoById.get(Number(b.deposito_id))?.nome || b.deposito_nome || "";
                return depositoA.localeCompare(depositoB, "pt-BR") || String(a.numero_lote).localeCompare(String(b.numero_lote), "pt-BR");
            });
    }, [lotes, produtoSelecionado, depositoById]);

    const estoqueAtualProduto = useMemo(
        () =>
            saldosProduto.reduce(
                (total, saldo) => total + clampInt(saldo.quantidade),
                0
            ),
        [saldosProduto]
    );

    const memoriaCustoMedio = useMemo(() => {
        const custoCadastro = num(produtoSelecionado?.preco_custo);
        let entradasSemCusto = 0;
        let quantidadeSaidaNaoProcessada = 0;

        const movimentos = [
            ...entradas.map((movimento) => ({
                ...movimento,
                tipoCalculo: "ENTRADA" as const,
            })),
            ...historico.map((movimento) => ({
                ...movimento,
                tipoCalculo: "SAIDA" as const,
            })),
            ...ajustesCusto.map((ajuste) => ({
                id: ajuste.id,
                produto_id: ajuste.produto_id,
                criado_em: ajuste.criado_em,
                quantidade: null,
                numero_lote_snapshot: null,
                novo_custo: ajuste.novo_custo,
                observacao: ajuste.observacao,
                tipoCalculo: "AJUSTE_CUSTO" as const,
            })),
        ]
            .filter(
                (movimento) =>
                    movimento.tipoCalculo === "AJUSTE_CUSTO" ||
                    clampInt(movimento.quantidade) > 0
            )
            .sort(
                (a, b) =>
                    new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime() ||
                    Number(a.id) - Number(b.id)
            );

        const custoConhecidoPrimeiraEntrada = movimentos.reduce<number>(
            (custoEncontrado, movimento) => {
                if (custoEncontrado > 0 || movimento.tipoCalculo !== "ENTRADA") {
                    return custoEncontrado;
                }

                const quantidade = clampInt(movimento.quantidade);
                const custoUnitario = num(movimento.custo_unitario_snapshot);
                const custoTotal = num(movimento.custo_total_snapshot);

                if (custoUnitario > 0) return custoUnitario;
                if (custoTotal > 0 && quantidade > 0) return custoTotal / quantidade;
                return 0;
            },
            0
        );

        const custoBaseEstimado =
            custoCadastro > 0 ? custoCadastro : custoConhecidoPrimeiraEntrada;

        let totalEntradas = 0;
        let totalSaidas = 0;
        let saldoSequencial = 0;
        let menorSaldoSequencial = 0;

        for (const movimento of movimentos) {
            if (movimento.tipoCalculo === "AJUSTE_CUSTO") continue;

            const quantidade = clampInt(movimento.quantidade);

            if (movimento.tipoCalculo === "ENTRADA") {
                totalEntradas += quantidade;
                saldoSequencial += quantidade;
            } else {
                totalSaidas += quantidade;
                saldoSequencial -= quantidade;
                menorSaldoSequencial = Math.min(menorSaldoSequencial, saldoSequencial);
            }
        }

        const saldoInicialPeloSaldoAtual =
            estoqueAtualProduto - totalEntradas + totalSaidas;
        const saldoInicialNecessarioParaSequencia = Math.max(
            0,
            -menorSaldoSequencial
        );
        const quantidadeSaldoInicial = Math.max(
            0,
            saldoInicialPeloSaldoAtual,
            saldoInicialNecessarioParaSequencia
        );

        let valorAcumulado = 0;
        let quantidadeAcumulada = 0;
        let ultimoCustoMedio = custoBaseEstimado;

        const passos: CustoMedioPasso[] = [];

        if (quantidadeSaldoInicial > 0) {
            quantidadeAcumulada = quantidadeSaldoInicial;
            valorAcumulado = roundInternal(
                quantidadeSaldoInicial * custoBaseEstimado
            );

            passos.push({
                movimento_id: -1,
                tipo: "SALDO_INICIAL",
                criado_em: movimentos[0]?.criado_em || produtoSelecionado?.atualizado_em || "",
                numero_lote: "Saldo inicial inferido",
                quantidade_anterior: 0,
                quantidade_nova: quantidadeSaldoInicial,
                quantidade_acumulada: quantidadeAcumulada,
                valor_anterior: 0,
                valor_novo: valorAcumulado,
                valor_acumulado: valorAcumulado,
                custo_unitario_novo: custoBaseEstimado,
                custo_medio: custoBaseEstimado,
                custo_estimado: true,
            });
        }

        for (const movimento of movimentos) {
            const quantidadeAnterior = quantidadeAcumulada;
            const valorAnterior = valorAcumulado;

            if (movimento.tipoCalculo === "AJUSTE_CUSTO") {
                const novoCusto = num(movimento.novo_custo);
                if (novoCusto <= 0) continue;

                // O novo preço de custo é um evento sem lote e sem alteração
                // de quantidade. No custo médio móvel, ele passa a ser a
                // referência vigente e reexpressa o valor das unidades que
                // permanecem contabilizadas naquele instante.
                const novoValorAcumulado = roundInternal(
                    quantidadeAcumulada * novoCusto
                );
                const diferencaValor = roundInternal(
                    novoValorAcumulado - valorAcumulado
                );

                valorAcumulado = novoValorAcumulado;
                ultimoCustoMedio = novoCusto;

                passos.push({
                    movimento_id: Number(movimento.id),
                    tipo: "AJUSTE_CUSTO",
                    criado_em: movimento.criado_em,
                    numero_lote: "Novo preço de custo",
                    quantidade_anterior: quantidadeAnterior,
                    quantidade_nova: 0,
                    quantidade_acumulada: quantidadeAcumulada,
                    valor_anterior: valorAnterior,
                    valor_novo: diferencaValor,
                    valor_acumulado: valorAcumulado,
                    custo_unitario_novo: novoCusto,
                    custo_medio: novoCusto,
                    custo_estimado: false,
                });

                continue;
            }

            const quantidadeMovimento = clampInt(movimento.quantidade);
            if (quantidadeMovimento <= 0) continue;

            if (movimento.tipoCalculo === "ENTRADA") {
                const custoUnitarioSnapshot = num(
                    movimento.custo_unitario_snapshot
                );
                const custoTotalSnapshot = num(
                    movimento.custo_total_snapshot
                );

                let custoUnitarioEntrada = custoBaseEstimado;
                let valorEntrada = quantidadeMovimento * custoUnitarioEntrada;
                let custoEstimado = true;

                if (custoTotalSnapshot > 0) {
                    valorEntrada = custoTotalSnapshot;
                    custoUnitarioEntrada =
                        custoTotalSnapshot / quantidadeMovimento;
                    custoEstimado = false;
                } else if (custoUnitarioSnapshot > 0) {
                    custoUnitarioEntrada = custoUnitarioSnapshot;
                    valorEntrada = quantidadeMovimento * custoUnitarioEntrada;
                    custoEstimado = false;
                } else {
                    entradasSemCusto += 1;
                }

                quantidadeAcumulada += quantidadeMovimento;
                valorAcumulado = roundInternal(valorAcumulado + valorEntrada);
                ultimoCustoMedio =
                    quantidadeAcumulada > 0
                        ? valorAcumulado / quantidadeAcumulada
                        : ultimoCustoMedio;

                passos.push({
                    movimento_id: Number(movimento.id),
                    tipo: "ENTRADA",
                    criado_em: movimento.criado_em,
                    numero_lote: movimento.numero_lote_snapshot,
                    quantidade_anterior: quantidadeAnterior,
                    quantidade_nova: quantidadeMovimento,
                    quantidade_acumulada: quantidadeAcumulada,
                    valor_anterior: valorAnterior,
                    valor_novo: roundInternal(valorEntrada),
                    valor_acumulado: valorAcumulado,
                    custo_unitario_novo: custoUnitarioEntrada,
                    custo_medio: ultimoCustoMedio,
                    custo_estimado: custoEstimado,
                });

                continue;
            }

            const custoMedioAntesDaSaida =
                quantidadeAcumulada > 0
                    ? valorAcumulado / quantidadeAcumulada
                    : ultimoCustoMedio;
            const quantidadeBaixada = Math.min(
                quantidadeMovimento,
                quantidadeAcumulada
            );
            const quantidadeNaoBaixada =
                quantidadeMovimento - quantidadeBaixada;

            if (quantidadeNaoBaixada > 0) {
                quantidadeSaidaNaoProcessada += quantidadeNaoBaixada;
            }

            const valorSaida = roundInternal(
                quantidadeBaixada * custoMedioAntesDaSaida
            );

            quantidadeAcumulada -= quantidadeBaixada;
            valorAcumulado = roundInternal(valorAcumulado - valorSaida);

            if (quantidadeAcumulada === 0) {
                valorAcumulado = 0;
            }

            if (custoMedioAntesDaSaida > 0) {
                ultimoCustoMedio = custoMedioAntesDaSaida;
            }

            passos.push({
                movimento_id: Number(movimento.id),
                tipo: "SAIDA",
                criado_em: movimento.criado_em,
                numero_lote: movimento.numero_lote_snapshot,
                quantidade_anterior: quantidadeAnterior,
                quantidade_nova: -quantidadeBaixada,
                quantidade_acumulada: quantidadeAcumulada,
                valor_anterior: valorAnterior,
                valor_novo: -valorSaida,
                valor_acumulado: valorAcumulado,
                custo_unitario_novo: custoMedioAntesDaSaida,
                custo_medio:
                    quantidadeAcumulada > 0
                        ? valorAcumulado / quantidadeAcumulada
                        : ultimoCustoMedio,
                custo_estimado: false,
            });
        }

        const quantidadeAntesConciliacao = quantidadeAcumulada;
        const valorAntesConciliacao = valorAcumulado;
        const diferencaQuantidade =
            estoqueAtualProduto - quantidadeAntesConciliacao;
        const ajusteSaldoAplicado = diferencaQuantidade !== 0;

        if (ajusteSaldoAplicado) {
            const custoMedioConciliacao =
                quantidadeAcumulada > 0
                    ? valorAcumulado / quantidadeAcumulada
                    : ultimoCustoMedio || custoBaseEstimado;
            const valorAjuste = roundInternal(
                diferencaQuantidade * custoMedioConciliacao
            );

            quantidadeAcumulada += diferencaQuantidade;
            valorAcumulado = roundInternal(valorAcumulado + valorAjuste);

            if (quantidadeAcumulada === 0) {
                valorAcumulado = 0;
            }

            if (quantidadeAcumulada > 0) {
                ultimoCustoMedio = valorAcumulado / quantidadeAcumulada;
            }

            passos.push({
                movimento_id: -2,
                tipo: "AJUSTE_SALDO",
                criado_em:
                    produtoSelecionado?.atualizado_em ||
                    movimentos[movimentos.length - 1]?.criado_em ||
                    "",
                numero_lote: "Conciliação com saldo atual",
                quantidade_anterior: quantidadeAntesConciliacao,
                quantidade_nova: diferencaQuantidade,
                quantidade_acumulada: quantidadeAcumulada,
                valor_anterior: valorAntesConciliacao,
                valor_novo: valorAjuste,
                valor_acumulado: valorAcumulado,
                custo_unitario_novo: custoMedioConciliacao,
                custo_medio:
                    quantidadeAcumulada > 0
                        ? valorAcumulado / quantidadeAcumulada
                        : ultimoCustoMedio,
                custo_estimado: true,
            });
        }

        const custoMedioCompra =
            quantidadeAcumulada > 0
                ? valorAcumulado / quantidadeAcumulada
                : ultimoCustoMedio || custoBaseEstimado;

        return {
            passos,
            valorAcumulado,
            quantidadeAcumulada,
            entradasSemCusto,
            quantidadeSaidaNaoProcessada,
            custoMedioCompra,
            saldoInicialEstimado: quantidadeSaldoInicial > 0,
            quantidadeSaldoInicial,
            custoSaldoInicial: custoBaseEstimado,
            ajusteSaldoAplicado,
            quantidadeAntesConciliacao,
            diferencaQuantidade,
        };
    }, [
        entradas,
        historico,
        ajustesCusto,
        produtoSelecionado,
        estoqueAtualProduto,
    ]);

    const estoquePorDeposito = useMemo<EstoqueDeposito[]>(() => {
        if (!produtoSelecionado) return [];

        const custoMedioCompra = memoriaCustoMedio.custoMedioCompra;

        return saldosProduto
            .map((saldo) => {
                const depositoId = Number(saldo.deposito_id);
                const quantidade = clampInt(saldo.quantidade);
                const lotesDeposito = lotesProduto.filter(
                    (lote) => Number(lote.deposito_id) === depositoId
                );

                const quantidadeLotes = lotesDeposito.reduce(
                    (total, lote) => total + clampInt(lote.quantidade_atual),
                    0
                );

                const quantidadeCobertaPorLote = Math.min(quantidade, quantidadeLotes);
                const quantidadeSemLote = Math.max(0, quantidade - quantidadeCobertaPorLote);
                const valorEstoque = quantidade * custoMedioCompra;

                return {
                    deposito_id: depositoId,
                    deposito_nome:
                        depositoById.get(depositoId)?.nome || `Depósito #${depositoId}`,
                    quantidade,
                    minimo: clampInt(saldo.minimo),
                    maximo: clampInt(saldo.maximo),
                    lotes: lotesDeposito.length,
                    custo_medio: custoMedioCompra,
                    valor_estoque: valorEstoque,
                    qtd_sem_lote: quantidadeSemLote,
                };
            })
            .filter((row) => row.quantidade > 0 || row.minimo > 0 || row.maximo > 0)
            .sort(
                (a, b) =>
                    b.quantidade - a.quantidade ||
                    a.deposito_nome.localeCompare(b.deposito_nome, "pt-BR")
            );
    }, [
        produtoSelecionado,
        saldosProduto,
        lotesProduto,
        depositoById,
        memoriaCustoMedio.custoMedioCompra,
    ]);

    const resumo = useMemo(() => {
        if (!produtoSelecionado) return null;

        const estoqueAtual = estoquePorDeposito.reduce(
            (total, row) => total + row.quantidade,
            0
        );

        const qtdSemLote = estoquePorDeposito.reduce(
            (total, row) => total + row.qtd_sem_lote,
            0
        );

        const custoMedioCompra = memoriaCustoMedio.custoMedioCompra;
        const valorEstoque = memoriaCustoMedio.valorAcumulado;

        const precoVenda = num(produtoSelecionado.valor);
        const margemUnitaria = precoVenda - custoMedioCompra;
        const margemPercentual = precoVenda > 0 ? (margemUnitaria / precoVenda) * 100 : 0;
        const markupPercentual =
            custoMedioCompra > 0 ? (margemUnitaria / custoMedioCompra) * 100 : null;

        const saidasTotal = historico.reduce(
            (total, movimento) => total + clampInt(movimento.quantidade),
            0
        );

        const inicio30Dias = daysAgo(29);
        const saidas30Dias = historico.reduce((total, movimento) => {
            const data = new Date(movimento.criado_em);
            if (!Number.isFinite(data.getTime()) || data < inicio30Dias) return total;
            return total + clampInt(movimento.quantidade);
        }, 0);

        const mediaDiaria30Dias = saidas30Dias / 30;
        const coberturaDias = mediaDiaria30Dias > 0 ? estoqueAtual / mediaDiaria30Dias : null;
        const ultimaSaida = historico[0]?.criado_em || null;

        return {
            estoqueAtual,
            valorEstoque,
            qtdSemLote,
            custoMedioCompra,
            valorContabilAcumulado: memoriaCustoMedio.valorAcumulado,
            quantidadeContabilAcumulada: memoriaCustoMedio.quantidadeAcumulada,
            entradasSemCusto: memoriaCustoMedio.entradasSemCusto,
            quantidadeSaidaNaoProcessada:
                memoriaCustoMedio.quantidadeSaidaNaoProcessada,
            saldoInicialEstimado: memoriaCustoMedio.saldoInicialEstimado,
            quantidadeSaldoInicial: memoriaCustoMedio.quantidadeSaldoInicial,
            custoSaldoInicial: memoriaCustoMedio.custoSaldoInicial,
            ajusteSaldoAplicado: memoriaCustoMedio.ajusteSaldoAplicado,
            quantidadeAntesConciliacao:
                memoriaCustoMedio.quantidadeAntesConciliacao,
            diferencaQuantidade: memoriaCustoMedio.diferencaQuantidade,
            precoVenda,
            margemUnitaria,
            margemPercentual,
            markupPercentual,
            saidasTotal,
            saidas30Dias,
            mediaDiaria30Dias,
            coberturaDias,
            ultimaSaida,
            movimentacoes: historico.length,
        };
    }, [produtoSelecionado, estoquePorDeposito, historico, memoriaCustoMedio]);

    const categoriaNome = produtoSelecionado
        ? produtoSelecionado.categoria_nome ||
        (produtoSelecionado.categoria_id
            ? categoriaById.get(Number(produtoSelecionado.categoria_id))?.nome
            : "") ||
        ""
        : "";

    const fabricanteNome = produtoSelecionado
        ? produtoSelecionado.fabricante_nome ||
        (produtoSelecionado.fabricante_id
            ? fabricanteById.get(Number(produtoSelecionado.fabricante_id))?.nome
            : "") ||
        ""
        : "";

    const classificacaoNome = produtoSelecionado
        ? produtoSelecionado.classificacao_nome ||
        (produtoSelecionado.classificacao_id
            ? classificacaoById.get(Number(produtoSelecionado.classificacao_id))?.nome
            : "") ||
        ""
        : "";

    return (
        <main className="min-h-screen bg-slate-50 p-3 text-slate-900 sm:p-6">
            <div className="mx-auto max-w-6xl space-y-4">
                <header>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Estoque
                    </p>
                    <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                        Consulta de produto
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                        Pesquise pelo nome ou código de barras para ver estoque, saídas, custos e preço de venda.
                    </p>
                </header>

                {erro ? (
                    <Panel className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                        <b>Erro:</b> {erro}
                    </Panel>
                ) : null}

                <div ref={searchBoxRef} className="relative z-20">
                    <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                            <SearchIcon />
                        </div>

                        <input
                            type="search"
                            value={busca}
                            disabled={loadingBase}
                            onFocus={() => setListaAberta(true)}
                            onChange={(event) => {
                                const value = event.target.value;
                                setBusca(value);
                                setListaAberta(true);

                                if (
                                    produtoSelecionado &&
                                    normalizeSearch(value) !== normalizeSearch(produtoSelecionado.nome)
                                ) {
                                    setProdutoSelecionadoId(null);
                                    setHistorico([]);
                                    setEntradas([]);
                                    setErroHistorico("");
                                }
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && resultadosBusca[0]) {
                                    event.preventDefault();
                                    selecionarProduto(resultadosBusca[0]);
                                }

                                if (event.key === "Escape") {
                                    setListaAberta(false);
                                }
                            }}
                            placeholder={loadingBase ? "Carregando produtos..." : "Digite o produto ou código de barras"}
                            className="h-14 w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-12 text-base font-medium text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-200 disabled:cursor-wait disabled:bg-slate-100 sm:h-16 sm:text-lg"
                            autoComplete="off"
                        />

                        {busca ? (
                            <button
                                type="button"
                                onClick={limparSelecao}
                                aria-label="Limpar pesquisa"
                                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-xl text-slate-400 hover:text-slate-700"
                            >
                                ×
                            </button>
                        ) : null}
                    </div>

                    {listaAberta && busca.trim() && !produtoSelecionado ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                            {resultadosBusca.length === 0 ? (
                                <div className="p-4 text-sm text-slate-500">
                                    Nenhum produto encontrado.
                                </div>
                            ) : (
                                <ul className="max-h-80 overflow-auto py-2">
                                    {resultadosBusca.map((produto) => (
                                        <li key={produto.id}>
                                            <button
                                                type="button"
                                                onClick={() => selecionarProduto(produto)}
                                                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                                            >
                                                <span className="min-w-0">
                                                    <span className="block truncate font-bold text-slate-950">
                                                        {produto.nome}
                                                    </span>
                                                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                                                        Código: {produto.codigo_barras || "sem código"}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 text-sm font-bold text-slate-700">
                                                    {moneyBRL(num(produto.valor))}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ) : null}
                </div>

                {!produtoSelecionado ? (
                    <Panel className="flex min-h-64 items-center justify-center p-8 text-center">
                        <div className="max-w-md">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                                <SearchIcon />
                            </div>
                            <h2 className="mt-4 text-lg font-bold text-slate-950">
                                Selecione um produto
                            </h2>
                            <p className="mt-1 text-sm leading-6 text-slate-500">
                                A consulta mostrará os dados consolidados do item, sem filtros adicionais.
                            </p>
                        </div>
                    </Panel>
                ) : (
                    <>
                        <Panel className="p-4 sm:p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                                {produtoSelecionado.foto_url ? (
                                    <img
                                        src={produtoSelecionado.foto_url}
                                        alt={produtoSelecionado.nome}
                                        className="h-20 w-20 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 object-cover sm:h-24 sm:w-24"
                                    />
                                ) : (
                                    <ProductPlaceholder name={produtoSelecionado.nome} />
                                )}

                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <h2 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                                                {produtoSelecionado.nome}
                                            </h2>
                                            <p className="mt-1 text-sm text-slate-500">
                                                Código de barras: {produtoSelecionado.codigo_barras || "não informado"}
                                            </p>
                                        </div>

                                        {produtoSelecionado.atualizado_em ? (
                                            <span className="shrink-0 text-xs text-slate-400">
                                                Atualizado em {fmtDateTime(produtoSelecionado.atualizado_em)}
                                            </span>
                                        ) : null}
                                    </div>

                                    {produtoSelecionado.descricao ? (
                                        <p className="mt-3 text-sm leading-6 text-slate-600">
                                            {produtoSelecionado.descricao}
                                        </p>
                                    ) : null}

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {[categoriaNome, fabricanteNome, classificacaoNome]
                                            .filter(Boolean)
                                            .map((label) => (
                                                <span
                                                    key={label}
                                                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600"
                                                >
                                                    {label}
                                                </span>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        </Panel>

                        {erroHistorico ? (
                            <Panel className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                Os dados de estoque e preço foram carregados, mas as entradas e saídas não puderam ser consultadas: {erroHistorico}
                            </Panel>
                        ) : null}

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <KpiCard
                                label="Estoque atual"
                                value={resumo ? intBR(resumo.estoqueAtual) : "0"}
                                hint={`${estoquePorDeposito.length} depósito(s) com cadastro de saldo`}
                                emphasis
                            />
                            <KpiCard
                                label="Quantidade de saída"
                                value={loadingHistorico ? "..." : intBR(resumo?.saidasTotal || 0)}
                                hint={
                                    loadingHistorico
                                        ? "Carregando movimentações"
                                        : `${intBR(resumo?.movimentacoes || 0)} movimentação(ões) carregada(s)`
                                }
                            />
                            <KpiCard
                                label="Custo médio móvel"
                                value={loadingHistorico ? "..." : moneyBRL(resumo?.custoMedioCompra || 0)}
                                hint={loadingHistorico ? "Carregando movimentações" : "Entradas somam; saídas baixam VA e Q pelo custo médio vigente"}
                            />
                            <KpiCard
                                label="Preço de venda"
                                value={moneyBRL(resumo?.precoVenda || 0)}
                                hint="Valor cadastrado no produto"
                            />
                            <KpiCard
                                label="Margem bruta unitária"
                                value={loadingHistorico ? "..." : moneyBRL(resumo?.margemUnitaria || 0)}
                                hint={
                                    loadingHistorico
                                        ? "Carregando custo médio"
                                        : `${decimalBR(resumo?.margemPercentual || 0, 1)}% sobre a venda${resumo?.markupPercentual === null || resumo?.markupPercentual === undefined
                                            ? ""
                                            : ` | markup ${decimalBR(resumo.markupPercentual, 1)}%`
                                        }`
                                }
                            />
                            <KpiCard
                                label="Valor em estoque"
                                value={loadingHistorico ? "..." : moneyBRL(resumo?.valorEstoque || 0)}
                                hint={
                                    resumo?.coberturaDias === null || resumo?.coberturaDias === undefined
                                        ? "Sem saída nos últimos 30 dias"
                                        : `Cobertura estimada: ${decimalBR(resumo.coberturaDias, 1)} dias`
                                }
                            />
                        </div>

                        {historico.length >= HISTORICO_LIMIT || entradas.length >= HISTORICO_LIMIT ? (
                            <Panel className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                A consulta atingiu o limite de {intBR(HISTORICO_LIMIT)} registros. O custo médio ou a quantidade total de saída pode estar parcial.
                            </Panel>
                        ) : null}

                        {resumo && !loadingHistorico && resumo.entradasSemCusto > 0 ? (
                            <Panel className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                Existem <b>{intBR(resumo.entradasSemCusto)}</b> entrada(s) sem custo gravado no histórico. Nessas entradas, o cálculo usou o preço de custo atual do cadastro ou o primeiro custo conhecido.
                            </Panel>
                        ) : null}

                        {resumo && !loadingHistorico && resumo.saldoInicialEstimado ? (
                            <Panel className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                Foi inferido um saldo inicial de <b>{intBR(resumo.quantidadeSaldoInicial)}</b> unidade(s), valorizado a <b>{moneyBRL(resumo.custoSaldoInicial)}</b> por unidade. Esse valor é estimado porque o histórico carregado não informa o custo contábil de abertura.
                            </Panel>
                        ) : null}

                        {resumo && !loadingHistorico && resumo.ajusteSaldoAplicado ? (
                            <Panel className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                A sequência de movimentos terminou com <b>{intBR(resumo.quantidadeAntesConciliacao)}</b> unidade(s), enquanto o saldo atual informa <b>{intBR(resumo.estoqueAtual)}</b>. Foi aplicada uma conciliação de <b>{signedIntBR(resumo.diferencaQuantidade)}</b> unidade(s), sem alterar o custo médio. Verifique ajustes de estoque, movimentos anteriores ao histórico ou o limite da consulta.
                            </Panel>
                        ) : null}

                        {resumo && !loadingHistorico && resumo.quantidadeSaidaNaoProcessada > 0 ? (
                            <Panel className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                                Não foi possível baixar <b>{intBR(resumo.quantidadeSaidaNaoProcessada)}</b> unidade(s) de saída porque a memória calculada não possuía quantidade suficiente naquele ponto do histórico.
                            </Panel>
                        ) : null}

                        {resumo ? (
                            <Panel className="p-4">
                                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Valor contábil atual do estoque
                                </div>
                                <div className="mt-2 text-sm leading-6 text-slate-700">
                                    {loadingHistorico ? (
                                        "Carregando a memória de entradas e saídas..."
                                    ) : (
                                        <>
                                            VA = <b>{moneyBRL(resumo.valorContabilAcumulado)}</b>, Q = <b>{intBR(resumo.quantidadeContabilAcumulada)}</b> e custo médio = <b>{moneyBRL(resumo.custoMedioCompra)}</b>. As entradas aumentam VA e Q; cada saída reduz Q e baixa o VA pelo custo médio vigente antes da saída.
                                        </>
                                    )}
                                </div>
                            </Panel>
                        ) : null}

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <Panel className="overflow-hidden">
                                <SectionHeader
                                    title="Estoque por depósito"
                                    subtitle="Quantidade, custo médio e valor atual do item"
                                />

                                <div className="overflow-auto">
                                    <table className="w-full min-w-[680px] border-collapse text-sm">
                                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                            <tr>
                                                <th className="border-b border-slate-200 px-4 py-3">Depósito</th>
                                                <th className="border-b border-slate-200 px-4 py-3 text-right">Qtd</th>
                                                <th className="border-b border-slate-200 px-4 py-3 text-right">Mín.</th>
                                                <th className="border-b border-slate-200 px-4 py-3 text-right">Máx.</th>
                                                <th className="border-b border-slate-200 px-4 py-3 text-right">Custo médio</th>
                                                <th className="border-b border-slate-200 px-4 py-3 text-right">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {estoquePorDeposito.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                                                        Nenhum saldo encontrado para este produto.
                                                    </td>
                                                </tr>
                                            ) : (
                                                estoquePorDeposito.map((row) => (
                                                    <tr key={row.deposito_id} className="odd:bg-white even:bg-slate-50/60">
                                                        <td className="border-b border-slate-100 px-4 py-3">
                                                            <div className="font-bold text-slate-950">{row.deposito_nome}</div>
                                                            <div className="mt-0.5 text-xs text-slate-500">
                                                                {row.lotes} lote(s)
                                                                {row.qtd_sem_lote > 0
                                                                    ? ` | ${intBR(row.qtd_sem_lote)} sem lote`
                                                                    : ""}
                                                            </div>
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right font-black text-slate-950">
                                                            {intBR(row.quantidade)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right text-slate-600">
                                                            {intBR(row.minimo)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right text-slate-600">
                                                            {intBR(row.maximo)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right font-semibold">
                                                            {moneyBRL(row.custo_medio)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right font-bold">
                                                            {moneyBRL(row.valor_estoque)}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </Panel>

                            <Panel>
                                <SectionHeader
                                    title="Resumo de saídas"
                                    subtitle="Leitura rápida do consumo do produto"
                                />

                                <div className="grid grid-cols-2 gap-3 p-4">
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs font-semibold text-slate-500">Últimos 30 dias</div>
                                        <div className="mt-1 text-xl font-black text-slate-950">
                                            {loadingHistorico ? "..." : intBR(resumo?.saidas30Dias || 0)}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">unidades</div>
                                    </div>

                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs font-semibold text-slate-500">Média diária</div>
                                        <div className="mt-1 text-xl font-black text-slate-950">
                                            {loadingHistorico ? "..." : decimalBR(resumo?.mediaDiaria30Dias || 0, 2)}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">últimos 30 dias</div>
                                    </div>

                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs font-semibold text-slate-500">Cobertura</div>
                                        <div className="mt-1 text-xl font-black text-slate-950">
                                            {loadingHistorico
                                                ? "..."
                                                : resumo?.coberturaDias === null || resumo?.coberturaDias === undefined
                                                    ? "Sem consumo"
                                                    : `${decimalBR(resumo.coberturaDias, 1)} dias`}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">com o estoque atual</div>
                                    </div>

                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <div className="text-xs font-semibold text-slate-500">Última saída</div>
                                        <div className="mt-1 text-sm font-black leading-6 text-slate-950">
                                            {loadingHistorico
                                                ? "Carregando..."
                                                : resumo?.ultimaSaida
                                                    ? fmtDateTime(resumo.ultimaSaida)
                                                    : "Nenhuma saída"}
                                        </div>
                                    </div>
                                </div>
                            </Panel>
                        </div>

                        <Panel className="overflow-hidden">
                            <SectionHeader
                                title="Memória do custo médio móvel"
                                subtitle="Entradas aumentam VA e Q; saídas reduzem ambos pelo custo médio vigente"
                            />

                            <div className="overflow-auto">
                                <table className="w-full min-w-[1240px] border-collapse text-sm">
                                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                        <tr>
                                            <th className="border-b border-slate-200 px-4 py-3">Data</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Movimento</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Lote / referência</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Q anterior</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Mov. Q</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">VA anterior</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Mov. VA</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">VA / Q após</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Custo médio</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingHistorico ? (
                                            <tr>
                                                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                                                    Carregando entradas e saídas do produto...
                                                </td>
                                            </tr>
                                        ) : memoriaCustoMedio.passos.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                                                    Nenhum movimento com quantidade foi encontrado. O custo cadastrado está sendo usado como fallback.
                                                </td>
                                            </tr>
                                        ) : (
                                            [...memoriaCustoMedio.passos]
                                                .reverse()
                                                .slice(0, 50)
                                                .map((passo) => (
                                                    <tr
                                                        key={`${passo.tipo}-${passo.movimento_id}`}
                                                        className="odd:bg-white even:bg-slate-50/60"
                                                    >
                                                        <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                                                            {fmtDateTime(passo.criado_em) || "Não informado"}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3">
                                                            <span
                                                                className={[
                                                                    "inline-flex rounded-full px-2.5 py-1 text-[11px] font-black",
                                                                    passo.tipo === "ENTRADA"
                                                                        ? "bg-emerald-50 text-emerald-700"
                                                                        : passo.tipo === "SAIDA"
                                                                            ? "bg-rose-50 text-rose-700"
                                                                            : "bg-amber-50 text-amber-800",
                                                                ].join(" ")}
                                                            >
                                                                {passo.tipo === "SALDO_INICIAL"
                                                                    ? "SALDO INICIAL"
                                                                    : passo.tipo === "AJUSTE_SALDO"
                                                                        ? "CONCILIAÇÃO"
                                                                        : passo.tipo === "AJUSTE_CUSTO"
                                                                            ? "NOVO CUSTO"
                                                                            : passo.tipo}
                                                            </span>
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                                                            {passo.numero_lote || "Não informado"}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right">
                                                            {intBR(passo.quantidade_anterior)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right font-bold">
                                                            {signedIntBR(passo.quantidade_nova)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right">
                                                            {moneyBRL(passo.valor_anterior)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right">
                                                            {signedMoneyBRL(passo.valor_novo)}
                                                            {passo.custo_estimado ? (
                                                                <div className="mt-0.5 text-[11px] text-amber-700">estimado</div>
                                                            ) : null}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right text-slate-600">
                                                            {moneyBRL(passo.valor_acumulado)} / {intBR(passo.quantidade_acumulada)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right font-black text-slate-950">
                                                            {moneyBRL(passo.custo_medio)}
                                                        </td>
                                                    </tr>
                                                ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>

                        <Panel className="overflow-hidden">
                            <SectionHeader
                                title="Lotes atuais"
                                subtitle={`${intBR(lotesProduto.length)} lote(s) com saldo para este produto`}
                            />

                            <div className="overflow-auto">
                                <table className="w-full min-w-[780px] border-collapse text-sm">
                                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                        <tr>
                                            <th className="border-b border-slate-200 px-4 py-3">Lote</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Depósito</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Qtd atual</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Custo unitário</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Custo total</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Atualização</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lotesProduto.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                                                    Nenhum lote com saldo encontrado.
                                                </td>
                                            </tr>
                                        ) : (
                                            lotesProduto.map((lote) => {
                                                const quantidade = clampInt(lote.quantidade_atual);
                                                const custo = num(lote.custo_unitario);
                                                const deposito =
                                                    depositoById.get(Number(lote.deposito_id))?.nome ||
                                                    lote.deposito_nome ||
                                                    `Depósito #${lote.deposito_id}`;

                                                return (
                                                    <tr key={lote.id} className="odd:bg-white even:bg-slate-50/60">
                                                        <td className="border-b border-slate-100 px-4 py-3 font-bold text-slate-950">
                                                            {lote.numero_lote || "Sem identificação"}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                                                            {deposito}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right font-black">
                                                            {intBR(quantidade)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right">
                                                            {moneyBRL(custo)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-right font-bold">
                                                            {moneyBRL(quantidade * custo)}
                                                        </td>
                                                        <td className="border-b border-slate-100 px-4 py-3 text-slate-600">
                                                            {fmtDateTime(lote.atualizado_em || lote.criado_em)}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>

                        <Panel className="overflow-hidden">
                            <SectionHeader
                                title="Últimas saídas"
                                subtitle={
                                    loadingHistorico
                                        ? "Carregando movimentações..."
                                        : `Exibindo até 30 das ${intBR(historico.length)} movimentações carregadas`
                                }
                            />

                            <div className="overflow-auto">
                                <table className="w-full min-w-[980px] border-collapse text-sm">
                                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                        <tr>
                                            <th className="border-b border-slate-200 px-4 py-3">Data</th>
                                            <th className="border-b border-slate-200 px-4 py-3 text-right">Qtd</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Origem</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Destino</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Solicitante</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Operador</th>
                                            <th className="border-b border-slate-200 px-4 py-3">Observação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingHistorico ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                                                    Carregando saídas do produto...
                                                </td>
                                            </tr>
                                        ) : historico.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                                                    Nenhuma saída encontrada para este produto.
                                                </td>
                                            </tr>
                                        ) : (
                                            historico.slice(0, 30).map((movimento) => (
                                                <tr key={movimento.id} className="odd:bg-white even:bg-slate-50/60">
                                                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                                                        {fmtDateTime(movimento.criado_em)}
                                                    </td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-right font-black text-slate-950">
                                                        {intBR(clampInt(movimento.quantidade))}
                                                    </td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                                                        {movimento.deposito_origem_nome ||
                                                            (movimento.deposito_origem_id
                                                                ? depositoById.get(Number(movimento.deposito_origem_id))?.nome
                                                                : "") ||
                                                            "Não informado"}
                                                    </td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                                                        {movimento.destino_texto ||
                                                            movimento.deposito_destino_nome ||
                                                            "Não informado"}
                                                    </td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                                                        {movimento.solicitante_nome || "Não informado"}
                                                    </td>
                                                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                                                        {movimento.operador_nome || "Não informado"}
                                                    </td>
                                                    <td className="max-w-sm border-b border-slate-100 px-4 py-3 text-slate-600">
                                                        {movimento.observacao || ""}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>

                        <Panel className="p-4 text-xs leading-5 text-slate-500">
                            O cálculo usa custo médio móvel. Nas entradas, o valor e a quantidade comprados são somados ao VA e ao Q anteriores. Nas saídas, a quantidade é baixada pelo custo médio existente imediatamente antes do movimento, reduzindo o VA na mesma proporção. Um Novo preço de custo aparece como evento sem lote e sem quantidade, passando a ser o custo vigente das unidades contabilizadas naquele instante. Ao final, o VA representa o valor contábil das unidades que permanecem no estoque. Quando o histórico não fecha com o saldo atual, a página exibe uma conciliação explícita.
                        </Panel>
                    </>
                )}
            </div>
        </main>
    );
}
