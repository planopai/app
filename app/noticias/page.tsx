// app/noticias/page.tsx — Notícias (avisos e novidades que aparecem no app dos associados)
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
    IconCalendarTime,
    IconCheck,
    IconPencil,
    IconPhoto,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconTrash,
    IconUpload,
    IconX,
} from "@tabler/icons-react";

/* ================== Tipos ================== */

type ApiOkCreate = { ok: true; id: number };
type ApiOkBool = { ok: true; deleted?: boolean; updated?: boolean };
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

type ListRespOk = { ok: true; items: Row[] };
type ListRespErr = { ok: false; error: string };
type ListResp = ListRespOk | ListRespErr;

type Periodo = "todas" | "mes" | "30dias" | "agendadas";

/* ================== Helpers ================== */

const asS = (v: unknown) => (typeof v === "string" ? v : "");
const asN = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

// headers exigidos pelo PHP (via route.ts)
// Fase 0 (22/10/2026): a chave X-PAI-KEY saiu do navegador; quem a envia é a rota do servidor (app/api/...).
function authHeaders(extra?: HeadersInit): HeadersInit {
    return {
        "X-Requested-With": "XMLHttpRequest",
        ...(extra ?? {}),
    };
}

const PAGE_SIZE = 20;
const MIN_TITULO = 3;
const MIN_CONTEUDO = 5;

/** Extrai string de erro de maneira “type-safe”. */
function getRespErrorMessage(obj: unknown): string | null {
    if (typeof obj === "object" && obj !== null && "error" in obj) {
        const msg = (obj as { error?: unknown }).error;
        return typeof msg === "string" ? msg : null;
    }
    return null;
}

function dataDe(publicadoEm: string): Date | null {
    const d = new Date(String(publicadoEm || "").replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "28/10 às 14:30" (com o ano quando não é o atual). */
function fmtData(publicadoEm: string): string {
    const d = dataDe(publicadoEm);
    if (!d) return publicadoEm || "—";
    const ano = d.getFullYear() !== new Date().getFullYear() ? `/${d.getFullYear()}` : "";
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}${ano} às ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function ehAgendada(publicadoEm: string): boolean {
    const d = dataDe(publicadoEm);
    return !!d && d.getTime() > Date.now();
}

/* ================== Visual (padrão repaginado) ================== */

const CARD = "rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
const TXT_SEC = "text-[#5B6478] dark:text-[#AEB9CF]";
const BTN_BASE =
    "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition outline-none focus-visible:ring-2 focus-visible:ring-[#3D6A99]/30 disabled:cursor-not-allowed disabled:opacity-45";
const BTN_SEC = `${BTN_BASE} border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:border`;
const BTN_PRI = `${BTN_BASE} border-[1.5px] border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30] lg:border`;
const BTN_PERIGO = `${BTN_BASE} border-[1.5px] border-[#B42318] bg-[#B42318] font-extrabold text-white hover:bg-[#9A1D14] dark:border-[#FF9C92] dark:bg-[#FF9C92] dark:text-[#313C55] lg:border`;
const BTN_ICONE =
    "inline-grid size-11 shrink-0 place-items-center rounded-xl border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-45 dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:border";
const CAMPO =
    "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]";
const ROTULO = "mb-2 block text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    return montado ? createPortal(children, document.body) : null;
}

/** Janela padrão: centralizada no computador, folha que sobe de baixo no celular. Esc fecha. */
function Janela({
    titulo,
    subtitulo,
    icone,
    onClose,
    podeFechar = true,
    rodape,
    largura = "md",
    z = "z-[70]",
    children,
}: {
    titulo: string;
    subtitulo?: string;
    icone?: React.ReactNode;
    onClose: () => void;
    podeFechar?: boolean;
    rodape?: React.ReactNode;
    largura?: "sm" | "md" | "lg";
    z?: string;
    children: React.ReactNode;
}) {
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            if (podeFechar) onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey, true);
        };
    }, [onClose, podeFechar]);

    const max = largura === "sm" ? "lg:max-w-[460px]" : largura === "lg" ? "lg:max-w-[960px]" : "lg:max-w-[640px]";

    return (
        <NoCorpo>
            <div
                role="dialog"
                data-pai-overlay
                aria-modal="true"
                aria-label={titulo}
                className={`fixed inset-0 ${z} flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6`}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget && podeFechar) onClose();
                }}
            >
                <div
                    className={`flex max-h-[92dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-[90vh] lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12] ${max}`}
                >
                    <div className="flex items-start gap-3 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:px-6 lg:py-5">
                        {icone ? <div className="mt-0.5 shrink-0">{icone}</div> : null}
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[19px] font-extrabold leading-tight lg:text-xl">{titulo}</h2>
                            {subtitulo ? <p className={`mt-0.5 text-[13px] lg:mt-1 lg:text-sm ${TXT_SEC}`}>{subtitulo}</p> : null}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={!podeFechar}
                            className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[#EEF2F7] disabled:opacity-40 dark:hover:bg-white/[0.08]"
                            aria-label="Fechar"
                        >
                            <IconX size={20} stroke={1.8} />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6 lg:py-5">{children}</div>

                    {rodape ? (
                        <div className="flex gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end lg:gap-3 lg:px-6 lg:py-4 [&>*]:flex-1 lg:[&>*]:flex-none">
                            {rodape}
                        </div>
                    ) : null}
                </div>
            </div>
        </NoCorpo>
    );
}

