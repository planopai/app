"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header"; // remova se não usar
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import BarraCelular from "@/components/barra/BarraCelular";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { IconeAurora } from "@/components/shell/IconeAurora";
import { IconFile, IconHome } from "@tabler/icons-react";
import { useMenu } from "@/components/shell/useMenu";
import { acharModuloPorRota, MODULOS } from "@/components/shell/modulos";

/* ======================================================================
 * 06/11/2026 — até 5 telas abertas em abas, como no navegador (decisão de 03/11/2026; computador e tablet deitado, ≥ 1024 px).
 * Cada aba é a própria tela do app num quadro (iframe) da mesma origem: trocar de aba não perde o que estava na tela.
 * Dentro do quadro o app abre "limpo" (sem menu, cabeçalho e barra) e avisa a janela de cima quando muda de tela.
 * Clicar numa tela do menu, da pesquisa ou da página do módulo abre numa aba nova (ou vai para a aba em que ela já está).
 * Na 6ª, pede para fechar uma. O endereço da janela acompanha a aba ativa (o caminho no cabeçalho e a estrela seguem a aba).
 * 07/11/2026: páginas raiz (Início e a página de cada módulo) não contam no limite de 5. Elas usam uma aba só,
 * a "aba de navegação": abrir outra raiz troca a tela dessa aba em vez de abrir mais uma.
 * ==================================================================== */
const MAX_ABAS = 5;
const CHAVE_ABAS = "pai_abas_v1";
const SEM_ABAS = ["/quadrotv"];
type AbaTela = { id: string; src: string; path: string; titulo?: string };
const RAIZES_FIXAS = ["/", "/inicio"];

/** Página raiz = Início ou a página do módulo (o "hub"). Só o endereço exato; telas dentro do módulo contam normalmente. */
function ehPaginaRaiz(path: string, modulos: { hub: { href: string } }[]): boolean {
    const p = (path.split("?")[0] || "/").replace(/\/+$/, "") || "/";
    return RAIZES_FIXAS.includes(p) || modulos.some((m) => m.hub.href === p);
}

/** Abas que contam no limite (as que não são página raiz). */
function abasQueContam(lista: AbaTela[], modulos: { hub: { href: string } }[]): AbaTela[] {
    return lista.filter((a) => !ehPaginaRaiz(a.path, modulos));
}

function novaId() {
    return Math.random().toString(36).slice(2, 10);
}
function caminhoAtual() {
    return window.location.pathname + window.location.search;
}

