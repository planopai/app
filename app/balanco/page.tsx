"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/balanco.php`;

type Periodo = { inicio: string; fim: string };
type Preset = "HOJE" | "SEMANA" | "MES" | "ANO" | "PERSONALIZADO";
type TipoCusto = "BAIXA_ESTOQUE" | "CONSUMIVEL_ESTIMADO" | "ORNAMENTACAO";

type Resumo = {
    total_gasto: number;
    custo_direto: number;
    custo_consumiveis_estimado: number;
    custo_ornamentacao: number;
    atendimentos: number;
    custo_medio_atendimento: number;
    itens_utilizados: number;
    movimentos_saida: number;
    itens_sem_preco_custo: number;
    atendimentos_com_item_sem_preco: number;
    atendimentos_sem_baixa: number;
    ornamentacao_sem_tipo: number;
};

type AtendimentoRow = {
    atendimento_id: number;
    falecido: string;
    convenio: string;
    tipo_atendimento: string;
    data_referencia: string;
    primeira_saida: string;
    ultima_saida: string;
    movimentos: number;
    total_itens: number;
    produtos_distintos: number;
    custo_direto: number;
    custo_consumiveis_estimado: number;
    custo_ornamentacao: number;
    custo_total: number;
    itens_sem_preco_custo: number;
    luva_usada: boolean;
    mascara_usada: boolean;
    ornamentacao_tipo: string;
};

type ProdutoResumo = {
    produto_id: number;
    produto_nome: string;
    categoria_nome: string;
    preco_custo: number;
    quantidade: number;
    atendimentos: number;
    custo_total: number;
    sem_preco_custo: boolean;
};

type EvolucaoRow = {
    data: string;
    atendimentos: number;
    total_itens: number;
    custo_direto: number;
    custo_consumiveis_estimado: number;
    custo_ornamentacao: number;
    custo_total: number;
};

type IndicadorComplementar = {
    label: string;
    codigo_barras: string;
    produto_id: number;
    produto_nome: string;
    preco_custo: number;
    unidades_embalagem?: number;
    custo_por_uso?: number;
    usos: number;
    taxa_uso_percentual: number;
    custo_total: number;
    custo_medio_por_atendimento: number;
    sem_preco_custo: boolean;
    encontrado: boolean;
};

type Complementares = {
    luva: IndicadorComplementar;
    mascara: IndicadorComplementar;
    ornamentacao_natural: IndicadorComplementar;
    ornamentacao_artificial: IndicadorComplementar;
};

type BalancoResponse = {
    ok: boolean;
    need_login?: 1;
    msg?: string;
    criterio_custo?: string;
    criterio_custo_descricao?: string;
    gerado_em?: string;
    periodo?: Periodo;
    resumo?: Resumo;
    complementares?: Complementares;
    alertas?: string[];
    atendimentos?: AtendimentoRow[];
    produtos?: ProdutoResumo[];
    evolucao?: EvolucaoRow[];
};

type DetalheItem = {
    tipo_custo: TipoCusto;
    produto_id: number;
    produto_nome: string;
    categoria_nome: string;
    codigo_barras: string;
    preco_custo: number;
    custo_unitario_atribuido: number;
    unidades_embalagem: number;
    quantidade: number;
    subtotal: number;
    depositos: string;
    primeira_saida: string;
    ultima_saida: string;
    movimentos: number;
    sem_preco_custo: boolean;
    descricao_calculo: string;
};

type DetalheAtendimento = {
    id: number;
    falecido: string;
    convenio: string;
    tipo_atendimento: string;
    agente: string;
    status: string;
    data_referencia: string;
    total_itens: number;
    produtos_distintos: number;
    custo_direto: number;
    custo_consumiveis_estimado: number;
    custo_ornamentacao: number;
    custo_total: number;
    itens_sem_preco_custo: number;
    luva_usada: boolean;
    mascara_usada: boolean;
    ornamentacao_tipo: string;
};

type DetalheResponse = {
    ok: boolean;
    need_login?: 1;
    msg?: string;
    criterio_custo_descricao?: string;
    periodo?: Periodo;
    alertas?: string[];
    atendimento?: DetalheAtendimento;
    itens?: DetalheItem[];
};

