'use client';

/**
 * Peças comuns do financeiro da empresa (Contas a pagar, Cartão de crédito e Configurações do financeiro) — 11/11/2026.
 * Chamadas aos PHP fin_base.php e fin_pagar.php, formatação, estilos, janela e o editor de rateio.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconPlus, IconX } from '@tabler/icons-react';
import { BOTAO_PAGINA, BOTAO_PAGINA_PRI, BOTAO_PAGINA_SEC } from '@/components/shell/ModuloHub';

export const URL_BASE = 'https://api.planoassistencialintegrado.com.br/fin_base.php';
export const URL_PAGAR = 'https://api.planoassistencialintegrado.com.br/fin_pagar.php';

/* ============================== API ============================== */

export class SessaoExpirada extends Error {}

export async function api(url: string, acao: string, corpo?: Record<string, unknown>, extra = '') {
    const r = await fetch(`${url}?action=${acao}${extra}${corpo ? '' : `&_=${Date.now()}`}`, {
        cache: 'no-store',
        credentials: 'include',
        ...(corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {}),
    });
    return lerResposta(r);
}

async function lerResposta(r: Response) {
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
    if (json.erro) {
        const e: any = new Error(json.msg || 'Não foi possível concluir. Tente de novo.');
        e.duplicado = !!json.duplicado;
        throw e;
    }
    return json;
}

/** Envia um arquivo (nota, boleto, comprovante) para um título, um pagamento ou uma compra no cartão. */
export async function enviarAnexo(destino: { titulo_id?: number; baixa_id?: number; compra_id?: number }, arquivo: File) {
    const fd = new FormData();
    Object.entries(destino).forEach(([k, v]) => {
        if (v) fd.append(k, String(v));
    });
    fd.append('arquivo', arquivo);
    const r = await fetch(`${URL_PAGAR}?action=anexar`, { method: 'POST', credentials: 'include', body: fd });
    return lerResposta(r);
}

export const urlAnexo = (id: number) => `${URL_PAGAR}?action=anexo&id=${id}`;

/** Trata o erro padrão das telas: sessão expirada vai para o login; o resto vira mensagem. */
export function mensagemErro(e: any, padrao: string): string | null {
    if (e instanceof SessaoExpirada) {
        window.location.href = '/login';
        return null;
    }
    return e?.message || padrao;
}

