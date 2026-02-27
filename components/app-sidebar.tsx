"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  IconChevronDown,
  IconHelp,
  IconLogout,
} from "@tabler/icons-react";

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

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const v = document.cookie
    ?.split("; ")
    .find((r) => r.startsWith(name + "="))
    ?.split("=")[1];
  return v ? decodeURIComponent(v) : null;
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

      e?.preventDefault?.();

      if (isMobile) {
        closeMobileNow();
        router.push(href);
        return;
      }

      router.push(href);
    },
    [router, isMobile, closeMobileNow]
  );

  async function handleLogout(e?: React.MouseEvent) {
    e?.preventDefault?.();
    try {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    } catch {
      // silencioso
    } finally {
      if (isMobile) closeMobileNow();
      router.replace("/login");
    }
  }

  /** Nome do usuário (cookie ou fallback) */
  const displayName = React.useMemo(() => {
    return readCookie("pai_name") || readCookie("pai_user") || "Usuário";
  }, []);

  /** Itens visíveis por permissão */
  const visibleGroups = React.useMemo(() => {
    return LINK_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => has(i.slug)),
    })).filter((g) => g.items.length > 0);
  }, [has]);

  /** Abre por padrão: grupo da rota atual, senão primeiro */
  const defaultOpenOne = React.useMemo((): GroupKey | null => {
    if (!visibleGroups.length) return null;
    const found = visibleGroups.find((g) => g.items.some((i) => i.href === pathname))?.category;
    return found ?? visibleGroups[0]?.category ?? null;
  }, [visibleGroups, pathname]);

  /** ✅ Sempre 1 aberto (nunca tudo fechado) */
  const [openGroup, setOpenGroup] = React.useState<GroupKey | null>(defaultOpenOne);

  React.useEffect(() => {
    if (!isCollapsed) setOpenGroup(defaultOpenOne);
  }, [defaultOpenOne, isCollapsed]);

  const toggleGroup = (cat: GroupKey) => {
    setOpenGroup((prev) => {
      // se clicar no mesmo, mantém (não fecha tudo)
      if (prev === cat) return prev;
      return cat;
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
        title={title} // ✅ tooltip quando colapsado
        className={["flex gap-3", active ? "bg-accent text-accent-foreground" : ""].join(" ")}
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
          {!isCollapsed && (
            <div className="px-3 pt-2">
              <img
                src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1"
                alt="Logo PAI"
                className="h-8 w-auto"
              />
              <div className="mt-3 border-t" />
              <div className="py-3 text-sm font-semibold opacity-80">Carregando…</div>
            </div>
          )}
        </SidebarHeader>

        <SidebarContent className="px-2 overflow-hidden">
          <div className="p-3 text-sm opacity-60">Carregando…</div>
        </SidebarContent>

        <SidebarFooter />
      </Sidebar>
    );
  }

  /** Dedupe itens para modo colapsado (lista única) */
  const collapsedItems = React.useMemo(() => {
    const all = visibleGroups.flatMap((g) => g.items);
    return all.filter((i, idx) => all.findIndex((x) => x.href === i.href) === idx);
  }, [visibleGroups]);

  const logoNode = (
    <img
      src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1"
      alt="Logo PAI"
      className="h-8 w-auto"
    />
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* HEADER: Logo + linha + nome */}
      <SidebarHeader>
        <div className={["px-3", isMobile ? "pt-6" : "pt-2"].join(" ")}>
          {/* ✅ some a logo quando colapsado */}
          {!isCollapsed && (
            <Link href="/" onClick={(e) => handleNavigate("/", e)} className="inline-flex">
              {logoNode}
            </Link>
          )}

          {!isCollapsed && <div className="mt-3 border-t" />}

          {/* ✅ nome em cima (sem dropdown) */}
          {!isCollapsed && (
            <div className="py-3">
              <div className="truncate text-sm font-semibold">{displayName}</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 overflow-hidden">
        {/* ✅ COLAPSADO: só ícones, sem categorias */}
        {isCollapsed ? (
          <div className="space-y-2 pt-2">
            <SidebarMenu className="space-y-1">
              {collapsedItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <MenuItem title={item.title} href={item.href} Icon={item.Icon} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        ) : (
          // ✅ ABERTO: PC e celular iguais (sanfona), sempre 1 aberto
          <div className={isMobile ? "pt-4 space-y-3" : "space-y-2"}>
            {visibleGroups.map((group) => {
              const opened = openGroup === group.category;

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
          </div>
        )}
      </SidebarContent>

      {/* FOOTER FIXO: Ajuda + Sair (sem 3 pontinhos) */}
      <SidebarFooter>
        <div className="px-2 pb-4">
          <div className="border-t pt-3" />

          <SidebarMenu className="space-y-1">
            <SidebarMenuItem>
              <SidebarMenuButton asChild title="Ajuda" className="flex gap-3">
                <Link href="/help" onClick={(e) => handleNavigate("/help", e)}>
                  <IconHelp className="!size-5" />
                  {!isCollapsed && <span>Ajuda</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                title="Sair da Conta"
                className="flex gap-3 text-red-600 hover:text-red-600"
                onClick={handleLogout}
              >
                <IconLogout className="!size-5" />
                {!isCollapsed && <span>Sair da Conta</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}