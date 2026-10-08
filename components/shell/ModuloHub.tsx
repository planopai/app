"use client";

import React from "react";
import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { usePerms } from "@/app/_perms/PermsProvider";
import { hrefDoItem, itensVisiveis } from "./modulos";
import { useMenu } from "./useMenu";

/**
 * Página de entrada de um módulo: lista só as telas que o usuário tem.
 * Usada por: servicos-funerarios (Atendimento), plano, administrativo e pelas páginas novas
 * comunicacao, modulo-estoque, financeiro e gestao, e pelos módulos criados pela Gestão (app/modulo/[id]).
 * 08/10/2026: segue a organização da Gestão (useMenu().modulos); as preferências pessoais não escondem nada aqui.
 */
export default function ModuloHub({ moduloId }: { moduloId: string }) {
    const { perms, has } = usePerms();
    const menu = useMenu();
    const m = menu.modulos.find((x) => x.id === moduloId);
    if (!m) {
        return menu.carregado ? (
            <div className="min-h-[100dvh] bg-[#F6F8FB] p-6 text-[15px] font-bold text-[#5B6478] dark:bg-[#161C2A] dark:text-[#AEB9CF]">Este módulo não existe mais no menu.</div>
        ) : null;
    }

    const Icon = m.icone;
    const itens = perms == null ? [] : itensVisiveis(m, has);

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#313C55] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <div className="mb-6 flex items-center gap-4 lg:mb-8">
                    <span className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]">
                        <Icon size={28} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-extrabold leading-tight lg:text-[32px]">{m.titulo}</h1>
                        <p className="mt-1 text-sm text-[#5B6478] dark:text-[#AEB9CF] lg:text-[15px]">{m.desc}.</p>
                    </div>
                </div>

                {perms == null ? (
                    <p className="text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF]">Carregando…</p>
                ) : itens.length === 0 ? (
                    <p className="rounded-2xl border border-[#E3E8F0] bg-white p-5 text-sm font-bold text-[#5B6478] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#AEB9CF]">
                        Nenhuma opção disponível para o seu usuário neste módulo.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:landscape:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
                        {itens.map((i, pos) => {
                            const I = i.icone;
                            return (
                                <React.Fragment key={i.id}>
                                {i.secao && i.secao !== itens[pos - 1]?.secao ? (
                                    <h2 className="col-span-full pt-3 text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] first:pt-0 dark:text-[#AEB9CF]">{i.secao}</h2>
                                ) : null}
                                <Link
                                    href={hrefDoItem(i, has)}
                                    className="flex items-center gap-3.5 rounded-2xl border border-[#E3E8F0] bg-white p-4 shadow-sm transition hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:hover:border-white/50"
                                >
                                    <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[#E6F7FE] text-[#313C55] dark:bg-[#00AEEC]/20 dark:text-white">
                                        <I size={22} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[15px] font-extrabold">{i.titulo}</span>
                                        <span className="block text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{i.desc}</span>
                                    </span>
                                    <IconChevronRight size={18} className="shrink-0 text-[#7A8396]" />
                                </Link>
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
