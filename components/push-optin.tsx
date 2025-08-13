"use client";
import * as React from "react";

export default function PushOptIn() {
    const [perm, setPerm] = React.useState<NotificationPermission>(
        typeof Notification !== "undefined" ? Notification.permission : "default"
    );

    React.useEffect(() => {
        // Mantém o state sincronizado caso a permissão mude fora do botão
        let t: any;
        if (typeof Notification !== "undefined") {
            t = setInterval(() => setPerm(Notification.permission), 1500);
        }
        return () => clearInterval(t);
    }, []);

    if (perm === "granted") return null;

    if (perm === "denied") {
        return (
            <p className="text-sm text-muted-foreground">
                Notificações bloqueadas no navegador. Libere em “Configurações do site” para ativar.
            </p>
        );
    }

    return (
        <button
            className="rounded-md bg-blue-600 px-3 py-2 text-white"
            onClick={() => {
                // v16 exige interação do usuário
                (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
                (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
                    try {
                        await OneSignal.Notifications.requestPermission();
                    } finally {
                        if (typeof Notification !== "undefined") setPerm(Notification.permission);
                    }
                });
            }}
        >
            Ativar notificações
        </button>
    );
}
