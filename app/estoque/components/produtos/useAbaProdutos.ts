"use client";

import { useMemo, useState } from "react";
import { clampInt, moneyBRL } from "../formato";
import { getProdutoFotos, resolveProdutoFotoUrl } from "../fotos";
import { normalizar } from "../ui/BuscaLista";
import type { EstoquePageSize, ID } from "../tipos";
import type { EstoqueDados } from "../useEstoqueDados";
import type { ListaProdutos } from "./useListaProdutos";

// Aba Produtos (repaginada): busca, filtros com chips, lista e totais.
// O motor da lista (filtros, custo médio, paginação) continua no useListaProdutos.

export const brl = (v: number) => moneyBRL(Number.isFinite(v) ? v : 0);

type SaldoFiltro = "todos" | "com" | "sem";
type SituacaoFiltro = "ativos" | "inativos" | "todos";

export function useAbaProdutos(n: EstoqueDados, prod: ListaProdutos, abrirProduto: (id: ID) => void) {
    const { depositos, categorias, fabricantes, classificacoes, catById, fabById, classById, alertRows } = n;
    const {
        qEstoque, setQEstoque, depFiltroEstoque, setDepFiltroEstoque, catFiltroEstoque, setCatFiltroEstoque,
        fabFiltroEstoque, setFabFiltroEstoque, classFiltroEstoque, setClassFiltroEstoque, onlyLow, setOnlyLow,
        onlyPositive, setOnlyPositive, onlyZero, setOnlyZero, onlyInactive, setOnlyInactive, incluirInativos, setIncluirInativos,
        estoqueRows, estoqueRowsPaginados, estoqueResumo, custoMedioMovelProduto, estoquePageSize, setEstoquePageSize,
        estoquePage, setEstoquePage, estoqueTotalPages, limparFiltrosEstoque,
    } = prod;

    const [filtOpen, setFiltOpen] = useState(false);
    const [expOpen, setExpOpen] = useState(false);
    const [secaoAberta, setSecaoAberta] = useState<"" | "dep" | "cat" | "fab" | "cls">("");
    const [buscaFiltro, setBuscaFiltro] = useState<Record<string, string>>({});

    const saldoFiltro: SaldoFiltro = onlyPositive ? "com" : onlyZero ? "sem" : "todos";
    const situacao: SituacaoFiltro = incluirInativos ? "todos" : onlyInactive ? "inativos" : "ativos";

    // Produtos com algum depósito no mínimo (regra do sistema: mínimo e máximo definidos e saldo ≤ mínimo).
    const produtosAlerta = useMemo(() => new Set(alertRows.map((r) => Number(r.p.id))), [alertRows]);

    const listas = {
        dep: depositos.map((d) => ({ id: d.id, nome: d.nome })),
        cat: categorias.map((c) => ({ id: c.id, nome: c.nome })),
        fab: fabricantes.map((f) => ({ id: f.id, nome: f.nome })),
        cls: classificacoes.map((c) => ({ id: c.id, nome: c.nome })),
    };
    const sel = { dep: depFiltroEstoque, cat: catFiltroEstoque, fab: fabFiltroEstoque, cls: classFiltroEstoque };
    const setSel = { dep: setDepFiltroEstoque, cat: setCatFiltroEstoque, fab: setFabFiltroEstoque, cls: setClassFiltroEstoque };
    type Grupo = keyof typeof sel;

    const alternar = (g: Grupo, id: ID) => () => {
        const atual = sel[g].map(Number);
        setSel[g](atual.includes(Number(id)) ? atual.filter((x) => x !== Number(id)) : [...atual, Number(id)]);
    };
    const nomesSel = (g: Grupo) => listas[g].filter((o) => sel[g].map(Number).includes(Number(o.id))).map((o) => o.nome);
    const resumoSel = (arr: string[], vazio: string) =>
        !arr.length ? vazio : arr.length <= 2 ? arr.join(", ") : `${arr.slice(0, 2).join(", ")} e mais ${arr.length - 2}`;

    const acordeao = (g: Grupo, tit: string, vazio: string) => {
        const nomes = nomesSel(g);
        const ab = secaoAberta === g;
        return { tit, res: resumoSel(nomes, vazio), n: nomes.length ? String(nomes.length) : "", temN: nomes.length > 0, ab, exp: ab, go: () => setSecaoAberta(ab ? "" : g) };
    };
    const marcas = (g: Grupo) => {
        const termo = normalizar(buscaFiltro[g] || "").trim();
        return listas[g]
            .filter((o) => !termo || normalizar(o.nome).includes(termo))
            .map((o) => ({ l: o.nome, on: sel[g].map(Number).includes(Number(o.id)), go: alternar(g, o.id) }));
    };

    const setSaldo = (v: SaldoFiltro) => () => {
        setOnlyPositive(v === "com");
        setOnlyZero(v === "sem");
    };
    const setSituacao = (v: SituacaoFiltro) => () => {
        setIncluirInativos(v === "todos");
        setOnlyInactive(v === "inativos");
    };

    const chips: Array<{ l: string; x: () => void }> = [];
    if (qEstoque.trim()) chips.push({ l: `Busca: ${qEstoque.trim()}`, x: () => setQEstoque("") });
    (["dep", "cat", "fab", "cls"] as Grupo[]).forEach((g) => {
        const rot = { dep: "Depósito", cat: "Categoria", fab: "Fabricante", cls: "Classificação" }[g];
        listas[g]
            .filter((o) => sel[g].map(Number).includes(Number(o.id)))
            .forEach((o) => chips.push({ l: `${rot}: ${o.nome}`, x: alternar(g, o.id) }));
    });
    if (saldoFiltro !== "todos") chips.push({ l: saldoFiltro === "com" ? "Com saldo" : "Sem saldo", x: setSaldo("todos") });
    if (situacao !== "ativos") chips.push({ l: situacao === "inativos" ? "Só inativos" : "Ativos e inativos", x: setSituacao("ativos") });
    if (onlyLow) chips.push({ l: "Abaixo do mínimo", x: () => setOnlyLow(false) });

    const nFiltros =
        depFiltroEstoque.length + catFiltroEstoque.length + fabFiltroEstoque.length + classFiltroEstoque.length +
        (saldoFiltro !== "todos" ? 1 : 0) + (situacao !== "ativos" ? 1 : 0) + (onlyLow ? 1 : 0);

    const umDep = depFiltroEstoque.length === 1 ? depositos.find((d) => Number(d.id) === Number(depFiltroEstoque[0]))?.nome || "" : "";

    const prodRows = estoqueRowsPaginados.map((r) => {
        const p = r.p;
        const custo = custoMedioMovelProduto(p.id);
        const venda = Number(p.valor) || 0;
        const alerta = produtosAlerta.has(Number(p.id));
        const foto = resolveProdutoFotoUrl(getProdutoFotos(p)[0]) || null;
        return {
            id: p.id,
            n: p.nome,
            cb: p.codigo_barras,
            foto,
            fab: p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "—",
            cat: p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "—",
            cls: p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "—",
            q: String(r.qtd),
            custo: brl(custo),
            venda: venda ? brl(venda) : "—",
            tot: brl(custo * clampInt(r.qtd)),
            alerta,
            mn: r.min ? String(r.min) : "—",
            rep: r.hasMinMax && r.rep > 0 ? String(r.rep) : "—",
            open: () => abrirProduto(p.id),
        };
    });

    const limparTudo = () => limparFiltrosEstoque();

    const verAlertas = () => {
        limparFiltrosEstoque();
        setOnlyLow(true);
    };

    const tamanhos: Array<[EstoquePageSize, string]> = [[50, "50"], [100, "100"], [500, "500"], ["ALL", "Tudo"]];

    return {
        busca: qEstoque,
        onBusca: (e: React.ChangeEvent<HTMLInputElement>) => setQEstoque(e.target.value),
        chips,
        temChips: chips.length > 0,
        nFiltros: String(nFiltros),
        temFiltros: nFiltros > 0,
        limparTudo,
        filtOpen,
        abrirFiltros: () => setFiltOpen(true),
        fecharFiltros: () => {
            setFiltOpen(false);
            setSecaoAberta("");
        },
        limparFiltros: () => {
            const q = qEstoque;
            limparFiltrosEstoque();
            setQEstoque(q);
        },
        aDep: acordeao("dep", "Depósitos", "Todos"),
        aCat: acordeao("cat", "Categorias", "Todas"),
        aFab: acordeao("fab", "Fabricantes", "Todos"),
        aCls: acordeao("cls", "Classificações", "Todas"),
        buscaFiltro,
        onBuscaFiltro: (g: string) => (e: React.ChangeEvent<HTMLInputElement>) => setBuscaFiltro((b) => ({ ...b, [g]: e.target.value })),
        fDep: marcas("dep"),
        fCat: marcas("cat"),
        fFab: marcas("fab"),
        fCls: marcas("cls"),
        fSaldo: ([["todos", "Todos"], ["com", "Com saldo"], ["sem", "Sem saldo"]] as Array<[SaldoFiltro, string]>).map(([k, l]) => ({ l, on: saldoFiltro === k, go: setSaldo(k) })),
        fSit: ([["ativos", "Ativos"], ["inativos", "Inativos"], ["todos", "Todos"]] as Array<[SituacaoFiltro, string]>).map(([k, l]) => ({ l, on: situacao === k, go: setSituacao(k) })),
        fRepor: onlyLow,
        togRepor: () => setOnlyLow(!onlyLow),
        umDep: !!umDep,
        nomeUmDep: umDep,
        variosDep: !umDep,
        prodRows,
        vazioProd: prodRows.length === 0,
        resumoProd: `${estoqueResumo.totalModelos} produtos · ${estoqueResumo.totalUnidades} unidades · ${brl(estoqueResumo.totalCusto)} a custo`,
        totalLinhas: estoqueRows.length,
        expOpen,
        toggleExp: () => setExpOpen((v) => !v),
        fecharExp: () => setExpOpen(false),
        alertas: String(produtosAlerta.size),
        verAlertas,
        tamanhos: tamanhos.map(([k, l]) => ({ k: String(k), l })),
        tamanhoPagina: String(estoquePageSize),
        onTamanhoPagina: (e: React.ChangeEvent<HTMLSelectElement>) =>
            setEstoquePageSize((e.target.value === "ALL" ? "ALL" : Number(e.target.value)) as EstoquePageSize),
        pagina: estoquePage,
        paginas: estoqueTotalPages,
        paginaAnterior: () => setEstoquePage(Math.max(1, estoquePage - 1)),
        paginaSeguinte: () => setEstoquePage(Math.min(estoqueTotalPages, estoquePage + 1)),
    };
}

export type AbaProdutosV = ReturnType<typeof useAbaProdutos>;
