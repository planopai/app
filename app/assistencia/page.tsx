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
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : 0;
}

/** converte valores “truthy” que vêm do PHP (1, "1", "true", "sim", "on", etc.) */
function boolish(v: any): boolean {
    if (v === true) return true;
    if (v === 1 || v === "1") return true;
    const s = String(v ?? "").trim().toLowerCase();
    return ["true", "1", "sim", "s", "yes", "y", "on"].includes(s);
}

/** pega possíveis nomes do campo "não conforme" */
function pickNc(obj: any): any {
    return obj?.nao_conforme ?? obj?.nao_conformes ?? obj?.naoConforme ?? obj?.naoConformes ?? obj?.nc ?? obj?.nao_conf ?? obj?.is_nao_conforme;
}

/** pega possíveis nomes do campo "ok" */
function pickOk(obj: any): any {
    return obj?.ok ?? obj?.is_ok ?? obj?.isOk ?? obj?.conforme ?? obj?.is_conforme;
}

/** pega possíveis nomes do total de itens no resumo */
function pickTotal(obj: any): any {
    return obj?.total_itens ?? obj?.itens_count ?? obj?.itensCount ?? obj?.total ?? obj?.count_itens;
}

/** pega possíveis nomes do total de não conformes no resumo */
function pickNcCount(obj: any): any {
    return obj?.nao_conformes ?? obj?.nc_count ?? obj?.ncCount ?? obj?.naoConformes;
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

/* =======================
   Conferências (Tipos)
   ======================= */
type ConferenciaRow = {
    id: number | string;
    registro_id: number | string;
    falecido_nome?: string | null;
    observacao?: string | null;
    usuario_nome?: string | null;
    criado_em?: string | null;

    // Front antigo
    nao_conformes?: number | string | null;
    total_itens?: number | string | null;

    // PHP atual (conferencia_list retorna isso)
    ok_count?: number | string | null;
    nc_count?: number | string | null;
    itens_count?: number | string | null;
};

type ConferenciaDetalhe = ConferenciaRow & {
    itens: Array<{
        id: number | string;
        conferencia_id: number | string;
        item_key: string;
        item_nome: string;
        qtd: number | string;
        ok: number | string;
        nao_conforme: number | string;
    }>;
};

type ConferenciaListResp = {
    rows: ConferenciaRow[];
};

/* =======================
   Ajustes
   ======================= */
const PHP_FILE = "materiais_admin.php";
const PROXY_BASE = "/api/php";

type ViewMode = "materiais" | "conferencias";

export default function MateriaisAdminPage() {
    const [showInativos, setShowInativos] = useState(false);
    const [loading, setLoading] = useState(false);
    const [tree, setTree] = useState<Categoria[]>([]);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [modal, setModal] = useState<ModalModel>({ open: false });

    // acordeão por categoria
    const [openCatId, setOpenCatId] = useState<string | null>(null);

    // modo da tela
    const [view, setView] = useState<ViewMode>("materiais");

    // Conferências
    const [confLoading, setConfLoading] = useState(false);
    const [confMsg, setConfMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [confQuery, setConfQuery] = useState("");
    const [confList, setConfList] = useState<ConferenciaRow[]>([]);
    const [confOpenId, setConfOpenId] = useState<string | null>(null);
    const [confDetail, setConfDetail] = useState<ConferenciaDetalhe | null>(null);

    // duplicação
    const [dupLoadingId, setDupLoadingId] = useState<string | null>(null);

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

    const apiGET = useCallback(
        async (op: string, params?: Record<string, any>) => {
            const url = new URL(endpoint, window.location.origin);
            url.searchParams.set("op", op);
            url.searchParams.set("_nocache", String(Date.now()));
            Object.entries(params ?? {}).forEach(([k, v]) => {
                if (v === undefined || v === null) return;
                url.searchParams.set(k, String(v));
            });

            const r = await fetch(url.toString(), {
                method: "GET",
                credentials: "include",
                cache: "no-store",
            });

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

    /* =======================
       Materiais: loadTree
       ======================= */
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

            setOpenCatId((prev) => {
                if (!prev) return null;
                const ok = sane.some((c) => String(c.id) === String(prev));
                return ok ? prev : null;
            });
        } catch (e: any) {
            setTree([]);
            setOpenCatId(null);
            setMsg({ ok: false, text: e?.message || "Falha ao carregar." });
        } finally {
            setLoading(false);
        }
    }, [endpoint, showInativos]);

    useEffect(() => {
        loadTree();
    }, [loadTree]);

    /* =======================
       Conferências: list/get
       ======================= */
    const loadConferencias = useCallback(async () => {
        setConfMsg(null);
        setConfLoading(true);
        try {
            const res = await apiGET("conferencia_list", {
                q: confQuery.trim() || "",
                limit: 80,
            });
            if (!res) return;

            const data = (res as ApiOk<ConferenciaListResp | ConferenciaRow[]>)?.data ?? { rows: [] };

            // aceita tanto {rows:[...]} quanto [...]
            const rows = Array.isArray((data as any)?.rows)
                ? (data as any).rows
                : Array.isArray(data)
                    ? (data as any)
                    : [];

            setConfList(rows as ConferenciaRow[]);
        } catch (e: any) {
            setConfList([]);
            setConfMsg({ ok: false, text: e?.message || "Falha ao carregar conferências." });
        } finally {
            setConfLoading(false);
        }
    }, [apiGET, confQuery]);

    const openConferencia = useCallback(
        async (id: number | string) => {
            const sid = String(id);
            setConfOpenId(sid);
            setConfDetail(null);
            setConfMsg(null);

            try {
                // ✅ CORREÇÃO: no PHP o op é "conferencia_detail" (não "conferencia_get")
                const res = await apiGET("conferencia_detail", { id: sid });
                if (!res) return;

                const data = (res as ApiOk<any>)?.data;
                if (!data) throw new Error("Detalhe inválido.");

                // PHP retorna: { conferencia: {...}, itens: [...] }
                // mas vamos aceitar também o formato antigo (detalhe direto com det.itens)
                const head = (data?.conferencia ?? data) as any;
                const rawItens = (data?.itens ?? head?.itens ?? []) as any[];

                const detalhe: ConferenciaDetalhe = {
                    id: head?.id ?? sid,
                    registro_id: head?.registro_id ?? head?.registro ?? "",
                    falecido_nome: head?.falecido_nome ?? null,
                    observacao: head?.observacao ?? head?.obs ?? null,
                    usuario_nome: head?.usuario_nome ?? null,
                    criado_em: head?.criado_em ?? null,

                    // mantém compatível com UI do resumo (se quiser usar depois)
                    nao_conformes: pickNcCount(head) ?? null,
                    total_itens: pickTotal(head) ?? null,

                    itens: Array.isArray(rawItens)
                        ? rawItens.map((it: any, idx: number) => {
                            const item_key = String(it?.item_key ?? it?.key ?? it?.chave ?? "");
                            const item_nome = String(it?.item_nome ?? it?.nome ?? it?.descricao ?? item_key ?? "");
                            const qtd = it?.qtd ?? it?.quantidade ?? 0;

                            // ok/nc podem vir com nomes diferentes
                            const okVal = pickOk(it) ?? it?.ok ?? 0;
                            const ncVal = pickNc(it) ?? it?.nao_conforme ?? 0;

                            return {
                                id: it?.id ?? `${sid}-${idx}`,
                                conferencia_id: it?.conferencia_id ?? sid,
                                item_key,
                                item_nome,
                                qtd,
                                ok: okVal,
                                nao_conforme: ncVal,
                            };
                        })
                        : [],
                };

                setConfDetail(detalhe);
            } catch (e: any) {
                setConfDetail(null);
                setConfMsg({ ok: false, text: e?.message || "Falha ao abrir conferência." });
            }
        },
        [apiGET]
    );

    useEffect(() => {
        if (view !== "conferencias") return;
        loadConferencias();
    }, [view, loadConferencias]);

    /* =======================
       CRUD Modals (Materiais)
       ======================= */
    const openCreateCategoria = () => setModal({ open: true, kind: "categoria", mode: "create", nome: "", ordem: 0, ativo: true });

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

    const openCreateSub = (item_id: Item["id"]) => setModal({ open: true, kind: "subitem", mode: "create", item_id, nome: "", ordem: 0, ativo: true });

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
                    const newId = (r as any)?.id;
                    if (newId != null) setOpenCatId(String(newId));
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
                    setOpenCatId(String(modal.categoria_id));
                } else {
                    await apiJSON("item_update", {
                        id: modal.id,
                        categoria_id: modal.categoria_id,
                        nome,
                        ativo: modal.ativo,
                        ordem: modal.ordem,
                    });
                    setMsg({ ok: true, text: "Item atualizado." });
                    setOpenCatId(String(modal.categoria_id));
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

    const toggleOpenCategory = (cid: string) => {
        setOpenCatId((prev) => (prev === cid ? null : cid));
    };

    /* =======================
       DUPLICAR CATEGORIA
       ======================= */
    const duplicateCategoria = useCallback(
        async (cat: Categoria) => {
            const cid = String(cat.id);
            if (dupLoadingId) return;

            const catName = String(cat.nome ?? "").trim() || "(sem nome)";
            const ok = window.confirm(`Duplicar a categoria "${catName}" com TODOS os itens e subitens?`);
            if (!ok) return;

            setMsg(null);
            setDupLoadingId(cid);

            try {
                const newCatName = `${catName} (cópia)`;

                const rCat = await apiJSON("categoria_create", {
                    nome: newCatName,
                    ativo: asBool(cat.ativo),
                    ordem: toIntOr0(cat.ordem),
                });

                const newCatId = (rCat as any)?.id;
                if (newCatId == null) {
                    throw new Error('API não retornou "id" ao criar a categoria duplicada.');
                }

                for (const it of cat.itens ?? []) {
                    const rItem = await apiJSON("item_create", {
                        categoria_id: newCatId,
                        nome: String(it.nome ?? "").trim(),
                        ativo: asBool(it.ativo),
                        ordem: toIntOr0(it.ordem),
                    });

                    const newItemId = (rItem as any)?.id;
                    if (newItemId == null) {
                        throw new Error(
                            `API não retornou "id" ao criar o item "${String(it.nome ?? "")}". ` +
                            `Para duplicar subitens, o endpoint item_create precisa retornar { id }.`
                        );
                    }

                    for (const sub of it.subitens ?? []) {
                        await apiJSON("subitem_create", {
                            item_id: newItemId,
                            nome: String(sub.nome ?? "").trim(),
                            ativo: asBool(sub.ativo),
                            ordem: toIntOr0(sub.ordem),
                        });
                    }
                }

                setMsg({ ok: true, text: `Categoria duplicada: "${newCatName}".` });
                setOpenCatId(String(newCatId));
                await loadTree();
            } catch (e: any) {
                setMsg({ ok: false, text: e?.message || "Erro ao duplicar categoria." });
            } finally {
                setDupLoadingId(null);
            }
        },
        [apiJSON, dupLoadingId, loadTree]
    );

    /* =======================
       Render
       ======================= */
    return (
        <div className="p-6">
            <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Administração de Materiais</h1>

                    {view === "materiais" ? (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Categorias, itens e subitens ({stats.cats} / {stats.itens} / {stats.subs})
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Proxy: <span className="font-mono">{endpoint}</span>
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground">Conferências registradas (observações e não conformidades).</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Proxy: <span className="font-mono">{endpoint}</span>
                            </p>
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center overflow-hidden rounded-md border">
                        <button
                            type="button"
                            className={`px-3 py-2 text-sm ${view === "materiais" ? "bg-muted font-medium" : "hover:bg-muted"}`}
                            onClick={() => setView("materiais")}
                        >
                            Materiais
                        </button>
                        <button
                            type="button"
                            className={`px-3 py-2 text-sm ${view === "conferencias" ? "bg-muted font-medium" : "hover:bg-muted"}`}
                            onClick={() => setView("conferencias")}
                        >
                            Conferências
                        </button>
                    </div>

                    {view === "materiais" ? (
                        <>
                            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                <input type="checkbox" checked={showInativos} onChange={(e) => setShowInativos(e.target.checked)} />
                                Mostrar inativos
                            </label>

                            <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60" onClick={loadTree} disabled={loading}>
                                {loading ? "Carregando…" : "Recarregar"}
                            </button>

                            <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90" onClick={openCreateCategoria}>
                                + Categoria
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                                <input
                                    className="w-[240px] bg-transparent text-sm outline-none"
                                    placeholder="Buscar: registro_id, falecido, observação..."
                                    value={confQuery}
                                    onChange={(e) => setConfQuery(e.target.value)}
                                />
                                <button className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60" onClick={loadConferencias} disabled={confLoading}>
                                    {confLoading ? "..." : "Buscar"}
                                </button>
                            </div>

                            <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60" onClick={loadConferencias} disabled={confLoading}>
                                {confLoading ? "Carregando…" : "Recarregar"}
                            </button>
                        </>
                    )}
                </div>
            </header>

            {/* Msg materiais */}
            {view === "materiais" && msg && (
                <div
                    className={`mb-4 rounded-md border px-3 py-2 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
                        }`}
                >
                    {msg.text}
                </div>
            )}

            {/* Msg conferências */}
            {view === "conferencias" && confMsg && (
                <div
                    className={`mb-4 rounded-md border px-3 py-2 text-sm ${confMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
                        }`}
                >
                    {confMsg.text}
                </div>
            )}

            {/* =======================
          VIEW: MATERIAIS
         ======================= */}
            {view === "materiais" ? (
                <div className="grid gap-3">
                    {tree.length === 0 && !loading ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</div>
                    ) : null}

                    {tree.map((c) => {
                        const cid = String(c.id);
                        const isOpen = openCatId === cid;
                        const duplicando = dupLoadingId === cid;

                        return (
                            <div key={cid} className="rounded-xl border bg-background p-4 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <button type="button" className="min-w-[240px] text-left focus:outline-none" onClick={() => toggleOpenCategory(cid)} aria-expanded={isOpen}>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${asBool(c.ativo) ? "bg-emerald-500" : "bg-slate-300"}`} />
                                            <h2 className="text-base font-semibold">
                                                {c.nome} <span className="ml-2 text-xs text-muted-foreground">{isOpen ? "▼" : "▶"}</span>
                                            </h2>
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            ID: <span className="font-mono">{cid}</span> • Ordem: <span className="font-mono">{String(c.ordem ?? 0)}</span>
                                        </div>
                                        <div className="mt-1 text-[11px] text-muted-foreground">{(c.itens ?? []).length} item(ns)</div>
                                    </button>

                                    <div className="flex flex-wrap gap-2">
                                        <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => openCreateItem(c.id)} disabled={duplicando}>
                                            + Item
                                        </button>

                                        <button
                                            className="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"
                                            onClick={() => duplicateCategoria(c)}
                                            disabled={duplicando}
                                            title="Cria uma nova categoria com cópia de itens e subitens"
                                        >
                                            {duplicando ? "Duplicando…" : "Duplicar"}
                                        </button>

                                        <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => openEditCategoria(c)} disabled={duplicando}>
                                            Editar
                                        </button>
                                        <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => removeCategoria(c.id)} disabled={duplicando}>
                                            Excluir
                                        </button>
                                    </div>
                                </div>

                                {isOpen ? (
                                    <div className="mt-4 grid gap-2">
                                        {(c.itens ?? []).length === 0 ? (
                                            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Sem itens nesta categoria.</div>
                                        ) : null}

                                        {(c.itens ?? []).map((i) => (
                                            <div key={String(i.id)} className="rounded-lg border p-3">
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${asBool(i.ativo) ? "bg-emerald-500" : "bg-slate-300"}`} />
                                                            <div className="font-medium">{i.nome}</div>
                                                        </div>
                                                        <div className="mt-1 text-[11px] text-muted-foreground">
                                                            Item ID: <span className="font-mono">{String(i.id)}</span> • Ordem: <span className="font-mono">{String(i.ordem ?? 0)}</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => openCreateSub(i.id)} disabled={duplicando}>
                                                            + Subitem
                                                        </button>
                                                        <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => openEditItem(i)} disabled={duplicando}>
                                                            Editar
                                                        </button>
                                                        <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => removeItem(i.id)} disabled={duplicando}>
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
                                                                <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => openEditSub(s)} disabled={duplicando}>
                                                                    Editar
                                                                </button>
                                                                <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => removeSub(s.id)} disabled={duplicando}>
                                                                    Excluir
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* =======================
                    VIEW: CONFERÊNCIAS
                   ======================= */
                <div className="grid gap-3">
                    {confList.length === 0 && !confLoading ? (
                        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhuma conferência encontrada.</div>
                    ) : null}

                    {confList.map((c) => {
                        const id = String(c.id);
                        const registroId = String(c.registro_id ?? "");
                        const falecido = String(c.falecido_nome ?? "").trim();
                        const obs = String(c.observacao ?? "").trim();

                        // ✅ CORREÇÃO: lê contagens tanto do formato antigo quanto do PHP atual
                        const nc = toIntOr0(pickNcCount(c));
                        const total = toIntOr0(pickTotal(c));

                        return (
                            <button
                                key={id}
                                type="button"
                                className="rounded-xl border bg-background p-4 text-left shadow-sm hover:bg-muted/30"
                                onClick={() => openConferencia(id)}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-[240px]">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${nc > 0 ? "bg-amber-500" : "bg-emerald-500"}`} />
                                            <div className="text-base font-semibold">
                                                Registro: <span className="font-mono">{registroId}</span>
                                            </div>
                                        </div>

                                        <div className="mt-1 text-sm text-muted-foreground">
                                            {falecido ? (
                                                <>
                                                    Falecido: <span className="text-foreground font-medium">{falecido}</span>
                                                </>
                                            ) : (
                                                "Falecido: —"
                                            )}
                                        </div>

                                        {obs ? (
                                            <div className="mt-2 text-sm">
                                                <span className="text-muted-foreground">Obs:</span>{" "}
                                                <span className="text-foreground">{obs.length > 140 ? obs.slice(0, 140) + "…" : obs}</span>
                                            </div>
                                        ) : (
                                            <div className="mt-2 text-sm text-muted-foreground">Sem observação.</div>
                                        )}

                                        <div className="mt-2 text-[11px] text-muted-foreground">
                                            ID: <span className="font-mono">{id}</span>
                                            {c.criado_em ? (
                                                <>
                                                    {" "}
                                                    • Em: <span className="font-mono">{String(c.criado_em)}</span>
                                                </>
                                            ) : null}
                                            {c.usuario_nome ? (
                                                <>
                                                    {" "}
                                                    • Por: <span className="font-mono">{String(c.usuario_nome)}</span>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground whitespace-nowrap">{`${total} itens`}</div>
                                        <div
                                            className={`rounded-md border px-2 py-1 text-xs whitespace-nowrap ${nc > 0 ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                                }`}
                                        >
                                            {nc > 0 ? `${nc} Não Conforme` : "Conforme"}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}

                    {/* Modal detalhe conferência */}
                    {confOpenId && (
                        <div
                            className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
                            role="dialog"
                            aria-modal="true"
                            onMouseDown={(e) => {
                                if (e.target === e.currentTarget) {
                                    setConfOpenId(null);
                                    setConfDetail(null);
                                }
                            }}
                        >
                            <div className="w-full max-w-3xl rounded-xl bg-background p-4 shadow-xl">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-semibold">Detalhes da Conferência</h3>
                                        <p className="text-xs text-muted-foreground">
                                            ID: <span className="font-mono">{confOpenId}</span>
                                        </p>
                                    </div>

                                    <button
                                        className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
                                        onClick={() => {
                                            setConfOpenId(null);
                                            setConfDetail(null);
                                        }}
                                    >
                                        Fechar
                                    </button>
                                </div>

                                {!confDetail ? (
                                    <div className="mt-4 rounded-md border p-4 text-sm text-muted-foreground">Carregando detalhes…</div>
                                ) : (
                                    <div className="mt-4 grid gap-3">
                                        <div className="rounded-lg border p-3">
                                            <div className="text-sm">
                                                Registro: <span className="font-mono font-semibold">{String(confDetail.registro_id ?? "")}</span>
                                            </div>
                                            <div className="mt-1 text-sm">
                                                Falecido: <span className="font-medium">{String(confDetail.falecido_nome ?? "").trim() || "—"}</span>
                                            </div>
                                            <div className="mt-2 text-sm">
                                                <div className="text-muted-foreground">Observação</div>
                                                <div className="mt-1 whitespace-pre-wrap break-words">{String(confDetail.observacao ?? "").trim() || "—"}</div>
                                            </div>
                                            <div className="mt-2 text-[11px] text-muted-foreground">
                                                {confDetail.criado_em ? (
                                                    <>
                                                        Em: <span className="font-mono">{String(confDetail.criado_em)}</span>
                                                    </>
                                                ) : null}
                                                {confDetail.usuario_nome ? (
                                                    <>
                                                        {" "}
                                                        • Por: <span className="font-mono">{String(confDetail.usuario_nome)}</span>
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="rounded-lg border">
                                            <div className="border-b p-3 text-sm font-medium">Itens</div>
                                            {confDetail.itens.length === 0 ? (
                                                <div className="p-3 text-sm text-muted-foreground">Nenhum item salvo nesta conferência.</div>
                                            ) : (
                                                <div className="max-h-[45vh] overflow-auto">
                                                    {confDetail.itens.map((it) => {
                                                        // ✅ robusto: "Não Conforme" tem prioridade
                                                        const nc = boolish(pickNc(it));
                                                        const ok = boolish(pickOk(it)) && !nc;

                                                        return (
                                                            <div key={String(it.id)} className="border-b p-3 last:border-b-0">
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm font-semibold whitespace-normal break-words">{String(it.item_nome ?? "")}</div>
                                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                                            key: <span className="font-mono">{String(it.item_key ?? "")}</span> • qtd:{" "}
                                                                            <span className="font-mono">{String(it.qtd ?? 0)}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-2">
                                                                        {ok ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">OK</span> : null}
                                                                        {nc ? (
                                                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Não Conforme</span>
                                                                        ) : null}
                                                                        {!ok && !nc ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">—</span> : null}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {confMsg && (
                                    <div
                                        className={`mt-4 rounded-md border px-3 py-2 text-sm ${confMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
                                            }`}
                                    >
                                        {confMsg.text}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Modal CRUD Materiais */}
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
                                    {modal.mode === "create" ? "Criar" : "Editar"} {modal.kind === "categoria" ? "Categoria" : modal.kind === "item" ? "Item" : "Subitem"}
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
                                    <input type="checkbox" checked={modal.ativo} onChange={(e) => setModal((m) => (m.open ? { ...m, ativo: e.target.checked } : m))} />
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
                            <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90" onClick={saveModal}>
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
