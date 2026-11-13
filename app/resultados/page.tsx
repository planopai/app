'use client';

/**
 * Resultados (/resultados) — Financeiro da empresa, etapa 4 — 13/11/2026. Back-end: fin_resultados.php (só a Gestão).
 * DRE por competência e por caixa (mês a mês, comparar, por área de negócio com rateio configurável e por local), fluxo de caixa
 * (realizado e previsto, alerta de saldo mínimo), ISS retido das NFs da Prefeitura e pacote do contador em planilha Excel.
 * Até a virada, mensalidades e contas a pagar entram pela importação mensal dos relatórios da Unymos (salvos como .xlsx).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    IconAdjustmentsDollar,
    IconAlertTriangle,
    IconChartBar,
    IconChevronDown,
    IconChevronRight,
    IconDownload,
    IconFileSpreadsheet,
    IconLock,
    IconRefresh,
    IconUpload,
} from '@tabler/icons-react';
import { TopoPagina } from '@/components/shell/ModuloHub';
import {
    api,
    brl,
    BTN_PEQ,
    BTN_PEQ_PRI,
    BTN_PRI,
    BTN_SEC,
    CAMPO,
    CARTAO,
    dataBR,
    ERRO,
    hojeISO,
    Janela,
    mensagemErro,
    mesBR,
    mesMais,
    NOTA,
    numCampo,
    paraNumero,
    PILULA,
    ROTULO,
    S_AB,
    S_AVISO,
    S_MUDO,
    S_OK,
    S_RUIM,
    SELO,
    SUB,
    useAviso,
} from '../contas-pagar/components/fin';

const URL_RES = 'https://api.planoassistencialintegrado.com.br/fin_resultados.php';
const URL_BASE = 'https://api.planoassistencialintegrado.com.br/fin_base.php';

/* ============================== tipos ============================== */

type Nat = { id: number; codigo: string; pai: string | null; nome: string; grupo: boolean; classe: string | null };
type Lin = { n: number | null; a: number | null; l: number | null; m: string; f: 'PAI' | 'UNYMOS'; v: number };
type Rateio = { modo: 'receita' | 'percentual' | 'nao'; perc?: Record<string, number> };
type Dre = {
    regime: 'comp' | 'caixa';
    meses: string[];
    hoje: string;
    linhas: Lin[];
    naturezas: Nat[];
    areas: { id: number; nome: string }[];
    locais: { id: number; nome: string }[];
    orcado: Record<string, number>;
    fechados: string[];
    importados: Record<string, string[]>;
    pendencias: Record<'a_classificar' | 'sem_natureza' | 'pref_sem_nf', { n: number; v: number }>;
    rateio: Rateio;
};
type Semana = { ini: string; fim: string; atual: boolean; real: boolean; e: Record<string, number>; s: Record<string, number> };
type Fluxo = {
    hoje: string;
    semanas: Semana[];
    mens_estimada: number[];
    mens_media: number;
    contas: { nome: string; tipo: string; saldo: number }[];
    saldo: number;
    saldo_aplicacoes: number;
    saldo_minimo: number;
    vencidos: { e: number; s: number };
};

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (ym: string) => `${MES_CURTO[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const n0 = (v: number) => (Math.abs(v) < 0.005 ? '—' : `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const mil = (v: number) => {
    const a = Math.abs(v);
    return `${v < 0 ? '−' : ''}${a >= 1000 ? `${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};
const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—');
const SEG = 'inline-flex items-center gap-0.5 rounded-xl border border-[#C9D1DE] bg-white p-[3px] dark:border-white/[0.2] dark:bg-[#232B3F]';
const segBtn = (on: boolean) =>
    `inline-flex h-9 items-center justify-center rounded-[9px] px-3.5 text-[13.5px] font-extrabold leading-none ${on ? 'bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`;

/* ============================== estrutura da DRE ============================== */

type Sec = { id: string; rotulo: string; sinal: number; f?: (n: Nat | null) => boolean; soma?: string[] };
const SECOES: Sec[] = [
    { id: 'R', rotulo: 'Receita bruta', sinal: 1, f: (n) => n?.classe === 'RECEITA' },
    { id: 'D', rotulo: '(−) Deduções (Simples Nacional e devoluções)', sinal: -1, f: (n) => n?.classe === 'DEDUCAO' },
    { id: '=RL', rotulo: 'Receita líquida', sinal: 0, soma: ['R', 'D'] },
    { id: 'V', rotulo: '(−) Custos variáveis', sinal: -1, f: (n) => n?.classe === 'CUSTO_VARIAVEL' },
    { id: '=MC', rotulo: 'Margem de contribuição', sinal: 0, soma: ['R', 'D', 'V'] },
    { id: 'F', rotulo: '(−) Custos fixos', sinal: -1, f: (n) => n?.classe === 'CUSTO_FIXO' },
    { id: 'X', rotulo: '(−) Despesas operacionais', sinal: -1, f: (n) => !n || n.classe === 'DESPESA' },
    { id: '=RO', rotulo: 'Resultado operacional', sinal: 0, soma: ['R', 'D', 'V', 'F', 'X'] },
    { id: 'NE', rotulo: '(+) Entradas não operacionais', sinal: 1, f: (n) => n?.classe === 'NAO_OPERACIONAL' && n.codigo.startsWith('4') },
    { id: 'NS', rotulo: '(−) Investimentos, empréstimos e outras saídas', sinal: -1, f: (n) => n?.classe === 'NAO_OPERACIONAL' && n.codigo.startsWith('5') && !n.codigo.startsWith('5.4') },
    { id: '=RP', rotulo: 'Resultado do período', sinal: 0, soma: ['R', 'D', 'V', 'F', 'X', 'NE', 'NS'] },
    { id: 'S', rotulo: '(−) Distribuição de lucros e retiradas dos sócios', sinal: -1, f: (n) => !!n && n.codigo.startsWith('5.4') },
    { id: '=SA', rotulo: 'Saldo depois das retiradas', sinal: 0, soma: ['R', 'D', 'V', 'F', 'X', 'NE', 'NS', 'S'] },
];
type Col = { rotulo: string; m?: string; tot?: boolean; dlt?: boolean; f: (l: Lin) => number };

/* ============================== página ============================== */

export default function ResultadosPage() {
    const [aba, setAba] = useState<'dre' | 'fluxo' | 'iss' | 'cont'>('dre');
    const { avisar, aviso } = useAviso();
    const [janela, setJanela] = useState<null | 'config' | 'importar'>(null);
    const [versao, setVersao] = useState(0);
    const abas: [typeof aba, string][] = [
        ['dre', 'DRE'],
        ['fluxo', 'Fluxo de caixa'],
        ['iss', 'ISS retido'],
        ['cont', 'Contador'],
    ];
    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina
                    Icone={IconChartBar}
                    titulo="Resultados"
                    acoes={
                        <>
                            <button type="button" className={BTN_SEC} onClick={() => setJanela('importar')}>
                                <IconUpload size={18} /> Importar da Unymos
                            </button>
                            <button type="button" className={BTN_SEC} onClick={() => setJanela('config')}>
                                <IconAdjustmentsDollar size={18} /> Configurar
                            </button>
                        </>
                    }
                />
                <div className="flex flex-wrap gap-2" role="tablist">
                    {abas.map(([k, r]) => (
                        <button key={k} type="button" role="tab" aria-selected={aba === k} className={PILULA(aba === k)} onClick={() => setAba(k)}>
                            {r}
                        </button>
                    ))}
                </div>
                {aba === 'dre' ? <AbaDre versao={versao} /> : null}
                {aba === 'fluxo' ? <AbaFluxo versao={versao} /> : null}
                {aba === 'iss' ? <AbaIss /> : null}
                {aba === 'cont' ? <AbaContador avisar={avisar} /> : null}
            </div>
            {janela === 'config' ? (
                <Configurar
                    onFechar={() => setJanela(null)}
                    onFeito={(m) => {
                        avisar(m);
                        setJanela(null);
                        setVersao((v) => v + 1);
                    }}
                />
            ) : null}
            {janela === 'importar' ? (
                <Importar
                    onFechar={() => {
                        setJanela(null);
                        setVersao((v) => v + 1);
                    }}
                    avisar={avisar}
                />
            ) : null}
            {aviso}
        </div>
    );
}

/* ============================== DRE ============================== */

