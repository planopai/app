"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconHelp,
  IconLogout,
  IconClipboardList,
  IconActivity,
  IconBooks,
  IconBuildingCommunity,
  IconUsersGroup,
  IconFileText,
  IconPackage,
  IconSettings,
  IconFileInvoice,
  IconFlower,
} from "@tabler/icons-react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { usePerms } from "@/app/_perms/PermsProvider";

/**
 * Ajuste esperado do PermsProvider:
 * - has(slug: string) => boolean
 * - perms pode ser null no loading
 *
 * Se você tiver um provider de usuário (nome/email/avatar), pluga aqui.
 */
type AppUser = {
  name: string;
  email?: string;
  avatar?: string;
  planLabel?: string; // ex: "Gratuito"
};

type MenuItem = {
  slug: string; // chave de permissão
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
};

type MenuGroup = {
  category: string;
  items: MenuItem[];
};

const MENU_GROUPS: MenuGroup[] = [
  {
    category: "ATENDIMENTO",
    items: [
      { slug: "quadro_atendimento", label: "Quadro de Atendimento", href: "/quadro-de-atendimento", Icon: IconClipboardList },
      { slug: "acompanhamento", label: "Acompanhamento", href: "/acompanhamento", Icon: IconActivity },
      { slug: "memorial", label: "Memorial", href: "/memorial", Icon: IconBooks },
      { slug: "obituario", label: "Obituário", href: "/obituario", Icon: IconFileInvoice },
      { slug: "coroa_flores", label: "Coroa de Flores", href: "/coroa-de-flores", Icon: IconFlower },
    ],
  },
  {
    category: "ASSOCIADOS",
    items: [
      { slug: "clube_pai", label: "Clube PAI", href: "/clube-pai", Icon: IconBuildingCommunity },
      { slug: "leads", label: "Leads", href: "/leads", Icon: IconUsersGroup },
    ],
  },
  {
    category: "ADMINISTRAÇÃO",
    items: [
      { slug: "relatorio", label: "Relatório", href: "/relatorio", Icon: IconFileText },
      { slug: "estoque", label: "Estoque", href: "/estoque", Icon: IconPackage },
      { slug: "administrativo", label: "Administrativo", href: "/administrativo", Icon: IconSettings },
    ],
  },
];

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const sidebar = useSidebar() as any;
  const { perms, has } = usePerms();

  // ✅ TROQUE AQUI PELO SEU USER REAL (supabase / api / context etc.)
  const user: AppUser = React.useMemo(
    () => ({
      name: "Tharles",
      email: "",
      avatar: "",
      planLabel: "Gratuito",
    }),
    []
  );

  const closeMobileNow = React.useCallback(() => {
    if (typeof sidebar?.setOpenMobile === "function") sidebar.setOpenMobile(false);
    else if (typeof sidebar?.setOpen === "function") sidebar.setOpen(false);
  }, [sidebar]);

  const handleNavigateMobile = React.useCallback(
    (href: string, e?: React.MouseEvent<HTMLAnchorElement>) => {
      // permite abrir em nova aba/janela normalmente
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

  const isActive = React.useCallback(
    (href: string) => (href === "/" ? pathname === "/" : pathname?.startsWith(href)),
    [pathname]
  );

  async function logout() {
    // ex: await supabase.auth.signOut()
    closeMobileNow();
    router.push("/auth");
  }

  // Loading state
  if (perms == null) {
    return (
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader className="px-3 pt-3">
          <Link href="/" className="flex items-center gap-3 px-2 py-2">
            <img
              src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1"
              alt="Logo PAI"
              className="h-8 w-auto"
            />
          </Link>

          <div className="mt-2 flex items-center gap-3 px-2 pb-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-semibold">
              {initialsFromName("Usuário")}
            </div>
            <div className="leading-tight group-data-[collapsible=icon]/sidebar:hidden">
              <p className="text-[10px] uppercase text-muted-foreground">Carregando</p>
              <p className="text-[14px] font-semibold">Usuário</p>
            </div>
          </div>

          <div className="mx-2 border-t" />
        </SidebarHeader>

        <SidebarContent>
          <div className="p-3 text-sm opacity-60">Carregando…</div>
        </SidebarContent>
      </Sidebar>
    );
  }

  // Filtra itens por permissão, mantendo a ordem e categorias fixas
  const filteredGroups: MenuGroup[] = MENU_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => has(i.slug)),
  })).filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* HEADER: logo + user em cima (remove 3 pontinhos de baixo) */}
      <SidebarHeader className="px-3 pt-3">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <Link href="/" onClick={(e) => handleNavigateMobile("/", e)} className="flex items-center">
            <img
              src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1"
              alt="Logo PAI"
              className="h-8 w-auto"
            />
          </Link>
        </div>

        {/* User badge */}
        <div className="mt-2 flex items-center gap-3 px-2 pb-3">
          <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
            {initialsFromName(user.name)}
          </div>

          <div className="leading-tight group-data-[collapsible=icon]/sidebar:hidden">
            <p className="text-[10px] uppercase text-muted-foreground">{user.planLabel ?? ""}</p>
            <p className="text-[14px] font-semibold">{user.name}</p>
          </div>
        </div>

        {/* linha separadora */}
        <div className="mx-2 border-t" />
      </SidebarHeader>

      <SidebarContent>
        {/* MENU com categorias + linhas */}
        <div className="py-3">
          {filteredGroups.map((group, idx) => (
            <div key={group.category} className="mb-5">
              {/* separador entre grupos (não no primeiro) */}
              {idx !== 0 && <div className="mx-2 mb-4 border-t" />}

              <div className="px-3 mb-2 group-data-[collapsible=icon]/sidebar:hidden">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {group.category}
                </p>
              </div>

              <div className="space-y-1 px-2">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.Icon;

                  return (
                    <SidebarMenu key={item.slug}>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          tooltip={item.label}
                          data-active={active}
                          className={
                            active
                              ? "bg-muted font-semibold"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }
                        >
                          <Link href={item.href} onClick={(e) => handleNavigateMobile(item.href, e)}>
                            <Icon className="!size-5" />
                            <span>{item.label}</span>
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

        {/* Ações do rodapé (ajuda + sair) com linha, igual seu padrão */}
        <div className="mt-auto px-2 pb-2">
          <div className="mx-0 mb-3 border-t" />

          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Ajuda">
                <Link href="/help" onClick={(e) => handleNavigateMobile("/help", e)}>
                  <IconHelp className="!size-5" />
                  <span>Ajuda</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={logout}
                tooltip="Sair"
                className="text-red-600 hover:bg-red-500/10 hover:text-red-700"
              >
                <IconLogout className="!size-5" />
                <span>Sair</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}