"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../api";
import { clampInt, roundCost } from "../formato";
import { ESTOQUE_COLUMN_ORDER, ESTOQUE_COLUMN_STORAGE_KEY, ESTOQUE_DEFAULT_COLUMN_WIDTHS, ESTOQUE_MIN_COLUMN_WIDTHS } from "./colunas";
import type { CustoMedioMovelProduto, CustosMediosMoveisResp, Deposito, EstoqueColumnKey, EstoquePageSize, ID, Opt, Produto, Saldo } from "../tipos";
import type { EstoqueDados } from "../useEstoqueDados";

// Lista de produtos: busca, filtros, colunas, paginação e totais.

export function useListaProdutos(n: EstoqueDados) {
    const { catById, categorias, classById, classificacoes, custosMediosMoveis, custosMediosMoveisRef, custosMediosVersion, depById, depositos, fabById, fabricantes, prodById, produtos, saldos, setCustosMediosErr, setCustosMediosLoading, setCustosMediosMoveis } = n;

    // ESTOQUE
    const [qEstoque, setQEstoque] = useState("");

    // ✅ multi-select: array vazio = "Todos"
    const [depFiltroEstoque, setDepFiltroEstoque] = useState<ID[]>([]);
    const [catFiltroEstoque, setCatFiltroEstoque] = useState<ID[]>([]);
    const [fabFiltroEstoque, setFabFiltroEstoque] = useState<ID[]>([]);
    const [classFiltroEstoque, setClassFiltroEstoque] = useState<ID[]>([]);

    const [onlyLow, setOnlyLow] = useState(false);

    // ✅ NOVO: ocultar itens zerados
    const [onlyPositive, setOnlyPositive] = useState(false);

    // Quando marcado, a listagem troca dos produtos ativos para os inativos.
    const [onlyInactive, setOnlyInactive] = useState(false);

    // Repaginada (07/10/2026): filtro "Sem saldo" e situação "Todos" (ativos e inativos).
    const [onlyZero, setOnlyZero] = useState(false);
    const [incluirInativos, setIncluirInativos] = useState(false);

    // Paginação da listagem de produtos.
    const [estoquePageSize, setEstoquePageSize] = useState<EstoquePageSize>(50);
    const [estoquePage, setEstoquePage] = useState(1);

    // ✅ NOVO: abre/fecha o filtro da aba Estoque
    const [estoqueFilterOpen, setEstoqueFilterOpen] = useState(false);
    const [estoqueFilterSectionOpen, setEstoqueFilterSectionOpen] = useState<
        "DEPOSITOS" | "CATEGORIAS" | "FABRICANTES" | "CLASSIFICACOES" | null
    >(null);

    useEffect(() => {
        if (!estoqueFilterOpen) {
            setEstoqueFilterSectionOpen(null);
        }
    }, [estoqueFilterOpen]);

    const [estoqueColumnWidths, setEstoqueColumnWidths] = useState<
        Record<EstoqueColumnKey, number>
    >({ ...ESTOQUE_DEFAULT_COLUMN_WIDTHS });
    const [estoqueColumnWidthsLoaded, setEstoqueColumnWidthsLoaded] =
        useState(false);

    const estoqueResizeCleanupRef = useRef<(() => void) | null>(null);

    const estoqueTableWidth = useMemo(
        () =>
            ESTOQUE_COLUMN_ORDER.reduce(
                (total, key) => total + estoqueColumnWidths[key],
                0
            ),
        [estoqueColumnWidths]
    );

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(
                ESTOQUE_COLUMN_STORAGE_KEY
            );
            const saved = raw
                ? (JSON.parse(raw) as Partial<
                    Record<EstoqueColumnKey, number>
                >)
                : {};

            const normalized = ESTOQUE_COLUMN_ORDER.reduce((acc, key) => {
                const savedWidth = Number(saved[key]);
                acc[key] = Number.isFinite(savedWidth)
                    ? Math.max(
                        ESTOQUE_MIN_COLUMN_WIDTHS[key],
                        Math.round(savedWidth)
                    )
                    : ESTOQUE_DEFAULT_COLUMN_WIDTHS[key];
                return acc;
            }, {} as Record<EstoqueColumnKey, number>);

            setEstoqueColumnWidths(normalized);
        } catch {
            setEstoqueColumnWidths({ ...ESTOQUE_DEFAULT_COLUMN_WIDTHS });
        } finally {
            setEstoqueColumnWidthsLoaded(true);
        }
    }, []);

    useEffect(() => {
        if (!estoqueColumnWidthsLoaded) return;

        try {
            window.localStorage.setItem(
                ESTOQUE_COLUMN_STORAGE_KEY,
                JSON.stringify(estoqueColumnWidths)
            );
        } catch {
            // O navegador pode bloquear o armazenamento local.
        }
    }, [estoqueColumnWidths, estoqueColumnWidthsLoaded]);

    useEffect(() => {
        return () => estoqueResizeCleanupRef.current?.();
    }, []);

    function iniciarRedimensionamentoColunaEstoque(
        columnKey: EstoqueColumnKey,
        event: React.PointerEvent<HTMLSpanElement>
    ) {
        event.preventDefault();
        event.stopPropagation();

        estoqueResizeCleanupRef.current?.();

        const startX = event.clientX;
        const startWidth = estoqueColumnWidths[columnKey];
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onPointerMove = (moveEvent: PointerEvent) => {
            const delta = moveEvent.clientX - startX;
            const nextWidth = Math.max(
                ESTOQUE_MIN_COLUMN_WIDTHS[columnKey],
                Math.round(startWidth + delta)
            );

            setEstoqueColumnWidths((current) => ({
                ...current,
                [columnKey]: nextWidth,
            }));
        };

        const cleanup = () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", cleanup);
            window.removeEventListener("pointercancel", cleanup);
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            estoqueResizeCleanupRef.current = null;
        };

        estoqueResizeCleanupRef.current = cleanup;
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", cleanup, { once: true });
        window.addEventListener("pointercancel", cleanup, { once: true });
    }

    function restaurarLarguraColunaEstoque(columnKey: EstoqueColumnKey) {
        setEstoqueColumnWidths((current) => ({
            ...current,
            [columnKey]: ESTOQUE_DEFAULT_COLUMN_WIDTHS[columnKey],
        }));
    }


    // ✅ MOSTRA Min/Rep apenas se existir pelo menos 1 item (no(s) depósito(s) filtrado(s))
    // com minimo>0 OU maximo>0. Se todos forem 0, some as colunas.
    const showMinRepColumns = useMemo(() => {
        const depSet = depFiltroEstoque.length ? new Set(depFiltroEstoque.map(Number)) : null;

        for (const s of saldos) {
            if (depSet && !depSet.has(Number(s.deposito_id))) continue;

            const min = clampInt((s as any).minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);

            if (min > 0 || max > 0) return true;
        }
        return false;
    }, [saldos, depFiltroEstoque]);


    const estoqueRows = useMemo(() => {
        const qq = qEstoque.trim().toLowerCase();

        type EstoqueProdutoRow = {
            p: Produto;
            d: Deposito;
            qtd: number;
            s?: Saldo;
            min: number;
            max: number;
            rep: number;
            hasMinMax: boolean;
            depositoIds: ID[];
            depositoNomes: string[];
        };

        type EstoqueProdutoAcumulado = {
            p: Produto;
            primeiroDeposito: Deposito;
            primeiroSaldo?: Saldo;
            qtd: number;
            min: number;
            max: number;
            depositos: Map<ID, string>;
        };

        const depSet = depFiltroEstoque.length ? new Set(depFiltroEstoque.map(Number)) : null;
        const catSet = catFiltroEstoque.length ? new Set(catFiltroEstoque.map(Number)) : null;
        const fabSet = fabFiltroEstoque.length ? new Set(fabFiltroEstoque.map(Number)) : null;
        const clsSet = classFiltroEstoque.length ? new Set(classFiltroEstoque.map(Number)) : null;

        const agrupados = new Map<ID, EstoqueProdutoAcumulado>();

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            const produtoInativo = Number(p.ativo) !== 1;
            if (!incluirInativos && (onlyInactive ? !produtoInativo : produtoInativo)) continue;

            if (depSet && !depSet.has(Number(d.id))) continue;

            if (catSet) {
                const categoriaId = Number(p.categoria_id || 0);
                if (!catSet.has(categoriaId)) continue;
            }

            if (fabSet) {
                const fabricanteId = Number(p.fabricante_id || 0);
                if (!fabSet.has(fabricanteId)) continue;
            }

            if (clsSet) {
                const classificacaoId = Number(p.classificacao_id || 0);
                if (!clsSet.has(classificacaoId)) continue;
            }

            const atual = agrupados.get(p.id);
            const qtdSaldo = clampInt(s.quantidade);
            const minSaldo = clampInt(s.minimo ?? 0);
            const maxSaldo = clampInt(s.maximo ?? 0);

            if (atual) {
                atual.qtd += qtdSaldo;
                atual.min += minSaldo;
                atual.max += maxSaldo;
                atual.depositos.set(d.id, d.nome);
            } else {
                agrupados.set(p.id, {
                    p,
                    primeiroDeposito: d,
                    primeiroSaldo: s,
                    qtd: qtdSaldo,
                    min: minSaldo,
                    max: maxSaldo,
                    depositos: new Map<ID, string>([[d.id, d.nome]]),
                });
            }
        }

        // Também inclui produtos sem linha em est_saldo quando nenhum depósito específico foi filtrado.
        // Isso garante que a opção Produtos inativos mostre todos os cadastros inativos.
        if (!depSet) {
            for (const p of produtos) {
                const produtoInativo = Number(p.ativo) !== 1;
                if (!incluirInativos && (onlyInactive ? !produtoInativo : produtoInativo)) continue;
                if (agrupados.has(p.id)) continue;

                if (catSet && !catSet.has(Number(p.categoria_id || 0))) continue;
                if (fabSet && !fabSet.has(Number(p.fabricante_id || 0))) continue;
                if (clsSet && !clsSet.has(Number(p.classificacao_id || 0))) continue;

                agrupados.set(p.id, {
                    p,
                    primeiroDeposito: depositos[0] || { id: 0, nome: "" },
                    primeiroSaldo: undefined,
                    qtd: 0,
                    min: 0,
                    max: 0,
                    depositos: new Map<ID, string>(),
                });
            }
        }

        const rows: EstoqueProdutoRow[] = [];

        for (const grupo of agrupados.values()) {
            const { p, qtd, min, max } = grupo;
            const hasMinMax = min > 0 && max > 0;
            const rep = hasMinMax ? Math.max(0, max - qtd) : 0;

            // A regra de saldo positivo é aplicada depois da soma dos depósitos selecionados.
            if (onlyPositive && qtd <= 0) continue;
            if (onlyZero && qtd > 0) continue;

            // O alerta também considera o saldo e os limites consolidados dos depósitos selecionados.
            if (onlyLow && !(hasMinMax && qtd <= min)) continue;

            const depositoNomes = Array.from(grupo.depositos.values()).sort((a, b) =>
                a.localeCompare(b, "pt-BR")
            );
            const depositoIds = Array.from(grupo.depositos.keys());

            if (qq) {
                const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
                const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
                const cls = p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "";
                const blob = `${p.nome} ${p.codigo_barras} ${depositoNomes.join(" ")} ${cat} ${fab} ${cls}`.toLowerCase();
                if (!blob.includes(qq)) continue;
            }

            rows.push({
                p,
                // Mantido como referência para abrir o editor e para os relatórios existentes.
                // O nome consolidado representa todos os depósitos atualmente filtrados.
                d: {
                    id: grupo.primeiroDeposito.id,
                    nome: depositoNomes.join(", "),
                },
                qtd,
                s: grupo.primeiroSaldo,
                min,
                max,
                rep,
                hasMinMax,
                depositoIds,
                depositoNomes,
            });
        }

        rows.sort((a, b) =>
            a.p.nome.localeCompare(b.p.nome, "pt-BR") ||
            a.p.codigo_barras.localeCompare(b.p.codigo_barras, "pt-BR")
        );

        return rows;
    }, [
        saldos,
        produtos,
        depositos,
        prodById,
        depById,
        qEstoque,
        depFiltroEstoque,
        catFiltroEstoque,
        fabFiltroEstoque,
        classFiltroEstoque,
        onlyLow,
        onlyPositive,
        onlyInactive,
        onlyZero,
        incluirInativos,
        catById,
        fabById,
        classById,
    ]);

    const estoqueProdutoIds = useMemo(
        () => Array.from(new Set(estoqueRows.map((row) => Number(row.p.id)))).filter((id) => id > 0),
        [estoqueRows]
    );

    const estoqueProdutoIdsKey = useMemo(
        () => estoqueProdutoIds.join(","),
        [estoqueProdutoIds]
    );

    useEffect(() => {
        if (!estoqueProdutoIds.length) return;

        const faltantes = estoqueProdutoIds.filter(
            (id) => !Object.prototype.hasOwnProperty.call(custosMediosMoveisRef.current, id)
        );
        if (!faltantes.length) return;

        let cancelled = false;

        async function carregarCustosMediosMoveis() {
            setCustosMediosLoading(true);
            setCustosMediosErr("");

            try {
                const chunks: number[][] = [];
                for (let i = 0; i < faltantes.length; i += 180) {
                    chunks.push(faltantes.slice(i, i + 180));
                }

                const respostas = await Promise.all(
                    chunks.map((ids, index) =>
                        apiGet<CustosMediosMoveisResp>({
                            action: "custos_medios_produtos",
                            produto_ids: ids.join(","),
                            _ts: Date.now() + index,
                        })
                    )
                );

                const novos: Record<number, CustoMedioMovelProduto> = {};
                for (const resp of respostas) {
                    if (!resp.ok) {
                        throw new Error(resp.msg || "Falha ao carregar custos médios móveis.");
                    }

                    for (const row of resp.rows || []) {
                        const produtoId = Number(row.produto_id);
                        if (!produtoId) continue;
                        novos[produtoId] = row;
                    }
                }

                if (cancelled) return;

                custosMediosMoveisRef.current = {
                    ...custosMediosMoveisRef.current,
                    ...novos,
                };
                setCustosMediosMoveis({ ...custosMediosMoveisRef.current });
            } catch (e: any) {
                if (!cancelled) {
                    setCustosMediosErr(
                        e?.message || "Não foi possível carregar o custo médio móvel dos produtos."
                    );
                }
            } finally {
                if (!cancelled) setCustosMediosLoading(false);
            }
        }

        void carregarCustosMediosMoveis();

        return () => {
            cancelled = true;
        };
    }, [estoqueProdutoIdsKey, custosMediosVersion]);

    function custoMedioMovelProduto(produtoId: ID): number {
        const registro = custosMediosMoveis[Number(produtoId)];
        const valor = Number(registro?.custo_medio);
        return Number.isFinite(valor) ? Math.max(0, valor) : 0;
    }

    function custoTotalMovelProduto(produtoId: ID, quantidadeFiltrada: number): number {
        return roundCost(custoMedioMovelProduto(produtoId) * clampInt(quantidadeFiltrada));
    }

    const estoqueTotalPages = useMemo(() => {
        if (estoquePageSize === "ALL") return 1;
        return Math.max(1, Math.ceil(estoqueRows.length / estoquePageSize));
    }, [estoqueRows.length, estoquePageSize]);

    useEffect(() => {
        setEstoquePage(1);
    }, [
        qEstoque,
        depFiltroEstoque,
        catFiltroEstoque,
        fabFiltroEstoque,
        classFiltroEstoque,
        onlyLow,
        onlyPositive,
        onlyInactive,
        onlyZero,
        incluirInativos,
        estoquePageSize,
    ]);

    useEffect(() => {
        setEstoquePage((paginaAtual) =>
            Math.min(Math.max(1, paginaAtual), estoqueTotalPages)
        );
    }, [estoqueTotalPages]);

    const estoqueRowsPaginados = useMemo(() => {
        if (estoquePageSize === "ALL") return estoqueRows;

        const inicio = (estoquePage - 1) * estoquePageSize;
        return estoqueRows.slice(inicio, inicio + estoquePageSize);
    }, [estoqueRows, estoquePage, estoquePageSize]);

    const estoquePaginaInicio =
        estoqueRows.length === 0
            ? 0
            : estoquePageSize === "ALL"
                ? 1
                : (estoquePage - 1) * estoquePageSize + 1;

    const estoquePaginaFim =
        estoqueRows.length === 0
            ? 0
            : estoquePageSize === "ALL"
                ? estoqueRows.length
                : Math.min(estoqueRows.length, estoquePage * estoquePageSize);


    const estoqueFiltroOptions = useMemo(() => {
        type EstoqueFiltroOptionRow = {
            p: Produto;
            d: Deposito;
            qtd: number;
            min: number;
            max: number;
            hasMinMax: boolean;
        };

        const qq = qEstoque.trim().toLowerCase();
        const baseRows: EstoqueFiltroOptionRow[] = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            const produtoInativo = Number(p.ativo) !== 1;
            if (!incluirInativos && (onlyInactive ? !produtoInativo : produtoInativo)) continue;

            const qtd = clampInt(s.quantidade);
            if (onlyPositive && qtd <= 0) continue;
            if (onlyZero && qtd > 0) continue;

            const min = clampInt((s as any).minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);
            const hasMinMax = min > 0 && max > 0;

            if (onlyLow && !(hasMinMax && qtd <= min)) continue;

            if (qq) {
                const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
                const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
                const cls = p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "";
                const blob = `${p.nome} ${p.codigo_barras} ${d.nome} ${cat} ${fab} ${cls}`.toLowerCase();

                if (!blob.includes(qq)) continue;
            }

            baseRows.push({ p, d, qtd, min, max, hasMinMax });
        }

        const depSet = depFiltroEstoque.length ? new Set(depFiltroEstoque.map(Number)) : null;
        const catSet = catFiltroEstoque.length ? new Set(catFiltroEstoque.map(Number)) : null;
        const fabSet = fabFiltroEstoque.length ? new Set(fabFiltroEstoque.map(Number)) : null;
        const clsSet = classFiltroEstoque.length ? new Set(classFiltroEstoque.map(Number)) : null;

        const passaSelecoes = (
            r: EstoqueFiltroOptionRow,
            ignorar: "deposito" | "categoria" | "fabricante" | "classificacao"
        ) => {
            if (ignorar !== "deposito" && depSet && !depSet.has(Number(r.d.id))) return false;

            if (ignorar !== "categoria" && catSet) {
                const pid = Number(r.p.categoria_id || 0);
                if (!catSet.has(pid)) return false;
            }

            if (ignorar !== "fabricante" && fabSet) {
                const fid = Number(r.p.fabricante_id || 0);
                if (!fabSet.has(fid)) return false;
            }

            if (ignorar !== "classificacao" && clsSet) {
                const cid = Number(r.p.classificacao_id || 0);
                if (!clsSet.has(cid)) return false;
            }

            return true;
        };

        const uniqById = (items: Opt[]) => {
            const map = new Map<ID, Opt>();

            for (const item of items) {
                if (!item.id) continue;
                if (!map.has(item.id)) map.set(item.id, item);
            }

            return Array.from(map.values()).sort((a, b) =>
                a.nome.localeCompare(b.nome, "pt-BR")
            );
        };

        const toCategoria = (p: Produto): Opt | null => {
            const id = Number(p.categoria_id || 0);
            if (!id) return null;

            const nome = p.categoria_nome || catById.get(id)?.nome || "";
            if (!nome.trim()) return null;

            return { id, nome };
        };

        const toFabricante = (p: Produto): Opt | null => {
            const id = Number(p.fabricante_id || 0);
            if (!id) return null;

            const nome = p.fabricante_nome || fabById.get(id)?.nome || "";
            if (!nome.trim()) return null;

            return { id, nome };
        };

        const toClassificacao = (p: Produto): Opt | null => {
            const id = Number(p.classificacao_id || 0);
            if (!id) return null;

            const nome = p.classificacao_nome || classById.get(id)?.nome || "";
            if (!nome.trim()) return null;

            return { id, nome };
        };

        return {
            depositos: uniqById(
                baseRows
                    .filter((r) => passaSelecoes(r, "deposito"))
                    .map((r) => ({ id: r.d.id, nome: r.d.nome }))
            ),

            categorias: uniqById(
                baseRows
                    .filter((r) => passaSelecoes(r, "categoria"))
                    .map((r) => toCategoria(r.p))
                    .filter((x): x is Opt => !!x)
            ),

            fabricantes: uniqById(
                baseRows
                    .filter((r) => passaSelecoes(r, "fabricante"))
                    .map((r) => toFabricante(r.p))
                    .filter((x): x is Opt => !!x)
            ),

            classificacoes: uniqById(
                baseRows
                    .filter((r) => passaSelecoes(r, "classificacao"))
                    .map((r) => toClassificacao(r.p))
                    .filter((x): x is Opt => !!x)
            ),
        };
    }, [
        saldos,
        prodById,
        depById,
        qEstoque,
        onlyPositive,
        onlyLow,
        onlyInactive,
        onlyZero,
        incluirInativos,
        depFiltroEstoque,
        catFiltroEstoque,
        fabFiltroEstoque,
        classFiltroEstoque,
        catById,
        fabById,
        classById,
    ]);

    const estoqueResumo = useMemo(() => {
        let totalUnidades = 0;
        let totalValor = 0;
        let totalCusto = 0;

        const modelosSet = new Set<number>();

        for (const { p, qtd } of estoqueRows) {
            modelosSet.add(Number(p.id));

            const q = clampInt(qtd);
            totalUnidades += q;

            const valorVenda = Number(p.valor) || 0;
            const precoCusto = custoMedioMovelProduto(p.id);

            totalValor += q * valorVenda;
            totalCusto += q * precoCusto;
        }

        return {
            totalUnidades,
            totalValor,
            totalCusto,
            totalModelos: modelosSet.size,
        };
    }, [estoqueRows, custosMediosMoveis]);


    function getFiltroResumo() {
        const joinNames = (opts: Array<{ id: ID; nome: string }>, sel: ID[], allTxt: string) => {
            if (!sel.length) return allTxt;
            const m = new Map(opts.map((o) => [o.id, o.nome]));
            return sel.map((id) => m.get(id) || `#${id}`).join(", ");
        };

        return {
            busca: qEstoque.trim() || "—",
            deposito: joinNames(depositos, depFiltroEstoque, "Todos"),
            categoria: joinNames(categorias, catFiltroEstoque, "Todas"),
            fabricante: joinNames(fabricantes, fabFiltroEstoque, "Todos"),
            classificacao: joinNames(classificacoes, classFiltroEstoque, "Todas"),
            somenteAlerta: onlyLow ? "Sim" : "Não",
            somenteSaldoPositivo: onlyPositive ? "Sim" : "Não", // ✅ NOVO
        };
    }

    function limparFiltrosEstoque() {
        setQEstoque("");
        setDepFiltroEstoque([]);
        setCatFiltroEstoque([]);
        setFabFiltroEstoque([]);
        setClassFiltroEstoque([]);
        setOnlyLow(false);
        setOnlyPositive(false);
        setOnlyInactive(false);
        setOnlyZero(false);
        setIncluirInativos(false);
    }

    return {
        qEstoque,
        setQEstoque,
        depFiltroEstoque,
        setDepFiltroEstoque,
        catFiltroEstoque,
        setCatFiltroEstoque,
        fabFiltroEstoque,
        setFabFiltroEstoque,
        classFiltroEstoque,
        setClassFiltroEstoque,
        onlyLow,
        setOnlyLow,
        onlyPositive,
        setOnlyPositive,
        onlyInactive,
        setOnlyInactive,
        onlyZero,
        setOnlyZero,
        incluirInativos,
        setIncluirInativos,
        estoquePageSize,
        setEstoquePageSize,
        estoquePage,
        setEstoquePage,
        estoqueFilterOpen,
        setEstoqueFilterOpen,
        estoqueFilterSectionOpen,
        setEstoqueFilterSectionOpen,
        estoqueColumnWidths,
        setEstoqueColumnWidths,
        estoqueColumnWidthsLoaded,
        setEstoqueColumnWidthsLoaded,
        estoqueResizeCleanupRef,
        estoqueTableWidth,
        iniciarRedimensionamentoColunaEstoque,
        restaurarLarguraColunaEstoque,
        showMinRepColumns,
        estoqueRows,
        estoqueProdutoIds,
        estoqueProdutoIdsKey,
        custoMedioMovelProduto,
        custoTotalMovelProduto,
        estoqueTotalPages,
        estoqueRowsPaginados,
        estoquePaginaInicio,
        estoquePaginaFim,
        estoqueFiltroOptions,
        estoqueResumo,
        getFiltroResumo,
        limparFiltrosEstoque,
    };
}

export type ListaProdutos = ReturnType<typeof useListaProdutos>;
