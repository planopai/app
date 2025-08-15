"use client";

import { useEffect } from "react";

declare global {
    interface Window {
        OneSignalDeferred?: any[];
        OneSignal?: any;
    }
}

// Extensão segura para navegadores que suportam `standalone` (iOS Safari)
interface NavigatorStandalone extends Navigator {
    standalone?: boolean;
}

function getCookie(name: string): string | null {
    const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
}

async function waitForPlayerId(OneSignal: any, maxTries = 40, delayMs = 500): Promise<string | null> {
    for (let i = 0; i < maxTries; i++) {
        const id = OneSignal?.User?.PushSubscription?.id ?? null;
        if (id) return id;
        await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
}

async function registerDevice(playerId: string, externalUserId?: string) {
    const url = "/api/php/register_device.php";
    const usuarioCookie = getCookie("pai_name");
    const usuario = usuarioCookie ? decodeURIComponent(usuarioCookie) : "Desconhecido";

    try {
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                usuario,
                player_id: playerId,
                plataforma: "webpush",
                external_user_id: externalUserId || null,
                user_agent: navigator.userAgent,
            }),
            cache: "no-store",
        });
    } catch (e) {
        console.error("[register_device] falhou:", e);
    }
}

export default function OneSignalInit() {
    useEffect(() => {
        // Evita múltiplas injeções do script
        if (document.querySelector('script[data-onesignal-v16="true"]')) return;

        // Verificação para iOS: requer instalação como PWA
        const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
        const isStandalone = "standalone" in navigator && (navigator as NavigatorStandalone).standalone === true;

        if (isIOS && !isStandalone) {
            console.warn("[OneSignal] iOS requer instalação como PWA para funcionar.");
            return;
        }

        // Patch do Service Worker: normaliza URL e escopo
        (() => {
            const orig = navigator.serviceWorker.register.bind(navigator.serviceWorker);

            const normalizeUrl = (url: any) => {
                const s = String(url || "");
                if (s.includes("OneSignalSDKWorker.js")) return "/push/onesignal/OneSignalSDKWorker.js";
                if (s.includes("OneSignalSDKUpdaterWorker.js")) return "/push/onesignal/OneSignalSDKUpdaterWorker.js";
                return s;
            };

            const normalizeScope = (opts: any) => {
                const out = { ...(opts || {}) };
                out.scope = "/push/onesignal/";
                return out;
            };

            navigator.serviceWorker.register = function (url: any, opts: any) {
                const fixedUrl = normalizeUrl(url);
                const fixedOpts = normalizeScope(opts);
                console.log("[SW register call] original:", url, "-> fixed:", fixedUrl, fixedOpts);
                return orig(fixedUrl, fixedOpts);
            };
        })();

        // Fila de inicialização do SDK
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal: any) => {
            const SW_SCOPE = "/push/onesignal/";
            const SW_PATH = "/push/onesignal/OneSignalSDKWorker.js";
            const SW_UPDATER_PATH = "/push/onesignal/OneSignalSDKUpdaterWorker.js";

            // Força caminhos e escopos legados
            OneSignal.SERVICE_WORKER_PARAM = { scope: SW_SCOPE };
            OneSignal.SERVICE_WORKER_PATH = SW_PATH;
            OneSignal.SERVICE_WORKER_UPDATER_PATH = SW_UPDATER_PATH;
            OneSignal.__initOptions = OneSignal.__initOptions || {};
            OneSignal.__initOptions.serviceWorkerPath = SW_PATH;
            OneSignal.__initOptions.serviceWorkerUpdaterPath = SW_UPDATER_PATH;
            OneSignal.__initOptions.serviceWorkerParam = { scope: SW_SCOPE };

            await OneSignal.init({
                appId: "8f845647-2474-4ede-9e74-96f911bf9c88",
                serviceWorkerPath: SW_PATH,
                serviceWorkerUpdaterPath: SW_UPDATER_PATH,
                serviceWorkerParam: { scope: SW_SCOPE },
            });

            const externalId = getCookie("pai_name");
            if (externalId) {
                try {
                    await OneSignal.login(externalId);
                } catch (e) {
                    console.warn("[OneSignal.login] erro:", e);
                }
            }

            await OneSignal.Slidedown.promptPush({
                force: true,
                actionMessage: "Toque em ATIVAR para garantir o funcionamento do sistema de notificação!",
                acceptButtonText: "ATIVAR",
                cancelButtonText: "Cancelar",
            });

            const playerId = await waitForPlayerId(OneSignal, 40, 500);
            if (!playerId) {
                console.warn("[OneSignal] player_id não disponível.");
                return;
            }

            await registerDevice(playerId, externalId || undefined);
            console.log("[OneSignal] device registrado:", playerId);
        });

        // Injeta o SDK v16
        const s = document.createElement("script");
        s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
        s.async = true;
        s.setAttribute("data-onesignal-v16", "true");
        s.onerror = () => console.error("[OneSignal] Falha ao carregar o script v16.");
        document.head.appendChild(s);

        // Verifica se o SDK foi carregado após 5 segundos
        setTimeout(() => {
            if (!window.OneSignal) {
                console.error("[OneSignal] SDK não carregado.");
            }
        }, 5000);
    }, []);

    return null;
}
