"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = "https://api.planoassistencialintegrado.com.br/catalogo_api.php";

type No = {
    id: number;
    parent_id: number | null;
    nome: string;
    ordem: number;
    ativo: number | boolean;
};

type Produto = {
    id: number;
    nome: string;
    codigo_barras?: string | null;
    valor?: number | string | null;
    foto_url?: string | null;
    descricao?: string | null;
    categoria_nome?: string | null;
    classificacao_nome?: string | null;
    fabricante_nome?: string | null;
    deposito_nome?: string | null;
};

type Option = { id: number; nome: string };

// ✅ NOVO: fluxo
type FluxoInfo = { fluxo_nome: string; total: number | string };
type FluxoStep = {
    id?: number;
    fluxo_nome: string;
    ordem: number;
    no_id: number | null;
    titulo?: string | null;
    required: number | boolean;
    max_select: number;
    ativo: number | boolean;
};

function asBool(v: any) {
    return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
}

function toInt(v: any, fallback = 0) {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : fallback;
}

async function apiGET(params: Record<string, any>) {
    const url = new URL(API_URL);
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        url.searchParams.set(k, String(v));
    });
    url.searchParams.set("_nocache", String(Date.now()));

    const r = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    if (!j) throw new Error("Resposta inválida do servidor.");
    if (j.need_login) {
        window.location.href = "/login";
        return null;
    }
    if (!r.ok || !j.ok) throw new Error(j.msg || "Erro no servidor.");
    return j;
}

async function apiPOST(body: any) {
    const r = await fetch(API_URL, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    const j = await r.json().catch(() => null);
    if (!j) throw new Error("Resposta inválida do servidor.");
    if (j.need_login) {
        window.location.href = "/login";
        return null;
    }
    if (!r.ok || !j.ok) throw new Error(j.msg || "Erro no servidor.");
    return j;
}

/** monta árvore a partir da lista */
function buildTree(nodes: No[]) {
    const map = new Map<number, (No & { children: Array<No & { children: any[] }> })>();
    nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));

    const roots: Array<No & { children: any[] }> = [];
    map.forEach((n) => {
        if (n.parent_id != null && map.has(n.parent_id)) {
            map.get(n.parent_id)!.children.push(n as any);
        } else {
            roots.push(n);
        }
    });

    const sortRec = (arr: any[]) => {
        arr.sort((a, b) => toInt(a.ordem) - toInt(b.ordem) || String(a.nome).localeCompare(String(b.nome)));
        arr.forEach((x) => sortRec(x.children || []));
    };
    sortRec(roots);

    return roots;
}

