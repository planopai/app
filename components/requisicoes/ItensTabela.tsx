"use client";

import React from "react";

/**
 * Itens de uma requisição em tabela alinhada: nome à esquerda, quantidade à direita.
 *
 * Só apresentação. A lista de requisições traz os itens em um texto único
 * (`itens_resumo`, ex.: "ALCOOL (2), AJAX (3)"). Este componente tenta separar
 * esse texto em linhas; se o formato for outro, mostra o texto original como
 * antes, sem perder informação.
 */

export type ItemLinha = { nome: string; qtd: string };

const LINHA = /\s*([^()]+?)\s*\(\s*([\d.,]+)\s*\)\s*(?:[,;|]\s*|$)/y;

export function parseItensResumo(resumo?: string | null): ItemLinha[] | null {
    const texto = (resumo ?? "").trim();
    if (!texto) return null;

    const linhas: ItemLinha[] = [];
    LINHA.lastIndex = 0;

    while (LINHA.lastIndex < texto.length) {
        const m = LINHA.exec(texto);
        if (!m) return null;
        linhas.push({ nome: m[1].trim(), qtd: m[2] });
    }

    return linhas.length ? linhas : null;
}

export default function ItensTabela({
    itens,
    resumo,
    vazio = "Itens não informados",
    cabecalho = "Produto",
    className = "",
}: {
    /** Itens já estruturados (detalhe da requisição). Têm prioridade sobre `resumo`. */
    itens?: ItemLinha[] | null;
    /** Texto `itens_resumo` da lista. */
    resumo?: string | null;
    vazio?: string;
    /** Título da primeira coluna (padrão: Produto). */
    cabecalho?: string;
    className?: string;
}) {
    const linhas = itens && itens.length ? itens : itens ? null : parseItensResumo(resumo);

    if (!linhas) {
        const texto = (resumo ?? "").trim();
        return (
            <p className={["text-sm font-bold text-[#313C55] dark:text-white", className].join(" ")}>
                {texto || vazio}
            </p>
        );
    }

    return (
        <div
            className={[
                "overflow-hidden rounded-xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]",
                className,
            ].join(" ")}
        >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 bg-[#F6F8FB] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                <span>{cabecalho}</span>
                <span className="text-right">Qtd</span>
            </div>

            {linhas.map((l, i) => (
                <div
                    key={`${l.nome}-${i}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-t border-[#E3E8F0] px-3 py-2 text-sm dark:border-white/[0.12]"
                >
                    <span className="break-words font-bold text-[#313C55] dark:text-white">{l.nome}</span>
                    <span className="min-w-8 text-right font-extrabold tabular-nums text-[#313C55] dark:text-white">
                        {l.qtd}
                    </span>
                </div>
            ))}
        </div>
    );
}