function localDateValue(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function periodoPreset(preset: Exclude<Preset, "PERSONALIZADO">): Periodo {
    const now = new Date();
    const fim = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let inicio = new Date(fim);

    if (preset === "SEMANA") {
        const day = inicio.getDay();
        const diffToMonday = day === 0 ? 6 : day - 1;
        inicio.setDate(inicio.getDate() - diffToMonday);
    } else if (preset === "MES") {
        inicio = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === "ANO") {
        inicio = new Date(now.getFullYear(), 0, 1);
    }

    return { inicio: localDateValue(inicio), fim: localDateValue(fim) };
}

function moneyBRL(value: number): string {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(safe);
    } catch {
        return `R$ ${safe.toFixed(2).replace(".", ",")}`;
    }
}

function numberBR(value: number): string {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    try {
        return new Intl.NumberFormat("pt-BR").format(safe);
    } catch {
        return String(safe);
    }
}

function percentBR(value: number): string {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    return `${safe.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

function dateBR(value?: string | null): string {
    const raw = String(value ?? "").trim();
    if (!raw) return "-";
    const first10 = raw.slice(0, 10);
    const match = first10.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
}

function dateTimeBR(value?: string | null): string {
    const raw = String(value ?? "").trim();
    if (!raw) return "-";
    const date = new Date(raw.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return raw;
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(date);
    } catch {
        return raw;
    }
}

function safeText(value?: string | null, fallback = "-"): string {
    const text = String(value ?? "").trim();
    return text || fallback;
}

async function fetchFresh<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal,
    });

    const data = (await response.json().catch(() => null)) as T | null;
    if (!response.ok || !data) {
        throw new Error((data as any)?.msg || `Falha HTTP ${response.status}.`);
    }
    return data;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <section className={["rounded-2xl border border-slate-200 bg-white shadow-sm", "dark:border-slate-800 dark:bg-slate-950", className].join(" ")}>
            {children}
        </section>
    );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <Card className="p-4 sm:p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</div>
            <div className="mt-2 break-words text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">{value}</div>
            {hint ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
        </Card>
    );
}

function Spinner() {
    return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />;
}

function ComplementarCard({ item, kind }: { item?: IndicadorComplementar; kind: "consumivel" | "ornamentacao" }) {
    if (!item) return null;

    const formula = kind === "consumivel"
        ? `${moneyBRL(item.preco_custo)} ÷ ${numberBR(item.unidades_embalagem || 1)} = ${moneyBRL(item.custo_por_uso || 0)} por uso`
        : `${moneyBRL(item.preco_custo)} por atendimento marcado`;

    return (
        <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="font-black text-slate-900 dark:text-white">{item.label}</div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">{item.produto_nome || `CB ${item.codigo_barras}`}</div>
                </div>
                <div className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-black text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                    {percentBR(item.taxa_uso_percentual)}
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                    <div className="text-xs text-slate-400">Atendimentos</div>
                    <div className="mt-0.5 font-black">{numberBR(item.usos)}</div>
                </div>
                <div>
                    <div className="text-xs text-slate-400">Custo total</div>
                    <div className="mt-0.5 font-black text-emerald-700 dark:text-emerald-300">{moneyBRL(item.custo_total)}</div>
                </div>
                <div className="col-span-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900">
                    <div className="font-semibold text-slate-700 dark:text-slate-300">{formula}</div>
                    <div className="mt-1 text-slate-500">Média no período: {moneyBRL(item.custo_medio_por_atendimento)} por atendimento.</div>
                </div>
            </div>

            {item.sem_preco_custo ? (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                    Produto de referência sem preço de custo.
                </div>
            ) : null}
        </Card>
    );
}

export default function BalancoPage() {
    const initialPeriodo = useMemo(() => periodoPreset("MES"), []);

    const [preset, setPreset] = useState<Preset>("MES");
    const [inicio, setInicio] = useState(initialPeriodo.inicio);
    const [fim, setFim] = useState(initialPeriodo.fim);
    const [data, setData] = useState<BalancoResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<DetalheResponse | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");

    const requestSeq = useRef(0);
    const detailSeq = useRef(0);

    async function carregarBalanco(nextInicio = inicio, nextFim = fim) {
        const seq = ++requestSeq.current;
        setLoading(true);
        setError("");

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 30_000);

        try {
            const url = new URL(API_BASE, window.location.origin);
            url.searchParams.set("action", "resumo");
            url.searchParams.set("inicio", nextInicio);
            url.searchParams.set("fim", nextFim);
            url.searchParams.set("_ts", String(Date.now()));

            const response = await fetchFresh<BalancoResponse>(url.toString(), controller.signal);
            if (seq !== requestSeq.current) return;
            if (!response.ok) throw new Error(response.msg || "Não foi possível carregar o balanço.");
            setData(response);
        } catch (e: any) {
            if (seq !== requestSeq.current) return;
            setError(e?.name === "AbortError" ? "A consulta demorou mais de 30 segundos. Tente novamente." : e?.message || "Não foi possível carregar o balanço.");
        } finally {
            window.clearTimeout(timeout);
            if (seq === requestSeq.current) setLoading(false);
        }
    }

    async function abrirDetalhe(atendimentoId: number) {
        const seq = ++detailSeq.current;
        setSelectedId(atendimentoId);
        setDetail(null);
        setDetailError("");
        setDetailLoading(true);

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 30_000);

        try {
            const url = new URL(API_BASE, window.location.origin);
            url.searchParams.set("action", "detalhe");
            url.searchParams.set("atendimento_id", String(atendimentoId));
            url.searchParams.set("inicio", inicio);
            url.searchParams.set("fim", fim);
            url.searchParams.set("_ts", String(Date.now()));

            const response = await fetchFresh<DetalheResponse>(url.toString(), controller.signal);
            if (seq !== detailSeq.current) return;
            if (!response.ok) throw new Error(response.msg || "Não foi possível abrir o atendimento.");
            setDetail(response);
        } catch (e: any) {
            if (seq !== detailSeq.current) return;
            setDetailError(e?.name === "AbortError" ? "A consulta do atendimento demorou mais de 30 segundos." : e?.message || "Não foi possível abrir o atendimento.");
        } finally {
            window.clearTimeout(timeout);
            if (seq === detailSeq.current) setDetailLoading(false);
        }
    }

    function fecharDetalhe() {
        detailSeq.current++;
        setSelectedId(null);
        setDetail(null);
        setDetailError("");
        setDetailLoading(false);
    }

    function aplicarPreset(nextPreset: Exclude<Preset, "PERSONALIZADO">) {
        const periodo = periodoPreset(nextPreset);
        setPreset(nextPreset);
        setInicio(periodo.inicio);
        setFim(periodo.fim);
        fecharDetalhe();
        void carregarBalanco(periodo.inicio, periodo.fim);
    }

    function aplicarPersonalizado() {
        if (!inicio || !fim) {
            setError("Informe a data inicial e a data final.");
            return;
        }
        if (inicio > fim) {
            setError("A data inicial não pode ser posterior à data final.");
            return;
        }
        setPreset("PERSONALIZADO");
        fecharDetalhe();
        void carregarBalanco(inicio, fim);
    }

    useEffect(() => {
        void carregarBalanco(initialPeriodo.inicio, initialPeriodo.fim);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedId === null) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") fecharDetalhe();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [selectedId]);

    const atendimentosFiltrados = useMemo(() => {
        const rows = data?.atendimentos ?? [];
        const q = query.trim().toLocaleLowerCase("pt-BR");
        if (!q) return rows;
        return rows.filter((row) => {
            const id = String(row.atendimento_id);
            const falecido = String(row.falecido ?? "").toLocaleLowerCase("pt-BR");
            const convenio = String(row.convenio ?? "").toLocaleLowerCase("pt-BR");
            return id.includes(q) || falecido.includes(q) || convenio.includes(q);
        });
    }, [data?.atendimentos, query]);

    const resumo: Resumo = data?.resumo ?? {
        total_gasto: 0,
        custo_direto: 0,
        custo_consumiveis_estimado: 0,
        custo_ornamentacao: 0,
        atendimentos: 0,
        custo_medio_atendimento: 0,
        itens_utilizados: 0,
        movimentos_saida: 0,
        itens_sem_preco_custo: 0,
        atendimentos_com_item_sem_preco: 0,
        atendimentos_sem_baixa: 0,
        ornamentacao_sem_tipo: 0,
    };

    const topProdutos = (data?.produtos ?? []).slice(0, 10);
    const maxProdutoCusto = Math.max(0, ...topProdutos.map((item) => Number(item.custo_total) || 0));
    const evolucao = data?.evolucao ?? [];
    const maxDiaCusto = Math.max(0, ...evolucao.map((item) => Number(item.custo_total) || 0));

    const detailGroups = useMemo(() => {
        const itens = detail?.itens ?? [];
        return {
            diretos: itens.filter((item) => item.tipo_custo === "BAIXA_ESTOQUE"),
            consumiveis: itens.filter((item) => item.tipo_custo === "CONSUMIVEL_ESTIMADO"),
            ornamentacao: itens.filter((item) => item.tipo_custo === "ORNAMENTACAO"),
        };
    }, [detail?.itens]);

    function renderDetailItem(item: DetalheItem) {
        const estimado = item.tipo_custo === "CONSUMIVEL_ESTIMADO";
        const ornamentacao = item.tipo_custo === "ORNAMENTACAO";

        return (
            <div key={`${item.tipo_custo}-${item.produto_id}-${item.codigo_barras}`} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="font-black text-slate-900 dark:text-white">{item.produto_nome}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {safeText(item.categoria_nome, ornamentacao ? "Serviço" : "Sem categoria")}
                            {item.codigo_barras ? ` · CB ${item.codigo_barras}` : ""}
                            {item.depositos ? ` · ${item.depositos}` : ""}
                        </div>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                        <div className="text-xs text-slate-500">Subtotal</div>
                        <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">{moneyBRL(item.subtotal)}</div>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900 sm:grid-cols-4">
                    {estimado ? (
                        <>
                            <div>
                                <div className="text-slate-400">Preço da caixa</div>
                                <div className="mt-0.5 font-bold">{moneyBRL(item.preco_custo)}</div>
                            </div>
                            <div>
                                <div className="text-slate-400">Unidades/caixa</div>
                                <div className="mt-0.5 font-bold">{numberBR(item.unidades_embalagem)}</div>
                            </div>
                            <div>
                                <div className="text-slate-400">Uso atribuído</div>
                                <div className="mt-0.5 font-bold">1 unidade</div>
                            </div>
                            <div>
                                <div className="text-slate-400">Custo atribuído</div>
                                <div className="mt-0.5 font-bold">{moneyBRL(item.custo_unitario_atribuido)}</div>
                            </div>
                        </>
                    ) : ornamentacao ? (
                        <>
                            <div>
                                <div className="text-slate-400">Quantidade</div>
                                <div className="mt-0.5 font-bold">1x</div>
                            </div>
                            <div>
                                <div className="text-slate-400">Preço de custo</div>
                                <div className="mt-0.5 font-bold">{moneyBRL(item.preco_custo)}</div>
                            </div>
                            <div className="col-span-2">
                                <div className="text-slate-400">Critério</div>
                                <div className="mt-0.5 font-bold">Preço integral do serviço de ornamentação</div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <div className="text-slate-400">Quantidade</div>
                                <div className="mt-0.5 font-bold">{numberBR(item.quantidade)}x</div>
                            </div>
                            <div>
                                <div className="text-slate-400">Preço de custo</div>
                                <div className={item.sem_preco_custo ? "mt-0.5 font-bold text-rose-600" : "mt-0.5 font-bold"}>{moneyBRL(item.preco_custo)}</div>
                            </div>
                            <div>
                                <div className="text-slate-400">Movimentos</div>
                                <div className="mt-0.5 font-bold">{numberBR(item.movimentos)}</div>
                            </div>
                            <div>
                                <div className="text-slate-400">Última saída</div>
                                <div className="mt-0.5 font-bold">{dateTimeBR(item.ultima_saida)}</div>
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-2 text-[11px] text-slate-400">{item.descricao_calculo}</div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
            <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">Custos funerários</p>
                        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Balanço</h1>
                        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
                            Custo direto das saídas + Luva/Máscara estimadas por unidade + Ornamentação Natural/Artificial.
                        </p>
                    </div>

                    <button type="button" onClick={() => void carregarBalanco()} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">
                        {loading ? <Spinner /> : null} Atualizar
                    </button>
                </div>

                <Card className="p-4 sm:p-5">
                    <div className="flex flex-wrap gap-2">
                        {([["HOJE", "Hoje"], ["SEMANA", "Semana"], ["MES", "Mês"], ["ANO", "Ano"]] as const).map(([value, label]) => (
                            <button key={value} type="button" onClick={() => aplicarPreset(value)} className={["rounded-xl px-4 py-2 text-sm font-bold transition", preset === value ? "bg-sky-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"].join(" ")}>
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Data inicial</span>
                            <input type="date" value={inicio} onChange={(e) => { setInicio(e.target.value); setPreset("PERSONALIZADO"); }} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900" />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">Data final</span>
                            <input type="date" value={fim} onChange={(e) => { setFim(e.target.value); setPreset("PERSONALIZADO"); }} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900" />
                        </label>
                        <button type="button" onClick={aplicarPersonalizado} disabled={loading} className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">Aplicar período</button>
                    </div>
                </Card>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    <span className="font-bold">Critério:</span> {data?.criterio_custo_descricao || "Preço de custo atual com cálculo complementar de Luva, Máscara e Ornamentação."}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                    Palha, Tamponamento, Maquiagem e Barba não entram no cálculo desta versão. O período é aplicado pela data de criação do atendimento, e o custo reúne as saídas vinculadas ao atendimento mesmo que a baixa tenha ocorrido depois.
                </div>

                {(data?.alertas ?? []).map((alerta, index) => (
                    <div key={`${index}-${alerta}`} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{alerta}</div>
                ))}

                {resumo.itens_sem_preco_custo > 0 ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                        <span className="font-bold">Atenção:</span> {numberBR(resumo.itens_sem_preco_custo)} item(ns) de baixa real, em {numberBR(resumo.atendimentos_com_item_sem_preco)} atendimento(s), estão sem preço de custo.
                    </div>
                ) : null}

                {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <SummaryCard label="Gasto total" value={moneyBRL(resumo.total_gasto)} hint="Direto + estimado + ornamentação" />
                    <SummaryCard label="Atendimentos" value={numberBR(resumo.atendimentos)} hint="Criados no período" />
                    <SummaryCard label="Custo médio" value={moneyBRL(resumo.custo_medio_atendimento)} hint="Por atendimento do período" />
                    <SummaryCard label="Itens com baixa" value={numberBR(resumo.itens_utilizados)} hint={`${numberBR(resumo.movimentos_saida)} movimentos`} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <SummaryCard label="Custo direto" value={moneyBRL(resumo.custo_direto)} hint="Itens com saída de estoque" />
                    <SummaryCard label="Luva + Máscara" value={moneyBRL(resumo.custo_consumiveis_estimado)} hint="Consumo unitário estimado" />
                    <SummaryCard label="Ornamentação" value={moneyBRL(resumo.custo_ornamentacao)} hint="Natural + Artificial" />
                </div>

                <Card className="p-4 sm:p-5">
                    <div>
                        <h2 className="text-lg font-black">Custos complementares no período</h2>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Frequência de uso, custo total e custo médio distribuído pelos atendimentos do filtro.</p>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <ComplementarCard item={data?.complementares?.luva} kind="consumivel" />
                        <ComplementarCard item={data?.complementares?.mascara} kind="consumivel" />
                        <ComplementarCard item={data?.complementares?.ornamentacao_natural} kind="ornamentacao" />
                        <ComplementarCard item={data?.complementares?.ornamentacao_artificial} kind="ornamentacao" />
                    </div>
                </Card>

                <Card className="overflow-hidden">
                    <div className="border-b border-slate-200 p-4 sm:p-5 dark:border-slate-800">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-black">Atendimentos funerários</h2>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Clique no falecido para abrir o detalhamento completo do custo.</p>
                            </div>
                            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar falecido, atendimento ou convênio" className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 sm:max-w-sm" />
                        </div>
                    </div>

                    {loading && !data ? (
                        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><Spinner /> Carregando balanço...</div>
                    ) : atendimentosFiltrados.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum atendimento foi encontrado neste período.</div>
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[1050px] text-left text-sm">
                                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                                        <tr>
                                            <th className="px-5 py-3">Atendimento</th>
                                            <th className="px-5 py-3">Falecido</th>
                                            <th className="px-5 py-3">Data</th>
                                            <th className="px-5 py-3 text-right">Baixa</th>
                                            <th className="px-5 py-3 text-right">Luva/Máscara</th>
                                            <th className="px-5 py-3 text-right">Ornamentação</th>
                                            <th className="px-5 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {atendimentosFiltrados.map((row) => (
                                            <tr key={row.atendimento_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/70">
                                                <td className="px-5 py-4 font-semibold text-slate-500">#{row.atendimento_id}</td>
                                                <td className="px-5 py-4">
                                                    <button type="button" onClick={() => void abrirDetalhe(row.atendimento_id)} className="font-black text-sky-700 hover:underline dark:text-sky-300">{safeText(row.falecido, `Atendimento #${row.atendimento_id}`)}</button>
                                                    <div className="mt-1 text-[11px] text-slate-400">
                                                        {safeText(row.convenio, "Sem convênio")}
                                                        {row.luva_usada ? " · Luva" : ""}
                                                        {row.mascara_usada ? " · Máscara" : ""}
                                                        {row.ornamentacao_tipo ? ` · Orn. ${row.ornamentacao_tipo}` : ""}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">{dateBR(row.data_referencia)}</td>
                                                <td className="px-5 py-4 text-right font-semibold">{moneyBRL(row.custo_direto)}</td>
                                                <td className="px-5 py-4 text-right">{moneyBRL(row.custo_consumiveis_estimado)}</td>
                                                <td className="px-5 py-4 text-right">{moneyBRL(row.custo_ornamentacao)}</td>
                                                <td className="px-5 py-4 text-right font-black text-emerald-700 dark:text-emerald-300">
                                                    {moneyBRL(row.custo_total)}
                                                    {row.itens_sem_preco_custo > 0 ? <div className="mt-1 text-[10px] font-bold text-rose-600">{row.itens_sem_preco_custo} sem custo</div> : null}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
                                {atendimentosFiltrados.map((row) => (
                                    <button key={row.atendimento_id} type="button" onClick={() => void abrirDetalhe(row.atendimento_id)} className="block w-full p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-slate-400">#{row.atendimento_id} · {dateBR(row.data_referencia)}</div>
                                                <div className="mt-1 truncate font-black text-sky-700 dark:text-sky-300">{safeText(row.falecido, `Atendimento #${row.atendimento_id}`)}</div>
                                                <div className="mt-1 text-xs text-slate-500">Baixa {moneyBRL(row.custo_direto)} · Estimado {moneyBRL(row.custo_consumiveis_estimado)} · Orn. {moneyBRL(row.custo_ornamentacao)}</div>
                                            </div>
                                            <div className="shrink-0 text-right font-black text-emerald-700 dark:text-emerald-300">{moneyBRL(row.custo_total)}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </Card>

                <div className="grid gap-5 lg:grid-cols-2">
                    <Card className="p-4 sm:p-5">
                        <div className="flex items-end justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-black">Produtos com baixa de maior custo</h2>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Somente itens que efetivamente geraram saída de estoque.</p>
                            </div>
                            <span className="text-xs font-semibold text-slate-400">Top 10</span>
                        </div>

                        <div className="mt-4 space-y-4">
                            {topProdutos.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">Sem saídas vinculadas aos atendimentos do período.</div> : topProdutos.map((item, index) => {
                                const width = maxProdutoCusto > 0 ? (item.custo_total / maxProdutoCusto) * 100 : 0;
                                return (
                                    <div key={item.produto_id}>
                                        <div className="flex items-start justify-between gap-3 text-sm">
                                            <div className="min-w-0">
                                                <div className="font-bold">{index + 1}. {item.produto_nome}</div>
                                                <div className="mt-0.5 text-xs text-slate-500">{item.quantidade} un. · {item.atendimentos} atendimento(s) · custo atual {moneyBRL(item.preco_custo)}</div>
                                            </div>
                                            <div className="shrink-0 font-black">{moneyBRL(item.custo_total)}</div>
                                        </div>
                                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(0, Math.min(100, width))}%` }} /></div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>

                    <Card className="p-4 sm:p-5">
                        <h2 className="text-lg font-black">Evolução do custo dos atendimentos</h2>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Agrupado pela data de criação do atendimento.</p>

                        <div className="mt-4 max-h-[430px] space-y-3 overflow-y-auto pr-1">
                            {evolucao.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">Sem dados no período.</div> : evolucao.map((row) => {
                                const width = maxDiaCusto > 0 ? (row.custo_total / maxDiaCusto) * 100 : 0;
                                return (
                                    <div key={row.data}>
                                        <div className="flex items-center justify-between gap-3 text-xs">
                                            <span className="font-bold text-slate-600 dark:text-slate-300">{dateBR(row.data)}</span>
                                            <span className="font-black">{moneyBRL(row.custo_total)}</span>
                                        </div>
                                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, width))}%` }} /></div>
                                        <div className="mt-1 text-[10px] text-slate-400">{row.atendimentos} atendimento(s) · baixa {moneyBRL(row.custo_direto)} · estimado {moneyBRL(row.custo_consumiveis_estimado)} · ornamentação {moneyBRL(row.custo_ornamentacao)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </div>
            </div>

            {selectedId !== null ? (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Detalhes do atendimento" onMouseDown={(e) => { if (e.target === e.currentTarget) fecharDetalhe(); }}>
                    <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-950 sm:rounded-3xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5 dark:border-slate-800">
                            <div className="min-w-0">
                                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Atendimento #{selectedId}</div>
                                <h2 className="mt-1 truncate text-xl font-black">{detail?.atendimento?.falecido || "Carregando..."}</h2>
                                {detail?.atendimento ? <div className="mt-1 text-xs text-slate-500">{dateBR(detail.atendimento.data_referencia)} · {safeText(detail.atendimento.convenio, "Convênio não informado")}</div> : null}
                            </div>
                            <button type="button" onClick={fecharDetalhe} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-xl font-bold text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" aria-label="Fechar">×</button>
                        </div>

                        <div className="overflow-y-auto p-4 sm:p-5">
                            {detailLoading ? (
                                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><Spinner /> Carregando custos...</div>
                            ) : detailError ? (
                                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{detailError}</div>
                            ) : detail?.atendimento ? (
                                <>
                                    {(detail.alertas ?? []).map((alerta, index) => <div key={`${index}-${alerta}`} className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{alerta}</div>)}

                                    <div className="mb-5 grid gap-3 sm:grid-cols-4">
                                        <SummaryCard label="Baixa real" value={moneyBRL(detail.atendimento.custo_direto)} />
                                        <SummaryCard label="Luva/Máscara" value={moneyBRL(detail.atendimento.custo_consumiveis_estimado)} />
                                        <SummaryCard label="Ornamentação" value={moneyBRL(detail.atendimento.custo_ornamentacao)} />
                                        <SummaryCard label="Total" value={moneyBRL(detail.atendimento.custo_total)} />
                                    </div>

                                    <div className="space-y-6">
                                        <section>
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="font-black">Itens com baixa real</h3>
                                                    <p className="text-xs text-slate-500">Quantidade baixada × preço de custo atual.</p>
                                                </div>
                                                <div className="font-black text-emerald-700 dark:text-emerald-300">{moneyBRL(detail.atendimento.custo_direto)}</div>
                                            </div>
                                            <div className="space-y-3">{detailGroups.diretos.length ? detailGroups.diretos.map(renderDetailItem) : <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">Nenhuma saída de estoque vinculada a este atendimento.</div>}</div>
                                        </section>

                                        <section>
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="font-black">Consumíveis estimados</h3>
                                                    <p className="text-xs text-slate-500">Somente Luva e Máscara nesta versão.</p>
                                                </div>
                                                <div className="font-black text-emerald-700 dark:text-emerald-300">{moneyBRL(detail.atendimento.custo_consumiveis_estimado)}</div>
                                            </div>
                                            <div className="space-y-3">{detailGroups.consumiveis.length ? detailGroups.consumiveis.map(renderDetailItem) : <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">Luva e Máscara não foram marcadas neste atendimento.</div>}</div>
                                        </section>

                                        <section>
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="font-black">Ornamentação</h3>
                                                    <p className="text-xs text-slate-500">Preço de custo atual integral do tipo marcado.</p>
                                                </div>
                                                <div className="font-black text-emerald-700 dark:text-emerald-300">{moneyBRL(detail.atendimento.custo_ornamentacao)}</div>
                                            </div>
                                            <div className="space-y-3">{detailGroups.ornamentacao.length ? detailGroups.ornamentacao.map(renderDetailItem) : <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">Sem Ornamentação Natural/Artificial atribuída ao atendimento.</div>}</div>
                                        </section>
                                    </div>

                                    <div className="mt-6 rounded-2xl bg-slate-900 p-5 text-white dark:bg-white dark:text-slate-900">
                                        <div className="flex items-end justify-between gap-4">
                                            <div>
                                                <div className="text-xs font-bold uppercase tracking-wide opacity-70">Custo total estimado do atendimento</div>
                                                <div className="mt-1 text-xs opacity-70">Baixa real + Luva/Máscara + Ornamentação</div>
                                            </div>
                                            <div className="text-right text-2xl font-black sm:text-3xl">{moneyBRL(detail.atendimento.custo_total)}</div>
                                        </div>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </main>
    );
}
