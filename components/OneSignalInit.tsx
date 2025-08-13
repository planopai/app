"use client";

import { useEffect } from "react";

export default function OneSignalInit() {
    useEffect(() => {
        if (typeof window !== "undefined") {
            // @ts-ignore
            window.OneSignal = window.OneSignal || [];
            // @ts-ignore
            window.OneSignal.push(function () {
                // @ts-ignore
                window.OneSignal.init({
                    appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
                    safari_web_id: "web.onesignal.auto", // ou seu ID específico para Safari
                    notifyButton: {
                        enable: true,
                    },
                    allowLocalhostAsSecureOrigin: true, // útil para testes locais
                });
            });
        }
    }, []);

    return null;
}
