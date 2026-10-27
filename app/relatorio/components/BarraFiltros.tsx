"use client";

/**
 * Filtros do Histórico de sepultamentos (/relatorio).
 *
 * 27/10/2026 (visual novo):
 * - campos de 48 px (fundo #F1F4F8), sem o ícone de calendário duplicado;
 * - atalhos de período (Hoje, 7 dias, Este mês, Mês passado, Este ano) e Limpar;
 * - "Mostrar registros de teste" (nomes com TESTE ficam fora da lista por padrão);
 * - celular: busca + botão Filtros, que abre uma folha de baixo (portal no <body>, Esc fecha).
 * "Análise Geral" passou para o cabeçalho da página (onAbrirAnalise continua aceito).
 */

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconAdjustmentsHorizontal, IconSearch, IconX } from "@tabler/icons-react";

interface Props {
    filtroNome: string;
    filtroDe: string;
    filtroAte: string;
    onChangeNome: (v: string) => void;
    onChangeDe: (v: string) => void;
    onChangeAte: (v: string) => void;
    /** Mantido por compatibilidade: o botão agora fica no cabeçalho da página. */
    onAbrirAnalise?: () => void;

    mostrarTestes?: boolean;
    onMostrarTestes?: (v: boolean) => void;
    qtdTestes?: number;
}

/* ---------- datas (yyyy-mm-dd no horário do aparelho) ---------- */

const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

type Atalho = { id: string; rotulo: string; de: () => string; ate: () => string };

const ATALHOS: Atalho[] = [
    { id: "hoje", rotulo: "Hoje", de: () => iso(new Date()), ate: () => iso(new Date()) },
    {
        id: "7d",
        rotulo: "7 dias",
        de: () => {
            const d = new Date();
            d.setDate(d.getDate() - 6);
            return iso(d);
        },
        ate: () => iso(new Date()),
    },
    {
        id: "mes",
        rotulo: "Este mês",
        de: () => {
            const d = new Date();
            return iso(new Date(d.getFullYear(), d.getMonth(), 1));
        },
        ate: () => iso(new Date()),
    },
    {
        id: "mes-ant",
        rotulo: "Mês passado",
        de: () => {
            const d = new Date();
            return iso(new Date(d.getFullYear(), d.getMonth() - 1, 1));
        },
        ate: () => {
            const d = new Date();
            return iso(new Date(d.getFullYear(), d.getMonth(), 0));
        },
    },
    {
        id: "ano",
        rotulo: "Este ano",
        de: () => iso(new Date(new Date().getFullYear(), 0, 1)),
        ate: () => iso(new Date()),
    },
];

function atalhoAtivo(de: string, ate: string): string | null {
    for (const a of ATALHOS) if (a.de() === de && a.ate() === ate) return a.id;
    return null;
}

/* ---------- peças ---------- */

