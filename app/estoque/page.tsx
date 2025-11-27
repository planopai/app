"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type SubItem = {
    id: number | string;
    item_id: number | string;
    nome: string;
    ativo: number | boolean;
    ordem: number | string;
    criado_em?: string | null;
    atualizado_em?: string | null;
};

type Item = {
    id: number | string;
    categoria_id: number | string;
    nome: string;
    ativo: number | boolean;
    ordem: number | string;
    criado_em?: string | null;
    atualizado_em?: string | null;
    subitens?: SubItem[];
};

type Categoria = {
    id: number | string;
    nome: string;
    ativo: number | boolean;
    ordem: number | string;
    criado_em?: string | null;
    atualizado_em?: string | null;
    itens?: Item[];
};

type ApiOk<T> = { sucesso: 1; data?: T; msg?: string; id?: number; need_login?: 0 };
type ApiErr = { erro: 1; msg?: string; need_login?: 1 };

function asBool(v: any) {
    return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
}
function toIntOr0(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

type ModalModel =
    | { open: false }
    | {
        open: true;
        kind: "categoria" | "item" | "subitem";
        mode: "create" | "edit";
        id?: number | string;
        categoria_id?: number | string;
        item_id?: number | string;
        nome: string;
        ordem: number;
        ativo: boolean;
    };

// ✅ MUDE APENAS ISTO se seu PHP tiver outro nome
const PHP_FILE = "materiais_admin.php";
// ✅ tudo via proxy: app/api/php/[...path]/route.ts
const PROXY_BASE = "/api/php";

export default function MateriaisAdminPage() {
    const [showInativos, setShowInativos] = useState(false);
    const [loading, setLoading] = useState(false);
    const [tree, setTree] = useState<Categoria[]>([]);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [modal, setModal] = useState<ModalModel>({ open: false });

    // ✅ NOVO: seleção/visualização por categoria + busca
    const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
    const [catQuery, setCatQuery] = useState("");

    const endpoint = useMemo(() => `${PROXY_BASE}/${PHP_FILE}`, []);

    const apiJSON = useCallback(
        async (op: string, body?: any, method: "GET" | "POST" = "POST") => {
            const url = new URL(endpoint, window.location.origin);
            url.searchParams.set("op", op);
            url.searchParams.set("_nocache", String(Date.now()));

            const init: RequestInit = {
                method,
                credentials: "include",
                cache: "no-store",
                headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
                body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
            };

            const r = await fetch(url.toString(), init);
            const json = (await r.json().catch(() => null)) as (ApiOk<any> | ApiErr | null);

            if (!json) throw new Error("Resposta inválida do servidor.");
            if ((json as any)?.need_login) {
                window.location.href = "/login";
                return null;
            }
            if (!r.ok || (json as any)?.erro) {
                throw new Error((json as any)?.msg || "Erro no servidor.");
            }
            return json as ApiOk<any>;
        },
        [endpoint]
    );

    const loadTree = useCallback(async () => {
        setMsg(null);
        setLoading(true);
        try {
            const url = new URL(endpoint, window.location.origin);
            url.searchParams.set("op", "list");
            url.searchParams.set("all", showInativos ? "1" : "0");
            url.searchParams.set("_nocache", String(Date.now()));

            const r = await fetch(url.toString(), {
                method: "GET",
                credentials: "include",
                cache: "no-store",
            });

            const json = (await r.json().catch(() => null)) as (ApiOk<Categoria[]> | ApiErr | null);
            if (!json) throw new Error("Resposta inválida do servidor.");
            if ((json as any)?.need_login) {
                window.location.href = "/login";
                return;
            }
            if (!r.ok || (json as any)?.erro) throw new Error((json as any)?.msg || "Erro ao listar.");

            const data = (json as ApiOk<Categoria[]>)?.data ?? [];
            const sane = (Array.isArray(data) ? data : []).map((c) => ({
                ...c,
                itens: (c.itens ?? []).map((i) => ({ ...i, subitens: i.subitens ?? [] })),
            }));

            setTree(sane);

            // ✅ mantém seleção coerente (se deletou a categoria selecionada)
            setSelectedCatId((prev) => {
                if (!prev) return sane[0]?.id != null ? String(sane[0].id) : null;
                const exists = sane.some((c) => String(c.id) === String(prev));
                return exists ? prev : sane[0]?.id != null ? String(sane[0].id) : null;
            });
        } catch (e: any) {
            setTree([]);
            setSelectedCatId(null);
            setMsg({ ok: false, text: e?.message || "Falha ao carregar." });
        } finally {
            setLoading(false);
        }
    }, [endpoint, showInativos]);

    useEffect(() => {
        loadTree();
    }, [loadTree]);

    // ---------- Modais ----------
    const openCreateCategoria = () =>
        setModal({ open: true, kind: "categoria", mode: "create", nome: "", ordem: 0, ativo: true });

    const openEditCategoria = (c: Categoria) =>
        setModal({
            open: true,
            kind: "categoria",
            mode: "edit",
            id: c.id,
            nome: String(c.nome ?? ""),
            ordem: toIntOr0(c.ordem),
            ativo: asBool(c.ativo),
        });

    const openCreateItem = (categoria_id: Categoria["id"]) =>
        setModal({ open: true, kind: "item", mode: "create", categoria_id, nome: "", ordem: 0, ativo: true });

    const openEditItem = (i: Item) =>
        setModal({
            open: true,
            kind: "item",
            mode: "edit",
            id: i.id,
            categoria_id: i.categoria_id,
            nome: String(i.nome ?? ""),
            ordem: toIntOr0(i.ordem),
            ativo: asBool(i.ativo),
        });

    const openCreateSub = (item_id: Item["id"]) =>
        setModal({ open: true, kind: "subitem", mode: "create", item_id, nome: "", ordem: 0, ativo: true });

    const openEditSub = (s: SubItem) =>
        setModal({
            open: true,
            kind: "subitem",
            mode: "edit",
            id: s.id,
            item_id: s.item_id,
            nome: String(s.nome ?? ""),
            ordem: toIntOr0(s.ordem),
            ativo: asBool(s.ativo),
        });

    // ---------- Deletes ----------
    const removeCategoria = async (id: Categoria["id"]) => {
        if (!window.confirm("Excluir a categoria? (itens/subitens serão apagados também)")) return;
        setMsg(null);
        try {
            await apiJSON("categoria_delete", { id });
            setMsg({ ok: true, text: "Categoria excluída." });
            await loadTree();
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao excluir categoria." });
        }
    };

    const removeItem = async (id: Item["id"]) => {
        if (!window.confirm("Excluir o item? (subitens serão apagados também)")) return;
        setMsg(null);
        try {
            await apiJSON("item_delete", { id });
            setMsg({ ok: true, text: "Item excluído." });
            await loadTree();
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao excluir item." });
        }
    };

    const removeSub = async (id: SubItem["id"]) => {
        if (!window.confirm("Excluir o subitem?")) return;
        setMsg(null);
        try {
            await apiJSON("subitem_delete", { id });
            setMsg({ ok: true, text: "Subitem excluído." });
            await loadTree();
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao excluir subitem." });
        }
    };

    // ---------- Save ----------
    const saveModal = async () => {
        if (!modal.open) return;
        const nome = modal.nome.trim();
        if (!nome) {
            setMsg({ ok: false, text: "Informe o nome." });
            return;
        }

        setMsg(null);
        try {
            if (modal.kind === "categoria") {
                if (modal.mode === "create") {
                    const r = await apiJSON("categoria_create", { nome, ativo: modal.ativo, ordem: modal.ordem });
                    setMsg({ ok: true, text: "Categoria criada." });

                    // ✅ seleciona a categoria recém-criada, se vier id
                    const newId = (r as any)?.id;
                    if (newId != null) setSelectedCatId(String(newId));
                } else {
                    await apiJSON("categoria_update", { id: modal.id, nome, ativo: modal.ativo, ordem: modal.ordem });
                    setMsg({ ok: true, text: "Categoria atualizada." });
                }
            }

            if (modal.kind === "item") {
                if (modal.mode === "create") {
                    await apiJSON("item_create", {
                        categoria_id: modal.categoria_id,
                        nome,
                        ativo: modal.ativo,
                        ordem: modal.ordem,
                    });
                    setMsg({ ok: true, text: "Item criado." });
                } else {
                    await apiJSON("item_update", {
                        id: modal.id,
                        categoria_id: modal.categoria_id,
                        nome,
                        ativo: modal.ativo,
                        ordem: modal.ordem,
                    });
                    setMsg({ ok: true, text: "Item atualizado." });
                }
            }

            if (modal.kind === "subitem") {
                if (modal.mode === "create") {
                    await apiJSON("subitem_create", {
                        item_id: modal.item_id,
                        nome,
                        ativo: modal.ativo,
                        ordem: modal.ordem,
                    });
                    setMsg({ ok: true, text: "Subitem criado." });
                } else {
                    await apiJSON("subitem_update", {
                        id: modal.id,
                        item_id: modal.item_id,
                        nome,
                        ativo: modal.ativo,
                        ordem: modal.ordem,
                    });
                    setMsg({ ok: true, text: "Subitem atualizado." });
                }
            }

            setModal({ open: false });
            await loadTree();
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || "Erro ao salvar." });
        }
    };

    // ---------- Stats / Selected ----------
    const stats = useMemo(() => {
        const cats = tree.length;
        let itens = 0;
        let subs = 0;
        tree.forEach((c) => {
            itens += c.itens?.length ?? 0;
            c.itens?.forEach((i) => (subs += i.subitens?.length ?? 0));
        });
        return { cats, itens, subs };
    }, [tree]);

    const filteredCats = useMemo(() => {
        const q = catQuery.trim().toLowerCase();
        if (!q) return tree;
        return tree.filter((c) => String(c.nome ?? "").toLowerCase().includes(q));
    }, [tree, catQuery]);

    const selectedCat = useMemo(() => {
        if (!selectedCatId) return null;
        return tree.find((c) => String(c.id) === String(selectedCatId)) ?? null;
    }, [tree, selectedCatId]);

    // Se o filtro removeu a categoria selecionada da lista, seleciona a primeira do filtro
    useEffect(() => {
        if (!filteredCats.length) return;
        if (!selectedCatId) {
            setSelectedCatId(String(filteredCats[0].id));
            return;
        }
        const existsInFilter = filteredCats.some((c) => String(c.id) === String(selectedCatId));
        if (!existsInFilter) setSelectedCatId(String(filteredCats[0].id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [catQuery, filteredCats.length]);

    return (
        <div className="p-6">
            <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Administração de Materiais</h1>
                    <p className="text-sm text-muted-foreground">
                        Categorias, itens e subitens ({stats.cats} / {stats.itens} / {stats.subs})
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Proxy: <span className="font-mono">{endpoint}</span>
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <input type="checkbox" checked={showInativos} onChange={(e) => setShowInativos(e.target.checked)} />
                        Mostrar inativos
                    </label>

                    <button
                        className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
                        onClick={loadTree}
                        disabled={loading}
                    >
                        {loading ? "Carregando…" : "Recarregar"}
                    </button>

                    <button
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                        onClick={openCreateCategoria}
                    >
                        + Categoria
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

            {/* ✅ NOVO LAYOUT: sidebar de categorias + detalhe */}
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                {/* Sidebar */}
                <aside className="rounded-xl border bg-background p-3 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">Categorias</div>
                        <div className="text-xs text-muted-foreground">{filteredCats.length}</div>
                    </div>

                    <input
                        className="mb-3 w-full rounded-md border px-3 py-2 text-sm"
                        placeholder="Buscar categoria..."
                        value={catQuery}
                        onChange={(e) => setCatQuery(e.target.value)}
                    />

                    <div className="max-h-[70vh] overflow-auto pr-1">
                        {filteredCats.length === 0 ? (
                            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Nenhuma categoria.</div>
                        ) : (
                            <div className="grid gap-2">
                                {filteredCats.map((c) => {
                                    const active = String(c.id) === String(selectedCatId);
                                    const itensCount = c.itens?.length ?? 0;
                                    const subsCount =
                                        c.itens?.reduce((acc, i) => acc + (i.subitens?.length ?? 0), 0) ?? 0;

                                    return (
                                        <button
                                            key={String(c.id)}
                                            onClick={() => setSelectedCatId(String(c.id))}
                                            className={[
                                                "w-full rounded-lg border px-3 py-2 text-left transition",
                                                active ? "border-primary bg-primary/5" : "hover:bg-muted",
                                            ].join(" ")}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`inline-flex h-2.5 w-2.5 rounded-full ${asBool(c.ativo) ? "bg-emerald-500" : "bg-slate-300"
                                                            }`}
                                                    />
                                                    <span className="text-sm font-medium">{c.nome}</span>
                                                </div>
                                                <span className="text-[11px] text-muted-foreground">
                                                    {itensCount}/{subsCount}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                ID: <span className="font-mono">{String(c.id)}</span> • Ordem:{" "}
                                                <span className="font-mono">{String(c.ordem ?? 0)}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="mt-3 grid gap-2">
                        <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={openCreateCategoria}>
                            + Nova categoria
                        </button>
                    </div>
                </aside>

                {/* Detalhe */}
                <section className="min-h-[200px]">
                    {!selectedCat ? (
                        <div className="rounded-xl border bg-background p-6 text-sm text-muted-foreground">
                            Selecione uma categoria à esquerda.
                        </div>
                    ) : (
                        <div key={String(selectedCat.id)} className="rounded-xl border bg-background p-4 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-[240px]">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`inline-flex h-2.5 w-2.5 rounded-full ${asBool(selectedCat.ativo) ? "bg-emerald-500" : "bg-slate-300"
                                                }`}
                                        />
                                        <h2 className="text-base font-semibold">{selectedCat.nome}</h2>
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        ID: <span className="font-mono">{String(selectedCat.id)}</span> • Ordem:{" "}
                                        <span className="font-mono">{String(selectedCat.ordem ?? 0)}</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
                                        onClick={() => openCreateItem(selectedCat.id)}
                                    >
                                        + Item
                                    </button>
                                    <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => openEditCategoria(selectedCat)}>
                                        Editar
                                    </button>
                                    <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => removeCategoria(selectedCat.id)}>
                                        Excluir
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 grid gap-2">
                                {(selectedCat.itens ?? []).length === 0 ? (
                                    <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Sem itens nesta categoria.</div>
                                ) : null}

                                {(selectedCat.itens ?? []).map((i) => (
                                    <div key={String(i.id)} className="rounded-lg border p-3">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${asBool(i.ativo) ? "bg-emerald-500" : "bg-slate-300"}`} />
                                                    <div className="font-medium">{i.nome}</div>
                                                </div>
                                                <div className="mt-1 text-[11px] text-muted-foreground">
                                                    Item ID: <span className="font-mono">{String(i.id)}</span> • Ordem:{" "}
                                                    <span className="font-mono">{String(i.ordem ?? 0)}</span>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => openCreateSub(i.id)}>
                                                    + Subitem
                                                </button>
                                                <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => openEditItem(i)}>
                                                    Editar
                                                </button>
                                                <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => removeItem(i.id)}>
                                                    Excluir
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-3 grid gap-2 pl-2">
                                            {(i.subitens ?? []).length === 0 ? (
                                                <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">Sem subitens.</div>
                                            ) : null}

                                            {(i.subitens ?? []).map((s) => (
                                                <div key={String(s.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                                                    <div className="flex min-w-[220px] items-center gap-2">
                                                        <span className={`inline-flex h-2.5 w-2.5 rounded-full ${asBool(s.ativo) ? "bg-emerald-500" : "bg-slate-300"}`} />
                                                        <div className="text-sm">{s.nome}</div>
                                                        <div className="text-[11px] text-muted-foreground">
                                                            (ordem: <span className="font-mono">{String(s.ordem ?? 0)}</span>)
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => openEditSub(s)}>
                                                            Editar
                                                        </button>
                                                        <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => removeSub(s.id)}>
                                                            Excluir
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {/* Modal */}
            {modal.open && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setModal({ open: false });
                    }}
                >
                    <div className="w-full max-w-lg rounded-xl bg-background p-4 shadow-xl">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold">
                                    {modal.mode === "create" ? "Criar" : "Editar"}{" "}
                                    {modal.kind === "categoria" ? "Categoria" : modal.kind === "item" ? "Item" : "Subitem"}
                                </h3>
                                <p className="text-xs text-muted-foreground">Preencha e clique em salvar.</p>
                            </div>
                            <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => setModal({ open: false })}>
                                Fechar
                            </button>
                        </div>

                        <div className="mt-4 grid gap-3">
                            <div>
                                <label className="mb-1 block text-sm font-medium">Nome</label>
                                <input
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    value={modal.nome}
                                    onChange={(e) => setModal((m) => (m.open ? { ...m, nome: e.target.value } : m))}
                                    placeholder="Ex: Urnas, Coroas, Etc..."
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium">Ordem</label>
                                    <input
                                        className="w-full rounded-md border px-3 py-2 text-sm"
                                        type="number"
                                        value={modal.ordem}
                                        onChange={(e) => setModal((m) => (m.open ? { ...m, ordem: toIntOr0(e.target.value) } : m))}
                                    />
                                </div>

                                <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={modal.ativo}
                                        onChange={(e) => setModal((m) => (m.open ? { ...m, ativo: e.target.checked } : m))}
                                    />
                                    Ativo
                                </label>
                            </div>

                            {modal.kind !== "categoria" ? (
                                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                                    {modal.kind === "item" ? (
                                        <>
                                            Categoria ID: <span className="font-mono">{String(modal.categoria_id)}</span>
                                        </>
                                    ) : (
                                        <>
                                            Item ID: <span className="font-mono">{String(modal.item_id)}</span>
                                        </>
                                    )}
                                </div>
                            ) : null}
                        </div>

                        <div className="mt-5 flex justify-end gap-2">
                            <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={() => setModal({ open: false })}>
                                Cancelar
                            </button>
                            <button
                                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
                                onClick={saveModal}
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
