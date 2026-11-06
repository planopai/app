'use client';

/**
 * Folha de pagamento (/folha) — Gestão · Folha de pagamento — 06/11/2026.
 *
 * Linha de cada colaborador: Contracheque (líquido do Domínio) + Extra + Bônus + Ajuste manual − Vales = A pagar.
 * - O contracheque do Domínio é importado em .xlsx (RECIBOS salvo pelo Excel) e lido aqui no navegador.
 * - Cada coluna abre a janela com o detalhe (rubricas, tanatopraxias, bônus do mês, ajustes com justificativa, vales).
 * - Situações: Aberta → Conferida → Aprovada → Paga. Qualquer pessoa da Gestão faz cada passo.
 * - Aba "Lançar na Unymos": o título único da folha (com rateio por equipe) e as guias GFD e DARF, para lançar à mão.
 * - Comissões são pagas à parte e não entram aqui.
 * Back-end: rh_folha.php (novo). Só a Gestão acessa (o PHP confere).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    IconAlertTriangle,
    IconCheck,
    IconChevronLeft,
    IconChevronRight,
    IconDownload,
    IconFileSpreadsheet,
    IconPlus,
    IconReceipt2,
    IconRefresh,
    IconTrash,
    IconUpload,
    IconX,
} from '@tabler/icons-react';
import { BOTAO_PAGINA, BOTAO_PAGINA_PRI, BOTAO_PAGINA_SEC, CartaoInfo, GRADE_CARTOES, ROTULO_SECAO, TopoPagina } from '@/components/shell/ModuloHub';

/* ============================== tipos ============================== */

type Item = {
    id?: number;
    tipo: string;
    valor: number;
    descricao: string;
    quantidade: number | null;
    natureza: string | null;
    auto: boolean;
    justificativa?: string | null;
};
type Linha = {
    colaborador_id: number;
    nome: string;
    nome_completo: string;
    funcao: string | null;
    equipe: string | null;
    codigo_dominio: string | null;
    forma_pagamento: 'PIX' | 'TRANSFERENCIA' | null;
    pix: string | null;
    conta: string | null;
    contracheque: { id: number; liquido: number; vencimentos: number; descontos: number; fgts: number; consignado: number } | null;
    liquido: number;
    extra: number;
    bonus: number;
    ajuste: number;
    descontos: number;
    total: number;
    a_pagar: number;
    saldo_negativo: number;
    itens: Item[];
    avisos: string[];
};
type Folha = {
    id: number;
    competencia: string;
    situacao: 'ABERTA' | 'CONFERIDA' | 'APROVADA' | 'PAGA';
    data_pagamento: string | null;
    conferido_em: string | null;
    conferido_por_nome: string | null;
    aprovado_em: string | null;
    aprovado_por_nome: string | null;
    pago_em: string | null;
    pago_por_nome: string | null;
};
type Totais = { liquido: number; extra: number; bonus: number; ajuste: number; descontos: number; a_pagar: number; saldo_negativo: number; pessoas: number };
type Recolhimentos = {
    gfd: { fgts: number; consignado: number; total: number; vencimento: string };
    darf: { inss_retido: number; salario_familia: number; total: number; vencimento: string };
};
type Integracao = { id: number; origem: string; favorecido: string; descricao: string; natureza: string; natureza_unymos: string | null; valor: number; rateio: { equipe: string; valor: number }[] | null; vencimento: string | null; situacao: string; ref_externa: string | null };
type Justificativa = { id: number; nome: string; tipo: 'ACRESCIMO' | 'DEBITO'; natureza: string };
type Recibo = { codigo: string; nome: string; rubricas: (string | number | null)[][]; venc: number; desc: number; liq: number; base: number | null; fgts: number | null };
type Detalhe = { contracheque: any; rubricas: { codigo: number; descricao: string; referencia: string | null; vencimento: string | null; desconto: string | null; natureza: string | null; trata_como: string | null }[]; tanatopraxias: { atendimento_id: number; falecido: string; data: string }[] };
type AbaDet = 'contracheque' | 'bonus' | 'ajuste' | 'vales';

const API_URL = 'https://api.planoassistencialintegrado.com.br/rh_folha.php';
const RH_REGRAS = 'https://api.planoassistencialintegrado.com.br/rh_regras.php';

/* ============================== API ============================== */

class SessaoExpirada extends Error {}

