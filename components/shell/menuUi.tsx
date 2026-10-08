"use client";

/**
 * Peças de tela usadas por Organizar menu (Gestão) e Personalizar menu (cada usuário). 08/10/2026.
 * Padrão das telas repaginadas: janela centralizada no computador e folha que sobe de baixo no celular (< 1024 px),
 * sempre por portal no <body>, z-[70], Esc fecha; alvos de toque de 44 px; campos de 48 px.
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { ICONES, NOMES_ICONES } from "./icones";

export const BTN =
    "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#C9D1DE] bg-white px-4 text-sm font-bold text-[#313C55] hover:bg-[#F1F4F8] disabled:opacity-40 dark:border-white/20 dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/10";
export const BTN_PRI =
    "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#313C55] px-5 text-sm font-extrabold text-white hover:bg-[#232B40] disabled:opacity-40 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
export const BTN_PERIGO =
    "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#B42318] bg-white px-4 text-sm font-bold text-[#B42318] hover:bg-[#FDECEA] disabled:opacity-40 dark:border-[#FF9C92] dark:bg-transparent dark:text-[#FF9C92] dark:hover:bg-[#FF9C92]/10";
/** Botão quadrado de 44 px (setas, olho, ícone). */
export const QUAD =
    "grid size-11 shrink-0 place-items-center rounded-xl border border-[#E3E8F0] bg-white text-[#313C55] hover:bg-[#F1F4F8] disabled:opacity-30 dark:border-white/[0.14] dark:bg-[#1C2334] dark:text-white dark:hover:bg-white/10";
export const CAMPO =
    "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none focus:ring-2 focus:ring-[#3D6A99]/40 dark:bg-[#1C2334] dark:text-white";
export const ROTULO = "mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]";
export const CARTAO = "rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]";

export function AvisoFaixa({ tom, children }: { tom: "erro" | "ok" | "atencao" | "info"; children: React.ReactNode }) {
    const cor = {
        erro: "border-[#B42318] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92]/60 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]",
        ok: "border-[#7BA11A] bg-[#EEF5D6] text-[#313C55] dark:border-[#B3CE52]/60 dark:bg-[#B3CE52]/15 dark:text-white",
        atencao: "border-[#F2CB3F] bg-[#FCF3CC] text-[#313C55] dark:border-[#F2CB3F]/60 dark:bg-[#F2CB3F]/15 dark:text-white",
        info: "border-[#A9BED6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/60 dark:bg-[#3D6A99]/20 dark:text-white",
    }[tom];
    return <div className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${cor}`}>{children}</div>;
}

/** Janela: diálogo no computador, folha de baixo no celular. */
export function Janela({
    titulo,
    aoFechar,
    children,
    rodape,
    largura = "max-w-lg",
}: {
    titulo: string;
    aoFechar: () => void;
    children: React.ReactNode;
    rodape?: React.ReactNode;
    largura?: string;
}) {
    const [montada, setMontada] = useState(false);
    useEffect(() => {
        setMontada(true);
        const tecla = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                aoFechar();
            }
        };
        window.addEventListener("keydown", tecla, true);
        return () => window.removeEventListener("keydown", tecla, true);
    }, [aoFechar]);
    if (!montada) return null;
    return createPortal(
        <div data-pai-overlay className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 lg:items-center lg:p-6" onMouseDown={aoFechar}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={titulo}
                onMouseDown={(e) => e.stopPropagation()}
                className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-xl dark:bg-[#232B3F] dark:text-white lg:rounded-2xl ${largura}`}
            >
                <div className="flex items-center gap-2 border-b border-[#E3E8F0] px-5 py-3 dark:border-white/[0.12]">
                    <h2 className="flex-1 text-lg font-extrabold">{titulo}</h2>
                    <button type="button" onClick={aoFechar} aria-label="Fechar" className="grid size-11 place-items-center rounded-xl hover:bg-[#F1F4F8] dark:hover:bg-white/10">
                        <IconX size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {rodape ? (
                    <div className="flex gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-white/[0.12] dark:bg-[#1C2334] lg:justify-end lg:pb-3 [&>*]:flex-1 lg:[&>*]:flex-none">
                        {rodape}
                    </div>
                ) : null}
            </div>
        </div>,
        document.body,
    );
}

