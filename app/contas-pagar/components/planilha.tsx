'use client';

/**
 * Planilha do financeiro (Contas a pagar e Contas a receber) — 12/11/2026.
 * Grade com rolagem para o lado, coluna da pessoa e coluna de ações fixas, cabeçalho e rodapé (total do filtro) fixos,
 * colunas escolhidas por quem usa (guardadas no aparelho), seleção para baixa em massa, paginação e exportar (CSV para o Excel).
 */
import React, { useEffect, useState } from 'react';
import { IconCheck, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { BTN_PEQ, BTN_PRI, BTN_SEC, Janela, SUB } from './fin';

export type ColunaPlan<T> = {
    id: string;
    rotulo: string;
    largura: number;
    num?: boolean;
    /** false = começa escondida */
    padrao?: boolean;
    valor: (r: T) => React.ReactNode;
    /** texto para o CSV (se não tiver, usa o valor quando for texto ou número) */
    texto?: (r: T) => string | number | null | undefined;
};

/** Colunas visíveis guardadas no aparelho (cada tela com a sua chave). */
export function useColunas<T>(chave: string, colunas: ColunaPlan<T>[]) {
    const padrao = () => Object.fromEntries(colunas.map((c) => [c.id, c.padrao !== false])) as Record<string, boolean>;
    const [vis, setVis] = useState<Record<string, boolean>>(padrao);
    useEffect(() => {
        try {
            const s = window.localStorage.getItem(chave);
            if (s) setVis({ ...padrao(), ...JSON.parse(s) });
        } catch {
            /* sem armazenamento: fica o padrão */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chave]);
    const gravar = (v: Record<string, boolean>) => {
        setVis(v);
        try {
            window.localStorage.setItem(chave, JSON.stringify(v));
        } catch {
            /* segue */
        }
    };
    return { vis, setVis: gravar, voltarPadrao: () => gravar(padrao()) };
}

const CEL = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-2.5 py-2';
const CEL_CAB = 'min-w-0 break-words px-2.5 py-2 leading-tight';
const FUNDO = 'bg-white dark:bg-[#232B3F]';
const FUNDO_CAB = 'bg-[#F1F4F8] dark:bg-[#1C2334]';
const FUNDO_SEL = 'bg-[#F2F6FB] dark:bg-[#2A3550]';

export function CaixaMarcar({ on, onClick, rotulo, desabilitado }: { on: boolean; onClick: () => void; rotulo: string; desabilitado?: boolean }) {
    return (
        <button
            type="button"
            aria-label={rotulo}
            aria-pressed={on}
            disabled={desabilitado}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className="grid size-9 place-items-center rounded-lg disabled:opacity-30"
        >
            <span
                className={`grid size-[22px] place-items-center rounded-md border-2 ${
                    on ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]' : 'border-[#9AA6BC] bg-white dark:bg-transparent'
                }`}
            >
                {on ? <IconCheck size={15} stroke={3} /> : null}
            </span>
        </button>
    );
}

export function Planilha<T extends { id: number }>({
    colunas,
    vis,
    linhas,
    fixa,
    acoes,
    larguraAcoes = 170,
    selecionavel,
    marcados,
    onMarcar,
    rodape,
    onLinha,
    vazio = 'Nenhum título neste filtro.',
    carregando,
}: {
    colunas: ColunaPlan<T>[];
    vis: Record<string, boolean>;
    linhas: T[];
    fixa: { rotulo: string; largura?: number; valor: (r: T) => React.ReactNode };
    acoes: (r: T) => React.ReactNode;
    larguraAcoes?: number;
    selecionavel?: (r: T) => boolean;
    marcados?: Set<number>;
    onMarcar?: (ids: number[], on: boolean) => void;
    rodape?: { rotulo: string; valores: Record<string, string> };
    onLinha?: (r: T) => void;
    vazio?: string;
    carregando?: boolean;
}) {
    const cols = colunas.filter((c) => vis[c.id]);
    const lf = fixa.largura ?? 260;
    const grade = `44px ${lf}px ${cols.map((c) => `${c.largura}px`).join(' ')} ${larguraAcoes}px`;
    const minimo = 44 + lf + larguraAcoes + cols.reduce((s, c) => s + c.largura, 0);
    const sel = selecionavel && marcados && onMarcar;
    const daPagina = sel ? linhas.filter((r) => selecionavel!(r)) : [];
    const todosPag = !!sel && daPagina.length > 0 && daPagina.every((r) => marcados!.has(r.id));
    const linhaCls = 'grid items-center border-t border-[#E3E8F0] text-[14px] dark:border-white/[0.08]';
    const estilo = { gridTemplateColumns: grade, minWidth: minimo };

    return (
        <div className="max-h-[70vh] overflow-auto rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]">
            <div className={`${linhaCls} sticky top-0 z-[3] border-t-0 text-[11px] font-extrabold uppercase tracking-[0.03em] text-[#5B6478] dark:text-[#AEB9CF]`} style={estilo}>
                <span className={`sticky left-0 z-[4] grid h-full place-items-center ${FUNDO_CAB}`}>
                    {sel ? <CaixaMarcar on={todosPag} rotulo="Marcar a página" desabilitado={!daPagina.length} onClick={() => onMarcar!(daPagina.map((r) => r.id), !todosPag)} /> : null}
                </span>
                <span className={`${CEL_CAB} sticky left-[44px] z-[4] flex h-full items-center py-3 shadow-[1px_0_0_#E3E8F0] dark:shadow-[1px_0_0_rgba(255,255,255,0.08)] ${FUNDO_CAB}`}>{fixa.rotulo}</span>
                {cols.map((c) => (
                    <span key={c.id} className={`${CEL_CAB} flex h-full items-center py-3 ${FUNDO_CAB} ${c.num ? 'justify-end text-right' : ''}`}>
                        {c.rotulo}
                    </span>
                ))}
                <span className={`${CEL_CAB} sticky right-0 z-[4] flex h-full items-center justify-end py-3 shadow-[-1px_0_0_#E3E8F0] dark:shadow-[-1px_0_0_rgba(255,255,255,0.08)] ${FUNDO_CAB}`}>Ações</span>
            </div>

            {carregando && !linhas.length ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Carregando…</div> : null}
            {!carregando && !linhas.length ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">{vazio}</div> : null}

            {linhas.map((r) => {
                const on = !!marcados?.has(r.id);
                const fundo = on ? FUNDO_SEL : FUNDO;
                return (
                    <div
                        key={r.id}
                        className={`${linhaCls} ${onLinha ? 'cursor-pointer' : ''} group`}
                        style={estilo}
                        onClick={onLinha ? () => onLinha(r) : undefined}
                    >
                        <span className={`sticky left-0 z-[1] grid h-full place-items-center ${fundo}`}>
                            {sel && selecionavel!(r) ? <CaixaMarcar on={on} rotulo="Marcar" onClick={() => onMarcar!([r.id], !on)} /> : null}
                        </span>
                        <span className={`${CEL} sticky left-[44px] z-[1] flex h-full flex-col justify-center whitespace-normal leading-tight shadow-[1px_0_0_#E3E8F0] dark:shadow-[1px_0_0_rgba(255,255,255,0.08)] ${fundo}`}>
                            {fixa.valor(r)}
                        </span>
                        {cols.map((c) => (
                            <span key={c.id} className={`${CEL} ${fundo} h-full flex items-center ${c.num ? 'justify-end tabular-nums' : ''}`}>
                                {c.valor(r)}
                            </span>
                        ))}
                        <span
                            className={`sticky right-0 z-[1] flex h-full items-center justify-end gap-1.5 px-2 shadow-[-1px_0_0_#E3E8F0] dark:shadow-[-1px_0_0_rgba(255,255,255,0.08)] ${fundo}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {acoes(r)}
                        </span>
                    </div>
                );
            })}

            {rodape && linhas.length ? (
                <div className={`${linhaCls} sticky bottom-0 z-[3] border-t-2 border-[#C9D1DE] font-extrabold`} style={estilo}>
                    <span className={`sticky left-0 z-[4] h-full ${FUNDO_CAB}`} />
                    <span className={`${CEL} sticky left-[44px] z-[4] flex h-full items-center whitespace-normal py-3 ${FUNDO_CAB}`}>{rodape.rotulo}</span>
                    {cols.map((c) => (
                        <span key={c.id} className={`${CEL} flex h-full items-center py-3 ${FUNDO_CAB} ${c.num ? 'justify-end tabular-nums' : ''}`}>
                            {rodape.valores[c.id] ?? ''}
                        </span>
                    ))}
                    <span className={`sticky right-0 z-[4] h-full ${FUNDO_CAB}`} />
                </div>
            ) : null}
        </div>
    );
}

export function Paginacao({ pagina, pp, total, onPagina, onPp }: { pagina: number; pp: number; total: number; onPagina: (p: number) => void; onPp: (pp: number) => void }) {
    const paginas = Math.max(1, Math.ceil(total / pp));
    const ini = total ? pagina * pp + 1 : 0;
    const fim = Math.min(total, (pagina + 1) * pp);
    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            <span className={`${SUB} font-bold`}>{total ? `Mostrando ${ini}–${fim} de ${total.toLocaleString('pt-BR')}` : ''}</span>
            <select className="h-11 rounded-xl bg-white px-3 text-[15px] dark:bg-[#232B3F]" value={pp} onChange={(e) => onPp(Number(e.target.value))} aria-label="Linhas por página">
                {[50, 100, 200, 500].map((n) => (
                    <option key={n} value={n}>
                        {n} por página
                    </option>
                ))}
            </select>
            <button type="button" className={BTN_PEQ} disabled={pagina <= 0} onClick={() => onPagina(pagina - 1)} aria-label="Página anterior">
                <IconChevronLeft size={18} /> Anterior
            </button>
            <button type="button" className={BTN_PEQ} disabled={pagina >= paginas - 1} onClick={() => onPagina(pagina + 1)} aria-label="Próxima página">
                Próxima <IconChevronRight size={18} />
            </button>
        </div>
    );
}

export function JanelaColunas<T>({
    colunas,
    vis,
    onMudar,
    onPadrao,
    onFechar,
    fixas,
}: {
    colunas: ColunaPlan<T>[];
    vis: Record<string, boolean>;
    onMudar: (v: Record<string, boolean>) => void;
    onPadrao: () => void;
    onFechar: () => void;
    fixas: string;
}) {
    return (
        <Janela
            titulo="Colunas da planilha"
            sub={`${fixas} ficam sempre. A escolha fica guardada neste aparelho.`}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onPadrao}>
                        Voltar ao padrão
                    </button>
                    <button type="button" className={BTN_PRI} onClick={onFechar}>
                        Pronto
                    </button>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {colunas.map((c) => (
                    <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-1 rounded-xl px-1 hover:bg-[#F6F8FB] dark:hover:bg-white/[0.04]">
                        <CaixaMarcar on={!!vis[c.id]} rotulo={c.rotulo} onClick={() => onMudar({ ...vis, [c.id]: !vis[c.id] })} />
                        <span className="text-[14.5px] font-bold">{c.rotulo}</span>
                    </label>
                ))}
            </div>
        </Janela>
    );
}

/** Baixa um CSV (separado por ponto e vírgula, com BOM) que o Excel abre direto. */
export function baixarCsv<T>(nome: string, fixa: { rotulo: string; texto: (r: T) => string }, colunas: ColunaPlan<T>[], vis: Record<string, boolean>, linhas: T[]) {
    const cols = colunas.filter((c) => vis[c.id]);
    const esc = (v: unknown) => {
        const s = v === null || v === undefined ? '' : typeof v === 'number' ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
        return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const txt = (c: ColunaPlan<T>, r: T) => {
        if (c.texto) return c.texto(r);
        const v = c.valor(r);
        return typeof v === 'string' || typeof v === 'number' ? v : '';
    };
    const linhasCsv = [[fixa.rotulo, ...cols.map((c) => c.rotulo)].map(esc).join(';'), ...linhas.map((r) => [fixa.texto(r), ...cols.map((c) => txt(c, r))].map(esc).join(';'))];
    const blob = new Blob(['﻿' + linhasCsv.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Botão Lista | Planilha. */
export function TrocaModo({ modo, onModo }: { modo: 'lista' | 'planilha'; onModo: (m: 'lista' | 'planilha') => void }) {
    const b = (m: 'lista' | 'planilha', r: string) => (
        <button
            type="button"
            onClick={() => onModo(m)}
            aria-pressed={modo === m}
            className={`h-11 px-4 text-[14px] font-extrabold ${modo === m ? 'bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]' : 'bg-white text-[#5B6478] dark:bg-[#232B3F] dark:text-[#AEB9CF]'}`}
        >
            {r}
        </button>
    );
    return (
        <span className="inline-flex shrink-0 overflow-hidden rounded-xl border border-[#C9D1DE] dark:border-white/[0.2]">
            {b('lista', 'Lista')}
            {b('planilha', 'Planilha')}
        </span>
    );
}

/** Chips dos filtros avançados ativos. */
export function ChipsFiltro({ chips, onLimpar }: { chips: { rotulo: string; tirar: () => void }[]; onLimpar: () => void }) {
    if (!chips.length) return null;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className={`${SUB} font-extrabold`}>Filtros:</span>
            {chips.map((c, i) => (
                <span key={i} className="inline-flex h-9 items-center gap-1 rounded-full bg-[#E9EFF6] pl-3 pr-1 text-[13px] font-extrabold text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]">
                    {c.rotulo}
                    <button type="button" onClick={c.tirar} aria-label={`Tirar ${c.rotulo}`} className="grid size-7 place-items-center rounded-full hover:bg-white/60">
                        ×
                    </button>
                </span>
            ))}
            <button type="button" className="text-[13.5px] font-extrabold text-[#2E5277] underline dark:text-[#C9D8EA]" onClick={onLimpar}>
                Limpar filtros
            </button>
        </div>
    );
}

/** Barra fixa da seleção em massa. */
export function BarraMassa({ children }: { children: React.ReactNode }) {
    return (
        <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[20] flex flex-wrap items-center gap-2.5 rounded-2xl bg-[#313C55] px-4 py-3 text-white shadow-xl lg:bottom-4 dark:bg-[#3D6A99]">
            {children}
        </div>
    );
}
