"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = "https://api.planoassistencialintegrado.com.br";
const CONVENIO_API = `${API_BASE}/convenio.php`;
const ESTOQUE_API = `${API_BASE}/materiais_gerais.php`;
const LOGIN_URL = "https://pai.planoassistencialintegrado.com.br/login";

type SimNao = "" | "Sim" | "Não";

type ProdutoRegra = {
    valor: SimNao;
    produto_id: number;
    nome: string;
    codigo_barras: string;
    deposito_nome: string;
    quantidade: number;
};

type BooleanRegra = {
    valor: SimNao;
    tipo?: "" | "Natural" | "Artificial";
};

type CoroaRegra = ProdutoRegra & {
    tipo: "" | "Natural" | "Artificial";
};

type RegrasConvenio = {
    schema_version: 1;
    urna: ProdutoRegra;
    roupa: ProdutoRegra;
    invol: ProdutoRegra;
    veu: ProdutoRegra;
    cordao: ProdutoRegra;
    kit_lanche: BooleanRegra;
    coroa_flores: CoroaRegra;
    assistencia: BooleanRegra;
    tanato: BooleanRegra;
    ornamentacao: BooleanRegra & { tipo?: "" | "Natural" | "Artificial" };
    realiza_velorio: BooleanRegra;
    realiza_sepultamento: BooleanRegra;
};

type Convenio = {
    id: number;
    nome: string;
    slug: string;
    ativo: boolean;
    ordem: number;
    observacao: string;
    regras: RegrasConvenio;
    versao: number;
    criado_em?: string;
    atualizado_em?: string;
};

type EstoqueRow = {
    id?: number;
    produto_id?: number;
    est_produto_id?: number;
    nome: string;
    codigo_barras?: string | null;
    deposito_nome?: string | null;
    saldo_total?: number | string | null;
    foto_url?: string | null;
    valor?: number | string | null;
};

const DEP_URNA = ["MEMORIAL", "FUNERARIA"];
const DEP_ROUPA = ["ARMARIO SANDRO", "ARMARIO ILDO", "FUNERARIA"];
const DEP_INVOL = ["ARMARIO SANDRO", "ARMARIO ILDO"];
const DEP_VEU = ["ARMARIO SANDRO", "ARMARIO ILDO", "FUNERARIA"];
const DEP_CORDAO = ["ARMARIO SANDRO", "ARMARIO ILDO", "FUNERARIA"];
const DEP_COROA = ["MEMORIAL", "FUNERARIA"];

function regraProduto(): ProdutoRegra {
    return {
        valor: "",
        produto_id: 0,
        nome: "",
        codigo_barras: "",
        deposito_nome: "",
        quantidade: 1,
    };
}

function regrasVazias(): RegrasConvenio {
    return {
        schema_version: 1,
        urna: regraProduto(),
        roupa: regraProduto(),
        invol: regraProduto(),
        veu: regraProduto(),
        cordao: regraProduto(),
        kit_lanche: { valor: "" },
        coroa_flores: { ...regraProduto(), tipo: "" },
        assistencia: { valor: "" },
        tanato: { valor: "" },
        ornamentacao: { valor: "", tipo: "" },
        realiza_velorio: { valor: "" },
        realiza_sepultamento: { valor: "" },
    };
}

function normalizeProduto(raw: any): ProdutoRegra {
    return {
        valor: raw?.valor === "Sim" || raw?.valor === "Não" ? raw.valor : "",
        produto_id: Math.max(0, Number(raw?.produto_id ?? 0) || 0),
        nome: String(raw?.nome ?? ""),
        codigo_barras: String(raw?.codigo_barras ?? ""),
        deposito_nome: String(raw?.deposito_nome ?? ""),
        quantidade: Math.max(1, Number(raw?.quantidade ?? 1) || 1),
    };
}

