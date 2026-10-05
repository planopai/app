"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ID = number;

type Deposito = { id: ID; nome: string };
type Categoria = {
    id: ID;
    nome: string;
    ativo: 0 | 1 | number;
    atualizado_em?: string;
};
type Fabricante = {
    id: ID;
    nome: string;
    ativo: 0 | 1 | number;
    atualizado_em?: string;
};
type Classificacao = {
    id: ID;
    nome: string;
    ativo: 0 | 1 | number;
    atualizado_em?: string;
};

type ProdutoFoto = {
    id?: ID;
    produto_id?: ID;
    arquivo?: string | null;
    foto_url?: string | null;
    legenda?: string | null;
    ordem?: number;
    is_principal?: 0 | 1 | number;
};

type Produto = {
    id: ID;
    nome: string;
    descricao?: string | null;
    codigo_barras: string;
    valor: string | number;
    minimo: number;
    maximo?: number;
    foto_url?: string | null;
    fotos?: ProdutoFoto[];
    ativo: 0 | 1 | number;
    atualizado_em: string;
    categoria_id?: ID | null;
    fabricante_id?: ID | null;
    classificacao_id?: ID | null;
    classificacao_nome?: string | null;
    categoria_nome?: string | null;
    fabricante_nome?: string | null;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number;
    minimo: number;
    maximo: number;
    atualizado_em: string;
};

type Me = { id: ID; nome: string; usuario: string };

