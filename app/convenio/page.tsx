"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CONVENIO_API, apiJson, osGet, osPost } from "./components/api";
import SecaoOS from "./components/SecaoOS";
import { normalizeRegras, type Convenio, type RegrasConvenio } from "./components/tipos";

const inputCls =
    "w-full rounded-lg border border-[#DDE3EC] bg-white px-3 py-2.5 text-sm font-semibold text-[#313C55] outline-none focus:border-[#00AEEC] disabled:bg-[#F4F6F9]";
const labelCls =
    "mb-1 block text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6B7488]";

const brl = (v: any) =>
    (Number(v) || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });

const hoje = () => new Date().toLocaleDateString("sv-SE");

const dataBR = (s?: string | null) => {
    if (!s) return "—";
    return new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR");
};

const num = (s: any) =>
    Number(String(s ?? "").replace(/\./g, "").replace(",", ".")) || 0;

const decBR = (v: any) =>
    v === null || v === undefined || v === ""
        ? ""
        : Number(v).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

type ConvenioOS = Convenio & {
    codigo?: string;
    tipo?: "PARTICULAR" | "ASSOCIADO" | "PREFEITURA" | "";
    codigo_numero?: string;
    aditivos_permitidos?: string[];
};

type ItemPacote = {
    categoria: string;
    rotulo: string;
    produto_id: number;
    nome: string;
    servico: boolean;
    valor_item: string;
};

function Botao({
    children,
    primario,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primario?: boolean }) {
    return (
        <button
            type="button"
            {...props}
            className={`rounded-lg px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${primario
                    ? "bg-[#313C55] text-white"
                    : "border border-[#DDE3EC] bg-white text-[#313C55]"
                } ${props.className || ""}`}
        >
            {children}
        </button>
    );
}

function normalizarConvenio(raw: any): Convenio {
    return {
        id: Number(raw?.id || 0),
        nome: String(raw?.nome || ""),
        slug: String(raw?.slug || ""),
        ativo: raw?.ativo !== false,
        ordem: Number(raw?.ordem || 0),
        observacao: String(raw?.observacao || ""),
        regras: normalizeRegras(raw?.regras || {}),
        versao: Number(raw?.versao || 0),
        criado_em: raw?.criado_em ? String(raw.criado_em) : "",
        atualizado_em: raw?.atualizado_em ? String(raw.atualizado_em) : "",
    };
}

async function listarCadastro(): Promise<Convenio[]> {
    const u = new URL(CONVENIO_API);
    u.searchParams.set("action", "list");
    u.searchParams.set("include_inactive", "1");
    u.searchParams.set("_", String(Date.now()));
    const r = await apiJson(u.toString());
    return Array.isArray(r?.rows) ? r.rows.map(normalizarConvenio) : [];
}

function itensDasRegras(regras: RegrasConvenio): Omit<ItemPacote, "valor_item">[] {
    const out: Omit<ItemPacote, "valor_item">[] = [];

    const produtos: Array<[keyof RegrasConvenio, string, string]> = [
        ["urna", "URNA", "Urna"],
        ["roupa", "ROUPA", "Roupa"],
        ["invol", "INVOLUCRO", "Invólucro"],
        ["veu", "VEU", "Véu"],
        ["cordao", "CORDAO", "Cordão"],
        ["coroa_flores", "COROA", "Coroa de flores"],
    ];

    produtos.forEach(([key, categoria, rotulo]) => {
        const item: any = regras[key];
        if (item?.valor === "Sim") {
            out.push({
                categoria,
                rotulo,
                produto_id: Number(item.produto_id || 0),
                nome: String(item.nome || ""),
                servico: false,
            });
        }
    });

    if (regras.ornamentacao?.valor === "Sim") {
        out.push({
            categoria: "ORNAMENTACAO",
            rotulo: "Ornamentação",
            produto_id: 0,
            nome: regras.ornamentacao.tipo
                ? `Ornamentação ${regras.ornamentacao.tipo.toLowerCase()}`
                : "",
            servico: true,
        });
    }

    if (regras.assistencia?.valor === "Sim") {
        out.push({
            categoria: "ASSISTENCIA",
            rotulo: "Assistência",
            produto_id: 0,
            nome: "",
            servico: true,
        });
    }

    if (regras.kit_lanche?.valor === "Sim") {
        out.push({
            categoria: "KIT_LANCHE",
            rotulo: "Kit lanche",
            produto_id: 0,
            nome: "",
            servico: true,
        });
    }

    return out;
}

