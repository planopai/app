"use client";

import React from "react";
import Link from "next/link";
import { usePerms } from "@/app/_perms/PermsProvider";
import { hrefDoItem, itensVisiveis, type ItemModulo } from "./modulos";
import { useMenu } from "./useMenu";
import { formatarSelo, useContadores, type Contadores } from "./useContadores";

/**
 * Página de entrada de um módulo: lista só as telas que o usuário tem.
 * Usada por: servicos-funerarios (Atendimento), plano, administrativo e pelas páginas novas
 * comunicacao, modulo-estoque, financeiro e gestao, e pelos módulos criados pela Gestão (app/modulo/[id]).
 * 08/10/2026: segue a organização da Gestão (useMenu().modulos); as preferências pessoais não escondem nada aqui.
 *
 * 06/11/2026 — navegação nova (decisão de 03/11/2026, prévia "PAI Conecta — prévia geral"):
 *  - as telas aparecem como ícones (blocos), com a cor do módulo: azul (Atendimento), amarelo (Requisições e Estoque),
 *    verde (Financeiro, Plano, Administrativo e Gestão);
 *  - cartões de informação no topo, só com números que o sistema já tem (useContadores) e só para quem abre a tela do cartão;
 *  - o número pendente de cada tela aparece no canto do bloco.
 */

type Tom = "azul" | "amarelo" | "verde";
const TOM_DO_MODULO: Record<string, Tom> = {
    atendimento: "azul",
    requisicoes: "amarelo",
    estoque: "amarelo",
    financeiro: "verde",
    plano: "verde",
    administrativo: "verde",
    gestao: "verde",
};
const FUNDO_ICONE: Record<Tom, string> = {
    azul: "bg-[#E9EFF6] dark:bg-[#3D6A99]/30",
    amarelo: "bg-[#FCF3CC] dark:bg-[#F2CB3F]/20",
    verde: "bg-[#EEF5D6] dark:bg-[#B3CE52]/20",
};

/** Cartões de informação de cada módulo: [rótulo, número, complemento, rota que o cartão abre, destaque]. */
type Cartao = { rotulo: string; chave: keyof Contadores; sub: string; href: string; estilo?: "escuro" | "alerta" };
const CARTOES: Record<string, Cartao[]> = {
    atendimento: [
        { rotulo: "Serviços funerários", chave: "servicos", sub: "em andamento", href: "/acompanhamento", estilo: "escuro" },
        { rotulo: "Aguardando ação", chave: "aguardando", sub: "atendimentos", href: "/acompanhamento", estilo: "alerta" },
        { rotulo: "Coroas", chave: "coroas", sub: "na fila de confecção", href: "/coroa-de-flores" },
        { rotulo: "Avisos", chave: "avisos", sub: "em aberto", href: "/avisos" },
    ],
    requisicoes: [
        { rotulo: "Requisições", chave: "requisicoes", sub: "em aberto", href: "/requisicoes", estilo: "escuro" },
        { rotulo: "Minhas solicitações", chave: "minhasRequisicoes", sub: "em aberto", href: "/minhas-solicitacoes" },
    ],
    estoque: [{ rotulo: "Abaixo do mínimo", chave: "estoque", sub: "produtos", href: "/estoque", estilo: "alerta" }],
};

function seloDoItem(i: ItemModulo, n: Contadores): number {
    if (i.selo === "aguardando") return n.aguardando ?? 0;
    if (i.selo === "coroas") return n.coroas ?? 0;
    if (i.selo === "estoque") return n.estoque ?? 0;
    if (i.selo === "avisos") return n.avisos ?? 0;
    return 0;
}

