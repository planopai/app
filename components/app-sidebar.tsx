"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { IconHelp, IconLogout } from "@tabler/icons-react";

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

import { usePerms } from "@/app/_perms/PermsProvider";
import { LINKS } from "@/app/_perms/links";

/**
 * Ajuste aqui (recomendado):
 * - Preferível: adicionar `section: "ATENDIMENTO" | "ASSOCIADOS" | "ADMINISTRAÇÃO"` em cada item do LINKS.
 * - Fallback abaixo tenta inferir por slug.
 */
const SECTION_ORDER = ["ATENDIMENTO", "ASSOCIADOS", "ADMINISTRAÇÃO", "OUTROS"] as const;
type SectionKey = (typeof SECTION_ORDER)[number];

function inferSection(slug: string): SectionKey {
  const s = slug.toLowerCase();
  if (["acompanhamento", "memorial", "obituario", "obituário"].some(k => s.includes(k))) return "ATENDIMENTO";
  if (["leads", "associado", "associados"].some(k => s.includes(k))) return "ASSOCIADOS";
  if (["relatorio", "relatório", "estoque", "administrativo", "admin"].some(k => s.includes(k))) return "ADMINISTRAÇÃO";
  return "OUTROS";
}

function getInitials(name?: string) {
  const n = (name || "").trim();
  if (!n) return "U";
  const parts = n.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "U";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (first + last).toUpperCase();
}

function Divider() {
  return <div className="my-3 h-px bg-border/60" />;
}

function Section({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: Array<{ title: string; url: string; icon?: React.ComponentType<any> }>;
  pathname: string;
  onNavigate: (href: string, e?: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  if (!items.length) return null;

  return (
    <div className="px-2">
      <div className="px-2 pt-2 text-[11px] font-medium tracking-wider text-muted-foreground">
        {title}
      </div>

      <SidebarMenu className="mt-1">
        {items.map((item) => {
          const Icon = item.icon as any;
          const active =
            pathname === item.url ||
            (item.url !== "/" && pathname?.startsWith(item.url + "/"));

          return (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                className={[
                  "rounded-xl px-3 py-2",
                  "data-[slot=sidebar-menu-button]:gap-3",
                  "hover:bg-muted/60",
                  "transition-colors",
                  active ? "bg-muted font-medium" : "font-normal",
                ].join(" ")}
              >
                <Link href={item.url} onClick={(e) => onNavigate(item.url, e)}>
                  {Icon ? <Icon className="!size-5 opacity-90" /> : null}
                  <span className="text-[14px]">{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </div>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const pathname = usePathname();
  const sidebar = useSidebar() as any;
  const { perms, has } = usePerms();

  // 🔁 Troque aqui pelos dados reais do usuário, se você tiver no contexto.
  const user = React.useMemo(
    () => ({ name: "Tharles", email: "", avatar: "" }),
    []
  );

  const closeMobileNow = React.useCallback(() => {
    if (typeof sidebar?.setOpenMobile === "function") sidebar.setOpenMobile(false);
    else if (typeof sidebar?.setOpen === "function") sidebar.setOpen(false);
  }, [sidebar]);

  const handleNavigateMobile = React.useCallback(
    (href: string, e?: React.MouseEvent<HTMLAnchorElement>) => {
      if (e?.metaKey || e?.ctrlKey || e?.shiftKey || e?.altKey || e?.button === 1) return;

      const isMobile: boolean =
        !!sidebar?.isMobile ||
        (typeof window !== "undefined" && window.matchMedia?.("(max-width: 1024px)")?.matches) ||
        false;

      if (isMobile) {
        e?.preventDefault();
        closeMobileNow();
        router.push(href);
      }
    },
    [router, sidebar?.isMobile, closeMobileNow]
  );

  if (perms == null) {
    return (
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader className="border-b border-border/60">
          <div className="flex items-center gap-3 px-3 py-3">
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
              {getInitials(user?.name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.name || "Usuário"}</div>
              <div className="truncate text-xs text-muted-foreground opacity-80">Carregando…</div>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <div className="p-3 text-sm text-muted-foreground">Carregando…</div>
        </SidebarContent>

        <SidebarFooter className="border-t border-border/60">
          <div className="p-3 text-xs text-muted-foreground">PAI</div>
        </SidebarFooter>
      </Sidebar>
    );
  }

  const visible = LINKS.filter((l) => has(l.slug));

  // ✅ Monta itens (e tenta respeitar l.section se existir)
  const grouped = visible.reduce<Record<SectionKey, any[]>>(
    (acc, l: any) => {
      const section = (l.section as SectionKey) || inferSection(l.slug);
      const item = { title: l.label, url: l.href, icon: l.Icon };
      (acc[section] ||= []).push(item);
      return acc;
    },
    { ATENDIMENTO: [], ASSOCIADOS: [], ADMINISTRAÇÃO: [], OUTROS: [] }
  );

  // (Opcional) ordenação por label dentro da seção
  for (const k of Object.keys(grouped) as SectionKey[]) {
    grouped[k].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Topo: usuário (como na imagem) */}
      <SidebarHeader className="border-b border-border/60">
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
            {getInitials(user?.name)}
          </div>

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{user?.name || "Usuário"}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email || " "}</div>
          </div>
        </div>

        {/* Logo pequena opcional (se quiser como “marca” no topo) */}
        <div className="px-3 pb-3">
          <Link
            href="/"
            onClick={(e) => handleNavigateMobile("/", e)}
            className="inline-flex items-center rounded-lg px-2 py-1 hover:bg-muted/50 transition-colors"
          >
            <img
              src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1"
              alt="Logo PAI"
              className="h-7 w-auto"
            />
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="pb-2">
        <Section
          title="ATENDIMENTO"
          items={grouped.ATENDIMENTO}
          pathname={pathname}
          onNavigate={handleNavigateMobile}
        />
        {grouped.ATENDIMENTO.length ? <Divider /> : null}

        <Section
          title="ASSOCIADOS"
          items={grouped.ASSOCIADOS}
          pathname={pathname}
          onNavigate={handleNavigateMobile}
        />
        {grouped.ASSOCIADOS.length ? <Divider /> : null}

        <Section
          title="ADMINISTRAÇÃO"
          items={grouped["ADMINISTRAÇÃO"]}
          pathname={pathname}
          onNavigate={handleNavigateMobile}
        />
        {grouped["ADMINISTRAÇÃO"].length ? <Divider /> : null}

        <Section
          title="OUTROS"
          items={grouped.OUTROS}
          pathname={pathname}
          onNavigate={handleNavigateMobile}
        />

        {/* Ações finais fixadas no fundo (Ajuda / Sair) */}
        <div className="mt-auto px-2 pb-2">
          <Divider />

          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="rounded-xl px-3 py-2 hover:bg-muted/60 transition-colors"
              >
                <Link href="/help" onClick={(e) => handleNavigateMobile("/help", e)}>
                  <IconHelp className="!size-5 opacity-90" />
                  <span className="text-[14px]">Ajuda</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="rounded-xl px-3 py-2 hover:bg-muted/60 transition-colors text-red-600 hover:text-red-600"
              >
                <Link href="/logout" onClick={(e) => handleNavigateMobile("/logout", e)}>
                  <IconLogout className="!size-5 opacity-90" />
                  <span className="text-[14px]">Sair da Conta</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>

      {/* Se você quiser remover o footer para ficar igual à imagem, pode deixar vazio ou tirar */}
      <SidebarFooter className="hidden" />
    </Sidebar>
  );
}