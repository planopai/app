"use client";

import React from "react";

// Peças básicas: cartão, campo, entradas, botão e selo.
// Visual no padrão das telas repaginadas (06/10/2026), com tema claro e escuro.

/* =========================
   UI KIT
========================= */

const CAMPO =
    "w-full rounded-xl border border-transparent bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] " +
    "focus:border-[#3D6A99] focus:ring-2 focus:ring-[#3D6A99]/20 disabled:opacity-60 " +
    "dark:bg-[#1C2334] dark:text-white dark:placeholder:text-[#8893AA] dark:[color-scheme:dark] lg:text-[15px]";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <section className={["rounded-2xl border border-[#E3E8F0] bg-[#FFFFFF] dark:border-white/12 dark:bg-[#232B3F]", className].join(" ")}>
            {children}
        </section>
    );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-[12px] font-extrabold uppercase tracking-[.08em] text-[#5B6478] dark:text-[#AEB9CF]">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-[12px] text-[#7A8396] dark:text-[#8893AA]">{hint}</span> : null}
        </label>
    );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(
    { className = "", ...props },
    ref
) {
    return <input ref={ref} {...props} className={[CAMPO, "h-12", className].join(" ")} />;
});

export function TextArea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea {...props} className={[CAMPO, "min-h-[96px] py-3", className].join(" ")} />;
}

export function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props} className={[CAMPO, "h-12", className].join(" ")} />;
}

export function Button({
    children,
    variant = "solid",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "soft" }) {
    const base =
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-bold outline-none transition-colors " +
        "focus-visible:ring-2 focus-visible:ring-[#3D6A99]/40 disabled:cursor-not-allowed disabled:opacity-50";

    // solid = ação principal; ghost/soft = secundário (fundo do cartão com borda)
    const cls =
        variant === "solid"
            ? "bg-[#313C55] font-extrabold text-white hover:bg-[#232B40] dark:bg-[#3D6A99] dark:hover:bg-[#355D86]"
            : "border border-[#C9D1DE] bg-[#FFFFFF] text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/26 dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/8";

    return (
        <button {...props} className={[base, cls, className].join(" ")}>
            {children}
        </button>
    );
}

export function Badge({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-full border border-[#E3E8F0] bg-[#F6F8FB] px-2.5 py-1 text-[12px] font-bold text-[#5B6478] dark:border-white/12 dark:bg-[#1C2334] dark:text-[#AEB9CF]">
            {children}
        </span>
    );
}
