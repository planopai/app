"use client";

/**
 * Layout geral do app PAI (repaginada): menu lateral por módulos no computador, barra de baixo com números e
 * folha "Menu" no celular. Funciona em pé e deitado (na horizontal a barra de baixo vira um menu na lateral).
 *
 * COMO MONTAR: veja LAYOUT_INTEGRACAO.md. Resumo: no layout raiz, troque o menu antigo por
 *   <AppShell headerRight={<SeusBotoesDeTemaEPaleta />} sairHref="/login">{children}</AppShell>
 *
 * Nada aqui mexe em permissões: cada item usa a chave de página que já existe (usePerms().has).
 * Quadro, Minhas OS, Chat e Avisos aparecem para todos.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    IconArrowLeft,
    IconBell,
    IconChevronDown,
    IconChevronRight,
    IconClipboardList,
    IconFlower,
    IconHelpCircle,
    IconHome,
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
    IconLogout,
    IconMenu2,
    IconMessageCircle,
    IconPackage,
    IconX,
} from "@tabler/icons-react";
import { usePerms } from "@/app/_perms/PermsProvider";
import { clearOfflineContextOnLogout } from "@/lib/offline/logout";
import AlternarTema from "./AlternarTema";
import MenuModulos, { Selo } from "./MenuModulos";
import { FIXOS, MODULOS, acharModuloPorRota, destinoDoModulo, hrefDoItem, itensVisiveis, moduloVisivel, itemVisivel, type ItemModulo, type Icone } from "./modulos";
import { formatarSelo, useContadores, type Contadores } from "./useContadores";

/** Rotas que ficam SEM o layout (telas públicas, de TV, login e modo offline). */
const SEM_SHELL = ["/login", "/quadrotv", "/tela", "/offline", "/obituario/publico", "/memorial/publico"];

type Props = {
    children: React.ReactNode;
    /** Rotas sem o layout (somam-se às padrão). Mesmo nome da prop do AppShell antigo. */
    hideOnRoutes?: string[];
    /** Controles à direita do cabeçalho. Se não vier, mostra o botão de tema claro/escuro (next-themes). */
    headerRight?: React.ReactNode;
    /** Imagem do logo colorido (se não vier, mostra "PAI"). */
    logoSrc?: string;
    /** Opcional: trocar o "Sair da conta". Por padrão faz o mesmo que o menu antigo (limpa o contexto offline, POST /api/auth/logout, vai para /login). */
    aoSair?: () => void | Promise<void>;
};

function valorSelo(c: Contadores, selo?: ItemModulo["selo"]): number | null {
    if (selo === "aguardando") return c.aguardando;
    if (selo === "coroas") return c.coroas;
    if (selo === "estoque") return c.estoque;
    if (selo === "avisos") return c.avisos;
    return null;
}

function useOnline() {
    const [on, setOn] = useState(true);
    useEffect(() => {
        const f = () => setOn(navigator.onLine);
        f();
        window.addEventListener("online", f);
        window.addEventListener("offline", f);
        return () => {
            window.removeEventListener("online", f);
            window.removeEventListener("offline", f);
        };
    }, []);
    return on;
}

/* ------------------------------------------------------------- menu lateral (computador) ------------------------------------------------------------- */

const NAV_BASE =
    "group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-[#E8ECF4] outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#F2CB3F]";
const NAV_ATIVO = "bg-white/15 font-extrabold text-white shadow-[inset_4px_0_0_#F2CB3F]";

