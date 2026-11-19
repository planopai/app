"use client";

/**
 * lib/abas.ts — telas abertas em abas no computador (components/app-shell.tsx), 19/11/2026.
 *
 * Cada aba é o app inteiro num quadro (iframe). Para as abas ficarem leves:
 *  - dentroDeAba(): o que a janela principal já faz (OneSignal, sincronização offline, preparar o modo offline,
 *    buscar permissões e menu) não é repetido dentro de cada aba;
 *  - aba escondida "parece" escondida para a tela: a janela de cima avisa qual aba está à vista e as outras
 *    passam a responder document.hidden = true. As telas já param de consultar o servidor quando a aba do
 *    navegador fica escondida, então param também quando a aba do app não está à vista. Ao voltar para a aba,
 *    o evento visibilitychange faz a tela atualizar na hora;
 *  - aba reserva: a janela de cima deixa uma aba pronta em /aba; ao abrir uma tela, a aba reserva só troca de
 *    tela (MSG_NAVEGAR), sem carregar o app do zero.
 */

export const MSG_NAVEGAR = "navegar";
export const MSG_VISIVEL = "visivel";
export const ROTA_RESERVA = "/aba";

/** true quando esta tela está dentro de um quadro do app (aba, aba reserva ou painel da Aurora). */
export function dentroDeAba(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

let instalado = false;
let escondida = false;

/**
 * Dentro de uma aba: passa a responder document.hidden / visibilityState conforme a aba esteja à vista
 * (aviso da janela de cima) e dispara visibilitychange quando isso muda. Fora de aba não faz nada.
 */
export function instalarVisibilidadeDaAba(): void {
    if (instalado || !dentroDeAba()) return;
    instalado = true;
    try {
        const proto = Document.prototype;
        const hiddenOriginal = Object.getOwnPropertyDescriptor(proto, "hidden")?.get;
        const estadoOriginal = Object.getOwnPropertyDescriptor(proto, "visibilityState")?.get;
        if (!hiddenOriginal || !estadoOriginal) return;
        Object.defineProperty(document, "hidden", {
            configurable: true,
            get: () => escondida || Boolean(hiddenOriginal.call(document)),
        });
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => (escondida ? "hidden" : estadoOriginal.call(document)),
        });
    } catch {
        return;
    }
    window.addEventListener("message", (e: MessageEvent) => {
        if (e.origin !== window.location.origin || e.source !== window.parent) return;
        if (e.data?.pai !== MSG_VISIVEL) return;
        const novo = e.data.visivel === false;
        if (novo === escondida) return;
        escondida = novo;
        document.dispatchEvent(new Event("visibilitychange"));
    });
}
