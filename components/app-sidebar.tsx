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

type GroupKey = string;

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const pathname = usePathname();
  const sidebar = useSidebar() as any;
  const { perms, has } = usePerms();
  const isMobile = useIsMobile();

  const isCollapsed = Boolean(sidebar?.state === "collapsed");

  const closeMobileNow = React.useCallback(() => {
    if (typeof sidebar?.setOpenMobile === "function") sidebar.setOpenMobile(false);
    else if (typeof sidebar?.setOpen === "function") sidebar.setOpen(false);
  }, [sidebar]);

  const handleNavigate = React.useCallback(
    (href: string, e?: React.MouseEvent) => {
      // @ts-ignore
      if (e?.metaKey || e?.ctrlKey || e?.shiftKey || e?.altKey || e?.button === 1) return;

      if (isMobile) {
        e?.preventDefault?.();
        closeMobileNow();
        router.push(href);
        return;
      }

      e?.preventDefault?.();
      router.push(href);
    },
    [router, isMobile, closeMobileNow]
  );

  /** Itens visíveis por permissão */
  const visibleGroups = React.useMemo(() => {
    return LINK_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => has(i.slug)),
    })).filter((g) => g.items.length > 0);
  }, [has]);

  /** Abre por padrão: grupo da rota atual + o próximo grupo (2 abertos) */
  const defaultOpenTwo = React.useMemo((): GroupKey[] => {
    if (!visibleGroups.length) return [];

    const idx = visibleGroups.findIndex((g) => g.items.some((i) => i.href === pathname));
    const first = (idx >= 0 ? visibleGroups[idx] : visibleGroups[0])?.category;
    const second =
      visibleGroups[(idx >= 0 ? idx + 1 : 1) % Math.max(visibleGroups.length, 1)]?.category;

    const list = [first, second].filter(Boolean) as string[];
    // garante 2 distintos (se só tiver 1 grupo)
    return Array.from(new Set(list)).slice(0, 2);
  }, [visibleGroups, pathname]);

  /** ✅ Sempre 2 abertas (desktop e mobile) */
  const [openGroups, setOpenGroups] = React.useState<GroupKey[]>(defaultOpenTwo);

  React.useEffect(() => {
    if (!isCollapsed) setOpenGroups(defaultOpenTwo);
  }, [defaultOpenTwo, isCollapsed]);

  const toggleGroup = (cat: GroupKey) => {
    setOpenGroups((prev) => {
      const isOpen = prev.includes(cat);

      // ✅ nunca deixar tudo fechado — sempre pelo menos 2 se possível
      if (isOpen) {
        const next = prev.filter((x) => x !== cat);

        // se sobrou 0 ou 1, reabre o próprio (mantém 2 abertas quando possível)
        if (next.length < 2) return prev;

        return next;
      }

      // abrir um novo: mantém no máximo 2 (tira o mais antigo)
      if (prev.length >= 2) return [prev[1], cat];
      return [...prev, cat];
    });
  };

  /** Render de item (com tooltip no colapsado) */
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
        title={title} // ✅ hover mostra nome no colapsado
        className={[
          "flex gap-3",
          active ? "bg-accent text-accent-foreground" : "",
        ].join(" ")}
      >
        <Link href={href} onClick={(e) => handleNavigate(href, e)}>
          <Icon className="!size-5" />
          {!isCollapsed && <span>{title}</span>}
        </Link>
      </SidebarMenuButton>
    );
  };

  // Loading
  if (perms == null) {
    return (
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader>
          {/* ✅ some logo quando colapsado */}
          {!isCollapsed && (
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
          )}
        </SidebarHeader>

        <SidebarContent className="px-2 overflow-hidden">
          <div className="p-3 text-sm opacity-60">Carregando…</div>
        </SidebarContent>

        <SidebarFooter>
          <NavUser user={{ name: "Usuário", email: "", avatar: "" }} />
        </SidebarFooter>
      </Sidebar>
    );
  }

  /** Dedupe itens para modo colapsado (lista única) */
  const collapsedItems = React.useMemo(() => {
    const all = visibleGroups.flatMap((g) => g.items);
    const dedup = all.filter((i, idx) => all.findIndex((x) => x.href === i.href) === idx);
    return dedup;
  }, [visibleGroups]);

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Header */}
      <SidebarHeader>
        {/* ✅ some logo quando colapsado */}
        {!isCollapsed && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
                <Link href="/" onClick={(e) => handleNavigate("/", e)}>
                  <img
                    src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1"
                    alt="Logo PAI"
                    className="h-8 w-auto"
                  />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 overflow-hidden">
        {/* ✅ COLAPSADO: só ícones, com tooltip via title */}
        {isCollapsed ? (
          <div className="space-y-2">
            <SidebarMenu className="space-y-1">
              {collapsedItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <MenuItem title={item.title} href={item.href} Icon={item.Icon} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>

            <div className="mt-2 px-1">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild title="Ajuda">
                    <Link href="/help" onClick={(e) => handleNavigate("/help", e)}>
                      <IconHelp className="!size-5" />
                      {!isCollapsed && <span>Ajuda</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </div>
          </div>
        ) : (
          // ✅ ABERTO: PC e celular igual (sanfona), sempre 2 abertas
          <div className={isMobile ? "pt-4 space-y-3" : "space-y-2"}>
            {visibleGroups.map((group) => {
              const opened = openGroups.includes(group.category);

              return (
                <div key={group.category}>
                  <button
                    onClick={() => toggleGroup(group.category)}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold uppercase opacity-70"
                    type="button"
                  >
                    <span>{group.category}</span>
                    <IconChevronDown size={16} className={`transition ${opened ? "rotate-180" : ""}`} />
                  </button>

                  {opened && (
                    <SidebarMenu className="space-y-1 pl-1">
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.href}>
                          <MenuItem title={item.title} href={item.href} Icon={item.Icon} />
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  )}
                </div>
              );
            })}

            {/* Ajuda */}
            <div className="mt-4 px-1">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/help" onClick={(e) => handleNavigate("/help", e)}>
                      <IconHelp className="!size-5" />
                      <span>Ajuda</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </div>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={{ name: "Usuário", email: "", avatar: "" }} />
      </SidebarFooter>
    </Sidebar>
  );
}