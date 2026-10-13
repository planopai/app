"use client";

/* Folha calculada (prévia): item, descrição e valor, como a OS mostra para a família. */

import React from "react";
import { brl, type Linha, type Previa } from "./tipos";
import { CARTAO, MUTED } from "./ui";

export default function ResumoOrcamento({ previa, linhas, total, calculando, erro, titulo = "Resumo do orçamento" }: {
    previa?: Previa | null;
    linhas?: Linha[];
    total?: number;
    calculando?: boolean;
    erro?: string;
    titulo?: string;
}) {
    const ls = linhas ?? previa?.linhas ?? [];
    const tot = total ?? previa?.total ?? 0;
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
                    {ls.map((l, i) => (
                        <li key={`${l.chave}-${i}`} className="flex items-start gap-3 px-4 py-2.5">
                            <span className="min-w-0 flex-1">
                                <span className={`block text-[11.5px] font-extrabold uppercase tracking-[0.05em] ${MUTED}`}>{l.rotulo}</span>
                                <span className="block text-sm font-bold leading-snug">{l.nome}</span>
                                {l.obs ? <span className={`block text-xs ${MUTED}`}>{l.obs}</span> : null}
                            </span>
                            <span className="shrink-0 text-sm font-extrabold tabular-nums">{l.valor === null && l.obs ? "—" : brl(l.valor)}</span>
                        </li>
                    ))}
                </ul>
            )}
            {previa?.avisos?.length ? (
                <div className="border-t border-[#E3E8F0] px-4 py-2.5 text-xs font-semibold text-[#5B6478] dark:border-white/[0.12] dark:text-[#AEB9CF]">
                    {previa.avisos.map((a) => (
                        <div key={a}>• {a}</div>
                    ))}
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
