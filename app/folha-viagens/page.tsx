'use client';

/**
 * Viagens (/folha-viagens) — Gestão · Folha de pagamento — 09/11/2026.
 *
 * As viagens a outro município não têm um valor padrão (dependem do km, da distância e do que foi fechado):
 * cada uma é lançada aqui com o valor pago e entra nas comissões do mês da data da viagem (/folha-comissoes).
 * Depois que a comissão do mês é liberada, as viagens daquele mês ficam travadas.
 * Back-end: rh_comissao.php (viagens, viagem_salvar, viagem_cancelar). Só a Gestão acessa.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronLeft, IconChevronRight, IconPlus, IconRefresh, IconRoute, IconTrash, IconX } from '@tabler/icons-react';
import { BOTAO_PAGINA, BOTAO_PAGINA_PRI, BOTAO_PAGINA_SEC, CartaoInfo, GRADE_CARTOES, TopoPagina } from '@/components/shell/ModuloHub';

type Viagem = {
    id: number;
    colaborador_id: number;
    nome: string;
    data: string;
    atendimento_id: number | null;
    destino: string;
    km: number | null;
    valor: number;
    observacao: string | null;
    comissao_id: number | null;
    comissao_situacao: string | null;
    situacao: 'ABERTA' | 'PAGA' | 'CANCELADA';
};
type Form = { id: number | null; colaborador_id: string; data: string; destino: string; km: string; valor: string; atendimento_id: string; observacao: string };

const URL_API = 'https://api.planoassistencialintegrado.com.br/rh_comissao.php';

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


export default function ViagensPage() {
    const [comp, setComp] = useState<string>(() => hojeISO().slice(0, 7));
    const [viagens, setViagens] = useState<Viagem[]>([]);
    const [colabs, setColabs] = useState<{ id: number; nome: string }[]>([]);
    const [travado, setTravado] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [form, setForm] = useState<Form | null>(null);
    const [cancelar, setCancelar] = useState<Viagem | null>(null);
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
            const j = await api(URL_API, 'viagens', undefined, `&competencia=${c}`);
            const d = j.dados || {};
            setViagens(Array.isArray(d.viagens) ? d.viagens : []);
            setColabs(Array.isArray(d.colaboradores) ? d.colaboradores : []);
            setTravado(!!d.comissao_situacao && d.comissao_situacao !== 'ABERTA');
        } catch (e: any) {
            tratarErro(e, 'Não foi possível carregar as viagens.', setErroLista);
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

    const ativas = useMemo(() => viagens.filter((v) => v.situacao !== 'CANCELADA'), [viagens]);
    const total = ativas.reduce((s, v) => s + v.valor, 0);
    const porPessoa = useMemo(() => {
        const m: Record<string, number> = {};
        ativas.forEach((v) => (m[v.nome] = (m[v.nome] || 0) + v.valor));
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    }, [ativas]);
    const editavel = (v: Viagem) => v.situacao === 'ABERTA' && !v.comissao_id && !travado;

    const abrirNova = () => {
        setErroForm(null);
        const hoje = hojeISO();
        setForm({ id: null, colaborador_id: '', data: hoje.slice(0, 7) === comp ? hoje : `${comp}-01`, destino: '', km: '', valor: '', atendimento_id: '', observacao: '' });
    };
    const abrirEdicao = (v: Viagem) => {
        setErroForm(null);
        setForm({
            id: v.id,
            colaborador_id: String(v.colaborador_id),
            data: v.data,
            destino: v.destino,
            km: v.km !== null ? String(v.km).replace('.', ',') : '',
            valor: v.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            atendimento_id: v.atendimento_id ? String(v.atendimento_id) : '',
            observacao: v.observacao || '',
        });
    };
    const fecharForm = useCallback(() => setForm(null), []);
    const fecharCancelar = useCallback(() => setCancelar(null), []);

    const salvar = async () => {
        if (!form) return;
        const valor = paraNumero(form.valor);
        if (!form.colaborador_id) return setErroForm('Escolha o colaborador.');
        if (!form.data) return setErroForm('Informe a data da viagem.');
        if (!form.destino.trim()) return setErroForm('Informe o destino.');
        if (!valor || Number.isNaN(valor) || valor <= 0) return setErroForm('Informe o valor pago pela viagem.');
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api(URL_API, 'viagem_salvar', {
                id: form.id,
                colaborador_id: Number(form.colaborador_id),
                data: form.data,
                destino: form.destino.trim(),
                km: form.km ? paraNumero(form.km) : null,
                valor,
                atendimento_id: form.atendimento_id ? Number(form.atendimento_id) : null,
                observacao: form.observacao.trim(),
            });
            setForm(null);
            setAviso(j.msg);
            if (form.data.slice(0, 7) !== comp) setComp(form.data.slice(0, 7));
            else await carregar(comp);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível salvar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };
    const confirmarCancelar = async () => {
        if (!cancelar) return;
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api(URL_API, 'viagem_cancelar', { id: cancelar.id });
            setCancelar(null);
            setAviso(j.msg);
            await carregar(comp);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível cancelar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <div className="mb-5">
                    <TopoPagina
                        Icone={IconRoute}
                        titulo="Viagens"
                        acoes={
                            <button type="button" className={BTN_PRI} onClick={abrirNova}>
                                <IconPlus size={18} /> Lançar viagem
                            </button>
                        }
                    />
                </div>

                <Mes comp={comp} setComp={setComp} onAtualizar={() => void carregar(comp)}>
                    {travado ? <span className={`${SELO} ${S_AB}`}>Comissão do mês liberada</span> : null}
                </Mes>

                {aviso ? <div className={`mb-3 rounded-xl px-4 py-3 text-[14px] font-bold ${S_OK}`}>{aviso}</div> : null}
                {erroLista ? <div className={`${ERRO} mb-3`}>{erroLista}</div> : null}

                <section aria-label="Resumo" className={`mb-4 ${GRADE_CARTOES}`}>
                    <CartaoInfo rotulo="Viagens do mês" valor={brl(total)} sub={`${ativas.length} viagem(ns)`} href="#viagens" estilo="escuro" />
                    {porPessoa.slice(0, 3).map(([n, v]) => (
                        <CartaoInfo key={n} rotulo={n} valor={brl(v)} sub="no mês" href="#viagens" />
                    ))}
                </section>

                <div className={`${NOTA} mb-4`}>
                    <span>
                        Cada viagem entra nas comissões do mês da data dela e é paga junto com elas. Depois que a comissão do mês é liberada, as viagens daquele mês não mudam mais (reabra a comissão para corrigir).
                    </span>
                </div>

                <div id="viagens" className={`${CARTAO} overflow-hidden`}>
                    {carregando ? <div className="p-6 text-center text-[14px] text-[#5B6478]">Carregando…</div> : null}
                    {!carregando && !viagens.length ? <div className="p-6 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Nenhuma viagem lançada em {mesBR(comp).toLowerCase()}.</div> : null}
                    {viagens.map((v) => (
                        <div key={v.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E3E8F0] px-4 py-3 text-[14px] first:border-t-0 dark:border-white/[0.08] ${v.situacao === 'CANCELADA' ? 'opacity-50' : ''}`}>
                            <button type="button" disabled={!editavel(v)} onClick={() => abrirEdicao(v)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left disabled:cursor-default">
                                <span className="w-20 tabular-nums">{dataBR(v.data)}</span>
                                <span className="min-w-[150px] flex-1">
                                    <b className="block break-words">{v.nome}</b>
                                    <span className={`block ${SUB}`}>
                                        {v.destino}
                                        {v.km ? ` · ${pctBR(v.km, 0)} km` : ''}
                                        {v.atendimento_id ? ` · atendimento #${v.atendimento_id}` : ''}
                                        {v.observacao ? ` · ${v.observacao}` : ''}
                                    </span>
                                </span>
                                <b className="w-28 text-right tabular-nums">{brl(v.valor)}</b>
                            </button>
                            <span className={`${SELO} ${v.situacao === 'PAGA' ? S_OK : v.situacao === 'CANCELADA' ? S_MUDO : v.comissao_id ? S_AB : S_AVISO}`}>
                                {v.situacao === 'PAGA' ? 'Paga' : v.situacao === 'CANCELADA' ? 'Cancelada' : v.comissao_id ? 'Na comissão' : 'A pagar'}
                            </span>
                            {editavel(v) ? (
                                <button type="button" aria-label="Cancelar viagem" className="grid size-10 place-items-center rounded-xl text-[#5B6478] hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]" onClick={() => { setErroForm(null); setCancelar(v); }}>
                                    <IconTrash size={18} />
                                </button>
                            ) : (
                                <span className="size-10" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {form ? (
                <Janela
                    titulo={form.id ? 'Alterar viagem' : 'Lançar viagem'}
                    onFechar={fecharForm}
                    largura="max-w-lg"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharForm}>
                                Voltar
                            </button>
                            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()}>
                                {salvando ? 'Salvando…' : 'Salvar'}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <Campo rotulo="Colaborador">
                            <select className={CAMPO} value={form.colaborador_id} onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}>
                                <option value="">Escolha…</option>
                                {colabs.map((c) => (
                                    <option key={c.id} value={String(c.id)}>
                                        {c.nome}
                                    </option>
                                ))}
                            </select>
                        </Campo>
                        <div className="grid grid-cols-2 gap-3">
                            <Campo rotulo="Data">
                                <input type="date" className={CAMPO} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
                            </Campo>
                            <Campo rotulo="Valor pago">
                                <input className={CAMPO} inputMode="decimal" placeholder="R$ 0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
                            </Campo>
                        </div>
                        <Campo rotulo="Destino">
                            <input className={CAMPO} maxLength={120} placeholder="Cidade" value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })} />
                        </Campo>
                        <div className="grid grid-cols-2 gap-3">
                            <Campo rotulo="Km rodados (opcional)">
                                <input className={CAMPO} inputMode="decimal" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} />
                            </Campo>
                            <Campo rotulo="Nº do atendimento (opcional)">
                                <input className={CAMPO} inputMode="numeric" value={form.atendimento_id} onChange={(e) => setForm({ ...form, atendimento_id: e.target.value.replace(/\D/g, '') })} />
                            </Campo>
                        </div>
                        <Campo rotulo="Observação (opcional)">
                            <input className={CAMPO} maxLength={255} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                        </Campo>
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {cancelar ? (
                <Janela
                    titulo="Cancelar viagem"
                    sub={`${cancelar.nome} · ${cancelar.destino} · ${brl(cancelar.valor)}`}
                    onFechar={fecharCancelar}
                    largura="max-w-md"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharCancelar}>
                                Voltar
                            </button>
                            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void confirmarCancelar()}>
                                {salvando ? 'Aguarde…' : 'Cancelar viagem'}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <p className="text-[15px] leading-snug">A viagem sai das comissões do mês. Fica na lista como cancelada.</p>
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}
        </div>
    );
}