function AbasDeTelas({ pathname }: { pathname: string }) {
    const menu = useMenu();
    const quadros = React.useRef<Record<string, HTMLIFrameElement | null>>({});
    const [abas, setAbas] = React.useState<AbaTela[]>(() => {
        try {
            const j = JSON.parse(window.sessionStorage.getItem(CHAVE_ABAS) || "null");
            if (Array.isArray(j?.abas) && j.abas.length) {
                // reabre as raízes que estavam abertas (no máximo uma) + até 5 telas
                const lista = (j.abas as AbaTela[]).map((a) => ({ ...a, src: a.path }));
                let raiz = false;
                let telas = 0;
                return lista.filter((a) => {
                    if (ehPaginaRaiz(a.path, MODULOS)) {
                        if (raiz) return false;
                        raiz = true;
                        return true;
                    }
                    telas += 1;
                    return telas <= MAX_ABAS;
                });
            }
        } catch {
            /* sem armazenamento: começa do zero */
        }
        return [];
    });
    const [ativa, setAtiva] = React.useState<string | null>(null);
    const [pedido, setPedido] = React.useState<string | null>(null);
    const ref = React.useRef({ abas, ativa, modulos: menu.modulos });
    ref.current = { abas, ativa, modulos: menu.modulos };

    const nomeDa = React.useCallback(
        (path: string, reserva?: string) => {
            const p = path.split("?")[0] || "/";
            if (p === "/") return { titulo: "Início", Icone: IconHome as React.ElementType<any> };
            const { modulo, item, fixo } = acharModuloPorRota(p, menu.modulos, menu.fixos);
            const it = item ?? fixo;
            if (it) return { titulo: it.titulo, Icone: it.icone };
            if (modulo) return { titulo: modulo.titulo, Icone: modulo.icone };
            const ult = decodeURIComponent(p.split("/").filter(Boolean).pop() || "").replace(/-/g, " ");
            return { titulo: reserva || ult.charAt(0).toUpperCase() + ult.slice(1), Icone: IconFile as React.ElementType<any> };
        },
        [menu.modulos, menu.fixos],
    );

    const abrir = React.useCallback((path: string) => {
        const { abas: lista, ativa: at, modulos } = ref.current;
        const atual = lista.find((a) => a.id === at);
        if (atual && atual.path === path) return;
        const ja = lista.find((a) => a.path === path);
        if (ja) {
            setAtiva(ja.id);
            return;
        }
        // Página raiz: reaproveita a aba de navegação (uma raiz já aberta) e não conta no limite.
        if (ehPaginaRaiz(path, modulos)) {
            const raiz = lista.find((a) => ehPaginaRaiz(a.path, modulos));
            if (raiz) {
                const quadro = quadros.current[raiz.id];
                if (raiz.src === path && quadro?.contentWindow) {
                    try {
                        quadro.contentWindow.location.assign(path);
                    } catch {
                        /* mesma origem; se falhar, o src abaixo resolve na próxima troca */
                    }
                }
                setAbas(lista.map((a) => (a.id === raiz.id ? { ...a, src: path, path, titulo: undefined } : a)));
                setAtiva(raiz.id);
                return;
            }
            const nova = { id: novaId(), src: path, path };
            setAbas([...lista, nova]);
            setAtiva(nova.id);
            return;
        }
        if (abasQueContam(lista, modulos).length >= MAX_ABAS) {
            setPedido(path);
            return;
        }
        const nova = { id: novaId(), src: path, path };
        setAbas([...lista, nova]);
        setAtiva(nova.id);
    }, []);

    // mudou o endereço da janela (menu, pesquisa, links do cabeçalho): abre na aba certa
    React.useEffect(() => {
        abrir(caminhoAtual());
    }, [pathname, abrir]);

    // o endereço da janela acompanha a aba ativa
    React.useEffect(() => {
        const a = abas.find((x) => x.id === ativa);
        if (a && a.path !== caminhoAtual()) window.history.replaceState(null, "", a.path);
    }, [ativa, abas]);

    // guarda as abas desta janela (recarregar a página reabre as mesmas)
    React.useEffect(() => {
        try {
            window.sessionStorage.setItem(CHAVE_ABAS, JSON.stringify({ abas: abas.map(({ id, path, titulo }) => ({ id, path, titulo })) }));
        } catch {
            /* sem armazenamento */
        }
    }, [abas]);

    // a tela dentro da aba avisa quando muda de endereço
    React.useEffect(() => {
        const f = (e: MessageEvent) => {
            if (e.origin !== window.location.origin) return;
            if (e.data?.pai === "abrir" && typeof e.data.path === "string") {
                abrir(e.data.path);
                return;
            }
            if (e.data?.pai !== "rota") return;
            const id = Object.keys(quadros.current).find((k) => quadros.current[k]?.contentWindow === e.source);
            if (!id) return;
            setAbas((lista) => lista.map((a) => (a.id === id ? { ...a, path: String(e.data.path || a.path), titulo: e.data.titulo ? String(e.data.titulo) : a.titulo } : a)));
        };
        window.addEventListener("message", f);
        return () => window.removeEventListener("message", f);
    }, [abrir]);

    const fechar = (id: string) => {
        const lista = ref.current.abas.filter((a) => a.id !== id);
        delete quadros.current[id];
        if (!lista.length) {
            const inicio = { id: novaId(), src: "/", path: "/" };
            setAbas([inicio]);
            setAtiva(inicio.id);
            return;
        }
        setAbas(lista);
        if (ref.current.ativa === id) setAtiva(lista[lista.length - 1].id);
    };
    const fecharEAbrir = (id: string) => {
        const alvo = pedido;
        const lista = ref.current.abas.filter((a) => a.id !== id);
        delete quadros.current[id];
        setPedido(null);
        if (!alvo) return;
        const nova = { id: novaId(), src: alvo, path: alvo };
        setAbas([...lista, nova]);
        setAtiva(nova.id);
    };
    const cancelarPedido = () => {
        setPedido(null);
        const a = ref.current.abas.find((x) => x.id === ref.current.ativa);
        if (a) window.history.replaceState(null, "", a.path);
    };

    React.useEffect(() => {
        if (!pedido) return;
        const k = (e: KeyboardEvent) => {
            if (e.key === "Escape") cancelarPedido();
        };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pedido]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div role="tablist" aria-label="Telas abertas" className="flex h-12 shrink-0 items-end gap-1 overflow-x-auto bg-[#E4EAF2] px-3 [scrollbar-width:none] dark:bg-[#1C2334]">
                {abas.map((a) => {
                    const { titulo, Icone } = nomeDa(a.path, a.titulo);
                    const on = a.id === ativa;
                    return (
                        <div
                            key={a.id}
                            className={`flex h-10 min-w-[120px] max-w-[230px] shrink-0 items-center gap-1.5 rounded-t-xl pl-3 pr-1 ${on ? "bg-[#F6F8FB] text-[#313C55] dark:bg-[#161C2A] dark:text-white" : "text-[#5B6478] hover:bg-white/50 dark:text-[#AEB9CF] dark:hover:bg-white/[0.05]"}`}
                        >
                            <Icone size={17} className="shrink-0" />
                            <button
                                type="button"
                                role="tab"
                                aria-selected={on}
                                title={titulo}
                                onClick={() => setAtiva(a.id)}
                                className={`h-full min-w-0 flex-1 truncate text-left text-[14px] ${on ? "font-extrabold" : "font-bold"}`}
                            >
                                {titulo}
                            </button>
                            <button type="button" aria-label={`Fechar ${titulo}`} onClick={() => fechar(a.id)} className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-black/[0.06] dark:hover:bg-white/10">
                                <IconX size={15} />
                            </button>
                        </div>
                    );
                })}
            </div>
            <div className="relative min-h-0 flex-1 bg-[#F6F8FB] dark:bg-[#161C2A]">
                {abas.map((a) => (
                    <iframe
                        key={a.id}
                        ref={(el) => {
                            quadros.current[a.id] = el;
                        }}
                        src={a.src}
                        title={nomeDa(a.path, a.titulo).titulo}
                        className={`absolute inset-0 h-full w-full border-0 ${a.id === ativa ? "" : "pointer-events-none invisible"}`}
                    />
                ))}
            </div>

            {pedido
                ? createPortal(
                      <div
                          data-pai-overlay
                          role="dialog"
                          aria-modal="true"
                          aria-label="5 abas abertas"
                          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#313C55]/45 p-6"
                          onClick={(e) => {
                              if (e.target === e.currentTarget) cancelarPedido();
                          }}
                      >
                          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white">
                              <div className="px-6 py-5">
                                  <h2 className="text-[20px] font-extrabold">{MAX_ABAS} abas abertas</h2>
                                  <p className="mt-1 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Feche uma para abrir {nomeDa(pedido).titulo}</p>
                              </div>
                              {abasQueContam(abas, menu.modulos).map((a) => (
                                  <div key={a.id} className="flex items-center gap-3 border-t border-[#E3E8F0] px-6 py-2.5 text-[15px] font-bold dark:border-white/[0.08]">
                                      <span className="min-w-0 flex-1 truncate">{nomeDa(a.path, a.titulo).titulo}</span>
                                      <button
                                          type="button"
                                          onClick={() => fecharEAbrir(a.id)}
                                          className="inline-flex h-10 items-center justify-center rounded-xl border border-[#C9D1DE] px-4 text-[14px] font-extrabold hover:border-[#313C55] dark:border-white/[0.2]"
                                      >
                                          Fechar
                                      </button>
                                  </div>
                              ))}
                              <div className="flex justify-end border-t border-[#E3E8F0] bg-[#F6F8FB] px-6 py-3 dark:border-white/[0.08] dark:bg-[#1C2334]">
                                  <button type="button" onClick={cancelarPedido} className="inline-flex h-11 items-center justify-center rounded-xl border border-[#C9D1DE] bg-white px-5 text-[14px] font-extrabold dark:border-white/[0.2] dark:bg-[#232B3F]">
                                      Cancelar
                                  </button>
                              </div>
                          </div>
                      </div>,
                      document.body,
                  )
                : null}
        </div>
    );
}

