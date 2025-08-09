"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon } from "@tabler/icons-react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        {/* Navegação principal (SEM quick create / inbox) */}
        <SidebarMenu>
          {items.map((item) => {
            const active =
              pathname === item.url ||
              (item.url !== "/" && pathname?.startsWith(item.url + "/"));

            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  className={active ? "bg-muted font-medium" : ""}
                >
                  <Link href={item.url} aria-current={active ? "page" : undefined}>
                    {item.icon ? <item.icon /> : null}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
