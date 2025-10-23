// src/app/(admin)/enviar/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

/* ================== Tipos ================== */
type ApiOkCreate = { ok: true; id: number };
type ApiOkBool = { ok: true } | { ok: true; deleted?: boolean; updated?: boolean };
type ApiErr = { ok: false; error: string };

type Row = {
    id: number;
    titulo: string;
    conteudo: string;
    imagem_url?: string | null;
    publicado_em: string; // "YYYY-MM-DD HH:MM:SS"
    criado_em?: string;
    atualizado_em?: string;
};

type ListResp = { ok: true; items: Row[] } | { ok: false; error: string };

/* ================== Helpers ================== */
const asS = (v: unknown) => (typeof v === "string" ? v : "");
const asN = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

// headers exigidos pelo PHP (via route.ts)
const API_KEY = process.env.NEXT_PUBLIC_PAI_PARTNERS_API_KEY ?? "PlanoPAI2024#";
function authHeaders(extra?: HeadersInit): HeadersInit {
    return {
        "X-PAI-KEY": API_KEY,
        "X-Requested-With": "XMLHttpRequest",
        ...(extra ?? {}),
    };
}

const PAGE_SIZE = 20;

/** Extrai string de erro de maneira “type-safe”. */
function getRespErrorMessage(obj: unknown): string | null {
    if (typeof obj === "object" && obj !== null && "error" in obj) {
        const msg = (obj as { error?: unknown }).error;
        return typeof msg === "string" ? msg : null;
    }
    return null;
}

