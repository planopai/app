"use client";

import { useEffect, useState } from "react";
import { API_BASE, apiPost } from "../api";
import { clampInt } from "../formato";
import type { ID } from "../tipos";
import type { EstoqueDados } from "../useEstoqueDados";

// Cadastros (atual Avançado): novo produto, ajuste de saldos, depósitos, categorias, fabricantes e CSV.

export function useCadastros(n: EstoqueDados) {
    const { categorias, depositos, fabricantes, prodById, produtos, refreshInit, saldosMap } = n;

    // =========================
    // AVANÇADO (POPUPS)
    // =========================
    const [advNovoProdutoOpen, setAdvNovoProdutoOpen] = useState(false);
    const [advAjusteOpen, setAdvAjusteOpen] = useState(false);

    const [advDepAddOpen, setAdvDepAddOpen] = useState(false);
    const [advDepRenameOpen, setAdvDepRenameOpen] = useState(false);

    const [advCatAddOpen, setAdvCatAddOpen] = useState(false);
    const [advCatRenameOpen, setAdvCatRenameOpen] = useState(false);

    const [advFabAddOpen, setAdvFabAddOpen] = useState(false);
    const [advFabRenameOpen, setAdvFabRenameOpen] = useState(false);

    const [advExportOpen, setAdvExportOpen] = useState(false);
    const [advImportOpen, setAdvImportOpen] = useState(false);


    const [catQuickOpen, setCatQuickOpen] = useState(false);
    const [catQuickNome, setCatQuickNome] = useState("");
    const [fabQuickOpen, setFabQuickOpen] = useState(false);
    const [fabQuickNome, setFabQuickNome] = useState("");

    async function fileToDataUrl(file: File): Promise<string> {
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
            reader.onload = () => resolve(String(reader.result || ""));
            reader.readAsDataURL(file);
        });
    }

    async function onNovoProdutoFoto(files?: FileList | File[] | null) {
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

        setNovoFotos((prev) => {
            const merged = [...prev, ...novas].map((f, idx) => ({
                ...f,
                ordem: idx + 1,
            }));

            if (!merged.some((f) => Number(f.is_principal) === 1) && merged.length) {
                merged[0].is_principal = 1;
            }

            return merged;
        });

        if (!novoFoto && novas[0]?.foto_url) {
            setNovoFoto(novas[0].foto_url);
        }
    }

    async function criarNovoProdutoAvancado() {
        const cb = novoCodigoBarras.trim();
        const nome = novoNome.trim();

        if (!cb) return alert("Informe o código de barras.");
        if (!nome) return alert("Informe o nome do produto.");

        if (produtos.some((p) => String(p.codigo_barras).trim() === cb)) {
            return alert("Já existe um produto com este código de barras.");
        }

        const depId = Number(novoDepositoId || 0);
        if (!depId) return alert("Selecione o depósito inicial do produto.");

        const payload: any = {
            action: "produto_criar",
            codigo_barras: cb,
            nome,
            valor: Number.isFinite(Number(novoValor)) ? Number(novoValor) : 0,
            preco_custo: Number.isFinite(Number(novoPrecoCusto)) ? Number(novoPrecoCusto) : 0,
            minimo: clampInt(novoMin),
            maximo: clampInt(novoMax),

            // ✅ NOVO: depósito inicial
            deposito_id: depId,

            categoria_id: novoCategoriaId ? Number(novoCategoriaId) : 0,
            fabricante_id: novoFabricanteId ? Number(novoFabricanteId) : 0,
            classificacao_id: novoClassificacaoId ? Number(novoClassificacaoId) : 0,
            foto_url: (novoFotos.find((f) => Number(f.is_principal) === 1)?.foto_url || novoFoto || ""),
            fotos: novoFotos.map((f, idx) => ({
                foto_url: f.foto_url,
                legenda: f.legenda || "",
                ordem: idx + 1,
                is_principal: Number(f.is_principal) === 1 ? 1 : 0,
                nova: 1,
            })),
        };


        const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>(payload);
        if (!r.ok) return alert(r.msg || "Falha ao criar produto.");

        alert("Produto criado com sucesso.");
        setNovoCodigoBarras("");
        setNovoNome("");
        setNovoValor(0);
        setNovoPrecoCusto(0);
        setNovoMin(0);
        setNovoMax(0);
        setNovoFoto("");
        setNovoFotos([]);
        setNovoCategoriaId(0);
        setNovoFabricanteId(0);
        setNovoClassificacaoId(0);
        setNovoDepositoId(depositos[0]?.id || 0);


        await refreshInit();
    }


    async function criarCategoriaQuick() {
        const nome = catQuickNome.trim();
        if (!nome) return alert("Informe o nome da categoria.");
        const r = await apiPost<{ ok: boolean; id?: number; msg?: string }>({
            action: "categoria_criar",
            nome,
        });
        if (!r.ok) return alert(r.msg || "Falha ao criar categoria.");
        setCatQuickNome("");
        setCatQuickOpen(false);
        await refreshInit();
        if (r.id) setNovoCategoriaId(Number(r.id));
    }

    async function criarFabricanteQuick() {
        const nome = fabQuickNome.trim();
        if (!nome) return alert("Informe o nome do fabricante.");
        const r = await apiPost<{ ok: boolean; id?: number; msg?: string }>({
            action: "fabricante_criar",
            nome,
        });
        if (!r.ok) return alert(r.msg || "Falha ao criar fabricante.");
        setFabQuickNome("");
        setFabQuickOpen(false);
        await refreshInit();
        if (r.id) setNovoFabricanteId(Number(r.id));
    }


    // =========================
    // AJUSTE MANUAL (AVANÇADO) - SALDOS POR DEPÓSITO
    // =========================
    const [ajusteProdId, setAjusteProdId] = useState<ID>(0);
    const [ajusteProdQuery, setAjusteProdQuery] = useState("");
    const [ajusteSaldos, setAjusteSaldos] = useState<Record<number, number>>({});
    const [ajusteBusy, setAjusteBusy] = useState(false);

    // quando escolher o produto, carrega os saldos atuais para edição
    useEffect(() => {
        if (!ajusteProdId) {
            setAjusteSaldos({});
            return;
        }

        const m: Record<number, number> = {};
        for (const d of depositos) {
            const s = saldosMap.get(`${ajusteProdId}::${d.id}`);
            m[d.id] = clampInt(s?.quantidade ?? 0);
        }
        setAjusteSaldos(m);

        const p = prodById.get(ajusteProdId);
        if (p && (!ajusteProdQuery.trim() || ajusteProdQuery.trim() !== p.nome)) {
            setAjusteProdQuery(p.nome);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ajusteProdId, depositos, saldosMap, prodById]);

    async function salvarAjusteSaldosAvancado() {
        if (!ajusteProdId) return alert("Selecione um produto.");

        setAjusteBusy(true);
        try {
            for (const d of depositos) {
                const novo = clampInt(ajusteSaldos[d.id] ?? 0);
                const atual = clampInt(saldosMap.get(`${ajusteProdId}::${d.id}`)?.quantidade ?? 0);
                if (novo === atual) continue;

                const r = await apiPost<{ ok: boolean; msg?: string }>({
                    action: "saldo_setar",
                    produto_id: ajusteProdId,
                    deposito_id: d.id,
                    quantidade: novo,
                });

                if (!r.ok) {
                    alert(r.msg || `Falha ao salvar saldo em ${d.nome}`);
                    return;
                }
            }

            await refreshInit();
            alert("Saldos atualizados.");
        } finally {
            setAjusteBusy(false);
        }
    }

    /* =========================
       AVANÇADO + HISTÓRICO (mantidos)
    ========================= */

    // ======= NOVO PRODUTO (AVANÇADO) =======
    const [novoCodigoBarras, setNovoCodigoBarras] = useState("");
    const [novoNome, setNovoNome] = useState("");
    const [novoValor, setNovoValor] = useState<number>(0);
    const [novoPrecoCusto, setNovoPrecoCusto] = useState<number>(0);
    const [novoMin, setNovoMin] = useState<number>(0);
    const [novoMax, setNovoMax] = useState<number>(0);
    const [novoFoto, setNovoFoto] = useState<string>("");
    const [novoFotos, setNovoFotos] = useState<Array<{
        temp_id: string;
        foto_url: string;
        legenda: string;
        is_principal: 0 | 1;
        ordem: number;
    }>>([]);

    const [novoCategoriaId, setNovoCategoriaId] = useState<ID>(0);
    const [novoFabricanteId, setNovoFabricanteId] = useState<ID>(0);
    const [novoClassificacaoId, setNovoClassificacaoId] = useState<ID>(0);

    // ✅ NOVO: depósito inicial do produto
    const [novoDepositoId, setNovoDepositoId] = useState<ID>(0);


    const [novoDepNome, setNovoDepNome] = useState("");
    const [renomearDepId, setRenomearDepId] = useState<ID>(0);
    const [renomearDepNome, setRenomearDepNome] = useState("");
    const [busyDep, setBusyDep] = useState(false);

    useEffect(() => {
        if (!renomearDepId && depositos[0]?.id) {
            setRenomearDepId(depositos[0].id);
            setRenomearDepNome(depositos[0].nome);
        }
    }, [depositos, renomearDepId]);

    useEffect(() => {
        const d = depositos.find((x) => x.id === renomearDepId);
        if (d) setRenomearDepNome(d.nome);
    }, [renomearDepId, depositos]);

    async function criarDeposito() {
        const nome = novoDepNome.trim();
        if (!nome) return alert("Informe o nome do depósito.");
        setBusyDep(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({
                action: "deposito_criar",
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao criar depósito.");
            setNovoDepNome("");
            await refreshInit();
        } finally {
            setBusyDep(false);
        }
    }

    async function renomearDeposito() {
        const deposito_id = Number(renomearDepId);
        const nome = renomearDepNome.trim();
        if (!deposito_id) return alert("Selecione o depósito.");
        if (!nome) return alert("Informe o novo nome.");
        setBusyDep(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "deposito_renomear",
                deposito_id,
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao renomear.");
            await refreshInit();
        } finally {
            setBusyDep(false);
        }
    }

    function exportarDeposito(deposito_id: ID) {
        const url = `${API_BASE}?export_deposito_id=${deposito_id}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }


    // Categorias
    const [novoCatNome, setNovoCatNome] = useState("");
    const [renomearCatId, setRenomearCatId] = useState<ID>(0);
    const [renomearCatNome, setRenomearCatNome] = useState("");
    const [busyCat, setBusyCat] = useState(false);

    useEffect(() => {
        if (!renomearCatId && categorias[0]?.id) {
            setRenomearCatId(categorias[0].id);
            setRenomearCatNome(categorias[0].nome);
        }
    }, [categorias, renomearCatId]);

    useEffect(() => {
        const c = categorias.find((x) => x.id === renomearCatId);
        if (c) setRenomearCatNome(c.nome);
    }, [renomearCatId, categorias]);

    async function criarCategoria() {
        const nome = novoCatNome.trim();
        if (!nome) return alert("Informe o nome da categoria.");
        setBusyCat(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({
                action: "categoria_criar",
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao criar categoria.");
            setNovoCatNome("");
            await refreshInit();
        } finally {
            setBusyCat(false);
        }
    }

    async function renomearCategoria() {
        const categoria_id = Number(renomearCatId);
        const nome = renomearCatNome.trim();
        if (!categoria_id) return alert("Selecione a categoria.");
        if (!nome) return alert("Informe o novo nome.");
        setBusyCat(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "categoria_renomear",
                categoria_id,
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao renomear categoria.");
            await refreshInit();
        } finally {
            setBusyCat(false);
        }
    }

    // Fabricantes
    const [novoFabNome, setNovoFabNome] = useState("");
    const [renomearFabId, setRenomearFabId] = useState<ID>(0);
    const [renomearFabNome, setRenomearFabNome] = useState("");
    const [busyFab, setBusyFab] = useState(false);

    useEffect(() => {
        if (!renomearFabId && fabricantes[0]?.id) {
            setRenomearFabId(fabricantes[0].id);
            setRenomearFabNome(fabricantes[0].nome);
        }
    }, [fabricantes, renomearFabId]);

    useEffect(() => {
        const f = fabricantes.find((x) => x.id === renomearFabId);
        if (f) setRenomearFabNome(f.nome);
    }, [renomearFabId, fabricantes]);

    async function criarFabricante() {
        const nome = novoFabNome.trim();
        if (!nome) return alert("Informe o nome do fabricante.");
        setBusyFab(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({
                action: "fabricante_criar",
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao criar fabricante.");
            setNovoFabNome("");
            await refreshInit();
        } finally {
            setBusyFab(false);
        }
    }

    async function renomearFabricante() {
        const fabricante_id = Number(renomearFabId);
        const nome = renomearFabNome.trim();
        if (!fabricante_id) return alert("Selecione o fabricante.");
        if (!nome) return alert("Informe o novo nome.");
        setBusyFab(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "fabricante_renomear",
                fabricante_id,
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao renomear fabricante.");
            await refreshInit();
        } finally {
            setBusyFab(false);
        }
    }

    return {
        advNovoProdutoOpen,
        setAdvNovoProdutoOpen,
        advAjusteOpen,
        setAdvAjusteOpen,
        advDepAddOpen,
        setAdvDepAddOpen,
        advDepRenameOpen,
        setAdvDepRenameOpen,
        advCatAddOpen,
        setAdvCatAddOpen,
        advCatRenameOpen,
        setAdvCatRenameOpen,
        advFabAddOpen,
        setAdvFabAddOpen,
        advFabRenameOpen,
        setAdvFabRenameOpen,
        advExportOpen,
        setAdvExportOpen,
        advImportOpen,
        setAdvImportOpen,
        catQuickOpen,
        setCatQuickOpen,
        catQuickNome,
        setCatQuickNome,
        fabQuickOpen,
        setFabQuickOpen,
        fabQuickNome,
        setFabQuickNome,
        fileToDataUrl,
        onNovoProdutoFoto,
        criarNovoProdutoAvancado,
        criarCategoriaQuick,
        criarFabricanteQuick,
        ajusteProdId,
        setAjusteProdId,
        ajusteProdQuery,
        setAjusteProdQuery,
        ajusteSaldos,
        setAjusteSaldos,
        ajusteBusy,
        setAjusteBusy,
        salvarAjusteSaldosAvancado,
        novoCodigoBarras,
        setNovoCodigoBarras,
        novoNome,
        setNovoNome,
        novoValor,
        setNovoValor,
        novoPrecoCusto,
        setNovoPrecoCusto,
        novoMin,
        setNovoMin,
        novoMax,
        setNovoMax,
        novoFoto,
        setNovoFoto,
        novoFotos,
        setNovoFotos,
        novoCategoriaId,
        setNovoCategoriaId,
        novoFabricanteId,
        setNovoFabricanteId,
        novoClassificacaoId,
        setNovoClassificacaoId,
        novoDepositoId,
        setNovoDepositoId,
        novoDepNome,
        setNovoDepNome,
        renomearDepId,
        setRenomearDepId,
        renomearDepNome,
        setRenomearDepNome,
        busyDep,
        setBusyDep,
        criarDeposito,
        renomearDeposito,
        exportarDeposito,
        novoCatNome,
        setNovoCatNome,
        renomearCatId,
        setRenomearCatId,
        renomearCatNome,
        setRenomearCatNome,
        busyCat,
        setBusyCat,
        criarCategoria,
        renomearCategoria,
        novoFabNome,
        setNovoFabNome,
        renomearFabId,
        setRenomearFabId,
        renomearFabNome,
        setRenomearFabNome,
        busyFab,
        setBusyFab,
        criarFabricante,
        renomearFabricante,
    };
}

export type Cadastros = ReturnType<typeof useCadastros>;
