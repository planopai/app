"use client";

/* Orçamento (13/10/2026) — peças de tela no padrão da repaginada: campos de 48 px sem borda, rótulo em maiúsculas,
   botão principal azul-escuro (claro) / amarelo (escuro), janelas por portal no <body> (z-70), Esc fecha. */

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Situacao, SimNao } from "./tipos";

export const ROTULO = "mb-1.5 block text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]";
export const CAMPO =
    "h-12 w-full min-w-0 rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] font-semibold text-[#313C55] outline-none placeholder:font-normal placeholder:text-[#8A93A6] focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334] dark:text-white";
export const CARTAO = "rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";
export const MUTED = "text-[#5B6478] dark:text-[#AEB9CF]";
export const BTN_PRI =
    "inline-flex h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#313C55] px-5 text-[15px] font-extrabold text-white hover:bg-[#232B40] disabled:opacity-50 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
export const BTN_SEC =
    "inline-flex h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border-[1.5px] border-[#C9D1DE] bg-white px-4 text-[15px] font-bold text-[#313C55] hover:bg-[#EEF2F7] disabled:opacity-50 dark:border-white/25 dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/10";
export const BTN_PERIGO =
    "inline-flex h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border-[1.5px] border-[#B42318]/50 bg-white px-4 text-[15px] font-extrabold text-[#B42318] hover:bg-[#FDECEA] disabled:opacity-50 dark:border-[#FF9C92]/50 dark:bg-transparent dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10";

export function Icone({ d, tam = 20 }: { d: React.ReactNode; tam?: number }) {
    return (
        <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
            {d}
        </svg>
    );
}

export const Ic = {
    mais: <path d="M12 5v14M5 12h14" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    busca: (
        <>
            <circle cx="11" cy="11" r="6" />
            <path d="M20 20l-4.5-4.5" />
        </>
    ),
    folha: <path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h4" />,
    imprimir: <path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />,
    editar: <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />,
    seta: <path d="M5 12h14M13 6l6 6-6 6" />,
    lixo: <path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    atualizar: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
    whatsapp: <path d="M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20zM9 9.5c.3 2.2 2.3 4.3 4.5 4.8l1.2-1.2 1.8.8-.4 1.6c-3.6.4-7.7-3.6-7.3-7.3l1.6-.4.8 1.8z" />,
};

export function Campo({ rotulo, children, dica }: { rotulo: string; children: React.ReactNode; dica?: string }) {
    return (
        <label className="block min-w-0">
            <span className={ROTULO}>{rotulo}</span>
            {children}
            {dica ? <span className={`mt-1 block text-xs ${MUTED}`}>{dica}</span> : null}
        </label>
    );
}

/** Sim | Não com o mesmo jeito do registro do atendimento (✓ no escolhido, ✕ no Não). */
export function EscolhaSimNao({ valor, onMudar, rotulo }: { valor: SimNao; onMudar: (v: SimNao) => void; rotulo: string }) {
    return (
        <div role="group" aria-label={rotulo} className="inline-flex shrink-0 gap-1.5">
            {(["Sim", "Não"] as SimNao[]).map((v) => {
                const on = valor === v;
                return (
                    <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onMudar(v)}
                        className={`inline-flex h-11 min-w-[76px] items-center justify-center gap-1 rounded-xl border-[1.5px] px-3 text-[15px] font-bold ${
                            on
                                ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                                : "border-[#C9D1DE] bg-white text-[#313C55] dark:border-white/25 dark:bg-transparent dark:text-white"
                        }`}
                    >
                        {on ? <Icone d={v === "Sim" ? <path d="M5 12l5 5 9-10" /> : Ic.x} tam={16} /> : null}
                        {v}
                    </button>
                );
            })}
        </div>
    );
}

/** Opções em botões (ex.: sala do Memorial, tipo de ornamentação). */
export function Opcoes<T extends string>({ valor, opcoes, onMudar, rotulo, colunas }: {
    valor: T;
    opcoes: { v: T; r: string; sub?: string }[];
    onMudar: (v: T) => void;
    rotulo: string;
    colunas?: string;
}) {
    return (
        <div role="group" aria-label={rotulo} className={colunas || "flex flex-wrap gap-2"}>
            {opcoes.map((o) => {
                const on = o.v === valor;
                return (
                    <button
                        key={o.v || "nenhum"}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onMudar(o.v)}
                        className={`flex min-h-12 flex-col items-center justify-center rounded-xl border-[1.5px] px-3 py-2 text-center ${
                            on
                                ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                                : "border-[#C9D1DE] bg-white text-[#313C55] dark:border-white/25 dark:bg-transparent dark:text-white"
                        }`}
                    >
                        <span className="text-[15px] font-extrabold leading-tight">{o.r}</span>
                        {o.sub ? <span className={`whitespace-pre-line text-xs font-semibold ${on ? "text-white/85" : MUTED}`}>{o.sub}</span> : null}
                    </button>
                );
            })}
        </div>
    );
}