function SeloSituacao({ agendada }: { agendada: boolean }) {
    return agendada ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#A9BED6] bg-[#E9EFF6] px-2 py-0.5 text-[11px] font-extrabold text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white">
            <IconCalendarTime size={12} stroke={2} />
            Agendada
        </span>
    ) : (
        <span className="shrink-0 rounded-full border border-[#7BA11A]/50 bg-[#EEF5D6] px-2 py-0.5 text-[11px] font-extrabold text-[#4A6310] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]">
            Publicada
        </span>
    );
}

/** Imagem da notícia ou, sem imagem, um ícone no fundo azul-claro. */
function Capa({ src, alt, className = "", sizes }: { src?: string | null; alt: string; className?: string; sizes: string }) {
    const [falhou, setFalhou] = useState(false);
    useEffect(() => setFalhou(false), [src]);

    return (
        <div className={`relative overflow-hidden bg-[#E9EFF6] dark:bg-[#3D6A99]/20 ${className}`}>
            {src && !falhou ? (
                <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" unoptimized onError={() => setFalhou(true)} />
            ) : (
                <div className="grid h-full w-full place-items-center text-[#3D6A99] dark:text-[#9DBBE0]">
                    <IconPhoto size={28} stroke={1.6} />
                </div>
            )}
        </div>
    );
}

/* ================== Página ================== */

