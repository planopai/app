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
  // desktop menor conforme você pediu antes
  textClass = "text-base sm:text-lg lg:text-lg xl:text-lg",
  itemClass = "gap-2 sm:gap-2.5 md:gap-3 lg:gap-3.5",
  // com linha, não precisa de margem extra entre itens
  menuSpaceClass = "space-y-0",
  // controla as divisórias entre itens
  dividerClass = "divide-y divide-border",
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
  /** Classes Tailwind para as linhas divisórias (ex.: "divide-y divide-border") */
  dividerClass?: string;
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        {/* linhas divisórias entre itens */}
        <SidebarMenu className={clsx(menuSpaceClass, dividerClass)}>
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
                    // padding compacto
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