const TOM_SITUACAO: Record<Situacao, string> = {
    ABERTO: "bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/25 dark:text-white",
    VENCIDO: "bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/20 dark:text-[#F2CB3F]",
    CONVERTIDO: "bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/20 dark:text-[#B3CE52]",
    CANCELADO: "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]",
};
export const TEXTO_SITUACAO: Record<Situacao, string> = { ABERTO: "Em aberto", VENCIDO: "Vencido", CONVERTIDO: "Virou atendimento", CANCELADO: "Cancelado" };

export function EtiquetaSituacao({ s }: { s: Situacao }) {
    return <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[12px] font-extrabold ${TOM_SITUACAO[s] || TOM_SITUACAO.ABERTO}`}>{TEXTO_SITUACAO[s] || s}</span>;
}

export function Aviso({ tom = "info", children }: { tom?: "info" | "erro" | "ok"; children: React.ReactNode }) {
    const cls = {
        info: "bg-[#FCF3CC] text-[#313C55] dark:bg-[#F2CB3F]/15 dark:text-white",
        erro: "bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/15 dark:text-[#FF9C92]",
        ok: "bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/15 dark:text-white",
    }[tom];
    return <div className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold ${cls}`}>{children}</div>;
}

const PILHA: object[] = [];

/**
 * Janela: diálogo centralizado no computador; no celular (< 1024 px), folha que sobe de baixo.
 * Por portal no <body> (z-70), para não ficar presa em contêiner que rola nem atrás da barra de baixo.
 */
export function Janela({ titulo, subtitulo, onFechar, rodape, largura = "max-w-2xl", children }: {
    titulo: string;
    subtitulo?: string;
    onFechar: () => void;
    rodape?: React.ReactNode;
    largura?: string;
    children: React.ReactNode;
}) {
    const [montado, setMontado] = useState(false);
    const fecharRef = React.useRef(onFechar);
    fecharRef.current = onFechar;
    useEffect(() => {
        setMontado(true);
        // Janela por cima de janela: o Esc fecha só a de cima.
        const marca = {};
        PILHA.push(marca);
        const esc = (e: KeyboardEvent) => {
            if (e.key === "Escape" && PILHA[PILHA.length - 1] === marca) {
                e.stopPropagation();
                fecharRef.current();
            }
        };
        window.addEventListener("keydown", esc);
        const antes = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", esc);
            const i = PILHA.indexOf(marca);
            if (i >= 0) PILHA.splice(i, 1);
            document.body.style.overflow = antes;
        };
    }, []);
    if (!montado) return null;
    return createPortal(
        <div data-pai-overlay className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(10,14,24,0.55)] lg:items-center lg:p-6" onClick={onFechar}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={titulo}
                onClick={(e) => e.stopPropagation()}
                className={`flex max-h-[90dvh] w-full ${largura} flex-col rounded-t-3xl bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white lg:rounded-3xl`}
            >
                <div className="flex items-start gap-2 border-b border-[#E3E8F0] py-3 pl-5 pr-2 dark:border-white/[0.12]">
                    <div className="min-w-0 flex-1 pt-1">
                        <h2 className="text-[19px] font-black leading-tight">{titulo}</h2>
                        {subtitulo ? <div className={`mt-0.5 text-sm ${MUTED}`}>{subtitulo}</div> : null}
                    </div>
                    <button type="button" aria-label="Fechar" onClick={onFechar} className="flex size-11 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10">
                        <Icone d={Ic.x} tam={22} />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {rodape ? (
                    <div className="flex gap-2.5 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end lg:rounded-b-3xl lg:pb-3 [&>*]:flex-1 lg:[&>*]:flex-none">
                        {rodape}
                    </div>
                ) : null}
            </div>
        </div>,
        document.body,
    );
}

/** Telefone com máscara (DDD) enquanto digita. */
export function mascaraTelefone(v: string): string {
    const d = v.replace(/\D+/g, "").slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