export default function NoticiasAdminPage() {
    // listagem
    const [items, setItems] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [carregandoMais, setCarregandoMais] = useState(false);
    const [erroLista, setErroLista] = useState<string | null>(null);

    // busca servidor (com espera de 300 ms enquanto digita)
    const [busca, setBusca] = useState<string>("");
    const [q, setQ] = useState<string>("");
    useEffect(() => {
        const t = setTimeout(() => setQ(busca), 300);
        return () => clearTimeout(t);
    }, [busca]);

    // filtro de período (cliente)
    const [periodo, setPeriodo] = useState<Periodo>("todas");

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

    // avisos na página e exclusão
    const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
    const avisoTimer = useRef<number | null>(null);
    const [excluirRow, setExcluirRow] = useState<Row | null>(null);
    const [excluindo, setExcluindo] = useState(false);

    const fileRef = useRef<HTMLInputElement | null>(null);

    const mostrarAviso = useCallback((tipo: "ok" | "erro", texto: string) => {
        if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
        setAviso({ tipo, texto });
        if (tipo === "ok") avisoTimer.current = window.setTimeout(() => setAviso(null), 4000);
    }, []);

    useEffect(
        () => () => {
            if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
        },
        []
    );

    const isValid = useMemo(
        () => titulo.trim().length >= MIN_TITULO && conteudo.trim().length >= MIN_CONTEUDO,
        [titulo, conteudo]
    );

    // Prévia da imagem escolhida (arquivo local) ou do link.
    const [previaArquivo, setPreviaArquivo] = useState<string | null>(null);
    useEffect(() => {
        if (!imagemFile) {
            setPreviaArquivo(null);
            return;
        }
        const url = URL.createObjectURL(imagemFile);
        setPreviaArquivo(url);
        return () => URL.revokeObjectURL(url);
    }, [imagemFile]);
    const imagemPrevia = previaArquivo || imagemUrl.trim() || null;

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
                    setCarregandoMais(true);
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

                const data = (await r.json()) as ListResp;

                if (!r.ok) {
                    throw new Error("Falha ao carregar notícias.");
                }
                if (!data.ok) {
                    const errMsg = getRespErrorMessage(data) ?? "Falha ao carregar notícias.";
                    throw new Error(errMsg);
                }

                const pageItems = data.items.map((it) => ({
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
                }
                setHasMore(false);
            } finally {
                if (reset) setLoading(false);
                else setCarregandoMais(false);
            }
        },
        [q]
    );

    // Carrega na montagem e quando a busca (q) muda.
    useEffect(() => {
        void carregar(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

    // Com um período escolhido, busca as próximas páginas sozinho: o filtro de data é feito aqui na tela
    // e precisa enxergar todas as notícias, não só as 20 primeiras.
    useEffect(() => {
        if (periodo === "todas" || loading || carregandoMais || !hasMore || erroLista) return;
        void carregar(false);
    }, [periodo, loading, carregandoMais, hasMore, erroLista, carregar]);

    /* -------- filtro por período (cliente) -------- */
    const itemsFiltered = useMemo(() => {
        if (periodo === "todas") return items;
        const agora = new Date();
        return items.filter((i) => {
            const d = dataDe(i.publicado_em);
            if (!d) return false;
            if (periodo === "agendadas") return d.getTime() > agora.getTime();
            if (periodo === "mes") return d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth();
            const limite = agora.getTime() - 30 * 24 * 60 * 60 * 1000;
            return d.getTime() >= limite && d.getTime() <= agora.getTime();
        });
    }, [items, periodo]);

    /* -------- reset form -------- */
    const resetForm = () => {
        setEditId(null);
        setTitulo("");
        setConteudo("");
        setPublicadoEmInput("");
        setImagemUrl("");
        setImagemFile(null);
        setErroForm(null);
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
        if (fileRef.current) fileRef.current.value = "";
        setModalOpen(true);
    };

    const fecharModal = useCallback(() => {
        if (salvando) return;
        setModalOpen(false);
        setErroForm(null);
    }, [salvando]);

    const removerImagem = () => {
        setImagemFile(null);
        setImagemUrl("");
        if (fileRef.current) fileRef.current.value = "";
    };

    /* -------- submit (CREATE/UPDATE) -------- */
    const onSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setErroForm(null);

            if (!isValid) {
                setErroForm(`Preencha o título (mínimo ${MIN_TITULO} caracteres) e o conteúdo (mínimo ${MIN_CONTEUDO}).`);
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

                    const data = (await r.json()) as ApiOkCreate | ApiErr;

                    if (!r.ok) {
                        throw new Error("Falha ao criar.");
                    }
                    if (!data.ok) {
                        const msg = getRespErrorMessage(data) ?? "Falha ao criar.";
                        throw new Error(msg);
                    }

                    resetForm();
                    setModalOpen(false);
                    mostrarAviso("ok", publicado_em && ehAgendada(publicado_em) ? "Notícia agendada." : "Notícia publicada.");
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
                        const data = (await r.json()) as ApiOkBool | ApiErr;

                        if (!r.ok) {
                            throw new Error("Falha ao atualizar.");
                        }
                        if (!data.ok) {
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

                        const data = (await r.json()) as ApiOkBool | ApiErr;

                        if (!r.ok) {
                            throw new Error("Falha ao atualizar.");
                        }
                        if (!data.ok) {
                            const msg = getRespErrorMessage(data) ?? "Falha ao atualizar.";
                            throw new Error(msg);
                        }
                    }

                    setModalOpen(false);
                    mostrarAviso("ok", "Notícia atualizada.");
                    await carregar(true);
                }
            } catch (err) {
                setErroForm(err instanceof Error ? err.message : String(err));
            } finally {
                setSalvando(false);
            }
        },
        [isValid, editId, titulo, conteudo, publicadoEmInput, imagemUrl, imagemFile, carregar, mostrarAviso]
    );

    /* -------- deletar -------- */
    const excluir = async (row: Row) => {
        try {
            setExcluindo(true);
            const r = await fetch(`/api/noticias?id=${encodeURIComponent(row.id)}`, {
                method: "DELETE",
                headers: authHeaders(),
            });

            const data = (await r.json()) as ApiOkBool | ApiErr;

            if (!r.ok) {
                throw new Error("Falha ao excluir.");
            }
            if (!data.ok) {
                const msg = getRespErrorMessage(data) ?? "Falha ao excluir.";
                throw new Error(msg);
            }

            setExcluirRow(null);
            mostrarAviso("ok", "Notícia excluída.");
            await carregar(true);
        } catch (err) {
            setExcluirRow(null);
            mostrarAviso("erro", err instanceof Error ? err.message : String(err));
        } finally {
            setExcluindo(false);
        }
    };

    const periodos: { id: Periodo; nome: string }[] = [
        { id: "todas", nome: "Todas" },
        { id: "mes", nome: "Este mês" },
        { id: "30dias", nome: "Últimos 30 dias" },
        { id: "agendadas", nome: "Agendadas" },
    ];

    const tituloLen = titulo.trim().length;
    const conteudoLen = conteudo.trim().length;
    const previaData = publicadoEmInput ? `${publicadoEmInput}:00`.replace("T", " ") : "";

    /* -------- UI -------- */
    return (
        <div className="min-h-[calc(100dvh-1px)] bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-4 lg:px-10 lg:pb-12 lg:pt-8">
                {/* TOPO */}
                <header className="mb-4 flex flex-wrap items-start justify-between gap-3 lg:mb-6">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-extrabold leading-tight lg:text-[28px]">Notícias</h1>
                        <p className={`mt-1 text-sm ${TXT_SEC}`}>Avisos e novidades que aparecem no app dos associados.</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void carregar(true)}
                            disabled={loading}
                            className={BTN_ICONE}
                            title="Atualizar"
                            aria-label="Atualizar"
                        >
                            <IconRefresh size={20} stroke={1.8} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button type="button" onClick={startNovo} className={BTN_PRI}>
                            <IconPlus size={18} stroke={2.2} />
                            Nova notícia
                        </button>
                    </div>
                </header>

                {/* FILTROS */}
                <section className={`mb-4 ${CARD} p-3 lg:mb-5`}>
                    <span className="flex h-12 w-full min-w-0 items-center gap-2.5 rounded-xl border border-transparent bg-[#F1F4F8] px-3 text-[#5B6478] focus-within:border-[#3D6A99] focus-within:ring-2 focus-within:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                        <IconSearch size={20} stroke={1.8} className="shrink-0" />
                        <input
                            type="search"
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder="Buscar no título ou no conteúdo"
                            aria-label="Buscar notícia"
                            className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] dark:text-white dark:placeholder:text-[#8893AA]"
                        />
                    </span>

                    <div className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none]" role="group" aria-label="Período">
                        {periodos.map((p) => {
                            const on = periodo === p.id;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => setPeriodo(p.id)}
                                    className={[
                                        "h-10 shrink-0 whitespace-nowrap rounded-full border-[1.5px] px-4 text-sm font-bold transition",
                                        on
                                            ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]"
                                            : "border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08]",
                                    ].join(" ")}
                                >
                                    {p.nome}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* AVISOS */}
                {aviso ? (
                    <div
                        role={aviso.tipo === "erro" ? "alert" : "status"}
                        className={[
                            "mb-4 flex items-start gap-2 rounded-[14px] border px-4 py-3 text-sm font-bold",
                            aviso.tipo === "erro"
                                ? "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
                                : "border-[#B3CE52] bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/[0.18] dark:text-white",
                        ].join(" ")}
                    >
                        <span className="min-w-0 flex-1">{aviso.texto}</span>
                        <button type="button" onClick={() => setAviso(null)} className="-my-1 grid size-8 shrink-0 place-items-center rounded-lg hover:bg-black/5" aria-label="Fechar aviso">
                            <IconX size={16} stroke={2} />
                        </button>
                    </div>
                ) : null}

                {/* LISTA */}
                {loading ? (
                    <div className={`${CARD} p-6 text-center text-sm font-bold ${TXT_SEC}`}>Carregando…</div>
                ) : erroLista && items.length === 0 ? (
                    <div role="alert" className="rounded-[14px] border border-[#B42318] bg-[#FDECEA] px-4 py-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                        {erroLista}
                    </div>
                ) : (
                    <>
                        <p className={`mb-2.5 text-[13px] font-bold ${TXT_SEC}`}>
                            {itemsFiltered.length === 1 ? "1 notícia" : `${itemsFiltered.length} notícias`}
                            {periodo !== "todas" && hasMore ? " · buscando mais…" : ""}
                        </p>

                        {itemsFiltered.length === 0 ? (
                            <div className={`${CARD} px-6 py-10 text-center`}>
                                <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                                    <IconPhoto size={28} stroke={1.8} />
                                </span>
                                <p className="font-extrabold">Nenhuma notícia encontrada</p>
                                <p className={`mt-1 text-sm ${TXT_SEC}`}>Ajuste a busca ou o período, ou publique uma nova notícia.</p>
                            </div>
                        ) : (
                            <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
                                {itemsFiltered.map((row) => {
                                    const agendada = ehAgendada(row.publicado_em);
                                    return (
                                        <article key={row.id} className={`group flex min-w-0 overflow-hidden ${CARD}`}>
                                            <button
                                                type="button"
                                                onClick={() => startEditar(row)}
                                                className="shrink-0 p-3 pr-0"
                                                aria-label={`Editar ${row.titulo}`}
                                            >
                                                <Capa
                                                    src={row.imagem_url}
                                                    alt={row.titulo}
                                                    sizes="(min-width: 1024px) 170px, 112px"
                                                    className="h-[72px] w-[112px] rounded-xl lg:h-[96px] lg:w-[170px]"
                                                />
                                            </button>

                                            <div className="flex min-w-0 flex-1 flex-col p-3">
                                                <div className="flex items-start gap-2">
                                                    <button type="button" onClick={() => startEditar(row)} className="min-w-0 flex-1 text-left">
                                                        <h3 className="line-clamp-2 text-[15px] font-extrabold leading-snug group-hover:underline lg:text-base">{row.titulo}</h3>
                                                    </button>
                                                    <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditar(row)}
                                                            className="inline-grid size-10 place-items-center rounded-lg text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/[0.08]"
                                                            title="Editar"
                                                            aria-label={`Editar ${row.titulo}`}
                                                        >
                                                            <IconPencil size={18} stroke={1.8} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setExcluirRow(row)}
                                                            className="inline-grid size-10 place-items-center rounded-lg text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15"
                                                            title="Excluir"
                                                            aria-label={`Excluir ${row.titulo}`}
                                                        >
                                                            <IconTrash size={18} stroke={1.8} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <p className={`mt-1 line-clamp-2 text-[13.5px] leading-5 ${TXT_SEC}`}>{row.conteudo}</p>

                                                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                                                    <SeloSituacao agendada={agendada} />
                                                    <span className={`text-[12.5px] ${TXT_SEC}`}>{fmtData(row.publicado_em)}</span>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}

                        {erroLista && items.length > 0 ? (
                            <p role="alert" className="mt-3 text-sm font-bold text-[#B42318] dark:text-[#FF9C92]">
                                {erroLista}
                            </p>
                        ) : null}

                        {/* paginação */}
                        {periodo === "todas" && hasMore && !erroLista ? (
                            <button type="button" onClick={() => void carregar(false)} disabled={carregandoMais} className={`${BTN_SEC} mt-4 w-full`}>
                                {carregandoMais ? "Carregando…" : "Carregar mais"}
                            </button>
                        ) : null}
                    </>
                )}
            </div>

            {/* JANELA: NOVA / EDITAR */}
            {modalOpen ? (
                <Janela
                    titulo={editId ? "Editar notícia" : "Nova notícia"}
                    subtitulo="Aparece no app dos associados na data de publicação."
                    largura="lg"
                    onClose={fecharModal}
                    podeFechar={!salvando}
                    rodape={
                        <>
                            <button type="button" onClick={fecharModal} disabled={salvando} className={BTN_SEC}>
                                Voltar
                            </button>
                            <button
                                type="submit"
                                form="form-noticia"
                                disabled={salvando || !isValid}
                                className={BTN_PRI}
                                title={isValid ? undefined : "Preencha o título e o conteúdo"}
                            >
                                <IconCheck size={18} stroke={2.2} />
                                {salvando ? "Salvando..." : publicadoEmInput && ehAgendada(previaData) ? "Agendar" : "Publicar"}
                            </button>
                        </>
                    }
                >
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                        <form id="form-noticia" onSubmit={onSubmit} className="space-y-4">
                            <label className="block">
                                <span className={ROTULO}>
                                    Título <span className="text-[#B42318] dark:text-[#FF9C92]">*</span>
                                </span>
                                <input className={CAMPO} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título da notícia" />
                                <span className={`mt-1 block text-right text-[12px] ${tituloLen > 0 && tituloLen < MIN_TITULO ? "text-[#B42318] dark:text-[#FF9C92]" : TXT_SEC}`}>
                                    {tituloLen} {tituloLen === 1 ? "caractere" : "caracteres"}
                                    {tituloLen < MIN_TITULO ? ` · mínimo ${MIN_TITULO}` : ""}
                                </span>
                            </label>

                            <label className="block">
                                <span className={ROTULO}>
                                    Conteúdo <span className="text-[#B42318] dark:text-[#FF9C92]">*</span>
                                </span>
                                <textarea
                                    rows={7}
                                    className={`${CAMPO} h-auto min-h-[160px] py-3 leading-6`}
                                    value={conteudo}
                                    onChange={(e) => setConteudo(e.target.value)}
                                    placeholder="Texto completo da notícia"
                                />
                                <span className={`mt-1 block text-right text-[12px] ${conteudoLen > 0 && conteudoLen < MIN_CONTEUDO ? "text-[#B42318] dark:text-[#FF9C92]" : TXT_SEC}`}>
                                    {conteudoLen} {conteudoLen === 1 ? "caractere" : "caracteres"}
                                    {conteudoLen < MIN_CONTEUDO ? ` · mínimo ${MIN_CONTEUDO}` : ""}
                                </span>
                            </label>

                            <div>
                                <span className={ROTULO}>Imagem</span>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setImagemFile(e.target.files?.[0] || null)}
                                    className="sr-only"
                                    id="noticia-imagem"
                                />
                                {imagemPrevia ? (
                                    <div className="overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12]">
                                        <Capa src={imagemPrevia} alt="Prévia da imagem" sizes="600px" className="aspect-[16/9] w-full" />
                                        <div className="flex flex-wrap items-center gap-2 bg-[#F6F8FB] p-2 dark:bg-[#1C2334]">
                                            <span className={`min-w-0 flex-1 truncate px-1 text-[12.5px] ${TXT_SEC}`}>
                                                {imagemFile ? imagemFile.name : "Imagem pelo link"}
                                            </span>
                                            <label htmlFor="noticia-imagem" className={`${BTN_SEC} min-h-10 cursor-pointer`}>
                                                <IconUpload size={16} stroke={1.8} />
                                                Trocar
                                            </label>
                                            <button type="button" onClick={removerImagem} className={`${BTN_BASE} min-h-10 text-[#B42318] hover:bg-[#FDECEA] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15`}>
                                                <IconTrash size={16} stroke={1.8} />
                                                Remover
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <label
                                        htmlFor="noticia-imagem"
                                        className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#C9D1DE] bg-[#F6F8FB] px-4 py-8 text-center hover:border-[#3D6A99] hover:bg-[#E9EFF6] dark:border-white/20 dark:bg-[#1C2334] dark:hover:bg-[#3D6A99]/15"
                                    >
                                        <span className="grid size-11 place-items-center rounded-xl bg-white text-[#3D6A99] dark:bg-[#232B3F] dark:text-[#9DBBE0]">
                                            <IconUpload size={22} stroke={1.8} />
                                        </span>
                                        <span className="text-[15px] font-bold">Toque para escolher a imagem</span>
                                        <span className={`text-[12.5px] ${TXT_SEC}`}>JPG ou PNG, de preferência na horizontal</span>
                                    </label>
                                )}

                                {!imagemFile ? (
                                    <label className="mt-3 block">
                                        <span className={`mb-1 block text-[12.5px] font-bold ${TXT_SEC}`}>ou cole um link</span>
                                        <input value={imagemUrl} onChange={(e) => setImagemUrl(e.target.value)} placeholder="https://…" inputMode="url" className={CAMPO} />
                                    </label>
                                ) : null}
                            </div>

                            <label className="block">
                                <span className={ROTULO}>Agendar publicação (opcional)</span>
                                <input type="datetime-local" className={CAMPO} value={publicadoEmInput} onChange={(e) => setPublicadoEmInput(e.target.value)} />
                                <span className={`mt-1 block text-[12.5px] ${TXT_SEC}`}>Vazio = publica agora.</span>
                            </label>

                            {erroForm ? (
                                <div role="alert" className="rounded-xl border border-[#B42318] bg-[#FDECEA] px-3 py-2 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                                    {erroForm}
                                </div>
                            ) : null}
                        </form>

                        {/* PRÉVIA */}
                        <aside className="min-w-0">
                            <span className={ROTULO}>Como aparece no app</span>
                            <div className="rounded-[28px] border border-[#E3E8F0] bg-[#F6F8FB] p-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:sticky lg:top-0">
                                <div className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-[#232B3F]">
                                    <Capa src={imagemPrevia} alt="Prévia" sizes="300px" className="aspect-[16/9] w-full" />
                                    <div className="p-3">
                                        <p className={`text-[11.5px] font-bold ${TXT_SEC}`}>{previaData ? fmtData(previaData) : "Agora"}</p>
                                        <p className="mt-0.5 break-words text-[15px] font-extrabold leading-snug">{titulo.trim() || "Título da notícia"}</p>
                                        <p className={`mt-1 line-clamp-6 whitespace-pre-wrap break-words text-[13px] leading-5 ${TXT_SEC}`}>
                                            {conteudo.trim() || "O texto da notícia aparece aqui."}
                                        </p>
                                    </div>
                                </div>
                                <p className={`mt-2 px-1 text-[11.5px] ${TXT_SEC}`}>Prévia aproximada; o app pode ajustar o tamanho.</p>
                            </div>
                        </aside>
                    </div>
                </Janela>
            ) : null}

            {/* JANELA: EXCLUIR */}
            {excluirRow ? (
                <Janela
                    titulo="Excluir notícia?"
                    subtitulo="Ela sai do app dos associados. Esta ação não poderá ser desfeita."
                    largura="sm"
                    z="z-[80]"
                    onClose={() => setExcluirRow(null)}
                    podeFechar={!excluindo}
                    icone={
                        <span className="grid size-10 place-items-center rounded-xl bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                            <IconTrash size={20} stroke={1.8} />
                        </span>
                    }
                    rodape={
                        <>
                            <button type="button" onClick={() => setExcluirRow(null)} disabled={excluindo} className={BTN_SEC}>
                                Voltar
                            </button>
                            <button type="button" onClick={() => void excluir(excluirRow)} disabled={excluindo} className={BTN_PERIGO}>
                                {excluindo ? "Excluindo..." : "Excluir"}
                            </button>
                        </>
                    }
                >
                    <div className="flex items-center gap-3 rounded-[14px] border border-[#E3E8F0] bg-[#F6F8FB] p-3 dark:border-white/[0.12] dark:bg-[#1C2334]">
                        <Capa src={excluirRow.imagem_url} alt={excluirRow.titulo} sizes="80px" className="h-12 w-20 shrink-0 rounded-lg" />
                        <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-extrabold">{excluirRow.titulo}</p>
                            <p className={`text-[12.5px] ${TXT_SEC}`}>{fmtData(excluirRow.publicado_em)}</p>
                        </div>
                    </div>
                </Janela>
            ) : null}
        </div>
    );
}
