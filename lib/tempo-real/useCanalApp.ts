"use client";

/**
 * lib/tempo-real/useCanalApp.ts — tela que "escuta" o servidor em vez de perguntar de tempos em tempos (19/11/2026).
 *
 * A tela carrega os dados uma vez ao abrir. O PHP, ao gravar algo que muda a tela, avisa o canal da Ably
 * (backend/api/tempo_real.php → trAvisar). Este hook recebe o aviso e chama onAviso (a tela busca de novo).
 *
 * - A credencial vem do PHP da própria tela (tokenUrl), que só deixa OUVIR o canal dela.
 * - A biblioteca da Ably só é baixada nas telas que usam este hook (import dinâmico).
 * - conectado = false: a Ably não está configurada, caiu ou ainda está conectando. A tela deve manter a
 *   consulta de antes como segurança (ver Salas do Memorial).
 * - Ao reconectar (e ao voltar para a aba), chama onAviso uma vez para cobrir o que mudou enquanto estava fora.
 */

import { useEffect, useRef, useState } from "react";

type Opcoes = {
    /** Endereço que devolve { tempo_real: TokenRequest | null, canal: "pai-app:..." } (com o cookie de login). */
    tokenUrl: string;
    /** Chamado a cada aviso do servidor (vários avisos seguidos viram uma chamada só). */
    onAviso: (evento: { nome: string; dados: unknown }) => void;
    /** Desliga o hook (ex.: tela pública). */
    desligado?: boolean;
};

const JUNTAR_MS = 150;

export function useCanalApp({ tokenUrl, onAviso, desligado = false }: Opcoes): { conectado: boolean } {
    const [conectado, setConectado] = useState(false);
    const avisoRef = useRef(onAviso);
    avisoRef.current = onAviso;

    useEffect(() => {
        if (desligado || typeof window === "undefined") return;
        let vivo = true;
        let cliente: any = null;
        let timer: number | null = null;
        let ultimo: { nome: string; dados: unknown } = { nome: "mudou", dados: null };

        const avisar = (nome: string, dados: unknown) => {
            ultimo = { nome, dados };
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                timer = null;
                if (vivo) avisoRef.current(ultimo);
            }, JUNTAR_MS);
        };

        (async () => {
            // Primeira credencial: também diz qual é o canal e se a Ably está ligada no servidor.
            let primeira: any = null;
            try {
                const r = await fetch(tokenUrl + (tokenUrl.includes("?") ? "&" : "?") + "_=" + Date.now(), { credentials: "include", cache: "no-store" });
                primeira = await r.json().catch(() => null);
            } catch {
                primeira = null;
            }
            const canal = String(primeira?.canal || "");
            if (!vivo || !primeira?.tempo_real || !canal) return; // sem Ably: a tela segue com a consulta de segurança

            const Ably: any = await import("ably");
            if (!vivo) return;
            let usarPrimeira = true;
            cliente = new Ably.Realtime({
                authCallback: async (_params: unknown, callback: (erro: unknown, token: unknown) => void) => {
                    try {
                        if (usarPrimeira) {
                            usarPrimeira = false;
                            callback(null, primeira.tempo_real);
                            return;
                        }
                        const r = await fetch(tokenUrl + (tokenUrl.includes("?") ? "&" : "?") + "_=" + Date.now(), { credentials: "include", cache: "no-store" });
                        const j = await r.json();
                        if (!j?.tempo_real) throw new Error("Tempo real indisponível.");
                        callback(null, j.tempo_real);
                    } catch (e: any) {
                        callback(e?.message || "Falha na credencial do tempo real.", null);
                    }
                },
                closeOnUnload: true,
            });
            let jaConectou = false;
            cliente.connection.on((m: any) => {
                if (!vivo) return;
                const ok = m.current === "connected";
                setConectado(ok);
                // Reconectou depois de cair: busca uma vez para cobrir o que mudou nesse meio-tempo.
                if (ok && jaConectou) avisar("reconectou", null);
                if (ok) jaConectou = true;
            });
            cliente.channels.get(canal).subscribe((m: any) => avisar(String(m?.name || "mudou"), m?.data ?? null));
        })().catch((e) => {
            console.warn("[tempo real] não foi possível ligar:", e);
        });

        return () => {
            vivo = false;
            if (timer) window.clearTimeout(timer);
            try {
                cliente?.close();
            } catch {
                /* já fechado */
            }
            setConectado(false);
        };
    }, [tokenUrl, desligado]);

    return { conectado };
}
