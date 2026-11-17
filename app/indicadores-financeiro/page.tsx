'use client';

/**
 * Indicadores › Financeiro (/indicadores-financeiro, chave indicadores-financeiro) — 17/11/2026. Back-end: fin_indicadores.php.
 * Só leitura. Cada cartão abre a tela de onde vem o número. Faixa amarela = alerta: saldo previsto abaixo do mínimo,
 * provisão acima de 100%, vencido acima de 10% do que está em aberto, resultado negativo.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IconChartBar, IconRefresh } from '@tabler/icons-react';
import { CartaoInfo, TopoPagina } from '@/components/shell/ModuloHub';
import { api, brl, BTN_SEC, CAMPO_P, CARTAO, ERRO, mensagemErro, mesBR, mesMais, SUB } from '../contas-pagar/components/fin';

const URL_IND = 'https://api.planoassistencialintegrado.com.br/fin_indicadores.php';

type Painel = {
    mes: string;
    hoje: string;
    receita: number;
    receita_ant: number;
    resultado: number;
    resultado_ant: number;
    margem: number | null;
    margem3: number | null;
    saldo_contas: number;
    saldo_previsto_30: number;
    data_30: string;
    saldo_minimo: number;
    vencido: number;
    vencido_qtd: number;
    vencido_pct: number | null;
    prazo_medio: number | null;
    prazo_qtd: number;
    atendimentos: number;
    custos: number;
    custo_atendimento: number | null;
    pessoal: number;
    folha_pct: number | null;
    prov_orcado: number;
    prov_realizado: number;
    prov_pct: number | null;
    prov_estouradas: number;
    serie12: { mes: string; receita: number; despesa: number }[];
    semanas: { ini: string; fim: string; saldo: number }[];
};

const mesAtual = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
/** R$ 412 mil · R$ 1,2 mi · R$ 950 */
function curto(v: number) {
    const a = Math.abs(v);
    const s = v < 0 ? '−' : '';
    if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (a >= 1e4) return `${s}R$ ${Math.round(a / 1e3).toLocaleString('pt-BR')} mil`;
    return `${s}R$ ${Math.round(a).toLocaleString('pt-BR')}`;
}
const pct = (v: number | null, casas = 0) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`);
const diaMesBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const mesCurto = (ym: string) => `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

export default function IndicadoresFinanceiroPage() {
    const [mes, setMes] = useState(mesAtual());
    const [d, setD] = useState<Painel | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(false);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const j = await api(URL_IND, 'painel', undefined, `&mes=${mes}`);
            setD(j.dados);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível montar o painel.');
            if (m) setErro(m);
        } finally {
            setCarregando(false);
        }
    }, [mes]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const meses = useMemo(() => Array.from({ length: 13 }, (_, i) => mesMais(mesAtual(), -i)), []);

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina
                    Icone={IconChartBar}
                    titulo="Financeiro"
                    acoes={
                        <>
                            <select className={`${CAMPO_P} sm:w-[210px]`} value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
                                {meses.map((m) => (
                                    <option key={m} value={m}>
                                        {mesBR(m)}
                                    </option>
                                ))}
                            </select>
                            <button type="button" className={`${BTN_SEC} !flex-none`} onClick={() => void carregar()} disabled={carregando} aria-label="Atualizar">
                                <IconRefresh size={18} />
                            </button>
                        </>
                    }
                />
                {erro ? <div className={ERRO}>{erro}</div> : null}
                {!d && !erro ? <div className="py-8 text-center text-[#5B6478]">Carregando…</div> : null}
                {d ? <Conteudo d={d} /> : null}
            </div>
        </div>
    );
}

