"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import {
    PAI_PAGES_CACHE,
    PAI_START_CACHE,
    isOfflineRoute,
    normalizeOfflinePath,
} from "@/lib/offline/routes";
import {
    applyNetworkStatusToDocument,
    isOnlineNow,
} from "@/lib/offline/network";
import { syncOperationalQueue } from "@/lib/offline/sync-engine";
import { requestOperationalBackgroundSync } from "@/lib/offline/background-sync";
import { pedirArmazenamentoPersistente } from "@/lib/offline/storage";
import { dentroDeAba } from "@/lib/abas";

const WARMUP_STATE_KEY =
    "pai_offline_routes_warmup_v2";

/*
 * Telas abertas sem login (as mesmas PUBLIC_PATHS do middleware.ts).
 * Nelas não há fila para sincronizar nem telas para guardar offline:
 * o servidor responderia 401 e as rotas redirecionariam para /login.
 */
const ROTAS_PUBLICAS = new Set<string>([
    "/login",
    "/ajuda",
]);

function ehRotaPublica(pathname: string | null | undefined): boolean {
    const p = String(pathname || "/").replace(/\/+$/, "") || "/";
    return ROTAS_PUBLICAS.has(p);
}

function emTelaPublica(): boolean {
    return typeof window !== "undefined" && ehRotaPublica(window.location.pathname);
}

/**
 * Evita disparar dezenas de requisições repetidamente em um intervalo curto.
 * Se uma rota estiver ausente do cache, ela continua sendo preparada mesmo
 * dentro da janela abaixo.
 */
const FULL_REFRESH_INTERVAL_MS =
    30 * 60 * 1000;

const WARMUP_CONCURRENCY = 2; // 19/11/2026: era 4 (disputava a internet com o uso normal)

/*
 * Desempenho (19/11/2026): antes eram preparadas TODAS as telas de OFFLINE_ROUTES (cerca de 50, inclusive
 * telas que já saíram do app), logo depois do login e a cada 30 min. Agora só as telas de trabalho na rua,
 * e só as que a pessoa pode abrir (permissões guardadas pelo PermsProvider). As outras telas continuam
 * sendo guardadas quando a pessoa as abre (cache das páginas do Service Worker).
 * Rota → chave de permissão (null = todos).
 */
const ROTAS_AQUECER: Array<[string, string | null]> = [
    ["/", null],
    ["/acompanhamento", "acompanhamento"],
    ["/quadro-acompanhamento", "quadro-acompanhamento"],
    ["/coroa-de-flores", "coroa-de-flores"],
    ["/avisos", "avisos"],
    ["/requisicao", "requisicao"],
    ["/solicitar-produto", "solicitar-produto"],
    ["/minhas-solicitacoes", "minhas-solicitacoes"],
];

function permissoesGuardadas(): string[] | null {
    try {
        const uid = decodeURIComponent((document.cookie.match(/(?:^|;\s*)pai_uid=([^;]*)/) || [])[1] || "");
        if (!uid) return null;
        const bruto = window.localStorage.getItem(`pai_permissions_v1:${uid}`);
        if (!bruto) return null;
        const j = JSON.parse(bruto);
        const lista = Array.isArray(j) ? j : j?.perms;
        return Array.isArray(lista) ? lista.map(String) : null;
    } catch {
        return null;
    }
}

function rotasParaPreparar(): string[] {
    const perms = permissoesGuardadas();
    // Sem saber as permissões: só a Home e Atendimentos (as essenciais do Service Worker).
    if (!perms) return ["/", "/acompanhamento"];
    const todas = perms.includes("*");
    return ROTAS_AQUECER.filter(([, chave]) => chave === null || todas || perms.includes(chave)).map(([rota]) => rota);
}

/** Internet fraca ou economia de dados ligada: não prepara nada agora. */
function redeFraca(): boolean {
    const c: any = (navigator as any).connection;
    if (!c) return false;
    return !!c.saveData || c.effectiveType === "slow-2g" || c.effectiveType === "2g";
}

