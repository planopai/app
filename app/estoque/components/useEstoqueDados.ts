"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "./api";
import { clampInt } from "./formato";
import type { Categoria, Classificacao, CustoMedioMovelProduto, Deposito, Fabricante, InitResp, Me, Produto, Saldo, UiTab, Usuario } from "./tipos";
import { markAndCleanNewBuild } from "./versao";

// Dados comuns do Estoque: usuário, depósitos, produtos, saldos, custos médios, alertas e qual tela está aberta.

export function useEstoqueDados() {
    const [tab, setTab] = useState<UiTab>("MENU");

    const [loading, setLoading] = useState(true);
    const [initErr, setInitErr] = useState<string>("");

    const [me, setMe] = useState<Me | null>(null);
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);

    const [fabricantes, setFabricantes] = useState<Fabricante[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);

    // Custo médio móvel oficial usado nas telas consolidadas de estoque.
    const [custosMediosMoveis, setCustosMediosMoveis] = useState<
        Record<number, CustoMedioMovelProduto>
    >({});
    const custosMediosMoveisRef = useRef<Record<number, CustoMedioMovelProduto>>({});
    const [custosMediosLoading, setCustosMediosLoading] = useState(false);
    const [custosMediosErr, setCustosMediosErr] = useState("");
    const [custosMediosVersion, setCustosMediosVersion] = useState(0);


    // imagem popup
    const [imgOpen, setImgOpen] = useState(false);
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [imgTitle, setImgTitle] = useState<string>(""); // legado / compatibilidade

    // saldos editáveis por depósito


    const depById = useMemo(() => new Map(depositos.map((d) => [d.id, d])), [depositos]);
    const prodById = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
    const produtosAtivos = useMemo(
        () => produtos.filter((p) => Number(p.ativo) === 1),
        [produtos]
    );
    const userById = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);
    const catById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
    const fabById = useMemo(() => new Map(fabricantes.map((f) => [f.id, f])), [fabricantes]);
    const classById = useMemo(() => new Map(classificacoes.map((c) => [c.id, c])), [classificacoes]);

    const saldosMap = useMemo(() => {
        const m = new Map<string, Saldo>();
        for (const s of saldos) m.set(`${s.produto_id}::${s.deposito_id}`, s);
        return m;
    }, [saldos]);

    // Ao entrar em uma publicação nova, descarta caches de runtime antigos.
    // Não recarrega em loop: apenas registra o APP_BUILD_ID atual.
    useEffect(() => {
        void markAndCleanNewBuild();
    }, []);


    async function refreshInit() {
        setLoading(true);
        setInitErr("");
        try {
            const j = await apiGet<InitResp>({ init: 1, _ts: Date.now() });
            if (!j.ok) throw new Error(j.msg || "Falha no init");

            setMe(j.me);
            setUsuarios(j.usuarios || []);
            setDepositos(j.depositos || []);

            setCategorias((j.categorias || []).filter((c) => Number(c.ativo) === 1));
            setFabricantes((j.fabricantes || []).filter((f) => Number(f.ativo) === 1));
            // Mantém ativos e inativos em memória. As telas operacionais usam produtosAtivos.
            setProdutos(j.produtos || []);
            setClassificacoes((j.classificacoes || []).filter((c) => Number(c.ativo) === 1));

            setSaldos(j.saldos || []);

            // Uma atualização pode conter novas entradas/saídas/ajustes.
            // Limpa o cache para recalcular o custo médio móvel oficial.
            custosMediosMoveisRef.current = {};
            setCustosMediosMoveis({});
            setCustosMediosErr("");
            setCustosMediosVersion((v) => v + 1);
        } catch (e: any) {
            setInitErr(e?.message || "Erro ao carregar.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refreshInit();

        const onFocus = () => refreshInit();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ALERTAS (só se Min e Max definidos)
    const alertRows = useMemo(() => {
        const rows: Array<{ p: Produto; d: Deposito; qtd: number; min: number; max: number; rep: number }> = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d || Number(p.ativo) !== 1) continue;

            const min = clampInt(s.minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);
            const qtd = clampInt(s.quantidade);

            // ✅ só considera alerta se Min e Max estiverem definidos
            const hasMinMax = min > 0 && max > 0;
            if (!hasMinMax) continue;

            if (qtd <= min) {
                rows.push({
                    p,
                    d,
                    qtd,
                    min,
                    max,
                    rep: Math.max(0, max - qtd),
                });
            }
        }

        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR"));
        return rows;
    }, [saldos, prodById, depById]);


    const alertCount = alertRows.length;

    function abrirTela(nextTab: UiTab) {
        setTab(nextTab);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function voltarParaMenu() {
        setTab("MENU");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    return {
        tab,
        setTab,
        loading,
        setLoading,
        initErr,
        setInitErr,
        me,
        setMe,
        usuarios,
        setUsuarios,
        depositos,
        setDepositos,
        categorias,
        setCategorias,
        classificacoes,
        setClassificacoes,
        fabricantes,
        setFabricantes,
        produtos,
        setProdutos,
        saldos,
        setSaldos,
        custosMediosMoveis,
        setCustosMediosMoveis,
        custosMediosMoveisRef,
        custosMediosLoading,
        setCustosMediosLoading,
        custosMediosErr,
        setCustosMediosErr,
        custosMediosVersion,
        setCustosMediosVersion,
        imgOpen,
        setImgOpen,
        imgUrl,
        setImgUrl,
        imgTitle,
        setImgTitle,
        depById,
        prodById,
        produtosAtivos,
        userById,
        catById,
        fabById,
        classById,
        saldosMap,
        refreshInit,
        alertRows,
        alertCount,
        abrirTela,
        voltarParaMenu,
    };
}

export type EstoqueDados = ReturnType<typeof useEstoqueDados>;
