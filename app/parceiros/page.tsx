"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Nunito } from "next/font/google";

/* ====== Fonte Nunito (Next Font) ====== */
const nunito = Nunito({
    subsets: ["latin"],
    weight: ["400", "600", "700", "800"],
});

/* ================== Tipos ================== */
type ApiOkCreate = { ok: true; id: number };
type ApiOkBool = { ok: true; deleted?: boolean; updated?: boolean };
type ApiErr = { ok: false; error: string };

type Row = {
    id: number;
    nome: string;
    categoria: string;
    foto_url: string;
    beneficio?: string | null;
    regras?: string | null;
    como_usar?: string | null;
    rota_url?: string | null;
    whatsapp?: string | null;
    instagram_url?: string | null;
    telefone?: string | null;
};

type ListRespOk = { ok: true; items: Row[] };
type ListRespErr = { ok: false; error: string };
type ListResp = ListRespOk | ListRespErr;

const CATEGORIES = [
    "Farmácias",
    "Mercados",
    "Academias",
    "Construção",
    "Educação",
    "Gratuitos",
    "Veículos",
    "Saúde",
] as const;

/* ================== Helpers ================== */
const asS = (v: unknown) => (typeof v === "string" ? v : "");
const isHttpUrl = (s?: string | null) => !!s && /^https?:\/\//i.test(s);

// PHP exige estes headers em TODAS as chamadas
const API_KEY = process.env.NEXT_PUBLIC_PAI_PARTNERS_API_KEY ?? "PlanoPAI2024#";

function authHeaders(extra?: HeadersInit): HeadersInit {
    return {
        "X-PAI-KEY": API_KEY,
        "X-Requested-With": "XMLHttpRequest",
        ...(extra ?? {}),
    };
}

/* ================== Modal ================== */
function Modal({
    open,
    onClose,
    title,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">
            <div
                className={`w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 ${nunito.className}`}
            >
                <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
                    <button
                        onClick={onClose}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        Fechar
                    </button>
                </div>
                <div className="max-h-[80vh] overflow-auto p-4">{children}</div>
            </div>
        </div>
    );
}

