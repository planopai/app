"use client";

/* =====================================================================
   PAINEL DE GESTÃO DO ESTOQUE
   ---------------------------------------------------------------------
   - Usa SOMENTE o materiais_gerais.php já existente:
       ?historico=1&tipo=...&limit=...   (movimentações)
       ?conferencias=1                   (lista de conferências)
       ?conferencia_id=...               (detalhe de uma conferência)
   - Produtos, saldos, depósitos, categorias e classificações vêm do
     "init" que a página de estoque já carrega (passados por props).
   - Todos os cálculos (médias, tendência, cobertura, sugestão de compra,
     curva ABC, custos) são feitos no navegador.
   ===================================================================== */

import React, { useEffect, useMemo, useState } from "react";

type ID = number;

/* ---------- Tipos mínimos (compatíveis com os da page.tsx) ---------- */
type PProduto = {
    id: ID;
    nome: string;
    codigo_barras?: string;
    valor?: string | number | null;
    preco_custo?: string | number | null;
    minimo?: number | null;
    ativo?: number | null;
    categoria_id?: ID | null;
    fabricante_id?: ID | null;
    classificacao_id?: ID | null;
    categoria_nome?: string | null;
    classificacao_nome?: string | null;
};
type PSaldo = { produto_id: ID; deposito_id: ID; quantidade: number; minimo?: number | null; maximo?: number | null };
type PNome = { id: ID; nome: string };

type HistRow = {
    id: number;
    tipo: string;
    produto_id: ID;
    codigo_barras_snapshot?: string | null;
    quantidade: number | null;
    custo_unitario_snapshot?: string | number | null;
    custo_total_snapshot?: string | number | null;
    deposito_origem_id: ID | null;
    deposito_destino_id: ID | null;
    destino_texto: string | null;
    observacao: string | null;
    criado_em: string;
    confeccao_tipo?: string | null;
};
type HistResp = { ok: boolean; rows: HistRow[]; msg?: string; need_login?: 1 };

type ConfReg = {
    id: number;
    deposito_id: ID;
    deposito_nome?: string;
    operador_nome?: string;
    total_itens: number;
    total_dif: number;
    criado_em: string;
};
type ConfListResp = { ok: boolean; rows: ConfReg[]; msg?: string; need_login?: 1 };
type ConfDetResp = {
    ok: boolean;
    items?: { qtd_sistema: number; qtd_fisica: number; dif: number }[];
    msg?: string;
};

export type PainelGestaoEstoqueProps = {
    produtos: PProduto[];
    saldos: PSaldo[];
    depositos: PNome[];
    categorias: PNome[];
    classificacoes: PNome[];
};

/* ---------- API (mesmo padrão da page.tsx) ---------- */
const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/materiais_gerais.php`;

/** Quantos registros pedir por tipo. Se o PHP limitar (ex.: 500), o painel
 *  detecta e avisa até que data o histórico cobre. */
const HIST_LIMIT = 5000;
const HIST_TIPOS = ["SAIDA", "ENTRADA", "AJUSTE", "CONFECCAO", "TRANSFERENCIA"] as const;
type HistTipo = (typeof HIST_TIPOS)[number];

const KIT_LANCHE_CB = "678560";
const DAY = 86400000;

async function apiGet<T>(qs: Record<string, string | number | undefined>): Promise<T> {
    const u = new URL(API_BASE, window.location.origin);
    Object.entries(qs).forEach(([k, v]) => {
        if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
    });
    u.searchParams.set("__cb", `painel-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const r = await fetch(u.toString(), { method: "GET", cache: "no-store", credentials: "include" });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");
        throw new Error(`Resposta inesperada da API. ${txt.slice(0, 160)}`);
    }
    return (await r.json()) as T;
}

/* ---------- Utilitários ---------- */
const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const nf = (v: number, d = 0) =>
    (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v: number) => `R$ ${nf(v)}`;
const kbrl = (v: number) =>
    Math.abs(v) >= 1e6 ? `R$ ${nf(v / 1e6, 2)} mi` : Math.abs(v) >= 1e4 ? `R$ ${nf(v / 1e3, 1)} mil` : brl(v);
const ts = (s?: string | null) => {
    if (!s) return NaN;
    const t = new Date(String(s).trim().replace(" ", "T")).getTime();
    return Number.isFinite(t) ? t : NaN;
};
const isoDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (s: string) => new Date(`${s}T00:00:00`).getTime();
const endOfDay = (s: string) => new Date(`${s}T23:59:59.999`).getTime();
const fmtDay = (t: number) =>
    Number.isFinite(t) ? new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const fmtShort = (t: number) =>
    new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthKey = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (k: string) => `${MES[Number(k.slice(5)) - 1]}/${k.slice(2, 4)}`;
function monthsBetween(a: number, b: number) {
    const out: string[] = [];
    const d = new Date(a);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    while (d.getTime() <= b) {
        out.push(monthKey(d.getTime()));
        d.setMonth(d.getMonth() + 1);
    }
    return out;
}
function daysInMonthWithin(k: string, a: number, b: number) {
    const y = Number(k.slice(0, 4));
    const m = Number(k.slice(5)) - 1;
    const s = Math.max(new Date(y, m, 1).getTime(), a);
    const e = Math.min(new Date(y, m + 1, 1).getTime() - 1, b);
    return e >= s ? Math.round((e - s) / DAY) + 1 : 0;
}
const isTeste = (obs?: string | null) => (obs || "").toUpperCase().includes("TESTE");
const isAtend = (t?: string | null) => /^atendimento\s*#/i.test((t || "").trim());

/* ---------- Estilo (padrão das telas repaginadas, 06/10/2026) ---------- */
const ROTULO = "mb-1.5 block text-[12px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";
const CAMPO =
    "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-white dark:[color-scheme:dark] lg:text-[15px]";
const BTN_SEC =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#C9D1DE] bg-[#FFFFFF] px-4 text-[14px] font-bold text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-50 dark:border-white/26 dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/8";
const BTN_PRI =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#313C55] px-4 text-[14px] font-extrabold text-white hover:bg-[#232B40] disabled:opacity-50 dark:bg-[#3D6A99] dark:hover:bg-[#355D86]";

