'use client';

/**
 * Avaliação dos agentes (/folha-avaliacao) — Gestão · Folha de pagamento — 09/11/2026.
 *
 * Nota do mês de cada agente (quem tem a regra "Comissão por faturamento"), de 0 a 100, com 5 partes:
 * famílias (automática), gestor (critérios de 1 a 5), pontualidade, comercial e registro em tempo real
 * (sugeridas pelo sistema, o gestor ajusta com motivo). Na pontualidade o gestor abona o atraso que não foi do agente.
 * A nota multiplica a comissão do mês (/folha-comissoes). Depois que a comissão é liberada, a avaliação trava.
 * Back-end: rh_avaliacao.php (novo). Só a Gestão acessa.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconChevronRight, IconRefresh, IconStars, IconX } from '@tabler/icons-react';
import { BOTAO_PAGINA, BOTAO_PAGINA_PRI, BOTAO_PAGINA_SEC, ROTULO_SECAO, TopoPagina } from '@/components/shell/ModuloHub';

type ParteK = 'familias' | 'gestor' | 'pontualidade' | 'comercial' | 'registro';
type Parte = { valor: number | null; sugerida: number | null; ajustada: boolean; motivo: string | null; base: string };
type Linha = {
    colaborador_id: number;
    nome: string;
    usuario_id: number | null;
    partes: Record<ParteK, Parte>;
    nota_final: number | null;
    abaixo_minimo: boolean;
    avaliado: boolean;
    avaliado_em: string | null;
    ocorrencia: boolean;
    observacao: string | null;
    criterios: Record<string, number>;
    abonos: Record<string, string>;
    avisos: string[];
};
type Criterio = { id: string; nome: string; peso: number; nota1: string | null; nota5: string | null };
type Pesos = Record<ParteK, number> & { nota_minima: number };
type Pont = { atendimento_id: number; falecido: string | null; combinado: string; marcado: string; atraso_min: number };
type Detalhe = {
    linha: Linha;
    familias: { atendimento_id: number; notas: number; media: number; falecido?: string | null }[];
    pontualidade: Pont[];
    os: { os_id: number; numero_os: string; tipo: string; data: string; valor: number; translado: number }[];
};
type Ajuste = { valor: string; motivo: string };
type Form = { criterios: Record<string, number>; abonos: Record<string, string>; ajustes: Record<string, Ajuste>; ocorrencia: boolean; observacao: string };

const URL_API = 'https://api.planoassistencialintegrado.com.br/rh_avaliacao.php';
const PARTES: [ParteK, string][] = [
    ['familias', 'Famílias'],
    ['gestor', 'Gestor'],
    ['pontualidade', 'Pontualidade'],
    ['comercial', 'Comercial'],
    ['registro', 'Registro'],
];
const AJUSTAVEIS: ParteK[] = ['pontualidade', 'comercial', 'registro'];
const GRADE = 'lg:grid lg:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(84px,1fr))_minmax(96px,1fr)_120px] lg:items-center lg:gap-2';

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


const horaBR = (s: string) => (s ? `${dataBR(s.slice(0, 10))} ${s.slice(11, 16)}` : '');

export default function AvaliacaoPage() {
    const [comp, setComp] = useState<string>(() => hojeISO().slice(0, 7));
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [pesos, setPesos] = useState<Pesos | null>(null);
    const [criterios, setCriterios] = useState<Criterio[]>([]);
    const [travada, setTravada] = useState(false);
    const [tolerancia, setTolerancia] = useState(15);
    const [carregando, setCarregando] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [det, setDet] = useState<Detalhe | null>(null);
    const [form, setForm] = useState<Form | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);

    const tratarErro = (e: any, padrao: string, set: (m: string) => void) => {
        if (e instanceof SessaoExpirada) {
            window.location.href = '/login';
            return;
        }
        set(e?.message || padrao);
    };

    const carregar = useCallback(async (c: string) => {
        setCarregando(true);
        setErroLista(null);
        try {
            const j = await api(URL_API, 'painel', undefined, `&competencia=${c}`);
            const d = j.dados || {};
            setLinhas(Array.isArray(d.linhas) ? d.linhas : []);
            setPesos(d.pesos || null);
            setCriterios(Array.isArray(d.criterios) ? d.criterios : []);
            setTravada(!!d.travada);
            setTolerancia(Number(d.tolerancia_min) || 15);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível carregar a avaliação.', setErroLista);
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => {
        void carregar(comp);
    }, [carregar, comp]);

    useEffect(() => {
        if (!aviso) return;
        const t = window.setTimeout(() => setAviso(null), 4000);
        return () => window.clearTimeout(t);
    }, [aviso]);

    const abrir = async (l: Linha) => {
        setErroForm(null);
        setDet({ linha: l, familias: [], pontualidade: [], os: [] });
        const aj: Record<string, Ajuste> = {};
        AJUSTAVEIS.forEach((k) => (aj[k] = l.partes[k].ajustada ? { valor: String(l.partes[k].valor ?? '').replace('.', ','), motivo: l.partes[k].motivo || '' } : { valor: '', motivo: '' }));
        setForm({ criterios: { ...(l.criterios || {}) }, abonos: { ...(l.abonos || {}) }, ajustes: aj, ocorrencia: l.ocorrencia, observacao: l.observacao || '' });
        try {
            const j = await api(URL_API, 'detalhe', undefined, `&competencia=${comp}&colaborador_id=${l.colaborador_id}`);
            setDet(j.dados);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível abrir o detalhe.', setErroForm);
        }
    };
    const fechar = useCallback(() => {
        setDet(null);
        setForm(null);
    }, []);

    /* prévia da nota com o que está na janela */
    const previa = useMemo(() => {
        if (!det || !form || !pesos) return null;
        const p = det.linha.partes;
        let pts = 0;
        let max = 0;
        criterios.forEach((c) => {
            const n = form.criterios[c.id];
            if (n >= 1 && n <= 5) {
                pts += c.peso * n;
                max += c.peso * 5;
            }
        });
        const gestor = max ? (pts / max) * 100 : null;
        const cons = det.pontualidade.filter((x) => !(String(x.atendimento_id) in form.abonos));
        const pontSug = cons.length ? (cons.filter((x) => x.atraso_min <= tolerancia).length / cons.length) * 100 : null;
        const sug: Record<ParteK, number | null> = { familias: p.familias.valor, gestor, pontualidade: det.pontualidade.length ? pontSug : p.pontualidade.sugerida, comercial: p.comercial.sugerida, registro: p.registro.sugerida };
        const val: Record<ParteK, number | null> = { ...sug };
        AJUSTAVEIS.forEach((k) => {
            const a = paraNumero(form.ajustes[k]?.valor || '');
            if (a !== null && !Number.isNaN(a)) val[k] = a;
        });
        let s = 0;
        let pp = 0;
        PARTES.forEach(([k]) => {
            if (val[k] !== null && pesos[k] > 0) {
                s += pesos[k] * (val[k] as number);
                pp += pesos[k];
            }
        });
        return { sug, val, final: pp ? s / pp : null };
    }, [det, form, pesos, criterios, tolerancia]);

    const salvar = async () => {
        if (!det || !form) return;
        const falta = criterios.find((c) => !(form.criterios[c.id] >= 1));
        if (falta) return setErroForm(`Dê a nota de 1 a 5 em "${falta.nome}".`);
        const ajustes: Record<string, { valor: number; motivo: string } | null> = {};
        for (const k of AJUSTAVEIS) {
            const a = form.ajustes[k];
            if (!a?.valor.trim()) {
                ajustes[k] = null;
                continue;
            }
            const v = paraNumero(a.valor);
            if (v === null || Number.isNaN(v) || v < 0 || v > 100) return setErroForm('A nota ajustada vai de 0 a 100.');
            if (!a.motivo.trim()) return setErroForm('Informe o motivo de cada nota ajustada.');
            ajustes[k] = { valor: v, motivo: a.motivo.trim() };
        }
        for (const [aid, mot] of Object.entries(form.abonos)) {
            if (!mot.trim()) return setErroForm(`Informe o motivo do abono do atendimento #${aid}.`);
        }
        if (form.ocorrencia && !form.observacao.trim()) return setErroForm('Descreva a ocorrência grave na observação.');
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api(URL_API, 'salvar', {
                competencia: comp,
                colaborador_id: det.linha.colaborador_id,
                criterios: form.criterios,
                ajustes,
                abonos: form.abonos,
                ocorrencia: form.ocorrencia,
                observacao: form.observacao.trim(),
            });
            setAviso(j.msg);
            fechar();
            await carregar(comp);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível salvar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    const avaliados = linhas.filter((l) => l.avaliado).length;
    const notaCor = (v: number | null) => (v === null ? '' : pesos && v < pesos.nota_minima ? 'text-[#B42318] dark:text-[#FF9C92]' : '');

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <div className="mb-5">
                    <TopoPagina Icone={IconStars} titulo="Avaliação dos agentes" />
                </div>

                <Mes comp={comp} setComp={setComp} onAtualizar={() => void carregar(comp)}>
                    <span className={`${SELO} ${travada ? S_AB : avaliados === linhas.length && linhas.length ? S_OK : S_AVISO}`}>
                        {travada ? 'Travada: comissão liberada' : `${avaliados} de ${linhas.length} avaliado(s)`}
                    </span>
                </Mes>

                {aviso ? <div className={`mb-3 rounded-xl px-4 py-3 text-[14px] font-bold ${S_OK}`}>{aviso}</div> : null}
                {erroLista ? <div className={`${ERRO} mb-3`}>{erroLista}</div> : null}

                {pesos ? (
                    <div className={`${NOTA} mb-4`}>
                        <span>
                            Pesos: famílias {pesos.familias}% · gestor {pesos.gestor}% · pontualidade {pesos.pontualidade}% · comercial {pesos.comercial}% · registro {pesos.registro}%. Nota mínima para receber a comissão:{' '}
                            {pesos.nota_minima}. Parte sem dado no mês fica fora e os pesos das outras se redistribuem. Pontualidade: chegada para o velório até {tolerancia} min do combinado.
                        </span>
                    </div>
                ) : null}

                {carregando ? (
                    <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478]`}>Carregando…</div>
                ) : !linhas.length ? (
                    <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]`}>Ninguém com a regra &quot;Comissão por faturamento&quot; neste mês (Regras de pagamento).</div>
                ) : (
                    <div className={`${CARTAO} overflow-hidden`}>
                        <div className={`hidden bg-[#F6F8FB] px-4 py-2.5 text-right text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF] ${GRADE}`}>
                            <span className="text-left">Agente</span>
                            {PARTES.map(([k, r]) => (
                                <span key={k}>
                                    {r}
                                    {pesos ? <span className="block font-bold normal-case tracking-normal">{pesos[k]}%</span> : null}
                                </span>
                            ))}
                            <span>Nota final</span>
                            <span className="text-left">Situação</span>
                        </div>
                        {linhas.map((l) => (
                            <button
                                key={l.colaborador_id}
                                type="button"
                                onClick={() => void abrir(l)}
                                className={`grid w-full grid-cols-3 gap-x-3 gap-y-1 border-t border-[#E3E8F0] px-4 py-3 text-left text-[14px] first:border-t-0 hover:bg-[#F6F8FB] dark:border-white/[0.08] dark:hover:bg-white/[0.04] lg:first:border-t ${GRADE}`}
                            >
                                <span className="col-span-3 min-w-0 lg:col-span-1">
                                    <b className="block break-words">{l.nome}</b>
                                    {l.avisos.length ? <span className={`block ${SUB}`}>{l.avisos[0]}</span> : null}
                                </span>
                                {PARTES.map(([k, r]) => (
                                    <span key={k} className="flex items-baseline justify-between gap-2 tabular-nums lg:block lg:text-right">
                                        <span className={`lg:hidden ${SUB} font-bold`}>{r}</span>
                                        <span className={l.partes[k].valor === null ? 'text-[#98A1B3]' : ''}>
                                            {pctBR(l.partes[k].valor)}
                                            {l.partes[k].ajustada ? <span className={`ml-1 ${SUB}`}>aj.</span> : null}
                                        </span>
                                    </span>
                                ))}
                                <span className="flex items-baseline justify-between gap-2 lg:block lg:text-right">
                                    <span className={`lg:hidden ${SUB} font-bold`}>Nota final</span>
                                    <b className={`text-[16px] tabular-nums ${notaCor(l.nota_final)}`}>{pctBR(l.nota_final)}</b>
                                </span>
                                <span className="col-span-2 flex flex-wrap items-center gap-1 lg:col-span-1">
                                    {l.ocorrencia ? (
                                        <span className={`${SELO} ${S_RUIM}`}>Ocorrência</span>
                                    ) : l.avaliado ? (
                                        <span className={`${SELO} ${l.abaixo_minimo ? S_RUIM : S_OK}`}>{l.abaixo_minimo ? 'Abaixo da mínima' : 'Avaliado'}</span>
                                    ) : (
                                        <span className={`${SELO} ${S_AVISO}`}>Pendente</span>
                                    )}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {det && form ? (
                <Janela
                    titulo={det.linha.nome}
                    sub={`${mesBR(comp)} · nota ${pctBR(previa?.final ?? null)}${pesos && previa?.final !== null && previa?.final !== undefined && previa.final < pesos.nota_minima ? ' (abaixo da mínima)' : ''}`}
                    onFechar={fechar}
                    largura="max-w-3xl"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fechar}>
                                Voltar
                            </button>
                            {!travada ? (
                                <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()}>
                                    <IconCheck size={18} /> {salvando ? 'Salvando…' : 'Salvar avaliação'}
                                </button>
                            ) : null}
                        </>
                    }
                >
                    <div className="flex flex-col gap-5">
                        {travada ? <div className={`${NOTA} ${S_AB}`}>A comissão deste mês já foi liberada: a avaliação só pode ser vista.</div> : null}

                        {/* resumo */}
                        <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#F6F8FB] p-3 text-[13px] tabular-nums dark:bg-[#1C2334] sm:grid-cols-6">
                            {PARTES.map(([k, r]) => (
                                <span key={k}>
                                    {r} {pesos ? `(${pesos[k]}%)` : ''}
                                    <b className="block text-[15px]">{pctBR(previa?.val[k] ?? null)}</b>
                                </span>
                            ))}
                            <span>
                                Nota final
                                <b className="block text-[17px]">{pctBR(previa?.final ?? null)}</b>
                            </span>
                        </div>

                        {/* famílias */}
                        <section>
                            <div className={`${ROTULO_SECAO} mb-1`}>Famílias · automática</div>
                            <div className={SUB}>{det.linha.partes.familias.base}</div>
                            {det.familias.length ? (
                                <div className="mt-2 max-h-[160px] overflow-y-auto rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                    {det.familias.map((f) => (
                                        <div key={f.atendimento_id} className="flex gap-3 border-t border-[#E3E8F0] px-3 py-2 text-[13.5px] first:border-t-0 dark:border-white/[0.08]">
                                            <span className="min-w-0 flex-1 break-words">{f.falecido || `Atendimento #${f.atendimento_id}`}</span>
                                            <span className={SUB}>{f.notas} nota(s)</span>
                                            <b className="tabular-nums">{pctBR(f.media, 2)} de 5</b>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </section>

                        {/* gestor */}
                        <section>
                            <div className={`${ROTULO_SECAO} mb-2`}>Avaliação do gestor · nota de 1 a 5</div>
                            <div className="flex flex-col gap-3">
                                {criterios.map((c) => (
                                    <div key={c.id} className="rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.08]">
                                        <div className="flex flex-wrap items-baseline gap-2">
                                            <b className="text-[14.5px]">{c.nome}</b>
                                            <span className={SUB}>peso {c.peso}</span>
                                        </div>
                                        {c.nota1 || c.nota5 ? (
                                            <div className={`${SUB} mb-2`}>
                                                1 = {c.nota1 || '—'} · 5 = {c.nota5 || '—'}
                                            </div>
                                        ) : null}
                                        <div className="grid grid-cols-5 gap-1.5">
                                            {[1, 2, 3, 4, 5].map((n) => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    disabled={travada}
                                                    aria-pressed={form.criterios[c.id] === n}
                                                    onClick={() => setForm({ ...form, criterios: { ...form.criterios, [c.id]: n } })}
                                                    className={`min-h-11 rounded-xl text-[15px] font-extrabold ${form.criterios[c.id] === n ? 'bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]' : 'bg-[#F1F4F8] text-[#313C55] dark:bg-white/[0.08] dark:text-white'}`}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* pontualidade */}
                        <section>
                            <div className={`${ROTULO_SECAO} mb-1`}>Pontualidade · chegada para o velório</div>
                            <div className={SUB}>
                                Sugerida {pctBR(previa?.sug.pontualidade ?? null)} · {det.linha.partes.pontualidade.base}. Abone o atraso que não foi do agente (cartório, hospital, família): ele sai da conta.
                            </div>
                            {det.pontualidade.length ? (
                                <div className="mt-2 rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                    {det.pontualidade.map((p) => {
                                        const k = String(p.atendimento_id);
                                        const abonado = k in form.abonos;
                                        const atrasou = p.atraso_min > tolerancia;
                                        return (
                                            <div key={k} className="flex flex-col gap-2 border-t border-[#E3E8F0] px-3 py-2.5 text-[13.5px] first:border-t-0 dark:border-white/[0.08]">
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                    <span className="min-w-[140px] flex-1 break-words">
                                                        <b>{p.falecido || `Atendimento #${p.atendimento_id}`}</b>
                                                        <span className={`block ${SUB}`}>
                                                            combinado {horaBR(p.combinado)} · marcou &quot;Velando&quot; {horaBR(p.marcado)}
                                                        </span>
                                                    </span>
                                                    <span className={`${SELO} ${abonado ? S_MUDO : atrasou ? S_RUIM : S_OK}`}>
                                                        {abonado ? 'Abonado' : atrasou ? `${p.atraso_min} min de atraso` : 'No horário'}
                                                    </span>
                                                    {atrasou && !travada ? (
                                                        <button
                                                            type="button"
                                                            className={BTN_PEQ}
                                                            onClick={() => {
                                                                const ab = { ...form.abonos };
                                                                if (abonado) delete ab[k];
                                                                else ab[k] = '';
                                                                setForm({ ...form, abonos: ab });
                                                            }}
                                                        >
                                                            {abonado ? 'Tirar abono' : 'Abonar'}
                                                        </button>
                                                    ) : null}
                                                </div>
                                                {abonado ? (
                                                    <input
                                                        className={CAMPO}
                                                        maxLength={200}
                                                        disabled={travada}
                                                        placeholder="Motivo do abono"
                                                        value={form.abonos[k]}
                                                        onChange={(e) => setForm({ ...form, abonos: { ...form.abonos, [k]: e.target.value } })}
                                                    />
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </section>

                        {/* comercial e registro */}
                        <section className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <div className={`${ROTULO_SECAO} mb-1`}>Comercial</div>
                                <div className={SUB}>
                                    Sugerida {pctBR(det.linha.partes.comercial.sugerida)} · {det.linha.partes.comercial.base}. Valor médio das OS particulares e diferenças dele (sem translado) comparado com a média da equipe.
                                </div>
                            </div>
                            <div>
                                <div className={`${ROTULO_SECAO} mb-1`}>Registro em tempo real</div>
                                <div className={SUB}>
                                    Sugerida {pctBR(det.linha.partes.registro.sugerida)} · {det.linha.partes.registro.base}. &quot;Em lote&quot;: fase marcada menos de 2 min depois da anterior no mesmo atendimento.
                                </div>
                            </div>
                        </section>

                        {/* ajustes */}
                        <section>
                            <div className={`${ROTULO_SECAO} mb-2`}>Ajustar nota sugerida (opcional)</div>
                            <div className="flex flex-col gap-2">
                                {AJUSTAVEIS.map((k) => (
                                    <div key={k} className="grid gap-2 sm:grid-cols-[140px_110px_minmax(0,1fr)] sm:items-center">
                                        <b className="text-[14px]">{PARTES.find((p) => p[0] === k)?.[1]}</b>
                                        <input
                                            className={CAMPO}
                                            inputMode="decimal"
                                            disabled={travada}
                                            placeholder={pctBR(k === 'pontualidade' ? previa?.sug.pontualidade ?? null : det.linha.partes[k].sugerida)}
                                            value={form.ajustes[k]?.valor || ''}
                                            onChange={(e) => setForm({ ...form, ajustes: { ...form.ajustes, [k]: { ...form.ajustes[k], valor: e.target.value } } })}
                                            aria-label={`Nota de ${k}`}
                                        />
                                        <input
                                            className={CAMPO}
                                            maxLength={200}
                                            disabled={travada || !form.ajustes[k]?.valor}
                                            placeholder="Motivo do ajuste"
                                            value={form.ajustes[k]?.motivo || ''}
                                            onChange={(e) => setForm({ ...form, ajustes: { ...form.ajustes, [k]: { ...form.ajustes[k], motivo: e.target.value } } })}
                                        />
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* ocorrência */}
                        <section className="flex flex-col gap-2">
                            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[#E3E8F0] px-3 dark:border-white/[0.08]">
                                <input type="checkbox" className="size-5 accent-[#B42318]" disabled={travada} checked={form.ocorrencia} onChange={(e) => setForm({ ...form, ocorrencia: e.target.checked })} />
                                <span className="text-[14px]">
                                    <b>Ocorrência grave confirmada</b>
                                    <span className={`block ${SUB}`}>Sigilo, ritos ou conduta ética. Corta a comissão do mês (ou metade, conforme a configuração).</span>
                                </span>
                            </label>
                            <Campo rotulo={form.ocorrencia ? 'Observação (descreva a ocorrência)' : 'Observação (opcional)'}>
                                <textarea
                                    className={`${CAMPO} h-24 py-3`}
                                    maxLength={1000}
                                    disabled={travada}
                                    value={form.observacao}
                                    onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                                />
                            </Campo>
                        </section>

                        {det.linha.avisos.length ? (
                            <div className={NOTA}>
                                <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <span>{det.linha.avisos.join(' · ')}</span>
                            </div>
                        ) : null}
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}
        </div>
    );
}
