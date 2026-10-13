"use client";

/* Lista dos orçamentos: chips de situação, busca e linhas que cabem na tela (computador em grade, celular em cartões). */

import React from "react";
import { brl, dataBR, type ResumoLista } from "./tipos";
import { CARTAO, EtiquetaSituacao, Ic, Icone, MUTED } from "./ui";

export const FILTROS = [
    { v: "ABERTO", r: "Em aberto" },
    { v: "VENCIDO", r: "Vencidos" },
    { v: "CONVERTIDO", r: "Viraram atendimento" },
    { v: "CANCELADO", r: "Cancelados" },
    { v: "", r: "Todos" },
];

export default function ListaOrcamentos({ linhas, carregando, filtro, onFiltro, busca, onBusca, onAbrir, onAtualizar }: {
    linhas: ResumoLista[];
    carregando: boolean;
    filtro: string;
    onFiltro: (v: string) => void;
    busca: string;
    onBusca: (v: string) => void;
    onAbrir: (o: ResumoLista) => void;
    onAtualizar: () => void;
}) {
    return (
        <div>
            <div className="border-y border-[#E3E8F0] bg-white px-4 py-3 dark:border-white/[0.12] dark:bg-[#232B3F] lg:mb-4 lg:rounded-2xl lg:border lg:px-5 lg:py-4">
                <div className="flex gap-2">
                    <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[#F1F4F8] px-3.5 dark:bg-[#1C2334]">
                        <Icone d={Ic.busca} tam={18} />
                        <input
                            value={busca}
                            onChange={(e) => onBusca(e.target.value)}
                            placeholder="Falecido, contato, telefone ou número"
                            className="h-full w-full min-w-0 bg-transparent text-[16px] font-semibold outline-none"
                        />
                    </label>
                    <button type="button" aria-label="Atualizar" onClick={onAtualizar} className="flex size-12 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-[#C9D1DE] dark:border-white/25">
                        <Icone d={Ic.atualizar} />
                    </button>
                </div>
                <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="Situação">
                    {FILTROS.map((f) => {
                        const on = f.v === filtro;
                        return (
                            <button
                                key={f.v || "todos"}
                                type="button"
                                aria-pressed={on}
                                onClick={() => onFiltro(f.v)}
                                className={`h-11 shrink-0 whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-sm font-bold ${
                                    on
                                        ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]"
                                        : "border-[#C9D1DE] bg-white text-[#313C55] dark:border-white/[0.26] dark:bg-[#232B3F] dark:text-white"
                                }`}
                            >
                                {f.r}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className={`mt-3 overflow-hidden lg:mt-0 ${CARTAO} mx-4 lg:mx-0`}>
                <div className={`hidden grid-cols-[130px_minmax(0,1.4fr)_minmax(0,1fr)_120px_130px_120px] gap-3 border-b border-[#E3E8F0] px-5 py-2.5 text-[11.5px] font-extrabold uppercase tracking-[0.06em] dark:border-white/[0.12] lg:grid ${MUTED}`}>
                    <span>Número</span>
                    <span>Falecido</span>
                    <span>Contato</span>
                    <span>Válido até</span>
                    <span>Situação</span>
                    <span className="text-right">Total</span>
                </div>
                {carregando && !linhas.length ? <p className={`p-6 text-center text-sm ${MUTED}`}>Carregando…</p> : null}
                {!carregando && !linhas.length ? <p className={`p-6 text-center text-sm ${MUTED}`}>Nenhum orçamento aqui.</p> : null}
                {linhas.map((o) => (
                    <button
                        key={o.id}
                        type="button"
                        onClick={() => onAbrir(o)}
                        className="block w-full border-b border-[#E3E8F0] px-4 py-3 text-left last:border-b-0 hover:bg-[#F6F8FB] dark:border-white/[0.10] dark:hover:bg-white/[0.04] lg:grid lg:grid-cols-[130px_minmax(0,1.4fr)_minmax(0,1fr)_120px_130px_120px] lg:items-center lg:gap-3 lg:px-5"
                    >
                        {/* celular */}
                        <span className="flex items-center justify-between gap-2 lg:hidden">
                            <span className="flex min-w-0 items-center gap-2">
                                <b className="whitespace-nowrap text-[15px]">{o.numero}</b>
                                <EtiquetaSituacao s={o.situacao} />
                            </span>
                            <b className="whitespace-nowrap text-[15px] tabular-nums">{brl(o.valor_total)}</b>
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-bold lg:hidden">{o.falecido}</span>
                        <span className={`block truncate text-[12.5px] lg:hidden ${MUTED}`}>
                            {o.contato} · {o.telefone} · válido até {dataBR(o.validade)}
                        </span>
                        {/* computador */}
                        <b className="hidden whitespace-nowrap text-[15px] lg:block">{o.numero}</b>
                        <span className="hidden min-w-0 lg:block">
                            <span className="block truncate text-sm font-bold">{o.falecido}</span>
                            <span className={`block truncate text-xs ${MUTED}`}>
                                {dataBR(o.criado_em)} · {o.criado_por_nome}
                            </span>
                        </span>
                        <span className="hidden min-w-0 lg:block">
                            <span className="block truncate text-sm font-semibold">{o.contato}</span>
                            <span className={`block truncate text-xs ${MUTED}`}>{o.telefone}</span>
                        </span>
                        <span className="hidden text-sm font-semibold lg:block">{dataBR(o.validade)}</span>
                        <span className="hidden lg:block">
                            <EtiquetaSituacao s={o.situacao} />
                        </span>
                        <b className="hidden text-right text-[15px] tabular-nums lg:block">{brl(o.valor_total)}</b>
                    </button>
                ))}
            </div>
        </div>
    );
}
