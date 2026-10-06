"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
  IconHelp,
  IconLogout,
} from "@tabler/icons-react";

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
import { MODULOS, hrefDoItem, itensVisiveis, moduloVisivel } from "@/components/shell/modulos";
import { useContadores } from "@/components/shell/useContadores";
import { clearOfflineContextOnLogout } from "@/lib/offline/logout";
import { IconeAtalho, useBarra } from "@/components/barra/atalhos";
import { useNaoLidas } from "@/components/messenger/ContadorMenu";

/** Número de não lidas ao lado do item (aberto) ou bolinha no ícone (recolhido). */
function ContadorItem({ valor, recolhido }: { valor: number; recolhido: boolean }) {
  if (!valor) return null;
  const texto = valor > 99 ? "99+" : String(valor);
  if (recolhido) {
    return (
      <span
        className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#F2CB3F]"
        aria-label={`${texto} pendente(s)`}
      />
    );
  }
  return (
    <span
      className="ml-auto inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-[#F2CB3F] px-2 text-[12px] font-extrabold tabular-nums text-[#313C55]"
      aria-label={`${texto} pendente(s)`}
    >
      {texto}
    </span>
  );
}

/** Celular/tablet (abaixo de 1024 px): menu em gaveta e barra de baixo. Mesmo ponto de quebra do hooks/use-mobile e da BarraCelular. */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");

    const update = () => {
      setIsMobile(mq.matches);
    };

    update();

    mq.addEventListener?.("change", update);

    return () => {
      mq.removeEventListener?.("change", update);
    };
  }, []);

  return isMobile;
}

function readCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const value = document.cookie
    ?.split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];

  return value
    ? decodeURIComponent(value)
    : null;
}

function capitalizeFirstLetter(value: string) {
  const text = (value || "").trim();

  if (!text) {
    return "";
  }

  return (
    text.charAt(0).toUpperCase() +
    text.slice(1)
  );
}

function initialsFromName(name: string) {
  const value = (name || "").trim();

  if (!value) {
    return "U";
  }

  const parts = value
    .split(/\s+/)
    .filter(Boolean);

  const first =
    parts[0]?.[0] ?? "U";

  const second =
    parts.length > 1
      ? parts[parts.length - 1]?.[0]
      : "";

  return (
    first + second
  ).toUpperCase();
}

type GroupKey = string;

/* Cores do menu (mockup da repaginada): fundo azul escuro (--sidebar), item ativo com faixa amarela à esquerda. */
const ITEM_BASE =
  "relative flex min-h-10 gap-3 rounded-xl px-3 text-[15px] font-semibold text-[#E8ECF4] hover:bg-white/[0.08] hover:text-white";
const ITEM_ATIVO =
  "bg-white/[0.14] font-extrabold text-white shadow-[inset_4px_0_0_#F2CB3F] hover:bg-white/[0.14]";

