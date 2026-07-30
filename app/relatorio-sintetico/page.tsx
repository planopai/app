"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ID = number;

type Deposito = {
    id: ID;
    nome: string;
};

type Produto = {
    id: ID;
    nome: string;
    codigo_barras: string;
    valor: string | number;
    preco_custo?: string | number | null;
    foto_url?: string | null;
    ativo: number;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number;
    minimo: number;
    maximo: number;
};

type Movimento = {
    id: number;
    tipo: string;
    produto_id: ID;
    quantidade: number | null;
    custo_unitario_snapshot?: string | number | null;
    custo_total_snapshot?: string | number | null;
    criado_em: string;
};

type InitResp = {
    ok: boolean;
    depositos: Deposito[];
    produtos: Produto[];
    saldos: Saldo[];
    msg?: string;
};

type HistoricoResp = {
    ok: boolean;
    rows: Movimento[];
    msg?: string;
};

type PassoCalculo = {
    id: number;
    data: string;
    tipo: "ENTRADA" | "SAIDA" | "AJUSTE";
    movimento: number;
    quantidadeFinal: number;
    valorFinal: number;
    custoMedioFinal: number;
};

const API_BASE =
    "https://api.planoassistencialintegrado.com.br/materiais_gerais.php";

const HISTORICO_LIMIT = 500;

function numero(valor: unknown): number {
    if (typeof valor === "number") {
        return Number.isFinite(valor) ? valor : 0;
    }

    const texto = String(valor ?? "")
        .trim()
        .replace(/R\$/gi, "")
        .replace(/\s/g, "")
        .replace(/[^0-9,.-]/g, "");

    if (!texto) return 0;

    const normalizado = texto.includes(",")
        ? texto.replace(/\./g, "").replace(",", ".")
        : texto;

    const resultado = Number(normalizado);
    return Number.isFinite(resultado) ? resultado : 0;
}

function inteiro(valor: unknown): number {
    const resultado = Number(valor);
    return Number.isFinite(resultado)
        ? Math.max(0, Math.floor(resultado))
        : 0;
}

function moeda(valor: number): string {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(Number.isFinite(valor) ? valor : 0);
}

function formatarInteiro(valor: number): string {
    return new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 0,
    }).format(Number.isFinite(valor) ? valor : 0);
}

function formatarData(valor?: string | null): string {
    if (!valor) return "";

    const data = new Date(valor);
    if (!Number.isFinite(data.getTime())) return valor;

    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(data);
}

function normalizarBusca(valor: unknown): string {
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

async function apiGet<T>(
    parametros: Record<string, string | number | undefined>
): Promise<T> {
    const url = new URL(API_BASE);

    Object.entries(parametros).forEach(([chave, valor]) => {
        if (valor !== undefined) {
            url.searchParams.set(chave, String(valor));
        }
    });

    const resposta = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });

    const tipo = resposta.headers.get("content-type") || "";

    if (!tipo.includes("application/json")) {
        throw new Error("A API retornou uma resposta inválida.");
    }

    return (await resposta.json()) as T;
}

