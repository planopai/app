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
  // ícones mantidos grandes
  iconClass = "size-9 sm:size-10 lg:size-11 xl:size-12",
  // títulos um pouco maiores que antes
  textClass = "text-base sm:text-lg lg:text-xl",
  // um pouco menos de espaço entre ícone e texto
  itemClass = "gap-2.5 sm:gap-3 md:gap-3.5 lg:gap-4",
  // itens mais próximos (mas ainda com respiro), responsivo
  menuSpaceClass = "space-y-2.5 sm:space-y-3 md:space-y-4 lg:space-y-5 xl:space-y-6",
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
                    // padding vertical levemente menor para “juntar” um pouco
                    "py-2.5 sm:py-3 md:py-3.5 lg:py-4 xl:py-5",
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
