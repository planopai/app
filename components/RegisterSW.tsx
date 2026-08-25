"use client";

import { useEffect } from "react";

export default function RegisterSW() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;

        let cancelled = false;

        const register = async () => {
            try {
                const registration = await navigator.serviceWorker.register("/sw.js", {
                    scope: "/",
                    updateViaCache: "none",
                });

                if (cancelled) return;

                console.log("[PWA] Service Worker registrado:", registration.scope);

                // Só procura versão nova quando há conectividade.
                if (navigator.onLine) {
                    registration.update().catch(() => undefined);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("[PWA] Erro ao registrar Service Worker:", error);
                }
            }
        };

        void register();

        return () => {
            cancelled = true;
        };
    }, []);

    return null;
}
