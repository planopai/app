"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ItensTabela from "@/components/requisicoes/ItensTabela";

type ID = number;

type Me = {
    id: ID;
    nome: string;
    usuario: string;
};

type Deposito = {
    id: ID;
    nome: string;
};

type Produto = {
    id: ID;
    nome: string;
    descricao?: string | null;
    codigo_barras?: string | null;
    valor?: string | number | null;
    preco_custo?: string | number | null;
    minimo?: number | string | null;
    maximo?: number | string | null;
    foto_url?: string | null;
    ativo?: 0 | 1 | number;
    atualizado_em?: string;
    categoria_id?: ID | null;
    categoria_nome?: string | null;
    fabricante_id?: ID | null;
    fabricante_nome?: string | null;
    classificacao_id?: ID | null;
    classificacao_nome?: string | null;
    exige_atendimento?: 0 | 1 | number | string;
};

type Saldo = {
    id: ID;
    produto_id: ID;
    deposito_id: ID;
    quantidade: number | string;
    minimo?: number | string;
    maximo?: number | string;
    atualizado_em?: string;
};

type InitResp = {
    ok: boolean;
    me?: Me;
    depositos?: Deposito[];
    produtos?: Produto[];
    saldos?: Saldo[];
    msg?: string;
    need_login?: 1;
};

type MutResp = {
    ok: boolean;
    msg?: string;
    id?: ID;
    codigo?: string;
    need_login?: 1;
};

type ItemDraft = {
    local_id: string;
    produto_id: ID;
    produto_nome: string;
    codigo_barras?: string | null;
    quantidade: string;
    observacao: string;
};

/* =========================================================
   API
   ========================================================= */

const ENDPOINT = "https://api.planoassistencialintegrado.com.br";
const API_BASE = `${ENDPOINT}/requisicoes.php`;

/* =========================================================
   HELPERS
   ========================================================= */

function parseNum(v: unknown) {
    if (typeof v === "number") {
        return Number.isFinite(v) ? v : 0;
    }

    const s = String(v ?? "")
        .trim()
        .replace(/\./g, "")
        .replace(",", ".");

    const n = Number(s);

    return Number.isFinite(n) ? n : 0;
}

function clampQtdText(v: string) {
    const raw = (v || "").replace(/[^0-9,.]/g, "");

    const firstComma = raw.indexOf(",");
    const firstDot = raw.indexOf(".");

    if (firstComma >= 0 && firstDot >= 0) {
        const decimalChar = firstComma > firstDot ? "," : ".";
        const parts = raw.split(decimalChar);

        return `${parts.shift() || ""}${decimalChar}${parts
            .join("")
            .replace(/[,.]/g, "")}`;
    }

    if (firstComma >= 0) {
        const parts = raw.split(",");

        return `${parts.shift() || ""},${parts
            .join("")
            .replace(/[,.]/g, "")}`;
    }

    if (firstDot >= 0) {
        const parts = raw.split(".");

        return `${parts.shift() || ""}.${parts
            .join("")
            .replace(/[,.]/g, "")}`;
    }

    return raw;
}

function fmtQtd(v: unknown) {
    const n = parseNum(v);

    if (!Number.isFinite(n)) {
        return "0";
    }

    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
    }).format(n);
}

