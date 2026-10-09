"use client";

import { useEffect } from "react";

/**
 * Tira o zoom de pinça e o de toque duplo nas telas do Messenger (09/10/2026), como num app de mensagens.
 * Só vale enquanto a tela do Messenger está aberta: ao sair, a página volta exatamente como estava.
 * Não altera o layout do app (a meta viewport é ajustada aqui e restaurada ao sair).
 */
export function useSemZoom() {
    useEffect(() => {
        const meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
        const antes = meta?.getAttribute("content") ?? null;
        if (meta) {
            const partes = (antes || "width=device-width, initial-scale=1")
                .split(",")
                .map((p) => p.trim())
                .filter((p) => p && !/^(maximum-scale|minimum-scale|user-scalable)\s*=/i.test(p));
            meta.setAttribute("content", [...partes, "maximum-scale=1", "user-scalable=no"].join(", "));
        }
        // Safari do iPhone ignora o user-scalable: bloqueia o gesto de pinça direto
        const bloquear = (e: Event) => e.preventDefault();
        const opcoes = { passive: false } as AddEventListenerOptions;
        document.addEventListener("gesturestart", bloquear, opcoes);
        document.addEventListener("gesturechange", bloquear, opcoes);
        const bloquearPinca = (e: TouchEvent) => {
            if (e.touches.length > 1) e.preventDefault();
        };
        document.addEventListener("touchmove", bloquearPinca, opcoes);
        // sem zoom de toque duplo, mantendo a rolagem
        const html = document.documentElement;
        const toqueAntes = html.style.touchAction;
        html.style.touchAction = "pan-x pan-y";
        return () => {
            if (meta && antes !== null) meta.setAttribute("content", antes);
            document.removeEventListener("gesturestart", bloquear);
            document.removeEventListener("gesturechange", bloquear);
            document.removeEventListener("touchmove", bloquearPinca);
            html.style.touchAction = toqueAntes;
        };
    }, []);
}
