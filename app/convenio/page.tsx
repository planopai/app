"use client";

/**
 * app/convenio/page.tsx — Convênios e pacotes
 *
 * Fluxo (02/10/2026, 3ª etapa):
 *   1. Lista de convênios → clicar abre o convênio.
 *   2. Convênio = lista de PACOTES (botão "Novo pacote" no topo; "Dados do convênio" para nome, status e OS).
 *   3. Pacote = itens próprios (cada pacote tem os seus): Urna, Roupa, Véu, Cordão, Invol, Coroa, Kit Lanche,
 *      Assistência, Tanatopraxia, Translado, Ornamentação (com item, vários aceitos), Velório e Sepultamento (Sim/Não).
 *      Na Prefeitura, cada item tem o valor no contrato (vale para qualquer produto aceito); a soma é o valor do pacote.
 *   - O pacote PADRÃO é o que o motor da OS usa hoje (atendimento ainda não escolhe pacote).
 *   - Itens escolhidos sem depósito (convenio.php?action=product_search&grupo=...). Depois de escolher, a lista fecha.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CONVENIO_API, apiJson, osGet, osPost } from "./components/api";
import type { ProdutoRegra, RegrasConvenio, SimNao } from "./components/tipos";
import { normalizeProduto, normalizeRegras, regraProduto } from "./components/tipos";
import SimNaoSelect from "./components/SimNaoSelect";
import SecaoOS from "./components/SecaoOS";

/* ====================================================================== */
/* Tipos da tela (serviços agora guardam o item escolhido)                 */
/* ====================================================================== */

type TipoFlor = "" | "Natural" | "Artificial";
type ItemEscolhido = { produto_id: number; nome: string; codigo_barras: string };
/** Regra com lista de itens; produto_id/nome/codigo_barras = o primeiro da lista (formato antigo). */
type RegraItens = ProdutoRegra & { produtos: ItemEscolhido[]; valor_contrato: string };
type ItemComTipo = RegraItens & { tipo: TipoFlor };

type RegrasTela = Omit<
    RegrasConvenio,
    "urna" | "roupa" | "veu" | "cordao" | "invol" | "kit_lanche" | "assistencia" | "tanato" | "translado" | "ornamentacao" | "coroa_flores"
> & {
    urna: RegraItens;
    roupa: RegraItens;
    veu: RegraItens;
    cordao: RegraItens;
    invol: RegraItens;
    kit_lanche: RegraItens;
    assistencia: RegraItens;
    tanato: RegraItens;
    translado: RegraItens;
    ornamentacao: ItemComTipo;
    coroa_flores: ItemComTipo;
};

type ConvenioTela = {
    id: number;
    nome: string;
    slug: string;
    ativo: boolean;
    ordem: number;
    observacao: string;
    versao: number;
    tipo: string; // tipo na OS: PARTICULAR | ASSOCIADO | PREFEITURA | ""
    codigo: string; // código na OS
    atualizado_em: string;
};

type Pacote = {
    id: number;
    convenio_id: number;
    nome: string;
    ativo: boolean;
    padrao: boolean;
    valor: number;
    vigente_desde: string;
    observacao: string;
    versao: number;
    regras: RegrasTela;
    atualizado_em: string;
    /** ATENDIMENTO (aparece no registro) ou PRODUTO (ex.: coroa da Prefeitura). Fica no módulo da OS (os_convenio_pacotes.tipo). */
    tipo: TipoPacote;
    ordem: number;
};

type TipoPacote = "ATENDIMENTO" | "PRODUTO";
const ROTULO_TIPO_PACOTE: Record<TipoPacote, string> = { ATENDIMENTO: "Atendimento", PRODUTO: "Produto" };
const AJUDA_TIPO_PACOTE: Record<TipoPacote, string> = {
    ATENDIMENTO: "Aparece no registro do atendimento, na escolha do pacote.",
    PRODUTO: "Pacote de produto (ex.: coroa de flores): vale mesmo sem o pacote de atendimento e não aparece na escolha do pacote.",
};

type Grupo = "urna" | "roupa" | "veu" | "cordao" | "invol" | "coroa_natural" | "coroa_artificial" | "servico";

type ProdutoBusca = {
    id: number;
    nome: string;
    codigo_barras: string;
    valor: number | null;
    saldo_total: number | null;
};

const tipoFlor = (v: any): TipoFlor => (v === "Natural" || v === "Artificial" ? v : "");

/** Grava a lista e espelha o primeiro item nos campos antigos. */
function comItens<T extends RegraItens>(r: T, produtos: ItemEscolhido[]): T {
    const p = produtos[0];
    return {
        ...r,
        produtos,
        produto_id: p ? p.produto_id : 0,
        nome: p ? p.nome : "",
        codigo_barras: p ? p.codigo_barras : "",
        deposito_nome: "",
    };
}

function regraVazia(valor: SimNao = ""): RegraItens {
    return { ...regraProduto(), valor, produtos: [], valor_contrato: "" };
}

const num = (s: any) => {
    if (s === null || s === undefined || s === "") return 0;
    const raw = String(s).trim();
    if (!raw) return 0;

    // Aceita tanto 1.234,56 quanto 1234.56/1234,56.
    const normalizado =
        raw.includes(",")
            ? raw.replace(/\./g, "").replace(",", ".")
            : raw.replace(/[^0-9.-]/g, "");

    const n = Number(normalizado);
    return Number.isFinite(n) ? n : 0;
};

const decBR = (v: any) => {
    const n = num(v);
    return n > 0
        ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "";
};

/** Campo monetário: aceita somente números e no máximo 2 casas decimais. */
const valorMonetarioDigitado = (valor: string) => {
    let s = String(valor ?? "")
        .replace(/[^0-9,.]/g, "")
        .replace(/\./g, ",");

    const primeiraVirgula = s.indexOf(",");
    if (primeiraVirgula >= 0) {
        const inteiro = s.slice(0, primeiraVirgula).replace(/\D/g, "");
        const decimal = s.slice(primeiraVirgula + 1).replace(/\D/g, "").slice(0, 2);
        return `${inteiro || "0"},${decimal}`;
    }

    return s.replace(/\D/g, "");
};
const hoje = () => new Date().toLocaleDateString("sv-SE");
const dataBR = (s: string) => (s ? new Date(s.slice(0, 10) + "T12:00").toLocaleDateString("pt-BR") : "—");

function normalizarRegrasTela(raw: any): RegrasTela {
    const base = normalizeRegras(raw);
    const limpo = (v: any): RegraItens => {
        const p = normalizeProduto(v);
        const vistos = new Set<number>();
        const lista: ItemEscolhido[] = [];
        const fonte: any[] = Array.isArray(v?.produtos) && v.produtos.length > 0
            ? v.produtos
            : p.produto_id > 0
                ? [{ produto_id: p.produto_id, nome: p.nome, codigo_barras: p.codigo_barras }]
                : [];
        fonte.forEach((x) => {
            const id = Number(x?.produto_id ?? x?.id ?? 0) || 0;
            if (id > 0 && !vistos.has(id)) {
                vistos.add(id);
                lista.push({ produto_id: id, nome: String(x?.nome ?? ""), codigo_barras: String(x?.codigo_barras ?? "") });
            }
        });
        return comItens({ ...p, produtos: [], valor_contrato: decBR(v?.valor_contrato) }, p.valor === "Sim" ? lista : []);
    };

    return {
        ...base,
        urna: limpo(raw?.urna),
        roupa: limpo(raw?.roupa),
        veu: limpo(raw?.veu),
        cordao: limpo(raw?.cordao),
        invol: limpo(raw?.invol),
        coroa_flores: { ...limpo(raw?.coroa_flores), tipo: tipoFlor(raw?.coroa_flores?.tipo) },
        kit_lanche: limpo(raw?.kit_lanche),
        assistencia: limpo(raw?.assistencia),
        tanato: limpo(raw?.tanato),
        translado: limpo(raw?.translado),
        ornamentacao: { ...limpo(raw?.ornamentacao), tipo: tipoFlor(raw?.ornamentacao?.tipo) },
    };
}