/* ================== Página ================== */
export default function ParceirosGestaoPage() {
    // lista
    const [items, setItems] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);

    // filtros
    const [fCat, setFCat] = useState<string>("");
    const [fQ, setFQ] = useState<string>("");

    // modal/form
    const [modalOpen, setModalOpen] = useState(false);

    // form (create/update)
    const [editId, setEditId] = useState<number | null>(null); // null = novo
    const [nome, setNome] = useState("");
    const [categoria, setCategoria] = useState("");
    const [beneficio, setBeneficio] = useState("");
    const [regras, setRegras] = useState("");
    const [comoUsar, setComoUsar] = useState("");
    const [rotaUrl, setRotaUrl] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [instagram, setInstagram] = useState("");
    const [telefone, setTelefone] = useState("");
    const [fotoFile, setFotoFile] = useState<File | null>(null);
    const [fotoPreview, setFotoPreview] = useState<string>("");

    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);
    const [msgOk, setMsgOk] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const isValid = useMemo(() => {
        if (editId) return nome.trim().length >= 2 && categoria.trim().length > 0;
        return nome.trim().length >= 2 && categoria.trim().length > 0 && !!fotoFile;
    }, [editId, nome, categoria, fotoFile]);

    /* -------- carregar lista -------- */
    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            setErroLista(null);

            const qs = new URLSearchParams();
            qs.set("list", "1");
            if (fCat) qs.set("categoria", fCat);
            if (fQ) qs.set("q", fQ);

            const r = await fetch(`/api/parceiros?${qs.toString()}`, {
                cache: "no-store",
                headers: authHeaders(),
            });

            const data = (await r.json()) as ListResp;

            if (!r.ok) {
                setErroLista("Falha ao carregar lista.");
                setItems([]);
                return;
            }

            if (!data.ok) {
                setErroLista((data as ListRespErr).error || "Falha ao carregar lista.");
                setItems([]);
                return;
            }

            setItems((data as ListRespOk).items);
        } catch (err) {
            setErroLista(err instanceof Error ? err.message : String(err));
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [fCat, fQ]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    /* -------- helpers form -------- */
    const resetFileInput = () => {
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const startNovo = () => {
        setEditId(null);
        setNome("");
        setCategoria("");
        setBeneficio("");
        setRegras("");
        setComoUsar("");
        setRotaUrl("");
        setWhatsapp("");
        setInstagram("");
        setTelefone("");
        setFotoFile(null);
        setFotoPreview("");
        setErroForm(null);
        setMsgOk(null);
        resetFileInput();
        setModalOpen(true);
    };

    const startEditar = (row: Row) => {
        setEditId(row.id);
        setNome(row.nome);
        setCategoria(row.categoria);
        setBeneficio(asS(row.beneficio));
        setRegras(asS(row.regras));
        setComoUsar(asS(row.como_usar));
        setRotaUrl(asS(row.rota_url));
        setWhatsapp(asS(row.whatsapp));
        setInstagram(asS(row.instagram_url));
        setTelefone(asS(row.telefone));
        setFotoFile(null); // não obrigar novo upload
        setFotoPreview(isHttpUrl(row.foto_url) ? row.foto_url : "");
        setErroForm(null);
        setMsgOk(null);
        resetFileInput();
        setModalOpen(true);
    };

    /* -------- upload local preview -------- */
    const onFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] || null;
        setFotoFile(f);
        setFotoPreview(f ? URL.createObjectURL(f) : editId ? fotoPreview : "");
    };

    /* -------- salvar -------- */
    const onSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setErroForm(null);
            setMsgOk(null);

            if (!isValid) {
                setErroForm(
                    editId ? "Preencha ao menos Nome e Categoria." : "Preencha Nome, Categoria e selecione uma Foto."
                );
                return;
            }

            try {
                setSalvando(true);

                if (editId === null) {
                    // ======= CREATE =======
                    const fd = new FormData();
                    fd.append("nome", nome.trim());
                    fd.append("categoria", categoria.trim());
                    if (beneficio.trim()) fd.append("beneficio", beneficio.trim());
                    if (regras.trim()) fd.append("regras", regras.trim());
                    if (comoUsar.trim()) fd.append("como_usar", comoUsar.trim());
                    if (rotaUrl.trim()) fd.append("rota_url", rotaUrl.trim());
                    if (whatsapp.trim()) fd.append("whatsapp", whatsapp.trim());
                    if (instagram.trim()) fd.append("instagram_url", instagram.trim());
                    if (telefone.trim()) fd.append("telefone", telefone.trim());
                    if (fotoFile) fd.append("foto", fotoFile);

                    const r = await fetch("/api/parceiros", {
                        method: "POST",
                        body: fd,
                        headers: authHeaders(), // NÃO setar Content-Type manualmente
                    });

                    const data = (await r.json()) as ApiOkCreate | ApiErr;

                    if (!r.ok) {
                        throw new Error("Falha ao criar.");
                    }
                    if (!data.ok) {
                        throw new Error((data as ApiErr).error || "Falha ao criar.");
                    }

                    setMsgOk(`Parceiro criado (ID ${(data as ApiOkCreate).id}).`);
                    // limpa para novo em série
                    setNome("");
                    setBeneficio("");
                    setRegras("");
                    setComoUsar("");
                    setRotaUrl("");
                    setWhatsapp("");
                    setInstagram("");
                    setTelefone("");
                    setFotoFile(null);
                    setFotoPreview("");
                    resetFileInput();
                } else {
                    // ======= UPDATE (?_method=PUT) =======
                    const url = `/api/parceiros?id=${encodeURIComponent(editId)}&_method=PUT`;

                    const fd = new FormData();
                    fd.append("nome", nome.trim());
                    fd.append("categoria", categoria.trim());
                    fd.append("beneficio", beneficio.trim());
                    fd.append("regras", regras.trim());
                    fd.append("como_usar", comoUsar.trim());
                    fd.append("rota_url", rotaUrl.trim());
                    fd.append("whatsapp", whatsapp.trim());
                    fd.append("instagram_url", instagram.trim());
                    fd.append("telefone", telefone.trim());
                    if (fotoFile) fd.append("foto", fotoFile);

                    const r = await fetch(url, { method: "POST", body: fd, headers: authHeaders() });
                    const data = (await r.json()) as ApiOkBool | ApiErr;

                    if (!r.ok) {
                        throw new Error("Falha ao atualizar.");
                    }
                    if (!data.ok) {
                        throw new Error((data as ApiErr).error || "Falha ao atualizar.");
                    }

                    setMsgOk("Parceiro atualizado com sucesso.");
                    setModalOpen(false);
                }

                await carregar();
            } catch (err) {
                setErroForm(err instanceof Error ? err.message : String(err));
            } finally {
                setSalvando(false);
            }
        },
        [
            isValid,
            editId,
            nome,
            categoria,
            beneficio,
            regras,
            comoUsar,
            rotaUrl,
            whatsapp,
            instagram,
            telefone,
            fotoFile,
            carregar,
        ]
    );

    /* -------- deletar -------- */
    const confirmarExcluir = async (row: Row) => {
        const ok = window.confirm(`Confirmar exclusão do parceiro "${row.nome}"?`);
        if (!ok) return;

        try {
            const r = await fetch(`/api/parceiros?id=${encodeURIComponent(row.id)}&_method=DELETE`, {
                method: "POST",
                headers: authHeaders(),
            });
            const data = (await r.json()) as ApiOkBool | ApiErr;

            if (!r.ok) {
                alert("Falha ao excluir.");
                return;
            }
            if (!data.ok) {
                alert((data as ApiErr).error || "Falha ao excluir.");
                return;
            }

            if (editId === row.id) {
                setModalOpen(false);
                setEditId(null);
            }
            await carregar();
        } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
        }
    };

    /* -------- lista filtrada -------- */
    const itemsFiltered = useMemo(() => {
        const byCat = fCat ? items.filter((i) => i.categoria === fCat) : items;
        const q = fQ.trim().toLowerCase();
        if (!q) return byCat;
        return byCat.filter((i) => i.nome.toLowerCase().includes(q));
    }, [items, fCat, fQ]);

    return (
        <div className={`${nunito.className} p-4 sm:p-6 xl:p-8`}>
            <div className="mx-auto w-full max-w-6xl">
                {/* cabeçalho */}
                <header className="mb-6 flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Parceiros</h1>
                    <Link
                        href="/"
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        Voltar
                    </Link>
                </header>

                {/* filtros / ação */}
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                        <input
                            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                            placeholder="Pesquisar por nome…"
                            value={fQ}
                            onChange={(e) => setFQ(e.target.value)}
                        />
                        <select
                            className="w-full sm:w-56 rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                            value={fCat}
                            onChange={(e) => setFCat(e.target.value)}
                        >
                            <option value="">Todas as categorias</option>
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={startNovo}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
                    >
                        Adicionar Novo Parceiro
                    </button>
                </div>

                {/* lista - UMA COLUNA */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    {loading ? (
                        <div className="p-4 text-gray-600 dark:text-gray-300">Carregando…</div>
                    ) : erroLista ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900/50 dark:bg-red-900/20">
                            {erroLista}
                        </div>
                    ) : itemsFiltered.length === 0 ? (
                        <div className="p-4 text-gray-600 dark:text-gray-300">Nenhum parceiro encontrado.</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {itemsFiltered.map((row) => (
                                <div
                                    key={row.id}
                                    className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                                >
                                    <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                                        {row.foto_url ? (
                                            <Image
                                                src={isHttpUrl(row.foto_url) ? row.foto_url : "/images/logo/pai.png"}
                                                alt={row.nome}
                                                fill
                                                sizes="64px"
                                                className="object-cover"
                                                unoptimized={!isHttpUrl(row.foto_url)}
                                            />
                                        ) : (
                                            <div className="grid h-full place-items-center text-xs text-gray-500">sem foto</div>
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{row.nome}</p>
                                        <p className="truncate text-xs text-gray-600 dark:text-gray-300">{row.categoria}</p>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => startEditar(row)}
                                            className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
                                        >
                                            Editar
                                        </button>
                                        <button
                                            onClick={() => void confirmarExcluir(row)}
                                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
                                        >
                                            Excluir
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Modal do Form */}
                <Modal
                    open={modalOpen}
                    onClose={() => {
                        setModalOpen(false);
                        setErroForm(null);
                        setMsgOk(null);
                    }}
                    title={editId ? `Editar Parceiro #${editId}` : "Cadastrar Parceiro"}
                >
                    <form onSubmit={onSubmit} className="grid gap-6">
                        {/* linha principal */}
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Nome*</label>
                                <input
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                    value={nome}
                                    onChange={(e) => setNome(e.target.value)}
                                    placeholder="Nome do parceiro"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Categoria*</label>
                                <select
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                    value={categoria}
                                    onChange={(e) => setCategoria(e.target.value)}
                                >
                                    <option value="">Selecione…</option>
                                    {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* foto + preview */}
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="md:col-span-2">
                                <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Foto/Logo{editId ? " (opcional para alterar)" : "*"}
                                </label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={onFoto}
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                />
                                <p className="mt-1 text-xs text-gray-500">Formatos: .jpg, .png, .webp ou .gif. Tamanho máx. 5MB.</p>
                            </div>

                            <div className="flex items-end">
                                <div className="relative h-24 w-full overflow-hidden rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                                    {fotoPreview ? (
                                        <Image
                                            src={fotoPreview}
                                            alt="Prévia do logo"
                                            fill
                                            sizes="120px"
                                            className="object-contain"
                                            unoptimized={!isHttpUrl(fotoPreview)}
                                        />
                                    ) : (
                                        <div className="grid h-full place-items-center text-xs text-gray-500">Prévia do logo</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* textos longos */}
                        <div className="grid gap-4 md:grid-cols-3">
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Benefício</label>
                                <textarea
                                    rows={4}
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                    value={beneficio}
                                    onChange={(e) => setBeneficio(e.target.value)}
                                    placeholder="Ex.: 20% em produtos selecionados…"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Regras (uma por linha)
                                </label>
                                <textarea
                                    rows={4}
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                    value={regras}
                                    onChange={(e) => setRegras(e.target.value)}
                                    placeholder={"Válido para associados com carteirinha.\nNão cumulativo com outras promoções."}
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Como usar</label>
                                <textarea
                                    rows={4}
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                    value={comoUsar}
                                    onChange={(e) => setComoUsar(e.target.value)}
                                    placeholder="Ex.: Apresente a carteirinha digital e documento com foto…"
                                />
                            </div>
                        </div>

                        {/* contatos / rota */}
                        <div className="grid gap-4 md:grid-cols-3">
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Link de Rota (Google Maps)
                                </label>
                                <input
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                    value={rotaUrl}
                                    onChange={(e) => setRotaUrl(e.target.value)}
                                    placeholder="https://maps.google.com/?q=..."
                                />
                                {rotaUrl.trim() ? (
                                    <p className="mt-1 text-xs">
                                        <a className="text-blue-600 underline" href={rotaUrl} target="_blank" rel="noopener noreferrer">
                                            Abrir rota em nova aba
                                        </a>
                                    </p>
                                ) : null}
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    WhatsApp (com DDI/DDD)
                                </label>
                                <input
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(e.target.value)}
                                    placeholder="+55 11 98888-0000"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Telefone</label>
                                <input
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                    value={telefone}
                                    onChange={(e) => setTelefone(e.target.value)}
                                    placeholder="(11) 3333-0000"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Instagram (URL)</label>
                            <input
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                                value={instagram}
                                onChange={(e) => setInstagram(e.target.value)}
                                placeholder="https://instagram.com/nome_do_parceiro"
                            />
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
                </Modal>
            </div>
        </div>
    );
}