function Conteudo({ d }: { d: Painel }) {
    const variacao = d.receita_ant > 0 ? ((d.receita - d.receita_ant) / d.receita_ant) * 100 : null;
    const mesAnt = mesBR(mesMais(d.mes, -1)).split(' ')[0].toLowerCase();
    const alertaPrev = d.saldo_previsto_30 < d.saldo_minimo;
    const alertaProv = d.prov_pct !== null && d.prov_pct > 100;
    const alertaVenc = d.vencido_pct !== null && d.vencido_pct > 10;
    const alertas = [
        d.resultado < 0 ? 'resultado do mês negativo' : null,
        alertaPrev ? `saldo previsto abaixo do mínimo de ${curto(d.saldo_minimo)}` : null,
        alertaProv ? 'provisão acima de 100%' : null,
        alertaVenc ? 'a receber vencido acima de 10%' : null,
    ].filter(Boolean) as string[];

    return (
        <>
            <div className={SUB}>
                Números de {mesBR(d.mes).toLowerCase()} pela competência (como na DRE). Saldo, previsão e vencido são de hoje ({diaMesBR(d.hoje)}).
                {alertas.length ? <b className="text-[#7A5D00] dark:text-[#F2CB3F]"> Atenção: {alertas.join('; ')}.</b> : null}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-3.5">
                <CartaoInfo rotulo="Receita do mês" valor={curto(d.receita)} sub={variacao === null ? 'sem o mês anterior' : `${variacao >= 0 ? '+' : '−'}${Math.abs(Math.round(variacao))}% sobre ${mesAnt}`} href="/dre" estilo="escuro" />
                <CartaoInfo rotulo="Resultado do mês" valor={curto(d.resultado)} sub={d.receita > 0 ? `${pct((d.resultado / d.receita) * 100, 1)} da receita` : 'sem receita no mês'} href="/dre" estilo={d.resultado < 0 ? 'alerta' : undefined} />
                <CartaoInfo rotulo="Margem de contribuição" valor={pct(d.margem)} sub={`média de 3 meses: ${pct(d.margem3)}`} href="/dre" />
                <CartaoInfo rotulo="Saldo nas contas" valor={curto(d.saldo_contas)} sub="bancos e caixas, sem aplicações" href="/tesouraria" />
                <CartaoInfo rotulo="Saldo previsto em 30 dias" valor={curto(d.saldo_previsto_30)} sub={`mínimo ${curto(d.saldo_minimo)}`} href="/fluxo-caixa" estilo={alertaPrev ? 'alerta' : undefined} />
                <CartaoInfo rotulo="A receber vencido" valor={pct(d.vencido_pct, 1)} sub={`${curto(d.vencido)} em ${d.vencido_qtd} título(s)`} href="/contas-receber" estilo={alertaVenc ? 'alerta' : undefined} />
                <CartaoInfo rotulo="Prazo médio de recebimento" valor={d.prazo_medio === null ? '—' : `${Math.round(d.prazo_medio)} dias`} sub={d.prazo_qtd ? `OS · ${d.prazo_qtd} recebimento(s) no mês` : 'OS · nenhum recebimento no mês'} href="/contas-receber" />
                <CartaoInfo rotulo="Custo por atendimento" valor={d.custo_atendimento === null ? '—' : brl(Math.round(d.custo_atendimento)).replace(',00', '')} sub={`${d.atendimentos} atendimento(s) · custos ${curto(d.custos)}`} href="/dre" />
                <CartaoInfo rotulo="Folha × faturamento" valor={pct(d.folha_pct)} sub={`pessoal ${curto(d.pessoal)} ÷ receita`} href="/dre" />
                <CartaoInfo
                    rotulo="Provisão usada"
                    valor={pct(d.prov_pct)}
                    sub={d.prov_orcado > 0 ? (d.prov_estouradas ? `${d.prov_estouradas} natureza(s) acima do previsto` : `${curto(d.prov_realizado)} de ${curto(d.prov_orcado)}`) : 'sem provisão no mês'}
                    href="/fin-orcamento"
                    estilo={alertaProv ? 'alerta' : undefined}
                />
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-3.5">
                <section className={`${CARTAO} flex min-w-0 flex-col gap-2 p-4`}>
                    <h2 className="text-[16px] font-extrabold">Receita e despesa nos últimos 12 meses</h2>
                    <GraficoMeses serie={d.serie12} />
                </section>
                <section className={`${CARTAO} flex min-w-0 flex-col gap-2 p-4`}>
                    <h2 className="text-[16px] font-extrabold">Saldo previsto nas próximas semanas</h2>
                    <GraficoSaldo semanas={d.semanas} minimo={d.saldo_minimo} />
                </section>
            </div>
        </>
    );
}

/* ============================== gráficos (SVG) ============================== */

const COR_REC = '#3D6A99';
const COR_DESP = '#E4BC30';
const W = 560;
const H = 230;
const ML = 52;
const MB = 26;
const MT = 10;

function escala(max: number) {
    if (max <= 0) return { topo: 1, passos: [0] };
    const bruto = max / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    const passo = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= bruto) || bruto;
    const topo = Math.ceil(max / passo) * passo;
    return { topo, passos: Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo) };
}
const eixo = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(Math.round(v)));

function Legenda({ itens }: { itens: [string, string, boolean?][] }) {
    return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
            {itens.map(([cor, nome, tracejado]) => (
                <span key={nome} className="inline-flex items-center gap-1.5">
                    {tracejado ? <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: cor }} /> : <span className="inline-block size-2.5 rounded-sm" style={{ background: cor }} />}
                    {nome}
                </span>
            ))}
        </div>
    );
}