function normalizeText(s: string) {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/* =========================================================
   JUSTIFICATIVAS AUTOMÁTICAS
   ========================================================= */

type JustificativaId =
    | "MERCADORIA_REVENDA"
    | "USO_CONSUMO"
    | "INSUMOS_ATENDIMENTO";

type JustificativaOption = {
    id: JustificativaId;
    label: string;
    valor: string;
    destino_tipo: "CONSUMO" | "DEPOSITO";
    classificacoes: string[];
};

const JUSTIFICATIVAS: JustificativaOption[] = [
    {
        id: "MERCADORIA_REVENDA",
        label: "Reposição de Estoque",
        valor: "Reposição de Estoque",
        destino_tipo: "DEPOSITO",
        classificacoes: ["MERCADORIA PARA REVENDA"],
    },
    {
        id: "USO_CONSUMO",
        label: "Consumo Interno",
        valor: "Consumo Interno",
        destino_tipo: "CONSUMO",
        classificacoes: ["MATERIAL DE USO E CONSUMO"],
    },
    {
        id: "INSUMOS_ATENDIMENTO",
        label: "Insumos Para Atendimentos Funerários",
        valor: "Insumos Para Atendimentos Funerários",
        destino_tipo: "DEPOSITO",
        classificacoes: ["INSUMOS"],
    },
];

function classificacaoProduto(p?: Produto | null) {
    return normalizeText(p?.classificacao_nome || "");
}

/*
 * Descobre automaticamente qual justificativa pertence ao produto.
 */
function justificativaDoProduto(
    produto?: Produto | null
): JustificativaOption | null {
    if (!produto) {
        return null;
    }

    const classificacao = classificacaoProduto(produto);

    if (!classificacao) {
        return null;
    }

    return (
        JUSTIFICATIVAS.find((regra) =>
            regra.classificacoes.some(
                (classe) =>
                    classificacao === normalizeText(classe)
            )
        ) || null
    );
}

/*
 * Confere se o produto pertence à justificativa já definida
 * pelo primeiro produto da requisição.
 */
function produtoPermitidoPorJustificativa(
    produto: Produto,
    justificativaId: JustificativaId | ""
) {
    if (!justificativaId) {
        return true;
    }

    const regra = JUSTIFICATIVAS.find(
        (j) => j.id === justificativaId
    );

    if (!regra) {
        return false;
    }

    const classificacao = classificacaoProduto(produto);

    return regra.classificacoes.some(
        (classe) =>
            classificacao === normalizeText(classe)
    );
}

function destinoTipoDaJustificativa(
    justificativaId: JustificativaId | ""
): "CONSUMO" | "DEPOSITO" {
    return (
        JUSTIFICATIVAS.find(
            (j) => j.id === justificativaId
        )?.destino_tipo || "CONSUMO"
    );
}

function justificativaValor(
    justificativaId: JustificativaId | ""
) {
    return (
        JUSTIFICATIVAS.find(
            (j) => j.id === justificativaId
        )?.valor || ""
    );
}

/* =========================================================
   API HELPERS
   ========================================================= */

async function safeJson<T>(r: Response): Promise<T> {
    const ct = r.headers.get("content-type") || "";

    if (!ct.includes("application/json")) {
        const txt = await r.text().catch(() => "");

        throw new Error(
            `Resposta inesperada da API. ${txt ? txt.slice(0, 180) : ""
                }`.trim()
        );
    }

    return (await r.json()) as T;
}

async function apiGet<T>(
    qs: Record<
        string,
        string | number | boolean | undefined
    >
) {
    const u = new URL(API_BASE, window.location.origin);

    Object.entries(qs).forEach(([k, v]) => {
        if (v === undefined || v === "") {
            return;
        }

        u.searchParams.set(k, String(v));
    });

    const r = await fetch(u.toString(), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
    });

    return await safeJson<T>(r);
}

async function apiPost<T>(
    body: Record<string, unknown>
) {
    const r = await fetch(API_BASE, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    return await safeJson<T>(r);
}

/* =========================================================
   COMPONENTES
   (visual do mockup "Solicitar Produto", 06/10/2026)
   ========================================================= */

/** Rótulo de campo do mockup: maiúsculas, 12px, extra-negrito. */
const LABEL_CLS =
    "mb-2 block text-xs font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]";

/** Campo do mockup: 48px, sem borda visível, fundo "field". */
const FIELD_CLS =
    "h-12 w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA]";

/** Computador = largura >= 1024px (ponto de quebra lg do app). */
function useIsDesktop() {
    const [desktop, setDesktop] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia("(min-width: 1024px)");
        const sync = () => setDesktop(mq.matches);

        sync();
        mq.addEventListener("change", sync);

        return () => mq.removeEventListener("change", sync);
    }, []);

    return desktop;
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
                "rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]",
                className,
            ].join(" ")}
        >
            {children}
        </section>
    );
}

/** Cabeçalho de seção: no celular fica dentro do bloco; no computador ganha faixa com borda. */
function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 px-3.5 pt-3.5 lg:gap-3 lg:border-b lg:border-[#E3E8F0] lg:px-6 lg:py-[18px] lg:dark:border-white/[0.12]">
            {children}
        </div>
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
            <span className={LABEL_CLS}>{label}</span>

            {children}

            {hint ? (
                <span className="mt-1 block text-[11px] leading-4 text-[#5B6478] dark:text-[#AEB9CF]">
                    {hint}
                </span>
            ) : null}
        </label>
    );
}

const TextInput =
    React.forwardRef<
        HTMLInputElement,
        React.InputHTMLAttributes<HTMLInputElement>
    >(function TextInput(props, ref) {
        return (
            <input
                ref={ref}
                {...props}
                className={[FIELD_CLS, props.className || ""].join(" ")}
            />
        );
    });

function Select(
    props: React.SelectHTMLAttributes<HTMLSelectElement>
) {
    return (
        <select
            {...props}
            className={[FIELD_CLS, props.className || ""].join(" ")}
        />
    );
}