/* ================== Página ================== */
export default function NoticiasAdminPage() {
    // listagem
    const [items, setItems] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);

    // busca servidor
    const [q, setQ] = useState<string>("");

    // filtro cliente
    const [dateFrom, setDateFrom] = useState<string>(""); // datetime-local
    const [dateTo, setDateTo] = useState<string>("");

    // paginação (somente ref para não causar re-render/loop)
    const offsetRef = useRef(0);
    const [hasMore, setHasMore] = useState(true);

    // modal/form
    const [modalOpen, setModalOpen] = useState(false);

    // form (create/update)
    const [editId, setEditId] = useState<number | null>(null);
    const [titulo, setTitulo] = useState("");
    const [conteudo, setConteudo] = useState("");
    const [publicadoEmInput, setPublicadoEmInput] = useState<string>(""); // datetime-local
    const [imagemUrl, setImagemUrl] = useState("");
    const [imagemFile, setImagemFile] = useState<File | null>(null);

    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);
    const [msgOk, setMsgOk] = useState<string | null>(null);

    const fileRef = useRef<HTMLInputElement | null>(null);

    const isValid = useMemo(
        () => titulo.trim().length >= 3 && conteudo.trim().length >= 5,
        [titulo, conteudo]
    );

    /* -------- carregar (com paginação) -------- */
    const carregar = useCallback(
        async (reset: boolean) => {
            try {
                if (reset) {
                    setLoading(true);
                    setErroLista(null);
                    setHasMore(true);
                    setItems([]);
                    offsetRef.current = 0;
                } else {
                    setErroLista(null);
                }

                const usedOffset = reset ? 0 : offsetRef.current;

                const qs = new URLSearchParams();
                qs.set("list", "1");
                qs.set("limit", String(PAGE_SIZE));
                qs.set("offset", String(usedOffset));
                if (q.trim()) qs.set("q", q.trim());

                const r = await fetch(`/api/noticias?${qs.toString()}`, {
                    cache: "no-store",
                    headers: authHeaders(),
                });

                const data: unknown = await r.json();

                if (typeof data !== "object" || data === null || !("ok" in (data as Record<string, unknown>))) {
                    throw new Error("Resposta inválida do servidor.");
                }

                const resp = data as ListResp;

                if (!("ok" in resp) || resp.ok !== true) {
                    const errMsg = getRespErrorMessage(resp) ?? "Falha ao carregar notícias.";
                    throw new Error(errMsg);
                }

                const pageItems = resp.items.map((it) => ({
                    ...it,
                    id: asN(it.id),
                    titulo: asS(it.titulo),
                    conteudo: asS(it.conteudo),
                    imagem_url: asS(it.imagem_url || "") || null,
                    publicado_em: asS(it.publicado_em),
                }));

                if (reset) {
                    setItems(pageItems);
                    offsetRef.current = pageItems.length;
                } else {
                    setItems((prev) => [...prev, ...pageItems]);
                    offsetRef.current += pageItems.length;
                }
                setHasMore(pageItems.length === PAGE_SIZE);
            } catch (err) {
                setErroLista(err instanceof Error ? err.message : String(err));
                if (reset) {
                    setItems([]);
                    offsetRef.current = 0;
                    setHasMore(false);
                }
            } finally {
                if (reset) setLoading(false);
            }
        },
        [q]
    );

    // Carrega na montagem e quando a busca (q) muda.
    useEffect(() => {
        void carregar(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    /* -------- filtro por data (cliente) -------- */
    const itemsFiltered = useMemo(() => {
        const start = dateFrom ? new Date(dateFrom) : null;
        const end = dateTo ? new Date(dateTo) : null;
        if (!start && !end) return items;

        return items.filter((i) => {
            const d = new Date(i.publicado_em.replace(" ", "T"));
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
        });
    }, [items, dateFrom, dateTo]);

    /* -------- reset form -------- */
    const resetForm = () => {
        setEditId(null);
        setTitulo("");
        setConteudo("");
        setPublicadoEmInput("");
        setImagemUrl("");
        setImagemFile(null);
        setErroForm(null);
        setMsgOk(null);
        if (fileRef.current) fileRef.current.value = "";
    };

    const startNovo = () => {
        resetForm();
        setModalOpen(true);
    };

    const startEditar = (row: Row) => {
        setEditId(row.id);
        setTitulo(row.titulo);
        setConteudo(row.conteudo);
        setPublicadoEmInput(row.publicado_em.replace(" ", "T").slice(0, 16));
        setImagemUrl(row.imagem_url || "");
        setImagemFile(null);
        setErroForm(null);
        setMsgOk(null);
        if (fileRef.current) fileRef.current.value = "";
        setModalOpen(true);
    };

    /* -------- submit (CREATE/UPDATE) -------- */
    const onSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setErroForm(null);
            setMsgOk(null);

            if (!isValid) {
                setErroForm("Preencha título (>=3) e conteúdo (>=5).");
                return;
            }

            try {
                setSalvando(true);

                const publicado_em = publicadoEmInput ? `${publicadoEmInput}:00`.replace("T", " ") : "";

                if (editId === null) {
                    // CREATE
                    const fd = new FormData();
                    fd.append("titulo", titulo.trim());
                    fd.append("conteudo", conteudo.trim());
                    if (publicado_em) fd.append("publicado_em", publicado_em);
                    if (imagemFile) fd.append("imagem", imagemFile);
                    if (!imagemFile && imagemUrl.trim()) fd.append("imagem_url", imagemUrl.trim());

                    const r = await fetch("/api/noticias", {
                        method: "POST",
                        body: fd,
                        headers: authHeaders(),
                    });
                    const data: ApiOkCreate | ApiErr = await r.json();
                    if (!r.ok || ("ok" in data && !data.ok)) {
                        const msg = getRespErrorMessage(data) ?? "Falha ao criar.";
                        throw new Error(msg);
                    }

                    setMsgOk(`Notícia criada (ID ${(data as ApiOkCreate).id}).`);
                    resetForm();
                    setModalOpen(false);
                    await carregar(true);
                } else {
                    // UPDATE
                    const url = `/api/noticias?id=${encodeURIComponent(editId)}`;

                    if (imagemFile) {
                        const fd = new FormData();
                        fd.append("titulo", titulo.trim());
                        fd.append("conteudo", conteudo.trim());
                        if (publicado_em) fd.append("publicado_em", publicado_em);
                        if (imagemUrl.trim()) fd.append("imagem_url", imagemUrl.trim());
                        fd.append("imagem", imagemFile);

                        const r = await fetch(url, { method: "POST", headers: authHeaders(), body: fd });
                        const data: ApiOkBool | ApiErr = await r.json();
                        if (!r.ok || ("ok" in data && !data.ok)) {
                            const msg = getRespErrorMessage(data) ?? "Falha ao atualizar.";
                            throw new Error(msg);
                        }
                    } else {
                        const payload = {
                            titulo: titulo.trim(),
                            conteudo: conteudo.trim(),
                            publicado_em: publicado_em || null,
                            imagem_url: imagemUrl.trim() || null,
                        };
                        const r = await fetch(url, {
                            method: "PUT",
                            headers: authHeaders({ "Content-Type": "application/json" }),
                            body: JSON.stringify(payload),
                        });
                        const data: ApiOkBool | ApiErr = await r.json();
                        if (!r.ok || ("ok" in data && !data.ok)) {
                            const msg = getRespErrorMessage(data) ?? "Falha ao atualizar.";
                            throw new Error(msg);
                        }
                    }

                    setMsgOk("Notícia atualizada com sucesso.");
                    setModalOpen(false);
                    await carregar(true);
                }
            } catch (err) {
                setErroForm(err instanceof Error ? err.message : String(err));
            } finally {
                setSalvando(false);
            }
        },
        [isValid, editId, titulo, conteudo, publicadoEmInput, imagemUrl, imagemFile, carregar]
    );

    /* -------- deletar -------- */
    const excluir = async (row: Row) => {
        if (!confirm(`Excluir a notícia "${row.titulo}"?`)) return;
        try {
            const r = await fetch(`/api/noticias?id=${encodeURIComponent(row.id)}`, {
                method: "DELETE",
                headers: authHeaders(),
            });
            const data: ApiOkBool | ApiErr = await r.json();
            if (!r.ok || ("ok" in data && !data.ok)) {
                const msg = getRespErrorMessage(data) ?? "Falha ao excluir.";
                throw new Error(msg);
            }
            await carregar(true);
        } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
        }
    };

    /* -------- UI -------- */
    return (
        <div className="p-4 sm:p-6 xl:p-8 font-[Nunito]">
            <div className="mx-auto max-w-4xl">
                <header className="mb-6 flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Notícias</h1>
                    <button
                        onClick={startNovo}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                    >
                        Nova Notícia
                    </button>
                </header>

                {/* filtros */}
                <div className="mb-4 grid gap-3 md:grid-cols-3">
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Buscar por título/conteúdo…"
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                    />
                    <input
                        type="datetime-local"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                        placeholder="De"
                    />
                    <input
                        type="datetime-local"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                        placeholder="Até"
                    />
                </div>

                {/* lista */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    {loading ? (
                        <div className="p-4 text-gray-600 dark:text-gray-300">Carregando…</div>
                    ) : erroLista ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900/50 dark:bg-red-900/20">
                            {erroLista}
                        </div>
                    ) : itemsFiltered.length === 0 ? (
                        <div className="p-4 text-gray-600 dark:text-gray-300">Nenhuma notícia encontrada.</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {itemsFiltered.map((row) => (
                                <div key={row.id} className="flex items-start gap-4 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                                    <div className="relative h-20 w-28 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                                        {row.imagem_url ? (
                                            <Image
                                                src={row.imagem_url}
                                                alt={row.titulo}
                                                fill
                                                sizes="120px"
                                                className="object-cover"
                                                unoptimized
                                            />
                                        ) : (
                                            <div className="grid h-full place-items-center text-xs text-gray-500">sem imagem</div>
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{row.titulo}</p>
                                        <p className="truncate text-xs text-gray-600 dark:text-gray-300">
                                            {new Date(row.publicado_em.replace(" ", "T")).toLocaleString()}
                                        </p>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => startEditar(row)}
                                            className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
                                        >
                                            Editar
                                        </button>
                                        <button
                                            onClick={() => void excluir(row)}
                                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
                                        >
                                            Excluir
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* paginação */}
                    {!loading && !erroLista && hasMore && (
                        <div className="mt-4 flex justify-center">
                            <button
                                onClick={() => void carregar(false)}
                                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Carregar mais
                            </button>
                        </div>
                    )}
                </div>

                {/* Modal do Form */}
                {modalOpen && (
                    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">
                        <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
                            <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                    {editId ? `Editar Notícia #${editId}` : "Nova Notícia"}
                                </h3>
                                <button
                                    onClick={() => {
                                        setModalOpen(false);
                                        setErroForm(null);
                                        setMsgOk(null);
                                    }}
                                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    Fechar
                                </button>
                            </div>

                            <form onSubmit={onSubmit} className="grid gap-6 p-4">
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Título*</label>
                                    <input
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                        value={titulo}
                                        onChange={(e) => setTitulo(e.target.value)}
                                        placeholder="Título da notícia"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Conteúdo*</label>
                                    <textarea
                                        rows={6}
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                        value={conteudo}
                                        onChange={(e) => setConteudo(e.target.value)}
                                        placeholder="Texto completo da notícia"
                                    />
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div>
                                        <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Publicado em</label>
                                        <input
                                            type="datetime-local"
                                            className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                            value={publicadoEmInput}
                                            onChange={(e) => setPublicadoEmInput(e.target.value)}
                                        />
                                        <p className="mt-1 text-xs text-gray-500">Se vazio, o servidor usará a data/hora atual.</p>
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Imagem (upload ou URL)</label>
                                        <input
                                            ref={fileRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => setImagemFile(e.target.files?.[0] || null)}
                                            className="mb-2 w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                        />
                                        <input
                                            value={imagemUrl}
                                            onChange={(e) => setImagemUrl(e.target.value)}
                                            placeholder="https://…"
                                            className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                        />
                                        <p className="mt-1 text-xs text-gray-500">Se enviar arquivo, a URL é opcional.</p>
                                    </div>
                                </div>

                                {erroForm ? (
                                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20">
                                        {erroForm}
                                    </div>
                                ) : null}

                                {msgOk ? (
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20">
                                        {msgOk}
                                    </div>
                                ) : null}

                                <div className="flex items-center gap-3">
                                    <button
                                        type="submit"
                                        disabled={salvando || !isValid}
                                        className="rounded-xl bg-emerald-600 px-5 py-2 font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
                                    >
                                        {salvando ? "Salvando..." : "Salvar"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setModalOpen(false);
                                            setErroForm(null);
                                            setMsgOk(null);
                                        }}
                                        className="rounded-xl border border-gray-300 px-5 py-2 font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
