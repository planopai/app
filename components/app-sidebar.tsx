"use client";

import * as React from "react";
import Link from "next/link";
import {
  IconHome,
  IconDeviceDesktop,
  IconUsers,
  IconBook,
  IconUsersGroup,
  IconLeaf,
  IconFileText,
  IconHelp,
  IconBuildingSkyscraper,
} from "@tabler/icons-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar, // ⬅️ vamos usar só setOpen(false)
} from "@/components/ui/sidebar";

const data = {
  user: { name: "shadcn", email: "m@example.com", avatar: "/avatars/shadcn.jpg" },
  navMain: [
    { title: "Início", url: "/", icon: IconHome },
    { title: "Quadro de Atendimento", url: "/quadro-atendimento", icon: IconDeviceDesktop },
    { title: "Acompanhamento", url: "/acompanhamento", icon: IconUsers },
    { title: "Memorial", url: "/memorial", icon: IconBuildingSkyscraper },
    { title: "Obituário", url: "/obituario", icon: IconBook },
    { title: "Leads", url: "/leads", icon: IconUsersGroup },
    { title: "Coroa de Flores", url: "/coroa-de-flores", icon: IconLeaf },
    { title: "Relatório", url: "/relatorio", icon: IconFileText },
  ] as { title: string; url: string; icon?: any }[],
};

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { setOpen } = useSidebar();

  // Fecha o sidebar ao navegar (ignora Cmd/Ctrl/Middle click)
  const handleNavigate = React.useCallback((e?: React.MouseEvent) => {
    if (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
    }
    setOpen(false); // funciona para mobile (off-canvas) e desktop (colapsa)
  }, [setOpen]);

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Cabeçalho: logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/" onClick={handleNavigate}>
                <img
                  src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1"
                  alt="Logo PAI"
                  className="h-8 w-auto"
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Menu principal */}
      <SidebarContent>
        <NavMain items={data.navMain} onItemClick={handleNavigate} />

        {/* Ajuda no rodapé visual */}
        <div className="mt-auto px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/help" onClick={handleNavigate}>
                  <IconHelp className="!size-5" />
                  <span>Ajuda</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>

      {/* Usuário (opcional) */}
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
