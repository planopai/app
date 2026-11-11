'use client';

/**
 * Painel da folha (/folha-painel) — Gestão · Folha de pagamento — 10/11/2026.
 *
 * Custo da folha nos últimos 12 meses (até o mês escolhido), só com o que já está fechado:
 * folhas conferidas (mensal, férias e 13º) e comissões liberadas. Custo = salário bruto do Domínio + extra, bônus e ajustes
 * + comissões e viagens + férias e 13º (bruto + complemento) + FGTS. Vales e empréstimos são adiantamentos: não somam ao custo.
 * Também: custo por equipe e por pessoa, folha × faturamento particular (OS particulares e diferenças, sem translado)
 * e os vales e empréstimos em aberto.
 * Back-end: rh_painel.php (novo, só leitura). Só a Gestão acessa.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconChartBar, IconChevronLeft, IconChevronRight, IconRefresh, IconX } from '@tabler/icons-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BOTAO_PAGINA, BOTAO_PAGINA_PRI, BOTAO_PAGINA_SEC, CartaoInfo, GRADE_CARTOES, ROTULO_SECAO, TopoPagina } from '@/components/shell/ModuloHub';

type Mes = {
    competencia: string;
    fechado: boolean;
    salarios: number;
    extras: number;
    comissoes: number;
    ferias_13: number;
    fgts: number;
    total: number;
    faturamento: number | null;
    pessoas: number;
};
type Equipe = { equipe: string; pessoas: number; mes: number; ano: number };
type Pessoa = { colaborador_id: number; nome: string; equipe: string | null; salarios: number; extras: number; comissoes: number; ferias_13: number; total_mes: number; total_ano: number };
type Vale = { colaborador_id: number; nome: string; qtd: number; valor: number; mais_antigo: string };
type Emprestimo = { colaborador_id: number; nome: string; saldo: number; parcelas: number; valor_parcela: number };
type Dados = { ate: string; meses: Mes[]; equipes: Equipe[]; pessoas: Pessoa[]; vales: Vale[]; emprestimos: Emprestimo[]; saldos_negativos: { nome: string; valor: number }[]; avisos: string[] };

const URL_API = 'https://api.planoassistencialintegrado.com.br/rh_painel.php';
const SERIES: { k: keyof Mes; nome: string; claro: string; escuro: string }[] = [
    { k: 'salarios', nome: 'Salários (bruto Domínio)', claro: '#2a78d6', escuro: '#3987e5' },
    { k: 'extras', nome: 'Extra, bônus e ajustes', claro: '#1baf7a', escuro: '#199e70' },
    { k: 'comissoes', nome: 'Comissões e viagens', claro: '#eda100', escuro: '#c98500' },
    { k: 'ferias_13', nome: 'Férias e 13º', claro: '#6250d6', escuro: '#9085e9' },
    { k: 'fgts', nome: 'FGTS', claro: '#e87ba4', escuro: '#d55181' },
];

/* ============================== API ============================== */

class SessaoExpirada extends Error {}

async function api(url: string, acao: string, corpo?: Record<string, unknown>, extra = '') {
    const r = await fetch(`${url}?action=${acao}${extra}${corpo ? '' : `&_=${Date.now()}`}`, {
        cache: 'no-store',
        credentials: 'include',
        ...(corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {}),
    });
    if (r.status === 401) throw new SessaoExpirada('Sessão expirada.');
    const txt = (await r.text()).replace(/^﻿/, '').trim();
    let json: any = null;
    try {
        json = JSON.parse(txt);
    } catch {
        /* segue */
    }
    if (json?.need_login) throw new SessaoExpirada('Sessão expirada.');
    if (json == null) throw new Error('O servidor não respondeu como esperado. Tente de novo.');
    if (json.erro) throw new Error(json.msg || 'Não foi possível concluir. Tente de novo.');
    return json;
}

