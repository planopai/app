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

export type Tom = "azul" | "amarelo" | "verde";
export const TOM_DO_MODULO: Record<string, Tom> = {
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

/* ---------- peças do padrão das páginas (06/11/2026), usadas também pelo Início e pela Requisição de Material ---------- */

export const GRADE_CARTOES = "grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3.5";
export const GRADE_BLOCOS = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(172px,1fr))] lg:gap-3.5";
export const ROTULO_SECAO = "text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]";
export const BOTAO_PAGINA =
    "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-[18px] text-[14px] font-extrabold transition";
export const BOTAO_PAGINA_PRI =
    "border-[#313C55] bg-[#313C55] text-white hover:bg-[#232B40] dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
export const BOTAO_PAGINA_SEC =
    "border-[#C9D1DE] bg-white text-[#313C55] hover:border-[#313C55] dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white";

/** Topo padrão: ícone + título e, à direita, os botões da página. */
export function TopoPagina({ Icone, titulo, acoes }: { Icone: React.ElementType<any>; titulo: string; acoes?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-3.5">
            <span className="grid size-[52px] shrink-0 place-items-center rounded-2xl bg-[#313C55] text-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]">
                <Icone size={26} />
            </span>
            <h1 className="min-w-0 flex-1 text-[24px] font-extrabold leading-tight lg:text-[30px]">{titulo}</h1>
            {acoes ? <div className="flex w-full flex-wrap gap-2.5 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">{acoes}</div> : null}
        </div>
    );
}

/** Cartão de informação (número). Em 4 colunas fixas no computador: um cartão nunca estica a linha toda. */
export function CartaoInfo({ rotulo, valor, sub, href, estilo }: { rotulo: string; valor: React.ReactNode; sub: string; href: string; estilo?: "escuro" | "alerta" }) {
    return (
        <Link
            href={href}
            className={[
                "flex min-w-0 flex-col gap-1 rounded-[18px] border p-4 transition lg:px-5 lg:py-[18px]",
                estilo === "escuro"
                    ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                    : "border-[#E3E8F0] bg-white hover:border-[#C9D1DE] dark:border-white/[0.12] dark:bg-[#232B3F]",
                estilo === "alerta" ? "shadow-[inset_5px_0_0_#F2CB3F]" : "",
            ].join(" ")}
        >
            <span className={`text-[12px] font-extrabold uppercase leading-tight tracking-[0.08em] ${estilo === "escuro" ? "text-[#D6DCE8]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}>{rotulo}</span>
            <span className="text-[28px] font-extrabold leading-tight tabular-nums lg:text-[32px]">{valor}</span>
            <span className={`text-[12.5px] ${estilo === "escuro" ? "text-[#D6DCE8]" : "text-[#5B6478] dark:text-[#AEB9CF]"}`}>{sub}</span>
        </Link>
    );
}

/** Bloco de tela: ícone na cor do módulo, nome embaixo e o número pendente no canto. */
export function BlocoTela({ titulo, href, Icone, tom = "azul", selo, dica }: { titulo: string; href: string; Icone: React.ElementType<any>; tom?: Tom; selo?: number | null; dica?: string }) {
    return (
        <Link
            href={href}
            title={dica}
            className="relative flex min-h-[124px] flex-col items-center justify-center gap-3 rounded-[20px] border border-[#E3E8F0] bg-white px-3 py-4 text-center text-[14.5px] font-extrabold leading-tight shadow-sm transition hover:border-[#313C55] hover:shadow-[0_8px_22px_rgba(49,60,85,.10)] dark:border-white/[0.12] dark:bg-[#232B3F] dark:hover:border-white/50 lg:min-h-[140px] lg:text-[15px]"
        >
            {selo && selo > 0 ? (
                <span className="absolute right-2.5 top-2.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F2CB3F] px-1.5 text-[11px] font-extrabold tabular-nums text-[#313C55]">
                    {formatarSelo(selo)}
                </span>
            ) : null}
            <span className={`grid size-14 place-items-center rounded-[18px] text-[#313C55] dark:text-white ${FUNDO_ICONE[tom]}`}>
                <Icone size={28} stroke={1.8} />
            </span>
            <span className="break-words">{titulo}</span>
        </Link>
    );
}

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
                <div className="mb-6">
                    <TopoPagina Icone={Icon} titulo={m.titulo} />
                </div>

                {cartoes.length ? (
                    <div className={`mb-6 ${GRADE_CARTOES}`}>
                        {cartoes.map((c) => (
                            <CartaoInfo key={c.rotulo} rotulo={c.rotulo} valor={numeros[c.chave] as number} sub={c.sub} href={c.href} estilo={c.estilo} />
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
                    <div className={GRADE_BLOCOS}>
                        {itens.map((i, pos) => (
                            <React.Fragment key={i.id}>
                                {i.secao && i.secao !== itens[pos - 1]?.secao ? <h2 className={`col-span-full pt-3 first:pt-0 ${ROTULO_SECAO}`}>{i.secao}</h2> : null}
                                <BlocoTela titulo={i.titulo} href={hrefDoItem(i, has)} Icone={i.icone} tom={tom} selo={seloDoItem(i, numeros)} dica={i.desc} />
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
