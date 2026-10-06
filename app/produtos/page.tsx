"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconFilter,
    IconMaximize,
    IconMinimize,
    IconPhoto,
    IconSearch,
    IconX,
} from "@tabler/icons-react";

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

/* ------------------------------------------------------------------ */
/* Apresentação (mockup "Consulta de produtos", 06/10/2026)            */
/* ------------------------------------------------------------------ */

const FIELD_CLS =
    "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]";

const LABEL_CLS = "mb-2 block text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

const KV_CLS = "text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

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
                "border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]",
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
        <label className="block min-w-0">
            <span className={LABEL_CLS}>{label}</span>
            {children}
            {hint ? (
                <span className="mt-1 block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{hint}</span>
            ) : null}
        </label>
    );
}

const TextInput = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className = "", ...props }, ref) {
    return <input ref={ref} {...props} className={[FIELD_CLS, className].join(" ")} />;
});

type Opt = { id: ID; nome: string };

/** Lista suspensa de seleção múltipla (usada no Fabricante). */
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

    const optCls = "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2 hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]";

    return (
        <div className="min-w-0">
            <span className={LABEL_CLS}>{label}</span>
            <div ref={wrapRef} className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-label={label}
                    className={[FIELD_CLS, "flex items-center justify-between gap-2 text-left"].join(" ")}
                >
                    <span className="truncate">{displayText || placeholder}</span>
                    <IconChevronDown size={18} stroke={1.8} aria-hidden="true" className="shrink-0 text-[#5B6478] dark:text-[#AEB9CF]" />
                </button>

                {open ? (
                    <div className="absolute left-0 z-30 mt-2 w-full min-w-[280px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white shadow-lg dark:border-white/[0.12] dark:bg-[#232B3F]">
                        <div className="flex gap-2 border-b border-[#E3E8F0] p-2 dark:border-white/[0.12]">
                            <TextInput
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Buscar..."
                                aria-label={`Buscar ${label.toLowerCase()}`}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    onChangeIds([]);
                                    setQ("");
                                }}
                                className="h-12 shrink-0 rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-3 text-sm font-bold text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08]"
                            >
                                Limpar
                            </button>
                        </div>

                        <div className="max-h-64 overflow-auto p-2 text-sm">
                            <label className={optCls}>
                                <input
                                    type="checkbox"
                                    checked={!selectedIds.length}
                                    onChange={() => onChangeIds([])}
                                    className="size-5"
                                />
                                <span>{allLabel}</span>
                            </label>

                            <div className="my-1 border-t border-[#E3E8F0] dark:border-white/[0.12]" />

                            {filtered.length === 0 ? (
                                <div className="p-2 text-[#5B6478] dark:text-[#AEB9CF]">Nenhum encontrado.</div>
                            ) : (
                                filtered.map((o) => (
                                    <label key={o.id} className={optCls}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(o.id)}
                                            onChange={() => toggle(o.id)}
                                            className="size-5"
                                        />
                                        <span className="whitespace-nowrap">{o.nome}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

/** Chips de seleção múltipla (.fchip do mockup). Mesma seleção de antes: lista de ids. */
function ChipsMulti({
    label,
    options,
    selectedIds,
    onChangeIds,
}: {
    label: string;
    options: Opt[];
    selectedIds: ID[];
    onChangeIds: (ids: ID[]) => void;
}) {
    function toggle(id: ID) {
        const has = selectedIds.includes(id);
        onChangeIds(has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    }

    return (
        <div>
            <p className={LABEL_CLS}>{label}</p>
            {options.length === 0 ? (
                <p className="text-sm text-[#5B6478] dark:text-[#AEB9CF]">Nenhuma opção.</p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {options.map((o) => {
                        const on = selectedIds.includes(o.id);
                        return (
                            <button
                                key={o.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() => toggle(o.id)}
                                className={[
                                    "h-11 rounded-full border-[1.5px] px-3.5 text-sm font-bold lg:h-10",
                                    on
                                        ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]"
                                        : "border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08]",
                                ].join(" ")}
                            >
                                {o.nome}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Button({
    children,
    variant = "ghost",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "solid" | "ghost";
}) {
    const base =
        "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-[18px] text-[15px] font-bold outline-none focus:ring-2 focus:ring-[#3D6A99]/20 disabled:cursor-not-allowed disabled:opacity-45";

    const cls =
        variant === "solid"
            ? "border-[1.5px] border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]"
            : "border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08]";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}

/** Selo com o número de filtros ativos. */
function CountBadge({ n, floating }: { n: number; floating?: boolean }) {
    return (
        <span
            className={[
                "inline-flex items-center justify-center rounded-full bg-[#F2CB3F] font-extrabold text-[#313C55]",
                floating ? "absolute -right-1.5 -top-1.5 h-5 min-w-5 px-1 text-xs" : "h-[22px] min-w-[22px] px-1.5 text-xs",
            ].join(" ")}
        >
            {n}
        </span>
    );
}

/**
 * Janelas abertas direto no <body> (06/10/2026). A página rola dentro de um contêiner e, no iPhone,
 * a barra de baixo (z-40) ficava por cima. Só chama createPortal depois de montar no cliente.
 */
function NoCorpo({ children }: { children: React.ReactNode }) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);
    return montado ? createPortal(children, document.body) : null;
}

/**
 * Janela: no computador (lg) diálogo centralizado; no celular folha que sobe de baixo.
 * Quem chama cuida do Esc e do bloqueio de rolagem.
 */
function Janela({
    label,
    title,
    subtitle,
    onClose,
    closeLabel,
    footer,
    children,
    maxWidth,
}: {
    label: string;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    onClose: () => void;
    closeLabel: string;
    footer: React.ReactNode;
    children: React.ReactNode;
    maxWidth: string;
}) {
    return (
        <NoCorpo>
            <div role="dialog" data-pai-overlay aria-modal="true" aria-label={label} className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6">
                <div
                    className={[
                        "flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] dark:bg-[#232B3F] dark:text-white lg:max-h-full lg:rounded-3xl lg:border lg:border-[#E3E8F0] lg:shadow-2xl lg:dark:border-white/[0.12]",
                        maxWidth,
                    ].join(" ")}
                >
                    <div className="flex items-start gap-2 border-b border-[#E3E8F0] pb-3 pl-5 pr-2 pt-4 dark:border-white/[0.12] lg:gap-3 lg:px-6 lg:py-5">
                        <div className="min-w-0 flex-1">
                            <h2 className="line-clamp-2 text-[19px] font-extrabold leading-tight lg:text-xl">{title}</h2>
                            {subtitle ? <p className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:mt-1 lg:text-sm">{subtitle}</p> : null}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={closeLabel}
                            className="grid size-11 shrink-0 place-items-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/[0.08]"
                        >
                            <IconX size={20} stroke={1.8} aria-hidden="true" />
                        </button>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto overscroll-contain px-5 py-4 lg:gap-5 lg:px-6 lg:py-5">{children}</div>

                    <div className="flex flex-col gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:flex-row lg:items-center lg:justify-end lg:gap-3 lg:px-6 lg:py-4">
                        {footer}
                    </div>
                </div>
            </div>
        </NoCorpo>
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

    const quickCls = "flex min-h-12 items-center gap-2.5 text-[15px] font-semibold";

    return (
        <Janela
            label="Filtros de produtos"
            title="Filtros de produtos"
            subtitle={
                <>
                    <span className="hidden lg:inline">Busque e refine a consulta. Ao aplicar, a janela fecha e a lista fica filtrada.</span>
                    <span className="lg:hidden">Ao aplicar, a lista fica filtrada.</span>
                </>
            }
            onClose={onClose}
            closeLabel="Fechar filtros"
            maxWidth="max-w-[600px] lg:max-w-[760px]"
            footer={
                <>
                    <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:flex-1 lg:text-sm">
                        Resultado atual: <b className="text-[#313C55] dark:text-white">{totalResultados}</b> produto(s)
                    </span>
                    <div className="flex gap-2 lg:gap-3">
                        <Button type="button" onClick={() => limparFiltros()} className="flex-1 lg:flex-none">
                            Limpar filtros
                        </Button>
                        <Button type="button" variant="solid" onClick={onClose} className="flex-1 lg:flex-none">
                            Aplicar filtros
                        </Button>
                    </div>
                </>
            }
        >
            <Field label="Pesquisar por nome">
                <TextInput
                    ref={searchRef}
                    type="search"
                    value={qEstoque}
                    onChange={(e) => setQEstoque(e.target.value)}
                    placeholder="Nome do produto…"
                />
            </Field>

            <div>
                <p className={LABEL_CLS}>Filtros rápidos</p>
                <div className="flex flex-col rounded-xl bg-[#F1F4F8] px-3.5 dark:bg-[#1C2334] lg:min-h-12 lg:flex-row lg:flex-wrap lg:items-center lg:gap-6">
                    <label className={quickCls}>
                        <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="size-5" />
                        Somente alerta
                    </label>
                    <label className={[quickCls, "border-t border-[#E3E8F0] dark:border-white/[0.12] lg:border-t-0"].join(" ")}>
                        <input type="checkbox" checked={onlyPositive} onChange={(e) => setOnlyPositive(e.target.checked)} className="size-5" />
                        Ocultar zerados
                    </label>
                </div>
            </div>

            <ChipsMulti label="Depósito" options={depositos} selectedIds={depFiltroEstoque} onChangeIds={setDepFiltroEstoque} />
            <ChipsMulti label="Categoria" options={categorias} selectedIds={catFiltroEstoque} onChangeIds={setCatFiltroEstoque} />
            <MultiSelectDropdown
                label="Fabricante"
                options={fabricantes}
                selectedIds={fabFiltroEstoque}
                onChangeIds={setFabFiltroEstoque}
                allLabel="Todos"
            />
            <ChipsMulti label="Classificação" options={classificacoes} selectedIds={classFiltroEstoque} onChangeIds={setClassFiltroEstoque} />
        </Janela>
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
    const atual = Math.min(idx, Math.max(0, fotos.length - 1));
    const foto = fotos.length ? fotos[atual] : null;
    const fotoLabel = fotos.length ? `Foto ${atual + 1} de ${fotos.length}` : "";
    const prev = () => setIdx((i) => (i + fotos.length - 1) % fotos.length);
    const next = () => setIdx((i) => (i + 1) % fotos.length);

    const arrowCls =
        "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-[#C9D1DE] bg-white text-[#313C55] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white";

    return (
        <>
            <Janela
                label="Detalhes do produto"
                title={produto.nome}
                subtitle={
                    <>
                        Quantidade total: <b className="text-[#313C55] dark:text-white">{total}</b>
                    </>
                }
                onClose={onClose}
                closeLabel="Fechar detalhes"
                maxWidth="max-w-[820px] lg:max-w-[860px]"
                footer={
                    <Button type="button" onClick={onClose} className="w-full lg:w-auto">
                        Fechar
                    </Button>
                }
            >
                <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 max-lg:landscape:grid-cols-2">
                    {/* FOTOS */}
                    <div className="min-w-0">
                        <div className={[KV_CLS, "mb-2"].join(" ")}>Fotos do produto</div>

                        {foto ? (
                            <>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setFull(true)}
                                        aria-label="Ampliar foto em tela cheia"
                                        className="block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-[#E3E8F0] bg-[#F6F8FB] dark:border-white/[0.12] dark:bg-[#1C2334]"
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={foto} alt={produto.nome} className="h-[220px] w-full object-contain lg:h-[320px]" />
                                    </button>

                                    <span className="pointer-events-none absolute bottom-2.5 right-2.5 flex h-8 items-center gap-1.5 rounded-full border border-[#C9D1DE] bg-white px-3 text-[13px] font-extrabold text-[#313C55] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white">
                                        <IconMaximize size={16} stroke={2} aria-hidden="true" />
                                        Tela cheia
                                    </span>

                                    {fotos.length > 1 ? (
                                        <>
                                            <button type="button" onClick={prev} aria-label="Foto anterior" className={arrowCls + " left-2.5"}>
                                                <IconChevronLeft size={22} stroke={2} aria-hidden="true" />
                                            </button>
                                            <button type="button" onClick={next} aria-label="Próxima foto" className={arrowCls + " right-2.5"}>
                                                <IconChevronRight size={22} stroke={2} aria-hidden="true" />
                                            </button>
                                        </>
                                    ) : null}
                                </div>

                                <div className="mt-2.5 flex flex-wrap gap-2">
                                    {fotos.map((u, i) => (
                                        <button
                                            key={`${u}-${i}`}
                                            type="button"
                                            onClick={() => setIdx(i)}
                                            aria-label={`Ver foto ${i + 1}`}
                                            className={[
                                                "h-[58px] w-[76px] overflow-hidden rounded-xl bg-[#F6F8FB] dark:bg-[#1C2334]",
                                                i === atual
                                                    ? "border-2 border-[#313C55] dark:border-white"
                                                    : "border border-[#E3E8F0] dark:border-white/[0.12]",
                                            ].join(" ")}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={u} alt="" className="h-full w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="grid h-[220px] place-items-center rounded-2xl border border-dashed border-[#C9D1DE] text-sm text-[#5B6478] dark:border-white/[0.26] dark:text-[#AEB9CF] lg:h-[320px]">
                                Produto sem fotos
                            </div>
                        )}
                    </div>

                    {/* PREÇO E DISTRIBUIÇÃO */}
                    <div className="flex min-w-0 flex-col gap-4">
                        <div className="rounded-[14px] border border-[#E3E8F0] bg-[#F6F8FB] px-4 py-3 dark:border-white/[0.12] dark:bg-[#1C2334]">
                            <div className={KV_CLS}>Preço de venda</div>
                            <div className="text-[30px] font-extrabold leading-tight">{moneyBRL(Number(produto.valor) || 0)}</div>
                        </div>

                        <div>
                            <div className={[KV_CLS, "mb-2"].join(" ")}>Distribuição do estoque</div>

                            {rows.length === 0 ? (
                                <div className="rounded-2xl border border-[#E3E8F0] p-5 text-center text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]">
                                    Nenhum local com unidade deste produto.
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2.5">
                                    {rows.map((r) => (
                                        <div
                                            key={r.deposito.id}
                                            className="flex items-center gap-3 rounded-2xl border border-[#E3E8F0] bg-white px-4 py-3 dark:border-white/[0.12] dark:bg-[#232B3F]"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[15px] font-extrabold">{r.deposito.nome}</p>
                                                {r.hasMinMax ? (
                                                    <p className="mt-0.5 text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                                        Min {r.min} • Rep {r.rep}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">Quantidade</p>
                                                <p className="text-[22px] font-extrabold leading-[1.1]">{r.quantidade}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Janela>

            {full && foto ? (
                <NoCorpo>
                    <div
                        role="dialog"
                        data-pai-overlay
                        aria-modal="true"
                        aria-label="Foto em tela cheia"
                        className="fixed inset-0 z-[70] flex min-h-[100dvh] flex-col bg-[#0E1320] text-white"
                    >
                        <div className="flex items-center gap-2 py-2.5 pl-4 pr-3">
                            <div className="min-w-0 flex-1 truncate text-[15px] font-extrabold">
                                {produto.nome} · {fotoLabel}
                            </div>
                            <button
                                type="button"
                                onClick={() => setFull(false)}
                                className="inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-white/40 px-4 text-sm font-extrabold text-white hover:bg-white/10"
                            >
                                <IconMinimize size={18} stroke={2} aria-hidden="true" />
                                Sair da tela cheia
                            </button>
                        </div>

                        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={foto} alt={produto.nome} className="max-h-full max-w-full object-contain" />

                            {fotos.length > 1 ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={prev}
                                        aria-label="Foto anterior"
                                        className="absolute left-6 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full border-[1.5px] border-white/40 bg-[#0E1320] text-white"
                                    >
                                        <IconChevronLeft size={24} stroke={2} aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={next}
                                        aria-label="Próxima foto"
                                        className="absolute right-6 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full border-[1.5px] border-white/40 bg-[#0E1320] text-white"
                                    >
                                        <IconChevronRight size={24} stroke={2} aria-hidden="true" />
                                    </button>
                                </>
                            ) : null}
                        </div>
                    </div>
                </NoCorpo>
            ) : null}
        </>
    );
}

/** Miniatura da lista (só exibe; a linha inteira é que abre os detalhes). */
function PhotoThumb({ url, className = "" }: { url?: string | null; className?: string }) {
    const cleanUrl = normalizeImgUrl(url);

    return (
        <span
            className={[
                "flex shrink-0 items-center justify-center overflow-hidden text-[#7A8396] dark:text-[#8893AA]",
                cleanUrl ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : "bg-[#F6F8FB] dark:bg-[#1C2334]",
                className,
            ].join(" ")}
        >
            {cleanUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cleanUrl} alt="" className="h-full w-full object-cover" />
            ) : (
                <IconPhoto size={24} stroke={1.6} aria-hidden="true" />
            )}
        </span>
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

    // Referências estáveis: evitam que as janelas refaçam o efeito (e o foco) a cada digitação.
    const fecharFiltros = useCallback(() => setFilterOpen(false), []);
    const fecharDetalhes = useCallback(() => setProdutoDepositosOpen(false), []);

    function limparFiltros() {
        setQEstoque("");
        setDepFiltroEstoque([]);
        setCatFiltroEstoque([]);
        setFabFiltroEstoque([]);
        setClassFiltroEstoque([]);
        setOnlyLow(false);
        setOnlyPositive(false);
    }

    const nFiltros =
        (onlyLow ? 1 : 0) +
        (onlyPositive ? 1 : 0) +
        (depFiltroEstoque.length ? 1 : 0) +
        (catFiltroEstoque.length ? 1 : 0) +
        (fabFiltroEstoque.length ? 1 : 0) +
        (classFiltroEstoque.length ? 1 : 0);

    const contagem = loading ? "Carregando..." : `${produtosAgregados.length} produto(s) encontrado(s).`;
    const vazio = !loading && produtosAgregados.length === 0;
    const DESK_COLS = "grid-cols-[3fr_1.7fr_1fr_.7fr_1.1fr]";
    const thCls = "text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

    const nomeCategoria = (p: Produto) =>
        p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "—";
    const nomeFabricante = (p: Produto) =>
        p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "—";

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:px-10 lg:pb-12 lg:pt-8">
            <div className="mx-auto w-full max-w-[1120px]">
                <div className="px-4 pb-3 pt-3.5 lg:mb-5 lg:p-0">
                    <h1 className="text-[28px] font-extrabold leading-tight">Consulta de produtos</h1>
                    <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                        Veja a quantidade de cada produto. <span className="lg:hidden">Toque</span>
                        <span className="hidden lg:inline">Clique</span> num produto para ver preço, estoque por local e fotos.
                    </p>
                </div>

                {initErr ? (
                    <div className="mx-4 mb-3 rounded-xl border border-[#B42318]/40 bg-[#FDECEA] p-3 text-sm text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92] lg:mx-0 lg:mb-4">
                        {initErr}
                    </div>
                ) : null}

                <Card className="border-x-0 lg:overflow-hidden lg:rounded-[20px] lg:border-x">
                    {/* Busca + filtros (no celular fica presa no topo enquanto a lista rola) */}
                    <div className="sticky top-0 z-10 border-b border-[#E3E8F0] bg-white px-4 pb-3 pt-3 dark:border-white/[0.12] dark:bg-[#232B3F] lg:static lg:border-b-0 lg:bg-transparent lg:p-0">
                        <div className="flex items-center gap-2 lg:gap-3 lg:px-6 lg:py-5">
                            <label className="relative min-w-0 flex-1">
                                <IconSearch
                                    size={20}
                                    stroke={1.8}
                                    aria-hidden="true"
                                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5B6478] dark:text-[#AEB9CF]"
                                />
                                <TextInput
                                    type="search"
                                    value={qEstoque}
                                    onChange={(e) => setQEstoque(e.target.value)}
                                    placeholder="Pesquisar produto pelo nome…"
                                    aria-label="Pesquisar produto pelo nome"
                                    className="pl-11"
                                />
                            </label>

                            {/* Celular: só ícone (48px) com selo flutuante */}
                            <button
                                type="button"
                                onClick={() => setFilterOpen(true)}
                                aria-label="Filtros"
                                aria-haspopup="dialog"
                                className="relative grid size-12 shrink-0 place-items-center rounded-xl border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:hidden"
                            >
                                <IconFilter size={20} stroke={1.8} aria-hidden="true" />
                                {nFiltros > 0 ? <CountBadge n={nFiltros} floating /> : null}
                            </button>

                            {/* Computador: texto "Filtros" com selo */}
                            <Button type="button" onClick={() => setFilterOpen(true)} aria-haspopup="dialog" className="max-lg:!hidden">
                                <IconFilter size={20} stroke={1.8} aria-hidden="true" />
                                Filtros
                                {nFiltros > 0 ? <CountBadge n={nFiltros} /> : null}
                            </Button>
                        </div>

                        <div className="mt-2.5 lg:mt-0 lg:flex lg:items-baseline lg:gap-3 lg:px-6 lg:pb-3.5">
                            <h2 className="text-base font-extrabold lg:text-lg">Produtos em estoque</h2>
                            <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:text-sm">{contagem}</span>
                        </div>
                    </div>

                    {/* Computador: tabela */}
                    <div className="hidden overflow-x-auto border-t border-[#E3E8F0] dark:border-white/[0.12] lg:block">
                        <div className="min-w-[780px]">
                            <div className="flex gap-3 bg-[#F6F8FB] pl-6 dark:bg-[#1C2334]">
                                <div className="w-16 shrink-0" />
                                <div className={["grid min-w-0 flex-1 items-center gap-3 py-3 pr-6", DESK_COLS].join(" ")}>
                                    <div className={thCls}>Produto</div>
                                    <div className={thCls}>Categoria</div>
                                    <div className={thCls}>Fabricante</div>
                                    <div className={[thCls, "text-right"].join(" ")}>Qtd</div>
                                    <div className={[thCls, "text-right"].join(" ")}>Valor un.</div>
                                </div>
                            </div>

                            {produtosAgregados.map(({ p, total, low }) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => abrirDepositosDoProduto(p)}
                                    aria-label={`Abrir detalhes de ${p.nome}`}
                                    className={[
                                        "flex w-full items-center gap-3 border-t border-[#E3E8F0] pl-6 text-left text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-[#3D6A99]/20 dark:border-white/[0.12]",
                                        low
                                            ? "bg-[#FCF3CC] hover:bg-[#F8E9A6] dark:bg-[#F2CB3F]/[0.16] dark:hover:bg-[#F2CB3F]/25"
                                            : "bg-white hover:bg-[#EEF2F7] dark:bg-[#232B3F] dark:hover:bg-white/[0.08]",
                                    ].join(" ")}
                                >
                                    <PhotoThumb url={getProdutoFotoPrincipal(p)} className="size-16 rounded-[14px]" />
                                    <span className={["grid min-w-0 flex-1 items-center gap-3 py-3 pr-6", DESK_COLS].join(" ")}>
                                        <span className="min-w-0">
                                            <span className="flex flex-wrap items-center gap-2 font-extrabold">
                                                {p.nome}
                                                {low ? (
                                                    <span className="inline-flex h-[22px] items-center rounded-full bg-[#F2CB3F] px-2.5 text-xs font-extrabold text-[#313C55]">
                                                        alerta
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span className="mt-0.5 block text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                                CB: {p.codigo_barras || "Sem código"}
                                            </span>
                                        </span>
                                        <span className="text-[13px]">{nomeCategoria(p)}</span>
                                        <span className="text-[13px]">{nomeFabricante(p)}</span>
                                        <span className="text-right text-lg font-extrabold">{total}</span>
                                        <span className="text-right">{moneyBRL(Number(p.valor) || 0)}</span>
                                    </span>
                                </button>
                            ))}

                            {vazio ? (
                                <div className="border-t border-[#E3E8F0] p-8 text-center text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]">
                                    Nenhum produto encontrado com os filtros atuais.
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Celular (em pé e deitado): lista corrida com divisórias */}
                    <div className="lg:hidden">
                        {produtosAgregados.map(({ p, total, low }) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => abrirDepositosDoProduto(p)}
                                aria-label={`Abrir detalhes de ${p.nome}`}
                                className={[
                                    "flex min-h-[76px] w-full items-center gap-3 border-b border-[#E3E8F0] px-4 py-2.5 text-left dark:border-white/[0.12]",
                                    low ? "bg-[#FCF3CC] dark:bg-[#F2CB3F]/[0.16]" : "bg-white dark:bg-[#232B3F]",
                                ].join(" ")}
                            >
                                <PhotoThumb url={getProdutoFotoPrincipal(p)} className="size-[52px] rounded-xl" />
                                <span className="block min-w-0 flex-1">
                                    <span className="block text-[15px] font-extrabold leading-tight">{p.nome}</span>
                                    <span className="mt-0.5 block truncate text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{nomeCategoria(p)}</span>
                                    <span className="mt-0.5 flex items-center gap-2 text-[12.5px] font-bold">
                                        {moneyBRL(Number(p.valor) || 0)}
                                        {low ? (
                                            <span className="inline-flex h-5 items-center rounded-full bg-[#F2CB3F] px-2 text-[11.5px] font-extrabold text-[#313C55]">
                                                alerta
                                            </span>
                                        ) : null}
                                    </span>
                                </span>
                                <span className="min-w-11 shrink-0 text-right">
                                    <span className="block text-xs text-[#5B6478] dark:text-[#AEB9CF]">Qtd</span>
                                    <span className="block text-2xl font-extrabold leading-[1.1]">{total}</span>
                                </span>
                            </button>
                        ))}

                        {vazio ? (
                            <div className="p-8 text-center text-[#5B6478] dark:text-[#AEB9CF]">
                                Nenhum produto encontrado com os filtros atuais.
                            </div>
                        ) : null}
                    </div>
                </Card>
            </div>

            <FilterModal
                open={filterOpen}
                onClose={fecharFiltros}
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
                onClose={fecharDetalhes}
                produto={selectedProduto}
                rows={selectedProdutoDepositos}
            />
        </main>
    );
}
