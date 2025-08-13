"use client";

import { useEffect } from "react";
import OneSignal from "react-onesignal";

export default function OneSignalInit() {
    useEffect(() => {
        (async () => {
            // Em produção, troque por uma versão fixa: ?v=1.0.3
            const v = `?v=${Date.now()}`;

            // Limpa SWs/caches antigos para evitar worker preso com URL errada
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

            try {
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

                    // *** Sintaxe correta do v16 ***
                    serviceWorker: {
                        workerPath: `/OneSignalSDKWorker.js${v}`,
                        updaterWorkerPath: `/OneSignalSDKUpdaterWorker.js${v}`,
                        scope: "/",
                        allowLocalhostAsSecureOrigin: true,
                    },
                });

                // Opcional: reduzir ruído de logs
                OneSignal.Debug.setLogLevel("warn");
            } catch (e) {
                console.warn("Falha ao inicializar OneSignal:", e);
            }
        })();
    }, []);

    return null;
}
