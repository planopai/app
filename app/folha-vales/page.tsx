'use client';

/**
 * Vales e empréstimos (/folha-vales) — Gestão · Folha de pagamento — 06/11/2026.
 *
 * - Vales: hoje são lançados na Unymos (natureza "Adiantamento Salarial", fornecedor = colaborador) e entram aqui pela
 *   importação do relatório 92 (salvo como .xlsx, lido no navegador). Também podem ser lançados à mão (ex.: saldo
 *   negativo do mês anterior). Ficam "Em aberto" até a folha abatê-los, no salário ou na comissão.
 * - Corte = data do pagamento da folha: vale com data a partir do dia em que a folha foi paga cai na folha seguinte.
 * - Empréstimos parcelados: parcelas mensais até quitar (a última leva o resto); adiar empurra esta e as seguintes.
 * Back-end: rh_vales.php (novo). Só a Gestão acessa (o PHP confere).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlertTriangle, IconFileSpreadsheet, IconPlus, IconRefresh, IconSearch, IconUpload, IconWallet, IconX } from '@tabler/icons-react';

/* ============================== tipos ============================== */

type Vale = {
    id: number;
    colaborador_id: number;
    nome: string;
    data: string;
    valor: number;
    abater_em: 'SALARIO' | 'COMISSAO';
    descricao: string | null;
    situacao: 'ABERTO' | 'ABATIDO' | 'CANCELADO';
    origem: 'MANUAL' | 'UNYMOS' | 'CONTAS_A_PAGAR';
    folha_id: number | null;
    folha_competencia: string | null;
};
type Parcela = { id: number; numero: number; competencia: string; valor: number; situacao: 'PREVISTA' | 'DESCONTADA' | 'ADIADA' | 'QUITADA'; folha_id: number | null; data_pagamento: string | null };
type Emprestimo = {
    id: number;
    colaborador_id: number;
    nome: string;
    valor_total: number;
    valor_parcela: number;
    data_concessao: string | null;
    primeira_competencia: string;
    situacao: 'ABERTO' | 'QUITADO' | 'CANCELADO';
    observacao: string | null;
    parcelas: Parcela[];
    descontado: number;
    saldo: number;
};
type Colab = { id: number; nome: string; nome_completo: string; situacao: string | null; fornecedor_unymos: string | null };
type LinhaImport = { data: string; fornecedor: string; conta: string; fp: string; titulo: string; valor: number };
type Previa = {
    novos: (LinhaImport & { ref: string; colaborador_id: number; nome: string; aviso: string | null })[];
    ja_importados: number;
    antes_da_data: number;
    sem_colaborador: { fornecedor: string; qtd: number; total: number }[];
};

