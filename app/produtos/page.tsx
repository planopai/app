"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type ID = number;

type Deposito = { id: ID; nome: string };
type Categoria = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em?: string };
type Fabricante = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em?: string };
type Classificacao = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em?: string };

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
    const principal = fotos.find((f) => Number(f.is_principal || 0) === 1) || fotos[0];
    return resolveProdutoFotoUrl(principal);
}

async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(
            `Resposta inesperada (${ct || "sem content-type"}). ${txt ? `Conteúdo: ${txt.slice(0, 160)}...` : ""}`.trim()
        );
    }
    return (await r.json()) as T;
}

async function apiGet<T>(qs: Record<string, string | number | boolean | undefined>) {
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

function escapeCsvCell(v: any, sep = ";") {
    const s = String(v ?? "");
    const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(sep);
    const escaped = s.replace(/"/g, '""');
    return mustQuote ? `"${escaped}"` : escaped;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>{children}</section>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
        </label>
    );
}

const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(props, ref) {
    return (
        <input
            ref={ref}
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none sm:text-sm",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
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

    const optMap = useMemo(() => new Map(options.map((o) => [o.id, o.nome])), [options]);

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
        onChangeIds(has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    }

    return (
        <Field label={label}>
            <div ref={wrapRef} className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:text-sm"
                >
                    <span className={["truncate", !selectedIds.length ? "text-slate-600" : "text-slate-900"].join(" ")}>{displayText || placeholder}</span>
                    <span className="text-slate-500">▾</span>
                </button>

                {open ? (
                    <div className="absolute left-0 z-30 mt-2 w-full min-w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                        <div className="border-b border-slate-100 p-2">
                            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." />
                            <button
                                type="button"
                                onClick={() => {
                                    onChangeIds([]);
                                    setQ("");
                                }}
                                className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                                Limpar
                            </button>
                        </div>

                        <div className="max-h-64 overflow-auto p-2">
                            <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
                                <input type="checkbox" checked={!selectedIds.length} onChange={() => onChangeIds([])} className="h-4 w-4" />
                                <span className="text-sm text-slate-700">{allLabel}</span>
                            </label>

                            <div className="my-2 border-t border-slate-100" />

                            {filtered.length === 0 ? (
                                <div className="p-2 text-sm text-slate-600">Nenhum encontrado.</div>
                            ) : (
                                filtered.map((o) => (
                                    <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
                                        <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4" />
                                        <span className="whitespace-nowrap text-sm text-slate-900">{o.nome}</span>
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" }) {
    const base =
        "inline-flex items-center justify-center rounded-xl px-3 py-2 text-[16px] font-medium shadow-sm outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

    const cls =
        variant === "solid"
            ? "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
            : variant === "soft"
                ? "border border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}

function ImagePreviewModal({
    open,
    onClose,
    url,
    title,
}: {
    open: boolean;
    onClose: () => void;
    url?: string | null;
    title?: string;
}) {
    const cleanUrl = normalizeImgUrl(url);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex min-h-[100dvh] items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-slate-900">{title || "Imagem do produto"}</h2>
                        <p className="mt-1 text-sm text-slate-600">Feche pelo ✕ no canto superior direito.</p>
                    </div>
                    <button className="rounded-xl px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={onClose} type="button">
                        ✕
                    </button>
                </div>

                <div className="max-h-[82dvh] overflow-auto p-4">
                    {cleanUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cleanUrl} alt={title || "Imagem do produto"} className="mx-auto h-auto max-h-[76dvh] w-full rounded-2xl border border-slate-200 object-contain" />
                    ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">Produto sem imagem.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

function PhotoThumb({ url, onClick }: { url?: string | null; onClick?: () => void }) {
    const cleanUrl = normalizeImgUrl(url);
    const clickable = !!cleanUrl && !!onClick;

    return (
        <button
            type="button"
            onClick={clickable ? onClick : undefined}
            className={[
                "relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600",
                clickable ? "cursor-zoom-in hover:ring-2 hover:ring-slate-200" : "cursor-default",
            ].join(" ")}
            aria-label={clickable ? "Abrir imagem do produto" : "Sem imagem"}
            title={clickable ? "Clique para ampliar" : "Sem imagem"}
        >
            {cleanUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cleanUrl} alt="Foto do produto" className="h-10 w-10 rounded-xl object-cover" />
            ) : (
                <span className="text-lg">🖼️</span>
            )}

            {clickable ? <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] shadow ring-1 ring-slate-200">🔍</span> : null}
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

    const [imgOpen, setImgOpen] = useState(false);
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [imgTitle, setImgTitle] = useState("");

    const depById = useMemo(() => new Map(depositos.map((d) => [d.id, d])), [depositos]);
    const prodById = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
    const catById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
    const fabById = useMemo(() => new Map(fabricantes.map((f) => [f.id, f])), [fabricantes]);
    const classById = useMemo(() => new Map(classificacoes.map((c) => [c.id, c])), [classificacoes]);

    async function refreshInit() {
        setLoading(true);
        setInitErr("");

        try {
            const j = await apiGet<InitResp>({ init: 1, _ts: Date.now() });
            if (!j.ok) throw new Error(j.msg || "Falha no init");

            setDepositos(j.depositos || []);
            setCategorias((j.categorias || []).filter((c) => Number(c.ativo) === 1));
            setFabricantes((j.fabricantes || []).filter((f) => Number(f.ativo) === 1));
            setClassificacoes((j.classificacoes || []).filter((c) => Number(c.ativo) === 1));
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

    const showMinRepColumns = useMemo(() => {
        const depSet = depFiltroEstoque.length ? new Set(depFiltroEstoque.map(Number)) : null;

        for (const s of saldos) {
            if (depSet && !depSet.has(Number(s.deposito_id))) continue;

            const min = clampInt((s as any).minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);

            if (min > 0 || max > 0) return true;
        }

        return false;
    }, [saldos, depFiltroEstoque]);

    const estoqueRows = useMemo(() => {
        const qq = qEstoque.trim().toLowerCase();

        const rows: Array<{
            p: Produto;
            d: Deposito;
            qtd: number;
            s?: Saldo;
            min: number;
            max: number;
            rep: number;
            hasMinMax: boolean;
        }> = [];

        const depSet = depFiltroEstoque.length ? new Set(depFiltroEstoque.map(Number)) : null;
        const catSet = catFiltroEstoque.length ? new Set(catFiltroEstoque.map(Number)) : null;
        const fabSet = fabFiltroEstoque.length ? new Set(fabFiltroEstoque.map(Number)) : null;
        const clsSet = classFiltroEstoque.length ? new Set(classFiltroEstoque.map(Number)) : null;

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            if (depSet && !depSet.has(d.id)) continue;

            if (catSet) {
                const pid = Number(p.categoria_id || 0);
                if (!catSet.has(pid)) continue;
            }

            if (fabSet) {
                const fid = Number(p.fabricante_id || 0);
                if (!fabSet.has(fid)) continue;
            }

            if (clsSet) {
                const cid = Number(p.classificacao_id || 0);
                if (!clsSet.has(cid)) continue;
            }

            const qtd = clampInt(s.quantidade);
            if (onlyPositive && qtd <= 0) continue;

            const min = clampInt((s as any).minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);
            const hasMinMax = min > 0 && max > 0;
            const rep = hasMinMax ? Math.max(0, max - qtd) : 0;

            if (onlyLow && !(hasMinMax && qtd <= min)) continue;

            if (qq) {
                const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
                const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
                const cls = p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "";
                const blob = `${p.nome} ${p.codigo_barras} ${d.nome} ${cat} ${fab} ${cls}`.toLowerCase();
                if (!blob.includes(qq)) continue;
            }

            rows.push({ p, d, qtd, s, min, max, rep, hasMinMax });
        }

        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR") || a.d.nome.localeCompare(b.d.nome, "pt-BR"));
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
        catById,
        fabById,
        classById,
    ]);

    const estoqueResumo = useMemo(() => {
        let totalUnidades = 0;
        let totalValor = 0;
        const modelosSet = new Set<number>();

        for (const { p, qtd } of estoqueRows) {
            modelosSet.add(Number(p.id));
            const q = clampInt(qtd);
            totalUnidades += q;
            totalValor += q * (Number(p.valor) || 0);
        }

        return {
            totalUnidades,
            totalValor,
            totalModelos: modelosSet.size,
        };
    }, [estoqueRows]);

    function exportarEstoqueCSV() {
        if (!estoqueRows.length) {
            alert("Nenhum item para exportar com os filtros atuais.");
            return;
        }

        const sep = ";";
        const header = ["Produto", "Código de Barras", "Depósito", "Categoria", "Fabricante", "Classificação", "Quantidade", "Min", "Rep", "Valor (un)"];
        const lines: string[] = [];
        lines.push("\uFEFF" + header.map((h) => escapeCsvCell(h, sep)).join(sep));

        for (const { p, d, qtd, min, rep } of estoqueRows) {
            const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
            const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
            const cls = p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "";
            const valorNum = Number(p.valor) || 0;

            lines.push([p.nome, p.codigo_barras, d.nome, cat, fab, cls, qtd, min, rep, moneyBRL(valorNum)].map((x) => escapeCsvCell(x, sep)).join(sep));
        }

        const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const safeName = `estoque_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
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
        <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-6">
            <div className="mx-auto w-full max-w-7xl space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Estoque</h1>
                        <p className="mt-1 text-sm text-slate-600">Consulta isolada de produtos por depósito, com filtros superiores.</p>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Button variant="ghost" type="button" onClick={refreshInit} disabled={loading}>
                            {loading ? "Atualizando..." : "Atualizar"}
                        </Button>
                        <Button variant="soft" type="button" onClick={exportarEstoqueCSV} disabled={loading || !estoqueRows.length}>
                            ⬇️ CSV
                        </Button>
                    </div>
                </div>

                {initErr ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{initErr}</div> : null}

                <Card className="p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
                        <Field label="Pesquisar">
                            <TextInput value={qEstoque} onChange={(e) => setQEstoque(e.target.value)} placeholder="Nome, código, depósito, categoria..." />
                        </Field>

                        <MultiSelectDropdown label="Depósito" options={depositos} selectedIds={depFiltroEstoque} onChangeIds={setDepFiltroEstoque} allLabel="Todos" />
                        <MultiSelectDropdown label="Categoria" options={categorias} selectedIds={catFiltroEstoque} onChangeIds={setCatFiltroEstoque} allLabel="Todas" />
                        <MultiSelectDropdown label="Fabricante" options={fabricantes} selectedIds={fabFiltroEstoque} onChangeIds={setFabFiltroEstoque} allLabel="Todos" />
                        <MultiSelectDropdown label="Classificação" options={classificacoes} selectedIds={classFiltroEstoque} onChangeIds={setClassFiltroEstoque} allLabel="Todas" />

                        <Field label="Filtros rápidos">
                            <div className="flex min-h-[42px] flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                                <label className="flex items-center gap-2 text-xs text-slate-700">
                                    <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="h-4 w-4" />
                                    Somente alerta
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-700">
                                    <input type="checkbox" checked={onlyPositive} onChange={(e) => setOnlyPositive(e.target.checked)} className="h-4 w-4" />
                                    Ocultar zerados
                                </label>
                            </div>
                        </Field>

                        <Field label="Ações">
                            <Button variant="ghost" type="button" onClick={limparFiltros} className="w-full">
                                Limpar filtros
                            </Button>
                        </Field>
                    </div>
                </Card>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Card className="p-4">
                        <p className="text-xs font-medium text-slate-500">Modelos</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{estoqueResumo.totalModelos}</p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-xs font-medium text-slate-500">Unidades</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{estoqueResumo.totalUnidades}</p>
                    </Card>
                    <Card className="p-4">
                        <p className="text-xs font-medium text-slate-500">Valor total</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{moneyBRL(estoqueResumo.totalValor)}</p>
                    </Card>
                </div>

                <Card className="overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">Produtos em estoque</h2>
                            <p className="mt-1 text-sm text-slate-600">{loading ? "Carregando..." : `${estoqueRows.length} linha(s) encontrada(s).`}</p>
                        </div>
                    </div>

                    <div className="hidden overflow-x-auto lg:block">
                        <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Foto</th>
                                    <th className="px-4 py-3">Produto</th>
                                    <th className="px-4 py-3">Código</th>
                                    <th className="px-4 py-3">Depósito</th>
                                    <th className="px-4 py-3">Categoria</th>
                                    <th className="px-4 py-3">Fabricante</th>
                                    <th className="px-4 py-3">Classificação</th>
                                    <th className="px-4 py-3 text-right">Qtd</th>
                                    {showMinRepColumns ? <th className="px-4 py-3 text-right">Min</th> : null}
                                    {showMinRepColumns ? <th className="px-4 py-3 text-right">Rep</th> : null}
                                    <th className="px-4 py-3 text-right">Valor un.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {!loading && estoqueRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={showMinRepColumns ? 11 : 9} className="px-4 py-8 text-center text-sm text-slate-600">
                                            Nenhum produto encontrado com os filtros atuais.
                                        </td>
                                    </tr>
                                ) : null}

                                {estoqueRows.map(({ p, d, qtd, min, rep, hasMinMax }) => {
                                    const img = getProdutoFotoPrincipal(p);
                                    const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "—";
                                    const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "—";
                                    const cls = p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "—";
                                    const low = hasMinMax && qtd <= min;

                                    return (
                                        <tr key={`${p.id}-${d.id}`} className={low ? "bg-amber-50/60" : ""}>
                                            <td className="px-4 py-3">
                                                <PhotoThumb
                                                    url={img}
                                                    onClick={
                                                        img
                                                            ? () => {
                                                                setImgUrl(img);
                                                                setImgTitle(p.nome);
                                                                setImgOpen(true);
                                                            }
                                                            : undefined
                                                    }
                                                />
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-900">{p.nome}</td>
                                            <td className="px-4 py-3 text-slate-600">{p.codigo_barras || "—"}</td>
                                            <td className="px-4 py-3 text-slate-700">{d.nome}</td>
                                            <td className="px-4 py-3 text-slate-600">{cat}</td>
                                            <td className="px-4 py-3 text-slate-600">{fab}</td>
                                            <td className="px-4 py-3 text-slate-600">{cls}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-900">{qtd}</td>
                                            {showMinRepColumns ? <td className="px-4 py-3 text-right text-slate-600">{hasMinMax ? min : "—"}</td> : null}
                                            {showMinRepColumns ? <td className="px-4 py-3 text-right text-slate-600">{hasMinMax ? rep : "—"}</td> : null}
                                            <td className="px-4 py-3 text-right text-slate-700">{moneyBRL(Number(p.valor) || 0)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-1 gap-3 p-4 lg:hidden">
                        {!loading && estoqueRows.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">Nenhum produto encontrado com os filtros atuais.</div> : null}

                        {estoqueRows.map(({ p, d, qtd, min, rep, hasMinMax }) => {
                            const img = getProdutoFotoPrincipal(p);
                            const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "—";
                            const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "—";
                            const cls = p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "—";
                            const low = hasMinMax && qtd <= min;

                            return (
                                <div key={`${p.id}-${d.id}`} className={["rounded-2xl border p-3", low ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"].join(" ")}>
                                    <div className="flex gap-3">
                                        <PhotoThumb
                                            url={img}
                                            onClick={
                                                img
                                                    ? () => {
                                                        setImgUrl(img);
                                                        setImgTitle(p.nome);
                                                        setImgOpen(true);
                                                    }
                                                    : undefined
                                            }
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-semibold text-slate-900">{p.nome}</p>
                                            <p className="mt-0.5 text-xs text-slate-600">CB: {p.codigo_barras || "—"}</p>
                                            <p className="mt-0.5 text-xs text-slate-600">Depósito: {d.nome}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-slate-500">Qtd</p>
                                            <p className="text-xl font-bold text-slate-900">{qtd}</p>
                                        </div>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                                        <div>Categoria: <b>{cat}</b></div>
                                        <div>Fabricante: <b>{fab}</b></div>
                                        <div>Classificação: <b>{cls}</b></div>
                                        <div>Valor: <b>{moneyBRL(Number(p.valor) || 0)}</b></div>
                                        {showMinRepColumns ? <div>Min: <b>{hasMinMax ? min : "—"}</b></div> : null}
                                        {showMinRepColumns ? <div>Rep: <b>{hasMinMax ? rep : "—"}</b></div> : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>

            <ImagePreviewModal open={imgOpen} onClose={() => setImgOpen(false)} url={imgUrl} title={imgTitle} />
        </main>
    );
}