function convenioNovoTela(): ConvenioTela {
    return { id: 0, nome: "", slug: "", ativo: true, ordem: 0, observacao: "", versao: 0, tipo: "", codigo: "", atualizado_em: "" };
}

function pacoteNovo(convenioId: number, padrao: boolean): Pacote {
    return {
        id: 0,
        convenio_id: convenioId,
        nome: "",
        ativo: true,
        padrao,
        valor: 0,
        vigente_desde: hoje(),
        observacao: "",
        versao: 0,
        regras: normalizarRegrasTela({}),
        atualizado_em: "",
        tipo: "ATENDIMENTO",
        ordem: 0,
    };
}

type ChaveEstoque = "urna" | "roupa" | "veu" | "cordao" | "invol";
type ChaveServico = "kit_lanche" | "assistencia" | "tanato" | "translado" | "ornamentacao";

const ITENS_ESTOQUE: [ChaveEstoque, string, Grupo][] = [
    ["urna", "Urna", "urna"],
    ["roupa", "Roupa", "roupa"],
    ["veu", "Véu", "veu"],
    ["cordao", "Cordão São Francisco", "cordao"],
    ["invol", "Invol", "invol"],
];

const ITENS_SERVICO: [ChaveServico, string][] = [
    ["kit_lanche", "Kit Lanche"],
    ["assistencia", "Assistência (Materiais)"],
    ["tanato", "Tanatopraxia"],
    ["translado", "Translado"],
    ["ornamentacao", "Ornamentação"],
];

const ITENS_SIM_NAO = [
    ["realiza_velorio", "Velório"],
    ["realiza_sepultamento", "Sepultamento"],
] as const;

/** Regras que têm valor no contrato (Prefeitura). Tanatopraxia e Translado usam preços próprios em Dados do convênio. */
const CHAVES_COM_VALOR = ["urna", "roupa", "veu", "cordao", "invol", "coroa_flores", "kit_lanche", "assistencia", "ornamentacao"] as const;

/** Soma do pacote = valor de cada item "Sim" (uma vez por item). */
function somaPacote(r: RegrasTela): number {
    return CHAVES_COM_VALOR.reduce((a, k) => a + (r[k].valor === "Sim" ? num(r[k].valor_contrato) : 0), 0);
}

const ROTULOS: Record<string, string> = {
    urna: "Urna", roupa: "Roupa", veu: "Véu", cordao: "Cordão", invol: "Invol", coroa_flores: "Coroa",
    kit_lanche: "Kit Lanche", assistencia: "Assistência", tanato: "Tanatopraxia", translado: "Translado", ornamentacao: "Ornamentação",
    realiza_velorio: "Velório", realiza_sepultamento: "Sepultamento",
};

/** Itens marcados "Sim" sem item escolhido (e, na Prefeitura, sem valor) — bloqueiam o salvar. */
function pendenciasRegras(r: RegrasTela, comValor = false): string[] {
    const out: string[] = [];
    if (comValor) {
        CHAVES_COM_VALOR.forEach((k) => {
            if (r[k].valor === "Sim" && num(r[k].valor_contrato) <= 0) out.push(`valor de ${ROTULOS[k]}`);
        });
    }
    ITENS_ESTOQUE.forEach(([k, label]) => {
        if (r[k].valor === "Sim" && r[k].produtos.length === 0) out.push(label);
    });
    if (r.coroa_flores.valor === "Sim") {
        if (!r.coroa_flores.tipo) out.push("Coroa de Flores (tipo)");
        else if (r.coroa_flores.produtos.length === 0) out.push("Coroa de Flores");
    }
    ITENS_SERVICO.forEach(([k, label]) => {
        if (r[k].valor === "Sim" && r[k].produtos.length === 0) out.push(label);
    });
    return out;
}

const moeda = (v: number | null) =>
    v === null || Number.isNaN(v) ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ====================================================================== */
/* Seletor de itens (sem depósito, vários itens por opção)                  */
/* ====================================================================== */