export default function ModuloHub({ moduloId }: { moduloId: string }) {
    const { perms, has } = usePerms();
    const menu = useMenu();
    const numeros = useContadores(perms, has);
    const m = menu.modulos.find((x) => x.id === moduloId);
    if (!m) {
        return menu.carregado ? (
            <div className="min-h-[100dvh] bg-[#F6F8FB] p-6 text-[15px] font-bold text-[#5B6478] dark:bg-[#161C2A] dark:text-[#AEB9CF]">Este módulo não existe mais no menu.</div>
        ) : null;
    }

    const Icon = m.icone;
    const itens = perms == null ? [] : itensVisiveis(m, has);
    const tom = TOM_DO_MODULO[m.id] || "azul";
    const rotas = new Set(itens.flatMap((i) => [hrefDoItem(i, has), i.href]));
    const cartoes = (CARTOES[m.id] || []).filter((c) => rotas.has(c.href) && numeros[c.chave] !== null && numeros[c.chave] !== undefined);

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <div className="mb-6 flex items-center gap-3.5">
                    <span className="grid size-[52px] shrink-0 place-items-center rounded-2xl bg-[#313C55] text-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]">
                        <Icon size={26} />
                    </span>
                    <h1 className="min-w-0 text-[24px] font-extrabold leading-tight lg:text-[30px]">{m.titulo}</h1>
                </div>

                {cartoes.length ? (
                    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] lg:gap-3.5">
                        {cartoes.map((c) => (
                            <Link
                                key={c.rotulo}
                                href={c.href}
                                className={[
                                    "flex flex-col gap-1 rounded-[18px] border p-4 transition lg:px-5 lg:py-[18px]",
                                    c.estilo === "escuro"
                                        ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                                        : "border-[#E3E8F0] bg-white hover:border-[#C9D1DE] dark:border-white/[0.12] dark:bg-[#232B3F]",
                                    c.estilo === "alerta" ? "shadow-[inset_5px_0_0_#F2CB3F]" : "",
                                ].join(" ")}
                            >
                                <span className={`text-[12px] font-extrabold uppercase tracking-[0.08em] ${c.estilo === "escuro" ? "text-[#D6DCE8]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}>{c.rotulo}</span>
                                <span className="text-[28px] font-extrabold leading-tight tabular-nums lg:text-[32px]">{numeros[c.chave] as number}</span>
                                <span className={`text-[12.5px] ${c.estilo === "escuro" ? "text-[#D6DCE8]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}>{c.sub}</span>
                            </Link>
                        ))}
                    </div>
                ) : null}

                {perms == null ? (
                    <p className="text-sm font-bold text-[#5B6478] dark:text-[#AEB9CF]">Carregando…</p>
                ) : itens.length === 0 ? (
                    <p className="rounded-2xl border border-[#E3E8F0] bg-white p-5 text-sm font-bold text-[#5B6478] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#AEB9CF]">
                        Nenhuma opção disponível para o seu usuário neste módulo.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(172px,1fr))] lg:gap-3.5">
                        {itens.map((i, pos) => {
                            const I = i.icone;
                            const n = seloDoItem(i, numeros);
                            return (
                                <React.Fragment key={i.id}>
                                    {i.secao && i.secao !== itens[pos - 1]?.secao ? (
                                        <h2 className="col-span-full pt-3 text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] first:pt-0 dark:text-[#AEB9CF]">{i.secao}</h2>
                                    ) : null}
                                    <Link
                                        href={hrefDoItem(i, has)}
                                        title={i.desc}
                                        className="relative flex min-h-[124px] flex-col items-center justify-center gap-3 rounded-[20px] border border-[#E3E8F0] bg-white px-3 py-4 text-center text-[14.5px] font-extrabold leading-tight shadow-sm transition hover:border-[#313C55] hover:shadow-[0_8px_22px_rgba(49,60,85,.10)] dark:border-white/[0.12] dark:bg-[#232B3F] dark:hover:border-white/50 lg:min-h-[140px] lg:text-[15px]"
                                    >
                                        {n > 0 ? (
                                            <span className="absolute right-2.5 top-2.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F2CB3F] px-1.5 text-[11px] font-extrabold tabular-nums text-[#313C55]">
                                                {formatarSelo(n)}
                                            </span>
                                        ) : null}
                                        <span className={`grid size-14 place-items-center rounded-[18px] text-[#313C55] dark:text-white ${FUNDO_ICONE[tom]}`}>
                                            <I size={28} stroke={1.8} />
                                        </span>
                                        <span className="break-words">{i.titulo}</span>
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
