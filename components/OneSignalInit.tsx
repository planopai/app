// app/components/OneSignalInit.tsx
"use client";

import { useEffect } from "react";

declare global {
    interface Window {
        OneSignalDeferred?: any[];
    }
}

function getCookie(name: string): string | null {
    const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
}

async function waitForPlayerId(OneSignal: any, maxTries = 30, delayMs = 500): Promise<string | null> {
    for (let i = 0; i < maxTries; i++) {
        const id = OneSignal?.User?.PushSubscription?.id ?? null;
        if (id) return id;
        await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
}

async function registerDevice(playerId: string, externalUserId?: string) {
    // Prefira chamar pelo proxy Next (sem CORS):
    const url = "/api/php/register_device.php";
    // Se quiser chamar direto o HostGator, use:
    // const url = "https://planoassistencialintegrado.com.br/register_device.php";

    const usuarioCookie = getCookie("pai_name");           // setado no login (Next)
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
                user_agent: navigator.userAgent
            }),
            cache: "no-store",
        });
    } catch (e) {
        console.error("[register_device] falhou:", e);
    }
}

export default function OneSignalInit() {
    useEffect(() => {
        if (document.querySelector('script[data-onesignal-v16="true"]')) return;

        // 1) Patch do Service Worker: normaliza URL e scope
        (function () {
            const orig = navigator.serviceWorker.register.bind(navigator.serviceWorker);

            const normalizeUrl = (url: any) => {
                const s = String(url || "");
                if (s.startsWith("https://push/") || s.startsWith("http://push/")) {
                    return "/push/onesignal/OneSignalSDKWorker.js";
                }
                if (s.startsWith("push/onesignal/")) {
                    return "/" + s;
                }
                return s;
            };

            const normalizeScope = (opts: any) => {
                const out = { ...(opts || {}) };
                const wanted = "/push/onesignal/";
                if (typeof out?.scope === "string") {
                    if (!out.scope.startsWith("/push/onesignal/")) {
                        out.scope = wanted;
                    }
                } else {
                    out.scope = wanted;
                }
                return out;
            };

            navigator.serviceWorker.register = function (url: any, opts: any) {
                const fixedUrl = normalizeUrl(url);
                const fixedOpts = normalizeScope(opts);
                console.log("[SW register call] original:", url, "-> fixed:", fixedUrl, fixedOpts);
                return orig(fixedUrl, fixedOpts);
            };
        })();

        // 2) Fila v16
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal: any) => {
            const SW_SCOPE = "/push/onesignal/";
            const SW_PATH = "/push/onesignal/OneSignalSDKWorker.js";

            // Força caminhos/escopos legados
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

            // (Opcional) Faça login no OneSignal com o identificador do seu usuário
            // Isso cria external_user_id no OneSignal e permite envios por include_external_user_ids
            const externalId = getCookie("pai_name"); // troque para um ID único, se tiver
            if (externalId) {
                try {
                    await OneSignal.login(externalId);
                } catch (e) {
                    console.warn("[OneSignal.login] erro:", e);
                }
            }

            // Prompt para ativar push
            await OneSignal.Slidedown.promptPush({
                force: true,
                actionMessage: "Toque em ATIVAR para garantir o funcionamento do sistema de notificação!",
                acceptButtonText: "ATIVAR",
                cancelButtonText: "Cancelar",
            });

            // Aguarda surgir o player_id
            const playerId = await waitForPlayerId(OneSignal, 40, 500);
            if (!playerId) {
                console.warn("[OneSignal] player_id não disponível (sem permissão ou init pendente).");
                return;
            }

            // Registra no seu backend
            await registerDevice(playerId, externalId || undefined);
            console.log("[OneSignal] device registrado:", playerId);
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