function normalizeRegras(raw: any): RegrasConvenio {
    const b = (v: any): BooleanRegra => ({
        valor: v?.valor === "Sim" || v?.valor === "Não" ? v.valor : "",
    });

    const coroaRaw = raw?.coroa_flores ?? {};
    const ornRaw = raw?.ornamentacao ?? {};

    return {
        schema_version: 1,
        urna: normalizeProduto(raw?.urna),
        roupa: normalizeProduto(raw?.roupa),
        invol: normalizeProduto(raw?.invol),
        veu: normalizeProduto(raw?.veu),
        cordao: normalizeProduto(raw?.cordao),
        kit_lanche: b(raw?.kit_lanche),
        coroa_flores: {
            ...normalizeProduto(coroaRaw),
            tipo:
                coroaRaw?.tipo === "Natural" || coroaRaw?.tipo === "Artificial"
                    ? coroaRaw.tipo
                    : "",
        },
        assistencia: b(raw?.assistencia),
        tanato: b(raw?.tanato),
        ornamentacao: {
            ...b(ornRaw),
            tipo:
                ornRaw?.tipo === "Natural" || ornRaw?.tipo === "Artificial"
                    ? ornRaw.tipo
                    : "",
        },
        realiza_velorio: b(raw?.realiza_velorio),
        realiza_sepultamento: b(raw?.realiza_sepultamento),
    };
}

function convenioNovo(): Convenio {
    return {
        id: 0,
        nome: "",
        slug: "",
        ativo: true,
        ordem: 0,
        observacao: "",
        regras: regrasVazias(),
        versao: 0,
    };
}

function getProdutoId(row: EstoqueRow): number {
    return (
        Number(row.id ?? row.produto_id ?? row.est_produto_id ?? 0) || 0
    );
}

async function apiJson(url: string, init?: RequestInit) {
    const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        ...init,
    });

    const json = await res.json().catch(() => null);

    if (res.status === 401 || json?.need_login) {
        window.location.href = LOGIN_URL;
        throw new Error("Sessão expirada.");
    }

    if (!res.ok || json?.erro) {
        const err: any = new Error(json?.msg || `Falha na requisição (${res.status}).`);
        err.status = res.status;
        err.code = json?.code;
        throw err;
    }

    return json;
}

function SimNaoSelect({
    value,
    onChange,
    disabled,
}: {
    value: SimNao;
    onChange: (value: SimNao) => void;
    disabled?: boolean;
}) {
    return (
        <select
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value as SimNao)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        >
            <option value="">Não definido</option>
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
        </select>
    );
}