function Barra({
    recolhido,
    pathname,
    has,
    perms,
    contadores,
    logoSrc,
    onSair,
    saindo,
}: {
    recolhido: boolean;
    pathname: string;
    has: (s: string) => boolean;
    perms: unknown;
    contadores: Contadores;
    logoSrc?: string;
    onSair: () => void;
    saindo: boolean;
}) {
    const { modulo: moduloAtivo, item: itemAtivo, fixo } = acharModuloPorRota(pathname);
    const [abertos, setAbertos] = useState<Record<string, boolean>>({});

    const modulos = useMemo(() => (perms == null ? [] : MODULOS.filter((m) => moduloVisivel(m, has))), [perms, has]);
    const fixos = FIXOS.filter((f) => itemVisivel(f, has));

    const aberto = (id: string) => abertos[id] ?? moduloAtivo?.id === id;

    return (
        <aside
            className={[
                "sticky top-0 hidden h-[100dvh] shrink-0 flex-col bg-[#313C55] pb-4 pt-6 text-white transition-[width] duration-200 dark:bg-[#232B3F] lg:flex",
                recolhido ? "w-[84px] px-3" : "w-[272px] px-4",
            ].join(" ")}
            aria-label="Menu principal"
        >
            <div className={["mb-3.5 flex h-[76px] shrink-0 items-center rounded-r-[38px] bg-white", recolhido ? "-ml-3 w-[60px] justify-center" : "-ml-4 w-[196px] pl-7"].join(" ")}>
                {logoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoSrc} alt="PAI" className="h-[52px] w-auto" />
                ) : (
                    <span className="text-2xl font-black tracking-tight text-[#313C55]">PAI</span>
                )}
            </div>

            <nav className="-mr-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-2 [scrollbar-color:rgba(255,255,255,.25)_transparent] [scrollbar-width:thin]">
                {fixos.map((f) => {
                    const Icon = f.icone;
                    const ativo = fixo?.href === f.href;
                    return (
                        <Link key={f.href} href={f.href} title={f.titulo} className={[NAV_BASE, ativo ? NAV_ATIVO : ""].join(" ")}>
                            <Icon size={20} className="shrink-0" />
                            {recolhido ? null : <span className="flex-1 truncate">{f.titulo}</span>}
                            {recolhido ? null : <Selo valor={formatarSelo(valorSelo(contadores, f.selo))} />}
                        </Link>
                    );
                })}

                {recolhido ? <div className="my-2 h-px bg-white/15" /> : <p className="px-3 pb-1.5 pt-[18px] text-[11px] font-extrabold tracking-[0.12em] text-[#AEB9CF]">MÓDULOS</p>}

                {modulos.map((m) => {
                    const Icon = m.icone;
                    const open = aberto(m.id) && !recolhido;
                    const itens = itensVisiveis(m, has);
                    const selo = m.selo === "estoque" ? formatarSelo(contadores.estoque) : "";
                    const ativoHub = moduloAtivo?.id === m.id && !itemAtivo;

                    return (
                        <div key={m.id}>
                            {recolhido ? (
                                <Link href={destinoDoModulo(m, has)} title={m.titulo} className={[NAV_BASE, moduloAtivo?.id === m.id ? NAV_ATIVO : ""].join(" ")}>
                                    <Icon size={20} />
                                </Link>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setAbertos((a) => ({ ...a, [m.id]: !aberto(m.id) }))}
                                    aria-expanded={open}
                                    className={[NAV_BASE, "w-full text-left", ativoHub ? NAV_ATIVO : open ? "font-extrabold text-white" : ""].join(" ")}
                                >
                                    <Icon size={20} className="shrink-0" />
                                    <span className="flex-1 truncate">{m.titulo}</span>
                                    <Selo valor={selo} />
                                    {open ? <IconChevronDown size={16} className="text-[#AEB9CF]" /> : <IconChevronRight size={16} className="text-[#AEB9CF]" />}
                                </button>
                            )}

                            {open ? (
                                <div className="mb-1 flex flex-col gap-0.5">
                                    <Link href={destinoDoModulo(m, has)} className={[NAV_BASE, "min-h-[34px] pl-[46px] text-sm", ativoHub ? NAV_ATIVO : "text-[#D6DCE8]"].join(" ")}>
                                        <span className="flex-1">Visão geral</span>
                                    </Link>
                                    {itens.map((i) => (
                                        <Link
                                            key={i.titulo}
                                            href={hrefDoItem(i, has)}
                                            className={[NAV_BASE, "min-h-[34px] pl-[46px] text-sm", itemAtivo?.titulo === i.titulo && moduloAtivo?.id === m.id ? NAV_ATIVO : "text-[#D6DCE8]"].join(" ")}
                                        >
                                            <span className="flex-1 truncate">{i.titulo}</span>
                                            <Selo valor={formatarSelo(valorSelo(contadores, i.selo))} />
                                        </Link>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </nav>

            <div className="mt-1.5 shrink-0 space-y-0.5 border-t border-white/[0.18] pt-2.5">
                {recolhido ? null : (
                    <div className="flex items-center gap-3 px-3 py-1.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00AEEC] text-[15px] font-extrabold text-[#313C55]">
                            {(contadores.nome || "?").trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[11px] font-extrabold tracking-[0.12em] text-[#AEB9CF]">USUÁRIO</span>
                            <span className="block truncate text-[15px] font-extrabold text-white">{(contadores.nome || "").trim().split(/\s+/)[0] || "—"}</span>
                        </span>
                    </div>
                )}
                <Link href="/help" title="Ajuda" className={NAV_BASE}>
                    <IconHelpCircle size={20} className="shrink-0" />
                    {recolhido ? null : <span className="flex-1">Ajuda</span>}
                </Link>
                <button type="button" onClick={onSair} disabled={saindo} title="Sair da conta" className={[NAV_BASE, "w-full text-left text-white disabled:opacity-60"].join(" ")}>
                    <IconLogout size={20} className="shrink-0" />
                    {recolhido ? null : <span className="flex-1">{saindo ? "Saindo…" : "Sair da conta"}</span>}
                </button>
            </div>
        </aside>
    );
}

/* ------------------------------------------------------------- barra de baixo (celular) ------------------------------------------------------------- */

type Aba = { id: string; titulo: string; href: string; icone: Icone; selo: string; ativo: boolean };

function BarraCelular({ abas, menuAberto, onMenu }: { abas: Aba[]; menuAberto: boolean; onMenu: () => void }) {
    const cls = (ativo: boolean) =>
        [
            "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[10.5px] font-bold leading-none outline-none focus-visible:ring-2 focus-visible:ring-[#F2CB3F]",
            "max-lg:landscape:min-h-[60px] max-lg:landscape:flex-none",
            ativo ? "text-white" : "text-[#AEB9CF]",
        ].join(" ");

    const pill = (ativo: boolean) =>
        ["grid h-7 w-10 place-items-center rounded-full transition", ativo ? "bg-white/15 text-white" : ""].join(" ");

    return (
        <nav
            aria-label="Navegação principal"
            className={[
                "fixed inset-x-0 bottom-0 z-40 flex h-[calc(72px+env(safe-area-inset-bottom))] items-stretch gap-0.5 bg-[#313C55] px-0.5 pb-[env(safe-area-inset-bottom)] pt-1 dark:bg-[#232B3F] lg:hidden",
                "max-lg:landscape:inset-x-auto max-lg:landscape:inset-y-0 max-lg:landscape:left-0 max-lg:landscape:h-auto max-lg:landscape:w-[84px] max-lg:landscape:flex-col max-lg:landscape:overflow-y-auto max-lg:landscape:px-1.5 max-lg:landscape:pb-2 max-lg:landscape:pl-[max(0.375rem,env(safe-area-inset-left))]",
            ].join(" ")}
        >
            {abas.map((a) => {
                const Icon = a.icone;
                return (
                    <Link key={a.id} href={a.href} className={cls(a.ativo)} aria-current={a.ativo ? "page" : undefined}>
                        <span className={pill(a.ativo)}>
                            <Icon size={22} />
                        </span>
                        {a.titulo}
                        {a.selo ? (
                            <span className="absolute left-1/2 top-0.5 ml-2 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#F2CB3F] px-1 text-[10.5px] font-extrabold text-[#313C55]">
                                {a.selo}
                            </span>
                        ) : null}
                    </Link>
                );
            })}
            <button type="button" onClick={onMenu} aria-expanded={menuAberto} className={cls(menuAberto)}>
                <span className={pill(menuAberto)}>
                    <IconMenu2 size={22} />
                </span>
                Menu
            </button>
        </nav>
    );
}

/* ------------------------------------------------------------- shell ------------------------------------------------------------- */

export default function AppShell({ children, hideOnRoutes = [], headerRight, logoSrc, aoSair }: Props) {
    const pathname = usePathname() || "/";
    const router = useRouter();
    const { perms, has } = usePerms();
    const contadores = useContadores(perms, has);
    const online = useOnline();
    const [recolhido, setRecolhido] = useState(false);
    const [menuAberto, setMenuAberto] = useState(false);
    const [saindo, setSaindo] = useState(false);

    /* Igual ao "Sair" do menu antigo: 1) limpa o contexto offline do usuário, 2) encerra a sessão no servidor
       (mesmo sem internet segue), 3) vai para /login. */
    const sair = async () => {
        if (saindo) return;
        if (aoSair) {
            await aoSair();
            return;
        }
        setSaindo(true);
        try {
            try {
                await clearOfflineContextOnLogout();
            } catch (e) {
                console.error("[Logout] Falha ao limpar contexto offline:", e);
            }
            try {
                await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
            } catch (e) {
                console.warn("[Logout] Não foi possível confirmar o logout no servidor:", e);
            }
        } finally {
            setMenuAberto(false);
            router.replace("/login");
            setSaindo(false);
        }
    };

    useEffect(() => {
        try {
            setRecolhido(localStorage.getItem("pai_menu_recolhido") === "1");
        } catch {
            /* sem armazenamento: segue aberto */
        }
    }, []);

    useEffect(() => {
        setMenuAberto(false);
    }, [pathname]);

    useEffect(() => {
        if (!menuAberto) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuAberto(false);
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [menuAberto]);

    const semShell = [...SEM_SHELL, ...hideOnRoutes].some((r) => pathname === r || pathname.startsWith(r + "/"));
    const { modulo, item, fixo } = acharModuloPorRota(pathname);

    const estoqueItem = MODULOS.find((m) => m.id === "estoque")!.itens[0];
    const abas: Aba[] = useMemo(() => {
        const ativoDe = (...hrefs: string[]) => hrefs.some((h) => pathname === h || pathname.startsWith(h + "/"));
        const lista: Aba[] = [{ id: "inicio", titulo: "Início", href: "/inicio", icone: IconHome, selo: "", ativo: ativoDe("/inicio") }];
        if (perms != null && has("acompanhamento")) {
            lista.push({ id: "atend", titulo: "Atend.", href: "/acompanhamento", icone: IconClipboardList, selo: formatarSelo(contadores.aguardando), ativo: ativoDe("/acompanhamento") });
        }
        lista.push({ id: "chat", titulo: "Chat", href: "/chat", icone: IconMessageCircle, selo: "", ativo: ativoDe("/chat") });
        lista.push({ id: "avisos", titulo: "Avisos", href: "/avisos", icone: IconBell, selo: formatarSelo(contadores.avisos), ativo: ativoDe("/avisos") });
        if (perms != null && (has("geral") || has("estoque") || has("produtos"))) {
            const href = itemVisivel(estoqueItem, has) ? hrefDoItem(estoqueItem, has) : "/produtos";
            lista.push({ id: "estoque", titulo: "Estoque", href, icone: IconPackage, selo: formatarSelo(contadores.estoque), ativo: ativoDe("/geral", "/estoque", "/produtos") });
        }
        if (perms != null && has("coroa-de-flores")) {
            lista.push({ id: "coroas", titulo: "Coroas", href: "/coroa-de-flores", icone: IconFlower, selo: formatarSelo(contadores.coroas), ativo: ativoDe("/coroa-de-flores") });
        }
        return lista;
    }, [pathname, perms, has, contadores, estoqueItem]);

    if (semShell) return <>{children}</>;

    const titulo = item?.titulo || fixo?.titulo || modulo?.titulo || "";

    return (
        <div className="flex min-h-[100dvh] bg-[#F6F8FB] text-[#313C55] [--header-height:48px] dark:bg-[#161C2A] dark:text-white">
            <Barra recolhido={recolhido} pathname={pathname} has={has} perms={perms} contadores={contadores} logoSrc={logoSrc} onSair={sair} saindo={saindo} />

            <div className="flex min-w-0 flex-1 flex-col max-lg:landscape:pl-[84px]">
                <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-[#E3E8F0] bg-white px-2 dark:border-white/[0.12] dark:bg-[#232B3F] lg:gap-4 lg:px-6">
                    <button
                        type="button"
                        onClick={() => {
                            const v = !recolhido;
                            setRecolhido(v);
                            try {
                                localStorage.setItem("pai_menu_recolhido", v ? "1" : "0");
                            } catch {
                                /* ignora */
                            }
                        }}
                        aria-label={recolhido ? "Expandir menu lateral" : "Recolher menu lateral"}
                        className="hidden size-10 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/10 lg:grid"
                    >
                        {recolhido ? <IconLayoutSidebarLeftExpand size={22} /> : <IconLayoutSidebarLeftCollapse size={22} />}
                    </button>

                    {pathname !== "/inicio" && pathname !== "/" ? (
                        <button
                            type="button"
                            onClick={() => router.back()}
                            aria-label="Voltar"
                            className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/10 lg:hidden"
                        >
                            <IconArrowLeft size={22} />
                        </button>
                    ) : null}

                    <nav aria-label="Você está em" className="flex min-w-0 flex-1 items-center gap-1.5 pl-2 text-[15px] lg:pl-0">
                        {modulo ? (
                            <>
                                <Link href={destinoDoModulo(modulo, has)} className="hidden shrink-0 font-semibold text-[#5B6478] dark:text-[#AEB9CF] sm:inline">
                                    {modulo.titulo}
                                </Link>
                                {item ? <IconChevronRight size={16} className="hidden shrink-0 text-[#7A8396] sm:inline" /> : null}
                            </>
                        ) : null}
                        <span className="truncate text-lg font-extrabold lg:text-[15px]">{item ? item.titulo : titulo}</span>
                    </nav>

                    <span
                        className={[
                            "hidden h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold sm:inline-flex",
                            online ? "bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/20 dark:text-white" : "bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white",
                        ].join(" ")}
                    >
                        <span className={["size-2 rounded-full", online ? "bg-[#7BA11A]" : "bg-[#F2CB3F]"].join(" ")} />
                        {online ? "Online" : "Offline"}
                    </span>
                    {headerRight ?? <AlternarTema />}
                </header>

                <main className="flex min-w-0 flex-1 flex-col pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-0 max-lg:landscape:pb-0">{children}</main>
            </div>

            <BarraCelular abas={abas} menuAberto={menuAberto} onMenu={() => setMenuAberto((v) => !v)} />

            {menuAberto ? (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#313C55]/45 lg:hidden max-lg:landscape:pl-[84px]" role="dialog" data-pai-overlay aria-modal="true" aria-label="Menu">
                    <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[#E3E8F0] bg-[#F6F8FB] shadow-2xl dark:border-white/[0.12] dark:bg-[#161C2A] max-lg:landscape:max-w-3xl">
                        <div className="flex items-center gap-2 border-b border-[#E3E8F0] bg-white px-4 py-2.5 dark:border-white/[0.12] dark:bg-[#232B3F]">
                            <h2 className="flex-1 text-lg font-extrabold">Menu</h2>
                            <button type="button" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" className="grid size-11 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/10">
                                <IconX size={22} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom)+72px)]">
                            <MenuModulos has={has} contadores={contadores} moduloAberto={modulo?.id ?? null} onNavegar={() => setMenuAberto(false)} />
                            <button
                                type="button"
                                onClick={sair}
                                disabled={saindo}
                                className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E3E8F0] bg-white text-[15px] font-extrabold text-[#313C55] disabled:opacity-60 dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-white"
                            >
                                <IconLogout size={20} />
                                {saindo ? "Saindo…" : "Sair da conta"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
