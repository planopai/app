/**
 * lib/offline/network.ts
 *
 * Utilitários pequenos de conectividade.
 *
 * navigator.onLine é apenas um indício. Operações de rede reais
 * ainda devem sempre usar try/catch.
 */

export type NetworkStatus = "online" | "offline";

export function isOnlineNow(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function getNetworkStatus(): NetworkStatus {
  return isOnlineNow() ? "online" : "offline";
}

export function applyNetworkStatusToDocument(): void {
  if (typeof document === "undefined") return;

  const status = getNetworkStatus();

  document.documentElement.dataset.network = status;
  document.documentElement.classList.toggle(
    "is-offline",
    status === "offline"
  );
}

export function subscribeNetworkStatus(
  callback: (status: NetworkStatus) => void
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const emit = () => {
    applyNetworkStatusToDocument();
    callback(getNetworkStatus());
  };

  window.addEventListener("online", emit);
  window.addEventListener("offline", emit);

  applyNetworkStatusToDocument();

  return () => {
    window.removeEventListener("online", emit);
    window.removeEventListener("offline", emit);
  };
}
