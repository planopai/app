"use client";

/**
 * app/convenio/page.tsx — Convênios
 *
 * 02/10/2026:
 *  - Urna, Roupa, Véu, Cordão, Invol e Coroa: escolha do item SEM depósito (busca no cadastro, saldo total).
 *  - Demais regras: Kit Lanche, Assistência, Tanatopraxia e Ornamentação, ao marcar "Sim", listam os
 *    itens da classificação SERVIÇOS e exigem a escolha de um item. Velório e Sepultamento: só Sim/Não.
 *  - Para salvar, todo item marcado "Sim" precisa de item escolhido (validado também no convenio.php).
 *  - A busca usa convenio.php?action=product_search&grupo=... (EstoquePicker/CoroaEditor não são mais usados aqui).
 *  - (2ª etapa) Cada opção aceita VÁRIOS itens (ex.: 3 urnas aceitas no pacote). Depois de escolher, a lista fecha e
 *    ficam só os itens escolhidos; "Adicionar outro item" reabre a busca. Em "Dados e valores da OS" os itens da
 *    mesma opção ficam na mesma linha e o valor vale para qualquer um deles.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CONVENIO_API, apiJson } from "./components/api";
import type { Convenio, ProdutoRegra, RegrasConvenio, SimNao } from "./components/tipos";
import { convenioNovo, normalizeProduto, normalizeRegras, regraProduto } from "./components/tipos";
import SimNaoSelect from "./components/SimNaoSelect";
import SecaoOS from "./components/SecaoOS";

/* ====================================================================== */
/* Tipos da tela (serviços agora guardam o item escolhido)                 */
/* ====================================================================== */

type TipoFlor = "" | "Natural" | "Artificial";
type ItemEscolhido = { produto_id: number; nome: string; codigo_barras: string };
/** Regra com lista de itens; produto_id/nome/codigo_barras = o primeiro da lista (formato antigo). */
type RegraItens = ProdutoRegra & { produtos: ItemEscolhido[] };
type ItemComTipo = RegraItens & { tipo: TipoFlor };

type RegrasTela = Omit<
  RegrasConvenio,
  "urna" | "roupa" | "veu" | "cordao" | "invol" | "kit_lanche" | "assistencia" | "tanato" | "ornamentacao" | "coroa_flores"
> & {
  urna: RegraItens;
  roupa: RegraItens;
  veu: RegraItens;
  cordao: RegraItens;
  invol: RegraItens;
  kit_lanche: RegraItens;
  assistencia: RegraItens;
  tanato: RegraItens;
  ornamentacao: ItemComTipo;
  coroa_flores: ItemComTipo;
};

type ConvenioTela = Omit<Convenio, "regras"> & { regras: RegrasTela };

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
  return { ...regraProduto(), valor, produtos: [] };
}

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
    return comItens({ ...p, produtos: [] }, p.valor === "Sim" ? lista : []);
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
    ornamentacao: { ...limpo(raw?.ornamentacao), tipo: tipoFlor(raw?.ornamentacao?.tipo) },
  };
}

function convenioNovoTela(): ConvenioTela {
  return { ...convenioNovo(), regras: normalizarRegrasTela({}) };
}

type ChaveEstoque = "urna" | "roupa" | "veu" | "cordao" | "invol";
type ChaveServico = "kit_lanche" | "assistencia" | "tanato" | "ornamentacao";

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
  ["ornamentacao", "Ornamentação"],
];

const ITENS_SIM_NAO = [
  ["realiza_velorio", "Velório"],
  ["realiza_sepultamento", "Sepultamento"],
] as const;

