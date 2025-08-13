"use client";

import { useEffect } from "react";
import OneSignal from "react-onesignal";

export default function OneSignalInit() {
    useEffect(() => {
        (async () => {
            await OneSignal.init({
                appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!,
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
                        "dialog.blocked.message": "Permita as notificações nas configurações do navegador"
                    }
                },
                serviceWorkerPath: "/OneSignalSDKWorker.js",
                serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
                serviceWorkerParam: { scope: "/onesignal/" },
            });
        })();
    }, []);

    return null;
}
