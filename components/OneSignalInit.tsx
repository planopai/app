"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { dentroDeAba } from "@/lib/abas";

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

/*
 * Telas abertas sem login (as mesmas PUBLIC_PATHS do middleware.ts).
 * Nelas o OneSignal não é iniciado: register_device.php exige login (401)
 * e o aparelho seria registrado como "Desconhecido".
 */
const ROTAS_PUBLICAS = new Set<string>(["/login", "/ajuda"]);

/* 19/11/2026: o SDK só é iniciado uma vez por abertura do app (ver o adiamento no fim do efeito). */
let sdkAgendado = false;

function ehRotaPublica(pathname: string | null | undefined): boolean {
    const p = String(pathname || "/").replace(/\/+$/, "") || "/";
    return ROTAS_PUBLICAS.has(p);
}

export default function OneSignalInit() {
    const pathname = usePathname();
    const telaPublica = ehRotaPublica(pathname);

    useEffect(() => {
        // Só inicia depois do login; ao sair do /login este efeito roda de novo.
        if (telaPublica) return;
        // 19/11/2026: nas abas do computador (quadros) a janela principal já cuida das notificações.
        if (dentroDeAba()) return;

        // Evita múltiplas injeções do script
        if (sdkAgendado || document.querySelector('script[data-onesignal-v16="true"]')) return;

        // Verificação para iOS: requer instalação como PWA
        const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
        const isStandalone = "standalone" in navigator && (navigator as NavigatorStandalone).standalone === true;

        if (isIOS && !isStandalone) {
            console.warn("[OneSignal] iOS requer instalação como PWA para funcionar.");
            return;
        }

        sdkAgendado = true;

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
                console.debug("[SW register call] original:", url, "-> fixed:", fixedUrl, fixedOpts);
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
            console.debug("[OneSignal] device registrado:", playerId);
        });

        /*
         * 19/11/2026: o SDK do OneSignal (e o aviso "ATIVAR" que ele coloca na página) só entra 3 s depois de a
         * tela terminar de carregar. Antes ele podia mexer na página enquanto o React ainda a montava, o que gera
         * o erro #418 no Console e faz o React desenhar a tela inteira de novo (mais lento). Também tira um script
         * de fora da abertura do app. As notificações continuam iguais.
         */
        const injetarSdk = () => {
            if (document.querySelector('script[data-onesignal-v16="true"]')) return;
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
        };
        const agendarSdk = () => window.setTimeout(injetarSdk, 3000);
        if (document.readyState === "complete") agendarSdk();
        else window.addEventListener("load", agendarSdk, { once: true });
    }, [telaPublica]);

    return null;
}
