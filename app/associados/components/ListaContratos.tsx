"use client";

/**
 * Associados — lista de contratos e paginação (27/10/2026).
 * Computador: tabela com a linha inteira clicável. Celular: lista compacta.
 */

import React from "react";
import { IconChevronLeft, IconChevronRight, IconChevronsLeft, IconChevronsRight } from "@tabler/icons-react";
import { type Contract, diasDesde, fmtCpf, formataFone, haQuanto, inferHasAccessFromListItem, parseDataLocal } from "./logica";
import { Avatar, BotaoWhats, BTN_SEC, CARTAO, nomeBonito, SeloAcesso, SeloSituacao, SUAVE } from "./ui";

function ultimoPagamento(c: Contract) {
    const v = c.dataultimopagamento;
    const d = parseDataLocal(v);
    if (!d) return { texto: "Sem pagamento registrado", cor: SUAVE, titulo: "" };
    const n = diasDesde(d) ?? 0;
    const cor =
        n > 60 ? "font-bold text-[#B42318] dark:text-[#FF9C92]" : n > 35 ? "font-bold text-[#8A6A00] dark:text-[#F2CB3F]" : SUAVE;
    return { texto: `Pagou ${haQuanto(d)}`, cor, titulo: d.toLocaleDateString("pt-BR") };
}

function telefoneDo(c: Contract) {
    const cel = formataFone(c.celularTitular);
    if (cel.whats) return cel;
    const fixo = formataFone(c.foneTitular);
    return fixo.whats ? fixo : cel.texto !== "—" ? cel : fixo;
}

