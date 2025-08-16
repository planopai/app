"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  useSidebar, // ⬅️ para detectar mobile e fechar
} from "@/components/ui/sidebar";

const data = {
  user: { name: "shadcn", email: "m@example.com", avatar: "/avatars/shadcn.jpg" },
  // Lista PLANA para compatibilidade com o NavMain atual (sem subitens)
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
  const pathname = usePathname();
  const { isMobile, setOpen } = useSidebar();

  // Fecha o sidebar APENAS no mobile ao clicar num item.
  const handleMobileClick = React.useCallback(
    (e?: React.MouseEvent) => {
      if (e) {
        // não fechar em cmd/ctrl/shift/alt click ou botão do meio
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
      }
      if (isMobile) setOpen(false);
    },
    [isMobile, setOpen]
  );

  // Fallback: quando a rota muda, garante fechamento no mobile
  React.useEffect(() => {
    if (isMobile) setOpen(false);
  }, [pathname, isMobile, setOpen]);

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Cabeçalho: logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/" onClick={handleMobileClick}>
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
        {/* passa a callback para cada item */}
        <NavMain items={data.navMain} onItemClick={handleMobileClick} />

        {/* Ajuda no rodapé visual */}
        <div className="mt-auto px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/help" onClick={handleMobileClick}>
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