/**
 * 06/11/2026 — Aurora em botão flutuante em todo o app (decisão de 03/11/2026).
 * O botão abre um painel com o próprio Chat da Aurora (/chat) por cima da tela atual, sem sair dela.
 * Não aparece no Chat, no login, na TV do Quadro nem dentro do próprio painel.
 */
const SEM_AURORA = ["/chat", "/login", "/quadrotv"];

function AuroraFlutuante({ pathname }: { pathname: string }) {
    const [aberta, setAberta] = React.useState(false);
    const [usada, setUsada] = React.useState(false); // o painel só carrega o Chat no primeiro clique e depois fica montado
    const [tv, setTv] = React.useState(false);
    React.useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        setTv(q.has("tv") || q.get("modo") === "tv");
    }, [pathname]);
    React.useEffect(() => {
        if (!aberta) return;
        const k = (e: KeyboardEvent) => {
            if (e.key === "Escape") setAberta(false);
        };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [aberta]);
    if (tv || SEM_AURORA.some((r) => pathname === r || pathname.startsWith(r + "/"))) return null;
    return createPortal(
        <>
            {usada ? (
                <section
                    aria-label="Aurora"
                    hidden={!aberta}
                    className="fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-[65] flex flex-col overflow-hidden rounded-t-3xl border border-[#E3E8F0] bg-white shadow-[0_20px_50px_rgba(49,60,85,.25)] dark:border-white/[0.12] dark:bg-[#232B3F] lg:inset-auto lg:bottom-[104px] lg:right-7 lg:h-[min(680px,calc(100dvh-140px))] lg:w-[420px] lg:rounded-[20px]"
                >
                    <div className="flex items-center gap-2.5 bg-[#313C55] px-4 py-3 text-white">
                        <IconeAurora size={22} />
                        <h2 className="flex-1 text-[17px] font-extrabold">Aurora</h2>
                        <button type="button" aria-label="Fechar a Aurora" onClick={() => setAberta(false)} className="grid size-10 place-items-center rounded-xl hover:bg-white/10">
                            <IconX size={20} />
                        </button>
                    </div>
                    <iframe src="/chat" title="Aurora" className="min-h-0 w-full flex-1 border-0" />
                </section>
            ) : null}
            <button
                type="button"
                aria-label={aberta ? "Fechar a Aurora" : "Abrir a Aurora"}
                aria-expanded={aberta}
                onClick={() => {
                    setUsada(true);
                    setAberta((v) => !v);
                }}
                className={[
                    "fixed z-[60] grid place-items-center rounded-full shadow-[0_10px_28px_rgba(49,60,85,.30)] transition",
                    "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 size-[52px] lg:bottom-7 lg:right-7 lg:size-16",
                    aberta ? "bg-[#313C55] text-[#F2CB3F] max-lg:hidden" : "bg-[#F2CB3F] text-[#313C55] hover:bg-[#E4BC30]",
                ].join(" ")}
            >
                <IconeAurora className="size-[26px] lg:size-[30px]" strokeWidth={2} />
            </button>
        </>,
        document.body,
    );
}

