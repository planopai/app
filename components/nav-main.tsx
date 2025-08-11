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
  iconClass = "size-9 sm:size-10 lg:size-11 xl:size-12",
  textClass = "text-base sm:text-lg lg:text-xl",
  // menos espaço entre ícone e texto
  itemClass = "gap-2 sm:gap-2.5 md:gap-3 lg:gap-3.5",
  // itens mais próximos (ainda com respiro), responsivo
  menuSpaceClass = "space-y-2 sm:space-y-2.5 md:space-y-3 lg:space-y-3.5 xl:space-y-4",
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
  iconClass?: string;
  textClass?: string;
  itemClass?: string;
  menuSpaceClass?: string;
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu className={menuSpaceClass}>
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
                    // padding vertical um pouco menor
                    "py-2 sm:py-2.5 md:py-3 lg:py-3.5 xl:py-4",
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
