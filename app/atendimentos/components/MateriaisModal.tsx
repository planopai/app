"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import type { MateriaisState, Registro } from "./types";
import { LOGIN_ABSOLUTE } from "./constants";

type ApiOk<T> = { sucesso: 1; data?: T; msg?: string; need_login?: 0 };
type ApiErr = { erro: 1; msg?: string; need_login?: 1 };

type SubItem = {
    id: number | string;
    item_id: number | string;
    nome: string;
    ativo: number | boolean;
    ordem: number | string;
};

type Item = {
    id: number | string;
    categoria_id: number | string;
    nome: string;
    ativo: number | boolean;
    ordem: number | string;
    subitens?: SubItem[];
};

type Categoria = {
    id: number | string;
    nome: string;
    ativo: number | boolean;
    ordem: number | string;
    itens?: Item[];
};

/**
 * ✅ Endpoint base da API (PHP)
 */
const ENDPOINT = "https://api.planoassistencialintegrado.com.br";

// ✅ ajuste se seu arquivo PHP tiver outro nome
const PHP_FILE = "materiais_admin.php";

function asBool(v: any) {
    return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
}
function toInt(v: any, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}
function byOrderThenName(a: { ordem?: any; nome?: any }, b: { ordem?: any; nome?: any }) {
    const ao = toInt(a.ordem, 0);
    const bo = toInt(b.ordem, 0);
    if (ao !== bo) return ao - bo;
    return String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR", { sensitivity: "base" });
}

type DynMat = Record<
    string,
    {
        checked: boolean;
        qtd: number;
        nome?: string;
        categoria_id?: any;
        item_id?: any;
        tipo?: "item" | "subitem";
        raw_id?: any;
    }
>;

function makeKey(tipo: "item" | "subitem", id: number | string) {
    return `${tipo}:${String(id)}`;
}