/** Espera o app ficar parado (até 8 s + ocioso) antes de baixar as telas. */
function esperarOcioso(): Promise<void> {
    return new Promise((ok) => {
        window.setTimeout(() => {
            const ric: any = (window as any).requestIdleCallback;
            if (typeof ric === "function") ric(() => ok(), { timeout: 10000 });
            else ok();
        }, 8000);
    });
}

let preparandoRotas = false;

type WarmupState = {
    completedAt: number;
};

function readWarmupState(): WarmupState | null {
    try {
        const raw = window.localStorage.getItem(
            WARMUP_STATE_KEY
        );

        if (!raw) return null;

        const parsed = JSON.parse(raw);

        if (
            !parsed ||
            typeof parsed.completedAt !== "number"
        ) {
            return null;
        }

        return parsed as WarmupState;
    } catch {
        return null;
    }
}

function writeWarmupState(): void {
    try {
        const value: WarmupState = {
            completedAt: Date.now(),
        };

        window.localStorage.setItem(
            WARMUP_STATE_KEY,
            JSON.stringify(value)
        );
    } catch {
        // O cache continua funcionando mesmo sem localStorage.
    }
}

function samePath(
    a: string,
    b: string
): boolean {
    return (
        normalizeOfflinePath(a) ===
        normalizeOfflinePath(b)
    );
}

async function responseIsUsableHtml(
    response: Response,
    expectedPath: string
): Promise<boolean> {
    if (!response.ok) return false;

    const finalUrl = new URL(
        response.url,
        window.location.origin
    );

    // Nunca guardar uma página que redirecionou para login
    // ou para outro endereço.
    if (
        finalUrl.origin !== window.location.origin ||
        !samePath(finalUrl.pathname, expectedPath)
    ) {
        return false;
    }

    const contentType =
        response.headers.get("content-type") || "";

    return contentType
        .toLowerCase()
        .includes("text/html");
}

async function fetchRouteHtml(
    route: string
): Promise<Response | null> {
    try {
        const response = await fetch(route, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            redirect: "follow",
            headers: {
                Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });

        const usable =
            await responseIsUsableHtml(
                response,
                route
            );

        return usable ? response : null;
    } catch {
        return null;
    }
}

/**
 * 16/11/2026: só guarda uma tela se os arquivos (JS e CSS) que ela pede
 * estiverem guardados no aparelho (os que faltam são baixados antes). Logo depois de um deploy,
 * o servidor já devolve a tela nova, mas o Service Worker ainda é o anterior:
 * guardar essa tela faria ela abrir sem estilo ou parada no logo sem internet.
 */