function NodeItem({
    node,
    depth,
    selectedId,
    onSelect,
    expanded,
    toggleExpand,
}: {
    node: No & { children: any[] };
    depth: number;
    selectedId: number | null;
    onSelect: (id: number) => void;
    expanded: Set<number>;
    toggleExpand: (id: number) => void;
}) {
    const isSel = selectedId === node.id;
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isOpen = expanded.has(node.id);

    return (
        <div>
            <div
                className={`flex items-center gap-1 rounded-md pr-2 ${isSel ? "bg-muted" : "hover:bg-muted/40"}`}
                style={{ paddingLeft: 6 + depth * 14 }}
            >
                <button
                    type="button"
                    className="h-8 w-8 shrink-0 rounded-md hover:bg-muted/60 disabled:opacity-40"
                    disabled={!hasChildren}
                    title={hasChildren ? (isOpen ? "Encolher" : "Expandir") : "Sem filhos"}
                    onClick={() => hasChildren && toggleExpand(node.id)}
                >
                    {hasChildren ? (
                        <span className="text-xs text-muted-foreground">{isOpen ? "▼" : "▶"}</span>
                    ) : (
                        <span className="text-xs text-muted-foreground">•</span>
                    )}
                </button>

                <button
                    type="button"
                    className={`flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${isSel ? "font-semibold" : ""}`}
                    onClick={() => onSelect(node.id)}
                >
                    <span className={`inline-flex h-2 w-2 rounded-full ${asBool(node.ativo) ? "bg-emerald-500" : "bg-slate-300"}`} />
                    <span className="truncate">{node.nome}</span>
                    <span className="ml-auto text-[11px] font-mono text-muted-foreground">#{node.id}</span>
                </button>
            </div>

            {hasChildren && isOpen ? (
                <div className="mt-1">
                    {node.children.map((ch: any) => (
                        <NodeItem
                            key={ch.id}
                            node={ch}
                            depth={depth + 1}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            expanded={expanded}
                            toggleExpand={toggleExpand}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default function CatalogoConfigPage() {
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const [nodes, setNodes] = useState<No[]>([]);
    const tree = useMemo(() => buildTree(nodes), [nodes]);

    const [selectedNoId, setSelectedNoId] = useState<number | null>(null);

    // controle de expandir/encolher
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const expandAll = useCallback(() => {
        const all = new Set<number>();
        nodes.forEach((n) => all.add(n.id));
        setExpanded(all);
    }, [nodes]);
    const collapseAll = useCallback(() => setExpanded(new Set()), []);
    const toggleExpand = useCallback((id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // produtos já vinculados ao nó
    const [noProdutos, setNoProdutos] = useState<Produto[]>([]);
    const [selectedProdutoIds, setSelectedProdutoIds] = useState<Set<number>>(new Set());

    // busca no estoque + filtros
    const [q, setQ] = useState("");
    const [estoqueLoading, setEstoqueLoading] = useState(false);
    const [estoqueRows, setEstoqueRows] = useState<Produto[]>([]);

    // combos
    const [depositos, setDepositos] = useState<Option[]>([]);
    const [categorias, setCategorias] = useState<Option[]>([]);
    const [fabricantes, setFabricantes] = useState<Option[]>([]);
    const [classificacoes, setClassificacoes] = useState<Option[]>([]);

    const [fDeposito, setFDeposito] = useState<number>(0);
    const [fCategoria, setFCategoria] = useState<number>(0);
    const [fFabricante, setFFabricante] = useState<number>(0);
    const [fClassificacao, setFClassificacao] = useState<number>(0);

    /* ============================================================
       ✅ NOVO: Fluxos / Steps
    ============================================================ */

    const [fluxos, setFluxos] = useState<FluxoInfo[]>([]);
    const [fluxoNome, setFluxoNome] = useState<string>(""); // fluxo selecionado/ativo
    const [fluxoSteps, setFluxoSteps] = useState<FluxoStep[]>([]);
    const [fluxoLoading, setFluxoLoading] = useState(false);

    const loadInit = useCallback(async () => {
        setMsg(null);
        setLoading(true);
        try {
            const res = await apiGET({ init: 1 });
            if (!res) return;

            const raw = Array.isArray(res.nos) ? res.nos : [];
            setNodes(raw);

            const optMap = (arr: any): Option[] =>
                Array.isArray(arr) ? arr.map((x) => ({ id: toInt(x.id), nome: String(x.nome ?? x.descricao ?? "") })) : [];

            setDepositos(optMap(res.depositos));
            setCategorias(optMap(res.categorias));
            setFabricantes(optMap(res.fabricantes));
            setClassificacoes(optMap(res.classificacoes));

            // ✅ NOVO: fluxos listados pelo PHP
            const fl: FluxoInfo[] = Array.isArray(res.fluxos)
                ? res.fluxos.map((x: any) => ({ fluxo_nome: String(x.fluxo_nome ?? ""), total: x.total ?? 0 })).filter((x) => x.fluxo_nome)
                : [];
            setFluxos(fl);

            // se não tiver fluxo selecionado ainda, tenta pegar o primeiro existente
            setFluxoNome((prev) => {
                if (prev) return prev;
                if (fl.length > 0) return fl[0].fluxo_nome;
                return "";
            });

            setExpanded((prev) => {
                if (prev.size > 0) return prev;
                const roots = new Set<number>();
                raw.forEach((n: any) => {
                    if (n.parent_id == null) roots.add(toInt(n.id));
                });
                return roots;
            });
        } catch (e: any) {
            setNodes([]);
            setFluxos([]);
            setMsg({ ok: false, text: e?.message || "Falha ao carregar." });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadInit();
    }, [loadInit]);

    const loadNoProdutos = useCallback(async (no_id: number) => {
        setMsg(null);
        try {
            const res = await apiGET({ no_produtos: 1, no_id });
            if (!res) return;

            const rows = Array.isArray(res.rows) ? res.rows : [];
            setNoProdutos(rows);

            const ids = new Set<number>();
            rows.forEach((p: any) => ids.add(toInt(p.id)));
            setSelectedProdutoIds(ids);
        } catch (e: any) {
            setNoProdutos([]);
            setSelectedProdutoIds(new Set());
            setMsg({ ok: false, text: e?.message || "Falha ao carregar produtos do nó." });
        }
    }, []);

    const onSelectNo = useCallback(
        (id: number) => {
            setSelectedNoId(id);
            setEstoqueRows([]);
            setQ("");
            loadNoProdutos(id);

            setExpanded((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
            });
        },
        [loadNoProdutos]
    );

    const criarNoRaiz = async () => {
        const nome = prompt("Nome do menu (raiz):");
        if (!nome) return;

        try {
            setMsg(null);
            const r = await apiPOST({ action: "no_criar", parent_id: null, nome: nome.trim(), ordem: 0, ativo: 1 });
            await loadInit();
            if (r?.id) {
                setSelectedNoId(toInt(r.id));
                setExpanded((prev) => new Set(prev).add(toInt(r.id)));
            }
            setMsg({ ok: true, text: "Menu raiz criado." });
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao criar." });
        }
    };

    const criarNoFilho = async () => {
        if (!selectedNoId) {
            alert("Selecione um menu/submenu para criar um filho.");
            return;
        }
        const nome = prompt("Nome do submenu:");
        if (!nome) return;

        try {
            setMsg(null);
            const r = await apiPOST({ action: "no_criar", parent_id: selectedNoId, nome: nome.trim(), ordem: 0, ativo: 1 });
            await loadInit();
            if (r?.id) {
                setSelectedNoId(toInt(r.id));
                setExpanded((prev) => {
                    const next = new Set(prev);
                    next.add(selectedNoId);
                    next.add(toInt(r.id));
                    return next;
                });
            }
            setMsg({ ok: true, text: "Submenu criado." });
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao criar." });
        }
    };

    const renomearNo = async () => {
        if (!selectedNoId) return;
        const current = nodes.find((n) => n.id === selectedNoId);
        const nome = prompt("Novo nome:", current?.nome ?? "");
        if (!nome) return;

        try {
            setMsg(null);
            await apiPOST({ action: "no_atualizar", id: selectedNoId, nome: nome.trim() });
            await loadInit();
            setMsg({ ok: true, text: "Nó renomeado." });
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao renomear." });
        }
    };

    const excluirNo = async () => {
        if (!selectedNoId) return;
        const ok = confirm("Excluir este nó? (se houver filhos, eles podem ser excluídos também)");
        if (!ok) return;

        try {
            setMsg(null);
            await apiPOST({ action: "no_excluir", id: selectedNoId });
            setSelectedNoId(null);
            setNoProdutos([]);
            setSelectedProdutoIds(new Set());
            await loadInit();
            setMsg({ ok: true, text: "Nó excluído." });
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao excluir." });
        }
    };

    const buscarEstoque = async () => {
        if (!selectedNoId) {
            alert("Selecione um menu/submenu antes de buscar produtos.");
            return;
        }

        setMsg(null);
        setEstoqueLoading(true);
        try {
            const res = await apiGET({
                estoque_buscar: 1,
                q: q.trim(),
                limit: 80,
                deposito_id: fDeposito > 0 ? fDeposito : undefined,
                categoria_id: fCategoria > 0 ? fCategoria : undefined,
                fabricante_id: fFabricante > 0 ? fFabricante : undefined,
                classificacao_id: fClassificacao > 0 ? fClassificacao : undefined,
            });
            if (!res) return;
            setEstoqueRows(Array.isArray(res.rows) ? res.rows : []);
        } catch (e: any) {
            setEstoqueRows([]);
            setMsg({ ok: false, text: e?.message || "Falha ao buscar estoque." });
        } finally {
            setEstoqueLoading(false);
        }
    };

    const toggleProduto = (pid: number) => {
        setSelectedProdutoIds((prev) => {
            const next = new Set(prev);
            if (next.has(pid)) next.delete(pid);
            else next.add(pid);
            return next;
        });
    };

    const salvarProdutosNo = async () => {
        if (!selectedNoId) return;

        try {
            setMsg(null);
            await apiPOST({
                action: "no_produtos_set",
                no_id: selectedNoId,
                produto_ids: Array.from(selectedProdutoIds),
            });
            setMsg({ ok: true, text: "Produtos salvos no menu/submenu." });
            await loadNoProdutos(selectedNoId);
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao salvar produtos." });
        }
    };

    const clearFilters = () => {
        setFDeposito(0);
        setFCategoria(0);
        setFFabricante(0);
        setFClassificacao(0);
    };

    const selectedNodeName = useMemo(() => {
        if (!selectedNoId) return "";
        const n = nodes.find((x) => x.id === selectedNoId);
        return String(n?.nome ?? "");
    }, [nodes, selectedNoId]);

    /* ============================================================
       ✅ NOVO: handlers do fluxo
    ============================================================ */

    const loadFluxoSteps = useCallback(async (nome: string) => {
        if (!nome) {
            setFluxoSteps([]);
            return;
        }
        setFluxoLoading(true);
        setMsg(null);
        try {
            const res = await apiGET({ fluxo_steps: 1, fluxo_nome: nome });
            if (!res) return;
            const rows: FluxoStep[] = Array.isArray(res.rows)
                ? res.rows.map((x: any) => ({
                    id: toInt(x.id),
                    fluxo_nome: String(x.fluxo_nome ?? nome),
                    ordem: toInt(x.ordem, 0),
                    no_id: x.no_id === null || x.no_id === undefined ? null : toInt(x.no_id, 0),
                    titulo: x.titulo ?? null,
                    required: asBool(x.required) ? 1 : 0,
                    max_select: Math.max(1, toInt(x.max_select, 1)),
                    ativo: asBool(x.ativo) ? 1 : 0,
                }))
                : [];
            rows.sort((a, b) => toInt(a.ordem) - toInt(b.ordem));
            setFluxoSteps(rows);
        } catch (e: any) {
            setFluxoSteps([]);
            setMsg({ ok: false, text: e?.message || "Falha ao carregar steps do fluxo." });
        } finally {
            setFluxoLoading(false);
        }
    }, []);

    useEffect(() => {
        if (fluxoNome) loadFluxoSteps(fluxoNome);
        else setFluxoSteps([]);
    }, [fluxoNome, loadFluxoSteps]);

    const criarFluxo = async () => {
        const nome = prompt("Nome do fluxo (ex: FuneralCompleto):");
        if (!nome) return;
        const clean = nome.trim();
        if (!clean) return;

        // cria “virtualmente” (não tem tabela de fluxos, então criamos o 1º step)
        try {
            setMsg(null);
            // cria step 1 sem nó (você ajusta depois)
            await apiPOST({
                action: "fluxo_step_criar",
                fluxo_nome: clean,
                ordem: 1,
                no_id: null,
                titulo: "Passo 1",
                required: 1,
                max_select: 1,
                ativo: 1,
            });
            await loadInit();
            setFluxoNome(clean);
            setMsg({ ok: true, text: `Fluxo "${clean}" criado (com Step 1).` });
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao criar fluxo." });
        }
    };

    const addStep = () => {
        if (!fluxoNome) {
            alert("Selecione/crie um fluxo primeiro.");
            return;
        }
        const nextOrd = (fluxoSteps.reduce((m, s) => Math.max(m, toInt(s.ordem)), 0) || 0) + 1;
        setFluxoSteps((prev) => [
            ...prev,
            {
                fluxo_nome: fluxoNome,
                ordem: nextOrd,
                no_id: null,
                titulo: `Passo ${nextOrd}`,
                required: 1,
                max_select: 1,
                ativo: 1,
            },
        ]);
    };

    const removeStepLocal = (idx: number) => {
        setFluxoSteps((prev) => prev.filter((_, i) => i !== idx));
    };

    const moveStep = (idx: number, dir: -1 | 1) => {
        setFluxoSteps((prev) => {
            const arr = [...prev];
            const j = idx + dir;
            if (j < 0 || j >= arr.length) return prev;
            const tmp = arr[idx];
            arr[idx] = arr[j];
            arr[j] = tmp;
            return arr;
        });
    };

    const saveFluxo = async () => {
        if (!fluxoNome) {
            alert("Selecione/crie um fluxo primeiro.");
            return;
        }

        // renumera ordem 1..N (evita gaps)
        const normalized = [...fluxoSteps]
            .filter((s) => String(s.fluxo_nome || fluxoNome))
            .map((s) => ({ ...s, fluxo_nome: fluxoNome }))
            .sort((a, b) => toInt(a.ordem) - toInt(b.ordem));

        const finalSteps = normalized.map((s, i) => ({
            ordem: i + 1,
            no_id: s.no_id ?? null,
            titulo: (s.titulo ?? "").trim() || null,
            required: asBool(s.required) ? 1 : 0,
            max_select: Math.max(1, toInt(s.max_select, 1)),
            ativo: asBool(s.ativo) ? 1 : 0,
        }));

        try {
            setMsg(null);
            await apiPOST({
                action: "fluxo_steps_set",
                fluxo_nome: fluxoNome,
                steps: finalSteps,
            });
            await loadInit();
            await loadFluxoSteps(fluxoNome);
            setMsg({ ok: true, text: "Fluxo salvo com sucesso." });
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao salvar fluxo." });
        }
    };

    const useSelectedNoInStep = (idx: number) => {
        if (!selectedNoId) {
            alert("Selecione um nó na árvore primeiro.");
            return;
        }
        setFluxoSteps((prev) =>
            prev.map((s, i) => (i === idx ? { ...s, no_id: selectedNoId } : s))
        );
    };

    const updateStep = (idx: number, patch: Partial<FluxoStep>) => {
        setFluxoSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    };

    return (
        <div className="p-6">
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Configuração do Catálogo</h1>
                    <p className="text-sm text-muted-foreground">
                        Crie menus/submenus em árvore, selecione produtos por nó e configure o Fluxo (“Próximo passo”).
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90" onClick={criarNoRaiz}>
                        + Menu (Raiz)
                    </button>

                    <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60" onClick={criarNoFilho} disabled={!selectedNoId}>
                        + Submenu (Filho)
                    </button>

                    <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60" onClick={renomearNo} disabled={!selectedNoId}>
                        Renomear
                    </button>

                    <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60" onClick={excluirNo} disabled={!selectedNoId}>
                        Excluir
                    </button>

                    <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60" onClick={loadInit} disabled={loading}>
                        {loading ? "Carregando…" : "Recarregar"}
                    </button>
                </div>
            </header>

            {msg && (
                <div
                    className={`mb-4 rounded-md border px-3 py-2 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
                        }`}
                >
                    {msg.text}
                </div>
            )}

            {/* ✅ NOVO: CONFIGURAÇÃO DO FLUXO */}
            <div className="mb-4 rounded-xl border bg-background p-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold">Fluxo (“Próximo passo”)</div>
                        <div className="text-xs text-muted-foreground">
                            Defina a sequência de nós que o catálogo vai seguir ao clicar em “Próximo passo”.
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            value={fluxoNome}
                            onChange={(e) => setFluxoNome(e.target.value)}
                            disabled={loading}
                        >
                            <option value="">— Selecione um fluxo —</option>
                            {fluxos.map((f) => (
                                <option key={f.fluxo_nome} value={f.fluxo_nome}>
                                    {f.fluxo_nome} ({toInt(f.total)})
                                </option>
                            ))}
                        </select>

                        <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={criarFluxo} type="button">
                            + Criar fluxo
                        </button>

                        <button
                            className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                            onClick={addStep}
                            type="button"
                            disabled={!fluxoNome}
                        >
                            + Step
                        </button>

                        <button
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
                            onClick={saveFluxo}
                            type="button"
                            disabled={!fluxoNome || fluxoLoading}
                        >
                            {fluxoLoading ? "Salvando…" : "Salvar fluxo"}
                        </button>
                    </div>
                </div>

                {!fluxoNome ? (
                    <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        Selecione um fluxo ou crie um novo.
                    </div>
                ) : (
                    <div className="mt-3 overflow-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/30 text-xs text-muted-foreground">
                                <tr>
                                    <th className="p-2 text-left w-[70px]">Ordem</th>
                                    <th className="p-2 text-left">Título</th>
                                    <th className="p-2 text-left w-[140px]">Nó</th>
                                    <th className="p-2 text-left w-[110px]">Obrigatório</th>
                                    <th className="p-2 text-left w-[120px]">Máx. seleção</th>
                                    <th className="p-2 text-left w-[90px]">Ativo</th>
                                    <th className="p-2 text-right w-[260px]">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fluxoSteps.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-3 text-sm text-muted-foreground">
                                            Nenhum step. Clique em “+ Step”.
                                        </td>
                                    </tr>
                                ) : (
                                    fluxoSteps
                                        .slice()
                                        .sort((a, b) => toInt(a.ordem) - toInt(b.ordem))
                                        .map((s, idx) => {
                                            const noLabel = s.no_id ? `#${s.no_id}` : "—";
                                            return (
                                                <tr key={`${idx}-${s.ordem}`} className="border-t">
                                                    <td className="p-2 font-mono">{idx + 1}</td>

                                                    <td className="p-2">
                                                        <input
                                                            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                                                            value={String(s.titulo ?? "")}
                                                            onChange={(e) => updateStep(idx, { titulo: e.target.value })}
                                                            placeholder={`Passo ${idx + 1}`}
                                                        />
                                                    </td>

                                                    <td className="p-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs text-muted-foreground">{noLabel}</span>
                                                            <button
                                                                type="button"
                                                                className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                                                                onClick={() => useSelectedNoInStep(idx)}
                                                                disabled={!selectedNoId}
                                                                title="Usar nó selecionado na árvore"
                                                            >
                                                                Usar nó selecionado
                                                            </button>
                                                        </div>
                                                    </td>

                                                    <td className="p-2">
                                                        <select
                                                            className="rounded-md border bg-background px-2 py-1 text-sm"
                                                            value={asBool(s.required) ? 1 : 0}
                                                            onChange={(e) => updateStep(idx, { required: toInt(e.target.value) })}
                                                        >
                                                            <option value={1}>Sim</option>
                                                            <option value={0}>Não</option>
                                                        </select>
                                                    </td>

                                                    <td className="p-2">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                                                            value={toInt(s.max_select, 1)}
                                                            onChange={(e) => updateStep(idx, { max_select: Math.max(1, toInt(e.target.value, 1)) })}
                                                        />
                                                    </td>

                                                    <td className="p-2">
                                                        <select
                                                            className="rounded-md border bg-background px-2 py-1 text-sm"
                                                            value={asBool(s.ativo) ? 1 : 0}
                                                            onChange={(e) => updateStep(idx, { ativo: toInt(e.target.value) })}
                                                        >
                                                            <option value={1}>Ativo</option>
                                                            <option value={0}>Inativo</option>
                                                        </select>
                                                    </td>

                                                    <td className="p-2">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                                                                onClick={() => moveStep(idx, -1)}
                                                                disabled={idx === 0}
                                                                type="button"
                                                                title="Subir"
                                                            >
                                                                ↑
                                                            </button>
                                                            <button
                                                                className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                                                                onClick={() => moveStep(idx, 1)}
                                                                disabled={idx === fluxoSteps.length - 1}
                                                                type="button"
                                                                title="Descer"
                                                            >
                                                                ↓
                                                            </button>
                                                            <button
                                                                className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                                                onClick={() => removeStepLocal(idx)}
                                                                type="button"
                                                                title="Remover"
                                                            >
                                                                Remover
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                )}
                            </tbody>
                        </table>

                        <div className="p-2 text-xs text-muted-foreground">
                            Dica: selecione um nó na árvore (esquerda) e clique em <b>“Usar nó selecionado”</b> no step desejado.
                        </div>
                    </div>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
                {/* ÁRVORE */}
                <div className="rounded-xl border bg-background p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">Menus e Submenus</div>
                        <div className="flex items-center gap-2">
                            <button className="rounded-md border px-2 py-1 text-xs hover:bg-muted" onClick={expandAll} title="Expandir tudo" type="button">
                                Expandir
                            </button>
                            <button className="rounded-md border px-2 py-1 text-xs hover:bg-muted" onClick={collapseAll} title="Encolher tudo" type="button">
                                Encolher
                            </button>
                        </div>
                    </div>

                    {tree.length === 0 && !loading ? (
                        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum menu criado ainda.</div>
                    ) : null}

                    <div className="max-h-[72vh] overflow-auto pr-1">
                        {tree.map((n: any) => (
                            <NodeItem key={n.id} node={n} depth={0} selectedId={selectedNoId} onSelect={onSelectNo} expanded={expanded} toggleExpand={toggleExpand} />
                        ))}
                    </div>

                    <div className="mt-3 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                        Nó selecionado: <span className="font-mono font-semibold">{selectedNoId ? `#${selectedNoId}` : "—"}</span>
                        {selectedNoId && selectedNodeName ? (
                            <>
                                {" "}
                                • <span className="font-semibold">{selectedNodeName}</span>
                            </>
                        ) : null}
                    </div>
                </div>

                {/* PRODUTOS DO NÓ / BUSCA ESTOQUE */}
                <div className="rounded-xl border bg-background p-3 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-sm font-semibold">Produtos deste menu/submenu</div>
                            <div className="text-xs text-muted-foreground">Busque no estoque, marque os produtos e clique em “Salvar produtos”.</div>
                        </div>

                        <button
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
                            onClick={salvarProdutosNo}
                            disabled={!selectedNoId}
                            type="button"
                        >
                            Salvar produtos
                        </button>
                    </div>

                    {!selectedNoId ? (
                        <div className="mt-4 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                            Selecione um menu/submenu na esquerda para editar os produtos.
                        </div>
                    ) : (
                        <>
                            {/* Busca + filtros */}
                            <div className="mt-4 grid gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex flex-1 items-center gap-2 rounded-md border px-3 py-2">
                                        <input
                                            className="w-full bg-transparent text-sm outline-none"
                                            placeholder="Pesquisar: Nome, código, depósito, categoria, fabricante, classificação..."
                                            value={q}
                                            onChange={(e) => setQ(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") buscarEstoque();
                                            }}
                                        />
                                        <button
                                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                                            onClick={buscarEstoque}
                                            disabled={estoqueLoading}
                                            type="button"
                                        >
                                            {estoqueLoading ? "..." : "Buscar"}
                                        </button>
                                    </div>

                                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                                        Selecionados: <span className="font-mono">{selectedProdutoIds.size}</span>
                                    </div>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                    {/* Depósito */}
                                    <label className="grid gap-1 text-xs">
                                        <span className="text-muted-foreground">Depósito</span>
                                        <select
                                            className="rounded-md border bg-background px-3 py-2 text-sm"
                                            value={fDeposito}
                                            onChange={(e) => setFDeposito(toInt(e.target.value))}
                                        >
                                            <option value={0}>Todos</option>
                                            {depositos.map((o) => (
                                                <option key={o.id} value={o.id}>
                                                    {o.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    {/* Categoria */}
                                    <label className="grid gap-1 text-xs">
                                        <span className="text-muted-foreground">Categoria</span>
                                        <select
                                            className="rounded-md border bg-background px-3 py-2 text-sm"
                                            value={fCategoria}
                                            onChange={(e) => setFCategoria(toInt(e.target.value))}
                                        >
                                            <option value={0}>Todas</option>
                                            {categorias.map((o) => (
                                                <option key={o.id} value={o.id}>
                                                    {o.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    {/* Fabricante */}
                                    <label className="grid gap-1 text-xs">
                                        <span className="text-muted-foreground">Fabricante</span>
                                        <select
                                            className="rounded-md border bg-background px-3 py-2 text-sm"
                                            value={fFabricante}
                                            onChange={(e) => setFFabricante(toInt(e.target.value))}
                                        >
                                            <option value={0}>Todos</option>
                                            {fabricantes.map((o) => (
                                                <option key={o.id} value={o.id}>
                                                    {o.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    {/* Classificação */}
                                    <label className="grid gap-1 text-xs">
                                        <span className="text-muted-foreground">Classificação</span>
                                        <select
                                            className="rounded-md border bg-background px-3 py-2 text-sm"
                                            value={fClassificacao}
                                            onChange={(e) => setFClassificacao(toInt(e.target.value))}
                                        >
                                            <option value={0}>Todas</option>
                                            {classificacoes.map((o) => (
                                                <option key={o.id} value={o.id}>
                                                    {o.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={clearFilters} type="button">
                                        Limpar filtros
                                    </button>

                                    <button
                                        className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
                                        onClick={buscarEstoque}
                                        type="button"
                                        disabled={estoqueLoading}
                                    >
                                        Aplicar filtros
                                    </button>
                                </div>
                            </div>

                            {/* Lista estoque */}
                            <div className="mt-3 grid gap-2">
                                {estoqueRows.length === 0 ? (
                                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                        Faça uma busca para listar produtos do estoque.
                                    </div>
                                ) : (
                                    <div className="max-h-[48vh] overflow-auto rounded-md border">
                                        {estoqueRows.map((p) => {
                                            const pid = toInt(p.id);
                                            const checked = selectedProdutoIds.has(pid);

                                            return (
                                                <label key={pid} className="flex cursor-pointer items-start gap-3 border-b p-3 last:border-b-0 hover:bg-muted/30">
                                                    <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggleProduto(pid)} />

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="break-words font-medium">{p.nome}</div>
                                                            <div className="text-[11px] font-mono text-muted-foreground">#{pid}</div>
                                                        </div>

                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {p.deposito_nome ? <>Depósito: {p.deposito_nome}</> : null}
                                                            {p.categoria_nome ? <>{p.deposito_nome ? " • " : ""}Categoria: {p.categoria_nome}</> : null}
                                                            {p.fabricante_nome ? <> • Fabricante: {p.fabricante_nome}</> : null}
                                                            {p.classificacao_nome ? <> • Classificação: {p.classificacao_nome}</> : null}
                                                            {p.codigo_barras ? (
                                                                <>
                                                                    {" "}
                                                                    • CB: <span className="font-mono">{p.codigo_barras}</span>
                                                                </>
                                                            ) : null}
                                                        </div>

                                                        {p.descricao ? (
                                                            <div className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{p.descricao}</div>
                                                        ) : null}
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Produtos já vinculados (visão rápida) */}
                            <div className="mt-4 rounded-md border bg-muted/20 p-3">
                                <div className="text-sm font-medium">Já no menu/submenu</div>
                                <div className="mt-2 text-sm text-muted-foreground">
                                    {(noProdutos?.length ?? 0) === 0 ? (
                                        "Nenhum produto vinculado ainda."
                                    ) : (
                                        <ul className="list-disc pl-5">
                                            {noProdutos.slice(0, 12).map((p) => (
                                                <li key={p.id} className="break-words">
                                                    {p.nome}
                                                </li>
                                            ))}
                                            {noProdutos.length > 12 ? (
                                                <li className="mt-1 list-none text-xs text-muted-foreground">+{noProdutos.length - 12} outros…</li>
                                            ) : null}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}