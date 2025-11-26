/* public/sw.js */
const CACHE_VERSION = "v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;

// “App shell”: páginas/arquivos mínimos para abrir a UI
const CORE_ASSETS = [
    "/",               // sua home (ajuste se seu start_url for outro)
    "/manifest.json",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(STATIC_CACHE)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.map((k) => (k !== STATIC_CACHE ? caches.delete(k) : Promise.resolve()))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;

    // Só GET
    if (req.method !== "GET") return;

    const url = new URL(req.url);

    // 1) Navegação (document/HTML): network-first (atualiza), fallback cache (offline)
    if (req.mode === "navigate") {
        event.respondWith(
            (async () => {
                try {
                    const fresh = await fetch(req);
                    const cache = await caches.open(STATIC_CACHE);
                    cache.put(req, fresh.clone());
                    return fresh;
                } catch {
                    // tenta a própria rota no cache; se não tiver, cai na "/"
                    return (await caches.match(req)) || (await caches.match("/"));
                }
            })()
        );
        return;
    }

    // 2) Assets estáticos do Next e afins: cache-first
    const isNextStatic = url.pathname.startsWith("/_next/static/");
    const isAsset = ["script", "style", "image", "font"].includes(req.destination);

    if (isNextStatic || isAsset) {
        event.respondWith(
            (async () => {
                const cached = await caches.match(req);
                if (cached) return cached;

                try {
                    const fresh = await fetch(req);
                    const cache = await caches.open(STATIC_CACHE);
                    cache.put(req, fresh.clone());
                    return fresh;
                } catch {
                    // sem rede e sem cache
                    return new Response("", { status: 504 });
                }
            })()
        );
    }
});
