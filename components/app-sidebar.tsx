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
import { MODULOS, destinoDoModulo, hrefDoItem, itensVisiveis, moduloVisivel } from "@/components/shell/modulos";
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
        className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-primary"
        aria-label={`${texto} pendente(s)`}
      />
    );
  }
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-black tabular-nums text-primary-foreground"
      aria-label={`${texto} pendente(s)`}
    >
      {texto}
    </span>
  );
}

/** Detecta mobile (<= 1024px) */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");

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

export function AppSidebar(
  props: React.ComponentProps<typeof Sidebar>
) {
  const router = useRouter();
  const pathname = usePathname();
  const sidebar = useSidebar() as any;

  const { perms, has } = usePerms();

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

  const [isLoggingOut, setIsLoggingOut] =
    React.useState(false);

  const isCollapsed = Boolean(
    sidebar?.state === "collapsed"
  );

  const closeMobileNow =
    React.useCallback(() => {
      if (
        typeof sidebar?.setOpenMobile ===
        "function"
      ) {
        sidebar.setOpenMobile(false);
        return;
      }

      if (
        typeof sidebar?.setOpen ===
        "function"
      ) {
        sidebar.setOpen(false);
      }
    }, [sidebar]);

  const handleNavigate =
    React.useCallback(
      (
        href: string,
        e?: React.MouseEvent
      ) => {
        // Mantém comportamento normal para abrir em nova aba/janela.
        // @ts-ignore
        if (
          e?.metaKey ||
          e?.ctrlKey ||
          e?.shiftKey ||
          e?.altKey ||
          e?.button === 1
        ) {
          return;
        }

        e?.preventDefault?.();

        if (isMobile) {
          closeMobileNow();
        }

        router.push(href);
      },
      [
        router,
        isMobile,
        closeMobileNow,
      ]
    );

  const handleLogout =
    React.useCallback(
      async (
        e?: React.MouseEvent
      ) => {
        e?.preventDefault?.();

        if (isLoggingOut) {
          return;
        }

        setIsLoggingOut(true);

        try {
          /*
           * 1. Remove o contexto offline ativo antes de trocar de usuário.
           *
           * Isso limpa:
           * - identidade offline ativa;
           * - HTML/RSC autenticado do CacheStorage;
           * - snapshot legado qa_registros;
           * - fila antiga acomp_offline_queue_v1,
           *   movendo-a para quarentena quando existir.
           *
           * Os dados modernos user-scoped no IndexedDB
           * permanecem vinculados ao usuário correto.
           */
          try {
            await clearOfflineContextOnLogout();
          } catch (error) {
            console.error(
              "[Logout] Falha ao limpar contexto offline:",
              error
            );
          }

          /*
           * 2. Encerra a sessão normal no servidor.
           *
           * Se o aparelho estiver sem internet, a chamada pode falhar.
           * Mesmo assim o contexto local já foi removido, evitando que
           * outro usuário veja os dados/caches autenticados anteriores.
           */
          try {
            await fetch(
              "/api/auth/logout",
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: {
                  Accept:
                    "application/json",
                },
              }
            );
          } catch (error) {
            console.warn(
              "[Logout] Não foi possível confirmar o logout no servidor:",
              error
            );
          }
        } finally {
          if (isMobile) {
            closeMobileNow();
          }

          /*
           * Navega para a tela de login mesmo se a rede estiver indisponível.
           * /login não deve fazer parte do cache autenticado offline.
           */
          router.replace("/login");

          setIsLoggingOut(false);
        }
      },
      [
        isLoggingOut,
        isMobile,
        closeMobileNow,
        router,
      ]
    );

  /**
   * Nome do usuário.
   *
   * IMPORTANTE:
   * o primeiro render precisa ser idêntico no servidor e no navegador
   * para evitar hydration mismatch (React #418).
   *
   * Por isso começamos sempre com "Usuário" e só lemos document.cookie
   * depois que o componente já montou no cliente.
   */
  const [displayName, setDisplayName] =
    React.useState("Usuário");

  React.useEffect(() => {
    const raw =
      readCookie("pai_name") ||
      readCookie("pai_user") ||
      "Usuário";

    const cleaned = raw
      .trim()
      .replace(/\s+/g, " ");

    const formatted = cleaned
      .split(" ")
      .map((word, index) =>
        index === 0
          ? capitalizeFirstLetter(word)
          : word
      )
      .join(" ");

    setDisplayName(formatted);
  }, []);

  const badgeText = "USUÁRIO";

  const userInitials =
    React.useMemo(
      () =>
        initialsFromName(
          displayName
        ),
      [displayName]
    );

  /** Módulos do organograma, só com as telas que o usuário pode abrir (mesmas chaves de página de antes). */
  const visibleGroups =
    React.useMemo(() => {
      return MODULOS
        .filter((modulo) => moduloVisivel(modulo, has))
        .map((modulo) => ({
          category: modulo.titulo,
          /* página de entrada do módulo ("Visão geral"), como no mockup */
          hub: { title: "Visão geral", href: destinoDoModulo(modulo, has), Icon: modulo.icone as any },
          items: itensVisiveis(modulo, has).map((item) => ({
            title: item.titulo,
            href: hrefDoItem(item, has),
            slug: item.slugs[0],
            Icon: item.icone as any,
          })),
        }))
        .filter(
          (group) =>
            group.items.length > 0
        );
    }, [has]);

  /**
   * Abre por padrão o grupo
   * da rota atual, senão o primeiro.
   */
  const defaultOpenOne =
    React.useMemo(
      (): GroupKey | null => {
        if (
          !visibleGroups.length
        ) {
          return null;
        }

        const found =
          visibleGroups.find(
            (group) =>
              group.items.some(
                (item) =>
                  item.href ===
                  pathname
              )
          )?.category;

        return (
          found ??
          visibleGroups[0]
            ?.category ??
          null
        );
      },
      [
        visibleGroups,
        pathname,
      ]
    );

  /** Sempre 1 grupo aberto */
  const [
    openGroup,
    setOpenGroup,
  ] =
    React.useState<
      GroupKey | null
    >(defaultOpenOne);

  React.useEffect(() => {
    if (!isCollapsed) {
      setOpenGroup(
        defaultOpenOne
      );
    }
  }, [
    defaultOpenOne,
    isCollapsed,
  ]);

  const toggleGroup = (
    category: GroupKey
  ) => {
    setOpenGroup(
      (previous) => {
        /*
         * Não fecha tudo.
         * Se já estiver aberto,
         * mantém aberto.
         */
        if (
          previous === category
        ) {
          return previous;
        }

        return category;
      }
    );
  };

  /**
   * Render de item
   * com tooltip no colapsado.
   */
  const MenuItem = ({
    title,
    href,
    Icon,
    badge = 0,
  }: {
    title: string;
    href: string;
    Icon: any;
    badge?: number;
  }) => {
    const active =
      pathname === href;

    return (
      <SidebarMenuButton
        asChild
        title={title}
        className={[
          "relative flex gap-3",
          active
            ? "bg-accent text-accent-foreground"
            : "",
        ].join(" ")}
      >
        <Link
          href={href}
          aria-current={
            active
              ? "page"
              : undefined
          }
          onClick={(event) =>
            handleNavigate(
              href,
              event
            )
          }
        >
          <Icon className="!size-5" />

          {!isCollapsed && (
            <span>
              {title}
            </span>
          )}

          <ContadorItem
            valor={badge}
            recolhido={isCollapsed}
          />
        </Link>
      </SidebarMenuButton>
    );
  };

  /**
   * Enquanto permissões ainda
   * estão sendo resolvidas.
   */
  if (perms == null) {
    return (
      <Sidebar
        collapsible="icon"
        {...props}
      >
        <SidebarHeader>
          {!isCollapsed && (
            <div
              className={[
                "px-3",
                isMobile
                  ? "pt-6"
                  : "pt-3",
              ].join(" ")}
            >
              <img
                src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1"
                alt="Logo PAI"
                className="h-8 w-auto"
              />

              <div className="mt-4 border-t" />

              <div className="mt-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-sm font-extrabold">
                  U
                </div>

                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    USUÁRIO
                  </div>

                  <div className="truncate text-sm font-semibold">
                    Carregando…
                  </div>
                </div>
              </div>
            </div>
          )}
        </SidebarHeader>

        <SidebarContent className="px-2 overflow-hidden">
          <div className="p-3 text-sm opacity-60">
            Carregando…
          </div>
        </SidebarContent>

        <SidebarFooter />
      </Sidebar>
    );
  }

  /**
   * Dedupe de itens para
   * modo colapsado.
   */
  const collapsedItems =
    React.useMemo(() => {
      const all =
        visibleGroups.flatMap(
          (group) =>
            group.items
        );

      return all.filter(
        (item, index) =>
          all.findIndex(
            (other) =>
              other.href ===
              item.href
          ) === index
      );
    }, [visibleGroups]);

  /*
   * ATALHOS: barra personalizada do computador (Personalizar barra).
   * No celular a barra fica embaixo (BarraCelular), então aqui só aparece fora do modo gaveta.
   */
  const mostrarAtalhos = !sidebar?.isMobile;
  const atalhos = mostrarAtalhos
    ? barra.computador.itens
        .filter((a) => barra.carregada || !a.pagina || has(a.pagina))
        .map((a) => ({
          title: a.rotulo,
          href: a.rota,
          Icon: (p: { className?: string }) => (
            <IconeAtalho id={a.id} className={p.className} />
          ),
        }))
    : [];
  const hrefsAtalhos = new Set(atalhos.map((a) => a.href));
  const itensRecolhidos = [
    ...atalhos,
    ...collapsedItems.filter((item) => !hrefsAtalhos.has(item.href)),
  ];

  const logoNode = (
    <img
      src="https://i0.wp.com/planoassistencialintegrado.com.br/wp-content/uploads/2024/09/MARCA_PAI_02-1-scaled.png?fit=300%2C75&ssl=1"
      alt="Logo PAI"
      className="h-8 w-auto"
    />
  );

  return (
    <Sidebar
      collapsible="icon"
      {...props}
    >
      {/* HEADER */}
      <SidebarHeader>
        <div
          className={[
            "px-3",
            isMobile
              ? "pt-6"
              : "pt-3",
          ].join(" ")}
        >
          {!isCollapsed && (
            <Link
              href="/"
              onClick={(event) =>
                handleNavigate(
                  "/",
                  event
                )
              }
              className="inline-flex"
            >
              {logoNode}
            </Link>
          )}

          {!isCollapsed && (
            <div className="mt-4 border-t" />
          )}

          {/* Usuário */}
          {!isCollapsed && (
            <div className="mt-4 flex items-center gap-3">
              <div
                className={[
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                  "bg-sky-600 text-white",
                  "text-sm font-extrabold",
                ].join(" ")}
                aria-label="Avatar do usuário"
              >
                {userInitials}
              </div>

              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {badgeText}
                </div>

                <div className="truncate text-sm font-semibold">
                  {displayName}
                </div>
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 overflow-hidden">
        {isCollapsed ? (
          /*
           * COLAPSADO:
           * lista única de ícones.
           */
          <div className="space-y-2 pt-2">
            <SidebarMenu className="space-y-1">
              {itensRecolhidos.map(
                (item) => (
                  <SidebarMenuItem
                    key={
                      item.href
                    }
                  >
                    <MenuItem
                      title={
                        item.title
                      }
                      href={
                        item.href
                      }
                      Icon={
                        item.Icon
                      }
                      badge={contadorDe(item.href)}
                    />
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </div>
        ) : (
          /*
           * ABERTO:
           * PC e celular iguais,
           * usando sanfona com
           * um grupo por vez.
           */
          <div
            className={
              isMobile
                ? "pt-5 space-y-3"
                : "mt-4 space-y-2"
            }
          >
            {atalhos.length > 0 && (
              <div>
                <div className="flex w-full items-center px-3 py-2 text-xs font-bold uppercase opacity-70">
                  Atalhos
                </div>
                <SidebarMenu className="space-y-1 pl-1">
                  {atalhos.map((item) => (
                    <SidebarMenuItem key={`atalho-${item.href}`}>
                      <MenuItem
                        title={item.title}
                        href={item.href}
                        Icon={item.Icon}
                        badge={contadorDe(item.href)}
                      />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
                <div className="mx-3 mt-2 border-t" />
              </div>
            )}

            {visibleGroups.map(
              (group) => {
                const opened =
                  openGroup ===
                  group.category;

                return (
                  <div
                    key={
                      group.category
                    }
                  >
                    <button
                      onClick={() =>
                        toggleGroup(
                          group.category
                        )
                      }
                      className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold uppercase opacity-70"
                      type="button"
                    >
                      <span>
                        {
                          group.category
                        }
                      </span>

                      <IconChevronDown
                        size={16}
                        className={`transition ${opened
                          ? "rotate-180"
                          : ""
                          }`}
                      />
                    </button>

                    {opened && (
                      <SidebarMenu className="space-y-1 pl-1">
                        <SidebarMenuItem key={`hub-${group.category}`}>
                          <MenuItem
                            title={group.hub.title}
                            href={group.hub.href}
                            Icon={group.hub.Icon}
                          />
                        </SidebarMenuItem>
                        {group.items.map(
                          (
                            item
                          ) => (
                            <SidebarMenuItem
                              key={
                                item.href
                              }
                            >
                              <MenuItem
                                title={
                                  item.title
                                }
                                href={
                                  item.href
                                }
                                Icon={
                                  item.Icon
                                }
                                badge={contadorDe(item.href)}
                              />
                            </SidebarMenuItem>
                          )
                        )}
                      </SidebarMenu>
                    )}
                  </div>
                );
              }
            )}
          </div>
        )}
      </SidebarContent>

      {/* FOOTER FIXO */}
      <SidebarFooter>
        <div className="px-2 pb-5">
          <div className="border-t pt-3" />

          <SidebarMenu className="space-y-1">
            {/* Personalizar barra */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                title="Personalizar barra"
                className="flex gap-3"
              >
                <Link
                  href="/personalizar-barra"
                  onClick={(event) =>
                    handleNavigate(
                      "/personalizar-barra",
                      event
                    )
                  }
                >
                  <IconAdjustmentsHorizontal className="!size-5" />

                  {!isCollapsed && (
                    <span>
                      Personalizar barra
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Ajuda */}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                title="Ajuda"
                className="flex gap-3"
              >
                <Link
                  href="/help"
                  onClick={(event) =>
                    handleNavigate(
                      "/help",
                      event
                    )
                  }
                >
                  <IconHelp className="!size-5" />

                  {!isCollapsed && (
                    <span>
                      Ajuda
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Logout */}
            <SidebarMenuItem>
              <SidebarMenuButton
                title={
                  isLoggingOut
                    ? "Saindo..."
                    : "Sair da Conta"
                }
                className="flex gap-3 text-red-600 hover:text-red-600"
                onClick={
                  handleLogout
                }
                disabled={
                  isLoggingOut
                }
                aria-busy={
                  isLoggingOut
                }
              >
                <IconLogout className="!size-5" />

                {!isCollapsed && (
                  <span>
                    {isLoggingOut
                      ? "Saindo..."
                      : "Sair da Conta"}
                  </span>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
