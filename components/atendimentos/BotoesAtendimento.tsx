"use client";

/* =====================================================================================
   Botões das ações do atendimento — PADRÃO ÚNICO do app (06/10/2026).
   Usado na lista de Atendimentos (computador e celular) e na janela
   "Informações do atendimento" do Quadro (quadro-acompanhamento e quadrotv).

   Só ícone, 44 × 44, raio 12, ícone 20 px (traço 1,8):
   Cores = as que estão no ar (prints de 06/10/2026):
   • Registrar ação ... seta no círculo · azul-marinho #313C55 (escuro: azul #3D6A99), ícone branco
   • Editar ........... lápis · amarelo #F2CB3F, ícone #313C55
   • Compartilhar ..... três pontos ligados · verde-lima #B3CE52, ícone #313C55
   • Visita ........... olho · contorno (visitar) · azul #3D6A99 (em andamento) · verde (finalizada) · apagado (indisponível)

   Para mudar a aparência, mude SÓ aqui: todas as telas passam a seguir.
   ===================================================================================== */

import React from "react";

export type VisitaStatusBotao = "visitar" | "em_andamento" | "visitado" | "indisponivel";

function Ic({ children }: { children: React.ReactNode }) {
    return (
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {children}
        </svg>
    );
}
export const IcAcaoSeta = () => (<Ic><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="m12 8 4 4-4 4" /></Ic>);
export const IcEditar = () => (<Ic><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Ic>);
export const IcCompartilhar = () => (<Ic><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4" /><path d="m15.4 6.5-6.8 4" /></Ic>);
export const IcOlho = () => (<Ic><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Ic>);

export const BTN_BASE =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-xl no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3D6A99]";
/** Cores dos botões (uma só fonte; usadas também no "+ Novo registro"). */
export const COR_ACAO = "bg-[#313C55] text-white hover:bg-[#232B40] dark:bg-[#3D6A99] dark:text-white dark:hover:bg-[#355D86]";
export const COR_EDITAR = "bg-[#F2CB3F] text-[#313C55] hover:bg-[#E4BC30]";
export const COR_COMPARTILHAR = "bg-[#B3CE52] text-[#313C55] hover:bg-[#A3BE45]";

export const BTN_ACAO = `${BTN_BASE} ${COR_ACAO}`;
export const BTN_EDITAR = `${BTN_BASE} ${COR_EDITAR}`;
export const BTN_COMPARTILHAR = `${BTN_BASE} ${COR_COMPARTILHAR}`;

function classeVisita(s: VisitaStatusBotao): string {
    if (s === "em_andamento") return "border-[1.5px] border-[#3D6A99] bg-[#3D6A99] text-white";
    if (s === "visitado") return "border-[1.5px] border-[#B3CE52] bg-[#EEF5D6] text-[#313C55] dark:bg-[#B3CE52]/20 dark:text-white";
    if (s === "visitar") return "border-[1.5px] border-[#313C55] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/60 dark:bg-[#232B3F] dark:text-white";
    return "border-[1.5px] border-[#C9D1DE] bg-white text-[#313C55] opacity-45 cursor-not-allowed dark:border-white/25 dark:bg-[#232B3F] dark:text-white";
}
function rotuloVisita(s: VisitaStatusBotao): string {
    if (s === "visitar") return "Iniciar visita";
    if (s === "em_andamento") return "Visita em andamento";
    if (s === "visitado") return "Visita finalizada";
    return "Visita indisponível";
}

/* ---------- Botões prontos ---------- */

export function BotaoRegistrarAcao({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" className={BTN_ACAO} onClick={onClick} title="Registrar ação" aria-label="Registrar ação">
            <IcAcaoSeta />
        </button>
    );
}

/** Editar: com `href` vira link (Quadro); com `onClick`, botão (lista). */
export function BotaoEditar({ onClick, href }: { onClick?: () => void; href?: string }) {
    if (href) {
        return (
            <a href={href} className={BTN_EDITAR} title="Editar" aria-label="Editar">
                <IcEditar />
            </a>
        );
    }
    return (
        <button type="button" className={BTN_EDITAR} onClick={onClick} title="Editar" aria-label="Editar">
            <IcEditar />
        </button>
    );
}

export function BotaoCompartilhar({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" className={BTN_COMPARTILHAR} onClick={onClick} title="Compartilhar" aria-label="Compartilhar atendimento">
            <IcCompartilhar />
        </button>
    );
}

export function BotaoVisita({ status, onClick }: { status: VisitaStatusBotao; onClick: () => void }) {
    const aria = rotuloVisita(status);
    const off = status === "indisponivel";
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={off}
            aria-label={aria}
            title={off ? "Visita disponível somente durante o velório." : aria}
            className={`${BTN_BASE} ${classeVisita(status)}`}
        >
            <IcOlho />
        </button>
    );
}

/* ---------- Topo da tela Atendimentos: Minhas OS · + Novo registro ----------
   Mesma altura (48 px), texto sempre numa linha só (antes "Novo registro" quebrava em duas no computador).
   Celular: os dois dividem a largura. Computador: largura do conteúdo, lado a lado. */
const BTN_TOPO =
    "inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[14px] px-5 text-[15px] font-extrabold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3D6A99] sm:flex-none";

export function BotoesTopoAtendimentos({ onNovoRegistro, hrefMinhasOS = "/os/minhas" }: { onNovoRegistro: () => void; hrefMinhasOS?: string }) {
    return (
        <div className="flex shrink-0 gap-2.5">
            <a
                href={hrefMinhasOS}
                className={`${BTN_TOPO} border-[1.5px] border-[#313C55] bg-white text-[#313C55] hover:bg-[#EEF2F7] dark:border-white/40 dark:bg-[#232B3F] dark:text-white dark:hover:bg-white/10`}
            >
                <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h6" />
                </svg>
                Minhas OS
            </a>
            <button type="button" onClick={onNovoRegistro} className={`${BTN_TOPO} ${COR_ACAO} shadow-sm`}>
                <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
                    <path d="M5 12h14" /><path d="M12 5v14" />
                </svg>
                Novo registro
            </button>
        </div>
    );
}
