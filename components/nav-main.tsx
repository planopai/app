"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon } from "@tabler/icons-react";
import { IconChevronDown } from "@tabler/icons-react";
import clsx from "clsx";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  url: string;
  icon?: Icon;
  /** Mostra o caret à direita (para itens com submenu) */
  withCaret?: boolean;
};

export function NavMain({
  items,
  // tamanhos
  iconClass = "size-7 sm:size-8 lg:size-8",
  textClass = "text-sm sm:text-base lg:text-base",
  // espaçamento entre ícone e texto
  itemGapClass = "gap-2.5 sm:gap-3",
  // espaçamento entre itens (mantém as divisórias visuais do print)
  menuSpaceClass = "space-y-1 sm:space-y-1.5",
  // linhas divisórias suaves
  dividerClass = "divide-y divide-white/10",
  // cores (ajuste pra combinar com seu tema)
  activeTextClass = "text-sky-800",
  inactiveTextClass = "text-white/90 hover:text-white",
  activeIconClass = "text-sky-700",
  inactiveIconClass = "text-white/90 group-hover:text-white",
  // geometria do “pill” (o fundo branco do item ativo)
  pillClass = "before:content-[''] before:absolute before:inset-y-1 before:left-2 before:right-2 before:rounded-full before:transition-all before:duration-200",
}: {
  items: NavItem[];
  iconClass?: string;
  textClass?: string;
  itemGapClass?: string;
  menuSpaceClass?: string;
  dividerClass?: string;
  activeTextClass?: string;
  inactiveTextClass?: string;
  activeIconClass?: string;
  inactiveIconClass?: string;
  pillClass?: string;
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        {/* linhas divisórias + pequeno espaço vertical, como no exemplo */}
        <SidebarMenu className={clsx(menuSpaceClass, dividerClass)}>
          {items.map((item) => {
            const active =
              pathname === item.url ||
              (item.url !== "/" && pathname?.startsWith(item.url + "/"));

            const IconComp = item.icon;

            // classes do link em estilo "pill"
            const linkClasses = clsx(
              // layout
              "relative isolate group flex w-full items-center",
              "px-3 sm:px-4",                            // recuo horizontal
              "py-2 sm:py-2.5 md:py-3 lg:py-3.5",        // altura confortável
              itemGapClass,
              // aparência base
              "rounded-full transition-colors",
              pillClass,
              // fundo do pill (ativo = branco)
              active ? "before:bg-white before:shadow-sm" : "before:bg-transparent",
              // cor do conteúdo
              active ? activeTextClass : inactiveTextClass,
              // acessibilidade
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            );

            const iconClasses = clsx(
              "relative z-10 shrink-0",
              iconClass,
              active ? activeIconClass : inactiveIconClass
            );

            const textClasses = clsx("relative z-10 leading-tight", textClass);

            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild tooltip={item.title} className="p-0 bg-transparent">
                  <Link
                    href={item.url}
                    aria-current={active ? "page" : undefined}
                    className={linkClasses}
                  >
                    {IconComp ? <IconComp className={iconClasses} /> : null}
                    <span className={textClasses}>{item.title}</span>

                    {item.withCaret ? (
                      <IconChevronDown
                        className={clsx(
                          "ml-auto relative z-10 size-4 sm:size-4.5",
                          active ? activeIconClass : inactiveIconClass
                        )}
                      />
                    ) : null}
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