export function ListaContratos({
    itens,
    carregando,
    onAbrir,
    selecionadoId,
}: {
    itens: Contract[];
    carregando: boolean;
    onAbrir: (c: Contract) => void;
    selecionadoId?: number | null;
}) {
    if (carregando && itens.length === 0) {
        return (
            <ul aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className="flex items-center gap-3 border-b border-[#EEF1F6] px-4 py-3.5 last:border-b-0 dark:border-white/[0.06]">
                        <span className="size-10 animate-pulse rounded-full bg-[#E9EEF5] dark:bg-white/[0.08]" />
                        <span className="flex-1">
                            <span className="block h-4 w-1/3 animate-pulse rounded bg-[#E9EEF5] dark:bg-white/[0.08]" />
                            <span className="mt-2 block h-3 w-1/4 animate-pulse rounded bg-[#F1F4F8] dark:bg-white/[0.05]" />
                        </span>
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <div className={carregando ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {/* Computador */}
            <table className="hidden w-full text-left lg:table">
                <thead>
                    <tr className="border-b border-[#E3E8F0] text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:border-white/[0.08] dark:text-[#AEB9CF]">
                        <th className="py-2.5 pl-4 pr-3">Associado</th>
                        <th className="py-2.5 pr-3">Contrato e plano</th>
                        <th className="py-2.5 pr-3">Cidade</th>
                        <th className="py-2.5 pr-3">Situação</th>
                        <th className="py-2.5 pr-3">Telefone</th>
                        <th className="w-10 py-2.5 pr-3" />
                    </tr>
                </thead>
                <tbody>
                    {itens.map((c) => {
                        const pg = ultimoPagamento(c);
                        const fone = telefoneDo(c);
                        const sel = selecionadoId != null && selecionadoId === c.id;
                        return (
                            <tr
                                key={c.id}
                                onClick={() => onAbrir(c)}
                                className={[
                                    "cursor-pointer border-b border-[#EEF1F6] align-middle transition last:border-b-0 dark:border-white/[0.06]",
                                    sel ? "bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : "hover:bg-[#F6F8FB] dark:hover:bg-white/[0.03]",
                                ].join(" ")}
                            >
                                <td className="py-2.5 pl-4 pr-3">
                                    <div className="flex items-center gap-3">
                                        <Avatar nome={String(c.nome ?? "")} situacao={c.situacao} />
                                        <div className="min-w-0">
                                            <div className="truncate text-[15px] font-extrabold">{nomeBonito(c.nome)}</div>
                                            <div className={`text-[13px] tabular-nums ${SUAVE}`}>{fmtCpf(c.cpf_cnpj)}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-2.5 pr-3">
                                    <div className="text-[14px] font-bold tabular-nums">{c.contrato_numero || c.contrato || "—"}</div>
                                    <div className={`text-[13px] ${SUAVE}`}>{[c.cobertura, c.plano].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ") || "—"}</div>
                                </td>
                                <td className="py-2.5 pr-3 text-[14px]">{c.cidade ? nomeBonito(c.cidade) : "—"}</td>
                                <td className="py-2.5 pr-3">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <SeloSituacao situacao={c.situacao} />
                                        <SeloAcesso tem={inferHasAccessFromListItem(c)} curto />
                                    </div>
                                    <div className={`mt-1 text-[12px] ${pg.cor}`} title={pg.titulo}>
                                        {pg.texto}
                                    </div>
                                </td>
                                <td className="py-2.5 pr-3">
                                    <div className="flex items-center gap-2">
                                        <span className="w-[124px] text-[13px] font-semibold tabular-nums">{fone.texto}</span>
                                        <BotaoWhats numero={fone.whats} nome={nomeBonito(c.nome)} pequeno />
                                    </div>
                                </td>
                                <td className="py-2.5 pr-3 text-[#98A1B3]">
                                    <IconChevronRight size={20} />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* Celular e tablet */}
            <ul className="lg:hidden">
                {itens.map((c) => {
                    const pg = ultimoPagamento(c);
                    const fone = telefoneDo(c);
                    return (
                        <li key={c.id} className="flex items-center gap-2 border-b border-[#EEF1F6] pr-3 last:border-b-0 dark:border-white/[0.06]">
                            <button type="button" onClick={() => onAbrir(c)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left">
                                <Avatar nome={String(c.nome ?? "")} situacao={c.situacao} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] font-extrabold">{nomeBonito(c.nome)}</span>
                                    <span className={`block truncate text-[13px] ${SUAVE}`}>
                                        Contrato {c.contrato_numero || c.contrato || "—"} · {c.cobertura || c.plano || "—"}
                                    </span>
                                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <SeloSituacao situacao={c.situacao} />
                                        <span className={`text-[12px] ${pg.cor}`}>{pg.texto}</span>
                                    </span>
                                </span>
                            </button>
                            <BotaoWhats numero={fone.whats} nome={nomeBonito(c.nome)} />
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export function Paginacao({
    pagina,
    totalPaginas,
    total,
    porPagina,
    inicio,
    fim,
    desativado,
    temProxima,
    onIr,
    onPorPagina,
}: {
    pagina: number;
    totalPaginas?: number;
    total?: number;
    porPagina: number;
    inicio?: number;
    fim?: number;
    desativado: boolean;
    temProxima: boolean;
    onIr: (p: number) => void;
    onPorPagina: (n: number) => void;
}) {
    const ini = inicio ?? (total ? Math.min(total, (pagina - 1) * porPagina + 1) : 0);
    const ult = fim ?? (total ? Math.min(total, pagina * porPagina) : 0);
    return (
        <div className={`flex flex-col gap-3 border-t border-[#E3E8F0] bg-[#F6F8FB] p-3 dark:border-white/[0.08] dark:bg-[#1C2334] sm:flex-row sm:items-center sm:justify-between`}>
            <div className={`flex items-center justify-between gap-3 text-[13px] ${SUAVE} sm:justify-start`}>
                <span>
                    {total ? (
                        <>
                            Mostrando <b className="text-[#313C55] dark:text-white">{ini}–{ult}</b> de{" "}
                            <b className="text-[#313C55] dark:text-white">{total.toLocaleString("pt-BR")}</b>
                        </>
                    ) : (
                        <>Página {pagina}</>
                    )}
                </span>
                <label className="inline-flex items-center gap-2">
                    <span className="hidden sm:inline">Por página</span>
                    <select
                        value={porPagina}
                        onChange={(e) => onPorPagina(Number(e.target.value))}
                        aria-label="Contratos por página"
                        className="h-11 rounded-xl border-0 bg-white px-3 text-[15px] font-bold text-[#313C55] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#232B3F] dark:text-white"
                    >
                        {[10, 20, 50].map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
                <button type="button" className={`${BTN_SEC} w-11 px-0`} onClick={() => onIr(1)} disabled={desativado || pagina <= 1} aria-label="Primeira página">
                    <IconChevronsLeft size={18} />
                </button>
                <button type="button" className={`${BTN_SEC} w-11 px-0`} onClick={() => onIr(pagina - 1)} disabled={desativado || pagina <= 1} aria-label="Página anterior">
                    <IconChevronLeft size={18} />
                </button>
                <span className="min-w-[84px] text-center text-[14px] font-bold">
                    {pagina}
                    {totalPaginas ? ` de ${totalPaginas}` : ""}
                </span>
                <button type="button" className={`${BTN_SEC} w-11 px-0`} onClick={() => onIr(pagina + 1)} disabled={desativado || !temProxima} aria-label="Próxima página">
                    <IconChevronRight size={18} />
                </button>
                <button
                    type="button"
                    className={`${BTN_SEC} w-11 px-0`}
                    onClick={() => totalPaginas && onIr(totalPaginas)}
                    disabled={desativado || !totalPaginas || pagina >= totalPaginas}
                    aria-label="Última página"
                >
                    <IconChevronsRight size={18} />
                </button>
            </div>
        </div>
    );
}

export function CaixaLista({ children }: { children: React.ReactNode }) {
    return <div className={`${CARTAO} overflow-hidden`}>{children}</div>;
}