/* ---------- Pequenos componentes visuais ---------- */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <section className={["rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F] shadow-sm", className].join(" ")}>{children}</section>;
}
function Titulo({ t, s }: { t: string; s?: string }) {
    return (
        <div>
            <h3 className="text-[15px] font-extrabold text-[#313C55] dark:text-white">{t}</h3>
            {s ? <p className="mt-0.5 text-xs text-[#7A8396] dark:text-[#8893AA]">{s}</p> : null}
        </div>
    );
}
type Tom = "neutro" | "critico" | "atencao" | "ok" | "info";
const TOM: Record<Tom, string> = {
    neutro: "border-[#E3E8F0] dark:border-white/12 bg-[#F6F8FB] dark:bg-[#1C2334] text-[#5B6478] dark:text-[#AEB9CF]",
    critico: "border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 text-[#B42318] dark:text-[#FF9C92]",
    atencao: "border-[#F2CB3F] bg-[#FCF3CC] dark:bg-[#F2CB3F]/16 text-[#313C55] dark:text-white",
    ok: "border-[#7BA11A] bg-[#EEF5D6] dark:bg-[#B3CE52]/18 text-[#313C55] dark:text-white",
    info: "border-[#A9BED6] dark:border-[#3D6A99]/60 bg-[#E9EFF6] dark:bg-[#3D6A99]/20 text-[#313C55] dark:text-white",
};
function Pill({ tom = "neutro", children }: { tom?: Tom; children: React.ReactNode }) {
    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${TOM[tom]}`}>
            {children}
        </span>
    );
}
function Kpi({ l, v, d, tom }: { l: string; v: string; d?: string; tom?: "critico" | "atencao" }) {
    const bar = tom === "critico" ? "border-l-4 border-l-[#B42318] dark:border-l-[#FF9C92]" : tom === "atencao" ? "border-l-4 border-l-[#F2CB3F]" : "";
    return (
        <Card className={`p-4 ${bar}`}>
            <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">{l}</div>
            <div className="mt-2 whitespace-nowrap text-xl font-black tracking-tight text-[#313C55] dark:text-white tabular-nums sm:text-2xl">{v}</div>
            {d ? <div className="mt-1 text-xs text-[#7A8396] dark:text-[#8893AA]">{d}</div> : null}
        </Card>
    );
}
function Seg<T extends string | number>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { v: T; l: string }[];
    onChange: (v: T) => void;
}) {
    return (
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[#E3E8F0] bg-[#F6F8FB] p-1 dark:border-white/12 dark:bg-[#1C2334]">
            {options.map((o) => (
                <button
                    key={String(o.v)}
                    type="button"
                    onClick={() => onChange(o.v)}
                    className={[
                        "h-9 rounded-lg px-3 text-[13px] font-bold transition-colors",
                        o.v === value
                            ? "bg-[#FFFFFF] text-[#313C55] shadow-sm dark:bg-[#232B3F] dark:text-white"
                            : "text-[#5B6478] hover:text-[#313C55] dark:text-[#AEB9CF] dark:hover:text-white",
                    ].join(" ")}
                >
                    {o.l}
                </button>
            ))}
        </div>
    );
}
function HBars({
    rows,
    fmt,
}: {
    rows: { k: string; v: number; sub?: string; tom?: "critico" | "atencao" | "ok" | "fraco" }[];
    fmt: (v: number) => string;
}) {
    const mx = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
    if (!rows.length) return <p className="text-xs text-[#7A8396] dark:text-[#8893AA]">Sem dados para os filtros atuais.</p>;
    return (
        <div className="space-y-2">
            {rows.map((r) => {
                const cor =
                    r.tom === "critico" ? "bg-[#B42318] dark:bg-[#FF9C92]" : r.tom === "atencao" ? "bg-[#F2CB3F]" : r.tom === "ok" ? "bg-[#7BA11A] dark:bg-[#B3CE52]" : r.tom === "fraco" ? "bg-[#C9D1DE] dark:bg-white/26" : "bg-[#3D6A99]";
                return (
                    <div key={r.k} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[minmax(0,12rem)_1fr_auto]" title={r.sub || ""}>
                        <span className="truncate text-right text-[#5B6478] dark:text-[#AEB9CF]">{r.k}</span>
                        <span className="h-3 rounded bg-[#EEF2F7] dark:bg-white/8">
                            <span className={`block h-3 rounded ${cor}`} style={{ width: `${Math.max(1.5, (Math.abs(r.v) / mx) * 100)}%` }} />
                        </span>
                        <span className="whitespace-nowrap text-right font-semibold tabular-nums text-[#313C55] dark:text-white">{fmt(r.v)}</span>
                    </div>
                );
            })}
        </div>
    );
}
function VBars({
    labels,
    series,
    fmt,
    projecao,
}: {
    labels: string[];
    series: { nome: string; cor: string; vals: number[] }[];
    fmt: (v: number) => string;
    projecao?: (number | null)[];
}) {
    const all = series.flatMap((s) => s.vals).concat((projecao || []).map((v) => v || 0));
    const mx = Math.max(1, ...all);
    if (!labels.length) return <p className="text-xs text-[#7A8396] dark:text-[#8893AA]">Sem dados no período.</p>;
    return (
        <div>
            <div className="flex h-44 items-end gap-1 sm:gap-2">
                {labels.map((l, i) => (
                    <div key={l} className="flex h-full flex-1 flex-col justify-end">
                        <div className="flex h-full items-end justify-center gap-0.5">
                            {series.map((s, j) => {
                                const v = s.vals[i] || 0;
                                const p = series.length === 1 && projecao ? projecao[i] : null;
                                return (
                                    <div
                                        key={s.nome}
                                        className="relative flex h-full w-full max-w-[2.5rem] flex-col justify-end"
                                        title={`${l} · ${s.nome}: ${fmt(v)}${p ? ` (projeção ${fmt(p)})` : ""}`}
                                    >
                                        {p && p > v ? (
                                            <div className="w-full rounded-t border-2 border-b-0 border-dashed border-[#3D6A99]/70" style={{ height: `${((p - v) / mx) * 100}%` }} />
                                        ) : null}
                                        <div className={`w-full ${p && p > v ? "" : "rounded-t"} ${s.cor}`} style={{ height: `${(v / mx) * 100}%` }} />
                                        {j === 0 && series.length === 1 ? (
                                            <span className="absolute -top-4 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-[#5B6478] dark:text-[#AEB9CF] sm:block">
                                                {fmt(v)}
                                            </span>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-1 flex gap-1 sm:gap-2">
                {labels.map((l) => (
                    <div key={l} className="flex-1 text-center text-[10px] text-[#7A8396] dark:text-[#8893AA]">
                        {l}
                    </div>
                ))}
            </div>
            {series.length > 1 ? (
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[#5B6478] dark:text-[#AEB9CF]">
                    {series.map((s) => (
                        <span key={s.nome} className="inline-flex items-center gap-1.5">
                            <i className={`inline-block h-2.5 w-2.5 rounded-sm ${s.cor}`} />
                            {s.nome}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
function Spark({ vals }: { vals: number[] }) {
    if (vals.length < 2) return <span className="text-xs text-[#7A8396] dark:text-[#8893AA]">—</span>;
    const W = 90,
        H = 22,
        mx = Math.max(1, ...vals);
    const pts = vals.map((v, i) => [2 + (i * (W - 4)) / (vals.length - 1), H - 3 - (v / mx) * (H - 6)]);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
    const last = pts[pts.length - 1];
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <path d={`${d} L${W - 2} ${H - 2} L2 ${H - 2}Z`} className="fill-[#E9EFF6] dark:fill-[#3D6A99]/25" />
            <path d={d} fill="none" className="stroke-[#3D6A99] dark:stroke-[#A9BED6]" strokeWidth={1.5} />
            <circle cx={last[0]} cy={last[1]} r={2.5} className="fill-[#3D6A99] dark:fill-[#A9BED6]" />
        </svg>
    );
}
function Tendencia({ t, base }: { t: number; base: number }) {
    if (base < 0.5 || !Number.isFinite(t)) return <span className="text-xs text-[#7A8396] dark:text-[#8893AA]">—</span>;
    const p = Math.round(t * 100);
    if (p > 200) return <Pill tom="atencao">▲ &gt;200%</Pill>;
    if (p > 15) return <Pill tom="atencao">▲ {p}%</Pill>;
    if (p < -15) return <Pill tom="info">▼ {Math.abs(p)}%</Pill>;
    return <span className="whitespace-nowrap text-xs font-semibold text-[#7A8396] dark:text-[#8893AA]">● {p > 0 ? "+" : ""}{p}%</span>;
}
function Regularidade({ cv, base }: { cv: number; base: number }) {
    if (base < 0.5) return <Pill tom="info">Pouco uso</Pill>;
    return cv <= 0.35 ? <Pill tom="ok">Estável</Pill> : cv <= 0.75 ? <Pill tom="atencao">Variável</Pill> : <Pill tom="critico">Irregular</Pill>;
}
function Tabela({ head, children, alinhar }: { head: string[]; children: React.ReactNode; alinhar?: ("l" | "r")[] }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
                <thead>
                    <tr className="border-b border-[#E3E8F0] dark:border-white/12 bg-[#F6F8FB] dark:bg-[#1C2334] text-[11px] uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                        {head.map((h, i) => (
                            <th key={h + i} className={`whitespace-nowrap px-3 py-2.5 font-extrabold ${alinhar?.[i] === "r" ? "text-right" : "text-left"}`}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E8F0] dark:divide-white/12">{children}</tbody>
            </table>
        </div>
    );
}
const tdR = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";
const tdL = "px-3 py-2.5";
function Vazio({ cols, txt = "Nenhum item." }: { cols: number; txt?: string }) {
    return (
        <tr>
            <td colSpan={cols} className="px-3 py-3 text-xs text-[#7A8396] dark:text-[#8893AA]">
                {txt}
            </td>
        </tr>
    );
}

/* ---------- Estruturas calculadas ---------- */
type Consumo = { pid: ID; t: number; q: number; atend: string | null; custoUnit: number; dep: ID | null };
type ProdCalc = {
    id: ID;
    nome: string;
    cat: string;
    cls: string;
    custo: number;
    venda: number;
    saldo: number;
    valor: number;
    valorVenda: number;
    minimoComSaldo: number;
    depsAbaixo: number;
    qP: number;
    mP: number;
    mR: number;
    mPrev: number;
    pond: number;
    tr: number;
    sd: number;
    cv: number;
    mensal: number[];
    ultimaSaida: number;
};
type SubTab = "GERAL" | "ESTOQUE" | "CONSUMO" | "COMPRAS" | "CUSTOS" | "CONTROLE" | "GUIA";

/* =====================================================================
   COMPONENTE
   ===================================================================== */
export default function PainelGestaoEstoque({ produtos, saldos, depositos, categorias, classificacoes }: PainelGestaoEstoqueProps) {
    const hoje = useMemo(() => new Date(), []);
    const [sub, setSub] = useState<SubTab>("GERAL");

    /* ---------- filtros globais ---------- */
    const [de, setDe] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 89);
        return isoDay(d);
    });
    const [ate, setAte] = useState(() => isoDay(new Date()));
    const [clsId, setClsId] = useState<ID | 0>(0);
    const [catId, setCatId] = useState<ID | 0>(0);
    const [depId, setDepId] = useState<ID | 0>(0);
    function preset(dias: number) {
        const d = new Date();
        d.setDate(d.getDate() - (dias - 1));
        setDe(isoDay(d));
        setAte(isoDay(new Date()));
    }

    /* ---------- carga de dados ---------- */
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [hist, setHist] = useState<Record<HistTipo, HistRow[]>>({ SAIDA: [], ENTRADA: [], AJUSTE: [], CONFECCAO: [], TRANSFERENCIA: [] });
    const [truncado, setTruncado] = useState<Record<HistTipo, boolean>>({ SAIDA: false, ENTRADA: false, AJUSTE: false, CONFECCAO: false, TRANSFERENCIA: false });
    const [confs, setConfs] = useState<(ConfReg & { sistema?: number; absDif?: number })[]>([]);
    const [carregadoEm, setCarregadoEm] = useState<number>(NaN);

    async function carregar() {
        setLoading(true);
        setErr("");
        try {
            const umAno = new Date();
            umAno.setFullYear(umAno.getFullYear() - 1);
            const resps = await Promise.all(
                HIST_TIPOS.map((tipo) =>
                    apiGet<HistResp>({ historico: 1, tipo, limit: HIST_LIMIT, data_ini: isoDay(umAno), data_fim: isoDay(new Date()) })
                )
            );
            const h = {} as Record<HistTipo, HistRow[]>;
            const tr = {} as Record<HistTipo, boolean>;
            resps.forEach((r, i) => {
                const tipo = HIST_TIPOS[i];
                if (r.need_login) throw new Error("Sessão expirada. Entre novamente no sistema.");
                if (!r.ok) throw new Error(r.msg || `Falha ao carregar ${tipo}.`);
                const rows = (r.rows || []).filter((x) => Number.isFinite(ts(x.criado_em)));
                h[tipo] = rows;
                // Se voltou um número "redondo" de registros, o PHP limitou a consulta.
                tr[tipo] = rows.length >= HIST_LIMIT || (rows.length >= 100 && rows.length % 100 === 0);
            });
            setHist(h);
            setTruncado(tr);

            const cl = await apiGet<ConfListResp>({ conferencias: 1, limit: 100 });
            const lista = cl.ok ? cl.rows || [] : [];
            const recentes = [...lista].sort((a, b) => ts(b.criado_em) - ts(a.criado_em)).slice(0, 10);
            const dets = await Promise.all(
                recentes.map((c) => apiGet<ConfDetResp>({ conferencia_id: c.id }).catch(() => ({ ok: false } as ConfDetResp)))
            );
            setConfs(
                recentes.map((c, i) => {
                    const it = dets[i].ok ? dets[i].items || [] : [];
                    return {
                        ...c,
                        sistema: it.reduce((s, x) => s + num(x.qtd_sistema), 0),
                        absDif: it.reduce((s, x) => s + Math.abs(num(x.dif)), 0),
                    };
                })
            );
            setCarregadoEm(Date.now());
        } catch (e: any) {
            setErr(e?.message || "Erro ao carregar os dados do painel.");
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ---------- dicionários ---------- */
    const catNome = useMemo(() => new Map(categorias.map((c) => [Number(c.id), c.nome])), [categorias]);
    const clsNome = useMemo(() => new Map(classificacoes.map((c) => [Number(c.id), (c.nome || "").trim()])), [classificacoes]);
    const depNome = useMemo(() => new Map(depositos.map((d) => [Number(d.id), d.nome])), [depositos]);
    const prodById = useMemo(() => new Map(produtos.map((p) => [Number(p.id), p])), [produtos]);
    const nomeCat = (p: PProduto) => (p.categoria_nome || (p.categoria_id ? catNome.get(Number(p.categoria_id)) : "") || "Sem categoria").trim();
    const nomeCls = (p: PProduto) => (p.classificacao_nome || (p.classificacao_id ? clsNome.get(Number(p.classificacao_id)) : "") || "Sem classificação").trim();

    const catsDaClasse = useMemo(() => {
        const set = new Set<number>();
        produtos.forEach((p) => {
            if (!clsId || Number(p.classificacao_id) === clsId) if (p.categoria_id) set.add(Number(p.categoria_id));
        });
        return categorias.filter((c) => set.has(Number(c.id))).sort((a, b) => a.nome.localeCompare(b.nome));
    }, [produtos, categorias, clsId]);
    useEffect(() => {
        if (catId && !catsDaClasse.some((c) => Number(c.id) === catId)) setCatId(0);
    }, [catsDaClasse, catId]);

    const noFiltro = (p?: PProduto) =>
        !!p && Number(p.ativo ?? 1) !== 0 && (!clsId || Number(p.classificacao_id) === clsId) && (!catId || Number(p.categoria_id) === catId);

    /* ---------- cobertura do histórico ---------- */
    const cobertura = useMemo(() => {
        const inicio = (tipo: HistTipo) => {
            const rows = hist[tipo];
            if (!rows.length) return NaN;
            return Math.min(...rows.map((r) => ts(r.criado_em)));
        };
        const umAno = new Date();
        umAno.setFullYear(umAno.getFullYear() - 1);
        const saidasDesde = truncado.SAIDA ? inicio("SAIDA") : umAno.getTime();
        const confDesde = truncado.CONFECCAO ? inicio("CONFECCAO") : umAno.getTime();
        return {
            consumoDesde: Math.max(saidasDesde || 0, confDesde || 0),
            entradasDesde: truncado.ENTRADA ? inicio("ENTRADA") : umAno.getTime(),
            ajustesDesde: truncado.AJUSTE ? inicio("AJUSTE") : umAno.getTime(),
            limitado: truncado.SAIDA || truncado.CONFECCAO,
        };
    }, [hist, truncado]);

    /* ---------- eventos de consumo (saídas + insumos de confecção) ---------- */
    const consumos = useMemo<Consumo[]>(() => {
        const out: Consumo[] = [];
        for (const r of hist.SAIDA) {
            if (isTeste(r.observacao)) continue;
            out.push({
                pid: Number(r.produto_id),
                t: ts(r.criado_em),
                q: Math.abs(num(r.quantidade)),
                atend: isAtend(r.destino_texto) ? (r.destino_texto || "").trim() : null,
                custoUnit: num(r.custo_unitario_snapshot),
                dep: r.deposito_origem_id ? Number(r.deposito_origem_id) : null,
            });
        }
        for (const r of hist.CONFECCAO) {
            if (isTeste(r.observacao)) continue;
            const p = prodById.get(Number(r.produto_id));
            const cb = String(r.codigo_barras_snapshot || p?.codigo_barras || "");
            const ehProdutoFinal =
                (r.confeccao_tipo === "KIT_LANCHE" && cb === KIT_LANCHE_CB) ||
                (r.confeccao_tipo === "COROA_ARTIFICIAL" && /COROA/i.test(p ? nomeCat(p) : ""));
            if (ehProdutoFinal) continue; // produto final entra no estoque; não é consumo
            out.push({
                pid: Number(r.produto_id),
                t: ts(r.criado_em),
                q: Math.abs(num(r.quantidade)),
                atend: null,
                custoUnit: num(r.custo_unitario_snapshot),
                dep: r.deposito_origem_id ? Number(r.deposito_origem_id) : null,
            });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hist, prodById]);

    /* ---------- período efetivo ---------- */
    const periodo = useMemo(() => {
        const a0 = startOfDay(de);
        const b = Math.min(endOfDay(ate), Date.now());
        const a = Math.max(a0, cobertura.consumoDesde || a0);
        const dias = Math.max(1, Math.round((b - a) / DAY));
        const recDias = Math.max(1, Math.min(90, Math.round((Date.now() - (cobertura.consumoDesde || 0)) / DAY)));
        return { a0, a, b, dias, cortado: a > a0 + DAY, recDias, meses: monthsBetween(a, b) };
    }, [de, ate, cobertura.consumoDesde]);

    /* ---------- cálculo por produto ---------- */
    const calc = useMemo<ProdCalc[]>(() => {
        const saldoPorProd = new Map<number, { s: number; minSaldo: number; abaixo: number }>();
        for (const s of saldos) {
            if (depId && Number(s.deposito_id) !== depId) continue;
            const q = num(s.quantidade);
            const o = saldoPorProd.get(Number(s.produto_id)) || { s: 0, minSaldo: 0, abaixo: 0 };
            o.s += q;
            if (q > 0) {
                o.minSaldo += num(s.minimo);
                if (num(s.minimo) > 0 && q < num(s.minimo)) o.abaixo++;
            }
            saldoPorProd.set(Number(s.produto_id), o);
        }
        const agora = Date.now();
        const recIni = agora - periodo.recDias * DAY;
        const prevIni = recIni - periodo.recDias * DAY;
        const temPrev = prevIni >= (cobertura.consumoDesde || 0) - DAY;
        const porProd = new Map<number, Consumo[]>();
        for (const c of consumos) {
            if (depId && c.dep !== depId) continue;
            const arr = porProd.get(c.pid) || [];
            arr.push(c);
            porProd.set(c.pid, arr);
        }
        const out: ProdCalc[] = [];
        for (const p of produtos) {
            if (!noFiltro(p)) continue;
            const id = Number(p.id);
            const st = saldoPorProd.get(id) || { s: 0, minSaldo: 0, abaixo: 0 };
            const evs = porProd.get(id) || [];
            if (st.s === 0 && !evs.length) continue;
            let qP = 0,
                qR = 0,
                qPrev = 0,
                ult = NaN;
            const mensalQ = new Map<string, number>();
            for (const e of evs) {
                if (e.t >= periodo.a && e.t <= periodo.b) {
                    qP += e.q;
                    const k = monthKey(e.t);
                    mensalQ.set(k, (mensalQ.get(k) || 0) + e.q);
                }
                if (e.t >= recIni) qR += e.q;
                else if (e.t >= prevIni) qPrev += e.q;
                if (!(ult >= e.t)) ult = e.t;
            }
            const mensal = periodo.meses.map((k) => {
                const dias = daysInMonthWithin(k, periodo.a, periodo.b);
                return dias ? ((mensalQ.get(k) || 0) / dias) * 30 : 0;
            });
            const mu = mensal.length ? mensal.reduce((a, b) => a + b, 0) / mensal.length : 0;
            const sd = mensal.length ? Math.sqrt(mensal.reduce((a, b) => a + (b - mu) ** 2, 0) / mensal.length) : 0;
            const mP = (qP / periodo.dias) * 30;
            const mR = (qR / periodo.recDias) * 30;
            const mPrev = temPrev ? (qPrev / periodo.recDias) * 30 : NaN;
            const custo = num(p.preco_custo);
            out.push({
                id,
                nome: (p.nome || "").trim(),
                cat: nomeCat(p),
                cls: nomeCls(p),
                custo,
                venda: num(p.valor),
                saldo: st.s,
                valor: st.s * custo,
                valorVenda: st.s * num(p.valor),
                minimoComSaldo: st.minSaldo,
                depsAbaixo: st.abaixo,
                qP,
                mP,
                mR,
                mPrev,
                pond: 0.6 * mR + 0.4 * mP,
                tr: Number.isFinite(mPrev) && mPrev > 0 ? (mR - mPrev) / mPrev : mR > 0 && Number.isFinite(mPrev) ? 1 : NaN,
                sd,
                cv: mu ? sd / mu : 9,
                mensal,
                ultimaSaida: ult,
            });
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [produtos, saldos, consumos, periodo, depId, clsId, catId, cobertura.consumoDesde]);

    const cobDias = (r: ProdCalc) => (r.pond > 0 ? Math.max(0, r.saldo) / (r.pond / 30) : Infinity);
    const comConsumo = (r: ProdCalc) => Math.max(r.mP, r.mR) >= 1;

    /* ---------- agregados gerais ---------- */
    const tot = useMemo(() => {
        const valor = calc.reduce((s, r) => s + Math.max(0, r.valor), 0);
        const venda = calc.reduce((s, r) => s + Math.max(0, r.valorVenda), 0);
        const un = calc.reduce((s, r) => s + Math.max(0, r.saldo), 0);
        const nProd = calc.filter((r) => r.saldo > 0).length;
        const consMes = calc.reduce((s, r) => s + r.mP * r.custo, 0);
        const parado = calc.filter((r) => r.saldo > 0 && r.qP === 0);
        const valorParado = parado.reduce((s, r) => s + r.valor, 0);
        const zerados = calc.filter((r) => r.saldo <= 0 && r.pond >= 1).length;
        const urg = calc.filter((r) => r.pond >= 1 && cobDias(r) < 30).sort((a, b) => cobDias(a) - cobDias(b));
        return { valor, venda, un, nProd, consMes, parado, valorParado, zerados, urg };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calc]);

    const saidasMes = useMemo(() => {
        const ids = new Set(calc.map((r) => r.id));
        const m = new Map<string, number>();
        for (const c of consumos) {
            if (!ids.has(c.pid) || c.t < periodo.a || c.t > periodo.b) continue;
            if (depId && c.dep !== depId) continue;
            m.set(monthKey(c.t), (m.get(monthKey(c.t)) || 0) + c.q);
        }
        const vals = periodo.meses.map((k) => m.get(k) || 0);
        const proj = periodo.meses.map((k, i) => {
            const y = Number(k.slice(0, 4)),
                mo = Number(k.slice(5)) - 1;
            const total = new Date(y, mo + 1, 0).getDate();
            const dias = daysInMonthWithin(k, periodo.a, periodo.b);
            return dias && dias < total ? (vals[i] / dias) * total : null;
        });
        return { vals, proj };
    }, [calc, consumos, periodo, depId]);

    const atendMes = useMemo(() => {
        const m = new Map<string, Set<string>>();
        for (const c of consumos) {
            if (!c.atend || c.t < periodo.a || c.t > periodo.b) continue;
            const k = monthKey(c.t);
            if (!m.has(k)) m.set(k, new Set());
            m.get(k)!.add(c.atend);
        }
        return m;
    }, [consumos, periodo]);

    const periodoLabel = `${fmtDay(periodo.a)} a ${fmtDay(periodo.b)} · ${periodo.dias} dias`;

    /* =================================================================
       RENDER
       ================================================================= */
    const subTabs: { k: SubTab; l: string }[] = [
        { k: "GERAL", l: "Visão geral" },
        { k: "ESTOQUE", l: "Estoque" },
        { k: "CONSUMO", l: "Consumo e tendências" },
        { k: "COMPRAS", l: "Planejar compras" },
        { k: "CUSTOS", l: "Custos" },
        { k: "CONTROLE", l: "Controle" },
        { k: "GUIA", l: "Como calcula" },
    ];

    return (
        <div className="space-y-4">
            {/* ---------- Filtros ---------- */}
            <Card className="p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-[auto_auto_1fr_1fr_1fr]">
                    <label className="block">
                        <span className={ROTULO}>De</span>
                        <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} className={CAMPO} />
                    </label>
                    <label className="block">
                        <span className={ROTULO}>Até</span>
                        <input type="date" value={ate} min={de} max={isoDay(hoje)} onChange={(e) => setAte(e.target.value)} className={CAMPO} />
                    </label>
                    <label className="col-span-2 block lg:col-span-1">
                        <span className={ROTULO}>Classificação</span>
                        <select value={clsId} onChange={(e) => setClsId(Number(e.target.value))} className={CAMPO}>
                            <option value={0}>Todas</option>
                            {classificacoes.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {(c.nome || "").trim()}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="col-span-2 block lg:col-span-1">
                        <span className={ROTULO}>Categoria</span>
                        <select value={catId} onChange={(e) => setCatId(Number(e.target.value))} className={CAMPO}>
                            <option value={0}>Todas</option>
                            {catsDaClasse.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="col-span-2 block lg:col-span-1">
                        <span className={ROTULO}>Depósito</span>
                        <select value={depId} onChange={(e) => setDepId(Number(e.target.value))} className={CAMPO}>
                            <option value={0}>Todos</option>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Seg
                        value={0 as number}
                        options={[
                            { v: 30, l: "30 dias" },
                            { v: 90, l: "90 dias" },
                            { v: 180, l: "6 meses" },
                            { v: 365, l: "12 meses" },
                        ]}
                        onChange={(v) => preset(Number(v))}
                    />
                    <Pill>Período: {periodoLabel}</Pill>
                    {Number.isFinite(carregadoEm) ? <Pill>Atualizado às {new Date(carregadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Pill> : null}
                    <button type="button" onClick={carregar} disabled={loading} className={`ml-auto ${BTN_SEC}`} aria-label="Atualizar dados" title="Atualizar dados">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={loading ? "animate-spin" : ""}>
                            <path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4" />
                        </svg>
                        <span className="hidden sm:inline">{loading ? "Atualizando…" : "Atualizar"}</span>
                    </button>
                </div>

                {periodo.cortado ? (
                    <div className="mt-3 rounded-2xl border border-[#F2CB3F] bg-[#FCF3CC] p-3 text-xs leading-5 text-[#313C55] dark:bg-[#F2CB3F]/16 dark:text-white">
                        O histórico devolvido pela API começa em <b>{fmtDay(cobertura.consumoDesde)}</b>. As médias e a tendência usam só esse trecho
                        ({periodo.dias} dias). Para analisar períodos maiores, o <b>materiais_gerais.php</b> precisa devolver mais registros no
                        histórico (hoje ele limita a quantidade por consulta).
                    </div>
                ) : null}
                {err ? <div className="mt-3 rounded-2xl border border-[#B42318] bg-[#FDECEA] p-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">{err}</div> : null}
            </Card>

            <nav role="tablist" aria-label="Seções do painel" className="flex gap-1 overflow-x-auto rounded-2xl border border-[#E3E8F0] bg-[#FFFFFF] p-1.5 dark:border-white/12 dark:bg-[#232B3F]">
                {subTabs.map((t) => (
                    <button
                        key={t.k}
                        type="button"
                        role="tab"
                        aria-selected={sub === t.k}
                        onClick={() => setSub(t.k)}
                        className={[
                            "h-11 flex-1 whitespace-nowrap rounded-[10px] px-4 text-[14px] transition-colors",
                            sub === t.k
                                ? "bg-[#313C55] font-extrabold text-white dark:bg-[#3D6A99]"
                                : "font-bold text-[#5B6478] hover:bg-[#EEF2F7] hover:text-[#313C55] dark:text-[#AEB9CF] dark:hover:bg-white/8 dark:hover:text-white",
                        ].join(" ")}
                    >
                        {t.l}
                    </button>
                ))}
            </nav>

            {loading && !Number.isFinite(carregadoEm) ? (
                <Card className="p-6 text-sm text-[#7A8396] dark:text-[#8893AA]">Carregando movimentações e conferências...</Card>
            ) : null}

            {sub === "GERAL" ? <AbaGeral tot={tot} calc={calc} cobDias={cobDias} saidasMes={saidasMes} meses={periodo.meses} confs={confs} /> : null}
            {sub === "ESTOQUE" ? <AbaEstoque calc={calc} tot={tot} saldos={saldos} depNome={depNome} depId={depId} cobDias={cobDias} hist={hist} consumos={consumos} periodo={periodo} prodIds={new Set(calc.map((r) => r.id))} /> : null}
            {sub === "CONSUMO" ? (
                <AbaConsumo calc={calc} comConsumo={comConsumo} saidasMes={saidasMes} meses={periodo.meses} atendMes={atendMes} consumos={consumos} periodo={periodo} depId={depId} />
            ) : null}
            {sub === "COMPRAS" ? <AbaCompras calc={calc} /> : null}
            {sub === "CUSTOS" ? <AbaCustos calc={calc} consumos={consumos} hist={hist} periodo={periodo} atendMes={atendMes} depId={depId} /> : null}
            {sub === "CONTROLE" ? <AbaControle confs={confs} hist={hist} cobertura={cobertura} truncado={truncado} /> : null}
            {sub === "GUIA" ? <AbaGuia recDias={periodo.recDias} /> : null}
        </div>
    );
}

/* =====================================================================
   ABA: VISÃO GERAL
   ===================================================================== */
function AbaGeral({
    tot,
    calc,
    cobDias,
    saidasMes,
    meses,
    confs,
}: {
    tot: any;
    calc: ProdCalc[];
    cobDias: (r: ProdCalc) => number;
    saidasMes: { vals: number[]; proj: (number | null)[] };
    meses: string[];
    confs: (ConfReg & { sistema?: number; absDif?: number })[];
}) {
    const porCls = new Map<string, number>();
    calc.forEach((r) => porCls.set(r.cls, (porCls.get(r.cls) || 0) + Math.max(0, r.valor)));
    const ultConf = confs.find((c) => (c.sistema || 0) > 0);
    const acur = ultConf ? 1 - (ultConf.absDif || 0) / (ultConf.sistema || 1) : NaN;
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi l="Estoque a custo" v={kbrl(tot.valor)} d={`${nf(tot.un)} un · ${tot.nProd} produtos`} />
                <Kpi l="Potencial de venda" v={kbrl(tot.venda)} d={tot.valor ? `Markup ${nf(tot.venda / tot.valor, 1)}× sobre custo` : "—"} />
                <Kpi l="Consumo mensal a custo" v={kbrl(tot.consMes)} d="Média do período" />
                <Kpi l="Cobertura do estoque" v={tot.consMes ? `${nf(tot.valor / tot.consMes, 1)} meses` : "—"} d={tot.consMes && tot.valor ? `Giro anual ${nf((tot.consMes * 12) / tot.valor, 1)}×` : "sem consumo no período"} />
                <Kpi l="Sem saída no período" v={kbrl(tot.valorParado)} d={tot.valor ? `${nf((tot.valorParado / tot.valor) * 100)}% do valor · ${tot.parado.length} produtos` : "—"} tom={tot.valor && tot.valorParado / tot.valor > 0.3 ? "critico" : undefined} />
                <Kpi l="Zerados com consumo" v={String(tot.zerados)} d="Saem ≥ 1/mês e estão com saldo 0" tom={tot.zerados ? "critico" : undefined} />
                <Kpi l="Cobertura < 30 dias" v={String(tot.urg.length)} d="Itens de consumo regular" tom={tot.urg.length ? "atencao" : undefined} />
                <Kpi
                    l="Acuracidade (última conferência)"
                    v={Number.isFinite(acur) ? `${nf(acur * 100, 1)}%` : "—"}
                    d={ultConf ? `${ultConf.deposito_nome || "Depósito"} · ${fmtDay(ts(ultConf.criado_em))}` : "sem conferência"}
                    tom={Number.isFinite(acur) && acur < 0.95 ? "critico" : undefined}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="space-y-3 p-4">
                    <Titulo t="Estoque por classificação" s="Valor a custo, posição atual" />
                    <HBars
                        rows={[...porCls.entries()]
                            .filter((e) => e[1] > 0)
                            .sort((a, b) => b[1] - a[1])
                            .map(([k, v]) => ({ k, v, sub: `${nf((v / (tot.valor || 1)) * 100)}%` }))}
                        fmt={(v) => `${kbrl(v)} · ${nf((v / (tot.valor || 1)) * 100)}%`}
                    />
                </Card>
                <Card className="space-y-3 p-4">
                    <Titulo t="Saídas por mês no período" s="Unidades · tracejado = projeção do mês incompleto" />
                    <VBars labels={meses.map(monthLabel)} series={[{ nome: "Saídas", cor: "bg-[#3D6A99]", vals: saidasMes.vals }]} projecao={saidasMes.proj} fmt={(v) => nf(v)} />
                </Card>
            </div>

            <Card className="space-y-3 p-4">
                <Titulo t="Precisam de atenção agora" s="Cobertura abaixo de 30 dias pelo consumo ponderado" />
                <Tabela head={["Produto", "Categoria", "Saldo", "Consumo/mês", "Cobertura", "Tendência", "Status"]} alinhar={["l", "l", "r", "r", "r", "l", "l"]}>
                    {tot.urg.length ? (
                        tot.urg.slice(0, 15).map((r: ProdCalc) => {
                            const c = cobDias(r);
                            return (
                                <tr key={r.id}>
                                    <td className={tdL}>{r.nome}</td>
                                    <td className={`${tdL} text-[#7A8396] dark:text-[#8893AA]`}>{r.cat}</td>
                                    <td className={tdR}>{nf(r.saldo)}</td>
                                    <td className={tdR}>{nf(r.pond, 1)}</td>
                                    <td className={tdR}>{nf(c)} d</td>
                                    <td className={tdL}>
                                        <Tendencia t={r.tr} base={r.pond} />
                                    </td>
                                    <td className={tdL}>{c < 15 ? <Pill tom="critico">Crítico</Pill> : <Pill tom="atencao">Atenção</Pill>}</td>
                                </tr>
                            );
                        })
                    ) : (
                        <Vazio cols={7} txt="Nenhum item com cobertura abaixo de 30 dias." />
                    )}
                </Tabela>
            </Card>
        </div>
    );
}

