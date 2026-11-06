"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
  IconHelp,
  IconHome,
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
import { acharModuloPorRota, destinoDoModulo, hrefDoItem, itensVisiveis, moduloVisivel } from "@/components/shell/modulos";
import { LogoVertical } from "@/components/shell/LogoPai";
import { useMenu } from "@/components/shell/useMenu";
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
  "relative flex gap-3 rounded-xl px-3 text-[15px] font-semibold text-[#E8ECF4] hover:bg-white/[0.08] hover:text-white";
/* Botões pequenos do rodapé do menu (Personalizar barra, Ajuda, Sair da conta). */
const RODAPE_BTN =
  "flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-[12px] font-bold text-[#D6DCE8] hover:bg-white/[0.08] hover:text-white disabled:opacity-60";
/* Altura do item: 40 px nos módulos; 34 px na seção Atalhos (mesma formatação, só mais próximos). */
const ITEM_ALTURA = "min-h-10";
const ITEM_ALTURA_ATALHO = "min-h-[34px]";
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

  /* Nome cadastrado (15/10/2026): o whoami (usuarios.nome) vale sobre o login do cookie. */
  React.useEffect(() => {
    const completo = String(numeros.nome || "").trim();
    if (completo) setDisplayName(completo);
  }, [numeros.nome]);

  const userInitials = React.useMemo(() => initialsFromName(displayName).slice(0, 1), [displayName]);

  /**
   * Módulos do menu, só com as telas que o usuário pode abrir (mesmas chaves de página de antes).
   * 08/10/2026: a organização vem do useMenu() (Gestão em Organizar menu + o que o usuário ajustou em Personalizar menu).
   */
  const menu = useMenu();
  const visibleGroups = React.useMemo(() => {
    if (carregando) return [];
    return menu.modulosPessoais
      .filter((modulo) => moduloVisivel(modulo, has))
      .map((modulo) => ({
        key: modulo.id,
        category: modulo.titulo,
        items: itensVisiveis(modulo, has).map((item) => ({
          id: item.id,
          title: item.titulo,
          href: hrefDoItem(item, has),
          slug: item.slugs[0],
          secao: item.secao || "",
          Icon: item.icone as any,
        })),
      }))
      .filter((group) => group.items.length > 0);
  }, [has, carregando, menu.modulosPessoais]);

  /** 06/11/2026: módulos do menu do celular (blocos) e o módulo da tela atual. */
  const modulosMenu = React.useMemo(
    () =>
      carregando
        ? []
        : menu.modulosPessoais
            .filter((m) => moduloVisivel(m, has))
            .map((m) => ({
              id: m.id,
              titulo: m.titulo,
              href: destinoDoModulo(m, has),
              Icon: m.icone as any,
              pendente: itensVisiveis(m, has).some((i) => contadorDe(hrefDoItem(i, has)) > 0),
            })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carregando, menu.modulosPessoais, has, numeros, contMessenger],
  );
  const moduloAtual = acharModuloPorRota(pathname || "/", menu.modulos, menu.fixos).modulo?.id ?? null;

  /** Abre por padrão o grupo da rota atual, senão o primeiro. */
  const defaultOpenOne = React.useMemo((): GroupKey | null => {
    if (!visibleGroups.length) {
      return null;
    }
    const found = visibleGroups.find((group) => group.items.some((item) => item.href === pathname))?.key;
    return found ?? visibleGroups[0]?.key ?? null;
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
   * ATALHOS: barra personalizada do menu (Personalizar barra), no topo do menu.
   * Aparece no computador e também no Menu do celular (definição de 06/10/2026).
   */
  const mostrarAtalhos = !carregando;
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
  const MenuItem = ({ title, href, Icon, badge = 0, compacto = false }: { title: string; href: string; Icon: any; badge?: number; compacto?: boolean }) => {
    const active = pathname === href;
    return (
      <SidebarMenuButton asChild title={title} className={[ITEM_BASE, compacto ? ITEM_ALTURA_ATALHO : ITEM_ALTURA, active ? ITEM_ATIVO : ""].join(" ")}>
        <Link href={href} aria-current={active ? "page" : undefined} onClick={(event) => handleNavigate(href, event)}>
          <Icon className="!size-5" />
          <span className="flex-1 truncate">{title}</span>
          <ContadorItem valor={badge} recolhido={false} />
        </Link>
      </SidebarMenuButton>
    );
  };

  /*
   * 06/11/2026 — navegação nova no computador (decisão de 03/11/2026, prévia "PAI Conecta — prévia geral"):
   * trilho estreito só com os módulos (ícone + nome). O clique abre a página do módulo, com as telas em ícones.
   * As listas que abriam e fechavam saem do computador; no celular o menu continua o mesmo (MenuCelular).
   */
  const NOME_CURTO: Record<string, string> = { atendimento: "Atendim.", requisicoes: "Requis.", financeiro: "Financ.", administrativo: "Admin." };

  if (!isMobile) {
    const atual = acharModuloPorRota(pathname || "/", menu.modulos, menu.fixos).modulo?.id ?? null;
    const BOTAO =
      "relative flex min-h-[54px] w-[84px] shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] px-0.5 py-1.5 text-[12px] font-bold leading-tight text-[#D6DCE8] hover:bg-white/[0.08] hover:text-white";
    const BOTAO_ATIVO = "bg-white/[0.16] font-extrabold text-white shadow-[inset_4px_0_0_#F2CB3F] hover:bg-white/[0.16]";
    const modulosRail = carregando
      ? []
      : menu.modulosPessoais
          .filter((m) => moduloVisivel(m, has))
          .map((m) => ({
            id: m.id,
            titulo: m.titulo,
            curto: NOME_CURTO[m.id] || m.titulo,
            href: destinoDoModulo(m, has),
            Icon: m.icone as any,
            pendente: itensVisiveis(m, has).some((i) => contadorDe(hrefDoItem(i, has)) > 0),
          }));
    return (
      <Sidebar collapsible="offcanvas" data-pai-menu {...props}>
        <nav aria-label="Módulos" className="flex h-full flex-col items-center gap-0.5 py-3">
          <Link
            href="/"
            onClick={(event) => handleNavigate("/", event)}
            aria-label="PAI Conecta — Início"
            data-pai-logo-capsula
            className="mb-2 flex shrink-0 flex-col items-center gap-1"
          >
            {/* 06/11/2026: logomarca vertical (símbolo + PAI) sem cápsula; no tema escuro o contorno é um pouco mais fino */}
            <LogoVertical className="h-auto w-[56px] dark:hidden" />
            <LogoVertical fino className="hidden h-auto w-[56px] dark:block" />
            <span className="text-[13px] font-extrabold leading-none tracking-[0.04em] text-[#F2CB3F]">Conecta</span>
          </Link>

          <div className="pai-menu-rolagem min-h-0 w-full flex-1 overflow-y-auto">
            {/* 06/11/2026: sem o botão do usuário, os módulos se espalham pela altura da barra (e rolam só se não couberem) */}
            <div className="flex min-h-full flex-col items-center justify-evenly gap-1 py-1">
            <Link
              href="/"
              title="Início"
              aria-current={pathname === "/" ? "page" : undefined}
              onClick={(event) => handleNavigate("/", event)}
              className={[BOTAO, pathname === "/" ? BOTAO_ATIVO : ""].join(" ")}
            >
              <IconHome className="size-6" stroke={1.7} />
              <span>Início</span>
            </Link>
            {carregando ? <span className="py-3 text-[12px] text-[#AEB9CF]">…</span> : null}
            {modulosRail.map((m) => {
              const ativo = atual === m.id;
              return (
                <Link
                  key={m.id}
                  href={m.href}
                  title={m.titulo}
                  aria-current={ativo ? "page" : undefined}
                  onClick={(event) => handleNavigate(m.href, event)}
                  className={[BOTAO, ativo ? BOTAO_ATIVO : ""].join(" ")}
                >
                  <m.Icon className="size-6" stroke={1.7} />
                  <span className="max-w-[76px] truncate">{m.curto}</span>
                  {m.pendente ? <span className="absolute right-4 top-2 size-2.5 rounded-full bg-[#F2CB3F]" aria-label="há pendências" /> : null}
                </Link>
              );
            })}
            </div>
          </div>

        </nav>
      </Sidebar>
    );
  }

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
        {/* 06/11/2026: logomarca vertical (símbolo + PAI) e "Conecta" em amarelo, como no computador */}
        <Link
          href="/"
          onClick={(event) => handleNavigate("/", event)}
          aria-label="PAI Conecta — Início"
          data-pai-logo-capsula
          className="flex shrink-0 items-center gap-3 px-3"
        >
          <LogoVertical className="h-auto w-[46px] dark:hidden" />
          <LogoVertical fino className="hidden h-auto w-[46px] dark:block" />
          <span className="text-[20px] font-extrabold tracking-[0.04em] text-[#F2CB3F]">Conecta</span>
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
                <SidebarMenu className="gap-0">
                  {atalhos.map((item) => (
                    <SidebarMenuItem key={`atalho-${item.href}`}>
                      <MenuItem compacto title={item.title} href={item.href} Icon={item.Icon} badge={contadorDe(item.href)} />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
                <div className="mx-3 mt-2 border-t border-white/[0.18]" />
              </div>
            )}

            {/* 06/11/2026: módulos em blocos; o toque abre a página do módulo (telas em ícones), igual ao computador */}
            <div>
              <div className="flex w-full items-center px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#AEB9CF]">Módulos</div>
              <div className="grid grid-cols-3 gap-2 px-1 sm:grid-cols-4 landscape:grid-cols-5">
                {modulosMenu.map((m) => {
                  const ativo = moduloAtual === m.id;
                  return (
                    <Link
                      key={m.id}
                      href={m.href}
                      onClick={(event) => handleNavigate(m.href, event)}
                      aria-current={ativo ? "page" : undefined}
                      className={[
                        "relative flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl px-1.5 py-3 text-center text-[13px] font-bold leading-tight text-[#E8ECF4]",
                        ativo ? "bg-white/[0.16] font-extrabold text-white shadow-[inset_0_0_0_2px_#F2CB3F]" : "bg-white/[0.07] hover:bg-white/[0.12]",
                      ].join(" ")}
                    >
                      <span className="grid size-11 place-items-center rounded-[14px] bg-white/[0.10] text-[#F2CB3F]">
                        <m.Icon className="size-[22px]" stroke={1.8} />
                      </span>
                      <span className="break-words">{m.titulo}</span>
                      {m.pendente ? <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-[#F2CB3F]" aria-label="há pendências" /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </SidebarContent>

      {/*
        RODAPÉ COMPACTO (06/10/2026): ocupa pouco espaço para dar prioridade aos módulos.
        Uma linha com o usuário e uma linha com três botões pequenos: Personalizar menu (antes "Barra"), Ajuda e Sair da conta (sem vermelho).
      */}
      <SidebarFooter className="p-0">
        <div className="border-t border-white/[0.18] px-3 pb-2 pt-2">
          <div className="flex items-center gap-2 px-1">
            <div
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#00AEEC] text-[12px] font-extrabold text-[#313C55]"
              aria-hidden="true"
            >
              {carregando ? "U" : userInitials}
            </div>
            <div className="min-w-0 truncate text-[13px] font-extrabold text-white" title="Usuário">
              {carregando ? "Carregando…" : displayName}
            </div>
          </div>

          <div className="mt-1.5 grid grid-cols-3 gap-1">
            <Link
              href="/personalizar-barra"
              title="Personalizar menu"
              aria-current={pathname === "/personalizar-barra" ? "page" : undefined}
              onClick={(event) => handleNavigate("/personalizar-barra", event)}
              className={[RODAPE_BTN, pathname === "/personalizar-barra" ? "bg-white/[0.14] text-white" : ""].join(" ")}
            >
              <IconAdjustmentsHorizontal className="size-4 shrink-0" />
              <span className="truncate">Menu</span>
            </Link>
            <Link
              href="/help"
              title="Ajuda"
              aria-current={pathname === "/help" ? "page" : undefined}
              onClick={(event) => handleNavigate("/help", event)}
              className={[RODAPE_BTN, pathname === "/help" ? "bg-white/[0.14] text-white" : ""].join(" ")}
            >
              <IconHelp className="size-4 shrink-0" />
              <span className="truncate">Ajuda</span>
            </Link>
            <button
              type="button"
              title={isLoggingOut ? "Saindo..." : "Sair da conta"}
              onClick={handleLogout}
              disabled={isLoggingOut}
              aria-busy={isLoggingOut}
              className={RODAPE_BTN}
            >
              <IconLogout className="size-4 shrink-0" />
              <span className="truncate">{isLoggingOut ? "Saindo" : "Sair"}</span>
            </button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * 06/11/2026: botão do usuário no canto superior direito do cabeçalho (computador), ao lado de "Online".
 * Saiu do trilho lateral para não precisar de rolagem. Abre: Personalizar menu, Ajuda e Sair da conta
 * (o mesmo "Sair" do menu: limpa o contexto offline, encerra a sessão e vai para o login).
 */
export function MenuUsuario({ className = "" }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { perms, has } = usePerms();
  const numeros = useContadores(perms, has);
  const [aberto, setAberto] = React.useState(false);
  const [saindo, setSaindo] = React.useState(false);
  const [nome, setNome] = React.useState("Usuário");

  React.useEffect(() => {
    const raw = (readCookie("pai_name") || readCookie("pai_user") || "Usuário").trim().replace(/\s+/g, " ");
    setNome(capitalizeFirstLetter(raw));
  }, []);
  React.useEffect(() => {
    const completo = String(numeros.nome || "").trim();
    if (completo) setNome(completo);
  }, [numeros.nome]);
  React.useEffect(() => {
    setAberto(false);
  }, [pathname]);
  React.useEffect(() => {
    if (!aberto) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [aberto]);

  const sair = async () => {
    if (saindo) return;
    setSaindo(true);
    try {
      try {
        await clearOfflineContextOnLogout();
      } catch (error) {
        console.error("[Logout] Falha ao limpar contexto offline:", error);
      }
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
      } catch (error) {
        console.warn("[Logout] Não foi possível confirmar o logout no servidor:", error);
      }
    } finally {
      router.replace("/login");
      setSaindo(false);
    }
  };

  const ITEM = "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[14px] font-bold hover:bg-[#EEF2F7] disabled:opacity-60 dark:hover:bg-white/[0.08]";
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        aria-label={`Usuário: ${nome}`}
        title={nome}
        className="grid size-10 place-items-center rounded-full bg-[#F2CB3F] text-[14px] font-extrabold text-[#313C55] hover:bg-[#E4BC30]"
      >
        {perms == null ? "U" : initialsFromName(nome)}
      </button>
      {aberto ? (
        <>
          <button type="button" aria-label="Fechar" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setAberto(false)} />
          <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-[#E3E8F0] bg-[#FFFFFF] p-1.5 text-[#313C55] shadow-[0_16px_40px_rgba(49,60,85,.22)] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-white">
            <div className="truncate px-3 pb-2 pt-1.5 text-[14px] font-extrabold">{nome}</div>
            <Link role="menuitem" href="/personalizar-barra" className={ITEM}>
              <IconAdjustmentsHorizontal className="size-[18px]" /> Personalizar menu
            </Link>
            <Link role="menuitem" href="/help" className={ITEM}>
              <IconHelp className="size-[18px]" /> Ajuda
            </Link>
            <button type="button" role="menuitem" onClick={() => void sair()} disabled={saindo} className={ITEM}>
              <IconLogout className="size-[18px]" /> {saindo ? "Saindo…" : "Sair da conta"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
