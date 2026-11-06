"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header"; // remova se não usar
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import BarraCelular from "@/components/barra/BarraCelular";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { IconeAurora } from "@/components/shell/IconeAurora";

/**
 * 06/11/2026 — Aurora em botão flutuante em todo o app (decisão de 03/11/2026).
 * O botão abre um painel com o próprio Chat da Aurora (/chat) por cima da tela atual, sem sair dela.
 * Não aparece no Chat, no login, na TV do Quadro nem dentro do próprio painel.
 */
const SEM_AURORA = ["/chat", "/login", "/quadrotv"];

function AuroraFlutuante({ pathname }: { pathname: string }) {
    const [aberta, setAberta] = React.useState(false);
    const [usada, setUsada] = React.useState(false); // o painel só carrega o Chat no primeiro clique e depois fica montado
    const [tv, setTv] = React.useState(false);
    React.useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        setTv(q.has("tv") || q.get("modo") === "tv");
    }, [pathname]);
    React.useEffect(() => {
        if (!aberta) return;
        const k = (e: KeyboardEvent) => {
            if (e.key === "Escape") setAberta(false);
        };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [aberta]);
    if (tv || SEM_AURORA.some((r) => pathname === r || pathname.startsWith(r + "/"))) return null;
    return createPortal(
        <>
            {usada ? (
                <section
                    aria-label="Aurora"
                    hidden={!aberta}
                    className="fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-[65] flex flex-col overflow-hidden rounded-t-3xl border border-[#E3E8F0] bg-white shadow-[0_20px_50px_rgba(49,60,85,.25)] dark:border-white/[0.12] dark:bg-[#232B3F] lg:inset-auto lg:bottom-[104px] lg:right-7 lg:h-[min(680px,calc(100dvh-140px))] lg:w-[420px] lg:rounded-[20px]"
                >
                    <div className="flex items-center gap-2.5 bg-[#313C55] px-4 py-3 text-white">
                        <IconeAurora size={22} />
                        <h2 className="flex-1 text-[17px] font-extrabold">Aurora</h2>
                        <button type="button" aria-label="Fechar a Aurora" onClick={() => setAberta(false)} className="grid size-10 place-items-center rounded-xl hover:bg-white/10">
                            <IconX size={20} />
                        </button>
                    </div>
                    <iframe src="/chat" title="Aurora" className="min-h-0 w-full flex-1 border-0" />
                </section>
            ) : null}
            <button
                type="button"
                aria-label={aberta ? "Fechar a Aurora" : "Abrir a Aurora"}
                aria-expanded={aberta}
                onClick={() => {
                    setUsada(true);
                    setAberta((v) => !v);
                }}
                className={[
                    "fixed z-[60] grid place-items-center rounded-full shadow-[0_10px_28px_rgba(49,60,85,.30)] transition",
                    "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 size-[52px] lg:bottom-7 lg:right-7 lg:size-16",
                    aberta ? "bg-[#313C55] text-[#F2CB3F] max-lg:hidden" : "bg-[#F2CB3F] text-[#313C55] hover:bg-[#E4BC30]",
                ].join(" ")}
            >
                <IconeAurora className="size-[26px] lg:size-[30px]" strokeWidth={2} />
            </button>
        </>,
        document.body,
    );
}

type Props = {
    children: React.ReactNode;
    /** Rotas onde não queremos sidebar/header (ex.: /login) */
    hideOnRoutes?: string[];
};

/**
 * Renderiza o layout com Sidebar/Header em todas as páginas,
 * exceto nas rotas listadas em `hideOnRoutes`.
 */
export default function AppShell({
    children,
    hideOnRoutes = ["/login"],
}: Props) {
    const pathname = usePathname();
    const shouldHide = hideOnRoutes.some(
        (r) => pathname === r || pathname.startsWith(r + "/")
    );
    /* 06/11/2026: dentro do painel da Aurora (iframe) a tela abre limpa, sem menu, cabeçalho e barra. */
    const [noPainel, setNoPainel] = React.useState(false);
    const [montado, setMontado] = React.useState(false);
    React.useEffect(() => {
        setMontado(true);
        try {
            setNoPainel(window.self !== window.top);
        } catch {
            setNoPainel(true);
        }
    }, []);

    if (shouldHide || noPainel) {
        // Página "clean" (ex.: tela de login)
        return <div className="flex min-h-dvh flex-col">{children}</div>;
    }

    return (
        <SidebarProvider
            /* Menu lateral fixo no computador (não recolhe). No celular/tablet (< 1024 px) ele vira gaveta, aberta pelo Menu da barra de baixo. */
            open
            onOpenChange={() => undefined}
            style={
                {
                    // ajuste livre
                    // 06/11/2026: trilho só com os módulos no computador (96 px + a margem do formato "inset")
                    "--sidebar-width": "7rem",
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" />
            {/*
             * iPhone (09/10/2026): no celular/tablet (< 1024 px) a PÁGINA não rola mais — rola só a área do conteúdo.
             * Com a página rolando, o Safari do iPhone recolhe a barra de endereço e redesenha o que é fixo: a barra de baixo
             * ia para o meio da tela. Com a página parada, a barra fica sempre no rodapé. No computador nada muda.
             */}
            <style>{`@media (max-width: 1023.98px) { html, body { height: 100%; overflow: hidden; overscroll-behavior: none; } }`}</style>
            <SidebarInset className="max-lg:h-[100dvh] max-lg:min-h-0 max-lg:overflow-hidden md:max-lg:h-[calc(100dvh-1rem)]">
                {/* Header global (remova se não quiser) */}
                <SiteHeader />
                {/*
                 * 06/11/2026: a tela ocupa só o espaço que sobra abaixo do cabeçalho. Várias telas usam min-h de 100dvh, que somado ao
                 * cabeçalho passava da janela e fazia a página rolar ("mexer") mesmo sem conteúdo. Aqui a tela cresce até o fim
                 * da área (flex-1) e o min-h dela é zerado, então só rola quando o conteúdo é maior que a tela.
                 */}
                <div data-pai-rolagem className="flex flex-1 flex-col max-lg:min-h-0 max-lg:overflow-y-auto max-lg:overscroll-y-contain [&>*]:flex-1 [&>*]:!min-h-0">
                    {children}
                </div>
                {/*
                 * Barra de baixo do celular (5 atalhos + Menu); some no computador.
                 * 14/10/2026: fica FORA da área que rola. O espaço que ela reserva vem logo abaixo da área de rolagem, então a tela
                 * fica enquadrada entre o cabeçalho e a barra. Dentro da área que rola (coluna flex com altura fixa), esse espaço
                 * encolhia até 0 e o fim de toda tela longa ficava atrás da barra.
                 */}
                <BarraCelular />
            </SidebarInset>
            {montado ? <AuroraFlutuante pathname={pathname} /> : null}
        </SidebarProvider>
    );
}
