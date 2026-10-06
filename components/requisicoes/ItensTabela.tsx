"use client";

import React from "react";

/**
 * Itens de uma requisição em tabela alinhada: nome à esquerda, quantidade à direita.
 *
 * Só apresentação. A lista de requisições traz os itens em um texto único
 * (`itens_resumo`, ex.: "URNA 000 ESPIRITO SANTO x 5, ALCOOL x 2" ou "ALCOOL (2), AJAX (3)"). Este componente tenta separar
 * esse texto em linhas; se o formato for outro, mostra o texto original como
 * antes, sem perder informação.
 */

export type ItemLinha = { nome: string; qtd: string };

/** Quantidade: 2, 10, 2.5 ou 2,5. */
const QTD = "(\\d+(?:[.,]\\d+)?)";

/** Formato antigo: "ALCOOL (2)". */
const ITEM_PARENTESES = new RegExp("^(.*\\S)\\s*\\(\\s*" + QTD + "\\s*\\)$");

/**
 * Formato do servidor (requisicoes.php): "URNA 000 ESPIRITO SANTO x 5".
 * A quantidade é o número depois do último " x ", então nomes com "X" no meio
 * (ex.: "URNA 002 X PL CAS x 1") continuam inteiros.
 */
const ITEM_VEZES = new RegExp("^(.*\\S)\\s+[xX\\u00D7]\\s*" + QTD + "$");

function lerItem(texto: string): ItemLinha | null {
    const item = texto.trim();
    const m = ITEM_PARENTESES.exec(item) || ITEM_VEZES.exec(item);
    return m ? { nome: m[1].trim(), qtd: m[2] } : null;
}

/**
 * Separa o texto em itens: " | " (servidor), ";", quebra de linha ou ", " (formato antigo).
 * Na vírgula, junta os pedaços até formar um item completo, para não quebrar nomes
 * que tenham vírgula.
 */
export function parseItensResumo(resumo?: string | null): ItemLinha[] | null {
    const texto = (resumo ?? "").trim();
    if (!texto) return null;

    let partes: string[];
    let separador = "";
    if (texto.indexOf("|") >= 0) partes = texto.split("|");
    else if (texto.indexOf(";") >= 0) partes = texto.split(";");
    else if (texto.indexOf("\n") >= 0) partes = texto.split("\n");
    else {
        partes = texto.split(/,\s+/);
        separador = ", ";
    }

    const linhas: ItemLinha[] = [];
    let acumulado = "";

    for (const parte of partes) {
        if (!parte.trim() && !acumulado) continue;
        acumulado = acumulado ? acumulado + separador + parte : parte;
        const item = lerItem(acumulado);
        if (item) {
            linhas.push(item);
            acumulado = "";
        } else if (!separador) {
            return null;
        }
    }

    if (acumulado.trim()) return null;
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
