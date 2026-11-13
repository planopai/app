'use client';

/**
 * Contas a receber (/contas-receber) — Financeiro da empresa, etapa 3 — 12/11/2026. Back-end: fin_receber.php e fin_cielo.php.
 * Origens: OS (particular, diferença e coroa), Prefeitura, Coroas do site (vêm sozinhas das OS e da página de Coroas) e avulsos.
 * Lista ou planilha (rolagem para o lado, colunas à escolha, total do filtro, exportar), paginação no servidor para o volume do Plano,
 * baixa individual ou em massa com multa 2% e juros 1% ao mês (com opção de não cobrar), cobrador e relatório de comissões,
 * Pix/transferência/boleto "a confirmar no banco", cartão a receber conferido com a Cielo, prorrogar e alterar direto (com histórico),
 * cancelamento, estorno e desconto com aprovação da Gestão.
 * 13/11/2026: tela enxuta (faixa de totais, filtros numa linha); o financeiro (página Tesouraria) usa a tela e a Gestão tem o menu
 * com Cartões e Cielo, Comissões e Configurações; cartão exige NSU; cheque; ISS retido; anexos; o título da OS é recebido aqui
 * pelo mesmo lançamento do Financeiro da OS (os_principal.php), que vira baixa no contas a receber.
 * 13/11/2026 (parte 2, fin_receber_acoes.php): negociar o saldo da OS em parcelas (a promissória da OS continua valendo),
 * Prefeitura por NF (mês em apuração → Emitir NF por empenho, com a alíquota do mês), avulso que repete todo mês,
 * recibo em PDF e pelo WhatsApp (número oficial) e, no menu Gestão, Atrasos por faixa e ISS das prefeituras.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    IconAdjustmentsDollar,
    IconArrowsSplit2,
    IconBrandWhatsapp,
    IconCash,
    IconChevronDown,
    IconColumns,
    IconClockExclamation,
    IconCreditCard,
    IconDownload,
    IconFileInvoice,
    IconFilter,
    IconPaperclip,
    IconPlus,
    IconPrinter,
    IconReceiptTax,
    IconRefresh,
    IconSearch,
    IconUpload,
    IconUsers,
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
    diaMais,
    diaMes,
    diaSemana,
    ERRO,
    hojeISO,
    Janela,
    mensagemErro,
    mesBR,
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
    SessaoExpirada,
    SUB,
    useAviso,
} from '../contas-pagar/components/fin';
import { OS_API, apiJson, osPost } from '../os/components/apiOS';
import { BarraMassa, baixarCsv, CaixaMarcar, ChipsFiltro, JanelaColunas, Paginacao, Planilha, TrocaModo, useColunas, type ColunaPlan } from '../contas-pagar/components/planilha';

const URL_REC = 'https://api.planoassistencialintegrado.com.br/fin_receber.php';
const URL_CIELO = 'https://api.planoassistencialintegrado.com.br/fin_cielo.php';
const URL_ACOES = 'https://api.planoassistencialintegrado.com.br/fin_receber_acoes.php';
const URL_RECIBO = (baixaId: number) => `${URL_ACOES}?action=recibo&formato=pdf&baixa_id=${baixaId}`;

/* ============================== tipos ============================== */

type Cad = {
    hoje: string;
    contas: { id: number; nome: string; tipo: string; banco: string | null }[];
    formas: { id: number; codigo: string; nome: string }[];
    cobradores: { id: number; nome: string; usuario_id: number | null; comissao_pct: number; rota: string | null; ativo: boolean }[];
    naturezas: { id: number; codigo: string; nome: string }[];
    areas: { id: number; nome: string }[];
    locais: { id: number; nome: string }[];
    clientes: { id: number; nome: string }[];
    usuarios: { id: number; nome: string }[];
    padrao: { multa_pct: number; juros_pct: number };
    gestao: boolean;
};
type Baixa = { id: number; data: string; conta: string; forma: string | null; valor_pago: number; juros: number; multa: number; desconto: number; confirmacao: string; cobrador: string | null };
type Linha = {
    id: number;
    pessoa: string | null;
    descricao: string;
    documento: string | null;
    referencia: string | null;
    origem: string;
    origem_id: number | null;
    da_os: boolean;
    emissao: string | null;
    competencia: string;
    vencimento: string;
    valor: number;
    parcela: string | null;
    situacao: 'PREVISTO' | 'ABERTO' | 'PAGO' | 'CANCELADO';
    forma_id: number | null;
    forma: string | null;
    cobrador_id: number | null;
    cobrador: string | null;
    comissao_pct: number | null;
    cobrar_encargos: boolean;
    multa_pct: number;
    juros_pct: number;
    natureza_id: number | null;
    natureza: string | null;
    area: string | null;
    recebido: number;
    multa_hoje: number;
    juros_hoje: number;
    atraso: number;
    baixa: Baixa | null;
    pedido: { tipo: string; motivo: string } | null;
    anexos: number;
    observacao: string | null;
    lancado_por: string | null;
    cancelado_motivo: string | null;
    negociacao_de?: number | null;
    nf?: { numero: string; iss: number } | null;
};
type Card = { n: number; v: number };
type Lista = {
    hoje: string;
    linhas: Linha[];
    pagina: number;
    pp: number;
    total: { n: number; valor: number; recebido: number; em_aberto: number };
    cards: Record<'vencidos' | 'hoje' | 'semana' | 'recebido_mes' | 'a_confirmar' | 'cartao', Card>;
    mes_fechado: boolean;
};
type Sit = 'aberto' | 'vencidos' | 'hoje' | 'semana' | 'previstos' | 'recebidos' | 'a_confirmar' | 'cancelados' | 'todos';
type FA = { td?: string; de?: string; ate?: string; pessoa_id?: string; natureza_id?: string; forma_id?: string; cobrador_id?: string; conta_id?: string; vmin?: string; vmax?: string };

const ORIGEM_NOME: Record<string, string> = { OS: 'OS', PREFEITURA: 'Prefeitura', COROA_SITE: 'Coroas do site', AVULSO: 'Avulso', MANUAL: 'Avulso', CONVENIO: 'Prefeitura · NF', RECORRENTE: 'Recorrente' };
const PEDIDO_NOME: Record<string, string> = { CANCELAMENTO: 'Cancelamento pedido', ESTORNO: 'Estorno pedido', DESCONTO: 'Desconto pedido' };
const ACAO_NOME: Record<string, string> = {
    incluiu: 'Lançado',
    recebeu: 'Recebido',
    prorrogou: 'Vencimento prorrogado',
    alterou: 'Alterado',
    pediu_cancelamento: 'Cancelamento pedido à Gestão',
    pediu_estorno: 'Estorno pedido à Gestão',
    pediu_desconto: 'Desconto pedido à Gestão',
    cancelou: 'Cancelado (aprovado pela Gestão)',
    estornou: 'Baixa estornada (aprovada pela Gestão)',
    desconto_aprovado: 'Desconto aprovado pela Gestão',
    recusou_cancelamento: 'Cancelamento recusado pela Gestão',
    recusou_estorno: 'Estorno recusado pela Gestão',
    recusou_desconto: 'Desconto recusado pela Gestão',
    atualizou_os: 'Atualizado pela OS',
    confirmou_banco: 'Confirmado no banco',
};
const CAMPO_NOME: Record<string, string> = { forma_id: 'forma', cobrador_id: 'cobrador', comissao_pct: 'comissão %', cobrar_encargos: 'cobrar multa e juros', observacao: 'observação', natureza_id: 'natureza', valor: 'valor', situacao: 'situação' };
const BANDEIRAS = ['Visa', 'Master', 'Elo', 'Amex', 'Hipercard'];
const URL_ANEXO = (id: number) => `${URL_REC}?action=anexo&id=${id}`;
const FORMAS_OS: [string, string][] = [
    ['PIX', 'Pix'],
    ['DINHEIRO', 'Dinheiro'],
    ['CARTAO_DEBITO', 'Cartão de débito'],
    ['CARTAO_CREDITO', 'Cartão de crédito'],
    ['TRANSFERENCIA', 'Transferência'],
    ['CHEQUE', 'Cheque'],
];
const ehCartao = (f: string) => f === 'CARTAO_DEBITO' || f === 'CARTAO_CREDITO';

/** Envia um anexo (nota, contrato, comprovante) para o título ou para a baixa. */
async function anexarArquivo(destino: { titulo_id?: number; baixa_id?: number }, arquivo: File) {
    const fd = new FormData();
    Object.entries(destino).forEach(([k, v]) => v && fd.append(k, String(v)));
    fd.append('arquivo', arquivo);
    const r = await fetch(`${URL_REC}?action=anexar`, { method: 'POST', credentials: 'include', body: fd });
    if (r.status === 401) throw new SessaoExpirada('Sessão expirada.');
    const j = await r.json().catch(() => null);
    if (!j || j.erro) throw new Error(j?.msg || 'Não foi possível anexar o arquivo.');
    return j;
}
const CANAIS: [string, string][] = [
    ['MAQUINA_ESCRITORIO', 'Máquina …423 · escritório'],
    ['MAQUINA_OS', 'Máquina …424 · OS'],
];

function sitDe(l: Linha, hoje: string): { txt: string; cls: string } {
    if (l.situacao === 'CANCELADO') return { txt: 'Cancelado', cls: S_MUDO };
    if (l.pedido) return { txt: PEDIDO_NOME[l.pedido.tipo] || 'Pedido na Gestão', cls: S_AVISO };
    if (l.situacao === 'PAGO') return l.baixa?.confirmacao === 'A_CONFIRMAR' ? { txt: 'Recebido · a confirmar', cls: S_AVISO } : { txt: 'Recebido', cls: S_OK };
    if (l.situacao === 'PREVISTO') return { txt: 'Previsto', cls: S_MUDO };
    if (l.recebido > 0) return { txt: 'Recebido em parte', cls: S_AB };
    if (l.vencimento < hoje) return { txt: 'Vencido', cls: S_RUIM };
    if (l.vencimento === hoje) return { txt: 'Vence hoje', cls: S_AVISO };
    return { txt: 'Em aberto', cls: S_AB };
}

/** Multa e juros (pró-rata) de um título vencido, na data do recebimento. Mesma conta do fin_receber.php. */
function encargos(l: Pick<Linha, 'valor' | 'vencimento' | 'multa_pct' | 'juros_pct'>, data: string) {
    const dias = Math.floor((Date.parse(data) - Date.parse(l.vencimento)) / 864e5);
    if (dias <= 0) return { multa: 0, juros: 0, dias: 0 };
    return { multa: Math.round(l.valor * l.multa_pct) / 100, juros: Math.round((l.valor * l.juros_pct) / 30 * dias) / 100, dias };
}

const MOD_NOME: Record<string, string> = { DEBITO: 'débito', CREDITO: 'crédito', PARCELADO: 'parcelado', PIX: 'Pix' };
const cartaoTxt = (bandeira: string | null | undefined, mod: string, parcelas = 1) => (mod === 'PIX' ? 'Pix' : `${bandeira || '—'} ${MOD_NOME[mod] || mod.toLowerCase()}${parcelas > 1 ? ` ${parcelas}x` : ''}`);
const SELECAO = 'h-11 min-w-0 rounded-xl border border-[#E3E8F0] bg-white px-3 text-[15px] dark:border-white/[0.12] dark:bg-[#232B3F]';
const comp = (c?: string | null) => (c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : '—');

/* ============================== página ============================== */

