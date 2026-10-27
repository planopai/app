"use client";

/**
 * Associados — peças de tela no padrão do app (27/10/2026).
 * Janela: diálogo no computador, folha de baixo no celular, portal no <body>, Esc fecha.
 * Avisos: substituem o alert() (avisar("ok" | "warn" | "err", texto)).
 */

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconAlertTriangle, IconBrandWhatsapp, IconCheck, IconInfoCircle, IconX } from "@tabler/icons-react";
import { grupoSituacao } from "./logica";

/* ---------------- estilos ---------------- */

export const CAMPO =
    "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:ring-2 focus:ring-[#3D6A99]/30 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white";
export const ROTULO = "mb-1.5 block text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]";
export const BTN_SEC =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3.5 text-[14px] font-extrabold text-[#313C55] transition hover:border-[#313C55] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white";
export const BTN_PRI =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#313C55] px-4 text-[14px] font-extrabold text-white transition hover:bg-[#232B40] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]";
export const CARTAO = "rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]";
export const SUAVE = "text-[#5B6478] dark:text-[#AEB9CF]";

/* ---------------- portal ---------------- */

export function NoCorpo({ children }: { children: React.ReactNode }) {
    const [ok, setOk] = useState(false);
    useEffect(() => setOk(true), []);
    return ok ? createPortal(children, document.body) : null;
}

/* ---------------- janela ---------------- */

const pilhaJanelas: number[] = [];
let idJanela = 0;

export function Janela({
    aberta,
    onFechar,
    titulo,
    subtitulo,
    topo,
    rodape,
    largura = "max-w-lg",
    z = "z-[70]",
    children,
}: {
    aberta: boolean;
    onFechar: () => void;
    titulo: React.ReactNode;
    subtitulo?: React.ReactNode;
    /** Algo à esquerda do título (ex.: iniciais). */
    topo?: React.ReactNode;
    rodape?: React.ReactNode;
    largura?: string;
    z?: string;
    children: React.ReactNode;
}) {
    const fecharRef = React.useRef(onFechar);
    fecharRef.current = onFechar;

    useEffect(() => {
        if (!aberta) return;
        // Pilha de janelas: o Esc fecha só a de cima (ex.: Acesso aberto por cima do Detalhe).
        const id = ++idJanela;
        pilhaJanelas.push(id);
        const html = document.documentElement;
        const antes = html.style.overflow;
        html.style.overflow = "hidden";
        const esc = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || pilhaJanelas[pilhaJanelas.length - 1] !== id) return;
            e.stopImmediatePropagation();
            fecharRef.current();
        };
        window.addEventListener("keydown", esc, true);
        return () => {
            const i = pilhaJanelas.indexOf(id);
            if (i >= 0) pilhaJanelas.splice(i, 1);
            if (!pilhaJanelas.length) html.style.overflow = antes;
            window.removeEventListener("keydown", esc, true);
        };
    }, [aberta]);

    if (!aberta) return null;
    return (
        <NoCorpo>
            <div
                data-pai-overlay
                role="dialog"
                aria-modal="true"
                className={`fixed inset-0 ${z} flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6`}
                onClick={(e) => {
                    if (e.target === e.currentTarget) onFechar();
                }}
            >
                <div className={`flex max-h-[92dvh] w-full ${largura} flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white lg:max-h-[88dvh] lg:rounded-2xl`}>
                    <div className="flex items-center gap-3 border-b border-[#E3E8F0] px-5 py-3.5 dark:border-white/[0.08]">
                        {topo}
                        <div className="min-w-0 flex-1">
                            <h2 className="truncate text-[18px] font-extrabold leading-tight">{titulo}</h2>
                            {subtitulo ? <div className={`mt-0.5 text-[13px] ${SUAVE}`}>{subtitulo}</div> : null}
                        </div>
                        <button type="button" onClick={onFechar} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]">
                            <IconX size={20} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
                    {rodape ? (
                        <div className="flex shrink-0 justify-end gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-[#1C2334]">
                            {rodape}
                        </div>
                    ) : null}
                </div>
            </div>
        </NoCorpo>
    );
}

/* ---------------- avisos (no lugar do alert) ---------------- */

type TipoAviso = "ok" | "warn" | "err";
type ItemAviso = { id: number; tipo: TipoAviso; texto: string };
const EVENTO = "pai:associados-aviso";
let seq = 0;

export function avisar(tipo: TipoAviso, texto: string) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: { id: ++seq, tipo, texto } }));
}

