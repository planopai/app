"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon } from "@tabler/icons-react";
import clsx from "clsx";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
  iconClass = "size-7 lg:size-8",     // <— ajuste aqui o tamanho padrão dos ícones
  textClass = "text-sm lg:text-base",   // <— ajuste aqui o tamanho padrão dos títulos
  itemClass = "gap-2",                   // espaçamento entre ícone/texto
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
  iconClass?: string;
  textClass?: string;
  itemClass?: string;
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active =
              pathname === item.url ||
              (item.url !== "/" && pathname?.startsWith(item.url + "/"));

            const Icon = item.icon;

            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  className={clsx(
                    itemClass,
                    active && "bg-muted font-medium"
                  )}
                >
                  <Link href={item.url} aria-current={active ? "page" : undefined}>
                    {Icon ? <Icon className={clsx("shrink-0", iconClass)} /> : null}
                    <span className={textClass}>{item.title}</span>
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