export default function MateriaisModal({
    open,
    setOpen,
    materiais,
    setMateriais,
    setWizardData,
}: {
    open: boolean;
    setOpen: (b: boolean) => void;
    materiais: MateriaisState;
    setMateriais: React.Dispatch<React.SetStateAction<MateriaisState>>;
    setWizardData: React.Dispatch<React.SetStateAction<Registro>>;
}) {
    // ✅ Agora direto no PHP do domínio da API (sem passar por /api/php do Next)
    const endpoint = useMemo(() => `${ENDPOINT}/${PHP_FILE}`, []);

    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [needLogin, setNeedLogin] = useState(false);

    const [cats, setCats] = useState<Categoria[]>([]);
    const [catId, setCatId] = useState<string>("");

    const mat = (materiais || {}) as any as DynMat;

    // carrega árvore ao abrir
    useEffect(() => {
        if (!open) return;

        const ctrl = new AbortController();
        setNeedLogin(false);

        (async () => {
            setLoading(true);
            setMsg(null);

            try {
                // ✅ como agora é URL absoluta, não precisa de window.location.origin
                const url = new URL(endpoint);
                url.searchParams.set("op", "list");
                url.searchParams.set("all", "0");
                url.searchParams.set("_nocache", String(Date.now()));

                const r = await fetch(url.toString(), {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store",
                    signal: ctrl.signal,
                });

                // ✅ se o servidor responder 401, não derruba a SPA: só mostra mensagem
                if (r.status === 401) {
                    setNeedLogin(true);
                    setMsg("Sessão expirada. Faça login novamente.");
                    setCats([]);
                    setCatId("");
                    return;
                }

                const json = (await r.json().catch(() => null)) as ApiOk<Categoria[]> | ApiErr | null;
                if (!json) throw new Error("Resposta inválida do servidor.");

                if ((json as any)?.need_login) {
                    setNeedLogin(true);
                    setMsg((json as any)?.msg || "Sessão expirada. Faça login novamente.");
                    setCats([]);
                    setCatId("");
                    return;
                }

                if (!r.ok || (json as any)?.erro) throw new Error((json as any)?.msg || "Erro ao listar materiais.");

                const data = (json as ApiOk<Categoria[]>)?.data ?? [];

                const sane = (Array.isArray(data) ? data : [])
                    .filter((c) => asBool(c.ativo))
                    .map((c) => ({
                        ...c,
                        itens: (c.itens ?? [])
                            .filter((i) => asBool(i.ativo))
                            .map((i) => ({
                                ...i,
                                subitens: (i.subitens ?? []).filter((s) => asBool(s.ativo)).sort(byOrderThenName),
                            }))
                            .sort(byOrderThenName),
                    }))
                    .sort(byOrderThenName);

                setCats(sane);

                setCatId((prev) => {
                    if (prev && sane.some((c) => String(c.id) === String(prev))) return prev;
                    return sane[0] ? String(sane[0].id) : "";
                });
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                setCats([]);
                setCatId("");
                setMsg(e?.message || "Falha ao carregar.");
            } finally {
                setLoading(false);
            }
        })();

        return () => ctrl.abort();
    }, [open, endpoint]);

    const selectedCat = useMemo(() => cats.find((c) => String(c.id) === String(catId)) ?? null, [cats, catId]);
    const items = useMemo(() => selectedCat?.itens ?? [], [selectedCat]);

    const selectedCount = useMemo(() => {
        let n = 0;
        for (const v of Object.values(mat)) if (v?.checked) n++;
        return n;
    }, [mat]);

    function toggleSelection(payload: {
        key: string;
        checked: boolean;
        nome: string;
        qtd?: number;
        categoria_id?: any;
        item_id?: any;
        tipo: "item" | "subitem";
        raw_id: any;
    }) {
        setMateriais((prev) => {
            const p = ((prev || {}) as any) as DynMat;
            const prevQtd = toInt(p?.[payload.key]?.qtd ?? payload.qtd ?? 0, 0);

            const checked = payload.checked;
            const qtd = checked ? Math.max(1, prevQtd || 1) : 0;

            return {
                ...(p || {}),
                [payload.key]: {
                    checked,
                    qtd,
                    nome: payload.nome,
                    categoria_id: payload.categoria_id,
                    item_id: payload.item_id,
                    tipo: payload.tipo,
                    raw_id: payload.raw_id,
                },
            } as any;
        });
    }

    function setQty(
        key: string,
        nome: string,
        categoria_id: any,
        item_id: any,
        tipo: "item" | "subitem",
        raw_id: any,
        qtdVal: any
    ) {
        const qtd = Math.max(1, toInt(qtdVal, 1));
        setMateriais((prev) => {
            const p = ((prev || {}) as any) as DynMat;
            return {
                ...(p || {}),
                [key]: { checked: true, qtd, nome, categoria_id, item_id, tipo, raw_id },
            } as any;
        });
    }

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Materiais" maxWidth={680}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold">Materiais para Assistência</h3>
                    <p className="text-xs text-muted-foreground">
                        Selecione a categoria e marque os itens com quantidade. Selecionados: {selectedCount}
                    </p>
                </div>

                <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted" onClick={() => setOpen(false)}>
                    Fechar
                </button>
            </div>

            {msg ? (
                <div
                    className={`mt-3 rounded-md border px-3 py-2 text-sm ${needLogin ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"
                        }`}
                >
                    {msg}
                    {needLogin ? (
                        <div className="mt-2">
                            <button
                                className="rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground hover:opacity-90"
                                onClick={() => (window.location.href = LOGIN_ABSOLUTE)}
                            >
                                Ir para login
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            <div className="mt-4 grid gap-3">
                {/* SELECT CATEGORIAS */}
                <div className="grid gap-1">
                    <label className="text-sm font-medium">Categoria</label>
                    <select
                        className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                        value={catId}
                        onChange={(e) => setCatId(e.target.value)}
                        disabled={loading || cats.length === 0 || needLogin}
                    >
                        {cats.length === 0 ? <option value="">Nenhuma categoria</option> : null}
                        {cats.map((c) => (
                            <option key={String(c.id)} value={String(c.id)}>
                                {c.nome}
                            </option>
                        ))}
                    </select>
                </div>

                {/* LISTA DE ITENS/SUBITENS */}
                <div className="rounded-lg border p-3">
                    {loading ? (
                        <div className="text-sm text-muted-foreground">Carregando itens…</div>
                    ) : needLogin ? (
                        <div className="text-sm text-muted-foreground">Faça login para carregar os materiais.</div>
                    ) : items.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Esta categoria não tem itens.</div>
                    ) : (
                        <div className="space-y-3">
                            {items.map((it) => {
                                const hasSubs = (it.subitens ?? []).length > 0;

                                // Se tiver subitens: renderiza subitens
                                if (hasSubs) {
                                    return (
                                        <div key={`itemwrap:${String(it.id)}`} className="rounded-md border p-2">
                                            <div className="text-sm font-medium">{it.nome}</div>

                                            <div className="mt-2 space-y-2 pl-2">
                                                {(it.subitens ?? []).map((s) => {
                                                    const key = makeKey("subitem", s.id);
                                                    const state = mat[key] ?? { checked: false, qtd: 0 };

                                                    return (
                                                        <div key={key} className="flex items-center justify-between gap-3">
                                                            <label className="inline-flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!state.checked}
                                                                    onChange={(e) =>
                                                                        toggleSelection({
                                                                            key,
                                                                            checked: e.target.checked,
                                                                            nome: s.nome,
                                                                            categoria_id: it.categoria_id,
                                                                            item_id: s.item_id,
                                                                            tipo: "subitem",
                                                                            raw_id: s.id,
                                                                        })
                                                                    }
                                                                />
                                                                <span className="text-sm">{s.nome}</span>
                                                            </label>

                                                            <input
                                                                type="number"
                                                                min={1}
                                                                inputMode="numeric"
                                                                className="w-28 rounded-md border px-2 py-1 text-sm disabled:opacity-50"
                                                                disabled={!state.checked}
                                                                value={state.checked ? String(state.qtd ?? 1) : ""}
                                                                onChange={(e) =>
                                                                    setQty(key, s.nome, it.categoria_id, s.item_id, "subitem", s.id, e.target.value)
                                                                }
                                                                placeholder="Qtd"
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                }

                                // Sem subitens: item é selecionável
                                const key = makeKey("item", it.id);
                                const state = mat[key] ?? { checked: false, qtd: 0 };

                                return (
                                    <div key={key} className="flex items-center justify-between gap-3">
                                        <label className="inline-flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={!!state.checked}
                                                onChange={(e) =>
                                                    toggleSelection({
                                                        key,
                                                        checked: e.target.checked,
                                                        nome: it.nome,
                                                        categoria_id: it.categoria_id,
                                                        item_id: it.id,
                                                        tipo: "item",
                                                        raw_id: it.id,
                                                    })
                                                }
                                            />
                                            <span className="text-sm">{it.nome}</span>
                                        </label>

                                        <input
                                            type="number"
                                            min={1}
                                            inputMode="numeric"
                                            className="w-28 rounded-md border px-2 py-1 text-sm disabled:opacity-50"
                                            disabled={!state.checked}
                                            value={state.checked ? String(state.qtd ?? 1) : ""}
                                            onChange={(e) => setQty(key, it.nome, it.categoria_id, it.id, "item", it.id, e.target.value)}
                                            placeholder="Qtd"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* BOTÕES */}
                <div className="mt-1 flex justify-end gap-2">
                    <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={() => setOpen(false)}>
                        Cancelar
                    </button>

                    <button
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
                        disabled={needLogin}
                        onClick={() => {
                            setWizardData((d) => ({ ...d, materiais }));
                            setOpen(false);
                        }}
                    >
                        Salvar Materiais
                    </button>
                </div>
            </div>
        </Modal>
    );
}