function PainelPrefeitura({
    convenio,
}: {
    convenio: ConvenioOS;
}) {
    const codigo = String(convenio.codigo || "");
    const base = useMemo(() => itensDasRegras(convenio.regras), [convenio.regras]);

    const [dados, setDados] = useState<any>(null);
    const [nome, setNome] = useState("1. Atendimento funerário padrão");
    const [vigencia, setVigencia] = useState(hoje());
    const [itens, setItens] = useState<ItemPacote[]>([]);
    const [precos, setPrecos] = useState({
        TRANSLADO_KM: "",
        TANATOPRAXIA: "",
    });
    const [loading, setLoading] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");

    const carregar = useCallback(async () => {
        if (!codigo) return;

        setLoading(true);
        setErro("");

        try {
            const r = await osGet("convenio_pacotes_listar", { convenio: codigo });
            const d = r?.dados || {};
            setDados(d);

            const vigente = d?.vigente;
            if (vigente?.nome) setNome(String(vigente.nome));

            const anteriores: Record<string, any> = {};
            (vigente?.itens || []).forEach((i: any) => {
                anteriores[i.categoria] = i;
            });

            setItens(
                base.map((b) => ({
                    ...b,
                    produto_id: b.servico
                        ? Number(anteriores[b.categoria]?.produto_id || 0)
                        : b.produto_id,
                    nome:
                        b.nome ||
                        String(anteriores[b.categoria]?.produto_nome || ""),
                    valor_item: decBR(anteriores[b.categoria]?.valor_item),
                })),
            );

            setPrecos({
                TRANSLADO_KM: decBR(d?.precos_avulsos?.TRANSLADO_KM),
                TANATOPRAXIA: decBR(d?.precos_avulsos?.TANATOPRAXIA),
            });
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os valores do convênio.");
        } finally {
            setLoading(false);
        }
    }, [codigo, base]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const total = itens.reduce((acc, item) => acc + num(item.valor_item), 0);

    const pendente = itens.find(
        (item) => !item.produto_id || num(item.valor_item) <= 0,
    );

    const criarPacote = () => {
        setNome("Novo pacote");
        setVigencia(hoje());
        setItens(
            base.map((b) => ({
                ...b,
                valor_item: "",
            })),
        );
        setMsg("");
        setErro("");
    };

    const descartar = () => {
        void carregar();
        setMsg("");
        setErro("");
    };

    const salvarTudo = async () => {
        if (!codigo || salvando || pendente) return;

        setSalvando(true);
        setErro("");
        setMsg("");

        try {
            await osPost("convenio_pacote_salvar", {
                convenio: codigo,
                nome,
                valor: total.toFixed(2),
                vigente_desde: vigencia,
                itens: JSON.stringify(
                    itens.map((i) => ({
                        categoria: i.categoria,
                        produto_id: i.produto_id,
                        valor_item: num(i.valor_item),
                    })),
                ),
            });

            for (const chave of ["TRANSLADO_KM", "TANATOPRAXIA"] as const) {
                if (precos[chave] !== "") {
                    await osPost("convenio_regra_definir", {
                        convenio: codigo,
                        chave,
                        valor: num(precos[chave]),
                        vigente_desde: vigencia,
                    });
                }
            }

            setMsg(`Nova versão salva com vigência em ${dataBR(vigencia)}.`);
            await carregar();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar a nova versão.");
        } finally {
            setSalvando(false);
        }
    };

    if (loading) {
        return (
            <div className="rounded-xl border border-[#DDE3EC] bg-white p-6 text-sm text-[#6B7488]">
                Carregando valores do convênio...
            </div>
        );
    }

    return (
        <>
            {erro && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {erro}
                </div>
            )}

            {msg && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    {msg}
                </div>
            )}

            <div className="mb-4 flex flex-wrap justify-end gap-2">
                <Botao onClick={criarPacote}>+ Criar pacote</Botao>
                <Botao onClick={descartar}>Descartar</Botao>
                <Botao
                    primario
                    disabled={salvando || !!pendente}
                    title={
                        pendente
                            ? `Falta ${pendente.produto_id ? "o valor" : "o produto"
                            } de ${pendente.rotulo}`
                            : ""
                    }
                    onClick={() => void salvarTudo()}
                >
                    {salvando ? "Salvando..." : "Salvar nova versão"}
                </Botao>
            </div>

            <section className="rounded-xl border border-[#DDE3EC] bg-white p-5">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_155px]">
                    <label>
                        <span className={labelCls}>Nome do pacote</span>
                        <input
                            className={inputCls}
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                        />
                    </label>

                    <label>
                        <span className={labelCls}>Vigente a partir de</span>
                        <input
                            type="date"
                            className={inputCls}
                            value={vigencia}
                            onChange={(e) => setVigencia(e.target.value)}
                        />
                    </label>
                </div>

                <div className="mt-4 hidden grid-cols-[165px_minmax(0,1fr)_145px_34px] gap-2 md:grid">
                    <span className={labelCls}>Categoria</span>
                    <span className={labelCls}>Produto padrão incluso</span>
                    <span className={`${labelCls} text-right`}>Valor no contrato</span>
                    <span />
                </div>

                <div className="space-y-2">
                    {itens.map((item, idx) => (
                        <div
                            key={item.categoria}
                            className="grid gap-2 rounded-lg border border-[#EEF1F5] p-2 md:grid-cols-[165px_minmax(0,1fr)_145px_34px] md:items-center md:border-0 md:p-0"
                        >
                            <div className="rounded-lg border border-[#DDE3EC] bg-white px-3 py-2 text-sm font-bold">
                                {item.rotulo} ▾
                            </div>

                            {item.servico ? (
                                <input
                                    inputMode="numeric"
                                    className={inputCls}
                                    placeholder="Código do produto de serviço"
                                    value={item.produto_id || ""}
                                    onChange={(e) =>
                                        setItens(
                                            itens.map((x, i) =>
                                                i === idx
                                                    ? {
                                                        ...x,
                                                        produto_id:
                                                            Number(
                                                                e.target.value.replace(
                                                                    /\D/g,
                                                                    "",
                                                                ),
                                                            ) || 0,
                                                    }
                                                    : x,
                                            ),
                                        )
                                    }
                                />
                            ) : (
                                <div className="truncate rounded-lg border border-[#DDE3EC] bg-white px-3 py-2 text-sm font-bold">
                                    {item.produto_id
                                        ? `${item.nome || "Produto"} ▾`
                                        : "Modelo padrão não definido"}
                                </div>
                            )}

                            <input
                                inputMode="decimal"
                                className={`${inputCls} text-right`}
                                placeholder="0,00"
                                value={item.valor_item}
                                onChange={(e) =>
                                    setItens(
                                        itens.map((x, i) =>
                                            i === idx
                                                ? { ...x, valor_item: e.target.value }
                                                : x,
                                        ),
                                    )
                                }
                            />

                            <button
                                type="button"
                                title="Remover desta versão"
                                onClick={() =>
                                    setItens(itens.filter((_, i) => i !== idx))
                                }
                                className="h-9 w-9 rounded-lg border border-[#DDE3EC] bg-white font-bold text-red-600"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <Botao
                            onClick={() => {
                                const disponivel = base.find(
                                    (b) => !itens.some((i) => i.categoria === b.categoria),
                                );
                                if (disponivel) {
                                    setItens([
                                        ...itens,
                                        { ...disponivel, valor_item: "" },
                                    ]);
                                }
                            }}
                            disabled={
                                !base.some(
                                    (b) => !itens.some((i) => i.categoria === b.categoria),
                                )
                            }
                        >
                            + Adicionar item
                        </Botao>

                        <p className="mt-3 max-w-2xl text-xs leading-5 text-[#6B7488]">
                            Troca de modelo: diferença = preço do escolhido − valor do item
                            no contrato. Item fora do pacote vai inteiro para a Dif.Prf.
                        </p>
                    </div>

                    <div className="text-right">
                        <div className={labelCls}>Valor do pacote = soma dos itens</div>
                        <div className="text-3xl font-extrabold">{brl(total)}</div>
                    </div>
                </div>
            </section>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-[#DDE3EC] bg-white p-5">
                    <h2 className="mb-4 text-lg font-extrabold">
                        Serviços com preço de contrato
                    </h2>

                    <div className="mb-3 flex items-center gap-3">
                        <div className="flex-1">
                            <b>2. Translado</b>
                            <div className="text-xs text-[#6B7488]">
                                por km · sem limite
                            </div>
                        </div>
                        <input
                            inputMode="decimal"
                            className={`${inputCls} w-36 text-right`}
                            value={precos.TRANSLADO_KM}
                            placeholder="0,00"
                            onChange={(e) =>
                                setPrecos({
                                    ...precos,
                                    TRANSLADO_KM: e.target.value,
                                })
                            }
                        />
                    </div>

                    <div className="mb-3 flex items-center gap-3">
                        <div className="flex-1">
                            <b>3. Tanatopraxia</b>
                            <div className="text-xs text-[#6B7488]">
                                por atendimento
                            </div>
                        </div>
                        <input
                            inputMode="decimal"
                            className={`${inputCls} w-36 text-right`}
                            value={precos.TANATOPRAXIA}
                            placeholder="0,00"
                            onChange={(e) =>
                                setPrecos({
                                    ...precos,
                                    TANATOPRAXIA: e.target.value,
                                })
                            }
                        />
                    </div>

                    <p className="text-xs leading-5 text-[#6B7488]">
                        Avançada e embalsamamento: a família paga a diferença sobre
                        a tanatopraxia autorizada.
                    </p>
                </section>

                <section className="rounded-xl border border-[#DDE3EC] bg-white p-5">
                    <h2 className="mb-4 text-lg font-extrabold">Versões</h2>

                    {(dados?.versoes || []).length === 0 && (
                        <div className="text-sm text-[#6B7488]">
                            Nenhuma versão cadastrada.
                        </div>
                    )}

                    {(dados?.versoes || []).map((v: any) => (
                        <div
                            key={v.id}
                            className="flex items-center justify-between gap-3 border-b border-[#EEF1F5] py-2 text-sm last:border-b-0"
                        >
                            <span>
                                <b>{dataBR(v.vigente_desde)}</b> · {brl(v.valor)}
                                {v.id === dados?.vigente?.id
                                    ? " — vigente"
                                    : v.vigente_desde > hoje()
                                        ? " — agendada"
                                        : ""}
                            </span>
                            <span className="truncate text-xs text-[#6B7488]">
                                {v.nome}
                            </span>
                        </div>
                    ))}
                </section>
            </div>
        </>
    );
}

export default function ConveniosPage() {
    const [cadastro, setCadastro] = useState<Convenio[]>([]);
    const [metaOS, setMetaOS] = useState<any[]>([]);
    const [selecionadoId, setSelecionadoId] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState("");

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro("");

        try {
            const [base, os] = await Promise.all([
                listarCadastro(),
                osGet("convenios_listar"),
            ]);

            setCadastro(base);
            setMetaOS(Array.isArray(os?.dados) ? os.dados : []);

            if (!selecionadoId) {
                const primeiro =
                    (os?.dados || []).find(
                        (x: any) => x.tipo === "PREFEITURA" && x.ativo,
                    ) ||
                    (os?.dados || []).find(
                        (x: any) => x.tipo === "ASSOCIADO" && x.ativo,
                    ) ||
                    base[0];

                if (primeiro?.id) setSelecionadoId(Number(primeiro.id));
            }
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os convênios.");
        } finally {
            setLoading(false);
        }
    }, [selecionadoId]);

    useEffect(() => {
        void carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const combinados = useMemo<ConvenioOS[]>(() => {
        const mapa = new Map<number, any>(
            metaOS.map((m: any) => [Number(m.id), m]),
        );

        return cadastro
            .map((c) => ({
                ...c,
                ...(mapa.get(c.id) || {}),
                regras: c.regras,
                nome: c.nome,
                id: c.id,
                ativo: c.ativo,
            }))
            .filter((c) => c.tipo === "PREFEITURA" || c.tipo === "ASSOCIADO");
    }, [cadastro, metaOS]);

    const prefeituras = combinados.filter((c) => c.tipo === "PREFEITURA");
    const planos = combinados.filter((c) => c.tipo === "ASSOCIADO");

    const selecionado =
        combinados.find((c) => c.id === selecionadoId) || combinados[0] || null;

    useEffect(() => {
        if (selecionado && selecionado.id !== selecionadoId) {
            setSelecionadoId(selecionado.id);
        }
    }, [selecionado, selecionadoId]);

    return (
        <main className="min-h-screen bg-[#F4F6F9] p-4 text-[#313C55] md:p-6">
            <div className="mx-auto max-w-[1500px]">
                <div className="mb-5">
                    <div className="text-sm text-[#6B7488]">
                        Financeiro › Rotina de valores dos convênios
                        {selecionado?.codigo
                            ? ` · código ${selecionado.tipo === "PREFEITURA"
                                ? `Prf.${selecionado.codigo_numero || selecionado.codigo}`
                                : selecionado.codigo
                            }`
                            : ""}
                    </div>
                    <h1 className="text-2xl font-extrabold">
                        Convênios
                        {selecionado ? ` · ${selecionado.nome}` : ""}
                    </h1>
                </div>

                {erro && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {erro}
                    </div>
                )}

                {loading ? (
                    <div className="rounded-xl border border-[#DDE3EC] bg-white p-6 text-sm text-[#6B7488]">
                        Carregando convênios...
                    </div>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                        <aside className="rounded-xl border border-[#DDE3EC] bg-white p-4 lg:sticky lg:top-4 lg:self-start">
                            <div className={labelCls}>Prefeituras</div>
                            <div className="mb-5 space-y-1">
                                {prefeituras.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setSelecionadoId(c.id)}
                                        className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold ${selecionado?.id === c.id
                                                ? "border-l-4 border-[#00AEEC] bg-[#E7F4FB]"
                                                : "hover:bg-[#F4F6F9]"
                                            }`}
                                    >
                                        Prefeitura de {c.nome.replace(/^Prefeitura de\s+/i, "")}
                                    </button>
                                ))}
                                {prefeituras.length === 0 && (
                                    <div className="px-3 py-2 text-xs text-[#6B7488]">
                                        Nenhuma prefeitura configurada.
                                    </div>
                                )}
                            </div>

                            <div className={labelCls}>Planos de associado</div>
                            <div className="space-y-1">
                                {planos.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setSelecionadoId(c.id)}
                                        className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold ${selecionado?.id === c.id
                                                ? "border-l-4 border-[#00AEEC] bg-[#E7F4FB]"
                                                : "hover:bg-[#F4F6F9]"
                                            }`}
                                    >
                                        {c.nome}
                                    </button>
                                ))}
                                {planos.length === 0 && (
                                    <div className="px-3 py-2 text-xs text-[#6B7488]">
                                        Nenhum plano configurado.
                                    </div>
                                )}
                            </div>
                        </aside>

                        <div className="min-w-0">
                            {!selecionado && (
                                <div className="rounded-xl border border-[#DDE3EC] bg-white p-6 text-sm text-[#6B7488]">
                                    Nenhum convênio com configuração de OS foi encontrado.
                                </div>
                            )}

                            {selecionado?.tipo === "PREFEITURA" && (
                                <PainelPrefeitura
                                    key={selecionado.id}
                                    convenio={selecionado}
                                />
                            )}

                            {selecionado?.tipo === "ASSOCIADO" && (
                                <SecaoOS
                                    key={selecionado.id}
                                    convenio={selecionado}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
