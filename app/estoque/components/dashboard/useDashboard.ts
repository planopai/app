"use client";

import { useMemo, useState } from "react";
import { apiGet } from "../api";
import { dashboardMonthStartValue, dashboardTodayValue, historicoTimestamp, produtoCategoriaOption, produtoClassificacaoOption, produtoFabricanteOption, uniqOptions } from "../formato";
import type { DashboardMovimentoTipo, DashboardProdutoRow, HistoricoResp, HistoricoRow, ID } from "../tipos";
import type { EstoqueDados } from "../useEstoqueDados";

// Dashboard de movimentações (vai para o módulo Gestão).

export function useDashboard(n: EstoqueDados) {
    const { catById, classById, depositos, fabById, prodById, produtos } = n;

    // DASHBOARD DE MOVIMENTAÇÕES
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [dashboardErr, setDashboardErr] = useState("");
    const [dashboardMovimentos, setDashboardMovimentos] = useState<HistoricoRow[]>([]);

    const [dashboardTipo, setDashboardTipo] =
        useState<DashboardMovimentoTipo>("TODOS");
    const [dashboardDe, setDashboardDe] = useState(dashboardMonthStartValue);
    const [dashboardAte, setDashboardAte] = useState(dashboardTodayValue);
    const [dashboardQ, setDashboardQ] = useState("");
    const [dashboardDepositos, setDashboardDepositos] = useState<ID[]>([]);
    const [dashboardCategorias, setDashboardCategorias] = useState<ID[]>([]);
    const [dashboardFabricantes, setDashboardFabricantes] = useState<ID[]>([]);
    const [dashboardClassificacoes, setDashboardClassificacoes] = useState<ID[]>([]);
    const [dashboardTop, setDashboardTop] = useState(10);

    const [dashboardFilterOpen, setDashboardFilterOpen] = useState(false);
    const [dashboardFilterSectionOpen, setDashboardFilterSectionOpen] =
        useState<
            | "DEPOSITOS"
            | "CATEGORIAS"
            | "FABRICANTES"
            | "CLASSIFICACOES"
            | null
        >(null);


    async function loadDashboardMovimentos() {
        setDashboardLoading(true);
        setDashboardErr("");

        try {
            // Carrega separadamente para que ENTRADAS/AJUSTES não consumam
            // o limite de registros usado pelo Dashboard.
            const [saidaResp, transferenciaResp] = await Promise.all([
                apiGet<HistoricoResp>({
                    historico: 1,
                    limit: 500,
                    tipo: "SAIDA",
                }),
                apiGet<HistoricoResp>({
                    historico: 1,
                    limit: 500,
                    tipo: "TRANSFERENCIA",
                }),
            ]);

            if (!saidaResp.ok) {
                throw new Error(
                    saidaResp.msg || "Falha ao carregar as saídas do Dashboard."
                );
            }

            if (!transferenciaResp.ok) {
                throw new Error(
                    transferenciaResp.msg ||
                    "Falha ao carregar as transferências do Dashboard."
                );
            }

            const rows = [
                ...(saidaResp.rows || []),
                ...(transferenciaResp.rows || []),
            ].sort(
                (a, b) =>
                    historicoTimestamp(b.criado_em) -
                    historicoTimestamp(a.criado_em)
            );

            setDashboardMovimentos(rows);
        } catch (e: any) {
            setDashboardErr(
                e?.message || "Erro ao carregar os dados do Dashboard."
            );
            setDashboardMovimentos([]);
        } finally {
            setDashboardLoading(false);
        }
    }

    const dashboardFiltroOptions = useMemo(() => {
        return {
            depositos: depositos
                .map((d) => ({ id: Number(d.id), nome: d.nome }))
                .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),

            categorias: uniqOptions(
                produtos.map((p) => produtoCategoriaOption(p, catById))
            ),

            fabricantes: uniqOptions(
                produtos.map((p) => produtoFabricanteOption(p, fabById))
            ),

            classificacoes: uniqOptions(
                produtos.map((p) =>
                    produtoClassificacaoOption(p, classById)
                )
            ),
        };
    }, [depositos, produtos, catById, fabById, classById]);

    const dashboardMovimentosFiltrados = useMemo(() => {
        const q = dashboardQ.trim().toLocaleLowerCase("pt-BR");

        const depSet = dashboardDepositos.length
            ? new Set(dashboardDepositos.map(Number))
            : null;
        const catSet = dashboardCategorias.length
            ? new Set(dashboardCategorias.map(Number))
            : null;
        const fabSet = dashboardFabricantes.length
            ? new Set(dashboardFabricantes.map(Number))
            : null;
        const classSet = dashboardClassificacoes.length
            ? new Set(dashboardClassificacoes.map(Number))
            : null;

        const inicio = dashboardDe
            ? new Date(`${dashboardDe}T00:00:00`).getTime()
            : null;
        const fim = dashboardAte
            ? new Date(`${dashboardAte}T23:59:59.999`).getTime()
            : null;

        return dashboardMovimentos.filter((mov) => {
            if (
                dashboardTipo !== "TODOS" &&
                mov.tipo !== dashboardTipo
            ) {
                return false;
            }

            const time = historicoTimestamp(mov.criado_em);

            if (
                inicio !== null &&
                Number.isFinite(time) &&
                time < inicio
            ) {
                return false;
            }

            if (
                fim !== null &&
                Number.isFinite(time) &&
                time > fim
            ) {
                return false;
            }

            const produto = prodById.get(Number(mov.produto_id));

            // Para o Dashboard "saídas", o depósito representa a origem
            // física da mercadoria, inclusive nas transferências.
            if (
                depSet &&
                !depSet.has(Number(mov.deposito_origem_id || 0))
            ) {
                return false;
            }

            if (catSet) {
                const categoriaId = Number(produto?.categoria_id || 0);
                if (!catSet.has(categoriaId)) return false;
            }

            if (fabSet) {
                const fabricanteId = Number(produto?.fabricante_id || 0);
                if (!fabSet.has(fabricanteId)) return false;
            }

            if (classSet) {
                const classificacaoId = Number(
                    produto?.classificacao_id || 0
                );
                if (!classSet.has(classificacaoId)) return false;
            }

            if (q) {
                const categoria =
                    produto?.categoria_nome ||
                    (produto?.categoria_id
                        ? catById.get(Number(produto.categoria_id))?.nome
                        : "") ||
                    "";

                const fabricante =
                    produto?.fabricante_nome ||
                    (produto?.fabricante_id
                        ? fabById.get(Number(produto.fabricante_id))?.nome
                        : "") ||
                    "";

                const classificacao =
                    produto?.classificacao_nome ||
                    (produto?.classificacao_id
                        ? classById.get(Number(produto.classificacao_id))
                            ?.nome
                        : "") ||
                    "";

                const blob = [
                    mov.produto_nome,
                    produto?.nome,
                    mov.codigo_barras_snapshot,
                    categoria,
                    fabricante,
                    classificacao,
                    mov.deposito_origem_nome,
                    mov.deposito_destino_nome,
                    mov.destino_texto,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLocaleLowerCase("pt-BR");

                if (!blob.includes(q)) return false;
            }

            return true;
        });
    }, [
        dashboardMovimentos,
        dashboardTipo,
        dashboardQ,
        dashboardDepositos,
        dashboardCategorias,
        dashboardFabricantes,
        dashboardClassificacoes,
        dashboardDe,
        dashboardAte,
        prodById,
        catById,
        fabById,
        classById,
    ]);

    const dashboardRanking = useMemo<DashboardProdutoRow[]>(() => {
        const map = new Map<ID, DashboardProdutoRow>();

        for (const mov of dashboardMovimentosFiltrados) {
            const produtoId = Number(mov.produto_id || 0);
            if (!produtoId) continue;

            const produto = prodById.get(produtoId);
            const quantidade = Math.max(
                0,
                Number(mov.quantidade || 0)
            );

            if (quantidade <= 0) continue;

            const categoriaNome =
                produto?.categoria_nome ||
                (produto?.categoria_id
                    ? catById.get(Number(produto.categoria_id))?.nome
                    : "") ||
                "Sem categoria";

            const fabricanteNome =
                produto?.fabricante_nome ||
                (produto?.fabricante_id
                    ? fabById.get(Number(produto.fabricante_id))?.nome
                    : "") ||
                "Sem fabricante";

            const classificacaoNome =
                produto?.classificacao_nome ||
                (produto?.classificacao_id
                    ? classById.get(Number(produto.classificacao_id))?.nome
                    : "") ||
                "Sem classificação";

            const atual =
                map.get(produtoId) ||
                {
                    produto_id: produtoId,
                    produto_nome:
                        mov.produto_nome ||
                        produto?.nome ||
                        `Produto ${produtoId}`,
                    codigo_barras:
                        mov.codigo_barras_snapshot ||
                        produto?.codigo_barras ||
                        "",
                    categoria_nome: categoriaNome,
                    fabricante_nome: fabricanteNome,
                    classificacao_nome: classificacaoNome,
                    saida: 0,
                    transferencia: 0,
                    total: 0,
                    movimentos: 0,
                };

            if (mov.tipo === "SAIDA") {
                atual.saida += quantidade;
            }

            if (mov.tipo === "TRANSFERENCIA") {
                atual.transferencia += quantidade;
            }

            atual.total = atual.saida + atual.transferencia;
            atual.movimentos += 1;

            map.set(produtoId, atual);
        }

        return Array.from(map.values()).sort(
            (a, b) =>
                b.total - a.total ||
                b.saida - a.saida ||
                a.produto_nome.localeCompare(b.produto_nome, "pt-BR")
        );
    }, [
        dashboardMovimentosFiltrados,
        prodById,
        catById,
        fabById,
        classById,
    ]);

    const dashboardTopRows = useMemo(
        () => dashboardRanking.slice(0, dashboardTop),
        [dashboardRanking, dashboardTop]
    );

    const dashboardResumo = useMemo(() => {
        const saida = dashboardRanking.reduce(
            (acc, row) => acc + row.saida,
            0
        );
        const transferencia = dashboardRanking.reduce(
            (acc, row) => acc + row.transferencia,
            0
        );

        return {
            produtos: dashboardRanking.length,
            movimentos: dashboardMovimentosFiltrados.length,
            saida,
            transferencia,
            total: saida + transferencia,
        };
    }, [dashboardRanking, dashboardMovimentosFiltrados.length]);

    const dashboardMaxBar = useMemo(() => {
        return Math.max(
            1,
            ...dashboardTopRows.flatMap((row) => [
                row.saida,
                row.transferencia,
            ])
        );
    }, [dashboardTopRows]);


    const dashboardFiltrosAtivos = useMemo(() => {
        let total = 0;

        if (dashboardQ.trim()) total += 1;
        if (dashboardTipo !== "TODOS") total += 1;
        if (dashboardDepositos.length) total += dashboardDepositos.length;
        if (dashboardCategorias.length) total += dashboardCategorias.length;
        if (dashboardFabricantes.length) total += dashboardFabricantes.length;
        if (dashboardClassificacoes.length) total += dashboardClassificacoes.length;

        if (dashboardDe !== dashboardMonthStartValue()) total += 1;
        if (dashboardAte !== dashboardTodayValue()) total += 1;

        return total;
    }, [
        dashboardQ,
        dashboardTipo,
        dashboardDepositos,
        dashboardCategorias,
        dashboardFabricantes,
        dashboardClassificacoes,
        dashboardDe,
        dashboardAte,
    ]);

    const dashboardPeriodoLabel = useMemo(() => {
        const format = (value: string) => {
            if (!value) return "";
            const [y, m, d] = value.split("-");
            if (!y || !m || !d) return value;
            return `${d}/${m}/${y}`;
        };

        if (dashboardDe && dashboardAte) {
            return `${format(dashboardDe)} até ${format(dashboardAte)}`;
        }

        if (dashboardDe) return `Desde ${format(dashboardDe)}`;
        if (dashboardAte) return `Até ${format(dashboardAte)}`;
        return "Todo o período";
    }, [dashboardDe, dashboardAte]);

    function dashboardBarWidth(value: number) {
        if (value <= 0) return 0;
        return Math.max(
            2,
            Math.min(100, (value / dashboardMaxBar) * 100)
        );
    }

    function limparFiltrosDashboard() {
        setDashboardTipo("TODOS");
        setDashboardDe(dashboardMonthStartValue());
        setDashboardAte(dashboardTodayValue());
        setDashboardQ("");
        setDashboardDepositos([]);
        setDashboardCategorias([]);
        setDashboardFabricantes([]);
        setDashboardClassificacoes([]);
        setDashboardTop(10);
        setDashboardFilterSectionOpen(null);
    }

    return {
        dashboardLoading,
        setDashboardLoading,
        dashboardErr,
        setDashboardErr,
        dashboardMovimentos,
        setDashboardMovimentos,
        dashboardTipo,
        setDashboardTipo,
        dashboardDe,
        setDashboardDe,
        dashboardAte,
        setDashboardAte,
        dashboardQ,
        setDashboardQ,
        dashboardDepositos,
        setDashboardDepositos,
        dashboardCategorias,
        setDashboardCategorias,
        dashboardFabricantes,
        setDashboardFabricantes,
        dashboardClassificacoes,
        setDashboardClassificacoes,
        dashboardTop,
        setDashboardTop,
        dashboardFilterOpen,
        setDashboardFilterOpen,
        dashboardFilterSectionOpen,
        setDashboardFilterSectionOpen,
        loadDashboardMovimentos,
        dashboardFiltroOptions,
        dashboardMovimentosFiltrados,
        dashboardRanking,
        dashboardTopRows,
        dashboardResumo,
        dashboardMaxBar,
        dashboardFiltrosAtivos,
        dashboardPeriodoLabel,
        dashboardBarWidth,
        limparFiltrosDashboard,
    };
}

export type Dashboard = ReturnType<typeof useDashboard>;
