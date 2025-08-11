// components/pwa-register.tsx
"use client";
import { useEffect } from "react";

declare global {
    interface Window { workbox?: any }
}

export default function PWARegister() {
    useEffect(() => {
        // Só registra em produção e se o browser suportar SW
        if (process.env.NODE_ENV !== "production") return;
        if (!("serviceWorker" in navigator)) return;

        const wb = window.workbox;
        if (!wb) {
            console.warn("[PWA] window.workbox não encontrado. O next-pwa não injetou o helper.");
            return;
        }

        // (Opcional) logs úteis
        wb.addEventListener?.("installed", (evt: any) => {
            console.log("[PWA] SW instalado. update?", evt.isUpdate);
        });
        wb.addEventListener?.("activated", (evt: any) => {
            console.log("[PWA] SW ativado. update?", evt.isUpdate);
        });

        wb.register(); // 👈 REGISTRA de fato o SW (/sw.js)
    }, []);

    return null;
}
