// components/push-optin.tsx
"use client";
import * as React from "react";

export default function PushOptIn() {
    const [perm, setPerm] = React.useState<NotificationPermission>(
        typeof Notification !== "undefined" ? Notification.permission : "default"
    );

    if (perm === "granted") return null; // já está ativado
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
                // OneSignal v16 precisa ser chamado após interação do usuário
                (window as any).OneSignalDeferred = (window as any).OneSignalDeferred || [];
                (window as any).OneSignalDeferred.push(async (OneSignal: any) => {
                    await OneSignal.Notifications.requestPermission();
                    setPerm(Notification.permission);
                });
            }}
        >
            Ativar notificações
        </button>
    );
}
