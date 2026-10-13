"use client";

/*
 * Folha calculada: item, descrição e valor, como a OS mostra para a família.
 * Com desconto: Valor (já com acréscimo) · Desconto · Final em cada item, e Subtotal / Descontos nos itens / Desconto geral / Total.
 * Editável (14/10/2026): ícone de ajuste em cada item e no desconto geral, com as regras da OS (AjusteValor.tsx).
 */

import React from "react";
import { brl, resumoDasLinhas, type DescontoGeral, type Linha, type Previa } from "./tipos";
import { CARTAO, MUTED } from "./ui";

const pctTxt = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

export function IconeAjuste() {
    return (
        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M19 5 5 19" />
            <circle cx="6.5" cy="6.5" r="2.5" />
            <circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
    );
}

const BTN_AJ =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-[#C9D1DE] text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/25 dark:text-white dark:hover:bg-white/10";

export default function ResumoOrcamento({ previa, linhas, total, descontoGeral, calculando, erro, titulo = "Resumo do orçamento", editavel, onAjustarItem, onAjustarGeral }: {
    previa?: Previa | null;
    linhas?: Linha[];
    total?: number;
    /** Orçamento salvo: tipo do desconto geral (para mostrar o %). */
    descontoGeral?: DescontoGeral | null;
    calculando?: boolean;
    erro?: string;
    titulo?: string;
    editavel?: boolean;
    onAjustarItem?: (l: Linha) => void;
    onAjustarGeral?: () => void;
}) {
    const ls = linhas ?? previa?.linhas ?? [];
    const tot = total ?? previa?.total ?? 0;
    const r = previa?.resumo ?? resumoDasLinhas(ls, tot, descontoGeral);
    const temDesconto = r.desconto_itens > 0.004 || r.desconto_global > 0.004;
    const res = previa?.resumo;
    const limTxt = !editavel || !res
        ? ""
        : previa?.pode_passar_limite
          ? "Gestão / Financeiro: pode passar de 8%."
          : `Descontos juntos até ${pctTxt(res.limite_percentual)}% (${brl(res.limite_valor)}; ${brl(res.reducao_no_limite)} usados).`;

    return (
        <section className={`${CARTAO} overflow-hidden`}>
            <div className="flex items-center justify-between gap-2 border-b border-[#E3E8F0] px-4 py-3 dark:border-white/[0.12]">
                <h3 className="text-[17px] font-black">{titulo}</h3>
                {calculando ? <span className={`text-xs font-bold ${MUTED}`}>calculando…</span> : null}
            </div>
            {erro ? <p className="px-4 py-3 text-sm font-semibold text-[#B42318] dark:text-[#FF9C92]">{erro}</p> : null}
            {!ls.length ? (
                <p className={`px-4 py-6 text-center text-sm ${MUTED}`}>Escolha os itens: os valores aparecem aqui.</p>
            ) : (
                <ul className="divide-y divide-[#E3E8F0] dark:divide-white/[0.10]">
                    {ls.map((l, i) => {
                        const d = Number(l.desconto) || 0;
                        const final = l.final ?? l.valor;
                        const acrescimo = l.valor_tabela != null && l.valor != null && l.valor > l.valor_tabela + 0.004;
                        return (
                            <li key={`${l.id || l.chave}-${i}`} className="flex items-start gap-2 px-4 py-2.5">
                                <span className="min-w-0 flex-1">
                                    <span className={`block text-[11.5px] font-extrabold uppercase tracking-[0.05em] ${MUTED}`}>{l.rotulo}</span>
                                    <span className="block break-words text-sm font-bold leading-snug">{l.nome}</span>
                                    {l.unidade === "km" && l.km && l.valor != null ? (
                                        <span className={`block text-xs ${MUTED}`}>
                                            {String(l.km).replace(".", ",")} km × {brl(l.valor / l.km)}
                                        </span>
                                    ) : null}
                                    {l.obs ? <span className={`block text-xs ${MUTED}`}>{l.obs}</span> : null}
                                    {d > 0.004 ? (
                                        <span className={`block text-xs ${MUTED}`}>
                                            Valor {brl(l.valor)} · desconto − {brl(d)}
                                        </span>
                                    ) : editavel && acrescimo ? (
                                        <span className={`block text-xs ${MUTED}`}>Valor ajustado</span>
                                    ) : null}
                                </span>
                                <span className="shrink-0 pt-3 text-sm font-extrabold tabular-nums">{l.valor === null && l.obs ? "—" : brl(final)}</span>
                                {editavel && l.ajustavel && onAjustarItem ? (
                                    <button type="button" className={BTN_AJ} onClick={() => onAjustarItem(l)} aria-label={`Valor e desconto: ${l.nome}`} title="Valor / desconto">
                                        <IconeAjuste />
                                    </button>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
            {previa?.avisos?.length ? (
                <div className="border-t border-[#E3E8F0] px-4 py-2.5 text-xs font-semibold text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]">
                    {previa.avisos.map((a) => (
                        <div key={a}>• {a}</div>
                    ))}
                </div>
            ) : null}
            {ls.length && (temDesconto || editavel) ? (
                <div className="border-t border-[#E3E8F0] px-4 py-2.5 text-sm dark:border-white/[0.12]">
                    <div className="flex justify-between gap-2">
                        <span>Subtotal</span>
                        <b className="tabular-nums">{brl(r.bruto)}</b>
                    </div>
                    {r.desconto_itens > 0.004 ? (
                        <div className="flex justify-between gap-2">
                            <span>Descontos nos itens</span>
                            <b className="tabular-nums">− {brl(r.desconto_itens)}</b>
                        </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                            Desconto geral
                            {r.desconto_global > 0.004 && r.desconto_global_tipo === "PERCENTUAL" ? (
                                <span className={`text-xs ${MUTED}`}>
                                    {" "}
                                    ({pctTxt(r.desconto_global_percentual)}% sobre {brl(r.subtotal)})
                                </span>
                            ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                            <b className="tabular-nums">{r.desconto_global > 0.004 ? `− ${brl(r.desconto_global)}` : brl(0)}</b>
                            {editavel && onAjustarGeral ? (
                                <button type="button" className={BTN_AJ} onClick={onAjustarGeral} aria-label="Desconto geral" title="Desconto geral">
                                    <IconeAjuste />
                                </button>
                            ) : null}
                        </span>
                    </div>
                    {limTxt ? <p className={`mt-1 text-xs ${MUTED}`}>{limTxt}</p> : null}
                </div>
            ) : null}
            <div className="flex items-center justify-between bg-[#313C55] px-4 py-3 text-white dark:bg-[#1C2334]">
                <span className="text-sm font-extrabold">Total</span>
                <span className="text-xl font-black tabular-nums">{brl(tot)}</span>
            </div>
            {previa && previa.valores_pendentes > 0 ? (
                <p className="px-4 py-2 text-xs font-semibold text-[#B42318] dark:text-[#FF9C92]">
                    {previa.valores_pendentes} item(ns) sem preço de tabela: confira no estoque.
                </p>
            ) : null}
        </section>
    );
}
