/**
 * Service worker das notificações do Messenger (Web Push da Ably).
 * Escopo próprio (/push/ably/), separado do OneSignal (/push/onesignal/) e do /sw.js do modo offline.
 *
 * Regras contra notificação duplicada:
 *  - o servidor manda por UM canal só (notificacoes_canal = 'ably'), uma vez por mensagem e por aparelho;
 *  - a tag "conversa-<id>" faz a notificação nova SUBSTITUIR a anterior da mesma conversa (não empilha);
 *  - se o app está na tela com essa conversa aberta, não mostra nada (a mensagem já aparece na conversa).
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function lerPayload(event) {
    try {
        return event.data ? event.data.json() : {};
    } catch (e) {
        return { notification: { body: event.data ? event.data.text() : "" } };
    }
}

self.addEventListener("push", (event) => {
    const p = lerPayload(event);
    const n = p.notification || {};
    const d = p.data || {};
    const titulo = n.title || p.title || "Messenger";
    const corpo = n.body || p.body || "Nova mensagem";
    const tag = d.tag || n.collapseKey || "messenger";
    const url = d.url || "/messenger";
    const conversa = String(d.conversa_id || "");

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
            const abertaNaConversa = janelas.some((j) => {
                if (j.visibilityState !== "visible" || !conversa) return false;
                try {
                    const u = new URL(j.url);
                    return u.pathname.startsWith("/messenger") && u.searchParams.get("conversa") === conversa;
                } catch (e) {
                    return false;
                }
            });
            if (abertaNaConversa) return undefined;
            return self.registration.showNotification(titulo, {
                body: corpo,
                tag,
                renotify: true,
                data: { url, origem: "messenger", conversa_id: conversa },
            });
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || "/messenger";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
            const destino = new URL(url, self.location.origin);
            const mesma = janelas.find((j) => {
                try {
                    return new URL(j.url).origin === destino.origin;
                } catch (e) {
                    return false;
                }
            });
            if (mesma && "navigate" in mesma) {
                return mesma.focus().then((j) => (j || mesma).navigate(destino.href)).catch(() => self.clients.openWindow(destino.href));
            }
            return self.clients.openWindow(destino.href);
        })
    );
});
