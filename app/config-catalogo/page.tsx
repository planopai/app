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

    // combos (se seu backend ainda não tiver, a UI funciona com "Todos/Todas")
    const [depositos, setDepositos] = useState<Option[]>([]);
    const [categorias, setCategorias] = useState<Option[]>([]);
    const [fabricantes, setFabricantes] = useState<Option[]>([]);
    const [classificacoes, setClassificacoes] = useState<Option[]>([]);

    const [fDeposito, setFDeposito] = useState<number>(0);
    const [fCategoria, setFCategoria] = useState<number>(0);
    const [fFabricante, setFFabricante] = useState<number>(0);
    const [fClassificacao, setFClassificacao] = useState<number>(0);

    const loadInit = useCallback(async () => {
        setMsg(null);
        setLoading(true);
        try {
            const res = await apiGET({ init: 1 });
            if (!res) return;

            const raw = Array.isArray(res.nos) ? res.nos : [];
            setNodes(raw);

            // ✅ se o PHP retornar listas (opcional), preenche; senão fica vazio e a UI continua
            const optMap = (arr: any): Option[] =>
                Array.isArray(arr) ? arr.map((x) => ({ id: toInt(x.id), nome: String(x.nome ?? x.descricao ?? "") })) : [];

            setDepositos(optMap(res.depositos));
            setCategorias(optMap(res.categorias));
            setFabricantes(optMap(res.fabricantes));
            setClassificacoes(optMap(res.classificacoes));

            // dica: expandir automaticamente raízes ao abrir
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

            // garante que o caminho (e o próprio) fique expandido
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
            // ✅ IMPORTANTE:
            // Seu PHP precisa aceitar esses params:
            // deposito_id, categoria_id, fabricante_id, classificacao_id
            // (se não aceitar ainda, ele vai ignorar e a busca vai vir sem filtrar)
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

    return (
        <div className="p-6">
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Configuração do Catálogo</h1>
                    <p className="text-sm text-muted-foreground">
                        Crie menus/submenus em árvore e selecione produtos do estoque para cada item.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                        onClick={criarNoRaiz}
                    >
                        + Menu (Raiz)
                    </button>

                    <button
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                        onClick={criarNoFilho}
                        disabled={!selectedNoId}
                    >
                        + Submenu (Filho)
                    </button>

                    <button
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                        onClick={renomearNo}
                        disabled={!selectedNoId}
                    >
                        Renomear
                    </button>

                    <button
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                        onClick={excluirNo}
                        disabled={!selectedNoId}
                    >
                        Excluir
                    </button>

                    <button
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                        onClick={loadInit}
                        disabled={loading}
                    >
                        {loading ? "Carregando…" : "Recarregar"}
                    </button>
                </div>
            </header>

            {msg && (
                <div
                    className={`mb-4 rounded-md border px-3 py-2 text-sm ${msg.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-800"
                        }`}
                >
                    {msg.text}
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
                {/* ÁRVORE */}
                <div className="rounded-xl border bg-background p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">Menus e Submenus</div>
                        <div className="flex items-center gap-2">
                            <button className="rounded-md border px-2 py-1 text-xs hover:bg-muted" onClick={expandAll} title="Expandir tudo">
                                Expandir
                            </button>
                            <button className="rounded-md border px-2 py-1 text-xs hover:bg-muted" onClick={collapseAll} title="Encolher tudo">
                                Encolher
                            </button>
                        </div>
                    </div>

                    {tree.length === 0 && !loading ? (
                        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                            Nenhum menu criado ainda.
                        </div>
                    ) : null}

                    <div className="max-h-[72vh] overflow-auto pr-1">
                        {tree.map((n: any) => (
                            <NodeItem
                                key={n.id}
                                node={n}
                                depth={0}
                                selectedId={selectedNoId}
                                onSelect={onSelectNo}
                                expanded={expanded}
                                toggleExpand={toggleExpand}
                            />
                        ))}
                    </div>

                    <div className="mt-3 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                        Nó selecionado:{" "}
                        <span className="font-mono font-semibold">{selectedNoId ? `#${selectedNoId}` : "—"}</span>
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
                            <div className="text-xs text-muted-foreground">
                                Busque no estoque, marque os produtos e clique em “Salvar produtos”.
                            </div>
                        </div>

                        <button
                            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
                            onClick={salvarProdutosNo}
                            disabled={!selectedNoId}
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
                                    <button
                                        className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
                                        onClick={clearFilters}
                                        type="button"
                                    >
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
                                                <label
                                                    key={pid}
                                                    className="flex cursor-pointer items-start gap-3 border-b p-3 last:border-b-0 hover:bg-muted/30"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="mt-1"
                                                        checked={checked}
                                                        onChange={() => toggleProduto(pid)}
                                                    />

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
                                                            <div className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                                                {p.descricao}
                                                            </div>
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
                                                <li className="mt-1 list-none text-xs text-muted-foreground">
                                                    +{noProdutos.length - 12} outros…
                                                </li>
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