function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?:
    | "solid"
    | "soft"
    | "ghost"
    | "danger";
}) {
    /* Mockup: 48px no celular, 44px no computador. */
    const base =
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-[18px] text-[15px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-[#3D6A99]/30 disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-11 lg:text-[14px]";

    const style =
        variant === "solid"
            ? "border-[1.5px] border-[#313C55] bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30] lg:border"
            : variant === "soft"
                ? "border-[1.5px] border-[#E3E8F0] bg-[#EEF2F7] text-[#313C55] hover:bg-[#E3E8F0] dark:border-white/[0.12] dark:bg-white/10 dark:text-white dark:hover:bg-white/15 lg:border"
                : variant === "danger"
                    ? "border-[1.5px] border-[#B42318] bg-white text-[#B42318] hover:bg-[#FDECEA] dark:border-[#FF9C92] dark:bg-[#232B3F] dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/15 lg:border"
                    : "border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:border";

    return (
        <button
            {...props}
            className={[
                base,
                style,
                className,
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function IconSearch() {
    return (
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
        </svg>
    );
}

function IconPlus() {
    return (
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    );
}

/* =========================================================
   COMBOBOX DE PRODUTOS
   ========================================================= */

function ProductCombobox({
    label,
    placeholder,
    produtos,
    valueId,
    onChangeId,
    query,
    setQuery,
    saldoTotalByProd,
}: {
    label: string;
    placeholder?: string;
    produtos: Produto[];
    valueId: ID;
    onChangeId: (id: ID) => void;
    query: string;
    setQuery: (v: string) => void;
    saldoTotalByProd: Map<ID, number>;
}) {
    const wrapRef =
        useRef<HTMLDivElement>(null);

    const [open, setOpen] =
        useState(false);

    const list = useMemo(() => {
        const qq = normalizeText(query);

        const base = !qq
            ? produtos
            : produtos.filter((p) =>
                normalizeText(
                    `${p.nome} ${p.codigo_barras || ""
                    } ${p.categoria_nome || ""
                    } ${p.classificacao_nome || ""
                    }`
                ).includes(qq)
            );

        return base.slice(0, 40);
    }, [produtos, query]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!wrapRef.current) {
                return;
            }

            if (
                !wrapRef.current.contains(
                    e.target as Node
                )
            ) {
                setOpen(false);
            }
        };

        document.addEventListener(
            "mousedown",
            onDoc
        );

        return () =>
            document.removeEventListener(
                "mousedown",
                onDoc
            );
    }, []);

    return (
        <div ref={wrapRef} className="relative">
            <span className={LABEL_CLS}>{label}</span>

            <label className="flex h-12 items-center gap-2.5 rounded-xl border border-transparent bg-[#F1F4F8] px-3 text-[#5B6478] focus-within:border-[#3D6A99] focus-within:ring-2 focus-within:ring-[#3D6A99]/20 dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:px-3.5">
                <IconSearch />

                <input
                    type="search"
                    value={query}
                    aria-label={label}
                    onFocus={() =>
                        setOpen(true)
                    }
                    onChange={(e) => {
                        setQuery(
                            e.target.value
                        );

                        onChangeId(0);

                        setOpen(true);
                    }}
                    placeholder={
                        placeholder ||
                        "Busque por nome ou código"
                    }
                    className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] dark:text-white dark:placeholder:text-[#8893AA] lg:text-[15px]"
                />
            </label>

            {open ? (
                /* Celular: lista logo abaixo, dentro do bloco. Computador: lista flutuante. */
                <div className="mt-1.5 max-h-80 overflow-auto rounded-[14px] border border-[#C9D1DE] bg-white dark:border-white/[0.26] dark:bg-[#232B3F] lg:absolute lg:left-0 lg:right-0 lg:z-30 lg:mt-2 lg:shadow-[0_12px_32px_rgba(0,0,0,.18)]">
                    {list.length === 0 ? (
                        <div className="p-3.5 text-[#5B6478] dark:text-[#AEB9CF] lg:p-4">
                            Nenhum produto
                        </div>
                    ) : (
                        list.map((p) => {
                            const saldo =
                                saldoTotalByProd.get(
                                    p.id
                                ) || 0;

                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onMouseDown={(
                                        e
                                    ) =>
                                        e.preventDefault()
                                    }
                                    onClick={() => {
                                        onChangeId(
                                            p.id
                                        );

                                        setQuery(
                                            p.nome
                                        );

                                        setOpen(
                                            false
                                        );
                                    }}
                                    className="flex min-h-[52px] w-full items-center gap-2.5 border-b border-[#E3E8F0] bg-white px-3.5 py-2 text-left text-[#313C55] last:border-b-0 hover:bg-[#EEF2F7] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/[0.08] lg:gap-3 lg:px-4"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-extrabold">
                                            {p.nome}
                                        </span>

                                        <span className="block text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                            CB: {p.codigo_barras || "Sem código"}
                                        </span>
                                    </span>

                                    <span className="shrink-0 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF] lg:text-[13px]">
                                        Total{" "}
                                        <b className="text-[15px] text-[#313C55] dark:text-white">
                                            {fmtQtd(saldo)}
                                        </b>
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            ) : null}
        </div>
    );
}

/* =========================================================
   EMPTY STATE
   ========================================================= */

function EmptyState({
    title,
    text,
}: {
    title: string;
    text: string;
}) {
    return (
        <div className="rounded-[14px] border border-dashed border-[#C9D1DE] p-[18px] text-center dark:border-white/[0.26] lg:p-6">
            <p className="font-extrabold text-[#313C55] dark:text-white">
                {title}
            </p>

            <p className="mt-1 text-[12.5px] leading-5 text-[#5B6478] dark:text-[#AEB9CF] lg:text-[13px]">
                {text}
            </p>
        </div>
    );
}
/* =========================================================
   PAGE
   ========================================================= */

export default function SolicitarProdutoPage() {
    const isDesktop = useIsDesktop();

    const [me, setMe] =
        useState<Me | null>(null);

    const [depositos, setDepositos] =
        useState<Deposito[]>([]);

    const [produtos, setProdutos] =
        useState<Produto[]>([]);

    const [saldos, setSaldos] =
        useState<Saldo[]>([]);

    const [loadingInit, setLoadingInit] =
        useState(true);

    const [saving, setSaving] =
        useState(false);

    const [err, setErr] =
        useState("");

    const [okMsg, setOkMsg] =
        useState("");

    const [
        destinoDepositoId,
        setDestinoDepositoId,
    ] = useState<ID>(0);

    /*
     * A justificativa continua existindo internamente,
     * porém não é mais escolhida pelo usuário.
     *
     * O primeiro produto define este valor.
     */
    const [
        justificativaId,
        setJustificativaId,
    ] = useState<
        JustificativaId | ""
    >("");

    const [produtoId, setProdutoId] =
        useState<ID>(0);

    const [
        produtoQuery,
        setProdutoQuery,
    ] = useState("");

    const [quantidade, setQuantidade] =
        useState("1");

    const [itemObs, setItemObs] =
        useState("");

    const [itens, setItens] =
        useState<ItemDraft[]>([]);

    /* =====================================================
       SALDO TOTAL
       ===================================================== */

    const saldoTotalByProd =
        useMemo(() => {
            const map =
                new Map<ID, number>();

            for (const s of saldos) {
                const pid = Number(
                    s.produto_id || 0
                );

                if (!pid) {
                    continue;
                }

                map.set(
                    pid,
                    (map.get(pid) || 0) +
                    parseNum(s.quantidade)
                );
            }

            return map;
        }, [saldos]);

    const produtoById = useMemo(
        () =>
            new Map(
                produtos.map((p) => [
                    p.id,
                    p,
                ])
            ),
        [produtos]
    );

    /* =====================================================
       JUSTIFICATIVA AUTOMÁTICA
       ===================================================== */

    const justificativaSelecionada =
        useMemo(
            () =>
                JUSTIFICATIVAS.find(
                    (j) =>
                        j.id ===
                        justificativaId
                ) || null,
            [justificativaId]
        );

    const destinoTipo = useMemo(
        () =>
            destinoTipoDaJustificativa(
                justificativaId
            ),
        [justificativaId]
    );

    /*
     * Antes do primeiro produto:
     * todos os produtos aparecem.
     *
     * Depois que a justificativa é determinada:
     * somente produtos da mesma classificação aparecem.
     */
    const produtosDisponiveis =
        useMemo(() => {
            return produtos.filter((p) => {
                const saldoTotal =
                    saldoTotalByProd.get(p.id) || 0;

                /*
                 * Produtos sem saldo não podem ser solicitados
                 * e, por isso, não aparecem na busca.
                 */
                if (saldoTotal <= 0) {
                    return false;
                }

                /*
                 * Antes do primeiro produto, basta possuir saldo.
                 * Depois, mantém também a regra de classificação
                 * definida automaticamente pela requisição.
                 */
                if (!justificativaId) {
                    return true;
                }

                return produtoPermitidoPorJustificativa(
                    p,
                    justificativaId
                );
            });
        }, [
            produtos,
            justificativaId,
            saldoTotalByProd,
        ]);

    /* =====================================================
       CARREGAMENTO
       ===================================================== */

    async function loadInit() {
        setLoadingInit(true);
        setErr("");

        try {
            const data =
                await apiGet<InitResp>({
                    action: "init",
                });

            if (!data.ok) {
                throw new Error(
                    data.msg ||
                    "Falha ao carregar dados iniciais."
                );
            }

            setMe(data.me || null);

            setDepositos(
                data.depositos || []
            );

            setProdutos(
                data.produtos || []
            );

            setSaldos(
                data.saldos || []
            );
        } catch (e: any) {
            setErr(
                e?.message ||
                "Não foi possível carregar a página."
            );
        } finally {
            setLoadingInit(false);
        }
    }

    useEffect(() => {
        void loadInit();
    }, []);

    /* =====================================================
       PRODUTO
       ===================================================== */

    function resetItemFields() {
        setProdutoId(0);
        setProdutoQuery("");
        setQuantidade("1");
        setItemObs("");
    }

    /*
     * O primeiro produto selecionado define
     * automaticamente a justificativa.
     *
     * Se ainda não existe item e o usuário apaga a seleção,
     * a justificativa também é liberada para que ele possa
     * escolher um produto de outra classificação.
     */
    function handleProdutoChange(
        nextProdutoId: ID
    ) {
        setProdutoId(nextProdutoId);
        setErr("");

        if (!nextProdutoId) {
            if (itens.length === 0) {
                setJustificativaId("");
            }

            return;
        }

        const produto =
            produtoById.get(
                nextProdutoId
            ) || null;

        if (!produto) {
            return;
        }

        const regra =
            justificativaDoProduto(
                produto
            );

        if (!regra) {
            if (itens.length === 0) {
                setJustificativaId("");
            }

            setErr(
                `O produto "${produto.nome}" não possui uma classificação vinculada a uma justificativa de requisição.`
            );

            return;
        }

        /*
         * Primeiro produto.
         * Define a justificativa da requisição.
         */
        if (!justificativaId) {
            setJustificativaId(
                regra.id
            );

            return;
        }

        /*
         * Proteção adicional.
         * Normalmente este caso não ocorrerá porque
         * a própria busca já estará filtrada.
         */
        if (
            regra.id !==
            justificativaId
        ) {
            setErr(
                `A requisição atual é do tipo "${justificativaSelecionada?.label || justificativaValor(justificativaId)}". Selecione um produto da mesma classificação.`
            );

            setProdutoId(0);
            setProdutoQuery("");
        }
    }

    /* =====================================================
       ADICIONAR ITEM
       ===================================================== */

    function addItem() {
        setErr("");
        setOkMsg("");

        const produto =
            produtoById.get(
                produtoId
            ) || null;

        const qtd =
            parseNum(quantidade);

        if (!produto) {
            setErr(
                "Selecione um produto."
            );

            return;
        }

        /*
         * Proteção adicional para impedir inclusão de um produto
         * sem saldo caso a seleção tenha ficado aberta enquanto
         * os dados da tela foram atualizados.
         */
        const saldoDisponivel =
            saldoTotalByProd.get(produto.id) || 0;

        if (saldoDisponivel <= 0) {
            setErr(
                `O produto "${produto.nome}" está sem saldo disponível.`
            );

            setProdutoId(0);
            setProdutoQuery("");

            return;
        }

        if (qtd <= 0) {
            setErr(
                "Informe uma quantidade maior que zero."
            );

            return;
        }

        const regraProduto =
            justificativaDoProduto(
                produto
            );

        if (!regraProduto) {
            setErr(
                `O produto "${produto.nome}" não possui uma classificação vinculada a Reposição de Estoque, Consumo Interno ou Insumos Para Atendimentos Funerários.`
            );

            return;
        }

        /*
         * Segurança caso o produto seja adicionado
         * antes da atualização visual do estado.
         */
        if (!justificativaId) {
            setJustificativaId(
                regraProduto.id
            );
        } else if (
            regraProduto.id !==
            justificativaId
        ) {
            setErr(
                `Este produto pertence ao tipo "${regraProduto.label}", enquanto a requisição atual pertence ao tipo "${justificativaSelecionada?.label || justificativaValor(justificativaId)}".`
            );

            resetItemFields();

            return;
        }

        const exists = itens.some(
            (i) =>
                i.produto_id ===
                produto.id
        );

        if (exists) {
            setErr(
                "Este produto já está na requisição. Remova o item anterior ou escolha outro produto."
            );

            return;
        }

        setItens((prev) => [
            ...prev,
            {
                local_id: `${produto.id}-${Date.now()}`,
                produto_id:
                    produto.id,
                produto_nome:
                    produto.nome,
                codigo_barras:
                    produto.codigo_barras ||
                    null,
                quantidade:
                    quantidade.trim() ||
                    "1",
                observacao:
                    itemObs.trim(),
            },
        ]);

        resetItemFields();
    }

    /* =====================================================
       REMOVER ITEM
       ===================================================== */

    function removeItem(
        localId: string
    ) {
        setItens((prev) => {
            const next = prev.filter(
                (i) =>
                    i.local_id !==
                    localId
            );

            /*
             * Ao remover o último item,
             * a classificação é destravada.
             */
            if (next.length === 0) {
                setJustificativaId("");
                resetItemFields();
            }

            return next;
        });
    }

    /* =====================================================
       LIMPAR
       ===================================================== */

    function clearForm() {
        setDestinoDepositoId(0);
        setJustificativaId("");
        setItens([]);
        setErr("");
        setOkMsg("");
        resetItemFields();
    }

    /* =====================================================
       VALIDAÇÃO
       ===================================================== */

    function validateForm() {
        if (!me) {
            return "Sessão inválida. Recarregue a página.";
        }

        if (!destinoDepositoId) {
            return "Selecione o destino ou setor.";
        }

        if (!itens.length) {
            return "Inclua pelo menos um item.";
        }

        if (!justificativaId) {
            return "Não foi possível determinar automaticamente o tipo da requisição pelo produto selecionado.";
        }

        const invalidItem =
            itens.find((i) => {
                const produto =
                    produtoById.get(
                        i.produto_id
                    );

                return (
                    !produto ||
                    !produtoPermitidoPorJustificativa(
                        produto,
                        justificativaId
                    )
                );
            });

        if (invalidItem) {
            return "Há um item incompatível com a classificação da requisição.";
        }

        return "";
    }

    /* =====================================================
       ENVIAR
       ===================================================== */

    async function submitReq() {
        setErr("");
        setOkMsg("");

        const validation =
            validateForm();

        if (validation) {
            setErr(validation);
            return;
        }

        setSaving(true);

        try {
            const destino =
                depositos.find(
                    (d) =>
                        Number(d.id) ===
                        Number(
                            destinoDepositoId
                        )
                );

            /*
             * O payload continua igual ao modelo anterior.
             *
             * A diferença é apenas que justificativaId
             * foi escolhida automaticamente pelo produto.
             */
            const payload = {
                action: "criar",

                destino_tipo:
                    destinoTipo,

                unidade_destino_id:
                    destinoDepositoId,

                unidade_destino_texto:
                    destinoTipo ===
                        "CONSUMO"
                        ? destino?.nome ||
                        ""
                        : "",

                id_atendimento: "",

                justificativa:
                    justificativaValor(
                        justificativaId
                    ),

                itens: itens.map(
                    (i) => ({
                        produto_id:
                            i.produto_id,

                        quantidade:
                            i.quantidade,

                        observacao:
                            i.observacao,
                    })
                ),
            };

            const data =
                await apiPost<MutResp>(
                    payload
                );

            if (!data.ok) {
                throw new Error(
                    data.msg ||
                    "Não foi possível criar a requisição."
                );
            }

            setOkMsg(
                `${data.codigo
                    ? `Requisição ${data.codigo} enviada.`
                    : "Requisição enviada."
                } Acompanhe em Minhas Solicitações.`
            );

            setDestinoDepositoId(0);
            setJustificativaId("");
            setItens([]);
            resetItemFields();
        } catch (e: any) {
            setErr(
                e?.message ||
                "Não foi possível criar a requisição."
            );
        } finally {
            setSaving(false);
        }
    }

    const selectedProduto =
        produtoById.get(
            produtoId
        ) || null;

    /* Distribuição do estoque do produto escolhido: só os locais que têm unidade. */
    const distribuicaoSelecionada = selectedProduto
        ? saldos
            .filter(
                (s) =>
                    Number(s.produto_id) === Number(selectedProduto.id) &&
                    parseNum(s.quantidade) > 0
            )
            .map((s) => ({
                nome:
                    depositos.find((d) => Number(d.id) === Number(s.deposito_id))?.nome ||
                    `Depósito #${s.deposito_id}`,
                qtd: fmtQtd(s.quantidade),
            }))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        : [];

    const valorVendaSelecionado = selectedProduto
        ? parseNum(selectedProduto.valor).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
        })
        : "";

    /* =====================================================
       RENDER
       (mockups SolicitarProduto / Celular / CelularH)
       ===================================================== */

    const justificativaProduto =
        selectedProduto
            ? justificativaDoProduto(selectedProduto)
            : null;

    return (
        <main className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-[1120px] px-4 pt-4 lg:px-10 lg:pt-8">

                {/* HEADER */}
                <header className="mb-3.5 flex items-start gap-4 lg:mb-6">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[22px] font-extrabold leading-tight text-[#313C55] dark:text-white lg:text-[28px]">
                            Solicitar Produto
                        </h1>

                        <p className="mt-1 hidden text-sm text-[#5B6478] dark:text-[#AEB9CF] lg:block">
                            Escolha o destino, adicione os produtos e envie a requisição.
                        </p>
                    </div>

                    {me?.nome ? (
                        <div className="hidden rounded-xl border border-[#E3E8F0] bg-white px-3.5 py-2 text-right dark:border-white/[0.12] dark:bg-[#232B3F] lg:block">
                            <div className="text-xs text-[#5B6478] dark:text-[#AEB9CF]">
                                Usuário
                            </div>

                            <div className="text-sm font-extrabold text-[#313C55] dark:text-white">
                                {me.nome}
                            </div>
                        </div>
                    ) : null}
                </header>

                {/* ERROS E CARREGAMENTO */}
                {loadingInit ? (
                    <Card className="p-6 text-center text-sm text-[#5B6478] dark:text-[#AEB9CF]">
                        Carregando dados da requisição...
                    </Card>
                ) : err ? (
                    <div role="alert" className="mb-3.5 rounded-[14px] border border-[#B42318] bg-[#FDECEA] px-4 py-3 text-sm font-bold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92] lg:mb-4">
                        {err}
                    </div>
                ) : null}

                {okMsg ? (
                    <div role="status" className="mb-3.5 rounded-[14px] border border-[#B3CE52] bg-[#EEF5D6] px-4 py-3 text-sm font-bold text-[#313C55] dark:bg-[#B3CE52]/[0.18] dark:text-white lg:mb-4">
                        {okMsg}
                    </div>
                ) : null}

                {!loadingInit ? (
                    <div className="grid grid-cols-1 items-start gap-3 max-lg:landscape:grid-cols-2 lg:gap-5">

                        {/* DADOS DA SOLICITAÇÃO */}
                        <Card className="overflow-hidden">
                            <SectionHeader>
                                <h2 className="text-base font-extrabold text-[#313C55] dark:text-white lg:text-lg">
                                    Dados da solicitação
                                </h2>
                            </SectionHeader>

                            <div className="grid grid-cols-1 items-start gap-3 p-3.5 lg:grid-cols-2 lg:gap-5 lg:px-6 lg:py-5">
                                <Field label="Destino ou Setor">
                                    <Select
                                        value={
                                            destinoDepositoId
                                        }
                                        onChange={(
                                            e
                                        ) =>
                                            setDestinoDepositoId(
                                                Number(
                                                    e
                                                        .target
                                                        .value
                                                )
                                            )
                                        }
                                    >
                                        <option
                                            value={0}
                                        >
                                            Selecione
                                        </option>

                                        {depositos.map(
                                            (d) => (
                                                <option
                                                    key={
                                                        d.id
                                                    }
                                                    value={
                                                        d.id
                                                    }
                                                >
                                                    {
                                                        d.nome
                                                    }
                                                </option>
                                            )
                                        )}
                                    </Select>
                                </Field>

                                {justificativaSelecionada ? (
                                    <div className="rounded-[14px] border border-[#3D6A99] bg-[#E9EFF6] px-3.5 py-2.5 dark:bg-[#3D6A99]/20 lg:px-4 lg:py-3">
                                        <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                                            Tipo definido automaticamente pelos produtos
                                        </div>

                                        <div className="mt-0.5 text-sm font-extrabold text-[#313C55] dark:text-white lg:text-[15px]">
                                            {
                                                justificativaSelecionada.label
                                            }
                                        </div>

                                        <div className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF] lg:mt-0.5 lg:text-[13px]">
                                            {justificativaSelecionada.destino_tipo ===
                                                "DEPOSITO"
                                                ? "Operação: Transferência"
                                                : "Operação: Saída"}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-[14px] border border-[#E3E8F0] bg-[#F6F8FB] px-3.5 py-2.5 text-[12.5px] leading-normal text-[#5B6478] dark:border-white/[0.12] dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:px-4 lg:py-3 lg:text-[13px]">
                                        O primeiro produto escolhido definirá automaticamente o tipo da solicitação. Depois disso, somente produtos da mesma classificação poderão ser adicionados.
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* PRODUTO */}
                        <Card className="overflow-visible">
                            <SectionHeader>
                                <h2 className="flex-1 text-base font-extrabold text-[#313C55] dark:text-white lg:text-lg">
                                    Produto
                                </h2>

                                {justificativaSelecionada ? (
                                    <span className="text-xs font-bold text-[#5B6478] dark:text-[#AEB9CF] lg:text-[13px]">
                                        <span className="lg:hidden">Somente compatíveis</span>
                                        <span className="hidden lg:inline">Exibindo somente produtos compatíveis</span>
                                    </span>
                                ) : null}
                            </SectionHeader>

                            {/*
                             * Celular: Produto → ficha do produto → Quantidade → Observação.
                             * Computador: Produto | Quantidade (180px) na 1ª linha; o resto ocupa as 2 colunas.
                             */}
                            <div className="grid grid-cols-1 gap-3 p-3.5 lg:grid-cols-[minmax(0,1fr)_180px] lg:gap-4 lg:px-6 lg:py-5">
                                <ProductCombobox
                                    label="Produto"
                                    produtos={
                                        produtosDisponiveis
                                    }
                                    valueId={
                                        produtoId
                                    }
                                    onChangeId={
                                        handleProdutoChange
                                    }
                                    query={
                                        produtoQuery
                                    }
                                    setQuery={
                                        setProdutoQuery
                                    }
                                    saldoTotalByProd={
                                        saldoTotalByProd
                                    }
                                    placeholder={
                                        isDesktop
                                            ? "Busque qualquer produto por nome ou código"
                                            : "Busque por nome ou código"
                                    }
                                />

                                {/* PRODUTO SELECIONADO */}
                                {selectedProduto ? (
                                    <div className="rounded-2xl border border-[#E3E8F0] bg-[#F6F8FB] px-3.5 py-3 text-[#313C55] dark:border-white/[0.12] dark:bg-[#1C2334] dark:text-white lg:col-span-2 lg:px-5 lg:py-[18px]">
                                        <div className="text-base font-extrabold lg:text-[19px]">
                                            {selectedProduto.nome}
                                        </div>

                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF] lg:mt-1.5 lg:gap-x-4 lg:gap-y-2 lg:text-[13px]">
                                            {selectedProduto.classificacao_nome ? (
                                                <span>
                                                    Classificação:{" "}
                                                    <b className="text-[#313C55] dark:text-white">
                                                        {selectedProduto.classificacao_nome}
                                                    </b>
                                                </span>
                                            ) : null}

                                            {justificativaProduto ? (
                                                <span className="inline-flex h-6 items-center rounded-xl border border-[#3D6A99] bg-[#E9EFF6] px-2.5 text-xs font-extrabold text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                                                    {justificativaProduto.label}
                                                </span>
                                            ) : (
                                                <span className="inline-flex h-6 items-center rounded-xl border border-[#B42318] bg-[#FDECEA] px-2.5 text-xs font-extrabold text-[#B42318] dark:border-[#FF9C92] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]">
                                                    Produto sem regra de classificação
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-3 grid grid-cols-1 items-start gap-3 lg:mt-3.5 lg:grid-cols-2 lg:gap-4">
                                            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1 lg:gap-3">
                                                <div className="rounded-xl border border-[#E3E8F0] bg-white px-3 py-2 dark:border-white/[0.12] dark:bg-[#232B3F] lg:px-3.5 lg:py-2.5">
                                                    <div className="text-[10.5px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF] lg:text-[11px]">
                                                        Quantidade total
                                                    </div>
                                                    <div className="text-2xl font-extrabold leading-tight lg:text-[28px]">
                                                        {fmtQtd(saldoTotalByProd.get(selectedProduto.id) || 0)}
                                                    </div>
                                                </div>

                                                <div className="rounded-xl border border-[#E3E8F0] bg-white px-3 py-2 dark:border-white/[0.12] dark:bg-[#232B3F] lg:px-3.5 lg:py-2.5">
                                                    <div className="text-[10.5px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF] lg:text-[11px]">
                                                        Valor de venda
                                                    </div>
                                                    <div className="text-[19px] font-extrabold leading-[1.55] lg:text-[28px] lg:leading-tight">
                                                        {valorVendaSelecionado}
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF] lg:text-[11px]">
                                                    Distribuição por local
                                                </div>
                                                <ItensTabela
                                                    cabecalho="Local"
                                                    itens={distribuicaoSelecionada}
                                                    vazio="Nenhum local com unidade deste produto."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {/* QUANTIDADE (computador: ao lado do Produto) */}
                                <div className="lg:col-start-2 lg:row-start-1">
                                    <Field label="Quantidade">
                                        <TextInput
                                            value={
                                                quantidade
                                            }
                                            onChange={(
                                                e
                                            ) =>
                                                setQuantidade(
                                                    clampQtdText(
                                                        e
                                                            .target
                                                            .value
                                                    )
                                                )
                                            }
                                            inputMode="decimal"
                                            placeholder="1"
                                        />
                                    </Field>
                                </div>

                                {/* OBSERVAÇÃO */}
                                <div className="lg:col-span-2">
                                    <Field label="Observação">
                                        <TextInput
                                            value={
                                                itemObs
                                            }
                                            onChange={(
                                                e
                                            ) =>
                                                setItemObs(
                                                    e
                                                        .target
                                                        .value
                                                )
                                            }
                                            placeholder="Opcional"
                                        />
                                    </Field>
                                </div>

                                {/* ADICIONAR */}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={
                                        addItem
                                    }
                                    className="mt-0.5 w-full lg:col-span-2 lg:mt-0"
                                >
                                    <IconPlus />
                                    Adicionar item
                                </Button>

                                {/* ITENS */}
                                <div className="mt-0.5 flex flex-col gap-2 lg:col-span-2 lg:mt-0 lg:gap-2.5">
                                    {itens.length ? (
                                        itens.map(
                                            (
                                                item
                                            ) => (
                                                <div
                                                    key={
                                                        item.local_id
                                                    }
                                                    className="flex items-center gap-2 rounded-[14px] border border-[#E3E8F0] px-3 py-2.5 dark:border-white/[0.12] lg:gap-3 lg:px-4 lg:py-3"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-extrabold text-[#313C55] dark:text-white lg:text-[15px]">
                                                            {
                                                                item.produto_nome
                                                            }
                                                        </div>

                                                        <div className="mt-0.5 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF] lg:text-[13px]">
                                                            {item.codigo_barras ||
                                                                "Sem código"}{" "}
                                                            • Qtd{" "}
                                                            <b className="text-[#313C55] dark:text-white">
                                                                {fmtQtd(
                                                                    item.quantidade
                                                                )}
                                                            </b>
                                                        </div>

                                                        {item.observacao ? (
                                                            <div className="mt-1 text-[12.5px] text-[#313C55] dark:text-[#D6DCE8] lg:text-[13px]">
                                                                {
                                                                    item.observacao
                                                                }
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    <Button
                                                        type="button"
                                                        variant="danger"
                                                        onClick={() =>
                                                            removeItem(
                                                                item.local_id
                                                            )
                                                        }
                                                        className="!min-h-11 shrink-0 !px-3 !text-sm lg:!px-[18px]"
                                                    >
                                                        Remover
                                                    </Button>
                                                </div>
                                            )
                                        )
                                    ) : (
                                        <EmptyState
                                            title="Nenhum item"
                                            text="Adicione o primeiro produto. A classificação dele definirá automaticamente o tipo da requisição."
                                        />
                                    )}
                                </div>
                            </div>
                        </Card>

                        {/*
                         * AÇÕES
                         * Celular (em pé e deitado): barra fixa logo ACIMA da barra de baixo do app
                         * (BarraCelular: fixed, 4.25rem + área segura, z-40), botões lado a lado.
                         * Computador: linha normal no fim da página.
                         */}
                        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-[#E3E8F0] bg-white px-4 py-2.5 dark:border-white/[0.12] dark:bg-[#232B3F] max-lg:landscape:col-span-2 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:dark:bg-transparent">
                            <div className="flex gap-2 lg:grid lg:grid-cols-[1fr_auto] lg:gap-3">
                                <Button
                                    type="button"
                                    onClick={
                                        submitReq
                                    }
                                    disabled={
                                        saving ||
                                        loadingInit
                                    }
                                    className="flex-1 lg:!min-h-[52px] lg:!text-base"
                                >
                                    {saving
                                        ? "Enviando..."
                                        : "Enviar requisição"}
                                </Button>

                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={
                                        clearForm
                                    }
                                    disabled={
                                        saving
                                    }
                                    className="lg:!min-h-[52px]"
                                >
                                    Limpar
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </main>
    );
}
