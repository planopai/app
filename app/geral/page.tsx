"use client";

// v14: custo médio móvel padronizado na listagem de produtos + paginação 10/50/100/500/Tudo.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type ID = number;

type Usuario = { id: ID; nome: string; usuario: string };
type Deposito = { id: ID; nome: string };

type Categoria = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };
type Fabricante = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };
// ✅ NOVO
type Classificacao = { id: ID; nome: string; ativo: 0 | 1 | number; atualizado_em: string };

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
    preco_custo?: string | number | null;
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
    usuarios: Usuario[];
    depositos: Deposito[];
    categorias: Categoria[];
    fabricantes: Fabricante[];
    classificacoes: Classificacao[];
    produtos: Produto[];
    saldos: Saldo[];
    msg?: string;
    need_login?: 1;
};

type HistoricoRow = {
    id: number;
    tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "AJUSTE" | "CADASTRO_PRODUTO";
    produto_id: ID;
    codigo_barras_snapshot: string;
    lote_id?: ID | null;
    numero_lote_snapshot?: string | null;
    custo_base_unitario_snapshot?: string | number | null;
    frete_total_snapshot?: string | number | null;
    frete_unitario_snapshot?: string | number | null;
    custo_unitario_snapshot?: string | number | null;
    custo_total_snapshot?: string | number | null;
    registro_custo_tipo?: "ENTRADA" | "NOVO_PRECO" | string;
    ajuste_custo_id?: ID | null;
    custo_atual?: string | number | null;
    custo_base_atual?: string | number | null;
    frete_total_atual?: string | number | null;
    frete_unitario_atual?: string | number | null;
    quantidade: number | null;
    deposito_origem_id: ID | null;
    deposito_destino_id: ID | null;
    destino_texto: string | null;
    solicitante_usuario_id: ID | null;
    operador_usuario_id: ID;
    observacao: string | null;
    criado_em: string;

    produto_nome?: string;
    operador_nome?: string;
    solicitante_nome?: string | null;
    deposito_origem_nome?: string | null;
    deposito_destino_nome?: string | null;
};

type HistoricoResp = {
    ok: boolean;
    rows: HistoricoRow[];
    msg?: string;
    need_login?: 1;
};


type ProdutoEditTab = "DADOS" | "ESTOQUE" | "VALOR" | "CUSTO";


type CustoAjusteTipo = "NOVO_PRECO" | "LOTE";
type CustoAjusteHistoricoTipo = CustoAjusteTipo | "REFERENCIA" | "REAVALIACAO";

type CustoProdutoLote = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    deposito_nome?: string | null;
    numero_lote: string;
    quantidade_inicial: number;
    quantidade_atual: number;
    custo_base_unitario?: string | number | null;
    frete_total?: string | number | null;
    frete_unitario?: string | number | null;
    custo_unitario: string | number;
    custo_entrada_original?: string | number | null;
    usuario_nome?: string | null;
    criado_em: string;
    origem_movimento_id?: ID | null;
};

type CustoAjusteHistorico = {
    id: number;
    operacao_uuid: string;
    produto_id: ID;
    tipo: CustoAjusteHistoricoTipo;
    custo_referencia_anterior: string | number;
    custo_referencia_novo: string | number;
    novo_custo: string | number;
    custo_base_novo?: string | number | null;
    frete_total?: string | number | null;
    frete_unitario?: string | number | null;
    quantidade_rateio?: number | null;
    motivo?: string | null;
    observacao?: string | null;
    usuario_id: ID;
    usuario_nome?: string | null;
    criado_em: string;
    lotes_afetados: number;
    quantidade_afetada: number;
    valor_anterior: string | number;
    valor_novo: string | number;
    valor_diferenca: string | number;
};

type CustoProdutoDetalheResp = {
    ok: boolean;
    produto?: {
        id: ID;
        nome: string;
        codigo_barras: string;
        preco_custo: string | number;
    };
    resumo?: {
        quantidade_disponivel: number;
        lotes_disponiveis: number;
        valor_estoque: string | number;
        custo_medio: string | number;
        quantidade_saldo_total?: number;
    };
    lotes?: CustoProdutoLote[];
    entradas?: HistoricoRow[];
    ajustes?: CustoAjusteHistorico[];
    msg?: string;
    need_login?: 1;
};

type CustoMedioMovelProduto = {
    produto_id: ID;
    quantidade_atual: number;
    custo_medio: string | number;
    valor_estoque: string | number;
};

type CustosMediosMoveisResp = {
    ok: boolean;
    rows?: CustoMedioMovelProduto[];
    msg?: string;
    need_login?: 1;
};

type EstoquePageSize = 10 | 50 | 100 | 500 | "ALL";

type EstoqueColumnKey =
    | "produto"
    | "categoria"
    | "fabricante"
    | "classificacao"
    | "qtd"
    | "custo"
    | "total";

const ESTOQUE_COLUMN_ORDER: EstoqueColumnKey[] = [
    "produto",
    "categoria",
    "fabricante",
    "classificacao",
    "qtd",
    "custo",
    "total",
];

const ESTOQUE_DEFAULT_COLUMN_WIDTHS: Record<EstoqueColumnKey, number> = {
    produto: 270,
    categoria: 130,
    fabricante: 115,
    classificacao: 155,
    qtd: 65,
    custo: 115,
    total: 115,
};

const ESTOQUE_MIN_COLUMN_WIDTHS: Record<EstoqueColumnKey, number> = {
    produto: 190,
    categoria: 95,
    fabricante: 90,
    classificacao: 115,
    qtd: 58,
    custo: 95,
    total: 95,
};

const ESTOQUE_COLUMN_STORAGE_KEY = "estoque-produtos-column-widths-v1";



// ✅ CONFERÊNCIAS (REGISTROS SALVOS)
type ConferenciaRegistro = {
    id: number;
    deposito_id: ID;
    deposito_nome?: string;
    operador_usuario_id: ID;
    operador_nome?: string;
    total_itens: number;
    total_dif: number;
    criado_em: string;
};

type ConferenciasListResp = {
    ok: boolean;
    rows: ConferenciaRegistro[];
    msg?: string;
    need_login?: 1;
};

type ConferenciaItem = {
    id: number;
    conferencia_id: number;
    produto_id: ID | null;
    produto_nome_snapshot: string;
    codigo_barras_snapshot: string | null;
    qtd_sistema: number;
    qtd_fisica: number;
    dif: number;
};

type ConferenciaDetalheHead = {
    id: number;
    deposito_id: ID;
    deposito_nome?: string;
    operador_usuario_id: ID;
    operador_nome?: string;
    total_itens: number;
    total_dif: number;
    criado_em: string;
};

type ConferenciaDetalheResp = {
    ok: boolean;
    head: ConferenciaDetalheHead;
    items: ConferenciaItem[];
    msg?: string;
    need_login?: 1;
};





function QuickIcon({ children }: { children: React.ReactNode }) {
    return (
        <span
            className="grid h-11 w-11 place-items-center rounded-full
        bg-sky-100 text-sky-700
        transition-colors
        group-hover:bg-sky-600 group-hover:text-white
        dark:bg-sky-900/30 dark:text-sky-200
        dark:group-hover:bg-sky-600"
        >
            {children}
        </span>
    );
}

function AdvActionButton({
    label,
    icon,
    onClick,
    active = false,
}: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "group flex flex-col items-center justify-center",
                "gap-3 rounded-2xl border bg-white p-5",
                "shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md",
                active
                    ? "border-sky-300 ring-2 ring-sky-200"
                    : "border-slate-200 hover:border-slate-300",
            ].join(" ")}
        >
            {/* CÍRCULO AZUL (igual ao menu) */}
            <div
                className={[
                    "flex h-14 w-14 items-center justify-center rounded-full",
                    "bg-sky-100 text-sky-700",
                    "transition-transform group-hover:scale-[1.03]",
                ].join(" ")}
            >
                {icon}
            </div>

            {/* TÍTULO */}
            <div className="text-center">
                <span className="block text-[13px] font-extrabold tracking-tight text-slate-900 leading-tight">
                    {label}
                </span>
            </div>
        </button>
    );
}

function HomeActionButton({
    label,
    icon,
    onClick,
    active = false,
}: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "group w-full flex flex-col items-center justify-center",
                "gap-3 rounded-2xl border bg-white p-5",
                "shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md",
                active
                    ? "border-sky-300 ring-2 ring-sky-200"
                    : "border-slate-200 hover:border-slate-300",
            ].join(" ")}
        >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-sky-700 transition-transform group-hover:scale-[1.03]">
                {icon}
            </div>

            <span className="text-center text-[13px] font-extrabold tracking-tight text-slate-900 leading-tight">
                {label}
            </span>
        </button>
    );
}


type TabAction = {
    key: UiTab;
    label: string;
    icon: React.ReactNode;
};

const tabActions: TabAction[] = [
    {
        key: "HOME",
        label: "Movimentação",
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M4 12l8-7 8 7v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9z" stroke="currentColor" strokeWidth="1.8" />
                <path d="M9 22v-7h6v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        key: "ENTRADA",
        label: "Entrada",
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 21h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        key: "ESTOQUE",
        label: "Produtos",
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M7 8l5-3 5 3v10l-5 3-5-3V8z" stroke="currentColor" strokeWidth="1.8" />
                <path d="M7 8l5 3 5-3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 11v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        key: "CONFERENCIA",
        label: "Conferência",
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 8h8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M9 16l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        key: "HISTORICO",
        label: "Histórico",
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 12a9 9 0 1 1-3-6.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        key: "AVANCADO",
        label: "Avançado",
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l2 4 4 .5-3 3 .7 4.5-3.7-2-3.7 2 .7-4.5-3-3L10 6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M6 22h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        ),
    },
];


type UiTab = "MENU" | "HOME" | "ENTRADA" | "ESTOQUE" | "CONFERENCIA" | "HISTORICO" | "AVANCADO";

type EntradaItem = {
    id: number;
    payload: any;
    resumo: string;
    nome: string;
    qtd: number;
    custoBaseUnitario: number;
    freteTotal: number;
    freteUnitario: number;
    custoUnitario: number;
    custoTotal: number;
};
type SaidaItem = { id: number; payload: any; resumo: string };
type TrfItem = { id: number; payload: any; resumo: string };

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/materiais_gerais.php`;

function clampInt(v: unknown) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

function fmtDateTime(iso: string) {
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
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

function maskBRLFromDigits(digitsOnly: string) {
    const digits = (digitsOnly || "").replace(/\D/g, "");
    const cents = digits ? Number(digits) : 0;
    const value = cents / 100;

    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    } catch {
        const v = Number.isFinite(value) ? value : 0;
        const fixed = v.toFixed(2);
        const [intPart, dec] = fixed.split(".");
        const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `R$ ${withDots},${dec}`;
    }
}

function parseBRLToNumber(brlText: string) {
    const digits = (brlText || "").replace(/\D/g, "");
    const cents = digits ? Number(digits) : 0;
    return cents / 100;
}

function roundCost(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(Math.max(0, value) * 10000) / 10000;
}

function ratearFreteEntrada(items: EntradaItem[], freteTotalInformado: number): EntradaItem[] {
    const totalQuantidade = items.reduce((total, item) => total + clampInt(item.qtd), 0);
    const freteTotal = roundCost(freteTotalInformado);

    if (!items.length || totalQuantidade <= 0) {
        return items.map((item) => ({
            ...item,
            freteTotal: 0,
            freteUnitario: 0,
            custoUnitario: roundCost(item.custoBaseUnitario),
            custoTotal: roundCost(item.custoBaseUnitario * item.qtd),
            payload: { ...item.payload, frete_total: 0 },
        }));
    }

    const fretePorUnidadeTeorico = freteTotal / totalQuantidade;
    let freteDistribuido = 0;

    return items.map((item, index) => {
        const quantidade = clampInt(item.qtd);
        const isLast = index === items.length - 1;
        const freteRestante = roundCost(Math.max(0, freteTotal - freteDistribuido));
        const freteCalculado = roundCost(fretePorUnidadeTeorico * quantidade);
        const freteDoItem = isLast
            ? freteRestante
            : Math.min(freteCalculado, freteRestante);

        freteDistribuido = roundCost(freteDistribuido + freteDoItem);

        const freteUnitario = quantidade > 0 ? roundCost(freteDoItem / quantidade) : 0;
        const custoUnitario = roundCost(item.custoBaseUnitario + freteUnitario);
        const custoTotal = roundCost(custoUnitario * quantidade);

        return {
            ...item,
            freteTotal: freteDoItem,
            freteUnitario,
            custoUnitario,
            custoTotal,
            payload: {
                ...item.payload,
                frete_total: freteDoItem,
            },
        };
    });
}

function maskBRLInput(raw: string) {
    const digits = (raw || "").replace(/\D/g, "");
    return maskBRLFromDigits(digits);
}


function createOperationUuid() {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
    } catch {
        // fallback abaixo
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const random = Math.floor(Math.random() * 16);
        const value = char === "x" ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}

function escapeCsvCell(v: any, sep = ";") {
    const s = String(v ?? "");
    const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(sep);
    const escaped = s.replace(/"/g, '""');
    return mustQuote ? `"${escaped}"` : escaped;
}

const IMG_BASE = ENDPOINT; // ✅

function normalizeImgUrl(u?: string | null) {
    const t = (u ?? "").toString().trim();
    if (!t || t === "null" || t === "undefined") return null;

    // ✅ base64
    if (/^data:image\//i.test(t)) return t;

    // ✅ blob preview (se algum dia usar)
    if (/^blob:/i.test(t)) return t;

    // ✅ url completa
    if (/^https?:\/\//i.test(t)) return t;

    // ✅ caminhos já em uploads
    const clean = t.startsWith("/") ? t : `/${t}`;
    if (clean.startsWith("/uploads/")) return `${IMG_BASE}${clean}`;

    // ✅ só nome do arquivo
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
            `Resposta inesperada (${ct || "sem content-type"}). ${txt ? `Conteúdo: ${txt.slice(0, 160)}...` : ""
                }`.trim()
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

async function apiPost<T>(body: any) {
    const r = await fetch(API_BASE, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    return await safeJson<T & { ok?: boolean; msg?: string; need_login?: 1 }>(r);
}

/* =========================
   UI KIT
========================= */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <section className={["rounded-2xl border border-slate-200 bg-white shadow-sm", className].join(" ")}>
            {children}
        </section>
    );
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

const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(
    props,
    ref
) {
    return (
        <input
            ref={ref}
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                "flex items-center justify-between gap-2",
            ].join(" ")}
        />
    );
});

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                "flex items-center justify-between gap-2",
            ].join(" ")}
        />
    );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                "flex items-center justify-between gap-2",
            ].join(" ")}
        />
    );
}

type Opt = { id: ID; nome: string };

function uniqOptions(items: Array<Opt | null | undefined>) {
    const map = new Map<ID, Opt>();

    for (const item of items) {
        if (!item?.id) continue;
        if (!map.has(item.id)) map.set(item.id, item);
    }

    return Array.from(map.values()).sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR")
    );
}

function produtoCategoriaOption(p: Produto, catById: Map<ID, Categoria>): Opt | null {
    const id = Number(p.categoria_id || 0);
    if (!id) return null;

    const nome = p.categoria_nome || catById.get(id)?.nome || "";
    if (!nome.trim()) return null;

    return { id, nome };
}

function produtoFabricanteOption(p: Produto, fabById: Map<ID, Fabricante>): Opt | null {
    const id = Number(p.fabricante_id || 0);
    if (!id) return null;

    const nome = p.fabricante_nome || fabById.get(id)?.nome || "";
    if (!nome.trim()) return null;

    return { id, nome };
}

function produtoClassificacaoOption(p: Produto, classById: Map<ID, Classificacao>): Opt | null {
    const id = Number(p.classificacao_id || 0);
    if (!id) return null;

    const nome = p.classificacao_nome || classById.get(id)?.nome || "";
    if (!nome.trim()) return null;

    return { id, nome };
}

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
        const next = has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
        onChangeIds(next);
    }

    return (
        <Field label={label}>
            <div ref={wrapRef} className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className={[
                        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[16px] sm:text-sm text-slate-900 shadow-sm outline-none",
                        "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
                        "flex items-center justify-between gap-2",
                    ].join(" ")}
                >
                    <span className={["truncate", !selectedIds.length ? "text-slate-600" : "text-slate-900"].join(" ")}>
                        {displayText || placeholder}
                    </span>
                    <span className="text-slate-500">▾</span>
                </button>

                {open ? (
                    <div
                        className={[
                            "absolute z-30 mt-2 left-0",
                            "w-full min-w-[340px] max-w-[calc(100vw-2rem)]",
                            "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg",
                        ].join(" ")}
                    >
                        <div className="p-2 border-b border-slate-100">
                            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." />
                            <div className="mt-2 flex gap-2">
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => {
                                        onChangeIds([]);
                                        setQ("");
                                    }}
                                >
                                    Limpar
                                </Button>

                            </div>
                        </div>

                        <div className="max-h-64 overflow-auto p-2">
                            <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
                                <input
                                    type="checkbox"
                                    checked={!selectedIds.length}
                                    onChange={() => onChangeIds([])}
                                    className="h-4 w-4"
                                />
                                <span className="text-sm text-slate-700">{allLabel}</span>
                            </label>

                            <div className="my-2 border-t border-slate-100" />

                            {filtered.length === 0 ? (
                                <div className="p-2 text-sm text-slate-600">Nenhum encontrado.</div>
                            ) : (
                                filtered.map((o) => (
                                    <label
                                        key={o.id}
                                        className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(o.id)}
                                            onChange={() => toggle(o.id)}
                                            className="h-4 w-4"
                                        />
                                        <span className="text-sm text-slate-900 whitespace-nowrap">{o.nome}</span>
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


function FilterOptionPanel({
    title,
    options,
    selectedIds,
    onChangeIds,
    allLabel = "Todos",
    open,
    onToggle,
}: {
    title: string;
    options: Opt[];
    selectedIds: ID[];
    onChangeIds: (ids: ID[]) => void;
    allLabel?: string;
    open: boolean;
    onToggle: () => void;
}) {
    const [query, setQuery] = useState("");

    const selectedSet = useMemo(
        () => new Set(selectedIds.map(Number)),
        [selectedIds]
    );

    const filteredOptions = useMemo(() => {
        const q = query.trim().toLocaleLowerCase("pt-BR");
        if (!q) return options;
        return options.filter((option) =>
            option.nome.toLocaleLowerCase("pt-BR").includes(q)
        );
    }, [options, query]);

    function toggle(id: ID) {
        const numericId = Number(id);
        const next = selectedSet.has(numericId)
            ? selectedIds.filter((currentId) => Number(currentId) !== numericId)
            : [...selectedIds, numericId];
        onChangeIds(next);
    }

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className={[
                    "flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition sm:px-5",
                    open ? "bg-slate-50" : "bg-white hover:bg-slate-50",
                ].join(" ")}
            >
                <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900 sm:text-base">
                        {title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                        {selectedIds.length
                            ? `${selectedIds.length} selecionado(s)`
                            : allLabel}
                    </span>
                </span>

                <span className="flex shrink-0 items-center gap-3">
                    {selectedIds.length ? (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800">
                            {selectedIds.length}
                        </span>
                    ) : null}
                    <span
                        aria-hidden="true"
                        className={[
                            "grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition-transform",
                            open ? "rotate-180" : "rotate-0",
                        ].join(" ")}
                    >
                        ▾
                    </span>
                </span>
            </button>

            {open ? (
                <div className="border-t border-slate-100">
                    <div className="border-b border-slate-100 p-3 sm:p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="relative min-w-0 flex-1">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    ⌕
                                </span>
                                <TextInput
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={`Buscar em ${title.toLocaleLowerCase("pt-BR")}...`}
                                    className="pl-9"
                                />
                            </div>

                            {selectedIds.length ? (
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => onChangeIds([])}
                                    className="w-full whitespace-nowrap sm:w-auto"
                                >
                                    Mostrar todos
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    <div className="max-h-[42dvh] overflow-y-auto overscroll-contain p-2 sm:max-h-[330px] [scrollbar-gutter:stable]">
                        {filteredOptions.length === 0 ? (
                            <div className="p-5 text-center text-sm text-slate-500">
                                Nenhuma opção encontrada.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-1">
                                {filteredOptions.map((option) => {
                                    const checked = selectedSet.has(Number(option.id));
                                    return (
                                        <label
                                            key={option.id}
                                            className={[
                                                "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                                                checked
                                                    ? "border-sky-300 bg-sky-50 text-sky-950"
                                                    : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50",
                                            ].join(" ")}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggle(option.id)}
                                                className="h-5 w-5 shrink-0 accent-sky-600"
                                            />
                                            <span className="min-w-0 flex-1 break-words text-sm font-medium">
                                                {option.nome}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" }) {
    const base =
        "inline-flex items-center justify-center rounded-xl px-3 py-2 text-[16px] sm:text-sm font-medium shadow-sm outline-none " +
        "focus:ring-2 focus:ring-slate-200 disabled:opacity-50 disabled:cursor-not-allowed";

    const cls =
        variant === "solid"
            ? "bg-slate-900 text-white hover:bg-slate-800 border border-slate-900"
            : variant === "soft"
                ? "bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-200"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}


function Badge({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm">
            {children}
        </span>
    );
}

/* =========================
   MODAL (não fecha clicando fora; fecha pelo X/botões)
========================= */

function Modal({
    open,
    title,
    subtitle,
    onClose,
    children,
    closeOnBackdrop = false,
    closeOnEsc = false,
    panelClassName = "",
    bodyClassName = "",
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
    panelClassName?: string;
    bodyClassName?: string;
}) {
    useEffect(() => {
        if (!open) return;
        if (!closeOnEsc) return;

        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, closeOnEsc, onClose]);

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
        <div
            role="dialog"
            aria-modal="true"
            className={["fixed inset-0 z-50", "flex items-center justify-center", "bg-black/45", "min-h-[100dvh] p-4"].join(
                " "
            )}
            onMouseDown={(e) => {
                if (!closeOnBackdrop) return;
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={[
                    "flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[94dvh] sm:max-w-2xl",
                    panelClassName,
                ].join(" ")}
            >
                <div className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
                        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
                    </div>
                    <button
                        className="rounded-xl px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
                        onClick={onClose}
                        aria-label="Fechar"
                        type="button"
                        title="Fechar"
                    >
                        ✕
                    </button>
                </div>

                <div
                    className={[
                        "min-h-0 flex-1 overflow-y-auto overscroll-auto touch-pan-y p-4 [scrollbar-gutter:stable]",
                        bodyClassName,
                    ].join(" ")}
                    style={{ WebkitOverflowScrolling: "touch" }}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}

function FilterPanelModal({
    open,
    title,
    subtitle,
    onClose,
    children,
    footer,
    panelClassName = "",
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    panelClassName?: string;
}) {
    useEffect(() => {
        if (!open) return;

        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        window.addEventListener("keydown", onKey);

        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex min-h-[100dvh] items-start justify-center bg-slate-950/55 p-3 pt-6 sm:items-center sm:p-4"
        >
            <div className={["flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[94dvh] sm:max-w-5xl", panelClassName].join(" ")}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-slate-900">
                            {title}
                        </h2>

                        {subtitle ? (
                            <p className="mt-1 text-sm text-slate-600">
                                {subtitle}
                            </p>
                        ) : null}
                    </div>

                    <button
                        className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                        onClick={onClose}
                        type="button"
                        aria-label="Fechar filtros"
                    >
                        ✕
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-auto touch-pan-y p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5 [scrollbar-gutter:stable]" style={{ WebkitOverflowScrolling: "touch" }}>
                    {children}
                </div>

                {footer ? (
                    <div className="border-t border-slate-100 bg-slate-50 p-4 sm:p-5">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

/* =========================
   CONFIRM DIALOG
========================= */

function ConfirmDialog({
    open,
    title,
    message,
    confirmText = "Sim, confirmar",
    cancelText = "Cancelar",
    onConfirm,
    onCancel,
}: {
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Modal open={open} title={title} subtitle={message} onClose={onCancel}>
            <div className="mt-2 flex flex-col gap-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Atenção: após confirmar, a movimentação será registrada no sistema.
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                    <Button onClick={onConfirm} type="button">
                        {confirmText}
                    </Button>
                    <Button variant="ghost" onClick={onCancel} type="button">
                        {cancelText}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

/* =========================
   MODAL (POPUP) PARA QUANTIDADE APÓS SCAN (Saída / Transferência)
========================= */

function ScanQtyModal({
    open,
    title,
    subtitle,
    produto,
    depositoNome,
    disponivel,
    onClose,
    onConfirm,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    produto: Produto | null;
    depositoNome?: string;
    disponivel: number;
    onClose: () => void;
    onConfirm: (quantidade: number) => void;
}) {
    const [qtd, setQtd] = useState<number>(1);

    useEffect(() => {
        if (!open) return;
        setQtd(1);
    }, [open, produto?.id]);

    const max = Math.max(0, clampInt(disponivel));
    const safeQtd = clampInt(qtd) || 1;
    const invalid = !produto || safeQtd <= 0 || safeQtd > max || max <= 0;

    return (
        <Modal open={open} title={title} subtitle={subtitle} onClose={onClose}>
            {!produto ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Produto não encontrado.</div>
            ) : (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">{produto.nome}</p>
                        <p className="mt-1 text-xs text-slate-600">
                            CB: <b>{produto.codigo_barras}</b>
                            {depositoNome ? (
                                <>
                                    {" "}
                                    • Depósito: <b>{depositoNome}</b>
                                </>
                            ) : null}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                            Disponível em estoque: <b>{max}</b>
                        </p>
                    </div>

                    {max <= 0 ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                            Este produto está <b>sem saldo</b> no depósito selecionado.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Quantidade" hint={`Máximo permitido: ${max}`}>
                                <TextInput
                                    type="number"
                                    min={1}
                                    max={max}
                                    value={safeQtd}
                                    onChange={(e) => setQtd(clampInt(e.target.value) || 1)}
                                />
                            </Field>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                Ao clicar em <b>OK</b>, o item já entra na lista.
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            onClick={() => onConfirm(Math.min(max, Math.max(1, safeQtd)))}
                            disabled={invalid}
                        >
                            OK / Adicionar
                        </Button>
                        <Button variant="ghost" type="button" onClick={onClose}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/* =========================
   POPUP IMAGEM (não fecha clicando fora)
========================= */

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
                        <img
                            src={cleanUrl}
                            alt={title || "Imagem do produto"}
                            className="mx-auto h-auto w-full max-h-[76dvh] rounded-2xl border border-slate-200 object-contain"
                        />
                    ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">Produto sem imagem.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* =========================
   FOTO MINI
========================= */

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
                "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-xl border border-slate-200 bg-slate-50 text-slate-600",
                clickable ? "cursor-zoom-in hover:ring-2 hover:ring-slate-200" : "cursor-default",
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
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full rounded-[inherit] object-cover"
                />
            ) : (
                <span className="text-lg">🖼️</span>
            )}

            {clickable ? (
                <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] shadow ring-1 ring-slate-200">
                    🔍
                </span>
            ) : null}
        </button>
    );
}

/* =========================
   SCANNER
========================= */

function BarcodeScannerModal({
    open,
    title,
    onClose,
    onDetected,
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    onDetected: (code: string) => void;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const controlsRef = useRef<{ stop: () => void } | null>(null);
    const [err, setErr] = useState<string>("");

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        setErr("");

        const start = async () => {
            try {
                const codeReader = new BrowserMultiFormatReader();
                const devices = await BrowserMultiFormatReader.listVideoInputDevices();
                if (!devices?.length) throw new Error("Nenhuma câmera encontrada.");

                const backCam =
                    devices.find((d) => /back|traseira|environment/i.test(d.label))?.deviceId || devices[0]?.deviceId;
                if (!videoRef.current) throw new Error("Vídeo não disponível.");

                const controls = await codeReader.decodeFromVideoDevice(backCam ?? undefined, videoRef.current, (result) => {
                    if (cancelled) return;
                    if (result) {
                        const text = result.getText().trim();
                        if (text) {
                            onDetected(text);
                            onClose();
                        }
                    }
                });

                controlsRef.current = { stop: () => controls.stop() };
            } catch (e: any) {
                setErr(e?.message || "Não foi possível abrir a câmera.");
            }
        };

        start();

        return () => {
            cancelled = true;

            try {
                controlsRef.current?.stop();
            } catch {
                // ignore
            }
            controlsRef.current = null;

            const el = videoRef.current;
            if (el?.srcObject) {
                const tracks = (el.srcObject as MediaStream).getTracks();
                tracks.forEach((t) => t.stop());
                (el.srcObject as any) = null;
            }
        };
    }, [open, onClose, onDetected]);

    return (
        <Modal open={open} title={title} subtitle="Aponte para o código. Ao detectar, preenche automaticamente." onClose={onClose}>
            {err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
            ) : (
                <div className="space-y-3">
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
                        <video ref={videoRef} className="h-[320px] w-full object-cover sm:h-[420px]" playsInline muted />

                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute inset-0 bg-black/25" />

                            <div className="absolute left-1/2 top-1/2 w-[92%] max-w-[560px] -translate-x-1/2 -translate-y-1/2">
                                <div className="relative mx-auto h-[110px] w-full rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                                <p className="mt-2 text-center text-xs text-white/90">Centralize o código dentro do retângulo</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" onClick={onClose} type="button">
                            Fechar
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/* =========================
   TABS
========================= */

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            type="button"
            className={[
                "w-full rounded-xl px-3 py-2 text-[16px] sm:text-sm font-medium transition",
                active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-700 hover:bg-slate-50 ring-1 ring-slate-200",
            ].join(" ")}
        >
            {label}
        </button>
    );
}


function EstoqueResizableHeader({
    label,
    columnKey,
    align = "left",
    isLast = false,
    stickyRight,
    onResizeStart,
    onReset,
}: {
    label: string;
    columnKey: EstoqueColumnKey;
    align?: "left" | "right";
    isLast?: boolean;
    stickyRight?: number;
    onResizeStart: (
        columnKey: EstoqueColumnKey,
        event: React.PointerEvent<HTMLSpanElement>
    ) => void;
    onReset: (columnKey: EstoqueColumnKey) => void;
}) {
    return (
        <th
            style={
                typeof stickyRight === "number"
                    ? { right: stickyRight }
                    : undefined
            }
            className={[
                "sticky top-0 select-none border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700",
                typeof stickyRight === "number"
                    ? "z-20 shadow-[-1px_0_0_0_#e2e8f0]"
                    : "z-10",
                align === "right" ? "text-right" : "text-left",
                isLast ? "" : "border-r border-slate-200",
            ].join(" ")}
        >
            <span className="block break-words">{label}</span>

            {!isLast ? (
                <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Redimensionar coluna ${label}`}
                    title="Arraste para ajustar. Clique duas vezes para restaurar."
                    onPointerDown={(event) =>
                        onResizeStart(columnKey, event)
                    }
                    onDoubleClick={() => onReset(columnKey)}
                    className="group absolute right-0 top-0 z-20 h-full w-3 translate-x-1/2 cursor-col-resize touch-none select-none"
                >
                    <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-slate-300 transition-all group-hover:w-0.5 group-hover:bg-sky-500" />
                </span>
            ) : null}
        </th>
    );
}

/* =========================
   COMBOBOX (Produto) - CORRIGIDO (seleciona e FECHA SEMPRE)
========================= */

