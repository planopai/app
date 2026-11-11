'use client';

/**
 * Regras de pagamento (/folha-regras) — Gestão · Folha de pagamento — 06/11/2026.
 *
 * Cada acordo fica cadastrado uma vez, com data de início; a folha do mês calcula sozinha.
 * - Um colaborador pode ter várias regras (tipos diferentes): ex. Breno tem Extra + Comissão de agente + Comissão sobre vendas.
 * - Mudou o acordo → versão nova "a partir de"; a anterior fica no histórico e as folhas fechadas não mudam.
 * - Justificativas do Ajuste manual (acréscimo ou débito, com a natureza da DRE).
 * - Configurações gerais: faixas da comissão dos agentes e regras dos vales.
 * Back-end: rh_regras.php (novo). Só a Gestão acessa (o PHP confere).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlertTriangle, IconHistory, IconPlus, IconRefresh, IconSearch, IconSettingsDollar, IconTrash, IconX } from '@tabler/icons-react';

/* ============================== tipos ============================== */

type Params = Record<string, any>;
type Regra = {
    id: number;
    colaborador_id: number;
    tipo: string;
    situacao: 'ATIVA' | 'ENCERRADA';
    nome: string;
    nome_sistema: string;
    funcao: string | null;
    departamento: string | null;
    situacao_colaborador: string | null;
    versao_id: number;
    versao: number;
    vale_de: string;
    vale_ate: string | null;
    parametros: Params;
    observacao: string | null;
};
type Versao = { id: number; versao: number; vale_de: string; vale_ate: string | null; parametros: Params; observacao: string | null; criado_em: string; criado_por_nome: string; usada: number };
type Colab = { id: number; nome: string; nome_sistema: string; funcao: string | null; departamento: string | null; situacao: string | null; codigo_dominio: string | null };
type Justificativa = { id: number; nome: string; tipo: 'ACRESCIMO' | 'DEBITO'; natureza: string; ativo: number };
type Config = Record<string, { versao: number; vale_de: string; valor: any }>;

const API_URL = 'https://api.planoassistencialintegrado.com.br/rh_regras.php';

/* ============================== API ============================== */

class SessaoExpirada extends Error {}

