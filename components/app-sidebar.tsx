"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
  IconChevronRight,
  IconHelp,
  IconLogout,
} from "@tabler/icons-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { usePerms } from "@/app/_perms/PermsProvider";
import { MODULOS, destinoDoModulo, hrefDoItem, itensVisiveis, moduloVisivel } from "@/components/shell/modulos";
import LogoPai from "@/components/shell/LogoPai";
import { rotaExiste } from "@/components/shell/rotas";
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
      className="ml-auto inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-[#F2CB3F] px-2 text-xs font-extrabold tabular-nums text-[#313C55]"
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
            secao: item.secao,
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
         * Um módulo aberto por vez.
         * Tocar no módulo aberto
         * RECOLHE (mockup).
         */
        if (
          previous === category
        ) {
          return null;
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
    nivel = "fixo",
  }: {
    title: string;
    href: string;
    Icon: any;
    badge?: number;
    /** "fixo" = atalho ou rodapé (com ícone); "sub" = tela dentro de um módulo (recuada, sem ícone) */
    nivel?: "fixo" | "sub";
  }) => {
    /* link com ?aba=... nunca fica marcado: só o caminho não distingue as duas telas */
    const active = !href.includes("?") && pathname === href;

    return (
      <Link
        href={href}
        title={title}
        aria-current={active ? "page" : undefined}
        onClick={(event) => handleNavigate(href, event)}
        className={[
          "relative flex w-full items-center gap-3 rounded-xl px-3 outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-[#F2CB3F]",
          nivel === "sub"
            ? "min-h-[34px] pl-[46px] text-sm [@media(max-height:760px)]:min-h-8"
            : "min-h-10 text-[15px] [@media(max-height:760px)]:min-h-9",
          /* Mockup: selecionado = fundo branco a 14%, texto branco em negrito e barra amarela de 4 px à esquerda */
          active
            ? "bg-white/[0.14] font-extrabold text-white shadow-[inset_4px_0_0_#F2CB3F]"
            : [
                "font-semibold hover:bg-white/[0.08] hover:text-white",
                nivel === "sub" ? "text-[#D6DCE8]" : "text-[#E8ECF4]",
              ].join(" "),
        ].join(" ")}
      >
        {nivel === "fixo" && <Icon className="size-5 shrink-0" />}

        {!isCollapsed && <span className="min-w-0 flex-1 truncate">{title}</span>}

        <ContadorItem valor={badge} recolhido={isCollapsed} />
      </Link>
    );
  };


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

  /* Fora desta linha para cima ficam TODOS os hooks. Os "return" antecipados vêm depois: mudar a ordem dos hooks derruba o app. */
  /* No celular o menu é a tela "Menu" (MenuCelular); a gaveta lateral não é mais usada. */
  if (sidebar?.isMobile) return null;

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
              <LogoPai className="h-[52px] w-auto" />

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


  /*
   * ATALHOS: barra personalizada do computador (Personalizar barra).
   * No celular a barra fica embaixo (BarraCelular), então aqui só aparece fora do modo gaveta.
   */
  const mostrarAtalhos = !sidebar?.isMobile;
  const atalhos = mostrarAtalhos
    ? barra.computador.itens
        .filter((a) => (barra.carregada || !a.pagina || has(a.pagina)) && rotaExiste(a.rota))
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

  const logoNode = <LogoPai className="h-[52px] w-auto" />;

  return (
    <Sidebar
      collapsible="icon"
      {...props}
    >
      {/* HEADER: etiqueta branca da logomarca, encostada na borda esquerda (mockup: 196 x 76 px) */}
      <SidebarHeader>
        <div className="px-3 pt-3">
          {!isCollapsed && (
            <Link
              href="/"
              aria-label="PAI - Plano Assistencial Integrado: ir para o Início"
              onClick={(event) => handleNavigate("/", event)}
              style={{ backgroundColor: "rgb(255 255 255)" }}
              className="-ml-7 flex h-[76px] w-[196px] items-center rounded-r-[38px] pl-7"
            >
              {logoNode}
            </Link>
          )}
        </div>
      </SidebarHeader>

      {/* sem overflow-hidden: com 8 módulos + Atalhos a lista passa da altura da tela e precisa rolar (o último módulo, Gestão, ficava cortado) */}
      <SidebarContent
        className={[
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-2",
          /* Windows: barra fina e invisível; aparece, translúcida, quando o mouse passa na barra. Mac: segue a rolagem nativa (aparece só ao rolar). */
          "[scrollbar-width:thin] [scrollbar-color:transparent_transparent] hover:[scrollbar-color:rgba(255,255,255,0.28)_transparent]",
          "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-white/25",
        ].join(" ")}
      >
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
           * ABERTO (mockup): atalhos fixos, rótulo MÓDULOS e um módulo aberto por vez.
           * Tocar no módulo aberto RECOLHE.
           */
          <div className="mt-3 flex flex-col gap-0.5">
            {atalhos.length > 0 && (
              <SidebarMenu className="gap-0.5">
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
            )}

            {visibleGroups.length > 0 && (
              <div className="px-3 pb-1.5 pt-[18px] text-[11px] font-extrabold tracking-[0.12em] text-[#AEB9CF]">
                MÓDULOS
              </div>
            )}

            {visibleGroups.map((group) => {
              const opened = openGroup === group.category;
              const GIcon = group.hub.Icon;

              return (
                <div key={group.category}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.category)}
                    aria-expanded={opened}
                    className={[
                      "flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] outline-none transition-colors [@media(max-height:760px)]:min-h-9",
                      "hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-[#F2CB3F]",
                      opened ? "font-extrabold text-white" : "font-semibold text-[#E8ECF4]",
                    ].join(" ")}
                  >
                    <GIcon className="size-5 shrink-0" />
                    <span className="flex-1">{group.category}</span>
                    {opened ? (
                      <IconChevronDown size={16} className="shrink-0" />
                    ) : (
                      <IconChevronRight size={16} className="shrink-0" />
                    )}
                  </button>

                  {opened && (
                    <SidebarMenu className="mt-0.5 gap-0.5">
                      <SidebarMenuItem>
                        <MenuItem nivel="sub" title="Visão geral" href={group.hub.href} Icon={GIcon} />
                      </SidebarMenuItem>

                      {group.items.map((item, posicao) => (
                        <React.Fragment key={item.href}>
                          {item.secao && item.secao !== group.items[posicao - 1]?.secao ? (
                            <li className="pb-0.5 pl-[46px] pt-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#AEB9CF]">
                              {item.secao}
                            </li>
                          ) : null}
                          <SidebarMenuItem>
                            <MenuItem
                              nivel="sub"
                              title={item.title}
                              href={item.href}
                              Icon={item.Icon}
                              badge={contadorDe(item.href)}
                            />
                          </SidebarMenuItem>
                        </React.Fragment>
                      ))}
                    </SidebarMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SidebarContent>

      {/* FOOTER FIXO, compacto: usuário em uma linha e as três ações lado a lado (sobra mais espaço para os módulos) */}
      <SidebarFooter className="px-2 pb-3 pt-0">
        <div className="mt-1 border-t border-white/[0.18] pt-2">
          <div className="flex items-center gap-2.5 px-2 pb-1.5">
            <div
              className="grid size-8 shrink-0 place-items-center rounded-full bg-[#00AEEC] text-sm font-extrabold text-[#313C55]"
              aria-label="Avatar do usuário"
            >
              {userInitials}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="text-[10px] font-extrabold tracking-[0.12em] text-[#AEB9CF]">{badgeText}</div>
              <div className="truncate text-sm font-extrabold text-white">{displayName}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {[
              { href: "/personalizar-barra", rotulo: "Personalizar barra", curto: "Personalizar", Icon: IconAdjustmentsHorizontal },
              { href: "/help", rotulo: "Ajuda", curto: "Ajuda", Icon: IconHelp },
            ].map(({ href, rotulo, curto, Icon }) => {
              const ativo = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  title={rotulo}
                  aria-label={rotulo}
                  aria-current={ativo ? "page" : undefined}
                  onClick={(event) => handleNavigate(href, event)}
                  className={[
                    "flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-semibold leading-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#F2CB3F]",
                    ativo ? "bg-white/[0.14] text-white shadow-[inset_0_-3px_0_#F2CB3F]" : "text-[#E8ECF4] hover:bg-white/[0.08] hover:text-white",
                  ].join(" ")}
                >
                  <Icon className="size-5" />
                  <span className="max-w-full truncate">{curto}</span>
                </Link>
              );
            })}

            <button
              type="button"
              title={isLoggingOut ? "Saindo..." : "Sair da conta"}
              aria-label={isLoggingOut ? "Saindo..." : "Sair da conta"}
              onClick={handleLogout}
              disabled={isLoggingOut}
              aria-busy={isLoggingOut}
              className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-semibold leading-tight text-white outline-none transition-colors hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#F2CB3F] disabled:opacity-60"
            >
              <IconLogout className="size-5" />
              <span>{isLoggingOut ? "Saindo..." : "Sair"}</span>
            </button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
