"use client";
import { useEffect } from "react";

export default function PWARegister() {
    useEffect(() => {
        if (process.env.NODE_ENV !== "production") return;
        if (!("serviceWorker" in navigator)) return;

        // SW do PWA (next-pwa) com escopo raiz "/"
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
