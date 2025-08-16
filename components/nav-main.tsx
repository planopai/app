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
  onItemClick, // ⬅️ novo prop para fechar o menu ao clicar
  iconClass = "size-9 sm:size-10 lg:size-11 xl:size-12",
  // desktop menor conforme você pediu antes
  textClass = "text-base sm:text-lg lg:text-lg xl:text-lg",
  itemClass = "gap-2 sm:gap-2.5 md:gap-3 lg:gap-3.5",
  // — só um pouquinho mais de espaço entre os itens —
  menuSpaceClass = "space-y-1 sm:space-y-1.5 md:space-y-2 lg:space-y-2 xl:space-y-2.5",
  // linhas divisórias
  dividerClass = "divide-y divide-border",
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
  onItemClick?: (e?: React.MouseEvent) => void;
  iconClass?: string;
  textClass?: string;
  itemClass?: string;
  menuSpaceClass?: string;
  dividerClass?: string;
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        {/* linhas + espaçamento sutil entre itens */}
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
                    // padding segue compacto
                    "py-2 sm:py-2.5 md:py-3 lg:py-3.5 xl:py-4",
                    active && "bg-muted font-semibold"
                  )}
                >
                  <Link
                    href={item.url}
                    aria-current={active ? "page" : undefined}
                    onClick={onItemClick} // ⬅️ dispara fechamento/colapso
                  >
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