function AbaDre({ versao }: { versao: number }) {
    const hoje = hojeISO();
    const [regime, setRegime] = useState<'comp' | 'caixa'>('comp');
    const [vis, setVis] = useState<'meses' | 'comp' | 'areas' | 'locais'>('meses');
    const [ate, setAte] = useState(hoje.slice(0, 7));
    const [mes, setMes] = useState(mesMais(hoje.slice(0, 7), -1));
    const [d, setD] = useState<Dre | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(false);
    const [ab, setAb] = useState<Record<string, boolean>>({ R: true });
    const [drill, setDrill] = useState<{ nat: Nat | null; mes: string } | null>(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const j = await api(URL_RES, 'dre', undefined, `&regime=${regime}&de=${mesMais(ate, -11)}&ate=${ate}`);
            setD(j.dados);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar a DRE.');
            if (m) setErro(m);
        } finally {
            setCarregando(false);
        }
    }, [regime, ate]);
    useEffect(() => {
        void carregar();
    }, [carregar, versao]);

    const natPorId = useMemo(() => new Map((d?.naturezas ?? []).map((n) => [n.id, n])), [d]);
    const natCod = useMemo(() => new Map((d?.naturezas ?? []).map((n) => [n.codigo, n])), [d]);
    const nat = (l: Lin) => (l.n ? natPorId.get(l.n) ?? null : null);

    const cols: Col[] = useMemo(() => {
        if (!d) return [];
        const meses6 = d.meses.slice(-6);
        if (vis === 'meses')
            return meses6
                .map((m): Col => ({ rotulo: mesCurto(m) + (m === hoje.slice(0, 7) ? ' (parcial)' : ''), m, f: (l) => (l.m === m ? l.v : 0) }))
                .concat([{ rotulo: 'Total 6 meses', tot: true, f: (l) => (meses6.includes(l.m) ? l.v : 0) }]);
        if (vis === 'comp') {
            const ant = mesMais(mes, -1);
            const m3 = [1, 2, 3].map((k) => mesMais(mes, -k));
            return [
                { rotulo: mesCurto(mes), m: mes, f: (l) => (l.m === mes ? l.v : 0) },
                { rotulo: mesCurto(ant), m: ant, f: (l) => (l.m === ant ? l.v : 0) },
                { rotulo: 'Variação', dlt: true, f: (l) => (l.m === mes ? l.v : l.m === ant ? -l.v : 0) },
                { rotulo: 'Média 3 meses antes', f: (l) => (m3.includes(l.m) ? l.v / 3 : 0) },
            ];
        }
        if (vis === 'areas') {
            // receita de cada área no mês, para o Simples e para o rateio pela receita
            const rec: Record<number, number> = {};
            let recT = 0;
            d.linhas.forEach((l) => {
                if (l.m !== mes || nat(l)?.classe !== 'RECEITA') return;
                if (l.a) rec[l.a] = (rec[l.a] || 0) + l.v;
                recT += l.v;
            });
            const r = d.rateio || { modo: 'receita' };
            const parte = (aId: number) => (r.modo === 'percentual' ? (Number(r.perc?.[String(aId)]) || 0) / 100 : recT ? (rec[aId] || 0) / recT : 0);
            const comum = (l: Lin) => {
                const n = nat(l);
                if (l.a) return false;
                if (n?.codigo === '1.4.01') return true; // Simples acompanha a receita
                return r.modo !== 'nao' && n?.classe !== 'RECEITA' && n?.classe !== 'NAO_OPERACIONAL';
            };
            const simples = (l: Lin) => nat(l)?.codigo === '1.4.01';
            const areaCols: Col[] = d.areas.map((a) => ({
                rotulo: a.nome,
                f: (l) => (l.m !== mes ? 0 : l.a === a.id ? l.v : comum(l) ? l.v * (simples(l) ? (recT ? (rec[a.id] || 0) / recT : 0) : parte(a.id)) : 0),
            }));
            return areaCols.concat([
                { rotulo: 'Sem área (comum)', f: (l) => (l.m === mes && !l.a && !comum(l) ? l.v : 0) },
                { rotulo: 'Total', tot: true, f: (l) => (l.m === mes ? l.v : 0) },
            ]);
        }
        return d.locais
            .map((lc): Col => ({ rotulo: lc.nome, f: (l) => (l.m === mes && l.l === lc.id ? l.v : 0) }))
            .concat([
                { rotulo: 'Sem local', f: (l) => (l.m === mes && !l.l ? l.v : 0) },
                { rotulo: 'Total', tot: true, f: (l) => (l.m === mes ? l.v : 0) },
            ]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [d, vis, mes, natPorId]);

    // valor de uma seção (com sinal) numa coluna
    const valSec = useCallback(
        (s: Sec, c: Col): number => {
            if (!d) return 0;
            if (s.soma) return s.soma.reduce((a, id) => a + valSec(SECOES.find((x) => x.id === id)!, c), 0);
            return d.linhas.reduce((a, l) => (s.f!(nat(l)) ? a + c.f(l) : a), 0) * s.sinal;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [d, natPorId],
    );

    type Row = { k: string; tipo: 'sec' | 'tot' | 'fin' | 'pct' | 'grp' | 'nat'; cod?: string; nome: string; vals: number[]; sinal: number; aberto?: boolean; nat?: Nat | null };
    const rows: Row[] = useMemo(() => {
        if (!d) return [];
        const out: Row[] = [];
        const rb = cols.map((c) => valSec(SECOES[0], c));
        SECOES.forEach((s) => {
            const tot = !!s.soma;
            const vals = cols.map((c) => valSec(s, c));
            out.push({ k: s.id, tipo: s.id === '=SA' ? 'fin' : tot ? 'tot' : 'sec', nome: s.rotulo, vals, sinal: s.sinal, aberto: !!ab[s.id] });
            if (['=MC', '=RO', '=RP'].includes(s.id)) out.push({ k: s.id + '%', tipo: 'pct', nome: '% da receita bruta', vals: vals.map((v, i) => (rb[i] ? v / rb[i] : NaN)), sinal: 0 });
            if (tot || !ab[s.id]) return;
            // grupos (código com 2 níveis) e naturezas
            const ls = d.linhas.filter((l) => s.f!(nat(l)));
            const grupos = new Map<string, Lin[]>();
            ls.forEach((l) => {
                const n = nat(l);
                const g = n ? n.codigo.split('.').slice(0, 2).join('.') : '?';
                grupos.set(g, [...(grupos.get(g) || []), l]);
            });
            Array.from(grupos.keys())
                .sort()
                .forEach((g) => {
                    const gl = grupos.get(g)!;
                    const kg = s.id + g;
                    out.push({ k: kg, tipo: 'grp', cod: g === '?' ? '' : g, nome: g === '?' ? 'Sem natureza (a classificar)' : natCod.get(g)?.nome || g, vals: cols.map((c) => gl.reduce((a, l) => a + c.f(l), 0) * s.sinal), sinal: s.sinal, aberto: !!ab[kg] });
                    if (!ab[kg]) return;
                    const porNat = new Map<number, Lin[]>();
                    gl.forEach((l) => porNat.set(l.n || 0, [...(porNat.get(l.n || 0) || []), l]));
                    Array.from(porNat.keys())
                        .sort((a, b) => (natPorId.get(a)?.codigo || '').localeCompare(natPorId.get(b)?.codigo || ''))
                        .forEach((nid) => {
                            const nl = porNat.get(nid)!;
                            const n = nid ? natPorId.get(nid) ?? null : null;
                            out.push({ k: kg + ':' + nid, tipo: 'nat', cod: n?.codigo || '', nome: n?.nome || 'Sem natureza', vals: cols.map((c) => nl.reduce((a, l) => a + c.f(l), 0) * s.sinal), sinal: s.sinal, nat: n });
                        });
                });
        });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [d, cols, ab, valSec]);

    const kpiCol: Col | null = d ? { rotulo: '', m: vis === 'meses' ? mesMais(hoje.slice(0, 7), -1) : mes, f: (l) => (l.m === (vis === 'meses' ? mesMais(hoje.slice(0, 7), -1) : mes) ? l.v : 0) } : null;
    const k = (id: string) => (kpiCol ? valSec(SECOES.find((s) => s.id === id)!, kpiCol) : 0);
    const kRB = k('R'),
        kRL = k('=RL'),
        kMC = k('=MC'),
        kRO = k('=RO');
    const fixos = -(k('F') + k('X'));
    const mcp = kRL ? kMC / kRL : 0;
    const mesK = kpiCol?.m || mes;
    const fechado = !!d?.fechados.includes(mesK);
    const pend = d?.pendencias;
    const temPend = !!pend && (pend.a_classificar.n > 0 || pend.sem_natureza.n > 0 || pend.pref_sem_nf.n > 0);
    const grid = { gridTemplateColumns: `minmax(300px,1.6fr) repeat(${cols.length}, minmax(112px,1fr))` };
    const mesesSel = d?.meses.slice().reverse() ?? [];

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <span className={SEG}>
                    <button type="button" className={segBtn(regime === 'comp')} onClick={() => setRegime('comp')}>
                        Competência
                    </button>
                    <button type="button" className={segBtn(regime === 'caixa')} onClick={() => setRegime('caixa')}>
                        Caixa
                    </button>
                </span>
                <span className={SEG}>
                    {(
                        [
                            ['meses', 'Mês a mês'],
                            ['comp', 'Comparar'],
                            ['areas', 'Por área'],
                            ['locais', 'Por local'],
                        ] as [typeof vis, string][]
                    ).map(([kk, r]) => (
                        <button key={kk} type="button" className={segBtn(vis === kk)} onClick={() => setVis(kk)}>
                            {r}
                        </button>
                    ))}
                </span>
                {vis === 'meses' ? (
                    <select className="h-11 rounded-xl bg-white px-3 text-[15px] dark:bg-[#232B3F]" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até o mês">
                        {Array.from({ length: 24 }, (_, i) => mesMais(hoje.slice(0, 7), -i)).map((m) => (
                            <option key={m} value={m}>
                                até {mesBR(m).toLowerCase()}
                            </option>
                        ))}
                    </select>
                ) : (
                    <select className="h-11 rounded-xl bg-white px-3 text-[15px] dark:bg-[#232B3F]" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
                        {mesesSel.map((m) => (
                            <option key={m} value={m}>
                                {mesBR(m)}
                            </option>
                        ))}
                    </select>
                )}
                <span className="flex-1" />
                <button type="button" className={BTN_PEQ} disabled={!d} onClick={() => d && void baixarDre(d, rows, cols, regime)}>
                    <IconDownload size={18} /> Planilha
                </button>
                <button type="button" className={BTN_PEQ} onClick={() => void carregar()} aria-label="Atualizar">
                    <IconRefresh size={18} />
                </button>
            </div>

            {erro ? <div className={ERRO}>{erro}</div> : null}

            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <Kpi k={`Receita líquida · ${mesCurto(mesK)}`} v={mil(kRL)} s={`bruta ${mil(kRB)}${d?.orcado?.[mesK] ? ` · orçado ${mil(d.orcado[mesK])}` : ''}`} />
                <Kpi k="Margem de contribuição" v={pct(mcp)} s={`${mil(kMC)} depois dos custos variáveis`} />
                <Kpi k="Resultado operacional" v={mil(kRO)} s={`${pct(kRB ? kRO / kRB : NaN)} da receita bruta`} cls={kRO >= 0 ? 'text-[#3F5A0A] dark:text-[#CFE38A]' : 'text-[#B42318] dark:text-[#FF9C92]'} />
                <Kpi k="Ponto de equilíbrio" v={mcp > 0 ? mil(fixos / mcp) : '—'} s={`receita líquida que cobre custos fixos e despesas (${mil(fixos)})`} escuro />
            </div>

            <div className="flex flex-wrap gap-2">
                <span className={`${SELO} ${fechado ? S_OK : S_AVISO}`}>
                    {mesBR(mesK)}: {fechado ? 'mês fechado' : 'mês aberto (ainda pode mudar)'}
                </span>
                {d && Object.keys(d.importados).length ? <span className={`${SELO} !whitespace-normal !shrink ${S_AB}`}>Inclui o importado da Unymos: {Object.keys(d.importados).sort().map(mesCurto).join(', ')}</span> : null}
                {d && !Object.keys(d.importados).length ? <span className={`${SELO} !whitespace-normal !shrink ${S_MUDO}`}>Sem importação da Unymos no período: mensalidades e contas a pagar de lá não aparecem</span> : null}
            </div>

            {temPend && regime === 'comp' ? (
                <div className={`${NOTA} ${S_AVISO} items-center`}>
                    <IconAlertTriangle size={18} className="shrink-0" />
                    <span className="flex-1">
                        Pendências que mudam a DRE:
                        {pend!.a_classificar.n ? ` ${pend!.a_classificar.n} título(s) em natureza de pendência (${brl(pend!.a_classificar.v)});` : ''}
                        {pend!.sem_natureza.n ? ` ${pend!.sem_natureza.n} lançamento(s) sem natureza (${brl(pend!.sem_natureza.v)});` : ''}
                        {pend!.pref_sem_nf.n ? ` ${pend!.pref_sem_nf.n} OS da Prefeitura de mês fechado sem NF (${brl(pend!.pref_sem_nf.v)});` : ''} corrija no contas a pagar ou a receber.
                    </span>
                </div>
            ) : null}

            <div className={`${CARTAO} max-h-[calc(100dvh-260px)] overflow-auto`}>
                {carregando && !d ? <div className="px-4 py-8 text-center text-[#5B6478]">Carregando…</div> : null}
                {d ? (
                    <div className="min-w-max text-[14px]">
                        <div className="sticky top-0 z-[3] grid border-b border-[#E3E8F0] bg-[#F6F8FB] text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:border-white/[0.08] dark:bg-[#1C2334] dark:text-[#AEB9CF]" style={grid}>
                            <span className="sticky left-0 bg-[#F6F8FB] px-3 py-2.5 dark:bg-[#1C2334]">{regime === 'caixa' ? 'Regime de caixa' : 'Regime de competência'}</span>
                            {cols.map((c) => (
                                <span key={c.rotulo} className="px-3 py-2.5 text-right">
                                    {c.rotulo}
                                </span>
                            ))}
                        </div>
                        {rows.map((r) => {
                            const fundo =
                                r.tipo === 'tot'
                                    ? 'bg-[#313C55] text-white font-extrabold'
                                    : r.tipo === 'fin'
                                      ? 'bg-[#E9EFF6] font-extrabold dark:bg-[#3D6A99]/25'
                                      : r.tipo === 'sec'
                                        ? 'bg-[#F6F8FB] font-extrabold dark:bg-[#1C2334]'
                                        : r.tipo === 'pct'
                                          ? 'text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]'
                                          : 'bg-white dark:bg-[#232B3F]';
                            const fundoFixo = r.tipo === 'tot' ? 'bg-[#313C55]' : r.tipo === 'fin' ? 'bg-[#E9EFF6] dark:bg-[#2A3550]' : r.tipo === 'sec' ? 'bg-[#F6F8FB] dark:bg-[#1C2334]' : 'bg-white dark:bg-[#232B3F]';
                            const abre = r.tipo === 'sec' || r.tipo === 'grp';
                            return (
                                <div key={r.k} className={`grid min-h-10 items-center border-b border-[#EEF2F7] dark:border-white/[0.06] ${fundo}`} style={grid}>
                                    <span className={`sticky left-0 z-[1] flex items-center gap-1.5 px-2 py-1.5 ${fundoFixo} ${r.tipo === 'grp' ? 'pl-7 font-bold' : r.tipo === 'nat' ? 'pl-14' : ''}`}>
                                        {abre ? (
                                            <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-black/5" aria-label="Abrir ou fechar" onClick={() => setAb((o) => ({ ...o, [r.k]: !o[r.k] }))}>
                                                {r.aberto ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                                            </button>
                                        ) : (
                                            <span className="w-7" />
                                        )}
                                        {r.cod ? <span className="min-w-12 text-[12.5px] font-bold tabular-nums opacity-70">{r.cod}</span> : null}
                                        <span className="whitespace-nowrap">{r.nome}</span>
                                    </span>
                                    {r.vals.map((v, i) => {
                                        const c = cols[i];
                                        const txt = r.tipo === 'pct' ? (c.dlt ? '' : pct(v)) : c.dlt ? (Math.abs(v) < 0.005 ? '—' : `${v > 0 ? '+' : ''}${mil(v)}`) : n0(v);
                                        const cor = c.dlt && r.tipo !== 'pct' ? (v * (r.sinal || 1) >= 0 ? 'text-[#3F5A0A] dark:text-[#CFE38A]' : 'text-[#B42318] dark:text-[#FF9C92]') : v < 0 && (r.tipo === 'tot' || r.tipo === 'fin') ? (r.tipo === 'tot' ? 'text-[#FFB4AB]' : 'text-[#B42318]') : '';
                                        const clica = r.tipo === 'nat' && !c.dlt && !c.tot && (c.m || vis !== 'meses');
                                        return clica ? (
                                            <button key={i} type="button" className={`h-full px-3 text-right tabular-nums hover:bg-[#E9EFF6] hover:underline dark:hover:bg-[#3D6A99]/25 ${cor}`} onClick={() => setDrill({ nat: r.nat ?? null, mes: c.m || mes })}>
                                                {txt}
                                            </button>
                                        ) : (
                                            <span key={i} className={`px-3 text-right tabular-nums ${cor}`}>
                                                {txt}
                                            </span>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>
            <div className={SUB}>
                {vis === 'locais'
                    ? 'Por local: as despesas com local no rateio (energia, água, aluguel, manutenção, combustível e veículos). O que não tem local fica em "Sem local".'
                    : vis === 'areas'
                      ? `Por área de negócio: receitas e custos pela área do lançamento; o Simples acompanha a receita de cada área. Custos fixos e despesas comuns: ${
                            d?.rateio?.modo === 'percentual' ? 'divididos pelos percentuais configurados' : d?.rateio?.modo === 'nao' ? 'ficam em "Sem área" (sem rateio)' : 'divididos pela receita de cada área'
                        } (Configurar).`
                      : regime === 'caixa'
                        ? 'Caixa: pela data em que o dinheiro entrou ou saiu (baixa). Juros e multa ficam à parte; o ISS retido entra como dedução. Clique num valor de natureza para ver os lançamentos.'
                        : 'Competência: pelo mês do serviço ou da despesa, pago ou não. A OS entra no mês dela (a da Prefeitura no mês do atendimento, não da NF); o importado da Unymos entra pelo mês do pagamento. Clique num valor de natureza para ver os lançamentos.'}
            </div>
            {drill ? <Detalhe regime={regime} nat={drill.nat} mes={drill.mes} onFechar={() => setDrill(null)} /> : null}
        </>
    );
}

function Kpi({ k, v, s, cls = '', escuro = false }: { k: string; v: string; s: string; cls?: string; escuro?: boolean }) {
    return (
        <div className={`flex min-w-0 flex-col gap-0.5 rounded-2xl border px-4 py-3 ${escuro ? 'border-[#313C55] bg-[#313C55] text-white' : 'border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]'}`}>
            <span className={`text-[11.5px] font-extrabold uppercase tracking-[0.06em] ${escuro ? 'text-[#D6DCE8]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>{k}</span>
            <span className={`text-[22px] font-extrabold leading-tight tabular-nums ${cls}`}>{v}</span>
            <span className={`text-[12.5px] ${escuro ? 'text-[#D6DCE8]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>{s}</span>
        </div>
    );
}

function Detalhe({ regime, nat, mes, onFechar }: { regime: string; nat: Nat | null; mes: string; onFechar: () => void }) {
    const [d, setD] = useState<{ linhas: any[]; total: number; limitado: boolean } | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    useEffect(() => {
        void (async () => {
            try {
                const j = await api(URL_RES, 'detalhe', undefined, `&regime=${regime}&mes=${mes}${nat ? `&natureza_id=${nat.id}` : ''}`);
                setD(j.dados);
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível abrir os lançamentos.');
                if (m) setErro(m);
            }
        })();
    }, [regime, nat, mes]);
    return (
        <Janela
            titulo={nat ? `${nat.codigo} ${nat.nome}` : 'Sem natureza'}
            sub={`${regime === 'caixa' ? 'Caixa' : 'Competência'} · ${mesBR(mes)}${d ? ` · ${brl(d.total)}` : ''}`}
            largura="max-w-4xl"
            onFechar={onFechar}
            rodape={
                <button type="button" className={BTN_SEC} onClick={onFechar}>
                    Voltar
                </button>
            }
        >
            {!d && !erro ? <div className="py-6 text-center text-[#5B6478]">Carregando…</div> : null}
            {d ? (
                <div className={`${CARTAO} overflow-hidden`}>
                    {d.linhas.map((l, i) => (
                        <div key={i} className="grid grid-cols-[88px_minmax(0,1fr)_120px] items-center gap-3 border-t border-[#EEF2F7] px-3 py-2.5 text-[14px] first:border-t-0 dark:border-white/[0.06] lg:grid-cols-[88px_minmax(0,1.5fr)_140px_minmax(0,1fr)_120px]">
                            <span className="tabular-nums">{dataBR(l.data) || '—'}</span>
                            <span className="min-w-0">
                                <b className="line-clamp-2 break-words">{l.nome}</b>
                                <span className={`${SUB} line-clamp-1`}>{l.desc}</span>
                            </span>
                            <span className="hidden lg:block">{l.origem}</span>
                            <span className={`${SUB} hidden lg:block`}>{[l.area, l.local].filter(Boolean).join(' · ') || '—'}</span>
                            <b className="text-right tabular-nums">{brl(l.valor)}</b>
                        </div>
                    ))}
                    {!d.linhas.length ? <div className="px-4 py-6 text-center text-[#5B6478]">Nenhum lançamento.</div> : null}
                </div>
            ) : null}
            {d?.limitado ? <div className={SUB}>Mostrando os 300 maiores. Para a lista inteira, use a planilha do pacote do contador.</div> : null}
            <div className={SUB}>Natureza errada se corrige no título (aba Natureza do contas a pagar ou a receber); num mês fechado, só depois que a Gestão reabrir.</div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

async function baixarDre(d: Dre, rows: { tipo: string; cod?: string; nome: string; vals: number[] }[], cols: Col[], regime: string) {
    const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('DRE');
    ws.addRow([`DRE · ${regime === 'caixa' ? 'regime de caixa' : 'regime de competência'} · PAI — Plano Assistencial Integrado`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    const h = ws.addRow(['Código', 'Linha', ...cols.map((c) => c.rotulo)]);
    h.font = { bold: true };
    rows.forEach((r) => {
        const row = ws.addRow([r.cod || '', r.nome, ...r.vals.map((v) => (r.tipo === 'pct' ? (Number.isFinite(v) ? v : null) : Math.round(v * 100) / 100))]);
        if (r.tipo === 'tot' || r.tipo === 'sec' || r.tipo === 'fin') row.font = { bold: true };
        row.eachCell((c: any, i: number) => {
            if (i > 2) c.numFmt = r.tipo === 'pct' ? '0.0%' : '#,##0.00;[Red]-#,##0.00';
        });
    });
    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 52;
    cols.forEach((_, i) => (ws.getColumn(i + 3).width = 16));
    await salvarXlsx(wb, `dre-${regime}-${d.meses[d.meses.length - 1]}.xlsx`);
}

async function salvarXlsx(wb: any, nome: string) {
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ============================== fluxo de caixa ============================== */

const ENTRADAS: [string, string][] = [
    ['rec', 'A receber (OS e avulsos)'],
    ['pref', 'Prefeitura (NFs)'],
    ['cart', 'Cartões a receber (Cielo)'],
    ['mens', 'Mensalidades'],
    ['outros', 'Outras entradas'],
];
const SAIDAS: [string, string][] = [
    ['forn', 'Fornecedores e contas'],
    ['folha', 'Folha e encargos'],
    ['imp', 'Simples e tributos'],
    ['ret', 'Retiradas dos sócios'],
    ['outros', 'Outras saídas'],
];

function AbaFluxo({ versao }: { versao: number }) {
    const [f, setF] = useState<Fluxo | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [modo, setModo] = useState<'sem' | 'mes'>('sem');
    const [mens, setMens] = useState(true);
    const [apl, setApl] = useState(false);
    const [ab, setAb] = useState<{ e?: boolean; s?: boolean }>({});
    useEffect(() => {
        void (async () => {
            try {
                const j = await api(URL_RES, 'fluxo');
                setF(j.dados);
                setErro(null);
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível carregar o fluxo de caixa.');
                if (m) setErro(m);
            }
        })();
    }, [versao]);

    const per = useMemo(() => {
        if (!f) return [];
        const sem = f.semanas.map((s, i) => ({
            l: `${s.ini.slice(8, 10)}/${s.ini.slice(5, 7)}`,
            real: s.real,
            atual: s.atual,
            e: { ...s.e, mens: (s.e.mens || 0) + (mens && !s.real ? f.mens_estimada[i] || 0 : 0) } as Record<string, number>,
            s: { ...s.s } as Record<string, number>,
            m: s.ini.slice(0, 7),
        }));
        if (modo === 'sem') return sem;
        const g = new Map<string, (typeof sem)[number]>();
        sem.forEach((s) => {
            const x = g.get(s.m) || { l: mesCurto(s.m), real: true, atual: false, e: { rec: 0, pref: 0, cart: 0, mens: 0, outros: 0 } as Record<string, number>, s: { forn: 0, folha: 0, imp: 0, ret: 0, outros: 0 } as Record<string, number>, m: s.m };
            x.real = x.real && s.real;
            x.atual = x.atual || s.atual;
            ENTRADAS.forEach(([k]) => (x.e[k] += s.e[k] || 0));
            SAIDAS.forEach(([k]) => (x.s[k] += s.s[k] || 0));
            g.set(s.m, x);
        });
        return Array.from(g.values());
    }, [f, modo, mens]);

    if (erro) return <div className={ERRO}>{erro}</div>;
    if (!f) return <div className="py-8 text-center text-[#5B6478]">Carregando…</div>;

    const ent = (p: (typeof per)[number]) => ENTRADAS.reduce((a, [k]) => a + (p.e[k] || 0), 0);
    const sai = (p: (typeof per)[number]) => SAIDAS.reduce((a, [k]) => a + (p.s[k] || 0), 0);
    const iA = per.findIndex((p) => p.atual);
    const saldoHoje = f.saldo + (apl ? f.saldo_aplicacoes : 0);
    const minimo = f.saldo_minimo;
    // saldo no início do período atual = saldo de hoje; para trás desconta o realizado, para frente soma o previsto
    const sIni: number[] = new Array(per.length).fill(0);
    const sFim: number[] = new Array(per.length).fill(0);
    if (iA >= 0) {
        sIni[iA] = saldoHoje;
        for (let i = iA; i < per.length; i++) {
            if (i > iA) sIni[i] = sFim[i - 1];
            sFim[i] = sIni[i] + ent(per[i]) - sai(per[i]);
        }
        for (let i = iA - 1; i >= 0; i--) {
            sFim[i] = sIni[i + 1];
            sIni[i] = sFim[i] - ent(per[i]) + sai(per[i]);
        }
    }
    const futuros = per.map((_, i) => i).filter((i) => i >= iA);
    const baixo = per.map((_, i) => i >= iA && sFim[i] < minimo);
    const iB = baixo.indexOf(true);
    const maxB = Math.max(1, ...per.map((p) => Math.max(ent(p), sai(p))));
    const maxS = Math.max(1, ...sFim, minimo) * 1.1;
    const entPrev = futuros.reduce((a, i) => a + ent(per[i]), 0);
    const saiPrev = futuros.reduce((a, i) => a + sai(per[i]), 0);
    const menor = futuros.length ? Math.min(...futuros.map((i) => sFim[i])) : saldoHoje;
    const grid = { gridTemplateColumns: `230px repeat(${per.length}, minmax(100px,1fr))` };

    const linha = (nome: string, vals: number[], tipo: 'sec' | 'nat' | 'tot', toggle?: () => void, aberto?: boolean) => (
        <div key={nome} className={`grid min-h-10 items-center border-b border-[#EEF2F7] dark:border-white/[0.06] ${tipo === 'tot' ? 'bg-[#313C55] font-extrabold text-white' : tipo === 'sec' ? 'bg-[#F6F8FB] font-extrabold dark:bg-[#1C2334]' : ''}`} style={grid}>
            <span className={`sticky left-0 z-[1] flex items-center gap-1.5 px-2 py-1.5 ${tipo === 'tot' ? 'bg-[#313C55]' : tipo === 'sec' ? 'bg-[#F6F8FB] dark:bg-[#1C2334]' : 'bg-white pl-10 dark:bg-[#232B3F]'}`}>
                {toggle ? (
                    <button type="button" className="grid size-7 place-items-center rounded-lg hover:bg-black/5" onClick={toggle} aria-label="Abrir ou fechar">
                        {aberto ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                    </button>
                ) : tipo !== 'nat' ? (
                    <span className="w-7" />
                ) : null}
                {nome}
            </span>
            {vals.map((v, i) => (
                <span key={i} className={`px-3 text-right tabular-nums ${tipo === 'tot' && baixo[i] ? 'text-[#FFB4AB]' : ''} ${per[i].real ? '' : 'italic'}`}>
                    {n0(v)}
                </span>
            ))}
        </div>
    );

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <span className={SEG}>
                    <button type="button" className={segBtn(modo === 'sem')} onClick={() => setModo('sem')}>
                        Semanal
                    </button>
                    <button type="button" className={segBtn(modo === 'mes')} onClick={() => setModo('mes')}>
                        Mensal
                    </button>
                </span>
                <Marca on={mens} onClick={() => setMens(!mens)} rotulo={`Mensalidades estimadas (média de 3 meses importados: ${brl(f.mens_media)} por mês)`} />
                <Marca on={apl} onClick={() => setApl(!apl)} rotulo="Contar aplicações no saldo" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <Kpi k="Saldo hoje" v={mil(saldoHoje)} s={apl ? 'bancos, caixas e aplicações' : `bancos e caixas (aplicações: ${mil(f.saldo_aplicacoes)})`} escuro />
                <Kpi k="Entradas previstas" v={mil(entPrev)} s={`até ${per[per.length - 1]?.l}${mens ? ' · com mensalidades estimadas' : ''}`} />
                <Kpi k="Saídas previstas" v={mil(saiPrev)} s="contas a pagar do PAI e da Unymos" />
                <Kpi k="Menor saldo previsto" v={mil(menor)} s={`saldo mínimo: ${mil(minimo)}`} cls={iB >= 0 ? 'text-[#B42318] dark:text-[#FF9C92]' : 'text-[#3F5A0A] dark:text-[#CFE38A]'} />
            </div>
            {iB >= 0 ? (
                <div className={`${NOTA} ${S_RUIM} items-center`}>
                    <IconAlertTriangle size={18} className="shrink-0" />
                    <span>
                        O saldo previsto fica abaixo do mínimo ({brl(minimo)}) em {per[iB].l} ({brl(sFim[iB])}). Antecipe cobranças, adie pagamentos ou resgate aplicação.
                    </span>
                </div>
            ) : null}
            {f.vencidos.e + f.vencidos.s > 0 ? (
                <div className={SUB}>
                    Títulos vencidos e não pagos entram no período atual: a receber {brl(f.vencidos.e)}, a pagar {brl(f.vencidos.s)}.
                </div>
            ) : null}
            <div className={`${CARTAO} p-4`}>
                <div className="relative flex h-[220px] items-end gap-2 border-b border-[#E3E8F0] pb-6 dark:border-white/[0.1]">
                    <div className="absolute inset-x-0 z-0 border-t-2 border-dashed border-[#E0B400]" style={{ bottom: `${24 + (minimo / maxS) * 180}px` }} title="Saldo mínimo" />
                    {per.map((p, i) => (
                        <div key={i} className="relative z-[1] flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                            <div className="flex h-full w-full items-end justify-center gap-[3px]">
                                <span className={`block w-[38%] max-w-[22px] rounded-t ${p.real ? 'bg-[#B3CE52]' : 'bg-[#B3CE52]/55'}`} style={{ height: `${(ent(p) / maxB) * 100}%` }} />
                                <span className={`block w-[38%] max-w-[22px] rounded-t ${p.real ? 'bg-[#E8857A]' : 'bg-[#E8857A]/55'}`} style={{ height: `${(sai(p) / maxB) * 100}%` }} />
                            </div>
                            <span
                                className={`absolute left-1/2 size-3 -translate-x-1/2 rounded-full ring-[3px] ring-white dark:ring-[#232B3F] ${baixo[i] ? 'bg-[#B42318]' : 'bg-[#313C55] dark:bg-[#F2CB3F]'}`}
                                style={{ bottom: `${Math.max(0, (sFim[i] / maxS) * 180) - 6}px` }}
                                title={`Saldo no fim: ${brl(sFim[i])}`}
                            />
                            <span className={`absolute -bottom-6 whitespace-nowrap text-[11.5px] font-bold ${p.atual ? 'text-[#313C55] dark:text-white' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>{p.l}</span>
                        </div>
                    ))}
                </div>
                <div className={`${SUB} mt-7`}>Barras: entradas (verde) e saídas (vermelho), mais claras no previsto. Ponto: saldo no fim do período. Linha tracejada: saldo mínimo.</div>
            </div>
            <div className={`${CARTAO} overflow-auto`}>
                <div className="min-w-max text-[14px]">
                    <div className="sticky top-0 z-[3] grid border-b border-[#E3E8F0] bg-[#F6F8FB] text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:border-white/[0.08] dark:bg-[#1C2334] dark:text-[#AEB9CF]" style={grid}>
                        <span className="sticky left-0 bg-[#F6F8FB] px-3 py-2.5 dark:bg-[#1C2334]">{modo === 'sem' ? 'Semana de' : 'Mês'}</span>
                        {per.map((p, i) => (
                            <span key={i} className="px-3 py-2.5 text-right">
                                {p.l}
                                {p.atual ? ' · atual' : p.real ? '' : ' · prev.'}
                            </span>
                        ))}
                    </div>
                    {linha('Saldo no início', sIni, 'sec')}
                    {linha('Entradas', per.map(ent), 'sec', () => setAb({ ...ab, e: !ab.e }), ab.e)}
                    {ab.e ? ENTRADAS.map(([k, r]) => linha(r, per.map((p) => p.e[k] || 0), 'nat')) : null}
                    {linha('Saídas', per.map((p) => -sai(p)), 'sec', () => setAb({ ...ab, s: !ab.s }), ab.s)}
                    {ab.s ? SAIDAS.map(([k, r]) => linha(r, per.map((p) => -(p.s[k] || 0)), 'nat')) : null}
                    {linha('Saldo no fim', sFim, 'tot')}
                </div>
            </div>
            <div className={SUB}>
                Realizado: baixas do PAI Conecta e o importado da Unymos. Previsto (em itálico): títulos a receber e a pagar em aberto pelo vencimento, cartões pela previsão da Cielo, NFs da Prefeitura pelo vencimento
                (sem o ISS retido), contas a pagar da Unymos pelo relatório de previsão importado e mensalidades estimadas. Saldo de hoje pela Tesouraria:{' '}
                {f.contas
                    .filter((c) => (apl || c.tipo !== 'APLICACAO') && Math.abs(c.saldo) >= 0.005)
                    .map((c) => `${c.nome} ${brl(c.saldo)}`)
                    .join(' · ')}
                .
            </div>
        </>
    );
}

function Marca({ on, onClick, rotulo }: { on: boolean; onClick: () => void; rotulo: string }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={on} className="flex min-h-11 items-center gap-2.5 rounded-xl bg-white px-3 text-left text-[14px] font-bold dark:bg-[#232B3F]">
            <span className={`grid size-[22px] shrink-0 place-items-center rounded-md border-2 text-[13px] ${on ? 'border-[#313C55] bg-[#313C55] text-white' : 'border-[#C9D1DE]'}`}>{on ? '✓' : ''}</span>
            <span>{rotulo}</span>
        </button>
    );
}

/* ============================== ISS retido ============================== */

function AbaIss() {
    const hoje = hojeISO();
    const [mes, setMes] = useState(hoje.slice(0, 7));
    const [por, setPor] = useState<'rec' | 'em'>('rec');
    const [d, setD] = useState<{ linhas: any[]; retidas_sem_recebimento: number } | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    useEffect(() => {
        void (async () => {
            try {
                const j = await api(URL_RES, 'iss', undefined, `&mes=${mes}&por=${por}`);
                setD(j.dados);
                setErro(null);
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível carregar o ISS.');
                if (m) setErro(m);
            }
        })();
    }, [mes, por]);
    const ret = (d?.linhas ?? []).filter((l) => l.retido);
    const issRet = ret.reduce((a, l) => a + l.iss, 0);
    const issDas = (d?.linhas ?? []).filter((l) => !l.retido).reduce((a, l) => a + l.iss, 0);
    const exportar = async () => {
        const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('ISS retido');
        ws.addRow([`ISS das NFs da Prefeitura · ${mesBR(mes)} · ${por === 'rec' ? 'pelo mês do recebimento' : 'pelo mês de emissão'}`]).font = { bold: true };
        ws.addRow([]);
        ws.addRow(['NF', 'Tomador', 'Empenho', 'Atendimentos', 'Emitida', 'Recebida', 'Valor', 'Alíquota %', 'ISS', 'Retido na fonte']).font = { bold: true };
        (d?.linhas ?? []).forEach((l) => ws.addRow([l.numero, l.convenio, l.empenho, mesBR(l.competencia), dataBR(l.emissao), dataBR(l.recebida) || 'a receber', l.valor, l.aliquota, l.iss, l.retido ? 'sim' : 'não']));
        ws.addRow([]);
        ws.addRow(['', 'ISS retido na fonte (abater no PGDAS)', '', '', '', '', '', '', issRet]).font = { bold: true };
        ws.addRow(['', 'ISS não retido (vai no DAS)', '', '', '', '', '', '', issDas]);
        [8, 40, 14, 16, 12, 12, 14, 11, 12, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
        await salvarXlsx(wb, `iss-retido-${mes}.xlsx`);
    };
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <span className={SEG}>
                    <button type="button" className={segBtn(por === 'rec')} onClick={() => setPor('rec')}>
                        Pelo mês do recebimento
                    </button>
                    <button type="button" className={segBtn(por === 'em')} onClick={() => setPor('em')}>
                        Pelo mês de emissão
                    </button>
                </span>
                <select className="h-11 rounded-xl bg-white px-3 text-[15px] dark:bg-[#232B3F]" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
                    {Array.from({ length: 18 }, (_, i) => mesMais(hoje.slice(0, 7), -i)).map((m) => (
                        <option key={m} value={m}>
                            {mesBR(m)}
                        </option>
                    ))}
                </select>
                <span className="flex-1" />
                <button type="button" className={BTN_PEQ_PRI} disabled={!d?.linhas.length} onClick={() => void exportar()}>
                    <IconDownload size={18} /> Relatório para o contador
                </button>
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <Kpi k="NFs no mês" v={String(d?.linhas.length ?? 0)} s={`${brl((d?.linhas ?? []).reduce((a, l) => a + l.valor, 0))} em notas`} />
                <Kpi k="ISS retido na fonte" v={brl(issRet)} s={`${ret.length} NF(s) · informar no PGDAS para não pagar de novo`} escuro />
                <Kpi k="ISS no Simples (DAS)" v={brl(issDas)} s="convênios que não retêm" />
                <Kpi k="Retidas sem recebimento" v={String(d?.retidas_sem_recebimento ?? 0)} s="NFs com ISS retido esperando o depósito" />
            </div>
            <div className={NOTA}>
                <span>
                    {por === 'rec'
                        ? 'Pelo mês do recebimento: o ISS retido conta no mês em que a Prefeitura pagou (data da baixa). É o que o escritório usa para abater no PGDAS daquele mês [confirmar com o contador].'
                        : 'Pelo mês de emissão: as NFs emitidas no mês, recebidas ou não, para conferir com as notas do portal da Prefeitura.'}
                </span>
            </div>
            <div className={`${CARTAO} overflow-x-auto`}>
                <div className="min-w-[980px]">
                    <div className="grid grid-cols-[70px_minmax(0,1.6fr)_110px_100px_100px_120px_80px_110px_170px] gap-3 bg-[#F6F8FB] px-4 py-2.5 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                        <span>NF</span>
                        <span>Tomador</span>
                        <span>Atendimentos</span>
                        <span>Emitida</span>
                        <span>Recebida</span>
                        <span className="text-right">Valor</span>
                        <span className="text-right">Alíquota</span>
                        <span className="text-right">ISS</span>
                        <span>Situação do ISS</span>
                    </div>
                    {(d?.linhas ?? []).map((l, i) => (
                        <div key={i} className="grid grid-cols-[70px_minmax(0,1.6fr)_110px_100px_100px_120px_80px_110px_170px] items-center gap-3 border-t border-[#EEF2F7] px-4 py-2.5 text-[14px] dark:border-white/[0.06]">
                            <b>{l.numero}</b>
                            <span className="min-w-0">
                                <span className="block break-words">{l.convenio}</span>
                                <span className={SUB}>empenho {l.empenho}</span>
                            </span>
                            <span>{mesCurto(l.competencia)}</span>
                            <span>{dataBR(l.emissao)}</span>
                            <span>{dataBR(l.recebida) || 'a receber'}</span>
                            <span className="text-right tabular-nums">{brl(l.valor)}</span>
                            <span className="text-right tabular-nums">{numCampo(l.aliquota)}%</span>
                            <b className="text-right tabular-nums">{brl(l.iss)}</b>
                            <span>
                                <span className={`${SELO} ${l.retido ? (l.recebida ? S_OK : S_AVISO) : S_MUDO}`}>{l.retido ? (l.recebida ? 'Retido · abater no PGDAS' : 'Retido · aguardando depósito') : 'Não retido · vai no DAS'}</span>
                            </span>
                        </div>
                    ))}
                    {d && !d.linhas.length ? <div className="px-4 py-8 text-center text-[#5B6478]">Nenhuma NF neste mês.</div> : null}
                </div>
            </div>
        </>
    );
}

/* ============================== contador ============================== */

function AbaContador({ avisar }: { avisar: (m: string) => void }) {
    const hoje = hojeISO();
    const [mes, setMes] = useState(mesMais(hoje.slice(0, 7), -1));
    const [p, setP] = useState<any | null>(null);
    const [cfg, setCfg] = useState<{ naturezas: { id: number; codigo: string; nome: string; conta: string | null }[] } | null>(null);
    const [contas, setContas] = useState<Record<number, string>>({});
    const [filtro, setFiltro] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const carregar = useCallback(async () => {
        try {
            const [j, c] = await Promise.all([api(URL_RES, 'pacote', undefined, `&mes=${mes}`), api(URL_RES, 'config')]);
            setP(j.dados);
            setCfg(c.dados);
            setContas(Object.fromEntries((c.dados.naturezas as any[]).map((n) => [n.id, n.conta || ''])));
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar o pacote do mês.');
            if (m) setErro(m);
        }
    }, [mes]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const fechar = async () => {
        setOcupado(true);
        try {
            const j = await api(URL_BASE, 'fechar_mes', { comp: mes });
            avisar(j.msg || 'Mês fechado.');
            await carregar();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível fechar o mês.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const salvarDepara = async () => {
        setOcupado(true);
        try {
            const itens = (cfg?.naturezas ?? []).filter((n) => (n.conta || '') !== (contas[n.id] || '')).map((n) => ({ natureza_id: n.id, conta: contas[n.id] || '' }));
            const j = await api(URL_RES, 'depara', { itens });
            avisar(j.msg);
            await carregar();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível gravar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const baixar = async () => {
        if (!p) return;
        setOcupado(true);
        try {
            const [dc, dx] = await Promise.all([api(URL_RES, 'dre', undefined, `&regime=comp&de=${mes}&ate=${mes}`), api(URL_RES, 'dre', undefined, `&regime=caixa&de=${mes}&ate=${mes}`)]);
            const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
            const wb = new ExcelJS.Workbook();
            const moeda = '#,##0.00;[Red]-#,##0.00';
            const aba = (nome: string, cab: string[], linhas: any[][], larg: number[], numCols: number[] = []) => {
                const ws = wb.addWorksheet(nome);
                ws.addRow(cab).font = { bold: true };
                linhas.forEach((l) => ws.addRow(l));
                larg.forEach((w, i) => (ws.getColumn(i + 1).width = w));
                numCols.forEach((c) => (ws.getColumn(c).numFmt = moeda));
                ws.views = [{ state: 'frozen', ySplit: 1 }];
            };
            const lanc = [...p.lancamentos, ...p.unymos].sort((x: any, y: any) => String(x.data).localeCompare(String(y.data)));
            aba(
                'Lançamentos',
                ['Data', 'Tipo', 'Valor', 'Natureza', 'Conta do contador', 'Documento', 'Cliente / fornecedor', 'Conta', 'Forma', 'Juros e multa', 'Desconto', 'ISS retido'],
                lanc.map((l: any) => [dataBR(l.data), l.tipo, l.valor, l.natureza, l.conta_contador || 'SEM CONTA', l.documento, l.pessoa, l.conta, l.forma, l.juros_multa, l.desconto, l.iss_retido]),
                [12, 22, 14, 42, 18, 16, 40, 26, 18, 13, 12, 12],
                [3, 10, 11, 12],
            );
            for (const [nome, dd] of [
                ['DRE competência', dc.dados],
                ['DRE caixa', dx.dados],
            ] as [string, Dre][]) {
                const nats = new Map(dd.naturezas.map((n) => [n.id, n]));
                const soma = new Map<number, number>();
                dd.linhas.forEach((l) => soma.set(l.n || 0, (soma.get(l.n || 0) || 0) + l.v));
                const linhas: any[][] = [];
                SECOES.forEach((s) => {
                    if (s.soma) {
                        const v = s.soma.reduce((a, id) => {
                            const ss = SECOES.find((x) => x.id === id)!;
                            return a + Array.from(soma.entries()).reduce((b, [nid, v2]) => (ss.f!(nid ? nats.get(nid) ?? null : null) ? b + v2 : b), 0) * ss.sinal;
                        }, 0);
                        linhas.push(['', s.rotulo, v]);
                        return;
                    }
                    const ns = Array.from(soma.entries()).filter(([nid]) => s.f!(nid ? nats.get(nid) ?? null : null));
                    linhas.push(['', s.rotulo, ns.reduce((a, [, v]) => a + v, 0) * s.sinal]);
                    ns.sort((a, b) => (nats.get(a[0])?.codigo || '').localeCompare(nats.get(b[0])?.codigo || '')).forEach(([nid, v]) =>
                        linhas.push([nats.get(nid)?.codigo || '', `   ${nats.get(nid)?.nome || 'Sem natureza'}`, v * s.sinal]),
                    );
                });
                aba(nome, ['Código', `${mesBR(mes)}`, 'Valor'], linhas, [10, 56, 16], [3]);
            }
            aba(
                'ISS retido',
                ['NF', 'Tomador', 'Empenho', 'Atendimentos', 'Emitida', 'Recebida', 'Valor', 'Alíquota %', 'ISS', 'Retido'],
                p.iss.map((n: any) => [n.nf, n.tomador, n.empenho, n.atendimentos, dataBR(n.emissao), dataBR(n.recebida), n.valor, n.aliquota, n.iss, n.retido]),
                [8, 36, 14, 14, 12, 12, 14, 11, 12, 8],
                [7, 9],
            );
            aba('Saldos', ['Conta', 'Tipo', 'Saldo no início do mês', 'Saldo no fim do mês'], p.saldos.map((s: any) => [s.conta, s.tipo, s.inicio, s.fim]), [36, 14, 22, 22], [3, 4]);
            await salvarXlsx(wb, `contador-${mes}.xlsx`);
            avisar(p.fechado ? 'Pacote do mês baixado.' : 'Pacote baixado. O mês ainda está aberto: feche depois de conciliar, para o que o escritório recebeu não mudar.');
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível montar a planilha.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const q = filtro.trim().toLowerCase();
    const natsF = (cfg?.naturezas ?? []).filter((n) => !q || `${n.codigo} ${n.nome}`.toLowerCase().includes(q));
    const semConta = (cfg?.naturezas ?? []).filter((n) => !(contas[n.id] || '').trim()).length;
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <select className="h-11 rounded-xl bg-white px-3 text-[15px] dark:bg-[#232B3F]" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
                    {Array.from({ length: 18 }, (_, i) => mesMais(hoje.slice(0, 7), -i)).map((m) => (
                        <option key={m} value={m}>
                            {mesBR(m)}
                        </option>
                    ))}
                </select>
                {p ? <span className={`${SELO} ${p.fechado ? S_OK : S_AVISO}`}>{p.fechado ? `Mês fechado em ${dataBR(p.fechado_em)} · não muda mais` : 'Mês aberto · ainda pode mudar'}</span> : null}
                <span className="flex-1" />
                {p && !p.fechado ? (
                    <button type="button" className={BTN_PEQ} disabled={ocupado} onClick={() => void fechar()}>
                        <IconLock size={18} /> Fechar o mês
                    </button>
                ) : null}
                <button type="button" className={BTN_PEQ_PRI} disabled={ocupado || !p} onClick={() => void baixar()}>
                    <IconFileSpreadsheet size={18} /> Baixar pacote do mês
                </button>
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            <div className={`${CARTAO} overflow-hidden`}>
                <div className="px-4 pb-1 pt-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">O que vai na planilha do mês</div>
                {[
                    ['Lançamentos', `cada recebimento e pagamento do mês, com natureza, conta do contador, documento e conta bancária (inclui o importado da Unymos)`, p ? `${p.lancamentos.length + p.unymos.length} linhas` : ''],
                    ['DRE competência e DRE caixa', 'por natureza, na estrutura da tela de Resultados', ''],
                    ['ISS retido', 'NFs da Prefeitura recebidas no mês e o ISS de cada uma', p ? `${p.iss.length} NF(s)` : ''],
                    ['Saldos', 'saldo de cada conta no início e no fim do mês', p ? `${p.saldos.length} contas` : ''],
                ].map(([t, s, q2]) => (
                    <div key={t} className="flex min-h-12 items-center gap-3 border-t border-[#EEF2F7] px-4 py-2 text-[14px] dark:border-white/[0.06]">
                        <span className={`${SELO} ${S_AB}`}>Planilha</span>
                        <span className="min-w-0 flex-1">
                            <b>{t}</b>
                            <span className={`${SUB} block`}>{s}</span>
                        </span>
                        <span className={`${SUB} font-bold`}>{q2}</span>
                    </div>
                ))}
                <div className="flex min-h-12 items-center gap-3 border-t border-[#EEF2F7] px-4 py-2 text-[14px] dark:border-white/[0.06]">
                    <span className={`${SELO} ${S_MUDO}`}>Arquivos</span>
                    <span className="min-w-0 flex-1">
                        <b>Notas e comprovantes</b>
                        <span className={`${SUB} block`}>ficam anexados em cada título; o download em lote vem numa próxima versão</span>
                    </span>
                    <span className={`${SUB} font-bold`}>{p ? `${p.anexos} arquivo(s)` : ''}</span>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <b className="text-[15px]">De-para: natureza do PAI → conta do contador</b>
                <span className={SUB}>{semConta ? `${semConta} natureza(s) sem conta: saem marcadas na planilha` : 'todas as naturezas têm conta'}</span>
                <span className="flex-1" />
                <input className="h-11 w-full rounded-xl bg-white px-3 text-[15px] dark:bg-[#232B3F] lg:w-64" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Procurar natureza" aria-label="Procurar natureza" />
                <button type="button" className={BTN_PEQ_PRI} disabled={ocupado} onClick={() => void salvarDepara()}>
                    Gravar contas
                </button>
            </div>
            <div className={`${CARTAO} max-h-[420px] overflow-auto`}>
                {natsF.map((n) => (
                    <div key={n.id} className="grid grid-cols-[minmax(0,1fr)_200px] items-center gap-3 border-t border-[#EEF2F7] px-4 py-1.5 text-[14px] first:border-t-0 dark:border-white/[0.06] lg:grid-cols-[minmax(0,1fr)_280px]">
                        <span className="min-w-0 break-words">
                            <span className="mr-2 text-[12.5px] font-bold tabular-nums text-[#5B6478]">{n.codigo}</span>
                            {n.nome}
                        </span>
                        <input className="h-10 rounded-xl bg-[#F1F4F8] px-3 text-[15px] dark:bg-[#1C2334]" value={contas[n.id] || ''} onChange={(e) => setContas({ ...contas, [n.id]: e.target.value })} aria-label={`Conta do contador para ${n.nome}`} />
                    </div>
                ))}
            </div>
            <div className={`${NOTA} ${S_AVISO}`}>
                <span>A contabilidade oficial continua com o escritório (Domínio). A planilha leva os lançamentos do mês já classificados para o escritório importar; o layout de importação do Domínio pode precisar de ajuste com o escritório [confirmar].</span>
            </div>
        </>
    );
}

/* ============================== configurar ============================== */

function Configurar({ onFechar, onFeito }: { onFechar: () => void; onFeito: (m: string) => void }) {
    const [c, setC] = useState<{ saldo_minimo: number; rateio: Rateio; areas: { id: number; nome: string }[] } | null>(null);
    const [minimo, setMinimo] = useState('');
    const [modo, setModo] = useState<Rateio['modo']>('receita');
    const [perc, setPerc] = useState<Record<string, string>>({});
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    useEffect(() => {
        void (async () => {
            try {
                const j = await api(URL_RES, 'config');
                setC(j.dados);
                setMinimo(numCampo(j.dados.saldo_minimo));
                setModo(j.dados.rateio?.modo || 'receita');
                setPerc(Object.fromEntries(Object.entries(j.dados.rateio?.perc || {}).map(([k, v]) => [k, numCampo(Number(v))])));
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível carregar.');
                if (m) setErro(m);
            }
        })();
    }, []);
    const soma = Object.values(perc).reduce((a, v) => a + (paraNumero(v) || 0), 0);
    const salvar = async () => {
        setOcupado(true);
        setErro(null);
        try {
            const j = await api(URL_RES, 'config', {
                saldo_minimo: paraNumero(minimo),
                rateio: { modo, perc: modo === 'percentual' ? Object.fromEntries(Object.entries(perc).map(([k, v]) => [k, paraNumero(v) || 0])) : {} },
            });
            onFeito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível gravar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    return (
        <Janela
            titulo="Configurar resultados"
            sub="Saldo mínimo do fluxo de caixa e rateio dos custos comuns por área de negócio"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={ocupado || !c || (modo === 'percentual' && Math.abs(soma - 100) > 0.01)} onClick={() => void salvar()}>
                        Gravar
                    </button>
                </>
            }
        >
            {!c && !erro ? <div className="py-6 text-center text-[#5B6478]">Carregando…</div> : null}
            {c ? (
                <>
                    <label className="block">
                        <span className={ROTULO}>Saldo mínimo (alerta do fluxo de caixa)</span>
                        <input className={CAMPO} inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
                    </label>
                    <div>
                        <span className={ROTULO}>Custos fixos e despesas sem área: como dividir na DRE por área</span>
                        <div className="flex flex-col gap-2">
                            {(
                                [
                                    ['receita', 'Pela receita de cada área no mês', 'quem fatura mais leva uma parte maior'],
                                    ['percentual', 'Por percentuais fixos', 'a Gestão define a parte de cada área (soma 100%)'],
                                    ['nao', 'Não dividir', 'ficam numa coluna "Sem área (comum)"'],
                                ] as [Rateio['modo'], string, string][]
                            ).map(([k, r, s]) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => setModo(k)}
                                    className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left ${modo === k ? 'border-[#313C55] bg-[#E9EFF6] dark:bg-[#3D6A99]/25' : 'border-[#E3E8F0] dark:border-white/[0.12]'}`}
                                >
                                    <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${modo === k ? 'border-[#313C55]' : 'border-[#C9D1DE]'}`}>{modo === k ? <span className="size-2.5 rounded-full bg-[#313C55]" /> : null}</span>
                                    <span>
                                        <b className="block text-[14.5px]">{r}</b>
                                        <span className={SUB}>{s}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                    {modo === 'percentual' ? (
                        <div className="grid grid-cols-2 gap-3">
                            {c.areas.map((a) => (
                                <label key={a.id} className="block">
                                    <span className={ROTULO}>{a.nome} (%)</span>
                                    <input className={CAMPO} inputMode="decimal" value={perc[String(a.id)] || ''} onChange={(e) => setPerc({ ...perc, [String(a.id)]: e.target.value })} />
                                </label>
                            ))}
                            <div className={`${SUB} col-span-2 font-bold ${Math.abs(soma - 100) > 0.01 ? 'text-[#B42318]' : ''}`}>Soma: {numCampo(soma)}% (precisa dar 100%)</div>
                        </div>
                    ) : null}
                    <div className={SUB}>O Simples Nacional sempre acompanha a receita de cada área, qualquer que seja a regra.</div>
                </>
            ) : null}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== importar da Unymos ============================== */

type Rel = 'RECEBIDAS' | 'PAGAS' | 'PREVISAO';
const REL_NOME: Record<Rel, string> = { RECEBIDAS: 'Contas recebidas (relatório 77)', PAGAS: 'Contas pagas (relatório 92)', PREVISAO: 'Previsão de pagamentos (relatório 90)' };
type LinhaImp = { data: string; chave: string; valor: number };
type Falta = { chave: string; valor: number; sugestao: number | 'IGNORAR' | null };

/** Valor de célula do exceljs como texto/número/data. */
function celula(v: any): any {
    if (v && typeof v === 'object') {
        if (v instanceof Date) return v;
        if ('result' in v) return v.result;
        if ('richText' in v) return (v.richText as any[]).map((x) => x.text).join('');
        if ('text' in v) return v.text;
    }
    return v;
}
const isoDe = (v: any): string | null => {
    if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    if (typeof v === 'number' && v > 30000 && v < 80000) {
        const d = new Date(Math.round((v - 25569) * 86400000));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    const m = String(v ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const numDe = (v: any): number | null => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? paraNumero(v) : null);
const normCab = (s: any) =>
    String(s ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, '')
        .trim();

/** Lê o relatório da Unymos salvo como .xlsx e devolve as linhas agrupadas por dia e chave. */
async function lerRelatorio(arquivo: File): Promise<{ rel: Rel; linhas: LinhaImp[]; de: string; ate: string; brutas: number }> {
    const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await arquivo.arrayBuffer());
    const ws = wb.worksheets[0];
    let rel: Rel | null = null;
    let col: Record<string, number> = {};
    const soma = new Map<string, number>();
    let brutas = 0;
    let de = '9999-12-31';
    let ate = '0000-01-01';
    ws.eachRow({ includeEmpty: false }, (row: any) => {
        const vals: any[] = [];
        row.eachCell({ includeEmpty: false }, (c: any, i: number) => (vals[i] = celula(c.value)));
        if (!rel) {
            const cab = vals.map(normCab);
            const ix = (n: string) => cab.findIndex((x) => x === n);
            if (ix('TIPO') > 0 && ix('RECEBIDO') > 0 && ix('PGTO') > 0) {
                rel = 'RECEBIDAS';
                col = { data: ix('PGTO'), chave: ix('TIPO'), valor: ix('RECEBIDO') };
            } else if (ix('NATUREZA DE DESPESA') > 0 && ix('PAGO') > 0 && ix('PGTO') > 0) {
                rel = 'PAGAS';
                col = { data: ix('PGTO'), chave: ix('NATUREZA DE DESPESA'), valor: ix('PAGO') };
            } else if (ix('VENCTO') > 0 && ix('FORNECEDOR') > 0 && ix('VALOR') > 0) {
                rel = 'PREVISAO';
                col = { data: ix('VENCTO'), chave: ix('FORNECEDOR'), valor: ix('VALOR') };
            }
            return;
        }
        const d = isoDe(vals[col.data]);
        const v = numDe(vals[col.valor]);
        const ch = String(vals[col.chave] ?? '').trim();
        if (!d || v === null || !Number.isFinite(v) || !ch || /^TOTAL/i.test(ch)) return;
        brutas++;
        if (d < de) de = d;
        if (d > ate) ate = d;
        const k = `${d}|${ch}`;
        soma.set(k, (soma.get(k) || 0) + v);
    });
    if (!rel) throw new Error('Não reconheci o relatório. Use o 77 (contas recebidas), o 92 (contas pagas) ou o 90 (previsão de pagamentos), salvos como .xlsx.');
    const linhas = Array.from(soma.entries()).map(([k, v]) => {
        const [data, chave] = k.split('|');
        return { data, chave, valor: Math.round(v * 100) / 100 };
    });
    return { rel, linhas, de, ate, brutas };
}

function Importar({ onFechar, avisar }: { onFechar: () => void; avisar: (m: string) => void }) {
    const [arq, setArq] = useState<{ nome: string; rel: Rel; linhas: LinhaImp[]; brutas: number } | null>(null);
    const [de, setDe] = useState('');
    const [ate, setAte] = useState('');
    const [faltam, setFaltam] = useState<Falta[] | null>(null);
    const [mapa, setMapa] = useState<Record<string, { natureza_id?: number; ignorar?: boolean; ate?: string }>>({});
    const [nats, setNats] = useState<{ id: number; codigo: string; nome: string }[]>([]);
    const [lotes, setLotes] = useState<any[]>([]);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const carregarLotes = useCallback(async () => {
        try {
            const [l, c] = await Promise.all([api(URL_RES, 'importacoes'), api(URL_RES, 'config')]);
            setLotes(l.dados.lotes);
            setNats(c.dados.naturezas);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar.');
            if (m) setErro(m);
        }
    }, []);
    useEffect(() => {
        void carregarLotes();
    }, [carregarLotes]);

    const escolher = async (f: File) => {
        setErro(null);
        setFaltam(null);
        if (!/\.xlsx$/i.test(f.name)) return setErro('O relatório da Unymos vem em .xls antigo. Abra no Excel, use "Salvar como" e escolha "Pasta de Trabalho do Excel (.xlsx)". Depois escolha o arquivo novo aqui.');
        setOcupado(true);
        try {
            const r = await lerRelatorio(f);
            setArq({ nome: f.name, rel: r.rel, linhas: r.linhas, brutas: r.brutas });
            setDe(r.de);
            setAte(r.ate);
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível ler o arquivo.');
        } finally {
            setOcupado(false);
        }
    };
    const importar = async () => {
        if (!arq) return;
        setOcupado(true);
        setErro(null);
        try {
            const j = await api(URL_RES, 'importar', { relatorio: arq.rel, de, ate, linhas: arq.linhas, mapa });
            if (j.dados?.faltam?.length) {
                const fs: Falta[] = j.dados.faltam;
                setFaltam(fs);
                setMapa((m) => {
                    const n = { ...m };
                    fs.forEach((x) => {
                        if (n[x.chave]) return;
                        n[x.chave] = x.sugestao === 'IGNORAR' ? { ignorar: true } : x.sugestao ? { natureza_id: x.sugestao, ate: x.chave === 'VPS' ? '2026-09' : undefined } : {};
                    });
                    return n;
                });
                avisar(j.msg);
            } else {
                avisar(j.msg);
                setArq(null);
                setFaltam(null);
                setMapa({});
                await carregarLotes();
            }
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível importar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const desfazer = async (lote: string) => {
        setOcupado(true);
        try {
            const j = await api(URL_RES, 'desfazer_importacao', { lote });
            avisar(j.msg);
            await carregarLotes();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível desfazer.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const faltaEscolher = (faltam ?? []).some((f) => !mapa[f.chave]?.ignorar && !mapa[f.chave]?.natureza_id);
    const total = arq ? arq.linhas.reduce((a, l) => a + l.valor, 0) : 0;
    return (
        <Janela
            titulo="Importar da Unymos"
            sub="Enquanto as mensalidades e o contas a pagar rodam na Unymos, os números de lá entram na DRE e no fluxo por estes relatórios."
            largura="max-w-4xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={ocupado || !arq || !de || !ate || faltaEscolher} onClick={() => void importar()}>
                        {faltam ? 'Gravar o de-para e importar' : 'Importar'}
                    </button>
                </>
            }
        >
            <div className={NOTA}>
                <span>
                    Na Unymos, gere o relatório do período (77 Contas recebidas por data de baixa, 92 Contas pagas por data de baixa ou 90 Previsão de pagamentos), abra no Excel e use <b>Salvar como → Pasta de Trabalho do Excel (.xlsx)</b>.
                    Importar de novo o mesmo relatório e período substitui o anterior.
                </span>
            </div>
            <label className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-dashed px-3 text-[14px] font-bold ${arq ? 'border-[#7BA11A]' : 'border-[#C9D1DE] dark:border-white/25'}`}>
                <input
                    type="file"
                    accept=".xlsx"
                    className="sr-only"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) void escolher(f);
                    }}
                />
                <IconUpload size={18} />
                {arq ? `${arq.nome} · ${REL_NOME[arq.rel]} · ${arq.brutas} lançamentos (${arq.linhas.length} agrupados) · ${brl(total)}` : 'Escolher o relatório (.xlsx)'}
            </label>
            {arq ? (
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className={ROTULO}>De</span>
                        <input type="date" className={CAMPO} value={de} onChange={(e) => setDe(e.target.value)} />
                    </label>
                    <label className="block">
                        <span className={ROTULO}>Até</span>
                        <input type="date" className={CAMPO} value={ate} onChange={(e) => setAte(e.target.value)} />
                    </label>
                </div>
            ) : null}
            {arq?.rel === 'PREVISAO' ? <div className={SUB}>A previsão de pagamentos entra só no fluxo de caixa (saídas previstas), sem natureza.</div> : null}
            {faltam ? (
                <>
                    <div className={`${NOTA} ${S_AVISO}`}>
                        <span>
                            Escolha a natureza do PAI para cada item da Unymos (fica gravado para as próximas importações). Use <b>Ignorar</b> no que não é receita nem despesa (REC é transferência interna da Unymos) e o campo <b>até</b> no que
                            passou a vir do PAI Conecta (VPS são as OS: a partir de outubro vêm do contas a receber).
                        </span>
                    </div>
                    <div className={`${CARTAO} max-h-[420px] overflow-auto`}>
                        {faltam.map((f) => {
                            const m = mapa[f.chave] || {};
                            return (
                                <div key={f.chave} className="grid grid-cols-1 items-center gap-2 border-t border-[#EEF2F7] px-3 py-2 text-[14px] first:border-t-0 dark:border-white/[0.06] lg:grid-cols-[minmax(0,1fr)_120px_minmax(0,1.2fr)_130px]">
                                    <b className="min-w-0 break-words">{f.chave}</b>
                                    <span className="tabular-nums lg:text-right">{brl(f.valor)}</span>
                                    <select
                                        className="h-10 min-w-0 rounded-xl bg-[#F1F4F8] px-2 text-[14px] dark:bg-[#1C2334]"
                                        value={m.ignorar ? 'IGNORAR' : m.natureza_id || ''}
                                        onChange={(e) => setMapa({ ...mapa, [f.chave]: e.target.value === 'IGNORAR' ? { ignorar: true } : e.target.value ? { natureza_id: Number(e.target.value), ate: m.ate } : {} })}
                                        aria-label={`Natureza para ${f.chave}`}
                                    >
                                        <option value="">Escolha a natureza</option>
                                        <option value="IGNORAR">Ignorar (não entra)</option>
                                        {nats.map((n) => (
                                            <option key={n.id} value={n.id}>
                                                {n.codigo} · {n.nome}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        className="h-10 rounded-xl bg-[#F1F4F8] px-2 text-[14px] dark:bg-[#1C2334]"
                                        placeholder="até AAAA-MM"
                                        value={m.ate || ''}
                                        disabled={!!m.ignorar}
                                        onChange={(e) => setMapa({ ...mapa, [f.chave]: { ...m, ate: e.target.value || undefined } })}
                                        aria-label="Importar só até o mês"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : null}
            <div className={ROTULO}>Importações feitas</div>
            <div className={`${CARTAO} overflow-hidden`}>
                {lotes.map((l) => (
                    <div key={l.lote} className="flex min-h-12 flex-wrap items-center gap-3 border-t border-[#EEF2F7] px-3 py-2 text-[14px] first:border-t-0 dark:border-white/[0.06]">
                        <span className="min-w-0 flex-1">
                            <b>{REL_NOME[l.relatorio as Rel] || l.relatorio}</b>
                            <span className={`${SUB} block`}>
                                {mesCurto(l.de)} a {mesCurto(l.ate)} · {l.linhas} linhas · {brl(l.valor)} · {dataBR(l.em)} {l.por ? `· ${l.por}` : ''}
                            </span>
                        </span>
                        <button type="button" className={BTN_PEQ} disabled={ocupado} onClick={() => void desfazer(l.lote)}>
                            Desfazer
                        </button>
                    </div>
                ))}
                {!lotes.length ? <div className="px-4 py-5 text-center text-[#5B6478]">Nenhuma importação ainda.</div> : null}
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}