const ROTULO = "mb-1.5 block text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]";
const CAMPO =
    "h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334] dark:text-white dark:[color-scheme:dark]";

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={ativo}
            className={[
                "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xl border px-3.5 text-[14px] font-bold transition",
                ativo
                    ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                    : "border-[#E3E8F0] bg-white text-[#313C55] hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#C8CFDC]",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function CampoNome({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
    return (
        <div className="relative">
            <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8396]" />
            <input
                type="text"
                value={valor}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Buscar por nome"
                className={`${CAMPO} pl-10 ${valor ? "pr-11" : ""}`}
                autoComplete="off"
                enterKeyHint="search"
                aria-label="Nome do falecido"
            />
            {valor ? (
                <button
                    type="button"
                    onClick={() => onChange("")}
                    aria-label="Limpar nome"
                    className="absolute right-0.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-[#5B6478] hover:bg-[#E3E8F0] dark:text-[#AEB9CF] dark:hover:bg-white/[0.08]"
                >
                    <IconX size={18} />
                </button>
            ) : null}
        </div>
    );
}

function ChaveTestes({ ligado, onChange, qtd }: { ligado: boolean; onChange: (v: boolean) => void; qtd?: number }) {
    return (
        <label className="inline-flex min-h-11 cursor-pointer select-none items-center gap-2.5 text-[14px] font-semibold text-[#5B6478] dark:text-[#AEB9CF]">
            <input type="checkbox" checked={ligado} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[#313C55] dark:accent-[#3D6A99]" />
            Mostrar registros de teste{typeof qtd === "number" && qtd > 0 ? ` (${qtd})` : ""}
        </label>
    );
}

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [ok, setOk] = useState(false);
    useEffect(() => setOk(true), []);
    return ok ? createPortal(children, document.body) : null;
}

/* ---------- barra ---------- */

export default function BarraFiltros({
    filtroNome,
    filtroDe,
    filtroAte,
    onChangeNome,
    onChangeDe,
    onChangeAte,
    mostrarTestes = false,
    onMostrarTestes,
    qtdTestes,
}: Props) {
    const [folhaAberta, setFolhaAberta] = useState(false);
    const [draftDe, setDraftDe] = useState(filtroDe);
    const [draftAte, setDraftAte] = useState(filtroAte);

    const temPeriodo = Boolean(filtroDe || filtroAte);
    const ativo = atalhoAtivo(filtroDe, filtroAte);
    const temAlgo = temPeriodo || Boolean(filtroNome);

    const aplicarAtalho = (a: Atalho) => {
        onChangeDe(a.de());
        onChangeAte(a.ate());
    };

    const limpar = () => {
        onChangeNome("");
        onChangeDe("");
        onChangeAte("");
    };

    // Folha do celular: copia o filtro ao abrir, trava a rolagem do fundo e fecha com Esc.
    useEffect(() => {
        if (!folhaAberta) return;
        setDraftDe(filtroDe);
        setDraftAte(filtroAte);
        const html = document.documentElement;
        const antigo = html.style.overflow;
        html.style.overflow = "hidden";
        const esc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setFolhaAberta(false);
        };
        window.addEventListener("keydown", esc);
        return () => {
            html.style.overflow = antigo;
            window.removeEventListener("keydown", esc);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [folhaAberta]);

    const rotuloPeriodo = ativo
        ? ATALHOS.find((a) => a.id === ativo)?.rotulo
        : temPeriodo
          ? `${filtroDe ? filtroDe.split("-").reverse().join("/") : "…"} a ${filtroAte ? filtroAte.split("-").reverse().join("/") : "…"}`
          : "";

    return (
        <>
            <div className="rounded-2xl border border-[#E3E8F0] bg-white p-3 shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F] sm:p-4 lg:p-5">
                {/* ===== Celular / tablet ===== */}
                <div className="lg:hidden">
                    <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                            <CampoNome valor={filtroNome} onChange={onChangeNome} />
                        </div>
                        <button
                            type="button"
                            onClick={() => setFolhaAberta(true)}
                            aria-label="Abrir filtros"
                            className={[
                                "relative inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-[14px] font-bold transition",
                                temPeriodo
                                    ? "border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]"
                                    : "border-[#C9D1DE] bg-white text-[#313C55] dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white",
                            ].join(" ")}
                        >
                            <IconAdjustmentsHorizontal size={20} />
                            <span className="hidden sm:inline">Filtros</span>
                            {temPeriodo ? <span className="absolute -right-1 -top-1 size-3 rounded-full bg-[#F2CB3F] ring-2 ring-white dark:ring-[#232B3F]" aria-hidden="true" /> : null}
                        </button>
                    </div>
                    {rotuloPeriodo ? (
                        <div className="mt-2 flex items-center gap-2">
                            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#E9EFF6] pl-3 text-[13px] font-bold text-[#313C55] dark:bg-[#3D6A99]/20 dark:text-white">
                                Período: {rotuloPeriodo}
                                <button
                                    type="button"
                                    onClick={() => {
                                        onChangeDe("");
                                        onChangeAte("");
                                    }}
                                    aria-label="Tirar o período"
                                    className="grid size-9 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                                >
                                    <IconX size={15} />
                                </button>
                            </span>
                        </div>
                    ) : null}
                </div>

                {/* ===== Computador ===== */}
                <div className="hidden lg:block">
                    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
                        <div>
                            <span className={ROTULO}>Nome do falecido</span>
                            <CampoNome valor={filtroNome} onChange={onChangeNome} />
                        </div>
                        <label>
                            <span className={ROTULO}>Data inicial</span>
                            <input type="date" value={filtroDe} onChange={(e) => onChangeDe(e.target.value)} className={CAMPO} />
                        </label>
                        <label>
                            <span className={ROTULO}>Data final</span>
                            <input type="date" value={filtroAte} onChange={(e) => onChangeAte(e.target.value)} className={CAMPO} />
                        </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {ATALHOS.map((a) => (
                            <Chip key={a.id} ativo={ativo === a.id} onClick={() => aplicarAtalho(a)}>
                                {a.rotulo}
                            </Chip>
                        ))}
                        {temAlgo ? (
                            <button
                                type="button"
                                onClick={limpar}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[14px] font-bold text-[#5B6478] hover:bg-[#F1F4F8] hover:text-[#313C55] dark:text-[#AEB9CF] dark:hover:bg-white/[0.06] dark:hover:text-white"
                            >
                                <IconX size={16} />
                                Limpar filtros
                            </button>
                        ) : null}
                        {onMostrarTestes ? (
                            <span className="ml-auto">
                                <ChaveTestes ligado={mostrarTestes} onChange={onMostrarTestes} qtd={qtdTestes} />
                            </span>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* ===== Folha de filtros (celular) ===== */}
            {folhaAberta ? (
                <NoCorpo>
                    <div
                        data-pai-overlay
                        className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:hidden"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Filtros do histórico"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) setFolhaAberta(false);
                        }}
                    >
                        <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white">
                            <div className="flex items-center gap-3 border-b border-[#E3E8F0] px-4 py-3 dark:border-white/[0.08]">
                                <h2 className="min-w-0 flex-1 text-[18px] font-extrabold">Filtros</h2>
                                <button
                                    type="button"
                                    onClick={() => setFolhaAberta(false)}
                                    aria-label="Fechar"
                                    className="grid size-11 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]"
                                >
                                    <IconX size={20} />
                                </button>
                            </div>

                            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
                                <div>
                                    <span className={ROTULO}>Período</span>
                                    <div className="flex flex-wrap gap-2">
                                        {ATALHOS.map((a) => (
                                            <Chip
                                                key={a.id}
                                                ativo={atalhoAtivo(draftDe, draftAte) === a.id}
                                                onClick={() => {
                                                    setDraftDe(a.de());
                                                    setDraftAte(a.ate());
                                                }}
                                            >
                                                {a.rotulo}
                                            </Chip>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="min-w-0">
                                        <span className={ROTULO}>Data inicial</span>
                                        <input type="date" value={draftDe} onChange={(e) => setDraftDe(e.target.value)} className={CAMPO} />
                                    </label>
                                    <label className="min-w-0">
                                        <span className={ROTULO}>Data final</span>
                                        <input type="date" value={draftAte} onChange={(e) => setDraftAte(e.target.value)} className={CAMPO} />
                                    </label>
                                </div>
                                {onMostrarTestes ? <ChaveTestes ligado={mostrarTestes} onChange={onMostrarTestes} qtd={qtdTestes} /> : null}
                            </div>

                            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-[#1C2334]">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDraftDe("");
                                        setDraftAte("");
                                        onChangeDe("");
                                        onChangeAte("");
                                        setFolhaAberta(false);
                                    }}
                                    className="min-h-12 rounded-xl border border-[#C9D1DE] bg-white text-[15px] font-bold dark:border-white/[0.2] dark:bg-[#232B3F]"
                                >
                                    Limpar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onChangeDe(draftDe);
                                        onChangeAte(draftAte);
                                        setFolhaAberta(false);
                                    }}
                                    className="min-h-12 rounded-xl bg-[#313C55] text-[15px] font-extrabold text-white dark:bg-[#F2CB3F] dark:text-[#313C55]"
                                >
                                    Aplicar
                                </button>
                            </div>
                        </div>
                    </div>
                </NoCorpo>
            ) : null}
        </>
    );
}