/* ============================== utilidades ============================== */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const mesBR = (ym: string) => {
    const [a, m] = ym.split('-');
    const n = MESES[Number(m) - 1] || '';
    return `${n.charAt(0).toUpperCase()}${n.slice(1)} de ${a}`;
};
export const mesMais = (ym: string, n: number) => {
    const [a, m] = ym.split('-').map(Number);
    const t = a * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
export const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const diaMais = (iso: string, n: number) => {
    const [a, m, d] = iso.split('-').map(Number);
    const x = new Date(a, m - 1, d + n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const dataBR = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const diaMes = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const diaSemana = (iso: string) => {
    const [a, m, d] = iso.split('-').map(Number);
    return DIAS[new Date(a, m - 1, d).getDay()];
};
export const brl = (v?: number | string | null) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
/** Número para campo de texto: 1234.5 → "1.234,50". */
export const numCampo = (v?: number | null) => (v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export function paraNumero(s: string | number | null | undefined): number | null {
    if (typeof s === 'number') return s;
    let t = String(s ?? '').replace(/R\$|%|\s/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
}

/* ============================== estilos ============================== */

export const CAMPO =
    'h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:ring-2 focus:ring-[#3D6A99]/30 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white';
export const CAMPO_P =
    'h-11 w-full rounded-xl border-0 bg-[#F1F4F8] px-3 text-[15px] text-[#313C55] outline-none focus:ring-2 focus:ring-[#3D6A99]/30 dark:bg-[#1C2334] dark:text-white';
export const ROTULO = 'mb-1.5 block text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]';
export const BTN_SEC = `${BOTAO_PAGINA} ${BOTAO_PAGINA_SEC} disabled:opacity-40`;
export const BTN_PRI = `${BOTAO_PAGINA} ${BOTAO_PAGINA_PRI} disabled:opacity-40`;
export const BTN_PEQ =
    'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#C9D1DE] bg-white px-3 text-[13.5px] font-extrabold leading-none text-[#313C55] hover:border-[#313C55] disabled:opacity-40 dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white';
export const BTN_PEQ_PRI =
    'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#313C55] px-3.5 text-[13.5px] font-extrabold leading-none text-white hover:bg-[#232B40] disabled:opacity-40 dark:bg-[#F2CB3F] dark:text-[#313C55]';
export const CARTAO = 'rounded-2xl border border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]';
export const SELO = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-0.5 text-[12px] font-extrabold';
export const NOTA = 'flex items-start gap-2 rounded-xl bg-[#F6F8FB] px-3.5 py-3 text-[14px] leading-snug text-[#313C55] dark:bg-[#1C2334] dark:text-[#DDE3EE]';
export const ERRO = 'rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]';
export const S_OK = 'bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]';
export const S_AB = 'bg-[#E9EFF6] text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]';
export const S_MUDO = 'bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]';
export const S_AVISO = 'bg-[#FCF3CC] text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]';
export const S_RUIM = 'bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]';
export const SUB = 'text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]';
export const PILULA = (on: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center justify-center rounded-full px-4 text-[14px] font-extrabold leading-none ${
        on ? 'bg-[#313C55] text-white dark:bg-[#F2CB3F] dark:text-[#313C55]' : 'border border-[#C9D1DE] bg-white text-[#5B6478] dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-[#AEB9CF]'
    }`;

/* ============================== peças ============================== */

export function NoCorpo({ children }: { children: React.ReactNode }) {
    const [ok, setOk] = useState(false);
    useEffect(() => {
        setOk(true);
    }, []);
    return ok ? createPortal(children, document.body) : null;
}

export function Janela({
    titulo,
    sub,
    onFechar,
    rodape,
    children,
    largura = 'max-w-2xl',
}: {
    titulo: string;
    sub?: React.ReactNode;
    onFechar: () => void;
    rodape?: React.ReactNode;
    children: React.ReactNode;
    largura?: string;
}) {
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
                    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">{children}</div>
                    {rodape ? (
                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E3E8F0] bg-[#F6F8FB] px-5 py-3 dark:border-white/[0.08] dark:bg-[#1C2334] [&>*]:flex-1 lg:[&>*]:flex-none">
                            {rodape}
                        </div>
                    ) : null}
                </div>
            </div>
        </NoCorpo>
    );
}

/** Aviso que some sozinho no rodapé da tela. */
export function useAviso() {
    const [msg, setMsg] = useState<string | null>(null);
    useEffect(() => {
        if (!msg) return;
        const t = setTimeout(() => setMsg(null), 4000);
        return () => clearTimeout(t);
    }, [msg]);
    const el = msg ? (
        <NoCorpo>
            <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[80] w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl bg-[#313C55] px-4 py-3 text-[14.5px] font-bold text-white shadow-xl lg:bottom-8">
                {msg}
            </div>
        </NoCorpo>
    ) : null;
    return { avisar: setMsg, aviso: el };
}

/** Botão que abre o seletor de arquivo (PDF ou foto). */
export function BotaoArquivo({ rotulo, onArquivo, classe = BTN_PEQ, icone }: { rotulo: string; onArquivo: (f: File) => void; classe?: string; icone?: React.ReactNode }) {
    const ref = React.useRef<HTMLInputElement>(null);
    return (
        <>
            <button type="button" className={classe} onClick={() => ref.current?.click()}>
                {icone}
                {rotulo}
            </button>
            <input
                ref={ref}
                type="file"
                accept="application/pdf,image/*"
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

/* ============================== cadastros ============================== */

export type Classe = 'RECEITA' | 'DEDUCAO' | 'CUSTO_VARIAVEL' | 'CUSTO_FIXO' | 'DESPESA' | 'NAO_OPERACIONAL';
export type Natureza = { id: number; codigo: string; pai_codigo: string | null; nome: string; grupo: boolean; classe: Classe | null; pendencia: boolean; codigo_unymos: string | null; ativo: boolean };
export type Conta = {
    id: number;
    nome: string;
    tipo: 'BANCO' | 'APLICACAO' | 'CAIXA' | 'CARTAO' | 'LINK' | 'BONIFICACAO';
    banco: string | null;
    agencia: string | null;
    numero: string | null;
    responsavel_id: number | null;
    responsavel: string | null;
    saldo_inicial: number | null;
    saldo_inicial_em: string | null;
    cartao_fechamento: number | null;
    cartao_vencimento: number | null;
    cartao_limite: number | null;
    cartao_conta_pagamento_id: number | null;
    portadores: number[];
    ativo: boolean;
};
export type Area = { id: number; nome: string; ativo: boolean; linhas: { id: number; nome: string; ativo: boolean }[] };
export type Veiculo = { id: number; marca: string | null; modelo: string; ano: number | null; placa: string; renavam: string | null; uso: string | null; ativo: boolean; apelido: string; incompleto: boolean };
export type Forma = { id: number; codigo: string; nome: string; exige_comprovante: boolean; ativo: boolean };
export type Pessoa = {
    id: number;
    nome: string;
    tipo_doc: 'CPF' | 'CNPJ' | null;
    documento: string | null;
    cliente: boolean;
    fornecedor: boolean;
    natureza_padrao_id: number | null;
    telefone: string | null;
    email: string | null;
    pix_tipo: string | null;
    pix_chave: string | null;
    ativo: boolean;
    titulos: number;
};
export type Instalacao = {
    id: number;
    local_id: number;
    local: string;
    pessoa_id: number;
    pessoa: string;
    numero: string;
    natureza_id: number;
    natureza: string;
    area_id: number | null;
    dia_vencimento: number | null;
    ativo: boolean;
    ultimo: number | null;
    ultimo_venc: string | null;
    media: number | null;
    variacao: number | null;
};
export type Ponto = { id: number; nome: string; cidade: string; responsavel: string; usuario_id: number | null; conta_id: number | null; comissao_tipo: 'FIXO' | 'PCT' | null; comissao_valor: number | null; ativo: boolean };
export type LinhaRateio = { natureza_id: number; local_id: number | null; area_id: number | null; veiculo_id: number | null; valor: number };
export type Recorrente = {
    id: number;
    pessoa_id: number;
    pessoa: string;
    descricao: string;
    valor: number;
    valor_tipo: 'FIXO' | 'MEDIA';
    dia_vencimento: number;
    forma_id: number | null;
    instalacao_id: number | null;
    rateio: LinhaRateio[];
    situacao: 'ATIVA' | 'PAUSADA' | 'ENCERRADA';
    inicio: string;
    fim: string | null;
};
export type Cadastros = {
    naturezas: Natureza[];
    contas: Conta[];
    locais: { id: number; nome: string; ativo: boolean }[];
    areas: Area[];
    veiculos: Veiculo[];
    formas: Forma[];
    pessoas: Pessoa[];
    instalacoes: Instalacao[];
    pontos: Ponto[];
    recorrentes: Recorrente[];
    usuarios: { id: number; nome: string }[];
    meses: { competencia: string; fechado: boolean; fechado_em: string | null }[];
};

export const CLASSE: Record<Classe, { nome: string; cls: string }> = {
    RECEITA: { nome: 'Receita', cls: S_OK },
    DEDUCAO: { nome: 'Dedução', cls: S_OK },
    CUSTO_VARIAVEL: { nome: 'Custo variável', cls: S_AVISO },
    CUSTO_FIXO: { nome: 'Custo fixo', cls: S_AB },
    DESPESA: { nome: 'Despesa', cls: S_MUDO },
    NAO_OPERACIONAL: { nome: 'Não operacional', cls: S_MUDO },
};

export function useCadastros() {
    const [cad, setCad] = useState<Cadastros | null>(null);
    const [erroCad, setErroCad] = useState<string | null>(null);
    const recarregar = useCallback(async () => {
        try {
            const j = await api(URL_BASE, 'cadastros');
            setCad(j.dados);
            setErroCad(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar os cadastros do financeiro.');
            if (m) setErroCad(m);
        }
    }, []);
    useEffect(() => {
        void recarregar();
    }, [recarregar]);
    return { cad, erroCad, recarregar };
}

/** Opções de área para o rateio: a área (geral) e cada linha dela. */
export function opcoesArea(cad: Cadastros) {
    const out: { id: number; nome: string }[] = [];
    cad.areas.filter((a) => a.ativo).forEach((a) => {
        out.push({ id: a.id, nome: a.linhas.length ? `${a.nome} (geral)` : a.nome });
        a.linhas.filter((l) => l.ativo).forEach((l) => out.push({ id: l.id, nome: `${a.nome} · ${l.nome}` }));
    });
    return out;
}

/** Naturezas de saída (custos, despesas, deduções e saídas não operacionais) agrupadas pelo grupo de 2º nível. */
export function gruposNatureza(cad: Cadastros, tipo: 'saida' | 'todas' = 'saida') {
    const grupos = cad.naturezas.filter((n) => n.grupo && n.pai_codigo !== null);
    return grupos
        .map((g) => ({
            g,
            itens: cad.naturezas.filter((n) => !n.grupo && n.ativo && n.pai_codigo === g.codigo && (tipo === 'todas' || (n.classe !== 'RECEITA' && !n.codigo.startsWith('4.')))),
        }))
        .filter((x) => x.itens.length);
}

export function SelectNatureza({ cad, value, onChange, classe = CAMPO_P, tipo = 'saida' }: { cad: Cadastros; value: number | null; onChange: (id: number | null) => void; classe?: string; tipo?: 'saida' | 'todas' }) {
    return (
        <select className={classe} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} aria-label="Natureza">
            <option value="">Natureza</option>
            {gruposNatureza(cad, tipo).map(({ g, itens }) => (
                <optgroup key={g.codigo} label={`${g.codigo} ${g.nome}`}>
                    {itens.map((n) => (
                        <option key={n.id} value={n.id}>
                            {n.codigo} {n.nome}
                        </option>
                    ))}
                </optgroup>
            ))}
        </select>
    );
}

export type LinhaEdicao = { natureza_id: number | null; local_id: number | null; area_id: number | null; veiculo_id: number | null; valor: string };
export const linhaVazia = (): LinhaEdicao => ({ natureza_id: null, local_id: null, area_id: null, veiculo_id: null, valor: '' });

/** Editor do rateio: natureza, local, área · linha, veículo e valor; mostra quanto falta distribuir. */
export function EditorRateio({ cad, linhas, setLinhas, total }: { cad: Cadastros; linhas: LinhaEdicao[]; setLinhas: (l: LinhaEdicao[]) => void; total: number | null }) {
    const areas = opcoesArea(cad);
    const soma = linhas.reduce((s, l) => s + (paraNumero(l.valor) || 0), 0);
    const dif = Math.round(((total || 0) - soma) * 100) / 100;
    const up = (i: number, p: Partial<LinhaEdicao>) => setLinhas(linhas.map((l, j) => (j === i ? { ...l, ...p } : l)));
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <span className="text-[15px] font-extrabold">Rateio</span>
                <span className={SUB}>natureza, local, área e veículo</span>
                <button
                    type="button"
                    className={`${BTN_PEQ} ml-auto`}
                    onClick={() => setLinhas([...linhas, { ...linhaVazia(), valor: dif > 0 ? numCampo(dif) : '' }])}
                >
                    <IconPlus size={16} /> Linha
                </button>
            </div>
            {linhas.map((l, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-[#E3E8F0] p-2.5 dark:border-white/[0.1] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,1.3fr)_minmax(0,.8fr)_120px_44px] lg:border-0 lg:p-0">
                    <div className="col-span-2 lg:col-span-1">
                        <SelectNatureza cad={cad} value={l.natureza_id} onChange={(v) => up(i, { natureza_id: v })} />
                    </div>
                    <select className={CAMPO_P} value={l.local_id ?? ''} onChange={(e) => up(i, { local_id: e.target.value ? Number(e.target.value) : null })} aria-label="Local">
                        <option value="">Local —</option>
                        {cad.locais.filter((x) => x.ativo).map((x) => (
                            <option key={x.id} value={x.id}>
                                {x.nome}
                            </option>
                        ))}
                    </select>
                    <select className={CAMPO_P} value={l.area_id ?? ''} onChange={(e) => up(i, { area_id: e.target.value ? Number(e.target.value) : null })} aria-label="Área e linha">
                        <option value="">Área</option>
                        {areas.map((x) => (
                            <option key={x.id} value={x.id}>
                                {x.nome}
                            </option>
                        ))}
                    </select>
                    <select className={CAMPO_P} value={l.veiculo_id ?? ''} onChange={(e) => up(i, { veiculo_id: e.target.value ? Number(e.target.value) : null })} aria-label="Veículo">
                        <option value="">Veículo —</option>
                        {cad.veiculos.filter((x) => x.ativo).map((x) => (
                            <option key={x.id} value={x.id}>
                                {x.apelido}
                            </option>
                        ))}
                    </select>
                    <input className={`${CAMPO_P} text-right`} inputMode="decimal" placeholder="0,00" value={l.valor} onChange={(e) => up(i, { valor: e.target.value })} aria-label="Valor da linha" />
                    <button
                        type="button"
                        aria-label="Tirar linha"
                        className="grid size-11 place-items-center rounded-xl bg-[#F1F4F8] text-[#5B6478] hover:text-[#B42318] dark:bg-white/[0.08] dark:text-[#AEB9CF]"
                        onClick={() => setLinhas(linhas.length > 1 ? linhas.filter((_, j) => j !== i) : [linhaVazia()])}
                    >
                        <IconX size={18} />
                    </button>
                </div>
            ))}
            <div className={`${NOTA} ${!total ? '' : Math.abs(dif) < 0.01 ? S_OK : S_AVISO}`}>
                {!total ? 'Informe o valor total para conferir o rateio.' : Math.abs(dif) < 0.01 ? `Rateio confere: ${brl(soma)}.` : dif > 0 ? `Falta distribuir ${brl(dif)}.` : `O rateio passou ${brl(-dif)} do valor total.`}
            </div>
        </div>
    );
}

/** Converte as linhas do editor para o PHP; devolve mensagem se faltar algo. */
export function rateioParaEnvio(linhas: LinhaEdicao[]): { ok: true; linhas: LinhaRateio[] } | { ok: false; msg: string } {
    const out: LinhaRateio[] = [];
    for (const l of linhas) {
        if (!l.natureza_id) return { ok: false, msg: 'Toda linha do rateio precisa de natureza.' };
        if (!l.area_id) return { ok: false, msg: 'Toda linha do rateio precisa da área de negócio.' };
        const v = paraNumero(l.valor);
        if (!v || Number.isNaN(v) || v <= 0) return { ok: false, msg: 'Toda linha do rateio precisa de valor.' };
        out.push({ natureza_id: l.natureza_id, local_id: l.local_id, area_id: l.area_id, veiculo_id: l.veiculo_id, valor: v });
    }
    return { ok: true, linhas: out };
}
