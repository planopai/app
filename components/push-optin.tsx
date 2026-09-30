"use client";

import * as React from "react";

export default function PushOptIn() {
    const [perm, setPerm] =
        React.useState<NotificationPermission | null>(null);

    React.useEffect(() => {
        if (typeof Notification === "undefined") {
            setPerm("default");
            return;
        }

        const atualizarPermissao = () => {
            setPerm(Notification.permission);
        };

        atualizarPermissao();

        const t = window.setInterval(
            atualizarPermissao,
            1500
        );

        return () => {
            window.clearInterval(t);
        };
    }, []);

    if (perm === null) {
        return null;
    }

    if (perm === "granted") {
        return null;
    }

    if (perm === "denied") {
        return (
            <p className="text-sm text-muted-foreground">
                Notificações bloqueadas no navegador. Libere em
                “Configurações do site” para ativar.
            </p>
        );
    }

    return (
        <button
            className="rounded-md bg-blue-600 px-3 py-2 text-white"
            onClick={() => {
                (window as any).OneSignalDeferred =
                    (window as any).OneSignalDeferred || [];

                (window as any).OneSignalDeferred.push(
                    async (OneSignal: any) => {
                        try {
                            await OneSignal.Notifications.requestPermission();
                        } finally {
                            if (typeof Notification !== "undefined") {
                                setPerm(Notification.permission);
                            }
                        }
                    }
                );
            }}
        >
            Ativar notificações
        </button>
    );
}