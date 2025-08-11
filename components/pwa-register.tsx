// components/pwa-register.tsx
"use client";
import { useEffect } from "react";

export default function PWARegister() {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;
        // registra o sw do next-pwa gerado em /sw.js
        navigator.serviceWorker
            .register("/sw.js", { scope: "/" })
            .then((reg) => {
                console.log("[PWA] SW registrado:", reg.scope);
            })
            .catch((err) => {
                console.warn("[PWA] Falha ao registrar SW:", err);
            });
    }, []);
    return null;
}