async function api(acao: string, corpo?: Record<string, unknown>, extra = '', url = API_URL) {
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
const semAcento = (s: string) =>
    String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
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
const sinal = (v: number) => (v > 0 ? `+${brl(v)}` : v < 0 ? `−${brl(-v)}` : '—');
function paraNumero(s: string): number | null {
    let t = String(s ?? '').replace(/R\$|%|\s/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
}
/** Quinto dia útil do mês seguinte à competência (sem feriados). Sugestão para a data de pagamento. */
function quintoDiaUtil(comp: string) {
    const [a, m] = mesMais(comp, 1).split('-').map(Number);
    let uteis = 0;
    for (let d = 1; d <= 31; d++) {
        const dt = new Date(a, m - 1, d);
        const s = dt.getDay();
        if (s !== 0 && s !== 6) uteis++;
        if (uteis === 5) return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return hojeISO();
}

/** Lê o RECIBOS do Domínio salvo como .xlsx: cada contracheque vira {código, nome, rubricas, totais, líquido, base, FGTS}. */
async function lerRecibos(arquivo: File): Promise<{ recibos: Recibo[]; competencia: string | null }> {
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
    const num = (v: any): number | null => {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return v;
        if (typeof v === 'object' && 'result' in v) return Number(v.result);
        const n = paraNumero(txt(v));
        return n == null || Number.isNaN(n) ? null : n;
    };
    const linhas: any[][] = [];
    ws.eachRow({ includeEmpty: true }, (row: any, n: number) => {
        linhas[n] = row.values as any[];
    });
    const achar = (vals: any[], nome: string) => (vals || []).findIndex((v) => semAcento(txt(v)) === semAcento(nome));
    const recibos: Recibo[] = [];
    let competencia: string | null = null;
    let atual: Recibo | null = null;
    let col: { cod: number; desc: number; ref: number; venc: number; dsc: number } | null = null;
    let estado: 'nada' | 'rubricas' | 'totais' | 'base' = 'nada';
    let colBase = { base: -1, fgts: -1 };
    for (let i = 1; i < linhas.length; i++) {
        const v = linhas[i] || [];
        const textos = Array.from(v, (x) => semAcento(txt(x)));
        if (!competencia) {
            const m = textos.join(' ').match(/(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de (\d{4})/);
            if (m) {
                const idx = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'].indexOf(m[1]);
                competencia = `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
            }
        }
        const iNome = achar(v, 'Nome do Funcionário');
        if (iNome > 0) {
            const prox = linhas[i + 1] || [];
            const iCod = achar(v, 'Código');
            const cod = String(num(prox[iCod]) ?? num(prox[iCod - 2]) ?? num(prox[iCod - 1]) ?? '').replace(/\D/g, '') || String(prox.find((x: any) => typeof x === 'number') ?? '');
            const nome = txt(prox[iNome]).trim() || txt(prox.find((x: any) => typeof x === 'string')).trim();
            atual = { codigo: cod, nome, rubricas: [], venc: 0, desc: 0, liq: 0, base: null, fgts: null };
            recibos.push(atual);
            estado = 'nada';
            continue;
        }
        if (!atual) continue;
        if (achar(v, 'Descrição') > 0 && achar(v, 'Vencimentos') > 0) {
            col = { cod: achar(v, 'Código'), desc: achar(v, 'Descrição'), ref: achar(v, 'Referência'), venc: achar(v, 'Vencimentos'), dsc: achar(v, 'Descontos') };
            estado = 'rubricas';
            continue;
        }
        if (textos.includes('total de vencimentos')) {
            estado = 'totais';
            continue;
        }
        if (achar(v, 'Salário Base') > 0) {
            colBase = { base: achar(v, 'Salário Base'), fgts: textos.findIndex((t) => t.startsWith('f.g.t.s')) };
            estado = 'base';
            continue;
        }
        if (estado === 'rubricas' && col) {
            const cod = num(v[col.cod]);
            if (cod != null && txt(v[col.desc]).trim()) {
                atual.rubricas.push([cod, txt(v[col.desc]).trim(), txt(v[col.ref]).trim() || null, num(v[col.venc]), num(v[col.dsc])]);
            }
            continue;
        }
        if (estado === 'totais' && col) {
            const a = num(v[col.venc]);
            const b = num(v[col.dsc]);
            if (a != null || b != null) {
                atual.venc = a ?? 0;
                atual.desc = b ?? 0;
                atual.liq = Math.round((atual.venc - atual.desc) * 100) / 100;
                estado = 'nada';
            }
            continue;
        }
        // o líquido fica na linha do rótulo "Valor Líquido" (células mescladas repetem os totais na linha de baixo)
        if (col && textos.includes('valor liquido')) {
            const l = num(v[col.dsc]);
            if (l != null) atual.liq = l;
            continue;
        }
        if (estado === 'base') {
            atual.base = num(v[colBase.base]);
            atual.fgts = colBase.fgts > 0 ? num(v[colBase.fgts]) : null;
            estado = 'nada';
        }
    }
    // o Domínio imprime duas vias de cada recibo: fica uma
    const vistos = new Set<string>();
    const unicos = recibos.filter((r) => r.codigo && !vistos.has(r.codigo) && (vistos.add(r.codigo), true));
    if (!unicos.length) throw new Error('Não achei contracheques no arquivo. Confira se é o RECIBOS do Domínio salvo como .xlsx.');
    return { recibos: unicos, competencia };
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
const SITUACAO: Record<Folha['situacao'], [string, string]> = { ABERTA: ['Aberta', S_AVISO], CONFERIDA: ['Conferida', S_AB], APROVADA: ['Aprovada', S_AB], PAGA: ['Paga', S_OK] };
const GRADE_TABELA = 'lg:grid lg:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(96px,1fr))_minmax(110px,1fr)_118px] lg:items-center lg:gap-2';

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

/** Célula de valor que abre o detalhe. */
function Celula({ rotulo, valor, onClick, forte, negativo }: { rotulo: string; valor: number; onClick: () => void; forte?: boolean; negativo?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-baseline justify-between gap-2 rounded-lg px-1.5 py-1 text-right tabular-nums hover:bg-[#EEF2F7] dark:hover:bg-white/[0.06] lg:block lg:w-full ${forte ? 'font-extrabold' : ''} ${
                negativo && valor < 0 ? 'text-[#B42318] dark:text-[#FF9C92]' : ''
            } ${!valor ? 'text-[#98A1B3]' : ''}`}
        >
            <span className="text-[12px] font-bold text-[#5B6478] dark:text-[#AEB9CF] lg:hidden">{rotulo}</span>
            <span>{valor ? (negativo ? sinal(valor) : brl(valor)) : '—'}</span>
        </button>
    );
}

/* ============================== página ============================== */

export default function FolhaPagamentoPage() {
    const [comp, setComp] = useState<string>(() => mesMais(hojeISO().slice(0, 7), -0));
    const [folha, setFolha] = useState<Folha | null>(null);
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [totais, setTotais] = useState<Totais | null>(null);
    const [rec, setRec] = useState<Recolhimentos | null>(null);
    const [avisos, setAvisos] = useState<string[]>([]);
    const [integ, setInteg] = useState<Integracao[]>([]);
    const [hist, setHist] = useState<{ competencia: string; situacao: string; data_pagamento: string | null; total_pagar: string; origem: string }[]>([]);
    const [justs, setJusts] = useState<Justificativa[]>([]);
    const [naturezas, setNaturezas] = useState<string[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erroLista, setErroLista] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [aba, setAba] = useState<'folha' | 'unymos' | 'anteriores'>('folha');
    const [busca, setBusca] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);

    // detalhe do colaborador
    const [det, setDet] = useState<{ linha: Linha; aba: AbaDet } | null>(null);
    const [detDados, setDetDados] = useState<Detalhe | null>(null);
    const [novoBonus, setNovoBonus] = useState({ valor: '', motivo: '' });
    const [novoAjuste, setNovoAjuste] = useState({ justificativa_id: '' as number | '' | 'nova', valor: '', obs: '' });
    const [novaJust, setNovaJust] = useState({ nome: '', tipo: '', natureza: '' });

    // importação, situação
    const [imp, setImp] = useState(false);
    const [impArq, setImpArq] = useState<File | null>(null);
    const [impLido, setImpLido] = useState<{ recibos: Recibo[]; competencia: string | null } | null>(null);
    const [passo, setPasso] = useState<{ acao: 'conferir' | 'reabrir' | 'aprovar' | 'pagar'; data: string } | null>(null);
    const [marcar, setMarcar] = useState<{ item: Integracao; ref: string } | null>(null);

    const irParaLogin = () => {
        window.location.href = '/login';
    };
    const tratarErro = (e: any, padrao: string, set: (m: string) => void) => {
        if (e instanceof SessaoExpirada) return irParaLogin();
        set(e?.message || padrao);
    };

    const carregar = useCallback(async (c: string) => {
        setCarregando(true);
        setErroLista(null);
        try {
            const j = await api('painel', undefined, `&competencia=${c}`);
            const d = j.dados || {};
            setFolha(d.folha || null);
            setLinhas(Array.isArray(d.linhas) ? d.linhas : []);
            setTotais(d.totais || null);
            setRec(d.recolhimentos || null);
            setAvisos(Array.isArray(d.avisos) ? d.avisos : []);
            setInteg(Array.isArray(d.integracao) ? d.integracao : []);
            setHist(Array.isArray(d.historico) ? d.historico : []);
            setJusts(Array.isArray(d.justificativas) ? d.justificativas : []);
            setNaturezas(Array.isArray(d.naturezas) ? d.naturezas : []);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível carregar a folha.', setErroLista);
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

    const aberta = !folha || folha.situacao === 'ABERTA';
    const filtradas = useMemo(() => {
        const q = semAcento(busca);
        return linhas.filter((l) => !q || semAcento(`${l.nome} ${l.nome_completo} ${l.funcao || ''} ${l.equipe || ''}`).includes(q));
    }, [linhas, busca]);
    const comAviso = linhas.filter((l) => l.avisos.length).length;

    /* ---- detalhe ---- */
    const abrirDet = async (linha: Linha, a: AbaDet) => {
        setErroForm(null);
        setNovoBonus({ valor: '', motivo: '' });
        setNovoAjuste({ justificativa_id: '', valor: '', obs: '' });
        setNovaJust({ nome: '', tipo: '', natureza: '' });
        setDetDados(null);
        setDet({ linha, aba: a });
        try {
            const j = await api('detalhe', undefined, `&competencia=${comp}&colaborador_id=${linha.colaborador_id}`);
            setDetDados(j.dados);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível abrir o detalhe.', setErroForm);
        }
    };
    const fecharDet = useCallback(() => setDet(null), []);
    const recarregarDet = async (cid: number) => {
        const j = await api('painel', undefined, `&competencia=${comp}`);
        const d = j.dados || {};
        setFolha(d.folha || null);
        setLinhas(d.linhas || []);
        setTotais(d.totais || null);
        setRec(d.recolhimentos || null);
        setJusts(d.justificativas || []);
        const nova = (d.linhas || []).find((x: Linha) => x.colaborador_id === cid);
        setDet((atual) => (atual && nova ? { ...atual, linha: nova } : atual));
    };
    const lancar = async (tipo: 'BONUS' | 'AJUSTE') => {
        if (!det) return;
        setErroForm(null);
        let corpo: Record<string, unknown>;
        if (tipo === 'BONUS') {
            const v = paraNumero(novoBonus.valor);
            if (!v || Number.isNaN(v) || v <= 0) return setErroForm('Informe o valor do bônus.');
            if (!novoBonus.motivo.trim()) return setErroForm('Informe o motivo do bônus.');
            corpo = { competencia: comp, colaborador_id: det.linha.colaborador_id, tipo, valor: v, descricao: novoBonus.motivo.trim() };
        } else {
            const v = paraNumero(novoAjuste.valor);
            if (!v || Number.isNaN(v) || v <= 0) return setErroForm('Informe o valor do ajuste.');
            let jid = novoAjuste.justificativa_id;
            if (!jid) return setErroForm('Escolha a justificativa.');
            setSalvando(true);
            try {
                if (jid === 'nova') {
                    if (!novaJust.nome.trim() || !novaJust.tipo || !novaJust.natureza.trim()) {
                        setSalvando(false);
                        return setErroForm('Preencha a justificativa nova: nome, acréscimo ou débito e natureza.');
                    }
                    const r = await api('justificativa_salvar', { nome: novaJust.nome.trim(), tipo: novaJust.tipo, natureza: novaJust.natureza.trim() }, '', RH_REGRAS);
                    jid = Number(r.dados?.id);
                }
                corpo = { competencia: comp, colaborador_id: det.linha.colaborador_id, tipo, valor: v, justificativa_id: jid, descricao: novoAjuste.obs.trim() };
            } catch (e: any) {
                setSalvando(false);
                return tratarErro(e, 'Não foi possível criar a justificativa.', setErroForm);
            }
        }
        setSalvando(true);
        try {
            const j = await api('lancamento_salvar', corpo);
            setAviso(j.msg);
            setNovoBonus({ valor: '', motivo: '' });
            setNovoAjuste({ justificativa_id: '', valor: '', obs: '' });
            setNovaJust({ nome: '', tipo: '', natureza: '' });
            await recarregarDet(det.linha.colaborador_id);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível lançar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };
    const tirar = async (id: number) => {
        if (!det) return;
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('lancamento_excluir', { id });
            setAviso(j.msg);
            await recarregarDet(det.linha.colaborador_id);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível tirar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    /* ---- importação ---- */
    const abrirImp = () => {
        setErroForm(null);
        setImpArq(null);
        setImpLido(null);
        setImp(true);
    };
    const fecharImp = useCallback(() => setImp(false), []);
    const lerArquivo = async (f: File | null) => {
        setImpArq(f);
        setImpLido(null);
        setErroForm(null);
        if (!f) return;
        if (!/\.xlsx$/i.test(f.name)) return setErroForm('O RECIBOS do Domínio vem em .xls. Abra no Excel, use "Salvar como" e escolha "Pasta de Trabalho do Excel (.xlsx)".');
        try {
            setImpLido(await lerRecibos(f));
        } catch (e: any) {
            setErroForm(e?.message || 'Não foi possível ler o arquivo.');
        }
    };
    const importar = async () => {
        if (!impLido) return;
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('contracheques_importar', { competencia: comp, arquivo: impArq?.name || '', recibos: impLido.recibos });
            setImp(false);
            const sem: string[] = j.dados?.sem_colaborador || [];
            setAviso(j.msg + (sem.length ? ` Sem colaborador: ${sem.join(', ')}.` : ''));
            await carregar(comp);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível importar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };
    const somaRecibos = impLido ? impLido.recibos.reduce((s, r) => s + r.liq, 0) : 0;
    const recibosComDiferenca = impLido ? impLido.recibos.filter((r) => Math.abs(Math.round((r.venc - r.desc) * 100) / 100 - r.liq) > 0.02) : [];

    /* ---- situação ---- */
    const fecharPasso = useCallback(() => setPasso(null), []);
    const confirmarPasso = async () => {
        if (!passo) return;
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('situacao', { competencia: comp, acao: passo.acao, data_pagamento: passo.data || null });
            setPasso(null);
            setAviso(j.msg);
            if (passo.acao === 'aprovar') setAba('unymos');
            await carregar(comp);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível concluir.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };
    const TEXTO_PASSO: Record<string, [string, string, string]> = {
        conferir: ['Conferir a folha', 'Os valores calculados (extra, bônus, vales e parcelas) ficam fixos. Para mudar depois, é preciso reabrir.', 'Conferir'],
        reabrir: ['Reabrir a folha', 'O cálculo volta a ser automático e os lançamentos para a Unymos que ainda estão pendentes são cancelados.', 'Reabrir'],
        aprovar: ['Aprovar a folha', 'Nascem os lançamentos para a Unymos: o título da folha com rateio por equipe e as guias GFD e DARF.', 'Aprovar'],
        pagar: ['Marcar como paga', 'Os vales ficam abatidos, as parcelas descontadas e o saldo negativo de quem ficou devendo vira vale na próxima folha.', 'Marcar como paga'],
    };

    /* ---- Unymos ---- */
    const confirmarMarcar = async (item: Integracao, lancado: boolean, ref = '') => {
        setSalvando(true);
        setErroForm(null);
        try {
            const j = await api('integracao_marcar', { id: item.id, lancado, ref_externa: ref.trim() });
            setMarcar(null);
            setAviso(j.msg);
            await carregar(comp);
        } catch (e: any) {
            tratarErro(e, 'Não foi possível marcar.', setErroForm);
        } finally {
            setSalvando(false);
        }
    };

    /* ---- exportar ---- */
    const exportar = async () => {
        try {
            const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet(`Folha ${comp}`);
            ws.columns = [
                { header: 'Colaborador', key: 'nome', width: 32 },
                { header: 'Equipe', key: 'equipe', width: 16 },
                { header: 'Contracheque', key: 'liquido', width: 15 },
                { header: 'Extra', key: 'extra', width: 13 },
                { header: 'Bônus', key: 'bonus', width: 13 },
                { header: 'Ajuste manual', key: 'ajuste', width: 15 },
                { header: 'Vales e descontos', key: 'descontos', width: 17 },
                { header: 'A pagar', key: 'a_pagar', width: 14 },
                { header: 'Forma', key: 'forma', width: 14 },
                { header: 'Chave Pix / conta', key: 'destino', width: 36 },
            ];
            linhas.forEach((l) =>
                ws.addRow({
                    nome: l.nome_completo,
                    equipe: l.equipe || '',
                    liquido: l.liquido,
                    extra: l.extra,
                    bonus: l.bonus,
                    ajuste: l.ajuste,
                    descontos: l.descontos,
                    a_pagar: l.a_pagar,
                    forma: l.forma_pagamento === 'PIX' ? 'Pix' : l.forma_pagamento === 'TRANSFERENCIA' ? 'Transferência' : '',
                    destino: l.forma_pagamento === 'TRANSFERENCIA' ? l.conta || '' : l.pix || '',
                }),
            );
            if (totais)
                ws.addRow({ nome: 'Total', liquido: totais.liquido, extra: totais.extra, bonus: totais.bonus, ajuste: totais.ajuste, descontos: totais.descontos, a_pagar: totais.a_pagar }).font = { bold: true };
            ws.getRow(1).font = { bold: true };
            ['C', 'D', 'E', 'F', 'G', 'H'].forEach((c) => (ws.getColumn(c).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00'));
            const buf = await wb.xlsx.writeBuffer();
            const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `folha-${comp}.xlsx`;
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch {
            setAviso('Não foi possível gerar o arquivo.');
        }
    };

    const linhaDet = det?.linha;
    const itensDe = (tipos: string[]) => (linhaDet ? linhaDet.itens.filter((i) => tipos.includes(i.tipo)) : []);
    const justEscolhida = typeof novoAjuste.justificativa_id === 'number' ? justs.find((j) => j.id === novoAjuste.justificativa_id) : null;

    /* ============================== render ============================== */

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <div className="mb-5">
                    <TopoPagina
                        Icone={IconReceipt2}
                        titulo="Folha de pagamento"
                        acoes={
                            <>
                                <button type="button" className={BTN_SEC} onClick={() => void exportar()} disabled={!linhas.length}>
                                    <IconDownload size={18} /> Exportar
                                </button>
                                {aberta ? (
                                    <button type="button" className={BTN_SEC} onClick={abrirImp}>
                                        <IconUpload size={18} /> Importar contracheques
                                    </button>
                                ) : null}
                                {aberta ? (
                                    <button type="button" className={BTN_PRI} disabled={!linhas.length} onClick={() => setPasso({ acao: 'conferir', data: folha?.data_pagamento || quintoDiaUtil(comp) })}>
                                        <IconCheck size={18} /> Conferir
                                    </button>
                                ) : folha?.situacao === 'CONFERIDA' ? (
                                    <>
                                        <button type="button" className={BTN_SEC} onClick={() => setPasso({ acao: 'reabrir', data: '' })}>
                                            Reabrir
                                        </button>
                                        <button type="button" className={BTN_PRI} onClick={() => setPasso({ acao: 'aprovar', data: '' })}>
                                            <IconCheck size={18} /> Aprovar
                                        </button>
                                    </>
                                ) : folha?.situacao === 'APROVADA' ? (
                                    <>
                                        <button type="button" className={BTN_SEC} onClick={() => setPasso({ acao: 'reabrir', data: '' })}>
                                            Reabrir
                                        </button>
                                        <button type="button" className={BTN_PRI} onClick={() => setPasso({ acao: 'pagar', data: folha.data_pagamento || hojeISO() })}>
                                            <IconCheck size={18} /> Marcar como paga
                                        </button>
                                    </>
                                ) : null}
                            </>
                        }
                    />
                </div>

                {/* competência e situação */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <button type="button" className={`${BTN_PEQ} size-11 px-0`} aria-label="Mês anterior" onClick={() => setComp(mesMais(comp, -1))}>
                        <IconChevronLeft size={20} />
                    </button>
                    <div className="min-w-[170px] text-center text-[17px] font-extrabold">{mesBR(comp)}</div>
                    <button type="button" className={`${BTN_PEQ} size-11 px-0`} aria-label="Mês seguinte" onClick={() => setComp(mesMais(comp, 1))}>
                        <IconChevronRight size={20} />
                    </button>
                    <span className={`${SELO} ${folha ? SITUACAO[folha.situacao][1] : S_MUDO}`}>{folha ? SITUACAO[folha.situacao][0] : 'Ainda não aberta'}</span>
                    {folha?.data_pagamento ? <span className="text-[13.5px] text-[#5B6478] dark:text-[#AEB9CF]">pagamento em {dataBR(folha.data_pagamento)}</span> : null}
                    {folha?.conferido_por_nome ? <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">· conferida por {folha.conferido_por_nome}</span> : null}
                    {folha?.aprovado_por_nome ? <span className="text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">· aprovada por {folha.aprovado_por_nome}</span> : null}
                    <button type="button" className={`${BTN_PEQ} ml-auto size-11 px-0`} aria-label="Atualizar" onClick={() => void carregar(comp)}>
                        <IconRefresh size={18} />
                    </button>
                </div>

                {aviso ? <div className={`mb-3 rounded-xl px-4 py-3 text-[14px] font-bold ${S_OK}`}>{aviso}</div> : null}
                {erroLista ? <div className={`${ERRO} mb-3`}>{erroLista}</div> : null}

                {/* cartões */}
                {totais ? (
                    <section aria-label="Resumo" className={`mb-4 ${GRADE_CARTOES}`}>
                        <CartaoInfo rotulo="A pagar" valor={brl(totais.a_pagar)} sub={`${totais.pessoas} colaborador(es)`} href="#folha" estilo="escuro" />
                        <CartaoInfo rotulo="Contracheques" valor={brl(totais.liquido)} sub="líquido do Domínio" href="#folha" />
                        <CartaoInfo rotulo="Extra, bônus e ajustes" valor={brl(totais.extra + totais.bonus + totais.ajuste)} sub={`extra ${brl(totais.extra)} · bônus ${brl(totais.bonus)}`} href="#folha" />
                        <CartaoInfo rotulo="Vales e descontos" valor={brl(-totais.descontos)} sub={totais.saldo_negativo ? `saldo negativo ${brl(totais.saldo_negativo)}` : 'abatidos nesta folha'} href="#folha" estilo={totais.saldo_negativo ? 'alerta' : undefined} />
                    </section>
                ) : null}

                {/* recolhimentos */}
                {rec && (rec.gfd.total || rec.darf.total) ? (
                    <section className={`${CARTAO} mb-5 grid gap-3 p-4 sm:grid-cols-2`}>
                        <div>
                            <div className={ROTULO_SECAO}>FGTS Digital (GFD) · vence {dataBR(rec.gfd.vencimento)}</div>
                            <div className="mt-1 text-[20px] font-extrabold tabular-nums">{brl(rec.gfd.total)}</div>
                            <div className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                FGTS {brl(rec.gfd.fgts)} + consignado {brl(rec.gfd.consignado)}
                            </div>
                        </div>
                        <div>
                            <div className={ROTULO_SECAO}>DARF do INSS · vence {dataBR(rec.darf.vencimento)}</div>
                            <div className="mt-1 text-[20px] font-extrabold tabular-nums">{brl(rec.darf.total)}</div>
                            <div className="text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">
                                retido {brl(rec.darf.inss_retido)} − salário-família {brl(rec.darf.salario_familia)} · parte da empresa no DAS (Simples)
                            </div>
                        </div>
                    </section>
                ) : null}

                <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-[#E3E8F0] [scrollbar-width:none] dark:border-white/[0.08]">
                    {(
                        [
                            ['folha', 'Folha'],
                            ['unymos', `Lançar na Unymos${integ.filter((i) => i.situacao === 'PENDENTE').length ? ` · ${integ.filter((i) => i.situacao === 'PENDENTE').length}` : ''}`],
                            ['anteriores', 'Folhas anteriores'],
                        ] as ['folha' | 'unymos' | 'anteriores', string][]
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

                {/* ============================== Folha ============================== */}
                {aba === 'folha' ? (
                    <div id="folha">
                        {avisos.length ? (
                            <div className={`${NOTA} mb-3`}>
                                <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <span>{avisos.join(' ')}</span>
                            </div>
                        ) : null}
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                            {comAviso ? (
                                <span className={`${SELO} ${S_AVISO}`}>
                                    <IconAlertTriangle size={13} /> {comAviso} linha(s) com aviso
                                </span>
                            ) : null}
                            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar colaborador" aria-label="Buscar" className={`${CAMPO} ml-auto sm:w-72`} />
                        </div>
                        {carregando ? (
                            <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478]`}>Carregando…</div>
                        ) : !linhas.length ? (
                            <div className={`${CARTAO} flex flex-col items-center gap-3 p-8 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]`}>
                                <span>Nenhum contracheque nesta folha ainda.</span>
                                {aberta ? (
                                    <button type="button" className={BTN_PRI} onClick={abrirImp}>
                                        <IconUpload size={18} /> Importar contracheques do Domínio
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <div className={`${CARTAO} overflow-hidden`}>
                                <div className={`hidden bg-[#F6F8FB] px-4 py-2.5 text-right text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF] ${GRADE_TABELA}`}>
                                    <span className="text-left">Colaborador</span>
                                    <span>Contracheque</span>
                                    <span>Extra</span>
                                    <span>Bônus</span>
                                    <span>
                                        Ajuste
                                        <br />
                                        manual
                                    </span>
                                    <span>Vales</span>
                                    <span>A pagar</span>
                                    <span className="text-left">Forma</span>
                                </div>
                                {filtradas.map((l) => (
                                    <div key={l.colaborador_id} className={`grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-[#E3E8F0] px-4 py-3 text-[14px] first:border-t-0 dark:border-white/[0.08] lg:first:border-t ${GRADE_TABELA}`}>
                                        <div className="col-span-2 mb-1 min-w-0 lg:col-span-1 lg:mb-0">
                                            <b className="block break-words">{l.nome}</b>
                                            <span className="block text-[12px] text-[#5B6478] dark:text-[#AEB9CF]">{[l.funcao, l.equipe].filter(Boolean).join(' · ')}</span>
                                            {l.avisos.length ? (
                                                <span className={`${SELO} ${S_AVISO} mt-1`} title={l.avisos.join(' · ')}>
                                                    <IconAlertTriangle size={12} /> {l.avisos[0]}
                                                    {l.avisos.length > 1 ? ` +${l.avisos.length - 1}` : ''}
                                                </span>
                                            ) : null}
                                        </div>
                                        <Celula rotulo="Contracheque" valor={l.liquido} onClick={() => void abrirDet(l, 'contracheque')} />
                                        <Celula rotulo="Extra" valor={l.extra} onClick={() => void abrirDet(l, 'bonus')} />
                                        <Celula rotulo="Bônus" valor={l.bonus} onClick={() => void abrirDet(l, 'bonus')} />
                                        <Celula rotulo="Ajuste manual" valor={l.ajuste} negativo onClick={() => void abrirDet(l, 'ajuste')} />
                                        <Celula rotulo="Vales" valor={l.descontos} negativo onClick={() => void abrirDet(l, 'vales')} />
                                        <Celula rotulo="A pagar" valor={l.a_pagar} forte onClick={() => void abrirDet(l, 'contracheque')} />
                                        <span className="col-span-2 flex items-center gap-1.5 lg:col-span-1">
                                            {l.forma_pagamento ? (
                                                <span className={`${SELO} ${S_MUDO}`}>{l.forma_pagamento === 'PIX' ? 'Pix' : 'Transferência'}</span>
                                            ) : (
                                                <span className={`${SELO} ${S_AVISO}`}>Sem forma</span>
                                            )}
                                            {l.saldo_negativo ? <span className={`${SELO} bg-[#FDECEA] text-[#B42318] dark:bg-[#FF9C92]/10 dark:text-[#FF9C92]`}>deve {brl(l.saldo_negativo)}</span> : null}
                                        </span>
                                    </div>
                                ))}
                                {totais ? (
                                    <div className={`grid grid-cols-2 gap-x-3 border-t-2 border-[#C9D1DE] bg-[#F6F8FB] px-4 py-3 text-right text-[14px] font-extrabold tabular-nums dark:border-white/[0.2] dark:bg-[#1C2334] ${GRADE_TABELA}`}>
                                        <span className="col-span-2 text-left lg:col-span-1">Total</span>
                                        <span className="hidden lg:block">{brl(totais.liquido)}</span>
                                        <span className="hidden lg:block">{brl(totais.extra)}</span>
                                        <span className="hidden lg:block">{brl(totais.bonus)}</span>
                                        <span className="hidden lg:block">{sinal(totais.ajuste)}</span>
                                        <span className="hidden lg:block">{sinal(totais.descontos)}</span>
                                        <span className="col-span-2 lg:col-span-1">{brl(totais.a_pagar)}</span>
                                        <span className="hidden lg:block" />
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                ) : null}

                {/* ============================== Lançar na Unymos ============================== */}
                {aba === 'unymos' ? (
                    <div className="flex flex-col gap-3">
                        <div className={NOTA}>
                            <span>
                                A Unymos não recebe lançamentos automáticos. Depois de aprovar, lance cada item abaixo no contas a pagar da Unymos e marque como lançado. A folha vai como um título só, com o rateio por equipe; os vales já estão lá (adiantamento de salário).
                            </span>
                        </div>
                        {!integ.length ? (
                            <div className={`${CARTAO} p-6 text-center text-[14px] text-[#5B6478] dark:text-[#AEB9CF]`}>Os lançamentos aparecem aqui quando a folha for aprovada.</div>
                        ) : (
                            integ.map((i) => (
                                <section key={i.id} className={`${CARTAO} flex flex-col gap-2 p-4`}>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <b className="min-w-0 flex-1 break-words text-[15.5px]">{i.descricao}</b>
                                        <span className={`${SELO} ${i.situacao === 'PENDENTE' ? S_AVISO : S_OK}`}>{i.situacao === 'PENDENTE' ? 'Pendente' : 'Lançado na Unymos'}</span>
                                    </div>
                                    <div className="grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2">
                                        <span>
                                            <span className="text-[#5B6478] dark:text-[#AEB9CF]">Valor:</span> <b className="tabular-nums">{brl(i.valor)}</b>
                                        </span>
                                        <span>
                                            <span className="text-[#5B6478] dark:text-[#AEB9CF]">Vencimento:</span> {dataBR(i.vencimento) || 'a definir'}
                                        </span>
                                        <span>
                                            <span className="text-[#5B6478] dark:text-[#AEB9CF]">Favorecido:</span> {i.favorecido}
                                        </span>
                                        <span>
                                            <span className="text-[#5B6478] dark:text-[#AEB9CF]">Natureza na Unymos:</span> {i.natureza_unymos || i.natureza}
                                        </span>
                                    </div>
                                    {i.rateio?.length ? (
                                        <div className="rounded-xl bg-[#F6F8FB] p-3 text-[13.5px] dark:bg-[#1C2334]">
                                            <div className={`${ROTULO_SECAO} mb-1`}>Rateio por equipe</div>
                                            {i.rateio.map((r) => (
                                                <div key={r.equipe} className="flex justify-between gap-3 tabular-nums">
                                                    <span>{r.equipe}</span>
                                                    <b>{brl(r.valor)}</b>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                    <div className="flex flex-wrap gap-2">
                                        {i.situacao === 'PENDENTE' ? (
                                            <button type="button" className={BTN_PEQ} onClick={() => setMarcar({ item: i, ref: '' })}>
                                                <IconCheck size={16} /> Marcar lançado
                                            </button>
                                        ) : (
                                            <button type="button" className={BTN_PEQ} disabled={salvando} onClick={() => void confirmarMarcar(i, false)}>
                                                Voltar para pendente
                                            </button>
                                        )}
                                        {i.ref_externa ? <span className="self-center text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">título na Unymos: {i.ref_externa}</span> : null}
                                    </div>
                                </section>
                            ))
                        )}
                    </div>
                ) : null}

                {/* ============================== Folhas anteriores ============================== */}
                {aba === 'anteriores' ? (
                    <div className={`${CARTAO} overflow-hidden`}>
                        {!hist.length ? <div className="p-6 text-center text-[14px] text-[#5B6478]">Nenhuma folha registrada no sistema ainda.</div> : null}
                        {hist.map((h) => (
                            <button
                                key={h.competencia}
                                type="button"
                                onClick={() => {
                                    setComp(h.competencia);
                                    setAba('folha');
                                }}
                                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#E3E8F0] px-4 py-3 text-left text-[14px] first:border-t-0 hover:bg-[#F6F8FB] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                            >
                                <b className="min-w-[170px] flex-1">{mesBR(h.competencia)}</b>
                                <span className={`${SELO} ${SITUACAO[h.situacao as Folha['situacao']]?.[1] || S_MUDO}`}>{SITUACAO[h.situacao as Folha['situacao']]?.[0] || h.situacao}</span>
                                <span className="w-28 text-[13px] text-[#5B6478] dark:text-[#AEB9CF]">{h.data_pagamento ? `paga ${dataBR(h.data_pagamento)}` : ''}</span>
                                <b className="w-32 text-right tabular-nums">{Number(h.total_pagar) ? brl(h.total_pagar) : '—'}</b>
                                <IconChevronRight size={18} className="text-[#7A8396]" />
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>

            {/* ============================== Detalhe do colaborador ============================== */}
            {det && linhaDet ? (
                <Janela titulo={linhaDet.nome} sub={`${mesBR(comp)} · a pagar ${brl(linhaDet.a_pagar)}`} onFechar={fecharDet} largura="max-w-3xl">
                    <div className="flex flex-col gap-4">
                        <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto [scrollbar-width:none]">
                            {(
                                [
                                    ['contracheque', 'Contracheque'],
                                    ['bonus', 'Extra e bônus'],
                                    ['ajuste', 'Ajuste manual'],
                                    ['vales', 'Vales e descontos'],
                                ] as [AbaDet, string][]
                            ).map(([k, l]) => (
                                <button
                                    key={k}
                                    type="button"
                                    role="tab"
                                    aria-selected={det.aba === k}
                                    onClick={() => setDet({ ...det, aba: k })}
                                    className={`min-h-11 shrink-0 rounded-xl px-3.5 text-[14px] font-extrabold ${det.aba === k ? 'bg-[#313C55] text-white dark:bg-[#3D6A99]' : 'bg-[#F1F4F8] text-[#313C55] dark:bg-white/[0.08] dark:text-white'}`}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>

                        {/* resumo da linha */}
                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F6F8FB] p-3 text-[13.5px] tabular-nums dark:bg-[#1C2334] sm:grid-cols-3">
                            <span>Contracheque <b className="block text-[15px]">{brl(linhaDet.liquido)}</b></span>
                            <span>Extra + bônus <b className="block text-[15px]">{brl(linhaDet.extra + linhaDet.bonus)}</b></span>
                            <span>Ajuste manual <b className="block text-[15px]">{sinal(linhaDet.ajuste)}</b></span>
                            <span>Vales e descontos <b className="block text-[15px]">{sinal(linhaDet.descontos)}</b></span>
                            <span>A pagar <b className="block text-[15px]">{brl(linhaDet.a_pagar)}</b></span>
                            <span>
                                Pagamento
                                <b className="block break-words text-[13.5px]">
                                    {linhaDet.forma_pagamento === 'PIX' ? `Pix · ${linhaDet.pix || 'sem chave'}` : linhaDet.forma_pagamento === 'TRANSFERENCIA' ? linhaDet.conta || 'conta não cadastrada' : 'escolher no cadastro'}
                                </b>
                            </span>
                        </div>

                        {det.aba === 'contracheque' ? (
                            !detDados ? (
                                <div className="text-[14px] text-[#5B6478]">Carregando…</div>
                            ) : !detDados.contracheque ? (
                                <div className={NOTA}>Sem contracheque importado para esta pessoa neste mês.</div>
                            ) : (
                                <div className="overflow-hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                    <div className="max-h-[320px] overflow-y-auto">
                                        <div className="sticky top-0 grid grid-cols-[52px_minmax(0,1fr)_70px_96px_96px] gap-2 bg-[#F6F8FB] px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                                            <span>Cód.</span>
                                            <span>Descrição</span>
                                            <span className="text-right">Ref.</span>
                                            <span className="text-right">Vencimento</span>
                                            <span className="text-right">Desconto</span>
                                        </div>
                                        {detDados.rubricas.map((r, i) => (
                                            <div key={i} className="grid grid-cols-[52px_minmax(0,1fr)_70px_96px_96px] gap-2 border-t border-[#E3E8F0] px-3 py-2 text-[13px] tabular-nums dark:border-white/[0.08]">
                                                <span className="text-[#5B6478] dark:text-[#AEB9CF]">{r.codigo}</span>
                                                <span className="min-w-0">
                                                    <span className="block break-words">{r.descricao}</span>
                                                    {r.natureza ? <span className="block text-[11.5px] text-[#5B6478] dark:text-[#AEB9CF]">{r.natureza}{r.trata_como && r.trata_como !== 'DESPESA' ? ` · ${r.trata_como === 'REPASSE' ? 'repasse' : 'informativo'}` : ''}</span> : null}
                                                </span>
                                                <span className="text-right">{r.referencia || ''}</span>
                                                <span className="text-right">{r.vencimento ? brl(r.vencimento) : ''}</span>
                                                <span className="text-right">{r.desconto ? brl(r.desconto) : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 border-t-2 border-[#C9D1DE] bg-[#F6F8FB] px-3 py-2.5 text-[13.5px] tabular-nums dark:border-white/[0.2] dark:bg-[#1C2334]">
                                        <span>Vencimentos <b className="block">{brl(detDados.contracheque.total_vencimentos)}</b></span>
                                        <span>Descontos <b className="block">{brl(detDados.contracheque.total_descontos)}</b></span>
                                        <span>Líquido <b className="block">{brl(detDados.contracheque.liquido)}</b></span>
                                    </div>
                                </div>
                            )
                        ) : null}

                        {det.aba === 'bonus' ? (
                            <>
                                <div className="overflow-hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                    {itensDe(['EXTRA', 'QUANTIDADE', 'BONUS']).length ? (
                                        itensDe(['EXTRA', 'QUANTIDADE', 'BONUS']).map((i, k) => (
                                            <div key={k} className="flex items-center gap-3 border-t border-[#E3E8F0] px-3 py-2.5 text-[14px] first:border-t-0 dark:border-white/[0.08]">
                                                <span className="min-w-0 flex-1">
                                                    <b className="block">{i.tipo === 'EXTRA' ? 'Extra' : i.tipo === 'QUANTIDADE' ? 'Bônus · tanatopraxia' : i.auto ? 'Bônus fixo' : 'Bônus do mês'}</b>
                                                    <span className="block break-words text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{i.descricao}</span>
                                                </span>
                                                <b className="tabular-nums">{brl(i.valor)}</b>
                                                {aberta && i.id && !i.auto ? (
                                                    <button type="button" aria-label="Tirar" className="grid size-10 place-items-center rounded-xl text-[#5B6478] hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]" disabled={salvando} onClick={() => void tirar(i.id!)}>
                                                        <IconTrash size={18} />
                                                    </button>
                                                ) : null}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="px-3 py-3 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Sem extra nem bônus neste mês.</div>
                                    )}
                                </div>
                                {detDados?.tanatopraxias?.length ? (
                                    <div>
                                        <div className={`${ROTULO_SECAO} mb-1.5`}>Tanatopraxias no mês ({detDados.tanatopraxias.length})</div>
                                        <div className="max-h-[200px] overflow-y-auto rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                            {detDados.tanatopraxias.map((t) => (
                                                <div key={t.atendimento_id} className="flex gap-3 border-t border-[#E3E8F0] px-3 py-2 text-[13.5px] first:border-t-0 dark:border-white/[0.08]">
                                                    <span className="w-20 tabular-nums">{dataBR(t.data)}</span>
                                                    <span className="min-w-0 flex-1 break-words">{t.falecido}</span>
                                                    <span className="text-[#5B6478] dark:text-[#AEB9CF]">#{t.atendimento_id}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                {aberta ? (
                                    <div className="grid gap-3 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.08] sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-end">
                                        <Campo rotulo="Bônus do mês">
                                            <input className={CAMPO} inputMode="decimal" placeholder="R$ 0,00" value={novoBonus.valor} onChange={(e) => setNovoBonus({ ...novoBonus, valor: e.target.value })} />
                                        </Campo>
                                        <Campo rotulo="Motivo">
                                            <input className={CAMPO} maxLength={200} value={novoBonus.motivo} onChange={(e) => setNovoBonus({ ...novoBonus, motivo: e.target.value })} />
                                        </Campo>
                                        <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void lancar('BONUS')}>
                                            <IconPlus size={18} /> Lançar
                                        </button>
                                    </div>
                                ) : null}
                            </>
                        ) : null}

                        {det.aba === 'ajuste' ? (
                            <>
                                <div className="overflow-hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                    {itensDe(['AJUSTE']).length ? (
                                        itensDe(['AJUSTE']).map((i, k) => (
                                            <div key={k} className="flex items-center gap-3 border-t border-[#E3E8F0] px-3 py-2.5 text-[14px] first:border-t-0 dark:border-white/[0.08]">
                                                <span className="min-w-0 flex-1">
                                                    <b className="block break-words">{i.descricao}</b>
                                                    <span className="block text-[12.5px] text-[#5B6478] dark:text-[#AEB9CF]">{i.natureza}</span>
                                                </span>
                                                <b className={`tabular-nums ${i.valor < 0 ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}`}>{sinal(i.valor)}</b>
                                                {aberta && i.id ? (
                                                    <button type="button" aria-label="Tirar" className="grid size-10 place-items-center rounded-xl text-[#5B6478] hover:bg-[#EEF2F7] dark:hover:bg-white/[0.08]" disabled={salvando} onClick={() => void tirar(i.id!)}>
                                                        <IconTrash size={18} />
                                                    </button>
                                                ) : null}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="px-3 py-3 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Sem ajuste manual neste mês.</div>
                                    )}
                                </div>
                                {aberta ? (
                                    <div className="flex flex-col gap-3 rounded-xl border border-[#E3E8F0] p-3 dark:border-white/[0.08]">
                                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                                            <Campo rotulo="Justificativa" ajuda={justEscolhida ? `${justEscolhida.tipo === 'ACRESCIMO' ? 'Acréscimo' : 'Débito'} · ${justEscolhida.natureza}` : undefined}>
                                                <select
                                                    className={CAMPO}
                                                    value={novoAjuste.justificativa_id}
                                                    onChange={(e) => setNovoAjuste({ ...novoAjuste, justificativa_id: e.target.value === 'nova' ? 'nova' : e.target.value ? Number(e.target.value) : '' })}
                                                >
                                                    <option value="">Escolha…</option>
                                                    <optgroup label="Acréscimo">
                                                        {justs
                                                            .filter((j) => j.tipo === 'ACRESCIMO')
                                                            .map((j) => (
                                                                <option key={j.id} value={j.id}>
                                                                    {j.nome}
                                                                </option>
                                                            ))}
                                                    </optgroup>
                                                    <optgroup label="Débito">
                                                        {justs
                                                            .filter((j) => j.tipo === 'DEBITO')
                                                            .map((j) => (
                                                                <option key={j.id} value={j.id}>
                                                                    {j.nome}
                                                                </option>
                                                            ))}
                                                    </optgroup>
                                                    <option value="nova">Criar nova…</option>
                                                </select>
                                            </Campo>
                                            <Campo rotulo="Valor">
                                                <input className={CAMPO} inputMode="decimal" placeholder="R$ 0,00" value={novoAjuste.valor} onChange={(e) => setNovoAjuste({ ...novoAjuste, valor: e.target.value })} />
                                            </Campo>
                                        </div>
                                        {novoAjuste.justificativa_id === 'nova' ? (
                                            <div className="grid gap-3 rounded-xl bg-[#F6F8FB] p-3 dark:bg-[#1C2334] sm:grid-cols-3">
                                                <Campo rotulo="Nova justificativa">
                                                    <input className={CAMPO} maxLength={120} value={novaJust.nome} onChange={(e) => setNovaJust({ ...novaJust, nome: e.target.value })} />
                                                </Campo>
                                                <Campo rotulo="Tipo">
                                                    <select className={CAMPO} value={novaJust.tipo} onChange={(e) => setNovaJust({ ...novaJust, tipo: e.target.value })}>
                                                        <option value="">Escolha…</option>
                                                        <option value="ACRESCIMO">Acréscimo</option>
                                                        <option value="DEBITO">Débito</option>
                                                    </select>
                                                </Campo>
                                                <Campo rotulo="Natureza da DRE">
                                                    <input className={CAMPO} list="naturezas-folha" maxLength={80} value={novaJust.natureza} onChange={(e) => setNovaJust({ ...novaJust, natureza: e.target.value })} />
                                                    <datalist id="naturezas-folha">
                                                        {naturezas.map((n) => (
                                                            <option key={n} value={n} />
                                                        ))}
                                                    </datalist>
                                                </Campo>
                                            </div>
                                        ) : null}
                                        <Campo rotulo="Observação (opcional)">
                                            <input className={CAMPO} maxLength={150} value={novoAjuste.obs} onChange={(e) => setNovoAjuste({ ...novoAjuste, obs: e.target.value })} />
                                        </Campo>
                                        <button type="button" className={`${BTN_PRI} self-end`} disabled={salvando} onClick={() => void lancar('AJUSTE')}>
                                            <IconPlus size={18} /> Lançar ajuste
                                        </button>
                                    </div>
                                ) : null}
                            </>
                        ) : null}

                        {det.aba === 'vales' ? (
                            <div className="overflow-hidden rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                {itensDe(['VALE', 'EMPRESTIMO', 'DESCONTO']).length ? (
                                    itensDe(['VALE', 'EMPRESTIMO', 'DESCONTO']).map((i, k) => (
                                        <div key={k} className="flex items-center gap-3 border-t border-[#E3E8F0] px-3 py-2.5 text-[14px] first:border-t-0 dark:border-white/[0.08]">
                                            <span className="min-w-0 flex-1 break-words">{i.descricao}</span>
                                            <b className="tabular-nums text-[#B42318] dark:text-[#FF9C92]">{sinal(i.valor)}</b>
                                        </div>
                                    ))
                                ) : (
                                    <div className="px-3 py-3 text-[14px] text-[#5B6478] dark:text-[#AEB9CF]">Sem vales nem descontos nesta folha.</div>
                                )}
                                {linhaDet.saldo_negativo ? (
                                    <div className={`border-t border-[#E3E8F0] px-3 py-2.5 text-[13.5px] dark:border-white/[0.08] ${S_AVISO}`}>
                                        Os descontos passam do que há a receber: {brl(linhaDet.saldo_negativo)} vão como vale para a próxima folha quando esta for paga.
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {linhaDet.avisos.length ? (
                            <div className={NOTA}>
                                <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <span>{linhaDet.avisos.join(' · ')}</span>
                            </div>
                        ) : null}
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {/* ============================== Importar contracheques ============================== */}
            {imp ? (
                <Janela
                    titulo="Importar contracheques"
                    sub={`Folha de ${mesBR(comp).toLowerCase()}`}
                    onFechar={fecharImp}
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={fecharImp}>
                                Voltar
                            </button>
                            <button type="button" className={BTN_PRI} disabled={salvando || !impLido} onClick={() => void importar()}>
                                {salvando ? 'Importando…' : `Importar ${impLido?.recibos.length || ''}`}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <div className={NOTA}>
                            <span>
                                Use o RECIBOS do Domínio (folha mensal). Abra no Excel e salve como <b>.xlsx</b>. Importar de novo troca os contracheques desta folha.
                            </span>
                        </div>
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-dashed border-[#C9D1DE] bg-[#F6F8FB] p-4 dark:border-white/[0.2] dark:bg-[#1C2334]">
                            <IconFileSpreadsheet size={28} className="shrink-0" />
                            <span className="min-w-0 flex-1 text-[14px]">
                                <b className="block break-words">{impArq ? impArq.name : 'Escolher o arquivo .xlsx'}</b>
                                <span className="text-[#5B6478] dark:text-[#AEB9CF]">{impLido ? `${impLido.recibos.length} contracheque(s) · líquido ${brl(somaRecibos)}` : 'RECIBOS salvo como .xlsx'}</span>
                            </span>
                            <input type="file" accept=".xlsx" className="sr-only" onChange={(e) => void lerArquivo(e.target.files?.[0] || null)} />
                        </label>
                        {impLido?.competencia && impLido.competencia !== comp ? (
                            <div className={`${NOTA} ${S_AVISO}`}>
                                <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <span>
                                    O arquivo é de {mesBR(impLido.competencia).toLowerCase()} e a folha aberta é de {mesBR(comp).toLowerCase()}. Confira antes de importar.
                                </span>
                            </div>
                        ) : null}
                        {recibosComDiferenca.length ? (
                            <div className={`${NOTA} ${S_AVISO}`}>
                                <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <span>Vencimentos − descontos não bate com o líquido em: {recibosComDiferenca.map((r) => r.nome || r.codigo).join(', ')}.</span>
                            </div>
                        ) : null}
                        {impLido ? (
                            <div className="max-h-[260px] overflow-y-auto rounded-xl border border-[#E3E8F0] dark:border-white/[0.08]">
                                {impLido.recibos.map((r) => (
                                    <div key={r.codigo} className="flex gap-3 border-t border-[#E3E8F0] px-3 py-2 text-[13.5px] first:border-t-0 dark:border-white/[0.08]">
                                        <span className="w-12 text-[#5B6478] dark:text-[#AEB9CF]">{r.codigo}</span>
                                        <span className="min-w-0 flex-1 break-words">{r.nome}</span>
                                        <b className="tabular-nums">{brl(r.liq)}</b>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {/* ============================== Passos da folha ============================== */}
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
                            <button type="button" className={BTN_PRI} disabled={salvando || ((passo.acao === 'pagar' || passo.acao === 'conferir') && !passo.data)} onClick={() => void confirmarPasso()}>
                                {salvando ? 'Aguarde…' : TEXTO_PASSO[passo.acao][2]}
                            </button>
                        </>
                    }
                >
                    <div className="flex flex-col gap-4">
                        <p className="text-[15px] leading-snug">{TEXTO_PASSO[passo.acao][1]}</p>
                        {passo.acao === 'conferir' || passo.acao === 'pagar' ? (
                            <Campo rotulo="Data do pagamento" ajuda={passo.acao === 'conferir' ? 'Vales com data a partir deste dia ficam para a próxima folha.' : undefined}>
                                <input type="date" className={CAMPO} value={passo.data} onChange={(e) => setPasso({ ...passo, data: e.target.value })} />
                            </Campo>
                        ) : null}
                        {passo.acao === 'conferir' && comAviso ? (
                            <div className={`${NOTA} ${S_AVISO}`}>
                                <IconAlertTriangle size={18} className="mt-0.5 shrink-0" />
                                <span>{comAviso} linha(s) com aviso. Confira antes de seguir.</span>
                            </div>
                        ) : null}
                        {erroForm ? <div className={ERRO}>{erroForm}</div> : null}
                    </div>
                </Janela>
            ) : null}

            {/* ============================== Marcar lançado na Unymos ============================== */}
            {marcar ? (
                <Janela
                    titulo="Marcar lançado na Unymos"
                    sub={marcar.item.descricao}
                    onFechar={() => setMarcar(null)}
                    largura="max-w-md"
                    rodape={
                        <>
                            <button type="button" className={BTN_SEC} onClick={() => setMarcar(null)}>
                                Voltar
                            </button>
                            <button type="button" className={BTN_PRI} disabled={salvando} onClick={() => void confirmarMarcar(marcar.item, true, marcar.ref)}>
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
