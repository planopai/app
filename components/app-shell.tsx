"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header"; // remova se não usar
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import BarraCelular from "@/components/barra/BarraCelular";
import MenuCelularHost from "@/components/shell/MenuCelular";

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

    if (shouldHide) {
        // Página "clean" (ex.: tela de login)
        return <div className="flex min-h-dvh flex-col">{children}</div>;
    }

    return (
        <SidebarProvider
            /* Barra lateral FIXA no computador (mockup): sempre aberta, sem recolher. `open` controlado e sem onOpenChange
               ignora o botão e o atalho Ctrl+B. No celular o menu é o Menu do mockup (MenuCelular), não esta barra. */
            open
            style={
                {
                    "--sidebar-width": "17rem", // 272 px, a largura do mockup
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" />
            <SidebarInset>
                {/* Header global (remova se não quiser) */}
                <SiteHeader />
                <div className="flex flex-1 flex-col">{children}</div>
                {/* Barra de baixo do celular (5 atalhos + Menu); some no computador */}
                <BarraCelular />
                {/* Menu do celular (como no mockup); abre pela barra de baixo e pelo botão do cabeçalho */}
                <MenuCelularHost />
            </SidebarInset>
        </SidebarProvider>
    );
}
