"use client";
import { useEffect } from "react";

declare global { interface Window { OneSignalDeferred?: any[] } }

export default function OneSignalInit() {
    useEffect(() => {
        const s = document.createElement("script");
        s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
        s.async = true;

        s.onload = () => {
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            window.OneSignalDeferred.push(async (OneSignal: any) => {
                await OneSignal.init({
                    appId: "8f845647-2474-4ede-9e74-96f911bf9c88",
                    safariWebId: "web.onesignal.auto.6514249a-4cb8-451b-a889-88f5913c9a7f",

                    // **IMPORTANTE**: paths RELATIVOS no MESMO domínio do app
                    serviceWorkerPath: "/OneSignalSDKWorker.js",
                    serviceWorkerParam: { scope: "/" },

                    // Útil em dev local; em produção pode deixar ausente:
                    allowLocalhostAsSecureOrigin: true,
                });

                // Prompt v16 (equivalente ao antigo slidedown)
                await OneSignal.Slidedown.promptPush({
                    force: true,
                    actionMessage:
                        "Toque em ATIVAR para garantir o funcionamento do sistema de notificação!",
                    acceptButtonText: "ATIVAR",
                    cancelButtonText: "Cancelar",
                });
            });
        };

        document.head.appendChild(s);
        return () => { document.head.removeChild(s); };
    }, []);

    return null;
}
