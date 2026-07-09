"use client";

import React, { useEffect, useMemo, useState } from "react";

type ID = number;

type Deposito = { id: ID; nome: string };
type Categoria = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em?: string };
type Fabricante = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em?: string };
type Classificacao = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em?: string };

type Produto = {
    id: ID;
    nome: string;
    descricao?: string | null;
    codigo_barras: string;
    valor: string | number;
    preco_custo?: string | number | null;
    minimo: number;
    maximo?: number;
    foto_url?: string | null;
    ativo: 0 | 1 | number;
    atualizado_em?: string;
    categoria_id?: ID | null;
    fabricante_id?: ID | null;
    classificacao_id?: ID | null;
    categoria_nome?: string | null;
    fabricante_nome?: string | null;
    classificacao_nome?: string | null;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number;
    minimo: number;
    maximo: number;
    atualizado_em?: string;
};

type InitResp = {
    ok: boolean;
    depositos: Deposito[];
    categorias: Categoria[];
    fabricantes: Fabricante[];
    classificacoes: Classificacao[];
    produtos: Produto[];
    saldos: Saldo[];
    msg?: string;
    need_login?: 1;
};

type LoteRow = {
    id: number;
    produto_id: ID;
    deposito_id: ID;
    numero_lote: string;
    custo_unitario: string | number;
    quantidade_inicial: number;
    quantidade_atual: number;
    criado_em?: string | null;
    atualizado_em?: string | null;
    produto_nome?: string | null;
    codigo_barras?: string | null;
    deposito_nome?: string | null;
    custo_total_atual?: string | number | null;
    is_sintetico_sem_lote?: boolean;
};

type LotesResp = {
    ok: boolean;
    rows: LoteRow[];
    msg?: string;
    need_login?: 1;
};

type VisaoRelatorio = "produto_deposito" | "produto";