type Props = {
    children: React.ReactNode;
    /** Rotas onde não queremos sidebar/header (ex.: /login) */
    hideOnRoutes?: string[];
};

/**
 * Renderiza o layout com Sidebar/Header em todas as páginas,
 * exceto nas rotas listadas em `hideOnRoutes`.
 */
export default function AppShell({
    children,
    hideOnRoutes = ["/login"],
}: Props) {
    const pathname = usePathname();
    const shouldHide = hideOnRoutes.some(
        (r) => pathname === r || pathname.startsWith(r + "/")
    );
    /* 06/11/2026: dentro do painel da Aurora (iframe) a tela abre limpa, sem menu, cabeçalho e barra. */
    const [noPainel, setNoPainel] = React.useState(false);
    const [montado, setMontado] = React.useState(false);
    React.useEffect(() => {
        setMontado(true);
        try {
            setNoPainel(window.self !== window.top);
        } catch {
            setNoPainel(true);
        }
    }, []);

    /* 06/11/2026: dentro de uma aba (iframe), avisa a janela de cima a cada troca de tela; o login abre na janela inteira. */
    React.useEffect(() => {
        if (!noPainel) return;
        try {
            if (pathname === "/login" && window.top) {
                window.top.location.href = "/login";
                return;
            }
            window.parent.postMessage({ pai: "rota", path: window.location.pathname + window.location.search, titulo: document.title }, window.location.origin);
        } catch {
            /* fora do app */
        }
    }, [noPainel, pathname]);

    /* 06/11/2026: dentro de uma aba, no Início e nas páginas de módulo, clicar numa tela abre numa aba nova (como na prévia). */
    const menuShell = useMenu();
    React.useEffect(() => {
        if (!noPainel) return;
        const p = pathname || "/";
        const r = acharModuloPorRota(p, menuShell.modulos, menuShell.fixos);
        const ehEntrada = p === "/" || (!!r.modulo && !r.item && !r.fixo);
        if (!ehEntrada) return;
        const f = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
            if (!a || a.target === "_blank") return;
            const u = new URL(a.href, window.location.href);
            if (u.origin !== window.location.origin || u.pathname === p) return;
            e.preventDefault();
            e.stopPropagation();
            window.parent.postMessage({ pai: "abrir", path: u.pathname + u.search }, window.location.origin);
        };
        document.addEventListener("click", f, true);
        return () => document.removeEventListener("click", f, true);
    }, [noPainel, pathname, menuShell.modulos, menuShell.fixos]);

    /* abas só no computador e no tablet deitado (≥ 1024 px) e fora da TV */
    const [largo, setLargo] = React.useState(false);
    React.useEffect(() => {
        const mq = window.matchMedia("(min-width: 1024px)");
        const f = () => setLargo(mq.matches);
        f();
        mq.addEventListener?.("change", f);
        return () => mq.removeEventListener?.("change", f);
    }, []);
    const [tv, setTv] = React.useState(false);
    React.useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        setTv(q.has("tv") || q.get("modo") === "tv");
    }, [pathname]);
    const usarAbas = montado && !noPainel && !shouldHide && largo && !tv && !SEM_ABAS.some((r) => pathname === r || pathname.startsWith(r + "/"));

    if (shouldHide || noPainel) {
        // Página "clean" (ex.: tela de login)
        return <div className="flex min-h-dvh flex-col">{children}</div>;
    }

    return (
        <SidebarProvider
            /* Menu lateral fixo no computador (não recolhe). No celular/tablet (< 1024 px) ele vira gaveta, aberta pelo Menu da barra de baixo. */
            open
            onOpenChange={() => undefined}
            style={
                {
                    // ajuste livre
                    // 06/11/2026: trilho só com os módulos no computador (96 px + a margem do formato "inset")
                    "--sidebar-width": "7rem",
                    "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
            }
        >
            <AppSidebar variant="inset" />
            {/*
             * iPhone (09/10/2026): no celular/tablet (< 1024 px) a PÁGINA não rola mais — rola só a área do conteúdo.
             * Com a página rolando, o Safari do iPhone recolhe a barra de endereço e redesenha o que é fixo: a barra de baixo
             * ia para o meio da tela. Com a página parada, a barra fica sempre no rodapé. No computador nada muda.
             */}
            <style>{`@media (max-width: 1023.98px) { html, body { height: 100%; overflow: hidden; overscroll-behavior: none; } }`}</style>
            <SidebarInset className={`max-lg:h-[100dvh] max-lg:min-h-0 max-lg:overflow-hidden md:max-lg:h-[calc(100dvh-1rem)] ${usarAbas ? "lg:h-[calc(100dvh-1rem)] lg:overflow-hidden" : ""}`}>
                {/* Header global (remova se não quiser) */}
                <SiteHeader />
                {/*
                 * 06/11/2026: a tela ocupa só o espaço que sobra abaixo do cabeçalho. Várias telas usam min-h de 100dvh, que somado ao
                 * cabeçalho passava da janela e fazia a página rolar ("mexer") mesmo sem conteúdo. Aqui a tela cresce até o fim
                 * da área (flex-1) e o min-h dela é zerado, então só rola quando o conteúdo é maior que a tela.
                 */}
                {usarAbas ? (
                    <AbasDeTelas pathname={pathname} />
                ) : (
                    <div data-pai-rolagem className="flex flex-1 flex-col max-lg:min-h-0 max-lg:overflow-y-auto max-lg:overscroll-y-contain [&>*]:flex-1 [&>*]:!min-h-0">
                        {children}
                    </div>
                )}
                {/*
                 * Barra de baixo do celular (5 atalhos + Menu); some no computador.
                 * 14/10/2026: fica FORA da área que rola. O espaço que ela reserva vem logo abaixo da área de rolagem, então a tela
                 * fica enquadrada entre o cabeçalho e a barra. Dentro da área que rola (coluna flex com altura fixa), esse espaço
                 * encolhia até 0 e o fim de toda tela longa ficava atrás da barra.
                 */}
                <BarraCelular />
            </SidebarInset>
            {montado ? <AuroraFlutuante pathname={pathname} /> : null}
        </SidebarProvider>
    );
}
