"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Basicos";

// Janela padrão e janela de confirmação, no padrão das telas repaginadas (06/10/2026):
// computador = diálogo centralizado; celular (< 1024 px) = folha que sobe de baixo.
// Sempre no <body> (portal), acima das janelas da tela (z-[80]), Esc fecha.

export function JanelaBase({
    open,
    title,
    subtitle,
    onClose,
    children,
    footer,
    closeOnBackdrop = false,
    closeOnEsc = true,
    panelClassName = "",
    bodyClassName = "",
    ariaFechar = "Fechar",
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
    panelClassName?: string;
    bodyClassName?: string;
    ariaFechar?: string;
}) {
    const [montado, setMontado] = useState(false);
    useEffect(() => setMontado(true), []);

    useEffect(() => {
        if (!open || !closeOnEsc) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, closeOnEsc, onClose]);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    if (!open || !montado) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            data-pai-overlay=""
            className="fixed inset-0 z-[80] flex items-end justify-center bg-[#313C55]/45 dark:bg-black/60 lg:items-center lg:p-6"
            onMouseDown={(e) => {
                if (closeOnBackdrop && e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={[
                    "flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-[#FFFFFF] text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white",
                    "lg:max-h-[90dvh] lg:rounded-3xl",
                    panelClassName || "lg:max-w-2xl",
                ].join(" ")}
            >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#E3E8F0] px-5 py-4 dark:border-white/12">
                    <div className="min-w-0">
                        <h2 className="text-[18px] font-extrabold leading-tight">{title}</h2>
                        {subtitle ? <p className="mt-1 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{subtitle}</p> : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={ariaFechar}
                        title="Fechar"
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-[#5B6478] hover:bg-[#EEF2F7] dark:text-[#AEB9CF] dark:hover:bg-white/8"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    </button>
                </div>

                <div
                    className={["min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable]", bodyClassName].join(" ")}
                    style={{ WebkitOverflowScrolling: "touch" }}
                >
                    {children}
                </div>

                {footer ? (
                    <div className="shrink-0 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] dark:border-white/12 dark:bg-[#1C2334] lg:pb-3">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>,
        document.body
    );
}

/* =========================
   MODAL (não fecha clicando fora; fecha pelo X, pelos botões ou pelo Esc)
========================= */

export function Modal(props: {
    open: boolean;
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
    panelClassName?: string;
    bodyClassName?: string;
}) {
    return <JanelaBase {...props} />;
}

/* =========================
   CONFIRM DIALOG
========================= */

export function ConfirmDialog({
    open,
    title,
    message,
    confirmText = "Sim, confirmar",
    cancelText = "Cancelar",
    onConfirm,
    onCancel,
}: {
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <JanelaBase
            open={open}
            title={title}
            subtitle={message}
            onClose={onCancel}
            footer={
                <div className="flex gap-2 lg:justify-end">
                    <Button variant="ghost" onClick={onCancel} type="button" className="flex-1 lg:flex-none">
                        {cancelText}
                    </Button>
                    <Button onClick={onConfirm} type="button" className="flex-1 lg:flex-none">
                        {confirmText}
                    </Button>
                </div>
            }
        >
            <div className="rounded-2xl border border-[#F2CB3F] bg-[#FCF3CC] p-3 text-sm font-bold text-[#313C55] dark:bg-[#F2CB3F]/16 dark:text-white">
                Atenção: após confirmar, a movimentação será registrada no sistema.
            </div>
        </JanelaBase>
    );
}
