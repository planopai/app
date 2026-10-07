"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api";
import { clampInt, createOperationUuid, maskBRLFromDigits, parseBRLToNumber } from "../formato";
import { getProdutoFotos } from "../fotos";
import type { CustoAjusteTipo, CustoProdutoDetalheResp, HistoricoRow, ID, ProdutoEditTab, ProdutoFoto } from "../tipos";
import type { EstoqueDados } from "../useEstoqueDados";
import type { Cadastros } from "../cadastros/useCadastros";

// Janela do produto: dados, fotos, saldo por depósito, mínimo/máximo, valor e preço de custo.

export function useEditarProduto(n: EstoqueDados, cad: Cadastros, avisar: (msg: string) => void = (m) => window.alert(m)) {
    const { depositos, prodById, refreshInit, saldosMap } = n;
    const { fileToDataUrl } = cad;

    // modal editar produto
    const [prodEditOpen, setProdEditOpen] = useState(false);
    const [prodEditId, setProdEditId] = useState<ID | 0>(0);
    const [prodEditTab, setProdEditTab] = useState<ProdutoEditTab>("DADOS");
    const [prodBusy, setProdBusy] = useState(false);
    const [minMaxBusy, setMinMaxBusy] = useState(false);
    const [prodEntradasCusto, setProdEntradasCusto] = useState<HistoricoRow[]>([]);
    const [prodEntradasCustoLoading, setProdEntradasCustoLoading] = useState(false);
    const [prodEntradasCustoErr, setProdEntradasCustoErr] = useState("");

    const [prodCustoDetalhe, setProdCustoDetalhe] = useState<CustoProdutoDetalheResp | null>(null);
    const [custoAjusteOpen, setCustoAjusteOpen] = useState(false);
    const [custoAjusteConfirmOpen, setCustoAjusteConfirmOpen] = useState(false);
    const [custoAjusteTipo, setCustoAjusteTipo] = useState<CustoAjusteTipo>("NOVO_PRECO");
    const [custoAjusteLoteId, setCustoAjusteLoteId] = useState<ID>(0);
    const [custoAjusteNovo, setCustoAjusteNovo] = useState<string>("R$ 0,00");
    const [custoAjusteFreteTotal, setCustoAjusteFreteTotal] = useState<string>("R$ 0,00");
    const [custoAjusteObservacao, setCustoAjusteObservacao] = useState("");
    const [custoAjusteBusy, setCustoAjusteBusy] = useState(false);

    // campos do cadastro
    const [editNome, setEditNome] = useState("");
    const [editDescricao, setEditDescricao] = useState<string>(""); // ✅ NOVO
    const [editValor, setEditValor] = useState<string>("R$ 0,00");
    const [editPrecoCusto, setEditPrecoCusto] = useState<string>("R$ 0,00");
    const [editMin, setEditMin] = useState<number>(0);
    const [editMax, setEditMax] = useState<number>(0); // (produto / padrão)

    // ✅ NOVO: min/max por depósito (est_saldo)
    const [editMinMaxDepId, setEditMinMaxDepId] = useState<ID>(0);
    const [editMinDep, setEditMinDep] = useState<number>(0);
    const [editMaxDep, setEditMaxDep] = useState<number>(0);
    const [editCatId, setEditCatId] = useState<ID>(0);
    const [editFabId, setEditFabId] = useState<ID>(0);
    const [editClassId, setEditClassId] = useState<ID>(0);
    const [editAtivo, setEditAtivo] = useState<0 | 1>(1);
    const [editConfeccionado, setEditConfeccionado] = useState<0 | 1>(0);
    const [produtoDepositoBusy, setProdutoDepositoBusy] = useState(false);
    const [editNovoDepositoId, setEditNovoDepositoId] = useState<ID>(0);

    // galeria de fotos do produto
    const [editFotosExistentes, setEditFotosExistentes] = useState<ProdutoFoto[]>([]);
    const [editFotosNovas, setEditFotosNovas] = useState<Array<{
        temp_id: string;
        foto_url: string;
        legenda: string;
        is_principal: 0 | 1;
        ordem: number;
    }>>([]);
    const [editFotoNova, setEditFotoNova] = useState<string>("");

    useEffect(() => {
        if (!prodEditId || !editMinMaxDepId) return;

        const s = saldosMap.get(`${prodEditId}::${editMinMaxDepId}`);
        setEditMinDep(clampInt(s?.minimo ?? 0));
        setEditMaxDep(clampInt(s?.maximo ?? 0));
    }, [prodEditId, editMinMaxDepId, saldosMap]);

    // ======= PRODUTO EDITOR =======

    async function carregarEntradasCustoProduto(produtoId: ID, _codigoBarras = "") {
        setProdEntradasCustoLoading(true);
        setProdEntradasCustoErr("");
        setProdEntradasCusto([]);
        setProdCustoDetalhe(null);

        try {
            const resp = await apiGet<CustoProdutoDetalheResp>({
                action: "custo_produto_detalhe",
                produto_id: produtoId,
                _ts: Date.now(),
            });

            if (!resp.ok) {
                throw new Error(resp.msg || "Falha ao carregar os custos do produto.");
            }

            const entradas = (resp.entradas || []).sort(
                (a, b) =>
                    new Date(b.criado_em).getTime() -
                    new Date(a.criado_em).getTime()
            );

            setProdCustoDetalhe(resp);
            setProdEntradasCusto(entradas);

            // O indicador "Preço de custo atual" deve refletir o custo médio móvel
            // retornado no resumo do produto, e não apenas o custo da última entrada.
            const precoCustoAtual = Number(resp.resumo?.custo_medio ?? 0) || 0;
            setEditPrecoCusto(
                maskBRLFromDigits(
                    String(Math.round(Math.max(0, precoCustoAtual) * 100))
                )
            );
        } catch (e: any) {
            setProdEntradasCustoErr(
                e?.message || "Erro ao carregar os custos do produto."
            );
        } finally {
            setProdEntradasCustoLoading(false);
        }
    }

    function calcularResumoAjusteCusto() {
        const produto = prodEditId ? prodById.get(prodEditId) : null;
        const lotesDisponiveis = (prodCustoDetalhe?.lotes || []).filter(
            (lote) => clampInt(lote.quantidade_atual) > 0
        );
        const lote = lotesDisponiveis.find(
            (item) => Number(item.id) === Number(custoAjusteLoteId)
        );

        const custoBase = parseBRLToNumber(custoAjusteNovo);
        const freteTotal = parseBRLToNumber(custoAjusteFreteTotal);
        const quantidadeRateio = custoAjusteTipo === "LOTE"
            ? clampInt(lote?.quantidade_inicial)
            : clampInt(prodCustoDetalhe?.resumo?.quantidade_saldo_total);
        const freteUnitario = quantidadeRateio > 0 ? freteTotal / quantidadeRateio : 0;
        const custoFinal = custoBase + freteUnitario;
        const quantidadeAfetada = custoAjusteTipo === "LOTE"
            ? clampInt(lote?.quantidade_atual)
            : quantidadeRateio;
        const custoAnterior = custoAjusteTipo === "LOTE"
            ? Number(lote?.custo_unitario || 0)
            : Number(produto?.preco_custo || 0);
        const valorAnterior = custoAnterior * quantidadeAfetada;
        const valorNovo = custoFinal * quantidadeAfetada;

        return {
            produto,
            lote,
            custoBase,
            freteTotal,
            quantidadeRateio,
            freteUnitario,
            custoFinal,
            quantidadeAfetada,
            custoAnterior,
            valorAnterior,
            valorNovo,
            diferenca: valorNovo - valorAnterior,
        };
    }

    function abrirAjusteCusto(tipo: CustoAjusteTipo = "NOVO_PRECO", loteId: ID = 0) {
        const p = prodEditId ? prodById.get(prodEditId) : null;
        if (!p) return;

        const lotesDisponiveis = (prodCustoDetalhe?.lotes || []).filter(
            (lote) => clampInt(lote.quantidade_atual) > 0
        );
        const loteSelecionado = loteId
            ? lotesDisponiveis.find((lote) => Number(lote.id) === Number(loteId))
            : lotesDisponiveis[0];

        let custoBase = Number(p.preco_custo) || 0;
        let freteTotal = 0;

        if (tipo === "LOTE" && loteSelecionado) {
            const freteUnit = Number(loteSelecionado.frete_unitario) || 0;
            custoBase = Number(loteSelecionado.custo_base_unitario);
            if (!Number.isFinite(custoBase)) {
                custoBase = Math.max(0, (Number(loteSelecionado.custo_unitario) || 0) - freteUnit);
            }
            freteTotal = Number(loteSelecionado.frete_total) || 0;
        }

        setCustoAjusteTipo(tipo);
        setCustoAjusteLoteId(loteSelecionado?.id || 0);
        setCustoAjusteNovo(
            maskBRLFromDigits(String(Math.round(Math.max(0, custoBase) * 100)))
        );
        setCustoAjusteFreteTotal(
            maskBRLFromDigits(String(Math.round(Math.max(0, freteTotal) * 100)))
        );
        setCustoAjusteObservacao("");
        setCustoAjusteConfirmOpen(false);
        setCustoAjusteOpen(true);
    }

    function prepararConfirmacaoAjusteCusto() {
        const resumo = calcularResumoAjusteCusto();

        if (!Number.isFinite(resumo.custoBase) || resumo.custoBase < 0) {
            return avisar("Informe um preço de custo válido.");
        }
        if (custoAjusteTipo === "LOTE" && !resumo.lote) {
            return avisar("Selecione o lote que será corrigido.");
        }
        if (resumo.freteTotal > 0 && resumo.quantidadeRateio <= 0) {
            return avisar("Não há quantidade disponível para dividir o valor do frete.");
        }

        setCustoAjusteConfirmOpen(true);
    }

    async function salvarAjusteCusto() {
        if (!prodEditId) return;

        const resumo = calcularResumoAjusteCusto();
        if (custoAjusteTipo === "LOTE" && !resumo.lote) {
            return avisar("Selecione o lote que será corrigido.");
        }

        setCustoAjusteBusy(true);
        try {
            const resp = await apiPost<{
                ok: boolean;
                msg?: string;
                preco_custo_referencia?: number;
            }>({
                action: "custo_ajustar",
                operacao_uuid: createOperationUuid(),
                produto_id: prodEditId,
                tipo: custoAjusteTipo,
                lote_id: custoAjusteTipo === "LOTE" ? custoAjusteLoteId : null,
                novo_custo_base: resumo.custoBase,
                frete_total: resumo.freteTotal,
                observacao: custoAjusteObservacao.trim() || null,
            });

            if (!resp.ok) {
                return avisar(resp.msg || "Falha ao registrar o ajuste de custo.");
            }

            setCustoAjusteConfirmOpen(false);
            setCustoAjusteOpen(false);
            await Promise.all([
                carregarEntradasCustoProduto(prodEditId),
                refreshInit(),
            ]);
            avisar(resp.msg || "Preço de custo atualizado.");
        } catch (e: any) {
            avisar(e?.message || "Erro ao registrar o ajuste de custo.");
        } finally {
            setCustoAjusteBusy(false);
        }
    }

    function openProdutoEditor(produtoId: ID, depositoId?: ID) {
        const p = prodById.get(produtoId);
        if (!p) return;

        setProdEditId(produtoId);
        setProdEditTab("DADOS");
        void carregarEntradasCustoProduto(produtoId, p.codigo_barras || "");

        setEditNome(p.nome || "");
        setEditDescricao((p as any).descricao || ""); // ✅ NOVO

        const valorNum = Number(p.valor) || 0;
        const valorDigits = String(Math.round(Math.max(0, valorNum) * 100));
        setEditValor(maskBRLFromDigits(valorDigits));

        const precoCustoNum = Number(p.preco_custo) || 0;
        const precoCustoDigits = String(Math.round(Math.max(0, precoCustoNum) * 100));
        setEditPrecoCusto(maskBRLFromDigits(precoCustoDigits));

        // mantém padrão do produto (não quebra legado)
        setEditMin(clampInt(p.minimo));
        setEditMax(clampInt((p as any).maximo ?? 0));

        setEditCatId(Number(p.categoria_id || 0));
        setEditFabId(Number(p.fabricante_id || 0));
        setEditClassId(Number(p.classificacao_id || 0));
        setEditAtivo(Number(p.ativo) === 1 ? 1 : 0);
        setEditConfeccionado(Number(p.confeccionado_casa || 0) === 1 ? 1 : 0);
        setEditNovoDepositoId(0);

        setEditFotosExistentes(getProdutoFotos(p));
        setEditFotosNovas([]);
        setEditFotoNova("");

        // ✅ seleciona depósito vindo da linha do estoque (ou fallback)
        const depId = Number(depositoId || 0) || Number(depositos[0]?.id || 0);
        setEditMinMaxDepId(depId);

        // ✅ carrega min/max do est_saldo daquele depósito
        const s = depId ? saldosMap.get(`${produtoId}::${depId}`) : undefined;
        setEditMinDep(clampInt(s?.minimo ?? 0));
        setEditMaxDep(clampInt(s?.maximo ?? 0));

        setProdEditOpen(true);
    }


    async function adicionarProdutoAoDeposito() {
        if (!prodEditId || !editNovoDepositoId) {
            return avisar("Selecione o depósito que receberá o produto.");
        }

        setProdutoDepositoBusy(true);
        try {
            const resp = await apiPost<{ ok: boolean; msg?: string }>({
                action: "produto_deposito_adicionar",
                produto_id: prodEditId,
                deposito_id: editNovoDepositoId,
            });
            if (!resp.ok) return avisar(resp.msg || "Falha ao adicionar o produto ao depósito.");

            const novoDep = editNovoDepositoId;
            setEditNovoDepositoId(0);
            await refreshInit();
            setEditMinMaxDepId(novoDep);
            setEditMinDep(clampInt(prodById.get(prodEditId)?.minimo));
            setEditMaxDep(clampInt(prodById.get(prodEditId)?.maximo));
            avisar(resp.msg || "Produto adicionado ao depósito.");
        } catch (e: any) {
            avisar(e?.message || "Erro ao adicionar o produto ao depósito.");
        } finally {
            setProdutoDepositoBusy(false);
        }
    }

    async function removerProdutoDoDeposito(depositoId: ID, depositoNome: string) {
        if (!prodEditId) return;
        if (!window.confirm(`Remover este produto do depósito ${depositoNome}?`)) return;

        setProdutoDepositoBusy(true);
        try {
            const resp = await apiPost<{ ok: boolean; msg?: string }>({
                action: "produto_deposito_remover",
                produto_id: prodEditId,
                deposito_id: depositoId,
            });
            if (!resp.ok) return avisar(resp.msg || "Falha ao remover o produto do depósito.");

            if (Number(editMinMaxDepId) === Number(depositoId)) {
                setEditMinMaxDepId(0);
                setEditMinDep(0);
                setEditMaxDep(0);
            }
            await refreshInit();
            avisar(resp.msg || "Produto removido do depósito.");
        } catch (e: any) {
            avisar(e?.message || "Erro ao remover o produto do depósito.");
        } finally {
            setProdutoDepositoBusy(false);
        }
    }

    async function onProdutoFotoNova(files?: FileList | File[] | null) {
        if (!files || !files.length) return;

        const lista = Array.from(files);
        const novas: Array<{
            temp_id: string;
            foto_url: string;
            legenda: string;
            is_principal: 0 | 1;
            ordem: number;
        }> = [];

        for (const file of lista) {
            const url = await fileToDataUrl(file);
            novas.push({
                temp_id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                foto_url: url,
                legenda: "",
                is_principal: 0,
                ordem: 0,
            });
        }

        setEditFotosNovas((prev) => {
            const hadPrincipal =
                prev.some((f) => Number(f.is_principal) === 1) ||
                editFotosExistentes.some((f) => Number(f.is_principal || 0) === 1);

            const merged = [...prev, ...novas].map((f, idx) => ({
                ...f,
                ordem: idx + 1,
            }));

            if (!hadPrincipal && merged.length) {
                merged[0].is_principal = 1;
            }

            return merged;
        });
    }

    function marcarFotoPrincipalExistente(fotoId?: ID) {
        if (!fotoId) return;

        setEditFotosExistentes((prev) =>
            prev.map((f) => ({
                ...f,
                is_principal: Number(f.id) === Number(fotoId) ? 1 : 0,
            }))
        );

        setEditFotosNovas((prev) =>
            prev.map((f) => ({
                ...f,
                is_principal: 0,
            }))
        );
    }

    function marcarFotoPrincipalNova(tempId: string) {
        setEditFotosExistentes((prev) =>
            prev.map((f) => ({
                ...f,
                is_principal: 0,
            }))
        );

        setEditFotosNovas((prev) =>
            prev.map((f) => ({
                ...f,
                is_principal: f.temp_id === tempId ? 1 : 0,
            }))
        );
    }

    function removerFotoExistente(fotoId?: ID) {
        if (!fotoId) return;

        setEditFotosExistentes((prev) => {
            const next = prev.filter((f) => Number(f.id) !== Number(fotoId));

            const hasPrincipal = next.some((f) => Number(f.is_principal || 0) === 1);
            if (!hasPrincipal && next.length) next[0].is_principal = 1;

            return next.map((f, idx) => ({
                ...f,
                ordem: idx + 1,
            }));
        });
    }

    function removerFotoNova(tempId: string) {
        setEditFotosNovas((prev) => {
            const next = prev.filter((f) => f.temp_id !== tempId);
            const hasPrincipal = next.some((f) => Number(f.is_principal) === 1);

            if (!hasPrincipal && next.length) next[0].is_principal = 1;

            return next.map((f, idx) => ({
                ...f,
                ordem: idx + 1,
            }));
        });
    }

    async function salvarCadastroProduto() {
        if (!prodEditId) return;
        if (!editNome.trim()) return avisar("Nome obrigatório.");

        setProdBusy(true);
        try {
            const payload: any = {
                action: "produto_atualizar",
                produto_id: prodEditId,
                nome: editNome.trim(),
                descricao: editDescricao.trim() || "",
                valor: parseBRLToNumber(editValor),
                minimo: clampInt(editMin),
                maximo: clampInt(editMax),
                categoria_id: editCatId ? Number(editCatId) : 0,
                fabricante_id: editFabId ? Number(editFabId) : 0,
                classificacao_id: editClassId ? Number(editClassId) : 0,
                ativo: editAtivo,
                confeccionado_casa: editConfeccionado,

                // ✅ nova estrutura de galeria
                fotos: [
                    ...editFotosExistentes.map((f, idx) => ({
                        id: f.id,
                        arquivo: f.arquivo || f.foto_url || null,
                        legenda: f.legenda || "",
                        ordem: idx + 1,
                        is_principal: Number(f.is_principal || 0) === 1 ? 1 : 0,
                        removida: 0,
                    })),
                    ...editFotosNovas.map((f, idx) => ({
                        foto_url: f.foto_url,
                        legenda: f.legenda || "",
                        ordem: editFotosExistentes.length + idx + 1,
                        is_principal: Number(f.is_principal) === 1 ? 1 : 0,
                        nova: 1,
                    })),
                ],
            };

            // fallback legado: mantém compatibilidade com backend antigo
            const principalExistente =
                editFotosExistentes.find((f) => Number(f.is_principal || 0) === 1) || editFotosExistentes[0];

            const principalNova =
                editFotosNovas.find((f) => Number(f.is_principal) === 1) || editFotosNovas[0];

            if (principalNova?.foto_url) {
                payload.foto_url = principalNova.foto_url;
            } else if (principalExistente) {
                payload.foto_url = principalExistente.arquivo || principalExistente.foto_url || "";
            } else if (editFotoNova) {
                payload.foto_url = editFotoNova;
            }

            const r = await apiPost<{ ok: boolean; msg?: string }>(payload);
            if (!r.ok) return avisar(r.msg || "Falha ao salvar cadastro.");

            await refreshInit();
            avisar("Produto atualizado.");
        } finally {
            setProdBusy(false);
        }
    }

    async function salvarMinMaxDoDeposito() {
        if (!prodEditId) return avisar("Produto inválido.");
        if (!editMinMaxDepId) return avisar("Selecione o depósito.");

        setMinMaxBusy(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "saldo_minmax_setar", // ✅ backend precisa aceitar isso
                produto_id: Number(prodEditId),
                deposito_id: Number(editMinMaxDepId),
                minimo: clampInt(editMinDep),
                maximo: clampInt(editMaxDep),
            });

            if (!r.ok) return avisar(r.msg || "Falha ao salvar mín/máx do depósito.");

            await refreshInit();
            avisar("Mín/Máx do depósito atualizado.");
        } finally {
            setMinMaxBusy(false);
        }
    }

    return {
        prodEditOpen,
        setProdEditOpen,
        prodEditId,
        setProdEditId,
        prodEditTab,
        setProdEditTab,
        prodBusy,
        setProdBusy,
        minMaxBusy,
        setMinMaxBusy,
        prodEntradasCusto,
        setProdEntradasCusto,
        prodEntradasCustoLoading,
        setProdEntradasCustoLoading,
        prodEntradasCustoErr,
        setProdEntradasCustoErr,
        prodCustoDetalhe,
        setProdCustoDetalhe,
        custoAjusteOpen,
        setCustoAjusteOpen,
        custoAjusteConfirmOpen,
        setCustoAjusteConfirmOpen,
        custoAjusteTipo,
        setCustoAjusteTipo,
        custoAjusteLoteId,
        setCustoAjusteLoteId,
        custoAjusteNovo,
        setCustoAjusteNovo,
        custoAjusteFreteTotal,
        setCustoAjusteFreteTotal,
        custoAjusteObservacao,
        setCustoAjusteObservacao,
        custoAjusteBusy,
        setCustoAjusteBusy,
        editNome,
        setEditNome,
        editDescricao,
        setEditDescricao,
        editValor,
        setEditValor,
        editPrecoCusto,
        setEditPrecoCusto,
        editMin,
        setEditMin,
        editMax,
        setEditMax,
        editMinMaxDepId,
        setEditMinMaxDepId,
        editMinDep,
        setEditMinDep,
        editMaxDep,
        setEditMaxDep,
        editCatId,
        setEditCatId,
        editFabId,
        setEditFabId,
        editClassId,
        setEditClassId,
        editAtivo,
        setEditAtivo,
        editConfeccionado,
        setEditConfeccionado,
        produtoDepositoBusy,
        setProdutoDepositoBusy,
        editNovoDepositoId,
        setEditNovoDepositoId,
        editFotosExistentes,
        setEditFotosExistentes,
        editFotosNovas,
        setEditFotosNovas,
        editFotoNova,
        setEditFotoNova,
        carregarEntradasCustoProduto,
        calcularResumoAjusteCusto,
        abrirAjusteCusto,
        prepararConfirmacaoAjusteCusto,
        salvarAjusteCusto,
        openProdutoEditor,
        adicionarProdutoAoDeposito,
        removerProdutoDoDeposito,
        onProdutoFotoNova,
        marcarFotoPrincipalExistente,
        marcarFotoPrincipalNova,
        removerFotoExistente,
        removerFotoNova,
        salvarCadastroProduto,
        salvarMinMaxDoDeposito,
    };
}

export type EditarProduto = ReturnType<typeof useEditarProduto>;