/* =====================================================================
   ABA: ESTOQUE
   ===================================================================== */
function curvaABC(items: { nome: string; v: number }[]) {
    const tot = items.reduce((s, x) => s + x.v, 0);
    const so = items.filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const cl: Record<"A" | "B" | "C", { nome: string; v: number }[]> = { A: [], B: [], C: [] };
    let acc = 0;
    so.forEach((x) => {
        acc += x.v;
        (acc <= tot * 0.8 || !cl.A.length ? cl.A : acc <= tot * 0.95 ? cl.B : cl.C).push(x);
    });
    return { tot, n: so.length, cl };
}
function BlocoABC({ titulo, sub, items }: { titulo: string; sub: string; items: { nome: string; v: number }[] }) {
    const { tot, n, cl } = curvaABC(items);
    const soma = (a: { v: number }[]) => a.reduce((s, x) => s + x.v, 0);
    const cores = { A: "bg-[#3D6A99]", B: "bg-[#A9BED6] dark:bg-[#A9BED6]/60", C: "bg-[#E3E8F0] dark:bg-white/12" };
    return (
        <Card className="space-y-3 p-4">
            <Titulo t={titulo} s={sub} />
            {tot ? (
                <>
                    <div className="flex h-3 gap-0.5 overflow-hidden rounded">
                        {(["A", "B", "C"] as const).map((k) => (
                            <div key={k} className={cores[k]} style={{ flex: Math.max(0.001, soma(cl[k])) }} />
                        ))}
                    </div>
                    <Tabela head={["Classe", "Produtos", "% itens", "Valor", "% valor", "Principais"]} alinhar={["l", "r", "r", "r", "r", "l"]}>
                        {(["A", "B", "C"] as const).map((k) => (
                            <tr key={k}>
                                <td className={tdL}>
                                    <span className="inline-flex items-center gap-2 font-bold">
                                        <i className={`inline-block h-2.5 w-2.5 rounded-sm ${cores[k]}`} />
                                        {k}
                                    </span>
                                </td>
                                <td className={tdR}>{cl[k].length}</td>
                                <td className={tdR}>{nf((cl[k].length / (n || 1)) * 100)}%</td>
                                <td className={tdR}>{kbrl(soma(cl[k]))}</td>
                                <td className={tdR}>{nf((soma(cl[k]) / tot) * 100)}%</td>
                                <td className={`${tdL} text-xs text-[#7A8396] dark:text-[#8893AA]`}>{cl[k].slice(0, 2).map((x) => x.nome).join(", ")}</td>
                            </tr>
                        ))}
                    </Tabela>
                </>
            ) : (
                <p className="text-xs text-[#7A8396] dark:text-[#8893AA]">Sem valor para os filtros atuais.</p>
            )}
        </Card>
    );
}
function AbaEstoque({
    calc,
    tot,
    saldos,
    depNome,
    depId,
    cobDias,
    hist,
    consumos,
    periodo,
    prodIds,
}: {
    calc: ProdCalc[];
    tot: any;
    saldos: PSaldo[];
    depNome: Map<number, string>;
    depId: number;
    cobDias: (r: ProdCalc) => number;
    hist: Record<HistTipo, HistRow[]>;
    consumos: Consumo[];
    periodo: { a: number; b: number; meses: string[] };
    prodIds: Set<number>;
}) {
    const porCat = new Map<string, { np: number; un: number; v: number; vv: number; parado: number; cm: number }>();
    calc.forEach((r) => {
        const o = porCat.get(r.cat) || { np: 0, un: 0, v: 0, vv: 0, parado: 0, cm: 0 };
        if (r.saldo > 0) {
            o.np++;
            o.un += r.saldo;
        }
        o.v += Math.max(0, r.valor);
        o.vv += Math.max(0, r.valorVenda);
        if (r.saldo > 0 && r.qP === 0) o.parado += r.valor;
        o.cm += r.mP * r.custo;
        porCat.set(r.cat, o);
    });
    const cats = [...porCat.entries()].filter((e) => e[1].v > 0 || e[1].cm > 0).sort((a, b) => b[1].v - a[1].v);

    const custoPorId = new Map(calc.map((r) => [r.id, r.custo]));
    const porDep = new Map<string, number>();
    saldos.forEach((s) => {
        if (depId && Number(s.deposito_id) !== depId) return;
        if (!prodIds.has(Number(s.produto_id)) || num(s.quantidade) <= 0) return;
        const k = depNome.get(Number(s.deposito_id)) || `Depósito ${s.deposito_id}`;
        porDep.set(k, (porDep.get(k) || 0) + num(s.quantidade) * (custoPorId.get(Number(s.produto_id)) || 0));
    });

    const entMes = new Map<string, number>();
    hist.ENTRADA.forEach((r) => {
        const t = ts(r.criado_em);
        if (t < periodo.a || t > periodo.b || !prodIds.has(Number(r.produto_id))) return;
        if (depId && Number(r.deposito_destino_id) !== depId) return;
        entMes.set(monthKey(t), (entMes.get(monthKey(t)) || 0) + Math.abs(num(r.quantidade)));
    });
    const saiMes = new Map<string, number>();
    consumos.forEach((c) => {
        if (c.t < periodo.a || c.t > periodo.b || !prodIds.has(c.pid)) return;
        if (depId && c.dep !== depId) return;
        saiMes.set(monthKey(c.t), (saiMes.get(monthKey(c.t)) || 0) + c.q);
    });

    const parados = [...tot.parado].sort((a: ProdCalc, b: ProdCalc) => b.valor - a.valor);
    const excesso = calc.filter((r) => r.pond > 0 && cobDias(r) > 180 && r.valor > 150).sort((a, b) => b.valor - a.valor);
    const abaixo = calc.filter((r) => r.depsAbaixo > 0).sort((a, b) => cobDias(a) - cobDias(b));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="space-y-3 p-4">
                    <Titulo t="Valor a custo por categoria" s={`${cats.length} categorias · ${kbrl(tot.valor)}`} />
                    <HBars rows={cats.filter((e) => e[1].v > 0).map(([k, o]) => ({ k, v: o.v, sub: `${o.np} produtos · ${nf(o.un)} un` }))} fmt={(v) => `${kbrl(v)} · ${nf((v / (tot.valor || 1)) * 100)}%`} />
                </Card>
                <Card className="space-y-3 p-4">
                    <Titulo t="Valor a custo por depósito" s="Onde o dinheiro está fisicamente" />
                    <HBars
                        rows={[...porDep.entries()]
                            .filter((e) => e[1] > 0)
                            .sort((a, b) => b[1] - a[1])
                            .map(([k, v]) => ({ k, v, tom: /DEFEITO/i.test(k) ? ("atencao" as const) : undefined }))}
                        fmt={kbrl}
                    />
                </Card>
            </div>

            <Card className="space-y-3 p-4">
                <Titulo t="Distribuição por categoria" s="Cobertura = valor em estoque ÷ consumo mensal a custo · Giro anual = consumo mensal × 12 ÷ valor em estoque" />
                <Tabela head={["Categoria", "Produtos", "Unidades", "Valor a custo", "% valor", "Potencial venda", "Sem giro no período", "Cobertura", "Giro anual"]} alinhar={["l", "r", "r", "r", "r", "r", "r", "r", "r"]}>
                    {cats.map(([k, o]) => (
                        <tr key={k}>
                            <td className={tdL}>{k}</td>
                            <td className={tdR}>{o.np}</td>
                            <td className={tdR}>{nf(o.un)}</td>
                            <td className={tdR}>{brl(o.v)}</td>
                            <td className={tdR}>{nf((o.v / (tot.valor || 1)) * 100, 1)}%</td>
                            <td className={tdR}>{brl(o.vv)}</td>
                            <td className={tdR}>{o.parado ? brl(o.parado) : "—"}</td>
                            <td className={tdR}>{o.cm ? `${nf(o.v / o.cm, 1)} meses` : "—"}</td>
                            <td className={tdR}>{o.cm && o.v ? `${nf((o.cm * 12) / o.v, 1)}×` : "—"}</td>
                        </tr>
                    ))}
                    <tr className="bg-[#F6F8FB] dark:bg-[#1C2334] font-bold">
                        <td className={tdL}>Total</td>
                        <td className={tdR}>{tot.nProd}</td>
                        <td className={tdR}>{nf(tot.un)}</td>
                        <td className={tdR}>{brl(tot.valor)}</td>
                        <td className={tdR}>100%</td>
                        <td className={tdR}>{brl(tot.venda)}</td>
                        <td className={tdR}>{brl(tot.valorParado)}</td>
                        <td className={tdR}>{tot.consMes ? `${nf(tot.valor / tot.consMes, 1)} meses` : "—"}</td>
                        <td className={tdR}>{tot.consMes && tot.valor ? `${nf((tot.consMes * 12) / tot.valor, 1)}×` : "—"}</td>
                    </tr>
                </Tabela>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <BlocoABC titulo="Curva ABC pelo valor em estoque" sub="Itens A: contagem mensal" items={calc.map((r) => ({ nome: r.nome, v: Math.max(0, r.valor) }))} />
                <BlocoABC titulo="Curva ABC pelo valor consumido" sub="Itens A: negociar preço e não deixar faltar" items={calc.map((r) => ({ nome: r.nome, v: r.qP * r.custo }))} />
            </div>

            <Card className="space-y-3 p-4">
                <Titulo t="Entradas × saídas por mês" s="Unidades · mostra se o estoque está crescendo ou sendo consumido" />
                <VBars
                    labels={periodo.meses.map(monthLabel)}
                    series={[
                        { nome: "Entradas", cor: "bg-[#A9BED6] dark:bg-[#A9BED6]/60", vals: periodo.meses.map((k) => entMes.get(k) || 0) },
                        { nome: "Saídas", cor: "bg-[#3D6A99]", vals: periodo.meses.map((k) => saiMes.get(k) || 0) },
                    ]}
                    fmt={(v) => nf(v)}
                />
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="space-y-3 p-4">
                    <Titulo t="Sem saída no período" s={`${parados.length} produtos · ${kbrl(tot.valorParado)} parados`} />
                    <Tabela head={["Produto", "Un", "Valor"]} alinhar={["l", "r", "r"]}>
                        {parados.length ? (
                            parados.slice(0, 10).map((r: ProdCalc) => (
                                <tr key={r.id}>
                                    <td className={tdL}>
                                        {r.nome}
                                        <div className="text-xs text-[#7A8396] dark:text-[#8893AA]">{r.cat}</div>
                                    </td>
                                    <td className={tdR}>{nf(r.saldo)}</td>
                                    <td className={tdR}>{brl(r.valor)}</td>
                                </tr>
                            ))
                        ) : (
                            <Vazio cols={3} />
                        )}
                    </Tabela>
                </Card>
                <Card className="space-y-3 p-4">
                    <Titulo t="Estoque acima de 180 dias de consumo" s="Evitar novas compras desses itens" />
                    <Tabela head={["Produto", "Saldo", "Cobertura", "Valor"]} alinhar={["l", "r", "r", "r"]}>
                        {excesso.length ? (
                            excesso.slice(0, 10).map((r) => (
                                <tr key={r.id}>
                                    <td className={tdL}>
                                        {r.nome}
                                        <div className="text-xs text-[#7A8396] dark:text-[#8893AA]">{r.cat}</div>
                                    </td>
                                    <td className={tdR}>{nf(r.saldo)}</td>
                                    <td className={tdR}>{nf(cobDias(r))} d</td>
                                    <td className={tdR}>{brl(r.valor)}</td>
                                </tr>
                            ))
                        ) : (
                            <Vazio cols={4} />
                        )}
                    </Tabela>
                </Card>
            </div>

            <Card className="space-y-3 p-4">
                <Titulo t="Abaixo do mínimo cadastrado" s="Depósitos com saldo, mas abaixo do mínimo definido no cadastro" />
                <Tabela head={["Produto", "Categoria", "Saldo total", "Mínimo (depósitos com saldo)", "Consumo/mês", "Cobertura"]} alinhar={["l", "l", "r", "r", "r", "r"]}>
                    {abaixo.length ? (
                        abaixo.map((r) => (
                            <tr key={r.id}>
                                <td className={tdL}>{r.nome}</td>
                                <td className={`${tdL} text-[#7A8396] dark:text-[#8893AA]`}>{r.cat}</td>
                                <td className={tdR}>{nf(r.saldo)}</td>
                                <td className={tdR}>{nf(r.minimoComSaldo)}</td>
                                <td className={tdR}>{nf(r.pond, 1)}</td>
                                <td className={tdR}>{Number.isFinite(cobDias(r)) ? `${nf(cobDias(r))} d` : "sem consumo"}</td>
                            </tr>
                        ))
                    ) : (
                        <Vazio cols={6} />
                    )}
                </Tabela>
            </Card>
        </div>
    );
}

