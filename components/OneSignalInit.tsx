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

        // 1) Patch: loga e NORMALIZA qualquer tentativa de registrar SW
        (function () {
            const orig = navigator.serviceWorker.register.bind(navigator.serviceWorker);
            const normalize = (url: any) => {
                const s = String(url || "");
                // se vier como "https://push/onesignal/..." (base href errado)
                if (s.startsWith("https://push/") || s.startsWith("http://push/")) {
                    return "/push/onesignal/OneSignalSDKWorker.js";
                }
                // se vier sem barra inicial "push/onesignal/..."
                if (s.startsWith("push/onesignal/")) {
                    return "/" + s;
                }
                return s;
            };
            navigator.serviceWorker.register = function (url: any, opts: any) {
                const fixed = normalize(url);
                console.log("[SW register call] original:", url, " -> fixed:", fixed, opts);
                return orig(fixed, opts);
            };
        })();

        // 2) Prepara fila da v16
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal: any) => {
            const SW_SCOPE = "/push/onesignal/";
            const SW_PATH = "/push/onesignal/OneSignalSDKWorker.js"; // relativo, com barra inicial

            // Workaround: força caminhos/escopo em pontos legados antes do init
            (OneSignal as any).SERVICE_WORKER_PARAM = { scope: SW_SCOPE };
            (OneSignal as any).SERVICE_WORKER_PATH = SW_PATH;
            (OneSignal as any).__initOptions = (OneSignal as any).__initOptions || {};
            (OneSignal as any).__initOptions.serviceWorkerPath = SW_PATH;
            (OneSignal as any).__initOptions.serviceWorkerParam = { scope: SW_SCOPE };

            await OneSignal.init({
                appId: "8f845647-2474-4ede-9e74-96f911bf9c88",
                safariWebId: "web.onesignal.auto.6514249a-4cb8-451b-a889-88f5913c9a7f",
                serviceWorkerPath: SW_PATH,
                serviceWorkerParam: { scope: SW_SCOPE },
            });

            await OneSignal.Slidedown.promptPush({
                force: true,
                actionMessage:
                    "Toque em ATIVAR para garantir o funcionamento do sistema de notificação!",
                acceptButtonText: "ATIVAR",
                cancelButtonText: "Cancelar",
            });
        });

        // 3) Injeta o SDK v16
        const s = document.createElement("script");
        s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
        s.async = true;
        s.setAttribute("data-onesignal-v16", "true");
        s.onerror = () => console.error("[OneSignal] Falha ao carregar o script v16.");
        document.head.appendChild(s);
    }, []);

    return null;
}
