"use client";

import React, { useEffect, useState } from "react";

type VisualViewportState = {
    width: number;
    height: number;
    offsetTop: number;
    offsetLeft: number;
};

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
    const [viewport, setViewport] = useState<VisualViewportState | null>(null);

    useEffect(() => {
        if (!open || typeof window === "undefined") return;

        const updateViewport = () => {
            const vv = window.visualViewport;

            setViewport({
                width: Math.max(1, Math.round(vv?.width ?? window.innerWidth)),
                height: Math.max(1, Math.round(vv?.height ?? window.innerHeight)),
                offsetTop: Math.max(0, Math.round(vv?.offsetTop ?? 0)),
                offsetLeft: Math.max(0, Math.round(vv?.offsetLeft ?? 0)),
            });
        };

        updateViewport();

        const vv = window.visualViewport;
        vv?.addEventListener("resize", updateViewport);
        vv?.addEventListener("scroll", updateViewport);
        window.addEventListener("resize", updateViewport);

        return () => {
            vv?.removeEventListener("resize", updateViewport);
            vv?.removeEventListener("scroll", updateViewport);
            window.removeEventListener("resize", updateViewport);
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="fixed flex items-center justify-center overflow-hidden bg-black/50 p-4"
            style={{
                zIndex,
                top: viewport?.offsetTop ?? 0,
                left: viewport?.offsetLeft ?? 0,
                width: viewport ? `${viewport.width}px` : "100vw",
                height: viewport ? `${viewport.height}px` : "100dvh",
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
                className="flex max-h-full w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl outline-none"
                style={{ maxWidth: maxWidth ?? 720 }}
            >
                <div
                    className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 ${contentClassName}`}
                    style={{ WebkitOverflowScrolling: "touch" }}
                >
                    {children}
                </div>

                {footer ? (
                    <div className="shrink-0 border-t bg-white px-5 py-4">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
