"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconHelp, IconLogout } from "@tabler/icons-react";

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
import { NavUser } from "@/components/nav-user";

/**
 * Ajuste esperado do LINKS:
 * LINKS: Array<{
 *   slug: string;      // perm key
 *   label: string;     // texto do menu
 *   href: string;      // rota
 *   Icon?: any;        // componente de ícone (Tabler/Lucide/etc)
 *   group?: string;    // (opcional) categoria tipo "PRINCIPAL", "ESTUDO", ...
 * }>
 */

type NavItem = {
  name: string;
  href: string;
  icon?: React.ComponentType<{ className?: string; size?: number } | any>;
};

type NavGroup = {
  category: string;
  items: NavItem[];
};

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
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
      // permite abrir em nova aba/janela normalmente
      if (e?.metaKey || e?.ctrlKey || e?.shiftKey || e?.altKey || e?.button === 1) return;

      const isMobile: boolean =
        !!sidebar?.isMobile ||
        (typeof window !== "undefined" &&
          window.matchMedia?.("(max-width: 1024px)")?.matches) ||
        false;

      if (isMobile) {
        e?.preventDefault();
        closeMobileNow();
        router.push(href);
      }
    },
    [router, sidebar?.isMobile, closeMobileNow]
  );

  const isActive = React.useCallback(
    (href: string) => (href === "/" ? pathname === "/" : pathname?.startsWith(href)),
    [pathname]
  );

  // 👇 seu logout real aqui (supabase / next-auth / api / etc)
  async function logout() {
    // ex: await supabase.auth.signOut()
    closeMobileNow();
    router.push("/auth");
  }

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

  // 1) Filtra por permissão
  const visible = LINKS.filter((l) => has(l.slug));

  // 2) Agrupa por categoria (group), caindo em "MENU" se não existir
  const groups: NavGroup[] = Object.values(
    visible.reduce((acc, l) => {
      const category = (l as any).group ?? "MENU";
      acc[category] ??= { category, items: [] as NavItem[] };

      acc[category].items.push({
        name: l.label,
        href: l.href,
        icon: l.Icon,
      });

      return acc;
    }, {} as Record<string, NavGroup>)
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* HEADER (logo) */}
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

      {/* CONTENT (menu com categorias, estilo do seu 1º sidebar) */}
      <SidebarContent>
        <div className="py-3">
          {groups.map((group) => (
            <div key={group.category} className="mb-5">
              {/* Mostra o label da categoria quando não está colapsado (shadcn usa data-state) */}
              <div className="px-3 mb-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground group-data-[collapsible=icon]/sidebar:hidden">
                  {group.category}
                </p>
              </div>

              <div className="space-y-1 px-2">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;

                  return (
                    <SidebarMenu key={item.name}>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip={item.name} data-active={active}>
                          <Link href={item.href} onClick={(e) => handleNavigateMobile(item.href, e)}>
                            {Icon ? <Icon className="!size-5" /> : null}
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* FOOTER dentro do content (ajuda + sair), igual seu padrão */}
        <div className="mt-auto px-2 pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/help" onClick={(e) => handleNavigateMobile("/help", e)}>
                  <IconHelp className="!size-5" />
                  <span>Ajuda</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={logout}
                className="text-red-600 hover:text-red-700 data-[active=true]:text-red-700"
              >
                <IconLogout className="!size-5" />
                <span>Sair</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>

      {/* USER */}
      <SidebarFooter>
        <NavUser user={{ name: "Usuário", email: "", avatar: "" }} />
      </SidebarFooter>
    </Sidebar>
  );
}