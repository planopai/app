"use client";

export const PAI_OPERATIONAL_SYNC_TAG = "pai-operational-sync-v1";

const READY_TIMEOUT_MS = 1500;

function timeoutValue<T>(value: T, ms: number): Promise<T> {
    return new Promise<T>((resolve) => {
        window.setTimeout(() => resolve(value), ms);
    });
}

/**
 * Registra Background Sync quando o navegador oferecer suporte.
 *
 * Android/Chrome:
 * pode acordar o Service Worker quando a conexão voltar.
 *
 * iOS/Safari:
 * normalmente retorna false porque Background Sync não está disponível.
 *
 * A função nunca interrompe o fluxo operacional. Quando ela é chamada,
 * a ação já foi persistida no IndexedDB.
 */
export async function requestOperationalBackgroundSync(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator)) return false;

    try {
        const registration = await Promise.race([
            navigator.serviceWorker.ready,
            timeoutValue<ServiceWorkerRegistration | null>(
                null,
                READY_TIMEOUT_MS,
            ),
        ]);

        if (!registration) return false;

        const registrationWithSync = registration as ServiceWorkerRegistration & {
            sync?: {
                register: (tag: string) => Promise<void>;
            };
        };

        if (
            !registrationWithSync.sync ||
            typeof registrationWithSync.sync.register !== "function"
        ) {
            return false;
        }

        await registrationWithSync.sync.register(PAI_OPERATIONAL_SYNC_TAG);

        return true;
    } catch (error) {
        console.warn(
            "[OFFLINE] Não foi possível registrar Background Sync.",
            error,
        );

        return false;
    }
}