"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CONVENIO_API, ESTOQUE_API, LOGIN_URL, apiJson } from "./components/api";
import type { RegrasConvenio, Convenio } from "./components/tipos";
import { convenioNovo, normalizeRegras, DEP_URNA, DEP_ROUPA, DEP_INVOL, DEP_VEU, DEP_CORDAO, DEP_COROA } from "./components/tipos";
import SimNaoSelect from "./components/SimNaoSelect";
import EstoquePicker from "./components/EstoquePicker";
import CoroaEditor from "./components/CoroaEditor";
import SecaoOS from "./components/SecaoOS";

export default function ConveniosAdminPage() {
  const [rows, setRows] = useState<Convenio[]>([]);
  const [form, setForm] = useState<Convenio>(convenioNovo());
  const [tela, setTela] = useState<"lista" | "form">("lista");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const isEditing = form.id > 0;

  const normalizarConvenio = useCallback(
    (r: any): Convenio => ({
      ...r,
      id: Number(r?.id ?? 0),
      ordem: Number(r?.ordem ?? 0),
      versao: Number(r?.versao ?? 0),
      ativo: !!r?.ativo,
      nome: String(r?.nome ?? ""),
      slug: String(r?.slug ?? ""),
      observacao: String(r?.observacao ?? ""),
      regras: normalizeRegras(r?.regras),
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

      const data = await apiJson(
        `${CONVENIO_API}?action=list&include_inactive=1&_=${Date.now()}`,
      );

      setRows(
        (Array.isArray(data?.rows) ? data.rows : []).map(normalizarConvenio),
      );
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar os convênios.");
    } finally {
      setLoading(false);
    }
  }, [normalizarConvenio]);

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

  const abrirEdicao = (row: Convenio) => {
    setErro("");
    setMsg("");
    setDeleteOpen(false);
    setDeleteConfirm("");
    setForm({
      ...row,
      regras: normalizeRegras(row.regras),
    });
    setTela("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const novo = () => {
    setErro("");
    setMsg("");
    setDeleteOpen(false);
    setDeleteConfirm("");
    setForm(convenioNovo());
    setTela("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const voltarParaLista = () => {
    if (saving || deleting) return;
    setErro("");
    setDeleteOpen(false);
    setDeleteConfirm("");
    setForm(convenioNovo());
    setTela("lista");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const salvar = async () => {
    if (saving || deleting) return;

    const nome = form.nome.trim();

    if (!nome) {
      setErro("Informe o nome do convênio.");
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
      setForm(convenioNovo());
      setTela("lista");
      setMsg(isEditing ? "Convênio atualizado com sucesso." : "Convênio criado com sucesso.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErro(e?.message || "Não foi possível salvar o convênio.");
      if (e?.code === "VERSION_CONFLICT") {
        await carregar();
      }
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    if (!isEditing || deleting || saving) return;
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
      setForm(convenioNovo());
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
              disabled={saving || deleting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Voltar para lista
            </button>
          )}
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

        {tela === "lista" ? (
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">Convênios cadastrados</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {rows.length} registro(s)
                </p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Carregando convênios...
              </div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-sm font-medium text-slate-700">
                  Nenhum convênio cadastrado.
                </div>
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
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                          {row.id}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">
                            {row.nome}
                          </div>
                          {row.observacao ? (
                            <div className="mt-1 max-w-xl truncate text-xs text-slate-500">
                              {row.observacao}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={[
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                              row.ativo
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600",
                            ].join(" ")}
                          >
                            {row.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {row.ordem}
                        </td>
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
                    ))}
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
                  <h2 className="text-lg font-bold">
                    {isEditing ? `Convênio #${form.id}` : "Novo convênio"}
                  </h2>
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
                    disabled={saving || deleting}
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    Excluir convênio
                  </button>
                )}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium">
                    Nome do convênio
                  </span>
                  <input
                    value={form.nome}
                    disabled={saving || deleting}
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
                    disabled={saving || deleting}
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
                  disabled={saving || deleting}
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
                <span className="mb-1 block font-medium">
                  Observação administrativa
                </span>
                <textarea
                  value={form.observacao}
                  disabled={saving || deleting}
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
                disabled={saving || deleting}
              />
              <EstoquePicker
                label="Roupa"
                action="roupas_buscar"
                value={form.regras.roupa}
                depositos={DEP_ROUPA}
                onChange={(v) => patchRegra("roupa", v)}
                disabled={saving || deleting}
              />
              <EstoquePicker
                label="Véu"
                action="veus_buscar"
                value={form.regras.veu}
                depositos={DEP_VEU}
                onChange={(v) => patchRegra("veu", v)}
                disabled={saving || deleting}
              />
              <EstoquePicker
                label="Cordão São Francisco"
                action="cordoes_buscar"
                value={form.regras.cordao}
                depositos={DEP_CORDAO}
                onChange={(v) => patchRegra("cordao", v)}
                disabled={saving || deleting}
              />
              <EstoquePicker
                label="Invol"
                action="invols_buscar"
                value={form.regras.invol}
                depositos={DEP_INVOL}
                onChange={(v) => patchRegra("invol", v)}
                disabled={saving || deleting}
              />
            </div>

            <CoroaEditor
              value={form.regras.coroa_flores}
              onChange={(v) => patchRegra("coroa_flores", v)}
              disabled={saving || deleting}
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
                        disabled={saving || deleting}
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
                    disabled={saving || deleting}
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

            {/* Dados e valores da OS (módulo de Ordem de Serviço) — itens inclusos = regras acima */}
            <SecaoOS convenio={form} disabled={saving || deleting} />

            <div className="sticky bottom-0 flex flex-col-reverse gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving || deleting}
                onClick={voltarParaLista}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={saving || deleting}
                onClick={() => void salvar()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving
                  ? "Salvando..."
                  : isEditing
                    ? "Salvar alterações"
                    : "Criar convênio"}
              </button>
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
                  <h2
                    id="delete-convenio-title"
                    className="text-xl font-bold text-red-700"
                  >
                    Excluir convênio
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Esta ação excluirá permanentemente o convênio{" "}
                    <b>{form.nome}</b>. Para confirmar, digite exatamente:
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
