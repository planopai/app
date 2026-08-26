"use client";

import { clearActiveOfflineSession } from "./session";

const AUTH_PAGE_CACHES = [
  "start-url",
  "pai-pages-v2",
  "pai-rsc-v1",
];

/**
 * Chame esta função no fluxo real de "Sair da Conta".
 *
 * Ela não apaga os snapshots user-scoped do IndexedDB, pois podem existir
 * ações pendentes que precisam ser preservadas. Ao remover a identidade ativa,
 * outro usuário não consegue ler/sincronizar a fila anterior.
 *
 * O HTML/RSC autenticado do CacheStorage é removido para evitar que um aparelho
 * compartilhado reabra visualmente a sessão anterior depois do logout.
 */
export async function clearOfflineContextOnLogout(): Promise<void> {
  await clearActiveOfflineSession();

  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem("qa_registros");

      // A fila legada não possuía userId. Em vez de enviá-la sob o próximo
      // usuário ou apagá-la, movemos para quarentena para revisão manual.
      const legacy = window.localStorage.getItem("acomp_offline_queue_v1");
      if (legacy) {
        window.localStorage.setItem(
          `acomp_offline_queue_quarantine_${Date.now()}`,
          legacy,
        );
        window.localStorage.removeItem("acomp_offline_queue_v1");
      }
    } catch {
      // Sem ação.
    }
  }

  if (typeof caches !== "undefined") {
    await Promise.all(
      AUTH_PAGE_CACHES.map(async (name) => {
        try {
          await caches.delete(name);
        } catch {
          // Sem ação.
        }
      }),
    );
  }
}
