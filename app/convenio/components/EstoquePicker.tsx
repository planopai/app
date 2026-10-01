"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, CONVENIO_API, ESTOQUE_API, LOGIN_URL, apiJson } from "./api";
import * as T from "./tipos";
import type { SimNao, ProdutoRegra, BooleanRegra, CoroaRegra, RegrasConvenio, Convenio, EstoqueRow } from "./tipos";
import { getProdutoId, regraProduto, DEP_URNA, DEP_ROUPA, DEP_INVOL, DEP_VEU, DEP_CORDAO, DEP_COROA } from "./tipos";
import SimNaoSelect from "./SimNaoSelect";

export default function EstoquePicker({
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
