// Versão publicada da tela e limpeza de cache. Troque APP_BUILD_ID a cada publicação.

/* =========================
   CACHE GUARD / BUILD - CORS SAFE
   =========================
   IMPORTANTE:
   - Troque APP_BUILD_ID a cada publicação.
   - GETs recebem um cache-buster único (__cb) e usam cache: "no-store".
   - NÃO enviamos Cache-Control, Pragma ou Expires como headers da requisição.
     Esses headers extras provocavam preflight CORS e eram bloqueados pela API.
   - O próprio materiais_gerais.php já devolve Cache-Control/Pragma/Expires na
     resposta, portanto o navegador continua impedido de reaproveitar a API.
   - Na primeira execução de um build novo, caches do Cache Storage e o
     Service Worker que controla esta página são descartados.
   - O middleware.ts pode continuar impedindo cache do HTML/RSC no frontend.
*/
export const APP_BUILD_ID = "ESTOQUE-2026-10-07-REPAGINADA";
export const APP_BUILD_LABEL = "2026.10.07-REPAGINADA";
export const APP_BUILD_STORAGE_KEY = "estoque-app-build-id-v1";

export function applyCacheBuster(url: URL) {
    url.searchParams.set(
        "__cb",
        `${APP_BUILD_ID}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
}

export async function clearClientRuntimeCaches() {
    if (typeof window === "undefined") return;

    // Cache Storage (PWA/Service Worker/runtime caches).
    try {
        if ("caches" in window) {
            const names = await window.caches.keys();
            await Promise.all(names.map((name) => window.caches.delete(name)));
        }
    } catch (err) {
        console.warn("Não foi possível limpar Cache Storage.", err);
    }

    // Remove somente o Service Worker que atende o escopo desta página.
    try {
        if ("serviceWorker" in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                await registration.unregister();
            }
        }
    } catch (err) {
        console.warn("Não foi possível remover o Service Worker.", err);
    }
}

export async function markAndCleanNewBuild() {
    if (typeof window === "undefined") return;

    try {
        const previousBuild = window.localStorage.getItem(APP_BUILD_STORAGE_KEY);
        if (previousBuild === APP_BUILD_ID) return;

        await clearClientRuntimeCaches();
        window.localStorage.setItem(APP_BUILD_STORAGE_KEY, APP_BUILD_ID);
    } catch (err) {
        // Navegação privada ou política do browser pode bloquear localStorage.
        console.warn("Não foi possível registrar a versão do build.", err);
    }
}

export async function forceFreshReload() {
    if (typeof window === "undefined") return;

    await clearClientRuntimeCaches();

    try {
        window.localStorage.setItem(APP_BUILD_STORAGE_KEY, APP_BUILD_ID);
    } catch {
        // sem problema: o cache-buster da URL continua forçando nova navegação.
    }

    const url = new URL(window.location.href);
    url.searchParams.set("__fresh", `${APP_BUILD_ID}-${Date.now()}`);
    window.location.replace(url.toString());
}