function Card({
    titulo,
    valor,
    destaque = false,
}: {
    titulo: string;
    valor: string;
    destaque?: boolean;
}) {
    return (
        <div
            className={
                destaque
                    ? "rounded-2xl bg-slate-950 p-4 text-white shadow-sm"
                    : "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            }
        >
            <div
                className={
                    destaque
                        ? "text-xs font-bold uppercase tracking-wide text-slate-300"
                        : "text-xs font-bold uppercase tracking-wide text-slate-500"
                }
            >
                {titulo}
            </div>
            <div className="mt-2 text-2xl font-black">{valor}</div>
        </div>
    );
}

export default function Page() {
    const caixaBuscaRef = useRef<HTMLDivElement>(null);

    const [carregando, setCarregando] = useState(true);
    const [carregandoHistorico, setCarregandoHistorico] = useState(false);
    const [erro, setErro] = useState("");

    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);
    const [movimentos, setMovimentos] = useState<Movimento[]>([]);

    const [busca, setBusca] = useState("");
    const [produtoId, setProdutoId] = useState<ID | null>(null);
    const [listaAberta, setListaAberta] = useState(false);

    useEffect(() => {
        async function carregar() {
            setCarregando(true);
            setErro("");

            try {
                const resposta = await apiGet<InitResp>({
                    init: 1,
                    _ts: Date.now(),
                });

                if (!resposta.ok) {
                    throw new Error(
                        resposta.msg || "Falha ao carregar os produtos."
                    );
                }

                setDepositos(resposta.depositos || []);
                setProdutos(
                    (resposta.produtos || []).filter(
                        (produto) => Number(produto.ativo) === 1
                    )
                );
                setSaldos(resposta.saldos || []);
            } catch (falha) {
                setErro(
                    falha instanceof Error
                        ? falha.message
                        : "Erro ao carregar a página."
                );
            } finally {
                setCarregando(false);
            }
        }

        carregar();
    }, []);

    useEffect(() => {
        function fecharLista(evento: MouseEvent) {
            if (!caixaBuscaRef.current?.contains(evento.target as Node)) {
                setListaAberta(false);
            }
        }

        document.addEventListener("mousedown", fecharLista);

        return () => {
            document.removeEventListener("mousedown", fecharLista);
        };
    }, []);

    const produtoSelecionado = useMemo(
        () =>
            produtos.find(
                (produto) => Number(produto.id) === Number(produtoId)
            ) || null,
        [produtos, produtoId]
    );

    const resultados = useMemo(() => {
        const termo = normalizarBusca(busca);

        if (!termo) return [];

        return produtos
            .filter((produto) => {
                const nome = normalizarBusca(produto.nome);
                const codigo = normalizarBusca(produto.codigo_barras);

                return nome.includes(termo) || codigo.includes(termo);
            })
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
            .slice(0, 10);
    }, [busca, produtos]);

    const depositoPorId = useMemo(
        () =>
            new Map(
                depositos.map((deposito) => [
                    Number(deposito.id),
                    deposito.nome,
                ])
            ),
        [depositos]
    );

    async function selecionarProduto(produto: Produto) {
        setProdutoId(Number(produto.id));
        setBusca(produto.nome);
        setListaAberta(false);
        setMovimentos([]);
        setCarregandoHistorico(true);
        setErro("");

        try {
            const termo =
                String(produto.codigo_barras || "").trim() || produto.nome;

            const resposta = await apiGet<HistoricoResp>({
                historico: 1,
                q: termo,
                limit: HISTORICO_LIMIT,
                _ts: Date.now(),
            });

            if (!resposta.ok) {
                throw new Error(
                    resposta.msg || "Falha ao carregar o histórico."
                );
            }

            const linhas = (resposta.rows || [])
                .filter(
                    (movimento) =>
                        Number(movimento.produto_id) === Number(produto.id)
                )
                .sort(
                    (a, b) =>
                        new Date(a.criado_em).getTime() -
                        new Date(b.criado_em).getTime() ||
                        Number(a.id) - Number(b.id)
                );

            setMovimentos(linhas);
        } catch (falha) {
            setErro(
                falha instanceof Error
                    ? falha.message
                    : "Erro ao carregar o histórico."
            );
        } finally {
            setCarregandoHistorico(false);
        }
    }

    function limpar() {
        setBusca("");
        setProdutoId(null);
        setMovimentos([]);
        setListaAberta(false);
        setErro("");
    }

    const saldosProduto = useMemo(() => {
        if (!produtoSelecionado) return [];

        return saldos
            .filter(
                (saldo) =>
                    Number(saldo.produto_id) ===
                    Number(produtoSelecionado.id)
            )
            .map((saldo) => ({
                ...saldo,
                deposito_nome:
                    depositoPorId.get(Number(saldo.deposito_id)) ||
                    `Depósito #${saldo.deposito_id}`,
            }))
            .filter(
                (saldo) =>
                    inteiro(saldo.quantidade) > 0 ||
                    inteiro(saldo.minimo) > 0 ||
                    inteiro(saldo.maximo) > 0
            )
            .sort((a, b) => b.quantidade - a.quantidade);
    }, [saldos, produtoSelecionado, depositoPorId]);

    const calculo = useMemo(() => {
        const custoCadastro = numero(
            produtoSelecionado?.preco_custo
        );

        let quantidade = 0;
        let valor = 0;
        let custoMedio = custoCadastro;
        let faltasNoHistorico = 0;
        let entradasSemCusto = 0;

        const passos: PassoCalculo[] = [];

        for (const movimento of movimentos) {
            const tipo = String(movimento.tipo || "").toUpperCase();
            const quantidadeMovimento = Number(
                movimento.quantidade || 0
            );

            if (
                !Number.isFinite(quantidadeMovimento) ||
                quantidadeMovimento === 0
            ) {
                continue;
            }

            if (tipo === "ENTRADA") {
                const quantidadeEntrada = Math.max(
                    0,
                    Math.floor(quantidadeMovimento)
                );

                if (quantidadeEntrada <= 0) continue;

                const custoInformado = numero(
                    movimento.custo_unitario_snapshot
                );

                const custoEntrada =
                    custoInformado > 0 ? custoInformado : custoCadastro;

                if (custoInformado <= 0) {
                    entradasSemCusto += 1;
                }

                const totalInformado = numero(
                    movimento.custo_total_snapshot
                );

                const valorEntrada =
                    totalInformado > 0
                        ? totalInformado
                        : quantidadeEntrada * custoEntrada;

                valor += valorEntrada;
                quantidade += quantidadeEntrada;
                custoMedio =
                    quantidade > 0 ? valor / quantidade : custoCadastro;

                passos.push({
                    id: movimento.id,
                    data: movimento.criado_em,
                    tipo: "ENTRADA",
                    movimento: quantidadeEntrada,
                    quantidadeFinal: quantidade,
                    valorFinal: valor,
                    custoMedioFinal: custoMedio,
                });

                continue;
            }

            if (tipo === "SAIDA") {
                const quantidadeSaida = Math.max(
                    0,
                    Math.floor(Math.abs(quantidadeMovimento))
                );

                if (quantidadeSaida <= 0) continue;

                const quantidadeAtendida = Math.min(
                    quantidadeSaida,
                    quantidade
                );

                valor -= quantidadeAtendida * custoMedio;
                quantidade -= quantidadeAtendida;

                if (quantidade <= 0) {
                    quantidade = 0;
                    valor = 0;
                }

                if (quantidadeSaida > quantidadeAtendida) {
                    faltasNoHistorico +=
                        quantidadeSaida - quantidadeAtendida;
                }

                passos.push({
                    id: movimento.id,
                    data: movimento.criado_em,
                    tipo: "SAIDA",
                    movimento: -quantidadeSaida,
                    quantidadeFinal: quantidade,
                    valorFinal: valor,
                    custoMedioFinal: custoMedio,
                });

                continue;
            }

            if (tipo === "AJUSTE") {
                const diferenca = Math.trunc(quantidadeMovimento);

                if (diferenca > 0) {
                    const custoAjuste =
                        custoMedio > 0 ? custoMedio : custoCadastro;

                    quantidade += diferenca;
                    valor += diferenca * custoAjuste;
                } else {
                    const quantidadeAjuste = Math.abs(diferenca);
                    const quantidadeAtendida = Math.min(
                        quantidadeAjuste,
                        quantidade
                    );

                    valor -= quantidadeAtendida * custoMedio;
                    quantidade -= quantidadeAtendida;

                    if (quantidade <= 0) {
                        quantidade = 0;
                        valor = 0;
                    }

                    if (quantidadeAjuste > quantidadeAtendida) {
                        faltasNoHistorico +=
                            quantidadeAjuste - quantidadeAtendida;
                    }
                }

                custoMedio =
                    quantidade > 0 ? valor / quantidade : custoMedio;

                passos.push({
                    id: movimento.id,
                    data: movimento.criado_em,
                    tipo: "AJUSTE",
                    movimento: diferenca,
                    quantidadeFinal: quantidade,
                    valorFinal: valor,
                    custoMedioFinal: custoMedio,
                });
            }
        }

        return {
            quantidadeCalculada: quantidade,
            custoMedio:
                passos.length > 0 && custoMedio > 0
                    ? custoMedio
                    : custoCadastro,
            passos,
            faltasNoHistorico,
            entradasSemCusto,
        };
    }, [movimentos, produtoSelecionado]);

    const resumo = useMemo(() => {
        if (!produtoSelecionado) return null;

        const estoqueAtual = saldosProduto.reduce(
            (total, saldo) => total + inteiro(saldo.quantidade),
            0
        );

        const custoMedio = calculo.custoMedio;
        const precoVenda = numero(produtoSelecionado.valor);

        return {
            estoqueAtual,
            custoMedio,
            precoVenda,
            valorEstoque: estoqueAtual * custoMedio,
            margemUnitaria: precoVenda - custoMedio,
            divergencia:
                estoqueAtual - calculo.quantidadeCalculada,
        };
    }, [produtoSelecionado, saldosProduto, calculo]);

    const ultimosPassos = useMemo(
        () => [...calculo.passos].reverse().slice(0, 12),
        [calculo.passos]
    );

    return (
        <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6">
            <div className="mx-auto max-w-5xl space-y-4">
                <header>
                    <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                        Consulta de produto
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Estoque, custo médio e preço de venda.
                    </p>
                </header>

                <div ref={caixaBuscaRef} className="relative z-20">
                    <div className="flex gap-2">
                        <input
                            type="search"
                            value={busca}
                            disabled={carregando}
                            onFocus={() => setListaAberta(true)}
                            onChange={(evento) => {
                                setBusca(evento.target.value);
                                setListaAberta(true);

                                if (produtoSelecionado) {
                                    setProdutoId(null);
                                    setMovimentos([]);
                                }
                            }}
                            placeholder={
                                carregando
                                    ? "Carregando produtos..."
                                    : "Digite o nome ou código de barras"
                            }
                            className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base shadow-sm outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-200"
                        />

                        {busca ? (
                            <button
                                type="button"
                                onClick={limpar}
                                className="h-14 rounded-2xl border border-slate-300 bg-white px-4 font-bold text-slate-600 shadow-sm hover:bg-slate-100"
                            >
                                Limpar
                            </button>
                        ) : null}
                    </div>

                    {listaAberta &&
                        busca.trim() &&
                        !produtoSelecionado ? (
                        <div className="absolute left-0 right-0 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                            {resultados.length === 0 ? (
                                <div className="p-4 text-sm text-slate-500">
                                    Nenhum produto encontrado.
                                </div>
                            ) : (
                                resultados.map((produto) => (
                                    <button
                                        key={produto.id}
                                        type="button"
                                        onClick={() =>
                                            selecionarProduto(produto)
                                        }
                                        className="flex w-full items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50"
                                    >
                                        <span>
                                            <span className="block font-bold">
                                                {produto.nome}
                                            </span>
                                            <span className="block text-xs text-slate-500">
                                                {produto.codigo_barras ||
                                                    "Sem código de barras"}
                                            </span>
                                        </span>
                                        <span className="font-bold">
                                            {moeda(numero(produto.valor))}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    ) : null}
                </div>

                {erro ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                        {erro}
                    </div>
                ) : null}

                {!produtoSelecionado ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
                        Selecione um produto para consultar.
                    </div>
                ) : (
                    <>
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center gap-4">
                                {produtoSelecionado.foto_url ? (
                                    <img
                                        src={produtoSelecionado.foto_url}
                                        alt={produtoSelecionado.nome}
                                        className="h-16 w-16 rounded-xl border border-slate-200 object-cover"
                                    />
                                ) : (
                                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-xl font-black text-slate-500">
                                        {produtoSelecionado.nome
                                            .trim()
                                            .charAt(0)
                                            .toUpperCase() || "P"}
                                    </div>
                                )}

                                <div>
                                    <h2 className="text-xl font-black">
                                        {produtoSelecionado.nome}
                                    </h2>
                                    <p className="text-sm text-slate-500">
                                        Código:{" "}
                                        {produtoSelecionado.codigo_barras ||
                                            "não informado"}
                                    </p>
                                </div>
                            </div>
                        </section>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Card
                                titulo="Estoque atual"
                                valor={formatarInteiro(
                                    resumo?.estoqueAtual || 0
                                )}
                                destaque
                            />
                            <Card
                                titulo="Custo médio"
                                valor={
                                    carregandoHistorico
                                        ? "..."
                                        : moeda(resumo?.custoMedio || 0)
                                }
                            />
                            <Card
                                titulo="Preço de venda"
                                valor={moeda(resumo?.precoVenda || 0)}
                            />
                            <Card
                                titulo="Valor em estoque"
                                valor={
                                    carregandoHistorico
                                        ? "..."
                                        : moeda(resumo?.valorEstoque || 0)
                                }
                            />
                        </div>

                        {resumo && resumo.divergencia !== 0 ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                O histórico reconstruiu{" "}
                                <b>
                                    {formatarInteiro(
                                        calculo.quantidadeCalculada
                                    )}
                                </b>{" "}
                                unidades, mas o saldo atual é{" "}
                                <b>
                                    {formatarInteiro(resumo.estoqueAtual)}
                                </b>
                                . Isso indica histórico incompleto ou ajuste
                                anterior ao período carregado.
                            </div>
                        ) : null}

                        {calculo.entradasSemCusto > 0 ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                {formatarInteiro(
                                    calculo.entradasSemCusto
                                )}{" "}
                                entrada(s) não tinham custo no histórico. O
                                preço de custo cadastrado foi usado como
                                fallback.
                            </div>
                        ) : null}

                        {calculo.faltasNoHistorico > 0 ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                Foram encontradas saídas sem saldo anterior
                                suficiente no histórico. O custo médio pode
                                estar parcial.
                            </div>
                        ) : null}

                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="border-b border-slate-100 p-4">
                                <h3 className="font-black">
                                    Estoque por depósito
                                </h3>
                            </div>

                            <div className="overflow-auto">
                                <table className="w-full min-w-[560px] text-sm">
                                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">
                                                Depósito
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                                Quantidade
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                                Mínimo
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                                Máximo
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                                Valor
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {saldosProduto.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={5}
                                                    className="px-4 py-6 text-center text-slate-500"
                                                >
                                                    Nenhum saldo encontrado.
                                                </td>
                                            </tr>
                                        ) : (
                                            saldosProduto.map((saldo) => (
                                                <tr
                                                    key={saldo.id}
                                                    className="border-t border-slate-100"
                                                >
                                                    <td className="px-4 py-3 font-bold">
                                                        {saldo.deposito_nome}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-black">
                                                        {formatarInteiro(
                                                            inteiro(saldo.quantidade)
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {formatarInteiro(
                                                            inteiro(saldo.minimo)
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {formatarInteiro(
                                                            inteiro(saldo.maximo)
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">
                                                        {moeda(
                                                            inteiro(saldo.quantidade) *
                                                            (resumo?.custoMedio || 0)
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="border-b border-slate-100 p-4">
                                <h3 className="font-black">
                                    Últimos cálculos do custo médio
                                </h3>
                                <p className="mt-1 text-xs text-slate-500">
                                    Entradas somam valor e quantidade. Saídas
                                    reduzem ambos pelo custo médio vigente.
                                </p>
                            </div>

                            <div className="overflow-auto">
                                <table className="w-full min-w-[720px] text-sm">
                                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">Data</th>
                                            <th className="px-4 py-3">Tipo</th>
                                            <th className="px-4 py-3 text-right">
                                                Movimento
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                                Q final
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                                V final
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                                Custo médio
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {carregandoHistorico ? (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="px-4 py-6 text-center text-slate-500"
                                                >
                                                    Carregando histórico...
                                                </td>
                                            </tr>
                                        ) : ultimosPassos.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="px-4 py-6 text-center text-slate-500"
                                                >
                                                    Nenhuma movimentação válida
                                                    encontrada.
                                                </td>
                                            </tr>
                                        ) : (
                                            ultimosPassos.map((passo) => (
                                                <tr
                                                    key={`${passo.tipo}-${passo.id}`}
                                                    className="border-t border-slate-100"
                                                >
                                                    <td className="px-4 py-3">
                                                        {formatarData(passo.data)}
                                                    </td>
                                                    <td className="px-4 py-3 font-bold">
                                                        {passo.tipo}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {passo.movimento > 0 ? "+" : ""}
                                                        {formatarInteiro(
                                                            passo.movimento
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {formatarInteiro(
                                                            passo.quantidadeFinal
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {moeda(passo.valorFinal)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-black">
                                                        {moeda(
                                                            passo.custoMedioFinal
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                            <b>Fórmula:</b> nova entrada = valor anterior +
                            quantidade comprada × custo novo. Depois, custo
                            médio = valor acumulado ÷ quantidade acumulada. Na
                            saída, o valor e a quantidade são reduzidos pelo
                            custo médio vigente.
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
