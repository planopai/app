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
        // Carrega o SDK v16 uma única vez
        if (document.querySelector('script[data-onesignal-v16="true"]')) return;

        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal: any) => {
            // Caminhos RELATIVOS (o SDK completa com o origin)
            const SW_SCOPE = "/push/onesignal/";
            const SW_PATH = "/push/onesignal/OneSignalSDKWorker.js"; // use o Worker “clássico”

            // Workaround: força caminho/escopo nos pontos legados antes do init
            (OneSignal as any).SERVICE_WORKER_PARAM = { scope: SW_SCOPE };
            (OneSignal as any).SERVICE_WORKER_PATH = SW_PATH;
            (OneSignal as any).__initOptions = (OneSignal as any).__initOptions || {};
            (OneSignal as any).__initOptions.serviceWorkerPath = SW_PATH;
            (OneSignal as any).__initOptions.serviceWorkerParam = { scope: SW_SCOPE };

            await OneSignal.init({
                appId: "8f845647-2474-4ede-9e74-96f911bf9c88",
                safariWebId: "web.onesignal.auto.6514249a-4cb8-451b-a889-88f5913c9a7f",

                // Caminhos corretos (RELATIVOS!)
                serviceWorkerPath: SW_PATH,
                serviceWorkerParam: { scope: SW_SCOPE },

                // só útil em localhost
                allowLocalhostAsSecureOrigin: true,
            });

            // Prompt v16
            await OneSignal.Slidedown.promptPush({
                force: true,
                actionMessage:
                    "Toque em ATIVAR para garantir o funcionamento do sistema de notificação!",
                acceptButtonText: "ATIVAR",
                cancelButtonText: "Cancelar",
            });
        });

        const s = document.createElement("script");
        s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
        s.async = true;
        s.setAttribute("data-onesignal-v16", "true");
        s.onerror = () => console.error("[OneSignal] Falha ao carregar o script v16.");
        document.head.appendChild(s);
    }, []);

    return null;
}
