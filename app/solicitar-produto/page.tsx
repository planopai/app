"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

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
   ========================================================= */

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
                "rounded-2xl border border-slate-200 bg-white shadow-sm",
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
            <span className="mb-1 block text-xs font-semibold text-slate-700">
                {label}
            </span>

            {children}

            {hint ? (
                <span className="mt-1 block text-[11px] leading-4 text-slate-500">
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
                className={[
                    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[16px] text-slate-900 shadow-sm outline-none",
                    "placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-500",
                    props.className || "",
                ].join(" ")}
            />
        );
    });

function Select(
    props: React.SelectHTMLAttributes<HTMLSelectElement>
) {
    return (
        <select
            {...props}
            className={[
                "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[16px] text-slate-900 shadow-sm outline-none",
                "focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-500",
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?:
    | "solid"
    | "soft"
    | "ghost"
    | "danger";
}) {
    const base =
        "inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-[15px] font-bold shadow-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50";

    const style =
        variant === "solid"
            ? "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
            : variant === "soft"
                ? "border border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200"
                : variant === "danger"
                    ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

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

    const selected =
        produtos.find(
            (p) => p.id === valueId
        ) || null;

    return (
        <Field
            label={label}
            hint={
                selected
                    ? `Código: ${selected.codigo_barras ||
                    "sem código"
                    }`
                    : undefined
            }
        >
            <div
                ref={wrapRef}
                className="relative"
            >
                <TextInput
                    value={query}
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
                />

                {open ? (
                    <div className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                        {list.length === 0 ? (
                            <div className="p-4 text-sm text-slate-500">
                                Nenhum produto
                                encontrado.
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
                                        className="flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50"
                                    >
                                        <div className="min-w-0">
                                            <div className="line-clamp-2 text-sm font-bold text-slate-900">
                                                {
                                                    p.nome
                                                }
                                            </div>

                                            <div className="mt-1 text-xs text-slate-500">
                                                {p.codigo_barras ||
                                                    "Sem código"}

                                                {p.categoria_nome
                                                    ? ` • ${p.categoria_nome}`
                                                    : ""}

                                                {p.classificacao_nome
                                                    ? ` • ${p.classificacao_nome}`
                                                    : ""}
                                            </div>
                                        </div>

                                        <div className="shrink-0 text-right">
                                            <div className="text-xs text-slate-500">
                                                Saldo
                                                total
                                            </div>

                                            <div className="text-sm font-bold text-slate-900">
                                                {fmtQtd(
                                                    saldo
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                ) : null}
            </div>
        </Field>
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
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <p className="text-sm font-bold text-slate-900">
                {title}
            </p>

            <p className="mt-1 text-sm leading-5 text-slate-600">
                {text}
            </p>
        </div>
    );
}

/* =========================================================
   PAGE
   ========================================================= */

export default function SolicitarProdutoPage() {
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
            if (!justificativaId) {
                return produtos;
            }

            return produtos.filter((p) =>
                produtoPermitidoPorJustificativa(
                    p,
                    justificativaId
                )
            );
        }, [
            produtos,
            justificativaId,
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
                `${data.codigo ||
                "Requisição"
                } criada com sucesso.`
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

    /* =====================================================
       RENDER
       ===================================================== */

    return (
        <main className="min-h-[100dvh] bg-gray-50 pb-[calc(2rem+env(safe-area-inset-bottom))] text-slate-900">
            <div className="mx-auto w-full max-w-5xl px-5 py-5">

                {/* HEADER */}
                <header className="mb-5 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                            <svg
                                width="21"
                                height="21"
                                viewBox="0 0 24 24"
                                fill="none"
                                className="text-sky-700"
                            >
                                <path
                                    d="M7 4h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                />

                                <path
                                    d="M8.5 9h7M8.5 13h4.5"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                />

                                <path
                                    d="M15 16h5M17.5 13.5v5"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </div>

                        <div className="min-w-0">
                            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">
                                Solicitar Produto
                            </h1>
                        </div>
                    </div>

                    {me ? (
                        <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-xs shadow-sm sm:block">
                            <div className="text-slate-500">
                                Usuário
                            </div>

                            <div className="font-bold text-slate-900">
                                {me.nome ||
                                    me.usuario ||
                                    `#${me.id}`}
                            </div>
                        </div>
                    ) : null}
                </header>

                {/* ERROS E CARREGAMENTO */}
                {loadingInit ? (
                    <Card className="p-6 text-center text-sm text-slate-500">
                        Carregando dados da requisição...
                    </Card>
                ) : err ? (
                    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                        {err}
                    </div>
                ) : null}

                {okMsg ? (
                    <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                        {okMsg}
                    </div>
                ) : null}

                {!loadingInit ? (
                    <div className="space-y-4">

                        {/* DADOS DA SOLICITAÇÃO */}
                        <Card className="overflow-hidden">
                            <div className="border-b border-slate-100 p-4">
                                <h2 className="text-base font-bold text-slate-900">
                                    Dados da solicitação
                                </h2>
                            </div>

                            <div className="space-y-4 p-4">
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
                                    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">
                                            Tipo definido automaticamente pelos produtos
                                        </div>

                                        <div className="mt-1 text-sm font-bold text-sky-900">
                                            {
                                                justificativaSelecionada.label
                                            }
                                        </div>

                                        <div className="mt-1 text-xs text-sky-700">
                                            {justificativaSelecionada.destino_tipo ===
                                                "DEPOSITO"
                                                ? "Operação: Transferência"
                                                : "Operação: Saída"}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                                        O primeiro produto escolhido definirá automaticamente o tipo da solicitação. Depois disso, somente produtos da mesma classificação ficarão disponíveis.
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* PRODUTO */}
                        <Card className="overflow-visible">
                            <div className="border-b border-slate-100 p-4">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <h2 className="text-base font-bold text-slate-900">
                                        Produto
                                    </h2>

                                    {justificativaSelecionada ? (
                                        <span className="text-xs font-semibold text-slate-500">
                                            Exibindo somente produtos compatíveis
                                        </span>
                                    ) : null}
                                </div>
                            </div>

                            <div className="space-y-4 p-4">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">

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
                                            justificativaSelecionada
                                                ? "Busque outro produto da mesma classificação"
                                                : "Busque qualquer produto por nome ou código"
                                        }
                                    />

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

                                {/* PRODUTO SELECIONADO */}
                                {selectedProduto ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                        <div className="font-bold text-slate-900">
                                            {
                                                selectedProduto.nome
                                            }
                                        </div>

                                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                            <span>
                                                Saldo total no sistema:{" "}
                                                <b>
                                                    {fmtQtd(
                                                        saldoTotalByProd.get(
                                                            selectedProduto.id
                                                        ) ||
                                                        0
                                                    )}
                                                </b>
                                            </span>

                                            {selectedProduto.classificacao_nome ? (
                                                <span>
                                                    Classificação:{" "}
                                                    <b>
                                                        {
                                                            selectedProduto.classificacao_nome
                                                        }
                                                    </b>
                                                </span>
                                            ) : null}
                                        </div>

                                        {justificativaDoProduto(
                                            selectedProduto
                                        ) ? (
                                            <div className="mt-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">
                                                {
                                                    justificativaDoProduto(
                                                        selectedProduto
                                                    )
                                                        ?.label
                                                }
                                            </div>
                                        ) : (
                                            <div className="mt-2 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                                                Produto sem regra de classificação
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                {/* OBSERVAÇÃO */}
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

                                {/* ADICIONAR */}
                                <Button
                                    type="button"
                                    variant="soft"
                                    onClick={
                                        addItem
                                    }
                                    className="w-full sm:w-auto"
                                >
                                    Adicionar item
                                </Button>

                                {/* ITENS */}
                                {itens.length ? (
                                    <div className="space-y-2">
                                        {itens.map(
                                            (
                                                item
                                            ) => (
                                                <div
                                                    key={
                                                        item.local_id
                                                    }
                                                    className="rounded-2xl border border-slate-200 bg-white p-3"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="line-clamp-2 text-sm font-bold text-slate-900">
                                                                {
                                                                    item.produto_nome
                                                                }
                                                            </div>

                                                            <div className="mt-1 text-xs text-slate-500">
                                                                {item.codigo_barras ||
                                                                    "Sem código"}{" "}
                                                                • Qtd{" "}
                                                                {fmtQtd(
                                                                    item.quantidade
                                                                )}
                                                            </div>

                                                            {item.observacao ? (
                                                                <div className="mt-2 text-sm text-slate-600">
                                                                    {
                                                                        item.observacao
                                                                    }
                                                                </div>
                                                            ) : null}
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                removeItem(
                                                                    item.local_id
                                                                )
                                                            }
                                                            className="rounded-2xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                                                        >
                                                            Remover
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                ) : (
                                    <EmptyState
                                        title="Nenhum item"
                                        text="Adicione o primeiro produto. A classificação dele definirá automaticamente o tipo da requisição."
                                    />
                                )}
                            </div>
                        </Card>

                        {/* AÇÕES */}
                        <div className="sticky bottom-0 -mx-5 border-t border-slate-200 bg-gray-50/95 p-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                                <Button
                                    type="button"
                                    onClick={
                                        submitReq
                                    }
                                    disabled={
                                        saving ||
                                        loadingInit
                                    }
                                    className="w-full"
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
                                    className="w-full sm:w-auto"
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