"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header"; // remova se não usar
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import BarraCelular from "@/components/barra/BarraCelular";

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
            /* Menu lateral fixo no computador (não recolhe). No celular/tablet (< 1024 px) ele vira gaveta, aberta pelo Menu da barra de baixo. */
            open
            onOpenChange={() => undefined}
            style={
                {
                    // ajuste livre
                    "--sidebar-width": "calc(var(--spacing) * 72)",
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
            </SidebarInset>
        </SidebarProvider>
    );
}
