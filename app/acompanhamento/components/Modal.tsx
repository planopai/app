"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Janela do app.
 *  • variant="sheet"  (padrão): folha que sobe de baixo no celular e janela centralizada no computador.
 *  • variant="drawer": janela lateral (direita) no computador; no celular continua sendo folha.
 *
 * Regras que valem para TODAS as janelas (celular):
 *  - Cobrem a tela inteira com `position: fixed; inset: 0` (sem `100vw`/`100dvh`, que no iPhone
 *    mudam com a barra do Safari e deixavam um vão embaixo).
 *  - Respeitam a borda de cima (barra de status / notch) e a de baixo (barra de início do iPhone):
 *    o espaço seguro entra como preenchimento do contêiner e do rodapé.
 *  - São montadas direto no <body> (portal), então nenhum contêiner da página muda a posição delas.
 *  - A barra fixa de baixo some enquanto a janela está aberta (ela procura `data-pai-overlay`).
 */

let travas = 0;
let guardado: { html: string; body: string; overscroll: string } | null = null;

function travarRolagem() {
    const html = document.documentElement;
    const body = document.body;
    if (travas === 0) {
        guardado = { html: html.style.overflow, body: body.style.overflow, overscroll: body.style.overscrollBehavior };
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.overscrollBehavior = "none";
    }
    travas++;
}
function liberarRolagem() {
    travas = Math.max(0, travas - 1);
    if (travas === 0 && guardado) {
        document.documentElement.style.overflow = guardado.html;
        document.body.style.overflow = guardado.body;
        document.body.style.overscrollBehavior = guardado.overscroll;
        guardado = null;
        // iOS: depois de fechar janela/teclado, força o navegador a recalcular a área visível.
        window.setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 60);
    }
}

export default function Modal({
    open,
    onClose,
    children,
    ariaLabel,
    maxWidth,
    role = "dialog",
    closeOnBackdrop = true,
    zIndex = 50,
    contentClassName = "",
    footer,
    variant = "sheet",
    eyebrow,
    title,
}: {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    ariaLabel: string;
    maxWidth?: number;
    role?: "dialog" | "alertdialog";
    closeOnBackdrop?: boolean;
    zIndex?: number;
    contentClassName?: string;
    footer?: React.ReactNode;
    variant?: "sheet" | "drawer";
    /** Cabeçalho padrão do mockup: linha pequena em maiúsculas + título + botão de fechar (44 px). */
    eyebrow?: string;
    title?: React.ReactNode;
}) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);

    useEffect(() => {
        if (!open || typeof document === "undefined") return;
        travarRolagem();
        return () => liberarRolagem();
    }, [open]);

    useEffect(() => {
        if (!open || !closeOnBackdrop) return;
        const aoTecla = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", aoTecla);
        return () => window.removeEventListener("keydown", aoTecla);
    }, [open, closeOnBackdrop, onClose]);

    if (!open || !montado || typeof document === "undefined") return null;

    const lateral = variant === "drawer";
    const temCabecalho = !!(eyebrow || title);

    const janela = (
        <div
            className={[
                "fixed inset-0 flex items-end justify-center overflow-hidden bg-[#313C55]/45",
                lateral ? "sm:items-stretch sm:justify-end" : "sm:items-center sm:p-4",
            ].join(" ")}
            style={{
                zIndex,
                // Borda de cima/lados seguras (o de baixo fica no rodapé da folha, para ela encostar na borda da tela).
                paddingTop: "env(safe-area-inset-top)",
                paddingLeft: "env(safe-area-inset-left)",
                paddingRight: "env(safe-area-inset-right)",
            }}
            role={role}
            data-pai-overlay
            data-pai-sem-folga
            aria-modal="true"
            aria-label={ariaLabel}
            onClick={(e) => {
                if (closeOnBackdrop && e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={[
                    "flex w-full min-h-0 flex-col overflow-hidden border border-[#E3E8F0] bg-white text-[#313C55] shadow-2xl outline-none dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-white",
                    "max-h-[calc(100%-0.75rem)] rounded-t-3xl",
                    lateral ? "sm:h-full sm:max-h-none sm:rounded-none sm:rounded-l-[22px] sm:border-r-0" : "sm:max-h-[92%] sm:rounded-3xl",
                ].join(" ")}
                style={{ maxWidth: maxWidth ?? (lateral ? 480 : 720) }}
            >
                {temCabecalho && (
                    <div className="flex shrink-0 items-start gap-3 border-b border-[#E3E8F0] px-4 pb-3 pt-4 dark:border-white/[0.12] sm:px-5">
                        <div className="min-w-0 flex-1">
                            {eyebrow && <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#5B6478] dark:text-[#AEB9CF]">{eyebrow}</div>}
                            {title && <h2 className="mt-1 text-[21px] font-extrabold leading-tight">{title}</h2>}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Fechar"
                            className="-mr-2 -mt-1.5 grid size-11 shrink-0 place-items-center rounded-xl text-[#313C55] hover:bg-[#EEF2F7] dark:text-white dark:hover:bg-white/10"
                        >
                            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                <div
                    className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 ${footer ? "" : "pb-[calc(1rem+env(safe-area-inset-bottom))]"} ${contentClassName}`}
                    style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
                >
                    {children}
                </div>

                {footer ? (
                    <div className="shrink-0 border-t border-[#E3E8F0] bg-[#F6F8FB] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] sm:px-5 sm:pb-4 sm:pt-4">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );

    return createPortal(janela, document.body);
}
