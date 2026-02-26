"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconHelp } from "@tabler/icons-react";

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
  useSidebar,
} from "@/components/ui/sidebar";

import { usePerms } from "@/app/_perms/PermsProvider";
import { LINKS } from "@/app/_perms/links";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const sidebar = useSidebar() as any;
  const { perms, has } = usePerms();

  const closeMobileNow = React.useCallback(() => {
    if (typeof sidebar?.setOpenMobile === "function") {
      sidebar.setOpenMobile(false);
    } else if (typeof sidebar?.setOpen === "function") {
      sidebar.setOpen(false);
    }
  }, [sidebar]);

  const handleNavigateMobile = React.useCallback(
    (href: string, e?: React.MouseEvent<HTMLAnchorElement>) => {
      if (e?.metaKey || e?.ctrlKey || e?.shiftKey || e?.altKey || e?.button === 1) return;
      const isMobile: boolean =
        !!sidebar?.isMobile ||
        (typeof window !== "undefined" && window.matchMedia?.("(max-width: 1024px)")?.matches) ||
        false;

      if (isMobile) {
        e?.preventDefault();
        closeMobileNow();
        router.push(href);
      }
    },
    [router, sidebar?.isMobile, closeMobileNow]
  );

  // Loading state
  if (perms == null) {
    return (
      <Sidebar collapsible="icon" {...props}>
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
        <SidebarContent>
          <div className="p-3 text-sm opacity-60">Carregando…</div>
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={{ name: "Usuário", email: "", avatar: "" }} />
        </SidebarFooter>
      </Sidebar>
    );
  }

  // Filtra os itens com base nas permissões
  const visible = LINKS.filter(l => has(l.slug));

  const navMain = visible.map(v => ({
    title: v.label,
    url: v.href,
    icon: v.Icon,
  }));

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
        <NavMain items={navMain} onNavigate={handleNavigateMobile} />

        {/* Rodapé visual de ajuda */}
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
        <NavUser user={{ name: "Usuário", email: "", avatar: "" }} />
      </SidebarFooter>
    </Sidebar>
  );
}
