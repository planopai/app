"use client";
import * as React from "react";

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PWAInstallPrompt() {
    const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = React.useState(false);

    const isIOS =
        typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone =
        typeof window !== "undefined" &&
        (window.matchMedia("(display-mode: standalone)").matches ||
            // Safari iOS
            (window.navigator as any).standalone);

    React.useEffect(() => {
        if (isStandalone) { setInstalled(true); return; }

        const onBIP = (e: Event) => {
            // Chrome não mostra mais sozinho; guardamos o evento
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
        };
        const onInstalled = () => setInstalled(true);

        window.addEventListener("beforeinstallprompt", onBIP);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onBIP);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, [isStandalone]);

    if (installed) return null;

    // iOS não dispara beforeinstallprompt — mostra instrução
    if (isIOS && !isStandalone) {
        return (
            <div className="fixed bottom-4 left-0 right-0 z-50 mx-auto w-[min(560px,92%)] rounded-xl border bg-white p-3 shadow-lg">
                <div className="text-sm">
                    <b>Instalar app</b>
                    <p className="mt-1 text-muted-foreground">
                        No Safari: toque em <span className="rounded border px-1">Compartilhar</span> →
                        <b> Adicionar à Tela de Início</b>.
                    </p>
                </div>
            </div>
        );
    }

    // Em desktop/Android, só aparece se o Chrome emitir o evento
    if (!deferred) return null;

    return (
        <div className="fixed bottom-4 left-0 right-0 z-50 mx-auto w-[min(560px,92%)] rounded-xl border bg-white p-3 shadow-lg">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <b>Instalar app</b>
                    <p className="text-sm text-muted-foreground">Use o app em tela cheia e offline.</p>
                </div>
                <button
                    className="rounded-md bg-blue-600 px-3 py-2 text-white"
                    onClick={async () => {
                        await deferred.prompt();
                        await deferred.userChoice; // opcional: lidar com accepted/dismissed
                        setDeferred(null); // esconde depois do clique
                    }}
                >
                    Instalar
                </button>
            </div>
        </div>
    );
}
