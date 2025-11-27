"use client";

import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import type { MateriaisState, Registro } from "./types";

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

// ✅ ajuste se seu arquivo PHP tiver outro nome
const PHP_FILE = "materiais_admin.php";
const PROXY_BASE = "/api/php";

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
    const endpoint = useMemo(() => `${PROXY_BASE}/${PHP_FILE}`, []);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [cats, setCats] = useState<Categoria[]>([]);
    const [catId, setCatId] = useState<string>(""); // categoria selecionada

    // carregamento da árvore
    useEffect(() => {
        if (!open) return;

        let alive = true;
        (async () => {
            setLoading(true);
            setMsg(null);
            try {
                const url = new URL(endpoint, window.location.origin);
                url.searchParams.set("op", "list");
                url.searchParams.set("all", "0"); // só ativos
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
                if (!r.ok || (json as any)?.erro) throw new Error((json as any)?.msg || "Erro ao listar materiais.");

                const data = (json as ApiOk<Categoria[]>)?.data ?? [];
                const sane = (Array.isArray(data) ? data : [])
                    .filter((c) => asBool(c.ativo))
                    .map((c) => ({
                        ...c,
                        itens: (c.itens ?? []).filter((i) => asBool(i.ativo)).sort(byOrderThenName),
                    }))
                    .sort(byOrderThenName);

                if (!alive) return;
                setCats(sane);

                // escolhe a primeira categoria (ou mantém a atual se existir)
                setCatId((prev) => {
                    if (prev && sane.some((c) => String(c.id) === String(prev))) return prev;
                    return sane[0] ? String(sane[0].id) : "";
                });
            } catch (e: any) {
                if (!alive) return;
                setCats([]);
                setCatId("");
                setMsg(e?.message || "Falha ao carregar.");
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [open, endpoint]);

    const selectedCat = useMemo(
        () => cats.find((c) => String(c.id) === String(catId)) ?? null,
        [cats, catId]
    );

    const items = useMemo(() => selectedCat?.itens ?? [], [selectedCat]);

    const selectedCount = useMemo(() => {
        let n = 0;
        for (const v of Object.values(materiais || {})) if (v?.checked) n++;
        return n;
    }, [materiais]);

    return (
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Materiais" maxWidth={640}>
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
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div>
            ) : null}

            <div className="mt-4 grid gap-3">
                {/* SELECT CATEGORIAS */}
                <div className="grid gap-1">
                    <label className="text-sm font-medium">Categoria</label>
                    <select
                        className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                        value={catId}
                        onChange={(e) => setCatId(e.target.value)}
                        disabled={loading || cats.length === 0}
                    >
                        {cats.length === 0 ? <option value="">Nenhuma categoria</option> : null}
                        {cats.map((c) => (
                            <option key={String(c.id)} value={String(c.id)}>
                                {c.nome}
                            </option>
                        ))}
                    </select>
                </div>

                {/* LISTA DE ITENS DA CATEGORIA */}
                <div className="rounded-lg border p-3">
                    {loading ? (
                        <div className="text-sm text-muted-foreground">Carregando itens…</div>
                    ) : items.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Esta categoria não tem itens.</div>
                    ) : (
                        <div className="space-y-3">
                            {items.map((it) => {
                                const idKey = String(it.id);
                                const state = materiais?.[idKey] ?? { checked: false, qtd: 0, nome: it.nome, categoria_id: it.categoria_id };

                                return (
                                    <div key={idKey} className="flex items-center justify-between gap-3">
                                        <label className="inline-flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={!!state.checked}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setMateriais((prev) => ({
                                                        ...(prev || {}),
                                                        [idKey]: {
                                                            checked,
                                                            qtd: checked ? Math.max(1, toInt((prev as any)?.[idKey]?.qtd ?? state.qtd, 1)) : 0,
                                                            nome: it.nome,
                                                            categoria_id: it.categoria_id,
                                                        },
                                                    }));
                                                }}
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
                                            onChange={(e) => {
                                                const qtd = Math.max(1, toInt(e.target.value, 1));
                                                setMateriais((prev) => ({
                                                    ...(prev || {}),
                                                    [idKey]: {
                                                        checked: true,
                                                        qtd,
                                                        nome: it.nome,
                                                        categoria_id: it.categoria_id,
                                                    },
                                                }));
                                            }}
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
                        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
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
