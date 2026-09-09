"use client";

import React from "react";

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
}) {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
            style={{ zIndex }}
            role={role}
            aria-modal="true"
            aria-label={ariaLabel}
            onClick={(e) => {
                if (
                    closeOnBackdrop &&
                    e.target === e.currentTarget
                ) {
                    onClose();
                }
            }}
        >
            <div
                className={`w-full rounded-xl bg-white p-5 shadow-xl outline-none max-h-[90vh] overflow-y-auto overscroll-contain ${contentClassName}`}
                style={{ maxWidth: maxWidth ?? 720 }}
            >
                {children}
            </div>
        </div>
    );
}