/** Itens marcados "Sim" sem item escolhido (bloqueiam o salvar). */
function pendenciasRegras(r: RegrasTela): string[] {
  const out: string[] = [];
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
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProdutoBusca[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  /** Busca aberta a pedido ("Adicionar outro item"). Sem itens escolhidos, a busca fica sempre aberta. */
  const [adicionando, setAdicionando] = useState(false);

  const escolhidos = value.produtos;
  const buscaAberta = value.valor === "Sim" && grupo !== "" && (escolhidos.length === 0 || adicionando);

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
      onChange(regraVazia(v));
      setRows([]);
      return;
    }
    onChange({ ...value, valor: "Sim", deposito_nome: "", quantidade: Math.max(1, value.quantidade || 1) });
  };

  const selecionar = (row: ProdutoBusca) => {
    if (row.id <= 0 || escolhidos.some((x) => x.produto_id === row.id)) return;
    onChange(comItens(value, [...escolhidos, { produto_id: row.id, nome: row.nome, codigo_barras: row.codigo_barras }]));
    setQ("");
    setAdicionando(false); // escolheu: fecha a lista
  };

  const remover = (id: number) => onChange(comItens(value, escolhidos.filter((x) => x.produto_id !== id)));

  const faltaItem = value.valor === "Sim" && escolhidos.length === 0;

  return (
    <section
      className={["rounded-xl border bg-white p-4", faltaItem ? "border-amber-300" : "border-slate-200"].join(" ")}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_180px] md:items-center">
        <div>
          <h3 className="font-semibold text-slate-800">{titulo}</h3>
          <p className="text-xs text-slate-500">{descricao}</p>
        </div>
        <SimNaoSelect value={value.valor} onChange={setValor} disabled={disabled} />
      </div>

      {value.valor === "Sim" && (
        <div className="mt-4 space-y-3 border-t pt-4">
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
                {escolhidos.length === 1 ? "Item escolhido" : `${escolhidos.length} itens aceitos (qualquer um vale como padrão)`}
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
/* Página                                                                  */
/* ====================================================================== */

export default function ConveniosAdminPage() {
  const [rows, setRows] = useState<ConvenioTela[]>([]);
  const [form, setForm] = useState<ConvenioTela>(convenioNovoTela());
  const [tela, setTela] = useState<"lista" | "form">("lista");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const isEditing = form.id > 0;
  const bloqueado = saving || deleting;

  const normalizarConvenio = useCallback(
    (r: any): ConvenioTela => ({
      ...r,
      id: Number(r?.id ?? 0),
      ordem: Number(r?.ordem ?? 0),
      versao: Number(r?.versao ?? 0),
      ativo: !!r?.ativo,
      nome: String(r?.nome ?? ""),
      slug: String(r?.slug ?? ""),
      observacao: String(r?.observacao ?? ""),
      regras: normalizarRegrasTela(r?.regras),
      criado_em: String(r?.criado_em ?? ""),
      atualizado_em: String(r?.atualizado_em ?? ""),
    }),
    [],
  );

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");

    try {
      await apiJson(`${CONVENIO_API}?action=me&_=${Date.now()}`);

      const data = await apiJson(`${CONVENIO_API}?action=list&include_inactive=1&_=${Date.now()}`);

      const lista = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.dados)
          ? data.dados
          : Array.isArray(data?.rows)
            ? data.rows
            : [];

      setRows(lista.map(normalizarConvenio));
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar os convênios.");
    } finally {
      setLoading(false);
    }
  }, [normalizarConvenio]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const patchRegra = <K extends keyof RegrasTela>(key: K, value: RegrasTela[K]) => {
    setForm((prev) => ({
      ...prev,
      regras: {
        ...prev.regras,
        [key]: value,
      },
    }));
  };

  const pendencias = useMemo(() => pendenciasRegras(form.regras), [form.regras]);

  const abrirEdicao = (row: ConvenioTela) => {
    setErro("");
    setMsg("");
    setDeleteOpen(false);
    setDeleteConfirm("");
    setForm({
      ...row,
      regras: normalizarRegrasTela(row.regras),
    });
    setTela("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const novo = () => {
    setErro("");
    setMsg("");
    setDeleteOpen(false);
    setDeleteConfirm("");
    setForm(convenioNovoTela());
    setTela("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const voltarParaLista = () => {
    if (bloqueado) return;
    setErro("");
    setDeleteOpen(false);
    setDeleteConfirm("");
    setForm(convenioNovoTela());
    setTela("lista");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvar = async () => {
    if (bloqueado) return;

    const nome = form.nome.trim();

    if (!nome) {
      setErro("Informe o nome do convênio.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (pendencias.length > 0) {
      setErro(`Escolha o item de: ${pendencias.join(", ")}.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving(true);
    setErro("");
    setMsg("");

    try {
      await apiJson(CONVENIO_API, {
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

      await carregar();
      setForm(convenioNovoTela());
      setTela("lista");
      setMsg(isEditing ? "Convênio atualizado com sucesso." : "Convênio criado com sucesso.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErro(e?.message || "Não foi possível salvar o convênio.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (e?.code === "VERSION_CONFLICT") {
        await carregar();
      }
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    if (!isEditing || bloqueado) return;
    if (deleteConfirm !== "EXCLUIR") return;

    setDeleting(true);
    setErro("");
    setMsg("");

    try {
      await apiJson(CONVENIO_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id: form.id,
          versao: form.versao,
          confirmacao: deleteConfirm,
        }),
      });

      setDeleteOpen(false);
      setDeleteConfirm("");
      setForm(convenioNovoTela());
      setTela("lista");
      await carregar();
      setMsg("Convênio excluído com sucesso.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErro(e?.message || "Não foi possível excluir o convênio.");
      if (e?.code === "VERSION_CONFLICT") {
        await carregar();
      }
    } finally {
      setDeleting(false);
    }
  };

  const formatarData = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "—";

    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) return raw;

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  const coroa = form.regras.coroa_flores;
  const grupoCoroa: Grupo | "" =
    coroa.tipo === "Natural" ? "coroa_natural" : coroa.tipo === "Artificial" ? "coroa_artificial" : "";

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

          {tela === "lista" ? (
            <button
              type="button"
              onClick={novo}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Novo convênio
            </button>
          ) : (
            <button
              type="button"
              onClick={voltarParaLista}
              disabled={bloqueado}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Voltar para lista
            </button>
          )}
        </header>

        {erro && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{erro}</div>
        )}

        {msg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{msg}</div>
        )}

        {tela === "lista" ? (
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">Convênios cadastrados</h2>
                <p className="mt-1 text-xs text-slate-500">{rows.length} registro(s)</p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Carregando convênios...</div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-sm font-medium text-slate-700">Nenhum convênio cadastrado.</div>
                <button
                  type="button"
                  onClick={novo}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
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
                    {rows.map((row) => {
                      const pend = pendenciasRegras(row.regras);

                      return (
                        <tr key={row.id} className="border-b last:border-b-0 hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{row.id}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{row.nome}</div>
                            {row.observacao ? (
                              <div className="mt-1 max-w-xl truncate text-xs text-slate-500">{row.observacao}</div>
                            ) : null}
                            {pend.length > 0 && (
                              <div className="mt-1 text-xs font-medium text-amber-700">
                                Falta escolher item: {pend.join(", ")}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={[
                                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                row.ativo ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600",
                              ].join(" ")}
                            >
                              {row.ativo ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.ordem}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                            {formatarData(row.atualizado_em)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => abrirEdicao(row)}
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
        ) : (
          <div className="space-y-5">
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">{isEditing ? `Convênio #${form.id}` : "Novo convênio"}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {isEditing
                      ? "Visualize e altere as regras deste convênio."
                      : "Preencha os dados para criar um novo convênio."}
                  </p>
                </div>

                {isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirm("");
                      setDeleteOpen(true);
                    }}
                    disabled={bloqueado}
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    Excluir convênio
                  </button>
                )}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Nome do convênio</span>
                  <input
                    value={form.nome}
                    disabled={bloqueado}
                    onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                    maxLength={150}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block font-medium">Ordem</span>
                  <input
                    type="number"
                    value={form.ordem}
                    disabled={bloqueado}
                    onChange={(e) => setForm((p) => ({ ...p, ordem: Number(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <input
                  id="convenio-ativo"
                  type="checkbox"
                  checked={form.ativo}
                  disabled={bloqueado}
                  onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
                />
                <label htmlFor="convenio-ativo" className="text-sm font-medium">
                  Convênio ativo
                </label>
              </div>

              <label className="mt-4 block text-sm">
                <span className="mb-1 block font-medium">Observação administrativa</span>
                <textarea
                  value={form.observacao}
                  disabled={bloqueado}
                  maxLength={1000}
                  rows={3}
                  onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </section>

            {/* Itens do estoque: escolhe só o item (sem depósito) */}
            <div className="grid gap-4 lg:grid-cols-2">
              {ITENS_ESTOQUE.map(([key, label, grupo]) => (
                <ItemPicker
                  key={key}
                  titulo={label}
                  descricao="Define se o convênio oferece este item. Se “Sim”, escolha o item."
                  grupo={grupo}
                  value={form.regras[key]}
                  onChange={(v) => patchRegra(key, v)}
                  disabled={bloqueado}
                />
              ))}
            </div>

            <ItemPicker
              titulo="Coroa de Flores"
              descricao="Se “Sim”, escolha o tipo e o modelo padrão."
              grupo={grupoCoroa}
              value={coroa}
              disabled={bloqueado}
              avisoSemGrupo="Escolha o tipo (Natural ou Artificial) para listar os modelos."
              onChange={(v) =>
                patchRegra("coroa_flores", {
                  ...v,
                  tipo: v.valor === "Sim" ? coroa.tipo : "",
                })
              }
              extra={
                <label className="text-sm text-slate-700">
                  <span className="mb-1 block font-medium">Tipo</span>
                  <select
                    value={coroa.tipo}
                    disabled={bloqueado}
                    onChange={(e) =>
                      patchRegra("coroa_flores", comItens({ ...coroa, tipo: tipoFlor(e.target.value) }, []))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">Selecione...</option>
                    <option value="Natural">Natural</option>
                    <option value="Artificial">Artificial</option>
                  </select>
                </label>
              }
            />

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">Demais regras</h2>
              <p className="mb-4 mt-1 text-xs text-slate-500">
                “Não definido” preserva decisão manual no atendimento futuro. Ao marcar “Sim”, escolha o item da
                classificação SERVIÇOS (exceto Velório e Sepultamento).
              </p>

              <div className="grid gap-4 lg:grid-cols-2">
                {ITENS_SERVICO.map(([key, label]) =>
                  key === "ornamentacao" ? (
                    <ItemPicker
                      key={key}
                      titulo={label}
                      descricao="Serviço de ornamentação incluso no convênio."
                      grupo="servico"
                      value={form.regras.ornamentacao}
                      disabled={bloqueado}
                      mostrarQuantidade={false}
                      mostrarSaldo={false}
                      onChange={(v) =>
                        patchRegra("ornamentacao", {
                          ...v,
                          tipo: v.valor === "Sim" ? form.regras.ornamentacao.tipo : "",
                        })
                      }
                      extra={
                        <label className="text-sm text-slate-700">
                          <span className="mb-1 block font-medium">Tipo padrão de ornamentação</span>
                          <select
                            value={form.regras.ornamentacao.tipo}
                            disabled={bloqueado}
                            onChange={(e) =>
                              patchRegra("ornamentacao", {
                                ...form.regras.ornamentacao,
                                tipo: tipoFlor(e.target.value),
                              })
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2"
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
                      descricao="Serviço incluso no convênio."
                      grupo="servico"
                      value={form.regras[key]}
                      disabled={bloqueado}
                      mostrarQuantidade={false}
                      mostrarSaldo={false}
                      onChange={(v) => patchRegra(key, v)}
                    />
                  ),
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {ITENS_SIM_NAO.map(([key, label]) => (
                  <div key={key} className="grid grid-cols-[1fr_160px] items-center gap-3 rounded-xl border p-3">
                    <span className="text-sm font-medium">{label}</span>
                    <SimNaoSelect
                      value={form.regras[key].valor}
                      disabled={bloqueado}
                      onChange={(v) => patchRegra(key, { ...form.regras[key], valor: v })}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Dados e valores da OS (módulo de Ordem de Serviço) — itens inclusos = regras acima */}
            <SecaoOS convenio={form} disabled={bloqueado} />

            <div className="sticky bottom-0 flex flex-col gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs">
                {pendencias.length > 0 ? (
                  <span className="font-medium text-amber-700">Falta escolher item: {pendencias.join(", ")}</span>
                ) : (
                  <span className="text-slate-500">Todos os itens marcados “Sim” estão com item escolhido.</span>
                )}
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={bloqueado}
                  onClick={voltarParaLista}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={bloqueado}
                  onClick={() => void salvar()}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar convênio"}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteOpen && isEditing && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-convenio-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !deleting) {
                setDeleteOpen(false);
                setDeleteConfirm("");
              }
            }}
          >
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="delete-convenio-title" className="text-xl font-bold text-red-700">
                    Excluir convênio
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Esta ação excluirá permanentemente o convênio <b>{form.nome}</b>. Para confirmar, digite exatamente:
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center font-mono text-base font-bold tracking-widest text-red-700">
                EXCLUIR
              </div>

              <label className="mt-4 block text-sm font-medium text-slate-700">
                Confirmação
                <input
                  autoFocus
                  value={deleteConfirm}
                  disabled={deleting}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="Digite EXCLUIR"
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </label>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirm("");
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={deleting || deleteConfirm !== "EXCLUIR"}
                  onClick={() => void excluir()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? "Excluindo..." : "Confirmar exclusão"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
