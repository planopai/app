'use client';

/**
 * Cartão de crédito (/cartao-credito) — Financeiro da empresa, etapa 1 — 11/11/2026. Back-end: fin_pagar.php (cartao, compra, cancelar_compra).
 * Cada compra é lançada na hora (natureza e rateio próprios; a despesa conta no mês da compra) e cai na fatura pelo dia de fechamento.
 * Depois que a fatura fecha ela vira um título só no Contas a pagar. A conferência com o arquivo do banco fica para a etapa 2.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { IconBan, IconCreditCard, IconPaperclip, IconPlus, IconReceipt } from '@tabler/icons-react';
import { GRADE_CARTOES, TopoPagina } from '@/components/shell/ModuloHub';
import {
    api,
    BotaoArquivo,
    brl,
    BTN_PEQ,
    BTN_PRI,
    BTN_SEC,
    CAMPO,
    CARTAO,
    dataBR,
    diaMes,
    enviarAnexo,
    ERRO,
    hojeISO,
    Janela,
    mensagemErro,
    NOTA,
    opcoesArea,
    paraNumero,
    PILULA,
    ROTULO,
    S_AVISO,
    SelectNatureza,
    SELO,
    SUB,
    URL_PAGAR,
    useAviso,
    useCadastros,
    type Cadastros,
} from '../contas-pagar/components/fin';

type Fatura = { vencimento: string; fechamento: string; situacao: 'aberta' | 'fechada' | 'paga' | 'futura'; valor: number; lancamentos: number; titulo_id: number | null };
type Compra = {
    id: number;
    data: string;
    descricao: string;
    valor_total: number;
    parcela: string | null;
    valor: number;
    natureza: string;
    local: string | null;
    area: string;
    veiculo: string | null;
    comprador: string | null;
    anexos: number;
};
type Dados = {
    cartao: { id: number; nome: string; fechamento: number; vencimento: number; limite: number | null; conta_pagamento_id: number | null; portadores: { id: number; nome: string }[] };
    aberta: string;
    selecionada: string;
    faturas: Fatura[];
    compras: Compra[];
    limite_usado: number;
    sem_comprovante: number;
};

const SIT: Record<Fatura['situacao'], string> = { aberta: 'aberta', fechada: 'fechada', paga: 'paga', futura: 'futura' };

/** Mesma regra do PHP: vencimento da fatura em que cai uma compra. */
function faturaDaCompra(data: string, fech: number, venc: number) {
    const dia = (y: number, m: number, d: number) => {
        const ult = new Date(y, m, 0).getDate();
        return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`;
    };
    let [y, m] = data.split('-').map(Number);
    if (data > dia(y, m, fech)) {
        m += 1;
        if (m > 12) {
            m = 1;
            y += 1;
        }
    }
    if (venc <= fech) {
        m += 1;
        if (m > 12) {
            m = 1;
            y += 1;
        }
    }
    return dia(y, m, venc);
}
const mesesMais = (iso: string, n: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1 + n, 1);
    const ult = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`;
};

export default function CartaoCreditoPage() {
    const { cad, erroCad } = useCadastros();
    const cartoes = useMemo(() => (cad ? cad.contas.filter((c) => c.tipo === 'CARTAO' && c.ativo) : []), [cad]);
    const [contaId, setContaId] = useState<number | null>(null);
    const [fatura, setFatura] = useState<string | null>(null);
    const [d, setD] = useState<Dados | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [nova, setNova] = useState(false);
    const [cancelar, setCancelar] = useState<Compra | null>(null);
    const { avisar, aviso } = useAviso();

    useEffect(() => {
        if (contaId === null && cartoes.length) setContaId(cartoes[0].id);
    }, [cartoes, contaId]);

    const carregar = useCallback(async () => {
        if (!contaId) return;
        try {
            const j = await api(URL_PAGAR, 'cartao', undefined, `&conta_id=${contaId}${fatura ? `&fatura=${fatura}` : ''}`);
            setD(j.dados);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar o cartão.');
            if (m) setErro(m);
        }
    }, [contaId, fatura]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const aberta = d?.faturas.find((f) => f.vencimento === d.aberta);
    const proxima = d ? d.faturas.find((f) => f.vencimento > d.aberta) : undefined;
    const sel = d?.faturas.find((f) => f.vencimento === d.selecionada);

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina
                    Icone={IconCreditCard}
                    titulo="Cartão de crédito"
                    acoes={
                        <>
                            <Link href="/contas-pagar" className={BTN_SEC}>
                                <IconReceipt size={18} /> Contas a pagar
                            </Link>
                            <button type="button" className={BTN_PRI} disabled={!d || !cad} onClick={() => setNova(true)}>
                                <IconPlus size={18} /> Nova compra
                            </button>
                        </>
                    }
                />
                {erro || erroCad ? <div className={ERRO}>{erro || erroCad}</div> : null}
                {cad && !cartoes.length ? <div className={NOTA}>Nenhum cartão ativo. Cadastre em Configurações do financeiro → Contas.</div> : null}

                {cartoes.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                        {cartoes.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                className={PILULA(contaId === c.id)}
                                onClick={() => {
                                    setContaId(c.id);
                                    setFatura(null);
                                }}
                            >
                                {c.nome}
                            </button>
                        ))}
                    </div>
                ) : null}

                {d ? (
                    <>
                        <div className={GRADE_CARTOES}>
                            <Cartao rotulo="Fatura aberta" valor={brl(aberta?.valor ?? 0)} sub={`vence ${diaMes(d.aberta)} · ${aberta?.lancamentos ?? 0} lançamento(s)`} escuro />
                            <Cartao
                                rotulo="Limite usado"
                                valor={brl(d.limite_usado)}
                                sub={d.cartao.limite ? `de ${brl(d.cartao.limite)} · livre ${brl(d.cartao.limite - d.limite_usado)}` : 'limite não informado'}
                                ruim={!!d.cartao.limite && d.limite_usado / d.cartao.limite > 0.8}
                            />
                            <Cartao rotulo="Próxima fatura" valor={brl(proxima?.valor ?? 0)} sub={proxima ? `vence ${diaMes(proxima.vencimento)} · parcelas já lançadas` : 'nada lançado ainda'} />
                            <Cartao rotulo="Sem comprovante" valor={String(d.sem_comprovante)} sub="compra(s) dos últimos 3 meses" ruim={d.sem_comprovante > 0} />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">Faturas</span>
                            {d.faturas.map((f) => (
                                <button key={f.vencimento} type="button" className={PILULA(f.vencimento === d.selecionada)} onClick={() => setFatura(f.vencimento)}>
                                    {diaMes(f.vencimento)} · {SIT[f.situacao]}
                                </button>
                            ))}
                        </div>

                        <div className={`${CARTAO} overflow-hidden`}>
                            <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">
                                Fatura que vence {dataBR(d.selecionada)} · {sel ? SIT[sel.situacao] : 'aberta'}
                                {sel ? <span className="normal-case tracking-normal">· fecha {diaMes(sel.fechamento)}</span> : null}
                                <span className="ml-auto text-[14px] tracking-normal text-[#313C55] dark:text-white">{brl(sel?.valor ?? 0)}</span>
                            </div>
                            <div className="hidden grid-cols-[70px_minmax(0,1.4fr)_minmax(0,1.4fr)_80px_150px_120px_96px] gap-3 border-t border-[#E3E8F0] bg-[#F6F8FB] px-4 py-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:border-white/[0.08] dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:grid">
                                <span>Data</span>
                                <span>Compra</span>
                                <span>Natureza · rateio</span>
                                <span>Parcela</span>
                                <span>Quem comprou</span>
                                <span className="text-right">Valor</span>
                                <span />
                            </div>
                            {!d.compras.length ? <div className="border-t border-[#E3E8F0] px-4 py-8 text-center text-[15px] text-[#5B6478] dark:border-white/[0.08]">Nenhuma compra nesta fatura.</div> : null}
                            {d.compras.map((c) => (
                                <div
                                    key={`${c.id}-${c.parcela}`}
                                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-[#EEF2F7] px-4 py-3 text-[14px] dark:border-white/[0.06] lg:grid-cols-[70px_minmax(0,1.4fr)_minmax(0,1.4fr)_80px_150px_120px_96px] lg:items-center"
                                >
                                    <span className="hidden lg:block">{diaMes(c.data)}</span>
                                    <div className="min-w-0">
                                        <div className="break-words font-extrabold">{c.descricao}</div>
                                        <div className={`${SUB} lg:hidden`}>
                                            {diaMes(c.data)} · {c.parcela || 'à vista'} · {c.comprador || '—'}
                                        </div>
                                        {!c.anexos ? <span className={`${SELO} ${S_AVISO} mt-1`}>sem comprovante</span> : null}
                                    </div>
                                    <div className="text-right font-extrabold tabular-nums lg:hidden">{brl(c.valor)}</div>
                                    <div className="col-span-2 min-w-0 lg:col-span-1">
                                        <div className="font-bold">{c.natureza}</div>
                                        <div className={SUB}>{[c.local, c.area, c.veiculo].filter(Boolean).join(' · ')}</div>
                                    </div>
                                    <span className="hidden lg:block">{c.parcela || 'à vista'}</span>
                                    <span className="hidden lg:block">{c.comprador || '—'}</span>
                                    <span className="hidden text-right font-extrabold tabular-nums lg:block">{brl(c.valor)}</span>
                                    <div className="col-span-2 flex justify-end gap-2 lg:col-span-1">
                                        {!c.anexos ? (
                                            <span className="lg:hidden">
                                                <BotaoArquivo
                                                    rotulo="Comprovante"
                                                    icone={<IconPaperclip size={16} />}
                                                    onArquivo={async (f) => {
                                                        try {
                                                            await enviarAnexo({ compra_id: c.id }, f);
                                                            avisar('Comprovante anexado.');
                                                            void carregar();
                                                        } catch (e: any) {
                                                            const m = mensagemErro(e, 'Não foi possível anexar.');
                                                            if (m) avisar(m);
                                                        }
                                                    }}
                                                />
                                            </span>
                                        ) : null}
                                        {!c.anexos ? (
                                            <span className="hidden lg:block">
                                                <BotaoArquivo
                                                    rotulo=""
                                                    classe="grid size-10 place-items-center rounded-xl border border-[#C9D1DE] bg-white text-[#313C55] dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white"
                                                    icone={<IconPaperclip size={18} aria-label="Anexar comprovante" />}
                                                    onArquivo={async (f) => {
                                                        try {
                                                            await enviarAnexo({ compra_id: c.id }, f);
                                                            avisar('Comprovante anexado.');
                                                            void carregar();
                                                        } catch (e: any) {
                                                            const m = mensagemErro(e, 'Não foi possível anexar.');
                                                            if (m) avisar(m);
                                                        }
                                                    }}
                                                />
                                            </span>
                                        ) : null}
                                        {sel && (sel.situacao === 'aberta' || sel.situacao === 'futura') ? (
                                            <button type="button" className={BTN_PEQ} aria-label="Cancelar compra" onClick={() => setCancelar(c)}>
                                                <IconBan size={16} />
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className={SUB}>
                            Fecha dia {d.cartao.fechamento}, vence dia {d.cartao.vencimento}. Cada compra conta como despesa no mês em que foi feita, com sua natureza e rateio; a fatura entra no Contas a pagar como um título
                            só, e pagar a fatura dá baixa em todas as compras. A conferência com o arquivo da fatura do banco fica para a etapa 2.
                        </div>
                    </>
                ) : null}
            </div>

            {nova && d && cad ? (
                <NovaCompra
                    cad={cad}
                    d={d}
                    onFechar={() => setNova(false)}
                    onSalvo={(m, fat) => {
                        setNova(false);
                        avisar(m);
                        setFatura(fat);
                        void carregar();
                    }}
                />
            ) : null}
            {cancelar ? (
                <CancelarCompra
                    c={cancelar}
                    onFechar={() => setCancelar(null)}
                    onFeito={(m) => {
                        setCancelar(null);
                        avisar(m);
                        void carregar();
                    }}
                />
            ) : null}
            {aviso}
        </div>
    );
}

function Cartao({ rotulo, valor, sub, escuro, ruim }: { rotulo: string; valor: string; sub: string; escuro?: boolean; ruim?: boolean }) {
    return (
        <div
            className={`flex min-w-0 flex-col gap-1 rounded-[18px] border p-4 lg:px-5 lg:py-[18px] ${
                escuro ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]' : 'border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]'
            }`}
        >
            <span className={`text-[12px] font-extrabold uppercase tracking-[0.08em] ${escuro ? 'text-[#D6DCE8]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>{rotulo}</span>
            <span className={`text-[21px] font-extrabold leading-tight tabular-nums sm:text-[26px] ${ruim ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}`}>{valor}</span>
            <span className={`text-[12.5px] ${escuro ? 'text-[#D6DCE8]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>{sub}</span>
        </div>
    );
}

function NovaCompra({ cad, d, onFechar, onSalvo }: { cad: Cadastros; d: Dados; onFechar: () => void; onSalvo: (m: string, fatura: string) => void }) {
    const hoje = hojeISO();
    const [desc, setDesc] = useState('');
    const [quem, setQuem] = useState<number | ''>(d.cartao.portadores[0]?.id ?? '');
    const [data, setData] = useState(hoje);
    const [valor, setValor] = useState('');
    const [parcelas, setParcelas] = useState(1);
    const [nat, setNat] = useState<number | null>(null);
    const [local, setLocal] = useState<number | ''>('');
    const [area, setArea] = useState<number | ''>('');
    const [veic, setVeic] = useState<number | ''>('');
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const v = paraNumero(valor) || 0;
    const v0 = data ? faturaDaCompra(data, d.cartao.fechamento, d.cartao.vencimento) : '';
    const pessoas = d.cartao.portadores.length ? d.cartao.portadores : cad.usuarios;

    const salvar = async () => {
        setErro(null);
        if (!desc.trim()) return setErro('Informe a descrição.');
        if (!v || v <= 0) return setErro('Informe o valor.');
        if (!nat) return setErro('Escolha a natureza.');
        if (!area) return setErro('Escolha a área de negócio.');
        setSalvando(true);
        try {
            const j = await api(URL_PAGAR, 'compra', {
                conta_id: d.cartao.id,
                data,
                descricao: desc,
                valor: v,
                parcelas,
                natureza_id: nat,
                local_id: local || null,
                area_id: area,
                veiculo_id: veic || null,
                comprador_id: quem || null,
            });
            if (arquivo) {
                try {
                    await enviarAnexo({ compra_id: j.dados.id }, arquivo);
                } catch (e: any) {
                    onSalvo(`${j.msg} O comprovante não foi anexado: ${e?.message || 'anexe pela lista.'}`, j.dados.fatura);
                    return;
                }
            }
            onSalvo(arquivo ? j.msg : `${j.msg} Falta anexar o comprovante.`, j.dados.fatura);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível lançar a compra.');
            if (m) setErro(m);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Janela
            titulo="Nova compra no cartão"
            sub={d.cartao.nome}
            largura="max-w-3xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void salvar()}>
                        {salvando ? 'Lançando…' : 'Lançar compra'}
                    </button>
                </>
            }
        >
            <div className="grid gap-3 lg:grid-cols-2">
                <div>
                    <label className={ROTULO}>Descrição</label>
                    <input className={CAMPO} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: peças da Ducato" />
                </div>
                <div>
                    <label className={ROTULO}>Quem comprou</label>
                    <select className={CAMPO} value={quem} onChange={(e) => setQuem(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">—</option>
                        {pessoas.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.nome}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className={ROTULO}>Data da compra</label>
                    <input className={CAMPO} type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} />
                </div>
                <div>
                    <label className={ROTULO}>Valor total</label>
                    <input className={CAMPO} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                </div>
                <div>
                    <label className={ROTULO}>Parcelas</label>
                    <select className={CAMPO} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="col-span-2 lg:col-span-1">
                    <label className={ROTULO}>Natureza</label>
                    <SelectNatureza cad={cad} value={nat} onChange={setNat} classe={CAMPO} />
                </div>
                <div>
                    <label className={ROTULO}>Local</label>
                    <select className={CAMPO} value={local} onChange={(e) => setLocal(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">—</option>
                        {cad.locais.filter((x) => x.ativo).map((x) => (
                            <option key={x.id} value={x.id}>
                                {x.nome}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={ROTULO}>Área · linha</label>
                    <select className={CAMPO} value={area} onChange={(e) => setArea(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">Escolha</option>
                        {opcoesArea(cad).map((x) => (
                            <option key={x.id} value={x.id}>
                                {x.nome}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={ROTULO}>Veículo</label>
                    <select className={CAMPO} value={veic} onChange={(e) => setVeic(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">—</option>
                        {cad.veiculos.filter((x) => x.ativo).map((x) => (
                            <option key={x.id} value={x.id}>
                                {x.apelido}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            {v0 ? (
                <div className={NOTA}>
                    Compra de {diaMes(data)}:{' '}
                    {parcelas > 1
                        ? `${parcelas} parcelas de ${brl(v / parcelas)}, a primeira na fatura que vence ${diaMes(v0)} e a última na de ${diaMes(mesesMais(v0, parcelas - 1))}.`
                        : `entra na fatura que vence ${diaMes(v0)}.`}
                </div>
            ) : null}
            <BotaoArquivo
                rotulo={arquivo ? arquivo.name : 'Anexar foto do comprovante'}
                onArquivo={setArquivo}
                classe="flex min-h-11 items-center gap-2 rounded-xl bg-[#F1F4F8] px-3.5 text-left text-[14.5px] font-bold dark:bg-[#1C2334]"
                icone={<IconPaperclip size={18} />}
            />
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

function CancelarCompra({ c, onFechar, onFeito }: { c: Compra; onFechar: () => void; onFeito: (m: string) => void }) {
    const [motivo, setMotivo] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const ir = async () => {
        if (!motivo.trim()) return setErro('Informe o motivo.');
        try {
            const j = await api(URL_PAGAR, 'cancelar_compra', { id: c.id, motivo });
            onFeito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível cancelar.');
            if (m) setErro(m);
        }
    };
    return (
        <Janela
            titulo="Cancelar compra"
            sub={`${c.descricao} · ${brl(c.valor_total)}`}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} onClick={() => void ir()}>
                        Cancelar compra
                    </button>
                </>
            }
        >
            <div className={NOTA}>A compra sai de todas as faturas (todas as parcelas). Só dá enquanto nenhuma parcela estiver numa fatura fechada.</div>
            <div>
                <label className={ROTULO}>Motivo</label>
                <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}
