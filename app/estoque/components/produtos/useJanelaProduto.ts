"use client";

import { useState } from "react";
import { apiPost } from "../api";
import { clampInt, maskBRLInput, parseBRLToNumber } from "../formato";
import { resolveProdutoFotoUrl } from "../fotos";
import { useBuscaLista } from "../ui/BuscaLista";
import type { Cadastros } from "../cadastros/useCadastros";
import type { ID } from "../tipos";
import type { EstoqueDados } from "../useEstoqueDados";
import { brl } from "./useAbaProdutos";
import type { EditarProduto } from "./useEditarProduto";

// Janela do produto (repaginada): uma janela só para editar e para cadastrar, com as abas Dados, Estoque, Venda e Custo.
// A gravação do produto existente continua no useEditarProduto; o cadastro novo usa produto_criar.

type AbaProduto = "dados" | "estoque" | "valor" | "custo";
type FotoNova = { temp_id: string; foto_url: string; is_principal: 0 | 1 };

export function useJanelaProduto(n: EstoqueDados, ed: EditarProduto, cad: Cadastros, avisar: (t: string) => void) {
    const { categorias, fabricantes, classificacoes, depositos, prodById, saldos, alertRows, refreshInit, produtos } = n;

    const [aberta, setAberta] = useState<"" | "editar" | "novo">("");
    const [aba, setAba] = useState<AbaProduto>("dados");
    const [erro, setErro] = useState("");
    const [busy, setBusy] = useState(false);
    const [sub, setSub] = useState<"" | "minmax" | "vincular">("");
    const [subDep, setSubDep] = useState<ID | null>(null);

    // Cadastro novo
    const [nvNome, setNvNome] = useState("");
    const [nvCb, setNvCb] = useState("");
    const [nvCat, setNvCat] = useState<ID | null>(null);
    const [nvFab, setNvFab] = useState<ID | null>(null);
    const [nvCls, setNvCls] = useState<ID | null>(null);
    const [nvConf, setNvConf] = useState(false);
    const [nvDesc, setNvDesc] = useState("");
    const [nvValor, setNvValor] = useState("");
    const [nvCusto, setNvCusto] = useState("");
    const [nvDeps, setNvDeps] = useState<Record<number, { mn: string; mx: string }>>({});
    const [nvFotos, setNvFotos] = useState<FotoNova[]>([]);

    const novo = aberta === "novo";
    const p = !novo && ed.prodEditId ? prodById.get(ed.prodEditId) || null : null;

    const opc = (lista: Array<{ id: ID; nome: string }>) => lista.map((x) => ({ id: x.id, n: x.nome }));
    const idOuNull = (v: string | number | null) => (v == null || v === "" ? null : Number(v));

    const cbCat = useBuscaLista(opc(categorias), novo ? nvCat : ed.editCatId || null, (id) => (novo ? setNvCat(idOuNull(id)) : ed.setEditCatId(Number(id || 0))));
    const cbFab = useBuscaLista(opc(fabricantes), novo ? nvFab : ed.editFabId || null, (id) => (novo ? setNvFab(idOuNull(id)) : ed.setEditFabId(Number(id || 0))));
    const cbCls = useBuscaLista(opc(classificacoes), novo ? nvCls : ed.editClassId || null, (id) => (novo ? setNvCls(idOuNull(id)) : ed.setEditClassId(Number(id || 0))));

    const depsDoProduto = p ? saldos.filter((s) => Number(s.produto_id) === Number(p.id)) : [];
    const cbSubDep = useBuscaLista(
        (sub === "vincular" ? depositos.filter((d) => !depsDoProduto.some((s) => Number(s.deposito_id) === Number(d.id))) : depositos.filter((d) => depsDoProduto.some((s) => Number(s.deposito_id) === Number(d.id)))).map(
            (d) => ({ id: d.id, n: d.nome })
        ),
        subDep,
        (id) => {
            const dep = idOuNull(id);
            setSubDep(dep);
            if (sub === "minmax" && dep && p) {
                const s = depsDoProduto.find((x) => Number(x.deposito_id) === dep);
                ed.setEditMinMaxDepId(dep);
                ed.setEditMinDep(clampInt(s?.minimo ?? 0));
                ed.setEditMaxDep(clampInt(s?.maximo ?? 0));
            }
        }
    );

    function limparNovo() {
        setNvNome("");
        setNvCb("");
        setNvCat(null);
        setNvFab(null);
        setNvCls(null);
        setNvConf(false);
        setNvDesc("");
        setNvValor("");
        setNvCusto("");
        setNvDeps({});
        setNvFotos([]);
    }

    function abrir(id: ID) {
        ed.openProdutoEditor(id);
        ed.setProdEditOpen(false);
        setAba("dados");
        setErro("");
        setSub("");
        setAberta("editar");
    }

    function abrirNovo() {
        limparNovo();
        setAba("dados");
        setErro("");
        setSub("");
        setAberta("novo");
    }

    function fechar() {
        setAberta("");
        setSub("");
        setErro("");
    }

    async function adicionarFotos(files: FileList | null) {
        if (!files || !files.length) return;
        if (!novo) return ed.onProdutoFotoNova(files);
        const lista: FotoNova[] = [];
        for (const f of Array.from(files)) {
            lista.push({ temp_id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, foto_url: await cad.fileToDataUrl(f), is_principal: 0 });
        }
        setNvFotos((prev) => {
            const todas = [...prev, ...lista];
            if (!todas.some((x) => x.is_principal === 1) && todas.length) todas[0] = { ...todas[0], is_principal: 1 };
            return todas;
        });
    }

    const fotos = novo
        ? nvFotos.map((f) => ({ url: f.foto_url, principal: f.is_principal === 1, tirar: () => setNvFotos((a) => a.filter((x) => x.temp_id !== f.temp_id)), principalGo: () => setNvFotos((a) => a.map((x) => ({ ...x, is_principal: x.temp_id === f.temp_id ? 1 : 0 }))) }))
        : [
              ...ed.editFotosExistentes.map((f) => ({
                  url: resolveProdutoFotoUrl(f) || "",
                  principal: Number(f.is_principal || 0) === 1,
                  tirar: () => ed.removerFotoExistente(f.id),
                  principalGo: () => ed.marcarFotoPrincipalExistente(f.id),
              })),
              ...ed.editFotosNovas.map((f) => ({
                  url: f.foto_url,
                  principal: Number(f.is_principal) === 1,
                  tirar: () => ed.removerFotoNova(f.temp_id),
                  principalGo: () => ed.marcarFotoPrincipalNova(f.temp_id),
              })),
          ];

    async function criarProduto() {
        const nome = nvNome.trim().toUpperCase();
        const cb = nvCb.trim();
        if (!nome || !cb || !nvCat) {
            setAba("dados");
            return setErro("Preencha nome, código de barras e categoria.");
        }
        if (produtos.some((x) => String(x.codigo_barras).trim() === cb)) {
            setAba("dados");
            return setErro("Já existe um produto com este código de barras.");
        }
        const deps = Object.keys(nvDeps).map(Number);
        if (!deps.length) {
            setAba("estoque");
            return setErro("Marque pelo menos um depósito do produto.");
        }
        setBusy(true);
        setErro("");
        try {
            const [primeiro, ...outros] = deps;
            const principal = nvFotos.find((f) => f.is_principal === 1) || nvFotos[0];
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({
                action: "produto_criar",
                codigo_barras: cb,
                nome,
                descricao: nvDesc.trim(),
                valor: parseBRLToNumber(nvValor),
                preco_custo: parseBRLToNumber(nvCusto),
                minimo: clampInt(nvDeps[primeiro]?.mn),
                maximo: clampInt(nvDeps[primeiro]?.mx),
                deposito_id: primeiro,
                categoria_id: nvCat || 0,
                fabricante_id: nvFab || 0,
                classificacao_id: nvCls || 0,
                confeccionado_casa: nvConf ? 1 : 0,
                foto_url: principal?.foto_url || "",
                fotos: nvFotos.map((f, i) => ({ foto_url: f.foto_url, legenda: "", ordem: i + 1, is_principal: f.is_principal, nova: 1 })),
            });
            if (!r.ok || !r.id) return setErro(r.msg || "Falha ao criar produto.");

            // Demais depósitos marcados: vincula e grava o mínimo e o máximo de cada um.
            for (const d of outros) {
                const v = await apiPost<{ ok: boolean; msg?: string }>({ action: "produto_deposito_adicionar", produto_id: r.id, deposito_id: d });
                if (!v.ok) return setErro(v.msg || "Produto criado, mas não foi possível vincular um dos depósitos.");
                const mn = clampInt(nvDeps[d]?.mn);
                const mx = clampInt(nvDeps[d]?.mx);
                if (mn || mx) {
                    const mm = await apiPost<{ ok: boolean; msg?: string }>({ action: "saldo_minmax_setar", produto_id: r.id, deposito_id: d, minimo: mn, maximo: mx });
                    if (!mm.ok) return setErro(mm.msg || "Produto criado, mas não foi possível gravar o mínimo e o máximo.");
                }
            }
            await refreshInit();
            fechar();
            avisar(`${nome} cadastrado.`);
        } catch (e: unknown) {
            setErro(e instanceof Error ? e.message : "Erro ao criar produto.");
        } finally {
            setBusy(false);
        }
    }

    async function salvar() {
        if (novo) return criarProduto();
        setBusy(true);
        try {
            await ed.salvarCadastroProduto();
            fechar();
        } finally {
            setBusy(false);
        }
    }

    // Dados exibidos
    const alertaProduto = p ? alertRows.some((r) => Number(r.p.id) === Number(p.id)) : false;
    const totalUn = depsDoProduto.reduce((a, s) => a + clampInt(s.quantidade), 0);
    const nomeDep = (id: ID) => depositos.find((d) => Number(d.id) === Number(id))?.nome || `#${id}`;
    const edDeps = depsDoProduto
        .map((s) => {
            const q = clampInt(s.quantidade), mn = clampInt(s.minimo), mx = clampInt(s.maximo);
            return { id: s.deposito_id, d: nomeDep(s.deposito_id), q: String(q), mn: mn ? String(mn) : "—", mx: mx ? String(mx) : "—", rep: mx && q < mx ? String(mx - q) : "—", low: mn > 0 && mx > 0 && q <= mn };
        })
        .sort((a, b) => a.d.localeCompare(b.d, "pt-BR"));

    const valorVenda = p ? Number(p.valor) || 0 : 0;
    const custoAtual = p ? Number(p.preco_custo) || 0 : 0;

    const nvDepsRows = depositos.map((d) => {
        const v = nvDeps[Number(d.id)];
        const set = (campo: "mn" | "mx") => (e: React.ChangeEvent<HTMLInputElement>) =>
            setNvDeps((x) => ({ ...x, [Number(d.id)]: { ...(x[Number(d.id)] || { mn: "", mx: "" }), [campo]: e.target.value.replace(/\D/g, "") } }));
        return {
            d: d.nome,
            on: !!v,
            go: () =>
                setNvDeps((x) => {
                    const c = { ...x };
                    if (c[Number(d.id)]) delete c[Number(d.id)];
                    else c[Number(d.id)] = { mn: "", mx: "" };
                    return c;
                }),
            mn: v?.mn || "",
            mx: v?.mx || "",
            onMn: set("mn"),
            onMx: set("mx"),
        };
    });

    const TABS: Array<[AbaProduto, string]> = [["dados", "Dados"], ["estoque", "Estoque"], ["valor", "Venda"], ["custo", "Custo"]];

    return {
        aberta: !!aberta,
        novo,
        editando: !novo,
        abrir,
        abrirNovo,
        fechar,
        erro,
        busy,
        titulo: novo ? "Novo produto" : p?.nome || "",
        subtitulo: novo ? "" : p ? `CB ${p.codigo_barras} · ${totalUn} unidades no total` : "",
        foto: fotos.find((f) => f.principal)?.url || fotos[0]?.url || null,
        alerta: alertaProduto,
        abas: TABS.map(([k, l]) => ({ k, l, sel: aba === k, go: () => setAba(k) })),
        aba,
        // dados
        nome: novo ? nvNome : ed.editNome,
        onNome: (e: React.ChangeEvent<HTMLInputElement>) => (novo ? setNvNome(e.target.value) : ed.setEditNome(e.target.value)),
        cb: novo ? nvCb : p?.codigo_barras || "",
        onCb: (e: React.ChangeEvent<HTMLInputElement>) => setNvCb(e.target.value),
        cbCat,
        cbFab,
        cbCls,
        situacao: [
            { l: "Ativo", on: ed.editAtivo === 1, go: () => ed.setEditAtivo(1) },
            { l: "Inativo", on: ed.editAtivo === 0, go: () => ed.setEditAtivo(0) },
        ],
        confeccionado: novo ? nvConf : ed.editConfeccionado === 1,
        togConfeccionado: () => (novo ? setNvConf((v) => !v) : ed.setEditConfeccionado(ed.editConfeccionado === 1 ? 0 : 1)),
        fotos,
        adicionarFotos,
        descricao: novo ? nvDesc : ed.editDescricao,
        onDescricao: (e: React.ChangeEvent<HTMLTextAreaElement>) => (novo ? setNvDesc(e.target.value) : ed.setEditDescricao(e.target.value)),
        // estoque
        edDeps,
        nvDepsRows,
        sub,
        abrirMinMax: () => {
            setSubDep(null);
            setSub("minmax");
        },
        abrirVincular: () => {
            setSubDep(null);
            setSub("vincular");
        },
        fecharSub: () => setSub(""),
        cbSubDep,
        subDep,
        minDep: String(ed.editMinDep || ""),
        maxDep: String(ed.editMaxDep || ""),
        onMinDep: (e: React.ChangeEvent<HTMLInputElement>) => ed.setEditMinDep(clampInt(e.target.value.replace(/\D/g, ""))),
        onMaxDep: (e: React.ChangeEvent<HTMLInputElement>) => ed.setEditMaxDep(clampInt(e.target.value.replace(/\D/g, ""))),
        salvarMinMax: async () => {
            if (!subDep) return setErro("Escolha o depósito.");
            await ed.salvarMinMaxDoDeposito();
            setSub("");
        },
        vincular: async () => {
            if (!subDep || !p) return setErro("Escolha o depósito.");
            const r = await apiPost<{ ok: boolean; msg?: string }>({ action: "produto_deposito_adicionar", produto_id: p.id, deposito_id: subDep });
            if (!r.ok) return setErro(r.msg || "Falha ao vincular o produto ao depósito.");
            await refreshInit();
            setSub("");
            setErro("");
        },
        desvincular: async () => {
            if (!subDep) return setErro("Escolha o depósito.");
            await ed.removerProdutoDoDeposito(subDep, nomeDep(subDep));
            setSub("");
        },
        // venda e custo
        valorAtual: valorVenda ? brl(valorVenda) : "Sem valor de venda",
        margem: valorVenda ? `${Math.round(((valorVenda - custoAtual) / valorVenda) * 1000) / 10}% de margem bruta` : "Item de uso interno",
        valor: novo ? nvValor : ed.editValor,
        onValor: (e: React.ChangeEvent<HTMLInputElement>) => (novo ? setNvValor(maskBRLInput(e.target.value)) : ed.setEditValor(maskBRLInput(e.target.value))),
        custoAtual: brl(custoAtual),
        custoNovo: nvCusto,
        onCustoNovo: (e: React.ChangeEvent<HTMLInputElement>) => setNvCusto(maskBRLInput(e.target.value)),
        novoPrecoCusto: () => ed.abrirAjusteCusto("NOVO_PRECO"),
        corrigirLote: () => ed.abrirAjusteCusto("LOTE"),
        salvar,
        salvarLbl: novo ? "Criar produto" : "Salvar",
    };
}

export type JanelaProdutoV = ReturnType<typeof useJanelaProduto>;
