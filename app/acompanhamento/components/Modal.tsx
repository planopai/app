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
            className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black/50 p-3 sm:p-4"
            style={{
                zIndex,
                width: "100vw",
                height: "100dvh",
            }}
            role={role}
            aria-modal="true"
            aria-label={ariaLabel}
            onClick={(e) => {
                if (closeOnBackdrop && e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className="flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl outline-none sm:max-h-[calc(100dvh-2rem)]"
                style={{
                    maxWidth: maxWidth ?? 720,
                }}
            >
                <div
                    className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 ${contentClassName}`}
                    style={{
                        WebkitOverflowScrolling: "touch",
                        touchAction: "pan-y",
                    }}
                >
                    {children}
                </div>

                {footer ? (
                    <div className="shrink-0 border-t bg-white px-4 py-3 sm:px-5 sm:py-4">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );
}