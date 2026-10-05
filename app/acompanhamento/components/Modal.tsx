"use client";

import React, { useEffect } from "react";

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
}) {
    useEffect(() => {
        if (!open || typeof document === "undefined") return;

        // Evita que o documento por trás do modal role enquanto o modal está aberto.
        // Isso também reduz saltos de viewport no Safari/iOS ao abrir selects e teclado.
        const html = document.documentElement;
        const body = document.body;

        const previousHtmlOverflow = html.style.overflow;
        const previousBodyOverflow = body.style.overflow;
        const previousBodyOverscroll = body.style.overscrollBehavior;

        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.overscrollBehavior = "none";

        return () => {
            html.style.overflow = previousHtmlOverflow;
            body.style.overflow = previousBodyOverflow;
            body.style.overscrollBehavior = previousBodyOverscroll;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 flex items-end justify-center overflow-hidden bg-[#313C55]/45 p-0 sm:items-center sm:p-4"
            style={{
                zIndex,
                width: "100vw",
                height: "100dvh",
            }}
            role={role} data-pai-overlay
            aria-modal="true"
            aria-label={ariaLabel}
            onClick={(e) => {
                if (closeOnBackdrop && e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[#E3E8F0] bg-white dark:bg-[#232B3F] text-[#313C55] shadow-2xl outline-none dark:border-white/[0.12] dark:text-white sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl"
                style={{ maxWidth: maxWidth ?? 720 }}
            >
                <div
                    className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5 ${contentClassName}`}
                    style={{
                        WebkitOverflowScrolling: "touch",
                        touchAction: "pan-y",
                    }}
                >
                    {children}
                </div>

                {footer ? (
                    <div className="shrink-0 border-t border-[#E3E8F0] bg-[#F6F8FB] px-4 py-3 dark:border-white/[0.12] dark:bg-[#1C2334] sm:px-5 sm:py-4">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