/* ============================== utilidades ============================== */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesBR = (ym: string) => {
    const [a, m] = ym.split('-');
    const n = MESES[Number(m) - 1] || '';
    return `${n.charAt(0).toUpperCase()}${n.slice(1)} de ${a}`;
};
const mesMais = (ym: string, n: number) => {
    const [a, m] = ym.split('-').map(Number);
    const t = a * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dataBR = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const brl = (v?: number | string | null) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pctBR = (v?: number | null, casas = 1) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`);
function paraNumero(s: string): number | null {
    let t = String(s ?? '').replace(/R\$|%|\s/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
}

/* ============================== estilos ============================== */

const CAMPO =
    'h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:ring-2 focus:ring-[#3D6A99]/30 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white';
const ROTULO = 'mb-1.5 block text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]';
const BTN_SEC = `${BOTAO_PAGINA} ${BOTAO_PAGINA_SEC} disabled:opacity-40`;
const BTN_PRI = `${BOTAO_PAGINA} ${BOTAO_PAGINA_PRI} disabled:opacity-40`;
const BTN_PEQ =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#C9D1DE] bg-white px-3 text-[13.5px] font-extrabold text-[#313C55] hover:border-[#313C55] disabled:opacity-40 dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white';
const CARTAO = 'rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]';
const SELO = 'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[12px] font-bold';
const NOTA = 'flex items-start gap-2 rounded-xl bg-[#F6F8FB] px-3.5 py-3 text-[14px] leading-snug text-[#313C55] dark:bg-[#1C2334] dark:text-[#DDE3EE]';
const ERRO = 'rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]';
const S_OK = 'bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]';
const S_AB = 'bg-[#E9EFF6] text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]';
const S_MUDO = 'bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]';
const S_AVISO = 'bg-[#FCF3CC] text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]';
const S_RUIM = 'bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]';
const SUB = 'text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]';

/* ============================== peças ============================== */

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [ok, setOk] = useState(false);
    useEffect(() => {
        setOk(true);
    }, []);
    return ok ? createPortal(children, document.body) : null;
}

function Janela({ titulo, sub, onFechar, rodape, children, largura = 'max-w-2xl' }: { titulo: string; sub?: React.ReactNode; onFechar: () => void; rodape?: React.ReactNode; children: React.ReactNode; largura?: string }) {
    useEffect(() => {
        const k = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onFechar();
        };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [onFechar]);
    return (
        <NoCorpo>
            <div
                data-pai-overlay
                role="dialog"
                aria-modal="true"
                aria-label={titulo}
                className="fixed inset-0 z-[70] flex items-end justify-center bg-[#313C55]/45 lg:items-center lg:p-6"
                onClick={(e) => {
                    if (e.target === e.currentTarget) onFechar();
                }}
            >
                <div className={`flex max-h-[90dvh] w-full ${largura} flex-col overflow-hidden rounded-t-3xl bg-white text-[#313C55] shadow-2xl dark:bg-[#232B3F] dark:text-white lg:rounded-2xl`}>
                    <div className="flex items-center gap-3 border-b border-[#E3E8F0] px-5 py-3.5 dark:border-white/[0.08]">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[18px] font-extrabold leading-tight">{titulo}</h2>
                            {sub ? <div className="mt-0.5 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{sub}</div> : null}
                        </div>
                        <button type="button" onClick={onFechar} aria-label="Fechar" className="grid size-11 place-items-center rounded-xl hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]">
                            <IconX size={20} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [&>*]:shrink-0">{children}</div>
                    {rodape ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3 dark:border-white/[0.08] dark:bg-[#1C2334] [&>*]:flex-1 lg:[&>*]:flex-none">{rodape}</div> : null}
                </div>
            </div>
        </NoCorpo>
    );
}

function Campo({ rotulo, children, className = '', ajuda }: { rotulo: string; children: React.ReactNode; className?: string; ajuda?: string }) {
    return (
        <label className={`block ${className}`}>
            <span className={ROTULO}>{rotulo}</span>
            {children}
            {ajuda ? <span className="mt-1 block text-[12.5px] leading-snug text-[#5B6478] dark:text-[#AEB9CF]">{ajuda}</span> : null}
        </label>
    );
}

/** Navegação do mês. */
function Mes({ comp, setComp, children, onAtualizar }: { comp: string; setComp: (c: string) => void; children?: React.ReactNode; onAtualizar: () => void }) {
    return (
        <div className="mb-4 flex flex-wrap items-center gap-2">
            <button type="button" className={`${BTN_PEQ} size-11 px-0`} aria-label="Mês anterior" onClick={() => setComp(mesMais(comp, -1))}>
                <IconChevronLeft size={20} />
            </button>
            <div className="min-w-[170px] text-center text-[17px] font-extrabold">{mesBR(comp)}</div>
            <button type="button" className={`${BTN_PEQ} size-11 px-0`} aria-label="Mês seguinte" onClick={() => setComp(mesMais(comp, 1))}>
                <IconChevronRight size={20} />
            </button>
            {children}
            <button type="button" className={`${BTN_PEQ} ml-auto size-11 px-0`} aria-label="Atualizar" onClick={onAtualizar}>
                <IconRefresh size={18} />
            </button>
        </div>
    );
}


const mesCurto = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1].slice(0, 3)}/${ym.slice(2, 4)}`;
const kBRL = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : String(Math.round(v)));
const V = (t: string) => <span className="text-[21px] sm:text-[28px] lg:text-[32px]">{t}</span>;
const pct = (a: number, b: number | null) => (b ? `${((a / b) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—');

function useEscuro() {
    const [e, setE] = useState(false);
    useEffect(() => {
        const ver = () => setE(document.documentElement.classList.contains('dark'));
        ver();
        const o = new MutationObserver(ver);
        o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => o.disconnect();
    }, []);
    return e;
}

function Dica({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const m: Mes = payload[0].payload;
    return (
        <div className="min-w-[220px] rounded-xl border border-[#E3E8F0] bg-white px-3 py-2.5 text-[12.5px] text-[#313C55] shadow-lg dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-white">
            <b className="mb-1 block text-[13.5px]">{mesBR(label)}</b>
            {[...SERIES].reverse().map((s) => (
                <div key={s.k} className="flex items-center gap-2 py-0.5">
                    <span className="size-2.5 rounded-sm" style={{ background: payload.find((p: any) => p.dataKey === s.k)?.color }} />
                    <span className="flex-1">{s.nome}</span>
                    <span className="tabular-nums">{brl(m[s.k] as number)}</span>
                </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-[#E3E8F0] pt-1 font-extrabold dark:border-white/[0.12]">
                <span>Total</span>
                <span className="tabular-nums">{brl(m.total)}</span>
            </div>
            {m.faturamento ? <div className="text-[#5B6478] dark:text-[#AEB9CF]">{pct(m.total, m.faturamento)} do faturamento particular</div> : null}
            {!m.fechado ? <div className="mt-1 font-bold text-[#7A5D00] dark:text-[#F2CB3F]">Folha ainda não conferida</div> : null}
        </div>
    );
}

export default function PainelFolhaPage() {
    const [ate, setAte] = useState<string>(() => mesMais(hojeISO().slice(0, 7), -1));
    const [d, setD] = useState<Dados | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [aba, setAba] = useState<'pessoas' | 'equipes' | 'faturamento' | 'vales'>('pessoas');
    const [verTabela, setVerTabela] = useState(false);
    const [ordem, setOrdem] = useState<'total_mes' | 'total_ano' | 'nome'>('total_mes');
    const escuro = useEscuro();

    const carregar = useCallback(async (c: string) => {
        setCarregando(true);
        setErro(null);
        try {
            const j = await api(URL_API, 'painel', undefined, `&ate=${c}`);
            setD(j.dados);
        } catch (e: any) {
            if (e instanceof SessaoExpirada) {
                window.location.href = '/login';
                return;
            }
            setErro(e?.message || 'Não foi possível carregar o painel.');
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => {
        void carregar(ate);
    }, [carregar, ate]);

    const atual = d?.meses.find((m) => m.competencia === ate) || null;
    const anterior = d?.meses.find((m) => m.competencia === mesMais(ate, -1)) || null;
    const ano = useMemo(() => (d ? d.meses.filter((m) => m.competencia.slice(0, 4) === ate.slice(0, 4)).reduce((s, m) => s + m.total, 0) : 0), [d, ate]);
    const fat12 = useMemo(() => (d ? d.meses.reduce((s, m) => s + (m.faturamento || 0), 0) : 0), [d]);
    const custo12 = useMemo(() => (d ? d.meses.filter((m) => m.faturamento).reduce((s, m) => s + m.total, 0) : 0), [d]);
    const pessoas = useMemo(() => {
        const l = [...(d?.pessoas || [])];
        l.sort((a, b) => (ordem === 'nome' ? a.nome.localeCompare(b.nome, 'pt-BR') : b[ordem] - a[ordem]));
        return l;
    }, [d, ordem]);
    const totalVales = (d?.vales || []).reduce((s, v) => s + v.valor, 0);
    const totalEmp = (d?.emprestimos || []).reduce((s, v) => s + v.saldo, 0);
    const variacao = atual && anterior && anterior.total ? ((atual.total - anterior.total) / anterior.total) * 100 : null;
    const cor = (s: (typeof SERIES)[number]) => (escuro ? s.escuro : s.claro);
    const eixo = escuro ? '#AEB9CF' : '#5B6478';
    const grade = escuro ? 'rgba(255,255,255,0.08)' : '#E3E8F0';

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <div className="mb-5">
                    <TopoPagina Icone={IconChartBar} titulo="Painel da folha" />
                </div>

                <Mes comp={ate} setComp={setAte} onAtualizar={() => void carregar(ate)}>
                    <span className={SUB}>12 meses até este</span>
                </Mes>

                {erro ? <div className={`${ERRO} mb-3`}>{erro}</div> : null}
                {d?.avisos?.length ? <div className={`${NOTA} mb-3`}>{d.avisos.join(' ')}</div> : null}

                {carregando && !d ? <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478]`}>Carregando…</div> : null}

                {d ? (
                    <>
                        <section aria-label="Resumo" className={`mb-4 ${GRADE_CARTOES}`}>
                            <CartaoInfo
                                rotulo={`Custo de ${MESES[Number(ate.slice(5, 7)) - 1]}`}
                                valor={V(atual ? brl(atual.total) : '—')}
                                sub={
                                    atual
                                        ? `${atual.pessoas} pessoa(s)${variacao !== null ? ` · ${variacao >= 0 ? '+' : ''}${variacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% sobre o mês anterior` : ''}`
                                        : 'sem folha conferida'
                                }
                                href="#grafico"
                                estilo="escuro"
                            />
                            <CartaoInfo rotulo="Folha ÷ faturamento" valor={V(atual ? pct(atual.total, atual.faturamento) : '—')} sub={`12 meses: ${pct(custo12, fat12)}`} href="#faturamento" />
                            <CartaoInfo rotulo={`Custo em ${ate.slice(0, 4)}`} valor={V(brl(ano))} sub="folhas conferidas no ano" href="#grafico" />
                            <CartaoInfo
                                rotulo="Vales e empréstimos"
                                valor={V(brl(totalVales + totalEmp))}
                                sub={`vales ${brl(totalVales)} · empréstimos ${brl(totalEmp)}`}
                                href="#vales"
                                estilo={totalVales + totalEmp > 0 ? 'alerta' : undefined}
                            />
                        </section>

                        {/* gráfico */}
                        <section id="grafico" className={`${CARTAO} mb-4 p-4`}>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className={ROTULO_SECAO}>Custo da folha por mês</div>
                                    <div className={SUB}>Vales e empréstimos são adiantamentos e não somam ao custo.</div>
                                </div>
                                <button type="button" className={BTN_PEQ} onClick={() => setVerTabela(!verTabela)}>
                                    {verTabela ? 'Ver gráfico' : 'Ver tabela'}
                                </button>
                            </div>
                            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                                {SERIES.map((s) => (
                                    <span key={s.k} className="inline-flex items-center gap-1.5">
                                        <span className="size-2.5 rounded-sm" style={{ background: cor(s) }} />
                                        {s.nome}
                                    </span>
                                ))}
                            </div>
                            {!verTabela ? (
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={d.meses} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                                            <CartesianGrid vertical={false} stroke={grade} />
                                            <XAxis dataKey="competencia" tickFormatter={mesCurto} tick={{ fill: eixo, fontSize: 12 }} axisLine={false} tickLine={false} />
                                            <YAxis tickFormatter={kBRL} tick={{ fill: eixo, fontSize: 12 }} axisLine={false} tickLine={false} width={52} />
                                            <Tooltip content={<Dica />} cursor={{ fill: escuro ? 'rgba(255,255,255,0.05)' : 'rgba(49,60,85,0.06)' }} />
                                            {SERIES.map((s, i) => (
                                                <Bar
                                                    key={s.k}
                                                    dataKey={s.k}
                                                    stackId="c"
                                                    fill={cor(s)}
                                                    stroke={escuro ? '#232B3F' : '#FFFFFF'}
                                                    strokeWidth={1}
                                                    radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                                                    isAnimationActive={false}
                                                />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[720px] text-[13px] tabular-nums">
                                        <thead>
                                            <tr className="text-right text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">
                                                <th className="py-2 text-left">Mês</th>
                                                {SERIES.map((s) => (
                                                    <th key={s.k} className="py-2">
                                                        {s.nome}
                                                    </th>
                                                ))}
                                                <th className="py-2">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {d.meses.map((m) => (
                                                <tr key={m.competencia} className="border-t border-[#E3E8F0] text-right dark:border-white/[0.08]">
                                                    <td className="py-2 text-left">
                                                        {mesBR(m.competencia)}
                                                        {!m.fechado ? <span className={`ml-1 ${SELO} ${S_AVISO}`}>aberta</span> : null}
                                                    </td>
                                                    {SERIES.map((s) => (
                                                        <td key={s.k} className="py-2">
                                                            {brl(m[s.k] as number)}
                                                        </td>
                                                    ))}
                                                    <td className="py-2 font-extrabold">{brl(m.total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                        <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-[#E3E8F0] [scrollbar-width:none] dark:border-white/[0.08]">
                            {(
                                [
                                    ['pessoas', 'Por pessoa'],
                                    ['equipes', 'Por equipe'],
                                    ['faturamento', 'Folha × faturamento'],
                                    ['vales', 'Vales e empréstimos'],
                                ] as const
                            ).map(([k, l]) => (
                                <button
                                    key={k}
                                    role="tab"
                                    aria-selected={aba === k}
                                    type="button"
                                    onClick={() => setAba(k)}
                                    className={`min-h-12 shrink-0 whitespace-nowrap border-b-[3px] px-3 text-[14.5px] font-extrabold ${aba === k ? 'border-[#F2CB3F] text-[#313C55] dark:text-white' : 'border-transparent text-[#5B6478] dark:text-[#AEB9CF]'}`}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>

                        {/* por pessoa */}
                        {aba === 'pessoas' ? (
                            <div className={`${CARTAO} overflow-hidden`}>
                                <div className="flex flex-wrap items-center gap-2 border-b border-[#E3E8F0] px-4 py-2.5 dark:border-white/[0.08]">
                                    <span className={SUB}>Ordenar por</span>
                                    {(
                                        [
                                            ['total_mes', 'custo do mês'],
                                            ['total_ano', 'custo no ano'],
                                            ['nome', 'nome'],
                                        ] as const
                                    ).map(([k, l]) => (
                                        <button key={k} type="button" onClick={() => setOrdem(k)} className={`${SELO} min-h-8 px-2.5 ${ordem === k ? 'bg-[#313C55] text-white dark:bg-[#3D6A99]' : S_MUDO}`}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[760px] text-[13.5px] tabular-nums">
                                        <thead>
                                            <tr className="bg-[#F6F8FB] text-right text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                                <th className="px-4 py-2.5 text-left">Colaborador</th>
                                                <th className="px-2 py-2.5">Salário bruto</th>
                                                <th className="px-2 py-2.5">Extra e bônus</th>
                                                <th className="px-2 py-2.5">Comissões</th>
                                                <th className="px-2 py-2.5">Férias e 13º</th>
                                                <th className="px-2 py-2.5">Custo do mês</th>
                                                <th className="px-4 py-2.5">No ano</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pessoas.map((p) => (
                                                <tr key={p.colaborador_id} className="border-t border-[#E3E8F0] text-right dark:border-white/[0.08]">
                                                    <td className="px-4 py-2.5 text-left">
                                                        <b className="block">{p.nome}</b>
                                                        <span className={SUB}>{p.equipe || 'Sem equipe'}</span>
                                                    </td>
                                                    <td className="px-2 py-2.5">{p.salarios ? brl(p.salarios) : '—'}</td>
                                                    <td className="px-2 py-2.5">{p.extras ? brl(p.extras) : '—'}</td>
                                                    <td className="px-2 py-2.5">{p.comissoes ? brl(p.comissoes) : '—'}</td>
                                                    <td className="px-2 py-2.5">{p.ferias_13 ? brl(p.ferias_13) : '—'}</td>
                                                    <td className="px-2 py-2.5 font-extrabold">{brl(p.total_mes)}</td>
                                                    <td className="px-4 py-2.5">{brl(p.total_ano)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className={`px-4 py-2.5 ${SUB}`}>O FGTS entra só no total do mês da folha (gráfico), não por pessoa.</div>
                            </div>
                        ) : null}

                        {/* por equipe */}
                        {aba === 'equipes' ? (
                            <div className={`${CARTAO} overflow-hidden`}>
                                {(() => {
                                    const tot = d.equipes.reduce((s, e) => s + e.mes, 0) || 1;
                                    return d.equipes.map((e) => (
                                        <div key={e.equipe} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-t border-[#E3E8F0] px-4 py-3 text-[14px] first:border-t-0 dark:border-white/[0.08] sm:grid-cols-[180px_minmax(0,1fr)_120px_120px]">
                                            <span>
                                                <b className="block">{e.equipe}</b>
                                                <span className={SUB}>{e.pessoas} pessoa(s)</span>
                                            </span>
                                            <span className="order-last col-span-2 h-2.5 overflow-hidden rounded-full bg-[#F1F4F8] dark:bg-white/[0.08] sm:order-none sm:col-span-1">
                                                <span className="block h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${(e.mes / tot) * 100}%` }} />
                                            </span>
                                            <span className="text-right tabular-nums">
                                                <b className="block">{brl(e.mes)}</b>
                                                <span className={SUB}>{pct(e.mes, tot)} do mês</span>
                                            </span>
                                            <span className="hidden text-right tabular-nums sm:block">
                                                <span className="block">{brl(e.ano)}</span>
                                                <span className={SUB}>no ano</span>
                                            </span>
                                        </div>
                                    ));
                                })()}
                            </div>
                        ) : null}

                        {/* folha × faturamento */}
                        {aba === 'faturamento' ? (
                            <div id="faturamento" className={`${CARTAO} overflow-x-auto`}>
                                <table className="w-full min-w-[560px] text-[13.5px] tabular-nums">
                                    <thead>
                                        <tr className="bg-[#F6F8FB] text-right text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                            <th className="px-4 py-2.5 text-left">Mês</th>
                                            <th className="px-2 py-2.5">Faturamento particular</th>
                                            <th className="px-2 py-2.5">Custo da folha</th>
                                            <th className="px-4 py-2.5">Folha ÷ faturamento</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...d.meses].reverse().map((m) => {
                                            const r = m.faturamento ? m.total / m.faturamento : null;
                                            return (
                                                <tr key={m.competencia} className="border-t border-[#E3E8F0] text-right dark:border-white/[0.08]">
                                                    <td className="px-4 py-2.5 text-left">{mesBR(m.competencia)}</td>
                                                    <td className="px-2 py-2.5">{m.faturamento ? brl(m.faturamento) : '—'}</td>
                                                    <td className="px-2 py-2.5">{brl(m.total)}</td>
                                                    <td className="px-4 py-2.5">
                                                        <span className="inline-flex items-center gap-2">
                                                            <span className="hidden h-2 w-24 overflow-hidden rounded-full bg-[#F1F4F8] dark:bg-white/[0.08] sm:block">
                                                                <span className="block h-full rounded-full bg-[#313C55] dark:bg-[#AEB9CF]" style={{ width: `${Math.min(100, (r || 0) * 100)}%` }} />
                                                            </span>
                                                            <b>{pct(m.total, m.faturamento)}</b>
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <div className={`px-4 py-2.5 ${SUB}`}>
                                    Faturamento particular: OS particulares e diferenças concluídas no mês, sem translado (a mesma base da comissão dos agentes). Antes do app, o mês fica sem faturamento.
                                </div>
                            </div>
                        ) : null}

                        {/* vales e empréstimos */}
                        {aba === 'vales' ? (
                            <div id="vales" className="grid gap-4 lg:grid-cols-2">
                                <section className={`${CARTAO} overflow-hidden`}>
                                    <div className="flex items-baseline justify-between border-b border-[#E3E8F0] px-4 py-3 dark:border-white/[0.08]">
                                        <span className={ROTULO_SECAO}>Vales em aberto</span>
                                        <b className="tabular-nums">{brl(totalVales)}</b>
                                    </div>
                                    {!d.vales.length ? <div className={`p-4 ${SUB}`}>Nenhum vale em aberto.</div> : null}
                                    {d.vales.map((v) => (
                                        <div key={v.colaborador_id} className="flex items-center gap-3 border-t border-[#E3E8F0] px-4 py-2.5 text-[14px] first:border-t-0 dark:border-white/[0.08]">
                                            <span className="min-w-0 flex-1">
                                                <b className="block break-words">{v.nome}</b>
                                                <span className={SUB}>
                                                    {v.qtd} vale(s) · desde {dataBR(v.mais_antigo)}
                                                </span>
                                            </span>
                                            <b className="tabular-nums">{brl(v.valor)}</b>
                                        </div>
                                    ))}
                                </section>
                                <section className={`${CARTAO} overflow-hidden`}>
                                    <div className="flex items-baseline justify-between border-b border-[#E3E8F0] px-4 py-3 dark:border-white/[0.08]">
                                        <span className={ROTULO_SECAO}>Empréstimos a receber</span>
                                        <b className="tabular-nums">{brl(totalEmp)}</b>
                                    </div>
                                    {!d.emprestimos.length ? <div className={`p-4 ${SUB}`}>Nenhum empréstimo em aberto.</div> : null}
                                    {d.emprestimos.map((e) => (
                                        <div key={e.colaborador_id} className="flex items-center gap-3 border-t border-[#E3E8F0] px-4 py-2.5 text-[14px] first:border-t-0 dark:border-white/[0.08]">
                                            <span className="min-w-0 flex-1">
                                                <b className="block break-words">{e.nome}</b>
                                                <span className={SUB}>
                                                    {e.parcelas} parcela(s) de {brl(e.valor_parcela)}
                                                </span>
                                            </span>
                                            <b className="tabular-nums">{brl(e.saldo)}</b>
                                        </div>
                                    ))}
                                    {d.saldos_negativos.length ? (
                                        <div className={`border-t border-[#E3E8F0] px-4 py-2.5 text-[13px] dark:border-white/[0.08] ${S_AVISO}`}>
                                            Saldo negativo levado para a próxima folha: {d.saldos_negativos.map((s) => `${s.nome} ${brl(s.valor)}`).join(' · ')}
                                        </div>
                                    ) : null}
                                </section>
                            </div>
                        ) : null}
                    </>
                ) : null}
            </div>
        </div>
    );
}