type ReportRow = {
    key: string;
    produto_id: ID;
    produto_nome: string;
    codigo_barras: string;
    deposito_id: ID | null;
    deposito_nome: string;
    categoria_nome: string;
    fabricante_nome: string;
    classificacao_nome: string;
    quantidade: number;
    valor_total: number;
    custo_medio: number;
    custo_min: number;
    custo_max: number;
    lotes_ativos: number;
    qtd_sem_lote: number;
};

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/materiais_gerais.php`;

function num(v: unknown): number {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v ?? "").trim();
    if (!s) return 0;

    const cleaned = s
        .replace(/R\$/gi, "")
        .replace(/\s/g, "")
        .replace(/[^0-9,.-]/g, "");

    if (!cleaned) return 0;

    if (cleaned.includes(",")) {
        const br = cleaned.replace(/\./g, "").replace(",", ".");
        const n = Number(br);
        return Number.isFinite(n) ? n : 0;
    }

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
}

function clampInt(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

function moneyBRL(n: number): string {
    try {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(Number.isFinite(n) ? n : 0);
    } catch {
        return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
    }
}

function intBR(n: number): string {
    try {
        return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
    } catch {
        return String(n);
    }
}

function fmtDateTime(iso?: string | null): string {
    if (!iso) return "";
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date(iso));
    } catch {
        return String(iso);
    }
}

function escapeCsvCell(v: unknown, sep = ";"): string {
    const s = String(v ?? "");
    const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(sep);
    const escaped = s.replace(/"/g, '""');
    return mustQuote ? `"${escaped}"` : escaped;
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

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>{children}</section>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
        </label>
    );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none sm:text-sm",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className || "",
            ].join(" ")}
        />
    );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] text-slate-900 shadow-sm outline-none sm:text-sm",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                props.className || "",
            ].join(" ")}
        />
    );
}

function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" }) {
    const base =
        "inline-flex items-center justify-center rounded-xl px-3 py-2 text-[16px] font-medium shadow-sm outline-none sm:text-sm " +
        "focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50";

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

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
            {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </Card>
    );
}

export default function Page() {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [fabricantes, setFabricantes] = useState<Fabricante[]>([]);
    const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);
    const [lotes, setLotes] = useState<LoteRow[]>([]);

    const [q, setQ] = useState("");
    const [depositoId, setDepositoId] = useState<ID>(0);
    const [categoriaId, setCategoriaId] = useState<ID>(0);
    const [fabricanteId, setFabricanteId] = useState<ID>(0);
    const [classificacaoId, setClassificacaoId] = useState<ID>(0);
    const [visao, setVisao] = useState<VisaoRelatorio>("produto_deposito");
    const [mostrarSemLote, setMostrarSemLote] = useState(true);

    const produtoById = useMemo(() => new Map(produtos.map((p) => [Number(p.id), p])), [produtos]);
    const depositoById = useMemo(() => new Map(depositos.map((d) => [Number(d.id), d])), [depositos]);
    const categoriaById = useMemo(() => new Map(categorias.map((c) => [Number(c.id), c])), [categorias]);
    const fabricanteById = useMemo(() => new Map(fabricantes.map((f) => [Number(f.id), f])), [fabricantes]);
    const classificacaoById = useMemo(() => new Map(classificacoes.map((c) => [Number(c.id), c])), [classificacoes]);

    async function carregar() {
        setLoading(true);
        setErr("");

        try {
            const [init, lotesResp] = await Promise.all([
                apiGet<InitResp>({ init: 1, _ts: Date.now() }),
                apiGet<LotesResp>({ action: "lotes_listar", somente_com_saldo: 1, _ts: Date.now() }),
            ]);

            if (!init.ok) throw new Error(init.msg || "Falha ao carregar dados iniciais.");
            if (!lotesResp.ok) throw new Error(lotesResp.msg || "Falha ao carregar lotes.");

            setDepositos(init.depositos || []);
            setCategorias((init.categorias || []).filter((c) => Number(c.ativo) === 1));
            setFabricantes((init.fabricantes || []).filter((f) => Number(f.ativo) === 1));
            setClassificacoes((init.classificacoes || []).filter((c) => Number(c.ativo) === 1));
            setProdutos((init.produtos || []).filter((p) => Number(p.ativo) === 1));
            setSaldos(init.saldos || []);
            setLotes(lotesResp.rows || []);
        } catch (e: any) {
            setErr(e?.message || "Erro ao carregar relatório.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregar();
    }, []);

    const lotesComFallback = useMemo(() => {
        const ativos = (lotes || [])
            .map((l) => ({ ...l, quantidade_atual: clampInt(l.quantidade_atual), custo_unitario: num(l.custo_unitario) }))
            .filter((l) => clampInt(l.quantidade_atual) > 0);

        if (!mostrarSemLote) return ativos;

        const loteQtyByProdDep = new Map<string, number>();
        for (const l of ativos) {
            const key = `${Number(l.produto_id)}::${Number(l.deposito_id)}`;
            loteQtyByProdDep.set(key, (loteQtyByProdDep.get(key) || 0) + clampInt(l.quantidade_atual));
        }

        const fallback: LoteRow[] = [];
        for (const s of saldos || []) {
            const qtdSaldo = clampInt(s.quantidade);
            if (qtdSaldo <= 0) continue;

            const pid = Number(s.produto_id);
            const depId = Number(s.deposito_id);
            const key = `${pid}::${depId}`;
            const qtdComLote = loteQtyByProdDep.get(key) || 0;
            const qtdSemLote = qtdSaldo - qtdComLote;
            if (qtdSemLote <= 0) continue;

            const p = produtoById.get(pid);
            const d = depositoById.get(depId);
            const custo = num(p?.preco_custo || 0);

            fallback.push({
                id: -1 * (fallback.length + 1),
                produto_id: pid,
                deposito_id: depId,
                numero_lote: "SEM_LOTE",
                custo_unitario: custo,
                quantidade_inicial: qtdSemLote,
                quantidade_atual: qtdSemLote,
                produto_nome: p?.nome || `Produto #${pid}`,
                codigo_barras: p?.codigo_barras || "",
                deposito_nome: d?.nome || `Depósito #${depId}`,
                custo_total_atual: custo * qtdSemLote,
                is_sintetico_sem_lote: true,
            });
        }

        return [...ativos, ...fallback];
    }, [lotes, mostrarSemLote, saldos, produtoById, depositoById]);

    const lotesFiltrados = useMemo(() => {
        const qq = q.trim().toLowerCase();

        return lotesComFallback.filter((l) => {
            const p = produtoById.get(Number(l.produto_id));
            const dep = depositoById.get(Number(l.deposito_id));

            if (depositoId && Number(l.deposito_id) !== Number(depositoId)) return false;
            if (categoriaId && Number(p?.categoria_id || 0) !== Number(categoriaId)) return false;
            if (fabricanteId && Number(p?.fabricante_id || 0) !== Number(fabricanteId)) return false;
            if (classificacaoId && Number(p?.classificacao_id || 0) !== Number(classificacaoId)) return false;

            if (qq) {
                const cat = p?.categoria_nome || (p?.categoria_id ? categoriaById.get(Number(p.categoria_id))?.nome : "") || "";
                const fab = p?.fabricante_nome || (p?.fabricante_id ? fabricanteById.get(Number(p.fabricante_id))?.nome : "") || "";
                const cls = p?.classificacao_nome || (p?.classificacao_id ? classificacaoById.get(Number(p.classificacao_id))?.nome : "") || "";
                const blob = [
                    p?.nome,
                    p?.codigo_barras,
                    l.produto_nome,
                    l.codigo_barras,
                    dep?.nome,
                    l.deposito_nome,
                    l.numero_lote,
                    cat,
                    fab,
                    cls,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                if (!blob.includes(qq)) return false;
            }

            return true;
        });
    }, [
        lotesComFallback,
        produtoById,
        depositoById,
        depositoId,
        categoriaId,
        fabricanteId,
        classificacaoId,
        q,
        categoriaById,
        fabricanteById,
        classificacaoById,
    ]);

    const reportRows = useMemo<ReportRow[]>(() => {
        const map = new Map<string, ReportRow>();

        for (const l of lotesFiltrados) {
            const pid = Number(l.produto_id);
            const depId = Number(l.deposito_id);
            const p = produtoById.get(pid);
            const dep = depositoById.get(depId);
            const qtd = clampInt(l.quantidade_atual);
            const custo = num(l.custo_unitario);
            if (qtd <= 0) continue;

            const key = visao === "produto" ? `p:${pid}` : `p:${pid}:d:${depId}`;
            const catNome = p?.categoria_nome || (p?.categoria_id ? categoriaById.get(Number(p.categoria_id))?.nome : "") || "";
            const fabNome = p?.fabricante_nome || (p?.fabricante_id ? fabricanteById.get(Number(p.fabricante_id))?.nome : "") || "";
            const clsNome = p?.classificacao_nome || (p?.classificacao_id ? classificacaoById.get(Number(p.classificacao_id))?.nome : "") || "";

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    produto_id: pid,
                    produto_nome: p?.nome || l.produto_nome || `Produto #${pid}`,
                    codigo_barras: p?.codigo_barras || l.codigo_barras || "",
                    deposito_id: visao === "produto" ? null : depId,
                    deposito_nome: visao === "produto" ? "Todos" : dep?.nome || l.deposito_nome || `Depósito #${depId}`,
                    categoria_nome: catNome,
                    fabricante_nome: fabNome,
                    classificacao_nome: clsNome,
                    quantidade: 0,
                    valor_total: 0,
                    custo_medio: 0,
                    custo_min: custo,
                    custo_max: custo,
                    lotes_ativos: 0,
                    qtd_sem_lote: 0,
                });
            }

            const row = map.get(key)!;
            row.quantidade += qtd;
            row.valor_total += qtd * custo;
            row.custo_min = Math.min(row.custo_min, custo);
            row.custo_max = Math.max(row.custo_max, custo);
            row.lotes_ativos += l.is_sintetico_sem_lote ? 0 : 1;
            row.qtd_sem_lote += l.is_sintetico_sem_lote ? qtd : 0;
        }

        const rows = Array.from(map.values()).map((r) => ({
            ...r,
            custo_medio: r.quantidade > 0 ? r.valor_total / r.quantidade : 0,
        }));

        rows.sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, "pt-BR") || a.deposito_nome.localeCompare(b.deposito_nome, "pt-BR"));
        return rows;
    }, [lotesFiltrados, produtoById, depositoById, categoriaById, fabricanteById, classificacaoById, visao]);

    const resumo = useMemo(() => {
        let totalUnidades = 0;
        let valorTotal = 0;
        let lotesAtivos = 0;
        let qtdSemLote = 0;
        const produtosSet = new Set<number>();
        const depositosSet = new Set<number>();

        for (const l of lotesFiltrados) {
            const qtd = clampInt(l.quantidade_atual);
            const custo = num(l.custo_unitario);
            if (qtd <= 0) continue;

            totalUnidades += qtd;
            valorTotal += qtd * custo;
            produtosSet.add(Number(l.produto_id));
            depositosSet.add(Number(l.deposito_id));
            if (l.is_sintetico_sem_lote) qtdSemLote += qtd;
            else lotesAtivos++;
        }

        return {
            totalUnidades,
            valorTotal,
            custoMedioGeral: totalUnidades > 0 ? valorTotal / totalUnidades : 0,
            produtos: produtosSet.size,
            depositos: depositosSet.size,
            lotesAtivos,
            qtdSemLote,
        };
    }, [lotesFiltrados]);

    function limparFiltros() {
        setQ("");
        setDepositoId(0);
        setCategoriaId(0);
        setFabricanteId(0);
        setClassificacaoId(0);
    }

    function exportarCsv() {
        const sep = ";";
        const header = [
            "Produtos",
            "Código de barras",
            "Depósito",
            "Categoria",
            "Fabricante",
            "Classificação",
            "Quantidade",
            "Custo médio ponderado",
            "Valor em estoque",
            "Menor custo em lote",
            "Maior custo em lote",
            "Lotes ativos",
            "Qtd sem lote",
        ];

        const lines = [header.map((h) => escapeCsvCell(h, sep)).join(sep)];

        for (const r of reportRows) {
            lines.push(
                [
                    r.produto_nome,
                    r.codigo_barras,
                    r.deposito_nome,
                    r.categoria_nome,
                    r.fabricante_nome,
                    r.classificacao_nome,
                    r.quantidade,
                    r.custo_medio.toFixed(2).replace(".", ","),
                    r.valor_total.toFixed(2).replace(".", ","),
                    r.custo_min.toFixed(2).replace(".", ","),
                    r.custo_max.toFixed(2).replace(".", ","),
                    r.lotes_ativos,
                    r.qtd_sem_lote,
                ]
                    .map((v) => escapeCsvCell(v, sep))
                    .join(sep)
            );
        }

        const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `relatorio_estoque_sintetico_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    return (
        <main className="min-h-screen bg-slate-50 p-3 text-slate-900 sm:p-6">
            <div className="mx-auto max-w-7xl space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Estoque</p>
                        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Relatório sintético de estoque</h1>
                        <p className="mt-1 max-w-3xl text-sm text-slate-600">
                            Calcula custo médio ponderado por produto usando os lotes em estoque: quantidade atual multiplicada pelo custo unitário do lote.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" type="button" onClick={carregar} disabled={loading}>
                            Atualizar
                        </Button>
                        <Button type="button" onClick={exportarCsv} disabled={loading || reportRows.length === 0}>
                            Exportar CSV
                        </Button>
                    </div>
                </div>

                {err ? (
                    <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                        <b>Erro:</b> {err}
                    </Card>
                ) : null}

                {resumo.qtdSemLote > 0 ? (
                    <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        Existem <b>{intBR(resumo.qtdSemLote)}</b> unidades com saldo maior que a quantidade encontrada em lotes. Essas unidades aparecem no relatório como <b>sem lote</b> e usam o preço de custo do cadastro do produto como referência.
                    </Card>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <StatCard label="Valor em estoque" value={moneyBRL(resumo.valorTotal)} hint="Quantidade vezes custo médio" />
                    <StatCard label="Custo médio geral" value={moneyBRL(resumo.custoMedioGeral)} hint="Média ponderada geral" />
                    <StatCard label="Unidades" value={intBR(resumo.totalUnidades)} hint="Saldo considerado" />
                    <StatCard label="Produtos" value={intBR(resumo.produtos)} hint="SKUs no filtro" />
                    <StatCard label="Lotes ativos" value={intBR(resumo.lotesAtivos)} hint="Com quantidade atual" />
                    <StatCard label="Depósitos" value={intBR(resumo.depositos)} hint="Com saldo no filtro" />
                </div>

                <Card className="p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
                        <div className="lg:col-span-2">
                            <Field label="Buscar">
                                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Produto, código, depósito, lote..." />
                            </Field>
                        </div>

                        <Field label="Depósito">
                            <Select value={depositoId} onChange={(e) => setDepositoId(Number(e.target.value))}>
                                <option value={0}>Todos</option>
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Categoria">
                            <Select value={categoriaId} onChange={(e) => setCategoriaId(Number(e.target.value))}>
                                <option value={0}>Todas</option>
                                {categorias.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Fabricante">
                            <Select value={fabricanteId} onChange={(e) => setFabricanteId(Number(e.target.value))}>
                                <option value={0}>Todos</option>
                                {fabricantes.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {f.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Classificação">
                            <Select value={classificacaoId} onChange={(e) => setClassificacaoId(Number(e.target.value))}>
                                <option value={0}>Todas</option>
                                {classificacoes.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-2">
                            <Button variant={visao === "produto_deposito" ? "solid" : "ghost"} type="button" onClick={() => setVisao("produto_deposito")}>
                                Produto por depósito
                            </Button>
                            <Button variant={visao === "produto" ? "solid" : "ghost"} type="button" onClick={() => setVisao("produto")}>
                                Produto consolidado
                            </Button>
                            <Button variant="ghost" type="button" onClick={limparFiltros}>
                                Limpar filtros
                            </Button>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={mostrarSemLote}
                                onChange={(e) => setMostrarSemLote(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300"
                            />
                            Incluir saldo sem lote usando preço de custo do cadastro
                        </label>
                    </div>
                </Card>

                <Card className="overflow-hidden">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-4">
                        <div>
                            <h2 className="text-base font-bold text-slate-950">Resumo por {visao === "produto" ? "produto" : "produto e depósito"}</h2>
                            <p className="mt-1 text-xs text-slate-500">
                                {loading ? "Carregando..." : `${intBR(reportRows.length)} linhas encontradas.`}
                                {lotes.length >= 1000 ? " A API retornou 1000 lotes, pode haver mais registros no banco." : ""}
                            </p>
                        </div>
                    </div>

                    <div className="overflow-auto">
                        <table className="min-w-[1120px] w-full border-collapse text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="border-b border-slate-200 px-4 py-3">Produto</th>
                                    <th className="border-b border-slate-200 px-4 py-3">Depósito</th>
                                    <th className="border-b border-slate-200 px-4 py-3 text-right">Qtd</th>
                                    <th className="border-b border-slate-200 px-4 py-3 text-right">Custo médio</th>
                                    <th className="border-b border-slate-200 px-4 py-3 text-right">Valor estoque</th>
                                    <th className="border-b border-slate-200 px-4 py-3 text-right">Menor custo</th>
                                    <th className="border-b border-slate-200 px-4 py-3 text-right">Maior custo</th>
                                    <th className="border-b border-slate-200 px-4 py-3 text-right">Lotes</th>
                                    <th className="border-b border-slate-200 px-4 py-3 text-right">Sem lote</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                                            Carregando relatório...
                                        </td>
                                    </tr>
                                ) : reportRows.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                                            Nenhum item encontrado para os filtros atuais.
                                        </td>
                                    </tr>
                                ) : (
                                    reportRows.map((r) => (
                                        <tr key={r.key} className="odd:bg-white even:bg-slate-50/50 hover:bg-slate-100/60">
                                            <td className="border-b border-slate-100 px-4 py-3 align-top">
                                                <div className="font-semibold text-slate-950">{r.produto_nome}</div>
                                                <div className="mt-0.5 text-xs text-slate-500">CB: {r.codigo_barras || "sem código"}</div>
                                                <div className="mt-0.5 text-xs text-slate-500">
                                                    {[r.categoria_nome, r.fabricante_nome, r.classificacao_nome].filter(Boolean).join(" • ")}
                                                </div>
                                            </td>
                                            <td className="border-b border-slate-100 px-4 py-3 align-top text-slate-700">{r.deposito_nome}</td>
                                            <td className="border-b border-slate-100 px-4 py-3 text-right align-top font-semibold">{intBR(r.quantidade)}</td>
                                            <td className="border-b border-slate-100 px-4 py-3 text-right align-top font-semibold text-slate-950">
                                                {moneyBRL(r.custo_medio)}
                                            </td>
                                            <td className="border-b border-slate-100 px-4 py-3 text-right align-top font-bold text-slate-950">{moneyBRL(r.valor_total)}</td>
                                            <td className="border-b border-slate-100 px-4 py-3 text-right align-top text-slate-700">{moneyBRL(r.custo_min)}</td>
                                            <td className="border-b border-slate-100 px-4 py-3 text-right align-top text-slate-700">{moneyBRL(r.custo_max)}</td>
                                            <td className="border-b border-slate-100 px-4 py-3 text-right align-top text-slate-700">{intBR(r.lotes_ativos)}</td>
                                            <td className="border-b border-slate-100 px-4 py-3 text-right align-top">
                                                {r.qtd_sem_lote > 0 ? (
                                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                                                        {intBR(r.qtd_sem_lote)}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">0</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card className="p-4 text-xs text-slate-500">
                    Fórmula: custo médio ponderado = soma de quantidade atual do lote vezes custo unitário do lote, dividida pela quantidade total atual. Valor em estoque = quantidade total atual vezes custo médio ponderado.
                    {lotes[0]?.criado_em ? ` Lote mais antigo carregado: ${fmtDateTime(lotes[0]?.criado_em)}.` : ""}
                </Card>
            </div>
        </main>
    );
}
