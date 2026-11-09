'use client';

/**
 * Comissões do mês (/folha-comissoes) — Gestão · Folha de pagamento — 09/11/2026.
 *
 * - Agentes: base do mês (OS particulares e diferenças concluídas no mês, sem translado; a Gestão pode corrigir com
 *   justificativa) × % da faixa × nota da avaliação (/folha-avaliacao).
 * - Vendas (Breno): % sobre as OS particulares e diferenças que ele abriu. A Gestão confirma ou corrige antes de liberar.
 * - Viagens: lançadas à mão em /folha-viagens.
 * - Vales marcados para abater na comissão são descontados.
 * Situações: Aberta → Liberada (valores fixos, um título por pessoa para a Unymos) → Paga.
 * Back-end: rh_comissao.php (novo). Só a Gestão acessa.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconChevronRight, IconCoin, IconEdit, IconRefresh, IconX } from '@tabler/icons-react';
import { BOTAO_PAGINA, BOTAO_PAGINA_PRI, BOTAO_PAGINA_SEC, CartaoInfo, GRADE_CARTOES, ROTULO_SECAO, TopoPagina } from '@/components/shell/ModuloHub';

type Item = { tipo: 'AGENTE' | 'VENDAS' | 'VIAGEM'; rotulo: string; valor: number; situacao: string; motivo: string | null; viagens?: { id: number; data: string; destino: string; valor: number }[] };
type Pessoa = {
    colaborador_id: number;
    nome: string;
    nome_completo: string;
    equipe: string | null;
    forma_pagamento: 'PIX' | 'TRANSFERENCIA' | null;
    pix: string | null;
    conta: string | null;
    itens: Item[];
    vales: { id: number; data: string; valor: number; descricao: string | null }[];
    bruto: number;
    descontos: number;
    a_pagar: number;
    saldo_negativo: number;
};
type Base = {
    sistema: number;
    usada: number;
    corrigida: boolean;
    justificativa: string | null;
    qtd_os: number;
    percentual: number;
    valor_base: number;
    faixas: { ate: number | null; pct: number }[];
    multiplica_nota: boolean;
    nota_minima: number;
    sem_avaliacao: string;
    ocorrencia: string;
};
type Agente = { colaborador_id: number; nome: string; nota: number | null; valor: number; situacao: string; motivo: string | null };
type Venda = {
    colaborador_id: number;
    nome: string;
    forma: string;
    percentual: number | null;
    valor_fixo: number | null;
    qtd_os: number;
    vendas_sistema: number;
    vendas: number;
    valor: number;
    confirmada: boolean;
    justificativa: string | null;
    difere_do_sistema: boolean;
    motivo: string | null;
};
type Comissao = { id: number; competencia: string; situacao: 'ABERTA' | 'LIBERADA' | 'PAGA'; data_pagamento: string | null; liberado_em: string | null; liberado_por_nome?: string | null };
type Integracao = { id: number; favorecido: string; descricao: string; natureza: string; natureza_unymos: string | null; valor: number; vencimento: string | null; situacao: string; ref_externa: string | null };
type Totais = { agentes: number; vendas: number; viagens: number; bruto: number; vales: number; a_pagar: number; saldo_negativo: number };
type OS = { os_id: number; numero_os: string; tipo: string; data: string; valor_total: number; translado: number; valor: number; agente?: string | null };
type Aba = 'pessoas' | 'agentes' | 'vendas' | 'unymos' | 'anteriores';

const URL_API = 'https://api.planoassistencialintegrado.com.br/rh_comissao.php';
const SITUACAO: Record<string, [string, string]> = {};
const SIT_AGENTE: Record<string, string> = { A_PAGAR: 'A pagar', SEM_AVALIACAO: 'Sem avaliação', ABAIXO_MINIMO: 'Abaixo da mínima', CORTADA: 'Cortada', PAGO: 'Pago', SEM_REGRA: 'Sem regra', A_CONFIRMAR: 'A confirmar' };

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


SITUACAO.ABERTA = ['Aberta', S_AVISO];
SITUACAO.LIBERADA = ['Liberada', S_AB];
SITUACAO.PAGA = ['Paga', S_OK];

export default function ComissoesPage() {
    const [comp, setComp] = useState<string>(() => mesMais(hojeISO().slice(0, 7), -1));
    const [com, setCom] = useState<Comissao | null>(null);
    const [base, setBase] = useState<Base | null>(null);
    const [agentes, setAgentes] = useState<Agente[]>([]);
    const [vendas, setVendas] = useState<Venda[]>([]);
    const [pessoas, setPessoas] = useState<Pessoa[]>([]);
    const [totais, setTotais] = useState<Totais | null>(null);
    const [integ, setInteg] = useState<Integracao[]>([]);
    const [hist, setHist] = useState<{ competencia: string; situacao: string; data_pagamento: string | null; total: string }[]>([]);
    const [avisos, setAvisos] = useState<string[]>([]);
    const [aba, setAba] = useState<Aba>('pessoas');
    const [carregando, setCarregando] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);

    const [corrBase, setCorrBase] = useState<{ valor: string; justificativa: string } | null>(null);
    const [confVenda, setConfVenda] = useState<{ venda: Venda; valor: string; justificativa: string } | null>(null);
    const [verOS, setVerOS] = useState<{ titulo: string; lista: OS[] | null } | null>(null);
    const [passo, setPasso] = useState<{ acao: 'liberar' | 'reabrir' | 'pagar'; data: string } | null>(null);
    const [marcar, setMarcar] = useState<{ item: Integracao; ref: string } | null>(null);

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
            setCom(d.comissao || null);
            setBase(d.base || null);
            setAgentes(d.agentes || []);
            setVendas(d.vendas || []);
            setPessoas(d.pessoas || []);
            setTotais(d.totais || null);
            setInteg(d.integracao || []);
            setHist(d.historico || []);
            setAvisos(d.avisos || []);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível carregar as comissões.', setErroLista);
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

    const aberta = !com || com.situacao === 'ABERTA';
    const pendentesVenda = vendas.filter((v) => !v.confirmada && !v.motivo).length;
    const pendentesUnymos = integ.filter((i) => i.situacao === 'PENDENTE').length;
    const comValor = useMemo(() => pessoas.filter((p) => p.bruto > 0 || p.itens.some((i) => i.situacao === 'A_CONFIRMAR')), [pessoas]);
    const semValor = pessoas.length - comValor.length;

    const post = async (acao: string, corpo: Record<string, unknown>, depois?: () => void) => {
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api(URL_API, acao, corpo);
            depois?.();
            setAviso(j.msg);
            await carregar(comp);
            return true;
        } catch (e: any) {
            tratarErro(e, 'Não foi possível concluir.', setErroForm);
            return false;
        } finally {
            setSalvando(false);
        }
    };

    const abrirOS = async (titulo: string, cid?: number) => {
        setVerOS({ titulo, lista: null });
        try {
            const j = await api(URL_API, 'os', undefined, `&competencia=${comp}${cid ? `&colaborador_id=${cid}` : ''}`);
            setVerOS({ titulo, lista: j.dados?.os || [] });
        } catch (e: any) {
            setVerOS(null);
            tratarErro(e, 'Não foi possível carregar as OS.', setErroLista);
        }
    };

    const salvarBase = async (voltar = false) => {
        if (!corrBase) return;
        if (voltar) return void post('base_corrigir', { competencia: comp, valor: null }, () => setCorrBase(null));
        const v = paraNumero(corrBase.valor);
        if (v === null || Number.isNaN(v) || v < 0) return setErroForm('Informe o valor da base.');
        if (!corrBase.justificativa.trim()) return setErroForm('Informe a justificativa da correção.');
        await post('base_corrigir', { competencia: comp, valor: v, justificativa: corrBase.justificativa.trim() }, () => setCorrBase(null));
    };
    const salvarVenda = async () => {
        if (!confVenda) return;
        const v = paraNumero(confVenda.valor);
        if (v === null || Number.isNaN(v) || v < 0) return setErroForm('Informe o valor das vendas.');
        const mudou = Math.abs(v - confVenda.venda.vendas_sistema) > 0.009;
        if (mudou && !confVenda.justificativa.trim()) return setErroForm('O valor é diferente do calculado: informe a justificativa.');
        await post('vendas_confirmar', { competencia: comp, colaborador_id: confVenda.venda.colaborador_id, valor: v, justificativa: confVenda.justificativa.trim() }, () => setConfVenda(null));
    };
    const confirmarPasso = async () => {
        if (!passo) return;
        const ok = await post('situacao', { competencia: comp, acao: passo.acao, data_pagamento: passo.data || null }, () => setPasso(null));
        if (ok && passo.acao === 'liberar') setAba('unymos');
    };

    const fecharBase = useCallback(() => setCorrBase(null), []);
    const fecharVenda = useCallback(() => setConfVenda(null), []);
    const fecharOS = useCallback(() => setVerOS(null), []);
    const fecharPasso = useCallback(() => setPasso(null), []);
    const fecharMarcar = useCallback(() => setMarcar(null), []);

    const TEXTO_PASSO: Record<string, [string, string, string]> = {
        liberar: ['Liberar as comissões', 'Os valores ficam fixos, as viagens e os vales ficam presos a esta comissão e nasce um título por pessoa para lançar na Unymos.', 'Liberar'],
        reabrir: ['Reabrir as comissões', 'O cálculo volta a ser automático e os títulos ainda pendentes na Unymos são cancelados.', 'Reabrir'],
        pagar: ['Marcar como paga', 'Vales abatidos, viagens pagas e o saldo negativo de quem ficou devendo vira vale para a próxima comissão.', 'Marcar como paga'],
    };

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <div className="mb-5">
                    <TopoPagina
                        Icone={IconCoin}
                        titulo="Comissões"
                        acoes={
                            aberta ? (
                                <button type="button" className={BTN_PRI} disabled={!comValor.length} onClick={() => { setErroForm(null); setPasso({ acao: 'liberar', data: com?.data_pagamento || hojeISO() }); }}>
                                    <IconCheck size={18} /> Liberar
                                </button>
                            ) : com?.situacao === 'LIBERADA' ? (
                                <>
                                    <button type="button" className={BTN_SEC} onClick={() => { setErroForm(null); setPasso({ acao: 'reabrir', data: '' }); }}>
                                        Reabrir
                                    </button>
                                    <button type="button" className={BTN_PRI} onClick={() => { setErroForm(null); setPasso({ acao: 'pagar', data: com.data_pagamento || hojeISO() }); }}>
                                        <IconCheck size={18} /> Marcar como paga
                                    </button>
                                </>
                            ) : null
                        }
                    />
                </div>

                <Mes comp={comp} setComp={setComp} onAtualizar={() => void carregar(comp)}>
                    <span className={`${SELO} ${com ? SITUACAO[com.situacao][1] : S_MUDO}`}>{com ? SITUACAO[com.situacao][0] : 'Aberta'}</span>
                    {com?.data_pagamento ? <span className={SUB}>pagamento em {dataBR(com.data_pagamento)}</span> : null}
                    {com?.liberado_por_nome ? <span className={SUB}>· liberada por {com.liberado_por_nome}</span> : null}
                </Mes>

                {aviso ? <div className={`mb-3 rounded-xl px-4 py-3 text-[14px] font-bold ${S_OK}`}>{aviso}</div> : null}
                {erroLista ? <div className={`${ERRO} mb-3`}>{erroLista}</div> : null}

                {totais && base ? (
                    <section aria-label="Resumo" className={`mb-4 ${GRADE_CARTOES}`}>
                        <CartaoInfo rotulo="A pagar" valor={brl(totais.a_pagar)} sub={`${comValor.length} pessoa(s)`} href="#comissoes" estilo="escuro" />
                        <CartaoInfo rotulo="Agentes" valor={brl(totais.agentes)} sub={`${pctBR(base.percentual, 2)}% da base · ${brl(base.valor_base)} por nota cheia`} href="#comissoes" />
                        <CartaoInfo
                            rotulo="Vendas"
                            valor={brl(totais.vendas)}
                            sub={pendentesVenda ? `${pendentesVenda} a confirmar` : 'confirmadas'}
                            href="#comissoes"
                            estilo={pendentesVenda ? 'alerta' : undefined}
                        />
                        <CartaoInfo rotulo="Viagens e vales" valor={brl(totais.viagens)} sub={totais.vales ? `viagens · vales abatidos −${brl(totais.vales)}` : 'viagens do mês'} href="#comissoes" />
                    </section>
                ) : null}

                {/* base */}
                {base ? (
                    <section className={`${CARTAO} mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center`}>
                        <div className="min-w-0 flex-1">
                            <div className={ROTULO_SECAO}>Base dos agentes · OS particulares e diferenças sem translado</div>
                            <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                                <b className="text-[22px] tabular-nums">{brl(base.usada)}</b>
                                {base.corrigida ? <span className={`${SELO} ${S_AVISO}`}>corrigida · sistema {brl(base.sistema)}</span> : <span className={SUB}>{base.qtd_os} OS concluídas no mês</span>}
                            </div>
                            {base.corrigida && base.justificativa ? <div className={SUB}>Justificativa: {base.justificativa}</div> : null}
                            <div className={`${SUB} mt-1`}>
                                Faixas: {base.faixas.map((f) => `${f.ate === null ? 'acima' : `até ${brl(f.ate)}`}: ${pctBR(f.pct, 2)}%`).join(' · ')}
                                {base.multiplica_nota ? ' · multiplicado pela nota da avaliação' : ''}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={BTN_PEQ} onClick={() => void abrirOS('OS da base do mês')}>
                                Ver OS
                            </button>
                            {aberta ? (
                                <button
                                    type="button"
                                    className={BTN_PEQ}
                                    onClick={() => {
                                        setErroForm(null);
                                        setCorrBase({ valor: base.usada.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), justificativa: base.justificativa || '' });
                                    }}
                                >
                                    <IconEdit size={16} /> Corrigir
                                </button>
                            ) : null}
                        </div>
                    </section>
                ) : null}

                {avisos.length ? (
                    <div className={`${NOTA} mb-3`}>
                        <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                        <span>{avisos.join(' ')}</span>
                    </div>
                ) : null}

                <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-[#E3E8F0] [scrollbar-width:none] dark:border-white/[0.08]">
                    {(
                        [
                            ['pessoas', 'A pagar'],
                            ['agentes', 'Agentes'],
                            ['vendas', `Vendas${pendentesVenda ? ` · ${pendentesVenda}` : ''}`],
                            ['unymos', `Lançar na Unymos${pendentesUnymos ? ` · ${pendentesUnymos}` : ''}`],
                            ['anteriores', 'Anteriores'],
                        ] as [Aba, string][]
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

                <div id="comissoes">
                    {carregando ? <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478]`}>Carregando…</div> : null}

                    {/* ---------- a pagar por pessoa ---------- */}
                    {!carregando && aba === 'pessoas' ? (
                        <div className="flex flex-col gap-3">
                            {!comValor.length ? <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]`}>Nenhuma comissão a pagar neste mês.</div> : null}
                            {comValor.map((p) => (
                                <section key={p.colaborador_id} className={`${CARTAO} flex flex-col gap-2 p-4`}>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <b className="w-full min-w-0 break-words text-[15.5px] sm:w-auto sm:flex-1">{p.nome}</b>
                                        {p.forma_pagamento ? <span className={`${SELO} ${S_MUDO}`}>{p.forma_pagamento === 'PIX' ? `Pix · ${p.pix || 'sem chave'}` : p.conta || 'conta não cadastrada'}</span> : <span className={`${SELO} ${S_AVISO}`}>Sem forma de pagamento</span>}
                                        <b className="ml-auto text-[18px] tabular-nums">{brl(p.a_pagar)}</b>
                                    </div>
                                    <div className="flex flex-col text-[14px]">
                                        {p.itens.map((i, k) => (
                                            <div key={k} className="flex items-baseline gap-3 border-t border-[#E3E8F0] py-1.5 first:border-t-0 dark:border-white/[0.08]">
                                                <span className="min-w-0 flex-1">
                                                    {i.rotulo}
                                                    {i.motivo ? <span className={`block ${SUB}`}>{i.motivo}</span> : null}
                                                    {i.viagens ? <span className={`block ${SUB}`}>{i.viagens.map((v) => `${dataBR(v.data)} ${v.destino} ${brl(v.valor)}`).join(' · ')}</span> : null}
                                                </span>
                                                {i.situacao !== 'A_PAGAR' && i.situacao !== 'PAGO' ? <span className={`${SELO} ${i.situacao === 'A_CONFIRMAR' ? S_AVISO : S_RUIM}`}>{SIT_AGENTE[i.situacao] || i.situacao}</span> : null}
                                                <span className={`tabular-nums ${i.situacao === 'A_CONFIRMAR' ? 'text-[#98A1B3]' : ''}`}>{brl(i.valor)}</span>
                                            </div>
                                        ))}
                                        {p.vales.map((v) => (
                                            <div key={`v${v.id}`} className="flex items-baseline gap-3 border-t border-[#E3E8F0] py-1.5 dark:border-white/[0.08]">
                                                <span className="min-w-0 flex-1">
                                                    Vale de {dataBR(v.data)}
                                                    {v.descricao ? ` · ${v.descricao}` : ''}
                                                </span>
                                                <span className="tabular-nums text-[#B42318] dark:text-[#FF9C92]">−{brl(v.valor)}</span>
                                            </div>
                                        ))}
                                        {p.saldo_negativo ? <div className={`mt-1 rounded-lg px-2 py-1.5 text-[13px] ${S_AVISO}`}>Os vales passam da comissão: {brl(p.saldo_negativo)} vão como vale para a próxima comissão quando esta for paga.</div> : null}
                                    </div>
                                </section>
                            ))}
                            {semValor ? <div className={SUB}>{semValor} agente(s) sem comissão neste mês: veja a aba Agentes.</div> : null}
                        </div>
                    ) : null}

                    {/* ---------- agentes ---------- */}
                    {!carregando && aba === 'agentes' ? (
                        <div className={`${CARTAO} overflow-hidden`}>
                            {base ? (
                                <div className={`${NOTA} m-3`}>
                                    <span>
                                        Cada agente recebe {brl(base.valor_base)} × a nota do mês. Nota mínima {base.nota_minima}. Sem avaliação: {base.sem_avaliacao === 'NOTA_ANTERIOR' ? 'usa a nota do mês anterior' : 'não recebe'}. Ocorrência grave:{' '}
                                        {base.ocorrencia === 'METADE' ? 'metade' : 'corta'}.{' '}
                                        <a href="/folha-avaliacao" className="font-extrabold underline">
                                            Abrir a avaliação
                                        </a>
                                    </span>
                                </div>
                            ) : null}
                            {!agentes.length ? <div className="p-6 text-center text-[14px] text-[#5B6478]">Ninguém com a regra &quot;Comissão por faturamento&quot; neste mês.</div> : null}
                            {agentes.map((a) => (
                                <div key={a.colaborador_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E3E8F0] px-4 py-3 text-[14px] dark:border-white/[0.08]">
                                    <span className="min-w-[160px] flex-1">
                                        <b className="block">{a.nome}</b>
                                        {a.motivo ? <span className={`block ${SUB}`}>{a.motivo}</span> : null}
                                    </span>
                                    <span className="w-24 text-right tabular-nums">
                                        <span className={`block ${SUB}`}>nota</span>
                                        {pctBR(a.nota)}
                                    </span>
                                    <span className={`${SELO} ${a.situacao === 'A_PAGAR' || a.situacao === 'PAGO' ? S_OK : S_RUIM}`}>{SIT_AGENTE[a.situacao] || a.situacao}</span>
                                    <b className="w-28 text-right tabular-nums">{brl(a.valor)}</b>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {/* ---------- vendas ---------- */}
                    {!carregando && aba === 'vendas' ? (
                        <div className="flex flex-col gap-3">
                            {!vendas.length ? <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478]`}>Ninguém com a regra &quot;Comissão de vendas&quot; neste mês.</div> : null}
                            {vendas.map((v) => (
                                <section key={v.colaborador_id} className={`${CARTAO} flex flex-col gap-2 p-4`}>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <b className="min-w-0 flex-1 text-[15.5px]">{v.nome}</b>
                                        <span className={`${SELO} ${v.confirmada ? S_OK : v.motivo ? S_RUIM : S_AVISO}`}>{v.confirmada ? 'Confirmada' : v.motivo ? 'Sem cálculo' : 'A confirmar'}</span>
                                    </div>
                                    <div className="grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-3">
                                        <span>
                                            <span className={SUB}>Vendas no sistema</span>
                                            <b className="block tabular-nums">
                                                {brl(v.vendas_sistema)} <span className={`font-normal ${SUB}`}>({v.qtd_os} OS)</span>
                                            </b>
                                        </span>
                                        <span>
                                            <span className={SUB}>Vendas usadas</span>
                                            <b className="block tabular-nums">{brl(v.vendas)}</b>
                                        </span>
                                        <span>
                                            <span className={SUB}>Comissão {v.forma === 'PERCENTUAL' && v.percentual !== null ? `(${pctBR(v.percentual, 2)}%)` : ''}</span>
                                            <b className="block tabular-nums">{brl(v.valor)}</b>
                                        </span>
                                    </div>
                                    {v.motivo ? <div className={`${NOTA} ${S_AVISO}`}>{v.motivo}</div> : null}
                                    {v.justificativa ? <div className={SUB}>{v.justificativa}</div> : null}
                                    {v.difere_do_sistema ? <div className={`${NOTA} ${S_AVISO}`}>As OS mudaram depois da confirmação: o sistema agora calcula {brl(v.vendas_sistema)}. Confirme de novo.</div> : null}
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" className={BTN_PEQ} onClick={() => void abrirOS(`Vendas de ${v.nome}`, v.colaborador_id)}>
                                            Ver OS
                                        </button>
                                        {aberta && !v.motivo ? (
                                            <button
                                                type="button"
                                                className={BTN_PEQ}
                                                onClick={() => {
                                                    setErroForm(null);
                                                    setConfVenda({ venda: v, valor: v.vendas_sistema.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), justificativa: '' });
                                                }}
                                            >
                                                <IconCheck size={16} /> {v.confirmada ? 'Confirmar de novo' : 'Confirmar ou corrigir'}
                                            </button>
                                        ) : null}
                                        {aberta && v.confirmada ? (
                                            <button type="button" className={BTN_PEQ} disabled={salvando} onClick={() => void post('vendas_desfazer', { competencia: comp, colaborador_id: v.colaborador_id })}>
                                                Desfazer confirmação
                                            </button>
                                        ) : null}
                                    </div>
                                </section>
                            ))}
                        </div>
                    ) : null}

                    {/* ---------- Unymos ---------- */}
                    {!carregando && aba === 'unymos' ? (
                        <div className="flex flex-col gap-3">
                            <div className={NOTA}>
                                <span>Depois de liberar, lance cada título no contas a pagar da Unymos (fornecedor de cada pessoa) e marque como lançado.</span>
                            </div>
                            {!integ.length ? <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]`}>Os títulos aparecem aqui quando as comissões forem liberadas.</div> : null}
                            {integ.map((i) => (
                                <section key={i.id} className={`${CARTAO} flex flex-col gap-2 p-4`}>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <b className="min-w-0 flex-1 break-words text-[15px]">{i.descricao}</b>
                                        <span className={`${SELO} ${i.situacao === 'PENDENTE' ? S_AVISO : S_OK}`}>{i.situacao === 'PENDENTE' ? 'Pendente' : 'Lançado na Unymos'}</span>
                                    </div>
                                    <div className="grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2">
                                        <span>
                                            <span className={SUB}>Valor:</span> <b className="tabular-nums">{brl(i.valor)}</b>
                                        </span>
                                        <span>
                                            <span className={SUB}>Vencimento:</span> {dataBR(i.vencimento) || 'a definir'}
                                        </span>
                                        <span>
                                            <span className={SUB}>Fornecedor:</span> {i.favorecido}
                                        </span>
                                        <span>
                                            <span className={SUB}>Natureza na Unymos:</span> {i.natureza_unymos || i.natureza}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {i.situacao === 'PENDENTE' ? (
                                            <button type="button" className={BTN_PEQ} onClick={() => { setErroForm(null); setMarcar({ item: i, ref: '' }); }}>
                                                <IconCheck size={16} /> Marcar lançado
                                            </button>
                                        ) : (
                                            <button type="button" className={BTN_PEQ} disabled={salvando} onClick={() => void post('integracao_marcar', { id: i.id, lancado: false })}>
                                                Voltar para pendente
                                            </button>
                                        )}
                                        {i.ref_externa ? <span className={`self-center ${SUB}`}>título na Unymos: {i.ref_externa}</span> : null}
                                    </div>
                                </section>
                            ))}
                        </div>
                    ) : null}

                    {/* ---------- anteriores ---------- */}
                    {!carregando && aba === 'anteriores' ? (
                        <div className={`${CARTAO} overflow-hidden`}>
                            {!hist.length ? <div className="p-6 text-center text-[14px] text-[#5B6478]">Nenhuma comissão liberada ainda.</div> : null}
                            {hist.map((h) => (
                                <button
                                    key={h.competencia}
                                    type="button"
                                    onClick={() => {
                                        setComp(h.competencia);
                                        setAba('pessoas');
                                    }}
                                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E3E8F0] px-4 py-3 text-left text-[14px] first:border-t-0 hover:bg-[#F6F8FB] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                                >
                                    <b className="min-w-[170px] flex-1">{mesBR(h.competencia)}</b>
                                    <span className={`${SELO} ${SITUACAO[h.situacao]?.[1] || S_MUDO}`}>{SITUACAO[h.situacao]?.[0] || h.situacao}</span>
                                    <span className={`w-28 ${SUB}`}>{h.data_pagamento ? `pagamento ${dataBR(h.data_pagamento)}` : ''}</span>
                                    <b className="w-32 text-right tabular-nums">{brl(h.total)}</b>
                                    <IconChevronRight size={18} className="text-[#7A8396]" />
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>

            {/* ---------- corrigir base ---------- */}
            {corrBase && base ? (
                <Janela
                    titulo="Corrigir a base"
                    sub={`${mesBR(comp)} · sistema ${brl(base.sistema)}`}
                    onFechar={fecharBase}
                    largura="max-w-md"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharBase}>
                                Voltar
                            </button>
                            {base.corrigida ? (
                                <button type="button" className={BTN_SEC} disabled={salvando} onClick={() => void salvarBase(true)}>
                                    Usar o do sistema
                                </button>
                            ) : null}
                            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvarBase()}>
                                {salvando ? 'Salvando…' : 'Salvar'}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <Campo rotulo="Base do mês">
                            <input className={CAMPO} inputMode="decimal" value={corrBase.valor} onChange={(e) => setCorrBase({ ...corrBase, valor: e.target.value })} />
                        </Campo>
                        <Campo rotulo="Justificativa">
                            <input className={CAMPO} maxLength={255} placeholder="Ex.: OS em papel que não está no app" value={corrBase.justificativa} onChange={(e) => setCorrBase({ ...corrBase, justificativa: e.target.value })} />
                        </Campo>
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {/* ---------- confirmar vendas ---------- */}
            {confVenda ? (
                <Janela
                    titulo={`Vendas de ${confVenda.venda.nome}`}
                    sub={`${mesBR(comp)} · sistema ${brl(confVenda.venda.vendas_sistema)} (${confVenda.venda.qtd_os} OS)`}
                    onFechar={fecharVenda}
                    largura="max-w-md"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharVenda}>
                                Voltar
                            </button>
                            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvarVenda()}>
                                {salvando ? 'Salvando…' : 'Confirmar'}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <div className={NOTA}>
                            <span>Confira as OS (particulares e diferenças que ele abriu, concluídas no mês, sem translado). Se o valor estiver certo, só confirme; se mudar, diga o motivo.</span>
                        </div>
                        <Campo rotulo="Vendas do mês">
                            <input className={CAMPO} inputMode="decimal" value={confVenda.valor} onChange={(e) => setConfVenda({ ...confVenda, valor: e.target.value })} />
                        </Campo>
                        {(() => {
                            const v = paraNumero(confVenda.valor);
                            const mudou = v !== null && !Number.isNaN(v) && Math.abs(v - confVenda.venda.vendas_sistema) > 0.009;
                            return (
                                <>
                                    {mudou ? (
                                        <Campo rotulo="Justificativa da correção">
                                            <input className={CAMPO} maxLength={200} value={confVenda.justificativa} onChange={(e) => setConfVenda({ ...confVenda, justificativa: e.target.value })} />
                                        </Campo>
                                    ) : null}
                                    {v !== null && !Number.isNaN(v) && confVenda.venda.forma === 'PERCENTUAL' && confVenda.venda.percentual !== null ? (
                                        <div className={SUB}>
                                            Comissão: {brl(v)} × {pctBR(confVenda.venda.percentual, 2)}% = <b>{brl(Math.round(v * confVenda.venda.percentual) / 100)}</b>
                                        </div>
                                    ) : null}
                                </>
                            );
                        })()}
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {/* ---------- lista de OS ---------- */}
            {verOS ? (
                <Janela titulo={verOS.titulo} sub={mesBR(comp)} onFechar={fecharOS} largura="max-w-3xl">
                    {!verOS.lista ? (
                        <div className="text-[14px] text-[#5B6478]">Carregando…</div>
                    ) : !verOS.lista.length ? (
                        <div className="text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Nenhuma OS concluída no mês.</div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                            {verOS.lista.map((o) => (
                                <div key={o.os_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-[#E3E8F0] px-3 py-2 text-[13.5px] first:border-t-0 dark:border-white/[0.08]">
                                    <span className="w-20 tabular-nums">{dataBR(o.data)}</span>
                                    <span className="min-w-[140px] flex-1">
                                        <b>{o.numero_os}</b> · {o.tipo}
                                        {o.agente ? <span className={`block ${SUB}`}>{o.agente}</span> : null}
                                    </span>
                                    {o.translado ? <span className={SUB}>translado −{brl(o.translado)}</span> : null}
                                    <b className="w-28 text-right tabular-nums">{brl(o.valor)}</b>
                                </div>
                            ))}
                            <div className="flex justify-between border-t-2 border-[#C9D1DE] bg-[#F6F8FB] px-3 py-2 text-[14px] font-extrabold tabular-nums dark:border-white/[0.2] dark:bg-[#1C2334]">
                                <span>Total</span>
                                <span>{brl(verOS.lista.reduce((s, o) => s + o.valor, 0))}</span>
                            </div>
                        </div>
                    )}
                </Janela>
            ) : null}

            {/* ---------- passos ---------- */}
            {passo ? (
                <Janela
                    titulo={TEXTO_PASSO[passo.acao][0]}
                    sub={mesBR(comp)}
                    onFechar={fecharPasso}
                    largura="max-w-md"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharPasso}>
                                Voltar
                            </button>
                            <button type="button" className={BTN_PRI} disabled={salvando || (passo.acao !== 'reabrir' && !passo.data)} onClick={() => void confirmarPasso()}>
                                {salvando ? 'Aguarde…' : TEXTO_PASSO[passo.acao][2]}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <p className="text-[15px] leading-snug">{TEXTO_PASSO[passo.acao][1]}</p>
                        {passo.acao !== 'reabrir' ? (
                            <Campo rotulo="Data do pagamento" ajuda={passo.acao === 'liberar' ? 'Vales com data a partir deste dia ficam para a próxima comissão.' : undefined}>
                                <input type="date" className={CAMPO} value={passo.data} onChange={(e) => setPasso({ ...passo, data: e.target.value })} />
                            </Campo>
                        ) : null}
                        {passo.acao === 'liberar' && pendentesVenda ? (
                            <div className={`${NOTA} ${S_AVISO}`}>
                                <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <span>Falta confirmar as vendas (aba Vendas).</span>
                            </div>
                        ) : null}
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {/* ---------- marcar lançado ---------- */}
            {marcar ? (
                <Janela
                    titulo="Marcar lançado na Unymos"
                    sub={marcar.item.descricao}
                    onFechar={fecharMarcar}
                    largura="max-w-md"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharMarcar}>
                                Voltar
                            </button>
                            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void post('integracao_marcar', { id: marcar.item.id, lancado: true, ref_externa: marcar.ref.trim() }, () => setMarcar(null))}>
                                Marcar lançado
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <Campo rotulo="Número do título na Unymos (opcional)">
                            <input className={CAMPO} maxLength={40} value={marcar.ref} onChange={(e) => setMarcar({ ...marcar, ref: e.target.value })} />
                        </Campo>
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}
        </div>
    );
}