export function AppSidebar(
  props: React.ComponentProps<typeof Sidebar>
) {
  const router = useRouter();
  const pathname = usePathname();
  const sidebar = useSidebar() as any;

  const { perms, has } = usePerms();
  const carregando = perms == null;

  const isMobile = useIsMobile();

  /* Barra personalizável (atalhos do computador) e contador do Messenger */
  const barra = useBarra();
  const temMessenger = perms !== null && has("messenger");
  const naoLidasMessenger = useNaoLidas(temMessenger);
  const contMessenger = naoLidasMessenger.total + naoLidasMessenger.fila;
  const numeros = useContadores(perms, has);
  const contadorDe = (href: string) => {
    if (href === "/messenger") return contMessenger;
    if (href === "/acompanhamento") return numeros.aguardando ?? 0;
    if (href === "/avisos") return numeros.avisos ?? 0;
    if (href === "/coroa-de-flores") return numeros.coroas ?? 0;
    if (href === "/estoque" || href === "/geral") return numeros.estoque ?? 0;
    return 0;
  };

  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const closeMobileNow = React.useCallback(() => {
    if (typeof sidebar?.setOpenMobile === "function") {
      sidebar.setOpenMobile(false);
    }
  }, [sidebar]);

  const handleNavigate = React.useCallback(
    (href: string, e?: React.MouseEvent) => {
      // Mantém comportamento normal para abrir em nova aba/janela.
      if (e?.metaKey || e?.ctrlKey || e?.shiftKey || e?.altKey || e?.button === 1) {
        return;
      }
      e?.preventDefault?.();
      if (isMobile) {
        closeMobileNow();
      }
      router.push(href);
    },
    [router, isMobile, closeMobileNow]
  );

  const handleLogout = React.useCallback(
    async (e?: React.MouseEvent) => {
      e?.preventDefault?.();
      if (isLoggingOut) {
        return;
      }
      setIsLoggingOut(true);
      try {
        /*
         * 1. Remove o contexto offline ativo antes de trocar de usuário
         *    (identidade offline, HTML/RSC autenticado do CacheStorage, snapshot legado qa_registros,
         *    fila antiga acomp_offline_queue_v1 → quarentena). Os dados user-scoped do IndexedDB ficam com o usuário certo.
         */
        try {
          await clearOfflineContextOnLogout();
        } catch (error) {
          console.error("[Logout] Falha ao limpar contexto offline:", error);
        }
        /*
         * 2. Encerra a sessão no servidor. Sem internet a chamada pode falhar; o contexto local já foi removido.
         */
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { Accept: "application/json" },
          });
        } catch (error) {
          console.warn("[Logout] Não foi possível confirmar o logout no servidor:", error);
        }
      } finally {
        if (isMobile) {
          closeMobileNow();
        }
        /* Vai para o login mesmo sem rede; /login não faz parte do cache autenticado offline. */
        router.replace("/login");
        setIsLoggingOut(false);
      }
    },
    [isLoggingOut, isMobile, closeMobileNow, router]
  );

  /**
   * Nome do usuário.
   * O primeiro render precisa ser idêntico no servidor e no navegador (evita hydration mismatch, React #418):
   * começa com "Usuário" e só lê document.cookie depois de montar.
   */
  const [displayName, setDisplayName] = React.useState("Usuário");

  React.useEffect(() => {
    const raw = readCookie("pai_name") || readCookie("pai_user") || "Usuário";
    const cleaned = raw.trim().replace(/\s+/g, " ");
    const formatted = cleaned
      .split(" ")
      .map((word, index) => (index === 0 ? capitalizeFirstLetter(word) : word))
      .join(" ");
    setDisplayName(formatted);
  }, []);

  const userInitials = React.useMemo(() => initialsFromName(displayName).slice(0, 1), [displayName]);

  /** Módulos do organograma, só com as telas que o usuário pode abrir (mesmas chaves de página de antes). */
  const visibleGroups = React.useMemo(() => {
    if (carregando) return [];
    return MODULOS
      .filter((modulo) => moduloVisivel(modulo, has))
      .map((modulo) => ({
        category: modulo.titulo,
        items: itensVisiveis(modulo, has).map((item) => ({
          title: item.titulo,
          href: hrefDoItem(item, has),
          slug: item.slugs[0],
          Icon: item.icone as any,
        })),
      }))
      .filter((group) => group.items.length > 0);
  }, [has, carregando]);

  /** Abre por padrão o grupo da rota atual, senão o primeiro. */
  const defaultOpenOne = React.useMemo((): GroupKey | null => {
    if (!visibleGroups.length) {
      return null;
    }
    const found = visibleGroups.find((group) => group.items.some((item) => item.href === pathname))?.category;
    return found ?? visibleGroups[0]?.category ?? null;
  }, [visibleGroups, pathname]);

  /**
   * Módulos expandem e recolhem (definição de 06/10/2026): um aberto por vez;
   * clicar no módulo aberto recolhe; ao trocar de tela abre o módulo dela.
   */
  const [openGroup, setOpenGroup] = React.useState<GroupKey | null>(defaultOpenOne);

  React.useEffect(() => {
    setOpenGroup(defaultOpenOne);
  }, [defaultOpenOne]);

  const toggleGroup = (category: GroupKey) => setOpenGroup((atual) => (atual === category ? null : category));

  /*
   * ATALHOS: barra personalizada do computador (Personalizar barra).
   * No celular a barra fica embaixo (BarraCelular), então aqui só aparece fora do modo gaveta.
   */
  const mostrarAtalhos = !sidebar?.isMobile && !carregando;
  const atalhos = mostrarAtalhos
    ? barra.computador.itens
        .filter((a) => barra.carregada || !a.pagina || has(a.pagina))
        .map((a) => ({
          title: a.rotulo,
          href: a.rota,
          Icon: (p: { className?: string }) => <IconeAtalho id={a.id} className={p.className} />,
        }))
    : [];

  /** Item do menu (ativo = faixa amarela à esquerda). */
  const MenuItem = ({ title, href, Icon, badge = 0 }: { title: string; href: string; Icon: any; badge?: number }) => {
    const active = pathname === href;
    return (
      <SidebarMenuButton asChild title={title} className={[ITEM_BASE, active ? ITEM_ATIVO : ""].join(" ")}>
        <Link href={href} aria-current={active ? "page" : undefined} onClick={(event) => handleNavigate(href, event)}>
          <Icon className="!size-5" />
          <span className="flex-1 truncate">{title}</span>
          <ContadorItem valor={badge} recolhido={false} />
        </Link>
      </SidebarMenuButton>
    );
  };

  return (
    /*
     * Barra fixa (definição de 06/10/2026): no computador não recolhe (o AppShell mantém open=true).
     * No celular/tablet (< 1024 px) o Menu da barra de baixo abre o menu em tela inteira e o mesmo botão recolhe.
     * As cores são sempre as do menu azul (#313C55 no claro, #232B3F no escuro), nos dois temas.
     */
    <Sidebar collapsible="offcanvas" data-pai-menu {...props}>
      {/*
        LOGO: cápsula branca encostada na esquerda, nos DOIS temas (definição de 06/10/2026).
        Usa bg-[#FFFFFF] e não bg-white: o globals.css troca .bg-white pela cor do cartão no tema escuro.
      */}
      <SidebarHeader className={isMobile ? "pt-[calc(1.5rem+env(safe-area-inset-top))]" : "pt-5"}>
        <Link
          href="/"
          onClick={(event) => handleNavigate("/", event)}
          aria-label="Plano PAI — Início"
          data-pai-logo-capsula
          className="-ml-2 flex h-[68px] w-[188px] shrink-0 items-center rounded-r-[34px] bg-[#FFFFFF] pl-6"
        >
          <img src="/logo-pai-horizontal.svg" alt="Plano PAI" className="h-10 w-auto" />
        </Link>
      </SidebarHeader>

      {/* Rolagem discreta (fina) quando o menu não cabe na tela */}
      <SidebarContent className="pai-menu-rolagem overflow-y-auto px-2">
        {carregando ? (
          <div className="p-3 text-sm text-[#AEB9CF]">Carregando…</div>
        ) : (
          <div className={isMobile ? "space-y-3 pt-3" : "space-y-2 pt-2"}>
            {atalhos.length > 0 && (
              <div>
                <div className="flex w-full items-center px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#AEB9CF]">
                  Atalhos
                </div>
                <SidebarMenu className="space-y-0.5">
                  {atalhos.map((item) => (
                    <SidebarMenuItem key={`atalho-${item.href}`}>
                      <MenuItem title={item.title} href={item.href} Icon={item.Icon} badge={contadorDe(item.href)} />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
                <div className="mx-3 mt-2 border-t border-white/[0.18]" />
              </div>
            )}

            {visibleGroups.map((group) => {
              const opened = openGroup === group.category;
              return (
                <div key={group.category}>
                  <button
                    onClick={() => toggleGroup(group.category)}
                    className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#AEB9CF] hover:text-white"
                    type="button"
                    aria-expanded={opened}
                  >
                    <span>{group.category}</span>
                    <IconChevronDown size={16} className={`transition ${opened ? "rotate-180" : ""}`} />
                  </button>

                  {opened && (
                    <SidebarMenu className="space-y-0.5">
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.href}>
                          <MenuItem title={item.title} href={item.href} Icon={item.Icon} badge={contadorDe(item.href)} />
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SidebarContent>

      {/* RODAPÉ FIXO: usuário, Personalizar barra, Ajuda e Sair da conta */}
      <SidebarFooter>
        <div className="border-t border-white/[0.18] px-2 pb-4 pt-2.5">
          <div className="flex items-center gap-3 px-3 py-1.5">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#00AEEC] text-[15px] font-extrabold text-[#313C55]"
              aria-hidden="true"
            >
              {carregando ? "U" : userInitials}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#AEB9CF]">Usuário</div>
              <div className="truncate text-[15px] font-extrabold text-white">{carregando ? "Carregando…" : displayName}</div>
            </div>
          </div>

          <SidebarMenu className="mt-1 space-y-0.5">
            <SidebarMenuItem>
              <MenuItem title="Personalizar barra" href="/personalizar-barra" Icon={IconAdjustmentsHorizontal} />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <MenuItem title="Ajuda" href="/help" Icon={IconHelp} />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                title={isLoggingOut ? "Saindo..." : "Sair da conta"}
                className={ITEM_BASE}
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-busy={isLoggingOut}
              >
                <IconLogout className="!size-5" />
                <span>{isLoggingOut ? "Saindo..." : "Sair da conta"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
