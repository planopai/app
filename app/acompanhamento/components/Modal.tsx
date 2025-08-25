"use client";
import React from "react";

export default function Modal({
    open,
    onClose,
    children,
    ariaLabel,
    maxWidth,
}: {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    ariaLabel: string;
    maxWidth?: number;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="w-full rounded-xl bg-white p-5 shadow-xl outline-none"
                style={{ maxWidth: maxWidth ?? 720 }}
            >
                {children}
            </div>
        </div>
    );
}