async function arquivosDaTelaGuardados(
    response: Response
): Promise<boolean> {
    if (!navigator.serviceWorker?.controller) return false;

    let html = "";
    try {
        html = await response.clone().text();
    } catch {
        return false;
    }

    const arquivos = Array.from(
        new Set(
            html.match(/\/_next\/static\/[^"'\s)\\]+\.(?:js|css)/g) ?? []
        )
    );

    for (const arquivo of arquivos) {
        const achou = await caches
            .match(arquivo, { ignoreSearch: true })
            .catch(() => undefined);
        if (achou) continue;

        /*
         * Falta o arquivo: baixa agora. O pedido passa pelo Service Worker
         * (worker/index.js), que guarda em pai-arquivos-v1.
         */
        try {
            const r = await fetch(arquivo, { credentials: "same-origin" });
            if (!r.ok) return false;
        } catch {
            return false;
        }
        const agora = await caches
            .match(arquivo, { ignoreSearch: true })
            .catch(() => undefined);
        if (!agora) return false;
    }

    return true;
}

async function cacheHasRoute(
    cache: Cache,
    route: string
): Promise<boolean> {
    try {
        return Boolean(
            await cache.match(route, {
                ignoreSearch: true,
            })
        );
    } catch {
        return false;
    }
}

async function prepareOneRoute(
    route: string,
    forceRefresh: boolean,
    startCache: Cache,
    pagesCache: Cache
): Promise<boolean> {
    const targetCache =
        route === "/"
            ? startCache
            : pagesCache;

    if (!forceRefresh) {
        const alreadyCached =
            await cacheHasRoute(
                targetCache,
                route
            );

        if (alreadyCached) {
            return true;
        }
    }

    const response =
        await fetchRouteHtml(route);

    if (!response) {
        return false;
    }

    if (!(await arquivosDaTelaGuardados(response))) {
        return false;
    }

    try {
        await targetCache.put(
            route,
            response.clone()
        );

        return true;
    } catch {
        return false;
    }
}

async function prepareOfflineRoutes(
    forceRefresh = false
): Promise<void> {
    if (emTelaPublica()) return;
    if (!isOnlineNow()) return;
    if (!("caches" in window)) return;
    if (preparandoRotas) return; // vários gatilhos ao mesmo tempo: roda uma vez só
    if (redeFraca()) return;
    if (dentroDeAba()) return; // 19/11/2026: nas abas do computador quem prepara é a janela principal
    preparandoRotas = true;
    try {
    await esperarOcioso();
    if (!isOnlineNow() || emTelaPublica()) return;
    // 19/11/2026: página aberta sem o Service Worker no controle (ex.: Ctrl+Shift+R) não consegue guardar nada;
    // antes tentava as 8 telas e mostrava "0 ok, 8 falharam". A próxima abertura normal prepara as telas.
    if (!navigator.serviceWorker?.controller) return;
    const ROTAS = rotasParaPreparar();

    const previous =
        readWarmupState();

    const shouldRefreshAll =
        forceRefresh ||
        !previous ||
        Date.now() - previous.completedAt >
        FULL_REFRESH_INTERVAL_MS;

    const [startCache, pagesCache] =
        await Promise.all([
            caches.open(PAI_START_CACHE),
            caches.open(PAI_PAGES_CACHE),
        ]);

    let nextIndex = 0;
    let successCount = 0;
    let failureCount = 0;

    async function worker() {
        while (
            nextIndex < ROTAS.length
        ) {
            const index = nextIndex++;
            const route =
                ROTAS[index];

            const ok =
                await prepareOneRoute(
                    route,
                    shouldRefreshAll,
                    startCache,
                    pagesCache
                );

            if (ok) {
                successCount += 1;
            } else {
                failureCount += 1;
            }
        }
    }

    const workers = Array.from(
        {
            length: Math.min(
                WARMUP_CONCURRENCY,
                ROTAS.length
            ),
        },
        () => worker()
    );

    await Promise.all(workers);

    /*
     * Só marca a preparação como concluída quando a Home foi realmente
     * armazenada. As outras rotas podem falhar por permissão e serão
     * tentadas novamente no próximo ciclo.
     */
    const hasStartPage =
        await cacheHasRoute(
            startCache,
            "/"
        );

    if (hasStartPage) {
        writeWarmupState();
    }

    // 19/11/2026: mensagens do app só aparecem no Console em "Detalhado" (Verbose), para não poluir.
    console.debug(
        `[PWA] Rotas offline preparadas: ${successCount} ok, ${failureCount} falharam.`
    );
    } finally {
        preparandoRotas = false;
    }
}

/**
 * Quando estiver offline, Next App Router pode tentar uma navegação RSC.
 * Para as rotas previamente preparadas, convertemos o clique em uma
 * navegação de documento completa. O Service Worker então responde
 * usando pai-pages-v2 / start-url.
 */
function installOfflineNavigationFallback():
    () => void {
    const handleClick = (
        event: MouseEvent
    ) => {
        if (isOnlineNow()) return;
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;

        if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        ) {
            return;
        }

        const target =
            event.target as Element | null;

        const anchor =
            target?.closest?.(
                "a[href]"
            ) as HTMLAnchorElement | null;

        if (!anchor) return;

        if (
            anchor.hasAttribute("download") ||
            (anchor.target &&
                anchor.target !== "_self")
        ) {
            return;
        }

        const rawHref =
            anchor.getAttribute("href");

        if (
            !rawHref ||
            rawHref.startsWith("#") ||
            rawHref.startsWith("mailto:") ||
            rawHref.startsWith("tel:")
        ) {
            return;
        }

        const url = new URL(
            anchor.href,
            window.location.href
        );

        if (
            url.origin !==
            window.location.origin
        ) {
            return;
        }

        if (
            url.pathname.startsWith("/api/")
        ) {
            return;
        }

        if (
            !isOfflineRoute(url.pathname)
        ) {
            return;
        }

        event.preventDefault();

        window.location.assign(
            url.href
        );
    };

    document.addEventListener(
        "click",
        handleClick,
        true
    );

    return () => {
        document.removeEventListener(
            "click",
            handleClick,
            true
        );
    };
}

async function runOperationalSyncNow(reason: string): Promise<void> {
    // 19/11/2026: nas abas do computador a janela principal sincroniza (as telas com fila própria seguem sincronizando).
    if (dentroDeAba()) return;
    // Sem login não há o que sincronizar (evita o 401 do informativo.php?me=1).
    if (emTelaPublica()) return;

    if (!isOnlineNow()) {
        await requestOperationalBackgroundSync();
        return;
    }

    try {
        const summary = await syncOperationalQueue();

        if (
            summary.attempted > 0 ||
            summary.synced > 0 ||
            summary.requiresAttention > 0 ||
            summary.blockedAuth
        ) {
            console.debug(
                `[OFFLINE] Sincronização global (${reason}):`,
                summary
            );
        }
    } catch (error) {
        console.warn(
            `[OFFLINE] Falha na sincronização global (${reason}).`,
            error
        );

        await requestOperationalBackgroundSync();
    }
}

export default function RegisterSW() {
    const pathname = usePathname();
    const vinhaDeTelaPublicaRef = useRef(false);

    /*
     * 16/11/2026: avisa o script de recuperação do layout (app/layout.tsx)
     * que o app abriu de verdade. Se isso não acontecer, ele tenta de novo
     * pela internet ou mostra um aviso, em vez de ficar parado no logo.
     */
    useEffect(() => {
        (window as any).__paiHidratou = true;
        document.getElementById("pai-aviso-recuperacao")?.remove();
    }, []);

    /*
     * Também tenta sincronizar a cada navegação.
     * Assim, sair do login para a Home ou abrir qualquer tela do sistema
     * já dispara a fila, sem depender de Serviço Funerário.
     * Na tela de login não faz nada; ao sair dela (login feito), também
     * prepara as rotas offline, que foram puladas enquanto não havia login.
     */
    useEffect(() => {
        if (ehRotaPublica(pathname)) {
            vinhaDeTelaPublicaRef.current = true;
            return;
        }

        const acabouDeEntrar = vinhaDeTelaPublicaRef.current;
        vinhaDeTelaPublicaRef.current = false;

        if (isOnlineNow()) {
            void runOperationalSyncNow(`rota:${pathname ?? "/"}`);
            if (acabouDeEntrar) {
                void prepareOfflineRoutes(false);
            }
        } else {
            void requestOperationalBackgroundSync();
        }
    }, [pathname]);

    useEffect(() => {
        applyNetworkStatusToDocument();

        if (isOnlineNow()) {
            void runOperationalSyncNow("abertura-pwa");
        } else {
            void requestOperationalBackgroundSync();
        }

        if (
            !("serviceWorker" in navigator)
        ) {
            return;
        }

        let cancelled = false;

        const removeOfflineNavigation =
            installOfflineNavigationFallback();

        const handleOffline = () => {
            applyNetworkStatusToDocument();
            void requestOperationalBackgroundSync();
        };

        const handleOnline = () => {
            applyNetworkStatusToDocument();

            void prepareOfflineRoutes(
                false
            );

            /*
             * Se a página ainda está viva quando a rede volta, tentamos agora.
             * No Android fechado/suspenso, o worker/index.js é a segunda camada.
             */
            void runOperationalSyncNow("evento-online");
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState !== "visible") {
                return;
            }

            applyNetworkStatusToDocument();
            void runOperationalSyncNow("voltou-primeiro-plano");
        };

        const handlePageShow = () => {
            applyNetworkStatusToDocument();
            void runOperationalSyncNow("pageshow");
        };

        const handleFocus = () => {
            if (document.visibilityState === "visible") {
                void runOperationalSyncNow("focus");
            }
        };

        window.addEventListener(
            "offline",
            handleOffline
        );
        window.addEventListener(
            "online",
            handleOnline
        );
        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange
        );
        window.addEventListener(
            "pageshow",
            handlePageShow
        );
        window.addEventListener(
            "focus",
            handleFocus
        );

        const handleServiceWorkerMessage = (
            event: MessageEvent
        ) => {
            const data = event.data;

            if (
                !data ||
                data.type !==
                "PAI_BACKGROUND_SYNC_COMPLETE"
            ) {
                return;
            }

            /*
             * Mantém as telas que já escutam esse evento compatíveis.
             * O worker atualiza o IndexedDB e avisa qualquer janela aberta.
             */
            window.dispatchEvent(
                new CustomEvent(
                    "pai-offline-sync-complete",
                    {
                        detail: data.summary ?? null,
                    }
                )
            );
        };

        navigator.serviceWorker.addEventListener(
            "message",
            handleServiceWorkerMessage
        );

        const handleControllerChange =
            () => {
                if (
                    !cancelled &&
                    isOnlineNow()
                ) {
                    void prepareOfflineRoutes(
                        true
                    );
                    void runOperationalSyncNow(
                        "controllerchange"
                    );
                }
            };

        navigator.serviceWorker.addEventListener(
            "controllerchange",
            handleControllerChange
        );

        const register = async () => {
            // 19/11/2026: o Service Worker é registrado pela janela principal; a aba já fica sob o controle dele.
            if (dentroDeAba()) return;
            try {
                const registration =
                    await navigator.serviceWorker.register(
                        "/sw.js",
                        {
                            scope: "/",
                            updateViaCache: "none",
                        }
                    );

                if (cancelled) return;

                console.debug(
                    "[PWA] Service Worker registrado:",
                    registration.scope
                );

                if (isOnlineNow()) {
                    // Procura uma versão nova, mas não impede o aquecimento
                    // do cache caso a atualização falhe.
                    try {
                        await registration.update();
                    } catch {
                        // Sem ação.
                    }
                }

                await navigator.serviceWorker.ready;

                if (cancelled) return;

                // 16/11/2026: pede ao navegador para não apagar a fila offline sozinho.
                if (!emTelaPublica()) {
                    void pedirArmazenamentoPersistente();
                }

                /*
                 * Esta etapa é o ponto central:
                 * prepara a Home e todas as rotas declaradas em routes.ts.
                 */
                await prepareOfflineRoutes(
                    false
                );

                /*
                 * Home, Dashboard ou qualquer outra rota.
                 * O RegisterSW está no layout raiz, então este gatilho é global.
                 */
                await runOperationalSyncNow(
                    "service-worker-ready"
                );
            } catch (error) {
                if (!cancelled) {
                    console.error(
                        "[PWA] Erro ao registrar/preparar Service Worker:",
                        error
                    );
                }
            }
        };

        void register();

        return () => {
            cancelled = true;

            removeOfflineNavigation();

            window.removeEventListener(
                "offline",
                handleOffline
            );
            window.removeEventListener(
                "online",
                handleOnline
            );
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );
            window.removeEventListener(
                "pageshow",
                handlePageShow
            );
            window.removeEventListener(
                "focus",
                handleFocus
            );

            navigator.serviceWorker.removeEventListener(
                "message",
                handleServiceWorkerMessage
            );
            navigator.serviceWorker.removeEventListener(
                "controllerchange",
                handleControllerChange
            );
        };
    }, []);

    return null;
}
