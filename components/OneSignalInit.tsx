// app/components/OneSignalInit.tsx
"use client";

import { useEffect } from "react";

declare global { interface Window { OneSignalDeferred?: any[] } }

export default function OneSignalInit() {
    useEffect(() => {
        if (document.querySelector('script[data-onesignal-v16="true"]')) return;

        // 1) Patch para LOGAR toda tentativa de registro de SW e achar o culpado
        (function () {
            const orig = navigator.serviceWorker.register.bind(navigator.serviceWorker);
            navigator.serviceWorker.register = function (url: any, opts: any) {
                console.log("[SW register call]", url, opts);
                console.trace();
                return orig(url, opts);
            };
        })();

        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal: any) => {
            const SW_SCOPE = "/push/onesignal/";
            const SW_PATH = "/push/onesignal/OneSignalSDKWorker.js"; // relativo!

            // Workaround legacy (neutraliza overrides antigos)
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
                actionMessage: "Toque em ATIVAR para garantir o funcionamento do sistema de notificação!",
                acceptButtonText: "ATIVAR",
                cancelButtonText: "Cancelar",
            });
        });

        const s = document.createElement("script");
        s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
        s.async = true;
        s.setAttribute("data-onesignal-v16", "true");
        document.head.appendChild(s);
    }, []);

    return null;
}