export default function ContasReceberPage() {
    const [cad, setCad] = useState<Cad | null>(null);
    const [d, setD] = useState<Lista | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [sit, setSit] = useState<Sit>('aberto');
    const [origem, setOrigem] = useState('');
    const [busca, setBusca] = useState('');
    const [buscaQ, setBuscaQ] = useState('');
    const [fa, setFa] = useState<FA>({});
    const [ordem, setOrdem] = useState('venc');
    const [pagina, setPagina] = useState(0);
    const [pp, setPp] = useState(100);
    const [modo, setModo] = useState<'lista' | 'planilha'>('lista');
    const [marc, setMarc] = useState<Map<number, Linha>>(new Map());
    const [janela, setJanela] = useState<
        | null
        | { k: 'receber'; linhas: Linha[] }
        | { k: 'acoes'; id: number; aba?: string }
        | { k: 'novo' }
        | { k: 'filtros' }
        | { k: 'colunas' }
        | { k: 'comissoes' }
        | { k: 'cartoes' }
        | { k: 'nf'; grupo: GrupoNf }
        | { k: 'iss' }
        | { k: 'atrasos' }
    >(null);
    const [versaoPref, setVersaoPref] = useState(0);
    const { avisar, aviso } = useAviso();
    const [menuG, setMenuG] = useState(false);
    const gestao = !!cad?.gestao;

    useEffect(() => {
        const t = setTimeout(() => setBuscaQ(busca.trim()), 350);
        return () => clearTimeout(t);
    }, [busca]);

    const carregarCad = useCallback(async () => {
        try {
            const j = await api(URL_REC, 'cadastros');
            setCad(j.dados);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar os cadastros.');
            if (m) setErro(m);
        }
    }, []);
    useEffect(() => {
        void carregarCad();
    }, [carregarCad]);

    const query = useCallback(
        (extra: Record<string, string | number> = {}) => {
            const p = new URLSearchParams();
            p.set('sit', sit);
            if (origem) p.set('origem', origem);
            if (buscaQ) p.set('busca', buscaQ);
            Object.entries(fa).forEach(([k, v]) => {
                if (v) p.set(k, String(v));
            });
            p.set('ordem', ordem);
            p.set('pagina', String(pagina));
            p.set('pp', String(pp));
            Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)));
            return '&' + p.toString();
        },
        [sit, origem, buscaQ, fa, ordem, pagina, pp],
    );

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const j = await api(URL_REC, 'lista', undefined, query());
            setD(j.dados);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar o contas a receber.');
            if (m) setErro(m);
        } finally {
            setCarregando(false);
        }
    }, [query]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    // mudar o filtro volta para a primeira página e limpa a seleção
    useEffect(() => {
        setPagina(0);
        setMarc(new Map());
    }, [sit, origem, buscaQ, fa, ordem, pp]);

    const hoje = d?.hoje || hojeISO();
    const linhas = d?.linhas ?? [];
    const modoConfirmar = sit === 'a_confirmar';
    const selecionavel = useCallback(
        (l: Linha) => (modoConfirmar ? l.situacao === 'PAGO' && l.baixa?.confirmacao === 'A_CONFIRMAR' : l.situacao === 'ABERTO' && !l.da_os && !l.pedido),
        [modoConfirmar],
    );
    const marcar = (ids: number[], on: boolean) => {
        setMarc((m) => {
            const n = new Map(m);
            ids.forEach((id) => {
                const l = linhas.find((x) => x.id === id);
                if (on && l) n.set(id, l);
                else n.delete(id);
            });
            return n;
        });
    };
    const [selTudoOcupado, setSelTudoOcupado] = useState(false);
    const selecionarFiltro = async () => {
        setSelTudoOcupado(true);
        try {
            const j = await api(URL_REC, 'lista', undefined, query({ tudo: 1, pagina: 0 }));
            const n = new Map<number, Linha>();
            (j.dados.linhas as Linha[]).filter(selecionavel).forEach((l) => n.set(l.id, l));
            setMarc(n);
            avisar(`${n.size} título(s) marcados no filtro.`);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível marcar o filtro.');
            if (m) setErro(m);
        } finally {
            setSelTudoOcupado(false);
        }
    };
    const exportar = async () => {
        try {
            const j = await api(URL_REC, 'lista', undefined, query({ tudo: 1, pagina: 0 }));
            baixarCsv(`contas-a-receber-${hoje}.csv`, { rotulo: 'Cliente · descrição', texto: (l: Linha) => `${l.pessoa ? l.pessoa + ' · ' : ''}${l.descricao}` }, COLUNAS, cols.vis, j.dados.linhas);
            avisar(`Planilha baixada com ${j.dados.linhas.length} título(s).`);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível exportar.');
            if (m) setErro(m);
        }
    };
    const confirmarBanco = async () => {
        const ids = Array.from(marc.values())
            .map((l) => l.baixa?.id)
            .filter(Boolean);
        try {
            const j = await api(URL_REC, 'confirmar_banco', { baixa_ids: ids });
            avisar(j.msg);
            setMarc(new Map());
            void carregar();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível confirmar.');
            if (m) setErro(m);
        }
    };

    const COLUNAS: ColunaPlan<Linha>[] = useMemo(
        () => [
            { id: 'origem', rotulo: 'Origem', largura: 130, valor: (l) => ORIGEM_NOME[l.origem] || l.origem },
            { id: 'doc', rotulo: 'Documento · OS', largura: 130, valor: (l) => l.referencia || l.documento || '—' },
            { id: 'emis', rotulo: 'Emissão', largura: 110, padrao: false, valor: (l) => dataBR(l.emissao) || '—' },
            { id: 'comp', rotulo: 'Competência', largura: 125, valor: (l) => comp(l.competencia) },
            { id: 'venc', rotulo: 'Vencimento', largura: 120, valor: (l) => dataBR(l.vencimento) },
            { id: 'parc', rotulo: 'Parcela', largura: 80, valor: (l) => l.parcela || '—' },
            { id: 'valor', rotulo: 'Valor', largura: 120, num: true, valor: (l) => brl(l.valor), texto: (l) => l.valor },
            {
                id: 'enc',
                rotulo: 'Multa e juros hoje',
                largura: 135,
                num: true,
                valor: (l) => (l.multa_hoje + l.juros_hoje ? <span className="text-[#B42318] dark:text-[#FF9C92]">{brl(l.multa_hoje + l.juros_hoje)}</span> : '—'),
                texto: (l) => l.multa_hoje + l.juros_hoje,
            },
            { id: 'rec', rotulo: 'Recebido', largura: 120, num: true, valor: (l) => (l.recebido ? brl(l.recebido) : '—'), texto: (l) => l.recebido },
            {
                id: 'saldo',
                rotulo: 'Saldo',
                largura: 120,
                num: true,
                valor: (l) => (l.situacao === 'ABERTO' || l.situacao === 'PREVISTO' ? brl(Math.max(0, l.valor - l.recebido)) : '—'),
                texto: (l) => (l.situacao === 'ABERTO' || l.situacao === 'PREVISTO' ? Math.max(0, l.valor - l.recebido) : 0),
            },
            { id: 'forma', rotulo: 'Forma', largura: 150, valor: (l) => l.baixa?.forma || l.forma || '—' },
            { id: 'cobr', rotulo: 'Cobrador', largura: 150, valor: (l) => l.baixa?.cobrador || l.cobrador || '—' },
            { id: 'pct', rotulo: 'Comissão %', largura: 105, num: true, padrao: false, valor: (l) => (l.comissao_pct !== null ? `${numCampo(l.comissao_pct)}%` : '—') },
            { id: 'nat', rotulo: 'Natureza', largura: 210, valor: (l) => l.natureza || '—' },
            { id: 'area', rotulo: 'Área', largura: 190, padrao: false, valor: (l) => l.area || '—' },
            {
                id: 'sit',
                rotulo: 'Situação',
                largura: 180,
                valor: (l) => {
                    const s = sitDe(l, hoje);
                    return <span className={`${SELO} ${s.cls}`}>{s.txt}</span>;
                },
                texto: (l) => sitDe(l, hoje).txt,
            },
            { id: 'atraso', rotulo: 'Atraso', largura: 80, num: true, valor: (l) => (l.atraso ? `${l.atraso}d` : '—'), texto: (l) => l.atraso || '' },
            { id: 'recem', rotulo: 'Recebido em', largura: 120, valor: (l) => dataBR(l.baixa?.data) || '—' },
            { id: 'conta', rotulo: 'Entrou na conta', largura: 190, valor: (l) => l.baixa?.conta || '—' },
            { id: 'enc_pagos', rotulo: 'Multa e juros pagos', largura: 140, num: true, padrao: false, valor: (l) => (l.baixa && l.baixa.multa + l.baixa.juros ? brl(l.baixa.multa + l.baixa.juros) : '—'), texto: (l) => (l.baixa ? l.baixa.multa + l.baixa.juros : '') },
            { id: 'desc', rotulo: 'Desconto', largura: 110, num: true, padrao: false, valor: (l) => (l.baixa?.desconto ? brl(l.baixa.desconto) : '—'), texto: (l) => l.baixa?.desconto || '' },
            { id: 'anexos', rotulo: 'Anexos', largura: 80, num: true, padrao: false, valor: (l) => String(l.anexos || 0) },
            { id: 'por', rotulo: 'Lançado por', largura: 140, padrao: false, valor: (l) => l.lancado_por || (l.da_os ? 'automático' : '—') },
            { id: 'obs', rotulo: 'Observação', largura: 260, padrao: false, valor: (l) => l.observacao || l.cancelado_motivo || '—' },
        ],
        [hoje],
    );
    const cols = useColunas('pai_fin_receber_colunas', COLUNAS);

    const chips = useMemo(() => {
        const nome = (lista: { id: number; nome: string }[] | undefined, id?: string) => lista?.find((x) => String(x.id) === id)?.nome || id;
        const tira = (k: (keyof FA)[]) => () => setFa((f) => {
            const n = { ...f };
            k.forEach((x) => delete n[x]);
            return n;
        });
        const c: { rotulo: string; tirar: () => void }[] = [];
        const TD: Record<string, string> = { venc: 'Vencimento', emis: 'Emissão', comp: 'Competência', pago: 'Recebimento' };
        if (fa.de || fa.ate) c.push({ rotulo: `${TD[fa.td || 'venc']}${fa.de ? ` de ${dataBR(fa.de)}` : ''}${fa.ate ? ` até ${dataBR(fa.ate)}` : ''}`, tirar: tira(['de', 'ate', 'td']) });
        if (fa.pessoa_id) c.push({ rotulo: `Cliente: ${nome(cad?.clientes, fa.pessoa_id)}`, tirar: tira(['pessoa_id']) });
        if (fa.natureza_id) c.push({ rotulo: `Natureza: ${nome(cad?.naturezas, fa.natureza_id)}`, tirar: tira(['natureza_id']) });
        if (fa.forma_id) c.push({ rotulo: `Forma: ${nome(cad?.formas, fa.forma_id)}`, tirar: tira(['forma_id']) });
        if (fa.cobrador_id) c.push({ rotulo: `Cobrador: ${nome(cad?.cobradores, fa.cobrador_id)}`, tirar: tira(['cobrador_id']) });
        if (fa.conta_id) c.push({ rotulo: `Conta: ${nome(cad?.contas, fa.conta_id)}`, tirar: tira(['conta_id']) });
        if (fa.vmin) c.push({ rotulo: `Valor de ${fa.vmin}`, tirar: tira(['vmin']) });
        if (fa.vmax) c.push({ rotulo: `Valor até ${fa.vmax}`, tirar: tira(['vmax']) });
        return c;
    }, [fa, cad]);

    const grupos = useMemo(() => {
        const g: { dia: string; itens: Linha[] }[] = [];
        linhas.forEach((l) => {
            const u = g[g.length - 1];
            if (u && u.dia === l.vencimento) u.itens.push(l);
            else g.push({ dia: l.vencimento, itens: [l] });
        });
        return g;
    }, [linhas]);

    const cards = d?.cards;
    const faixa = (id: Sit, rotulo: string, c: Card | undefined, ruim = false) => {
        const on = sit === id;
        return (
            <button
                key={id}
                type="button"
                onClick={() => setSit(on ? 'aberto' : id)}
                aria-pressed={on}
                className={`flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-3 py-2.5 text-center transition ${
                    on ? 'border-[#313C55] bg-[#313C55] text-white dark:border-[#F2CB3F] dark:bg-[#F2CB3F] dark:text-[#313C55]' : 'border-[#E3E8F0] bg-white hover:border-[#313C55] dark:border-white/[0.12] dark:bg-[#232B3F]'
                }`}
            >
                <span className={`text-[11.5px] font-extrabold uppercase tracking-[0.06em] ${on ? 'opacity-80' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>{rotulo}</span>
                <span className={`text-[19px] font-extrabold leading-tight tabular-nums ${ruim && c?.n && !on ? 'text-[#B42318] dark:text-[#FF9C92]' : ''}`}>{brl(c?.v ?? 0)}</span>
                <span className={`text-[12px] ${on ? 'opacity-80' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}>{c?.n ?? 0} título(s)</span>
            </button>
        );
    };

    const botoesLinha = (l: Linha) => (
        <>
            {(selecionavel(l) || (l.da_os && l.situacao === 'ABERTO' && !l.pedido)) && !modoConfirmar ? (
                <button type="button" className={BTN_PEQ_PRI} onClick={() => setJanela({ k: 'receber', linhas: [l] })}>
                    Receber
                </button>
            ) : null}
            {l.origem === 'OS' && l.situacao === 'ABERTO' && !l.negociacao_de && !l.pedido && !modoConfirmar ? (
                <button type="button" className={BTN_PEQ} onClick={() => setJanela({ k: 'acoes', id: l.id, aba: 'negociar' })}>
                    Negociar
                </button>
            ) : null}
            <button type="button" className={BTN_PEQ} onClick={() => setJanela({ k: 'acoes', id: l.id })}>
                Mais
            </button>
        </>
    );

    const totalMarcado = Array.from(marc.values()).reduce((s, l) => s + (modoConfirmar ? l.baixa?.valor_pago ?? 0 : l.valor), 0);
    const feito = (m?: string) => {
        setJanela(null);
        if (m) avisar(m);
        setMarc(new Map());
        void carregar();
        setVersaoPref((v) => v + 1);
    };

    return (
        <div className="min-h-[100dvh] bg-[#F6F8FB] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#313C55] [contain:inline-size] dark:bg-[#161C2A] dark:text-white lg:pb-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                <TopoPagina
                    Icone={IconCash}
                    titulo="Contas a receber"
                    acoes={
                        <>
                            {gestao ? (
                                <div className="relative">
                                    <button type="button" className={`${BTN_SEC} w-full`} aria-expanded={menuG} onClick={() => setMenuG(!menuG)}>
                                        <IconAdjustmentsDollar size={18} /> Gestão <IconChevronDown size={16} />
                                    </button>
                                    {menuG ? (
                                        <div className="absolute right-0 top-[calc(100%+6px)] z-[30] flex w-[300px] flex-col overflow-hidden rounded-2xl border border-[#C9D1DE] bg-white shadow-xl dark:border-white/[0.15] dark:bg-[#232B3F]">
                                            {(
                                                [
                                                    [IconCreditCard, 'Cartões e Cielo', `${cards?.cartao.n ?? 0} parcela(s) a receber · ${brl(cards?.cartao.v ?? 0)}`, () => setJanela({ k: 'cartoes' })],
                                                    [IconUsers, 'Comissões de cobrança', 'relatório e cobradores', () => setJanela({ k: 'comissoes' })],
                                                    [IconClockExclamation, 'Atrasos por faixa', '1–30, 31–60, 61–90 e mais de 90 dias', () => setJanela({ k: 'atrasos' })],
                                                    [IconReceiptTax, 'ISS das prefeituras', 'alíquota do mês e quem retém', () => setJanela({ k: 'iss' })],
                                                ] as [React.ElementType, string, string, () => void][]
                                            ).map(([Ic, r, sub, act]) => (
                                                <button
                                                    key={r}
                                                    type="button"
                                                    className="flex min-h-14 items-center gap-3 border-t border-[#E3E8F0] px-4 py-2.5 text-left first:border-t-0 hover:bg-[#F6F8FB] dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                                                    onClick={() => {
                                                        setMenuG(false);
                                                        act();
                                                    }}
                                                >
                                                    <Ic size={20} />
                                                    <span className="min-w-0">
                                                        <b className="block text-[14.5px]">{r}</b>
                                                        <span className={SUB}>{sub}</span>
                                                    </span>
                                                </button>
                                            ))}
                                            <Link href="/financeiro-config" className="flex min-h-14 items-center gap-3 border-t border-[#E3E8F0] px-4 py-2.5 hover:bg-[#F6F8FB] dark:border-white/[0.08] dark:hover:bg-white/[0.04]">
                                                <IconAdjustmentsDollar size={20} />
                                                <span className="min-w-0">
                                                    <b className="block text-[14.5px]">Configurações do financeiro</b>
                                                    <span className={SUB}>contas, naturezas, áreas</span>
                                                </span>
                                            </Link>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                            <button type="button" className={BTN_PRI} disabled={!cad} onClick={() => setJanela({ k: 'novo' })}>
                                <IconPlus size={18} /> Novo título
                            </button>
                        </>
                    }
                />

                {erro ? <div className={ERRO}>{erro}</div> : null}
                {d?.mes_fechado ? <div className={`${NOTA} ${S_AVISO}`}>O mês atual está fechado: recebimentos dele estão travados até a Gestão reabrir.</div> : null}

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                    {faixa('vencidos', 'Vencidos', cards?.vencidos, true)}
                    {faixa('hoje', 'Vence hoje', cards?.hoje)}
                    {faixa('semana', 'Próximos 7 dias', cards?.semana)}
                    {faixa('recebidos', 'Recebido no mês', cards?.recebido_mes)}
                    {faixa('a_confirmar', 'A confirmar no banco', cards?.a_confirmar)}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-[#E3E8F0] bg-white px-3 dark:border-white/[0.12] dark:bg-[#232B3F] lg:w-72">
                        <IconSearch size={18} className="text-[#5B6478]" />
                        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, descrição, OS ou documento" aria-label="Buscar" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
                    </label>
                    <select className={`${SELECAO} flex-1 lg:w-56 lg:flex-none`} value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem">
                        <option value="">Todas as origens</option>
                        <option value="OS">OS (particular, diferença e coroa)</option>
                        <option value="PREFEITURA,CONVENIO">Prefeitura (OS a faturar e NF)</option>
                        <option value="COROA_SITE">Coroas do site</option>
                        <option value="AVULSO">Avulsos</option>
                    </select>
                    <select className={`${SELECAO} flex-1 lg:w-48 lg:flex-none`} value={sit} onChange={(e) => setSit(e.target.value as Sit)} aria-label="Situação">
                        <option value="aberto">Em aberto</option>
                        <option value="vencidos">Vencidos</option>
                        <option value="hoje">Vence hoje</option>
                        <option value="semana">Próximos 7 dias</option>
                        <option value="previstos">Previstos</option>
                        <option value="recebidos">Recebidos</option>
                        <option value="a_confirmar">A confirmar no banco</option>
                        <option value="cancelados">Cancelados</option>
                        <option value="todos">Todos</option>
                    </select>
                    <button type="button" className={`${BTN_PEQ} ${chips.length ? 'border-[#313C55] bg-[#E9EFF6] dark:bg-[#3D6A99]/25' : ''}`} onClick={() => setJanela({ k: 'filtros' })}>
                        <IconFilter size={18} /> Filtros{chips.length ? ` (${chips.length})` : ''}
                    </button>
                    <TrocaModo modo={modo} onModo={setModo} />
                    <button type="button" className={`${BTN_PEQ} lg:ml-auto`} onClick={() => void carregar()} aria-label="Atualizar">
                        <IconRefresh size={18} />
                    </button>
                </div>
                <ChipsFiltro chips={chips} onLimpar={() => setFa({})} />

                <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[15px]">{(d?.total.n ?? 0).toLocaleString('pt-BR')} título(s)</b>
                    <span className={`${SUB} font-bold`}>
                        {brl(d?.total.valor ?? 0)}
                        {d && d.total.recebido ? ` · recebido ${brl(d.total.recebido)}` : ''}
                        {d && d.total.em_aberto ? ` · em aberto ${brl(d.total.em_aberto)}` : ''}
                    </span>
                    <span className="flex-1" />
                    <select className="h-11 rounded-xl bg-white px-3 text-[15px] dark:bg-[#232B3F]" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordem">
                        <option value="venc">Ordem: vencimento</option>
                        <option value="valor">Ordem: maior valor</option>
                        <option value="cliente">Ordem: cliente</option>
                        <option value="recentes">Ordem: lançados por último</option>
                    </select>
                    <button type="button" className={BTN_PEQ} disabled={selTudoOcupado || !d?.total.n} onClick={() => void selecionarFiltro()}>
                        {modoConfirmar ? 'Marcar os do filtro' : 'Marcar os em aberto do filtro'}
                    </button>
                    {modo === 'planilha' ? (
                        <button type="button" className={BTN_PEQ} onClick={() => setJanela({ k: 'colunas' })}>
                            <IconColumns size={18} /> Colunas
                        </button>
                    ) : null}
                    <button type="button" className={BTN_PEQ} disabled={!d?.total.n} onClick={() => void exportar()}>
                        <IconDownload size={18} /> Exportar
                    </button>
                </div>

                {(origem === '' || origem === 'PREFEITURA,CONVENIO') && (sit === 'aberto' || sit === 'todos') && !buscaQ ? (
                    <PainelPrefeitura versao={versaoPref} onEmitir={(g) => setJanela({ k: 'nf', grupo: g })} />
                ) : null}

                {modo === 'planilha' ? (
                    <Planilha
                        colunas={COLUNAS}
                        vis={cols.vis}
                        linhas={linhas}
                        carregando={carregando}
                        fixa={{
                            rotulo: 'Cliente · descrição',
                            valor: (l) => (
                                <>
                                    <b className="line-clamp-2 break-words">{l.pessoa || l.descricao}</b>
                                    {l.pessoa ? <span className={`${SUB} line-clamp-1`}>{l.descricao}</span> : null}
                                </>
                            ),
                        }}
                        acoes={botoesLinha}
                        selecionavel={selecionavel}
                        marcados={new Set(marc.keys())}
                        onMarcar={marcar}
                        onLinha={(l) => setJanela({ k: 'acoes', id: l.id })}
                        rodape={
                            d
                                ? {
                                      rotulo: `Total do filtro · ${d.total.n.toLocaleString('pt-BR')}`,
                                      valores: { valor: brl(d.total.valor), rec: brl(d.total.recebido), saldo: brl(Math.max(0, d.total.em_aberto)) },
                                  }
                                : undefined
                        }
                    />
                ) : (
                    <div className={`${CARTAO} overflow-hidden`}>
                        {carregando && !d ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Carregando…</div> : null}
                        {d && !linhas.length ? <div className="px-4 py-8 text-center text-[15px] text-[#5B6478]">Nenhum título neste filtro.</div> : null}
                        {grupos.map((g) => {
                            const venc = g.dia < hoje && g.itens.some((t) => t.situacao === 'ABERTO');
                            return (
                                <div key={g.dia}>
                                    <div
                                        className={`flex items-center gap-2 border-t border-[#E3E8F0] px-4 pb-1.5 pt-3 text-[12px] font-extrabold uppercase tracking-[0.08em] first:border-t-0 dark:border-white/[0.08] ${venc ? 'text-[#B42318] dark:text-[#FF9C92]' : 'text-[#5B6478] dark:text-[#AEB9CF]'}`}
                                    >
                                        {diaSemana(g.dia)}, {diaMes(g.dia)}
                                        {g.dia === hoje ? ' · hoje' : venc ? ' · vencido' : ''}
                                        <span className="ml-auto">{brl(g.itens.reduce((s, t) => s + t.valor, 0))}</span>
                                    </div>
                                    {g.itens.map((l) => {
                                        const s = sitDe(l, hoje);
                                        const on = marc.has(l.id);
                                        return (
                                            <div
                                                key={l.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setJanela({ k: 'acoes', id: l.id })}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') setJanela({ k: 'acoes', id: l.id });
                                                }}
                                                className={`grid cursor-pointer grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-[#EEF2F7] px-3 py-3 hover:bg-[#F6F8FB] dark:border-white/[0.06] dark:hover:bg-white/[0.03] lg:grid-cols-[36px_minmax(0,1.6fr)_minmax(0,1.1fr)_130px_150px_auto] ${on ? 'bg-[#F2F6FB] dark:bg-[#2A3550]' : ''}`}
                                            >
                                                <span onClick={(e) => e.stopPropagation()}>{selecionavel(l) ? <CaixaMarcar on={on} rotulo="Marcar" onClick={() => marcar([l.id], !on)} /> : null}</span>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-extrabold">
                                                        <span className="break-words">{l.pessoa || l.descricao}</span>
                                                        <span className={`${SELO} ${S_AB}`}>{ORIGEM_NOME[l.origem] || l.origem}</span>
                                                    </div>
                                                    <div className={`${SUB} line-clamp-2 break-words`}>
                                                        {l.pessoa ? l.descricao : ''}
                                                        {l.parcela ? ` · parcela ${l.parcela}` : ''}
                                                        {l.cobrador ? ` · cobrador ${l.cobrador}` : ''}
                                                    </div>
                                                </div>
                                                <div className="text-right lg:hidden">
                                                    <div className="text-[16px] font-extrabold tabular-nums">{brl(l.situacao === 'PAGO' && l.baixa ? l.baixa.valor_pago : l.valor)}</div>
                                                    <span className={`${SELO} ${s.cls}`}>{s.txt}</span>
                                                </div>
                                                <div className="hidden min-w-0 text-[14px] lg:block">
                                                    <div className="line-clamp-1 font-bold">{l.natureza || '—'}</div>
                                                    <div className={`${SUB} line-clamp-1`}>{l.situacao === 'PAGO' && l.baixa ? `${l.baixa.forma || ''} · ${l.baixa.conta}` : l.forma || ''}</div>
                                                </div>
                                                <div className="hidden text-right lg:block">
                                                    <div className="text-[15px] font-extrabold tabular-nums">{brl(l.situacao === 'PAGO' && l.baixa ? l.baixa.valor_pago : l.valor)}</div>
                                                    {l.multa_hoje + l.juros_hoje ? <div className="text-[12.5px] font-bold text-[#B42318] dark:text-[#FF9C92]">+ {brl(l.multa_hoje + l.juros_hoje)}</div> : null}
                                                    {l.da_os && l.recebido && l.situacao === 'ABERTO' ? <div className={SUB}>recebido {brl(l.recebido)}</div> : null}
                                                </div>
                                                <div className="hidden lg:block">
                                                    <span className={`${SELO} ${s.cls}`}>{s.txt}</span>
                                                </div>
                                                <div className="col-span-3 flex justify-end gap-2 lg:col-span-1" onClick={(e) => e.stopPropagation()}>
                                                    {botoesLinha(l)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                )}

                {d ? <Paginacao pagina={pagina} pp={pp} total={d.total.n} onPagina={setPagina} onPp={setPp} /> : null}

                {marc.size ? (
                    <BarraMassa>
                        <b>{marc.size} marcado(s)</b>
                        <b className="text-[18px] tabular-nums">{brl(totalMarcado)}</b>
                        <span className="flex-1" />
                        <button type="button" className="h-11 rounded-xl bg-white/15 px-4 font-extrabold" onClick={() => setMarc(new Map())}>
                            Limpar
                        </button>
                        {modoConfirmar ? (
                            <button type="button" className="h-11 rounded-xl bg-[#F2CB3F] px-4 font-extrabold text-[#313C55]" onClick={() => void confirmarBanco()}>
                                Confirmar no banco
                            </button>
                        ) : (
                            <button type="button" className="h-11 rounded-xl bg-[#F2CB3F] px-4 font-extrabold text-[#313C55]" onClick={() => setJanela({ k: 'receber', linhas: Array.from(marc.values()) })}>
                                Receber {marc.size}
                            </button>
                        )}
                    </BarraMassa>
                ) : null}

                <div className={SUB}>
                    Os títulos das OS vêm sozinhos das OS fechadas e da página de Coroas. Receber aqui ou no Financeiro da OS é a mesma baixa. Mensalidades seguem na Unymos até o módulo do Plano. Nada é
                    apagado: cancelamento, estorno e desconto passam pela Gestão e ficam no histórico.
                </div>
            </div>

            {janela?.k === 'receber' && cad ? (
                janela.linhas.length === 1 && janela.linhas[0].da_os ? (
                    <ReceberOS linha={janela.linhas[0]} hoje={hoje} onFechar={() => setJanela(null)} onFeito={feito} />
                ) : (
                    <Receber cad={cad} linhas={janela.linhas} hoje={hoje} onFechar={() => setJanela(null)} onFeito={feito} />
                )
            ) : null}
            {janela?.k === 'acoes' && cad ? (
                <Acoes
                    cad={cad}
                    id={janela.id}
                    hoje={hoje}
                    onFechar={() => setJanela(null)}
                    onMudou={(m) => {
                        avisar(m);
                        void carregar();
                    }}
                    onReceber={(l) => setJanela({ k: 'receber', linhas: [l] })}
                    linha={linhas.find((l) => l.id === janela.id) ?? null}
                    abaInicial={janela.aba}
                />
            ) : null}
            {janela?.k === 'novo' && cad ? (
                <Novo
                    cad={cad}
                    hoje={hoje}
                    onFechar={() => setJanela(null)}
                    onSalvo={(m) => {
                        feito(m);
                        void carregarCad();
                    }}
                />
            ) : null}
            {janela?.k === 'filtros' && cad ? (
                <Filtros
                    cad={cad}
                    fa={fa}
                    onFechar={() => setJanela(null)}
                    onAplicar={(f) => {
                        setFa(f);
                        setJanela(null);
                    }}
                />
            ) : null}
            {janela?.k === 'colunas' ? <JanelaColunas colunas={COLUNAS} vis={cols.vis} onMudar={cols.setVis} onPadrao={cols.voltarPadrao} onFechar={() => setJanela(null)} fixas="Cliente e Ações" /> : null}
            {janela?.k === 'comissoes' && cad ? <Comissoes cad={cad} onFechar={() => setJanela(null)} onCad={() => void carregarCad()} avisar={avisar} /> : null}
            {janela?.k === 'cartoes' ? <Cartoes onFechar={() => setJanela(null)} avisar={avisar} /> : null}
            {janela?.k === 'nf' ? <EmitirNf grupo={janela.grupo} hoje={hoje} onFechar={() => setJanela(null)} onFeito={feito} /> : null}
            {janela?.k === 'iss' ? <IssPrefeituras onFechar={() => setJanela(null)} onFeito={feito} /> : null}
            {janela?.k === 'atrasos' ? <Atrasos onFechar={() => setJanela(null)} onAbrir={(id) => setJanela({ k: 'acoes', id })} /> : null}
            {aviso}
        </div>
    );
}

/* ============================== peças ============================== */

function Campo({ rotulo, children, classe = '' }: { rotulo: string; children: React.ReactNode; classe?: string }) {
    return (
        <label className={`flex min-w-0 flex-col ${classe}`}>
            <span className={ROTULO}>{rotulo}</span>
            {children}
        </label>
    );
}

function Liga({ on, onClick, rotulo }: { on: boolean; onClick: () => void; rotulo: string }) {
    return (
        <label className="flex min-h-11 cursor-pointer items-center gap-1">
            <CaixaMarcar on={on} rotulo={rotulo} onClick={onClick} />
            <span className="text-[14.5px] font-bold">{rotulo}</span>
        </label>
    );
}

function Abas({ abas, aba, onAba }: { abas: [string, string][]; aba: string; onAba: (a: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {abas.map(([k, r]) => (
                <button key={k} type="button" className={PILULA(aba === k)} onClick={() => onAba(k)}>
                    {r}
                </button>
            ))}
        </div>
    );
}

function Tabela({ cab, linhas, num = [] }: { cab: string[]; linhas: React.ReactNode[][]; num?: number[] }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-[#E3E8F0] dark:border-white/[0.12]">
            <table className="w-full min-w-[640px] text-[13.5px]">
                <thead className="bg-[#F1F4F8] text-left text-[11.5px] font-extrabold uppercase tracking-[0.05em] text-[#5B6478] dark:bg-[#1C2334] dark:text-[#AEB9CF]">
                    <tr>
                        {cab.map((c, i) => (
                            <th key={i} className={`px-2.5 py-2 ${num.includes(i) ? 'text-right' : ''}`}>
                                {c}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {linhas.map((l, i) => (
                        <tr key={i} className="border-t border-[#EEF2F7] dark:border-white/[0.06]">
                            {l.map((c, j) => (
                                <td key={j} className={`px-2.5 py-2 ${num.includes(j) ? 'text-right tabular-nums' : ''}`}>
                                    {c}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ============================== receber (um ou vários) ============================== */

function Receber({ cad, linhas, hoje, onFechar, onFeito }: { cad: Cad; linhas: Linha[]; hoje: string; onFechar: () => void; onFeito: (m: string) => void }) {
    const um = linhas.length === 1 ? linhas[0] : null;
    const [data, setData] = useState(hoje);
    const [forma, setForma] = useState(um?.origem === 'CONVENIO' ? 'TRANSFERENCIA' : 'PIX');
    const [conta, setConta] = useState<number | ''>('');
    const [cobrarEnc, setCobrarEnc] = useState(um ? um.cobrar_encargos : true);
    const [multa, setMulta] = useState('');
    const [juros, setJuros] = useState('');
    const [mexeu, setMexeu] = useState(false);
    const [cobrador, setCobrador] = useState<number | ''>(um?.cobrador_id ?? '');
    const [canal, setCanal] = useState('MAQUINA_ESCRITORIO');
    const [bandeira, setBandeira] = useState('');
    const [parcelas, setParcelas] = useState(1);
    const [nsu, setNsu] = useState('');
    const [aut, setAut] = useState('');
    const [desc, setDesc] = useState<{ id: number; valor: number } | null>(null);
    const [usarDesc, setUsarDesc] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [chq, setChq] = useState({ banco: '', numero: '', bom: '' });
    const [iss, setIss] = useState(um?.nf?.iss ? numCampo(um.nf.iss) : '');
    const [arquivo, setArquivo] = useState<File | null>(null);
    const ehConvenio = !!um && (um.origem === 'PREFEITURA' || um.origem === 'CONVENIO');

    const cartao = forma === 'CARTAO_DEBITO' || forma === 'CARTAO_CREDITO';
    const contas = cad.contas.filter((c) => (forma === 'DINHEIRO' ? c.tipo === 'CAIXA' : c.tipo !== 'CAIXA'));
    useEffect(() => {
        const bb = cad.contas.find((c) => c.tipo === 'BANCO' && /brasil/i.test(c.nome) && !/rende/i.test(c.nome));
        const itau = cad.contas.find((c) => c.tipo === 'BANCO' && /ita[uú]/i.test(c.nome));
        setConta(forma === 'DINHEIRO' ? '' : cartao || um?.origem === 'CONVENIO' ? bb?.id ?? '' : forma === 'PIX' ? itau?.id ?? '' : (c => c?.id ?? '')(contas.find((c) => c.tipo === 'BANCO')));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [forma]);
    useEffect(() => {
        if (!um || mexeu) return;
        const e = encargos(um, data);
        setMulta(cobrarEnc ? numCampo(e.multa) : numCampo(0));
        setJuros(cobrarEnc ? numCampo(e.juros) : numCampo(0));
    }, [um, data, cobrarEnc, mexeu]);
    useEffect(() => {
        if (!um) return;
        void (async () => {
            try {
                const j = await api(URL_REC, 'titulo', undefined, `&id=${um.id}`);
                const p = (j.dados.pedidos as any[]).filter((x) => x.tipo === 'DESCONTO' && x.situacao === 'APROVADO' && !x.usado).pop();
                if (p) setDesc({ id: p.id, valor: p.valor });
            } catch {
                /* sem desconto */
            }
        })();
    }, [um]);

    const totalSem = linhas.reduce((s, l) => s + l.valor, 0);
    const totalEnc = um
        ? (paraNumero(multa) ?? 0) + (paraNumero(juros) ?? 0)
        : cobrarEnc
          ? linhas.reduce((s, l) => {
                const e = l.cobrar_encargos ? encargos(l, data) : { multa: 0, juros: 0 };
                return s + e.multa + e.juros;
            }, 0)
          : 0;
    const descV = um && desc && usarDesc ? desc.valor : 0;
    const issV = um ? paraNumero(iss) ?? 0 : 0;
    const total = Math.round((totalSem + totalEnc - descV - issV) * 100) / 100;

    const salvar = async () => {
        if (!conta) return setErro(forma === 'DINHEIRO' ? 'Escolha o caixa onde o dinheiro entrou.' : 'Escolha a conta onde o dinheiro entrou.');
        if (cartao && !um) return setErro('Cartão se recebe um por vez (cada venda tem o seu NSU).');
        if (cartao && !nsu.replace(/\D/g, '')) return setErro('Informe o NSU do comprovante do cartão.');
        if (cartao && !bandeira) return setErro('Escolha a bandeira do cartão.');
        if (forma === 'CHEQUE' && (!chq.numero.trim() || !chq.bom)) return setErro('Cheque: informe o número e o bom para.');
        setOcupado(true);
        setErro(null);
        try {
            const corpo: Record<string, unknown> = { ids: linhas.map((l) => l.id), data, forma, conta_id: conta, cobrar_encargos: cobrarEnc, cobrador_id: cobrador || null };
            if (um) {
                corpo.multa = paraNumero(multa) ?? 0;
                corpo.juros = paraNumero(juros) ?? 0;
                if (desc && usarDesc) {
                    corpo.desconto = desc.valor;
                    corpo.aprovacao_id = desc.id;
                }
                if (issV > 0) corpo.iss_retido = issV;
                if (forma === 'CHEQUE') {
                    corpo.cheque_banco = chq.banco;
                    corpo.cheque_numero = chq.numero;
                    corpo.cheque_bom_para = chq.bom;
                }
            }
            if (cartao) {
                corpo.canal = canal;
                corpo.bandeira = bandeira || null;
                corpo.parcelas = forma === 'CARTAO_CREDITO' ? parcelas : 1;
                if (um) {
                    corpo.nsu = nsu;
                    corpo.autorizacao = aut;
                }
            }
            const j = await api(URL_REC, 'receber', corpo);
            if (arquivo && j.dados?.baixa_ids?.[0]) {
                try {
                    await anexarArquivo({ baixa_id: j.dados.baixa_ids[0] }, arquivo);
                } catch (e: any) {
                    return onFeito(`${j.msg} O comprovante não foi anexado (${e?.message || 'erro'}): anexe pelo botão Mais.`);
                }
            }
            onFeito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível receber.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };

    return (
        <Janela
            titulo={um ? `Receber · ${um.pessoa || um.descricao}` : `Receber ${linhas.length} títulos`}
            sub={um ? `${um.descricao}${um.parcela ? ` · parcela ${um.parcela}` : ''} · vence ${dataBR(um.vencimento)}` : `${brl(totalSem)} sem multa e juros`}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={ocupado} onClick={() => void salvar()}>
                        Receber {brl(total)}
                    </button>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo rotulo="Data do recebimento">
                    <input type="date" className={CAMPO} value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
                </Campo>
                <Campo rotulo="Forma">
                    <select className={CAMPO} value={forma} onChange={(e) => setForma(e.target.value)}>
                        {cad.formas
                            .filter((f) => f.codigo !== 'DEBITO_AUTOMATICO' && (um || (!ehCartao(f.codigo) && f.codigo !== 'CHEQUE')))
                            .map((f) => (
                                <option key={f.codigo} value={f.codigo}>
                                    {f.nome}
                                </option>
                            ))}
                    </select>
                </Campo>
                <Campo rotulo={forma === 'DINHEIRO' ? 'Caixa' : 'Entrou na conta'}>
                    <select className={CAMPO} value={conta} onChange={(e) => setConta(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">Escolha</option>
                        {contas.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nome}
                            </option>
                        ))}
                    </select>
                </Campo>
            </div>
            {forma === 'PIX' || forma === 'TRANSFERENCIA' || forma === 'BOLETO' || forma === 'CHEQUE' ? (
                <div className={NOTA}>Fica como &quot;recebido · a confirmar no banco&quot; até o valor aparecer no extrato.</div>
            ) : null}
            {!um ? <div className={SUB}>Cartão e cheque se recebem um por vez: cada um tem o seu NSU ou número.</div> : null}
            {forma === 'CHEQUE' && um ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Campo rotulo="Número *">
                        <input className={CAMPO} value={chq.numero} onChange={(e) => setChq({ ...chq, numero: e.target.value })} />
                    </Campo>
                    <Campo rotulo="Bom para *">
                        <input type="date" className={CAMPO} value={chq.bom} onChange={(e) => setChq({ ...chq, bom: e.target.value })} />
                    </Campo>
                    <Campo rotulo="Banco do cheque">
                        <input className={CAMPO} value={chq.banco} onChange={(e) => setChq({ ...chq, banco: e.target.value })} />
                    </Campo>
                </div>
            ) : null}
            {ehConvenio ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Campo rotulo="ISS retido pelo tomador">
                        <input className={CAMPO} inputMode="decimal" value={iss} onChange={(e) => setIss(e.target.value)} placeholder="0,00" />
                    </Campo>
                    <div className={`${SUB} flex items-end`}>O título quita pelo valor cheio da NF; o ISS retido fica na baixa (relatório de ISS) e o banco recebe {brl(total)}.</div>
                </div>
            ) : null}
            {cartao ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Campo rotulo="Máquina" classe="col-span-2">
                        <select className={CAMPO} value={canal} onChange={(e) => setCanal(e.target.value)}>
                            {CANAIS.map(([k, r]) => (
                                <option key={k} value={k}>
                                    {r}
                                </option>
                            ))}
                        </select>
                    </Campo>
                    <Campo rotulo="Bandeira">
                        <select className={CAMPO} value={bandeira} onChange={(e) => setBandeira(e.target.value)}>
                            <option value="">Escolha</option>
                            {BANDEIRAS.map((b) => (
                                <option key={b}>{b}</option>
                            ))}
                        </select>
                    </Campo>
                    {forma === 'CARTAO_CREDITO' ? (
                        <Campo rotulo="Parcelas">
                            <select className={CAMPO} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>
                                        {n === 1 ? 'À vista' : `${n}x`}
                                    </option>
                                ))}
                            </select>
                        </Campo>
                    ) : null}
                    {um ? (
                        <>
                            <Campo rotulo="NSU / DOC *" classe="col-span-1">
                                <input className={CAMPO} value={nsu} inputMode="numeric" onChange={(e) => setNsu(e.target.value)} placeholder="do comprovante" />
                            </Campo>
                            <Campo rotulo="Autorização">
                                <input className={CAMPO} value={aut} onChange={(e) => setAut(e.target.value)} />
                            </Campo>
                        </>
                    ) : null}
                    <div className={`${SUB} col-span-2 sm:col-span-4`}>O NSU é obrigatório: é por ele que a venda é conferida no arquivo da Cielo. Vira cartão a receber, já sem a taxa.</div>
                </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo rotulo="Cobrador (comissão)" classe="sm:col-span-2">
                    <select className={CAMPO} value={cobrador} onChange={(e) => setCobrador(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">Sem cobrador</option>
                        {cad.cobradores
                            .filter((c) => c.ativo)
                            .map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome} ({numCampo(c.comissao_pct)}%)
                                </option>
                            ))}
                    </select>
                </Campo>
                <div className="flex items-end">
                    <Liga on={cobrarEnc} onClick={() => setCobrarEnc(!cobrarEnc)} rotulo="Cobrar multa e juros" />
                </div>
            </div>
            {um ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Campo rotulo={`Multa (${numCampo(um.multa_pct)}%)`}>
                        <input
                            className={CAMPO}
                            inputMode="decimal"
                            value={multa}
                            onChange={(e) => {
                                setMexeu(true);
                                setMulta(e.target.value);
                            }}
                        />
                    </Campo>
                    <Campo rotulo={`Juros (${numCampo(um.juros_pct)}% ao mês)`}>
                        <input
                            className={CAMPO}
                            inputMode="decimal"
                            value={juros}
                            onChange={(e) => {
                                setMexeu(true);
                                setJuros(e.target.value);
                            }}
                        />
                    </Campo>
                    {desc ? (
                        <div className="flex items-end">
                            <Liga on={usarDesc} onClick={() => setUsarDesc(!usarDesc)} rotulo={`Desconto aprovado ${brl(desc.valor)}`} />
                        </div>
                    ) : (
                        <div className={`${SUB} flex items-end`}>Desconto: peça pelo botão Mais (a Gestão aprova).</div>
                    )}
                </div>
            ) : (
                <div className={NOTA}>
                    Em massa a multa e os juros são calculados título a título pela data do recebimento{cobrarEnc ? ` (${brl(totalEnc)} no total)` : ' (desmarcado: não cobra)'}. Títulos de OS ou com pedido na
                    Gestão ficam de fora.
                </div>
            )}
            {um && forma !== 'DINHEIRO' ? (
                <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-dashed px-3 text-[14px] font-bold ${arquivo ? 'border-[#7BA11A]' : 'border-[#C9D1DE] dark:border-white/25'}`}>
                    <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                    <IconPaperclip size={18} />
                    {arquivo ? <span className="truncate">{arquivo.name}</span> : 'Anexar comprovante (opcional)'}
                </label>
            ) : null}
            <div className="flex items-center justify-between rounded-xl bg-[#F6F8FB] px-4 py-3 dark:bg-[#1C2334]">
                <span className="text-[14px] font-bold">
                    {brl(totalSem)}
                    {totalEnc ? ` + ${brl(totalEnc)} multa e juros` : ''}
                    {descV ? ` − ${brl(descV)} desconto` : ''}
                    {issV ? ` − ${brl(issV)} ISS retido` : ''}
                </span>
                <b className="text-[22px] tabular-nums">{brl(total)}</b>
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== mais ações / detalhe ============================== */

type Detalhe = {
    id: number;
    pessoa: { nome: string; documento: string | null; telefone: string | null } | null;
    descricao: string;
    documento: string | null;
    referencia: string | null;
    origem: string;
    origem_id: number | null;
    da_os: boolean;
    emissao: string | null;
    competencia: string;
    vencimento: string;
    valor: number;
    situacao: Linha['situacao'];
    forma_id: number | null;
    cobrador_id: number | null;
    comissao_pct: number | null;
    cobrar_encargos: boolean;
    multa_pct: number;
    juros_pct: number;
    observacao: string | null;
    cancelado_motivo: string | null;
    multa_hoje: number;
    juros_hoje: number;
    atraso: number;
    rateio: { natureza_id: number; natureza: string; area_id: number | null; valor: number }[];
    baixas: {
        id: number;
        data: string;
        conta: string;
        forma: string | null;
        valor_titulo: number;
        juros: number;
        multa: number;
        desconto: number;
        valor_pago: number;
        confirmacao: string;
        cobrador: string | null;
        por: string | null;
        em: string;
        estornado_em: string | null;
        estornado_por: string | null;
        estorno_motivo: string | null;
    }[];
    cartoes: { id: number; canal: string; nsu: string; bandeira: string | null; modalidade: string; parcela: string; data_venda: string; previsao: string | null; bruto: number; taxa: number | null; liquido: number | null; situacao: string }[];
    recebimentos_os: { forma: string; valor: number; data: string; estornado: boolean }[] | null;
    pedidos: { id: number; tipo: string; situacao: string; motivo: string; valor: number; pedido_em: string; decidido_em: string | null; pedido_por: string | null; decidido_por: string | null; usado: boolean }[];
    historico: { acao: string; dados: any; em: string; nome: string | null }[];
    pedido: { id: number; tipo: string; motivo: string } | null;
    os: { id: number; numero: string; status: string; valor_total: number; criada_em: string | null; assinada_em: string | null; financeiro_id: number | null; proposta: string | null; recebido: number } | null;
    anexos: { id: number; nome: string; comprovante: boolean; em: string }[];
};

function textoHistorico(h: Detalhe['historico'][number]): string {
    const d = h.dados || {};
    if (h.acao === 'recebeu') return `${brl(d.valor_pago)} · ${d.forma || ''} · ${d.conta || ''}${d.multa || d.juros ? ` (multa ${brl(d.multa)}, juros ${brl(d.juros)})` : ''}${d.desconto ? ` (desconto ${brl(d.desconto)})` : ''}${d.em_massa ? ' · em massa' : ''}`;
    if (h.acao === 'prorrogou') return `de ${dataBR(d.de)} para ${dataBR(d.para)}${d.motivo ? ` · ${d.motivo}` : ''}`;
    if (h.acao === 'alterou' || h.acao === 'atualizou_os')
        return Object.keys(d)
            .filter((k) => d[k] && typeof d[k] === 'object' && 'para' in d[k])
            .map((k) => CAMPO_NOME[k] || k)
            .join(', ');
    if (d.motivo) return String(d.motivo);
    if (h.acao === 'incluiu') return d.pelo ? `pela ${d.pelo}` : d.valor !== undefined ? brl(d.valor) : '';
    return '';
}

/** Recibo de um recebimento: PDF do servidor (sem Dompdf no servidor, abre a folha para imprimir). */
function abrirRecibo(baixaId: number) {
    window.open(URL_RECIBO(baixaId), '_blank', 'noopener');
}

type Extra = {
    negociacao: { mae_id: number; em: string; por: string | null; valor_os: number; parcelas: { id: number; parcela: string; vencimento: string; valor: number; situacao: string; recebido: number }[] } | null;
    pode_negociar: boolean;
    saldo: number;
    nf: { id: number; numero: string; empenho: string; emissao: string; competencia: string; convenio: string; aliquota: number; valor: number; iss: number; iss_retido: boolean; situacao: string; oss: { id: number; descricao: string; data: string; valor: number }[] } | null;
    baixas: { id: number; data: string; valor_pago: number }[];
    whatsapp: string;
};

function Acoes({
    cad,
    id,
    hoje,
    linha,
    onFechar,
    onMudou,
    onReceber,
    abaInicial,
}: {
    cad: Cad;
    id: number;
    hoje: string;
    linha: Linha | null;
    onFechar: () => void;
    onMudou: (m: string) => void;
    onReceber: (l: Linha) => void;
    abaInicial?: string;
}) {
    const [t, setT] = useState<Detalhe | null>(null);
    const [ex, setEx] = useState<Extra | null>(null);
    const [aba, setAba] = useState(abaInicial || 'resumo');
    const [ngN, setNgN] = useState(3);
    const [ngPrim, setNgPrim] = useState(diaMais(hoje, 30));
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [venc, setVenc] = useState('');
    const [motivo, setMotivo] = useState('');
    const [forma, setForma] = useState<number | ''>('');
    const [cobr, setCobr] = useState<number | ''>('');
    const [pct, setPct] = useState('');
    const [enc, setEnc] = useState(true);
    const [obs, setObs] = useState('');
    const [nat, setNat] = useState<number | ''>('');
    const [area, setArea] = useState<number | ''>('');
    const [valorDesc, setValorDesc] = useState('');

    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_REC, 'titulo', undefined, `&id=${id}`);
            const x: Detalhe = j.dados;
            setT(x);
            setVenc(x.vencimento);
            setForma(x.forma_id ?? '');
            setCobr(x.cobrador_id ?? '');
            setPct(x.comissao_pct !== null ? numCampo(x.comissao_pct) : '');
            setEnc(x.cobrar_encargos);
            setObs(x.observacao ?? '');
            setNat(x.rateio[0]?.natureza_id ?? '');
            setArea(x.rateio[0]?.area_id ?? '');
            const e2 = await api(URL_ACOES, 'extra', undefined, `&id=${id}`).catch(() => null);
            setEx(e2?.dados ?? null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível abrir o título.');
            if (m) setErro(m);
        }
    }, [id]);

    // negociação: parcelas iguais (a última acerta os centavos), uma por mês a partir do 1º vencimento
    const ngParcelas = useMemo(() => {
        const saldo = ex?.saldo ?? 0;
        const n = Math.max(1, ngN);
        const base = Math.floor((saldo / n) * 100) / 100;
        return Array.from({ length: n }, (_, i) => ({
            vencimento: mesMaisDia(ngPrim, i),
            valor: i === n - 1 ? Math.round((saldo - base * (n - 1)) * 100) / 100 : base,
        }));
    }, [ex?.saldo, ngN, ngPrim]);
    const negociar = async () => {
        setOcupado(true);
        setErro(null);
        try {
            const j = await api(URL_ACOES, 'negociar', { id, parcelas: ngParcelas });
            onMudou(j.msg);
            onFechar();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível negociar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const [enviandoWa, setEnviandoWa] = useState(false);
    const reciboWhats = async (baixaId: number) => {
        setEnviandoWa(true);
        setErro(null);
        try {
            const j = await api(URL_ACOES, 'recibo_whats', { baixa_id: baixaId });
            onMudou(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível enviar o recibo.');
            if (m) setErro(m);
        } finally {
            setEnviandoWa(false);
        }
    };
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const enviar = async (acao: string, corpo: Record<string, unknown>, voltar = true) => {
        setOcupado(true);
        setErro(null);
        try {
            const j = await api(URL_REC, acao, { id, ...corpo });
            onMudou(j.msg);
            setMotivo('');
            await carregar();
            if (voltar) setAba('resumo');
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível concluir.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };

    const aberto = t && (t.situacao === 'ABERTO' || t.situacao === 'PREVISTO');
    const abas: [string, string][] = t
        ? [
              ['resumo', 'Resumo'],
              ...((ex?.pode_negociar ? [['negociar', 'Negociar saldo']] : []) as [string, string][]),
              ...((aberto && !t.pedido ? [['prorrogar', 'Prorrogar']] : []) as [string, string][]),
              ...((t.situacao !== 'CANCELADO' ? [['cobranca', 'Cobrança'], ['natureza', 'Natureza']] : []) as [string, string][]),
              ...((aberto && !t.pedido ? [['cancelar', 'Cancelar']] : []) as [string, string][]),
              ...((t.situacao === 'ABERTO' && !t.da_os && !t.pedido ? [['desconto', 'Desconto']] : []) as [string, string][]),
              ...((t.situacao === 'PAGO' && !t.da_os && !t.pedido ? [['estorno', 'Estorno']] : []) as [string, string][]),
              ['anexos', `Anexos${t.anexos.length ? ` (${t.anexos.length})` : ''}`],
              ['historico', 'Histórico'],
          ]
        : [];
    const s = linha ? sitDe(linha, hoje) : null;

    return (
        <Janela
            titulo={t ? t.pessoa?.nome || t.descricao : 'Título'}
            sub={t ? `${t.descricao} · ${brl(t.valor)} · vence ${dataBR(t.vencimento)}` : 'Carregando…'}
            largura="max-w-3xl"
            onFechar={onFechar}
            rodape={
                t ? (
                    <>
                        <button type="button" className={BTN_SEC} onClick={onFechar}>
                            Voltar
                        </button>
                        {ex?.baixas.length ? (
                            <>
                                <button type="button" className={BTN_SEC} onClick={() => abrirRecibo(ex.baixas[0].id)}>
                                    <IconPrinter size={18} /> Recibo
                                </button>
                                <button type="button" className={BTN_SEC} disabled={enviandoWa} onClick={() => void reciboWhats(ex.baixas[0].id)}>
                                    <IconBrandWhatsapp size={18} /> {enviandoWa ? 'Enviando…' : 'Recibo no WhatsApp'}
                                </button>
                            </>
                        ) : null}
                        {t.da_os ? (
                            <Link href="/os/financeiro" className={BTN_SEC}>
                                Abrir no Financeiro da OS
                            </Link>
                        ) : null}
                        {linha && t.situacao === 'ABERTO' && !t.pedido ? (
                            <button type="button" className={BTN_PRI} onClick={() => onReceber(linha)}>
                                Receber
                            </button>
                        ) : null}
                    </>
                ) : null
            }
        >
            {!t && !erro ? <div className="py-6 text-center text-[#5B6478]">Carregando…</div> : null}
            {t ? (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        {s ? <span className={`${SELO} ${s.cls}`}>{s.txt}</span> : null}
                        <span className={`${SELO} ${S_AB}`}>{ORIGEM_NOME[t.origem] || t.origem}</span>
                        {t.atraso ? <span className={`${SELO} ${S_RUIM}`}>{t.atraso} dia(s) de atraso</span> : null}
                        <span className="ml-auto text-[24px] font-extrabold tabular-nums">{brl(t.valor)}</span>
                    </div>
                    <Abas abas={abas} aba={aba} onAba={setAba} />
                    {t.pedido ? <div className={`${NOTA} ${S_AVISO}`}>{PEDIDO_NOME[t.pedido.tipo] || 'Pedido'} · motivo: {t.pedido.motivo}. Está na aba Aprovações da Tesouraria, esperando a Gestão.</div> : null}

                    {aba === 'resumo' ? (
                        <>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px] lg:grid-cols-4">
                                <Info r="Vencimento" v={dataBR(t.vencimento)} />
                                <Info r="Competência" v={comp(t.competencia)} />
                                <Info r="Emissão" v={dataBR(t.emissao) || '—'} />
                                <Info r="Documento · OS" v={t.referencia || t.documento || '—'} />
                                <Info r="Natureza" v={t.rateio[0]?.natureza || '—'} />
                                <Info r="Cobrador" v={cad.cobradores.find((c) => c.id === t.cobrador_id)?.nome || '—'} />
                                <Info r="Multa e juros" v={t.cobrar_encargos ? `${numCampo(t.multa_pct)}% + ${numCampo(t.juros_pct)}% ao mês` : 'não cobra'} />
                                {t.pessoa?.documento ? <Info r="CPF/CNPJ" v={t.pessoa.documento} /> : null}
                            </div>
                            {t.multa_hoje + t.juros_hoje ? <div className={`${NOTA} ${S_RUIM}`}>Hoje: multa {brl(t.multa_hoje)} + juros {brl(t.juros_hoje)} = {brl(t.valor + t.multa_hoje + t.juros_hoje)}</div> : null}
                            {t.cancelado_motivo ? <div className={NOTA}>Cancelado: {t.cancelado_motivo}</div> : null}
                            {t.observacao ? <div className={NOTA}>{t.observacao}</div> : null}
                            {t.os ? (
                                <div className="flex flex-col gap-1.5">
                                    <div className={ROTULO}>Como este título nasceu</div>
                                    <div className={NOTA}>
                                        OS {t.os.numero} · total {brl(t.os.valor_total)} · {t.os.assinada_em ? `assinada em ${dataBR(t.os.assinada_em)}` : `aberta em ${dataBR(t.os.criada_em)}`}
                                        {t.os.status !== 'FECHADA' ? ` · situação ${t.os.status.toLowerCase().replace('_', ' ')}` : ''} · recebido até agora {brl(t.os.recebido)}. Cada recebimento lançado aqui ou no Financeiro da OS
                                        é uma baixa só.
                                    </div>
                                </div>
                            ) : null}
                            {ex?.negociacao ? (
                                <div className="flex flex-col gap-1.5">
                                    <div className={ROTULO}>Saldo negociado</div>
                                    <div className={NOTA}>
                                        <span>
                                            Negociado em {dataBR(ex.negociacao.em)}
                                            {ex.negociacao.por ? ` por ${ex.negociacao.por}` : ''} em {ex.negociacao.parcelas.length} parcela(s). A nota promissória assinada na OS continua valendo até o saldo zerar.
                                        </span>
                                    </div>
                                    <Tabela
                                        cab={['Parcela', 'Vencimento', 'Valor', 'Recebido', 'Situação']}
                                        num={[2, 3]}
                                        linhas={ex.negociacao.parcelas.map((p) => [
                                            <b key="p">{p.parcela}{p.id === t.id ? ' · esta' : ''}</b>,
                                            dataBR(p.vencimento),
                                            brl(p.valor),
                                            p.recebido ? brl(p.recebido) : '—',
                                            p.situacao === 'PAGO' ? 'recebida' : p.situacao === 'CANCELADO' ? 'cancelada' : p.vencimento < hoje ? 'vencida' : 'em aberto',
                                        ])}
                                    />
                                </div>
                            ) : null}
                            {ex?.nf ? (
                                <div className="flex flex-col gap-1.5">
                                    <div className={ROTULO}>NF {ex.nf.numero} · empenho {ex.nf.empenho}</div>
                                    <div className={NOTA}>
                                        <span>
                                            {ex.nf.convenio} · atendimentos de {comp(ex.nf.competencia)} · emitida em {dataBR(ex.nf.emissao)} · ISS {numCampo(ex.nf.aliquota)}% = {brl(ex.nf.iss)}
                                            {ex.nf.iss_retido ? ` retido na fonte: o depósito esperado é ${brl(ex.nf.valor - ex.nf.iss)}.` : ' não retido (vai no DAS): o depósito vem cheio.'}
                                            {ex.nf.situacao === 'CANCELADA' ? ' NF cancelada.' : ''}
                                        </span>
                                    </div>
                                    <Tabela cab={['OS', 'Data', 'Valor']} num={[2]} linhas={ex.nf.oss.map((o) => [o.descricao, dataBR(o.data), brl(o.valor)])} />
                                </div>
                            ) : null}
                            {t.recebimentos_os?.length ? (
                                <div className="flex flex-col gap-1.5">
                                    <div className={ROTULO}>Recebimentos lançados na OS</div>
                                    {t.recebimentos_os.map((r, i) => (
                                        <div key={i} className={`${NOTA} ${r.estornado ? 'opacity-60' : S_OK}`}>
                                            {dataBR(r.data)} · <b>{brl(r.valor)}</b> · {r.forma.replace('_', ' ').toLowerCase()}
                                            {r.estornado ? ' · estornado' : ''}
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            {t.baixas.length ? (
                                <div className="flex flex-col gap-1.5">
                                    <div className={ROTULO}>Baixas</div>
                                    {t.baixas.map((b) => (
                                        <div key={b.id} className={`${NOTA} ${b.estornado_em ? 'opacity-70' : b.confirmacao === 'A_CONFIRMAR' ? S_AVISO : S_OK}`}>
                                            <span>
                                                {dataBR(b.data)} · <b>{brl(b.valor_pago)}</b> · {b.forma || '—'} · {b.conta}
                                                {b.multa + b.juros ? ` (multa ${brl(b.multa)}, juros ${brl(b.juros)})` : ''}
                                                {b.desconto ? ` (desconto ${brl(b.desconto)})` : ''}
                                                {b.cobrador ? ` · cobrador ${b.cobrador}` : ''} · {b.por || '—'}
                                                {b.confirmacao === 'A_CONFIRMAR' ? ' · a confirmar no banco' : b.confirmacao === 'CONFIRMADA' ? ' · confirmado no banco' : ''}
                                                {b.estornado_em ? ` · estornado em ${dataBR(b.estornado_em)} por ${b.estornado_por || '—'}: ${b.estorno_motivo || ''}` : ''}
                                            </span>
                                            {!b.estornado_em ? (
                                                <button type="button" className="ml-auto shrink-0 font-extrabold underline" onClick={() => abrirRecibo(b.id)}>
                                                    recibo
                                                </button>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            {t.cartoes.length ? (
                                <Tabela
                                    cab={['Cartão', 'NSU', 'Parcela', 'Previsão', 'Bruto', 'Taxa', 'Líquido', 'Situação']}
                                    num={[4, 5, 6]}
                                    linhas={t.cartoes.map((c) => [
                                        cartaoTxt(c.bandeira, c.modalidade),
                                        c.nsu || '—',
                                        c.parcela,
                                        dataBR(c.previsao),
                                        brl(c.bruto),
                                        c.taxa !== null ? brl(c.taxa) : '—',
                                        c.liquido !== null ? brl(c.liquido) : '—',
                                        c.situacao.replace('_', ' ').toLowerCase(),
                                    ])}
                                />
                            ) : null}
                        </>
                    ) : null}

                    {aba === 'negociar' && ex?.pode_negociar ? (
                        <>
                            <div className={NOTA}>
                                <span>
                                    Saldo da OS hoje: <b>{brl(ex.saldo)}</b>. As parcelas viram títulos a receber ligados à OS e o saldo antigo sai da lista. Cada parcela é recebida como hoje (pela OS) e a
                                    baixa cai na parcela escolhida. A nota promissória assinada na OS continua valendo até o saldo zerar; a negociação não gera promissória nova.
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Campo rotulo="Parcelas">
                                    <select className={CAMPO} value={ngN} onChange={(e) => setNgN(Number(e.target.value))}>
                                        {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => (
                                            <option key={n} value={n}>
                                                {n === 1 ? '1 (nova data)' : `${n}x`}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo rotulo="1º vencimento">
                                    <input type="date" className={CAMPO} value={ngPrim} min={hoje} onChange={(e) => setNgPrim(e.target.value)} />
                                </Campo>
                            </div>
                            <Tabela cab={['Parcela', 'Vencimento', 'Valor']} num={[2]} linhas={ngParcelas.map((p, i) => [`${i + 1}/${ngParcelas.length}`, dataBR(p.vencimento), brl(p.valor)])} />
                            <div className="flex justify-end">
                                <button type="button" className={BTN_PRI} disabled={ocupado || !ngPrim || ngPrim < hoje} onClick={() => void negociar()}>
                                    <IconArrowsSplit2 size={18} /> Gerar parcelas
                                </button>
                            </div>
                        </>
                    ) : null}

                    {aba === 'prorrogar' ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <Campo rotulo="Vencimento atual">
                                    <div className={`${CAMPO} flex items-center font-extrabold`}>{dataBR(t.vencimento)}</div>
                                </Campo>
                                <Campo rotulo="Novo vencimento">
                                    <input type="date" className={CAMPO} value={venc} min={hoje} onChange={(e) => setVenc(e.target.value)} />
                                </Campo>
                            </div>
                            <Campo rotulo="Motivo (opcional)">
                                <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                            </Campo>
                            <div className="flex justify-end">
                                <button type="button" className={BTN_PRI} disabled={ocupado} onClick={() => void enviar('prorrogar', { vencimento: venc, motivo })}>
                                    Prorrogar
                                </button>
                            </div>
                        </>
                    ) : null}

                    {aba === 'cobranca' ? (
                        <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <Campo rotulo="Forma de cobrança">
                                    <select className={CAMPO} value={forma} onChange={(e) => setForma(e.target.value ? Number(e.target.value) : '')}>
                                        <option value="">—</option>
                                        {cad.formas.map((f) => (
                                            <option key={f.id} value={f.id}>
                                                {f.nome}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo rotulo="Cobrador">
                                    <select className={CAMPO} value={cobr} onChange={(e) => setCobr(e.target.value ? Number(e.target.value) : '')}>
                                        <option value="">Sem cobrador</option>
                                        {cad.cobradores.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.nome}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <Campo rotulo="Comissão % (vazio = a do cobrador)">
                                    <input className={CAMPO} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
                                </Campo>
                            </div>
                            <Liga on={enc} onClick={() => setEnc(!enc)} rotulo="Cobrar multa e juros quando atrasar" />
                            <Campo rotulo="Observação">
                                <input className={CAMPO} value={obs} onChange={(e) => setObs(e.target.value)} />
                            </Campo>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    className={BTN_PRI}
                                    disabled={ocupado}
                                    onClick={() => void enviar('alterar', { forma_id: forma || null, cobrador_id: cobr || null, comissao_pct: pct === '' ? null : paraNumero(pct), cobrar_encargos: enc, observacao: obs })}
                                >
                                    Gravar
                                </button>
                            </div>
                        </>
                    ) : null}

                    {aba === 'natureza' ? (
                        <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Campo rotulo="Natureza">
                                    <select className={CAMPO} value={nat} onChange={(e) => setNat(e.target.value ? Number(e.target.value) : '')}>
                                        <option value="">Escolha</option>
                                        {cad.naturezas.map((n) => (
                                            <option key={n.id} value={n.id}>
                                                {n.codigo} · {n.nome}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                {!t.rateio.length ? (
                                    <Campo rotulo="Área de negócio">
                                        <select className={CAMPO} value={area} onChange={(e) => setArea(e.target.value ? Number(e.target.value) : '')}>
                                            <option value="">Escolha</option>
                                            {cad.areas.map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </Campo>
                                ) : null}
                            </div>
                            <div className={SUB}>Num mês já fechado a troca não é aceita (o DRE daquele mês não muda).</div>
                            <div className="flex justify-end">
                                <button type="button" className={BTN_PRI} disabled={ocupado || !nat} onClick={() => void enviar('alterar', { natureza_id: nat, area_id: area || null })}>
                                    Alterar natureza
                                </button>
                            </div>
                        </>
                    ) : null}

                    {aba === 'cancelar' || aba === 'estorno' || aba === 'desconto' ? (
                        <>
                            {aba === 'desconto' ? (
                                <Campo rotulo="Valor do desconto">
                                    <input className={CAMPO} inputMode="decimal" value={valorDesc} onChange={(e) => setValorDesc(e.target.value)} placeholder="0,00" />
                                </Campo>
                            ) : null}
                            <Campo rotulo="Motivo">
                                <input className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                            </Campo>
                            <div className={`${NOTA} ${S_AVISO}`}>
                                {aba === 'cancelar'
                                    ? 'O cancelamento vai para a Gestão (aba Aprovações da Tesouraria). Até lá o título não pode ser recebido.'
                                    : aba === 'estorno'
                                      ? 'O estorno vai para a Gestão. Aprovado, a baixa é desfeita, o título volta para em aberto e o cartão a receber (se houver) é cancelado.'
                                      : 'O desconto vai para a Gestão. Aprovado, aparece para usar na hora de receber.'}
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    className={BTN_PRI}
                                    disabled={ocupado || !motivo.trim()}
                                    onClick={() =>
                                        void enviar('pedir', { tipo: aba === 'cancelar' ? 'CANCELAMENTO' : aba === 'estorno' ? 'ESTORNO' : 'DESCONTO', motivo, valor: aba === 'desconto' ? paraNumero(valorDesc) : undefined })
                                    }
                                >
                                    Pedir à Gestão
                                </button>
                            </div>
                        </>
                    ) : null}

                    {aba === 'anexos' ? (
                        <div className="flex flex-col gap-2">
                            <label className={`${BTN_PEQ} w-fit cursor-pointer`}>
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="sr-only"
                                    onChange={async (e) => {
                                        const f = e.target.files?.[0];
                                        e.target.value = '';
                                        if (!f) return;
                                        setOcupado(true);
                                        setErro(null);
                                        try {
                                            const j = await anexarArquivo({ titulo_id: id }, f);
                                            onMudou(j.msg);
                                            await carregar();
                                        } catch (er: any) {
                                            const m = mensagemErro(er, 'Não foi possível anexar.');
                                            if (m) setErro(m);
                                        } finally {
                                            setOcupado(false);
                                        }
                                    }}
                                />
                                <IconPaperclip size={18} /> Anexar arquivo
                            </label>
                            {t.anexos.length ? (
                                t.anexos.map((a) => (
                                    <a key={a.id} href={URL_ANEXO(a.id)} target="_blank" rel="noreferrer" className={`${NOTA} items-center hover:underline`}>
                                        <IconPaperclip size={16} className="shrink-0" />
                                        <span className="min-w-0 flex-1 break-words">{a.nome}</span>
                                        {a.comprovante ? <span className={`${SELO} ${S_OK}`}>comprovante</span> : null}
                                        <span className={SUB}>{dataBR(a.em)}</span>
                                    </a>
                                ))
                            ) : (
                                <div className={SUB}>Nenhum arquivo. Nota, boleto, contrato ou comprovante (PDF ou foto).</div>
                            )}
                        </div>
                    ) : null}

                    {aba === 'historico' ? (
                        <div className="flex flex-col gap-1.5">
                            {t.historico.length ? (
                                t.historico
                                    .slice()
                                    .reverse()
                                    .map((h, i) => (
                                        <div key={i} className="rounded-xl border border-[#EEF2F7] px-3 py-2 text-[14px] dark:border-white/[0.08]">
                                            <b>{ACAO_NOME[h.acao] || h.acao}</b>
                                            {textoHistorico(h) ? <span> · {textoHistorico(h)}</span> : null}
                                            <div className={SUB}>
                                                {dataBR(h.em)} {h.em.slice(11, 16)} · {h.nome || 'automático'}
                                            </div>
                                        </div>
                                    ))
                            ) : (
                                <div className={SUB}>Sem registros.</div>
                            )}
                        </div>
                    ) : null}
                </>
            ) : null}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

function Info({ r, v }: { r: string; v: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">{r}</div>
            <div className="break-words font-bold">{v}</div>
        </div>
    );
}

/* ============================== novo título avulso ============================== */

function Novo({ cad, hoje, onFechar, onSalvo }: { cad: Cad; hoje: string; onFechar: () => void; onSalvo: (m: string) => void }) {
    const [pessoa, setPessoa] = useState<number | '' | 'novo'>('');
    const [pessoaNome, setPessoaNome] = useState('');
    const [desc, setDesc] = useState('');
    const [doc, setDoc] = useState('');
    const [valor, setValor] = useState('');
    const [emissao, setEmissao] = useState(hoje);
    const [venc, setVenc] = useState(diaMais(hoje, 10));
    const [parcelas, setParcelas] = useState(1);
    const [mensal, setMensal] = useState(false);
    const [meses, setMeses] = useState(6);
    const [nat, setNat] = useState<number | ''>('');
    const [area, setArea] = useState<number | ''>('');
    const [local, setLocal] = useState<number | ''>('');
    const [forma, setForma] = useState<number | ''>(cad.formas.find((f) => f.codigo === 'PIX')?.id ?? '');
    const [cobr, setCobr] = useState<number | ''>('');
    const [pct, setPct] = useState('');
    const [enc, setEnc] = useState(true);
    const [obs, setObs] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [filtroCli, setFiltroCli] = useState('');
    const clientes = useMemo(() => {
        const q = filtroCli.trim().toLowerCase();
        return (q ? cad.clientes.filter((c) => c.nome.toLowerCase().includes(q)) : cad.clientes).slice(0, 300);
    }, [cad.clientes, filtroCli]);

    const salvar = async () => {
        setOcupado(true);
        setErro(null);
        try {
            const j = await api(mensal ? URL_ACOES : URL_REC, mensal ? 'lancar_mensal' : 'salvar', {
                meses: mensal ? meses : undefined,
                pessoa_id: pessoa !== 'novo' && pessoa ? pessoa : null,
                pessoa_nome: pessoa === 'novo' ? pessoaNome : null,
                descricao: desc,
                documento: doc,
                valor: paraNumero(valor),
                emissao,
                competencia: mensal ? venc.slice(0, 7) : emissao.slice(0, 7),
                vencimento: venc,
                parcelas: mensal ? 1 : parcelas,
                natureza_id: nat || null,
                area_id: area || null,
                local_id: local || null,
                forma_id: forma || null,
                cobrador_id: cobr || null,
                comissao_pct: pct === '' ? null : paraNumero(pct),
                cobrar_encargos: enc,
                observacao: obs,
            });
            onSalvo(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível lançar.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };

    return (
        <Janela
            titulo="Novo título a receber"
            sub="Avulso: o que não vem da OS nem da página de Coroas."
            largura="max-w-3xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={ocupado} onClick={() => void salvar()}>
                        {mensal ? `Lançar ${meses} meses` : 'Lançar'}
                    </button>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo rotulo="Cliente">
                    <input className={`${CAMPO} mb-1.5`} value={filtroCli} onChange={(e) => setFiltroCli(e.target.value)} placeholder="Procurar cliente…" />
                    <select className={CAMPO} value={pessoa} onChange={(e) => setPessoa(e.target.value === 'novo' ? 'novo' : e.target.value ? Number(e.target.value) : '')}>
                        <option value="">Sem cliente</option>
                        <option value="novo">+ Cliente novo</option>
                        {clientes.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nome}
                            </option>
                        ))}
                    </select>
                </Campo>
                {pessoa === 'novo' ? (
                    <Campo rotulo="Nome do cliente novo">
                        <input className={CAMPO} value={pessoaNome} onChange={(e) => setPessoaNome(e.target.value)} />
                    </Campo>
                ) : (
                    <div />
                )}
                <Campo rotulo="Descrição" classe="sm:col-span-2">
                    <input className={CAMPO} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: ressarcimento de contrato, aluguel de sala" />
                </Campo>
                <Campo rotulo={mensal ? 'Valor de cada mês' : 'Valor total'}>
                    <input className={CAMPO} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                </Campo>
                <Campo rotulo="Documento">
                    <input className={CAMPO} value={doc} onChange={(e) => setDoc(e.target.value)} />
                </Campo>
                <Campo rotulo="Emissão">
                    <input type="date" className={CAMPO} value={emissao} onChange={(e) => setEmissao(e.target.value)} />
                </Campo>
                <Campo rotulo="1º vencimento">
                    <input type="date" className={CAMPO} value={venc} onChange={(e) => setVenc(e.target.value)} />
                </Campo>
                {mensal ? (
                    <Campo rotulo="Quantos meses">
                        <select className={CAMPO} value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
                            {Array.from({ length: 35 }, (_, i) => i + 2).map((n) => (
                                <option key={n} value={n}>
                                    {n} meses
                                </option>
                            ))}
                        </select>
                    </Campo>
                ) : (
                    <Campo rotulo="Parcelas">
                        <select className={CAMPO} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
                            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                                <option key={n} value={n}>
                                    {n === 1 ? 'À vista (1)' : `${n} parcelas mensais`}
                                </option>
                            ))}
                        </select>
                    </Campo>
                )}
                <Campo rotulo="Forma de cobrança">
                    <select className={CAMPO} value={forma} onChange={(e) => setForma(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">—</option>
                        {cad.formas.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.nome}
                            </option>
                        ))}
                    </select>
                </Campo>
                <Campo rotulo="Natureza">
                    <select className={CAMPO} value={nat} onChange={(e) => setNat(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">Escolha</option>
                        {cad.naturezas.map((n) => (
                            <option key={n.id} value={n.id}>
                                {n.codigo} · {n.nome}
                            </option>
                        ))}
                    </select>
                </Campo>
                <Campo rotulo="Área de negócio">
                    <select className={CAMPO} value={area} onChange={(e) => setArea(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">Escolha</option>
                        {cad.areas.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.nome}
                            </option>
                        ))}
                    </select>
                </Campo>
                <Campo rotulo="Local (opcional)">
                    <select className={CAMPO} value={local} onChange={(e) => setLocal(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">—</option>
                        {cad.locais.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.nome}
                            </option>
                        ))}
                    </select>
                </Campo>
                <Campo rotulo="Cobrador (opcional)">
                    <select className={CAMPO} value={cobr} onChange={(e) => setCobr(e.target.value ? Number(e.target.value) : '')}>
                        <option value="">Sem cobrador</option>
                        {cad.cobradores
                            .filter((c) => c.ativo)
                            .map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}
                                </option>
                            ))}
                    </select>
                </Campo>
                <Campo rotulo="Comissão % (vazio = a do cobrador)">
                    <input className={CAMPO} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
                </Campo>
                <Campo rotulo="Observação" classe="sm:col-span-2">
                    <input className={CAMPO} value={obs} onChange={(e) => setObs(e.target.value)} />
                </Campo>
            </div>
            <Liga on={mensal} onClick={() => setMensal(!mensal)} rotulo="Repete todo mês (ex.: aluguel de material ortopédico)" />
            {mensal ? (
                <div className={NOTA}>
                    <span>
                        Cria {meses} títulos de {brl(paraNumero(valor) ?? 0)} de uma vez, um por mês, com o mesmo dia de vencimento (total {brl((paraNumero(valor) ?? 0) * meses)}). Se o item for devolvido antes,
                        os meses que sobrarem saem pelo pedido de cancelamento.
                    </span>
                </div>
            ) : null}
            <Liga on={enc} onClick={() => setEnc(!enc)} rotulo={`Cobrar multa de ${numCampo(cad.padrao.multa_pct)}% e juros de ${numCampo(cad.padrao.juros_pct)}% ao mês se atrasar`} />
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== filtros avançados ============================== */

function Filtros({ cad, fa, onFechar, onAplicar }: { cad: Cad; fa: FA; onFechar: () => void; onAplicar: (f: FA) => void }) {
    const [f, setF] = useState<FA>({ td: 'venc', ...fa });
    const set = (k: keyof FA) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
    const sel = (k: keyof FA, rotulo: string, lista: { id: number; nome: string }[], todos = 'Todos') => (
        <Campo rotulo={rotulo}>
            <select className={CAMPO} value={f[k] || ''} onChange={set(k)}>
                <option value="">{todos}</option>
                {lista.map((x) => (
                    <option key={x.id} value={x.id}>
                        {x.nome}
                    </option>
                ))}
            </select>
        </Campo>
    );
    return (
        <Janela
            titulo="Filtros"
            sub="Valem junto com a busca, a origem e os botões de situação."
            largura="max-w-3xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={() => setF({ td: 'venc' })}>
                        Limpar tudo
                    </button>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button
                        type="button"
                        className={BTN_PRI}
                        onClick={() => {
                            const n: FA = {};
                            (Object.keys(f) as (keyof FA)[]).forEach((k) => {
                                if (f[k]) n[k] = f[k];
                            });
                            if (!n.de && !n.ate) delete n.td;
                            onAplicar(n);
                        }}
                    >
                        Aplicar
                    </button>
                </>
            }
        >
            <div className={ROTULO}>Período</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo rotulo="Data de">
                    <select className={CAMPO} value={f.td || 'venc'} onChange={set('td')}>
                        <option value="venc">Vencimento</option>
                        <option value="emis">Emissão</option>
                        <option value="comp">Competência</option>
                        <option value="pago">Recebimento</option>
                    </select>
                </Campo>
                <Campo rotulo="De">
                    <input type="date" className={CAMPO} value={f.de || ''} onChange={set('de')} />
                </Campo>
                <Campo rotulo="Até">
                    <input type="date" className={CAMPO} value={f.ate || ''} onChange={set('ate')} />
                </Campo>
            </div>
            <div className={ROTULO}>Título</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {sel('pessoa_id', 'Cliente', cad.clientes)}
                {sel('natureza_id', 'Natureza', cad.naturezas.map((n) => ({ id: n.id, nome: `${n.codigo} · ${n.nome}` })), 'Todas')}
                {sel('cobrador_id', 'Cobrador', cad.cobradores)}
                <Campo rotulo="Valor de">
                    <input className={CAMPO} inputMode="decimal" value={f.vmin || ''} onChange={set('vmin')} placeholder="0,00" />
                </Campo>
                <Campo rotulo="Valor até">
                    <input className={CAMPO} inputMode="decimal" value={f.vmax || ''} onChange={set('vmax')} placeholder="0,00" />
                </Campo>
            </div>
            <div className={ROTULO}>Recebimento</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {sel('forma_id', 'Forma', cad.formas, 'Todas')}
                {sel('conta_id', 'Entrou na conta', cad.contas, 'Todas')}
            </div>
        </Janela>
    );
}

/* ============================== comissões e cobradores ============================== */

function Comissoes({ cad, onFechar, onCad, avisar }: { cad: Cad; onFechar: () => void; onCad: () => void; avisar: (m: string) => void }) {
    const hoje = hojeISO();
    const [de, setDe] = useState(hoje.slice(0, 8) + '01');
    const [ate, setAte] = useState(hoje);
    const [dados, setDados] = useState<{ cobradores: { cobrador_id: number; cobrador: string; n: number; recebido: number; comissao: number; itens: any[] }[] } | null>(null);
    const [aberto, setAberto] = useState<number | null>(null);
    const [aba, setAba] = useState('relatorio');
    const [ed, setEd] = useState<{ id?: number; nome: string; comissao_pct: string; rota: string; usuario_id: number | ''; ativo: boolean } | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        try {
            const j = await api(URL_REC, 'comissoes', undefined, `&de=${de}&ate=${ate}`);
            setDados(j.dados);
            setErro(null);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível carregar as comissões.');
            if (m) setErro(m);
        }
    }, [de, ate]);
    useEffect(() => {
        void carregar();
    }, [carregar]);

    const gravar = async () => {
        if (!ed) return;
        try {
            const j = await api(URL_REC, 'cobrador', { id: ed.id, nome: ed.nome, comissao_pct: paraNumero(ed.comissao_pct) ?? 0, rota: ed.rota, usuario_id: ed.usuario_id || null, ativo: ed.ativo });
            avisar(j.msg);
            setEd(null);
            onCad();
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível gravar o cobrador.');
            if (m) setErro(m);
        }
    };
    const total = (dados?.cobradores ?? []).reduce((s, c) => s + c.comissao, 0);

    return (
        <Janela titulo="Comissões de cobrança" sub="Por enquanto é só relatório: depois de validado, vira conta a pagar automática." largura="max-w-4xl" onFechar={onFechar}>
            <Abas
                abas={[
                    ['relatorio', 'Relatório'],
                    ['cobradores', 'Cobradores'],
                ]}
                aba={aba}
                onAba={setAba}
            />
            {aba === 'relatorio' ? (
                <>
                    <div className="flex flex-wrap items-end gap-3">
                        <Campo rotulo="Recebido de">
                            <input type="date" className={CAMPO} value={de} onChange={(e) => setDe(e.target.value)} />
                        </Campo>
                        <Campo rotulo="Até">
                            <input type="date" className={CAMPO} value={ate} onChange={(e) => setAte(e.target.value)} />
                        </Campo>
                        <span className="ml-auto text-[20px] font-extrabold tabular-nums">{brl(total)}</span>
                    </div>
                    {dados && !dados.cobradores.length ? <div className={SUB}>Nenhuma baixa com cobrador no período.</div> : null}
                    {dados?.cobradores.map((c) => (
                        <div key={c.cobrador_id} className={`${CARTAO} overflow-hidden`}>
                            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setAberto(aberto === c.cobrador_id ? null : c.cobrador_id)}>
                                <b className="min-w-0 flex-1">{c.cobrador}</b>
                                <span className={SUB}>
                                    {c.n} baixa(s) · {brl(c.recebido)}
                                </span>
                                <b className="tabular-nums">{brl(c.comissao)}</b>
                            </button>
                            {aberto === c.cobrador_id ? (
                                <div className="px-3 pb-3">
                                    <Tabela
                                        cab={['Data', 'Cliente', 'Descrição', 'Recebido', '%', 'Comissão']}
                                        num={[3, 4, 5]}
                                        linhas={c.itens.map((i) => [dataBR(i.data), i.pessoa || '—', i.descricao, brl(i.recebido), `${numCampo(i.pct)}%`, brl(i.comissao)])}
                                    />
                                </div>
                            ) : null}
                        </div>
                    ))}
                    {dados?.cobradores.length ? (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                className={BTN_PEQ}
                                onClick={() => {
                                    type It = { cobrador: string; data: string; pessoa: string; descricao: string; recebido: number; pct: number; comissao: number; id: number };
                                    const itens: It[] = dados.cobradores.flatMap((c) => c.itens.map((i, k) => ({ ...i, cobrador: c.cobrador, id: k })));
                                    baixarCsv<It>(
                                        `comissoes-${de}-a-${ate}.csv`,
                                        { rotulo: 'Cobrador', texto: (i) => i.cobrador },
                                        [
                                            { id: 'd', rotulo: 'Data', largura: 0, valor: (i) => dataBR(i.data) },
                                            { id: 'p', rotulo: 'Cliente', largura: 0, valor: (i) => i.pessoa || '' },
                                            { id: 's', rotulo: 'Descrição', largura: 0, valor: (i) => i.descricao },
                                            { id: 'r', rotulo: 'Recebido', largura: 0, valor: (i) => i.recebido },
                                            { id: 'x', rotulo: '%', largura: 0, valor: (i) => i.pct },
                                            { id: 'c', rotulo: 'Comissão', largura: 0, valor: (i) => i.comissao },
                                        ],
                                        { d: true, p: true, s: true, r: true, x: true, c: true },
                                        itens,
                                    );
                                }}
                            >
                                <IconDownload size={18} /> Exportar
                            </button>
                        </div>
                    ) : null}
                </>
            ) : (
                <>
                    {cad.cobradores.map((c) => (
                        <div key={c.id} className={`${NOTA} items-center`}>
                            <span className="min-w-0 flex-1">
                                <b>{c.nome}</b> · {numCampo(c.comissao_pct)}%{c.rota ? ` · ${c.rota}` : ''}
                                {!c.ativo ? ' · fora de uso' : ''}
                            </span>
                            <button type="button" className={BTN_PEQ} onClick={() => setEd({ id: c.id, nome: c.nome, comissao_pct: numCampo(c.comissao_pct), rota: c.rota || '', usuario_id: c.usuario_id ?? '', ativo: c.ativo })}>
                                Alterar
                            </button>
                        </div>
                    ))}
                    {!ed ? (
                        <div>
                            <button type="button" className={BTN_PEQ_PRI} onClick={() => setEd({ nome: '', comissao_pct: '', rota: '', usuario_id: '', ativo: true })}>
                                <IconPlus size={18} /> Novo cobrador
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 rounded-xl border border-[#C9D1DE] p-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                                <Campo rotulo="Nome" classe="sm:col-span-2">
                                    <input className={CAMPO} value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} />
                                </Campo>
                                <Campo rotulo="Comissão %">
                                    <input className={CAMPO} inputMode="decimal" value={ed.comissao_pct} onChange={(e) => setEd({ ...ed, comissao_pct: e.target.value })} />
                                </Campo>
                                <Campo rotulo="Rota">
                                    <input className={CAMPO} value={ed.rota} onChange={(e) => setEd({ ...ed, rota: e.target.value })} />
                                </Campo>
                                <Campo rotulo="Usuário do app (opcional)" classe="sm:col-span-2">
                                    <select className={CAMPO} value={ed.usuario_id} onChange={(e) => setEd({ ...ed, usuario_id: e.target.value ? Number(e.target.value) : '' })}>
                                        <option value="">—</option>
                                        {cad.usuarios.map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.nome}
                                            </option>
                                        ))}
                                    </select>
                                </Campo>
                                <div className="flex items-end">
                                    <Liga on={ed.ativo} onClick={() => setEd({ ...ed, ativo: !ed.ativo })} rotulo="Em uso" />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" className={BTN_PEQ} onClick={() => setEd(null)}>
                                    Desistir
                                </button>
                                <button type="button" className={BTN_PEQ_PRI} onClick={() => void gravar()}>
                                    Gravar
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== cartões a receber e Cielo ============================== */

const SIT_CARTAO: Record<string, [string, string]> = {
    A_CONFERIR: ['A conferir', S_AB],
    CONFERIDO: ['Conferido', S_OK],
    DIVERGENTE: ['Diferença', S_RUIM],
    DEPOSITADO: ['Depositado', S_MUDO],
    CANCELADO: ['Cancelado', S_MUDO],
};

function Cartoes({ onFechar, avisar }: { onFechar: () => void; avisar: (m: string) => void }) {
    const hoje = hojeISO();
    const [aba, setAba] = useState('cartoes');
    const [sit, setSit] = useState('pendentes');
    const [canal, setCanal] = useState('');
    const [pag, setPag] = useState(0);
    const [lista, setLista] = useState<any | null>(null);
    const [de, setDe] = useState(diaMais(hoje, -30));
    const [ate, setAte] = useState(hoje);
    const [conf, setConf] = useState<any | null>(null);
    const [sub, setSub] = useState('vendas');
    const [taxas, setTaxas] = useState<any[] | null>(null);
    const [nova, setNova] = useState({ canal: 'MAQUINA', bandeira: 'Visa', modalidade: 'CREDITO', pct: '', prazo_dias: '30' });
    const [ligar, setLigar] = useState<number | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const arq = React.useRef<HTMLInputElement>(null);

    const falha = (e: any, p: string) => {
        const m = mensagemErro(e, p);
        if (m) setErro(m);
    };
    const carregarLista = useCallback(async () => {
        try {
            const j = await api(URL_CIELO, 'cartoes', undefined, `&sit=${sit}&canal=${canal}&pagina=${pag}&pp=100`);
            setLista(j.dados);
        } catch (e: any) {
            falha(e, 'Não foi possível carregar os cartões a receber.');
        }
    }, [sit, canal, pag]);
    const carregarConf = useCallback(async () => {
        try {
            const j = await api(URL_CIELO, 'conferencia', undefined, `&de=${de}&ate=${ate}`);
            setConf(j.dados);
        } catch (e: any) {
            falha(e, 'Não foi possível carregar a conferência.');
        }
    }, [de, ate]);
    const carregarTaxas = useCallback(async () => {
        try {
            const j = await api(URL_CIELO, 'taxas');
            setTaxas(j.dados);
        } catch (e: any) {
            falha(e, 'Não foi possível carregar as taxas.');
        }
    }, []);
    useEffect(() => {
        if (aba === 'cartoes') void carregarLista();
        if (aba === 'conferencia') void carregarConf();
        if (aba === 'taxas') void carregarTaxas();
    }, [aba, carregarLista, carregarConf, carregarTaxas]);

    const importar = async (f: File) => {
        setOcupado(true);
        setErro(null);
        try {
            const fd = new FormData();
            fd.append('arquivo', f);
            const r = await fetch(`${URL_CIELO}?action=importar`, { method: 'POST', credentials: 'include', body: fd });
            if (r.status === 401) throw new SessaoExpirada('Sessão expirada.');
            const j = await r.json().catch(() => null);
            if (!j || j.erro) throw new Error(j?.msg || 'Não foi possível importar o arquivo.');
            avisar(j.msg);
            void carregarConf();
        } catch (e: any) {
            falha(e, 'Não foi possível importar o arquivo.');
        } finally {
            setOcupado(false);
        }
    };
    const post = async (acao: string, corpo: Record<string, unknown>, depois: () => void) => {
        setOcupado(true);
        setErro(null);
        try {
            const j = await api(URL_CIELO, acao, corpo);
            avisar(j.msg);
            depois();
        } catch (e: any) {
            falha(e, 'Não foi possível concluir.');
        } finally {
            setOcupado(false);
        }
    };

    return (
        <Janela titulo="Cartões a receber e Cielo" sub="Cada parcela vendida no cartão (e o Pix da Cielo) até cair no Banco do Brasil." largura="max-w-6xl" onFechar={onFechar}>
            <Abas
                abas={[
                    ['cartoes', 'Cartões a receber'],
                    ['conferencia', 'Conferir com a Cielo'],
                    ['taxas', 'Taxas'],
                ]}
                aba={aba}
                onAba={setAba}
            />

            {aba === 'cartoes' ? (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        {(
                            [
                                ['pendentes', 'A receber'],
                                ['a_conferir', 'A conferir'],
                                ['divergente', 'Com diferença'],
                                ['depositado', 'Depositados'],
                                ['todos', 'Todos'],
                            ] as [string, string][]
                        ).map(([k, r]) => (
                            <button key={k} type="button" className={PILULA(sit === k)} onClick={() => (setSit(k), setPag(0))}>
                                {r}
                            </button>
                        ))}
                        <select className="h-11 rounded-xl bg-[#F1F4F8] px-3 text-[15px] dark:bg-[#1C2334]" value={canal} onChange={(e) => (setCanal(e.target.value), setPag(0))} aria-label="Canal">
                            <option value="">Todas as máquinas e o site</option>
                            {lista
                                ? Object.entries(lista.canais as Record<string, string>).map(([k, r]) => (
                                      <option key={k} value={k}>
                                          {r}
                                      </option>
                                  ))
                                : null}
                        </select>
                    </div>
                    {lista ? (
                        <>
                            <div className={`${SUB} font-bold`}>
                                {lista.total.n} parcela(s) · bruto {brl(lista.total.bruto)} · taxas {brl(lista.total.taxa)} · líquido {brl(lista.total.liquido)}
                            </div>
                            {lista.agenda.length && sit === 'pendentes' ? (
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {lista.agenda.slice(0, 20).map((a: any) => (
                                        <div key={a.data} className={`shrink-0 rounded-xl border px-3 py-2 text-[13px] ${a.atrasado ? 'border-[#F4B4AE] bg-[#FDECEA] dark:bg-[#FF9C92]/10' : 'border-[#E3E8F0] dark:border-white/[0.12]'}`}>
                                            <div className="font-extrabold">{diaMes(a.data)}</div>
                                            <div className="tabular-nums">{brl(a.valor)}</div>
                                            <div className={SUB}>{a.atrasado ? 'não depositado' : `${a.n} parcela(s)`}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            <Tabela
                                cab={['Venda', 'Máquina / site', 'NSU', 'Cartão', 'Parcela', 'Previsão', 'Bruto', 'Taxa', 'Líquido', 'Situação', 'Título']}
                                num={[6, 7, 8]}
                                linhas={lista.linhas.map((c: any) => [
                                    dataBR(c.data_venda),
                                    c.canal_nome,
                                    c.nsu || <span className={`${SELO} ${S_AVISO}`}>sem NSU</span>,
                                    cartaoTxt(c.bandeira, c.modalidade),
                                    c.parcela,
                                    dataBR(c.previsao),
                                    brl(c.bruto),
                                    c.taxa !== null ? brl(c.taxa) : '—',
                                    c.liquido !== null ? brl(c.liquido) : '—',
                                    <span key="s" className={`${SELO} ${SIT_CARTAO[c.situacao]?.[1] || S_MUDO}`}>
                                        {SIT_CARTAO[c.situacao]?.[0] || c.situacao}
                                    </span>,
                                    <span key="t" className="line-clamp-1">
                                        {c.titulo || '—'}
                                    </span>,
                                ])}
                            />
                            <Paginacao pagina={pag} pp={100} total={lista.total.n} onPagina={setPag} onPp={() => undefined} />
                        </>
                    ) : (
                        <div className="py-6 text-center text-[#5B6478]">Carregando…</div>
                    )}
                </>
            ) : null}

            {aba === 'conferencia' ? (
                <>
                    <div className="flex flex-wrap items-end gap-3">
                        <Campo rotulo="Vendas de">
                            <input type="date" className={CAMPO} value={de} onChange={(e) => setDe(e.target.value)} />
                        </Campo>
                        <Campo rotulo="Até">
                            <input type="date" className={CAMPO} value={ate} onChange={(e) => setAte(e.target.value)} />
                        </Campo>
                        <span className="flex-1" />
                        <button type="button" className={BTN_SEC} disabled={ocupado} onClick={() => void post('casar', {}, carregarConf)}>
                            <IconRefresh size={18} /> Conferir de novo
                        </button>
                        <button type="button" className={BTN_PRI} disabled={ocupado} onClick={() => arq.current?.click()}>
                            <IconUpload size={18} /> Importar arquivo da Cielo
                        </button>
                        <input
                            ref={arq}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void importar(f);
                                e.target.value = '';
                            }}
                        />
                    </div>
                    <div className={NOTA}>
                        No site da Cielo: Vendas → exportar em CSV (todas as máquinas e o e-commerce). As não aprovadas são ignoradas. O sistema casa pelo NSU; cartão passado na OS (sem NSU) casa pela máquina, dia e valor.
                        {conf?.ultima_importacao ? ` Última importação: ${dataBR(conf.ultima_importacao)} ${String(conf.ultima_importacao).slice(11, 16)}.` : ''}
                    </div>
                    {conf ? (
                        <>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                {[
                                    ['Vendas na Cielo', conf.resumo.cielo, S_AB],
                                    ['Conferidas', conf.resumo.casadas, S_OK],
                                    ['Com diferença', conf.resumo.divergentes, S_RUIM],
                                    ['Só na Cielo', conf.resumo.so_cielo, S_AVISO],
                                    ['Só no sistema', conf.resumo.so_sistema, S_AVISO],
                                ].map(([r, n, c]) => (
                                    <div key={r as string} className={`rounded-xl px-3 py-2 ${c}`}>
                                        <div className="text-[12px] font-extrabold uppercase">{r}</div>
                                        <div className="text-[22px] font-extrabold">{n}</div>
                                    </div>
                                ))}
                            </div>
                            <Abas
                                abas={[
                                    ['vendas', 'Vendas Cielo × sistema'],
                                    ['so_sistema', 'Só no sistema'],
                                    ['depositos', 'Depósitos no BB'],
                                    ['taxas', 'Taxas cobradas'],
                                ]}
                                aba={sub}
                                onAba={setSub}
                            />
                            {sub === 'vendas' ? (
                                <Tabela
                                    cab={['Data', 'Hora', 'Máquina / site', 'NSU', 'Cartão', 'Bruto', 'Taxa', 'Líquido', 'Previsão', 'Situação', '']}
                                    num={[5, 6, 7]}
                                    linhas={conf.vendas.map((v: any) => [
                                        dataBR(v.data),
                                        v.hora || '',
                                        v.canal,
                                        v.nsu,
                                        cartaoTxt(v.bandeira, v.modalidade, v.parcelas),
                                        brl(v.bruto),
                                        brl(v.taxa),
                                        brl(v.liquido),
                                        dataBR(v.previsao),
                                        <span key="s" className={`${SELO} ${v.situacao === 'CASADA' ? S_OK : v.situacao === 'DIVERGENTE' ? S_RUIM : S_AVISO}`}>
                                            {v.situacao === 'CASADA' ? 'Conferida' : v.situacao === 'DIVERGENTE' ? 'Diferença' : 'Só na Cielo'}
                                        </span>,
                                        v.situacao === 'SO_CIELO' ? (
                                            <button key="b" type="button" className={BTN_PEQ} onClick={() => (setLigar(v.id), setSub('so_sistema'))}>
                                                Ligar
                                            </button>
                                        ) : (
                                            ''
                                        ),
                                    ])}
                                />
                            ) : null}
                            {sub === 'so_sistema' ? (
                                <>
                                    {ligar ? (
                                        <div className={`${NOTA} ${S_AVISO}`}>
                                            Escolha abaixo o cartão a receber que corresponde à venda NSU {conf.vendas.find((v: any) => v.id === ligar)?.nsu} ({brl(conf.vendas.find((v: any) => v.id === ligar)?.bruto)}).
                                            <button type="button" className="ml-auto font-extrabold underline" onClick={() => setLigar(null)}>
                                                Desistir
                                            </button>
                                        </div>
                                    ) : null}
                                    <Tabela
                                        cab={['Data', 'Máquina / site', 'NSU', 'Cartão', 'Parcelas', 'Bruto', 'Título', '']}
                                        num={[5]}
                                        linhas={conf.so_sistema.map((c: any) => [
                                            dataBR(c.data),
                                            c.canal,
                                            c.nsu || '—',
                                            cartaoTxt(c.bandeira, c.modalidade),
                                            c.parcelas,
                                            brl(c.bruto),
                                            c.titulo || '—',
                                            ligar ? (
                                                <button
                                                    key="b"
                                                    type="button"
                                                    className={BTN_PEQ_PRI}
                                                    disabled={ocupado}
                                                    onClick={() =>
                                                        void post('ligar', { cielo_venda_id: ligar, cartao_ids: [c.id] }, () => {
                                                            setLigar(null);
                                                            setSub('vendas');
                                                            void carregarConf();
                                                        })
                                                    }
                                                >
                                                    É esta
                                                </button>
                                            ) : (
                                                ''
                                            ),
                                        ])}
                                    />
                                    <div className={SUB}>Venda lançada no sistema que não apareceu no arquivo da Cielo: confira a data, a máquina e o NSU do comprovante.</div>
                                </>
                            ) : null}
                            {sub === 'depositos' ? (
                                <Tabela
                                    cab={['Dia', 'Vendas', 'Previsto (Cielo)', 'Extrato BB', 'Diferença', '']}
                                    num={[2, 3, 4]}
                                    linhas={conf.depositos.map((x: any) => [
                                        dataBR(x.data),
                                        x.vendas,
                                        brl(x.previsto),
                                        x.extrato !== null ? brl(x.extrato) : x.futuro ? 'a vencer' : <span className="text-[#B42318]">não achado</span>,
                                        x.diferenca !== null ? <span className={Math.abs(x.diferenca) > 0.05 ? 'font-extrabold text-[#B42318]' : ''}>{brl(x.diferenca)}</span> : '—',
                                        !x.futuro ? (
                                            <button
                                                key="b"
                                                type="button"
                                                className={BTN_PEQ}
                                                disabled={ocupado}
                                                onClick={() => void post('depositar', { data: x.data, extrato_id: x.extrato_ids[0] || null }, carregarConf)}
                                            >
                                                Quitar o dia
                                            </button>
                                        ) : (
                                            ''
                                        ),
                                    ])}
                                />
                            ) : null}
                            {sub === 'taxas' ? (
                                <Tabela
                                    cab={['Canal', 'Bandeira', 'Modalidade', 'Vendas', 'Bruto', 'Taxa paga', 'Cobrada', 'Cadastrada']}
                                    num={[3, 4, 5, 6, 7]}
                                    linhas={conf.taxas.map((x: any) => [
                                        x.canal,
                                        x.bandeira || '—',
                                        MOD_NOME[x.modalidade] || x.modalidade,
                                        x.n,
                                        brl(x.bruto),
                                        brl(x.taxa),
                                        x.cobrada !== null ? `${numCampo(x.cobrada)}%` : '—',
                                        x.cadastrada !== null ? (
                                            <span className={x.cobrada !== null && Math.abs(x.cobrada - x.cadastrada) > 0.05 ? 'font-extrabold text-[#B42318]' : ''}>{numCampo(x.cadastrada)}%</span>
                                        ) : (
                                            '—'
                                        ),
                                    ])}
                                />
                            ) : null}
                        </>
                    ) : (
                        <div className="py-6 text-center text-[#5B6478]">Carregando…</div>
                    )}
                </>
            ) : null}

            {aba === 'taxas' ? (
                <>
                    <div className={SUB}>A taxa entra no cartão a receber na hora da baixa (o valor fica líquido). Quando o arquivo da Cielo chega, vale a taxa que a Cielo cobrou.</div>
                    {taxas ? (
                        <Tabela
                            cab={['Canal', 'Bandeira', 'Modalidade', 'Taxa', 'Prazo (dias)', '']}
                            num={[3, 4]}
                            linhas={taxas.map((x) => [
                                x.canal === 'SITE' ? 'Site' : 'Máquinas',
                                x.bandeira,
                                MOD_NOME[x.modalidade] || x.modalidade,
                                `${numCampo(x.pct)}%`,
                                x.prazo_dias,
                                <button
                                    key="b"
                                    type="button"
                                    className={BTN_PEQ}
                                    onClick={() => setNova({ canal: x.canal, bandeira: x.bandeira, modalidade: x.modalidade, pct: numCampo(x.pct), prazo_dias: String(x.prazo_dias) })}
                                >
                                    Alterar
                                </button>,
                            ])}
                        />
                    ) : null}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                        <Campo rotulo="Canal">
                            <select className={CAMPO} value={nova.canal} onChange={(e) => setNova({ ...nova, canal: e.target.value })}>
                                <option value="MAQUINA">Máquinas</option>
                                <option value="SITE">Site</option>
                            </select>
                        </Campo>
                        <Campo rotulo="Bandeira">
                            <select className={CAMPO} value={nova.bandeira} onChange={(e) => setNova({ ...nova, bandeira: e.target.value })}>
                                {[...BANDEIRAS, 'Pix'].map((b) => (
                                    <option key={b}>{b}</option>
                                ))}
                            </select>
                        </Campo>
                        <Campo rotulo="Modalidade">
                            <select className={CAMPO} value={nova.modalidade} onChange={(e) => setNova({ ...nova, modalidade: e.target.value })}>
                                <option value="DEBITO">Débito</option>
                                <option value="CREDITO">Crédito à vista</option>
                                <option value="PARCELADO">Parcelado</option>
                                <option value="PIX">Pix</option>
                            </select>
                        </Campo>
                        <Campo rotulo="Taxa %">
                            <input className={CAMPO} inputMode="decimal" value={nova.pct} onChange={(e) => setNova({ ...nova, pct: e.target.value })} />
                        </Campo>
                        <Campo rotulo="Prazo (dias)">
                            <input className={CAMPO} inputMode="numeric" value={nova.prazo_dias} onChange={(e) => setNova({ ...nova, prazo_dias: e.target.value })} />
                        </Campo>
                        <div className="flex items-end">
                            <button
                                type="button"
                                className={BTN_PRI}
                                disabled={ocupado}
                                onClick={() => void post('taxa', { ...nova, pct: paraNumero(nova.pct), prazo_dias: Number(nova.prazo_dias) }, carregarTaxas)}
                            >
                                Gravar
                            </button>
                        </div>
                    </div>
                </>
            ) : null}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== receber título da OS (13/11/2026) ============================== */

/**
 * Título que veio da OS: o recebimento é lançado no financeiro da OS (os_principal.php), o mesmo da tela Financeiro da OS.
 * Lá ele vira baixa aqui: dinheiro no caixa de quem recebeu, Pix e cheque a confirmar, cartão a receber pelo NSU.
 */
function ReceberOS({ linha, hoje, onFechar, onFeito }: { linha: Linha; hoje: string; onFechar: () => void; onFeito: (m: string) => void }) {
    const [os, setOs] = useState<Detalhe['os']>(null);
    const [forma, setForma] = useState('PIX');
    const [valor, setValor] = useState(numCampo(Math.max(0, linha.valor - linha.recebido)));
    const [data, setData] = useState(hoje);
    const [nsu, setNsu] = useState('');
    const [bandeira, setBandeira] = useState('');
    const [maquina, setMaquina] = useState('424');
    const [parcelas, setParcelas] = useState('1');
    const [chq, setChq] = useState({ banco: '', numero: '', bom: '' });
    const [iss, setIss] = useState('');
    const [obs, setObs] = useState('');
    const [contaChave, setContaChave] = useState('ITAU');
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const prefeitura = linha.origem === 'PREFEITURA';
    const cartao = ehCartao(forma);

    useEffect(() => {
        void (async () => {
            try {
                const j = await api(URL_REC, 'titulo', undefined, `&id=${linha.id}`);
                setOs(j.dados.os);
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível abrir a OS.');
                if (m) setErro(m);
            }
        })();
    }, [linha.id]);

    const salvar = async () => {
        const v = paraNumero(valor) ?? 0;
        if (!os) return setErro('A OS ainda não carregou.');
        if (v <= 0) return setErro('Informe o valor recebido.');
        if (cartao && !nsu.replace(/\D/g, '')) return setErro('Informe o NSU do comprovante do cartão.');
        if (cartao && !bandeira) return setErro('Escolha a bandeira do cartão.');
        if (forma === 'CHEQUE' && (!chq.numero.trim() || !chq.bom)) return setErro('Cheque: informe o número e o bom para.');
        if (forma !== 'DINHEIRO' && !arquivo) return setErro('Anexe a foto ou o PDF do comprovante (só o dinheiro dispensa).');
        setOcupado(true);
        setErro(null);
        try {
            let finId = os.financeiro_id;
            if (!finId) {
                const p = await osPost('financeiro_criar_proposta', { os_id: os.id, valor_alvo: os.valor_total, tipo_proposta: 'MISTO' });
                finId = p?.dados?.id;
            }
            if (!finId) throw new Error('Não foi possível abrir o financeiro da OS.');
            const fd = new FormData();
            fd.append('financeiro_registrar_pagamento', '1');
            fd.append('financeiro_id', String(finId));
            fd.append('forma_pagamento', forma);
            fd.append('data_pagamento', data);
            fd.append('valor', String(v));
            fd.append('observacao', obs);
            if (linha.negociacao_de) fd.append('fin_titulo_id', String(linha.id)); // saldo negociado: a baixa cai nesta parcela
            if (forma === 'PIX' || forma === 'TRANSFERENCIA') fd.append('conta_chave', contaChave);
            if (cartao) {
                fd.append('nsu', nsu);
                fd.append('bandeira', bandeira);
                fd.append('maquina', maquina);
                fd.append('parcelas', forma === 'CARTAO_CREDITO' ? parcelas : '1');
            }
            if (forma === 'CHEQUE') {
                fd.append('cheque_banco', chq.banco);
                fd.append('cheque_numero', chq.numero);
                fd.append('cheque_bom_para', chq.bom);
            }
            if (prefeitura && (paraNumero(iss) ?? 0) > 0) fd.append('iss_retido', String(paraNumero(iss)));
            if (arquivo) fd.append('comprovante', arquivo, arquivo.name || 'comprovante.jpg');
            const r = await apiJson(OS_API, { method: 'POST', body: fd });
            onFeito(`${r?.msg || 'Recebimento lançado.'} Entrou na OS ${os.numero} e no contas a receber.`);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível receber.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };

    return (
        <Janela
            titulo={`Receber · ${linha.pessoa || linha.descricao}`}
            sub={os ? `OS ${os.numero} · total ${brl(os.valor_total)} · recebido ${brl(os.recebido)}${linha.negociacao_de && linha.parcela ? ` · parcela ${linha.parcela} de ${brl(linha.valor)}` : ''}` : 'Carregando a OS…'}
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={ocupado || !os} onClick={() => void salvar()}>
                        Receber {brl(paraNumero(valor) ?? 0)}
                    </button>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo rotulo="Forma">
                    <select className={CAMPO} value={forma} onChange={(e) => setForma(e.target.value)}>
                        {FORMAS_OS.map(([k, r]) => (
                            <option key={k} value={k}>
                                {r}
                            </option>
                        ))}
                    </select>
                </Campo>
                <Campo rotulo="Valor">
                    <input className={CAMPO} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                </Campo>
                <Campo rotulo="Data">
                    <input type="date" className={CAMPO} value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
                </Campo>
            </div>
            {cartao ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Campo rotulo="NSU / DOC *">
                        <input className={CAMPO} inputMode="numeric" value={nsu} onChange={(e) => setNsu(e.target.value)} placeholder="do comprovante" />
                    </Campo>
                    <Campo rotulo="Bandeira">
                        <select className={CAMPO} value={bandeira} onChange={(e) => setBandeira(e.target.value)}>
                            <option value="">Escolha</option>
                            {BANDEIRAS.map((b) => (
                                <option key={b}>{b}</option>
                            ))}
                        </select>
                    </Campo>
                    <Campo rotulo="Máquina">
                        <select className={CAMPO} value={maquina} onChange={(e) => setMaquina(e.target.value)}>
                            <option value="424">…424 · OS</option>
                            <option value="423">…423 · escritório</option>
                        </select>
                    </Campo>
                    {forma === 'CARTAO_CREDITO' ? (
                        <Campo rotulo="Parcelas">
                            <select className={CAMPO} value={parcelas} onChange={(e) => setParcelas(e.target.value)}>
                                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
                                    <option key={n} value={n}>
                                        {n === '1' ? 'À vista' : `${n}x`}
                                    </option>
                                ))}
                            </select>
                        </Campo>
                    ) : null}
                </div>
            ) : null}
            {forma === 'PIX' || forma === 'TRANSFERENCIA' ? (
                <Campo rotulo={forma === 'PIX' ? 'Pix recebido por' : 'Banco da transferência'}>
                    <select className={CAMPO} value={contaChave} onChange={(e) => setContaChave(e.target.value)}>
                        {forma === 'PIX' ? (
                            <>
                                <option value="ITAU">Pix CNPJ · Itaú</option>
                                <option value="SICREDI">Link de pagamento · Sicredi</option>
                            </>
                        ) : (
                            <>
                                <option value="ITAU">Itaú</option>
                                <option value="SICREDI">Sicredi</option>
                                <option value="BB">Banco do Brasil</option>
                            </>
                        )}
                    </select>
                </Campo>
            ) : null}
            {forma === 'CHEQUE' ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Campo rotulo="Número *">
                        <input className={CAMPO} value={chq.numero} onChange={(e) => setChq({ ...chq, numero: e.target.value })} />
                    </Campo>
                    <Campo rotulo="Bom para *">
                        <input type="date" className={CAMPO} value={chq.bom} onChange={(e) => setChq({ ...chq, bom: e.target.value })} />
                    </Campo>
                    <Campo rotulo="Banco do cheque">
                        <input className={CAMPO} value={chq.banco} onChange={(e) => setChq({ ...chq, banco: e.target.value })} />
                    </Campo>
                </div>
            ) : null}
            {prefeitura ? (
                <Campo rotulo="ISS retido pela Prefeitura">
                    <input className={CAMPO} inputMode="decimal" value={iss} onChange={(e) => setIss(e.target.value)} placeholder="0,00" />
                </Campo>
            ) : null}
            <div className={NOTA}>
                {forma === 'DINHEIRO'
                    ? 'Dinheiro entra no seu caixa aberto. Sem caixa aberto, fica no Caixa Atendimento Funerário, para ser entregue ao caixa aberto.'
                    : cartao
                      ? 'Vira cartão a receber da Cielo, conferido pelo NSU.'
                      : 'Fica "a confirmar no banco" até aparecer no extrato.'}
                {prefeitura ? ' Lance o valor cheio da NF; o ISS retido fica registrado e o banco recebe o valor sem ele.' : ''}
            </div>
            <Campo rotulo="Observação">
                <input className={CAMPO} value={obs} onChange={(e) => setObs(e.target.value)} />
            </Campo>
            {forma !== 'DINHEIRO' ? (
                <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-dashed px-3 text-[14px] font-bold ${arquivo ? 'border-[#7BA11A]' : 'border-[#C9D1DE] dark:border-white/25'}`}>
                    <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                    <IconPaperclip size={18} />
                    {arquivo ? <span className="truncate">{arquivo.name}</span> : 'Foto ou PDF do comprovante (obrigatório)'}
                </label>
            ) : null}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/* ============================== parte 2 (13/11/2026): Prefeitura por NF, ISS, atrasos ============================== */

/** Mesmo dia, n meses depois (dia 31 vira o último dia do mês, quando o mês é menor). */
function mesMaisDia(iso: string, n: number): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    const [y, m, d] = iso.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    const ny = Math.floor(t / 12);
    const nm = (t % 12) + 1;
    const ultimo = new Date(ny, nm, 0).getDate();
    return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

type GrupoNf = {
    chave: string;
    convenio: string;
    nome: string;
    competencia: string;
    situacao: 'APURACAO' | 'EMITIR';
    fecha_em: string;
    vencimento: string;
    retem: boolean | null;
    conta: string | null;
    aliquota: number | null;
    total: number;
    oss: { titulo_id: number; os: string | null; descricao: string; data: string; valor: number }[];
};

/** Quadro "Prefeitura · a faturar": OS da Prefeitura ainda sem NF, por convênio e mês. */
function PainelPrefeitura({ versao, onEmitir }: { versao: number; onEmitir: (g: GrupoNf) => void }) {
    const [grupos, setGrupos] = useState<GrupoNf[] | null>(null);
    const [aberto, setAberto] = useState(true);
    useEffect(() => {
        void (async () => {
            try {
                const j = await api(URL_ACOES, 'nf_meses');
                setGrupos(j.dados.grupos);
            } catch {
                setGrupos([]);
            }
        })();
    }, [versao]);
    if (!grupos || !grupos.length) return null;
    const emitir = grupos.filter((g) => g.situacao === 'EMITIR').length;
    return (
        <div className={`${CARTAO} overflow-hidden`}>
            <button type="button" className="flex min-h-12 w-full items-center gap-2 px-4 py-2.5 text-left" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
                <IconFileInvoice size={20} />
                <b className="text-[15px]">Prefeitura · a faturar</b>
                <span className={SUB}>
                    {grupos.length} mês(es){emitir ? ` · ${emitir} para emitir NF` : ''}
                </span>
                <IconChevronDown size={18} className={`ml-auto transition ${aberto ? 'rotate-180' : ''}`} />
            </button>
            {aberto
                ? grupos.map((g) => (
                      <div key={g.chave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-[#EEF2F7] px-4 py-3 dark:border-white/[0.06] lg:grid-cols-[minmax(0,1.6fr)_130px_170px_auto]">
                          <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-extrabold">
                                  <span className="break-words">{g.nome}</span>
                                  <span className={`${SELO} ${S_AB}`}>{mesBR(g.competencia)}</span>
                              </div>
                              <div className={SUB}>
                                  {g.oss.length} OS · {g.retem === null ? 'retenção do ISS ainda não configurada' : g.retem ? 'retém o ISS na fonte' : 'não retém o ISS'}
                                  {g.situacao === 'EMITIR' ? ` · pagamento previsto até ${dataBR(g.vencimento)}` : ''}
                              </div>
                          </div>
                          <div className="text-right text-[15px] font-extrabold tabular-nums lg:order-none">{brl(g.total)}</div>
                          <div className="hidden lg:block">
                              <span className={`${SELO} ${g.situacao === 'EMITIR' ? S_AVISO : S_MUDO}`}>{g.situacao === 'EMITIR' ? 'Emitir NF' : `Em apuração · fecha em ${diaMes(g.fecha_em)}`}</span>
                          </div>
                          <div className="col-span-2 flex justify-end lg:col-span-1">
                              {g.situacao === 'EMITIR' ? (
                                  <button type="button" className={BTN_PEQ_PRI} onClick={() => onEmitir(g)}>
                                      Emitir NF
                                  </button>
                              ) : (
                                  <span className={`${SELO} ${S_MUDO} lg:hidden`}>Em apuração · fecha em {diaMes(g.fecha_em)}</span>
                              )}
                          </div>
                      </div>
                  ))
                : null}
        </div>
    );
}

/** Emitir NF de um mês de um convênio: as OS do mês, em qual nota cada uma entra (uma por empenho), número e empenho de cada nota. */
function EmitirNf({ grupo, hoje, onFechar, onFeito }: { grupo: GrupoNf; hoje: string; onFechar: () => void; onFeito: (m: string) => void }) {
    const [aliq, setAliq] = useState(grupo.aliquota !== null ? numCampo(grupo.aliquota) : '');
    const [emissao, setEmissao] = useState(hoje);
    const [retem, setRetem] = useState(grupo.retem ?? false);
    const [qtd, setQtd] = useState(1);
    const [notaDe, setNotaDe] = useState<Record<number, number>>({});
    const [num, setNum] = useState<string[]>(['']);
    const [emp, setEmp] = useState<string[]>(['']);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const a = paraNumero(aliq) ?? 0;
    const notas = Array.from({ length: qtd }, (_, i) => {
        const oss = grupo.oss.filter((o) => (notaDe[o.titulo_id] ?? 0) === i);
        const valor = Math.round(oss.reduce((s, o) => s + o.valor, 0) * 100) / 100;
        const iss = Math.round(valor * a) / 100;
        return { i, oss, valor, iss, liquido: retem ? valor - iss : valor };
    });
    const mudarQtd = (n: number) => {
        setQtd(n);
        setNum((x) => Array.from({ length: n }, (_, i) => x[i] ?? ''));
        setEmp((x) => Array.from({ length: n }, (_, i) => x[i] ?? ''));
        setNotaDe((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v < n ? v : 0])));
    };
    const salvar = async () => {
        if (!a) return setErro('Informe a alíquota do ISS do mês.');
        const usadas = notas.filter((n) => n.oss.length);
        if (usadas.some((n) => !num[n.i].trim() || !emp[n.i].trim())) return setErro('Informe o número e o empenho de cada nota.');
        setOcupado(true);
        setErro(null);
        try {
            const j = await api(URL_ACOES, 'nf_emitir', {
                convenio: grupo.convenio,
                competencia: grupo.competencia,
                emissao,
                aliquota: a,
                retem,
                notas: usadas.map((n) => ({ numero: num[n.i].trim(), empenho: emp[n.i].trim(), titulo_ids: n.oss.map((o) => o.titulo_id) })),
            });
            onFeito(j.msg);
        } catch (e: any) {
            const m = mensagemErro(e, 'Não foi possível registrar as notas.');
            if (m) setErro(m);
        } finally {
            setOcupado(false);
        }
    };
    const usadas = notas.filter((n) => n.oss.length);
    return (
        <Janela
            titulo={`Emitir NF · ${grupo.nome}`}
            sub={`Atendimentos de ${mesBR(grupo.competencia)} · ${grupo.oss.length} OS · ${brl(grupo.total)}`}
            largura="max-w-3xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={ocupado} onClick={() => void salvar()}>
                        Registrar {usadas.length} NF
                    </button>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo rotulo="Alíquota do ISS do mês (%)">
                    <input className={CAMPO} inputMode="decimal" value={aliq} onChange={(e) => setAliq(e.target.value)} placeholder="ex.: 4,50" />
                </Campo>
                <Campo rotulo="Emitida em">
                    <input type="date" className={CAMPO} value={emissao} max={hoje} onChange={(e) => setEmissao(e.target.value)} />
                </Campo>
                <Campo rotulo="Quantas notas (uma por empenho)">
                    <select className={CAMPO} value={qtd} onChange={(e) => mudarQtd(Number(e.target.value))}>
                        {Array.from({ length: Math.min(10, grupo.oss.length) }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </Campo>
            </div>
            <Liga on={retem} onClick={() => setRetem(!retem)} rotulo="O convênio retém o ISS na fonte (o depósito vem sem ele)" />
            <div className={SUB}>A alíquota efetiva do Simples vale para todas as notas do mês e fica guardada em ISS das prefeituras (menu Gestão).</div>
            {qtd > 1 ? (
                <div className="flex flex-col gap-1.5">
                    <div className={ROTULO}>Em qual nota cada OS entra</div>
                    <div className={`${CARTAO} overflow-hidden`}>
                        {grupo.oss.map((o) => (
                            <div key={o.titulo_id} className="flex items-center gap-3 border-t border-[#EEF2F7] px-3 py-2 first:border-t-0 dark:border-white/[0.06]">
                                <span className="min-w-0 flex-1 break-words text-[14px]">
                                    {o.descricao} · {dataBR(o.data)}
                                </span>
                                <b className="tabular-nums">{brl(o.valor)}</b>
                                <select className={`${SELECAO} w-28`} value={notaDe[o.titulo_id] ?? 0} onChange={(e) => setNotaDe({ ...notaDe, [o.titulo_id]: Number(e.target.value) })}>
                                    {Array.from({ length: qtd }, (_, i) => (
                                        <option key={i} value={i}>
                                            NF {i + 1}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
            {notas.map((n) => (
                <div key={n.i} className={`${CARTAO} flex flex-col gap-3 p-3 ${n.oss.length ? '' : 'opacity-60'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                        <b>NF {n.i + 1}</b>
                        <span className={SUB}>{n.oss.length} OS</span>
                        <span className="ml-auto text-right text-[14px] tabular-nums">
                            {brl(n.valor)} · ISS {brl(n.iss)}
                            {retem ? ' retido' : ' no DAS'} · <b>depósito {brl(n.liquido)}</b>
                        </span>
                    </div>
                    {qtd === 1 ? <div className={SUB}>{n.oss.map((o) => o.os || o.descricao).join(' · ')}</div> : null}
                    <div className="grid grid-cols-2 gap-3">
                        <Campo rotulo="Número da NF">
                            <input className={CAMPO} value={num[n.i] ?? ''} onChange={(e) => setNum(num.map((x, i) => (i === n.i ? e.target.value : x)))} />
                        </Campo>
                        <Campo rotulo="Empenho">
                            <input className={CAMPO} value={emp[n.i] ?? ''} onChange={(e) => setEmp(emp.map((x, i) => (i === n.i ? e.target.value : x)))} />
                        </Campo>
                    </div>
                </div>
            ))}
            <div className={NOTA}>
                <span>
                    Cada NF vira um título a receber de {grupo.nome}, com vencimento em {dataBR(grupo.vencimento)}, e as OS saem do quadro &quot;a faturar&quot;. Na baixa, o ISS retido já vem preenchido e o título
                    é quitado pelo valor cheio da NF.
                </span>
            </div>
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

/** ISS das prefeituras (Gestão): alíquota efetiva do Simples por mês e, por convênio, se retém o ISS e a conta onde o dinheiro cai. */
function IssPrefeituras({ onFechar, onFeito }: { onFechar: () => void; onFeito: (m: string) => void }) {
    const [d, setD] = useState<{ convenios: { convenio: string; nome: string; retem_iss: boolean; conta_id: number | null }[]; aliquotas: { competencia: string; aliquota: number | null }[]; contas: { id: number; nome: string }[] } | null>(null);
    const [aliq, setAliq] = useState<Record<string, string>>({});
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    useEffect(() => {
        void (async () => {
            try {
                const j = await api(URL_ACOES, 'iss_config');
                setD(j.dados);
                setAliq(Object.fromEntries((j.dados.aliquotas as { competencia: string; aliquota: number | null }[]).map((a) => [a.competencia, a.aliquota !== null ? numCampo(a.aliquota) : ''])));
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível carregar.');
                if (m) setErro(m);
            }
        })();
    }, []);
    const salvar = async () => {
        if (!d) return;
        setOcupado(true);
        setErro(null);
        try {
            const j = await api(URL_ACOES, 'iss_config', {
                aliquotas: Object.entries(aliq)
                    .filter(([, v]) => v.trim())
                    .map(([competencia, v]) => ({ competencia, aliquota: paraNumero(v) })),
                convenios: d.convenios,
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
            titulo="ISS das prefeituras"
            sub="Usado na emissão das NF dos convênios públicos."
            largura="max-w-3xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={ocupado || !d} onClick={() => void salvar()}>
                        Gravar
                    </button>
                </>
            }
        >
            {!d && !erro ? <div className="py-6 text-center text-[#5B6478]">Carregando…</div> : null}
            {d ? (
                <>
                    <div className={ROTULO}>Convênios</div>
                    {d.convenios.length ? (
                        d.convenios.map((c, i) => (
                            <div key={c.convenio} className={`${CARTAO} grid grid-cols-1 items-center gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto_220px]`}>
                                <b className="break-words">{c.nome}</b>
                                <Liga on={c.retem_iss} onClick={() => setD({ ...d, convenios: d.convenios.map((x, j) => (j === i ? { ...x, retem_iss: !x.retem_iss } : x)) })} rotulo="Retém o ISS" />
                                <select
                                    className={SELECAO}
                                    value={c.conta_id ?? ''}
                                    aria-label="Conta onde o pagamento cai"
                                    onChange={(e) => setD({ ...d, convenios: d.convenios.map((x, j) => (j === i ? { ...x, conta_id: e.target.value ? Number(e.target.value) : null } : x)) })}
                                >
                                    <option value="">Conta onde cai…</option>
                                    {d.contas.map((ct) => (
                                        <option key={ct.id} value={ct.id}>
                                            {ct.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))
                    ) : (
                        <div className={SUB}>Nenhuma OS de Prefeitura ainda.</div>
                    )}
                    <div className={ROTULO}>Alíquota efetiva do Simples por mês (%)</div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {d.aliquotas.map((a) => (
                            <Campo key={a.competencia} rotulo={mesBR(a.competencia)}>
                                <input className={CAMPO} inputMode="decimal" value={aliq[a.competencia] ?? ''} placeholder="—" onChange={(e) => setAliq({ ...aliq, [a.competencia]: e.target.value })} />
                            </Campo>
                        ))}
                    </div>
                    <div className={SUB}>A alíquota do mês vale para todas as NF daquele mês. Quem retém o ISS deposita sem ele, e o ISS retido entra no relatório do contador (etapa 4).</div>
                </>
            ) : null}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}

type LinhaAtraso = { id: number; cliente: string; origem: string; descricao: string; parcela: string | null; vencimento: string; dias: number; saldo: number };
const FAIXAS_ATRASO: [string, number, number][] = [
    ['1 a 30 dias', 1, 30],
    ['31 a 60 dias', 31, 60],
    ['61 a 90 dias', 61, 90],
    ['Mais de 90 dias', 91, 100000],
];

/** Atrasos por faixa (Gestão): títulos vencidos em aberto de OS e avulsos, por cliente. */
function Atrasos({ onFechar, onAbrir }: { onFechar: () => void; onAbrir: (id: number) => void }) {
    const [linhas, setLinhas] = useState<LinhaAtraso[] | null>(null);
    const [hojeA, setHojeA] = useState(hojeISO());
    const [fx, setFx] = useState(0);
    const [erro, setErro] = useState<string | null>(null);
    useEffect(() => {
        void (async () => {
            try {
                const j = await api(URL_ACOES, 'atrasos');
                setLinhas(j.dados.linhas);
                setHojeA(j.dados.hoje);
            } catch (e: any) {
                const m = mensagemErro(e, 'Não foi possível carregar.');
                if (m) setErro(m);
            }
        })();
    }, []);
    const naFaixa = (f: [string, number, number]) => (linhas ?? []).filter((l) => l.dias >= f[1] && l.dias <= f[2]);
    const totais = FAIXAS_ATRASO.map((f) => naFaixa(f).reduce((s, l) => s + l.saldo, 0));
    const maior = Math.max(1, ...totais);
    const clientes = useMemo(() => {
        const g = new Map<string, { cliente: string; origem: string; n: number; saldo: number; dias: number; id: number }>();
        naFaixa(FAIXAS_ATRASO[fx]).forEach((l) => {
            const k = `${l.cliente}|${l.origem}`;
            const x = g.get(k) || { cliente: l.cliente, origem: l.origem, n: 0, saldo: 0, dias: 0, id: l.id };
            x.n++;
            x.saldo += l.saldo;
            if (l.dias > x.dias) {
                x.dias = l.dias;
                x.id = l.id;
            }
            g.set(k, x);
        });
        return Array.from(g.values()).sort((a, b) => b.saldo - a.saldo);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linhas, fx]);
    const exportar = () => {
        const cel = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
        const faixaDe = (d: number) => FAIXAS_ATRASO.find((f) => d >= f[1] && d <= f[2])?.[0] || '';
        const csv = [['Cliente', 'Origem', 'Descrição', 'Parcela', 'Vencimento', 'Dias de atraso', 'Faixa', 'Saldo'].map(cel).join(';')]
            .concat(
                (linhas ?? []).map((l) =>
                    [l.cliente, ORIGEM_NOME[l.origem] || l.origem, l.descricao, l.parcela || '', dataBR(l.vencimento), l.dias, faixaDe(l.dias), l.saldo.toFixed(2).replace('.', ',')].map(cel).join(';'),
                ),
            )
            .join('\r\n');
        const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `atrasos-${hojeA}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return (
        <Janela
            titulo="Atrasos por faixa"
            sub={`Títulos vencidos e em aberto em ${dataBR(hojeA)} · OS, avulsos e mensalidades (Prefeitura e cartão têm prazo próprio)`}
            largura="max-w-4xl"
            onFechar={onFechar}
            rodape={
                <>
                    <button type="button" className={BTN_SEC} onClick={onFechar}>
                        Voltar
                    </button>
                    <button type="button" className={BTN_PRI} disabled={!linhas?.length} onClick={exportar}>
                        <IconDownload size={18} /> Exportar
                    </button>
                </>
            }
        >
            {!linhas && !erro ? <div className="py-6 text-center text-[#5B6478]">Carregando…</div> : null}
            {linhas ? (
                <>
                    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                        {FAIXAS_ATRASO.map((f, i) => {
                            const on = fx === i;
                            return (
                                <button
                                    key={f[0]}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => setFx(i)}
                                    className={`flex min-h-[86px] flex-col gap-1 rounded-2xl border px-3 py-2.5 text-left ${on ? 'border-[#313C55] bg-[#E9EFF6] dark:border-[#3D6A99] dark:bg-[#3D6A99]/20' : 'border-[#E3E8F0] bg-white dark:border-white/[0.12] dark:bg-[#232B3F]'}`}
                                >
                                    <span className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[#5B6478] dark:text-[#AEB9CF]">{f[0]}</span>
                                    <span className="text-[18px] font-extrabold tabular-nums">{brl(totais[i])}</span>
                                    <span className={SUB}>{naFaixa(f).length} título(s)</span>
                                    <span className="h-1.5 overflow-hidden rounded-full bg-[#EEF2F7] dark:bg-white/[0.08]">
                                        <span className="block h-full rounded-full bg-[#B42318] dark:bg-[#FF9C92]" style={{ width: `${Math.round((totais[i] / maior) * 100)}%` }} />
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className={ROTULO}>Clientes com atraso de {FAIXAS_ATRASO[fx][0]} · maiores valores primeiro</div>
                    {clientes.length ? (
                        <Tabela
                            cab={['Cliente', 'Origem', 'Títulos', 'Maior atraso', 'Em aberto']}
                            num={[2, 3, 4]}
                            linhas={clientes.map((c) => [
                                <button key="c" type="button" className="text-left font-extrabold hover:underline" onClick={() => onAbrir(c.id)}>
                                    {c.cliente}
                                </button>,
                                ORIGEM_NOME[c.origem] || c.origem,
                                String(c.n),
                                `${c.dias} dias`,
                                <b key="v">{brl(c.saldo)}</b>,
                            ])}
                        />
                    ) : (
                        <div className={SUB}>Nenhum título nesta faixa.</div>
                    )}
                </>
            ) : null}
            {erro ? <div className={ERRO}>{erro}</div> : null}
        </Janela>
    );
}
