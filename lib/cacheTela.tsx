"use client";

/**
 * lib/cacheTela.tsx — "a tela abre com os últimos dados" (19/11/2026).
 *
 * Ao voltar para uma tela (Coroas, Requisições, Avisos, Estoque), ela mostra NA HORA os dados da última
 * visita e busca os novos em segundo plano. Até os novos chegarem:
 *   - aparece o aviso "Atualizando…" no topo (FaixaAtualizando);
 *   - os toques na lista ficam bloqueados (travaToques), para ninguém agir em cima de dado antigo.
 * A cópia é do usuário logado (cookie pai_uid), vale no máximo 30 min e fica só neste aparelho.
 * O servidor continua conferindo tudo ao gravar, como sempre.
 */

import React from "react";

const PREFIXO = "pai_tela_v1:";
export const VALIDADE_CACHE_TELA_MS = 30 * 60 * 1000;

function uidAtual(): string {
    if (typeof document === "undefined") return "";
    const m = document.cookie.match(/(?:^|;\s*)pai_uid=([^;]*)/);
    return m ? decodeURIComponent(m[1]).trim() : "";
}

function chaveDe(nome: string): string | null {
    const uid = uidAtual();
    return uid ? `${PREFIXO}${uid}:${nome}` : null;
}

/** Última cópia da tela (ou null se não houver, for de outro usuário ou tiver passado da validade). */
export function lerCacheTela<T>(nome: string, validadeMs = VALIDADE_CACHE_TELA_MS): T | null {
    try {
        const chave = chaveDe(nome);
        if (!chave) return null;
        const bruto = window.localStorage.getItem(chave);
        if (!bruto) return null;
        const j = JSON.parse(bruto) as { em: number; dados: T };
        if (!j || typeof j.em !== "number" || Date.now() - j.em > validadeMs) return null;
        return j.dados ?? null;
    } catch {
        return null;
    }
}

/** Guarda a cópia da tela. Se não couber no aparelho, só não guarda (a tela funciona como antes). */
export function gravarCacheTela(nome: string, dados: unknown): void {
    try {
        const chave = chaveDe(nome);
        if (!chave) return;
        window.localStorage.setItem(chave, JSON.stringify({ em: Date.now(), dados }));
    } catch {
        /* sem espaço ou sem armazenamento: segue sem cópia */
    }
}

/** Estilo para o bloco da lista: com dados antigos na tela, não aceita toques até atualizar. */
export function travaToques(desatualizado: boolean): React.CSSProperties {
    return desatualizado ? { pointerEvents: "none", userSelect: "none" } : {};
}

/** Aviso fixo no topo enquanto a tela mostra os dados da última visita. */
export function FaixaAtualizando({ ativo }: { ativo: boolean }) {
    if (!ativo) return null;
    return (
        <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full bg-[#313C55] px-4 py-2 text-[13px] font-bold text-white shadow-lg dark:bg-[#F2CB3F] dark:text-[#313C55]"
        >
            <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-[#F2CB3F] align-middle dark:bg-[#313C55]" />
            Atualizando…
        </div>
    );
}