type InitResp = {
    ok: boolean;
    me: Me;
    depositos: Deposito[];
    categorias: Categoria[];
    fabricantes: Fabricante[];
    classificacoes: Classificacao[];
    produtos: Produto[];
    saldos: Saldo[];
    msg?: string;
    need_login?: 1;
};

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/materiais_gerais.php`;
const IMG_BASE = ENDPOINT;

function clampInt(v: unknown) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

function moneyBRL(n: number) {
    try {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(n);
    } catch {
        const safe = Number.isFinite(n) ? n : 0;
        return `R$ ${safe.toFixed(2)}`;
    }
}

function normalizeImgUrl(u?: string | null) {
    const t = (u ?? "").toString().trim();
    if (!t || t === "null" || t === "undefined") return null;
    if (/^data:image\//i.test(t)) return t;
    if (/^blob:/i.test(t)) return t;
    if (/^https?:\/\//i.test(t)) return t;

    const clean = t.startsWith("/") ? t : `/${t}`;
    if (clean.startsWith("/uploads/")) return `${IMG_BASE}${clean}`;

    return `${IMG_BASE}/uploads/produtos/${t.replace(/^\/+/, "")}`;
}

function resolveProdutoFotoUrl(f?: ProdutoFoto | null) {
    if (!f) return null;
    return normalizeImgUrl(f.foto_url || f.arquivo || null);
}

function getProdutoFotos(p?: Produto | null): ProdutoFoto[] {
    if (!p) return [];

    if (Array.isArray(p.fotos) && p.fotos.length) {
        return [...p.fotos].sort((a, b) => {
            const pa = Number(a.is_principal || 0) === 1 ? 0 : 1;
            const pb = Number(b.is_principal || 0) === 1 ? 0 : 1;
            if (pa !== pb) return pa - pb;
            return Number(a.ordem || 0) - Number(b.ordem || 0);
        });
    }

    if (p.foto_url) {
        return [
            {
                id: 0,
                produto_id: p.id,
                arquivo: p.foto_url,
                foto_url: p.foto_url,
                legenda: null,
                ordem: 1,
                is_principal: 1,
            },
        ];
    }

    return [];
}

function getProdutoFotoPrincipal(p?: Produto | null) {
    const fotos = getProdutoFotos(p);
    if (!fotos.length) return normalizeImgUrl(p?.foto_url || null);
    const principal =
        fotos.find((f) => Number(f.is_principal || 0) === 1) || fotos[0];
    return resolveProdutoFotoUrl(principal);
}

async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(
            `Resposta inesperada (${ct || "sem content-type"}). ${txt ? `Conteúdo: ${txt.slice(0, 160)}...` : ""}`.trim(),
        );
    }
    return (await r.json()) as T;
}

async function apiGet<T>(
    qs: Record<string, string | number | boolean | undefined>,
) {
    const u = new URL(API_BASE, window.location.origin);
    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined) return;
        u.searchParams.set(k, String(v));
    });

    const r = await fetch(u.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });

    return await safeJson<T>(r);
}

function Card({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section
            className={[
                "rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] shadow-sm",
                className,
            ].join(" ")}
        >
            {children}
        </section>
    );
}

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#313C55] dark:text-[#D6DCE8]">
                {label}
            </span>
            {children}
            {hint ? (
                <span className="mt-1 block text-[11px] text-[#5B6478] dark:text-[#AEB9CF]">{hint}</span>
            ) : null}
        </label>
    );
}

const TextInput = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className = "", ...props }, ref) {
    return (
        <input
            ref={ref}
            {...props}
            className={[
                "w-full rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-[16px] text-[#313C55] dark:text-white shadow-sm outline-none sm:text-sm",
                "focus:border-[#00AEEC] focus:ring-2 focus:ring-[#00AEEC]/30",
                className,
            ].join(" ")}
        />
    );
});

type Opt = { id: ID; nome: string };

function MultiSelectDropdown({
    label,
    options,
    selectedIds,
    onChangeIds,
    allLabel = "Todos",
    placeholder = "Selecionar...",
}: {
    label: string;
    options: Opt[];
    selectedIds: ID[];
    onChangeIds: (ids: ID[]) => void;
    allLabel?: string;
    placeholder?: string;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");

    const optMap = useMemo(
        () => new Map(options.map((o) => [o.id, o.nome])),
        [options],
    );

    const displayText = useMemo(() => {
        if (!selectedIds.length) return allLabel;
        const names = selectedIds.map((id) => optMap.get(id) || `#${id}`);
        if (names.length <= 2) return names.join(", ");
        return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
    }, [selectedIds, optMap, allLabel]);

    const filtered = useMemo(() => {
        const qq = q.trim().toLowerCase();
        if (!qq) return options;
        return options.filter((o) => o.nome.toLowerCase().includes(qq));
    }, [options, q]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target as any)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    function toggle(id: ID) {
        const has = selectedIds.includes(id);
        onChangeIds(
            has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
        );
    }

    return (
        <Field label={label}>
            <div ref={wrapRef} className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-[16px] text-[#313C55] dark:text-white shadow-sm outline-none focus:border-[#00AEEC] focus:ring-2 focus:ring-[#00AEEC]/30 sm:text-sm"
                >
                    <span
                        className={[
                            "truncate",
                            !selectedIds.length ? "text-[#5B6478] dark:text-[#AEB9CF]" : "text-[#313C55] dark:text-white",
                        ].join(" ")}
                    >
                        {displayText || placeholder}
                    </span>
                    <span className="text-[#5B6478] dark:text-[#AEB9CF]">▾</span>
                </button>

                {open ? (
                    <div className="absolute left-0 z-30 mt-2 w-full min-w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] shadow-lg">
                        <div className="border-b border-[#E3E8F0] dark:border-white/[0.12] p-2">
                            <TextInput
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Buscar..."
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    onChangeIds([]);
                                    setQ("");
                                }}
                                className="mt-2 rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 text-sm text-[#313C55] dark:text-[#D6DCE8] hover:bg-[#EEF2F7] dark:hover:bg-white/10"
                            >
                                Limpar
                            </button>
                        </div>

                        <div className="max-h-64 overflow-auto p-2">
                            <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-[#EEF2F7] dark:hover:bg-white/10">
                                <input
                                    type="checkbox"
                                    checked={!selectedIds.length}
                                    onChange={() => onChangeIds([])}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm text-[#313C55] dark:text-[#D6DCE8]">{allLabel}</span>
                            </label>

                            <div className="my-2 border-t border-[#E3E8F0] dark:border-white/[0.12]" />

                            {filtered.length === 0 ? (
                                <div className="p-2 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                    Nenhum encontrado.
                                </div>
                            ) : (
                                filtered.map((o) => (
                                    <label
                                        key={o.id}
                                        className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-[#EEF2F7] dark:hover:bg-white/10"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(o.id)}
                                            onChange={() => toggle(o.id)}
                                            className="h-4 w-4"
                                        />
                                        <span className="whitespace-nowrap text-sm text-[#313C55] dark:text-white">
                                            {o.nome}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </Field>
    );
}

function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "solid" | "ghost" | "soft";
}) {
    const base =
        "inline-flex items-center justify-center rounded-xl px-3 py-2 text-[16px] font-medium shadow-sm outline-none focus:ring-2 focus:ring-[#00AEEC]/30 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

    const cls =
        variant === "solid"
            ? "border border-[#313C55] dark:border-[#F2CB3F] bg-[#313C55] dark:bg-[#F2CB3F] text-white hover:bg-[#232B40] dark:hover:bg-[#E4BC30] dark:text-[#313C55]"
            : variant === "soft"
                ? "border border-[#E3E8F0] dark:border-white/[0.12] bg-[#EEF2F7] dark:bg-white/10 text-[#313C55] dark:text-white hover:bg-[#E3E8F0] dark:hover:bg-white/15"
                : "border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] text-[#313C55] dark:text-[#D6DCE8] hover:bg-[#EEF2F7] dark:hover:bg-white/10";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}

function FilterModal({
    open,
    onClose,
    qEstoque,
    setQEstoque,
    depositos,
    depFiltroEstoque,
    setDepFiltroEstoque,
    categorias,
    catFiltroEstoque,
    setCatFiltroEstoque,
    fabricantes,
    fabFiltroEstoque,
    setFabFiltroEstoque,
    classificacoes,
    classFiltroEstoque,
    setClassFiltroEstoque,
    onlyLow,
    setOnlyLow,
    onlyPositive,
    setOnlyPositive,
    limparFiltros,
    totalResultados,
}: {
    open: boolean;
    onClose: () => void;
    qEstoque: string;
    setQEstoque: (v: string) => void;
    depositos: Deposito[];
    depFiltroEstoque: ID[];
    setDepFiltroEstoque: (ids: ID[]) => void;
    categorias: Categoria[];
    catFiltroEstoque: ID[];
    setCatFiltroEstoque: (ids: ID[]) => void;
    fabricantes: Fabricante[];
    fabFiltroEstoque: ID[];
    setFabFiltroEstoque: (ids: ID[]) => void;
    classificacoes: Classificacao[];
    classFiltroEstoque: ID[];
    setClassFiltroEstoque: (ids: ID[]) => void;
    onlyLow: boolean;
    setOnlyLow: (v: boolean) => void;
    onlyPositive: boolean;
    setOnlyPositive: (v: boolean) => void;
    limparFiltros: () => void;
    totalResultados: number;
}) {
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const t = window.setTimeout(() => searchRef.current?.focus(), 80);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            window.clearTimeout(t);
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            role="dialog" data-pai-overlay
            aria-modal="true"
            className="fixed inset-0 z-50 flex min-h-[100dvh] items-end justify-center bg-[#313C55]/45 p-0 sm:items-center sm:p-4"
        >
            <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] shadow-2xl sm:max-w-5xl sm:rounded-3xl">
                <div className="flex items-start justify-between gap-3 border-b border-[#E3E8F0] dark:border-white/[0.12] p-4 sm:p-5">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-[#313C55] dark:text-white">
                            Filtros de produtos
                        </h2>
                        <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                            Busque e refine a consulta. Ao aplicar, o modal fecha e a lista
                            fica filtrada.
                        </p>
                    </div>
                    <button
                        className="rounded-xl px-3 py-2 text-sm text-[#5B6478] dark:text-[#AEB9CF] hover:bg-[#EEF2F7] dark:hover:bg-white/10"
                        onClick={onClose}
                        type="button"
                        aria-label="Fechar filtros"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <Field label="Pesquisar por nome">
                            <TextInput
                                ref={searchRef}
                                value={qEstoque}
                                onChange={(e) => setQEstoque(e.target.value)}
                                placeholder="Nome do produto..."
                            />
                        </Field>

                        <Field label="Filtros rápidos">
                            <div className="grid min-h-[42px] grid-cols-1 gap-2 rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] px-3 py-2 shadow-sm sm:grid-cols-2">
                                <label className="flex items-center gap-2 text-sm text-[#313C55] dark:text-[#D6DCE8]">
                                    <input
                                        type="checkbox"
                                        checked={onlyLow}
                                        onChange={(e) => setOnlyLow(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                    Somente alerta
                                </label>
                                <label className="flex items-center gap-2 text-sm text-[#313C55] dark:text-[#D6DCE8]">
                                    <input
                                        type="checkbox"
                                        checked={onlyPositive}
                                        onChange={(e) => setOnlyPositive(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                    Ocultar zerados
                                </label>
                            </div>
                        </Field>

                        <MultiSelectDropdown
                            label="Depósito"
                            options={depositos}
                            selectedIds={depFiltroEstoque}
                            onChangeIds={setDepFiltroEstoque}
                            allLabel="Todos"
                        />
                        <MultiSelectDropdown
                            label="Categoria"
                            options={categorias}
                            selectedIds={catFiltroEstoque}
                            onChangeIds={setCatFiltroEstoque}
                            allLabel="Todas"
                        />
                        <MultiSelectDropdown
                            label="Fabricante"
                            options={fabricantes}
                            selectedIds={fabFiltroEstoque}
                            onChangeIds={setFabFiltroEstoque}
                            allLabel="Todos"
                        />
                        <MultiSelectDropdown
                            label="Classificação"
                            options={classificacoes}
                            selectedIds={classFiltroEstoque}
                            onChangeIds={setClassFiltroEstoque}
                            allLabel="Todas"
                        />
                    </div>
                </div>

                <div className="border-t border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] p-4 sm:p-5">
                    <div className="mb-3 text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                        Resultado atual: <b>{totalResultados}</b> produto(s)
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            variant="ghost"
                            type="button"
                            onClick={() => {
                                limparFiltros();
                            }}
                            className="w-full sm:w-auto"
                        >
                            Limpar filtros
                        </Button>
                        <Button
                            variant="solid"
                            type="button"
                            onClick={onClose}
                            className="w-full sm:w-auto"
                        >
                            Aplicar filtros
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

type DepositoSaldoRow = {
    deposito: Deposito;
    quantidade: number;
    min: number;
    max: number;
    rep: number;
    hasMinMax: boolean;
};

function ProdutoDetalhesModal({
    open,
    onClose,
    produto,
    rows,
}: {
    open: boolean;
    onClose: () => void;
    produto?: Produto | null;
    rows: DepositoSaldoRow[];
}) {
    const [idx, setIdx] = useState(0);
    const [full, setFull] = useState(false);

    const fotos = useMemo(
        () =>
            getProdutoFotos(produto)
                .map((f) => resolveProdutoFotoUrl(f))
                .filter((u): u is string => !!u),
        [produto],
    );

    useEffect(() => {
        if (open) {
            setIdx(0);
            setFull(false);
        }
    }, [open, produto?.id]);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (full) setFull(false);
                else onClose();
            }
            if (fotos.length > 1 && e.key === "ArrowLeft") {
                setIdx((i) => (i + fotos.length - 1) % fotos.length);
            }
            if (fotos.length > 1 && e.key === "ArrowRight") {
                setIdx((i) => (i + 1) % fotos.length);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose, full, fotos.length]);

    if (!open || !produto) return null;

    const total = rows.reduce((acc, r) => acc + r.quantidade, 0);
    const foto = fotos.length ? fotos[Math.min(idx, fotos.length - 1)] : null;
    const prev = () => setIdx((i) => (i + fotos.length - 1) % fotos.length);
    const next = () => setIdx((i) => (i + 1) % fotos.length);

    const arrowCls =
        "absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#C9D1DE] dark:border-white/25 bg-white dark:bg-[#232B3F] text-[#313C55] dark:text-white shadow";

    return (
        <>
            <div
                role="dialog" data-pai-overlay
                aria-modal="true"
                aria-label="Detalhes do produto"
                className="fixed inset-0 z-[55] flex min-h-[100dvh] items-end justify-center bg-[#313C55]/45 p-0 sm:items-center sm:p-4"
            >
                <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] shadow-2xl sm:max-w-3xl sm:rounded-3xl sm:landscape:max-w-4xl">
                    <div className="flex items-start justify-between gap-3 border-b border-[#E3E8F0] dark:border-white/[0.12] p-4 sm:p-5">
                        <div className="min-w-0">
                            <h2 className="line-clamp-2 text-lg font-bold text-[#313C55] dark:text-white">
                                {produto.nome}
                            </h2>
                            <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                Quantidade total:{" "}
                                <b className="text-[#313C55] dark:text-white">{total}</b>
                            </p>
                        </div>
                        <button
                            className="rounded-xl px-3 py-2 text-sm text-[#5B6478] dark:text-[#AEB9CF] hover:bg-[#EEF2F7] dark:hover:bg-white/10"
                            onClick={onClose}
                            type="button"
                            aria-label="Fechar detalhes"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">
                        <div className="grid grid-cols-1 gap-5 sm:landscape:grid-cols-2 lg:grid-cols-2">
                            {/* FOTOS */}
                            <div className="min-w-0">
                                <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">
                                    Fotos do produto
                                </div>

                                {foto ? (
                                    <>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setFull(true)}
                                                aria-label="Ampliar foto em tela cheia"
                                                className="block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334]"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={foto}
                                                    alt={produto.nome}
                                                    className="h-56 w-full object-contain sm:h-72"
                                                />
                                            </button>

                                            <span className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-[#C9D1DE] dark:border-white/25 bg-white dark:bg-[#232B3F] px-3 py-1 text-xs font-extrabold text-[#313C55] dark:text-white">
                                                Tela cheia
                                            </span>

                                            {fotos.length > 1 ? (
                                                <>
                                                    <button type="button" onClick={prev} aria-label="Foto anterior" className={arrowCls + " left-2"}>
                                                        ‹
                                                    </button>
                                                    <button type="button" onClick={next} aria-label="Próxima foto" className={arrowCls + " right-2"}>
                                                        ›
                                                    </button>
                                                </>
                                            ) : null}
                                        </div>

                                        {fotos.length > 1 ? (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {fotos.map((u, i) => (
                                                    <button
                                                        key={`${u}-${i}`}
                                                        type="button"
                                                        onClick={() => setIdx(i)}
                                                        aria-label={`Ver foto ${i + 1}`}
                                                        className={[
                                                            "h-14 w-[76px] overflow-hidden rounded-xl border bg-[#F6F8FB] dark:bg-[#1C2334]",
                                                            i === idx
                                                                ? "border-2 border-[#313C55] dark:border-[#F2CB3F]"
                                                                : "border-[#E3E8F0] dark:border-white/[0.12]",
                                                        ].join(" ")}
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={u} alt="" className="h-full w-full object-cover" />
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                    </>
                                ) : (
                                    <div className="grid h-56 place-items-center rounded-2xl border border-dashed border-[#C9D1DE] dark:border-white/25 text-sm text-[#5B6478] dark:text-[#AEB9CF] sm:h-72">
                                        Produto sem fotos
                                    </div>
                                )}
                            </div>

                            {/* PREÇO E DISTRIBUIÇÃO */}
                            <div className="min-w-0 space-y-4">
                                <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] px-4 py-3">
                                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">
                                        Preço de venda
                                    </div>
                                    <div className="text-3xl font-extrabold leading-tight text-[#313C55] dark:text-white">
                                        {moneyBRL(Number(produto.valor) || 0)}
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:text-[#AEB9CF]">
                                        Distribuição do estoque
                                    </div>

                                    {rows.length === 0 ? (
                                        <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] p-4 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                            Nenhum local com unidade deste produto.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {rows.map((r) => (
                                                <div
                                                    key={r.deposito.id}
                                                    className="flex items-center justify-between gap-3 rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] p-3 shadow-sm"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold text-[#313C55] dark:text-white">
                                                            {r.deposito.nome}
                                                        </p>
                                                        {r.hasMinMax ? (
                                                            <p className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                                                Min {r.min} • Rep {r.rep}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">Quantidade</p>
                                                        <p className="text-xl font-bold text-[#313C55] dark:text-white">
                                                            {r.quantidade}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] p-4 sm:flex sm:justify-end sm:p-5">
                        <Button variant="ghost" type="button" onClick={onClose} className="w-full sm:w-auto">
                            Fechar
                        </Button>
                    </div>
                </div>
            </div>

            {full && foto ? (
                <div
                    role="dialog" data-pai-overlay
                    aria-modal="true"
                    aria-label="Foto em tela cheia"
                    className="fixed inset-0 z-[70] flex min-h-[100dvh] flex-col bg-[#0E1320] text-white"
                >
                    <div className="flex items-center gap-2 py-2.5 pl-4 pr-3">
                        <div className="min-w-0 flex-1 truncate text-[15px] font-extrabold">
                            {produto.nome}
                            {fotos.length > 1 ? ` · Foto ${idx + 1} de ${fotos.length}` : ""}
                        </div>
                        <button
                            type="button"
                            onClick={() => setFull(false)}
                            className="h-11 rounded-xl border border-white/40 px-4 text-sm font-extrabold text-white hover:bg-white/10"
                        >
                            Sair da tela cheia
                        </button>
                    </div>

                    <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={foto} alt={produto.nome} className="max-h-full max-w-full object-contain" />

                        {fotos.length > 1 ? (
                            <>
                                <button
                                    type="button"
                                    onClick={prev}
                                    aria-label="Foto anterior"
                                    className="absolute left-4 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-[#0E1320] text-xl text-white"
                                >
                                    ‹
                                </button>
                                <button
                                    type="button"
                                    onClick={next}
                                    aria-label="Próxima foto"
                                    className="absolute right-4 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-[#0E1320] text-xl text-white"
                                >
                                    ›
                                </button>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </>
    );
}

function PhotoThumb({
    url,
    onClick,
    className = "",
}: {
    url?: string | null;
    onClick?: () => void;
    className?: string;
}) {
    const cleanUrl = normalizeImgUrl(url);
    const clickable = !!cleanUrl && !!onClick;

    return (
        <button
            type="button"
            onClick={clickable ? onClick : undefined}
            className={[
                "relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] text-[#5B6478] dark:text-[#AEB9CF] sm:h-24 sm:w-24",
                clickable
                    ? "cursor-zoom-in hover:ring-2 hover:ring-[#00AEEC]/30"
                    : "cursor-default",
                className,
            ].join(" ")}
            aria-label={clickable ? "Abrir imagem do produto" : "Sem imagem"}
            title={clickable ? "Clique para ampliar" : "Sem imagem"}
        >
            {cleanUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={cleanUrl}
                    alt="Foto do produto"
                    className="h-full w-full rounded-2xl object-cover"
                />
            ) : (
                <span className="text-2xl">🖼️</span>
            )}

            {clickable ? (
                <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-full bg-white dark:bg-[#232B3F] px-1.5 py-0.5 text-[10px] shadow ring-1 ring-[#00AEEC]/30">
                    🔍
                </span>
            ) : null}
        </button>
    );
}

export default function Page() {
    const [loading, setLoading] = useState(true);
    const [initErr, setInitErr] = useState("");

    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [fabricantes, setFabricantes] = useState<Fabricante[]>([]);
    const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);

    const [qEstoque, setQEstoque] = useState("");
    const [depFiltroEstoque, setDepFiltroEstoque] = useState<ID[]>([]);
    const [catFiltroEstoque, setCatFiltroEstoque] = useState<ID[]>([]);
    const [fabFiltroEstoque, setFabFiltroEstoque] = useState<ID[]>([]);
    const [classFiltroEstoque, setClassFiltroEstoque] = useState<ID[]>([]);
    const [onlyLow, setOnlyLow] = useState(false);
    const [onlyPositive, setOnlyPositive] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);

    const [produtoDepositosOpen, setProdutoDepositosOpen] = useState(false);
    const [selectedProduto, setSelectedProduto] = useState<Produto | null>(null);

    const depById = useMemo(
        () => new Map(depositos.map((d) => [d.id, d])),
        [depositos],
    );
    const prodById = useMemo(
        () => new Map(produtos.map((p) => [p.id, p])),
        [produtos],
    );
    const catById = useMemo(
        () => new Map(categorias.map((c) => [c.id, c])),
        [categorias],
    );
    const fabById = useMemo(
        () => new Map(fabricantes.map((f) => [f.id, f])),
        [fabricantes],
    );
    const classById = useMemo(
        () => new Map(classificacoes.map((c) => [c.id, c])),
        [classificacoes],
    );

    async function refreshInit() {
        setLoading(true);
        setInitErr("");

        try {
            const j = await apiGet<InitResp>({ init: 1, _ts: Date.now() });
            if (!j.ok) throw new Error(j.msg || "Falha no init");

            setDepositos(j.depositos || []);
            setCategorias((j.categorias || []).filter((c) => Number(c.ativo) === 1));
            setFabricantes(
                (j.fabricantes || []).filter((f) => Number(f.ativo) === 1),
            );
            setClassificacoes(
                (j.classificacoes || []).filter((c) => Number(c.ativo) === 1),
            );
            setProdutos((j.produtos || []).filter((p) => Number(p.ativo) === 1));
            setSaldos(j.saldos || []);
        } catch (e: any) {
            setInitErr(e?.message || "Erro ao carregar.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refreshInit();

        const onFocus = () => refreshInit();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Um lançamento por produto: a quantidade é a soma dos locais (respeitando o
     * filtro de depósito). A busca olha somente o nome do produto.
     * "Alerta" = algum local está no mínimo ou abaixo.
     */
    const produtosAgregados = useMemo(() => {
        const qq = qEstoque.trim().toLowerCase();

        const depSet = depFiltroEstoque.length
            ? new Set(depFiltroEstoque.map(Number))
            : null;
        const catSet = catFiltroEstoque.length
            ? new Set(catFiltroEstoque.map(Number))
            : null;
        const fabSet = fabFiltroEstoque.length
            ? new Set(fabFiltroEstoque.map(Number))
            : null;
        const clsSet = classFiltroEstoque.length
            ? new Set(classFiltroEstoque.map(Number))
            : null;

        const porProduto = new Map<ID, { p: Produto; total: number; low: boolean }>();

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            if (depSet && !depSet.has(d.id)) continue;
            if (catSet && !catSet.has(Number(p.categoria_id || 0))) continue;
            if (fabSet && !fabSet.has(Number(p.fabricante_id || 0))) continue;
            if (clsSet && !clsSet.has(Number(p.classificacao_id || 0))) continue;

            const qtd = clampInt(s.quantidade);
            const min = clampInt((s as any).minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);
            const hasMinMax = min > 0 && max > 0;

            const atual = porProduto.get(p.id) || { p, total: 0, low: false };
            atual.total += qtd;
            if (hasMinMax && qtd <= min) atual.low = true;
            porProduto.set(p.id, atual);
        }

        const rows = Array.from(porProduto.values()).filter(
            (r) =>
                (!qq || r.p.nome.toLowerCase().includes(qq)) &&
                (!onlyLow || r.low) &&
                (!onlyPositive || r.total > 0),
        );

        rows.sort((x, y) => x.p.nome.localeCompare(y.p.nome, "pt-BR"));
        return rows;
    }, [
        saldos,
        prodById,
        depById,
        qEstoque,
        depFiltroEstoque,
        catFiltroEstoque,
        fabFiltroEstoque,
        classFiltroEstoque,
        onlyLow,
        onlyPositive,
    ]);

    const selectedProdutoDepositos = useMemo<DepositoSaldoRow[]>(() => {
        if (!selectedProduto) return [];

        const rows: DepositoSaldoRow[] = [];

        for (const s of saldos) {
            if (Number(s.produto_id) !== Number(selectedProduto.id)) continue;

            const deposito = depById.get(s.deposito_id);
            if (!deposito) continue;

            const quantidade = clampInt(s.quantidade);
            if (quantidade <= 0) continue;

            const min = clampInt((s as any).minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);
            const hasMinMax = min > 0 && max > 0;
            const rep = hasMinMax ? Math.max(0, max - quantidade) : 0;

            rows.push({ deposito, quantidade, min, max, rep, hasMinMax });
        }

        rows.sort((a, b) => a.deposito.nome.localeCompare(b.deposito.nome, "pt-BR"));
        return rows;
    }, [selectedProduto, saldos, depById]);

    function abrirDepositosDoProduto(produto: Produto) {
        setSelectedProduto(produto);
        setProdutoDepositosOpen(true);
    }

    function limparFiltros() {
        setQEstoque("");
        setDepFiltroEstoque([]);
        setCatFiltroEstoque([]);
        setFabFiltroEstoque([]);
        setClassFiltroEstoque([]);
        setOnlyLow(false);
        setOnlyPositive(false);
    }

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] dark:bg-[#161C2A] p-4 text-[#313C55] dark:text-white sm:p-6">
            <div className="mx-auto w-full max-w-7xl space-y-4">
                {initErr ? (
                    <div className="rounded-2xl border border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-3 text-sm text-[#B42318] dark:text-[#FF9C92]">
                        {initErr}
                    </div>
                ) : null}

                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8396] dark:text-[#8893AA]">
                            🔎
                        </span>
                        <TextInput
                            value={qEstoque}
                            onChange={(e) => setQEstoque(e.target.value)}
                            placeholder="Pesquisar produto pelo nome..."
                            className="pl-10"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => setFilterOpen(true)}
                        className="inline-flex h-[42px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F] text-xl text-[#313C55] dark:text-[#D6DCE8] shadow-sm outline-none hover:bg-[#EEF2F7] dark:hover:bg-white/10 focus:ring-2 focus:ring-[#00AEEC]/30"
                        aria-label="Abrir filtros"
                        title="Abrir filtros"
                    >
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
                        </svg>
                    </button>
                </div>

                <Card className="overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-[#E3E8F0] dark:border-white/[0.12] p-4">
                        <div>
                            <h2 className="text-base font-semibold text-[#313C55] dark:text-white">
                                Produtos em estoque
                            </h2>
                            <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                {loading
                                    ? "Carregando..."
                                    : `${produtosAgregados.length} produto(s) encontrado(s).`}
                            </p>
                        </div>
                    </div>

                    <div className="hidden overflow-x-auto lg:block">
                        <table className="min-w-full divide-y divide-[#E3E8F0] dark:divide-white/[0.12] text-left text-sm">
                            <thead className="bg-[#F6F8FB] dark:bg-[#1C2334] text-xs uppercase tracking-wide text-[#5B6478] dark:text-[#AEB9CF]">
                                <tr>
                                    <th className="w-28 px-4 py-3">Foto</th>
                                    <th className="px-4 py-3">Produto</th>
                                    <th className="px-4 py-3">Categoria</th>
                                    <th className="px-4 py-3">Fabricante</th>
                                    <th className="px-4 py-3 text-right">Qtd</th>
                                    <th className="px-4 py-3 text-right">Valor un.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E3E8F0] dark:divide-white/[0.12] bg-white dark:bg-[#232B3F]">
                                {!loading && produtosAgregados.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="px-4 py-8 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]"
                                        >
                                            Nenhum produto encontrado com os filtros atuais.
                                        </td>
                                    </tr>
                                ) : null}

                                {produtosAgregados.map(({ p, total, low }) => {
                                    const img = getProdutoFotoPrincipal(p);
                                    const cat =
                                        p.categoria_nome ||
                                        (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") ||
                                        "—";
                                    const fab =
                                        p.fabricante_nome ||
                                        (p.fabricante_id
                                            ? fabById.get(p.fabricante_id)?.nome
                                            : "") ||
                                        "—";

                                    return (
                                        <tr
                                            key={p.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => abrirDepositosDoProduto(p)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    abrirDepositosDoProduto(p);
                                                }
                                            }}
                                            className={[
                                                "cursor-pointer outline-none hover:bg-[#EEF2F7] dark:hover:bg-white/10 focus:ring-2 focus:ring-inset focus:ring-[#00AEEC]/30",
                                                low ? "bg-[#FCF3CC]/70 dark:bg-[#F2CB3F]/10" : "",
                                            ].join(" ")}
                                        >
                                            <td className="px-4 py-3 align-top">
                                                <PhotoThumb url={img} className="h-24 w-24" />
                                            </td>
                                            <td className="px-4 py-3 font-medium text-[#313C55] dark:text-white">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-bold">{p.nome}</span>
                                                    {low ? (
                                                        <span className="rounded-full bg-[#F2CB3F] px-2.5 py-0.5 text-xs font-extrabold text-[#313C55]">
                                                            alerta
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div className="mt-0.5 text-xs font-normal text-[#5B6478] dark:text-[#AEB9CF]">
                                                    CB: {p.codigo_barras || "—"}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-[#5B6478] dark:text-[#AEB9CF]">{cat}</td>
                                            <td className="px-4 py-3 text-[#5B6478] dark:text-[#AEB9CF]">{fab}</td>
                                            <td className="px-4 py-3 text-right text-lg font-extrabold text-[#313C55] dark:text-white">
                                                {total}
                                            </td>
                                            <td className="px-4 py-3 text-right text-[#313C55] dark:text-[#D6DCE8]">
                                                {moneyBRL(Number(p.valor) || 0)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-1 gap-3 p-4 lg:hidden">
                        {!loading && produtosAgregados.length === 0 ? (
                            <div className="rounded-2xl border border-[#E3E8F0] dark:border-white/[0.12] bg-[#F6F8FB] dark:bg-[#1C2334] p-4 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                                Nenhum produto encontrado com os filtros atuais.
                            </div>
                        ) : null}

                        {produtosAgregados.map(({ p, total, low }) => {
                            const img = getProdutoFotoPrincipal(p);
                            const cat =
                                p.categoria_nome ||
                                (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") ||
                                "—";

                            return (
                                <div
                                    key={p.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => abrirDepositosDoProduto(p)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            abrirDepositosDoProduto(p);
                                        }
                                    }}
                                    className={[
                                        "cursor-pointer rounded-2xl border p-3 outline-none transition hover:border-[#C9D1DE] dark:hover:border-white/25 hover:shadow-sm focus:ring-2 focus:ring-[#00AEEC]/30",
                                        low
                                            ? "border-[#F2CB3F] bg-[#FCF3CC] dark:bg-[#F2CB3F]/15"
                                            : "border-[#E3E8F0] dark:border-white/[0.12] bg-white dark:bg-[#232B3F]",
                                    ].join(" ")}
                                >
                                    <div className="flex gap-4">
                                        <PhotoThumb url={img} />
                                        <div className="min-w-0 flex-1">
                                            <p className="line-clamp-2 font-semibold text-[#313C55] dark:text-white">
                                                {p.nome}
                                            </p>
                                            <p className="mt-1 truncate text-xs font-medium text-[#5B6478] dark:text-[#AEB9CF]">
                                                {cat}
                                            </p>
                                            <p className="mt-0.5 flex items-center gap-2 truncate text-xs font-semibold text-[#313C55] dark:text-white">
                                                {moneyBRL(Number(p.valor) || 0)}
                                                {low ? (
                                                    <span className="rounded-full bg-[#F2CB3F] px-2 py-0.5 text-[11px] font-extrabold text-[#313C55]">
                                                        alerta
                                                    </span>
                                                ) : null}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">Qtd</p>
                                            <p className="text-xl font-bold text-[#313C55] dark:text-white">{total}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>

            <FilterModal
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                qEstoque={qEstoque}
                setQEstoque={setQEstoque}
                depositos={depositos}
                depFiltroEstoque={depFiltroEstoque}
                setDepFiltroEstoque={setDepFiltroEstoque}
                categorias={categorias}
                catFiltroEstoque={catFiltroEstoque}
                setCatFiltroEstoque={setCatFiltroEstoque}
                fabricantes={fabricantes}
                fabFiltroEstoque={fabFiltroEstoque}
                setFabFiltroEstoque={setFabFiltroEstoque}
                classificacoes={classificacoes}
                classFiltroEstoque={classFiltroEstoque}
                setClassFiltroEstoque={setClassFiltroEstoque}
                onlyLow={onlyLow}
                setOnlyLow={setOnlyLow}
                onlyPositive={onlyPositive}
                setOnlyPositive={setOnlyPositive}
                limparFiltros={limparFiltros}
                totalResultados={produtosAgregados.length}
            />

            <ProdutoDetalhesModal
                open={produtoDepositosOpen}
                onClose={() => setProdutoDepositosOpen(false)}
                produto={selectedProduto}
                rows={selectedProdutoDepositos}
            />
        </main>
    );
}