function ItemPicker({
    titulo,
    descricao,
    grupo,
    value,
    onChange,
    disabled,
    mostrarQuantidade = true,
    mostrarSaldo = true,
    extra,
    avisoSemGrupo,
    comValor = false,
}: {
    titulo: string;
    descricao: string;
    /** Grupo da busca; vazio = ainda não dá para buscar (ex.: coroa sem tipo). */
    grupo: Grupo | "";
    value: RegraItens;
    onChange: (next: RegraItens) => void;
    disabled?: boolean;
    mostrarQuantidade?: boolean;
    mostrarSaldo?: boolean;
    /** Campos a mais exibidos quando "Sim" (ex.: tipo da coroa/ornamentação). */
    extra?: React.ReactNode;
    avisoSemGrupo?: string;
    /** Prefeitura: mostra "Valor no contrato" (vale para qualquer item aceito). */
    comValor?: boolean;
}) {
    const [q, setQ] = useState("");
    const [rows, setRows] = useState<ProdutoBusca[]>([]);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");
    /** Busca aberta a pedido ("Adicionar outro item"). Sem itens escolhidos, a busca fica sempre aberta. */
    const [adicionando, setAdicionando] = useState(false);
    /** Mantém os detalhes recolhidos por padrão para deixar a tela do pacote mais compacta. */
    const [expandido, setExpandido] = useState(false);

    const escolhidos = value.produtos;
    const buscaAberta =
        expandido && value.valor === "Sim" && grupo !== "" && (escolhidos.length === 0 || adicionando);

    useEffect(() => {
        if (!buscaAberta) {
            setRows([]);
            return;
        }

        const ac = new AbortController();
        const t = window.setTimeout(async () => {
            setLoading(true);
            setErro("");

            try {
                const url = new URL(CONVENIO_API);
                url.searchParams.set("action", "product_search");
                url.searchParams.set("grupo", grupo);
                url.searchParams.set("q", q.trim());
                url.searchParams.set("limit", "80");
                url.searchParams.set("_", String(Date.now()));

                const json = await apiJson(url.toString(), { signal: ac.signal });
                const lista = Array.isArray(json?.data) ? json.data : Array.isArray(json?.dados) ? json.dados : [];

                setRows(
                    lista.map((r: any) => ({
                        id: Number(r?.id ?? 0) || 0,
                        nome: String(r?.nome ?? ""),
                        codigo_barras: String(r?.codigo_barras ?? ""),
                        valor: r?.valor === null || r?.valor === undefined ? null : Number(r.valor),
                        saldo_total: r?.saldo_total === null || r?.saldo_total === undefined ? null : Number(r.saldo_total),
                    })),
                );
            } catch (e: any) {
                if (e?.name !== "AbortError") {
                    setRows([]);
                    setErro(e?.message || "Não foi possível consultar os itens.");
                }
            } finally {
                if (!ac.signal.aborted) setLoading(false);
            }
        }, 250);

        return () => {
            window.clearTimeout(t);
            ac.abort();
        };
    }, [buscaAberta, grupo, q]);

    const setValor = (v: SimNao) => {
        setQ("");
        setAdicionando(false);
        if (v !== "Sim") {
            setExpandido(false);
            onChange(regraVazia(v));
            setRows([]);
            return;
        }
        // Ao marcar Sim sem item escolhido, abre só para permitir a configuração inicial.
        // Pacotes já configurados continuam compactos ao entrar na tela.
        if (escolhidos.length === 0) setExpandido(true);
        onChange({ ...value, valor: "Sim", deposito_nome: "", quantidade: Math.max(1, value.quantidade || 1) });
    };

    const selecionar = (row: ProdutoBusca) => {
        if (row.id <= 0 || escolhidos.some((x) => x.produto_id === row.id)) return;
        onChange(comItens(value, [...escolhidos, { produto_id: row.id, nome: row.nome, codigo_barras: row.codigo_barras }]));
        setQ("");
        setAdicionando(false);
        setExpandido(false); // escolheu: recolhe o card novamente
    };

    const remover = (id: number) => onChange(comItens(value, escolhidos.filter((x) => x.produto_id !== id)));

    const faltaItem = value.valor === "Sim" && escolhidos.length === 0;

    return (
        <section
            className={[
                "bg-white px-4 py-3",
                faltaItem ? "bg-amber-50/40" : "",
            ].join(" ")}
        >
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800">{titulo}</h3>
                    {value.valor === "Sim" && escolhidos.length > 0 && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                            {escolhidos.length === 1 ? escolhidos[0].nome : `${escolhidos.length} itens selecionados`}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 md:w-[228px]">
                    <div className="min-w-0 flex-1">
                        <SimNaoSelect value={value.valor} onChange={setValor} disabled={disabled} />
                    </div>
                    {value.valor === "Sim" && (
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setExpandido((v) => !v)}
                            aria-expanded={expandido}
                            aria-label={expandido ? `Ocultar detalhes de ${titulo}` : `Mostrar detalhes de ${titulo}`}
                            title={expandido ? "Ocultar detalhes" : "Mostrar detalhes"}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                        >
                            <span className={`text-base transition-transform ${expandido ? "rotate-180" : ""}`}>⌄</span>
                        </button>
                    )}
                </div>
            </div>

            {value.valor === "Sim" && expandido && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">{descricao}</p>
                    {(extra || mostrarQuantidade) && (
                        <div className="grid gap-3 md:grid-cols-2">
                            {extra}
                            {mostrarQuantidade && (
                                <label className="text-sm text-slate-700">
                                    <span className="mb-1 block font-medium">Quantidade padrão</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={value.quantidade}
                                        disabled={disabled}
                                        onChange={(e) =>
                                            onChange({ ...value, quantidade: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })
                                        }
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                                    />
                                </label>
                            )}
                        </div>
                    )}

                    {/* Itens escolhidos */}
                    {escolhidos.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-slate-500">
                                {escolhidos.length === 1
                                    ? "Item escolhido"
                                    : `${escolhidos.length} itens aceitos`}
                            </div>
                            {escolhidos.map((it) => (
                                <div
                                    key={it.produto_id}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                                >
                                    <span className="min-w-0">
                                        <b className="block truncate">{it.nome || "item"}</b>
                                        <span className="text-xs text-emerald-800">
                                            produto #{it.produto_id}
                                            {it.codigo_barras ? ` · CB ${it.codigo_barras}` : ""}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => remover(it.produto_id)}
                                        className="shrink-0 text-xs font-semibold text-emerald-800 underline hover:text-emerald-950 disabled:opacity-60"
                                    >
                                        Remover
                                    </button>
                                </div>
                            ))}
                            {grupo !== "" && !adicionando && (
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => setAdicionando(true)}
                                    className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                                >
                                    + Adicionar outro item
                                </button>
                            )}
                        </div>
                    )}

                    {grupo === "" ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            {avisoSemGrupo || "Complete os campos acima para listar os itens."}
                        </div>
                    ) : (
                        buscaAberta && (
                            <div className="space-y-2">
                                <div className="flex items-end gap-2">
                                    <label className="block flex-1 text-sm text-slate-700">
                                        <span className="mb-1 block font-medium">
                                            {escolhidos.length > 0 ? "Adicionar outro item" : "Buscar item"}
                                        </span>
                                        <input
                                            value={q}
                                            disabled={disabled}
                                            onChange={(e) => setQ(e.target.value)}
                                            placeholder="Digite para filtrar ou deixe vazio para listar..."
                                            className="w-full rounded-lg border border-slate-300 px-3 py-2"
                                        />
                                    </label>
                                    {escolhidos.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAdicionando(false);
                                                setQ("");
                                            }}
                                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                                        >
                                            Fechar
                                        </button>
                                    )}
                                </div>

                                <div className="max-h-52 overflow-y-auto rounded-lg border">
                                    {loading && <div className="p-3 text-sm text-slate-500">Consultando itens...</div>}

                                    {!loading && erro && <div className="p-3 text-sm text-red-700">{erro}</div>}

                                    {!loading && !erro && rows.length === 0 && (
                                        <div className="p-3 text-sm text-slate-500">Nenhum item encontrado.</div>
                                    )}

                                    {!loading &&
                                        !erro &&
                                        rows.map((row) => {
                                            const jaEscolhido = escolhidos.some((x) => x.produto_id === row.id);

                                            return (
                                                <button
                                                    type="button"
                                                    key={row.id}
                                                    disabled={disabled || row.id <= 0 || jaEscolhido}
                                                    onClick={() => selecionar(row)}
                                                    className={[
                                                        "flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0",
                                                        jaEscolhido ? "cursor-default bg-slate-50 text-slate-400" : "hover:bg-blue-50",
                                                    ].join(" ")}
                                                >
                                                    <span className="min-w-0">
                                                        <span className="block font-medium">{row.nome}</span>
                                                        <span className="block text-xs text-slate-500">
                                                            ID {row.id}
                                                            {row.codigo_barras ? ` · CB ${row.codigo_barras}` : ""}
                                                            {jaEscolhido ? " · já escolhido" : ""}
                                                        </span>
                                                    </span>
                                                    <span className="shrink-0 text-right text-xs text-slate-500">
                                                        {row.valor !== null && row.valor > 0 && <span className="block">{moeda(row.valor)}</span>}
                                                        {mostrarSaldo && row.saldo_total !== null && (
                                                            <span className="block">Saldo {row.saldo_total.toLocaleString("pt-BR")}</span>
                                                        )}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                </div>

                                {escolhidos.length === 0 && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                        Escolha um item na lista. Ele é obrigatório quando a opção está como “Sim”.
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </div>
            )}
        </section>
    );
}

/* ====================================================================== */
/* Peças de tela                                                           */
/* ====================================================================== */

const btnPrim = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60";
const btnSec = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";
const btnPerigo = "rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60";
const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2";

const TIPO_OS: Record<string, string> = {
    PARTICULAR: "Particular",
    ASSOCIADO: "Plano de associado",
    PREFEITURA: "Prefeitura",
};

function Etiqueta({ cor, children }: { cor: "verde" | "cinza" | "azul" | "amarelo"; children: React.ReactNode }) {
    const cls = {
        verde: "bg-emerald-100 text-emerald-800",
        cinza: "bg-slate-200 text-slate-600",
        azul: "bg-blue-100 text-blue-800",
        amarelo: "bg-amber-100 text-amber-800",
    }[cor];
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{children}</span>;
}

function ModalExcluir({
    titulo,
    nome,
    aviso,
    ocupado,
    onCancelar,
    onConfirmar,
}: {
    titulo: string;
    nome: string;
    aviso: string;
    ocupado: boolean;
    onCancelar: () => void;
    onConfirmar: () => void;
}) {
    const [conf, setConf] = useState("");
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !ocupado) onCancelar();
            }}
        >
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                <h2 className="text-xl font-bold text-red-700">{titulo}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                    {aviso} <b>{nome}</b>. Para confirmar, digite exatamente:
                </p>
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center font-mono text-base font-bold tracking-widest text-red-700">
                    EXCLUIR
                </div>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                    Confirmação
                    <input
                        autoFocus
                        value={conf}
                        disabled={ocupado}
                        onChange={(e) => setConf(e.target.value)}
                        placeholder="Digite EXCLUIR"
                        autoComplete="off"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                    />
                </label>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" disabled={ocupado} onClick={onCancelar} className={btnSec}>
                        Cancelar
                    </button>
                    <button
                        type="button"
                        disabled={ocupado || conf !== "EXCLUIR"}
                        onClick={onConfirmar}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {ocupado ? "Excluindo..." : "Confirmar exclusão"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ====================================================================== */
/* Página                                                                  */
/* ====================================================================== */

type Tela = "lista" | "convenio" | "dados" | "pacote";

export default function ConveniosAdminPage() {
    const [tela, setTela] = useState<Tela>("lista");

    const [rows, setRows] = useState<ConvenioTela[]>([]);
    const [loading, setLoading] = useState(true);

    /** Convênio aberto (tela de pacotes) */
    const [atual, setAtual] = useState<ConvenioTela | null>(null);
    /** Formulário "Dados do convênio" */
    const [form, setForm] = useState<ConvenioTela>(convenioNovoTela());

    const [pacotes, setPacotes] = useState<Pacote[]>([]);
    const [carregandoPacotes, setCarregandoPacotes] = useState(false);
    const [pacote, setPacote] = useState<Pacote>(pacoteNovo(0, true));

    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [erro, setErro] = useState("");
    const [msg, setMsg] = useState("");
    const [excluir, setExcluir] = useState<null | "convenio" | "pacote">(null);
    const [novoTipo, setNovoTipo] = useState<null | { tipo: TipoPacote; nome: string }>(null);
    const [classificacaoErro, setClassificacaoErro] = useState("");

    const bloqueado = saving || deleting;
    const ehPrefeitura = (atual?.tipo || "").toUpperCase() === "PREFEITURA";

    const topo = () => window.scrollTo({ top: 0, behavior: "smooth" });
    const limparAvisos = () => {
        setErro("");
        setMsg("");
    };

    const normalizarConvenio = useCallback(
        (r: any): ConvenioTela => ({
            id: Number(r?.id ?? 0),
            nome: String(r?.nome ?? ""),
            slug: String(r?.slug ?? ""),
            ativo: !!r?.ativo,
            ordem: Number(r?.ordem ?? 0),
            observacao: String(r?.observacao ?? ""),
            versao: Number(r?.versao ?? 0),
            tipo: String(r?.tipo ?? ""),
            codigo: String(r?.codigo ?? ""),
            atualizado_em: String(r?.atualizado_em ?? ""),
        }),
        [],
    );

    const normalizarPacote = (r: any): Pacote => ({
        id: Number(r?.id ?? 0),
        convenio_id: Number(r?.convenio_id ?? 0),
        nome: String(r?.nome ?? ""),
        ativo: !!r?.ativo,
        padrao: !!r?.padrao,
        valor: Number(r?.valor ?? 0),
        vigente_desde: String(r?.vigente_desde ?? hoje()).slice(0, 10),
        observacao: String(r?.observacao ?? ""),
        versao: Number(r?.versao ?? 1),
        regras: normalizarRegrasTela(r?.regras),
        atualizado_em: String(r?.atualizado_em ?? ""),
        tipo: String(r?.tipo ?? "").toUpperCase() === "PRODUTO" ? "PRODUTO" : "ATENDIMENTO",
        ordem: Number(r?.ordem ?? 0),
    });

    /* ---------------------------- carregamentos ---------------------------- */

    const carregar = useCallback(async (): Promise<ConvenioTela[]> => {
        setLoading(true);
        try {
            await apiJson(`${CONVENIO_API}?action=me&_=${Date.now()}`);
            const data = await apiJson(`${CONVENIO_API}?action=list&include_inactive=1&_=${Date.now()}`);
            const lista = Array.isArray(data?.data) ? data.data : Array.isArray(data?.dados) ? data.dados : [];
            const conv = lista.map(normalizarConvenio);
            setRows(conv);
            return conv;
        } catch (e: any) {
            setErro(e?.message || "Não foi possível carregar os convênios.");
            return [];
        } finally {
            setLoading(false);
        }
    }, [normalizarConvenio]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const carregarPacotes = async (convId: number) => {
        setCarregandoPacotes(true);
        try {
            const data = await apiJson(`${CONVENIO_API}?action=pacotes_listar&convenio_id=${convId}&_=${Date.now()}`);
            const lista: Pacote[] = (Array.isArray(data?.data) ? data.data : []).map(normalizarPacote);
            // Tipo e ordem vêm do módulo da OS (os_convenio_pacotes.tipo / .ordem). Sem as colunas, todos ficam como Atendimento.
            try {
                const c = await osGet("convenio_pacotes_classificacao", { convenio_id: convId });
                const mapa = new Map<number, { tipo: string; ordem: number }>((c?.dados?.pacotes || []).map((x: any) => [Number(x.id), x]));
                lista.forEach((p) => {
                    const m = mapa.get(p.id);
                    if (m) {
                        p.tipo = String(m.tipo).toUpperCase() === "PRODUTO" ? "PRODUTO" : "ATENDIMENTO";
                        p.ordem = Number(m.ordem) || 0;
                    }
                });
                setClassificacaoErro(c?.dados?.colunas === false ? "Rode o alteracoes_atendimento_sugeridas.sql: faltam as colunas tipo e ordem dos pacotes." : "");
            } catch (e: any) {
                setClassificacaoErro(e?.message || "Não foi possível carregar o tipo e a ordem dos pacotes.");
            }
            lista.sort((a, b) => (a.ordem || 9999) - (b.ordem || 9999) || a.id - b.id);
            setPacotes(lista);
            return lista;
        } catch (e: any) {
            setPacotes([]);
            setErro(e?.message || "Não foi possível carregar os pacotes.");
            return [] as Pacote[];
        } finally {
            setCarregandoPacotes(false);
        }
    };

    /** Setas da lista: muda a posição do pacote e grava a ordem (a mesma ordem aparece no registro do atendimento). */
    const moverPacote = async (i: number, d: -1 | 1) => {
        if (!atual || bloqueado) return;
        const j = i + d;
        if (j < 0 || j >= pacotes.length) return;
        const nova = pacotes.slice();
        [nova[i], nova[j]] = [nova[j], nova[i]];
        setPacotes(nova.map((p, k) => ({ ...p, ordem: k + 1 })));
        try {
            await osPost("convenio_pacotes_ordenar", { convenio_id: atual.id, ids: JSON.stringify(nova.map((p) => p.id)) });
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar a ordem dos pacotes.");
            void carregarPacotes(atual.id);
        }
    };

    /* ------------------------------ navegação ------------------------------ */

    const irParaLista = () => {
        if (bloqueado) return;
        limparAvisos();
        setAtual(null);
        setPacotes([]);
        setTela("lista");
        topo();
    };

    const abrirConvenio = (c: ConvenioTela) => {
        limparAvisos();
        setAtual(c);
        setTela("convenio");
        void carregarPacotes(c.id);
        topo();
    };

    const voltarConvenio = () => {
        if (bloqueado || !atual) return;
        limparAvisos();
        setTela("convenio");
        topo();
        if (tela === "dados") {
            // os dados da OS (tipo/código) podem ter mudado em "Dados do convênio": recarrega convênio e pacotes
            void carregar().then((lista) => {
                const c = lista.find((x) => x.id === atual.id);
                if (c) setAtual(c);
            });
            void carregarPacotes(atual.id);
        }
    };

    const novoConvenio = () => {
        limparAvisos();
        setAtual(null);
        setForm(convenioNovoTela());
        setTela("dados");
        topo();
    };

    const editarDados = () => {
        if (!atual) return;
        limparAvisos();
        setForm({ ...atual });
        setTela("dados");
        topo();
    };

    const abrirPacote = (p: Pacote) => {
        limparAvisos();
        setPacote({ ...p, regras: normalizarRegrasTela(p.regras) });
        setTela("pacote");
        topo();
    };

    /** "Novo pacote": primeiro escolhe o tipo e o nome (janela); os itens são escolhidos na tela do pacote, como hoje. */
    const novoPacote = () => {
        if (!atual) return;
        limparAvisos();
        setNovoTipo({ tipo: "ATENDIMENTO", nome: "" });
    };
    const continuarNovoPacote = () => {
        if (!atual || !novoTipo || !novoTipo.nome.trim()) return;
        const temAtendAtivo = pacotes.some((p) => p.ativo && p.tipo === "ATENDIMENTO");
        setPacote({ ...pacoteNovo(atual.id, novoTipo.tipo === "ATENDIMENTO" && !temAtendAtivo), tipo: novoTipo.tipo, nome: novoTipo.nome.trim() });
        setNovoTipo(null);
        setTela("pacote");
        topo();
    };

    const duplicarPacote = () => {
        limparAvisos();
        setPacote({ ...pacote, id: 0, versao: 0, padrao: false, nome: `${pacote.nome} (cópia)`, regras: normalizarRegrasTela(pacote.regras) });
        setMsg("Cópia criada. Ajuste o nome e os itens e salve.");
        topo();
    };

    /* ------------------------------ ações: convênio ------------------------------ */

    const salvarDados = async () => {
        if (bloqueado) return;
        const nome = form.nome.trim();
        if (!nome) {
            setErro("Informe o nome do convênio.");
            topo();
            return;
        }
        setSaving(true);
        limparAvisos();
        try {
            const r = await apiJson(CONVENIO_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "save_info",
                    id: form.id || 0,
                    nome,
                    ativo: form.ativo,
                    ordem: form.ordem,
                    observacao: form.observacao.trim(),
                    versao: form.versao,
                }),
            });
            const salvo = normalizarConvenio(r?.data);
            const lista = await carregar();
            const conv = lista.find((c) => c.id === salvo.id) || salvo;
            const eraNovo = !form.id;
            abrirConvenio(conv);
            setMsg(eraNovo ? "Convênio criado. Agora crie os pacotes." : "Dados do convênio salvos.");
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar o convênio.");
            topo();
            if (e?.code === "VERSION_CONFLICT") await carregar();
        } finally {
            setSaving(false);
        }
    };

    const excluirConvenio = async () => {
        if (!form.id || bloqueado) return;
        setDeleting(true);
        limparAvisos();
        try {
            await apiJson(CONVENIO_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "delete", id: form.id, versao: form.versao, confirmacao: "EXCLUIR" }),
            });
            setExcluir(null);
            setAtual(null);
            setTela("lista");
            await carregar();
            setMsg("Convênio excluído com sucesso.");
            topo();
        } catch (e: any) {
            setExcluir(null);
            setErro(e?.message || "Não foi possível excluir o convênio.");
            topo();
        } finally {
            setDeleting(false);
        }
    };

    /* ------------------------------ ações: pacote ------------------------------ */

    const pendencias = useMemo(() => pendenciasRegras(pacote.regras, ehPrefeitura), [pacote.regras, ehPrefeitura]);
    const total = useMemo(() => somaPacote(pacote.regras), [pacote.regras]);
    const temItem = useMemo(
        () => Object.keys(ROTULOS).some((k) => (pacote.regras as any)[k]?.valor === "Sim"),
        [pacote.regras],
    );

    const patchRegra = <K extends keyof RegrasTela>(key: K, value: RegrasTela[K]) => {
        setPacote((prev) => ({ ...prev, regras: { ...prev.regras, [key]: value } }));
    };

    const salvarPacote = async () => {
        if (bloqueado || !atual) return;
        if (!pacote.nome.trim()) {
            setErro("Informe o nome do pacote.");
            topo();
            return;
        }
        if (!temItem) {
            setErro("Marque ao menos um item como “Sim” no pacote.");
            topo();
            return;
        }
        if (pendencias.length > 0) {
            setErro(`Falta: ${pendencias.join(", ")}.`);
            topo();
            return;
        }
        setSaving(true);
        limparAvisos();
        const idsAntes = new Set(pacotes.map((p) => p.id));
        try {
            const resp = await apiJson(CONVENIO_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "pacote_salvar",
                    id: pacote.id || 0,
                    convenio_id: atual.id,
                    nome: pacote.nome.trim(),
                    ativo: pacote.ativo,
                    padrao: pacote.padrao,
                    vigente_desde: pacote.vigente_desde,
                    observacao: pacote.observacao.trim(),
                    versao: pacote.versao,
                    regras: pacote.regras,
                }),
            });
            const eraNovo = !pacote.id;
            let lista = await carregarPacotes(atual.id);
            // id do pacote salvo: o que o convenio.php devolveu, ou o que apareceu na lista agora
            const idSalvo =
                pacote.id ||
                Number(resp?.data?.id ?? resp?.dados?.id ?? resp?.id ?? 0) ||
                (lista.filter((p) => !idsAntes.has(p.id)).sort((a, b) => b.id - a.id)[0]?.id ?? 0);
            let avisoTipo = "";
            const salvo = lista.find((p) => p.id === idSalvo);
            if (idSalvo && (!salvo || salvo.tipo !== pacote.tipo || eraNovo)) {
                try {
                    await osPost("convenio_pacote_classificar", { pacote_id: idSalvo, tipo: pacote.tipo });
                    lista = await carregarPacotes(atual.id);
                } catch (e: any) {
                    avisoTipo = ` Mas o tipo do pacote não foi gravado: ${e?.message || "erro desconhecido"}.`;
                }
            }
            setTela("convenio");
            setMsg((eraNovo ? "Pacote criado com sucesso." : "Pacote atualizado com sucesso.") + avisoTipo);
            topo();
        } catch (e: any) {
            setErro(e?.message || "Não foi possível salvar o pacote.");
            topo();
            if (e?.code === "VERSION_CONFLICT") await carregarPacotes(atual.id);
        } finally {
            setSaving(false);
        }
    };

    const excluirPacote = async () => {
        if (!atual || !pacote.id || bloqueado) return;
        setDeleting(true);
        limparAvisos();
        try {
            await apiJson(CONVENIO_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "pacote_excluir",
                    id: pacote.id,
                    convenio_id: atual.id,
                    versao: pacote.versao,
                    confirmacao: "EXCLUIR",
                }),
            });
            setExcluir(null);
            await carregarPacotes(atual.id);
            setTela("convenio");
            setMsg("Pacote excluído com sucesso.");
            topo();
        } catch (e: any) {
            setExcluir(null);
            setErro(e?.message || "Não foi possível excluir o pacote.");
            topo();
        } finally {
            setDeleting(false);
        }
    };

    const formatarData = (value?: string) => {
        const raw = String(value || "").trim();
        if (!raw) return "—";
        const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
        if (Number.isNaN(date.getTime())) return raw;
        return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
    };

    const regras = pacote.regras;
    const coroa = regras.coroa_flores;
    const grupoCoroa: Grupo | "" =
        coroa.tipo === "Natural" ? "coroa_natural" : coroa.tipo === "Artificial" ? "coroa_artificial" : "";

    /* ------------------------------ render ------------------------------ */

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
            <div className="mx-auto max-w-7xl space-y-6">
                {/* Cabeçalho de cada tela */}
                {tela === "lista" && (
                    <header className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
                        <div>
                            <h1 className="text-2xl font-bold">Convênios</h1>
                            <p className="mt-1 text-sm text-slate-600">Cadastre convênios e os pacotes de cada um.</p>
                        </div>
                        <button type="button" onClick={novoConvenio} className={btnPrim}>
                            Novo convênio
                        </button>
                    </header>
                )}

                {tela === "convenio" && atual && (
                    <header className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
                        <div>
                            <button type="button" onClick={irParaLista} className="text-xs font-semibold text-blue-700 hover:underline">
                                ‹ Convênios
                            </button>
                            <h1 className="mt-1 text-2xl font-bold">{atual.nome}</h1>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Etiqueta cor={atual.ativo ? "verde" : "cinza"}>{atual.ativo ? "Ativo" : "Inativo"}</Etiqueta>
                                {atual.tipo ? (
                                    <Etiqueta cor="azul">
                                        {TIPO_OS[atual.tipo] || atual.tipo}
                                        {atual.codigo ? ` · ${atual.codigo}` : ""}
                                    </Etiqueta>
                                ) : (
                                    <Etiqueta cor="amarelo">OS não configurada</Etiqueta>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <button type="button" onClick={editarDados} className={btnSec}>
                                Dados do convênio
                            </button>
                            <button type="button" onClick={novoPacote} className={btnPrim}>
                                Novo pacote
                            </button>
                        </div>
                    </header>
                )}

                {tela === "dados" && (
                    <header className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
                        <div>
                            <button
                                type="button"
                                onClick={atual ? voltarConvenio : irParaLista}
                                className="text-xs font-semibold text-blue-700 hover:underline"
                            >
                                ‹ {atual ? atual.nome : "Convênios"}
                            </button>
                            <h1 className="mt-1 text-2xl font-bold">{form.id ? "Dados do convênio" : "Novo convênio"}</h1>
                            <p className="mt-1 text-sm text-slate-600">Nome, status e como o convênio entra na Ordem de Serviço.</p>
                        </div>
                        {form.id > 0 && (
                            <button type="button" onClick={() => setExcluir("convenio")} disabled={bloqueado} className={btnPerigo}>
                                Excluir convênio
                            </button>
                        )}
                    </header>
                )}

                {tela === "pacote" && atual && (
                    <header className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
                        <div>
                            <button type="button" onClick={voltarConvenio} className="text-xs font-semibold text-blue-700 hover:underline">
                                ‹ {atual.nome}
                            </button>
                            <h1 className="mt-1 text-2xl font-bold">{pacote.id ? pacote.nome || `Pacote #${pacote.id}` : "Novo pacote"}</h1>
                            <p className="mt-1 text-sm text-slate-600">Os itens deste pacote são só dele.</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                <span className="font-medium">Tipo do pacote:</span>
                                <span className="inline-flex overflow-hidden rounded-lg border border-slate-300">
                                    {(["ATENDIMENTO", "PRODUTO"] as TipoPacote[]).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            disabled={bloqueado}
                                            aria-pressed={pacote.tipo === t}
                                            onClick={() => setPacote((p) => ({ ...p, tipo: t, padrao: t === "PRODUTO" ? false : p.padrao }))}
                                            className={`px-3 py-1.5 text-xs font-semibold ${pacote.tipo === t ? "bg-slate-800 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
                                        >
                                            {ROTULO_TIPO_PACOTE[t]}
                                        </button>
                                    ))}
                                </span>
                                <span className="text-xs text-slate-500">{AJUDA_TIPO_PACOTE[pacote.tipo]}</span>
                            </div>
                        </div>
                        {pacote.id > 0 && (
                            <div className="flex flex-col-reverse gap-2 sm:flex-row">
                                <button type="button" onClick={duplicarPacote} disabled={bloqueado} className={btnSec}>
                                    Duplicar
                                </button>
                                <button type="button" onClick={() => setExcluir("pacote")} disabled={bloqueado} className={btnPerigo}>
                                    Excluir pacote
                                </button>
                            </div>
                        )}
                    </header>
                )}

                {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erro}</div>}
                {msg && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{msg}</div>
                )}

                {/* ======================= 1. Lista de convênios ======================= */}
                {tela === "lista" && (
                    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                        <div className="border-b p-5">
                            <h2 className="text-lg font-bold">Convênios cadastrados</h2>
                            <p className="mt-1 text-xs text-slate-500">{rows.length} registro(s)</p>
                        </div>
                        {loading ? (
                            <div className="p-8 text-center text-sm text-slate-500">Carregando convênios...</div>
                        ) : rows.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="text-sm font-medium text-slate-700">Nenhum convênio cadastrado.</div>
                                <button type="button" onClick={novoConvenio} className={`mt-4 ${btnPrim}`}>
                                    Criar primeiro convênio
                                </button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse text-sm">
                                    <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                                        <tr>
                                            <th className="whitespace-nowrap border-b px-4 py-3">ID</th>
                                            <th className="min-w-[280px] border-b px-4 py-3">Descrição</th>
                                            <th className="whitespace-nowrap border-b px-4 py-3">Status</th>
                                            <th className="whitespace-nowrap border-b px-4 py-3">Ordem</th>
                                            <th className="whitespace-nowrap border-b px-4 py-3">Atualizado</th>
                                            <th className="whitespace-nowrap border-b px-4 py-3 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => (
                                            <tr
                                                key={row.id}
                                                onClick={() => abrirConvenio(row)}
                                                className="cursor-pointer border-b last:border-b-0 hover:bg-slate-50"
                                            >
                                                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{row.id}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-slate-900">{row.nome}</div>
                                                    {row.observacao ? (
                                                        <div className="mt-1 max-w-xl truncate text-xs text-slate-500">{row.observacao}</div>
                                                    ) : null}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3">
                                                    <Etiqueta cor={row.ativo ? "verde" : "cinza"}>{row.ativo ? "Ativo" : "Inativo"}</Etiqueta>
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.ordem}</td>
                                                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                                                    {formatarData(row.atualizado_em)}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            abrirConvenio(row);
                                                        }}
                                                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                                    >
                                                        Ver pacotes
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}

                {/* ======================= 2. Pacotes do convênio ======================= */}
                {tela === "convenio" && atual && (
                    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                        <div className="border-b p-5">
                            <h2 className="text-lg font-bold">Pacotes cadastrados</h2>
                            <p className="mt-1 text-xs text-slate-500">
                                {pacotes.length} registro(s) · use as setas para ordenar: o registro do atendimento mostra os pacotes de Atendimento nesta ordem.
                            </p>
                            {classificacaoErro && (
                                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{classificacaoErro}</p>
                            )}
                        </div>
                        {carregandoPacotes ? (
                            <div className="p-8 text-center text-sm text-slate-500">Carregando pacotes...</div>
                        ) : pacotes.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="text-sm font-medium text-slate-700">Nenhum pacote cadastrado neste convênio.</div>
                                <button type="button" onClick={novoPacote} className={`mt-4 ${btnPrim}`}>
                                    Criar primeiro pacote
                                </button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse text-sm">
                                    <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                                        <tr>
                                            <th className="w-[84px] border-b px-2 py-3 text-center">Ordem</th>
                                            <th className="min-w-[320px] border-b px-4 py-3">Pacote</th>
                                            <th className="whitespace-nowrap border-b px-4 py-3 text-right">Valor</th>
                                            <th className="whitespace-nowrap border-b px-4 py-3">Status</th>
                                            <th className="whitespace-nowrap border-b px-4 py-3">Atualizado</th>
                                            <th className="whitespace-nowrap border-b px-4 py-3 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pacotes.map((p, i) => {
                                            const seta = "inline-flex size-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-30";
                                            return (
                                                <tr
                                                    key={p.id}
                                                    onClick={() => abrirPacote(p)}
                                                    className="cursor-pointer border-b last:border-b-0 hover:bg-slate-50"
                                                >
                                                    <td className="whitespace-nowrap px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                        <div className="inline-flex gap-1">
                                                            <button type="button" aria-label={`Subir ${p.nome}`} title="Subir" disabled={bloqueado || i === 0} onClick={() => void moverPacote(i, -1)} className={seta}>
                                                                ↑
                                                            </button>
                                                            <button type="button" aria-label={`Descer ${p.nome}`} title="Descer" disabled={bloqueado || i === pacotes.length - 1} onClick={() => void moverPacote(i, 1)} className={seta}>
                                                                ↓
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-semibold text-slate-900">{p.nome}</span>
                                                            <Etiqueta cor={p.tipo === "PRODUTO" ? "amarelo" : "cinza"}>{ROTULO_TIPO_PACOTE[p.tipo]}</Etiqueta>
                                                        </div>
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{moeda(p.valor)}</td>
                                                    <td className="whitespace-nowrap px-4 py-3">
                                                        <div className="flex gap-1.5">
                                                            <Etiqueta cor={p.ativo ? "verde" : "cinza"}>{p.ativo ? "Ativo" : "Inativo"}</Etiqueta>
                                                            {p.padrao && <Etiqueta cor="azul">Padrão</Etiqueta>}
                                                        </div>
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                                                        {formatarData(p.atualizado_em)}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                abrirPacote(p);
                                                            }}
                                                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                                        >
                                                            Ver / Editar
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}

                {/* ======================= 3. Dados do convênio ======================= */}
                {tela === "dados" && (
                    <div className="space-y-5">
                        <section className="rounded-2xl border bg-white p-5 shadow-sm">
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="text-sm">
                                    <span className="mb-1 block font-medium">Nome do convênio</span>
                                    <input
                                        value={form.nome}
                                        disabled={bloqueado}
                                        onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                                        maxLength={150}
                                        className={inputCls}
                                    />
                                </label>
                                <label className="text-sm">
                                    <span className="mb-1 block font-medium">Ordem</span>
                                    <input
                                        type="number"
                                        value={form.ordem}
                                        disabled={bloqueado}
                                        onChange={(e) => setForm((p) => ({ ...p, ordem: Number(e.target.value) || 0 }))}
                                        className={inputCls}
                                    />
                                </label>
                            </div>
                            <label className="mt-4 flex items-center gap-2 text-sm font-medium">
                                <input
                                    type="checkbox"
                                    checked={form.ativo}
                                    disabled={bloqueado}
                                    onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
                                />
                                Convênio ativo
                            </label>
                            <label className="mt-4 block text-sm">
                                <span className="mb-1 block font-medium">Observação administrativa</span>
                                <textarea
                                    value={form.observacao}
                                    disabled={bloqueado}
                                    maxLength={1000}
                                    rows={3}
                                    onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
                                    className={inputCls}
                                />
                            </label>
                            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button type="button" disabled={bloqueado} onClick={atual ? voltarConvenio : irParaLista} className={btnSec}>
                                    Cancelar
                                </button>
                                <button type="button" disabled={bloqueado} onClick={() => void salvarDados()} className={btnPrim}>
                                    {saving ? "Salvando..." : form.id ? "Salvar dados" : "Criar convênio"}
                                </button>
                            </div>
                        </section>

                        {/* Tipo na OS, código, aditivos e preços/valores do convênio */}
                        <SecaoOS convenio={{ id: form.id }} disabled={bloqueado} />
                    </div>
                )}

                {/* ======================= 4. Pacote ======================= */}
                {tela === "pacote" && atual && (
                    <div className="space-y-5">
                        <section className="rounded-2xl border bg-white p-5 shadow-sm">
                            <div className="grid gap-4 md:grid-cols-[1fr_200px]">
                                <label className="text-sm">
                                    <span className="mb-1 block font-medium">Nome do pacote</span>
                                    <input
                                        value={pacote.nome}
                                        disabled={bloqueado}
                                        maxLength={120}
                                        placeholder="ex.: Atendimento funerário padrão"
                                        onChange={(e) => setPacote((p) => ({ ...p, nome: e.target.value }))}
                                        className={inputCls}
                                    />
                                </label>
                                <label className="text-sm">
                                    <span className="mb-1 block font-medium">Vigente a partir de</span>
                                    <input
                                        type="date"
                                        value={pacote.vigente_desde}
                                        disabled={bloqueado}
                                        onChange={(e) => setPacote((p) => ({ ...p, vigente_desde: e.target.value }))}
                                        className={inputCls}
                                    />
                                </label>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-6">
                                <label className="flex items-center gap-2 text-sm font-medium">
                                    <input
                                        type="checkbox"
                                        checked={pacote.ativo}
                                        disabled={bloqueado}
                                        onChange={(e) =>
                                            setPacote((p) => ({ ...p, ativo: e.target.checked, padrao: e.target.checked ? p.padrao : false }))
                                        }
                                    />
                                    Pacote ativo
                                </label>
                                <label className="flex items-center gap-2 text-sm font-medium">
                                    <input
                                        type="checkbox"
                                        checked={pacote.padrao}
                                        disabled={bloqueado || !pacote.ativo || pacote.tipo === "PRODUTO"}
                                        onChange={(e) => setPacote((p) => ({ ...p, padrao: e.target.checked }))}
                                    />
                                    Pacote padrão do convênio
                                    <span className="text-xs font-normal text-slate-500">(usado na Ordem de Serviço)</span>
                                </label>
                            </div>
                            <label className="mt-4 block text-sm">
                                <span className="mb-1 block font-medium">Observação</span>
                                <input
                                    value={pacote.observacao}
                                    disabled={bloqueado}
                                    maxLength={255}
                                    onChange={(e) => setPacote((p) => ({ ...p, observacao: e.target.value }))}
                                    className={inputCls}
                                />
                            </label>
                            {ehPrefeitura && (
                                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                                    Prefeitura: selecione os itens do pacote primeiro. Os <b>valores de contrato</b> ficam reunidos em uma única
                                    seção no final desta tela. A tanatopraxia continua usando o preço cadastrado em “Dados do convênio”.
                                </p>
                            )}
                        </section>

                        {/* Itens do pacote — lista única e compacta */}
                        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                            <div className="grid grid-cols-[1fr_228px] items-center border-b bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                <span>Item / produto padrão incluído</span>
                                <span className="text-center">Inclui no pacote</span>
                            </div>

                            <div className="divide-y divide-slate-200">
                                {ITENS_ESTOQUE.map(([key, label, grupo]) => (
                                    <ItemPicker
                                        key={key}
                                        titulo={label}
                                        descricao="Escolha o produto padrão aceito para este item."
                                        grupo={grupo}
                                        value={regras[key]}
                                        onChange={(v) => patchRegra(key, v)}
                                        disabled={bloqueado}
                                    />
                                ))}

                                <ItemPicker
                                    titulo="Coroa de Flores"
                                    descricao="Escolha o tipo e o modelo padrão de coroa."
                                    grupo={grupoCoroa}
                                    value={coroa}
                                    disabled={bloqueado}
                                    avisoSemGrupo="Escolha o tipo (Natural ou Artificial) para listar os modelos."
                                    onChange={(v) => patchRegra("coroa_flores", { ...v, tipo: v.valor === "Sim" ? coroa.tipo : "" })}
                                    extra={
                                        <label className="text-sm text-slate-700">
                                            <span className="mb-1 block font-medium">Tipo</span>
                                            <select
                                                value={coroa.tipo}
                                                disabled={bloqueado}
                                                onChange={(e) =>
                                                    patchRegra("coroa_flores", comItens({ ...coroa, tipo: tipoFlor(e.target.value) }, []))
                                                }
                                                className={inputCls}
                                            >
                                                <option value="">Selecione...</option>
                                                <option value="Natural">Natural</option>
                                                <option value="Artificial">Artificial</option>
                                            </select>
                                        </label>
                                    }
                                />

                                {ITENS_SERVICO.map(([key, label]) =>
                                    key === "ornamentacao" ? (
                                        <ItemPicker
                                            key={key}
                                            titulo={label}
                                            descricao="Escolha o serviço padrão de ornamentação."
                                            grupo="servico"
                                            value={regras.ornamentacao}
                                            disabled={bloqueado}
                                            mostrarQuantidade={false}
                                            mostrarSaldo={false}
                                            onChange={(v) =>
                                                patchRegra("ornamentacao", {
                                                    ...v,
                                                    tipo: v.valor === "Sim" ? regras.ornamentacao.tipo : "",
                                                })
                                            }
                                            extra={
                                                <label className="text-sm text-slate-700">
                                                    <span className="mb-1 block font-medium">Tipo padrão de ornamentação</span>
                                                    <select
                                                        value={regras.ornamentacao.tipo}
                                                        disabled={bloqueado}
                                                        onChange={(e) =>
                                                            patchRegra("ornamentacao", {
                                                                ...regras.ornamentacao,
                                                                tipo: tipoFlor(e.target.value),
                                                            })
                                                        }
                                                        className={inputCls}
                                                    >
                                                        <option value="">Não definido</option>
                                                        <option value="Natural">Natural</option>
                                                        <option value="Artificial">Artificial</option>
                                                    </select>
                                                </label>
                                            }
                                        />
                                    ) : (
                                        <ItemPicker
                                            key={key}
                                            titulo={label}
                                            descricao={
                                                key === "tanato" && ehPrefeitura
                                                    ? "Serviço incluso. O preço da tanatopraxia é definido em Dados do convênio."
                                                    : key === "translado" && ehPrefeitura
                                                        ? "Serviço incluso. O preço do translado por km é definido em Dados do convênio."
                                                        : "Escolha o serviço padrão incluído no pacote."
                                            }
                                            grupo="servico"
                                            value={regras[key]}
                                            disabled={bloqueado}
                                            mostrarQuantidade={false}
                                            mostrarSaldo={false}
                                            onChange={(v) => patchRegra(key, v)}
                                        />
                                    ),
                                )}

                                {ITENS_SIM_NAO.map(([key, label]) => (
                                    <div
                                        key={key}
                                        className="grid gap-3 bg-white px-4 py-3 md:grid-cols-[1fr_228px] md:items-center"
                                    >
                                        <div>
                                            <div className="font-semibold text-slate-800">{label}</div>
                                            <div className="mt-0.5 text-xs text-slate-500">Regra simples do pacote, sem produto para selecionar.</div>
                                        </div>
                                        <SimNaoSelect
                                            value={regras[key].valor}
                                            disabled={bloqueado}
                                            onChange={(v) => patchRegra(key, { ...regras[key], valor: v })}
                                        />
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Valores de contrato agrupados no final, no padrão da referência */}
                        {ehPrefeitura && (
                            <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                                <div className="border-b p-5">
                                    <h2 className="text-lg font-bold">Valores do contrato</h2>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Os valores ficam reunidos aqui. O valor do pacote é a soma dos itens marcados como “Sim”.
                                    </p>
                                </div>

                                {CHAVES_COM_VALOR.some((key) => regras[key].valor === "Sim") ? (
                                    <>
                                        <div className="hidden grid-cols-[200px_1fr_190px] gap-3 border-b bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 md:grid">
                                            <span>Categoria</span>
                                            <span>Produto padrão incluído</span>
                                            <span className="text-right">Valor no contrato</span>
                                        </div>

                                        <div className="divide-y divide-slate-200">
                                            {CHAVES_COM_VALOR.filter((key) => regras[key].valor === "Sim").map((key) => {
                                                const regra = regras[key];

                                                return (
                                                    <div
                                                        key={key}
                                                        className="grid gap-3 px-4 py-3 md:grid-cols-[200px_1fr_190px] md:items-center"
                                                    >
                                                        <div className="font-semibold text-slate-800">{ROTULOS[key]}</div>
                                                        <div className="min-w-0 text-sm text-slate-600">
                                                            {regra.produtos.length === 0 ? (
                                                                <span className="text-amber-700">Produto não selecionado</span>
                                                            ) : (
                                                                <div className="space-y-1">
                                                                    {regra.produtos.map((produto) => (
                                                                        <div key={produto.produto_id} className="truncate" title={produto.nome || `Produto #${produto.produto_id}`}>
                                                                            {produto.nome || `Produto #${produto.produto_id}`}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <label>
                                                            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">
                                                                Valor no contrato
                                                            </span>
                                                            <div
                                                                className={[
                                                                    "flex items-center rounded-lg border bg-white",
                                                                    num(regra.valor_contrato) > 0
                                                                        ? "border-slate-300"
                                                                        : "border-amber-300 bg-amber-50",
                                                                ].join(" ")}
                                                            >
                                                                <span className="pl-3 text-sm font-semibold text-slate-500">R$</span>
                                                                <input
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    pattern="[0-9]*([,][0-9]{0,2})?"
                                                                    autoComplete="off"
                                                                    value={regra.valor_contrato}
                                                                    disabled={bloqueado}
                                                                    placeholder="0,00"
                                                                    onChange={(e) =>
                                                                        patchRegra(
                                                                            key,
                                                                            {
                                                                                ...regra,
                                                                                valor_contrato: valorMonetarioDigitado(e.target.value),
                                                                            } as RegrasTela[typeof key],
                                                                        )
                                                                    }
                                                                    onBlur={() => {
                                                                        const n = num(regra.valor_contrato);
                                                                        patchRegra(
                                                                            key,
                                                                            {
                                                                                ...regra,
                                                                                valor_contrato: n > 0 ? decBR(n) : "",
                                                                            } as RegrasTela[typeof key],
                                                                        );
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (
                                                                            e.key.length === 1 &&
                                                                            !/[0-9,.]/.test(e.key)
                                                                        ) {
                                                                            e.preventDefault();
                                                                        }
                                                                    }}
                                                                    className="min-w-0 flex-1 bg-transparent px-2 py-2 text-right font-semibold outline-none"
                                                                />
                                                            </div>
                                                        </label>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="flex flex-col gap-2 border-t bg-slate-50 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
                                            <p className="max-w-2xl text-xs text-slate-500">
                                                Troca de modelo: a diferença pode ser calculada a partir do produto escolhido e do valor previsto no contrato.
                                                Tanatopraxia e Translado continuam usando os preços cadastrados em “Dados do convênio”.
                                            </p>
                                            <div className="shrink-0 text-right">
                                                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                    Valor do pacote = soma dos itens
                                                </div>
                                                <div className="text-2xl font-bold text-slate-900">{moeda(total)}</div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="p-5 text-sm text-slate-500">
                                        Marque algum item como “Sim” para informar os valores de contrato.
                                    </div>
                                )}
                            </section>
                        )}

                        <div className="sticky bottom-0 flex flex-col gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-xs">
                                {!temItem ? (
                                    <span className="font-medium text-amber-700">Marque ao menos um item como “Sim”.</span>
                                ) : pendencias.length > 0 ? (
                                    <span className="font-medium text-amber-700">Falta: {pendencias.join(", ")}</span>
                                ) : (
                                    <span className="text-slate-500">Todos os itens marcados “Sim” estão completos.</span>
                                )}
                            </div>
                            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
                                <button type="button" disabled={bloqueado} onClick={voltarConvenio} className={btnSec}>
                                    Cancelar
                                </button>
                                <button type="button" disabled={bloqueado} onClick={() => void salvarPacote()} className={btnPrim}>
                                    {saving ? "Salvando..." : pacote.id ? "Salvar pacote" : "Criar pacote"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {excluir === "convenio" && form.id > 0 && (
                    <ModalExcluir
                        titulo="Excluir convênio"
                        aviso="Esta ação excluirá permanentemente o convênio e todos os seus pacotes:"
                        nome={form.nome}
                        ocupado={deleting}
                        onCancelar={() => setExcluir(null)}
                        onConfirmar={() => void excluirConvenio()}
                    />
                )}

                {novoTipo && atual && (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Novo pacote"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) setNovoTipo(null);
                        }}
                    >
                        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                            <h2 className="text-xl font-bold">Novo pacote · {atual.nome}</h2>
                            <div className="mt-4 text-sm font-medium">Tipo do pacote *</div>
                            <div className="mt-1 inline-flex overflow-hidden rounded-lg border border-slate-300">
                                {(["ATENDIMENTO", "PRODUTO"] as TipoPacote[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        aria-pressed={novoTipo.tipo === t}
                                        onClick={() => setNovoTipo((n) => (n ? { ...n, tipo: t } : n))}
                                        className={`px-4 py-2 text-sm font-semibold ${novoTipo.tipo === t ? "bg-slate-800 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
                                    >
                                        {ROTULO_TIPO_PACOTE[t]}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-xs text-slate-500">{AJUDA_TIPO_PACOTE[novoTipo.tipo]}</p>
                            <label className="mt-4 block text-sm">
                                <span className="mb-1 block font-medium">Nome do pacote *</span>
                                <input
                                    autoFocus
                                    value={novoTipo.nome}
                                    maxLength={150}
                                    onChange={(e) => setNovoTipo((n) => (n ? { ...n, nome: e.target.value } : n))}
                                    placeholder={novoTipo.tipo === "PRODUTO" ? "Ex.: Coroa Natural" : "Ex.: Adulto · padrão"}
                                    className={inputCls}
                                />
                            </label>
                            <p className="mt-3 text-xs text-slate-500">Os itens do pacote e o valor de contrato são escolhidos na tela seguinte, como hoje.</p>
                            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <button type="button" onClick={() => setNovoTipo(null)} className={btnSec}>
                                    Cancelar
                                </button>
                                <button type="button" disabled={!novoTipo.nome.trim()} onClick={continuarNovoPacote} className={btnPrim}>
                                    Continuar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {excluir === "pacote" && pacote.id > 0 && (
                    <ModalExcluir
                        titulo="Excluir pacote"
                        aviso="Esta ação excluirá permanentemente o pacote"
                        nome={pacote.nome}
                        ocupado={deleting}
                        onCancelar={() => setExcluir(null)}
                        onConfirmar={() => void excluirPacote()}
                    />
                )}
            </div>
        </main>
    );
}
