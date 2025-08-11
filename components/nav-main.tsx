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
  // tamanhos maiores por padrão
  iconClass = "size-9 lg:size-11 xl:size-12",   // ícones maiores
  textClass = "text-lg lg:text-xl xl:text-2xl", // títulos maiores
  itemClass = "gap-3",                           // mais espaço entre ícone e texto
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

            const IconComp = item.icon;

            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  className={clsx(
                    itemClass,
                    "py-3", // um pouco mais de altura para acomodar os tamanhos
                    active && "bg-muted font-semibold"
                  )}
                >
                  <Link href={item.url} aria-current={active ? "page" : undefined}>
                    {IconComp ? (
                      <IconComp className={clsx("shrink-0", iconClass)} />
                    ) : null}
                    <span className={clsx("leading-tight", textClass)}>
                      {item.title}
                    </span>
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