/* =====================================================================
   ABA: CONSUMO E TENDÊNCIAS
   ===================================================================== */
function AbaConsumo({
    calc,
    comConsumo,
    saidasMes,
    meses,
    atendMes,
    consumos,
    periodo,
    depId,
}: {
    calc: ProdCalc[];
    comConsumo: (r: ProdCalc) => boolean;
    saidasMes: { vals: number[]; proj: (number | null)[] };
    meses: string[];
    atendMes: Map<string, Set<string>>;
    consumos: Consumo[];
    periodo: { a: number; b: number; dias: number; recDias: number };
    depId: number;
}) {
    const [modo, setModo] = useState<"UN" | "AT">("UN");
    const [prazo, setPrazo] = useState(90);
    const [base, setBase] = useState<"MAIOR" | "POND" | "PER" | "REC">("MAIOR");
    const [zerados, setZerados] = useState(true);
    const [busca, setBusca] = useState("");

    const ids = new Set(calc.map((r) => r.id));
    const unAtend = meses.map((k) => {
        let q = 0;
        consumos.forEach((c) => {
            if (c.atend && ids.has(c.pid) && monthKey(c.t) === k && c.t >= periodo.a && c.t <= periodo.b && (!depId || c.dep === depId)) q += c.q;
        });
        const n = atendMes.get(k)?.size || 0;
        return n ? q / n : 0;
    });

    const rows = calc.filter((r) => r.qP > 0 || r.mR > 0).sort((a, b) => b.mP - a.mP);
    const somaP = rows.reduce((s, r) => s + r.mP, 0);
    const somaR = rows.reduce((s, r) => s + r.mR, 0);
    const somaPrev = rows.reduce((s, r) => s + (Number.isFinite(r.mPrev) ? r.mPrev : 0), 0);
    const sobe = rows.filter((r) => r.pond >= 1 && r.tr > 0.15).sort((a, b) => b.tr - a.tr).slice(0, 4);
    const cai = rows.filter((r) => r.pond >= 1 && r.tr < -0.15).sort((a, b) => a.tr - b.tr).slice(0, 4);

    const mensal = (r: ProdCalc) => (base === "MAIOR" ? Math.max(r.mP, r.mR) : base === "POND" ? r.pond : base === "PER" ? r.mP : r.mR);
    const dur = (m: number, s: number) => (m > 0 ? Math.max(0, s) / (m / 30) : Infinity);
    const acaba = calc
        .filter((r) => comConsumo(r) && (zerados || r.saldo > 0))
        .map((r) => ({ r, d: dur(mensal(r), r.saldo), dP: dur(r.mP, r.saldo), dR: dur(r.mR, r.saldo) }))
        .filter((x) => x.d <= prazo)
        .sort((a, b) => a.d - b.d);
    const faixas = [
        { l: "Já zerados", f: (d: number) => d === 0, tom: "critico" as const, lim: 0 },
        { l: "Até 30 dias", f: (d: number) => d > 0 && d <= 30, tom: "critico" as const, lim: 30 },
        { l: "31 a 60 dias", f: (d: number) => d > 30 && d <= 60, tom: "atencao" as const, lim: 60 },
        { l: "61 a 90 dias", f: (d: number) => d > 60 && d <= 90, tom: undefined, lim: 90 },
        { l: "91 a 180 dias", f: (d: number) => d > 90 && d <= 180, tom: undefined, lim: 180 },
    ].filter((f) => f.lim <= prazo && (f.lim > 0 || zerados));

    const q = busca.trim().toLocaleLowerCase("pt-BR");
    const lista = q ? rows.filter((r) => r.nome.toLocaleLowerCase("pt-BR").includes(q)) : rows;
    const fmtD = (v: number) => (Number.isFinite(v) ? `${nf(v)} d` : "—");

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <Titulo t="Saídas por mês" s={modo === "AT" ? "Unidades enviadas a atendimentos ÷ atendimentos do mês" : "Unidades · tracejado = projeção do mês incompleto"} />
                        <Seg value={modo} onChange={(v) => setModo(v as "UN" | "AT")} options={[{ v: "UN", l: "Unidades" }, { v: "AT", l: "Por atendimento" }]} />
                    </div>
                    {modo === "UN" ? (
                        <VBars labels={meses.map(monthLabel)} series={[{ nome: "Saídas", cor: "bg-[#3D6A99]", vals: saidasMes.vals }]} projecao={saidasMes.proj} fmt={(v) => nf(v)} />
                    ) : (
                        <VBars labels={meses.map(monthLabel)} series={[{ nome: "Por atendimento", cor: "bg-[#3D6A99]", vals: unAtend }]} fmt={(v) => nf(v, 1)} />
                    )}
                </Card>
                <Card className="space-y-3 p-4">
                    <Titulo t="Leitura rápida" s={`Média do período × últimos ${periodo.recDias} dias`} />
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-[#F6F8FB] dark:bg-[#1C2334] p-3">
                            <div className="text-[10px] font-bold uppercase text-[#7A8396] dark:text-[#8893AA]">Média do período</div>
                            <div className="text-xl font-black tabular-nums">{nf(somaP)}</div>
                            <div className="text-xs text-[#7A8396] dark:text-[#8893AA]">un/mês</div>
                        </div>
                        <div className="rounded-xl bg-[#F6F8FB] dark:bg-[#1C2334] p-3">
                            <div className="text-[10px] font-bold uppercase text-[#7A8396] dark:text-[#8893AA]">Recentes</div>
                            <div className="text-xl font-black tabular-nums">{nf(somaR)}</div>
                            <div className="text-xs text-[#7A8396] dark:text-[#8893AA]">un/mês</div>
                        </div>
                        <div className="rounded-xl bg-[#F6F8FB] dark:bg-[#1C2334] p-3">
                            <div className="text-[10px] font-bold uppercase text-[#7A8396] dark:text-[#8893AA]">Tendência</div>
                            <div className="text-xl font-black tabular-nums">{somaPrev ? `${somaR >= somaPrev ? "+" : ""}${nf(((somaR - somaPrev) / somaPrev) * 100)}%` : "—"}</div>
                            <div className="text-xs text-[#7A8396] dark:text-[#8893AA]">vs janela anterior</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {[
                            { t: "Subindo", l: sobe },
                            { t: "Caindo", l: cai },
                        ].map((g) => (
                            <div key={g.t}>
                                <div className="mb-1 text-xs font-bold text-[#5B6478] dark:text-[#AEB9CF]">{g.t}</div>
                                {g.l.length ? (
                                    g.l.map((r) => (
                                        <div key={r.id} className="flex justify-between gap-2 text-xs">
                                            <span className="truncate">{r.nome}</span>
                                            <Tendencia t={r.tr} base={r.pond} />
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-[#7A8396] dark:text-[#8893AA]">Nenhum item relevante</p>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <Card className="space-y-3 p-4">
                <Titulo t="Quando o estoque acaba" s="Saldo atual ÷ consumo diário, a partir de hoje" />
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <div className="mb-1 text-[10px] font-bold uppercase text-[#7A8396] dark:text-[#8893AA]">Acaba em até</div>
                        <Seg value={prazo} onChange={(v) => setPrazo(Number(v))} options={[{ v: 30, l: "1 mês" }, { v: 60, l: "2 meses" }, { v: 90, l: "3 meses" }, { v: 180, l: "6 meses" }]} />
                    </div>
                    <div>
                        <div className="mb-1 text-[10px] font-bold uppercase text-[#7A8396] dark:text-[#8893AA]">Consumo usado</div>
                        <Seg value={base} onChange={(v) => setBase(v as "MAIOR" | "POND" | "PER" | "REC")} options={[{ v: "MAIOR", l: "O maior dos dois" }, { v: "POND", l: "Ponderado" }, { v: "PER", l: "Média do período" }, { v: "REC", l: "Recente" }]} />
                    </div>
                    <div>
                        <div className="mb-1 text-[10px] font-bold uppercase text-[#7A8396] dark:text-[#8893AA]">Incluir</div>
                        <Seg value={zerados ? 1 : 0} onChange={(v) => setZerados(Number(v) === 1)} options={[{ v: 1, l: "Com zerados" }, { v: 0, l: "Só com saldo" }]} />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {faixas.map((f) => {
                        const n = acaba.filter((x) => f.f(x.d)).length;
                        const cor = n && f.tom === "critico" ? "border-l-[#B42318] dark:border-l-[#FF9C92]" : n && f.tom === "atencao" ? "border-l-[#F2CB3F]" : "border-l-[#E3E8F0] dark:border-l-white/12";
                        return (
                            <div key={f.l} className={`rounded-xl border border-[#E3E8F0] dark:border-white/12 border-l-4 ${cor} bg-[#FFFFFF] dark:bg-[#232B3F] p-3`}>
                                <div className="text-[10px] font-bold uppercase text-[#7A8396] dark:text-[#8893AA]">{f.l}</div>
                                <div className="text-xl font-black tabular-nums">{n}</div>
                            </div>
                        );
                    })}
                </div>
                <Tabela head={["Produto", "Saldo", "Média período", "Média recente", "Tendência", "Dura (período)", "Dura (recente)", "Previsão", "Acaba em"]} alinhar={["l", "r", "r", "r", "l", "r", "r", "r", "l"]}>
                    {acaba.length ? (
                        acaba.map(({ r, d, dP, dR }) => (
                            <tr key={r.id}>
                                <td className={tdL}>
                                    {r.nome}
                                    <div className="text-xs text-[#7A8396] dark:text-[#8893AA]">{r.cat}</div>
                                </td>
                                <td className={tdR}>{nf(r.saldo)}</td>
                                <td className={tdR}>{nf(r.mP, 1)}</td>
                                <td className={tdR}>{nf(r.mR, 1)}</td>
                                <td className={tdL}>
                                    <Tendencia t={r.tr} base={r.pond} />
                                </td>
                                <td className={tdR}>{fmtD(dP)}</td>
                                <td className={tdR}>{fmtD(dR)}</td>
                                <td className={`${tdR} font-bold`}>{fmtD(d)}</td>
                                <td className={tdL}>
                                    {d === 0 ? (
                                        <Pill tom="critico">Zerado</Pill>
                                    ) : (
                                        <Pill tom={d <= 30 ? "critico" : d <= 60 ? "atencao" : "info"}>{fmtShort(Date.now() + d * DAY)}</Pill>
                                    )}
                                </td>
                            </tr>
                        ))
                    ) : (
                        <Vazio cols={9} txt="Nenhum produto acaba nesse prazo com os filtros atuais." />
                    )}
                </Tabela>
                <p className="text-xs text-[#7A8396] dark:text-[#8893AA]">Entram produtos que saem ao menos 1 vez por mês. Itens de baixo giro (urnas de mostruário, tamanhos específicos) não têm previsão confiável por média.</p>
            </Card>

            <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <Titulo t="Produtos" s={`${rows.length} produtos com saída · ordenados pela média do período`} />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto" className={`${CAMPO} sm:w-64`} />
                </div>
                <Tabela head={["Produto", "Evolução", "Média período", "Média recente", "Tendência", "Regularidade", "Saldo"]} alinhar={["l", "l", "r", "r", "l", "l", "r"]}>
                    {lista.length ? (
                        lista.slice(0, 80).map((r) => (
                            <tr key={r.id}>
                                <td className={tdL}>
                                    {r.nome}
                                    <div className="text-xs text-[#7A8396] dark:text-[#8893AA]">{r.cat}</div>
                                </td>
                                <td className={tdL}>
                                    <Spark vals={r.mensal} />
                                </td>
                                <td className={tdR}>{nf(r.mP, 1)}</td>
                                <td className={tdR}>{nf(r.mR, 1)}</td>
                                <td className={tdL}>
                                    <Tendencia t={r.tr} base={r.pond} />
                                </td>
                                <td className={tdL}>
                                    <Regularidade cv={r.cv} base={r.mP} />
                                </td>
                                <td className={tdR}>{nf(r.saldo)}</td>
                            </tr>
                        ))
                    ) : (
                        <Vazio cols={7} />
                    )}
                </Tabela>
                {lista.length > 80 ? <p className="text-xs text-[#7A8396] dark:text-[#8893AA]">Mostrando 80 de {lista.length}. Use a busca ou os filtros para ver os demais.</p> : null}
            </Card>
        </div>
    );
}

/* =====================================================================
   ABA: PLANEJAR COMPRAS
   ===================================================================== */
function AbaCompras({ calc }: { calc: ProdCalc[] }) {
    const [dias, setDias] = useState(60);
    const [base, setBase] = useState<"POND" | "REC" | "PER">("POND");
    const [z, setZ] = useState(1.04);
    const [desmarcados, setDesmarcados] = useState<Set<number>>(new Set());
    const [msg, setMsg] = useState("");

    const diario = (r: ProdCalc) => (base === "REC" ? r.mR : base === "PER" ? r.mP : r.pond) / 30;
    const base0 = calc.filter((r) => !/OUTRA EMPRESA/i.test(r.nome));
    const baixoGiro = base0.filter((r) => r.pond < 1 && r.saldo <= 0 && (r.qP > 0 || r.mR > 0));
    const lista = base0
        .filter((r) => r.pond >= 1)
        .map((r) => {
            const d = diario(r);
            if (d <= 0) return null;
            const qtd = Math.ceil(d * dias + z * r.sd * Math.sqrt(dias / 30) - Math.max(0, r.saldo));
            return qtd > 0 ? { r, d, cob: Math.max(0, r.saldo) / d, qtd } : null;
        })
        .filter(Boolean) as { r: ProdCalc; d: number; cob: number; qtd: number }[];
    lista.sort((a, b) => a.cob - b.cob);
    const grupos = new Map<string, typeof lista>();
    lista.forEach((x) => grupos.set(x.r.cat, [...(grupos.get(x.r.cat) || []), x]));
    const totG = (xs: typeof lista) => xs.reduce((s, x) => s + x.qtd * x.r.custo, 0);
    const ordem = [...grupos.entries()].sort((a, b) => totG(b[1]) - totG(a[1]));
    const sel = lista.filter((x) => !desmarcados.has(x.r.id));
    const total = totG(sel);

    function toggle(id: number) {
        setDesmarcados((prev) => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    }
    function textoLista() {
        const g = new Map<string, typeof sel>();
        sel.forEach((x) => g.set(x.r.cat, [...(g.get(x.r.cat) || []), x]));
        return (
            `Lista de compras · cobertura ${dias} dias · ${new Date().toLocaleDateString("pt-BR")}\n` +
            [...g.entries()].map(([c, xs]) => `\n${c.toUpperCase()}\n` + xs.map((x) => `- ${x.r.nome}: ${x.qtd} un${x.r.custo ? ` (≈ ${brl(x.qtd * x.r.custo)})` : ""}`).join("\n")).join("\n") +
            `\n\nTotal estimado: ${brl(total)}`
        );
    }
    async function copiar() {
        try {
            await navigator.clipboard.writeText(textoLista());
            setMsg("Lista copiada.");
        } catch {
            setMsg("Não foi possível copiar automaticamente. Use Baixar CSV.");
        }
        window.setTimeout(() => setMsg(""), 2500);
    }
    function baixarCsv() {
        const esc = (v: any) => {
            const s = String(v ?? "");
            return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const linhas = [
            ["Categoria", "Produto", "Saldo", "Consumo/mês", "Cobertura (dias)", "Comprar", "Custo unitário", "Total"].join(";"),
            ...sel.map((x) => [x.r.cat, x.r.nome, nf(x.r.saldo), nf(x.d * 30, 1), nf(x.cob), x.qtd, nf(x.r.custo, 2), nf(x.qtd * x.r.custo, 2)].map(esc).join(";")),
        ];
        const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `lista-compras-${isoDay(new Date())}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    return (
        <div className="space-y-4">
            <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <div className="mb-1 text-[10px] font-bold uppercase text-[#7A8396] dark:text-[#8893AA]">Comprar para cobrir</div>
                        <Seg value={dias} onChange={(v) => setDias(Number(v))} options={[30, 45, 60, 90, 120].map((v) => ({ v, l: `${v} dias` }))} />
                    </div>
                    <div>
                        <div className="mb-1 text-[10px] font-bold uppercase text-[#7A8396] dark:text-[#8893AA]">Base do consumo</div>
                        <Seg value={base} onChange={(v) => setBase(v as "POND" | "REC" | "PER")} options={[{ v: "POND", l: "Ponderada" }, { v: "REC", l: "Recente" }, { v: "PER", l: "Média do período" }]} />
                    </div>
                    <div>
                        <div className="mb-1 text-[10px] font-bold uppercase text-[#7A8396] dark:text-[#8893AA]">Margem de segurança</div>
                        <Seg value={z} onChange={(v) => setZ(Number(v))} options={[{ v: 0, l: "Nenhuma" }, { v: 1.04, l: "Moderada" }, { v: 1.65, l: "Alta" }]} />
                    </div>
                </div>
                <p className="text-xs text-[#7A8396] dark:text-[#8893AA]">
                    Sugestão = consumo diário × {dias} dias {z ? "+ margem de segurança " : ""}− saldo atual. Entram itens que saem ao menos 1 vez por mês; os de baixo giro ficam numa lista à parte.
                </p>
            </Card>

            {ordem.length ? (
                ordem.map(([cat, xs], gi) => {
                    const crit = xs.filter((x) => x.cob < 15).length;
                    return (
                        <details key={cat} open={gi < 3} className="overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F] shadow-sm">
                            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
                                <span className="text-sm font-bold text-[#313C55] dark:text-white">
                                    {cat} <span className="font-medium text-[#7A8396] dark:text-[#8893AA]">· {xs.length} {xs.length > 1 ? "itens" : "item"}</span>{" "}
                                    {crit ? <Pill tom="critico">{crit} crítico{crit > 1 ? "s" : ""}</Pill> : null}
                                </span>
                                <span className="text-sm font-semibold tabular-nums text-[#5B6478] dark:text-[#AEB9CF]">{brl(totG(xs))}</span>
                            </summary>
                            <div className="border-t border-[#E3E8F0] dark:border-white/12">
                                <Tabela head={["", "Produto", "Saldo", "Consumo/mês", "Cobertura atual", "Tendência", "Comprar", "Custo un.", "Total"]} alinhar={["l", "l", "r", "r", "r", "l", "r", "r", "r"]}>
                                    {xs.map((x) => (
                                        <tr key={x.r.id} className={desmarcados.has(x.r.id) ? "opacity-50" : ""}>
                                            <td className={tdL}>
                                                <input type="checkbox" checked={!desmarcados.has(x.r.id)} onChange={() => toggle(x.r.id)} aria-label={`Incluir ${x.r.nome}`} className="h-5 w-5 accent-[#3D6A99]" />
                                            </td>
                                            <td className={tdL}>
                                                {x.r.nome}
                                                {x.r.cv > 0.75 ? <div className="mt-1"><Pill tom="atencao">Consumo irregular: confirme antes de comprar</Pill></div> : null}
                                            </td>
                                            <td className={tdR}>{nf(x.r.saldo)}</td>
                                            <td className={tdR}>{nf(x.d * 30, 1)}</td>
                                            <td className={tdR}>
                                                <Pill tom={x.cob < 15 ? "critico" : x.cob < 30 ? "atencao" : "ok"}>{nf(x.cob)} d</Pill>
                                            </td>
                                            <td className={tdL}>
                                                <Tendencia t={x.r.tr} base={x.r.pond} />
                                            </td>
                                            <td className={`${tdR} font-bold`}>{x.qtd}</td>
                                            <td className={tdR}>{x.r.custo ? brl(x.r.custo) : <span className="text-xs text-[#7A8396] dark:text-[#8893AA]">sem custo</span>}</td>
                                            <td className={tdR}>{x.r.custo ? brl(x.qtd * x.r.custo) : "—"}</td>
                                        </tr>
                                    ))}
                                </Tabela>
                            </div>
                        </details>
                    );
                })
            ) : (
                <Card className="p-4 text-sm text-[#5B6478] dark:text-[#AEB9CF]">Nenhum item precisa de reposição com esses parâmetros e filtros.</Card>
            )}

            {baixoGiro.length ? (
                <details className="overflow-hidden rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F] shadow-sm">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-[#313C55] dark:text-white">
                        <span>
                            Baixo giro, saldo zerado <span className="font-medium text-[#7A8396] dark:text-[#8893AA]">· {baixoGiro.length} itens · decidir caso a caso</span>
                        </span>
                        <span className="text-xs font-medium text-[#7A8396] dark:text-[#8893AA]">sem sugestão automática</span>
                    </summary>
                    <div className="border-t border-[#E3E8F0] dark:border-white/12">
                        <Tabela head={["Produto", "Categoria", "Saídas no período", "Última saída"]} alinhar={["l", "l", "r", "r"]}>
                            {baixoGiro.map((r) => (
                                <tr key={r.id}>
                                    <td className={tdL}>{r.nome}</td>
                                    <td className={`${tdL} text-[#7A8396] dark:text-[#8893AA]`}>{r.cat}</td>
                                    <td className={tdR}>{nf(r.qP)}</td>
                                    <td className={tdR}>{fmtDay(r.ultimaSaida)}</td>
                                </tr>
                            ))}
                        </Tabela>
                    </div>
                </details>
            ) : null}

            <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E3E8F0] dark:border-white/12 bg-[#FFFFFF] dark:bg-[#232B3F] p-3 shadow-lg">
                <div>
                    <div className="text-xs text-[#7A8396] dark:text-[#8893AA]">Selecionado para compra</div>
                    <div className="text-lg font-black tabular-nums text-[#313C55] dark:text-white">
                        {sel.length} itens · {brl(total)}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {msg ? <span className="text-xs font-semibold text-[#5C7A12] dark:text-[#B3CE52]">{msg}</span> : null}
                    <button type="button" onClick={() => setDesmarcados(new Set(lista.map((x) => x.r.id)))} className={BTN_SEC}>
                        Desmarcar tudo
                    </button>
                    <button type="button" onClick={() => setDesmarcados(new Set())} className={BTN_SEC}>
                        Marcar tudo
                    </button>
                    <button type="button" onClick={baixarCsv} className={BTN_SEC}>
                        Baixar CSV
                    </button>
                    <button type="button" onClick={copiar} className={BTN_PRI}>
                        Copiar lista de compras
                    </button>
                </div>
            </div>
        </div>
    );
}

/* =====================================================================
   ABA: CUSTOS
   ===================================================================== */
function AbaCustos({
    calc,
    consumos,
    hist,
    periodo,
    atendMes,
    depId,
}: {
    calc: ProdCalc[];
    consumos: Consumo[];
    hist: Record<HistTipo, HistRow[]>;
    periodo: { a: number; b: number; meses: string[] };
    atendMes: Map<string, Set<string>>;
    depId: number;
}) {
    const byId = new Map(calc.map((r) => [r.id, r]));
    const meses = periodo.meses;
    const cons = new Map<string, number>(),
        consAt = new Map<string, number>(),
        comp = new Map<string, number>();
    const porCat = new Map<string, { c: number; a: number; p: number }>();
    consumos.forEach((c) => {
        const r = byId.get(c.pid);
        if (!r || c.t < periodo.a || c.t > periodo.b || (depId && c.dep !== depId)) return;
        const v = c.q * (c.custoUnit || r.custo);
        const k = monthKey(c.t);
        cons.set(k, (cons.get(k) || 0) + v);
        const o = porCat.get(r.cat) || { c: 0, a: 0, p: 0 };
        o.c += v;
        if (c.atend) {
            consAt.set(k, (consAt.get(k) || 0) + v);
            o.a += v;
        }
        porCat.set(r.cat, o);
    });
    hist.ENTRADA.forEach((e) => {
        const r = byId.get(Number(e.produto_id));
        const t = ts(e.criado_em);
        if (!r || t < periodo.a || t > periodo.b || (depId && Number(e.deposito_destino_id) !== depId)) return;
        const v = num(e.custo_total_snapshot) || Math.abs(num(e.quantidade)) * num(e.custo_unitario_snapshot);
        if (!v) return;
        const k = monthKey(t);
        comp.set(k, (comp.get(k) || 0) + v);
        const o = porCat.get(r.cat) || { c: 0, a: 0, p: 0 };
        o.p += v;
        porCat.set(r.cat, o);
    });
    const ct = meses.reduce((s, k) => s + (cons.get(k) || 0), 0);
    const pt = meses.reduce((s, k) => s + (comp.get(k) || 0), 0);
    const nAt = meses.reduce((s, k) => s + (atendMes.get(k)?.size || 0), 0);
    const at = meses.reduce((s, k) => s + (consAt.get(k) || 0), 0);
    const cats = [...porCat.entries()].filter((e) => e[1].c || e[1].p).sort((a, b) => b[1].c - a[1].c);

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-[#A9BED6] dark:border-[#3D6A99]/60 bg-[#E9EFF6] dark:bg-[#3D6A99]/20 p-3 text-xs leading-5 text-[#313C55] dark:text-white">
                O consumo usa o custo gravado na saída quando existe; senão, o custo cadastrado do produto. Compras usam o custo total lançado na
                entrada. Meses sem custo lançado aparecem zerados em compras.
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi l="Consumo a custo" v={kbrl(ct)} d="No período" />
                <Kpi l="Compras com custo" v={kbrl(pt)} d="Entradas no período" />
                <Kpi l="Materiais por atendimento" v={nAt ? brl(at / nAt) : "—"} d={`${nAt} atendimentos`} />
                <Kpi l="Compras ÷ consumo" v={ct ? `${nf((pt / ct) * 100)}%` : "—"} d={pt > ct * 1.1 ? "Comprando mais do que consome" : "Estoque sendo consumido"} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="space-y-3 p-4">
                    <Titulo t="Compras × consumo a custo" s="Por mês" />
                    <VBars
                        labels={meses.map(monthLabel)}
                        series={[
                            { nome: "Compras", cor: "bg-[#A9BED6] dark:bg-[#A9BED6]/60", vals: meses.map((k) => comp.get(k) || 0) },
                            { nome: "Consumo", cor: "bg-[#3D6A99]", vals: meses.map((k) => cons.get(k) || 0) },
                        ]}
                        fmt={kbrl}
                    />
                </Card>
                <Card className="space-y-3 p-4">
                    <Titulo t="Materiais por atendimento" s="Saídas com destino a atendimento ÷ atendimentos do mês" />
                    <VBars labels={meses.map(monthLabel)} series={[{ nome: "Por atendimento", cor: "bg-[#3D6A99]", vals: meses.map((k) => ((atendMes.get(k)?.size || 0) ? (consAt.get(k) || 0) / (atendMes.get(k)?.size || 1) : 0)) }]} fmt={brl} />
                </Card>
            </div>
            <Card className="space-y-3 p-4">
                <Titulo t="Por categoria" />
                <Tabela head={["Categoria", "Consumo a custo", "% do total", "Por atendimento", "Compras no período"]} alinhar={["l", "r", "r", "r", "r"]}>
                    {cats.length ? (
                        cats.map(([k, o]) => (
                            <tr key={k}>
                                <td className={tdL}>{k}</td>
                                <td className={tdR}>{brl(o.c)}</td>
                                <td className={tdR}>{ct ? nf((o.c / ct) * 100, 1) : 0}%</td>
                                <td className={tdR}>{nAt ? brl(o.a / nAt) : "—"}</td>
                                <td className={tdR}>{o.p ? brl(o.p) : "—"}</td>
                            </tr>
                        ))
                    ) : (
                        <Vazio cols={5} />
                    )}
                    <tr className="bg-[#F6F8FB] dark:bg-[#1C2334] font-bold">
                        <td className={tdL}>Total</td>
                        <td className={tdR}>{brl(ct)}</td>
                        <td className={tdR}>100%</td>
                        <td className={tdR}>{nAt ? brl(at / nAt) : "—"}</td>
                        <td className={tdR}>{brl(pt)}</td>
                    </tr>
                </Tabela>
            </Card>
        </div>
    );
}

/* =====================================================================
   ABA: CONTROLE
   ===================================================================== */
function AbaControle({
    confs,
    hist,
    cobertura,
    truncado,
}: {
    confs: (ConfReg & { sistema?: number; absDif?: number })[];
    hist: Record<HistTipo, HistRow[]>;
    cobertura: { ajustesDesde: number };
    truncado: Record<HistTipo, boolean>;
}) {
    const ajustes = hist.AJUSTE.filter((r) => !isTeste(r.observacao));
    const liquido = ajustes.reduce((s, r) => s + num(r.quantidade), 0);
    const rotulo: Record<HistTipo, string> = { SAIDA: "Saídas", ENTRADA: "Entradas", AJUSTE: "Ajustes", CONFECCAO: "Confecções", TRANSFERENCIA: "Transferências" };
    const mix = HIST_TIPOS.map((t) => ({ k: rotulo[t], v: hist[t].length, tom: t === "AJUSTE" ? ("critico" as const) : undefined }));
    const semCusto = hist.SAIDA.filter((r) => r.custo_unitario_snapshot == null || num(r.custo_unitario_snapshot) === 0).length;
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="space-y-3 p-4">
                    <Titulo t="Divergência nas conferências" s="|físico − sistema| ÷ sistema · últimas 10 conferências" />
                    <HBars
                        rows={confs
                            .filter((c) => (c.sistema || 0) > 0)
                            .map((c) => {
                                const p = ((c.absDif || 0) / (c.sistema || 1)) * 100;
                                return {
                                    k: `${c.deposito_nome || `Depósito ${c.deposito_id}`} · ${fmtDay(ts(c.criado_em))}`,
                                    v: p,
                                    sub: `Sistema ${nf(c.sistema || 0)} · diferença ${nf(c.total_dif)}`,
                                    tom: p > 15 ? ("critico" as const) : p > 5 ? ("atencao" as const) : ("ok" as const),
                                };
                            })}
                        fmt={(v) => `${nf(v, 1)}%`}
                    />
                </Card>
                <Card className="space-y-3 p-4">
                    <Titulo t="Movimentações carregadas por tipo" s="Registros devolvidos pelo histórico" />
                    <HBars rows={mix} fmt={(v) => `${nf(v)} mov.`} />
                    <div className="rounded-xl border border-[#B42318]/40 dark:border-[#FF9C92]/40 bg-[#FDECEA] dark:bg-[#FF9C92]/15 p-3 text-xs leading-5 text-[#B42318] dark:text-[#FF9C92]">
                        Ajustes somam <b>{nf(liquido)}</b> unidades desde {fmtDay(cobertura.ajustesDesde)}
                        {truncado.AJUSTE ? " (histórico limitado)" : ""}. Ajuste negativo é consumo não lançado ou perda: vale exigir motivo em cada ajuste.
                    </div>
                </Card>
            </div>
            <Card className="space-y-3 p-4">
                <Titulo t="Qualidade dos dados" s="Pontos que afetam a precisão do painel" />
                <Tabela head={["Ponto", "Situação", "Impacto"]} alinhar={["l", "r", "l"]}>
                    <tr>
                        <td className={tdL}>Saídas sem custo gravado</td>
                        <td className={tdR}>
                            {nf(semCusto)} de {nf(hist.SAIDA.length)}
                        </td>
                        <td className={`${tdL} text-[#5B6478] dark:text-[#AEB9CF]`}>Custo por atendimento usa o custo cadastrado como aproximação</td>
                    </tr>
                    <tr>
                        <td className={tdL}>Ajustes manuais</td>
                        <td className={tdR}>{nf(ajustes.length)}</td>
                        <td className={`${tdL} text-[#5B6478] dark:text-[#AEB9CF]`}>Consumo real pode ser maior que o registrado</td>
                    </tr>
                    <tr>
                        <td className={tdL}>Histórico limitado pela API</td>
                        <td className={tdR}>{Object.values(truncado).some(Boolean) ? "Sim" : "Não"}</td>
                        <td className={`${tdL} text-[#5B6478] dark:text-[#AEB9CF]`}>Médias longas ficam restritas ao trecho devolvido</td>
                    </tr>
                </Tabela>
            </Card>
        </div>
    );
}

/* =====================================================================
   ABA: COMO CALCULA
   ===================================================================== */
function AbaGuia({ recDias }: { recDias: number }) {
    const itens = [
        ["Média do período", "Saídas no período ÷ dias do período × 30. Muda com o filtro De/Até."],
        ["Média recente", `Últimos ${recDias} dias (até 90), sempre contados a partir de hoje.`],
        ["Ponderada", "60% da média recente + 40% da média do período. Base de alertas e compras."],
        ["Tendência", "Janela recente contra a janela anterior de mesmo tamanho. Acima de +15% sobe; abaixo de −15% cai."],
        ["Regularidade", "Variação entre os meses do período (desvio ÷ média): estável até 35%, variável até 75%, irregular acima."],
        ["Sugestão de compra", "Consumo diário × dias de cobertura + margem − saldo. A margem usa a variação mensal: moderada ~85% dos meses, alta ~95%."],
        ["Cobertura e giro", "Cobertura = quanto o estoque dura no ritmo atual. Giro anual = consumo mensal a custo × 12 ÷ valor em estoque."],
        ["Curva ABC", "A = itens que somam 80% do valor; B = os 15% seguintes; C = os últimos 5%."],
        ["O que conta como consumo", "Saídas (exceto lançamentos de teste) e insumos usados em confecção. Transferências e ajustes não contam."],
    ];
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {itens.map(([t, d]) => (
                <Card key={t} className="p-4">
                    <h3 className="text-[15px] font-extrabold text-[#313C55] dark:text-white">{t}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#5B6478] dark:text-[#AEB9CF]">{d}</p>
                </Card>
            ))}
        </div>
    );
}