async function api(acao: string, corpo?: Record<string, unknown>, extra = '') {
    const r = await fetch(`${API_URL}?action=${acao}${extra}${corpo ? '' : `&_=${Date.now()}`}`, {
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

const semAcento = (s: string) =>
    String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dataBR = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const mesBR = (iso?: string | null) => {
    if (!iso || !/^\d{4}-\d{2}/.test(iso)) return '';
    const [a, m] = iso.split('-');
    return `${MESES[Number(m) - 1]} de ${a}`;
};
const mesAtual = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const mesSeguinte = (ym: string) => {
    const [a, m] = ym.split('-').map(Number);
    return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
};
const brl = (v?: number | string | null) =>
    v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numBR = (v?: number | string | null, casas = 2) =>
    v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
/** "1.234,56", "R$ 80", "0,5%" → número; vazio → null. */
function paraNumero(s: string): number | null {
    let t = String(s ?? '').replace(/R\$|%|\s/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
}

/* ============================== tipos de regra ============================== */

type Opcao = [string, string];
type CampoDef = {
    k: string;
    rotulo: string | ((p: Params) => string);
    tipo: 'opcoes' | 'valor' | 'pct' | 'int' | 'txt' | ((p: Params) => 'valor' | 'pct');
    opcoes?: Opcao[];
    ajuda?: string;
    mostrar?: (p: Params) => boolean;
    largo?: boolean;
};
const PAGAMENTO: Opcao[] = [
    ['SALARIO', 'Com o salário, até o 5º dia útil'],
    ['A_PARTE', 'Pagamento à parte (a Gestão libera)'],
];
const ehViagem = (p: Params) => p.origem === 'VIAGEM_OUTRO_MUNICIPIO';

const TIPOS: Record<string, { nome: string; desc: string; selo: string; campos: CampoDef[]; nota?: (p: Params) => string | null; padrao: Params }> = {
    EXTRA: {
        nome: 'Extra',
        desc: 'Completa o líquido até um valor combinado',
        selo: 'bg-[#FCF3CC] text-[#7A5D00] dark:bg-[#F2CB3F]/15 dark:text-[#F2CB3F]',
        padrao: { ferias: 'MANTEM', decimo: 'PAGA' },
        campos: [
            { k: 'valor', rotulo: 'Valor total combinado no mês', tipo: 'valor' },
            {
                k: 'completa_sobre',
                rotulo: 'Completa sobre',
                tipo: 'opcoes',
                largo: true,
                opcoes: [
                    ['LIQUIDO', 'Líquido do contracheque'],
                    ['LIQUIDO_MAIS_CONSIGNADO', 'Líquido + consignado'],
                    ['BRUTO', 'Salário bruto'],
                ],
                ajuda: 'Líquido + consignado: o desconto do Crédito do Trabalhador continua sendo da pessoa (caso do Tharles).',
            },
            { k: 'ferias', rotulo: 'Complemento nas férias', tipo: 'opcoes', opcoes: [['MANTEM', 'Paga o complemento'], ['NAO_PAGA', 'Não paga']], ajuda: 'Proporcional aos dias de férias (e dias vendidos), com o 1/3. No mês das férias o extra da folha mensal fica proporcional aos dias trabalhados.' },
            { k: 'decimo', rotulo: 'Complemento no 13º', tipo: 'opcoes', opcoes: [['PAGA', 'Paga o complemento'], ['NAO_PAGA', 'Não paga']], ajuda: 'Proporcional aos meses (avos) do 13º do Domínio: metade na 1ª parcela e o restante na 2ª.' },
            {
                k: 'afastamento',
                rotulo: 'Atestado ou afastamento',
                tipo: 'opcoes',
                largo: true,
                opcoes: [
                    ['PROPORCIONAL', 'Proporcional aos dias trabalhados'],
                    ['NAO_PAGA', 'Não paga'],
                    ['CHEIO', 'Paga cheio'],
                ],
            },
            { k: 'admissao_saida', rotulo: 'Admissão ou desligamento no mês', tipo: 'opcoes', opcoes: [['PROPORCIONAL', 'Proporcional aos dias'], ['CHEIO', 'Cheio']] },
        ],
    },
    QUANTIDADE: {
        nome: 'Por quantidade',
        desc: 'Tanatopraxia, coroas naturais, viagens, plantões, remoções',
        selo: 'bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]',
        padrao: { pagamento: 'SALARIO', os_cancelada: 'NAO_CONTA' },
        campos: [
            {
                k: 'origem',
                rotulo: 'O que conta',
                tipo: 'opcoes',
                largo: true,
                opcoes: [
                    ['CONSERVACAO_OS', 'Tanatopraxia nas OS'],
                    ['COROA_NATURAL_PRONTA', 'Coroas naturais prontas'],
                    ['VIAGEM_OUTRO_MUNICIPIO', 'Viagens a outros municípios'],
                    ['PLANTAO', 'Plantões da escala'],
                    ['REMOCAO_OS', 'Remoções nas OS'],
                    ['MANUAL', 'Lançamento manual'],
                ],
            },
            { k: 'valor_unidade', rotulo: 'Valor por unidade', tipo: 'valor', mostrar: (p) => !!p.origem && !ehViagem(p) },
            { k: 'teto', rotulo: 'Teto no mês (opcional)', tipo: 'valor', mostrar: (p) => !!p.origem && !ehViagem(p) },
            { k: 'os_cancelada', rotulo: 'OS cancelada ou refeita', tipo: 'opcoes', opcoes: [['NAO_CONTA', 'Não conta'], ['CONTA', 'Conta']], mostrar: (p) => p.origem === 'CONSERVACAO_OS' || p.origem === 'REMOCAO_OS' },
            { k: 'forma', rotulo: 'Forma de cálculo', tipo: 'opcoes', opcoes: [['VALOR_FIXO', 'Valor fixo por viagem'], ['PERCENTUAL_TRANSLADO', '% sobre o translado da OS']], mostrar: ehViagem },
            {
                k: 'valor',
                rotulo: (p) => (p.forma === 'PERCENTUAL_TRANSLADO' ? 'Percentual sobre o translado' : 'Valor por viagem'),
                tipo: (p) => (p.forma === 'PERCENTUAL_TRANSLADO' ? 'pct' : 'valor'),
                mostrar: (p) => ehViagem(p) && !!p.forma,
            },
            { k: 'viagens', rotulo: 'Quais viagens contam', tipo: 'opcoes', opcoes: [['TODAS_FORA_DE_BARREIRAS', 'Toda viagem para fora de Barreiras'], ['DISTANCIA_MINIMA', 'A partir de uma distância']], mostrar: ehViagem },
            { k: 'distancia_minima_km', rotulo: 'Distância mínima (km)', tipo: 'int', mostrar: (p) => ehViagem(p) && p.viagens === 'DISTANCIA_MINIMA' },
            { k: 'quem_recebe', rotulo: 'Quem recebe na OS', tipo: 'opcoes', opcoes: [['MOTORISTA', 'Motorista do transporte'], ['RESPONSAVEL_TRANSLADO', 'Responsável pelo translado']], mostrar: ehViagem },
            { k: 'pagamento', rotulo: 'Quando paga', tipo: 'opcoes', opcoes: PAGAMENTO, largo: true },
        ],
        nota: (p) =>
            ehViagem(p) && (!p.forma || p.valor === '' || p.valor == null)
                ? 'Forma ou valor ainda a confirmar: pode salvar assim. Enquanto estiver vazio, a folha avisa e não calcula as viagens.'
                : p.origem === 'CONSERVACAO_OS'
                  ? 'Conta as OS do mês em que ele está registrado como técnico da tanatopraxia.'
                  : p.origem === 'COROA_NATURAL_PRONTA'
                    ? 'Conta as coroas naturais em que ele deu o comando "Coroa Pronta" na lista de produção, no mês (pedidos cancelados não contam).'
                    : null,
    },
    COMISSAO_FATURAMENTO: {
        nome: 'Comissão de agente',
        desc: 'Faixa do faturamento × nota da avaliação',
        selo: 'bg-[#E9EFF6] text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]',
        padrao: { pagamento: 'A_PARTE' },
        campos: [{ k: 'pagamento', rotulo: 'Quando paga', tipo: 'opcoes', opcoes: PAGAMENTO, largo: true }],
        nota: () => 'Base: OS particulares do mês menos translado. As faixas, a nota mínima e o corte por ocorrência ficam em Configurações gerais e valem para todos os agentes.',
    },
    COMISSAO_VENDAS: {
        nome: 'Comissão sobre vendas',
        desc: 'Percentual sobre as vendas da própria pessoa',
        selo: 'bg-[#E9EFF6] text-[#2E5277] dark:bg-[#3D6A99]/25 dark:text-[#C9D8EA]',
        padrao: { pagamento: 'A_PARTE', forma: 'PERCENTUAL' },
        campos: [
            {
                k: 'sobre',
                rotulo: 'Sobre o quê',
                tipo: 'opcoes',
                largo: true,
                opcoes: [
                    ['OS_PARTICULARES_DO_VENDEDOR', 'OS particulares vendidas por ele'],
                    ['ADESOES', 'Adesões de plano'],
                    ['COROAS', 'Coroas e homenagens'],
                ],
            },
            { k: 'forma', rotulo: 'Forma', tipo: 'opcoes', opcoes: [['PERCENTUAL', '% do valor'], ['VALOR_FIXO', 'Valor fixo por venda']] },
            { k: 'percentual', rotulo: 'Percentual', tipo: 'pct', mostrar: (p) => p.forma !== 'VALOR_FIXO' },
            { k: 'valor', rotulo: 'Valor por venda', tipo: 'valor', mostrar: (p) => p.forma === 'VALOR_FIXO' },
            { k: 'quando_conta', rotulo: 'Quando a venda conta', tipo: 'opcoes', opcoes: [['PAGA', 'Adesão paga'], ['TERCEIRA_MENSALIDADE', 'Depois da 3ª mensalidade paga']], mostrar: (p) => p.sobre === 'ADESOES' },
            { k: 'estorno_90_dias', rotulo: 'Se cancelar em até 90 dias', tipo: 'opcoes', opcoes: [['ESTORNA', 'Estorna na próxima comissão'], ['NAO_ESTORNA', 'Não estorna']], mostrar: (p) => p.sobre === 'ADESOES' },
            { k: 'pagamento', rotulo: 'Quando paga', tipo: 'opcoes', opcoes: PAGAMENTO, largo: true },
        ],
        nota: (p) => ((p.forma !== 'VALOR_FIXO' ? p.percentual : p.valor) === '' || (p.forma !== 'VALOR_FIXO' ? p.percentual : p.valor) == null ? 'Percentual ainda a confirmar: pode salvar assim. Enquanto estiver vazio, a comissão avisa e não calcula.' : null),
    },
    BONUS_FIXO: {
        nome: 'Bônus fixo',
        desc: 'Mesmo valor todo mês',
        selo: 'bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]',
        padrao: { pagamento: 'SALARIO', condicao: 'NENHUMA' },
        campos: [
            { k: 'valor', rotulo: 'Valor no mês', tipo: 'valor' },
            { k: 'condicao', rotulo: 'Condição', tipo: 'opcoes', largo: true, opcoes: [['NENHUMA', 'Nenhuma'], ['SEM_FALTA', 'Sem falta no mês'], ['NOTA_MINIMA', 'Nota mínima na avaliação']] },
            { k: 'pagamento', rotulo: 'Quando paga', tipo: 'opcoes', opcoes: PAGAMENTO, largo: true },
        ],
        nota: () => 'Bônus que muda a cada mês não precisa de regra: é lançado direto na folha do mês, com motivo.',
    },
    DESCONTO_RECORRENTE: {
        nome: 'Desconto recorrente',
        desc: 'Uniforme, convênio, outros',
        selo: 'bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]',
        padrao: { ate: 'SEM_FIM', sem_saldo: 'LEVA_PARA_MES_SEGUINTE' },
        campos: [
            { k: 'motivo', rotulo: 'Motivo', tipo: 'txt' },
            { k: 'valor', rotulo: 'Valor por mês', tipo: 'valor' },
            { k: 'ate', rotulo: 'Até quando', tipo: 'opcoes', largo: true, opcoes: [['SEM_FIM', 'Sem fim'], ['MESES', 'Número de meses'], ['TOTAL', 'Até quitar um total']] },
            { k: 'meses', rotulo: 'Número de meses', tipo: 'int', mostrar: (p) => p.ate === 'MESES' },
            { k: 'total', rotulo: 'Total a descontar', tipo: 'valor', mostrar: (p) => p.ate === 'TOTAL' },
            { k: 'sem_saldo', rotulo: 'Se o valor a receber não cobrir', tipo: 'opcoes', largo: true, opcoes: [['LEVA_PARA_MES_SEGUINTE', 'Leva o resto para o mês seguinte'], ['NAO_DESCONTA', 'Avisa e não desconta']] },
        ],
        nota: () => 'Desconto só com documento assinado pelo colaborador.',
    },
};
const ORDEM_TIPOS = ['EXTRA', 'QUANTIDADE', 'COMISSAO_FATURAMENTO', 'COMISSAO_VENDAS', 'BONUS_FIXO', 'DESCONTO_RECORRENTE'];
const ROT_ORIGEM: Record<string, string> = { CONSERVACAO_OS: 'tanatopraxia', COROA_NATURAL_PRONTA: 'coroa natural', VIAGEM_OUTRO_MUNICIPIO: 'viagem', PLANTAO: 'plantão', REMOCAO_OS: 'remoção', MANUAL: 'unidade' };

function campoTipo(c: CampoDef, p: Params) {
    return typeof c.tipo === 'function' ? c.tipo(p) : c.tipo;
}
function campoRotulo(c: CampoDef, p: Params) {
    return typeof c.rotulo === 'function' ? c.rotulo(p) : c.rotulo;
}

/** Regra com valor ainda a confirmar (Josimar, % do Breno). */
function aConfirmar(r: { tipo: string; parametros: Params }) {
    const p = r.parametros || {};
    if (r.tipo === 'QUANTIDADE' && ehViagem(p)) return !p.forma || p.valor == null;
    if (r.tipo === 'COMISSAO_VENDAS') return (p.forma === 'VALOR_FIXO' ? p.valor : p.percentual) == null;
    return false;
}

function resumo(r: { tipo: string; parametros: Params }): { valor: string; como: string } {
    const p = r.parametros || {};
    const pag = p.pagamento === 'A_PARTE' ? 'paga à parte' : 'paga com o salário';
    switch (r.tipo) {
        case 'EXTRA':
            return {
                valor: `${brl(p.valor)} no mês`,
                como: p.completa_sobre === 'LIQUIDO_MAIS_CONSIGNADO' ? 'Completa o líquido + consignado até o valor' : p.completa_sobre === 'BRUTO' ? 'Completa o salário bruto até o valor' : 'Completa o líquido do contracheque até o valor',
            };
        case 'QUANTIDADE':
            if (ehViagem(p))
                return {
                    valor: aConfirmar(r) ? 'A confirmar' : p.forma === 'PERCENTUAL_TRANSLADO' ? `${numBR(p.valor)}% do translado` : `${brl(p.valor)} por viagem`,
                    como: `Viagens a outros municípios · ${pag}`,
                };
            return { valor: `${brl(p.valor_unidade)} por ${ROT_ORIGEM[p.origem] || 'unidade'}`, como: `${TIPOS.QUANTIDADE.campos[0].opcoes!.find((o) => o[0] === p.origem)?.[1] || ''}${p.teto ? ` · teto ${brl(p.teto)}` : ''} · ${pag}` };
        case 'COMISSAO_FATURAMENTO':
            return { valor: 'Faixa × nota', como: `Particulares menos translado · ${pag}` };
        case 'COMISSAO_VENDAS':
            return { valor: aConfirmar(r) ? 'A confirmar' : p.forma === 'VALOR_FIXO' ? `${brl(p.valor)} por venda` : `${numBR(p.percentual)}% das vendas`, como: `Vendas próprias · ${pag}` };
        case 'BONUS_FIXO':
            return { valor: `${brl(p.valor)} no mês`, como: `${p.condicao === 'SEM_FALTA' ? 'Sem falta no mês · ' : p.condicao === 'NOTA_MINIMA' ? 'Com nota mínima · ' : ''}${pag}` };
        case 'DESCONTO_RECORRENTE':
            return { valor: `−${brl(p.valor)} por mês`, como: `${p.motivo || ''}${p.ate === 'MESES' ? ` · ${p.meses} meses` : p.ate === 'TOTAL' ? ` · até ${brl(p.total)}` : ''}` };
    }
    return { valor: '', como: '' };
}

/** Parâmetros do servidor (números) → textos do formulário. */
function paraForm(tipo: string, p: Params): Params {
    const out: Params = { ...TIPOS[tipo].padrao };
    for (const c of TIPOS[tipo].campos) {
        const v = p?.[c.k];
        if (v === null || v === undefined) continue;
        const t = campoTipo(c, { ...out, ...p });
        out[c.k] = t === 'valor' ? numBR(v, 2) : t === 'pct' ? numBR(v, 4) : t === 'int' ? String(v) : v;
    }
    return out;
}

/* ============================== estilos ============================== */

const CAMPO =
    'h-12 w-full rounded-xl border-0 bg-[#F1F4F8] px-3.5 text-[16px] text-[#313C55] outline-none placeholder:text-[#7A8396] focus:ring-2 focus:ring-[#3D6A99]/30 disabled:opacity-60 dark:bg-[#1C2334] dark:text-white';
const ROTULO = 'mb-1.5 block text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]';
const BTN_SEC =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#C9D1DE] bg-white px-3.5 text-[14px] font-extrabold text-[#313C55] transition hover:border-[#313C55] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.2] dark:bg-[#232B3F] dark:text-white';
const BTN_PRI =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#313C55] px-4 text-[14px] font-extrabold text-white transition hover:bg-[#232B40] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#F2CB3F] dark:text-[#313C55] dark:hover:bg-[#E4BC30]';
const BTN_PERIGO =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#F3C5C0] bg-white px-3.5 text-[14px] font-extrabold text-[#B42318] hover:border-[#B42318] disabled:opacity-50 dark:border-[#FF9C92]/40 dark:bg-transparent dark:text-[#FF9C92]';
const CARTAO = 'rounded-2xl border border-[#E3E8F0] bg-white shadow-sm dark:border-white/[0.12] dark:bg-[#232B3F]';
const SELO = 'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[12px] font-bold';
const NOTA = 'flex items-start gap-2 rounded-xl bg-[#F6F8FB] px-3.5 py-3 text-[14px] leading-snug text-[#313C55] dark:bg-[#1C2334] dark:text-[#DDE3EE]';

/* ============================== peças ============================== */

function NoCorpo({ children }: { children: React.ReactNode }) {
    const [ok, setOk] = useState(false);
    useEffect(() => {
        setOk(true);
    }, []);
    return ok ? createPortal(children, document.body) : null;
}

/** Janela: diálogo centralizado no computador, folha de baixo no celular, Esc fecha. */
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
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
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

function Opcoes({ rotulo, opcoes, valor, onChange, ajuda, className = '' }: { rotulo: string; opcoes: Opcao[]; valor: any; onChange: (v: string | null) => void; ajuda?: string; className?: string }) {
    return (
        <div className={className}>
            <span className={ROTULO}>{rotulo}</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label={rotulo}>
                {opcoes.map(([v, l]) => (
                    <button
                        key={v}
                        type="button"
                        aria-pressed={valor === v}
                        onClick={() => onChange(valor === v ? null : v)}
                        className={`inline-flex min-h-11 items-center rounded-xl border px-3.5 text-left text-[14px] font-bold leading-tight transition ${
                            valor === v
                                ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]'
                                : 'border-[#E3E8F0] bg-white text-[#313C55] hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#C8CFDC]'
                        }`}
                    >
                        {l}
                    </button>
                ))}
            </div>
            {ajuda ? <span className="mt-1 block text-[12.5px] leading-snug text-[#5B6478] dark:text-[#AEB9CF]">{ajuda}</span> : null}
        </div>
    );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={ativo}
            className={[
                'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 text-[14px] font-bold transition',
                ativo
                    ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]'
                    : 'border-[#E3E8F0] bg-white text-[#313C55] hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#C8CFDC]',
            ].join(' ')}
        >
            {children}
        </button>
    );
}

const SeloAConfirmar = () => (
    <span className={`${SELO} border border-[#E4BC30] text-[#7A5D00] dark:border-[#F2CB3F]/60 dark:text-[#F2CB3F]`}>
        <IconAlertTriangle size={13} /> A confirmar
    </span>
);

/* ============================== página ============================== */

type Aba = 'regras' | 'justificativas' | 'config';
type FormRegra = { id: number | null; colaborador_id: number | ''; tipo: string; vale_de: string; vale_ate: string; parametros: Params; observacao: string };

export default function RegrasPagamentoPage() {
    const [regras, setRegras] = useState<Regra[]>([]);
    const [colabs, setColabs] = useState<Colab[]>([]);
    const [justs, setJusts] = useState<Justificativa[]>([]);
    const [naturezas, setNaturezas] = useState<string[]>([]);
    const [config, setConfig] = useState<Config>({});
    const [carregando, setCarregando] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [aba, setAba] = useState<Aba>('regras');
    const [filtro, setFiltro] = useState<'ATIVA' | 'ENCERRADA' | 'todas'>('ATIVA');
    const [busca, setBusca] = useState('');

    // janela da regra
    const [form, setForm] = useState<FormRegra | null>(null);
    const [versoes, setVersoes] = useState<Versao[]>([]);
    const [verVersoes, setVerVersoes] = useState(false);
    const [encerrando, setEncerrando] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);

    // justificativa
    const [fj, setFj] = useState<{ id: number | null; nome: string; tipo: string; natureza: string; outra: boolean; ativo: number } | null>(null);

    // configurações
    const [cfgCom, setCfgCom] = useState<{ faixas: { ate: string; pct: string }[]; multiplica_nota: boolean; sem_avaliacao: string; ocorrencia: string; vale_de: string } | null>(null);
    const [cfgVal, setCfgVal] = useState<{ abater_em_padrao: string; limite_pct_liquido: string; acima_limite: string; vale_de: string } | null>(null);
    const [erroCfg, setErroCfg] = useState<string | null>(null);

    const irParaLogin = () => {
        window.location.href = '/login';
    };
    const tratarErro = (e: any, padrao: string, set: (m: string) => void) => {
        if (e instanceof SessaoExpirada) return irParaLogin();
        set(e?.message || padrao);
    };

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErroLista(null);
        try {
            const j = await api('painel');
            const d = j.dados || {};
            setRegras(Array.isArray(d.regras) ? d.regras : []);
            setColabs(Array.isArray(d.colaboradores) ? d.colaboradores : []);
            setJusts(Array.isArray(d.justificativas) ? d.justificativas : []);
            setNaturezas(Array.isArray(d.naturezas) ? d.naturezas : []);
            const cfg: Config = d.config || {};
            setConfig(cfg);
            const cf = cfg.comissao_faixas?.valor || {};
            setCfgCom({
                faixas: (Array.isArray(cf.faixas) ? cf.faixas : []).map((f: any) => ({ ate: f.ate == null ? '' : numBR(f.ate, 2), pct: numBR(f.pct, 4) })),
                multiplica_nota: cf.multiplica_nota !== false,
                sem_avaliacao: cf.sem_avaliacao || 'NAO_RECEBE',
                ocorrencia: cf.ocorrencia || 'CORTA',
                vale_de: mesSeguinte(mesAtual()),
            });
            const cv = cfg.vales?.valor || {};
            setCfgVal({
                abater_em_padrao: cv.abater_em_padrao || 'SALARIO',
                limite_pct_liquido: cv.limite_pct_liquido == null ? '' : numBR(cv.limite_pct_liquido, 2),
                acima_limite: cv.acima_limite || 'AVISA',
                vale_de: mesAtual(),
            });
        } catch (e: any) {
            tratarErro(e, 'Não foi possível carregar as regras.', setErroLista);
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    useEffect(() => {
        if (!aviso) return;
        const t = window.setTimeout(() => setAviso(null), 3500);
        return () => window.clearTimeout(t);
    }, [aviso]);

    /* ---- lista ---- */
    const filtradas = useMemo(() => {
        const q = semAcento(busca);
        return regras.filter((r) => {
            if (filtro !== 'todas' && r.situacao !== filtro) return false;
            if (q && !semAcento(`${r.nome} ${r.nome_sistema} ${TIPOS[r.tipo]?.nome || ''}`).includes(q)) return false;
            return true;
        });
    }, [regras, filtro, busca]);
    const porPessoa = useMemo(() => {
        const m = new Map<number, Regra[]>();
        for (const r of filtradas) m.set(r.colaborador_id, [...(m.get(r.colaborador_id) || []), r]);
        return [...m.values()].sort((a, b) => a[0].nome_sistema.localeCompare(b[0].nome_sistema, 'pt-BR'));
    }, [filtradas]);
    const contagem = useMemo(() => ({ ATIVA: regras.filter((r) => r.situacao === 'ATIVA').length, ENCERRADA: regras.filter((r) => r.situacao === 'ENCERRADA').length, todas: regras.length, confirmar: regras.filter((r) => r.situacao === 'ATIVA' && aConfirmar(r)).length }), [regras]);

    /* ---- regra ---- */
    const novaRegra = (colaborador_id: number | '' = '') => {
        setErroForm(null);
        setVersoes([]);
        setVerVersoes(false);
        setEncerrando(null);
        setForm({ id: null, colaborador_id, tipo: '', vale_de: mesAtual(), vale_ate: '', parametros: {}, observacao: '' });
    };
    const abrirRegra = async (r: Regra) => {
        setErroForm(null);
        setVerVersoes(false);
        setEncerrando(null);
        const ult = r.vale_de.slice(0, 7);
        setForm({ id: r.id, colaborador_id: r.colaborador_id, tipo: r.tipo, vale_de: ult >= mesAtual() ? ult : mesAtual(), vale_ate: r.vale_ate || '', parametros: paraForm(r.tipo, r.parametros), observacao: r.observacao || '' });
        setVersoes([]);
        try {
            const j = await api('regra', undefined, `&id=${r.id}`);
            setVersoes(Array.isArray(j.dados?.versoes) ? j.dados.versoes : []);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível carregar o histórico.', setErroForm);
        }
    };
    const fecharRegra = useCallback(() => setForm(null), []);
    const setParam = (k: string, v: any) => setForm((f) => (f ? { ...f, parametros: { ...f.parametros, [k]: v } } : f));

    const salvarRegra = async () => {
        if (!form) return;
        if (!form.colaborador_id) return setErroForm('Escolha o colaborador.');
        if (!form.tipo) return setErroForm('Escolha o tipo de regra.');
        if (!form.vale_de) return setErroForm('Informe a partir de quando a regra vale.');
        const def = TIPOS[form.tipo];
        const p: Params = {};
        for (const c of def.campos) {
            if (c.mostrar && !c.mostrar(form.parametros)) {
                p[c.k] = null;
                continue;
            }
            const t = campoTipo(c, form.parametros);
            const v = form.parametros[c.k];
            if (t === 'opcoes' || t === 'txt') p[c.k] = v === '' || v === undefined ? null : v;
            else {
                const n = paraNumero(v ?? '');
                if (Number.isNaN(n)) return setErroForm(`Confira o campo "${campoRotulo(c, form.parametros)}".`);
                p[c.k] = n;
            }
        }
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('regra_salvar', { id: form.id, colaborador_id: form.colaborador_id, tipo: form.tipo, vale_de: form.vale_de, vale_ate: form.vale_ate || null, parametros: p, observacao: form.observacao });
            setForm(null);
            setAviso(j.msg || 'Regra salva.');
            await carregar();
        } catch (e: any) {
            tratarErro(e, 'Não foi possível salvar a regra.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    const encerrarRegra = async () => {
        if (!form?.id || !encerrando) return;
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('regra_encerrar', { id: form.id, ate: encerrando });
            setForm(null);
            setAviso(j.msg || 'Regra encerrada.');
            await carregar();
        } catch (e: any) {
            tratarErro(e, 'Não foi possível encerrar a regra.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    /* ---- justificativas ---- */
    const fecharJust = useCallback(() => setFj(null), []);
    const salvarJust = async () => {
        if (!fj) return;
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('justificativa_salvar', { id: fj.id, nome: fj.nome, tipo: fj.tipo, natureza: fj.natureza, ativo: fj.ativo });
            setFj(null);
            setAviso(j.msg || 'Justificativa salva.');
            await carregar();
        } catch (e: any) {
            tratarErro(e, 'Não foi possível salvar a justificativa.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    /* ---- configurações ---- */
    const salvarCfgCom = async () => {
        if (!cfgCom) return;
        setErroCfg(null);
        const faixas = cfgCom.faixas.map((f, i) => ({ ate: i === cfgCom.faixas.length - 1 ? null : paraNumero(f.ate), pct: paraNumero(f.pct) }));
        if (faixas.some((f) => Number.isNaN(f.ate as number) || f.pct == null || Number.isNaN(f.pct))) return setErroCfg('Confira os valores das faixas.');
        setSalvando(true);
        try {
            const j = await api('config_salvar', { chave: 'comissao_faixas', vale_de: cfgCom.vale_de, valor: { faixas, multiplica_nota: cfgCom.multiplica_nota, sem_avaliacao: cfgCom.sem_avaliacao, ocorrencia: cfgCom.ocorrencia } });
            setAviso(j.msg || 'Configuração salva.');
            await carregar();
        } catch (e: any) {
            tratarErro(e, 'Não foi possível salvar.', setErroCfg);
        } finally {
            setSalvando(false);
        }
    };
    const salvarCfgVal = async () => {
        if (!cfgVal) return;
        setErroCfg(null);
        const lim = paraNumero(cfgVal.limite_pct_liquido);
        if (Number.isNaN(lim as number)) return setErroCfg('Confira o limite dos vales.');
        setSalvando(true);
        try {
            const j = await api('config_salvar', { chave: 'vales', vale_de: cfgVal.vale_de, valor: { abater_em_padrao: cfgVal.abater_em_padrao, limite_pct_liquido: lim, acima_limite: cfgVal.acima_limite } });
            setAviso(j.msg || 'Configuração salva.');
            await carregar();
        } catch (e: any) {
            tratarErro(e, 'Não foi possível salvar.', setErroCfg);
        } finally {
            setSalvando(false);
        }
    };

    const colabDoForm = form && form.colaborador_id ? colabs.find((c) => c.id === form.colaborador_id) : null;
    const regrasDaPessoa = form && form.colaborador_id ? regras.filter((r) => r.colaborador_id === form.colaborador_id && r.situacao === 'ATIVA' && r.id !== form.id) : [];
    const versaoAtual = versoes[0];
    const corrige = !!(form?.id && versaoAtual && versaoAtual.vale_de.slice(0, 7) === form.vale_de && !versaoAtual.usada);

    /* ============================== render ============================== */

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
                <header className="mb-4 flex flex-wrap items-center gap-3">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/25 dark:text-white">
                        <IconSettingsDollar size={26} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">Gestão · Folha de pagamento</div>
                        <h1 className="text-[24px] font-extrabold leading-tight lg:text-[28px]">Regras de pagamento</h1>
                    </div>
                    <button type="button" onClick={() => void carregar()} className={BTN_SEC} aria-label="Atualizar">
                        <IconRefresh size={18} />
                    </button>
                    {aba === 'regras' ? (
                        <button type="button" onClick={() => novaRegra()} className={BTN_PRI}>
                            <IconPlus size={18} /> Nova regra
                        </button>
                    ) : aba === 'justificativas' ? (
                        <button type="button" onClick={() => { setErroForm(null); setFj({ id: null, nome: '', tipo: '', natureza: '', outra: false, ativo: 1 }); }} className={BTN_PRI}>
                            <IconPlus size={18} /> Nova justificativa
                        </button>
                    ) : null}
                </header>

                <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-[#E3E8F0] [scrollbar-width:none] dark:border-white/[0.08]">
                    {(
                        [
                            ['regras', 'Regras'],
                            ['justificativas', 'Justificativas do ajuste manual'],
                            ['config', 'Configurações gerais'],
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

                {aviso ? <div className="mb-3 rounded-xl bg-[#EEF5D6] px-4 py-3 text-[14px] font-bold text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]">{aviso}</div> : null}
                {erroLista ? (
                    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">
                        <span className="flex-1">{erroLista}</span>
                        <button type="button" className={BTN_SEC} onClick={() => void carregar()}>
                            Tentar de novo
                        </button>
                    </div>
                ) : null}

                {/* ============================== Regras ============================== */}
                {aba === 'regras' ? (
                    <>
                        <div className={`${NOTA} mb-4`}>
                            <span>
                                Cada acordo fica cadastrado uma vez, com data de início, e a folha do mês calcula sozinha. Salário, extra, bônus e tanatopraxia saem juntos até o 5º dia útil; a comissão dos agentes é paga à parte. Mudou o acordo: abra a regra e salve com a data nova. A versão anterior fica no histórico e as folhas fechadas não mudam.
                            </span>
                        </div>
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <Chip ativo={filtro === 'ATIVA'} onClick={() => setFiltro('ATIVA')}>
                                Ativas · {contagem.ATIVA}
                            </Chip>
                            <Chip ativo={filtro === 'ENCERRADA'} onClick={() => setFiltro('ENCERRADA')}>
                                Encerradas · {contagem.ENCERRADA}
                            </Chip>
                            <Chip ativo={filtro === 'todas'} onClick={() => setFiltro('todas')}>
                                Todas · {contagem.todas}
                            </Chip>
                            {contagem.confirmar ? (
                                <span className={`${SELO} ml-1 border border-[#E4BC30] text-[#7A5D00] dark:border-[#F2CB3F]/60 dark:text-[#F2CB3F]`}>
                                    <IconAlertTriangle size={13} /> {contagem.confirmar} com valor a confirmar
                                </span>
                            ) : null}
                            <label className="relative ml-auto w-full sm:w-72">
                                <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8396]" />
                                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar colaborador ou tipo" aria-label="Buscar" className={`${CAMPO} pl-10`} />
                            </label>
                        </div>

                        {carregando ? (
                            <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478]`}>Carregando…</div>
                        ) : porPessoa.length === 0 ? (
                            <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]`}>Nenhuma regra {filtro === 'ENCERRADA' ? 'encerrada' : 'encontrada'}.</div>
                        ) : (
                            <div className={`${CARTAO} overflow-hidden`}>
                                <div className="hidden grid-cols-[minmax(0,1.2fr)_190px_200px_minmax(0,1.6fr)] gap-3 bg-[#F6F8FB] px-4 py-2.5 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF] lg:grid">
                                    <span>Colaborador</span>
                                    <span>Tipo</span>
                                    <span>Valor</span>
                                    <span>Como calcula</span>
                                </div>
                                {porPessoa.map((grupo) => (
                                    <div key={grupo[0].colaborador_id} className="border-t border-[#E3E8F0] first:border-t-0 dark:border-white/[0.08] lg:first:border-t">
                                        {grupo.map((r, i) => {
                                            const rs = resumo(r);
                                            return (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => void abrirRegra(r)}
                                                    className="grid w-full grid-cols-1 gap-1.5 px-4 py-3 text-left text-[14px] hover:bg-[#F6F8FB] dark:hover:bg-white/[0.04] lg:grid-cols-[minmax(0,1.2fr)_190px_200px_minmax(0,1.6fr)] lg:items-center lg:gap-3"
                                                >
                                                    <span className={`min-w-0 ${i > 0 ? 'hidden lg:block lg:invisible' : ''}`}>
                                                        <b className="block break-words">{r.nome_sistema}</b>
                                                        <span className="block text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">{[r.funcao, r.situacao_colaborador === 'DESLIGADO' ? 'desligado' : null].filter(Boolean).join(' · ')}</span>
                                                    </span>
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <span className={`${SELO} ${TIPOS[r.tipo]?.selo || ''}`}>{TIPOS[r.tipo]?.nome || r.tipo}</span>
                                                        {r.situacao === 'ENCERRADA' ? <span className={`${SELO} bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]`}>Encerrada</span> : null}
                                                    </span>
                                                    <span className="font-extrabold tabular-nums">{aConfirmar(r) ? <SeloAConfirmar /> : rs.valor}</span>
                                                    <span className="min-w-0 text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                        {rs.como}
                                                        <span className="block text-[12px]">
                                                            desde {mesBR(r.vale_de)}
                                                            {r.vale_ate ? ` · até ${dataBR(r.vale_ate)}` : ''}
                                                            {r.versao > 1 ? ` · versão ${r.versao}` : ''}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : null}

                {/* ============================== Justificativas ============================== */}
                {aba === 'justificativas' ? (
                    <>
                        <div className={`${NOTA} mb-4`}>
                            <span>Lista usada no Ajuste manual da folha. Cada justificativa diz se é acréscimo ou débito e em qual natureza da DRE o valor cai. Na folha também dá para criar uma nova na hora.</span>
                        </div>
                        <div className={`${CARTAO} overflow-hidden`}>
                            {justs.map((j) => (
                                <button
                                    key={j.id}
                                    type="button"
                                    onClick={() => {
                                        setErroForm(null);
                                        setFj({ id: j.id, nome: j.nome, tipo: j.tipo, natureza: j.natureza, outra: !naturezas.includes(j.natureza), ativo: j.ativo });
                                    }}
                                    className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E3E8F0] px-4 py-3 text-left text-[14px] first:border-t-0 hover:bg-[#F6F8FB] dark:border-white/[0.08] dark:hover:bg-white/[0.04] ${j.ativo ? '' : 'opacity-60'}`}
                                >
                                    <b className="min-w-0 flex-1 break-words">{j.nome}</b>
                                    <span className={`${SELO} ${j.tipo === 'ACRESCIMO' ? 'bg-[#EEF5D6] text-[#3F5A0A] dark:bg-[#B3CE52]/15 dark:text-[#CFE38A]' : 'bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]'}`}>
                                        {j.tipo === 'ACRESCIMO' ? 'Acréscimo' : 'Débito'}
                                    </span>
                                    <span className="w-full text-[13px] text-[#5B6478] dark:text-[#AEB9CF] sm:w-60">{j.natureza}</span>
                                    {!j.ativo ? <span className={`${SELO} bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]`}>Fora da lista</span> : null}
                                </button>
                            ))}
                            {!justs.length && !carregando ? <div className="p-6 text-center text-[14px] text-[#5B6478]">Nenhuma justificativa cadastrada.</div> : null}
                        </div>
                    </>
                ) : null}

                {/* ============================== Configurações ============================== */}
                {aba === 'config' && cfgCom && cfgVal ? (
                    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                        <section className={`${CARTAO} flex flex-col gap-4 p-5`}>
                            <div>
                                <h2 className="text-[18px] font-extrabold">Comissão dos agentes</h2>
                                <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                    Faturamento das OS particulares do mês menos translado. Em uso: versão {config.comissao_faixas?.versao ?? '–'}, desde {dataBR(config.comissao_faixas?.vale_de)}.
                                </p>
                            </div>
                            <div className="overflow-hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                <div className="grid grid-cols-[1fr_1fr_110px_44px] gap-2 bg-[#F6F8FB] px-3 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                    <span>De</span>
                                    <span>Até</span>
                                    <span>Percentual</span>
                                    <span />
                                </div>
                                {cfgCom.faixas.map((f, i) => {
                                    const ultima = i === cfgCom.faixas.length - 1;
                                    const de = i === 0 ? 'R$ 0,00' : `acima de ${brl(paraNumero(cfgCom.faixas[i - 1].ate) ?? 0)}`;
                                    return (
                                        <div key={i} className="grid grid-cols-[1fr_1fr_110px_44px] items-center gap-2 border-t border-[#E3E8F0] px-3 py-2 dark:border-white/[0.08]">
                                            <span className="text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">{de}</span>
                                            {ultima ? (
                                                <span className="text-[13.5px] font-bold">sem limite</span>
                                            ) : (
                                                <input
                                                    className={CAMPO}
                                                    inputMode="decimal"
                                                    aria-label={`Até, faixa ${i + 1}`}
                                                    value={f.ate}
                                                    onChange={(e) => setCfgCom({ ...cfgCom, faixas: cfgCom.faixas.map((x, k) => (k === i ? { ...x, ate: e.target.value } : x)) })}
                                                />
                                            )}
                                            <input
                                                className={CAMPO}
                                                inputMode="decimal"
                                                aria-label={`Percentual, faixa ${i + 1}`}
                                                value={f.pct}
                                                onChange={(e) => setCfgCom({ ...cfgCom, faixas: cfgCom.faixas.map((x, k) => (k === i ? { ...x, pct: e.target.value } : x)) })}
                                            />
                                            <button
                                                type="button"
                                                aria-label="Tirar faixa"
                                                disabled={cfgCom.faixas.length <= 1}
                                                onClick={() => setCfgCom({ ...cfgCom, faixas: cfgCom.faixas.filter((_, k) => k !== i) })}
                                                className="grid size-11 place-items-center rounded-xl text-[#5B6478] hover:bg-[#EEF2F7] disabled:opacity-30 dark:hover:bg-white/[0.08]"
                                            >
                                                <IconTrash size={18} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            <button
                                type="button"
                                className={`${BTN_SEC} self-start`}
                                onClick={() => {
                                    const fx = [...cfgCom.faixas];
                                    fx.splice(Math.max(fx.length - 1, 0), 0, { ate: '', pct: '' });
                                    setCfgCom({ ...cfgCom, faixas: fx });
                                }}
                            >
                                <IconPlus size={16} /> Faixa
                            </button>
                            <Opcoes rotulo="Multiplica pela nota da avaliação" opcoes={[['S', 'Sim'], ['N', 'Não']]} valor={cfgCom.multiplica_nota ? 'S' : 'N'} onChange={(v) => setCfgCom({ ...cfgCom, multiplica_nota: v !== 'N' })} />
                            <Opcoes rotulo="Sem avaliação no mês" opcoes={[['NAO_RECEBE', 'Não recebe e avisa'], ['NOTA_ANTERIOR', 'Usa a nota do mês anterior']]} valor={cfgCom.sem_avaliacao} onChange={(v) => setCfgCom({ ...cfgCom, sem_avaliacao: v || 'NAO_RECEBE' })} />
                            <Opcoes rotulo="Ocorrência grave confirmada" opcoes={[['CORTA', 'Corta a comissão do mês'], ['METADE', 'Reduz pela metade']]} valor={cfgCom.ocorrencia} onChange={(v) => setCfgCom({ ...cfgCom, ocorrencia: v || 'CORTA' })} />
                            <div className="flex flex-wrap items-end gap-3">
                                <Campo rotulo="Vale a partir de" className="w-full sm:w-56">
                                    <input type="month" className={CAMPO} value={cfgCom.vale_de} onChange={(e) => setCfgCom({ ...cfgCom, vale_de: e.target.value })} />
                                </Campo>
                                <button type="button" disabled={salvando} onClick={() => void salvarCfgCom()} className={`${BTN_PRI} w-full sm:ml-auto sm:w-auto`}>
                                    Salvar comissão
                                </button>
                            </div>
                        </section>

                        <section className={`${CARTAO} flex flex-col gap-4 p-5`}>
                            <div>
                                <h2 className="text-[18px] font-extrabold">Vales</h2>
                                <p className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Em uso: versão {config.vales?.versao ?? '–'}, desde {dataBR(config.vales?.vale_de)}.</p>
                            </div>
                            <div className={NOTA}>
                                <span>
                                    <b>Corte:</b> data do pagamento da folha. Vale com data a partir do dia em que a folha foi paga cai na folha seguinte. Se o vale passar do que a pessoa tem a receber, o saldo negativo vai para o mês seguinte.
                                </span>
                            </div>
                            <Opcoes
                                rotulo="Abater em"
                                opcoes={[
                                    ['SALARIO', 'Salário'],
                                    ['COMISSAO', 'Comissão'],
                                    ['ESCOLHER', 'Escolher em cada vale'],
                                ]}
                                valor={cfgVal.abater_em_padrao}
                                onChange={(v) => setCfgVal({ ...cfgVal, abater_em_padrao: v || 'SALARIO' })}
                                ajuda="Vale importado da Unymos entra no salário; dá para trocar vale a vale na tela de vales."
                            />
                            <Campo rotulo="Limite de vales no mês por pessoa (% do líquido, opcional)">
                                <input className={CAMPO} inputMode="decimal" placeholder="sem limite" value={cfgVal.limite_pct_liquido} onChange={(e) => setCfgVal({ ...cfgVal, limite_pct_liquido: e.target.value })} />
                            </Campo>
                            <Opcoes rotulo="Acima do limite" opcoes={[['AVISA', 'Avisa a Gestão'], ['BLOQUEIA', 'Bloqueia']]} valor={cfgVal.acima_limite} onChange={(v) => setCfgVal({ ...cfgVal, acima_limite: v || 'AVISA' })} />
                            <div className="flex flex-wrap items-end gap-3">
                                <Campo rotulo="Vale a partir de" className="w-full sm:w-56">
                                    <input type="month" className={CAMPO} value={cfgVal.vale_de} onChange={(e) => setCfgVal({ ...cfgVal, vale_de: e.target.value })} />
                                </Campo>
                                <button type="button" disabled={salvando} onClick={() => void salvarCfgVal()} className={`${BTN_PRI} w-full sm:ml-auto sm:w-auto`}>
                                    Salvar vales
                                </button>
                            </div>
                        </section>
                        {erroCfg ? <div className="rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92] lg:col-span-2">{erroCfg}</div> : null}
                        <div className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF] lg:col-span-2">Salvar cria versão nova da configuração; folhas e comissões já fechadas continuam com a versão da época. Pesos e critérios da avaliação ficam na tela da avaliação.</div>
                    </div>
                ) : null}
            </div>

            {/* ============================== Janela da regra ============================== */}
            {form ? (
                <Janela
                    titulo={form.id ? `${TIPOS[form.tipo]?.nome} · ${colabDoForm?.nome_sistema || ''}` : 'Nova regra'}
                    sub={form.id && versaoAtual ? `Versão ${versaoAtual.versao} em uso desde ${mesBR(versaoAtual.vale_de)}` : 'Um colaborador pode ter mais de uma regra, de tipos diferentes.'}
                    onFechar={fecharRegra}
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharRegra}>
                                Voltar
                            </button>
                            {form.id && encerrando === null ? (
                                <button type="button" className={BTN_PERIGO} onClick={() => setEncerrando(new Date().toISOString().slice(0, 10))}>
                                    Encerrar regra
                                </button>
                            ) : null}
                            {encerrando !== null ? (
                                <button type="button" disabled={salvando || !encerrando} className={BTN_PERIGO} onClick={() => void encerrarRegra()}>
                                    Confirmar encerramento
                                </button>
                            ) : (
                                <button type="button" disabled={salvando} className={BTN_PRI} onClick={() => void salvarRegra()}>
                                    {salvando ? 'Salvando…' : form.id ? (corrige ? 'Corrigir regra' : 'Salvar versão nova') : 'Salvar regra'}
                                </button>
                            )}
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        {!form.id ? (
                            <>
                                <Campo rotulo="Colaborador">
                                    <select className={CAMPO} value={form.colaborador_id} onChange={(e) => setForm({ ...form, colaborador_id: e.target.value ? Number(e.target.value) : '' })}>
                                        <option value="">Escolha…</option>
                                        {colabs
                                            .filter((c) => c.situacao !== 'DESLIGADO')
                                            .map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.nome_sistema}
                                                    {c.funcao ? ` · ${c.funcao}` : ''}
                                                </option>
                                            ))}
                                    </select>
                                </Campo>
                                {regrasDaPessoa.length ? (
                                    <div className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                        Já tem: {regrasDaPessoa.map((r) => TIPOS[r.tipo]?.nome).join(', ')}. As regras se somam na folha.
                                    </div>
                                ) : null}
                                <div>
                                    <span className={ROTULO}>Tipo de regra</span>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {ORDEM_TIPOS.map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                aria-pressed={form.tipo === t}
                                                onClick={() => setForm({ ...form, tipo: t, parametros: { ...TIPOS[t].padrao } })}
                                                className={`flex min-h-14 flex-col items-start justify-center rounded-xl border px-3.5 py-2 text-left transition ${
                                                    form.tipo === t ? 'border-2 border-[#313C55] bg-[#E9EFF6] dark:border-[#3D6A99] dark:bg-[#3D6A99]/20' : 'border-[#E3E8F0] bg-white hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F]'
                                                }`}
                                            >
                                                <b className="text-[14.5px]">{TIPOS[t].nome}</b>
                                                <span className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{TIPOS[t].desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : null}

                        {form.tipo ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                                {TIPOS[form.tipo].campos
                                    .filter((c) => !c.mostrar || c.mostrar(form.parametros))
                                    .map((c) => {
                                        const t = campoTipo(c, form.parametros);
                                        const rot = campoRotulo(c, form.parametros);
                                        if (t === 'opcoes')
                                            return <Opcoes key={c.k} className={c.largo ? 'sm:col-span-2' : ''} rotulo={rot} opcoes={c.opcoes || []} valor={form.parametros[c.k] ?? null} onChange={(v) => setParam(c.k, v)} ajuda={c.ajuda} />;
                                        return (
                                            <Campo key={c.k} rotulo={rot} ajuda={c.ajuda} className={t === 'txt' ? 'sm:col-span-2' : ''}>
                                                <div className="relative">
                                                    {t === 'valor' ? <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-[#7A8396]">R$</span> : null}
                                                    <input
                                                        className={`${CAMPO} ${t === 'valor' ? 'pl-10' : ''} ${t === 'pct' ? 'pr-9' : ''}`}
                                                        inputMode={t === 'txt' ? 'text' : t === 'int' ? 'numeric' : 'decimal'}
                                                        value={form.parametros[c.k] ?? ''}
                                                        placeholder={t === 'txt' ? '' : 'a definir'}
                                                        onChange={(e) => setParam(c.k, e.target.value)}
                                                    />
                                                    {t === 'pct' ? <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[15px] text-[#7A8396]">%</span> : null}
                                                </div>
                                            </Campo>
                                        );
                                    })}
                            </div>
                        ) : null}

                        {form.tipo && TIPOS[form.tipo].nota?.(form.parametros) ? <div className={NOTA}>{TIPOS[form.tipo].nota!(form.parametros)}</div> : null}

                        {form.tipo ? (
                            <div className="grid gap-4 border-t border-[#E3E8F0] pt-4 dark:border-white/[0.08] sm:grid-cols-2">
                                <Campo rotulo="Vale a partir de" ajuda={form.id ? (corrige ? 'Mesmo mês da versão atual: corrige a versão em uso.' : 'Cria versão nova; a atual termina no dia anterior.') : undefined}>
                                    <input type="month" className={CAMPO} value={form.vale_de} onChange={(e) => setForm({ ...form, vale_de: e.target.value })} />
                                </Campo>
                                <Campo rotulo="Termina em (opcional)">
                                    <input type="date" className={CAMPO} value={form.vale_ate} onChange={(e) => setForm({ ...form, vale_ate: e.target.value })} />
                                </Campo>
                                <Campo rotulo="Observação (opcional)" className="sm:col-span-2">
                                    <input className={CAMPO} value={form.observacao} maxLength={255} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                                </Campo>
                            </div>
                        ) : null}

                        {encerrando !== null ? (
                            <div className="flex flex-col gap-3 rounded-xl border border-[#F3C5C0] p-4 dark:border-[#FF9C92]/40">
                                <b className="text-[15px]">Encerrar esta regra</b>
                                <Campo rotulo="Vale até" ajuda="A regra para de entrar nas folhas depois desta data e continua no histórico.">
                                    <input type="date" className={CAMPO} value={encerrando} onChange={(e) => setEncerrando(e.target.value)} />
                                </Campo>
                                <button type="button" className={`${BTN_SEC} self-start`} onClick={() => setEncerrando(null)}>
                                    Não encerrar
                                </button>
                            </div>
                        ) : null}

                        {form.id && versoes.length ? (
                            <div>
                                <button type="button" className="inline-flex min-h-11 items-center gap-2 text-[14px] font-extrabold" onClick={() => setVerVersoes(!verVersoes)} aria-expanded={verVersoes}>
                                    <IconHistory size={18} /> Histórico de versões ({versoes.length})
                                </button>
                                {verVersoes ? (
                                    <div className="mt-2 flex flex-col">
                                        {versoes.map((v) => (
                                            <div key={v.id} className="border-t border-[#E3E8F0] py-2.5 text-[13.5px] dark:border-white/[0.08]">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <b>Versão {v.versao}</b>
                                                    <span className="text-[#5B6478] dark:text-[#AEB9CF]">
                                                        {dataBR(v.vale_de)} {v.vale_ate ? `a ${dataBR(v.vale_ate)}` : 'em diante'}
                                                    </span>
                                                    {v.usada ? <span className={`${SELO} bg-[#F1F4F8] text-[#5B6478] dark:bg-white/[0.08] dark:text-[#AEB9CF]`}>usada em folha</span> : null}
                                                </div>
                                                <div>{aConfirmar({ tipo: form.tipo, parametros: v.parametros }) ? 'Valor a confirmar' : `${resumo({ tipo: form.tipo, parametros: v.parametros }).valor} · ${resumo({ tipo: form.tipo, parametros: v.parametros }).como}`}</div>
                                                <div className="text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">
                                                    {v.criado_por_nome ? `por ${v.criado_por_nome} · ` : ''}
                                                    {dataBR(v.criado_em)}
                                                    {v.observacao ? ` · ${v.observacao}` : ''}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {erroForm ? <div className="rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {/* ============================== Janela da justificativa ============================== */}
            {fj ? (
                <Janela
                    titulo={fj.id ? 'Justificativa' : 'Nova justificativa'}
                    sub="Usada no Ajuste manual da folha"
                    onFechar={fecharJust}
                    largura="max-w-lg"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharJust}>
                                Voltar
                            </button>
                            <button type="button" disabled={salvando} className={BTN_PRI} onClick={() => void salvarJust()}>
                                {salvando ? 'Salvando…' : 'Salvar'}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <Campo rotulo="Justificativa">
                            <input className={CAMPO} value={fj.nome} maxLength={120} onChange={(e) => setFj({ ...fj, nome: e.target.value })} placeholder="Ex.: Férias vendidas" />
                        </Campo>
                        <Opcoes rotulo="Tipo" opcoes={[['ACRESCIMO', 'Acréscimo'], ['DEBITO', 'Débito']]} valor={fj.tipo} onChange={(v) => setFj({ ...fj, tipo: v || '' })} />
                        <Campo rotulo="Natureza da DRE">
                            <select
                                className={CAMPO}
                                value={fj.outra ? '__outra' : fj.natureza}
                                onChange={(e) => (e.target.value === '__outra' ? setFj({ ...fj, outra: true, natureza: '' }) : setFj({ ...fj, outra: false, natureza: e.target.value }))}
                            >
                                <option value="">Escolha…</option>
                                {naturezas.map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                                <option value="__outra">Outra…</option>
                            </select>
                        </Campo>
                        {fj.outra ? (
                            <Campo rotulo="Nome da natureza">
                                <input className={CAMPO} value={fj.natureza} maxLength={80} onChange={(e) => setFj({ ...fj, natureza: e.target.value })} />
                            </Campo>
                        ) : null}
                        {fj.id ? <Opcoes rotulo="Na lista do ajuste manual" opcoes={[['1', 'Aparece'], ['0', 'Fora da lista']]} valor={String(fj.ativo)} onChange={(v) => setFj({ ...fj, ativo: v === '0' ? 0 : 1 })} /> : null}
                        {erroForm ? <div className="rounded-xl bg-[#FDECEA] px-4 py-3 text-[14px] font-bold text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]">{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}
        </div>
    );
}