export function Avisos() {
    const [itens, setItens] = useState<ItemAviso[]>([]);
    useEffect(() => {
        const on = (e: Event) => {
            const it = (e as CustomEvent<ItemAviso>).detail;
            setItens((a) => [...a.slice(-2), it]);
            window.setTimeout(() => setItens((a) => a.filter((x) => x.id !== it.id)), it.tipo === "err" ? 6000 : 3500);
        };
        window.addEventListener(EVENTO, on);
        return () => window.removeEventListener(EVENTO, on);
    }, []);
    if (!itens.length) return null;
    return (
        <NoCorpo>
            <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-6">
                {itens.map((a) => {
                    const cor =
                        a.tipo === "ok"
                            ? "border-[#7BA11A]/50 bg-[#EEF5D6] text-[#3F5A0A] dark:border-[#B3CE52]/40 dark:bg-[#26301A] dark:text-[#CFE38A]"
                            : a.tipo === "warn"
                              ? "border-[#E4BC30] bg-[#FCF3CC] text-[#5F4800] dark:border-[#F2CB3F]/50 dark:bg-[#3A3215] dark:text-[#F2CB3F]"
                              : "border-[#F3B8B2] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#3A1F1D] dark:text-[#FF9C92]";
                    const Ico = a.tipo === "ok" ? IconCheck : a.tipo === "warn" ? IconInfoCircle : IconAlertTriangle;
                    return (
                        <div key={a.id} role="status" className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-[14px] font-semibold shadow-lg ${cor}`}>
                            <Ico size={18} className="mt-0.5 shrink-0" />
                            <span>{a.texto}</span>
                        </div>
                    );
                })}
            </div>
        </NoCorpo>
    );
}

export async function copiar(texto: string, rotulo = "Copiado.") {
    try {
        await navigator.clipboard.writeText(texto);
        avisar("ok", rotulo);
    } catch {
        avisar("err", "Não foi possível copiar.");
    }
}

/* ---------------- selos ---------------- */

const COR_SITUACAO: Record<string, string> = {
    ativo: "border-[#7BA11A]/60 bg-[#EEF5D6] text-[#3F5A0A] dark:border-[#B3CE52]/40 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]",
    inadimplente: "border-[#E4BC30] bg-[#FCF3CC] text-[#6B5200] dark:border-[#F2CB3F]/50 dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]",
    bloqueado: "border-[#F3B8B2] bg-[#FDECEA] text-[#B42318] dark:border-[#FF9C92]/40 dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]",
    cancelado: "border-[#D5DAE3] bg-[#F1F4F8] text-[#5B6478] dark:border-white/[0.14] dark:bg-white/[0.06] dark:text-[#AEB9CF]",
    outro: "border-[#C9D6E6] bg-[#E9EFF6] text-[#313C55] dark:border-[#3D6A99]/50 dark:bg-[#3D6A99]/20 dark:text-[#DDE3EE]",
};

export function corSituacao(s?: string) {
    return COR_SITUACAO[grupoSituacao(s)];
}

export function SeloSituacao({ situacao }: { situacao?: string }) {
    const t = String(situacao ?? "").trim();
    if (!t) return null;
    return <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[12px] font-extrabold uppercase tracking-wide ${corSituacao(t)}`}>{t}</span>;
}

export function SeloAcesso({ tem, curto }: { tem: boolean; curto?: boolean }) {
    return tem ? (
        <span className="inline-flex items-center gap-1 rounded-lg bg-[#E9EFF6] px-2 py-0.5 text-[12px] font-bold text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]">
            <IconCheck size={13} />
            {curto ? "App" : "Usa o app"}
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#C9D1DE] px-2 py-0.5 text-[12px] font-bold text-[#7A8396] dark:border-white/[0.2] dark:text-[#98A1B3]">
            {curto ? "Sem app" : "Sem acesso ao app"}
        </span>
    );
}

export function Chip({ ativo, onClick, children, title }: { ativo: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={ativo}
            title={title}
            className={[
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 text-[14px] font-bold transition",
                ativo
                    ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                    : "border-[#E3E8F0] bg-white text-[#313C55] hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#C8CFDC]",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

export function BotaoWhats({ numero, nome, pequeno }: { numero: string | null; nome: string; pequeno?: boolean }) {
    if (!numero) return null;
    return (
        <a
            href={`https://wa.me/${numero}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Abrir conversa com ${nome} no WhatsApp`}
            aria-label={`Abrir conversa com ${nome} no WhatsApp`}
            onClick={(e) => e.stopPropagation()}
            className={`grid ${pequeno ? "size-10" : "size-11"} shrink-0 place-items-center rounded-xl border border-[#B3CE52] bg-[#EEF5D6] text-[#3F5A0A] transition hover:bg-[#E3EEC2] dark:border-[#B3CE52]/50 dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]`}
        >
            <IconBrandWhatsapp size={20} stroke={1.8} />
        </a>
    );
}

export function iniciais(nome: string) {
    const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    return ((p[0][0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ nome, situacao, tamanho = "size-10" }: { nome: string; situacao?: string; tamanho?: string }) {
    return (
        <span className={`grid ${tamanho} shrink-0 place-items-center rounded-full border text-[14px] font-extrabold ${corSituacao(situacao)}`}>{iniciais(nome)}</span>
    );
}

/** "Fulano De Tal" para nomes que vêm todos em maiúsculas (só exibição). */
export function nomeBonito(s: unknown) {
    const t = String(s ?? "").trim();
    if (!t) return "—";
    const minus = new Set(["da", "de", "do", "das", "dos", "e"]);
    return t
        .toLowerCase()
        .split(/\s+/)
        .map((p, i) => (i > 0 && minus.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join(" ");
}