function ProductCombobox({
    label,
    placeholder,
    produtos,
    valueId,
    onChangeId,
    saldoByProdId,
    query,
    setQuery,
    disabled,
}: {
    label: string;
    placeholder?: string;
    produtos: Produto[];
    valueId: ID;
    onChangeId: (id: ID) => void;
    saldoByProdId?: Map<ID, number>;
    query: string;
    setQuery: (v: string) => void;
    disabled?: boolean;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);

    const list = useMemo(() => {
        const qq = query.trim().toLowerCase();
        const base = !qq ? produtos : produtos.filter((p) => `${p.nome} ${p.codigo_barras}`.toLowerCase().includes(qq));
        return base.slice(0, 30);
    }, [produtos, query]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target as any)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    // quando o valueId muda (por scan / digitar CB / etc), FECHA a lista também
    useEffect(() => {
        if (!valueId) return;
        setOpen(false);

        const sel = produtos.find((p) => p.id === valueId) || null;
        if (sel && (!query.trim() || query.trim() !== sel.nome)) {
            setQuery(sel.nome);
        }

        // tira foco para evitar reabrir por eventos de foco em alguns devices
        requestAnimationFrame(() => inputRef.current?.blur());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [valueId]);

    return (
        <Field label={label}>
            <div ref={wrapRef} className="relative">
                <TextInput
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                        if (valueId) onChangeId(0);
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder={placeholder || "Digite para buscar..."}
                    disabled={disabled}
                />

                {open ? (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                        {list.length === 0 ? (
                            <div className="p-3 text-sm text-slate-600">Nenhum produto encontrado.</div>
                        ) : (
                            <ul className="max-h-64 overflow-auto py-1">
                                {list.map((p) => {
                                    const disp = saldoByProdId?.get(p.id);
                                    return (
                                        <li key={p.id}>
                                            <button
                                                type="button"
                                                className={[
                                                    "w-full px-3 py-2 text-left text-sm hover:bg-slate-50",
                                                    valueId === p.id ? "bg-slate-50" : "",
                                                ].join(" ")}
                                                onMouseDown={(e) => {
                                                    // garante seleção mesmo antes de blur/focus e evita reabrir
                                                    e.preventDefault();
                                                }}
                                                onClick={() => {
                                                    onChangeId(p.id);
                                                    setQuery(p.nome);
                                                    setOpen(false);
                                                    requestAnimationFrame(() => inputRef.current?.blur());
                                                }}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate font-medium text-slate-900">{p.nome}</span>
                                                    {typeof disp === "number" ? (
                                                        <span className="shrink-0 text-xs text-slate-600">
                                                            disp: <b>{disp}</b>
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div className="mt-0.5 truncate text-xs text-slate-600">
                                                    CB: <b>{p.codigo_barras}</b>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                ) : null}
            </div>
        </Field>
    );
}

/* =========================
   PAGE
========================= */

export default function Page() {
    const [tab, setTab] = useState<UiTab>("MENU");

    const [loading, setLoading] = useState(true);
    const [initErr, setInitErr] = useState<string>("");

    const [me, setMe] = useState<Me | null>(null);
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);

    const [fabricantes, setFabricantes] = useState<Fabricante[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [saldos, setSaldos] = useState<Saldo[]>([]);

    // Custo médio móvel oficial usado nas telas consolidadas de estoque.
    const [custosMediosMoveis, setCustosMediosMoveis] = useState<
        Record<number, CustoMedioMovelProduto>
    >({});
    const custosMediosMoveisRef = useRef<Record<number, CustoMedioMovelProduto>>({});
    const [custosMediosLoading, setCustosMediosLoading] = useState(false);
    const [custosMediosErr, setCustosMediosErr] = useState("");
    const [custosMediosVersion, setCustosMediosVersion] = useState(0);

    // =========================
    // AVANÇADO (POPUPS)
    // =========================
    const [advNovoProdutoOpen, setAdvNovoProdutoOpen] = useState(false);
    const [advAjusteOpen, setAdvAjusteOpen] = useState(false);

    const [advDepAddOpen, setAdvDepAddOpen] = useState(false);
    const [advDepRenameOpen, setAdvDepRenameOpen] = useState(false);

    const [advCatAddOpen, setAdvCatAddOpen] = useState(false);
    const [advCatRenameOpen, setAdvCatRenameOpen] = useState(false);

    const [advFabAddOpen, setAdvFabAddOpen] = useState(false);
    const [advFabRenameOpen, setAdvFabRenameOpen] = useState(false);

    const [advExportOpen, setAdvExportOpen] = useState(false);
    const [advImportOpen, setAdvImportOpen] = useState(false);


    // imagem popup
    const [imgOpen, setImgOpen] = useState(false);
    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [imgTitle, setImgTitle] = useState<string>("");

    // modal editar produto
    const [prodEditOpen, setProdEditOpen] = useState(false);
    const [prodEditId, setProdEditId] = useState<ID | 0>(0);
    const [prodEditTab, setProdEditTab] = useState<ProdutoEditTab>("DADOS");
    const [prodBusy, setProdBusy] = useState(false);
    const [minMaxBusy, setMinMaxBusy] = useState(false);
    const [prodEntradasCusto, setProdEntradasCusto] = useState<HistoricoRow[]>([]);
    const [prodEntradasCustoLoading, setProdEntradasCustoLoading] = useState(false);
    const [prodEntradasCustoErr, setProdEntradasCustoErr] = useState("");

    const [prodCustoDetalhe, setProdCustoDetalhe] = useState<CustoProdutoDetalheResp | null>(null);
    const [custoAjusteOpen, setCustoAjusteOpen] = useState(false);
    const [custoAjusteConfirmOpen, setCustoAjusteConfirmOpen] = useState(false);
    const [custoAjusteTipo, setCustoAjusteTipo] = useState<CustoAjusteTipo>("NOVO_PRECO");
    const [custoAjusteLoteId, setCustoAjusteLoteId] = useState<ID>(0);
    const [custoAjusteNovo, setCustoAjusteNovo] = useState<string>("R$ 0,00");
    const [custoAjusteFreteTotal, setCustoAjusteFreteTotal] = useState<string>("R$ 0,00");
    const [custoAjusteObservacao, setCustoAjusteObservacao] = useState("");
    const [custoAjusteBusy, setCustoAjusteBusy] = useState(false);

    // campos do cadastro
    const [editNome, setEditNome] = useState("");
    const [editDescricao, setEditDescricao] = useState<string>(""); // ✅ NOVO
    const [editValor, setEditValor] = useState<string>("R$ 0,00");
    const [editPrecoCusto, setEditPrecoCusto] = useState<string>("R$ 0,00");
    const [editMin, setEditMin] = useState<number>(0);
    const [editMax, setEditMax] = useState<number>(0); // (produto / padrão)

    // ✅ NOVO: min/max por depósito (est_saldo)
    const [editMinMaxDepId, setEditMinMaxDepId] = useState<ID>(0);
    const [editMinDep, setEditMinDep] = useState<number>(0);
    const [editMaxDep, setEditMaxDep] = useState<number>(0);
    const [editCatId, setEditCatId] = useState<ID>(0);
    const [editFabId, setEditFabId] = useState<ID>(0);
    const [editClassId, setEditClassId] = useState<ID>(0);
    const [editAtivo, setEditAtivo] = useState<0 | 1>(1);
    const [produtoDepositoBusy, setProdutoDepositoBusy] = useState(false);
    const [editNovoDepositoId, setEditNovoDepositoId] = useState<ID>(0);

    // galeria de fotos do produto
    const [editFotosExistentes, setEditFotosExistentes] = useState<ProdutoFoto[]>([]);
    const [editFotosNovas, setEditFotosNovas] = useState<Array<{
        temp_id: string;
        foto_url: string;
        legenda: string;
        is_principal: 0 | 1;
        ordem: number;
    }>>([]);
    const [editFotoNova, setEditFotoNova] = useState<string>(""); // legado / compatibilidade

    // saldos editáveis por depósito


    const depById = useMemo(() => new Map(depositos.map((d) => [d.id, d])), [depositos]);
    const prodById = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
    const produtosAtivos = useMemo(
        () => produtos.filter((p) => Number(p.ativo) === 1),
        [produtos]
    );
    const userById = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);
    const catById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
    const fabById = useMemo(() => new Map(fabricantes.map((f) => [f.id, f])), [fabricantes]);
    const classById = useMemo(() => new Map(classificacoes.map((c) => [c.id, c])), [classificacoes]);

    const saldosMap = useMemo(() => {
        const m = new Map<string, Saldo>();
        for (const s of saldos) m.set(`${s.produto_id}::${s.deposito_id}`, s);
        return m;
    }, [saldos]);

    useEffect(() => {
        if (!prodEditId || !editMinMaxDepId) return;

        const s = saldosMap.get(`${prodEditId}::${editMinMaxDepId}`);
        setEditMinDep(clampInt(s?.minimo ?? 0));
        setEditMaxDep(clampInt(s?.maximo ?? 0));
    }, [prodEditId, editMinMaxDepId, saldosMap]);


    async function refreshInit() {
        setLoading(true);
        setInitErr("");
        try {
            const j = await apiGet<InitResp>({ init: 1, _ts: Date.now() });
            if (!j.ok) throw new Error(j.msg || "Falha no init");

            setMe(j.me);
            setUsuarios(j.usuarios || []);
            setDepositos(j.depositos || []);

            setCategorias((j.categorias || []).filter((c) => Number(c.ativo) === 1));
            setFabricantes((j.fabricantes || []).filter((f) => Number(f.ativo) === 1));
            // Mantém ativos e inativos em memória. As telas operacionais usam produtosAtivos.
            setProdutos(j.produtos || []);
            setClassificacoes((j.classificacoes || []).filter((c) => Number(c.ativo) === 1));

            setSaldos(j.saldos || []);

            // Uma atualização pode conter novas entradas/saídas/ajustes.
            // Limpa o cache para recalcular o custo médio móvel oficial.
            custosMediosMoveisRef.current = {};
            setCustosMediosMoveis({});
            setCustosMediosErr("");
            setCustosMediosVersion((v) => v + 1);
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

    // ALERTAS (só se Min e Max definidos)
    const alertRows = useMemo(() => {
        const rows: Array<{ p: Produto; d: Deposito; qtd: number; min: number; max: number; rep: number }> = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d || Number(p.ativo) !== 1) continue;

            const min = clampInt(s.minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);
            const qtd = clampInt(s.quantidade);

            // ✅ só considera alerta se Min e Max estiverem definidos
            const hasMinMax = min > 0 && max > 0;
            if (!hasMinMax) continue;

            if (qtd <= min) {
                rows.push({
                    p,
                    d,
                    qtd,
                    min,
                    max,
                    rep: Math.max(0, max - qtd),
                });
            }
        }

        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR"));
        return rows;
    }, [saldos, prodById, depById]);


    const alertCount = alertRows.length;

    // ESTOQUE
    const [qEstoque, setQEstoque] = useState("");

    // ✅ multi-select: array vazio = "Todos"
    const [depFiltroEstoque, setDepFiltroEstoque] = useState<ID[]>([]);
    const [catFiltroEstoque, setCatFiltroEstoque] = useState<ID[]>([]);
    const [fabFiltroEstoque, setFabFiltroEstoque] = useState<ID[]>([]);
    const [classFiltroEstoque, setClassFiltroEstoque] = useState<ID[]>([]);

    const [onlyLow, setOnlyLow] = useState(false);

    // ✅ NOVO: ocultar itens zerados
    const [onlyPositive, setOnlyPositive] = useState(false);

    // Quando marcado, a listagem troca dos produtos ativos para os inativos.
    const [onlyInactive, setOnlyInactive] = useState(false);

    // Paginação da listagem de produtos.
    const [estoquePageSize, setEstoquePageSize] = useState<EstoquePageSize>(50);
    const [estoquePage, setEstoquePage] = useState(1);

    // ✅ NOVO: abre/fecha o filtro da aba Estoque
    const [estoqueFilterOpen, setEstoqueFilterOpen] = useState(false);
    const [estoqueFilterSectionOpen, setEstoqueFilterSectionOpen] = useState<
        "DEPOSITOS" | "CATEGORIAS" | "FABRICANTES" | "CLASSIFICACOES" | null
    >(null);

    useEffect(() => {
        if (!estoqueFilterOpen) {
            setEstoqueFilterSectionOpen(null);
        }
    }, [estoqueFilterOpen]);

    const [estoqueColumnWidths, setEstoqueColumnWidths] = useState<
        Record<EstoqueColumnKey, number>
    >({ ...ESTOQUE_DEFAULT_COLUMN_WIDTHS });
    const [estoqueColumnWidthsLoaded, setEstoqueColumnWidthsLoaded] =
        useState(false);

    const estoqueResizeCleanupRef = useRef<(() => void) | null>(null);

    const estoqueTableWidth = useMemo(
        () =>
            ESTOQUE_COLUMN_ORDER.reduce(
                (total, key) => total + estoqueColumnWidths[key],
                0
            ),
        [estoqueColumnWidths]
    );

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(
                ESTOQUE_COLUMN_STORAGE_KEY
            );
            const saved = raw
                ? (JSON.parse(raw) as Partial<
                    Record<EstoqueColumnKey, number>
                >)
                : {};

            const normalized = ESTOQUE_COLUMN_ORDER.reduce((acc, key) => {
                const savedWidth = Number(saved[key]);
                acc[key] = Number.isFinite(savedWidth)
                    ? Math.max(
                        ESTOQUE_MIN_COLUMN_WIDTHS[key],
                        Math.round(savedWidth)
                    )
                    : ESTOQUE_DEFAULT_COLUMN_WIDTHS[key];
                return acc;
            }, {} as Record<EstoqueColumnKey, number>);

            setEstoqueColumnWidths(normalized);
        } catch {
            setEstoqueColumnWidths({ ...ESTOQUE_DEFAULT_COLUMN_WIDTHS });
        } finally {
            setEstoqueColumnWidthsLoaded(true);
        }
    }, []);

    useEffect(() => {
        if (!estoqueColumnWidthsLoaded) return;

        try {
            window.localStorage.setItem(
                ESTOQUE_COLUMN_STORAGE_KEY,
                JSON.stringify(estoqueColumnWidths)
            );
        } catch {
            // O navegador pode bloquear o armazenamento local.
        }
    }, [estoqueColumnWidths, estoqueColumnWidthsLoaded]);

    useEffect(() => {
        return () => estoqueResizeCleanupRef.current?.();
    }, []);

    function iniciarRedimensionamentoColunaEstoque(
        columnKey: EstoqueColumnKey,
        event: React.PointerEvent<HTMLSpanElement>
    ) {
        event.preventDefault();
        event.stopPropagation();

        estoqueResizeCleanupRef.current?.();

        const startX = event.clientX;
        const startWidth = estoqueColumnWidths[columnKey];
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onPointerMove = (moveEvent: PointerEvent) => {
            const delta = moveEvent.clientX - startX;
            const nextWidth = Math.max(
                ESTOQUE_MIN_COLUMN_WIDTHS[columnKey],
                Math.round(startWidth + delta)
            );

            setEstoqueColumnWidths((current) => ({
                ...current,
                [columnKey]: nextWidth,
            }));
        };

        const cleanup = () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", cleanup);
            window.removeEventListener("pointercancel", cleanup);
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            estoqueResizeCleanupRef.current = null;
        };

        estoqueResizeCleanupRef.current = cleanup;
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", cleanup, { once: true });
        window.addEventListener("pointercancel", cleanup, { once: true });
    }

    function restaurarLarguraColunaEstoque(columnKey: EstoqueColumnKey) {
        setEstoqueColumnWidths((current) => ({
            ...current,
            [columnKey]: ESTOQUE_DEFAULT_COLUMN_WIDTHS[columnKey],
        }));
    }

    // =========================
    // CONFERÊNCIA (não altera saldo)
    // =========================

    // ✅ NOVO: abre/fecha o filtro da aba Conferência
    const [confFilterOpen, setConfFilterOpen] = useState(false);


    const [confDepositoId, setConfDepositoId] = useState<ID>(0);
    const [confFabId, setConfFabId] = useState<ID | "Todos">("Todos");
    const [confCatId, setConfCatId] = useState<ID | "Todas">("Todas");
    const [confClassId, setConfClassId] = useState<ID | "Todas">("Todas");
    const [confQ, setConfQ] = useState("");
    // ✅ NOVO: ocultar itens zerados na conferência
    const [confOnlyPositive, setConfOnlyPositive] = useState(false);

    // qtd física por produto (como string para permitir vazio)
    const [confFisicoByProd, setConfFisicoByProd] = useState<Record<number, string>>({});

    // ✅ NOVO: Registrar conferência (modal + snapshot)
    const [confSaveOpen, setConfSaveOpen] = useState(false);
    const [confSaveBusy, setConfSaveBusy] = useState(false);
    const [confSaveItens, setConfSaveItens] = useState<
        Array<{ produto_id: ID; nome: string; qtdSistema: number; qtdFisica: number; dif: number }>
    >([]);


    // ✅ NOVO: CONFERÊNCIAS (REGISTROS SALVOS)
    const [confRegLoading, setConfRegLoading] = useState(false);
    const [confRegErr, setConfRegErr] = useState<string>("");
    const [confRegDepositoId, setConfRegDepositoId] = useState<ID>(0);
    const [confRegDataIni, setConfRegDataIni] = useState<string>(""); // YYYY-MM-DD
    const [confRegDataFim, setConfRegDataFim] = useState<string>(""); // YYYY-MM-DD
    const [confRegRows, setConfRegRows] = useState<ConferenciaRegistro[]>([]);

    // ✅ DETALHE DE CONFERÊNCIA (REGISTRO SALVO)
    const [confDetOpen, setConfDetOpen] = useState(false);
    const [confDetBusy, setConfDetBusy] = useState(false);
    // ✅ NOVO: modal com lista de conferências registradas
    const [confRegOpen, setConfRegOpen] = useState(false);
    const [confDetErr, setConfDetErr] = useState<string>("");
    const [confDetId, setConfDetId] = useState<number>(0);
    const [confDetHead, setConfDetHead] = useState<ConferenciaDetalheHead | null>(null);
    const [confDetItems, setConfDetItems] = useState<ConferenciaItem[]>([]);




    async function loadConferenciasRegistros() {
        setConfRegLoading(true);
        setConfRegErr("");
        try {
            const resp = await apiGet<ConferenciasListResp>({
                conferencias: 1,
                deposito_id: confRegDepositoId || undefined, // 0 = todos
                data_ini: confRegDataIni || undefined,       // ✅ novo
                data_fim: confRegDataFim || undefined,       // ✅ novo
                limit: 100,
                _ts: Date.now(),
            });

            if (!resp.ok) throw new Error(resp.msg || "Falha ao carregar conferências.");
            setConfRegRows(resp.rows || []);
        } catch (e: any) {
            setConfRegErr(e?.message || "Erro ao carregar conferências.");
        } finally {
            setConfRegLoading(false);
        }
    }

    useEffect(() => {
        if (!confRegOpen) return;

        // pequeno debounce para não disparar múltiplas requisições seguidas
        const t = window.setTimeout(() => {
            loadConferenciasRegistros();
        }, 200);

        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confRegOpen, confRegDepositoId, confRegDataIni, confRegDataFim]);



    async function loadConferenciaDetalhe(conferencia_id: number) {
        setConfDetBusy(true);
        setConfDetErr("");

        try {
            const resp = await apiGet<ConferenciaDetalheResp>({
                conferencia_id: conferencia_id,
                _ts: Date.now(),
            });

            if (!resp.ok) throw new Error(resp.msg || "Falha ao carregar detalhe da conferência.");

            setConfDetHead(resp.head);
            setConfDetItems(resp.items || []);
        } catch (e: any) {
            setConfDetErr(e?.message || "Erro ao carregar detalhe.");
            setConfDetHead(null);
            setConfDetItems([]);
        } finally {
            setConfDetBusy(false);
        }
    }


    function abrirConferenciaDetalhe(conferencia_id: number) {
        setConfDetId(conferencia_id);
        setConfDetOpen(true);
        loadConferenciaDetalhe(conferencia_id);
    }



    // ✅ MOSTRA Min/Rep apenas se existir pelo menos 1 item (no(s) depósito(s) filtrado(s))
    // com minimo>0 OU maximo>0. Se todos forem 0, some as colunas.
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

        type EstoqueProdutoRow = {
            p: Produto;
            d: Deposito;
            qtd: number;
            s?: Saldo;
            min: number;
            max: number;
            rep: number;
            hasMinMax: boolean;
            depositoIds: ID[];
            depositoNomes: string[];
        };

        type EstoqueProdutoAcumulado = {
            p: Produto;
            primeiroDeposito: Deposito;
            primeiroSaldo?: Saldo;
            qtd: number;
            min: number;
            max: number;
            depositos: Map<ID, string>;
        };

        const depSet = depFiltroEstoque.length ? new Set(depFiltroEstoque.map(Number)) : null;
        const catSet = catFiltroEstoque.length ? new Set(catFiltroEstoque.map(Number)) : null;
        const fabSet = fabFiltroEstoque.length ? new Set(fabFiltroEstoque.map(Number)) : null;
        const clsSet = classFiltroEstoque.length ? new Set(classFiltroEstoque.map(Number)) : null;

        const agrupados = new Map<ID, EstoqueProdutoAcumulado>();

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            const produtoInativo = Number(p.ativo) !== 1;
            if (onlyInactive ? !produtoInativo : produtoInativo) continue;

            if (depSet && !depSet.has(Number(d.id))) continue;

            if (catSet) {
                const categoriaId = Number(p.categoria_id || 0);
                if (!catSet.has(categoriaId)) continue;
            }

            if (fabSet) {
                const fabricanteId = Number(p.fabricante_id || 0);
                if (!fabSet.has(fabricanteId)) continue;
            }

            if (clsSet) {
                const classificacaoId = Number(p.classificacao_id || 0);
                if (!clsSet.has(classificacaoId)) continue;
            }

            const atual = agrupados.get(p.id);
            const qtdSaldo = clampInt(s.quantidade);
            const minSaldo = clampInt(s.minimo ?? 0);
            const maxSaldo = clampInt(s.maximo ?? 0);

            if (atual) {
                atual.qtd += qtdSaldo;
                atual.min += minSaldo;
                atual.max += maxSaldo;
                atual.depositos.set(d.id, d.nome);
            } else {
                agrupados.set(p.id, {
                    p,
                    primeiroDeposito: d,
                    primeiroSaldo: s,
                    qtd: qtdSaldo,
                    min: minSaldo,
                    max: maxSaldo,
                    depositos: new Map<ID, string>([[d.id, d.nome]]),
                });
            }
        }

        // Também inclui produtos sem linha em est_saldo quando nenhum depósito específico foi filtrado.
        // Isso garante que a opção Produtos inativos mostre todos os cadastros inativos.
        if (!depSet) {
            for (const p of produtos) {
                const produtoInativo = Number(p.ativo) !== 1;
                if (onlyInactive ? !produtoInativo : produtoInativo) continue;
                if (agrupados.has(p.id)) continue;

                if (catSet && !catSet.has(Number(p.categoria_id || 0))) continue;
                if (fabSet && !fabSet.has(Number(p.fabricante_id || 0))) continue;
                if (clsSet && !clsSet.has(Number(p.classificacao_id || 0))) continue;

                agrupados.set(p.id, {
                    p,
                    primeiroDeposito: depositos[0] || { id: 0, nome: "" },
                    primeiroSaldo: undefined,
                    qtd: 0,
                    min: 0,
                    max: 0,
                    depositos: new Map<ID, string>(),
                });
            }
        }

        const rows: EstoqueProdutoRow[] = [];

        for (const grupo of agrupados.values()) {
            const { p, qtd, min, max } = grupo;
            const hasMinMax = min > 0 && max > 0;
            const rep = hasMinMax ? Math.max(0, max - qtd) : 0;

            // A regra de saldo positivo é aplicada depois da soma dos depósitos selecionados.
            if (onlyPositive && qtd <= 0) continue;

            // O alerta também considera o saldo e os limites consolidados dos depósitos selecionados.
            if (onlyLow && !(hasMinMax && qtd <= min)) continue;

            const depositoNomes = Array.from(grupo.depositos.values()).sort((a, b) =>
                a.localeCompare(b, "pt-BR")
            );
            const depositoIds = Array.from(grupo.depositos.keys());

            if (qq) {
                const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
                const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
                const cls = p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "";
                const blob = `${p.nome} ${p.codigo_barras} ${depositoNomes.join(" ")} ${cat} ${fab} ${cls}`.toLowerCase();
                if (!blob.includes(qq)) continue;
            }

            rows.push({
                p,
                // Mantido como referência para abrir o editor e para os relatórios existentes.
                // O nome consolidado representa todos os depósitos atualmente filtrados.
                d: {
                    id: grupo.primeiroDeposito.id,
                    nome: depositoNomes.join(", "),
                },
                qtd,
                s: grupo.primeiroSaldo,
                min,
                max,
                rep,
                hasMinMax,
                depositoIds,
                depositoNomes,
            });
        }

        rows.sort((a, b) =>
            a.p.nome.localeCompare(b.p.nome, "pt-BR") ||
            a.p.codigo_barras.localeCompare(b.p.codigo_barras, "pt-BR")
        );

        return rows;
    }, [
        saldos,
        produtos,
        depositos,
        prodById,
        depById,
        qEstoque,
        depFiltroEstoque,
        catFiltroEstoque,
        fabFiltroEstoque,
        classFiltroEstoque,
        onlyLow,
        onlyPositive,
        onlyInactive,
        catById,
        fabById,
        classById,
    ]);

    const estoqueProdutoIds = useMemo(
        () => Array.from(new Set(estoqueRows.map((row) => Number(row.p.id)))).filter((id) => id > 0),
        [estoqueRows]
    );

    const estoqueProdutoIdsKey = useMemo(
        () => estoqueProdutoIds.join(","),
        [estoqueProdutoIds]
    );

    useEffect(() => {
        if (!estoqueProdutoIds.length) return;

        const faltantes = estoqueProdutoIds.filter(
            (id) => !Object.prototype.hasOwnProperty.call(custosMediosMoveisRef.current, id)
        );
        if (!faltantes.length) return;

        let cancelled = false;

        async function carregarCustosMediosMoveis() {
            setCustosMediosLoading(true);
            setCustosMediosErr("");

            try {
                const chunks: number[][] = [];
                for (let i = 0; i < faltantes.length; i += 180) {
                    chunks.push(faltantes.slice(i, i + 180));
                }

                const respostas = await Promise.all(
                    chunks.map((ids, index) =>
                        apiGet<CustosMediosMoveisResp>({
                            action: "custos_medios_produtos",
                            produto_ids: ids.join(","),
                            _ts: Date.now() + index,
                        })
                    )
                );

                const novos: Record<number, CustoMedioMovelProduto> = {};
                for (const resp of respostas) {
                    if (!resp.ok) {
                        throw new Error(resp.msg || "Falha ao carregar custos médios móveis.");
                    }

                    for (const row of resp.rows || []) {
                        const produtoId = Number(row.produto_id);
                        if (!produtoId) continue;
                        novos[produtoId] = row;
                    }
                }

                if (cancelled) return;

                custosMediosMoveisRef.current = {
                    ...custosMediosMoveisRef.current,
                    ...novos,
                };
                setCustosMediosMoveis({ ...custosMediosMoveisRef.current });
            } catch (e: any) {
                if (!cancelled) {
                    setCustosMediosErr(
                        e?.message || "Não foi possível carregar o custo médio móvel dos produtos."
                    );
                }
            } finally {
                if (!cancelled) setCustosMediosLoading(false);
            }
        }

        void carregarCustosMediosMoveis();

        return () => {
            cancelled = true;
        };
    }, [estoqueProdutoIdsKey, custosMediosVersion]);

    function custoMedioMovelProduto(produtoId: ID): number {
        const registro = custosMediosMoveis[Number(produtoId)];
        const valor = Number(registro?.custo_medio);
        return Number.isFinite(valor) ? Math.max(0, valor) : 0;
    }

    function custoTotalMovelProduto(produtoId: ID, quantidadeFiltrada: number): number {
        return roundCost(custoMedioMovelProduto(produtoId) * clampInt(quantidadeFiltrada));
    }

    const estoqueTotalPages = useMemo(() => {
        if (estoquePageSize === "ALL") return 1;
        return Math.max(1, Math.ceil(estoqueRows.length / estoquePageSize));
    }, [estoqueRows.length, estoquePageSize]);

    useEffect(() => {
        setEstoquePage(1);
    }, [
        qEstoque,
        depFiltroEstoque,
        catFiltroEstoque,
        fabFiltroEstoque,
        classFiltroEstoque,
        onlyLow,
        onlyPositive,
        onlyInactive,
        estoquePageSize,
    ]);

    useEffect(() => {
        setEstoquePage((paginaAtual) =>
            Math.min(Math.max(1, paginaAtual), estoqueTotalPages)
        );
    }, [estoqueTotalPages]);

    const estoqueRowsPaginados = useMemo(() => {
        if (estoquePageSize === "ALL") return estoqueRows;

        const inicio = (estoquePage - 1) * estoquePageSize;
        return estoqueRows.slice(inicio, inicio + estoquePageSize);
    }, [estoqueRows, estoquePage, estoquePageSize]);

    const estoquePaginaInicio =
        estoqueRows.length === 0
            ? 0
            : estoquePageSize === "ALL"
                ? 1
                : (estoquePage - 1) * estoquePageSize + 1;

    const estoquePaginaFim =
        estoqueRows.length === 0
            ? 0
            : estoquePageSize === "ALL"
                ? estoqueRows.length
                : Math.min(estoqueRows.length, estoquePage * estoquePageSize);


    const estoqueFiltroOptions = useMemo(() => {
        type EstoqueFiltroOptionRow = {
            p: Produto;
            d: Deposito;
            qtd: number;
            min: number;
            max: number;
            hasMinMax: boolean;
        };

        const qq = qEstoque.trim().toLowerCase();
        const baseRows: EstoqueFiltroOptionRow[] = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            const produtoInativo = Number(p.ativo) !== 1;
            if (onlyInactive ? !produtoInativo : produtoInativo) continue;

            const qtd = clampInt(s.quantidade);
            if (onlyPositive && qtd <= 0) continue;

            const min = clampInt((s as any).minimo ?? 0);
            const max = clampInt((s as any).maximo ?? 0);
            const hasMinMax = min > 0 && max > 0;

            if (onlyLow && !(hasMinMax && qtd <= min)) continue;

            if (qq) {
                const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
                const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
                const cls = p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "";
                const blob = `${p.nome} ${p.codigo_barras} ${d.nome} ${cat} ${fab} ${cls}`.toLowerCase();

                if (!blob.includes(qq)) continue;
            }

            baseRows.push({ p, d, qtd, min, max, hasMinMax });
        }

        const depSet = depFiltroEstoque.length ? new Set(depFiltroEstoque.map(Number)) : null;
        const catSet = catFiltroEstoque.length ? new Set(catFiltroEstoque.map(Number)) : null;
        const fabSet = fabFiltroEstoque.length ? new Set(fabFiltroEstoque.map(Number)) : null;
        const clsSet = classFiltroEstoque.length ? new Set(classFiltroEstoque.map(Number)) : null;

        const passaSelecoes = (
            r: EstoqueFiltroOptionRow,
            ignorar: "deposito" | "categoria" | "fabricante" | "classificacao"
        ) => {
            if (ignorar !== "deposito" && depSet && !depSet.has(Number(r.d.id))) return false;

            if (ignorar !== "categoria" && catSet) {
                const pid = Number(r.p.categoria_id || 0);
                if (!catSet.has(pid)) return false;
            }

            if (ignorar !== "fabricante" && fabSet) {
                const fid = Number(r.p.fabricante_id || 0);
                if (!fabSet.has(fid)) return false;
            }

            if (ignorar !== "classificacao" && clsSet) {
                const cid = Number(r.p.classificacao_id || 0);
                if (!clsSet.has(cid)) return false;
            }

            return true;
        };

        const uniqById = (items: Opt[]) => {
            const map = new Map<ID, Opt>();

            for (const item of items) {
                if (!item.id) continue;
                if (!map.has(item.id)) map.set(item.id, item);
            }

            return Array.from(map.values()).sort((a, b) =>
                a.nome.localeCompare(b.nome, "pt-BR")
            );
        };

        const toCategoria = (p: Produto): Opt | null => {
            const id = Number(p.categoria_id || 0);
            if (!id) return null;

            const nome = p.categoria_nome || catById.get(id)?.nome || "";
            if (!nome.trim()) return null;

            return { id, nome };
        };

        const toFabricante = (p: Produto): Opt | null => {
            const id = Number(p.fabricante_id || 0);
            if (!id) return null;

            const nome = p.fabricante_nome || fabById.get(id)?.nome || "";
            if (!nome.trim()) return null;

            return { id, nome };
        };

        const toClassificacao = (p: Produto): Opt | null => {
            const id = Number(p.classificacao_id || 0);
            if (!id) return null;

            const nome = p.classificacao_nome || classById.get(id)?.nome || "";
            if (!nome.trim()) return null;

            return { id, nome };
        };

        return {
            depositos: uniqById(
                baseRows
                    .filter((r) => passaSelecoes(r, "deposito"))
                    .map((r) => ({ id: r.d.id, nome: r.d.nome }))
            ),

            categorias: uniqById(
                baseRows
                    .filter((r) => passaSelecoes(r, "categoria"))
                    .map((r) => toCategoria(r.p))
                    .filter((x): x is Opt => !!x)
            ),

            fabricantes: uniqById(
                baseRows
                    .filter((r) => passaSelecoes(r, "fabricante"))
                    .map((r) => toFabricante(r.p))
                    .filter((x): x is Opt => !!x)
            ),

            classificacoes: uniqById(
                baseRows
                    .filter((r) => passaSelecoes(r, "classificacao"))
                    .map((r) => toClassificacao(r.p))
                    .filter((x): x is Opt => !!x)
            ),
        };
    }, [
        saldos,
        prodById,
        depById,
        qEstoque,
        onlyPositive,
        onlyLow,
        onlyInactive,
        depFiltroEstoque,
        catFiltroEstoque,
        fabFiltroEstoque,
        classFiltroEstoque,
        catById,
        fabById,
        classById,
    ]);

    const estoqueResumo = useMemo(() => {
        let totalUnidades = 0;
        let totalValor = 0;
        let totalCusto = 0;

        const modelosSet = new Set<number>();

        for (const { p, qtd } of estoqueRows) {
            modelosSet.add(Number(p.id));

            const q = clampInt(qtd);
            totalUnidades += q;

            const valorVenda = Number(p.valor) || 0;
            const precoCusto = custoMedioMovelProduto(p.id);

            totalValor += q * valorVenda;
            totalCusto += q * precoCusto;
        }

        return {
            totalUnidades,
            totalValor,
            totalCusto,
            totalModelos: modelosSet.size,
        };
    }, [estoqueRows, custosMediosMoveis]);



    function getFiltroResumo() {
        const joinNames = (opts: Array<{ id: ID; nome: string }>, sel: ID[], allTxt: string) => {
            if (!sel.length) return allTxt;
            const m = new Map(opts.map((o) => [o.id, o.nome]));
            return sel.map((id) => m.get(id) || `#${id}`).join(", ");
        };

        return {
            busca: qEstoque.trim() || "—",
            deposito: joinNames(depositos, depFiltroEstoque, "Todos"),
            categoria: joinNames(categorias, catFiltroEstoque, "Todas"),
            fabricante: joinNames(fabricantes, fabFiltroEstoque, "Todos"),
            classificacao: joinNames(classificacoes, classFiltroEstoque, "Todas"),
            somenteAlerta: onlyLow ? "Sim" : "Não",
            somenteSaldoPositivo: onlyPositive ? "Sim" : "Não", // ✅ NOVO
        };
    }


    function exportarEstoqueCSV() {
        if (!estoqueRows.length) {
            alert("Nenhum item para exportar com os filtros atuais.");
            return;
        }

        const sep = ";";
        const header = ["Produto", "Código de Barras", "Depósito", "Categoria", "Fabricante", "Quantidade", "Min", "Rep", "Valor (un)", "Preço de Custo (un)", "Custo Total"];


        const lines: string[] = [];
        lines.push("\uFEFF" + header.map((h) => escapeCsvCell(h, sep)).join(sep));

        for (const { p, d, qtd, s, min, rep } of estoqueRows) {
            const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
            const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
            const valorNum = Number(p.valor) || 0;
            const precoCustoNum = custoMedioMovelProduto(p.id);
            const custoTotalItem = custoTotalMovelProduto(p.id, qtd);

            lines.push(
                [p.nome, p.codigo_barras, d.nome, cat, fab, qtd, min, rep, moneyBRL(valorNum), moneyBRL(precoCustoNum), moneyBRL(custoTotalItem)]

                    .map((x) => escapeCsvCell(x, sep))
                    .join(sep)
            );
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

    // ✅ PDF REAL (download direto) - Estoque (logo + horizontal)
    async function exportarEstoquePDF() {
        if (!estoqueRows.length) {
            alert("Nenhum item para exportar com os filtros atuais.");
            return;
        }

        // libs (lazy import)
        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;

        const LOGO_URL =
            "https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1";

        const f = getFiltroResumo();
        const geradoEm = new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date());

        const norm = (s: string) =>
            (s || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim()
                .toUpperCase();

        // =========================================================
        // 1) ORGANIZAÇÃO TOTAL (Depósito -> Categoria -> Fabricante -> Produto)
        // =========================================================
        const sortedRows = [...estoqueRows].sort((a, b) => {
            const depA = norm(a.d?.nome || "");
            const depB = norm(b.d?.nome || "");
            if (depA !== depB) return depA.localeCompare(depB, "pt-BR");

            const catA = norm(a.p?.categoria_nome || "");
            const catB = norm(b.p?.categoria_nome || "");
            if (catA !== catB) return catA.localeCompare(catB, "pt-BR");

            const fabA = norm(a.p?.fabricante_nome || "");
            const fabB = norm(b.p?.fabricante_nome || "");
            if (fabA !== fabB) return fabA.localeCompare(fabB, "pt-BR");

            const nA = (a.p?.nome || "").toString();
            const nB = (b.p?.nome || "").toString();
            return nA.localeCompare(nB, "pt-BR");
        });

        // =========================================================
        // 2) REGRAS DE COLUNAS DINÂMICAS
        // =========================================================
        const isEmpty = (v: any) => v === null || v === undefined || String(v).trim() === "";

        const hasCodigo = sortedRows.some((r) => !isEmpty(r.p?.codigo_barras));
        const hasDeposito = sortedRows.some((r) => !isEmpty(r.d?.nome));
        const hasCategoria = sortedRows.some((r) => !isEmpty(r.p?.categoria_nome));
        const hasFabricante = sortedRows.some((r) => !isEmpty(r.p?.fabricante_nome));

        // =========================================================
        // 3) TOTAIS
        // =========================================================
        const totalLinhas = new Set(sortedRows.map((r) => r.p.id)).size;

        let totalQuantidade = 0;
        let totalCustoEstoque = 0;

        for (const { p, qtd } of sortedRows) {
            const q = clampInt(qtd);
            totalQuantidade += q;
            totalCustoEstoque += custoTotalMovelProduto(p.id, q);
        }

        totalCustoEstoque = roundCost(totalCustoEstoque);

        // helper: busca imagem e converte para dataURL
        async function toDataUrl(url: string): Promise<string | null> {
            try {
                const r = await fetch(url, { mode: "cors", cache: "no-store" });
                const b = await r.blob();
                const reader = await new Promise<string>((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onerror = () => reject(new Error("Falha ao ler logo"));
                    fr.onload = () => resolve(String(fr.result || ""));
                    fr.readAsDataURL(b);
                });
                return reader;
            } catch {
                return null;
            }
        }

        const logoDataUrl = await toDataUrl(LOGO_URL);
        const logoFormat = logoDataUrl?.startsWith("data:image/jpeg") ? "JPEG" : "PNG";

        // ✅ A4 landscape
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

        const pageW = doc.internal.pageSize.getWidth();
        const marginX = 12;
        let y = 12;

        // ===== HEADER (logo + título + meta)
        if (logoDataUrl) {
            doc.addImage(logoDataUrl, logoFormat as any, marginX, y, 55, 14);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Relatório de Estoque", marginX + 62, y + 8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Gerado em: ${geradoEm}`, marginX + 62, y + 14);

        y += 22;

        // ===== FILTROS (caixa leve)
        doc.setDrawColor(226, 232, 240); // #e2e8f0
        doc.setFillColor(248, 250, 252); // #f8fafc
        doc.roundedRect(marginX, y, pageW - marginX * 2, 22, 2, 2, "FD");

        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);

        // sem "Busca"
        doc.text(`Depósito: ${f.deposito}`, marginX + 3, y + 6);
        doc.text(`Categoria: ${f.categoria}`, marginX + 3, y + 11);
        doc.text(`Fabricante: ${f.fabricante}`, marginX + 3, y + 16);
        doc.text(`Classificação: ${(f as any).classificacao}`, marginX + 3, y + 21);

        // direita
        doc.text(`Somente alerta (do mínimo): ${f.somenteAlerta}`, pageW / 2, y + 6);
        doc.text(`Somente saldo > 0: ${(f as any).somenteSaldoPositivo}`, pageW / 2, y + 11);

        y += 28;

        // =========================================================
        // 4) TABELA (autoTable) + RODAPÉ
        // PDF de Produtos: sem Mín, Reposição e Valor de venda.
        // Inclui custo médio móvel unitário e custo total do estoque filtrado.
        // =========================================================
        const head: string[] = [
            "Produto",
            ...(hasCodigo ? ["Código"] : []),
            ...(hasDeposito ? ["Depósito"] : []),
            ...(hasCategoria ? ["Categoria"] : []),
            ...(hasFabricante ? ["Fabricante"] : []),
            "Quantidade",
            "Preço de Custo (un)",
            "Custo Total",
        ];

        const body = sortedRows.map(({ p, d, qtd }) => {
            const cat = p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
            const fab = p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
            const quantidade = clampInt(qtd);
            const precoCustoUnitario = custoMedioMovelProduto(p.id);
            const custoTotalItem = custoTotalMovelProduto(p.id, quantidade);

            const row: any[] = [];
            row.push(p.nome);

            if (hasCodigo) row.push(p.codigo_barras || "");
            if (hasDeposito) row.push(d.nome || "");
            if (hasCategoria) row.push(cat);
            if (hasFabricante) row.push(fab);

            row.push(String(quantidade));
            row.push(moneyBRL(precoCustoUnitario));
            row.push(moneyBRL(custoTotalItem));

            return row;
        });

        // ✅ RODAPÉ com quantidade e valor total do custo do estoque
        const footRow = new Array(head.length).fill("");

        // "Modelos:" na 1ª coluna (Produto)
        footRow[0] = `Modelos: ${totalLinhas}`;

        // Total embaixo de Quantidade
        const idxQtd = head.indexOf("Quantidade");
        if (idxQtd >= 0) footRow[idxQtd] = String(totalQuantidade);

        // Custo total geral embaixo de Custo Total
        const idxCustoTotal = head.indexOf("Custo Total");
        if (idxCustoTotal >= 0) footRow[idxCustoTotal] = moneyBRL(totalCustoEstoque);

        autoTable(doc, {
            startY: y,
            head: [head],
            body,

            // ✅ rodapé na tabela
            foot: [footRow],
            showFoot: "lastPage",

            margin: { left: marginX, right: marginX },

            styles: {
                font: "helvetica",
                fontSize: 9.2,
                cellPadding: 2.2,
                valign: "top",
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
            },

            headStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: "bold",
                valign: "middle",
            },

            // ✅ estilo do rodapé
            footStyles: {
                fillColor: [248, 250, 252],
                textColor: [15, 23, 42],
                fontStyle: "bold",
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
            },

            didParseCell: (data) => {
                const colName = head[data.column.index];

                // ✅ alinha números e valores monetários à direita
                if (["Quantidade", "Preço de Custo (un)", "Custo Total"].includes(colName)) {
                    data.cell.styles.halign = "right";
                }

                // ✅ rodapé: 1ª coluna à esquerda
                if (data.section === "foot" && data.column.index === 0) {
                    data.cell.styles.halign = "left";
                }

                // daqui pra baixo: só body
                if (data.section !== "body") return;

                // ✅ mantém o alerta visual de estoque baixo na Quantidade
                if (colName === "Quantidade") {
                    const r = sortedRows[data.row.index];
                    const low = !!r.hasMinMax && clampInt(r.qtd) <= clampInt(r.min);
                    if (low) data.cell.styles.textColor = [185, 28, 28];
                }
            },

            // ✅ deixa Produto quebrar linha quando precisar
            columnStyles: {
                0: { cellWidth: 75, overflow: "linebreak" }, // Produto
            },
        });

        // ===== DOWNLOAD DIRETO
        const safeName = `estoque_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`.replace(/\s+/g, "_");
        doc.save(`${safeName}.pdf`);
    }


    // =========================
    // CONFERÊNCIA: linhas (1 depósito) + filtros
    // =========================
    const conferenciaFiltroOptions = useMemo(() => {
        type ConferenciaFiltroRow = {
            p: Produto;
            d: Deposito;
            qtdSistema: number;
            fabricante: string;
            categoria: string;
            classificacao: string;
        };

        const qq = confQ.trim().toLowerCase();
        const rows: ConferenciaFiltroRow[] = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            const qtdSistema = clampInt(s.quantidade);
            if (confOnlyPositive && qtdSistema <= 0) continue;

            const fabricante =
                p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
            const categoria =
                p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
            const classificacao =
                p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "";

            if (qq) {
                const blob = `${p.nome} ${p.codigo_barras} ${d.nome} ${fabricante} ${categoria} ${classificacao}`.toLowerCase();
                if (!blob.includes(qq)) continue;
            }

            rows.push({ p, d, qtdSistema, fabricante, categoria, classificacao });
        }

        const depId = Number(confDepositoId || 0);
        const fabId = confFabId === "Todos" ? 0 : Number(confFabId || 0);
        const catId = confCatId === "Todas" ? 0 : Number(confCatId || 0);
        const clsId = confClassId === "Todas" ? 0 : Number(confClassId || 0);

        const passaSelecoes = (
            r: ConferenciaFiltroRow,
            ignorar: "deposito" | "fabricante" | "categoria" | "classificacao"
        ) => {
            if (ignorar !== "deposito" && depId && Number(r.d.id) !== depId) return false;
            if (ignorar !== "fabricante" && fabId && Number(r.p.fabricante_id || 0) !== fabId) return false;
            if (ignorar !== "categoria" && catId && Number(r.p.categoria_id || 0) !== catId) return false;
            if (ignorar !== "classificacao" && clsId && Number(r.p.classificacao_id || 0) !== clsId) return false;
            return true;
        };

        return {
            depositos: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "deposito"))
                    .map((r) => ({ id: r.d.id, nome: r.d.nome }))
            ),
            fabricantes: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "fabricante"))
                    .map((r) => produtoFabricanteOption(r.p, fabById))
            ),
            categorias: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "categoria"))
                    .map((r) => produtoCategoriaOption(r.p, catById))
            ),
            classificacoes: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "classificacao"))
                    .map((r) => produtoClassificacaoOption(r.p, classById))
            ),
        };
    }, [
        confDepositoId,
        confFabId,
        confCatId,
        confClassId,
        confQ,
        confOnlyPositive,
        saldos,
        prodById,
        depById,
        fabById,
        catById,
        classById,
    ]);

    const conferenciaRows = useMemo(() => {
        const depId = Number(confDepositoId);
        if (!depId) return [];



        const qq = confQ.trim().toLowerCase();

        const rows: Array<{
            p: Produto;
            qtdSistema: number;
            fabricante: string;
            categoria: string;
            classificacao: string;
        }> = [];

        for (const s of saldos) {
            if (Number(s.deposito_id) !== depId) continue;

            const p = prodById.get(s.produto_id);
            if (!p) continue;

            const qtdSistema = clampInt(s.quantidade);

            // ✅ NOVO: oculta itens zerados na conferência
            if (confOnlyPositive && qtdSistema <= 0) continue;

            if (confCatId !== "Todas") {
                if (Number(p.categoria_id || 0) !== Number(confCatId)) continue;
            }

            if (confFabId !== "Todos") {
                if (Number(p.fabricante_id || 0) !== Number(confFabId)) continue;
            }

            if (confClassId !== "Todas") {
                if (Number(p.classificacao_id || 0) !== Number(confClassId)) continue;
            }

            const fabricante =
                p.fabricante_nome || (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : "") || "";
            const categoria =
                p.categoria_nome || (p.categoria_id ? catById.get(p.categoria_id)?.nome : "") || "";
            const classificacao =
                p.classificacao_nome || (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : "") || "";

            if (qq) {
                const blob = `${p.nome} ${p.codigo_barras} ${fabricante} ${categoria} ${classificacao}`.toLowerCase();
                if (!blob.includes(qq)) continue;
            }

            rows.push({
                p,
                qtdSistema,
                fabricante,
                categoria,
                classificacao,
            });
        }


        rows.sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR"));
        return rows;
    }, [
        confDepositoId,
        confFabId,
        confCatId,
        confClassId,
        confQ,
        confOnlyPositive, // ✅ NOVO
        saldos,
        prodById,
        fabById,
        catById,
        classById,
    ]);


    function parseFisico(v: string): number | null {
        const t = (v || "").replace(/\D/g, "").trim();
        if (!t) return null;
        return clampInt(t);
    }


    // ✅ habilita o botão "Registrar" somente se houver pelo menos 1 qtd física informada
    const confTemFisicos = useMemo(() => {
        for (const r of conferenciaRows) {
            const fis = parseFisico(confFisicoByProd[r.p.id] ?? "");
            if (fis !== null) return true;
        }
        return false;
    }, [conferenciaRows, confFisicoByProd]);

    // ✅ monta a lista que será registrada no banco (somente itens com Qtd física preenchida)
    function montarSnapshotSalvarConferencia() {
        if (!confDepositoId) {
            alert("Selecione o depósito.");
            return null;
        }

        const itens: Array<{
            produto_id: ID;
            produto_nome: string;
            qtd_sistema: number;
            qtd_fisica: number;
            dif: number;
        }> = [];

        for (const r of conferenciaRows) {
            const fis = parseFisico(confFisicoByProd[r.p.id] ?? "");
            if (fis === null) continue; // só registra os preenchidos

            const qtd_sistema = clampInt(r.qtdSistema);
            const qtd_fisica = clampInt(fis);
            const dif = qtd_fisica - qtd_sistema;

            itens.push({
                produto_id: r.p.id,
                produto_nome: r.p.nome,
                qtd_sistema,
                qtd_fisica,
                dif,
            });
        }

        return itens;
    }

    function abrirSalvarConferencia() {
        const itens = montarSnapshotSalvarConferencia();
        if (!itens) return;

        if (!itens.length) {
            alert("Informe pelo menos uma Qtd física para registrar a conferência.");
            return;
        }

        // ✅ este modal usa confSaveOpen/confSaveItens (não confSalvarOpen/confSalvarItens)
        setConfSaveItens(
            itens.map((it) => ({
                produto_id: it.produto_id,
                nome: it.produto_nome,
                qtdSistema: it.qtd_sistema,
                qtdFisica: it.qtd_fisica,
                dif: it.dif,
            }))
        );
        setConfSaveOpen(true);
    }

    async function confirmarSalvarConferencia() {
        if (!confDepositoId) return alert("Selecione o depósito.");
        if (!confSaveItens.length) return alert("Nenhum item para registrar.");

        setConfSaveBusy(true);
        try {
            const payload: any = {
                action: "conferencia_criar",
                deposito_id: Number(confDepositoId),

                // filtros usados (opcional, mas útil se o backend salvar)
                fabricante_id: confFabId === "Todos" ? 0 : Number(confFabId),
                categoria_id: confCatId === "Todas" ? 0 : Number(confCatId),
                classificacao_id: confClassId === "Todas" ? 0 : Number(confClassId),
                busca: confQ.trim() || "",
                somente_saldo_positivo: confOnlyPositive ? 1 : 0,

                itens: confSaveItens.map((it) => ({
                    produto_id: Number(it.produto_id),
                    qtd_sistema: Number(it.qtdSistema),
                    qtd_fisica: Number(it.qtdFisica),
                })),
            };

            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>(payload);
            if (!r.ok) {
                alert(r.msg || "Falha ao registrar conferência.");
                return;
            }

            alert(r.msg || "Conferência registrada.");

            // fecha modal + limpa físicos
            setConfSaveOpen(false);
            setConfSaveItens([]);
            setConfFisicoByProd({});

            // atualiza lista de registros
            await refreshInit();
            await loadConferenciasRegistros();
        } finally {
            setConfSaveBusy(false);
        }
    }


    function exportarConferenciaCSV() {
        if (!confDepositoId) return alert("Selecione o depósito.");
        if (!conferenciaRows.length) return alert("Nenhum item para exportar com os filtros atuais.");

        const sep = ";";
        const depNome = depById.get(Number(confDepositoId))?.nome || String(confDepositoId);

        const header = ["Depósito", "Produto", "Fabricante", "Categoria", "Classificação", "Qtd Sistema", "Qtd Física", "Diferença", "Ajuste", "Status"];

        const lines: string[] = [];
        lines.push("\uFEFF" + header.map((h) => escapeCsvCell(h, sep)).join(sep));

        for (const r of conferenciaRows) {
            const fisTxt = confFisicoByProd[r.p.id] ?? "";
            const fis = parseFisico(fisTxt);
            const diffN = fis === null ? null : (fis - r.qtdSistema);
            const diff = diffN === null ? "" : String(diffN);

            // ✅ Ajuste igual ao diff, mas com sinal (excel-friendly)
            const ajuste = diffN === null ? "" : (diffN > 0 ? `+${diffN}` : `${diffN}`);

            const status = fis === null ? "NAO_INFORMADO" : (fis === r.qtdSistema ? "OK" : "DIVERGENTE");

            lines.push(
                [
                    depNome,
                    r.p.nome,
                    r.fabricante,
                    r.categoria,
                    r.classificacao,
                    r.qtdSistema,
                    fis === null ? "" : fis,
                    diff,
                    ajuste,
                    status,
                ]
                    .map((x) => escapeCsvCell(x, sep))
                    .join(sep)
            );
        }

        const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const safeName = `conferencia_${depNome}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`.replace(/\s+/g, "_");
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // ✅ PDF REAL (download direto) - Conferência no padrão do Estoque (logo + horizontal)
    async function exportarConferenciaPDF() {
        if (!confDepositoId) return alert("Selecione o depósito.");
        if (!conferenciaRows.length) return alert("Nenhum item para exportar com os filtros atuais.");

        // libs (lazy import para não pesar no bundle inicial)
        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;

        const LOGO_URL =
            "https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1";

        const depNome = depById.get(Number(confDepositoId))?.nome || String(confDepositoId);

        const geradoEm = new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date());

        // filtros (igual você já exibe)
        const fabTxt =
            confFabId === "Todos" ? "Todos" : (fabById.get(Number(confFabId))?.nome || String(confFabId));
        const catTxt =
            confCatId === "Todas" ? "Todas" : (catById.get(Number(confCatId))?.nome || String(confCatId));
        const clsTxt =
            confClassId === "Todas" ? "Todas" : (classById.get(Number(confClassId))?.nome || String(confClassId));

        const onlyPosTxt =
            confOnlyPositive ? "Sim" : "Não";


        // helper: busca imagem e converte para dataURL (precisa CORS liberado)
        async function toDataUrl(url: string): Promise<string | null> {
            try {
                const r = await fetch(url, { mode: "cors", cache: "no-store" });
                const b = await r.blob();
                const reader = await new Promise<string>((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onerror = () => reject(new Error("Falha ao ler logo"));
                    fr.onload = () => resolve(String(fr.result || ""));
                    fr.readAsDataURL(b);
                });
                return reader;
            } catch {
                return null; // se falhar, segue sem logo
            }
        }

        const logoDataUrl = await toDataUrl(LOGO_URL);

        // ✅ A4 landscape
        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

        const pageW = doc.internal.pageSize.getWidth();
        const marginX = 12;
        let y = 12;

        // ===== HEADER (logo + título + meta)
        if (logoDataUrl) {
            // logo na esquerda (ajuste tamanho se quiser)
            doc.addImage(logoDataUrl, "PNG", marginX, y, 55, 14);
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Conferência de Estoque", marginX + 62, y + 8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(
            `Depósito: ${depNome}   •   Gerado em: ${geradoEm}   •   Itens: ${conferenciaRows.length}`,
            marginX + 62,
            y + 14
        );

        y += 22;

        // ===== FILTROS (caixa leve como no Estoque)
        doc.setDrawColor(226, 232, 240); // #e2e8f0
        doc.setFillColor(248, 250, 252); // #f8fafc
        doc.roundedRect(marginX, y, pageW - marginX * 2, 18, 2, 2, "FD");

        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85); // slate-ish
        doc.text(`Fabricante: ${fabTxt}`, marginX + 3, y + 6);
        doc.text(`Categoria: ${catTxt}`, marginX + 3, y + 11);
        doc.text(`Classificação: ${clsTxt}`, marginX + 3, y + 16);


        y += 24;

        // ===== TOTAIS
        const totalSistema = conferenciaRows.reduce((acc, r) => acc + clampInt(r.qtdSistema), 0);

        const totalFisico = conferenciaRows.reduce((acc, r) => {
            const fisTxt = confFisicoByProd[r.p.id] ?? "";
            const fis = parseFisico(fisTxt);
            return acc + (fis === null ? 0 : clampInt(fis));
        }, 0);

        const totalDif = totalFisico - totalSistema;
        const fmtSigned = (n: number) => (n > 0 ? `+${n}` : `${n}`);

        // ===== TABELA
        // ✅ NBSP para NÃO quebrar: "Qtd Sistema" / "Qtd Física"
        const head = [[
            "Produto",
            "Fabricante",
            "Qtd\u00A0Sistema",
            "Qtd\u00A0Física",
            "Dif.",
            "Ajuste",
            "Status",
        ]];

        const body = conferenciaRows.map((r) => {
            const fisTxt = confFisicoByProd[r.p.id] ?? "";
            const fis = parseFisico(fisTxt);

            const diffN = fis === null ? null : (fis - r.qtdSistema);
            const diff = diffN === null ? "—" : String(diffN);
            const ajuste = diffN === null ? "—" : (diffN > 0 ? `+${diffN}` : `${diffN}`);
            const status = fis === null ? "—" : (diffN === 0 ? "OK" : "DIVERGENTE");

            return [
                r.p.nome,
                r.fabricante || "—",
                String(r.qtdSistema),
                fis === null ? "—" : String(fis),
                diff,
                ajuste,
                status,
            ];
        });

        autoTable(doc, {
            startY: y,
            head,
            body,
            margin: { left: marginX, right: marginX },

            // ✅ geral: evita quebra nas colunas (só o produto pode quebrar)
            styles: {
                font: "helvetica",
                fontSize: 9.3,
                cellPadding: 2.4,
                valign: "middle",
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
                overflow: "ellipsize", // ✅ padrão: NÃO quebra, corta com "..."
            },

            headStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: "bold",
                valign: "middle",
            },

            // ✅ Larguras calculadas pra A4 landscape com margem 12mm (soma = 273mm)
            columnStyles: {
                0: { cellWidth: 110, overflow: "linebreak" }, // ✅ Produto: pode quebrar
                1: { cellWidth: 55, overflow: "ellipsize" },  // Fabricante: não quebra
                2: { cellWidth: 25, halign: "right" },        // Qtd Sistema (não quebra)
                3: { cellWidth: 25, halign: "right" },        // Qtd Física (não quebra)
                4: { cellWidth: 14, halign: "right" },        // Dif.
                5: { cellWidth: 16, halign: "right" },        // Ajuste
                6: { cellWidth: 28, halign: "center" },       // Status (sem quebra)
            },

            didParseCell: (data) => {
                // ✅ Cabeçalho sem quebra (reforço)
                if (data.section === "head") {
                    data.cell.styles.overflow = "ellipsize";
                    data.cell.styles.minCellHeight = 8;
                }

                // pinta status
                if (data.section === "body" && data.column.index === 6) {
                    const txt = String(data.cell.raw || "");
                    if (txt === "OK") data.cell.styles.textColor = [22, 163, 74];
                    if (txt === "DIVERGENTE") data.cell.styles.textColor = [185, 28, 28];
                }

                // pinta ajuste
                if (data.section === "body" && data.column.index === 5) {
                    const txt = String(data.cell.raw || "");
                    if (txt.startsWith("+")) data.cell.styles.textColor = [22, 163, 74];
                    if (txt.startsWith("-")) data.cell.styles.textColor = [185, 28, 28];
                }
            },
        });

        // ===== TOTAIS (caixa no final, igual “rodapé”)
        let yAfter = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : y + 6;

        // se estiver muito embaixo, quebra página
        const pageH = doc.internal.pageSize.getHeight();
        if (yAfter + 18 > pageH - 10) {
            doc.addPage();
            yAfter = 12;
        }

        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(marginX, yAfter, doc.internal.pageSize.getWidth() - marginX * 2, 14, 2, 2, "FD");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);

        doc.text(`Total Sistema: ${totalSistema}`, marginX + 4, yAfter + 9);
        doc.text(`Total Físico: ${totalFisico}`, marginX + 70, yAfter + 9);

        // (opcional, mas ajuda muito) Dif total
        doc.text(`Dif Total: ${fmtSigned(totalDif)}`, marginX + 132, yAfter + 9);

        doc.setTextColor(0, 0, 0);


        // ===== DOWNLOAD DIRETO
        const safeName = `conferencia_${depNome}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`.replace(/\s+/g, "_");
        doc.save(`${safeName}.pdf`);
    }

    function exportarConferenciaRegistroCSV() {
        if (!confDetHead) return alert("Detalhe não carregado.");
        if (!confDetItems.length) return alert("Nenhum item no detalhe.");

        const sep = ";";
        const depNome = confDetHead.deposito_nome || depById.get(Number(confDetHead.deposito_id))?.nome || String(confDetHead.deposito_id);
        const operador = confDetHead.operador_nome || userById.get(Number(confDetHead.operador_usuario_id))?.nome || String(confDetHead.operador_usuario_id);

        const header = [
            "Conferência ID",
            "Depósito",
            "Operador",
            "Criado em",
            "Produto",
            "Código de Barras",
            "Qtd Sistema",
            "Qtd Física",
            "Dif",
        ];

        const lines: string[] = [];
        lines.push("\uFEFF" + header.map((h) => escapeCsvCell(h, sep)).join(sep));

        for (const it of confDetItems) {
            lines.push(
                [
                    confDetHead.id,
                    depNome,
                    operador,
                    fmtDateTime(confDetHead.criado_em),
                    it.produto_nome_snapshot,
                    it.codigo_barras_snapshot || "",
                    it.qtd_sistema,
                    it.qtd_fisica,
                    it.dif,
                ]
                    .map((x) => escapeCsvCell(x, sep))
                    .join(sep)
            );
        }

        const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const safeName = `conferencia_${confDetHead.id}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeName}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function exportarConferenciaRegistroPDF() {
        if (!confDetHead) return alert("Detalhe não carregado.");
        if (!confDetItems.length) return alert("Nenhum item no detalhe.");

        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;

        const LOGO_URL =
            "https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1";

        const depNome =
            confDetHead.deposito_nome || depById.get(Number(confDetHead.deposito_id))?.nome || String(confDetHead.deposito_id);

        const operador =
            confDetHead.operador_nome || userById.get(Number(confDetHead.operador_usuario_id))?.nome || String(confDetHead.operador_usuario_id);

        // helper: logo -> dataURL
        async function toDataUrl(url: string): Promise<string | null> {
            try {
                const r = await fetch(url, { mode: "cors", cache: "no-store" });
                const b = await r.blob();
                const reader = await new Promise<string>((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onerror = () => reject(new Error("Falha ao ler logo"));
                    fr.onload = () => resolve(String(fr.result || ""));
                    fr.readAsDataURL(b);
                });
                return reader;
            } catch {
                return null;
            }
        }

        const logoDataUrl = await toDataUrl(LOGO_URL);

        const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const marginX = 12;
        let y = 12;

        // header
        if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", marginX, y, 55, 14);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Conferência (Registro salvo)", marginX + 62, y + 8);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(
            `Conferência #${confDetHead.id} • Depósito: ${depNome} • Operador: ${operador}`,
            marginX + 62,
            y + 14
        );

        y += 22;

        // caixa info
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(marginX, y, pageW - marginX * 2, 16, 2, 2, "FD");

        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        doc.text(`Criado em: ${fmtDateTime(confDetHead.criado_em)}`, marginX + 3, y + 6);
        doc.text(`Itens: ${confDetHead.total_itens}`, marginX + 3, y + 11);

        const difTxt = Number(confDetHead.total_dif) > 0 ? `+${confDetHead.total_dif}` : `${confDetHead.total_dif}`;
        doc.text(`Dif total: ${difTxt}`, pageW / 2, y + 6);

        y += 22;

        // tabela
        const head = [[
            "Produto",
            "Código",
            "Qtd\u00A0Sistema",
            "Qtd\u00A0Física",
            "Dif.",
        ]];

        const body = confDetItems.map((it) => [
            it.produto_nome_snapshot,
            it.codigo_barras_snapshot || "—",
            String(it.qtd_sistema),
            String(it.qtd_fisica),
            String(it.dif),
        ]);

        // rodapé: totais
        const totalSistema = confDetItems.reduce((acc, it) => acc + clampInt(it.qtd_sistema), 0);
        const totalFisico = confDetItems.reduce((acc, it) => acc + clampInt(it.qtd_fisica), 0);
        const totalDif = totalFisico - totalSistema;
        const totalDifTxt = totalDif > 0 ? `+${totalDif}` : `${totalDif}`;

        autoTable(doc, {
            startY: y,
            head,
            body,
            margin: { left: marginX, right: marginX },
            styles: {
                font: "helvetica",
                fontSize: 9.3,
                cellPadding: 2.4,
                valign: "middle",
                lineColor: [226, 232, 240],
                lineWidth: 0.2,
                overflow: "ellipsize",
            },
            headStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: "bold",
                valign: "middle",
            },
            columnStyles: {
                0: { cellWidth: 140, overflow: "linebreak" }, // Produto
                1: { cellWidth: 55, overflow: "ellipsize" },  // Código
                2: { cellWidth: 30, halign: "right" },
                3: { cellWidth: 30, halign: "right" },
                4: { cellWidth: 18, halign: "right" },
            },
            didParseCell: (data) => {
                if (data.section !== "body") return;

                // Dif colorida
                if (data.column.index === 4) {
                    const v = Number(String(data.cell.raw || "0"));
                    if (v > 0) data.cell.styles.textColor = [22, 163, 74];
                    if (v < 0) data.cell.styles.textColor = [185, 28, 28];
                }
            },
        });

        // caixa de totais
        let yAfter = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : y + 6;
        if (yAfter + 16 > pageH - 10) {
            doc.addPage();
            yAfter = 12;
        }

        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(marginX, yAfter, pageW - marginX * 2, 14, 2, 2, "FD");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);

        doc.text(`Total Sistema: ${totalSistema}`, marginX + 4, yAfter + 9);
        doc.text(`Total Físico: ${totalFisico}`, marginX + 70, yAfter + 9);
        doc.text(`Dif Total: ${totalDifTxt}`, marginX + 132, yAfter + 9);

        doc.setTextColor(0, 0, 0);

        const safeName = `conferencia_${confDetHead.id}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
        doc.save(`${safeName}.pdf`);
    }















    // ENTRADA
    const [entradaOpen, setEntradaOpen] = useState(false);

    // ✅ NOVO: popup "Concluir" + sucesso
    const [entradaConcluirOpen, setEntradaConcluirOpen] = useState(false);
    const [entradaConcluirBusy, setEntradaConcluirBusy] = useState(false);
    const [entradaSucessoOpen, setEntradaSucessoOpen] = useState(false);

    // itens que serão confirmados no popup (snapshot)
    const [entradaConcluirItens, setEntradaConcluirItens] = useState<EntradaItem[]>([]);

    const [entradaBarcode, setEntradaBarcode] = useState("");
    const [entradaDepositoId, setEntradaDepositoId] = useState<ID>(0);
    const [entradaQtd, setEntradaQtd] = useState<string>("1");
    const [entradaCustoUnitario, setEntradaCustoUnitario] = useState<string>("");
    const [entradaFreteTotal, setEntradaFreteTotal] = useState<string>("R$ 0,00");

    // ✅ agora a observação fica visualmente abaixo da fila (mas continua sendo usada)
    const [entradaObs, setEntradaObs] = useState("");

    // NOVO: filtro fabricante + barra de pesquisa/lista de produtos filtrados (Entrada)
    const [entradaFabFiltroId, setEntradaFabFiltroId] = useState<ID | "Todos">("Todos");
    // NOVO: filtro categoria (Entrada)
    const [entradaCatFiltroId, setEntradaCatFiltroId] = useState<ID | "Todas">("Todas");
    const [entradaProdutoId, setEntradaProdutoId] = useState<ID>(0);
    const [entradaProdQuery, setEntradaProdQuery] = useState("");



    const [catQuickOpen, setCatQuickOpen] = useState(false);
    const [catQuickNome, setCatQuickNome] = useState("");
    const [fabQuickOpen, setFabQuickOpen] = useState(false);
    const [fabQuickNome, setFabQuickNome] = useState("");

    // listas em lote
    const entradaSeqRef = useRef(1);
    const saidaSeqRef = useRef(1);
    const trfSeqRef = useRef(1);

    const [entradaItens, setEntradaItens] = useState<EntradaItem[]>([]);
    const [saidaItens, setSaidaItens] = useState<SaidaItem[]>([]);
    const [trfItens, setTrfItens] = useState<TrfItem[]>([]);

    useEffect(() => {
        if (depositos.length && !entradaDepositoId) setEntradaDepositoId(depositos[0].id);
    }, [depositos, entradaDepositoId]);

    useEffect(() => {
        if (depositos.length && !confDepositoId) setConfDepositoId(depositos[0].id);

        // ✅ NÃO definir confRegDepositoId aqui.
        // Deixe 0 = "Todos" como padrão no modal de registros.
    }, [depositos, confDepositoId]);



    const entradaProdutoExistente = useMemo(() => {
        if (entradaProdutoId) {
            return produtosAtivos.find((p) => p.id === entradaProdutoId) ?? null;
        }

        const cb = entradaBarcode.trim();
        if (!cb) return null;
        return produtosAtivos.find((p) => p.codigo_barras === cb) ?? null;
    }, [entradaBarcode, entradaProdutoId, produtosAtivos]);

    // NOVO: quando digitar/scanear CB, sincroniza com a barra de pesquisa (Entrada)
    useEffect(() => {
        const cb = entradaBarcode.trim();
        if (!cb) {
            setEntradaProdutoId(0);
            // não zera query para não atrapalhar digitação do usuário
            return;
        }
        const p = produtosAtivos.find((x) => x.codigo_barras === cb) ?? null;
        if (p) {
            setEntradaProdutoId(p.id);
            setEntradaProdQuery(p.nome);
        } else {
            setEntradaProdutoId(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entradaBarcode]);



    // NOVO: saldo da Entrada (depósito destino selecionado) para exibir "disp" na lista
    const entradaSaldoByProd = useMemo(() => {
        const m = new Map<ID, number>();
        const depId = Number(entradaDepositoId);
        for (const s of saldos) {
            if (s.deposito_id !== depId) continue;
            m.set(s.produto_id, clampInt(s.quantidade));
        }
        return m;
    }, [saldos, entradaDepositoId]);

    // Entrada: filtros dinâmicos. Cada filtro mostra somente opções ainda possíveis
    // considerando os outros filtros já escolhidos.
    const entradaFiltroOptions = useMemo(() => {
        type EntradaFiltroRow = { p: Produto; d: Deposito };
        const rows: EntradaFiltroRow[] = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            rows.push({ p, d });
        }

        const depId = Number(entradaDepositoId || 0);
        const catId = entradaCatFiltroId === "Todas" ? 0 : Number(entradaCatFiltroId || 0);
        const fabId = entradaFabFiltroId === "Todos" ? 0 : Number(entradaFabFiltroId || 0);

        const passaSelecoes = (
            r: EntradaFiltroRow,
            ignorar: "deposito" | "categoria" | "fabricante"
        ) => {
            if (ignorar !== "deposito" && depId && Number(r.d.id) !== depId) return false;
            if (ignorar !== "categoria" && catId && Number(r.p.categoria_id || 0) !== catId) return false;
            if (ignorar !== "fabricante" && fabId && Number(r.p.fabricante_id || 0) !== fabId) return false;
            return true;
        };

        return {
            depositos: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "deposito"))
                    .map((r) => ({ id: r.d.id, nome: r.d.nome }))
            ),
            categorias: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "categoria"))
                    .map((r) => produtoCategoriaOption(r.p, catById))
            ),
            fabricantes: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "fabricante"))
                    .map((r) => produtoFabricanteOption(r.p, fabById))
            ),
        };
    }, [
        saldos,
        prodById,
        depById,
        entradaDepositoId,
        entradaCatFiltroId,
        entradaFabFiltroId,
        catById,
        fabById,
    ]);

    // NOVO: lista de produtos filtrada por depósito + fabricante/categoria (Entrada)
    const entradaProdutosNoDeposito = useMemo(() => {
        const depId = Number(entradaDepositoId);

        const ids = new Set<ID>();
        for (const s of saldos) if (s.deposito_id === depId) ids.add(s.produto_id);

        let list = produtosAtivos.filter((p) => ids.has(p.id));

        if (entradaCatFiltroId !== "Todas") {
            list = list.filter((p) => Number(p.categoria_id || 0) === Number(entradaCatFiltroId));
        }

        if (entradaFabFiltroId !== "Todos") {
            list = list.filter((p) => Number(p.fabricante_id || 0) === Number(entradaFabFiltroId));
        }

        return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }, [saldos, produtosAtivos, entradaDepositoId, entradaCatFiltroId, entradaFabFiltroId]);

    useEffect(() => {
        const produtoAindaExiste = entradaProdutoId && entradaProdutosNoDeposito.some((p) => p.id === entradaProdutoId);
        if (entradaProdutoId && !produtoAindaExiste) {
            setEntradaProdutoId(0);
            setEntradaProdQuery("");
            setEntradaBarcode("");
        }
    }, [entradaProdutosNoDeposito, entradaProdutoId]);

    async function fileToDataUrl(file: File): Promise<string> {
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
            reader.onload = () => resolve(String(reader.result || ""));
            reader.readAsDataURL(file);
        });
    }

    async function onNovoProdutoFoto(files?: FileList | File[] | null) {
        if (!files || !files.length) return;

        const lista = Array.from(files);
        const novas: Array<{
            temp_id: string;
            foto_url: string;
            legenda: string;
            is_principal: 0 | 1;
            ordem: number;
        }> = [];

        for (const file of lista) {
            const url = await fileToDataUrl(file);
            novas.push({
                temp_id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                foto_url: url,
                legenda: "",
                is_principal: 0,
                ordem: 0,
            });
        }

        setNovoFotos((prev) => {
            const merged = [...prev, ...novas].map((f, idx) => ({
                ...f,
                ordem: idx + 1,
            }));

            if (!merged.some((f) => Number(f.is_principal) === 1) && merged.length) {
                merged[0].is_principal = 1;
            }

            return merged;
        });

        if (!novoFoto && novas[0]?.foto_url) {
            setNovoFoto(novas[0].foto_url);
        }
    }

    async function criarNovoProdutoAvancado() {
        const cb = novoCodigoBarras.trim();
        const nome = novoNome.trim();

        if (!cb) return alert("Informe o código de barras.");
        if (!nome) return alert("Informe o nome do produto.");

        if (produtos.some((p) => String(p.codigo_barras).trim() === cb)) {
            return alert("Já existe um produto com este código de barras.");
        }

        const depId = Number(novoDepositoId || 0);
        if (!depId) return alert("Selecione o depósito inicial do produto.");

        const payload: any = {
            action: "produto_criar",
            codigo_barras: cb,
            nome,
            valor: Number.isFinite(Number(novoValor)) ? Number(novoValor) : 0,
            preco_custo: Number.isFinite(Number(novoPrecoCusto)) ? Number(novoPrecoCusto) : 0,
            minimo: clampInt(novoMin),
            maximo: clampInt(novoMax),

            // ✅ NOVO: depósito inicial
            deposito_id: depId,

            categoria_id: novoCategoriaId ? Number(novoCategoriaId) : 0,
            fabricante_id: novoFabricanteId ? Number(novoFabricanteId) : 0,
            classificacao_id: novoClassificacaoId ? Number(novoClassificacaoId) : 0,
            foto_url: (novoFotos.find((f) => Number(f.is_principal) === 1)?.foto_url || novoFoto || ""),
            fotos: novoFotos.map((f, idx) => ({
                foto_url: f.foto_url,
                legenda: f.legenda || "",
                ordem: idx + 1,
                is_principal: Number(f.is_principal) === 1 ? 1 : 0,
                nova: 1,
            })),
        };


        const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>(payload);
        if (!r.ok) return alert(r.msg || "Falha ao criar produto.");

        alert("Produto criado com sucesso.");
        setNovoCodigoBarras("");
        setNovoNome("");
        setNovoValor(0);
        setNovoPrecoCusto(0);
        setNovoMin(0);
        setNovoMax(0);
        setNovoFoto("");
        setNovoFotos([]);
        setNovoCategoriaId(0);
        setNovoFabricanteId(0);
        setNovoClassificacaoId(0);
        setNovoDepositoId(depositos[0]?.id || 0);


        await refreshInit();
    }





    function resetEntradaForm() {
        setEntradaBarcode("");
        setEntradaProdutoId(0);
        setEntradaProdQuery("");
        setEntradaFabFiltroId("Todos");
        setEntradaCatFiltroId("Todas");
        setEntradaQtd("1");
        setEntradaCustoUnitario("");
        setEntradaFreteTotal("R$ 0,00");
        setEntradaObs("");
    }


    // ✅ NOVO: reset só do item (mantém depósito/filtros/observação para montar lote)
    function resetEntradaItemFieldsOnly() {
        setEntradaBarcode("");
        setEntradaProdutoId(0);
        setEntradaProdQuery("");
        setEntradaQtd("1");
        setEntradaCustoUnitario("");
        // O frete é único para toda a entrada e permanece ao adicionar novos itens.
    }

    // ✅ NOVO: cancelar fecha e limpa tudo
    function cancelarEntrada() {
        setEntradaItens([]);
        resetEntradaForm();
        setEntradaOpen(false);
    }

    function buildEntradaPayloadFromForm(): Omit<EntradaItem, "id"> | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const deposito_id = Number(entradaDepositoId);
        const quantidade = clampInt(entradaQtd || "0");
        const custoBaseUnitario = parseBRLToNumber(entradaCustoUnitario);
        // O frete é rateado somente ao concluir a entrada completa.
        const freteTotal = 0;
        const freteUnitario = 0;
        const custoUnitario = roundCost(custoBaseUnitario);
        const custoTotal = roundCost(custoUnitario * quantidade);
        const produtoSelecionado = entradaProdutoExistente;
        const codigo_barras = String(produtoSelecionado?.codigo_barras || entradaBarcode).trim();

        if (!deposito_id) return alert("Selecione o depósito."), null;
        if (!produtoSelecionado) return alert("Selecione um produto."), null;
        if (!codigo_barras) return alert("O produto selecionado não possui código de barras."), null;
        if (quantidade <= 0) return alert("Quantidade inválida."), null;
        if (custoBaseUnitario <= 0) return alert("Informe o preço de custo unitário desta entrada."), null;

        const payload: any = {
            action: "entrada",
            deposito_id,
            quantidade,
            codigo_barras,
            custo_unitario: custoBaseUnitario,
            frete_total: freteTotal,
            observacao: entradaObs.trim() || undefined,
        };

        const nomeProduto = produtoSelecionado.nome || "";
        const resumo = `${nomeProduto} — CB ${codigo_barras} — qtd ${quantidade} — custo final ${moneyBRL(custoUnitario)} — Dep ${depById.get(deposito_id)?.nome || deposito_id}`;

        return {
            payload,
            resumo,
            nome: nomeProduto,
            qtd: quantidade,
            custoBaseUnitario,
            freteTotal,
            freteUnitario,
            custoUnitario,
            custoTotal,
        };
    }

    function montarPayloadEntradaLote(items: EntradaItem[]) {
        const freteTotal = parseBRLToNumber(entradaFreteTotal);
        const totalQuantidade = items.reduce((total, item) => total + clampInt(item.qtd), 0);

        if (freteTotal < 0) {
            alert("O valor do frete não pode ser negativo.");
            return null;
        }
        if (freteTotal > 0 && totalQuantidade <= 0) {
            alert("Adicione itens com quantidade válida para ratear o frete.");
            return null;
        }

        return {
            action: "entrada_lote",
            deposito_id: Number(entradaDepositoId),
            frete_total: freteTotal,
            observacao: entradaObs.trim() || undefined,
            itens: items.map((item) => ({
                codigo_barras: String(item.payload.codigo_barras || "").trim(),
                quantidade: clampInt(item.qtd),
                custo_unitario: roundCost(item.custoBaseUnitario),
            })),
        };
    }

    async function applyEntradaSingle() {
        const built = buildEntradaPayloadFromForm();
        if (!built) return;

        const items = ratearFreteEntrada(
            [{ id: entradaSeqRef.current++, ...built }],
            parseBRLToNumber(entradaFreteTotal)
        );
        const payload = montarPayloadEntradaLote(items);
        if (!payload) return;

        const r = await apiPost<{ ok: boolean; msg?: string }>(payload);
        if (!r.ok) return alert(r.msg || "Falha na entrada.");

        resetEntradaForm();
        setEntradaOpen(false);
        await refreshInit();
        setTab("ESTOQUE");
    }

    function addEntradaItemToList() {
        const built = buildEntradaPayloadFromForm();
        if (!built) return;

        const codigoBarras = String(built.payload.codigo_barras || "").trim();

        setEntradaItens((prev) => {
            const index = prev.findIndex(
                (item) => String(item.payload.codigo_barras || "").trim() === codigoBarras
            );

            if (index < 0) {
                return [...prev, { id: entradaSeqRef.current++, ...built }];
            }

            const atual = prev[index];
            const qtdAtual = clampInt(atual.qtd);
            const qtdNova = clampInt(built.qtd);
            const qtdTotal = qtdAtual + qtdNova;

            // Mantém uma única linha por produto. Caso o mesmo produto seja
            // adicionado novamente com outro custo-base, usa a média ponderada
            // para preservar o valor total informado nos dois lançamentos.
            const valorBaseTotal =
                roundCost(atual.custoBaseUnitario * qtdAtual) +
                roundCost(built.custoBaseUnitario * qtdNova);
            const custoBasePonderado = qtdTotal > 0
                ? roundCost(valorBaseTotal / qtdTotal)
                : roundCost(built.custoBaseUnitario);

            const atualizado: EntradaItem = {
                ...atual,
                nome: built.nome || atual.nome,
                qtd: qtdTotal,
                custoBaseUnitario: custoBasePonderado,
                freteTotal: 0,
                freteUnitario: 0,
                custoUnitario: custoBasePonderado,
                custoTotal: roundCost(custoBasePonderado * qtdTotal),
                resumo: `${built.nome || atual.nome} — qtd ${qtdTotal} — base ${moneyBRL(custoBasePonderado)}`,
                payload: {
                    ...atual.payload,
                    ...built.payload,
                    quantidade: qtdTotal,
                    custo_unitario: custoBasePonderado,
                    frete_total: 0,
                },
            };

            return prev.map((item, itemIndex) =>
                itemIndex === index ? atualizado : item
            );
        });

        // Mantém depósito, filtros, observação e o frete global.
        resetEntradaItemFieldsOnly();
    }

    async function applyEntradaLote() {
        const snap = montarSnapshotConcluirEntrada();
        if (!snap || !snap.length) {
            alert("Adicione pelo menos um item para entrada.");
            return;
        }

        const payload = montarPayloadEntradaLote(snap);
        if (!payload) return;

        const r = await apiPost<{ ok: boolean; msg?: string }>(payload);
        if (!r.ok) return alert(r.msg || "Falha na entrada.");

        resetEntradaForm();
        setEntradaItens([]);
        setEntradaOpen(false);
        await refreshInit();
        setTab("ESTOQUE");
    }

    function montarSnapshotConcluirEntrada(): EntradaItem[] | null {
        const obs = entradaObs.trim();

        const base: EntradaItem[] = entradaItens.map((it) => ({
            ...it,
            payload: obs ? { ...it.payload, observacao: obs } : { ...it.payload },
        }));

        if (entradaBarcode.trim() || entradaProdutoId) {
            const built = buildEntradaPayloadFromForm();
            if (!built) return null;
            base.push({ id: entradaSeqRef.current++, ...built });
        }

        return ratearFreteEntrada(base, parseBRLToNumber(entradaFreteTotal));
    }

    function abrirConcluirEntrada() {
        const snap = montarSnapshotConcluirEntrada();
        if (!snap) return;
        if (!snap.length) {
            alert("Adicione pelo menos um item para entrada.");
            return;
        }

        setEntradaConcluirItens(snap);
        setEntradaConcluirOpen(true);
    }

    async function confirmarEntradaDoSnapshot() {
        if (!entradaConcluirItens.length) return;

        const payload = montarPayloadEntradaLote(entradaConcluirItens);
        if (!payload) return;

        setEntradaConcluirBusy(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>(payload);
            if (!r.ok) {
                alert(r.msg || "Falha ao registrar a entrada.");
                return;
            }

            setEntradaConcluirOpen(false);
            setEntradaItens([]);
            resetEntradaForm();
            setEntradaOpen(false);

            await refreshInit();
            setTab("ESTOQUE");
            setEntradaSucessoOpen(true);
        } finally {
            setEntradaConcluirBusy(false);
        }
    }


    async function criarCategoriaQuick() {
        const nome = catQuickNome.trim();
        if (!nome) return alert("Informe o nome da categoria.");
        const r = await apiPost<{ ok: boolean; id?: number; msg?: string }>({
            action: "categoria_criar",
            nome,
        });
        if (!r.ok) return alert(r.msg || "Falha ao criar categoria.");
        setCatQuickNome("");
        setCatQuickOpen(false);
        await refreshInit();
        if (r.id) setNovoCategoriaId(Number(r.id));
    }

    async function criarFabricanteQuick() {
        const nome = fabQuickNome.trim();
        if (!nome) return alert("Informe o nome do fabricante.");
        const r = await apiPost<{ ok: boolean; id?: number; msg?: string }>({
            action: "fabricante_criar",
            nome,
        });
        if (!r.ok) return alert(r.msg || "Falha ao criar fabricante.");
        setFabQuickNome("");
        setFabQuickOpen(false);
        await refreshInit();
        if (r.id) setNovoFabricanteId(Number(r.id));
    }

    // ======= PRODUTO EDITOR =======

    async function carregarEntradasCustoProduto(produtoId: ID, _codigoBarras = "") {
        setProdEntradasCustoLoading(true);
        setProdEntradasCustoErr("");
        setProdEntradasCusto([]);
        setProdCustoDetalhe(null);

        try {
            const resp = await apiGet<CustoProdutoDetalheResp>({
                action: "custo_produto_detalhe",
                produto_id: produtoId,
                _ts: Date.now(),
            });

            if (!resp.ok) {
                throw new Error(resp.msg || "Falha ao carregar os custos do produto.");
            }

            const entradas = (resp.entradas || []).sort(
                (a, b) =>
                    new Date(b.criado_em).getTime() -
                    new Date(a.criado_em).getTime()
            );

            setProdCustoDetalhe(resp);
            setProdEntradasCusto(entradas);

            // O indicador "Preço de custo atual" deve refletir o custo médio móvel
            // retornado no resumo do produto, e não apenas o custo da última entrada.
            const precoCustoAtual = Number(resp.resumo?.custo_medio ?? 0) || 0;
            setEditPrecoCusto(
                maskBRLFromDigits(
                    String(Math.round(Math.max(0, precoCustoAtual) * 100))
                )
            );
        } catch (e: any) {
            setProdEntradasCustoErr(
                e?.message || "Erro ao carregar os custos do produto."
            );
        } finally {
            setProdEntradasCustoLoading(false);
        }
    }

    function calcularResumoAjusteCusto() {
        const produto = prodEditId ? prodById.get(prodEditId) : null;
        const lotesDisponiveis = (prodCustoDetalhe?.lotes || []).filter(
            (lote) => clampInt(lote.quantidade_atual) > 0
        );
        const lote = lotesDisponiveis.find(
            (item) => Number(item.id) === Number(custoAjusteLoteId)
        );

        const custoBase = parseBRLToNumber(custoAjusteNovo);
        const freteTotal = parseBRLToNumber(custoAjusteFreteTotal);
        const quantidadeRateio = custoAjusteTipo === "LOTE"
            ? clampInt(lote?.quantidade_inicial)
            : clampInt(prodCustoDetalhe?.resumo?.quantidade_saldo_total);
        const freteUnitario = quantidadeRateio > 0 ? freteTotal / quantidadeRateio : 0;
        const custoFinal = custoBase + freteUnitario;
        const quantidadeAfetada = custoAjusteTipo === "LOTE"
            ? clampInt(lote?.quantidade_atual)
            : quantidadeRateio;
        const custoAnterior = custoAjusteTipo === "LOTE"
            ? Number(lote?.custo_unitario || 0)
            : Number(produto?.preco_custo || 0);
        const valorAnterior = custoAnterior * quantidadeAfetada;
        const valorNovo = custoFinal * quantidadeAfetada;

        return {
            produto,
            lote,
            custoBase,
            freteTotal,
            quantidadeRateio,
            freteUnitario,
            custoFinal,
            quantidadeAfetada,
            custoAnterior,
            valorAnterior,
            valorNovo,
            diferenca: valorNovo - valorAnterior,
        };
    }

    function abrirAjusteCusto(tipo: CustoAjusteTipo = "NOVO_PRECO", loteId: ID = 0) {
        const p = prodEditId ? prodById.get(prodEditId) : null;
        if (!p) return;

        const lotesDisponiveis = (prodCustoDetalhe?.lotes || []).filter(
            (lote) => clampInt(lote.quantidade_atual) > 0
        );
        const loteSelecionado = loteId
            ? lotesDisponiveis.find((lote) => Number(lote.id) === Number(loteId))
            : lotesDisponiveis[0];

        let custoBase = Number(p.preco_custo) || 0;
        let freteTotal = 0;

        if (tipo === "LOTE" && loteSelecionado) {
            const freteUnit = Number(loteSelecionado.frete_unitario) || 0;
            custoBase = Number(loteSelecionado.custo_base_unitario);
            if (!Number.isFinite(custoBase)) {
                custoBase = Math.max(0, (Number(loteSelecionado.custo_unitario) || 0) - freteUnit);
            }
            freteTotal = Number(loteSelecionado.frete_total) || 0;
        }

        setCustoAjusteTipo(tipo);
        setCustoAjusteLoteId(loteSelecionado?.id || 0);
        setCustoAjusteNovo(
            maskBRLFromDigits(String(Math.round(Math.max(0, custoBase) * 100)))
        );
        setCustoAjusteFreteTotal(
            maskBRLFromDigits(String(Math.round(Math.max(0, freteTotal) * 100)))
        );
        setCustoAjusteObservacao("");
        setCustoAjusteConfirmOpen(false);
        setCustoAjusteOpen(true);
    }

    function prepararConfirmacaoAjusteCusto() {
        const resumo = calcularResumoAjusteCusto();

        if (!Number.isFinite(resumo.custoBase) || resumo.custoBase < 0) {
            return alert("Informe um preço de custo válido.");
        }
        if (custoAjusteTipo === "LOTE" && !resumo.lote) {
            return alert("Selecione o lote que será corrigido.");
        }
        if (resumo.freteTotal > 0 && resumo.quantidadeRateio <= 0) {
            return alert("Não há quantidade disponível para dividir o valor do frete.");
        }

        setCustoAjusteConfirmOpen(true);
    }

    async function salvarAjusteCusto() {
        if (!prodEditId) return;

        const resumo = calcularResumoAjusteCusto();
        if (custoAjusteTipo === "LOTE" && !resumo.lote) {
            return alert("Selecione o lote que será corrigido.");
        }

        setCustoAjusteBusy(true);
        try {
            const resp = await apiPost<{
                ok: boolean;
                msg?: string;
                preco_custo_referencia?: number;
            }>({
                action: "custo_ajustar",
                operacao_uuid: createOperationUuid(),
                produto_id: prodEditId,
                tipo: custoAjusteTipo,
                lote_id: custoAjusteTipo === "LOTE" ? custoAjusteLoteId : null,
                novo_custo_base: resumo.custoBase,
                frete_total: resumo.freteTotal,
                observacao: custoAjusteObservacao.trim() || null,
            });

            if (!resp.ok) {
                return alert(resp.msg || "Falha ao registrar o ajuste de custo.");
            }

            setCustoAjusteConfirmOpen(false);
            setCustoAjusteOpen(false);
            await Promise.all([
                carregarEntradasCustoProduto(prodEditId),
                refreshInit(),
            ]);
            alert(resp.msg || "Preço de custo atualizado.");
        } catch (e: any) {
            alert(e?.message || "Erro ao registrar o ajuste de custo.");
        } finally {
            setCustoAjusteBusy(false);
        }
    }

    function openProdutoEditor(produtoId: ID, depositoId?: ID) {
        const p = prodById.get(produtoId);
        if (!p) return;

        setProdEditId(produtoId);
        setProdEditTab("DADOS");
        void carregarEntradasCustoProduto(produtoId, p.codigo_barras || "");

        setEditNome(p.nome || "");
        setEditDescricao((p as any).descricao || ""); // ✅ NOVO

        const valorNum = Number(p.valor) || 0;
        const valorDigits = String(Math.round(Math.max(0, valorNum) * 100));
        setEditValor(maskBRLFromDigits(valorDigits));

        const precoCustoNum = Number(p.preco_custo) || 0;
        const precoCustoDigits = String(Math.round(Math.max(0, precoCustoNum) * 100));
        setEditPrecoCusto(maskBRLFromDigits(precoCustoDigits));

        // mantém padrão do produto (não quebra legado)
        setEditMin(clampInt(p.minimo));
        setEditMax(clampInt((p as any).maximo ?? 0));

        setEditCatId(Number(p.categoria_id || 0));
        setEditFabId(Number(p.fabricante_id || 0));
        setEditClassId(Number(p.classificacao_id || 0));
        setEditAtivo(Number(p.ativo) === 1 ? 1 : 0);
        setEditNovoDepositoId(0);

        setEditFotosExistentes(getProdutoFotos(p));
        setEditFotosNovas([]);
        setEditFotoNova("");

        // ✅ seleciona depósito vindo da linha do estoque (ou fallback)
        const depId = Number(depositoId || 0) || Number(depositos[0]?.id || 0);
        setEditMinMaxDepId(depId);

        // ✅ carrega min/max do est_saldo daquele depósito
        const s = depId ? saldosMap.get(`${produtoId}::${depId}`) : undefined;
        setEditMinDep(clampInt(s?.minimo ?? 0));
        setEditMaxDep(clampInt(s?.maximo ?? 0));

        setProdEditOpen(true);
    }


    async function adicionarProdutoAoDeposito() {
        if (!prodEditId || !editNovoDepositoId) {
            return alert("Selecione o depósito que receberá o produto.");
        }

        setProdutoDepositoBusy(true);
        try {
            const resp = await apiPost<{ ok: boolean; msg?: string }>({
                action: "produto_deposito_adicionar",
                produto_id: prodEditId,
                deposito_id: editNovoDepositoId,
            });
            if (!resp.ok) return alert(resp.msg || "Falha ao adicionar o produto ao depósito.");

            const novoDep = editNovoDepositoId;
            setEditNovoDepositoId(0);
            await refreshInit();
            setEditMinMaxDepId(novoDep);
            setEditMinDep(clampInt(prodById.get(prodEditId)?.minimo));
            setEditMaxDep(clampInt(prodById.get(prodEditId)?.maximo));
            alert(resp.msg || "Produto adicionado ao depósito.");
        } catch (e: any) {
            alert(e?.message || "Erro ao adicionar o produto ao depósito.");
        } finally {
            setProdutoDepositoBusy(false);
        }
    }

    async function removerProdutoDoDeposito(depositoId: ID, depositoNome: string) {
        if (!prodEditId) return;
        if (!window.confirm(`Remover este produto do depósito ${depositoNome}?`)) return;

        setProdutoDepositoBusy(true);
        try {
            const resp = await apiPost<{ ok: boolean; msg?: string }>({
                action: "produto_deposito_remover",
                produto_id: prodEditId,
                deposito_id: depositoId,
            });
            if (!resp.ok) return alert(resp.msg || "Falha ao remover o produto do depósito.");

            if (Number(editMinMaxDepId) === Number(depositoId)) {
                setEditMinMaxDepId(0);
                setEditMinDep(0);
                setEditMaxDep(0);
            }
            await refreshInit();
            alert(resp.msg || "Produto removido do depósito.");
        } catch (e: any) {
            alert(e?.message || "Erro ao remover o produto do depósito.");
        } finally {
            setProdutoDepositoBusy(false);
        }
    }

    async function onProdutoFotoNova(files?: FileList | File[] | null) {
        if (!files || !files.length) return;

        const lista = Array.from(files);
        const novas: Array<{
            temp_id: string;
            foto_url: string;
            legenda: string;
            is_principal: 0 | 1;
            ordem: number;
        }> = [];

        for (const file of lista) {
            const url = await fileToDataUrl(file);
            novas.push({
                temp_id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                foto_url: url,
                legenda: "",
                is_principal: 0,
                ordem: 0,
            });
        }

        setEditFotosNovas((prev) => {
            const hadPrincipal =
                prev.some((f) => Number(f.is_principal) === 1) ||
                editFotosExistentes.some((f) => Number(f.is_principal || 0) === 1);

            const merged = [...prev, ...novas].map((f, idx) => ({
                ...f,
                ordem: idx + 1,
            }));

            if (!hadPrincipal && merged.length) {
                merged[0].is_principal = 1;
            }

            return merged;
        });
    }

    function marcarFotoPrincipalExistente(fotoId?: ID) {
        if (!fotoId) return;

        setEditFotosExistentes((prev) =>
            prev.map((f) => ({
                ...f,
                is_principal: Number(f.id) === Number(fotoId) ? 1 : 0,
            }))
        );

        setEditFotosNovas((prev) =>
            prev.map((f) => ({
                ...f,
                is_principal: 0,
            }))
        );
    }

    function marcarFotoPrincipalNova(tempId: string) {
        setEditFotosExistentes((prev) =>
            prev.map((f) => ({
                ...f,
                is_principal: 0,
            }))
        );

        setEditFotosNovas((prev) =>
            prev.map((f) => ({
                ...f,
                is_principal: f.temp_id === tempId ? 1 : 0,
            }))
        );
    }

    function removerFotoExistente(fotoId?: ID) {
        if (!fotoId) return;

        setEditFotosExistentes((prev) => {
            const next = prev.filter((f) => Number(f.id) !== Number(fotoId));

            const hasPrincipal = next.some((f) => Number(f.is_principal || 0) === 1);
            if (!hasPrincipal && next.length) next[0].is_principal = 1;

            return next.map((f, idx) => ({
                ...f,
                ordem: idx + 1,
            }));
        });
    }

    function removerFotoNova(tempId: string) {
        setEditFotosNovas((prev) => {
            const next = prev.filter((f) => f.temp_id !== tempId);
            const hasPrincipal = next.some((f) => Number(f.is_principal) === 1);

            if (!hasPrincipal && next.length) next[0].is_principal = 1;

            return next.map((f, idx) => ({
                ...f,
                ordem: idx + 1,
            }));
        });
    }

    async function salvarCadastroProduto() {
        if (!prodEditId) return;
        if (!editNome.trim()) return alert("Nome obrigatório.");

        setProdBusy(true);
        try {
            const payload: any = {
                action: "produto_atualizar",
                produto_id: prodEditId,
                nome: editNome.trim(),
                descricao: editDescricao.trim() || "",
                valor: parseBRLToNumber(editValor),
                minimo: clampInt(editMin),
                maximo: clampInt(editMax),
                categoria_id: editCatId ? Number(editCatId) : 0,
                fabricante_id: editFabId ? Number(editFabId) : 0,
                classificacao_id: editClassId ? Number(editClassId) : 0,
                ativo: editAtivo,

                // ✅ nova estrutura de galeria
                fotos: [
                    ...editFotosExistentes.map((f, idx) => ({
                        id: f.id,
                        arquivo: f.arquivo || f.foto_url || null,
                        legenda: f.legenda || "",
                        ordem: idx + 1,
                        is_principal: Number(f.is_principal || 0) === 1 ? 1 : 0,
                        removida: 0,
                    })),
                    ...editFotosNovas.map((f, idx) => ({
                        foto_url: f.foto_url,
                        legenda: f.legenda || "",
                        ordem: editFotosExistentes.length + idx + 1,
                        is_principal: Number(f.is_principal) === 1 ? 1 : 0,
                        nova: 1,
                    })),
                ],
            };

            // fallback legado: mantém compatibilidade com backend antigo
            const principalExistente =
                editFotosExistentes.find((f) => Number(f.is_principal || 0) === 1) || editFotosExistentes[0];

            const principalNova =
                editFotosNovas.find((f) => Number(f.is_principal) === 1) || editFotosNovas[0];

            if (principalNova?.foto_url) {
                payload.foto_url = principalNova.foto_url;
            } else if (principalExistente) {
                payload.foto_url = principalExistente.arquivo || principalExistente.foto_url || "";
            } else if (editFotoNova) {
                payload.foto_url = editFotoNova;
            }

            const r = await apiPost<{ ok: boolean; msg?: string }>(payload);
            if (!r.ok) return alert(r.msg || "Falha ao salvar cadastro.");

            await refreshInit();
            alert("Produto atualizado.");
        } finally {
            setProdBusy(false);
        }
    }

    async function salvarMinMaxDoDeposito() {
        if (!prodEditId) return alert("Produto inválido.");
        if (!editMinMaxDepId) return alert("Selecione o depósito.");

        setMinMaxBusy(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "saldo_minmax_setar", // ✅ backend precisa aceitar isso
                produto_id: Number(prodEditId),
                deposito_id: Number(editMinMaxDepId),
                minimo: clampInt(editMinDep),
                maximo: clampInt(editMaxDep),
            });

            if (!r.ok) return alert(r.msg || "Falha ao salvar mín/máx do depósito.");

            await refreshInit();
            alert("Mín/Máx do depósito atualizado.");
        } finally {
            setMinMaxBusy(false);
        }
    }


    // =========================
    // AJUSTE MANUAL (AVANÇADO) - SALDOS POR DEPÓSITO
    // =========================
    const [ajusteProdId, setAjusteProdId] = useState<ID>(0);
    const [ajusteProdQuery, setAjusteProdQuery] = useState("");
    const [ajusteSaldos, setAjusteSaldos] = useState<Record<number, number>>({});
    const [ajusteBusy, setAjusteBusy] = useState(false);

    // quando escolher o produto, carrega os saldos atuais para edição
    useEffect(() => {
        if (!ajusteProdId) {
            setAjusteSaldos({});
            return;
        }

        const m: Record<number, number> = {};
        for (const d of depositos) {
            const s = saldosMap.get(`${ajusteProdId}::${d.id}`);
            m[d.id] = clampInt(s?.quantidade ?? 0);
        }
        setAjusteSaldos(m);

        const p = prodById.get(ajusteProdId);
        if (p && (!ajusteProdQuery.trim() || ajusteProdQuery.trim() !== p.nome)) {
            setAjusteProdQuery(p.nome);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ajusteProdId, depositos, saldosMap, prodById]);

    async function salvarAjusteSaldosAvancado() {
        if (!ajusteProdId) return alert("Selecione um produto.");

        setAjusteBusy(true);
        try {
            for (const d of depositos) {
                const novo = clampInt(ajusteSaldos[d.id] ?? 0);
                const atual = clampInt(saldosMap.get(`${ajusteProdId}::${d.id}`)?.quantidade ?? 0);
                if (novo === atual) continue;

                const r = await apiPost<{ ok: boolean; msg?: string }>({
                    action: "saldo_setar",
                    produto_id: ajusteProdId,
                    deposito_id: d.id,
                    quantidade: novo,
                });

                if (!r.ok) {
                    alert(r.msg || `Falha ao salvar saldo em ${d.nome}`);
                    return;
                }
            }

            await refreshInit();
            alert("Saldos atualizados.");
        } finally {
            setAjusteBusy(false);
        }
    }




    /* =========================
       SAÍDA
    ========================= */

    const [saidaOpen, setSaidaOpen] = useState(false);
    const [saidaScanOpen, setSaidaScanOpen] = useState(false);

    // ✅ agora "saidaConfirmOpen" vira o popup de CONCLUIR (com lista + botão confirmar)
    const [saidaConfirmOpen, setSaidaConfirmOpen] = useState(false);
    const [saidaConfirmBusy, setSaidaConfirmBusy] = useState(false);
    const [saidaConfirmItens, setSaidaConfirmItens] = useState<
        Array<{ payload: any; nome: string; qtd: number }>
    >([]);

    const [saidaSolicitanteId, setSaidaSolicitanteId] = useState<ID>(0);
    const [saidaDepositoId, setSaidaDepositoId] = useState<ID>(0);
    const [saidaDestinoDepositoId, setSaidaDestinoDepositoId] = useState<ID>(0);

    const [saidaBarcode, setSaidaBarcode] = useState("");
    const [saidaCategoriaId, setSaidaCategoriaId] = useState<ID | "Todas">("Todas");

    const [saidaProdutoId, setSaidaProdutoId] = useState<ID>(0);
    const [saidaProdQuery, setSaidaProdQuery] = useState("");

    const [saidaQtd, setSaidaQtd] = useState<string>("1");

    // ✅ observação fica abaixo e pode valer para o lote (como Entrada)
    const [saidaObs, setSaidaObs] = useState("");

    // ✅ monta snapshot (fila + item do formulário se existir) e abre popup "Concluir"
    function montarSnapshotConcluirSaida() {
        const obs = saidaObs.trim();

        const base = saidaItens.map((it) => {
            const pid = Number(it.payload?.produto_id || 0);
            const qtd = clampInt(it.payload?.quantidade);
            const nome = prodById.get(pid)?.nome || `Produto ${pid || "—"}`;
            const payload = obs ? { ...it.payload, observacao: obs } : { ...it.payload };
            return { payload, nome, qtd };
        });

        // se existe um item “no formulário”, inclui no snapshot também
        if (saidaProdutoId) {
            const built = buildSaidaPayloadFromForm();
            if (!built) return null;

            const pid = Number(built.payload?.produto_id || 0);
            const qtd = clampInt(built.payload?.quantidade);
            const nome = prodById.get(pid)?.nome || `Produto ${pid || "—"}`;
            const payload = obs ? { ...built.payload, observacao: obs } : { ...built.payload };

            base.push({ payload, nome, qtd });
        }

        return base;
    }

    function abrirConcluirSaida() {
        const snap = montarSnapshotConcluirSaida();
        if (!snap) return;
        if (!snap.length) {
            alert("Adicione pelo menos um item para saída.");
            return;
        }
        setSaidaConfirmItens(snap);
        setSaidaConfirmOpen(true);
    }

    async function confirmarSaidaDoSnapshot() {
        if (!saidaConfirmItens.length) return;

        setSaidaConfirmBusy(true);
        try {
            for (const it of saidaConfirmItens) {
                const r = await apiPost<{ ok: boolean; msg?: string }>(it.payload);
                if (!r.ok) {
                    alert(`Erro na saída de "${it.nome}": ${r.msg || "Falha."}`);
                    return;
                }
            }

            // ✅ sucesso
            setSaidaConfirmOpen(false);
            setSaidaConfirmItens([]);

            resetSaidaAll();
            setSaidaOpen(false);

            await refreshInit();
            setTab("ESTOQUE");
        } finally {
            setSaidaConfirmBusy(false);
        }
    }


    // NOVO: popup de quantidade após SCAN (Saída)
    const [saidaScanQtyOpen, setSaidaScanQtyOpen] = useState(false);
    const [saidaScanProduto, setSaidaScanProduto] = useState<Produto | null>(null);
    const [saidaScanDisponivel, setSaidaScanDisponivel] = useState<number>(0);

    const saidaSaldoByProd = useMemo(() => {
        const m = new Map<ID, number>();
        const depId = Number(saidaDepositoId);
        for (const s of saldos) {
            if (s.deposito_id !== depId) continue;
            m.set(s.produto_id, clampInt(s.quantidade));
        }
        return m;
    }, [saldos, saidaDepositoId]);

    const saidaFiltroOptions = useMemo(() => {
        type SaidaFiltroRow = { p: Produto; d: Deposito; qtd: number };
        const rows: SaidaFiltroRow[] = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            const qtd = clampInt(s.quantidade);
            if (qtd <= 0) continue;

            rows.push({ p, d, qtd });
        }

        const depId = Number(saidaDepositoId || 0);
        const catId = saidaCategoriaId === "Todas" ? 0 : Number(saidaCategoriaId || 0);

        const passaSelecoes = (r: SaidaFiltroRow, ignorar: "deposito" | "categoria") => {
            if (ignorar !== "deposito" && depId && Number(r.d.id) !== depId) return false;
            if (ignorar !== "categoria" && catId && Number(r.p.categoria_id || 0) !== catId) return false;
            return true;
        };

        return {
            depositos: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "deposito"))
                    .map((r) => ({ id: r.d.id, nome: r.d.nome }))
            ),
            categorias: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "categoria"))
                    .map((r) => produtoCategoriaOption(r.p, catById))
            ),
        };
    }, [saldos, prodById, depById, saidaDepositoId, saidaCategoriaId, catById]);

    const saidaProdutosNoDeposito = useMemo(() => {
        const depId = Number(saidaDepositoId);
        const ids = new Set<ID>();
        for (const s of saldos) {
            if (s.deposito_id === depId && clampInt(s.quantidade) > 0) ids.add(s.produto_id);
        }

        let list = produtosAtivos.filter((p) => ids.has(p.id));

        if (saidaCategoriaId !== "Todas") {
            list = list.filter((p) => Number(p.categoria_id || 0) === Number(saidaCategoriaId));
        }

        return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }, [saldos, produtosAtivos, saidaDepositoId, saidaCategoriaId]);

    useEffect(() => {
        const produtoAindaExiste = saidaProdutoId && saidaProdutosNoDeposito.some((p) => p.id === saidaProdutoId);
        if (saidaProdutoId && !produtoAindaExiste) {
            setSaidaProdutoId(0);
            setSaidaProdQuery("");
            setSaidaBarcode("");
        }
    }, [saidaProdutosNoDeposito, saidaProdutoId]);

    function onSaidaBarcodePick(code: string) {
        // mantém para digitação manual no campo (sem popup)
        setSaidaBarcode(code);
        const p = produtosAtivos.find((x) => x.codigo_barras === code);
        if (p) {
            setSaidaProdutoId(p.id);
            setSaidaProdQuery(p.nome);
        }
    }

    // NOVO: SCAN abre popup para escolher quantidade e adicionar direto na lista
    function onSaidaBarcodeScanDetected(code: string) {
        const solicitante_usuario_id = Number(saidaSolicitanteId);
        const deposito_id = Number(saidaDepositoId);
        const destinoNome = depositos.find((d) => d.id === Number(saidaDestinoDepositoId))?.nome || "";
        const destino_texto = (destinoNome || "").trim();

        if (!solicitante_usuario_id) return alert("Selecione o solicitante antes de usar o scanner.");
        if (!deposito_id) return alert("Selecione o depósito (origem) antes de usar o scanner.");
        if (!destino_texto) return alert("Selecione o destino antes de usar o scanner.");

        const p = produtosAtivos.find((x) => x.codigo_barras === code.trim()) ?? null;
        if (!p) {
            alert(`Produto não encontrado para o código: ${code}`);
            return;
        }

        const disp = saidaSaldoByProd.get(p.id) ?? 0;

        // preenche campos (opcional) para manter consistência visual
        setSaidaBarcode(p.codigo_barras);
        setSaidaProdutoId(p.id);
        setSaidaProdQuery(p.nome);

        setSaidaScanProduto(p);
        setSaidaScanDisponivel(disp);
        setSaidaScanQtyOpen(true);
    }

    function resetSaidaItemFields() {
        setSaidaBarcode("");
        setSaidaCategoriaId("Todas");
        setSaidaProdutoId(0);
        setSaidaProdQuery("");
        setSaidaQtd("1");
        // ✅ NÃO limpar observação aqui
        // setSaidaObs("");
    }

    function resetSaidaAll() {
        setSaidaItens([]);
        resetSaidaItemFields();
        setSaidaObs(""); // ✅ aqui sim, ao limpar tudo
    }


    function buildSaidaPayloadFromForm(): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const produto_id = Number(saidaProdutoId);
        const deposito_id = Number(saidaDepositoId);
        const quantidade = clampInt(saidaQtd || "0");
        const solicitante_usuario_id = Number(saidaSolicitanteId);
        const destinoNome = depositos.find((d) => d.id === Number(saidaDestinoDepositoId))?.nome || "";
        const destino_texto = (destinoNome || "").trim();

        if (!solicitante_usuario_id) {
            alert("Selecione o solicitante.");
            return null;
        }
        if (!deposito_id) {
            alert("Selecione o depósito.");
            return null;
        }
        if (!produto_id) {
            alert("Selecione um produto.");
            return null;
        }
        if (quantidade <= 0) {
            alert("Quantidade inválida.");
            return null;
        }
        if (!destino_texto) {
            alert("Selecione o destino.");
            return null;
        }

        const s = saldosMap.get(`${produto_id}::${deposito_id}`);
        const atual = s ? clampInt(s.quantidade) : 0;
        if (quantidade > atual) {
            alert(`Quantidade maior que disponível (${atual}).`);
            return null;
        }

        const payload: any = {
            action: "saida",
            produto_id,
            deposito_id,
            quantidade,
            solicitante_usuario_id,
            destino_texto,
            observacao: saidaObs.trim() || undefined,
        };

        const prodNome = prodById.get(produto_id)?.nome || `#${produto_id}`;
        const resumo = `${prodNome} — qtd ${quantidade} — Dep ${depById.get(deposito_id)?.nome || deposito_id} → ${destino_texto}`;

        return { payload, resumo };
    }

    // NOVO: builder rápido (para o popup pós scan)
    function buildSaidaPayloadDirect(produto_id: ID, quantidade: number): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const deposito_id = Number(saidaDepositoId);
        const solicitante_usuario_id = Number(saidaSolicitanteId);
        const destinoNome = depositos.find((d) => d.id === Number(saidaDestinoDepositoId))?.nome || "";
        const destino_texto = (destinoNome || "").trim();

        if (!solicitante_usuario_id) return alert("Selecione o solicitante."), null;
        if (!deposito_id) return alert("Selecione o depósito."), null;
        if (!produto_id) return alert("Selecione um produto."), null;
        if (clampInt(quantidade) <= 0) return alert("Quantidade inválida."), null;
        if (!destino_texto) return alert("Selecione o destino."), null;

        const s = saldosMap.get(`${produto_id}::${deposito_id}`);
        const atual = s ? clampInt(s.quantidade) : 0;
        if (clampInt(quantidade) > atual) return alert(`Quantidade maior que disponível (${atual}).`), null;

        const payload: any = {
            action: "saida",
            produto_id,
            deposito_id,
            quantidade: clampInt(quantidade),
            solicitante_usuario_id,
            destino_texto,
            observacao: saidaObs.trim() || undefined,
        };

        const prodNome = prodById.get(produto_id)?.nome || `#${produto_id}`;
        const resumo = `${prodNome} — qtd ${clampInt(quantidade)} — Dep ${depById.get(deposito_id)?.nome || deposito_id} → ${destino_texto}`;

        return { payload, resumo };
    }

    function addSaidaItemToList() {
        const built = buildSaidaPayloadFromForm();
        if (!built) return;
        const id = saidaSeqRef.current++;
        setSaidaItens((prev) => [...prev, { id, ...built }]);
        resetSaidaItemFields();
    }

    // NOVO: adiciona item via popup pós scan
    function addSaidaItemFromScan(produto_id: ID, quantidade: number) {
        const built = buildSaidaPayloadDirect(produto_id, quantidade);
        if (!built) return;
        const id = saidaSeqRef.current++;
        setSaidaItens((prev) => [...prev, { id, ...built }]);

        // limpa apenas seleção de item (mantém solicitante/dep/destino)
        setSaidaBarcode("");
        setSaidaProdutoId(0);
        setSaidaProdQuery("");
        setSaidaQtd("1");
        // mantém obs e filtros se o usuário quiser repetir
    }

    async function confirmarSaida() {
        let items = [...saidaItens];

        if (saidaProdutoId) {
            const built = buildSaidaPayloadFromForm();
            if (!built) return;
            const id = saidaSeqRef.current++;
            items = [...items, { id, ...built }];
        }

        if (!items.length) {
            alert("Adicione pelo menos um item para saída.");
            return;
        }

        for (const it of items) {
            const r = await apiPost<{ ok: boolean; msg?: string }>(it.payload);
            if (!r.ok) {
                alert(`Erro na saída de "${it.resumo}": ${r.msg || "Falha."}`);
                return;
            }
        }

        resetSaidaAll();
        setSaidaOpen(false);
        await refreshInit();
        setTab("ESTOQUE");
    }

    function cancelarSaida() {
        resetSaidaAll();
        setSaidaOpen(false);
    }

    /* =========================
       TRANSFERÊNCIA (com leitor de código adicionado)
    ========================= */

    const [trfOpen, setTrfOpen] = useState(false);
    const [trfScanOpen, setTrfScanOpen] = useState(false);

    // ✅ agora "trfConfirmOpen" vira o popup de CONCLUIR (com lista + botão confirmar)
    const [trfConfirmOpen, setTrfConfirmOpen] = useState(false);
    const [trfConfirmBusy, setTrfConfirmBusy] = useState(false);
    const [trfConfirmItens, setTrfConfirmItens] = useState<
        Array<{ payload: any; nome: string; qtd: number }>
    >([]);

    // ✅ monta snapshot (fila + item do formulário se existir) e abre popup "Concluir"
    function montarSnapshotConcluirTrf() {
        const obs = trfObs.trim();

        const base = trfItens.map((it) => {
            const pid = Number(it.payload?.produto_id || 0);
            const qtd = clampInt(it.payload?.quantidade);
            const nome = prodById.get(pid)?.nome || `Produto ${pid || "—"}`;
            const payload = obs ? { ...it.payload, observacao: obs } : { ...it.payload };
            return { payload, nome, qtd };
        });

        // se existe um item “no formulário”, inclui no snapshot também
        if (trfProdutoId) {
            const built = buildTrfPayloadFromForm();
            if (!built) return null;

            const pid = Number(built.payload?.produto_id || 0);
            const qtd = clampInt(built.payload?.quantidade);
            const nome = prodById.get(pid)?.nome || `Produto ${pid || "—"}`;
            const payload = obs ? { ...built.payload, observacao: obs } : { ...built.payload };

            base.push({ payload, nome, qtd });
        }

        return base;
    }

    function abrirConcluirTransferencia() {
        const snap = montarSnapshotConcluirTrf();
        if (!snap) return;
        if (!snap.length) {
            alert("Adicione pelo menos uma transferência.");
            return;
        }
        setTrfConfirmItens(snap);
        setTrfConfirmOpen(true);
    }

    async function confirmarTransferenciaDoSnapshot() {
        if (!trfConfirmItens.length) return;

        setTrfConfirmBusy(true);
        try {
            for (const it of trfConfirmItens) {
                const r = await apiPost<{ ok: boolean; msg?: string }>(it.payload);
                if (!r.ok) {
                    alert(`Erro na transferência de "${it.nome}": ${r.msg || "Falha."}`);
                    return;
                }
            }

            // ✅ sucesso
            setTrfConfirmOpen(false);
            setTrfConfirmItens([]);

            resetTrfAll();
            setTrfOpen(false);

            await refreshInit();
            setTab("ESTOQUE");
        } finally {
            setTrfConfirmBusy(false);
        }
    }


    const [trfSolicitanteId, setTrfSolicitanteId] = useState<ID>(0);
    const [trfOrigemId, setTrfOrigemId] = useState<ID>(0);
    const [trfDestinoId, setTrfDestinoId] = useState<ID>(0);

    const [trfBarcode, setTrfBarcode] = useState("");
    const [trfCategoriaId, setTrfCategoriaId] = useState<ID | "Todas">("Todas");

    const [trfProdutoId, setTrfProdutoId] = useState<ID>(0);
    const [trfProdQuery, setTrfProdQuery] = useState("");

    const [trfQtd, setTrfQtd] = useState<string>("1");
    const [trfObs, setTrfObs] = useState("");

    // NOVO: popup de quantidade após SCAN (Transferência)
    const [trfScanQtyOpen, setTrfScanQtyOpen] = useState(false);
    const [trfScanProduto, setTrfScanProduto] = useState<Produto | null>(null);
    const [trfScanDisponivel, setTrfScanDisponivel] = useState<number>(0);


    const trfSaldoByProd = useMemo(() => {
        const m = new Map<ID, number>();
        const depId = Number(trfOrigemId);
        for (const s of saldos) {
            if (s.deposito_id !== depId) continue;
            m.set(s.produto_id, clampInt(s.quantidade));
        }
        return m;
    }, [saldos, trfOrigemId]);

    const trfFiltroOptions = useMemo(() => {
        type TrfFiltroRow = { p: Produto; d: Deposito; qtd: number };
        const rows: TrfFiltroRow[] = [];

        for (const s of saldos) {
            const p = prodById.get(s.produto_id);
            const d = depById.get(s.deposito_id);
            if (!p || !d) continue;

            const qtd = clampInt(s.quantidade);
            if (qtd <= 0) continue;

            rows.push({ p, d, qtd });
        }

        const origemId = Number(trfOrigemId || 0);
        const catId = trfCategoriaId === "Todas" ? 0 : Number(trfCategoriaId || 0);

        const passaSelecoes = (r: TrfFiltroRow, ignorar: "origem" | "categoria") => {
            if (ignorar !== "origem" && origemId && Number(r.d.id) !== origemId) return false;
            if (ignorar !== "categoria" && catId && Number(r.p.categoria_id || 0) !== catId) return false;
            return true;
        };

        return {
            origens: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "origem"))
                    .map((r) => ({ id: r.d.id, nome: r.d.nome }))
            ),
            categorias: uniqOptions(
                rows
                    .filter((r) => passaSelecoes(r, "categoria"))
                    .map((r) => produtoCategoriaOption(r.p, catById))
            ),
        };
    }, [saldos, prodById, depById, trfOrigemId, trfCategoriaId, catById]);

    const trfProdutosNaOrigem = useMemo(() => {
        const depId = Number(trfOrigemId);
        const ids = new Set<ID>();
        for (const s of saldos) {
            if (s.deposito_id === depId && clampInt(s.quantidade) > 0) ids.add(s.produto_id);
        }

        let list = produtosAtivos.filter((p) => ids.has(p.id));

        if (trfCategoriaId !== "Todas") {
            list = list.filter((p) => Number(p.categoria_id || 0) === Number(trfCategoriaId));
        }

        return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }, [saldos, produtosAtivos, trfOrigemId, trfCategoriaId]);

    useEffect(() => {
        const produtoAindaExiste = trfProdutoId && trfProdutosNaOrigem.some((p) => p.id === trfProdutoId);
        if (trfProdutoId && !produtoAindaExiste) {
            setTrfProdutoId(0);
            setTrfProdQuery("");
            setTrfBarcode("");
        }
    }, [trfProdutosNaOrigem, trfProdutoId]);

    function onTrfBarcodePick(code: string) {
        // mantém para digitação manual no campo (sem popup)
        setTrfBarcode(code);
        const p = produtosAtivos.find((x) => x.codigo_barras === code);
        if (p) {
            setTrfProdutoId(p.id);
            setTrfProdQuery(p.nome);
        }
    }

    // NOVO: SCAN abre popup para escolher quantidade e adicionar direto na lista
    function onTrfBarcodeScanDetected(code: string) {
        const solicitante_usuario_id = Number(trfSolicitanteId);
        const deposito_origem_id = Number(trfOrigemId);
        const deposito_destino_id = Number(trfDestinoId);

        if (!solicitante_usuario_id) return alert("Selecione o solicitante antes de usar o scanner.");
        if (!deposito_origem_id || !deposito_destino_id) return alert("Selecione origem e destino antes de usar o scanner.");
        if (deposito_origem_id === deposito_destino_id) return alert("Origem e destino não podem ser iguais.");

        const p = produtosAtivos.find((x) => x.codigo_barras === code.trim()) ?? null;
        if (!p) {
            alert(`Produto não encontrado para o código: ${code}`);
            return;
        }

        const disp = trfSaldoByProd.get(p.id) ?? 0;

        // preenche campos (opcional) para manter consistência visual
        setTrfBarcode(p.codigo_barras);
        setTrfProdutoId(p.id);
        setTrfProdQuery(p.nome);

        setTrfScanProduto(p);
        setTrfScanDisponivel(disp);
        setTrfScanQtyOpen(true);
    }

    function resetTrfItemFields() {
        setTrfBarcode("");
        setTrfCategoriaId("Todas");
        setTrfProdutoId(0);
        setTrfProdQuery("");
        setTrfQtd("1");
        // ✅ NÃO limpar observação aqui
        // setTrfObs("");
    }

    function resetTrfAll() {
        setTrfItens([]);
        resetTrfItemFields();
        setTrfObs(""); // ✅ aqui sim, ao limpar tudo
    }

    function buildTrfPayloadFromForm(): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const produto_id = Number(trfProdutoId);
        const deposito_origem_id = Number(trfOrigemId);
        const deposito_destino_id = Number(trfDestinoId);
        const quantidade = clampInt(trfQtd || "0");
        const solicitante_usuario_id = Number(trfSolicitanteId);

        if (!solicitante_usuario_id) {
            alert("Selecione o solicitante.");
            return null;
        }
        if (!produto_id) {
            alert("Selecione um produto.");
            return null;
        }
        if (!deposito_origem_id || !deposito_destino_id) {
            alert("Selecione depósitos.");
            return null;
        }
        if (deposito_origem_id === deposito_destino_id) {
            alert("Origem e destino não podem ser iguais.");
            return null;
        }
        if (quantidade <= 0) {
            alert("Quantidade inválida.");
            return null;
        }

        const s = saldosMap.get(`${produto_id}::${deposito_origem_id}`);
        const atual = s ? clampInt(s.quantidade) : 0;
        if (quantidade > atual) {
            alert(`Quantidade maior que disponível na origem (${atual}).`);
            return null;
        }

        const payload: any = {
            action: "transferencia",
            produto_id,
            deposito_origem_id,
            deposito_destino_id,
            quantidade,
            solicitante_usuario_id,
            observacao: trfObs.trim() || undefined,
        };

        const prodNome = prodById.get(produto_id)?.nome || `#${produto_id}`;
        const resumo = `${prodNome} — qtd ${quantidade} — ${depById.get(deposito_origem_id)?.nome || deposito_origem_id
            } → ${depById.get(deposito_destino_id)?.nome || deposito_destino_id}`;

        return { payload, resumo };
    }

    // NOVO: builder rápido (para o popup pós scan)
    function buildTrfPayloadDirect(produto_id: ID, quantidade: number): { payload: any; resumo: string } | null {
        if (!me) {
            alert("Sessão inválida. Recarregue a página.");
            return null;
        }

        const deposito_origem_id = Number(trfOrigemId);
        const deposito_destino_id = Number(trfDestinoId);
        const solicitante_usuario_id = Number(trfSolicitanteId);

        if (!solicitante_usuario_id) return alert("Selecione o solicitante."), null;
        if (!produto_id) return alert("Selecione um produto."), null;
        if (!deposito_origem_id || !deposito_destino_id) return alert("Selecione depósitos."), null;
        if (deposito_origem_id === deposito_destino_id) return alert("Origem e destino não podem ser iguais."), null;
        if (clampInt(quantidade) <= 0) return alert("Quantidade inválida."), null;

        const s = saldosMap.get(`${produto_id}::${deposito_origem_id}`);
        const atual = s ? clampInt(s.quantidade) : 0;
        if (clampInt(quantidade) > atual) return alert(`Quantidade maior que disponível na origem (${atual}).`), null;

        const payload: any = {
            action: "transferencia",
            produto_id,
            deposito_origem_id,
            deposito_destino_id,
            quantidade: clampInt(quantidade),
            solicitante_usuario_id,
            observacao: trfObs.trim() || undefined,
        };

        const prodNome = prodById.get(produto_id)?.nome || `#${produto_id}`;
        const resumo = `${prodNome} — qtd ${clampInt(quantidade)} — ${depById.get(deposito_origem_id)?.nome || deposito_origem_id
            } → ${depById.get(deposito_destino_id)?.nome || deposito_destino_id}`;

        return { payload, resumo };
    }

    function addTrfItemToList() {
        const built = buildTrfPayloadFromForm();
        if (!built) return;
        const id = trfSeqRef.current++;
        setTrfItens((prev) => [...prev, { id, ...built }]);
        resetTrfItemFields();
    }

    // NOVO: adiciona item via popup pós scan
    function addTrfItemFromScan(produto_id: ID, quantidade: number) {
        const built = buildTrfPayloadDirect(produto_id, quantidade);
        if (!built) return;
        const id = trfSeqRef.current++;
        setTrfItens((prev) => [...prev, { id, ...built }]);

        // limpa apenas seleção de item (mantém solicitante/origem/destino)
        setTrfBarcode("");
        setTrfProdutoId(0);
        setTrfProdQuery("");
        setTrfQtd("1");
        // mantém obs e filtros se o usuário quiser repetir
    }

    async function confirmarTransferencia() {
        let items = [...trfItens];

        if (trfProdutoId) {
            const built = buildTrfPayloadFromForm();
            if (!built) return;
            const id = trfSeqRef.current++;
            items = [...items, { id, ...built }];
        }

        if (!items.length) {
            alert("Adicione pelo menos uma transferência.");
            return;
        }

        for (const it of items) {
            const r = await apiPost<{ ok: boolean; msg?: string }>(it.payload);
            if (!r.ok) {
                alert(`Erro na transferência de "${it.resumo}": ${r.msg || "Falha."}`);
                return;
            }
        }

        resetTrfAll();
        setTrfOpen(false);
        await refreshInit();
        setTab("ESTOQUE");
    }

    function cancelarTransferencia() {
        resetTrfAll();
        setTrfOpen(false);
    }

    /* =========================
       AVANÇADO + HISTÓRICO (mantidos)
    ========================= */

    // ======= NOVO PRODUTO (AVANÇADO) =======
    const [novoCodigoBarras, setNovoCodigoBarras] = useState("");
    const [novoNome, setNovoNome] = useState("");
    const [novoValor, setNovoValor] = useState<number>(0);
    const [novoPrecoCusto, setNovoPrecoCusto] = useState<number>(0);
    const [novoMin, setNovoMin] = useState<number>(0);
    const [novoMax, setNovoMax] = useState<number>(0);
    const [novoFoto, setNovoFoto] = useState<string>("");
    const [novoFotos, setNovoFotos] = useState<Array<{
        temp_id: string;
        foto_url: string;
        legenda: string;
        is_principal: 0 | 1;
        ordem: number;
    }>>([]);

    const [novoCategoriaId, setNovoCategoriaId] = useState<ID>(0);
    const [novoFabricanteId, setNovoFabricanteId] = useState<ID>(0);
    const [novoClassificacaoId, setNovoClassificacaoId] = useState<ID>(0);

    // ✅ NOVO: depósito inicial do produto
    const [novoDepositoId, setNovoDepositoId] = useState<ID>(0);


    const [novoDepNome, setNovoDepNome] = useState("");
    const [renomearDepId, setRenomearDepId] = useState<ID>(0);
    const [renomearDepNome, setRenomearDepNome] = useState("");
    const [busyDep, setBusyDep] = useState(false);

    useEffect(() => {
        if (!renomearDepId && depositos[0]?.id) {
            setRenomearDepId(depositos[0].id);
            setRenomearDepNome(depositos[0].nome);
        }
    }, [depositos, renomearDepId]);

    useEffect(() => {
        const d = depositos.find((x) => x.id === renomearDepId);
        if (d) setRenomearDepNome(d.nome);
    }, [renomearDepId, depositos]);

    async function criarDeposito() {
        const nome = novoDepNome.trim();
        if (!nome) return alert("Informe o nome do depósito.");
        setBusyDep(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({
                action: "deposito_criar",
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao criar depósito.");
            setNovoDepNome("");
            await refreshInit();
        } finally {
            setBusyDep(false);
        }
    }

    async function renomearDeposito() {
        const deposito_id = Number(renomearDepId);
        const nome = renomearDepNome.trim();
        if (!deposito_id) return alert("Selecione o depósito.");
        if (!nome) return alert("Informe o novo nome.");
        setBusyDep(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "deposito_renomear",
                deposito_id,
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao renomear.");
            await refreshInit();
        } finally {
            setBusyDep(false);
        }
    }

    function exportarDeposito(deposito_id: ID) {
        const url = `${API_BASE}?export_deposito_id=${deposito_id}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }




    // Categorias
    const [novoCatNome, setNovoCatNome] = useState("");
    const [renomearCatId, setRenomearCatId] = useState<ID>(0);
    const [renomearCatNome, setRenomearCatNome] = useState("");
    const [busyCat, setBusyCat] = useState(false);

    useEffect(() => {
        if (!renomearCatId && categorias[0]?.id) {
            setRenomearCatId(categorias[0].id);
            setRenomearCatNome(categorias[0].nome);
        }
    }, [categorias, renomearCatId]);

    useEffect(() => {
        const c = categorias.find((x) => x.id === renomearCatId);
        if (c) setRenomearCatNome(c.nome);
    }, [renomearCatId, categorias]);

    async function criarCategoria() {
        const nome = novoCatNome.trim();
        if (!nome) return alert("Informe o nome da categoria.");
        setBusyCat(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({
                action: "categoria_criar",
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao criar categoria.");
            setNovoCatNome("");
            await refreshInit();
        } finally {
            setBusyCat(false);
        }
    }

    async function renomearCategoria() {
        const categoria_id = Number(renomearCatId);
        const nome = renomearCatNome.trim();
        if (!categoria_id) return alert("Selecione a categoria.");
        if (!nome) return alert("Informe o novo nome.");
        setBusyCat(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "categoria_renomear",
                categoria_id,
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao renomear categoria.");
            await refreshInit();
        } finally {
            setBusyCat(false);
        }
    }

    // Fabricantes
    const [novoFabNome, setNovoFabNome] = useState("");
    const [renomearFabId, setRenomearFabId] = useState<ID>(0);
    const [renomearFabNome, setRenomearFabNome] = useState("");
    const [busyFab, setBusyFab] = useState(false);

    useEffect(() => {
        if (!renomearFabId && fabricantes[0]?.id) {
            setRenomearFabId(fabricantes[0].id);
            setRenomearFabNome(fabricantes[0].nome);
        }
    }, [fabricantes, renomearFabId]);

    useEffect(() => {
        const f = fabricantes.find((x) => x.id === renomearFabId);
        if (f) setRenomearFabNome(f.nome);
    }, [renomearFabId, fabricantes]);

    async function criarFabricante() {
        const nome = novoFabNome.trim();
        if (!nome) return alert("Informe o nome do fabricante.");
        setBusyFab(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string; id?: number }>({
                action: "fabricante_criar",
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao criar fabricante.");
            setNovoFabNome("");
            await refreshInit();
        } finally {
            setBusyFab(false);
        }
    }

    async function renomearFabricante() {
        const fabricante_id = Number(renomearFabId);
        const nome = renomearFabNome.trim();
        if (!fabricante_id) return alert("Selecione o fabricante.");
        if (!nome) return alert("Informe o novo nome.");
        setBusyFab(true);
        try {
            const r = await apiPost<{ ok: boolean; msg?: string }>({
                action: "fabricante_renomear",
                fabricante_id,
                nome,
            });
            if (!r.ok) return alert(r.msg || "Falha ao renomear fabricante.");
            await refreshInit();
        } finally {
            setBusyFab(false);
        }
    }

    // HISTÓRICO
    const [histLoading, setHistLoading] = useState(false);
    const [histErr, setHistErr] = useState("");
    const [histRows, setHistRows] = useState<HistoricoRow[]>([]);
    const [histQ, setHistQ] = useState("");
    const [histTipo, setHistTipo] = useState<"Todos" | HistoricoRow["tipo"]>("Todos");
    const [histLimit, setHistLimit] = useState(300);

    async function loadHistorico() {
        setHistLoading(true);
        setHistErr("");
        try {
            const resp = await apiGet<HistoricoResp>({
                historico: 1,
                limit: Math.max(1, Math.min(500, histLimit)),
                q: histQ.trim() || undefined,
                tipo: histTipo !== "Todos" ? histTipo : undefined,
            });
            if (!resp.ok) throw new Error(resp.msg || "Falha ao carregar histórico.");
            setHistRows(resp.rows || []);
        } catch (e: any) {
            setHistErr(e?.message || "Erro ao carregar histórico.");
        } finally {
            setHistLoading(false);
        }
    }

    useEffect(() => {
        if (tab === "HISTORICO") loadHistorico();
        if (tab === "CONFERENCIA") loadConferenciasRegistros();
        // eslint-disable-next-line 
    }, [tab]);

    type HistoricoGrupo = {
        key: string;
        rows: HistoricoRow[];
    };

    const histGrupos = useMemo<HistoricoGrupo[]>(() => {
        const grupos: HistoricoGrupo[] = [];

        const normalizeSecond = (iso?: string) => {
            if (!iso) return "";
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return iso;
            d.setMilliseconds(0);
            return d.toISOString();
        };

        const makeKey = (h: HistoricoRow) => {
            const criadoSegundo = normalizeSecond(h.criado_em);

            return [
                h.tipo,
                criadoSegundo,
                h.operador_usuario_id || 0,
                h.solicitante_usuario_id || 0,
                h.deposito_origem_id || 0,
                h.deposito_destino_id || 0,
                h.destino_texto || "",
                h.observacao || "",
            ].join("|");
        };

        for (const row of histRows) {
            const key = makeKey(row);
            const last = grupos[grupos.length - 1];

            if (last && last.key === key) {
                last.rows.push(row);
            } else {
                grupos.push({ key, rows: [row] });
            }
        }

        return grupos;
    }, [histRows]);

    function limparFiltrosEstoque() {
        setQEstoque("");
        setDepFiltroEstoque([]);
        setCatFiltroEstoque([]);
        setFabFiltroEstoque([]);
        setClassFiltroEstoque([]);
        setOnlyLow(false);
        setOnlyPositive(false);
        setOnlyInactive(false);
    }

    function limparFiltrosConferencia() {
        setConfDepositoId(0);
        setConfFabId("Todos");
        setConfCatId("Todas");
        setConfClassId("Todas");
        setConfQ("");
        setConfOnlyPositive(false);
        setConfFisicoByProd({});
    }

    function abrirTela(nextTab: UiTab) {
        setTab(nextTab);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function voltarParaMenu() {
        setTab("MENU");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    return (
        <main className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-5 sm:py-7">
                <Card className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                                Administração do Estoque
                            </h1>

                            <p className="mt-1 text-xs text-slate-500">
                                Operador (fixo): <b>{me ? `${me.nome} (${me.usuario})` : "—"}</b>
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            {tab === "MENU" ? (
                                <Badge>Alertas: {alertCount}</Badge>
                            ) : (
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={voltarParaMenu}
                                >
                                    ← Voltar
                                </Button>
                            )}

                            <Button
                                variant="ghost"
                                onClick={refreshInit}
                                disabled={loading}
                                type="button"
                            >
                                Atualizar
                            </Button>
                        </div>
                    </div>

                    {initErr ? (
                        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {initErr}{" "}
                            <button
                                className="underline"
                                onClick={refreshInit}
                                type="button"
                            >
                                Tentar novamente
                            </button>
                        </div>
                    ) : null}
                </Card>

                {tab === "MENU" && (
                    <div className="mt-4">
                        <div className="grid grid-cols-2 gap-3 sm:hidden">
                            {tabActions.map((a) => (
                                <button
                                    key={a.key}
                                    type="button"
                                    onClick={() => abrirTela(a.key)}
                                    className={[
                                        "group flex flex-col items-center justify-center gap-2.5 rounded-2xl",
                                        "border bg-white px-3 py-4 shadow-sm transition-all",
                                        "hover:-translate-y-[1px] hover:shadow-md",
                                        "dark:bg-gray-900",
                                        "border-gray-200 dark:border-gray-800",
                                    ].join(" ")}
                                >
                                    <QuickIcon>{a.icon}</QuickIcon>

                                    <span className="text-center text-[13px] font-extrabold leading-tight tracking-tight text-gray-900 dark:text-white">
                                        {a.label}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <Card className="hidden p-2 sm:block">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                                {tabActions.map((a) => (
                                    <button
                                        key={a.key}
                                        type="button"
                                        onClick={() => abrirTela(a.key)}
                                        className={[
                                            "group flex flex-col items-center justify-center gap-2.5 rounded-2xl",
                                            "border bg-white px-3 py-4 shadow-sm transition-all",
                                            "hover:-translate-y-[1px] hover:shadow-md",
                                            "dark:bg-gray-900",
                                            "border-gray-200 dark:border-gray-800",
                                        ].join(" ")}
                                    >
                                        <QuickIcon>{a.icon}</QuickIcon>

                                        <span className="text-center text-[13px] font-extrabold leading-tight tracking-tight text-gray-900 dark:text-white">
                                            {a.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </Card>
                    </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4">
                    {/* HOME / MOVIMENTAÇÃO */}
                    {tab === "HOME" ? (
                        <Card className="p-4">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                <HomeActionButton
                                    label="Saída"
                                    icon={<span className="text-lg leading-none">⬆️</span>}
                                    onClick={() => setSaidaOpen(true)}
                                />

                                <HomeActionButton
                                    label="Transferência"
                                    icon={<span className="text-lg leading-none">🔁</span>}
                                    onClick={() => setTrfOpen(true)}
                                />

                                <HomeActionButton
                                    label="Histórico"
                                    icon={<span className="text-lg leading-none">🕘</span>}
                                    onClick={() => abrirTela("HISTORICO")}
                                />
                            </div>
                        </Card>
                    ) : null}

                    {/* ENTRADA (atalho) */}
                    {tab === "ENTRADA" ? (
                        <Card className="p-4">
                            <div className="grid grid-cols-2 gap-3">
                                {/* ESQUERDA: Entrada */}
                                <HomeActionButton
                                    label="Abrir Entrada"
                                    icon={<span className="text-lg leading-none">⬇️</span>}
                                    onClick={() => setEntradaOpen(true)}
                                />

                                {/* DIREITA: espaço para outro botão (placeholder) */}
                                <button
                                    type="button"
                                    disabled
                                    className={[
                                        "w-full rounded-2xl border border-dashed border-slate-200",
                                        "bg-white/60 p-5 text-slate-400",
                                        "shadow-sm",
                                        "flex flex-col items-center justify-center gap-3",
                                    ].join(" ")}
                                >
                                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                                        <span className="text-lg leading-none">＋</span>
                                    </div>
                                    <span className="text-[13px] font-extrabold tracking-tight text-center leading-tight">
                                        Em breve
                                    </span>
                                </button>
                            </div>
                        </Card>
                    ) : null}

                    {/* ESTOQUE */}
                    {tab === "ESTOQUE" ? (
                        <Card className="p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Produtos</h2>

                                </div>
                                <div className="flex flex-wrap gap-2 sm:justify-end">


                                    <Button variant="soft" onClick={exportarEstoqueCSV} type="button" disabled={loading || custosMediosLoading || !!custosMediosErr || !estoqueRows.length}>
                                        ⬇️ CSV
                                    </Button>
                                    <Button variant="soft" onClick={exportarEstoquePDF} type="button" disabled={loading || custosMediosLoading || !!custosMediosErr || !estoqueRows.length}>
                                        🧾 PDF
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                    <div className="w-full lg:max-w-xl">
                                        <Field label="Pesquisar produto">
                                            <TextInput
                                                value={qEstoque}
                                                onChange={(e) => setQEstoque(e.target.value)}
                                                placeholder="Nome, código de barras, categoria, fabricante ou classificação..."
                                            />
                                        </Field>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                                        <div className="text-sm text-slate-700 sm:mr-2">
                                            Produtos filtrados: <b>{estoqueRows.length}</b>
                                        </div>

                                        <Button
                                            variant="soft"
                                            type="button"
                                            onClick={() => setEstoqueFilterOpen(true)}
                                        >
                                            🔎 Abrir filtro
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            type="button"
                                            onClick={limparFiltrosEstoque}
                                        >
                                            Limpar filtros
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                {loading ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Carregando...</div>
                                ) : estoqueRows.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Nenhum registro encontrado.</div>
                                ) : (
                                    <>
                                        {/* CELULAR E TABLET */}
                                        <div className="space-y-3 p-3 lg:hidden">
                                            {estoqueRowsPaginados.map(({ p, d, qtd, min, hasMinMax }) => {
                                                const low = hasMinMax && qtd <= min;
                                                const precoCustoNum = custoMedioMovelProduto(p.id);
                                                const custoTotalItem = custoTotalMovelProduto(p.id, qtd);
                                                const custoCarregado = Object.prototype.hasOwnProperty.call(
                                                    custosMediosMoveis,
                                                    Number(p.id)
                                                );
                                                const foto = getProdutoFotoPrincipal(p);

                                                const cat =
                                                    p.categoria_nome ||
                                                    (p.categoria_id ? catById.get(p.categoria_id)?.nome : null) ||
                                                    "—";
                                                const fab =
                                                    p.fabricante_nome ||
                                                    (p.fabricante_id ? fabById.get(p.fabricante_id)?.nome : null) ||
                                                    "—";
                                                const cls =
                                                    p.classificacao_nome ||
                                                    (p.classificacao_id ? classById.get(p.classificacao_id)?.nome : null) ||
                                                    "—";

                                                return (
                                                    <article
                                                        key={p.id}
                                                        className={[
                                                            "rounded-2xl border bg-white p-3 shadow-sm",
                                                            low
                                                                ? "border-rose-200 bg-rose-50/40"
                                                                : "border-slate-200",
                                                        ].join(" ")}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <PhotoThumb
                                                                url={foto}
                                                                className="h-20 w-20 rounded-2xl"
                                                                onClick={() => {
                                                                    if (!foto) return;
                                                                    setImgUrl(foto);
                                                                    setImgTitle(p.nome);
                                                                    setImgOpen(true);
                                                                }}
                                                            />

                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex min-w-0 items-start gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openProdutoEditor(p.id, d.id)}
                                                                        className="line-clamp-2 text-left text-base font-semibold leading-tight text-slate-900 hover:underline"
                                                                        title="Clique para editar"
                                                                    >
                                                                        {p.nome}
                                                                    </button>
                                                                    {low ? (
                                                                        <span className="mt-0.5 shrink-0 text-[11px] font-semibold text-rose-600">
                                                                            alerta
                                                                        </span>
                                                                    ) : null}
                                                                </div>

                                                                <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
                                                                    CB: {p.codigo_barras}
                                                                </p>
                                                                <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-700">
                                                                    {cat}
                                                                </p>
                                                                {fab !== "—" ? (
                                                                    <p className="mt-0.5 truncate text-xs text-slate-500">
                                                                        {fab}
                                                                    </p>
                                                                ) : null}
                                                                {cls !== "—" ? (
                                                                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                                                                        {cls}
                                                                    </p>
                                                                ) : null}
                                                            </div>

                                                            <div className="w-[92px] shrink-0 text-right">
                                                                <p className="text-xs text-slate-500">Qtd</p>
                                                                <p
                                                                    className={[
                                                                        "text-xl font-bold",
                                                                        low
                                                                            ? "text-rose-700"
                                                                            : "text-slate-900",
                                                                    ].join(" ")}
                                                                >
                                                                    {clampInt(qtd)}
                                                                </p>

                                                                <div className="mt-2">
                                                                    <p className="text-xs text-slate-500">Custo</p>
                                                                    <p className="text-sm font-semibold text-slate-700">
                                                                        {!custoCarregado
                                                                            ? "..."
                                                                            : precoCustoNum
                                                                                ? moneyBRL(precoCustoNum)
                                                                                : "—"}
                                                                    </p>
                                                                </div>

                                                                <div className="mt-2">
                                                                    <p className="text-xs text-slate-500">Total</p>
                                                                    <p className="text-sm font-bold text-slate-900">
                                                                        {!custoCarregado
                                                                            ? "..."
                                                                            : precoCustoNum
                                                                                ? moneyBRL(custoTotalItem)
                                                                                : "—"}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>

                                        {/* COMPUTADOR */}
                                        <div className="hidden lg:block">
                                            <div className="overflow-x-auto pb-2 [scrollbar-gutter:stable]">
                                                <table
                                                    className="table-fixed border-separate border-spacing-0"
                                                    style={{
                                                        width: `${estoqueTableWidth}px`,
                                                        minWidth: "100%",
                                                    }}
                                                >
                                                    <colgroup>
                                                        {ESTOQUE_COLUMN_ORDER.map((columnKey) => (
                                                            <col
                                                                key={columnKey}
                                                                style={{
                                                                    width: estoqueColumnWidths[columnKey],
                                                                }}
                                                            />
                                                        ))}
                                                    </colgroup>

                                                    <thead>
                                                        <tr>
                                                            <EstoqueResizableHeader
                                                                label="Produto"
                                                                columnKey="produto"
                                                                onResizeStart={iniciarRedimensionamentoColunaEstoque}
                                                                onReset={restaurarLarguraColunaEstoque}
                                                            />
                                                            <EstoqueResizableHeader
                                                                label="Categoria"
                                                                columnKey="categoria"
                                                                onResizeStart={iniciarRedimensionamentoColunaEstoque}
                                                                onReset={restaurarLarguraColunaEstoque}
                                                            />
                                                            <EstoqueResizableHeader
                                                                label="Fabricante"
                                                                columnKey="fabricante"
                                                                onResizeStart={iniciarRedimensionamentoColunaEstoque}
                                                                onReset={restaurarLarguraColunaEstoque}
                                                            />
                                                            <EstoqueResizableHeader
                                                                label="Classificação"
                                                                columnKey="classificacao"
                                                                onResizeStart={iniciarRedimensionamentoColunaEstoque}
                                                                onReset={restaurarLarguraColunaEstoque}
                                                            />
                                                            <EstoqueResizableHeader
                                                                label="Qtd"
                                                                columnKey="qtd"
                                                                align="right"
                                                                onResizeStart={iniciarRedimensionamentoColunaEstoque}
                                                                onReset={restaurarLarguraColunaEstoque}
                                                            />
                                                            <EstoqueResizableHeader
                                                                label="Preço de custo"
                                                                columnKey="custo"
                                                                align="right"
                                                                stickyRight={estoqueColumnWidths.total}
                                                                onResizeStart={iniciarRedimensionamentoColunaEstoque}
                                                                onReset={restaurarLarguraColunaEstoque}
                                                            />
                                                            <EstoqueResizableHeader
                                                                label="Total"
                                                                columnKey="total"
                                                                align="right"
                                                                isLast
                                                                stickyRight={0}
                                                                onResizeStart={iniciarRedimensionamentoColunaEstoque}
                                                                onReset={restaurarLarguraColunaEstoque}
                                                            />
                                                        </tr>
                                                    </thead>

                                                    <tbody>
                                                        {estoqueRowsPaginados.map(({ p, d, qtd, min, hasMinMax }) => {
                                                            const low =
                                                                hasMinMax &&
                                                                clampInt(qtd) <= clampInt(min);

                                                            const cat =
                                                                p.categoria_nome ||
                                                                (p.categoria_id
                                                                    ? catById.get(p.categoria_id)?.nome
                                                                    : "") ||
                                                                "—";
                                                            const fab =
                                                                p.fabricante_nome ||
                                                                (p.fabricante_id
                                                                    ? fabById.get(p.fabricante_id)?.nome
                                                                    : "") ||
                                                                "—";
                                                            const cls =
                                                                p.classificacao_nome ||
                                                                (p.classificacao_id
                                                                    ? classById.get(p.classificacao_id)?.nome
                                                                    : "") ||
                                                                "—";

                                                            const precoCustoNum =
                                                                custoMedioMovelProduto(p.id);
                                                            const custoTotalItem =
                                                                custoTotalMovelProduto(p.id, qtd);
                                                            const custoCarregado =
                                                                Object.prototype.hasOwnProperty.call(
                                                                    custosMediosMoveis,
                                                                    Number(p.id)
                                                                );
                                                            const foto =
                                                                getProdutoFotoPrincipal(p);

                                                            return (
                                                                <tr
                                                                    key={p.id}
                                                                    className="group bg-white hover:bg-slate-50"
                                                                >
                                                                    <td className="overflow-hidden border-b border-r border-slate-200 px-3 py-2 text-sm text-slate-900">
                                                                        <div className="flex min-w-0 items-center gap-3">
                                                                            <PhotoThumb
                                                                                url={foto}
                                                                                onClick={() => {
                                                                                    if (!foto) return;
                                                                                    setImgUrl(foto);
                                                                                    setImgTitle(p.nome);
                                                                                    setImgOpen(true);
                                                                                }}
                                                                            />

                                                                            <div className="min-w-0 flex-1">
                                                                                <div className="flex min-w-0 items-start gap-2">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            openProdutoEditor(
                                                                                                p.id,
                                                                                                d.id
                                                                                            )
                                                                                        }
                                                                                        className="line-clamp-2 break-words text-left font-semibold leading-snug text-slate-900 hover:underline"
                                                                                        title={p.nome}
                                                                                    >
                                                                                        {p.nome}
                                                                                    </button>
                                                                                    {low ? (
                                                                                        <span className="mt-0.5 shrink-0 text-xs text-rose-600">
                                                                                            • alerta
                                                                                        </span>
                                                                                    ) : null}
                                                                                </div>
                                                                                <div className="truncate font-mono text-xs text-slate-500">
                                                                                    CB: {p.codigo_barras}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </td>

                                                                    <td className="border-b border-r border-slate-200 px-3 py-2 align-middle text-sm text-slate-700">
                                                                        <div className="break-words">{cat}</div>
                                                                    </td>
                                                                    <td className="border-b border-r border-slate-200 px-3 py-2 align-middle text-sm text-slate-700">
                                                                        <div className="break-words">{fab}</div>
                                                                    </td>
                                                                    <td className="border-b border-r border-slate-200 px-3 py-2 align-middle text-sm text-slate-700">
                                                                        <div className="break-words">{cls}</div>
                                                                    </td>

                                                                    <td className="border-b border-r border-slate-200 px-3 py-2 text-right align-middle text-sm font-semibold">
                                                                        <span
                                                                            className={
                                                                                low
                                                                                    ? "text-rose-700"
                                                                                    : "text-slate-900"
                                                                            }
                                                                        >
                                                                            {clampInt(qtd)}
                                                                        </span>
                                                                    </td>

                                                                    <td
                                                                        style={{
                                                                            right: estoqueColumnWidths.total,
                                                                        }}
                                                                        className="sticky z-[5] whitespace-nowrap border-b border-r border-slate-200 bg-white px-3 py-2 text-right align-middle text-sm text-slate-700 shadow-[-1px_0_0_0_#e2e8f0] group-hover:bg-slate-50"
                                                                    >
                                                                        {!custoCarregado
                                                                            ? "..."
                                                                            : precoCustoNum
                                                                                ? moneyBRL(precoCustoNum)
                                                                                : "—"}
                                                                    </td>

                                                                    <td
                                                                        style={{ right: 0 }}
                                                                        className="sticky z-[6] whitespace-nowrap border-b border-slate-200 bg-white px-3 py-2 text-right align-middle text-sm font-semibold text-slate-900 group-hover:bg-slate-50"
                                                                    >
                                                                        {!custoCarregado
                                                                            ? "..."
                                                                            : precoCustoNum
                                                                                ? moneyBRL(custoTotalItem)
                                                                                : "—"}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>

                                                    <tfoot>
                                                        <tr className="bg-slate-50 text-xs text-slate-700">
                                                            <td
                                                                className="border-r border-t border-slate-200 px-3 py-3 font-semibold"
                                                                colSpan={4}
                                                            >
                                                                Total de produtos:{" "}
                                                                <span className="text-slate-900">
                                                                    {estoqueResumo.totalModelos}
                                                                </span>
                                                            </td>
                                                            <td className="border-r border-t border-slate-200 px-3 py-3 text-right font-bold text-slate-900">
                                                                {estoqueResumo.totalUnidades}
                                                            </td>
                                                            <td
                                                                style={{
                                                                    right: estoqueColumnWidths.total,
                                                                }}
                                                                className="sticky z-[5] border-r border-t border-slate-200 bg-slate-50 px-3 py-3 text-right text-slate-500 shadow-[-1px_0_0_0_#e2e8f0]"
                                                            >
                                                                —
                                                            </td>
                                                            <td
                                                                style={{ right: 0 }}
                                                                className="sticky z-[6] border-t border-slate-200 bg-slate-50 px-3 py-3 text-right font-bold text-slate-900"
                                                            >
                                                                {custosMediosLoading
                                                                    ? "..."
                                                                    : custosMediosErr
                                                                        ? "—"
                                                                        : moneyBRL(estoqueResumo.totalCusto)}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>

                                    </>
                                )}
                            </div>

                            {custosMediosErr ? (
                                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                                    {custosMediosErr}
                                </div>
                            ) : null}

                            <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-3">
                                    <label className="flex items-center gap-2 text-sm text-slate-700">
                                        <span>Itens por página</span>
                                        <select
                                            value={String(estoquePageSize)}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                setEstoquePageSize(
                                                    value === "ALL"
                                                        ? "ALL"
                                                        : (Number(value) as EstoquePageSize)
                                                );
                                            }}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                                        >
                                            <option value="10">10</option>
                                            <option value="50">50</option>
                                            <option value="100">100</option>
                                            <option value="500">500</option>
                                            <option value="ALL">Tudo</option>
                                        </select>
                                    </label>

                                    <span className="text-sm text-slate-600">
                                        Mostrando{" "}
                                        <b className="text-slate-900">
                                            {estoquePaginaInicio}-{estoquePaginaFim}
                                        </b>{" "}
                                        de <b className="text-slate-900">{estoqueRows.length}</b>
                                    </span>
                                </div>

                                {estoquePageSize !== "ALL" && estoqueRows.length > 0 ? (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            type="button"
                                            className="h-10 w-10 px-0"
                                            onClick={() => setEstoquePage(1)}
                                            disabled={estoquePage <= 1}
                                            title="Primeira página"
                                            aria-label="Primeira página"
                                        >
                                            «
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            type="button"
                                            className="h-10 w-10 px-0"
                                            onClick={() => setEstoquePage((p) => Math.max(1, p - 1))}
                                            disabled={estoquePage <= 1}
                                            title="Página anterior"
                                            aria-label="Página anterior"
                                        >
                                            ‹
                                        </Button>

                                        <span className="min-w-[110px] text-center text-sm text-slate-700">
                                            Página <b>{estoquePage}</b> de <b>{estoqueTotalPages}</b>
                                        </span>

                                        <Button
                                            variant="ghost"
                                            type="button"
                                            className="h-10 w-10 px-0"
                                            onClick={() =>
                                                setEstoquePage((p) =>
                                                    Math.min(estoqueTotalPages, p + 1)
                                                )
                                            }
                                            disabled={estoquePage >= estoqueTotalPages}
                                            title="Próxima página"
                                            aria-label="Próxima página"
                                        >
                                            ›
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            type="button"
                                            className="h-10 w-10 px-0"
                                            onClick={() => setEstoquePage(estoqueTotalPages)}
                                            disabled={estoquePage >= estoqueTotalPages}
                                            title="Última página"
                                            aria-label="Última página"
                                        >
                                            »
                                        </Button>
                                    </div>
                                ) : null}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-sm text-slate-700">
                                    Itens (unidades): <b>{estoqueResumo.totalUnidades}</b>
                                </div>

                                <div className="text-sm text-slate-700">
                                    Custo total do estoque:{" "}
                                    <b>
                                        {custosMediosLoading
                                            ? "Calculando..."
                                            : custosMediosErr
                                                ? "Indisponível"
                                                : moneyBRL(estoqueResumo.totalCusto)}
                                    </b>
                                </div>
                            </div>



                        </Card>
                    ) : null}

                    {/* CONFERÊNCIA */}
                    {tab === "CONFERENCIA" ? (
                        <Card className="p-4">
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => setConfFisicoByProd({})}
                                    disabled={!conferenciaRows.length}
                                >
                                    Limpar físicos
                                </Button>

                                {/* ✅ NOVO: abre popup com lista de conferências registradas */}
                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => setConfRegOpen(true)}
                                >
                                    Conferências Registradas
                                </Button>


                                <Button
                                    variant="soft"
                                    type="button"
                                    onClick={exportarConferenciaCSV}
                                    disabled={!conferenciaRows.length || !confDepositoId}
                                >
                                    ⬇️ CSV
                                </Button>

                                <Button
                                    variant="soft"
                                    type="button"
                                    onClick={exportarConferenciaPDF}
                                    disabled={!conferenciaRows.length || !confDepositoId}
                                >
                                    🧾 PDF
                                </Button>
                            </div>



                            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <div className="text-sm text-slate-700">
                                    Itens para conferência: <b>{conferenciaRows.length}</b>

                                    {confDepositoId ? (
                                        <>
                                            {" "}• Depósito:{" "}
                                            <b>{depositos.find((d) => Number(d.id) === Number(confDepositoId))?.nome || "—"}</b>
                                        </>
                                    ) : (
                                        <>
                                            {" "}• <span className="text-rose-700">Selecione um depósito no filtro</span>
                                        </>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="soft"
                                        type="button"
                                        onClick={() => setConfFilterOpen(true)}
                                    >
                                        🔎 Abrir filtro
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        type="button"
                                        onClick={limparFiltrosConferencia}
                                    >
                                        Limpar filtros
                                    </Button>
                                </div>
                            </div>




                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                                {loading ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Carregando...</div>
                                ) : conferenciaRows.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-slate-500">Nenhum registro encontrado.</div>
                                ) : (
                                    <>
                                        {/* MOBILE */}
                                        <ul className="divide-y divide-slate-200 sm:hidden">
                                            {conferenciaRows.map((r) => {
                                                const fisTxt = confFisicoByProd[r.p.id] ?? "";
                                                const fis = parseFisico(fisTxt);
                                                const diff = fis === null ? null : fis - r.qtdSistema;
                                                const ok = diff !== null && diff === 0;

                                                const icon = fis === null ? "—" : ok ? "✅" : "❌";
                                                const iconCls =
                                                    fis === null
                                                        ? "text-slate-400"
                                                        : ok
                                                            ? "text-emerald-600"
                                                            : "text-rose-600";

                                                return (
                                                    <li key={r.p.id} className="px-4 py-2">
                                                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                                                            <div className="flex items-center gap-3">
                                                                {/* NOME: sempre completo (pode quebrar linha) */}
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-[13px] font-semibold text-slate-900 leading-snug whitespace-normal break-words">
                                                                        {r.p.nome}
                                                                    </p>
                                                                </div>

                                                                {/* SISTEMA: label curto em cima do número */}
                                                                <div className="shrink-0 flex flex-col items-center">
                                                                    <span className="text-[10px] leading-none text-slate-500">Sist</span>
                                                                    <span className="mt-1 inline-flex min-w-[44px] justify-center rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-900">
                                                                        {r.qtdSistema}
                                                                    </span>
                                                                </div>

                                                                {/* FÍSICO: menor (metade) e mais à direita */}
                                                                <div className="shrink-0 w-[72px]">
                                                                    <TextInput
                                                                        inputMode="numeric"
                                                                        value={fisTxt}
                                                                        onChange={(e) =>
                                                                            setConfFisicoByProd((prev) => ({
                                                                                ...prev,
                                                                                [r.p.id]: e.target.value.replace(/\D/g, ""),
                                                                            }))
                                                                        }
                                                                        placeholder="Fís."
                                                                    />
                                                                </div>

                                                                {/* STATUS */}
                                                                <div className="shrink-0 w-7 flex justify-end">
                                                                    <span className={fis === null ? "text-slate-400" : ok ? "text-emerald-600" : "text-rose-600"}>
                                                                        {fis === null ? "—" : ok ? "✅" : "❌"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </li>

                                                );
                                            })}
                                        </ul>


                                        {/* PC */}
                                        <div className="hidden sm:block">
                                            <div className="overflow-auto">
                                                <table className="min-w-full border-separate border-spacing-0">
                                                    <thead>
                                                        <tr className="bg-slate-50 text-left text-xs text-slate-700">
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Produto</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Fabricante</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Qtd Sistema</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Qtd Física</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Dif.</th>
                                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-center">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {conferenciaRows.map((r) => {
                                                            const fisTxt = confFisicoByProd[r.p.id] ?? "";
                                                            const fis = parseFisico(fisTxt);
                                                            const ok = fis !== null && fis === r.qtdSistema;
                                                            const diff = fis === null ? null : fis - r.qtdSistema;

                                                            return (
                                                                <tr key={r.p.id} className="bg-white">
                                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-900">
                                                                        <div className="font-semibold">{r.p.nome}</div>
                                                                        <div className="text-xs text-slate-500 font-mono">CB: {r.p.codigo_barras}</div>
                                                                    </td>

                                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">
                                                                        {r.fabricante || "—"}
                                                                    </td>

                                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm font-semibold text-slate-900">
                                                                        {r.qtdSistema}
                                                                    </td>

                                                                    <td className="border-b border-slate-200 px-3 py-2">
                                                                        <TextInput
                                                                            inputMode="numeric"
                                                                            value={fisTxt}
                                                                            onChange={(e) =>
                                                                                setConfFisicoByProd((prev) => ({
                                                                                    ...prev,
                                                                                    [r.p.id]: e.target.value.replace(/\D/g, ""),
                                                                                }))
                                                                            }
                                                                            placeholder="Qtd física..."
                                                                        />
                                                                    </td>

                                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm">
                                                                        <span className={diff === null ? "text-slate-500" : ok ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>
                                                                            {diff === null ? "—" : diff}
                                                                        </span>
                                                                    </td>

                                                                    <td className="border-b border-slate-200 px-3 py-2 text-center">
                                                                        <span className={fis === null ? "text-slate-500" : ok ? "text-emerald-700" : "text-rose-700"}>
                                                                            {fis === null ? "—" : ok ? "✅" : "❌"}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* ✅ NOVO: Concluir (Registrar conferência) embaixo da lista */}
                            <div className="mt-4 flex items-center justify-between gap-2">
                                <div className="text-xs text-slate-500">
                                    {confTemFisicos ? "Pronto para concluir." : "Informe pelo menos uma Qtd física para concluir."}
                                </div>

                                <Button
                                    type="button"
                                    onClick={abrirSalvarConferencia}
                                    disabled={!conferenciaRows.length || !confDepositoId || !confTemFisicos}
                                >
                                    Concluir
                                </Button>
                            </div>


                            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                                Dica: o botão <b>PDF</b> abre a impressão — no celular/PC você pode escolher <b>Salvar como PDF</b>.
                            </div>
                        </Card>
                    ) : null}


                    {/* HISTÓRICO */}
                    {tab === "HISTORICO" ? (
                        <Card className="p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Histórico</h2>

                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" onClick={loadHistorico} disabled={histLoading} type="button">
                                        Atualizar
                                    </Button>
                                </div>
                            </div>

                            {histErr ? <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{histErr}</div> : null}

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
                                <div className="sm:col-span-3">
                                    <Field label="Buscar (produto, CB, destino, obs)">
                                        <TextInput value={histQ} onChange={(e) => setHistQ(e.target.value)} placeholder="Ex: URNA, 1745..., Obra X" />
                                    </Field>
                                </div>

                                <Field label="Tipo">
                                    <Select value={histTipo} onChange={(e) => setHistTipo(e.target.value as "Todos" | HistoricoRow["tipo"])}>
                                        <option value="Todos">Todos</option>
                                        <option value="ENTRADA">Entrada</option>
                                        <option value="SAIDA">Saída</option>
                                        <option value="TRANSFERENCIA">Transferência</option>
                                        <option value="CADASTRO_PRODUTO">Cadastro produto</option>
                                    </Select>
                                </Field>

                                <Field label="Limite">
                                    <Select value={histLimit} onChange={(e) => setHistLimit(Number(e.target.value))}>
                                        <option value={80}>80</option>
                                        <option value={120}>120</option>
                                        <option value={300}>300</option>
                                        <option value={500}>500</option>
                                    </Select>
                                </Field>

                                <div className="sm:col-span-6 flex flex-wrap gap-2">
                                    <Button onClick={loadHistorico} disabled={histLoading} type="button">
                                        Filtrar
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            setHistQ("");
                                            setHistTipo("Todos");
                                            setTimeout(() => loadHistorico(), 0);
                                        }}
                                        disabled={histLoading}
                                        type="button"
                                    >
                                        Limpar
                                    </Button>

                                    <div className="ml-auto flex items-center gap-2">
                                        <span className="text-xs text-slate-500">Mostrando: {histRows.length}</span>
                                    </div>
                                </div>
                            </div>

                            <ul className="divide-y divide-slate-200">
                                {histGrupos.map((grupo) => {
                                    const ref = grupo.rows[0];

                                    const tipoBadge =
                                        ref.tipo === "ENTRADA"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : ref.tipo === "SAIDA"
                                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                                : ref.tipo === "TRANSFERENCIA"
                                                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                    : "bg-slate-50 text-slate-700 border-slate-200";

                                    const origem =
                                        ref.deposito_origem_nome ||
                                        (ref.deposito_origem_id ? depById.get(ref.deposito_origem_id)?.nome : null);

                                    const destino =
                                        ref.deposito_destino_nome ||
                                        (ref.deposito_destino_id ? depById.get(ref.deposito_destino_id)?.nome : null);

                                    const totalQtd = grupo.rows.reduce((acc, item) => acc + (Number(item.quantidade) || 0), 0);
                                    const totalItens = grupo.rows.length;

                                    return (
                                        <li key={grupo.key} className="px-3 py-3 sm:px-4">
                                            <div className="space-y-2.5">
                                                {/* CABEÇALHO COMPACTO */}
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span
                                                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tipoBadge}`}
                                                            >
                                                                {ref.tipo}
                                                            </span>

                                                            <span className="text-xs text-slate-500">
                                                                {fmtDateTime(ref.criado_em)}
                                                            </span>
                                                        </div>

                                                        <div className="mt-1 text-sm text-slate-700 leading-snug">
                                                            {ref.tipo === "ENTRADA" ? (
                                                                <>
                                                                    <span className="text-slate-500">Depósito:</span>{" "}
                                                                    <b className="text-slate-800">{destino || "—"}</b>
                                                                </>
                                                            ) : ref.tipo === "SAIDA" ? (
                                                                <>
                                                                    <span className="text-slate-500">Depósito:</span>{" "}
                                                                    <b className="text-slate-800">{origem || "—"}</b>
                                                                    {" • "}
                                                                    <span className="text-slate-500">Destino:</span>{" "}
                                                                    <b className="text-slate-800">{ref.destino_texto || "—"}</b>
                                                                </>
                                                            ) : ref.tipo === "TRANSFERENCIA" ? (
                                                                <>
                                                                    <span className="text-slate-500">Origem:</span>{" "}
                                                                    <b className="text-slate-800">{origem || "—"}</b>
                                                                    {" • "}
                                                                    <span className="text-slate-500">Destino:</span>{" "}
                                                                    <b className="text-slate-800">{destino || "—"}</b>
                                                                </>
                                                            ) : (
                                                                <>—</>
                                                            )}
                                                        </div>

                                                        <div className="mt-0.5 text-xs text-slate-500 leading-snug">
                                                            Operador:{" "}
                                                            <b className="text-slate-700">
                                                                {ref.operador_nome || userById.get(ref.operador_usuario_id)?.nome || `#${ref.operador_usuario_id}`}
                                                            </b>
                                                            {ref.solicitante_usuario_id ? (
                                                                <>
                                                                    {" • "}Solicitante:{" "}
                                                                    <b className="text-slate-700">
                                                                        {ref.solicitante_nome || userById.get(ref.solicitante_usuario_id)?.nome || `#${ref.solicitante_usuario_id}`}
                                                                    </b>
                                                                </>
                                                            ) : null}
                                                            {ref.observacao ? <> {" • "}Obs: {ref.observacao}</> : null}
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 text-right">
                                                        <div className="text-sm font-semibold text-slate-900">
                                                            {totalItens} {totalItens === 1 ? "item" : "itens"}
                                                        </div>
                                                        <div className="text-xs text-slate-500">
                                                            qtd total <b className="text-slate-700">{totalQtd}</b>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* LISTA INTERNA MAIS LIMPA */}
                                                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
                                                    {grupo.rows.map((h, idx) => (
                                                        <div
                                                            key={h.id}
                                                            className={[
                                                                "grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5",
                                                                idx !== grupo.rows.length - 1 ? "border-b border-slate-200" : "",
                                                            ].join(" ")}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="truncate text-sm font-medium text-slate-900">
                                                                    {h.produto_nome || `Produto ${h.produto_id}`}
                                                                </div>
                                                                <div className="text-xs text-slate-500">
                                                                    CB {h.codigo_barras_snapshot}
                                                                    {h.numero_lote_snapshot ? <> • Lote {h.numero_lote_snapshot}</> : null}
                                                                    {h.custo_unitario_snapshot !== null && h.custo_unitario_snapshot !== undefined ? <> • Custo {moneyBRL(Number(h.custo_unitario_snapshot) || 0)}</> : null}
                                                                </div>
                                                            </div>

                                                            <div className="text-right">
                                                                <div className="text-sm font-semibold text-slate-900">
                                                                    {h.quantidade === null ? "—" : h.quantidade}
                                                                </div>
                                                                <div className="text-[11px] text-slate-500">qtd</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Card>
                    ) : null}

                    {/* AVANÇADO */}
                    {tab === "AVANCADO" ? (
                        <Card className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-slate-900">Avançado</h2>
                                </div>
                            </div>

                            {/* GRID DE AÇÕES (PADRÃO MENU AZUL) */}
                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                                <AdvActionButton
                                    label="Cadastrar novo produto"
                                    onClick={() => setAdvNovoProdutoOpen(true)}
                                    icon={<span className="text-lg leading-none">+</span>}
                                />

                                <AdvActionButton
                                    label="Ajuste manual de saldos"
                                    onClick={() => setAdvAjusteOpen(true)}
                                    icon={<span className="text-lg leading-none">⚙️</span>}
                                />

                                <AdvActionButton
                                    label="Adicionar depósito"
                                    onClick={() => setAdvDepAddOpen(true)}
                                    icon={<span className="text-lg leading-none">🏠</span>}
                                />

                                <AdvActionButton
                                    label="Renomear depósito"
                                    onClick={() => setAdvDepRenameOpen(true)}
                                    icon={<span className="text-lg leading-none">✏️</span>}
                                />

                                <AdvActionButton
                                    label="Adicionar categoria"
                                    onClick={() => setAdvCatAddOpen(true)}
                                    icon={<span className="text-lg leading-none">📦</span>}
                                />

                                <AdvActionButton
                                    label="Renomear categoria"
                                    onClick={() => setAdvCatRenameOpen(true)}
                                    icon={<span className="text-lg leading-none">✏️</span>}
                                />

                                <AdvActionButton
                                    label="Adicionar fabricante"
                                    onClick={() => setAdvFabAddOpen(true)}
                                    icon={<span className="text-lg leading-none">🏭</span>}
                                />

                                <AdvActionButton
                                    label="Renomear fabricante"
                                    onClick={() => setAdvFabRenameOpen(true)}
                                    icon={<span className="text-lg leading-none">✏️</span>}
                                />

                                <AdvActionButton
                                    label="Materiais de Assistência"
                                    onClick={() => {
                                        window.location.href = "/assistencia";
                                    }}
                                    icon={<span className="text-lg leading-none">🧰</span>}
                                />

                                <AdvActionButton
                                    label="Exportação (CSV)"
                                    onClick={() => setAdvExportOpen(true)}
                                    icon={<span className="text-lg leading-none">↓</span>}
                                />

                                <AdvActionButton
                                    label="Importar via CSV"
                                    onClick={() => setAdvImportOpen(true)}
                                    icon={<span className="text-lg leading-none">↑</span>}
                                />
                            </div>
                        </Card>
                    ) : null}

                </div>
            </div>

            {/* POPUP IMAGEM */}
            <ImagePreviewModal open={imgOpen} onClose={() => setImgOpen(false)} url={imgUrl} title={imgTitle} />

            {/* MODAL: EDITAR PRODUTO */}
            <Modal
                open={prodEditOpen}
                title="Editar produto"
                onClose={() => setProdEditOpen(false)}
                closeOnEsc
                panelClassName="sm:max-w-5xl"
                bodyClassName="p-0"
            >
                {(() => {
                    const p = prodEditId ? prodById.get(prodEditId) : null;

                    const fotoAtual = getProdutoFotoPrincipal(p);
                    const fotoPrincipalExistente =
                        editFotosExistentes.find(
                            (f) => Number(f.is_principal || 0) === 1
                        ) || editFotosExistentes[0];
                    const fotoPrincipalNova =
                        editFotosNovas.find(
                            (f) => Number(f.is_principal) === 1
                        ) || editFotosNovas[0];
                    const fotoPreview =
                        fotoPrincipalNova?.foto_url ||
                        resolveProdutoFotoUrl(fotoPrincipalExistente) ||
                        editFotoNova ||
                        fotoAtual;

                    const saldoRows = saldos
                        .filter(
                            (saldo) =>
                                Number(saldo.produto_id) === Number(prodEditId)
                        )
                        .map((saldo) => ({
                            saldo,
                            deposito: depById.get(Number(saldo.deposito_id)),
                        }))
                        .filter(
                            (
                                row
                            ): row is {
                                saldo: Saldo;
                                deposito: Deposito;
                            } => Boolean(row.deposito)
                        )
                        .sort((a, b) =>
                            a.deposito.nome.localeCompare(
                                b.deposito.nome,
                                "pt-BR"
                            )
                        );

                    const totalSaldo = saldoRows.reduce(
                        (total, row) =>
                            total + clampInt(row.saldo.quantidade),
                        0
                    );
                    const depositosVinculadosIds = new Set(
                        saldoRows.map((row) => Number(row.deposito.id))
                    );
                    const depositosDisponiveisParaAdicionar = depositos.filter(
                        (deposito) => !depositosVinculadosIds.has(Number(deposito.id))
                    );

                    const tabs: Array<{
                        key: ProdutoEditTab;
                        label: string;
                        icon: React.ReactNode;
                    }> = [
                            {
                                key: "DADOS",
                                label: "Dados",
                                icon: (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                        <path d="M14 3v5h5M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                ),
                            },
                            {
                                key: "ESTOQUE",
                                label: "Estoque",
                                icon: (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M4 8.5L12 4l8 4.5v8L12 21l-8-4.5v-8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                        <path d="M4 8.5l8 4.5 8-4.5M12 13v8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                    </svg>
                                ),
                            },
                            {
                                key: "VALOR",
                                label: "Valor",
                                icon: (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" stroke="currentColor" strokeWidth="1.8" />
                                        <path d="M4 9h16M8 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                ),
                            },
                            {
                                key: "CUSTO",
                                label: "Preço de custo",
                                icon: (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                                        <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                ),
                            },
                        ];

                    return (
                        <div className="flex min-h-0 flex-col">
                            <div className="border-b border-slate-100 bg-white p-4 sm:p-5">
                                <div className="flex items-start gap-4">
                                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 sm:h-24 sm:w-24">
                                        {fotoPreview ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={fotoPreview}
                                                alt="Foto do produto"
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-2xl">
                                                🖼️
                                            </div>
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="line-clamp-2 text-base font-bold text-slate-900 sm:text-lg">
                                            {p?.nome || "Produto"}
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                                            <span className="rounded-full bg-slate-100 px-3 py-1">
                                                Código: <b>{p?.codigo_barras || "—"}</b>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border-b border-slate-100 bg-slate-50/80 p-4 sm:p-5">
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                    {tabs.map((item) => {
                                        const active = prodEditTab === item.key;
                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() => setProdEditTab(item.key)}
                                                aria-pressed={active}
                                                className={[
                                                    "group flex min-h-[116px] flex-col items-center justify-center gap-3 rounded-2xl border bg-white p-4 text-center shadow-sm transition-all hover:-translate-y-px hover:shadow-md sm:min-h-[124px] sm:p-5",
                                                    active
                                                        ? "border-sky-300 bg-sky-50 text-slate-950 ring-2 ring-sky-100"
                                                        : "border-slate-200 text-slate-700 hover:border-slate-300",
                                                ].join(" ")}
                                            >
                                                <span
                                                    className={[
                                                        "grid h-12 w-12 shrink-0 place-items-center rounded-full transition-colors sm:h-14 sm:w-14",
                                                        active
                                                            ? "bg-sky-600 text-white"
                                                            : "bg-sky-100 text-sky-700 group-hover:bg-sky-600 group-hover:text-white",
                                                    ].join(" ")}
                                                >
                                                    {item.icon}
                                                </span>
                                                <span className="block max-w-full text-center text-[13px] font-extrabold leading-tight tracking-tight text-current sm:text-sm">
                                                    {item.label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="p-4 sm:p-5">
                                {prodEditTab === "DADOS" ? (
                                    <div className="space-y-5">
                                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                <div className="sm:col-span-2">
                                                    <Field label="Nome">
                                                        <TextInput
                                                            value={editNome}
                                                            onChange={(e) =>
                                                                setEditNome(e.target.value)
                                                            }
                                                        />
                                                    </Field>
                                                </div>

                                                <Field label="Categoria">
                                                    <Select
                                                        value={editCatId}
                                                        onChange={(e) =>
                                                            setEditCatId(
                                                                Number(e.target.value)
                                                            )
                                                        }
                                                    >
                                                        <option value={0}>—</option>
                                                        {categorias.map((c) => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.nome}
                                                            </option>
                                                        ))}
                                                    </Select>
                                                </Field>

                                                <Field label="Fabricante">
                                                    <Select
                                                        value={editFabId}
                                                        onChange={(e) =>
                                                            setEditFabId(
                                                                Number(e.target.value)
                                                            )
                                                        }
                                                    >
                                                        <option value={0}>—</option>
                                                        {fabricantes.map((f) => (
                                                            <option key={f.id} value={f.id}>
                                                                {f.nome}
                                                            </option>
                                                        ))}
                                                    </Select>
                                                </Field>

                                                <Field label="Classificação">
                                                    <Select
                                                        value={editClassId}
                                                        onChange={(e) =>
                                                            setEditClassId(
                                                                Number(e.target.value)
                                                            )
                                                        }
                                                    >
                                                        <option value={0}>—</option>
                                                        {classificacoes.map((c) => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.nome}
                                                            </option>
                                                        ))}
                                                    </Select>
                                                </Field>

                                                <Field label="Situação">
                                                    <Select
                                                        value={editAtivo}
                                                        onChange={(e) =>
                                                            setEditAtivo(Number(e.target.value) === 1 ? 1 : 0)
                                                        }
                                                    >
                                                        <option value={1}>Ativo</option>
                                                        <option value={0}>Inativo</option>
                                                    </Select>
                                                </Field>
                                            </div>
                                        </section>

                                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <h3 className="text-sm font-bold text-slate-900">
                                                        Fotos do produto
                                                    </h3>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Defina uma foto principal e mantenha as demais na galeria.
                                                    </p>
                                                </div>

                                                {fotoPreview ? (
                                                    <Button
                                                        variant="ghost"
                                                        type="button"
                                                        onClick={() => {
                                                            setImgUrl(fotoPreview);
                                                            setImgTitle(
                                                                p?.nome ||
                                                                "Imagem do produto"
                                                            );
                                                            setImgOpen(true);
                                                        }}
                                                    >
                                                        Ampliar principal
                                                    </Button>
                                                ) : null}
                                            </div>

                                            <div className="mt-4">
                                                <Field
                                                    label="Adicionar fotos"
                                                    hint="É possível selecionar vários arquivos de uma vez."
                                                >
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        multiple
                                                        onChange={(e) =>
                                                            onProdutoFotoNova(
                                                                e.target.files
                                                            )
                                                        }
                                                        className="block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-700"
                                                    />
                                                </Field>
                                            </div>

                                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                                {editFotosExistentes.map((foto) => {
                                                    const url =
                                                        resolveProdutoFotoUrl(foto);
                                                    const isPrincipal =
                                                        Number(
                                                            foto.is_principal || 0
                                                        ) === 1;

                                                    return (
                                                        <div
                                                            key={`exist_${foto.id}`}
                                                            className={[
                                                                "overflow-hidden rounded-2xl border bg-white p-2",
                                                                isPrincipal
                                                                    ? "border-sky-300 ring-2 ring-sky-100"
                                                                    : "border-slate-200",
                                                            ].join(" ")}
                                                        >
                                                            <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                                                {url ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img
                                                                        src={url}
                                                                        alt="Foto do produto"
                                                                        className="h-full w-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="flex h-full items-center justify-center text-xl">
                                                                        🖼️
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="mt-2 space-y-1">
                                                                <Button
                                                                    variant={
                                                                        isPrincipal
                                                                            ? "solid"
                                                                            : "ghost"
                                                                    }
                                                                    type="button"
                                                                    className="w-full px-2 py-1 text-xs"
                                                                    onClick={() =>
                                                                        marcarFotoPrincipalExistente(
                                                                            foto.id
                                                                        )
                                                                    }
                                                                >
                                                                    {isPrincipal
                                                                        ? "Principal"
                                                                        : "Tornar principal"}
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    type="button"
                                                                    className="w-full px-2 py-1 text-xs"
                                                                    onClick={() =>
                                                                        removerFotoExistente(
                                                                            foto.id
                                                                        )
                                                                    }
                                                                >
                                                                    Remover
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {editFotosNovas.map((foto) => {
                                                    const isPrincipal =
                                                        Number(foto.is_principal) === 1;
                                                    return (
                                                        <div
                                                            key={`new_${foto.temp_id}`}
                                                            className={[
                                                                "overflow-hidden rounded-2xl border bg-white p-2",
                                                                isPrincipal
                                                                    ? "border-sky-300 ring-2 ring-sky-100"
                                                                    : "border-slate-200",
                                                            ].join(" ")}
                                                        >
                                                            <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={foto.foto_url}
                                                                    alt="Nova foto"
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            </div>
                                                            <div className="mt-2 space-y-1">
                                                                <Button
                                                                    variant={
                                                                        isPrincipal
                                                                            ? "solid"
                                                                            : "ghost"
                                                                    }
                                                                    type="button"
                                                                    className="w-full px-2 py-1 text-xs"
                                                                    onClick={() =>
                                                                        marcarFotoPrincipalNova(
                                                                            foto.temp_id
                                                                        )
                                                                    }
                                                                >
                                                                    {isPrincipal
                                                                        ? "Principal"
                                                                        : "Tornar principal"}
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    type="button"
                                                                    className="w-full px-2 py-1 text-xs"
                                                                    onClick={() =>
                                                                        removerFotoNova(
                                                                            foto.temp_id
                                                                        )
                                                                    }
                                                                >
                                                                    Remover
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {!editFotosExistentes.length &&
                                                    !editFotosNovas.length ? (
                                                    <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                                                        Este produto ainda não possui fotos.
                                                    </div>
                                                ) : null}
                                            </div>
                                        </section>

                                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <Field label="Descrição">
                                                <TextArea
                                                    value={editDescricao}
                                                    onChange={(e) => setEditDescricao(e.target.value)}
                                                    placeholder="Descreva o produto..."
                                                    rows={5}
                                                />
                                            </Field>
                                        </section>

                                    </div>
                                ) : null}

                                {prodEditTab === "ESTOQUE" ? (
                                    <div className="space-y-5">
                                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                            <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <h3 className="text-sm font-bold text-slate-900">
                                                        Saldo por depósito
                                                    </h3>
                                                </div>
                                                <div className="rounded-2xl bg-slate-900 px-4 py-2 text-white">
                                                    <p className="text-[10px] uppercase tracking-wide text-slate-300">
                                                        Total
                                                    </p>
                                                    <p className="text-xl font-bold">
                                                        {totalSaldo}
                                                    </p>
                                                </div>
                                            </div>

                                            {saldoRows.length === 0 ? (
                                                <div className="p-6 text-center text-sm text-slate-500">
                                                    Nenhum saldo por depósito foi encontrado.
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="hidden overflow-x-auto md:block">
                                                        <table className="w-full min-w-[680px] border-collapse">
                                                            <thead className="bg-slate-50">
                                                                <tr className="text-left text-xs font-semibold text-slate-600">
                                                                    <th className="px-4 py-3">
                                                                        Depósito
                                                                    </th>
                                                                    <th className="px-4 py-3 text-right">
                                                                        Quantidade
                                                                    </th>
                                                                    <th className="px-4 py-3 text-right">
                                                                        Mínimo
                                                                    </th>
                                                                    <th className="px-4 py-3 text-right">
                                                                        Máximo
                                                                    </th>
                                                                    <th className="px-4 py-3 text-right">
                                                                        Reposição
                                                                    </th>
                                                                    <th className="px-4 py-3 text-right">
                                                                        Ação
                                                                    </th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {saldoRows.map(
                                                                    ({
                                                                        saldo,
                                                                        deposito,
                                                                    }) => {
                                                                        const qtd =
                                                                            clampInt(
                                                                                saldo.quantidade
                                                                            );
                                                                        const min =
                                                                            clampInt(
                                                                                saldo.minimo
                                                                            );
                                                                        const max =
                                                                            clampInt(
                                                                                saldo.maximo
                                                                            );
                                                                        const rep =
                                                                            max > 0
                                                                                ? Math.max(
                                                                                    0,
                                                                                    max - qtd
                                                                                )
                                                                                : 0;
                                                                        return (
                                                                            <tr
                                                                                key={
                                                                                    saldo.id
                                                                                }
                                                                                className="border-t border-slate-100"
                                                                            >
                                                                                <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                                                                                    {
                                                                                        deposito.nome
                                                                                    }
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-base font-bold text-slate-900">
                                                                                    {qtd}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-sm text-slate-600">
                                                                                    {min}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-sm text-slate-600">
                                                                                    {max}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-sm text-slate-600">
                                                                                    {rep}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    <Button
                                                                                        type="button"
                                                                                        variant="ghost"
                                                                                        className="w-auto px-3 py-2 text-xs"
                                                                                        disabled={produtoDepositoBusy || qtd > 0}
                                                                                        onClick={() => removerProdutoDoDeposito(deposito.id, deposito.nome)}
                                                                                    >
                                                                                        Remover
                                                                                    </Button>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    }
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
                                                        {saldoRows.map(
                                                            ({ saldo, deposito }) => {
                                                                const qtd = clampInt(
                                                                    saldo.quantidade
                                                                );
                                                                const min = clampInt(
                                                                    saldo.minimo
                                                                );
                                                                const max = clampInt(
                                                                    saldo.maximo
                                                                );
                                                                const rep =
                                                                    max > 0
                                                                        ? Math.max(
                                                                            0,
                                                                            max - qtd
                                                                        )
                                                                        : 0;
                                                                return (
                                                                    <div
                                                                        key={saldo.id}
                                                                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                                                    >
                                                                        <div className="flex items-start justify-between gap-3">
                                                                            <div className="min-w-0">
                                                                                <p className="break-words text-sm font-bold text-slate-900">
                                                                                    {
                                                                                        deposito.nome
                                                                                    }
                                                                                </p>
                                                                                <p className="mt-1 text-xs text-slate-500">
                                                                                    Mín {min} · Máx {max} · Rep {rep}
                                                                                </p>
                                                                            </div>
                                                                            <div className="text-right">
                                                                                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                                                                    Saldo
                                                                                </p>
                                                                                <p className="text-2xl font-bold text-slate-900">
                                                                                    {qtd}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            className="mt-3 w-full"
                                                                            disabled={produtoDepositoBusy || qtd > 0}
                                                                            onClick={() => removerProdutoDoDeposito(deposito.id, deposito.nome)}
                                                                        >
                                                                            {qtd > 0 ? "Remova o saldo antes" : "Remover deste depósito"}
                                                                        </Button>
                                                                    </div>
                                                                );
                                                            }
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </section>

                                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <h3 className="text-sm font-bold text-slate-900">Adicionar a outro depósito</h3>
                                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                                                <div className="min-w-0 flex-1">
                                                    <Field label="Novo depósito">
                                                        <Select
                                                            value={editNovoDepositoId}
                                                            onChange={(e) => setEditNovoDepositoId(Number(e.target.value))}
                                                            disabled={produtoDepositoBusy || depositosDisponiveisParaAdicionar.length === 0}
                                                        >
                                                            <option value={0}>Selecionar...</option>
                                                            {depositosDisponiveisParaAdicionar.map((deposito) => (
                                                                <option key={deposito.id} value={deposito.id}>
                                                                    {deposito.nome}
                                                                </option>
                                                            ))}
                                                        </Select>
                                                    </Field>
                                                </div>
                                                <Button
                                                    type="button"
                                                    onClick={adicionarProdutoAoDeposito}
                                                    disabled={produtoDepositoBusy || !editNovoDepositoId}
                                                >
                                                    {produtoDepositoBusy ? "Processando..." : "+ Adicionar depósito"}
                                                </Button>
                                            </div>
                                            {depositosDisponiveisParaAdicionar.length === 0 ? (
                                                <p className="mt-3 text-xs text-slate-500">O produto já está vinculado a todos os depósitos.</p>
                                            ) : null}
                                        </section>

                                        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <h3 className="text-sm font-bold text-slate-900">
                                                Mín/Máx por depósito
                                            </h3>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Escolha um depósito para alterar os limites daquele estoque.
                                            </p>

                                            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                                                <Field label="Depósito">
                                                    <Select
                                                        value={editMinMaxDepId}
                                                        onChange={(e) =>
                                                            setEditMinMaxDepId(
                                                                Number(e.target.value)
                                                            )
                                                        }
                                                    >
                                                        <option value={0} disabled>
                                                            Selecionar...
                                                        </option>
                                                        {saldoRows.map(({ deposito }) => (
                                                            <option key={deposito.id} value={deposito.id}>
                                                                {deposito.nome}
                                                            </option>
                                                        ))}
                                                    </Select>
                                                </Field>

                                                <Field label="Mínimo">
                                                    <TextInput
                                                        type="number"
                                                        min={0}
                                                        value={editMinDep}
                                                        onChange={(e) =>
                                                            setEditMinDep(
                                                                clampInt(e.target.value)
                                                            )
                                                        }
                                                        disabled={!editMinMaxDepId}
                                                    />
                                                </Field>

                                                <Field label="Máximo">
                                                    <TextInput
                                                        type="number"
                                                        min={0}
                                                        value={editMaxDep}
                                                        onChange={(e) =>
                                                            setEditMaxDep(
                                                                clampInt(e.target.value)
                                                            )
                                                        }
                                                        disabled={!editMinMaxDepId}
                                                    />
                                                </Field>
                                            </div>

                                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                                <Button
                                                    variant="solid"
                                                    type="button"
                                                    onClick={salvarMinMaxDoDeposito}
                                                    disabled={
                                                        !prodEditId ||
                                                        !editMinMaxDepId ||
                                                        minMaxBusy
                                                    }
                                                >
                                                    {minMaxBusy
                                                        ? "Salvando..."
                                                        : "Salvar mín/máx do depósito"}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    type="button"
                                                    onClick={() => {
                                                        setEditMinMaxDepId(0);
                                                        setEditMinDep(0);
                                                        setEditMaxDep(0);
                                                    }}
                                                >
                                                    Limpar seleção
                                                </Button>
                                            </div>
                                        </section>
                                    </div>
                                ) : null}

                                {prodEditTab === "VALOR" ? (
                                    <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-end">
                                            <div className="rounded-2xl bg-slate-50 p-4 sm:p-5">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                    Valor atual
                                                </p>
                                                <p className="mt-2 break-words text-3xl font-bold text-slate-900">
                                                    {editValor}
                                                </p>
                                            </div>

                                            <div className="rounded-2xl border border-slate-100 bg-white p-1">
                                                <Field label="Valor do produto (R$)">
                                                    <TextInput
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={editValor}
                                                        onChange={(e) =>
                                                            setEditValor(
                                                                maskBRLInput(
                                                                    e.target.value
                                                                )
                                                            )
                                                        }
                                                        placeholder="R$ 0,00"
                                                        className="py-3 text-lg font-semibold"
                                                    />
                                                </Field>
                                            </div>
                                        </div>
                                    </section>
                                ) : null}

                                {prodEditTab === "CUSTO" ? (
                                    <div className="space-y-5">
                                        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preço de custo atual</p>
                                                <p className="mt-2 text-3xl font-bold text-slate-900">{editPrecoCusto}</p>
                                            </div>
                                            <div className="rounded-2xl bg-slate-900 p-4 text-white shadow-sm">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Lotes com saldo</p>
                                                <p className="mt-2 text-3xl font-bold">{clampInt(prodCustoDetalhe?.resumo?.lotes_disponiveis)}</p>
                                            </div>
                                        </section>

                                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <button
                                                    type="button"
                                                    onClick={() => abrirAjusteCusto("NOVO_PRECO")}
                                                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
                                                >
                                                    <span className="grid h-11 w-11 place-items-center rounded-full bg-sky-100 text-xl text-sky-700">＋</span>
                                                    <span className="mt-3 block text-sm font-bold text-slate-900">Novo preço de custo</span>
                                                    <span className="mt-1 block text-xs text-slate-500">Preenche ou atualiza o custo do cadastro. O frete é rateado pelo saldo atual.</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => abrirAjusteCusto("LOTE")}
                                                    disabled={!(prodCustoDetalhe?.lotes || []).some((lote) => clampInt(lote.quantidade_atual) > 0)}
                                                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <span className="grid h-11 w-11 place-items-center rounded-full bg-sky-100 text-xl text-sky-700">✎</span>
                                                    <span className="mt-3 block text-sm font-bold text-slate-900">Corrigir lote</span>
                                                    <span className="mt-1 block text-xs text-slate-500">Corrige custo e frete de um lote que ainda possui quantidade disponível.</span>
                                                </button>
                                            </div>
                                        </section>

                                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
                                                <h3 className="text-sm font-bold text-slate-900">Entradas e preços de custo por lote</h3>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="w-auto"
                                                    onClick={() => prodEditId && carregarEntradasCustoProduto(prodEditId)}
                                                    disabled={prodEntradasCustoLoading}
                                                >
                                                    {prodEntradasCustoLoading ? "Atualizando..." : "Atualizar lista"}
                                                </Button>
                                            </div>

                                            {prodEntradasCustoErr ? (
                                                <div className="p-4 text-sm text-rose-700">{prodEntradasCustoErr}</div>
                                            ) : prodEntradasCustoLoading ? (
                                                <div className="p-6 text-center text-sm text-slate-500">Carregando entradas...</div>
                                            ) : prodEntradasCusto.length === 0 ? (
                                                <div className="p-6 text-center text-sm text-slate-500">Nenhuma entrada registrada para este produto.</div>
                                            ) : (
                                                <>
                                                    <div className="hidden overflow-x-auto md:block">
                                                        <table className="w-full min-w-[650px] border-collapse">
                                                            <thead className="bg-slate-50">
                                                                <tr className="text-left text-xs font-semibold text-slate-600">
                                                                    <th className="px-4 py-3">Data</th>
                                                                    <th className="px-4 py-3">Lote</th>
                                                                    <th className="px-4 py-3">Usuário</th>
                                                                    <th className="px-4 py-3 text-right">Custo atual</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {prodEntradasCusto.map((entrada) => {
                                                                    const lote = (prodCustoDetalhe?.lotes || []).find(
                                                                        (item) => Number(item.id) === Number(entrada.lote_id)
                                                                    );
                                                                    const isNovoPreco = entrada.registro_custo_tipo === "NOVO_PRECO";
                                                                    const numeroLote = isNovoPreco
                                                                        ? ""
                                                                        : String(entrada.numero_lote_snapshot || lote?.numero_lote || "");
                                                                    const custoAtual = Number(
                                                                        entrada.custo_atual ?? lote?.custo_unitario ?? entrada.custo_unitario_snapshot ?? 0
                                                                    ) || 0;
                                                                    return (
                                                                        <tr
                                                                            key={`${entrada.registro_custo_tipo || "ENTRADA"}-${entrada.id}`}
                                                                            className="border-t border-slate-100 text-sm"
                                                                        >
                                                                            <td className="px-4 py-3 text-slate-600">{fmtDateTime(entrada.criado_em)}</td>
                                                                            <td className="px-4 py-3 font-mono text-xs text-slate-900">{numeroLote}</td>
                                                                            <td className="px-4 py-3 text-slate-700">{entrada.operador_nome || "—"}</td>
                                                                            <td className="px-4 py-3 text-right font-bold text-slate-900">{moneyBRL(custoAtual)}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-3 p-4 md:hidden">
                                                        {prodEntradasCusto.map((entrada) => {
                                                            const lote = (prodCustoDetalhe?.lotes || []).find(
                                                                (item) => Number(item.id) === Number(entrada.lote_id)
                                                            );
                                                            const isNovoPreco = entrada.registro_custo_tipo === "NOVO_PRECO";
                                                            const numeroLote = isNovoPreco
                                                                ? ""
                                                                : String(entrada.numero_lote_snapshot || lote?.numero_lote || "");
                                                            const custoAtual = Number(
                                                                entrada.custo_atual ?? lote?.custo_unitario ?? entrada.custo_unitario_snapshot ?? 0
                                                            ) || 0;
                                                            return (
                                                                <div
                                                                    key={`${entrada.registro_custo_tipo || "ENTRADA"}-${entrada.id}`}
                                                                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                                                >
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            {numeroLote ? (
                                                                                <p className="break-all text-sm font-bold text-slate-900">Lote {numeroLote}</p>
                                                                            ) : null}
                                                                            <p className={numeroLote ? "mt-1 text-xs text-slate-500" : "text-xs text-slate-500"}>
                                                                                {fmtDateTime(entrada.criado_em)}
                                                                            </p>
                                                                            <p className="mt-1 text-xs text-slate-600">Usuário: {entrada.operador_nome || "—"}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Custo atual</p>
                                                                            <p className="mt-1 text-base font-bold text-slate-900">{moneyBRL(custoAtual)}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            )}
                                        </section>

                                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                            <div className="border-b border-slate-100 p-4">
                                                <h3 className="text-sm font-bold text-slate-900">Histórico de ajustes</h3>
                                            </div>
                                            {(prodCustoDetalhe?.ajustes || []).length === 0 ? (
                                                <div className="p-6 text-center text-sm text-slate-500">Nenhum ajuste registrado.</div>
                                            ) : (
                                                <div className="divide-y divide-slate-100">
                                                    {(prodCustoDetalhe?.ajustes || []).map((ajuste) => {
                                                        const titulo = ajuste.tipo === "LOTE"
                                                            ? "Correção de lote"
                                                            : ajuste.tipo === "REAVALIACAO"
                                                                ? "Reavaliação anterior"
                                                                : "Novo preço de custo";
                                                        return (
                                                            <div key={ajuste.id} className="grid gap-2 p-4 text-sm sm:grid-cols-[170px_1fr_auto] sm:items-center">
                                                                <div className="text-slate-600">
                                                                    <p className="font-semibold text-slate-900">{titulo}</p>
                                                                    <p className="mt-1 text-xs">{fmtDateTime(ajuste.criado_em)}</p>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="break-words text-slate-700">{ajuste.observacao || "Sem observação."}</p>
                                                                    <p className="mt-1 text-xs text-slate-500">Por {ajuste.usuario_nome || `Usuário #${ajuste.usuario_id}`}</p>
                                                                    <p className="mt-1 text-xs text-slate-500">Base {moneyBRL(Number(ajuste.custo_base_novo ?? ajuste.novo_custo) || 0)} · Frete {moneyBRL(Number(ajuste.frete_total) || 0)}</p>
                                                                </div>
                                                                <div className="text-left sm:text-right">
                                                                    <p className="font-bold text-slate-900">{moneyBRL(Number(ajuste.novo_custo) || 0)}</p>
                                                                    {Number(ajuste.valor_diferenca) !== 0 ? (
                                                                        <p className={["mt-1 text-xs font-semibold", Number(ajuste.valor_diferenca) > 0 ? "text-emerald-700" : "text-rose-700"].join(" ")}>
                                                                            {Number(ajuste.valor_diferenca) > 0 ? "+" : ""}{moneyBRL(Number(ajuste.valor_diferenca) || 0)}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </section>
                                    </div>
                                ) : null}
                            </div>

                            <div className="border-t border-slate-200 bg-white p-4 sm:p-5">
                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setProdEditOpen(false)}
                                        disabled={prodBusy}
                                        type="button"
                                    >
                                        Fechar
                                    </Button>
                                    <Button
                                        onClick={salvarCadastroProduto}
                                        disabled={prodBusy || !editNome.trim()}
                                        type="button"
                                    >
                                        {prodBusy
                                            ? "Salvando..."
                                            : "Salvar alterações"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* MODAL: AJUSTE DE PREÇO DE CUSTO */}
            <Modal
                open={custoAjusteOpen}
                title={custoAjusteConfirmOpen ? "Confirmar ajuste de custo" : "Ajustar preço de custo"}
                onClose={() => {
                    if (custoAjusteBusy) return;
                    setCustoAjusteConfirmOpen(false);
                    setCustoAjusteOpen(false);
                }}
                closeOnEsc={!custoAjusteBusy}
                panelClassName="sm:max-w-3xl"
            >
                {(() => {
                    const lotesDisponiveis = (prodCustoDetalhe?.lotes || []).filter(
                        (lote) => clampInt(lote.quantidade_atual) > 0
                    );
                    const resumo = calcularResumoAjusteCusto();

                    if (custoAjusteConfirmOpen) {
                        return (
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                                    <p className="text-sm font-bold text-slate-900">Resumo do ajuste</p>
                                    <p className="mt-1 text-xs text-slate-600">
                                        Confira os valores abaixo. O ajuste será registrado no histórico depois da confirmação.
                                    </p>
                                </div>

                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                    <dl className="divide-y divide-slate-100 text-sm">
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-slate-500">Produto</dt>
                                            <dd className="font-semibold text-slate-900">{resumo.produto?.nome || "—"}</dd>
                                        </div>
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-slate-500">Operação</dt>
                                            <dd className="font-semibold text-slate-900">{custoAjusteTipo === "LOTE" ? "Corrigir lote" : "Novo preço de custo"}</dd>
                                        </div>
                                        {custoAjusteTipo === "LOTE" ? (
                                            <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                                <dt className="text-slate-500">Lote</dt>
                                                <dd className="break-all font-mono text-xs font-semibold text-slate-900">{resumo.lote?.numero_lote || "—"}</dd>
                                            </div>
                                        ) : null}
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-slate-500">Custo base</dt>
                                            <dd className="font-semibold text-slate-900">{moneyBRL(resumo.custoBase)}</dd>
                                        </div>
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-slate-500">Frete total</dt>
                                            <dd className="font-semibold text-slate-900">{moneyBRL(resumo.freteTotal)}</dd>
                                        </div>
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-slate-500">Quantidade do rateio</dt>
                                            <dd className="font-semibold text-slate-900">{resumo.quantidadeRateio}</dd>
                                        </div>
                                        <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                            <dt className="text-slate-500">Frete por unidade</dt>
                                            <dd className="font-semibold text-slate-900">{moneyBRL(resumo.freteUnitario)}</dd>
                                        </div>
                                        <div className="grid grid-cols-[140px_1fr] gap-3 bg-slate-50 p-3">
                                            <dt className="font-semibold text-slate-700">Novo custo final</dt>
                                            <dd className="text-lg font-bold text-slate-950">{moneyBRL(resumo.custoFinal)}</dd>
                                        </div>
                                        {custoAjusteTipo === "LOTE" ? (
                                            <>
                                                <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                                    <dt className="text-slate-500">Saldo afetado</dt>
                                                    <dd className="font-semibold text-slate-900">{resumo.quantidadeAfetada}</dd>
                                                </div>
                                                <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                                    <dt className="text-slate-500">Valor atual</dt>
                                                    <dd className="font-semibold text-slate-900">{moneyBRL(resumo.valorAnterior)}</dd>
                                                </div>
                                                <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                                    <dt className="text-slate-500">Novo valor</dt>
                                                    <dd className="font-semibold text-slate-900">{moneyBRL(resumo.valorNovo)}</dd>
                                                </div>
                                                <div className="grid grid-cols-[140px_1fr] gap-3 p-3">
                                                    <dt className="text-slate-500">Diferença</dt>
                                                    <dd className={resumo.diferenca > 0 ? "font-bold text-emerald-700" : resumo.diferenca < 0 ? "font-bold text-rose-700" : "font-bold text-slate-700"}>
                                                        {resumo.diferenca > 0 ? "+" : ""}{moneyBRL(resumo.diferenca)}
                                                    </dd>
                                                </div>
                                            </>
                                        ) : null}
                                    </dl>
                                </div>

                                {custoAjusteObservacao.trim() ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                                        <span className="font-semibold">Observação:</span> {custoAjusteObservacao.trim()}
                                    </div>
                                ) : null}

                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        disabled={custoAjusteBusy}
                                        onClick={() => setCustoAjusteConfirmOpen(false)}
                                    >
                                        Voltar
                                    </Button>
                                    <Button type="button" disabled={custoAjusteBusy} onClick={salvarAjusteCusto}>
                                        {custoAjusteBusy ? "Confirmando..." : "Confirmar ajuste"}
                                    </Button>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {([
                                    ["NOVO_PRECO", "Novo preço de custo", "Define o custo do cadastro e permite ratear o frete pelo saldo atual."],
                                    ["LOTE", "Corrigir lote", "Corrige custo e frete de um lote que ainda possui saldo."],
                                ] as Array<[CustoAjusteTipo, string, string]>).map(([tipo, titulo, descricao]) => {
                                    const ativo = custoAjusteTipo === tipo;
                                    const indisponivel = tipo === "LOTE" && lotesDisponiveis.length === 0;
                                    return (
                                        <button
                                            key={tipo}
                                            type="button"
                                            disabled={indisponivel}
                                            onClick={() => {
                                                setCustoAjusteTipo(tipo);
                                                if (tipo === "LOTE" && !custoAjusteLoteId) {
                                                    setCustoAjusteLoteId(lotesDisponiveis[0]?.id || 0);
                                                }
                                            }}
                                            className={[
                                                "rounded-2xl border p-4 text-left shadow-sm transition",
                                                ativo ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-slate-300",
                                                indisponivel ? "cursor-not-allowed opacity-50" : "",
                                            ].join(" ")}
                                        >
                                            <p className="text-sm font-bold text-slate-900">{titulo}</p>
                                            <p className="mt-1 text-xs text-slate-500">{descricao}</p>
                                        </button>
                                    );
                                })}
                            </div>

                            {custoAjusteTipo === "LOTE" ? (
                                <Field label="Lote">
                                    <Select
                                        value={custoAjusteLoteId}
                                        onChange={(e) => {
                                            const id = Number(e.target.value);
                                            setCustoAjusteLoteId(id);
                                            const lote = lotesDisponiveis.find((item) => Number(item.id) === id);
                                            if (lote) {
                                                const freteUnit = Number(lote.frete_unitario) || 0;
                                                const base = Number(lote.custo_base_unitario);
                                                const baseSeguro = Number.isFinite(base)
                                                    ? base
                                                    : Math.max(0, (Number(lote.custo_unitario) || 0) - freteUnit);
                                                setCustoAjusteNovo(maskBRLFromDigits(String(Math.round(baseSeguro * 100))));
                                                setCustoAjusteFreteTotal(maskBRLFromDigits(String(Math.round((Number(lote.frete_total) || 0) * 100))));
                                            }
                                        }}
                                    >
                                        <option value={0}>Selecionar...</option>
                                        {lotesDisponiveis.map((lote) => (
                                            <option key={lote.id} value={lote.id}>
                                                {lote.numero_lote} — entrada {clampInt(lote.quantidade_inicial)} — disponível {clampInt(lote.quantidade_atual)}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            ) : null}

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field label="Preço de custo por unidade">
                                    <TextInput
                                        value={custoAjusteNovo}
                                        onChange={(e) => setCustoAjusteNovo(maskBRLInput(e.target.value))}
                                        placeholder="R$ 0,00"
                                    />
                                </Field>
                                <Field label="Frete total">
                                    <TextInput
                                        value={custoAjusteFreteTotal}
                                        onChange={(e) => setCustoAjusteFreteTotal(maskBRLInput(e.target.value))}
                                        placeholder="R$ 0,00"
                                    />
                                </Field>
                            </div>

                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div className="rounded-2xl bg-slate-50 p-3">
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Quantidade rateio</p>
                                    <p className="mt-1 text-lg font-bold text-slate-900">{resumo.quantidadeRateio}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-3">
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Frete unitário</p>
                                    <p className="mt-1 text-lg font-bold text-slate-900">{moneyBRL(resumo.freteUnitario)}</p>
                                </div>
                                <div className="col-span-2 rounded-2xl bg-slate-900 p-3 text-white">
                                    <p className="text-[10px] uppercase tracking-wide text-slate-300">Custo final por unidade</p>
                                    <p className="mt-1 text-xl font-bold">{moneyBRL(resumo.custoFinal)}</p>
                                </div>
                            </div>

                            <Field label="Observação (opcional)">
                                <TextArea
                                    rows={4}
                                    value={custoAjusteObservacao}
                                    onChange={(e) => setCustoAjusteObservacao(e.target.value)}
                                    placeholder="Ex: correção conforme nota fiscal, inclusão de frete..."
                                />
                            </Field>

                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    disabled={custoAjusteBusy}
                                    onClick={() => setCustoAjusteOpen(false)}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    disabled={custoAjusteBusy || (custoAjusteTipo === "LOTE" && !custoAjusteLoteId)}
                                    onClick={prepararConfirmacaoAjusteCusto}
                                >
                                    Revisar ajuste
                                </Button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* MODAL: ENTRADA */}
            <Modal
                open={entradaOpen}
                title="Entrada"
                onClose={cancelarEntrada}
            >
                <div className="space-y-4">
                    {/* ✅ 2 colunas por linha + ordem solicitada */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {/* 1ª linha: Depósito (entrada) + Fabricante */}
                        <Field label="Depósito (entrada)">
                            <Select
                                value={entradaDepositoId}
                                onChange={(e) => {
                                    setEntradaDepositoId(Number(e.target.value));
                                    setEntradaProdutoId(0);
                                    setEntradaProdQuery("");
                                }}
                            >
                                {entradaFiltroOptions.depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Fabricante (filtro)">
                            <Select
                                value={entradaFabFiltroId as any}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setEntradaFabFiltroId(v === "Todos" ? "Todos" : Number(v));
                                    setEntradaProdutoId(0);
                                    setEntradaProdQuery("");
                                }}
                            >
                                <option value="Todos">Todos</option>
                                {entradaFiltroOptions.fabricantes.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {f.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        {/* 2ª linha: Categoria + Buscar Produto */}
                        <Field label="Categoria (filtro)">
                            <Select
                                value={entradaCatFiltroId as any}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setEntradaCatFiltroId(v === "Todas" ? "Todas" : Number(v));
                                    setEntradaProdutoId(0);
                                    setEntradaProdQuery("");
                                }}
                            >
                                <option value="Todas">Todas</option>
                                {entradaFiltroOptions.categorias.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <div>
                            <ProductCombobox
                                label="Buscar produto (no depósito, filtrado)"
                                placeholder="Digite nome ou código..."
                                produtos={entradaProdutosNoDeposito}
                                valueId={entradaProdutoId}
                                onChangeId={(id) => {
                                    setEntradaProdutoId(id);
                                    const p = prodById.get(id);
                                    if (p) {
                                        setEntradaBarcode(p.codigo_barras);
                                        setEntradaProdQuery(p.nome);
                                    }
                                }}
                                saldoByProdId={entradaSaldoByProd}
                                query={entradaProdQuery}
                                setQuery={setEntradaProdQuery}
                                disabled={!entradaDepositoId}
                            />

                            {entradaProdutoId ? (
                                <p className="mt-2 text-xs text-slate-600">
                                    Estoque atual neste depósito: <b>{entradaSaldoByProd.get(entradaProdutoId) ?? 0}</b>
                                </p>
                            ) : null}
                        </div>

                        {/* 3ª linha: Quantidade + preço de custo */}
                        <Field label="Quantidade">
                            <TextInput
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={entradaQtd}
                                onChange={(e) => setEntradaQtd(e.target.value.replace(/\D/g, ""))}
                                placeholder="1"
                            />
                        </Field>

                        <Field label="Preço de custo por unidade *" hint="Obrigatório. Valor unitário antes do frete.">
                            <TextInput
                                value={entradaCustoUnitario}
                                onChange={(e) => setEntradaCustoUnitario(maskBRLInput(e.target.value))}
                                placeholder="R$ 0,00"
                                required
                                aria-required="true"
                            />
                        </Field>

                        <Field label="Adicionar à lista" hint="Adiciona o item atual na fila.">
                            <Button
                                variant="soft"
                                onClick={addEntradaItemToList}
                                type="button"
                                className="w-full"
                                disabled={!entradaProdutoExistente || parseBRLToNumber(entradaCustoUnitario) <= 0}
                            >
                                + Adicionar
                            </Button>

                        </Field>
                    </div>

                    <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                            <Field label="Frete total da entrada">
                                <TextInput
                                    value={entradaFreteTotal}
                                    onChange={(e) => setEntradaFreteTotal(maskBRLInput(e.target.value))}
                                    placeholder="R$ 0,00"
                                />
                            </Field>

                            <div className="rounded-xl border border-sky-200 bg-white px-4 py-3">
                                <p className="text-xs text-slate-500">Unidades na entrada</p>
                                <p className="mt-1 text-lg font-bold text-slate-900">
                                    {entradaItens.reduce((total, item) => total + clampInt(item.qtd), 0) +
                                        (entradaProdutoExistente ? clampInt(entradaQtd) : 0)}
                                </p>
                            </div>

                            <div className="rounded-xl border border-sky-200 bg-white px-4 py-3">
                                <p className="text-xs text-slate-500">Frete estimado por unidade</p>
                                <p className="mt-1 text-lg font-bold text-slate-900">
                                    {moneyBRL((() => {
                                        const totalQtd = entradaItens.reduce((total, item) => total + clampInt(item.qtd), 0) +
                                            (entradaProdutoExistente ? clampInt(entradaQtd) : 0);
                                        return totalQtd > 0 ? parseBRLToNumber(entradaFreteTotal) / totalQtd : 0;
                                    })())}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* status produto */}
                    {entradaProdutoExistente ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                            Produto selecionado: <b>{entradaProdutoExistente.nome}</b>{" "}
                            <span className="text-xs text-emerald-700">• clique no nome na tabela de estoque para editar</span>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            Selecione um produto para continuar.
                        </div>
                    )}

                    {/* ✅ Itens na fila: uma linha por produto */}
                    {entradaItens.length ? (
                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-4 py-3">
                                <p className="text-sm font-semibold text-slate-900">Itens na fila</p>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[720px] border-collapse text-sm">
                                    <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                                        <tr>
                                            <th className="px-4 py-3">Produto</th>
                                            <th className="w-20 px-3 py-3 text-right">Qtd</th>
                                            <th className="w-32 px-3 py-3 text-right">Base</th>
                                            <th className="w-32 px-3 py-3 text-right">Custo final</th>
                                            <th className="w-32 px-3 py-3 text-right">Total</th>
                                            <th className="w-12 px-2 py-3 text-center" aria-label="Ações" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ratearFreteEntrada(
                                            entradaItens,
                                            parseBRLToNumber(entradaFreteTotal)
                                        ).map((it) => (
                                            <tr key={it.id} className="border-t border-slate-100">
                                                <td className="max-w-[320px] px-4 py-3 font-semibold text-slate-900">
                                                    <span className="block truncate" title={it.nome}>
                                                        {it.nome}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-right font-bold text-slate-900">
                                                    {it.qtd}
                                                </td>
                                                <td className="px-3 py-3 text-right text-slate-700">
                                                    {moneyBRL(it.custoBaseUnitario || 0)}
                                                </td>
                                                <td className="px-3 py-3 text-right font-semibold text-slate-900">
                                                    {moneyBRL(it.custoUnitario || 0)}
                                                </td>
                                                <td className="px-3 py-3 text-right font-bold text-slate-900">
                                                    {moneyBRL(it.custoTotal || 0)}
                                                </td>
                                                <td className="px-2 py-2 text-center">
                                                    <button
                                                        type="button"
                                                        title={`Remover ${it.nome}`}
                                                        aria-label={`Remover ${it.nome}`}
                                                        onClick={() =>
                                                            setEntradaItens((prev) =>
                                                                prev.filter((item) => item.id !== it.id)
                                                            )
                                                        }
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200"
                                                    >
                                                        ×
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ) : null}


                    {/* ✅ Observação abaixo da fila */}
                    <Field label="Observação (opcional)" hint="Aplica na conclusão (para todos os itens do lote).">
                        <TextArea
                            value={entradaObs}
                            onChange={(e) => setEntradaObs(e.target.value)}
                            placeholder="Ex: NF 123 / Compra / Ajuste..."
                        />
                    </Field>

                    {/* ✅ Só 2 botões: Concluir (esquerda) e Cancelar (direita) */}
                    <div className="flex items-center justify-between gap-2">
                        <Button
                            onClick={abrirConcluirEntrada}
                            type="button"
                            disabled={!entradaItens.length && !entradaProdutoExistente}
                        >
                            Concluir
                        </Button>

                        <Button variant="ghost" onClick={cancelarEntrada} type="button">
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ✅ POPUP: CONCLUIR ENTRADA */}
            <Modal
                open={entradaConcluirOpen}
                title="Concluir entrada"
                subtitle="Confira os itens antes de confirmar."
                onClose={() => {
                    if (entradaConcluirBusy) return;
                    setEntradaConcluirOpen(false);
                }}
            >
                <div className="space-y-3">

                    {/* ✅ RESUMO PEQUENO */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-700">
                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Operador:</span>{" "}
                                <b>{me?.nome ? `${me.nome} (${me.usuario})` : "—"}</b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Destino:</span>{" "}
                                <b>
                                    {entradaDepositoId
                                        ? (depById.get(Number(entradaDepositoId))?.nome || `#${entradaDepositoId}`)
                                        : "—"}
                                </b>
                            </span>


                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Frete total:</span>{" "}
                                <b>{moneyBRL(parseBRLToNumber(entradaFreteTotal))}</b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Unidades:</span>{" "}
                                <b>{entradaConcluirItens.reduce((total, item) => total + clampInt(item.qtd), 0)}</b>
                            </span>
                        </div>
                    </div>

                    {/* Itens */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">Itens</p>

                        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                            {entradaConcluirItens.map((it, idx) => (
                                <li key={idx} className="flex items-center justify-between gap-3 p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-900">{it.nome}</p>
                                        <p className="text-xs text-slate-500">
                                            Quantidade: <b>{it.qtd}</b> • Base: <b>{moneyBRL(it.custoBaseUnitario || 0)}</b>
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            Frete: <b>{moneyBRL(it.freteTotal || 0)}</b> • Custo final: <b>{moneyBRL(it.custoUnitario || 0)}</b> • Total: <b>{moneyBRL(it.custoTotal || 0)}</b>
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* ✅ AVISO EMBAIXO */}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Atenção: após confirmar, a movimentação será registrada no sistema.
                    </div>

                    {/* Botões */}
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={confirmarEntradaDoSnapshot} type="button" disabled={entradaConcluirBusy}>
                            {entradaConcluirBusy ? "Confirmando..." : "Confirmar"}
                        </Button>

                        <Button variant="ghost" onClick={() => setEntradaConcluirOpen(false)} type="button" disabled={entradaConcluirBusy}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ✅ POPUP: SUCESSO */}
            <Modal
                open={entradaSucessoOpen}
                title="Sucesso"
                subtitle="A entrada foi realizada com sucesso."
                onClose={() => setEntradaSucessoOpen(false)}
            >
                <div className="space-y-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                        ✅ Entrada registrada com sucesso.
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={() => setEntradaSucessoOpen(false)} type="button">
                            OK
                        </Button>
                    </div>
                </div>
            </Modal>



            {/* MODAL: SAÍDA */}
            <Modal
                open={saidaOpen}
                title="Saída"
                subtitle="Selecione depósito (origem), destino, solicitante e itens. Valida saldo disponível."
                onClose={cancelarSaida}
            >
                <div className="space-y-4">
                    {/* ✅ Mesmo padrão da Entrada: 2 colunas por linha + sequência solicitada */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {/* 1ª linha: Depósito (origem) + Destino */}
                        <Field label="Depósito (origem)">
                            <Select
                                value={saidaDepositoId}
                                onChange={(e) => {
                                    setSaidaDepositoId(Number(e.target.value));
                                    setSaidaProdutoId(0);
                                    setSaidaProdQuery("");
                                    setSaidaBarcode("");
                                }}
                            >
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {saidaFiltroOptions.depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Destino">
                            <Select value={saidaDestinoDepositoId} onChange={(e) => setSaidaDestinoDepositoId(Number(e.target.value))}>
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        {/* 2ª linha: Solicitante + Categoria */}
                        <Field label="Solicitante">
                            <Select value={saidaSolicitanteId} onChange={(e) => setSaidaSolicitanteId(Number(e.target.value))}>
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {usuarios.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.nome} ({u.usuario})
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Categoria (filtro)">
                            <Select
                                value={saidaCategoriaId as any}
                                onChange={(e) => {
                                    setSaidaCategoriaId(e.target.value === "Todas" ? "Todas" : Number(e.target.value));
                                    setSaidaProdutoId(0);
                                    setSaidaProdQuery("");
                                    setSaidaBarcode("");
                                }}
                            >
                                <option value="Todas">Todas</option>
                                {saidaFiltroOptions.categorias.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        {/* 3ª linha: Produto (full) */}
                        <div className="sm:col-span-2">
                            <ProductCombobox
                                label="Produto"
                                produtos={saidaProdutosNoDeposito}
                                valueId={saidaProdutoId}
                                onChangeId={(id) => {
                                    setSaidaProdutoId(id);
                                    const p = prodById.get(id);
                                    if (p) {
                                        setSaidaBarcode(p.codigo_barras);
                                        setSaidaProdQuery(p.nome);
                                    }
                                }}
                                saldoByProdId={saidaSaldoByProd}
                                query={saidaProdQuery}
                                setQuery={setSaidaProdQuery}
                                disabled={!saidaDepositoId}
                            />

                            {saidaProdutoId ? (
                                <p className="mt-2 text-xs text-slate-600">
                                    Disponível no depósito: <b>{saidaSaldoByProd.get(saidaProdutoId) ?? 0}</b>
                                </p>
                            ) : null}
                        </div>

                        {/* ✅ Código + Scan (sempre na mesma linha) */}
                        <div className="sm:col-span-2 flex items-end gap-2">
                            <div className="flex-1">
                                <Field label="Código de barras (opcional)">
                                    <TextInput
                                        value={saidaBarcode}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setSaidaBarcode(v);
                                            const p = produtosAtivos.find((x) => x.codigo_barras === v.trim());
                                            if (p) {
                                                setSaidaProdutoId(p.id);
                                                setSaidaProdQuery(p.nome);
                                            }
                                        }}
                                        placeholder="Digite ou use Scan"
                                        inputMode="numeric"
                                    />
                                </Field>
                            </div>

                            <div className="w-[120px]">
                                <Field label="Scan">
                                    <Button
                                        variant="soft"
                                        onClick={() => setSaidaScanOpen(true)}
                                        type="button"
                                        className="w-full"
                                    >
                                        📷 Scan
                                    </Button>
                                </Field>
                            </div>
                        </div>




                        {/* 5ª linha: Quantidade + Adicionar à lista */}
                        <Field label="Qtd">
                            <TextInput
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={saidaQtd}
                                onChange={(e) => setSaidaQtd(e.target.value.replace(/\D/g, ""))}
                                placeholder="1"
                            />
                        </Field>

                        <Field label="Adicionar à lista" hint="Adiciona o item atual na fila.">
                            <Button variant="soft" onClick={addSaidaItemToList} type="button" className="w-full" disabled={!saidaProdutoId}>
                                + Adicionar
                            </Button>
                        </Field>
                    </div>

                    {/* Itens na fila */}
                    {saidaItens.length ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Itens na fila</p>

                            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                                {saidaItens.map((it) => {
                                    const pid = Number(it.payload?.produto_id || 0);
                                    const nome = prodById.get(pid)?.nome || it.resumo;
                                    const qtd = clampInt(it.payload?.quantidade);

                                    return (
                                        <li key={it.id} className="flex items-start justify-between gap-3 p-3">
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className="text-sm font-semibold text-slate-900 leading-snug"
                                                    style={{
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    {nome}
                                                </p>

                                                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                    <span className="text-xs text-slate-600">Qtd</span>
                                                    <span className="text-lg font-bold leading-none text-slate-900">{qtd}</span>
                                                </div>
                                            </div>

                                            <Button
                                                variant="ghost"
                                                type="button"
                                                className="w-auto px-3 py-2 text-sm"
                                                onClick={() => setSaidaItens((prev) => prev.filter((x) => x.id !== it.id))}
                                            >
                                                Remover
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ) : null}


                    {/* Observação abaixo da fila (mesmo padrão da Entrada) */}
                    <Field label="Observação (opcional)">
                        <TextInput value={saidaObs} onChange={(e) => setSaidaObs(e.target.value)} placeholder="Ex: Obra X / Setor Y..." />
                    </Field>

                    {/* ✅ Botões finais: Confirmar (abre ConfirmDialog) e Cancelar */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center justify-between gap-2">
                            <Button onClick={abrirConcluirSaida} type="button" disabled={!saidaItens.length && !saidaProdutoId}>
                                Concluir
                            </Button>

                            <Button variant="ghost" onClick={cancelarSaida} type="button">
                                Cancelar
                            </Button>
                        </div>

                    </div>
                </div>
            </Modal>


            {/* MODAL: TRANSFERÊNCIA */}
            <Modal
                open={trfOpen}
                title="Transferência"
                subtitle="Selecione depósito (origem), destino, solicitante e itens. Valida saldo disponível."
                onClose={cancelarTransferencia}
            >
                <div className="space-y-4">
                    {/* ✅ Mesmo padrão da Entrada: 2 colunas por linha + sequência solicitada */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {/* 1ª linha: Depósito (origem) + Destino */}
                        <Field label="Depósito (origem)">
                            <Select
                                value={trfOrigemId}
                                onChange={(e) => {
                                    const id = Number(e.target.value);
                                    setTrfOrigemId(id);
                                    if (Number(trfDestinoId) === id) setTrfDestinoId(0);
                                    setTrfProdutoId(0);
                                    setTrfProdQuery("");
                                    setTrfBarcode("");
                                }}
                            >
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {trfFiltroOptions.origens.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Depósito (destino)">
                            <Select value={trfDestinoId} onChange={(e) => setTrfDestinoId(Number(e.target.value))}>
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {depositos
                                    .filter((d) => Number(d.id) !== Number(trfOrigemId))
                                    .map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.nome}
                                        </option>
                                    ))}
                            </Select>
                        </Field>

                        {/* 2ª linha: Solicitante + Categoria */}
                        <Field label="Solicitante">
                            <Select value={trfSolicitanteId} onChange={(e) => setTrfSolicitanteId(Number(e.target.value))}>
                                <option value={0} disabled>
                                    Selecionar...
                                </option>
                                {usuarios.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.nome} ({u.usuario})
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Categoria (filtro)">
                            <Select
                                value={trfCategoriaId as any}
                                onChange={(e) => {
                                    setTrfCategoriaId(e.target.value === "Todas" ? "Todas" : Number(e.target.value));
                                    setTrfProdutoId(0);
                                    setTrfProdQuery("");
                                    setTrfBarcode("");
                                }}
                            >
                                <option value="Todas">Todas</option>
                                {trfFiltroOptions.categorias.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        {/* 3ª linha: Produto (full) */}
                        <div className="sm:col-span-2">
                            <ProductCombobox
                                label="Produto (na origem)"
                                produtos={trfProdutosNaOrigem}
                                valueId={trfProdutoId}
                                onChangeId={(id) => {
                                    setTrfProdutoId(id);
                                    const p = prodById.get(id);
                                    if (p) {
                                        setTrfBarcode(p.codigo_barras);
                                        setTrfProdQuery(p.nome);
                                    }
                                }}
                                saldoByProdId={trfSaldoByProd}
                                query={trfProdQuery}
                                setQuery={setTrfProdQuery}
                                disabled={!trfOrigemId}
                            />

                            {trfProdutoId ? (
                                <p className="mt-2 text-xs text-slate-600">
                                    Disponível na origem: <b>{trfSaldoByProd.get(trfProdutoId) ?? 0}</b>
                                </p>
                            ) : null}
                        </div>

                        {/* ✅ Código + Scan (sempre na mesma linha) */}
                        <div className="sm:col-span-2 flex items-end gap-2">
                            <div className="flex-1">
                                <Field label="Código de barras (opcional)">
                                    <TextInput
                                        value={trfBarcode}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setTrfBarcode(v);
                                            const p = produtosAtivos.find((x) => x.codigo_barras === v.trim());
                                            if (p) {
                                                setTrfProdutoId(p.id);
                                                setTrfProdQuery(p.nome);
                                            }
                                        }}
                                        placeholder="Digite ou use Scan"
                                        inputMode="numeric"
                                    />
                                </Field>
                            </div>

                            <div className="w-[120px]">
                                <Field label="Scan">
                                    <Button
                                        variant="soft"
                                        onClick={() => setTrfScanOpen(true)}
                                        type="button"
                                        className="w-full"
                                    >
                                        📷 Scan
                                    </Button>
                                </Field>
                            </div>
                        </div>




                        {/* 5ª linha: Quantidade + Adicionar à lista */}
                        <Field label="Qtd">
                            <TextInput
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={trfQtd}
                                onChange={(e) => setTrfQtd(e.target.value.replace(/\D/g, ""))}
                                placeholder="1"
                            />
                        </Field>

                        <Field label="Adicionar à lista" hint="Adiciona o item atual na fila.">
                            <Button variant="soft" onClick={addTrfItemToList} type="button" className="w-full" disabled={!trfProdutoId}>
                                + Adicionar
                            </Button>
                        </Field>
                    </div>

                    {/* Transferências na fila */}
                    {trfItens.length ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Transferências na fila</p>

                            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                                {trfItens.map((it) => {
                                    const pid = Number(it.payload?.produto_id || 0);
                                    const nome = prodById.get(pid)?.nome || it.resumo;
                                    const qtd = clampInt(it.payload?.quantidade);

                                    return (
                                        <li key={it.id} className="flex items-start justify-between gap-3 p-3">
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className="text-sm font-semibold text-slate-900 leading-snug"
                                                    style={{
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    {nome}
                                                </p>

                                                <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                    <span className="text-xs text-slate-600">Qtd</span>
                                                    <span className="text-lg font-bold leading-none text-slate-900">{qtd}</span>
                                                </div>
                                            </div>

                                            <Button
                                                variant="ghost"
                                                type="button"
                                                className="w-auto px-3 py-2 text-sm"
                                                onClick={() => setTrfItens((prev) => prev.filter((x) => x.id !== it.id))}
                                            >
                                                Remover
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ) : null}


                    {/* Observação abaixo da fila (mesmo padrão da Entrada) */}
                    <Field label="Observação (opcional)">
                        <TextInput value={trfObs} onChange={(e) => setTrfObs(e.target.value)} placeholder="Ex: remanejamento / conferência..." />
                    </Field>

                    {/* ✅ Botões finais: Confirmar (abre ConfirmDialog) e Cancelar */}
                    <div className="flex items-center justify-between gap-2">
                        <Button
                            onClick={abrirConcluirTransferencia}
                            type="button"
                            disabled={!trfItens.length && !trfProdutoId}
                        >
                            Concluir
                        </Button>

                        <Button variant="ghost" onClick={cancelarTransferencia} type="button">
                            Cancelar
                        </Button>
                    </div>


                </div>
            </Modal>


            {/* MODAL: CRIAR CATEGORIA (QUICK) */}
            <Modal open={catQuickOpen} title="Nova categoria" subtitle="Crie e selecione automaticamente." onClose={() => setCatQuickOpen(false)}>
                <div className="space-y-3">
                    <Field label="Nome">
                        <TextInput value={catQuickNome} onChange={(e) => setCatQuickNome(e.target.value)} placeholder="Ex: EPIs" />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={criarCategoriaQuick} type="button" disabled={!catQuickNome.trim()}>
                            Criar
                        </Button>
                        <Button variant="ghost" onClick={() => setCatQuickOpen(false)} type="button">
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL: CRIAR FABRICANTE (QUICK) */}
            <Modal open={fabQuickOpen} title="Novo fabricante" subtitle="Crie e selecione automaticamente." onClose={() => setFabQuickOpen(false)}>
                <div className="space-y-3">
                    <Field label="Nome">
                        <TextInput value={fabQuickNome} onChange={(e) => setFabQuickNome(e.target.value)} placeholder="Ex: 3M" />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={criarFabricanteQuick} type="button" disabled={!fabQuickNome.trim()}>
                            Criar
                        </Button>
                        <Button variant="ghost" onClick={() => setFabQuickOpen(false)} type="button">
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* CONFIRMAÇÕES (Saída / Transferência) */}
            <Modal
                open={saidaConfirmOpen}
                title="Confirmar saída"
                subtitle="Confira os itens antes de confirmar."
                onClose={() => {
                    if (saidaConfirmBusy) return;
                    setSaidaConfirmOpen(false);
                }}
            >
                <div className="mt-2 flex flex-col gap-3">

                    {/* ✅ RESUMO PEQUENO (1 linha, pode quebrar se faltar espaço) */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-700">
                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Solicitante:</span>{" "}
                                <b>
                                    {saidaSolicitanteId
                                        ? (userById.get(Number(saidaSolicitanteId))?.nome || `#${saidaSolicitanteId}`)
                                        : "—"}
                                </b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Origem:</span>{" "}
                                <b>
                                    {saidaDepositoId
                                        ? (depById.get(Number(saidaDepositoId))?.nome || `#${saidaDepositoId}`)
                                        : "—"}
                                </b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Destino:</span>{" "}
                                <b>
                                    {saidaDestinoDepositoId
                                        ? (depById.get(Number(saidaDestinoDepositoId))?.nome || `#${saidaDestinoDepositoId}`)
                                        : "—"}
                                </b>
                            </span>
                        </div>
                    </div>

                    {/* Itens */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">Itens</p>

                        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                            {saidaConfirmItens.map((it, idx) => (
                                <li key={idx} className="flex items-start justify-between gap-3 p-3">
                                    <div className="min-w-0">
                                        <p
                                            className="text-sm font-semibold text-slate-900 leading-snug"
                                            style={{
                                                display: "-webkit-box",
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: "vertical",
                                                overflow: "hidden",
                                            }}
                                        >
                                            {it.nome}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-600">
                                            Quantidade: <b>{it.qtd}</b>
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* ✅ AVISO VAI PRA BAIXO (acima dos botões) */}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Atenção: após confirmar, a movimentação será registrada no sistema.
                    </div>

                    {/* Botões */}
                    <div className="mt-1 flex flex-wrap gap-2">
                        <Button onClick={confirmarSaidaDoSnapshot} type="button" disabled={saidaConfirmBusy}>
                            {saidaConfirmBusy ? "Confirmando..." : "Sim, confirmar"}
                        </Button>

                        <Button variant="ghost" onClick={() => setSaidaConfirmOpen(false)} type="button" disabled={saidaConfirmBusy}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>




            <Modal
                open={trfConfirmOpen}
                title="Confirmar transferência"
                subtitle="Confira os itens antes de confirmar."
                onClose={() => {
                    if (trfConfirmBusy) return;
                    setTrfConfirmOpen(false);
                }}
            >
                <div className="mt-2 flex flex-col gap-3">

                    {/* ✅ RESUMO PEQUENO */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-700">
                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Solicitante:</span>{" "}
                                <b>
                                    {trfSolicitanteId
                                        ? (userById.get(Number(trfSolicitanteId))?.nome || `#${trfSolicitanteId}`)
                                        : "—"}
                                </b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Origem:</span>{" "}
                                <b>
                                    {trfOrigemId
                                        ? (depById.get(Number(trfOrigemId))?.nome || `#${trfOrigemId}`)
                                        : "—"}
                                </b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Destino:</span>{" "}
                                <b>
                                    {trfDestinoId
                                        ? (depById.get(Number(trfDestinoId))?.nome || `#${trfDestinoId}`)
                                        : "—"}
                                </b>
                            </span>
                        </div>
                    </div>

                    {/* Itens */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">Itens</p>

                        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                            {trfConfirmItens.map((it, idx) => (
                                <li key={idx} className="flex items-start justify-between gap-3 p-3">
                                    <div className="min-w-0">
                                        <p
                                            className="text-sm font-semibold text-slate-900 leading-snug"
                                            style={{
                                                display: "-webkit-box",
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: "vertical",
                                                overflow: "hidden",
                                            }}
                                        >
                                            {it.nome}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-600">
                                            Quantidade: <b>{it.qtd}</b>
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* ✅ AVISO EMBAIXO */}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Atenção: após confirmar, a movimentação será registrada no sistema.
                    </div>

                    {/* Botões */}
                    <div className="mt-1 flex flex-wrap gap-2">
                        <Button onClick={confirmarTransferenciaDoSnapshot} type="button" disabled={trfConfirmBusy}>
                            {trfConfirmBusy ? "Confirmando..." : "Sim, confirmar"}
                        </Button>

                        <Button variant="ghost" onClick={() => setTrfConfirmOpen(false)} type="button" disabled={trfConfirmBusy}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>



            {/* POPUP PÓS-SCAN (Saída) */}
            <ScanQtyModal
                open={saidaScanQtyOpen}
                title="Produto detectado (Saída)"
                subtitle="Selecione a quantidade para adicionar na lista."
                produto={saidaScanProduto}
                depositoNome={depById.get(Number(saidaDepositoId))?.nome || ""}
                disponivel={saidaScanDisponivel}
                onClose={() => {
                    setSaidaScanQtyOpen(false);
                    setSaidaScanProduto(null);
                    setSaidaScanDisponivel(0);
                }}
                onConfirm={(qtd) => {
                    if (!saidaScanProduto) return;
                    addSaidaItemFromScan(saidaScanProduto.id, qtd);
                    setSaidaScanQtyOpen(false);
                    setSaidaScanProduto(null);
                    setSaidaScanDisponivel(0);
                }}
            />

            {/* POPUP PÓS-SCAN (Transferência) */}
            <ScanQtyModal
                open={trfScanQtyOpen}
                title="Produto detectado (Transferência)"
                subtitle="Selecione a quantidade para adicionar na lista."
                produto={trfScanProduto}
                depositoNome={depById.get(Number(trfOrigemId))?.nome || ""}
                disponivel={trfScanDisponivel}
                onClose={() => {
                    setTrfScanQtyOpen(false);
                    setTrfScanProduto(null);
                    setTrfScanDisponivel(0);
                }}
                onConfirm={(qtd) => {
                    if (!trfScanProduto) return;
                    addTrfItemFromScan(trfScanProduto.id, qtd);
                    setTrfScanQtyOpen(false);
                    setTrfScanProduto(null);
                    setTrfScanDisponivel(0);
                }}
            />

            {/* =========================
    AVANÇADO: MODAIS
========================= */}


            {/* 1) CADASTRAR NOVO PRODUTO */}
            <Modal
                open={advNovoProdutoOpen}
                title="Cadastrar novo produto"
                subtitle="Use apenas quando autorizado. A Entrada não cadastra novos produtos."
                onClose={() => setAdvNovoProdutoOpen(false)}
            >
                <div className="sm:col-span-3">
                    <Field label="Depósito inicial (onde o produto vai aparecer)">
                        <Select value={novoDepositoId} onChange={(e) => setNovoDepositoId(Number(e.target.value))}>
                            <option value={0} disabled>Selecionar...</option>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>{d.nome}</option>
                            ))}
                        </Select>
                    </Field>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                        <div className="sm:col-span-2">
                            <Field label="Código de barras">
                                <TextInput
                                    value={novoCodigoBarras}
                                    onChange={(e) => setNovoCodigoBarras(e.target.value)}
                                    inputMode="numeric"
                                    placeholder="789..."
                                />
                            </Field>
                        </div>

                        <div className="sm:col-span-4">
                            <Field label="Nome do produto">
                                <TextInput value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: Luva nitrílica M" />
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Valor (R$)">
                                <TextInput
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={Number.isFinite(Number(novoValor)) ? String(novoValor) : "0"}
                                    onChange={(e) => setNovoValor(Number(e.target.value || 0))}
                                />
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Preço de Custo (R$)">
                                <TextInput
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={Number.isFinite(Number(novoPrecoCusto)) ? String(novoPrecoCusto) : "0"}
                                    onChange={(e) => setNovoPrecoCusto(Number(e.target.value || 0))}
                                />
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Mínimo (padrão do produto)">
                                <TextInput
                                    type="number"
                                    min={0}
                                    value={novoMin}
                                    onChange={(e) => setNovoMin(clampInt(e.target.value))}
                                />
                            </Field>

                            <Field label="Máximo (padrão do produto)">
                                <TextInput
                                    type="number"
                                    min={0}
                                    value={novoMax}
                                    onChange={(e) => setNovoMax(clampInt(e.target.value))}
                                />
                            </Field>


                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Categoria (opcional)">
                                <div className="flex gap-2">
                                    <Select value={novoCategoriaId} onChange={(e) => setNovoCategoriaId(Number(e.target.value))}>
                                        <option value={0}>—</option>
                                        {categorias.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.nome}
                                            </option>
                                        ))}
                                    </Select>
                                    <Button variant="ghost" type="button" onClick={() => setCatQuickOpen(true)}>
                                        + Nova
                                    </Button>
                                </div>
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Fabricante (opcional)">
                                <div className="flex gap-2">
                                    <Select value={novoFabricanteId} onChange={(e) => setNovoFabricanteId(Number(e.target.value))}>
                                        <option value={0}>—</option>
                                        {fabricantes.map((f) => (
                                            <option key={f.id} value={f.id}>
                                                {f.nome}
                                            </option>
                                        ))}
                                    </Select>
                                    <Button variant="ghost" type="button" onClick={() => setFabQuickOpen(true)}>
                                        + Novo
                                    </Button>
                                </div>
                            </Field>
                        </div>

                        <div className="sm:col-span-2">
                            <Field label="Classificação (opcional)">
                                <Select value={novoClassificacaoId} onChange={(e) => setNovoClassificacaoId(Number(e.target.value))}>
                                    <option value={0}>—</option>
                                    {classificacoes.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.nome}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>

                        <div className="sm:col-span-6">
                            <Field label="Galeria de fotos (opcional)" hint="Pode enviar uma principal e várias miniaturas.">
                                <div className="flex flex-col gap-2">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={(e) => onNovoProdutoFoto(e.target.files)}
                                        className="block w-full text-sm"
                                    />

                                    <TextInput
                                        value={novoFoto}
                                        onChange={(e) => setNovoFoto(e.target.value)}
                                        placeholder="...ou cole URL/base64 da principal"
                                    />
                                </div>
                            </Field>

                            {(novoFotos.length > 0 || novoFoto) ? (
                                <div className="mt-3 flex flex-wrap gap-3">
                                    {novoFotos.map((foto) => {
                                        const isPrincipal = Number(foto.is_principal) === 1;
                                        return (
                                            <div key={foto.temp_id} className="w-[110px] rounded-2xl border border-slate-200 bg-white p-2">
                                                <div className="h-20 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                                    <img src={foto.foto_url} alt="Nova foto" className="h-20 w-full object-cover" />
                                                </div>

                                                <div className="mt-2 flex flex-col gap-1">
                                                    <Button
                                                        variant={isPrincipal ? "solid" : "ghost"}
                                                        type="button"
                                                        className="px-2 py-1 text-xs"
                                                        onClick={() => {
                                                            setNovoFotos((prev) =>
                                                                prev.map((f) => ({
                                                                    ...f,
                                                                    is_principal: f.temp_id === foto.temp_id ? 1 : 0,
                                                                }))
                                                            );
                                                            setNovoFoto(foto.foto_url);
                                                        }}
                                                    >
                                                        {isPrincipal ? "Principal" : "Tornar principal"}
                                                    </Button>

                                                    <Button
                                                        variant="ghost"
                                                        type="button"
                                                        className="px-2 py-1 text-xs"
                                                        onClick={() => {
                                                            setNovoFotos((prev) => {
                                                                const next = prev.filter((f) => f.temp_id !== foto.temp_id);
                                                                if (!next.some((f) => Number(f.is_principal) === 1) && next.length) {
                                                                    next[0].is_principal = 1;
                                                                    setNovoFoto(next[0].foto_url);
                                                                } else if (!next.length) {
                                                                    setNovoFoto("");
                                                                }
                                                                return next.map((f, idx) => ({ ...f, ordem: idx + 1 }));
                                                            });
                                                        }}
                                                    >
                                                        Remover
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={criarNovoProdutoAvancado}
                            type="button"
                            disabled={!novoCodigoBarras.trim() || !novoNome.trim() || !novoDepositoId}
                        >
                            Criar produto
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvNovoProdutoOpen(false)} type="button">
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 2) AJUSTE MANUAL */}
            <Modal
                open={advAjusteOpen}
                title="Ajuste manual de saldos por depósito"
                subtitle="Gera AJUSTE. Use com cuidado."
                onClose={() => setAdvAjusteOpen(false)}
            >
                <div className="space-y-4">
                    <ProductCombobox
                        label="Produto"
                        placeholder="Digite para buscar..."
                        produtos={produtosAtivos}
                        valueId={ajusteProdId}
                        onChangeId={(id) => setAjusteProdId(id)}
                        query={ajusteProdQuery}
                        setQuery={(v) => {
                            setAjusteProdQuery(v);
                            if (ajusteProdId) setAjusteProdId(0);
                        }}
                    />

                    {!ajusteProdId ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            Selecione um produto para editar os saldos por depósito.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {depositos.map((d) => (
                                <div key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900">{d.nome}</p>
                                        <p className="text-[11px] text-slate-500">
                                            Qtd atual: {clampInt(saldosMap.get(`${ajusteProdId}::${d.id}`)?.quantidade ?? 0)}
                                        </p>
                                    </div>
                                    <div className="w-[120px]">
                                        <TextInput
                                            type="number"
                                            min={0}
                                            value={clampInt(ajusteSaldos[d.id] ?? 0)}
                                            onChange={(e) =>
                                                setAjusteSaldos((prev) => ({
                                                    ...prev,
                                                    [d.id]: clampInt(e.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button onClick={salvarAjusteSaldosAvancado} disabled={ajusteBusy || !ajusteProdId} type="button">
                            {ajusteBusy ? "Salvando..." : "Salvar saldos"}
                        </Button>

                        <Button
                            variant="ghost"
                            type="button"
                            onClick={() => {
                                setAjusteProdId(0);
                                setAjusteProdQuery("");
                                setAjusteSaldos({});
                            }}
                            disabled={ajusteBusy}
                        >
                            Limpar
                        </Button>

                        <Button variant="ghost" onClick={() => setAdvAjusteOpen(false)} type="button" disabled={ajusteBusy}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 3) ADICIONAR DEPÓSITO */}
            <Modal
                open={advDepAddOpen}
                title="Adicionar depósito"
                subtitle="Crie um novo depósito."
                onClose={() => setAdvDepAddOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Nome do novo depósito">
                        <TextInput value={novoDepNome} onChange={(e) => setNovoDepNome(e.target.value)} placeholder="Ex: Almox C" />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={criarDeposito} disabled={busyDep || !novoDepNome.trim()} type="button">
                            Criar depósito
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvDepAddOpen(false)} type="button" disabled={busyDep}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 4) RENOMEAR DEPÓSITO */}
            <Modal
                open={advDepRenameOpen}
                title="Renomear depósito"
                subtitle="Altere o nome de um depósito."
                onClose={() => setAdvDepRenameOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Depósito">
                        <Select value={renomearDepId} onChange={(e) => setRenomearDepId(Number(e.target.value))}>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Novo nome">
                        <TextInput value={renomearDepNome} onChange={(e) => setRenomearDepNome(e.target.value)} />
                    </Field>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        Observação: não há opção de excluir depósito (por segurança).
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={renomearDeposito} disabled={busyDep || !renomearDepId || !renomearDepNome.trim()} type="button">
                            Renomear
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvDepRenameOpen(false)} type="button" disabled={busyDep}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 5) ADICIONAR CATEGORIA */}
            <Modal
                open={advCatAddOpen}
                title="Adicionar categoria"
                subtitle="Crie uma nova categoria."
                onClose={() => setAdvCatAddOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Nome da categoria">
                        <TextInput value={novoCatNome} onChange={(e) => setNovoCatNome(e.target.value)} placeholder="Ex: EPIs" />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={criarCategoria} disabled={busyCat || !novoCatNome.trim()} type="button">
                            Criar categoria
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvCatAddOpen(false)} type="button" disabled={busyCat}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 6) RENOMEAR CATEGORIA */}
            <Modal
                open={advCatRenameOpen}
                title="Renomear categoria"
                subtitle="Altere o nome de uma categoria."
                onClose={() => setAdvCatRenameOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Categoria">
                        <Select value={renomearCatId} onChange={(e) => setRenomearCatId(Number(e.target.value))}>
                            {categorias.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Novo nome">
                        <TextInput value={renomearCatNome} onChange={(e) => setRenomearCatNome(e.target.value)} />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={renomearCategoria} disabled={busyCat || !renomearCatId || !renomearCatNome.trim()} type="button">
                            Renomear
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvCatRenameOpen(false)} type="button" disabled={busyCat}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 7) ADICIONAR FABRICANTE */}
            <Modal
                open={advFabAddOpen}
                title="Adicionar fabricante"
                subtitle="Crie um novo fabricante."
                onClose={() => setAdvFabAddOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Nome do fabricante">
                        <TextInput value={novoFabNome} onChange={(e) => setNovoFabNome(e.target.value)} placeholder="Ex: 3M" />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={criarFabricante} disabled={busyFab || !novoFabNome.trim()} type="button">
                            Criar fabricante
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvFabAddOpen(false)} type="button" disabled={busyFab}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 8) RENOMEAR FABRICANTE */}
            <Modal
                open={advFabRenameOpen}
                title="Renomear fabricante"
                subtitle="Altere o nome de um fabricante."
                onClose={() => setAdvFabRenameOpen(false)}
            >
                <div className="space-y-3">
                    <Field label="Fabricante">
                        <Select value={renomearFabId} onChange={(e) => setRenomearFabId(Number(e.target.value))}>
                            {fabricantes.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Novo nome">
                        <TextInput value={renomearFabNome} onChange={(e) => setRenomearFabNome(e.target.value)} />
                    </Field>

                    <div className="flex gap-2">
                        <Button onClick={renomearFabricante} disabled={busyFab || !renomearFabId || !renomearFabNome.trim()} type="button">
                            Renomear
                        </Button>
                        <Button variant="ghost" onClick={() => setAdvFabRenameOpen(false)} type="button" disabled={busyFab}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* 9) EXPORTAÇÃO CSV */}
            <Modal
                open={advExportOpen}
                title="Exportação para Conferência (CSV)"
                subtitle="Exporta a lista do depósito com quantidade (inclui itens sem saldo como 0)."
                onClose={() => setAdvExportOpen(false)}
            >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {depositos.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900">{d.nome}</p>
                                <p className="text-[11px] text-slate-500">CSV para conferência</p>
                            </div>
                            <Button variant="soft" onClick={() => exportarDeposito(d.id)} type="button">
                                Exportar
                            </Button>
                        </div>
                    ))}
                </div>

                <div className="mt-3">
                    <Button variant="ghost" onClick={() => setAdvExportOpen(false)} type="button">
                        Fechar
                    </Button>
                </div>
            </Modal>


            {/* 10) IMPORTAR CSV */}
            <Modal
                open={advImportOpen}
                title="Importar produtos e saldos via CSV"
                subtitle="Formato esperado: CODIGO, ETIQUETA, DESCRIÇÃO, CATEGORIA, FABRICANTE, DEPÓSITO, EST. MINIMO, EST. MAXIMO, ESTOQUE, PREÇO VENDA..."
                onClose={() => setAdvImportOpen(false)}
            >
                <div className="space-y-3">
                    <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            const fd = new FormData();
                            fd.append("action", "import_csv");
                            fd.append("arquivo", file);

                            fetch(API_BASE, {
                                method: "POST",
                                body: fd,
                                credentials: "include",
                            })
                                .then((r) => r.json())
                                .then((j) => {
                                    if (!j.ok) {
                                        alert(j.msg || "Falha na importação.");
                                        return;
                                    }
                                    alert(j.msg || "Importação concluída.");
                                    refreshInit();
                                })
                                .catch((err) => {
                                    console.error(err);
                                    alert("Erro na importação.");
                                });
                        }}
                    />

                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setAdvImportOpen(false)} type="button">
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* ✅ MODAL: REGISTRAR CONFERÊNCIA */}
            <Modal
                open={confSaveOpen}
                title="Registrar conferência"
                subtitle="Confira os itens conferidos antes de salvar."
                onClose={() => {
                    if (confSaveBusy) return;
                    setConfSaveOpen(false);
                }}
            >
                <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-700">
                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Depósito:</span>{" "}
                                <b>{depById.get(Number(confDepositoId))?.nome || `#${confDepositoId}`}</b>
                            </span>

                            <span className="whitespace-nowrap">
                                <span className="text-slate-500">Itens conferidos:</span>{" "}
                                <b>{confSaveItens.length}</b>
                            </span>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                        {!confSaveItens.length ? (
                            <div className="p-4 text-sm text-slate-500">Nenhum item.</div>
                        ) : (
                            <div className="overflow-auto">
                                <table className="min-w-full border-separate border-spacing-0">
                                    <thead>
                                        <tr className="bg-slate-50 text-left text-xs text-slate-700">
                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Produto</th>
                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Qtd Sist</th>
                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Qtd Fís</th>
                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Dif</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {confSaveItens.map((it) => {
                                            const dif = Number(it.dif) || 0;
                                            const difCls =
                                                dif === 0 ? "text-slate-700" : dif > 0 ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold";

                                            return (
                                                <tr key={it.produto_id} className="bg-white">
                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-900">
                                                        <div className="font-semibold">{it.nome}</div>
                                                    </td>
                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm text-slate-900">
                                                        {clampInt(it.qtdSistema)}
                                                    </td>
                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm text-slate-900">
                                                        {clampInt(it.qtdFisica)}
                                                    </td>
                                                    <td className={`border-b border-slate-200 px-3 py-2 text-right text-sm ${difCls}`}>
                                                        {dif > 0 ? `+${dif}` : `${dif}`}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Atenção: ao confirmar, a conferência será registrada no sistema (não altera saldo).
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button onClick={confirmarSalvarConferencia} type="button" disabled={confSaveBusy || !confSaveItens.length}>
                            {confSaveBusy ? "Salvando..." : "Confirmar e registrar"}
                        </Button>

                        <Button variant="ghost" onClick={() => setConfSaveOpen(false)} type="button" disabled={confSaveBusy}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ✅ MODAL: CONFERÊNCIAS REGISTRADAS (LISTA) */}
            <Modal
                open={confRegOpen}
                title="Conferências Registradas"
                subtitle="Lista de conferências registradas no sistema (não altera saldo)."
                onClose={() => setConfRegOpen(false)}
            >
                <div className="space-y-4">
                    {/* filtros */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
                        <Field label="Depósito">
                            <Select
                                value={confRegDepositoId}
                                onChange={(e) => setConfRegDepositoId(Number(e.target.value))}
                            >
                                <option value={0}>Todos</option>
                                {depositos.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.nome}
                                    </option>
                                ))}
                            </Select>
                        </Field>

                        <Field label="Data inicial (opcional)">
                            <TextInput
                                type="date"
                                value={confRegDataIni}
                                onChange={(e) => setConfRegDataIni(e.target.value)}
                            />
                        </Field>

                        <Field label="Data final (opcional)">
                            <TextInput
                                type="date"
                                value={confRegDataFim}
                                onChange={(e) => setConfRegDataFim(e.target.value)}
                            />
                        </Field>

                        <Field label="Ações">
                            <div className="flex gap-2">
                                <Button
                                    variant="soft"
                                    type="button"
                                    onClick={loadConferenciasRegistros}
                                    disabled={confRegLoading}
                                    className="w-full"
                                >
                                    {confRegLoading ? "Atualizando..." : "Atualizar"}
                                </Button>

                                <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => {
                                        setConfRegDepositoId(0);
                                        setConfRegDataIni("");
                                        setConfRegDataFim("");
                                    }}
                                    disabled={confRegLoading}
                                    className="w-full"
                                >
                                    Limpar
                                </Button>
                            </div>
                        </Field>
                    </div>

                    {/* erro */}
                    {confRegErr ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {confRegErr}
                        </div>
                    ) : null}

                    {/* lista */}
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        {confRegLoading ? (
                            <div className="p-6 text-center text-sm text-slate-500">Carregando...</div>
                        ) : confRegRows.length === 0 ? (
                            <div className="p-6 text-center text-sm text-slate-500">Nenhuma conferência encontrada.</div>
                        ) : (
                            <>
                                {/* ✅ MOBILE: lista sem scroll lateral */}
                                <ul className="divide-y divide-slate-200 sm:hidden">
                                    {confRegRows.map((r) => {
                                        const depNome =
                                            r.deposito_nome || depById.get(Number(r.deposito_id))?.nome || `#${r.deposito_id}`;

                                        const opNome =
                                            r.operador_nome || userById.get(Number(r.operador_usuario_id))?.nome || `#${r.operador_usuario_id}`;

                                        return (
                                            <li key={r.id} className="px-3 py-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        {/* Depósito (principal) */}
                                                        <p className="text-[13px] font-semibold text-slate-900 leading-snug truncate">
                                                            {depNome}
                                                        </p>

                                                        {/* Operador + Data (compacto) */}
                                                        <p className="mt-0.5 text-[11px] text-slate-600 truncate">
                                                            <span className="text-slate-500">Op:</span>{" "}
                                                            <b className="font-medium text-slate-700">{opNome}</b>
                                                            <span className="text-slate-400"> • </span>
                                                            <span className="text-slate-500">Em:</span>{" "}
                                                            <b className="font-medium text-slate-700">{fmtDateTime(r.criado_em)}</b>
                                                        </p>

                                                        {/* ID discreto */}
                                                        <p className="mt-0.5 text-[10px] text-slate-400">#{r.id}</p>
                                                    </div>

                                                    {/* Ação (sempre visível) */}
                                                    <div className="shrink-0">
                                                        <Button
                                                            variant="soft"
                                                            type="button"
                                                            className="px-3 py-2 text-[13px]"
                                                            onClick={() => {
                                                                setConfRegOpen(false);
                                                                abrirConferenciaDetalhe(r.id);
                                                            }}
                                                        >
                                                            Ver
                                                        </Button>
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>

                                {/* ✅ DESKTOP: tabela completa */}
                                <div className="hidden sm:block">
                                    <div className="overflow-auto">
                                        <table className="min-w-full border-separate border-spacing-0">
                                            <thead>
                                                <tr className="bg-slate-50 text-left text-xs text-slate-700">
                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">ID</th>
                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Depósito</th>
                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Operador</th>
                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Criado em</th>
                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Itens</th>
                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Dif</th>
                                                    <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Ação</th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {confRegRows.map((r) => {
                                                    const dif = Number(r.total_dif) || 0;
                                                    const difCls =
                                                        dif === 0
                                                            ? "text-slate-700"
                                                            : dif > 0
                                                                ? "text-emerald-700 font-semibold"
                                                                : "text-rose-700 font-semibold";

                                                    const depNome =
                                                        r.deposito_nome || depById.get(Number(r.deposito_id))?.nome || `#${r.deposito_id}`;

                                                    const opNome =
                                                        r.operador_nome || userById.get(Number(r.operador_usuario_id))?.nome || `#${r.operador_usuario_id}`;

                                                    return (
                                                        <tr key={r.id} className="bg-white hover:bg-slate-50">
                                                            <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-900">#{r.id}</td>
                                                            <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">{depNome}</td>
                                                            <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">{opNome}</td>
                                                            <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700">{fmtDateTime(r.criado_em)}</td>
                                                            <td className="border-b border-slate-200 px-3 py-2 text-right text-sm text-slate-900">
                                                                {Number(r.total_itens) || 0}
                                                            </td>
                                                            <td className={`border-b border-slate-200 px-3 py-2 text-right text-sm ${difCls}`}>
                                                                {dif > 0 ? `+${dif}` : `${dif}`}
                                                            </td>
                                                            <td className="border-b border-slate-200 px-3 py-2 text-right">
                                                                <Button
                                                                    variant="ghost"
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setConfRegOpen(false);
                                                                        abrirConferenciaDetalhe(r.id);
                                                                    }}
                                                                >
                                                                    Ver
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                </div>
            </Modal>




            {/* ✅ MODAL: DETALHE DA CONFERÊNCIA SALVA */}
            <Modal
                open={confDetOpen}
                title={`Conferência salva #${confDetId || "—"}`}
                subtitle="Detalhes do registro salvo (itens + exportação)."
                onClose={() => {
                    setConfDetOpen(false);
                    setConfDetErr("");
                    setConfDetId(0);
                    setConfDetHead(null);
                    setConfDetItems([]);
                }}
            >
                <div className="space-y-3">
                    {confDetErr ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {confDetErr}
                        </div>
                    ) : null}

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        {confDetBusy ? (
                            <div>Carregando detalhe...</div>
                        ) : confDetHead ? (
                            <div className="flex flex-col gap-1">
                                <div>
                                    Depósito:{" "}
                                    <b>
                                        {confDetHead.deposito_nome ||
                                            depById.get(Number(confDetHead.deposito_id))?.nome ||
                                            `#${confDetHead.deposito_id}`}
                                    </b>
                                </div>
                                <div>
                                    Operador:{" "}
                                    <b>
                                        {confDetHead.operador_nome ||
                                            userById.get(Number(confDetHead.operador_usuario_id))?.nome ||
                                            `#${confDetHead.operador_usuario_id}`}
                                    </b>
                                </div>
                                <div>Criado em: <b>{fmtDateTime(confDetHead.criado_em)}</b></div>
                                <div>
                                    Itens: <b>{confDetHead.total_itens}</b> • Dif total:{" "}
                                    <b className={Number(confDetHead.total_dif) === 0 ? "text-emerald-700" : "text-rose-700"}>
                                        {Number(confDetHead.total_dif) > 0 ? `+${confDetHead.total_dif}` : `${confDetHead.total_dif}`}
                                    </b>
                                </div>
                            </div>
                        ) : (
                            <div>—</div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="ghost"
                            type="button"
                            onClick={() => confDetId && loadConferenciaDetalhe(confDetId)}
                            disabled={confDetBusy || !confDetId}
                        >
                            Atualizar
                        </Button>

                        <Button
                            variant="soft"
                            type="button"
                            onClick={exportarConferenciaRegistroCSV}
                            disabled={confDetBusy || !confDetHead || !confDetItems.length}
                        >
                            ⬇️ CSV
                        </Button>

                        <Button
                            variant="soft"
                            type="button"
                            onClick={exportarConferenciaRegistroPDF}
                            disabled={confDetBusy || !confDetHead || !confDetItems.length}
                        >
                            🧾 PDF
                        </Button>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                        {confDetBusy ? (
                            <div className="p-4 text-sm text-slate-500">Carregando itens...</div>
                        ) : !confDetItems.length ? (
                            <div className="p-4 text-sm text-slate-500">Nenhum item.</div>
                        ) : (
                            <div className="overflow-auto">
                                <table className="min-w-full border-separate border-spacing-0">
                                    <thead>
                                        <tr className="bg-slate-50 text-left text-xs text-slate-700">
                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Produto</th>
                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3">Código</th>
                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Qtd Sist</th>
                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Qtd Fís</th>
                                            <th className="sticky top-0 z-10 border-b border-slate-200 px-3 py-3 text-right">Dif</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {confDetItems.map((it) => {
                                            const dif = Number(it.dif) || 0;
                                            const difCls = dif === 0 ? "text-slate-700" : dif > 0 ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold";

                                            return (
                                                <tr key={it.id} className="bg-white">
                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-900">
                                                        <div className="font-semibold">{it.produto_nome_snapshot}</div>
                                                    </td>
                                                    <td className="border-b border-slate-200 px-3 py-2 text-sm text-slate-700 font-mono">
                                                        {it.codigo_barras_snapshot || "—"}
                                                    </td>
                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm text-slate-900">
                                                        {clampInt(it.qtd_sistema)}
                                                    </td>
                                                    <td className="border-b border-slate-200 px-3 py-2 text-right text-sm text-slate-900">
                                                        {clampInt(it.qtd_fisica)}
                                                    </td>
                                                    <td className={`border-b border-slate-200 px-3 py-2 text-right text-sm ${difCls}`}>
                                                        {dif > 0 ? `+${dif}` : `${dif}`}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <Button variant="ghost" type="button" onClick={() => setConfDetOpen(false)}>
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>


            <FilterPanelModal
                open={estoqueFilterOpen}
                onClose={() => setEstoqueFilterOpen(false)}
                title="Filtros de produtos"
                panelClassName="sm:max-w-4xl"
                footer={
                    <>
                        <div className="mb-3 text-xs text-slate-600">
                            Resultado atual: <b>{estoqueRows.length}</b> item(ns)
                        </div>

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button
                                variant="ghost"
                                type="button"
                                onClick={limparFiltrosEstoque}
                                className="w-full sm:w-auto"
                            >
                                Limpar filtros
                            </Button>

                            <Button
                                variant="solid"
                                type="button"
                                onClick={() => setEstoqueFilterOpen(false)}
                                className="w-full sm:w-auto"
                            >
                                Aplicar filtros
                            </Button>
                        </div>
                    </>
                }
            >
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
                        <Field label="Pesquisar produto">
                            <TextInput
                                value={qEstoque}
                                onChange={(e) => setQEstoque(e.target.value)}
                                placeholder="Nome, código de barras, categoria, fabricante ou classificação..."
                                className="py-3"
                            />
                        </Field>

                        <Field label="Filtros rápidos">
                            <div className="grid min-h-[46px] grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:grid-cols-3">
                                <label className="flex min-h-8 cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={onlyLow}
                                        onChange={(e) => setOnlyLow(e.target.checked)}
                                        className="h-5 w-5 accent-sky-600"
                                    />
                                    Somente alerta
                                </label>

                                <label className="flex min-h-8 cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={onlyPositive}
                                        onChange={(e) => setOnlyPositive(e.target.checked)}
                                        className="h-5 w-5 accent-sky-600"
                                    />
                                    Somente saldo &gt; 0
                                </label>


                                <label className="flex min-h-8 cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={onlyInactive}
                                        onChange={(e) => setOnlyInactive(e.target.checked)}
                                        className="h-5 w-5 accent-sky-600"
                                    />
                                    Produtos inativos
                                </label>
                            </div>
                        </Field>
                    </div>

                    <div className="space-y-3">
                        <FilterOptionPanel
                            title="Depósitos"
                            options={estoqueFiltroOptions.depositos}
                            selectedIds={depFiltroEstoque}
                            onChangeIds={setDepFiltroEstoque}
                            allLabel="Todos os depósitos"
                            open={estoqueFilterSectionOpen === "DEPOSITOS"}
                            onToggle={() =>
                                setEstoqueFilterSectionOpen((current) =>
                                    current === "DEPOSITOS" ? null : "DEPOSITOS"
                                )
                            }
                        />

                        <FilterOptionPanel
                            title="Categorias"
                            options={estoqueFiltroOptions.categorias}
                            selectedIds={catFiltroEstoque}
                            onChangeIds={setCatFiltroEstoque}
                            allLabel="Todas as categorias"
                            open={estoqueFilterSectionOpen === "CATEGORIAS"}
                            onToggle={() =>
                                setEstoqueFilterSectionOpen((current) =>
                                    current === "CATEGORIAS" ? null : "CATEGORIAS"
                                )
                            }
                        />

                        <FilterOptionPanel
                            title="Fabricantes"
                            options={estoqueFiltroOptions.fabricantes}
                            selectedIds={fabFiltroEstoque}
                            onChangeIds={setFabFiltroEstoque}
                            allLabel="Todos os fabricantes"
                            open={estoqueFilterSectionOpen === "FABRICANTES"}
                            onToggle={() =>
                                setEstoqueFilterSectionOpen((current) =>
                                    current === "FABRICANTES" ? null : "FABRICANTES"
                                )
                            }
                        />

                        <FilterOptionPanel
                            title="Classificações"
                            options={estoqueFiltroOptions.classificacoes}
                            selectedIds={classFiltroEstoque}
                            onChangeIds={setClassFiltroEstoque}
                            allLabel="Todas as classificações"
                            open={estoqueFilterSectionOpen === "CLASSIFICACOES"}
                            onToggle={() =>
                                setEstoqueFilterSectionOpen((current) =>
                                    current === "CLASSIFICACOES" ? null : "CLASSIFICACOES"
                                )
                            }
                        />
                    </div>
                </div>
            </FilterPanelModal>

            <FilterPanelModal
                open={confFilterOpen}
                onClose={() => setConfFilterOpen(false)}
                title="Filtros da conferência"
                subtitle="Escolha depósito e filtros antes de preencher a quantidade física."
                footer={
                    <>
                        <div className="mb-3 text-xs text-slate-600">
                            Itens atuais: <b>{conferenciaRows.length}</b>
                        </div>

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button
                                variant="ghost"
                                type="button"
                                onClick={limparFiltrosConferencia}
                                className="w-full sm:w-auto"
                            >
                                Limpar filtros
                            </Button>

                            <Button
                                variant="solid"
                                type="button"
                                onClick={() => setConfFilterOpen(false)}
                                className="w-full sm:w-auto"
                            >
                                Aplicar filtros
                            </Button>
                        </div>
                    </>
                }
            >
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <Field label="Depósito (estoque)">
                        <Select
                            value={confDepositoId}
                            onChange={(e) => {
                                const id = Number(e.target.value);
                                setConfDepositoId(id);
                                setConfFisicoByProd({});
                            }}
                        >
                            <option value={0} disabled>
                                Selecionar...
                            </option>

                            {conferenciaFiltroOptions.depositos.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Buscar">
                        <TextInput
                            value={confQ}
                            onChange={(e) => setConfQ(e.target.value)}
                            placeholder="Produto, CB, fabricante..."
                        />
                    </Field>

                    <Field label="Fabricante">
                        <Select
                            value={confFabId as any}
                            onChange={(e) =>
                                setConfFabId(
                                    e.target.value === "Todos"
                                        ? "Todos"
                                        : Number(e.target.value)
                                )
                            }
                        >
                            <option value="Todos">Todos</option>

                            {conferenciaFiltroOptions.fabricantes.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Categoria">
                        <Select
                            value={confCatId as any}
                            onChange={(e) =>
                                setConfCatId(
                                    e.target.value === "Todas"
                                        ? "Todas"
                                        : Number(e.target.value)
                                )
                            }
                        >
                            <option value="Todas">Todas</option>

                            {conferenciaFiltroOptions.categorias.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Classificação">
                        <Select
                            value={confClassId as any}
                            onChange={(e) =>
                                setConfClassId(
                                    e.target.value === "Todas"
                                        ? "Todas"
                                        : Number(e.target.value)
                                )
                            }
                        >
                            <option value="Todas">Todas</option>

                            {conferenciaFiltroOptions.classificacoes.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}
                                </option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Filtros rápidos">
                        <div className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={confOnlyPositive}
                                    onChange={(e) => setConfOnlyPositive(e.target.checked)}
                                    className="h-4 w-4"
                                />
                                Somente saldo &gt; 0
                            </label>
                        </div>
                    </Field>
                </div>
            </FilterPanelModal>

            {/* SCANNERSs */}
            <BarcodeScannerModal
                open={saidaScanOpen}
                title="Ler código de barras (Saída)"
                onClose={() => setSaidaScanOpen(false)}
                onDetected={(code) => onSaidaBarcodeScanDetected(code)}
            />

            <BarcodeScannerModal
                open={trfScanOpen}
                title="Ler código de barras (Transferência)"
                onClose={() => setTrfScanOpen(false)}
                onDetected={(code) => onTrfBarcodeScanDetected(code)}
            />
        </main>
    );
}
