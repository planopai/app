'use client';

/**
 * Tesouraria (/tesouraria) — Financeiro da empresa, etapa 2 — 12/11/2026. Back-end: fin_tesouraria.php e fin_bancos.php.
 * Página "tesouraria" do pai_api.php: a Gestão vê tudo; os demais entram pelas Permissões e só veem as contas liberadas
 * em "Quem vê cada conta" (vê ou vê e movimenta).
 * Saldos e movimento por conta, caixas (só dinheiro em espécie no saldo; Pix e cartão aparecem para conferência),
 * entregas entre caixas com aceite, fechamento às cegas, aprovações, conciliação bancária e conferência da fatura.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    IconAlertTriangle,
    IconArrowBackUp,
    IconArrowsExchange,
    IconBuildingBank,
    IconCheck,
    IconLock,
    IconLockOpen,
    IconPaperclip,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSettings,
    IconUpload,
    IconX,
} from '@tabler/icons-react';
import { GRADE_CARTOES, TopoPagina } from '@/components/shell/ModuloHub';
import {
    api,
    BotaoArquivo,
    brl,
    BTN_PEQ,
    BTN_PEQ_PRI,
    BTN_PRI,
    BTN_SEC,
    CAMPO,
    CAMPO_P,
    CARTAO,
    dataBR,
    diaMes,
    ERRO,
    hojeISO,
    Janela,
    mensagemErro,
    NOTA,
    numCampo,
    opcoesArea,
    paraNumero,
    PILULA,
    ROTULO,
    S_AB,
    S_AVISO,
    S_MUDO,
    S_OK,
    S_RUIM,
    SelectNatureza,
    SELO,
    SessaoExpirada,
    SUB,
    useAviso,
    type Cadastros,
} from '../contas-pagar/components/fin';

const URL_TES = 'https://api.planoassistencialintegrado.com.br/fin_tesouraria.php';
const URL_BANCOS = 'https://api.planoassistencialintegrado.com.br/fin_bancos.php';

/* ============================== tipos ============================== */

type Nivel = 'M' | 'V';
type ContaP = { id: number; nome: string; tipo: string; banco: string | null; saldo: number; nivel: Nivel; conciliado_ate?: string | null; a_conciliar?: number };
type CaixaP = {
    conta_id: number;
    nome: string;
    modo: 'DIARIO' | 'CONTINUO' | 'LIVRE';
    fechamento_auto: string | null;
    troco_minimo: number | null;
    nivel: Nivel;
    situacao: 'ABERTO' | 'CONFERENCIA_PENDENTE' | 'FECHADO';
    aberto_em: string | null;
    aberto_por: string | null;
    contado: boolean;
    anterior: number;
    entradas: number;
    saidas: number;
    gaveta: number;
    pix_cartao: number;
    movimentos: number;
    a_aceitar: number;
    n_a_aceitar: number;
    quem_ve: { nome: string; nivel: 'VE' | 'MOVIMENTA' }[];
    ultimo_fechamento: { em: string; por: string | null; diferenca: number } | null;
};
type Transf = {
    id: number;
    tipo: string;
    data: string;
    de_id: number;
    de: string;
    para_id: number;
    para: string;
    valor: number;
    situacao: 'TRANSITO' | 'CONFIRMADA' | 'RECUSADA' | 'CANCELADA';
    observacao: string | null;
    quem: string | null;
    decidido_por: string | null;
    recusa_motivo: string | null;
    pode_aceitar: boolean;
    comprovantes: number;
};
type MovP = { conta_id: number; nome: string; tipo: string; anterior: number; rec: number; pag: number; te: number; ts: number; pix_cartao: number; final: number };
type Painel = {
    hoje: string;
    de: string;
    ate: string;
    gestao: boolean;
    eu: string;
    contas: ContaP[];
    resumo: Record<string, number>;
    caixas: CaixaP[];
    transferencias: Transf[];
    movimento: MovP[];
    pendencias: { aprovacoes: number; a_conciliar: number };
};
type Linha = {
    id: number | null;
    data: string;
    hora: string;
    tipo: 'REC' | 'PAG' | 'TE' | 'TS';
    valor: number;
    especie: number;
    origem: string;
    forma: string | null;
    descricao: string;
    natureza: string | null;
    referencia: string | null;
    usuario: string | null;
    estorno_de: number | null;
    anexos: number;
    estornado: boolean;
    pedido: string | null;
};
type DadosConta = {
    conta: { id: number; nome: string; tipo: string; nivel: Nivel };
    linhas: Linha[];
    resumo: { anterior: number; rec: number; pag: number; te: number; ts: number; pix_cartao: number; final: number };
    sessao?: { id: number; situacao: string; aberto_em: string; aberto_por: string | null; saldo_abertura: number; contado: boolean } | null;
    a_aceitar?: Transf[];
};
type Cad = { naturezas: Cadastros['naturezas']; areas: Cadastros['areas']; locais: { id: number; nome: string; ativo: boolean }[]; cartoes: { id: number; nome: string }[] };

type Aba = 'saldos' | 'caixas' | 'transf' | 'conc' | 'fatura' | 'aprov' | 'acessos';

const TIPO_GRUPO: [string, string][] = [
    ['BANCO', 'Bancos'],
    ['APLICACAO', 'Aplicações'],
    ['CAIXA', 'Caixas'],
    ['OUTRO', 'Link de pagamento e bonificação'],
];
const TRANSF_NOME: Record<string, string> = { ENTREGA: 'Entrega', SANGRIA: 'Sangria', DEPOSITO: 'Depósito', TRANSFERENCIA: 'Transferência', APLICACAO: 'Aplicação', RESGATE: 'Resgate' };
const ORIGEM_NOME: Record<string, string> = {
    PLANO: 'Baixa no Plano',
    OS: 'Baixa na OS',
    DESPESA: 'Despesa pelo caixa',
    ENTREGA: 'Entrega entre caixas',
    RECEBIDO: 'Recebido de outra conta',
    DEVOLVIDO: 'Entrega recusada',
    SANGRIA: 'Sangria',
    DEPOSITO: 'Depósito',
    ESTORNO: 'Estorno',
    DIFERENCA: 'Diferença de caixa',
    CONTAS: 'Contas a pagar/receber',
};

/** Envio de arquivo (multipart) com o mesmo tratamento de erro do api(). */
async function enviarArquivo(url: string, acao: string, campos: Record<string, string>, arquivo: File) {
    const fd = new FormData();
    Object.entries(campos).forEach(([k, v]) => fd.append(k, v));
    fd.append('arquivo', arquivo);
    const r = await fetch(`${url}?action=${acao}`, { method: 'POST', credentials: 'include', body: fd });
    if (r.status === 401) throw new SessaoExpirada('Sessão expirada.');
    let j: any = null;
    try {
        j = JSON.parse((await r.text()).replace(/^﻿/, '').trim());
    } catch {
        /* segue */
    }
    if (j?.need_login) throw new SessaoExpirada('Sessão expirada.');
    if (!j) throw new Error('O servidor não respondeu como esperado. Tente de novo.');
    if (j.erro) throw new Error(j.msg || 'Não foi possível concluir.');
    return j;
}

const urlAnexoTes = (id: number) => `${URL_TES}?action=anexo&id=${id}`;
const sinal = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + brl(Math.abs(v));
const corValor = (v: number, especie = 1) => (!especie ? 'text-[#5B6478] dark:text-[#AEB9CF]' : v < 0 ? 'text-[#B42318] dark:text-[#FF9C92]' : 'text-[#3F5A0A] dark:text-[#CFE38A]');
const hora = (dt?: string | null) => (dt ? dt.slice(11, 16) : '');

function situacaoCaixa(c: CaixaP): { txt: string; cls: string } {
    if (c.modo === 'LIVRE') return { txt: 'Tesouraria', cls: S_AB };
    if (c.modo === 'CONTINUO') return { txt: 'Contínuo', cls: S_AB };
    if (c.situacao === 'ABERTO') return { txt: 'Aberto', cls: S_OK };
    if (c.situacao === 'CONFERENCIA_PENDENTE') return { txt: 'Conferência pendente', cls: S_AVISO };
    return { txt: 'Fechado', cls: S_MUDO };
}

/* ============================== página ============================== */

export default function TesourariaPage() {
    const [d, setD] = useState<Painel | null>(null);
    const [cad, setCad] = useState<Cad | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [aba, setAba] = useState<Aba>('saldos');
    const [de, setDe] = useState(() => hojeISO().slice(0, 8) + '01');
    const [ate, setAte] = useState(hojeISO);
    const [conta, setConta] = useState<number | null>(null);
    const [transf, setTransf] = useState(false);
    const { avisar, aviso } = useAviso();

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const j = await api(URL_TES, 'painel', undefined, `&de=${de}&ate=${ate}`);
            setD(j.dados);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar a Tesouraria.');
            if (m) setErro(m);
        } finally {
            setCarregando(false);
        }
    }, [de, ate]);
    useEffect(() => {
        void carregar();
    }, [carregar]);
    useEffect(() => {
        api(URL_TES, 'cadastros')
            .then((j) => setCad(j.dados))
            .catch(() => undefined);
    }, []);

    const gestao = !!d?.gestao;
    const abas: [Aba, string, number?][] = [
        ['saldos', 'Saldos'],
        ['caixas', 'Caixas'],
        ['transf', 'Transferências', d?.transferencias.filter((t) => t.situacao === 'TRANSITO').length],
        ...(gestao
            ? ([
                  ['conc', 'Conciliação bancária', d?.pendencias.a_conciliar],
                  ['fatura', 'Conferência da fatura'],
                  ['aprov', 'Aprovações', d?.pendencias.aprovacoes],
                  ['acessos', 'Quem vê cada conta'],
              ] as [Aba, string, number?][])
            : []),
    ];

    const r = d?.resumo || {};
    const feito = (msg?: string) => {
        if (msg) avisar(msg);
        void carregar();
    };

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina
                    Icone={IconBuildingBank}
                    titulo="Tesouraria"
                    acoes={
                        <>
                            <button type="button" className={BTN_SEC} onClick={() => void carregar()}>
                                <IconRefresh size={18} /> Atualizar
                            </button>
                            {gestao ? (
                                <button type="button" className={BTN_PRI} onClick={() => setTransf(true)}>
                                    <IconArrowsExchange size={18} /> Transferência
                                </button>
                            ) : null}
                        </>
                    }
                />

                {erro ? <div className={ERRO}>{erro}</div> : null}

                {d ? (
                    <div className={GRADE_CARTOES}>
                        {gestao ? (
                            <>
                                <Resumo rotulo="Disponível em bancos" valor={r.BANCO ?? 0} sub="contas correntes" escuro />
                                <Resumo rotulo="Aplicações" valor={r.APLICACAO ?? 0} sub="rendendo nos bancos" />
                            </>
                        ) : null}
                        <Resumo rotulo="Dinheiro nos caixas" valor={r.CAIXA ?? 0} sub="só espécie, sem Pix e cartão" />
                        {gestao ? (
                            <button type="button" onClick={() => setAba('conc')} className="flex min-w-0 flex-col gap-1 rounded-[18px] border border-[#E3E8F0] bg-white p-4 text-left dark:border-white/[0.12] dark:bg-[#232B3F] lg:px-5 lg:py-[18px]">
                                <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">A conciliar</span>
                                <span className={`text-[21px] font-extrabold leading-tight tabular-nums sm:text-[26px] ${d.pendencias.a_conciliar ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}`}>{d.pendencias.a_conciliar}</span>
                                <span className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">linha(s) do extrato</span>
                            </button>
                        ) : null}
                    </div>
                ) : null}

                <div className="flex flex-wrap gap-2" role="tablist">
                    {abas.map(([k, t, n]) => (
                        <button key={k} type="button" role="tab" aria-selected={aba === k} className={PILULA(aba === k)} onClick={() => setAba(k)}>
                            {t}
                            {n ? <span className={`ml-2 rounded-full px-1.5 text-[12px] ${aba === k ? 'bg-white/20' : 'bg-[#FCF3CC] text-[#7A5D00]'}`}>{n}</span> : null}
                        </button>
                    ))}
                </div>

                {carregando && !d ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Carregando…</div> : null}

                {d && aba === 'saldos' ? <AbaSaldos d={d} de={de} ate={ate} setDe={setDe} setAte={setAte} abrirConta={setConta} /> : null}
                {d && aba === 'caixas' ? <AbaCaixas d={d} abrirConta={setConta} /> : null}
                {d && aba === 'transf' ? <AbaTransf d={d} feito={feito} /> : null}
                {d && gestao && aba === 'conc' ? <AbaConciliacao d={d} cad={cad} feito={feito} /> : null}
                {d && gestao && aba === 'fatura' ? <AbaFatura cad={cad} avisar={avisar} /> : null}
                {d && gestao && aba === 'aprov' ? <AbaAprovacoes feito={feito} /> : null}
                {d && gestao && aba === 'acessos' ? <AbaAcessos avisar={avisar} /> : null}
            </div>

            {conta && d ? <ModalConta contaId={conta} painel={d} cad={cad} onFechar={() => setConta(null)} feito={feito} /> : null}
            {transf && d ? <ModalTransferencia d={d} onFechar={() => setTransf(false)} feito={feito} /> : null}
            {aviso}
        </div>
    );
}

