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
  // ícones permanecem grandes (pode ajustar se quiser)
  iconClass = "size-9 sm:size-10 lg:size-11 xl:size-12",
  // títulos menores
  textClass = "text-sm sm:text-base lg:text-lg",
  // mais espaço entre ícone e texto
  itemClass = "gap-3 sm:gap-3.5 md:gap-4 lg:gap-5",
  // MUITO mais espaço vertical entre os itens
  menuSpaceClass = "space-y-3 sm:space-y-4 md:space-y-5 lg:space-y-6 xl:space-y-7",
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
        {/* espaçamento vertical responsivo entre os itens */}
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
                    // mais altura para não “colar” visualmente
                    "py-3 sm:py-3.5 md:py-4 lg:py-5 xl:py-6",
                    active && "bg-muted font-semibold"
                  )}
                >
                  <Link href={item.url} aria-current={active ? "page" : undefined}>
                    {IconComp ? (
                      <IconComp className={clsx("shrink-0", iconClass)} />
                    ) : null}
                    <span className={clsx("leading-snug", textClass)}>
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
