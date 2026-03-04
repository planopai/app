"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = "https://api.planoassistencialintegrado.com.br/catalogo_api.php";

type No = {
    id: number;
    parent_id: number | null;
    nome: string;
    ordem: number;
    ativo: number;
};

type Produto = {
    id: number;
    nome: string;
    codigo_barras?: string | null;
    valor?: number | string | null;
    foto_url?: string | null;
    categoria_nome?: string | null;
    classificacao_nome?: string | null;
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
    const map = new Map<number, (No & { children: No[] })>();
    nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));
    const roots: Array<No & { children: No[] }> = [];
    map.forEach((n) => {
        if (n.parent_id && map.has(n.parent_id)) {
            map.get(n.parent_id)!.children.push(n as any);
        } else {
            roots.push(n);
        }
    });

    const sortRec = (arr: any[]) => {
        arr.sort((a, b) => (toInt(a.ordem) - toInt(b.ordem)) || String(a.nome).localeCompare(String(b.nome)));
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
}: {
    node: No & { children: any[] };
    depth: number;
    selectedId: number | null;
    onSelect: (id: number) => void;
}) {
    const isSel = selectedId === node.id;
    return (
        <div>
            <button
                type="button"
                className={`w-full text-left rounded-md px-2 py-2 text-sm hover:bg-muted/40 ${isSel ? "bg-muted font-semibold" : ""
                    }`}
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => onSelect(node.id)}
            >
                <div className="flex items-center gap-2">
                    <span className={`inline-flex h-2 w-2 rounded-full ${asBool(node.ativo) ? "bg-emerald-500" : "bg-slate-300"}`} />
                    <span className="truncate">{node.nome}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground font-mono">{node.id}</span>
                </div>
            </button>

            {node.children?.length ? (
                <div className="mt-1">
                    {node.children.map((ch: any) => (
                        <NodeItem
                            key={ch.id}
                            node={ch}
                            depth={depth + 1}
                            selectedId={selectedId}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default function CatalogoRegrasConfigPage() {
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const [nodes, setNodes] = useState<No[]>([]);
    const tree = useMemo(() => buildTree(nodes), [nodes]);

    const [selectedNoId, setSelectedNoId] = useState<number | null>(null);

    // produtos já vinculados ao nó
    const [noProdutos, setNoProdutos] = useState<Produto[]>([]);
    const [selectedProdutoIds, setSelectedProdutoIds] = useState<Set<number>>(new Set());

    // busca no estoque
    const [q, setQ] = useState("");
    const [estoqueLoading, setEstoqueLoading] = useState(false);
    const [estoqueRows, setEstoqueRows] = useState<Produto[]>([]);

    const loadInit = useCallback(async () => {
        setMsg(null);
        setLoading(true);
        try {
            // backend deve retornar: { ok:true, nos:[...] }
            const res = await apiGET({ init: 1 });
            if (!res) return;
            setNodes(Array.isArray(res.nos) ? res.nos : []);
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
        },
        [loadNoProdutos]
    );

    const criarNoRaiz = async () => {
        const nome = prompt("Nome do menu (raiz):");
        if (!nome) return;

        try {
            setMsg(null);
            await apiPOST({ action: "no_criar", parent_id: null, nome: nome.trim(), ordem: 0, ativo: 1 });
            await loadInit();
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
            await apiPOST({ action: "no_criar", parent_id: selectedNoId, nome: nome.trim(), ordem: 0, ativo: 1 });
            await loadInit();
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
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao renomear." });
        }
    };

    const excluirNo = async () => {
        if (!selectedNoId) return;
        const ok = confirm("Excluir este nó? (pode excluir filhos também dependendo da regra do backend)");
        if (!ok) return;

        try {
            setMsg(null);
            await apiPOST({ action: "no_excluir", id: selectedNoId });
            setSelectedNoId(null);
            setNoProdutos([]);
            setSelectedProdutoIds(new Set());
            await loadInit();
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao excluir." });
        }
    };

    const buscarEstoque = async () => {
        if (!selectedNoId) {
            alert("Selecione um menu/submenu antes de buscar produtos.");
            return;
        }

        setEstoqueLoading(true);
        try {
            // backend deve retornar: { ok:true, rows:[...] }
            const res = await apiGET({
                estoque_buscar: 1,
                q: q.trim(),
                limit: 80,
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
                    <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90" onClick={criarNoRaiz}>
                        + Menu (Raiz)
                    </button>

                    <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={criarNoFilho} disabled={!selectedNoId}>
                        + Submenu (Filho)
                    </button>

                    <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={renomearNo} disabled={!selectedNoId}>
                        Renomear
                    </button>

                    <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={excluirNo} disabled={!selectedNoId}>
                        Excluir
                    </button>

                    <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={loadInit} disabled={loading}>
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

            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                {/* ÁRVORE */}
                <div className="rounded-xl border bg-background p-3 shadow-sm">
                    <div className="mb-2 text-sm font-semibold">Menus e Submenus</div>

                    {tree.length === 0 && !loading ? (
                        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                            Nenhum menu criado ainda.
                        </div>
                    ) : null}

                    <div className="max-h-[70vh] overflow-auto pr-1">
                        {tree.map((n: any) => (
                            <NodeItem key={n.id} node={n} depth={0} selectedId={selectedNoId} onSelect={onSelectNo} />
                        ))}
                    </div>

                    <div className="mt-3 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                        Nó selecionado:{" "}
                        <span className="font-mono font-semibold">{selectedNoId ? String(selectedNoId) : "—"}</span>
                    </div>
                </div>

                {/* PRODUTOS DO NÓ / BUSCA ESTOQUE */}
                <div className="rounded-xl border bg-background p-3 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-sm font-semibold">Produtos deste menu/submenu</div>
                            <div className="text-xs text-muted-foreground">
                                Selecione no estoque (checkbox) e clique em “Salvar”.
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
                            {/* Busca estoque */}
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                                    <input
                                        className="w-[320px] max-w-[70vw] bg-transparent text-sm outline-none"
                                        placeholder="Buscar no estoque: nome, código de barras..."
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

                                <div className="text-xs text-muted-foreground">
                                    Selecionados: <span className="font-mono">{selectedProdutoIds.size}</span>
                                </div>
                            </div>

                            {/* Lista estoque */}
                            <div className="mt-3 grid gap-2">
                                {estoqueRows.length === 0 ? (
                                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                        Faça uma busca para listar produtos do estoque.
                                    </div>
                                ) : (
                                    <div className="max-h-[52vh] overflow-auto rounded-md border">
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
                                                            <div className="font-medium break-words">{p.nome}</div>
                                                            <div className="text-[11px] text-muted-foreground font-mono">#{pid}</div>
                                                        </div>

                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {p.categoria_nome ? <>Categoria: {p.categoria_nome}</> : null}
                                                            {p.classificacao_nome ? <> • Sub: {p.classificacao_nome}</> : null}
                                                            {p.codigo_barras ? <> • CB: <span className="font-mono">{p.codigo_barras}</span></> : null}
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Produtos já vinculados (apenas visão rápida) */}
                            <div className="mt-4 rounded-md border bg-muted/20 p-3">
                                <div className="text-sm font-medium">Já no menu/submenu</div>
                                <div className="mt-2 text-sm text-muted-foreground">
                                    {(noProdutos?.length ?? 0) === 0 ? (
                                        "Nenhum produto vinculado ainda."
                                    ) : (
                                        <ul className="list-disc pl-5">
                                            {noProdutos.slice(0, 12).map((p) => (
                                                <li key={p.id} className="break-words">{p.nome}</li>
                                            ))}
                                            {noProdutos.length > 12 ? (
                                                <li className="list-none text-xs text-muted-foreground mt-1">
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