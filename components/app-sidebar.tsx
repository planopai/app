"use client";

import * as React from "react";
import Link from "next/link";
import {
  IconHome,
  IconDeviceDesktop,
  IconUsers,
  IconDoor,
  IconBook,
  IconLeaf,
  IconFileText,
  IconHelp,
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
} from "@/components/ui/sidebar";

const data = {
  user: { name: "shadcn", email: "m@example.com", avatar: "/avatars/shadcn.jpg" },
  // IMPORTANTE: NavMain espera uma lista PLANA { title, url, icon? }
  navMain: [
    { title: "Início", url: "/", icon: IconHome },
    { title: "Quadro de Atendimento", url: "/quadro-atendimento", icon: IconDeviceDesktop },
    { title: "Acompanhamento", url: "/acompanhamento", icon: IconUsers },

    // Um único item "Memorial" que leva para a página com os 4 botões
    { title: "Memorial", url: "/memorial", icon: IconDoor },

    { title: "Obituário", url: "/obituario", icon: IconBook },
    { title: "Leads", url: "/leads", icon: IconUsers },
    { title: "Coroa de Flores", url: "/coroa-de-flores", icon: IconLeaf },
    { title: "Relatório", url: "/relatorio", icon: IconFileText },
  ],
};

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Cabeçalho: SOMENTE a logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/">
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
        <NavMain items={data.navMain} />

        {/* Ajuda colada no rodapé, mesmo estilo dos itens */}
        <div className="mt-auto px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/help">
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
