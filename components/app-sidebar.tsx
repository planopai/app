"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  useSidebar, // vamos detectar mobile e fechar
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
  const router = useRouter();
  const sidebar = useSidebar() as any;

  // fecha imediatamente o drawer mobile (cobre diferentes versões do componente)
  const closeMobileNow = React.useCallback(() => {
    if (typeof sidebar?.setOpenMobile === "function") {
      sidebar.setOpenMobile(false);
    } else if (typeof sidebar?.setOpen === "function") {
      sidebar.setOpen(false);
    }
  }, [sidebar]);

  // navega de forma controlada no MOBILE: fecha e depois muda a rota
  const handleNavigateMobile = React.useCallback(
    (href: string, e?: React.MouseEvent<HTMLAnchorElement>) => {
      // permitir abrir em nova aba/janela etc.
      if (
        e?.metaKey || e?.ctrlKey || e?.shiftKey || e?.altKey || e?.button === 1
      ) {
        return;
      }
      const isMobile: boolean =
        !!sidebar?.isMobile ||
        // fallback por conferência de viewport (caso a lib não exponha isMobile)
        (typeof window !== "undefined" && window.matchMedia?.("(max-width: 1024px)")?.matches) ||
        false;

      if (isMobile) {
        e?.preventDefault(); // NÃO deixa o Link navegar ainda
        closeMobileNow();    // fecha já o menu (efeito imediato)
        // navega programaticamente
        router.push(href);
      }
      // no desktop, não fazemos nada: Link cuida da navegação e o menu fica como está
    },
    [router, sidebar?.isMobile, closeMobileNow]
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Cabeçalho: logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/" onClick={(e) => handleNavigateMobile("/", e)}>
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
        {/* Passa a navegação controlada para cada item */}
        <NavMain
          items={data.navMain}
          onNavigate={handleNavigateMobile}
        />

        {/* Ajuda no rodapé visual */}
        <div className="mt-auto px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/help" onClick={(e) => handleNavigateMobile("/help", e)}>
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
