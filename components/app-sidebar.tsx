"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconHelp } from "@tabler/icons-react";

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

import { NavUser } from "@/components/nav-user";
import { usePerms } from "@/app/_perms/PermsProvider";
import { LINK_GROUPS } from "@/app/_perms/links";

export function AppSidebar(props: any) {
  const router = useRouter();
  const sidebar = useSidebar() as any;
  const { perms, has } = usePerms();

  const [openGroup, setOpenGroup] = React.useState<string | null>(
    LINK_GROUPS[0].category
  );

  const toggle = (cat: string) =>
    setOpenGroup(openGroup === cat ? null : cat);

  const navigate = (href: string) => {
    sidebar?.setOpenMobile?.(false);
    router.push(href);
  };

  if (perms == null) return null;

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* LOGO */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/">
                <img
                  src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1"
                  className="h-8"
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ACCORDION */}
      <SidebarContent className="px-2 space-y-2 overflow-hidden">
        {LINK_GROUPS.map(group => {
          const visibleItems = group.items.filter(i => has(i.slug));
          if (!visibleItems.length) return null;

          const opened = openGroup === group.category;

          return (
            <div key={group.category}>
              {/* CATEGORY */}
              <button
                onClick={() => toggle(group.category)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold uppercase opacity-70"
              >
                {group.category}
                <IconChevronDown
                  size={16}
                  className={`transition ${opened ? "rotate-180" : ""}`}
                />
              </button>

              {/* ITEMS */}
              {opened && (
                <div className="space-y-1 pl-2">
                  {visibleItems.map(item => (
                    <SidebarMenuButton
                      key={item.href}
                      onClick={() => navigate(item.href)}
                      className="flex gap-3"
                    >
                      <item.Icon size={18} />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* HELP */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/help">
                <IconHelp size={18} />
                <span>Ajuda</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={{ name: "Usuário", email: "", avatar: "" }} />
      </SidebarFooter>
    </Sidebar>
  );
}