const API_URL = 'https://api.planoassistencialintegrado.com.br/rh_vales.php';

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
const mesBR = (ym?: string | null) => {
    if (!ym || !/^\d{4}-\d{2}/.test(ym)) return '';
    const [a, m] = ym.split('-');
    const n = MESES[Number(m) - 1];
    return `${n.charAt(0).toUpperCase()}${n.slice(1)} de ${a}`;
};
const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mesAtual = () => hojeISO().slice(0, 7);
const mesMais = (ym: string, n: number) => {
    const [a, m] = ym.split('-').map(Number);
    const t = a * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const brl = (v?: number | string | null) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
function paraNumero(s: string): number | null {
    let t = String(s ?? '').replace(/R\$|%|\s/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
}
const norm = (s: any) => semAcento(String(s ?? '')).replace(/\s+/g, ' ');

/** Lê o relatório 92 da Unymos salvo como .xlsx e devolve só as linhas da natureza dos vales. */
async function lerRelatorio92(arquivo: File, natureza: string): Promise<LinhaImport[]> {
    const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await arquivo.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('O arquivo está vazio.');
    const txt = (v: any): string => {
        if (v == null) return '';
        if (typeof v === 'object') {
            if (v instanceof Date) return v.toISOString();
            if ('richText' in v) return v.richText.map((x: any) => x.text).join('');
            if ('text' in v) return String(v.text);
            if ('result' in v) return String(v.result ?? '');
        }
        return String(v);
    };
    let col: Record<string, number> | null = null;
    const linhas: LinhaImport[] = [];
    const alvo = norm(natureza);
    ws.eachRow({ includeEmpty: false }, (row: any) => {
        const vals: any[] = row.values; // índice 1 = coluna A
        if (!col) {
            const nomes = vals.map((v) => norm(txt(v)));
            const achar = (...ops: string[]) => nomes.findIndex((n) => ops.includes(n));
            const c = { data: achar('pgto', 'data'), fornecedor: achar('fornecedor'), conta: achar('conta baixa'), natureza: achar('natureza de despesa'), fp: achar('f. p.', 'f.p.', 'fp'), titulo: achar('titulo'), valor: achar('valor') };
            if (c.data > 0 && c.fornecedor > 0 && c.natureza > 0 && c.valor > 0) col = c;
            return;
        }
        if (norm(txt(vals[col.natureza])) !== alvo) return;
        const d = vals[col.data];
        let data = '';
        if (d instanceof Date) data = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        else {
            const m = txt(d).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
            if (m) data = `${m[3]}-${m[2]}-${m[1]}`;
        }
        const vv = vals[col.valor];
        const valor = typeof vv === 'number' ? vv : paraNumero(txt(vv));
        if (!data || !valor || Number.isNaN(valor)) return;
        linhas.push({ data, fornecedor: txt(vals[col.fornecedor]).trim(), conta: col.conta > 0 ? txt(vals[col.conta]).trim() : '', fp: col.fp > 0 ? txt(vals[col.fp]).trim() : '', titulo: col.titulo > 0 ? txt(vals[col.titulo]).trim() : '', valor });
    });
    if (!col) throw new Error('Não achei as colunas do relatório 92 (PGTO, FORNECEDOR, NATUREZA DE DESPESA, VALOR). Confira se é o relatório certo.');
    return linhas;
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

function Opcoes({ rotulo, opcoes, valor, onChange, disabled }: { rotulo: string; opcoes: [string, string][]; valor: string; onChange: (v: string) => void; disabled?: boolean }) {
    return (
        <div>
            <span className={ROTULO}>{rotulo}</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label={rotulo}>
                {opcoes.map(([v, l]) => (
                    <button
                        key={v}
                        type="button"
                        disabled={disabled}
                        aria-pressed={valor === v}
                        onClick={() => onChange(v)}
                        className={`inline-flex min-h-11 items-center rounded-xl border px-3.5 text-[14px] font-bold transition disabled:opacity-50 ${
                            valor === v
                                ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#3D6A99] dark:bg-[#3D6A99]'
                                : 'border-[#E3E8F0] bg-white text-[#313C55] hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F] dark:text-[#C8CFDC]'
                        }`}
                    >
                        {l}
                    </button>
                ))}
            </div>
        </div>
    );
}

function CampoValor({ rotulo, valor, onChange, disabled, ajuda }: { rotulo: string; valor: string; onChange: (v: string) => void; disabled?: boolean; ajuda?: string }) {
    return (
        <Campo rotulo={rotulo} ajuda={ajuda}>
            <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-[#7A8396]">R$</span>
                <input className={`${CAMPO} pl-10`} inputMode="decimal" value={valor} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="0,00" />
            </div>
        </Campo>
    );
}

const SeloOrigem = ({ o }: { o: Vale['origem'] }) => <span className={`${SELO} ${o === 'MANUAL' ? S_MUDO : S_AB}`}>{o === 'MANUAL' ? 'Lançado aqui' : 'Unymos'}</span>;
const SeloSituacaoVale = ({ v }: { v: Vale }) =>
    v.situacao === 'ABERTO' ? (
        <span className={`${SELO} ${S_AVISO}`}>Em aberto</span>
    ) : v.situacao === 'ABATIDO' ? (
        <span className={`${SELO} ${S_OK}`}>Abatido{v.folha_competencia ? ` · folha ${v.folha_competencia.split('-').reverse().join('/')}` : ''}</span>
    ) : (
        <span className={`${SELO} ${S_MUDO}`}>Cancelado</span>
    );
const ROT_PARC: Record<Parcela['situacao'], [string, string]> = {
    PREVISTA: ['Prevista', S_MUDO],
    ADIADA: ['Adiada', S_AVISO],
    DESCONTADA: ['Descontada', S_OK],
    QUITADA: ['Quitada', S_OK],
};

/* ============================== página ============================== */

type Aba = 'abertos' | 'emprestimos' | 'todos' | 'cancelados';
type FormVale = { id: number | null; origem: Vale['origem']; colaborador_id: number | ''; data: string; valor: string; abater_em: string; motivo: string; descricao: string };
type FormEmp = { colaborador_id: number | ''; valor_total: string; valor_parcela: string; data_concessao: string; primeira_competencia: string; observacao: string; lancado: '' | 'S' | 'N' };
type Confirma = { titulo: string; texto: string; botao: string; perigo?: boolean; acao: string; corpo: Record<string, unknown>; campoData?: string; campoTexto?: string };

export default function ValesEmprestimosPage() {
    const [vales, setVales] = useState<Vale[]>([]);
    const [emps, setEmps] = useState<Emprestimo[]>([]);
    const [colabs, setColabs] = useState<Colab[]>([]);
    const [ultimaPaga, setUltimaPaga] = useState<{ competencia: string; data_pagamento: string } | null>(null);
    const [naturezaVale, setNaturezaVale] = useState('Adiantamento Salarial');
    const [abaterPadrao, setAbaterPadrao] = useState('SALARIO');
    const [carregando, setCarregando] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [aba, setAba] = useState<Aba>('abertos');
    const [busca, setBusca] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);

    const [fv, setFv] = useState<FormVale | null>(null);
    const [fe, setFe] = useState<FormEmp | null>(null);
    const [conf, setConf] = useState<Confirma | null>(null);
    const [confData, setConfData] = useState('');
    const [confTexto, setConfTexto] = useState('');

    // importação
    const [imp, setImp] = useState(false);
    const [impArquivo, setImpArquivo] = useState<File | null>(null);
    const [impDe, setImpDe] = useState('');
    const [impLinhas, setImpLinhas] = useState<LinhaImport[] | null>(null);
    const [previa, setPrevia] = useState<Previa | null>(null);
    const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());

    const irParaLogin = () => {
        window.location.href = '/login';
    };
    const tratarErro = (e: any, padrao: string, set: (m: string) => void) => {
        if (e instanceof SessaoExpirada) return irParaLogin();
        set(e?.message || padrao);
    };

    const carregar = useCallback(
        async (ver?: Aba) => {
            setCarregando(true);
            setErroLista(null);
            try {
                const v = ver === 'todos' || ver === 'cancelados' ? ver : 'abertos';
                const j = await api('painel', undefined, `&ver=${v}`);
                const d = j.dados || {};
                setVales(Array.isArray(d.vales) ? d.vales : []);
                setEmps(Array.isArray(d.emprestimos) ? d.emprestimos : []);
                setColabs(Array.isArray(d.colaboradores) ? d.colaboradores : []);
                setUltimaPaga(d.ultima_folha_paga || null);
                if (d.natureza_vale) setNaturezaVale(d.natureza_vale);
                setAbaterPadrao(d.config_vales?.abater_em_padrao === 'COMISSAO' ? 'COMISSAO' : d.config_vales?.abater_em_padrao === 'ESCOLHER' ? '' : 'SALARIO');
            } catch (e: any) {
                tratarErro(e, 'Não foi possível carregar os vales.', setErroLista);
            } finally {
                setCarregando(false);
            }
        },
        [],
    );

    useEffect(() => {
        void carregar(aba);
    }, [carregar, aba]);

    useEffect(() => {
        if (!aviso) return;
        const t = window.setTimeout(() => setAviso(null), 4000);
        return () => window.clearTimeout(t);
    }, [aviso]);

    /* ---- listas ---- */
    const valesFiltrados = useMemo(() => {
        const q = semAcento(busca);
        return vales.filter((v) => !q || semAcento(`${v.nome} ${v.descricao || ''}`).includes(q));
    }, [vales, busca]);
    const porPessoa = useMemo(() => {
        const m = new Map<number, Vale[]>();
        for (const v of valesFiltrados) m.set(v.colaborador_id, [...(m.get(v.colaborador_id) || []), v]);
        return [...m.values()].sort((a, b) => a[0].nome.localeCompare(b[0].nome, 'pt-BR'));
    }, [valesFiltrados]);
    const totalAberto = useMemo(() => vales.filter((v) => v.situacao === 'ABERTO').reduce((s, v) => s + v.valor, 0), [vales]);
    const empsAbertos = emps.filter((e) => e.situacao === 'ABERTO');
    const empsMostrar = useMemo(() => {
        const q = semAcento(busca);
        return emps.filter((e) => !q || semAcento(e.nome).includes(q));
    }, [emps, busca]);
    const ativos = colabs.filter((c) => c.situacao !== 'DESLIGADO');

    /* ---- vale ---- */
    const novoVale = () => {
        setErroForm(null);
        setFv({ id: null, origem: 'MANUAL', colaborador_id: '', data: hojeISO(), valor: '', abater_em: abaterPadrao, motivo: 'VALE', descricao: '' });
    };
    const editarVale = (v: Vale) => {
        setErroForm(null);
        setFv({
            id: v.id,
            origem: v.origem,
            colaborador_id: v.colaborador_id,
            data: v.data,
            valor: v.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            abater_em: v.abater_em,
            motivo: /^saldo negativo/i.test(v.descricao || '') ? 'SALDO' : 'VALE',
            descricao: v.descricao || '',
        });
    };
    const fecharVale = useCallback(() => setFv(null), []);
    const salvarVale = async () => {
        if (!fv) return;
        if (!fv.colaborador_id) return setErroForm('Escolha o colaborador.');
        if (!fv.abater_em) return setErroForm('Escolha onde o vale é abatido.');
        const valor = paraNumero(fv.valor);
        if (fv.origem === 'MANUAL' && (!valor || Number.isNaN(valor) || valor <= 0)) return setErroForm('Informe o valor do vale.');
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('vale_salvar', { id: fv.id, colaborador_id: fv.colaborador_id, data: fv.data, valor, abater_em: fv.abater_em, descricao: fv.descricao.trim() });
            setFv(null);
            setAviso(j.msg || 'Vale salvo.');
            await carregar(aba);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível salvar o vale.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    /* ---- empréstimo ---- */
    const novoEmp = () => {
        setErroForm(null);
        setFe({ colaborador_id: '', valor_total: '', valor_parcela: '', data_concessao: hojeISO(), primeira_competencia: mesAtual(), observacao: '', lancado: '' });
    };
    const fecharEmp = useCallback(() => setFe(null), []);
    const parcelasPrevistas = useMemo(() => {
        if (!fe) return [];
        const t = paraNumero(fe.valor_total);
        const p = paraNumero(fe.valor_parcela);
        if (!t || !p || Number.isNaN(t) || Number.isNaN(p) || p <= 0 || p > t || !/^\d{4}-\d{2}$/.test(fe.primeira_competencia)) return [];
        const n = Math.ceil(Math.round((t / p) * 1e6) / 1e6);
        if (n > 48) return [];
        let resto = t;
        return Array.from({ length: n }, (_, i) => {
            const v = i === n - 1 ? Math.round(resto * 100) / 100 : p;
            resto = Math.round((resto - v) * 100) / 100;
            return { numero: i + 1, competencia: mesMais(fe.primeira_competencia, i), valor: v };
        });
    }, [fe]);
    const salvarEmp = async () => {
        if (!fe) return;
        if (!fe.colaborador_id) return setErroForm('Escolha o colaborador.');
        if (!parcelasPrevistas.length) return setErroForm('Confira o valor emprestado, a parcela e a primeira folha.');
        if (!fe.lancado) return setErroForm('Diga se a entrega do dinheiro já foi lançada na Unymos.');
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('emprestimo_salvar', {
                colaborador_id: fe.colaborador_id,
                valor_total: paraNumero(fe.valor_total),
                valor_parcela: paraNumero(fe.valor_parcela),
                data_concessao: fe.data_concessao,
                primeira_competencia: fe.primeira_competencia,
                observacao: fe.observacao.trim(),
                lancado_unymos: fe.lancado === 'S',
            });
            setFe(null);
            setAba('emprestimos');
            setAviso(j.msg || 'Empréstimo salvo.');
            await carregar('emprestimos');
        } catch (e: any) {
            tratarErro(e, 'Não foi possível salvar o empréstimo.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    /* ---- confirmações (cancelar vale, adiar parcela, quitar, cancelar empréstimo) ---- */
    const pedir = (c: Confirma) => {
        setErroForm(null);
        setConfData(c.campoData ? hojeISO() : '');
        setConfTexto('');
        setConf(c);
    };
    const fecharConf = useCallback(() => setConf(null), []);
    const confirmar = async () => {
        if (!conf) return;
        setSalvando(true);
        setErroForm(null);
        try {
            const corpo = { ...conf.corpo };
            if (conf.campoData) corpo.data = confData;
            if (conf.campoTexto) corpo[conf.acao === 'vale_cancelar' ? 'motivo' : 'observacao'] = confTexto.trim();
            const j = await api(conf.acao, corpo);
            setConf(null);
            setAviso(j.msg || 'Feito.');
            await carregar(aba);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível concluir.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    /* ---- importação ---- */
    const abrirImport = () => {
        setErroForm(null);
        setImpArquivo(null);
        setImpLinhas(null);
        setPrevia(null);
        setDesmarcados(new Set());
        setImpDe(ultimaPaga?.data_pagamento?.slice(0, 10) || '');
        setImp(true);
    };
    const fecharImport = useCallback(() => setImp(false), []);
    const lerArquivo = async (f: File | null) => {
        setImpArquivo(f);
        setImpLinhas(null);
        setPrevia(null);
        setErroForm(null);
        if (!f) return;
        if (!/\.xlsx$/i.test(f.name)) {
            setErroForm('O relatório da Unymos vem em .xls antigo. Abra no Excel, use "Salvar como" e escolha "Pasta de Trabalho do Excel (.xlsx)". Depois escolha o arquivo novo aqui.');
            return;
        }
        try {
            const l = await lerRelatorio92(f, naturezaVale);
            if (!l.length) throw new Error(`Nenhum lançamento com a natureza "${naturezaVale}" no arquivo.`);
            setImpLinhas(l);
        } catch (e: any) {
            setErroForm(e?.message || 'Não foi possível ler o arquivo.');
        }
    };
    const verPrevia = async () => {
        if (!impLinhas) return;
        if (!impDe) return setErroForm('Informe a partir de qual data importar.');
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('vales_importar', { linhas: impLinhas, a_partir_de: impDe, confirmar: false });
            const p: Previa = j.dados;
            setPrevia(p);
            setDesmarcados(new Set(p.novos.filter((n) => n.aviso).map((n) => n.ref)));
        } catch (e: any) {
            tratarErro(e, 'Não foi possível conferir o arquivo.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };
    const importar = async () => {
        if (!impLinhas || !previa) return;
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('vales_importar', { linhas: impLinhas, a_partir_de: impDe, confirmar: true, ignorar: [...desmarcados] });
            setImp(false);
            setAba('abertos');
            setAviso(j.msg || 'Vales importados.');
            await carregar('abertos');
        } catch (e: any) {
            tratarErro(e, 'Não foi possível importar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    const fvColab = fv && fv.colaborador_id ? colabs.find((c) => c.id === fv.colaborador_id) : null;
    const importaveis = previa ? previa.novos.filter((n) => !desmarcados.has(n.ref)) : [];

    /* ============================== render ============================== */

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
                <header className="mb-4 flex flex-wrap items-center gap-3">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#E9EFF6] text-[#313C55] dark:bg-[#3D6A99]/25 dark:text-white">
                        <IconWallet size={26} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#5B6478] dark:text-[#AEB9CF]">Gestão · Folha de pagamento</div>
                        <h1 className="text-[24px] font-extrabold leading-tight lg:text-[28px]">Vales e empréstimos</h1>
                    </div>
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
                        <button type="button" onClick={() => void carregar(aba)} className={BTN_SEC} aria-label="Atualizar">
                            <IconRefresh size={18} />
                        </button>
                        <button type="button" onClick={abrirImport} className={BTN_SEC}>
                            <IconUpload size={18} /> Importar da Unymos
                        </button>
                        <button type="button" onClick={novoVale} className={BTN_SEC}>
                            <IconPlus size={18} /> Novo vale
                        </button>
                        <button type="button" onClick={novoEmp} className={BTN_PRI}>
                            <IconPlus size={18} /> Novo empréstimo
                        </button>
                    </div>
                </header>

                <div className={`${NOTA} mb-4`}>
                    <span>
                        <b>Corte automático:</b>{' '}
                        {ultimaPaga
                            ? `a folha de ${mesBR(ultimaPaga.competencia).toLowerCase()} foi paga em ${dataBR(ultimaPaga.data_pagamento)}. Vale com data a partir desse dia entra na folha seguinte.`
                            : 'vale com data a partir do dia em que a folha foi paga entra na folha seguinte.'}{' '}
                        O vale fica em aberto até a folha abatê-lo, no salário ou na comissão; se passar do que a pessoa tem a receber, o saldo negativo vai para o mês seguinte.
                    </span>
                </div>

                <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-[#E3E8F0] [scrollbar-width:none] dark:border-white/[0.08]">
                    {(
                        [
                            ['abertos', 'Vales em aberto'],
                            ['emprestimos', `Empréstimos${empsAbertos.length ? ` · ${empsAbertos.length}` : ''}`],
                            ['todos', 'Últimos 6 meses'],
                            ['cancelados', 'Cancelados'],
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

                {aviso ? <div className={`mb-3 rounded-xl px-4 py-3 text-[14px] font-bold ${S_OK}`}>{aviso}</div> : null}
                {erroLista ? (
                    <div className={`${ERRO} mb-3 flex flex-wrap items-center gap-3`}>
                        <span className="flex-1">{erroLista}</span>
                        <button type="button" className={BTN_SEC} onClick={() => void carregar(aba)}>
                            Tentar de novo
                        </button>
                    </div>
                ) : null}

                <div className="mb-4 flex flex-wrap items-center gap-3">
                    {aba === 'abertos' && !carregando ? (
                        <span className="text-[14px]">
                            <b>{vales.length}</b> vale(s) em aberto · <b>{brl(totalAberto)}</b>
                        </span>
                    ) : null}
                    <label className="relative ml-auto w-full sm:w-72">
                        <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8396]" />
                        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar colaborador" aria-label="Buscar" className={`${CAMPO} pl-10`} />
                    </label>
                </div>

                {carregando ? (
                    <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478]`}>Carregando…</div>
                ) : aba === 'emprestimos' ? (
                    /* ============================== Empréstimos ============================== */
                    empsMostrar.length === 0 ? (
                        <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]`}>Nenhum empréstimo.</div>
                    ) : (
                        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                            {empsMostrar.map((e) => {
                                const pct = e.valor_total ? Math.min(100, Math.round(((e.valor_total - e.saldo) / e.valor_total) * 100)) : 0;
                                const restantes = e.parcelas.filter((p) => p.situacao === 'PREVISTA' || p.situacao === 'ADIADA').length;
                                const usada = e.parcelas.some((p) => p.situacao === 'DESCONTADA' || p.folha_id);
                                return (
                                    <section key={e.id} className={`${CARTAO} flex flex-col gap-4 p-5`}>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="min-w-0 flex-1 break-words text-[18px] font-extrabold">{e.nome}</h2>
                                            <span className={`${SELO} ${e.situacao === 'ABERTO' ? S_AVISO : e.situacao === 'QUITADO' ? S_OK : S_MUDO}`}>{e.situacao === 'ABERTO' ? 'Em aberto' : e.situacao === 'QUITADO' ? 'Quitado' : 'Cancelado'}</span>
                                        </div>
                                        <div className="-mt-3 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">
                                            {e.data_concessao ? `Concedido em ${dataBR(e.data_concessao)}` : 'Data da concessão não informada'}
                                            {e.observacao ? ` · ${e.observacao}` : ''}
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                ['Valor', brl(e.valor_total), `${e.parcelas.length}x de ${brl(e.valor_parcela)}`],
                                                ['Pago', brl(e.valor_total - e.saldo), `${e.parcelas.length - restantes} parcela(s)`],
                                                ['Saldo', brl(e.saldo), `${restantes} restante(s)`],
                                            ].map(([k, v, s]) => (
                                                <div key={k} className="rounded-xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334]">
                                                    <div className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">{k}</div>
                                                    <div className="text-[17px] font-extrabold tabular-nums">{v}</div>
                                                    <div className="text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">{s}</div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-[#E3E8F0] dark:bg-white/[0.08]" aria-hidden="true">
                                            <div className="h-full rounded-full bg-[#B3CE52]" style={{ width: `${pct}%` }} />
                                        </div>
                                        <div>
                                            {e.parcelas.map((p) => (
                                                <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E3E8F0] py-2 text-[14px] dark:border-white/[0.08]">
                                                    <span className="w-12 tabular-nums text-[#5B6478] dark:text-[#AEB9CF]">
                                                        {p.numero}/{e.parcelas.length}
                                                    </span>
                                                    <span className="min-w-[130px] flex-1">Folha de {mesBR(p.competencia).toLowerCase()}</span>
                                                    <span className={`${SELO} ${ROT_PARC[p.situacao][1]}`}>
                                                        {ROT_PARC[p.situacao][0]}
                                                        {p.data_pagamento ? ` · paga em ${dataBR(p.data_pagamento)}` : ''}
                                                    </span>
                                                    <b className="w-24 text-right tabular-nums">{brl(p.valor)}</b>
                                                    {e.situacao === 'ABERTO' && (p.situacao === 'PREVISTA' || p.situacao === 'ADIADA') && !p.folha_id ? (
                                                        <button
                                                            type="button"
                                                            className={BTN_PEQ}
                                                            onClick={() =>
                                                                pedir({
                                                                    titulo: 'Adiar parcela',
                                                                    texto: `A parcela ${p.numero} (${brl(p.valor)}) sai da folha de ${mesBR(p.competencia).toLowerCase()} e vai para a de ${mesBR(mesMais(p.competencia, 1)).toLowerCase()}. As parcelas seguintes também andam um mês.`,
                                                                    botao: 'Adiar',
                                                                    acao: 'parcela_adiar',
                                                                    corpo: { parcela_id: p.id },
                                                                })
                                                            }
                                                        >
                                                            Adiar
                                                        </button>
                                                    ) : null}
                                                </div>
                                            ))}
                                        </div>
                                        {e.situacao === 'ABERTO' ? (
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    className={BTN_SEC}
                                                    onClick={() =>
                                                        pedir({
                                                            titulo: 'Quitar o saldo',
                                                            texto: `${e.nome} pagou o saldo de ${brl(e.saldo)} fora da folha. As parcelas que faltam deixam de ser descontadas.`,
                                                            botao: 'Quitar',
                                                            acao: 'emprestimo_quitar',
                                                            corpo: { id: e.id },
                                                            campoData: 'Data do pagamento',
                                                            campoTexto: 'Como pagou (opcional)',
                                                        })
                                                    }
                                                >
                                                    Quitar o saldo
                                                </button>
                                                {!usada ? (
                                                    <button
                                                        type="button"
                                                        className={BTN_PERIGO}
                                                        onClick={() =>
                                                            pedir({
                                                                titulo: 'Cancelar empréstimo',
                                                                texto: 'Use só para lançamento errado: o empréstimo e as parcelas deixam de valer. Se havia pedido pendente para lançar na Unymos, ele também é cancelado.',
                                                                botao: 'Cancelar empréstimo',
                                                                perigo: true,
                                                                acao: 'emprestimo_cancelar',
                                                                corpo: { id: e.id },
                                                            })
                                                        }
                                                    >
                                                        Cancelar
                                                    </button>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </section>
                                );
                            })}
                        </div>
                    )
                ) : /* ============================== Vales ============================== */
                porPessoa.length === 0 ? (
                    <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]`}>
                        {aba === 'abertos' ? 'Nenhum vale em aberto. Importe o relatório 92 da Unymos para trazer os vales do mês.' : 'Nenhum vale.'}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {porPessoa.map((g) => {
                            const tot = g.filter((v) => v.situacao !== 'CANCELADO').reduce((s, v) => s + v.valor, 0);
                            return (
                                <section key={g[0].colaborador_id} className={`${CARTAO} overflow-hidden`}>
                                    <div className="flex flex-wrap items-center gap-2 bg-[#F6F8FB] px-4 py-2.5 dark:bg-[#1C2334]">
                                        <b className="min-w-0 flex-1 break-words text-[15px]">{g[0].nome}</b>
                                        <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{g.length} vale(s)</span>
                                        {aba !== 'cancelados' ? <b className="tabular-nums">{brl(tot)}</b> : null}
                                    </div>
                                    {g.map((v) => (
                                        <button
                                            key={v.id}
                                            type="button"
                                            disabled={v.situacao !== 'ABERTO'}
                                            onClick={() => editarVale(v)}
                                            className="grid w-full grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-[#E3E8F0] px-4 py-2.5 text-left text-[14px] enabled:hover:bg-[#F6F8FB] dark:border-white/[0.08] dark:enabled:hover:bg-white/[0.04] sm:grid-cols-[100px_minmax(0,1fr)_150px_120px]"
                                        >
                                            <span className="tabular-nums">{dataBR(v.data)}</span>
                                            <span className="min-w-0">
                                                <span className="flex flex-wrap items-center gap-1.5">
                                                    <SeloOrigem o={v.origem} />
                                                    <span className={`${SELO} ${S_MUDO}`}>abate {v.abater_em === 'COMISSAO' ? 'na comissão' : 'no salário'}</span>
                                                    {aba !== 'abertos' ? <SeloSituacaoVale v={v} /> : null}
                                                </span>
                                                {v.descricao ? <span className="mt-0.5 block break-words text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{v.descricao}</span> : null}
                                            </span>
                                            <span className="hidden text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF] sm:block">{ultimaPaga && v.situacao === 'ABERTO' && v.data < ultimaPaga.data_pagamento ? 'antes do último pagamento' : ''}</span>
                                            <b className="text-right tabular-nums">{brl(v.valor)}</b>
                                        </button>
                                    ))}
                                </section>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ============================== Janela do vale ============================== */}
            {fv ? (
                <Janela
                    titulo={fv.id ? 'Vale' : 'Novo vale'}
                    sub={fv.origem === 'MANUAL' ? 'Lançado aqui no sistema' : 'Importado da Unymos: data, valor e pessoa vêm de lá'}
                    onFechar={fecharVale}
                    largura="max-w-lg"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharVale}>
                                Voltar
                            </button>
                            {fv.id ? (
                                <button
                                    type="button"
                                    className={BTN_PERIGO}
                                    onClick={() => {
                                        const id = fv.id;
                                        setFv(null);
                                        pedir({ titulo: 'Cancelar vale', texto: 'O vale deixa de ser abatido na folha e fica na aba Cancelados.', botao: 'Cancelar vale', perigo: true, acao: 'vale_cancelar', corpo: { id }, campoTexto: 'Motivo (opcional)' });
                                    }}
                                >
                                    Cancelar vale
                                </button>
                            ) : null}
                            <button type="button" disabled={salvando} className={BTN_PRI} onClick={() => void salvarVale()}>
                                {salvando ? 'Salvando…' : 'Salvar'}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        {fv.origem === 'MANUAL' ? (
                            <>
                                <Campo rotulo="Colaborador">
                                    <select className={CAMPO} value={fv.colaborador_id} onChange={(e) => setFv({ ...fv, colaborador_id: e.target.value ? Number(e.target.value) : '' })}>
                                        <option value="">Escolha…</option>
                                        {ativos.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.nome}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <Opcoes
                                    rotulo="O que é"
                                    opcoes={[
                                        ['VALE', 'Vale (adiantamento)'],
                                        ['SALDO', 'Saldo negativo do mês anterior'],
                                    ]}
                                    valor={fv.motivo}
                                    onChange={(m) =>
                                        setFv({
                                            ...fv,
                                            motivo: m,
                                            descricao: m === 'SALDO' ? `Saldo negativo da folha de ${mesBR(mesMais(fv.data.slice(0, 7), -1)).toLowerCase()}` : fv.descricao.replace(/^Saldo negativo da folha de .*/i, ''),
                                        })
                                    }
                                />
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Campo rotulo="Data">
                                        <input type="date" className={CAMPO} value={fv.data} onChange={(e) => setFv({ ...fv, data: e.target.value })} />
                                    </Campo>
                                    <CampoValor rotulo="Valor" valor={fv.valor} onChange={(v) => setFv({ ...fv, valor: v })} />
                                </div>
                                {fv.motivo === 'VALE' && !fv.id ? (
                                    <div className={NOTA}>
                                        <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                                        <span>Vale pago pela Unymos não precisa ser lançado aqui: ele vem na importação do relatório 92. Lançar nos dois lugares desconta duas vezes.</span>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#F6F8FB] p-3 text-[14px] dark:bg-[#1C2334]">
                                <div>
                                    <span className={ROTULO}>Colaborador</span>
                                    <b>{fvColab?.nome}</b>
                                </div>
                                <div>
                                    <span className={ROTULO}>Data · valor</span>
                                    <b>
                                        {dataBR(fv.data)} · R$ {fv.valor}
                                    </b>
                                </div>
                            </div>
                        )}
                        <Opcoes
                            rotulo="Abater em"
                            opcoes={[
                                ['SALARIO', 'Salário'],
                                ['COMISSAO', 'Comissão'],
                            ]}
                            valor={fv.abater_em}
                            onChange={(v) => setFv({ ...fv, abater_em: v })}
                        />
                        <Campo rotulo="Descrição (opcional)">
                            <input className={CAMPO} value={fv.descricao} maxLength={255} onChange={(e) => setFv({ ...fv, descricao: e.target.value })} />
                        </Campo>
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {/* ============================== Janela do empréstimo ============================== */}
            {fe ? (
                <Janela
                    titulo="Novo empréstimo parcelado"
                    sub="Parcelas mensais descontadas na folha até quitar"
                    onFechar={fecharEmp}
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharEmp}>
                                Voltar
                            </button>
                            <button type="button" disabled={salvando} className={BTN_PRI} onClick={() => void salvarEmp()}>
                                {salvando ? 'Salvando…' : 'Salvar empréstimo'}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <Campo rotulo="Colaborador">
                            <select className={CAMPO} value={fe.colaborador_id} onChange={(e) => setFe({ ...fe, colaborador_id: e.target.value ? Number(e.target.value) : '' })}>
                                <option value="">Escolha…</option>
                                {ativos.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.nome}
                                    </option>
                                ))}
                            </select>
                        </Campo>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <CampoValor rotulo="Valor emprestado" valor={fe.valor_total} onChange={(v) => setFe({ ...fe, valor_total: v })} />
                            <CampoValor rotulo="Parcela" valor={fe.valor_parcela} onChange={(v) => setFe({ ...fe, valor_parcela: v })} ajuda="A última parcela leva o resto." />
                            <Campo rotulo="Data da entrega do dinheiro">
                                <input type="date" className={CAMPO} value={fe.data_concessao} onChange={(e) => setFe({ ...fe, data_concessao: e.target.value })} />
                            </Campo>
                            <Campo rotulo="Primeiro desconto na folha de">
                                <input type="month" className={CAMPO} value={fe.primeira_competencia} onChange={(e) => setFe({ ...fe, primeira_competencia: e.target.value })} />
                            </Campo>
                        </div>
                        {parcelasPrevistas.length ? (
                            <div className="rounded-xl bg-[#F6F8FB] p-3 text-[14px] dark:bg-[#1C2334]">
                                <b>
                                    {parcelasPrevistas.length} parcela(s): {mesBR(parcelasPrevistas[0].competencia).toLowerCase()} a {mesBR(parcelasPrevistas[parcelasPrevistas.length - 1].competencia).toLowerCase()}
                                </b>
                                <div className="mt-1 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{parcelasPrevistas.map((p) => brl(p.valor)).join(' · ')}</div>
                            </div>
                        ) : null}
                        <Opcoes
                            rotulo="A entrega do dinheiro já foi lançada na Unymos?"
                            opcoes={[
                                ['S', 'Sim, já lancei'],
                                ['N', 'Não, deixar pendente para lançar'],
                            ]}
                            valor={fe.lancado}
                            onChange={(v) => setFe({ ...fe, lancado: v as FormEmp['lancado'] })}
                        />
                        <div className={NOTA}>
                            <span>
                                Na Unymos o empréstimo entra como &quot;{naturezaVale}&quot;. Na importação do relatório 92, a linha da entrega aparece marcada como empréstimo e fica de fora dos vales, para não descontar duas vezes.
                            </span>
                        </div>
                        <Campo rotulo="Observação (opcional)">
                            <input className={CAMPO} value={fe.observacao} maxLength={255} onChange={(e) => setFe({ ...fe, observacao: e.target.value })} />
                        </Campo>
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {/* ============================== Importação ============================== */}
            {imp ? (
                <Janela
                    titulo="Importar vales da Unymos"
                    sub={`Relatório 92 · natureza "${naturezaVale}"`}
                    onFechar={fecharImport}
                    largura="max-w-3xl"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharImport}>
                                Voltar
                            </button>
                            {previa ? (
                                <button type="button" disabled={salvando || !previa.novos.length} className={BTN_PRI} onClick={() => void importar()}>
                                    {salvando ? 'Importando…' : `Importar ${importaveis.length} vale(s)`}
                                </button>
                            ) : (
                                <button type="button" disabled={salvando || !impLinhas} className={BTN_PRI} onClick={() => void verPrevia()}>
                                    {salvando ? 'Conferindo…' : 'Conferir'}
                                </button>
                            )}
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        {!previa ? (
                            <>
                                <div className={NOTA}>
                                    <span>
                                        Na Unymos, tire o relatório 92 (contas pagas) do período e salve no Excel como <b>.xlsx</b>. Só entram as linhas com a natureza &quot;{naturezaVale}&quot; de fornecedores ligados a um colaborador. Importar o mesmo período de novo não duplica.
                                    </span>
                                </div>
                                <label className="flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-dashed border-[#C9D1DE] bg-[#F6F8FB] p-4 dark:border-white/[0.2] dark:bg-[#1C2334]">
                                    <IconFileSpreadsheet size={28} className="shrink-0" />
                                    <span className="min-w-0 flex-1 text-[14px]">
                                        <b className="block break-words">{impArquivo ? impArquivo.name : 'Escolher o arquivo .xlsx'}</b>
                                        <span className="text-[#5B6478] dark:text-[#AEB9CF]">{impLinhas ? `${impLinhas.length} lançamento(s) de vale no arquivo` : 'Relatório 92 salvo como .xlsx'}</span>
                                    </span>
                                    <input type="file" accept=".xlsx" className="sr-only" onChange={(e) => void lerArquivo(e.target.files?.[0] || null)} />
                                </label>
                                <Campo rotulo="Importar vales a partir de" ajuda={ultimaPaga ? `Sugestão: ${dataBR(ultimaPaga.data_pagamento)}, dia em que a folha de ${mesBR(ultimaPaga.competencia).toLowerCase()} foi paga.` : 'Use o dia em que a última folha foi paga (outubro de 2026 foi paga em 04/11/2026).'}>
                                    <input type="date" className={`${CAMPO} sm:w-60`} value={impDe} onChange={(e) => setImpDe(e.target.value)} />
                                </Campo>
                            </>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-2 text-[13.5px]">
                                    <span className={`${SELO} ${S_AB}`}>{previa.novos.length} novo(s)</span>
                                    {previa.ja_importados ? <span className={`${SELO} ${S_MUDO}`}>{previa.ja_importados} já importado(s)</span> : null}
                                    {previa.antes_da_data ? <span className={`${SELO} ${S_MUDO}`}>{previa.antes_da_data} antes de {dataBR(impDe)}</span> : null}
                                    {previa.sem_colaborador.length ? <span className={`${SELO} ${S_AVISO}`}>{previa.sem_colaborador.reduce((s, x) => s + x.qtd, 0)} sem colaborador</span> : null}
                                </div>
                                {previa.novos.length ? (
                                    <div className="overflow-hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                        {previa.novos.map((n) => {
                                            const marcado = !desmarcados.has(n.ref);
                                            return (
                                                <label key={n.ref} className={`flex cursor-pointer items-start gap-3 border-t border-[#E3E8F0] px-3 py-2.5 text-[14px] first:border-t-0 dark:border-white/[0.08] ${marcado ? '' : 'opacity-60'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={marcado}
                                                        onChange={() => {
                                                            const s = new Set(desmarcados);
                                                            if (marcado) s.add(n.ref);
                                                            else s.delete(n.ref);
                                                            setDesmarcados(s);
                                                        }}
                                                        className="mt-0.5 size-6 shrink-0 accent-[#313C55]"
                                                    />
                                                    <span className="w-[86px] shrink-0 tabular-nums">{dataBR(n.data)}</span>
                                                    <span className="min-w-0 flex-1">
                                                        <b className="break-words">{n.nome}</b>
                                                        <span className="block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{[n.conta, n.fp, n.titulo ? `título ${n.titulo}` : ''].filter(Boolean).join(' · ')}</span>
                                                        {n.aviso ? (
                                                            <span className={`${SELO} ${S_AVISO} mt-1`}>
                                                                <IconAlertTriangle size={13} /> {n.aviso}
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                    <b className="shrink-0 tabular-nums">{brl(n.valor)}</b>
                                                </label>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className={NOTA}>Nenhum vale novo nesse período.</div>
                                )}
                                {desmarcados.size ? <div className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Os desmarcados ficam gravados como cancelados, para não voltarem na próxima importação.</div> : null}
                                {previa.sem_colaborador.length ? (
                                    <div className="rounded-xl border border-[#E4BC30] p-3 text-[14px] dark:border-[#F2CB3F]/60">
                                        <b>Fornecedores sem colaborador ligado (não entram):</b>
                                        <ul className="mt-1 list-disc pl-5">
                                            {previa.sem_colaborador.map((s) => (
                                                <li key={s.fornecedor}>
                                                    {s.fornecedor} · {s.qtd} lançamento(s) · {brl(s.total)}
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="mt-1 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">Se for um colaborador, preencha o &quot;Fornecedor na Unymos&quot; no cadastro dele e importe de novo.</div>
                                    </div>
                                ) : null}
                                <button
                                    type="button"
                                    className={`${BTN_SEC} self-start`}
                                    onClick={() => {
                                        setPrevia(null);
                                        setDesmarcados(new Set());
                                    }}
                                >
                                    Trocar arquivo ou data
                                </button>
                            </>
                        )}
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {/* ============================== Confirmação ============================== */}
            {conf ? (
                <Janela
                    titulo={conf.titulo}
                    onFechar={fecharConf}
                    largura="max-w-md"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharConf}>
                                Voltar
                            </button>
                            <button type="button" disabled={salvando || (!!conf.campoData && !confData)} className={conf.perigo ? BTN_PERIGO : BTN_PRI} onClick={() => void confirmar()}>
                                {salvando ? 'Aguarde…' : conf.botao}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <p className="text-[15px] leading-snug">{conf.texto}</p>
                        {conf.campoData ? (
                            <Campo rotulo={conf.campoData}>
                                <input type="date" className={CAMPO} value={confData} onChange={(e) => setConfData(e.target.value)} />
                            </Campo>
                        ) : null}
                        {conf.campoTexto ? (
                            <Campo rotulo={conf.campoTexto}>
                                <input className={CAMPO} value={confTexto} maxLength={150} onChange={(e) => setConfTexto(e.target.value)} />
                            </Campo>
                        ) : null}
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}
        </div>
    );
}
