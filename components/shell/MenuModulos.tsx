"use client";

import React, { useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { FIXOS, MODULOS, destinoDoModulo, hrefDoItem, itensVisiveis, moduloVisivel, type TemAcesso } from "./modulos";
import { formatarSelo, type Contadores } from "./useContadores";

/** Menu do celular: acesso rápido e módulos que abrem e fecham. Usado dentro da folha "Menu". */

function valorDoSelo(c: Contadores, selo?: string): number | null {
    if (selo === "aguardando") return c.aguardando;
    if (selo === "coroas") return c.coroas;
    if (selo === "estoque") return c.estoque;
    if (selo === "avisos") return c.avisos;
    return null;
}

export function Selo({ valor }: { valor: string }) {
    if (!valor) return null;
    return (
        <span className="inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-[#F2CB3F] px-2 text-xs font-extrabold text-[#313C55]">
            {valor}
        </span>
    );
}

const CARD = "overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
const LINHA =
    "flex min-h-[52px] items-center gap-3 border-t border-[#E3E8F0] px-4 text-[15px] font-semibold text-[#313C55] first:border-t-0 hover:bg-[#EEF2F7] dark:border-white/[0.12] dark:text-white dark:hover:bg-white/10";

export default function MenuModulos({
    has,
    contadores,
    moduloAberto,
    onNavegar,
}: {
    has: TemAcesso;
    contadores: Contadores;
    moduloAberto?: string | null;
    onNavegar?: () => void;
}) {
    const [aberto, setAberto] = useState<string | null>(moduloAberto ?? null);
    const rapidos = FIXOS.filter((f) => f.titulo === "Quadro de Atendimentos" || f.titulo === "Minhas OS");
    const modulos = MODULOS.filter((m) => moduloVisivel(m, has));

    return (
        <div className="space-y-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">Acesso rápido</p>
            <div className={CARD}>
                {rapidos.map((f) => {
                    const Icon = f.icone;
                    return (
                        <Link key={f.href} href={f.href} onClick={onNavegar} className={LINHA}>
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E6F7FE] text-[#313C55] dark:bg-[#00AEEC]/20 dark:text-white">
                                <Icon size={20} />
                            </span>
                            <span className="flex-1 font-extrabold">{f.titulo}</span>
                            <IconChevronRight size={18} className="text-[#7A8396]" />
                        </Link>
                    );
                })}
            </div>

            <p className="pt-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">Módulos</p>
            <div className="grid grid-cols-1 gap-2.5 sm:landscape:grid-cols-2">
                {modulos.map((m) => {
                    const Icon = m.icone;
                    const aberta = aberto === m.id;
                    const itens = itensVisiveis(m, has);
                    const seloModulo = m.selo === "estoque" ? formatarSelo(contadores.estoque) : "";

                    return (
                        <div key={m.id} className={CARD}>
                            <button
                                type="button"
                                onClick={() => setAberto(aberta ? null : m.id)}
                                aria-expanded={aberta}
                                className="flex min-h-[60px] w-full items-center gap-3.5 px-4 text-left text-[#313C55] dark:text-white"
                            >
                                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EEF2F7] dark:bg-white/10">
                                    <Icon size={20} />
                                </span>
                                <span className="flex-1 text-base font-extrabold">{m.titulo}</span>
                                <Selo valor={seloModulo} />
                                {aberta ? <IconChevronDown size={18} className="text-[#7A8396]" /> : <IconChevronRight size={18} className="text-[#7A8396]" />}
                            </button>

                            {aberta ? (
                                <div>
                                    <Link href={destinoDoModulo(m, has)} onClick={onNavegar} className={LINHA}>
                                        <span className="flex-1 font-extrabold">Visão geral de {m.titulo}</span>
                                        <IconChevronRight size={16} className="text-[#7A8396]" />
                                    </Link>
                                    {itens.map((i) => (
                                        <Link key={i.titulo} href={hrefDoItem(i, has)} onClick={onNavegar} className={LINHA}>
                                            <span className="flex-1">{i.titulo}</span>
                                            <Selo valor={formatarSelo(valorDoSelo(contadores, i.selo))} />
                                            <IconChevronRight size={16} className="text-[#7A8396]" />
                                        </Link>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