function Resumo({ rotulo, valor, sub, escuro = false }: { rotulo: string; valor: number; sub: string; escuro?: boolean }) {
    return (
        <div
            className={`flex min-w-0 flex-col gap-1 rounded-[18px] border p-4 lg:px-5 lg:py-[18px] ${
                escuro ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]' : 'border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]'
            }`}
        >
            <span className={`text-[12px] font-extrabold uppercase tracking-[0.08em] ${escuro ? 'text-[#D6DCE8]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>{rotulo}</span>
            <span className={`text-[21px] font-extrabold leading-tight tabular-nums sm:text-[26px] ${valor < 0 && !escuro ? 'text-[#B42318]' : ''}`}>{brl(valor)}</span>
            <span className={`text-[12.5px] ${escuro ? 'text-[#D6DCE8]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>{sub}</span>
        </div>
    );
}

/* ============================== Saldos ============================== */

function AbaSaldos({ d, de, ate, setDe, setAte, abrirConta }: { d: Painel; de: string; ate: string; setDe: (s: string) => void; setAte: (s: string) => void; abrirConta: (id: number) => void }) {
    const grupos = TIPO_GRUPO.map(([tp, nome]) => {
        const itens = d.contas.filter((c) => (tp === 'OUTRO' ? !['BANCO', 'APLICACAO', 'CAIXA'].includes(c.tipo) : c.tipo === tp));
        return { tp, nome, itens, total: itens.reduce((s, c) => s + c.saldo, 0) };
    }).filter((g) => g.itens.length);
    const movGrupos = TIPO_GRUPO.map(([tp, nome]) => ({ nome, itens: d.movimento.filter((m) => (tp === 'OUTRO' ? !['BANCO', 'APLICACAO', 'CAIXA'].includes(m.tipo) : m.tipo === tp)) })).filter((g) => g.itens.length);
    const soma = (its: MovP[], k: keyof MovP) => its.reduce((s, m) => s + Number(m[k]), 0);
    return (
        <>
            {grupos.map((g) => (
                <section key={g.tp} className="flex flex-col gap-2.5">
                    <div className="flex items-baseline gap-2 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                        {g.nome}
                        <span className="ml-auto tabular-nums">{brl(g.total)}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {g.itens.map((c) => (
                            <button key={c.id} type="button" onClick={() => abrirConta(c.id)} className={`${CARTAO} flex min-w-0 flex-col gap-1 p-4 text-left hover:border-[#C9D1DE]`}>
                                <span className="text-[15px] font-extrabold">{c.nome}</span>
                                <span className={`text-[22px] font-extrabold tabular-nums ${c.saldo < 0 ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}`}>{brl(c.saldo)}</span>
                                <span className={SUB}>
                                    {c.tipo === 'BANCO'
                                        ? c.a_conciliar
                                            ? `${c.a_conciliar} linha(s) do extrato para conciliar`
                                            : c.conciliado_ate
                                              ? `Conciliado até ${dataBR(c.conciliado_ate)}`
                                              : 'Sem extrato ainda'
                                        : c.nivel === 'V'
                                          ? 'Você só vê esta conta'
                                          : 'Ver movimento'}
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            ))}

            <section className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-end gap-2">
                    <div className="mr-auto text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">Movimento por conta</div>
                    <label className="w-[46%] sm:w-44">
                        <span className={ROTULO}>De</span>
                        <input type="date" className={CAMPO_P} value={de} onChange={(e) => e.target.value && setDe(e.target.value)} />
                    </label>
                    <label className="w-[46%] sm:w-44">
                        <span className={ROTULO}>Até</span>
                        <input type="date" className={CAMPO_P} value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} />
                    </label>
                </div>
                <div className={`${CARTAO} overflow-x-auto`}>
                    <div className="min-w-[860px]">
                        <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))] gap-3 bg-[#F6F8FB] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                            <span>Conta</span>
                            <span className="text-right">Saldo anterior</span>
                            <span className="text-right">(+) Recebimentos</span>
                            <span className="text-right">(−) Pagamentos</span>
                            <span className="text-right">(+) Transf. entrada</span>
                            <span className="text-right">(−) Transf. saída</span>
                            <span className="text-right">(=) Saldo final</span>
                        </div>
                        {movGrupos.map((g) => (
                            <div key={g.nome}>
                                <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))] gap-3 border-t border-[#E3E8F0] bg-[#FBFCFE] px-4 py-2.5 text-[14px] font-extrabold tabular-nums dark:border-white/[0.08] dark:bg-white/[0.03]">
                                    <span>{g.nome}</span>
                                    <span className="text-right">{brl(soma(g.itens, 'anterior'))}</span>
                                    <span className="text-right">{brl(soma(g.itens, 'rec'))}</span>
                                    <span className="text-right">{brl(soma(g.itens, 'pag'))}</span>
                                    <span className="text-right">{brl(soma(g.itens, 'te'))}</span>
                                    <span className="text-right">{brl(soma(g.itens, 'ts'))}</span>
                                    <span className="text-right">{brl(soma(g.itens, 'final'))}</span>
                                </div>
                                {g.itens.map((m) => (
                                    <button
                                        key={m.conta_id}
                                        type="button"
                                        onClick={() => abrirConta(m.conta_id)}
                                        className="grid w-full grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))] gap-3 border-t border-[#E3E8F0] px-4 py-2.5 text-left text-[14px] tabular-nums hover:bg-[#F6F8FB] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                                    >
                                        <span className="truncate font-bold">{m.nome}</span>
                                        <span className="text-right">{brl(m.anterior)}</span>
                                        <span className="text-right">{brl(m.rec)}</span>
                                        <span className="text-right">{brl(m.pag)}</span>
                                        <span className="text-right">{brl(m.te)}</span>
                                        <span className="text-right">{brl(m.ts)}</span>
                                        <span className="text-right font-extrabold">{brl(m.final)}</span>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
                <div className={SUB}>Clique numa conta para ver as entradas e saídas, com filtro. Transferência, depósito, sangria, aplicação e resgate só movem dinheiro entre as contas da empresa e não entram na DRE.</div>
            </section>
        </>
    );
}

/* ============================== Caixas ============================== */

type Dif = { usuario_id: number; nome: string; fechamentos: number; com_diferenca: number; saldo: number; itens: { em: string; caixa: string; diferenca: number; justificativa: string | null }[] };

function AbaCaixas({ d, abrirConta }: { d: Painel; abrirConta: (id: number) => void }) {
    const [difs, setDifs] = useState<Dif[] | null>(null);
    useEffect(() => {
        api(URL_TES, 'diferencas', undefined, `&comp=${d.hoje.slice(0, 7)}`)
            .then((j) => setDifs(j.dados.pessoas))
            .catch(() => setDifs([]));
    }, [d.hoje]);
    const tot = (k: keyof CaixaP) => d.caixas.reduce((s, c) => s + Number(c[k] || 0), 0);
    return (
        <>
            <div className={`${CARTAO} overflow-hidden`}>
                <div className="hidden grid-cols-[minmax(0,1.5fr)_150px_repeat(5,minmax(0,.8fr))] gap-3 bg-[#F6F8FB] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:grid">
                    <span>Caixa</span>
                    <span>Situação</span>
                    <span className="text-right">Saldo anterior</span>
                    <span className="text-right">(+) Entradas</span>
                    <span className="text-right">(−) Saídas</span>
                    <span className="text-right">(=) Na gaveta</span>
                    <span className="text-right">Pix e cartão</span>
                </div>
                {!d.caixas.length ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Nenhum caixa liberado para você.</div> : null}
                {d.caixas.map((c) => {
                    const s = situacaoCaixa(c);
                    return (
                        <button
                            key={c.conta_id}
                            type="button"
                            onClick={() => abrirConta(c.conta_id)}
                            className="grid w-full grid-cols-2 gap-x-3 gap-y-1 border-t border-[#E3E8F0] px-4 py-3 text-left text-[14px] tabular-nums first:border-t-0 hover:bg-[#F6F8FB] dark:border-white/[0.08] dark:hover:bg-white/[0.04] lg:grid-cols-[minmax(0,1.5fr)_150px_repeat(5,minmax(0,.8fr))] lg:items-center lg:gap-3"
                        >
                            <span className="col-span-2 min-w-0 lg:col-span-1">
                                <b className="text-[15px]">{c.nome}</b>
                                <span className={`block ${SUB}`}>
                                    {c.modo === 'DIARIO' && c.situacao === 'ABERTO' ? `Aberto às ${hora(c.aberto_em)}${c.aberto_por ? ` por ${c.aberto_por}` : ''}` : null}
                                    {c.modo === 'DIARIO' && c.situacao === 'CONFERENCIA_PENDENTE' ? 'Fechou sozinho, sem conferência' : null}
                                    {c.modo === 'DIARIO' && c.situacao === 'FECHADO' && c.ultimo_fechamento
                                        ? `Fechado ${diaMes(c.ultimo_fechamento.em)} ${hora(c.ultimo_fechamento.em)}${c.ultimo_fechamento.diferenca ? ` · diferença ${brl(c.ultimo_fechamento.diferenca)}` : ''}`
                                        : null}
                                    {c.modo === 'CONTINUO' ? 'Prestação de contas quando deposita ou entrega' : null}
                                    {c.modo === 'LIVRE' ? 'Recebe as sangrias e faz os depósitos' : null}
                                </span>
                            </span>
                            <span className="flex flex-wrap items-center gap-1.5">
                                <span className={`${SELO} ${s.cls}`}>{s.txt}</span>
                                {c.n_a_aceitar ? <span className={`${SELO} ${S_AVISO}`}>{brl(c.a_aceitar)} a aceitar</span> : null}
                            </span>
                            <Par rotulo="Saldo anterior" valor={brl(c.anterior)} />
                            <Par rotulo="Entradas" valor={brl(c.entradas)} cls="text-[#3F5A0A] dark:text-[#CFE38A]" />
                            <Par rotulo="Saídas" valor={brl(c.saidas)} cls="text-[#B42318] dark:text-[#FF9C92]" />
                            <Par rotulo="Na gaveta" valor={brl(c.gaveta)} cls="font-extrabold" />
                            <Par rotulo="Pix e cartão" valor={brl(c.pix_cartao)} cls="text-[#5B6478] dark:text-[#AEB9CF]" />
                        </button>
                    );
                })}
                {d.caixas.length > 1 ? (
                    <div className="hidden grid-cols-[minmax(0,1.5fr)_150px_repeat(5,minmax(0,.8fr))] gap-3 border-t border-[#E3E8F0] bg-[#F6F8FB] px-4 py-2.5 text-[14px] font-extrabold tabular-nums dark:border-white/[0.08] dark:bg-[#1C2334] lg:grid">
                        <span>Total</span>
                        <span />
                        <span className="text-right">{brl(tot('anterior'))}</span>
                        <span className="text-right">{brl(tot('entradas'))}</span>
                        <span className="text-right">{brl(tot('saidas'))}</span>
                        <span className="text-right">{brl(tot('gaveta'))}</span>
                        <span className="text-right">{brl(tot('pix_cartao'))}</span>
                    </div>
                ) : null}
            </div>

            <div className={`${NOTA} flex-col`}>
                <b>Como o caixa fica amarrado</b>
                <ul className="list-disc space-y-1 pl-5">
                    <li>O saldo do caixa é só dinheiro em espécie. Pix e cartão aparecem como movimento, para conferência, e não mudam o saldo.</li>
                    <li>Entrada no caixa só nasce de uma baixa no Plano ou na OS, e cai no caixa de quem está logado. Sem caixa aberto, a baixa em dinheiro fica bloqueada.</li>
                    <li>Entre caixas são dois lançamentos: quem entrega registra a saída e quem recebe confere e aceita.</li>
                    <li>Estorno de baixa, cancelamento e desconto só valem com a aprovação da Gestão.</li>
                    <li>Às 18:30 o caixa diário que ficou aberto fecha sozinho e fica com a conferência pendente.</li>
                </ul>
            </div>

            <section className="flex flex-col gap-2.5">
                <div className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                    Diferenças de caixa por pessoa · {d.hoje.slice(5, 7)}/{d.hoje.slice(0, 4)}
                </div>
                <div className={`${CARTAO} overflow-hidden`}>
                    {difs === null ? <div className="px-4 py-6 text-center text-[14px] text-[#5B6478]">Carregando…</div> : null}
                    {difs && !difs.length ? <div className="px-4 py-6 text-center text-[14px] text-[#5B6478]">Nenhum fechamento neste mês.</div> : null}
                    {difs?.map((p) => (
                        <div key={p.usuario_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#E3E8F0] px-4 py-3 first:border-t-0 dark:border-white/[0.08]">
                            <b className="min-w-0 flex-1 text-[15px]">{p.nome}</b>
                            <span className={SUB}>{p.fechamentos} fechamento(s)</span>
                            <span className={`${SELO} ${p.com_diferenca ? S_AVISO : S_OK}`}>{p.com_diferenca} com diferença</span>
                            <b className={`w-28 text-right tabular-nums ${p.saldo < 0 ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}`}>{brl(p.saldo)}</b>
                            {p.itens.length ? (
                                <div className={`basis-full ${SUB}`}>
                                    {p.itens
                                        .slice(-3)
                                        .map((i) => `${diaMes(i.em)} · ${i.caixa} · ${brl(i.diferenca)}${i.justificativa ? ` · ${i.justificativa}` : ''}`)
                                        .join('  |  ')}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
}

function Par({ rotulo, valor, cls = '' }: { rotulo: string; valor: string; cls?: string }) {
    return (
        <span className={`flex items-baseline justify-between gap-2 lg:block lg:text-right ${cls}`}>
            <span className={`${SUB} lg:hidden`}>{rotulo}</span>
            {valor}
        </span>
    );
}

/* ============================== Movimento de uma conta (caixa ou banco) ============================== */

function ModalConta({ contaId, painel, cad, onFechar, feito }: { contaId: number; painel: Painel; cad: Cad | null; onFechar: () => void; feito: (m?: string) => void }) {
    const caixa = painel.caixas.find((c) => c.conta_id === contaId) || null;
    const [de, setDe] = useState(caixa ? painel.hoje : painel.de);
    const [ate, setAte] = useState(painel.hoje);
    const [x, setX] = useState<DadosConta | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<'todas' | 'ent' | 'sai'>('todas');
    const [forma, setForma] = useState('');
    const [busca, setBusca] = useState('');
    const [sub, setSub] = useState<null | 'fechar' | 'despesa' | 'entregar' | 'sangria' | 'config' | { pedir: Linha } | { recusar: Transf }>(null);
    const [ocupado, setOcupado] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_TES, 'conta', undefined, `&conta_id=${contaId}&de=${de}&ate=${ate}`);
            setX(j.dados);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar o movimento.');
            if (m) setErro(m);
        }
    }, [contaId, de, ate]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const acao = async (a: string, corpo: Record<string, unknown>) => {
        setOcupado(true);
        try {
            const j = await api(URL_TES, a, corpo);
            await carregar();
            feito(j.msg);
            return j;
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível concluir.');
            if (m) setErro(m);
            return null;
        } finally {
            setOcupado(false);
        }
    };

    const anexar = async (l: Linha, f: File) => {
        try {
            const j = await enviarArquivo(URL_TES, 'anexar', { caixa_mov_id: String(l.id) }, f);
            await carregar();
            feito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível anexar.');
            if (m) setErro(m);
        }
    };

    const linhas = useMemo(() => {
        if (!x) return [];
        const q = busca.trim().toLowerCase();
        return x.linhas.filter(
            (l) =>
                (filtro === 'todas' || (filtro === 'ent' ? l.valor > 0 : l.valor < 0)) &&
                (!forma || (l.forma || '') === forma) &&
                (!q || `${l.descricao} ${l.natureza || ''} ${l.referencia || ''} ${l.usuario || ''}`.toLowerCase().includes(q)),
        );
    }, [x, filtro, forma, busca]);
    const formas = useMemo(() => Array.from(new Set((x?.linhas || []).map((l) => l.forma || ''))).filter(Boolean), [x]);
    const contam = linhas.filter((l) => l.especie || x?.conta.tipo !== 'CAIXA');
    const ent = contam.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
    const sai = contam.filter((l) => l.valor < 0).reduce((s, l) => s - l.valor, 0);

    const mov = x?.conta.nivel === 'M';
    const ehCaixa = x?.conta.tipo === 'CAIXA';
    const sess = x?.sessao;
    const aberto = sess?.situacao === 'ABERTO';
    const pendente = sess?.situacao === 'CONFERENCIA_PENDENTE';
    const modo = caixa?.modo || 'DIARIO';
    const tesouraria = painel.caixas.find((c) => c.modo === 'LIVRE');

    const rodape = (
        <>
            <button type="button" className={BTN_SEC} onClick={onFechar}>
                Voltar
            </button>
            {ehCaixa && painel.gestao ? (
                <button type="button" className={BTN_SEC} onClick={() => setSub('config')}>
                    <IconSettings size={18} /> Configurar
                </button>
            ) : null}
            {ehCaixa && mov && modo === 'DIARIO' && !sess ? (
                <button type="button" className={BTN_PRI} disabled={ocupado} onClick={() => void acao('abrir', { conta_id: contaId })}>
                    <IconLockOpen size={18} /> Abrir caixa
                </button>
            ) : null}
            {ehCaixa && mov && pendente ? (
                <button type="button" className={BTN_PRI} onClick={() => setSub('fechar')}>
                    Conferir agora
                </button>
            ) : null}
            {ehCaixa && mov && (aberto || modo !== 'DIARIO') ? (
                <>
                    <button type="button" className={BTN_SEC} onClick={() => setSub('despesa')}>
                        Despesa
                    </button>
                    <button type="button" className={BTN_SEC} onClick={() => setSub('entregar')}>
                        Entregar a outro caixa
                    </button>
                    {tesouraria && tesouraria.conta_id !== contaId ? (
                        <button type="button" className={BTN_SEC} onClick={() => setSub('sangria')}>
                            Sangria
                        </button>
                    ) : null}
                    {modo !== 'LIVRE' ? (
                        <button type="button" className={BTN_PRI} onClick={() => setSub('fechar')}>
                            <IconLock size={18} /> {modo === 'CONTINUO' ? 'Prestar contas' : 'Fechar caixa'}
                        </button>
                    ) : null}
                </>
            ) : null}
        </>
    );

    return (
        <Janela
            titulo={x?.conta.nome || caixa?.nome || 'Movimento'}
            sub={
                ehCaixa
                    ? sess
                        ? `${pendente ? 'Conferência pendente' : modo === 'DIARIO' ? `Aberto às ${hora(sess.aberto_em)}${sess.aberto_por ? ` por ${sess.aberto_por}` : ''}` : 'Sempre disponível'} · troco de abertura ${brl(sess.saldo_abertura)}`
                        : 'Caixa fechado'
                    : 'Conta: as entradas e saídas vêm dos pagamentos, recebimentos, transferências e da conciliação do extrato.'
            }
            onFechar={onFechar}
            largura="max-w-5xl"
            rodape={rodape}
        >
            {erro ? <div className={ERRO}>{erro}</div> : null}
            {x && !mov ? <div className={NOTA}>Você só pode ver esta conta. Lançar, entregar, aceitar e fechar são de quem movimenta.</div> : null}

            {x?.a_aceitar?.map((t) => (
                <div key={t.id} className={`${NOTA} ${S_AVISO} shrink-0 flex-wrap items-center`}>
                    <span className="min-w-[200px] flex-1">
                        <b>{t.de}</b> entregou <b>{brl(t.valor)}</b>
                        {t.quem ? ` (${t.quem})` : ''}. Confira o dinheiro antes de aceitar.
                    </span>
                    {mov ? (
                        <>
                            <button type="button" className={BTN_PEQ_PRI} disabled={ocupado} onClick={() => void acao('aceitar', { id: t.id })}>
                                <IconCheck size={16} /> Conferi e aceito
                            </button>
                            <button type="button" className={BTN_PEQ} onClick={() => setSub({ recusar: t })}>
                                Recusar
                            </button>
                        </>
                    ) : null}
                </div>
            ))}

            <div className="flex shrink-0 flex-wrap items-end gap-2">
                {(
                    [
                        ['todas', 'Todas'],
                        ['ent', 'Entradas'],
                        ['sai', 'Saídas'],
                    ] as const
                ).map(([k, t]) => (
                    <button key={k} type="button" className={PILULA(filtro === k)} onClick={() => setFiltro(k)}>
                        {t}
                    </button>
                ))}
                <select className={`${CAMPO_P} w-full sm:w-48`} value={forma} onChange={(e) => setForma(e.target.value)} aria-label="Forma de pagamento">
                    <option value="">Todas as formas</option>
                    {formas.map((f) => (
                        <option key={f}>{f}</option>
                    ))}
                </select>
                <label className="flex h-11 min-w-[180px] flex-1 items-center gap-2 rounded-xl bg-[#F1F4F8] px-3 dark:bg-[#1C2334]">
                    <IconSearch size={18} className="text-[#5B6478]" />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Descrição, natureza, contrato ou pessoa" aria-label="Buscar" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                </label>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-[13px] font-extrabold">
                    De
                    <input type="date" className={`${CAMPO_P} w-[150px]`} value={de} onChange={(e) => e.target.value && setDe(e.target.value)} />
                </label>
                <label className="flex items-center gap-2 text-[13px] font-extrabold">
                    até
                    <input type="date" className={`${CAMPO_P} w-[150px]`} value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} />
                </label>
                <span className="flex flex-wrap items-center gap-2 lg:ml-auto">
                    <span className={`${SELO} ${S_OK}`}>
                        {ehCaixa ? 'Entradas em dinheiro' : 'Entradas'} {brl(ent)}
                    </span>
                    <span className={`${SELO} ${S_RUIM}`}>
                        {ehCaixa ? 'Saídas em dinheiro' : 'Saídas'} {brl(sai)}
                    </span>
                    <span className={SUB}>{linhas.length} movimento(s) no filtro</span>
                </span>
            </div>

            <div className="shrink-0 overflow-hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                {!x ? <div className="px-4 py-6 text-center text-[14px] text-[#5B6478]">Carregando…</div> : null}
                {x && !linhas.length ? <div className="px-4 py-6 text-center text-[14px] text-[#5B6478]">Nenhum movimento neste filtro.</div> : null}
                {linhas.map((l, i) => {
                    const podePedir = mov && l.id && !l.estornado && !l.pedido && !l.estorno_de && ['PLANO', 'OS', 'DESPESA'].includes(l.origem);
                    const podeAnexar = mov && l.id && ['DESPESA', 'ENTREGA', 'SANGRIA', 'DEPOSITO'].includes(l.origem);
                    return (
                        <div key={`${l.id ?? 'x'}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 border-t border-[#E3E8F0] px-3.5 py-2.5 first:border-t-0 dark:border-white/[0.08]">
                            <span className={`w-12 shrink-0 pt-0.5 tabular-nums ${SUB}`}>{de === ate ? l.hora : diaMes(l.data)}</span>
                            <span className="min-w-0 flex-1">
                                <span className={`text-[14.5px] font-bold ${l.estornado ? 'line-through opacity-60' : ''}`}>{l.descricao}</span>
                                <span className={`block ${SUB}`}>
                                    <span className="sm:hidden">{l.forma} · </span>
                                    {[l.natureza ? `natureza: ${l.natureza}` : null, ORIGEM_NOME[l.origem] || l.origem, l.referencia, l.usuario ? `lançado por ${l.usuario}` : null].filter(Boolean).join(' · ')}
                                </span>
                                <span className="mt-1 flex flex-wrap gap-1.5">
                                    {!l.especie ? <span className={`${SELO} ${S_MUDO}`}>não entra no saldo · {l.forma === 'Pix' ? 'foi para o banco' : 'a receber da operadora'}</span> : null}
                                    {l.estornado ? <span className={`${SELO} ${S_MUDO}`}>estornado</span> : null}
                                    {l.pedido ? <span className={`${SELO} ${S_AVISO}`}>{l.pedido === 'ESTORNO' ? 'estorno' : 'cancelamento'} aguardando a Gestão</span> : null}
                                    {l.anexos ? <span className={`${SELO} ${S_OK}`}>comprovante</span> : null}
                                </span>
                            </span>
                            <span className="hidden w-32 shrink-0 text-[13px] text-[#5B6478] dark:text-[#AEB9CF] sm:block">{l.forma}</span>
                            <b className={`w-24 shrink-0 sm:w-28 text-right tabular-nums ${corValor(l.valor, l.especie)}`}>{sinal(l.valor)}</b>
                            {podePedir || podeAnexar ? (
                                <span className="flex basis-full flex-wrap justify-end gap-1.5">
                                    {podeAnexar ? <BotaoArquivo rotulo={l.anexos ? 'Outro comprovante' : 'Anexar comprovante'} icone={<IconPaperclip size={16} />} onArquivo={(f) => void anexar(l, f)} /> : null}
                                    {podePedir ? (
                                        <button type="button" className={BTN_PEQ} onClick={() => setSub({ pedir: l })}>
                                            <IconArrowBackUp size={16} /> {l.origem === 'DESPESA' ? 'Pedir cancelamento' : 'Pedir estorno'}
                                        </button>
                                    ) : null}
                                </span>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            {x ? (
                <div className="grid shrink-0 grid-cols-2 gap-2.5 lg:grid-cols-4">
                    <Caixinha rotulo="Saldo anterior" valor={x.resumo.anterior} />
                    <Caixinha rotulo={ehCaixa ? 'Entradas (dinheiro)' : 'Entradas'} valor={x.resumo.rec + x.resumo.te} />
                    <Caixinha rotulo={ehCaixa ? 'Saídas (dinheiro)' : 'Saídas'} valor={x.resumo.pag + x.resumo.ts} />
                    <Caixinha rotulo={ehCaixa ? 'Na gaveta' : 'Saldo final'} valor={x.resumo.final} forte />
                </div>
            ) : null}
            {ehCaixa && x ? <div className={NOTA}>Pix e cartão no período: {brl(x.resumo.pix_cartao)}. Aparecem aqui para conferência, mas não mudam o saldo do caixa.</div> : null}

            {sub === 'fechar' ? <ModalFechar conta={x?.conta.nome || ''} contaId={contaId} jaContado={!!sess?.contado} continuo={modo === 'CONTINUO'} onFechar={() => setSub(null)} feito={async (m) => { await carregar(); feito(m); }} /> : null}
            {sub === 'despesa' && cad ? <ModalDespesa contaId={contaId} cad={cad} onFechar={() => setSub(null)} enviar={(c) => acao('despesa', c)} /> : null}
            {sub === 'entregar' || sub === 'sangria' ? (
                <ModalEntregar
                    de={contaId}
                    caixas={painel.caixas.filter((c) => c.conta_id !== contaId)}
                    destino={sub === 'sangria' ? tesouraria?.conta_id : undefined}
                    todosCaixas={painel.gestao}
                    onFechar={() => setSub(null)}
                    enviar={(c) => acao('entregar', c)}
                />
            ) : null}
            {sub === 'config' && caixa ? <ModalConfigCaixa caixa={caixa} onFechar={() => setSub(null)} enviar={(c) => acao('config_caixa', c)} /> : null}
            {sub && typeof sub === 'object' && 'pedir' in sub ? (
                <ModalMotivo
                    titulo={sub.pedir.origem === 'DESPESA' ? 'Pedir cancelamento da despesa' : 'Pedir estorno da baixa'}
                    texto={`${sub.pedir.descricao} · ${brl(Math.abs(sub.pedir.valor))}. Nada muda até a Gestão aprovar.`}
                    botao="Enviar pedido"
                    onFechar={() => setSub(null)}
                    enviar={(motivo) => acao('pedir', { tipo: sub.pedir.origem === 'DESPESA' ? 'CANCELAMENTO' : 'ESTORNO', caixa_mov_id: sub.pedir.id, motivo })}
                />
            ) : null}
            {sub && typeof sub === 'object' && 'recusar' in sub ? (
                <ModalMotivo
                    titulo="Recusar entrega"
                    texto={`${brl(sub.recusar.valor)} volta para o ${sub.recusar.de} e a Gestão é avisada.`}
                    botao="Recusar"
                    onFechar={() => setSub(null)}
                    enviar={(motivo) => acao('recusar', { id: sub.recusar.id, motivo })}
                />
            ) : null}
        </Janela>
    );
}

function Caixinha({ rotulo, valor, forte = false }: { rotulo: string; valor: number; forte?: boolean }) {
    return (
        <div className="rounded-xl bg-[#F1F4F8] px-3.5 py-2.5 dark:bg-[#1C2334]">
            <div className={ROTULO}>{rotulo}</div>
            <div className={`text-[17px] tabular-nums ${forte ? 'font-extrabold' : 'font-bold'}`}>{brl(valor)}</div>
        </div>
    );
}

/** Fechamento às cegas: primeiro conta (grava a contagem), depois vê o esperado e fecha. */
function ModalFechar({ conta, contaId, jaContado, continuo, onFechar, feito }: { conta: string; contaId: number; jaContado: boolean; continuo: boolean; onFechar: () => void; feito: (m?: string) => void }) {
    const [contado, setContado] = useState('');
    const [res, setRes] = useState<{ contado: number; esperado: number; diferenca: number; precisa_justificativa: boolean } | null>(null);
    const [just, setJust] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const passo2 = !!res || jaContado;

    const contar = async () => {
        const v = paraNumero(contado);
        if (v === null || Number.isNaN(v) || v < 0) return setErro('Informe quanto dinheiro foi contado.');
        setOcupado(true);
        try {
            const j = await api(URL_TES, 'contar', { conta_id: contaId, contado: v });
            setRes(j.dados);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível registrar a contagem.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const fechar = async () => {
        setOcupado(true);
        try {
            const j = await api(URL_TES, 'fechar', { conta_id: contaId, justificativa: just });
            onFechar();
            feito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível fechar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const dif = res?.diferenca ?? 0;
    return (
        <Janela
            titulo={continuo ? 'Prestar contas' : 'Fechar caixa'}
            sub={conta}
            onFechar={onFechar}
            largura="max-w-lg"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={ocupado} onClick={() => void (passo2 ? fechar() : contar())}>
                        {passo2 ? (continuo ? 'Registrar prestação' : 'Fechar caixa') : 'Conferir'}
                    </button>
                </>
            }
        >
            {!passo2 ? (
                <>
                    <div className={NOTA}>Conte o dinheiro da gaveta e informe o total. O valor esperado só aparece depois, e a contagem não pode ser trocada.</div>
                    <label>
                        <span className={ROTULO}>Dinheiro contado</span>
                        <input className={CAMPO} inputMode="decimal" placeholder="0,00" value={contado} onChange={(e) => setContado(e.target.value)} autoFocus />
                    </label>
                </>
            ) : (
                <>
                    {res ? (
                        <div className="grid grid-cols-3 gap-2">
                            <Caixinha rotulo="Contado" valor={res.contado} forte />
                            <Caixinha rotulo="Esperado" valor={res.esperado} forte />
                            <Caixinha rotulo="Diferença" valor={dif} forte />
                        </div>
                    ) : (
                        <div className={NOTA}>A contagem deste caixa já foi registrada. Se houver diferença, informe a justificativa.</div>
                    )}
                    {res ? (
                        <div className={`${NOTA} ${Math.abs(dif) < 0.01 ? S_OK : S_AVISO}`}>
                            {Math.abs(dif) < 0.01 ? 'Caixa confere. Pode fechar.' : dif < 0 ? `Faltou ${brl(-dif)} no caixa.` : `Sobrou ${brl(dif)} no caixa.`}
                            {Math.abs(dif) >= 0.01 ? ' A diferença fica no seu nome, no relatório de diferenças.' : ''}
                        </div>
                    ) : null}
                    {!res || res.precisa_justificativa ? (
                        <label>
                            <span className={ROTULO}>Justificativa da diferença</span>
                            <input className={CAMPO} value={just} onChange={(e) => setJust(e.target.value)} placeholder="Ex.: troco dado a mais na mensalidade do contrato 008127" />
                        </label>
                    ) : null}
                    <div className={SUB}>O dinheiro que sobrar depois da sangria é o troco do dia seguinte. Pix e cartão não entram na contagem.</div>
                </>
            )}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

function ModalDespesa({ contaId, cad, onFechar, enviar }: { contaId: number; cad: Cad; onFechar: () => void; enviar: (c: Record<string, unknown>) => Promise<any> }) {
    const [f, setF] = useState({ valor: '', descricao: '', natureza_id: null as number | null, area_id: '' as number | '', local_id: '' as number | '' });
    const [erro, setErro] = useState<string | null>(null);
    const ok = async () => {
        const v = paraNumero(f.valor);
        if (!v || Number.isNaN(v) || v <= 0 || !f.descricao.trim() || !f.natureza_id || f.area_id === '') return setErro('Preencha valor, descrição, natureza e área.');
        const j = await enviar({ conta_id: contaId, valor: v, descricao: f.descricao, natureza_id: f.natureza_id, area_id: f.area_id, local_id: f.local_id || null });
        if (j) onFechar();
    };
    return (
        <Janela
            titulo="Despesa pelo caixa"
            sub="Sai do dinheiro da gaveta e vai para o Contas a pagar como paga."
            onFechar={onFechar}
            largura="max-w-lg"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} onClick={() => void ok()}>
                        Lançar despesa
                    </button>
                </>
            }
        >
            <label>
                <span className={ROTULO}>Valor</span>
                <input className={CAMPO} inputMode="decimal" placeholder="0,00" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
            </label>
            <label>
                <span className={ROTULO}>Descrição</span>
                <input className={CAMPO} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: água mineral para o velório" />
            </label>
            <div>
                <span className={ROTULO}>Natureza</span>
                <SelectNatureza cad={cad as unknown as Cadastros} value={f.natureza_id} onChange={(id) => setF({ ...f, natureza_id: id })} classe={CAMPO} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>
                    <span className={ROTULO}>Área de negócio</span>
                    <select className={CAMPO} value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">Escolha</option>
                        {opcoesArea(cad as unknown as Cadastros).map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.nome}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span className={ROTULO}>Local (opcional)</span>
                    <select className={CAMPO} value={f.local_id} onChange={(e) => setF({ ...f, local_id: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">—</option>
                        {cad.locais.filter((l) => l.ativo).map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.nome}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <div className={SUB}>Depois de lançar, anexe a nota ou o recibo na linha da despesa.</div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

function ModalEntregar({
    de,
    caixas,
    destino,
    todosCaixas,
    onFechar,
    enviar,
}: {
    de: number;
    caixas: CaixaP[];
    destino?: number;
    todosCaixas: boolean;
    onFechar: () => void;
    enviar: (c: Record<string, unknown>) => Promise<any>;
}) {
    const [para, setPara] = useState<number | ''>(destino ?? '');
    const [valor, setValor] = useState('');
    const [obs, setObs] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const ok = async () => {
        const v = paraNumero(valor);
        if (para === '' || !v || Number.isNaN(v) || v <= 0) return setErro('Escolha o caixa de destino e informe o valor.');
        const j = await enviar({ de, para, valor: v, observacao: obs });
        if (j) onFechar();
    };
    return (
        <Janela
            titulo={destino ? 'Sangria para a Tesouraria' : 'Entregar a outro caixa'}
            sub="O dinheiro sai daqui agora e só entra no destino quando quem recebe conferir e aceitar."
            onFechar={onFechar}
            largura="max-w-lg"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} onClick={() => void ok()}>
                        Entregar
                    </button>
                </>
            }
        >
            <label>
                <span className={ROTULO}>Para</span>
                <select className={CAMPO} value={para} disabled={!!destino} onChange={(e) => setPara(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">Escolha o caixa</option>
                    {caixas.map((c) => (
                        <option key={c.conta_id} value={c.conta_id}>
                            {c.nome}
                        </option>
                    ))}
                </select>
            </label>
            {!todosCaixas && !caixas.length ? <div className={NOTA}>Nenhum outro caixa liberado para você. Peça à Gestão para liberar (pelo menos "vê") o caixa que vai receber.</div> : null}
            <label>
                <span className={ROTULO}>Valor</span>
                <input className={CAMPO} inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            </label>
            <label>
                <span className={ROTULO}>Observação (opcional)</span>
                <input className={CAMPO} value={obs} onChange={(e) => setObs(e.target.value)} />
            </label>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

function ModalConfigCaixa({ caixa, onFechar, enviar }: { caixa: CaixaP; onFechar: () => void; enviar: (c: Record<string, unknown>) => Promise<any> }) {
    const [modo, setModo] = useState(caixa.modo);
    const [horaF, setHoraF] = useState(caixa.fechamento_auto || '18:30');
    const [troco, setTroco] = useState(caixa.troco_minimo !== null ? numCampo(caixa.troco_minimo) : '');
    const ok = async () => {
        const j = await enviar({ conta_id: caixa.conta_id, modo, fechamento_auto: modo === 'DIARIO' ? horaF : null, troco_minimo: troco ? paraNumero(troco) : null });
        if (j) onFechar();
    };
    return (
        <Janela
            titulo="Configurar caixa"
            sub={caixa.nome}
            onFechar={onFechar}
            largura="max-w-lg"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} onClick={() => void ok()}>
                        Salvar
                    </button>
                </>
            }
        >
            <label>
                <span className={ROTULO}>Como funciona</span>
                <select className={CAMPO} value={modo} onChange={(e) => setModo(e.target.value as CaixaP['modo'])}>
                    <option value="DIARIO">Diário: abre e fecha todo dia</option>
                    <option value="CONTINUO">Contínuo: presta contas quando deposita ou entrega</option>
                    <option value="LIVRE">Tesouraria: recebe sangrias, sem abrir nem fechar</option>
                </select>
            </label>
            {modo === 'DIARIO' ? (
                <label>
                    <span className={ROTULO}>Fecha sozinho às</span>
                    <input type="time" className={CAMPO} value={horaF} onChange={(e) => setHoraF(e.target.value)} />
                </label>
            ) : null}
            <label>
                <span className={ROTULO}>Troco mínimo (opcional)</span>
                <input className={CAMPO} inputMode="decimal" placeholder="0,00" value={troco} onChange={(e) => setTroco(e.target.value)} />
            </label>
            <div className={SUB}>Com troco mínimo, o sistema avisa na abertura quando o dinheiro da gaveta estiver abaixo dele.</div>
        </Janela>
    );
}

function ModalMotivo({ titulo, texto, botao, onFechar, enviar }: { titulo: string; texto: string; botao: string; onFechar: () => void; enviar: (motivo: string) => Promise<any> }) {
    const [motivo, setMotivo] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const ok = async () => {
        if (!motivo.trim()) return setErro('Informe o motivo.');
        const j = await enviar(motivo.trim());
        if (j) onFechar();
    };
    return (
        <Janela
            titulo={titulo}
            onFechar={onFechar}
            largura="max-w-lg"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} onClick={() => void ok()}>
                        {botao}
                    </button>
                </>
            }
        >
            <div className={NOTA}>{texto}</div>
            <label>
                <span className={ROTULO}>Motivo</span>
                <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            </label>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== Transferências ============================== */

function AbaTransf({ d, feito }: { d: Painel; feito: (m?: string) => void }) {
    const [recusar, setRecusar] = useState<Transf | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const acao = async (a: string, corpo: Record<string, unknown>) => {
        try {
            const j = await api(URL_TES, a, corpo);
            feito(j.msg);
            return j;
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível concluir.');
            if (m) setErro(m);
            return null;
        }
    };
    const anexar = async (t: Transf, f: File) => {
        try {
            const j = await enviarArquivo(URL_TES, 'anexar', { transferencia_id: String(t.id) }, f);
            feito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível anexar.');
            if (m) setErro(m);
        }
    };
    const transito = d.transferencias.filter((t) => t.situacao === 'TRANSITO').length;
    return (
        <>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            {transito ? <div className={`${NOTA} ${S_AVISO}`}>{transito} entrega(s) em trânsito aguardando o aceite do caixa de destino.</div> : null}
            <div className={`${CARTAO} overflow-hidden`}>
                <div className="hidden grid-cols-[90px_120px_minmax(0,1.6fr)_120px_minmax(0,1fr)_minmax(0,1fr)] gap-3 bg-[#F6F8FB] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:grid">
                    <span>Data</span>
                    <span>Tipo</span>
                    <span>De → para</span>
                    <span className="text-right">Valor</span>
                    <span>Quem · situação</span>
                    <span>Comprovante</span>
                </div>
                {!d.transferencias.length ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Nenhuma transferência no período.</div> : null}
                {d.transferencias.map((t) => (
                    <div key={t.id} className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-[#E3E8F0] px-4 py-3 text-[14px] first:border-t-0 dark:border-white/[0.08] lg:grid-cols-[90px_120px_minmax(0,1.6fr)_120px_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-3">
                        <span className={SUB}>{dataBR(t.data)}</span>
                        <span>
                            <span className={`${SELO} ${S_AB}`}>{TRANSF_NOME[t.tipo] || t.tipo}</span>
                        </span>
                        <span className="col-span-2 min-w-0 lg:col-span-1">
                            {t.de} <b>→</b> {t.para}
                            {t.observacao ? <span className={`block ${SUB}`}>{t.observacao}</span> : null}
                        </span>
                        <b className="tabular-nums lg:text-right">{brl(t.valor)}</b>
                        <span className="min-w-0">
                            <span className={`block ${SUB}`}>{t.quem}</span>
                            <span className={`${SELO} ${t.situacao === 'TRANSITO' ? S_AVISO : t.situacao === 'RECUSADA' ? S_RUIM : S_OK}`}>
                                {t.situacao === 'TRANSITO' ? `em trânsito · aguarda ${t.para}` : t.situacao === 'RECUSADA' ? `recusada${t.recusa_motivo ? ` · ${t.recusa_motivo}` : ''}` : 'confirmada'}
                            </span>
                            {t.pode_aceitar ? (
                                <span className="mt-1.5 flex flex-wrap gap-1.5">
                                    <button type="button" className={BTN_PEQ_PRI} onClick={() => void acao('aceitar', { id: t.id })}>
                                        <IconCheck size={16} /> Conferi e aceito
                                    </button>
                                    <button type="button" className={BTN_PEQ} onClick={() => setRecusar(t)}>
                                        <IconX size={16} /> Recusar
                                    </button>
                                </span>
                            ) : null}
                        </span>
                        <span className="col-span-2 flex flex-wrap items-center gap-1.5 lg:col-span-1">
                            {t.comprovantes ? <span className={`${SELO} ${S_OK}`}>{t.comprovantes} anexado(s)</span> : <span className={`${SELO} ${S_AVISO}`}>falta</span>}
                            {['DEPOSITO', 'TRANSFERENCIA', 'APLICACAO', 'RESGATE', 'ENTREGA', 'SANGRIA'].includes(t.tipo) ? <BotaoArquivo rotulo="Anexar" icone={<IconPaperclip size={16} />} onArquivo={(f) => void anexar(t, f)} /> : null}
                        </span>
                    </div>
                ))}
            </div>
            <div className={SUB}>
                Entre caixas, o dinheiro só entra no caixa de destino depois que quem recebe confere e aceita; até lá fica em trânsito. Depósito no banco é confirmado pela conciliação do extrato.
            </div>
            {recusar ? (
                <ModalMotivo
                    titulo="Recusar entrega"
                    texto={`${brl(recusar.valor)} volta para o ${recusar.de} e a Gestão é avisada.`}
                    botao="Recusar"
                    onFechar={() => setRecusar(null)}
                    enviar={(motivo) => acao('recusar', { id: recusar.id, motivo })}
                />
            ) : null}
        </>
    );
}

function ModalTransferencia({ d, onFechar, feito }: { d: Painel; onFechar: () => void; feito: (m?: string) => void }) {
    const [f, setF] = useState({ tipo: 'TRANSFERENCIA', de: '' as number | '', para: '' as number | '', valor: '', data: d.hoje, observacao: '' });
    const [erro, setErro] = useState<string | null>(null);
    const contas = d.contas.filter((c) => c.nivel === 'M');
    const ok = async () => {
        const v = paraNumero(f.valor);
        if (f.de === '' || f.para === '' || !v || Number.isNaN(v) || v <= 0) return setErro('Escolha as contas e informe o valor.');
        try {
            const j = await api(URL_TES, 'transferir', { ...f, valor: v });
            onFechar();
            feito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível registrar.');
            if (m) setErro(m);
        }
    };
    return (
        <Janela
            titulo="Movimentar entre contas"
            sub="Entre caixas use “Entregar a outro caixa” dentro do caixa: o destino confere e aceita."
            onFechar={onFechar}
            largura="max-w-lg"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} onClick={() => void ok()}>
                        Registrar
                    </button>
                </>
            }
        >
            <label>
                <span className={ROTULO}>Tipo</span>
                <select className={CAMPO} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                    <option value="TRANSFERENCIA">Transferência entre contas</option>
                    <option value="DEPOSITO">Depósito (caixa → banco)</option>
                    <option value="APLICACAO">Aplicação</option>
                    <option value="RESGATE">Resgate</option>
                </select>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(['de', 'para'] as const).map((k) => (
                    <label key={k}>
                        <span className={ROTULO}>{k === 'de' ? 'Sai de' : 'Entra em'}</span>
                        <select className={CAMPO} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value ? Number(e.target.value) : '' })}>
                            <option value="">Escolha</option>
                            {contas.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}
                                </option>
                            ))}
                        </select>
                    </label>
                ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>
                    <span className={ROTULO}>Valor</span>
                    <input className={CAMPO} inputMode="decimal" placeholder="0,00" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
                </label>
                <label>
                    <span className={ROTULO}>Data</span>
                    <input type="date" className={CAMPO} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
                </label>
            </div>
            <label>
                <span className={ROTULO}>Observação (opcional)</span>
                <input className={CAMPO} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} />
            </label>
            <div className={SUB}>Depois de registrar, anexe o comprovante na aba Transferências.</div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== Conciliação bancária ============================== */

type Status = {
    conta_id: number;
    nome: string;
    banco: string | null;
    provedor: string | null;
    ambiente: string | null;
    api_ligada: boolean;
    tem_credenciais: boolean;
    ultima_leitura_ok: string | null;
    ultima_tentativa: string | null;
    ultimo_erro: string | null;
    a_conciliar: number;
    leituras: { em: string; origem: string; situacao: string; novos: number; repetidos: number; erro: string | null; arquivo: string | null; quem: string }[];
};
type Cand = { tabela: string; id: number; data: string; valor: number; descricao: string };
type LinhaExt = { id: number; data: string; descricao: string; documento: string | null; valor: number; situacao: 'PENDENTE' | 'CONCILIADO' | 'LANCADO' | 'IGNORADO'; vinculo: string | null; sugestao: Cand | null };

function AbaConciliacao({ d, cad, feito }: { d: Painel; cad: Cad | null; feito: (m?: string) => void }) {
    const bancos = d.contas.filter((c) => c.tipo === 'BANCO');
    const [st, setSt] = useState<Status[] | null>(null);
    const [conta, setConta] = useState<number>(() => bancos.find((b) => b.a_conciliar)?.id || bancos[0]?.id || 0);
    const [ext, setExt] = useState<{ linhas: LinhaExt[]; conciliadas: number; total: number } | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [lancar, setLancar] = useState<LinhaExt | null>(null);
    const [outro, setOutro] = useState<LinhaExt | null>(null);
    const [ignorar, setIgnorar] = useState<LinhaExt | null>(null);

    const carregar = useCallback(async () => {
        try {
            const [a, b] = await Promise.all([api(URL_BANCOS, 'status'), conta ? api(URL_BANCOS, 'extrato', undefined, `&conta_id=${conta}&de=${d.de}&ate=${d.hoje}`) : Promise.resolve(null)]);
            setSt(a.dados);
            setExt(b ? b.dados : null);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar a conciliação.');
            if (m) setErro(m);
        }
    }, [conta, d.de, d.hoje]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const acao = async (a: string, corpo: Record<string, unknown>) => {
        setOcupado(true);
        try {
            const j = await api(URL_BANCOS, a, corpo);
            await carregar();
            feito(j.msg);
            return j;
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível concluir.');
            if (m) setErro(m);
            return null;
        } finally {
            setOcupado(false);
        }
    };
    const importar = async (contaId: number, f: File) => {
        setOcupado(true);
        try {
            const j = await enviarArquivo(URL_BANCOS, 'importar', { conta_id: String(contaId) }, f);
            setConta(contaId);
            await carregar();
            feito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível importar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };

    return (
        <>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            <div className="flex flex-wrap items-center gap-2">
                <div className="mr-auto text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">Extrato automático</div>
                <button type="button" className={BTN_PEQ_PRI} disabled={ocupado} onClick={() => void acao('ler', {})}>
                    <IconRefresh size={16} /> Atualizar extratos
                </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {st?.map((s) => {
                    const ruim = !!s.ultimo_erro && s.api_ligada;
                    return (
                        <div
                            key={s.conta_id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setConta(s.conta_id)}
                            className={`${CARTAO} flex cursor-pointer flex-col gap-1.5 p-4 ${conta === s.conta_id ? 'shadow-[inset_0_0_0_2px_#313C55] dark:shadow-[inset_0_0_0_2px_#F2CB3F]' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                <b className="min-w-0 flex-1 text-[15px]">{s.nome}</b>
                                <span className={`${SELO} ${!s.api_ligada ? S_MUDO : ruim ? S_AVISO : S_OK}`}>{!s.api_ligada ? 'Por arquivo' : ruim ? 'Falhou' : 'Em dia'}</span>
                            </div>
                            <span className={SUB}>
                                {s.api_ligada ? `API ${s.provedor || ''}${s.ambiente === 'SANDBOX' ? ' · ambiente de teste' : ''}` : 'Leitura automática ainda não ligada (aguardando o banco liberar)'}
                            </span>
                            <span className="text-[13px] font-bold">
                                {s.ultima_leitura_ok ? `Última leitura: ${dataBR(s.ultima_leitura_ok)} ${hora(s.ultima_leitura_ok)}` : 'Nenhuma leitura automática ainda'}
                                {s.a_conciliar ? ` · ${s.a_conciliar} a conciliar` : ''}
                            </span>
                            {ruim ? (
                                <span className={`${NOTA} ${S_AVISO} text-[13px]`}>
                                    <IconAlertTriangle size={16} className="shrink-0" /> {s.ultimo_erro} O sistema tenta de novo sozinho; se continuar, importe o arquivo do dia.
                                </span>
                            ) : null}
                            <span className="mt-1 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {s.api_ligada ? (
                                    <button type="button" className={BTN_PEQ} disabled={ocupado} onClick={() => void acao('ler', { conta_id: s.conta_id })}>
                                        <IconRefresh size={16} /> Atualizar agora
                                    </button>
                                ) : null}
                                <BotaoArquivoExtrato rotulo="Importar arquivo" onArquivo={(f) => void importar(s.conta_id, f)} />
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <select className={`${CAMPO_P} w-full sm:w-72`} value={conta} onChange={(e) => setConta(Number(e.target.value))} aria-label="Conta">
                    {bancos.map((b) => (
                        <option key={b.id} value={b.id}>
                            {b.nome}
                        </option>
                    ))}
                </select>
                {ext ? (
                    <span className={`${SELO} ${ext.conciliadas === ext.total ? S_OK : S_AVISO} ml-auto`}>
                        {ext.conciliadas} de {ext.total} resolvidas
                    </span>
                ) : null}
            </div>

            <div className={`${CARTAO} overflow-hidden`}>
                {ext && !ext.linhas.length ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Nenhuma linha de extrato nesta conta no período.</div> : null}
                {ext?.linhas.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#E3E8F0] px-4 py-3 first:border-t-0 dark:border-white/[0.08]">
                        <span className={`w-12 shrink-0 ${SUB}`}>{diaMes(l.data)}</span>
                        <b className="min-w-0 flex-1 text-[14.5px]">{l.descricao}</b>
                        <b className={`w-28 shrink-0 text-right tabular-nums ${corValor(l.valor)}`}>{sinal(l.valor)}</b>
                        <div className="flex basis-full flex-wrap items-center gap-2 pl-[3.75rem] max-sm:pl-0">
                            {l.situacao !== 'PENDENTE' ? (
                                <>
                                    <span className={`${SELO} ${l.situacao === 'IGNORADO' ? S_MUDO : S_OK}`}>{l.situacao === 'IGNORADO' ? 'ignorada' : l.vinculo}</span>
                                    <button type="button" className={`${BTN_PEQ} ml-auto`} disabled={ocupado} onClick={() => void acao('desfazer', { extrato_id: l.id })}>
                                        Desfazer
                                    </button>
                                </>
                            ) : (
                                <>
                                    <span className={`min-w-0 flex-1 text-[13.5px] ${l.sugestao ? '' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>
                                        {l.sugestao ? (
                                            <>
                                                <span className={SUB}>sugestão: </span>
                                                {l.sugestao.descricao} · {dataBR(l.sugestao.data)}
                                            </>
                                        ) : (
                                            'Não está no sistema.'
                                        )}
                                    </span>
                                    {l.sugestao ? (
                                        <button type="button" className={BTN_PEQ_PRI} disabled={ocupado} onClick={() => void acao('conciliar', { extrato_id: l.id, tabela: l.sugestao!.tabela, id: l.sugestao!.id })}>
                                            <IconCheck size={16} /> Conciliar
                                        </button>
                                    ) : (
                                        <button type="button" className={BTN_PEQ_PRI} disabled={!cad} onClick={() => setLancar(l)}>
                                            <IconPlus size={16} /> Lançar
                                        </button>
                                    )}
                                    <button type="button" className={BTN_PEQ} onClick={() => setOutro(l)}>
                                        Outro
                                    </button>
                                    <button type="button" className={BTN_PEQ} onClick={() => setIgnorar(l)}>
                                        Ignorar
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div className={SUB}>
                O sistema casa cada linha do extrato com um pagamento, recebimento ou transferência pelo valor e pela data (até 3 dias de diferença). O que não está no sistema (tarifa, IOF, juros) é lançado ali mesmo. A mesma linha nunca entra duas vezes, nem quando a leitura automática e um arquivo trazem o mesmo dia.
            </div>

            {lancar && cad ? <ModalLancarExtrato l={lancar} cad={cad} onFechar={() => setLancar(null)} enviar={(c) => acao('lancar', c)} /> : null}
            {outro ? <ModalOutro l={outro} onFechar={() => setOutro(null)} enviar={(c) => acao('conciliar', c)} /> : null}
            {ignorar ? (
                <ModalMotivo titulo="Ignorar linha do extrato" texto={`${ignorar.descricao} · ${sinal(ignorar.valor)}`} botao="Ignorar" onFechar={() => setIgnorar(null)} enviar={(motivo) => acao('ignorar', { extrato_id: ignorar.id, motivo })} />
            ) : null}
        </>
    );
}

function BotaoArquivoExtrato({ rotulo, onArquivo }: { rotulo: string; onArquivo: (f: File) => void }) {
    const ref = React.useRef<HTMLInputElement>(null);
    return (
        <>
            <button type="button" className={BTN_PEQ} onClick={() => ref.current?.click()}>
                <IconUpload size={16} /> {rotulo}
            </button>
            <input
                ref={ref}
                type="file"
                accept=".ofx,.csv,.txt,text/csv,application/x-ofx"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onArquivo(f);
                    e.target.value = '';
                }}
            />
        </>
    );
}

function ModalLancarExtrato({ l, cad, onFechar, enviar }: { l: LinhaExt; cad: Cad; onFechar: () => void; enviar: (c: Record<string, unknown>) => Promise<any> }) {
    const [nat, setNat] = useState<number | null>(null);
    const [area, setArea] = useState<number | ''>('');
    const [desc, setDesc] = useState(l.descricao);
    const [erro, setErro] = useState<string | null>(null);
    const ok = async () => {
        if (!nat || area === '') return setErro('Escolha a natureza e a área.');
        const j = await enviar({ extrato_id: l.id, natureza_id: nat, area_id: area, descricao: desc });
        if (j) onFechar();
    };
    return (
        <Janela
            titulo="Lançar e conciliar"
            sub={`${dataBR(l.data)} · ${sinal(l.valor)}`}
            onFechar={onFechar}
            largura="max-w-lg"
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} onClick={() => void ok()}>
                        Lançar
                    </button>
                </>
            }
        >
            <label>
                <span className={ROTULO}>Descrição</span>
                <input className={CAMPO} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </label>
            <div>
                <span className={ROTULO}>Natureza</span>
                <SelectNatureza cad={cad as unknown as Cadastros} value={nat} onChange={setNat} classe={CAMPO} tipo={l.valor > 0 ? 'todas' : 'saida'} />
            </div>
            <label>
                <span className={ROTULO}>Área de negócio</span>
                <select className={CAMPO} value={area} onChange={(e) => setArea(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">Escolha</option>
                    {opcoesArea(cad as unknown as Cadastros).map((a) => (
                        <option key={a.id} value={a.id}>
                            {a.nome}
                        </option>
                    ))}
                </select>
            </label>
            <div className={SUB}>Vira um título {l.valor < 0 ? 'a pagar' : 'a receber'} já baixado nesta conta, ligado a esta linha do extrato.</div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

function ModalOutro({ l, onFechar, enviar }: { l: LinhaExt; onFechar: () => void; enviar: (c: Record<string, unknown>) => Promise<any> }) {
    const [q, setQ] = useState('');
    const [lista, setLista] = useState<Cand[] | null>(null);
    useEffect(() => {
        const t = setTimeout(() => {
            api(URL_BANCOS, 'candidatos', undefined, `&extrato_id=${l.id}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`)
                .then((j) => {
                    const vistos = new Set<string>();
                    setLista((j.dados as Cand[]).filter((c) => (vistos.has(`${c.tabela}${c.id}`) ? false : (vistos.add(`${c.tabela}${c.id}`), true))));
                })
                .catch(() => setLista([]));
        }, 300);
        return () => clearTimeout(t);
    }, [l.id, q]);
    return (
        <Janela titulo="Conciliar com outro lançamento" sub={`${dataBR(l.data)} · ${l.descricao} · ${sinal(l.valor)}`} onFechar={onFechar} largura="max-w-2xl">
            <label className="flex h-11 items-center gap-2 rounded-xl bg-[#F1F4F8] px-3 dark:bg-[#1C2334]">
                <IconSearch size={18} className="text-[#5B6478]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pela descrição" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" autoFocus />
            </label>
            <div className="shrink-0 overflow-hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                {lista === null ? <div className="px-4 py-6 text-center text-[14px] text-[#5B6478]">Buscando…</div> : null}
                {lista && !lista.length ? <div className="px-4 py-6 text-center text-[14px] text-[#5B6478]">Nada parecido nos 10 dias em volta desta data.</div> : null}
                {lista?.map((c) => (
                    <div key={`${c.tabela}${c.id}`} className="flex flex-wrap items-center gap-3 border-t border-[#E3E8F0] px-3.5 py-2.5 first:border-t-0 dark:border-white/[0.08]">
                        <span className={`w-12 ${SUB}`}>{diaMes(c.data)}</span>
                        <span className="min-w-0 flex-1 text-[14px]">{c.descricao}</span>
                        <b className={`tabular-nums ${Math.abs(c.valor - l.valor) < 0.01 ? '' : 'text-[#7A5D00]'}`}>{sinal(c.valor)}</b>
                        <button type="button" className={BTN_PEQ_PRI} onClick={async () => (await enviar({ extrato_id: l.id, tabela: c.tabela, id: c.id })) && onFechar()}>
                            Ligar
                        </button>
                    </div>
                ))}
            </div>
        </Janela>
    );
}

/* ============================== Conferência da fatura ============================== */

type Fatura = { id: number; vencimento: string; arquivo: string | null; total_banco: number; situacao: 'ABERTA' | 'CONFERIDA'; faltam: number; itens: { id: number; data: string | null; descricao: string; valor: number; situacao: 'CONFERE' | 'FALTA' | 'SOBRA' | 'LANCADA'; natureza: string | null }[] };

function AbaFatura({ cad, avisar }: { cad: Cad | null; avisar: (m: string) => void }) {
    const [cartao, setCartao] = useState<number | ''>('');
    const [venc, setVenc] = useState('');
    const [f, setF] = useState<Fatura | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [sel, setSel] = useState<Record<number, { nat: number | null; area: number | '' }>>({});
    useEffect(() => {
        if (cartao === '' && cad?.cartoes.length) setCartao(cad.cartoes[0].id);
    }, [cad, cartao]);
    const carregar = useCallback(async () => {
        if (cartao === '' || !venc) return setF(null);
        try {
            const j = await api(URL_BANCOS, 'fatura', undefined, `&conta_id=${cartao}&vencimento=${venc}`);
            setF(j.dados);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar a fatura.');
            if (m) setErro(m);
        }
    }, [cartao, venc]);
    useEffect(() => {
        void carregar();
    }, [carregar]);
    const fazer = async (p: Promise<any>) => {
        try {
            const j = await p;
            await carregar();
            avisar(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível concluir.');
            if (m) setErro(m);
        }
    };
    const SIT: Record<string, [string, string]> = { CONFERE: ['confere', S_OK], FALTA: ['só na fatura', S_AVISO], SOBRA: ['não veio na fatura', S_RUIM], LANCADA: ['lançada agora', S_OK] };
    return (
        <>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            <div className="flex flex-wrap items-end gap-2">
                <label className="w-full sm:w-72">
                    <span className={ROTULO}>Cartão</span>
                    <select className={CAMPO_P} value={cartao} onChange={(e) => setCartao(e.target.value ? Number(e.target.value) : '')}>
                        {cad?.cartoes.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nome}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="w-[48%] sm:w-48">
                    <span className={ROTULO}>Vencimento da fatura</span>
                    <input type="date" className={CAMPO_P} value={venc} onChange={(e) => setVenc(e.target.value)} />
                </label>
                {cartao !== '' && venc ? (
                    <BotaoArquivoExtrato rotulo={f ? 'Importar de novo' : 'Importar fatura (OFX ou CSV)'} onArquivo={(arq) => void fazer(enviarArquivo(URL_BANCOS, 'importar_fatura', { conta_id: String(cartao), vencimento: venc }, arq))} />
                ) : null}
                {f ? (
                    <span className={`${SELO} ${f.situacao === 'CONFERIDA' ? S_OK : f.faltam ? S_AVISO : S_AB} ml-auto`}>
                        {f.situacao === 'CONFERIDA' ? `Conferida · ${brl(f.total_banco)}` : f.faltam ? `${f.faltam} só na fatura · banco ${brl(f.total_banco)}` : `Banco ${brl(f.total_banco)}`}
                    </span>
                ) : null}
            </div>
            {!venc ? <div className={NOTA}>Escolha o cartão e o vencimento da fatura, e importe o arquivo baixado do banco.</div> : null}
            {f ? (
                <div className={`${CARTAO} overflow-hidden`}>
                    {f.itens.map((i) => {
                        const s = sel[i.id] || { nat: null, area: '' };
                        return (
                            <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#E3E8F0] px-4 py-3 first:border-t-0 dark:border-white/[0.08]">
                                <span className={`w-12 ${SUB}`}>{diaMes(i.data)}</span>
                                <b className="min-w-0 flex-1 text-[14.5px]">{i.descricao}</b>
                                <span className={`${SELO} ${SIT[i.situacao][1]}`}>{SIT[i.situacao][0]}</span>
                                <b className="w-28 text-right tabular-nums">{brl(i.valor)}</b>
                                {i.situacao === 'FALTA' && cad ? (
                                    <div className="flex basis-full flex-wrap gap-2">
                                        <div className="min-w-[220px] flex-1">
                                            <SelectNatureza cad={cad as unknown as Cadastros} value={s.nat} onChange={(id) => setSel({ ...sel, [i.id]: { ...s, nat: id } })} />
                                        </div>
                                        <select className={`${CAMPO_P} min-w-[200px] flex-1`} value={s.area} onChange={(e) => setSel({ ...sel, [i.id]: { ...s, area: e.target.value ? Number(e.target.value) : '' } })} aria-label="Área">
                                            <option value="">Área</option>
                                            {opcoesArea(cad as unknown as Cadastros).map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.nome}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className={BTN_PEQ_PRI}
                                            onClick={() => (!s.nat || s.area === '' ? setErro('Escolha a natureza e a área.') : void fazer(api(URL_BANCOS, 'fatura_lancar', { item_id: i.id, natureza_id: s.nat, area_id: s.area })))}
                                        >
                                            Lançar no cartão
                                        </button>
                                    </div>
                                ) : null}
                                {i.natureza ? <span className={`basis-full ${SUB}`}>{i.natureza}</span> : null}
                            </div>
                        );
                    })}
                </div>
            ) : null}
            {f && f.situacao !== 'CONFERIDA' ? (
                <div className="flex justify-end">
                    <button type="button" className={BTN_PRI} disabled={!!f.faltam} onClick={() => void fazer(api(URL_BANCOS, 'fatura_concluir', { conf_id: f.id }))}>
                        <IconCheck size={18} /> Concluir conferência
                    </button>
                </div>
            ) : null}
            <div className={SUB}>
                Bate compra por compra com o que foi lançado no cartão. Anuidade, juros e IOF que só aparecem na fatura são lançados ali mesmo. Ao concluir, o título da fatura no Contas a pagar fica com o valor exato do banco.
            </div>
        </>
    );
}

/* ============================== Aprovações ============================== */

type Aprov = { id: number; tipo: 'ESTORNO' | 'CANCELAMENTO' | 'DESCONTO'; caixa: string | null; descricao: string; valor: number; motivo: string; situacao: 'PENDENTE' | 'APROVADO' | 'RECUSADO'; pedido_por: string | null; pedido_em: string; decidido_por: string | null; decidido_em: string | null; decisao_obs: string | null };

function AbaAprovacoes({ feito }: { feito: (m?: string) => void }) {
    const [lista, setLista] = useState<Aprov[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_TES, 'aprovacoes');
            setLista(j.dados);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar as aprovações.');
            if (m) setErro(m);
        }
    }, []);
    useEffect(() => {
        void carregar();
    }, [carregar]);
    const decidir = async (a: Aprov, aprovar: boolean) => {
        try {
            const j = await api(URL_TES, 'decidir', { id: a.id, aprovar });
            await carregar();
            feito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível decidir.');
            if (m) setErro(m);
        }
    };
    const NOME = { ESTORNO: 'Estorno de baixa', CANCELAMENTO: 'Cancelamento', DESCONTO: 'Desconto' };
    return (
        <>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            <div className={NOTA}>
                Estorno de baixa, cancelamento e desconto são pedidos por quem está no caixa e só valem depois que a Gestão aprova. Até lá nada muda no caixa, no contas a receber nem na Tesouraria. Aprovado o estorno, o dinheiro sai do caixa e o título volta a ficar em aberto.
            </div>
            <div className={`${CARTAO} overflow-hidden`}>
                {lista === null ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Carregando…</div> : null}
                {lista && !lista.length ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Nenhum pedido.</div> : null}
                {lista?.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#E3E8F0] px-4 py-3 first:border-t-0 dark:border-white/[0.08]">
                        <span className="min-w-0 flex-1">
                            <span className={`${SELO} ${S_AB}`}>{NOME[a.tipo]}</span>
                            <b className="ml-2 text-[14.5px]">{a.descricao}</b>
                            <span className={`block ${SUB}`}>
                                {[a.caixa, a.pedido_por, `${dataBR(a.pedido_em)} ${hora(a.pedido_em)}`].filter(Boolean).join(' · ')} — motivo: {a.motivo}
                            </span>
                        </span>
                        <b className="w-28 text-right tabular-nums">{brl(a.valor)}</b>
                        {a.situacao === 'PENDENTE' ? (
                            <span className="flex gap-1.5">
                                <button type="button" className={BTN_PEQ_PRI} onClick={() => void decidir(a, true)}>
                                    Aprovar
                                </button>
                                <button type="button" className={BTN_PEQ} onClick={() => void decidir(a, false)}>
                                    Recusar
                                </button>
                            </span>
                        ) : (
                            <span className={`${SELO} ${a.situacao === 'APROVADO' ? S_OK : S_RUIM}`}>
                                {a.situacao === 'APROVADO' ? 'Aprovado' : 'Recusado'} por {a.decidido_por}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}

/* ============================== Quem vê cada conta ============================== */

type Acessos = { usuarios: { id: number; nome: string; gestao: boolean }[]; contas: { id: number; nome: string; tipo: string; acessos: Record<string, 'VE' | 'MOVIMENTA'> }[] };

function AbaAcessos({ avisar }: { avisar: (m: string) => void }) {
    const [a, setA] = useState<Acessos | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [busca, setBusca] = useState('');
    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_TES, 'acessos');
            setA(j.dados);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar os acessos.');
            if (m) setErro(m);
        }
    }, []);
    useEffect(() => {
        void carregar();
    }, [carregar]);
    const gestao = a?.usuarios.filter((u) => u.gestao) || [];
    const q = busca.trim().toLowerCase();
    const pessoas = (a?.usuarios.filter((u) => !u.gestao) || []).filter((u) => !q || u.nome.toLowerCase().includes(q));
    const trocar = async (contaId: number, uid: number, atual?: 'VE' | 'MOVIMENTA') => {
        const nivel = !atual ? 'VE' : atual === 'VE' ? 'MOVIMENTA' : '';
        try {
            await api(URL_TES, 'acesso', { conta_id: contaId, usuario_id: uid, nivel });
            setA((x) =>
                x
                    ? {
                          ...x,
                          contas: x.contas.map((c) => {
                              if (c.id !== contaId) return c;
                              const ac = { ...c.acessos };
                              if (nivel) ac[uid] = nivel;
                              else delete ac[uid];
                              return { ...c, acessos: ac };
                          }),
                      }
                    : x,
            );
            avisar('Acesso salvo.');
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível salvar.');
            if (m) setErro(m);
        }
    };
    return (
        <>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            <div className={NOTA}>
                A Gestão define quem vê e quem movimenta cada conta. Quem não tem acesso nem enxerga a conta. A Gestão ({gestao.map((u) => u.nome).join(', ') || '—'}) vê tudo. Clique na célula para trocar: — → Vê → Vê e movimenta. A pessoa também precisa da página Tesouraria nas Permissões.
            </div>
            <label className="flex h-11 w-full items-center gap-2 rounded-xl bg-white px-3 dark:bg-[#232B3F] sm:w-72">
                <IconSearch size={18} className="text-[#5B6478]" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar pessoas" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
            </label>
            {a ? (
                <div className={`${CARTAO} overflow-x-auto`}>
                    <table className="w-full min-w-[640px] border-collapse text-[14px]">
                        <thead>
                            <tr className="bg-[#F6F8FB] text-left text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                <th className="sticky left-0 bg-[#F6F8FB] px-4 py-2.5 dark:bg-[#1C2334]">Conta</th>
                                {pessoas.map((u) => (
                                    <th key={u.id} className="min-w-[120px] px-2 py-2.5 text-center">
                                        {u.nome}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {a.contas.map((c) => (
                                <tr key={c.id} className="border-t border-[#E3E8F0] dark:border-white/[0.08]">
                                    <td className="sticky left-0 bg-white px-4 py-2 dark:bg-[#232B3F]">
                                        <b>{c.nome}</b>
                                        <span className={`block ${SUB}`}>{c.tipo === 'BANCO' ? 'Banco' : c.tipo === 'APLICACAO' ? 'Aplicação' : c.tipo === 'CAIXA' ? 'Caixa' : 'Outra'}</span>
                                    </td>
                                    {pessoas.map((u) => {
                                        const n = c.acessos[u.id];
                                        return (
                                            <td key={u.id} className="px-2 py-2 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => void trocar(c.id, u.id, n)}
                                                    className={`min-h-10 w-full rounded-xl px-2 text-[13px] font-extrabold ${n === 'MOVIMENTA' ? 'bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]' : n === 'VE' ? S_AB : 'bg-[#F1F4F8] text-[#9AA3B5] dark:bg-white/[0.06]'}`}
                                                >
                                                    {n === 'MOVIMENTA' ? 'Vê e movimenta' : n === 'VE' ? 'Vê' : '—'}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </>
    );
}