function EstoquePicker({
    label,
    action,
    value,
    depositos,
    onChange,
    disabled,
}: {
    label: string;
    action: "urnas_buscar" | "roupas_buscar" | "invols_buscar" | "veus_buscar" | "cordoes_buscar";
    value: ProdutoRegra;
    depositos: string[];
    onChange: (next: ProdutoRegra) => void;
    disabled?: boolean;
}) {
    const [q, setQ] = useState("");
    const [rows, setRows] = useState<EstoqueRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");

    const buscar = useCallback(async () => {
        if (value.valor !== "Sim" || !value.deposito_nome) {
            setRows([]);
            return;
        }

        setLoading(true);
        setErro("");

        try {
            const url = new URL(ESTOQUE_API);
            url.searchParams.set("action", action);
            url.searchParams.set("q", q.trim());
            url.searchParams.set("somente_com_saldo", "1");
            url.searchParams.set("limit", "80");
            url.searchParams.set("deposito_nome", value.deposito_nome);

            const res = await fetch(url.toString(), {
                credentials: "include",
                cache: "no-store",
            });

            const json = await res.json().catch(() => null);

            if (res.status === 401) {
                window.location.href = LOGIN_URL;
                return;
            }

            if (!res.ok || !json?.ok) {
                throw new Error(json?.msg || "Não foi possível consultar o estoque.");
            }

            setRows(Array.isArray(json.rows) ? json.rows : []);
        } catch (e: any) {
            setRows([]);
            setErro(e?.message || "Erro ao consultar estoque.");
        } finally {
            setLoading(false);
        }
    }, [action, q, value.deposito_nome, value.valor]);

    useEffect(() => {
        const t = window.setTimeout(() => {
            if (value.valor === "Sim" && value.deposito_nome) void buscar();
        }, 180);

        return () => window.clearTimeout(t);
    }, [buscar, value.valor, value.deposito_nome]);

    const setValor = (v: SimNao) => {
        if (v !== "Sim") {
            onChange({
                ...regraProduto(),
                valor: v,
            });
            setRows([]);
            setQ("");
            return;
        }

        onChange({
            ...value,
            valor: "Sim",
            quantidade: Math.max(1, value.quantidade || 1),
        });
    };

    return (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px] md:items-center">
                <div>
                    <h3 className="font-semibold text-slate-800">{label}</h3>
                    <p className="text-xs text-slate-500">
                        Define se o convênio oferece este item.
                    </p>
                </div>
                <SimNaoSelect value={value.valor} onChange={setValor} disabled={disabled} />
            </div>

            {value.valor === "Sim" && (
                <div className="mt-4 space-y-3 border-t pt-4">
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm text-slate-700">
                            <span className="mb-1 block font-medium">Depósito</span>
                            <select
                                value={value.deposito_nome}
                                disabled={disabled}
                                onChange={(e) => {
                                    onChange({
                                        ...value,
                                        deposito_nome: e.target.value,
                                        produto_id: 0,
                                        nome: "",
                                        codigo_barras: "",
                                    });
                                    setQ("");
                                }}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                            >
                                <option value="">Selecione...</option>
                                {depositos.map((d) => (
                                    <option key={d} value={d}>
                                        {d}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="text-sm text-slate-700">
                            <span className="mb-1 block font-medium">Quantidade padrão</span>
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={value.quantidade}
                                disabled={disabled}
                                onChange={(e) =>
                                    onChange({
                                        ...value,
                                        quantidade: Math.max(1, Number(e.target.value) || 1),
                                    })
                                }
                                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                            />
                        </label>
                    </div>

                    {value.deposito_nome && (
                        <>
                            <label className="block text-sm text-slate-700">
                                <span className="mb-1 block font-medium">Buscar no estoque</span>
                                <input
                                    value={q}
                                    disabled={disabled}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Digite para filtrar ou deixe vazio para listar..."
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                                />
                            </label>

                            <div className="max-h-52 overflow-y-auto rounded-lg border">
                                {loading && (
                                    <div className="p-3 text-sm text-slate-500">
                                        Consultando estoque...
                                    </div>
                                )}

                                {!loading && erro && (
                                    <div className="p-3 text-sm text-red-700">{erro}</div>
                                )}

                                {!loading && !erro && rows.length === 0 && (
                                    <div className="p-3 text-sm text-slate-500">
                                        Nenhum item encontrado.
                                    </div>
                                )}

                                {!loading &&
                                    rows.map((row) => {
                                        const pid = getProdutoId(row);
                                        const selected = pid > 0 && pid === value.produto_id;

                                        return (
                                            <button
                                                type="button"
                                                key={`${pid}-${row.codigo_barras ?? ""}-${row.nome}`}
                                                disabled={disabled || pid <= 0}
                                                onClick={() =>
                                                    onChange({
                                                        ...value,
                                                        produto_id: pid,
                                                        nome: String(row.nome || ""),
                                                        codigo_barras: String(row.codigo_barras || ""),
                                                    })
                                                }
                                                className={[
                                                    "flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0",
                                                    selected
                                                        ? "bg-blue-50 text-blue-900"
                                                        : "hover:bg-slate-50",
                                                ].join(" ")}
                                            >
                                                <span className="min-w-0">
                                                    <span className="block font-medium">
                                                        {row.nome}
                                                    </span>
                                                    <span className="block text-xs text-slate-500">
                                                        ID {pid}
                                                        {row.codigo_barras
                                                            ? ` · CB ${row.codigo_barras}`
                                                            : ""}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 text-xs text-slate-500">
                                                    Saldo {String(row.saldo_total ?? "-")}
                                                </span>
                                            </button>
                                        );
                                    })}
                            </div>
                        </>
                    )}

                    {value.produto_id > 0 && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                            Selecionado: <b>{value.nome}</b> · produto #{value.produto_id}
                            {value.codigo_barras ? ` · CB ${value.codigo_barras}` : ""}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

function CoroaEditor({
    value,
    onChange,
    disabled,
}: {
    value: CoroaRegra;
    onChange: (next: CoroaRegra) => void;
    disabled?: boolean;
}) {
    const [q, setQ] = useState("");
    const [rows, setRows] = useState<EstoqueRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");

    const podeBuscar =
        value.valor === "Sim" &&
        !!value.tipo &&
        (value.tipo === "Natural" || !!value.deposito_nome);

    useEffect(() => {
        if (!podeBuscar) {
            setRows([]);
            return;
        }

        const ac = new AbortController();
        const t = window.setTimeout(async () => {
            setLoading(true);
            setErro("");

            try {
                const url = new URL(ESTOQUE_API);
                url.searchParams.set("action", "coroas_buscar");
                url.searchParams.set("tipo", value.tipo.toLowerCase());
                url.searchParams.set("q", q.trim());
                url.searchParams.set("limit", "100");

                if (value.tipo === "Artificial") {
                    url.searchParams.set("deposito", value.deposito_nome);
                }

                const res = await fetch(url.toString(), {
                    credentials: "include",
                    cache: "no-store",
                    signal: ac.signal,
                });

                const json = await res.json().catch(() => null);

                if (res.status === 401) {
                    window.location.href = LOGIN_URL;
                    return;
                }

                if (!res.ok || !json?.ok) {
                    throw new Error(json?.msg || "Não foi possível consultar coroas.");
                }

                setRows(Array.isArray(json.rows) ? json.rows : []);
            } catch (e: any) {
                if (e?.name !== "AbortError") {
                    setRows([]);
                    setErro(e?.message || "Erro ao consultar coroas.");
                }
            } finally {
                setLoading(false);
            }
        }, 180);

        return () => {
            window.clearTimeout(t);
            ac.abort();
        };
    }, [podeBuscar, q, value.tipo, value.deposito_nome]);

    return (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px] md:items-center">
                <div>
                    <h3 className="font-semibold text-slate-800">Coroa de Flores</h3>
                    <p className="text-xs text-slate-500">
                        Pode definir apenas a cobertura ou também um modelo padrão.
                    </p>
                </div>
                <SimNaoSelect
                    value={value.valor}
                    disabled={disabled}
                    onChange={(v) => {
                        if (v !== "Sim") {
                            onChange({ ...regraProduto(), valor: v, tipo: "" });
                            setRows([]);
                            setQ("");
                            return;
                        }
                        onChange({ ...value, valor: "Sim" });
                    }}
                />
            </div>

            {value.valor === "Sim" && (
                <div className="mt-4 space-y-3 border-t pt-4">
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">
                            <span className="mb-1 block font-medium">Tipo padrão</span>
                            <select
                                value={value.tipo}
                                disabled={disabled}
                                onChange={(e) => {
                                    const tipo = e.target.value as CoroaRegra["tipo"];
                                    onChange({
                                        ...value,
                                        tipo,
                                        deposito_nome:
                                            tipo === "Artificial"
                                                ? value.deposito_nome
                                                : "",
                                        produto_id: 0,
                                        nome: "",
                                        codigo_barras: "",
                                    });
                                }}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                            >
                                <option value="">Somente definir que oferece</option>
                                <option value="Natural">Natural</option>
                                <option value="Artificial">Artificial</option>
                            </select>
                        </label>

                        {value.tipo === "Artificial" && (
                            <label className="text-sm">
                                <span className="mb-1 block font-medium">Depósito</span>
                                <select
                                    value={value.deposito_nome}
                                    disabled={disabled}
                                    onChange={(e) =>
                                        onChange({
                                            ...value,
                                            deposito_nome: e.target.value,
                                            produto_id: 0,
                                            nome: "",
                                            codigo_barras: "",
                                        })
                                    }
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                                >
                                    <option value="">Selecione...</option>
                                    {DEP_COROA.map((d) => (
                                        <option key={d} value={d}>
                                            {d}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>

                    {!!value.tipo && (value.tipo === "Natural" || value.deposito_nome) && (
                        <>
                            <input
                                value={q}
                                disabled={disabled}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Buscar modelo de coroa..."
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />

                            <div className="max-h-52 overflow-y-auto rounded-lg border">
                                {loading && (
                                    <div className="p-3 text-sm text-slate-500">
                                        Consultando coroas...
                                    </div>
                                )}

                                {!loading && erro && (
                                    <div className="p-3 text-sm text-red-700">{erro}</div>
                                )}

                                {!loading &&
                                    !erro &&
                                    rows.map((row) => {
                                        const pid = getProdutoId(row);
                                        const selected = pid > 0 && pid === value.produto_id;

                                        return (
                                            <button
                                                type="button"
                                                key={`${pid}-${row.nome}-${row.codigo_barras ?? ""}`}
                                                disabled={disabled || pid <= 0}
                                                onClick={() =>
                                                    onChange({
                                                        ...value,
                                                        produto_id: pid,
                                                        nome: String(row.nome || ""),
                                                        codigo_barras: String(row.codigo_barras || ""),
                                                        deposito_nome:
                                                            value.tipo === "Artificial"
                                                                ? value.deposito_nome
                                                                : String(row.deposito_nome || ""),
                                                    })
                                                }
                                                className={[
                                                    "block w-full border-b px-3 py-2 text-left text-sm last:border-b-0",
                                                    selected
                                                        ? "bg-blue-50 text-blue-900"
                                                        : "hover:bg-slate-50",
                                                ].join(" ")}
                                            >
                                                <b>{row.nome}</b>
                                                <span className="ml-2 text-xs text-slate-500">
                                                    #{pid}
                                                </span>
                                            </button>
                                        );
                                    })}
                            </div>
                        </>
                    )}

                    {value.produto_id > 0 && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                            Modelo padrão: <b>{value.nome}</b> · produto #{value.produto_id}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

export default function ConveniosAdminPage() {
    const [rows, setRows] = useState<Convenio[]>([]);
    const [form, setForm] = useState<Convenio>(convenioNovo());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");

    const isEditing = form.id > 0;

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro("");

        try {
            await apiJson(`${CONVENIO_API}?action=me&_=${Date.now()}`);

            const data = await apiJson(
                `${CONVENIO_API}?action=list&include_inactive=1&_=${Date.now()}`,
            );

            setRows(
                (Array.isArray(data?.rows) ? data.rows : []).map((r: any) => ({
                    ...r,
                    id: Number(r.id),
                    ordem: Number(r.ordem ?? 0),
                    versao: Number(r.versao ?? 0),
                    ativo: !!r.ativo,
                    regras: normalizeRegras(r.regras),
                })),
            );
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os convênios.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const patchRegra = <K extends keyof RegrasConvenio>(
        key: K,
        value: RegrasConvenio[K],
    ) => {
        setForm((prev) => ({
            ...prev,
            regras: {
                ...prev.regras,
                [key]: value,
            },
        }));
    };

    const editar = (row: Convenio) => {
        setErro("");
        setMsg("");
        setForm({
            ...row,
            regras: normalizeRegras(row.regras),
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const novo = () => {
        setErro("");
        setMsg("");
        setForm(convenioNovo());
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const salvar = async () => {
        if (saving) return;

        const nome = form.nome.trim();

        if (!nome) {
            setErro("Informe o nome do convênio.");
            return;
        }

        setSaving(true);
        setErro("");
        setMsg("");

        try {
            const data = await apiJson(CONVENIO_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "save",
                    id: form.id || 0,
                    nome,
                    ativo: form.ativo,
                    ordem: form.ordem,
                    observacao: form.observacao.trim(),
                    versao: form.versao,
                    regras: form.regras,
                }),
            });

            const saved = {
                ...data.data,
                id: Number(data.data.id),
                ordem: Number(data.data.ordem ?? 0),
                versao: Number(data.data.versao ?? 0),
                ativo: !!data.data.ativo,
                regras: normalizeRegras(data.data.regras),
            } as Convenio;

            setForm(saved);
            setMsg("Convênio salvo com sucesso.");
            await carregar();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar o convênio.");
            if (e?.code === "VERSION_CONFLICT") {
                await carregar();
            }
        } finally {
            setSaving(false);
        }
    };

    const toggleAtivo = async (row: Convenio) => {
        setErro("");
        setMsg("");

        try {
            await apiJson(CONVENIO_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "set_active",
                    id: row.id,
                    ativo: !row.ativo,
                    versao: row.versao,
                }),
            });

            await carregar();

            if (form.id === row.id) {
                setForm((prev) => ({
                    ...prev,
                    ativo: !row.ativo,
                    versao: prev.versao + 1,
                }));
            }
        } catch (e: any) {
            setErro(e?.message || "Não foi possível alterar o status.");
            await carregar();
        }
    };

    const boolItems = useMemo(
        () =>
            [
                ["kit_lanche", "Kit Lanche"],
                ["assistencia", "Assistência (Materiais)"],
                ["tanato", "Tanatopraxia"],
                ["ornamentacao", "Ornamentação"],
                ["realiza_velorio", "Velório"],
                ["realiza_sepultamento", "Sepultamento"],
            ] as const,
        [],
    );

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Convênios</h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Cadastre convênios e defina os itens/regras padrão de cada atendimento.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={novo}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                        Novo convênio
                    </button>
                </header>

                {erro && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        {erro}
                    </div>
                )}

                {msg && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                        {msg}
                    </div>
                )}

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="space-y-5">
                        <section className="rounded-2xl border bg-white p-5 shadow-sm">
                            <div className="mb-4">
                                <h2 className="text-lg font-bold">
                                    {isEditing ? `Editar #${form.id}` : "Novo convênio"}
                                </h2>
                                <p className="text-xs text-slate-500">
                                    Nesta fase as regras ficam isoladas e ainda não alteram o Wizard.
                                </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="text-sm">
                                    <span className="mb-1 block font-medium">
                                        Nome do convênio
                                    </span>
                                    <input
                                        value={form.nome}
                                        disabled={saving}
                                        onChange={(e) =>
                                            setForm((p) => ({ ...p, nome: e.target.value }))
                                        }
                                        maxLength={150}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                                    />
                                </label>

                                <label className="text-sm">
                                    <span className="mb-1 block font-medium">Ordem</span>
                                    <input
                                        type="number"
                                        value={form.ordem}
                                        disabled={saving}
                                        onChange={(e) =>
                                            setForm((p) => ({
                                                ...p,
                                                ordem: Number(e.target.value) || 0,
                                            }))
                                        }
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                                    />
                                </label>
                            </div>

                            <div className="mt-4 flex items-center gap-2">
                                <input
                                    id="convenio-ativo"
                                    type="checkbox"
                                    checked={form.ativo}
                                    disabled={saving}
                                    onChange={(e) =>
                                        setForm((p) => ({
                                            ...p,
                                            ativo: e.target.checked,
                                        }))
                                    }
                                />
                                <label htmlFor="convenio-ativo" className="text-sm font-medium">
                                    Convênio ativo
                                </label>
                            </div>

                            <label className="mt-4 block text-sm">
                                <span className="mb-1 block font-medium">Observação administrativa</span>
                                <textarea
                                    value={form.observacao}
                                    disabled={saving}
                                    maxLength={1000}
                                    rows={3}
                                    onChange={(e) =>
                                        setForm((p) => ({
                                            ...p,
                                            observacao: e.target.value,
                                        }))
                                    }
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                                />
                            </label>
                        </section>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <EstoquePicker
                                label="Urna"
                                action="urnas_buscar"
                                value={form.regras.urna}
                                depositos={DEP_URNA}
                                onChange={(v) => patchRegra("urna", v)}
                                disabled={saving}
                            />
                            <EstoquePicker
                                label="Roupa"
                                action="roupas_buscar"
                                value={form.regras.roupa}
                                depositos={DEP_ROUPA}
                                onChange={(v) => patchRegra("roupa", v)}
                                disabled={saving}
                            />
                            <EstoquePicker
                                label="Véu"
                                action="veus_buscar"
                                value={form.regras.veu}
                                depositos={DEP_VEU}
                                onChange={(v) => patchRegra("veu", v)}
                                disabled={saving}
                            />
                            <EstoquePicker
                                label="Cordão São Francisco"
                                action="cordoes_buscar"
                                value={form.regras.cordao}
                                depositos={DEP_CORDAO}
                                onChange={(v) => patchRegra("cordao", v)}
                                disabled={saving}
                            />
                            <EstoquePicker
                                label="Invol"
                                action="invols_buscar"
                                value={form.regras.invol}
                                depositos={DEP_INVOL}
                                onChange={(v) => patchRegra("invol", v)}
                                disabled={saving}
                            />
                        </div>

                        <CoroaEditor
                            value={form.regras.coroa_flores}
                            onChange={(v) => patchRegra("coroa_flores", v)}
                            disabled={saving}
                        />

                        <section className="rounded-2xl border bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-bold">Demais regras</h2>
                            <p className="mb-4 mt-1 text-xs text-slate-500">
                                “Não definido” preserva decisão manual no atendimento futuro.
                            </p>

                            <div className="grid gap-3 md:grid-cols-2">
                                {boolItems.map(([key, label]) => {
                                    const value = form.regras[key];

                                    return (
                                        <div
                                            key={key}
                                            className="grid grid-cols-[1fr_160px] items-center gap-3 rounded-xl border p-3"
                                        >
                                            <span className="text-sm font-medium">{label}</span>
                                            <SimNaoSelect
                                                value={value.valor}
                                                disabled={saving}
                                                onChange={(v) => {
                                                    if (key === "ornamentacao") {
                                                        patchRegra(key, {
                                                            ...value,
                                                            valor: v,
                                                            tipo:
                                                                v === "Sim"
                                                                    ? value.tipo
                                                                    : "",
                                                        } as RegrasConvenio[typeof key]);
                                                        return;
                                                    }

                                                    patchRegra(key, {
                                                        ...value,
                                                        valor: v,
                                                    } as RegrasConvenio[typeof key]);
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            {form.regras.ornamentacao.valor === "Sim" && (
                                <label className="mt-4 block max-w-sm text-sm">
                                    <span className="mb-1 block font-medium">
                                        Tipo padrão de ornamentação
                                    </span>
                                    <select
                                        value={form.regras.ornamentacao.tipo ?? ""}
                                        disabled={saving}
                                        onChange={(e) =>
                                            patchRegra("ornamentacao", {
                                                ...form.regras.ornamentacao,
                                                tipo: e.target.value as
                                                    | ""
                                                    | "Natural"
                                                    | "Artificial",
                                            })
                                        }
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                                    >
                                        <option value="">Não definido</option>
                                        <option value="Natural">Natural</option>
                                        <option value="Artificial">Artificial</option>
                                    </select>
                                </label>
                            )}
                        </section>

                        <div className="sticky bottom-0 flex justify-end gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={novo}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                            >
                                Limpar
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void salvar()}
                                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                                {saving ? "Salvando..." : "Salvar convênio"}
                            </button>
                        </div>
                    </div>

                    <aside className="xl:sticky xl:top-4 xl:self-start">
                        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                            <div className="border-b p-4">
                                <h2 className="font-bold">Convênios cadastrados</h2>
                                <p className="text-xs text-slate-500">
                                    {rows.length} registro(s)
                                </p>
                            </div>

                            {loading ? (
                                <div className="p-4 text-sm text-slate-500">Carregando...</div>
                            ) : rows.length === 0 ? (
                                <div className="p-4 text-sm text-slate-500">
                                    Nenhum convênio cadastrado.
                                </div>
                            ) : (
                                <div className="max-h-[75vh] overflow-y-auto">
                                    {rows.map((row) => (
                                        <div
                                            key={row.id}
                                            className="border-b p-4 last:border-b-0"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => editar(row)}
                                                    className="min-w-0 text-left"
                                                >
                                                    <div className="truncate font-semibold text-slate-800">
                                                        {row.nome}
                                                    </div>
                                                    <div className="mt-1 text-xs text-slate-500">
                                                        Ordem {row.ordem} · v{row.versao}
                                                    </div>
                                                </button>

                                                <span
                                                    className={[
                                                        "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold",
                                                        row.ativo
                                                            ? "bg-emerald-100 text-emerald-800"
                                                            : "bg-slate-200 text-slate-600",
                                                    ].join(" ")}
                                                >
                                                    {row.ativo ? "Ativo" : "Inativo"}
                                                </span>
                                            </div>

                                            <div className="mt-3 flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => editar(row)}
                                                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void toggleAtivo(row)}
                                                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                                                >
                                                    {row.ativo ? "Desativar" : "Ativar"}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </aside>
                </div>
            </div>
        </main>
    );
}