function GraficoMeses({ serie }: { serie: Painel['serie12'] }) {
    const [foco, setFoco] = useState<number | null>(null);
    const max = Math.max(0, ...serie.flatMap((s) => [s.receita, s.despesa]));
    const { topo, passos } = escala(max);
    const larg = (W - ML - 8) / serie.length;
    const bw = Math.min(16, larg / 2 - 3);
    const y = (v: number) => MT + (H - MT - MB) * (1 - v / topo);
    const f = foco !== null ? serie[foco] : null;
    return (
        <>
            <Legenda itens={[[COR_REC, 'Receita'], [COR_DESP, 'Despesa (deduções, custos e despesas)']]} />
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Receita e despesa por mês" onMouseLeave={() => setFoco(null)}>
                {passos.map((p) => (
                    <g key={p}>
                        <line x1={ML} x2={W - 8} y1={y(p)} y2={y(p)} stroke="currentColor" strokeOpacity={0.1} />
                        <text x={ML - 6} y={y(p) + 4} textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.6}>
                            {eixo(p)}
                        </text>
                    </g>
                ))}
                {serie.map((s, i) => {
                    const cx = ML + larg * i + larg / 2;
                    return (
                        <g key={s.mes} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}>
                            <rect x={ML + larg * i} y={MT} width={larg} height={H - MT - MB} fill={foco === i ? 'currentColor' : 'transparent'} fillOpacity={0.05} />
                            <rect x={cx - bw - 1} y={y(s.receita)} width={bw} height={Math.max(0, y(0) - y(s.receita))} rx={2} fill={COR_REC} />
                            <rect x={cx + 1} y={y(s.despesa)} width={bw} height={Math.max(0, y(0) - y(s.despesa))} rx={2} fill={COR_DESP} />
                            <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.6}>
                                {mesCurto(s.mes).slice(0, 3)}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <div className="min-h-[20px] text-[13px] tabular-nums">
                {f ? (
                    <>
                        <b>{mesBR(f.mes)}</b>: receita {brl(f.receita)} · despesa {brl(f.despesa)} · resultado <b className={f.receita - f.despesa < 0 ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}>{brl(f.receita - f.despesa)}</b>
                    </>
                ) : (
                    <span className={SUB}>Toque num mês para ver os valores.</span>
                )}
            </div>
        </>
    );
}

function GraficoSaldo({ semanas, minimo }: { semanas: Painel['semanas']; minimo: number }) {
    const [foco, setFoco] = useState<number | null>(null);
    const vals = semanas.map((s) => s.saldo);
    const minV = Math.min(0, ...vals, minimo);
    const maxV = Math.max(...vals, minimo, 1);
    const { topo: t0, passos: p0 } = escala(maxV - minV);
    const passo = p0[1] || t0;
    const base = minV < 0 ? -Math.ceil(-minV / passo) * passo : 0;
    const alto = base + Math.ceil((maxV - base) / passo) * passo;
    const passos = Array.from({ length: Math.round((alto - base) / passo) + 1 }, (_, i) => i * passo);
    const y = (v: number) => MT + (H - MT - MB) * (1 - (v - base) / (alto - base || 1));
    const x = (i: number) => ML + ((W - ML - 16) * i) / Math.max(1, semanas.length - 1);
    const pts = semanas.map((s, i) => `${x(i)},${y(s.saldo)}`).join(' ');
    const f = foco !== null ? semanas[foco] : null;
    const grade = passos.map((p) => p + base);
    return (
        <>
            <Legenda itens={[[COR_REC, 'Saldo previsto no fim da semana'], ['#E5484D', 'Saldo mínimo', true]]} />
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Saldo previsto por semana" onMouseLeave={() => setFoco(null)}>
                {grade.map((p) => (
                    <g key={p}>
                        <line x1={ML} x2={W - 8} y1={y(p)} y2={y(p)} stroke="currentColor" strokeOpacity={0.1} />
                        <text x={ML - 6} y={y(p) + 4} textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.6}>
                            {eixo(p)}
                        </text>
                    </g>
                ))}
                <line x1={ML} x2={W - 8} y1={y(minimo)} y2={y(minimo)} stroke="#E5484D" strokeWidth={1.5} strokeDasharray="5 4" />
                <polyline points={pts} fill="none" stroke={COR_REC} strokeWidth={2.5} strokeLinejoin="round" />
                {semanas.map((s, i) => (
                    <g key={s.ini} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}>
                        <rect x={x(i) - 14} y={MT} width={28} height={H - MT - MB} fill="transparent" />
                        <circle cx={x(i)} cy={y(s.saldo)} r={foco === i ? 5 : 3.5} fill={s.saldo < minimo ? '#E5484D' : COR_REC} stroke="white" strokeWidth={1.5} />
                        {i % 2 === 0 ? (
                            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.6}>
                                {diaMesBR(s.ini)}
                            </text>
                        ) : null}
                    </g>
                ))}
            </svg>
            <div className="min-h-[20px] text-[13px] tabular-nums">
                {f ? (
                    <>
                        Semana de <b>{diaMesBR(f.ini)}</b> a <b>{diaMesBR(f.fim)}</b>: <b className={f.saldo < minimo ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}>{brl(f.saldo)}</b>
                        {f.saldo < minimo ? ' · abaixo do mínimo' : ''}
                    </>
                ) : (
                    <span className={SUB}>Mesma regra do Fluxo de Caixa: títulos em aberto, cartões, previsão da Unymos e mensalidades pela média.</span>
                )}
            </div>
        </>
    );
}
