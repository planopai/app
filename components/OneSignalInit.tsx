// app/components/OneSignalInit.tsx
"use client";

import { useEffect } from "react";

declare global {
    interface Window {
        OneSignalDeferred?: any[];
    }
}

export default function OneSignalInit() {
    useEffect(() => {
        if (document.querySelector('script[data-onesignal-v16="true"]')) return;

        const s = document.createElement("script");
        s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
        s.async = true;
        s.setAttribute("data-onesignal-v16", "true");

        s.onload = () => {
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            window.OneSignalDeferred.push(async (OneSignal: any) => {
                // WORKAROUND: força caminho e escopo correspondentes ao subdiretório
                (OneSignal as any).SERVICE_WORKER_PARAM = { scope: "/push/onesignal/" };
                (OneSignal as any).SERVICE_WORKER_PATH =
                    "/push/onesignal/OneSignalSDKWorker.js";

                await OneSignal.init({
                    appId: "8f845647-2474-4ede-9e74-96f911bf9c88",
                    safariWebId: "web.onesignal.auto.6514249a-4cb8-451b-a889-88f5913c9a7f",

                    // >>> paths batendo com a sua pasta pública:
                    serviceWorkerPath: "/push/onesignal/OneSignalSDKWorker.js",
                    serviceWorkerParam: { scope: "/push/onesignal/" },

                    // só útil em localhost
                    allowLocalhostAsSecureOrigin: true,
                });

                await OneSignal.Slidedown.promptPush({
                    force: true,
                    actionMessage:
                        "Toque em ATIVAR para garantir o funcionamento do sistema de notificação!",
                    acceptButtonText: "ATIVAR",
                    cancelButtonText: "Cancelar",
                });
            });
        };

        s.onerror = () => console.error("[OneSignal] Falha ao carregar o script v16.");
        document.head.appendChild(s);
    }, []);

    return null;
}
