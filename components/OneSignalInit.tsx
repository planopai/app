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
        // injeta o script v16 (page)
        const s = document.createElement("script");
        s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
        s.async = true;

        s.onload = () => {
            // fila de inicialização
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            window.OneSignalDeferred.push(async (OneSignal: any) => {
                // ---- WORKAROUND (remova depois que achar a origem do path errado) ----
                // força o caminho e escopo corretos antes do init
                (OneSignal as any).SERVICE_WORKER_PARAM = { scope: "/" };
                (OneSignal as any).SERVICE_WORKER_PATH = "/OneSignalSDKWorker.js";
                // ---------------------------------------------------------------------

                await OneSignal.init({
                    appId: "8f845647-2474-4ede-9e74-96f911bf9c88",
                    safariWebId: "web.onesignal.auto.6514249a-4cb8-451b-a889-88f5913c9a7f",

                    // IMPORTANTES: mesmos valores do workaround acima
                    serviceWorkerPath: "/OneSignalSDKWorker.js",
                    serviceWorkerParam: { scope: "/" },

                    // útil em localhost; em prod pode omitir
                    allowLocalhostAsSecureOrigin: true,
                });

                // Prompt (v16)
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
        return () => {
            document.head.removeChild(s);
        };
    }, []);

    return null;
}
