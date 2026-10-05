"use client";

/**
 * Menu do celular, como no mockup "Repaginada do app PAI": uma tela com "Acesso rápido" e os módulos que abrem e fecham
 * (cada módulo mostra "Visão geral" e as telas que o usuário pode abrir, com os números). NÃO é a barra lateral/gaveta.
 *
 *  - Abre pelo botão "Menu" da barra de baixo e pelo botão de menu do cabeçalho (só no celular, abaixo de 768 px),
 *    em qualquer rota (inclusive onde a barra de baixo está escondida).
 *  - Fecha ao navegar, ao tocar em X, ao tocar fora ou com Esc.
 *  - No fim: Personalizar barra, Ajuda e Sair da conta (o mesmo "Sair" do menu lateral).
 *
 * Montagem: <MenuCelularHost /> uma vez dentro do AppShell. Para abrir de qualquer lugar: abrirMenuCelular().
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    IconAdjustmentsHorizontal,
    IconChevronDown,
    IconChevronRight,
    IconHelp,
    IconLogout,
    IconMenu2,
    IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { usePerms } from "@/app/_perms/PermsProvider";
import { clearOfflineContextOnLogout } from "@/lib/offline/logout";
import { useNaoLidas } from "@/components/messenger/ContadorMenu";
import { FIXOS, MODULOS, destinoDoModulo, hrefDoItem, itemVisivel, itensVisiveis, moduloVisivel, type ItemModulo } from "./modulos";
import { formatarSelo, useContadores } from "./useContadores";

export const EVENTO_ABRIR_MENU = "pai:abrir-menu";
export const EVENTO_ESTADO_MENU = "pai:estado-menu";

/** Abre (ou fecha, se já estiver aberto) o menu do celular. */
export function abrirMenuCelular() {
    window.dispatchEvent(new Event(EVENTO_ABRIR_MENU));
}

/** Botão de menu do cabeçalho: só aparece no celular. */
export function BotaoMenuCelular() {
    return (
        <Button variant="ghost" size="icon" className="-ml-1 h-8 w-8 md:hidden" onClick={abrirMenuCelular} aria-label="Abrir o menu" title="Menu">
            <IconMenu2 className="h-4 w-4" />
        </Button>
    );
}

/** Acompanha se o menu está aberto (para a barra de baixo marcar "Menu"). */
export function useMenuCelularAberto(): boolean {
    const [aberto, setAberto] = useState(false);
    useEffect(() => {
        const f = (e: Event) => setAberto(Boolean((e as CustomEvent).detail));
        window.addEventListener(EVENTO_ESTADO_MENU, f);
        return () => window.removeEventListener(EVENTO_ESTADO_MENU, f);
    }, []);
    return aberto;
}

function Selo({ valor }: { valor: string }) {
    if (!valor) return null;
    return (
        <span className="inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-[#F2CB3F] px-2 text-xs font-extrabold text-[#313C55]">{valor}</span>
    );
}

const CARD = "overflow-hidden rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
const LINHA =
    "flex min-h-[52px] items-center gap-3 border-t border-[#E3E8F0] px-4 text-[15px] font-semibold text-[#313C55] first:border-t-0 hover:bg-[#EEF2F7] dark:border-white/[0.12] dark:text-white dark:hover:bg-white/10";
const ROTULO = "text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]";

