"use client";

/**
 * Barra de baixo do celular (abaixo de 768 px, onde o menu lateral vira gaveta).
 * 5 atalhos personalizáveis (barra_atalhos.php, aparelho "celular") + o Menu, sempre por último,
 * que abre o MENU DO CELULAR do mockup (components/shell/MenuCelular.tsx), não a gaveta lateral. Contador de não lidas no atalho do Messenger.
 *
 * Fica dentro do AppShell (precisa do SidebarProvider). Ocupa o próprio espaço no fim da página
 * (não cobre o conteúdo) e some:
 *  - nas rotas que já têm um campo fixo no rodapé (Chat da Aurora, Tela Inicial antiga, Quadro TV);
 *  - quando a tela pede (evento "pai:ocultar-barra", ex.: conversa aberta no Messenger).
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePerms } from "@/app/_perms/PermsProvider";
import { useNaoLidas } from "@/components/messenger/ContadorMenu";
import { useContadores } from "@/components/shell/useContadores";
import { rotaExiste } from "@/components/shell/rotas";
import { EVENTO_BARRA_ESTADO, abrirMenuCelular, useMenuCelularAberto } from "@/components/shell/MenuCelular";
import { IconeAtalho, useBarra } from "./atalhos";

export const EVENTO_OCULTAR_BARRA = "pai:ocultar-barra";

/** Uma tela pede para esconder (true) ou mostrar (false) a barra de baixo. Ao sair da tela, peça false. */
export function ocultarBarraCelular(ocultar: boolean) {
    (window as any).__paiOcultarBarra = ocultar;
    window.dispatchEvent(new CustomEvent(EVENTO_OCULTAR_BARRA, { detail: ocultar }));
}
const ROTAS_SEM_BARRA = ["/chat", "/tela", "/quadrotv", "/login"];

export default function BarraCelular() {
    const pathname = usePathname() || "/";
    const { perms, has } = usePerms();
    const barra = useBarra();
    const temMessenger = perms !== null && has("messenger");
    const naoLidas = useNaoLidas(temMessenger);
    const numeros = useContadores(perms, has);
    const [ocultaPelaTela, setOcultaPelaTela] = useState(false);
    const menuAberto = useMenuCelularAberto();

    useEffect(() => {
        const aoPedir = (e: Event) => setOcultaPelaTela(Boolean((e as CustomEvent).detail));
        window.addEventListener(EVENTO_OCULTAR_BARRA, aoPedir);
        setOcultaPelaTela(Boolean((window as any).__paiOcultarBarra)); // pedido feito antes de a barra montar
        return () => window.removeEventListener(EVENTO_OCULTAR_BARRA, aoPedir);
    }, []);

    const semBarraNaRota = ROTAS_SEM_BARRA.some((r) => pathname === r || pathname.startsWith(r + "/"));
    const barraNaTela = !(perms === null || semBarraNaRota || ocultaPelaTela);
    useEffect(() => {
        (window as any).__paiBarraVisivel = barraNaTela;
        window.dispatchEvent(new CustomEvent(EVENTO_BARRA_ESTADO, { detail: barraNaTela }));
    }, [barraNaTela]);

    if (!barraNaTela) return null;

    const itens = barra.celular.itens.filter((i) => (barra.carregada || !i.pagina || has(i.pagina)) && rotaExiste(i.rota)).slice(0, 5);
    const contMsg = naoLidas.total + naoLidas.fila;
    /* Número no atalho: Messenger (não lidas + fila), Atendimentos (aguardando sua ação), Avisos, Estoque (no mínimo) e Coroas (fila). */
    const numeroDe = (id: string): number => {
        if (id === "messenger") return contMsg;
        if (id === "atendimentos") return numeros.aguardando ?? 0;
        if (id === "avisos") return numeros.avisos ?? 0;
        if (id === "estoque") return numeros.estoque ?? 0;
        if (id === "coroas") return numeros.coroas ?? 0;
        return 0;
    };
    const ativo = (rota: string) => (rota === "/" ? pathname === "/" : pathname === rota || pathname.startsWith(rota + "/"));
    const classeItem = (on: boolean) =>
        `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] font-bold leading-tight ${on ? "text-primary" : "text-muted-foreground"}`;

    return (
        <>
            {/* reserva o espaço da barra no fim da página */}
            <div aria-hidden="true" className="h-[calc(4.25rem+env(safe-area-inset-bottom))] md:hidden" />
            <nav
                aria-label="Atalhos"
                data-pai-barra="true"
                className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
            >
                <div className="mx-auto flex h-[4.25rem] max-w-xl items-stretch px-1">
                    {itens.map((i) => {
                        const on = ativo(i.rota);
                        return (
                            <Link key={i.id} href={i.rota} aria-current={on ? "page" : undefined} className={classeItem(on)}>
                                <span className="relative">
                                    <IconeAtalho id={i.id} className="h-[22px] w-[22px]" />
                                    {numeroDe(i.id) > 0 && (
                                        <span className="absolute -right-2.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-primary-foreground" aria-label={`${numeroDe(i.id)} pendente(s)`}>
                                            {numeroDe(i.id) > 99 ? "99+" : numeroDe(i.id)}
                                        </span>
                                    )}
                                </span>
                                <span className="max-w-full truncate">{i.curto}</span>
                            </Link>
                        );
                    })}
                    <button type="button" onClick={abrirMenuCelular} className={classeItem(menuAberto)} aria-label="Abrir o menu" aria-expanded={menuAberto}>
                        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                            <path d="M4 12h16M4 6h16M4 18h16" />
                        </svg>
                        <span>Menu</span>
                    </button>
                </div>
            </nav>
        </>
    );
}
