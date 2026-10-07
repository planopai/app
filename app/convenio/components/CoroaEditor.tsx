"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, CONVENIO_API, ESTOQUE_API, LOGIN_URL, apiJson } from "./api";
import * as T from "./tipos";
import type { SimNao, ProdutoRegra, BooleanRegra, CoroaRegra, RegrasConvenio, Convenio, EstoqueRow } from "./tipos";
import { getProdutoId, regraProduto, DEP_URNA, DEP_ROUPA, DEP_INVOL, DEP_VEU, DEP_CORDAO, DEP_COROA } from "./tipos";
import SimNaoSelect from "./SimNaoSelect";

export default function CoroaEditor({
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
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/12 dark:bg-[#232B3F]">
            <div className="grid gap-3 md:grid-cols-[1fr_180px] md:items-center">
                <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white">Coroa de Flores</h3>
                    <p className="text-xs text-slate-500 dark:text-[#AEB9CF]">
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
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-white/25"
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
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-white/25"
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
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-white/25"
                            />

                            <div className="max-h-52 overflow-y-auto rounded-lg border">
                                {loading && (
                                    <div className="p-3 text-sm text-slate-500 dark:text-[#AEB9CF]">
                                        Consultando coroas...
                                    </div>
                                )}

                                {!loading && erro && (
                                    <div className="p-3 text-sm text-red-700 dark:text-[#FF9C92]">{erro}</div>
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
                                                        ? "bg-blue-50 text-blue-900 dark:bg-[#3D6A99]/20 dark:text-[#A9BED6]"
                                                        : "hover:bg-slate-50 dark:hover:bg-[#1C2334]",
                                                ].join(" ")}
                                            >
                                                <b>{row.nome}</b>
                                                <span className="ml-2 text-xs text-slate-500 dark:text-[#AEB9CF]">
                                                    #{pid}
                                                </span>
                                            </button>
                                        );
                                    })}
                            </div>
                        </>
                    )}

                    {value.produto_id > 0 && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#B3CE52]">
                            Modelo padrão: <b>{value.nome}</b> · produto #{value.produto_id}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

