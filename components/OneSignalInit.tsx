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
        // ----- PREP: define a fila ANTES de carregar o SDK -----
        window.OneSignalDeferred = window.OneSignalDeferred || [];

        // Empurra nossa config para ser executada assim que o SDK carregar
        window.OneSignalDeferred.push(async (OneSignal: any) => {
            // Monta URLs absolutas do SW no MESMO domínio
            const ORIGIN = window.location.origin; // ex.: https://pai.planoassistencialintegrado.com.br
            const SW_SCOPE = "/push/onesignal/";
            const ABS_SW = `${ORIGIN}${SW_SCOPE}OneSignalSDK.sw.js`;
            const ABS_WORKER = `${ORIGIN}${SW_SCOPE}OneSignalSDKWorker.js`;

            // ---- WORKAROUND/LEGADO: forçar paths/escopo em todos os pontos possíveis ----
            // (compatível com caminhos legados v15 e caminhos v16)
            (OneSignal as any).SERVICE_WORKER_PARAM = { scope: SW_SCOPE };
            // você pediu para forçar o .sw.js — então apontamos para ele aqui:
            (OneSignal as any).SERVICE_WORKER_PATH = ABS_SW;
            // alguns builds olham esse campo interno:
            (OneSignal as any).__initOptions = (OneSignal as any).__initOptions || {};
            (OneSignal as any).__initOptions.serviceWorkerPath = ABS_SW;
            (OneSignal as any).__initOptions.serviceWorkerParam = { scope: SW_SCOPE };
            // ------------------------------------------------------------------------------

            // Registro “oficial” (v16)
            await OneSignal.init({
                appId: "8f845647-2474-4ede-9e74-96f911bf9c88",
                safariWebId: "web.onesignal.auto.6514249a-4cb8-451b-a889-88f5913c9a7f",

                // >>> Forçando o ABSOLUTO do .sw.js como você pediu:
                serviceWorkerPath: ABS_SW,
                serviceWorkerParam: { scope: SW_SCOPE },

                // útil apenas em dev local
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

        // ----- Injeta o SDK v16 (page) uma única vez -----
        if (!document.querySelector('script[data-onesignal-v16="true"]')) {
            const s = document.createElement("script");
            s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
            s.async = true;
            s.setAttribute("data-onesignal-v16", "true");
            s.onerror = () =>
                console.error("[OneSignal] Falha ao carregar o script v16.");
            document.head.appendChild(s);
        }
    }, []);

    return null;
}
