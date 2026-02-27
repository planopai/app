"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { IconChevronDown, IconHelp } from "@tabler/icons-react";

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
import { LINK_GROUPS } from "@/app/_perms/links";

/** Detecta mobile (<= 1024px) */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return isMobile;
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const pathname = usePathname();
  const sidebar = useSidebar() as any;
  const { perms, has } = usePerms();
  const isMobile = useIsMobile();

  const closeMobileNow = React.useCallback(() => {
    if (typeof sidebar?.setOpenMobile === "function") sidebar.setOpenMobile(false);
    else if (typeof sidebar?.setOpen === "function") sidebar.setOpen(false);
  }, [sidebar]);

  const navigate = React.useCallback(
    (href: string, e?: React.MouseEvent) => {
      // respeita clique em nova aba
      // @ts-ignore
      if (e?.metaKey || e?.ctrlKey || e?.shiftKey || e?.altKey || e?.button === 1) return;

      if (isMobile) {
        e?.preventDefault?.();
        closeMobileNow();
        router.push(href);
        return;
      }

      // desktop: deixa Link navegar normal quando for <Link>
      router.push(href);
    },
    [router, isMobile, closeMobileNow]
  );

  // Grupo aberto por padrão (desktop): o que contém a rota atual, senão o primeiro grupo
  const defaultOpen = React.useMemo(() => {
    const found =
      LINK_GROUPS.find((g) => g.items.some((i) => i.href === pathname))?.category ?? LINK_GROUPS[0]?.category ?? null;
    return found;
  }, [pathname]);

  const [openGroup, setOpenGroup] = React.useState<string | null>(defaultOpen);

  React.useEffect(() => {
    // quando troca rota no desktop, abre o grupo correspondente
    if (!isMobile) setOpenGroup(defaultOpen);
  }, [defaultOpen, isMobile]);

  const toggle = (cat: string) => setOpenGroup((prev) => (prev === cat ? null : cat));

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

        <SidebarContent className="px-2">
          <div className="p-3 text-sm opacity-60">Carregando…</div>
        </SidebarContent>

        <SidebarFooter>
          <NavUser user={{ name: "Usuário", email: "", avatar: "" }} />
        </SidebarFooter>
      </Sidebar>
    );
  }

  /** Render de um item do menu */
  const MenuItem = ({
    title,
    href,
    Icon,
  }: {
    title: string;
    href: string;
    Icon: any;
  }) => {
    const active = pathname === href;
    return (
      <SidebarMenuButton
        asChild
        className={[
          "flex gap-3",
          active ? "bg-accent text-accent-foreground" : "",
        ].join(" ")}
      >
        <Link href={href} onClick={(e) => navigate(href, e)}>
          <Icon className="!size-5" />
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
    );
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Cabeçalho: logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/" onClick={(e) => navigate("/", e)}>
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

      {/* Conteúdo: HÍBRIDO (Desktop=SANFONA / Mobile=GRUPOS FIXOS) */}
      <SidebarContent className="px-2 overflow-hidden">
        <div className={isMobile ? "space-y-4" : "space-y-2"}>
          {LINK_GROUPS.map((group) => {
            const visibleItems = group.items.filter((i) => has(i.slug));
            if (!visibleItems.length) return null;

            // MOBILE: grupos fixos (sempre abertos)
            if (isMobile) {
              return (
                <div key={group.category}>
                  <p className="px-3 mb-1 text-xs font-bold uppercase opacity-60">{group.category}</p>
                  <SidebarMenu className="space-y-1">
                    {visibleItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <MenuItem title={item.title} href={item.href} Icon={item.Icon} />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </div>
              );
            }

            // DESKTOP: sanfona
            const opened = openGroup === group.category;

            return (
              <div key={group.category}>
                <button
                  onClick={() => toggle(group.category)}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold uppercase opacity-70"
                  type="button"
                >
                  <span>{group.category}</span>
                  <IconChevronDown
                    size={16}
                    className={`transition ${opened ? "rotate-180" : ""}`}
                  />
                </button>

                {opened && (
                  <SidebarMenu className="space-y-1 pl-1">
                    {visibleItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <MenuItem title={item.title} href={item.href} Icon={item.Icon} />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé visual de ajuda */}
        <div className="mt-4 px-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/help" onClick={(e) => navigate("/help", e)}>
                  <IconHelp className="!size-5" />
                  <span>Ajuda</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>

      {/* Usuário */}
      <SidebarFooter>
        <NavUser user={{ name: "Usuário", email: "", avatar: "" }} />
      </SidebarFooter>
    </Sidebar>
  );
}