/** Pergunta de confirmação (no lugar do window.confirm). */
export function Confirmar({
    titulo,
    texto,
    botao,
    perigo = false,
    aoConfirmar,
    aoFechar,
}: {
    titulo: string;
    texto: React.ReactNode;
    botao: string;
    perigo?: boolean;
    aoConfirmar: () => void;
    aoFechar: () => void;
}) {
    return (
        <Janela
            titulo={titulo}
            aoFechar={aoFechar}
            rodape={
                <>
                    <button type="button" className={BTN} onClick={aoFechar}>
                        Voltar
                    </button>
                    <button type="button" className={perigo ? BTN_PERIGO : BTN_PRI} onClick={aoConfirmar}>
                        {botao}
                    </button>
                </>
            }
        >
            <div className="text-[15px] leading-relaxed text-[#5B6478] dark:text-[#D6DCE8]">{texto}</div>
        </Janela>
    );
}

/** Pede um texto (nome de módulo, nome de seção). */
export function PerguntaTexto({
    titulo,
    rotulo,
    inicial = "",
    max = 40,
    botao = "Confirmar",
    aoConfirmar,
    aoFechar,
}: {
    titulo: string;
    rotulo: string;
    inicial?: string;
    max?: number;
    botao?: string;
    aoConfirmar: (v: string) => void;
    aoFechar: () => void;
}) {
    const [v, setV] = useState(inicial);
    const ref = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        ref.current?.focus();
    }, []);
    const ok = v.trim().length > 0;
    return (
        <Janela
            titulo={titulo}
            aoFechar={aoFechar}
            rodape={
                <>
                    <button type="button" className={BTN} onClick={aoFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={!ok} onClick={() => ok && aoConfirmar(v.trim())}>
                        {botao}
                    </button>
                </>
            }
        >
            <label className={ROTULO} htmlFor="pergunta-texto">
                {rotulo}
            </label>
            <input
                id="pergunta-texto"
                ref={ref}
                className={CAMPO}
                value={v}
                maxLength={max}
                onChange={(e) => setV(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && ok) aoConfirmar(v.trim());
                }}
            />
        </Janela>
    );
}

/** Grade de ícones. `padrao` mostra a opção "Ícone padrão" (valor ""). */
export function EscolherIcone({
    atual,
    padrao,
    aoEscolher,
    aoFechar,
}: {
    atual: string;
    padrao?: React.ReactNode;
    aoEscolher: (nome: string) => void;
    aoFechar: () => void;
}) {
    return (
        <Janela titulo="Escolher ícone" aoFechar={aoFechar} largura="max-w-xl">
            {padrao ? (
                <button
                    type="button"
                    onClick={() => aoEscolher("")}
                    className={`mb-3 flex h-12 w-full items-center gap-3 rounded-xl border px-3 text-sm font-bold ${
                        atual === "" ? "border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/20" : "border-[#E3E8F0] dark:border-white/[0.14]"
                    }`}
                >
                    {padrao}
                    <span>Ícone padrão</span>
                </button>
            ) : null}
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                {NOMES_ICONES.map((nome) => {
                    const I = ICONES[nome];
                    const on = nome === atual;
                    return (
                        <button
                            key={nome}
                            type="button"
                            title={nome}
                            aria-label={`Ícone ${nome}`}
                            aria-pressed={on}
                            onClick={() => aoEscolher(nome)}
                            className={`grid aspect-square min-h-11 place-items-center rounded-xl border ${
                                on
                                    ? "border-[#3D6A99] bg-[#E9EFF6] dark:bg-[#3D6A99]/25"
                                    : "border-[#E3E8F0] hover:bg-[#F1F4F8] dark:border-white/[0.14] dark:hover:bg-white/10"
                            }`}
                        >
                            <I size={22} stroke={1.8} />
                        </button>
                    );
                })}
            </div>
        </Janela>
    );
}
