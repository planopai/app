"use client";

import { useEffect } from "react";

import {
    OFFLINE_ROUTES,
    PAI_PAGES_CACHE,
    PAI_START_CACHE,
    isOfflineRoute,
    normalizeOfflinePath,
} from "@/lib/offline/routes";
import {
    applyNetworkStatusToDocument,
    isOnlineNow,
} from "@/lib/offline/network";

const WARMUP_STATE_KEY =
    "pai_offline_routes_warmup_v2";

/**
 * Evita disparar dezenas de requisições repetidamente em um intervalo curto.
 * Se uma rota estiver ausente do cache, ela continua sendo preparada mesmo
 * dentro da janela abaixo.
 */
const FULL_REFRESH_INTERVAL_MS =
    30 * 60 * 1000;

const WARMUP_CONCURRENCY = 4;

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
    if (!isOnlineNow()) return;
    if (!("caches" in window)) return;

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
            nextIndex < OFFLINE_ROUTES.length
        ) {
            const index = nextIndex++;
            const route =
                OFFLINE_ROUTES[index];

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
                OFFLINE_ROUTES.length
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

    console.log(
        `[PWA] Rotas offline preparadas: ${successCount} ok, ${failureCount} falharam.`
    );
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

export default function RegisterSW() {
    useEffect(() => {
        applyNetworkStatusToDocument();

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
        };

        const handleOnline = () => {
            applyNetworkStatusToDocument();

            void prepareOfflineRoutes(
                false
            );
        };

        window.addEventListener(
            "offline",
            handleOffline
        );
        window.addEventListener(
            "online",
            handleOnline
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
                }
            };

        navigator.serviceWorker.addEventListener(
            "controllerchange",
            handleControllerChange
        );

        const register = async () => {
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

                console.log(
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

                /*
                 * Esta etapa é o ponto central:
                 * prepara a Home e todas as rotas declaradas em routes.ts.
                 */
                await prepareOfflineRoutes(
                    false
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

            navigator.serviceWorker.removeEventListener(
                "controllerchange",
                handleControllerChange
            );
        };
    }, []);

    return null;
}
