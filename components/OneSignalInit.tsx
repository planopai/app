"use client";

import { useEffect } from "react";
import OneSignal from "react-onesignal";

export default function OneSignalInit() {
    useEffect(() => {
        (async () => {
            // bust de cache (em produção troque por uma versão fixa, ex: ?v=1.0.3)
            const v = `?v=${Date.now()}`;

            // Desregistra SWs antigos e limpa caches
            if ("serviceWorker" in navigator) {
                try {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map((r) => r.unregister()));

                    if ("caches" in window) {
                        const keys = await caches.keys();
                        await Promise.all(keys.map((k) => caches.delete(k)));
                    }
                } catch (e) {
                    console.warn("Falha ao limpar SW/caches:", e);
                }
            }

            // Diagnóstico (opcional)
            try {
                const base = document.querySelector("base")?.href;
                console.log("BASE HREF:", base);
                console.log("URL abs worker:", new URL("/OneSignalSDKWorker.js", document.baseURI).href);
                console.log("URL rel worker:", new URL("OneSignalSDKWorker.js", document.baseURI).href);
            } catch { }

            await OneSignal.init({
                appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!,
                safari_web_id: process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_ID!,
                notifyButton: {
                    enable: true,
                    prenotify: true,
                    showCredit: false,
                    position: "bottom-right",
                    text: {
                        "tip.state.unsubscribed": "Ativar notificações",
                        "tip.state.subscribed": "Notificações ativadas",
                        "tip.state.blocked": "Notificações bloqueadas",
                        "message.prenotify": "Clique para ativar as notificações",
                        "message.action.subscribing": "Inscrevendo...",
                        "message.action.subscribed": "Inscrição concluída!",
                        "message.action.resubscribed": "Inscrito novamente",
                        "message.action.unsubscribed": "Você não receberá notificações",
                        "dialog.main.title": "Notificações do site",
                        "dialog.main.button.subscribe": "ATIVAR",
                        "dialog.main.button.unsubscribe": "DESATIVAR",
                        "dialog.blocked.title": "Notificações bloqueadas",
                        "dialog.blocked.message": "Permita as notificações nas configurações do navegador",
                    },
                },
                // >>> use ABSOLUTO pra ignorar <base href> e assetPrefix <<<
                serviceWorkerPath: `/OneSignalSDKWorker.js${v}`,
                serviceWorkerUpdaterPath: `/OneSignalSDKUpdaterWorker.js${v}`,
                serviceWorkerParam: { scope: "/" },
                allowLocalhostAsSecureOrigin: true,
            });
        })();
    }, []);

    return null;
}
