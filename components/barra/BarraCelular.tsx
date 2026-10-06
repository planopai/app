"use client";

/**
 * Barra de baixo do celular (abaixo de 1024 px, onde o menu lateral vira gaveta). Vale também com o celular na horizontal.
 * 5 atalhos personalizáveis (barra_atalhos.php, aparelho "celular") + o Menu, sempre por último.
 * Menu (definição de 06/10/2026): abre o menu em tela inteira; tocar de novo no Menu recolhe.
 * Com o menu aberto a barra continua visível por cima (z-[60]) e um atalho tocado fecha o menu e abre a tela.
 * Contador de não lidas no atalho do Messenger.
 *
 * Fica dentro do AppShell (precisa do SidebarProvider). Ocupa o próprio espaço no fim da página
 * (não cobre o conteúdo) e some:
 *  - nas rotas que já têm um campo fixo no rodapé (Chat da Aurora, Tela Inicial antiga, Quadro TV);
 *  - quando a tela pede (evento "pai:ocultar-barra", ex.: conversa aberta no Messenger).
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { usePerms } from "@/app/_perms/PermsProvider";
import { useNaoLidas } from "@/components/messenger/ContadorMenu";
import { useContadores } from "@/components/shell/useContadores";
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
    const sidebar = useSidebar() as any;
    const { perms, has } = usePerms();
    const barra = useBarra();
    const temMessenger = perms !== null && has("messenger");
    const naoLidas = useNaoLidas(temMessenger);
    const numeros = useContadores(perms, has);
    const [ocultaPelaTela, setOcultaPelaTela] = useState(false);

    useEffect(() => {
        const aoPedir = (e: Event) => setOcultaPelaTela(Boolean((e as CustomEvent).detail));
        window.addEventListener(EVENTO_OCULTAR_BARRA, aoPedir);
        setOcultaPelaTela(Boolean((window as any).__paiOcultarBarra)); // pedido feito antes de a barra montar
        return () => window.removeEventListener(EVENTO_OCULTAR_BARRA, aoPedir);
    }, []);

    const semBarraNaRota = ROTAS_SEM_BARRA.some((r) => pathname === r || pathname.startsWith(r + "/"));
    if (perms === null || semBarraNaRota || ocultaPelaTela) return null;

    const itens = barra.celular.itens.filter((i) => barra.carregada || !i.pagina || has(i.pagina)).slice(0, 5);
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
    const menuAberto = Boolean(sidebar?.openMobile);
    const alternarMenu = () => {
        if (typeof sidebar?.setOpenMobile === "function") sidebar.setOpenMobile(!menuAberto);
        else sidebar?.toggleSidebar?.();
    };
    const fecharMenu = () => {
        if (menuAberto && typeof sidebar?.setOpenMobile === "function") sidebar.setOpenMobile(false);
    };
    /* Com o menu aberto, o toque na barra não pode contar como "clique fora" do menu (senão o Menu fecharia e reabriria). */
    const naoContarComoFora = (e: React.PointerEvent) => {
        if (menuAberto) e.stopPropagation();
    };
    const classeItem = (on: boolean) =>
        `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] font-bold leading-tight ${on ? "text-primary" : "text-muted-foreground"}`;

    return (
        <>
            {/* reserva o espaço da barra no fim da página */}
            <div aria-hidden="true" className="h-[calc(4.25rem+env(safe-area-inset-bottom))] lg:hidden" />
            <nav
                aria-label="Atalhos"
                data-pai-barra-celular
                onPointerDownCapture={naoContarComoFora}
                className={`fixed inset-x-0 bottom-0 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden ${menuAberto ? "pointer-events-auto z-[60]" : "z-40"}`}
            >
                <div className="mx-auto flex h-[4.25rem] max-w-xl items-stretch px-1">
                    {itens.map((i) => {
                        const on = ativo(i.rota);
                        return (
                            <Link key={i.id} href={i.rota} aria-current={on ? "page" : undefined} className={classeItem(on)} onClick={fecharMenu}>
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
                    <button
                        type="button"
                        onClick={alternarMenu}
                        className={classeItem(menuAberto)}
                        aria-label={menuAberto ? "Recolher o menu" : "Abrir o menu"}
                        aria-expanded={menuAberto}
                    >
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
