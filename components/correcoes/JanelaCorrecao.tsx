"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";

/* Janela padrão das correções: diálogo no computador, folha que sobe de baixo no celular (< 1024 px).
   Vai para o <body> por portal (z-[90], acima do Registrar ação e do Quadro). Esc fecha só esta janela. */
export default function JanelaCorrecao({
    titulo,
    subtitulo,
    onFechar,
    children,
    rodape,
}: {
    titulo: string;
    subtitulo?: string;
    onFechar: () => void;
    children: React.ReactNode;
    rodape?: React.ReactNode;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            e.preventDefault();
            onFechar();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onFechar]);

    if (typeof document === "undefined") return null;

    return createPortal(
        <div data-pai-overlay className="fixed inset-0 z-[90] flex items-end justify-center bg-[rgba(19,25,38,0.55)] lg:items-center lg:p-6" onClick={onFechar}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={titulo}
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white lg:max-w-[600px] lg:rounded-2xl"
            >
                <div className="flex items-start gap-3 border-b border-[#E3E8F0] px-5 py-4 dark:border-white/[0.12]">
                    <div className="min-w-0 flex-1">
                        <div className="text-lg font-extrabold leading-tight">{titulo}</div>
                        {subtitulo ? <div className="mt-0.5 text-sm text-[#5B6478] dark:text-[#AEB9CF]">{subtitulo}</div> : null}
                    </div>
                    <button
                        type="button"
                        onClick={onFechar}
                        aria-label="Fechar"
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-[#C9D1DE] hover:bg-[#EEF2F7] dark:border-white/25 dark:hover:bg-white/10"
                    >
                        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {rodape ? (
                    <div className="flex gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end">{rodape}</div>
                ) : null}
            </div>
        </div>,
        document.body,
    );
}

/* Peças comuns das telas de correção */

export const BTN_SECUNDARIO =
    "flex h-12 flex-1 items-center justify-center rounded-xl border-[1.5px] border-[#313C55] bg-white px-4 text-sm font-extrabold text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-60 dark:border-white/40 dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/10 lg:flex-none";
export const BTN_PRINCIPAL =
    "flex h-12 flex-[1.4] items-center justify-center rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white hover:bg-[#232B40] disabled:opacity-50 dark:bg-[#3D6A99] dark:hover:bg-[#355D86] lg:flex-none";
export const BTN_PERIGO =
    "flex h-12 flex-[1.4] items-center justify-center rounded-xl bg-[#B42318] px-5 text-sm font-extrabold text-white hover:bg-[#8F1B12] disabled:opacity-50 lg:flex-none";

export function Rotulo({ children }: { children: React.ReactNode }) {
    return <div className="mb-1.5 text-xs font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">{children}</div>;
}

export function CampoMotivo({ valor, onMudar, exemplo }: { valor: string; onMudar: (v: string) => void; exemplo: string }) {
    return (
        <label className="mt-4 block">
            <Rotulo>Motivo (obrigatório)</Rotulo>
            <textarea
                value={valor}
                onChange={(e) => onMudar(e.target.value)}
                rows={3}
                maxLength={240}
                placeholder={exemplo}
                className="w-full rounded-xl border-0 bg-[#F1F4F8] px-3 py-3 text-[16px] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334]"
            />
        </label>
    );
}

export function Aviso({ tom, children }: { tom: "erro" | "ok" | "atencao"; children: React.ReactNode }) {
    const cls =
        tom === "erro"
            ? "border-[#B42318]/40 bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]"
            : tom === "ok"
                ? "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/20 dark:text-white"
                : "border-[#F2CB3F] bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/16 dark:text-white";
    return <div role={tom === "erro" ? "alert" : undefined} className={`mt-3 rounded-xl border px-3 py-2.5 text-sm font-semibold ${cls}`}>{children}</div>;
}

/** Lista de itens que voltam para o estoque. */
export function ListaEstornos({ itens }: { itens: { produto: string; local: string; qtd: number }[] }) {
    if (!itens?.length) return null;
    return (
        <div className="mt-3 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.12]">
            <div className="text-sm font-extrabold">Volta para o estoque</div>
            <ul className="mt-1.5 flex flex-col gap-1.5">
                {itens.map((e, i) => (
                    <li key={i} className="flex items-baseline gap-3 text-[13px]">
                        <span className="min-w-0 flex-1">
                            <b>{e.produto}</b>
                            <span className="block text-xs font-semibold text-[#5B6478] dark:text-[#AEB9CF]">Volta para: {e.local}</span>
                        </span>
                        <span className="shrink-0 text-xs font-extrabold text-[#5B6478] dark:text-[#AEB9CF]">{e.qtd}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
