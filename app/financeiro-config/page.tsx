'use client';

/**
 * Configurações do financeiro (/financeiro-config) — Financeiro da empresa, etapa 1 — 11/11/2026. Back-end: fin_base.php.
 * Plano de contas (com classificação), contas, locais e áreas, veículos, instalações de consumo, recorrentes, orçamento,
 * pontos de recebimento, formas de pagamento, clientes e fornecedores e fechamento do mês. Nada é apagado: sai de uso (ativo = 0).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { IconAdjustmentsDollar, IconChevronDown, IconChevronRight, IconLock, IconLockOpen, IconPencil, IconPlus, IconReceipt, IconSearch } from '@tabler/icons-react';
import { TopoPagina } from '@/components/shell/ModuloHub';
import {
    api,
    brl,
    BTN_PEQ,
    BTN_PEQ_PRI,
    BTN_PRI,
    BTN_SEC,
    CAMPO,
    CAMPO_P,
    CARTAO,
    CLASSE,
    dataBR,
    ERRO,
    hojeISO,
    Janela,
    mensagemErro,
    mesBR,
    mesMais,
    NOTA,
    numCampo,
    opcoesArea,
    paraNumero,
    PILULA,
    ROTULO,
    S_AVISO,
    S_MUDO,
    S_OK,
    S_RUIM,
    SelectNatureza,
    SELO,
    SUB,
    URL_BASE,
    useAviso,
    useCadastros,
    type Cadastros,
    type Classe,
    type Conta,
    type Natureza,
    type Pessoa,
    type Veiculo,
} from '../contas-pagar/components/fin';

type Aba = 'plano' | 'contas' | 'locais' | 'veiculos' | 'instalacoes' | 'recorrentes' | 'orcamento' | 'pontos' | 'formas' | 'pessoas' | 'fechamento';
const ABAS: [Aba, string][] = [
    ['plano', 'Plano de contas'],
    ['contas', 'Contas'],
    ['locais', 'Locais e áreas'],
    ['veiculos', 'Veículos'],
    ['instalacoes', 'Instalações'],
    ['recorrentes', 'Recorrentes'],
    ['orcamento', 'Orçamento'],
    ['pontos', 'Pontos de recebimento'],
    ['formas', 'Formas'],
    ['pessoas', 'Clientes e fornecedores'],
    ['fechamento', 'Fechamento do mês'],
];
const TIPOS_CONTA: [Conta['tipo'], string][] = [
    ['BANCO', 'Bancos'],
    ['APLICACAO', 'Aplicações'],
    ['CAIXA', 'Caixas'],
    ['CARTAO', 'Cartões de crédito'],
    ['LINK', 'Link de pagamento'],
    ['BONIFICACAO', 'Bonificação'],
];
const USO: Record<string, string> = { FUNERARIO: 'Funerário', AMBULANCIA: 'Ambulância', APOIO: 'Apoio', COBRANCA: 'Cobrança' };

type Salvar = (acao: string, corpo: Record<string, unknown>) => Promise<boolean>;

export default function FinanceiroConfigPage() {
    const { cad, erroCad, recarregar } = useCadastros();
    const [aba, setAba] = useState<Aba>('plano');
    const { avisar, aviso } = useAviso();

    useEffect(() => {
        const a = new URLSearchParams(window.location.search).get('aba') as Aba | null;
        if (a && ABAS.some(([k]) => k === a)) setAba(a);
    }, []);

    /** Grava no fin_base.php, avisa e recarrega os cadastros. Devolve false se deu erro (o aviso mostra a mensagem). */
    const salvar: Salvar = useCallback(
        async (acao, corpo) => {
            try {
                const j = await api(URL_BASE, acao, corpo);
                avisar(j.msg);
                await recarregar();
                return true;
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível salvar.');
                if (m) avisar(m);
                return false;
            }
        },
        [avisar, recarregar],
    );

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina
                    Icone={IconAdjustmentsDollar}
                    titulo="Configurações do financeiro"
                    acoes={
                        <Link href="/contas-pagar" className={BTN_SEC}>
                            <IconReceipt size={18} /> Contas a pagar
                        </Link>
                    }
                />
                <div className={SUB}>PAI – Plano Assistencial Integrado · CNPJ 03.726.651/0001-51</div>
                <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-[#E3E8F0] px-4 dark:border-white/[0.1] lg:mx-0 lg:flex-wrap lg:px-0" role="tablist">
                    {ABAS.map(([k, r]) => (
                        <button
                            key={k}
                            type="button"
                            role="tab"
                            aria-selected={aba === k}
                            onClick={() => setAba(k)}
                            className={`h-11 shrink-0 whitespace-nowrap px-3 text-[14.5px] ${aba === k ? 'font-extrabold shadow-[inset_0_-3px_0_#F2CB3F]' : 'font-bold text-[#5B6478] dark:text-[#AEB9CF]'}`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
                {erroCad ? <div className={ERRO}>{erroCad}</div> : null}
                {!cad && !erroCad ? <div className="py-8 text-center text-[#5B6478]">Carregando…</div> : null}
                {cad ? (
                    <>
                        {aba === 'plano' ? <AbaPlano cad={cad} salvar={salvar} /> : null}
                        {aba === 'contas' ? <AbaContas cad={cad} salvar={salvar} /> : null}
                        {aba === 'locais' ? <AbaLocais cad={cad} salvar={salvar} /> : null}
                        {aba === 'veiculos' ? <AbaVeiculos cad={cad} salvar={salvar} /> : null}
                        {aba === 'instalacoes' ? <AbaInstalacoes cad={cad} salvar={salvar} /> : null}
                        {aba === 'recorrentes' ? <AbaRecorrentes cad={cad} salvar={salvar} /> : null}
                        {aba === 'orcamento' ? <AbaOrcamento cad={cad} avisar={avisar} /> : null}
                        {aba === 'pontos' ? <AbaPontos cad={cad} salvar={salvar} /> : null}
                        {aba === 'formas' ? <AbaFormas cad={cad} salvar={salvar} /> : null}
                        {aba === 'pessoas' ? <AbaPessoas cad={cad} salvar={salvar} /> : null}
                        {aba === 'fechamento' ? <AbaFechamento cad={cad} salvar={salvar} /> : null}
                    </>
                ) : null}
            </div>
            {aviso}
        </div>
    );
}

/* ============================== peças ============================== */

function Caixa({ titulo, extra, children }: { titulo?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className={`${CARTAO} overflow-hidden`}>
            {titulo ? (
                <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3">
                    <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">{titulo}</span>
                    <span className="ml-auto">{extra}</span>
                </div>
            ) : null}
            {children}
        </div>
    );
}
const LINHA = 'flex flex-wrap items-center gap-2.5 border-t border-[#EEF2F7] px-4 py-2.5 text-[14.5px] dark:border-white/[0.06]';

function Campo({ r, children, classe = '' }: { r: string; children: React.ReactNode; classe?: string }) {
    return (
        <div className={classe}>
            <label className={ROTULO}>{r}</label>
            {children}
        </div>
    );
}

function Marcar({ on, onClick, rotulo }: { on: boolean; onClick: () => void; rotulo: string }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={on} className="flex min-h-11 items-center gap-2.5 rounded-xl bg-[#F1F4F8] px-3.5 text-left text-[14.5px] font-bold dark:bg-[#1C2334]">
            <span className={`grid size-[22px] shrink-0 place-items-center rounded-md border-2 ${on ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]' : 'border-[#C9D1DE] bg-white dark:bg-transparent'}`}>
                {on ? '✓' : ''}
            </span>
            {rotulo}
        </button>
    );
}

/** Janela com um formulário: o filho recebe o estado e devolve os campos; "Salvar" chama onSalvar. */
function Formulario<T extends Record<string, any>>({
    titulo,
    inicial,
    onFechar,
    onSalvar,
    children,
    largura,
}: {
    titulo: string;
    inicial: T;
    onFechar: () => void;
    onSalvar: (v: T) => Promise<boolean>;
    children: (v: T, set: (p: Partial<T>) => void) => React.ReactNode;
    largura?: string;
}) {
    const [v, setV] = useState<T>(inicial);
    const [ocupado, setOcupado] = useState(false);
    const set = (p: Partial<T>) => setV((x) => ({ ...x, ...p }));
    return (
        <Janela
            titulo={titulo}
            onFechar={onFechar}
            largura={largura}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button
                        type="button"
                        className={BTN_PRI}
                        disabled={ocupado}
                        onClick={async () => {
                            setOcupado(true);
                            const ok = await onSalvar(v);
                            setOcupado(false);
                            if (ok) onFechar();
                        }}
                    >
                        {ocupado ? 'Salvando…' : 'Salvar'}
                    </button>
                </>
            }
        >
            {children(v, set)}
        </Janela>
    );
}

/* ============================== plano de contas ============================== */

function AbaPlano({ cad, salvar }: { cad: Cadastros; salvar: Salvar }) {
    const [abertos, setAbertos] = useState<Record<string, boolean>>({ '2': true, '3': true });
    const [busca, setBusca] = useState('');
    const [inativas, setInativas] = useState(false);
    const [form, setForm] = useState<{ nat?: Natureza; pai?: string } | null>(null);
    const filhos = useMemo(() => {
        const m: Record<string, Natureza[]> = {};
        cad.naturezas.forEach((n) => {
            const k = n.pai_codigo ?? '';
            (m[k] = m[k] || []).push(n);
        });
        return m;
    }, [cad]);
    const q = busca.trim().toLowerCase();
    const casa = (n: Natureza): boolean => (inativas || n.ativo) && (!q || `${n.codigo} ${n.nome} ${n.codigo_unymos || ''}`.toLowerCase().includes(q) || (filhos[n.codigo] || []).some(casa));
    const folhas = cad.naturezas.filter((n) => !n.grupo && n.ativo).length;

    const linha = (n: Natureza, nivel: number): React.ReactNode => {
        if (!casa(n)) return null;
        const fs = filhos[n.codigo] || [];
        const aberto = q ? true : !!abertos[n.codigo];
        return (
            <React.Fragment key={n.codigo}>
                <div
                    className={`flex min-h-11 items-center gap-2 border-t border-[#EEF2F7] pr-4 text-[14.5px] dark:border-white/[0.06] ${nivel === 1 ? 'bg-[#F6F8FB] font-extrabold dark:bg-[#1C2334]' : nivel === 2 ? 'font-bold' : ''} ${n.ativo ? '' : 'opacity-50'}`}
                    style={{ paddingLeft: 8 + (nivel - 1) * 28 }}
                >
                    {n.grupo ? (
                        <button type="button" aria-label="Abrir ou fechar" className="grid size-8 place-items-center rounded-lg hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]" onClick={() => setAbertos({ ...abertos, [n.codigo]: !aberto })}>
                            {aberto ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                        </button>
                    ) : (
                        <span className="w-8" />
                    )}
                    <span className="w-16 shrink-0 tabular-nums text-[#5B6478] dark:text-[#AEB9CF]">{n.codigo}</span>
                    <span className="min-w-0 flex-1 break-words">{n.nome}</span>
                    {!n.grupo && n.codigo_unymos ? <span className={`${SUB} hidden lg:inline`}>antes {n.codigo_unymos}</span> : null}
                    {n.pendencia ? <span className={`${SELO} ${S_AVISO} hidden lg:inline-flex`}>pendência</span> : null}
                    {!n.grupo && n.classe ? <span className={`${SELO} ${CLASSE[n.classe].cls}`}>{CLASSE[n.classe].nome}</span> : null}
                    {n.grupo && nivel === 2 ? (
                        <button type="button" className={BTN_PEQ} onClick={() => setForm({ pai: n.codigo })} aria-label="Nova natureza neste grupo">
                            <IconPlus size={16} />
                        </button>
                    ) : null}
                    <button type="button" className={BTN_PEQ} onClick={() => setForm({ nat: n })} aria-label="Alterar">
                        <IconPencil size={16} />
                    </button>
                </div>
                {n.grupo && aberto ? fs.map((f) => linha(f, nivel + 1)) : null}
            </React.Fragment>
        );
    };

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3 dark:bg-[#232B3F] lg:w-80 lg:flex-none">
                    <IconSearch size={18} className="text-[#5B6478]" />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar natureza ou código antigo" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                </label>
                <button type="button" className={BTN_PEQ} onClick={() => setAbertos(Object.fromEntries(cad.naturezas.filter((n) => n.grupo).map((n) => [n.codigo, true])))}>
                    Abrir tudo
                </button>
                <button type="button" className={BTN_PEQ} onClick={() => setAbertos({})}>
                    Recolher
                </button>
                <button type="button" className={PILULA(inativas)} onClick={() => setInativas(!inativas)}>
                    Mostrar fora de uso
                </button>
                <span className={`${SUB} lg:ml-auto`}>{folhas} naturezas em uso</span>
            </div>
            <Caixa>{(filhos[''] || []).map((n) => linha(n, 1))}</Caixa>
            <div className={SUB}>
                Custo variável entra direto na OS; custo fixo é dividido pela média de atendimentos de 12 meses; despesa fica no resultado das áreas. Naturezas de pendência precisam estar zeradas para
                fechar o mês.
            </div>
            {form ? (
                <Formulario
                    titulo={form.nat ? `Alterar ${form.nat.codigo}` : `Nova natureza em ${form.pai}`}
                    inicial={{ nome: form.nat?.nome ?? '', classe: (form.nat?.classe ?? 'DESPESA') as Classe, pendencia: !!form.nat?.pendencia, ativo: form.nat?.ativo ?? true }}
                    onFechar={() => setForm(null)}
                    onSalvar={(v) => salvar('natureza', form.nat ? { id: form.nat.id, ...v } : { pai_codigo: form.pai, ...v })}
                >
                    {(v, set) => (
                        <>
                            <Campo r="Nome">
                                <input className={CAMPO} value={v.nome} onChange={(e) => set({ nome: e.target.value })} autoFocus />
                            </Campo>
                            {!form.nat?.grupo ? (
                                <Campo r="Classificação">
                                    <select className={CAMPO} value={v.classe} onChange={(e) => set({ classe: e.target.value as Classe })}>
                                        {(Object.keys(CLASSE) as Classe[]).map((k) => (
                                            <option key={k} value={k}>
                                                {CLASSE[k].nome}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                            ) : null}
                            <div className="grid gap-2 lg:grid-cols-2">
                                {!form.nat?.grupo ? <Marcar on={v.pendencia} onClick={() => set({ pendencia: !v.pendencia })} rotulo="Pendência (mês só fecha zerado)" /> : null}
                                {form.nat ? <Marcar on={!v.ativo} onClick={() => set({ ativo: !v.ativo })} rotulo="Fora de uso" /> : null}
                            </div>
                        </>
                    )}
                </Formulario>
            ) : null}
        </>
    );
}

/* ============================== contas ============================== */

function AbaContas({ cad, salvar }: { cad: Cadastros; salvar: Salvar }) {
    const [form, setForm] = useState<Partial<Conta> | null>(null);
    const [inativas, setInativas] = useState(false);
    return (
        <>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_PEQ_PRI} onClick={() => setForm({ tipo: 'BANCO', ativo: true, portadores: [] })}>
                    <IconPlus size={16} /> Nova conta
                </button>
                <button type="button" className={PILULA(inativas)} onClick={() => setInativas(!inativas)}>
                    Mostrar fora de uso
                </button>
            </div>
            {TIPOS_CONTA.map(([tipo, rot]) => {
                const cs = cad.contas.filter((c) => c.tipo === tipo && (inativas || c.ativo));
                if (!cs.length) return null;
                return (
                    <div key={tipo} className="flex flex-col gap-2">
                        <div className="text-[15px] font-extrabold">{rot}</div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {cs.map((c) => (
                                <button key={c.id} type="button" onClick={() => setForm(c)} className={`${CARTAO} flex flex-col gap-1 p-4 text-left hover:border-[#313C55] ${c.ativo ? '' : 'opacity-50'}`}>
                                    <span className="font-extrabold">{c.nome}</span>
                                    <span className={SUB}>
                                        {c.tipo === 'CARTAO'
                                            ? c.cartao_fechamento
                                                ? `Fecha dia ${c.cartao_fechamento}, vence dia ${c.cartao_vencimento}${c.cartao_limite ? ` · limite ${brl(c.cartao_limite)}` : ''}`
                                                : 'Falta informar fechamento e vencimento'
                                            : c.responsavel
                                              ? `Responsável: ${c.responsavel}`
                                              : c.banco || '—'}
                                    </span>
                                    {c.saldo_inicial !== null ? <span className={SUB}>Saldo inicial {brl(c.saldo_inicial)} em {dataBR(c.saldo_inicial_em)}</span> : null}
                                    {!c.ativo ? <span className={`${SELO} ${S_MUDO} self-start`}>fora de uso</span> : null}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })}
            <div className={SUB}>O saldo de cada conta começa a contar na virada da Unymos: informe o saldo inicial e a data nesse dia.</div>
            {form ? (
                <Formulario
                    titulo={form.id ? form.nome || 'Conta' : 'Nova conta'}
                    largura="max-w-3xl"
                    inicial={{
                        nome: form.nome ?? '',
                        tipo: form.tipo ?? 'BANCO',
                        banco: form.banco ?? '',
                        agencia: form.agencia ?? '',
                        numero: form.numero ?? '',
                        responsavel_id: form.responsavel_id ?? '',
                        saldo_inicial: form.saldo_inicial !== null && form.saldo_inicial !== undefined ? numCampo(form.saldo_inicial) : '',
                        saldo_inicial_em: form.saldo_inicial_em ?? '',
                        cartao_fechamento: form.cartao_fechamento ?? '',
                        cartao_vencimento: form.cartao_vencimento ?? '',
                        cartao_limite: form.cartao_limite ? numCampo(form.cartao_limite) : '',
                        cartao_conta_pagamento_id: form.cartao_conta_pagamento_id ?? '',
                        portadores: form.portadores ?? [],
                        ativo: form.ativo ?? true,
                    }}
                    onFechar={() => setForm(null)}
                    onSalvar={(v) => salvar('conta', { id: form.id, ...v, responsavel_id: v.responsavel_id || null, cartao_conta_pagamento_id: v.cartao_conta_pagamento_id || null })}
                >
                    {(v, set) => (
                        <>
                            <div className="grid gap-3 lg:grid-cols-2">
                                <Campo r="Nome">
                                    <input className={CAMPO} value={v.nome} onChange={(e) => set({ nome: e.target.value })} />
                                </Campo>
                                <Campo r="Tipo">
                                    <select className={CAMPO} value={v.tipo} disabled={!!form.id} onChange={(e) => set({ tipo: e.target.value as Conta['tipo'] })}>
                                        {TIPOS_CONTA.map(([k, r]) => (
                                            <option key={k} value={k}>
                                                {r}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <Campo r="Banco">
                                    <input className={CAMPO} value={v.banco} onChange={(e) => set({ banco: e.target.value })} />
                                </Campo>
                                <Campo r="Agência">
                                    <input className={CAMPO} value={v.agencia} onChange={(e) => set({ agencia: e.target.value })} />
                                </Campo>
                                <Campo r="Conta">
                                    <input className={CAMPO} value={v.numero} onChange={(e) => set({ numero: e.target.value })} />
                                </Campo>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-3">
                                <Campo r="Responsável">
                                    <select className={CAMPO} value={v.responsavel_id} onChange={(e) => set({ responsavel_id: e.target.value ? Number(e.target.value) : '' })}>
                                        <option value="">—</option>
                                        {cad.usuarios.map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.nome}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo r="Saldo inicial">
                                    <input className={CAMPO} inputMode="decimal" value={v.saldo_inicial} onChange={(e) => set({ saldo_inicial: e.target.value })} placeholder="na virada" />
                                </Campo>
                                <Campo r="Data do saldo">
                                    <input className={CAMPO} type="date" value={v.saldo_inicial_em} onChange={(e) => set({ saldo_inicial_em: e.target.value })} />
                                </Campo>
                            </div>
                            {v.tipo === 'CARTAO' ? (
                                <>
                                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                        <Campo r="Dia do fechamento">
                                            <input className={CAMPO} inputMode="numeric" value={v.cartao_fechamento} onChange={(e) => set({ cartao_fechamento: e.target.value })} />
                                        </Campo>
                                        <Campo r="Dia do vencimento">
                                            <input className={CAMPO} inputMode="numeric" value={v.cartao_vencimento} onChange={(e) => set({ cartao_vencimento: e.target.value })} />
                                        </Campo>
                                        <Campo r="Limite">
                                            <input className={CAMPO} inputMode="decimal" value={v.cartao_limite} onChange={(e) => set({ cartao_limite: e.target.value })} />
                                        </Campo>
                                        <Campo r="Fatura paga pela">
                                            <select className={CAMPO} value={v.cartao_conta_pagamento_id} onChange={(e) => set({ cartao_conta_pagamento_id: e.target.value ? Number(e.target.value) : '' })}>
                                                <option value="">—</option>
                                                {cad.contas.filter((c) => c.ativo && c.tipo === 'BANCO').map((c) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.nome}
                                                    </option>
                                                ))}
                                            </select>
                                        </Campo>
                                    </div>
                                    <div>
                                        <div className={ROTULO}>Quem pode usar</div>
                                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                            {cad.usuarios.map((u) => (
                                                <Marcar
                                                    key={u.id}
                                                    on={v.portadores.includes(u.id)}
                                                    rotulo={u.nome}
                                                    onClick={() => set({ portadores: v.portadores.includes(u.id) ? v.portadores.filter((x: number) => x !== u.id) : [...v.portadores, u.id] })}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </>
                            ) : null}
                            {form.id ? <Marcar on={!v.ativo} onClick={() => set({ ativo: !v.ativo })} rotulo="Fora de uso" /> : null}
                        </>
                    )}
                </Formulario>
            ) : null}
        </>
    );
}

/* ============================== locais e áreas ============================== */

function NomeRapido({ titulo, inicial, comAtivo, ativo, onFechar, onSalvar }: { titulo: string; inicial: string; comAtivo?: boolean; ativo?: boolean; onFechar: () => void; onSalvar: (nome: string, ativo: boolean) => Promise<boolean> }) {
    return (
        <Formulario titulo={titulo} inicial={{ nome: inicial, ativo: ativo ?? true }} onFechar={onFechar} onSalvar={(v) => onSalvar(v.nome, v.ativo)}>
            {(v, set) => (
                <>
                    <Campo r="Nome">
                        <input className={CAMPO} value={v.nome} onChange={(e) => set({ nome: e.target.value })} autoFocus />
                    </Campo>
                    {comAtivo ? <Marcar on={!v.ativo} onClick={() => set({ ativo: !v.ativo })} rotulo="Fora de uso" /> : null}
                </>
            )}
        </Formulario>
    );
}

function AbaLocais({ cad, salvar }: { cad: Cadastros; salvar: Salvar }) {
    const [form, setForm] = useState<{ tipo: 'local' | 'area'; id?: number; pai_id?: number; nome?: string; ativo?: boolean; titulo: string } | null>(null);
    return (
        <>
            <Caixa
                titulo="Locais"
                extra={
                    <button type="button" className={BTN_PEQ} onClick={() => setForm({ tipo: 'local', titulo: 'Novo local' })}>
                        <IconPlus size={16} /> Local
                    </button>
                }
            >
                {cad.locais.map((l) => (
                    <div key={l.id} className={`${LINHA} ${l.ativo ? '' : 'opacity-50'}`}>
                        <span className="min-w-0 flex-1 font-bold">{l.nome}</span>
                        {!l.ativo ? <span className={`${SELO} ${S_MUDO}`}>fora de uso</span> : null}
                        <button type="button" className={BTN_PEQ} aria-label="Alterar" onClick={() => setForm({ tipo: 'local', id: l.id, nome: l.nome, ativo: l.ativo, titulo: 'Alterar local' })}>
                            <IconPencil size={16} />
                        </button>
                    </div>
                ))}
            </Caixa>
            <div className="flex items-center gap-2">
                <span className="text-[15px] font-extrabold">Áreas de negócio</span>
                <span className={SUB}>cada item da OS cai numa linha</span>
                <button type="button" className={`${BTN_PEQ} ml-auto`} onClick={() => setForm({ tipo: 'area', titulo: 'Nova área de negócio' })}>
                    <IconPlus size={16} /> Área
                </button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
                {cad.areas.map((a) => (
                    <Caixa
                        key={a.id}
                        titulo={<span className={`text-[13px] text-[#313C55] dark:text-white ${a.ativo ? '' : 'opacity-50'}`}>{a.nome}</span>}
                        extra={
                            <span className="flex gap-2">
                                <button type="button" className={BTN_PEQ} onClick={() => setForm({ tipo: 'area', pai_id: a.id, titulo: `Nova linha em ${a.nome}` })}>
                                    <IconPlus size={16} /> Linha
                                </button>
                                <button type="button" className={BTN_PEQ} aria-label="Alterar área" onClick={() => setForm({ tipo: 'area', id: a.id, nome: a.nome, ativo: a.ativo, titulo: 'Alterar área' })}>
                                    <IconPencil size={16} />
                                </button>
                            </span>
                        }
                    >
                        <div className="flex flex-wrap gap-2 px-4 pb-4">
                            {a.linhas.length ? (
                                a.linhas.map((l) => (
                                    <button
                                        key={l.id}
                                        type="button"
                                        onClick={() => setForm({ tipo: 'area', id: l.id, nome: l.nome, ativo: l.ativo, titulo: `Alterar linha de ${a.nome}` })}
                                        className={`inline-flex min-h-9 items-center rounded-full bg-[#E8EFF7] px-3.5 text-[14px] font-bold dark:bg-[#3D6A99]/25 ${l.ativo ? '' : 'line-through opacity-50'}`}
                                    >
                                        {l.nome}
                                    </button>
                                ))
                            ) : (
                                <span className={SUB}>sem linhas</span>
                            )}
                        </div>
                    </Caixa>
                ))}
            </div>
            <div className={NOTA}>
                Memorial: os valores da sala são os da tabela já cadastrada no sistema. Uso numa OS própria ou no plano = valor de tabela; sala alugada sozinha para cerimônia de atendimento de outra empresa = o
                dobro da tabela.
            </div>
            {form ? (
                <NomeRapido
                    titulo={form.titulo}
                    inicial={form.nome ?? ''}
                    comAtivo={!!form.id}
                    ativo={form.ativo}
                    onFechar={() => setForm(null)}
                    onSalvar={(nome, ativo) => salvar(form.tipo, { id: form.id, pai_id: form.pai_id, nome, ativo })}
                />
            ) : null}
        </>
    );
}

/* ============================== veículos ============================== */

function AbaVeiculos({ cad, salvar }: { cad: Cadastros; salvar: Salvar }) {
    const [form, setForm] = useState<Partial<Veiculo> | null>(null);
    const apelido = (modelo: string, placa: string) => {
        const p = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        return modelo ? `${modelo.trim()}-${p.length === 7 ? p.slice(-4) : p}` : '—';
    };
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={BTN_PEQ_PRI} onClick={() => setForm({ ativo: true })}>
                    <IconPlus size={16} /> Novo veículo
                </button>
                <span className={SUB}>O apelido (modelo + final da placa) é o que aparece no rateio e nos relatórios.</span>
            </div>
            <Caixa>
                <div className="hidden grid-cols-[130px_minmax(0,1.2fr)_70px_110px_140px_minmax(0,.8fr)_44px] gap-3 bg-[#F6F8FB] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:grid">
                    <span>Apelido</span>
                    <span>Marca · modelo</span>
                    <span>Ano</span>
                    <span>Placa</span>
                    <span>Renavam</span>
                    <span>Uso</span>
                    <span />
                </div>
                {cad.veiculos.map((v) => (
                    <div
                        key={v.id}
                        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-[#EEF2F7] px-4 py-2.5 text-[14.5px] dark:border-white/[0.06] lg:grid-cols-[130px_minmax(0,1.2fr)_70px_110px_140px_minmax(0,.8fr)_44px] ${v.ativo ? '' : 'opacity-50'}`}
                    >
                        <b>{v.apelido}</b>
                        <span className="hidden lg:block">
                            {v.marca} {v.modelo}
                        </span>
                        <span className="hidden lg:block">{v.ano || <span className={`${SELO} ${S_AVISO}`}>falta</span>}</span>
                        <span className="hidden lg:block">{v.placa.length === 7 ? `${v.placa.slice(0, 3)}-${v.placa.slice(3)}` : <span className={`${SELO} ${S_AVISO}`}>{v.placa} incompleta</span>}</span>
                        <span className="hidden lg:block">{v.renavam || <span className={`${SELO} ${S_AVISO}`}>falta</span>}</span>
                        <span className="hidden lg:block">{v.uso ? USO[v.uso] : '—'}</span>
                        <button type="button" className={BTN_PEQ} aria-label="Alterar" onClick={() => setForm(v)}>
                            <IconPencil size={16} />
                        </button>
                        <span className={`${SUB} col-span-2 lg:hidden`}>
                            {v.marca} {v.modelo} · {v.ano || 'ano?'} · {v.uso ? USO[v.uso] : 'uso?'}
                            {v.incompleto ? ' · cadastro incompleto' : ''}
                        </span>
                    </div>
                ))}
            </Caixa>
            {form ? (
                <Formulario
                    titulo={form.id ? `Alterar ${form.apelido}` : 'Novo veículo'}
                    largura="max-w-3xl"
                    inicial={{ marca: form.marca ?? '', modelo: form.modelo ?? '', ano: form.ano ? String(form.ano) : '', placa: form.placa ?? '', renavam: form.renavam ?? '', uso: form.uso ?? '', ativo: form.ativo ?? true }}
                    onFechar={() => setForm(null)}
                    onSalvar={(v) => salvar('veiculo', { id: form.id, ...v, uso: v.uso || null })}
                >
                    {(v, set) => (
                        <>
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                <Campo r="Marca">
                                    <input className={CAMPO} value={v.marca} onChange={(e) => set({ marca: e.target.value })} placeholder="Toyota" />
                                </Campo>
                                <Campo r="Modelo">
                                    <input className={CAMPO} value={v.modelo} onChange={(e) => set({ modelo: e.target.value })} placeholder="Hilux" />
                                </Campo>
                                <Campo r="Ano">
                                    <input className={CAMPO} inputMode="numeric" value={v.ano} onChange={(e) => set({ ano: e.target.value })} placeholder="2024" />
                                </Campo>
                                <Campo r="Placa">
                                    <input className={CAMPO} value={v.placa} onChange={(e) => set({ placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) })} placeholder="ABC1D23" />
                                </Campo>
                            </div>
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                                <Campo r="Renavam">
                                    <input className={CAMPO} inputMode="numeric" value={v.renavam} onChange={(e) => set({ renavam: e.target.value.replace(/\D/g, '').slice(0, 11) })} />
                                </Campo>
                                <Campo r="Uso">
                                    <select className={CAMPO} value={v.uso} onChange={(e) => set({ uso: e.target.value })}>
                                        <option value="">A definir</option>
                                        {Object.entries(USO).map(([k, r]) => (
                                            <option key={k} value={k}>
                                                {r}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo r="Apelido">
                                    <input className={CAMPO} value={apelido(v.modelo, v.placa)} disabled />
                                </Campo>
                            </div>
                            {form.id ? <Marcar on={!v.ativo} onClick={() => set({ ativo: !v.ativo })} rotulo="Fora de uso (vendido, baixado)" /> : null}
                        </>
                    )}
                </Formulario>
            ) : null}
        </>
    );
}

/* ============================== instalações ============================== */

function AbaInstalacoes({ cad, salvar }: { cad: Cadastros; salvar: Salvar }) {
    const [form, setForm] = useState<Record<string, any> | null>(null);
    const forn = cad.pessoas.filter((p) => p.fornecedor && p.ativo);
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={BTN_PEQ_PRI} onClick={() => setForm({ ativo: true })}>
                    <IconPlus size={16} /> Nova instalação
                </button>
                <span className={SUB}>Luz, água, telefone e internet de cada local. No lançamento, escolher a instalação já preenche fornecedor, natureza e local.</span>
            </div>
            <Caixa>
                {!cad.instalacoes.length ? <div className="px-4 py-8 text-center text-[#5B6478]">Nenhuma instalação cadastrada.</div> : null}
                {cad.instalacoes.map((i) => (
                    <div key={i.id} className={`${LINHA} ${i.ativo ? '' : 'opacity-50'}`}>
                        <div className="min-w-0 flex-1">
                            <b>{i.local}</b> · {i.pessoa}
                            <div className={SUB}>
                                {i.natureza} · {i.numero}
                                {i.dia_vencimento ? ` · vence dia ${i.dia_vencimento}` : ''}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="font-extrabold tabular-nums">{i.ultimo !== null ? brl(i.ultimo) : '—'}</div>
                            <div className={SUB}>{i.media !== null ? `média ${brl(i.media)}` : 'sem histórico'}</div>
                        </div>
                        {i.variacao !== null ? (
                            <span className={`${SELO} ${i.variacao >= 30 ? S_RUIM : i.variacao >= 10 ? S_AVISO : S_OK}`}>
                                {i.variacao >= 0 ? '+' : ''}
                                {Math.round(i.variacao)}%
                            </span>
                        ) : null}
                        <button type="button" className={BTN_PEQ} aria-label="Alterar" onClick={() => setForm(i)}>
                            <IconPencil size={16} />
                        </button>
                    </div>
                ))}
            </Caixa>
            {form ? (
                <Formulario
                    titulo={form.id ? 'Alterar instalação' : 'Nova instalação'}
                    largura="max-w-3xl"
                    inicial={{
                        local_id: form.local_id ?? '',
                        pessoa_id: form.pessoa_id ?? '',
                        numero: form.numero ?? '',
                        natureza_id: form.natureza_id ?? null,
                        area_id: form.area_id ?? '',
                        dia_vencimento: form.dia_vencimento ?? '',
                        ativo: form.ativo ?? true,
                    }}
                    onFechar={() => setForm(null)}
                    onSalvar={(v) => salvar('instalacao', { id: form.id, ...v, area_id: v.area_id || null })}
                >
                    {(v, set) => (
                        <>
                            <div className="grid gap-3 lg:grid-cols-2">
                                <Campo r="Local">
                                    <select className={CAMPO} value={v.local_id} onChange={(e) => set({ local_id: e.target.value ? Number(e.target.value) : '' })}>
                                        <option value="">Escolha</option>
                                        {cad.locais.filter((l) => l.ativo).map((l) => (
                                            <option key={l.id} value={l.id}>
                                                {l.nome}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo r="Fornecedor">
                                    <select
                                        className={CAMPO}
                                        value={v.pessoa_id}
                                        onChange={(e) => {
                                            const p = forn.find((x) => x.id === Number(e.target.value));
                                            set({ pessoa_id: e.target.value ? Number(e.target.value) : '', natureza_id: v.natureza_id ?? p?.natureza_padrao_id ?? null });
                                        }}
                                    >
                                        <option value="">Escolha (cadastre em Clientes e fornecedores)</option>
                                        {forn.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.nome}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2">
                                <Campo r="Nº da instalação, matrícula ou linha">
                                    <input className={CAMPO} value={v.numero} onChange={(e) => set({ numero: e.target.value })} />
                                </Campo>
                                <Campo r="Dia do vencimento">
                                    <input className={CAMPO} inputMode="numeric" value={v.dia_vencimento} onChange={(e) => set({ dia_vencimento: e.target.value })} />
                                </Campo>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2">
                                <Campo r="Natureza">
                                    <SelectNatureza cad={cad} value={v.natureza_id} onChange={(n) => set({ natureza_id: n })} classe={CAMPO} />
                                </Campo>
                                <Campo r="Área · linha">
                                    <select className={CAMPO} value={v.area_id} onChange={(e) => set({ area_id: e.target.value ? Number(e.target.value) : '' })}>
                                        <option value="">—</option>
                                        {opcoesArea(cad).map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.nome}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                            </div>
                            {form.id ? <Marcar on={!v.ativo} onClick={() => set({ ativo: !v.ativo })} rotulo="Fora de uso" /> : null}
                        </>
                    )}
                </Formulario>
            ) : null}
        </>
    );
}

/* ============================== recorrentes ============================== */

function AbaRecorrentes({ cad, salvar }: { cad: Cadastros; salvar: Salvar }) {
    const SIT = { ATIVA: ['Ativa', S_OK], PAUSADA: ['Pausada', S_AVISO], ENCERRADA: ['Encerrada', S_MUDO] } as const;
    return (
        <>
            <div className={SUB}>
                Nascem ao lançar um título com "Repete todo mês" (contas de consumo já vêm marcadas). Os próximos meses entram como Previsto no Contas a pagar; quando a fatura chega, é só confirmar o valor.
            </div>
            <Caixa>
                {!cad.recorrentes.length ? <div className="px-4 py-8 text-center text-[#5B6478]">Nenhuma recorrente ainda.</div> : null}
                {cad.recorrentes.map((r) => (
                    <div key={r.id} className={LINHA}>
                        <div className="min-w-0 flex-1">
                            <b>{r.pessoa}</b>
                            <div className={SUB}>
                                {r.descricao} · dia {r.dia_vencimento} · desde {r.inicio.slice(5)}/{r.inicio.slice(0, 4)}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="font-extrabold tabular-nums">{brl(r.valor)}</div>
                            <div className={SUB}>{r.valor_tipo === 'MEDIA' ? 'estimado pela média' : 'valor fixo'}</div>
                        </div>
                        <span className={`${SELO} ${SIT[r.situacao][1]}`}>{SIT[r.situacao][0]}</span>
                        {r.situacao !== 'ENCERRADA' ? (
                            <>
                                <button type="button" className={BTN_PEQ} onClick={() => void salvar('recorrente', { id: r.id, situacao: r.situacao === 'ATIVA' ? 'PAUSADA' : 'ATIVA' })}>
                                    {r.situacao === 'ATIVA' ? 'Pausar' : 'Retomar'}
                                </button>
                                <button type="button" className={BTN_PEQ} onClick={() => void salvar('recorrente', { id: r.id, situacao: 'ENCERRADA' })}>
                                    Encerrar
                                </button>
                            </>
                        ) : null}
                    </div>
                ))}
            </Caixa>
        </>
    );
}

/* ============================== orçamento ============================== */

type Meta = { id: number; natureza_id: number; natureza: string; local_id: number | null; area_id: number | null; veiculo_id: number | null; meta: number; realizado: number; pct: number | null };

function AbaOrcamento({ cad, avisar }: { cad: Cadastros; avisar: (m: string) => void }) {
    const [comp, setComp] = useState(hojeISO().slice(0, 7));
    const [itens, setItens] = useState<Meta[]>([]);
    const [edit, setEdit] = useState<Record<number, string>>({});
    const [nova, setNova] = useState<{ natureza_id: number | null; local_id: number | ''; area_id: number | ''; veiculo_id: number | ''; valor: string }>({ natureza_id: null, local_id: '', area_id: '', veiculo_id: '', valor: '' });
    const [reaj, setReaj] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const areas = opcoesArea(cad);

    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_BASE, 'orcamento', undefined, `&comp=${comp}`);
            setItens(j.dados.itens);
            setEdit({});
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar o orçamento.');
            if (m) setErro(m);
        }
    }, [comp]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const enviar = async (acao: string, corpo: Record<string, unknown>) => {
        try {
            const j = await api(URL_BASE, acao, corpo);
            avisar(j.msg);
            if (acao === 'copiar_orcamento') setComp(String(corpo.para));
            else {
                setItens(j.dados.itens);
                setEdit({});
            }
            return true;
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível salvar.');
            if (m) setErro(m);
            return false;
        }
    };
    const filtro = (m: Meta) =>
        [
            m.local_id ? cad.locais.find((l) => l.id === m.local_id)?.nome : null,
            m.area_id ? areas.find((a) => a.id === m.area_id)?.nome : null,
            m.veiculo_id ? cad.veiculos.find((v) => v.id === m.veiculo_id)?.apelido : null,
        ]
            .filter(Boolean)
            .join(' · ') || 'todos';

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={BTN_PEQ} onClick={() => setComp(mesMais(comp, -1))} aria-label="Mês anterior">
                    ‹
                </button>
                <span className="min-w-40 text-center text-[16px] font-extrabold">{mesBR(comp)}</span>
                <button type="button" className={BTN_PEQ} onClick={() => setComp(mesMais(comp, 1))} aria-label="Próximo mês">
                    ›
                </button>
                {!itens.length ? (
                    <span className="flex flex-wrap items-center gap-2 lg:ml-auto">
                        <input className={`${CAMPO_P} w-28`} inputMode="decimal" placeholder="reajuste %" value={reaj} onChange={(e) => setReaj(e.target.value)} />
                        <button type="button" className={BTN_PEQ} onClick={() => void enviar('copiar_orcamento', { de: mesMais(comp, -1), para: comp, reajuste: reaj || 0 })}>
                            Copiar de {mesBR(mesMais(comp, -1)).toLowerCase()}
                        </button>
                    </span>
                ) : null}
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
            <Caixa>
                <div className="hidden grid-cols-[minmax(0,1.4fr)_140px_130px_minmax(0,1fr)_110px] gap-3 bg-[#F6F8FB] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:grid">
                    <span>Natureza · filtro</span>
                    <span>Meta do mês</span>
                    <span className="text-right">Realizado</span>
                    <span>Uso</span>
                    <span>Situação</span>
                </div>
                {!itens.length ? <div className="px-4 py-6 text-center text-[#5B6478]">Nenhuma meta neste mês.</div> : null}
                {itens.map((m) => {
                    const pct = m.pct ?? 0;
                    const nv = pct >= 100 ? 'er' : pct >= 80 ? 'wr' : '';
                    return (
                        <div key={m.id} className="grid grid-cols-2 items-center gap-3 border-t border-[#EEF2F7] px-4 py-2.5 text-[14.5px] dark:border-white/[0.06] lg:grid-cols-[minmax(0,1.4fr)_140px_130px_minmax(0,1fr)_110px]">
                            <div className="col-span-2 min-w-0 lg:col-span-1">
                                <b>{m.natureza}</b>
                                <div className={SUB}>{filtro(m)}</div>
                            </div>
                            <input className={CAMPO_P} inputMode="decimal" value={edit[m.id] ?? numCampo(m.meta)} onChange={(e) => setEdit({ ...edit, [m.id]: e.target.value })} aria-label="Meta" />
                            <span className="text-right font-extrabold tabular-nums">{brl(m.realizado)}</span>
                            <div className="col-span-2 lg:col-span-1">
                                <div className="h-2.5 overflow-hidden rounded-full bg-[#EEF2F7] dark:bg-white/[0.08]">
                                    <div className={`h-full rounded-full ${nv === 'er' ? 'bg-[#B42318]' : nv === 'wr' ? 'bg-[#E0B400]' : 'bg-[#313C55] dark:bg-[#F2CB3F]'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                </div>
                                <div className={`${SUB} mt-1`}>{Math.round(pct)}% da meta</div>
                            </div>
                            <span className={`${SELO} ${nv === 'er' ? S_RUIM : nv === 'wr' ? S_AVISO : S_OK} justify-self-start`}>{nv === 'er' ? 'Estourou' : nv === 'wr' ? 'Atenção' : 'Dentro'}</span>
                        </div>
                    );
                })}
                {Object.keys(edit).length ? (
                    <div className="flex justify-end border-t border-[#EEF2F7] px-4 py-2.5 dark:border-white/[0.06]">
                        <button type="button" className={BTN_PEQ_PRI} onClick={() => void enviar('orcamento', { comp, itens: Object.entries(edit).map(([id, valor]) => ({ id: Number(id), valor: paraNumero(valor) ?? 0 })) })}>
                            Salvar metas (meta zero remove)
                        </button>
                    </div>
                ) : null}
            </Caixa>
            <Caixa titulo="Nova meta">
                <div className="grid grid-cols-2 gap-2 px-4 pb-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,1.2fr)_minmax(0,.8fr)_120px_auto]">
                    <div className="col-span-2 lg:col-span-1">
                        <SelectNatureza cad={cad} value={nova.natureza_id} onChange={(n) => setNova({ ...nova, natureza_id: n })} />
                    </div>
                    <select className={CAMPO_P} value={nova.local_id} onChange={(e) => setNova({ ...nova, local_id: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">Todos os locais</option>
                        {cad.locais.filter((l) => l.ativo).map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.nome}
                            </option>
                        ))}
                    </select>
                    <select className={CAMPO_P} value={nova.area_id} onChange={(e) => setNova({ ...nova, area_id: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">Todas as áreas</option>
                        {areas.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.nome}
                            </option>
                        ))}
                    </select>
                    <select className={CAMPO_P} value={nova.veiculo_id} onChange={(e) => setNova({ ...nova, veiculo_id: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">Todos os veículos</option>
                        {cad.veiculos.filter((v) => v.ativo).map((v) => (
                            <option key={v.id} value={v.id}>
                                {v.apelido}
                            </option>
                        ))}
                    </select>
                    <input className={CAMPO_P} inputMode="decimal" placeholder="Meta R$" value={nova.valor} onChange={(e) => setNova({ ...nova, valor: e.target.value })} />
                    <button
                        type="button"
                        className={BTN_PEQ_PRI}
                        onClick={async () => {
                            if (!nova.natureza_id || !paraNumero(nova.valor)) return setErro('Escolha a natureza e informe a meta.');
                            const ok = await enviar('orcamento', {
                                comp,
                                itens: [{ natureza_id: nova.natureza_id, local_id: nova.local_id || null, area_id: nova.area_id || null, veiculo_id: nova.veiculo_id || null, valor: paraNumero(nova.valor) }],
                            });
                            if (ok) setNova({ natureza_id: null, local_id: '', area_id: '', veiculo_id: '', valor: '' });
                        }}
                    >
                        <IconPlus size={16} /> Incluir
                    </button>
                </div>
            </Caixa>
            <div className={SUB}>O realizado soma o rateio dos títulos do mês (por competência) e as compras no cartão. Aviso ao chegar a 80% e ao passar de 100% da meta, no topo do Contas a pagar.</div>
        </>
    );
}

/* ============================== pontos de recebimento ============================== */

function AbaPontos({ cad, salvar }: { cad: Cadastros; salvar: Salvar }) {
    const [ed, setEd] = useState<Record<number, { tipo: string; valor: string }>>({});
    const [novo, setNovo] = useState({ cidade: '', responsavel: '' });
    return (
        <>
            <Caixa>
                <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,.8fr)_minmax(0,.8fr)_240px_120px_auto] gap-3 bg-[#F6F8FB] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:grid">
                    <span>Ponto</span>
                    <span>Cidade</span>
                    <span>Responsável</span>
                    <span>Comissão</span>
                    <span className="text-right">Valor</span>
                    <span />
                </div>
                {cad.pontos.map((p) => {
                    const e = ed[p.id] ?? { tipo: p.comissao_tipo ?? '', valor: p.comissao_valor !== null ? String(p.comissao_valor).replace('.', ',') : '' };
                    const mudou = !!ed[p.id];
                    return (
                        <div key={p.id} className="grid grid-cols-2 items-center gap-2 border-t border-[#EEF2F7] px-4 py-2.5 text-[14.5px] dark:border-white/[0.06] lg:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)_minmax(0,.8fr)_240px_120px_auto] lg:gap-3">
                            <b>{p.nome}</b>
                            <span>{p.cidade}</span>
                            <span className="hidden lg:block">{p.responsavel}</span>
                            <select className={CAMPO_P} value={e.tipo} onChange={(x) => setEd({ ...ed, [p.id]: { ...e, tipo: x.target.value } })} aria-label="Forma da comissão">
                                <option value="">Sem comissão definida</option>
                                <option value="FIXO">Valor fixo por mensalidade</option>
                                <option value="PCT">Percentual da mensalidade</option>
                            </select>
                            <input
                                className={`${CAMPO_P} text-right`}
                                inputMode="decimal"
                                disabled={!e.tipo}
                                placeholder={e.tipo === 'PCT' ? '%' : e.tipo === 'FIXO' ? 'R$' : '—'}
                                value={e.valor}
                                onChange={(x) => setEd({ ...ed, [p.id]: { ...e, valor: x.target.value } })}
                                aria-label="Valor da comissão"
                            />
                            <button
                                type="button"
                                className={mudou ? BTN_PEQ_PRI : BTN_PEQ}
                                disabled={!mudou}
                                onClick={async () => {
                                    const ok = await salvar('ponto', { id: p.id, nome: p.nome, cidade: p.cidade, responsavel: p.responsavel, usuario_id: p.usuario_id, conta_id: p.conta_id, comissao_tipo: e.tipo || null, comissao_valor: e.valor, ativo: p.ativo });
                                    if (ok) {
                                        const c = { ...ed };
                                        delete c[p.id];
                                        setEd(c);
                                    }
                                }}
                            >
                                Salvar
                            </button>
                        </div>
                    );
                })}
            </Caixa>
            <div className="flex flex-wrap gap-2">
                <input className={`${CAMPO_P} w-full lg:w-56`} placeholder="Cidade" value={novo.cidade} onChange={(e) => setNovo({ ...novo, cidade: e.target.value })} />
                <input className={`${CAMPO_P} w-full lg:w-64`} placeholder="Responsável" value={novo.responsavel} onChange={(e) => setNovo({ ...novo, responsavel: e.target.value })} />
                <button
                    type="button"
                    className={BTN_PEQ_PRI}
                    onClick={async () => {
                        if (await salvar('ponto', { cidade: novo.cidade, responsavel: novo.responsavel })) setNovo({ cidade: '', responsavel: '' });
                    }}
                >
                    <IconPlus size={16} /> Incluir ponto
                </button>
            </div>
            <div className={SUB}>A comissão é calculada sobre cada mensalidade recebida pelo ponto (etapa 3, contas a receber) e vai para o contas a pagar. Mudar a regra não altera o que já foi calculado.</div>
        </>
    );
}

/* ============================== formas ============================== */

function AbaFormas({ cad, salvar }: { cad: Cadastros; salvar: Salvar }) {
    return (
        <Caixa titulo="Formas de pagamento">
            {cad.formas.map((f) => (
                <div key={f.id} className={LINHA}>
                    <b className="min-w-0 flex-1">{f.nome}</b>
                    <Marcar on={f.exige_comprovante} rotulo="Exige comprovante" onClick={() => void salvar('forma', { id: f.id, exige_comprovante: !f.exige_comprovante, ativo: f.ativo })} />
                </div>
            ))}
        </Caixa>
    );
}

/* ============================== clientes e fornecedores ============================== */

function AbaPessoas({ cad, salvar }: { cad: Cadastros; salvar: Salvar }) {
    const [filtro, setFiltro] = useState<'' | 'cliente' | 'fornecedor'>('');
    const [busca, setBusca] = useState('');
    const [form, setForm] = useState<Partial<Pessoa> | null>(null);
    const q = busca.trim().toLowerCase();
    const lista = cad.pessoas.filter((p) => (!filtro || p[filtro]) && (!q || p.nome.toLowerCase().includes(q)));
    const natNome = (id: number | null) => (id ? cad.naturezas.find((n) => n.id === id)?.nome : null);
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={BTN_PEQ_PRI} onClick={() => setForm({ fornecedor: true, cliente: false, ativo: true })}>
                    <IconPlus size={16} /> Novo cadastro
                </button>
                {(
                    [
                        ['', 'Todos'],
                        ['cliente', 'Clientes'],
                        ['fornecedor', 'Fornecedores'],
                    ] as const
                ).map(([k, r]) => (
                    <button key={k} type="button" className={PILULA(filtro === k)} onClick={() => setFiltro(k)}>
                        {r}
                    </button>
                ))}
                <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3 dark:bg-[#232B3F] lg:ml-auto lg:w-72 lg:flex-none">
                    <IconSearch size={18} className="text-[#5B6478]" />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                </label>
            </div>
            <Caixa>
                {!lista.length ? <div className="px-4 py-8 text-center text-[#5B6478]">Nenhum cadastro.</div> : null}
                {lista.map((p) => (
                    <button key={p.id} type="button" onClick={() => setForm(p)} className={`${LINHA} w-full text-left hover:bg-[#F6F8FB] dark:hover:bg-white/[0.03] ${p.ativo ? '' : 'opacity-50'}`}>
                        <div className="min-w-0 flex-1">
                            <b className="break-words">{p.nome}</b>
                            <div className={SUB}>
                                {[p.documento, natNome(p.natureza_padrao_id), p.telefone].filter(Boolean).join(' · ') || '—'}
                            </div>
                        </div>
                        {p.cliente ? <span className={`${SELO} ${S_OK}`}>Cliente</span> : null}
                        {p.fornecedor ? <span className={`${SELO} ${S_MUDO}`}>Fornecedor</span> : null}
                        <span className={SUB}>{p.titulos} título(s)</span>
                    </button>
                ))}
            </Caixa>
            <div className={SUB}>Um cadastro só para quem contrata e quem fornece. Outra funerária que contrata um atendimento entra como cliente da OS. CPF e CNPJ aparecem mascarados nas listas.</div>
            {form ? (
                <Formulario
                    titulo={form.id ? form.nome || 'Cadastro' : 'Novo cliente ou fornecedor'}
                    largura="max-w-3xl"
                    inicial={{
                        nome: form.nome ?? '',
                        documento: '',
                        cliente: !!form.cliente,
                        fornecedor: form.fornecedor ?? true,
                        natureza_padrao_id: form.natureza_padrao_id ?? null,
                        telefone: form.telefone ?? '',
                        email: form.email ?? '',
                        pix_tipo: form.pix_tipo ?? '',
                        pix_chave: form.pix_chave ?? '',
                        ativo: form.ativo ?? true,
                    }}
                    onFechar={() => setForm(null)}
                    onSalvar={(v) => salvar('pessoa', { id: form.id, ...v })}
                >
                    {(v, set) => (
                        <>
                            <div className="grid gap-3 lg:grid-cols-2">
                                <Campo r="Nome ou razão social">
                                    <input className={CAMPO} value={v.nome} onChange={(e) => set({ nome: e.target.value })} />
                                </Campo>
                                <Campo r={form.id && form.documento ? `CPF ou CNPJ (atual ${form.documento})` : 'CPF ou CNPJ'}>
                                    <input className={CAMPO} inputMode="numeric" value={v.documento} onChange={(e) => set({ documento: e.target.value })} placeholder={form.id ? 'deixe em branco para manter' : 'só números'} />
                                </Campo>
                            </div>
                            <div className="grid gap-2 lg:grid-cols-2">
                                <Marcar on={v.cliente} onClick={() => set({ cliente: !v.cliente })} rotulo="Cliente" />
                                <Marcar on={v.fornecedor} onClick={() => set({ fornecedor: !v.fornecedor })} rotulo="Fornecedor" />
                            </div>
                            {v.fornecedor ? (
                                <Campo r="Natureza padrão (já vem no rateio)">
                                    <SelectNatureza cad={cad} value={v.natureza_padrao_id} onChange={(n) => set({ natureza_padrao_id: n })} classe={CAMPO} />
                                </Campo>
                            ) : null}
                            <div className="grid gap-3 lg:grid-cols-2">
                                <Campo r="Telefone">
                                    <input className={CAMPO} inputMode="tel" value={v.telefone} onChange={(e) => set({ telefone: e.target.value })} />
                                </Campo>
                                <Campo r="E-mail">
                                    <input className={CAMPO} inputMode="email" value={v.email} onChange={(e) => set({ email: e.target.value })} />
                                </Campo>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
                                <Campo r="Tipo de chave Pix">
                                    <select className={CAMPO} value={v.pix_tipo} onChange={(e) => set({ pix_tipo: e.target.value })}>
                                        <option value="">—</option>
                                        {['CPF', 'CNPJ', 'Telefone', 'E-mail', 'Aleatória'].map((k) => (
                                            <option key={k} value={k}>
                                                {k}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo r="Chave Pix">
                                    <input className={CAMPO} value={v.pix_chave} onChange={(e) => set({ pix_chave: e.target.value })} />
                                </Campo>
                            </div>
                            {form.id ? <Marcar on={!v.ativo} onClick={() => set({ ativo: !v.ativo })} rotulo="Fora de uso" /> : null}
                        </>
                    )}
                </Formulario>
            ) : null}
        </>
    );
}

/* ============================== fechamento do mês ============================== */

function AbaFechamento({ cad, salvar }: { cad: Cadastros; salvar: Salvar }) {
    const atual = hojeISO().slice(0, 7);
    const meses = Array.from({ length: 12 }, (_, i) => mesMais(atual, -i));
    const [reabrir, setReabrir] = useState<string | null>(null);
    const [motivo, setMotivo] = useState('');
    return (
        <>
            <div className={NOTA}>Mês fechado não aceita lançamento, pagamento, estorno nem cancelamento. Para fechar, as naturezas de pendência do mês precisam estar zeradas. Reabrir pede motivo e fica registrado.</div>
            <Caixa>
                {meses.map((m) => {
                    const f = cad.meses.find((x) => x.competencia === m);
                    return (
                        <div key={m} className={LINHA}>
                            <b className="min-w-0 flex-1">{mesBR(m)}</b>
                            {f?.fechado ? (
                                <span className={`${SELO} ${S_MUDO}`}>
                                    <IconLock size={14} /> fechado {f.fechado_em ? `em ${dataBR(f.fechado_em)}` : ''}
                                </span>
                            ) : (
                                <span className={`${SELO} ${S_OK}`}>
                                    <IconLockOpen size={14} /> aberto
                                </span>
                            )}
                            {f?.fechado ? (
                                <button type="button" className={BTN_PEQ} onClick={() => setReabrir(m)}>
                                    Reabrir
                                </button>
                            ) : m < atual ? (
                                <button type="button" className={BTN_PEQ_PRI} onClick={() => void salvar('fechar_mes', { comp: m })}>
                                    Fechar mês
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </Caixa>
            {reabrir ? (
                <Janela
                    titulo={`Reabrir ${mesBR(reabrir).toLowerCase()}`}
                    onFechar={() => setReabrir(null)}
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={() => setReabrir(null)}>
                                Voltar
                            </button>
                            <button
                                type="button"
                                className={BTN_PRI}
                                onClick={async () => {
                                    if (await salvar('reabrir_mes', { comp: reabrir, motivo })) {
                                        setReabrir(null);
                                        setMotivo('');
                                    }
                                }}
                            >
                                Reabrir
                            </button>
                        </>
                    }
                >
                    <Campo r="Motivo">
                        <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                    </Campo>
                </Janela>
            ) : null}
        </>
    );
}