export default function MenuCelularHost() {
    const pathname = usePathname() || "/";
    const router = useRouter();
    const { perms, has } = usePerms();
    const numeros = useContadores(perms, has);
    const temMessenger = perms !== null && has("messenger");
    const naoLidas = useNaoLidas(temMessenger);
    const contMessenger = naoLidas.carregado ? naoLidas.total + naoLidas.fila : null;

    const [aberto, setAberto] = useState(false);
    const [temBarra, setTemBarra] = useState(false);
    const [topo, setTopo] = useState<number | null>(null);
    const [moduloAberto, setModuloAberto] = useState<string | null>(null);
    const [saindo, setSaindo] = useState(false);

    const moduloDaRota = useMemo(() => {
        const bate = (h: string) => pathname === h || pathname.startsWith(h + "/");
        return MODULOS.find((m) => m.itens.some((i) => [i.href, ...(i.alternativas || []).map((a) => a.href)].some(bate)))?.id ?? null;
    }, [pathname]);

    const fechar = useCallback(() => setAberto(false), []);

    /* Onde começa o menu: logo abaixo do cabeçalho de verdade. No iPhone (app instalado) o conteúdo começa abaixo da barra de status,
       então medir o cabeçalho (sticky) evita o título e o X ficarem escondidos atrás dele. */
    const medirTopo = useCallback(() => {
        const h = document.querySelector("header.sticky") as HTMLElement | null;
        const b = h ? Math.round(h.getBoundingClientRect().bottom) : 0;
        setTopo(b > 0 ? b : null);
    }, []);

    // abre/fecha pelo evento; ao abrir, vê se a barra de baixo está na tela (para não ficar por baixo dela)
    useEffect(() => {
        const alternar = () =>
            setAberto((v) => {
                const novo = !v;
                if (novo) {
                    medirTopo();
                    setTemBarra(Boolean(document.querySelector('[data-pai-barra="true"]')));
                    setModuloAberto((atual) => atual ?? moduloDaRota);
                }
                return novo;
            });
        window.addEventListener(EVENTO_ABRIR_MENU, alternar);
        return () => window.removeEventListener(EVENTO_ABRIR_MENU, alternar);
    }, [moduloDaRota, medirTopo]);

    useEffect(() => {
        setAberto(false);
    }, [pathname]);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent(EVENTO_ESTADO_MENU, { detail: aberto }));
        if (!aberto) return;
        const aoTecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
        window.addEventListener("keydown", aoTecla);
        window.addEventListener("resize", medirTopo);
        window.addEventListener("orientationchange", medirTopo);
        return () => {
            window.removeEventListener("keydown", aoTecla);
            window.removeEventListener("resize", medirTopo);
            window.removeEventListener("orientationchange", medirTopo);
        };
    }, [aberto, medirTopo]);

    /* mesmo "Sair" do menu lateral: limpa o contexto offline, encerra a sessão e vai para o login */
    const sair = async () => {
        if (saindo) return;
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
            setAberto(false);
            router.replace("/login");
            setSaindo(false);
        }
    };

    if (!aberto || perms === null) return null;

    const seloDe = (item: ItemModulo): string => {
        if (item.selo === "messenger") return formatarSelo(contMessenger);
        if (item.selo === "aguardando") return formatarSelo(numeros.aguardando);
        if (item.selo === "avisos") return formatarSelo(numeros.avisos);
        if (item.selo === "coroas") return formatarSelo(numeros.coroas);
        if (item.selo === "estoque") return formatarSelo(numeros.estoque);
        return "";
    };

    const messenger = MODULOS.find((m) => m.id === "comunicacao")!.itens.find((i) => i.href === "/messenger")!;
    const rapidos = [
        FIXOS.find((f) => f.titulo === "Quadro de Atendimentos")!,
        FIXOS.find((f) => f.titulo === "Minhas OS")!,
        messenger,
        FIXOS.find((f) => f.titulo === "Chat")!,
        FIXOS.find((f) => f.titulo === "Avisos")!,
    ].filter((i) => itemVisivel(i, has));
    const modulos = MODULOS.filter((m) => moduloVisivel(m, has));

    return (
        <>
            {/* toque fora do menu (a faixa de baixo e a de cima ficam livres) */}
            <div
                className="fixed inset-x-0 z-30 overflow-y-auto overscroll-contain bg-[#F6F8FB] pb-6 text-[#313C55] dark:bg-[#161C2A] dark:text-white md:hidden"
                style={{
                    top: topo !== null ? `${topo}px` : "var(--header-height, 3rem)",
                    bottom: temBarra ? "calc(4.25rem + env(safe-area-inset-bottom))" : "env(safe-area-inset-bottom)",
                }}
                role="region"
                aria-label="Menu"
            >
                <div className="mx-auto w-full max-w-xl space-y-4 p-4">
                    <div className="flex items-center gap-2">
                        <h2 className="flex-1 text-xl font-extrabold">Menu</h2>
                        <button
                            type="button"
                            onClick={fechar}
                            aria-label="Fechar o menu"
                            className="grid size-11 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/10"
                        >
                            <IconX size={22} />
                        </button>
                    </div>

                    <p className={ROTULO}>Acesso rápido</p>
                    <div className={CARD}>
                        {rapidos.map((f) => {
                            const Icon = f.icone;
                            return (
                                <Link key={f.href} href={f.href} className={LINHA}>
                                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E6F7FE] text-[#313C55] dark:bg-[#00AEEC]/20 dark:text-white">
                                        <Icon size={20} />
                                    </span>
                                    <span className="flex-1 font-extrabold">{f.titulo}</span>
                                    <Selo valor={seloDe(f)} />
                                    <IconChevronRight size={18} className="text-[#7A8396]" />
                                </Link>
                            );
                        })}
                    </div>

                    <p className={`${ROTULO} pt-2`}>Módulos</p>
                    <div className="grid grid-cols-1 gap-2.5 sm:landscape:grid-cols-2">
                        {modulos.map((m) => {
                            const Icon = m.icone;
                            const abertoM = moduloAberto === m.id;
                            const itens = itensVisiveis(m, has);
                            return (
                                <div key={m.id} className={CARD}>
                                    <button
                                        type="button"
                                        onClick={() => setModuloAberto(abertoM ? null : m.id)}
                                        aria-expanded={abertoM}
                                        className="flex min-h-[60px] w-full items-center gap-3.5 px-4 text-left"
                                    >
                                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#EEF2F7] dark:bg-white/10">
                                            <Icon size={20} />
                                        </span>
                                        <span className="flex-1 text-base font-extrabold">{m.titulo}</span>
                                        {m.selo === "estoque" ? <Selo valor={formatarSelo(numeros.estoque)} /> : null}
                                        {abertoM ? <IconChevronDown size={18} className="text-[#7A8396]" /> : <IconChevronRight size={18} className="text-[#7A8396]" />}
                                    </button>
                                    {abertoM ? (
                                        <div>
                                            <Link href={destinoDoModulo(m, has)} className={LINHA}>
                                                <span className="flex-1 font-extrabold">Visão geral de {m.titulo}</span>
                                                <IconChevronRight size={16} className="text-[#7A8396]" />
                                            </Link>
                                            {itens.map((i, pos) => (
                                                <React.Fragment key={i.titulo}>
                                                    {i.secao && i.secao !== itens[pos - 1]?.secao ? (
                                                        <p className="border-t border-[#E3E8F0] bg-[#F6F8FB] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:border-white/[0.12] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                                            {i.secao}
                                                        </p>
                                                    ) : null}
                                                    <Link href={hrefDoItem(i, has)} className={LINHA}>
                                                        <span className="flex-1">{i.titulo}</span>
                                                        <Selo valor={seloDe(i)} />
                                                        <IconChevronRight size={16} className="text-[#7A8396]" />
                                                    </Link>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>

                    <div className={`${CARD} mt-2`}>
                        <Link href="/personalizar-barra" className={LINHA}>
                            <IconAdjustmentsHorizontal size={20} />
                            <span className="flex-1">Personalizar barra</span>
                            <IconChevronRight size={16} className="text-[#7A8396]" />
                        </Link>
                        <Link href="/help" className={LINHA}>
                            <IconHelp size={20} />
                            <span className="flex-1">Ajuda</span>
                            <IconChevronRight size={16} className="text-[#7A8396]" />
                        </Link>
                        <button type="button" onClick={sair} disabled={saindo} className={`${LINHA} w-full text-left text-[#B42318] disabled:opacity-60 dark:text-[#FF9C92]`}>
                            <IconLogout size={20} />
                            <span className="flex-1">{saindo ? "Saindo..." : "Sair da conta"}</span>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
